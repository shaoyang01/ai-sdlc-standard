// E5-W3 plan C — workspace file-pointer transport. Self-asserting tests.
// ============================================================================
// Covers what W3 changed:
//   1. prompt-workspace: staged pointers + path guard + workspace normalization
//   2. capability-prompt-builder: the shell names a pointer, never the content
//   3. real-capability-adapter: argv-final transport, the 4096 B ceiling, and
//      an invocationDigest that is a SHAPE digest (workspace collapsed to
//      $WORKSPACE, shell replaced by its own sha256)
//   4. codex 0.147.0 nested JSONL final message (G-E5L2-2) + fail-closed cases
//
// No real CLI is spawned here (INV-E13): transport and digest shape are proved
// against a fake runner; the real-CLI evidence is the separately authorized
// canary.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  PROMPT_INPUT_DIRNAME,
  PromptWorkspaceError,
  assertPromptPointerSegment,
  normalizeWorkspacePaths,
  stagePromptInput,
} from "../execution/prompt-workspace";
import { buildNodeCapabilityPrompt, CapabilityPromptError } from "../execution/capability-prompt-builder";
import {
  MAX_ARGV_PROMPT_BYTES,
  getAgentCliProfile,
} from "../execution/agent-cli-profile";
import {
  RealCapabilityAdapter,
  RealCapabilityAdapterError,
  extractCodexFinalText,
  type CapabilityProcessRunner,
} from "../execution/real-capability-adapter";
import type { LoopPosixProcessRequest, LoopPosixProcessResult } from "../core/loop-posix-process-runner";

let p = 0,
  f = 0;
function ok(c: boolean, m: string): void {
  if (c) { p++; console.log(`  ✓ ${m}`); }
  else { f++; console.error(`  ✗ ${m}`); }
}
function eq(actual: unknown, expected: unknown, m: string): void {
  ok(JSON.stringify(actual) === JSON.stringify(expected), `${m} (got ${JSON.stringify(actual)})`);
}

function fakeResult(stdout: string, over: Partial<LoopPosixProcessResult> = {}): LoopPosixProcessResult {
  return Object.freeze({
    status: "exited", exitCode: 0, signal: null, durationMs: 12,
    stdout, stderr: "", stdoutBytesReceived: Buffer.byteLength(stdout, "utf8"),
    stderrBytesReceived: 0, stdoutTruncated: false, stderrTruncated: false,
    termSignalSent: false, killSignalSent: false, ...over,
  }) as LoopPosixProcessResult;
}

class FakeRunner implements CapabilityProcessRunner {
  lastReq: LoopPosixProcessRequest | null = null;
  constructor(private readonly result: LoopPosixProcessResult) {}
  async run(req: LoopPosixProcessRequest): Promise<LoopPosixProcessResult> {
    this.lastReq = req;
    return this.result;
  }
}

const KIMI_ENV = "text before\n<<<NODE-OUTPUT>>>\n{\"summary\":\"s\",\"body\":\"b\"}\n<<<END-NODE-OUTPUT>>>\ntext after";

function kimiReq(cwd: string, prompt: string): Parameters<RealCapabilityAdapter["execute"]>[0] {
  return {
    providerId: "kimi",
    runId: "run-w3-001",
    invocationId: "run-w3-001:requirement-intake:primary:1",
    requirementId: "REQ-W3-001",
    node: "requirement-intake",
    capability: "requirement-intake",
    executionRole: "primary",
    attempt: 1,
    prompt,
    cwd,
  };
}

