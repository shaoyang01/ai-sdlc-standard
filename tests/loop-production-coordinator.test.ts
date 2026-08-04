// LOOP-DELIVERY-09-B — Production Coordinator Targeted Tests
// ============================================================
// Tests for LoopProductionCoordinator (fixed orchestration artifact ref →
// D08 parsers → D03 prepare → D06 execute + read-back → injected Shared
// Documentation Governance Tail → A1 build/store/read-back/parse → D03
// post-Tail inspect → D07 governed publish + read-back → D09 succeeded).
//
// Uses a REAL D08 orchestrator (fake agent/reviewer) and a real D01 temp
// store to produce the fixed orchestration + executor input artifacts; every
// downstream stage is an injectable fake that records calls. No real agent,
// no network, no shell, no git side effects. Real Source HEAD/status/diff/
// staging invariance is verified before and after the suite; all temp dirs
// are cleaned. All markers are driven by real assertions — never hard-coded.

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { LoopRequirementDesignOrchestrator } from "../core/loop-requirement-design-orchestrator";
import type { LoopDirectExecutorInput } from "../core/loop-requirement-design-orchestrator";
import { LoopArtifactStore } from "../core/loop-artifact-store";
import type { LoopArtifactKind, LoopStoredArtifact } from "../core/loop-artifact-store";
import { LoopGitWorkspaceError } from "../core/loop-git-workspace";
import type { LoopGitWorkspaceSnapshot } from "../core/loop-git-workspace";
import type {
  LoopAutonomousDeliveryResult,
  LoopAutonomousDeliveryRequest,
  LoopDeliveryResultWorkspace,
} from "../core/loop-autonomous-delivery-loop";
import type {
  LoopDeliveryPublishRequest,
  LoopDeliveryPublishResult,
} from "../core/loop-delivery-publisher";
import {
  buildLoopGovernanceTailResult,
  parseLoopGovernanceTailResultBytes,
  type LoopGovernanceTailResult,
} from "../core/loop-governance-tail-result";
import {
  LoopProductionCoordinator,
  parseLoopOrchestrationResultBytes,
  parseLoopDirectExecutorInputBytes,
  parseLoopDeliveryResultBytes,
  parseLoopDeliveryPublishResultBytes,
  type LoopGovernanceTailCompletionPackage,
  type LoopProductionCoordinatorOptions,
  type LoopProductionCoordinatorRequest,
  type LoopProductionCoordinatorResult,
  type LoopSharedGovernanceTailInput,
  type LoopSharedGovernanceTailResult,
} from "../core/loop-production-coordinator";

// ═══════════════════════════════════════ Harness

let failures = 0;
let checks = 0;
let currentSection = "";
const sectionFailures: Record<string, number> = {};
const markers: Record<string, boolean> = {};

function startSection(name: string): void {
  currentSection = name;
  sectionFailures[name] = 0;
}

function chk(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    sectionFailures[currentSection] = (sectionFailures[currentSection] ?? 0) + 1;
    console.error(`FAIL [${currentSection}] ${msg}`);
  }
}

function mark(name: string): void {
  markers[name] = (sectionFailures[currentSection] ?? 0) === 0;
  if (!markers[name]) {
    console.error(`  marker ${name} NOT set (${sectionFailures[currentSection]} failure(s) in ${currentSection})`);
  }
}

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (a !== null && typeof a === "object" && b !== null && typeof b === "object") {
    const ka = Object.keys(a as Record<string, unknown>);
    const kb = Object.keys(b as Record<string, unknown>);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!(k in (b as Record<string, unknown>))) return false;
      if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
    }
    return true;
  }
  return false;
}

// ── real Source invariance ──

let realSourceHead = "";
let realSourceStatusBytes = "";
let realSourceDiffDigest = "";
let realSourceStagedDigest = "";

