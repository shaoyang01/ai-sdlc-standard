// G6 / D-090-04 — behavior-layer negative matrix (R1-H1 remediation)
// ============================================================================
// The reviewer's counterexample: S-CORE-STANDARD-PASS-first runs
// COMPLETED/success while the production entry's REAL handoff checklist
// reports BLOCKED ("code review closure review not done") — and the old
// comparator still printed final-handoff=MATCH, because dim 9 read a success
// proxy and the driver discarded the handoff fields.
//
// These cases pin the remediated instrument: the REAL handoff triple is
// compared field-for-field; a BLOCKED handoff is never reported as MATCH;
// missing evidence refuses to judge; per-round Gate binding entries and
// per-round admission are verified against the observed dispatches. The
// routed production finding is R-G6-01 (the c3 checklist's closureReviewDone
// reads the code-review event's gateResult, which the event contract pins to
// NOT_APPLICABLE for non-formal_verdict executions).

import { coreCrashResumeScenarios, coreFirstRoundScenarios, coreFeedbackRegateScenarios, coreOverLimitPauseScenarios } from "./g6-parity/fact-scripts";
import { driveBehaviorLayer, makeBehaviorWorkspace, removeBehaviorWorkspace, type BehaviorTrace } from "./g6-parity/behavior-face";
import { driveManualFace } from "./g6-parity/manual-face";
import { compareBehaviorLayer } from "./g6-parity/behavior-comparator";
import { makeStores } from "./g6-parity/runtime-face";
import { assertScenarioLedger, loadFrozenLedger, runNegativeSuite } from "./g6-parity/ledger-guard";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FactScript, NodeFact, ScenarioSpec } from "./g6-parity/types";


const NODE_ORDER = [
  "requirement-intake", "solution-design", "solution-gate", "task-planning",
  "implementation", "code-review", "knowledge-sync",
];

/** The script's expected terminal sequence (the dual-role gate expands). */
function expectedTerminals(script: FactScript): BehaviorTrace["terminals"] {
  const terminals: { capability: string; executionRole: string; attempt: number; status: string }[] = [];
  for (const node of script.nodes) {
    const attempt = node.attempt ?? 1;
    if (node.node === "solution-gate") {
      terminals.push({ capability: "solution-gate", executionRole: "adversarial_scan", attempt, status: "succeeded" });
      terminals.push({ capability: "solution-gate", executionRole: "formal_verdict", attempt, status: "succeeded" });
    } else {
      terminals.push({ capability: node.node, executionRole: "primary", attempt, status: "succeeded" });
    }
  }
  return terminals;
}

/** A spec-conforming trace for a script: the completing shape with a real,
 *  spec-semantic handoff triple (READY_FOR_MANUAL_GIT_HANDOFF + artifact). */
function traceFor(script: FactScript, overrides: Partial<BehaviorTrace> = {}): BehaviorTrace {
  const terminals = expectedTerminals(script);
  const reflowTargets: string[] = [];
  let previousIndex = -1;
  for (const terminal of terminals) {
    const index = NODE_ORDER.indexOf(terminal.capability);
    if (index < previousIndex && !reflowTargets.includes(terminal.capability)) reflowTargets.push(terminal.capability);
    previousIndex = index;
  }
  const completes = script.nodes[script.nodes.length - 1]?.node === "knowledge-sync";
  const base: BehaviorTrace = {
    dispatched: terminals.map((t) => `${t.capability}:${t.executionRole}`),
    terminals,
    verdicts: script.nodes
      .filter((node) => node.node === "solution-gate")
      .map((node) => ({
        capability: "solution-gate",
        executionRole: "formal_verdict",
        attempt: node.attempt ?? 1,
        gateResult: node.gateResult ?? "PASS",
        decisionStatus: node.decisionStatus ?? "CONFIRMED",
        decisionDepth: node.decisionDepth ?? null,
      })),
    reflowTargets,
    finalStatus: "success",
    chainStatus: "COMPLETED",
    blockingReasonCode: null,
    nextExecutionPoint: null,
    // R3-H1 defaults: no generation advance, no WP-1 record — the synthetic
    // traces carry no journal evidence unless a case injects it.
    generationRestarts: [],
    generation: 1,
    handoff: completes
      ? { status: "READY_FOR_MANUAL_GIT_HANDOFF", reason: null, artifactRef: "loop-artifact:v1:governance_tail_result:sha256:" + "a".repeat(64) }
      : { status: null, reason: null, artifactRef: null },
  };
  return { ...base, ...overrides };
}

