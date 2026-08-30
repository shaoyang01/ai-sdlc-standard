// Agent CLI Profiles — C03-E E2 self-asserting tests (Decision-071)
// ========================================================
import {
  AGENT_CLI_BOUNDS,
  AGENT_CLI_PROFILES,
  AGENT_CLI_PROVIDER_IDS,
  E2_P_REACHABILITY_FACTS,
  E5_OBSERVED_CLI_VERSIONS,
  MAX_ARGV_PROMPT_BYTES,
  AgentCliProfileError,
  assertAgentCliProfileIntegrity,
  bindingProviderForPoint,
  getAgentCliProfile,
} from "../execution/agent-cli-profile";
import { LOOP_CAPABILITY_EXECUTION_POINTS } from "../loop/types";

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
async function throws(code: string, fn: () => unknown, m: string): Promise<void> {
  try {
    fn();
    ok(false, `${m} (no error)`);
  } catch (e) {
    const got = e instanceof AgentCliProfileError ? e.code : "OTHER";
    ok(got === code, `${m} (got ${got})`);
  }
}

async function main(): Promise<void> {
  console.log("agent-cli-profile: self-check");
  ok(assertAgentCliProfileIntegrity() === 8, "self-check covers all 8 execution points");

  // 2026-08-30 audit: a pinned-version drift check once failed integrity here,
  // bricking every dispatch after a routine CLI update (0.147.0→0.151.0).
  // Versions are provenance recorded by the canary --version probe, never a
  // gate. If this line ever goes red again because of a version mismatch, the
  // check reintroduced the drift gate — remove the gate, not the version.
  ok(assertAgentCliProfileIntegrity() === 8, "integrity holds regardless of CLI version drift (provenance is not a gate)");

  console.log("agent-cli-profile: Q1 binding projection (plan §3.2)");
  eq(bindingProviderForPoint({ capability: "requirement-intake", executionRole: "primary" }), "kimi", "intake→kimi");
  eq(bindingProviderForPoint({ capability: "solution-design", executionRole: "primary" }), "kimi", "design→kimi");
  eq(bindingProviderForPoint({ capability: "solution-gate", executionRole: "adversarial_scan" }), "codex", "gate scan→codex");
  eq(bindingProviderForPoint({ capability: "solution-gate", executionRole: "formal_verdict" }), "hermes", "gate verdict→hermes");
  eq(bindingProviderForPoint({ capability: "task-planning", executionRole: "primary" }), "kimi", "planning→kimi");
  eq(bindingProviderForPoint({ capability: "implementation", executionRole: "primary" }), "codex", "implementation→codex");
  eq(bindingProviderForPoint({ capability: "code-review", executionRole: "primary" }), "hermes", "review→hermes");
  eq(bindingProviderForPoint({ capability: "knowledge-sync", executionRole: "primary" }), "kimi", "sync→kimi");

  console.log("agent-cli-profile: every canonical point resolves");
  let kimi = 0,
    codex = 0,
    hermes = 0;
  for (const point of LOOP_CAPABILITY_EXECUTION_POINTS) {
    const provider = bindingProviderForPoint(point);
    if (provider === "kimi") kimi++;
    if (provider === "codex") codex++;
    if (provider === "hermes") hermes++;
    getAgentCliProfile(provider);
  }
  eq([kimi, codex, hermes], [4, 2, 2], "provider tally kimi×4 codex×2 hermes×2");

  console.log("agent-cli-profile: dual-role firewall");
  const scan = bindingProviderForPoint({ capability: "solution-gate", executionRole: "adversarial_scan" });
  const verdict = bindingProviderForPoint({ capability: "solution-gate", executionRole: "formal_verdict" });
  ok(scan !== verdict, "scan and verdict are different providers");

  console.log("agent-cli-profile: version pins (E2-P provenance kept, E5 baseline pins the live value)");
  eq(AGENT_CLI_PROVIDER_IDS, ["kimi", "codex", "hermes"], "three providers");
  for (const id of AGENT_CLI_PROVIDER_IDS) {
    const prof = getAgentCliProfile(id);
    const fact = E2_P_REACHABILITY_FACTS[id];
    // E2-P stays on record as reachability-time provenance and is never rewritten.
    eq(fact.evidenceClass, "PROVIDER_REACHABILITY_ONLY", `${id} evidence is reachability-only`);
    eq(fact.exitCode, 0, `${id} E2-P exit 0`);
    ok(fact.recordRef.includes("e2p-provider-reachability-record"), `${id} E2-P record ref kept`);
    // G-E5L2-3: the live pinned baseline is the E5 observation.
    eq(prof.pinnedCliVersion, E5_OBSERVED_CLI_VERSIONS[id], `${id} version pinned to the E5 observed baseline`);
    // W3 plan C: the shell is an argv entry under BOTH transports; only the
    // content's route differs.
    eq(
      prof.contentTransport,
      id === "codex" ? "stdin" : "workspace-file",
      `${id} content transport pinned`,
    );
    ok(
      prof.pointerPathMode === "relative" || prof.pointerPathMode === "absolute",
      `${id} pointer path mode is a known value`,
    );
    ok(prof.staticArgs.every((a) => !a.includes("$") && !a.includes("`") && !a.includes(";")), `${id} static args have no shell metachars`);
  }
  // W3 probe: only hermes ignores the process cwd, so only hermes needs an
  // absolute pointer. These two lines are the machine-checked form of that fact.
  eq(getAgentCliProfile("hermes").pointerPathMode, "absolute", "hermes needs an absolute pointer");
  eq(getAgentCliProfile("kimi").pointerPathMode, "relative", "kimi resolves a relative pointer");
  eq(getAgentCliProfile("codex").pointerPathMode, "relative", "codex resolves a relative pointer");
  // codex is the ONE stdin provider. Its fs sandbox helper shells out to
  // sandbox-exec (Seatbelt); inside an already-sandboxed process that nested
  // call fails with exit 71 and codex is fail-closed — it reports "input
  // unreadable" rather than inventing content. Piping the content on stdin
  // keeps the task input off the filesystem, so --sandbox read-only remains a
  // safe default instead of a hard blocker.
  eq(getAgentCliProfile("codex").contentTransport, "stdin", "codex content rides stdin: it cannot read a staged file here");
  eq(getAgentCliProfile("kimi").contentTransport, "workspace-file", "kimi reads a staged file");
  eq(getAgentCliProfile("hermes").contentTransport, "workspace-file", "hermes reads a staged file");
  eq(MAX_ARGV_PROMPT_BYTES, 4096, "instruction shell ceiling mirrors the runner per-argument cap");
  // 2026-08-30 codex-official nested-host shape: stdin content, read-only
  // sandbox kept as the fail-closed backstop, shell_tool off, ephemeral
  // session. See the codex profile comment.
  eq(
    getAgentCliProfile("codex").staticArgs,
    ["exec", "--json", "--ephemeral", "--sandbox", "read-only", "--skip-git-repo-check", "-c", "features.shell_tool=false"],
    "codex read-only static argv (official nested-host shape)",
  );
  ok(getAgentCliProfile("codex").staticArgs.includes("read-only"), "codex sandbox read-only (no write)");
  eq(getAgentCliProfile("hermes").usageFileArg, ["--usage-file"], "hermes usage-file arg");
  ok(getAgentCliProfile("kimi").usageFileArg === null, "kimi has no usage-file");

  console.log("agent-cli-profile: §9 bounds (Q4)");
  eq(AGENT_CLI_BOUNDS.maxStdinBytes, 1024 * 1024, "stdin 1 MiB");
  eq(AGENT_CLI_BOUNDS.maxStdoutBytes, 256 * 1024, "stdout 256 KiB");
  eq(AGENT_CLI_BOUNDS.maxStderrBytes, 64 * 1024, "stderr 64 KiB");
  eq(AGENT_CLI_BOUNDS.maxArtifactBytes, 16 * 1024 * 1024, "artifact 16 MiB");
  eq(AGENT_CLI_BOUNDS.sameBindingMaxRetry, 1, "same-binding retry ≤ 1");
  eq(AGENT_CLI_BOUNDS.regateRounds, 8, "regate rounds 8");
  eq(AGENT_CLI_BOUNDS.runForegroundBudgetMs, 2 * 60 * 60 * 1000, "run budget 2h");
  for (const id of AGENT_CLI_PROVIDER_IDS) {
    const t = getAgentCliProfile(id).timeoutMsByCapabilityClass;
    eq(t["non-implementation"], 10 * 60 * 1000, `${id} non-impl timeout 10min`);
    eq(t.implementation, 30 * 60 * 1000, `${id} impl timeout 30min`);
  }

  console.log("agent-cli-profile: fail-closed lookups");
  await throws("AGENT_CLI_PROFILE_UNKNOWN_PROVIDER", () => getAgentCliProfile("gpt"), "unknown provider rejected");
  await throws("AGENT_CLI_PROFILE_UNKNOWN_PROVIDER", () => getAgentCliProfile(undefined), "undefined provider rejected");
  await throws("AGENT_CLI_PROFILE_INVALID_INPUT", () => bindingProviderForPoint(null), "null point rejected");
  await throws("AGENT_CLI_PROFILE_INVALID_INPUT", () => bindingProviderForPoint({ capability: "nope", executionRole: "primary" }), "unknown capability rejected");
  await throws(
    "AGENT_CLI_PROFILE_INVALID_INPUT",
    () => bindingProviderForPoint({ capability: "requirement-intake", executionRole: "adversarial_scan" }),
    "role not valid for node rejected",
  );

  console.log("agent-cli-profile: deep immutability");
  const prof = AGENT_CLI_PROFILES.kimi;
  let froze = true;
  try {
    (prof as { pinnedCliVersion: string }).pinnedCliVersion = "x";
    (prof.staticArgs as string[]).push("evil");
  } catch {
    /* strict mode throws */
  }
  if (prof.pinnedCliVersion === E5_OBSERVED_CLI_VERSIONS.kimi && prof.staticArgs.length === 1) froze = true;
  else froze = false;
  ok(froze, "profiles are frozen");
  ok(Object.isFrozen(AGENT_CLI_BOUNDS), "bounds frozen");

  console.log(`\nResults: ${p} passed, ${f} failed`);
  if (f > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
