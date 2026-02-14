/**
 * Shared middleware factories for capability pipelines.
 *
 * These middleware are used by both client and server pipelines.
 * Server-only middleware (idempotency, metering) stays in the server package.
 * Client-only middleware (resolution, transport) stays in the client package.
 *
 * @see Docs/capabilities/00_Pipeline_Implementation_Plan.md
 */

import type { ZodTypeAny } from "zod";
import type { Middleware } from "./pipeline.js";
import type {
  InvocationEnvelope,
  InvocationResult,
  InvocationContext,
  InvocationMeta,
  CapabilityErrorCode,
} from "./envelope.js";
import { CapabilityError } from "./errors.js";
import { anySignal, isAsyncIterable } from "./utils.js";

// ── Types ───────────────────────────────────────────────────────────

/**
 * Minimal method spec shape for shared middleware.
 * Both server MethodSpec and client method specs should satisfy this.
 */
export interface SharedMethodSpec {
  input: ZodTypeAny;
  output: ZodTypeAny;
  peps?: { pre?: string[]; post?: string[] };
  idempotency?: { enabled: boolean; ttlMs: number };
}

/**
 * Dependencies injected into shared middleware factories.
 * Use getter functions for values that may not be available at construction time.
 */
export interface MiddlewareDeps {
  /** Label for error/log messages (e.g. "CapabilityBase") */
  label: string;
  /** Returns method specs by name (lazy — called at invocation time) */
  getMethods: () => Record<string, SharedMethodSpec>;
  /** Capability name (lazy) */
  getName: () => string;
  /** Capability version (lazy) */
  getVersion: () => string;
  /** Injected services */
  services: InvocationServices;
}

/** Policy evaluator interface. */
export interface PolicyEvaluator {
  evaluate(args: { pep: string; envelope: InvocationEnvelope }): Promise<PolicyDecision>;
}

/** Policy decision from PDP evaluation. */
export interface PolicyDecision {
  allow: boolean;
  reasons?: string[];
  obligations?: Record<string, unknown>;
  decisionId?: string;
}

/** Idempotency store for at-most-once semantics. */
export interface IdempotencyStore {
  get(key: string): Promise<InvocationResult<unknown> | null>;
  put(key: string, value: InvocationResult<unknown>, ttlMs: number): Promise<void>;
}

/** Telemetry interface (OTEL-friendly). */
export interface Telemetry {
  withSpan<T>(name: string, attrs: Record<string, unknown>, fn: () => Promise<T>): Promise<T>;
  log(level: "debug" | "info" | "warn" | "error", msg: string, attrs?: Record<string, unknown>): void;
  metricCount(name: string, value: number, attrs?: Record<string, string>): void;
  metricHist(name: string, value: number, attrs?: Record<string, string>): void;
}

/** Services available to capability implementations. */
export interface InvocationServices {
  policy?: PolicyEvaluator;
  telemetry?: Telemetry;
  idempotency?: IdempotencyStore;
  clock?: { now(): number };
}

// ── Middleware Factories ─────────────────────────────────────────────

/** Input validation: parses env.params against the method's Zod input schema. */
export function createInputValidateMiddleware(deps: MiddlewareDeps): Middleware {
  return (next) => async (env, signal) => {
    const spec = deps.getMethods()[env.method];
    if (!spec) {
      throw new CapabilityError({
        code: "NOT_FOUND",
        message: `${deps.label}.inputValidate: Unknown method: ${env.method}`,
        retryable: false,
      });
    }
    const parsed = spec.input.safeParse(env.params);
    if (!parsed.success) {
      throw new CapabilityError({
        code: "VALIDATION_ERROR",
        message: `${deps.label}.inputValidate: Input validation failed`,
        retryable: false,
        details: parsed.error.format(),
      });
    }
    env.params = parsed.data;
    return next(env, signal);
  };
}

