// loop-run --from-intake — entry trigger CLI tests (Decision-078, design §4).
// ============================================================================
// A) argv contract (pure): request-file XOR from-intake; --prepare-only
//    requires --from-intake; neither source is a missing-flag error.
// B) prepare-only end-to-end against a REAL temp git repository: a confirmed
//    manifest freezes the entry request with expectedBaseSha resolved by the
//    CLI itself (never hand-crafted), while a draft manifest is refused at the
//    human confirmation gate.
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseLoopRunArgs, LoopRunCliError } from "../scripts/loop-run";

let passed = 0;
function check(name: string, cond: boolean): void {
  if (!cond) throw new Error(`✗ ${name}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function codeOf(argv: string[]): string {
  try {
    parseLoopRunArgs(argv);
  } catch (error) {
    if (error instanceof LoopRunCliError) return error.code;
    throw error;
  }
  throw new Error("expected LoopRunCliError");
}

function manifestBody(repo: string, control: string, sources: string[], status: string): string {
  return JSON.stringify({
    schema: "loop-intake-manifest:v1",
    status,
    requirementId: "20260901-drill-intake",
    changeClass: "new",
    sourceType: "conversation",
    sourceFiles: sources,
    repository: "local/drill",
    repositoryPath: repo,
    baseBranch: "main",
    taskBranch: "runtime/20260901-drill-intake",
    controlRoot: control,
    confirmedAt: "2026-09-01T08:00:00Z",
    confirmedBy: "current-user",
  }, null, 2) + "\n";
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function main(): void {
  // ── A. argv contract ──
  check("request-file + from-intake conflict",
    codeOf(["--request-file", "/a.json", "--from-intake", "/b"]) === "FLAG_CONFLICT");
  check("prepare-only without from-intake rejected",
    codeOf(["--prepare-only", "--request-file", "/a.json"]) === "PREPARE_ONLY_WITHOUT_INTAKE");
  check("no request source rejected",
    codeOf(["--resume", "run-x"]) === "MISSING_REQUEST_FILE");
  check("from-intake + prepare-only parses",
    parseLoopRunArgs(["--from-intake", "/intake", "--prepare-only"]).prepareOnly === true);
  check("from-intake alone parses",
    parseLoopRunArgs(["--from-intake", "/intake"]).fromIntake === "/intake");

  // ── B. prepare-only end-to-end on a real temp git repository ──
  // macOS /var/folders is a symlink: the runner demands canonical cwd roots,
  // so the fixture resolves the temp root to its real path up front.
  const root = realpathSync(mkdtempSync(join(tmpdir(), "loop-run-intake-")));
  const repo = join(root, "repo");
  const control = join(root, "control");
  const intakeDir = join(root, "library", "20260901-drill-intake", "00-需求资料");
  mkdirSync(repo, { recursive: true });
  mkdirSync(control, { recursive: true });
  mkdirSync(intakeDir, { recursive: true });

  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.email", "drill@example.com"]);
  git(repo, ["config", "user.name", "drill"]);
  writeFileSync(join(repo, "README.md"), "drill repo\n");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "-q", "-m", "drill base"]);
  const headSha = git(repo, ["rev-parse", "HEAD"]).trim();

  const sourceFile = join(intakeDir, "normalized.md");
  writeFileSync(sourceFile, "# normalized requirement\n\nfix the drill thing.\n");
  const manifestPath = join(intakeDir, "intake.manifest.json");
  writeFileSync(manifestPath, manifestBody(repo, control, [sourceFile], "draft"));

  const tsx = (args: string[]): { stdout: string; stderr: string; status: number } => {
    try {
      const stdout = execFileSync("node_modules/.bin/tsx", ["scripts/loop-run.ts", ...args], { encoding: "utf8" });
      return { stdout, stderr: "", status: 0 };
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string; status?: number };
      return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", status: e.status ?? 1 };
    }
  };

  // Draft manifest → human confirmation gate refuses BEFORE any git probing.
  const draft = tsx(["--from-intake", intakeDir, "--prepare-only"]);
  check("draft manifest refused at the human gate", draft.status === 1);
  check("refusal is INTAKE_NOT_CONFIRMED", draft.stderr.includes("INTAKE_NOT_CONFIRMED"));

  // Confirmed manifest → prepare-only freezes the request and stops.
  writeFileSync(manifestPath, manifestBody(repo, control, [sourceFile], "confirmed"));
  const ok = tsx(["--from-intake", intakeDir, "--prepare-only"]);
  check("confirmed manifest prepares", ok.status === 0);
  const m = /LOOP_RUN_PREPARED (\{.*\})/.exec(ok.stdout);
  check("closed LOOP_RUN_PREPARED line printed", m !== null);
  const receipt = JSON.parse(m![1]!) as {
    request_path: string;
    requirement_id: string;
    expected_base_sha: string;
    source_files_count: number;
  };
  check("receipt names the right requirement", receipt.requirement_id === "20260901-drill-intake");
  check("expectedBaseSha resolved by the CLI equals git HEAD",
    receipt.expected_base_sha === headSha);
  check("receipt counts the source files", receipt.source_files_count === 1);
  check("frozen request file exists on the audit path", existsSync(receipt.request_path));
  const frozen = JSON.parse(readFileSync(receipt.request_path, "utf8")) as Record<string, unknown>;
  check("frozen request is a loop-production-entry:v1 real-mode request",
    frozen["schema"] === "loop-production-entry:v1" && frozen["mode"] === "real");
  check("frozen request carries the resolved base SHA", frozen["expectedBaseSha"] === headSha);
  check("frozen request carries the manifest's source files",
    JSON.stringify(frozen["sourceFiles"]) === JSON.stringify([sourceFile]));

  // Directory-or-file: passing the manifest FILE directly works too.
  const byFile = tsx(["--from-intake", manifestPath, "--prepare-only"]);
  check("manifest file path (not dir) also works", byFile.status === 0);

  // Passing a manifest whose repository does not exist fails closed on the SHA.
  const badRepo = join(root, "library", "20260901-drill-intake", "bad.repo");
  writeFileSync(join(root, "library", "20260901-drill-intake", "bad.manifest.json"),
    manifestBody(badRepo, control, [sourceFile], "confirmed"));
  const bad = tsx(["--from-intake", join(root, "library", "20260901-drill-intake", "bad.manifest.json"), "--prepare-only"]);
  check("unresolvable repository HEAD fails closed", bad.status === 1);
  check("failure is BASE_SHA_RESOLVE_FAILED", bad.stderr.includes("BASE_SHA_RESOLVE_FAILED"));

  console.log(`\nResults: ${passed} passed, 0 failed`);
}

main();