function recordRealSource(): void {
  const repoRoot = path.resolve(__dirname, "..");
  realSourceHead = require("node:child_process").execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  realSourceStatusBytes = require("node:child_process").execSync("git status --porcelain=v1 -z --untracked-files=all", { cwd: repoRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  realSourceDiffDigest = sha256Hex(require("node:child_process").execSync("git diff --no-renames", { cwd: repoRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }));
  realSourceStagedDigest = sha256Hex(require("node:child_process").execSync("git diff --cached --no-renames", { cwd: repoRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }));
}

function verifyRealSourceUnchanged(): void {
  currentSection = "source_invariance";
  const repoRoot = path.resolve(__dirname, "..");
  const headOk = require("node:child_process").execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim() === realSourceHead;
  chk(headOk, "real source HEAD unchanged");
  const statusOk = require("node:child_process").execSync("git status --porcelain=v1 -z --untracked-files=all", { cwd: repoRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }) === realSourceStatusBytes;
  chk(statusOk, "real source status unchanged");
  const diffOk = sha256Hex(require("node:child_process").execSync("git diff --no-renames", { cwd: repoRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 })) === realSourceDiffDigest;
  chk(diffOk, "real source diff unchanged");
  const stagedOk = sha256Hex(require("node:child_process").execSync("git diff --cached --no-renames", { cwd: repoRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 })) === realSourceStagedDigest;
  chk(stagedOk, "real source staged unchanged");
  markers.D09_B_REAL_SOURCE_UNCHANGED = headOk && statusOk && diffOk && stagedOk;
  console.log("D09_B_REAL_SOURCE_UNCHANGED", markers.D09_B_REAL_SOURCE_UNCHANGED);
}

// ── temp cleanup ──

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function cleanupAll(): void {
  currentSection = "cleanup";
  let allClean = true;
  for (const d of tempDirs.reverse()) {
    try {
      if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
      if (fs.existsSync(d)) allClean = false;
    } catch {
      allClean = false;
    }
  }
  chk(allClean, "all temp dirs cleaned");
  markers.D09_B_TEMP_CLEANUP_COMPLETE = allClean;
  console.log("D09_B_TEMP_CLEANUP_COMPLETE", allClean);
}

// ═══════════════════════════════════════ Fixture constants

const TS = "2026-08-04T00:00:00.000Z";
const DELIVERY_FILES = ["core/d09b.ts", "tests/d09b.test.ts"];
const A1_FILES = [
  "03-实现记录/implementation-record.md",
  "04-代码审核/code-review.md",
  "05-测试验收/acceptance.md",
  "05-测试验收/tail-gate.md",
  "core/d09b.ts",
  "docs/entry-coverage-evidence.md",
  "docs/manifest.md",
  "docs/regate-evidence.md",
  "docs/sync-evidence.md",
  "tests/d09b.test.ts",
];
const HEAD0 = "a".repeat(40);
const HEAD1 = "b".repeat(40);
const COMMIT_SHA = "c".repeat(40);
const REMOTE_SHA = "d".repeat(40);
const SD0 = "0".repeat(64);
const SD1 = "1".repeat(64);
const SHA2 = "2".repeat(64);
const SHA3 = "3".repeat(64);

let MAIN_TEMP = "";
let REPO_PATH = "";
let CONTROL_PATH = "";
let WORKSPACE_PATH = "";
let IDENTITY: any;
let ORCH_REF = "";
let EXEC_REF = "";
let ORCH_BYTES: Buffer = Buffer.alloc(0);
let EXEC_BYTES: Buffer = Buffer.alloc(0);

function makeIdentity(overrides: Record<string, unknown> = {}): any {
  return {
    runId: "run-d09b",
    requirementId: "req-d09b",
    repository: "shaoyang01/ai-sdlc-standard",
    repositoryPath: REPO_PATH || "/tmp/d09b-repo",
    baseBranch: "feature/loop-runtime-v1",
    expectedBaseSha: HEAD0,
    taskBranch: "codex/d09b-task",
    controlRoot: CONTROL_PATH || "/tmp/d09b-control",
    createdAt: TS,
    ...overrides,
  };
}

// ── real D08 fixtures (fake agent/reviewer, real store) ──

function makeSummary(): Record<string, unknown> {
  return {
    schema: "loop_requirement_summary_v1",
    title: "D09-B coordinator coverage",
    objective: "Add production coordinator coverage.",
    acceptanceCriteria: ["Run the governed chain", "Verify all bindings"],
    constraints: [],
    ambiguities: [],
    productChoices: [],
    missingPermissions: [],
    riskFlags: [],
    repositoryScope: "single_repository",
    complexity: "direct",
    requestedSideEffects: ["source_change", "commit", "push", "pull_request"],
  };
}

function makeStep(o: Record<string, unknown> = {}): any {
  return {
    id: "d09b-step",
    executableId: "tsx",
    args: ["tests/loop-d09b.test.ts"],
    timeoutMs: 120000,
    maxStdoutBytes: 1048576,
    maxStderrBytes: 262144,
    ...o,
  };
}

function makeDesign(): Record<string, unknown> {
  return {
    schema: "loop_technical_design_v1",
    approach: "Implement the governed production coordinator.",
    components: ["core/loop-production-coordinator.ts"],
    interfaces: ["LoopProductionCoordinator.execute"],
    dataChanges: [],
    allowedPaths: ["core", "tests", "docs"],
    implementationConstraints: [],
    testPlan: [makeStep()],
    reviewPlan: [makeStep({ id: "d09b-review" })],
    riskControls: [],
    commitSubject: "feat: add d09b coordinator",
    prTitle: "feat: add d09b coordinator",
  };
}

function makeReview(): Record<string, unknown> {
  return { schema: "loop_solution_review_v1", status: "PASS", findings: [], directPathEligible: true };
}

async function runRealD08(): Promise<void> {
  const tempRoot = makeTempDir("d09b-main-");
  MAIN_TEMP = tempRoot;
  REPO_PATH = path.join(tempRoot, "repo");
  CONTROL_PATH = path.join(tempRoot, "control");
  WORKSPACE_PATH = path.join(tempRoot, "workspace");
  fs.mkdirSync(REPO_PATH, { recursive: true });
  IDENTITY = makeIdentity();
  const store = new LoopArtifactStore({ controlRoot: CONTROL_PATH, repositoryPath: REPO_PATH });
  store.init();
  const orch = new LoopRequirementDesignOrchestrator({
    agent: { normalize: () => makeSummary(), design: () => makeDesign() },
    reviewer: { review: () => makeReview() },
    artifactStore: store,
  });
  const result = orch.execute({
    identity: IDENTITY,
    rawRequirement: "Add the governed production coordinator.\nKeep all contracts intact.",
    pathPolicy: { allowedRoots: ["core", "tests", "docs"], deniedPaths: [] },
    commandPolicy: { allowedExecutableIds: ["tsx", "node", "npm"] },
    limits: { maxDesignRounds: 2, maxTotalDurationMs: 120000, maxRequirementBytes: 65536, maxAgentOutputBytes: 131072, maxFixRounds: 4, executorMaxTotalDurationMs: 1800000 },
  });
  if (result.route !== "direct" || result.reasonCode !== "DIRECT_READY") {
    throw new Error("D08 fixture did not produce DIRECT_READY: " + result.route + " / " + result.reasonCode);
  }
  ORCH_REF = result.orchestrationResultArtifactRef!;
  EXEC_REF = result.executorInputArtifactRef!;
  ORCH_BYTES = Buffer.from(store.read(ORCH_REF));
  EXEC_BYTES = Buffer.from(store.read(EXEC_REF));
}

// ── canonical artifact writers ──

function writeDeliveryBytes(overrides: Record<string, unknown> = {}): Buffer {
  const obj: Record<string, unknown> = Object.create(null);
  obj.schema = "loop-delivery-result-v1";
  obj.status = "succeeded";
  obj.reason_code = "DELIVERY_SUCCEEDED";
  obj.cause_code = null;
  obj.total_fix_rounds = 0;
  obj.test_attempts = 1;
  obj.review_attempts = 1;
  obj.patch_artifact_refs = [];
  obj.test_summary_artifact_refs = [];
  obj.review_summary_artifact_refs = [];
  obj.files = [...DELIVERY_FILES];
  obj.final_workspace = {
    workspace_path: WORKSPACE_PATH,
    task_branch: IDENTITY.taskBranch,
    task_head_sha: HEAD1,
    status_digest_sha256: SD1,
    task_has_changes: true,
  };
  obj.elapsed_ms = 500;
  obj.trace = [
    {
      sequence: 1, kind: "info", phase: "initial", fix_round: 0, attempt: 0,
      step_id: null, outcome: "ok", artifact_ref: null, patch_artifact_ref: null,
      patch_digest_sha256: null, workspace_status_digest_sha256: SD1, elapsed_ms: 250,
    },
    {
      sequence: 2, kind: "terminal", phase: "initial", fix_round: 0, attempt: 0,
      step_id: null, outcome: "succeeded", artifact_ref: null, patch_artifact_ref: null,
      patch_digest_sha256: null, workspace_status_digest_sha256: SD1, elapsed_ms: 500,
    },
  ];
  return Buffer.from(JSON.stringify({ ...obj, ...overrides }) + "\n", "utf8");
}

function writePublishBytes(overrides: Record<string, unknown> = {}): Buffer {
  const obj: Record<string, unknown> = Object.create(null);
  obj.schema = "loop-governed-publish-result-v1";
  obj.status = "succeeded";
  obj.reason_code = "PUBLISH_SUCCEEDED";
  obj.cause_code = null;
  obj.recovery_stage = "completed";
  obj.orchestration_result_artifact_ref = ORCH_REF;
  obj.executor_input_artifact_ref = EXEC_REF;
  obj.delivery_result_artifact_ref = DELIVERY_REF;
  obj.governance_tail_result_artifact_ref = A1_REF;
  obj.publish_intent_artifact_ref = null;
  obj.precommit_head_sha = HEAD1;
  obj.commit_sha = COMMIT_SHA;
  obj.remote_branch_sha = REMOTE_SHA;
  obj.pr_number = 42;
  obj.pr_url = "https://github.com/shaoyang01/ai-sdlc-standard/pull/42";
  obj.implementation_files = [...DELIVERY_FILES];
  obj.files = [...A1_FILES];
  obj.commit_created = true;
  obj.commit_recovered = false;
  obj.push_created = true;
  obj.push_recovered = false;
  obj.pr_created = true;
  obj.pr_recovered = false;
  obj.pr_body_sha256 = SHA3;
  obj.elapsed_ms = 800;
  obj.trace = [
    {
      sequence: 1, stage: "delivery", outcome: "succeeded", artifact_ref: null,
      commit_sha: null, remote_branch_sha: null, pr_number: null, elapsed_ms: 100,
    },
    {
      sequence: 2, stage: "terminal", outcome: "succeeded", artifact_ref: null,
      commit_sha: COMMIT_SHA, remote_branch_sha: REMOTE_SHA, pr_number: 42, elapsed_ms: 800,
    },
  ];
  return Buffer.from(JSON.stringify({ ...obj, ...overrides }) + "\n", "utf8");
}

// The delivery/publish artifact refs are computed from the canonical bytes
// written by the fakes at call time; placeholders are resolved there.
let DELIVERY_REF = "";
let A1_REF = "";

function refOf(kind: string, bytes: Buffer): string {
  return `loop-artifact:v1:${kind}:sha256:${sha256Hex(bytes)}`;
}

// ── Fake Artifact Store (digest-checking read like the real D01 store) ──

class FakeArtifactStore {
  private store = new Map<string, Buffer>();
  reads: Array<{ ref: string; expectedDigest?: string }> = [];
  puts: Array<{ kind: string; bytes: Buffer }> = [];
  failRead = false;
  failPut = false;

  read(artifactRef: string, expectedDigest?: string): Buffer {
    this.reads.push({ ref: artifactRef, expectedDigest });
    if (this.failRead) throw new Error("ARTIFACT_IO_FAILURE");
    const m = /^loop-artifact:v1:([a-z_]+):sha256:([0-9a-f]{64})$/.exec(artifactRef);
    const refDigest = m === null ? "" : m[2]!;
    if (expectedDigest !== undefined && expectedDigest !== refDigest) {
      throw new Error("ARTIFACT_DIGEST_MISMATCH");
    }
    const buf = this.store.get(artifactRef);
    if (!buf) throw new Error("ARTIFACT_NOT_FOUND");
    return Buffer.from(buf);
  }

  put(kind: string, content: string | Uint8Array): LoopStoredArtifact {
    const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
    if (this.failPut) throw new Error("ARTIFACT_IO_FAILURE");
    const digest = sha256Hex(bytes);
    const ref = `loop-artifact:v1:${kind}:sha256:${digest}`;
    this.store.set(ref, Buffer.from(bytes));
    this.puts.push({ kind, bytes: Buffer.from(bytes) });
    return Object.freeze({ artifactRef: ref, kind: kind as LoopArtifactKind, digest, sizeBytes: bytes.length });
  }

  hasRef(ref: string): boolean {
    return this.store.has(ref);
  }

  _inject(ref: string, bytes: Buffer, kind: string): void {
    this.store.set(ref, Buffer.from(bytes));
  }
}

// ── Fake Workspace Manager ──

function makeSnapshot(overrides: Record<string, unknown> = {}): LoopGitWorkspaceSnapshot {
  return Object.freeze({
    state: "created" as const,
    runId: IDENTITY.runId,
    repository: IDENTITY.repository,
    repositoryPath: IDENTITY.repositoryPath,
    controlRoot: IDENTITY.controlRoot,
    gitCommonDir: path.join(IDENTITY.repositoryPath, ".git"),
    workspacePath: WORKSPACE_PATH,
    baseBranch: IDENTITY.baseBranch,
    expectedBaseSha: IDENTITY.expectedBaseSha,
    currentBaseSha: IDENTITY.expectedBaseSha,
    baseDrifted: false,
    taskBranch: IDENTITY.taskBranch,
    taskHeadSha: HEAD0,
    taskHasChanges: false,
    taskStatusDigestSha256: SD0,
    sourceHeadSha: IDENTITY.expectedBaseSha,
    sourceBranch: IDENTITY.baseBranch,
    sourceWipDigestSha256: "e".repeat(64),
    ...overrides,
  });
}

function makePostTailSnapshot(overrides: Record<string, unknown> = {}): LoopGitWorkspaceSnapshot {
  return makeSnapshot({
    state: "inspected" as const,
    taskHeadSha: HEAD1,
    taskHasChanges: true,
    taskStatusDigestSha256: SD1,
    ...overrides,
  });
}

class FakeWorkspaceManager {
  prepareCalls = 0;
  inspectCalls = 0;
  prepareError: Error | null = null;
  inspectError: Error | null = null;
  prepareSnapshot: LoopGitWorkspaceSnapshot = makeSnapshot();
  inspectSnapshot: LoopGitWorkspaceSnapshot = makePostTailSnapshot();

  async prepare(_identity: any): Promise<LoopGitWorkspaceSnapshot> {
    this.prepareCalls++;
    if (this.prepareError) throw this.prepareError;
    return this.prepareSnapshot;
  }

  async inspect(_identity: any): Promise<LoopGitWorkspaceSnapshot> {
    this.inspectCalls++;
    if (this.inspectError) throw this.inspectError;
    return this.inspectSnapshot;
  }
}

function makeWorkspaceError(code: string): LoopGitWorkspaceError {
  return new LoopGitWorkspaceError(code as any, code.toLowerCase().replace(/_/g, " "));
}

// ── Fake Delivery Loop ──

function makeDeliveryResult(overrides: Record<string, unknown> = {}): LoopAutonomousDeliveryResult {
  const obj: Record<string, unknown> = {
    status: "succeeded",
    reasonCode: "DELIVERY_SUCCEEDED",
    safeMessage: "delivery succeeded",
    causeCode: undefined,
    totalFixRounds: 0,
    testAttempts: 1,
    reviewAttempts: 1,
    patchArtifactRefs: [],
    testSummaryArtifactRefs: [],
    reviewSummaryArtifactRefs: [],
    files: [...DELIVERY_FILES],
    finalWorkspace: {
      workspacePath: WORKSPACE_PATH,
      taskBranch: IDENTITY.taskBranch,
      taskHeadSha: HEAD1,
      statusDigestSha256: SD1,
      taskHasChanges: true,
    } as LoopDeliveryResultWorkspace,
    elapsedMs: 500,
    trace: [
      { sequence: 1, kind: "info", phase: "initial", fixRound: 0, attempt: 0, stepId: null, outcome: "ok", artifactRef: null, patchArtifactRef: null, patchDigestSha256: null, workspaceStatusDigestSha256: SD1, elapsedMs: 250 },
      { sequence: 2, kind: "terminal", phase: "initial", fixRound: 0, attempt: 0, stepId: null, outcome: "succeeded", artifactRef: null, patchArtifactRef: null, patchDigestSha256: null, workspaceStatusDigestSha256: SD1, elapsedMs: 500 },
    ],
    ...overrides,
  };
  if (obj.deliveryResultArtifactRef === undefined) {
    obj.deliveryResultArtifactRef = undefined;
  }
  return obj as unknown as LoopAutonomousDeliveryResult;
}

class FakeDeliveryLoop {
  calls: LoopAutonomousDeliveryRequest[] = [];
  store: FakeArtifactStore;
  result: LoopAutonomousDeliveryResult;
  artifactBytes: Buffer | null = null; // override bytes (ref computed from them)
  throwOnExecute = false;
  putArtifact = true;

  constructor(store: FakeArtifactStore) {
    this.store = store;
    this.result = makeDeliveryResult();
  }

  async execute(request: LoopAutonomousDeliveryRequest): Promise<LoopAutonomousDeliveryResult> {
    this.calls.push(request);
    if (this.throwOnExecute) throw new Error("delivery loop exploded");
    if (this.putArtifact) {
      const bytes = this.artifactBytes ?? writeDeliveryBytes();
      const ref = refOf("delivery_result", bytes);
      this.store._inject(ref, bytes, "delivery_result");
      return { ...this.result, deliveryResultArtifactRef: ref };
    }
    return this.result;
  }
}

// ── Fake Publisher ──

function makePublishResult(overrides: Record<string, unknown> = {}): LoopDeliveryPublishResult {
  const obj: Record<string, unknown> = {
    status: "succeeded",
    reasonCode: "PUBLISH_SUCCEEDED",
    safeMessage: "publish succeeded",
    causeCode: undefined,
    recoveryStage: "completed",
    deliveryResultArtifactRef: DELIVERY_REF,
    publishIntentArtifactRef: "loop-artifact:v1:workspace_metadata:sha256:" + "f".repeat(64),
    precommitHeadSha: HEAD1,
    commitSha: COMMIT_SHA,
    remoteBranchSha: REMOTE_SHA,
    prNumber: 42,
    prUrl: "https://github.com/shaoyang01/ai-sdlc-standard/pull/42",
    files: [...A1_FILES],
    commitCreated: true,
    commitRecovered: false,
    pushCreated: true,
    pushRecovered: false,
    prCreated: true,
    prRecovered: false,
    prBodySha256: SHA3,
    elapsedMs: 800,
    trace: [
      { sequence: 1, stage: "delivery", outcome: "succeeded", artifactRef: null, commitSha: null, remoteBranchSha: null, prNumber: null, elapsedMs: 100 },
      { sequence: 2, stage: "terminal", outcome: "succeeded", artifactRef: null, commitSha: COMMIT_SHA, remoteBranchSha: REMOTE_SHA, prNumber: 42, elapsedMs: 800 },
    ],
    ...overrides,
  };
  return obj as unknown as LoopDeliveryPublishResult;
}

class FakePublisher {
  calls: Array<{ request: LoopDeliveryPublishRequest; input: unknown }> = [];
  store: FakeArtifactStore;
  result: LoopDeliveryPublishResult;
  publishBytes: Buffer | null = null;
  throwOnExecute = false;
  putResult = true;
  omitGovernanceRef = false;
  wrongGovernanceRef = false;
  omitPublishResultRef = false;
  commitShaMismatch = false;

  constructor(store: FakeArtifactStore) {
    this.store = store;
    this.result = makePublishResult();
  }

  async execute(request: LoopDeliveryPublishRequest): Promise<LoopDeliveryPublishResult> {
    this.calls.push({ request, input: null });
    if (this.throwOnExecute) throw new Error("publisher exploded");
    const governanceRef = this.omitGovernanceRef
      ? null
      : (this.wrongGovernanceRef
        ? "loop-artifact:v1:governance_tail_result:sha256:" + "9".repeat(64)
        : (request.governanceTailResultArtifactRef ?? null));
    const commitSha = this.commitShaMismatch ? "e".repeat(40) : COMMIT_SHA;
    let result: LoopDeliveryPublishResult;
    if (this.putResult) {
      const bytes = this.publishBytes ?? writePublishBytes({
        governance_tail_result_artifact_ref: governanceRef,
        commit_sha: commitSha,
      });
      const ref = refOf("workspace_metadata", bytes);
      this.store._inject(ref, bytes, "workspace_metadata");
      result = { ...this.result, publishResultArtifactRef: ref };
    } else {
      result = this.omitPublishResultRef
        ? { ...this.result, publishResultArtifactRef: undefined }
        : this.result;
    }
    if (governanceRef !== null) {
      (result as any).governanceTailResultArtifactRef = governanceRef;
    }
    return result as LoopDeliveryPublishResult;
  }
}

// ── Fake Shared Tail ──

function makeTailPackage(overrides: Record<string, unknown> = {}): LoopGovernanceTailCompletionPackage {
  const sha1 = "1".repeat(64), sha4 = "4".repeat(64), sha5 = "5".repeat(64), sha6 = "6".repeat(64), sha7 = "7".repeat(64), sha8 = "8".repeat(64);
  return {
    final_workspace: {
      workspace_path: WORKSPACE_PATH,
      task_branch: IDENTITY.taskBranch,
      task_head_sha: HEAD1,
      status_digest_sha256: SD1,
      task_has_changes: true,
    },
    implementation_files: [...DELIVERY_FILES],
    files: [...A1_FILES],
    docflow: {
      implementation_record: { path: "03-实现记录/implementation-record.md", version: "v1", digest_sha256: sha1 },
      code_review: { path: "04-代码审核/code-review.md", version: "v1", digest_sha256: sha2(), result: "PASS" },
      test_acceptance: { path: "05-测试验收/acceptance.md", version: "v1", digest_sha256: sha3(), result: "PASS" },
    },
    business_domain_sync: {
      decision: "SYNC_REQUIRED", write_authorized: true, execution_status: "completed",
      evidence: { path: "docs/sync-evidence.md", version: "v1", digest_sha256: sha4 },
      basis: null,
    },
    reconcile: {
      decision: "not_required", execution_status: "not_required", evidence: null,
      basis: { scope: "s", reason: "r", evidence: "e", decision_source: "d", decision_owner: "o", version_basis: "v", stale_condition: "n" },
    },
    entry_coverage: {
      status: "PASS",
      evidence: { path: "docs/entry-coverage-evidence.md", version: "v1", digest_sha256: sha5 },
      basis: null,
    },
    regate: {
      status: "PASS",
      evidence: { path: "docs/regate-evidence.md", version: "v1", digest_sha256: sha6 },
      basis: null,
    },
    manifest: {
      path: "docs/manifest.md", version: "manifest-v1", digest_sha256: sha7,
      tail_status: "completed",
      completion_evidence: [
        { path: "03-实现记录/implementation-record.md", version: "v1", digest_sha256: sha1 },
        { path: "04-代码审核/code-review.md", version: "v1", digest_sha256: sha2() },
        { path: "05-测试验收/acceptance.md", version: "v1", digest_sha256: sha3() },
        { path: "docs/entry-coverage-evidence.md", version: "v1", digest_sha256: sha5 },
        { path: "docs/regate-evidence.md", version: "v1", digest_sha256: sha6 },
        { path: "docs/sync-evidence.md", version: "v1", digest_sha256: sha4 },
      ],
      completion_decision_source: { path: "05-测试验收/tail-gate.md", version: "gate-v1", digest_sha256: sha8 },
    },
    tail_gate: {
      path: "05-测试验收/tail-gate.md", version: "gate-v1", digest_sha256: sha8,
      result: "PASS", persisted: true, read_back_verified: true,
      reviewed_manifest_version: "manifest-v1",
      completion_decision_source: { path: "05-测试验收/tail-gate.md", version: "gate-v1", digest_sha256: sha8 },
    },
    blocking_items: [],
    elapsed_ms: 1234,
    ...overrides,
  } as unknown as LoopGovernanceTailCompletionPackage;
}

function sha2(): string { return SHA2; }
function sha3(): string { return SHA3; }

class FakeTail {
  calls: Array<{ input: LoopSharedGovernanceTailInput }> = [];
  result: LoopSharedGovernanceTailResult | null = null;
  throwOnRun = false;
  resultIsProxy = false;

  constructor() {
    this.result = { status: "completed", reasonCode: "GOVERNANCE_TAIL_COMPLETED", safeMessage: "tail completed", completionPackage: makeTailPackage() };
  }

  async run(input: LoopSharedGovernanceTailInput): Promise<LoopSharedGovernanceTailResult> {
    this.calls.push({ input });
    if (this.throwOnRun) throw new Error("tail exploded");
    if (this.resultIsProxy) {
      return new Proxy({ status: "completed", reasonCode: "GOVERNANCE_TAIL_COMPLETED", safeMessage: "ok" }, {
        get: () => { throw new Error("trap"); },
      }) as unknown as LoopSharedGovernanceTailResult;
    }
    return this.result!;
  }
}

// ═══════════════════════════════════════ Coordinator harness

function makeOptions(overrides: Record<string, unknown> = {}): LoopProductionCoordinatorOptions {
  const store = (overrides.store as FakeArtifactStore) ?? new FakeArtifactStore();
  const workspace = (overrides.workspace as FakeWorkspaceManager) ?? new FakeWorkspaceManager();
  const delivery = (overrides.delivery as FakeDeliveryLoop) ?? new FakeDeliveryLoop(store);
  const publisher = (overrides.publisher as FakePublisher) ?? new FakePublisher(store);
  const tail = (overrides.tail as FakeTail) ?? new FakeTail();
  const clock = (overrides.clock as { nowMs(): number }) ?? { nowMs: () => 1_000 };
  return {
    artifactStore: store,
    workspaceManager: workspace,
    deliveryLoop: delivery,
    publisher,
    sharedGovernanceTail: tail,
    clock,
    maxTotalDurationMs: (overrides.maxTotalDurationMs as number | undefined) ?? 60_000,
  };
}

function makeRequest(overrides: Record<string, unknown> = {}): LoopProductionCoordinatorRequest {
  return {
    identity: (overrides.identity as any) ?? IDENTITY,
    orchestrationResultArtifactRef: (overrides.orchestrationResultArtifactRef as string | undefined) ?? ORCH_REF,
    ...(overrides.recoveryPublishIntentArtifactRef !== undefined
      ? { recoveryPublishIntentArtifactRef: overrides.recoveryPublishIntentArtifactRef as string }
      : {}),
  } as LoopProductionCoordinatorRequest;
}

function harness(overrides: Record<string, unknown> = {}): {
  coordinator: LoopProductionCoordinator;
  store: FakeArtifactStore;
  workspace: FakeWorkspaceManager;
  delivery: FakeDeliveryLoop;
  publisher: FakePublisher;
  tail: FakeTail;
} {
  const store = new FakeArtifactStore();
  store._inject(ORCH_REF, ORCH_BYTES, "orchestration_result");
  store._inject(EXEC_REF, EXEC_BYTES, "executor_input");
  const workspace = new FakeWorkspaceManager();
  const delivery = new FakeDeliveryLoop(store);
  const publisher = new FakePublisher(store);
  const tail = new FakeTail();
  const clock = (overrides.clock as { nowMs(): number } | undefined) ?? { nowMs: () => 1_000 };
  const coordinator = new LoopProductionCoordinator({
    artifactStore: store,
    workspaceManager: workspace,
    deliveryLoop: delivery,
    publisher,
    sharedGovernanceTail: tail,
    clock,
    maxTotalDurationMs: (overrides.maxTotalDurationMs as number | undefined) ?? 60_000,
  });
  return { coordinator, store, workspace, delivery, publisher, tail };
}

// ═══════════════════════════════════════ Section: parsers

async function sectionParsers(): Promise<void> {
  startSection("parsers");
  console.log("\n=== Parser Contracts ===");

  // orchestration: real D08 artifact parses and binds identity
  {
    const p = parseLoopOrchestrationResultBytes(ORCH_BYTES, { expectedIdentity: IDENTITY });
    chk(p.ok, "orchestration real artifact parses");
    if (p.ok) {
      chk(p.value.route === "direct" && p.value.reasonCode === "DIRECT_READY", "orchestration route direct/DIRECT_READY");
      chk(p.value.executorInputArtifactRef === EXEC_REF, "orchestration executor ref exposed");
      chk(p.value.executorInputDigestSha256 === EXEC_REF.split(":")[4], "orchestration executor digest equals ref digest");
      chk(deepEqual(p.value.identity, IDENTITY), "orchestration identity round-trip");
    }
  }
  // orchestration identity binding mismatch
  {
    const p = parseLoopOrchestrationResultBytes(ORCH_BYTES, { expectedIdentity: makeIdentity({ runId: "other" }) });
    chk(p.ok === false && p.reason === "invalid_input", "orchestration identity mismatch rejected");
  }
  // orchestration non-canonical bytes (extra trailing LF)
  {
    const p = parseLoopOrchestrationResultBytes(Buffer.concat([ORCH_BYTES, Buffer.from("\n")]));
    chk(p.ok === false && p.reason === "invalid_bytes", "orchestration extra LF rejected");
  }
  // orchestration too large
  {
    const p = parseLoopOrchestrationResultBytes(ORCH_BYTES, { maxBytes: 10 });
    chk(p.ok === false && p.reason === "too_large", "orchestration oversized rejected");
  }

  // executor input: real artifact parses and binds identity
  {
    const p = parseLoopDirectExecutorInputBytes(EXEC_BYTES, { expectedIdentity: IDENTITY });
    chk(p.ok, "executor input real artifact parses");
    if (p.ok) {
      chk(p.value.schema === "loop_direct_executor_input_v1", "executor schema");
      chk(p.value.maxFixRounds === 4, "executor maxFixRounds");
      chk(deepEqual(p.value.identity, IDENTITY), "executor identity round-trip");
    }
  }
  // executor identity mismatch
  {
    const p = parseLoopDirectExecutorInputBytes(EXEC_BYTES, { expectedIdentity: makeIdentity({ taskBranch: "other" }) });
    chk(p.ok === false && p.reason === "invalid_input", "executor identity mismatch rejected");
  }
  // executor schema swap
  {
    const swapped = Buffer.from(ORCH_BYTES.toString("utf8").replace('"loop_requirement_orchestration_result_v1"', '"loop_direct_executor_input_v1"'));
    const p = parseLoopDirectExecutorInputBytes(swapped);
    chk(!p.ok, "executor rejects orchestration-shaped bytes");
  }

  // delivery: canonical fixture parses with material binding
  {
    const bytes = writeDeliveryBytes();
    const p = parseLoopDeliveryResultBytes(bytes, {
      expectedMaterial: {
        workspacePath: WORKSPACE_PATH,
        taskBranch: IDENTITY.taskBranch,
        taskHeadSha: HEAD1,
        statusDigestSha256: SD1,
        taskHasChanges: true,
      },
    });
    chk(p.ok, "delivery canonical bytes parse");
    if (p.ok) {
      chk(p.value.status === "succeeded", "delivery status");
      chk(p.value.files.length === 2, "delivery files");
      chk(p.value.finalWorkspace !== null && p.value.finalWorkspace.taskHeadSha === HEAD1, "delivery final workspace");
    }
  }
  // delivery material mismatch
  {
    const p = parseLoopDeliveryResultBytes(writeDeliveryBytes({
      final_workspace: { workspace_path: WORKSPACE_PATH, task_branch: IDENTITY.taskBranch, task_head_sha: "e".repeat(40), status_digest_sha256: SD1, task_has_changes: true },
    }), {
      expectedMaterial: { workspacePath: WORKSPACE_PATH, taskBranch: IDENTITY.taskBranch, taskHeadSha: HEAD1, statusDigestSha256: SD1, taskHasChanges: true },
    });
    chk(p.ok === false && p.reason === "invalid_input", "delivery material mismatch rejected");
  }
  // delivery non-canonical (trailing LF doubled)
  {
    const p = parseLoopDeliveryResultBytes(Buffer.concat([writeDeliveryBytes(), Buffer.from("\n")]));
    chk(p.ok === false && p.reason === "invalid_bytes", "delivery extra LF rejected");
  }
  // delivery status not canonical
  {
    const p = parseLoopDeliveryResultBytes(writeDeliveryBytes({ status: "sneaky" }));
    chk(p.ok === false && p.reason === "invalid_input", "delivery non-canonical status rejected");
  }
  // delivery files not sorted
  {
    const p = parseLoopDeliveryResultBytes(writeDeliveryBytes({ files: ["tests/d09b.test.ts", "core/d09b.ts"] }));
    chk(p.ok === false && p.reason === "invalid_input", "delivery unsorted files rejected");
  }

  // publish: canonical governed bytes parse with full binding
  {
    const bytes = writePublishBytes();
    const p = parseLoopDeliveryPublishResultBytes(bytes, {
      expectedMode: "governed",
      expectedDeliveryResultArtifactRef: DELIVERY_REF,
      expectedGovernanceTailResultArtifactRef: A1_REF,
      expectedFiles: A1_FILES,
    });
    chk(p.ok, "publish governed canonical bytes parse");
    if (p.ok) {
      chk(p.value.schema === "loop-governed-publish-result-v1", "publish governed schema");
      chk(p.value.prNumber === 42 && p.value.commitSha === COMMIT_SHA, "publish pr/commit facts");
    }
  }
  // publish standalone schema parses under expectedMode standalone
  {
    const standalone = writePublishBytes({
      schema: "loop-publish-result-v1",
      orchestration_result_artifact_ref: null,
      executor_input_artifact_ref: null,
      governance_tail_result_artifact_ref: null,
      implementation_files: undefined,
    });
    const obj = JSON.parse(standalone.toString("utf8")) as Record<string, unknown>;
    delete obj.implementation_files;
    delete obj.orchestration_result_artifact_ref;
    delete obj.executor_input_artifact_ref;
    delete obj.governance_tail_result_artifact_ref;
    const bytes = Buffer.from(JSON.stringify(obj) + "\n", "utf8");
    const p = parseLoopDeliveryPublishResultBytes(bytes, { expectedMode: "standalone" });
    chk(p.ok, "publish standalone schema parses");
  }
  // publish mode mismatch
  {
    const bytes = writePublishBytes();
    const p = parseLoopDeliveryPublishResultBytes(bytes, { expectedMode: "standalone" });
    chk(p.ok === false && p.reason === "invalid_input", "publish mode mismatch rejected");
  }
  // publish ref binding mismatch
  {
    const bytes = writePublishBytes();
    const p = parseLoopDeliveryPublishResultBytes(bytes, {
      expectedMode: "governed",
      expectedGovernanceTailResultArtifactRef: "loop-artifact:v1:governance_tail_result:sha256:" + "0".repeat(64),
    });
    chk(p.ok === false && p.reason === "invalid_input", "publish governance ref binding mismatch rejected");
  }
  // publish files binding mismatch
  {
    const bytes = writePublishBytes();
    const p = parseLoopDeliveryPublishResultBytes(bytes, { expectedMode: "governed", expectedFiles: ["only.ts"] });
    chk(p.ok === false && p.reason === "invalid_input", "publish files binding mismatch rejected");
  }
  // publish non-canonical (property order swapped)
  {
    const parsed = JSON.parse(writePublishBytes().toString("utf8")) as Record<string, unknown>;
    const reordered: Record<string, unknown> = {};
    const keys = Object.keys(parsed);
    reordered[keys[0]!] = parsed[keys[0]!];
    reordered[keys[1]!] = parsed[keys[1]!];
    reordered[keys[3]!] = parsed[keys[3]!];
    reordered[keys[2]!] = parsed[keys[2]!];
    for (let i = 4; i < keys.length; i++) reordered[keys[i]!] = parsed[keys[i]!];
    const p = parseLoopDeliveryPublishResultBytes(Buffer.from(JSON.stringify(reordered) + "\n", "utf8"));
    chk(p.ok === false && p.reason === "invalid_input", "publish property order rejected");
  }
  // publish non-canonical bytes (whitespace)
  {
    const pretty = JSON.stringify(JSON.parse(writePublishBytes().toString("utf8")), null, 2) + "\n";
    const p = parseLoopDeliveryPublishResultBytes(Buffer.from(pretty, "utf8"));
    chk(p.ok === false && p.reason === "invalid_bytes", "publish whitespace rejected");
  }

  mark("D09_B_PARSERS_VERIFIED");
}

// ═══════════════════════════════════════ Section: input domain

async function sectionInput(): Promise<void> {
  startSection("input");
  console.log("\n=== Coordinator Request Validation ===");

  for (const [label, req] of [
    ["null", null],
    ["array", []],
    ["class instance", new (class { identity = IDENTITY; orchestrationResultArtifactRef = ORCH_REF; })()],
    ["proxy", new Proxy({ identity: IDENTITY, orchestrationResultArtifactRef: ORCH_REF }, { get: () => { throw new Error("trap"); } })],
    ["unknown key", { ...makeRequest(), extra: 1 }],
    ["missing identity", { orchestrationResultArtifactRef: ORCH_REF }],
    ["missing ref", { identity: IDENTITY }],
    ["bad ref kind", makeRequest({ orchestrationResultArtifactRef: "loop-artifact:v1:executor_input:sha256:" + "1".repeat(64) })],
    ["malformed ref", makeRequest({ orchestrationResultArtifactRef: "nope" })],
    ["invalid identity", makeRequest({ identity: { ...IDENTITY, runId: "" } })],
    ["recovery ref wrong kind", makeRequest({ recoveryPublishIntentArtifactRef: "loop-artifact:v1:delivery_result:sha256:" + "1".repeat(64) })],
    ["recovery ref undefined own key", (() => { const r: any = makeRequest(); r.recoveryPublishIntentArtifactRef = undefined; return r; })()],
  ] as Array<[string, any]>) {
    const { coordinator } = harness();
    const result = await coordinator.execute(req);
    chk(result.status === "failed" && result.reasonCode === "INVALID_INPUT", `invalid request rejected (${label})`);
  }

  // symbol key
  {
    const { coordinator } = harness();
    const req: any = makeRequest();
    req[Symbol("x")] = 1;
    const result = await coordinator.execute(req);
    chk(result.status === "failed" && result.reasonCode === "INVALID_INPUT", "symbol key rejected");
  }

  // __proto__ key
  {
    const { coordinator } = harness();
    const req: any = makeRequest();
    req.__proto__ = { malicious: true };
    const result = await coordinator.execute(req);
    chk(result.status === "failed" && result.reasonCode === "INVALID_INPUT", "__proto__ key rejected");
  }

  // constructor rejects bad options
  {
    let threw = false;
    try {
      new LoopProductionCoordinator({} as any);
    } catch {
      threw = true;
    }
    chk(threw, "empty options rejected");
  }
  {
    let threw = false;
    try {
      new LoopProductionCoordinator({ ...makeOptions(), maxTotalDurationMs: 1 } as any);
    } catch {
      threw = true;
    }
    chk(threw, "out-of-range maxTotalDurationMs rejected");
  }

  mark("D09_B_INPUT_FAIL_CLOSED_VERIFIED");
}

// ═══════════════════════════════════════ Section: orchestration route

async function sectionOrchestration(): Promise<void> {
  startSection("orchestration");
  console.log("\n=== D08 Orchestration Gate ===");

  // non-direct routes are blocked before any side effect
  for (const route of ["speckit_pending", "multi_repo_pending", "paused", "blocked", "failed"]) {
    const store = new FakeArtifactStore();
    const workspace = new FakeWorkspaceManager();
    const delivery = new FakeDeliveryLoop(store);
    const publisher = new FakePublisher(store);
    const tail = new FakeTail();
    const nonDirect = JSON.parse(ORCH_BYTES.toString("utf8")) as Record<string, unknown>;
    nonDirect.route = route;
    nonDirect.reason_code = route === "failed" ? "INTERNAL_ERROR" : (route === "paused" ? "DESIGN_REVISION_EXHAUSTED" : "MULTI_REPOSITORY");
    nonDirect.executor_input_artifact_ref = null;
    nonDirect.executor_input_digest_sha256 = null;
    const bytes = Buffer.from(JSON.stringify(nonDirect), "utf8");
    const ref = refOf("orchestration_result", bytes);
    store._inject(ref, bytes, "orchestration_result");
    const coordinator = new LoopProductionCoordinator({
      artifactStore: store,
      workspaceManager: workspace,
      deliveryLoop: delivery,
      publisher,
      sharedGovernanceTail: tail,
      clock: { nowMs: () => 1_000 },
      maxTotalDurationMs: 60_000,
    });
    const result = await coordinator.execute(makeRequest({ orchestrationResultArtifactRef: ref }));
    chk(result.status === "blocked" && result.reasonCode === "ORCHESTRATION_NOT_DIRECT", `non-direct route blocked (${route})`);
    chk(delivery.calls.length === 0 && tail.calls.length === 0 && publisher.calls.length === 0 && workspace.prepareCalls === 0,
      `no side effects for ${route}`);
  }

  // orchestration digest mismatch (store returns different bytes than the ref digest)
  {
    const { coordinator, store, delivery, tail, publisher } = harness();
    const bad = Buffer.concat([ORCH_BYTES, Buffer.from("x")]);
    store._inject(ORCH_REF, bad, "orchestration_result");
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "ORCHESTRATION_VERIFICATION_FAILED", "orchestration digest mismatch fails");
    chk(delivery.calls.length === 0 && tail.calls.length === 0 && publisher.calls.length === 0, "no side effects after orchestration mismatch");
  }

  // orchestration artifact missing
  {
    const { coordinator, store } = harness();
    store.reads = [];
    store.failRead = true;
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "ORCHESTRATION_VERIFICATION_FAILED", "orchestration read failure fails");
    store.failRead = false;
  }

  // orchestration identity mismatch
  {
    const { coordinator } = harness();
    const result = await coordinator.execute(makeRequest({ identity: makeIdentity({ runId: "different-run" }) }));
    chk(result.status === "failed" && result.reasonCode === "ORCHESTRATION_VERIFICATION_FAILED", "orchestration identity mismatch fails");
  }

  // executor input digest does not bind to the ref embedded in orchestration
  {
    const { coordinator, store } = harness();
    const tampered = JSON.parse(ORCH_BYTES.toString("utf8")) as Record<string, unknown>;
    tampered.executor_input_digest_sha256 = "0".repeat(64);
    const bytes = Buffer.from(JSON.stringify(tampered), "utf8");
    const ref = refOf("orchestration_result", bytes);
    store._inject(ref, bytes, "orchestration_result");
    const result = await coordinator.execute(makeRequest({ orchestrationResultArtifactRef: ref }));
    chk(result.status === "failed" && result.reasonCode === "ORCHESTRATION_VERIFICATION_FAILED", "executor digest binding mismatch fails");
  }

  // executor input artifact missing from store
  {
    const { coordinator, store } = harness();
    store._inject(EXEC_REF, Buffer.alloc(0), "executor_input"); // wrong bytes under the ref
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "EXECUTOR_INPUT_VERIFICATION_FAILED", "executor artifact digest mismatch fails");
  }

  // executor input identity mismatch
  {
    const { coordinator, store } = harness();
    const tampered = JSON.parse(EXEC_BYTES.toString("utf8")) as Record<string, unknown>;
    (tampered.identity as Record<string, unknown>).runId = "other-run";
    const bytes = Buffer.from(JSON.stringify(tampered), "utf8");
    const ref = refOf("executor_input", bytes);
    store._inject(ref, bytes, "executor_input");
    const tamperedOrch = JSON.parse(ORCH_BYTES.toString("utf8")) as Record<string, unknown>;
    tamperedOrch.executor_input_artifact_ref = ref;
    tamperedOrch.executor_input_digest_sha256 = ref.split(":")[4];
    const orchBytes = Buffer.from(JSON.stringify(tamperedOrch), "utf8");
    const orchRef = refOf("orchestration_result", orchBytes);
    store._inject(orchRef, orchBytes, "orchestration_result");
    const result = await coordinator.execute(makeRequest({ orchestrationResultArtifactRef: orchRef }));
    chk(result.status === "failed" && result.reasonCode === "EXECUTOR_INPUT_VERIFICATION_FAILED", "executor identity mismatch fails");
  }

  mark("D09_B_ORCHESTRATION_GATE_VERIFIED");
}

