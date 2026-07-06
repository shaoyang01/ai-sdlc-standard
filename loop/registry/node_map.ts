// LOOP Node Map — Static Flow Table
// =================================
// Defines the FIXED execution sequence.
// NO dynamic routing, NO branching, NO decision logic.
// This is the ONLY source of truth for node ordering.

import { DocFlowNode, FlowTableEntry } from "../types/index";

export const NODE_FLOW_TABLE: FlowTableEntry[] = [
  { current: "requirement-summary", next: "tech-design" },
  { current: "tech-design",           next: "review" },
  { current: "review",                next: "implementation" },
  { current: "implementation",        next: "validation" },
  { current: "validation",            next: null },             // terminal
];

// Get next node — deterministic lookup
export function getNextNode(current: DocFlowNode): DocFlowNode | null {
  const entry = NODE_FLOW_TABLE.find((e) => e.current === current);
  return entry?.next ?? null;
}

// Get all nodes in order
export function getAllNodes(): DocFlowNode[] {
  return NODE_FLOW_TABLE.map((e) => e.current);
}

// Check if node is the first in the flow
export function isFirstNode(node: DocFlowNode): boolean {
  return NODE_FLOW_TABLE.length > 0 && NODE_FLOW_TABLE[0].current === node;
}

// Check if node is terminal
export function isTerminal(node: DocFlowNode): boolean {
  const entry = NODE_FLOW_TABLE.find((e) => e.current === node);
  return entry?.next === null;
}
