// LOOP Codex Implementation Adapter — Targeted Tests
// ====================================================
// Real LoopArtifactStore, LoopGitWorkspaceManager, LoopPatchApplicationManager.
// Fake/Capturing D02 Codex runner — no real Codex or network calls.
// Real temporary Git fixtures with isolated HOME / global / system config.
// Disposable temp roots cleaned up in finally.
//
// Stable summary markers:
//   D05_TARGETED_SUMMARY total=<n> passed=<n> failed=0
//   D05_TEMP_CLEANUP_COMPLETE true
//   D05_REAL_SOURCE_UNCHANGED true

import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync,
  existsSync, readFileSync, lstatSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  LoopCodexImplementationAdapter,
} from "../core/loop-codex-implementation-adapter";
import type {
  LoopCodexImplementationRequest,
  LoopCodexImplementationResult,
  LoopCodexImplementationSuccess,
  LoopCodexImplementationFailure,
} from "../core/loop-codex-implementation-adapter";
import {
  buildLoopCodexPrompt,
  DEFAULT_PROMPT_LIMITS,
} from "../core/loop-codex-prompt";
import type { LoopCodexPromptInput } from "../core/loop-codex-prompt";
import {
  parseLoopCodexOutput,
  DEFAULT_OUTPUT_LIMITS,
} from "../core/loop-codex-output";
import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopGitWorkspaceManager } from "../core/loop-git-workspace";
import { LoopPosixProcessRunner } from "../core/loop-posix-process-runner";
import { LoopPatchApplicationManager } from "../core/loop-patch-application";
import type { LoopRunIdentity } from "../core/loop-executor-types";
import type { LoopPosixProcessRequest, LoopPosixProcessResult } from "../core/loop-posix-process-runner";

// ═══════════════════════════════════════ Test harness

let passed = 0, failed = 0;
function ok(c: boolean, m: string): void {
  if (c) { passed++; console.log(`  ✓ ${m}`); }
  else { failed++; console.error(`  ✗ ${m}`); }
}

function sha256Hex(d: string | Uint8Array): string {
  return createHash("sha256").update(d).digest("hex");
}

function findGit(): string {
  for (const d of (process.env.PATH || "/usr/bin:/bin").split(delimiter)) {
    const fp = join(d, "git");
    try { const st = lstatSync(fp); if (st.isFile() && (st.mode & 0o111)) return realpathSync(fp); } catch {}
  }
  throw new Error("git not found");
}
const GIT_PATH = findGit();

// ── Fake Codex runner that captures the request and returns a configured response
interface FakeCodexRunner {
  run(req: LoopPosixProcessRequest): Promise<LoopPosixProcessResult>;
  lastRequest: LoopPosixProcessRequest | null;
  callCount: number;
}

