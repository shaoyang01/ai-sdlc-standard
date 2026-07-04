// Fanout Feedback Types — Deterministic Closed-Loop
// ===================================================
// Pure data types. No logic, no inference, no AI.

import { RepoResult } from "../../fanout_engine/types/index";

export interface FanoutFeedbackInput {
  requirement_id: string;
  fanout_result: {
    repo_results: RepoResult[];
  };
}

export interface DocFlowValidationContext {
  requirement_id: string;
  validation_passed: boolean;
  repo_statuses: RepoStatusEntry[];
  updated_at: string;
}

export interface RepoStatusEntry {
  repo: string;
  status: "success" | "failed";
  output: Record<string, unknown>;
}

export type OverallStatus = "success" | "partial_success" | "failed";

export interface ValidationReport {
  requirement_id: string;
  overall_status: OverallStatus;
  repo_status_list: RepoStatusEntry[];
  raw_execution_summary: {
    total_repos: number;
    succeeded: number;
    failed: number;
  };
  completed_at: string;
}
