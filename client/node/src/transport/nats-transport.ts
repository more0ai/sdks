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
} from "@more0ai/common";
import { CapabilityError, type CapabilityErrorCode } from "@more0ai/common";
import type { NatsConnectionPool } from "./connection-pool.js";
import type { Logger } from "../types/logger.js";

const SERVICE_NAME = "capabilities-client:nats-transport";

function parseInvocationResponse(data: Uint8Array): Record<string, unknown> {
  try {
    return JSON.parse(new TextDecoder().decode(data)) as Record<string, unknown>;
  } catch (err) {
    throw new CapabilityError({
      code: "INTERNAL_ERROR",
      message: `${SERVICE_NAME}:invoke - Invalid response (not JSON): ${(err as Error).message}`,
      retryable: false,
    });
  }
}

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
  /** Optional logger; when set, logs subject and natsUrl from registry on each invoke */
  log?: Logger;
}): (env: InvocationEnvelope, signal: AbortSignal) => Promise<InvocationResult<unknown>> {
  const config = { ...defaultNatsTransportConfig, ...params.config };
  const clock = params.clock ?? { now: () => Date.now() };
  const log = params.log;

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

    log?.info?.(
      { subject: env.resolved.subject, natsUrl: env.resolved.natsUrl, capability: env.capability, method: env.method },
      `${SERVICE_NAME}:invoke - Invoking (subject from registry)`
    );

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

    const decoded = parseInvocationResponse(response.data);

    if (decoded.ok === false) {
      const endedAt = clock.now();
      const err = (decoded.error ?? {}) as { code?: string; message?: string; retryable?: boolean; details?: unknown };
      return {
        ok: false,
        error: {
          code: (err.code ?? "INTERNAL_ERROR") as CapabilityErrorCode,
          message: err.message ?? "Unknown server error",
          retryable: err.retryable ?? false,
          details: err.details,
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
