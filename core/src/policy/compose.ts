/**
 * Decision composer (deny-any, restrict limits, ordered patches).
 * @see Docs/registry/10_Schemas_And_Interfaces.md
 */

import type { PolicyDecision } from "./decision.js";
import type { AppliedPolicy } from "./bindings.js";

export type ComposedDecision = PolicyDecision & {
  appliedPolicies: AppliedPolicy[];
};

function minNum(a?: number, b?: number): number | undefined {
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}

export function composeDecisions(
  items: Array<{ decision: PolicyDecision; applied: AppliedPolicy }>
): ComposedDecision {
  const appliedPolicies = items.map((x) => x.applied);
  const denied = items.find((x) => x.decision.allow === false);
  const allow = !denied;
  const deny = items.flatMap((x) => x.decision.deny ?? []);
  const reasons = items.flatMap((x) => x.decision.reasons ?? []);
  const limits = items.reduce<{
    timeout_ms?: number;
    max_concurrency?: number;
    max_input_tokens?: number;
    max_output_tokens?: number;
    max_pages?: number;
    max_ocr_pages?: number;
  }>(
    (acc, x) => {
      const l = x.decision.limits ?? {};
      return {
        timeout_ms: minNum(acc.timeout_ms, l.timeout_ms),
        max_concurrency: minNum(acc.max_concurrency, l.max_concurrency),
        max_input_tokens: minNum(acc.max_input_tokens, l.max_input_tokens),
        max_output_tokens: minNum(acc.max_output_tokens, l.max_output_tokens),
        max_pages: minNum(acc.max_pages, l.max_pages),
        max_ocr_pages: minNum(acc.max_ocr_pages, l.max_ocr_pages),
      };
    },
    {}
  );
  const patches = items.flatMap((x) => x.decision.patches ?? []);
  const obligations = items.flatMap((x) => x.decision.obligations ?? []);
  const labels = items.reduce((acc, x) => ({ ...acc, ...(x.decision.labels ?? {}) }), {} as Record<string, string>);
  const routing = items.reduce<PolicyDecision["routing"]>(
    (acc, x) => x.decision.routing ?? acc,
    undefined
  );
  return {
    allow,
    deny,
    reasons,
    patches,
    limits,
    obligations,
    labels,
    routing,
    appliedPolicies,
  };
}
