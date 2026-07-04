// Validation Node — final quality gate.
import { DocFlowNode, DocFlowContext, StageRecord, ValidationOutput } from "../../types/index";

export class ValidationNode implements DocFlowNode {
  name = "validation";

  async execute(context: DocFlowContext): Promise<DocFlowContext> {
    const startedAt = new Date().toISOString();

    const checks = this.runChecks(context);
    const passed = checks.every((c) => c.passed);

    const output: ValidationOutput = {
      requirement_id: context.requirement_id,
      passed,
      checks,
      validated_at: startedAt,
    };

    const record: StageRecord = {
      stage: this.name,
      status: passed ? "completed" : "failed",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      output: output as unknown as Record<string, unknown>,
      error: passed ? null : "Validation failed: check details in output.",
    };

    context.artifacts[this.name] = output;
    context.current_stage = this.name;
    context.history.push(record);
    context.updated_at = record.completed_at!;
    return context;
  }

  private runChecks(context: DocFlowContext): ValidationOutput["checks"] {
    const checks: ValidationOutput["checks"] = [];

    // Check 1: All required artifacts present
    checks.push({
      name: "required_artifacts",
      passed: !!(context.artifacts["requirement-summary"] && context.artifacts["tech-design"] && context.artifacts["review"] && context.artifacts["implementation"]),
      detail: "All 4 required artifacts (summary, design, review, implementation) must be present.",
    });

    // Check 2: Review passed
    const review = context.artifacts["review"] as Record<string, unknown> | undefined;
    checks.push({
      name: "review_passed",
      passed: review?.result === "PASS" || review?.result === "PASS_WITH_RISK",
      detail: `Review result: ${review?.result || "missing"}.`,
    });

    // Check 3: Multi-repo contract check
    const summary = context.artifacts["requirement-summary"] as Record<string, unknown> | undefined;
    if (summary?.multi_repo) {
      const subReqs = (summary.sub_requirements as unknown[]) || [];
      checks.push({
        name: "multi_repo_contracts",
        passed: subReqs.length > 0,
        detail: `Multi-repo detected with ${subReqs.length} sub-requirements. Verify cross-repo contracts.`,
      });
    }

    return checks;
  }
}
