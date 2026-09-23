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

import { coreFirstRoundScenarios, coreFeedbackRegateScenarios, coreOverLimitPauseScenarios } from "./g6-parity/fact-scripts";
import { driveBehaviorLayer, makeBehaviorWorkspace, removeBehaviorWorkspace, type BehaviorTrace } from "./g6-parity/behavior-face";
import { compareBehaviorLayer } from "./g6-parity/behavior-comparator";
import { makeStores } from "./g6-parity/runtime-face";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FactScript } from "./g6-parity/types";

let passed = 0;
let failed = 0;
function ok(condition: boolean, message: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

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
console.log("G6 behavior negative matrix (R1-H1): real handoff triple, bindings, admission");

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

// ── 7. the real-scenario pin: the production entry's ACTUAL handoff ───────
// Drive S-CORE-STANDARD-PASS-first through the production entry and assert
// the observed handoff triple IS the routed production finding — the
// reviewer's counterexample as a permanent regression.
async function realRunPin(): Promise<void> {
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

// ── 4c. the WP-1 generation restart (R2-H1-A) ─────────────────────────────
// The F family's feedback path legitimately returns to requirement-intake
// after an ADMITTING gate verdict — a declared new-generation restart, not a
// finding reflow. The real run must pass; the same trajectory against a
// script with no declared WP-1 trigger must DIVERGE.
async function feedbackRestartPin(): Promise<void> {
  const fSpec = coreFeedbackRegateScenarios().find((s) => s.id === "S-CORE-DEEP-PASS-feedback-regate-post-gate")!;
  const fScript = fSpec.build();
  const workspace = makeBehaviorWorkspace();
  const stores = makeStores("negative-feedback");
  try {
    const run = await driveBehaviorLayer(stores, fScript, workspace);
    const dim7 = compareBehaviorLayer(fScript, run.trace).dimensions.find((d) => d.dimension === "next-eligibility");
    ok(dim7?.verdict === "MATCH", "dim 7: the declared WP-1 generation restart to requirement-intake MATCHes (F post-gate)");
    const undeclared: FactScript = Object.freeze({
      ...fScript,
      nodes: fScript.nodes.map((node) => (node.opensFeedbackChange === true ? { ...node, opensFeedbackChange: false } : node)),
    });
    const dim7b = compareBehaviorLayer(undeclared, run.trace).dimensions.find((d) => d.dimension === "next-eligibility");
    ok(dim7b?.verdict === "DIVERGE", "dim 7: the same restart WITHOUT the declared WP-1 trigger DIVERGEs");
  } finally {
    stores.runStore.close();
    rmSync(stores.root, { recursive: true, force: true });
    removeBehaviorWorkspace(workspace);
  }
}

async function main(): Promise<void> {
  await realRunPin();
  await feedbackRestartPin();
  console.log(`\n==== g6 behavior negative summary: ${passed} passed, ${failed} failed ====`);
  console.log(`(R1-H1: the real handoff triple is the verdict basis; a BLOCKED handoff never prints MATCH)`);
  if (failed > 0) process.exit(1);
}

void main();
