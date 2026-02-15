/**
 * Context enrichment middleware (client-only).
 *
 * Enriches the invocation context with:
 * - Access token (from config or provider)
 * - Request ID generation
 * - Default tenant ID
 */

import { randomUUID } from "node:crypto";
import type {
  Middleware,
  InvocationEnvelope,
  InvocationResult,
} from "@more0ai/common";

const SERVICE_NAME = "capabilities-client:enrich-context";

export interface ContextEnrichmentConfig {
  /** Static access token (or use tokenProvider for dynamic) */
  accessToken?: string;
  /** Dynamic token provider */
  tokenProvider?: () => Promise<string | undefined>;
  /** Default tenant ID (if not already on ctx) */
  defaultTenantId?: string;
  /** Whether to generate a requestId if missing */
  generateRequestId?: boolean;
}

export function createEnrichContextMiddleware(params: {
  config: ContextEnrichmentConfig;
}): Middleware {
  return (next: (env: InvocationEnvelope, signal: AbortSignal) => Promise<InvocationResult<unknown>>) =>
    async (env: InvocationEnvelope, signal: AbortSignal) => {
    // Ensure requestId
    if (!env.ctx.requestId && (params.config.generateRequestId ?? true)) {
      env.ctx.requestId = randomUUID();
    }

    // Ensure tenantId
    if (!env.ctx.tenantId && params.config.defaultTenantId) {
      env.ctx.tenantId = params.config.defaultTenantId;
    }

    // Add access token
    if (!env.ctx.accessToken) {
      if (params.config.tokenProvider) {
        env.ctx.accessToken = await params.config.tokenProvider();
      } else if (params.config.accessToken) {
        env.ctx.accessToken = params.config.accessToken;
      }
    }

    return next(env, signal);
  };
}
