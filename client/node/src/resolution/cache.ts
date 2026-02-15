/**
 * Resolution-specific cache with context-aware key generation.
 * Absorbed from @morezero/registry-client.
 */

import { TTLCache, type TTLCacheConfig } from "../cache/ttl-cache.js";
import type { ResolveOutput, ResolutionContext } from "../types/registry.js";

const SERVICE_NAME = "capabilities-client:resolution-cache";

export interface ResolutionCacheConfig extends TTLCacheConfig {
  includeTenantInKey: boolean;
  includeEnvInKey: boolean;
}

export const defaultResolutionCacheConfig: ResolutionCacheConfig = {
  defaultTtlMs: 300_000,
  negativeTtlMs: 30_000,
  staleWhileRevalidate: true,
  staleWindowMs: 60_000,
  maxEntries: 10_000,
  includeTenantInKey: true,
  includeEnvInKey: true,
};

export class ResolutionCache {
  private cache: TTLCache<ResolveOutput>;
  private config: ResolutionCacheConfig;
  private log: any;

  constructor(config?: Partial<ResolutionCacheConfig>, loggerFactory?: any) {
    this.config = { ...defaultResolutionCacheConfig, ...config };
    this.cache = new TTLCache<ResolveOutput>(this.config, loggerFactory);
    this.log = loggerFactory?.get?.(SERVICE_NAME) ?? loggerFactory ?? console;
  }

  buildKey(params: { cap: string; ver?: string; canonicalIdentity?: string; ctx?: ResolutionContext }): string {
    // If we have canonical identity, use it as the primary key component
    if (params.canonicalIdentity) {
      const parts = [params.canonicalIdentity];
      if (this.config.includeTenantInKey && params.ctx?.tenantId) parts.push(`t:${params.ctx.tenantId}`);
      if (this.config.includeEnvInKey && params.ctx?.env) parts.push(`e:${params.ctx.env}`);
      return parts.join("|");
    }
    // Fallback to existing key format for pre-resolution lookups
    const { cap, ver, ctx } = params;
    const parts = [cap];
    if (ver) parts.push(`v:${ver}`);
    if (this.config.includeTenantInKey && ctx?.tenantId) parts.push(`t:${ctx.tenantId}`);
    if (this.config.includeEnvInKey && ctx?.env) parts.push(`e:${ctx.env}`);
    return parts.join("|");
  }

  get(params: { cap: string; ver?: string; ctx?: ResolutionContext }): {
    value: ResolveOutput | null;
    found: boolean;
    isStale: boolean;
    isNegative: boolean;
  } {
    const key = this.buildKey(params);
    return this.cache.get(key);
  }

  set(params: {
    cap: string;
    ver?: string;
    ctx?: ResolutionContext;
    value: ResolveOutput;
    /** Override TTL; use Infinity for no expiry (e.g. bootstrap entries). */
    ttlMs?: number;
  }): void {
    const key = this.buildKey(params);
    const ttlMs =
      params.ttlMs !== undefined
        ? params.ttlMs
        : params.value.ttlSeconds === 0
          ? Infinity
          : params.value.ttlSeconds * 1000;
    this.cache.set({
      key,
      value: params.value,
      ttlMs,
      etag: params.value.etag,
    });
  }

  setNegative(params: { cap: string; ver?: string; ctx?: ResolutionContext }): void {
    const key = this.buildKey(params);
    this.cache.setNegative(key);
  }

  invalidateCapability(app: string, name: string): number {
    const capPrefix = `${app}.${name}`;
    return this.cache.invalidateMatching((key) => key.startsWith(capPrefix));
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
