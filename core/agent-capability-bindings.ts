// Agent Capability Bindings — versioned executor selection (C01 WP-3)
// ===================================================================
// The binding layer selects an enabled executor for a node capability and
// validates its output against the node contract (WP-2). Bindings are
// immutable configuration: every operation returns a NEW deeply frozen
// registry snapshot; nothing is ever mutated in place. Replacing a binding
// never changes Requirement ID, artifact schema, finding semantics, Re-Gate
// routing or the manual Git boundary (LOOP Core Contract §6). Full-
// capability matrix per Decision-020: every supported agent can execute
// every node; initial state codex enabled, kimi/hermes disabled pending
// real-environment review.

import { NODE_CAPABILITY_IDS, type LoopAgent, type NodeCapabilityId } from "../loop/types";
import type { ExecutionArtifactType } from "../execution/types";
import { types as utilTypes } from "node:util";

export type BindingFailurePolicy = "retry_other_binding" | "block";

export interface AgentCapabilityBinding {
  bindingId: string;
  capability: NodeCapabilityId;
  agent: LoopAgent;
  adapter: string;
  bindingVersion: string;
  inputFormat: string;
  outputContract: string;
  validator: string;
  allowedSideEffects: readonly string[];
  timeoutMs: number;
  failurePolicy: BindingFailurePolicy;
  enabled: boolean;
}

export interface BindingRegistry {
  readonly version: string;
  readonly bindings: ReadonlyArray<Readonly<AgentCapabilityBinding>>;
}

const ADAPTER_BY_AGENT: Record<LoopAgent, string> = {
  codex: "codex-real-dispatch",
  kimi: "kimi-cli",
  hermes: "hermes-cli",
};

const BINDING_VERSION = "1.0.0";
const BINDING_TIMEOUT_MS = 120_000;
const REGISTRY_VERSION = "1";
const LOOP_AGENTS: readonly LoopAgent[] = ["codex", "kimi", "hermes"];
const BINDING_FIELDS = [
  "bindingId", "capability", "agent", "adapter", "bindingVersion", "inputFormat",
  "outputContract", "validator", "allowedSideEffects", "timeoutMs", "failurePolicy", "enabled",
] as const;
const REGISTRY_FIELDS = ["version", "bindings"] as const;
const CANONICAL_ALLOWED_SIDE_EFFECTS = ["workspace-local-write", "run-journal-write"] as const;
const MAX_BINDING_TIMEOUT_MS = 2_147_483_647;
const SAFE_TEXT_RE = /^[^\x00-\x1f\x7f-\x9f]+$/;
const SEMVER_RE = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const REGISTRY_VERSION_RE = /^[1-9][0-9]*$/;

function invalidRegistry(message: string): never {
  throw new Error(`invalid binding registry: ${message}`);
}

function exactDataFields(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (utilTypes.isProxy(value) || value === null || typeof value !== "object" || Array.isArray(value)) {
    invalidRegistry(`${label} must be a plain frozen data object`);
  }
  let prototype: unknown;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    invalidRegistry(`${label} must be safely inspectable`);
  }
  if (prototype !== Object.prototype && prototype !== null) {
    invalidRegistry(`${label} must be a plain data object`);
  }
  const keys = Reflect.ownKeys(descriptors!);
  if (
    keys.some((key) => typeof key !== "string") || keys.length !== fields.length ||
    fields.some((field) => !(field in descriptors!)) ||
    keys.some((key) => typeof key === "string" && !fields.includes(key))
  ) {
    invalidRegistry(`${label} must contain exactly the canonical fields`);
  }
  const out = Object.create(null) as Record<string, unknown>;
  for (const field of fields) {
    const descriptor = descriptors![field]!;
    if (
      !("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined ||
      descriptor.enumerable !== true
    ) {
      invalidRegistry(`${label} must not contain accessors`);
    }
    out[field] = descriptor.value;
  }
  return out;
}

