// Artifact Model — Standardized Node Outputs
// ==========================================
// Unified artifact contract for all SDLC nodes.
// No hidden global state. All inputs explicit.

export type ArtifactType =
  | "requirement_summary"
  | "requirement_breakdown"
  | "tech_design"
  | "solution_challenge"
  | "solution_review"
  | "implementation_plan"
  | "code_patch"
  | "code_review"
  | "bugfix_patch"
  | "validation_report"
  | "fanout_result"
  | "shadow_output"
  // v2 canonical capability artifact types (C02-WP3.5, A4)
  | "technical_design"
  | "task_plan"
  | "implementation_record"
  | "review_summary"
  | "knowledge_sync_result";

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

// Pure factory — no hidden state. All inputs explicit.
export function createArtifact(input: {
  requirementId: string;
  node: string;
  type: ArtifactType;
  content: Record<string, unknown>;
  agent?: string;
  source: "runtime" | "execution_gateway" | "fanout" | "validation";
  id: string;
  createdAt?: string;
}): Artifact {
  return {
    id: input.id,
    requirementId: input.requirementId,
    node: input.node,
    type: input.type,
    content: input.content,
    metadata: {
      agent: input.agent,
      createdAt: input.createdAt || new Date().toISOString(),
      source: input.source,
    },
  };
}
