/**
 * Discovery client - handles discover() calls with caching.
 * Absorbed from @morezero/registry-client.
 */

import type {
  DiscoverInput,
  DiscoverOutput,
  DescribeInput,
  DescribeOutput,
  ListMajorsInput,
  ListMajorsOutput,
} from "../types/registry.js";
import { DiscoveryCache } from "./cache.js";
import { InFlightDedup } from "../cache/dedup.js";

const SERVICE_NAME = "capabilities-client:discovery";

export interface DiscoveryClientDeps {
  remoteCall: (method: string, params: Record<string, unknown>) => Promise<unknown>;
}

export interface DiscoveryClientConfig {
  discoveryCacheTtlSeconds?: number;
  negativeCacheTtlSeconds?: number;
  staleWhileRevalidate?: boolean;
  staleWindowSeconds?: number;
}

export class DiscoveryClient {
  private cache: DiscoveryCache;
  private dedup: InFlightDedup<DiscoverOutput>;
  private deps: DiscoveryClientDeps;
  private config: DiscoveryClientConfig;
  private log: any;

  constructor(params: {
    deps: DiscoveryClientDeps;
    config: DiscoveryClientConfig;
    loggerFactory?: any;
  }) {
    this.deps = params.deps;
    this.config = params.config;
    this.log = params.loggerFactory?.get?.(SERVICE_NAME) ?? params.loggerFactory ?? console;

    this.cache = new DiscoveryCache(
      {
        defaultTtlMs: (params.config.discoveryCacheTtlSeconds ?? 60) * 1000,
        negativeTtlMs: (params.config.negativeCacheTtlSeconds ?? 30) * 1000,
        staleWhileRevalidate: params.config.staleWhileRevalidate ?? true,
        staleWindowMs: (params.config.staleWindowSeconds ?? 60) * 1000,
      },
      params.loggerFactory
    );

    this.dedup = new InFlightDedup<DiscoverOutput>(params.loggerFactory);
  }

  async discover(input: DiscoverInput): Promise<DiscoverOutput> {
    const cached = this.cache.get(input);
    if (cached.found && !cached.isStale) {
      this.log.debug?.({}, `${SERVICE_NAME}:discover - Cache hit`);
      return cached.value!;
    }
    if (cached.found && cached.isStale) {
      this.revalidateInBackground(input);
      return cached.value!;
    }
    const cacheKey = this.cache.buildKey(input);
    const result = await this.dedup.getOrCreate(cacheKey, () =>
      this.fetchDiscover(input)
    );
    this.cache.set({ ...input, value: result });
    return result;
  }

  async describe(input: DescribeInput): Promise<DescribeOutput> {
    this.log.info?.({ cap: input.cap }, `${SERVICE_NAME}:describe`);
    const result = await this.deps.remoteCall("describe", input as any);
    return result as DescribeOutput;
  }

  async listMajors(input: ListMajorsInput): Promise<ListMajorsOutput> {
    this.log.info?.({ cap: input.cap }, `${SERVICE_NAME}:listMajors`);
    const result = await this.deps.remoteCall("listMajors", input as any);
    return result as ListMajorsOutput;
  }

  invalidateAll(): void {
    this.cache.invalidateAll();
  }

  invalidateApp(app: string): number {
    return this.cache.invalidateApp(app);
  }

  clearCache(): void {
    this.cache.clear();
  }

  get cacheSize(): number {
    return this.cache.size;
  }

  private async fetchDiscover(input: DiscoverInput): Promise<DiscoverOutput> {
    this.log.info?.({}, `${SERVICE_NAME}:fetchDiscover`);
    const result = await this.deps.remoteCall("discover", input as any);
    return result as DiscoverOutput;
  }

  private revalidateInBackground(input: DiscoverInput): void {
    this.fetchDiscover(input)
      .then((result) => {
        this.cache.set({ ...input, value: result });
      })
      .catch((err) => {
        this.log.warn?.(
          { error: (err as Error).message },
          `${SERVICE_NAME}:revalidateInBackground - Failed`
        );
      });
  }
}
