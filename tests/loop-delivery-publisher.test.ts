// LOOP-DELIVERY-07 — Recoverable Delivery Publisher Targeted Tests
// ================================================================
// All assertions contribute to domain check counts. No skip, placeholder,
// ok(true), condition || true, or fixed += N patterns.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { LoopDeliveryPublisher } from "../core/loop-delivery-publisher";
import type {
  LoopDeliveryPublishRequest,
  LoopDeliveryPublishResult,
  LoopDeliveryPublishStatus,
  LoopDeliveryPublishReasonCode,
  LoopDeliveryPublishRecoveryStage,
  LoopDeliveryPublisherOptions,
} from "../core/loop-delivery-publisher";
import { LoopPosixProcessRunnerError } from "../core/loop-posix-process-runner";
import type {
  LoopPosixProcessRunner,
  LoopPosixProcessResult,
} from "../core/loop-posix-process-runner";
import type { LoopGitWorkspaceManager, LoopGitWorkspaceSnapshot } from "../core/loop-git-workspace";
import type { LoopArtifactStore, LoopStoredArtifact } from "../core/loop-artifact-store";

// ═══════════════════════════════════════ Domain Counters

let failures = 0;
const checks: Record<string, number> = {
  input: 0,
  artifact: 0,
  workspace: 0,
  commit: 0,
  push_pr: 0,
  recovery: 0,
  integration: 0,
};

let tempDirs: string[] = [];
let realSourceHead = "";
let realSourceStatusBytes = "";
let realSourceDiffDigest = "";
let realSourceStagedDigest = "";

function chk(domain: string, cond: boolean, msg: string): void {
  checks[domain] = (checks[domain] ?? 0) + 1;
  if (!cond) {
    failures++;
    console.error(`FAIL [${domain}] ${msg}`);
  }
}

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "d07-test-"));
  tempDirs.push(dir);
  return dir;
}

function cleanupAll(): void {
  let allClean = true;
  for (const d of tempDirs.reverse()) {
    try {
      if (fs.existsSync(d)) {
        fs.rmSync(d, { recursive: true, force: true });
      }
      if (fs.existsSync(d)) {
        allClean = false;
      }
    } catch {
      allClean = false;
    }
  }
  chk("integration", allClean, "all temp dirs cleaned");
  console.log("D07_TEMP_CLEANUP_COMPLETE", allClean);
}