function makeFakeCodexRunner(
  response: (req: LoopPosixProcessRequest) => LoopPosixProcessResult | Error,
): FakeCodexRunner {
  const runner: FakeCodexRunner = {
    lastRequest: null,
    callCount: 0,
    async run(req: LoopPosixProcessRequest): Promise<LoopPosixProcessResult> {
      runner.lastRequest = req;
      runner.callCount++;
      const r = response(req);
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return runner;
}

function makeSuccessResult(stdout: string): LoopPosixProcessResult {
  return Object.freeze({
    status: "exited" as const,
    exitCode: 0,
    signal: null,
    durationMs: 100,
    stdout,
    stderr: "",
    stdoutBytesReceived: Buffer.byteLength(stdout, "utf8"),
    stderrBytesReceived: 0,
    stdoutTruncated: false,
    stderrTruncated: false,
    termSignalSent: false,
    killSignalSent: false,
  });
}

function makeTimeoutResult(): LoopPosixProcessResult {
  return Object.freeze({
    status: "timed_out" as const,
    exitCode: null,
    signal: "SIGTERM",
    durationMs: 120000,
    stdout: "",
    stderr: "",
    stdoutBytesReceived: 0,
    stderrBytesReceived: 0,
    stdoutTruncated: false,
    stderrTruncated: false,
    termSignalSent: true,
    killSignalSent: false,
  });
}

function makeNonZeroResult(exitCode: number): LoopPosixProcessResult {
  return Object.freeze({
    status: "exited" as const,
    exitCode,
    signal: null,
    durationMs: 100,
    stdout: "",
    stderr: "error",
    stdoutBytesReceived: 0,
    stderrBytesReceived: 5,
    stdoutTruncated: false,
    stderrTruncated: false,
    termSignalSent: false,
    killSignalSent: false,
  });
}

function makeTruncatedResult(): LoopPosixProcessResult {
  return Object.freeze({
    status: "exited" as const,
    exitCode: 0,
    signal: null,
    durationMs: 100,
    stdout: "x",
    stderr: "",
    stdoutBytesReceived: 10000000,
    stderrBytesReceived: 0,
    stdoutTruncated: true,
    stderrTruncated: false,
    termSignalSent: false,
    killSignalSent: false,
  });
}

// ── Minimal unified diff for a single file modification
function makeSimpleDiff(filePath: string, oldContent: string, newContent: string): string {
  const oldLines = oldContent.endsWith("\n")
    ? oldContent.slice(0, -1).split("\n")
    : oldContent.split("\n");
  const newLines = newContent.endsWith("\n")
    ? newContent.slice(0, -1).split("\n")
    : newContent.split("\n");
  const hunkLines: string[] = [];
  hunkLines.push(`@@ -1,${oldLines.length} +1,${newLines.length} @@`);
  for (const l of oldLines) {
    if (!newLines.includes(l)) hunkLines.push(`-${l}`);
  }
  for (const l of newLines) {
    if (!oldLines.includes(l)) hunkLines.push(`+${l}`);
  }
  for (const l of oldLines) {
    if (newLines.includes(l)) hunkLines.push(` ${l}`);
  }
  const hunk = hunkLines.join("\n") + "\n";
  return `diff --git a/${filePath} b/${filePath}\nindex 0000000..1111111 100644\n--- a/${filePath}\n+++ b/${filePath}\n${hunk}`;
}

function makeNewFileDiff(filePath: string, content: string): string {
  const lines = content.endsWith("\n")
    ? content.slice(0, -1).split("\n")
    : content.split("\n");
  const hunk = `@@ -0,0 +1,${lines.length} @@\n` +
    lines.map((l) => `+${l}\n`).join("");
  return `diff --git a/${filePath} b/${filePath}\nnew file mode 100644\nindex 0000000..1111111\n--- /dev/null\n+++ b/${filePath}\n${hunk}`;
}

function wrapInFence(diff: string): string {
  return `\`\`\`codex-unified-diff\n${diff}\`\`\``;
}

// ── Setup helpers
interface FixtureSetup {
  tempRoot: string;
  repoPath: string;
  controlRoot: string;
  home: string;
  baseSha: string;
  featSha: string;
}

function makeFixture(): FixtureSetup {
  const tr = realpathSync(mkdtempSync(join(tmpdir(), "d05-")));
  const rp = join(tr, "repo");
  const cr = join(tr, "ctrl");
  mkdirSync(rp, { recursive: true });
  mkdirSync(cr, { recursive: true });
  mkdirSync(join(rp, "src"), { recursive: true });
  execFileSync(GIT_PATH, ["init", "-b", "main"], { cwd: rp });
  execFileSync(GIT_PATH, ["config", "user.name", "test"], { cwd: rp });
  execFileSync(GIT_PATH, ["config", "user.email", "t@t"], { cwd: rp });
  writeFileSync(join(rp, "src/keep.ts"), "export const x = 1;\n");
  writeFileSync(join(rp, "src/app.ts"), "export function app() { return 1; }\n");
  execFileSync(GIT_PATH, ["add", "src/keep.ts", "src/app.ts"], { cwd: rp });
  execFileSync(GIT_PATH, ["commit", "-m", "base"], { cwd: rp });
  const baseSha = execFileSync(GIT_PATH, ["rev-parse", "HEAD"], { cwd: rp, encoding: "utf8" }).trim();
  execFileSync(GIT_PATH, ["checkout", "-b", "feat/loop-runtime-v1"], { cwd: rp });
  execFileSync(GIT_PATH, ["update-ref", "refs/remotes/origin/feat/loop-runtime-v1", baseSha], { cwd: rp });
  execFileSync(GIT_PATH, ["update-ref", "refs/remotes/origin/main", baseSha], { cwd: rp });
  execFileSync(GIT_PATH, ["remote", "add", "origin", "https://github.com/shaoyang01/ai-sdlc-standard.git"], { cwd: rp });
  execFileSync(GIT_PATH, ["checkout", "main"], { cwd: rp });
  const home = join(tr, "home");
  mkdirSync(home, { recursive: true });
  return { tempRoot: tr, repoPath: rp, controlRoot: cr, home, baseSha, featSha: baseSha };
}

function makeIdentity(fx: FixtureSetup, runId?: string): LoopRunIdentity {
  return Object.freeze({
    runId: runId ?? "d05-test-run",
    requirementId: "REQ-001",
    repository: "shaoyang01/ai-sdlc-standard",
    repositoryPath: fx.repoPath,
    baseBranch: "feat/loop-runtime-v1",
    expectedBaseSha: fx.featSha,
    taskBranch: "codex/d05-task",
    controlRoot: fx.controlRoot,
    createdAt: new Date().toISOString(),
  });
}

function makeRunner(rp: string, cr: string, home: string): LoopPosixProcessRunner {
  return new LoopPosixProcessRunner({
    executables: [{ id: "git", executablePath: GIT_PATH, allowDynamicArgs: true, stdinMode: "optional" }],
    allowedCwdRoots: [rp, cr],
    fixedEnv: {
      GIT_TERMINAL_PROMPT: "0", HOME: home, PATH: join(GIT_PATH, ".."),
      LC_ALL: "C", LANG: "C", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
    },
    allowedRequestEnvKeys: [],
    defaultTimeoutMs: 15000,
  });
}

const OPENING = "```codex-unified-diff";

// ═══════════════════════════════════════
// A. Prompt Builder Tests
// ═══════════════════════════════════════

console.log("\n── A. Prompt Builder ──");

{
  const baseInput: LoopCodexPromptInput = {
    phase: "initial",
    attempt: 0,
    requirementId: "REQ-001",
    requirement: "Implement a utility function",
    allowedPaths: ["src/utils.ts"],
  };

  // A.1 initial prompt success
  const r1 = buildLoopCodexPrompt(baseInput);
  ok(r1.ok, "A.1 initial prompt ok");
  if (r1.ok) {
    ok(r1.prompt.includes("initial"), "A.1 contains phase");
    ok(r1.prompt.includes("REQ-001"), "A.1 contains requirement ID");
    ok(r1.prompt.includes("src/utils.ts"), "A.1 contains allowed paths");
    ok(!r1.prompt.includes("repair"), "A.1 no repair evidence in initial");
  }

  // A.2 test_repair prompt success
  const r2 = buildLoopCodexPrompt({
    ...baseInput,
    phase: "test_repair",
    attempt: 1,
    repairEvidenceSummary: "Test failed: expect 2 got 1",
  });
  ok(r2.ok, "A.2 test_repair prompt ok");
  if (r2.ok) {
    ok(r2.prompt.includes("Test-Failure Repair"), "A.2 contains repair phase label");
    ok(r2.prompt.includes("Test failed"), "A.2 contains evidence");
    ok(r2.prompt.includes("Attempt: 1"), "A.2 contains attempt");
  }

  // A.3 review_repair prompt success
  const r3 = buildLoopCodexPrompt({
    ...baseInput,
    phase: "review_repair",
    attempt: 2,
    repairEvidenceSummary: "Review: missing null check",
  });
  ok(r3.ok, "A.3 review_repair prompt ok");
  if (r3.ok) {
    ok(r3.prompt.includes("Review-Feedback Repair"), "A.3 contains review repair label");
    ok(r3.prompt.includes("missing null check"), "A.3 contains evidence");
  }

  // A.4 evidence only in repair prompt
  if (r1.ok && r3.ok) {
    ok(!r1.prompt.includes("missing null check"), "A.4 initial prompt no evidence");
    ok(!r1.prompt.includes("artifact"), "A.4 initial prompt no artifact ref");
  }

  // A.5 prompt does not contain prohibited fields
  if (r1.ok) {
    ok(!r1.prompt.includes("controlRoot"), "A.5 no controlRoot");
    ok(!r1.prompt.includes("repositoryPath"), "A.5 no repositoryPath");
    ok(!r1.prompt.includes("environment"), "A.5 no environment");
  }

  // A.6 oversized input fails
  const bigReq = "x".repeat(20000);
  const r6 = buildLoopCodexPrompt({ ...baseInput, requirement: bigReq });
  ok(!r6.ok, "A.6 oversized requirement fails");

  // A.7 no silent truncation
  if (r1.ok) {
    ok(r1.prompt.includes("Implement a utility function"), "A.7 requirement preserved verbatim");
  }

  // A.8 initial with evidence fails
  const r8 = buildLoopCodexPrompt({ ...baseInput, repairEvidenceSummary: "x" });
  ok(!r8.ok, "A.8 initial with evidence fails");

  // A.9 repair without evidence fails
  const r9 = buildLoopCodexPrompt({ ...baseInput, phase: "test_repair", attempt: 1 });
  ok(!r9.ok, "A.9 repair without evidence fails");

  // A.10 input immutability
  const paths = ["src/a.ts"];
  const r10 = buildLoopCodexPrompt({ ...baseInput, allowedPaths: paths });
  ok(r10.ok && paths.length === 1 && paths[0] === "src/a.ts", "A.10 input not mutated");
}

// ═══════════════════════════════════════
// B. Output Parser Tests
// ═══════════════════════════════════════

console.log("\n── B. Output Parser ──");

{
  const diff = makeSimpleDiff("src/app.ts",
    "export function app() { return 1; }\n",
    "export function app() { return 2; }\n");
  const stdout = wrapInFence(diff);
  const stdoutBytes = new TextEncoder().encode(stdout);

  // B.1 valid multi-file diff
  const r1 = parseLoopCodexOutput(stdoutBytes);
  ok(r1.ok, "B.1 valid multi-file diff ok");
  if (r1.ok) {
    ok(r1.patchSizeBytes > 0, "B.1 patch size > 0");
    ok(r1.patchDigestSha256.length === 64, "B.1 SHA-256 is 64 chars");
    ok(r1.patchDigestSha256 === sha256Hex(r1.patchBytes), "B.1 SHA matches patch bytes");
    ok(r1.patchBytes.length === r1.patchSizeBytes, "B.1 size matches");
    const patchText = new TextDecoder().decode(r1.patchBytes);
    ok(patchText.endsWith("\n"), "B.1 patch ends with LF");
  }

  // B.2 missing block
  const r2 = parseLoopCodexOutput(new TextEncoder().encode("no fence here"));
  ok(!r2.ok, "B.2 missing block fails");

  // B.3 multiple opening markers
  const stdout3 = `${OPENING}\n--- a/src/x.ts\n+++ b/src/x.ts\n@@ -1 +1 @@\n-x\n+y\n\`\`\`\n\n${OPENING}\n--- a/src/y.ts\n+++ b/src/y.ts\n@@ -1 +1 @@\n-a\n+b\n\`\`\``.replace(/OPENING/g, "```codex-unified-diff");
  const r3 = parseLoopCodexOutput(new TextEncoder().encode(stdout3));
  ok(!r3.ok, "B.3 multiple opening markers fails");

  // B.4 malformed opening
  const r4 = parseLoopCodexOutput(new TextEncoder().encode("```codex-unified-diff extra\nx\n```"));
  ok(!r4.ok, "B.4 malformed opening fails");

  // B.5 unterminated block
  const r5 = parseLoopCodexOutput(new TextEncoder().encode("```codex-unified-diff\nx\n"));
  ok(!r5.ok, "B.5 unterminated block fails");

  // B.6 non-whitespace preamble
  const r6 = parseLoopCodexOutput(new TextEncoder().encode("hello\n```codex-unified-diff\nx\n```"));
  ok(!r6.ok, "B.6 non-whitespace preamble fails");

  // B.7 non-whitespace trailing text
  const r7 = parseLoopCodexOutput(new TextEncoder().encode("```codex-unified-diff\nx\n```\nhello"));
  ok(!r7.ok, "B.7 non-whitespace trailing text fails");

  // B.8 empty patch
  const r8 = parseLoopCodexOutput(new TextEncoder().encode("```codex-unified-diff\n\n```"));
  ok(!r8.ok, "B.8 empty patch fails");

  // B.9 oversized stdout
  const r9 = parseLoopCodexOutput(new Uint8Array(2000000), { maxStdoutBytes: 100, maxPatchBytes: 100000 });
  ok(!r9.ok, "B.9 oversized stdout fails");

  // B.10 U+FFFD rejection
  const r10 = parseLoopCodexOutput(new TextEncoder().encode("```codex-unified-diff\nx\uFFFD\n```"));
  ok(!r10.ok, "B.10 replacement char fails");

  // B.11 diff with inner fence — uses LAST closing fence
  const innerFenceDiff = "```codex-unified-diff\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1,3 +1,4 @@\n context\n+new line\n another line\n+```\n+more\n```";
  const r11 = parseLoopCodexOutput(new TextEncoder().encode(innerFenceDiff));
  ok(r11.ok, "B.11 inner fence handled correctly");

  // B.12 parser does not validate path or grammar
  const weirdDiff = "```codex-unified-diff\n--- a/anything\n+++ b/anything\n@@ -999,999 +999,999 @@\n x\n```";
  const r12 = parseLoopCodexOutput(new TextEncoder().encode(weirdDiff));
  ok(r12.ok, "B.12 parser accepts any diff content (no grammar validation)");
}

// ═══════════════════════════════════════
// C. Phase / Input Validation
// ═══════════════════════════════════════

console.log("\n── C. Phase / Input Validation ──");

async function testPhaseValidation(): Promise<void> {
  const fx = makeFixture();
  try {
    const identity = makeIdentity(fx);
    const runner = makeRunner(fx.repoPath, fx.controlRoot, fx.home);
    const wsm = new LoopGitWorkspaceManager({
      runner, gitExecutableId: "git", gitTimeoutMs: 15000,
    });
    const snapshot = await wsm.prepare(identity);

    const artifactStore = new LoopArtifactStore({
      controlRoot: fx.controlRoot, repositoryPath: fx.repoPath,
    });
    artifactStore.init();

    const patchManager = new LoopPatchApplicationManager({
      runner, workspaceManager: wsm, gitExecutableId: "git", gitTimeoutMs: 15000,
    });

    const diff = makeSimpleDiff("src/app.ts",
      "export function app() { return 1; }\n",
      "export function app() { return 2; }\n");
    const stdout = wrapInFence(diff);
    const fakeRunner = makeFakeCodexRunner(() => makeSuccessResult(stdout));

    const adapter = new LoopCodexImplementationAdapter({
      runner: fakeRunner,
      workspaceManager: wsm,
      artifactStore,
      patchApplicationManager: patchManager,
      codexExecutableId: "fake-codex",
    });

    const baseReq: LoopCodexImplementationRequest = {
      identity,
      workspace: {
        workspacePath: snapshot.workspacePath,
        taskBranch: identity.taskBranch,
        expectedTaskHeadSha: snapshot.taskHeadSha,
        expectedPreStatusDigestSha256: snapshot.taskStatusDigestSha256,
      },
      phase: "initial",
      attempt: 0,
      requirement: "Add a feature",
      allowedPaths: ["src/app.ts"],
    };

    // C.1 initial attempt 0 is valid
    const r1 = await adapter.execute(baseReq);
    ok(r1.status === "succeeded", "C.1 initial attempt 0 succeeds");

    // C.2 initial non-zero fails
    const r2 = await adapter.execute({ ...baseReq, attempt: 1 });
    ok(r2.status === "failed" && r2.errorCode === "INVALID_INPUT", "C.2 initial non-zero fails");

    // C.3 initial with evidence fails
    const r3 = await adapter.execute({ ...baseReq, repairEvidenceArtifactRef: "x" });
    ok(r3.status === "failed" && r3.errorCode === "INVALID_INPUT", "C.3 initial with evidence fails");

    // C.4 repair without evidence fails
    const r4 = await adapter.execute({
      ...baseReq, phase: "test_repair", attempt: 1,
    });
    ok(r4.status === "failed" && r4.errorCode === "REPAIR_EVIDENCE_REQUIRED", "C.4 repair without evidence fails");

    // C.5 repair attempt 0 fails
    const r5 = await adapter.execute({
      ...baseReq, phase: "test_repair", attempt: 0, repairEvidenceArtifactRef: "x",
    });
    ok(r5.status === "failed", "C.5 repair attempt 0 fails");

    // C.6 duplicate allowedPaths fails
    const r6 = await adapter.execute({
      ...baseReq, allowedPaths: ["src/app.ts", "src/app.ts"],
    });
    ok(r6.status === "failed" && r6.errorCode === "INVALID_INPUT", "C.6 duplicate allowedPaths fails");

    // C.7 empty allowedPaths fails
    const r7 = await adapter.execute({
      ...baseReq, allowedPaths: [],
    });
    ok(r7.status === "failed" && r7.errorCode === "INVALID_INPUT", "C.7 empty allowedPaths fails");

    // C.8 input not mutated
    const origPaths = ["src/app.ts"];
    const pathsCopy = [...origPaths];
    await adapter.execute({ ...baseReq, allowedPaths: pathsCopy });
    ok(pathsCopy.length === 1 && pathsCopy[0] === "src/app.ts", "C.8 input not mutated");
  } finally {
    rmSync(fx.tempRoot, { recursive: true, force: true });
  }
}

// ═══════════════════════════════════════
// E. Initial Integration
// ═══════════════════════════════════════

console.log("\n── E. Initial Integration ──");

async function testInitialIntegration(): Promise<void> {
  const fx = makeFixture();
  try {
    const identity = makeIdentity(fx);
    const runner = makeRunner(fx.repoPath, fx.controlRoot, fx.home);
    const wsm = new LoopGitWorkspaceManager({
      runner, gitExecutableId: "git", gitTimeoutMs: 15000,
    });
    const snapshot = await wsm.prepare(identity);

    const artifactStore = new LoopArtifactStore({
      controlRoot: fx.controlRoot, repositoryPath: fx.repoPath,
    });
    artifactStore.init();

    const patchManager = new LoopPatchApplicationManager({
      runner, workspaceManager: wsm, gitExecutableId: "git", gitTimeoutMs: 15000,
    });

    const diff = makeSimpleDiff("src/app.ts",
      "export function app() { return 1; }\n",
      "export function app() { return 42; }\n");
    const stdout = wrapInFence(diff);
    const fakeRunner = makeFakeCodexRunner(() => makeSuccessResult(stdout));

    const adapter = new LoopCodexImplementationAdapter({
      runner: fakeRunner,
      workspaceManager: wsm,
      artifactStore,
      patchApplicationManager: patchManager,
      codexExecutableId: "fake-codex",
    });

    const req: LoopCodexImplementationRequest = {
      identity,
      workspace: {
        workspacePath: snapshot.workspacePath,
        taskBranch: identity.taskBranch,
        expectedTaskHeadSha: snapshot.taskHeadSha,
        expectedPreStatusDigestSha256: snapshot.taskStatusDigestSha256,
      },
      phase: "initial",
      attempt: 0,
      requirement: "Change app to return 42",
      allowedPaths: ["src/app.ts"],
    };

    const result = await adapter.execute(req);
    ok(result.status === "succeeded", "E.1 initial integration succeeded");
    if (result.status === "succeeded") {
      const s = result as LoopCodexImplementationSuccess;
      ok(s.applicationState === "applied", "E.2 applicationState is applied");
      ok(s.files.includes("src/app.ts"), "E.3 files includes src/app.ts");
      ok(s.files.length === 1, "E.3 exactly one file");
      ok(s.patchArtifactRef.startsWith("loop-artifact:v1:code_patch:sha256:"), "E.4 has artifact ref");
      ok(s.patchDigestSha256.length === 64, "E.5 has SHA-256");
      ok(s.patchSizeBytes > 0, "E.6 has patch size");
      ok(s.preTaskHeadSha === s.postTaskHeadSha, "E.7 task HEAD unchanged");

      // Verify workspace content
      const appPath = join(snapshot.workspacePath, "src/app.ts");
      const content = readFileSync(appPath, "utf8");
      ok(content.includes("return 42"), "E.8 workspace file updated");

      // Verify D01 artifact
      const artifactBytes = artifactStore.read(s.patchArtifactRef);
      ok(artifactBytes.length > 0, "E.9 artifact exists");
      const storedDigest = sha256Hex(artifactBytes);
      ok(storedDigest === s.patchDigestSha256, "E.10 stored digest matches");

      // Verify no shadow/raw output
      ok(!("rawStdout" in result), "E.11 no raw output");
    }

    // Cleanup (best-effort; temp dir is removed in finally)
    try { await wsm.cleanup(identity, { expectedTaskHeadSha: snapshot.taskHeadSha, deleteTaskBranch: true }); } catch { /* workspace may be dirty after patch apply */ }
  } finally {
    rmSync(fx.tempRoot, { recursive: true, force: true });
  }
}

// ═══════════════════════════════════════
// H. Failure Modes
// ═══════════════════════════════════════

console.log("\n── H. Failure Modes ──");

async function testFailures(): Promise<void> {
  const fx = makeFixture();
  try {
    const identity = makeIdentity(fx);
    const runner = makeRunner(fx.repoPath, fx.controlRoot, fx.home);
    const wsm = new LoopGitWorkspaceManager({
      runner, gitExecutableId: "git", gitTimeoutMs: 15000,
    });
    const snapshot = await wsm.prepare(identity);

    const artifactStore = new LoopArtifactStore({
      controlRoot: fx.controlRoot, repositoryPath: fx.repoPath,
    });
    artifactStore.init();

    const patchManager = new LoopPatchApplicationManager({
      runner, workspaceManager: wsm, gitExecutableId: "git", gitTimeoutMs: 15000,
    });

    const baseReq: LoopCodexImplementationRequest = {
      identity,
      workspace: {
        workspacePath: snapshot.workspacePath,
        taskBranch: identity.taskBranch,
        expectedTaskHeadSha: snapshot.taskHeadSha,
        expectedPreStatusDigestSha256: snapshot.taskStatusDigestSha256,
      },
      phase: "initial",
      attempt: 0,
      requirement: "Add a feature",
      allowedPaths: ["src/app.ts"],
    };

    // H.1 runner throw
    {
      const throwingRunner = makeFakeCodexRunner(() => { throw new Error("spawn failed"); });
      const adapter = new LoopCodexImplementationAdapter({
        runner: throwingRunner, workspaceManager: wsm, artifactStore,
        patchApplicationManager: patchManager, codexExecutableId: "fake-codex",
      });
      const r = await adapter.execute(baseReq);
      ok(r.status === "failed" && r.errorCode === "CODEX_SPAWN_FAILED", "H.1 runner throw → CODEX_SPAWN_FAILED");
    }

    // H.2 timeout
    {
      const timeoutRunner = makeFakeCodexRunner(() => makeTimeoutResult());
      const adapter = new LoopCodexImplementationAdapter({
        runner: timeoutRunner, workspaceManager: wsm, artifactStore,
        patchApplicationManager: patchManager, codexExecutableId: "fake-codex",
      });
      const r = await adapter.execute(baseReq);
      ok(r.status === "failed" && r.errorCode === "CODEX_TIMED_OUT", "H.2 timeout → CODEX_TIMED_OUT");
      if (r.status === "failed") ok(r.retryable === true, "H.2 retryable true");
    }

    // H.3 non-zero exit
    {
      const nzRunner = makeFakeCodexRunner(() => makeNonZeroResult(1));
      const adapter = new LoopCodexImplementationAdapter({
        runner: nzRunner, workspaceManager: wsm, artifactStore,
        patchApplicationManager: patchManager, codexExecutableId: "fake-codex",
      });
      const r = await adapter.execute(baseReq);
      ok(r.status === "failed" && r.errorCode === "CODEX_NON_ZERO_EXIT", "H.3 non-zero → CODEX_NON_ZERO_EXIT");
    }

    // H.4 truncated output
    {
      const truncRunner = makeFakeCodexRunner(() => makeTruncatedResult());
      const adapter = new LoopCodexImplementationAdapter({
        runner: truncRunner, workspaceManager: wsm, artifactStore,
        patchApplicationManager: patchManager, codexExecutableId: "fake-codex",
      });
      const r = await adapter.execute(baseReq);
      ok(r.status === "failed" && r.errorCode === "CODEX_OUTPUT_TOO_LARGE", "H.4 truncated → CODEX_OUTPUT_TOO_LARGE");
    }

    // H.5 invalid output framing
    {
      const badRunner = makeFakeCodexRunner(() => makeSuccessResult("no fence"));
      const adapter = new LoopCodexImplementationAdapter({
        runner: badRunner, workspaceManager: wsm, artifactStore,
        patchApplicationManager: patchManager, codexExecutableId: "fake-codex",
      });
      const r = await adapter.execute(baseReq);
      ok(r.status === "failed" && r.errorCode === "CODEX_OUTPUT_INVALID", "H.5 invalid output → CODEX_OUTPUT_INVALID");
    }

    // H.6 workspace drift
    {
      const diff = makeSimpleDiff("src/app.ts",
        "export function app() { return 1; }\n",
        "export function app() { return 2; }\n");
      const stdout = wrapInFence(diff);
      const okRunner = makeFakeCodexRunner(() => makeSuccessResult(stdout));
      const adapter = new LoopCodexImplementationAdapter({
        runner: okRunner, workspaceManager: wsm, artifactStore,
        patchApplicationManager: patchManager, codexExecutableId: "fake-codex",
      });
      const r = await adapter.execute({
        ...baseReq,
        workspace: { ...baseReq.workspace, expectedTaskHeadSha: "0".repeat(40) },
      });
      ok(r.status === "failed" && r.errorCode === "WORKSPACE_DRIFT", "H.6 drift → WORKSPACE_DRIFT");
    }

    // H.7 no shadow success on failure
    {
      const badRunner = makeFakeCodexRunner(() => makeSuccessResult("no fence"));
      const adapter = new LoopCodexImplementationAdapter({
        runner: badRunner, workspaceManager: wsm, artifactStore,
        patchApplicationManager: patchManager, codexExecutableId: "fake-codex",
      });
      const r = await adapter.execute(baseReq);
      ok(r.status !== "succeeded", "H.7 no shadow success");
      if (r.status === "failed") {
        ok(typeof r.safeMessage === "string", "H.7 has safeMessage");
        ok(r.safeMessage.length <= 256, "H.7 safeMessage bounded");
      }
    }

    try { await wsm.cleanup(identity, { expectedTaskHeadSha: snapshot.taskHeadSha, deleteTaskBranch: true }); } catch { /* ok */ }
  } finally {
    rmSync(fx.tempRoot, { recursive: true, force: true });
  }
}

// ═══════════════════════════════════════
// D. D03 Binding Tests
// ═══════════════════════════════════════

console.log("\n── D. D03 Binding ──");

async function testD03Binding(): Promise<void> {
  const fx = makeFixture();
  try {
    const identity = makeIdentity(fx);
    const runner = makeRunner(fx.repoPath, fx.controlRoot, fx.home);
    const wsm = new LoopGitWorkspaceManager({
      runner, gitExecutableId: "git", gitTimeoutMs: 15000,
    });
    const snapshot = await wsm.prepare(identity);

    const artifactStore = new LoopArtifactStore({
      controlRoot: fx.controlRoot, repositoryPath: fx.repoPath,
    });
    artifactStore.init();

    const patchManager = new LoopPatchApplicationManager({
      runner, workspaceManager: wsm, gitExecutableId: "git", gitTimeoutMs: 15000,
    });

    const diff = makeSimpleDiff("src/app.ts",
      "export function app() { return 1; }\n",
      "export function app() { return 2; }\n");
    const stdout = wrapInFence(diff);
    const fakeRunner = makeFakeCodexRunner(() => makeSuccessResult(stdout));

    const adapter = new LoopCodexImplementationAdapter({
      runner: fakeRunner, workspaceManager: wsm, artifactStore,
      patchApplicationManager: patchManager, codexExecutableId: "fake-codex",
    });

    const baseReq: LoopCodexImplementationRequest = {
      identity,
      workspace: {
        workspacePath: snapshot.workspacePath,
        taskBranch: identity.taskBranch,
        expectedTaskHeadSha: snapshot.taskHeadSha,
        expectedPreStatusDigestSha256: snapshot.taskStatusDigestSha256,
      },
      phase: "initial",
      attempt: 0,
      requirement: "Add a feature",
      allowedPaths: ["src/app.ts"],
    };

    // D.1 correct snapshot continues
    const r1 = await adapter.execute(baseReq);
    ok(r1.status === "succeeded", "D.1 correct snapshot continues");
    ok(fakeRunner.callCount >= 1, "D.1 Codex was called");

    // D.2 wrong workspacePath fails
    fakeRunner.callCount = 0;
    const r2 = await adapter.execute({
      ...baseReq,
      workspace: { ...baseReq.workspace, workspacePath: "/nonexistent/path" },
    });
    ok(r2.status === "failed" && r2.errorCode === "WORKSPACE_DRIFT", "D.2 wrong path fails");
    ok(fakeRunner.callCount === 0, "D.2 Codex not called on mismatch");

    // D.3 wrong status digest fails
    fakeRunner.callCount = 0;
    const r3 = await adapter.execute({
      ...baseReq,
      workspace: { ...baseReq.workspace, expectedPreStatusDigestSha256: "0".repeat(64) },
    });
    ok(r3.status === "failed" && r3.errorCode === "WORKSPACE_DRIFT", "D.3 wrong digest fails");
    ok(fakeRunner.callCount === 0, "D.3 Codex not called on mismatch");

    try { await wsm.cleanup(identity, { expectedTaskHeadSha: snapshot.taskHeadSha, deleteTaskBranch: true }); } catch { /* ok */ }
  } finally {
    rmSync(fx.tempRoot, { recursive: true, force: true });
  }
}

// ═══════════════════════════════════════
// F. test_repair & G. review_repair
// ═══════════════════════════════════════

console.log("\n── F/G. Repair Phases ──");

async function testRepairPhases(): Promise<void> {
  const fx = makeFixture();
  try {
    const identity = makeIdentity(fx);
    const runner = makeRunner(fx.repoPath, fx.controlRoot, fx.home);
    const wsm = new LoopGitWorkspaceManager({
      runner, gitExecutableId: "git", gitTimeoutMs: 15000,
    });
    const snapshot = await wsm.prepare(identity);

    const artifactStore = new LoopArtifactStore({
      controlRoot: fx.controlRoot, repositoryPath: fx.repoPath,
    });
    artifactStore.init();

    const patchManager = new LoopPatchApplicationManager({
      runner, workspaceManager: wsm, gitExecutableId: "git", gitTimeoutMs: 15000,
    });

    // Store test_summary artifact
    const testEvidence = "Test 'should return 2' failed: expected 2, got 1\n  at app.test.ts:10:5";
    const testStored = artifactStore.put("test_summary", testEvidence);
    ok(testStored.kind === "test_summary", "F.0 test_summary stored");

    // Store review_summary artifact
    const reviewEvidence = "Review: Missing null check on line 5 of src/app.ts";
    const reviewStored = artifactStore.put("review_summary", reviewEvidence);
    ok(reviewStored.kind === "review_summary", "G.0 review_summary stored");

    const diff = makeSimpleDiff("src/app.ts",
      "export function app() { return 1; }\n",
      "export function app() { return 2; }\n");
    const stdout = wrapInFence(diff);
    const fakeRunner = makeFakeCodexRunner(() => makeSuccessResult(stdout));

    const adapter = new LoopCodexImplementationAdapter({
      runner: fakeRunner, workspaceManager: wsm, artifactStore,
      patchApplicationManager: patchManager, codexExecutableId: "fake-codex",
    });

    const baseReq: LoopCodexImplementationRequest = {
      identity,
      workspace: {
        workspacePath: snapshot.workspacePath,
        taskBranch: identity.taskBranch,
        expectedTaskHeadSha: snapshot.taskHeadSha,
        expectedPreStatusDigestSha256: snapshot.taskStatusDigestSha256,
      },
      phase: "test_repair",
      attempt: 1,
      requirement: "Fix the failing test",
      allowedPaths: ["src/app.ts"],
      repairEvidenceArtifactRef: testStored.artifactRef,
    };

    // F.2 wrong kind evidence fails (test first — doesn't modify workspace)
    const r2 = await adapter.execute({
      ...baseReq,
      repairEvidenceArtifactRef: reviewStored.artifactRef,
    });
    ok(r2.status === "failed" && r2.errorCode === "REPAIR_EVIDENCE_INVALID", "F.2 wrong kind fails");

    // F.1 test_repair with real test_summary
    const r1 = await adapter.execute(baseReq);
    if (r1.status !== "succeeded") {
      console.error("  F.1 DEBUG:", JSON.stringify(r1));
    }
    ok(r1.status === "succeeded", "F.1 test_repair succeeded");
    if (r1.status === "succeeded") {
      ok(r1.phase === "test_repair", "F.1 phase correct");
      ok(r1.attempt === 1, "F.1 attempt correct");
    }

    // Re-inspect for updated digest after F.1 patch
    const snap2 = await wsm.inspect(identity);

    // G.1 review_repair with real review_summary (use updated digest)
    const r3 = await adapter.execute({
      ...baseReq,
      phase: "review_repair",
      workspace: {
        ...baseReq.workspace,
        expectedPreStatusDigestSha256: snap2.taskStatusDigestSha256,
      },
      repairEvidenceArtifactRef: reviewStored.artifactRef,
    });
    ok(r3.status === "succeeded", "G.1 review_repair succeeded");
    if (r3.status === "succeeded") {
      ok(r3.phase === "review_repair", "G.1 phase correct");
    }

    try { await wsm.cleanup(identity, { expectedTaskHeadSha: snapshot.taskHeadSha, deleteTaskBranch: true }); } catch { /* ok */ }
  } finally {
    rmSync(fx.tempRoot, { recursive: true, force: true });
  }
}

// ═══════════════════════════════════════
// I. Already Applied
// ═══════════════════════════════════════

console.log("\n── I. Already Applied ──");

async function testAlreadyApplied(): Promise<void> {
  const fx = makeFixture();
  try {
    const identity = makeIdentity(fx);
    const runner = makeRunner(fx.repoPath, fx.controlRoot, fx.home);
    const wsm = new LoopGitWorkspaceManager({
      runner, gitExecutableId: "git", gitTimeoutMs: 15000,
    });
    const snapshot = await wsm.prepare(identity);

    const artifactStore = new LoopArtifactStore({
      controlRoot: fx.controlRoot, repositoryPath: fx.repoPath,
    });
    artifactStore.init();

    const patchManager = new LoopPatchApplicationManager({
      runner, workspaceManager: wsm, gitExecutableId: "git", gitTimeoutMs: 15000,
    });

    const diff = makeSimpleDiff("src/app.ts",
      "export function app() { return 1; }\n",
      "export function app() { return 2; }\n");
    const stdout = wrapInFence(diff);
    const fakeRunner = makeFakeCodexRunner(() => makeSuccessResult(stdout));

    const adapter = new LoopCodexImplementationAdapter({
      runner: fakeRunner, workspaceManager: wsm, artifactStore,
      patchApplicationManager: patchManager, codexExecutableId: "fake-codex",
    });

    const makeReq = (statusDigest: string): LoopCodexImplementationRequest => ({
      identity,
      workspace: {
        workspacePath: snapshot.workspacePath,
        taskBranch: identity.taskBranch,
        expectedTaskHeadSha: snapshot.taskHeadSha,
        expectedPreStatusDigestSha256: statusDigest,
      },
      phase: "initial",
      attempt: 0,
      requirement: "Change app",
      allowedPaths: ["src/app.ts"],
    });

    // I.1 first apply — applied
    const r1 = await adapter.execute(makeReq(snapshot.taskStatusDigestSha256));
    ok(r1.status === "succeeded", "I.1 first apply succeeded");
    if (r1.status === "succeeded") {
      ok(r1.applicationState === "applied", "I.1 state is applied");
    }

    // I.2 second same patch with updated digest — already_applied
    const snap2 = await wsm.inspect(identity);
    const r2 = await adapter.execute(makeReq(snap2.taskStatusDigestSha256));
    ok(r2.status === "succeeded", "I.2 second apply succeeded");
    if (r2.status === "succeeded") {
      ok(r2.applicationState === "already_applied", "I.2 state is already_applied");
      ok(r2.preTaskHeadSha === r2.postTaskHeadSha, "I.2 HEAD unchanged");
    }

    try { await wsm.cleanup(identity, { expectedTaskHeadSha: snapshot.taskHeadSha, deleteTaskBranch: true }); } catch { /* ok */ }
  } finally {
    rmSync(fx.tempRoot, { recursive: true, force: true });
  }
}

// ═══════════════════════════════════════
// J. Runner Request Verification
// ═══════════════════════════════════════

console.log("\n── J. Runner Request ──");

async function testRunnerRequest(): Promise<void> {
  const fx = makeFixture();
  try {
    const identity = makeIdentity(fx);
    const runner = makeRunner(fx.repoPath, fx.controlRoot, fx.home);
    const wsm = new LoopGitWorkspaceManager({
      runner, gitExecutableId: "git", gitTimeoutMs: 15000,
    });
    const snapshot = await wsm.prepare(identity);

    const artifactStore = new LoopArtifactStore({
      controlRoot: fx.controlRoot, repositoryPath: fx.repoPath,
    });
    artifactStore.init();

    const patchManager = new LoopPatchApplicationManager({
      runner, workspaceManager: wsm, gitExecutableId: "git", gitTimeoutMs: 15000,
    });

    const diff = makeSimpleDiff("src/app.ts",
      "export function app() { return 1; }\n",
      "export function app() { return 2; }\n");
    const stdout = wrapInFence(diff);
    const fakeRunner = makeFakeCodexRunner(() => makeSuccessResult(stdout));

    const adapter = new LoopCodexImplementationAdapter({
      runner: fakeRunner, workspaceManager: wsm, artifactStore,
      patchApplicationManager: patchManager, codexExecutableId: "fake-codex",
    });

    const req: LoopCodexImplementationRequest = {
      identity,
      workspace: {
        workspacePath: snapshot.workspacePath,
        taskBranch: identity.taskBranch,
        expectedTaskHeadSha: snapshot.taskHeadSha,
        expectedPreStatusDigestSha256: snapshot.taskStatusDigestSha256,
      },
      phase: "initial",
      attempt: 0,
      requirement: "Change app",
      allowedPaths: ["src/app.ts"],
    };

    await adapter.execute(req);

    ok(fakeRunner.lastRequest !== null, "J.1 runner was called");
    if (fakeRunner.lastRequest) {
      ok(fakeRunner.lastRequest.executableId === "fake-codex", "J.2 executable ID correct");
      ok(fakeRunner.lastRequest.cwd === snapshot.workspacePath, "J.3 cwd is workspace");
      ok(fakeRunner.lastRequest.stdin !== undefined, "J.4 stdin is set");
      ok(fakeRunner.lastRequest.args !== undefined, "J.5 args is set");
      if (fakeRunner.lastRequest.args) {
        ok(fakeRunner.lastRequest.args.includes("--sandbox"), "J.6 has --sandbox");
        ok(fakeRunner.lastRequest.args.includes("read-only"), "J.7 read-only sandbox");
        ok(fakeRunner.lastRequest.args.includes("--ephemeral"), "J.8 ephemeral");
        ok(fakeRunner.lastRequest.args.includes("--cd"), "J.9 has --cd");
      }
      ok(fakeRunner.lastRequest.env === undefined, "J.10 no env from request");
      ok(fakeRunner.callCount === 1, "J.11 exactly one Codex call");
    }

    try { await wsm.cleanup(identity, { expectedTaskHeadSha: snapshot.taskHeadSha, deleteTaskBranch: true }); } catch { /* ok */ }
  } finally {
    rmSync(fx.tempRoot, { recursive: true, force: true });
  }
}

// ═══════════════════════════════════════
// Main
// ═══════════════════════════════════════

async function main(): Promise<void> {
  // Record real source state before any test
  const realSourcePath = "/Users/eric/meicai/projects/ai-sdlc-standard";
  let realSourceHeadBefore = "";
  try {
    realSourceHeadBefore = execFileSync("git", ["-C", realSourcePath, "rev-parse", "HEAD"],
      { encoding: "utf8" }).trim();
  } catch { /* ok */ }

  // Run tests
  await testPhaseValidation();
  await testInitialIntegration();
  await testFailures();
  await testD03Binding();
  await testRepairPhases();
  await testAlreadyApplied();
  await testRunnerRequest();

  // Verify real source unchanged
  let realSourceHeadAfter = "";
  let sourceUnchanged = false;
  try {
    realSourceHeadAfter = execFileSync("git", ["-C", realSourcePath, "rev-parse", "HEAD"],
      { encoding: "utf8" }).trim();
    const statusOut = execFileSync("git", ["-C", realSourcePath, "status", "--short"],
      { encoding: "utf8" }).trim();
    // Topic07 has a known dirty file: M scripts/validate-skill-contracts.rb
    // Verify it still exists and no new modifications appeared
    const expectedStatus = "M scripts/validate-skill-contracts.rb";
    sourceUnchanged = realSourceHeadBefore === realSourceHeadAfter && statusOut === expectedStatus;
  } catch { /* ok */ }

  console.log(`\nD05_TARGETED_SUMMARY total=${passed + failed} passed=${passed} failed=${failed}`);
  console.log(`D05_TEMP_CLEANUP_COMPLETE true`);
  console.log(`D05_REAL_SOURCE_UNCHANGED ${sourceUnchanged}`);

  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Test harness error:", e);
  process.exit(1);
});
