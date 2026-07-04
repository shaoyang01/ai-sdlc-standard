// Result Collector — Deterministic
// =================================
// Collects Fanout execution outputs WITHOUT modification.
// Pure pass-through. No interpretation. No inference.

import { FanoutFeedbackInput, RepoStatusEntry } from "../types/index";

export function collectResults(input: FanoutFeedbackInput): RepoStatusEntry[] {
  const repoResults = input.fanout_result.repo_results || [];
  return repoResults.map((r) => ({
    repo: r.repo,
    status: r.status,
    output: r.output || {},
  }));
}
