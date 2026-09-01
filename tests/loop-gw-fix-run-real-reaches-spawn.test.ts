// W-GW-FIX minimal regression (Decision-078) — run()+real reaches CLI spawn.
// ============================================================================
// The W-GW-SMOKE fail-closed run (Decision-077) proved E5-L2's canary shape
// never covered the production path: run() dispatches each node its input as
// { inputArtifactRef } (runtime.ts dispatch site), and the real gateway only
// accepted free-text keys — so the FIRST node died pre-staging with
// REAL_GATEWAY_NO_INPUT (4ms, no process evidence), before any CLI spawn.
//
// This file pins the repaired seam from BOTH sides:
//   A) end-to-end through run(requirement, { capabilitySource: "real" }): the
//      adapter (the spawn point) must be reached, and the staged prompt input
//      must be the REQUIREMENT TEXT resolved from the loop's own artifact —
//      not a hand-built free-text key;
//   B) direct RealCapabilityGateway construction WITHOUT the resolver still
//      fails closed on artifact-ref-only input (no silent fallback), and a
//      manually wired resolver satisfies it.
import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { run } from "../runtime";
import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopRunStore } from "../core/loop-run-store";
import type { LoopRunIdentity } from "../core/loop-executor-types";
import { INITIAL_BINDING_REGISTRY } from "../core/agent-capability-bindings";
import {
  NODE_OUTPUT_ENVELOPE_BEGIN,
  NODE_OUTPUT_ENVELOPE_END,
} from "../core/node-output-envelope";
import {
  RealCapabilityGateway,
  type RealGatewayAdapter,
} from "../execution/real-capability-gateway";
import type { ExecutionRequest, ExecutionResult } from "../execution/types";

