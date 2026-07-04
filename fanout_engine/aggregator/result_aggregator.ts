// Result Aggregator — Deterministic
// ===================================
// Groups TaskResults by repo into FanoutResult.
// Pure aggregation. No transformation. No interpretation.

import { TaskResult, RepoResult, FanoutResult } from "../types/index";

export function aggregateResults(
  requirementId: string,
  results: TaskResult[]
): FanoutResult {
  // Group by repo — deterministic grouping
  const byRepo = new Map<string, TaskResult[]>();
  for (const result of results) {
    const group = byRepo.get(result.repo) || [];
    group.push(result);
    byRepo.set(result.repo, group);
  }

  // Build repo results — pure grouping, no transformation
  const repoResults: RepoResult[] = [];
  for (const [repo, tasks] of byRepo) {
    const allSucceeded = tasks.every((t) => t.status === "success");
    repoResults.push({
      repo,
      status: allSucceeded ? "success" : "failed",
      output: {
        tasks_completed: tasks.length,
        task_ids: tasks.map((t) => t.task_id),
      },
      task_count: tasks.length,
    });
  }

  const succeeded = results.filter((r) => r.status === "success").length;

  return {
    requirement_id: requirementId,
    repo_results: repoResults,
    total_tasks: results.length,
    succeeded,
    failed: results.length - succeeded,
    completed_at: new Date().toISOString(),
  };
}
