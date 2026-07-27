// LOOP Git Workspace R1-C1 — Final Safety Gap Tests
// ==================================================
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { execFileSync } from "node:child_process";
import { LoopGitWorkspaceManager, LoopGitWorkspaceError } from "../core/loop-git-workspace";
import { LoopPosixProcessRunner } from "../core/loop-posix-process-runner";
import type { LoopRunIdentity } from "../core/loop-executor-types";

let p = 0, f = 0;
function ok(c: boolean, m: string) { if (c) { p++; console.log(`  ✓ ${m}`); } else { f++; console.error(`  ✗ ${m}`); } }

function findGit(): string {
  for (const d of (process.env.PATH || "/usr/bin:/bin").split(delimiter)) {
    const fp = join(d, "git");
    try { const st = require("fs").lstatSync(fp); if (st.isFile() && (st.mode & 0o111)) return realpathSync(fp); } catch {}
  }
  throw new Error("git not found");
}
const GP = findGit();

function setupRepo() {
  const tr = realpathSync(mkdtempSync(join(tmpdir(), "l03c1-")));
  const rp = join(tr, "repo"); const cr = join(tr, "ctrl");
  mkdirSync(rp, { recursive: true }); mkdirSync(cr, { recursive: true });
  execFileSync(GP, ["init", "-b", "main"], { cwd: rp });
  execFileSync(GP, ["config", "user.name", "t"], { cwd: rp });
  execFileSync(GP, ["config", "user.email", "t@t"], { cwd: rp });
  writeFileSync(join(rp, "f.txt"), "x");
  execFileSync(GP, ["add", "f.txt"], { cwd: rp });
  execFileSync(GP, ["commit", "-m", "init"], { cwd: rp });
  const baseSha = execFileSync(GP, ["rev-parse", "HEAD"], { cwd: rp, encoding: "utf8" }).trim();
  execFileSync(GP, ["checkout", "-b", "feature/loop-runtime-v1"], { cwd: rp });
  writeFileSync(join(rp, "s.ts"), "//");
  execFileSync(GP, ["add", "s.ts"], { cwd: rp });
  execFileSync(GP, ["commit", "-m", "feat"], { cwd: rp });
  const featSha = execFileSync(GP, ["rev-parse", "HEAD"], { cwd: rp, encoding: "utf8" }).trim();
  execFileSync(GP, ["update-ref", "refs/remotes/origin/feature/loop-runtime-v1", featSha], { cwd: rp });
  execFileSync(GP, ["update-ref", "refs/remotes/origin/main", baseSha], { cwd: rp });
  execFileSync(GP, ["remote", "add", "origin", "https://github.com/example/fixture-repo.git"], { cwd: rp });
  execFileSync(GP, ["checkout", "main"], { cwd: rp });
  return { tr, rp, cr, baseSha, featSha };
}

function mkId(o: { rp: string; cr: string; sha: string; runId?: string; taskBranch?: string; repo?: string; baseBranch?: string }): LoopRunIdentity {
  return Object.freeze({ runId: o.runId ?? "r", requirementId: "req", repository: o.repo ?? "example/fixture-repo", repositoryPath: o.rp, baseBranch: o.baseBranch ?? "feature/loop-runtime-v1", expectedBaseSha: o.sha, taskBranch: o.taskBranch ?? "codex/t", controlRoot: o.cr, createdAt: new Date().toISOString() });
}

function mkRunner(rp: string, cr: string) {
  return new LoopPosixProcessRunner({ executables: [{ id: "git", executablePath: GP, allowDynamicArgs: true, stdinMode: "forbidden" }], allowedCwdRoots: [rp, cr], fixedEnv: { GIT_TERMINAL_PROMPT: "0", HOME: process.env.HOME || "/tmp", PATH: process.env.PATH || "/usr/bin:/bin", LC_ALL: "C", LANG: "C" }, allowedRequestEnvKeys: [], defaultTimeoutMs: 15000 });
}