/** Output validation: validates handler result data against the method's Zod output schema. */
export function createOutputValidateMiddleware(deps: MiddlewareDeps): Middleware {
  return (next) => async (env, signal) => {
    const res = await next(env, signal);
    if (!res.ok) return res;
    if (isAsyncIterable(res.data)) return res;
    const spec = deps.getMethods()[env.method];
    const out = spec.output.safeParse(res.data);
    if (!out.success) {
      throw new CapabilityError({
        code: "INTERNAL_ERROR",
        message: `${deps.label}.outputValidate: Output validation failed`,
        retryable: false,
        details: out.error.format(),
      });
    }
    return { ...res, data: out.data };
  };
}

/** Deadline/timeout: handles both relative timeoutMs and absolute deadlineUnixMs. */
export function createDeadlineMiddleware(deps: MiddlewareDeps): Middleware {
  return (next) => async (env, signal) => {
    const timeoutMs = env.ctx.timeoutMs;
    const deadline = env.ctx.deadlineUnixMs;
    if (timeoutMs && timeoutMs > 0) {
      const ctrl = new AbortController();
      const t = setTimeout(
        () => ctrl.abort(new CapabilityError({
          code: "TIMEOUT",
          message: `${deps.label}.deadline: Timeout after ${timeoutMs}ms`,
          retryable: true,
        })),
        timeoutMs
      );
      try {
        return await next(env, anySignal([signal, ctrl.signal]));
      } finally {
        clearTimeout(t);
      }
    }
    if (deadline && deadline > 0) {
      const now = (deps.services.clock ?? { now: () => Date.now() }).now();
      if (now >= deadline) {
        throw new CapabilityError({
          code: "TIMEOUT",
          message: `${deps.label}.deadline: Deadline exceeded`,
          retryable: true,
        });
      }
    }
    return next(env, signal);
  };
}

/** Policy enforcement: pre/post PEP evaluation. */
export function createPolicyMiddleware(
  deps: MiddlewareDeps,
  options?: { defaultPeps?: { pre?: string[]; post?: string[] } }
): Middleware {
  const defaultPre = options?.defaultPeps?.pre ?? [];
  const defaultPost = options?.defaultPeps?.post ?? [];
  return (next) => async (env, signal) => {
    const policy = deps.services.policy;
    if (!policy) return next(env, signal);
    const spec = deps.getMethods()[env.method];
    const prePeps = spec.peps?.pre ?? defaultPre;
    const postPeps = spec.peps?.post ?? defaultPost;
    for (const pep of prePeps) {
      const decision = await policy.evaluate({ pep, envelope: env });
      if (!decision.allow) {
        throw new CapabilityError({
          code: "POLICY_DENIED",
          message: `${deps.label}.policy: Policy denied`,
          retryable: false,
          details: { pep, reasons: decision.reasons },
        });
      }
      env.ctx.obligations = { ...(env.ctx.obligations ?? {}), ...(decision.obligations ?? {}) };
      env.ctx.meta = {
        ...(env.ctx.meta ?? {}),
        policyDecisionId: decision.decisionId,
        policyReasons: decision.reasons,
      };
    }
    const res = await next(env, signal);
    for (const pep of postPeps) {
      await policy.evaluate({ pep, envelope: env });
    }
    return res;
  };
}

/** Telemetry: wraps invocation in a span with capability/method attributes. */
export function createTelemetryMiddleware(params: {
  label: string;
  getName: () => string;
  getVersion: () => string;
  telemetry?: Telemetry;
}): Middleware {
  return (next) => async (env, signal) => {
    const tel = params.telemetry;
    if (!tel) return next(env, signal);
    const attrs = {
      capability: params.getName(),
      version: params.getVersion(),
      method: env.method,
      tenant_id: env.ctx.tenantId,
      request_id: env.ctx.requestId,
    };
    return tel.withSpan(`capability.${params.getName()}.${env.method}`, attrs, async () => {
      tel.log("info", `${params.label}.telemetry: invoke`, attrs);
      const res = await next(env, signal);
      tel.metricCount("capability.invocations", 1, {
        capability: params.getName(),
        method: env.method,
      });
      return res;
    });
  };
}
