// Evolution Listener — Intake
// =============================
// Receives proposals from Evolution Layer (read-only source).
// Pure pass-through. No interpretation.

import { EvolutionProposal } from "../types/index";

export function receiveProposal(proposal: EvolutionProposal): EvolutionProposal {
  return { ...proposal }; // pure pass-through copy
}
