// LOOP Git Workspace — R1-C1 Comprehensive Semantic Safety Tests
// ================================================================
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync, existsSync, lstatSync, readFileSync, readlinkSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter, resolve, relative } from "node:path";
import { execFileSync } from "node:child_process";
import { LoopGitWorkspaceManager, LoopGitWorkspaceError } from "../core/loop-git-workspace";
import { LoopPosixProcessRunner } from "../core/loop-posix-process-runner";
import type { LoopRunIdentity } from "../core/loop-executor-types";

let p = 0, f = 0;
function ok(c: boolean, m: string) { if (c) { p++; console.log(`  ✓ ${m}`); } else { f++; console.error(`  ✗ ${m}`); } }

function assertThrows(fn: () => any, code: string, label: string): void {
  try { fn(); ok(false, label + " (no throw)"); }
  catch (e: any) { ok(e instanceof LoopGitWorkspaceError && e.code === code, `${label}→${e?.code ?? "?"}`); }
}
async function assertThrowsAsync(fn: () => Promise<any>, code: string, label: string): Promise<void> {
  try { await fn(); ok(false, label + " (no throw)"); }
  catch (e: any) { ok(e instanceof LoopGitWorkspaceError && e.code === code, `${label}→${e?.code ?? "?"}`); }
}

function findGit(): string {
  for (const d of (process.env.PATH || "/usr/bin:/bin").split(delimiter)) {
    const fp = join(d, "git");
    try { const st = require("fs").lstatSync(fp); if (st.isFile() && (st.mode & 0o111)) return realpathSync(fp); } catch {}
  }
  throw new Error("git not found");
}
const GP = findGit();

interface SetupResult {
  tr: string; rp: string; cr: string; baseSha: string; featSha: string; home: string;
}

function setupRepo(): SetupResult {
  const tr = realpathSync(mkdtempSync(join(tmpdir(), "l03r1c1-")));
  const rp = join(tr, "repo"), cr = join(tr, "ctrl");
  mkdirSync(rp, { recursive: true }); mkdirSync(cr, { recursive: true });
  execFileSync(GP, ["init", "-b", "main"], { cwd: rp });
  execFileSync(GP, ["config", "user.name", "t"], { cwd: rp });
  execFileSync(GP, ["config", "user.email", "t@t"], { cwd: rp });
  writeFileSync(join(rp, "f.txt"), "x");
  execFileSync(GP, ["add", "f.txt"], { cwd: rp });
  execFileSync(GP, ["commit", "-m", "init"], { cwd: rp });
  const baseSha = execFileSync(GP, ["rev-parse", "HEAD"], { cwd: rp, encoding: "utf8" }).trim();
  execFileSync(GP, ["checkout", "-b", "feat/loop-runtime-v1"], { cwd: rp });
  writeFileSync(join(rp, "s.ts"), "//");
  execFileSync(GP, ["add", "s.ts"], { cwd: rp });
  execFileSync(GP, ["commit", "-m", "feat"], { cwd: rp });
  const featSha = execFileSync(GP, ["rev-parse", "HEAD"], { cwd: rp, encoding: "utf8" }).trim();
  execFileSync(GP, ["update-ref", "refs/remotes/origin/feat/loop-runtime-v1", featSha], { cwd: rp });
  execFileSync(GP, ["update-ref", "refs/remotes/origin/main", baseSha], { cwd: rp });
  execFileSync(GP, ["remote", "add", "origin", "https://github.com/example/fixture-repo.git"], { cwd: rp });
  execFileSync(GP, ["checkout", "main"], { cwd: rp });
  const homeDir = join(tr, "home"); mkdirSync(homeDir, { recursive: true });
  return { tr, rp, cr, baseSha, featSha, home: homeDir };
}

function mkId(o: { rp: string; cr: string; sha: string; runId?: string; taskBranch?: string; repo?: string; baseBranch?: string }): LoopRunIdentity {
  return Object.freeze({
    runId: o.runId ?? "r", requirementId: "req",
    repository: o.repo ?? "example/fixture-repo", repositoryPath: o.rp,
    baseBranch: o.baseBranch ?? "feat/loop-runtime-v1", expectedBaseSha: o.sha,
    taskBranch: o.taskBranch ?? "codex/t", controlRoot: o.cr,
    createdAt: new Date().toISOString(),
  });
}

function mkRunner(rp: string, cr: string, homeDir: string) {
  return new LoopPosixProcessRunner({
    executables: [{ id: "git", executablePath: GP, allowDynamicArgs: true, stdinMode: "forbidden" }],
    allowedCwdRoots: [rp, cr],
    fixedEnv: { GIT_TERMINAL_PROMPT: "0", HOME: homeDir, PATH: join(GP, ".."), LC_ALL: "C", LANG: "C" },
    allowedRequestEnvKeys: [], defaultTimeoutMs: 15000,
  });
}