// ═══════════════════════════════════════ Section: workspace prepare

async function sectionWorkspace(): Promise<void> {
  startSection("workspace");
  console.log("\n=== D03 Prepare ===");

  // base drift via snapshot fields
  {
    const { coordinator, workspace } = harness();
    workspace.prepareSnapshot = makeSnapshot({ baseDrifted: true, currentBaseSha: "e".repeat(40) });
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "blocked" && result.reasonCode === "BASE_BRANCH_DRIFT", "snapshot base drift blocked");
  }
  // base drift via prepare error
  {
    const { coordinator, workspace } = harness();
    workspace.prepareError = makeWorkspaceError("BASE_SHA_MISMATCH");
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "blocked" && result.reasonCode === "BASE_BRANCH_DRIFT", "prepare BASE_SHA_MISMATCH blocked");
  }
  // source drift via prepare error
  {
    const { coordinator, workspace } = harness();
    workspace.prepareError = makeWorkspaceError("SOURCE_WORKSPACE_DRIFT");
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "blocked" && result.reasonCode === "WORKSPACE_DRIFT", "prepare SOURCE_WORKSPACE_DRIFT blocked");
  }
  // dirty workspace without trusted recovery facts
  {
    const { coordinator, workspace } = harness();
    workspace.prepareError = makeWorkspaceError("WORKSPACE_DIRTY");
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "blocked" && result.reasonCode === "WORKSPACE_PREPARE_BLOCKED", "dirty workspace blocked");
  }
  // source invariance violation in snapshot
  {
    const { coordinator, workspace } = harness();
    workspace.prepareSnapshot = makeSnapshot({ sourceHeadSha: "e".repeat(40) });
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "blocked" && result.reasonCode === "WORKSPACE_DRIFT", "source head mismatch blocked");
  }
  // identity binding violation in snapshot
  {
    const { coordinator, workspace } = harness();
    workspace.prepareSnapshot = makeSnapshot({ taskBranch: "codex/foreign-task" });
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "blocked" && result.reasonCode === "WORKSPACE_DRIFT", "snapshot taskBranch mismatch blocked");
  }
  // recovered state proceeds to success
  {
    const { coordinator, workspace } = harness();
    workspace.prepareSnapshot = makeSnapshot({ state: "recovered" as const });
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "succeeded", "recovered prepare still succeeds");
  }

  mark("D09_B_WORKSPACE_PREPARE_VERIFIED");
}

