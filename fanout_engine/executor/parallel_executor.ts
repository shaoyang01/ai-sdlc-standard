// Parallel Executor — Deterministic
// ===================================
// Executes ALL tasks concurrently using Promise.all.
// No sequential fallback. No branching. No logic.
// All tasks MUST execute in parallel — this is the only behavior.

import { ExecutionTask, TaskResult } from "../types/index";
import { dispatchTask } from "../dispatcher/task_dispatcher";

export async function executeParallel(tasks: ExecutionTask[]): Promise<TaskResult[]> {
  if (tasks.length === 0) return [];

  // ALL tasks execute in parallel — no conditions, no exceptions
  const promises = tasks.map((task) => dispatchTask(task));
  return Promise.all(promises);
}
