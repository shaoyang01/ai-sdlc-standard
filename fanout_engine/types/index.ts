// Fanout Engine Types — Deterministic Parallel Execution
// ======================================================
// Pure data types. No logic, no inference, no routing.

// Input from DocFlow via LOOP — DO NOT modify or reinterpret
export interface FanoutInput {
  requirement_id: string;
  multi_repo: boolean;
  main_repo: string;
  sub_requirements: SubRequirement[];
}

export interface SubRequirement {
  repo: string;
  task: string;
  dependency_type: "api" | "data" | "event" | "unknown";
}

// Execution task — built deterministically from sub_requirements
export interface ExecutionTask {
  task_id: string;
  requirement_id: string;
  repo: string;
  task: string;
  dependency_type: string;
  agent: string;
  created_at: string;
}

// Result from a single task execution
export interface TaskResult {
  task_id: string;
  repo: string;
  status: "success" | "failed";
  output: Record<string, unknown>;
  error: string | null;
  executed_at: string;
  agent: string;
}

// Aggregated result grouped by repo
export interface RepoResult {
  repo: string;
  status: "success" | "failed";
  output: Record<string, unknown>;
  task_count: number;
}

// Final fanout output
export interface FanoutResult {
  requirement_id: string;
  repo_results: RepoResult[];
  total_tasks: number;
  succeeded: number;
  failed: number;
  completed_at: string;
}