// ═══════════════════════════════════════ Section: delivery

async function sectionDelivery(): Promise<void> {
  startSection("delivery");
  console.log("\n=== D06 Execute and Read-back ===");

  // D06 failed
  {
    const { coordinator, delivery } = harness();
    delivery.result = makeDeliveryResult({ status: "failed", reasonCode: "IMPLEMENTATION_FAILED" });
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "DELIVERY_FAILED", "D06 failed maps to DELIVERY_FAILED");
  }
  // D06 blocked
  {
    const { coordinator, delivery } = harness();
    delivery.result = makeDeliveryResult({ status: "blocked", reasonCode: "EXECUTION_BLOCKED" });
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "blocked" && result.reasonCode === "DELIVERY_BLOCKED", "D06 blocked maps to DELIVERY_BLOCKED");
  }
  // D06 throws
  {
    const { coordinator, delivery } = harness();
    delivery.throwOnExecute = true;
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "INTERNAL_ERROR", "D06 throw maps to INTERNAL_ERROR");
  }
  // D06 succeeded without persisted artifact
  {
    const { coordinator, delivery } = harness();
    delivery.putArtifact = false;
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "blocked" && result.reasonCode === "DELIVERY_READBACK_AMBIGUOUS", "succeeded without artifact blocked");
    chk(delivery.calls.length === 1, "no second implementation attempt");
  }
  // delivery read-back: artifact bytes not matching the ref digest
  {
    const { coordinator, delivery, store } = harness();
    delivery.artifactBytes = Buffer.concat([writeDeliveryBytes(), Buffer.from("x")]);
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "blocked" && result.reasonCode === "DELIVERY_READBACK_AMBIGUOUS", "delivery digest mismatch blocked");
    chk(delivery.calls.length === 1, "no second implementation attempt after digest mismatch");
  }
  // delivery read-back: non-canonical artifact bytes (parser mismatch)
  {
    const { coordinator, delivery } = harness();
    delivery.artifactBytes = Buffer.concat([writeDeliveryBytes(), Buffer.from("\n")]);
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "blocked" && result.reasonCode === "DELIVERY_READBACK_AMBIGUOUS", "delivery parser mismatch blocked");
    chk(delivery.calls.length === 1, "no second implementation attempt after parser mismatch");
  }
  // delivery artifact files mismatch with in-memory result
  {
    const { coordinator, delivery } = harness();
    delivery.result = makeDeliveryResult({ files: ["core/other.ts", "tests/other.test.ts"] });
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "blocked" && result.reasonCode === "DELIVERY_READBACK_AMBIGUOUS", "delivery files mismatch blocked");
  }
  // delivery in-memory workspace material differs from the artifact
  {
    const { coordinator, delivery } = harness();
    delivery.result = makeDeliveryResult({
      finalWorkspace: { workspacePath: WORKSPACE_PATH, taskBranch: IDENTITY.taskBranch, taskHeadSha: "e".repeat(40), statusDigestSha256: SD1, taskHasChanges: true },
    });
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "blocked" && result.reasonCode === "DELIVERY_READBACK_AMBIGUOUS", "delivery material mismatch blocked");
  }
  // delivery in-memory finalWorkspace missing
  {
    const { coordinator, delivery } = harness();
    delivery.result = makeDeliveryResult({ finalWorkspace: undefined });
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "blocked" && result.reasonCode === "DELIVERY_READBACK_AMBIGUOUS", "delivery without final workspace blocked");
  }
  // delivery taskBranch not bound to identity
  {
    const { coordinator, delivery } = harness();
    delivery.result = makeDeliveryResult({
      finalWorkspace: { workspacePath: WORKSPACE_PATH, taskBranch: "codex/foreign", taskHeadSha: HEAD1, statusDigestSha256: SD1, taskHasChanges: true },
    });
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "blocked" && result.reasonCode === "DELIVERY_READBACK_AMBIGUOUS", "delivery branch identity binding blocked");
  }
  // D06 request mapping: budget is the shared remaining budget, requirement is lossless
  {
    const { coordinator, delivery, tail } = harness();
    await coordinator.execute(makeRequest());
    chk(delivery.calls.length === 1, "delivery called once");
    const req = delivery.calls[0]!;
    chk(req.maxTotalDurationMs === Math.min(1800000, 60000), "delivery budget bounded by remaining budget");
    chk(req.identity.runId === IDENTITY.runId, "delivery identity forwarded");
    chk(req.workspace.workspacePath === WORKSPACE_PATH, "delivery workspace path from prepare");
    chk(req.workspace.expectedTaskHeadSha === HEAD0, "delivery expected head from prepare");
    chk(typeof req.requirement === "string" && req.requirement.includes(IDENTITY.runId) === false, "requirement is a canonical string");
    chk(tail.calls.length === 1, "tail called once");
  }

  mark("D09_B_DELIVERY_READBACK_VERIFIED");
}

