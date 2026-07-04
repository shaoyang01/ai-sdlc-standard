// Change Executor — Deterministic Apply
// =======================================
// Applies approved changes ONLY. Generates change log.
// NO decision logic — only executes if validation passed.

import { EvolutionProposal, AdoptionResult, AdoptionStatus, RiskLevel } from "../types/index";

export function applyChange(
  proposal: EvolutionProposal,
  status: AdoptionStatus,
  riskLevel: RiskLevel,
  proposalId: string
): AdoptionResult {
  const changeLog: string[] = [];
  const appliedChanges: Record<string, unknown>[] = [];

  if (status === "approved") {
    appliedChanges.push({
      type: proposal.type,
      description: proposal.description,
      change: proposal.suggested_change,
    });
    changeLog.push(`[${new Date().toISOString()}] APPLIED: ${proposal.type} change — ${proposal.description}`);
  } else {
    changeLog.push(`[${new Date().toISOString()}] ${status === "pending" ? "PENDING" : "REJECTED"}: ${proposal.type} change — ${proposal.description}`);
  }

  return {
    proposal_id: proposalId,
    status,
    risk_level: riskLevel,
    applied_changes: appliedChanges,
    change_log: changeLog,
    processed_at: new Date().toISOString(),
  };
}
