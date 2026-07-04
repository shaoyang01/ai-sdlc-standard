// Fanout Engine — Deterministic Multi-Repo Parallel Execution
// ===========================================================
// Receives structured sub-requirements → builds tasks → executes
// in parallel → aggregates results.
// ZERO intelligence, ZERO inference, ZERO routing decisions.
//
// Pipeline:
//   FanoutInput → buildTasks → executeParallel → aggregateResults → FanoutResult

import { FanoutInput, FanoutResult } from "../types/index";
import { buildTasks } from "../builder/task_builder";
import { executeParallel } from "../executor/parallel_executor";
import { aggregateResults } from "../aggregator/result_aggregator";

export class FanoutEngine {
  // Execute full fanout pipeline — deterministic
  async execute(input: FanoutInput, agent: string = "codex"): Promise<FanoutResult> {
    // 1. Build tasks from sub_requirements
    const tasks = buildTasks(input, agent);

    // 2. Execute ALL tasks in parallel
    const results = await executeParallel(tasks);

    // 3. Aggregate results by repo
    return aggregateResults(input.requirement_id, results);
  }
}

// Convenience function
export async function runFanout(input: FanoutInput, agent?: string): Promise<FanoutResult> {
  const engine = new FanoutEngine();
  return engine.execute(input, agent);
}
