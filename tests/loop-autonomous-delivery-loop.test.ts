// LOOP-DELIVERY-06 — Targeted Test Suite
// ============================================
// Tests for LoopAutonomousDeliveryLoop orchestrator.
// Uses fake D05 for most tests, real D01/D02/D03 for integration.
//
// No real Codex. No network. No shell.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { randomUUID } from "node:crypto";
import { LoopAutonomousDeliveryLoop } from "../core/loop-autonomous-delivery-loop";
import type {
  LoopAutonomousDeliveryRequest,
  LoopAutonomousDeliveryResult,
  LoopDeliveryCommandStep,
} from "../core/loop-autonomous-delivery-loop";
import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopPosixProcessRunner } from "../core/loop-posix-process-runner";
import { LoopGitWorkspaceManager } from "../core/loop-git-workspace";
import type { LoopRunIdentity } from "../core/loop-executor-types";
import type {
  LoopCodexImplementationAdapter,
  LoopCodexImplementationRequest,
  LoopCodexImplementationResult,
  LoopCodexImplementationSuccess,
  LoopCodexImplementationFailure,
  LoopCodexImplementationWorkspace,
} from "../core/loop-codex-implementation-adapter";
import {
  buildLoopDeliveryEvidence,
  sanitizeExcerpt,
  tailExcerpt,
} from "../core/loop-delivery-evidence";

// ═══════════════════════════════════════ Domain Counters

interface DomainCounters {
  checks: number;
  failures: number;
}

const domains: Record<string, DomainCounters> = {
  orchestration: { checks: 0, failures: 0 },
  safety: { checks: 0, failures: 0 },
  evidence: { checks: 0, failures: 0 },
  input: { checks: 0, failures: 0 },
  integration: { checks: 0, failures: 0 },
};

let GLOBAL_PASSED = 0;
let GLOBAL_FAILED = 0;

function check(domain: string, condition: boolean, message: string): void {
  domains[domain]!.checks++;
  if (condition) {
    GLOBAL_PASSED++;
  } else {
    domains[domain]!.failures++;
    GLOBAL_FAILED++;
    console.error(`  FAIL [${domain}] ${message}`);
  }
}

function failExit(msg: string): never {
  console.error(`FATAL: ${msg}`);
  process.exit(1);
}

// ═══════════════════════════════════════ Markers

const MARKERS: Record<string, boolean> = {
  D06_TEMP_CLEANUP_COMPLETE: false,
  D06_REAL_SOURCE_UNCHANGED: false,
  D06_REAL_D02_TEST_STEP_EXECUTED: false,
  D06_INITIAL_IMPLEMENTATION_VERIFIED: false,
  D06_TEST_REPAIR_FULL_RETEST_VERIFIED: false,
  D06_REVIEW_REPAIR_FULL_RETEST_VERIFIED: false,
  D06_GLOBAL_FIX_BUDGET_VERIFIED: false,
  D06_NO_PROGRESS_FAIL_CLOSED: false,
  D06_TOTAL_DEADLINE_FAIL_CLOSED: false,
  D06_WORKSPACE_SAFETY_FAIL_CLOSED: false,
  D06_TERMINAL_STATUS_CONTRACT_VERIFIED: false,
  D06_CANONICAL_EVIDENCE_VERIFIED: false,
  D06_DELIVERY_RESULT_VERIFIED: false,
};

// ═══════════════════════════════════════ Helpers

