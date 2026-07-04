// Validation Report Builder — Deterministic
// ===========================================
// Generates structured validation report from repo statuses.
// Pure data transformation. NO semantic analysis.
//
// overall_status rules (deterministic):
// - all success → "success"
// - some failed, some succeeded → "partial_success"
// - all failed → "failed"

import { RepoStatusEntry, OverallStatus, ValidationReport } from "../types/index";

export function buildValidationReport(
  requirementId: string,
  repoStatuses: RepoStatusEntry[]
): ValidationReport {
  const succeeded = repoStatuses.filter((r) => r.status === "success").length;
  const failed = repoStatuses.length - succeeded;

  let overallStatus: OverallStatus;
  if (failed === 0) {
    overallStatus = "success";
  } else if (succeeded > 0) {
    overallStatus = "partial_success";
  } else {
    overallStatus = "failed";
  }

  return {
    requirement_id: requirementId,
    overall_status: overallStatus,
    repo_status_list: repoStatuses,
    raw_execution_summary: {
      total_repos: repoStatuses.length,
      succeeded,
      failed,
    },
    completed_at: new Date().toISOString(),
  };
}