const passSpec = coreFirstRoundScenarios().find((s) => s.id === "S-CORE-STANDARD-PASS-first")!;
const failSpec = coreFirstRoundScenarios().find((s) => s.id === "S-CORE-LIGHT-FAIL-first")!;
const passScript = passSpec.build();
const failScript = failSpec.build();
// ── 7. the real-scenario pin: the production entry's ACTUAL handoff ───────
// Drive S-CORE-STANDARD-PASS-first through the production entry and assert
// the observed handoff triple IS the routed production finding — the
// reviewer's counterexample as a permanent regression.
function r1h1CorePins(ok: (condition: boolean, message: string) => void): void {
// ── 1. the conforming positive control ────────────────────────────────────
{
  const result = compareBehaviorLayer(passScript, traceFor(passScript));
  ok(result.equal, "conforming trace: all six behavior dimensions MATCH");
}

// ── 2. R-G6-01 pin: the reviewer's counterexample ─────────────────────────
// The chain completes (COMPLETED/success) but the entry's REAL checklist is
// BLOCKED "code review closure review not done" — dim 9 MUST diverge.
{
  const trace = traceFor(passScript, {
    handoff: {
      status: "BLOCKED",
      reason: "code review closure review not done",
      artifactRef: "loop-artifact:v1:governance_tail_result:sha256:" + "b".repeat(64),
    },
  });
  const result = compareBehaviorLayer(passScript, trace);
  const dim9 = result.dimensions.find((d) => d.dimension === "final-handoff");
  ok(dim9?.verdict === "DIVERGE" && !result.equal,
    "R-G6-01: a BLOCKED handoff on a COMPLETED chain DIVERGEs (never MATCH)");
}

// ── 3. missing evidence refuses to judge ──────────────────────────────────
{
  const trace = traceFor(passScript, { handoff: { status: null, reason: null, artifactRef: null } });
  const dim9 = compareBehaviorLayer(passScript, trace).dimensions.find((d) => d.dimension === "final-handoff");
  ok(dim9?.verdict === "DIVERGE" && /refusing to judge/.test(dim9?.detail ?? ""),
    "dim 9: a missing handoff triple refuses to judge (never a silent MATCH)");
}

// ── 4. the artifact ref is part of the identity ───────────────────────────
{
  const trace = traceFor(passScript, {
    handoff: { status: "READY_FOR_MANUAL_GIT_HANDOFF", reason: null, artifactRef: null },
  });
  const dim9 = compareBehaviorLayer(passScript, trace).dimensions.find((d) => d.dimension === "final-handoff");
  ok(dim9?.verdict === "DIVERGE", "dim 9: the expected artifact ref missing → DIVERGE");
}
{
  const trace = traceFor(passScript, {
    handoff: { status: "READY_FOR_MANUAL_GIT_HANDOFF", reason: "forged reason", artifactRef: "loop-artifact:v1:governance_tail_result:sha256:" + "c".repeat(64) },
  });
  const dim9 = compareBehaviorLayer(passScript, trace).dimensions.find((d) => d.dimension === "final-handoff");
  ok(dim9?.verdict === "DIVERGE", "dim 9: a reason drift → DIVERGE");
}

// ── 5. dim 2: per-round binding entries, not counts ───────────────────────
{
  const terminals = expectedTerminals(passScript).filter(
    (t) => !(t.capability === "solution-gate" && t.executionRole === "adversarial_scan"),
  );
  const dim2 = compareBehaviorLayer(passScript, traceFor(passScript, { terminals })).dimensions.find((d) => d.dimension === "gate-roles");
  ok(dim2?.verdict === "DIVERGE", "dim 2: a round missing its scan binding entry → DIVERGE (counts would have passed)");
}
{
  const terminals = expectedTerminals(passScript).map((t) =>
    t.capability === "solution-gate" && t.executionRole === "formal_verdict" ? { ...t, attempt: t.attempt + 5 } : t,
  );
  const dim2 = compareBehaviorLayer(passScript, traceFor(passScript, { terminals })).dimensions.find((d) => d.dimension === "gate-roles");
  ok(dim2?.verdict === "DIVERGE", "dim 2: a misattempted binding entry → DIVERGE");
}

// ── 6. dim 7: per-round admission, grounded in the dispatches ─────────────
// A FAIL verdict followed by FORWARD progress (task-planning) violates the
// §7.3 A1 admission semantics — the old chain-boolean would not have caught it.
{
  const terminals = [...expectedTerminals(failScript)];
  const failVerdictIdx = terminals.findIndex(
    (t) => t.capability === "solution-gate" && t.executionRole === "formal_verdict" && t.attempt === 1,
  );
  terminals[failVerdictIdx + 1] = { capability: "task-planning", executionRole: "primary", attempt: 1, status: "succeeded" };
  const dim7 = compareBehaviorLayer(failScript, traceFor(failScript, { terminals })).dimensions.find((d) => d.dimension === "next-eligibility");
  ok(dim7?.verdict === "DIVERGE", "dim 7: forward progress after a FAIL verdict → DIVERGE (admission violation)");
}
// A backward jump to the WRONG node after a non-admitting verdict also fails.
{
  const terminals = [...expectedTerminals(failScript)];
  const failVerdictIdx = terminals.findIndex(
    (t) => t.capability === "solution-gate" && t.executionRole === "formal_verdict" && t.attempt === 1,
  );
  terminals[failVerdictIdx + 1] = { capability: "requirement-intake", executionRole: "primary", attempt: 2, status: "succeeded" };
  const dim7 = compareBehaviorLayer(failScript, traceFor(failScript, { terminals })).dimensions.find((d) => d.dimension === "next-eligibility");
  ok(dim7?.verdict === "DIVERGE", "dim 7: the reflow jumping to the wrong node → DIVERGE");
}
}

async function realRunPin(ok: (condition: boolean, message: string) => void): Promise<void> {
  const workspace = makeBehaviorWorkspace();
  const stores = makeStores("negative-handoff");
  try {
    const run = await driveBehaviorLayer(stores, passScript, workspace);
    ok(
      run.trace.handoff.status === "BLOCKED" &&
        run.trace.handoff.reason === "code review closure review not done" &&
        run.trace.handoff.artifactRef !== null &&
        run.trace.chainStatus === "COMPLETED" &&
        run.trace.finalStatus === "success",
      "real run: the entry's handoff is BLOCKED/'code review closure review not done' while the chain COMPLETED (R-G6-01 observed)",
    );
    const dim9 = compareBehaviorLayer(passScript, run.trace).dimensions.find((d) => d.dimension === "final-handoff");
    ok(dim9?.verdict === "DIVERGE", "real run: the comparator DIVERGEs on that handoff (no MATCH on BLOCKED)");
  } finally {
    stores.runStore.close();
    rmSync(stores.root, { recursive: true, force: true });
    removeBehaviorWorkspace(workspace);
  }
}

