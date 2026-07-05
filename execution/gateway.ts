// Execution Gateway
// =================
// Single execution boundary. All agent dispatch goes through here.
// Routes to shadow adapter by default.
// Routes to Codex only when SDLC_EXECUTION_MODE=codex AND agent=codex.

import { ExecutionRequest, ExecutionResult } from "./types";
import { executeShadowAgent } from "./shadow-agent-adapter";
import { executeCodexAgent } from "./codex-adapter";
import { getExecutionMode } from "./config";

export class ExecutionGateway {
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const mode = getExecutionMode();
    if (mode === "codex" && request.agent === "codex") {
      return executeCodexAgent(request);
    }
    return executeShadowAgent(request);
  }
}

export const executionGateway = new ExecutionGateway();
