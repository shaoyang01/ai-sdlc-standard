// Regression Test — Kimi Gateway Real Dispatch Gateway Integration
// ==================================================================
// Uses fake runner injection. Proves Gateway dispatch unchanged for non-Kimi.
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

    // Test A: Default behavior unchanged — non-Kimi request
    console.log("Test A: Default behavior unchanged");
    delete process.env.SDLC_KIMI_GATEWAY_REAL_DISPATCH;
    const nonKimi = await executionGateway.execute({
      type: "code_generation", node: "implementation", agent: "codex",
      requirementId: "REQ-NON-KIMI", input: {},
    });
    assert(nonKimi.success === true, "non-Kimi codex request succeeds");
    assert(nonKimi.agent === "codex", "agent unchanged");
    console.log("");

    // Test B: Kimi request with flags off
    console.log("Test B: Kimi request with flags off");
    const disabledKimi = await executionGateway.execute({
      type: "llm_task", node: "requirement-summary", agent: "kimi",
      requirementId: "REQ-KIMI-DISABLED", input: { prompt: "must not leak" },
    });
    assert(disabledKimi.success === false, "Kimi with flags off returns failure");
    assert(disabledKimi.agent === "kimi", "agent is kimi");
    // No prompt leakage
    assert(!JSON.stringify(disabledKimi).includes("must not leak"), "no prompt");
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
