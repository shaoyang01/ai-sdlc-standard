// Adoption Types — Controlled Change Gateway
// ===========================================
// Pure data types. Rule-based, no AI inference.

export type ChangeTarget = "docflow" | "loop" | "speckit" | "fanout";
export type ChangeSeverity = "low" | "medium" | "high";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type AdoptionStatus = "approved" | "rejected" | "pending";

export interface EvolutionProposal {
  type: ChangeTarget;
  severity: ChangeSeverity;
  description: string;
  suggested_change: Record<string, unknown>;
}

export interface ChangeClassification {
  type: ChangeTarget;
  category: "config" | "structural" | "execution";
}

export interface RiskAssessment {
  risk_level: RiskLevel;
  reason: string;
}

export interface ValidationResult {
  passed: boolean;
  decision: AdoptionStatus;
  reason: string;
}

export interface AdoptionResult {
  proposal_id: string;
  status: AdoptionStatus;
  risk_level: RiskLevel;
  applied_changes: Record<string, unknown>[];
  change_log: string[];
  processed_at: string;
}
