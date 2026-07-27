// LOOP Git Workspace Lifecycle — Comprehensive Tests
// ====================================================
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import {
  LoopGitWorkspaceManager, LoopGitWorkspaceError,
  type LoopGitWorkspaceManagerOptions, type LoopGitWorkspaceSnapshot, type LoopGitWorkspaceCleanupResult,
} from "../core/loop-git-workspace";
import type { LoopRunIdentity } from "../core/loop-executor-types";
import type { LoopPosixProcessRunner, LoopPosixProcessRequest, LoopPosixProcessResult } from "../core/loop-posix-process-runner";

let p = 0, f = 0;
function ok(c: boolean, m: string) { if (c) { p++; console.log(`  ✓ ${m}`); } else { f++; console.error(`  ✗ ${m}`); } }
async function errEq(code: string, fn: () => unknown, m: string) {
  try { await fn(); ok(false, `${m} (no err)`); } catch (e) {
    if (e instanceof LoopGitWorkspaceError) {
      ok(e.code === code, `${m} code=${e.code} (expected ${code})`);
      ok(e.message.length <= 256, `${m} bounded msg`);
      ok(!/[\x00-\x1f\x7f]/.test(e.message), `${m} no control chars`);
    } else {
      ok(false, `${m} not LoopGitWorkspaceError: ${(e as any)?.code || (e as any)?.message || String(e)}`);
    }
  }
}

const gitPath = realpathSync(execSync("which git 2>/dev/null || echo /usr/bin/git", { encoding: "utf8" }).trim());

function setupRepo() {
  const tr = realpathSync(mkdtempSync(join(tmpdir(), "l03-")));
  const rp = join(tr, "repo"); const cr = join(tr, "control");
  mkdirSync(rp, { recursive: true }); mkdirSync(cr, { recursive: true });
  execSync("git init -b main", { cwd: rp });
  execSync("git config user.name test", { cwd: rp });
  execSync("git config user.email test@test", { cwd: rp });
  writeFileSync(join(rp, "README.md"), "# Test\n");
  execSync("git add README.md && git commit -m init", { cwd: rp });
  const baseSha = execSync("git rev-parse HEAD", { cwd: rp, encoding: "utf8" }).trim();
  execSync("git checkout -b feature/loop-runtime-v1", { cwd: rp });
  writeFileSync(join(rp, "src.ts"), "//\n");
  execSync("git add src.ts && git commit -m feature", { cwd: rp });
  const featureSha = execSync("git rev-parse HEAD", { cwd: rp, encoding: "utf8" }).trim();
  execSync(`git update-ref refs/remotes/origin/feature/loop-runtime-v1 ${featureSha}`, { cwd: rp });
  execSync(`git update-ref refs/remotes/origin/main ${baseSha}`, { cwd: rp });
  execSync("git remote add origin https://github.com/example/fixture-repo.git", { cwd: rp });
  execSync("git checkout main", { cwd: rp });
  return { tr, rp, cr, baseSha, featureSha };
}

function mkId(o: { rp: string; cr: string; baseSha: string; runId?: string; taskBranch?: string; reqId?: string; repo?: string; baseBranch?: string; sha?: string; }): LoopRunIdentity {
  return Object.freeze({
    runId: o.runId ?? "test-run-1", requirementId: o.reqId ?? "req-1",
    repository: o.repo ?? "example/fixture-repo", repositoryPath: o.rp,
    baseBranch: o.baseBranch ?? "feature/loop-runtime-v1", expectedBaseSha: o.sha ?? o.baseSha,
    taskBranch: o.taskBranch ?? "codex/task-test-1", controlRoot: o.cr,
    createdAt: new Date().toISOString(),
  });
}

