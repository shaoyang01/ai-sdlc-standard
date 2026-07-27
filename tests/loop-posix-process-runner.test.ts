// LOOP POSIX Process Runner — R1 Hardening Tests
// ===============================================

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, chmodSync, existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const childProcessMod = require("node:child_process") as typeof import("node:child_process");

import {
  LoopPosixProcessRunner, LoopPosixProcessRunnerError,
  type LoopPosixProcessRequest, type LoopPosixProcessResult,
} from "../core/loop-posix-process-runner";

let passed = 0, failed = 0;
function ok(c: boolean, m: string): void { if (c) { passed++; console.log(`  ✓ ${m}`); } else { failed++; console.error(`  ✗ ${m}`); } }
async function expectThrowAsync(code: string, fn: () => Promise<unknown>, msg: string): Promise<void> {
  try { await fn(); ok(false, `${msg} (no error)`); } catch (e) {
    const a = e instanceof LoopPosixProcessRunnerError ? e.code : "NOT_RUNNER_ERROR";
    ok(a === code, `${msg} (got ${a})`);
    if (e instanceof LoopPosixProcessRunnerError) {
      ok(e.message.length <= 256, `${msg}: bounded`);
      ok(!/[\x00-\x1f\x7f]/.test(e.message), `${msg}: no ctrls`);
    }
  }
}

const nodeExe = realpathSync(process.execPath);

// ═══════════════════════════════════════════════════════════════
// Fixtures
// ═══════════════════════════════════════════════════════════════

const BASE64_PAYLOAD = `const p=JSON.parse(Buffer.from(process.argv.pop(),"base64").toString());`;

const DIRECT_CHILD = BASE64_PAYLOAD + `
const{spawn}=require("child_process");
const gc=spawn(process.execPath,["-e",\`${BASE64_PAYLOAD}setTimeout(()=>{require('fs').writeFileSync(p.marker,'x')},p.delay)\`,Buffer.from(JSON.stringify(p)).toString("base64")],{stdio:"ignore"});
gc.unref();
process.stdout.write("GRANDCHILD_READY\\n");
setTimeout(()=>{},60000);
`;

function mkReq(o: Partial<LoopPosixProcessRequest> & Pick<LoopPosixProcessRequest,"cwd">): LoopPosixProcessRequest {
  return Object.freeze({ executableId: o.executableId ?? "node", args: o.args ?? [], cwd: o.cwd, stdin: o.stdin, env: o.env, timeoutMs: o.timeoutMs, maxStdoutBytes: o.maxStdoutBytes, maxStderrBytes: o.maxStderrBytes });
}

