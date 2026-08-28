// Agent CLI Profiles — C03-E E2 self-asserting tests (Decision-071)
// ========================================================
import {
  AGENT_CLI_BOUNDS,
  AGENT_CLI_PROFILES,
  AGENT_CLI_PROVIDER_IDS,
  E2_P_REACHABILITY_FACTS,
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

  console.log("agent-cli-profile: E2-P version pins + reachability-only evidence");
  eq(AGENT_CLI_PROVIDER_IDS, ["kimi", "codex", "hermes"], "three providers");
  for (const id of AGENT_CLI_PROVIDER_IDS) {
    const prof = getAgentCliProfile(id);
    const fact = E2_P_REACHABILITY_FACTS[id];
    eq(prof.pinnedCliVersion, fact.observedCliVersion, `${id} version pinned to E2-P fact`);
    eq(fact.evidenceClass, "PROVIDER_REACHABILITY_ONLY", `${id} evidence is reachability-only`);
    eq(fact.exitCode, 0, `${id} E2-P exit 0`);
    ok(prof.promptTransport === "stdin", `${id} prompt over stdin`);
    ok(prof.staticArgs.every((a) => !a.includes("$") && !a.includes("`") && !a.includes(";")), `${id} static args have no shell metachars`);
  }
  eq(getAgentCliProfile("codex").staticArgs, ["exec", "--json", "--sandbox", "read-only", "--skip-git-repo-check"], "codex read-only static argv");
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
  if (prof.pinnedCliVersion === "0.38.0" && prof.staticArgs.length === 1) froze = true;
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
