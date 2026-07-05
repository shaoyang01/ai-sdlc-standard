// Artifact Model — Standardized Node Outputs
// ==========================================
// Unified artifact contract for all SDLC nodes.
// Stable format for downstream consumption (code-review, bugfix, learning).

export type ArtifactType =
  | "requirement_summary"
  | "requirement_breakdown"
  | "tech_design"
  | "solution_review"
  | "implementation_plan"
  | "code_patch"
  | "code_review"
  | "bugfix_patch"
  | "validation_report"
  | "fanout_result"
  | "shadow_output";

export type Artifact = Readonly<{
  id: string;
  requirementId: string;
  node: string;
  type: ArtifactType;
  content: Record<string, unknown>;
  metadata: Readonly<{
    agent?: string;
    createdAt: string;
    source: "runtime" | "execution_gateway" | "fanout" | "validation";
  }>;
}>;

let artifactIndex = 0;

export function createArtifact(input: {
  requirementId: string;
  node: string;
  type: ArtifactType;
  content: Record<string, unknown>;
  agent?: string;
  source: "runtime" | "execution_gateway" | "fanout" | "validation";
  id?: string;
}): Artifact {
  const index = ++artifactIndex;
  return {
    id: input.id || `${input.requirementId}:${input.node}:${input.type}:${index}`,
    requirementId: input.requirementId,
    node: input.node,
    type: input.type,
    content: input.content,
    metadata: {
      agent: input.agent,
      createdAt: new Date().toISOString(),
      source: input.source,
    },
  };
}