async function main(): Promise<void> {
  console.log("w3: prompt-workspace staging");
  const ws = mkdtempSync(join(tmpdir(), "w3-ws-"));
  try {
    const content = "requirement body ".repeat(3000); // ~51 KB, way over the argv ceiling
    const staged = stagePromptInput({
      workspaceDir: ws, content, capability: "requirement-intake", executionRole: "primary", attempt: 1,
    });
    eq(staged.relativePath, `${PROMPT_INPUT_DIRNAME}/requirement-intake-primary-1.md`, "staged file name comes from enum + attempt");
    eq(staged.bytes, Buffer.byteLength(content, "utf8"), "staged byte count matches");
    ok(staged.bytes > MAX_ARGV_PROMPT_BYTES, `staged content (${staged.bytes} B) exceeds the argv ceiling, proving it never travelled in argv`);
    ok(readFileSync(staged.absolutePath, "utf8") === content, "staged file holds the content verbatim");
    ok(/^[0-9a-f]{64}$/.test(staged.digest), "pointer carries a sha256");
    eq(staged.absolutePath, join(ws, PROMPT_INPUT_DIRNAME, "requirement-intake-primary-1.md"), "absolute path is inside the workspace");

    console.log("w3: pointer path guard (fail-closed)");
    for (const bad of [
      "../escape.md", "prompt-input/../../etc/passwd", "/etc/passwd", "", "prompt-input/",
      "prompt-input/a/b.md", "prompt-input/.hidden", "prompt-input/has space.md", "other/x.md",
    ]) {
      let code = "NO_ERROR";
      try { assertPromptPointerSegment(bad); } catch (e) { code = e instanceof PromptWorkspaceError ? e.code : "OTHER"; }
      ok(code === "PROMPT_WORKSPACE_UNSAFE_PATH" || code === "PROMPT_WORKSPACE_INVALID_INPUT", `rejects pointer ${JSON.stringify(bad)} (${code})`);
    }
    eq(assertPromptPointerSegment("prompt-input/requirement-intake-primary-1.md"), "prompt-input/requirement-intake-primary-1.md", "accepts a single safe segment");

    let code = "NO_ERROR";
    try { stagePromptInput({ workspaceDir: ws, content: "x", capability: "../etc", executionRole: "primary", attempt: 1 }); }
    catch (e) { code = e instanceof PromptWorkspaceError ? e.code : "OTHER"; }
    eq(code, "PROMPT_WORKSPACE_INVALID_INPUT", "capability that is not a canonical id cannot steer the path");
    code = "NO_ERROR";
    try { stagePromptInput({ workspaceDir: ws, content: "x", capability: "requirement-intake", executionRole: "primary", attempt: 0 }); }
    catch (e) { code = e instanceof PromptWorkspaceError ? e.code : "OTHER"; }
    eq(code, "PROMPT_WORKSPACE_INVALID_INPUT", "attempt must be >= 1");

    console.log("w3: workspace path normalization (digest input only)");
    eq(normalizeWorkspacePaths("/ws/a/prompt-input/x.md", "/ws/a"), "$WORKSPACE/prompt-input/x.md", "absolute workspace prefix collapses to $WORKSPACE");
    eq(normalizeWorkspacePaths("prompt-input/x.md", "/ws/a"), "prompt-input/x.md", "relative paths are left alone");
    ok(!normalizeWorkspacePaths("/ws/a/prompt-input/x.md", "/ws/a").includes("/ws/a"), "normalized text keeps no temp path");

    console.log("w3: prompt builder names the pointer, never the content");
    const shell = buildNodeCapabilityPrompt({
      requirementId: "REQ-W3-001", node: "requirement-intake", capability: "requirement-intake",
      executionRole: "primary",
      inputPointer: { path: "prompt-input/requirement-intake-primary-1.md", digest: staged.digest, bytes: staged.bytes },
    });
    ok(shell.includes("prompt-input/requirement-intake-primary-1.md"), "shell names the pointer path");
    ok(shell.includes(staged.digest), "shell carries the content sha256");
    ok(!shell.includes("requirement body"), "shell does NOT inline the content");
    ok(Buffer.byteLength(shell, "utf8") < MAX_ARGV_PROMPT_BYTES, "shell fits in one argv entry");

    let pc: string | null = null;
    try { buildNodeCapabilityPrompt({ requirementId: "R", node: "n", capability: "requirement-intake", executionRole: "primary", inputText: "a", inputPointer: { path: "prompt-input/x.md", digest: "d".repeat(64), bytes: 1 } }); }
    catch (e) { pc = e instanceof CapabilityPromptError ? e.code : "OTHER"; }
    eq(pc, "CAPABILITY_PROMPT_INVALID_INPUT", "inputText and inputPointer are mutually exclusive");
    pc = null;
    try { buildNodeCapabilityPrompt({ requirementId: "R", node: "n", capability: "requirement-intake", executionRole: "primary" }); }
    catch (e) { pc = e instanceof CapabilityPromptError ? e.code : "OTHER"; }
    eq(pc, "CAPABILITY_PROMPT_INVALID_INPUT", "neither inputText nor inputPointer is rejected");
    pc = null;
    try { buildNodeCapabilityPrompt({ requirementId: "R", node: "n", capability: "requirement-intake", executionRole: "primary", inputPointer: { path: "prompt-input/x.md", digest: "not-hex", bytes: 1 } }); }
    catch (e) { pc = e instanceof CapabilityPromptError ? e.code : "OTHER"; }
    eq(pc, "CAPABILITY_PROMPT_INVALID_INPUT", "pointer digest must be sha256 hex");

    console.log("w3: adapter transports the shell over argv-final");
    const runner = new FakeRunner(fakeResult(KIMI_ENV));
    const adapter = new RealCapabilityAdapter(runner);
    const res = await adapter.execute(kimiReq("/ws/a", shell));
    const req = runner.lastReq as LoopPosixProcessRequest;
    ok(res.success, "adapter succeeded against the fake runner");
    eq(req.args[req.args.length - 1], shell, "shell is the final argv entry");
    eq(req.stdin, undefined, "nothing is sent on stdin");
    ok(req.args.slice(0, -1).every((a) => a === "-p"), "everything before the shell is the static argv");

    let ac: string | null = null;
    try { await adapter.execute(kimiReq("/ws/a", "x".repeat(MAX_ARGV_PROMPT_BYTES + 1))); }
    catch (e) { ac = e instanceof RealCapabilityAdapterError ? e.code : "OTHER"; }
    eq(ac, "REAL_ADAPTER_PROMPT_TOO_LARGE", "an oversized shell is rejected, never truncated");

    console.log("w3: invocationDigest is a shape digest (D1)");
    // hermes uses an absolute pointer, so argv bakes in a workspace path; the
    // digest must stay identical across two different workspaces.
    const hermesShellA = "read /ws1/prompt-input/solution-gate-formal_verdict-1.md and answer";
    const hermesShellB = "read /ws2/prompt-input/solution-gate-formal_verdict-1.md and answer";
    const hermesReq = (cwd: string, prompt: string) => ({
      providerId: "hermes" as const,
      runId: "run-w3-002",
      invocationId: "run-w3-002:solution-gate:formal_verdict:1",
      requirementId: "REQ-W3-002",
      node: "solution-gate",
      capability: "solution-gate" as const,
      executionRole: "formal_verdict" as const,
      attempt: 1,
      prompt,
      cwd,
    });
    const h1 = new FakeRunner(fakeResult(KIMI_ENV));
    const h2 = new FakeRunner(fakeResult(KIMI_ENV));
    const r1 = await new RealCapabilityAdapter(h1).execute(hermesReq("/ws1", hermesShellA));
    const r2 = await new RealCapabilityAdapter(h2).execute(hermesReq("/ws2", hermesShellB));
    const d1 = (r1.processEvidence as { invocationDigest: string }).invocationDigest;
    const d2 = (r2.processEvidence as { invocationDigest: string }).invocationDigest;
    // D1 scoped the normalization to the pointer paths inside argv, NOT to cwd:
    // cwd stays one of the six shape fields W1 pinned, so a different workspace
    // is still a different digest. What IS normalized is the absolute pointer
    // the shell names — otherwise the digest would depend on the temp dir name.
    ok(d1 !== d2, "a different workspace still yields a different digest (W1 shape field kept)");
    const argv1 = (h1.lastReq as LoopPosixProcessRequest).args;
    ok(argv1.some((a) => a.includes("/ws1/")), "the real argv still carries the absolute pointer");
    ok(normalizeWorkspacePaths(argv1.join(" "), "/ws1").includes("/ws1/") === false, "after normalization the argv keeps no workspace path");

    // hermes' -z/--oneshot TAKES A VALUE (usage: `[-z PROMPT] [--usage-file PATH]`),
    // so the shell must directly follow -z. The E5-W3 canary hit exit 2 with
    // "argument -z/--oneshot: expected one argument" when --usage-file sat
    // between the flag and the shell — the "shell is always last" invariant was
    // simply wrong for the one provider whose prompt flag takes a value.
    eq(argv1[0], "-z", "hermes argv opens with the -z prompt flag");
    eq(argv1[1], hermesShellA, "the shell directly follows -z: it is -z's VALUE");
    eq(argv1[2], "--usage-file", "--usage-file is placed after the shell, not before it");
    ok(argv1[3]?.startsWith(".usage-solution-gate-formal_verdict-") === true, "usage file named from closed enums only");

    const h3 = new FakeRunner(fakeResult(KIMI_ENV));
    const r3 = await new RealCapabilityAdapter(h3).execute(hermesReq("/ws1", "read /ws1/prompt-input/OTHER.md and answer"));
    const d3 = (r3.processEvidence as { invocationDigest: string }).invocationDigest;
    ok(d3 !== d1, "pointing at a different file changes the digest (D1)");

    const h4 = new FakeRunner(fakeResult(KIMI_ENV));
    const r4 = await new RealCapabilityAdapter(h4).execute(hermesReq("/ws1", hermesShellA));
    const d4 = (r4.processEvidence as { invocationDigest: string }).invocationDigest;
    eq(d4, d1, "the same shape in the same workspace is a stable digest");

    console.log("w3: codex 0.147.0 nested final message (G-E5L2-2)");
    const nested = [
      JSON.stringify({ type: "turn.started" }),
      JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "final answer text" } }),
    ].join("\n");
    eq(extractCodexFinalText(nested), "final answer text", "nested item.completed/agent_message/text is read");
    eq(
      extractCodexFinalText(JSON.stringify({ type: "message", role: "assistant", content: [{ type: "output_text", text: "legacy shape" }] })),
      "legacy shape",
      "the pre-existing content[] shape still works",
    );
    for (const [label, stream] of [
      ["non-json line", "not json\n"],
      ["no final message", JSON.stringify({ type: "turn.started" }) + "\n"],
      ["empty stream", "   \n"],
    ] as const) {
      let cc = "NO_ERROR";
      try { extractCodexFinalText(stream); } catch (e) { cc = e instanceof RealCapabilityAdapterError ? e.code : "OTHER"; }
      eq(cc, "REAL_ADAPTER_MALFORMED_OUTPUT", `${label} stays fail-closed`);
    }

    console.log("w3: profile facts the transport depends on");
    eq(getAgentCliProfile("hermes").pointerPathMode, "absolute", "hermes pointer mode is absolute (probed)");
    eq(getAgentCliProfile("kimi").pointerPathMode, "relative", "kimi pointer mode is relative (probed)");
    eq(getAgentCliProfile("codex").staticArgs.includes("read-only"), true, "codex sandbox stays read-only");
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }

  console.log(`\nResults: ${p} passed, ${f} failed`);
  if (f > 0) process.exit(1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