function frozenDataArray(value: unknown, length: number, label: string): readonly unknown[] {
  if (utilTypes.isProxy(value) || !Array.isArray(value) || !Object.isFrozen(value) || value.length !== length) {
    invalidRegistry(`${label} must be a complete frozen data array`);
  }
  let descriptors: Record<PropertyKey, PropertyDescriptor>;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  } catch {
    invalidRegistry(`${label} must be safely inspectable`);
  }
  const expectedKeys = Array.from({ length }, (_, index) => String(index));
  const keys = Reflect.ownKeys(descriptors!);
  if (
    keys.some((key) => typeof key !== "string") || keys.length !== length + 1 ||
    !keys.includes("length") || expectedKeys.some((key) => !(key in descriptors!)) ||
    keys.some((key) => typeof key === "string" && key !== "length" && !expectedKeys.includes(key))
  ) {
    invalidRegistry(`${label} must not be sparse or contain extra fields`);
  }
  return Object.freeze(expectedKeys.map((key) => {
    const descriptor = descriptors![key]!;
    if (
      !("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined ||
      descriptor.enumerable !== true
    ) {
      invalidRegistry(`${label} must not contain accessors`);
    }
    return descriptor.value;
  }));
}

function safeText(value: unknown, label: string): string {
  if (
    typeof value !== "string" || value.length === 0 || value.trim() !== value ||
    !SAFE_TEXT_RE.test(value)
  ) {
    invalidRegistry(`${label} must be a safe trimmed non-empty string`);
  }
  return value;
}

/**
 * Runtime validation for immutable binding snapshots. This is the WP-5
 * replacement boundary: executor selection may change, but artifact schema,
 * validator and side-effect contracts remain canonical and Git-free.
 */
export function validateBindingRegistry(value: unknown): asserts value is BindingRegistry {
  const registry = exactDataFields(value, REGISTRY_FIELDS, "registry");
  if (!Object.isFrozen(value)) invalidRegistry("registry must be frozen");
  const registryVersion = safeText(registry.version, "registry.version");
  if (!REGISTRY_VERSION_RE.test(registryVersion)) {
    invalidRegistry("registry.version must be a positive integer string");
  }
  const versionNumber = Number(registryVersion);
  if (!Number.isSafeInteger(versionNumber)) invalidRegistry("registry.version must be safely representable");
  const bindings = frozenDataArray(
    registry.bindings,
    NODE_CAPABILITY_IDS.length * LOOP_AGENTS.length,
    "registry.bindings",
  );

  const ids = new Set<string>();
  const pairs = new Set<string>();
  const enabledCounts = new Map<NodeCapabilityId, number>();
  for (const rawBinding of bindings) {
    const binding = exactDataFields(rawBinding, BINDING_FIELDS, "binding");
    if (!Object.isFrozen(rawBinding)) invalidRegistry("every binding must be frozen");
    const capability = binding.capability;
    if (typeof capability !== "string" || !NODE_CAPABILITY_IDS.includes(capability as NodeCapabilityId)) {
      invalidRegistry("binding capability must be canonical");
    }
    const agent = binding.agent;
    if (typeof agent !== "string" || !LOOP_AGENTS.includes(agent as LoopAgent)) {
      invalidRegistry("binding agent must be supported");
    }
    const typedCapability = capability as NodeCapabilityId;
    const typedAgent = agent as LoopAgent;
    const bindingId = safeText(binding.bindingId, "binding.bindingId");
    if (bindingId !== `binding-${typedAgent}-${typedCapability}` || ids.has(bindingId)) {
      invalidRegistry("bindingId must be unique and match agent/capability");
    }
    ids.add(bindingId);
    const pair = `${typedAgent}:${typedCapability}`;
    if (pairs.has(pair)) invalidRegistry("agent/capability pairs must be unique");
    pairs.add(pair);
    if (binding.adapter !== ADAPTER_BY_AGENT[typedAgent]) invalidRegistry("binding adapter must match agent");
    const bindingVersion = safeText(binding.bindingVersion, "binding.bindingVersion");
    if (!SEMVER_RE.test(bindingVersion)) invalidRegistry("binding version must be semantic");
    if (binding.inputFormat !== "artifact-reference:v1") invalidRegistry("binding input format is non-canonical");
    if (binding.outputContract !== "node-output-contract:v1") invalidRegistry("binding output contract is non-canonical");
    if (binding.validator !== "node-output-contract:v1") invalidRegistry("binding validator is non-canonical");
    const allowedSideEffects = frozenDataArray(
      binding.allowedSideEffects,
      CANONICAL_ALLOWED_SIDE_EFFECTS.length,
      "binding.allowedSideEffects",
    );
    if (CANONICAL_ALLOWED_SIDE_EFFECTS.some((effect, index) => allowedSideEffects[index] !== effect)) {
      invalidRegistry("binding side effects must match the manual Git boundary");
    }
    if (
      typeof binding.timeoutMs !== "number" || !Number.isSafeInteger(binding.timeoutMs) ||
      binding.timeoutMs < 1 || binding.timeoutMs > MAX_BINDING_TIMEOUT_MS
    ) {
      invalidRegistry("binding timeout must fit the runtime timer range");
    }
    if (binding.failurePolicy !== "retry_other_binding" && binding.failurePolicy !== "block") {
      invalidRegistry("binding failure policy is unsupported");
    }
    if (typeof binding.enabled !== "boolean") invalidRegistry("binding enabled flag must be boolean");
    if (binding.enabled) enabledCounts.set(typedCapability, (enabledCounts.get(typedCapability) ?? 0) + 1);
  }
  for (const capability of NODE_CAPABILITY_IDS) {
    for (const agent of LOOP_AGENTS) {
      if (!pairs.has(`${agent}:${capability}`)) invalidRegistry("registry capability matrix is incomplete");
    }
    if (enabledCounts.get(capability) !== 1) {
      invalidRegistry("every capability must have exactly one enabled binding");
    }
  }
}

