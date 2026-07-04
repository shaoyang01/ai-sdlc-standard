// DocFlow Engine
// ==============
// Minimal DocFlow execution engine.
// Executes nodes sequentially, passes context between stages.
// No LOOP / Speckit / Agent integration — pure DocFlow.

import { DocFlowContext, DocFlowConfig, StageRecord } from "../types/index";
import { RequirementSummaryNode } from "../nodes/requirement-summary/handler";
import { TechDesignNode } from "../nodes/tech-design/handler";
import { ReviewNode } from "../nodes/review/handler";
import { ImplementationNode } from "../nodes/implementation/handler";
import { ValidationNode } from "../nodes/validation/handler";

// Default pipeline: summary → design → review → implement → validate
const DEFAULT_NODES = [
  new RequirementSummaryNode(),
  new TechDesignNode(),
  new ReviewNode(),
  new ImplementationNode(),
  new ValidationNode(),
];

export class DocFlowEngine {
  private nodes = DEFAULT_NODES;
  private strictMode = true;

  constructor(config?: Partial<DocFlowConfig>) {
    if (config?.nodes && config.nodes.length > 0) {
      this.nodes = config.nodes;
    }
    if (config?.strict_mode !== undefined) {
      this.strictMode = config.strict_mode;
    }
  }

  // Main entrypoint: execute the full pipeline
  async execute(requirementId: string, rawText: string, metadata: Record<string, unknown> = {}): Promise<DocFlowContext> {
    const context = this.createContext(requirementId, rawText, metadata);
    return this.runPipeline(context);
  }

  // Execute from a partially-completed context (resume support)
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

  private async runNodes(nodes: typeof this.nodes, context: DocFlowContext): Promise<DocFlowContext> {
    let current = context;

    for (const node of nodes) {
      try {
        current = await node.execute(current);
      } catch (error) {
        if (this.strictMode) {
          throw new Error(`DocFlow pipeline halted at "${node.name}": ${error instanceof Error ? error.message : String(error)}`);
        }
        // Non-strict: record failure and continue
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
      }
    }

    return current;
  }

  // Query helpers
  getStageResult(context: DocFlowContext, stage: string): StageRecord | undefined {
    return context.history.find((r) => r.stage === stage);
  }

  getArtifact<T>(context: DocFlowContext, stage: string): T | undefined {
    return context.artifacts[stage] as T | undefined;
  }

  isComplete(context: DocFlowContext): boolean {
    return context.history.length >= this.nodes.length &&
           context.history.every((r) => r.status === "completed");
  }

  getSummary(context: DocFlowContext): string {
    const total = context.history.length;
    const completed = context.history.filter((r) => r.status === "completed").length;
    const failed = context.history.filter((r) => r.status === "failed").length;
    return `DocFlow Pipeline: ${completed}/${total} completed, ${failed} failed. Current stage: ${context.current_stage}`;
  }
}

// Convenience: execute with default pipeline
export async function executeDocFlow(
  requirementId: string,
  rawText: string,
  metadata?: Record<string, unknown>
): Promise<DocFlowContext> {
  const engine = new DocFlowEngine();
  return engine.execute(requirementId, rawText, metadata);
}
