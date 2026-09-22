// G6 / D-090-04 — behavior-layer matrix runner (frozen spec §4.2 merged judgment)
// ============================================================================
// Per scenario, BOTH layers run: the artifact layer (the takeover comparison)
// and the behavior layer (the production entry's decision trajectory). A
// scenario passes only when both are clean — the spec's merged judgment. The
// scope is the S-CORE first-round cross (the M1 core); the remaining
// families' behavior layers are wired as their drivers generalize.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { driveManualFace } from "./g6-parity/manual-face";
import { driveRuntimeStoreLevel, makeStores } from "./g6-parity/runtime-face";
import { compareArtifactLayer } from "./g6-parity/comparator";
import { driveBehaviorLayer, makeBehaviorWorkspace, removeBehaviorWorkspace } from "./g6-parity/behavior-face";
import { compareBehaviorLayer } from "./g6-parity/behavior-comparator";
import { coreFirstRoundScenarios } from "./g6-parity/fact-scripts";
import { NINE_DIMENSIONS } from "./g6-parity/types";

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

async function main(): Promise<void> {
  const specs = coreFirstRoundScenarios();
  console.log(`G6 parity behavior layer: ${specs.length} scenarios (S-CORE first-round, production-entry trace + merged judgment)`);

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
        const artifact = compareArtifactLayer(manual.manifestText, runtime.manifestText, script);
        artifactClean = artifact.equal;
        artifactDetail = artifactClean ? "deep-equal" : (artifact.diffs[0] ?? "diverged");
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
  console.log(`(merged judgment: artifact layer dims 3/4/5 + behavior layer dims 1/2/6/7/8/9; ${NINE_DIMENSIONS.length - 6} behavior dims judged by the production-entry trace)`);
  if (failed > 0) process.exit(1);
}

void main();
