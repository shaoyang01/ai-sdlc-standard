// Execution Gateway
// =================
// Single execution boundary. All agent dispatch goes through here.
// Routes to shadow adapter by default.
// Routes to Codex only when SDLC_EXECUTION_MODE=codex AND agent=codex.
// Routes code_review and bugfix to their dedicated adapters.

import { ExecutionRequest, ExecutionResult } from "./types";
import { executeShadowAgent } from "./shadow-agent-adapter";
import { executeCodexAgent } from "./codex-adapter";
import { executeCodeReview } from "./code-review-adapter";
import { executeBugfix } from "./bugfix-adapter";
import { getExecutionMode } from "./config";
import { Artifact } from "../core/artifact";
import { CodeReviewFinding } from "../core/review-types";

export class ExecutionGateway {
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    // ── Code Review Route ──
    if (request.type === "code_review") {
      const attempt = (request.metadata?.["attempt"] as number) ?? 0;
      const artifacts = (request.input["artifacts"] as Artifact[]) ?? [];
      return executeCodeReview({
        requirementId: request.requirementId,
        artifacts,
        agent: request.agent,
        attempt,
      });
    }

    // ── Bugfix Route ──
    if (request.type === "bugfix") {
      const attempt = (request.metadata?.["attempt"] as number) ?? 1;
      const artifacts = (request.input["artifacts"] as Artifact[]) ?? [];
      const findings = (request.input["findings"] as CodeReviewFinding[]) ?? [];
      return executeBugfix({
        requirementId: request.requirementId,
        artifacts,
        findings,
        agent: request.agent,
        attempt,
      });
    }

    // ── Default: shadow or codex ──
    const mode = getExecutionMode();
    if (mode === "codex" && request.agent === "codex") {
      return executeCodexAgent(request);
    }
    return executeShadowAgent(request);
  }
}

export const executionGateway = new ExecutionGateway();
