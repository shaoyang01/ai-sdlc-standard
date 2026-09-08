// loop-run CLI — closed argv contract tests (C03-E W3, E1-T3).
// The parser is pure and carries no shell/exec surface; these fuzz its closed
// flag set and prove injected-looking values stay inert string data.

import { parseLoopRunArgs, LoopRunCliError } from "../scripts/loop-run";

let passed = 0;
function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  passed += 1;
}

function expectCliError(argv: readonly string[], code: string, msg: string): void {
  let caught: unknown;
  try {
    parseLoopRunArgs(argv);
  } catch (error) {
    caught = error;
  }
  ok(caught instanceof LoopRunCliError && caught.code === code, msg);
}

function main(): void {
  // Happy paths.
  const a = parseLoopRunArgs(["--request-file", "/tmp/req.json"]);
  ok(!a.help && a.requestFile === "/tmp/req.json" && a.resumeRunId === null && a.capabilitySource === "deterministic",
    "minimal args default to deterministic");

  const full = parseLoopRunArgs([
    "--request-file", "/tmp/req.json", "--resume", "run-w3-001", "--capability-source", "real",
  ]);
  ok(full.resumeRunId === "run-w3-001" && full.capabilitySource === "real",
    "parser accepts real as a value (the production DOOR, not the parser, refuses it)");

  const help = parseLoopRunArgs(["--help"]);
  ok(help.help && help.requestFile === null, "--help needs no request file");

  // Closed flag set.
  expectCliError(["--evil", "x"], "UNKNOWN_FLAG", "unknown flag rejected");
  expectCliError(["--requestFile", "/x"], "UNKNOWN_FLAG", "misspelled flag rejected");
  expectCliError(["/bare/positional.json"], "POSITIONAL_NOT_ALLOWED", "bare positional arg rejected");
  expectCliError(["--request-file"], "MISSING_VALUE", "trailing flag without value rejected");
  expectCliError(["--request-file", "--resume", "r"], "MISSING_VALUE", "flag whose value is another flag rejected");
  expectCliError(["--request-file", "/a", "--request-file", "/b"], "DUPLICATE_FLAG", "duplicate flag rejected");
  expectCliError(["--capability-source", "bogus"], "INVALID_CAPABILITY_SOURCE", "bad source value rejected");
  expectCliError([], "MISSING_REQUEST_FILE", "no args and no --help is rejected");
  expectCliError(["--resume", "r"], "MISSING_REQUEST_FILE", "--resume alone still needs --request-file");

  // Injection-shaped VALUES stay inert data — the parser never executes them.
  const injected = parseLoopRunArgs(["--request-file", "; rm -rf / && echo $TOKEN"]);
  ok(injected.requestFile === "; rm -rf / && echo $TOKEN", "shell-like value is treated as inert string data, never executed");
  const envLike = parseLoopRunArgs(["--request-file", "/r.json", "--resume", "$(curl evil)"]);
  ok(envLike.resumeRunId === "$(curl evil)", "command-substitution-like resume value stays inert data");

  console.log(`loop-run-cli: ${passed} passed`);
}

main();
