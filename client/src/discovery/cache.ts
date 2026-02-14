/**
 * Discovery-specific cache.
 * Absorbed from @morezero/registry-client.
 */

import { TTLCache, type TTLCacheConfig } from "../cache/ttl-cache.js";
import type { DiscoverOutput, ResolutionContext } from "../types/registry.js";

const SERVICE_NAME = "capabilities-client:discovery-cache";

export interface DiscoveryCacheConfig extends TTLCacheConfig {
  includeTenantInKey: boolean;
}

export const defaultDiscoveryCacheConfig: DiscoveryCacheConfig = {
  defaultTtlMs: 60_000,
  negativeTtlMs: 15_000,
  staleWhileRevalidate: true,
  staleWindowMs: 30_000,
  maxEntries: 1_000,
  includeTenantInKey: true,
};

export class DiscoveryCache {
  private cache: TTLCache<DiscoverOutput>;
  private config: DiscoveryCacheConfig;
  private log: any;

  constructor(config?: Partial<DiscoveryCacheConfig>, loggerFactory?: any) {
    this.config = { ...defaultDiscoveryCacheConfig, ...config };
    this.cache = new TTLCache<DiscoverOutput>(this.config, loggerFactory);
    this.log = loggerFactory?.get?.(SERVICE_NAME) ?? loggerFactory ?? console;
  }

  buildKey(params: {
    app?: string;
    tags?: string[];
    query?: string;
    status?: string;
    page?: number;
    limit?: number;
    ctx?: ResolutionContext;
  }): string {
    const { app, tags, query, status, page, limit, ctx } = params;
    const parts: string[] = ["discover"];
    if (app) parts.push(`a:${app}`);
    if (tags?.length) parts.push(`t:${tags.sort().join(",")}`);
    if (query) parts.push(`q:${query}`);
    if (status) parts.push(`s:${status}`);
    if (page) parts.push(`p:${page}`);
    if (limit) parts.push(`l:${limit}`);
    if (this.config.includeTenantInKey && ctx?.tenantId) parts.push(`tenant:${ctx.tenantId}`);
    return parts.join("|");
  }

  get(params: {
    app?: string;
    tags?: string[];
    query?: string;
    status?: string;
    page?: number;
    limit?: number;
    ctx?: ResolutionContext;
  }): {
    value: DiscoverOutput | null;
    found: boolean;
    isStale: boolean;
    isNegative: boolean;
  } {
    const key = this.buildKey(params);
    return this.cache.get(key);
  }

  set(params: {
    app?: string;
    tags?: string[];
    query?: string;
    status?: string;
    page?: number;
    limit?: number;
    ctx?: ResolutionContext;
    value: DiscoverOutput;
  }): void {
    const key = this.buildKey(params);
    this.cache.set({ key, value: params.value });
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  invalidateApp(app: string): number {
    return this.cache.invalidateMatching((key) => key.includes(`a:${app}`));
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
