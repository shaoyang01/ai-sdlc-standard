// SDLC Graph Transitions — Deterministic
// =======================================
// Pure deterministic lookup. NO condition logic.
// getNextNode returns the next node or null (terminal).

import { NodeType } from "./types";
import { SDLC_EDGES } from "./graph";

// Deterministic: same input → same output, every time
export function getNextNode(current: NodeType): NodeType | null {
  const edge = SDLC_EDGES.find((e) => e.from === current);
  return edge?.to ?? null;
}

// Linear adjacency check — no cycles in SDLC graph
export function isValidTransition(from: NodeType, to: NodeType): boolean {
  return getNextNode(from) === to;
}

// Ordered node list — for sequential walkers
export function getTransitionPath(): NodeType[] {
  const path: NodeType[] = ["requirement-summary"];
  let current: NodeType = "requirement-summary";
  while (true) {
    const next = getNextNode(current);
    if (!next) break;
    path.push(next);
    current = next;
  }
  return path;
}
