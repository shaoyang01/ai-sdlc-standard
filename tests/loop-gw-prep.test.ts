// W-GW-PREP (P-B C1, Decision-079) — fresh-run worktree preparation.
// ============================================================================
// Before this wave the production door could never admit a FRESH requirement:
// runProduction's preflight (manager.inspect) only accepts an existing
// exact-ok task worktree, and nothing on the entry path ever called prepare —
// the deterministic drill proved the shape (prepare → inspect → full chain).
// This test pins that shape against a REAL temp git repository, end to end:
// frozen production request → prepare → preflight → deterministic chain to
// COMPLETED, plus the worktree-exists and no-hook fails-closed guarantees.
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LoopGitWorkspaceManager } from "../core/loop-git-workspace";
import { LoopPosixProcessRunner } from "../core/loop-posix-process-runner";
import { parseProductionEntryRequest } from "../core/loop-production-entry";
import { runProduction } from "../runtime";

let passed = 0;
function check(name: string, cond: boolean): void {
  if (!cond) throw new Error(`✗ ${name}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

async function main(): Promise<void> {
  // ── fixture: real git repo with a bare origin and remote-tracking ref ──
  const root = realpathSync(mkdtempSync(join(tmpdir(), "loop-gw-prep-")));
  const repo = join(root, "repo");
  const control = join(root, "control");
  const origin = join(root, "origin.git");
  mkdirSync(repo, { recursive: true });
  mkdirSync(control, { recursive: true });
  git(root, ["init", "-q", "--bare", origin]);
  git(repo, ["init", "-q", "-b", "main"]);
  git(repo, ["config", "user.email", "prep@example.com"]);
  git(repo, ["config", "user.name", "prep"]);
  writeFileSync(join(repo, "README.md"), "prep drill repo\n");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "-q", "-m", "prep base"]);
  git(repo, ["remote", "add", "origin", "git@github.com:local/prep-drill.git"]);
  git(repo, ["push", "-q", join(origin), "main"]);
  git(repo, ["update-ref", "refs/remotes/origin/main", git(repo, ["rev-parse", "HEAD"]).trim()]);
  const baseSha = git(repo, ["rev-parse", "HEAD"]).trim();

  const sourceFile = join(root, "normalized.md");
  writeFileSync(sourceFile, "# normalized requirement\n\nprep drill body\n");
  const runId = "run-20260901-prep-drill";
  const raw = {
    schema: "loop-production-entry:v1",
    requirementId: "20260901-prep-drill",
    repository: "local/prep-drill",
    repositoryPath: repo,
    baseBranch: "main",
    expectedBaseSha: baseSha,
    taskBranch: "runtime/20260901-prep-drill",
    controlRoot: control,
    sourceFiles: [sourceFile],
    bindingRegistryVersion: "1",
    executionProfileVersion: "1.0.0",
    mode: "real",
  };
  const parsed = parseProductionEntryRequest(raw, {
    now: () => new Date().toISOString(),
    runId,
  });

  const gitPath = "/usr/bin/git";
  const runner = new LoopPosixProcessRunner({
    executables: [{ id: "git", executablePath: gitPath, allowDynamicArgs: true, stdinMode: "optional" }],
    allowedCwdRoots: [parsed.identity.repositoryPath, parsed.identity.controlRoot],
    fixedEnv: {
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      PATH: join(gitPath, ".."),
      LC_ALL: "C",
      LANG: "C",
    },
    allowedRequestEnvKeys: [],
    defaultTimeoutMs: 15000,
  });
  const workspaceManager = new LoopGitWorkspaceManager({ runner, gitExecutableId: "git" });

  // ── no-hook: inspect alone refuses a fresh run (the pre-P-B gap, pinned) ──
  let gapCode = "none";
  try {
    await runProduction(parsed, "prep body", {
      capabilitySource: "deterministic",
      inspectWorkspace: (identity) => workspaceManager.inspect(identity),
    });
  } catch (error) {
    gapCode = (error as { code?: string }).code ?? "thrown";
  }
  check("without the prepare hook a fresh run still fails closed (WORKSPACE_NOT_FOUND)",
    gapCode === "WORKSPACE_NOT_FOUND");

  // ── with the prepare hook: fresh run prepares, inspects, and completes ──
  const result = await runProduction(parsed, "# normalized requirement\n\nprep drill body\n", {
    capabilitySource: "deterministic",
    inspectWorkspace: (identity) => workspaceManager.inspect(identity),
    prepareWorkspace: (identity) => workspaceManager.prepare(identity),
  });
  check("fresh production run completed", result.final_status === "success" && result.chain_status === "COMPLETED");
  check("all seven nodes executed",
    new Set(result.execution_trace.map((e) => e.capability)).size === 7);
  check("no blocking reason on completion", result.blocking_reason_code == null);
  check("manual handoff awaits the human (no remote Git side effects)",
    result.manual_handoff_status === "BLOCKED");
  check("task worktree exists under controlRoot", existsSync(result.workspace_root ?? ""));

  // ── resume-facing property: a second preflight over the prepared workspace
  //    passes WITHOUT prepare (the workspace is exact-ok now) ──
  const second = await workspaceManager.inspect(parsed.identity);
  check("second inspect sees a stable, undrifted workspace",
    second.baseDrifted === false && second.taskHasChanges === false);

  console.log(`\nResults: ${passed} passed, 0 failed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
