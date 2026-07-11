// Execution Context Standard
// ===========================
// Unified context object passed through the SDLC runtime.
// PURELY STRUCTURAL. No behavior change.

import { NodeType } from "../sdlc_graph/types";
import type { ExecutionTraceItem } from "./execution-trace";
import type { SolutionChallengeState } from "./solution-challenge-state";

export type ExecutionContext = {
  node: NodeType;

  input: Record<string, unknown>;
  output?: Record<string, unknown>;

  metadata: {
    requirementId?: string;
    complexity?: "low" | "medium" | "high";
    estimatedCost?: number;
    solutionChallenge?: SolutionChallengeState;
  };

  trace: ExecutionTraceItem[];
};
