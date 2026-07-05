// Regression Test — Kimi Gateway Real Dispatch Gateway Integration
// ==================================================================
// No real Kimi CLI calls. Uses injected Gateway instances.

import { ExecutionGateway } from "../execution/gateway";
import type { KimiCliProcessRunner } from "../execution/kimi-cli-command-executor";
import type { CliAdapterConfig } from "../execution/cli-adapter-contract-types";

const validConfig: CliAdapterConfig = {
  adapter: "kimi", enabled: true, source: "test_override",
  command: "kimi", args: ["--mode", "plan"], timeoutMs: 120000,
};

function fakeRunner(result: { exitCode: number; durationMs: number; stdout: string; stderr: string }): KimiCliProcessRunner {
  return { run: async () => result };
}
function throwingRunner(): KimiCliProcessRunner {
  return { run: async () => { throw new Error("should not be called"); } };
}

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }

  const orig = process.env.SDLC_KIMI_GATEWAY_REAL_DISPATCH;
  const origInt = process.env.SDLC_KIMI_GATEWAY_INTEGRATION;
  const origCmd = process.env.SDLC_KIMI_CLI_COMMAND_EXECUTION;

  try {
    console.log("Kimi Gateway Real Dispatch Gateway Test\n");

    // Test A: Default Kimi falls through to shadow (flags off, throwing runner)
    console.log("Test A: Default Kimi → shadow success");
    delete process.env.SDLC_KIMI_GATEWAY_REAL_DISPATCH;
    const gwA = new ExecutionGateway({ kimiRunner: throwingRunner() });
    const rA = await gwA.execute({
      type: "llm_task", node: "requirement-summary", agent: "kimi",
      requirementId: "REQ-A", input: {},
    });
    assert(rA.success === true && rA.agent === "kimi", "shadow success");
    assert(rA.artifacts[0].type === "shadow_output", "shadow artifact");
    console.log("");

    // Test B: Non-Kimi unchanged
    console.log("Test B: Non-Kimi unchanged");
    const rB = await gwA.execute({
      type: "code_generation", node: "implementation", agent: "codex",
      requirementId: "REQ-B", input: {},
    });
    assert(rB.success === true && rB.agent === "codex", "codex unchanged");
    console.log("");

    // Test C: All flags + fake success
    console.log("Test C: All flags + fake success");
    process.env.SDLC_KIMI_GATEWAY_REAL_DISPATCH = "enabled";
    process.env.SDLC_KIMI_GATEWAY_INTEGRATION = "enabled";
    process.env.SDLC_KIMI_CLI_COMMAND_EXECUTION = "enabled";
    let called = 0;
    const gwC = new ExecutionGateway({
      kimiConfig: validConfig,
      kimiRunner: {
        run: async () => { called++; return { exitCode: 0, durationMs: 12, stdout: "ok", stderr: "" }; },
      },
    });
    const rC = await gwC.execute({
      type: "llm_task", node: "requirement-summary", agent: "kimi",
      requirementId: "REQ-C", input: {},
    });
    assert(called === 1, "runner called once");
    assert(rC.success === true && rC.agent === "kimi", "kimi success");
    assert(rC.output["result"] === "kimi_executed_success", "executed_success");
    assert(rC.artifacts.length > 0, "artifacts exist");
    // Artifact agent is in metadata, not content
    assert((rC.artifacts[0] as any).metadata?.agent === "kimi" || rC.artifacts[0].content?.["result"] === "kimi_llm_task_completed", "artifact kimi");
    console.log("");

    // Test D: Unsupported type falls through
    console.log("Test D: Unsupported type → shadow");
    const gwD = new ExecutionGateway({ kimiRunner: throwingRunner() });
    const rD = await gwD.execute({
      type: "code_generation", node: "implementation", agent: "kimi",
      requirementId: "REQ-D", input: {},
    });
    assert(rD.success === true, "unsupported type → shadow");
    console.log("");

    // Test E: Missing integration flag → structured disabled
    console.log("Test E: Missing integration flag");
    process.env.SDLC_KIMI_GATEWAY_REAL_DISPATCH = "enabled";
    delete process.env.SDLC_KIMI_GATEWAY_INTEGRATION;
    delete process.env.SDLC_KIMI_CLI_COMMAND_EXECUTION;
    let eCalled = 0;
    const gwE = new ExecutionGateway({
      kimiConfig: validConfig,
      kimiRunner: { run: async () => { eCalled++; return { exitCode: 0, durationMs: 1, stdout: "", stderr: "" }; } },
    });
    const rE = await gwE.execute({
      type: "llm_task", node: "requirement-summary", agent: "kimi",
      requirementId: "REQ-E", input: {},
    });
    assert(eCalled === 0, "runner not called when integration missing");
    assert(rE.success === false, "structured disabled");
    assert(rE.output["fallback_reason"] === "gateway_integration_disabled", "reason integration_disabled");
    console.log("");

    // Test F: All flags + fake failure
    console.log("Test F: All flags + fake failure");
    process.env.SDLC_KIMI_GATEWAY_INTEGRATION = "enabled";
    process.env.SDLC_KIMI_CLI_COMMAND_EXECUTION = "enabled";
    const gwF = new ExecutionGateway({
      kimiConfig: validConfig,
      kimiRunner: { run: async () => ({ exitCode: 1, durationMs: 5, stdout: "", stderr: "failed token=abc password=123 sk-test" }) },
    });
    const rF = await gwF.execute({
      type: "llm_task", node: "requirement-summary", agent: "kimi",
      requirementId: "REQ-F", input: {},
    });
    assert(rF.success === false, "failure");
    assert(rF.output["fallback_action"] === "return_structured_failure", "action failure");
    assert(rF.output["fallback_reason"] === "cli_failure", "reason cli_failure");
    const jF = JSON.stringify(rF);
    assert(!jF.includes("abc") && !jF.includes("123") && !jF.includes("sk-test"), "sanitized");
    console.log("");

    // Test G: All flags + fake timeout
    console.log("Test G: All flags + fake timeout");
    const gwG = new ExecutionGateway({
      kimiConfig: validConfig,
      kimiRunner: { run: async () => ({ timedOut: true, durationMs: 120000, stderr: "timeout" }) },
    });
    const rG = await gwG.execute({
      type: "llm_task", node: "requirement-summary", agent: "kimi",
      requirementId: "REQ-G", input: {},
    });
    assert(rG.success === false, "timeout failure");
    assert(rG.output["fallback_action"] === "return_structured_timeout", "action timeout");
    assert(rG.output["fallback_reason"] === "cli_timeout", "reason cli_timeout");

  } finally {
    if (orig === undefined) delete process.env.SDLC_KIMI_GATEWAY_REAL_DISPATCH;
    else process.env.SDLC_KIMI_GATEWAY_REAL_DISPATCH = orig;
    if (origInt === undefined) delete process.env.SDLC_KIMI_GATEWAY_INTEGRATION;
    else process.env.SDLC_KIMI_GATEWAY_INTEGRATION = origInt;
    if (origCmd === undefined) delete process.env.SDLC_KIMI_CLI_COMMAND_EXECUTION;
    else process.env.SDLC_KIMI_CLI_COMMAND_EXECUTION = origCmd;
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
