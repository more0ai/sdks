/**
 * Pipeline runner and middleware composition (shared core).
 *
 * The canonical Middleware pattern wraps a `next` handler using reduceRight,
 * enabling pre/post logic, error handling, and short-circuiting.
 *
 * @see Docs/capabilities/00_Pipeline_Implementation_Plan.md
 */

import type { InvocationEnvelope, InvocationResult } from "./envelope.js";

/**
 * Canonical middleware signature for capability pipelines.
 *
 * A middleware wraps a `next` handler, enabling:
 * - Pre-processing of the envelope before next() is called
 * - Post-processing of the result after next() returns
 * - Error handling (try/catch around next())
 * - Short-circuiting (return result without calling next())
 */
export type Middleware = (
  next: (env: InvocationEnvelope, signal: AbortSignal) => Promise<InvocationResult<unknown>>
) => (env: InvocationEnvelope, signal: AbortSignal) => Promise<InvocationResult<unknown>>;

/**
 * Composes an array of middleware around a core handler.
 *
 * Execution order follows array order:
 *   [mw0, mw1, mw2] + core  →  mw0( mw1( mw2( core ) ) )
 *
 * So mw0 runs first (outermost), core runs last (innermost).
 */
export function buildPipeline(params: {
  middleware: Middleware[];
  core: (env: InvocationEnvelope, signal: AbortSignal) => Promise<InvocationResult<unknown>>;
}): (env: InvocationEnvelope, signal: AbortSignal) => Promise<InvocationResult<unknown>> {
  return params.middleware.reduceRight((next, mw) => mw(next), params.core);
}

// ============================================================================
// DEPRECATED — backward compatibility during migration
// ============================================================================

/**
 * @deprecated Use Middleware type and buildPipeline() instead.
 * Kept for backward compatibility during migration.
 */
export type StageResult =
  | { kind: "continue" }
  | { kind: "stop"; reason: string };

/** @deprecated Use Middleware type instead. */
export type Stage<TCtx> = {
  name: string;
  run(ctx: TCtx): Promise<StageResult | void>;
};

/** @deprecated Use buildPipeline() instead. */
export type Pipeline<TCtx> = {
  name: string;
  stages: Stage<TCtx>[];
};

/** @deprecated Use buildPipeline() instead. */
export async function runPipeline<TCtx>(
  pipeline: Pipeline<TCtx>,
  ctx: TCtx
): Promise<StageResult> {
  for (const stage of pipeline.stages) {
    const res = await stage.run(ctx);
    if (res && res.kind === "stop") return res;
  }
  return { kind: "continue" as const };
}
