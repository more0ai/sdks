/**
 * Registry request/response wire envelope (NATS).
 * Aligns with Go dispatcher/envelope.go and Docs/registry/03_Registry_Server.md.
 */

export type InvocationContextWire = {
  tenantId?: string;
  userId?: string;
  requestId?: string;
  correlationId?: string;
  env?: string;
  aud?: string;
  features?: string[];
  roles?: string[];
  deadlineMs?: number;
  timeoutMs?: number;
};

export type RegistryRequest = {
  id: string;
  type: string;
  cap: string;
  method: string;
  params: Record<string, unknown>;
  ctx?: InvocationContextWire;
};

export type RegistryErrorDetail = {
  code: string;
  message: string;
  details?: unknown;
  retryable?: boolean;
};

export type RegistryResponse = {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: RegistryErrorDetail;
};
