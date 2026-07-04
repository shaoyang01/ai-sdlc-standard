// DocFlow Types
// =============
// Core type definitions for the DocFlow system.

// Requirement summary output
export interface RequirementSummaryOutput {
  requirement_id: string;
  multi_repo: boolean;
  main_repo: string;
  sub_requirements: SubRequirement[];
  raw_text: string;
  parsed_at: string;
}

export interface SubRequirement {
  repo: string;
  description: string;
}

// DocFlow node interface — PURE, no decision logic

// DocFlow node interface
export interface DocFlowNode {
  name: string;
  execute(input: DocFlowContext): Promise<DocFlowContext>;
}

// Context passed between nodes
export interface DocFlowContext {
  requirement_id: string;
  raw_text: string;
  metadata: Record<string, unknown>;
  artifacts: Record<string, unknown>;
  current_stage: string;
  history: StageRecord[];
  created_at: string;
  updated_at: string;
}

export interface StageRecord {
  stage: string;
  status: "pending" | "running" | "completed" | "failed";
  started_at: string;
  completed_at: string | null;
  output: Record<string, unknown> | null;
  error: string | null;
}

// Tech design output
export interface TechDesignOutput {
  requirement_id: string;
  approach: string;
  modules_affected: string[];
  data_changes: string[];
  api_changes: string[];
  risks: string[];
  created_at: string;
}

// Review output
export interface ReviewOutput {
  requirement_id: string;
  result: "PASS" | "FAIL" | "PASS_WITH_RISK";
  issues: ReviewIssue[];
  recommendations: string[];
  reviewed_at: string;
}

export interface ReviewIssue {
  severity: "low" | "medium" | "high" | "critical";
  category: string;
  description: string;
}

// Implementation output
export interface ImplementationOutput {
  requirement_id: string;
  implementation_mode: string;
  files_changed: string[];
  summary: string;
  verification_steps: string[];
  implemented_at: string;
}

// Validation output
export interface ValidationOutput {
  requirement_id: string;
  passed: boolean;
  checks: ValidationCheck[];
  validated_at: string;
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  detail: string;
}

// Engine configuration
export interface DocFlowConfig {
  nodes: DocFlowNode[];
  strict_mode: boolean;
  timeout_ms: number;
}
