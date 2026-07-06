// Regression Test — Hermes Gateway Shadow Sidecar
// ===================================================
// Fake runner only. No real Hermes CLI.

import {
  runHermesGatewayShadowSidecar,
  HERMES_GATEWAY_SHADOW_FLAG,
} from "../execution/hermes-gateway-shadow-sidecar";
import { HERMES_GATEWAY_INTEGRATION_FLAG } from "../execution/hermes-gateway-integration-contract";
import { HERMES_CLI_COMMAND_EXECUTION_FLAG } from "../execution/hermes-cli-command-executor";
import type { HermesCliProcessRunner } from "../execution/hermes-cli-command-executor";
import type { CliAdapterConfig } from "../execution/cli-adapter-contract-types";
import type { ExecutionRequest } from "../execution/types";
import * as fs from "fs";

const validConfig: CliAdapterConfig = {
  adapter: "hermes", enabled: true, source: "test_override",
  command: "hermes", args: ["--mode", "review"], timeoutMs: 120000,
};
const request: ExecutionRequest = {
  type: "validation", node: "validation", agent: "hermes",
  requirementId: "REQ-HERMES-SHADOW",
  input: { prompt: "THIS_HERMES_SHADOW_PROMPT_MUST_NOT_LEAK" },
};
const allOn: Record<string, string | undefined> = {
  [HERMES_GATEWAY_SHADOW_FLAG]: "enabled",
  [HERMES_GATEWAY_INTEGRATION_FLAG]: "enabled",
  [HERMES_CLI_COMMAND_EXECUTION_FLAG]: "enabled",
};

