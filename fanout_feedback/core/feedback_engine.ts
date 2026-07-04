// Feedback Engine — Deterministic Closed-Loop
// ============================================
// Pipeline: collect results → map to DocFlow → build validation report.
// ZERO intelligence, ZERO inference, ZERO semantic analysis.
//
// Fanout Results → Feedback Engine → DocFlow Validation Node → Report

import { FanoutFeedbackInput, DocFlowValidationContext, ValidationReport } from "../types/index";
import { collectResults } from "../collector/result_collector";
import { mapToDocFlow } from "../mapper/docflow_mapper";
import { buildValidationReport } from "../builder/validation_report_builder";

export class FeedbackEngine {
  // Execute full feedback pipeline — deterministic
  execute(input: FanoutFeedbackInput): {
    docflow_context: DocFlowValidationContext;
    report: ValidationReport;
  } {
    // 1. Collect results — pass-through, no modification
    const statuses = collectResults(input);

    // 2. Map to DocFlow validation context — deterministic
    const docflowContext = mapToDocFlow(input.requirement_id, statuses);

    // 3. Build validation report — deterministic
    const report = buildValidationReport(input.requirement_id, statuses);

    return { docflow_context: docflowContext, report };
  }
}

export function runFeedback(input: FanoutFeedbackInput) {
  const engine = new FeedbackEngine();
  return engine.execute(input);
}
