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
import { compareArtifactLayer } from "./g6-parity/comparator";
import { coreFirstRoundScenarios } from "./g6-parity/fact-scripts";
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

function runScenario(specId: string): { dimensions: ReturnType<typeof compareArtifactLayer>["dimensions"] } {
  const spec = coreFirstRoundScenarios().find((s) => s.id === specId);
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
      return { dimensions: compareArtifactLayer(manual.manifestText, runtime.manifestText, script).dimensions };
    } finally {
      rmSync(stores.root, { recursive: true, force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function main(): void {
  const specs = coreFirstRoundScenarios();
  const tally: Tally = { passed: 0, failed: 0 };
  console.log(`G6 parity matrix M1: ${specs.length} scenarios (S-CORE first-round, artifact layer)`);

  for (const spec of specs) {
    let dimensions;
    try {
      dimensions = runScenario(spec.id).dimensions;
    } catch (error) {
      ok(false, `${spec.id}: harness error ${(error as Error).message}`, tally);
      continue;
    }
    const diverged = dimensions.filter((d) => d.verdict === "DIVERGE");
    if (diverged.length === 0) {
      ok(true, `${spec.id}: artifact-layer normalized manifests deep-equal`, tally);
    } else {
      ok(false, `${spec.id}: ${diverged.map((d) => `${d.dimension}(${d.detail})`).join(" | ")}`, tally);
    }
  }

  console.log("");
  console.log(`==== g6 parity M1 summary: ${tally.passed} passed, ${tally.failed} failed ====`);
  console.log(`(artifact layer only: ${NINE_DIMENSIONS.length - 6} of ${NINE_DIMENSIONS.length} dimensions judged here; behavior layer + remaining 40 scenarios = M2)`);
  if (tally.failed > 0) process.exit(1);
}

main();