// ═══════════════════════════════════════ Section: shared tail

async function sectionTail(): Promise<void> {
  startSection("tail");
  console.log("\n=== Shared Documentation Governance Tail Boundary ===");

  const statuses: Array<[string, string, string]> = [
    ["pending", "blocked", "GOVERNANCE_TAIL_NOT_COMPLETED"],
    ["in_progress", "blocked", "GOVERNANCE_TAIL_NOT_COMPLETED"],
    ["blocked", "blocked", "GOVERNANCE_TAIL_NOT_COMPLETED"],
    ["failed", "failed", "GOVERNANCE_TAIL_FAILED"],
  ];
  for (const [status, expectedStatus, expectedReason] of statuses) {
    const { coordinator, tail, store, publisher } = harness();
    tail.result = { status: status as any, reasonCode: "SOME_REASON", safeMessage: "tail not done" };
    const result = await coordinator.execute(makeRequest());
    chk(result.status === expectedStatus && result.reasonCode === expectedReason, `tail ${status} maps to ${expectedReason}`);
    const a1Puts = store.puts.filter((p) => p.kind === "governance_tail_result").length;
    chk(a1Puts === 0, `no A1 put for tail ${status}`);
    chk(publisher.calls.length === 0, `no D07 call for tail ${status}`);
  }

  // tail throws
  {
    const { coordinator, tail, store, publisher } = harness();
    tail.throwOnRun = true;
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "GOVERNANCE_TAIL_FAILED", "tail throw maps to GOVERNANCE_TAIL_FAILED");
    chk(store.puts.filter((p) => p.kind === "governance_tail_result").length === 0, "no A1 put after tail throw");
    chk(publisher.calls.length === 0, "no D07 call after tail throw");
  }

  // completed without completion package
  {
    const { coordinator, tail, store, publisher } = harness();
    tail.result = { status: "completed", reasonCode: "GOVERNANCE_TAIL_COMPLETED", safeMessage: "ok" };
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "GOVERNANCE_TAIL_INVALID", "completed without package invalid");
    chk(store.puts.filter((p) => p.kind === "governance_tail_result").length === 0, "no A1 put without package");
    chk(publisher.calls.length === 0, "no D07 call without package");
  }

  // non-completed with completion package
  {
    const { coordinator, tail } = harness();
    tail.result = { status: "in_progress", reasonCode: "X", safeMessage: "ok", completionPackage: makeTailPackage() };
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "GOVERNANCE_TAIL_INVALID", "non-completed with package invalid");
  }

  // extra fields in tail result
  {
    const { coordinator, tail } = harness();
    tail.result = { status: "completed", reasonCode: "GOVERNANCE_TAIL_COMPLETED", safeMessage: "ok", completionPackage: makeTailPackage(), extra: 1 } as unknown as LoopSharedGovernanceTailResult;
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "GOVERNANCE_TAIL_INVALID", "tail result extra field invalid");
  }

  // malicious proxy tail result (accessor throws)
  {
    const { coordinator, tail, store, publisher } = harness();
    tail.resultIsProxy = true;
    const result = await coordinator.execute(makeRequest());
    // A throwing `get` trap also fires on the promise thenable resolution of
    // the returned value, so the dependency call fails closed like a throw.
    chk(result.status === "failed" && result.reasonCode === "GOVERNANCE_TAIL_FAILED", "tail proxy result fail-closed");
    chk(store.puts.filter((p) => p.kind === "governance_tail_result").length === 0, "no A1 put after proxy tail result");
    chk(publisher.calls.length === 0, "no D07 call after proxy tail result");
  }

  // inconsistent completion package: implementation_files ≠ delivery files
  // (but still a valid subset of the package files, so the A1 builder
  // accepts and the coordinator's cross-binding must reject it)
  {
    const { coordinator, tail, publisher, store } = harness();
    tail.result = {
      status: "completed", reasonCode: "GOVERNANCE_TAIL_COMPLETED", safeMessage: "ok",
      completionPackage: makeTailPackage({ implementation_files: ["core/d09b.ts"] }),
    };
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "A1_VERIFICATION_FAILED", "package impl files mismatch fails");
    chk(publisher.calls.length === 0, "no D07 call after impl files mismatch");
    chk(store.puts.filter((p) => p.kind === "governance_tail_result").length === 1, "A1 was built and stored before binding check");
  }

  // inconsistent completion package: files not a superset of implementation files
  {
    const { coordinator, tail, publisher } = harness();
    tail.result = {
      status: "completed", reasonCode: "GOVERNANCE_TAIL_COMPLETED", safeMessage: "ok",
      completionPackage: makeTailPackage({ files: ["core/d09b.ts"] }),
    };
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "A1_BUILD_FAILED", "package files superset violation fails");
    chk(publisher.calls.length === 0, "no D07 call after superset violation");
  }

  // tail gate persisted=false
  {
    const { coordinator, tail, publisher } = harness();
    const pkg = makeTailPackage();
    const gate = { ...(pkg.tail_gate as any), persisted: false };
    tail.result = { status: "completed", reasonCode: "GOVERNANCE_TAIL_COMPLETED", safeMessage: "ok", completionPackage: makeTailPackage({ tail_gate: gate }) };
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "A1_BUILD_FAILED", "tail gate persisted=false fails");
    chk(publisher.calls.length === 0, "no D07 call after gate persisted=false");
  }

  // tail gate read_back_verified=false
  {
    const { coordinator, tail, publisher } = harness();
    const pkg = makeTailPackage();
    const gate = { ...(pkg.tail_gate as any), read_back_verified: false };
    tail.result = { status: "completed", reasonCode: "GOVERNANCE_TAIL_COMPLETED", safeMessage: "ok", completionPackage: makeTailPackage({ tail_gate: gate }) };
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "A1_BUILD_FAILED", "tail gate read_back_verified=false fails");
    chk(publisher.calls.length === 0, "no D07 call after gate read_back=false");
  }

  // tail gate reviewed_manifest_version mismatch
  {
    const { coordinator, tail } = harness();
    const pkg = makeTailPackage();
    const gate = { ...(pkg.tail_gate as any), reviewed_manifest_version: "other-v1" };
    tail.result = { status: "completed", reasonCode: "GOVERNANCE_TAIL_COMPLETED", safeMessage: "ok", completionPackage: makeTailPackage({ tail_gate: gate }) };
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "A1_BUILD_FAILED", "gate manifest version mismatch fails");
  }

  // completion_decision_source mismatch
  {
    const { coordinator, tail } = harness();
    const pkg = makeTailPackage();
    const gate = { ...(pkg.tail_gate as any), completion_decision_source: { path: "05-测试验收/tail-gate.md", version: "gate-v1", digest_sha256: "0".repeat(64) } };
    tail.result = { status: "completed", reasonCode: "GOVERNANCE_TAIL_COMPLETED", safeMessage: "ok", completionPackage: makeTailPackage({ tail_gate: gate }) };
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "A1_BUILD_FAILED", "completion decision source mismatch fails");
  }

  // malicious accessor inside completion package
  {
    const { coordinator, tail, publisher } = harness();
    const pkg = makeTailPackage() as any;
    Object.defineProperty(pkg, "files", { get: () => { throw new Error("trap"); }, enumerable: true });
    tail.result = { status: "completed", reasonCode: "GOVERNANCE_TAIL_COMPLETED", safeMessage: "ok", completionPackage: pkg };
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "A1_BUILD_FAILED", "package accessor fail-closed");
    chk(publisher.calls.length === 0, "no D07 call after package accessor");
  }

  // tail input carries the verified chain refs
  {
    const { coordinator, tail } = harness();
    await coordinator.execute(makeRequest());
    chk(tail.calls.length === 1, "tail called once");
    const input = tail.calls[0]!.input;
    chk(input.orchestrationResultArtifactRef === ORCH_REF, "tail input orchestration ref");
    chk(input.executorInputArtifactRef === EXEC_REF, "tail input executor ref");
    chk(input.deliveryResultArtifactRef === DELIVERY_REF, "tail input delivery ref");
    chk(deepEqual(input.implementationFiles, DELIVERY_FILES), "tail input implementation files");
    chk(input.finalWorkspace.taskHeadSha === HEAD1, "tail input final workspace");
  }

  mark("D09_B_TAIL_BOUNDARY_VERIFIED");
  mark("D09_B_TAIL_FAIL_CLOSED_VERIFIED");
}

