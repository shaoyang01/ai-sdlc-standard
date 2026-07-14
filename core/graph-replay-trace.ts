// Canonical Graph Replay Trace
// ==============================
// Immutable, deterministic trace of the graph execution used for replay.
// Each event is a structurally-compatible superset of ExecutionTraceItem so
// the same object can be stored in ExecutionContext.trace and VM history.

import { NodeType } from "../sdlc_graph/types";
import type { ExecutionTraceItem } from "./execution-trace";

export type RequirementSummaryMode = "deterministic" | "kimi_gateway";
export type SolutionChallengeMode = "disabled" | "shadow" | "gateway_shadow";

export interface GraphRunConfig {
  requirementSummaryMode: RequirementSummaryMode;
  solutionChallengeMode: SolutionChallengeMode;
}

export type GraphReplayEventKind = "node_executed" | "node_skipped";

export interface GraphReplayEvent extends ExecutionTraceItem {
  eventId: string;
  sequence: number;
  kind: GraphReplayEventKind;
  skipReason?: string;
}

export interface GraphReplayTrace {
  executionId: string;
  runConfig: GraphRunConfig;
  events: GraphReplayEvent[];
}

export function createGraphRunConfig(options?: {
  requirementSummaryMode?: RequirementSummaryMode;
  solutionChallengeMode?: SolutionChallengeMode;
}): GraphRunConfig {
  return {
    requirementSummaryMode: options?.requirementSummaryMode ?? "deterministic",
    solutionChallengeMode: options?.solutionChallengeMode ?? "disabled",
  };
}

export function createExecutedEvent(
  executionId: string,
  sequence: number,
  node: NodeType,
  agent: string | undefined,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  timestamp?: number
): GraphReplayEvent {
  return {
    eventId: `${executionId}:${sequence}`,
    sequence,
    kind: "node_executed",
    node,
    agent,
    input: { ...input },
    output: { ...output },
    timestamp: timestamp ?? Date.now(),
  };
}

export function createSkippedEvent(
  executionId: string,
  sequence: number,
  node: NodeType,
  agent: string | undefined,
  input: Record<string, unknown>,
  skipReason: string,
  output: Record<string, unknown>,
  timestamp?: number
): GraphReplayEvent {
  return {
    eventId: `${executionId}:${sequence}`,
    sequence,
    kind: "node_skipped",
    node,
    agent,
    input: { ...input },
    output: { ...output },
    timestamp: timestamp ?? Date.now(),
    skipReason,
  };
}
