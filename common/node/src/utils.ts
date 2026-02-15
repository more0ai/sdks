/**
 * Shared utility functions for capability pipelines.
 *
 * These utilities are used by both client and server pipeline code.
 * Moved from packages/capabilities/server/capabilities/abstract-capability-base.ts.
 *
 * @see Docs/capabilities/00_Pipeline_Implementation_Plan.md
 */

import { CapabilityError } from "./errors.js";
import type {
  InvocationEnvelope,
  InvocationContext,
  InvocationMeta,
  InvocationErr,
  InvocationResult,
  CapabilityErrorCode,
} from "./envelope.js";

/**
 * Combines multiple AbortSignals into one.
 * Returns immediately if any signal is already aborted.
 */
export function anySignal(signals: AbortSignal[]): AbortSignal {
  const ctrl = new AbortController();
  for (const s of signals) {
    if (s.aborted) return s;
    s.addEventListener("abort", () => ctrl.abort(s.reason), { once: true });
  }
  return ctrl.signal;
}

/**
 * Type guard for AsyncIterable.
 */
export function isAsyncIterable(x: any): x is AsyncIterable<any> {
  return x && typeof x[Symbol.asyncIterator] === "function";
}

/**
 * Composes an AbortController from an optional signal and invocation context.
 */
export function composeAbort(args: {
  signal?: AbortSignal;
  ctx: InvocationContext;
}): AbortController {
  const ctrl = new AbortController();
  if (args.signal) {
    args.signal.addEventListener("abort", () => ctrl.abort(args.signal!.reason), { once: true });
  }
  return ctrl;
}

/**
 * Creates an error result from an exception.
 */
export function toErrorResult(args: {
  err: unknown;
  startedAt: number;
  clock?: { now(): number };
}): InvocationErr {
  const clock = args.clock ?? { now: () => Date.now() };
  const endedAt = clock.now();
  const meta: InvocationMeta = {
    startedAtUnixMs: args.startedAt,
    endedAtUnixMs: endedAt,
    durationMs: endedAt - args.startedAt,
  };

  const ce = args.err instanceof CapabilityError
    ? args.err
    : new CapabilityError({
        code: "INTERNAL_ERROR",
        message: "Unhandled error",
        retryable: false,
        cause: args.err,
      });

  return {
    ok: false,
    error: {
      code: ce.code,
      message: ce.message,
      retryable: ce.retryable,
      details: ce.details,
    },
    meta,
  };
}

/**
 * Creates an immediate error result (zero duration).
 */
export function immediateError(args: {
  code: CapabilityErrorCode;
  message: string;
  retryable: boolean;
  details?: unknown;
}): InvocationErr {
  const now = Date.now();
  return {
    ok: false,
    error: {
      code: args.code,
      message: args.message,
      retryable: args.retryable,
      details: args.details,
    },
    meta: {
      startedAtUnixMs: now,
      endedAtUnixMs: now,
      durationMs: 0,
    },
  };
}

/**
 * Creates invocation metadata with timing and optional usage/policy info.
 */
export function finishMeta(args: {
  clock: { now(): number };
  startedAt: number;
  ctx?: InvocationContext;
  usageTotals?: Record<string, number>;
  executionId?: string;
}): InvocationMeta {
  const endedAt = args.clock.now();
  return {
    startedAtUnixMs: args.startedAt,
    endedAtUnixMs: endedAt,
    durationMs: endedAt - args.startedAt,
    policyDecisionId: (args.ctx?.meta as any)?.policyDecisionId,
    policyReasons: (args.ctx?.meta as any)?.policyReasons,
    usageTotals: args.usageTotals,
    executionId: args.executionId,
  };
}
