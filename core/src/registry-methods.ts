/**
 * Registry method input/output types (align with Go server).
 * Used by registry-client when calling the registry via NATS.
 */

export type ResolutionContext = {
  tenantId?: string;
  env?: string;
  aud?: string;
  features?: string[];
};

export type ResolveInput = {
  cap: string;
  ver?: string;
  ctx?: ResolutionContext;
  includeMethods?: boolean;
  includeSchemas?: boolean;
};

export type MethodInfo = {
  name: string;
  description?: string;
  modes: string[];
  tags: string[];
};

export type Schema = {
  input: Record<string, unknown>;
  output: Record<string, unknown>;
};

export type ResolveOutput = {
  subject: string;
  major: number;
  resolvedVersion: string;
  status: string;
  ttlSeconds: number;
  etag: string;
  expiresAt?: string;
  methods?: MethodInfo[];
  schemas?: Record<string, Schema>;
};

export type DiscoverInput = {
  app?: string;
  tags?: string[];
  query?: string;
  status?: string;
  supportsMethod?: string;
  ctx?: ResolutionContext;
  page?: number;
  limit?: number;
};

export type DiscoveredCapability = {
  cap: string;
  app: string;
  name: string;
  description?: string;
  tags: string[];
  defaultMajor: number;
  latestVersion: string;
  majors: number[];
  status: string;
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type DiscoverOutput = {
  capabilities: DiscoveredCapability[];
  pagination: Pagination;
};

export type DescribeInput = {
  cap: string;
  major?: number;
  version?: string;
};

export type MethodDescription = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  modes: string[];
  tags: string[];
  examples?: unknown[];
};

export type DescribeOutput = {
  cap: string;
  app: string;
  name: string;
  description?: string;
  version: string;
  major: number;
  status: string;
  methods: MethodDescription[];
  tags: string[];
  changelog?: string;
};

export type ListMajorsInput = {
  cap: string;
  includeInactive?: boolean;
};

export type MajorInfo = {
  major: number;
  latestVersion: string;
  status: string;
  versionCount: number;
  isDefault: boolean;
};

export type ListMajorsOutput = {
  majors: MajorInfo[];
};

export type HealthChecks = {
  database: boolean;
  nats?: boolean;
};

export type HealthOutput = {
  status: string;
  checks: HealthChecks;
  timestamp: string;
};
