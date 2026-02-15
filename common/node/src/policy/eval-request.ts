/**
 * Policy evaluation request (PEP + tags/type/instance).
 * @see Docs/registry/10_Schemas_And_Interfaces.md
 */

import type { Pep } from "../pep.js";
import type { CapabilityType } from "../envelope.js";

export type PolicyEvalRequest = {
  pep: Pep;
  phase: "pre" | "post";
  subject: {
    tenantId: string;
    userId?: string;
    roles?: string[];
    features?: string[];
    plan?: string;
    aud?: string | string[];
  };
  target: {
    app: string;
    capability: string;
    resolvedVersion: string;
    capabilityType: CapabilityType;
    method: string;
    instanceId?: string;
  };
  tags: string[];
  resource?: {
    classification?: "public" | "internal" | "sensitive" | "regulated";
    region?: string;
  };
  context?: Record<string, unknown>;
  params?: unknown;
  resultMeta?: Record<string, unknown>;
};
