// Skill Request Validation
// ==========================
// Validates optional explicit skill metadata on execution requests.
// Flow-stage based — does NOT validate against runtime node/requestType.
// Pure helper. Invalid skill metadata does NOT block execution.

import { validateSkillInvocation } from "../core/agent-skill-registry";

export function validateExecutionRequestSkill(request: {
  skill?: string;
  flowId?: string;
}): { attempted: boolean; valid: boolean; reason: string } {
  if (!request.skill) {
    return {
      attempted: false,
      valid: true,
      reason: "No skill metadata provided",
    };
  }

  const result = validateSkillInvocation({
    skill: request.skill,
    flowId: request.flowId,
  });

  return {
    attempted: true,
    valid: result.valid,
    reason: result.reason,
  };
}