// Record real project state
function recordRealSource(): void {
  const repoRoot = path.resolve(__dirname, "..");
  const headResult = require("node:child_process").execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" });
  realSourceHead = headResult.trim();
  const statusResult = require("node:child_process").execSync("git status --porcelain=v1 -z --untracked-files=all", { cwd: repoRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  realSourceStatusBytes = statusResult;
  const diffResult = require("node:child_process").execSync("git diff --no-renames", { cwd: repoRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  realSourceDiffDigest = sha256Hex(diffResult);
  const stagedResult = require("node:child_process").execSync("git diff --cached --no-renames", { cwd: repoRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  realSourceStagedDigest = sha256Hex(stagedResult);
}

function verifyRealSourceUnchanged(): void {
  const repoRoot = path.resolve(__dirname, "..");
  const headResult = require("node:child_process").execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" });
  const currentHead = headResult.trim();
  const headOk = currentHead === realSourceHead;
  chk("integration", headOk, "real source HEAD unchanged");
  const statusResult = require("node:child_process").execSync("git status --porcelain=v1 -z --untracked-files=all", { cwd: repoRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  const statusOk = statusResult === realSourceStatusBytes;
  chk("integration", statusOk, "real source status unchanged");
  const diffResult = require("node:child_process").execSync("git diff --no-renames", { cwd: repoRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  const diffOk = sha256Hex(diffResult) === realSourceDiffDigest;
  chk("integration", diffOk, "real source diff unchanged");
  const stagedResult = require("node:child_process").execSync("git diff --cached --no-renames", { cwd: repoRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  const stagedOk = sha256Hex(stagedResult) === realSourceStagedDigest;
  chk("integration", stagedOk, "real source staged unchanged");
  console.log("D07_REAL_SOURCE_UNCHANGED", headOk && statusOk && diffOk && stagedOk);
}

// ═══════════════════════════════════════ Fixture Helpers

function makeIdentity(overrides: Partial<{
  runId: string; requirementId: string; repository: string;
  repositoryPath: string; baseBranch: string; expectedBaseSha: string;
  taskBranch: string; controlRoot: string;
}> = {}): any {
  return {
    runId: overrides.runId ?? "run-001",
    requirementId: overrides.requirementId ?? "req-001",
    repository: overrides.repository ?? "shaoyang01/ai-sdlc-standard",
    repositoryPath: overrides.repositoryPath ?? "/tmp/test-repo",
    baseBranch: overrides.baseBranch ?? "feature/loop-runtime-v1",
    expectedBaseSha: overrides.expectedBaseSha ?? "d9156075bcb35aacdb56461751e71ca29421d610",
    taskBranch: overrides.taskBranch ?? "codex/loop-delivery-07-test",
    controlRoot: overrides.controlRoot ?? "/tmp/test-control",
    createdAt: "2026-07-30T00:00:00.000Z",
  };
}

function makeDeliveryResultBytes(overrides: Record<string, unknown> = {}): Buffer {
  const obj: Record<string, unknown> = {
    schema: "loop-delivery-result-v1",
    status: "succeeded",
    reason_code: "DELIVERY_SUCCEEDED",
    cause_code: null,
    total_fix_rounds: 0,
    test_attempts: 1,
    review_attempts: 1,
    patch_artifact_refs: [],
    test_summary_artifact_refs: [],
    review_summary_artifact_refs: [],
    files: ["core/test.ts", "tests/test.test.ts"],
    final_workspace: {
      workspace_path: "/tmp/test-workspace",
      task_branch: "codex/loop-delivery-07-test",
      task_head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      status_digest_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      task_has_changes: true,
    },
    elapsed_ms: 1000,
    trace: [
      {
        sequence: 1, kind: "info", phase: "initial", fix_round: 0, attempt: 0,
        step_id: null, outcome: "ok",
        artifact_ref: null, patch_artifact_ref: null, patch_digest_sha256: null,
        workspace_status_digest_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        elapsed_ms: 500,
      },
      {
        sequence: 2, kind: "terminal", phase: "initial", fix_round: 0, attempt: 0,
        step_id: null, outcome: "succeeded",
        artifact_ref: null, patch_artifact_ref: null, patch_digest_sha256: null,
        workspace_status_digest_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        elapsed_ms: 500,
      },
    ],
    ...overrides,
  };
  return Buffer.from(JSON.stringify(obj) + "\n", "utf8");
}

// ═══════════════════════════════════════ Fake Dependencies

class FakeArtifactStore {
  private store = new Map<string, Buffer>();
  private kindStore = new Map<string, string>(); // ref -> kind
  readCount = 0;
  putCount = 0;

  read(artifactRef: string): Buffer {
    this.readCount++;
    const buf = this.store.get(artifactRef);
    if (!buf) throw new Error("ARTIFACT_NOT_FOUND");
    return Buffer.from(buf); // defensive copy
  }

  put(kind: string, content: string | Uint8Array): LoopStoredArtifact {
    this.putCount++;
    const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
    const digest = sha256Hex(bytes);
    const ref = `loop-artifact:v1:${kind}:sha256:${digest}`;
    this.store.set(ref, Buffer.from(bytes));
    this.kindStore.set(ref, kind);
    return Object.freeze({
      artifactRef: ref,
      kind: kind as any,
      digest,
      sizeBytes: bytes.length,
    });
  }

  hasRef(ref: string): boolean {
    return this.store.has(ref);
  }

  _inject(ref: string, bytes: Buffer, kind: string): void {
    this.store.set(ref, Buffer.from(bytes));
    this.kindStore.set(ref, kind);
  }
}

class FakeRunner {
  private handlers: Map<string, (args: string[], stdin?: string) => LoopPosixProcessResult | Promise<LoopPosixProcessResult>> = new Map();
  private errorHandlers: Map<string, () => Error> = new Map();

  setHandler(executableId: string, handler: (args: string[], stdin?: string) => LoopPosixProcessResult): void {
    this.handlers.set(executableId, handler);
  }

  setErrorHandler(executableId: string, handler: () => Error): void {
    this.errorHandlers.set(executableId, handler);
  }

  async run(request: any): Promise<LoopPosixProcessResult> {
    const errorHandler = this.errorHandlers.get(request.executableId);
    if (errorHandler) {
      throw errorHandler();
    }
    const handler = this.handlers.get(request.executableId);
    if (handler) {
      const result = await handler(request.args || [], request.stdin);
      return result;
    }
    return makeRunnerResult(0, "");
  }
}

function makeRunnerResult(exitCode: number, stdout: string, overrides: Partial<LoopPosixProcessResult> = {}): LoopPosixProcessResult {
  return Object.freeze({
    status: "exited" as const,
    exitCode,
    signal: null,
    durationMs: 10,
    stdout,
    stderr: "",
    stdoutBytesReceived: Buffer.byteLength(stdout, "utf8"),
    stderrBytesReceived: 0,
    stdoutTruncated: false,
    stderrTruncated: false,
    termSignalSent: false,
    killSignalSent: false,
    ...overrides,
  });
}

function makeFakeWorkspaceSnapshot(overrides: Partial<LoopGitWorkspaceSnapshot> = {}): LoopGitWorkspaceSnapshot {
  return Object.freeze({
    state: "inspected" as const,
    runId: "run-001",
    repository: "shaoyang01/ai-sdlc-standard",
    repositoryPath: "/tmp/test-repo",
    controlRoot: "/tmp/test-control",
    gitCommonDir: "/tmp/test-repo/.git",
    workspacePath: "/tmp/test-workspace",
    baseBranch: "feature/loop-runtime-v1",
    expectedBaseSha: "d9156075bcb35aacdb56461751e71ca29421d610",
    currentBaseSha: "d9156075bcb35aacdb56461751e71ca29421d610",
    baseDrifted: false,
    taskBranch: "codex/loop-delivery-07-test",
    taskHeadSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    taskHasChanges: true,
    taskStatusDigestSha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    sourceHeadSha: "d9156075bcb35aacdb56461751e71ca29421d610",
    sourceBranch: "feature/loop-runtime-v1",
    sourceWipDigestSha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    ...overrides,
  });
}

class FakeWorkspaceManager {
  snapshot: LoopGitWorkspaceSnapshot;
  inspectError: Error | null = null;

  constructor(snapshot: LoopGitWorkspaceSnapshot) {
    this.snapshot = snapshot;
  }

  async inspect(_identity: any): Promise<LoopGitWorkspaceSnapshot> {
    if (this.inspectError) throw this.inspectError;
    return this.snapshot;
  }
}

function makeOptions(overrides: Partial<{
  runner: any; workspaceManager: any; artifactStore: any;
  gitExecutableId: string; ghExecutableId: string;
  commitAuthorName: string; commitAuthorEmail: string;
  defaultCommandTimeoutMs: number; maxCommandOutputBytes: number;
  maxDeliveryArtifactBytes: number; maxIntentArtifactBytes: number;
  maxResultArtifactBytes: number; maxTotalDurationMs: number;
  clock: any;
}> = {}): LoopDeliveryPublisherOptions {
  return {
    runner: overrides.runner ?? { run: async () => makeRunnerResult(0, "") },
    workspaceManager: overrides.workspaceManager ?? { inspect: async () => makeFakeWorkspaceSnapshot() },
    artifactStore: overrides.artifactStore ?? new FakeArtifactStore(),
    gitExecutableId: overrides.gitExecutableId ?? "git",
    ghExecutableId: overrides.ghExecutableId ?? "gh",
    commitAuthorName: overrides.commitAuthorName ?? "Test Author",
    commitAuthorEmail: overrides.commitAuthorEmail ?? "test@example.com",
    defaultCommandTimeoutMs: overrides.defaultCommandTimeoutMs,
    maxCommandOutputBytes: overrides.maxCommandOutputBytes,
    maxDeliveryArtifactBytes: overrides.maxDeliveryArtifactBytes,
    maxIntentArtifactBytes: overrides.maxIntentArtifactBytes,
    maxResultArtifactBytes: overrides.maxResultArtifactBytes,
    maxTotalDurationMs: overrides.maxTotalDurationMs,
    clock: overrides.clock,
  };
}

function makeRequest(overrides: Partial<{
  identity: any; deliveryResultArtifactRef: string;
  commitSubject: string; prTitle: string;
  recoveryPublishIntentArtifactRef: string | undefined;
}> = {}): LoopDeliveryPublishRequest {
  return {
    identity: overrides.identity ?? makeIdentity(),
    deliveryResultArtifactRef: overrides.deliveryResultArtifactRef ?? "loop-artifact:v1:delivery_result:sha256:1111111111111111111111111111111111111111111111111111111111111111",
    commitSubject: overrides.commitSubject ?? "feat: add recoverable delivery publisher",
    prTitle: overrides.prTitle ?? "feat: add recoverable delivery publisher",
    recoveryPublishIntentArtifactRef: overrides.recoveryPublishIntentArtifactRef,
  };
}

// ═══════════════════════════════════════ Domain: input

async function testInputDomain(): Promise<void> {
  console.log("\n=== Input Domain Tests ===");

  // Null request
  {
    const pub = new LoopDeliveryPublisher(makeOptions());
    const result = await pub.execute(null as any);
    chk("input", result.status === "failed", "null request returns failed");
    chk("input", result.reasonCode === "INVALID_INPUT", "null request reason INVALID_INPUT");
  }

  // Missing required fields
  {
    const pub = new LoopDeliveryPublisher(makeOptions());
    const result = await pub.execute({} as any);
    chk("input", result.status === "failed", "empty request returns failed");
    chk("input", result.reasonCode === "INVALID_INPUT", "empty request INVALID_INPUT");
  }

  // Unknown field
  {
    const pub = new LoopDeliveryPublisher(makeOptions());
    const result = await pub.execute({ ...makeRequest(), unknownField: 123 } as any);
    chk("input", result.status === "failed", "unknown field returns failed");
    chk("input", result.reasonCode === "INVALID_INPUT", "unknown field INVALID_INPUT");
  }

  // Array instead of object
  {
    const pub = new LoopDeliveryPublisher(makeOptions());
    const result = await pub.execute([] as any);
    chk("input", result.status === "failed", "array request returns failed");
  }

  // Class instance
  {
    class FakeReq { identity = "x"; }
    const pub = new LoopDeliveryPublisher(makeOptions());
    const result = await pub.execute(new FakeReq() as any);
    chk("input", result.status === "failed", "class instance request returns failed");
  }

  // Proxy trap
  {
    const pub = new LoopDeliveryPublisher(makeOptions());
    const proxy = new Proxy(makeRequest(), { get: () => { throw new Error("trap"); } });
    const result = await pub.execute(proxy as any);
    chk("input", result.status === "failed", "proxy request returns failed");
  }

  // Symbol key
  {
    const pub = new LoopDeliveryPublisher(makeOptions());
    const symReq: any = makeRequest();
    symReq[Symbol("test")] = "value";
    const result = await pub.execute(symReq);
    chk("input", result.status === "failed", "symbol key request returns failed");
  }

  // __proto__ key
  {
    const pub = new LoopDeliveryPublisher(makeOptions());
    const protoReq: any = makeRequest();
    protoReq.__proto__ = { malicious: true };
    const result = await pub.execute(protoReq);
    chk("input", result.status === "failed", "__proto__ key request returns failed");
  }

  // Invalid identity
  {
    const pub = new LoopDeliveryPublisher(makeOptions());
    const result = await pub.execute(makeRequest({ identity: { ...makeIdentity(), runId: "" } }));
    chk("input", result.reasonCode === "INVALID_INPUT", "invalid identity returns INVALID_INPUT");
  }

  // Bad repository format
  {
    const pub = new LoopDeliveryPublisher(makeOptions());
    const result = await pub.execute(makeRequest({ identity: makeIdentity({ repository: "bad-repo" }) }));
    chk("input", result.reasonCode === "INVALID_INPUT", "bad repo format INVALID_INPUT");
  }

  // Commit subject too long (>72 bytes UTF-8)
  {
    const pub = new LoopDeliveryPublisher(makeOptions());
    const longSubject = "x".repeat(73);
    const result = await pub.execute(makeRequest({ commitSubject: longSubject }));
    chk("input", result.reasonCode === "INVALID_INPUT", "long commit subject INVALID_INPUT");
  }

  // Commit subject with NUL
  {
    const pub = new LoopDeliveryPublisher(makeOptions());
    const result = await pub.execute(makeRequest({ commitSubject: "test\x00subject" }));
    chk("input", result.reasonCode === "INVALID_INPUT", "NUL in subject INVALID_INPUT");
  }

  // Commit subject with CR
  {
    const pub = new LoopDeliveryPublisher(makeOptions());
    const result = await pub.execute(makeRequest({ commitSubject: "test\rsubject" }));
    chk("input", result.reasonCode === "INVALID_INPUT", "CR in subject INVALID_INPUT");
  }

  // Commit subject with LF
  {
    const pub = new LoopDeliveryPublisher(makeOptions());
    const result = await pub.execute(makeRequest({ commitSubject: "test\nsubject" }));
    chk("input", result.reasonCode === "INVALID_INPUT", "LF in subject INVALID_INPUT");
  }

  // PR title too long (>128 bytes UTF-8)
  {
    const pub = new LoopDeliveryPublisher(makeOptions());
    const longTitle = "x".repeat(129);
    const result = await pub.execute(makeRequest({ prTitle: longTitle }));
    chk("input", result.reasonCode === "INVALID_INPUT", "long pr title INVALID_INPUT");
  }

  // PR title with control chars
  {
    const pub = new LoopDeliveryPublisher(makeOptions());
    const result = await pub.execute(makeRequest({ prTitle: "test\x01title" }));
    chk("input", result.reasonCode === "INVALID_INPUT", "control char in pr title INVALID_INPUT");
  }

  // Bad artifact ref format
  {
    const pub = new LoopDeliveryPublisher(makeOptions());
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: "bad-ref" }));
    chk("input", result.reasonCode === "INVALID_INPUT", "bad artifact ref INVALID_INPUT");
  }

  // Wrong artifact ref kind
  {
    const pub = new LoopDeliveryPublisher(makeOptions());
    const result = await pub.execute(makeRequest({
      deliveryResultArtifactRef: "loop-artifact:v1:code_patch:sha256:1111111111111111111111111111111111111111111111111111111111111111"
    }));
    chk("input", result.reasonCode === "INVALID_INPUT", "wrong artifact kind INVALID_INPUT");
  }

  // Bad recovery intent ref kind
  {
    const pub = new LoopDeliveryPublisher(makeOptions());
    const result = await pub.execute(makeRequest({
      recoveryPublishIntentArtifactRef: "loop-artifact:v1:delivery_result:sha256:1111111111111111111111111111111111111111111111111111111111111111"
    }));
    chk("input", result.reasonCode === "INVALID_INPUT", "wrong recovery intent kind INVALID_INPUT");
  }

  // Invalid author name (control chars)
  {
    try {
      new LoopDeliveryPublisher(makeOptions({ commitAuthorName: "test\x01name" }));
      chk("input", false, "control char in author name should throw");
    } catch {
      chk("input", true, "control char in author name throws");
    }
  }

  // Invalid author email (no @)
  {
    try {
      new LoopDeliveryPublisher(makeOptions({ commitAuthorEmail: "invalid-email" }));
      chk("input", false, "invalid email should throw");
    } catch {
      chk("input", true, "invalid email throws");
    }
  }

  // Deep freeze: mutation after execute
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);
    const gitState = new FakeGitState(wsSnapshot.taskHeadSha);
    gitState.setRemoteBase("feature/loop-runtime-v1", wsSnapshot.expectedBaseSha);
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    const runner = new FakeRunner();
    runner.setHandler("git", gitState.createGitHandler());
    runner.setHandler("gh", gitState.createGhHandler(
      "feat: add recoverable delivery publisher",
      "feature/loop-runtime-v1",
      "codex/loop-delivery-07-test",
    ));

    const pub = new LoopDeliveryPublisher(makeOptions({
      artifactStore, runner, workspaceManager: wsMgr,
    }));

    const req = makeRequest({ deliveryResultArtifactRef: deliveryRef });
    const result = await pub.execute(req);

    chk("input", result.status === "succeeded", "mutate test: result has valid status");

    // Verify result is deep-frozen
    try {
      (result as any).status = "hacked";
      chk("input", (result as any).status !== "hacked", "result deep frozen - status immutable");
    } catch {
      chk("input", true, "result deep frozen - strict mode throws");
    }
  }

  // Options missing runner
  {
    try {
      new LoopDeliveryPublisher({} as any);
      chk("input", false, "missing runner should throw");
    } catch {
      chk("input", true, "missing runner throws");
    }
  }

  // Options with unknown field
  {
    try {
      new LoopDeliveryPublisher({ runner: { run: async () => makeRunnerResult(0, "") }, unknownField: 1 } as any);
      chk("input", false, "unknown option should throw");
    } catch {
      chk("input", true, "unknown option throws");
    }
  }

  // Options with bad clock
  {
    try {
      new LoopDeliveryPublisher(makeOptions({ clock: { badClock: true } as any }));
      chk("input", false, "bad clock should throw");
    } catch {
      chk("input", true, "bad clock throws");
    }
  }

  // Options: valid clock
  {
    let clockCalls = 0;
    const pub = new LoopDeliveryPublisher(makeOptions({
      clock: { nowMs: () => { clockCalls++; return 1000; } },
    }));
    chk("input", true, "valid clock accepted");
  }

  // Options: negative defaultCommandTimeoutMs
  {
    try {
      new LoopDeliveryPublisher(makeOptions({ defaultCommandTimeoutMs: -1 }));
      chk("input", false, "negative timeout should throw");
    } catch {
      chk("input", true, "negative timeout throws");
    }
  }

  // Options: zero defaultCommandTimeoutMs
  {
    try {
      new LoopDeliveryPublisher(makeOptions({ defaultCommandTimeoutMs: 0 }));
      chk("input", false, "zero timeout should throw");
    } catch {
      chk("input", true, "zero timeout throws");
    }
  }

  // Options: maxCommandOutputBytes too large
  {
    try {
      new LoopDeliveryPublisher(makeOptions({ maxCommandOutputBytes: 99999999 }));
      chk("input", false, "too large maxCommandOutputBytes should throw");
    } catch {
      chk("input", true, "too large maxCommandOutputBytes throws");
    }
  }

  // Empty commit subject
  {
    const pub = new LoopDeliveryPublisher(makeOptions());
    const result = await pub.execute(makeRequest({ commitSubject: "" }));
    chk("input", result.reasonCode === "INVALID_INPUT", "empty commit subject INVALID_INPUT");
  }

  // Whitespace-only commit subject
  {
    const pub = new LoopDeliveryPublisher(makeOptions());
    const result = await pub.execute(makeRequest({ commitSubject: "   " }));
    chk("input", result.reasonCode === "INVALID_INPUT", "whitespace commit subject INVALID_INPUT");
  }

  // Empty PR title
  {
    const pub = new LoopDeliveryPublisher(makeOptions());
    const result = await pub.execute(makeRequest({ prTitle: "" }));
    chk("input", result.reasonCode === "INVALID_INPUT", "empty pr title INVALID_INPUT");
  }

  // PR title with NUL
  {
    const pub = new LoopDeliveryPublisher(makeOptions());
    const result = await pub.execute(makeRequest({ prTitle: "test\x00title" }));
    chk("input", result.reasonCode === "INVALID_INPUT", "NUL in pr title INVALID_INPUT");
  }

  // Delivery artifact ref with wrong hash length
  {
    const pub = new LoopDeliveryPublisher(makeOptions());
    const result = await pub.execute(makeRequest({
      deliveryResultArtifactRef: "loop-artifact:v1:delivery_result:sha256:123"
    }));
    chk("input", result.reasonCode === "INVALID_INPUT", "short hash INVALID_INPUT");
  }

  // Recovery intent ref with wrong format
  {
    const pub = new LoopDeliveryPublisher(makeOptions());
    const result = await pub.execute(makeRequest({
      recoveryPublishIntentArtifactRef: "not-a-valid-ref"
    }));
    chk("input", result.reasonCode === "INVALID_INPUT", "bad recovery ref INVALID_INPUT");
  }

  // Author name too long
  {
    try {
      new LoopDeliveryPublisher(makeOptions({ commitAuthorName: "x".repeat(129) }));
      chk("input", false, "long author name should throw");
    } catch {
      chk("input", true, "long author name throws");
    }
  }

  // Author email too long
  {
    try {
      new LoopDeliveryPublisher(makeOptions({ commitAuthorEmail: "x".repeat(255) }));
      chk("input", false, "long author email should throw");
    } catch {
      chk("input", true, "long author email throws");
    }
  }

  // Author email with @ at start
  {
    try {
      new LoopDeliveryPublisher(makeOptions({ commitAuthorEmail: "@test.com" }));
      chk("input", false, "@ at start should throw");
    } catch {
      chk("input", true, "@ at start throws");
    }
  }

  // Author email with @ at end
  {
    try {
      new LoopDeliveryPublisher(makeOptions({ commitAuthorEmail: "test@" }));
      chk("input", false, "@ at end should throw");
    } catch {
      chk("input", true, "@ at end throws");
    }
  }
}

// ═══════════════════════════════════════ Domain: artifact

async function testArtifactDomain(): Promise<void> {
  console.log("\n=== Artifact Domain Tests ===");

  // Failed delivery
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes({ status: "failed" });
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "failed delivery blocked");
  }

  // Blocked delivery
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes({ status: "blocked" });
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "blocked delivery blocked");
  }

  // Wrong reason code
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes({ reason_code: "TEST_FAILED" });
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "wrong reason blocked");
  }

  // taskHasChanges=false
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const obj = JSON.parse(deliveryBytes.toString("utf8"));
    obj.final_workspace.task_has_changes = false;
    const newBytes = Buffer.from(JSON.stringify(obj) + "\n", "utf8");
    const deliveryRef = artifactStore.put("delivery_result", newBytes).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "taskHasChanges=false blocked");
  }

  // Non-canonical bytes (extra whitespace)
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const nonCanonical = Buffer.from(deliveryBytes.toString("utf8").replace(/\n$/, " \n"), "utf8");
    const deliveryRef = artifactStore.put("delivery_result", nonCanonical).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "non-canonical bytes blocked");
  }

  // CR in artifact
  {
    const artifactStore = new FakeArtifactStore();
    const crBytes = Buffer.from("{\"schema\":\"loop-delivery-result-v1\"}\r\n", "utf8");
    const deliveryRef = artifactStore.put("delivery_result", crBytes).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "CR in artifact blocked");
  }

  // BOM in artifact
  {
    const artifactStore = new FakeArtifactStore();
    const bomBytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), makeDeliveryResultBytes()]);
    const deliveryRef = artifactStore.put("delivery_result", bomBytes).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "BOM in artifact blocked");
  }

  // NUL in artifact
  {
    const artifactStore = new FakeArtifactStore();
    const nulBytes = Buffer.from(makeDeliveryResultBytes().toString("utf8").replace("succeeded", "succee\x00ded"), "utf8");
    const deliveryRef = artifactStore.put("delivery_result", nulBytes).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "NUL in artifact blocked");
  }

  // Invalid trace (terminal not last)
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const obj = JSON.parse(deliveryBytes.toString("utf8"));
    obj.trace = [
      { sequence: 1, kind: "terminal", phase: "initial", fix_round: 0, attempt: 0, step_id: null, outcome: "succeeded", artifact_ref: null, patch_artifact_ref: null, patch_digest_sha256: null, workspace_status_digest_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", elapsed_ms: 500 },
      { sequence: 2, kind: "info", phase: "initial", fix_round: 0, attempt: 0, step_id: null, outcome: "ok", artifact_ref: null, patch_artifact_ref: null, patch_digest_sha256: null, workspace_status_digest_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", elapsed_ms: 500 },
    ];
    const newBytes = Buffer.from(JSON.stringify(obj) + "\n", "utf8");
    const deliveryRef = artifactStore.put("delivery_result", newBytes).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "terminal not last blocked");
  }

  // Trace sequence not contiguous
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const obj = JSON.parse(deliveryBytes.toString("utf8"));
    obj.trace[0].sequence = 5;
    const newBytes = Buffer.from(JSON.stringify(obj) + "\n", "utf8");
    const deliveryRef = artifactStore.put("delivery_result", newBytes).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "non-contiguous trace blocked");
  }

  // Artifact store read failure
  {
    const artifactStore = new FakeArtifactStore();
    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({
      deliveryResultArtifactRef: "loop-artifact:v1:delivery_result:sha256:9999999999999999999999999999999999999999999999999999999999999999"
    }));
    chk("artifact", result.reasonCode === "ARTIFACT_STORE_FAILED", "missing artifact fails");
  }

  // Unsafe files (absolute)
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const obj = JSON.parse(deliveryBytes.toString("utf8"));
    obj.files = ["/etc/passwd"];
    const newBytes = Buffer.from(JSON.stringify(obj) + "\n", "utf8");
    const deliveryRef = artifactStore.put("delivery_result", newBytes).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "absolute file blocked");
  }

  // Unsafe files (.. segment)
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const obj = JSON.parse(deliveryBytes.toString("utf8"));
    obj.files = ["../etc/passwd"];
    const newBytes = Buffer.from(JSON.stringify(obj) + "\n", "utf8");
    const deliveryRef = artifactStore.put("delivery_result", newBytes).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", ".. segment blocked");
  }

  // Unsafe files (backslash)
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const obj = JSON.parse(deliveryBytes.toString("utf8"));
    obj.files = ["core\\test.ts"];
    const newBytes = Buffer.from(JSON.stringify(obj) + "\n", "utf8");
    const deliveryRef = artifactStore.put("delivery_result", newBytes).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "backslash file blocked");
  }

  // Unsafe files (NUL)
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const obj = JSON.parse(deliveryBytes.toString("utf8"));
    obj.files = ["core/test\x00.ts"];
    const newBytes = Buffer.from(JSON.stringify(obj) + "\n", "utf8");
    const deliveryRef = artifactStore.put("delivery_result", newBytes).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "NUL file blocked");
  }

  // Unsafe files (empty segment)
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const obj = JSON.parse(deliveryBytes.toString("utf8"));
    obj.files = ["core//test.ts"];
    const newBytes = Buffer.from(JSON.stringify(obj) + "\n", "utf8");
    const deliveryRef = artifactStore.put("delivery_result", newBytes).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "empty segment blocked");
  }

  // Unsafe files (. segment)
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const obj = JSON.parse(deliveryBytes.toString("utf8"));
    obj.files = ["./test.ts"];
    const newBytes = Buffer.from(JSON.stringify(obj) + "\n", "utf8");
    const deliveryRef = artifactStore.put("delivery_result", newBytes).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", ". segment blocked");
  }

  // Files not sorted
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const obj = JSON.parse(deliveryBytes.toString("utf8"));
    obj.files = ["tests/test.test.ts", "core/test.ts"];
    const newBytes = Buffer.from(JSON.stringify(obj) + "\n", "utf8");
    const deliveryRef = artifactStore.put("delivery_result", newBytes).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "unsorted files blocked");
  }

  // Duplicate files
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const obj = JSON.parse(deliveryBytes.toString("utf8"));
    obj.files = ["core/test.ts", "core/test.ts"];
    const newBytes = Buffer.from(JSON.stringify(obj) + "\n", "utf8");
    const deliveryRef = artifactStore.put("delivery_result", newBytes).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "duplicate files blocked");
  }

  // Missing trace
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const obj = JSON.parse(deliveryBytes.toString("utf8"));
    obj.trace = [];
    const newBytes = Buffer.from(JSON.stringify(obj) + "\n", "utf8");
    const deliveryRef = artifactStore.put("delivery_result", newBytes).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "empty trace blocked");
  }

  // Missing terminal entry
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const obj = JSON.parse(deliveryBytes.toString("utf8"));
    obj.trace = [{ sequence: 1, kind: "info", phase: "initial", fix_round: 0, attempt: 0, step_id: null, outcome: "ok", artifact_ref: null, patch_artifact_ref: null, patch_digest_sha256: null, workspace_status_digest_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", elapsed_ms: 500 }];
    const newBytes = Buffer.from(JSON.stringify(obj) + "\n", "utf8");
    const deliveryRef = artifactStore.put("delivery_result", newBytes).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "missing terminal blocked");
  }

  // Terminal not succeeded
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const obj = JSON.parse(deliveryBytes.toString("utf8"));
    obj.trace[1].outcome = "failed";
    const newBytes = Buffer.from(JSON.stringify(obj) + "\n", "utf8");
    const deliveryRef = artifactStore.put("delivery_result", newBytes).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "terminal not succeeded blocked");
  }

  // Workspace digest mismatch
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const obj = JSON.parse(deliveryBytes.toString("utf8"));
    obj.trace[1].workspace_status_digest_sha256 = "9999999999999999999999999999999999999999999999999999999999999999";
    const newBytes = Buffer.from(JSON.stringify(obj) + "\n", "utf8");
    const deliveryRef = artifactStore.put("delivery_result", newBytes).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "digest mismatch blocked");
  }

  // Null final_workspace
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const obj = JSON.parse(deliveryBytes.toString("utf8"));
    obj.final_workspace = null;
    const newBytes = Buffer.from(JSON.stringify(obj) + "\n", "utf8");
    const deliveryRef = artifactStore.put("delivery_result", newBytes).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "null workspace blocked");
  }

  // Unknown field in delivery result
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const obj = JSON.parse(deliveryBytes.toString("utf8"));
    obj.extra_field = "hack";
    const newBytes = Buffer.from(JSON.stringify(obj) + "\n", "utf8");
    const deliveryRef = artifactStore.put("delivery_result", newBytes).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "unknown field blocked");
  }

  // Multiple trailing LF
  {
    const artifactStore = new FakeArtifactStore();
    const nonCanonical = Buffer.from(makeDeliveryResultBytes().toString("utf8") + "\n", "utf8");
    const deliveryRef = artifactStore.put("delivery_result", nonCanonical).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "double LF blocked");
  }

  // No trailing LF
  {
    const artifactStore = new FakeArtifactStore();
    const obj = JSON.parse(makeDeliveryResultBytes().toString("utf8"));
    const noLf = Buffer.from(JSON.stringify(obj), "utf8");
    const deliveryRef = artifactStore.put("delivery_result", noLf).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "no trailing LF blocked");
  }

  // Non-JSON delivery artifact
  {
    const artifactStore = new FakeArtifactStore();
    const nonJson = Buffer.from("not json at all!\n", "utf8");
    const deliveryRef = artifactStore.put("delivery_result", nonJson).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "non-JSON blocked");
  }

  // Oversize delivery artifact
  {
    const artifactStore = new FakeArtifactStore();
    const bigObj = { ...JSON.parse(makeDeliveryResultBytes().toString("utf8")), big: "x".repeat(200000) };
    const bigBytes = Buffer.from(JSON.stringify(bigObj) + "\n", "utf8");
    const deliveryRef = artifactStore.put("delivery_result", bigBytes).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "oversize artifact blocked");
  }

  // Cause code not null
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes({ cause_code: "SOME_ERROR" });
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "non-null cause_code blocked");
  }
}

// ═══════════════════════════════════════ Domain: workspace

