/**
 * CapabilityClient — pipeline-based client for invoking capabilities.
 *
 * Composes a middleware pipeline:
 *   enrichContext → resolve → [user middleware] → transport(NATS)
 *
 * Resolution, discovery, bootstrap, caching, and invalidation are all internal
 * (absorbed from the former registry-client package).
 * Transport uses a NATS connection pool for multi-sandbox support.
 *
 * @see Docs/registry/15_Federated_Resolution_And_Multi_NATS_Implementation_Plan.md §5
 */

import { randomUUID } from "node:crypto";
import { connect, type NatsConnection } from "nats";
import type { RegistryRequest, RegistryResponse } from "@more0ai/common/wire";
import {
  type Middleware,
  type InvocationEnvelope,
  type InvocationResult,
  type InvocationContext,
  buildPipeline,
  composeAbort,
  toErrorResult,
} from "@more0ai/common";

import { ResolutionClient } from "./resolution/client.js";
import { ResolutionCache } from "./resolution/cache.js";
import { DiscoveryClient } from "./discovery/client.js";
import { InvalidationSubscriber } from "./invalidation/subscriber.js";
import { createResolveMiddleware } from "./middleware/resolve.js";
import { createEnrichContextMiddleware } from "./middleware/enrich-context.js";
import { createNatsTransportCore } from "./transport/nats-transport.js";
import { NatsConnectionPool } from "./transport/connection-pool.js";
import type { CapabilityClientConfig } from "./config.js";
import type { DiscoverInput, RegistryChangedEvent, ResolveOutput, VersionStatus } from "./types/registry.js";
import { resolveLogger, type Logger, type LoggerFactory } from "./types/logger.js";

const SERVICE_NAME = "capabilities-client";

function parseJson<T>(data: Uint8Array, fallbackError: string): T {
  try {
    const raw = new TextDecoder().decode(data);
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(`${SERVICE_NAME}:parseJson - ${fallbackError}: ${(err as Error).message}`);
  }
}

export interface CapabilityClientOptions {
  config: CapabilityClientConfig;
  /** Pre-created NATS connection (optional; will create one if not provided) */
  natsConnection?: NatsConnection;
  /** Logger factory (Logger or { get(name): Logger }) */
  loggerFactory?: LoggerFactory;
}

export class CapabilityClient {
  private config: CapabilityClientConfig;
  private log: Logger;

  // Connections
  private natsConnection?: NatsConnection;
  private ownNatsConnection = false;
  private connectionPool?: NatsConnectionPool;

  // Internal sub-clients (absorbed from registry-client)
  private resolutionCache?: ResolutionCache;
  private resolutionClient?: ResolutionClient;
  private discoveryClient?: DiscoveryClient;
  private invalidationSubscriber?: InvalidationSubscriber;
  /** Capability refs seeded from bootstrap (for health reporting). */
  private bootstrappedCapabilities: string[] = [];

  // Pipeline (built on initialize)
  private pipeline?: (env: InvocationEnvelope, signal: AbortSignal) => Promise<InvocationResult<unknown>>;

  // Additional middleware provided by the consumer
  private extraMiddleware: Middleware[] = [];

  // State
  private initialized = false;

  constructor(options: CapabilityClientOptions) {
    this.config = options.config;
    this.log = resolveLogger(options.loggerFactory, SERVICE_NAME);

    if (options.natsConnection) {
      this.natsConnection = options.natsConnection;
      this.ownNatsConnection = false;
    }
  }

  /**
   * Add custom middleware to the pipeline (must be called before initialize).
   */
  use(mw: Middleware): this {
    if (this.initialized) {
      throw new Error(`${SERVICE_NAME}:use - Cannot add middleware after initialization`);
    }
    this.extraMiddleware.push(mw);
    return this;
  }

