// Node Artifacts — Deterministic Output Conversion
// =================================================
// Converts node outputs into standardized Artifact array.
// Pure function. No side effects.

import { Artifact, ArtifactType, createArtifact } from "./artifact";

const NODE_TYPE_MAP: Record<string, ArtifactType> = {
  "requirement-summary": "requirement_summary",
  "tech-design": "tech_design",
  "review": "solution_review",
  "implementation": "implementation_plan",
  "validation": "validation_report",
};

export function artifactsFromNodeOutput(input: {
  requirementId: string;
  node: string;
  agent?: string;
  output: Record<string, unknown>;
}): Artifact[] {
  // If output already contains artifacts from Execution Gateway, return them
  if (Array.isArray(input.output["artifacts"])) {
    return input.output["artifacts"] as Artifact[];
  }

  // Otherwise create a runtime artifact from node output
  const type = NODE_TYPE_MAP[input.node] || "shadow_output";
  const artifact = createArtifact({
    requirementId: input.requirementId,
    node: input.node,
    type,
    content: input.output,
    agent: input.agent,
    source: "runtime",
  });

  return [artifact];
}
