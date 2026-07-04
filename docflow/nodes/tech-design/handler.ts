// Tech Design Node
// ================
// Generates a structured tech design from requirement summary.

import { DocFlowNode, DocFlowContext, StageRecord, TechDesignOutput } from "../../types/index";

export class TechDesignNode implements DocFlowNode {
  name = "tech-design";

  async execute(context: DocFlowContext): Promise<DocFlowContext> {
    const startedAt = new Date().toISOString();
    const summary = context.artifacts["requirement-summary"] as Record<string, unknown> | undefined;

    const output: TechDesignOutput = {
      requirement_id: context.requirement_id,
      approach: summary ? `Implement ${summary.main_repo || "unknown"} changes based on parsed requirement.` : "No requirement summary available.",
      modules_affected: this.detectModules(summary),
      data_changes: this.detectDataChanges(summary),
      api_changes: this.detectApiChanges(summary),
      risks: this.detectRisks(summary),
      created_at: startedAt,
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

  private detectModules(summary?: Record<string, unknown>): string[] {
    if (!summary) return ["unknown"];
    const subs = (summary.sub_requirements as Array<Record<string, unknown>>) || [];
    return subs.length > 0 ? subs.map((s) => String(s.repo || "unknown")) : ["unknown"];
  }

  private detectDataChanges(summary?: Record<string, unknown>): string[] {
    if (!summary) return [];
    const subs = (summary.sub_requirements as Array<Record<string, unknown>>) || [];
    return subs.filter((s) => s.dependency_type === "data").map((s) => String(s.description || ""));
  }

  private detectApiChanges(summary?: Record<string, unknown>): string[] {
    if (!summary) return [];
    const subs = (summary.sub_requirements as Array<Record<string, unknown>>) || [];
    return subs.filter((s) => s.dependency_type === "api").map((s) => String(s.description || ""));
  }

  private detectRisks(summary?: Record<string, unknown>): string[] {
    const risks: string[] = [];
    if (summary?.multi_repo) risks.push("Multi-repo execution risk: cross-repo contract alignment required.");
    if (summary?.complexity_hint === "high") risks.push("High complexity: consider staged rollout.");
    return risks.length > 0 ? risks : ["No significant risks identified at design stage."];
  }
}
