// SDLC Graph Transitions — State Machine + Feedback Loop
// =======================================================
// Context-aware transition engine with conditional routing.
// Supports review PASS/FAIL → re-route. Retry limit enforced.
// Fully deterministic. Pure functions. No randomness.

import { NodeType } from "./types";
import { SDLC_EDGES } from "./graph";

const MAX_LOOP_DEPTH = 3;

// Context-aware: accepts review result for conditional routing
export function getNextNode(
  current: NodeType,
  nodeResult?: Record<string, unknown>,
  retryCount: number = 0
): NodeType | null {
  // ─── Solution-challenge: self-contained cycle routing ──
  // Reads solution_challenge state from node output.
  if (current === "solution-challenge" && nodeResult) {
    const challengeResult = nodeResult["result"] as string | undefined;
    const state = nodeResult["solution_challenge"] as Record<string, unknown> | undefined;
    const exhausted = state?.exhausted === true;

    if (challengeResult === "FAIL" && !exhausted) {
      return "tech-design";
    }
    if (challengeResult === "FAIL" && exhausted) {
      return "review";
    }
    // PASS → fall through to edge
  }

  // ─── Review: conditional PASS/FAIL routing ─────────────
  if (current === "review" && nodeResult) {
    const reviewResult = nodeResult["result"] as string | undefined;

    if (reviewResult === "FAIL" && retryCount < MAX_LOOP_DEPTH) {
      return "tech-design";  // feedback loop: re-design
    }
    if (reviewResult === "FAIL" && retryCount >= MAX_LOOP_DEPTH) {
      return "validation";   // force terminal after max retries
    }
    // PASS → fall through to default
  }

  // ─── Default: linear forward lookup ────────────────────
  const edges = SDLC_EDGES.filter((e) => e.from === current);

  // Prefer unconditional edge (no condition field)
  const unconditional = edges.find((e) => !e.condition);
  if (unconditional) return unconditional.to;

  // Use conditional PASS edge as default fallback
  const passEdge = edges.find((e) => e.condition === "PASS");
  if (passEdge) return passEdge.to;

  return null; // terminal
}

// Terminal check — delegates to getNextNode
export function isTerminal(node: NodeType): boolean {
  return getNextNode(node) === null;
}

// Validates a single step
export function isValidTransition(
  from: NodeType,
  to: NodeType,
  result?: Record<string, unknown>
): boolean {
  return getNextNode(from, result) === to;
}

// Ordered path for PASS-only flow
export function getTransitionPath(): NodeType[] {
  const path: NodeType[] = ["requirement-summary"];
  let current: NodeType = "requirement-summary";
  while (true) {
    const next = getNextNode(current, { result: "PASS" });
    if (!next) break;
    path.push(next);
    current = next;
  }
  return path;
}
