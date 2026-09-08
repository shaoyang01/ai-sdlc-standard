// E5-W1 (G-S09b) — process-evidence mapping tests.
// ============================================================================
// L1 mapping (G-S09) found the journal's process-evidence fields
// (processInvocationDigest/processExitCode/processSignal/processDurationMs/
// processTruncated) hardcoded to null on BOTH terminal paths: the real
// adapter's truncation/bounds evidence never reached the journal. The fix:
//   - the adapter computes an invocationDigest (sha256 over the normalized
//     invocation shape only — no dynamic content) and returns bounded
//     processEvidence on success / failure evidence on errors;
//   - the real gateway re-raises evidence-carrying failures as
//     CapabilityProcessEvidenceError;
//   - the tracing gateway maps evidence into terminal events (succeeded AND
//     failed) and keeps shadow/deterministic events all-null.
// Zero real CLI calls: fake runners only (Decision-075 boundary).

import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  RealCapabilityAdapter,
  RealCapabilityAdapterError,
  type CapabilityProcessRunner,
  type RealCapabilityAdapterRequest,
} from "../execution/real-capability-adapter";
import { CapabilityProcessEvidenceError } from "../execution/types";
import type { LoopPosixProcessRequest, LoopPosixProcessResult } from "../core/loop-posix-process-runner";
import { createKimiFakeRunner, type NodeCapabilityFakeRunner } from "../execution/multi-agent-fake-runners";
import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopRunStore } from "../core/loop-run-store";
import { LoopCapabilityEntry } from "../core/loop-capability-entry";
import { recoverRunContext } from "../core/loop-recovery";
import type { LoopRunIdentity } from "../core/loop-executor-types";
import { INITIAL_BINDING_REGISTRY } from "../core/agent-capability-bindings";
import { ExecutionGateway } from "../execution/gateway";
import { MultiAgentFakeGateway } from "./fixtures/multi-agent-fake-gateway";
import { materializeProducerRevision } from "../runtime";

let passed = 0;
function ok(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  passed += 1;
}

// ── Part A: adapter-level evidence ──

function processResult(p: Partial<LoopPosixProcessResult>): LoopPosixProcessResult {
  return Object.freeze({
    status: "exited",
    exitCode: 0,
    signal: null,
    durationMs: 42,
    stdout: "S09 fixture final text",
    stderr: "",
    stdoutBytesReceived: 0,
    stderrBytesReceived: 0,
    stdoutTruncated: false,
    stderrTruncated: false,
    termSignalSent: false,
    killSignalSent: false,
    ...p,
  }) as LoopPosixProcessResult;
}

class ScriptedRunner implements CapabilityProcessRunner {
  constructor(private readonly behavior: (req: LoopPosixProcessRequest) => LoopPosixProcessResult) {}
  async run(req: LoopPosixProcessRequest): Promise<LoopPosixProcessResult> {
    return this.behavior(req);
  }
}

function adapterReq(over: Partial<RealCapabilityAdapterRequest>): RealCapabilityAdapterRequest {
  return {
    providerId: "kimi",
    runId: "run-evd-1",
    invocationId: "run-evd-1:solution-design:primary:1",
    requirementId: "REQ-EVD-1",
    node: "solution-design",
    capability: "solution-design",
    executionRole: "primary",
    attempt: 1,
    prompt: "please design the solution",
    cwd: "/tmp/attempt-workspace",
    ...over,
  };
}

