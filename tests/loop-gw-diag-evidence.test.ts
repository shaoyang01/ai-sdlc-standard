// W-GW-DIAG P-A — post-process output failures carry process evidence.
// ============================================================================
// Before this wave, a real dispatch whose CLI ran fine but whose stdout failed
// the E3 output contract (empty final text / no sentinels / bad envelope)
// escaped executePrimary as a bare error: the FAILED terminal journaled
// EXECUTOR_EXCEPTION with an ALL-NULL evidence block — indistinguishable from
// "the process never ran". The W-GW-SMOKE run3 design attempt 1 (kimi, ~408s,
// exit 0, non-compliant output) is the motivating case.
//
// These tests pin the repaired seam: the FAILED terminal keeps the REAL cause
// code AND the process evidence (exit code, duration) the adapter already had
// in hand.
import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopRunStore } from "../core/loop-run-store";
import type { LoopRunIdentity } from "../core/loop-executor-types";
import { INITIAL_BINDING_REGISTRY } from "../core/agent-capability-bindings";
import {
  RealCapabilityGateway,
  type RealGatewayAdapter,
} from "../execution/real-capability-gateway";
import type { ExecutionRequest, ExecutionResult } from "../execution/types";

const TS = "2026-09-01T10:00:00.000Z";
let passed = 0;
function check(name: string, cond: boolean): void {
  if (!cond) throw new Error(`✗ ${name}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function harness() {
  const root = mkdtempSync(join(tmpdir(), "gwdiag-"));
  const repo = join(root, "repo");
  const workspace = join(root, "workspace");
  mkdirSync(repo, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  const id = Object.freeze({
    runId: "run-gwdiag-001",
    requirementId: "REQ-GWDIAG-001",
    repository: "example",
    repositoryPath: repo,
    baseBranch: "main",
    expectedBaseSha: "1".repeat(40),
    taskBranch: "feature/gwdiag-test",
    controlRoot: join(root, "control"),
    createdAt: TS,
  }) as LoopRunIdentity;
  const artifactStore = new LoopArtifactStore({ controlRoot: id.controlRoot, repositoryPath: repo });
  const runStore = new LoopRunStore(join(root, "journal.db"), { artifactStore });
  runStore.init();
  artifactStore.init();
  runStore.createRun(id);
  runStore.ensureRunStarted(id.runId);
  const put = artifactStore.put("requirement_summary", "upstream requirement body");
  return { identity: id, runStore, artifactStore, workspace, inputRef: put.artifactRef, inputDigest: put.digest };
}

function gatewayWith(
  h: ReturnType<typeof harness>,
  adapterOutput: Record<string, unknown>,
): RealCapabilityGateway {
  const fakeAdapter: RealGatewayAdapter = {
    async execute(req) {
      return {
        success: true,
        node: req.node,
        agent: req.providerId,
        output: adapterOutput,
        artifacts: [],
        // Mirrors RealCapabilityAdapter's success-path evidence: the process
        // RAN — this is exactly what the pre-P-A masking lost.
        processEvidence: Object.freeze({
          invocationDigest: "e".repeat(64),
          exitCode: 0,
          signal: null,
          durationMs: 408_000,
          truncated: false,
        }),
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
    { adapter: fakeAdapter, attemptWorkspace: () => h.workspace,
      // Direct construction must wire the ref resolver itself — exactly the
      // fail-closed seam the W-GW-FIX wave pinned (no silent fallback).
      artifactText: (ref) => (ref === h.inputRef ? "requirement body" : "") },
  );
}

function refOnlyRequest(h: ReturnType<typeof harness>): ExecutionRequest {
  return {
    requirementId: h.identity.requirementId,
    node: "requirement-intake",
    type: "requirement-intake",
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
  // ── A1. empty final text → REAL code + evidence on the FAILED terminal ──
  {
    const h = harness();
    const gw = gatewayWith(h, {});
    const result = await gw.execute(refOnlyRequest(h));
    check("empty-text dispatch fails", result.success === false);
    const terminal = h.runStore.listCapabilityExecutions(h.identity.runId).at(-1)!;
    check("terminal is failed", terminal.status === "failed");
    check("real cause code kept (REAL_GATEWAY_BAD_ADAPTER_RESULT)",
      terminal.errorCode === "REAL_GATEWAY_BAD_ADAPTER_RESULT");
    check("process exit code journaled", terminal.processExitCode === 0);
    check("process duration journaled", terminal.processDurationMs === 408_000);
    check("invocation digest journaled", terminal.processInvocationDigest === "e".repeat(64));
  }

  // ── A2. non-envelope text → REAL code + evidence on the FAILED terminal ──
  {
    const h = harness();
    const gw = gatewayWith(h, { text: "the agent worked hard but emitted no sentinels at all" });
    const result = await gw.execute(refOnlyRequest(h));
    check("non-envelope dispatch fails", result.success === false);
    const terminal = h.runStore.listCapabilityExecutions(h.identity.runId).at(-1)!;
    check("terminal is failed", terminal.status === "failed");
    check("real cause code kept (REAL_GATEWAY_ENVELOPE_INVALID)",
      terminal.errorCode === "REAL_GATEWAY_ENVELOPE_INVALID");
    check("process evidence still journaled", terminal.processExitCode === 0);
  }

  // ── A3. valid envelope still succeeds unchanged (no behavior drift) ──
  {
    const h = harness();
    const good = `prose\n<!--@loop-output-begin-->\n${JSON.stringify({ summary: "s", body: "b", findings: [] })}\n<!--@loop-output-end-->\n`;
    const gw = gatewayWith(h, { text: good });
    const result = await gw.execute(refOnlyRequest(h));
    check("valid envelope still succeeds", result.success === true);
    const terminal = h.runStore.listCapabilityExecutions(h.identity.runId).at(-1)!;
    check("terminal is succeeded", terminal.status === "succeeded");
  }

  console.log(`\nResults: ${passed} passed, 0 failed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