// ── 4c. the WP-1 generation restart (R2-H1-A / R3-H1) ─────────────────────
// The F family's feedback path legitimately returns to requirement-intake
// after an ADMITTING gate verdict — a declared new-generation restart, not a
// finding reflow. R3-H1: the admission is grounded in the JOURNAL evidence,
// not the declaration: the verified WP-1 record (FEEDBACK_DRIVEN_CHANGE /
// CLASSIFIED / generation 1→2 / the trigger round) AND the restart intake's
// new-generation attempt. The real run must pass; every stripped, forged or
// misattempted variant of the same trajectory must DIVERGE.
function absentPin(ok: (condition: boolean, message: string) => void): void {
// ── 4b. ABSENT means ALL-NULL (R2-H1-B) ──────────────────────────────────
// The chain never completed, so the entry builds no handoff artifact: a
// non-null reason or artifactRef on a null status is fabricated evidence.
{
  const overSpec = coreOverLimitPauseScenarios().find((s) => s.id === "S-CORE-STANDARD-FAIL-overlimit-pause")!;
  const overScript = overSpec.build();
  for (const [label, handoff] of [
    ["reason", { status: null, reason: "injected reason", artifactRef: null }],
    ["ref", { status: null, reason: null, artifactRef: "loop-artifact:v1:governance_tail_result:sha256:" + "d".repeat(64) }],
  ] as const) {
    const dim9 = compareBehaviorLayer(overScript, traceFor(overScript, { handoff })).dimensions.find((d) => d.dimension === "final-handoff");
    ok(dim9?.verdict === "DIVERGE", `dim 9: ABSENT expectation with a fabricated ${label} → DIVERGE`);
  }
  const clean = compareBehaviorLayer(overScript, traceFor(overScript)).dimensions.find((d) => d.dimension === "final-handoff");
  ok(clean?.verdict === "MATCH", "dim 9: the over-limit ABSENT triple (all null) MATCHes");
}
}

async function feedbackRestartPin(ok: (condition: boolean, message: string) => void): Promise<void> {
  const fSpec = coreFeedbackRegateScenarios().find((s) => s.id === "S-CORE-DEEP-PASS-feedback-regate-post-gate")!;
  const fScript = fSpec.build();
  const workspace = makeBehaviorWorkspace();
  const stores = makeStores("negative-feedback");
  try {
    const run = await driveBehaviorLayer(stores, fScript, workspace);
    const dim7 = (trace: BehaviorTrace) =>
      compareBehaviorLayer(fScript, trace).dimensions.find((d) => d.dimension === "next-eligibility");
    const record = run.trace.generationRestarts.find((item) => item.changeKind === "FEEDBACK_DRIVEN_CHANGE");
    if (
      record === undefined ||
      record.status !== "CLASSIFIED" ||
      record.previousGeneration !== 1 ||
      run.trace.generation !== 2 ||
      record.triggerCapability !== "solution-gate" ||
      record.triggerAttempt !== 1
    ) {
      ok(false, "real run: the WP-1 record is journal-verified in the trace (FEEDBACK_DRIVEN_CHANGE/CLASSIFIED/gen 1→2, trigger solution-gate@1)");
      return;
    }
    ok(true, "real run: the WP-1 record is journal-verified in the trace (FEEDBACK_DRIVEN_CHANGE/CLASSIFIED/gen 1→2, trigger solution-gate@1)");
    ok(dim7(run.trace)?.verdict === "MATCH", "dim 7: the declared + journal-verified WP-1 generation restart to requirement-intake MATCHes (F post-gate)");
    const undeclared: FactScript = Object.freeze({
      ...fScript,
      nodes: fScript.nodes.map((node) => (node.opensFeedbackChange === true ? { ...node, opensFeedbackChange: false } : node)),
    });
    const undeclaredDim7 = compareBehaviorLayer(undeclared, run.trace).dimensions.find((d) => d.dimension === "next-eligibility");
    ok(undeclaredDim7?.verdict === "DIVERGE", "dim 7: the same restart WITHOUT the declared WP-1 trigger DIVERGEs");
    // R3-H1 attack surface — each variant keeps the trajectory shape and only
    // removes/forges the evidence the admission must require:
    ok(dim7({ ...run.trace, generationRestarts: [] })?.verdict === "DIVERGE",
      "R3-H1: the real trajectory with the WP-1 record evidence stripped → DIVERGE");
    ok(dim7({ ...run.trace, generationRestarts: [{ ...record, changeKind: "REQUIREMENT_CHANGE" }] })?.verdict === "DIVERGE",
      "R3-H1: a wrong-record-type WP-1 entry → DIVERGE");
    ok(dim7({ ...run.trace, generationRestarts: [{ ...record, status: "BLOCKED" }] })?.verdict === "DIVERGE",
      "R3-H1: a non-CLASSIFIED WP-1 record → DIVERGE");
    ok(dim7({ ...run.trace, generationRestarts: [{ ...record, previousGeneration: 2 }] })?.verdict === "DIVERGE",
      "R3-H1: a wrong-generation WP-1 record (gen 2→3 against a run at gen 2) → DIVERGE");
    ok(dim7({ ...run.trace, generationRestarts: [{ ...record, previousGeneration: null }] })?.verdict === "DIVERGE",
      "R3-H1: a WP-1 record with no generation binding → DIVERGE");
    ok(dim7({ ...run.trace, generationRestarts: [{ ...record, triggerAttempt: 9 }] })?.verdict === "DIVERGE",
      "R3-H1: a WP-1 record attributed to the wrong trigger round → DIVERGE");
    ok(dim7({ ...run.trace, generationRestarts: [{ ...record, triggerCapability: "code-review" }] })?.verdict === "DIVERGE",
      "R3-H1: a WP-1 record attributed to the wrong trigger capability → DIVERGE");
    // The new-generation attempt: the restart intake re-dispatched at the
    // run's continuing attempt (2); a fresh attempt-1 intake is a fabricated
    // restart and must not print MATCH.
    const restartIntakeIdx = run.trace.terminals.findIndex(
      (t) => t.capability === "requirement-intake" && t.attempt === 2,
    );
    if (restartIntakeIdx < 0) {
      ok(false, "real run: the generation-2 intake is observed at attempt 2");
      return;
    }
    ok(true, "real run: the generation-2 intake is observed at attempt 2");
    const flipped = run.trace.terminals.map((t, i) => (i === restartIntakeIdx ? { ...t, attempt: 1 } : t));
    ok(dim7({ ...run.trace, terminals: flipped })?.verdict === "DIVERGE",
      "R3-H1: the new-generation intake re-dispatched at attempt 1 → DIVERGE");
    // R4-H2: a declared restart is an EXPECTATION — the declaration must not
    // ride the forward admission. Replace the restart intake with a forward
    // (and, secondarily, a non-intake backward) node and strip the record.
    const gateVerdictIdx = run.trace.terminals.findIndex(
      (t) => t.capability === "solution-gate" && t.executionRole === "formal_verdict" && t.attempt === 1,
    );
    const forwardMasked = run.trace.terminals.map((t, i) =>
      i === gateVerdictIdx + 1 ? { capability: "task-planning", executionRole: "primary", attempt: 1, status: "succeeded" } : t,
    );
    ok(dim7({ ...run.trace, terminals: forwardMasked, generationRestarts: [] })?.verdict === "DIVERGE",
      "R4-H2: a declared restart whose next dispatch is FORWARD (no WP-1 record) → DIVERGE (no forward mask)");
    const backwardMasked = run.trace.terminals.map((t, i) =>
      i === gateVerdictIdx + 1 ? { capability: "solution-design", executionRole: "primary", attempt: 2, status: "succeeded" } : t,
    );
    ok(dim7({ ...run.trace, terminals: backwardMasked, generationRestarts: [] })?.verdict === "DIVERGE",
      "R4-H2: a declared restart jumping to a non-intake node → DIVERGE");
  } finally {
    stores.runStore.close();
    rmSync(stores.root, { recursive: true, force: true });
    removeBehaviorWorkspace(workspace);
  }
}