// ── deep freeze ──

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value as Readonly<T>;
}

// ── registry construction ──

function buildBindings(): AgentCapabilityBinding[] {
  const bindings: AgentCapabilityBinding[] = [];
  for (const capability of NODE_CAPABILITY_IDS) {
    for (const agent of ["codex", "kimi", "hermes"] as const) {
      bindings.push({
        bindingId: `binding-${agent}-${capability}`,
        capability,
        agent,
        adapter: ADAPTER_BY_AGENT[agent],
        bindingVersion: BINDING_VERSION,
        inputFormat: "artifact-reference:v1",
        outputContract: "node-output-contract:v1",
        validator: "node-output-contract:v1",
        allowedSideEffects: ["workspace-local-write", "run-journal-write"],
        timeoutMs: BINDING_TIMEOUT_MS,
        failurePolicy: "retry_other_binding",
        enabled: agent === "codex",
      });
    }
  }
  return bindings;
}

/**
 * Initial registry: 7 capabilities x 3 agents = 21 bindings, codex enabled,
 * kimi/hermes disabled. The registry and every nested object/array are
 * deeply frozen — runtime mutation is impossible.
 */
export const INITIAL_BINDING_REGISTRY: BindingRegistry = deepFreeze({
  version: REGISTRY_VERSION,
  bindings: buildBindings(),
}) as BindingRegistry;

export function getBinding(registry: BindingRegistry, bindingId: string): AgentCapabilityBinding | undefined {
  validateBindingRegistry(registry);
  return registry.bindings.find((binding) => binding.bindingId === bindingId);
}

/**
 * Returns the single enabled binding for a capability. Fail-closed: zero or
 * multiple enabled bindings for one capability is a registry violation.
 */
export function getEnabledBinding(registry: BindingRegistry, capability: NodeCapabilityId): AgentCapabilityBinding {
  validateBindingRegistry(registry);
  const enabled = registry.bindings.filter((binding) => binding.capability === capability && binding.enabled);
  if (enabled.length !== 1) {
    throw new Error(
      `capability ${capability} must have exactly one enabled binding, found ${enabled.length}`,
    );
  }
  return enabled[0];
}

