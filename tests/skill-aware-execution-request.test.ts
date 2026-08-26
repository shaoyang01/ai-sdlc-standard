// Regression Test — Skill-aware Execution Request (Metadata-only)
// ================================================================
// Verifies execution requests can carry optional skill metadata
// without changing dispatch, routing, or agent selection.
// Default shadow mode only. No SQLite. No Codex CLI.

import { executionGateway } from "../execution/gateway";
import { validateExecutionRequestSkill } from "../execution/skill-request-validation";
import { loadRuntimeCapabilities } from "../core/runtime-capabilities";

async function test() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      passed++;
      console.log(`  ✓ ${message}`);
    } else {
      failed++;
      console.error(`  ✗ ${message}`);
    }
  }

  const caps = loadRuntimeCapabilities("runtime-capabilities.json");
  const skillsCaps = caps.skills as Record<string, unknown>;

  console.log("Skill-aware Execution Request Test\n");

  // ── Test 1: Request without skill remains valid ──
  console.log("Test 1: Request without skill metadata works normally");
  const noSkillResult = await executionGateway.execute({
    type: "code_generation",
    node: "implementation",
    agent: "codex",
    requirementId: "REQ-NOSKILL",
    input: {},
  });
  assert(noSkillResult.success === true, "request without skill succeeds");
  const noSkillArtifact = noSkillResult.artifacts[0];
  assert(noSkillArtifact.content["skill"] === null, "artifact has null skill");
  const noSkillSV = noSkillArtifact.content["skill_validation"] as Record<string, unknown> | null;
  assert(noSkillSV !== null, "skill_validation is present even without skill");
  assert(noSkillSV!["attempted"] === false, "skill validation was not attempted");
  assert(noSkillSV!["valid"] === true, "no skill metadata is valid");
  console.log("");

  // ── Test 2: Request with valid skill metadata ──
  console.log("Test 2: Request with valid skill metadata succeeds");
  const validResult = await executionGateway.execute({
    type: "code_generation",
    node: "implementation",
    agent: "codex",
    requirementId: "REQ-VALID",
    input: {},
    skill: "sdlc-implementation",
  });
  assert(validResult.success === true, "request with valid skill succeeds");
  const validArtifact = validResult.artifacts[0];
  assert(validArtifact.content["skill"] === "sdlc-implementation", "artifact has skill name");
  const validSV = validArtifact.content["skill_validation"] as Record<string, unknown> | null;
  assert(validSV !== null, "skill_validation is present");
  assert(validSV!["valid"] === true, "skill validation is valid");
  assert(validSV!["attempted"] === true, "skill validation was attempted");
  console.log("");

  // ── Test 3: Invalid skill metadata does NOT block execution ──
  console.log("Test 3: Invalid skill metadata does not block execution");
  const invalidResult = await executionGateway.execute({
    type: "code_generation",
    node: "implementation",
    agent: "kimi",
    requirementId: "REQ-INVALID",
    input: {},
    skill: "sdlc-implementation",
  });
  assert(invalidResult.success === true, "execution still succeeds with invalid skill metadata");
  const invalidArtifact = invalidResult.artifacts[0];
  assert(invalidArtifact.content["skill"] === "sdlc-implementation", "artifact preserves skill name");
  const invalidSV = invalidArtifact.content["skill_validation"] as Record<string, unknown> | null;
  assert(invalidSV !== null, "skill_validation is present");
  // Skill is known, so validation passes even when agent doesn't match
  // (agent eligibility is metadata-only, not enforced by validation)
  assert(invalidSV!["attempted"] === true, "skill validation was attempted");
  console.log("");

  // ── Test 4: Dispatch behavior unchanged ──
  console.log("Test 4: Dispatch behavior unchanged with/without skill metadata");
  const withoutSkill = await executionGateway.execute({
    type: "code_generation",
    node: "implementation",
    agent: "codex",
    requirementId: "REQ-DISP1",
    input: {},
  });
  const withSkill = await executionGateway.execute({
    type: "code_generation",
    node: "implementation",
    agent: "codex",
    requirementId: "REQ-DISP2",
    input: {},
    skill: "sdlc-implementation",
  });
  assert(withoutSkill.success === withSkill.success, "same success behavior");
  assert(withoutSkill.node === withSkill.node, "same node");
  assert(withoutSkill.agent === withSkill.agent, "same agent");
  assert(withoutSkill.artifacts[0].type === withSkill.artifacts[0].type, "same artifact type");
  console.log("");

  // ── Test 5: Capability metadata confirms no dispatch effect ──
  console.log("Test 5: Capability metadata confirms skills don't affect dispatch");
  assert(skillsCaps["affects_runtime_routing"] === false, "does not affect routing");
  assert(skillsCaps["affects_agent_selection"] === false, "does not affect agent selection");
  assert(skillsCaps["affects_execution_dispatch"] === false, "does not affect execution dispatch");
  assert(skillsCaps["real_adapter_enablement"] === false, "does not enable real adapters");
  console.log("");

  // ── Test 6: Validate helper handles missing skill ──
  console.log("Test 6: Validation helper handles missing skill");
  const valNoSkill = validateExecutionRequestSkill({});
  assert(valNoSkill.attempted === false, "not attempted when no skill");
  assert(valNoSkill.valid === true, "valid when no skill");
  assert(valNoSkill.reason.includes("No skill"), "reason mentions no skill");
  console.log("");

  // ── Test 7: Skill metadata preserved in code_review route ──
  console.log("Test 7: Skill metadata preserved in code_review route");
  const codeReviewResult = await executionGateway.execute({
    type: "code_review",
    node: "code-review",
    agent: "codex",
    requirementId: "REQ-CR",
    input: { artifacts: [] },
    skill: "sdlc-code-review",
  });
  assert(codeReviewResult.success === true, "code_review with skill succeeds");
  const crArtifact = codeReviewResult.artifacts[0];
  assert(crArtifact.content["skill"] === "sdlc-code-review", "code_review artifact has skill name");
  const crSV = crArtifact.content["skill_validation"] as Record<string, unknown> | null;
  assert(crSV !== null, "code_review skill_validation is present");
  assert(crSV!["attempted"] === true, "code_review skill validation was attempted");
  console.log("");

  // ── Test 8: Skill metadata preserved in bugfix route ──
  console.log("Test 8: Skill metadata preserved in bugfix route");
  const bugfixResult = await executionGateway.execute({
    type: "bugfix",
    node: "bugfix",
    agent: "codex",
    requirementId: "REQ-BF",
    input: { artifacts: [], findings: [] },
    metadata: { attempt: 1 },
    skill: "sdlc-implementation",
  });
  assert(bugfixResult.success === true, "bugfix with skill succeeds");
  const bfArtifact = bugfixResult.artifacts[0];
  assert(bfArtifact.content["skill"] === "sdlc-implementation", "bugfix artifact has skill name");
  const bfSV = bfArtifact.content["skill_validation"] as Record<string, unknown> | null;
  assert(bfSV !== null, "bugfix skill_validation is present");
  console.log("");

  // ── Test 9: Invalid skill in bugfix route does not block ──
  console.log("Test 9: Invalid skill in bugfix route does not block execution");
  const invalidBugfixResult = await executionGateway.execute({
    type: "bugfix",
    node: "bugfix",
    agent: "hermes",
    requirementId: "REQ-BF-INV",
    input: { artifacts: [], findings: [] },
    metadata: { attempt: 1 },
    skill: "sdlc-implementation",
  });
  assert(invalidBugfixResult.success === true, "bugfix with known skill still succeeds");
  const ibfArtifact = invalidBugfixResult.artifacts[0];
  const ibfSV = ibfArtifact.content["skill_validation"] as Record<string, unknown> | null;
  assert(ibfSV !== null, "skill_validation is present");
  // Known skill passes validation; agent eligibility is metadata-only
  assert(ibfSV!["attempted"] === true, "skill validation was attempted");
  console.log("");

  // ── Test 10: Truly unknown skill does not block but is flagged invalid ──
  console.log("Test 10: Unknown skill flagged invalid but does not block");
  const unknownResult = await executionGateway.execute({
    type: "code_generation",
    node: "implementation",
    agent: "codex",
    requirementId: "REQ-UNKNOWN-SKILL",
    input: {},
    skill: "unknown-skill",
  });
  assert(unknownResult.success === true, "unknown skill does not block execution");
  const uArtifact = unknownResult.artifacts[0];
  assert(uArtifact.content["skill"] === "unknown-skill", "artifact preserves unknown skill name");
  const uSV = uArtifact.content["skill_validation"] as Record<string, unknown> | null;
  assert(uSV !== null, "skill_validation is present");
  assert(uSV!["attempted"] === true, "skill validation was attempted");
  assert(uSV!["valid"] === false, "unknown skill is flagged invalid");
  assert((uSV!["reason"] as string).includes("Unknown skill"), "reason mentions Unknown skill");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