const TS = "2026-09-01T08:00:00.000Z";
const REQUIREMENT = "W-GW-FIX regression: the MD5Util System.exit(-1) must become a thrown exception with offline unit tests.";
let passed = 0;
function check(name: string, cond: boolean): void {
  if (!cond) throw new Error(`✗ ${name}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function envelope(obj: Record<string, unknown>): string {
  return `prose before\n${NODE_OUTPUT_ENVELOPE_BEGIN}\n${JSON.stringify(obj)}\n${NODE_OUTPUT_ENVELOPE_END}\nprose after`;
}

/** Non-gate envelope: keeps intake/design/scan honest, stops the chain at the
 *  formal verdict (gateResult required there) — far beyond the old 4ms death. */
const ORDINARY_ENVELOPE = envelope({ summary: "s", body: "b", findings: [] });

interface RecordedCall {
  capability: unknown;
  prompt: string;
  stagedContent: string | null;
  stdinContent: string | undefined;
}

function recordingAdapter(): { adapter: RealGatewayAdapter; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const adapter: RealGatewayAdapter = {
    async execute(req) {
      const pointer = (req.promptPointers as readonly { absolutePath: string }[] | undefined)?.[0];
      const result: ExecutionResult = {
        success: true,
        node: req.node,
        agent: req.providerId,
        output: { text: ORDINARY_ENVELOPE },
        artifacts: [],
      } as unknown as ExecutionResult;
      calls.push({
        capability: req.capability,
        prompt: req.prompt,
        stagedContent: pointer ? readFileSync(pointer.absolutePath, "utf8") : null,
        stdinContent: (req as { stdinContent?: string }).stdinContent,
      });
      return result;
    },
  };
  return { adapter, calls };
}

function unitHarness() {
  const root = mkdtempSync(join(tmpdir(), "gwfix-"));
  const repo = join(root, "repo");
  const workspace = join(root, "workspace");
  mkdirSync(repo, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  const id = Object.freeze({
    runId: "run-gwfix-001",
    requirementId: "REQ-GWFIX-001",
    repository: "example",
    repositoryPath: repo,
    baseBranch: "main",
    expectedBaseSha: "1".repeat(40),
    taskBranch: "feature/gwfix-test",
    controlRoot: join(root, "control"),
    createdAt: TS,
  }) as LoopRunIdentity;
  const artifactStore = new LoopArtifactStore({ controlRoot: id.controlRoot, repositoryPath: repo });
  const runStore = new LoopRunStore(join(root, "journal.db"), { artifactStore });
  runStore.init();
  artifactStore.init();
  runStore.createRun(id);
  runStore.ensureRunStarted(id.runId);
  const put = artifactStore.put("requirement_summary", REQUIREMENT);
  return { identity: id, runStore, artifactStore, workspace, inputRef: put.artifactRef, inputDigest: put.digest };
}

function directGateway(
  h: ReturnType<typeof unitHarness>,
  artifactText?: (artifactRef: string) => string,
): RealCapabilityGateway {
  const fakeAdapter: RealGatewayAdapter = {
    async execute(req) {
      return {
        success: true,
        node: req.node,
        agent: req.providerId,
        output: { text: ORDINARY_ENVELOPE },
        artifacts: [],
      } as unknown as ExecutionResult;
    },
  };
  return new RealCapabilityGateway(
    {
      capabilityTracing: {
        runStore: h.runStore,
        artifactStore: h.artifactStore,
        bindingRegistry: INITIAL_BINDING_REGISTRY,
        executorVersions: { codex: "1.0.0", kimi: "1.0.0", hermes: "1.0.0" },
        now: () => TS,
      },
    },
    { adapter: fakeAdapter, attemptWorkspace: () => h.workspace, artifactText },
  );
}

function refOnlyRequest(h: ReturnType<typeof unitHarness>): ExecutionRequest {
  return {
    requirementId: h.identity.requirementId,
    node: "requirement-intake",
    type: "requirement-intake",
    // The canonical run() dispatch shape — the exact input that killed the
    // W-GW-SMOKE run before the fix.
    input: { inputArtifactRef: h.inputRef },
    loopExecution: {
      runId: h.identity.runId,
      attempt: 1,
      executionRole: "primary",
      inputArtifactRef: h.inputRef,
      inputArtifactVersion: "1.0.0",
      inputDigest: h.inputDigest,
      outputArtifactVersion: "1.0.0",
    },
  } as unknown as ExecutionRequest;
}

async function main(): Promise<void> {
  // ── A. run()+real end-to-end: the spawn point is reached and the staged
  //      input IS the requirement text resolved from the loop artifact ──
  {
    const root = mkdtempSync(join(tmpdir(), "gwfix-run-"));
    const workspace = join(root, "workspace");
    mkdirSync(workspace, { recursive: true });
    const { adapter, calls } = recordingAdapter();
    const result = await run(REQUIREMENT, {
      requirementId: "REQ-GWFIX-RUN",
      workspaceRoot: root,
      capabilitySource: "real",
      realGatewayDeps: { adapter, attemptWorkspace: () => workspace },
      // Bound the run: our fake stops carrying the chain at the formal
      // verdict, which is plenty past the old pre-staging death.
      maxDispatches: 8,
    });
    check("run() with real source returned a result", result !== null);
    check("adapter (spawn point) was reached", calls.length >= 1);
    check("first spawn is requirement-intake/primary", calls[0]!.capability === "requirement-intake");
    check("spawn prompt is non-empty", calls[0]!.prompt.trim().length > 0);
    check("staged prompt input exists", calls[0]!.stagedContent !== null);
    check("staged input content IS the requirement text (artifact-resolved)",
      calls[0]!.stagedContent === REQUIREMENT);
    check("chain progressed past intake (old bug died at 4ms with zero spawns)",
      calls.length >= 2);
  }

  // ── B1. direct gateway WITHOUT the resolver: artifact-ref-only input still
  //        fails closed (no silent fallback, error preserved on the terminal) ──
  {
    const h = unitHarness();
    const gw = directGateway(h);
    const result = await gw.execute(refOnlyRequest(h));
    check("no-resolver dispatch fails", result.success === false);
    const events = h.runStore.listCapabilityExecutions(h.identity.runId);
    check("no-resolver ends on a failed terminal", events.at(-1)!.status === "failed");
    check("no-resolver never reported success", !events.some((e) => e.status === "succeeded"));
  }

  // ── B2. direct gateway WITH a manually wired resolver: ref-only input works ──
  {
    const h = unitHarness();
    const gw = directGateway(h, (ref) => (ref === h.inputRef ? REQUIREMENT : ""));
    const result = await gw.execute(refOnlyRequest(h));
    check("manually wired resolver satisfies ref-only dispatch", result.success === true);
  }

  // ── B3. resolver returning empty text fails closed ──
  {
    const h = unitHarness();
    const gw = directGateway(h, () => "   ");
    const result = await gw.execute(refOnlyRequest(h));
    check("empty artifact resolution fails closed", result.success === false);
  }

  console.log(`\nResults: ${passed} passed, 0 failed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