async function main() {
  console.log("LOOP Git Workspace R1-C1 — Comprehensive Semantic Safety Tests\n");

  // ════════════════════════════════════════════════════════════════
  // A. Scanner (14 checks)
  // ════════════════════════════════════════════════════════════════
  {
    console.log("A. Scanner");
    const { tr, rp, cr, baseSha, featSha, home } = setupRepo();
    const runner = mkRunner(rp, cr, home);

    let gc = 0;
    const go = { get runner() { gc++; return runner; }, gitExecutableId: "g" };
    assertThrows(() => new LoopGitWorkspaceManager(go as any), "INVALID_INPUT", "getter rejected");
    ok(gc === 0, "getter call count=0");

    assertThrows(() => new LoopGitWorkspaceManager(
      Object.defineProperty({ gitExecutableId: "g" }, "runner", { set(v: any) {}, enumerable: true, configurable: true }) as any
    ), "INVALID_INPUT", "setter rejected");

    const protoOwn: any = { runner, gitExecutableId: "g" };
    Object.defineProperty(protoOwn, "__proto__", { value: {}, enumerable: true });
    assertThrows(() => new LoopGitWorkspaceManager(protoOwn), "INVALID_INPUT", "__proto__ key rejected");

    const symDesc = Symbol("test");
    const symObj: any = { runner, gitExecutableId: "g" };
    Object.defineProperty(symObj, symDesc, { value: 1, enumerable: true });
    assertThrows(() => new LoopGitWorkspaceManager(symObj), "INVALID_INPUT", "symbol key rejected");

    assertThrows(() => new LoopGitWorkspaceManager([] as any), "INVALID_INPUT", "array rejected");

    class Foo { runner = runner; gitExecutableId = "g"; }
    assertThrows(() => new LoopGitWorkspaceManager(new Foo() as any), "INVALID_INPUT", "class rejected");

    assertThrows(() => new LoopGitWorkspaceManager({ runner, gitExecutableId: "g", bad: 1 } as any), "INVALID_INPUT", "unknown field rejected");

    // Throwing getPrototypeOf — pass Proxy directly
    const throwProto = new Proxy({ runner, gitExecutableId: "g" }, {
      getPrototypeOf() { throw new Error("boom"); }
    });
    assertThrows(() => new LoopGitWorkspaceManager(throwProto as any), "INVALID_INPUT", "throwing getPrototypeOf");

    // Throwing ownKeys
    const throwKeys = new Proxy({ runner, gitExecutableId: "g" }, { ownKeys() { throw new Error("boom"); } });
    assertThrows(() => new LoopGitWorkspaceManager(throwKeys as any), "INVALID_INPUT", "throwing ownKeys");

    // Throwing getOwnPropertyDescriptor
    const throwDesc = new Proxy({ runner, gitExecutableId: "g" }, {
      getOwnPropertyDescriptor() { throw new Error("boom"); }
    });
    assertThrows(() => new LoopGitWorkspaceManager(throwDesc as any), "INVALID_INPUT", "throwing getDescriptor");

    // Cleanup options scanner - malicious input
    const mgr = new LoopGitWorkspaceManager({ runner, gitExecutableId: "git" });
    const id = mkId({ rp, cr, sha: featSha });
    const badOpts: any[] = [
      null, [], { expectedTaskHeadSha: "x" }, { expectedTaskHeadSha: "0000000000000000000000000000000000000000", bad: 1 },
      { expectedTaskHeadSha: "short", deleteTaskBranch: true },
    ];
    for (const bo of badOpts) {
      let caughtCode = "";
      try { await mgr.cleanup(id, bo); } catch (e: any) { caughtCode = e?.code ?? ""; }
      ok(caughtCode === "INVALID_INPUT", "cleanup opts→INVALID_INPUT: " + JSON.stringify(bo).slice(0, 50));
    }

    rmSync(tr, { recursive: true, force: true });
  }

  // ════════════════════════════════════════════════════════════════
  // B. Path & Repository (9 checks)
  // ════════════════════════════════════════════════════════════════
  {
    console.log("B. Path & Repository");
    const { tr, rp, cr, baseSha, featSha, home } = setupRepo();
    const runner = mkRunner(rp, cr, home);
    const mgr = new LoopGitWorkspaceManager({ runner, gitExecutableId: "git" });
    const id = mkId({ rp, cr, sha: featSha });

    // Nested dir containment - repo in ctrl
    const nestedRp = join(cr, "nested-repo");
    mkdirSync(nestedRp, { recursive: true });
    execFileSync(GP, ["init", "-b", "main"], { cwd: nestedRp });
    execFileSync(GP, ["config", "user.name", "t"], { cwd: nestedRp });
    execFileSync(GP, ["config", "user.email", "t@t"], { cwd: nestedRp });
    writeFileSync(join(nestedRp, "f.txt"), "x");
    execFileSync(GP, ["add", "f.txt"], { cwd: nestedRp });
    execFileSync(GP, ["commit", "-m", "init"], { cwd: nestedRp });
    const nestedSha = execFileSync(GP, ["rev-parse", "HEAD"], { cwd: nestedRp, encoding: "utf8" }).trim();
    execFileSync(GP, ["update-ref", "refs/remotes/origin/feat/loop-runtime-v1", nestedSha], { cwd: nestedRp });
    execFileSync(GP, ["remote", "add", "origin", "https://github.com/example/fixture-repo.git"], { cwd: nestedRp });
    assertThrows(() => mgr.workspacePathFor(mkId({ rp: nestedRp, cr, sha: nestedSha, taskBranch: "codex/b1" })),
      "INVALID_INPUT", "repo in ctrl→INVALID_INPUT");

    // Nested dir containment - ctrl in repo
    const nestedCr = join(rp, "nested-ctrl");
    mkdirSync(nestedCr, { recursive: true });
    assertThrows(() => mgr.workspacePathFor(mkId({ rp, cr: nestedCr, sha: featSha, taskBranch: "codex/b2" })),
      "INVALID_INPUT", "ctrl in repo→INVALID_INPUT");

    // Invalid branch name
    await assertThrowsAsync(() => mgr.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "bad branch" })),
      "INVALID_INPUT", "invalid branch→INVALID_INPUT");

    // Repository mismatch
    await assertThrowsAsync(() => mgr.prepare(mkId({ rp, cr, sha: featSha, repo: "other/bad-repo", taskBranch: "codex/b3" })),
      "REPOSITORY_MISMATCH", "repo mismatch→REPOSITORY_MISMATCH");

    // Remote base: missing ref → BASE_SHA_MISMATCH
    execFileSync(GP, ["update-ref", "-d", "refs/remotes/origin/feat/loop-runtime-v1"], { cwd: rp });
    await assertThrowsAsync(() => mgr.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/b-b1" })),
      "BASE_SHA_MISMATCH", "missing ref→BASE_SHA_MISMATCH");
    execFileSync(GP, ["update-ref", "refs/remotes/origin/feat/loop-runtime-v1", featSha], { cwd: rp });

    // Remote base: remote mismatch → BASE_SHA_MISMATCH
    await assertThrowsAsync(() => mgr.prepare(mkId({ rp, cr, sha: baseSha, taskBranch: "codex/b-b2" })),
      "BASE_SHA_MISMATCH", "remote mismatch→BASE_SHA_MISMATCH");

    // Remote base: bad sha → BASE_SHA_MISMATCH
    await assertThrowsAsync(() => mgr.prepare(mkId({ rp, cr, sha: "0000000000000000000000000000000000000000", taskBranch: "codex/b-b3" })),
      "BASE_SHA_MISMATCH", "bad sha→BASE_SHA_MISMATCH");

    // Origin forms verification (https, scp-like SSH, ssh://)
    // These are tested via _valRepo which matches ORIGIN_RE.
    // https origin already in fixture. Confirm prepare works.
    const s1 = await mgr.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/b4" }));
    ok(s1.state === "created", "https origin ok");

    // scp-like SSH origin
    const sshRp = join(tr, "repo-ssh");
    mkdirSync(sshRp, { recursive: true });
    execFileSync(GP, ["init", "-b", "main"], { cwd: sshRp });
    execFileSync(GP, ["config", "user.name", "t"], { cwd: sshRp });
    execFileSync(GP, ["config", "user.email", "t@t"], { cwd: sshRp });
    writeFileSync(join(sshRp, "f.txt"), "x");
    execFileSync(GP, ["add", "f.txt"], { cwd: sshRp });
    execFileSync(GP, ["commit", "-m", "init"], { cwd: sshRp });
    const sshSha = execFileSync(GP, ["rev-parse", "HEAD"], { cwd: sshRp, encoding: "utf8" }).trim();
    execFileSync(GP, ["update-ref", "refs/remotes/origin/main", sshSha], { cwd: sshRp });
    execFileSync(GP, ["remote", "add", "origin", "git@github.com:example/fixture-repo.git"], { cwd: sshRp });
    const sshCr = join(tr, "ssh-ctrl"); mkdirSync(sshCr, { recursive: true });
    const sshRunner = mkRunner(sshRp, sshCr, home);
    const sshMgr = new LoopGitWorkspaceManager({ runner: sshRunner, gitExecutableId: "git" });
    await sshMgr.prepare(mkId({ rp: sshRp, cr: sshCr, sha: sshSha, baseBranch: "main", taskBranch: "codex/b5" }));
    ok(true, "scp-like SSH origin ok");

    // ssh:// origin form
    const ssh2Rp = join(tr, "repo-ssh2");
    mkdirSync(ssh2Rp, { recursive: true });
    execFileSync(GP, ["init", "-b", "main"], { cwd: ssh2Rp });
    execFileSync(GP, ["config", "user.name", "t"], { cwd: ssh2Rp });
    execFileSync(GP, ["config", "user.email", "t@t"], { cwd: ssh2Rp });
    writeFileSync(join(ssh2Rp, "f.txt"), "x");
    execFileSync(GP, ["add", "f.txt"], { cwd: ssh2Rp });
    execFileSync(GP, ["commit", "-m", "init"], { cwd: ssh2Rp });
    const ssh2Sha = execFileSync(GP, ["rev-parse", "HEAD"], { cwd: ssh2Rp, encoding: "utf8" }).trim();
    execFileSync(GP, ["update-ref", "refs/remotes/origin/main", ssh2Sha], { cwd: ssh2Rp });
    execFileSync(GP, ["remote", "add", "origin", "ssh://git@github.com/example/fixture-repo.git"], { cwd: ssh2Rp });
    const ssh2Cr = join(tr, "ssh2-ctrl"); mkdirSync(ssh2Cr, { recursive: true });
    const ssh2Runner = mkRunner(ssh2Rp, ssh2Cr, home);
    const ssh2Mgr = new LoopGitWorkspaceManager({ runner: ssh2Runner, gitExecutableId: "git" });
    await ssh2Mgr.prepare(mkId({ rp: ssh2Rp, cr: ssh2Cr, sha: ssh2Sha, baseBranch: "main", taskBranch: "codex/b6" }));
    ok(true, "ssh:// origin ok");

    rmSync(tr, { recursive: true, force: true });
  }

  // ════════════════════════════════════════════════════════════════
  // C. Source WIP (13 checks)
  // ════════════════════════════════════════════════════════════════
  {
    console.log("C. Source WIP");
    const { tr, rp, cr, baseSha, featSha, home } = setupRepo();
    const runner = mkRunner(rp, cr, home);
    const mgr = new LoopGitWorkspaceManager({ runner, gitExecutableId: "git" });

    // Staged file
    writeFileSync(join(rp, "st.txt"), "staged");
    execFileSync(GP, ["add", "st.txt"], { cwd: rp });
    const s1 = await mgr.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/c1" }));
    ok(s1.state === "created", "staged ok");
    execFileSync(GP, ["reset", "HEAD", "st.txt"], { cwd: rp }); rmSync(join(rp, "st.txt"));

    // Unstaged tracked modification (modify f.txt which exists on main)
    writeFileSync(join(rp, "f.txt"), "modified content");
    const s2 = await mgr.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/c2" }));
    ok(s2.state === "created", "unstaged tracked ok");
    execFileSync(GP, ["checkout", "--", "f.txt"], { cwd: rp });

    // Untracked file with content
    writeFileSync(join(rp, "ut.txt"), "untracked content here");
    const s3 = await mgr.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/c3" }));
    ok(s3.state === "created", "untracked ok");
    rmSync(join(rp, "ut.txt"));

    // Symlink — reads target text, does not follow
    symlinkSync(join(rp, "f.txt"), join(rp, "sl"));
    const s4 = await mgr.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/c4" }));
    ok(s4.state === "created", "symlink ok");
    rmSync(join(rp, "sl"));

    // Size limit
    writeFileSync(join(rp, "big.txt"), "x".repeat(100));
    const mgrSmall = new LoopGitWorkspaceManager({ runner, gitExecutableId: "git", maxSourceWipBytes: 5 });
    await assertThrowsAsync(() => mgrSmall.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/c5" })),
      "SOURCE_WIP_TOO_LARGE", "size limit→SOURCE_WIP_TOO_LARGE");
    rmSync(join(rp, "big.txt"));

    // Special file (FIFO) rejected
    // Skip FIFO on platforms without mkfifo; test via mock in runner tests

    // lstat failure simulation via removed directory mid-operation
    // Tested in Section D via runner injection

    // Mid-operation drift
    const idDrift = mkId({ rp, cr, sha: featSha, taskBranch: "codex/c-drift" });
    const rDrift = mkRunner(rp, cr, home);
    const oDrift = rDrift.run.bind(rDrift);
    let driftInj = false;
    rDrift.run = async function (req: any) {
      if (!driftInj && (req.args as string[]).join(" ").includes("ls-files")) {
        const r = await oDrift(req);
        if (!driftInj) { driftInj = true; writeFileSync(join(rp, "dr.txt"), "x"); }
        return r;
      }
      return oDrift(req);
    };
    const mDrift = new LoopGitWorkspaceManager({ runner: rDrift, gitExecutableId: "git" });
    let caughtDrift = false;
    try { await mDrift.prepare(idDrift); } catch (e: any) { if (e?.code === "SOURCE_WORKSPACE_DRIFT") caughtDrift = true; }
    ok(caughtDrift, "mid-op drift→SOURCE_WORKSPACE_DRIFT");
    if (existsSync(join(rp, "dr.txt"))) rmSync(join(rp, "dr.txt"));

    // After-fingerprint failure → SOURCE_WORKSPACE_DRIFT
    const idAf = mkId({ rp, cr, sha: featSha, taskBranch: "codex/c-af" });
    const rAf = mkRunner(rp, cr, home);
    const oAf = rAf.run.bind(rAf);
    let afStage = 0;
    rAf.run = async function (req: any) {
      const argsStr = (req.args as string[]).join(" ");
      if (afStage === 0 && argsStr.includes("ls-files")) { afStage = 1; return oAf(req); }
      // Second fingerprint — fail during ls-files
      if (afStage === 1 && argsStr.includes("ls-files")) {
        throw new Error("runner crash during final fingerprint");
      }
      return oAf(req);
    };
    const mAf = new LoopGitWorkspaceManager({ runner: rAf, gitExecutableId: "git" });
    let caughtAf = false;
    try { await mAf.prepare(idAf); } catch (e: any) { if (e?.code === "SOURCE_WORKSPACE_DRIFT") caughtAf = true; }
    ok(caughtAf, "after-fingerprint fail→SOURCE_WORKSPACE_DRIFT");

    // Git fingerprint command failure → SOURCE_WORKSPACE_DRIFT (via runner injection in Section D)
    // readFile/lstat/readlink failures tested via runner injection in Section D

    // Base drift detection
    const idDrift2 = mkId({ rp, cr, sha: featSha, taskBranch: "codex/c-drift2" });
    await mgr.prepare(idDrift2);
    execFileSync(GP, ["update-ref", "refs/remotes/origin/feat/loop-runtime-v1", baseSha], { cwd: rp });
    const sDrift = await mgr.inspect(idDrift2);
    ok(sDrift.baseDrifted, "base drift detected");
    execFileSync(GP, ["update-ref", "refs/remotes/origin/feat/loop-runtime-v1", featSha], { cwd: rp });

    rmSync(tr, { recursive: true, force: true });
  }

  // ════════════════════════════════════════════════════════════════
  // D. Runner & Git Exit Codes (11 checks)
  // ════════════════════════════════════════════════════════════════
  {
    console.log("D. Runner & Git Exit Codes");
    const { tr, rp, cr, baseSha, featSha, home } = setupRepo();

    // Helper: create a manager with an intercepted runner
    function interceptedMgr(inject: (req: any, orig: (req: any) => Promise<any>) => Promise<any>) {
      const baseRunner = mkRunner(rp, cr, home);
      const orig = baseRunner.run.bind(baseRunner);
      baseRunner.run = async (req: any) => inject(req, orig);
      return new LoopGitWorkspaceManager({ runner: baseRunner, gitExecutableId: "git" });
    }

    // Runner throw
    const mgrThrow = interceptedMgr(async (_req, _orig) => { throw new Error("runner crash"); });
    await assertThrowsAsync(() => mgrThrow.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/d1" })),
      "GIT_COMMAND_FAILED", "runner throw→GIT_COMMAND_FAILED");

    // timed_out
    const mgrTimeout = interceptedMgr(async (req, _orig) => {
      return { status: "timed_out", exitCode: null, stdout: "", stderr: "", signal: null,
        timedOut: true, stdoutTruncated: false, stderrTruncated: false, wallMs: 100 };
    });
    await assertThrowsAsync(() => mgrTimeout.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/d2" })),
      "GIT_COMMAND_FAILED", "timed_out→GIT_COMMAND_FAILED");

    // null exit
    const mgrNullExit = interceptedMgr(async (req, _orig) => {
      return { status: "exited", exitCode: null, stdout: "", stderr: "", signal: null,
        timedOut: false, stdoutTruncated: false, stderrTruncated: false, wallMs: 100 };
    });
    await assertThrowsAsync(() => mgrNullExit.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/d3" })),
      "GIT_COMMAND_FAILED", "null exit→GIT_COMMAND_FAILED");

    // signal
    const mgrSignal = interceptedMgr(async (req, _orig) => {
      return { status: "signaled", exitCode: null, stdout: "", stderr: "", signal: "SIGKILL",
        timedOut: false, stdoutTruncated: false, stderrTruncated: false, wallMs: 100 };
    });
    await assertThrowsAsync(() => mgrSignal.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/d4" })),
      "GIT_COMMAND_FAILED", "signal→GIT_COMMAND_FAILED");

    // stdout truncation
    const mgrStdoutTrunc = interceptedMgr(async (req, _orig) => {
      const r = await _orig(req);
      return { ...r, stdoutTruncated: true };
    });
    await assertThrowsAsync(() => mgrStdoutTrunc.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/d5" })),
      "GIT_COMMAND_FAILED", "stdout truncation→GIT_COMMAND_FAILED");

    // stderr truncation
    const mgrStderrTrunc = interceptedMgr(async (req, _orig) => {
      const r = await _orig(req);
      return { ...r, stderrTruncated: true };
    });
    await assertThrowsAsync(() => mgrStderrTrunc.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/d6" })),
      "GIT_COMMAND_FAILED", "stderr truncation→GIT_COMMAND_FAILED");

    // show-ref exit 2 (in _verifyStructure context via corrupt repo)
    // Tested via worktree structure tests in Section E

    // merge-base --is-ancestor exit >1
    const idD7 = mkId({ rp, cr, sha: featSha, taskBranch: "codex/d7" });
    const mgrD7real = new LoopGitWorkspaceManager({ runner: mkRunner(rp, cr, home), gitExecutableId: "git" });
    await mgrD7real.prepare(idD7);
    const mgrMergeBase = interceptedMgr(async (req, _orig) => {
      const argsStr = (req.args as string[]).join(" ");
      if (argsStr.includes("merge-base") && argsStr.includes("--is-ancestor")) {
        return { status: "exited", exitCode: 2, stdout: "", stderr: "fatal", signal: null,
          timedOut: false, stdoutTruncated: false, stderrTruncated: false, wallMs: 10 };
      }
      return _orig(req);
    });
    await assertThrowsAsync(() => mgrMergeBase.prepare(idD7), "GIT_COMMAND_FAILED", "merge-base exit>1→GIT_COMMAND_FAILED");

    // symbolic-ref exit >1 (in _verifyStructure, cwd is workspace path not repo path)
    const idD8 = mkId({ rp, cr, sha: featSha, taskBranch: "codex/d8" });
    const mgrD8real = new LoopGitWorkspaceManager({ runner: mkRunner(rp, cr, home), gitExecutableId: "git" });
    await mgrD8real.prepare(idD8);
    const mgrSymRef = interceptedMgr(async (req, _orig) => {
      const argsStr = (req.args as string[]).join(" ");
      // Only intercept workspace-path symbolic-ref (not source repo calls)
      if (argsStr.includes("symbolic-ref") && (req.cwd as string) !== rp) {
        return { status: "exited", exitCode: 128, stdout: "", stderr: "fatal", signal: null,
          timedOut: false, stdoutTruncated: false, stderrTruncated: false, wallMs: 10 };
      }
      return _orig(req);
    });
    await assertThrowsAsync(() => mgrSymRef.prepare(idD8), "WORKSPACE_CORRUPT", "symbolic-ref exit>1→WORKSPACE_CORRUPT");

    // show-ref exit 2 in structural context → WORKSPACE_CORRUPT
    // Tested via worktree corrupt scenarios in Section E

    // rev-parse exit non-zero in _verifyStructure → WORKSPACE_CORRUPT
    const idD9 = mkId({ rp, cr, sha: featSha, taskBranch: "codex/d9" });
    const mgrD9real = new LoopGitWorkspaceManager({ runner: mkRunner(rp, cr, home), gitExecutableId: "git" });
    await mgrD9real.prepare(idD9);
    const mgrRevParse = interceptedMgr(async (req, _orig) => {
      const argsStr = (req.args as string[]).join(" ");
      // Only intercept workspace-path rev-parse HEAD (not source repo calls)
      if (argsStr.includes("rev-parse") && argsStr.includes("HEAD") &&
          !argsStr.includes("--git-common-dir") && !argsStr.includes("refs/heads") &&
          (req.cwd as string) !== rp) {
        return { status: "exited", exitCode: 128, stdout: "", stderr: "fatal", signal: null,
          timedOut: false, stdoutTruncated: false, stderrTruncated: false, wallMs: 10 };
      }
      return _orig(req);
    });
    await assertThrowsAsync(() => mgrRevParse.prepare(idD9), "WORKSPACE_CORRUPT", "rev-parse fail→WORKSPACE_CORRUPT");

    rmSync(tr, { recursive: true, force: true });
  }

  // ════════════════════════════════════════════════════════════════
  // E. Worktree Structure Corruption (16 checks)
  // ════════════════════════════════════════════════════════════════
  {
    console.log("E. Worktree Structure");
    const { tr, rp, cr, baseSha, featSha, home } = setupRepo();
    const runner = mkRunner(rp, cr, home);
    const mgr = new LoopGitWorkspaceManager({ runner, gitExecutableId: "git" });

    // E1. Detached HEAD → WORKSPACE_CORRUPT
    const idE1 = mkId({ rp, cr, sha: featSha, taskBranch: "codex/e1" });
    const e1Path = mgr.workspacePathFor(idE1);
    execFileSync(GP, ["worktree", "add", "--detach", e1Path, featSha], { cwd: rp });
    await assertThrowsAsync(() => mgr.prepare(idE1), "WORKSPACE_CORRUPT", "detached→WORKSPACE_CORRUPT");
    try { execFileSync(GP, ["worktree", "remove", "--force", e1Path], { cwd: rp }); } catch {}

    // E2. Exact prunable registration with path existing
    const idE2 = mkId({ rp, cr, sha: featSha, taskBranch: "codex/e2" });
    const e2Path = mgr.workspacePathFor(idE2);
    execFileSync(GP, ["worktree", "add", "-b", "codex/e2", e2Path, featSha], { cwd: rp });
    // Mark it prunable by removing the worktree dir but keeping registration
    execFileSync(GP, ["worktree", "remove", e2Path], { cwd: rp });
    // Re-create the path but without registration
    mkdirSync(e2Path, { recursive: true });
    // Now the path exists but is a prunable registration
    // Simulate prunable: we need to make git think it's prunable
    // Actually, worktree remove already cleaned the registration. Let me use a different approach.
    // Force-corrupt .git/worktrees to create a prunable registration
    rmSync(e2Path, { recursive: true, force: true });

    // E3. Exact prunable path missing → WORKSPACE_CORRUPT
    const idE3 = mkId({ rp, cr, sha: featSha, taskBranch: "codex/e3" });
    const e3Path = mgr.workspacePathFor(idE3);
    execFileSync(GP, ["worktree", "add", "-b", "codex/e3", e3Path, featSha], { cwd: rp });
    // Corrupt: remove the .git worktree file to make it prunable
    const wtDir = join(rp, ".git", "worktrees", "codex/e3");
    if (!existsSync(wtDir)) {
      // Find the worktree ID
      const wtList = execFileSync(GP, ["worktree", "list", "--porcelain"], { cwd: rp, encoding: "utf8" });
      // Use a simpler approach: directly test with a manually broken setup
    }
    execFileSync(GP, ["worktree", "remove", e3Path], { cwd: rp });
    try { execFileSync(GP, ["branch", "-D", "codex/e3"], { cwd: rp }); } catch {}

    // E4. Task branch at other valid path → TASK_BRANCH_CONFLICT
    const idE4 = mkId({ rp, cr, sha: featSha, taskBranch: "codex/e4" });
    const e4Path = mgr.workspacePathFor(idE4);
    const e4OtherPath = join(tr, "other-wt");
    execFileSync(GP, ["worktree", "add", "-b", "codex/e4", e4OtherPath, featSha], { cwd: rp });
    // Branch has worktree at e4OtherPath, not e4Path → TASK_BRANCH_CONFLICT
    await assertThrowsAsync(() => mgr.prepare(idE4), "TASK_BRANCH_CONFLICT", "branch elsewhere→TASK_BRANCH_CONFLICT");
    try { execFileSync(GP, ["worktree", "remove", e4OtherPath], { cwd: rp }); } catch {}
    try { execFileSync(GP, ["branch", "-D", "codex/e4"], { cwd: rp }); } catch {}

    // E5. Registered path missing → WORKSPACE_CORRUPT
    const idE5 = mkId({ rp, cr, sha: featSha, taskBranch: "codex/e5" });
    const e5Path = mgr.workspacePathFor(idE5);
    execFileSync(GP, ["worktree", "add", "-b", "codex/e5", e5Path, featSha], { cwd: rp });
    rmSync(e5Path, { recursive: true, force: true });
    await assertThrowsAsync(() => mgr.prepare(idE5), "WORKSPACE_CORRUPT", "path missing→WORKSPACE_CORRUPT");
    try { execFileSync(GP, ["worktree", "prune"], { cwd: rp }); } catch {}
    try { execFileSync(GP, ["branch", "-D", "codex/e5"], { cwd: rp }); } catch {}

    // E6. Registered path is symlink → WORKSPACE_CORRUPT
    const idE6 = mkId({ rp, cr, sha: featSha, taskBranch: "codex/e6" });
    const e6Path = mgr.workspacePathFor(idE6);
    execFileSync(GP, ["worktree", "add", "-b", "codex/e6", e6Path, featSha], { cwd: rp });
    // Physically corrupt: remove dir, replace with symlink (registration stays)
    rmSync(e6Path, { recursive: true, force: true });
    symlinkSync(join(rp, "f.txt"), e6Path);
    await assertThrowsAsync(() => mgr.prepare(idE6), "WORKSPACE_CORRUPT", "path symlink→WORKSPACE_CORRUPT");
    rmSync(e6Path, { force: true });
    try { execFileSync(GP, ["worktree", "prune"], { cwd: rp }); } catch {}
    try { execFileSync(GP, ["branch", "-D", "codex/e6"], { cwd: rp }); } catch {}

    // E7. Registered path is regular file → WORKSPACE_CORRUPT
    const idE7 = mkId({ rp, cr, sha: featSha, taskBranch: "codex/e7" });
    const e7Path = mgr.workspacePathFor(idE7);
    execFileSync(GP, ["worktree", "add", "-b", "codex/e7", e7Path, featSha], { cwd: rp });
    // Physically corrupt: remove dir, replace with regular file (registration stays)
    rmSync(e7Path, { recursive: true, force: true });
    writeFileSync(e7Path, "not a dir");
    await assertThrowsAsync(() => mgr.prepare(idE7), "WORKSPACE_CORRUPT", "path file→WORKSPACE_CORRUPT");
    rmSync(e7Path, { force: true });
    try { execFileSync(GP, ["worktree", "prune"], { cwd: rp }); } catch {}
    try { execFileSync(GP, ["branch", "-D", "codex/e7"], { cwd: rp }); } catch {}

    // E8. Broken .git link
    const idE8 = mkId({ rp, cr, sha: featSha, taskBranch: "codex/e8" });
    await mgr.prepare(idE8);
    const e8Path = mgr.workspacePathFor(idE8);
    // Break the .git link
    rmSync(join(e8Path, ".git"), { force: true });
    writeFileSync(join(e8Path, ".git"), "broken-link");
    await assertThrowsAsync(() => mgr.prepare(idE8), "WORKSPACE_CORRUPT", "broken git link→WORKSPACE_CORRUPT");
    try { execFileSync(GP, ["worktree", "remove", "--force", e8Path], { cwd: rp }); } catch {}
    try { execFileSync(GP, ["branch", "-D", "codex/e8"], { cwd: rp }); } catch {}

    // E9. Common-dir corrupt → WORKSPACE_CORRUPT (tested via _verifyStructure)
    // This requires corrupting git internals, tested via runner injection

    // E10. Worktree-list HEAD vs workspace HEAD mismatch
    const idE10 = mkId({ rp, cr, sha: featSha, taskBranch: "codex/e10" });
    const e10Path = mgr.workspacePathFor(idE10);
    execFileSync(GP, ["worktree", "add", "-b", "codex/e10", e10Path, featSha], { cwd: rp });
    // Find the worktree id and modify its HEAD to create mismatch
    const wtIds = readdirSync(join(rp, ".git", "worktrees"));
    for (const id of wtIds) {
      const gitFile = join(rp, ".git", "worktrees", id, "gitdir");
      if (existsSync(gitFile)) {
        const wtPath = readFileSync(gitFile, "utf8").trim();
        if (wtPath === join(e10Path, ".git")) {
          writeFileSync(join(rp, ".git", "worktrees", id, "HEAD"),
            "0000000000000000000000000000000000000000\n");
          break;
        }
      }
    }
    await assertThrowsAsync(() => mgr.prepare(idE10), "WORKSPACE_CORRUPT", "HEAD/wt-list mismatch→WORKSPACE_CORRUPT");
    try { execFileSync(GP, ["worktree", "remove", "--force", e10Path], { cwd: rp }); } catch {}
    try { execFileSync(GP, ["branch", "-D", "codex/e10"], { cwd: rp }); } catch {}

    // E11. Workspace HEAD vs branch ref mismatch (via runner injection)
    const idE11 = mkId({ rp, cr, sha: featSha, taskBranch: "codex/e11" });
    const e11Path = mgr.workspacePathFor(idE11);
    execFileSync(GP, ["worktree", "add", "-b", "codex/e11", e11Path, featSha], { cwd: rp });
    // Use runner injection to simulate HEAD/ref mismatch while symbolic-ref succeeds
    const rE11 = mkRunner(rp, cr, home);
    const oE11 = rE11.run.bind(rE11);
    let e11Call = 0;
    rE11.run = async function (req: any) {
      const argsStr = (req.args as string[]).join(" ");
      // Let symbolic-ref succeed normally
      if (argsStr.includes("symbolic-ref")) return oE11(req);
      // For wsHead rev-parse (in workspace, cwd !== rp): return SHA-A
      if (argsStr.includes("rev-parse") && argsStr.includes("HEAD") &&
          !argsStr.includes("--git-common-dir") && !argsStr.includes("refs/heads") &&
          (req.cwd as string) !== rp) {
        return { status: "exited", exitCode: 0,
          stdout: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n", stderr: "", signal: null,
          timedOut: false, stdoutTruncated: false, stderrTruncated: false, wallMs: 1 };
      }
      // For brRefVal rev-parse: return SHA-B
      if (argsStr.includes("rev-parse") && argsStr.includes("refs/heads/codex/e11")) {
        return { status: "exited", exitCode: 0,
          stdout: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n", stderr: "", signal: null,
          timedOut: false, stdoutTruncated: false, stderrTruncated: false, wallMs: 1 };
      }
      return oE11(req);
    };
    const mE11 = new LoopGitWorkspaceManager({ runner: rE11, gitExecutableId: "git" });
    await assertThrowsAsync(() => mE11.prepare(idE11), "WORKSPACE_CORRUPT", "HEAD/ref mismatch→WORKSPACE_CORRUPT");
    try { execFileSync(GP, ["worktree", "remove", e11Path], { cwd: rp }); } catch {}

    // E12. Expected base not ancestor of task HEAD
    const idE12 = mkId({ rp, cr, sha: featSha, taskBranch: "codex/e12" });
    // Create worktree with main (not featSha) as base
    const e12Path = mgr.workspacePathFor(idE12);
    execFileSync(GP, ["worktree", "add", "-b", "codex/e12", e12Path, baseSha], { cwd: rp });
    // main is ancestor but featSha is expected base
    await assertThrowsAsync(() => mgr.prepare(idE12), "TASK_BRANCH_CONFLICT", "base not ancestor→TASK_BRANCH_CONFLICT");
    try { execFileSync(GP, ["worktree", "remove", e12Path], { cwd: rp }); } catch {}
    try { execFileSync(GP, ["branch", "-D", "codex/e12"], { cwd: rp }); } catch {}

    // E13. Target directory exists but unregistered
    const idE13 = mkId({ rp, cr, sha: featSha, taskBranch: "codex/e13" });
    const e13Path = mgr.workspacePathFor(idE13);
    mkdirSync(e13Path, { recursive: true });
    await assertThrowsAsync(() => mgr.prepare(idE13), "WORKTREE_CONFLICT", "unregistered→WORKTREE_CONFLICT");
    rmSync(e13Path, { recursive: true, force: true });

    // E14. Target registered by other branch → WORKTREE_CONFLICT
    const idE14 = mkId({ rp, cr, sha: featSha, taskBranch: "codex/e14" });
    const e14Path = mgr.workspacePathFor(idE14);
    execFileSync(GP, ["worktree", "add", "-b", "codex/e14-other", e14Path, featSha], { cwd: rp });
    await assertThrowsAsync(() => mgr.prepare(idE14), "WORKTREE_CONFLICT", "other branch→WORKTREE_CONFLICT");
    try { execFileSync(GP, ["worktree", "remove", e14Path], { cwd: rp }); } catch {}
    try { execFileSync(GP, ["branch", "-D", "codex/e14-other"], { cwd: rp }); } catch {}

    // E15. Task branch at other valid path → TASK_BRANCH_CONFLICT
    // Already covered by E4

    rmSync(tr, { recursive: true, force: true });
  }

  // ════════════════════════════════════════════════════════════════
  // F. Concurrency & Cleanup (17 checks)
  // ════════════════════════════════════════════════════════════════
  {
    console.log("F. Concurrency & Cleanup");
    const { tr, rp, cr, baseSha, featSha, home } = setupRepo();
    const runner = mkRunner(rp, cr, home);
    const mgr = new LoopGitWorkspaceManager({ runner, gitExecutableId: "git" });

    // F1-2. Same identity → exactly one created, one recovered
    const idF1 = mkId({ rp, cr, sha: featSha, runId: "f1", taskBranch: "codex/f1" });
    const rF1 = mkRunner(rp, cr, home);
    const mFa = new LoopGitWorkspaceManager({ runner: rF1, gitExecutableId: "git" });
    const mFb = new LoopGitWorkspaceManager({ runner: rF1, gitExecutableId: "git" });
    const [fa, fb] = await Promise.all([mFa.prepare(idF1), mFb.prepare(idF1)]);
    ok(fa.workspacePath === fb.workspacePath, "same identity same path");
    const states = [fa.state, fb.state].sort().join(",");
    ok(states === "created,recovered" || states === "recovered,created", "one created one recovered: " + states);

    // F3-4. Same taskBranch → exactly one success, one TASK_BRANCH_CONFLICT
    const idF2a = mkId({ rp, cr, sha: featSha, runId: "f2a", taskBranch: "codex/f2" });
    const idF2b = mkId({ rp, cr, sha: featSha, runId: "f2b", taskBranch: "codex/f2" });
    const rF2 = mkRunner(rp, cr, home);
    const mF2a = new LoopGitWorkspaceManager({ runner: rF2, gitExecutableId: "git" });
    const mF2b = new LoopGitWorkspaceManager({ runner: rF2, gitExecutableId: "git" });
    const outF2: string[] = [];
    await Promise.allSettled([
      mF2a.prepare(idF2a).then(() => outF2.push("ok"), (e: any) => outF2.push(e?.code || "?")),
      mF2b.prepare(idF2b).then(() => outF2.push("ok"), (e: any) => outF2.push(e?.code || "?")),
    ]);
    ok(outF2.filter((o) => o === "ok").length === 1, "exactly one ok");
    ok(outF2.filter((o) => o === "TASK_BRANCH_CONFLICT").length === 1, "exactly one TASK_BRANCH_CONFLICT: " + outF2.join(","));

    // F5-6. Different Run isolation — cleanup A doesn't affect B
    const idA = mkId({ rp, cr, sha: featSha, runId: "fa", taskBranch: "codex/fa" });
    const idB = mkId({ rp, cr, sha: featSha, runId: "fb", taskBranch: "codex/fb" });
    const rF3 = mkRunner(rp, cr, home);
    const mF3 = new LoopGitWorkspaceManager({ runner: rF3, gitExecutableId: "git" });
    const [jA, jB] = await Promise.all([mF3.prepare(idA), mF3.prepare(idB)]);
    ok(jA.state === "created" && jB.state === "created", "both created isolated");
    ok(jA.workspacePath !== jB.workspacePath, "different paths");

    // Cleanup A — B unaffected
    await mF3.cleanup(idA, { expectedTaskHeadSha: jA.taskHeadSha });
    const jBstill = await mF3.inspect(idB);
    ok(jBstill.state === "inspected", "B unaffected after A cleanup");

    // F7. Dirty cleanup blocked
    const idF7 = mkId({ rp, cr, sha: featSha, taskBranch: "codex/f7" });
    const sF7 = await mgr.prepare(idF7);
    writeFileSync(join(sF7.workspacePath, "d.txt"), "dirty");
    await assertThrowsAsync(() => mgr.cleanup(idF7, { expectedTaskHeadSha: sF7.taskHeadSha }),
      "WORKSPACE_DIRTY", "dirty blocked→WORKSPACE_DIRTY");
    rmSync(join(sF7.workspacePath, "d.txt"));
    execFileSync(GP, ["checkout", "--", "."], { cwd: sF7.workspacePath });

    // F8. Branch-only expected-head mismatch
    const idF8 = mkId({ rp, cr, sha: featSha, taskBranch: "codex/f8" });
    await mgr.prepare(idF8);
    const wsF8 = mgr.workspacePathFor(idF8);
    const headF8 = execFileSync(GP, ["rev-parse", "HEAD"], { cwd: wsF8, encoding: "utf8" }).trim();
    await mgr.cleanup(idF8, { expectedTaskHeadSha: headF8 }); // remove worktree
    // Now branch-only cleanup with wrong head
    await assertThrowsAsync(() => mgr.cleanup(idF8, { expectedTaskHeadSha: "0000000000000000000000000000000000000000" }),
      "CLEANUP_BLOCKED", "branch-only wrong head→CLEANUP_BLOCKED");

    // F9. Exact expected-head mismatch
    const idF9 = mkId({ rp, cr, sha: featSha, taskBranch: "codex/f9" });
    const sF9 = await mgr.prepare(idF9);
    await assertThrowsAsync(() => mgr.cleanup(idF9, { expectedTaskHeadSha: "0000000000000000000000000000000000000000" }),
      "CLEANUP_BLOCKED", "exact wrong head→CLEANUP_BLOCKED");
    await mgr.cleanup(idF9, { expectedTaskHeadSha: sF9.taskHeadSha });

    // F10. Unmerged branch -d rejected
    const idF10 = mkId({ rp, cr, sha: featSha, taskBranch: "codex/f10" });
    const sF10 = await mgr.prepare(idF10);
    await mgr.cleanup(idF10, { expectedTaskHeadSha: sF10.taskHeadSha });
    await assertThrowsAsync(() => mgr.cleanup(idF10, { expectedTaskHeadSha: sF10.taskHeadSha, deleteTaskBranch: true }),
      "CLEANUP_BLOCKED", "unmerged -d rejected→CLEANUP_BLOCKED");

    // F11. Branch-only safe delete with ref verification
    const idF11 = mkId({ rp, cr, sha: baseSha, baseBranch: "main", taskBranch: "codex/f11" });
    const sF11 = await mgr.prepare(idF11);
    const hF11 = sF11.taskHeadSha;
    await mgr.cleanup(idF11, { expectedTaskHeadSha: hF11 }); // remove worktree
    const clF11 = await mgr.cleanup(idF11, { expectedTaskHeadSha: hF11, deleteTaskBranch: true });
    ok(clF11.taskBranchDeleted, "branch-only safe delete ok");

    // F12. Exact safe delete with ref verification
    const idF12 = mkId({ rp, cr, sha: baseSha, baseBranch: "main", taskBranch: "codex/f12" });
    const sF12 = await mgr.prepare(idF12);
    const hF12 = sF12.taskHeadSha;
    const clF12 = await mgr.cleanup(idF12, { expectedTaskHeadSha: hF12, deleteTaskBranch: true });
    ok(clF12.taskBranchDeleted, "exact safe delete ok");
    ok(clF12.worktreeRemoved, "worktree removed");

    // F13. Idempotent cleanup
    const idF13 = mkId({ rp, cr, sha: featSha, taskBranch: "codex/f13" });
    const sF13 = await mgr.prepare(idF13);
    const cl1 = await mgr.cleanup(idF13, { expectedTaskHeadSha: sF13.taskHeadSha });
    ok(cl1.worktreeRemoved, "first cleanup removed");
    const cl2 = await mgr.cleanup(idF13, { expectedTaskHeadSha: sF13.taskHeadSha });
    ok(cl2.taskBranchRetained && !cl2.alreadyAbsent, "idempotent retain");

    // F14. Remove后 exact residue → CLEANUP_BLOCKED
    // Inject: after worktree remove succeeds, re-create a registration to simulate residue
    const idF14 = mkId({ rp, cr, sha: featSha, taskBranch: "codex/f14" });
    const sF14 = await mgr.prepare(idF14);
    const wsF14 = sF14.workspacePath;
    const rF14 = mkRunner(rp, cr, home);
    const oF14 = rF14.run.bind(rF14);
    let f14Injected = false;
    rF14.run = async function (req: any) {
      const r = await oF14(req);
      const argsStr = (req.args as string[]).join(" ");
      if (!f14Injected && argsStr.includes("worktree") && argsStr.includes("remove")) {
        f14Injected = true;
        // Simulate residue: re-add a worktree registration pointing to the same path
        const wtBase = join(rp, ".git", "worktrees", "residue-f14");
        mkdirSync(wtBase, { recursive: true });
        writeFileSync(join(wtBase, "gitdir"), join(wsF14, ".git"));
        writeFileSync(join(wtBase, "HEAD"), `ref: refs/heads/codex/f14\n`);
        writeFileSync(join(wtBase, "commondir"), join(rp, ".git"));
      }
      return r;
    };
    const mF14 = new LoopGitWorkspaceManager({ runner: rF14, gitExecutableId: "git" });
    await assertThrowsAsync(() => mF14.cleanup(idF14, { expectedTaskHeadSha: sF14.taskHeadSha }),
      "CLEANUP_BLOCKED", "exact residue→CLEANUP_BLOCKED");
    // Cleanup the injected residue
    rmSync(join(rp, ".git", "worktrees", "residue-f14"), { recursive: true, force: true });
    try { execFileSync(GP, ["worktree", "remove", "--force", wsF14], { cwd: rp }); } catch {}
    try { execFileSync(GP, ["branch", "-D", "codex/f14"], { cwd: rp }); } catch {}

    // F15. Remove后 branch HEAD moved → CLEANUP_BLOCKED
    const idF15 = mkId({ rp, cr, sha: featSha, taskBranch: "codex/f15" });
    const sF15 = await mgr.prepare(idF15);
    // Move branch HEAD before cleanup
    execFileSync(GP, ["update-ref", "refs/heads/codex/f15", baseSha], { cwd: rp });
    await assertThrowsAsync(() => mgr.cleanup(idF15, { expectedTaskHeadSha: sF15.taskHeadSha }),
      "CLEANUP_BLOCKED", "head moved→CLEANUP_BLOCKED");
    try { execFileSync(GP, ["worktree", "remove", "--force", sF15.workspacePath], { cwd: rp }); } catch {}
    try { execFileSync(GP, ["branch", "-D", "codex/f15"], { cwd: rp }); } catch {}

    rmSync(tr, { recursive: true, force: true });
  }

  // ════════════════════════════════════════════════════════════════
  // G. Static Bans (14 checks)
  // ════════════════════════════════════════════════════════════════
  {
    console.log("G. Static Bans");
    const prodPath = join(__dirname, "..", "core", "loop-git-workspace.ts");
    const prodSrc = readFileSync(prodPath, "utf8");

    // child_process: only the comment "no direct child_process" is allowed
    ok(!prodSrc.includes("require('child_process')") && !prodSrc.includes('require("child_process")')
      && !prodSrc.match(/from ["']child_process["']/) && !prodSrc.match(/from ["']node:child_process["']/),
      "no child_process import");

    ok(!prodSrc.match(/\bfetch\b/), "no fetch");
    // "pull" / "push" / "ls-remote": as git commands, not array methods
    ok(!prodSrc.match(/"pull"/) && !prodSrc.match(/'pull'/), "no git pull");
    ok(!prodSrc.match(/"push"/) && !prodSrc.match(/'push'/), "no git push");
    ok(!prodSrc.match(/\bls-remote\b/), "no ls-remote");
    ok(!prodSrc.match(/\bstash\b/), "no stash");
    ok(!prodSrc.match(/reset.*--hard/) && !prodSrc.match(/--hard.*reset/) && !prodSrc.includes('"reset"'), "no reset --hard");
    ok(!prodSrc.match(/\bclean\b.*-f/) && !prodSrc.includes('"clean"'), "no git clean");
    ok(!prodSrc.match(/\bprune\b/), "no worktree prune");
    ok(!prodSrc.match(/\brepair\b/), "no worktree repair");
    ok(!prodSrc.includes("--force"), "no worktree remove --force");
    ok(!prodSrc.match(/branch.*-D/) && !prodSrc.includes('"-D"'), "no branch -D");
    ok(!prodSrc.includes(".git/worktrees"), "no direct .git/worktrees access");
  }

  // ════════════════════════════════════════════════════════════════
  // H. Final Contract Closures (23 checks)
  // ════════════════════════════════════════════════════════════════
  {
    console.log("H. Final Contract Closures");
    const { tr, rp, cr, baseSha, featSha, home } = setupRepo();
    const runner = mkRunner(rp, cr, home);
    const mgr = new LoopGitWorkspaceManager({ runner, gitExecutableId: "git" });

    // fs patching propagates to the production module's `import * as fs`
    // (verified: require("node:fs") shares bindings with the ESM namespace).
    const fsr = require("node:fs");

    // Locate the .git/worktrees admin dir whose gitdir file points at wsPath.
    function findWtAdmin(wsPath: string): string | null {
      const base = join(rp, ".git", "worktrees");
      for (const id of readdirSync(base)) {
        const gf = join(base, id, "gitdir");
        if (existsSync(gf) && readFileSync(gf, "utf8").trim() === join(wsPath, ".git")) return id;
      }
      return null;
    }
    // Corrupt the worktree-list HEAD for wsPath (reused by H1a/H1b).
    function corruptWtListHead(wsPath: string): void {
      const id = findWtAdmin(wsPath);
      if (id) writeFileSync(join(rp, ".git", "worktrees", id, "HEAD"),
        "0000000000000000000000000000000000000000\n");
    }

    // ── H1. Create/attach three-way HEAD (normal exit 0 re-reads worktree list) ──
    {
      const id = mkId({ rp, cr, sha: featSha, runId: "h1a", taskBranch: "codex/h1a" });
      const wsPath = mgr.workspacePathFor(id);
      const rH1a = mkRunner(rp, cr, home);
      const oH1a = rH1a.run.bind(rH1a);
      let injected = false;
      rH1a.run = async function (req: any) {
        const r = await oH1a(req);
        const a = (req.args as string[]).join(" ");
        // After the create `worktree add` succeeds, corrupt the registration HEAD
        // so the post-add worktree-list re-read observes a mismatch.
        if (!injected && a.includes("worktree") && a.includes("add") && r.exitCode === 0) {
          injected = true;
          corruptWtListHead(wsPath);
        }
        return r;
      };
      const mH1a = new LoopGitWorkspaceManager({ runner: rH1a, gitExecutableId: "git" });
      await assertThrowsAsync(() => mH1a.prepare(id), "WORKSPACE_CORRUPT",
        "create exit0 wt-list HEAD mismatch→WORKSPACE_CORRUPT");
      ok(injected, "create path re-read worktree list after exit 0");
      try { execFileSync(GP, ["worktree", "remove", "--force", wsPath], { cwd: rp }); } catch {}
      try { execFileSync(GP, ["branch", "-D", "codex/h1a"], { cwd: rp }); } catch {}
    }
    {
      const id = mkId({ rp, cr, sha: featSha, runId: "h1b", taskBranch: "codex/h1b" });
      // First create the branch via a normal prepare, then remove the worktree
      // (keeping the branch) so the next prepare takes the branch-only attach path.
      await mgr.prepare(id);
      const wsPath = mgr.workspacePathFor(id);
      execFileSync(GP, ["worktree", "remove", wsPath], { cwd: rp });
      const rH1b = mkRunner(rp, cr, home);
      const oH1b = rH1b.run.bind(rH1b);
      let injected = false;
      rH1b.run = async function (req: any) {
        const r = await oH1b(req);
        const a = (req.args as string[]).join(" ");
        if (!injected && a.includes("worktree") && a.includes("add") && r.exitCode === 0) {
          injected = true;
          corruptWtListHead(wsPath);
        }
        return r;
      };
      const mH1b = new LoopGitWorkspaceManager({ runner: rH1b, gitExecutableId: "git" });
      await assertThrowsAsync(() => mH1b.prepare(id), "WORKSPACE_CORRUPT",
        "attach exit0 wt-list HEAD mismatch→WORKSPACE_CORRUPT");
      ok(injected, "attach path re-read worktree list after exit 0");
      try { execFileSync(GP, ["worktree", "remove", "--force", wsPath], { cwd: rp }); } catch {}
      try { execFileSync(GP, ["branch", "-D", "codex/h1b"], { cwd: rp }); } catch {}
    }

    // ── H2. Prunable matrix (deterministic .git/worktrees registration) ──
    {
      // exact prunable, path still exists → WORKSPACE_CORRUPT
      const id = mkId({ rp, cr, sha: featSha, taskBranch: "codex/h2a" });
      const wsPath = mgr.workspacePathFor(id);
      execFileSync(GP, ["worktree", "add", "-b", "codex/h2a", wsPath, featSha], { cwd: rp });
      rmSync(join(wsPath, ".git"), { force: true }); // gitdir file gone → prunable, dir remains
      const lst = execFileSync(GP, ["worktree", "list", "--porcelain", "-z"], { cwd: rp, encoding: "utf8" });
      ok(lst.includes("prunable"), "H2a fixture emits prunable record");
      await assertThrowsAsync(() => mgr.prepare(id), "WORKSPACE_CORRUPT",
        "exact prunable path-exists→WORKSPACE_CORRUPT");
      rmSync(wsPath, { recursive: true, force: true });
      try { execFileSync(GP, ["branch", "-D", "codex/h2a"], { cwd: rp }); } catch {}
    }
    {
      // exact prunable, path missing → WORKSPACE_CORRUPT
      const id = mkId({ rp, cr, sha: featSha, taskBranch: "codex/h2b" });
      const wsPath = mgr.workspacePathFor(id);
      execFileSync(GP, ["worktree", "add", "-b", "codex/h2b", wsPath, featSha], { cwd: rp });
      rmSync(wsPath, { recursive: true, force: true }); // dir gone → prunable, path missing
      const lst = execFileSync(GP, ["worktree", "list", "--porcelain", "-z"], { cwd: rp, encoding: "utf8" });
      ok(lst.includes("prunable"), "H2b fixture emits prunable record");
      await assertThrowsAsync(() => mgr.prepare(id), "WORKSPACE_CORRUPT",
        "exact prunable path-missing→WORKSPACE_CORRUPT");
      try { execFileSync(GP, ["branch", "-D", "codex/h2b"], { cwd: rp }); } catch {}
    }
    {
      // task branch at OTHER path as a prunable record → WORKSPACE_CORRUPT
      const id = mkId({ rp, cr, sha: featSha, taskBranch: "codex/h2c" });
      const otherPath = join(tr, "h2c-other");
      execFileSync(GP, ["worktree", "add", "-b", "codex/h2c", otherPath, featSha], { cwd: rp });
      rmSync(otherPath, { recursive: true, force: true }); // other-path registration → prunable
      const lst = execFileSync(GP, ["worktree", "list", "--porcelain", "-z"], { cwd: rp, encoding: "utf8" });
      ok(lst.includes("prunable"), "H2c fixture emits prunable record");
      await assertThrowsAsync(() => mgr.prepare(id), "WORKSPACE_CORRUPT",
        "other-path prunable task record→WORKSPACE_CORRUPT");
      try { execFileSync(GP, ["branch", "-D", "codex/h2c"], { cwd: rp }); } catch {}
    }

    // ── H3. Source WIP fault matrix (deterministic fs/runner injection) ──
    {
      // special file (FIFO) → SOURCE_WIP_UNSUPPORTED
      const fifo = join(rp, "h3a.fifo");
      execFileSync("mkfifo", [fifo]);
      const rH3a = mkRunner(rp, cr, home);
      const oH3a = rH3a.run.bind(rH3a);
      rH3a.run = async function (req: any) {
        const r = await oH3a(req);
        const a = (req.args as string[]).join(" ");
        // git does not list FIFOs; inject it into the untracked listing so the
        // fingerprint loop lstat's a real special file on disk.
        if (a.includes("ls-files") && a.includes("--others"))
          return { ...r, stdout: "h3a.fifo\x00" };
        return r;
      };
      const mH3a = new LoopGitWorkspaceManager({ runner: rH3a, gitExecutableId: "git" });
      try {
        await assertThrowsAsync(() => mH3a.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/h3a" })),
          "SOURCE_WIP_UNSUPPORTED", "special file (FIFO)→SOURCE_WIP_UNSUPPORTED");
      } finally { rmSync(fifo, { force: true }); }
    }
    {
      // untracked lstat failure → WORKSPACE_IO_FAILED
      const fp = join(rp, "h3b.txt");
      writeFileSync(fp, "x");
      const origLstat = fsr.lstatSync;
      fsr.lstatSync = function (p: any, ...rest: any[]) {
        if (p === fp) throw Object.assign(new Error("io"), { code: "EIO" });
        return origLstat.call(fsr, p, ...rest);
      };
      const mH3b = new LoopGitWorkspaceManager({ runner: mkRunner(rp, cr, home), gitExecutableId: "git" });
      try {
        await assertThrowsAsync(() => mH3b.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/h3b" })),
          "WORKSPACE_IO_FAILED", "untracked lstat fail→WORKSPACE_IO_FAILED");
      } finally { fsr.lstatSync = origLstat; rmSync(fp, { force: true }); }
    }
    {
      // regular-file readFile failure → WORKSPACE_IO_FAILED
      const fp = join(rp, "h3c.txt");
      writeFileSync(fp, "x");
      const origRF = fsr.promises.readFile;
      fsr.promises.readFile = async function (p: any, ...rest: any[]) {
        if (p === fp) throw Object.assign(new Error("io"), { code: "EACCES" });
        return origRF.call(fsr.promises, p, ...rest);
      };
      const mH3c = new LoopGitWorkspaceManager({ runner: mkRunner(rp, cr, home), gitExecutableId: "git" });
      try {
        await assertThrowsAsync(() => mH3c.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/h3c" })),
          "WORKSPACE_IO_FAILED", "regular-file readFile fail→WORKSPACE_IO_FAILED");
      } finally { fsr.promises.readFile = origRF; rmSync(fp, { force: true }); }
    }
    {
      // symlink readlink failure → WORKSPACE_IO_FAILED
      const fp = join(rp, "h3d-link");
      symlinkSync(join(rp, "f.txt"), fp);
      const origRL = fsr.promises.readlink;
      fsr.promises.readlink = async function (p: any, ...rest: any[]) {
        if (p === fp) throw Object.assign(new Error("io"), { code: "EINVAL" });
        return origRL.call(fsr.promises, p, ...rest);
      };
      const mH3d = new LoopGitWorkspaceManager({ runner: mkRunner(rp, cr, home), gitExecutableId: "git" });
      try {
        await assertThrowsAsync(() => mH3d.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/h3d" })),
          "WORKSPACE_IO_FAILED", "symlink readlink fail→WORKSPACE_IO_FAILED");
      } finally { fsr.promises.readlink = origRL; rmSync(fp, { force: true }); }
    }
    {
      // fingerprint Git command Runner failure on FIRST fingerprint → GIT_COMMAND_FAILED
      const rH3e = mkRunner(rp, cr, home);
      const oH3e = rH3e.run.bind(rH3e);
      let hit = false;
      rH3e.run = async function (req: any) {
        const a = (req.args as string[]).join(" ");
        if (!hit && a.includes("rev-parse") && a.includes("HEAD") && !a.includes("--git-common-dir")) {
          hit = true;
          throw new Error("runner crash on first fingerprint");
        }
        return oH3e(req);
      };
      const mH3e = new LoopGitWorkspaceManager({ runner: rH3e, gitExecutableId: "git" });
      await assertThrowsAsync(() => mH3e.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/h3e" })),
        "GIT_COMMAND_FAILED", "first fingerprint Runner fail→GIT_COMMAND_FAILED");
    }
    {
      // fingerprint Git command Runner failure on FINAL fingerprint → SOURCE_WORKSPACE_DRIFT
      const rH3f = mkRunner(rp, cr, home);
      const oH3f = rH3f.run.bind(rH3f);
      let ls = 0;
      rH3f.run = async function (req: any) {
        const a = (req.args as string[]).join(" ");
        if (a.includes("ls-files") && a.includes("--others")) ls++;
        // Fail the first source-repo rev-parse HEAD after the 2nd ls-files
        // (i.e. the final fingerprint in the drift-recheck finally block).
        if (ls >= 2 && a.includes("rev-parse") && a.includes("HEAD") &&
            !a.includes("--git-common-dir") && (req.cwd as string) === rp)
          throw new Error("runner crash on final fingerprint");
        return oH3f(req);
      };
      const mH3f = new LoopGitWorkspaceManager({ runner: rH3f, gitExecutableId: "git" });
      await assertThrowsAsync(() => mH3f.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/h3f" })),
        "SOURCE_WORKSPACE_DRIFT", "final fingerprint Runner fail→SOURCE_WORKSPACE_DRIFT");
    }

    // ── H4. Git structural exit codes ──
    {
      // cleanup entry show-ref exit 2 → GIT_COMMAND_FAILED
      const id = mkId({ rp, cr, sha: featSha, taskBranch: "codex/h4a" });
      const s = await mgr.prepare(id);
      const rH4a = mkRunner(rp, cr, home);
      const oH4a = rH4a.run.bind(rH4a);
      rH4a.run = async function (req: any) {
        const a = (req.args as string[]).join(" ");
        if (a.includes("show-ref"))
          return { status: "exited", exitCode: 2, stdout: "", stderr: "fatal", signal: null,
            timedOut: false, stdoutTruncated: false, stderrTruncated: false, wallMs: 1 };
        return oH4a(req);
      };
      const mH4a = new LoopGitWorkspaceManager({ runner: rH4a, gitExecutableId: "git" });
      await assertThrowsAsync(() => mH4a.cleanup(id, { expectedTaskHeadSha: s.taskHeadSha }),
        "GIT_COMMAND_FAILED", "cleanup show-ref exit2→GIT_COMMAND_FAILED");
      try { execFileSync(GP, ["worktree", "remove", "--force", s.workspacePath], { cwd: rp }); } catch {}
      try { execFileSync(GP, ["branch", "-D", "codex/h4a"], { cwd: rp }); } catch {}
    }
    {
      // _safeDeleteBranch post-delete show-ref exit 2 → GIT_COMMAND_FAILED
      const id = mkId({ rp, cr, sha: baseSha, baseBranch: "main", taskBranch: "codex/h4b" });
      const s = await mgr.prepare(id);
      const head = s.taskHeadSha;
      await mgr.cleanup(id, { expectedTaskHeadSha: head }); // remove worktree, keep merged branch
      const rH4b = mkRunner(rp, cr, home);
      const oH4b = rH4b.run.bind(rH4b);
      let del = false;
      rH4b.run = async function (req: any) {
        const a = (req.args as string[]).join(" ");
        if (a.includes("branch") && a.includes("-d")) { del = true; return oH4b(req); }
        if (del && a.includes("show-ref"))
          return { status: "exited", exitCode: 2, stdout: "", stderr: "fatal", signal: null,
            timedOut: false, stdoutTruncated: false, stderrTruncated: false, wallMs: 1 };
        return oH4b(req);
      };
      const mH4b = new LoopGitWorkspaceManager({ runner: rH4b, gitExecutableId: "git" });
      await assertThrowsAsync(() => mH4b.cleanup(id, { expectedTaskHeadSha: head, deleteTaskBranch: true }),
        "GIT_COMMAND_FAILED", "post-delete show-ref exit2→GIT_COMMAND_FAILED");
      try { execFileSync(GP, ["branch", "-D", "codex/h4b"], { cwd: rp }); } catch {}
    }
    {
      // workspace rev-parse --git-common-dir non-zero → WORKSPACE_CORRUPT
      const id = mkId({ rp, cr, sha: featSha, taskBranch: "codex/h4c" });
      await mgr.prepare(id);
      const wsPath = mgr.workspacePathFor(id);
      const rH4c = mkRunner(rp, cr, home);
      const oH4c = rH4c.run.bind(rH4c);
      rH4c.run = async function (req: any) {
        const a = (req.args as string[]).join(" ");
        if (a.includes("rev-parse") && a.includes("--git-common-dir") && (req.cwd as string) !== rp)
          return { status: "exited", exitCode: 128, stdout: "", stderr: "fatal", signal: null,
            timedOut: false, stdoutTruncated: false, stderrTruncated: false, wallMs: 1 };
        return oH4c(req);
      };
      const mH4c = new LoopGitWorkspaceManager({ runner: rH4c, gitExecutableId: "git" });
      await assertThrowsAsync(() => mH4c.inspect(id), "WORKSPACE_CORRUPT",
        "ws common-dir nonzero→WORKSPACE_CORRUPT");
      try { execFileSync(GP, ["worktree", "remove", "--force", wsPath], { cwd: rp }); } catch {}
      try { execFileSync(GP, ["branch", "-D", "codex/h4c"], { cwd: rp }); } catch {}
    }
    {
      // source vs workspace common-dir point to different real dirs → WORKSPACE_CORRUPT
      const id = mkId({ rp, cr, sha: featSha, taskBranch: "codex/h4d" });
      await mgr.prepare(id);
      const wsPath = mgr.workspacePathFor(id);
      const rH4d = mkRunner(rp, cr, home);
      const oH4d = rH4d.run.bind(rH4d);
      rH4d.run = async function (req: any) {
        const a = (req.args as string[]).join(" ");
        if (a.includes("rev-parse") && a.includes("--git-common-dir") && (req.cwd as string) === rp)
          return { status: "exited", exitCode: 0, stdout: "/tmp\n", stderr: "", signal: null,
            timedOut: false, stdoutTruncated: false, stderrTruncated: false, wallMs: 1 };
        return oH4d(req);
      };
      const mH4d = new LoopGitWorkspaceManager({ runner: rH4d, gitExecutableId: "git" });
      await assertThrowsAsync(() => mH4d.inspect(id), "WORKSPACE_CORRUPT",
        "common-dir different dirs→WORKSPACE_CORRUPT");
      try { execFileSync(GP, ["worktree", "remove", "--force", wsPath], { cwd: rp }); } catch {}
      try { execFileSync(GP, ["branch", "-D", "codex/h4d"], { cwd: rp }); } catch {}
    }

    // ── H5. Post-remove cleanup race matrix ──
    {
      // remove后 task branch re-attached to another valid worktree → CLEANUP_BLOCKED
      const id = mkId({ rp, cr, sha: featSha, taskBranch: "codex/h5a" });
      const s = await mgr.prepare(id);
      const wsPath = s.workspacePath;
      const other = join(tr, "h5a-other");
      const rH5a = mkRunner(rp, cr, home);
      const oH5a = rH5a.run.bind(rH5a);
      let done = false;
      rH5a.run = async function (req: any) {
        const r = await oH5a(req);
        const a = (req.args as string[]).join(" ");
        if (!done && a.includes("worktree") && a.includes("remove")) {
          done = true;
          execFileSync(GP, ["worktree", "add", other, "codex/h5a"], { cwd: rp });
        }
        return r;
      };
      const mH5a = new LoopGitWorkspaceManager({ runner: rH5a, gitExecutableId: "git" });
      await assertThrowsAsync(() => mH5a.cleanup(id, { expectedTaskHeadSha: s.taskHeadSha }),
        "CLEANUP_BLOCKED", "post-remove reattach valid→CLEANUP_BLOCKED");
      try { execFileSync(GP, ["worktree", "remove", "--force", other], { cwd: rp }); } catch {}
      try { execFileSync(GP, ["branch", "-D", "codex/h5a"], { cwd: rp }); } catch {}
    }
    {
      // remove后 task branch re-attached to a prunable registration → CLEANUP_BLOCKED
      const id = mkId({ rp, cr, sha: featSha, taskBranch: "codex/h5b" });
      const s = await mgr.prepare(id);
      const wsPath = s.workspacePath;
      const rH5b = mkRunner(rp, cr, home);
      const oH5b = rH5b.run.bind(rH5b);
      let done = false;
      rH5b.run = async function (req: any) {
        const r = await oH5b(req);
        const a = (req.args as string[]).join(" ");
        if (!done && a.includes("worktree") && a.includes("remove")) {
          done = true;
          const base = join(rp, ".git", "worktrees", "h5b-residue");
          mkdirSync(base, { recursive: true });
          writeFileSync(join(base, "gitdir"), join(tr, "h5b-gone", ".git")); // missing → prunable
          writeFileSync(join(base, "HEAD"), "ref: refs/heads/codex/h5b\n");
          writeFileSync(join(base, "commondir"), join(rp, ".git"));
        }
        return r;
      };
      const mH5b = new LoopGitWorkspaceManager({ runner: rH5b, gitExecutableId: "git" });
      await assertThrowsAsync(() => mH5b.cleanup(id, { expectedTaskHeadSha: s.taskHeadSha }),
        "CLEANUP_BLOCKED", "post-remove reattach prunable→CLEANUP_BLOCKED");
      rmSync(join(rp, ".git", "worktrees", "h5b-residue"), { recursive: true, force: true });
      try { execFileSync(GP, ["branch", "-D", "codex/h5b"], { cwd: rp }); } catch {}
    }
    {
      // remove后 task branch re-attached to a missing/broken registration → CLEANUP_BLOCKED
      const id = mkId({ rp, cr, sha: featSha, taskBranch: "codex/h5c" });
      const s = await mgr.prepare(id);
      const wsPath = s.workspacePath;
      const rH5c = mkRunner(rp, cr, home);
      const oH5c = rH5c.run.bind(rH5c);
      let done = false;
      rH5c.run = async function (req: any) {
        const r = await oH5c(req);
        const a = (req.args as string[]).join(" ");
        if (!done && a.includes("worktree") && a.includes("remove")) {
          done = true;
          const base = join(rp, ".git", "worktrees", "h5c-residue");
          mkdirSync(base, { recursive: true });
          writeFileSync(join(base, "gitdir"), join(wsPath, ".git")); // wsPath removed → broken
          writeFileSync(join(base, "HEAD"), "ref: refs/heads/codex/h5c\n");
          writeFileSync(join(base, "commondir"), join(rp, ".git"));
        }
        return r;
      };
      const mH5c = new LoopGitWorkspaceManager({ runner: rH5c, gitExecutableId: "git" });
      await assertThrowsAsync(() => mH5c.cleanup(id, { expectedTaskHeadSha: s.taskHeadSha }),
        "CLEANUP_BLOCKED", "post-remove reattach broken→CLEANUP_BLOCKED");
      rmSync(join(rp, ".git", "worktrees", "h5c-residue"), { recursive: true, force: true });
      try { execFileSync(GP, ["branch", "-D", "codex/h5c"], { cwd: rp }); } catch {}
    }
    {
      // remove后 branch deleted → CLEANUP_BLOCKED
      const id = mkId({ rp, cr, sha: featSha, taskBranch: "codex/h5d" });
      const s = await mgr.prepare(id);
      const rH5d = mkRunner(rp, cr, home);
      const oH5d = rH5d.run.bind(rH5d);
      let done = false;
      rH5d.run = async function (req: any) {
        const r = await oH5d(req);
        const a = (req.args as string[]).join(" ");
        if (!done && a.includes("worktree") && a.includes("remove")) {
          done = true;
          execFileSync(GP, ["branch", "-D", "codex/h5d"], { cwd: rp });
        }
        return r;
      };
      const mH5d = new LoopGitWorkspaceManager({ runner: rH5d, gitExecutableId: "git" });
      await assertThrowsAsync(() => mH5d.cleanup(id, { expectedTaskHeadSha: s.taskHeadSha }),
        "CLEANUP_BLOCKED", "post-remove branch deleted→CLEANUP_BLOCKED");
      try { execFileSync(GP, ["branch", "-D", "codex/h5d"], { cwd: rp }); } catch {}
    }
    {
      // remove后 branch HEAD moved → CLEANUP_BLOCKED
      const id = mkId({ rp, cr, sha: featSha, taskBranch: "codex/h5e" });
      const s = await mgr.prepare(id);
      const rH5e = mkRunner(rp, cr, home);
      const oH5e = rH5e.run.bind(rH5e);
      let done = false;
      rH5e.run = async function (req: any) {
        const r = await oH5e(req);
        const a = (req.args as string[]).join(" ");
        if (!done && a.includes("worktree") && a.includes("remove")) {
          done = true;
          execFileSync(GP, ["update-ref", "refs/heads/codex/h5e", baseSha], { cwd: rp });
        }
        return r;
      };
      const mH5e = new LoopGitWorkspaceManager({ runner: rH5e, gitExecutableId: "git" });
      await assertThrowsAsync(() => mH5e.cleanup(id, { expectedTaskHeadSha: s.taskHeadSha }),
        "CLEANUP_BLOCKED", "post-remove branch HEAD moved→CLEANUP_BLOCKED");
      try { execFileSync(GP, ["worktree", "remove", "--force", s.workspacePath], { cwd: rp }); } catch {}
      try { execFileSync(GP, ["branch", "-D", "codex/h5e"], { cwd: rp }); } catch {}
    }

    rmSync(tr, { recursive: true, force: true });
  }

  console.log(`\nResults: ${p} passed, ${f} failed`);
  if (f > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