// ═══════════════════════════════════════ Section: A1 ownership

async function sectionA1(): Promise<void> {
  startSection("a1");
  console.log("\n=== A1 Build / Store / Read-back ===");

  // store returns a lying descriptor
  {
    const { coordinator, store } = harness();
    const originalPut = store.put.bind(store);
    store.put = ((kind: string, content: string | Uint8Array): LoopStoredArtifact => {
      const real = originalPut(kind, content);
      return Object.freeze({ artifactRef: real.artifactRef, kind: real.kind, digest: "0".repeat(64), sizeBytes: real.sizeBytes });
    }) as any;
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "A1_VERIFICATION_FAILED", "lying store descriptor fails");
  }

  // read-back throws
  {
    const { coordinator, store } = harness();
    const originalRead = store.read.bind(store);
    let a1ReadSeen = false;
    store.read = ((ref: string, expectedDigest?: string): Buffer => {
      if (ref.startsWith("loop-artifact:v1:governance_tail_result:")) {
        a1ReadSeen = true;
        throw new Error("ARTIFACT_IO_FAILURE");
      }
      return originalRead(ref, expectedDigest);
    }) as any;
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "A1_VERIFICATION_FAILED", "A1 read-back failure fails");
    chk(a1ReadSeen, "A1 read-back was attempted");
  }

  // read-back bytes corrupted (digest mismatch)
  {
    const { coordinator, store } = harness();
    const originalPut = store.put.bind(store);
    store.put = ((kind: string, content: string | Uint8Array): LoopStoredArtifact => {
      const real = originalPut(kind, content);
      if (kind === "governance_tail_result") {
        const bytes = Buffer.concat([Buffer.from(content), Buffer.from("x")]);
        store._inject(real.artifactRef, bytes, kind);
      }
      return real;
    }) as any;
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "A1_VERIFICATION_FAILED", "A1 read-back digest mismatch fails");
  }

  // A1 builder rejection: elapsed_ms out of range
  {
    const { coordinator, tail } = harness();
    tail.result = { status: "completed", reasonCode: "GOVERNANCE_TAIL_COMPLETED", safeMessage: "ok", completionPackage: makeTailPackage({ elapsed_ms: 9_000_000 }) };
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "A1_BUILD_FAILED", "A1 builder rejects out-of-range elapsed");
  }

  // A1 built value: canonical value comparison between builder and read-back parser
  {
    const { coordinator, store } = harness();
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "succeeded", "happy path A1 chain succeeds");
    const a1Puts = store.puts.filter((p) => p.kind === "governance_tail_result");
    chk(a1Puts.length === 1, "A1 stored exactly once");
    if (a1Puts.length === 1) {
      const parsed = parseLoopGovernanceTailResultBytes(a1Puts[0]!.bytes);
      chk(parsed.ok && parsed.value.tail_gate.persisted === true && parsed.value.tail_gate.read_back_verified === true,
        "A1 tail gate persisted/read-back verified");
      chk(parsed.ok && deepEqual(parsed.value.implementation_files, DELIVERY_FILES), "A1 implementation files bind to delivery files");
    }
  }

  mark("D09_B_A1_OWNERSHIP_VERIFIED");
}

