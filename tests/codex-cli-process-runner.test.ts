// Codex CLI Process Runner Test
// ==============================
// Verifies the isolated Codex CLI process runner with fake spawn only.
// Does NOT invoke the real Codex binary. No network or filesystem writes.

import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { createCodexCliProcessRunner } from "../execution/codex-cli-process-runner";

interface MockChildProcess extends EventEmitter {
  stdin: {
    write: (data: string) => void;
    end: () => void;
  };
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: () => void;
}

function asSpawnFn(fn: (...args: any[]) => any): typeof spawn {
  return fn as unknown as typeof spawn;
}

function createFakeSpawn(opts: {
  onSpawn?: (child: MockChildProcess) => void;
  behavior?: "close" | "error";
  exitCode?: number;
  error?: Error;
  delayMs?: number;
  stdoutData?: string | Buffer;
  stderrData?: string | Buffer;
} = {}) {
  return (
    command: string,
    args: readonly string[],
    spawnOptions: { shell?: boolean } & Record<string, unknown>
  ) => {
    const child = new EventEmitter() as MockChildProcess;
    child.stdin = {
      write: () => {},
      end: () => {},
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};

    if (opts.onSpawn) {
      opts.onSpawn(child);
    }

    const run = () => {
      if (opts.behavior === "error" && opts.error) {
        child.emit("error", opts.error);
        return;
      }

      const stdoutData =
        opts.stdoutData ??
        "```codex-code-patch\nFILE: src/generated.ts\nPATCH:\n// generated\n```";
      const stderrData = opts.stderrData ?? "stderr output";
      child.stdout.emit("data", Buffer.from(stdoutData));
      child.stderr.emit("data", Buffer.from(stderrData));
      child.emit("close", opts.exitCode ?? 0);
    };

    if (opts.delayMs) {
      setTimeout(run, opts.delayMs);
    } else {
      setImmediate(run);
    }

    return child as any;
  };
}

