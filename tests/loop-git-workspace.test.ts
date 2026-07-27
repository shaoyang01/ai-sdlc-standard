// LOOP Git Workspace Lifecycle — Hardened Tests (R1)
// ====================================================
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { execFileSync } from "node:child_process";
import {
  LoopGitWorkspaceManager, LoopGitWorkspaceError,
} from "../core/loop-git-workspace";
import { LoopPosixProcessRunner } from "../core/loop-posix-process-runner";
import type { LoopRunIdentity } from "../core/loop-executor-types";

let p = 0, f = 0;
function ok(c: boolean, m: string) { if (c) { p++; console.log(`  ✓ ${m}`); } else { f++; console.error(`  ✗ ${m}`); } }

function findGit(): string {
  const dirs = (process.env.PATH || "/usr/bin:/bin").split(delimiter);
  for (const d of dirs) {
    const fp = join(d, "git");
    try {
      const st = require("fs").lstatSync(fp);
      if (st.isFile() && (st.mode & 0o111)) return realpathSync(fp);
    } catch {}
  }
  throw new Error("git not found");
}
const GIT_PATH = findGit();

function setupRepo() {
  const tr = realpathSync(mkdtempSync(join(tmpdir(), "l03r1-")));
  const rp = join(tr, "repo"); const cr = join(tr, "control");
  mkdirSync(rp, { recursive: true }); mkdirSync(cr, { recursive: true });
  execFileSync(GIT_PATH, ["init","-b","main"], { cwd: rp });
  execFileSync(GIT_PATH, ["config","user.name","test"], { cwd: rp });
  execFileSync(GIT_PATH, ["config","user.email","test@test"], { cwd: rp });
  writeFileSync(join(rp, "README.md"), "# Test\n");
  execFileSync(GIT_PATH, ["add","README.md"], { cwd: rp });
  execFileSync(GIT_PATH, ["commit","-m","init"], { cwd: rp });
  const baseSha = execFileSync(GIT_PATH, ["rev-parse","HEAD"], { cwd: rp, encoding: "utf8" }).trim();
  execFileSync(GIT_PATH, ["checkout","-b","feature/loop-runtime-v1"], { cwd: rp });
  writeFileSync(join(rp, "src.ts"), "// source\n");
  execFileSync(GIT_PATH, ["add","src.ts"], { cwd: rp });
  execFileSync(GIT_PATH, ["commit","-m","feature"], { cwd: rp });
  const featureSha = execFileSync(GIT_PATH, ["rev-parse","HEAD"], { cwd: rp, encoding: "utf8" }).trim();
  execFileSync(GIT_PATH, ["update-ref","refs/remotes/origin/feature/loop-runtime-v1",featureSha], { cwd: rp });
  execFileSync(GIT_PATH, ["remote","add","origin","https://github.com/example/fixture-repo.git"], { cwd: rp });
  execFileSync(GIT_PATH, ["checkout","main"], { cwd: rp });
  return { tr, rp, cr, baseSha, featureSha };
}

function mkId(o: { rp: string; cr: string; sha: string; runId?: string; taskBranch?: string; reqId?: string; repo?: string; baseBranch?: string; }): LoopRunIdentity {
  return Object.freeze({
    runId: o.runId ?? "test-run", requirementId: o.reqId ?? "req",
    repository: o.repo ?? "example/fixture-repo", repositoryPath: o.rp,
    baseBranch: o.baseBranch ?? "feature/loop-runtime-v1", expectedBaseSha: o.sha,
    taskBranch: o.taskBranch ?? "codex/test", controlRoot: o.cr,
    createdAt: new Date().toISOString(),
  });
}

function makeRunner(rp: string, cr: string) {
  return new LoopPosixProcessRunner({
    executables: [{ id: "git", executablePath: GIT_PATH, allowDynamicArgs: true, stdinMode: "forbidden" }],
    allowedCwdRoots: [rp, cr],
    fixedEnv: { GIT_TERMINAL_PROMPT: "0", HOME: process.env.HOME || "/tmp", PATH: process.env.PATH || "/usr/bin:/bin", LC_ALL: "C", LANG: "C" },
    allowedRequestEnvKeys: [],
    defaultTimeoutMs: 15000,
  });
}

