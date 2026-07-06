// Regression Test — Hermes Gateway Real Dispatch
// =================================================
// Fake runner only. No real Hermes CLI.

import {
  dispatchHermesGatewayReal,
} from "../execution/hermes-gateway-real-dispatch";
import { HERMES_GATEWAY_REAL_DISPATCH_FLAG } from "../execution/hermes-gateway-real-dispatch-contract";
import { HERMES_GATEWAY_INTEGRATION_FLAG } from "../execution/hermes-gateway-integration-contract";
import { HERMES_CLI_COMMAND_EXECUTION_FLAG } from "../execution/hermes-cli-command-executor";
import type { HermesCliProcessRunner } from "../execution/hermes-cli-command-executor";
import type { CliAdapterConfig } from "../execution/cli-adapter-contract-types";
import type { ExecutionRequest } from "../execution/types";
import * as fs from "fs";

const request: ExecutionRequest = {
  type: "validation", node: "validation", agent: "hermes",
  requirementId: "REQ-HERMES-DISPATCH",
  input: { prompt: "THIS_HERMES_GATEWAY_REAL_DISPATCH_PROMPT_MUST_NOT_LEAK" },
};
const validConfig: CliAdapterConfig = {
  adapter: "hermes", enabled: true, source: "test_override",
  command: "hermes", args: ["--mode", "review"], timeoutMs: 120000,
};
const allOn: Record<string, string | undefined> = {
  [HERMES_GATEWAY_REAL_DISPATCH_FLAG]: "enabled",
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
  console.log("Hermes Gateway Real Dispatch Test\n");

  // Test 1: Default disabled
  console.log("Test 1: Default disabled");
  let called1 = 0;
  const r1 = await dispatchHermesGatewayReal({ request, config: validConfig, env: {},
    runner: { run: async () => { called1++; return { exitCode: 0, durationMs: 1, stdout: "", stderr: "" }; } },
  });
  assert(r1.status === "dispatch_disabled", "disabled");
  assert(r1.enabled === false && r1.eligible === false && r1.executed === false, "not enabled/eligible/executed");
  assert(r1.contractDecision === "real_dispatch_disabled", "contract disabled");
  assert(r1.fallbackAction === "preserve_existing_gateway_behavior", "preserve behavior");
  assert(called1 === 0, "runner not called");
  assert(r1.affectsPrimaryGatewayResult === false && r1.changesGatewayPrimaryDispatch === false, "no gateway effects");
  assert(r1.changesRuntimeFinalStatus === false && r1.changesRuntimeRouting === false, "no runtime effects");
  console.log("");

  // Test 2: Integration disabled
  console.log("Test 2: Integration disabled");
  let called2 = 0;
  const r2 = await dispatchHermesGatewayReal({ request, config: validConfig,
    env: { [HERMES_GATEWAY_REAL_DISPATCH_FLAG]: "enabled", [HERMES_CLI_COMMAND_EXECUTION_FLAG]: "enabled" },
    runner: { run: async () => { called2++; return { exitCode: 0, durationMs: 1, stdout: "", stderr: "" }; } },
  });
  assert(r2.status === "dispatch_ineligible", "ineligible");
  assert(r2.contractDecision === "gateway_integration_disabled", "integration disabled");
  assert(r2.executed === false, "not executed");
  assert(called2 === 0, "runner not called");
  console.log("");

  // Test 3: Command flag disabled
  console.log("Test 3: Command flag disabled");
  let called3 = 0;
  const r3 = await dispatchHermesGatewayReal({ request, config: validConfig,
    env: { [HERMES_GATEWAY_REAL_DISPATCH_FLAG]: "enabled", [HERMES_GATEWAY_INTEGRATION_FLAG]: "enabled" },
    runner: { run: async () => { called3++; return { exitCode: 0, durationMs: 1, stdout: "", stderr: "" }; } },
  });
  assert(r3.status === "dispatch_ineligible", "ineligible");
  assert(r3.contractDecision === "command_execution_disabled", "command disabled");
  assert(called3 === 0, "runner not called");
  console.log("");

  // Test 4: Unsupported request types
  console.log("Test 4: Unsupported request types");
  for (const t of ["llm_task", "code_generation", "bugfix"]) {
    let called = 0;
    const r = await dispatchHermesGatewayReal({
      request: { ...request, type: t as any }, config: validConfig, env: allOn,
      runner: { run: async () => { called++; return { exitCode: 0, durationMs: 1, stdout: "", stderr: "" }; } },
    });
    assert(r.status === "dispatch_ineligible", `${t} ineligible`);
    assert(r.contractDecision === "unsupported_request_type", `${t} unsupported`);
    assert(called === 0, `${t} runner not called`);
  }
  console.log("");

  // Test 5: Adapter disabled
  console.log("Test 5: Adapter disabled");
  const r5 = await dispatchHermesGatewayReal({
    request: { ...request, type: "review" },
    config: { ...validConfig, enabled: false }, env: allOn,
    runner: { run: async () => { throw new Error("nope"); } },
  });
  assert(r5.status === "dispatch_ineligible", "adapter disabled");
  assert(r5.contractDecision === "adapter_disabled", "adapter disabled decision");
  console.log("");

  // Test 6: Missing command
  console.log("Test 6: Missing command");
  const r6 = await dispatchHermesGatewayReal({
    request: { ...request, type: "review" },
    config: { ...validConfig, command: "" }, env: allOn,
    runner: { run: async () => { throw new Error("nope"); } },
  });
  assert(r6.status === "dispatch_ineligible", "missing command");
  assert(r6.contractDecision === "missing_cli_command", "missing command decision");
  console.log("");

  // Test 7: Fake success
  console.log("Test 7: Fake success");
  let called7 = 0;
  const r7 = await dispatchHermesGatewayReal({
    request, config: validConfig, env: allOn,
    runner: { run: async () => { called7++; return { exitCode: 0, durationMs: 5, stdout: "ok", stderr: "" }; } },
  });
  assert(r7.status === "dispatch_executed_success", "success");
  assert(r7.enabled === true && r7.eligible === true && r7.executed === true, "enabled/eligible/executed");
  assert(r7.contractDecision === "eligible_contract_only", "eligible decision");
  assert(r7.commandDecision === "executed_success", "command success");
  assert(r7.fallbackAction === "preserve_existing_gateway_behavior", "fallback preserve");
  assert(called7 === 1, "runner called once");
  assert(r7.affectsPrimaryGatewayResult === false, "no primary");
  assert(r7.changesGatewayPrimaryDispatch === false, "no gateway change");
  assert(r7.changesRuntimeFinalStatus === false && r7.changesRuntimeRouting === false, "no runtime effects");
  assert(r7.writesFiles === false && r7.persistsAudit === false, "no files/persist");
  assert(r7.containsRawPrompt === false && r7.containsSecrets === false, "no raw/secrets");
  console.log("");

  // Test 8: Fake failure sanitizes
  console.log("Test 8: Fake failure sanitizes");
  const r8 = await dispatchHermesGatewayReal({
    request, config: validConfig, env: allOn,
    runner: fr({ exitCode: 1, durationMs: 5, stdout: "", stderr: "failed token=abc password=123 api_key=xyz sk-test" }),
  });
  assert(r8.status === "dispatch_executed_failure", "failure");
  assert(r8.executed === true, "executed true");
  assert(r8.fallbackAction === "fallback_without_final_status_change", "fallback failure");
  const j8 = JSON.stringify(r8);
  assert(!j8.includes("abc"), "no abc");
  assert(!j8.includes("123"), "no 123");
  assert(!j8.includes("xyz"), "no xyz");
  assert(!j8.includes("sk-test"), "no sk-test");
  console.log("");

  // Test 9: Fake timeout
  console.log("Test 9: Fake timeout");
  const r9 = await dispatchHermesGatewayReal({
    request, config: validConfig, env: allOn,
    runner: fr({ timedOut: true, durationMs: 120000, stderr: "timeout" }),
  });
  assert(r9.status === "dispatch_executed_timeout", "timeout");
  assert(r9.commandDecision === "executed_timeout", "command timeout");
  assert(r9.fallbackAction === "fallback_without_final_status_change", "fallback timeout");
  console.log("");

  // Test 10: Fake runner throws -> guarded fallback sanitizes
  console.log("Test 10: Fake runner throws -> guarded fallback sanitizes");
  const rThrow = await dispatchHermesGatewayReal({
    request,
    config: validConfig,
    env: allOn,
    runner: {
      run: async () => {
        throw new Error(
          "boom token=abc password=123 api_key=xyz sk-test THIS_HERMES_GATEWAY_REAL_DISPATCH_PROMPT_MUST_NOT_LEAK"
        );
      },
    },
  });
  assert(rThrow.status === "dispatch_guarded_fallback", "guarded fallback on throw");
  assert(rThrow.eligible === true, "throw eligible true");
  assert(rThrow.executed === false, "throw executed false");
  assert(rThrow.fallbackAction === "fallback_without_final_status_change", "throw fallback action");
  const jThrow = JSON.stringify(rThrow);
  assert(!jThrow.includes("abc"), "throw no abc");
  assert(!jThrow.includes("123"), "throw no 123");
  assert(!jThrow.includes("xyz"), "throw no xyz");
  assert(!jThrow.includes("sk-test"), "throw no sk-test");
  assert(!jThrow.includes("THIS_HERMES_GATEWAY_REAL_DISPATCH_PROMPT_MUST_NOT_LEAK"), "throw no prompt marker");
  assert(rThrow.affectsPrimaryGatewayResult === false, "throw no primary");
  assert(rThrow.changesGatewayPrimaryDispatch === false, "throw no gateway change");
  assert(rThrow.changesRuntimeFinalStatus === false, "throw no final status");
  assert(rThrow.changesRuntimeRouting === false, "throw no routing");
  assert(rThrow.writesFiles === false, "throw no files");
  assert(rThrow.persistsAudit === false, "throw no persist");
  assert(rThrow.containsRawPrompt === false, "throw no raw prompt");
  assert(rThrow.containsRawArtifacts === false, "throw no raw artifacts");
  assert(rThrow.containsSecrets === false, "throw no secrets");
  console.log("");

  // Test 11: Raw prompt does not leak
  console.log("Test 11: Raw prompt does not leak");
  for (const r of [r1, r2, r3, r7, r8, r9, rThrow]) {
    assert(!JSON.stringify(r).includes("THIS_HERMES_GATEWAY_REAL_DISPATCH_PROMPT_MUST_NOT_LEAK"), `${r.status}: no prompt leak`);
  }
  console.log("");

  // Test 12: Standalone helper does not attach Gateway-only sidecar metadata
  console.log("Test 12: Standalone helper does not attach Gateway-only sidecar metadata");
  for (const r of [r1, r2, r3, r5, r6, r7, r8, r9, rThrow]) {
    assert(r.fallbackPolicy === undefined, `${r.status}: no standalone fallback policy`);
    assert(r.observability === undefined, `${r.status}: no standalone observability`);
  }
  console.log("");

  // Test 13: Safety fields
  console.log("Test 13: Safety fields");
  for (const r of [r1, r2, r3, r5, r6, r7, r8, r9, rThrow]) {
    assert(r.affectsPrimaryGatewayResult === false, `${r.status}: no primary`);
    assert(r.changesGatewayPrimaryDispatch === false, `${r.status}: no gateway change`);
    assert(r.changesRuntimeFinalStatus === false, `${r.status}: no final status`);
    assert(r.changesRuntimeRouting === false, `${r.status}: no routing`);
    assert(r.writesFiles === false, `${r.status}: no files`);
    assert(r.persistsAudit === false, `${r.status}: no persist`);
    assert(r.containsRawPrompt === false, `${r.status}: no raw prompt`);
    assert(r.containsRawArtifacts === false, `${r.status}: no raw artifacts`);
    assert(r.containsSecrets === false, `${r.status}: no secrets`);
  }
  console.log("");

  // Test 14: Forbidden imports
  console.log("Test 14: Forbidden imports");
  const src = fs.readFileSync("execution/hermes-gateway-real-dispatch.ts", "utf-8");
  const forbidden = ["runtime", "execution/gateway", "child_process", "kimi-gateway-real-dispatch", "codex", "policy-memory", "graph", "\"fs\"", "http", "https", "fetch"];
  const badLines = src.split("\n").filter((l: string) => {
    if (!l.includes("import ")) return false;
    const fromIdx = l.indexOf(" from ");
    if (fromIdx === -1) return false;
    const path = l.slice(fromIdx + 6).trim();
    for (const f of forbidden) {
      if (path.includes(f)) return true;
    }
    return false;
  });
  assert(badLines.length === 0, `no forbidden imports (found ${badLines.length})`);
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
