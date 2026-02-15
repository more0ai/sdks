/**
 * NATS connection pool for multi-sandbox capability invocation.
 *
 * Manages connections to multiple NATS servers (sandboxes), keyed by natsUrl.
 * The default NATS connection (for registry/bootstrap) is never closed by the pool.
 * Non-default connections are created lazily on first use via the auth provider.
 *
 * @see Docs/registry/15_Federated_Resolution_And_Multi_NATS_Implementation_Plan.md §5.1
 */

import { connect, type NatsConnection } from "nats";
import { CapabilityError } from "@more0ai/common";
import type { NatsCredentials, NatsAuthProvider } from "./auth-types.js";

const SERVICE_NAME = "capabilities-client:connection-pool";

// ── Config ──────────────────────────────────────────────────────────

export interface ConnectionPoolConfig {
  /** Maximum number of concurrent NATS connections (default + remotes). Default: 10 */
  maxConnections?: number;
  /** Close idle remote connections after this many ms. Default: 300000 (5 min) */
  idleTimeoutMs?: number;
  /** Auth provider for obtaining sandbox credentials */
  authProvider?: NatsAuthProvider;
  /** User's access token (passed to authProvider) */
  accessToken?: string;
  /** Token provider for dynamic access tokens */
  tokenProvider?: () => Promise<string | undefined>;
}

// ── Pool Entry ──────────────────────────────────────────────────────

interface PoolEntry {
  connection: NatsConnection;
  credentials: NatsCredentials;
  natsUrl: string;
  connectedAt: number;
  lastUsedAt: number;
}

// ── Stats ───────────────────────────────────────────────────────────

export interface ConnectionPoolStats {
  totalConnections: number;
  activeConnections: string[];
  defaultUrl: string;
}

// ── Pool ────────────────────────────────────────────────────────────

export class NatsConnectionPool {
  private connections: Map<string, PoolEntry> = new Map();
  private defaultConnection: NatsConnection;
  private defaultUrl: string;
  private config: Required<Pick<ConnectionPoolConfig, "maxConnections" | "idleTimeoutMs">> & ConnectionPoolConfig;
  private log: any;
  private idleTimer?: ReturnType<typeof setInterval>;

  constructor(params: {
    defaultConnection: NatsConnection;
    defaultUrl: string;
    config: ConnectionPoolConfig;
    loggerFactory?: any;
  }) {
    this.defaultConnection = params.defaultConnection;
    this.defaultUrl = NatsConnectionPool.normalizeUrl(params.defaultUrl);
    this.config = {
      maxConnections: 10,
      idleTimeoutMs: 300_000,
      ...params.config,
    };
    this.log = params.loggerFactory?.get?.(SERVICE_NAME) ?? params.loggerFactory ?? console;

    // Start idle connection reaper
    this.idleTimer = setInterval(() => this.reapIdleConnections(), 60_000);
  }

  /**
   * Get or create a NATS connection for the given URL.
   *
   * - If natsUrl matches the default → return default connection (no auth call)
   * - If natsUrl is in pool and credentials valid → return cached connection
   * - If natsUrl is in pool but credentials expired → refresh credentials, reconnect
   * - If natsUrl is new → call authProvider, connect, add to pool
   *
   * @throws if authProvider is not configured and natsUrl is not the default
   * @throws if auth server returns error or credentials are denied
   */
  async getOrConnect(natsUrl: string): Promise<NatsConnection> {
    const normalizedUrl = NatsConnectionPool.normalizeUrl(natsUrl);

    // Default connection — always available, no auth call
    if (normalizedUrl === this.defaultUrl) {
      return this.defaultConnection;
    }

    // Check pool for existing connection
    const existing = this.connections.get(normalizedUrl);
    if (existing) {
      // Check if credentials are still valid
      if (!this.isCredentialExpired(existing.credentials)) {
        existing.lastUsedAt = Date.now();
        return existing.connection;
      }

      // Credentials expired — close old connection and reconnect
      this.log.info?.({ natsUrl: normalizedUrl }, `${SERVICE_NAME}:getOrConnect - Credentials expired, reconnecting`);
      await this.closeEntry(normalizedUrl);
    }

    // Require auth provider for non-default connections
    if (!this.config.authProvider) {
      throw new CapabilityError({
        code: "AUTH_FAILED",
        message: `${SERVICE_NAME}:getOrConnect - No natsAuthProvider configured. Cannot connect to remote NATS: ${normalizedUrl}`,
        retryable: false,
      });
    }

    // Evict LRU if at capacity
    await this.evictIfNeeded();

    // Get credentials from auth provider
    const accessToken = this.config.tokenProvider
      ? await this.config.tokenProvider()
      : this.config.accessToken;

    let credentials: NatsCredentials;
    try {
      credentials = await this.config.authProvider({
        natsUrl: normalizedUrl,
        accessToken,
      });
    } catch (err) {
      throw new CapabilityError({
        code: "AUTH_FAILED",
        message: `${SERVICE_NAME}:getOrConnect - Auth provider failed for ${normalizedUrl}: ${(err as Error).message}`,
        retryable: true,
        cause: err,
      });
    }

    // Connect with credentials
    let connection: NatsConnection;
    try {
      connection = await connect({
        servers: normalizedUrl,
        name: `capabilities-client-sandbox`,
        ...this.buildNatsAuth(credentials),
      });
    } catch (err) {
      throw new CapabilityError({
        code: "INTERNAL_ERROR",
        message: `${SERVICE_NAME}:getOrConnect - Failed to connect to ${normalizedUrl}: ${(err as Error).message}`,
        retryable: true,
        cause: err,
      });
    }

    // Add to pool
    const now = Date.now();
    this.connections.set(normalizedUrl, {
      connection,
      credentials,
      natsUrl: normalizedUrl,
      connectedAt: now,
      lastUsedAt: now,
    });

    this.log.info?.(
      { natsUrl: normalizedUrl, poolSize: this.size },
      `${SERVICE_NAME}:getOrConnect - Connected to remote NATS`
    );

    return connection;
  }