  /**
   * Initialize: connect NATS, fetch bootstrap, create connection pool,
   * create sub-clients, build pipeline.
   *
   * Bootstrap is loaded exclusively via the NATS subject system.registry.bootstrap.
   * There is no file-based or inline bootstrap loading.
   *
   * The connection pool manages the default NATS connection plus any remote
   * sandbox connections that are created lazily during invocation.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.log.info?.({}, `${SERVICE_NAME}:initialize - Starting`);

    const defaultNatsUrl = this.config.natsUrl ?? "nats://127.0.0.1:4222";

    // 1. Connect to default NATS (for registry/bootstrap)
    if (!this.natsConnection) {
      this.natsConnection = await connect({
        servers: defaultNatsUrl,
        name: this.config.natsName ?? "capabilities-client",
      });
      this.ownNatsConnection = true;
    }

    // 2. Create resolution cache and seed with bootstrap from system.registry.bootstrap.
    //    Bootstrap entries are stored in the cache with no TTL (permanent until explicit invalidation).
    this.resolutionCache = new ResolutionCache(
      {
        defaultTtlMs: (this.config.resolutionCacheTtlSeconds ?? 300) * 1000,
        negativeTtlMs: (this.config.negativeCacheTtlSeconds ?? 30) * 1000,
        staleWhileRevalidate: this.config.staleWhileRevalidate ?? true,
        staleWindowMs: (this.config.staleWindowSeconds ?? 60) * 1000,
      },
      this.log
    );
    await this.fetchRemoteBootstrap(defaultNatsUrl);

    // 3. Create connection pool (default connection + auth provider for remote sandboxes)
    this.connectionPool = new NatsConnectionPool({
      defaultConnection: this.natsConnection,
      defaultUrl: defaultNatsUrl,
      config: {
        maxConnections: this.config.maxNatsConnections,
        idleTimeoutMs: this.config.idleConnectionTimeoutMs,
        authProvider: this.config.natsAuthProvider,
        accessToken: this.config.accessToken,
        tokenProvider: this.config.tokenProvider,
      },
      loggerFactory: this.log,
    });

    // 4. Create remote call function for registry (registry subject from resolution cache).
    const remoteCall = this.createRemoteCall();

    // 5. Create resolution client (uses pre-seeded cache).
    this.resolutionClient = new ResolutionClient({
      deps: {
        remoteCall,
        cache: this.resolutionCache,
        fallbackMappings: this.config.fallbackMappings,
        defaultNatsUrl,
      },
      config: this.config,
      loggerFactory: this.log,
    });

    // 6. Create discovery client
    this.discoveryClient = new DiscoveryClient({
      deps: { remoteCall },
      config: this.config,
      loggerFactory: this.log,
    });

    // 7. Setup invalidation subscriber
    this.invalidationSubscriber = new InvalidationSubscriber({
      config: { subjectPrefix: this.config.changeEventPattern?.replace(".>", "") ?? "registry.changed" },
      loggerFactory: this.log,
    });
    this.invalidationSubscriber.addHandler((event: RegistryChangedEvent) => {
      if (event.app && event.capability) {
        this.resolutionClient?.invalidateCapability(event.app, event.capability);
      }
      this.discoveryClient?.invalidateAll();
    });
    await this.invalidationSubscriber.start(this.natsConnection);

    // 8. Build the pipeline (transport uses connection pool)
    this.pipeline = this.buildClientPipeline();
    this.initialized = true;
    this.log.info?.({}, `${SERVICE_NAME}:initialize - Ready`);
  }

  // ── Invocation API (pipeline-based) ──────────────────────────────

  /**
   * Invoke a capability.
   *
   * @param capRef - Capability reference string (e.g. "my.app/my.capability" or "cap.name")
   * @param params - { method: string, params: Record<string, unknown> }
   * @param ctx    - InvocationContext (tenantId, env, etc.)
   */
  async invoke<T = unknown>(
    capRef: string,
    params: {
      method: string;
      params: Record<string, unknown>;
    },
    ctx?: Partial<InvocationContext> & { version?: string; timeoutMs?: number },
  ): Promise<InvocationResult<T>> {
    this.ensureInitialized();
    const clock = { now: () => Date.now() };
    const startedAt = clock.now();
    const envelope: InvocationEnvelope = {
      capability: capRef,
      version: ctx?.version,
      method: params.method,
      params: params.params,
      ctx: {
        ...ctx,
        tenantId: ctx?.tenantId || this.config.defaultTenantId || "default",
        requestId: ctx?.requestId || randomUUID(),
        timeoutMs: ctx?.timeoutMs ?? this.config.defaultTimeoutMs,
      } as InvocationContext,
    };
    const abort = composeAbort({ ctx: envelope.ctx });
    try {
      return await this.pipeline!(envelope, abort.signal) as InvocationResult<T>;
    } catch (err) {
      return toErrorResult({ err, startedAt, clock }) as InvocationResult<T>;
    }
  }

