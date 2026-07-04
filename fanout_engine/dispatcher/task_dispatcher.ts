// Task Dispatcher — Deterministic
// ================================
// Passes tasks to execution layer without modification.
// No logic, no routing, no agent selection.

import { ExecutionTask, TaskResult } from "../types/index";

export async function dispatchTask(task: ExecutionTask): Promise<TaskResult> {
  // Deterministic dispatch: each task executes independently.
  // In production, this would invoke the actual agent per repo.
  // Shadow mode: simulate execution with structured output.
  return simulateExecution(task);
}

async function simulateExecution(task: ExecutionTask): Promise<TaskResult> {
  // Pure deterministic simulation — no randomness, no inference
  return {
    task_id: task.task_id,
    repo: task.repo,
    status: "success",
    output: {
      repo: task.repo,
      task: task.task,
      result: `${task.repo}_task_completed`,
      agent: task.agent,
    },
    error: null,
    executed_at: new Date().toISOString(),
    agent: task.agent,
  };
}