async function main(): Promise<void> {
  console.log("LOOP POSIX Process Runner — R1 Tests\n");
  const tempRoot = realpathSync(mkdtempSync(join(tmpdir(),"loop-d02r1-")));
  const cwd1 = join(tempRoot,"cwd1"); mkdirSync(cwd1,{recursive:true});
  const cwd2 = join(tempRoot,"cwd2"); mkdirSync(cwd2,{recursive:true});

  const runner = new LoopPosixProcessRunner({
    executables: [
      { id:"node", executablePath: nodeExe, allowDynamicArgs: true },
      { id:"node-fixed", executablePath: nodeExe, allowDynamicArgs: false, fixedArgs: ["-e","1"] },
      { id:"echo-stdin", executablePath: nodeExe, allowDynamicArgs: true, fixedArgs: ["-e",`const d=[];process.stdin.on("data",c=>d.push(c));process.stdin.on("end",()=>process.stdout.write(Buffer.concat(d)))`], stdinMode:"required" },
      { id:"no-stdin", executablePath: nodeExe, allowDynamicArgs: true, stdinMode:"forbidden" },
    ],
    allowedCwdRoots: [cwd1, cwd2],
    fixedEnv: { HOME:"/tmp", PATH:"/usr/bin:/bin" },
    allowedRequestEnvKeys: ["MY_VAR","DEBUG"],
  });

  try {
    // ═══════════════════════════════════════════════════════
    // 1. Deterministic grandchild cleanup
    // ═══════════════════════════════════════════════════════
    console.log("1. Grandchild cleanup");
    {
      const marker = join(tempRoot,"gc-marker");
      const payload = JSON.stringify({ marker, delay: 1200 });
      const payloadB64 = Buffer.from(payload).toString("base64");
      const r = await runner.run(mkReq({ cwd: cwd1, args: ["-e", DIRECT_CHILD, payloadB64], timeoutMs: 400, maxStdoutBytes: 100 }));
      ok(r.stdout.includes("GRANDCHILD_READY"), "grandchild ready seen");
      ok(r.status === "timed_out", "timed out");
      ok(r.termSignalSent, "term sent");
      await new Promise(res => setTimeout(res, 1500));
      ok(!existsSync(marker), "marker not created");
    }

    // ═══════════════════════════════════════════════════════
    // 2. Runtime input validation
    // ═══════════════════════════════════════════════════════
    console.log("2. Input validation");
    try { new LoopPosixProcessRunner(null as never); ok(false,"null options"); }
    catch (e) { ok((e as LoopPosixProcessRunnerError).code === "INVALID_INPUT", "null options → INVALID_INPUT"); }
    try { new LoopPosixProcessRunner({ executables: "x" as never, allowedCwdRoots: [cwd1] }); ok(false,"exes not array"); }
    catch (e) { ok((e as LoopPosixProcessRunnerError).code === "INVALID_INPUT", "exes not array → INVALID_INPUT"); }
    expectThrowAsync("INVALID_INPUT", () => runner.run(null as never), "null request");
    expectThrowAsync("INVALID_INPUT", () => runner.run({ executableId: "node", args: "not-array" as never, cwd: cwd1 }), "args not array");
    // allowed env keys validate dangerous at construction
    try { new LoopPosixProcessRunner({ executables:[{id:"x",executablePath:nodeExe}], allowedCwdRoots:[cwd1], allowedRequestEnvKeys:["LD_PRELOAD"] }); ok(false,"should throw"); }
    catch (e) { ok((e as LoopPosixProcessRunnerError).code === "ENV_NOT_ALLOWED", "dangerous allowed key rejected at construction"); }
    try { new LoopPosixProcessRunner({ executables:[{id:"x",executablePath:nodeExe}], allowedCwdRoots:[cwd1], allowedRequestEnvKeys:["dup","dup"] }); ok(false,"should throw"); }
    catch (e) { ok((e as LoopPosixProcessRunnerError).code === "INVALID_INPUT", "duplicate allowed key"); }

    // ═══════════════════════════════════════════════════════
    // 3. Executable permission mode pinning
    // ═══════════════════════════════════════════════════════
    console.log("3. Mode pinning");
    {
      const fx = join(tempRoot,"mode-fx.js");
      writeFileSync(fx, "#!/usr/bin/env node\nprocess.exit(0)", { mode: 0o700 });
      const r2 = new LoopPosixProcessRunner({ executables:[{id:"mx",executablePath:fx,allowDynamicArgs:true}], allowedCwdRoots:[cwd1] });
      await r2.run(mkReq({cwd:cwd1,executableId:"mx"})); // works
      chmodSync(fx, 0o755);
      await expectThrowAsync("EXECUTABLE_CHANGED", () => r2.run(mkReq({cwd:cwd1,executableId:"mx"})), "mode change detected");
    }

    // ═══════════════════════════════════════════════════════
    // 4. Copied bounded collector
    // ═══════════════════════════════════════════════════════
    console.log("4. Copied collector");
    {
      const bigChunk = Buffer.alloc(32 * 1024 * 1024, 65); // 32 MiB of 'A'
      const r = await runner.run(mkReq({ cwd: cwd1, args: ["-e", `process.stdout.write(Buffer.alloc(32*1024*1024,65).toString())`], maxStdoutBytes: 10, maxStderrBytes: 10 }));
      ok(r.stdoutTruncated, "truncated");
      ok(r.stdout.length <= 10, `bounded (${r.stdout.length})`);
      ok(r.stdoutBytesReceived === 32*1024*1024, "bytes received correct");
    }

    // ═══════════════════════════════════════════════════════
    // 5. Basic execution (smoke)
    // ═══════════════════════════════════════════════════════
    console.log("5. Basic smoke");
    {
      const r = await runner.run(mkReq({ cwd: cwd1, args: ["-e","1"] }));
      ok(r.status === "exited", "exit 0");
      ok(r.exitCode === 0, "code 0");
      ok(Object.isFrozen(r), "frozen");
    }
    {
      const r = await runner.run(mkReq({ cwd: cwd1, args: ["-e","process.exit(42)"] }));
      ok(r.status === "exited", "non-zero exit normal");
      ok(r.exitCode === 42, "code 42");
    }

    // ═══════════════════════════════════════════════════════
    // 6. Spawn options
    // ═══════════════════════════════════════════════════════
    console.log("6. Spawn options");
    {
      const orig = childProcessMod.spawn;
      let cap: Record<string,unknown>|null = null;
      try {
        childProcessMod.spawn = function(cmd: string, args: readonly string[], opts: Record<string,unknown>) {
          cap = { cmd, args: [...args], shell: opts.shell, detached: opts.detached, stdio: opts.stdio };
          return orig(cmd, args, opts);
        } as typeof childProcessMod.spawn;
        await runner.run(mkReq({ cwd: cwd1, args: ["-e","1"] }));
        ok(cap!.shell === false, "shell:false");
        ok(cap!.detached === true, "detached:true");
        ok(JSON.stringify(cap!.stdio) === JSON.stringify(["pipe","pipe","pipe"]), "stdio pipes");
      } finally { childProcessMod.spawn = orig; }
    }

    // ═══════════════════════════════════════════════════════
    // 7. Env isolation
    // ═══════════════════════════════════════════════════════
    console.log("7. Env isolation");
    {
      const orig = childProcessMod.spawn;
      let capEnv: Record<string,string>|null = null;
      try {
        childProcessMod.spawn = function(cmd: string, args: readonly string[], opts: Record<string,unknown>) {
          capEnv = opts.env as Record<string,string>;
          return orig(cmd, args, opts);
        } as typeof childProcessMod.spawn;
        await runner.run(mkReq({ cwd: cwd1, args: ["-e","1"], env: { MY_VAR: "v" } }));
        ok(!("SHELL" in capEnv!) || capEnv!.SHELL !== process.env.SHELL, "no parent SHELL leak");
        ok(capEnv!.HOME === "/tmp", "fixed env");
        ok(capEnv!.MY_VAR === "v", "request env");
      } finally { childProcessMod.spawn = orig; }
    }
    await expectThrowAsync("ENV_NOT_ALLOWED", () => runner.run(mkReq({ cwd: cwd1, args:["-e","1"], env:{HOME:"override"}})), "override fixed env");

    // Mutation-I test: override fixed env with an allowed key
    {
      const ri = new LoopPosixProcessRunner({
        executables: [{ id: "nx", executablePath: nodeExe, allowDynamicArgs: true }],
        allowedCwdRoots: [cwd1],
        fixedEnv: { MY_FIXED: "original" },
        allowedRequestEnvKeys: ["MY_FIXED"],
      });
      await expectThrowAsync("ENV_NOT_ALLOWED",
        () => ri.run(mkReq({ cwd: cwd1, executableId: "nx", args: ["-e", "1"], env: { MY_FIXED: "override" } })),
        "override fixed env with allowed key rejected");
    }

    // Mutation-J test: oversized stdin must be rejected
    {
      const bigStdin = "x".repeat(2_000_000); // 2MB, exceeds default 1MB
      await expectThrowAsync("INVALID_INPUT",
        () => runner.run(mkReq({ cwd: cwd1, executableId: "echo-stdin", stdin: bigStdin })),
        "oversized stdin rejected");
    }

    // ═══════════════════════════════════════════════════════
    // 8. cwd containment
    // ═══════════════════════════════════════════════════════
    console.log("8. cwd");
    {
      const r = await runner.run(mkReq({ cwd: cwd1, args: ["-e","1"] }));
      ok(r.exitCode === 0, "cwd1 ok");
    }
    const outside = join(tempRoot,"outside"); mkdirSync(outside,{recursive:true});
    await expectThrowAsync("CWD_NOT_ALLOWED", () => runner.run(mkReq({ cwd: outside })), "outside root");

    // ═══════════════════════════════════════════════════════
    // 9. Timeout
    // ═══════════════════════════════════════════════════════
    console.log("9. Timeout");
    {
      const r = await runner.run(mkReq({ cwd: cwd1, args: ["-e","setTimeout(()=>{},60000)"], timeoutMs: 500 }));
      ok(r.status === "timed_out", "timed out");
      ok(r.termSignalSent, "term sent");
    }
    {
      const r = await runner.run(mkReq({ cwd: cwd1, args: ["-e","process.on('SIGTERM',()=>{});setTimeout(()=>{},60000)"], timeoutMs: 500 }));
      ok(r.status === "timed_out", "timed out");
      ok(r.killSignalSent, "kill sent");
    }

    // ═══════════════════════════════════════════════════════
    // 10. Fault injection: signal failure
    // ═══════════════════════════════════════════════════════
    console.log("10. Signal fault injection");
    {
      const origKill = process.kill;
      let killCalls = 0;
      try {
        process.kill = function(pid: number, sig?: string | number): true {
          killCalls++;
          if (typeof pid === "number" && pid < 0 && sig === "SIGTERM" && killCalls === 1) {
            const e = new Error("SENTINEL_KILL_FAIL") as NodeJS.ErrnoException; e.code = "EPERM"; throw e;
          }
          return origKill(pid as number, sig as NodeJS.Signals);
        } as typeof process.kill;
        await expectThrowAsync("PROCESS_CLEANUP_FAILED",
          () => runner.run(mkReq({ cwd: cwd1, args: ["-e","setTimeout(()=>{},60000)"], timeoutMs: 300 })),
          "TERM fail → CLEANUP_FAILED");
      } finally { process.kill = origKill; }
    }

    // ═══════════════════════════════════════════════════════
    // 11. stdin modes
    // ═══════════════════════════════════════════════════════
    console.log("11. stdin");
    {
      const r = await runner.run(mkReq({ cwd: cwd1, executableId:"echo-stdin", stdin: "hello" }));
      ok(r.stdout === "hello", "stdin roundtrip");
      ok(r.stdoutBytesReceived === 5, "bytes received");
    }
    await expectThrowAsync("INVALID_INPUT", () => runner.run(mkReq({ cwd: cwd1, executableId:"echo-stdin" })), "required missing");
    await expectThrowAsync("INVALID_INPUT", () => runner.run(mkReq({ cwd: cwd1, executableId:"no-stdin", stdin: "x" })), "forbidden");

    // ═══════════════════════════════════════════════════════
    // 12. Args validation
    // ═══════════════════════════════════════════════════════
    console.log("12. Args");
    await expectThrowAsync("INVALID_INPUT", () => runner.run(mkReq({ cwd: cwd1, args: ["a\x00b"] })), "NUL");
    await expectThrowAsync("INVALID_INPUT", () => runner.run(mkReq({ cwd: cwd1, executableId:"node-fixed", args: ["-e","1"] })), "dynamic args rejected");

    // ═══════════════════════════════════════════════════════
    // 13. Concurrency
    // ═══════════════════════════════════════════════════════
    console.log("13. Concurrency");
    {
      const [r1, r2] = await Promise.all([
        runner.run(mkReq({ cwd: cwd1, args: ["-e","process.stdout.write('A')"], env:{MY_VAR:"a"}})),
        runner.run(mkReq({ cwd: cwd2, args: ["-e","process.stdout.write('B')"], env:{DEBUG:"1"}})),
      ]);
      ok(r1.stdout === "A" && r2.stdout === "B", "independent");
      ok(r1.exitCode === 0 && r2.exitCode === 0, "both ok");
    }

  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
main();
