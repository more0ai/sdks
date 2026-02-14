/**
 * Bootstrap configuration types.
 *
 * Bootstrap is loaded exclusively from the system.registry.bootstrap NATS subject.
 * There is no file-based or inline bootstrap config.
 */

export interface BootstrapCapability {
  cap: string;
  subject: string;
  major: number;
  version: string;
  methods?: string[];
  ttlSeconds?: number;
  description?: string;
}

export interface BootstrapConfig {
  version: string;
  capabilities: BootstrapCapability[];
  defaultTtlSeconds?: number;
}

export interface ResolvedBootstrap {
  capabilities: Map<string, ResolvedBootstrapEntry>;
  source: string;
  loadedAt: string;
}

export interface ResolvedBootstrapEntry {
  /** NATS server URL where the subject lives */
  natsUrl: string;
  /** NATS subject for invocation */
  subject: string;
  major: number;
  version: string;
  methods: string[];
  ttlSeconds: number;
  expiresAt: string;
  isStale: boolean;
  etag: string;
}
