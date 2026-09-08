// Real Capability Adapter — C03-E E2 fake-runner state-matrix tests
// ========================================================
// No real CLI is spawned: a fake runner returns scripted process results (or
// throws runner errors), proving the adapter maps EVERY process outcome to a
// canonical result / deterministic code, keeps the prompt on stdin, enforces
// the Q1 binding and bounds, and never leaks raw streams.
import {
  RealCapabilityAdapter,
  RealCapabilityAdapterError,
  type CapabilityProcessRunner,
  type RealCapabilityAdapterRequest,
} from "../execution/real-capability-adapter";
import type { LoopPosixProcessRequest, LoopPosixProcessResult } from "../core/loop-posix-process-runner";
import { LoopPosixProcessRunnerError } from "../core/loop-posix-process-runner";

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
function eq(actual: unknown, expected: unknown, m: string): void {
  ok(JSON.stringify(actual) === JSON.stringify(expected), `${m} (got ${JSON.stringify(actual)})`);
}

function result(p: Partial<LoopPosixProcessResult>): LoopPosixProcessResult {
  return Object.freeze({
    status: "exited",
    exitCode: 0,
    signal: null,
    durationMs: 42,
    stdout: "",
    stderr: "",
    stdoutBytesReceived: 0,
    stderrBytesReceived: 0,
    stdoutTruncated: false,
    stderrTruncated: false,
    termSignalSent: false,
    killSignalSent: false,
    ...p,
  }) as LoopPosixProcessResult;
}

class FakeRunner implements CapabilityProcessRunner {
  last: LoopPosixProcessRequest | null = null;
  constructor(private readonly behavior: (req: LoopPosixProcessRequest) => LoopPosixProcessResult) {}
  async run(req: LoopPosixProcessRequest): Promise<LoopPosixProcessResult> {
    this.last = req;
    return this.behavior(req);
  }
}
class ThrowingRunner implements CapabilityProcessRunner {
  constructor(private readonly code: any) {}
  async run(): Promise<LoopPosixProcessResult> {
    throw new LoopPosixProcessRunnerError(this.code, "fake runner error");
  }
}

function baseReq(over: Partial<RealCapabilityAdapterRequest>): RealCapabilityAdapterRequest {
  return {
    providerId: "kimi",
    runId: "run-1",
    invocationId: "run-1:solution-design:primary:1",
    requirementId: "REQ-1",
    node: "solution-design",
    capability: "solution-design",
    executionRole: "primary",
    attempt: 1,
    prompt: "please design the solution",
    cwd: "/tmp/attempt-workspace",
    ...over,
  };
}

async function expectCode(code: string, fn: () => Promise<unknown>, m: string): Promise<void> {
  try {
    await fn();
    ok(false, `${m} (no error)`);
  } catch (e) {
    const got = e instanceof RealCapabilityAdapterError ? e.code : "OTHER";
    ok(got === code, `${m} (got ${got})`);
  }
}

