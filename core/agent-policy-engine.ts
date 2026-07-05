// Agent Policy Engine
// ====================
// Multi-factor scoring engine for agent selection.
// Deterministic pure function — no randomness, no AI.
// Complexity + node type + cost preference → weighted score.

import { ExecutionContext } from "./execution-context";

type AgentScore = { kimi: number; codex: number; hermes: number };

export function resolveAgentByPolicy(
  ctx: ExecutionContext,
  node: string
): string | null {
  const score: AgentScore = { kimi: 0, codex: 0, hermes: 0 };
  const complexity = ctx.metadata?.complexity;

  // ─── Complexity influence ──────────────────────────
  if (complexity === "low")      score.kimi += 3;
  if (complexity === "medium")   { score.kimi += 1; score.codex += 1; }
  if (complexity === "high")     score.codex += 3;

  // ─── Node type influence ───────────────────────────
  switch (node) {
    case "requirement-summary":
    case "tech-design":
      score.kimi += 2;
      break;
    case "review":
    case "implementation":
      score.codex += 2;
      break;
    case "validation":
      score.hermes += 2;
      break;
  }

  // ─── Cost preference bias ──────────────────────────
  score.kimi += 1;  // default preference for low-cost agent

  // ─── Return winner or null (fallback to AGENT_MAP) ──
  const maxAgent = maxScoreAgent(score);
  return maxAgent || null;
}

function maxScoreAgent(score: AgentScore): string | null {
  const entries = Object.entries(score) as [string, number][];
  entries.sort((a, b) => b[1] - a[1]);
  return entries.length > 0 ? entries[0][0] : null;
}
