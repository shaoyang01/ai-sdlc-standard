// C03-E W6b3 (E4-T5): attempt workspace cleanup is a three-state decision.
//
// Before this wave cleanup was binary: reclaim the worktree, or throw. An
// operator reading the journal could not tell "the attempt failed, evidence
// kept" from "nobody knows what the attempt touched" — both surfaced as an
// error. Now the decision is explicit (promote / isolate / block) and travels
// in the result, and any path outside the task-permitted set forces block no
// matter what the caller claims about the outcome.
//
// Reverse probes (independent reviewer, not asserted here):
//  - drop the out-of-bounds check in classifyWorkspaceCleanup → T4/T8 go red;
//  - widen isWithinAllowed to a raw startsWith → the T5 prefix case goes red;
//  - route `failed` through the promote path → T2 goes red;
//  - feed only `status` to the classifier and drop the committed diff → T4 red.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { realpathSync } from "node:fs";

import { LoopGitWorkspaceManager, LoopGitWorkspaceError, classifyWorkspaceCleanup }
  from "../core/loop-git-workspace";
import { LoopPosixProcessRunner } from "../core/loop-posix-process-runner";
import type { LoopRunIdentity } from "../core/loop-executor-types";

let p = 0, f = 0;
function ok(c: boolean, m: string) { if (c) { p++; console.log(`  ✓ ${m}`); } else { f++; console.error(`  ✗ ${m}`); } }

async function assertCode(fn: () => Promise<any>, code: string, label: string): Promise<void> {
  try { await fn(); ok(false, label + " (no throw)"); }
  catch (e: any) { ok(e instanceof LoopGitWorkspaceError && e.code === code, `${label}→${e?.code ?? "?"}`); }
}

function findGit(): string {
  for (const d of (process.env.PATH || "/usr/bin:/bin").split(delimiter)) {
    const fp = join(d, "git");
    try {
      const st = require("fs").lstatSync(fp);
      if (st.isFile() && (st.mode & 0o111)) return realpathSync(fp);
    } catch { /* next */ }
  }
  throw new Error("git not found");
}
const GP = findGit();

interface Env { tr: string; rp: string; cr: string; baseSha: string; home: string; }

// A source repo with one commit on `feat/loop-runtime-v1`, mirrored into
// refs/remotes/origin so the manager's base check has something to read.
function setupRepo(): Env {
  const tr = realpathSync(mkdtempSync(join(tmpdir(), "l03w6b3-")));
  const rp = join(tr, "repo"), cr = join(tr, "ctrl");
  mkdirSync(rp, { recursive: true }); mkdirSync(cr, { recursive: true });
  execFileSync(GP, ["init", "-b", "main"], { cwd: rp });
  execFileSync(GP, ["config", "user.name", "t"], { cwd: rp });
  execFileSync(GP, ["config", "user.email", "t@t"], { cwd: rp });
  writeFileSync(join(rp, "f.txt"), "x");
  execFileSync(GP, ["add", "f.txt"], { cwd: rp });
  execFileSync(GP, ["commit", "-m", "init"], { cwd: rp });
  const baseSha = execFileSync(GP, ["rev-parse", "HEAD"], { cwd: rp, encoding: "utf8" }).trim();
  execFileSync(GP, ["update-ref", "refs/remotes/origin/feat/loop-runtime-v1", baseSha], { cwd: rp });
  execFileSync(GP, ["update-ref", "refs/remotes/origin/main", baseSha], { cwd: rp });
  execFileSync(GP, ["remote", "add", "origin", "https://github.com/example/fixture-repo.git"], { cwd: rp });
  const home = join(tr, "home"); mkdirSync(home, { recursive: true });
  return { tr, rp, cr, baseSha, home };
}

function mkId(e: Env, taskBranch: string): LoopRunIdentity {
  return Object.freeze({
    runId: "r-w6b3", requirementId: "req-w6b3",
    repository: "example/fixture-repo", repositoryPath: e.rp,
    baseBranch: "feat/loop-runtime-v1", expectedBaseSha: e.baseSha,
    taskBranch, controlRoot: e.cr, createdAt: new Date().toISOString(),
  });
}

function mkRunner(e: Env) {
  return new LoopPosixProcessRunner({
    executables: [{ id: "git", executablePath: GP, allowDynamicArgs: true, stdinMode: "forbidden" }],
    allowedCwdRoots: [e.rp, e.cr],
    fixedEnv: { GIT_TERMINAL_PROMPT: "0", HOME: e.home, PATH: join(GP, ".."), LC_ALL: "C", LANG: "C" },
    allowedRequestEnvKeys: [], defaultTimeoutMs: 15000,
  });
}

