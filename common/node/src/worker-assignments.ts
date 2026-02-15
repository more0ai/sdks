/**
 * Worker assignment fetch + change events.
 * Minimal SubjectRoute shape to avoid depending on server-sdk.
 * @see Docs/registry/10_Schemas_And_Interfaces.md
 */

import type { ResolvedRoute } from "./resolved-route.js";

export type SubjectRouteEntry = {
  subject: string;
  capability: {
    app: string;
    name: string;
    resolvedVersion: string;
    type: string;
    instanceId?: string;
  };
  handlerKey: string;
  tags: string[];
  inputSchema?: object;
  outputSchema?: object;
  route: ResolvedRoute;
  etag: string;
  expiresAt?: number;
};

export type WorkerIdentity = {
  workerId: string;
  app: string;
  capTypes: string[];
  tiers: string[];
  pools: string[];
  region?: string;
  buildVersion?: string;
};

export type WorkerAssignmentsResponse = {
  workerId: string;
  configEtag: string;
  subjects: SubjectRouteEntry[];
};

export type RegistryAssignmentsChangedEvent = {
  type: "registry.assignments.changed";
  workerId: string;
  configEtag: string;
  added: SubjectRouteEntry[];
  removedSubjects: string[];
  updated: SubjectRouteEntry[];
};