/**
 * Replace the executor for a capability: produces a NEW deeply frozen
 * registry snapshot with `fromBindingId` disabled and `toBindingId` enabled.
 * The input registry and the node contracts are never modified. Every
 * capability keeps exactly one enabled binding.
 */
export function replaceBinding(
  registry: BindingRegistry,
  fromBindingId: string,
  toBindingId: string,
): Readonly<{ registry: BindingRegistry; disabled: AgentCapabilityBinding; enabled: AgentCapabilityBinding }> {
  validateBindingRegistry(registry);
  const from = registry.bindings.find((binding) => binding.bindingId === fromBindingId);
  const to = registry.bindings.find((binding) => binding.bindingId === toBindingId);
  if (from === undefined || to === undefined) {
    throw new Error(`unknown binding id: ${from === undefined ? fromBindingId : toBindingId}`);
  }
  if (from.capability !== to.capability) {
    throw new Error("replacement bindings must serve the same capability");
  }
  if (from.agent === to.agent) {
    throw new Error("replacement must change the executor agent");
  }
  if (!from.enabled || to.enabled) {
    throw new Error("replacement requires an enabled source and disabled target binding");
  }
  const bindings = registry.bindings.map((binding) => {
    if (binding.bindingId === fromBindingId) {
      return { ...binding, enabled: false };
    }
    if (binding.bindingId === toBindingId) {
      return { ...binding, enabled: true };
    }
    return binding;
  });
  if (!/^[1-9][0-9]*$/.test(registry.version)) {
    throw new Error("binding registry version must be a positive integer string");
  }
  const currentVersion = Number(registry.version);
  if (!Number.isSafeInteger(currentVersion) || currentVersion >= Number.MAX_SAFE_INTEGER) {
    throw new Error("binding registry version cannot be incremented safely");
  }
  const next: BindingRegistry = deepFreeze({
    // A replacement is a new immutable configuration snapshot. Incrementing
    // the registry version lets persisted executions identify the exact
    // selection snapshot even after later replacements.
    version: String(currentVersion + 1),
    bindings,
  }) as BindingRegistry;
  validateBindingRegistry(next);
  // Fail-closed invariant: every capability still has exactly one enabled
  // binding in the resulting snapshot.
  for (const capability of NODE_CAPABILITY_IDS) {
    getEnabledBinding(next, capability);
  }
  return Object.freeze({
    registry: next,
    disabled: getBinding(next, fromBindingId) as AgentCapabilityBinding,
    enabled: getBinding(next, toBindingId) as AgentCapabilityBinding,
  });
}

// ── capability -> output artifact contract (validator support) ──

/** Canonical output artifact type per node capability (v2 contracts, A4). */
export const CAPABILITY_ARTIFACT_TYPES: Readonly<Record<NodeCapabilityId, ExecutionArtifactType>> = Object.freeze({
  "requirement-intake": "requirement_summary",
  "solution-design": "technical_design",
  "solution-gate": "solution_review",
  "task-planning": "task_plan",
  "implementation": "implementation_record",
  "code-review": "review_summary",
  "knowledge-sync": "knowledge_sync_result",
});

/**
 * Node output contract validator: the artifact type produced by an executor
 * for a capability must match the capability's canonical output artifact
 * (WP-2 outputArtifact contract). Fails closed on unknown capability or
 * artifact type.
 */
export function validateNodeOutputArtifact(
  artifactType: string,
  capability: NodeCapabilityId,
): void {
  const expected = CAPABILITY_ARTIFACT_TYPES[capability];
  if (expected === undefined) {
    throw new Error(`unknown capability: ${capability}`);
  }
  if (artifactType !== expected) {
    throw new Error(
      `capability ${capability} requires output artifact '${expected}', got '${artifactType}'`,
    );
  }
}