function twoGenerationPin(ok: (condition: boolean, message: string) => void): void {
// ── 4d. the two-generation feedback wave (R4-H1) ───────────────────────────
// The store accepts consecutive CLASSIFIED WP-1 records (generations
// 1→2→3): the ordered generation binding must admit the legal dual-restart
// trajectory. Each declared trigger expects the record whose
// previousGeneration is its wave index; only the LAST declared wave is
// anchored to the run's final generation.
const twoWaveNodes: NodeFact[] = [
  { node: "requirement-intake", artifactKind: "requirement_summary", content: "intake v1", version: "1.0.0" },
  { node: "solution-design", artifactKind: "technical_design", content: "design v1", version: "1.0.0" },
  { node: "solution-gate", artifactKind: "solution_review", content: "gate v1", version: "1.0.0", gateResult: "PASS", decisionStatus: "CONFIRMED", decisionDepth: "DEEP", opensFeedbackChange: true },
  { node: "requirement-intake", artifactKind: "requirement_summary", content: "intake v2", version: "2.0.0", attempt: 2 },
  { node: "solution-design", artifactKind: "technical_design", content: "design v2", version: "2.0.0", attempt: 2 },
  { node: "solution-gate", artifactKind: "solution_review", content: "gate v2", version: "2.0.0", attempt: 2, gateResult: "PASS", decisionStatus: "CONFIRMED", decisionDepth: "DEEP", opensFeedbackChange: true },
  { node: "requirement-intake", artifactKind: "requirement_summary", content: "intake v3", version: "3.0.0", attempt: 3 },
  { node: "solution-design", artifactKind: "technical_design", content: "design v3", version: "3.0.0", attempt: 3 },
  { node: "solution-gate", artifactKind: "solution_review", content: "gate v3", version: "3.0.0", attempt: 3, gateResult: "PASS", decisionStatus: "CONFIRMED", decisionDepth: "DEEP" },
  { node: "task-planning", artifactKind: "task_plan", content: "plan v3", version: "1.0.0" },
  { node: "implementation", artifactKind: "implementation_record", content: "impl v3", version: "1.0.0" },
  { node: "code-review", artifactKind: "review_summary", content: "review v3", version: "1.0.0" },
  { node: "knowledge-sync", artifactKind: "knowledge_sync_result", content: "knowledge v3", version: "1.0.0" },
];
const twoWaveScript: FactScript = Object.freeze({
  requirementId: "20260920-two-wave-feedback",
  requestedDepth: "DEEP",
  findings: [],
  nodes: twoWaveNodes,
});

const twoWaveRestart = (previousGeneration: number, triggerAttempt: number) => ({
  changeKind: "FEEDBACK_DRIVEN_CHANGE",
  status: "CLASSIFIED",
  previousGeneration,
  triggerCapability: "solution-gate",
  triggerAttempt,
});

{
  const dim7 = (trace: BehaviorTrace) =>
    compareBehaviorLayer(twoWaveScript, trace).dimensions.find((d) => d.dimension === "next-eligibility");
  const legalTrace = traceFor(twoWaveScript, {
    generationRestarts: [twoWaveRestart(1, 1), twoWaveRestart(2, 2)],
    generation: 3,
  });
  ok(dim7(legalTrace)?.verdict === "MATCH", "R4-H1: the legal dual-generation wave (records gen 1 and 2, run at gen 3) MATCHes");
  ok(compareBehaviorLayer(twoWaveScript, legalTrace).equal,
    "R4-H1: the legal dual-generation trace passes all six behavior dimensions");
  ok(dim7(traceFor(twoWaveScript, {
    generationRestarts: [{ ...twoWaveRestart(5, 1) }, twoWaveRestart(2, 2)],
    generation: 3,
  }))?.verdict === "DIVERGE", "R4-H1: the first wave's record carrying the wrong generation → DIVERGE");
  ok(dim7(traceFor(twoWaveScript, {
    generationRestarts: [twoWaveRestart(1, 1), { ...twoWaveRestart(9, 2) }],
    generation: 3,
  }))?.verdict === "DIVERGE", "R4-H1: the last wave's record carrying the wrong generation → DIVERGE");
  ok(dim7(traceFor(twoWaveScript, {
    generationRestarts: [twoWaveRestart(1, 1), twoWaveRestart(2, 2)],
    generation: 5,
  }))?.verdict === "DIVERGE", "R4-H1: the run's final generation drifting past the last declared wave → DIVERGE");
  ok(dim7(traceFor(twoWaveScript, {
    generationRestarts: [twoWaveRestart(1, 1)],
    generation: 2,
  }))?.verdict === "DIVERGE", "R4-H1: the second declared wave with no journal record → DIVERGE");
}
}

