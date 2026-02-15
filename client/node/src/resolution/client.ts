/**
 * Resolution client - handles resolve() calls with caching.
 * Absorbed from @morezero/registry-client.
 *
 * Resolution: cache (bootstrap and registry results) then registry.
 * Bootstrap entries are pre-seeded into the cache with no TTL by the client.
 */

import type {
  ResolveInput,
  ResolveOutput,
} from "../types/registry.js";
import { ResolutionCache } from "./cache.js";
import { InFlightDedup } from "../cache/dedup.js";

const SERVICE_NAME = "capabilities-client:resolution";

export interface ResolutionClientDeps {
  remoteCall: (method: string, params: Record<string, unknown>) => Promise<unknown>;
  /** Pre-seeded cache (e.g. with bootstrap entries). If not provided, a new cache is created. */
  cache?: ResolutionCache;
  fallbackMappings?: Record<string, string>;
  /** Default NATS URL for system/local capabilities (used as fallback when natsUrl not in response) */
  defaultNatsUrl?: string;
}

export interface ResolutionClientConfig {
  resolutionCacheTtlSeconds?: number;
  negativeCacheTtlSeconds?: number;
  staleWhileRevalidate?: boolean;
  staleWindowSeconds?: number;
}

export class ResolutionClient {
  private cache: ResolutionCache;
  private dedup: InFlightDedup<ResolveOutput>;
  private deps: ResolutionClientDeps;
  private config: ResolutionClientConfig;
  private log: any;

  constructor(params: {
    deps: ResolutionClientDeps;
    config: ResolutionClientConfig;
    loggerFactory?: any;
  }) {
    this.deps = params.deps;
    this.config = params.config;
    this.log = params.loggerFactory?.get?.(SERVICE_NAME) ?? params.loggerFactory ?? console;

    this.cache =
      params.deps.cache ??
      new ResolutionCache(
        {
          defaultTtlMs: (params.config.resolutionCacheTtlSeconds ?? 300) * 1000,
          negativeTtlMs: (params.config.negativeCacheTtlSeconds ?? 30) * 1000,
          staleWhileRevalidate: params.config.staleWhileRevalidate ?? true,
          staleWindowMs: (params.config.staleWindowSeconds ?? 60) * 1000,
        },
        params.loggerFactory
      );

    this.dedup = new InFlightDedup<ResolveOutput>(params.loggerFactory);
  }

  async resolve(input: ResolveInput): Promise<ResolveOutput> {
    return this.resolveFromRegistryWithCache(input);
  }

  async resolveMultiple(
    inputs: ResolveInput[]
  ): Promise<Map<string, ResolveOutput | Error>> {
    const results = new Map<string, ResolveOutput | Error>();
    await Promise.all(
      inputs.map(async (input) => {
        try {
          const result = await this.resolve(input);
          results.set(input.cap, result);
        } catch (err) {
          results.set(input.cap, err as Error);
        }
      })
    );
    return results;
  }

  invalidateCapability(app: string, name: string): number {
    return this.cache.invalidateCapability(app, name);
  }

  clearCache(): void {
    this.cache.clear();
  }

  get cacheSize(): number {
    return this.cache.size;
  }

  private async resolveFromRegistryWithCache(input: ResolveInput): Promise<ResolveOutput> {
    const cacheParams = { cap: input.cap, ver: input.ver, ctx: input.ctx };
    const cached = this.cache.get(cacheParams);

    if (cached.found && !cached.isStale) {
      if (cached.isNegative) {
        throw new ResolutionError({
          code: "NOT_FOUND",
          message: `Capability not found (cached): ${input.cap}`,
        });
      }
      this.log.debug?.({ cap: input.cap }, `${SERVICE_NAME}:resolve - Cache hit`);
      return cached.value!;
    }

    if (cached.found && cached.isStale && !cached.isNegative) {
      this.log.debug?.({ cap: input.cap }, `${SERVICE_NAME}:resolve - Stale cache, revalidating`);
      this.revalidateInBackground(input, cacheParams);
      return cached.value!;
    }

    const cacheKey = this.cache.buildKey(cacheParams);

    try {
      const result = await this.dedup.getOrCreate(cacheKey, () =>
        this.fetchResolve(input)
      );
      this.cache.set({ ...cacheParams, value: result });
      return result;
    } catch (err) {
      if (this.deps.fallbackMappings) {
        const fallbackSubject = this.deps.fallbackMappings[input.cap];
        if (fallbackSubject) {
          this.log.warn?.(
            { cap: input.cap, fallbackSubject },
            `${SERVICE_NAME}:resolve - Using fallback mapping`
          );
          return this.buildFallbackResult(input.cap, fallbackSubject);
        }
      }
      this.cache.setNegative(cacheParams);
      throw err;
    }
  }

  private async fetchResolve(input: ResolveInput): Promise<ResolveOutput> {
    this.log.info?.({ cap: input.cap }, `${SERVICE_NAME}:fetchResolve`);
    const result = await this.deps.remoteCall("resolve", input as any);
    return result as ResolveOutput;
  }

  private revalidateInBackground(
    input: ResolveInput,
    cacheParams: { cap: string; ver?: string; ctx?: any }
  ): void {
    this.fetchResolve(input)
      .then((result) => {
        this.cache.set({ ...cacheParams, value: result });
      })
      .catch((err) => {
        this.log.warn?.(
          { cap: input.cap, error: (err as Error).message },
          `${SERVICE_NAME}:revalidateInBackground - Failed`
        );
      });
  }

  private buildFallbackResult(cap: string, subject: string): ResolveOutput {
    const defaultNatsUrl = this.deps.defaultNatsUrl ?? "nats://127.0.0.1:4222";
    const parts = subject.split(".");
    const majorStr = parts[parts.length - 1];
    const major = parseInt(majorStr.replace("v", ""), 10) || 1;
    return {
      canonicalIdentity: `cap:@main/${cap}@${major}.0.0`,
      natsUrl: defaultNatsUrl,
      subject,
      major,
      resolvedVersion: `${major}.0.0`,
      status: "active",
      ttlSeconds: 60,
      etag: "fallback",
    };
  }
}

export interface ResolutionErrorOptions {
  code: "NOT_FOUND" | "UNAVAILABLE" | "FORBIDDEN" | "INVALID_ARGUMENT";
  message: string;
  details?: unknown;
}

export class ResolutionError extends Error {
  code: string;
  details?: unknown;

  constructor(options: ResolutionErrorOptions) {
    super(options.message);
    this.name = "ResolutionError";
    this.code = options.code;
    this.details = options.details;
  }
}