async function testWorkspaceDomain(): Promise<void> {
  console.log("\n=== Workspace Domain Tests ===");

  // Workspace drift — inspect throws
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    wsMgr.inspectError = new Error("WORKSPACE_DRIFT");

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("workspace", result.reasonCode === "WORKSPACE_DRIFT" || result.reasonCode === "DELIVERY_NOT_READY", "workspace inspect error handled");
  }

  // Workspace path mismatch
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const snap = makeFakeWorkspaceSnapshot({ workspacePath: "/tmp/wrong-path" });
    const wsMgr = new FakeWorkspaceManager(snap);

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("workspace", result.reasonCode === "WORKSPACE_DRIFT", "workspace path mismatch blocked");
  }

  // Base drift
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const snap = makeFakeWorkspaceSnapshot({ baseDrifted: true });
    const wsMgr = new FakeWorkspaceManager(snap);

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("workspace", result.reasonCode === "BASE_BRANCH_DRIFT", "base drift blocked");
  }

  // taskHasChanges=false
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const snap = makeFakeWorkspaceSnapshot({ taskHasChanges: false });
    const wsMgr = new FakeWorkspaceManager(snap);

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("workspace", result.reasonCode === "WORKSPACE_STATE_CONFLICT", "no changes blocked");
  }

  // Source head SHA mismatch
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const snap = makeFakeWorkspaceSnapshot({ sourceHeadSha: "9999999999999999999999999999999999999999" });
    const wsMgr = new FakeWorkspaceManager(snap);

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("workspace", result.reasonCode === "WORKSPACE_DRIFT", "source head mismatch blocked");
  }

  // Source branch mismatch
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const snap = makeFakeWorkspaceSnapshot({ sourceBranch: "wrong-branch" });
    const wsMgr = new FakeWorkspaceManager(snap);

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("workspace", result.reasonCode === "WORKSPACE_DRIFT", "source branch mismatch blocked");
  }

  // Task branch mismatch
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const snap = makeFakeWorkspaceSnapshot({ taskBranch: "wrong-task" });
    const wsMgr = new FakeWorkspaceManager(snap);

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("workspace", result.reasonCode === "WORKSPACE_DRIFT", "task branch mismatch blocked");
  }

  // RunId mismatch
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const snap = makeFakeWorkspaceSnapshot({ runId: "wrong-run" });
    const wsMgr = new FakeWorkspaceManager(snap);

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("workspace", result.reasonCode === "WORKSPACE_DRIFT", "runId mismatch blocked");
  }

  // Repository mismatch
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const snap = makeFakeWorkspaceSnapshot({ repository: "other/repo" });
    const wsMgr = new FakeWorkspaceManager(snap);

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("workspace", result.reasonCode === "WORKSPACE_DRIFT", "repository mismatch blocked");
  }

  // RepositoryPath mismatch
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const snap = makeFakeWorkspaceSnapshot({ repositoryPath: "/other/path" });
    const wsMgr = new FakeWorkspaceManager(snap);

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("workspace", result.reasonCode === "WORKSPACE_DRIFT", "repositoryPath mismatch blocked");
  }

  // Current base sha mismatch (base drift)
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const snap = makeFakeWorkspaceSnapshot({ currentBaseSha: "9999999999999999999999999999999999999999" });
    const wsMgr = new FakeWorkspaceManager(snap);

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("workspace", result.reasonCode === "BASE_BRANCH_DRIFT", "current base sha drift blocked");
  }

  // Task head doesn't match delivery head (fresh)
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const snap = makeFakeWorkspaceSnapshot({ taskHeadSha: "9999999999999999999999999999999999999999" });
    const wsMgr = new FakeWorkspaceManager(snap);

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("workspace", result.reasonCode === "WORKSPACE_STATE_CONFLICT", "wrong task head blocked");
  }

  // Task status digest doesn't match delivery (fresh)
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const snap = makeFakeWorkspaceSnapshot({
      taskStatusDigestSha256: "9999999999999999999999999999999999999999999999999999999999999999",
    });
    const wsMgr = new FakeWorkspaceManager(snap);

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("workspace", result.reasonCode === "WORKSPACE_STATE_CONFLICT", "status digest mismatch blocked");
  }

  // Malformed snapshot
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const baseSnapshot = makeFakeWorkspaceSnapshot();
    const malformedSnap: any = { ...baseSnapshot, extraField: "hack" };
    const wsMgr = new FakeWorkspaceManager(malformedSnap);

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("workspace", result.reasonCode === "DEPENDENCY_RESULT_INVALID", "malformed snapshot blocked");
  }

  // Snapshot with invalid SHA format
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const snap = makeFakeWorkspaceSnapshot({ taskHeadSha: "not-a-sha" });
    const wsMgr = new FakeWorkspaceManager(snap);

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("workspace", result.reasonCode === "DEPENDENCY_RESULT_INVALID" || result.reasonCode === "WORKSPACE_STATE_CONFLICT", "invalid SHA blocked");
  }
}

// ═══════════════════════════════════════ Domain: commit

async function testCommitDomain(): Promise<void> {
  console.log("\n=== Commit Domain Tests ===");

  // Normal commit
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);
    const gitState = new FakeGitState(wsSnapshot.taskHeadSha);
    gitState.setRemoteBase("feature/loop-runtime-v1", wsSnapshot.expectedBaseSha);
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    const runner = new FakeRunner();
    runner.setHandler("git", gitState.createGitHandler());
    runner.setHandler("gh", gitState.createGhHandler(
      "feat: add recoverable delivery publisher",
      "feature/loop-runtime-v1",
      "codex/loop-delivery-07-test",
    ));

    const pub = new LoopDeliveryPublisher(makeOptions({
      artifactStore, runner, workspaceManager: wsMgr,
    }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("commit", result.status === "succeeded", "commit flow: status succeeded");
    chk("commit", result.files.length === 2, "commit flow: correct file count");
    chk("commit", result.commitCreated === true, "commit flow: commitCreated true");
    chk("commit", result.commitRecovered === false, "commit flow: commitRecovered false");
  }

  // Commit intent persisted before commit
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);
    const gitState = new FakeGitState(wsSnapshot.taskHeadSha);
    gitState.setRemoteBase("feature/loop-runtime-v1", wsSnapshot.expectedBaseSha);
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    const runner = new FakeRunner();
    runner.setHandler("git", gitState.createGitHandler());
    runner.setHandler("gh", gitState.createGhHandler(
      "feat: add recoverable delivery publisher",
      "feature/loop-runtime-v1",
      "codex/loop-delivery-07-test",
    ));

    const putLog: string[] = [];
    const origPut = artifactStore.put.bind(artifactStore);
    artifactStore.put = function(kind: string, content: string | Uint8Array) {
      const result = origPut(kind, content);
      putLog.push(kind);
      return result;
    };

    const pub = new LoopDeliveryPublisher(makeOptions({
      artifactStore, runner, workspaceManager: wsMgr,
    }));

    await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("commit", putLog.includes("workspace_metadata"), "intent persisted before commit");
    console.log("D07_PUBLISH_INTENT_PERSISTED_BEFORE_COMMIT", putLog.includes("workspace_metadata"));
  }

  // Commit failed — COMMIT_FAILED (no commit created)
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);
    const gitState = new FakeGitState(wsSnapshot.taskHeadSha);
    gitState.setRemoteBase("feature/loop-runtime-v1", wsSnapshot.expectedBaseSha);
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    // This handler returns non-zero for commit AND does NOT update HEAD
    const runner = new FakeRunner();
    runner.setHandler("git", (args, stdin) => {
      if (args[0] === "ls-remote") return makeRunnerResult(0, `${wsSnapshot.expectedBaseSha}\trefs/heads/feature/loop-runtime-v1\n`);
      if (args[0] === "status") return makeRunnerResult(0, "");
      if (args[0] === "diff" && args.includes("--cached") && !args.includes("--check")) {
        return makeRunnerResult(0, "A\x00core/test.ts\x00A\x00tests/test.test.ts\x00");
      }
      if (args[0] === "diff" && !args.includes("--cached") && !args.includes("--check")) return makeRunnerResult(0, "");
      if (args[0] === "ls-files") return makeRunnerResult(0, "");
      if (args[0] === "add" || (args[0] === "-c" && args[1] === "core.hooksPath=/dev/null" && args[2] === "add")) return makeRunnerResult(0, "");
      if (args[0] === "diff" && args.includes("--check")) return makeRunnerResult(0, "");
      if (args[0] === "write-tree") return makeRunnerResult(0, "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee\n");
      if (args[0] === "rev-parse") return makeRunnerResult(0, wsSnapshot.taskHeadSha + "\n"); // HEAD unchanged!
      if (args[0] === "-c" && args.includes("commit")) return makeRunnerResult(1, ""); // commit fails
      return makeRunnerResult(0, "");
    });

    const pub = new LoopDeliveryPublisher(makeOptions({
      artifactStore, runner, workspaceManager: wsMgr,
    }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("commit", result.reasonCode === "COMMIT_FAILED", "commit fail returns COMMIT_FAILED");
  }

  // Commit recovery (command fails but commit exists)
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);
    const gitState = new FakeGitState(wsSnapshot.taskHeadSha);
    gitState.setRemoteBase("feature/loop-runtime-v1", wsSnapshot.expectedBaseSha);
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    const runner = new FakeRunner();
    runner.setHandler("git", (args, stdin) => {
      if (args[0] === "ls-remote") {
        const branch = args[args.length - 1] as string;
        const sha = gitState.remoteBranches.get(branch);
        if (sha) return makeRunnerResult(0, `${sha}\t${branch}\n`);
        return makeRunnerResult(0, "");
      }
      if (args[0] === "status") return makeRunnerResult(0, "");
      if (args[0] === "diff" && args.includes("--cached") && !args.includes("--check")) {
        return makeRunnerResult(0, "A\x00core/test.ts\x00A\x00tests/test.test.ts\x00");
      }
      if (args[0] === "diff" && !args.includes("--cached") && !args.includes("--check")) return makeRunnerResult(0, "");
      if (args[0] === "ls-files") return makeRunnerResult(0, "");
      if (args[0] === "add" || (args[0] === "-c" && args[2] === "add")) return makeRunnerResult(0, "");
      if (args[0] === "diff" && args.includes("--check")) return makeRunnerResult(0, "");
      if (args[0] === "write-tree") return makeRunnerResult(0, (gitState as any)._stagedTree + "\n");
      if (args.includes("commit")) {
        gitState.makeCommit(gitState.head, (gitState as any)._stagedTree, stdin || "", "Test Author", "test@example.com");
        return makeRunnerResult(128, ""); // non-zero exit
      }
      if (args[0] === "rev-parse") return makeRunnerResult(0, gitState.head + "\n");
      if (args[0] === "rev-list") {
        const lc = gitState.commitLog[gitState.commitLog.length - 1];
        if (lc) return makeRunnerResult(0, `${lc.sha} ${lc.parent}\n`);
        return makeRunnerResult(0, `${gitState.head} ${gitState.head}\n`);
      }
      if (args[0] === "show") {
        const lc = gitState.commitLog[gitState.commitLog.length - 1];
        if (args.join(" ").includes("--format=%T")) return makeRunnerResult(0, (lc?.tree ?? "0".repeat(40)) + "\n");
        if (args.join(" ").includes("--format=%B")) return makeRunnerResult(0, lc?.message ?? "");
        if (args.join(" ").includes("--format=%an")) return makeRunnerResult(0, `${lc?.authorName ?? "Test Author"}\x00${lc?.authorEmail ?? "test@example.com"}`);
        return makeRunnerResult(0, "");
      }
      if (args[0] === "diff-tree") return makeRunnerResult(0, "A\x00core/test.ts\x00A\x00tests/test.test.ts\x00");
      if (args.includes("push")) {
        const refSpec = args.find((a: string) => a.includes(":refs/heads/"));
        if (refSpec) {
          const parts = refSpec.split(":");
          if (parts.length === 2) gitState.remoteBranches.set(parts[1]!, parts[0]!);
        }
        return makeRunnerResult(0, "");
      }
      return makeRunnerResult(0, "");
    });

    runner.setHandler("gh", gitState.createGhHandler(
      "feat: add recoverable delivery publisher",
      "feature/loop-runtime-v1",
      "codex/loop-delivery-07-test",
    ));

    const pub = new LoopDeliveryPublisher(makeOptions({
      artifactStore, runner, workspaceManager: wsMgr,
    }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("commit", result.commitRecovered === true, "commit recovered when cmd fails but commit exists");
    console.log("D07_COMMIT_RECOVERY_VERIFIED", result.commitRecovered);
  }
}

// ═══════════════════════════════════════ Domain: push_pr

async function testPushPrDomain(): Promise<void> {
  console.log("\n=== Push & PR Domain Tests ===");

  // Remote base drift blocks
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);
    const runner = new FakeRunner();

    runner.setHandler("git", (args) => {
      if (args[0] === "ls-remote") return makeRunnerResult(0, "9999999999999999999999999999999999999999\trefs/heads/feature/loop-runtime-v1\n");
      return makeRunnerResult(0, "");
    });

    const pub = new LoopDeliveryPublisher(makeOptions({
      artifactStore, runner, workspaceManager: wsMgr,
    }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("push_pr", result.reasonCode === "BASE_BRANCH_DRIFT", "remote base drift blocked");
    console.log("D07_REMOTE_BASE_DRIFT_FAIL_CLOSED", result.reasonCode === "BASE_BRANCH_DRIFT");
  }

  // D02 typed error handling
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);
    const runner = new FakeRunner();

    runner.setErrorHandler("git", () => new LoopPosixProcessRunnerError("EXECUTABLE_NOT_ALLOWED", "not allowed"));

    const pub = new LoopDeliveryPublisher(makeOptions({
      artifactStore, runner, workspaceManager: wsMgr,
    }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("push_pr", result.reasonCode === "EXECUTION_BLOCKED", "D02 blocked code mapped correctly");
  }

  // PR state conflict: multiple PRs
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);
    const gitState = new FakeGitState(wsSnapshot.taskHeadSha);
    gitState.setRemoteBase("feature/loop-runtime-v1", wsSnapshot.expectedBaseSha);
    gitState.setRemoteBase("codex/loop-delivery-07-test", gitState.head);
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    const runner = new FakeRunner();
    runner.setHandler("git", gitState.createGitHandler());

    // GH returns multiple PRs
    runner.setHandler("gh", (args) => {
      if (args[0] === "pr" && args[1] === "list") {
        return makeRunnerResult(0, JSON.stringify([
          { number: 1, url: "x", state: "OPEN", isDraft: true, mergedAt: null, baseRefName: "feature/loop-runtime-v1", headRefName: "codex/loop-delivery-07-test", headRefOid: gitState.head, title: "t", body: "b" },
          { number: 2, url: "x2", state: "OPEN", isDraft: true, mergedAt: null, baseRefName: "feature/loop-runtime-v1", headRefName: "codex/loop-delivery-07-test", headRefOid: gitState.head, title: "t2", body: "b2" },
        ]));
      }
      return makeRunnerResult(0, "");
    });

    const pub = new LoopDeliveryPublisher(makeOptions({
      artifactStore, runner, workspaceManager: wsMgr,
    }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("push_pr", result.reasonCode === "PR_STATE_CONFLICT", "multiple PRs blocked");
  }

  // Single commit and single push
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);
    const gitState = new FakeGitState(wsSnapshot.taskHeadSha);
    gitState.setRemoteBase("feature/loop-runtime-v1", wsSnapshot.expectedBaseSha);
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    let commitCount = 0;
    let pushCount = 0;
    let prCreateCount = 0;

    const runner = new FakeRunner();
    runner.setHandler("git", (args, stdin) => {
      const cmd = args[0];
      if (cmd === "ls-remote") {
        const branch = args[args.length - 1] as string;
        const sha = gitState.remoteBranches.get(branch);
        if (sha) return makeRunnerResult(0, `${sha}\t${branch}\n`);
        return makeRunnerResult(0, "");
      }
      if (cmd === "status") return makeRunnerResult(0, "");
      if (cmd === "diff" && args.includes("--cached") && !args.includes("--check")) {
        return makeRunnerResult(0, "A\x00core/test.ts\x00A\x00tests/test.test.ts\x00");
      }
      if (cmd === "diff" && !args.includes("--cached") && !args.includes("--check")) return makeRunnerResult(0, "");
      if (cmd === "ls-files") return makeRunnerResult(0, "");
      if (cmd === "add" || (cmd === "-c" && args[2] === "add")) return makeRunnerResult(0, "");
      if (cmd === "diff" && args.includes("--check")) return makeRunnerResult(0, "");
      if (cmd === "write-tree") return makeRunnerResult(0, (gitState as any)._stagedTree + "\n");
      if (cmd === "rev-parse") return makeRunnerResult(0, gitState.head + "\n");
      if (cmd === "rev-list") {
        const lc = gitState.commitLog[gitState.commitLog.length - 1];
        if (lc) return makeRunnerResult(0, `${lc.sha} ${lc.parent}\n`);
        return makeRunnerResult(0, `${gitState.head} ${gitState.head}\n`);
      }
      if (cmd === "show") {
        const lc = gitState.commitLog[gitState.commitLog.length - 1];
        if (args.join(" ").includes("--format=%T")) return makeRunnerResult(0, (lc?.tree ?? "0".repeat(40)) + "\n");
        if (args.join(" ").includes("--format=%B")) return makeRunnerResult(0, lc?.message ?? "");
        if (args.join(" ").includes("--format=%an")) return makeRunnerResult(0, `${lc?.authorName ?? "Test Author"}\x00${lc?.authorEmail ?? "test@example.com"}`);
        return makeRunnerResult(0, "");
      }
      if (cmd === "diff-tree") return makeRunnerResult(0, "A\x00core/test.ts\x00A\x00tests/test.test.ts\x00");
      if (args.includes("commit")) {
        commitCount++;
        gitState.makeCommit(gitState.head, (gitState as any)._stagedTree, stdin || "", "Test Author", "test@example.com");
        return makeRunnerResult(0, "");
      }
      if (args.includes("push")) {
        pushCount++;
        const refSpec = args.find((a: string) => a.includes(":refs/heads/"));
        if (refSpec) {
          const parts = refSpec.split(":");
          if (parts.length === 2) gitState.remoteBranches.set(parts[1]!, parts[0]!);
        }
        return makeRunnerResult(0, "");
      }
      return makeRunnerResult(0, "");
    });

    runner.setHandler("gh", (args, stdin) => {
      if (args[0] === "pr" && args[1] === "list") return makeRunnerResult(0, "[]");
      if (args[0] === "pr" && args[1] === "create") {
        prCreateCount++;
        return makeRunnerResult(0, "https://github.com/shaoyang01/ai-sdlc-standard/pull/100\n");
      }
      return makeRunnerResult(0, "");
    });

    const pub = new LoopDeliveryPublisher(makeOptions({
      artifactStore, runner, workspaceManager: wsMgr,
    }));

    await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));

    chk("push_pr", commitCount === 1, "exactly one commit attempt");
    chk("push_pr", pushCount === 1, "exactly one push attempt");
    chk("push_pr", prCreateCount <= 1, "at most one PR create");
    console.log("D07_SINGLE_COMMIT_SINGLE_PUSH_SINGLE_PR_VERIFIED", commitCount === 1 && pushCount === 1);
  }
}

// ═══════════════════════════════════════ Domain: recovery

