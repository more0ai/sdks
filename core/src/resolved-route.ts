/**
 * Minimal resolved-route types shared between client, worker, and registry.
 *
 * Only the type definitions live here. Route resolution business logic
 * (tiering, pooling, buildSubject) stays in the registry.
 *
 * @see Docs/registry/10_Schemas_And_Interfaces.md
 */

export type Tier = "free" | "pro" | "ent";
export type Pool = "general" | "pdf" | "llm" | "gpu" | string;

export type ResolvedRoute = {
  subject: string;
  queueGroup?: string;
  tier: Tier;
  pool?: Pool;
  capType: string;
  pepToken: string;
  configEtag: string;
};
