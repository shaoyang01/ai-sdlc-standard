// Adoption Engine — Controlled Change Gateway
// ============================================
// Pipeline: intake → classify → evaluate risk → validate → apply.
// ONLY entrypoint for system modifications.
// Fully deterministic. Rule-based ONLY.

import { EvolutionProposal, AdoptionResult } from "../types/index";
import { receiveProposal } from "../intake/evolution_listener";
import { classifyChange } from "../classifier/change_classifier";
import { evaluateRisk, validateChange } from "../validator/change_validator";
import { applyChange } from "../executor/change_executor";

export class AdoptionEngine {
  // Full adoption pipeline — deterministic
  process(proposal: EvolutionProposal): AdoptionResult {
    const proposalId = `ADOPT-${Date.now()}`;

    // 1. Intake — receive from Evolution Layer
    const intake = receiveProposal(proposal);

    // 2. Classify change type
    classifyChange(intake);

    // 3. Evaluate risk — rule-based
    const risk = evaluateRisk(intake);

    // 4. Validate — deterministic gate
    const validation = validateChange(risk);

    // 5. Apply — only if approved
    return applyChange(intake, validation.decision, risk.risk_level, proposalId);
  }
}

export function runAdoption(proposal: EvolutionProposal): AdoptionResult {
  const engine = new AdoptionEngine();
  return engine.process(proposal);
}
