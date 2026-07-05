// Regression Test — Agent Skill Registry (Metadata-only)
// ========================================================
// Verifies the Agent Skill Registry uses existing sdlc-* names,
// covers all inventory skills, and does not affect runtime.
// No runtime, no DB, no agents.

import {
  getAllSkillBindings,
  getBindingsForAgent,
  getBindingsForSkill,
  getBindingsForNode,
  findSkillBinding,
  validateSkillInvocation,
  getRegistrySkillsNotInInventory,
  getInventorySkillsMissingFromRegistry,
} from "../core/agent-skill-registry";
import { loadRepositoryCapabilityInventory } from "../core/repository-capability-inventory";
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

  const inv = loadRepositoryCapabilityInventory("existing-skills-inventory.json");
  const invSkills = inv.skills.map((s) => String(s["name"]));
  const caps = loadRuntimeCapabilities("runtime-capabilities.json");

  console.log("Agent Skill Registry Test\n");

  // ── Test 1: Registry is non-empty ──
  console.log("Test 1: Registry is non-empty");
  const all = getAllSkillBindings();
  assert(all.length > 0, `registry has ${all.length} bindings`);
  assert(all.length === 20, `registry has exactly 20 bindings (got ${all.length})`);
  console.log("");

  // ── Test 2: Every registry skill is canonical sdlc-* name ──
  console.log("Test 2: Every registry skill starts with sdlc-");
  for (const binding of all) {
    assert(
      binding.skill.startsWith("sdlc-"),
      `skill "${binding.skill}" starts with sdlc-`
    );
  }
  console.log("");

  // ── Test 3: Registry does not invent skills outside inventory ──
  console.log("Test 3: Registry has no non-inventory skills");
  const notInInventory = getRegistrySkillsNotInInventory(invSkills);
  assert(notInInventory.length === 0, `no registry skills outside inventory (got ${notInInventory.length})`);
  console.log("");

  // ── Test 4: Every inventory skill appears in registry ──
  console.log("Test 4: Every inventory skill appears in registry");
  const missingFromRegistry = getInventorySkillsMissingFromRegistry(invSkills);
  assert(missingFromRegistry.length === 0, `no inventory skills missing from registry (got ${missingFromRegistry.length})`);
  console.log("");

  // ── Test 5: All bindings are metadata-only / not wired ──
  console.log("Test 5: All bindings are metadata-only");
  for (const binding of all) {
    assert(binding.wiredToRuntime === false, `${binding.skill}: wiredToRuntime is false`);
    assert(binding.executionMode === "metadata_only", `${binding.skill}: executionMode is metadata_only`);
    assert(binding.runtimeStatus === "documented_skill_contract", `${binding.skill}: runtimeStatus is documented_skill_contract`);
  }
  console.log("");

  // ── Test 6: Agents have expected skill assignments ──
  console.log("Test 6: Agents have skill assignments");
  const kimiBindings = getBindingsForAgent("kimi");
  const codexBindings = getBindingsForAgent("codex");
  const hermesBindings = getBindingsForAgent("hermes");
  assert(kimiBindings.length > 0, `kimi has ${kimiBindings.length} skill(s)`);
  assert(codexBindings.length > 0, `codex has ${codexBindings.length} skill(s)`);
  assert(hermesBindings.length > 0, `hermes has ${hermesBindings.length} skill(s)`);
  console.log("");

  // ── Test 7: Valid invocation ──
  console.log("Test 7: Valid skill invocation");
  const validInvocation = validateSkillInvocation({
    requirementId: "REQ-TEST",
    skill: "sdlc-speckit-implement",
    agent: "codex",
    node: "implementation",
    requestType: "code_generation",
    input: {},
  });
  assert(validInvocation.valid === true, "sdlc-speckit-implement + codex + implementation + code_generation is valid");
  assert(validInvocation.binding !== undefined, "valid invocation has binding reference");
  console.log("");

  // ── Test 8: Invalid invocation ──
  console.log("Test 8: Invalid skill invocation");
  const invalid1 = validateSkillInvocation({
    requirementId: "REQ-TEST",
    skill: "sdlc-speckit-implement",
    agent: "kimi",
    node: "implementation",
    requestType: "code_generation",
    input: {},
  });
  assert(invalid1.valid === false, "sdlc-speckit-implement + kimi is invalid");
  assert(invalid1.reason.includes("kimi"), "reason mentions wrong agent");

  const invalid2 = validateSkillInvocation({
    requirementId: "REQ-TEST",
    skill: "nonexistent-skill",
    agent: "codex",
    node: "implementation",
    requestType: "code_generation",
    input: {},
  });
  assert(invalid2.valid === false, "nonexistent skill is invalid");
  assert(invalid2.reason.includes("not registered"), "reason mentions not registered");
  console.log("");

  // ── Test 9: Capability metadata says registry does not affect runtime ──
  console.log("Test 9: Capability metadata confirms registry is advisory only");
  const skillsCaps = caps.skills as Record<string, unknown>;
  assert(skillsCaps["agent_skill_registry"] === "implemented_metadata_only", "registry is implemented_metadata_only");
  assert(skillsCaps["skill_invocation_contract"] === "implemented_metadata_only", "contract is implemented_metadata_only");
  assert(skillsCaps["affects_runtime_routing"] === false, "does not affect runtime routing");
  assert(skillsCaps["affects_agent_selection"] === false, "does not affect agent selection");
  assert(skillsCaps["real_adapter_enablement"] === false, "does not enable real adapters");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
