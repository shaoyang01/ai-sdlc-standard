// Execution Gateway
// =================
// Single execution boundary. All agent dispatch goes through here.
// Currently routes to shadow adapter. Future: real Codex / LLM adapters.

import { ExecutionRequest, ExecutionResult } from "./types";
import { executeShadowAgent } from "./shadow-agent-adapter";

export class ExecutionGateway {
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    return executeShadowAgent(request);
  }
}

export const executionGateway = new ExecutionGateway();