async function test() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      passed++;
      console.log(`  ✓ ${message}`);
    } else {
      failed++;
      console.error(`  ✗ ${message}`);
    }
  }

  console.log("Codex CLI Process Runner Test\n");

  const workingDirectory = "/tmp/codex-test-wd";
  const prompt = "generate a patch";

  // ── Test 1: Command defaults to codex ──
  console.log("Test 1: Command defaults to codex");
  let capturedCommand = "";
  let capturedArgs: string[] = [];
  let capturedOptions: Record<string, unknown> = {};
  let capturedStdin = "";

  const fakeSpawn1 = createFakeSpawn({
    onSpawn: (child) => {
      child.stdin.write = (data: string) => {
        capturedStdin += data;
      };
    },
  });
  const originalSpawn1 = fakeSpawn1;
  const runner1 = createCodexCliProcessRunner({
    workingDirectory,
    spawnFn: asSpawnFn((command: string, args: readonly string[], options: any) => {
      capturedCommand = command;
      capturedArgs = [...args];
      capturedOptions = options;
      return originalSpawn1(command, args, options);
    }),
  });
  await runner1.run(prompt);
  assert(capturedCommand === "codex", "default command is codex");
  console.log("");

  // ── Test 2: Args use codex exec ──
  console.log("Test 2: Args use codex exec");
  assert(capturedArgs[0] === "exec", "first arg is exec");
  assert(capturedArgs.includes("--ephemeral"), "args include --ephemeral");
  assert(capturedArgs.includes("--sandbox"), "args include --sandbox");
  const sandboxIndex = capturedArgs.indexOf("--sandbox");
  assert(capturedArgs[sandboxIndex + 1] === "read-only", "--sandbox is followed by read-only");
  const cdIndex = capturedArgs.indexOf("--cd");
  assert(cdIndex !== -1, "args include --cd");
  assert(capturedArgs[cdIndex + 1] === workingDirectory, "--cd receives working directory");
  assert(capturedArgs[capturedArgs.length - 1] === "-", "last arg is stdin marker -");
  console.log("");

  // ── Test 3: shell is false ──
  console.log("Test 3: shell is false");
  assert(capturedOptions.shell === false, "shell option is false");
  console.log("");

  // ── Test 4: Prompt written through stdin and stdin closed ──
  console.log("Test 4: Prompt written through stdin");
  assert(capturedStdin === prompt, "prompt written to stdin");
  console.log("");

  // ── Test 5: Successful execution returns bounded output ──
  console.log("Test 5: Successful execution returns bounded output");
  const runner5 = createCodexCliProcessRunner({
    workingDirectory,
    spawnFn: asSpawnFn(createFakeSpawn({ exitCode: 0 })),
  });
  const result5 = await runner5.run(prompt);
  assert(result5.exitCode === 0, "exitCode is 0");
  assert(result5.stdout.includes("FILE: src/generated.ts"), "stdout captured");
  assert(result5.stderr === "stderr output", "stderr captured");
  assert(typeof result5.durationMs === "number", "durationMs is number");
  assert(result5.durationMs >= 0, "durationMs is non-negative");
  console.log("");

  // ── Test 6: Timeout kills child and rejects with timeout error ──
  console.log("Test 6: Timeout kills child");
  let killed = false;
  const runner6 = createCodexCliProcessRunner({
    workingDirectory,
    timeoutMs: 50,
    spawnFn: asSpawnFn(createFakeSpawn({
      delayMs: 200,
      onSpawn: (child) => {
        child.kill = () => {
          killed = true;
        };
      },
    })),
  });
  try {
    await runner6.run(prompt);
    assert(false, "timeout should reject");
  } catch (error) {
    assert(error instanceof Error, "timeout rejects with Error");
    assert((error as Error).message.toLowerCase().includes("timed out"), "timeout error message mentions timeout");
    assert(killed, "child was killed on timeout");
  }
  console.log("");

  // ── Test 7: ENOENT is propagated ──
  console.log("Test 7: ENOENT is propagated");
  const runner7 = createCodexCliProcessRunner({
    workingDirectory,
    spawnFn: asSpawnFn(createFakeSpawn({
      behavior: "error",
      error: new Error("spawn codex ENOENT"),
    })),
  });
  try {
    await runner7.run(prompt);
    assert(false, "ENOENT should reject");
  } catch (error) {
    assert(error instanceof Error, "ENOENT rejects with Error");
    assert((error as Error).message.includes("ENOENT"), "ENOENT error message preserved");
  }
  console.log("");

  // ── Test 8: Oversized stdout is bounded ──
  console.log("Test 8: Oversized stdout is bounded");
  const oversizedStdout = "x".repeat(100_000);
  const runner8 = createCodexCliProcessRunner({
    workingDirectory,
    maxStdoutChars: 5000,
    spawnFn: asSpawnFn(createFakeSpawn({ stdoutData: oversizedStdout })),
  });
  const result8 = await runner8.run(prompt);
  assert(result8.stdout.length <= 5000, "stdout is bounded to maxStdoutChars");
  assert(result8.stdout.length > 0, "stdout is not empty");
  assert(result8.stdoutTruncated === true, "stdoutTruncated is true when stdout exceeded limit");
  console.log("");

  // ── Test 9: Oversized stderr is bounded ──
  console.log("Test 9: Oversized stderr is bounded");
  const oversizedStderr = "e".repeat(100_000);
  const runner9 = createCodexCliProcessRunner({
    workingDirectory,
    maxStderrChars: 3000,
    spawnFn: asSpawnFn(createFakeSpawn({ stderrData: oversizedStderr })),
  });
  const result9 = await runner9.run(prompt);
  assert(result9.stderr.length <= 3000, "stderr is bounded to maxStderrChars");
  assert(result9.stderrTruncated === true, "stderrTruncated is true when stderr exceeded limit");
  console.log("");

  // ── Test 10: Oversized stdout still large enough for output_too_large classification ──
  console.log("Test 10: Bounded stdout still exceeds parser output limit");
  const runner10 = createCodexCliProcessRunner({
    workingDirectory,
    maxStdoutChars: 70_000,
    spawnFn: asSpawnFn(createFakeSpawn({ stdoutData: "x".repeat(100_000) })),
  });
  const result10 = await runner10.run(prompt);
  assert(result10.stdout.length === 70_000, "stdout bounded to configured max");
  assert(result10.stdout.length > 64_000, "bounded stdout exceeds default parser maxStdoutChars");
  assert(result10.stdoutTruncated === true, "stdoutTruncated is true when bounded above parser limit");
  console.log("");

  // ── Test 10b: Default stdout limit detects output_too_large ──
  console.log("Test 10b: Default stdout limit detects oversized output");
  const runner10b = createCodexCliProcessRunner({
    workingDirectory,
    spawnFn: asSpawnFn(createFakeSpawn({ stdoutData: "x".repeat(100_000) })),
  });
  const result10b = await runner10b.run(prompt);
  assert(result10b.stdout.length === 64_000, "stdout bounded to default maxStdoutChars");
  assert(result10b.stdoutTruncated === true, "stdoutTruncated is true with default limit and oversized output");
  console.log("");

  // ── Test 11: No real Codex CLI invoked ──
  console.log("Test 11: No real Codex CLI invoked");
  let spawnCalled = false;
  const runner11 = createCodexCliProcessRunner({
    workingDirectory,
    spawnFn: asSpawnFn((_command: string, _args: readonly string[], _options: any) => {
      spawnCalled = true;
      return createFakeSpawn()(_command, _args, _options);
    }),
  });
  await runner11.run(prompt);
  assert(spawnCalled, "spawnFn was called");
  console.log("");

  // ── Test 12: Static import isolation ──
  console.log("Test 12: child_process import isolation");
  const fs = await import("node:fs");
  const path = await import("node:path");
  const runnerSource = fs.readFileSync(
    path.join(process.cwd(), "execution", "codex-cli-process-runner.ts"),
    "utf-8"
  );
  const realDispatchSource = fs.readFileSync(
    path.join(process.cwd(), "execution", "codex-real-dispatch-real-runner.ts"),
    "utf-8"
  );
  assert(
    runnerSource.includes('from "node:child_process"') ||
      runnerSource.includes('from "child_process"') ||
      runnerSource.includes('require("node:child_process")') ||
      runnerSource.includes('require("child_process")'),
    "process runner imports child_process"
  );
  assert(
    !(
      realDispatchSource.includes('from "node:child_process"') ||
      realDispatchSource.includes('from "child_process"') ||
      realDispatchSource.includes('require("node:child_process")') ||
      realDispatchSource.includes('require("child_process")')
    ),
    "real dispatch runner does not import child_process"
  );
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