async function main() {
  console.log("LOOP Git Workspace R1-C1 — Final Tests\n");
  const { tr, rp, cr, baseSha, featSha } = setupRepo();
  const runner = mkRunner(rp, cr);
  const mgr = new LoopGitWorkspaceManager({ runner, gitExecutableId: "git" });
  const id = mkId({ rp, cr, sha: featSha });

  try {
    // ═══ A. Scanner matrix
    console.log("A. Scanner");
    // getter
    let getterCalls = 0;
    const getterObj = { get runner() { getterCalls++; return runner; }, gitExecutableId: "g" };
    try { new LoopGitWorkspaceManager(getterObj as any); } catch (e) { ok(e instanceof LoopGitWorkspaceError, "getter rejected"); }
    ok(getterCalls === 0, "getter call count=0");
    // setter
    try { new LoopGitWorkspaceManager(Object.defineProperty({ gitExecutableId: "g" }, "runner", { set(v: any) {}, enumerable: true, configurable: true }) as any); } catch (e) { ok(e instanceof LoopGitWorkspaceError, "setter rejected"); }
    // class instance
    class Foo { runner = runner; gitExecutableId = "g"; }
    try { new LoopGitWorkspaceManager(new Foo() as any); } catch (e) { ok(e instanceof LoopGitWorkspaceError, "class rejected"); }
    // throwing getPrototypeOf Proxy
    try { new LoopGitWorkspaceManager(new Proxy({ runner, gitExecutableId: "g" }, { getPrototypeOf() { throw new Error("nope"); } }) as any); } catch (e) { ok(e instanceof LoopGitWorkspaceError, "throwing proxy rejected"); }
    // Cleanup options scanner
    try { await mgr.cleanup(id, new Proxy({ expectedTaskHeadSha: featSha }, { ownKeys() { throw new Error("nope"); } }) as any); } catch (e) { ok(e instanceof LoopGitWorkspaceError, "cu proxy rejected"); }

    // ═══ B. Path containment
    console.log("B. Path containment");
    try { mgr.workspacePathFor({ ...id, repositoryPath: cr, controlRoot: join(cr, "sub") } as any); } catch (e) { ok(e instanceof LoopGitWorkspaceError, "repo contains ctrl rejected"); }
    try { mgr.workspacePathFor({ ...id, controlRoot: rp } as any); } catch (e) { ok(e instanceof LoopGitWorkspaceError, "ctrl equals repo rejected"); }

    // ═══ C. Origin forms
    console.log("C. Origin forms");
    // Already tested with https:// form in fixture

    // ═══ D. Source WIP: staged, unstaged, untracked, symlink, limit, special
    console.log("D. Source WIP");
    writeFileSync(join(rp, "staged.txt"), "s");
    execFileSync(GP, ["add", "staged.txt"], { cwd: rp });
    const sStaged = await mgr.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/d-staged" }));
    ok(sStaged.state === "created", "staged ok");
    execFileSync(GP, ["reset", "HEAD", "staged.txt"], { cwd: rp });
    // untracked symlink
    symlinkSync(join(rp, "f.txt"), join(rp, "slink"));
    const sSym = await mgr.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/d-sym" }));
    ok(sSym.state === "created", "symlink ok");
    rmSync(join(rp, "slink")); rmSync(join(rp, "staged.txt"));
    // size limit
    const mgrSmall = new LoopGitWorkspaceManager({ runner, gitExecutableId: "git", maxSourceWipBytes: 5 });
    writeFileSync(join(rp, "big.txt"), "x".repeat(100));
    try { await mgrSmall.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/d-limit" })); } catch (e: any) { ok(e?.code === "SOURCE_WIP_TOO_LARGE", "limit"); }
    rmSync(join(rp, "big.txt"));

    // ═══ E. Mid-operation drift
    console.log("E. Mid-op drift");
    const idE = mkId({ rp, cr, sha: featSha, taskBranch: "codex/e-drift" });
    const rE = mkRunner(rp, cr);
    const origE = rE.run.bind(rE);
    let injected = false;
    rE.run = async function(req: any) {
      const args = (req.args as string[]).join(" ");
      if (!injected && args.includes("ls-files")) {
        const result = await origE(req);
        if (!injected) { injected = true; writeFileSync(join(rp, "drift.txt"), "mid"); }
        return result;
      }
      return origE(req);
    };
    const mgrE = new LoopGitWorkspaceManager({ runner: rE, gitExecutableId: "git" });
    let driftOk = false;
    try { await mgrE.prepare(idE); } catch (e: any) { if (e?.code === "SOURCE_WORKSPACE_DRIFT") driftOk = true; }
    ok(driftOk, "mid-op drift caught");
    if (existsSync(join(rp, "drift.txt"))) rmSync(join(rp, "drift.txt"));

    // ═══ F. Initial prepare + idempotent
    console.log("F. Prepare lifecycle");
    const ws = mgr.workspacePathFor(id);
    const s1 = await mgr.prepare(id);
    ok(s1.state === "created", "created");
    ok(Object.isFrozen(s1), "frozen");
    const s2 = await mgr.prepare(id);
    ok(s2.state === "recovered", "recovered");
    // Dirty recovery
    writeFileSync(join(ws, "d.txt"), "x");
    const s3 = await mgr.prepare(id);
    ok(s3.taskHasChanges, "dirty recovered");
    rmSync(join(ws, "d.txt")); execFileSync(GP, ["checkout", "--", "."], { cwd: ws });

    // ═══ G. Base mismatch + drift
    console.log("G. Base");
    try { await mgr.prepare(mkId({ rp, cr, sha: "0000000000000000000000000000000000000000", taskBranch: "codex/g-bad" })); ok(false, "should fail"); } catch (e: any) { ok(e?.code === "BASE_SHA_MISMATCH", "bad sha→"+e?.code); }
    execFileSync(GP, ["update-ref", "refs/remotes/origin/feature/loop-runtime-v1", baseSha], { cwd: rp });
    const sG = await mgr.inspect(id);
    ok(sG.baseDrifted, "drift detected");
    execFileSync(GP, ["update-ref", "refs/remotes/origin/feature/loop-runtime-v1", featSha], { cwd: rp });

    // ═══ H. Empty-state concurrent
    console.log("H. Empty-state concurrent");
    const idH = mkId({ rp, cr, sha: featSha, runId: "h", taskBranch: "codex/h-empty" });
    const rH = mkRunner(rp, cr);
    const mH1 = new LoopGitWorkspaceManager({ runner: rH, gitExecutableId: "git" });
    const mH2 = new LoopGitWorkspaceManager({ runner: rH, gitExecutableId: "git" });
    const [h1, h2] = await Promise.all([mH1.prepare(idH), mH2.prepare(idH)]);
    ok(h1.workspacePath === h2.workspacePath, "same path");
    ok(h1.taskHeadSha === featSha && h2.taskHeadSha === featSha, "both at base");
    const states = [h1.state, h2.state].sort().join(",");
    ok(states === "created,recovered" || states === "recovered,created", "one created, one recovered: " + states);

    // ═══ I. Same taskBranch conflict
    console.log("I. Same taskBranch conflict");
    const idI = mkId({ rp, cr, sha: featSha, runId: "i1", taskBranch: "codex/i-conflict" });
    const idI2 = mkId({ rp, cr, sha: featSha, runId: "i2", taskBranch: "codex/i-conflict" });
    const rI = mkRunner(rp, cr);
    const mI1 = new LoopGitWorkspaceManager({ runner: rI, gitExecutableId: "git" });
    const mI2 = new LoopGitWorkspaceManager({ runner: rI, gitExecutableId: "git" });
    const outcomes: string[] = [];
    await Promise.allSettled([
      mI1.prepare(idI).then(r => { outcomes.push("ok"); }, (e: any) => { outcomes.push("err:" + (e?.code || "?")); }),
      mI2.prepare(idI2).then(r => { outcomes.push("ok"); }, (e: any) => { outcomes.push("err:" + (e?.code || "?")); }),
    ]);
    ok(outcomes.includes("ok"), "at least one ok: " + outcomes.join(","));
    ok(outcomes.some(o => o.startsWith("err:")), "at least one error: " + outcomes.join(","));

    // ═══ J. Concurrency isolation
    console.log("J. Concurrency isolation");
    const idA = mkId({ rp, cr, sha: featSha, runId: "ja", taskBranch: "codex/j-a" });
    const idB = mkId({ rp, cr, sha: featSha, runId: "jb", taskBranch: "codex/j-b" });
    const rJ = mkRunner(rp, cr);
    const mJ = new LoopGitWorkspaceManager({ runner: rJ, gitExecutableId: "git" });
    const [jA, jB] = await Promise.all([mJ.prepare(idA), mJ.prepare(idB)]);
    ok(jA.state === "created" && jB.state === "created", "both created");
    ok(jA.workspacePath !== jB.workspacePath, "different paths");
    writeFileSync(join(jA.workspacePath, "a.txt"), "A");
    execFileSync(GP, ["add", "a.txt"], { cwd: jA.workspacePath });
    execFileSync(GP, ["commit", "-m", "a"], { cwd: jA.workspacePath });
    ok(!existsSync(join(jB.workspacePath, "a.txt")), "B isolated");

    // ═══ K. Cleanup dirty blocked
    console.log("K. Cleanup dirty");
    writeFileSync(join(ws, "d2.txt"), "x");
    try { await mgr.cleanup(id, { expectedTaskHeadSha: featSha }); } catch (e: any) { ok(e?.code === "WORKSPACE_DIRTY", "dirty blocked"); }
    rmSync(join(ws, "d2.txt")); execFileSync(GP, ["checkout", "--", "."], { cwd: ws });

    // ═══ L. Cleanup retain branch
    console.log("L. Cleanup retain");
    const clL = await mgr.cleanup(id, { expectedTaskHeadSha: featSha });
    ok(clL.worktreeRemoved && clL.taskBranchRetained, "retained");
    ok(Object.isFrozen(clL), "frozen");

    // ═══ M. Cleanup idempotent + head mismatch
    console.log("M. Cleanup edge cases");
    const clM1 = await mgr.cleanup(id, { expectedTaskHeadSha: featSha });
    ok(clM1.taskBranchRetained && !clM1.alreadyAbsent, "branch still there");
    try { await mgr.cleanup(id, { expectedTaskHeadSha: "0000000000000000000000000000000000000000" }); } catch (e: any) { ok(e?.code === "CLEANUP_BLOCKED", "wrong head blocked"); }

    // ═══ N. Branch-only recovery
    console.log("N. Branch-only recovery");
    const sN = await mgr.prepare(id);
    ok(sN.state === "recovered", "reattached");

    // ═══ O. Safe merged branch deletion
    console.log("O. Safe delete");
    const clO = await mgr.cleanup(id, { expectedTaskHeadSha: featSha });
    const idMerged = mkId({ rp, cr, sha: baseSha, baseBranch: "main", taskBranch: "codex/o-merged" });
    const sO = await mgr.prepare(idMerged);
    const oHead = execFileSync(GP, ["rev-parse", "HEAD"], { cwd: sO.workspacePath, encoding: "utf8" }).trim();
    const clO2 = await mgr.cleanup(idMerged, { expectedTaskHeadSha: oHead, deleteTaskBranch: true });
    ok(clO2.taskBranchDeleted, "merged deleted");

    // ═══ P. Runner result boundary
    console.log("P. Runner boundary");
    // Test with very short timeout to trigger GIT_COMMAND_FAILED
    const rFast = new LoopPosixProcessRunner({ executables: [{ id: "g2", executablePath: GP, allowDynamicArgs: true, stdinMode: "forbidden" }], allowedCwdRoots: [rp, cr], fixedEnv: { GIT_TERMINAL_PROMPT: "0", HOME: process.env.HOME || "/tmp", PATH: process.env.PATH || "/usr/bin:/bin", LC_ALL: "C", LANG: "C" }, allowedRequestEnvKeys: [], defaultTimeoutMs: 100, terminationGraceMs: 10 });
    const mgrFast = new LoopGitWorkspaceManager({ runner: rFast, gitExecutableId: "g2" });
    try { await mgrFast.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/p-fast" })); } catch (e: any) { ok(e?.code === "GIT_COMMAND_FAILED" || e?.code === "INVALID_INPUT", "timeout→"+e?.code); }

    // ═══ Q. Frozen + static contract
    console.log("Q. Frozen");
    ok(Object.isFrozen(s1), "snap frozen");
    ok(Object.isFrozen(clL), "cleanup frozen");

    // ═══ R. Remote base: missing ref → BASE_SHA_MISMATCH
    console.log("R. Remote base missing");
    // Delete the remote tracking ref
    execFileSync(GP, ["update-ref","-d","refs/remotes/origin/feature/loop-runtime-v1"], { cwd: rp });
    try { await mgr.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/r-missing" })); ok(false, "should fail"); } catch (e: any) { ok(e?.code === "BASE_SHA_MISMATCH", "missing ref→"+e?.code); }
    // Restore
    execFileSync(GP, ["update-ref","refs/remotes/origin/feature/loop-runtime-v1",featSha], { cwd: rp });

    // ═══ S. Prunable/broken worktree detection
    console.log("S. Prunable/broken worktree");
    const idS = mkId({ rp, cr, sha: featSha, taskBranch: "codex/s-broken" });
    const sS = await mgr.prepare(idS);
    const sPath = sS.workspacePath;
    // Delete the worktree directory to simulate broken/missing path
    rmSync(sPath, { recursive: true, force: true });
    // Now prepare should detect the broken path registration
    try { await mgr.prepare(idS); ok(false, "should fail"); } catch (e: any) { ok(e?.code === "WORKSPACE_CORRUPT", "broken path→"+e?.code); }
    // Clean up
    try { execFileSync(GP, ["worktree","prune"], { cwd: rp }); } catch {}
    try { execFileSync(GP, ["branch","-D","codex/s-broken"], { cwd: rp }); } catch {}

    // ═══ T. Missing worktree path detection
    console.log("T. Missing worktree path");
    // Create worktree, then delete its directory
    const idT = mkId({ rp, cr, sha: featSha, taskBranch: "codex/t-missing" });
    const sT = await mgr.prepare(idT);
    rmSync(sT.workspacePath, { recursive: true, force: true });
    try { await mgr.prepare(idT); ok(false, "should fail"); } catch (e: any) { ok(e?.code === "WORKSPACE_CORRUPT", "missing path→"+e?.code); }
    try { execFileSync(GP, ["branch","-D","codex/t-missing"], { cwd: rp }); } catch {}

    // ═══ U. Detached worktree → WORKSPACE_CORRUPT
    console.log("U. Detached worktree");
    const idU = mkId({ rp, cr, sha: featSha, taskBranch: "codex/u-detached" });
    const uPath = mgr.workspacePathFor(idU);
    execFileSync(GP, ["worktree","add","--detach",uPath,featSha], { cwd: rp });
    try { await mgr.prepare(idU); ok(false, "should fail"); } catch (e: any) { ok(e?.code === "WORKSPACE_CORRUPT" || e?.code === "TASK_BRANCH_CONFLICT", "detached→"+e?.code); }
    try { execFileSync(GP, ["worktree","remove","--force",uPath], { cwd: rp }); } catch {}

    // ═══ Z. Final cleanup
    console.log("Z. Final cleanup");
    for (const ix of [idH, idA, idB, idI]) {
      try { const ph = mgr.workspacePathFor(ix); const hd = execFileSync(GP, ["rev-parse", "HEAD"], { cwd: ph, encoding: "utf8" }).trim(); await mgr.cleanup(ix, { expectedTaskHeadSha: hd, deleteTaskBranch: true }); } catch {}
    }

  } finally { rmSync(tr, { recursive: true, force: true }); }
  console.log(`\nResults: ${p} passed, ${f} failed`);
  if (f > 0) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
