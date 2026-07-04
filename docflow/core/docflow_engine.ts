// DocFlow Engine — PURE DETERMINISTIC STATE MACHINE
// ==================================================
// Linear execution only. No branching. No decision logic.
// Passes context between nodes. NO strict/non-strict mode — always linear.
// All decisions belong to LOOP, not DocFlow.

import { DocFlowContext, DocFlowConfig, StageRecord } from "../types/index";
import { RequirementSummaryNode } from "../nodes/requirement-summary/handler";
import { TechDesignNode } from "../nodes/tech-design/handler";
import { ReviewNode } from "../nodes/review/handler";
import { ImplementationNode } from "../nodes/implementation/handler";
import { ValidationNode } from "../nodes/validation/handler";

// Fixed pipeline order — no dynamic path changes
const DEFAULT_NODES = [
  new RequirementSummaryNode(),
  new TechDesignNode(),
  new ReviewNode(),
  new ImplementationNode(),
  new ValidationNode(),
];

export class DocFlowEngine {
  private nodes = DEFAULT_NODES;

  constructor(config?: Partial<DocFlowConfig>) {
    if (config?.nodes && config.nodes.length > 0) {
      this.nodes = config.nodes;
    }
    // No strict_mode — DocFlow is ALWAYS deterministic
  }

  // Execute the full pipeline — LINEAR ONLY
  async execute(requirementId: string, rawText: string, metadata: Record<string, unknown> = {}): Promise<DocFlowContext> {
    const context = this.createContext(requirementId, rawText, metadata);
    return this.runPipeline(context);
  }

  // Resume from partial — linear continuation only
  async resume(context: DocFlowContext): Promise<DocFlowContext> {
    const completed = new Set(context.history.map((r) => r.stage));
    const remaining = this.nodes.filter((n) => !completed.has(n.name));
    return this.runNodes(remaining, context);
  }

  private createContext(requirementId: string, rawText: string, metadata: Record<string, unknown>): DocFlowContext {
    return {
      requirement_id: requirementId,
      raw_text: rawText,
      metadata,
      artifacts: {},
      current_stage: "init",
      history: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  private async runPipeline(context: DocFlowContext): Promise<DocFlowContext> {
    return this.runNodes(this.nodes, context);
  }

  // LINEAR execution — no branching, no decision
  private async runNodes(nodes: typeof this.nodes, context: DocFlowContext): Promise<DocFlowContext> {
    let current = context;

    for (const node of nodes) {
      try {
        current = await node.execute(current);
      } catch (error) {
        // Record failure in history — DocFlow does not decide what happens next
        const record: StageRecord = {
          stage: node.name,
          status: "failed",
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          output: null,
          error: error instanceof Error ? error.message : String(error),
        };
        current.history.push(record);
        current.updated_at = record.completed_at;
        // Continue to next node — DocFlow is a recorder, not a gatekeeper
      }
    }

    return current;
  }

  // Query helpers — pure read-only
  getStageResult(context: DocFlowContext, stage: string): StageRecord | undefined {
    return context.history.find((r) => r.stage === stage);
  }

  isComplete(context: DocFlowContext): boolean {
    return context.history.length >= this.nodes.length &&
           context.history.every((r) => r.status === "completed");
  }
}

export async function executeDocFlow(
  requirementId: string,
  rawText: string,
  metadata?: Record<string, unknown>
): Promise<DocFlowContext> {
  const engine = new DocFlowEngine();
  return engine.execute(requirementId, rawText, metadata);
}