// ═══════════════════════════════════════ Section: post-tail inspect

async function sectionPostTail(): Promise<void> {
  startSection("post_tail");
  console.log("\n=== Post-Tail Workspace ===");

  // inspect head drift
  {
    const { coordinator, workspace } = harness();
    workspace.inspectSnapshot = makePostTailSnapshot({ taskHeadSha: "e".repeat(40) });
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "blocked" && result.reasonCode === "FINAL_WORKSPACE_DRIFT", "post-tail head drift blocked");
    chk(result.governanceTailResultArtifactRef === undefined, "no governance ref on blocked result");
  }
  // inspect digest drift
  {
    const { coordinator, workspace } = harness();
    workspace.inspectSnapshot = makePostTailSnapshot({ taskStatusDigestSha256: "e".repeat(64) });
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "blocked" && result.reasonCode === "FINAL_WORKSPACE_DRIFT", "post-tail digest drift blocked");
  }
  // inspect throws
  {
    const { coordinator, workspace } = harness();
    workspace.inspectError = makeWorkspaceError("WORKSPACE_NOT_FOUND");
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "blocked" && result.reasonCode === "FINAL_WORKSPACE_DRIFT", "post-tail inspect throw blocked");
  }
  // inspect base drift
  {
    const { coordinator, workspace } = harness();
    workspace.inspectSnapshot = makePostTailSnapshot({ baseDrifted: true, currentBaseSha: "e".repeat(40) });
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "blocked" && result.reasonCode === "FINAL_WORKSPACE_DRIFT", "post-tail base drift blocked");
  }

  mark("D09_B_FINAL_WORKSPACE_VERIFIED");
}

// ═══════════════════════════════════════ Section: publish

async function sectionPublish(): Promise<void> {
  startSection("publish");
  console.log("\n=== D07 Governed Publish ===");

  // D07 failed
  {
    const { coordinator, publisher } = harness();
    publisher.result = makePublishResult({ status: "failed", reasonCode: "PUSH_FAILED" });
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "PUBLISH_FAILED", "D07 failed maps to PUBLISH_FAILED");
  }
  // D07 blocked
  {
    const { coordinator, publisher } = harness();
    publisher.result = makePublishResult({ status: "blocked", reasonCode: "WORKSPACE_DRIFT" });
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "blocked" && result.reasonCode === "PUBLISH_BLOCKED", "D07 blocked maps to PUBLISH_BLOCKED");
  }
  // D07 throws
  {
    const { coordinator, publisher } = harness();
    publisher.throwOnExecute = true;
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "PUBLISH_FAILED", "D07 throw maps to PUBLISH_FAILED");
  }
  // governed violation: result not bound to the governance tail artifact
  {
    const { coordinator, publisher } = harness();
    publisher.omitGovernanceRef = true;
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "GOVERNED_PUBLISH_VIOLATION", "missing governance ref on result fails");
  }
  {
    const { coordinator, publisher } = harness();
    publisher.wrongGovernanceRef = true;
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "GOVERNED_PUBLISH_VIOLATION", "wrong governance ref on result fails");
  }
  // no standalone fallback: request always carries the governance ref
  {
    const { coordinator, publisher } = harness();
    await coordinator.execute(makeRequest());
    chk(publisher.calls.length === 1, "publisher called once");
    const req = publisher.calls[0]!.request;
    chk(typeof req.governanceTailResultArtifactRef === "string" && req.governanceTailResultArtifactRef.startsWith("loop-artifact:v1:governance_tail_result:"),
      "publish request always carries governanceTailResultArtifactRef");
    chk(req.deliveryResultArtifactRef === DELIVERY_REF, "publish request delivery ref");
    chk(req.commitSubject === "feat: add d09b coordinator", "publish request commit subject from executor input");
  }
  // publish succeeded without persisted result artifact → ambiguous
  {
    const { coordinator, publisher } = harness();
    publisher.putResult = false;
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "blocked" && result.reasonCode === "PUBLISH_READBACK_AMBIGUOUS", "succeeded without result artifact blocked");
    chk(publisher.calls.length === 1, "no fresh replay after ambiguous publish");
  }
  // publish result read-back failure → ambiguous
  {
    const { coordinator, publisher, store } = harness();
    const originalRead = store.read.bind(store);
    let sabotage = false;
    store.read = ((ref: string, expectedDigest?: string): Buffer => {
      if (sabotage && ref.startsWith("loop-artifact:v1:workspace_metadata:")) {
        throw new Error("ARTIFACT_IO_FAILURE");
      }
      return originalRead(ref, expectedDigest);
    }) as any;
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "succeeded", "control publish succeeds when store healthy");
    sabotage = true;
    const result2 = await coordinator.execute(makeRequest());
    chk(result2.status === "blocked" && result2.reasonCode === "PUBLISH_READBACK_AMBIGUOUS", "publish read-back failure blocked");
    chk(publisher.calls.length === 2, "each run publishes at most once");
  }
  // publish result artifact digest mismatch
  {
    const { coordinator, publisher } = harness();
    publisher.publishBytes = Buffer.concat([writePublishBytes(), Buffer.from("x")]);
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "blocked" && result.reasonCode === "PUBLISH_READBACK_AMBIGUOUS", "publish digest mismatch blocked");
  }
  // publish result parser mismatch (non-canonical bytes)
  {
    const { coordinator, publisher } = harness();
    publisher.publishBytes = Buffer.concat([writePublishBytes(), Buffer.from("\n")]);
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "blocked" && result.reasonCode === "PUBLISH_READBACK_AMBIGUOUS", "publish parser mismatch blocked");
  }
  // publish result artifact is standalone schema
  {
    const { coordinator, publisher } = harness();
    const standalone = JSON.parse(writePublishBytes().toString("utf8")) as Record<string, unknown>;
    standalone.schema = "loop-publish-result-v1";
    delete standalone.orchestration_result_artifact_ref;
    delete standalone.executor_input_artifact_ref;
    delete standalone.governance_tail_result_artifact_ref;
    delete standalone.implementation_files;
    publisher.publishBytes = Buffer.from(JSON.stringify(standalone) + "\n", "utf8");
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "blocked" && result.reasonCode === "PUBLISH_READBACK_AMBIGUOUS", "standalone publish artifact rejected");
  }
  // publish artifact says not succeeded
  {
    const { coordinator, publisher } = harness();
    publisher.publishBytes = writePublishBytes({ status: "failed", reason_code: "PUSH_FAILED" });
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "blocked" && result.reasonCode === "PUBLISH_READBACK_AMBIGUOUS", "persisted failed publish artifact blocked");
  }
  // in-memory commit sha differs from persisted artifact
  {
    const { coordinator, publisher } = harness();
    publisher.commitShaMismatch = true;
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "blocked" && result.reasonCode === "PUBLISH_READBACK_AMBIGUOUS", "commit sha mismatch blocked");
  }
  // recovered publish path: recovery intent forwarded and result recovered
  {
    const { coordinator, publisher } = harness();
    const recoveryRef = "loop-artifact:v1:workspace_metadata:sha256:" + "f".repeat(64);
    publisher.result = makePublishResult({
      commitRecovered: true,
      pushRecovered: true,
      prRecovered: true,
      recoveryStage: "completed",
    });
    const result = await coordinator.execute(makeRequest({ recoveryPublishIntentArtifactRef: recoveryRef }));
    chk(result.status === "succeeded", "recovered publish succeeds");
    chk(publisher.calls[0]!.request.recoveryPublishIntentArtifactRef === recoveryRef, "recovery intent forwarded to D07");
    chk(result.commitSha === COMMIT_SHA, "recovered run still surfaces persisted commit sha");
  }
  // D07 request recovery intent missing is not forwarded as an own key
  {
    const { coordinator, publisher } = harness();
    await coordinator.execute(makeRequest());
    chk(publisher.calls[0]!.request.recoveryPublishIntentArtifactRef === undefined, "absent recovery intent not forwarded");
  }

  mark("D09_B_GOVERNED_PUBLISH_VERIFIED");
  mark("D09_B_NO_STANDALONE_FALLBACK_VERIFIED");
  mark("D09_B_AMBIGUOUS_WINDOW_VERIFIED");
}

