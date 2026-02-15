/**
 * Bootstrap config types (system capabilities).
 * Align with Go bootstrap types and bootstrap.json.
 */

export type BootstrapCapability = {
  subject: string;
  major: number;
  version: string;
  status: string;
  description?: string;
  methods: string[];
  isSystem: boolean;
  ttlSeconds: number;
};

export type BootstrapConfig = {
  name?: string;
  version: string;
  description?: string;
  minimum_capabilities?: string[];
  capabilities: Record<string, BootstrapCapability>;
  aliases?: Record<string, string>;
  changeEventSubjects?: {
    global: string;
    pattern: string;
  };
};

export type ResolvedBootstrapEntry = {
  subject: string;
  major: number;
  version: string;
  status: string;
  description?: string;
  methods: string[];
  isSystem: boolean;
  ttlSeconds: number;
  etag?: string;
};

export interface ResolvedBootstrap {
  get(capRef: string): ResolvedBootstrapEntry | undefined;
  getSubject(capRef: string): string;
  isSystem(capRef: string): boolean;
  list(): Iterable<[string, ResolvedBootstrapEntry]>;
  resolveAlias(alias: string): string;
  readonly capabilities?: Map<string, ResolvedBootstrapEntry>;
}
