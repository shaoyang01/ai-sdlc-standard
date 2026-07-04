// LOOP Agent Router — Deterministic
// =================================
// Routes to agent using STATIC agent map ONLY.
// No capability scoring, no performance history.

import { getAgent } from "../registry/agent_map";
import { LoopAgent } from "../types/index";

export function routeAgent(node: string): LoopAgent {
  return getAgent(node);
}
