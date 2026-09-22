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
import {
  coreFirstRoundScenarios,
  coreUpgradeScenarios,
  coreMultiRoundScenarios,
  coreReviewReworkScenarios,
  coreReviewRegateScenarios,
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
      const runtime = driveRuntimeStoreLevel(stores, script, libRuntime, manual.manifestText);
      return compareArtifactLayer(manual.manifestText, runtime.manifestText, script);
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
  ];
}

function main(): void {
  const specs = allScenarios();
  const tally: Tally = { passed: 0, failed: 0 };
  console.log(`G6 parity matrix M2: ${specs.length} scenarios (first-round + upgrade + multi-round + review-rework + review-regate, artifact layer)`);

  for (const spec of specs) {
    let comparison;
    try {
      comparison = runScenario(spec.id);
    } catch (error) {
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