function makeRunner(git: string): Pick<LoopPosixProcessRunner, "run"> {
  return {
    run: async (req: LoopPosixProcessRequest): Promise<LoopPosixProcessResult> => {
      const st = Date.now();
      return new Promise((resolve, reject) => {
        try {
          const cp = require("node:child_process") as typeof import("node:child_process");
          const child = cp.spawn(git, (req.args ?? []) as string[], {
            cwd: req.cwd, shell: false,
            env: { ...process.env, GIT_TERMINAL_PROMPT: "0", HOME: process.env.HOME || "/tmp", PATH: process.env.PATH || "/usr/bin:/bin" },
            stdio: ["pipe", "pipe", "pipe"],
          });
          let so = "", se = ""; let sl = 0, el = 0; const mx = req.maxStdoutBytes ?? 1048576;
          child.stdout.on("data", (c: Buffer) => { sl += c.length; if (sl <= mx) so += c.toString("utf8"); });
          child.stderr.on("data", (c: Buffer) => { el += c.length; if (el <= mx) se += c.toString("utf8"); });
          child.on("close", (code, sig) => {
            resolve(Object.freeze({ status: "exited" as const, exitCode: code, signal: sig as NodeJS.Signals | null, durationMs: Date.now() - st, stdout: so, stderr: se, stdoutBytesReceived: sl, stderrBytesReceived: el, stdoutTruncated: sl > mx, stderrTruncated: el > mx, termSignalSent: false, killSignalSent: false }));
          });
          child.on("error", (e) => reject(e));
        } catch (e) { reject(e); }
      });
    },
  };
}