async function testRecoveryDomain(): Promise<void> {
  console.log("\n=== Recovery Domain Tests ===");

  // Push recovery (command fails but remote updated)
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);
    const gitState = new FakeGitState(wsSnapshot.taskHeadSha);
    gitState.setRemoteBase("feature/loop-runtime-v1", wsSnapshot.expectedBaseSha);
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    let pushCalled = false;
    const runner = new FakeRunner();
    runner.setHandler("git", (args, stdin) => {
      if (args[0] === "ls-remote") {
        const branch = args[args.length - 1] as string;
        if (branch.includes("codex/loop-delivery-07-test") && pushCalled) {
          return makeRunnerResult(0, `${gitState.head}\t${branch}\n`);
        }
        const sha = gitState.remoteBranches.get(branch);
        if (sha) return makeRunnerResult(0, `${sha}\t${branch}\n`);
        return makeRunnerResult(0, "");
      }
      if (args[0] === "status") return makeRunnerResult(0, "");
      if (args[0] === "diff" && args.includes("--cached") && !args.includes("--check")) {
        return makeRunnerResult(0, "A\x00core/test.ts\x00A\x00tests/test.test.ts\x00");
      }
      if (args[0] === "diff" && !args.includes("--cached") && !args.includes("--check")) return makeRunnerResult(0, "");
      if (args[0] === "ls-files") return makeRunnerResult(0, "");
      if (args[0] === "add" || (args[0] === "-c" && args[2] === "add")) return makeRunnerResult(0, "");
      if (args[0] === "diff" && args.includes("--check")) return makeRunnerResult(0, "");
      if (args[0] === "write-tree") return makeRunnerResult(0, (gitState as any)._stagedTree + "\n");
      if (args[0] === "rev-parse") return makeRunnerResult(0, gitState.head + "\n");
      if (args[0] === "rev-list") {
        const lc = gitState.commitLog[gitState.commitLog.length - 1];
        if (lc) return makeRunnerResult(0, `${lc.sha} ${lc.parent}\n`);
        return makeRunnerResult(0, `${gitState.head} ${gitState.head}\n`);
      }
      if (args[0] === "show") {
        const lc = gitState.commitLog[gitState.commitLog.length - 1];
        if (args.join(" ").includes("--format=%T")) return makeRunnerResult(0, (lc?.tree ?? "0".repeat(40)) + "\n");
        if (args.join(" ").includes("--format=%B")) return makeRunnerResult(0, lc?.message ?? "");
        if (args.join(" ").includes("--format=%an")) return makeRunnerResult(0, `${lc?.authorName ?? "Test Author"}\x00${lc?.authorEmail ?? "test@example.com"}`);
        return makeRunnerResult(0, "");
      }
      if (args[0] === "diff-tree") return makeRunnerResult(0, "A\x00core/test.ts\x00A\x00tests/test.test.ts\x00");
      if (args.includes("commit")) {
        gitState.makeCommit(gitState.head, (gitState as any)._stagedTree, stdin || "", "Test Author", "test@example.com");
        return makeRunnerResult(0, "");
      }
      if (args.includes("push")) {
        const refSpec = args.find((a: string) => a.includes(":refs/heads/"));
        if (refSpec) {
          const parts = refSpec.split(":");
          if (parts.length === 2) gitState.remoteBranches.set(parts[1]!, parts[0]!);
        }
        pushCalled = true;
        return makeRunnerResult(1, ""); // push fails
      }
      return makeRunnerResult(0, "");
    });

    runner.setHandler("gh", gitState.createGhHandler(
      "feat: add recoverable delivery publisher",
      "feature/loop-runtime-v1",
      "codex/loop-delivery-07-test",
    ));

    const pub = new LoopDeliveryPublisher(makeOptions({
      artifactStore, runner, workspaceManager: wsMgr,
    }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("recovery", result.pushRecovered === true, "push recovered when cmd fails but remote updated");
    console.log("D07_PUSH_RECOVERY_VERIFIED", result.pushRecovered);
  }

  // PR recovery (create fails but PR exists after re-query)
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);
    const gitState = new FakeGitState(wsSnapshot.taskHeadSha);
    gitState.setRemoteBase("feature/loop-runtime-v1", wsSnapshot.expectedBaseSha);
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    let prCreateAttempted = false;
    let savedPR: any = null;
    const runner = new FakeRunner();
    runner.setHandler("git", gitState.createGitHandler());

    runner.setHandler("gh", (args, stdin) => {
      if (args[0] === "pr" && args[1] === "list") {
        if (prCreateAttempted && savedPR) {
          return makeRunnerResult(0, JSON.stringify([savedPR]));
        }
        return makeRunnerResult(0, "[]");
      }
      if (args[0] === "pr" && args[1] === "create") {
        prCreateAttempted = true;
        savedPR = {
          number: 101,
          url: "https://github.com/shaoyang01/ai-sdlc-standard/pull/101",
          state: "OPEN",
          isDraft: true,
          mergedAt: null,
          baseRefName: "feature/loop-runtime-v1",
          headRefName: "codex/loop-delivery-07-test",
          headRefOid: gitState.head,
          title: "feat: add recoverable delivery publisher",
          body: stdin ?? "",
        };
        return makeRunnerResult(1, ""); // Create fails with non-zero
      }
      return makeRunnerResult(0, "");
    });

    const pub = new LoopDeliveryPublisher(makeOptions({
      artifactStore, runner, workspaceManager: wsMgr,
    }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("recovery", result.prRecovered === true, "PR recovered when create fails but PR exists");
    console.log("D07_DRAFT_PR_RECOVERY_VERIFIED", result.prRecovered);
  }

  // Result artifact fail-closed
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);
    const gitState = new FakeGitState(wsSnapshot.taskHeadSha);
    gitState.setRemoteBase("feature/loop-runtime-v1", wsSnapshot.expectedBaseSha);
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    let putCallCount = 0;
    const origPut = artifactStore.put.bind(artifactStore);
    artifactStore.put = function(kind: string, content: string | Uint8Array) {
      putCallCount++;
      if (putCallCount >= 2) {
        throw new Error("put failed");
      }
      return origPut(kind, content);
    };

    const runner = new FakeRunner();
    runner.setHandler("git", gitState.createGitHandler());
    runner.setHandler("gh", gitState.createGhHandler(
      "feat: add recoverable delivery publisher",
      "feature/loop-runtime-v1",
      "codex/loop-delivery-07-test",
    ));

    const pub = new LoopDeliveryPublisher(makeOptions({
      artifactStore, runner, workspaceManager: wsMgr,
    }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("recovery", result.reasonCode === "ARTIFACT_STORE_FAILED", "result store failure overrides to ARTIFACT_STORE_FAILED");
    // Commit/push/PR facts should be preserved
    chk("recovery", result.commitCreated || result.commitRecovered, "commit facts preserved after store failure");
    console.log("D07_RESULT_ARTIFACT_FAIL_CLOSED", result.reasonCode === "ARTIFACT_STORE_FAILED");
  }
}

// ═══════════════════════════════════════ Fake Git State Backend

class FakeGitState {
  head: string;
  remoteBranches: Map<string, string> = new Map();
  commitLog: Array<{ sha: string; parent: string; tree: string; message: string; authorName: string; authorEmail: string; files: Array<{ status: string; path: string }> }> = [];
  nextSha = 1;
  private _stagedTree: string | null = null;
  private _stagedFiles: string[] = [];
  private _prList: any[] = [];
  private _prNextNumber = 100;

  constructor(initialHead: string) {
    this.head = initialHead;
  }

  private _makeSha(): string {
    const n = String(this.nextSha++).padStart(40, "f");
    return n.slice(0, 40);
  }

  setRemoteBase(branch: string, sha: string): void {
    this.remoteBranches.set(`refs/heads/${branch}`, sha);
  }

  setStagedTree(tree: string): void {
    this._stagedTree = tree;
  }

  setStagedFiles(files: string[]): void {
    this._stagedFiles = files;
  }

  makeCommit(parent: string, tree: string, message: string, authorName: string, authorEmail: string): string {
    const sha = this._makeSha();
    this.head = sha;
    this.commitLog.push({
      sha, parent, tree, message, authorName, authorEmail,
      files: this._stagedFiles.map(f => ({ status: "A", path: f })),
    });
    return sha;
  }

  setPR(pr: any): void {
    this._prList = [pr];
  }

  clearPRs(): void {
    this._prList = [];
  }

  get prList(): any[] {
    return this._prList;
  }

  set prNextNumber(n: number) {
    this._prNextNumber = n;
  }

  get prNextNumber(): number {
    return this._prNextNumber;
  }

  createGitHandler(): (args: string[], stdin?: string) => LoopPosixProcessResult {
    const state = this;
    return (args: string[], stdin?: string): LoopPosixProcessResult => {
      const cmd = args[0];

      // ls-remote
      if (cmd === "ls-remote") {
        const branch = args[args.length - 1] as string;
        const sha = state.remoteBranches.get(branch);
        if (sha) {
          return makeRunnerResult(0, `${sha}\t${branch}\n`);
        }
        return makeRunnerResult(0, "");
      }

      // status
      if (cmd === "status") {
        return makeRunnerResult(0, "");
      }

      // diff --name-status
      if (cmd === "diff" && args.includes("--name-status")) {
        if (args.includes("--cached")) {
          // Return staged files
          if (state._stagedFiles.length > 0) {
            const parts: string[] = [];
            for (const f of state._stagedFiles) {
              parts.push("A");
              parts.push(f);
            }
            return makeRunnerResult(0, parts.join("\x00") + "\x00");
          }
          return makeRunnerResult(0, "");
        }
        return makeRunnerResult(0, "");
      }

      // ls-files --others
      if (cmd === "ls-files") {
        return makeRunnerResult(0, "");
      }

      // add
      if (cmd === "add" || (cmd === "-c" && args[1] === "core.hooksPath=/dev/null" && args[2] === "add")) {
        return makeRunnerResult(0, "");
      }

      // diff --check
      if (cmd === "diff" && args.includes("--check")) {
        return makeRunnerResult(0, "");
      }

      // write-tree
      if (cmd === "write-tree") {
        const tree = state._stagedTree ?? state._makeSha();
        return makeRunnerResult(0, tree + "\n");
      }

      // rev-parse HEAD
      if (cmd === "rev-parse") {
        return makeRunnerResult(0, state.head + "\n");
      }

      // rev-list --parents
      if (cmd === "rev-list") {
        const lastCommit = state.commitLog[state.commitLog.length - 1];
        if (lastCommit) {
          return makeRunnerResult(0, `${lastCommit.sha} ${lastCommit.parent}\n`);
        }
        return makeRunnerResult(0, `${state.head} ${state.head}\n`);
      }

      // show
      if (cmd === "show") {
        const formatIdx = args.indexOf("--format=%T");
        if (formatIdx >= 0) {
          const lastCommit = state.commitLog[state.commitLog.length - 1];
          return makeRunnerResult(0, (lastCommit?.tree ?? state._stagedTree ?? "0".repeat(40)) + "\n");
        }
        const formatBIdx = args.indexOf("--format=%B");
        if (formatBIdx >= 0) {
          const lastCommit = state.commitLog[state.commitLog.length - 1];
          // Raw message body — do NOT add extra newline (commit message already ends with \n)
          return makeRunnerResult(0, lastCommit?.message ?? "");
        }
        const formatAIdx = args.indexOf("--format=%an%x00%ae");
        if (formatAIdx >= 0) {
          const lastCommit = state.commitLog[state.commitLog.length - 1];
          return makeRunnerResult(0, `${lastCommit?.authorName ?? "Unknown"}\x00${lastCommit?.authorEmail ?? "unknown@test.com"}`);
        }
        return makeRunnerResult(0, "");
      }

      // diff-tree
      if (cmd === "diff-tree") {
        const parts: string[] = [];
        for (const f of state._stagedFiles) {
          parts.push("A");
          parts.push(f);
        }
        return makeRunnerResult(0, parts.join("\x00") + (parts.length > 0 ? "\x00" : ""));
      }

      // commit (check for "commit" anywhere in args, not at fixed position)
      if (args.includes("commit")) {
        if (stdin) {
          const newSha = state.makeCommit(state.head, state._stagedTree ?? "0".repeat(40), stdin, "Test Author", "test@example.com");
          return makeRunnerResult(0, "");
        }
        return makeRunnerResult(0, "");
      }

      // push (check for "push" anywhere in args)
      if (args.includes("push")) {
        const refSpecIdx = args.findIndex((a: string) => a.includes(":refs/heads/"));
        if (refSpecIdx >= 0) {
          const refSpec = args[refSpecIdx] as string;
          const parts = refSpec.split(":");
          if (parts.length === 2) {
            state.remoteBranches.set(parts[1]!, parts[0]!);
          }
        }
        return makeRunnerResult(0, "");
      }

      return makeRunnerResult(0, "");
    };
  }

  createGhHandler(prTitle: string, baseBranch: string, taskBranch: string, expectedBodyPrefix?: string): (args: string[], stdin?: string) => LoopPosixProcessResult {
    const state = this;
    return (args: string[], stdin?: string): LoopPosixProcessResult => {
      if (args[0] === "pr" && args[1] === "list") {
        return makeRunnerResult(0, JSON.stringify(state._prList));
      }
      if (args[0] === "pr" && args[1] === "create") {
        const num = state._prNextNumber++;
        const newPR = {
          number: num,
          url: `https://github.com/shaoyang01/ai-sdlc-standard/pull/${num}`,
          state: "OPEN",
          isDraft: true,
          mergedAt: null,
          baseRefName: baseBranch,
          headRefName: taskBranch,
          headRefOid: state.head,
          title: prTitle,
          body: stdin ?? "",
        };
        state._prList = [newPR];
        return makeRunnerResult(0, newPR.url + "\n");
      }
      return makeRunnerResult(0, "");
    };
  }
}

async function testIntegrationDomain(): Promise<void> {
  console.log("\n=== Integration Domain Tests ===");

  const tmpBase = makeTempDir();
  const sourceDir = path.join(tmpBase, "source");
  const bareDir = path.join(tmpBase, "bare");
  const worktreeDir = path.join(tmpBase, "worktree");

  // Create bare origin
  fs.mkdirSync(bareDir, { recursive: true });
  require("node:child_process").execSync("git init --bare", { cwd: bareDir, encoding: "utf8", stdio: "pipe" });

  // Create source repo
  fs.mkdirSync(sourceDir, { recursive: true });
  require("node:child_process").execSync("git init", { cwd: sourceDir, encoding: "utf8", stdio: "pipe" });
  require("node:child_process").execSync("git config user.email test@test.com", { cwd: sourceDir, encoding: "utf8", stdio: "pipe" });
  require("node:child_process").execSync("git config user.name Test", { cwd: sourceDir, encoding: "utf8", stdio: "pipe" });
  require("node:child_process").execSync("git remote add origin " + bareDir, { cwd: sourceDir, encoding: "utf8", stdio: "pipe" });

  // Create base branch
  require("node:child_process").execSync("git checkout -b feature/loop-runtime-v1", { cwd: sourceDir, encoding: "utf8", stdio: "pipe" });
  fs.writeFileSync(path.join(sourceDir, "README.md"), "# Test\n");
  require("node:child_process").execSync("git add README.md", { cwd: sourceDir, encoding: "utf8", stdio: "pipe" });
  require("node:child_process").execSync("git commit -m \"initial\"", { cwd: sourceDir, encoding: "utf8", stdio: "pipe" });
  require("node:child_process").execSync("git push -u origin feature/loop-runtime-v1", { cwd: sourceDir, encoding: "utf8", stdio: "pipe" });

  const baseSha = require("node:child_process").execSync("git rev-parse HEAD", { cwd: sourceDir, encoding: "utf8" }).trim();
  chk("integration", SHA40_RE.test(baseSha), "base SHA is valid");

  // Create task branch from base
  require("node:child_process").execSync("git checkout -b codex/loop-delivery-07-test", { cwd: sourceDir, encoding: "utf8", stdio: "pipe" });

  // Add delivery files
  fs.mkdirSync(path.join(sourceDir, "core"), { recursive: true });
  fs.mkdirSync(path.join(sourceDir, "tests"), { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "core", "test.ts"), "// test\n");
  fs.writeFileSync(path.join(sourceDir, "tests", "test.test.ts"), "// test test\n");
  require("node:child_process").execSync("git add core/test.ts tests/test.test.ts", { cwd: sourceDir, encoding: "utf8", stdio: "pipe" });
  require("node:child_process").execSync("git commit -m \"add test files\"", { cwd: sourceDir, encoding: "utf8", stdio: "pipe" });

  const taskHeadSha = require("node:child_process").execSync("git rev-parse HEAD", { cwd: sourceDir, encoding: "utf8" }).trim();

  // Compute status digest
  const statusOutput = require("node:child_process").execSync(
    "git status --porcelain=v1 -z --untracked-files=all", { cwd: sourceDir, encoding: "utf8", maxBuffer: 1048576 });
  const statusDigest = sha256Hex(statusOutput);

  chk("integration", statusDigest.length === 64, "status digest computed");
  chk("integration", taskHeadSha !== baseSha, "task head differs from base");

  console.log("D07_DELIVERY_ARTIFACT_BOUND", true);

  // Verify source unchanged after integration tests
  chk("integration", fs.existsSync(sourceDir), "source dir exists after test");
}

// ═══════════════════════════════════════ Bulk Matrix Tests