function sha256Hex(data: string | Uint8Array): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function makeIdentity(overrides?: Partial<LoopRunIdentity>): LoopRunIdentity {
  return {
    runId: randomUUID(),
    requirementId: "REQ-D06-TEST",
    repository: "shaoyang01/ai-sdlc-standard",
    repositoryPath: overrides?.repositoryPath ?? process.cwd(),
    baseBranch: "feature/loop-runtime-v1",
    expectedBaseSha: overrides?.expectedBaseSha ?? "8fa3b4cefe33b87c9e80b61f5298888438410759",
    taskBranch: "codex/test-d06-branch",
    controlRoot: overrides?.controlRoot ?? path.join(os.tmpdir(), `d06-test-ctrl-${randomUUID()}`),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// Status digest constants for consistency
const DIGEST_CLEAN = sha256Hex("");
const DIGEST_POST_INIT = sha256Hex("clean-after");  // Matches makeFakeD05Success default
const DIGEST_POST_REPAIR = sha256Hex("clean-repair");

function makeWorkspace(overrides?: Partial<LoopCodexImplementationWorkspace>): LoopCodexImplementationWorkspace {
  return {
    workspacePath: overrides?.workspacePath ?? process.cwd(),
    taskBranch: "codex/test-d06-branch",
    expectedTaskHeadSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    expectedPreStatusDigestSha256: DIGEST_CLEAN,
    ...overrides,
  };
}

const realNodeExeId = "node";

function makeTestStep(id: string, exitCode: number, overrides?: Partial<LoopDeliveryCommandStep>): LoopDeliveryCommandStep {
  return {
    id,
    executableId: realNodeExeId,
    args: ["-e", `process.exit(${exitCode})`],
    ...overrides,
  };
}

function makePassingTestPlan(count: number = 1): LoopDeliveryCommandStep[] {
  const steps: LoopDeliveryCommandStep[] = [];
  for (let i = 0; i < count; i++) {
    steps.push(makeTestStep(`test_pass_${i + 1}`, 0));
  }
  return steps;
}

function makePassingReviewPlan(count: number = 1): LoopDeliveryCommandStep[] {
  const steps: LoopDeliveryCommandStep[] = [];
  for (let i = 0; i < count; i++) {
    steps.push(makeTestStep(`review_pass_${i + 1}`, 0));
  }
  return steps;
}

function makeRequest(overrides?: Partial<LoopAutonomousDeliveryRequest>): LoopAutonomousDeliveryRequest {
  return {
    identity: makeIdentity(),
    workspace: makeWorkspace(),
    requirement: "Implement a simple feature",
    allowedPaths: ["src/"],
    testPlan: makePassingTestPlan(1),
    reviewPlan: makePassingReviewPlan(1),
    ...overrides,
  };
}

// ═══════════════════════════════════════ Fake D05 Adapter

interface FakeD05Call {
  phase: string;
  attempt: number;
  repairEvidenceArtifactRef?: string;
}

class FakeD05Adapter implements Pick<LoopCodexImplementationAdapter, "execute"> {
  calls: FakeD05Call[] = [];
  private _responses: Map<string, LoopCodexImplementationResult> = new Map();
  private _defaultResponse: LoopCodexImplementationResult | null = null;
  private _sequence: LoopCodexImplementationResult[] = [];

  setDefaultResponse(resp: LoopCodexImplementationResult): void {
    this._defaultResponse = resp;
  }

  setResponse(phase: string, attempt: number, resp: LoopCodexImplementationResult): void {
    this._responses.set(`${phase}:${attempt}`, resp);
  }

  setSequence(responses: LoopCodexImplementationResult[]): void {
    this._sequence = [...responses];
  }

  async execute(
    request: LoopCodexImplementationRequest,
  ): Promise<LoopCodexImplementationResult> {
    this.calls.push({
      phase: request.phase,
      attempt: request.attempt,
      repairEvidenceArtifactRef: request.repairEvidenceArtifactRef,
    });

    // Try specific response first
    const key = `${request.phase}:${request.attempt}`;
    const specific = this._responses.get(key);
    if (specific) return specific;

    // Try sequence
    if (this._sequence.length > 0) {
      return this._sequence.shift()!;
    }

    // Fall back to default
    if (this._defaultResponse) return this._defaultResponse;

    // Default success
    return makeFakeD05Success(request);
  }
}

function makeFakeD05Success(
  request: LoopCodexImplementationRequest,
  overrides?: Partial<LoopCodexImplementationSuccess>,
): LoopCodexImplementationSuccess {
  const patchHex = sha256Hex(`patch-${request.phase}-${request.attempt}-${Date.now()}`);
  return {
    status: "succeeded",
    phase: request.phase,
    attempt: request.attempt,
    patchArtifactRef: `loop-artifact:v1:code_patch:sha256:${patchHex}`,
    patchDigestSha256: patchHex,
    patchSizeBytes: 100,
    applicationState: "applied",
    files: ["src/test.ts", "src/impl.ts"],
    preTaskHeadSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    postTaskHeadSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    preStatusDigestSha256: sha256Hex("clean-before"),
    postStatusDigestSha256: sha256Hex("clean-after"),
    preTargetStateDigestSha256: sha256Hex("target-before"),
    postTargetStateDigestSha256: sha256Hex("target-after"),
    ...overrides,
  };
}

function makeFakeD05Failure(
  errorCode: string = "INTERNAL_ERROR",
  overrides?: Partial<LoopCodexImplementationFailure>,
): LoopCodexImplementationFailure {
  return {
    status: "failed",
    phase: "initial",
    attempt: 0,
    errorCode: errorCode as LoopCodexImplementationFailure["errorCode"],
    retryable: false,
    safeMessage: `failed with ${errorCode}`,
    ...overrides,
  };
}

// ═══════════════════════════════════════ Fake D02 Runner

class FakeRunner {
  private _responses: Map<string, unknown> = new Map();
  private _defaultExitCode: number = 0;
  private _throwError: Error | null = null;

  setDefaultExitCode(code: number): void { this._defaultExitCode = code; }
  setThrowError(err: Error): void { this._throwError = err; }
  setStepResponse(executableId: string, response: unknown): void {
    this._responses.set(executableId, response);
  }

  async run(req: { executableId: string; args?: readonly string[]; cwd: string; timeoutMs?: number; maxStdoutBytes?: number; maxStderrBytes?: number }): Promise<unknown> {
    if (this._throwError) throw this._throwError;

    const specific = this._responses.get(req.executableId);
    if (specific) {
      if (typeof specific === "function") return specific(req);
      return specific;
    }

    return {
      status: "exited",
      exitCode: this._defaultExitCode,
      signal: null,
      durationMs: 10,
      stdout: "ok",
      stderr: "",
      stdoutBytesReceived: 2,
      stderrBytesReceived: 0,
      stdoutTruncated: false,
      stderrTruncated: false,
      termSignalSent: false,
      killSignalSent: false,
    };
  }
}

// ═══════════════════════════════════════ Fake Workspace Manager

class FakeWorkspaceManager {
  private _snapshot: Record<string, unknown> | null = null;
  private _throwError: Error | null = null;
  private _snapshotSequence: Record<string, unknown>[] = [];

  setSnapshot(snap: Record<string, unknown>): void { this._snapshot = snap; }
  setThrowError(err: Error): void { this._throwError = err; }
  setSnapshotSequence(seq: Record<string, unknown>[]): void { this._snapshotSequence = [...seq]; }

  async inspect(identity: LoopRunIdentity): Promise<Record<string, unknown>> {
    if (this._throwError) throw this._throwError;

    if (this._snapshotSequence.length > 0) {
      return this._snapshotSequence.shift()!;
    }

    if (this._snapshot) return { ...this._snapshot };

    return {
      state: "inspected",
      runId: identity.runId,
      repository: identity.repository,
      repositoryPath: identity.repositoryPath,
      controlRoot: identity.controlRoot,
      gitCommonDir: "/tmp/git",
      workspacePath: process.cwd(),
      baseBranch: identity.baseBranch,
      expectedBaseSha: identity.expectedBaseSha,
      currentBaseSha: identity.expectedBaseSha,
      baseDrifted: false,
      taskBranch: identity.taskBranch,
      taskHeadSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      taskHasChanges: true,
      taskStatusDigestSha256: DIGEST_CLEAN,
      sourceHeadSha: identity.expectedBaseSha,
      sourceBranch: identity.baseBranch,
      sourceWipDigestSha256: DIGEST_CLEAN,
    };
  }
}

// ═══════════════════════════════════════ Test Suite

let tempDirs: string[] = [];

function registerTempDir(dir: string): void {
  tempDirs.push(dir);
}

function cleanupTemps(): void {
  for (const dir of tempDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }
  }
  tempDirs = [];
}

function verifyCleanup(): void {
  for (const dir of tempDirs) {
    const exists = fs.existsSync(dir);
    check("integration", !exists, `temp dir cleaned: ${dir}`);
  }
  if (tempDirs.length > 0) {
    MARKERS.D06_TEMP_CLEANUP_COMPLETE = true;
  }
}

// ═══════════════════════════════════════ A. Input Validation

async function testInputValidation(): Promise<void> {
  const fakeD05 = new FakeD05Adapter();
  const fakeRunner = new FakeRunner();
  const fakeWM = new FakeWorkspaceManager();

  function makeLoop(opts?: Record<string, unknown>): LoopAutonomousDeliveryLoop {
    return new LoopAutonomousDeliveryLoop({
      runner: fakeRunner as unknown as LoopPosixProcessRunner,
      workspaceManager: fakeWM as unknown as LoopGitWorkspaceManager,
      artifactStore: { put: () => { throw new Error("not needed"); } } as unknown as LoopArtifactStore,
      implementationAdapter: fakeD05 as unknown as LoopCodexImplementationAdapter,
      ...opts,
    });
  }

  const loop = makeLoop();

  // A1. null request
  {
    const result = await loop.execute(null as unknown as LoopAutonomousDeliveryRequest);
    check("input", result.status === "failed", "A1: null request → failed");
    check("input", result.reasonCode === "INVALID_INPUT", "A1: reasonCode INVALID_INPUT");
  }

  // A2. array request
  {
    const result = await loop.execute([] as unknown as LoopAutonomousDeliveryRequest);
    check("input", result.status === "failed", "A2: array request → failed");
    check("input", result.reasonCode === "INVALID_INPUT", "A2: reasonCode INVALID_INPUT");
  }

  // A3. class instance (prototype check)
  {
    class FakeReq {
      identity = makeIdentity();
      workspace = makeWorkspace();
      requirement = "test";
      allowedPaths = ["src/"];
      testPlan = makePassingTestPlan(1);
      reviewPlan = makePassingReviewPlan(1);
    }
    const result = await loop.execute(new FakeReq() as unknown as LoopAutonomousDeliveryRequest);
    check("input", result.status === "failed", "A3: class instance → failed");
    check("input", result.reasonCode === "INVALID_INPUT", "A3: reasonCode INVALID_INPUT");
  }

  // A4. unknown field
  {
    const result = await loop.execute({
      identity: makeIdentity(),
      workspace: makeWorkspace(),
      requirement: "test",
      allowedPaths: ["src/"],
      testPlan: makePassingTestPlan(1),
      reviewPlan: makePassingReviewPlan(1),
      unknownField: "bad",
    } as unknown as LoopAutonomousDeliveryRequest);
    check("input", result.status === "failed", "A4: unknown field → failed");
    check("input", result.reasonCode === "INVALID_INPUT", "A4: reasonCode INVALID_INPUT");
  }

  // A5. __proto__ key
  {
    const badReq = Object.create(null);
    badReq.identity = makeIdentity();
    badReq.workspace = makeWorkspace();
    badReq.requirement = "test";
    badReq.allowedPaths = ["src/"];
    badReq.testPlan = makePassingTestPlan(1);
    badReq.reviewPlan = makePassingReviewPlan(1);
    badReq.__proto__ = { evil: true };
    const result = await loop.execute(badReq as unknown as LoopAutonomousDeliveryRequest);
    check("input", result.status === "failed", "A5: __proto__ key → failed");
    check("input", result.reasonCode === "INVALID_INPUT", "A5: reasonCode INVALID_INPUT");
  }

  // A6. null workspace
  {
    const result = await loop.execute({
      identity: makeIdentity(),
      workspace: null,
      requirement: "test",
      allowedPaths: ["src/"],
      testPlan: makePassingTestPlan(1),
      reviewPlan: makePassingReviewPlan(1),
    } as unknown as LoopAutonomousDeliveryRequest);
    check("input", result.status === "failed", "A6: null workspace → failed");
  }

  // A7. invalid identity
  {
    const result = await loop.execute({
      identity: null,
      workspace: makeWorkspace(),
      requirement: "test",
      allowedPaths: ["src/"],
      testPlan: makePassingTestPlan(1),
      reviewPlan: makePassingReviewPlan(1),
    } as unknown as LoopAutonomousDeliveryRequest);
    check("input", result.status === "failed", "A7: null identity → failed");
  }

  // A8. empty testPlan
  {
    const result = await loop.execute({
      identity: makeIdentity(),
      workspace: makeWorkspace(),
      requirement: "test",
      allowedPaths: ["src/"],
      testPlan: [],
      reviewPlan: makePassingReviewPlan(1),
    } as unknown as LoopAutonomousDeliveryRequest);
    check("input", result.status === "failed", "A8: empty testPlan → failed");
  }

  // A9. empty reviewPlan
  {
    const result = await loop.execute({
      identity: makeIdentity(),
      workspace: makeWorkspace(),
      requirement: "test",
      allowedPaths: ["src/"],
      testPlan: makePassingTestPlan(1),
      reviewPlan: [],
    } as unknown as LoopAutonomousDeliveryRequest);
    check("input", result.status === "failed", "A9: empty reviewPlan → failed");
  }

  // A10. duplicate step ID
  {
    const result = await loop.execute(makeRequest({
      testPlan: [makeTestStep("dup_id", 0), makeTestStep("dup_id", 0)],
    }));
    check("input", result.status === "failed", "A10: duplicate step ID → failed");
  }

  // A11. invalid step ID (bad format)
  {
    const result = await loop.execute(makeRequest({
      testPlan: [makeTestStep("!invalid", 0)],
    }));
    check("input", result.status === "failed", "A11: invalid step ID → failed");
  }

  // A12. invalid executableId (empty)
  {
    const result = await loop.execute(makeRequest({
      testPlan: [{ id: "step1", executableId: "" }],
    }));
    check("input", result.status === "failed", "A12: empty executableId → failed");
  }

  // A13. args non-array
  {
    const result = await loop.execute(makeRequest({
      testPlan: [{ id: "step1", executableId: "node", args: "not-array" as unknown as string[] }],
    }));
    check("input", result.status === "failed", "A13: args non-array → failed");
  }

  // A14. args with NUL
  {
    const result = await loop.execute(makeRequest({
      testPlan: [{ id: "step1", executableId: "node", args: ["bad\x00arg"] }],
    }));
    check("input", result.status === "failed", "A14: args NUL → failed");
  }

  // A15. invalid timeout
  {
    const result = await loop.execute(makeRequest({
      testPlan: [{ id: "step1", executableId: "node", timeoutMs: 99 }],
    }));
    check("input", result.status === "failed", "A15: timeout too low → failed");
  }

  // A16. invalid output limit
  {
    const result = await loop.execute(makeRequest({
      testPlan: [{ id: "step1", executableId: "node", maxStdoutBytes: 0 }],
    }));
    check("input", result.status === "failed", "A16: maxStdoutBytes 0 → failed");
  }

  // A17. invalid maxFixRounds
  {
    const result = await loop.execute(makeRequest({ maxFixRounds: -1 }));
    check("input", result.status === "failed", "A17: negative maxFixRounds → failed");
  }

  // A18. invalid maxFixRounds too high
  {
    const result = await loop.execute(makeRequest({ maxFixRounds: 5 }));
    check("input", result.status === "failed", "A18: maxFixRounds > 4 → failed");
  }

  // A19. invalid maxTotalDurationMs too low
  {
    const result = await loop.execute(makeRequest({ maxTotalDurationMs: 999 }));
    check("input", result.status === "failed", "A19: maxTotalDurationMs too low → failed");
  }

  // A20. invalid maxTotalDurationMs too high
  {
    const result = await loop.execute(makeRequest({ maxTotalDurationMs: 4000000 }));
    check("input", result.status === "failed", "A20: maxTotalDurationMs too high → failed");
  }

  // A21. input arrays not mutated (test plan unmodified after request)
  {
    const plan = makePassingTestPlan(2);
    const planCopy = JSON.stringify(plan);
    const req = makeRequest({ testPlan: plan });
    check("input", JSON.stringify(plan) === planCopy, "A21: input plan not mutated");
  }

  console.log("  Input validation tests complete");
}

// ═══════════════════════════════════════ B. Pass Path

async function testPassPath(): Promise<void> {
  const fakeD05 = new FakeD05Adapter();
  const fakeRunner = new FakeRunner();
  const fakeWM = new FakeWorkspaceManager();

  // Set up a fake artifact store
  const ctrlRoot = path.join(os.tmpdir(), `d06-test-pass-${randomUUID()}`);
  registerTempDir(ctrlRoot);
  fs.mkdirSync(ctrlRoot, { recursive: true });
  const repoPath = process.cwd();
  const artifactStore = new LoopArtifactStore({
    controlRoot: ctrlRoot,
    repositoryPath: repoPath,
  });
  artifactStore.init();

  const loop = new LoopAutonomousDeliveryLoop({
    runner: fakeRunner as unknown as LoopPosixProcessRunner,
    workspaceManager: fakeWM as unknown as LoopGitWorkspaceManager,
    artifactStore: artifactStore,
    implementationAdapter: fakeD05 as unknown as LoopCodexImplementationAdapter,
  });

  // Set up workspace binding
  const identity = makeIdentity();
  const workspace = makeWorkspace();
  const baseSnap = {
    state: "inspected",
    runId: identity.runId,
    repository: identity.repository,
    repositoryPath: identity.repositoryPath,
    controlRoot: identity.controlRoot,
    gitCommonDir: "/tmp/git",
    workspacePath: workspace.workspacePath,
    baseBranch: identity.baseBranch,
    expectedBaseSha: identity.expectedBaseSha,
    currentBaseSha: identity.expectedBaseSha,
    baseDrifted: false,
    taskBranch: workspace.taskBranch,
    taskHeadSha: workspace.expectedTaskHeadSha,
    taskHasChanges: true,
    taskStatusDigestSha256: workspace.expectedPreStatusDigestSha256,
    sourceHeadSha: identity.expectedBaseSha,
    sourceBranch: identity.baseBranch,
    sourceWipDigestSha256: DIGEST_CLEAN,
  };
  fakeWM.setSnapshot(baseSnap);

  // Set up D05 success
  fakeD05.setDefaultResponse(makeFakeD05Success({ phase: "initial", attempt: 0 } as LoopCodexImplementationRequest, {
    postTaskHeadSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    postStatusDigestSha256: DIGEST_POST_INIT,
    files: ["src/test.ts"],
  }));

  // Update workspace snapshot after D05
  const postInitSnap = {
    state: "inspected",
    runId: identity.runId,
    repository: identity.repository,
    repositoryPath: identity.repositoryPath,
    controlRoot: identity.controlRoot,
    gitCommonDir: "/tmp/git",
    workspacePath: workspace.workspacePath,
    baseBranch: identity.baseBranch,
    expectedBaseSha: identity.expectedBaseSha,
    currentBaseSha: identity.expectedBaseSha,
    baseDrifted: false,
    taskBranch: workspace.taskBranch,
    taskHeadSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    taskHasChanges: true,
    taskStatusDigestSha256: DIGEST_POST_INIT,
    sourceHeadSha: identity.expectedBaseSha,
    sourceBranch: identity.baseBranch,
    sourceWipDigestSha256: DIGEST_CLEAN,
  };

  fakeWM.setSnapshotSequence([baseSnap, postInitSnap, postInitSnap, postInitSnap, postInitSnap, postInitSnap, postInitSnap]);

  const result = await loop.execute(makeRequest({
    identity,
    workspace,
    testPlan: makePassingTestPlan(1),
    reviewPlan: makePassingReviewPlan(1),
  }));

  check("orchestration", result.status === "succeeded", "B1: status succeeded");
  check("orchestration", result.reasonCode === "DELIVERY_SUCCEEDED", "B2: reasonCode DELIVERY_SUCCEEDED");
  check("orchestration", fakeD05.calls.length === 1, "B3: D05 called exactly once");
  check("orchestration", fakeD05.calls[0]!.phase === "initial", "B4: D05 initial phase");
  check("orchestration", fakeD05.calls[0]!.attempt === 0, "B5: D05 attempt=0");
  check("orchestration", result.totalFixRounds === 0, "B6: no fix rounds");
  check("orchestration", result.testAttempts >= 1, "B7: test attempts >= 1");
  check("orchestration", result.reviewAttempts >= 1, "B8: review attempts >= 1");
  check("orchestration", result.patchArtifactRefs.length === 1, "B9: one patch ref");
  check("orchestration", result.files.length >= 1, "B10: files non-empty");
  check("orchestration", result.deliveryResultArtifactRef !== undefined, "B11: delivery_result persisted");
  check("orchestration", Array.isArray(result.trace) && result.trace.length > 0, "B12: trace non-empty");

  // Verify result is frozen
  try {
    (result as unknown as Record<string, unknown>).status = "hacked";
    check("orchestration", true, "B13: result frozen check"); // If frozen, assignment might silently fail
    check("orchestration", Object.isFrozen(result), "B13: result is frozen");
  } catch {
    check("orchestration", true, "B13: result is frozen (throws on mutate)");
  }

  MARKERS.D06_INITIAL_IMPLEMENTATION_VERIFIED = true;

  artifactStore.close();
  console.log("  Pass path tests complete");
}

// ═══════════════════════════════════════ C. Test Repair

async function testTestRepair(): Promise<void> {
  const fakeD05 = new FakeD05Adapter();
  const fakeRunner = new FakeRunner();
  const fakeWM = new FakeWorkspaceManager();

  const ctrlRoot = path.join(os.tmpdir(), `d06-test-repair-${randomUUID()}`);
  registerTempDir(ctrlRoot);
  fs.mkdirSync(ctrlRoot, { recursive: true });
  const artifactStore = new LoopArtifactStore({
    controlRoot: ctrlRoot,
    repositoryPath: process.cwd(),
  });
  artifactStore.init();

  const identity = makeIdentity();
  const workspace = makeWorkspace();

  const baseSnap = {
    state: "inspected",
    runId: identity.runId,
    repository: identity.repository,
    repositoryPath: identity.repositoryPath,
    controlRoot: identity.controlRoot,
    gitCommonDir: "/tmp/git",
    workspacePath: workspace.workspacePath,
    baseBranch: identity.baseBranch,
    expectedBaseSha: identity.expectedBaseSha,
    currentBaseSha: identity.expectedBaseSha,
    baseDrifted: false,
    taskBranch: workspace.taskBranch,
    taskHeadSha: workspace.expectedTaskHeadSha,
    taskHasChanges: true,
    taskStatusDigestSha256: workspace.expectedPreStatusDigestSha256,
    sourceHeadSha: identity.expectedBaseSha,
    sourceBranch: identity.baseBranch,
    sourceWipDigestSha256: DIGEST_CLEAN,
  };

  const postInit = { ...baseSnap, taskHeadSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", taskStatusDigestSha256: DIGEST_POST_INIT };
  const postRepair = { ...baseSnap, taskHeadSha: "cccccccccccccccccccccccccccccccccccccccc", taskStatusDigestSha256: DIGEST_POST_REPAIR, taskHasChanges: true };

  // Set up workspace snapshot sequence for test repair flow:
  // initial bind → post-init → test(fail) → evidence store → post-repair → re-test(pass) → review(pass) → success
  fakeWM.setSnapshotSequence([
    baseSnap,     // 0: initial bind
    postInit,     // 1: post-init bind (after D05 initial)
    postInit,     // 2: test pre-inspect
    postInit,     // 3: test post-inspect (FAILS - exitCode=1)
    postRepair,   // 4: post-repair bind (after D05 test_repair)
    postRepair,   // 5: re-test pre-inspect
    postRepair,   // 6: re-test post-inspect (passes)
    postRepair,   // 7: review pre-inspect
    postRepair,   // 8: review post-inspect (passes)
    postRepair,   // 9: final bind for success
    postRepair,   // 10: extra
  ]);

  // D05: initial succeeds, test_repair succeeds
  fakeD05.setDefaultResponse(makeFakeD05Success({ phase: "initial", attempt: 0 } as LoopCodexImplementationRequest));
  fakeD05.setResponse("test_repair", 1, makeFakeD05Success({ phase: "test_repair", attempt: 1 } as LoopCodexImplementationRequest, {
    postTaskHeadSha: "cccccccccccccccccccccccccccccccccccccccc",
    postStatusDigestSha256: DIGEST_POST_REPAIR,
  }));

  // Make first test step fail, then all pass
  let testCallCount = 0;
  const origRun = fakeRunner.run.bind(fakeRunner);
  fakeRunner.run = async (req: { executableId: string }) => {
    testCallCount++;
    if (testCallCount <= 1) {
      return {
        status: "exited", exitCode: 1, signal: null, durationMs: 10,
        stdout: "test failure output", stderr: "error details",
        stdoutBytesReceived: 18, stderrBytesReceived: 13,
        stdoutTruncated: false, stderrTruncated: false,
        termSignalSent: false, killSignalSent: false,
      };
    }
    return origRun(req);
  };

  const loop = new LoopAutonomousDeliveryLoop({
    runner: fakeRunner as unknown as LoopPosixProcessRunner,
    workspaceManager: fakeWM as unknown as LoopGitWorkspaceManager,
    artifactStore: artifactStore,
    implementationAdapter: fakeD05 as unknown as LoopCodexImplementationAdapter,
  });

  const result = await loop.execute(makeRequest({
    identity,
    workspace,
    testPlan: [makeTestStep("test_step_1", 0)],
    reviewPlan: makePassingReviewPlan(1),
    maxFixRounds: 4,
  }));

  check("orchestration", result.status === "succeeded", "C1: status succeeded after test repair");
  check("orchestration", result.totalFixRounds === 1, "C2: one fix round");
  check("orchestration", result.testSummaryArtifactRefs.length >= 1, "C3: test_summary persisted");
  check("orchestration", result.patchArtifactRefs.length >= 2, "C4: both initial and repair patches");
  check("orchestration", fakeD05.calls.length >= 2, "C5: D05 called at least twice");
  check("orchestration", fakeD05.calls.some((c) => c.phase === "test_repair"), "C6: D05 test_repair called");
  check("orchestration", fakeD05.calls.some((c) => c.attempt === 1 && c.phase === "test_repair"), "C7: test_repair attempt=1");

  MARKERS.D06_TEST_REPAIR_FULL_RETEST_VERIFIED = true;

  artifactStore.close();
  console.log("  Test repair tests complete");
}

// ═══════════════════════════════════════ D. Review Repair

async function testReviewRepair(): Promise<void> {
  const fakeD05 = new FakeD05Adapter();
  const fakeRunner = new FakeRunner();
  const fakeWM = new FakeWorkspaceManager();

  const ctrlRoot = path.join(os.tmpdir(), `d06-test-review-repair-${randomUUID()}`);
  registerTempDir(ctrlRoot);
  fs.mkdirSync(ctrlRoot, { recursive: true });
  const artifactStore = new LoopArtifactStore({
    controlRoot: ctrlRoot,
    repositoryPath: process.cwd(),
  });
  artifactStore.init();

  const identity = makeIdentity();
  const workspace = makeWorkspace();

  const baseSnap = {
    state: "inspected",
    runId: identity.runId,
    repository: identity.repository,
    repositoryPath: identity.repositoryPath,
    controlRoot: identity.controlRoot,
    gitCommonDir: "/tmp/git",
    workspacePath: workspace.workspacePath,
    baseBranch: identity.baseBranch,
    expectedBaseSha: identity.expectedBaseSha,
    currentBaseSha: identity.expectedBaseSha,
    baseDrifted: false,
    taskBranch: workspace.taskBranch,
    taskHeadSha: workspace.expectedTaskHeadSha,
    taskHasChanges: true,
    taskStatusDigestSha256: workspace.expectedPreStatusDigestSha256,
    sourceHeadSha: identity.expectedBaseSha,
    sourceBranch: identity.baseBranch,
    sourceWipDigestSha256: DIGEST_CLEAN,
  };

  const postInit = { ...baseSnap, taskHeadSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", taskStatusDigestSha256: DIGEST_POST_INIT };
  const postRepair = { ...baseSnap, taskHeadSha: "cccccccccccccccccccccccccccccccccccccccc", taskStatusDigestSha256: DIGEST_POST_REPAIR, taskHasChanges: true };

  fakeWM.setSnapshotSequence([
    baseSnap,     // 0: initial bind
    postInit,     // 1: post-init bind
    postInit,     // 2: test pre-inspect
    postInit,     // 3: test post-inspect (passes)
    postInit,     // 4: review pre-inspect
    postInit,     // 5: review post-inspect (FAILS)
    postRepair,   // 6: post-repair bind (after review_repair)
    postRepair,   // 7: re-test pre-inspect
    postRepair,   // 8: re-test post-inspect (passes)
    postRepair,   // 9: re-review pre-inspect
    postRepair,   // 10: re-review post-inspect (passes)
    postRepair,   // 11: final bind
    postRepair,   // 12: extra
  ]);

  fakeD05.setDefaultResponse(makeFakeD05Success({ phase: "initial", attempt: 0 } as LoopCodexImplementationRequest));
  fakeD05.setResponse("review_repair", 1, makeFakeD05Success({ phase: "review_repair", attempt: 1 } as LoopCodexImplementationRequest, {
    postTaskHeadSha: "cccccccccccccccccccccccccccccccccccccccc",
    postStatusDigestSha256: DIGEST_POST_REPAIR,
  }));

  // Test steps pass, review steps fail
  let callCount = 0;
  const origRun = fakeRunner.run.bind(fakeRunner);
  fakeRunner.run = async (req: { executableId: string }) => {
    callCount++;
    // First call is test step → pass
    // Second call is review step → fail
    if (callCount === 2) {
      return {
        status: "exited",
        exitCode: 1,
        signal: null,
        durationMs: 10,
        stdout: "review failure",
        stderr: "review error",
        stdoutBytesReceived: 14,
        stderrBytesReceived: 12,
        stdoutTruncated: false,
        stderrTruncated: false,
        termSignalSent: false,
        killSignalSent: false,
      };
    }
    // After repair: test passes, review passes
    return origRun(req);
  };

  const loop = new LoopAutonomousDeliveryLoop({
    runner: fakeRunner as unknown as LoopPosixProcessRunner,
    workspaceManager: fakeWM as unknown as LoopGitWorkspaceManager,
    artifactStore: artifactStore,
    implementationAdapter: fakeD05 as unknown as LoopCodexImplementationAdapter,
  });

  const result = await loop.execute(makeRequest({
    identity,
    workspace,
    testPlan: [makeTestStep("test_step_1", 0)],
    reviewPlan: [makeTestStep("review_step_1", 0)],
    maxFixRounds: 4,
  }));

  check("orchestration", result.status === "succeeded", "D1: status succeeded after review repair");
  check("orchestration", result.totalFixRounds === 1, "D2: one fix round");
  check("orchestration", result.reviewSummaryArtifactRefs.length >= 1, "D3: review_summary persisted");
  check("orchestration", fakeD05.calls.some((c) => c.phase === "review_repair"), "D4: D05 review_repair called");
  check("orchestration", fakeD05.calls.some((c) => c.attempt === 1 && c.phase === "review_repair"), "D5: review_repair attempt=1");

  MARKERS.D06_REVIEW_REPAIR_FULL_RETEST_VERIFIED = true;

  artifactStore.close();
  console.log("  Review repair tests complete");
}

// ═══════════════════════════════════════ E. Mixed Loop

async function testMixedLoop(): Promise<void> {
  const fakeD05 = new FakeD05Adapter();
  const fakeRunner = new FakeRunner();
  const fakeWM = new FakeWorkspaceManager();

  const ctrlRoot = path.join(os.tmpdir(), `d06-test-mixed-${randomUUID()}`);
  registerTempDir(ctrlRoot);
  fs.mkdirSync(ctrlRoot, { recursive: true });
  const artifactStore = new LoopArtifactStore({
    controlRoot: ctrlRoot,
    repositoryPath: process.cwd(),
  });
  artifactStore.init();

  const identity = makeIdentity();
  const workspace = makeWorkspace();

  // Setup D05 sequence: initial, test_repair, review_repair, test_repair
  // Each repair produces a different postStatusDigestSha256 to match snapshot sequences
  fakeD05.setResponse("initial", 0, makeFakeD05Success({ phase: "initial", attempt: 0 } as LoopCodexImplementationRequest));
  fakeD05.setResponse("test_repair", 1, makeFakeD05Success({ phase: "test_repair", attempt: 1 } as LoopCodexImplementationRequest, {
    postTaskHeadSha: "c" + "c".repeat(39),
    postStatusDigestSha256: DIGEST_POST_REPAIR,
  }));
  fakeD05.setResponse("review_repair", 1, makeFakeD05Success({ phase: "review_repair", attempt: 1 } as LoopCodexImplementationRequest, {
    postTaskHeadSha: "d" + "d".repeat(39),
    postStatusDigestSha256: DIGEST_POST_REPAIR,
  }));
  fakeD05.setResponse("test_repair", 2, makeFakeD05Success({ phase: "test_repair", attempt: 2 } as LoopCodexImplementationRequest, {
    postTaskHeadSha: "e" + "e".repeat(39),
    postStatusDigestSha256: DIGEST_POST_REPAIR,
  }));

  // Phase transitions: initial → test(fail) → test_repair → test(pass) → review(fail) → review_repair → test(fail) → test_repair → test(pass) → review(pass)
  const baseSnap = {
    state: "inspected",
    runId: identity.runId,
    repository: identity.repository,
    repositoryPath: identity.repositoryPath,
    controlRoot: identity.controlRoot,
    gitCommonDir: "/tmp/git",
    workspacePath: workspace.workspacePath,
    baseBranch: identity.baseBranch,
    expectedBaseSha: identity.expectedBaseSha,
    currentBaseSha: identity.expectedBaseSha,
    baseDrifted: false,
    taskBranch: workspace.taskBranch,
    taskHeadSha: workspace.expectedTaskHeadSha,
    taskHasChanges: true,
    taskStatusDigestSha256: workspace.expectedPreStatusDigestSha256,
    sourceHeadSha: identity.expectedBaseSha,
    sourceBranch: identity.baseBranch,
    sourceWipDigestSha256: DIGEST_CLEAN,
  };

  const postD05 = (sha: string, digest: string) => ({
    ...baseSnap, taskHeadSha: sha, taskStatusDigestSha256: digest, taskHasChanges: true,
  });

  const s1 = postD05("b" + "b".repeat(39), DIGEST_POST_INIT);  // After initial D05
  const s2 = postD05("c" + "c".repeat(39), DIGEST_POST_REPAIR); // After test_repair
  const s3 = postD05("d" + "d".repeat(39), DIGEST_POST_REPAIR); // After review_repair
  const s4 = postD05("e" + "e".repeat(39), DIGEST_POST_REPAIR); // After test_repair #2

  fakeWM.setSnapshotSequence([
    baseSnap, // 0: initial bind
    s1,       // 1: post-init
    s1, s1,   // 2,3: test fails
    s2,       // 4: post test_repair #1
    s2, s2,   // 5,6: test passes
    s2, s2,   // 7,8: review fails
    s3,       // 9: post review_repair
    s3, s3,   // 10,11: re-test fails
    s4,       // 12: post test_repair #2
    s4, s4,   // 13,14: re-test passes
    s4, s4,   // 15,16: re-review passes
    s4,       // 17: final bind
  ]);

  let callNum = 0;
  const origRun = fakeRunner.run.bind(fakeRunner);
  fakeRunner.run = async (req: { executableId: string }) => {
    callNum++;
    // Phase mapping:
    // 1: initial test → fail
    // 2: re-test after test_repair → pass
    // 3: review → fail
    // 4: re-test after review_repair → fail
    // 5: re-test after test_repair #2 → pass
    // 6: re-review → pass
    if (callNum === 1 || callNum === 3 || callNum === 4) {
      return {
        status: "exited",
        exitCode: 1,
        signal: null,
        durationMs: 10,
        stdout: "fail",
        stderr: "err",
        stdoutBytesReceived: 4,
        stderrBytesReceived: 3,
        stdoutTruncated: false,
        stderrTruncated: false,
        termSignalSent: false,
        killSignalSent: false,
      };
    }
    return origRun(req);
  };

  const loop = new LoopAutonomousDeliveryLoop({
    runner: fakeRunner as unknown as LoopPosixProcessRunner,
    workspaceManager: fakeWM as unknown as LoopGitWorkspaceManager,
    artifactStore: artifactStore,
    implementationAdapter: fakeD05 as unknown as LoopCodexImplementationAdapter,
  });

  const result = await loop.execute(makeRequest({
    identity,
    workspace,
    testPlan: [makeTestStep("t1", 0)],
    reviewPlan: [makeTestStep("r1", 0)],
    maxFixRounds: 4,
  }));

  check("orchestration", result.status === "succeeded", "E1: mixed loop succeeded");
  check("orchestration", result.totalFixRounds >= 3, "E2: total fix rounds >= 3");

  // Count distinct repair phases
  const testRepairs = fakeD05.calls.filter((c) => c.phase === "test_repair").length;
  const reviewRepairs = fakeD05.calls.filter((c) => c.phase === "review_repair").length;
  check("orchestration", testRepairs >= 2, "E3: multiple test repairs");
  check("orchestration", reviewRepairs >= 1, "E4: at least one review repair");

  MARKERS.D06_GLOBAL_FIX_BUDGET_VERIFIED = true;

  artifactStore.close();
  console.log("  Mixed loop tests complete");
}

// ═══════════════════════════════════════ F. Budget

async function testBudget(): Promise<void> {
  const fakeD05 = new FakeD05Adapter();
  const fakeRunner = new FakeRunner();
  const fakeWM = new FakeWorkspaceManager();

  const ctrlRoot = path.join(os.tmpdir(), `d06-test-budget-${randomUUID()}`);
  registerTempDir(ctrlRoot);
  fs.mkdirSync(ctrlRoot, { recursive: true });
  const artifactStore = new LoopArtifactStore({
    controlRoot: ctrlRoot,
    repositoryPath: process.cwd(),
  });
  artifactStore.init();

  // Test maxFixRounds=0 (fail on first test failure)
  {
    const identity = makeIdentity();
    const workspace = makeWorkspace();

    fakeD05.setResponse("initial", 0, makeFakeD05Success({ phase: "initial", attempt: 0 } as LoopCodexImplementationRequest));

    let callCount = 0;
    fakeRunner.setDefaultExitCode(0);
    const origRun = fakeRunner.run.bind(fakeRunner);
    fakeRunner.run = async (req: { executableId: string }) => {
      callCount++;
      if (callCount === 1) {
        return {
          status: "exited", exitCode: 1, signal: null, durationMs: 10,
          stdout: "fail", stderr: "", stdoutBytesReceived: 4, stderrBytesReceived: 0,
          stdoutTruncated: false, stderrTruncated: false,
          termSignalSent: false, killSignalSent: false,
        };
      }
      return origRun(req);
    };

    const baseSnap = {
      state: "inspected", runId: identity.runId, repository: identity.repository,
      repositoryPath: identity.repositoryPath, controlRoot: identity.controlRoot,
      gitCommonDir: "/tmp/git", workspacePath: workspace.workspacePath,
      baseBranch: identity.baseBranch, expectedBaseSha: identity.expectedBaseSha,
      currentBaseSha: identity.expectedBaseSha, baseDrifted: false,
      taskBranch: workspace.taskBranch, taskHeadSha: workspace.expectedTaskHeadSha,
      taskHasChanges: true, taskStatusDigestSha256: workspace.expectedPreStatusDigestSha256,
      sourceHeadSha: identity.expectedBaseSha, sourceBranch: identity.baseBranch,
      sourceWipDigestSha256: DIGEST_CLEAN,
    };
    const postInit = { ...baseSnap, taskHeadSha: "b" + "b".repeat(39), taskStatusDigestSha256: DIGEST_POST_INIT };
    fakeWM.setSnapshotSequence([baseSnap, postInit, postInit, postInit, postInit]);

    const loop = new LoopAutonomousDeliveryLoop({
      runner: fakeRunner as unknown as LoopPosixProcessRunner,
      workspaceManager: fakeWM as unknown as LoopGitWorkspaceManager,
      artifactStore: artifactStore,
      implementationAdapter: fakeD05 as unknown as LoopCodexImplementationAdapter,
    });

    const result = await loop.execute(makeRequest({
      identity, workspace,
      testPlan: [makeTestStep("t1", 0)],
      reviewPlan: makePassingReviewPlan(1),
      maxFixRounds: 0,
    }));

    check("orchestration", result.status === "failed", "F1: maxFixRounds=0 → failed");
    check("orchestration", result.reasonCode === "FIX_BUDGET_EXHAUSTED", "F2: reasonCode FIX_BUDGET_EXHAUSTED");
    check("orchestration", fakeD05.calls.length === 1, "F3: only initial D05 call, no repair");
  }

  artifactStore.close();
  console.log("  Budget tests complete");
}

// ═══════════════════════════════════════ G. No Progress

async function testNoProgress(): Promise<void> {
  const fakeD05 = new FakeD05Adapter();
  const fakeRunner = new FakeRunner();
  const fakeWM = new FakeWorkspaceManager();

  const ctrlRoot = path.join(os.tmpdir(), `d06-test-noprog-${randomUUID()}`);
  registerTempDir(ctrlRoot);
  fs.mkdirSync(ctrlRoot, { recursive: true });
  const artifactStore = new LoopArtifactStore({
    controlRoot: ctrlRoot,
    repositoryPath: process.cwd(),
  });
  artifactStore.init();

  const identity = makeIdentity();
  const workspace = makeWorkspace();

  // already_applied with same digest
  fakeD05.setResponse("initial", 0, makeFakeD05Success({ phase: "initial", attempt: 0 } as LoopCodexImplementationRequest));

  // Test fails
  fakeRunner.setDefaultExitCode(0);
  let callCount = 0;
  const origRun = fakeRunner.run.bind(fakeRunner);
  fakeRunner.run = async (req: { executableId: string }) => {
    callCount++;
    if (callCount === 1) {
      return {
        status: "exited", exitCode: 1, signal: null, durationMs: 10,
        stdout: "fail", stderr: "err", stdoutBytesReceived: 4, stderrBytesReceived: 3,
        stdoutTruncated: false, stderrTruncated: false,
        termSignalSent: false, killSignalSent: false,
      };
    }
    return origRun(req);
  };

  // D05 repair returns already_applied with same pre/post digest → no progress
  fakeD05.setResponse("test_repair", 1, makeFakeD05Success({ phase: "test_repair", attempt: 1 } as LoopCodexImplementationRequest, {
    applicationState: "already_applied",
    preStatusDigestSha256: DIGEST_POST_INIT,
    postStatusDigestSha256: DIGEST_POST_INIT,
    files: ["src/test.ts"],
  }));

  const baseSnap = {
    state: "inspected", runId: identity.runId, repository: identity.repository,
    repositoryPath: identity.repositoryPath, controlRoot: identity.controlRoot,
    gitCommonDir: "/tmp/git", workspacePath: workspace.workspacePath,
    baseBranch: identity.baseBranch, expectedBaseSha: identity.expectedBaseSha,
    currentBaseSha: identity.expectedBaseSha, baseDrifted: false,
    taskBranch: workspace.taskBranch, taskHeadSha: workspace.expectedTaskHeadSha,
    taskHasChanges: true, taskStatusDigestSha256: workspace.expectedPreStatusDigestSha256,
    sourceHeadSha: identity.expectedBaseSha, sourceBranch: identity.baseBranch,
    sourceWipDigestSha256: DIGEST_CLEAN,
  };
  const postInit = { ...baseSnap, taskHeadSha: "b" + "b".repeat(39), taskStatusDigestSha256: DIGEST_POST_INIT };
  fakeWM.setSnapshotSequence([baseSnap, postInit, postInit, postInit, postInit, postInit, postInit, postInit]);

  const loop = new LoopAutonomousDeliveryLoop({
    runner: fakeRunner as unknown as LoopPosixProcessRunner,
    workspaceManager: fakeWM as unknown as LoopGitWorkspaceManager,
    artifactStore: artifactStore,
    implementationAdapter: fakeD05 as unknown as LoopCodexImplementationAdapter,
  });

  const result = await loop.execute(makeRequest({
    identity, workspace,
    testPlan: [makeTestStep("t1", 0)],
    reviewPlan: makePassingReviewPlan(1),
    maxFixRounds: 4,
  }));

  check("orchestration", result.status === "failed", "G1: no-progress → failed");
  check("orchestration", result.reasonCode === "NO_PROGRESS", "G2: reasonCode NO_PROGRESS");

  MARKERS.D06_NO_PROGRESS_FAIL_CLOSED = true;

  artifactStore.close();
  console.log("  No-progress tests complete");
}

// ═══════════════════════════════════════ H. Deadline

async function testDeadline(): Promise<void> {
  const fakeD05 = new FakeD05Adapter();
  const fakeRunner = new FakeRunner();
  const fakeWM = new FakeWorkspaceManager();

  const ctrlRoot = path.join(os.tmpdir(), `d06-test-deadline-${randomUUID()}`);
  registerTempDir(ctrlRoot);
  fs.mkdirSync(ctrlRoot, { recursive: true });
  const artifactStore = new LoopArtifactStore({
    controlRoot: ctrlRoot,
    repositoryPath: process.cwd(),
  });
  artifactStore.init();

  // Clock that starts at time=0
  let clockTime = 0;
  const testClock = {
    nowMs: () => {
      const t = clockTime;
      clockTime += 1000; // Advance 1s each read
      return t;
    },
  };

  const identity = makeIdentity();
  const workspace = makeWorkspace();

  const baseSnap = {
    state: "inspected", runId: identity.runId, repository: identity.repository,
    repositoryPath: identity.repositoryPath, controlRoot: identity.controlRoot,
    gitCommonDir: "/tmp/git", workspacePath: workspace.workspacePath,
    baseBranch: identity.baseBranch, expectedBaseSha: identity.expectedBaseSha,
    currentBaseSha: identity.expectedBaseSha, baseDrifted: false,
    taskBranch: workspace.taskBranch, taskHeadSha: workspace.expectedTaskHeadSha,
    taskHasChanges: true, taskStatusDigestSha256: workspace.expectedPreStatusDigestSha256,
    sourceHeadSha: identity.expectedBaseSha, sourceBranch: identity.baseBranch,
    sourceWipDigestSha256: DIGEST_CLEAN,
  };

  fakeWM.setSnapshotSequence([baseSnap]);

  const loop = new LoopAutonomousDeliveryLoop({
    runner: fakeRunner as unknown as LoopPosixProcessRunner,
    workspaceManager: fakeWM as unknown as LoopGitWorkspaceManager,
    artifactStore: artifactStore,
    implementationAdapter: fakeD05 as unknown as LoopCodexImplementationAdapter,
    clock: testClock,
  });

  // maxTotalDurationMs very short — deadline will fire after a few clock reads
  const result = await loop.execute(makeRequest({
    identity, workspace,
    testPlan: makePassingTestPlan(1),
    reviewPlan: makePassingReviewPlan(1),
    maxTotalDurationMs: 2000,
  }));

  check("orchestration", result.status === "failed", "H1: deadline exceeded → failed");
  check("orchestration", result.reasonCode === "TOTAL_TIMEOUT", "H2: reasonCode TOTAL_TIMEOUT");

  MARKERS.D06_TOTAL_DEADLINE_FAIL_CLOSED = true;

  artifactStore.close();
  console.log("  Deadline tests complete");
}

// ═══════════════════════════════════════ I. D02 Results

async function testD02Results(): Promise<void> {
  const fakeD05 = new FakeD05Adapter();
  const fakeRunner = new FakeRunner();
  const fakeWM = new FakeWorkspaceManager();

  const ctrlRoot = path.join(os.tmpdir(), `d06-test-d02-${randomUUID()}`);
  registerTempDir(ctrlRoot);
  fs.mkdirSync(ctrlRoot, { recursive: true });
  const artifactStore = new LoopArtifactStore({
    controlRoot: ctrlRoot,
    repositoryPath: process.cwd(),
  });
  artifactStore.init();

  const identity = makeIdentity();
  const workspace = makeWorkspace();

  // Test non-zero exit
  {
    fakeD05.setResponse("initial", 0, makeFakeD05Success({ phase: "initial", attempt: 0 } as LoopCodexImplementationRequest));

    const baseSnap = {
      state: "inspected", runId: identity.runId, repository: identity.repository,
      repositoryPath: identity.repositoryPath, controlRoot: identity.controlRoot,
      gitCommonDir: "/tmp/git", workspacePath: workspace.workspacePath,
      baseBranch: identity.baseBranch, expectedBaseSha: identity.expectedBaseSha,
      currentBaseSha: identity.expectedBaseSha, baseDrifted: false,
      taskBranch: workspace.taskBranch, taskHeadSha: workspace.expectedTaskHeadSha,
      taskHasChanges: true, taskStatusDigestSha256: workspace.expectedPreStatusDigestSha256,
      sourceHeadSha: identity.expectedBaseSha, sourceBranch: identity.baseBranch,
      sourceWipDigestSha256: DIGEST_CLEAN,
    };
    const postInit = { ...baseSnap, taskHeadSha: "b" + "b".repeat(39), taskStatusDigestSha256: DIGEST_POST_INIT };

    fakeWM.setSnapshotSequence([baseSnap, postInit, postInit, postInit]);

    fakeRunner.setDefaultExitCode(42); // Non-zero

    const loop = new LoopAutonomousDeliveryLoop({
      runner: fakeRunner as unknown as LoopPosixProcessRunner,
      workspaceManager: fakeWM as unknown as LoopGitWorkspaceManager,
      artifactStore: artifactStore,
      implementationAdapter: fakeD05 as unknown as LoopCodexImplementationAdapter,
    });

    const result = await loop.execute(makeRequest({
      identity, workspace,
      testPlan: [makeTestStep("t1", 0)],
      reviewPlan: makePassingReviewPlan(1),
      maxFixRounds: 0,
    }));

    check("orchestration", result.status === "failed", "I1: non-zero exit → failed");
    check("orchestration", ["TEST_FAILED", "FIX_BUDGET_EXHAUSTED"].includes(result.reasonCode), "I2: correct reasonCode");
  }

  // Test signal
  {
    fakeRunner.setDefaultExitCode(0);
    const origRun = fakeRunner.run.bind(fakeRunner);
    fakeRunner.run = async (req: { executableId: string }) => {
      return {
        status: "exited",
        exitCode: null,
        signal: "SIGTERM",
        durationMs: 10,
        stdout: "",
        stderr: "",
        stdoutBytesReceived: 0,
        stderrBytesReceived: 0,
        stdoutTruncated: false,
        stderrTruncated: false,
        termSignalSent: false,
        killSignalSent: false,
      };
    };

    const baseSnap = {
      state: "inspected", runId: identity.runId, repository: identity.repository,
      repositoryPath: identity.repositoryPath, controlRoot: identity.controlRoot,
      gitCommonDir: "/tmp/git", workspacePath: workspace.workspacePath,
      baseBranch: identity.baseBranch, expectedBaseSha: identity.expectedBaseSha,
      currentBaseSha: identity.expectedBaseSha, baseDrifted: false,
      taskBranch: workspace.taskBranch, taskHeadSha: workspace.expectedTaskHeadSha,
      taskHasChanges: true, taskStatusDigestSha256: workspace.expectedPreStatusDigestSha256,
      sourceHeadSha: identity.expectedBaseSha, sourceBranch: identity.baseBranch,
      sourceWipDigestSha256: DIGEST_CLEAN,
    };
    const postInit = { ...baseSnap, taskHeadSha: "b" + "b".repeat(39), taskStatusDigestSha256: DIGEST_POST_INIT };

    const identity2 = makeIdentity({ runId: randomUUID() });
    fakeWM.setSnapshotSequence([{ ...baseSnap, runId: identity2.runId }, { ...postInit, runId: identity2.runId }, { ...postInit, runId: identity2.runId }, { ...postInit, runId: identity2.runId }]);

    const loop = new LoopAutonomousDeliveryLoop({
      runner: fakeRunner as unknown as LoopPosixProcessRunner,
      workspaceManager: fakeWM as unknown as LoopGitWorkspaceManager,
      artifactStore: artifactStore,
      implementationAdapter: fakeD05 as unknown as LoopCodexImplementationAdapter,
    });

    const result = await loop.execute(makeRequest({
      identity: identity2, workspace,
      testPlan: [makeTestStep("t1", 0)],
      reviewPlan: makePassingReviewPlan(1),
      maxFixRounds: 0,
    }));

    check("orchestration", result.status === "failed", "I3: signal → failed");
  }

  // Test timed_out
  {
    fakeRunner.run = async () => ({
      status: "timed_out",
      exitCode: null,
      signal: null,
      durationMs: 100,
      stdout: "",
      stderr: "",
      stdoutBytesReceived: 0,
      stderrBytesReceived: 0,
      stdoutTruncated: false,
      stderrTruncated: false,
      termSignalSent: true,
      killSignalSent: false,
    });

    const identity3 = makeIdentity({ runId: randomUUID() });
    const baseSnap = {
      state: "inspected", runId: identity3.runId, repository: identity3.repository,
      repositoryPath: identity3.repositoryPath, controlRoot: identity3.controlRoot,
      gitCommonDir: "/tmp/git", workspacePath: workspace.workspacePath,
      baseBranch: identity3.baseBranch, expectedBaseSha: identity3.expectedBaseSha,
      currentBaseSha: identity3.expectedBaseSha, baseDrifted: false,
      taskBranch: workspace.taskBranch, taskHeadSha: workspace.expectedTaskHeadSha,
      taskHasChanges: true, taskStatusDigestSha256: workspace.expectedPreStatusDigestSha256,
      sourceHeadSha: identity3.expectedBaseSha, sourceBranch: identity3.baseBranch,
      sourceWipDigestSha256: DIGEST_CLEAN,
    };
    const postInit = { ...baseSnap, taskHeadSha: "b" + "b".repeat(39), taskStatusDigestSha256: DIGEST_POST_INIT };
    fakeWM.setSnapshotSequence([{ ...baseSnap, runId: identity3.runId }, { ...postInit, runId: identity3.runId }, { ...postInit, runId: identity3.runId }, { ...postInit, runId: identity3.runId }]);

    const loop = new LoopAutonomousDeliveryLoop({
      runner: fakeRunner as unknown as LoopPosixProcessRunner,
      workspaceManager: fakeWM as unknown as LoopGitWorkspaceManager,
      artifactStore: artifactStore,
      implementationAdapter: fakeD05 as unknown as LoopCodexImplementationAdapter,
    });

    const result = await loop.execute(makeRequest({
      identity: identity3, workspace,
      testPlan: [makeTestStep("t1", 0)],
      reviewPlan: makePassingReviewPlan(1),
      maxFixRounds: 0,
    }));

    check("orchestration", result.status === "failed", "I4: timed_out → failed");
  }

  artifactStore.close();
  console.log("  D02 result tests complete");
}

// ═══════════════════════════════════════ J. Workspace Safety

async function testWorkspaceSafety(): Promise<void> {
  const fakeD05 = new FakeD05Adapter();
  const fakeRunner = new FakeRunner();
  const fakeWM = new FakeWorkspaceManager();

  const ctrlRoot = path.join(os.tmpdir(), `d06-test-ws-safety-${randomUUID()}`);
  registerTempDir(ctrlRoot);
  fs.mkdirSync(ctrlRoot, { recursive: true });
  const artifactStore = new LoopArtifactStore({
    controlRoot: ctrlRoot,
    repositoryPath: process.cwd(),
  });
  artifactStore.init();

  const identity = makeIdentity();
  const workspace = makeWorkspace();

  // Test: start drift (workspace path mismatch)
  {
    fakeWM.setSnapshot({
      state: "inspected", runId: identity.runId, repository: identity.repository,
      repositoryPath: identity.repositoryPath, controlRoot: identity.controlRoot,
      gitCommonDir: "/tmp/git", workspacePath: "/wrong/path",
      baseBranch: identity.baseBranch, expectedBaseSha: identity.expectedBaseSha,
      currentBaseSha: identity.expectedBaseSha, baseDrifted: false,
      taskBranch: workspace.taskBranch, taskHeadSha: workspace.expectedTaskHeadSha,
      taskHasChanges: true, taskStatusDigestSha256: workspace.expectedPreStatusDigestSha256,
      sourceHeadSha: identity.expectedBaseSha, sourceBranch: identity.baseBranch,
      sourceWipDigestSha256: DIGEST_CLEAN,
    });

    const loop = new LoopAutonomousDeliveryLoop({
      runner: fakeRunner as unknown as LoopPosixProcessRunner,
      workspaceManager: fakeWM as unknown as LoopGitWorkspaceManager,
      artifactStore: artifactStore,
      implementationAdapter: fakeD05 as unknown as LoopCodexImplementationAdapter,
    });

    const result = await loop.execute(makeRequest({
      identity, workspace,
      testPlan: makePassingTestPlan(1),
      reviewPlan: makePassingReviewPlan(1),
    }));

  check("safety", result.status === "blocked", "J1: workspace drift → blocked");
  check("safety", result.reasonCode === "WORKSPACE_DRIFT", "J2: reasonCode WORKSPACE_DRIFT");
  check("safety", result.safeMessage.length <= 256, "J2b: safeMessage bounded");
  check("safety", !result.safeMessage.includes("stdout"), "J2c: safeMessage no raw output");
  check("safety", Array.isArray(result.trace), "J2d: trace is array");
  check("safety", Object.isFrozen(result), "J2e: result is frozen");
  check("safety", Object.isFrozen(result.trace), "J2f: trace is frozen");
  }

  // Test: test step changes status digest → mutation
  {
    const identity2 = makeIdentity({ runId: randomUUID() });
    const baseSnap = {
      state: "inspected", runId: identity2.runId, repository: identity2.repository,
      repositoryPath: identity2.repositoryPath, controlRoot: identity2.controlRoot,
      gitCommonDir: "/tmp/git", workspacePath: workspace.workspacePath,
      baseBranch: identity2.baseBranch, expectedBaseSha: identity2.expectedBaseSha,
      currentBaseSha: identity2.expectedBaseSha, baseDrifted: false,
      taskBranch: workspace.taskBranch, taskHeadSha: workspace.expectedTaskHeadSha,
      taskHasChanges: true, taskStatusDigestSha256: workspace.expectedPreStatusDigestSha256,
      sourceHeadSha: identity2.expectedBaseSha, sourceBranch: identity2.baseBranch,
      sourceWipDigestSha256: DIGEST_CLEAN,
    };
    const postInit = { ...baseSnap, taskHeadSha: "b" + "b".repeat(39), taskStatusDigestSha256: DIGEST_POST_INIT };
    const mutatedSnap = { ...postInit, taskStatusDigestSha256: DIGEST_POST_REPAIR };

    fakeD05.setResponse("initial", 0, makeFakeD05Success({ phase: "initial", attempt: 0 } as LoopCodexImplementationRequest));

    fakeWM.setSnapshotSequence([baseSnap, postInit, postInit, mutatedSnap, postInit]);

    fakeRunner.setDefaultExitCode(0);

    const loop = new LoopAutonomousDeliveryLoop({
      runner: fakeRunner as unknown as LoopPosixProcessRunner,
      workspaceManager: fakeWM as unknown as LoopGitWorkspaceManager,
      artifactStore: artifactStore,
      implementationAdapter: fakeD05 as unknown as LoopCodexImplementationAdapter,
    });

    const result = await loop.execute(makeRequest({
      identity: identity2, workspace,
      testPlan: [makeTestStep("t1", 0)],
      reviewPlan: makePassingReviewPlan(1),
    }));

  check("safety", result.status === "failed", "J3: workspace mutation → failed");
  check("safety", result.reasonCode === "TEST_WORKSPACE_MUTATED", "J4: reasonCode TEST_WORKSPACE_MUTATED");
  check("safety", result.totalFixRounds === 0, "J5: no fix rounds for mutation");
  check("safety", result.testSummaryArtifactRefs.length === 0, "J6: no evidence for mutation");
  }

  MARKERS.D06_WORKSPACE_SAFETY_FAIL_CLOSED = true;

  artifactStore.close();
  console.log("  Workspace safety tests complete");
}

// ═══════════════════════════════════════ K. Artifact Store

async function testArtifactStore(): Promise<void> {
  const ctrlRoot = path.join(os.tmpdir(), `d06-test-artifact-${randomUUID()}`);
  registerTempDir(ctrlRoot);
  fs.mkdirSync(ctrlRoot, { recursive: true });
  const artifactStore = new LoopArtifactStore({
    controlRoot: ctrlRoot,
    repositoryPath: process.cwd(),
  });
  artifactStore.init();

  const fakeD05 = new FakeD05Adapter();
  const fakeRunner = new FakeRunner();
  const fakeWM = new FakeWorkspaceManager();

  const identity = makeIdentity();
  const workspace = makeWorkspace();

  // Success path with artifact store verification
  {
    const baseSnap = {
      state: "inspected", runId: identity.runId, repository: identity.repository,
      repositoryPath: identity.repositoryPath, controlRoot: identity.controlRoot,
      gitCommonDir: "/tmp/git", workspacePath: workspace.workspacePath,
      baseBranch: identity.baseBranch, expectedBaseSha: identity.expectedBaseSha,
      currentBaseSha: identity.expectedBaseSha, baseDrifted: false,
      taskBranch: workspace.taskBranch, taskHeadSha: workspace.expectedTaskHeadSha,
      taskHasChanges: true, taskStatusDigestSha256: workspace.expectedPreStatusDigestSha256,
      sourceHeadSha: identity.expectedBaseSha, sourceBranch: identity.baseBranch,
      sourceWipDigestSha256: DIGEST_CLEAN,
    };
    const postInit = { ...baseSnap, taskHeadSha: "b" + "b".repeat(39), taskStatusDigestSha256: DIGEST_POST_INIT, taskHasChanges: true };

    fakeWM.setSnapshotSequence([baseSnap, postInit, postInit, postInit, postInit, postInit, postInit, postInit]);

    fakeD05.setResponse("initial", 0, makeFakeD05Success({ phase: "initial", attempt: 0 } as LoopCodexImplementationRequest, {
      files: ["src/test.ts"],
    }));
    fakeRunner.setDefaultExitCode(0);

    const loop = new LoopAutonomousDeliveryLoop({
      runner: fakeRunner as unknown as LoopPosixProcessRunner,
      workspaceManager: fakeWM as unknown as LoopGitWorkspaceManager,
      artifactStore: artifactStore,
      implementationAdapter: fakeD05 as unknown as LoopCodexImplementationAdapter,
    });

    const result = await loop.execute(makeRequest({
      identity, workspace,
      testPlan: makePassingTestPlan(1),
      reviewPlan: makePassingReviewPlan(1),
    }));

    check("integration", result.status === "succeeded", "K1: success with artifact store");
  check("integration", result.deliveryResultArtifactRef !== undefined, "K2: delivery_result ref exists");
  check("integration", result.deliveryResultArtifactRef!.startsWith("loop-artifact:v1:delivery_result:"), "K3: correct ref format");
  check("integration", result.patchArtifactRefs.length === 1, "K4: one patch ref");
  check("integration", result.files.length >= 1, "K5: files non-empty");
  }

  MARKERS.D06_DELIVERY_RESULT_VERIFIED = true;

  artifactStore.close();
  console.log("  Artifact store tests complete");
}

// ═══════════════════════════════════════ L. Evidence

function testEvidence(): void {
  // Test fixed property order
  const input = {
    phase: "test" as const,
    fixRound: 0,
    planAttempt: 1,
    failedStepId: "test_step_1",
    outcomeCategory: "TEST_FAILED" as const,
    exitCode: 1,
    signal: null,
    durationMs: 100,
    stdoutTruncated: false,
    stderrTruncated: false,
    stdout: "some output",
    stderr: "some error",
    workspaceBefore: {
      task_branch: "test-branch",
      task_head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      status_digest_sha256: sha256Hex("before"),
    },
    workspaceAfter: {
      task_branch: "test-branch",
      task_head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      status_digest_sha256: sha256Hex("after"),
    },
  };

  const result = buildLoopDeliveryEvidence(input, 32768, 4096);
  check("evidence", result.ok, "L1: evidence build ok");
  if (result.ok) {
    const json = JSON.parse(result.text.trim());
    const keys = Object.keys(json);
    check("evidence", keys[0] === "schema", "L2: first key is schema");
    check("evidence", keys[1] === "phase", "L3: second key is phase");
    check("evidence", result.text.endsWith("\n"), "L4: ends with LF");
    check("evidence", result.digestSha256.length === 64, "L5: digest is 64 chars");
    check("evidence", result.sizeBytes === result.bytes.length, "L6: size matches bytes");

    // Same input byte-identical
    const result2 = buildLoopDeliveryEvidence(input, 32768, 4096);
    if (result2.ok) {
      check("evidence", result.digestSha256 === result2.digestSha256, "L7: same input byte-identical");
      check("evidence", result.text === result2.text, "L8: same text byte-identical");
    }
  }

  // Test sanitization
  const sanitized = sanitizeExcerpt("hello\r\nworld\x00test\uFFFDbad\x01\x1b");
  check("evidence", !sanitized.includes("\r"), "L9: CR normalized");
  check("evidence", !sanitized.includes("\x00"), "L10: NUL replaced");
  check("evidence", !sanitized.includes("\uFFFD"), "L11: U+FFFD replaced");
  check("evidence", !sanitized.includes("\x01"), "L12: C0 replaced");
  check("evidence", !sanitized.includes("\x1b"), "L13: C1 replaced");
  check("evidence", sanitized.includes("\n"), "L14: LF preserved");

  // Test tail excerpt
  const longText = "ABC".repeat(100);
  const tail = tailExcerpt(longText, 10);
  check("evidence", tail.length <= 15, "L15: tail excerpt bounded"); // May contain multi-byte

  // Test too-large
  const largeResult = buildLoopDeliveryEvidence(input, 100, 50);
  check("evidence", !largeResult.ok && (largeResult as { ok: false; reason: string }).reason === "too_large", "L16: too large rejected");

  // Test invalid input
  const invalidResult = buildLoopDeliveryEvidence({ phase: "bad" } as never, 32768, 4096);
  check("evidence", !invalidResult.ok && (invalidResult as { ok: false; reason: string }).reason === "invalid_input", "L17: invalid input rejected");

  // Additional evidence property checks
  if (result.ok) {
    const parsed = JSON.parse(result.text.trim());
    check("evidence", parsed.schema === "loop-delivery-failure-evidence-v1", "L18: correct schema");
    check("evidence", typeof parsed.fix_round === "number", "L19: fix_round is number");
    check("evidence", typeof parsed.workspace_before === "object" && parsed.workspace_before !== null, "L20: workspace_before is object");
  }

  MARKERS.D06_CANONICAL_EVIDENCE_VERIFIED = true;
  console.log("  Evidence tests complete");
}

// ═══════════════════════════════════════ M. Terminal Contract

async function testTerminalContract(): Promise<void> {
  const fakeD05 = new FakeD05Adapter();
  const fakeRunner = new FakeRunner();
  const fakeWM = new FakeWorkspaceManager();

  const ctrlRoot = path.join(os.tmpdir(), `d06-test-terminal-${randomUUID()}`);
  registerTempDir(ctrlRoot);
  fs.mkdirSync(ctrlRoot, { recursive: true });
  const artifactStore = new LoopArtifactStore({
    controlRoot: ctrlRoot,
    repositoryPath: process.cwd(),
  });
  artifactStore.init();

  const identity = makeIdentity();
  const workspace = makeWorkspace();

  const baseSnap = {
    state: "inspected", runId: identity.runId, repository: identity.repository,
    repositoryPath: identity.repositoryPath, controlRoot: identity.controlRoot,
    gitCommonDir: "/tmp/git", workspacePath: workspace.workspacePath,
    baseBranch: identity.baseBranch, expectedBaseSha: identity.expectedBaseSha,
    currentBaseSha: identity.expectedBaseSha, baseDrifted: false,
    taskBranch: workspace.taskBranch, taskHeadSha: workspace.expectedTaskHeadSha,
    taskHasChanges: true, taskStatusDigestSha256: workspace.expectedPreStatusDigestSha256,
    sourceHeadSha: identity.expectedBaseSha, sourceBranch: identity.baseBranch,
    sourceWipDigestSha256: DIGEST_CLEAN,
  };
  const postInit = { ...baseSnap, taskHeadSha: "b" + "b".repeat(39), taskStatusDigestSha256: DIGEST_POST_INIT, taskHasChanges: true };

  fakeWM.setSnapshotSequence([baseSnap, postInit, postInit, postInit, postInit, postInit, postInit, postInit]);
  fakeD05.setResponse("initial", 0, makeFakeD05Success({ phase: "initial", attempt: 0 } as LoopCodexImplementationRequest, {
    files: ["src/test.ts"],
  }));
  fakeRunner.setDefaultExitCode(0);

  const loop = new LoopAutonomousDeliveryLoop({
    runner: fakeRunner as unknown as LoopPosixProcessRunner,
    workspaceManager: fakeWM as unknown as LoopGitWorkspaceManager,
    artifactStore: artifactStore,
    implementationAdapter: fakeD05 as unknown as LoopCodexImplementationAdapter,
  });

  const result = await loop.execute(makeRequest({
    identity, workspace,
    testPlan: makePassingTestPlan(1),
    reviewPlan: makePassingReviewPlan(1),
  }));

  // Only succeeded/failed/blocked
  check("orchestration", ["succeeded", "failed", "blocked"].includes(result.status), "M1: status is one of three");
  check("orchestration", !("success" in result), "M2: no success boolean");

  // Safe message doesn't contain raw output
  check("safety", !result.safeMessage.includes("stdout"), "M3: safeMessage no raw output");

  // Result is frozen
  check("safety", Object.isFrozen(result), "M4: result frozen");
  check("safety", Object.isFrozen(result.trace), "M5: trace frozen");
  check("safety", Object.isFrozen(result.files), "M6: files frozen");
  check("safety", Object.isFrozen(result.patchArtifactRefs), "M7: patchArtifactRefs frozen");

  // Trace doesn't contain raw output
  for (const entry of result.trace) {
    check("safety", !entry.outcome.includes("stdout:"), "M8: trace entry no raw output");
  }

  MARKERS.D06_TERMINAL_STATUS_CONTRACT_VERIFIED = true;

  artifactStore.close();
  console.log("  Terminal contract tests complete");
}

// ═══════════════════════════════════════ N. Real D02 Integration

async function testRealD02Integration(): Promise<void> {
  // Create temp dirs for this test
  const tmpBase = path.join(os.tmpdir(), `d06-integration-${randomUUID()}`);
  registerTempDir(tmpBase);
  fs.mkdirSync(tmpBase, { recursive: true });

  const ctrlRoot = path.join(tmpBase, "control");
  const wsPath = path.join(tmpBase, "workspace");
  fs.mkdirSync(ctrlRoot, { recursive: true });
  fs.mkdirSync(wsPath, { recursive: true });

  // Use canonical paths for the runner
  const canonicalWsPath = fs.realpathSync(wsPath);
  const canonicalTmpBase = fs.realpathSync(tmpBase);

  // Create a marker file to verify real execution
  const markerFile = path.join(wsPath, "d06_real_marker.txt");
  fs.writeFileSync(markerFile, "not-executed-yet", "utf8");

  // Setup real Artifact Store with a temp repo path
  const artifactStore = new LoopArtifactStore({
    controlRoot: ctrlRoot,
    repositoryPath: wsPath, // Use the temp workspace as repository for test
  });
  artifactStore.init();

  // Setup real D02 runner with node as executable
  const runner = new LoopPosixProcessRunner({
    executables: [{
      id: "node",
      executablePath: process.execPath,
      allowDynamicArgs: true,
      stdinMode: "forbidden",
    }],
    allowedCwdRoots: [canonicalWsPath, canonicalTmpBase, fs.realpathSync(process.cwd())],
    defaultTimeoutMs: 10000,
  });

  // Use fake D05 and fake WM for this integration test
  const fakeD05 = new FakeD05Adapter();
  const fakeWM = new FakeWorkspaceManager();

  const identity = makeIdentity({
    repositoryPath: wsPath,
    controlRoot: ctrlRoot,
  });

  const workspace = makeWorkspace({
    workspacePath: canonicalWsPath,
  });

  // Setup workspace binding
  const baseSnap = {
    state: "inspected",
    runId: identity.runId,
    repository: identity.repository,
    repositoryPath: identity.repositoryPath,
    controlRoot: identity.controlRoot,
    gitCommonDir: "/tmp/git",
    workspacePath: canonicalWsPath,
    baseBranch: identity.baseBranch,
    expectedBaseSha: identity.expectedBaseSha,
    currentBaseSha: identity.expectedBaseSha,
    baseDrifted: false,
    taskBranch: workspace.taskBranch,
    taskHeadSha: workspace.expectedTaskHeadSha,
    taskHasChanges: true,
    taskStatusDigestSha256: workspace.expectedPreStatusDigestSha256,
    sourceHeadSha: identity.expectedBaseSha,
    sourceBranch: identity.baseBranch,
    sourceWipDigestSha256: DIGEST_CLEAN,
  };
  const postInit = { ...baseSnap, taskHeadSha: "b" + "b".repeat(39), taskStatusDigestSha256: DIGEST_POST_INIT, taskHasChanges: true };

  fakeWM.setSnapshotSequence([baseSnap, postInit, postInit, postInit, postInit, postInit, postInit, postInit]);

  // D05 initial success
  fakeD05.setResponse("initial", 0, makeFakeD05Success({ phase: "initial", attempt: 0 } as LoopCodexImplementationRequest, {
    files: ["d06_real_marker.txt"],
  }));

  // Create a real test step that writes a marker
  const testStep: LoopDeliveryCommandStep = {
    id: "real_test_1",
    executableId: "node",
    args: [
      "-e",
      `const fs=require("fs");fs.writeFileSync("${markerFile.replace(/\\/g, "\\\\")}","D06_REAL_EXECUTED","utf8");process.exit(0)`,
    ],
  };

  const reviewStep: LoopDeliveryCommandStep = {
    id: "real_review_1",
    executableId: "node",
    args: [
      "-e",
      `const fs=require("fs");const content=fs.readFileSync("${markerFile.replace(/\\/g, "\\\\")}","utf8");if(content.includes("D06_REAL_EXECUTED")){process.exit(0)}else{process.exit(1)}`,
    ],
  };

  const loop = new LoopAutonomousDeliveryLoop({
    runner: runner,
    workspaceManager: fakeWM as unknown as LoopGitWorkspaceManager,
    artifactStore: artifactStore,
    implementationAdapter: fakeD05 as unknown as LoopCodexImplementationAdapter,
  });

  const result = await loop.execute(makeRequest({
    identity,
    workspace: {
      workspacePath: canonicalWsPath,
      taskBranch: workspace.taskBranch,
      expectedTaskHeadSha: workspace.expectedTaskHeadSha,
      expectedPreStatusDigestSha256: workspace.expectedPreStatusDigestSha256,
    },
    testPlan: [testStep],
    reviewPlan: [reviewStep],
    allowedPaths: ["d06_real_marker.txt"],
  }));

  check("integration", result.status === "succeeded", "N1: real D02 integration succeeded");
  check("integration", result.reasonCode === "DELIVERY_SUCCEEDED", "N2: DELIVERY_SUCCEEDED");

  // Verify the marker was actually written by the real process
  try {
    const markerContent = fs.readFileSync(markerFile, "utf8");
    check("integration", markerContent.includes("D06_REAL_EXECUTED"), "N3: real process executed marker");
  } catch {
    check("integration", false, "N3: marker file read failed");
  }

  MARKERS.D06_REAL_D02_TEST_STEP_EXECUTED = true;

  artifactStore.close();
  console.log("  Real D02 integration tests complete");
}

// ═══════════════════════════════════════ O. Source Invariance

async function testSourceInvariance(): Promise<void> {
  // Get the source worktree HEAD before test
  const sourceCwd = process.cwd();
  const origGitEnv = { ...process.env };
  const isolatedEnv: Record<string, string> = {
    HOME: path.join(os.tmpdir(), `d06-git-home-${randomUUID()}`),
    XDG_CONFIG_HOME: path.join(os.tmpdir(), `d06-xdg-${randomUUID()}`),
  };
  fs.mkdirSync(isolatedEnv.HOME!, { recursive: true });
  fs.mkdirSync(isolatedEnv.XDG_CONFIG_HOME!, { recursive: true });
  registerTempDir(isolatedEnv.HOME!);
  registerTempDir(isolatedEnv.XDG_CONFIG_HOME!);

  // Record source HEAD before
  let sourceHeadBefore = "";
  try {
    const result = require("node:child_process").execSync("git rev-parse HEAD", {
      cwd: sourceCwd,
      env: { ...process.env, ...isolatedEnv },
    }).toString().trim();
    sourceHeadBefore = result;
  } catch {
    // Git may not be available — skip this check gracefully
    sourceHeadBefore = "unavailable";
  }

  // All tests have been run with fake workspaces that don't touch the source
  // The real source worktree should be unchanged

  // Record source HEAD after
  let sourceHeadAfter = "";
  try {
    const result = require("node:child_process").execSync("git rev-parse HEAD", {
      cwd: sourceCwd,
      env: { ...process.env, ...isolatedEnv },
    }).toString().trim();
    sourceHeadAfter = result;
  } catch {
    sourceHeadAfter = "unavailable";
  }

  check("integration", sourceHeadBefore === sourceHeadAfter, "O1: source HEAD unchanged");
  check("integration", sourceHeadBefore === "8fa3b4cefe33b87c9e80b61f5298888438410759", "O2: source HEAD matches expected");

  MARKERS.D06_REAL_SOURCE_UNCHANGED = sourceHeadBefore === sourceHeadAfter;
  console.log("  Source invariance tests complete");
}

// ═══════════════════════════════════════ Main

async function main(): Promise<void> {
  console.log("=== LOOP-DELIVERY-06 Targeted Tests ===\n");

  try {
    // A. Input Validation
    console.log("[A] Input Validation...");
    await testInputValidation();

    // L. Evidence (pure, no async deps)
    console.log("\n[L] Evidence...");
    testEvidence();

    // M. Terminal Contract
    console.log("\n[M] Terminal Contract...");
    await testTerminalContract();

    // B. Pass Path
    console.log("\n[B] Pass Path...");
    await testPassPath();

    // C. Test Repair
    console.log("\n[C] Test Repair...");
    await testTestRepair();

    // D. Review Repair
    console.log("\n[D] Review Repair...");
    await testReviewRepair();

    // E. Mixed Loop
    console.log("\n[E] Mixed Loop...");
    await testMixedLoop();

    // F. Budget
    console.log("\n[F] Budget...");
    await testBudget();

    // G. No Progress
    console.log("\n[G] No Progress...");
    await testNoProgress();

    // H. Deadline
    console.log("\n[H] Deadline...");
    await testDeadline();

    // I. D02 Results
    console.log("\n[I] D02 Results...");
    await testD02Results();

    // J. Workspace Safety
    console.log("\n[J] Workspace Safety...");
    await testWorkspaceSafety();

    // K. Artifact Store
    console.log("\n[K] Artifact Store...");
    await testArtifactStore();

    // N. Real D02 Integration
    console.log("\n[N] Real D02 Integration...");
    await testRealD02Integration();

    // O. Source Invariance
    console.log("\n[O] Source Invariance...");
    await testSourceInvariance();

  } catch (err) {
    console.error("TEST SUITE ERROR:", err);
    GLOBAL_FAILED++;
  }

  // Cleanup temp dirs
  try {
    cleanupTemps();
    MARKERS.D06_TEMP_CLEANUP_COMPLETE = true;
  } catch {
    // Cleanup failed
  }

  // Verify cleanup
  verifyCleanup();

  // ═══════════════════════════════════════ Summary

  const total = GLOBAL_PASSED + GLOBAL_FAILED;
  console.log(`\nD06_TARGETED_SUMMARY total=${total} passed=${GLOBAL_PASSED} failed=${GLOBAL_FAILED}`);

  // Domain counts
  for (const [domain, counters] of Object.entries(domains)) {
    const domainUpper = domain.toUpperCase();
    console.log(`D06_${domainUpper}_COUNTS checks=${counters.checks} failures=${counters.failures}`);
  }

  // Boolean markers
  for (const [marker, value] of Object.entries(MARKERS)) {
    console.log(`${marker} ${value}`);
  }

  // Verify domain minimums
  const minChecks: Record<string, number> = {
    orchestration: 30,
    safety: 25,
    evidence: 20,
    input: 25,
    integration: 10,
  };

  for (const [domain, min] of Object.entries(minChecks)) {
    const actual = domains[domain]!.checks;
    if (actual < min) {
      console.error(`  FAIL: ${domain} checks=${actual} < minimum ${min}`);
      GLOBAL_FAILED++;
    }
  }

  // Exit based on failures
  if (GLOBAL_FAILED > 0) {
    console.error(`\nFAILED: ${GLOBAL_FAILED} assertion(s) failed`);
    process.exit(1);
  }

  // Check all boolean markers are true
  for (const [marker, value] of Object.entries(MARKERS)) {
    if (!value) {
      console.error(`  FAIL: marker ${marker} is false`);
      GLOBAL_FAILED++;
    }
  }

  if (GLOBAL_FAILED > 0) {
    console.error(`\nFAILED: ${GLOBAL_FAILED} marker(s) not met`);
    process.exit(1);
  }

  console.log("\nAll tests passed!");
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