  /**
   * Invoke a capability by direct subject + natsUrl.
   * Bypasses resolution (subject and natsUrl are already known).
   *
   * @param params - natsUrl, subject, capability, method, payload, ctx, timeoutMs
   */
  async invokeSubject<T = unknown>(params: {
    natsUrl: string;
    subject: string;
    capability: string;
    method: string;
    payload: unknown;
    /** Resolved version (for logging/debugging); defaults to "0.0.0" if omitted */
    version?: string;
    ctx?: Partial<InvocationContext>;
    timeoutMs?: number;
  }): Promise<InvocationResult<T>> {
    this.ensureInitialized();
    const clock = { now: () => Date.now() };
    const startedAt = clock.now();
    const envelope: InvocationEnvelope = {
      capability: params.capability,
      method: params.method,
      params: params.payload,
      resolved: { natsUrl: params.natsUrl, subject: params.subject, version: params.version ?? "0.0.0" },
      ctx: {
        ...params.ctx,
        tenantId: params.ctx?.tenantId || this.config.defaultTenantId || "default",
        requestId: params.ctx?.requestId || randomUUID(),
        timeoutMs: params.timeoutMs ?? this.config.defaultTimeoutMs,
      } as InvocationContext,
    };
    const abort = composeAbort({ ctx: envelope.ctx });
    try {
      return await this.pipeline!(envelope, abort.signal) as InvocationResult<T>;
    } catch (err) {
      return toErrorResult({ err, startedAt, clock }) as InvocationResult<T>;
    }
  }

  // ── Resolution & Discovery API (direct access) ──────────────────

  async resolve(cap: string, ver?: string) {
    this.ensureInitialized();
    return this.resolutionClient!.resolve({ cap, ver });
  }

  async discover(params: DiscoverInput) {
    this.ensureInitialized();
    return this.discoveryClient!.discover(params);
  }

  async describe(cap: string) {
    this.ensureInitialized();
    return this.discoveryClient!.describe({ cap });
  }

  // ── Cache & Health ───────────────────────────────────────────────

  clearCaches(): void {
    this.resolutionClient?.clearCache();
    this.discoveryClient?.clearCache();
  }

  async health() {
    return {
      initialized: this.initialized,
      cacheStats: {
        resolutionCacheSize: this.resolutionClient?.cacheSize ?? 0,
        discoveryCacheSize: this.discoveryClient?.cacheSize ?? 0,
      },
      connectionPool: this.connectionPool?.getStats(),
      bootstrappedCapabilities: this.bootstrappedCapabilities,
    };
  }

  async close(): Promise<void> {
    this.log.info?.({}, `${SERVICE_NAME}:close - Closing`);
    if (this.invalidationSubscriber) await this.invalidationSubscriber.stop();
    // Close all pooled connections (non-default connections)
    if (this.connectionPool) await this.connectionPool.closeAll();
    // Close default NATS connection if we own it
    if (this.ownNatsConnection && this.natsConnection) await this.natsConnection.close();
    this.initialized = false;
  }

  // ── Private ──────────────────────────────────────────────────────

