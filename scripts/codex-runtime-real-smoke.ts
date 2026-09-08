// Codex Runtime Real Smoke Test (v2 single-rail)
// ================================================
// [Q1 STALE — W1, Decision-073 (2026-08-28)] Under the Q1 binding ONLY
// adversarial_scan and implementation are codex-bound; requirement-intake and
// solution-design are Kimi slots and formal_verdict is Hermes. This script was
// written when codex alone had real dispatch: its "three codex-bound points /
// codexAttempts >= 6" expectation below no longer holds (with only the codex
// gateway injected, a Q1 run stops fail-closed at the FIRST Kimi node). The
// script stays unrunnable and unauthorized — the E5 real three-agent canary is
// a separate grant — and MUST be rewritten to the Q1 three-agent shape before
// any authorized real run.
//
// Manually invoked smoke test for the v2 runtime chain with the real Codex
// Gateway injected. Requires explicit environment confirmation. Does NOT
// modify files. Does NOT apply patches. Prints only sanitized summary data.
//
// The v2 chain requires the two solution-gate roles on DIFFERENT agents. Under
// Q1 only adversarial_scan is a codex-bound point before the gate (pre-Q1 this
// list also included requirement-intake and solution-design); the run must
// stop fail-closed at the formal_verdict point (bound to hermes) instead of
// silently reusing the scan agent. See the Q1 STALE note above before relying
// on the point/event counts below.
//
// Required environment variables:
//   SDLC_EXECUTION_MODE=codex
//   SDLC_CODEX_REAL_DISPATCH=enabled
//   SDLC_CODEX_SMOKE_CONFIRM=yes
//   SDLC_CODEX_WORKING_DIRECTORY=<absolute path to a git repository>

import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ExecutionGateway } from "../execution/gateway";
import { createRuntimeBindingRegistry, run } from "../runtime";
import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopRunStore } from "../core/loop-run-store";
import { validateSmokeEnvironment } from "./codex-real-dispatch-smoke";

function hasEnabledSideEffectFlags(env: Record<string, string | undefined>): boolean {
  return (
    env.SDLC_POLICY_MEMORY === "enabled" ||
    env.SDLC_POLICY_MEMORY_READ === "enabled" ||
    env.SDLC_SKILL_FLOW_RUNTIME_INTEGRATION === "shadow" ||
    env.SDLC_KIMI_RUNTIME_ATTACHMENT === "enabled"
  );
}

async function main() {
  const validation = validateSmokeEnvironment(process.env);
  if (validation.ok === false) {
    console.error(validation.message);
    process.exit(1);
  }
  if (hasEnabledSideEffectFlags(process.env)) {
    console.error(
      "Refused: unrelated Runtime side-effect flags must remain disabled for this smoke test."
    );
    process.exit(1);
  }

  const runtimeEnv = {
    SDLC_EXECUTION_MODE: "codex" as const,
    SDLC_CODEX_REAL_DISPATCH: "enabled" as const,
  };

  const workspaceRoot = mkdtempSync(join(tmpdir(), "sdlc-runtime-real-smoke-"));
  mkdirSync(join(workspaceRoot, "repo"), { recursive: true });
  const runStore = new LoopRunStore(join(workspaceRoot, "journal.db"));
  const artifactStore = new LoopArtifactStore({
    controlRoot: join(workspaceRoot, "control"),
    repositoryPath: join(workspaceRoot, "repo"),
  });
  runStore.init();
  artifactStore.init();
  const bindingRegistry = createRuntimeBindingRegistry();

  const gateway = new ExecutionGateway({
    env: runtimeEnv,
    codexRealDispatchConfig: {
      workingDirectory: validation.workingDirectory,
      timeoutMs: 120_000,
      maxStdoutChars: 64_000,
      maxStderrChars: 16_000,
    },
    capabilityTracing: {
      runStore,
      artifactStore,
      bindingRegistry,
      executorVersions: { codex: "1.0.0", kimi: "1.0.0", hermes: "1.0.0" },
    },
  });

  const requirement =
    "Add an exported addNumbers(a, b) function to math.ts and return a patch only. Do not modify files.";

  const result = await run(requirement, {
    requirementId: `REQ-SMOKE-${Date.now()}`,
    runStore,
    artifactStore,
    bindingRegistry,
    gateway,
  });

  const trace = result.execution_trace;
  const codexAttempts = trace.filter((entry) => entry.agent === "codex");
  const codexSucceeded = codexAttempts.filter((entry) => entry.status === "succeeded");
  const verdictAttempts = trace.filter(
    (entry) => entry.capability === "solution-gate" && entry.executionRole === "formal_verdict"
  );
  const scanAttempts = trace.filter(
    (entry) => entry.capability === "solution-gate" && entry.executionRole === "adversarial_scan"
  );
  const scanAgents = new Set(scanAttempts.map((entry) => entry.agent));
  const verdictAgents = new Set(verdictAttempts.map((entry) => entry.agent));
  const dualAgentHeld =
    scanAgents.size > 0 &&
    verdictAgents.size > 0 &&
    [...verdictAgents].every((agent) => !scanAgents.has(agent));

  // The chain cannot legitimately complete on real dispatch today: the
  // verdict slot is bound to hermes (no real capability dispatch), so an
  // honest run must stop around the gate instead of reusing the scan agent.
  // Pre-Q1 the three codex-bound points preceding the gate journaled six
  // events (started + succeeded each); under Q1 only adversarial_scan is
  // codex-bound, so this count is STALE pending the E5 three-agent rewrite
  // (see the Q1 STALE note in the file header).
  const passed =
    result.final_status === "failed" &&
    result.chain_status !== "COMPLETED" &&
    codexAttempts.length >= 6 && // pre-Q1 threshold; STALE under Q1, see header note
    codexSucceeded.length >= 3 &&
    dualAgentHeld;

  console.log(`runtime v2 real smoke: ${passed ? "PASS" : "FAIL"}`);
  console.log(`final_status: ${result.final_status} (chain ${result.chain_status})`);
  console.log(
    `trace: ${trace
      .map((entry) => `${entry.capability}/${entry.executionRole}:${entry.agent}:${entry.status}`)
      .join(" → ")}`
  );
  console.log(`codex attempts/succeeded: ${codexAttempts.length}/${codexSucceeded.length}`);
  console.log(`dual-agent solution-gate held: ${dualAgentHeld}`);
  console.log(`journal: ${result.journal_path}`);
  process.exit(passed ? 0 : 1);
}

const isMain = process.argv[1] === __filename;
if (isMain) {
  main().catch(() => {
    console.error("Runtime smoke test failed with an unexpected error.");
    process.exit(1);
  });
}