// ── 4f. the S-CRASH recovery fails closed on an inconsistent state ─────────
// The interrupt-reentry resume must never silently continue: a re-entry
// against a TAMPERED published manifest (the self-digest corrupted) is
// refused by the entry preflight's level-1 discrimination
// (MANIFEST_CORRUPT_STOP) — the durable block, not a fabricated progress.
function mixedWavePin(ok: (condition: boolean, message: string) => void): void {
// ── 4e. mixed-kind WP-1 waves (R5-H1) ─────────────────────────────────────
// The record check owns EVERY declared wave, whatever its trigger kind: the
// per-gate-round admission loop cannot see a review-triggered wave, so a
// gate→review (or review→gate) chain must still verify the review wave's
// record, attribution, ordered generation and the final-generation anchor.
const gateThenReviewNodes: NodeFact[] = [
  { node: "requirement-intake", artifactKind: "requirement_summary", content: "intake v1", version: "1.0.0" },
  { node: "solution-design", artifactKind: "technical_design", content: "design v1", version: "1.0.0" },
  { node: "solution-gate", artifactKind: "solution_review", content: "gate v1", version: "1.0.0", gateResult: "PASS", decisionStatus: "CONFIRMED", decisionDepth: "DEEP", opensFeedbackChange: true },
  { node: "requirement-intake", artifactKind: "requirement_summary", content: "intake v2", version: "2.0.0", attempt: 2 },
  { node: "solution-design", artifactKind: "technical_design", content: "design v2", version: "2.0.0", attempt: 2 },
  { node: "solution-gate", artifactKind: "solution_review", content: "gate v2", version: "2.0.0", attempt: 2, gateResult: "PASS", decisionStatus: "CONFIRMED", decisionDepth: "DEEP" },
  { node: "task-planning", artifactKind: "task_plan", content: "plan v2", version: "2.0.0", attempt: 2 },
  { node: "implementation", artifactKind: "implementation_record", content: "impl v2", version: "2.0.0", attempt: 2 },
  { node: "code-review", artifactKind: "review_summary", content: "review v2", version: "2.0.0", attempt: 2, opensFeedbackChange: true },
  { node: "requirement-intake", artifactKind: "requirement_summary", content: "intake v3", version: "3.0.0", attempt: 3 },
  { node: "solution-design", artifactKind: "technical_design", content: "design v3", version: "3.0.0", attempt: 3 },
  { node: "solution-gate", artifactKind: "solution_review", content: "gate v3", version: "3.0.0", attempt: 3, gateResult: "PASS", decisionStatus: "CONFIRMED", decisionDepth: "DEEP" },
  { node: "task-planning", artifactKind: "task_plan", content: "plan v3", version: "1.0.0" },
  { node: "implementation", artifactKind: "implementation_record", content: "impl v3", version: "1.0.0" },
  { node: "code-review", artifactKind: "review_summary", content: "review v3", version: "1.0.0" },
  { node: "knowledge-sync", artifactKind: "knowledge_sync_result", content: "knowledge v3", version: "1.0.0" },
];
const gateThenReviewScript: FactScript = Object.freeze({
  requirementId: "20260920-gate-then-review-feedback",
  requestedDepth: "DEEP",
  findings: [],
  nodes: gateThenReviewNodes,
});

const reviewThenGateNodes: NodeFact[] = [
  { node: "requirement-intake", artifactKind: "requirement_summary", content: "intake v1", version: "1.0.0" },
  { node: "solution-design", artifactKind: "technical_design", content: "design v1", version: "1.0.0" },
  { node: "solution-gate", artifactKind: "solution_review", content: "gate v1", version: "1.0.0", gateResult: "PASS", decisionStatus: "CONFIRMED", decisionDepth: "DEEP" },
  { node: "task-planning", artifactKind: "task_plan", content: "plan v1", version: "1.0.0" },
  { node: "implementation", artifactKind: "implementation_record", content: "impl v1", version: "1.0.0" },
  { node: "code-review", artifactKind: "review_summary", content: "review v1", version: "1.0.0", opensFeedbackChange: true },
  { node: "requirement-intake", artifactKind: "requirement_summary", content: "intake v2", version: "2.0.0", attempt: 2 },
  { node: "solution-design", artifactKind: "technical_design", content: "design v2", version: "2.0.0", attempt: 2 },
  { node: "solution-gate", artifactKind: "solution_review", content: "gate v2", version: "2.0.0", attempt: 2, gateResult: "PASS", decisionStatus: "CONFIRMED", decisionDepth: "DEEP", opensFeedbackChange: true },
  { node: "requirement-intake", artifactKind: "requirement_summary", content: "intake v3", version: "3.0.0", attempt: 3 },
  { node: "solution-design", artifactKind: "technical_design", content: "design v3", version: "3.0.0", attempt: 3 },
  { node: "solution-gate", artifactKind: "solution_review", content: "gate v3", version: "3.0.0", attempt: 3, gateResult: "PASS", decisionStatus: "CONFIRMED", decisionDepth: "DEEP" },
  { node: "task-planning", artifactKind: "task_plan", content: "plan v3", version: "1.0.0" },
  { node: "implementation", artifactKind: "implementation_record", content: "impl v3", version: "1.0.0" },
  { node: "code-review", artifactKind: "review_summary", content: "review v3", version: "1.0.0" },
  { node: "knowledge-sync", artifactKind: "knowledge_sync_result", content: "knowledge v3", version: "1.0.0" },
];
const reviewThenGateScript: FactScript = Object.freeze({
  requirementId: "20260920-review-then-gate-feedback",
  requestedDepth: "DEEP",
  findings: [],
  nodes: reviewThenGateNodes,
});

{
  const dim7GateThenReview = (trace: BehaviorTrace) =>
    compareBehaviorLayer(gateThenReviewScript, trace).dimensions.find((d) => d.dimension === "next-eligibility");
  const legalGateThenReview = traceFor(gateThenReviewScript, {
    generationRestarts: [
      { changeKind: "FEEDBACK_DRIVEN_CHANGE", status: "CLASSIFIED", previousGeneration: 1, triggerCapability: "solution-gate", triggerAttempt: 1 },
      { changeKind: "FEEDBACK_DRIVEN_CHANGE", status: "CLASSIFIED", previousGeneration: 2, triggerCapability: "code-review", triggerAttempt: 2 },
    ],
    generation: 3,
  });
  ok(dim7GateThenReview(legalGateThenReview)?.verdict === "MATCH",
    "R5-H1: the legal gate→review wave (records gen 1+2, run at gen 3) MATCHes");
  ok(compareBehaviorLayer(gateThenReviewScript, legalGateThenReview).equal,
    "R5-H1: the legal gate→review trace passes all six behavior dimensions");
  ok(dim7GateThenReview(traceFor(gateThenReviewScript, {
    generationRestarts: [
      { changeKind: "FEEDBACK_DRIVEN_CHANGE", status: "CLASSIFIED", previousGeneration: 1, triggerCapability: "solution-gate", triggerAttempt: 1 },
    ],
    generation: 3,
  }))?.verdict === "DIVERGE", "R5-H1: the gate→review chain with the REVIEW (last) wave's record stripped → DIVERGE");
  ok(dim7GateThenReview(traceFor(gateThenReviewScript, {
    generationRestarts: [
      { changeKind: "FEEDBACK_DRIVEN_CHANGE", status: "CLASSIFIED", previousGeneration: 1, triggerCapability: "solution-gate", triggerAttempt: 1 },
      { changeKind: "FEEDBACK_DRIVEN_CHANGE", status: "CLASSIFIED", previousGeneration: 2, triggerCapability: "", triggerAttempt: 2 },
    ],
    generation: 3,
  }))?.verdict === "DIVERGE", "R5-H1: the gate→review chain with the review wave's attribution blanked → DIVERGE");
  ok(dim7GateThenReview(traceFor(gateThenReviewScript, {
    generationRestarts: [
      { changeKind: "FEEDBACK_DRIVEN_CHANGE", status: "CLASSIFIED", previousGeneration: 1, triggerCapability: "solution-gate", triggerAttempt: 1 },
      { changeKind: "FEEDBACK_DRIVEN_CHANGE", status: "CLASSIFIED", previousGeneration: 2, triggerCapability: "code-review", triggerAttempt: 2 },
    ],
    generation: 4,
  }))?.verdict === "DIVERGE", "R5-H1: the gate→review chain with the final generation drifted 3→4 → DIVERGE");

  const dim7ReviewThenGate = (trace: BehaviorTrace) =>
    compareBehaviorLayer(reviewThenGateScript, trace).dimensions.find((d) => d.dimension === "next-eligibility");
  ok(dim7ReviewThenGate(traceFor(reviewThenGateScript, {
    generationRestarts: [
      { changeKind: "FEEDBACK_DRIVEN_CHANGE", status: "CLASSIFIED", previousGeneration: 1, triggerCapability: "code-review", triggerAttempt: 1 },
      { changeKind: "FEEDBACK_DRIVEN_CHANGE", status: "CLASSIFIED", previousGeneration: 2, triggerCapability: "solution-gate", triggerAttempt: 2 },
    ],
    generation: 3,
  }))?.verdict === "MATCH", "R5-H1: the legal review→gate wave (records gen 1+2, run at gen 3) MATCHes");
  ok(dim7ReviewThenGate(traceFor(reviewThenGateScript, {
    generationRestarts: [
      { changeKind: "FEEDBACK_DRIVEN_CHANGE", status: "CLASSIFIED", previousGeneration: 2, triggerCapability: "solution-gate", triggerAttempt: 2 },
    ],
    generation: 3,
  }))?.verdict === "DIVERGE", "R5-H1: the review→gate chain with the REVIEW (first) wave's record stripped → DIVERGE");
}
}

