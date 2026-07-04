// LOOP Executor — Deterministic Dispatcher
// =========================================
// Executes a single node by dispatching it to its assigned agent.
// NO decision logic — just lookup + dispatch + record.

import { LoopContext, LoopHistoryEntry, LoopResult } from "../types/index";
import { routeAgent } from "../router/agent_router";
import { routeNextNode } from "../router/node_router";

export async function executeNode(context: LoopContext): Promise<LoopResult> {
  const agent = routeAgent(context.node);
  const startedAt = new Date().toISOString();

  // Dispatch to agent — deterministic, no logic branching
  const dispatched = await dispatchToAgent(context.node, agent, context.payload);

  const completedAt = new Date().toISOString();

  // Record execution history — pure logging, no decision
  const entry: LoopHistoryEntry = {
    node: context.node,
    agent,
    started_at: startedAt,
    completed_at: completedAt,
    status: dispatched.success ? "success" : "failure",
    error: dispatched.error ?? null,
  };
  context.history.push(entry);

  // Determine next node — STATIC lookup, no conditions
  const nextNode = routeNextNode(context.node);

  return {
    next_node: nextNode,
    agent,
    payload: dispatched.output ?? context.payload,
  };
}

// Agent dispatch — pure function, no inference
async function dispatchToAgent(
  node: string,
  agent: string,
  payload: Record<string, unknown>
): Promise<{ success: boolean; output?: Record<string, unknown>; error?: string }> {
  // Deterministic dispatch: returns structured result based on node + agent.
  // In production, this would invoke the actual agent via execution adapter.
  // Here: shadow-mode simulation — always succeeds with structured output.
  return {
    success: true,
    output: {
      node,
      agent,
      result: `${node}_completed_by_${agent}`,
      timestamp: new Date().toISOString(),
      payload,
    },
  };
}
