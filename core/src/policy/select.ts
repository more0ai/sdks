/**
 * Policy binding selector (selectPolicies).
 * @see Docs/registry/12_Implementation_Details.md §5
 */

import type { Pep } from "../pep.js";
import type { PolicyBinding, AppliedPolicy, PolicyMatchType } from "./bindings.js";

export type PolicySelectionInput = {
  pep: Pep;
  capabilityType: string;
  tags: string[];
  instanceId?: string;
  bindings: PolicyBinding[];
};

export function selectPolicies(input: PolicySelectionInput): {
  selected: Array<{ policyId: string; applied: AppliedPolicy; binding: PolicyBinding }>;
} {
  const tagSet = new Set(input.tags);

  function matches(binding: PolicyBinding): { ok: boolean; reason?: string } {
    if (binding.pep !== input.pep) return { ok: false };

    switch (binding.matchType as PolicyMatchType) {
      case "capability_type": {
        const ok = !!binding.capabilityType && binding.capabilityType === input.capabilityType;
        return ok ? { ok: true, reason: `capability_type=${binding.capabilityType}` } : { ok: false };
      }
      case "tags": {
        const allOk =
          !binding.tagAll || binding.tagAll.length === 0 ? true : binding.tagAll.every((t) => tagSet.has(t));
        const anyOk =
          !binding.tagAny || binding.tagAny.length === 0 ? true : binding.tagAny.some((t) => tagSet.has(t));
        const ok = allOk && anyOk;
        if (!ok) return { ok: false };
        const parts: string[] = [];
        if (binding.tagAll?.length) parts.push(`tagAll=${binding.tagAll.join(",")}`);
        if (binding.tagAny?.length) parts.push(`tagAny=${binding.tagAny.join(",")}`);
        return { ok: true, reason: parts.join(" ") || "tags match" };
      }
      case "instance": {
        const ok = !!input.instanceId && !!binding.instanceId && binding.instanceId === input.instanceId;
        return ok ? { ok: true, reason: `instanceId=${binding.instanceId}` } : { ok: false };
      }
      default:
        return { ok: false };
    }
  }

  const matched = input.bindings
    .map((b) => {
      const m = matches(b);
      return m.ok ? { binding: b, reason: m.reason ?? "matched" } : null;
    })
    .filter((x): x is { binding: PolicyBinding; reason: string } => x !== null);

  const groupRank: Record<PolicyMatchType, number> = {
    capability_type: 1,
    tags: 2,
    instance: 3,
  };

  const selected = matched
    .sort((a, b) => {
      const ra = groupRank[a.binding.matchType as PolicyMatchType] ?? 99;
      const rb = groupRank[b.binding.matchType as PolicyMatchType] ?? 99;
      if (ra !== rb) return ra - rb;
      if (a.binding.priority !== b.binding.priority) return b.binding.priority - a.binding.priority;
      return a.binding.id.localeCompare(b.binding.id);
    })
    .map(({ binding, reason }) => {
      const applied: AppliedPolicy = {
        policyId: binding.policyId,
        matchType: binding.matchType as PolicyMatchType,
        priority: binding.priority,
        bindingId: binding.id,
        reason: `pep=${binding.pep} ${reason}`,
      };
      return { policyId: binding.policyId, applied, binding };
    });

  return { selected };
}
