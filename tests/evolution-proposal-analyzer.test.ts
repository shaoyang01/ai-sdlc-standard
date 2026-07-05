// Regression Test — Evolution Proposal Analyzer (Pure, Read-only)
// =================================================================
// Verifies buildEvolutionProposals produces correct proposals.
// Pure tests — no runtime, no DB, no agents. All applied=false.

import { buildEvolutionProposals } from "../core/evolution-proposal-analyzer";
import { RuntimeFeedback, ShadowRoutingDecision } from "../core/feedback-types";

function makeFeedback(overrides?: Partial<RuntimeFeedback>): RuntimeFeedback {
  return {
    agent_scores: overrides?.agent_scores ?? [],
    node_outcomes: overrides?.node_outcomes ?? [],
    review_summary: overrides?.review_summary ?? {
      bugfixAttempts: 0,
      validationPassed: true,
    },
    policy_suggestions: overrides?.policy_suggestions ?? [],
    shadow_routing_decisions: overrides?.shadow_routing_decisions,
  };
}

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

  console.log("Evolution Proposal Analyzer Test\n");

  // ── Test 1: No signals produces no proposals ──
  console.log("Test 1: No signals produces no proposals");
  const clean = buildEvolutionProposals({
    requirementId: "REQ-CLEAN",
    feedback: makeFeedback(),
  });
  assert(clean.length === 0, "no proposals when no issues exist");
  console.log("");

  // ── Test 2: Shadow preferred agent different → routing_experiment ──
  console.log("Test 2: Different preferred agent creates routing_experiment");
  const shadowDecisions: ShadowRoutingDecision[] = [{
    node: "implementation",
    currentAgent: "kimi",
    preferredAgent: "codex",
    avoidedAgents: [],
    reason: "Memory prefers codex",
    confidence: 0.65,
    source: "memory",
    applied: false,
  }];

  const routingResult = buildEvolutionProposals({
    requirementId: "REQ-RT",
    feedback: makeFeedback({ shadow_routing_decisions: shadowDecisions }),
  });

  const routingProposal = routingResult.find((p) => p.type === "routing_experiment");
  assert(routingProposal !== undefined, "routing_experiment proposal exists");
  assert(routingProposal!.relatedAgent === "codex", "relatedAgent is codex");
  assert(routingProposal!.relatedNode === "implementation", "relatedNode is implementation");
  assert(routingProposal!.applied === false, "applied is false");
  assert(routingProposal!.confidence === 0.65, "confidence is 0.65");
  console.log("");

  // ── Test 3: Avoided agent → policy_adjustment ──
  console.log("Test 3: Avoided agent creates policy_adjustment");
  const avoidDecisions: ShadowRoutingDecision[] = [{
    node: "implementation",
    preferredAgent: "codex",
    avoidedAgents: ["hermes"],
    reason: "Memory avoids hermes",
    confidence: 0.6,
    source: "memory",
    applied: false,
  }];

  const avoidResult = buildEvolutionProposals({
    requirementId: "REQ-AV",
    feedback: makeFeedback({ shadow_routing_decisions: avoidDecisions }),
  });

  const policyProposal = avoidResult.find((p) => p.type === "policy_adjustment");
  assert(policyProposal !== undefined, "policy_adjustment proposal exists");
  assert(policyProposal!.relatedAgent === "hermes", "relatedAgent is hermes");
  assert(policyProposal!.applied === false, "applied is false");
  console.log("");

  // ── Test 4: Bugfix attempts → agent_skill_gap ──
  console.log("Test 4: Bugfix attempts creates agent_skill_gap");
  const bugfixResult = buildEvolutionProposals({
    requirementId: "REQ-BF",
    feedback: makeFeedback({
      review_summary: { bugfixAttempts: 2, validationPassed: true },
    }),
  });

  const skillGap = bugfixResult.find((p) => p.type === "agent_skill_gap");
  assert(skillGap !== undefined, "agent_skill_gap proposal exists");
  assert(skillGap!.relatedNode === "implementation", "relatedNode is implementation");
  assert(skillGap!.applied === false, "applied is false");
  console.log("");

  // ── Test 5: Validation failed → test_coverage ──
  console.log("Test 5: Validation failed creates test_coverage");
  const valFailResult = buildEvolutionProposals({
    requirementId: "REQ-VF",
    feedback: makeFeedback({
      review_summary: { bugfixAttempts: 0, validationPassed: false },
    }),
  });

  const testCov = valFailResult.find((p) => p.type === "test_coverage");
  assert(testCov !== undefined, "test_coverage proposal exists");
  assert(testCov!.relatedNode === "validation", "relatedNode is validation");
  assert(testCov!.applied === false, "applied is false");
  console.log("");

  // ── Test 6: Manual review suggestion → manual_review_required ──
  console.log("Test 6: Manual review suggestion creates manual_review_required");
  const manualResult = buildEvolutionProposals({
    requirementId: "REQ-MR",
    feedback: makeFeedback({
      policy_suggestions: [
        { type: "manual_review", node: "implementation", reason: "needs review", confidence: 0.6 },
      ],
    }),
  });

  const manualProposal = manualResult.find((p) => p.type === "manual_review_required");
  assert(manualProposal !== undefined, "manual_review_required proposal exists");
  assert(manualProposal!.applied === false, "applied is false");
  assert(manualProposal!.confidence === 0.6, "confidence is 0.6");
  console.log("");

  // ── Test 7: Proposals are deterministic ──
  console.log("Test 7: Proposals are deterministic");
  const input = makeFeedback({
    shadow_routing_decisions: shadowDecisions,
    review_summary: { bugfixAttempts: 1, validationPassed: false },
    policy_suggestions: [
      { type: "manual_review", node: "implementation", reason: "needs review", confidence: 0.6 },
    ],
  });

  const result1 = buildEvolutionProposals({ requirementId: "REQ-DET", feedback: input });
  const result2 = buildEvolutionProposals({ requirementId: "REQ-DET", feedback: input });

  assert(
    JSON.stringify(result1) === JSON.stringify(result2),
    "same input produces identical output"
  );
  assert(result1.length > 0, "deterministic proposals are not empty");
  // All proposals have valid IDs and are not applied
  assert(
    result1.every((p) => p.id.startsWith("REQ-DET:evolution:")),
    "all proposal IDs follow expected format"
  );
  assert(
    result1.every((p) => p.applied === false),
    "all proposals have applied=false"
  );

  // Safety: proposals must not contain patch/Git/PR mutation fields
  const json = JSON.stringify(result1);
  assert(!json.includes('"patch"'), "JSON does not contain 'patch' field");
  assert(!json.includes('"branch"'), "JSON does not contain 'branch' field");
  assert(!json.includes('"commit"'), "JSON does not contain 'commit' field");
  assert(!json.includes('"pull_request"'), "JSON does not contain 'pull_request' field");
  assert(!json.includes('"pr_url"'), "JSON does not contain 'pr_url' field");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
