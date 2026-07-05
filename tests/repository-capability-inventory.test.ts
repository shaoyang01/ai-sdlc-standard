// Regression Test — Repository Capability Inventory (Static Metadata)
// ===================================================================
// Verifies the machine-readable capability inventory accurately
// reflects the repository state. No runtime, no DB, no agents.

import { loadRepositoryCapabilityInventory } from "../core/repository-capability-inventory";
import * as fs from "node:fs";

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

  console.log("Repository Capability Inventory Test\n");

  const inv = loadRepositoryCapabilityInventory("existing-skills-inventory.json");

  // ── Basic structure ──
  console.log("Test 1: Basic structure");
  assert(inv.version === 1, "version is 1");
  assert(inv.generated_by === "static_repository_scan", "generated_by is static_repository_scan");
  assert(Array.isArray(inv.skills), "skills is array");
  assert(Array.isArray(inv.skill_registry_files), "skill_registry_files is array");
  assert(Array.isArray(inv.runtime_entrypoints), "runtime_entrypoints is array");
  assert(Array.isArray(inv.execution_adapters), "execution_adapters is array");
  assert(Array.isArray(inv.policy_modules), "policy_modules is array");
  assert(Array.isArray(inv.memory_modules), "memory_modules is array");
  assert(Array.isArray(inv.feedback_modules), "feedback_modules is array");
  assert(Array.isArray(inv.evolution_modules), "evolution_modules is array");
  assert(Array.isArray(inv.potentially_unconnected_modules), "potentially_unconnected_modules is array");
  assert(typeof inv.summary === "object", "summary is object");
  console.log("");

  // ── Skill count matches ──
  console.log("Test 2: Skill count matches summary");
  assert(
    Number(inv.summary["existing_sdlc_skill_count"]) === inv.skills.length,
    `summary count (${inv.summary["existing_sdlc_skill_count"]}) matches skills array length (${inv.skills.length})`
  );
  console.log("");

  // ── All skills start with sdlc- ──
  console.log("Test 3: All skills start with sdlc-");
  for (const skill of inv.skills) {
    assert(typeof skill["name"] === "string", `skill has name: ${skill["name"]}`);
    assert(
      String(skill["name"]).startsWith("sdlc-"),
      `skill name starts with sdlc-: ${skill["name"]}`
    );
    assert(Array.isArray(skill["sourceFiles"]), `skill ${skill["name"]} has sourceFiles array`);
    assert(Array.isArray(skill["referenceFiles"]), `skill ${skill["name"]} has referenceFiles array`);
    assert((skill["referenceFiles"] as unknown[]).length >= 4, `skill ${skill["name"]} has at least 4 reference files`);
  }
  console.log("");

  // ── Summary statistics ──
  console.log("Test 4: Summary statistics");
  assert(inv.summary["skills_with_skill_md_count"] === 20, "all 20 skills have SKILL.md");
  assert(inv.summary["skills_with_manifest_count"] === 20, "all 20 skills are in manifest");
  assert(inv.summary["skills_with_contract_count"] === 20, "all 20 skills have contracts");
  assert(inv.summary["skills_registered_count"] === 20, "all 20 skills are registered");
  assert(inv.summary["skills_runtime_referenced_count"] === 0, "no skills are runtime-referenced");
  assert(inv.summary["execution_adapter_count"] === 4, "4 execution adapters");
  assert(inv.summary["feature_flagged_real_adapter_count"] === 1, "1 feature-flagged real adapter (codex)");
  assert(inv.summary["shadow_only_adapter_count"] === 3, "3 shadow-only adapters");
  console.log("");

  // ── Codex adapter is feature-flagged ──
  console.log("Test 5: Codex adapter status");
  const codex = inv.execution_adapters.find((a) => a["name"] === "codex-adapter");
  assert(codex !== undefined, "codex adapter exists");
  assert(codex!["executionMode"] === "feature_flagged_real", "codex is feature-flagged real");
  assert(codex!["defaultEnabled"] === false, "codex is not default enabled");
  console.log("");

  // ── Kimi/Hermes are shadow only ──
  console.log("Test 6: Kimi/Hermes adapters not implemented");
  const kimiAdapter = inv.execution_adapters.find((a) => a["name"] === "kimi-adapter");
  const hermesAdapter = inv.execution_adapters.find((a) => a["name"] === "hermes-adapter");
  assert(kimiAdapter === undefined, "no kimi adapter (not implemented)");
  assert(hermesAdapter === undefined, "no hermes adapter (not implemented)");
  // Shadow adapter covers all agents
  const shadow = inv.execution_adapters.find((a) => a["name"] === "shadow-agent-adapter");
  assert(shadow !== undefined, "shadow adapter exists");
  const shadowAgents = shadow!["supportedAgents"] as string[];
  assert(shadowAgents.includes("kimi"), "shadow adapter supports kimi");
  assert(shadowAgents.includes("hermes"), "shadow adapter supports hermes");
  console.log("");

  // ── Documentation reference ──
  console.log("Test 7: REPOSITORY_CAPABILITY_INVENTORY.md references PR-5.2");
  const mdContent = fs.readFileSync("REPOSITORY_CAPABILITY_INVENTORY.md", "utf-8");
  assert(
    mdContent.includes("PR-5.2 must use the existing sdlc-* skill names"),
    "REPOSITORY_CAPABILITY_INVENTORY.md instructs PR-5.2 to use existing skill names"
  );
  console.log("");

  // ── Routing vs Agent Selection distinction ──
  console.log("Test 8: Routing vs Agent Selection distinction");
  const policyEngine = inv.policy_modules.find((m) => m["name"] === "agent-policy-engine");
  assert(policyEngine !== undefined, "agent-policy-engine exists");
  assert(policyEngine!["changesGraphRouting"] === false, "agent-policy-engine does NOT change graph routing");
  assert(policyEngine!["changesActualAgentSelection"] === true, "agent-policy-engine DOES change actual agent selection");

  const agentDecision = inv.policy_modules.find((m) => m["name"] === "agent-decision");
  assert(agentDecision !== undefined, "agent-decision exists");
  assert(agentDecision!["changesGraphRouting"] === false, "agent-decision does NOT change graph routing");
  assert(agentDecision!["changesActualAgentSelection"] === true, "agent-decision DOES change actual agent selection");

  const memoryAnalyzer = inv.policy_modules.find((m) => m["name"] === "policy-memory-analyzer");
  assert(memoryAnalyzer !== undefined, "policy-memory-analyzer exists");
  assert(memoryAnalyzer!["changesGraphRouting"] === false, "memory-analyzer does NOT change graph routing");
  assert(memoryAnalyzer!["changesActualAgentSelection"] === false, "memory-analyzer does NOT change actual agent selection");
  assert(memoryAnalyzer!["onlyProducesSuggestions"] === true, "memory-analyzer only produces suggestions");

  const feedbackAnalyzer = inv.feedback_modules.find((m) => m["name"] === "feedback-analyzer");
  assert(feedbackAnalyzer !== undefined, "feedback-analyzer exists");
  assert(feedbackAnalyzer!["changesActualAgentSelection"] === false, "feedback-analyzer does NOT change actual agent selection");

  const evoAnalyzer = inv.evolution_modules.find((m) => m["name"] === "evolution-proposal-analyzer");
  assert(evoAnalyzer !== undefined, "evolution-proposal-analyzer exists");
  assert(evoAnalyzer!["changesActualAgentSelection"] === false, "evolution-analyzer does NOT change actual agent selection");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
