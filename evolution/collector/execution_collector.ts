// Execution Collector — Read-Only
// =================================
// Collects structured runtime data from Fanout/Feedback/DocFlow.
// NO interpretation. NO modification. Pure collection.

import { ExecutionEvent, SystemMetrics, NodeMetrics, RepoMetrics, AgentMetrics } from "../types/index";

export function collectEvents(events: ExecutionEvent[]): ExecutionEvent[] {
  return [...events]; // pure pass-through copy
}

// Deterministic metrics aggregation
export function computeMetrics(events: ExecutionEvent[]): SystemMetrics {
  const total = events.length;
  const succeeded = events.filter((e) => e.status === "success").length;
  const failed = total - succeeded;

  const byNode: Record<string, NodeMetrics> = {};
  const byRepo: Record<string, RepoMetrics> = {};
  const byAgent: Record<string, AgentMetrics> = {};

  for (const e of events) {
    // By node
    byNode[e.node] = byNode[e.node] || { total: 0, succeeded: 0, failed: 0, success_rate: 0 };
    byNode[e.node].total++;
    if (e.status === "success") byNode[e.node].succeeded++; else byNode[e.node].failed++;
    byNode[e.node].success_rate = byNode[e.node].total > 0 ? byNode[e.node].succeeded / byNode[e.node].total : 0;

    // By repo
    byRepo[e.repo] = byRepo[e.repo] || { total: 0, succeeded: 0, failed: 0 };
    byRepo[e.repo].total++;
    if (e.status === "success") byRepo[e.repo].succeeded++; else byRepo[e.repo].failed++;

    // By agent
    byAgent[e.agent] = byAgent[e.agent] || { total: 0, succeeded: 0, failed: 0, success_rate: 0 };
    byAgent[e.agent].total++;
    if (e.status === "success") byAgent[e.agent].succeeded++; else byAgent[e.agent].failed++;
    byAgent[e.agent].success_rate = byAgent[e.agent].total > 0 ? byAgent[e.agent].succeeded / byAgent[e.agent].total : 0;
  }

  return {
    total_executions: total,
    success_rate: total > 0 ? succeeded / total : 0,
    failure_rate: total > 0 ? failed / total : 0,
    by_node: byNode,
    by_repo: byRepo,
    by_agent: byAgent,
    computed_at: new Date().toISOString(),
  };
}
