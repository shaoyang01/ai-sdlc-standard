// G6 / D-090-04 — behavior-layer matrix runner (frozen spec §4.2 merged judgment)
// ============================================================================
// Per scenario, BOTH layers run: the artifact layer (the takeover comparison)
// and the behavior layer (the production entry's decision trajectory). A
// scenario passes only when both are clean — the spec's merged judgment. The
// scope is the full 47-scenario matrix (S-CORE families + S-MANIFEST +
// S-CRASH + S-INIT).

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { driveManualFace } from "./g6-parity/manual-face";
import { driveRuntimeStoreLevel, makeStores } from "./g6-parity/runtime-face";
import { compareArtifactLayer } from "./g6-parity/comparator";
import {
  assertFrozenRegistry,
  auditFrozenRegistry,
  FROZEN_COMPLETING_SCENARIOS,
  FROZEN_CRASH_SCENARIOS,
  FROZEN_OVER_LIMIT_SCENARIOS,
} from "./g6-parity/registry-guard";
import { driveBehaviorLayer, makeBehaviorWorkspace, removeBehaviorWorkspace } from "./g6-parity/behavior-face";
import { compareBehaviorLayer } from "./g6-parity/behavior-comparator";
import {
  coreFirstRoundScenarios,
  coreUpgradeScenarios,
  coreMultiRoundScenarios,
  coreReviewReworkScenarios,
  coreReviewRegateScenarios,
  corePwrRegateScenarios,
  coreGateRequirementReflowScenarios,
  coreReviewRequirementReflowScenarios,
  coreFeedbackRegateScenarios,
  coreEscalationFailScenarios,
  coreManifestStateScenarios,
  coreCrashResumeScenarios,
  coreInitClassScenarios,
  coreOverLimitPauseScenarios,
} from "./g6-parity/fact-scripts";

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

function allScenarios() {
  // The multi-round wave registers ONE finding per round: same-round findings
  // sharing a scan-ledger blob are indistinguishable to the takeover pairing
  // (ambiguity refuses), and the provenance map requires unique closure
  // revision refs — so the per-round registration stays on the per-finding
  // path (settle-then-register at the scan terminal), not the fused batch API.
  return [
    ...coreFirstRoundScenarios(),
    ...coreUpgradeScenarios(),
    ...coreMultiRoundScenarios(),
    ...coreReviewReworkScenarios(),
    ...coreReviewRegateScenarios(),
    ...corePwrRegateScenarios(),
    ...coreGateRequirementReflowScenarios(),
    ...coreReviewRequirementReflowScenarios(),
    ...coreFeedbackRegateScenarios(),
    ...coreEscalationFailScenarios(),
    ...coreManifestStateScenarios(),
    ...coreCrashResumeScenarios(),
    ...coreInitClassScenarios(),
  ];
}

