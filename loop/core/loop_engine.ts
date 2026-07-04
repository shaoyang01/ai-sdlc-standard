// LOOP Engine — Deterministic Workflow Engine
// ============================================
// Executes DocFlow nodes in strict sequence.
// Maps each node to a fixed agent.
// Determines next node using static flow table.
// ZERO intelligence, ZERO inference, ZERO AI reasoning.

import { LoopContext, LoopResult, DocFlowNode, ExecutionMode, LoopHistoryEntry } from "../types/index";
import { executeNode } from "../executor/loop_executor";
import { routeNextNode } from "../router/node_router";
import { getAllNodes } from "../registry/node_map";

export class LoopEngine {
  // Execute full pipeline from start to end
  async executeFull(
    requirementId: string,
    initialPayload: Record<string, unknown> = {},
    executionMode: ExecutionMode = "direct"
  ): Promise<LoopContext> {
    const context = this.createContext(requirementId, initialPayload, executionMode);

    let currentNode: string | null = context.node;

    while (currentNode) {
      const result = await executeNode(context);
      context.payload = result.payload;

      if (!result.next_node) break;
      context.node = result.next_node as DocFlowNode;
      currentNode = result.next_node;
    }

    return context;
  }

  // Execute a single node
  async executeSingle(context: LoopContext): Promise<LoopResult> {
    return executeNode(context);
  }

  private createContext(
    requirementId: string,
    payload: Record<string, unknown>,
    executionMode: ExecutionMode
  ): LoopContext {
    const firstNode = getAllNodes()[0] as DocFlowNode;
    return {
      node: firstNode,
      requirement_id: requirementId,
      payload,
      execution_mode: executionMode,
      history: [],
    };
  }

  // Query — pure read
  getHistory(context: LoopContext): LoopHistoryEntry[] {
    return context.history;
  }

  // Query — pure read
  getSummary(context: LoopContext): string {
    const total = context.history.length;
    const succeeded = context.history.filter((h) => h.status === "success").length;
    const failed = context.history.filter((h) => h.status === "failure").length;
    return `LOOP Pipeline: ${succeeded}/${total} succeeded, ${failed} failed. Last node: ${context.node}`;
  }
}

// Convenience function
export async function runLoop(
  requirementId: string,
  payload?: Record<string, unknown>,
  executionMode?: ExecutionMode
): Promise<LoopContext> {
  const engine = new LoopEngine();
  return engine.executeFull(requirementId, payload, executionMode);
}