async function partA(): Promise<void> {
  console.log("adapter: success result carries bounded process evidence");
  {
    const adapter = new RealCapabilityAdapter(new ScriptedRunner(() => processResult({ durationMs: 42 })));
    const res = await adapter.execute(adapterReq({}));
    ok(res.success === true, "clean run succeeds");
    ok(res.processEvidence !== undefined, "success result carries processEvidence");
    ok(
      res.processEvidence!.exitCode === 0 && res.processEvidence!.signal === null,
      "success evidence records exit 0 with no signal",
    );
    ok(res.processEvidence!.truncated === false, "success evidence records no truncation");
    ok(res.processEvidence!.durationMs === 42, "success evidence records the duration");
    ok(
      /^[0-9a-f]{64}$/.test(res.processEvidence!.invocationDigest),
      "invocation digest is a sha256 hex digest",
    );
  }

  console.log("adapter: invocation digest is shape-deterministic, shape-sensitive");
  {
    const adapter = new RealCapabilityAdapter(new ScriptedRunner(() => processResult({})));
    const r1 = await adapter.execute(adapterReq({}));
    const r2 = await adapter.execute(adapterReq({}));
    const r3 = await adapter.execute(adapterReq({ cwd: "/tmp/other-workspace" }));
    ok(
      r1.processEvidence!.invocationDigest === r2.processEvidence!.invocationDigest,
      "same normalized invocation shape → same digest",
    );
    ok(
      r1.processEvidence!.invocationDigest !== r3.processEvidence!.invocationDigest,
      "different invocation cwd → different digest",
    );
  }

  console.log("adapter: truncated failed run carries truncation evidence on the error");
  {
    const adapter = new RealCapabilityAdapter(new ScriptedRunner(() => processResult({
      exitCode: 1,
      stdoutBytesReceived: 999999,
      stdoutTruncated: true,
      stdout: "partial output…",
    })));
    try {
      await adapter.execute(adapterReq({}));
      ok(false, "truncated run must fail (no error)");
    } catch (error) {
      ok(
        error instanceof RealCapabilityAdapterError && error.code === "REAL_ADAPTER_OUTPUT_TRUNCATED",
        "truncated stream fails closed with REAL_ADAPTER_OUTPUT_TRUNCATED",
      );
      const evidence = (error as RealCapabilityAdapterError).evidence;
      ok(evidence !== null, "failure carries bounded evidence");
      ok(
        evidence!.stdoutTruncated === true && evidence!.exitCode === 1 &&
          /^[0-9a-f]{64}$/.test(evidence!.invocationDigest),
        "failure evidence records truncation, exit code and invocation digest",
      );
      ok(
        !error.message.includes("partial output"),
        "raw process output never leaks into the error message",
      );
    }
  }
}

// ── Part B: gateway → journal mapping ──

const TS = "2026-08-30T11:00:00.000Z";
const DIGEST = "b".repeat(64);

function identity(root: string): LoopRunIdentity {
  return Object.freeze({
    runId: "run-evd-map-001",
    requirementId: "REQ-EVD-MAP-001",
    repository: "example",
    repositoryPath: join(root, "repo"),
    baseBranch: "main",
    expectedBaseSha: "1".repeat(40),
    taskBranch: "feature/evd-map-test",
    controlRoot: join(root, "control"),
    createdAt: TS,
  });
}

const EV: CapabilityProcessEvidenceShape = Object.freeze({
  invocationDigest: "c".repeat(64),
  exitCode: 0,
  signal: null,
  durationMs: 1234,
  truncated: false,
});
type CapabilityProcessEvidenceShape = Readonly<{
  invocationDigest: string;
  exitCode: number | null;
  signal: string | null;
  durationMs: number | null;
  truncated: boolean;
}>;

/** Kimi fake that attaches evidence to its success result (real-path shape). */
function evidenceKimiRunner(evidence: CapabilityProcessEvidenceShape): NodeCapabilityFakeRunner {
  const inner = createKimiFakeRunner();
  return {
    async run(request) {
      const res = await inner.run(request);
      return { ...res, processEvidence: evidence };
    },
  };
}

/** Kimi fake that fails AFTER the process ran, carrying bounded evidence. */
function evidenceFailingRunner(evidence: CapabilityProcessEvidenceShape): NodeCapabilityFakeRunner {
  return {
    async run() {
      throw new CapabilityProcessEvidenceError("S09 fixture: post-process failure", evidence);
    },
  };
}

function plainFailingRunner(): NodeCapabilityFakeRunner {
  return {
    async run() {
      throw new Error("S09 fixture: pre-process failure without evidence");
    },
  };
}

function tracedGateway(
  runStore: LoopRunStore,
  artifactStore: LoopArtifactStore,
  kimiRunner: NodeCapabilityFakeRunner,
): ExecutionGateway {
  return new MultiAgentFakeGateway({
    kimiRunnerOverride: kimiRunner,
    capabilityTracing: {
      runStore,
      artifactStore,
      bindingRegistry: INITIAL_BINDING_REGISTRY,
      executorVersions: { codex: "1.0.0", kimi: "1.0.0", hermes: "1.0.0" },
      now: () => TS,
    },
  });
}

