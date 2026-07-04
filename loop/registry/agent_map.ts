// LOOP Agent Map — Static Agent Assignment
// =========================================
// FIXED mapping from DocFlow node to execution agent.
// NO dynamic selection, NO capability scoring, NO learning.
// This is the ONLY decision: which agent runs which node.

import { AgentMapEntry, LoopAgent } from "../types/index";

export const AGENT_MAP: AgentMapEntry[] = [
  { node: "requirement-summary", agent: "kimi" },
  { node: "tech-design",        agent: "kimi" },
  { node: "review",             agent: "kimi" },
  { node: "implementation",     agent: "codex" },
  { node: "validation",         agent: "kimi" },
];

// Get agent for a node — deterministic lookup
export function getAgent(node: string): LoopAgent {
  const entry = AGENT_MAP.find((e) => e.node === node);
  return entry?.agent ?? "kimi"; // conservative default
}