// Commit `rel` (contents `body`) inside the attempt workspace.
function commitIn(ws: string, rel: string, body: string): void {
  const abs = join(ws, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body);
  execFileSync(GP, ["add", "-A"], { cwd: ws });
  execFileSync(GP, ["commit", "-m", `attempt touches ${rel}`], { cwd: ws });
}

async function main() {
  // ─── T1: promote — succeeded, everything in bounds ───────────────
  {
    const e = setupRepo();
    try {
      const mgr = new LoopGitWorkspaceManager({ runner: mkRunner(e), gitExecutableId: "git" });
      const id = mkId(e, "codex/w6b3-t1");
      const snap = await mgr.prepare(id);
      commitIn(snap.workspacePath, "src/a.ts", "export const a = 1;");
      const res = await mgr.cleanup(id, {
        expectedTaskHeadSha: commitHead(snap.workspacePath),
        outcome: "succeeded",
        allowedPaths: ["src"],
      });
      ok(res.decision === "promote", "T1: an in-bounds succeeded attempt is promoted");
      ok(res.worktreeRemoved, "T1: promote reclaims the worktree");
      ok(!res.evidenceRetained, "T1: promote retains no evidence");
      ok(res.outOfBoundsPaths.length === 0, "T1: nothing is out of bounds");
    } finally { rmSync(e.tr, { recursive: true, force: true }); }
  }

  // ─── T2: isolate — failed, evidence kept ─────────────────────────
  {
    const e = setupRepo();
    try {
      const mgr = new LoopGitWorkspaceManager({ runner: mkRunner(e), gitExecutableId: "git" });
      const id = mkId(e, "codex/w6b3-t2");
      const snap = await mgr.prepare(id);
      writeFileSync(join(snap.workspacePath, "partial.txt"), "half-done work");
      let res: Awaited<ReturnType<typeof mgr.cleanup>> | null = null;
      try {
        res = await mgr.cleanup(id, { expectedTaskHeadSha: snap.taskHeadSha, outcome: "failed" });
      } catch (e: any) {
        ok(false, `T2: isolate reports instead of throwing (${e?.code ?? "?"})`);
      }
      if (res !== null) {
        ok(res.decision === "isolate", "T2: a failed attempt is isolated, not discarded");
        ok(!res.worktreeRemoved, "T2: isolate does not remove the worktree");
        ok(res.evidenceRetained, "T2: isolate reports that evidence was retained");
        ok(existsSync(join(snap.workspacePath, "partial.txt")), "T2: the half-done file survives");
        ok(res.taskBranchRetained, "T2: the task branch is kept with it");
      }
    } finally { rmSync(e.tr, { recursive: true, force: true }); }
  }

  // ─── T3: block — unknown side effects ────────────────────────────
  {
    const e = setupRepo();
    try {
      const mgr = new LoopGitWorkspaceManager({ runner: mkRunner(e), gitExecutableId: "git" });
      const id = mkId(e, "codex/w6b3-t3");
      const snap = await mgr.prepare(id);
      await assertCode(
        () => mgr.cleanup(id, { expectedTaskHeadSha: snap.taskHeadSha, outcome: "unknown" }),
        "CLEANUP_BLOCKED", "T3: unknown side effects block",
      );
      ok(existsSync(snap.workspacePath), "T3: the workspace survives a block");
    } finally { rmSync(e.tr, { recursive: true, force: true }); }
  }

  // ─── T4: block — a COMMITTED out-of-bounds path ──────────────────
  {
    const e = setupRepo();
    try {
      const mgr = new LoopGitWorkspaceManager({ runner: mkRunner(e), gitExecutableId: "git" });
      const id = mkId(e, "codex/w6b3-t4");
      const snap = await mgr.prepare(id);
      commitIn(snap.workspacePath, "secret/b.ts", "// not a task path");
      await assertCode(
        () => mgr.cleanup(id, {
          expectedTaskHeadSha: commitHead(snap.workspacePath),
          outcome: "succeeded",
          allowedPaths: ["src"],
        }),
        "CLEANUP_BLOCKED", "T4: a committed out-of-bounds path blocks a claimed success",
      );
      ok(
        readFileSync(join(snap.workspacePath, "secret/b.ts"), "utf8") === "// not a task path",
        "T4: the out-of-bounds evidence is still readable",
      );
    } finally { rmSync(e.tr, { recursive: true, force: true }); }
  }

  // ─── T5: the classifier itself (no git involved) ─────────────────
  {
    const c = (outcome: any, changedPaths: string[], allowedPaths: string[] | null) =>
      classifyWorkspaceCleanup({ outcome, changedPaths, allowedPaths });
    ok(c("succeeded", [], null).decision === "promote", "T5: clean success promotes");
    ok(c("succeeded", ["src/a.ts"], ["src"]).decision === "promote", "T5: in-bounds change promotes");
    ok(c("failed", [], null).decision === "isolate", "T5: failure isolates");
    ok(c("failed", ["src/a.ts"], ["src"]).decision === "isolate", "T5: in-bounds failure still isolates");
    ok(c("unknown", [], null).decision === "block", "T5: unknown blocks");
    const oob = c("succeeded", ["secret/b.ts"], ["src"]);
    ok(oob.decision === "block", "T5: out-of-bounds blocks even when success is claimed");
    ok(oob.outOfBoundsPaths.length === 1 && oob.outOfBoundsPaths[0] === "secret/b.ts",
      "T5: the offending path is reported, not just the decision");
    ok(c("succeeded", ["srcfoo/a.ts"], ["src"]).decision === "block",
      "T5: a sibling directory sharing the prefix is out of bounds");
    ok(c("succeeded", ["src/a.ts"], ["src/a.ts"]).decision === "promote",
      "T5: an exact file entry is in bounds");
    ok(c("succeeded", ["secret/x", "src/y"], ["src"]).outOfBoundsPaths.length === 1,
      "T5: only the offending paths are reported");
  }

  // ─── T6: options are validated, not trusted ──────────────────────
  {
    const e = setupRepo();
    try {
      const mgr = new LoopGitWorkspaceManager({ runner: mkRunner(e), gitExecutableId: "git" });
      const id = mkId(e, "codex/w6b3-t6");
      const snap = await mgr.prepare(id);
      const head = snap.taskHeadSha;
      const bad: Array<[string, any]> = [
        ["outcome not in the enum", { outcome: "maybe" }],
        ["outcome not a string", { outcome: 123 }],
        ["allowedPaths not an array", { allowedPaths: "src" }],
        ["allowedPaths entry not a string", { allowedPaths: [123] }],
        ["allowedPaths entry absolute", { allowedPaths: ["/etc"] }],
        ["allowedPaths entry traverses up", { allowedPaths: ["../escape"] }],
        ["allowedPaths entry empty", { allowedPaths: [""] }],
        ["allowedPaths entry with a control char", { allowedPaths: ["src\u0000x"] }],
      ];
      for (const [label, extra] of bad) {
        await assertCode(
          () => mgr.cleanup(id, { expectedTaskHeadSha: head, ...extra }),
          "INVALID_INPUT", `T6: ${label}→INVALID_INPUT`,
        );
      }
    } finally { rmSync(e.tr, { recursive: true, force: true }); }
  }

  // ─── T7: the legacy path is untouched ────────────────────────────
  {
    const e = setupRepo();
    try {
      const mgr = new LoopGitWorkspaceManager({ runner: mkRunner(e), gitExecutableId: "git" });
      const id = mkId(e, "codex/w6b3-t7");
      const snap = await mgr.prepare(id);
      writeFileSync(join(snap.workspacePath, "d.txt"), "dirty");
      await assertCode(
        () => mgr.cleanup(id, { expectedTaskHeadSha: snap.taskHeadSha }),
        "WORKSPACE_DIRTY", "T7: with no outcome and no allowlist, dirty is still WORKSPACE_DIRTY",
      );
    } finally { rmSync(e.tr, { recursive: true, force: true }); }
  }

  // ─── T8: a block leaves the branch registered ────────────────────
  {
    const e = setupRepo();
    try {
      const mgr = new LoopGitWorkspaceManager({ runner: mkRunner(e), gitExecutableId: "git" });
      const id = mkId(e, "codex/w6b3-t8");
      const snap = await mgr.prepare(id);
      commitIn(snap.workspacePath, "secret/b.ts", "// evidence");
      await assertCode(
        () => mgr.cleanup(id, {
          expectedTaskHeadSha: commitHead(snap.workspacePath),
          outcome: "succeeded",
          allowedPaths: ["src"],
        }),
        "CLEANUP_BLOCKED", "T8: block again",
      );
      let branchAlive = true;
      try {
        execFileSync(GP, ["show-ref", "--verify", "--quiet", "refs/heads/codex/w6b3-t8"], { cwd: e.rp });
      } catch { branchAlive = false; }
      ok(branchAlive, "T8: the task branch is still registered after a block");
      const listed = execFileSync(GP, ["worktree", "list", "--porcelain"], { cwd: e.rp, encoding: "utf8" });
      ok(listed.includes(snap.workspacePath), "T8: the worktree is still registered after a block");
    } finally { rmSync(e.tr, { recursive: true, force: true }); }
  }

  console.log(`\nW6b3 attempt workspace: ${p} passed${f > 0 ? `, ${f} FAILED` : ""}`);
  if (f > 0) process.exitCode = 1;
}

function commitHead(ws: string): string {
  return execFileSync(GP, ["rev-parse", "HEAD"], { cwd: ws, encoding: "utf8" }).trim();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
