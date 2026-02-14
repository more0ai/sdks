/**
 * Bootstrap integration — manages bootstrap capability entries loaded from
 * the system.registry.bootstrap NATS subject.
 *
 * Bootstrap entries are permanent (no TTL, no expiry).
 * There is no file-based or inline bootstrap loading.
 */

import type {
  ResolvedBootstrap,
  ResolvedBootstrapEntry,
} from "./types.js";

const SERVICE_NAME = "capabilities-client:bootstrap";

export class BootstrapIntegration {
  private resolved: ResolvedBootstrap | null = null;
  private log: any;

  constructor(params: { loggerFactory?: any }) {
    this.log = params.loggerFactory?.get?.(SERVICE_NAME) ?? params.loggerFactory ?? console;
  }

  /**
   * Initialize with an empty bootstrap.
   * Entries are added later via addEntry() after fetching from NATS.
   */
  async initialize(): Promise<ResolvedBootstrap> {
    this.log.info?.({}, `${SERVICE_NAME}:initialize - Preparing empty bootstrap`);

    this.resolved = {
      capabilities: new Map(),
      source: "nats",
      loadedAt: new Date().toISOString(),
    };

    return this.resolved;
  }

  getResolved(): ResolvedBootstrap | null {
    return this.resolved;
  }

  isBootstrapped(cap: string): boolean {
    return this.resolved?.capabilities.has(cap) ?? false;
  }

  /**
   * Get a bootstrap entry by capability reference.
   * Bootstrap entries are permanent — no expiry checks.
   */
  getBootstrapEntry(cap: string): ResolvedBootstrapEntry | undefined {
    return this.resolved?.capabilities.get(cap);
  }

  addEntry(cap: string, entry: Omit<ResolvedBootstrapEntry, "etag">): void {
    if (!this.resolved) {
      this.resolved = {
        capabilities: new Map(),
        source: "manual",
        loadedAt: new Date().toISOString(),
      };
    }

    const fullEntry: ResolvedBootstrapEntry = {
      ...entry,
      etag: `bootstrap-${Date.now()}`,
    };

    this.resolved.capabilities.set(cap, fullEntry);
  }

  removeEntry(cap: string): boolean {
    return this.resolved?.capabilities.delete(cap) ?? false;
  }

  getBootstrappedCapabilities(): string[] {
    return this.resolved ? Array.from(this.resolved.capabilities.keys()) : [];
  }
}
