// Regression Test — Repository Capability Inventory (Static Metadata, 7+1)
// ==========================================================================
// Verifies the machine-readable capability inventory accurately
// reflects the repository state. No runtime, no DB, no agents.
// C03-C update: inventory rewritten to 8 active skills (7+1 topology);
// legacy 21-package topology retired; runtime module inventory removed
// (this file is skill-focused, not runtime-module-focused).

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

  console.log("Repository Capability Inventory Test (7+1 Topology)\n");

  const inv = loadRepositoryCapabilityInventory("metadata/capabilities/shared/existing-skills-inventory.json");
  const defaultInv = loadRepositoryCapabilityInventory();

  // ── Loader default path ──
  console.log("Test 0: Loader default path resolves relocated shared inventory");
  assert(defaultInv.version === 2, "default loader loads relocated shared inventory (v2)");
  assert(
    defaultInv.skills.length === inv.skills.length,
    "default loader matches explicit path"
  );
  console.log("");

  // ── Basic structure ──
  console.log("Test 1: Basic structure");
  assert(inv.version === 2, "version is 2 (C03-C 7+1 update)");
  assert(inv.generated_by === "static_repository_scan", "generated_by is static_repository_scan");
  assert(Array.isArray(inv.skills), "skills is array");
  assert(Array.isArray(inv.skill_registry_files), "skill_registry_files is array");
  assert(Array.isArray(inv.runtime_entrypoints), "runtime_entrypoints is array");
  assert(typeof inv.summary === "object", "summary is object");
  console.log("");

  // ── Skill count matches ──
  console.log("Test 2: Skill count matches summary");
  assert(
    Number(inv.summary["existing_sdlc_skill_count"]) === inv.skills.length,
    `summary count (${inv.summary["existing_sdlc_skill_count"]}) matches skills array length (${inv.skills.length})`
  );
  assert(inv.skills.length === 8, "8 active skills (7 nodes + docflow-writer)");
  console.log("");

  // ── All skills start with sdlc- ──
  console.log("Test 3: All skills start with sdlc-");
  for (const skill of inv.skills) {
    assert(typeof skill["name"] === "string", `skill has name: ${skill["name"]}`);
    assert(
      String(skill["name"]).startsWith("sdlc-"),
      `skill name starts with sdlc-: ${skill["name"]}`
    );
    assert(Array.isArray(skill["referenceFiles"]), `skill ${skill["name"]} has referenceFiles array`);
  }
  console.log("");

  // ── 7+1 topology skills present ──
  console.log("Test 4: 7+1 topology skills present");
  const expectedSkills = [
    "sdlc-requirement-intake",
    "sdlc-solution-design",
    "sdlc-solution-gate",
    "sdlc-task-planning",
    "sdlc-implementation",
    "sdlc-code-review",
    "sdlc-knowledge-sync",
    "sdlc-docflow-writer",
  ];
  for (const sk of expectedSkills) {
    assert(inv.skills.some((s) => s["name"] === sk), `${sk} present in inventory`);
  }
  console.log("");

  // ── No legacy skill IDs ──
  console.log("Test 5: No legacy skill IDs in active inventory (C03-C cutover)");
  const legacyIds = [
    "sdlc-requirement-normalizer", "sdlc-specification-writer", "sdlc-solution-reviewer",
    "sdlc-solution-challenger", "sdlc-implementation-recorder", "sdlc-code-review-excellence",
    "sdlc-code-review-normalizer", "sdlc-test-feedback-classifier", "sdlc-test-feedback-sync",
    "sdlc-gate-runner", "sdlc-speckit-pipeline", "sdlc-speckit-specify", "sdlc-speckit-clarify",
    "sdlc-speckit-plan", "sdlc-speckit-tasks", "sdlc-speckit-analyze", "sdlc-speckit-implement",
    "sdlc-speckit-sync", "sdlc-speckit-code-doc-reconcile", "sdlc-speckit-checklist",
  ];
  for (const legacy of legacyIds) {
    assert(!inv.skills.some((s) => s["name"] === legacy), `${legacy} NOT in active skills`);
  }
  console.log("");

  // ── Skills are runtime-referenced (C03-C consumption-face cutover) ──
  console.log("Test 6: Skills are runtime-referenced (C03-C cutover)");
  for (const skill of inv.skills) {
    assert(skill["referencedByRuntime"] === true, `${skill["name"]}: referencedByRuntime is true`);
  }
  console.log("");

  // ── Summary statistics ──
  console.log("Test 7: Summary statistics");
  assert(inv.summary["existing_sdlc_skill_count"] === 8, "8 active skills");
  assert(inv.summary["flow_node_count"] === 7, "7 flow nodes");
  assert(inv.summary["cross_cutting_utility_count"] === 1, "1 cross-cutting utility (docflow-writer)");
  assert(String(inv.summary["topology"]).includes("7+1"), "topology mentions 7+1");
  console.log("");

  // ── Runtime entrypoints include C03-C cutover files ──
  console.log("Test 8: Runtime entrypoints include C03-C cutover files");
  const entrypointNames = inv.runtime_entrypoints.map((e) => e["name"]);
  assert(entrypointNames.includes("agent-skill-registry"), "agent-skill-registry is a runtime entrypoint");
  assert(entrypointNames.includes("skill-flow-orchestrator"), "skill-flow-orchestrator is a runtime entrypoint");
  console.log("");

  // ── Archived documentation body and root compatibility note ──
  console.log("Test 9: archived REPOSITORY_CAPABILITY_INVENTORY.md body and root note");
  const archivedMd = fs.readFileSync(
    "docs/reports/archive/capabilities/REPOSITORY_CAPABILITY_INVENTORY.md",
    "utf-8"
  );
  assert(
    archivedMd.includes("PR-5.2 must use the existing sdlc-* skill names"),
    "archived REPOSITORY_CAPABILITY_INVENTORY.md instructs PR-5.2 to use existing skill names"
  );
  const rootNote = fs.readFileSync("REPOSITORY_CAPABILITY_INVENTORY.md", "utf-8");
  assert(rootNote.includes("# Archived Historical Report"), "root note is an archived historical report note");
  assert(rootNote.includes("non-authoritative"), "root note is non-authoritative");
  assert(
    rootNote.includes("docs/reports/archive/capabilities/REPOSITORY_CAPABILITY_INVENTORY.md"),
    "root note links to archived body"
  );
  assert(rootNote.includes("temporary compatibility reference"), "root note is a temporary compatibility reference");
  assert(rootNote.includes("at least 30 days"), "root note declares minimum 30-day retention");
  assert(rootNote.includes("separate governance decision"), "root note removal requires a separate governance decision");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