// ═══════════════════════════════════════ Section: deadline / clock

async function sectionClock(): Promise<void> {
  startSection("clock");
  console.log("\n=== Deadline and Clock ===");

  // total timeout mid-run: deadline exceeded before D06
  {
    let now = 0;
    const clock = { nowMs: () => now };
    const { coordinator, delivery, tail, publisher } = harness({ clock, maxTotalDurationMs: 5_000 });
    const resultPromise = coordinator.execute(makeRequest());
    // advance past the deadline between the orchestration gate and the D06 gate
    now = 10_000;
    const result = await resultPromise;
    chk(result.status === "failed" && result.reasonCode === "TOTAL_TIMEOUT", "deadline exceeded maps to TOTAL_TIMEOUT");
    chk(delivery.calls.length === 0, "no delivery after deadline");
    chk(tail.calls.length === 0 && publisher.calls.length === 0, "no tail/publish after deadline");
  }

  // clock throws mid-run
  {
    let calls = 0;
    const clock = {
      nowMs: () => {
        calls++;
        if (calls > 2) throw new Error("clock broke");
        return 1_000;
      },
    };
    const { coordinator, delivery } = harness({ clock });
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "CLOCK_INVALID", "clock throw maps to CLOCK_INVALID");
    chk(delivery.calls.length === 0, "no delivery after clock error");
  }

  // clock non-finite
  {
    const clock = { nowMs: () => (Math.random() > 1 ? NaN : Number.NaN) };
    const { coordinator } = harness({ clock });
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "CLOCK_INVALID", "non-finite clock maps to CLOCK_INVALID");
  }

  // clock backward
  {
    let now = 5_000;
    const clock = { nowMs: () => (now -= 3_000) };
    const { coordinator } = harness({ clock });
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "CLOCK_INVALID", "backward clock maps to CLOCK_INVALID");
  }

  // clock throws at first sample
  {
    const clock = { nowMs: () => { throw new Error("clock broke"); } };
    const { coordinator, delivery } = harness({ clock });
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "failed" && result.reasonCode === "CLOCK_INVALID", "first clock throw maps to CLOCK_INVALID");
    chk(delivery.calls.length === 0, "no side effects with broken clock");
  }

  // deadline origin is the first valid clock sample, not identity.createdAt
  {
    let now = 1_500;
    const clock = { nowMs: () => now };
    const { coordinator, delivery, tail, publisher } = harness({ clock, maxTotalDurationMs: 1_000 });
    // identity.createdAt is 2026-08-04T00:00:00.000Z (far in the past). If
    // the deadline were anchored there, the run would be instantly expired;
    // it must be anchored at the first execute() sample (now=1500).
    const result = await coordinator.execute(makeRequest());
    chk(result.status === "succeeded", "deadline anchored at the first execute() clock sample");
    chk(delivery.calls.length === 1 && tail.calls.length === 1 && publisher.calls.length === 1, "all stages ran within budget");
  }

  mark("D09_B_DEADLINE_VERIFIED");
}

// ═══════════════════════════════════════ Section: happy path + call counts

async function sectionHappyPath(): Promise<void> {
  startSection("happy");
  console.log("\n=== Governed Production Delivery Happy Path ===");

  const { coordinator, store, workspace, delivery, publisher, tail } = harness();
  const result = await coordinator.execute(makeRequest());
  chk(result.status === "succeeded", "happy path succeeds");
  chk(result.reasonCode === "DELIVERY_SUCCEEDED", "reason DELIVERY_SUCCEEDED");
  chk(result.orchestrationResultArtifactRef === ORCH_REF, "orchestration ref surfaced");
  chk(result.executorInputArtifactRef === EXEC_REF, "executor ref surfaced");
  chk(result.deliveryResultArtifactRef === DELIVERY_REF, "delivery ref surfaced");
  chk(result.governanceTailResultArtifactRef !== undefined && result.governanceTailResultArtifactRef.startsWith("loop-artifact:v1:governance_tail_result:"),
    "governance tail ref surfaced");
  chk(result.publishResultArtifactRef !== undefined && result.publishResultArtifactRef.startsWith("loop-artifact:v1:workspace_metadata:"),
    "publish result ref surfaced");
  chk(result.commitSha === COMMIT_SHA, "commit sha from persisted artifact");
  chk(result.prNumber === 42, "pr number from persisted artifact");
  chk(result.prUrl === "https://github.com/shaoyang01/ai-sdlc-standard/pull/42", "pr url from persisted artifact");
  chk(deepEqual(result.files, A1_FILES), "final governed files are the A1 files");
  chk(result.finalGovernedWorkspace !== undefined && result.finalGovernedWorkspace.task_head_sha === HEAD1, "final governed workspace from A1");
  chk(result.finalGovernedWorkspace!.task_has_changes === true, "final governed workspace has changes");

  // side-effect call counts: every stage exactly once
  chk(workspace.prepareCalls === 1, "prepare called exactly once");
  chk(delivery.calls.length === 1, "delivery called exactly once");
  chk(tail.calls.length === 1, "tail called exactly once");
  chk(publisher.calls.length === 1, "publisher called exactly once");
  chk(workspace.inspectCalls === 1, "post-tail inspect called exactly once");
  chk(store.puts.filter((p) => p.kind === "governance_tail_result").length === 1, "A1 put exactly once");

  // trace stage ordering
  const stages = result.trace.map((t) => t.stage);
  chk(deepEqual(stages, [
    "orchestration_verify", "executor_input_verify", "workspace_prepare", "delivery_execute",
    "delivery_readback", "governance_tail", "a1_build", "a1_store_readback", "post_tail_inspect",
    "governed_publish", "publish_readback", "terminal",
  ]), "trace stage order is canonical");
  chk(result.trace[result.trace.length - 1]!.outcome === "succeeded", "terminal trace succeeded");

  // no Ready / merge / Exchange / Personal KB side effects: the only
  // outbound boundary is the fake publisher, which only ever receives the
  // governed Draft PR request (asserted above). Verify no publish request
  // contains any ready/merge signal and the result carries no such facts.
  const req = publisher.calls[0]!.request;
  chk(!("markReady" in (req as any)) && !("merge" in (req as any)), "no ready/merge signals in publish request");
  chk(!("exchangePublication" in (result as any)) && !("personalKb" in (result as any)), "no exchange/kb fields in result");
  chk(publisher.calls.length === 1, "publisher never called twice (no fresh replay)");

  // deep frozen result
  chk(Object.isFrozen(result), "result is frozen");

  mark("D09_B_CALL_COUNTS_VERIFIED");
  mark("D09_B_NO_READY_MERGE_EXCHANGE_KB_VERIFIED");
}

// ═══════════════════════════════════════ Main

async function main(): Promise<void> {
  recordRealSource();
  await runRealD08();

  // pre-compute the delivery ref placeholder used by publish fixtures
  DELIVERY_REF = refOf("delivery_result", writeDeliveryBytes());
  A1_REF = refOf("governance_tail_result", Buffer.alloc(0)); // placeholder; publish fixture resolves per-run

  await sectionParsers();
  await sectionInput();
  await sectionOrchestration();
  await sectionWorkspace();
  await sectionDelivery();
  await sectionTail();
  await sectionA1();
  await sectionPostTail();
  await sectionPublish();
  await sectionClock();
  await sectionHappyPath();

  verifyRealSourceUnchanged();
  cleanupAll();

  const passed = checks - failures;
  const summaryOk = failures === 0;
  console.log(`\nD09_B_PRODUCTION_COORDINATOR_SUMMARY passed=${passed} failed=${failures}`);
  for (const [name, ok] of Object.entries(markers)) {
    console.log(`${name}`, ok);
  }
  process.exitCode = summaryOk ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
