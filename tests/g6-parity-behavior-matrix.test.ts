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
  console.log(`G6 parity behavior layer: ${specs.length} scenarios (S-CORE families + S-MANIFEST + S-CRASH + S-INIT, production-entry trace + merged judgment)`);

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
        // The D-17 id flip is forgiven only against the run's STORE-assigned
        // finding ids (R1-H3): no proof, no exemption.
        const artifact = compareArtifactLayer(manual.manifestText, runtime.manifestText, script, {
          catchUpRegime: script.midTakeoverAfter !== undefined,
          storeFindingIds: new Set(runtime.findingIds),
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
      // Layer 2 (behavior): the production entry's decision trajectory.
      const behaviorStores = makeStores(`${spec.id}-behavior`);
      try {
        const run = await driveBehaviorLayer(behaviorStores, script, workspace);
        const behavior = compareBehaviorLayer(script, run.trace);
        const diverged = behavior.dimensions.filter((d) => d.verdict === "DIVERGE");
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
        ok(
          artifactClean && diverged.length === 0,
          `${spec.id}: artifact ${artifactDetail}; behavior ${diverged.length === 0 ? "6/6 MATCH" : diverged.map((d) => `${d.dimension}(${d.detail})`).join(" | ")}`,
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
  const bucketOk = knownDim9 === expectedKnownDim9 && newCauseDim9.length === 0;
  console.log(`==== g6 dim-9 known-cause bucket (R-G6-01): ${knownDim9}/${expectedKnownDim9} divergences are the routed production cause; new-cause divergences: ${newCauseDim9.length} ====`);
  console.log(`(pinned signatures: BLOCKED + reason in {closureReviewDone, pathEntry per-invocation loss} + artifactRef present — the pin fails on a new cause or signature drift)`);
  if (!bucketOk) {
    for (const item of newCauseDim9) console.error(`  ✗ dim-9 NEW CAUSE: ${item}`);
    console.error(`  ✗ dim-9 bucket pin failed: expected exactly ${expectedKnownDim9} known-cause divergences, observed ${knownDim9}`);
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
  console.log(`(artifact layer NOT judged: pending gate rows carry no revision triple — not counted in the artifact-layer pass count)`);

  if (failed > 0 || pauseFailed > 0 || !bucketOk) process.exit(1);
}

void main();
