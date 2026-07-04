// Review Node — PURE STATE MACHINE
// ================================
// Records review result. Does NOT decide what happens next.
// PASS / FAIL / PASS_WITH_RISK are output values only.
// The decision about whether to proceed belongs to LOOP.

import { DocFlowNode, DocFlowContext, StageRecord, ReviewOutput } from "../../types/index";

export class ReviewNode implements DocFlowNode {
  name = "review";

  async execute(context: DocFlowContext): Promise<DocFlowContext> {
    const startedAt = new Date().toISOString();

    const output: ReviewOutput = {
      requirement_id: context.requirement_id,
      result: (context.metadata?.review_result as ReviewOutput["result"]) || "PASS",
      issues: (context.metadata?.review_issues as ReviewOutput["issues"]) || [],
      recommendations: [],
      reviewed_at: startedAt,
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