function fr(v: any): HermesCliProcessRunner { return { run: async () => v }; }

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Hermes Gateway Shadow Sidecar Test\n");

  // Test 1: Shadow flag disabled
  console.log("Test 1: Shadow flag disabled");
  let called1 = 0;
  const r1 = await runHermesGatewayShadowSidecar({
    request, config: validConfig, env: {
      [HERMES_GATEWAY_INTEGRATION_FLAG]: "enabled",
      [HERMES_CLI_COMMAND_EXECUTION_FLAG]: "enabled",
    },
    runner: { run: async () => { called1++; return { exitCode: 0, durationMs: 1, stdout: "", stderr: "" }; } },
  });
  assert(r1.status === "shadow_disabled", "shadow_disabled");
  assert(r1.enabled === false, "not enabled");
  assert(r1.executed === false, "not executed");
  assert(r1.affectsPrimaryGatewayResult === false, "no primary gateway effect");
  assert(r1.affectsRuntimeRouting === false, "no routing");
  assert(r1.affectsFinalStatus === false, "no final status");
  assert(called1 === 0, "runner not called");
  console.log("");

  // Test 2: Integration flag missing
  console.log("Test 2: Integration flag missing");
  let called2 = 0;
  const r2 = await runHermesGatewayShadowSidecar({
    request, config: validConfig, env: {
      [HERMES_GATEWAY_SHADOW_FLAG]: "enabled",
      [HERMES_CLI_COMMAND_EXECUTION_FLAG]: "enabled",
    },
    runner: { run: async () => { called2++; return { exitCode: 0, durationMs: 1, stdout: "", stderr: "" }; } },
  });
  assert(r2.status === "integration_ineligible", "ineligible");
  assert(r2.integrationDecision === "gateway_integration_disabled", "integration disabled");
  assert(r2.executed === false, "not executed");
  assert(called2 === 0, "runner not called");
  console.log("");

  // Test 3: Command flag missing
  console.log("Test 3: Command flag missing");
  let called3 = 0;
  const r3 = await runHermesGatewayShadowSidecar({
    request, config: validConfig, env: {
      [HERMES_GATEWAY_SHADOW_FLAG]: "enabled",
      [HERMES_GATEWAY_INTEGRATION_FLAG]: "enabled",
    },
    runner: { run: async () => { called3++; return { exitCode: 0, durationMs: 1, stdout: "", stderr: "" }; } },
  });
  assert(r3.status === "integration_ineligible", "command disabled ineligible");
  assert(r3.integrationDecision === "command_execution_disabled", "command disabled");
  assert(called3 === 0, "runner not called");
  console.log("");

  // Test 4: Unsupported request types
  console.log("Test 4: Unsupported request types");
  for (const t of ["llm_task", "code_generation", "bugfix"]) {
    let called = 0;
    const r = await runHermesGatewayShadowSidecar({
      request: { ...request, type: t as any },
      config: validConfig, env: allOn,
      runner: { run: async () => { called++; return { exitCode: 0, durationMs: 1, stdout: "", stderr: "" }; } },
    });
    assert(r.status === "integration_ineligible", `${t} ineligible`);
    assert(r.integrationDecision === "unsupported_request_type", `${t} unsupported`);
    assert(r.executed === false, `${t} not executed`);
    assert(called === 0, `${t} runner not called`);
  }
  console.log("");

  // Test 5: Supported request type fake success
  console.log("Test 5: Fake success");
  let called5 = 0;
  const r5 = await runHermesGatewayShadowSidecar({
    request, config: validConfig, env: allOn,
    runner: { run: async () => { called5++; return { exitCode: 0, durationMs: 5, stdout: "ok", stderr: "" }; } },
  });
  assert(r5.status === "shadow_executed_success", "success");
  assert(r5.enabled === true, "enabled");
  assert(r5.executed === true, "executed");
  assert(r5.integrationDecision === "eligible_contract_only", "eligible");
  assert(r5.commandDecision === "executed_success", "command success");
  assert(called5 === 1, "runner called once");
  assert(r5.affectsPrimaryGatewayResult === false, "no primary gateway");
  assert(r5.affectsRuntimeRouting === false && r5.affectsFinalStatus === false, "no effects");
  assert(!JSON.stringify(r5).includes("THIS_HERMES_SHADOW_PROMPT_MUST_NOT_LEAK"), "no prompt leak");
  console.log("");

  // Test 6: Fake failure sanitizes
  console.log("Test 6: Fake failure sanitizes");
  const r6 = await runHermesGatewayShadowSidecar({
    request, config: validConfig, env: allOn,
    runner: fr({ exitCode: 1, durationMs: 5, stdout: "", stderr: "failed token=abc password=123 sk-test api_key=xyz" }),
  });
  assert(r6.status === "shadow_executed_failure", "failure");
  assert(r6.commandDecision === "executed_failure", "command failure");
  const j6 = JSON.stringify(r6);
  assert(!j6.includes("abc"), "no abc");
  assert(!j6.includes("123"), "no 123");
  assert(!j6.includes("sk-test"), "no sk-test");
  assert(!j6.includes("xyz"), "no xyz");
  console.log("");

  // Test 7: Fake timeout
  console.log("Test 7: Fake timeout");
  const r7 = await runHermesGatewayShadowSidecar({
    request, config: validConfig, env: allOn,
    runner: fr({ timedOut: true, durationMs: 120000, stderr: "timeout" }),
  });
  assert(r7.status === "shadow_executed_timeout", "timeout");
  assert(r7.commandDecision === "executed_timeout", "command timeout");
  console.log("");

  // Test 8: Raw prompt does not leak
  console.log("Test 8: Raw prompt does not leak");
  for (const r of [r1, r2, r3, r5, r6, r7]) {
    assert(!JSON.stringify(r).includes("THIS_HERMES_SHADOW_PROMPT_MUST_NOT_LEAK"), `${r.status}: no prompt leak`);
  }
  console.log("");

  // Test 9: Audit event safety
  console.log("Test 9: Audit event safety");
  const allResults = [r1, r2, r3, r5, r6, r7];
  for (const r of allResults) {
    assert(Array.isArray(r.auditEvents) && r.auditEvents.length > 0, `${r.status}: audit events exist`);
    for (const ae of r.auditEvents) {
      assert(ae.affectsPrimaryGatewayResult === false, `${r.status}: audit no primary`);
      assert(ae.affectsRuntimeRouting === false, `${r.status}: audit no routing`);
      assert(ae.affectsFinalStatus === false, `${r.status}: audit no final status`);
      assert(ae.writesFiles === false, `${r.status}: audit no writes`);
      assert(ae.persistsAudit === false, `${r.status}: audit no persist`);
      assert(ae.containsRawPrompt === false, `${r.status}: audit no raw prompt`);
      assert(ae.containsRawArtifacts === false, `${r.status}: audit no raw artifacts`);
      assert(ae.containsSecrets === false, `${r.status}: audit no secrets`);
    }
  }
  console.log("");

  // Test 10: No forbidden imports
  console.log("Test 10: No forbidden imports");
  const src = fs.readFileSync("execution/hermes-gateway-shadow-sidecar.ts", "utf-8");
  const forbidden = ["runtime", "execution/gateway", "kimi-gateway-real-dispatch", "codex", "policy-memory", "graph", "\"fs\"", "http", "https", "fetch"];
  const badLines = src.split("\n").filter((l: string) => {
    if (!l.includes("import ")) return false;
    for (const f of forbidden) {
      if (l.includes(f)) return true;
    }
    return false;
  });
  assert(badLines.length === 0, `no forbidden imports (found ${badLines.length})`);
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
