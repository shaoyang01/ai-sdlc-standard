// Execution Gateway
// =================
// Single execution boundary. All agent dispatch goes through here.
// Routes to shadow adapter by default.
// Routes to Codex only when SDLC_EXECUTION_MODE=codex AND agent=codex.
// Routes code_review and bugfix to their dedicated adapters.
// Skill metadata is preserved but does not affect dispatch.

import { ExecutionRequest, ExecutionResult } from "./types";
import { executeShadowAgent } from "./shadow-agent-adapter";
import { executeCodexAgent } from "./codex-adapter";
import { executeCodeReview } from "./code-review-adapter";
import { executeBugfix } from "./bugfix-adapter";
import { getExecutionMode } from "./config";
import { Artifact } from "../core/artifact";
import { CodeReviewFinding } from "../core/review-types";
import { validateExecutionRequestSkill } from "./skill-request-validation";
import { executeKimiGatewayRequest } from "./kimi-gateway-real-dispatch";

export class ExecutionGateway {
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    // ── Skill Validation — metadata only, does not affect dispatch ──
    const skillValidation = validateExecutionRequestSkill(request);
    const enriched = { ...request, skillValidation };

    // ── Code Review Route ──
    if (enriched.type === "code_review") {
      const attempt = (enriched.metadata?.["attempt"] as number) ?? 0;
      const artifacts = (enriched.input["artifacts"] as Artifact[]) ?? [];
      return executeCodeReview({
        requirementId: enriched.requirementId,
        artifacts,
        agent: enriched.agent,
        attempt,
        skill: enriched.skill,
        skillValidation: enriched.skillValidation,
      });
    }

    // ── Bugfix Route ──
    if (enriched.type === "bugfix") {
      const attempt = (enriched.metadata?.["attempt"] as number) ?? 1;
      const artifacts = (enriched.input["artifacts"] as Artifact[]) ?? [];
      const findings = (enriched.input["findings"] as CodeReviewFinding[]) ?? [];
      return executeBugfix({
        requirementId: enriched.requirementId,
        artifacts,
        findings,
        agent: enriched.agent,
        attempt,
        skill: enriched.skill,
        skillValidation: enriched.skillValidation,
      });
    }

    // ── Kimi Real Dispatch (feature-flagged, llm_task only) ──
    if (enriched.agent === "kimi" && enriched.type === "llm_task") {
      return executeKimiGatewayRequest(enriched);
    }

    // ── Default: shadow or codex ──
    const mode = getExecutionMode();
    if (mode === "codex" && enriched.agent === "codex") {
      return executeCodexAgent(enriched);
    }
    return executeShadowAgent(enriched);
  }
}

export const executionGateway = new ExecutionGateway();
