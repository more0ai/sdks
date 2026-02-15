/**
 * Registry of capability handlers. Maps capability name to an async handler
 * that receives the invocation envelope and sandbox env, returns result.
 */

import type { InvocationEnvelope } from "@more0ai/common";

const LOG_PREFIX = "capabilities-worker:handler-registry";

export type CapabilityHandler = (params: {
  envelope: InvocationEnvelope;
  sandboxEnv: Record<string, string>;
}) => Promise<{ ok: true; data: unknown } | { ok: false; error: { code: string; message: string; retryable?: boolean; details?: unknown } }>;

const registry = new Map<string, CapabilityHandler>();

/**
 * Register a handler for a capability (by full name, e.g. "system.registry").
 */
export function registerHandler(capability: string, handler: CapabilityHandler): void {
  registry.set(capability, handler);
}

/**
 * Get handler for a capability, or the default echo handler.
 */
export function getHandler(capability: string): CapabilityHandler {
  const handler = registry.get(capability);
  if (handler) return handler;
  return defaultEchoHandler;
}

/**
 * Default handler: returns success with echoed params (for testing).
 */
export const defaultEchoHandler: CapabilityHandler = async ({ envelope }) => {
  return {
    ok: true,
    data: {
      capability: envelope.capability,
      method: envelope.method,
      echo: envelope.params,
      requestId: envelope.ctx?.requestId,
    },
  };
};

/**
 * Clear all registered handlers (e.g. on reload).
 */
export function clearHandlers(): void {
  registry.clear();
}
