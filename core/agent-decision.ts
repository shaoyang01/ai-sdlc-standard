// Agent Decision Layer
// =====================
// Context-aware agent selection. Always returns null to fallback
// to AGENT_MAP unless complexity/context warrants an override.
// ZERO breaking change — AGENT_MAP is always the primary authority.

import { ExecutionContext } from "./execution-context";

export function selectAgent(
  node: string,
  ctx: ExecutionContext
): string | null {
  const complexity = ctx.metadata?.complexity;

  if (complexity === "low") return "kimi";
  if (complexity === "high") return "codex";

  // null = fallback to static AGENT_MAP (primary authority)
  return null;
}
