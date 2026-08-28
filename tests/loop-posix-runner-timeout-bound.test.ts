// LOOP POSIX Runner — C03-E E2 per-attempt timeout ceiling (plan §9, Q4)
// ========================================================
// The implementation-attempt bound is 30 min (1800000 ms). The runner must
// accept it at construction and reject anything above, while its conservative
// default is unchanged. No long wait is performed — only option validation.
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  LoopPosixProcessRunner,
  LoopPosixProcessRunnerError,
} from "../core/loop-posix-process-runner";

let p = 0,
  f = 0;
function ok(c: boolean, m: string): void {
  if (c) {
    p++;
    console.log(`  ✓ ${m}`);
  } else {
    f++;
    console.error(`  ✗ ${m}`);
  }
}

function makeRunner(defaultTimeoutMs: number | undefined): void {
  new LoopPosixProcessRunner({
    executables: [{ id: "node", executablePath: realpathSync(process.execPath) }],
    allowedCwdRoots: [realpathSync(tmpdir())],
    ...(defaultTimeoutMs === undefined ? {} : { defaultTimeoutMs }),
  });
}

function main(): void {
  // 1800000 (30 min implementation attempt) is accepted.
  let accepted = true;
  try {
    makeRunner(1800000);
  } catch (e) {
    accepted = false;
    console.error(String(e));
  }
  ok(accepted, "defaultTimeoutMs=1800000 (30min) accepted");

  // 600000 (old ceiling) still accepted.
  let oldOk = true;
  try {
    makeRunner(600000);
  } catch {
    oldOk = false;
  }
  ok(oldOk, "defaultTimeoutMs=600000 still accepted");

  // Anything above 30 min is rejected fail-closed at construction.
  let code = "NONE";
  try {
    makeRunner(1800001);
  } catch (e) {
    code = e instanceof LoopPosixProcessRunnerError ? e.code : "OTHER";
  }
  ok(code === "INVALID_INPUT", `defaultTimeoutMs=1800001 rejected (got ${code})`);

  // Below minimum rejected.
  let lowCode = "NONE";
  try {
    makeRunner(99);
  } catch (e) {
    lowCode = e instanceof LoopPosixProcessRunnerError ? e.code : "OTHER";
  }
  ok(lowCode === "INVALID_INPUT", `defaultTimeoutMs=99 rejected (got ${lowCode})`);

  // Default (omitted) still constructs — conservative default unchanged.
  let defOk = true;
  try {
    makeRunner(undefined);
  } catch {
    defOk = false;
  }
  ok(defOk, "omitted defaultTimeoutMs uses conservative default");

  console.log(`\nResults: ${p} passed, ${f} failed`);
  if (f > 0) process.exit(1);
}

main();