async function main() {
  console.log("LOOP Git Workspace — Tests\n");
  const { tr, rp, cr, baseSha, featureSha } = setupRepo();
  const runner = makeRunner(gitPath);
  const o: LoopGitWorkspaceManagerOptions = { runner, gitExecutableId: "git", gitTimeoutMs: 15000 };
  const mgr = new LoopGitWorkspaceManager(o);
  const id = mkId({ rp, cr, baseSha: featureSha });

  try {
    // ═══ A. Options validation
    console.log("A. Options validation");
    errEq("INVALID_INPUT", () => { new LoopGitWorkspaceManager({} as any); }, "empty opts");
    errEq("INVALID_INPUT", () => { new LoopGitWorkspaceManager({ runner: null, gitExecutableId: "g" } as any); }, "null runner");
    errEq("INVALID_INPUT", () => { new LoopGitWorkspaceManager({ runner, gitExecutableId: "" } as any); }, "empty git id");
    errEq("INVALID_INPUT", () => { new LoopGitWorkspaceManager({ runner, gitExecutableId: "g", gitTimeoutMs: 0 }); }, "zero timeout");
    errEq("INVALID_INPUT", () => { new LoopGitWorkspaceManager({ runner, gitExecutableId: "g", maxGitOutputBytes: 99999999 }); }, "too large output");

    // ═══ B. Invalid identity inputs
    console.log("B. Invalid identity inputs");
    try { mgr.workspacePathFor({ ...id, runId: "" } as any); ok(false, "empty runId"); } catch (e) { ok(true, "empty runId throws"); }
    await errEq("REPOSITORY_INVALID", () => mgr.prepare({ ...id, repository: "bad", taskBranch: "codex/b-1" } as any), "bad repo slug");
    // same baseBranch and taskBranch
    await errEq("INVALID_INPUT", () => mgr.prepare({ ...id, baseBranch: "codex/b-same", taskBranch: "codex/b-same" } as any), "same branch");
    // bad sha format (caught by validateLoopRunIdentity before our code, so not LoopGitWorkspaceError)
    try { await mgr.prepare({ ...id, expectedBaseSha: "xyz", taskBranch: "codex/b-3" } as any); ok(false, "bad sha should throw"); } catch (e) { ok(e instanceof Error, "bad sha throws"); }

    // ═══ C. Path validation
    console.log("C. Path validation");
    errEq("INVALID_INPUT", () => { mgr.workspacePathFor({ ...id, controlRoot: join(tr, "nope") } as any); }, "missing controlRoot");
    const sl = join(tr, "sl"); symlinkSync(cr, sl);
    errEq("INVALID_INPUT", () => { mgr.workspacePathFor({ ...id, controlRoot: sl } as any); }, "symlink controlRoot");
    rmSync(sl);

    // ═══ D. Origin mismatch
    console.log("D. Origin mismatch");
    await errEq("REPOSITORY_MISMATCH", () => mgr.prepare({ ...id, repository: "other/bad-repo", taskBranch: "codex/d-1" }), "origin mismatch");

    // ═══ E. Initial prepare
    console.log("E. Initial prepare");
    let wsPath = mgr.workspacePathFor(id);
    ok(wsPath.startsWith(cr), "wsPath in controlRoot");
    ok(wsPath.includes("/workspaces/v1/"), "hashed path");
    ok(wsPath.length > cr.length + 30, "long path");

    const snap1 = await mgr.prepare(id);
    ok(snap1.state === "created", snap1.state);
    ok(snap1.taskBranch === id.taskBranch, "branch set");
    ok(snap1.taskHeadSha === featureSha, "head at base");
    ok(snap1.expectedBaseSha === featureSha, "expected preserved");
    ok(snap1.baseDrifted === false, "not drifted");
    ok(snap1.taskHasChanges === false, "clean");
    ok(Object.isFrozen(snap1), "frozen");

    // ═══ F. Deterministic path
    console.log("F. Deterministic path");
    ok(mgr.workspacePathFor(id) === wsPath, "same identity→same path");
    const id2 = mkId({ rp, cr, baseSha: featureSha, runId: "run-2", taskBranch: "codex/task-2" });
    ok(mgr.workspacePathFor(id2) !== wsPath, "different identity→different path");

    // ═══ G. Source WIP staged
    console.log("G. Source WIP staged");
    writeFileSync(join(rp, "wip.txt"), "staged");
    execSync("git add wip.txt", { cwd: rp });
    const snapG = await mgr.prepare({ ...id, taskBranch: "codex/g-1" });
    ok(snapG.state === "created", "prepare with staged WIP");
    ok(existsSync(join(rp, "wip.txt")), "staged file intact");
    execSync("git reset HEAD wip.txt", { cwd: rp });
    rmSync(join(rp, "wip.txt"));

    // ═══ H. Source WIP untracked
    console.log("H. Source WIP untracked");
    writeFileSync(join(rp, "u.txt"), "hello");
    const snapH = await mgr.prepare({ ...id, taskBranch: "codex/h-1" });
    ok(snapH.state === "created", "prepare with untracked WIP");
    rmSync(join(rp, "u.txt"));

    // ═══ I. Idempotent prepare
    console.log("I. Idempotent prepare");
    const snapI = await mgr.prepare(id);
    ok(snapI.state === "recovered", "recovered");
    ok(snapI.workspacePath === wsPath, "same path");

    // ═══ J. Dirty task workspace recovery
    console.log("J. Dirty task workspace recovery");
    writeFileSync(join(wsPath, "dirty.txt"), "task change");
    const snapJ = await mgr.prepare(id);
    ok(snapJ.state === "recovered", "recovered dirty");
    ok(snapJ.taskHasChanges === true, "has changes");
    rmSync(join(wsPath, "dirty.txt"));
    execSync("git checkout -- .", { cwd: wsPath });

    // ═══ K. Base mismatch before create
    console.log("K. Base mismatch");
    const badSha = "0000000000000000000000000000000000000000";
    await errEq("BASE_SHA_MISMATCH", () => mgr.prepare({ ...id, taskBranch: "codex/k-1", expectedBaseSha: badSha }), "wrong base");

    // ═══ L. Base drift inspect
    console.log("L. Base drift inspect");
    execSync(`git update-ref refs/remotes/origin/feature/loop-runtime-v1 ${baseSha}`, { cwd: rp });
    const snapL = await mgr.inspect(id);
    ok(snapL.baseDrifted === true, "drift detected");
    ok(snapL.state === "inspected", "inspected");
    execSync(`git update-ref refs/remotes/origin/feature/loop-runtime-v1 ${featureSha}`, { cwd: rp });

    // ═══ M. Task divergence
    console.log("M. Task divergence");
    writeFileSync(join(wsPath, "commit.txt"), "c");
    execSync("git add commit.txt && git commit -m tc", { cwd: wsPath });
    const tHead = execSync("git rev-parse HEAD", { cwd: wsPath, encoding: "utf8" }).trim();
    ok(tHead !== featureSha, "diverged");
    const snapM = await mgr.prepare(id);
    ok(snapM.taskHeadSha === tHead, "commits preserved");

    // ═══ N. Inspect snapshot
    console.log("N. Inspect");
    const snapN = await mgr.inspect(id);
    ok(snapN.state === "inspected", "inspected");
    ok(snapN.taskHeadSha === tHead, "head correct");
    ok(typeof snapN.sourceWipDigestSha256 === "string", "wip digest present");

    // ═══ O. Missing workspace
    console.log("O. Missing workspace");
    await errEq("WORKSPACE_NOT_FOUND", () => mgr.inspect({ ...id, taskBranch: "codex/o-nonexist" }), "inspect missing");

    // ═══ P. Cleanup retain branch
    console.log("P. Cleanup retain branch");
    // Reset to clean state
    execSync("git reset --hard HEAD~1", { cwd: wsPath });
    const cleanHead = execSync("git rev-parse HEAD", { cwd: wsPath, encoding: "utf8" }).trim();
    ok(cleanHead === featureSha, "reset to base");
    const clP = await mgr.cleanup(id, { expectedTaskHeadSha: cleanHead });
    ok(clP.worktreeRemoved === true, "worktree removed");
    ok(clP.taskBranchRetained === true, "branch retained");
    ok(clP.taskBranchDeleted === false, "not deleted");
    ok(Object.isFrozen(clP), "frozen");

    // ═══ Q. Cleanup idempotent
    console.log("Q. Cleanup idempotent");
    const clQ = await mgr.cleanup(id, { expectedTaskHeadSha: cleanHead });
    ok(clQ.taskBranchRetained === true, "branch still retained (idempotent)");
    ok(clQ.alreadyAbsent === false, "not absent — branch exists");

    // ═══ R. Dirty cleanup blocked
    console.log("R. Dirty cleanup blocked");
    const idR = mkId({ rp, cr, baseSha: featureSha, taskBranch: "codex/r-dirty" });
    await mgr.prepare(idR);
    const rPath = mgr.workspacePathFor(idR);
    writeFileSync(join(rPath, "d.txt"), "mess");
    const rHead = execSync("git rev-parse HEAD", { cwd: rPath, encoding: "utf8" }).trim();
    await errEq("WORKSPACE_DIRTY", () => mgr.cleanup(idR, { expectedTaskHeadSha: rHead }), "dirty cleanup");
    rmSync(join(rPath, "d.txt"));
    execSync("git checkout -- .", { cwd: rPath });

    // ═══ S. Head mismatch cleanup
    console.log("S. Head mismatch cleanup");
    await errEq("CLEANUP_BLOCKED", () => mgr.cleanup(idR, { expectedTaskHeadSha: "0000000000000000000000000000000000000000" }), "wrong head");

    // ═══ T. Safe branch deletion (from merged base)
    console.log("T. Safe branch deletion");
    // Clean up idR worktree first (retain branch)
    await mgr.cleanup(idR, { expectedTaskHeadSha: rHead });
    // Branch exists but is unmerged → safe delete should fail
    await errEq("CLEANUP_BLOCKED", () => mgr.cleanup(idR, { expectedTaskHeadSha: rHead, deleteTaskBranch: true }), "unmerged delete blocked");
    // Force delete is not allowed; branch remains
    
    // Now test safe deletion with a merged branch (from main)
    const idMerged = mkId({ rp, cr, baseSha, sha: baseSha, baseBranch: "main", taskBranch: "codex/t-merged" });
    await mgr.prepare(idMerged);
    const mPath = mgr.workspacePathFor(idMerged);
    const mHead = execSync("git rev-parse HEAD", { cwd: mPath, encoding: "utf8" }).trim();
    const clT = await mgr.cleanup(idMerged, { expectedTaskHeadSha: mHead, deleteTaskBranch: true });
    ok(clT.taskBranchDeleted === true, "merged branch deleted");

    // ═══ U. Recovery: re-attach
    console.log("U. Recovery re-attach");
    const idU = mkId({ rp, cr, baseSha: featureSha, taskBranch: "codex/u-recov" });
    const snapU1 = await mgr.prepare(idU);
    ok(snapU1.state === "created", "first create");
    const uHead = execSync("git rev-parse HEAD", { cwd: mgr.workspacePathFor(idU), encoding: "utf8" }).trim();
    await mgr.cleanup(idU, { expectedTaskHeadSha: uHead });
    const snapU2 = await mgr.prepare(idU);
    ok(snapU2.state === "recovered", "reattached");

    // ═══ V. Concurrency isolation
    console.log("V. Concurrency isolation");
    const idA = mkId({ rp, cr, baseSha: featureSha, runId: "run-A", taskBranch: "codex/v-a" });
    const idB = mkId({ rp, cr, baseSha: featureSha, runId: "run-B", taskBranch: "codex/v-b" });
    const [snA, snB] = await Promise.all([mgr.prepare(idA), mgr.prepare(idB)]);
    ok(snA.state === "created" && snB.state === "created", "both created");
    ok(snA.workspacePath !== snB.workspacePath, "different paths");
    writeFileSync(join(mgr.workspacePathFor(idA), "a.txt"), "A");
    execSync("git add a.txt && git commit -m a", { cwd: mgr.workspacePathFor(idA) });
    ok(!existsSync(join(mgr.workspacePathFor(idB), "a.txt")), "B isolated");

    // V2: Task branch conflict — try to prepare with same taskBranch as active
    // This should fail with TASK_BRANCH_CONFLICT
    const idV2 = mkId({ rp, cr, baseSha: featureSha, runId: "run-V2", taskBranch: "codex/v-a" });
    await errEq("TASK_BRANCH_CONFLICT", () => mgr.prepare(idV2), "branch conflict with active");

    // ═══ W. Same identity concurrent
    console.log("W. Same identity concurrent");
    const [w1, w2] = await Promise.all([mgr.prepare(idA), mgr.prepare(idA)]);
    ok(w1.workspacePath === w2.workspacePath, "same path");
    ok(w1.taskHeadSha === w2.taskHeadSha, "same head");

    // ═══ X. Error sanitation
    console.log("X. Error sanitation");
    const e = new LoopGitWorkspaceError("GIT_COMMAND_FAILED", "raw\nerror\x00text\nwith\nnewlines");
    ok(e.message.length <= 256, "bounded");
    ok(!/[\x00-\x1f\x7f]/.test(e.message), "no control chars");

    // ═══ Y. Frozen results
    console.log("Y. Frozen");
    ok(Object.isFrozen(snap1), "snap frozen");
    ok(Object.isFrozen(clP), "cleanup frozen");

    // ═══ Z. Final cleanup
    console.log("Z. Final cleanup");
    for (const ix of [idA, idB, idU]) {
      try {
        const pth = mgr.workspacePathFor(ix);
        const hd = execSync("git rev-parse HEAD", { cwd: pth, encoding: "utf8" }).trim();
        await mgr.cleanup(ix, { expectedTaskHeadSha: hd, deleteTaskBranch: true });
      } catch { /* best effort */ }
    }

  } finally {
    rmSync(tr, { recursive: true, force: true });
  }
  console.log(`\nResults: ${p} passed, ${f} failed`);
  if (f > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
