// Implementation Node — marks implementation as done, records files.
import { DocFlowNode, DocFlowContext, StageRecord, ImplementationOutput } from "../../types/index";

export class ImplementationNode implements DocFlowNode {
  name = "implementation";

  async execute(context: DocFlowContext): Promise<DocFlowContext> {
    const review = context.artifacts["review"] as Record<string, unknown> | undefined;
    if (review?.result === "FAIL") {
      throw new Error(`Implementation blocked: review result is FAIL. Fix issues before implementing.`);
    }

    const startedAt = new Date().toISOString();
    const output: ImplementationOutput = {
      requirement_id: context.requirement_id,
      files_changed: context.metadata?.files_changed as string[] || [],
      summary: "Implementation completed per tech design.",
      verification_steps: ["Run existing tests.", "Verify changed modules.", "Update entry coverage if needed."],
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
