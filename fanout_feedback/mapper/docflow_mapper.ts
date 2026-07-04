// DocFlow Mapper — Deterministic
// ================================
// Maps repo_results back to DocFlow validation node context.
// Deterministic rules ONLY. No interpretation of failure reasons.
//
// Rules:
// - success → success flag
// - failed → failure flag
// - no interpretation of failure reason

import { RepoStatusEntry, DocFlowValidationContext } from "../types/index";

export function mapToDocFlow(
  requirementId: string,
  repoStatuses: RepoStatusEntry[]
): DocFlowValidationContext {
  const allSucceeded = repoStatuses.every((r) => r.status === "success");

  return {
    requirement_id: requirementId,
    validation_passed: allSucceeded,
    repo_statuses: repoStatuses,
    updated_at: new Date().toISOString(),
  };
}
