// LOOP Node Router — Deterministic
// ================================
// Routes to next node using STATIC flow table ONLY.
// No logic branches, no conditions.

import { getNextNode, isTerminal } from "../registry/node_map";

export function routeNextNode(currentNode: string): string | null {
  return getNextNode(currentNode);
}

export function isPipelineComplete(currentNode: string): boolean {
  return isTerminal(currentNode);
}
