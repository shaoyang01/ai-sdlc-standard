// Change Validator — Deterministic Rule-Based Gate
// ==================================================
// Risk evaluation and approval decision.
// PURELY rule-based. NO inference. NO AI.

import { EvolutionProposal, RiskAssessment, ValidationResult, AdoptionStatus } from "../types/index";

// Risk evaluation — RULE-BASED ONLY
export function evaluateRisk(proposal: EvolutionProposal): RiskAssessment {
  const riskMap: Record<string, { level: RiskAssessment["risk_level"]; reason: string }> = {
    loop:    { level: "critical", reason: "LOOP changes affect core execution routing. Critical risk." },
    docflow: { level: "high",     reason: "DocFlow changes affect workflow structure. High risk." },
    specit: { level: "medium",    reason: "Speckit changes affect implementation methods. Medium risk." },
    fanout:  { level: "low",      reason: "Fanout changes affect parallel execution config. Low risk." },
  };

  const risk = riskMap[proposal.type] || { level: "medium", reason: "Unknown change type. Defaulting to medium risk." };

  return { risk_level: risk.level, reason: risk.reason };
}

// Validation gate — DETERMINISTIC decision
export function validateChange(risk: RiskAssessment): ValidationResult {
  let decision: AdoptionStatus;
  let reason: string;

  switch (risk.risk_level) {
    case "critical":
      decision = "pending";
      reason = "Critical risk. Manual approval required before application.";
      break;
    case "high":
      decision = "pending";
      reason = "High risk. Validation step required before application.";
      break;
    case "medium":
      decision = "approved";
      reason = "Medium risk. Allowed with staged rollout.";
      break;
    case "low":
      decision = "approved";
      reason = "Low risk. Auto-approved for application.";
      break;
    default:
      decision = "pending";
      reason = "Unknown risk level. Defaulting to pending.";
  }

  return { passed: decision === "approved", decision, reason };
}
