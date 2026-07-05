// Regression Test — Kimi Adapter Contract Stub
// ==============================================
// Verifies contract-only behavior. No network, no secrets.

import {
  getKimiAdapterConfig,
  getKimiAdapterSupportMatrix,
  parseKimiMockResponse,
  executeKimiAdapterContractOnly,
} from "../execution/kimi-adapter-contract";
import type { ExecutionRequest } from "../execution/types";

const request: ExecutionRequest = {
  type: "llm_task",
  node: "requirement-summary",
  agent: "kimi",
  requirementId: "REQ-KIMI-CONTRACT",
  input: { prompt: "mock prompt" },
};

async function test() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) { passed++; console.log(`  ✓ ${message}`); }
    else { failed++; console.error(`  ✗ ${message}`); }
  }

  console.log("Kimi Adapter Contract Test\n");

  // ── Test 1: Default config disabled ──
  console.log("Test 1: Default config disabled");
  const defaultCfg = getKimiAdapterConfig({});
  assert(defaultCfg.enabled === false, "default: enabled false");
  assert(defaultCfg.source === "default", "default: source default");
  assert(defaultCfg.hasApiKey === false, "default: no API key");
  console.log("");

  // ── Test 2: Enabled config ──
  console.log("Test 2: Enabled config");
  const enabledCfg = getKimiAdapterConfig({ SDLC_KIMI_ADAPTER: "enabled", KIMI_API_KEY: "sk-test" });
  assert(enabledCfg.enabled === true, "enabled: enabled true");
  assert(enabledCfg.hasApiKey === true, "enabled: has API key");
  // No raw key exposed — only boolean
  console.log("");

  // ── Test 3: Invalid timeout falls back ──
  console.log("Test 3: Invalid timeout falls back");
  const badTimeout = getKimiAdapterConfig({ SDLC_KIMI_ADAPTER: "enabled", KIMI_TIMEOUT_MS: "bad" });
  assert(badTimeout.timeoutMs === 120000, "bad timeout → default 120000");
  const validTimeout = getKimiAdapterConfig({ SDLC_KIMI_ADAPTER: "enabled", KIMI_TIMEOUT_MS: "60000" });
  assert(validTimeout.timeoutMs === 60000, "valid timeout parsed");
  console.log("");

  // ── Test 4: Support matrix ──
  console.log("Test 4: Support matrix");
  const matrix = getKimiAdapterSupportMatrix();
  assert(matrix.contractOnly === true, "contractOnly true");
  assert(matrix.invokesNetwork === false, "invokesNetwork false");
  assert(matrix.readsSecretsDuringExecution === false, "readsSecretsDuringExecution false");
  assert(matrix.plannedRequestTypes.includes("llm_task"), "planned includes llm_task");
  assert(matrix.unsupportedRequestTypes.includes("validation"), "unsupported includes validation");
  assert(matrix.unsupportedRequestTypes.includes("bugfix"), "unsupported includes bugfix");
  console.log("");

  // ── Test 5: Mock parser ──
  console.log("Test 5: Mock parser");
  const good = parseKimiMockResponse({ request, mockResponse: { text: "hello" } });
  assert(good.success === true, "valid mock: success");
  assert(good.output["text"] === "hello", "valid mock: text preserved");
  const bad = parseKimiMockResponse({ request, mockResponse: { bad: true } });
  assert(bad.success === false, "invalid mock: fail");
  assert(bad.error!.includes("Invalid mock"), "invalid mock: error message");
  console.log("");

  // ── Test 6: Contract-only executor — disabled ──
  console.log("Test 6: Executor — disabled");
  const disabledResult = await executeKimiAdapterContractOnly(request, defaultCfg);
  assert(disabledResult.success === false, "disabled: success false");
  assert(disabledResult.error === "disabled", "disabled: error disabled");
  console.log("");

  // ── Test 7: Contract-only executor — missing config ──
  console.log("Test 7: Executor — missing config");
  const missingKeyCfg = getKimiAdapterConfig({ SDLC_KIMI_ADAPTER: "enabled" });
  const missingResult = await executeKimiAdapterContractOnly(request, missingKeyCfg);
  assert(missingResult.success === false, "missing key: success false");
  assert(missingResult.error === "missing_config", "missing key: error missing_config");
  console.log("");

  // ── Test 8: Contract-only executor — contract-only even with key ──
  console.log("Test 8: Executor — contract-only even when enabled with key");
  const contractResult = await executeKimiAdapterContractOnly(request, enabledCfg);
  assert(contractResult.success === false, "contract: success false");
  assert(contractResult.error === "contract_only", "contract: error contract_only");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