async function main(): Promise<void> {
  console.log("real-adapter: clean success by dialect");

  // kimi text-final
  {
    const runner = new FakeRunner(() => result({ stdout: "design answer", stdoutBytesReceived: 13 }));
    const out = await new RealCapabilityAdapter(runner).execute(baseReq({}));
    ok(out.success === true && out.agent === "kimi" && out.node === "solution-design", "kimi text-final success");
    ok((out.output as any).text === "design answer", "kimi final text mapped");
    // W3 plan C: the shell is the ONE dynamic argv entry (last), stdin is unused.
    ok(runner.last?.stdin === undefined, "nothing is sent on stdin");
    const kimiArgv = runner.last?.args ?? [];
    eq(kimiArgv.slice(0, -1), ["-p"], "kimi static argv precedes the shell");
    eq(kimiArgv[kimiArgv.length - 1], "please design the solution", "shell is the final argv entry");
  }

  // hermes text-final + --usage-file
  {
    const runner = new FakeRunner(() => result({ stdout: "review ok" }));
    const out = await new RealCapabilityAdapter(runner).execute(
      baseReq({
        providerId: "hermes",
        node: "code-review",
        capability: "code-review",
        runId: "run-9",
        attempt: 2,
      }),
    );
    ok(out.success && out.agent === "hermes", "hermes text-final success");
    const hermesArgv = runner.last?.args ?? [];
    // hermes' -z/--oneshot TAKES A VALUE: the shell must directly follow it.
    // Putting --usage-file between -z and the shell makes argparse exit 2 with
    // "argument -z/--oneshot: expected one argument" (E5-W3 canary finding).
    eq(
      hermesArgv,
      ["-z", "please design the solution", "--usage-file", ".usage-code-review-primary-2.json"],
      "hermes argv is -z <shell> then the workspace usage file",
    );
    ok(hermesArgv.join(" ").includes("run-9") === false, "usage file name does NOT embed runId (B1)");
    ok(
      hermesArgv.filter((a) => a !== "please design the solution").every((a) => !a.includes("/") && !a.includes("..")),
      "every argv entry except the shell has no path separator/traversal (B1)",
    );
  }

  // B1 regression: even if a caller supplies a traversal runId, it must never
  // reach argv — the usage file name is derived from closed enums only.
  {
    const runner = new FakeRunner(() => result({ stdout: "verdict ok" }));
    const out = await new RealCapabilityAdapter(runner).execute(
      baseReq({
        providerId: "hermes",
        node: "solution-gate",
        capability: "solution-gate",
        executionRole: "formal_verdict",
        runId: "../../tmp/escape-probe",
        attempt: 1,
      }),
    );
    ok(out.success, "adapter completes with traversal-shaped runId");
    const argv = runner.last?.args ?? [];
    ok(argv.some((a) => a.includes("..") || a.includes("/") || a.includes("escape")) === false, "traversal runId never reaches argv");
    eq(
      argv,
      ["-z", "please design the solution", "--usage-file", ".usage-solution-gate-formal_verdict-1.json"],
      "usage file named from capability/role/attempt only, shell right after -z",
    );
  }

  // codex jsonl-final — the content rides stdin, because codex cannot read a
  // staged file here: its fs sandbox helper shells out to sandbox-exec, which
  // fails (exit 71) inside an already-sandboxed process.
  {
    const CONTENT = "the staged task content";
    const jsonl =
      '{"type":"thread.started"}\n' +
      '{"type":"message","role":"assistant","content":[{"type":"output_text","text":"impl complete"}]}\n';
    const runner = new FakeRunner(() => result({ stdout: jsonl }));
    const out = await new RealCapabilityAdapter(runner).execute(
      baseReq({
        providerId: "codex",
        node: "implementation",
        capability: "implementation",
        stdinContent: CONTENT,
      }),
    );
    ok(out.success && out.agent === "codex", "codex jsonl-final success");
    ok((out.output as any).text === "impl complete", "codex last assistant message extracted");
    const codexArgv = runner.last?.args ?? [];
    ok(
      JSON.stringify(codexArgv.slice(0, -1)) ===
        JSON.stringify([
          "exec",
          "--json",
          "--ephemeral",
          "--sandbox",
          "read-only",
          "--skip-git-repo-check",
          "-c",
          "features.shell_tool=false",
        ]),
      "codex static argv (official nested-host shape; read-only sandbox preserved)",
    );
    eq(codexArgv[codexArgv.length - 1], "please design the solution", "shell is the final argv entry");
    // The content's route is stdin — never argv, which is capped at 4096 B.
    eq(runner.last?.stdin, CONTENT, "codex content rides stdin");
    ok(codexArgv.includes(CONTENT) === false, "content is NOT in argv");
  }

  // stdin transport with no content must fail closed: an empty stdin would hand
  // codex a shell that promises content it never received.
  {
    const runner = new FakeRunner(() => result({ stdout: "{}" }));
    await expectCode(
      "REAL_ADAPTER_INVALID_INPUT",
      () =>
        new RealCapabilityAdapter(runner).execute(
          baseReq({ providerId: "codex", node: "implementation", capability: "implementation" }),
        ),
      "stdin transport without stdinContent fails closed",
    );
    eq(runner.last, null, "no process spawned when the content is missing");
  }

  console.log("real-adapter: bounds + timeout by capability class");
  {
    const runner = new FakeRunner(() => result({ stdout: "x" }));
    await new RealCapabilityAdapter(runner).execute(baseReq({ capability: "solution-design" }));
    // E5-T1 (2026-08-31 Current User ruling): 45/60 min profile budgets.
    ok(runner.last?.timeoutMs === 45 * 60 * 1000, "non-implementation timeout 45min");
    ok(runner.last?.maxStdoutBytes === 256 * 1024 && runner.last?.maxStderrBytes === 64 * 1024, "stream bounds 256KiB/64KiB");
  }
  {
    const runner = new FakeRunner(() => result({ stdout: '{"text":"x"}' }));
    await new RealCapabilityAdapter(runner).execute(
      // codex rides stdin (plan C / official nested-host shape), so the
      // implementation-class probe must carry stdinContent like a real call.
      baseReq({ providerId: "codex", capability: "implementation", node: "implementation", stdinContent: "implementation task content" }),
    );
    ok(runner.last?.timeoutMs === 60 * 60 * 1000, "implementation timeout 60min");
  }

  console.log("real-adapter: fail-closed process-state matrix");
  await expectCode(
    "REAL_ADAPTER_TIMEOUT",
    () => new RealCapabilityAdapter(new FakeRunner(() => result({ status: "timed_out", termSignalSent: true, killSignalSent: true }))).execute(baseReq({})),
    "timed_out -> TIMEOUT",
  );
  await expectCode(
    "REAL_ADAPTER_NONZERO_EXIT",
    () => new RealCapabilityAdapter(new FakeRunner(() => result({ exitCode: 2, stderr: "boom secret detail" }))).execute(baseReq({})),
    "exit 2 -> NONZERO_EXIT",
  );
  await expectCode(
    "REAL_ADAPTER_SIGNAL_KILLED",
    () => new RealCapabilityAdapter(new FakeRunner(() => result({ exitCode: null, signal: "SIGKILL" as NodeJS.Signals }))).execute(baseReq({})),
    "signal -> SIGNAL_KILLED",
  );
  await expectCode(
    "REAL_ADAPTER_OUTPUT_TRUNCATED",
    () => new RealCapabilityAdapter(new FakeRunner(() => result({ stdout: "ok", stdoutTruncated: true }))).execute(baseReq({})),
    "truncated stdout never promoted to success",
  );
  await expectCode(
    "REAL_ADAPTER_SECRET_LEAK",
    () => new RealCapabilityAdapter(new FakeRunner(() => result({ stdout: "answer AKIA1234567890ABCDEF done" }))).execute(baseReq({})),
    "credential-looking final text -> SECRET_LEAK",
  );
  await expectCode(
    "REAL_ADAPTER_MALFORMED_OUTPUT",
    () =>
      new RealCapabilityAdapter(new FakeRunner(() => result({ stdout: "this is not jsonl" }))).execute(
        baseReq({ providerId: "codex", capability: "implementation", node: "implementation", stdinContent: "task content" }),
      ),
    "codex non-jsonl -> MALFORMED",
  );
  await expectCode(
    "REAL_ADAPTER_MALFORMED_OUTPUT",
    () =>
      new RealCapabilityAdapter(new FakeRunner(() => result({ stdout: '{"type":"ping"}\n' }))).execute(
        baseReq({ providerId: "codex", capability: "implementation", node: "implementation", stdinContent: "task content" }),
      ),
    "codex jsonl without final message -> MALFORMED",
  );
  await expectCode(
    "REAL_ADAPTER_MALFORMED_OUTPUT",
    () => new RealCapabilityAdapter(new FakeRunner(() => result({ stdout: "   " }))).execute(baseReq({})),
    "empty text-final -> MALFORMED",
  );

  console.log("real-adapter: runner-error mapping");
  await expectCode(
    "REAL_ADAPTER_MISSING_COMMAND",
    () => new RealCapabilityAdapter(new ThrowingRunner("EXECUTABLE_INVALID")).execute(baseReq({})),
    "missing executable -> MISSING_COMMAND",
  );
  await expectCode(
    "REAL_ADAPTER_SPAWN_FAILED",
    () => new RealCapabilityAdapter(new ThrowingRunner("PROCESS_SPAWN_FAILED")).execute(baseReq({})),
    "spawn failure -> SPAWN_FAILED",
  );
  await expectCode(
    "REAL_ADAPTER_CLEANUP_FAILED",
    () => new RealCapabilityAdapter(new ThrowingRunner("PROCESS_CLEANUP_FAILED")).execute(baseReq({})),
    "cleanup failure -> CLEANUP_FAILED",
  );
  await expectCode(
    "REAL_ADAPTER_INVALID_INPUT",
    () => new RealCapabilityAdapter(new ThrowingRunner("CWD_NOT_ALLOWED")).execute(baseReq({})),
    "runner wiring defect -> INVALID_INPUT (not an agent result)",
  );

  console.log("real-adapter: request validation + binding firewall");
  await expectCode(
    "REAL_ADAPTER_BINDING_MISMATCH",
    () =>
      new RealCapabilityAdapter(new FakeRunner(() => result({ stdout: "x" }))).execute(
        baseReq({ providerId: "kimi", capability: "implementation", node: "implementation" }),
      ),
    "kimi cannot run a codex-bound point",
  );
  await expectCode(
    "REAL_ADAPTER_INVALID_INPUT",
    () => new RealCapabilityAdapter(new FakeRunner(() => result({ stdout: "x" }))).execute(baseReq({ attempt: 0 })),
    "attempt must be >=1",
  );
  // W3 plan C: the shell lives in one argv entry, so the ceiling that matters
  // is the 4096 B per-argument cap — and it is a distinct, explicit error, not
  // a silent truncation. (1 MiB of text is simply the wrong transport now.)
  await expectCode(
    "REAL_ADAPTER_PROMPT_TOO_LARGE",
    () =>
      new RealCapabilityAdapter(new FakeRunner(() => result({ stdout: "x" }))).execute(
        baseReq({ prompt: "x".repeat(4097) }),
      ),
    "shell over the 4096 B argv ceiling is rejected, not truncated",
  );
  await expectCode(
    "REAL_ADAPTER_INVALID_INPUT",
    () => new RealCapabilityAdapter(new FakeRunner(() => result({ stdout: "x" }))).execute(baseReq({ providerId: "gpt" as any })),
    "unknown provider rejected",
  );

  console.log("real-adapter: evidence is bounded and never leaks raw streams");
  {
    let captured: RealCapabilityAdapterError | null = null;
    try {
      await new RealCapabilityAdapter(new FakeRunner(() => result({ exitCode: 7, stderr: "SECRET_STACK_DETAIL" }))).execute(baseReq({}));
    } catch (e) {
      captured = e as RealCapabilityAdapterError;
    }
    ok(captured !== null && captured.code === "REAL_ADAPTER_NONZERO_EXIT", "nonzero captured");
    ok(captured?.evidence?.exitCode === 7, "evidence carries exit code");
    ok(captured?.evidence !== null && !JSON.stringify(captured.evidence).includes("SECRET_STACK_DETAIL"), "evidence has no raw stderr");
    ok(!captured?.message.includes("SECRET_STACK_DETAIL"), "error message has no raw stream");
    ok(captured?.infrastructure === false, "nonzero is an agent (non-infra) failure");
  }
  {
    let captured: RealCapabilityAdapterError | null = null;
    try {
      await new RealCapabilityAdapter(new FakeRunner(() => result({ status: "timed_out" }))).execute(baseReq({}));
    } catch (e) {
      captured = e as RealCapabilityAdapterError;
    }
    ok(captured?.infrastructure === true && captured?.evidence?.status === "timed_out", "timeout classified infra with evidence");
  }

  console.log(`\nResults: ${p} passed, ${f} failed`);
  if (f > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
