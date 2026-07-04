// SDLC Graph Transitions — Deterministic Decision Layer
// ======================================================
// Pure transition engine. Depends on graph DATA only (SDLC_EDGES).
// NO runtime dependencies. NO context logic. NO execution.
// This is the ONLY layer that decides "what comes next".

import { NodeType } from "./types";
import { SDLC_EDGES } from "./graph";

// Deterministic: same input → same output, every time
export function getNextNode(current: NodeType): NodeType | null {
  const edge = SDLC_EDGES.find((e) => e.from === current);
  return edge?.to ?? null;
}

// Terminal check — delegates to getNextNode (no direct graph access)
export function isTerminal(node: NodeType): boolean {
  return getNextNode(node) === null;
}

// Validates a single step is allowed by the graph
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