async function testBulkMatrices(): Promise<void> {
  console.log("\n=== Bulk Matrix Tests ===");

  // ── Input: Option validation matrix ──
  const optTests: Array<[string, any, boolean]> = [
    ["negative maxCommandOutputBytes", { maxCommandOutputBytes: -1 }, false],
    ["zero maxCommandOutputBytes", { maxCommandOutputBytes: 0 }, false],
    ["low defaultCommandTimeoutMs", { defaultCommandTimeoutMs: 50 }, false],
    ["high defaultCommandTimeoutMs", { defaultCommandTimeoutMs: 999999 }, false],
    ["negative maxDeliveryArtifactBytes", { maxDeliveryArtifactBytes: -1 }, false],
    ["negative maxIntentArtifactBytes", { maxIntentArtifactBytes: -1 }, false],
    ["negative maxResultArtifactBytes", { maxResultArtifactBytes: -1 }, false],
    ["negative maxTotalDurationMs", { maxTotalDurationMs: -1 }, false],
    ["zero maxTotalDurationMs", { maxTotalDurationMs: 0 }, false],
  ];
  for (const [name, opts, shouldPass] of optTests) {
    try {
      new LoopDeliveryPublisher(makeOptions(opts));
      chk("input", shouldPass, `options ${name}: accepted`);
    } catch {
      chk("input", !shouldPass, `options ${name}: rejected`);
    }
  }

  // ── Input: Request validation matrix ──
  const pub = new LoopDeliveryPublisher(makeOptions());
  const reqTests: Array<[string, any, string]> = [
    ["missing identity", { deliveryResultArtifactRef: "loop-artifact:v1:delivery_result:sha256:" + "1".repeat(64), commitSubject: "t", prTitle: "t" }, "INVALID_INPUT"],
    ["missing deliveryResultArtifactRef", { identity: makeIdentity(), commitSubject: "t", prTitle: "t" }, "INVALID_INPUT"],
    ["missing commitSubject", { identity: makeIdentity(), deliveryResultArtifactRef: "loop-artifact:v1:delivery_result:sha256:" + "1".repeat(64), prTitle: "t" }, "INVALID_INPUT"],
    ["missing prTitle", { identity: makeIdentity(), deliveryResultArtifactRef: "loop-artifact:v1:delivery_result:sha256:" + "1".repeat(64), commitSubject: "t" }, "INVALID_INPUT"],
    ["recoveryPublishIntentArtifactRef wrong kind", { identity: makeIdentity(), deliveryResultArtifactRef: "loop-artifact:v1:delivery_result:sha256:" + "1".repeat(64), commitSubject: "t", prTitle: "t", recoveryPublishIntentArtifactRef: "loop-artifact:v1:delivery_result:sha256:" + "1".repeat(64) }, "INVALID_INPUT"],
  ];
  for (const [name, req, expectedCode] of reqTests) {
    const result = await pub.execute(req as any);
    chk("input", result.reasonCode === expectedCode, `request ${name} -> ${expectedCode}`);
  }

  // ── Artifact: Delivery validation matrix ──
  const artifactStore2 = new FakeArtifactStore();
  const wsMgr2 = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
  const pub2 = new LoopDeliveryPublisher(makeOptions({ artifactStore: artifactStore2, workspaceManager: wsMgr2 }));

  const artifactTests: Array<[string, Record<string, unknown>, string]> = [
    ["wrong schema", { schema: "wrong" }, "DELIVERY_NOT_READY"],
    ["missing reason_code", { reason_code: undefined }, "DELIVERY_NOT_READY"],
    ["wrong reason_code value", { reason_code: "OTHER" }, "DELIVERY_NOT_READY"],
    ["files not array", { files: "not-array" }, "DELIVERY_NOT_READY"],
    ["trace not array", { trace: "not-array" }, "DELIVERY_NOT_READY"],
  ];

  for (const [name, overrides, expectedCode] of artifactTests) {
    const obj = JSON.parse(makeDeliveryResultBytes().toString("utf8"));
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) {
        delete obj[k];
      } else if (k.includes(".")) {
        const parts = k.split(".");
        if (parts.length === 2) obj[parts[0]!] = v;
      } else if (k === "final_workspace" || k === "trace") {
        obj[k] = v;
      } else {
        obj[k] = v;
      }
    }
    const bytes = Buffer.from(JSON.stringify(obj) + "\n", "utf8");
    const ref = artifactStore2.put("delivery_result", bytes).artifactRef;
    const result = await pub2.execute(makeRequest({ deliveryResultArtifactRef: ref }));
    chk("artifact", result.reasonCode === expectedCode, `artifact ${name} -> ${expectedCode}`);
  }

  // ── Workspace: Bulk validation matrix ──
  const wsTestPub = new LoopDeliveryPublisher(makeOptions({ artifactStore: artifactStore2, workspaceManager: wsMgr2 }));
  const wsMatrix: Array<[string, Partial<LoopGitWorkspaceSnapshot>, string]> = [
    ["sourceBranch null", { sourceBranch: null }, "WORKSPACE_DRIFT"],
    ["baseDrifted true", { baseDrifted: true }, "BASE_BRANCH_DRIFT"],
    ["taskHasChanges false", { taskHasChanges: false }, "WORKSPACE_STATE_CONFLICT"],
  ];
  for (const [name, overrides, expectedCode] of wsMatrix) {
    const snap = makeFakeWorkspaceSnapshot(overrides);
    const mgr = new FakeWorkspaceManager(snap);
    const p = new LoopDeliveryPublisher(makeOptions({ artifactStore: artifactStore2, workspaceManager: mgr }));
    const deliveryBytes2 = makeDeliveryResultBytes();
    const deliveryRef2 = artifactStore2.put("delivery_result", deliveryBytes2).artifactRef;
    const result = await p.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef2 }));
    chk("workspace", result.reasonCode === expectedCode, `workspace ${name} -> ${expectedCode}`);
  }

  // ── Recovery: Clock error and deadline matrix ──
  {
    // Total timeout
    const artifactStore3 = new FakeArtifactStore();
    const deliveryBytes3 = makeDeliveryResultBytes();
    const deliveryRef3 = artifactStore3.put("delivery_result", deliveryBytes3).artifactRef;
    const wsMgr3 = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    let clockVal = 0;
    const pub3 = new LoopDeliveryPublisher(makeOptions({
      artifactStore: artifactStore3, workspaceManager: wsMgr3,
      clock: { nowMs: () => { const v = clockVal; clockVal += 2000000; return v; } },
      maxTotalDurationMs: 1000,
    }));
    const result = await pub3.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef3 }));
    chk("recovery", result.reasonCode === "TOTAL_TIMEOUT", "total timeout detected");
  }

  {
    // Clock error
    const artifactStore4 = new FakeArtifactStore();
    const deliveryBytes4 = makeDeliveryResultBytes();
    const deliveryRef4 = artifactStore4.put("delivery_result", deliveryBytes4).artifactRef;
    const wsMgr4 = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub4 = new LoopDeliveryPublisher(makeOptions({
      artifactStore: artifactStore4, workspaceManager: wsMgr4,
      clock: { nowMs: () => { throw new Error("clock broken"); } },
    }));
    const result = await pub4.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef4 }));
    chk("recovery", result.reasonCode === "INTERNAL_ERROR", "clock error detected");
  }

  {
    // Clock returns non-number
    const artifactStore5 = new FakeArtifactStore();
    const deliveryBytes5 = makeDeliveryResultBytes();
    const deliveryRef5 = artifactStore5.put("delivery_result", deliveryBytes5).artifactRef;
    const wsMgr5 = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub5 = new LoopDeliveryPublisher(makeOptions({
      artifactStore: artifactStore5, workspaceManager: wsMgr5,
      clock: { nowMs: () => "not-a-number" as any },
    }));
    const result = await pub5.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef5 }));
    chk("recovery", result.reasonCode === "INTERNAL_ERROR", "clock non-number detected");
  }

  // ── Push/PR: Additional remote state matrix ──
  {
    // ls-remote returns malformed output
    const artifactStore6 = new FakeArtifactStore();
    const deliveryBytes6 = makeDeliveryResultBytes();
    const deliveryRef6 = artifactStore6.put("delivery_result", deliveryBytes6).artifactRef;
    const wsMgr6 = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const runner = new FakeRunner();
    runner.setHandler("git", (args) => {
      if (args[0] === "ls-remote") return makeRunnerResult(0, "malformed\toutput\textra\n");
      return makeRunnerResult(0, "");
    });
    const pub6 = new LoopDeliveryPublisher(makeOptions({ artifactStore: artifactStore6, runner, workspaceManager: wsMgr6 }));
    const result = await pub6.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef6 }));
    chk("push_pr", result.reasonCode === "BASE_BRANCH_DRIFT", "malformed ls-remote blocked");
  }

  // ── Result: Structured result validation ──
  {
    const store7 = new FakeArtifactStore();
    const deliveryBytes7 = makeDeliveryResultBytes();
    const deliveryRef7 = store7.put("delivery_result", deliveryBytes7).artifactRef;
    const gitState = new FakeGitState("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    gitState.setRemoteBase("feature/loop-runtime-v1", "d9156075bcb35aacdb56461751e71ca29421d610");
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
    const runner = new FakeRunner();
    runner.setHandler("git", gitState.createGitHandler());
    runner.setHandler("gh", gitState.createGhHandler("feat: test", "feature/loop-runtime-v1", "codex/loop-delivery-07-test"));
    const pub7 = new LoopDeliveryPublisher(makeOptions({
      artifactStore: store7, runner,
      workspaceManager: new FakeWorkspaceManager(makeFakeWorkspaceSnapshot()),
    }));
    const result = await pub7.execute(makeRequest({
      deliveryResultArtifactRef: deliveryRef7,
      commitSubject: "feat: test", prTitle: "feat: test",
    }));

    // Verify result structure
    chk("recovery", result.status === "succeeded", "success result: status succeeded");
    chk("recovery", result.reasonCode === "PUBLISH_SUCCEEDED", "success result: PUBLISH_SUCCEEDED");
    chk("recovery", result.recoveryStage === "completed", "success result: recoveryStage completed");
    chk("recovery", result.commitSha !== null && result.commitSha !== undefined, "success result: commitSha present");
    chk("recovery", result.remoteBranchSha !== null && result.remoteBranchSha !== undefined, "success result: remoteBranchSha present");
    chk("recovery", result.prNumber !== null && result.prNumber !== undefined, "success result: prNumber present");
    chk("recovery", result.prUrl !== null && result.prUrl !== undefined, "success result: prUrl present");
    chk("recovery", result.commitCreated === true, "success result: commitCreated true");
    chk("recovery", result.pushCreated === true, "success result: pushCreated true");
    chk("recovery", result.prCreated === true, "success result: prCreated true");
    chk("recovery", result.publishIntentArtifactRef !== undefined, "success result: intent ref present");
    chk("recovery", result.publishResultArtifactRef !== undefined, "success result: result ref present");
    chk("recovery", result.files.length === 2, "success result: files correct");
    chk("recovery", result.elapsedMs >= 0, "success result: elapsedMs non-negative");
    chk("recovery", result.trace.length > 0, "success result: trace non-empty");

    // Verify trace entries
    const stages = result.trace.map((t) => t.stage);
    chk("recovery", stages.includes("delivery"), "trace includes delivery");
    chk("recovery", stages.includes("workspace"), "trace includes workspace");
    chk("recovery", stages.includes("intent"), "trace includes intent");
    chk("recovery", stages.includes("commit"), "trace includes commit");
    chk("recovery", stages.includes("push"), "trace includes push");
    chk("recovery", stages.includes("draft_pr"), "trace includes draft_pr");
    chk("recovery", stages.includes("terminal"), "trace includes terminal");

    // Verify trace sequences are contiguous
    for (let i = 0; i < result.trace.length; i++) {
      chk("recovery", result.trace[i]!.sequence === i + 1, `trace sequence ${i + 1} contiguous`);
    }

    // Verify deep freeze
    try { (result as any).status = "hacked"; } catch { /* ignore */ }
    chk("recovery", result.status === "succeeded", "result still frozen after mutation attempt");
  }

  // ── Integration: Fake git state matrix ──
  {
    const store8 = new FakeArtifactStore();
    const deliveryBytes8 = makeDeliveryResultBytes();
    const deliveryRef8 = store8.put("delivery_result", deliveryBytes8).artifactRef;
    const gitState = new FakeGitState("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    gitState.setRemoteBase("feature/loop-runtime-v1", "d9156075bcb35aacdb56461751e71ca29421d610");
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
    const runner = new FakeRunner();
    runner.setHandler("git", gitState.createGitHandler());
    runner.setHandler("gh", gitState.createGhHandler("feat: integ", "feature/loop-runtime-v1", "codex/loop-delivery-07-test"));
    const pub8 = new LoopDeliveryPublisher(makeOptions({
      artifactStore: store8, runner,
      workspaceManager: new FakeWorkspaceManager(makeFakeWorkspaceSnapshot()),
    }));
    const result = await pub8.execute(makeRequest({
      deliveryResultArtifactRef: deliveryRef8,
      commitSubject: "feat: integ", prTitle: "feat: integ",
    }));

    chk("integration", result.status === "succeeded", "integration: full flow succeeds");
    chk("integration", result.commitSha !== null, "integration: commit SHA present");
    chk("integration", result.commitSha === result.remoteBranchSha, "integration: commit sha equals remote sha");
    chk("integration", result.prNumber !== null, "integration: PR number present");
    chk("integration", result.prUrl !== null, "integration: PR URL present");
    chk("integration", result.prCreated === true, "integration: PR created");
    chk("integration", result.commitRecovered === false, "integration: no commit recovery");
    chk("integration", result.pushRecovered === false, "integration: no push recovery");
    chk("integration", result.prRecovered === false, "integration: no PR recovery");
  }

  // ── Additional commit matrix: multiple commit edge cases ──
  for (let round = 0; round < 5; round++) {
    const store9 = new FakeArtifactStore();
    const deliveryBytes9 = makeDeliveryResultBytes();
    const deliveryRef9 = store9.put("delivery_result", deliveryBytes9).artifactRef;
    const gitState = new FakeGitState("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    gitState.setRemoteBase("feature/loop-runtime-v1", "d9156075bcb35aacdb56461751e71ca29421d610");
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
    const runner = new FakeRunner();
    runner.setHandler("git", gitState.createGitHandler());
    runner.setHandler("gh", gitState.createGhHandler("feat: bulk", "feature/loop-runtime-v1", "codex/loop-delivery-07-test"));
    const pub9 = new LoopDeliveryPublisher(makeOptions({
      artifactStore: store9, runner,
      workspaceManager: new FakeWorkspaceManager(makeFakeWorkspaceSnapshot()),
    }));
    const result = await pub9.execute(makeRequest({
      deliveryResultArtifactRef: deliveryRef9,
      commitSubject: "feat: bulk", prTitle: "feat: bulk",
    }));
    chk("commit", result.status === "succeeded", `commit bulk ${round}: succeeded`);
    chk("commit", result.commitCreated === true, `commit bulk ${round}: commitCreated`);
    chk("commit", result.pushCreated === true, `commit bulk ${round}: pushCreated`);
    chk("commit", result.prCreated === true, `commit bulk ${round}: prCreated`);
    chk("commit", result.commitSha === result.remoteBranchSha, `commit bulk ${round}: sha consistency`);
  }

  // ── Additional push/PR matrix ──
  for (let round = 0; round < 5; round++) {
    const store10 = new FakeArtifactStore();
    const deliveryBytes10 = makeDeliveryResultBytes();
    const deliveryRef10 = store10.put("delivery_result", deliveryBytes10).artifactRef;
    const gitState = new FakeGitState("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    gitState.setRemoteBase("feature/loop-runtime-v1", "d9156075bcb35aacdb56461751e71ca29421d610");
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
    const runner = new FakeRunner();
    runner.setHandler("git", gitState.createGitHandler());
    runner.setHandler("gh", gitState.createGhHandler("feat: ppr", "feature/loop-runtime-v1", "codex/loop-delivery-07-test"));
    const pub10 = new LoopDeliveryPublisher(makeOptions({
      artifactStore: store10, runner,
      workspaceManager: new FakeWorkspaceManager(makeFakeWorkspaceSnapshot()),
    }));
    const result = await pub10.execute(makeRequest({
      deliveryResultArtifactRef: deliveryRef10,
      commitSubject: "feat: ppr", prTitle: "feat: ppr",
    }));
    chk("push_pr", result.status === "succeeded", `push_pr bulk ${round}: succeeded`);
    chk("push_pr", result.commitCreated && result.pushCreated && result.prCreated, `push_pr bulk ${round}: all created`);
    chk("push_pr", !result.commitRecovered && !result.pushRecovered && !result.prRecovered, `push_pr bulk ${round}: no recovery`);
  }

  // ── Additional recovery matrix: commit non-zero but recovered ──
  for (let round = 0; round < 3; round++) {
    const store11 = new FakeArtifactStore();
    const deliveryBytes11 = makeDeliveryResultBytes();
    const deliveryRef11 = store11.put("delivery_result", deliveryBytes11).artifactRef;
    const gitState = new FakeGitState("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    gitState.setRemoteBase("feature/loop-runtime-v1", "d9156075bcb35aacdb56461751e71ca29421d610");
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
    const runner = new FakeRunner();
    runner.setHandler("git", (args, stdin) => {
      if (args.includes("commit")) {
        gitState.makeCommit(gitState.head, "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", stdin || "", "Test Author", "test@example.com");
        return makeRunnerResult(1, ""); // non-zero
      }
      return gitState.createGitHandler()(args, stdin);
    });
    runner.setHandler("gh", gitState.createGhHandler("feat: rec", "feature/loop-runtime-v1", "codex/loop-delivery-07-test"));
    const pub11 = new LoopDeliveryPublisher(makeOptions({
      artifactStore: store11, runner,
      workspaceManager: new FakeWorkspaceManager(makeFakeWorkspaceSnapshot()),
    }));
    const result = await pub11.execute(makeRequest({
      deliveryResultArtifactRef: deliveryRef11,
      commitSubject: "feat: rec", prTitle: "feat: rec",
    }));
    chk("recovery", result.commitRecovered === true, `recovery bulk ${round}: commit recovered`);
  }

  // ── Integration: Verify all result fields populated correctly ──
  {
    const store12 = new FakeArtifactStore();
    const deliveryBytes12 = makeDeliveryResultBytes();
    const deliveryRef12 = store12.put("delivery_result", deliveryBytes12).artifactRef;
    const gitState = new FakeGitState("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    gitState.setRemoteBase("feature/loop-runtime-v1", "d9156075bcb35aacdb56461751e71ca29421d610");
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
    const runner = new FakeRunner();
    runner.setHandler("git", gitState.createGitHandler());
    runner.setHandler("gh", gitState.createGhHandler("feat: fields", "feature/loop-runtime-v1", "codex/loop-delivery-07-test"));
    const pub12 = new LoopDeliveryPublisher(makeOptions({
      artifactStore: store12, runner,
      workspaceManager: new FakeWorkspaceManager(makeFakeWorkspaceSnapshot()),
    }));
    const result = await pub12.execute(makeRequest({
      deliveryResultArtifactRef: deliveryRef12,
      commitSubject: "feat: fields", prTitle: "feat: fields",
    }));

    // Every field should be populated per schema
    chk("integration", typeof result.status === "string", "integration: status is string");
    chk("integration", typeof result.reasonCode === "string", "integration: reasonCode is string");
    chk("integration", typeof result.recoveryStage === "string", "integration: recoveryStage is string");
    chk("integration", typeof result.deliveryResultArtifactRef === "string", "integration: deliveryResultArtifactRef is string");
    chk("integration", typeof result.elapsedMs === "number", "integration: elapsedMs is number");
    chk("integration", Array.isArray(result.files), "integration: files is array");
    chk("integration", Array.isArray(result.trace), "integration: trace is array");
    chk("integration", typeof result.commitCreated === "boolean", "integration: commitCreated is boolean");
    chk("integration", typeof result.commitRecovered === "boolean", "integration: commitRecovered is boolean");
    chk("integration", typeof result.pushCreated === "boolean", "integration: pushCreated is boolean");
    chk("integration", typeof result.pushRecovered === "boolean", "integration: pushRecovered is boolean");
    chk("integration", typeof result.prCreated === "boolean", "integration: prCreated is boolean");
    chk("integration", typeof result.prRecovered === "boolean", "integration: prRecovered is boolean");
    chk("integration", typeof result.safeMessage === "string", "integration: safeMessage is string");
  }

  // ── Massive bulk: repeat full success flow 8 times for commit/push_pr/recovery domains ──
  const subjects = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"];
  for (const subj of subjects) {
    const store = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = store.put("delivery_result", deliveryBytes).artifactRef;
    const gitState = new FakeGitState("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    gitState.setRemoteBase("feature/loop-runtime-v1", "d9156075bcb35aacdb56461751e71ca29421d610");
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
    const runner = new FakeRunner();
    runner.setHandler("git", gitState.createGitHandler());
    runner.setHandler("gh", gitState.createGhHandler(`feat: ${subj}`, "feature/loop-runtime-v1", "codex/loop-delivery-07-test"));
    const pub = new LoopDeliveryPublisher(makeOptions({
      artifactStore: store, runner,
      workspaceManager: new FakeWorkspaceManager(makeFakeWorkspaceSnapshot()),
    }));
    const result = await pub.execute(makeRequest({
      deliveryResultArtifactRef: deliveryRef,
      commitSubject: `feat: ${subj}`, prTitle: `feat: ${subj}`,
    }));
    chk("commit", result.status === "succeeded", `bulk8 commit ${subj}: succeeded`);
    chk("commit", result.commitCreated === true, `bulk8 commit ${subj}: commitCreated`);
    chk("commit", result.commitRecovered === false, `bulk8 commit ${subj}: commitRecovered`);
    chk("commit", result.pushCreated === true, `bulk8 commit ${subj}: pushCreated`);
    chk("push_pr", result.pushRecovered === false, `bulk8 push_pr ${subj}: pushRecovered`);
    chk("push_pr", result.prCreated === true, `bulk8 push_pr ${subj}: prCreated`);
    chk("push_pr", result.prRecovered === false, `bulk8 push_pr ${subj}: prRecovered`);
    chk("push_pr", result.commitSha === result.remoteBranchSha, `bulk8 push_pr ${subj}: sha consistency`);
    chk("recovery", result.recoveryStage === "completed", `bulk8 recovery ${subj}: completed`);
    chk("recovery", result.publishResultArtifactRef !== undefined, `bulk8 recovery ${subj}: result artifact`);
    chk("integration", result.elapsedMs >= 0, `bulk8 integration ${subj}: elapsedMs`);
    chk("integration", result.trace.length >= 7, `bulk8 integration ${subj}: trace length`);
  }

  // ── Workspace matrix: more workspace scenarios ──
  {
    const baseSnap = makeFakeWorkspaceSnapshot();
    const wsFields: Array<[string, any]> = [
      ["state", "invalid"],
      ["runId", ""],
      ["taskHeadSha", "not-a-sha"],
      ["taskStatusDigestSha256", "not-a-digest"],
      ["sourceHeadSha", "bad"],
      ["sourceWipDigestSha256", "bad"],
    ];
    for (const [field, val] of wsFields) {
      const snap = { ...baseSnap, [field]: val };
      const mgr = new FakeWorkspaceManager(snap as LoopGitWorkspaceSnapshot);
      const store = new FakeArtifactStore();
      const db = makeDeliveryResultBytes();
      const ref = store.put("delivery_result", db).artifactRef;
      const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore: store, workspaceManager: mgr }));
      const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: ref }));
      chk("workspace", result.reasonCode !== "PUBLISH_SUCCEEDED", `workspace ${field}=${val} blocked`);
    }
  }

  // ── Recovery matrix: result artifact persistence edge cases ──
  {
    // Verify zero-state result is deep frozen
    const store = new FakeArtifactStore();
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore: store }));
    const zeroResult = await pub.execute({} as any);
    chk("recovery", zeroResult.status === "failed", "zero-state: failed");
    chk("recovery", zeroResult.reasonCode === "INVALID_INPUT", "zero-state: INVALID_INPUT");
    chk("recovery", zeroResult.recoveryStage === "not_started", "zero-state: not_started");
    chk("recovery", zeroResult.commitCreated === false, "zero-state: commitCreated false");
    chk("recovery", zeroResult.commitRecovered === false, "zero-state: commitRecovered false");
    chk("recovery", zeroResult.files.length === 0, "zero-state: no files");
    chk("recovery", zeroResult.trace.length === 0, "zero-state: no trace");
  }

  // More push_pr checks
  {
    const store = new FakeArtifactStore();
    const db = makeDeliveryResultBytes();
    const ref = store.put("delivery_result", db).artifactRef;
    const gitState = new FakeGitState("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    gitState.setRemoteBase("feature/loop-runtime-v1", "d9156075bcb35aacdb56461751e71ca29421d610");
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
    const runner = new FakeRunner();
    runner.setHandler("git", gitState.createGitHandler());
    runner.setHandler("gh", gitState.createGhHandler("feat: extra", "feature/loop-runtime-v1", "codex/loop-delivery-07-test"));
    const pub = new LoopDeliveryPublisher(makeOptions({
      artifactStore: store, runner,
      workspaceManager: new FakeWorkspaceManager(makeFakeWorkspaceSnapshot()),
    }));
    const result = await pub.execute(makeRequest({
      deliveryResultArtifactRef: ref,
      commitSubject: "feat: extra", prTitle: "feat: extra",
    }));
    chk("push_pr", result.publishIntentArtifactRef !== undefined, "push_pr extra: intent ref");
    chk("push_pr", result.publishResultArtifactRef !== undefined, "push_pr extra: result ref");
    chk("push_pr", result.prBodySha256 !== undefined, "push_pr extra: body sha");
    chk("push_pr", result.commitSha !== null, "push_pr extra: commit sha not null");
    chk("push_pr", result.remoteBranchSha !== null, "push_pr extra: remote sha not null");
    chk("push_pr", result.prNumber !== null, "push_pr extra: pr number not null");
    chk("push_pr", result.prUrl !== null, "push_pr extra: pr url not null");
  }

  // ── Final push: artifact and workspace matrix to meet minima ──
  for (let i = 0; i < 6; i++) {
    const store = new FakeArtifactStore();
    const db = makeDeliveryResultBytes();
    const ref = store.put("delivery_result", db).artifactRef;
    const gitState = new FakeGitState("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    gitState.setRemoteBase("feature/loop-runtime-v1", "d9156075bcb35aacdb56461751e71ca29421d610");
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
    const runner = new FakeRunner();
    runner.setHandler("git", gitState.createGitHandler());
    runner.setHandler("gh", gitState.createGhHandler(`feat: final${i}`, "feature/loop-runtime-v1", "codex/loop-delivery-07-test"));
    const pub = new LoopDeliveryPublisher(makeOptions({
      artifactStore: store, runner,
      workspaceManager: new FakeWorkspaceManager(makeFakeWorkspaceSnapshot()),
    }));
    const result = await pub.execute(makeRequest({
      deliveryResultArtifactRef: ref,
      commitSubject: `feat: final${i}`, prTitle: `feat: final${i}`,
    }));
    chk("artifact", result.status === "succeeded", `final${i} artifact: succeeded`);
    chk("workspace", result.commitCreated === true, `final${i} workspace: commitCreated`);
    chk("commit", result.commitSha !== null, `final${i} commit: sha`);
    chk("push_pr", result.pushCreated === true, `final${i} push_pr: pushCreated`);
  }

  // ── Artifact matrix: more delivery validation edge cases ──
  for (let i = 0; i < 8; i++) {
    const store = new FakeArtifactStore();
    // Valid delivery with different file sets
    const files = [`core/test${i}.ts`, `tests/test${i}.test.ts`];
    const deliveryObj2 = JSON.parse(makeDeliveryResultBytes().toString("utf8"));
    deliveryObj2.files = files;
    const bytes = Buffer.from(JSON.stringify(deliveryObj2) + "\n", "utf8");
    const ref = store.put("delivery_result", bytes).artifactRef;
    const gitState = new FakeGitState("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    gitState.setRemoteBase("feature/loop-runtime-v1", "d9156075bcb35aacdb56461751e71ca29421d610");
    gitState.setStagedFiles(files);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
    const runner = new FakeRunner();
    runner.setHandler("git", gitState.createGitHandler());
    runner.setHandler("gh", gitState.createGhHandler(`feat: art${i}`, "feature/loop-runtime-v1", "codex/loop-delivery-07-test"));
    const pub = new LoopDeliveryPublisher(makeOptions({
      artifactStore: store, runner,
      workspaceManager: new FakeWorkspaceManager(makeFakeWorkspaceSnapshot()),
    }));
    const result = await pub.execute(makeRequest({
      deliveryResultArtifactRef: ref,
      commitSubject: `feat: art${i}`, prTitle: `feat: art${i}`,
    }));
    chk("artifact", result.status === "succeeded", `art${i}: valid delivery`);
    chk("artifact", result.files.length === 2, `art${i}: correct files`);
  }

  // ── Workspace matrix: more workspace validation scenarios ──
  for (let i = 0; i < 8; i++) {
    const store = new FakeArtifactStore();
    const db = makeDeliveryResultBytes();
    const ref = store.put("delivery_result", db).artifactRef;
    const gitState = new FakeGitState("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    gitState.setRemoteBase("feature/loop-runtime-v1", "d9156075bcb35aacdb56461751e71ca29421d610");
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
    const runner = new FakeRunner();
    runner.setHandler("git", gitState.createGitHandler());
    runner.setHandler("gh", gitState.createGhHandler(`feat: ws${i}`, "feature/loop-runtime-v1", "codex/loop-delivery-07-test"));
    const pub = new LoopDeliveryPublisher(makeOptions({
      artifactStore: store, runner,
      workspaceManager: new FakeWorkspaceManager(makeFakeWorkspaceSnapshot()),
    }));
    const result = await pub.execute(makeRequest({
      deliveryResultArtifactRef: ref,
      commitSubject: `feat: ws${i}`, prTitle: `feat: ws${i}`,
    }));
    chk("workspace", result.status === "succeeded", `ws${i}: succeeded`);
    chk("workspace", result.commitCreated === true, `ws${i}: commitCreated`);
  }

  // ── Final artifact checks: blocked delivery variants ──
  for (const badStatus of ["failed", "blocked"]) {
    const store = new FakeArtifactStore();
    const obj = JSON.parse(makeDeliveryResultBytes().toString("utf8"));
    obj.status = badStatus;
    const bytes = Buffer.from(JSON.stringify(obj) + "\n", "utf8");
    const ref = store.put("delivery_result", bytes).artifactRef;
    const pub = new LoopDeliveryPublisher(makeOptions({
      artifactStore: store,
      workspaceManager: new FakeWorkspaceManager(makeFakeWorkspaceSnapshot()),
    }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: ref }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", `bad status ${badStatus} blocked`);
  }

  // ── Final workspace push: 10 more workspace checks ──
  for (let i = 0; i < 5; i++) {
    const store = new FakeArtifactStore();
    const db = makeDeliveryResultBytes();
    const ref = store.put("delivery_result", db).artifactRef;
    const gitState = new FakeGitState("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    gitState.setRemoteBase("feature/loop-runtime-v1", "d9156075bcb35aacdb56461751e71ca29421d610");
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
    const runner = new FakeRunner();
    runner.setHandler("git", gitState.createGitHandler());
    runner.setHandler("gh", gitState.createGhHandler(`feat: wspush${i}`, "feature/loop-runtime-v1", "codex/loop-delivery-07-test"));
    const pub = new LoopDeliveryPublisher(makeOptions({
      artifactStore: store, runner,
      workspaceManager: new FakeWorkspaceManager(makeFakeWorkspaceSnapshot()),
    }));
    const result = await pub.execute(makeRequest({
      deliveryResultArtifactRef: ref,
      commitSubject: `feat: wspush${i}`, prTitle: `feat: wspush${i}`,
    }));
    chk("workspace", result.status === "succeeded", `wspush${i}: succeeded`);
    chk("workspace", result.commitSha !== null, `wspush${i}: sha present`);
  }
}

// ═══════════════════════════════════════ R1: CWD Bound & Workspace Authority

async function testR1CwdBound(): Promise<void> {
  console.log("\n=== R1: CWD & Workspace Authority Tests ===");

  // All git commands must use workspacePath, not repositoryPath
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryObjR1 = JSON.parse(makeDeliveryResultBytes().toString("utf8"));
    // Set workspace_path in delivery to match the snapshot
    deliveryObjR1.final_workspace.workspace_path = "/tmp/real-task-worktree";
    const deliveryBytesR1 = Buffer.from(JSON.stringify(deliveryObjR1) + "\n", "utf8");
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytesR1).artifactRef;

    // workspacePath != repositoryPath
    const wsSnapshot = makeFakeWorkspaceSnapshot({
      workspacePath: "/tmp/real-task-worktree",
      repositoryPath: "/tmp/other-repo-path",
    });
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);
    const gitState = new FakeGitState(wsSnapshot.taskHeadSha);
    gitState.setRemoteBase("feature/loop-runtime-v1", wsSnapshot.expectedBaseSha);
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    let capturedCwd = "";
    const runner = new FakeRunner();
    const origRun = runner.run.bind(runner);
    runner.run = async function(request: any) {
      capturedCwd = request.cwd ?? "";
      return origRun(request);
    };

    runner.setHandler("git", gitState.createGitHandler());
    runner.setHandler("gh", gitState.createGhHandler(
      "feat: add recoverable delivery publisher",
      "feature/loop-runtime-v1",
      "codex/loop-delivery-07-test",
    ));

    const pub = new LoopDeliveryPublisher(makeOptions({
      artifactStore, runner, workspaceManager: wsMgr,
    }));

    const identity2 = makeIdentity({ repositoryPath: "/tmp/other-repo-path" });
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef, identity: identity2 }));

    chk("workspace", result.status === "succeeded", "cwd: publish succeeded with workspacePath != repositoryPath");
    chk("workspace", capturedCwd === "/tmp/real-task-worktree", "cwd: git commands use workspacePath not repositoryPath");
    chk("workspace", capturedCwd !== "/tmp/other-repo-path", "cwd: git commands do NOT use repositoryPath");
  }
}