async function completedIntakeFixture(
  prefix: string,
  kimiRunner: NodeCapabilityFakeRunner,
): Promise<Readonly<{
  root: string;
  id: LoopRunIdentity;
  runStore: LoopRunStore;
  artifactStore: LoopArtifactStore;
  techInput: Readonly<{ artifactRef: string; version: string; digest: string }>;
}>> {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const repo = join(root, "repo");
  mkdirSync(repo);
  const id = identity(root);
  const artifactStore = new LoopArtifactStore({ controlRoot: id.controlRoot, repositoryPath: repo });
  const runStore = new LoopRunStore(join(root, "journal.db"), { artifactStore });
  runStore.init();
  artifactStore.init();
  const source = artifactStore.put("requirement_summary", "S09 evidence mapping Requirement source");
  const entry = new LoopCapabilityEntry({
    runStore,
    artifactStore,
    bindingRegistry: INITIAL_BINDING_REGISTRY,
    gateway: tracedGateway(runStore, artifactStore, kimiRunner),
    now: () => TS,
  });
  const first = await entry.execute({
    requirementId: id.requirementId,
    identity: id,
    capability: "requirement-intake",
    executionRole: "primary" as const,
    inputArtifactRef: source.artifactRef,
    inputArtifactVersion: "1.0.0",
    inputDigest: source.digest,
    outputArtifactVersion: "1.0.0",
    input: { requirement: "exercise S09 evidence mapping" },
  });
  const output = first.recoveryContext.capabilityStates[0]!;
  materializeProducerRevision(
    runStore, id.requirementId, id.runId,
    runStore.listCapabilityExecutions(id.runId).find(
      (ev) => ev.executionEventId === first.producerTerminalEventId,
    ) ?? runStore.listCapabilityExecutions(id.runId).at(-1)!,
    () => TS,
  );
  return Object.freeze({
    root,
    id,
    runStore,
    artifactStore,
    techInput: Object.freeze({
      artifactRef: output.effectiveOutputArtifactRef!,
      version: output.effectiveOutputArtifactVersion!,
      digest: output.effectiveOutputDigest!,
    }),
  });
}

function techRequest(fixture: Awaited<ReturnType<typeof completedIntakeFixture>>, attempt = 1) {
  return Object.freeze({
    requirementId: fixture.id.requirementId,
    capability: "solution-design" as const,
    executionRole: "primary" as const,
    inputArtifactRef: fixture.techInput.artifactRef,
    inputArtifactVersion: fixture.techInput.version,
    inputDigest: fixture.techInput.digest,
    outputArtifactVersion: `${attempt}.0.0`,
    input: { requirementSummaryRef: fixture.techInput.artifactRef },
  });
}

function recoveryEntry(
  fixture: Awaited<ReturnType<typeof completedIntakeFixture>>,
  kimiRunner: NodeCapabilityFakeRunner,
): LoopCapabilityEntry {
  return new LoopCapabilityEntry({
    runStore: fixture.runStore,
    artifactStore: fixture.artifactStore,
    bindingRegistry: INITIAL_BINDING_REGISTRY,
    gateway: tracedGateway(fixture.runStore, fixture.artifactStore, kimiRunner),
    now: () => TS,
  });
}

function closeFixture(fixture: Awaited<ReturnType<typeof completedIntakeFixture>>): void {
  fixture.artifactStore.close();
  fixture.runStore.close();
  rmSync(fixture.root, { recursive: true, force: true });
}

function lastEvent(fixture: Awaited<ReturnType<typeof completedIntakeFixture>>) {
  const events = fixture.runStore.listCapabilityExecutions(fixture.id.runId);
  return events[events.length - 1]!;
}

