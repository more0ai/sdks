/**
 * PEP (Policy Enforcement Point) enum and metadata.
 * @see Docs/registry/10_Schemas_And_Interfaces.md
 */

export const PEP = {
  APP_CREATE: "app.create",
  CAP_INVOKE: "cap.invoke",
  CAP_POST_INVOKE: "cap.post_invoke",
  TOOL_INVOKE: "tool.invoke",
  TOOL_POST_PROCESS: "tool.post_process",
  WORKFLOW_INVOKE: "workflow.invoke",
  WORKFLOW_POST_PROCESS: "workflow.post_process",
} as const;

export type Pep = (typeof PEP)[keyof typeof PEP];

export type PepPhase = "pre" | "post";

export type PepSpec = {
  pep: Pep;
  phase: PepPhase;
  provides: {
    params: boolean;
    result: boolean;
  };
};

export const PepSpecs: PepSpec[] = [
  { pep: PEP.CAP_INVOKE, phase: "pre", provides: { params: true, result: false } },
  { pep: PEP.CAP_POST_INVOKE, phase: "post", provides: { params: true, result: true } },
  { pep: PEP.TOOL_INVOKE, phase: "pre", provides: { params: true, result: false } },
  { pep: PEP.TOOL_POST_PROCESS, phase: "post", provides: { params: true, result: true } },
  { pep: PEP.WORKFLOW_INVOKE, phase: "pre", provides: { params: true, result: false } },
  { pep: PEP.WORKFLOW_POST_PROCESS, phase: "post", provides: { params: true, result: true } },
];
