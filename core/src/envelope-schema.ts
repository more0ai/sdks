/**
 * Zod runtime schemas for InvocationEnvelope and InvocationContext.
 *
 * These schemas mirror the TypeScript interfaces in envelope.ts and provide
 * runtime validation for incoming NATS messages (used by the worker).
 *
 * @see envelope.ts for the canonical TypeScript interfaces.
 */

import { z } from "zod";

export const InvocationContextSchema = z.object({
  tenantId: z.string(),
  principal: z
    .object({
      type: z.enum(["user", "service"]),
      id: z.string(),
    })
    .optional(),
  userId: z.string().optional(),
  roles: z.array(z.string()).optional(),
  features: z.array(z.string()).optional(),
  channels: z.array(z.string()).optional(),
  trace: z
    .object({
      traceparent: z.string().optional(),
      tracestate: z.string().optional(),
    })
    .optional(),
  requestId: z.string(),
  correlationId: z.string().optional(),
  deadlineUnixMs: z.number().optional(),
  timeoutMs: z.number().optional(),
  idempotencyKey: z.string().optional(),
  accessToken: z.string().optional(),
  obligations: z.record(z.unknown()).optional(),
  meta: z.record(z.unknown()).optional(),
});

export const ResolvedCapabilitySchema = z.object({
  natsUrl: z.string(),
  subject: z.string(),
  version: z.string(),
  schemaHashIn: z.string().optional(),
  schemaHashOut: z.string().optional(),
  policySetHash: z.string().optional(),
  artifactDigest: z.string().optional(),
});

export const InvocationEnvelopeSchema = z.object({
  capability: z.string(),
  version: z.string().optional(),
  resolved: ResolvedCapabilitySchema.optional(),
  method: z.string(),
  params: z.unknown(),
  ctx: InvocationContextSchema,
});
