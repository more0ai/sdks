/**
 * Generic TTL cache with negative caching and stale-while-revalidate support.
 * Absorbed from @morezero/registry-client.
 */

const SERVICE_NAME = "capabilities-client:ttl-cache";

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  staleAt?: number;
  isNegative: boolean;
  etag?: string;
}

export interface TTLCacheConfig {
  /** Default TTL in milliseconds */
  defaultTtlMs: number;
  /** Negative entry TTL in milliseconds */
  negativeTtlMs: number;
  /** Enable stale-while-revalidate */
  staleWhileRevalidate: boolean;
  /** Stale window in milliseconds */
  staleWindowMs: number;
  /** Max entries (for memory management) */
  maxEntries?: number;
}

export class TTLCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private config: TTLCacheConfig;
  private log: any;

  constructor(config: TTLCacheConfig, loggerFactory?: any) {
    this.config = config;
    this.log = loggerFactory?.get?.(SERVICE_NAME) ?? loggerFactory ?? console;
  }

  get(key: string): {
    value: T | null;
    found: boolean;
    isStale: boolean;
    isNegative: boolean;
  } {
    const entry = this.cache.get(key);
    const now = Date.now();

    if (!entry) {
      return { value: null, found: false, isStale: false, isNegative: false };
    }

    if (now > entry.expiresAt) {
      if (this.config.staleWhileRevalidate && entry.staleAt && now <= entry.staleAt) {
        return { value: entry.value, found: true, isStale: true, isNegative: entry.isNegative };
      }
      this.cache.delete(key);
      return { value: null, found: false, isStale: false, isNegative: false };
    }

    return { value: entry.value, found: true, isStale: false, isNegative: entry.isNegative };
  }

  set(params: {
    key: string;
    value: T;
    ttlMs?: number;
    isNegative?: boolean;
    etag?: string;
  }): void {
    const { key, value, ttlMs, isNegative = false, etag } = params;

    if (this.config.maxEntries && this.cache.size >= this.config.maxEntries) {
      this.evictOldest();
    }

    const effectiveTtl = isNegative
      ? this.config.negativeTtlMs
      : ttlMs ?? this.config.defaultTtlMs;

    const now = Date.now();
    const expiresAt = now + effectiveTtl;
    const staleAt = this.config.staleWhileRevalidate
      ? expiresAt + this.config.staleWindowMs
      : undefined;

    this.cache.set(key, { value, expiresAt, staleAt, isNegative, etag });
  }

  setNegative(key: string): void {
    this.set({ key, value: null as any, isNegative: true });
  }

  invalidate(key: string): boolean {
    return this.cache.delete(key);
  }

  invalidateMatching(predicate: (key: string) => boolean): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (predicate(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  has(key: string): boolean {
    const result = this.get(key);
    return result.found && !result.isStale;
  }

  getEtag(key: string): string | undefined {
    return this.cache.get(key)?.etag;
  }

  private evictOldest(): void {
    const firstKey = this.cache.keys().next().value;
    if (firstKey) {
      this.cache.delete(firstKey);
    }
  }
}
