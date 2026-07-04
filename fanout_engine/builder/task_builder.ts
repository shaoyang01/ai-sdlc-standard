// Task Builder — Deterministic
// =============================
// Converts sub_requirements → ExecutionTasks.
// Pure data mapping. No logic, no inference.

import { FanoutInput, ExecutionTask } from "../types/index";

export function buildTasks(input: FanoutInput, agent: string = "codex"): ExecutionTask[] {
  return input.sub_requirements.map((sub, index) => ({
    task_id: `${input.requirement_id}-T${index + 1}`,
    requirement_id: input.requirement_id,
    repo: sub.repo,
    task: sub.task,
    dependency_type: sub.dependency_type,
    agent,
    created_at: new Date().toISOString(),
  }));
}
