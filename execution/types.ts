// Execution Types — Stable Gateway Contracts
// ===========================================
// Generic enough for future real agents.
// No Git / PR / branch / commit fields.
// No target repository write operations.

import { Artifact } from "../core/artifact";

export type AgentName = "kimi" | "codex" | "hermes";

export type ExecutionRequestType =
  | "llm_task"
  | "code_generation"
  | "review"
  | "validation";

export type ExecutionRequest = Readonly<{
  type: ExecutionRequestType;
  node: string;
  agent: AgentName;
  requirementId: string;
  input: Record<string, unknown>;
  metadata?: Readonly<Record<string, unknown>>;
}>;

export type ExecutionArtifactType =
  | "requirement_summary"
  | "tech_design"
  | "solution_review"
  | "code_patch"
  | "code_review"
  | "bugfix_patch"
  | "validation_report"
  | "shadow_output";

export type ExecutionArtifact = Artifact;

export type ExecutionResult = Readonly<{
  success: boolean;
  node: string;
  agent: AgentName;
  output: Record<string, unknown>;
  artifacts: ReadonlyArray<ExecutionArtifact>;
  error?: string;
}>;
