// LOOP Git Workspace — R1 Comprehensive Tests
// =============================================
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
  const tr = realpathSync(mkdtempSync(join(tmpdir(), "l03r1-")));
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
  console.log("LOOP Git Workspace R1 — Comprehensive Tests\n");
  const { tr, rp, cr, baseSha, featSha, home } = setupRepo();
  const runner = mkRunner(rp, cr, home);
  const mgr = new LoopGitWorkspaceManager({ runner, gitExecutableId: "git" });
  const id = mkId({ rp, cr, sha: featSha });

  try {
    // ═══ A. Scanner (6 checks)
    console.log("A. Scanner");
    let gc = 0;
    const go = { get runner() { gc++; return runner; }, gitExecutableId: "g" };
    try { new LoopGitWorkspaceManager(go as any); } catch (e) { ok(e instanceof LoopGitWorkspaceError, "getter rejected"); }
    ok(gc === 0, "getter call count=0");
    try { new LoopGitWorkspaceManager(Object.defineProperty({ gitExecutableId: "g" }, "runner", { set(v: any) {}, enumerable: true, configurable: true }) as any); } catch (e) { ok(e instanceof LoopGitWorkspaceError, "setter rejected"); }
    try { new LoopGitWorkspaceManager({ runner, gitExecutableId: "g", bad: 1 } as any); } catch (e) { ok(e instanceof LoopGitWorkspaceError, "unknown field"); }
    class Foo { runner = runner; gitExecutableId = "g"; }
    try { new LoopGitWorkspaceManager(new Foo() as any); } catch (e) { ok(e instanceof LoopGitWorkspaceError, "class rejected"); }
    try { new LoopGitWorkspaceManager([] as any); } catch (e) { ok(e instanceof LoopGitWorkspaceError, "array rejected"); }

    // ═══ B. Path containment (2 checks)
    console.log("B. Path containment");
    try { mgr.workspacePathFor({ ...id, repositoryPath: join(cr, "sub"), controlRoot: cr } as any); ok(false, "s"); } catch (e: any) { ok(e?.code === "INVALID_INPUT", "repo in ctrl→" + e?.code); }
    try { mgr.workspacePathFor({ ...id, controlRoot: join(rp, "sub") } as any); ok(false, "s"); } catch (e: any) { ok(e?.code === "INVALID_INPUT", "ctrl in repo→" + e?.code); }

    // ═══ C. Remote base + origin mismatch (4 checks)
    console.log("C. Remote base + origin");
    execFileSync(GP, ["update-ref", "-d", "refs/remotes/origin/feat/loop-runtime-v1"], { cwd: rp });
    try { await mgr.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/c1" })); ok(false, "s"); } catch (e: any) { ok(e?.code === "BASE_SHA_MISMATCH", "missing ref→" + e?.code); }
    execFileSync(GP, ["update-ref", "refs/remotes/origin/feat/loop-runtime-v1", featSha], { cwd: rp });
    try { await mgr.prepare(mkId({ rp, cr, sha: baseSha, taskBranch: "codex/c2" })); ok(false, "s"); } catch (e: any) { ok(e?.code === "BASE_SHA_MISMATCH", "remote mismatch→" + e?.code); }
    try { await mgr.prepare(mkId({ rp, cr, sha: "0000000000000000000000000000000000000000", taskBranch: "codex/c3" })); ok(false, "s"); } catch (e: any) { ok(e?.code === "BASE_SHA_MISMATCH", "bad sha→" + e?.code); }
    try { await mgr.prepare(mkId({ rp, cr, sha: featSha, repo: "other/bad-repo", taskBranch: "codex/c4" })); ok(false, "s"); } catch (e: any) { ok(e?.code === "REPOSITORY_MISMATCH", "origin mismatch→" + e?.code); }

    // ═══ D. Source WIP (3 checks)
    console.log("D. Source WIP");
    writeFileSync(join(rp, "st.txt"), "s"); execFileSync(GP, ["add", "st.txt"], { cwd: rp });
    const sD1 = await mgr.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/d1" }));
    ok(sD1.state === "created", "staged ok");
    execFileSync(GP, ["reset", "HEAD", "st.txt"], { cwd: rp }); rmSync(join(rp, "st.txt"));
    symlinkSync(join(rp, "f.txt"), join(rp, "sl"));
    const sD2 = await mgr.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/d2" }));
    ok(sD2.state === "created", "symlink ok");
    rmSync(join(rp, "sl"));
    writeFileSync(join(rp, "big.txt"), "x".repeat(100));
    const mgrSmall = new LoopGitWorkspaceManager({ runner, gitExecutableId: "git", maxSourceWipBytes: 5 });
    try { await mgrSmall.prepare(mkId({ rp, cr, sha: featSha, taskBranch: "codex/d3" })); ok(false, "s"); } catch (e: any) { ok(e?.code === "SOURCE_WIP_TOO_LARGE", "limit→" + e?.code); }
    rmSync(join(rp, "big.txt"));

    // ═══ E. Mid-op drift (1 check)
    console.log("E. Mid-op drift");
    const idE = mkId({ rp, cr, sha: featSha, taskBranch: "codex/e" });
    const rE = mkRunner(rp, cr, home); const oE = rE.run.bind(rE); let inj = false;
    rE.run = async function (req: any) {
      if (!inj && (req.args as string[]).join(" ").includes("ls-files")) {
        const r = await oE(req); if (!inj) { inj = true; writeFileSync(join(rp, "dr.txt"), "x"); } return r;
      }
      return oE(req);
    };
    const mE = new LoopGitWorkspaceManager({ runner: rE, gitExecutableId: "git" });
    let driftOk = false;
    try { await mE.prepare(idE); } catch (e: any) { if (e?.code === "SOURCE_WORKSPACE_DRIFT") driftOk = true; }
    ok(driftOk, "mid-op drift→SOURCE_WORKSPACE_DRIFT");
    if (existsSync(join(rp, "dr.txt"))) rmSync(join(rp, "dr.txt"));

    // ═══ F. Prepare lifecycle (5 checks)
    console.log("F. Prepare");
    const ws = mgr.workspacePathFor(id);
    const sF1 = await mgr.prepare(id);
    ok(sF1.state === "created", "created");
    ok(Object.isFrozen(sF1), "frozen");
    const sF2 = await mgr.prepare(id);
    ok(sF2.state === "recovered", "recovered");
    writeFileSync(join(ws, "d.txt"), "x");
    const sF3 = await mgr.prepare(id);
    ok(sF3.taskHasChanges, "dirty recovered");
    rmSync(join(ws, "d.txt")); execFileSync(GP, ["checkout", "--", "."], { cwd: ws });
    ok(mgr.workspacePathFor(id) === ws, "deterministic path");

    // ═══ G. Base drift (1 check)
    console.log("G. Base drift");
    execFileSync(GP, ["update-ref", "refs/remotes/origin/feat/loop-runtime-v1", baseSha], { cwd: rp });
    const sG = await mgr.inspect(id);
    ok(sG.baseDrifted, "drift detected");
    execFileSync(GP, ["update-ref", "refs/remotes/origin/feat/loop-runtime-v1", featSha], { cwd: rp });

    // ═══ H. Empty-state concurrent (2 checks)
    console.log("H. Empty-state concurrent");
    const idH = mkId({ rp, cr, sha: featSha, runId: "h", taskBranch: "codex/h" });
    const rH = mkRunner(rp, cr, home);
    const mH1 = new LoopGitWorkspaceManager({ runner: rH, gitExecutableId: "git" });
    const mH2 = new LoopGitWorkspaceManager({ runner: rH, gitExecutableId: "git" });
    const [h1, h2] = await Promise.all([mH1.prepare(idH), mH2.prepare(idH)]);
    ok(h1.workspacePath === h2.workspacePath, "same path");
    const states = [h1.state, h2.state].sort().join(",");
    ok(states === "created,recovered" || states === "recovered,created", "one created one recovered: " + states);

    // ═══ I. Same taskBranch conflict — exactly one success, one TASK_BRANCH_CONFLICT (2 checks)
    console.log("I. Same taskBranch");
    const idI = mkId({ rp, cr, sha: featSha, runId: "i1", taskBranch: "codex/i" });
    const idI2 = mkId({ rp, cr, sha: featSha, runId: "i2", taskBranch: "codex/i" });
    const rI = mkRunner(rp, cr, home);
    const mI1 = new LoopGitWorkspaceManager({ runner: rI, gitExecutableId: "git" });
    const mI2 = new LoopGitWorkspaceManager({ runner: rI, gitExecutableId: "git" });
    const outI: string[] = [];
    await Promise.allSettled([
      mI1.prepare(idI).then(() => outI.push("ok"), (e: any) => outI.push(e?.code || "?")),
      mI2.prepare(idI2).then(() => outI.push("ok"), (e: any) => outI.push(e?.code || "?")),
    ]);
    ok(outI.filter((o) => o === "ok").length === 1, "exactly one ok");
    ok(outI.filter((o) => o === "TASK_BRANCH_CONFLICT").length === 1, "exactly one TASK_BRANCH_CONFLICT: " + outI.join(","));

    // ═══ J. Concurrency isolation (3 checks)
    console.log("J. Concurrency");
    const idA = mkId({ rp, cr, sha: featSha, runId: "ja", taskBranch: "codex/ja" });
    const idB = mkId({ rp, cr, sha: featSha, runId: "jb", taskBranch: "codex/jb" });
    const rJ = mkRunner(rp, cr, home);
    const mJ = new LoopGitWorkspaceManager({ runner: rJ, gitExecutableId: "git" });
    const [jA, jB] = await Promise.all([mJ.prepare(idA), mJ.prepare(idB)]);
    ok(jA.state === "created" && jB.state === "created", "both created");
    ok(jA.workspacePath !== jB.workspacePath, "different paths");
    writeFileSync(join(jA.workspacePath, "a.txt"), "A");
    execFileSync(GP, ["add", "a.txt"], { cwd: jA.workspacePath });
    execFileSync(GP, ["commit", "-m", "a"], { cwd: jA.workspacePath });
    ok(!existsSync(join(jB.workspacePath, "a.txt")), "B isolated");

    // ═══ K. Cleanup (5 checks)
    console.log("K. Cleanup");
    writeFileSync(join(ws, "d2.txt"), "x");
    try { await mgr.cleanup(id, { expectedTaskHeadSha: featSha }); ok(false, "s"); } catch (e: any) { ok(e?.code === "WORKSPACE_DIRTY", "dirty blocked→" + e?.code); }
    rmSync(join(ws, "d2.txt")); execFileSync(GP, ["checkout", "--", "."], { cwd: ws });
    const cl = await mgr.cleanup(id, { expectedTaskHeadSha: featSha });
    ok(cl.worktreeRemoved && cl.taskBranchRetained, "retained");
    ok(Object.isFrozen(cl), "frozen");
    try { await mgr.cleanup(id, { expectedTaskHeadSha: "0000000000000000000000000000000000000000" }); ok(false, "s"); } catch (e: any) { ok(e?.code === "CLEANUP_BLOCKED", "wrong head→" + e?.code); }
    const cl2 = await mgr.cleanup(id, { expectedTaskHeadSha: featSha });
    ok(cl2.taskBranchRetained && !cl2.alreadyAbsent, "idempotent retain");

    // ═══ L. Recovery + unmerged -d + merged safe delete (3 checks)
    console.log("L. Recovery + delete");
    const sL = await mgr.prepare(id);
    ok(sL.state === "recovered", "reattached");
    await mgr.cleanup(id, { expectedTaskHeadSha: featSha });
    try { await mgr.cleanup(id, { expectedTaskHeadSha: featSha, deleteTaskBranch: true }); ok(false, "s"); } catch (e: any) { ok(e?.code === "CLEANUP_BLOCKED", "unmerged -d→" + e?.code); }
    const idM = mkId({ rp, cr, sha: baseSha, baseBranch: "main", taskBranch: "codex/lm" });
    const sM = await mgr.prepare(idM);
    const mHead = execFileSync(GP, ["rev-parse", "HEAD"], { cwd: sM.workspacePath, encoding: "utf8" }).trim();
    const clM = await mgr.cleanup(idM, { expectedTaskHeadSha: mHead, deleteTaskBranch: true });
    ok(clM.taskBranchDeleted, "merged deleted");

    // ═══ M. Corruption: broken path → WORKSPACE_CORRUPT (1 check)
    console.log("M. Broken path");
    const idM2 = mkId({ rp, cr, sha: featSha, taskBranch: "codex/m" });
    const sM2 = await mgr.prepare(idM2);
    rmSync(sM2.workspacePath, { recursive: true, force: true });
    try { await mgr.prepare(idM2); ok(false, "s"); } catch (e: any) { ok(e?.code === "WORKSPACE_CORRUPT", "broken→" + e?.code); }
    try { execFileSync(GP, ["worktree", "prune"], { cwd: rp }); } catch {}
    try { execFileSync(GP, ["branch", "-D", "codex/m"], { cwd: rp }); } catch {}

    // ═══ N. Corruption: detached → WORKSPACE_CORRUPT (1 check)
    console.log("N. Detached");
    const idN = mkId({ rp, cr, sha: featSha, taskBranch: "codex/n" });
    const nPath = mgr.workspacePathFor(idN);
    execFileSync(GP, ["worktree", "add", "--detach", nPath, featSha], { cwd: rp });
    try { await mgr.prepare(idN); ok(false, "s"); } catch (e: any) { ok(e?.code === "WORKSPACE_CORRUPT", "detached→" + e?.code); }
    try { execFileSync(GP, ["worktree", "remove", "--force", nPath], { cwd: rp }); } catch {}

    // ═══ Z. Final cleanup
    console.log("Z. Final");
    for (const ix of [idH, idA, idB, idI]) {
      try { const ph = mgr.workspacePathFor(ix); const hd = execFileSync(GP, ["rev-parse", "HEAD"], { cwd: ph, encoding: "utf8" }).trim(); await mgr.cleanup(ix, { expectedTaskHeadSha: hd, deleteTaskBranch: true }); } catch {}
    }

  } finally { rmSync(tr, { recursive: true, force: true }); }
  console.log(`\nResults: ${p} passed, ${f} failed`);
  if (f > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
