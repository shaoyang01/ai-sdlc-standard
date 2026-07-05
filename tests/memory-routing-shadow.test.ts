// Regression Test — Memory Routing Shadow Decisions (Pure)
// =========================================================
// Verifies buildMemoryShadowRoutingDecisions produces correct
// shadow decisions. Pure tests — no runtime, no DB, no agents.

import { buildMemoryShadowRoutingDecisions } from "../core/memory-routing-shadow";
import { PolicySuggestion } from "../core/feedback-types";

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

  console.log("Memory Routing Shadow Test\n");

  // ── Test 1: prefer + avoid creates decision ──
  console.log("Test 1: prefer + avoid creates shadow decision");
  const suggestions: PolicySuggestion[] = [
    { type: "prefer_agent", node: "implementation", agent: "codex", reason: "good", confidence: 0.65 },
    { type: "avoid_agent", node: "implementation", agent: "hermes", reason: "bad", confidence: 0.6 },
  ];

  const decisions = buildMemoryShadowRoutingDecisions({
    suggestions,
  });

  assert(decisions.length === 1, "one decision for implementation");
  const d = decisions[0];
  assert(d.node === "implementation", "node is implementation");
  assert(d.preferredAgent === "codex", "preferredAgent is codex");
  assert(d.avoidedAgents.includes("hermes"), "avoidedAgents includes hermes");
  assert(d.avoidedAgents.length === 1, "avoidedAgents has 1 entry");
  assert(d.applied === false, "applied is false");
  assert(d.source === "memory", "source is memory");
  assert(d.confidence === 0.65, "confidence is max of suggestions (0.65)");
  console.log("");

  // ── Test 2: chooses highest-confidence prefer_agent ──
  console.log("Test 2: chooses highest-confidence prefer_agent");
  const multiPrefer: PolicySuggestion[] = [
    { type: "prefer_agent", node: "implementation", agent: "codex", reason: "ok", confidence: 0.65 },
    { type: "prefer_agent", node: "implementation", agent: "kimi", reason: "better", confidence: 0.7 },
    { type: "avoid_agent", node: "implementation", agent: "hermes", reason: "bad", confidence: 0.6 },
  ];

  const multiDecisions = buildMemoryShadowRoutingDecisions({
    suggestions: multiPrefer,
  });

  assert(multiDecisions.length === 1, "one decision");
  assert(multiDecisions[0].preferredAgent === "kimi", "preferredAgent is kimi (highest confidence)");
  assert(multiDecisions[0].confidence === 0.7, "confidence is 0.7");
  console.log("");

  // ── Test 3: currentAgent comes from map ──
  console.log("Test 3: currentAgent from map");
  const withMap = buildMemoryShadowRoutingDecisions({
    suggestions,
    currentAgentsByNode: { implementation: "codex" },
  });

  assert(withMap[0].currentAgent === "codex", "currentAgent is codex from map");
  console.log("");

  // ── Test 4: empty suggestions returns empty ──
  console.log("Test 4: empty suggestions returns empty");
  const empty = buildMemoryShadowRoutingDecisions({
    suggestions: [],
  });
  assert(empty.length === 0, "empty suggestions produces empty decisions");
  console.log("");

  // ── Test 5: multiple nodes produce multiple decisions ──
  console.log("Test 5: multiple nodes produce multiple decisions");
  const multiNode: PolicySuggestion[] = [
    { type: "prefer_agent", node: "implementation", agent: "codex", reason: "good", confidence: 0.65 },
    { type: "avoid_agent", node: "implementation", agent: "hermes", reason: "bad", confidence: 0.6 },
    { type: "prefer_agent", node: "tech-design", agent: "kimi", reason: "good", confidence: 0.7 },
  ];

  const multiNodeDecisions = buildMemoryShadowRoutingDecisions({
    suggestions: multiNode,
  });

  assert(multiNodeDecisions.length === 2, "two decisions (tech-design + implementation)");
  const implDecision = multiNodeDecisions.find((d) => d.node === "implementation");
  const tdDecision = multiNodeDecisions.find((d) => d.node === "tech-design");
  assert(implDecision !== undefined, "implementation decision exists");
  assert(tdDecision !== undefined, "tech-design decision exists");
  assert(tdDecision!.preferredAgent === "kimi", "tech-design prefers kimi");
  assert(implDecision!.avoidedAgents.includes("hermes"), "implementation avoids hermes");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
