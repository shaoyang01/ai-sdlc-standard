// Implementation Node — PURE STATE MACHINE
// ========================================
// Records implementation metadata ONLY.
// Does NOT decide whether to proceed — that is LOOP's responsibility.
// Implementation mode is OUTPUT FIELD only, not a decision.

import { DocFlowNode, DocFlowContext, StageRecord, ImplementationOutput } from "../../types/index";

export class ImplementationNode implements DocFlowNode {
  name = "implementation";

  async execute(context: DocFlowContext): Promise<DocFlowContext> {
    const startedAt = new Date().toISOString();

    const output: ImplementationOutput = {
      requirement_id: context.requirement_id,
      files_changed: (context.metadata?.files_changed as string[]) || [],
      summary: "Implementation record.",
      // PURE OUTPUT FIELD — mode is metadata, not a decision
      implementation_mode: (context.metadata?.implementation_mode as string) || "direct",
      verification_steps: ["Run existing tests.", "Verify changed modules."],
      implemented_at: startedAt,
    };

    const record: StageRecord = {
      stage: this.name,
      status: "completed",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      output: output as unknown as Record<string, unknown>,
      error: null,
    };

    context.artifacts[this.name] = output;
    context.current_stage = this.name;
    context.history.push(record);
    context.updated_at = record.completed_at!;
    return context;
  }
}
