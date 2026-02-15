/**
 * Policy selection bindings + composition metadata.
 * @see Docs/registry/10_Schemas_And_Interfaces.md
 */

import type { Pep } from "../pep.js";

export type PolicyMatchType = "capability_type" | "tags" | "instance";

export type PolicyBinding = {
  id: string;
  tenantId?: string;
  app?: string;
  pep: Pep;
  matchType: PolicyMatchType;
  capabilityType?: string;
  tagAll?: string[];
  tagAny?: string[];
  instanceId?: string;
  priority: number;
  enabled: boolean;
  policyId: string;
};

export type AppliedPolicy = {
  policyId: string;
  matchType: PolicyMatchType;
  priority: number;
  bindingId: string;
  reason: string;
};
