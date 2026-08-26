// Regression Test — C03 Delivery Tail (c1/c2/c3)
// ==================================================
// Verifies c1 development_path_entry guard, c2 documentation_governance_tail
// completion check, and c3 manual handoff checklist builder.
// Pure tests. No runtime, no agents, no DB, no Gateway.

import {
  developmentPathEntryGuard,
  checkDocumentationGovernanceTailCompletion,
  buildManualHandoffChecklist,
  type SolutionGateVerdict,
  type NodeEvidenceStatus,
} from "../core/loop-c03-delivery-tail";

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

  console.log("C03 Delivery Tail Test (c1/c2/c3)\n");

  // ═══════════════════════════════════════ c1: development_path_entry guard

  console.log("c1: development_path_entry deterministic guard");

  // PASS + DECIDED + depth + no blocking → allowed
  const passVerdict: SolutionGateVerdict = {
    gateResult: "PASS",
    depth: "STANDARD",
    decisionStatus: "DECIDED",
    blockingFindings: [],
    riskAcceptanceRefs: [],
    verdictArtifactRef: "loop-artifact:v1:gate_result:sha256:abc",
  };
  const passDecision = developmentPathEntryGuard(passVerdict);
  assert(passDecision.allowed === true, "PASS + DECIDED + depth → allowed");
  assert(passDecision.allowed && passDecision.depth === "STANDARD", "depth preserved in decision");

  // FAIL → blocked
  const failVerdict: SolutionGateVerdict = { ...passVerdict, gateResult: "FAIL" };
  const failDecision = developmentPathEntryGuard(failVerdict);
  assert(failDecision.allowed === false, "FAIL → blocked");
  assert(!failDecision.allowed && failDecision.reason.includes("FAIL"), "reason mentions FAIL");

  // BLOCKED_UNKNOWN → blocked
  const blockedVerdict: SolutionGateVerdict = { ...passVerdict, decisionStatus: "BLOCKED_UNKNOWN" };
  const blockedDecision = developmentPathEntryGuard(blockedVerdict);
  assert(blockedDecision.allowed === false, "BLOCKED_UNKNOWN → blocked");
  assert(!blockedDecision.allowed && blockedDecision.reason.includes("BLOCKED_UNKNOWN"), "reason mentions BLOCKED_UNKNOWN");

  // null depth → blocked
  const nullDepthVerdict: SolutionGateVerdict = { ...passVerdict, depth: null };
  const nullDepthDecision = developmentPathEntryGuard(nullDepthVerdict);
  assert(nullDepthDecision.allowed === false, "null depth → blocked");
  assert(!nullDepthDecision.allowed && nullDepthDecision.reason.includes("depth"), "reason mentions depth");

  // blocking findings → blocked
  const blockingVerdict: SolutionGateVerdict = { ...passVerdict, blockingFindings: ["F-001", "F-002"] };
  const blockingDecision = developmentPathEntryGuard(blockingVerdict);
  assert(blockingDecision.allowed === false, "blocking findings → blocked");
  if (blockingDecision.allowed === false) {
    assert(blockingDecision.blockingFindings.length === 2, "blocking findings preserved");
  }

  // PASS_WITH_RISK without acceptance → blocked
  const riskNoAcceptVerdict: SolutionGateVerdict = { ...passVerdict, gateResult: "PASS_WITH_RISK", riskAcceptanceRefs: [] };
  const riskNoAcceptDecision = developmentPathEntryGuard(riskNoAcceptVerdict);
  assert(riskNoAcceptDecision.allowed === false, "PASS_WITH_RISK without acceptance → blocked");

  // PASS_WITH_RISK with acceptance → allowed
  const riskWithAcceptVerdict: SolutionGateVerdict = { ...passVerdict, gateResult: "PASS_WITH_RISK", riskAcceptanceRefs: ["risk-acceptance:001"] };
  const riskWithAcceptDecision = developmentPathEntryGuard(riskWithAcceptVerdict);
  assert(riskWithAcceptDecision.allowed === true, "PASS_WITH_RISK with acceptance → allowed");

  // LIGHT/DEEP depth → allowed
  const lightVerdict: SolutionGateVerdict = { ...passVerdict, depth: "LIGHT" };
  assert(developmentPathEntryGuard(lightVerdict).allowed === true, "LIGHT depth → allowed");
  const deepVerdict: SolutionGateVerdict = { ...passVerdict, depth: "DEEP" };
  assert(developmentPathEntryGuard(deepVerdict).allowed === true, "DEEP depth → allowed");

  console.log("");

  // ═══════════════════════════════════════ c2: documentation_governance_tail_completion

  console.log("c2: documentation_governance_tail_completion check");

  // All 7 nodes present + gates met → complete
  const allEvidence: NodeEvidenceStatus[] = [
    { capability: "requirement-intake", artifactPresent: true, artifactRef: "ref:00", version: "v1", gateMet: true, notes: "" },
    { capability: "solution-design", artifactPresent: true, artifactRef: "ref:01", version: "v1", gateMet: true, notes: "" },
    { capability: "solution-gate", artifactPresent: true, artifactRef: "ref:02", version: "v1", gateMet: true, notes: "" },
    { capability: "task-planning", artifactPresent: true, artifactRef: "ref:03", version: "v1", gateMet: true, notes: "" },
    { capability: "implementation", artifactPresent: true, artifactRef: "ref:04", version: "v1", gateMet: true, notes: "" },
    { capability: "code-review", artifactPresent: true, artifactRef: "ref:05", version: "v1", gateMet: true, notes: "" },
    { capability: "knowledge-sync", artifactPresent: true, artifactRef: "ref:06", version: "v1", gateMet: true, notes: "" },
  ];
  const completeTail = checkDocumentationGovernanceTailCompletion(allEvidence);
  assert(completeTail.complete === true, "all 7 nodes present + gates met → complete");
  assert(completeTail.complete && completeTail.evidence.length === 7, "evidence preserved (7 nodes)");

  // Missing implementation → incomplete
  const missingImpl = allEvidence.filter((e) => e.capability !== "implementation");
  const incompleteTail = checkDocumentationGovernanceTailCompletion(missingImpl);
  assert(incompleteTail.complete === false, "missing implementation → incomplete");
  if (incompleteTail.complete === false) {
    assert(incompleteTail.missing.includes("implementation"), "missing list includes implementation");
  }

  // Gate not met → incomplete
  const gateNotMet = allEvidence.map((e) =>
    e.capability === "code-review" ? { ...e, gateMet: false } : e
  );
  const gateIncomplete = checkDocumentationGovernanceTailCompletion(gateNotMet);
  assert(gateIncomplete.complete === false, "code-review gate not met → incomplete");
  if (gateIncomplete.complete === false) {
    assert(gateIncomplete.missing.some((m) => m.includes("code-review")), "missing list includes code-review");
  }

  // Empty evidence → incomplete
  const emptyTail = checkDocumentationGovernanceTailCompletion([]);
  assert(emptyTail.complete === false, "empty evidence → incomplete");
  if (emptyTail.complete === false) {
    assert(emptyTail.missing.length === 7, "all 7 nodes missing");
  }

  console.log("");

  // ═══════════════════════════════════════ c3: manual handoff checklist builder

  console.log("c3: manual handoff checklist builder");

  const baseInput = {
    runId: "run-001",
    requirementId: "REQ-001",
    generation: 1,
    implementationRecord: {
      present: true,
      artifactRef: "ref:04",
      summary: "Implemented feature X per approved design",
      unexecutedItems: [],
    },
    codeReview: {
      present: true,
      artifactRef: "ref:05",
      summary: "No blocking findings; 2 low findings accepted",
      openFindings: [],
      closureReviewDone: true,
    },
    knowledgeSync: {
      present: true,
      artifactRef: "ref:06",
      decision: "APPLY_LOCAL" as const,
      summary: "3 stable facts synced to business domain",
    },
    residualRisks: [],
    recoveryInstructions: "Restore from git stash; re-run from implementation node",
    evidenceDigest: "sha256:def",
    tailStatus: completeTail,
    pathEntry: passDecision,
  };

  // All checks pass → READY_FOR_MANUAL_GIT_HANDOFF
  const readyChecklist = buildManualHandoffChecklist(baseInput);
  assert(readyChecklist.status === "READY_FOR_MANUAL_GIT_HANDOFF", "all checks pass → READY_FOR_MANUAL_GIT_HANDOFF");
  assert(readyChecklist.schema === "c03-manual-handoff-checklist-v1", "schema correct");
  assert(readyChecklist.reason.includes("ready"), "reason mentions ready");
  assert(readyChecklist.implementationRecord.present === true, "implementation record preserved");
  assert(readyChecklist.codeReview.present === true, "code review preserved");
  assert(readyChecklist.knowledgeSync.decision === "APPLY_LOCAL", "knowledge sync decision preserved");
  assert(readyChecklist.generatedAt.length > 0, "generatedAt populated");

  // Missing implementation record → BLOCKED
  const missingImplInput = { ...baseInput, implementationRecord: { ...baseInput.implementationRecord, present: false } };
  const missingImplChecklist = buildManualHandoffChecklist(missingImplInput);
  assert(missingImplChecklist.status === "BLOCKED", "missing implementation record → BLOCKED");
  assert(missingImplChecklist.reason.includes("implementation record missing"), "reason mentions implementation record");

  // Open code review findings → BLOCKED
  const openFindingsInput = { ...baseInput, codeReview: { ...baseInput.codeReview, openFindings: ["CR-001"] } };
  const openFindingsChecklist = buildManualHandoffChecklist(openFindingsInput);
  assert(openFindingsChecklist.status === "BLOCKED", "open code review findings → BLOCKED");

  // Closure review not done → BLOCKED
  const noClosureInput = { ...baseInput, codeReview: { ...baseInput.codeReview, closureReviewDone: false } };
  const noClosureChecklist = buildManualHandoffChecklist(noClosureInput);
  assert(noClosureChecklist.status === "BLOCKED", "closure review not done → BLOCKED");

  // knowledge sync BLOCKED_CONFLICT → BLOCKED
  const conflictInput = { ...baseInput, knowledgeSync: { ...baseInput.knowledgeSync, decision: "BLOCKED_CONFLICT" as const } };
  const conflictChecklist = buildManualHandoffChecklist(conflictInput);
  assert(conflictChecklist.status === "BLOCKED", "knowledge sync BLOCKED_CONFLICT → BLOCKED");

  // High residual risk without acceptance → BLOCKED
  const highRiskInput = {
    ...baseInput,
    residualRisks: [{ id: "R-001", description: "Data migration risk", severity: "high" as const, acceptanceRef: null }],
  };
  const highRiskChecklist = buildManualHandoffChecklist(highRiskInput);
  assert(highRiskChecklist.status === "BLOCKED", "high residual risk without acceptance → BLOCKED");

  // High residual risk with acceptance → READY
  const acceptedRiskInput = {
    ...baseInput,
    residualRisks: [{ id: "R-001", description: "Data migration risk", severity: "high" as const, acceptanceRef: "risk-acceptance:001" }],
  };
  const acceptedRiskChecklist = buildManualHandoffChecklist(acceptedRiskInput);
  assert(acceptedRiskChecklist.status === "READY_FOR_MANUAL_GIT_HANDOFF", "high residual risk with acceptance → READY");

  // Tail incomplete → BLOCKED
  const incompleteTailInput = { ...baseInput, tailStatus: incompleteTail };
  const incompleteTailChecklist = buildManualHandoffChecklist(incompleteTailInput);
  assert(incompleteTailChecklist.status === "BLOCKED", "tail incomplete → BLOCKED");

  // Unexecuted items preserved
  const unexecutedInput = {
    ...baseInput,
    implementationRecord: { ...baseInput.implementationRecord, unexecutedItems: ["Optional perf optimization"] },
  };
  const unexecutedChecklist = buildManualHandoffChecklist(unexecutedInput);
  assert(unexecutedChecklist.implementationRecord.unexecutedItems.length === 1, "unexecuted items preserved");
  assert(unexecutedChecklist.status === "READY_FOR_MANUAL_GIT_HANDOFF", "unexecuted optional items don't block");

  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
