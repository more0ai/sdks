/**
 * In-flight request deduplication.
 * Prevents duplicate concurrent requests for the same key.
 * Absorbed from @morezero/registry-client.
 */

const SERVICE_NAME = "capabilities-client:dedup";

export class InFlightDedup<T> {
  private pending = new Map<string, Promise<T>>();
  private log: any;

  constructor(loggerFactory?: any) {
    this.log = loggerFactory?.get?.(SERVICE_NAME) ?? loggerFactory ?? console;
  }

  async getOrCreate(key: string, factory: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) {
      this.log.debug?.({ key }, `${SERVICE_NAME}:getOrCreate - Deduping request`);
      return existing;
    }

    const promise = factory().finally(() => {
      this.pending.delete(key);
    });

    this.pending.set(key, promise);
    return promise;
  }

  isPending(key: string): boolean {
    return this.pending.has(key);
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  clear(): void {
    this.pending.clear();
  }
}
