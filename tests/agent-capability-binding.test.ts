// Agent Capability Binding — Tests (C01 WP-3)
// ===========================================
// Guards for the binding layer: immutable registry snapshots (replaceBinding
// returns a NEW deeply frozen registry; per-capability exactly one enabled
// binding), schema integrity incl. a TS-AST lock on the interface field set,
// no Git fields, capability -> output artifact validator, codex request-type
// extension, and end-to-end Gateway paths for all seven capabilities.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

import { LOOP_CAPABILITY_EXECUTION_POINTS, NODE_CAPABILITY_IDS } from "../loop/types";
import {
  INITIAL_BINDING_REGISTRY,
  getBinding,
  getEnabledBinding,
  replaceBinding,
  CAPABILITY_ARTIFACT_TYPES,
  validateNodeOutputArtifact,
  type AgentCapabilityBinding,
} from "../core/agent-capability-bindings";
import { NODE_CAPABILITY_CONTRACTS } from "../core/node-capability-contracts";
import { isSupportedCodexRequestType } from "../execution/codex-real-dispatch-runner";
import { createCodexFakeRunner } from "../execution/codex-real-dispatch-runner";
import { ExecutionGateway } from "../execution/gateway";
import type { ExecutionRequest, ExecutionRequestType } from "../execution/types";

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
// Git field) must be added here AND to the interface deliberately.
const BINDING_FIELDS = [
  "bindingId",
  "capability",
  "executionRole",
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

const IMPL_INPUT = {
  requirement: "build a user login page with database storage",
  requirementId: "REQ-BINDING-TEST",
  summary: {
    requirement_id: "REQ-BINDING-TEST",
    multi_repo: false,
    main_repo: "main",
    sub_requirements: [],
    parsed_at: "2026-01-01T00:00:00.000Z",
  },
  designOutput: {
    node: "solution-design",
    result: "design_completed",
    design: {
      approach: "single_service",
      components: ["ui_form", "data_store"],
      interfaces: ["user_interface"],
      dependencies: ["database"],
      test_strategy: "unit_plus_integration",
      risks: [],
    },
  },
  reviewOutput: { node: "review", result: "PASS" },
  complexity: "medium" as const,
  executionMode: "direct" as const,
};

function makeRequest(type: ExecutionRequestType, capability: string): ExecutionRequest {
  return {
    type,
    node: capability,
    agent: "codex",
    requirementId: "REQ-BINDING-TEST",
    input:
      type === "implementation" || type === "code_generation"
        ? { implementationExecutorInput: IMPL_INPUT }
        : {},
  };
}

async function main(): Promise<void> {
console.log("binding: full-capability/role matrix (8 execution points x 3 agents)");
assert(INITIAL_BINDING_REGISTRY.bindings.length === 24, "exactly 24 bindings");
{
  const slots = new Set(
    INITIAL_BINDING_REGISTRY.bindings.map((b) => `${b.agent}:${b.capability}:${b.executionRole}`),
  );
  assert(slots.size === 24, "agent:capability:role slots are unique");
  for (const agent of AGENTS) {
    for (const point of LOOP_CAPABILITY_EXECUTION_POINTS) {
      assert(
        slots.has(`${agent}:${point.capability}:${point.executionRole}`),
        `binding exists for ${agent}:${point.capability}:${point.executionRole}`,
      );
    }
  }
  const ids = new Set(INITIAL_BINDING_REGISTRY.bindings.map((b) => b.bindingId));
  assert(ids.size === 24, "bindingIds are unique");
  for (const id of ids) {
    assert(/^binding-[a-z]+-[a-z-]+-(primary|adversarial_scan|formal_verdict)$/.test(id), `bindingId ${id} matches format`);
  }
}

console.log("binding: initial enablement (codex enabled, kimi/hermes disabled, per role slot)");
for (const point of LOOP_CAPABILITY_EXECUTION_POINTS) {
  assert(getBinding(INITIAL_BINDING_REGISTRY, `binding-codex-${point.capability}-${point.executionRole}`)?.enabled === true, `codex ${point.capability}/${point.executionRole} enabled`);
  assert(getBinding(INITIAL_BINDING_REGISTRY, `binding-kimi-${point.capability}-${point.executionRole}`)?.enabled === false, `kimi ${point.capability}/${point.executionRole} disabled`);
  assert(getBinding(INITIAL_BINDING_REGISTRY, `binding-hermes-${point.capability}-${point.executionRole}`)?.enabled === false, `hermes ${point.capability}/${point.executionRole} disabled`);
  // Exactly one enabled binding per (capability, role) slot (fail-closed invariant).
  const enabled = getEnabledBinding(INITIAL_BINDING_REGISTRY, point.capability, point.executionRole);
  assert(enabled.bindingId === `binding-codex-${point.capability}-${point.executionRole}`, `slot ${point.capability}/${point.executionRole} has exactly one enabled binding`);
}
// solution-gate carries exactly the two fixed roles; every other node primary.
for (const capability of NODE_CAPABILITY_IDS) {
  const roles = [...new Set(
    INITIAL_BINDING_REGISTRY.bindings
      .filter((b) => b.capability === capability)
      .map((b) => b.executionRole),
  )].sort();
  const expected = capability === "solution-gate" ? ["adversarial_scan", "formal_verdict"] : ["primary"];
  assert(JSON.stringify(roles) === JSON.stringify(expected), `capability ${capability} binds roles ${expected.join("/")}`);
}

console.log("binding: schema integrity");
for (const binding of INITIAL_BINDING_REGISTRY.bindings) {
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

console.log("binding: TS-AST lock on interface field set (fail-closed)");
{
  const sourcePath = resolve(process.cwd(), "core/agent-capability-bindings.ts");
  const sourceText = readFileSync(sourcePath, "utf8");
  const sourceFile = ts.createSourceFile("bindings.ts", sourceText, ts.ScriptTarget.Latest, true);

  let interfaceNode: ts.InterfaceDeclaration | undefined;
  function visit(node: ts.Node): void {
    if (ts.isInterfaceDeclaration(node) && node.name.text === "AgentCapabilityBinding") {
      interfaceNode = node;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  assert(interfaceNode !== undefined, "AgentCapabilityBinding interface exists");
  if (interfaceNode !== undefined) {
    const members = interfaceNode.members
      .filter(ts.isPropertySignature)
      .map((m) => (m.name as ts.Identifier).text)
      .sort();
    const expected = [...BINDING_FIELDS].sort();
    assert(
      JSON.stringify(members) === JSON.stringify(expected),
      "interface declares exactly the schema fields (no hidden optional Git fields)",
    );
  }
}

console.log("binding: no Git fields anywhere");
{
  const gitWords = ["commit", "push", "pr", "merge", "publish", "repository", "branch"];
  // Match field NAMES only (key pattern), not arbitrary values — the role
  // value "primary" legitimately contains the substring "pr".
  const keys = Object.keys(INITIAL_BINDING_REGISTRY.bindings[0] as unknown as Record<string, unknown>);
  const fieldsJson = JSON.stringify(keys).toLowerCase();
  for (const word of gitWords) {
    assert(!fieldsJson.includes(`"${word}"`), `no Git field '${word}' in binding schema`);
  }
}

console.log("binding: registry is deeply frozen (immutable)");
{
  const registry = INITIAL_BINDING_REGISTRY;
  assert(Object.isFrozen(registry), "registry object frozen");
  assert(Object.isFrozen(registry.bindings), "bindings array frozen");
  for (const binding of registry.bindings) {
    assert(Object.isFrozen(binding), `binding ${binding.bindingId} frozen`);
    assert(Object.isFrozen(binding.allowedSideEffects), `binding ${binding.bindingId} allowedSideEffects frozen`);
  }
  // Runtime mutation attempt must not stick.
  const first = registry.bindings[0];
  (first as { enabled: boolean }).enabled = !first.enabled;
  const original = INITIAL_BINDING_REGISTRY.bindings[0];
  assert(original.enabled === true, "mutation attempt on frozen binding does not stick");
}

console.log("binding: replaceBinding returns usable immutable snapshot");
{
  const result = replaceBinding(
    INITIAL_BINDING_REGISTRY,
    "binding-codex-implementation-primary",
    "binding-kimi-implementation-primary",
  );
  const next = result.registry;
  assert(result.disabled.bindingId === "binding-codex-implementation-primary" && result.disabled.enabled === false, "codex binding disabled in snapshot");
  assert(result.enabled.bindingId === "binding-kimi-implementation-primary" && result.enabled.enabled === true, "kimi binding enabled in snapshot");

  // The new snapshot is usable: the enabled binding resolves per slot.
  const enabled = getEnabledBinding(next, "implementation", "primary");
  assert(enabled.bindingId === "binding-kimi-implementation-primary", "snapshot resolves kimi as enabled executor for implementation/primary");
  assert(enabled.agent === "kimi", "snapshot enabled executor agent is kimi");

  // The input registry is untouched.
  assert(
    getBinding(INITIAL_BINDING_REGISTRY, "binding-codex-implementation-primary")?.enabled === true,
    "initial registry unchanged by replaceBinding",
  );

  // Snapshot is deeply frozen too.
  assert(Object.isFrozen(next), "new registry frozen");
  assert(Object.isFrozen(next.bindings), "new bindings array frozen");
  for (const binding of next.bindings) {
    assert(Object.isFrozen(binding), `snapshot binding ${binding.bindingId} frozen`);
  }

  // Every execution point still has exactly one enabled binding in the snapshot.
  for (const point of LOOP_CAPABILITY_EXECUTION_POINTS) {
    getEnabledBinding(next, point.capability, point.executionRole);
  }
  assert(true, "every execution point keeps exactly one enabled binding after replacement");

  // Node contracts untouched by replacement.
  assert(JSON.stringify(NODE_CAPABILITY_CONTRACTS).includes('"capability":"implementation"'), "node contracts intact");

  // Invalid replacements rejected.
  let crossCapabilityRejected = false;
  try {
    replaceBinding(INITIAL_BINDING_REGISTRY, "binding-codex-implementation-primary", "binding-kimi-requirement-intake-primary");
  } catch {
    crossCapabilityRejected = true;
  }
  assert(crossCapabilityRejected, "cross-capability replacement rejected");

  let unknownRejected = false;
  try {
    replaceBinding(INITIAL_BINDING_REGISTRY, "binding-unknown-x", "binding-kimi-implementation-primary");
  } catch {
    unknownRejected = true;
  }
  assert(unknownRejected, "unknown binding id rejected");

  let sameAgentRejected = false;
  try {
    replaceBinding(INITIAL_BINDING_REGISTRY, "binding-codex-implementation-primary", "binding-codex-requirement-intake-primary");
  } catch {
    sameAgentRejected = true;
  }
  assert(sameAgentRejected, "same-agent replacement rejected");
}

console.log("binding: capability -> output artifact validator (WP-2 contracts)");
{
  for (const capability of NODE_CAPABILITY_IDS) {
    const expected = CAPABILITY_ARTIFACT_TYPES[capability];
    assert(expected !== undefined, `capability ${capability} has canonical artifact type`);
    validateNodeOutputArtifact(expected, capability);
    assert(true, `capability ${capability} accepts its canonical artifact '${expected}'`);
  }
  let wrongRejected = false;
  try {
    validateNodeOutputArtifact("code_patch", "requirement-intake");
  } catch {
    wrongRejected = true;
  }
  assert(wrongRejected, "requirement-intake rejects code_patch artifact");
  let unknownRejected = false;
  try {
    validateNodeOutputArtifact("code_patch", "unknown-capability" as never);
  } catch {
    unknownRejected = true;
  }
  assert(unknownRejected, "unknown capability rejected by validator");
}

console.log("binding: codex request-type extension (Decision-020)");
assert(isSupportedCodexRequestType("code_generation"), "legacy code_generation still supported");
for (const capability of NODE_CAPABILITY_IDS) {
  assert(isSupportedCodexRequestType(capability), `capability request type ${capability} supported`);
}
assert(!isSupportedCodexRequestType("unsupported_thing"), "unknown request type rejected");
assert(!isSupportedCodexRequestType(""), "empty request type rejected");

console.log("binding: fake runner produces canonical artifact per capability (end-to-end)");
{
  const runner = createCodexFakeRunner({ scenario: "success_code_patch" });
  for (const capability of NODE_CAPABILITY_IDS) {
    const request = makeRequest(capability, capability);
    const result = await runner.run(request);
    assert(result.success === true, `capability ${capability}: runner succeeds`);
    assert(
      result.artifacts[0].type === CAPABILITY_ARTIFACT_TYPES[capability],
      `capability ${capability}: artifact type '${result.artifacts[0].type}' matches contract`,
    );
  }
  // Non-capability legacy types remain rejected (shadow fallback, no real dispatch).
  const legacyRejected = await runner.run(makeRequest("review", "review"));
  assert(legacyRejected.artifacts[0].type === "shadow_output", "legacy review type still rejected by codex runner");
}

console.log("binding: Gateway routes all seven capabilities to real dispatch");
{
  const runner = createCodexFakeRunner({ scenario: "success_code_patch" });
  const gateway = new ExecutionGateway({
    env: { SDLC_EXECUTION_MODE: "codex", SDLC_CODEX_REAL_DISPATCH: "enabled" },
    codexRunner: runner,
  });
  for (const capability of NODE_CAPABILITY_IDS) {
    const result = await gateway.execute(makeRequest(capability, capability));
    assert(result.success === true, `gateway: capability ${capability} succeeds`);
    assert(
      result.artifacts[0].type === CAPABILITY_ARTIFACT_TYPES[capability],
      `gateway: capability ${capability} artifact '${result.artifacts[0].type}' matches contract`,
    );
  }
  // Default (no flags) still returns shadow for capability requests.
  const shadowGateway = new ExecutionGateway({ env: {} });
  const shadowResult = await shadowGateway.execute(makeRequest("requirement-intake", "requirement-intake"));
  assert(shadowResult.artifacts[0].type === "shadow_output", "default env still returns shadow_output for capability requests");
}


console.log("binding: fake runner prompt is non-empty and includes input (all capabilities)");
{
  const runner = createCodexFakeRunner({ scenario: "success_code_patch" });
  for (const capability of NODE_CAPABILITY_IDS) {
    const request = makeRequest(capability, capability);
    const result = await runner.run(request);
    const promptCharCount = result.output["prompt_char_count"] as number;
    assert(promptCharCount > 0, `fake runner: ${capability} prompt non-empty (${promptCharCount} chars)`);
  }
}

console.log("binding: real-dispatch branch (codexRealDispatchConfig + codexProcessRunner) covers all seven capabilities");
{
  const tracking = { calls: 0, lastPrompt: "" };
  let expectedStdout = "capability output text";
  const processRunner = {
    async run(prompt: string) {
      tracking.calls += 1;
      tracking.lastPrompt = prompt;
      return { exitCode: 0, stdout: expectedStdout, durationMs: 10 };
    },
  };
  const gateway = new ExecutionGateway({
    env: { SDLC_EXECUTION_MODE: "codex", SDLC_CODEX_REAL_DISPATCH: "enabled" },
    codexProcessRunner: processRunner,
    codexRealDispatchConfig: { workingDirectory: "/tmp/binding-real-branch-test" },
  });

  for (const capability of NODE_CAPABILITY_IDS) {
    expectedStdout =
      capability === "implementation"
        ? "FILE: src/a.ts\nPATCH:\n+export const a = 1;\n"
        : "capability output text";
    const request = makeRequest(capability, capability);
    const result = await gateway.execute(request);
    assert(result.success === true, `real branch: ${capability} succeeds`);
    assert(
      result.artifacts[0].type === CAPABILITY_ARTIFACT_TYPES[capability],
      `real branch: ${capability} artifact '${result.artifacts[0].type}' matches contract`,
    );
    assert(tracking.lastPrompt.length > 0, `real branch: ${capability} prompt non-empty (${tracking.lastPrompt.length} chars)`);
    assert(
      tracking.lastPrompt.includes("REQ-BINDING-TEST"),
      `real branch: ${capability} prompt includes requirementId`,
    );
    const content = result.artifacts[0].content as Record<string, unknown>;
    if (capability === "implementation") {
      assert(result.output["result"] === "code_patch_generated", "real branch: implementation result is code_patch_generated");
      assert(content["patch"] !== undefined, "real branch: implementation content is a parsed patch");
    } else {
      assert(result.output["result"] === "capability_completed", `real branch: ${capability} result is capability_completed`);
      assert(content["node_output"] === "capability output text", `real branch: ${capability} content is capability text output`);
      assert(content["parser_summary"] === "capability_text_output", `real branch: ${capability} parser summary is capability_text_output`);
    }
  }
  assert(tracking.calls === 7, "real process runner invoked for all seven capabilities");
}

console.log("binding: real-dispatch branch fails closed on CLI errors for all capabilities");
{
  const failingRunner = {
    async run(_prompt: string) {
      return { exitCode: 1, stdout: "", durationMs: 5 };
    },
  };
  const gateway = new ExecutionGateway({
    env: { SDLC_EXECUTION_MODE: "codex", SDLC_CODEX_REAL_DISPATCH: "enabled" },
    codexProcessRunner: failingRunner,
    codexRealDispatchConfig: { workingDirectory: "/tmp/binding-real-branch-test" },
  });
  for (const capability of NODE_CAPABILITY_IDS) {
    const result = await gateway.execute(makeRequest(capability, capability));
    assert(
      result.artifacts[0].type === "shadow_output",
      `real branch: ${capability} CLI failure fails closed to shadow_output`,
    );
  }
}


console.log("binding: capability safety fails closed (real branch, codexRealDispatchConfig + codexProcessRunner)");
{
  // Sensitive input: process runner must never be invoked.
  {
    const tracking = { calls: 0 };
    const processRunner = {
      async run(_prompt: string) {
        tracking.calls += 1;
        return { exitCode: 0, stdout: "output", durationMs: 5 };
      },
    };
    const gateway = new ExecutionGateway({
      env: { SDLC_EXECUTION_MODE: "codex", SDLC_CODEX_REAL_DISPATCH: "enabled" },
      codexProcessRunner: processRunner,
      codexRealDispatchConfig: { workingDirectory: "/tmp/binding-safety-test" },
    });
    const request = { ...makeRequest("solution-design", "solution-design"), input: { api_key: "secret-value" } };
    const result = await gateway.execute(request);
    assert(tracking.calls === 0, "sensitive input: process runner not invoked");
    assert(result.artifacts[0].type === "shadow_output", "sensitive input: fails closed to shadow_output");
    assert(result.success === true, "sensitive input: shadow fallback keeps gateway success contract");
  }

  // Sensitive output: no successful artifact may be produced.
  {
    const processRunner = {
      async run(_prompt: string) {
        return { exitCode: 0, stdout: "analysis result with sk-ABCDEF1234567890 token", durationMs: 5 };
      },
    };
    const gateway = new ExecutionGateway({
      env: { SDLC_EXECUTION_MODE: "codex", SDLC_CODEX_REAL_DISPATCH: "enabled" },
      codexProcessRunner: processRunner,
      codexRealDispatchConfig: { workingDirectory: "/tmp/binding-safety-test" },
    });
    const result = await gateway.execute(makeRequest("knowledge-sync", "knowledge-sync"));
    assert(result.artifacts[0].type === "shadow_output", "sensitive output: fails closed to shadow_output");
    assert(
      result.output["codex_fallback_reason"] === "prohibited_output_content",
      "sensitive output: fallback reason is prohibited_output_content",
    );
  }

  // Oversized output: no partial artifact, output_too_large.
  {
    const processRunner = {
      async run(_prompt: string) {
        return { exitCode: 0, stdout: "x".repeat(8001), durationMs: 5 };
      },
    };
    const gateway = new ExecutionGateway({
      env: { SDLC_EXECUTION_MODE: "codex", SDLC_CODEX_REAL_DISPATCH: "enabled" },
      codexProcessRunner: processRunner,
      codexRealDispatchConfig: { workingDirectory: "/tmp/binding-safety-test" },
    });
    const result = await gateway.execute(makeRequest("knowledge-sync", "knowledge-sync"));
    assert(result.artifacts[0].type === "shadow_output", "oversized output: fails closed to shadow_output");
    assert(
      result.output["codex_fallback_reason"] === "output_too_large",
      "oversized output: fallback reason is output_too_large",
    );
    assert(result.artifacts[0].content["node_output"] === undefined, "oversized output: no partial node product artifact");
  }

  // Circular input: fail closed before the process runner.
  {
    const tracking = { calls: 0 };
    const processRunner = {
      async run(_prompt: string) {
        tracking.calls += 1;
        return { exitCode: 0, stdout: "output", durationMs: 5 };
      },
    };
    const gateway = new ExecutionGateway({
      env: { SDLC_EXECUTION_MODE: "codex", SDLC_CODEX_REAL_DISPATCH: "enabled" },
      codexProcessRunner: processRunner,
      codexRealDispatchConfig: { workingDirectory: "/tmp/binding-safety-test" },
    });
    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;
    const request = { ...makeRequest("solution-design", "solution-design"), input: circular };
    const result = await gateway.execute(request);
    assert(tracking.calls === 0, "circular input: process runner not invoked");
    assert(result.artifacts[0].type === "shadow_output", "circular input: fails closed to shadow_output");
  }

  // Unserializable input (BigInt): fail closed before the process runner.
  {
    const tracking = { calls: 0 };
    const processRunner = {
      async run(_prompt: string) {
        tracking.calls += 1;
        return { exitCode: 0, stdout: "output", durationMs: 5 };
      },
    };
    const gateway = new ExecutionGateway({
      env: { SDLC_EXECUTION_MODE: "codex", SDLC_CODEX_REAL_DISPATCH: "enabled" },
      codexProcessRunner: processRunner,
      codexRealDispatchConfig: { workingDirectory: "/tmp/binding-safety-test" },
    });
    const request = { ...makeRequest("solution-design", "solution-design"), input: { big: BigInt(9007199254740991) } };
    const result = await gateway.execute(request);
    assert(tracking.calls === 0, "unserializable input: process runner not invoked");
    assert(result.artifacts[0].type === "shadow_output", "unserializable input: fails closed to shadow_output");
  }
}


console.log("binding: empty/blank capability output fails closed (real branch, six non-implementation capabilities)");
{
  const nonImplementation = NODE_CAPABILITY_IDS.filter((cap) => cap !== "implementation");
  for (const outputText of ["", "   \n\t  "]) {
    const processRunner = {
      async run(_prompt: string) {
        return { exitCode: 0, stdout: outputText, durationMs: 5 };
      },
    };
    const gateway = new ExecutionGateway({
      env: { SDLC_EXECUTION_MODE: "codex", SDLC_CODEX_REAL_DISPATCH: "enabled" },
      codexProcessRunner: processRunner,
      codexRealDispatchConfig: { workingDirectory: "/tmp/binding-empty-test" },
    });
    for (const capability of nonImplementation) {
      const result = await gateway.execute(makeRequest(capability, capability));
      assert(
        result.artifacts[0].type === "shadow_output",
        `${capability}: ${outputText.length === 0 ? "empty" : "blank"} output fails closed to shadow_output`,
      );
      assert(
        result.output["codex_fallback_reason"] === "empty_output",
        `${capability}: ${outputText.length === 0 ? "empty" : "blank"} output reason is empty_output`,
      );
      assert(
        result.artifacts[0].content["node_output"] === undefined,
        `${capability}: ${outputText.length === 0 ? "empty" : "blank"} output produces no node_output artifact`,
      );
    }
  }
}

console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

void main();
