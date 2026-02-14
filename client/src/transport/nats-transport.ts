/**
 * NATS transport core for the client pipeline.
 *
 * This function is the "core" of the client pipeline — it runs innermost,
 * after all middleware has processed the envelope.
 * It sends the envelope to the resolved NATS subject and decodes the response.
 *
 * Uses a connection pool to select the correct NATS connection based on
 * the resolved natsUrl (from the resolution middleware).
 *
 * @see Docs/registry/15_Federated_Resolution_And_Multi_NATS_Implementation_Plan.md §5.2
 */

import type {
  InvocationEnvelope,
  InvocationResult,
} from "@more0ai/core";
import { CapabilityError } from "@more0ai/core";
import type { NatsConnectionPool } from "./connection-pool.js";

const SERVICE_NAME = "capabilities-client:nats-transport";

export interface NatsTransportConfig {
  /** Default request timeout in milliseconds */
  defaultTimeoutMs: number;
  /** Include timing metadata in results */
  includeTiming: boolean;
}

export const defaultNatsTransportConfig: NatsTransportConfig = {
  defaultTimeoutMs: 30_000,
  includeTiming: true,
};

/**
 * Creates the core handler function for the client pipeline.
 *
 * Uses the connection pool to select the correct NATS connection based on
 * `env.resolved.natsUrl`. For local capabilities this returns the default
 * connection. For remote/sandbox capabilities, the pool handles auth and
 * connection management transparently.
 *
 * Usage:
 *   const core = createNatsTransportCore({ connectionPool, config });
 *   const pipeline = buildPipeline({ middleware: [...], core });
 */
export function createNatsTransportCore(params: {
  connectionPool: NatsConnectionPool;
  config?: Partial<NatsTransportConfig>;
  clock?: { now(): number };
}): (env: InvocationEnvelope, signal: AbortSignal) => Promise<InvocationResult<unknown>> {
  const config = { ...defaultNatsTransportConfig, ...params.config };
  const clock = params.clock ?? { now: () => Date.now() };

  return async (env: InvocationEnvelope, signal: AbortSignal): Promise<InvocationResult<unknown>> => {
    if (!env.resolved?.subject) {
      throw new CapabilityError({
        code: "UNKNOWN_SUBJECT",
        message: `${SERVICE_NAME}:invoke - No resolved subject on envelope. Resolution middleware must run first.`,
        retryable: false,
      });
    }

    if (!env.resolved.natsUrl) {
      throw new CapabilityError({
        code: "INTERNAL_ERROR",
        message: `${SERVICE_NAME}:invoke - No natsUrl on resolved envelope. Resolution middleware must set natsUrl.`,
        retryable: false,
      });
    }

    // Get connection for the target NATS server (default or remote sandbox)
    const nats = await params.connectionPool.getOrConnect(env.resolved.natsUrl);

    const startedAt = clock.now();
    const timeoutMs = env.ctx.timeoutMs ?? config.defaultTimeoutMs;

    const payload = new TextEncoder().encode(JSON.stringify({
      capability: env.capability,
      version: env.version,
      method: env.method,
      params: env.params,
      ctx: env.ctx,
    }));

    const response = await nats.request(env.resolved.subject, payload, {
      timeout: timeoutMs,
    });

    const decoded = JSON.parse(new TextDecoder().decode(response.data));

    if (decoded.ok === false) {
      const endedAt = clock.now();
      return {
        ok: false,
        error: {
          code: decoded.error?.code ?? "INTERNAL_ERROR",
          message: decoded.error?.message ?? "Unknown server error",
          retryable: decoded.error?.retryable ?? false,
          details: decoded.error?.details,
        },
        meta: {
          startedAtUnixMs: startedAt,
          endedAtUnixMs: endedAt,
          durationMs: endedAt - startedAt,
        },
      };
    }

    const endedAt = clock.now();
    return {
      ok: true,
      data: decoded.data ?? decoded.result ?? decoded,
      meta: config.includeTiming
        ? { startedAtUnixMs: startedAt, endedAtUnixMs: endedAt, durationMs: endedAt - startedAt }
        : { startedAtUnixMs: startedAt, endedAtUnixMs: endedAt, durationMs: 0 },
    };
  };
}
