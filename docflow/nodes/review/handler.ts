// Review Node — produces PASS / FAIL / PASS_WITH_RISK result.
import { DocFlowNode, DocFlowContext, StageRecord, ReviewOutput } from "../../types/index";

export class ReviewNode implements DocFlowNode {
  name = "review";

  async execute(context: DocFlowContext): Promise<DocFlowContext> {
    const startedAt = new Date().toISOString();
    const design = context.artifacts["tech-design"] as Record<string, unknown> | undefined;

    const issues = this.assessIssues(design);
    const result = this.determineResult(issues);

    const output: ReviewOutput = {
      requirement_id: context.requirement_id,
      result,
      issues,
      recommendations: this.buildRecommendations(issues, result),
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

  private assessIssues(design?: Record<string, unknown>): ReviewOutput["issues"] {
    const issues: ReviewOutput["issues"] = [];
    if (!design) {
      issues.push({ severity: "critical", category: "design", description: "No tech design available for review." });
      return issues;
    }
    const risks = (design.risks as string[]) || [];
    if (risks.some((r) => r.includes("Multi-repo"))) {
      issues.push({ severity: "high", category: "cross-repo", description: "Multi-repo risk detected. Contract alignment required before execution." });
    }
    if (risks.some((r) => r.includes("High complexity"))) {
      issues.push({ severity: "medium", category: "complexity", description: "High complexity. Consider breaking into smaller increments." });
    }
    return issues;
  }

  private determineResult(issues: ReviewOutput["issues"]): ReviewOutput["result"] {
    if (issues.some((i) => i.severity === "critical")) return "FAIL";
    if (issues.some((i) => i.severity === "high")) return "PASS_WITH_RISK";
    return "PASS";
  }

  private buildRecommendations(issues: ReviewOutput["issues"], result: string): string[] {
    if (result === "PASS") return ["Proceed to implementation."];
    return issues.map((i) => `[${i.severity}] ${i.category}: ${i.description}`);
  }
}