  /**
   * Fetch bootstrap from system.registry.bootstrap and seed resolution cache with no TTL.
   *
   * @param defaultNatsUrl - The default NATS server URL (for system capabilities)
   * @throws if the NATS request fails (client cannot initialize without bootstrap)
   */
  private async fetchRemoteBootstrap(defaultNatsUrl: string): Promise<void> {
    const bootstrapSubject = this.config.bootstrapSubject ?? "system.registry.bootstrap";
    this.log.info?.({}, `${SERVICE_NAME}:fetchRemoteBootstrap - Requesting ${bootstrapSubject}`);

    const response = await this.natsConnection!.request(
      bootstrapSubject,
      new TextEncoder().encode("{}"),
      { timeout: this.config.requestTimeoutMs ?? 10_000 },
    );
    const data = parseJson<{ capabilities?: unknown }>(response.data, "Invalid bootstrap response (not JSON)");

    const capabilities = data?.capabilities;
    if (!capabilities || typeof capabilities !== "object") {
      throw new Error(`${SERVICE_NAME}:fetchRemoteBootstrap - Invalid bootstrap response: no capabilities`);
    }

    const defaultNats = defaultNatsUrl;
    let count = 0;
    this.bootstrappedCapabilities = [];
    for (const [capRef, capData] of Object.entries(capabilities)) {
      const cap = capData as Record<string, unknown>;
      // Bootstrap response is resolve-shaped (ResolveOutput): require canonicalIdentity, subject
      if (!cap || typeof cap.canonicalIdentity !== "string" || typeof cap.subject !== "string") continue;
      const methods = cap.methods as Array<{ name: string; description?: string; modes?: string[]; tags?: string[] }> | undefined;
      const methodList = Array.isArray(methods)
        ? methods.map((m) => ({ name: m.name, description: m.description, modes: m.modes ?? ["sync"], tags: m.tags ?? [] }))
        : [];
      const status = (cap.status as string) ?? "active";
      const value: ResolveOutput = {
        canonicalIdentity: cap.canonicalIdentity as string,
        natsUrl: (cap.natsUrl as string) ?? defaultNats,
        subject: cap.subject as string,
        major: (cap.major as number) ?? 1,
        resolvedVersion: (cap.resolvedVersion as string) ?? "1.0.0",
        status: status as VersionStatus,
        ttlSeconds: (cap.ttlSeconds as number) ?? 0,
        etag: (cap.etag as string) ?? "bootstrap",
        methods: methodList,
      };
      this.resolutionCache!.set({
        cap: capRef,
        value,
        ttlMs: Number.POSITIVE_INFINITY,
      });
      this.bootstrappedCapabilities.push(capRef);
      count++;
    }

    if (count === 0) {
      throw new Error(`${SERVICE_NAME}:fetchRemoteBootstrap - Bootstrap response contained no valid capabilities`);
    }

    this.log.info?.({ count }, `${SERVICE_NAME}:fetchRemoteBootstrap - Cached ${count} bootstrap capabilities (no TTL)`);
  }

  /**
   * Resolve the NATS subject for system.registry from resolution cache.
   */
  private getRegistrySubject(): string {
    const registryCap = this.config.registryCap ?? "system.registry";
    const cached = this.resolutionCache?.get({ cap: registryCap });
    if (cached?.found && cached.value?.subject) {
      return cached.value.subject;
    }
    throw new Error(`${SERVICE_NAME}:getRegistrySubject - "${registryCap}" not found in resolution cache`);
  }

  private createRemoteCall() {
    return async (method: string, params: Record<string, unknown>) => {
      const subject = this.getRegistrySubject();
      const req: RegistryRequest = {
        id: randomUUID(),
        type: "invoke",
        cap: this.config.registryCap ?? "system.registry",
        method,
        params,
        ctx: this.config.invocationContext,
      };
      const response = await this.natsConnection!.request(
        subject,
        new TextEncoder().encode(JSON.stringify(req)),
        { timeout: this.config.requestTimeoutMs ?? 30_000 },
      );
      const resp = parseJson<RegistryResponse>(response.data, "Invalid registry response (not JSON)");
      if (!resp.ok) {
        const err = resp.error;
        const e = new Error(err?.message ?? "Remote call failed") as Error & { code?: string };
        if (err?.code) e.code = err.code;
        throw e;
      }
      return resp.result;
    };
  }

  private buildClientPipeline() {
    const middleware: Middleware[] = [];

    // 1. Context enrichment (client-only)
    middleware.push(createEnrichContextMiddleware({
      config: {
        accessToken: this.config.accessToken,
        tokenProvider: this.config.tokenProvider,
        defaultTenantId: this.config.defaultTenantId,
        generateRequestId: true,
      },
    }));

    // 2. Resolution (client-only) — resolves capability → natsUrl + subject
    middleware.push(createResolveMiddleware({
      resolutionClient: this.resolutionClient!,
      loggerFactory: this.log,
    }));

    // 3. Extra middleware from consumer (via use())
    middleware.push(...this.extraMiddleware);

    // Core: NATS transport (uses connection pool for multi-sandbox support)
    const core = createNatsTransportCore({
      connectionPool: this.connectionPool!,
      config: { defaultTimeoutMs: this.config.defaultTimeoutMs ?? 30_000, includeTiming: true },
      log: this.log,
    });

    return buildPipeline({ middleware, core });
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(`${SERVICE_NAME}: Not initialized. Call initialize() first.`);
    }
  }
}
