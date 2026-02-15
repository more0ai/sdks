/**
 * Worker: handles one request message (decode envelope, run handler in sandbox context, reply).
 */

import type { InvocationEnvelope } from "@more0ai/common";
import { InvocationEnvelopeSchema } from "@more0ai/common";
import type { Sandbox } from "./config.js";
import { getHandler } from "./handler-registry.js";

const LOG_PREFIX = "capabilities-worker:worker";

export interface HandleMessageParams {
  /** Raw request body (JSON string or buffer) */
  body: string | Uint8Array;
  /** Sandbox for this pool (env vars for the handler) */
  sandbox: Sandbox;
  /** Logger */
  log?: any;
}

/**
 * Decode and validate envelope, run capability handler with sandbox env, return response payload.
 * Response shape matches what the client transport expects: { ok, data? } or { ok: false, error }.
 */
export async function handleMessage(params: HandleMessageParams): Promise<unknown> {
  const { body, sandbox, log = console } = params;
  const text = typeof body === "string" ? body : new TextDecoder().decode(body);
  let rawEnvelope: unknown;
  try {
    rawEnvelope = JSON.parse(text);
  } catch (err: any) {
    log.warn?.({ error: err?.message }, `${LOG_PREFIX}:handleMessage - Invalid JSON`);
    return {
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid JSON body",
        retryable: false,
      },
    };
  }

  const parsed = InvocationEnvelopeSchema.safeParse(rawEnvelope);
  if (!parsed.success) {
    log.warn?.(
      { errors: parsed.error.flatten() },
      `${LOG_PREFIX}:handleMessage - Invalid envelope`
    );
    return {
      ok: false,
      error: {
        code: "INVALID_ARGUMENT",
        message: "Invalid invocation envelope",
        retryable: false,
        details: parsed.error.flatten(),
      },
    };
  }

  const env = parsed.data;
  const envelope: InvocationEnvelope = { ...env, params: env.params ?? {} };

  log.info?.(
    { capability: envelope.capability, method: envelope.method },
    `${LOG_PREFIX}:handleMessage - Invocation received`
  );

  const handler = getHandler(envelope.capability);
  const sandboxEnv = sandbox.env ?? {};

  try {
    const result = await handler({
      envelope,
      sandboxEnv,
    });
    return result;
  } catch (err: any) {
    log.error?.(
      { capability: env.capability, method: env.method, error: err?.message },
      `${LOG_PREFIX}:handleMessage - Handler threw`
    );
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: err?.message ?? "Handler error",
        retryable: true,
      },
    };
  }
}
