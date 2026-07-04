// Change Classifier — Deterministic
// ===================================
// Classifies change type. Rule-based ONLY. NO inference.

import { EvolutionProposal, ChangeClassification } from "../types/index";

export function classifyChange(proposal: EvolutionProposal): ChangeClassification {
  // Deterministic category mapping
  const categoryMap: Record<string, "config" | "structural" | "execution"> = {
    fanout: "config",
    speckt: "structural",
    docflow: "structural",
    loop: "execution",
  };

  return {
    type: proposal.type,
    category: categoryMap[proposal.type] || "config",
  };
}
