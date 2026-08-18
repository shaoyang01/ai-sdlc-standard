// Agent Capability Binding — Tests (C01 WP-3)
// ===========================================
// Guards for the binding layer: full-capability matrix (7 x 3), schema
// integrity, no Git fields, and the replacement invariant (replacing a
// binding never changes Requirement ID, artifact schema, finding semantics,
// Re-Gate routing or the manual Git boundary — the node contracts stay
// untouched). Plus codex request-type extension coverage.

import { NODE_CAPABILITY_IDS } from "../loop/types";
import {
  AGENT_CAPABILITY_BINDINGS,
  getBinding,
  replaceBinding,
} from "../core/agent-capability-bindings";
import { NODE_CAPABILITY_CONTRACTS } from "../core/node-capability-contracts";
import { isSupportedCodexRequestType } from "../execution/codex-real-dispatch-runner";

let passed = 0;
let failed = 0;
function assert(condition: boolean, message: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

const AGENTS = ["codex", "kimi", "hermes"] as const;

// Schema allowlist: the exact binding fields. Any new field (especially a
// Git field) must be added here explicitly — fail-closed.
const BINDING_FIELDS = [
  "bindingId",
  "capability",
  "agent",
  "adapter",
  "bindingVersion",
  "inputFormat",
  "outputContract",
  "validator",
  "allowedSideEffects",
  "timeoutMs",
  "failurePolicy",
  "enabled",
] as const;

console.log("binding: full-capability matrix (7 capabilities x 3 agents)");
assert(AGENT_CAPABILITY_BINDINGS.length === 21, "exactly 21 bindings");
{
  const pairs = new Set(AGENT_CAPABILITY_BINDINGS.map((b) => `${b.agent}:${b.capability}`));
  assert(pairs.size === 21, "agent:capability pairs are unique");
  for (const agent of AGENTS) {
    for (const capability of NODE_CAPABILITY_IDS) {
      assert(pairs.has(`${agent}:${capability}`), `binding exists for ${agent}:${capability}`);
    }
  }
  const ids = new Set(AGENT_CAPABILITY_BINDINGS.map((b) => b.bindingId));
  assert(ids.size === 21, "bindingIds are unique");
  for (const id of ids) {
    assert(/^binding-[a-z]+-[a-z]+(-[a-z]+)*$/.test(id), `bindingId ${id} matches format`);
  }
}

console.log("binding: initial enablement (codex enabled, kimi/hermes disabled)");
for (const capability of NODE_CAPABILITY_IDS) {
  assert(getBinding(`binding-codex-${capability}`)?.enabled === true, `codex ${capability} enabled`);
  assert(getBinding(`binding-kimi-${capability}`)?.enabled === false, `kimi ${capability} disabled`);
  assert(getBinding(`binding-hermes-${capability}`)?.enabled === false, `hermes ${capability} disabled`);
}

console.log("binding: schema integrity");
for (const binding of AGENT_CAPABILITY_BINDINGS) {
  const label = binding.bindingId;
  const keys = Object.keys(binding);
  assert(
    keys.length === BINDING_FIELDS.length && keys.every((k) => (BINDING_FIELDS as readonly string[]).includes(k)),
    `${label}: exactly the schema fields (no unknown/Git fields)`,
  );
  assert(binding.bindingVersion.trim().length > 0, `${label}: bindingVersion non-empty`);
  assert(binding.adapter.trim().length > 0, `${label}: adapter non-empty`);
  assert(binding.inputFormat.trim().length > 0, `${label}: inputFormat non-empty`);
  assert(binding.outputContract.trim().length > 0, `${label}: outputContract non-empty`);
  assert(binding.validator.trim().length > 0, `${label}: validator non-empty`);
  assert(binding.allowedSideEffects.length > 0, `${label}: allowedSideEffects non-empty`);
  assert(Number.isInteger(binding.timeoutMs) && binding.timeoutMs > 0, `${label}: timeoutMs positive integer`);
  assert(
    binding.failurePolicy === "retry_other_binding" || binding.failurePolicy === "block",
    `${label}: failurePolicy is a known policy`,
  );
  const adapterByAgent: Record<string, string> = {
    codex: "codex-real-dispatch",
    kimi: "kimi-cli",
    hermes: "hermes-cli",
  };
  assert(binding.adapter === adapterByAgent[binding.agent], `${label}: adapter matches agent`);
}

console.log("binding: no Git fields anywhere");
{
  const gitWords = ["commit", "push", "pr", "merge", "publish", "repository", "branch"];
  const fieldsJson = JSON.stringify(AGENT_CAPABILITY_BINDINGS).toLowerCase();
  for (const word of gitWords) {
    assert(!fieldsJson.includes(`"${word}`), `no Git field '${word}' in binding schema or values`);
  }
}

console.log("binding: replacement guard (node contracts untouched)");
{
  const contractsBefore = JSON.stringify(NODE_CAPABILITY_CONTRACTS);
  const contractsRef = NODE_CAPABILITY_CONTRACTS;

  const result = replaceBinding("binding-codex-implementation", "binding-kimi-implementation");
  assert(result.disabled.bindingId === "binding-codex-implementation" && result.disabled.enabled === false, "codex binding disabled");
  assert(result.enabled.bindingId === "binding-kimi-implementation" && result.enabled.enabled === true, "kimi binding enabled");
  assert(result.disabled.capability === "implementation" && result.enabled.capability === "implementation", "replacement within same capability");

  // The registry itself is immutable configuration; replacement returns new
  // snapshots and never mutates the node contract surface.
  assert(getBinding("binding-codex-implementation")?.enabled === true, "registry unchanged by replaceBinding");
  assert(NODE_CAPABILITY_CONTRACTS === contractsRef, "node contract object identity unchanged");
  assert(JSON.stringify(NODE_CAPABILITY_CONTRACTS) === contractsBefore, "node contract content unchanged");

  // Cross-capability replacement is rejected.
  try {
    replaceBinding("binding-codex-implementation", "binding-kimi-requirement-intake");
    assert(false, "cross-capability replacement rejected (no error thrown)");
  } catch {
    assert(true, "cross-capability replacement rejected");
  }
  // Unknown binding ids are rejected.
  try {
    replaceBinding("binding-unknown-x", "binding-kimi-implementation");
    assert(false, "unknown binding id rejected (no error thrown)");
  } catch {
    assert(true, "unknown binding id rejected");
  }
}

console.log("binding: codex request-type extension (Decision-020)");
assert(isSupportedCodexRequestType("code_generation"), "legacy code_generation still supported");
for (const capability of NODE_CAPABILITY_IDS) {
  assert(isSupportedCodexRequestType(capability), `capability request type ${capability} supported`);
}
assert(!isSupportedCodexRequestType("unsupported_thing"), "unknown request type rejected");
assert(!isSupportedCodexRequestType(""), "empty request type rejected");

console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
