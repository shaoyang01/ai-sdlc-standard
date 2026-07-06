// LOOP Node Router — Deterministic
// ================================
// Routes to next node using STATIC flow table ONLY.
// No logic branches, no conditions.

import { getNextNode, isTerminal } from "../registry/node_map";
import type { DocFlowNode } from "../types/index";

export function routeNextNode(currentNode: DocFlowNode): DocFlowNode | null {
  return getNextNode(currentNode);
}

export function isPipelineComplete(currentNode: DocFlowNode): boolean {
  return isTerminal(currentNode);
}
