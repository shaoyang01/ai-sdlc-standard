// Tech Design Node — PURE STATE MACHINE
// ======================================
// Records design metadata from requirement summary.
// Does NOT make decisions, evaluate quality, or select strategy.
// PURE data transformation.

import { DocFlowNode, DocFlowContext, StageRecord, TechDesignOutput } from "../../types/index";

export class TechDesignNode implements DocFlowNode {
  name = "tech-design";

  async execute(context: DocFlowContext): Promise<DocFlowContext> {
    const startedAt = new Date().toISOString();
    const summary = context.artifacts["requirement-summary"] as Record<string, unknown> | undefined;

    const output: TechDesignOutput = {
      requirement_id: context.requirement_id,
      approach: summary ? `Design for ${summary.main_repo || "unknown"}.` : "No requirement summary available.",
      modules_affected: summary ? this.listModules(summary) : [],
      data_changes: summary ? this.listDataChanges(summary) : [],
      api_changes: summary ? this.listApiChanges(summary) : [],
      risks: [],
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

  private listModules(summary: Record<string, unknown>): string[] {
    const subs = (summary.sub_requirements as Array<Record<string, unknown>>) || [];
    return subs.length > 0 ? subs.map((s) => String(s.repo || "unknown")) : [];
  }

  private listDataChanges(_summary: Record<string, unknown>): string[] {
    return []; // No inference — data changes come from metadata, not DocFlow
  }

  private listApiChanges(_summary: Record<string, unknown>): string[] {
    return []; // No inference — API changes come from metadata, not DocFlow
  }
}