async function main(): Promise<void> {
  const specs = allScenarios();
  // R10-H1: every register is pinned to the frozen ledger BEFORE anything
  // runs — a lost, duplicated or rescaled register fails with its own
  // diagnostic. Per-run tallies (and the A' red exit code) are not scale
  // guards: a deleted completing scenario used to report 49/0, exit 0, and
  // a deleted over-limit scenario 3/0 or 0/0 with no dedicated error.
  assertFrozenRegistry("completing matrix", specs, FROZEN_COMPLETING_SCENARIOS);
  const overLimitAudit = assertFrozenRegistry("over-limit pause", coreOverLimitPauseScenarios(), FROZEN_OVER_LIMIT_SCENARIOS);
  const crashAudit = assertFrozenRegistry("crash", coreCrashResumeScenarios(), FROZEN_CRASH_SCENARIOS);
  console.log(`G6 parity behavior layer: ${specs.length} scenarios (S-CORE families + S-MANIFEST + S-CRASH + S-INIT, production-entry trace + merged judgment; registers pinned: ${FROZEN_COMPLETING_SCENARIOS} completing + ${FROZEN_OVER_LIMIT_SCENARIOS} over-limit + ${FROZEN_CRASH_SCENARIOS} crash)`);

  // ── H1 A′ bucket: the dim-9 known-cause pin (R-G6-01, routed production
  // finding). Every conforming COMPLETING chain hands off BLOCKED because the
  // c2/c3 evidence chain reads the wrong sources, with TWO observed symptoms:
  //   (a) closureReviewDone reads the code-review event's gateResult, which
  //       the event contract pins to NOT_APPLICABLE for non-formal_verdict
  //       executions → "code review closure review not done";
  //   (b) pathEntry reads the PER-INVOCATION c1-guard variable
  //       (resolvedImplementationDepth), which any staged/resumed (bounded)
  //       wave has already lost in its completing invocation → "development
  //       path entry not allowed: no formal_verdict event with materialized
  //       depth found" (usually joined with (a)).
  // The divergence is SURFACED by the comparator — never judged as MATCH —
  // and pinned here: the bucket must be exactly the completing-scenario
  // count with one of these two reasons, or the run fails.
  const RG601_REASONS: ReadonlySet<string> = new Set([
    "code review closure review not done",
    "development path entry not allowed: no formal_verdict event with materialized depth found; code review closure review not done",
  ]);
  let expectedKnownDim9 = 0;
  let knownDim9 = 0;
  const newCauseDim9: string[] = [];
  // R2 suggestion, machine-checkable: ANY non-dim-9 divergence is a
  // regression, independent of the R-G6-01 bucket — the 0/50 red state must
  // never mask one (the F-family dim-7 regression hid in the red once).
  const nonDim9Divergences: string[] = [];
  // R8-H3: the crash-instrument counter — the crash scenarios must ALL return
  // non-null recovery facts. A null-facts crash scenario is an instrument
  // failure that the A' red state must never mask.
  // R9-H1: the crash-instrument counter — the denominator comes from the
  // S-CRASH REGISTRY (the matrix's frozen family identity), never from the
  // per-script crashPoint under verification: a script that lost its crash
  // fact must fail loudly, not silently shrink the denominator to 0/0.
  const CRASH_REGISTRY: ReadonlySet<string> = new Set(coreCrashResumeScenarios().map((spec) => spec.id));
  let crashScenariosTotal = 0;
  let crashScenariosWithFacts = 0;
  let crashPointMissing = 0;

  for (const spec of specs) {
    const script = spec.build();
    const root = mkdtempSync(join(tmpdir(), "g6-behavior-"));
    const workspace = makeBehaviorWorkspace();
    try {
      const manual = driveManualFace(join(root, "lib-manual"), script);
      // Layer 1 (artifact): the store-level takeover comparison.
      const stores = makeStores(spec.id);
      let artifactClean = false;
      let artifactDetail = "";
      try {
        const runtime = driveRuntimeStoreLevel(
          stores,
          script,
          join(root, "lib-runtime"),
          manual.manifestText,
          manual.intermediateManifestText,
        );
        // The catch-up regime carries the projector's designed face exemptions
        // (D-7 basename / D-17 finding-id); the takeover regime compares byte-exact.
        // The D-17 closure-row id flip is forgiven only against the run's
        // journal finding proof (R2-H3): no proof, no exemption.
        const artifact = compareArtifactLayer(manual.manifestText, runtime.manifestText, script, {
          catchUpRegime: script.midTakeoverAfter !== undefined,
          findingProof: runtime.findingProof,
        });
        artifactClean = artifact.equal;
        artifactDetail = artifactClean ? "deep-equal" : (artifact.diffs[0] ?? "diverged");
      } catch (error) {
        // A fail-closed scenario asserts a STOP code instead of a comparison
        // (S-MANIFEST corrupt: level-1 discrimination, single-level per the
        // frozen spec — the behavior layer still replays the trajectory).
        const expected = spec.expectStop;
        if (expected !== undefined && (error as Error).message.includes(expected)) {
          artifactClean = true;
          artifactDetail = `fail-closed ${expected} (artifact layer only)`;
        } else {
          artifactDetail = `harness error ${(error as Error).message}`;
        }
      } finally {
        stores.runStore.close();
        rmSync(stores.root, { recursive: true, force: true });
      }
      // Layer 2 (behavior): the production entry's decision trajectory. The
      // S-CRASH scenarios seed the manifest library with the manual
      // intermediate manifest (the published pre-crash state) so the entry's
      // projection call points run and the interrupt-reentry catch-up is
      // observable (R1-H2).
      const behaviorStores = makeStores(`${spec.id}-behavior`);
      try {
        const run = await driveBehaviorLayer(
          behaviorStores,
          script,
          workspace,
          script.crashPoint !== undefined ? manual.intermediateManifestText : undefined,
        );
        const behavior = compareBehaviorLayer(script, run.trace);
        const diverged = behavior.dimensions.filter((d) => d.verdict === "DIVERGE");
        // R1-H2: the crash-reentry assertions — the first invocation actually
        // stopped at the crash boundary, no completed node was re-dispatched,
        // the manifest CAUGHT UP to the journal head (R7-H2: a merely-existing
        // stale document fails), the lost write OCCURRED and re-derived
        // byte-identically (pre-manifest-write), the second resume a NO_OP
        // (double-resume), a manifest-stop refusal never rewritten (R8-H4).
        // Non-crash scenarios carry no facts.
        const crash = run.crashRecovery;
        // R8-H3: a crash scenario MUST return its facts — null is only legal
        // for non-crash scenarios. The A' red state must never stand in for
        // the assertion (a null-facts crash scenario is an instrument failure
        // in its own right, counted below and hard-failed).
        if (CRASH_REGISTRY.has(spec.id)) {
          crashScenariosTotal += 1;
          if (script.crashPoint === undefined) {
            crashPointMissing += 1;
            ok(false, `${spec.id}: the crash-registry scenario's script lost its crashPoint fact — the crash mode cannot engage (R9-H1)`);
          }
          if (crash !== null) {
            crashScenariosWithFacts += 1;
          } else {
            ok(false, `${spec.id}: crash scenario returned NO recovery facts — the crash assertions were skipped (R8-H3)`);
          }
        }
        const crashOk =
          (crash === null && script.crashPoint === undefined) ||
          (crash !== null &&
            crash.interruptedAtBoundary &&
            crash.duplicateDispatches === 0 &&
            crash.manifestCaughtUp &&
            crash.refusedManifestStable &&
            (script.loseManifestWrite !== true || (crash.lostWriteOccurred && crash.redriveByteIdentical)) &&
            (script.resumeTwice !== true || crash.doubleResumeNoOp));
        const crashDetail = crash === null
          ? ""
          : `; crash interrupt@boundary=${crash.interruptedAtBoundary} reDispatch=${crash.duplicateDispatches} manifestCaughtUp=${crash.manifestCaughtUp}` +
            `${script.loseManifestWrite === true ? ` lostWrite=${crash.lostWriteOccurred} redrive=${crash.redriveByteIdentical}` : ""}` +
            `${script.resumeTwice === true ? ` doubleNoOp=${crash.doubleResumeNoOp}` : ""}` +
            ` refusedStable=${crash.refusedManifestStable}`;
        // H1 A′ classification: a dim-9 divergence on a completing script is
        // the known routed production cause ONLY when it carries the exact
        // R-G6-01 signature (BLOCKED / "code review closure review not done"
        // / artifact ref present). Anything else is a NEW cause and fails
        // the pin below.
        if (script.nodes[script.nodes.length - 1]?.node === "knowledge-sync") expectedKnownDim9 += 1;
        const dim9 = behavior.dimensions.find((d) => d.dimension === "final-handoff");
        if (dim9?.verdict === "DIVERGE") {
          const knownCause =
            run.trace.handoff.status === "BLOCKED" &&
            run.trace.handoff.reason !== null &&
            RG601_REASONS.has(run.trace.handoff.reason) &&
            run.trace.handoff.artifactRef !== null;
          if (knownCause) {
            knownDim9 += 1;
          } else {
            newCauseDim9.push(`${spec.id}: ${dim9.detail}`);
          }
        }
        for (const divergedDim of diverged) {
          if (divergedDim.dimension !== "final-handoff") {
            nonDim9Divergences.push(`${spec.id}: ${divergedDim.dimension}(${divergedDim.detail})`);
          }
        }
        ok(
          artifactClean && diverged.length === 0 && crashOk,
          `${spec.id}: artifact ${artifactDetail}; behavior ${diverged.length === 0 ? "6/6 MATCH" : diverged.map((d) => `${d.dimension}(${d.detail})`).join(" | ")}${crashDetail}`,
        );
      } finally {
        behaviorStores.runStore.close();
        rmSync(behaviorStores.root, { recursive: true, force: true });
      }
    } catch (error) {
      ok(false, `${spec.id}: harness error ${(error as Error).message}`);
    } finally {
      removeBehaviorWorkspace(workspace);
      rmSync(root, { recursive: true, force: true });
    }
  }

  console.log("");
  console.log(`==== g6 parity behavior summary: ${passed} passed, ${failed} failed ====`);
  console.log(`(merged judgment: artifact layer dims 3/4/5 + behavior layer dims 1/2/6/7/8/9 — 6 dims judged by the production-entry trace)`);

  // ── H1 A′ bucket summary + pin ──────────────────────────────────────────
  // R10-H1: the bucket's denominator is pinned to the frozen ledger, not to
  // the scripts that happened to run — a deleted completing scenario must
  // not shrink the expected bucket.
  const bucketOk =
    knownDim9 === expectedKnownDim9 &&
    expectedKnownDim9 === FROZEN_COMPLETING_SCENARIOS &&
    newCauseDim9.length === 0;
  console.log(`==== g6 dim-9 known-cause bucket (R-G6-01): ${knownDim9}/${expectedKnownDim9} divergences are the routed production cause; new-cause divergences: ${newCauseDim9.length} ====`);
  console.log(`(pinned signatures: BLOCKED + reason in {closureReviewDone, pathEntry per-invocation loss} + artifactRef present — the pin fails on a new cause or signature drift; denominator pinned at ${FROZEN_COMPLETING_SCENARIOS} completing scenarios)`);
  console.log(`==== g6 non-dim-9 divergences: ${nonDim9Divergences.length} (must be 0 — any non-dim-9 divergence is a regression, independent of the R-G6-01 bucket) ====`);
  for (const item of nonDim9Divergences) console.error(`  ✗ non-dim-9 DIVERGE: ${item}`);
  if (!bucketOk) {
    for (const item of newCauseDim9) console.error(`  ✗ dim-9 NEW CAUSE: ${item}`);
    console.error(`  ✗ dim-9 bucket pin failed: expected exactly ${FROZEN_COMPLETING_SCENARIOS} known-cause divergences (frozen ledger), observed ${knownDim9}/${expectedKnownDim9}`);
  }

  // ── R8-H3/R9-H1: the crash-instrument summary — its own count, its own
  // line, its own hard pin. The denominator is the frozen six-scenario
  // registry (not the crashPoint under verification): every registry scenario
  // must carry the crash fact AND return non-null facts, and the total must
  // stay 6 — a 0/0 degeneration (all crashPoints stripped) fails here, not in
  // the A' red state.
  const crashFactsOk =
    crashScenariosWithFacts === crashScenariosTotal &&
    crashScenariosTotal === crashAudit.expected &&
    crashAudit.ranCount === crashAudit.expected &&
    crashAudit.uniqueCount === crashAudit.expected &&
    crashPointMissing === 0;
  console.log(`==== g6 crash-recovery facts: ${crashScenariosWithFacts}/${crashScenariosTotal} registry scenarios returned non-null facts (must be 6/6 with every crashPoint present — R8-H3/R9-H1) ====`);
  if (!crashFactsOk) {
    if (crashPointMissing > 0) {
      console.error(`  ✗ ${crashPointMissing} crash-registry scenario(s) lost their crashPoint fact — the denominator must never shrink to hide it`);
    }
    if (crashScenariosWithFacts < crashScenariosTotal) {
      console.error(`  ✗ crash facts missing for ${crashScenariosTotal - crashScenariosWithFacts} crash scenario(s) — the A' red state must not stand in for the assertion`);
    }
    if (crashAudit.duplicated.length > 0 || crashAudit.uniqueCount !== crashAudit.expected) {
      console.error(`  ✗ the crash register is no longer the frozen six-scenario family (ran ${crashAudit.ranCount}, unique ${crashAudit.uniqueCount}${crashAudit.duplicated.length > 0 ? `; duplicated: ${crashAudit.duplicated.join(", ")}` : ""})`);
    }
  }

  // ── Over-limit pause waves — behavior layer only, single-listed ──────────
  // A FAIL/BLOCKED_UNKNOWN verdict authors no gate revision (WP6), so the
  // pending gate row's triple drifts between the faces — the artifact layer
  // cannot parity these waves (the D-7/D-17 analysis). They assert the
  // production entry's trajectory AND its durable over-limit terminal
  // (REGATE_ROUND_BUDGET_EXHAUSTED — the journal fact, read from the run
  // snapshot), and are counted in their OWN line: never folded into the
  // artifact-layer pass count (the R2 honesty constraint).
  let pausePassed = 0;
  let pauseFailed = 0;
  for (const spec of coreOverLimitPauseScenarios()) {
    const script = spec.build();
    const workspace = makeBehaviorWorkspace();
    try {
      const behaviorStores = makeStores(`${spec.id}-behavior`);
      try {
        const run = await driveBehaviorLayer(behaviorStores, script, workspace);
        const behavior = compareBehaviorLayer(script, run.trace);
        const diverged = behavior.dimensions.filter((d) => d.verdict === "DIVERGE");
        const overLimit = run.trace.blockingReasonCode === "REGATE_ROUND_BUDGET_EXHAUSTED";
        if (diverged.length === 0 && overLimit) {
          pausePassed += 1;
          console.log(`  ✓ ${spec.id}: behavior 6/6 MATCH; durable over-limit terminal ${run.trace.blockingReasonCode}`);
        } else {
          pauseFailed += 1;
          console.error(
            `  ✗ ${spec.id}: behavior ${diverged.length === 0 ? "6/6 MATCH" : diverged.map((d) => `${d.dimension}(${d.detail})`).join(" | ")}; over-limit terminal ${run.trace.blockingReasonCode ?? "none"}`,
          );
        }
      } finally {
        behaviorStores.runStore.close();
        rmSync(behaviorStores.root, { recursive: true, force: true });
      }
    } catch (error) {
      pauseFailed += 1;
      console.error(`  ✗ ${spec.id}: harness error ${(error as Error).message}`);
    } finally {
      removeBehaviorWorkspace(workspace);
    }
  }
  console.log(`==== g6 parity over-limit pause (behavior layer only): ${pausePassed} passed, ${pauseFailed} failed ====`);
  console.log(`(artifact layer NOT judged: pending gate rows carry no revision triple — not counted in the artifact-layer pass count; register pinned at ${FROZEN_OVER_LIMIT_SCENARIOS} scenarios — pausePassed must equal it)`);
  // R10-H1: the over-limit single-listing has its own scale pin — deleting
  // one used to report 3/0 (or 0/0) with no dedicated error.
  const pauseScaleOk = pausePassed === FROZEN_OVER_LIMIT_SCENARIOS && overLimitAudit.ranCount === FROZEN_OVER_LIMIT_SCENARIOS && overLimitAudit.duplicated.length === 0;
  if (!pauseScaleOk) {
    console.error(`  ✗ over-limit register drifted: ${pausePassed} passed of the frozen ${FROZEN_OVER_LIMIT_SCENARIOS} (ran ${overLimitAudit.ranCount}${overLimitAudit.duplicated.length > 0 ? `; duplicated: ${overLimitAudit.duplicated.join(", ")}` : ""})`);
  }

  if (failed > 0 || pauseFailed > 0 || !bucketOk || nonDim9Divergences.length > 0 || !crashFactsOk || !pauseScaleOk) process.exit(1);
}

void main();