async function partB(): Promise<void> {
  console.log("gateway: succeeded terminal persists real process evidence");
  {
    const runner = evidenceKimiRunner(EV);
    const fixture = await completedIntakeFixture("loop-evd-map-success-", runner);
    try {
      const dispatched = await recoveryEntry(fixture, runner).execute(techRequest(fixture, 1));
      ok(dispatched.execution.success === true, "evidence-carrying dispatch succeeds");
      const terminal = lastEvent(fixture);
      ok(terminal.status === "succeeded", "terminal is the succeeded event");
      ok(
        terminal.processInvocationDigest === EV.invocationDigest,
        "succeeded event persists the invocation digest",
      );
      ok(
        terminal.processExitCode === 0 && terminal.processSignal === null &&
          terminal.processTruncated === false && terminal.processDurationMs === 1234,
        "succeeded event persists exit 0 / no signal / no truncation / duration",
      );
    } finally {
      closeFixture(fixture);
    }
  }

  console.log("gateway: evidence-free (shadow/deterministic) dispatch keeps all-null events");
  {
    const runner = createKimiFakeRunner();
    const fixture = await completedIntakeFixture("loop-evd-map-shadow-", runner);
    try {
      await recoveryEntry(fixture, runner).execute(techRequest(fixture, 1));
      const terminal = lastEvent(fixture);
      ok(terminal.status === "succeeded", "deterministic dispatch succeeds");
      ok(
        terminal.processInvocationDigest === null && terminal.processExitCode === null &&
          terminal.processSignal === null && terminal.processDurationMs === null &&
          terminal.processTruncated === null,
        "deterministic terminal keeps the all-null shadow shape",
      );
    } finally {
      closeFixture(fixture);
    }
  }

  console.log("gateway: failed terminal persists post-process failure evidence");
  {
    const failureEvidence: CapabilityProcessEvidenceShape = Object.freeze({
      invocationDigest: "d".repeat(64),
      exitCode: 1,
      signal: null,
      durationMs: 900,
      truncated: true,
    });
    const runner = evidenceFailingRunner(failureEvidence);
    // Intake must succeed (it produces the input artifact); only the
    // solution-design dispatch uses the evidence-carrying failing runner.
    const fixture = await completedIntakeFixture("loop-evd-map-fail-", createKimiFakeRunner());
    try {
      const before = fixture.runStore.listCapabilityExecutions(fixture.id.runId).length;
      const dispatched = await recoveryEntry(fixture, runner).execute(techRequest(fixture, 1));
      ok(dispatched.execution.success === false, "evidence-carrying failure returns success:false");
      const terminal = lastEvent(fixture);
      ok(
        fixture.runStore.listCapabilityExecutions(fixture.id.runId).length === before + 2,
        "failed dispatch commits exactly started + failed events",
      );
      ok(terminal.status === "failed" && terminal.errorCode === "EXECUTOR_EXCEPTION", "failed terminal records EXECUTOR_EXCEPTION");
      ok(
        terminal.processInvocationDigest === failureEvidence.invocationDigest &&
          terminal.processExitCode === 1 && terminal.processTruncated === true &&
          terminal.processDurationMs === 900,
        "failed terminal persists truncation/exit/duration evidence",
      );
      ok(terminal.retryable === true, "failed terminal stays retryable (retry_other_binding policy)");
      ok(
        fixture.runStore.listCapabilityExecutions(fixture.id.runId).filter(
          (ev) => ev.capability === "solution-design" && ev.status === "started",
        ).every((ev) => ev.processInvocationDigest === null && ev.processTruncated === null),
        "started events never carry process evidence (validator invariant)",
      );
    } finally {
      closeFixture(fixture);
    }
  }

  console.log("gateway: pre-process failure (no evidence) keeps all-null terminal");
  {
    const fixture = await completedIntakeFixture("loop-evd-map-plainfail-", createKimiFakeRunner());
    try {
      const dispatched = await recoveryEntry(fixture, plainFailingRunner()).execute(techRequest(fixture, 1));
      ok(dispatched.execution.success === false, "plain failure returns success:false");
      const terminal = lastEvent(fixture);
      ok(terminal.status === "failed", "terminal is the failed event");
      ok(
        terminal.processInvocationDigest === null && terminal.processExitCode === null &&
          terminal.processSignal === null && terminal.processDurationMs === null &&
          terminal.processTruncated === null,
        "evidence-less failure keeps the all-null terminal shape",
      );
    } finally {
      closeFixture(fixture);
    }
  }
}

async function main(): Promise<void> {
  await partA();
  await partB();
  console.log(`\nS09 process-evidence mapping: ${passed} assertions passed`);
  if (passed === 0) throw new Error("no assertions ran");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
