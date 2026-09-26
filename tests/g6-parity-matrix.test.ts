// G6 / D-090-04 offline parity harness — runner + test entry (M1)
// ============================================================================
// M1 scope (frozen spec §3 staging): S-CORE first-round cross (12 scenarios)
// on the ARTIFACT layer. The behavior layer (full-chain driver) and the
// remaining 40 scenarios land in M2 on this same harness. The runner reports
// per-scenario per-layer verdicts honestly — an artifact-layer-only pass is
// reported as such, never as a full nine-dimension pass.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { driveManualFace } from "./g6-parity/manual-face";
import { driveRuntimeStoreLevel, makeStores } from "./g6-parity/runtime-face";
import { compareArtifactLayer, type ComparisonResult } from "./g6-parity/comparator";
import { assertScenarioLedger, loadFrozenLedger } from "./g6-parity/ledger-guard";
import { emitEvent } from "./g6-parity/event-stream";
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
} from "./g6-parity/fact-scripts";
import { NINE_DIMENSIONS } from "./g6-parity/types";

interface Tally {
  passed: number;
  failed: number;
}

function ok(condition: boolean, message: string, tally: Tally): void {
  if (condition) {
    tally.passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    tally.failed += 1;
    console.error(`  ✗ ${message}`);
  }
  // R15-H5/R16-H7: the scenario judge is the evaluation point — emit the
  // structured event here (id AND message), so the auditor can match the
  // printed lines to events one by one, not merely count them.
  emitEvent({ t: "scenario", suite: "artifact-matrix", id: message.split(/[\s:]/)[0] ?? "", ok: condition, msg: message });
}

function runScenario(specId: string): ComparisonResult {
  const spec = allScenarios().find((s) => s.id === specId);
  if (spec === undefined) throw new Error(`unknown scenario ${specId}`);
  const script = spec.build();

  const root = mkdtempSync(join(tmpdir(), "g6-scenario-"));
  try {
    const libManual = join(root, "lib-manual");
    const libRuntime = join(root, "lib-runtime");
    const manual = driveManualFace(libManual, script);
    const stores = makeStores(spec.id);
    try {
      const runtime = driveRuntimeStoreLevel(
        stores,
        script,
        libRuntime,
        manual.manifestText,
        manual.intermediateManifestText,
      );
      // The catch-up regime carries the projector's designed face exemptions
      // (D-7 basename / D-17 finding-id); the takeover regime compares byte-exact.
      // The D-17 closure-row id flip is forgiven only against the run's
      // journal finding proof (R2-H3): no proof, no exemption.
      return compareArtifactLayer(manual.manifestText, runtime.manifestText, script, {
        catchUpRegime: script.midTakeoverAfter !== undefined,
        findingProof: runtime.findingProof,
      });
    } finally {
      stores.runStore.close();
      rmSync(stores.root, { recursive: true, force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
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

function main(): void {
  const specs = allScenarios();
  // R10-H1/R12-H1: the register is pinned bidirectionally against the FROZEN
  // LEDGER (sealed data outside the runner) BEFORE any scenario runs — a
  // lost, duplicated or substituted entry fails here with its own
  // diagnostic. The per-run failure tally is not a scale guard: a deleted
  // completing scenario used to report 49/0, exit 0.
  assertScenarioLedger("completing matrix", specs, loadFrozenLedger().scenarios.completing);
  // (the pin's execution event is emitted inside assertScenarioLedger — R15-H5)
  const tally: Tally = { passed: 0, failed: 0 };
  console.log(`G6 parity matrix M2: ${specs.length} scenarios (S-CORE families + S-MANIFEST + S-CRASH + S-INIT, artifact layer; register pinned against the frozen ledger's ${loadFrozenLedger().scenarios.completing.length} unique IDs)`);

  for (const spec of specs) {
    let comparison;
    try {
      comparison = runScenario(spec.id);
    } catch (error) {
      // A fail-closed scenario asserts a STOP code instead of a comparison.
      const expected = spec.expectStop;
      if (expected !== undefined && (error as Error).message.includes(expected)) {
        ok(true, `${spec.id}: fail-closed ${expected} as required`, tally);
        continue;
      }
      ok(false, `${spec.id}: harness error ${(error as Error).message}`, tally);
      continue;
    }
    // The artifact-layer verdict is the normalized full-document equality
    // (frozen spec §4.2); the dimension rows are diagnostic attribution and
    // must never filter the verdict (G6T2-R1-H4).
    if (!comparison.equal) {
      ok(false, `${spec.id}: normalized manifests diverge — ${comparison.diffs.slice(0, 5).join(" | ")}`, tally);
      continue;
    }
    const diverged = comparison.dimensions.filter((d) => d.verdict === "DIVERGE");
    if (diverged.length === 0) {
      ok(true, `${spec.id}: artifact-layer normalized manifests deep-equal`, tally);
    } else {
      ok(false, `${spec.id}: ${diverged.map((d) => `${d.dimension}(${d.detail})`).join(" | ")}`, tally);
    }
  }

  const judged = NINE_DIMENSIONS.length - BEHAVIOR_LAYER_DIMENSION_COUNT;
  console.log("");
  console.log(`==== g6 parity M1 summary: ${tally.passed} passed, ${tally.failed} failed ====`);
  console.log(`(artifact layer only: ${judged} of ${NINE_DIMENSIONS.length} dimensions judged here; behavior layer + remaining 40 scenarios = M2)`);
  if (tally.failed > 0) process.exit(1);
}

/**
 * The six behavior-layer dimensions (frozen spec §4.2: node-sequence,
 * gate-roles, decision-depth, next-eligibility, earliest-reroute,
 * final-handoff) — reported NOT_JUDGED at the artifact layer, judged by the
 * full-chain pair in M2.
 */
const BEHAVIOR_LAYER_DIMENSION_COUNT = 6;

main();
