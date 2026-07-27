// LOOP POSIX Process Runner — Tests (LOOP-DELIVERY-02)
// ======================================================
// Tests: executable allowlist, spawn options, args, stdin, env, cwd,
// output drain, exit/errors, timeout/process-group, concurrency.
// Uses real Node.js child processes, no external CLI calls.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, chmodSync, readFileSync, existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

const childProcessMod = require("node:child_process") as typeof import("node:child_process");

import {
  LoopPosixProcessRunner,
  LoopPosixProcessRunnerError,
  type LoopPosixProcessRequest,
  type LoopPosixProcessResult,
} from "../core/loop-posix-process-runner";

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}
function expectThrow(code: string, fn: () => unknown, msg: string): void {
  try { fn(); assert(false, `${msg} (no error)`); }
  catch (e) {
    const actual = e instanceof LoopPosixProcessRunnerError ? e.code : "NOT_RUNNER_ERROR";
    assert(actual === code, `${msg} (got ${actual})`);
    if (e instanceof LoopPosixProcessRunnerError) {
      assert(e.message.length <= 256, `${msg}: msg bounded`);
      assert(!/[\x00-\x1f\x7f]/.test(e.message), `${msg}: no ctrls`);
    }
  }
}
async function expectThrowAsync(code: string, fn: () => Promise<unknown>, msg: string): Promise<void> {
  try { await fn(); assert(false, `${msg} (no error)`); }
  catch (e) {
    const actual = e instanceof LoopPosixProcessRunnerError ? e.code : "NOT_RUNNER_ERROR";
    assert(actual === code, `${msg} (got ${actual})`);
    if (e instanceof LoopPosixProcessRunnerError) {
      assert(e.message.length <= 256, `${msg}: msg bounded`);
      assert(!/[\x00-\x1f\x7f]/.test(e.message), `${msg}: no ctrls`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Fixtures
// ═══════════════════════════════════════════════════════════════

const nodeExe = require("node:fs").realpathSync(process.execPath);

function makeFixtureScript(script: string): string {
  // Script runs under node -e
  return script;
}

const HELLO_FIXTURE = `process.stdout.write("hello"); process.stderr.write("world"); process.exit(0);`;
const EXIT42_FIXTURE = `process.exit(42);`;
const STDOUT_BIG = `process.stdout.write("x".repeat(200000));`;
const STDERR_BIG = `process.stderr.write("y".repeat(50000));`;
const SIGTERM_HANDLER = `
process.on("SIGTERM", () => { process.stdout.write("TERMED"); process.exit(0); });
setTimeout(() => {}, 60000);
`;
const IGNORE_SIGTERM = `
process.on("SIGTERM", () => {});
setTimeout(() => {}, 60000);
`;
const GRANDCHILD_FIXTURE = `
const { spawn } = require("child_process");
const marker = process.argv[process.argv.indexOf("--") + 1];
const delay = parseInt(process.argv[process.argv.indexOf("--") + 2]);
// Use exec to run sleep + touch — the sleep process inherits our PGID
const gc = spawn("sh", ["-c", "sleep " + (delay/1000) + " && touch " + JSON.stringify(marker)], {
  stdio: "ignore"
});
gc.unref();
setTimeout(() => {}, 60000);
`;
const ECHO_STDIN = `const d = []; process.stdin.on("data", c => d.push(c)); process.stdin.on("end", () => process.stdout.write(Buffer.concat(d)));`;

function nodeRequest(o: Partial<LoopPosixProcessRequest> & Pick<LoopPosixProcessRequest, "cwd">): LoopPosixProcessRequest {
  return Object.freeze({
    executableId: o.executableId ?? "node",
    args: o.args ?? [],
    cwd: o.cwd,
    stdin: o.stdin,
    env: o.env,
    timeoutMs: o.timeoutMs,
    maxStdoutBytes: o.maxStdoutBytes,
    maxStderrBytes: o.maxStderrBytes,
  });
}

async function main(): Promise<void> {
  console.log("LOOP POSIX Process Runner Tests\n");

  const tempRoot = realpathSync(mkdtempSync(join(tmpdir(), "loop-d02-")));
  const cwd1 = join(tempRoot, "cwd1");
  const cwd2 = join(tempRoot, "cwd2");
  mkdirSync(cwd1, { recursive: true });
  mkdirSync(cwd2, { recursive: true });

  const runner = new LoopPosixProcessRunner({
    executables: [
      { id: "node", executablePath: nodeExe, allowDynamicArgs: true },
      { id: "node-no-args", executablePath: nodeExe, allowDynamicArgs: false, fixedArgs: ["-e", HELLO_FIXTURE, "--"] },
      { id: "echo-stdin", executablePath: nodeExe, allowDynamicArgs: true, fixedArgs: ["-e", ECHO_STDIN, "--"], stdinMode: "required" },
      { id: "no-stdin", executablePath: nodeExe, allowDynamicArgs: true, stdinMode: "forbidden" },
    ],
    allowedCwdRoots: [cwd1, cwd2],
    fixedEnv: { HOME: "/tmp", PATH: "/usr/bin:/bin" },
    allowedRequestEnvKeys: ["MY_VAR", "DEBUG"],
    defaultTimeoutMs: 30000,
  });

  try {
    // ═══════════════════════════════════════════════════════════
    // 1. Config & executable allowlist
    // ═══════════════════════════════════════════════════════════
    console.log("1. Config & allowlist");
    expectThrow("UNSUPPORTED_PLATFORM", () => {
      const orig = Object.getOwnPropertyDescriptor(process, "platform")!;
      try { Object.defineProperty(process, "platform", { value: "win32" }); new LoopPosixProcessRunner({ executables: [{ id: "x", executablePath: nodeExe }], allowedCwdRoots: [cwd1] }); }
      finally { Object.defineProperty(process, "platform", orig); }
    }, "unsupported platform");

    expectThrow("INVALID_INPUT", () => new LoopPosixProcessRunner({ executables: [], allowedCwdRoots: [cwd1] }), "empty executables");
    expectThrow("INVALID_INPUT", () => new LoopPosixProcessRunner({ executables: [{ id: "x", executablePath: nodeExe }, { id: "x", executablePath: nodeExe }], allowedCwdRoots: [cwd1] }), "duplicate id");
    expectThrow("EXECUTABLE_INVALID", () => new LoopPosixProcessRunner({ executables: [{ id: "rel", executablePath: "relative/path" }], allowedCwdRoots: [cwd1] }), "relative path");
    // unknown ID
    const rUnk = new LoopPosixProcessRunner({ executables: [{ id: "x", executablePath: nodeExe }], allowedCwdRoots: [cwd1] });
    await expectThrowAsync("EXECUTABLE_NOT_ALLOWED",
      () => rUnk.run(nodeRequest({ cwd: cwd1, args: ["-e", "1"], executableId: "unknown" })),
      "unknown id async");

    // symlink executable
    const symExe = join(tempRoot, "sym-exe");
    symlinkSync(nodeExe, symExe);
    expectThrow("EXECUTABLE_INVALID", () => new LoopPosixProcessRunner({ executables: [{ id: "s", executablePath: symExe }], allowedCwdRoots: [cwd1] }), "symlink rejected");
    rmSync(symExe);

    // ── 2. Spawn options ──
    console.log("2. Spawn options");
    {
      const origSpawn = childProcessMod.spawn;
      let captured: Record<string, unknown> | null = null;
      try {
        childProcessMod.spawn = function(cmd: string, args: readonly string[], opts: Record<string, unknown>) {
          captured = { command: cmd, args: [...args], shell: opts.shell, detached: opts.detached, stdio: opts.stdio, cwd: opts.cwd, envKeys: Object.keys(opts.env as object) };
          return origSpawn(cmd, args, opts);
        } as typeof childProcessMod.spawn;
        await runner.run(nodeRequest({ cwd: cwd1, args: ["-e", "1"] }));
        assert(captured !== null, "spawn called");
        assert(captured!.command === nodeExe, "command is canonical path");
        assert(captured!.shell === false, "shell:false");
        assert(captured!.detached === true, "detached:true");
        assert(JSON.stringify(captured!.stdio) === JSON.stringify(["pipe", "pipe", "pipe"]), "stdio pipes");
        assert(captured!.cwd === cwd1, "cwd correct");
        assert((captured!.envKeys as string[]).includes("HOME"), "env has HOME");
        assert(!(captured!.envKeys as string[]).includes("SHELL") || !process.env.SHELL, "no parent env sentinel");
      } finally { childProcessMod.spawn = origSpawn; }
    }

    // ── 3. Args ──
    console.log("3. Args");
    {
      const r = await runner.run(nodeRequest({ cwd: cwd1, args: ["-e", "process.stdout.write('a')"] }));
      assert(r.stdout === "a", "dynamic args work");
    }
    // Dynamic args disabled
    {
      const r2 = new LoopPosixProcessRunner({
        executables: [{ id: "nx", executablePath: nodeExe, allowDynamicArgs: false, fixedArgs: ["-e", "1"] }],
        allowedCwdRoots: [cwd1],
      });
      await expectThrowAsync("INVALID_INPUT",
        () => r2.run(nodeRequest({ cwd: cwd1, args: ["-e", "2"], executableId: "nx" })),
        "dynamic args rejected");
      const ok = await r2.run(nodeRequest({ cwd: cwd1, executableId: "nx" }));
      assert(ok.exitCode === 0, "fixed args only ok");
    }
    // Arg validations
    await expectThrowAsync("INVALID_INPUT",
      () => runner.run(nodeRequest({ cwd: cwd1, args: ["a\x00b"] })),
      "NUL rejected");
    await expectThrowAsync("INVALID_INPUT",
      () => runner.run(nodeRequest({ cwd: cwd1, args: ["x".repeat(5000)] })),
      "arg too long");

    // ── 4. stdin ──
    console.log("4. stdin");
    {
      const r = await runner.run(nodeRequest({ cwd: cwd1, executableId: "echo-stdin", stdin: "hello-stdin" }));
      assert(r.stdout === "hello-stdin", "stdin string roundtrip");
    }
    {
      const bin = new Uint8Array([0, 1, 2, 255]);
      const rb = await runner.run(nodeRequest({ cwd: cwd1, executableId: "echo-stdin", stdin: bin }));
      assert(rb.stdoutBytesReceived === 4, "binary stdin bytes received");
    }
    await expectThrowAsync("INVALID_INPUT",
      () => runner.run(nodeRequest({ cwd: cwd1, executableId: "no-stdin", stdin: "x" })),
      "stdin forbidden");
    await expectThrowAsync("INVALID_INPUT",
      () => runner.run(nodeRequest({ cwd: cwd1, executableId: "echo-stdin" })),
      "stdin required missing");

    // ── 5. Env ──
    console.log("5. Env");
    {
      const origSpawn = childProcessMod.spawn;
      let capturedEnv: Record<string, string> | null = null;
      try {
        childProcessMod.spawn = function(cmd: string, args: readonly string[], opts: Record<string, unknown>) {
          capturedEnv = opts.env as Record<string, string>;
          return origSpawn(cmd, args, opts);
        } as typeof childProcessMod.spawn;
        await runner.run(nodeRequest({ cwd: cwd1, args: ["-e", "1"], env: { MY_VAR: "val1" } }));
        assert(capturedEnv !== null, "env captured");
        assert(capturedEnv!.MY_VAR === "val1", "request env passed");
        assert(capturedEnv!.HOME === "/tmp", "fixed env present");
        assert(!("PATH" in capturedEnv!) || capturedEnv!.PATH === "/usr/bin:/bin", "PATH correct");
      } finally { childProcessMod.spawn = origSpawn; }
    }
    await expectThrowAsync("ENV_NOT_ALLOWED",
      () => runner.run(nodeRequest({ cwd: cwd1, args: ["-e", "1"], env: { BAD_KEY: "v" } })),
      "unapproved env key");
    await expectThrowAsync("ENV_NOT_ALLOWED",
      () => runner.run(nodeRequest({ cwd: cwd1, args: ["-e", "1"], env: { HOME: "override" } })),
      "override fixed env");

    // Dangerous env keys
    for (const dk of ["LD_PRELOAD", "ld_preload", "Ld_Preload"]) {
      const r3 = new LoopPosixProcessRunner({
        executables: [{ id: "nx", executablePath: nodeExe, allowDynamicArgs: true }],
        allowedCwdRoots: [cwd1],
        allowedRequestEnvKeys: [dk],
      });
      await expectThrowAsync("ENV_NOT_ALLOWED",
        () => r3.run(nodeRequest({ cwd: cwd1, args: ["-e", "1"], executableId: "nx", env: { [dk]: "x" } })),
        `dangerous env rejected: ${dk}`);
    }

    // ── 6. cwd ──
    console.log("6. cwd");
    {
      const r = await runner.run(nodeRequest({ cwd: cwd1, args: ["-e", "1"] }));
      assert(r.exitCode === 0, "cwd1 ok");
    }
    await expectThrowAsync("CWD_NOT_ALLOWED",
      () => { const d = join(tempRoot, "outside"); mkdirSync(d, { recursive: true }); return runner.run(nodeRequest({ cwd: d })); },
      "outside root");
    // symlink cwd
    const symCwd = join(tempRoot, "sym-cwd");
    symlinkSync(cwd1, symCwd);
    await expectThrowAsync("CWD_INVALID",
      () => runner.run(nodeRequest({ cwd: symCwd })),
      "symlink cwd rejected");
    rmSync(symCwd);
    expectThrow("INVALID_INPUT", () => new LoopPosixProcessRunner({ executables: [{ id: "x", executablePath: nodeExe }], allowedCwdRoots: ["/"] }), "/ as root rejected");

    // ── 7. Output ──
    console.log("7. Output");
    {
      const r = await runner.run(nodeRequest({ cwd: cwd1, args: ["-e", "process.stdout.write('hello'); process.stderr.write('world')"] }));
      assert(r.stdout === "hello", "stdout");
      assert(r.stderr === "world", "stderr");
      assert(r.stdoutBytesReceived === 5, "stdout bytes");
      assert(r.stderrBytesReceived === 5, "stderr bytes");
      assert(!r.stdoutTruncated, "not truncated");
    }
    // Bounded output
    {
      const r = await runner.run(nodeRequest({ cwd: cwd1, args: ["-e", STDOUT_BIG], maxStdoutBytes: 100, maxStderrBytes: 100 }));
      assert(r.stdoutTruncated, "stdout truncated");
      assert(r.stdout.length <= 100, `stdout bounded (got ${r.stdout.length})`);
    }

    // ── 8. Exit and errors ──
    console.log("8. Exit and errors");
    {
      const r = await runner.run(nodeRequest({ cwd: cwd1, args: ["-e", "process.exit(0)"] }));
      assert(r.status === "exited", "exit 0");
      assert(r.exitCode === 0, "code 0");
      assert(!r.termSignalSent, "no term");
    }
    {
      const r = await runner.run(nodeRequest({ cwd: cwd1, args: ["-e", "process.exit(42)"] }));
      assert(r.status === "exited", "non-zero exit is normal");
      assert(r.exitCode === 42, "code 42");
    }
    // spawn/executable failure
    {
      const missingExe = join(tempRoot, "missing-exe");
      writeFileSync(missingExe, "#!/bin/sh\necho x", { mode: 0o755 });
      const badRunner = new LoopPosixProcessRunner({
        executables: [{ id: "bad", executablePath: missingExe }],
        allowedCwdRoots: [cwd1],
      });
      rmSync(missingExe);
      await expectThrowAsync("EXECUTABLE_CHANGED",
        () => badRunner.run(nodeRequest({ cwd: cwd1, executableId: "bad" })),
        "deleted exe");
    }

    // ── 9. Timeout and process group ──
    console.log("9. Timeout/process-group");
    // Scenario 1: SIGTERM handler exits
    {
      const r = await runner.run(nodeRequest({ cwd: cwd1, args: ["-e", SIGTERM_HANDLER], timeoutMs: 2000 }));
      assert(r.status === "timed_out", "timed out");
      assert(r.termSignalSent, "term sent");
      assert(!r.killSignalSent, "no kill needed");
    }
    // Scenario 2: Ignore SIGTERM → SIGKILL
    {
      const r = await runner.run(nodeRequest({ cwd: cwd1, args: ["-e", IGNORE_SIGTERM], timeoutMs: 2000 }));
      assert(r.status === "timed_out", "timed out");
      assert(r.killSignalSent, "kill sent");
    }
    // Scenario 3: Grandchild cleanup
    {
      const marker = join(tempRoot, "gc-marker");
      // Grandchild (sleep then touch) writes marker after 5000ms. Timeout at 1500ms triggers cleanup.
      await runner.run(nodeRequest({ cwd: cwd1, args: ["-e", GRANDCHILD_FIXTURE, "--", marker, "5000"], timeoutMs: 1500 }));
      // Wait well past the grandchild's planned write time
      await new Promise(r => setTimeout(r, 2000));
      assert(!existsSync(marker), "grandchild marker not created (process group killed)");
    }

    // ── 10. Concurrency ──
    console.log("10. Concurrency");
    {
      const [r1, r2] = await Promise.all([
        runner.run(nodeRequest({ cwd: cwd1, args: ["-e", "process.stdout.write('AAA')"], env: { MY_VAR: "a" }, maxStdoutBytes: 10 })),
        runner.run(nodeRequest({ cwd: cwd2, args: ["-e", "setTimeout(() => process.stdout.write('BBB'), 500)"], env: { DEBUG: "1" }, maxStdoutBytes: 10 })),
      ]);
      assert(r1.stdout === "AAA", "concurrent 1 ok");
      assert(r2.stdout === "BBB", "concurrent 2 ok");
      assert(r1.exitCode === 0 && r2.exitCode === 0, "both exit 0");
    }

    // ── Result freezing ──
    console.log("Result freezing");
    {
      const r = await runner.run(nodeRequest({ cwd: cwd1, args: ["-e", "1"] }));
      assert(Object.isFrozen(r), "result frozen");
    }

  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