  /** Close all non-default connections and stop the idle reaper. */
  async closeAll(): Promise<void> {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = undefined;
    }

    const closePromises: Promise<void>[] = [];
    for (const [url] of this.connections) {
      closePromises.push(this.closeEntry(url));
    }
    await Promise.allSettled(closePromises);
    this.connections.clear();

    this.log.info?.({}, `${SERVICE_NAME}:closeAll - All pooled connections closed`);
  }

  /** Number of active connections (including default). */
  get size(): number {
    return this.connections.size + 1; // +1 for default
  }

  /** Health info for monitoring. */
  getStats(): ConnectionPoolStats {
    return {
      totalConnections: this.size,
      activeConnections: [this.defaultUrl, ...this.connections.keys()],
      defaultUrl: this.defaultUrl,
    };
  }

  // ── Private ────────────────────────────────────────────────────────

  private isCredentialExpired(creds: NatsCredentials): boolean {
    if (creds.expiresAt === undefined) return false;
    // Expire 30s early to avoid race conditions
    return Date.now() >= creds.expiresAt - 30_000;
  }

  private buildNatsAuth(creds: NatsCredentials): Record<string, unknown> {
    const auth: Record<string, unknown> = {};
    if (creds.token) auth.token = creds.token;
    if (creds.user) auth.user = creds.user;
    if (creds.pass) auth.pass = creds.pass;
    // JWT/NKey auth would need authenticator — future enhancement
    return auth;
  }

  private async closeEntry(natsUrl: string): Promise<void> {
    const entry = this.connections.get(natsUrl);
    if (!entry) return;
    try {
      await entry.connection.drain();
    } catch (err) {
      this.log.warn?.(
        { natsUrl, error: (err as Error).message },
        `${SERVICE_NAME}:closeEntry - Error draining connection`
      );
    }
    this.connections.delete(natsUrl);
  }

  private async evictIfNeeded(): Promise<void> {
    const maxRemote = (this.config.maxConnections ?? 10) - 1; // -1 for default
    if (this.connections.size < maxRemote) return;

    // Find LRU entry
    let oldestUrl: string | undefined;
    let oldestTime = Infinity;
    for (const [url, entry] of this.connections) {
      if (entry.lastUsedAt < oldestTime) {
        oldestTime = entry.lastUsedAt;
        oldestUrl = url;
      }
    }

    if (oldestUrl) {
      this.log.info?.(
        { evictedUrl: oldestUrl },
        `${SERVICE_NAME}:evictIfNeeded - Evicting LRU connection (pool full)`
      );
      await this.closeEntry(oldestUrl);
    }
  }

  private async reapIdleConnections(): Promise<void> {
    const now = Date.now();
    const idleMs = this.config.idleTimeoutMs ?? 300_000;
    const toEvict: string[] = [];

    for (const [url, entry] of this.connections) {
      if (now - entry.lastUsedAt > idleMs) {
        toEvict.push(url);
      }
    }

    for (const url of toEvict) {
      this.log.info?.({ natsUrl: url }, `${SERVICE_NAME}:reapIdleConnections - Closing idle connection`);
      await this.closeEntry(url);
    }
  }

  /** Normalize a NATS URL for consistent map keying. */
  static normalizeUrl(url: string): string {
    // Trim trailing slash and lowercase protocol/host
    return url.replace(/\/+$/, "").toLowerCase();
  }
}
