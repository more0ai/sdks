/**
 * Resolution middleware (client-only).
 *
 * Resolves the capability reference in the envelope to a NATS subject and
 * NATS server URL. Populates env.resolved.{natsUrl, subject, version} so
 * the transport core knows where and what to send.
 *
 * Resolution order:
 * 1. If env.resolved.subject is already set, skip (pre-resolved)
 * 2. Bootstrap (system capabilities, no registry call)
 * 3. Cache (previously resolved)
 * 4. Registry (remote via NATS)
 *
 * @see Docs/registry/15_Federated_Resolution_And_Multi_NATS_Implementation_Plan.md §5.3
 */

import type {
  Middleware,
  ResolvedCapability,
  InvocationEnvelope,
  InvocationResult,
} from "@more0ai/core";
import type { ResolutionClient } from "../resolution/client.js";

const SERVICE_NAME = "capabilities-client:resolve-middleware";

export function createResolveMiddleware(params: {
  resolutionClient: ResolutionClient;
  loggerFactory?: any;
}): Middleware {
  const log = params.loggerFactory?.get?.(SERVICE_NAME) ?? params.loggerFactory ?? console;

  return (next: (env: InvocationEnvelope, signal: AbortSignal) => Promise<InvocationResult<unknown>>) =>
    async (env: InvocationEnvelope, signal: AbortSignal) => {
    // Skip if already resolved (both subject and natsUrl must be present)
    if (env.resolved?.subject && env.resolved?.natsUrl) {
      log.debug?.({ cap: env.capability }, `${SERVICE_NAME} - Already resolved`);
      return next(env, signal);
    }

    log.debug?.({ cap: env.capability, ver: env.version }, `${SERVICE_NAME} - Resolving`);

    const result = await params.resolutionClient.resolve({
      cap: env.capability,
      ver: env.version,
      ctx: env.ctx.tenantId ? { tenantId: env.ctx.tenantId } : undefined,
    });

    env.resolved = {
      ...env.resolved,
      natsUrl: result.natsUrl,
      subject: result.subject,
      version: result.resolvedVersion,
    } as ResolvedCapability;

    log.debug?.(
      {
        cap: env.capability,
        natsUrl: result.natsUrl,
        subject: result.subject,
        ver: result.resolvedVersion,
      },
      `${SERVICE_NAME} - Resolved`
    );

    return next(env, signal);
  };
}
