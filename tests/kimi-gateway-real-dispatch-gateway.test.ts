// Regression Test — Kimi Gateway Real Dispatch Gateway Integration
// ==================================================================
// No real Kimi CLI calls.

import { executionGateway } from "../execution/gateway";

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

    // Test A: Default Kimi request falls through to shadow
    console.log("Test A: Default Kimi request falls through to shadow");
    delete process.env.SDLC_KIMI_GATEWAY_REAL_DISPATCH;
    delete process.env.SDLC_KIMI_GATEWAY_INTEGRATION;
    delete process.env.SDLC_KIMI_CLI_COMMAND_EXECUTION;
    const shadowKimi = await executionGateway.execute({
      type: "llm_task", node: "requirement-summary", agent: "kimi",
      requirementId: "REQ-KIMI-FLAGS-OFF", input: { prompt: "must not leak" },
    });
    assert(shadowKimi.success === true, "Kimi with flags off → shadow success");
    assert(shadowKimi.agent === "kimi", "agent is kimi");
    assert(shadowKimi.artifacts.length > 0 && shadowKimi.artifacts[0].type === "shadow_output", "shadow artifact");
    console.log("");

    // Test B: Non-Kimi unchanged
    console.log("Test B: Non-Kimi request unchanged");
    const codex = await executionGateway.execute({
      type: "code_generation", node: "implementation", agent: "codex",
      requirementId: "REQ-CODEX", input: {},
    });
    assert(codex.success === true && codex.agent === "codex", "codex unchanged");
    console.log("");

    // Test C: All flags enabled but missing config → structured failure
    console.log("Test C: All flags enabled, missing config");
    process.env.SDLC_KIMI_GATEWAY_REAL_DISPATCH = "enabled";
    process.env.SDLC_KIMI_GATEWAY_INTEGRATION = "enabled";
    process.env.SDLC_KIMI_CLI_COMMAND_EXECUTION = "enabled";
    const noConfig = await executionGateway.execute({
      type: "llm_task", node: "requirement-summary", agent: "kimi",
      requirementId: "REQ-NO-CONFIG", input: {},
    });
    assert(noConfig.success === false, "no config → failure");
    // No prompt in this request since input doesn't have prompt
    console.log("");

    // Test D: Unsupported type → doesn't trigger Kimi dispatch
    console.log("Test D: Unsupported type falls through");
    const unsupported = await executionGateway.execute({
      type: "code_generation", node: "implementation", agent: "kimi",
      requirementId: "REQ-UNSUPPORTED", input: {},
    });
    // Should fall through to shadow since type !== llm_task
    assert(unsupported.success === true, "unsupported type → shadow");
    console.log("");

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