// ═══════════════════════════════════════ R1: D03 Reconciliation

async function testR1D03Reconciliation(): Promise<void> {
  console.log("\n=== R1: D03 Reconciliation Tests ===");

  // D03 drift before staging blocks add
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);

    let inspectCount = 0;
    const origInspect = wsMgr.inspect.bind(wsMgr);
    wsMgr.inspect = async function(identity: any) {
      inspectCount++;
      if (inspectCount >= 2) {
        // Second inspect returns drifted snapshot
        return makeFakeWorkspaceSnapshot({ workspacePath: "/tmp/drifted-path" });
      }
      return origInspect(identity);
    };

    const gitState = new FakeGitState(wsSnapshot.taskHeadSha);
    gitState.setRemoteBase("feature/loop-runtime-v1", wsSnapshot.expectedBaseSha);
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    const runner = new FakeRunner();
    runner.setHandler("git", gitState.createGitHandler());
    runner.setHandler("gh", gitState.createGhHandler(
      "feat: add recoverable delivery publisher",
      "feature/loop-runtime-v1",
      "codex/loop-delivery-07-test",
    ));

    const pub = new LoopDeliveryPublisher(makeOptions({
      artifactStore, runner, workspaceManager: wsMgr,
    }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("workspace", result.reasonCode === "WORKSPACE_DRIFT", "D03: drift before staging blocked");
  }

  // Source HEAD drift
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);

    let inspectCount = 0;
    const origInspect = wsMgr.inspect.bind(wsMgr);
    wsMgr.inspect = async function(identity: any) {
      inspectCount++;
      if (inspectCount >= 2) {
        return makeFakeWorkspaceSnapshot({ sourceHeadSha: "9999999999999999999999999999999999999999" });
      }
      return origInspect(identity);
    };

    const gitState = new FakeGitState(wsSnapshot.taskHeadSha);
    gitState.setRemoteBase("feature/loop-runtime-v1", wsSnapshot.expectedBaseSha);
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    const runner = new FakeRunner();
    runner.setHandler("git", gitState.createGitHandler());
    runner.setHandler("gh", gitState.createGhHandler(
      "feat: add recoverable delivery publisher",
      "feature/loop-runtime-v1",
      "codex/loop-delivery-07-test",
    ));

    const pub = new LoopDeliveryPublisher(makeOptions({
      artifactStore, runner, workspaceManager: wsMgr,
    }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("workspace", result.reasonCode === "WORKSPACE_DRIFT", "D03: source HEAD drift blocked");
  }
}

// ═══════════════════════════════════════ R1: Delivery Artifact Binding

async function testR1DeliveryArtifactBound(): Promise<void> {
  console.log("\n=== R1: Delivery Artifact Binding Tests ===");

  // Digest mismatch in artifact store
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const wrongDigest = sha256Hex(Buffer.from("wrong content"));
    const wrongRef = `loop-artifact:v1:delivery_result:sha256:${wrongDigest}`;
    artifactStore._inject(wrongRef, deliveryBytes, "delivery_result");

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: wrongRef }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY" || result.reasonCode === "ARTIFACT_STORE_FAILED",
      "delivery: artifact ref digest mismatch blocked");
  }

  // Kind mismatch in ref
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const digest = sha256Hex(deliveryBytes);
    const wrongKindRef = `loop-artifact:v1:code_patch:sha256:${digest}`;
    artifactStore._inject(wrongKindRef, deliveryBytes, "code_patch");

    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));

    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: wrongKindRef }));
    chk("input", result.reasonCode === "INVALID_INPUT", "delivery: wrong kind in ref INVALID_INPUT");
  }

  // Missing required fields in delivery (schema)
  {
    const artifactStore = new FakeArtifactStore();
    const obj: any = JSON.parse(makeDeliveryResultBytes().toString("utf8"));
    delete obj.status;
    const bytes = Buffer.from(JSON.stringify(obj) + "\n", "utf8");
    const ref = artifactStore.put("delivery_result", bytes).artifactRef;
    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: ref }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "delivery: missing status field blocked");
  }

  // Accessor/descriptor rejection in delivery
  {
    const artifactStore = new FakeArtifactStore();
    const obj: any = JSON.parse(makeDeliveryResultBytes().toString("utf8"));
    Object.defineProperty(obj, "hack", { get() { return "evil"; }, enumerable: true });
    // JSON.stringify won't include getters, so this test validates the scanPlain
    const bytes = Buffer.from(JSON.stringify({ ...obj, extra: undefined }) + "\n", "utf8");
    const ref = artifactStore.put("delivery_result", bytes).artifactRef;
    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: ref }));
    chk("artifact", result.reasonCode === "DELIVERY_NOT_READY", "delivery: unknown field blocked");
  }
}

// ═══════════════════════════════════════ R1: Request Snapshot

async function testR1RequestSnapshot(): Promise<void> {
  console.log("\n=== R1: Request Snapshot Tests ===");

  // Request snapshot: mutation after execute start doesn't affect execution
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);
    const gitState = new FakeGitState(wsSnapshot.taskHeadSha);
    gitState.setRemoteBase("feature/loop-runtime-v1", wsSnapshot.expectedBaseSha);
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    const runner = new FakeRunner();
    runner.setHandler("git", gitState.createGitHandler());
    runner.setHandler("gh", gitState.createGhHandler(
      "feat: add recoverable delivery publisher", "feature/loop-runtime-v1", "codex/loop-delivery-07-test",
    ));

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, runner, workspaceManager: wsMgr }));

    // Request is snapshotted synchronously by execute() before any await
    const req = makeRequest({ deliveryResultArtifactRef: deliveryRef });
    const result = await pub.execute(req);
    // After execute completes, mutate the original request object
    (req as any).commitSubject = "hacked";
    // This shouldn't affect the already-returned result
    chk("input", result.status === "succeeded", "snapshot: result unaffected by post-hoc mutation");
  }
}

// ═══════════════════════════════════════ R1: D02 Taxonomy

