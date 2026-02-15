/**
 * Registry wire types for NATS communication.
 * Absorbed from @morezero/registry-client.
 */

// ── Version Status ──────────────────────────────────────────────────

export type VersionStatus = "active" | "deprecated" | "disabled";

// ── Resolution Context ──────────────────────────────────────────────

export interface ResolutionContext {
  tenantId?: string;
  env?: string;
  aud?: string;
  features?: string[];
}

// ── Resolve ─────────────────────────────────────────────────────────

export interface ResolveInput {
  cap: string;
  ver?: string;
  ctx?: ResolutionContext;
  includeMethods?: boolean;
  includeSchemas?: boolean;
}

export interface ResolveOutput {
  /** Canonical identity: cap:@alias/app/cap@version */
  canonicalIdentity: string;
  /** NATS server URL where the subject lives */
  natsUrl: string;
  /** NATS subject for invocation */
  subject: string;
  /** Major version number */
  major: number;
  /** Resolved concrete version */
  resolvedVersion: string;
  /** Capability status */
  status: VersionStatus;
  /** Client cache TTL in seconds */
  ttlSeconds: number;
  /** Cache validation etag */
  etag: string;
  /** Cache expiry timestamp */
  expiresAt?: string;
  /** Available methods (if requested) */
  methods?: MethodInfo[];
  /** Method schemas (if requested) */
  schemas?: MethodSchemas;
}

export interface MethodInfo {
  name: string;
  description?: string;
  modes: string[];
  tags: string[];
}

export interface MethodSchemas {
  [methodName: string]: {
    input: Record<string, unknown>;
    output: Record<string, unknown>;
  };
}

// ── Discover ────────────────────────────────────────────────────────

export interface DiscoverInput {
  app?: string;
  tags?: string[];
  query?: string;
  status?: VersionStatus | "all";
  supportsMethod?: string;
  ctx?: ResolutionContext;
  page?: number;
  limit?: number;
}

export interface DiscoverOutput {
  capabilities: DiscoveredCapability[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface DiscoveredCapability {
  cap: string;
  app: string;
  name: string;
  description?: string;
  tags: string[];
  defaultMajor: number;
  latestVersion: string;
  majors: number[];
  status: string;
}

// ── Describe ────────────────────────────────────────────────────────

export interface DescribeInput {
  cap: string;
  major?: number;
  version?: string;
}

export interface DescribeOutput {
  cap: string;
  app: string;
  name: string;
  description?: string;
  version: string;
  major: number;
  status: VersionStatus;
  methods: MethodDescription[];
  tags: string[];
  changelog?: string;
}

export interface MethodDescription {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  modes: string[];
  tags: string[];
  examples?: unknown[];
}

// ── List Majors ─────────────────────────────────────────────────────

export interface ListMajorsInput {
  cap: string;
  includeInactive?: boolean;
}

export interface ListMajorsOutput {
  majors: MajorInfo[];
}

export interface MajorInfo {
  major: number;
  latestVersion: string;
  status: VersionStatus;
  versionCount: number;
  isDefault: boolean;
}

// ── Registry Changed Event ──────────────────────────────────────────

export interface RegistryChangedEvent {
  app: string;
  capability: string;
  changedFields: string[];
  newDefaultMajor?: number;
  affectedMajors: number[];
  revision: number;
  etag: string;
  timestamp: string;
  env?: string;
}