async function main() {
  console.log("LOOP Git Workspace R1 — Hardened Tests\n");
  const { tr, rp, cr, baseSha, featureSha } = setupRepo();
  const runner = makeRunner(rp, cr);
  const mgr = new LoopGitWorkspaceManager({ runner, gitExecutableId: "git", gitTimeoutMs: 15000 });
  const id = mkId({ rp, cr, sha: featureSha });

  try {
    // ═══ A. Descriptor scanner fail-closed
    console.log("A. Descriptor scanner");
    // Unknown field
    try { new LoopGitWorkspaceManager({ runner, gitExecutableId: "g", unknownField: 1 } as any); ok(false, "unknown field"); } catch (e) { ok(e instanceof LoopGitWorkspaceError && (e as any).code === "INVALID_INPUT", "unknown field rejected"); }
    // Getter
    const getterObj = { get runner() { return runner; }, gitExecutableId: "g" };
    try { new LoopGitWorkspaceManager(getterObj as any); ok(false, "getter"); } catch (e) { ok(e instanceof LoopGitWorkspaceError && (e as any).code === "INVALID_INPUT", "getter rejected"); }
    // Array
    try { new LoopGitWorkspaceManager([] as any); ok(false, "array"); } catch (e) { ok(e instanceof LoopGitWorkspaceError, "array rejected"); }
    // Symbol key
    try { new LoopGitWorkspaceManager({ runner, gitExecutableId: "g", [Symbol("x")]: 1 } as any); ok(false, "symbol"); } catch (e) { ok(e instanceof LoopGitWorkspaceError, "symbol rejected"); }
    // __proto__ key
    try { new LoopGitWorkspaceManager({ runner, gitExecutableId: "g", __proto__: { runner: null } } as any); ok(false, "__proto__"); } catch (e) { ok(e instanceof LoopGitWorkspaceError, "__proto__ rejected"); }

    // ═══ B. Cleanup options scanner
    console.log("B. Cleanup options scanner");
    try { await mgr.cleanup(id, { expectedTaskHeadSha: featureSha, unknownField: 1 } as any); ok(false, "cu unknown"); } catch (e) { ok(e instanceof LoopGitWorkspaceError && (e as any).code === "INVALID_INPUT", "cu unknown rejected"); }

    // ═══ C. Identity error conversion
    console.log("C. Identity error conversion");
    try { mgr.workspacePathFor({ ...id, runId: "" } as any); ok(false, "bad id"); } catch (e) { ok(e instanceof LoopGitWorkspaceError && (e as any).code === "INVALID_INPUT", "id error converted"); }

    // ═══ D. Branch check-ref-format
    console.log("D. check-ref-format");
    try { await mgr.prepare({ ...id, taskBranch: "bad..branch" }); ok(false, "bad branch"); } catch (e) { ok(e instanceof LoopGitWorkspaceError, "bad branch rejected"); }

    // ═══ E. Repository/controlRoot containment
    console.log("E. Containment");
    try { mgr.workspacePathFor({ ...id, controlRoot: id.repositoryPath } as any); ok(false, "same paths"); } catch (e) { ok(e instanceof LoopGitWorkspaceError, "same paths rejected"); }

    // ═══ F. Source WIP staged
    console.log("F. Source WIP staged");
    writeFileSync(join(rp, "wip.txt"), "staged");
    execFileSync(GIT_PATH, ["add","wip.txt"], { cwd: rp });
    const snapF = await mgr.prepare(mkId({ rp, cr, sha: featureSha, taskBranch: "codex/f-staged" }));
    ok(snapF.state === "created", "prep with staged WIP");
    execFileSync(GIT_PATH, ["reset","HEAD","wip.txt"], { cwd: rp }); rmSync(join(rp, "wip.txt"));

    // ═══ G. Source WIP untracked file
    console.log("G. Source WIP untracked");
    writeFileSync(join(rp, "u.txt"), "hello");
    const snapG = await mgr.prepare(mkId({ rp, cr, sha: featureSha, taskBranch: "codex/g-untracked" }));
    ok(snapG.state === "created", "prep with untracked");
    rmSync(join(rp, "u.txt"));

    // ═══ H. Source WIP untracked symlink
    console.log("H. Source WIP symlink");
    symlinkSync(join(rp, "README.md"), join(rp, "slink"));
    const snapH = await mgr.prepare(mkId({ rp, cr, sha: featureSha, taskBranch: "codex/h-symlink" }));
    ok(snapH.state === "created", "prep with symlink");
    rmSync(join(rp, "slink"));

    // ═══ I. WIP size limit
    console.log("I. WIP size limit");
    const mgrSmall = new LoopGitWorkspaceManager({ runner, gitExecutableId: "git", maxSourceWipBytes: 10 });
    writeFileSync(join(rp, "big.txt"), "x".repeat(100));
    try { await mgrSmall.prepare(mkId({ rp, cr, sha: featureSha, taskBranch: "codex/i-limit" })); ok(false, "limit"); } catch (e) { ok(e instanceof LoopGitWorkspaceError && (e as any).code === "SOURCE_WIP_TOO_LARGE", "limit exceeded"); }
    rmSync(join(rp, "big.txt"));

    // ═══ J. Initial prepare
    console.log("J. Initial prepare");
    const wsPath = mgr.workspacePathFor(id);
    ok(wsPath.startsWith(cr), "wsPath in controlRoot");
    const snapJ = await mgr.prepare(id);
    ok(snapJ.state === "created", "created");
    ok(snapJ.taskHeadSha === featureSha, "head at base");
    ok(Object.isFrozen(snapJ), "frozen");

    // ═══ K. Deterministic path
    console.log("K. Deterministic path");
    ok(mgr.workspacePathFor(id) === wsPath, "same");
    const id2 = mkId({ rp, cr, sha: featureSha, runId: "r2", taskBranch: "codex/k-2" });
    ok(mgr.workspacePathFor(id2) !== wsPath, "different");

    // ═══ L. Idempotent prepare
    console.log("L. Idempotent prepare");
    const snapL = await mgr.prepare(id);
    ok(snapL.state === "recovered", "recovered");

    // ═══ M. Dirty task workspace recovery
    console.log("M. Dirty task recovery");
    writeFileSync(join(wsPath, "d.txt"), "x");
    const snapM = await mgr.prepare(id);
    ok(snapM.state === "recovered" && snapM.taskHasChanges, "dirty recovered");
    rmSync(join(wsPath, "d.txt"));
    execFileSync(GIT_PATH, ["checkout","--","."], { cwd: wsPath });

    // ═══ N. Base mismatch
    console.log("N. Base mismatch");
    try { await mgr.prepare(mkId({ rp, cr, sha: "0000000000000000000000000000000000000000", taskBranch: "codex/n-bad" })); ok(false, "bad base"); } catch (e) { ok(e instanceof LoopGitWorkspaceError && (e as any).code === "BASE_SHA_MISMATCH", "base mismatch"); }

    // ═══ O. Base drift inspect
    console.log("O. Base drift");
    execFileSync(GIT_PATH, ["update-ref","refs/remotes/origin/feature/loop-runtime-v1",baseSha], { cwd: rp });
    const snapO = await mgr.inspect(id);
    ok(snapO.baseDrifted === true && snapO.state === "inspected", "drift detected");
    execFileSync(GIT_PATH, ["update-ref","refs/remotes/origin/feature/loop-runtime-v1",featureSha], { cwd: rp });

    // ═══ P. Mid-operation source drift
    console.log("P. Mid-operation source drift — Mutation E");
    // Prove fingerprints detect source changes
    const fpBefore = (await mgr.inspect(id)).sourceWipDigestSha256;
    writeFileSync(join(rp, "drift.txt"), "injected-before-prepare");
    const fpAfterMod = (await mgr.inspect(id)).sourceWipDigestSha256;
    ok(fpBefore !== fpAfterMod, "fingerprints detect source change");
    rmSync(join(rp, "drift.txt"));
    const fpRestored = (await mgr.inspect(id)).sourceWipDigestSha256;
    ok(fpBefore === fpRestored, "fingerprints restored after cleanup");
    // Now demonstrate that prepare rejects when source drifts during operation
    const idP2 = mkId({ rp, cr, sha: featureSha, taskBranch: "codex/p-drift" });
    const runnerP2 = makeRunner(rp, cr);
    const origRunP = runnerP2.run.bind(runnerP2);
    // Intercept git calls to inject drift after fingerprint is done
    // The key: _srcFp calls status + diff + cached diff + ls-files.
    // ls-files --others is the last fingerprint call. After that, _curBase runs.
    let driftInjected = false;
    runnerP2.run = async function(req: any) {
      const args = (req.args as string[]).join(" ");
      // After ls-files (last fingerprint call), inject drift before the next call executes
      if (!driftInjected && args.includes("ls-files")) {
        // Schedule drift injection after this call completes
        const result = await origRunP(req);
        if (!driftInjected) {
          driftInjected = true;
          writeFileSync(join(rp, "drift-mid.txt"), "mid-op-drift");
        }
        return result;
      }
      return origRunP(req);
    };
    const mgrP2 = new LoopGitWorkspaceManager({ runner: runnerP2, gitExecutableId: "git" });
    let driftCaught = false;
    try { await mgrP2.prepare(idP2); } catch (e: any) { if (e?.code === "SOURCE_WORKSPACE_DRIFT") driftCaught = true; }
    ok(driftCaught, "prepare rejects mid-op source drift");
    if (existsSync(join(rp, "drift-mid.txt"))) rmSync(join(rp, "drift-mid.txt"));
    // Clean up if worktree was created despite drift
    try { await mgrP2.cleanup(idP2, { expectedTaskHeadSha: featureSha }); } catch {}

    // ═══ Q. Empty-state same-identity concurrent prepare — Mutation H
    console.log("Q. Empty-state concurrent — Mutation H");
    const idQ = mkId({ rp, cr, sha: featureSha, runId: "q-concur", taskBranch: "codex/q-empty" });
    // Verify no existing branch
    try { execFileSync(GIT_PATH, ["show-ref","--verify","--quiet","refs/heads/codex/q-empty"], { cwd: rp }); ok(false, "should not exist"); } catch { /* expected */ }
    const runnerQ = makeRunner(rp, cr);
    const mgrQ1 = new LoopGitWorkspaceManager({ runner: runnerQ, gitExecutableId: "git" });
    const mgrQ2 = new LoopGitWorkspaceManager({ runner: runnerQ, gitExecutableId: "git" });
    const [rQ1, rQ2] = await Promise.all([mgrQ1.prepare(idQ), mgrQ2.prepare(idQ)]);
    ok(rQ1.workspacePath === rQ2.workspacePath, "same path");
    ok(rQ1.taskHeadSha === featureSha && rQ2.taskHeadSha === featureSha, "both at base");
    ok((rQ1.state === "created" || rQ1.state === "recovered") && (rQ2.state === "created" || rQ2.state === "recovered"), "both settled");
    // Verify worktree list
    const wtsQOut = execFileSync(GIT_PATH, ["worktree","list","--porcelain","-z"], { cwd: rp, encoding: "utf8" });
    ok(wtsQOut.includes(idQ.taskBranch), "task branch in worktree list");

    // ═══ R. Different-run concurrency isolation
    console.log("R. Concurrency isolation");
    const idA = mkId({ rp, cr, sha: featureSha, runId: "ra", taskBranch: "codex/r-a" });
    const idB = mkId({ rp, cr, sha: featureSha, runId: "rb", taskBranch: "codex/r-b" });
    const runnerR = makeRunner(rp, cr);
    const mgrR = new LoopGitWorkspaceManager({ runner: runnerR, gitExecutableId: "git" });
    const [rA, rB] = await Promise.all([mgrR.prepare(idA), mgrR.prepare(idB)]);
    ok(rA.state === "created" && rB.state === "created", "both created");
    ok(rA.workspacePath !== rB.workspacePath, "different paths");
    writeFileSync(join(rA.workspacePath, "a.txt"), "A");
    execFileSync(GIT_PATH, ["add","a.txt"], { cwd: rA.workspacePath });
    execFileSync(GIT_PATH, ["commit","-m","a"], { cwd: rA.workspacePath });
    ok(!existsSync(join(rB.workspacePath, "a.txt")), "B isolated");

    // ═══ S. Same taskBranch concurrent conflict
    console.log("S. Same taskBranch conflict");
    const idS1 = mkId({ rp, cr, sha: featureSha, runId: "s1", taskBranch: "codex/s-conflict" });
    const idS2 = mkId({ rp, cr, sha: featureSha, runId: "s2", taskBranch: "codex/s-conflict" });
    const runnerS = makeRunner(rp, cr);
    const mgrS1 = new LoopGitWorkspaceManager({ runner: runnerS, gitExecutableId: "git" });
    const mgrS2 = new LoopGitWorkspaceManager({ runner: runnerS, gitExecutableId: "git" });
    const results: string[] = [];
    const p1 = mgrS1.prepare(idS1).then(r => { results.push("ok1:"+r.state); return r; }, (e: any) => { results.push("err1:"+(e?.code||"?")); throw e; });
    const p2 = mgrS2.prepare(idS2).then(r => { results.push("ok2:"+r.state); return r; }, (e: any) => { results.push("err2:"+(e?.code||"?")); throw e; });
    try { await Promise.all([p1, p2]); } catch {}
    ok(results.length === 2, "both settled");
    ok(results.some(r => r.startsWith("ok1:") || r.startsWith("ok2:")), "at least one ok");
    // Verify exactly one worktree for this branch
    const wtsS = execFileSync(GIT_PATH, ["worktree","list","--porcelain","-z"], { cwd: rp, encoding: "utf8" });
    const sMatches = (wtsS.match(new RegExp("branch refs/heads/codex/s-conflict", "g")) || []).length;
    ok(sMatches <= 1, "at most one worktree for conflict branch");

    // ═══ T. Inspect
    console.log("T. Inspect");
    const snapT = await mgr.inspect(id);
    ok(snapT.state === "inspected" && !snapT.baseDrifted, "inspect");

    // ═══ U. Cleanup dirty blocked
    console.log("U. Cleanup dirty blocked");
    writeFileSync(join(wsPath, "d2.txt"), "mess");
    try { await mgr.cleanup(id, { expectedTaskHeadSha: featureSha }); ok(false, "dirty"); } catch (e) { ok(e instanceof LoopGitWorkspaceError && (e as any).code === "WORKSPACE_DIRTY", "dirty blocked"); }
    rmSync(join(wsPath, "d2.txt"));
    execFileSync(GIT_PATH, ["checkout","--","."], { cwd: wsPath });

    // ═══ V. Cleanup retain branch
    console.log("V. Cleanup retain");
    const clV = await mgr.cleanup(id, { expectedTaskHeadSha: featureSha });
    ok(clV.worktreeRemoved && clV.taskBranchRetained, "retained");
    ok(Object.isFrozen(clV), "frozen");

    // ═══ W. Cleanup idempotent
    console.log("W. Cleanup idempotent");
    const clW = await mgr.cleanup(id, { expectedTaskHeadSha: featureSha });
    ok(clW.taskBranchRetained && !clW.alreadyAbsent, "branch still there");

    // ═══ X. Recovery after branch-only
    console.log("X. Recovery branch-only");
    const snapX = await mgr.prepare(id);
    ok(snapX.state === "recovered", "reattached");

    // ═══ Y. Safe branch deletion (merged)
    console.log("Y. Safe delete merged");
    // Clean up from X first
    await mgr.cleanup(id, { expectedTaskHeadSha: featureSha });
    // Create a branch from base (which IS merged to main)
    const idY = mkId({ rp, cr, sha: baseSha, baseBranch: "main", taskBranch: "codex/y-merged" });
    // Need a remote tracking ref for main
    execFileSync(GIT_PATH, ["update-ref","refs/remotes/origin/main",baseSha], { cwd: rp });
    const snapY = await mgr.prepare(idY);
    ok(snapY.state === "created", "merged branch created");
    const yHead = execFileSync(GIT_PATH, ["rev-parse","HEAD"], { cwd: snapY.workspacePath, encoding: "utf8" }).trim();
    const clY = await mgr.cleanup(idY, { expectedTaskHeadSha: yHead, deleteTaskBranch: true });
    ok(clY.taskBranchDeleted, "merged branch deleted");

    // ═══ Z. Final cleanup
    console.log("Z. Final cleanup");
    for (const ix of [idQ, idA, idB, idS1]) {
      try {
        const pth = mgr.workspacePathFor(ix);
        const hd = execFileSync(GIT_PATH, ["rev-parse","HEAD"], { cwd: pth, encoding: "utf8" }).trim();
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
