// Skill Request Validation
// ==========================
// Validates optional skill metadata on execution requests.
// Pure helper. No adapter calls. No DB. No Codex CLI.
// Invalid skill metadata does NOT block execution.

import { ExecutionRequest } from "./types";
import { validateSkillInvocation } from "../core/agent-skill-registry";

export function validateExecutionRequestSkill(
  request: ExecutionRequest
): { attempted: boolean; valid: boolean; reason: string } {
  if (!request.skill) {
    return {
      attempted: false,
      valid: true,
      reason: "No skill metadata provided",
    };
  }

  const result = validateSkillInvocation({
    requirementId: request.requirementId,
    skill: request.skill,
    agent: request.agent,
    node: request.node,
    requestType: request.type,
    input: request.input,
  });

  return {
    attempted: true,
    valid: result.valid,
    reason: result.reason,
  };
}