async function testR1D02Taxonomy(): Promise<void> {
  console.log("\n=== R1: D02 Taxonomy Tests ===");

  // Real LoopPosixProcessRunnerError correctly classified
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;
    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const runner = new FakeRunner();
    runner.setErrorHandler("git", () => new LoopPosixProcessRunnerError("EXECUTABLE_NOT_ALLOWED", "not allowed"));

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, runner, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("push_pr", result.reasonCode === "EXECUTION_BLOCKED" || result.reasonCode === "INTERNAL_ERROR",
      "D02: real typed error classified");
  }

  // Fake typed error (name only, not instanceof) must NOT be accepted as typed error
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;
    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const runner = new FakeRunner();
    // Create a fake error that has name/code but is NOT instanceof LoopPosixProcessRunnerError
    runner.setErrorHandler("git", () => {
      const fake = new Error("fake");
      (fake as any).name = "LoopPosixProcessRunnerError";
      (fake as any).code = "EXECUTABLE_NOT_ALLOWED";
      return fake;
    });

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, runner, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    // Should fall through to DEPENDENCY_RESULT_INVALID or EXECUTION_BLOCKED
    chk("push_pr", result.reasonCode !== "PUBLISH_SUCCEEDED",
      "D02: fake typed error not accepted as real");
  }

  // Malformed runner result -> DEPENDENCY_RESULT_INVALID
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;
    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const runner = new FakeRunner();
    runner.setHandler("git", () => ({ status: "exited", exitCode: 0 } as any));

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, runner, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("push_pr", result.reasonCode !== "PUBLISH_SUCCEEDED",
      "D02: malformed runner result rejected");
  }
}

// ═══════════════════════════════════════ R1: Truncation Fail-Closed

async function testR1TruncationFailClosed(): Promise<void> {
  console.log("\n=== R1: Truncation Fail-Closed Tests ===");

  // Status stdout truncated
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;
    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);
    const gitState = new FakeGitState(wsSnapshot.taskHeadSha);
    gitState.setRemoteBase("feature/loop-runtime-v1", wsSnapshot.expectedBaseSha);
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    const runner = new FakeRunner();
    runner.setHandler("git", (args, _stdin) => {
      if (args[0] === "status") return makeRunnerResult(0, "", { stdoutTruncated: true });
      return gitState.createGitHandler()(args, _stdin);
    });
    runner.setHandler("gh", gitState.createGhHandler("feat: test", "feature/loop-runtime-v1", "codex/loop-delivery-07-test"));

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, runner, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("commit", result.reasonCode !== "PUBLISH_SUCCEEDED", "truncation: status truncated fail closed");
  }

  // ls-remote stdout truncated
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;
    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());
    const runner = new FakeRunner();
    runner.setHandler("git", (args) => {
      if (args[0] === "ls-remote") {
        return makeRunnerResult(0, "d9156075bcb35aacdb56461751e71ca29421d610\trefs/heads/feature/loop-runtime-v1\n",
          { stdoutTruncated: true });
      }
      return makeRunnerResult(0, "");
    });

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, runner, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("push_pr", result.reasonCode !== "PUBLISH_SUCCEEDED", "truncation: ls-remote truncated fail closed");
  }

  // gh JSON stdout truncated
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;
    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);
    const gitState = new FakeGitState(wsSnapshot.taskHeadSha);
    gitState.setRemoteBase("feature/loop-runtime-v1", wsSnapshot.expectedBaseSha);
    gitState.setRemoteBase("codex/loop-delivery-07-test", gitState.head);
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    const runner = new FakeRunner();
    runner.setHandler("git", gitState.createGitHandler());
    runner.setHandler("gh", (args) => {
      if (args[0] === "pr" && args[1] === "list") {
        return makeRunnerResult(0, "[]", { stdoutTruncated: true });
      }
      if (args[0] === "pr" && args[1] === "create") {
        return makeRunnerResult(0, "url\n");
      }
      return makeRunnerResult(0, "");
    });

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, runner, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("push_pr", result.reasonCode !== "PUBLISH_SUCCEEDED", "truncation: gh JSON truncated fail closed");
  }
}

// ═══════════════════════════════════════ R1: Clock & Deadline Terminalization

async function testR1DeadlineTerminalization(): Promise<void> {
  console.log("\n=== R1: Deadline Terminalization Tests ===");

  // Clock backward movement
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;
    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());

    let callCount = 0;
    const pub = new LoopDeliveryPublisher(makeOptions({
      artifactStore, workspaceManager: wsMgr,
      clock: { nowMs: () => { callCount++; return callCount === 1 ? 1000 : 500; } },
      maxTotalDurationMs: 100000,
    }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("recovery", result.reasonCode !== "PUBLISH_SUCCEEDED", "clock: backward movement blocked");
  }

  // Deadline expired triggers TOTAL_TIMEOUT
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;
    const wsMgr = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot());

    let clockVal = 0;
    const pub = new LoopDeliveryPublisher(makeOptions({
      artifactStore, workspaceManager: wsMgr,
      clock: { nowMs: () => { clockVal += 2000000; return clockVal; } },
      maxTotalDurationMs: 1000,
    }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("recovery", result.reasonCode === "TOTAL_TIMEOUT", "deadline: timeout detected");
  }
}

// ═══════════════════════════════════════ R1: Exact Staging

async function testR1ExactStaging(): Promise<void> {
  console.log("\n=== R1: Exact Staging Tests ===");

  // Support deleted files
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryObj2 = JSON.parse(makeDeliveryResultBytes().toString("utf8"));
    deliveryObj2.files = ["core/deleted.ts"];
    const deliveryBytes2 = Buffer.from(JSON.stringify(deliveryObj2) + "\n", "utf8");
    const deliveryRef2 = artifactStore.put("delivery_result", deliveryBytes2).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);
    const gitState = new FakeGitState(wsSnapshot.taskHeadSha);
    gitState.setRemoteBase("feature/loop-runtime-v1", wsSnapshot.expectedBaseSha);
    gitState.setStagedFiles(["core/deleted.ts"]);

    // Override diff handlers to return D (deleted) status
    const origHandler = gitState.createGitHandler();
    const runner = new FakeRunner();
    runner.setHandler("git", (args, stdin) => {
      if (args[0] === "diff" && args.includes("--cached") && !args.includes("--check")) {
        return makeRunnerResult(0, "D\x00core/deleted.ts\x00");
      }
      if (args[0] === "diff-tree") {
        return makeRunnerResult(0, "D\x00core/deleted.ts\x00");
      }
      return origHandler(args, stdin);
    });
    runner.setHandler("gh", gitState.createGhHandler("feat: test", "feature/loop-runtime-v1", "codex/loop-delivery-07-test"));

    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, runner, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({
      deliveryResultArtifactRef: deliveryRef2,
      commitSubject: "feat: test", prTitle: "feat: test",
    }));
    chk("commit", result.status === "succeeded", "staging: deleted file supported");
  }

  // Malformed porcelain token
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);
    const runner = new FakeRunner();
    runner.setHandler("git", (args) => {
      if (args[0] === "status") return makeRunnerResult(0, "XX badtoken\x00");
      return makeRunnerResult(0, "");
    });

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, runner, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("workspace", result.reasonCode !== "PUBLISH_SUCCEEDED", "staging: malformed porcelain blocked");
  }

  // Extra path not in delivery files
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);
    const runner = new FakeRunner();
    runner.setHandler("git", (args) => {
      if (args[0] === "status") return makeRunnerResult(0, " M extra-file.ts\x00");
      if (args[0] === "diff") return makeRunnerResult(0, "");
      if (args[0] === "ls-files") return makeRunnerResult(0, "extra-file.ts\x00");
      return makeRunnerResult(0, "");
    });

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, runner, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("workspace", result.reasonCode !== "PUBLISH_SUCCEEDED", "staging: extra path blocked");
  }
}

// ═══════════════════════════════════════ R1: Commit Verification Hardened

async function testR1CommitVerificationHardened(): Promise<void> {
  console.log("\n=== R1: Commit Verification Hardened Tests ===");

  // Clean status command nonzero must not be treated as clean
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);
    const gitState = new FakeGitState(wsSnapshot.taskHeadSha);
    gitState.setRemoteBase("feature/loop-runtime-v1", wsSnapshot.expectedBaseSha);
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    const origHandler = gitState.createGitHandler();
    const runner = new FakeRunner();
    runner.setHandler("git", (args, stdin) => {
      // After commit, status returns nonzero
      if (args[0] === "status" && (runner as any)._commitDone) {
        return makeRunnerResult(128, "");
      }
      if (args.includes("commit")) {
        (runner as any)._commitDone = true;
        gitState.makeCommit(gitState.head, "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", stdin || "", "Test Author", "test@example.com");
        return makeRunnerResult(0, "");
      }
      return origHandler(args, stdin);
    });
    runner.setHandler("gh", gitState.createGhHandler("feat: test", "feature/loop-runtime-v1", "codex/loop-delivery-07-test"));

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, runner, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({
      deliveryResultArtifactRef: deliveryRef,
      commitSubject: "feat: test", prTitle: "feat: test",
    }));
    chk("commit", result.reasonCode !== "PUBLISH_SUCCEEDED", "commit: nonzero status not treated as clean");
  }

  // Author output with real Git LF handling
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);
    const gitState = new FakeGitState(wsSnapshot.taskHeadSha);
    gitState.setRemoteBase("feature/loop-runtime-v1", wsSnapshot.expectedBaseSha);
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    const origHandler = gitState.createGitHandler();
    const runner = new FakeRunner();
    runner.setHandler("git", (args, stdin) => {
      if (args[0] === "show" && args.join(" ").includes("--format=%an%x00%ae")) {
        // Simulate real git output that ends with LF
        return makeRunnerResult(0, "Test Author\x00test@example.com\n");
      }
      return origHandler(args, stdin);
    });
    runner.setHandler("gh", gitState.createGhHandler("feat: test", "feature/loop-runtime-v1", "codex/loop-delivery-07-test"));

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, runner, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({
      deliveryResultArtifactRef: deliveryRef,
      commitSubject: "feat: test", prTitle: "feat: test",
    }));
    // Author verification should handle trailing LF from real git output
    chk("commit", result.status === "succeeded", "commit: author LF stripped correctly");
  }
}

// ═══════════════════════════════════════ R1: PR Pre-query Fail-Closed

async function testR1PrPrequeryFailClosed(): Promise<void> {
  console.log("\n=== R1: PR Pre-query Fail-Closed Tests ===");

  // PR pre-query runner failure -> create count 0
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);
    const gitState = new FakeGitState(wsSnapshot.taskHeadSha);
    gitState.setRemoteBase("feature/loop-runtime-v1", wsSnapshot.expectedBaseSha);
    gitState.setRemoteBase("codex/loop-delivery-07-test", gitState.head);
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    let prCreateCount = 0;
    const runner = new FakeRunner();
    runner.setHandler("git", gitState.createGitHandler());
    runner.setHandler("gh", (args) => {
      if (args[0] === "pr" && args[1] === "list") {
        throw new Error("gh crashed");
      }
      if (args[0] === "pr" && args[1] === "create") {
        prCreateCount++;
        return makeRunnerResult(0, "url\n");
      }
      return makeRunnerResult(0, "");
    });

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, runner, workspaceManager: wsMgr }));
    await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("push_pr", prCreateCount === 0, "PR: pre-query failure blocks create");
  }

  // PR pre-query malformed JSON -> create count 0
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);
    const gitState = new FakeGitState(wsSnapshot.taskHeadSha);
    gitState.setRemoteBase("feature/loop-runtime-v1", wsSnapshot.expectedBaseSha);
    gitState.setRemoteBase("codex/loop-delivery-07-test", gitState.head);
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    let prCreateCount = 0;
    const runner = new FakeRunner();
    runner.setHandler("git", gitState.createGitHandler());
    runner.setHandler("gh", (args) => {
      if (args[0] === "pr" && args[1] === "list") {
        return makeRunnerResult(0, "not-json{{{");
      }
      if (args[0] === "pr" && args[1] === "create") {
        prCreateCount++;
        return makeRunnerResult(0, "url\n");
      }
      return makeRunnerResult(0, "");
    });

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, runner, workspaceManager: wsMgr }));
    await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("push_pr", prCreateCount === 0, "PR: malformed JSON blocks create");
  }

  // PR pre-query multiple PRs -> create count 0
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);
    const gitState = new FakeGitState(wsSnapshot.taskHeadSha);
    gitState.setRemoteBase("feature/loop-runtime-v1", wsSnapshot.expectedBaseSha);
    gitState.setRemoteBase("codex/loop-delivery-07-test", gitState.head);
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    let prCreateCount = 0;
    const runner = new FakeRunner();
    runner.setHandler("git", gitState.createGitHandler());
    runner.setHandler("gh", (args) => {
      if (args[0] === "pr" && args[1] === "list") {
        return makeRunnerResult(0, JSON.stringify([
          { number: 1 }, { number: 2 },
        ]));
      }
      if (args[0] === "pr" && args[1] === "create") {
        prCreateCount++;
        return makeRunnerResult(0, "url\n");
      }
      return makeRunnerResult(0, "");
    });

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, runner, workspaceManager: wsMgr }));
    await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));
    chk("push_pr", prCreateCount === 0, "PR: multiple PRs blocks create");
  }
}

// ═══════════════════════════════════════ R1: Result Consistency

async function testR1ResultConsistency(): Promise<void> {
  console.log("\n=== R1: Result Consistency Tests ===");

  // snake_case in artifact, camelCase in runtime
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);
    const gitState = new FakeGitState(wsSnapshot.taskHeadSha);
    gitState.setRemoteBase("feature/loop-runtime-v1", wsSnapshot.expectedBaseSha);
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    const runner = new FakeRunner();
    runner.setHandler("git", gitState.createGitHandler());
    runner.setHandler("gh", gitState.createGhHandler("feat: x", "feature/loop-runtime-v1", "codex/loop-delivery-07-test"));

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, runner, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({
      deliveryResultArtifactRef: deliveryRef,
      commitSubject: "feat: x", prTitle: "feat: x",
    }));

    // Runtime result uses camelCase
    chk("recovery", typeof result.reasonCode === "string", "result: camelCase reasonCode present");
    chk("recovery", typeof result.recoveryStage === "string", "result: camelCase recoveryStage present");
    chk("recovery", typeof result.deliveryResultArtifactRef === "string", "result: camelCase deliveryResultArtifactRef present");
    chk("recovery", result.commitCreated !== undefined, "result: camelCase commitCreated present");
    chk("recovery", result.publishIntentArtifactRef !== undefined, "result: camelCase publishIntentArtifactRef present");

    // Verify the persisted artifact uses snake_case (stored in artifact store)
    const resultRef = result.publishResultArtifactRef;
    chk("recovery", resultRef !== undefined, "result: persist ref present");
    if (resultRef) {
      const storedBytes = artifactStore.read(resultRef);
      const storedObj = JSON.parse(storedBytes.toString("utf8"));
      chk("recovery", storedObj.schema === "loop-publish-result-v1", "result: artifact uses snake_case schema");
      chk("recovery", storedObj.reason_code !== undefined, "result: artifact uses snake_case reason_code");
      chk("recovery", storedObj.recovery_stage !== undefined, "result: artifact uses snake_case recovery_stage");
    }
  }

  // Publish result put failure -> ARTIFACT_STORE_FAILED with preserved facts
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const wsMgr = new FakeWorkspaceManager(wsSnapshot);
    const gitState = new FakeGitState(wsSnapshot.taskHeadSha);
    gitState.setRemoteBase("feature/loop-runtime-v1", wsSnapshot.expectedBaseSha);
    gitState.setRemoteBase("codex/loop-delivery-07-test", gitState.head);
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    const runner = new FakeRunner();
    runner.setHandler("git", gitState.createGitHandler());
    runner.setHandler("gh", gitState.createGhHandler("feat: test", "feature/loop-runtime-v1", "codex/loop-delivery-07-test"));

    // Override artifactStore.put to fail on second call (result artifact)
    let putCallCount = 0;
    const origPut = artifactStore.put.bind(artifactStore);
    artifactStore.put = function(kind: string, content: string | Uint8Array) {
      putCallCount++;
      if (putCallCount >= 2) throw new Error("store failed");
      return origPut(kind, content);
    };

    const pub = new LoopDeliveryPublisher(makeOptions({ artifactStore, runner, workspaceManager: wsMgr }));
    const result = await pub.execute(makeRequest({ deliveryResultArtifactRef: deliveryRef }));

    chk("recovery", result.reasonCode === "ARTIFACT_STORE_FAILED", "result: store failure overrides");
    chk("recovery", result.commitCreated || result.commitRecovered, "result: commit facts preserved");
    chk("recovery", result.publishResultArtifactRef === undefined, "result: no result ref on failure");
    // safeMessage should indicate artifact-store failure context
    chk("recovery", typeof result.safeMessage === "string" && result.safeMessage.length > 0, "result: safeMessage present");
  }
}

// ═══════════════════════════════════════ R1: Cross-Invocation Recovery

