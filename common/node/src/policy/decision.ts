/**
 * Policy decision contract (TS).
 * @see Docs/registry/10_Schemas_And_Interfaces.md
 */

import { z } from "zod";

const JsonPointer = z.string().min(1);
const NonEmptyString = z.string().min(1);

export const DenialSchema = z.object({
  code: NonEmptyString,
  message: NonEmptyString,
  target: z.enum(["request", "response", "context"]).default("request"),
  path: JsonPointer.optional(),
  details: z.record(z.any()).optional(),
});

export const JsonPatchOpSchema = z.object({
  op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
  path: JsonPointer,
  from: JsonPointer.optional(),
  value: z.any().optional(),
});

export const ObligationSchema = z.object({
  type: NonEmptyString,
  phase: z.enum(["pre", "post"]).default("pre"),
  required: z.boolean().default(true),
  params: z.record(z.any()).default({}),
});

export const LimitsSchema = z
  .object({
    timeout_ms: z.number().int().positive().optional(),
    max_concurrency: z.number().int().positive().optional(),
    max_input_tokens: z.number().int().positive().optional(),
    max_output_tokens: z.number().int().positive().optional(),
    max_pages: z.number().int().positive().optional(),
    max_ocr_pages: z.number().int().positive().optional(),
  })
  .default({});

export const RoutingSchema = z
  .object({
    queue_group: z.string().min(1).optional(),
    worker_pool: z.string().min(1).optional(),
    priority: z.enum(["low", "normal", "high"]).optional(),
    region: z.string().min(1).optional(),
  })
  .optional();

export const PolicyDecisionSchema = z.object({
  allow: z.boolean(),
  deny: z.array(DenialSchema).default([]),
  reasons: z.array(z.string()).default([]),
  patches: z.array(JsonPatchOpSchema).default([]),
  limits: LimitsSchema,
  obligations: z.array(ObligationSchema).default([]),
  labels: z.record(z.string()).default({}),
  routing: RoutingSchema,
  ttl_ms: z.number().int().positive().optional(),
});

export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;