async function crashSeedTamperPin(ok: (condition: boolean, message: string) => void): Promise<void> {
  const crashSpec = coreCrashResumeScenarios().find((s) => s.id === "S-CRASH-STANDARD-post-gate-verdict-resume")!;
  const crashScript = crashSpec.build();
  const workspace = makeBehaviorWorkspace();
  const stores = makeStores("negative-crash-tamper");
  const root = mkdtempSync(join(tmpdir(), "g6-neg-crash-"));
  try {
    const manual = driveManualFace(join(root, "lib-manual"), crashScript);
    const seed = manual.intermediateManifestText;
    if (seed === undefined) {
      ok(false, "crash scenario carries the manual intermediate manifest (the published pre-crash state)");
      return;
    }
    const tampered = seed.replace(
      /(manifest_digest:\s*sha256:)([0-9a-f]{64})/,
      (_match, prefix: string, digest: string) => `${prefix}${digest.startsWith("0") ? "1" : "0"}${digest.slice(1)}`,
    );
    const run = await driveBehaviorLayer(stores, crashScript, workspace, tampered);
    ok(
      run.trace.chainStatus !== "COMPLETED" &&
        (run.trace.blockingReasonCode ?? "").includes("MANIFEST_CORRUPT"),
      "S-CRASH: a re-entry against a tampered published manifest fails closed (MANIFEST_CORRUPT_STOP) — the crash-resume path never silently continues",
    );
  } finally {
    stores.runStore.close();
    rmSync(stores.root, { recursive: true, force: true });
    removeBehaviorWorkspace(workspace);
    rmSync(root, { recursive: true, force: true });
  }
}

