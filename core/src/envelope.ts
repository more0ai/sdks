/**
 * Canonical invocation envelope, context, result, and error types.
 *
 * These types are shared between client and server capability pipelines.
 * The shapes are adopted from the server's proven types in
 * `packages/capabilities/server/capabilities/abstract-capability-base.ts`.
 *
 * @see Docs/capabilities/00_Pipeline_Implementation_Plan.md
 * @see Docs/registry/10_Schemas_And_Interfaces.md
 */

import type { Pep } from "./pep.js";

// ── Capability Error Codes ──────────────────────────────────────────

/**
 * Standardized error codes for capability invocations.
 * Superset of both the previous capabilities-core and server error codes.
 */
export type CapabilityErrorCode =
  | "VALIDATION_ERROR"
  | "SCHEMA_VALIDATION_FAILED"
  | "UNAUTHORIZED"
  | "AUTH_FAILED"
  | "FORBIDDEN"
  | "POLICY_DENIED"
  | "NOT_FOUND"
  | "TIMEOUT"
  | "CANCELLED"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "LIMIT_EXCEEDED"
  | "UPSTREAM_ERROR"
  | "UNKNOWN_SUBJECT"
  | "HANDLER_NOT_FOUND"
  | "REGISTRY_UNAVAILABLE"
  | "POLICY_ENGINE_UNAVAILABLE"
  | "OBLIGATION_FAILED"
  | "INTERNAL_ERROR";

// ── Invocation Context ──────────────────────────────────────────────

/**
 * Context passed to capability invocations.
 * Includes auth, policy, deadline, trace, and tenant information.
 */
export interface InvocationContext {
  tenantId: string;
  principal?: { type: "user" | "service"; id: string };
  userId?: string;
  roles?: string[];
  features?: string[];
  channels?: string[];
  trace?: { traceparent?: string; tracestate?: string };
  requestId: string;
  correlationId?: string;
  deadlineUnixMs?: number;
  timeoutMs?: number;
  idempotencyKey?: string;
  accessToken?: string;
  obligations?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

// ── Resolved Capability ─────────────────────────────────────────────

/**
 * Resolution metadata filled by the resolver/registry.
 */
export interface ResolvedCapability {
  /** NATS server URL where the subject lives */
  natsUrl: string;
  /** NATS subject for invocation */
  subject: string;
  /** Resolved version */
  version: string;
  schemaHashIn?: string;
  schemaHashOut?: string;
  policySetHash?: string;
  artifactDigest?: string;
}

// ── Invocation Envelope ─────────────────────────────────────────────

/**
 * Transport-agnostic envelope for capability invocations.
 */
export interface InvocationEnvelope<P = unknown> {
  capability: string;
  version?: string;
  resolved?: ResolvedCapability;
  method: string;
  params: P;
  ctx: InvocationContext;
}

// ── Invocation Result & Meta ────────────────────────────────────────

/**
 * Metadata about invocation execution.
 */
export interface InvocationMeta {
  startedAtUnixMs: number;
  endedAtUnixMs: number;
  durationMs: number;
  policyDecisionId?: string;
  policyReasons?: string[];
  usageTotals?: Record<string, number>;
  executionId?: string;
}

/** Successful invocation result. */
export type InvocationOk<T> = {
  ok: true;
  data: T;
  meta: InvocationMeta;
};

/** Failed invocation result. */
export type InvocationErr = {
  ok: false;
  error: {
    code: CapabilityErrorCode;
    message: string;
    retryable: boolean;
    details?: unknown;
  };
  meta: InvocationMeta;
};

/** Union result type for capability invocations. */
export type InvocationResult<T = unknown> = InvocationOk<T> | InvocationErr;

// ── Streaming ───────────────────────────────────────────────────────

/** Transport-independent streaming frame types. */
export type StreamFrame =
  | { type: "delta"; path?: string; value: unknown }
  | { type: "progress"; message: string; pct?: number }
  | { type: "event"; name: string; data: unknown }
  | { type: "final"; data: unknown };

/** Handler return type — either Promise for sync or AsyncIterable for streaming. */
export type HandlerReturn<T> =
  | Promise<T>
  | AsyncIterable<StreamFrame>;

// ── Capability Type ─────────────────────────────────────────────────

export type CapabilityType = "tool" | "workflow" | "agent" | "policy" | "system" | "schema";
export type InvokeMode = "sync" | "async" | "stream";

// ── Deprecated aliases (backward compatibility) ─────────────────────

/** @deprecated Use InvocationContext instead */
export type CapabilityTarget = {
  app: string;
  name: string;
  requestedVersion?: string;
  resolvedVersion?: string;
  type?: CapabilityType;
  instanceId?: string;
};