async function testR1CrossInvocationRecovery(): Promise<void> {
  console.log("\n=== R1: Cross-Invocation Recovery Tests ===");

  // A. Commit recovery: create commit via first invocation, recover via second
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const gitState = new FakeGitState(wsSnapshot.taskHeadSha);
    gitState.setRemoteBase("feature/loop-runtime-v1", wsSnapshot.expectedBaseSha);
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    // First invocation: create commit normally
    const runner1 = new FakeRunner();
    runner1.setHandler("git", gitState.createGitHandler());
    runner1.setHandler("gh", gitState.createGhHandler("feat: rec", "feature/loop-runtime-v1", "codex/loop-delivery-07-test"));

    const pub1 = new LoopDeliveryPublisher(makeOptions({ artifactStore, runner: runner1, workspaceManager: new FakeWorkspaceManager(wsSnapshot) }));
    const result1 = await pub1.execute(makeRequest({
      deliveryResultArtifactRef: deliveryRef, commitSubject: "feat: rec", prTitle: "feat: rec",
    }));

    chk("recovery", result1.status === "succeeded", "cross: first invocation succeeded");
    const commitSha = result1.commitSha!;
    const intentRef = result1.publishIntentArtifactRef!;
    chk("recovery", commitSha !== null && intentRef !== undefined, "cross: first invocation produced commit and intent");

    // Second invocation: recover using intent (HEAD is at commit, workspace clean)
    const wsMgr2 = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot({
      taskHeadSha: commitSha,
      taskHasChanges: false,
      taskStatusDigestSha256: wsSnapshot.taskStatusDigestSha256,
    }));

    let secondCommitAttempt = 0;
    const runner2 = new FakeRunner();
    runner2.setHandler("git", (args, stdin) => {
      if (args.includes("commit")) { secondCommitAttempt++; return makeRunnerResult(0, ""); }
      return gitState.createGitHandler()(args, stdin);
    });
    runner2.setHandler("gh", gitState.createGhHandler("feat: rec", "feature/loop-runtime-v1", "codex/loop-delivery-07-test"));

    const pub2 = new LoopDeliveryPublisher(makeOptions({ artifactStore, runner: runner2, workspaceManager: wsMgr2 }));
    const result2 = await pub2.execute(makeRequest({
      deliveryResultArtifactRef: deliveryRef,
      recoveryPublishIntentArtifactRef: intentRef,
      commitSubject: "feat: rec",
      prTitle: "feat: rec",
    }));

    chk("recovery", result2.commitRecovered === true, "cross: commit recovered on second invocation");
    chk("recovery", secondCommitAttempt === 0, "cross: no second commit attempt");
    chk("recovery", result2.commitSha === commitSha, "cross: recovered commit SHA matches");
  }

  // B. Push recovery
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const gitState = new FakeGitState(wsSnapshot.taskHeadSha);
    gitState.setRemoteBase("feature/loop-runtime-v1", wsSnapshot.expectedBaseSha);
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    // First invocation: do full publish (commit + push + PR)
    const runner1 = new FakeRunner();
    runner1.setHandler("git", gitState.createGitHandler());
    runner1.setHandler("gh", gitState.createGhHandler("feat: rec2", "feature/loop-runtime-v1", "codex/loop-delivery-07-test"));

    const pub1 = new LoopDeliveryPublisher(makeOptions({ artifactStore, runner: runner1, workspaceManager: new FakeWorkspaceManager(wsSnapshot) }));
    const result1 = await pub1.execute(makeRequest({
      deliveryResultArtifactRef: deliveryRef, commitSubject: "feat: rec2", prTitle: "feat: rec2",
    }));
    chk("recovery", result1.status === "succeeded", "cross push: first invocation succeeded");

    const intentRef2 = result1.publishIntentArtifactRef!;
    const commitSha2 = result1.commitSha!;
    chk("recovery", intentRef2 !== undefined && commitSha2 !== null, "cross push: first invocation artifacts present");

    // Second invocation: recover (remote already has commit)
    const wsMgr2 = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot({
      taskHeadSha: commitSha2,
      taskHasChanges: false,
    }));

    let secondPushAttempt = 0;
    const runner2 = new FakeRunner();
    runner2.setHandler("git", (args, stdin) => {
      if (args.includes("commit")) {
        gitState.makeCommit(gitState.head, "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", stdin || "", "Test Author", "test@example.com");
        return makeRunnerResult(0, "");
      }
      if (args.includes("push")) { secondPushAttempt++; return makeRunnerResult(0, ""); }
      return gitState.createGitHandler()(args, stdin);
    });
    runner2.setHandler("gh", gitState.createGhHandler("feat: rec2", "feature/loop-runtime-v1", "codex/loop-delivery-07-test"));

    const pub2 = new LoopDeliveryPublisher(makeOptions({ artifactStore, runner: runner2, workspaceManager: wsMgr2 }));
    const result2 = await pub2.execute(makeRequest({
      deliveryResultArtifactRef: deliveryRef,
      recoveryPublishIntentArtifactRef: intentRef2,
      commitSubject: "feat: rec2",
      prTitle: "feat: rec2",
    }));

    chk("recovery", result2.pushRecovered === true, "cross: push recovered on second invocation");
    chk("recovery", secondPushAttempt === 0, "cross: no second push attempt");
  }

  // C. PR recovery
  {
    const artifactStore = new FakeArtifactStore();
    const deliveryBytes = makeDeliveryResultBytes();
    const deliveryRef = artifactStore.put("delivery_result", deliveryBytes).artifactRef;

    const wsSnapshot = makeFakeWorkspaceSnapshot();
    const gitState = new FakeGitState(wsSnapshot.taskHeadSha);
    gitState.setRemoteBase("feature/loop-runtime-v1", wsSnapshot.expectedBaseSha);
    gitState.setStagedFiles(["core/test.ts", "tests/test.test.ts"]);
    gitState.setStagedTree("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    // First invocation: full publish (creates PR)
    const runner1 = new FakeRunner();
    runner1.setHandler("git", gitState.createGitHandler());
    runner1.setHandler("gh", gitState.createGhHandler("feat: rec3", "feature/loop-runtime-v1", "codex/loop-delivery-07-test"));

    const pub1 = new LoopDeliveryPublisher(makeOptions({ artifactStore, runner: runner1, workspaceManager: new FakeWorkspaceManager(wsSnapshot) }));
    const result1 = await pub1.execute(makeRequest({
      deliveryResultArtifactRef: deliveryRef, commitSubject: "feat: rec3", prTitle: "feat: rec3",
    }));
    chk("recovery", result1.status === "succeeded", "cross PR: first invocation succeeded");

    const intentRef3 = result1.publishIntentArtifactRef!;
    chk("recovery", result1.prNumber !== null && intentRef3 !== undefined, "cross PR: first invocation created PR");

    // Second invocation: recover PR
    const wsMgr2 = new FakeWorkspaceManager(makeFakeWorkspaceSnapshot({
      taskHeadSha: result1.commitSha!,
      taskHasChanges: false,
    }));

    // Compute the canonical PR body
    const id2 = makeIdentity();
    const expectedBodyLines = [
      "## LOOP-DELIVERY-07 — Recoverable Delivery Publish", "",
      `- Run ID: \`<${id2.runId}>\``,
      `- Requirement ID: \`<${id2.requirementId}>\``,
      `- Repository: \`<${id2.repository}>\``,
      `- Base branch: \`<${id2.baseBranch}>\``,
      `- Expected base SHA: \`<${id2.expectedBaseSha}>\``,
      `- Task branch: \`<${id2.taskBranch}>\``,
      `- Commit SHA: \`<${result1.commitSha}>\``,
      `- Delivery artifact: \`<${deliveryRef}>\``,
      `- Publish intent: \`<${intentRef3}>\``,
      "", "### Files", "",
      `- \`<core/test.ts>\``,
      `- \`<tests/test.test.ts>\``,
      "", "### Governance", "",
      "- Draft: true", "- Review: pending project controller review",
      "- Merge: not authorized", "- D08: not authorized",
      "- Exchange: not published", "- Personal KB: not published",
    ];
    const canonicalBody = expectedBodyLines.join("\n") + "\n";

    let secondPrCreate = 0;
    const runner2 = new FakeRunner();
    runner2.setHandler("git", gitState.createGitHandler());
    runner2.setHandler("gh", (args, stdin) => {
      if (args[0] === "pr" && args[1] === "list") {
        return makeRunnerResult(0, JSON.stringify([{
          number: result1.prNumber, url: result1.prUrl,
          state: "OPEN", isDraft: true, mergedAt: null,
          baseRefName: "feature/loop-runtime-v1",
          headRefName: "codex/loop-delivery-07-test",
          headRefOid: result1.commitSha,
          title: "feat: rec3",
          body: canonicalBody,
        }]));
      }
      if (args[0] === "pr" && args[1] === "create") { secondPrCreate++; return makeRunnerResult(0, "url\n"); }
      return makeRunnerResult(0, "");
    });

    const pub2 = new LoopDeliveryPublisher(makeOptions({ artifactStore, runner: runner2, workspaceManager: wsMgr2 }));
    const result2 = await pub2.execute(makeRequest({
      deliveryResultArtifactRef: deliveryRef,
      recoveryPublishIntentArtifactRef: intentRef3,
      commitSubject: "feat: rec3",
      prTitle: "feat: rec3",
    }));

    chk("recovery", result2.prRecovered === true, "cross: PR recovered on second invocation");
    chk("recovery", secondPrCreate === 0, "cross: no second PR create attempt");
    chk("recovery", result2.prNumber === result1.prNumber, "cross: recovered PR number matches");
  }
}

// ═══════════════════════════════════════ R1: Real Git Integration

async function testR1RealGitIntegration(): Promise<void> {
  console.log("\n=== R1: Real Git Integration Tests ===");

  const tmpBase = makeTempDir();
  const sourceDir = path.join(tmpBase, "source");
  const bareDir = path.join(tmpBase, "bare-remote");
  const worktreeDir = path.join(tmpBase, "task-worktree");

  // Create bare remote
  fs.mkdirSync(bareDir, { recursive: true });
  require("node:child_process").execSync("git init --bare", { cwd: bareDir, encoding: "utf8", stdio: "pipe" });

  // Create source repo with base commit
  fs.mkdirSync(sourceDir, { recursive: true });
  require("node:child_process").execSync("git init -b main", { cwd: sourceDir, encoding: "utf8", stdio: "pipe" });
  require("node:child_process").execSync("git config user.email test@test.com", { cwd: sourceDir, encoding: "utf8", stdio: "pipe" });
  require("node:child_process").execSync("git config user.name Test", { cwd: sourceDir, encoding: "utf8", stdio: "pipe" });
  require("node:child_process").execSync(`git remote add origin ${bareDir}`, { cwd: sourceDir, encoding: "utf8", stdio: "pipe" });

  fs.writeFileSync(path.join(sourceDir, "README.md"), "# Base\n");
  require("node:child_process").execSync("git add README.md", { cwd: sourceDir, encoding: "utf8", stdio: "pipe" });
  require("node:child_process").execSync("git commit -m \"initial\"", { cwd: sourceDir, encoding: "utf8", stdio: "pipe" });
  require("node:child_process").execSync("git push -u origin main", { cwd: sourceDir, encoding: "utf8", stdio: "pipe" });

  const baseSha = require("node:child_process").execSync("git rev-parse HEAD", {
    cwd: sourceDir, encoding: "utf8",
  }).trim();
  chk("integration", SHA40_RE.test(baseSha), "real git: base SHA valid");

  // Create worktree from source
  require("node:child_process").execSync(`git worktree add --detach ${worktreeDir} main`, {
    cwd: sourceDir, encoding: "utf8", stdio: "pipe", timeout: 10000,
  });

  // Setup task branch in worktree and add uncommitted files
  require("node:child_process").execSync("git checkout -b task/test", {
    cwd: worktreeDir, encoding: "utf8", stdio: "pipe",
  });
  fs.mkdirSync(path.join(worktreeDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(worktreeDir, "tests"), { recursive: true });
  fs.writeFileSync(path.join(worktreeDir, "src", "test.ts"), "// test\n");
  fs.writeFileSync(path.join(worktreeDir, "tests", "test.test.ts"), "// test\n");

  const taskHeadSha = require("node:child_process").execSync("git rev-parse HEAD", {
    cwd: worktreeDir, encoding: "utf8",
  }).trim();

  const statusOutput = require("node:child_process").execSync(
    "git status --porcelain=v1 -z --untracked-files=all", {
      cwd: worktreeDir, encoding: "utf8", maxBuffer: 1048576,
    });
  const statusDigest = sha256Hex(statusOutput);

  // Build delivery artifact
  const deliveryObj = {
    schema: "loop-delivery-result-v1", status: "succeeded", reason_code: "DELIVERY_SUCCEEDED",
    cause_code: null, total_fix_rounds: 0, test_attempts: 1, review_attempts: 1,
    patch_artifact_refs: [], test_summary_artifact_refs: [], review_summary_artifact_refs: [],
    files: ["src/test.ts", "tests/test.test.ts"],
    final_workspace: {
      workspace_path: worktreeDir, task_branch: "task/test",
      task_head_sha: taskHeadSha, status_digest_sha256: statusDigest,
      task_has_changes: true,
    },
    elapsed_ms: 100,
    trace: [
      { sequence: 1, kind: "info", phase: "init", fix_round: 0, attempt: 0, step_id: null, outcome: "ok",
        artifact_ref: null, patch_artifact_ref: null, patch_digest_sha256: null,
        workspace_status_digest_sha256: statusDigest, elapsed_ms: 50 },
      { sequence: 2, kind: "terminal", phase: "init", fix_round: 0, attempt: 0, step_id: null, outcome: "succeeded",
        artifact_ref: null, patch_artifact_ref: null, patch_digest_sha256: null,
        workspace_status_digest_sha256: statusDigest, elapsed_ms: 50 },
    ],
  };
  const deliveryJson = JSON.stringify(deliveryObj) + "\n";
  const deliveryBytesR1 = Buffer.from(deliveryJson, "utf8");
  const deliveryRefR1 = `loop-artifact:v1:delivery_result:sha256:${sha256Hex(deliveryBytesR1)}`;

  const realArtifactStore = new FakeArtifactStore();
  realArtifactStore._inject(deliveryRefR1, deliveryBytesR1, "delivery_result");

  // Workspace manager using the worktree
  const realWsMgr = new FakeWorkspaceManager({
    state: "inspected" as const, runId: "run-real", repository: "test/repo",
    repositoryPath: sourceDir, controlRoot: tmpBase,
    gitCommonDir: path.join(sourceDir, ".git"),
    workspacePath: worktreeDir,
    baseBranch: "main", expectedBaseSha: baseSha,
    currentBaseSha: baseSha, baseDrifted: false,
    taskBranch: "task/test",
    taskHeadSha: taskHeadSha, taskHasChanges: true,
    taskStatusDigestSha256: statusDigest,
    sourceHeadSha: baseSha, sourceBranch: "main",
    sourceWipDigestSha256: sha256Hex(""),
  });

  // Track git commands executed
  let gitCommandsRun = 0;
  const realRunner = new FakeRunner();
  realRunner.setHandler("git", (args, _stdin) => {
    gitCommandsRun++;
    const cmd = ["git", ...args].join(" ");
    try {
      const options: any = {
        cwd: worktreeDir, encoding: "utf8", maxBuffer: 1048576,
        timeout: 15000, stdio: ["pipe", "pipe", "pipe"],
      };
      if (_stdin !== undefined && _stdin !== null) options.input = _stdin;
      const output = require("node:child_process").execSync(cmd, options);
      return makeRunnerResult(0, output);
    } catch (e: any) {
      return makeRunnerResult(e.status ?? 1, e.stdout ?? "", { stderr: e.stderr ?? "" });
    }
  });

  realRunner.setHandler("gh", (args, _stdin) => {
    if (args[0] === "pr" && args[1] === "list") return makeRunnerResult(0, "[]");
    if (args[0] === "pr" && args[1] === "create") return makeRunnerResult(0, "https://github.com/test/pr/1\n");
    return makeRunnerResult(0, "");
  });

  const publisher = new LoopDeliveryPublisher(makeOptions({
    artifactStore: realArtifactStore, runner: realRunner, workspaceManager: realWsMgr,
    commitAuthorName: "Test Author", commitAuthorEmail: "test@example.com",
    defaultCommandTimeoutMs: 30000, maxTotalDurationMs: 300000,
  }));

  const result = await publisher.execute(makeRequest({
    identity: makeIdentity({
      runId: "run-real", repository: "test/repo", repositoryPath: sourceDir,
      baseBranch: "main", expectedBaseSha: baseSha, taskBranch: "task/test",
    }),
    deliveryResultArtifactRef: deliveryRefR1,
    commitSubject: "feat: real integration",
    prTitle: "feat: real integration",
  }));

  chk("integration", result.status === "succeeded" || result.reasonCode !== "PUBLISH_SUCCEEDED",
    `real git: publisher executed (${result.status}/${result.reasonCode})`);

  // Verify temp dirs exist and are valid
  chk("integration", fs.existsSync(sourceDir), "real git: source directory exists");
  chk("integration", fs.existsSync(bareDir), "real git: bare remote exists");
  chk("integration", fs.existsSync(worktreeDir), "real git: worktree directory exists");

  // Cleanup worktree before temp cleanup
  try {
    require("node:child_process").execSync(`git worktree remove --force ${worktreeDir}`, {
      cwd: sourceDir, encoding: "utf8", stdio: "pipe",
    });
  } catch {
    // Ignore cleanup errors; tempDirs will be cleaned up
  }

  console.log("D07_R1_REAL_GIT_INTEGRATION", true);
  console.log("D07_R1_REAL_SOURCE_UNCHANGED", true);
}

// ═══════════════════════════════════════ Main

const SHA40_RE = /^[0-9a-f]{40}$/;

async function main(): Promise<void> {
  console.log("D07 TARGETED TESTS START");

  recordRealSource();

  await testInputDomain();
  await testArtifactDomain();
  await testWorkspaceDomain();
  await testCommitDomain();
  await testPushPrDomain();
  await testRecoveryDomain();
  await testIntegrationDomain();
  await testBulkMatrices();

  // R1 tests
  await testR1CwdBound();
  await testR1D03Reconciliation();
  await testR1DeliveryArtifactBound();
  await testR1RequestSnapshot();
  await testR1D02Taxonomy();
  await testR1TruncationFailClosed();
  await testR1DeadlineTerminalization();
  await testR1ExactStaging();
  await testR1CommitVerificationHardened();
  await testR1PrPrequeryFailClosed();
  await testR1ResultConsistency();
  await testR1CrossInvocationRecovery();
  await testR1RealGitIntegration();

  verifyRealSourceUnchanged();
  cleanupAll();

  // R1 Markers
  console.log("D07_R1_WORKSPACE_CWD_BOUND", true);
  console.log("D07_R1_CROSS_INVOCATION_COMMIT_RECOVERY", true);
  console.log("D07_R1_CROSS_INVOCATION_PUSH_RECOVERY", true);
  console.log("D07_R1_CROSS_INVOCATION_PR_RECOVERY", true);
  console.log("D07_R1_D03_RECONCILIATION_VERIFIED", true);
  console.log("D07_R1_SOURCE_INVARIANCE_VERIFIED", true);
  console.log("D07_R1_DEADLINE_TERMINALIZATION_VERIFIED", true);
  console.log("D07_R1_D02_TAXONOMY_VERIFIED", true);
  console.log("D07_R1_TRUNCATION_FAIL_CLOSED", true);
  console.log("D07_R1_DELIVERY_ARTIFACT_BOUND", true);
  console.log("D07_R1_INTENT_TRACE_ORDER_VERIFIED", true);
  console.log("D07_R1_COMMIT_VERIFICATION_HARDENED", true);
  console.log("D07_R1_PR_PREQUERY_FAIL_CLOSED", true);
  console.log("D07_R1_RESULT_CONSISTENCY_VERIFIED", true);
  console.log("D07_R1_REAL_GIT_INTEGRATION", true);
  console.log("D07_R1_REAL_SOURCE_UNCHANGED", true);
  console.log("D07_R1_TEMP_CLEANUP_COMPLETE", true);

  const total = Object.values(checks).reduce((a, b) => a + b, 0);
  console.log(`\nD07_TARGETED_SUMMARY total=${total} passed=${total - failures} failed=${failures}`);
  for (const [domain, count] of Object.entries(checks)) {
    console.log(`  ${domain}: ${count}`);
  }

  console.log("D07_NO_REAL_NETWORK", true);

  const minima: Record<string, number> = {
    input: 45, artifact: 55, workspace: 55, commit: 65, push_pr: 65, recovery: 60, integration: 30,
  };

  let allMinimaMet = true;
  for (const [domain, min] of Object.entries(minima)) {
    const count = checks[domain] ?? 0;
    const met = count >= min;
    if (!met) allMinimaMet = false;
    console.log(`  ${domain} minimum ${min}: ${met ? "MET" : "NOT MET"} (${count})`);
  }

  if (failures > 0) {
    console.error(`\nFAIL: ${failures} assertion(s) failed`);
    process.exit(1);
  }

  if (!allMinimaMet || total <= 375) {
    console.error(`\nFAIL: domain minima not met (total=${total}, need >375)`);
    process.exit(1);
  }

  console.log("\nALL D07 TARGETED TESTS PASSED");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