// ── 4g. a refused library is never rewritten (R8-H4) ──────────────────────
// In the pre-manifest-write re-entry window the library is made inconsistent
// (three states: self-digest / entry digest / a validly-sealed document whose
// cursor is ahead of the journal). The production entry must refuse
// (MANIFEST_CORRUPT_STOP / JOURNAL_MANIFEST_MISMATCH_STOP) AND the driver
// must never rewrite the refused document: the lost-write/double-resume
// epilogues are skipped, the refused bytes survive the driver's whole
// lifetime, and the crash facts honestly report the failure (no vacuous
// pass). Unsealed content tampering trips the self-digest check first
// (MANIFEST_CORRUPT_STOP); the cursor-ahead check (JOURNAL_MANIFEST_MISMATCH_
// STOP) needs a validly sealed document — produced by one normal run's final
// projection, written into the window so its cursor exceeds the re-entry's
// journal head.
async function crashRefusalPin(ok: (condition: boolean, message: string) => void): Promise<void> {
  const crashSpec = coreCrashResumeScenarios().find((s) => s.id === "S-CRASH-STANDARD-pre-manifest-write-resume")!;
  const crashScript = crashSpec.build();
  const flipFirstHex = (digest: string): string => `${digest.startsWith("0") ? "1" : "0"}${digest.slice(1)}`;
  const root = mkdtempSync(join(tmpdir(), "g6-neg-crash-refusal-"));
  // A FRESH manual library per seed (the publisher's init refuses an existing
  // manifest).
  const seedFor = async (): Promise<string> => {
    const libRoot = mkdtempSync(join(root, "lib-"));
    const manual = driveManualFace(join(libRoot, "lib-manual"), crashScript);
    const seed = manual.intermediateManifestText;
    if (seed === undefined) throw new Error("pre-manifest-write scenario carries no manual intermediate manifest");
    return seed;
  };
  // The validly-sealed ahead-of-journal document: one NORMAL crash run's
  // final projection (its cursor equals the completed journal's head).
  const sealedAheadText = async (): Promise<string> => {
    const workspace = makeBehaviorWorkspace();
    const stores = makeStores("negative-crash-refusal-seal-source");
    try {
      await driveBehaviorLayer(stores, crashScript, workspace, await seedFor());
      const manifestPath = join(stores.root, "repo", "library", crashScript.requirementId, "manifest.md");
      return readFileSync(manifestPath, "utf8");
    } finally {
      stores.runStore.close();
      rmSync(stores.root, { recursive: true, force: true });
      removeBehaviorWorkspace(workspace);
    }
  };
  const tamperers: readonly { label: string; expected: string; apply: (text: string) => Promise<string> }[] = [
    {
      label: "self-digest",
      expected: "MANIFEST_CORRUPT_STOP",
      apply: async (text) =>
        text.replace(
          /(manifest_digest:\s*sha256:)([0-9a-f]{64})/,
          (_match, prefix: string, digest: string) => `${prefix}${flipFirstHex(digest)}`,
        ),
    },
    {
      label: "entry digest",
      expected: "MANIFEST_CORRUPT_STOP",
      apply: async (text) =>
        text.replace(
          /^(\s*digest:\s*)([0-9a-f]{64})$/m,
          (_match, prefix: string, digest: string) => `${prefix}${flipFirstHex(digest)}`,
        ),
    },
    {
      label: "sealed cursor ahead of the journal",
      expected: "JOURNAL_MANIFEST_MISMATCH_STOP",
      apply: async () => sealedAheadText(),
    },
  ];
  try {
    for (const tamperer of tamperers) {
      const workspace = makeBehaviorWorkspace();
      const stores = makeStores(`negative-crash-refusal-${tamperer.label.replace(/\s+/g, "-")}`);
      try {
        let tamperedText: string | null = null;
        const manifestPath = join(stores.root, "repo", "library", crashScript.requirementId, "manifest.md");
        const run = await driveBehaviorLayer(stores, crashScript, workspace, await seedFor(), async (windowManifestPath) => {
          tamperedText = await tamperer.apply(readFileSync(windowManifestPath, "utf8"));
          writeFileSync(windowManifestPath, tamperedText, "utf8");
        });
        const finalText = existsSync(manifestPath) ? readFileSync(manifestPath, "utf8") : null;
        const facts = run.crashRecovery;
        ok(
          run.trace.chainStatus === "BLOCKED" &&
            (run.trace.blockingReasonCode ?? "") === tamperer.expected &&
            facts !== null &&
            facts.refusedManifestStable === true &&
            finalText === tamperedText,
          `R8-H4: the ${tamperer.label}-tampered library is refused (${tamperer.expected}) and never rewritten — the refused bytes survive the driver`,
        );
        ok(
          facts !== null &&
            facts.lostWriteOccurred === false &&
            facts.redriveByteIdentical === false,
          `R8-H4: the ${tamperer.label} refusal reports no vacuous crash facts (lostWrite/redrive stay false)`,
        );
      } finally {
        stores.runStore.close();
        rmSync(stores.root, { recursive: true, force: true });
        removeBehaviorWorkspace(workspace);
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── 4h. a refusal AFTER the lost-write rollback terminates the epilogue (R9-H2) ──
// The rollback's own re-entry can be refused (the rolled-back library is
// made inconsistent before the entry re-reads it). The refusal must be
// terminal: the double-resume branch does NOT run, doubleResumeNoOp is never
// recorded on a refusal, the refused bytes are pinned, and the crash facts
// honestly report the failure.
async function crashPostRollbackRefusalPin(ok: (condition: boolean, message: string) => void): Promise<void> {
  const crashSpec = coreCrashResumeScenarios().find((s) => s.id === "S-CRASH-STANDARD-pre-manifest-write-double-resume")!;
  const crashScript = crashSpec.build();
  const flipFirstHex = (digest: string): string => `${digest.startsWith("0") ? "1" : "0"}${digest.slice(1)}`;
  const root = mkdtempSync(join(tmpdir(), "g6-neg-crash-postrollback-"));
  const seedFor = async (): Promise<string> => {
    const libRoot = mkdtempSync(join(root, "lib-"));
    const manual = driveManualFace(join(libRoot, "lib-manual"), crashScript);
    const seed = manual.intermediateManifestText;
    if (seed === undefined) throw new Error("pre-manifest-write scenario carries no manual intermediate manifest");
    return seed;
  };
  try {
    const workspace = makeBehaviorWorkspace();
    const stores = makeStores("negative-crash-postrollback");
    try {
      let refusedText: string | null = null;
      const manifestPath = join(stores.root, "repo", "library", crashScript.requirementId, "manifest.md");
      const run = await driveBehaviorLayer(
        stores,
        crashScript,
        workspace,
        await seedFor(),
        undefined,
        async (postRollbackPath) => {
          // The rolled-back (window) library is corrupted before the entry
          // re-reads it: the re-deriving re-entry must be refused.
          refusedText = readFileSync(postRollbackPath, "utf8").replace(
            /(manifest_digest:\s*sha256:)([0-9a-f]{64})/,
            (_match, prefix: string, digest: string) => `${prefix}${flipFirstHex(digest)}`,
          );
          writeFileSync(postRollbackPath, refusedText, "utf8");
        },
      );
      const finalText = existsSync(manifestPath) ? readFileSync(manifestPath, "utf8") : null;
      const facts = run.crashRecovery;
      ok(
        run.trace.chainStatus === "BLOCKED" &&
          (run.trace.blockingReasonCode ?? "") === "MANIFEST_CORRUPT_STOP" &&
          facts !== null &&
          facts.doubleResumeNoOp === false &&
          facts.redriveByteIdentical === false &&
          facts.refusedManifestStable === true &&
          finalText === refusedText,
        "R9-H2: a refusal after the lost-write rollback is terminal — the double-resume branch does not run and the refused bytes survive the driver",
      );
    } finally {
      stores.runStore.close();
      rmSync(stores.root, { recursive: true, force: true });
      removeBehaviorWorkspace(workspace);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── 4i. the frozen-register guard (R10-H1) ────────────────────────────────
// The matrix denominators come from the frozen registers; a register that
// lost, duplicated or rescaled an entry must fail with its OWN diagnostic —
// the A' red exit code (or any tally) is not a scale guard. The guard is
// unit-pinned here: exact passes; a lost entry, a duplicate entry and a
// rescaled register each throw with the class named.
function stubSpec(id: string): ScenarioSpec {
  return Object.freeze({
    id,
    family: "S-CORE" as const,
    coords: Object.freeze({
      initClass: "new-project" as const,
      depth: "STANDARD" as const,
      verdict: "PASS" as const,
      round: "first" as const,
      manifestState: "new" as const,
      crashResume: "none" as const,
    }),
    build: () => Object.freeze({ requirementId: id, requestedDepth: "STANDARD" as const, nodes: [], findings: [] }),
  });
}

function registryGuardPin(ok: (condition: boolean, message: string) => void): void {
  const frozen = ["a", "b", "c"];
  // The register under test (the specs) vs the frozen ledger list.
  const guarded = (register: readonly string[]): string => {
    try {
      assertScenarioLedger("unit", register.map((id) => stubSpec(id)), frozen);
      return "";
    } catch (error) {
      return (error as Error).message;
    }
  };
  ok(guarded(["a", "b", "c"]) === "", "R12-H1: the exact frozen register passes the ledger guard");
  ok(guarded(["a", "b"]).includes("missing"), "R12-H1: a register that LOST an entry fails with the missing-ID diagnostic");
  ok(guarded(["a", "b", "a"]).includes("duplicated"), "R12-H1: a register with a DUPLICATED entry fails with the duplicate diagnostic");
  ok(guarded(["a", "b", "c", "d"]).includes("unexpected"), "R12-H1: a register with an EXTRA entry fails with the unexpected-ID diagnostic");

  // The sealed ledger itself: the digest verifies and the frozen sizes hold
  // (the matrix runners assert the registers against these lists per-ID).
  const ledger = loadFrozenLedger();
  ok(ledger.scenarios.completing.length === 50 &&
    ledger.scenarios.overLimit.length === 4 &&
    ledger.scenarios.crash.length === 6 &&
    ledger.negatives.behavior.total === 54 &&
    ledger.negatives.comparator.total === 38,
    "R12-H1: the sealed ledger loads with the frozen sizes (50/4/6 scenarios, 54/38 negative assertions)",
  );
}

async function main(): Promise<void> {
  const ledger = loadFrozenLedger();
  const result = await runNegativeSuite("behavior negative", ledger.negatives.behavior, async (h) => {
    h.group("r1h1-core");
    r1h1CorePins(h.ok);
    h.group("absent-triple");
    absentPin(h.ok);
    h.group("real-run-pin");
    await realRunPin(h.ok);
    h.group("wp1-feedback");
    await feedbackRestartPin(h.ok);
    h.group("two-generation");
    twoGenerationPin(h.ok);
    h.group("mixed-kind");
    mixedWavePin(h.ok);
    h.group("crash-seed-tamper");
    await crashSeedTamperPin(h.ok);
    h.group("crash-refusal-window");
    await crashRefusalPin(h.ok);
    h.group("crash-post-rollback");
    await crashPostRollbackRefusalPin(h.ok);
    h.group("registry-guard");
    registryGuardPin(h.ok);
  });
  console.log(`\n==== g6 behavior negative summary: ${result.summary} ====`);
  console.log(`(R1-H1: the real handoff triple is the verdict basis; a BLOCKED handoff never prints MATCH)`);
  if (result.failed > 0) process.exit(1);
}

void main();
