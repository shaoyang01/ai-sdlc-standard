// G4-R6 fix-round anti-regression matrix
// ======================================
// Counterexamples and positives for the G4-R6 review findings, derived per
// the review's own acceptance directives:
//   - R6-H1: v4 events never gain decisionStatus authority (write gate +
//     consumer version checks + tampered-column probe).
//   - R6-H2: registration/acceptance binding to the ruling event's own
//     facts (evidence blob, decision scope, real scan producer, replay
//     semantics).
//   - R6-H3: a plain PASS closes nothing — per-item closure only.
//   - R6-H4: same-point blocked re-drive validates only the original claim;
//     a blocked terminal's implementation-class finding re-drives its
//     canonical node first.
//   - R6-H5: planner decisions read precise producer-execution identity,
//     execution-point coordinates, and ONE shared fact reduction.

import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

import type { ExecutionRequest, ExecutionResult } from "../execution/types";
import type { RealGatewayAdapter } from "../execution/real-capability-gateway";
import { run } from "../runtime";
import { recoverRunContext } from "../core/loop-recovery";
import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopRunStore } from "../core/loop-run-store";
import {
  canonicalizeLoopCapabilityExecutionEvent,
  type LoopCapabilityExecutionEvent,
} from "../core/loop-capability-execution";
import { NODE_OUTPUT_ENVELOPE_BEGIN, NODE_OUTPUT_ENVELOPE_END } from "../core/node-output-envelope";
import { createLoopFinding } from "../core/loop-finding-lifecycle";
import {
  planRegateFromFacts,
  reduceBlockedPointIndexes,
  reduceGateRoundFacts,
  type CurrentRevisionFacts,
  type RegateFindingFacts,
} from "../core/loop-regate";
import type { CapabilityExecutionRole, NodeCapabilityId } from "../loop/types";

let p = 0;
let f = 0;
function ok(c: unknown, m: string): asserts c {
  if (c) {
    p += 1;
    console.log(`  ✓ ${m}`);
  } else {
    f += 1;
    console.error(`  ✗ ${m}`);
  }
}

type ScriptKey = string;
type EnvelopeSpec = Record<string, unknown>;

function envelopeText(spec: EnvelopeSpec): string {
  const body = { nodeStatus: "SUCCEEDED", ...spec };
  return `prose before\n${NODE_OUTPUT_ENVELOPE_BEGIN}\n${JSON.stringify(body)}\n${NODE_OUTPUT_ENVELOPE_END}\nprose after`;
}

function scriptedAdapter(script: Map<ScriptKey, EnvelopeSpec[]>): {
  adapter: RealGatewayAdapter;
  calls: ScriptKey[];
} {
  const calls: ScriptKey[] = [];
  const execute = async (req: Record<string, unknown>): Promise<ExecutionResult> => {
    const key = `${String(req.capability)}:${String(req.executionRole)}`;
    calls.push(key);
    const queue = script.get(key) ?? [];
    const spec: EnvelopeSpec = queue.length === 0
      ? { summary: "ok", body: "node product" }
      : queue.length === 1 ? { summary: "ok", body: "node product", ...queue[0]! } : { summary: "ok", body: "node product", ...queue.shift()! };
    return {
      success: true,
      node: String(req.node),
      agent: String(req.providerId),
      output: { text: envelopeText(spec) },
      artifacts: [],
    } as ExecutionResult;
  };
  return { calls, adapter: { execute } as unknown as RealGatewayAdapter };
}

interface Harness {
  root: string;
  workspace: string;
  runStore: LoopRunStore;
  artifactStore: LoopArtifactStore;
  requirementId: string;
}

function makeHarness(name: string): Harness {
  const root = mkdtempSync(join(tmpdir(), `g4r6-${name}-`));
  const workspace = join(root, "attempt-ws");
  mkdirSync(workspace, { recursive: true });
  mkdirSync(join(root, "repo"), { recursive: true });
  const artifactStore = new LoopArtifactStore({
    controlRoot: join(root, "control"),
    repositoryPath: join(root, "repo"),
  });
  const runStore = new LoopRunStore(join(root, "journal.db"), { artifactStore });
  artifactStore.init();
  runStore.init();
  return { root, workspace, runStore, artifactStore, requirementId: `REQ-G4R6-${name.toUpperCase()}` };
}

function closeHarness(h: Harness): void {
  h.runStore.close();
  h.artifactStore.close();
  rmSync(h.root, { recursive: true, force: true });
}

function runIdOf(h: Harness): string {
  return h.runStore.listRunsByRequirement(h.requirementId)[0]!.state.identity.runId;
}

function events(h: Harness): readonly LoopCapabilityExecutionEvent[] {
  return h.runStore.listCapabilityExecutions(runIdOf(h));
}

async function runOnce(h: Harness, adapter: RealGatewayAdapter, maxDispatches?: number) {
  return run("build the g4r6 probe feature", {
    requirementId: h.requirementId,
    workspaceRoot: h.root,
    runStore: h.runStore,
    artifactStore: h.artifactStore,
    capabilitySource: "real",
    realGatewayDeps: { adapter, attemptWorkspace: () => h.workspace },
    ...(maxDispatches !== undefined ? { maxDispatches } : {}),
  });
}

const finding = (id: string, severity: string, category: string): Record<string, unknown> => ({
  id, severity, message: `probe ${id}`, category, cause: "IMPROVEMENT",
});


export { makeHarness, closeHarness, runOnce, runIdOf, events, scriptedAdapter, finding, envelopeText };
