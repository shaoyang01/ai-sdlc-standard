// Agent Capability Bindings — versioned executor selection (C01 WP-3,
// upgraded to the v2 executionRole model by C02-WP3.5-B)
// ===================================================================
// The binding layer selects an enabled executor for a (capability,
// executionRole) slot and validates its output against the node contract
// (WP-2). Bindings are immutable configuration: every operation returns a NEW
// deeply frozen registry snapshot; nothing is ever mutated in place.
// Replacing a binding never changes Requirement ID, artifact schema, finding
// semantics, Re-Gate routing or the manual Git boundary (LOOP Core Contract
// §6). Full-capability matrix per Decision-020: every supported agent can
// execute every required execution role. The enabled slot follows Q1
// (C03-E plan / Decision-070 reachability, Decision-073 wiring): Kimi owns
// requirement-intake/solution-design/task-planning/knowledge-sync, Codex owns
// adversarial_scan/implementation, Hermes owns formal_verdict/code-review;
// every other (slot, agent) binding stays disabled.

import {
  LOOP_CAPABILITY_EXECUTION_POINTS,
  NODE_CAPABILITY_EXECUTION_ROLES,
  NODE_CAPABILITY_IDS,
  type CapabilityExecutionRole,
  type NodeCapabilityId,
} from "../loop/types";
import type { AgentName, ExecutionArtifactType } from "../execution/types";
import { types as utilTypes } from "node:util";

export type BindingFailurePolicy = "retry_other_binding" | "block";

// v2 (C02-WP3.5, A2): the binding unique key is upgraded from
// (capability, agent) to (capability, executionRole, agent) and the binding
// id carries all three. Every required (capability, role) slot of the eight
// execution points has exactly one enabled binding; solution-gate's two roles
// are separately bound so the runtime can prove scan and verdict agents
// differ.
export interface AgentCapabilityBinding {
  bindingId: string;
  capability: NodeCapabilityId;
  executionRole: CapabilityExecutionRole;
  agent: AgentName;
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

const ADAPTER_BY_AGENT: Record<AgentName, string> = {
  codex: "codex-real-dispatch",
  kimi: "kimi-cli",
  hermes: "hermes-cli",
};

const BINDING_VERSION = "2.0.0";
// Per-class binding wall clock (E5-T1, 2026-08-31 Current User ruling:
// non-implementation 45 min / implementation 60 min). The binding timer arms
// before the profile's per-attempt process budget, so it is the effective
// ceiling of a real dispatch and must mirror the profile budgets in
// execution/agent-cli-profile.ts (TIMEOUT_BY_CLASS); the drift-guard test in
// tests/agent-capability-binding.test.ts pins the two sources equal. The
// former flat 120_000 truncated every profile budget in the real chain
// (E5 ledger §5-⑨).
const BINDING_TIMEOUT_NON_IMPL_MS = 45 * 60 * 1000;
const BINDING_TIMEOUT_IMPL_MS = 60 * 60 * 1000;
const REGISTRY_VERSION = "1";
const LOOP_AGENTS: readonly AgentName[] = ["codex", "kimi", "hermes"];
const BINDING_FIELDS = [
  "bindingId", "capability", "executionRole", "agent", "adapter", "bindingVersion", "inputFormat",
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
    LOOP_CAPABILITY_EXECUTION_POINTS.length * LOOP_AGENTS.length,
    "registry.bindings",
  );

  const ids = new Set<string>();
  const slots = new Set<string>();
  const enabledCounts = new Map<string, number>();
  for (const rawBinding of bindings) {
    const binding = exactDataFields(rawBinding, BINDING_FIELDS, "binding");
    if (!Object.isFrozen(rawBinding)) invalidRegistry("every binding must be frozen");
    const capability = binding.capability;
    if (typeof capability !== "string" || !NODE_CAPABILITY_IDS.includes(capability as NodeCapabilityId)) {
      invalidRegistry("binding capability must be canonical");
    }
    const executionRole = binding.executionRole;
    if (
      typeof executionRole !== "string" ||
      !(NODE_CAPABILITY_EXECUTION_ROLES[capability as NodeCapabilityId] as readonly string[]).includes(executionRole)
    ) {
      invalidRegistry("binding executionRole must be a required role of the capability");
    }
    const agent = binding.agent;
    if (typeof agent !== "string" || !LOOP_AGENTS.includes(agent as AgentName)) {
      invalidRegistry("binding agent must be supported");
    }
    const typedCapability = capability as NodeCapabilityId;
    const typedRole = executionRole as CapabilityExecutionRole;
    const typedAgent = agent as AgentName;
    const bindingId = safeText(binding.bindingId, "binding.bindingId");
    if (
      bindingId !== `binding-${typedAgent}-${typedCapability}-${typedRole}` || ids.has(bindingId)
    ) {
      invalidRegistry("bindingId must be unique and match agent/capability/role");
    }
    ids.add(bindingId);
    const slot = `${typedAgent}:${typedCapability}:${typedRole}`;
    if (slots.has(slot)) invalidRegistry("agent/capability/role slots must be unique");
    slots.add(slot);
    if (binding.adapter !== ADAPTER_BY_AGENT[typedAgent]) invalidRegistry("binding adapter must match agent");
    const bindingVersion = safeText(binding.bindingVersion, "binding.bindingVersion");
    if (!SEMVER_RE.test(bindingVersion)) invalidRegistry("binding version must be semantic");
    if (binding.inputFormat !== "artifact-reference:v1") invalidRegistry("binding input format is non-canonical");
    if (binding.outputContract !== "node-output-contract:v2") invalidRegistry("binding output contract is non-canonical");
    if (binding.validator !== "node-output-contract:v2") invalidRegistry("binding validator is non-canonical");
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
    const roleSlot = `${typedCapability}:${typedRole}`;
    if (binding.enabled) enabledCounts.set(roleSlot, (enabledCounts.get(roleSlot) ?? 0) + 1);
  }
  for (const point of LOOP_CAPABILITY_EXECUTION_POINTS) {
    for (const agent of LOOP_AGENTS) {
      if (!slots.has(`${agent}:${point.capability}:${point.executionRole}`)) {
        invalidRegistry("registry capability/role matrix is incomplete");
      }
    }
    if (enabledCounts.get(`${point.capability}:${point.executionRole}`) !== 1) {
      invalidRegistry("every capability execution role must have exactly one enabled binding");
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

// Q1 slot→agent assignment (C03-E plan §6, Decision-070, Decision-073 W1).
// Exactly one enabled agent per (capability, executionRole) slot. Fail-closed:
// a slot missing from this map is a build-time error, never a silent codex fallthrough.
const Q1_SLOT_AGENT: Readonly<Record<string, AgentName>> = Object.freeze({
  "requirement-intake:primary": "kimi",
  "solution-design:primary": "kimi",
  "solution-gate:adversarial_scan": "codex",
  "solution-gate:formal_verdict": "hermes",
  "task-planning:primary": "kimi",
  "implementation:primary": "codex",
  "code-review:primary": "hermes",
  "knowledge-sync:primary": "kimi",
});

function q1SlotAgent(capability: NodeCapabilityId, executionRole: CapabilityExecutionRole): AgentName {
  const agent = Q1_SLOT_AGENT[`${capability}:${executionRole}`];
  if (agent === undefined) {
    throw new Error(`Q1 binding map has no agent for slot ${capability}:${executionRole}`);
  }
  return agent;
}

function buildBindings(): AgentCapabilityBinding[] {
  const bindings: AgentCapabilityBinding[] = [];
  for (const point of LOOP_CAPABILITY_EXECUTION_POINTS) {
    // Fail-closed coverage check: every dispatchable point must have a Q1 agent.
    q1SlotAgent(point.capability, point.executionRole);
    for (const agent of ["codex", "kimi", "hermes"] as const) {
      bindings.push({
        bindingId: `binding-${agent}-${point.capability}-${point.executionRole}`,
        capability: point.capability,
        executionRole: point.executionRole,
        agent,
        adapter: ADAPTER_BY_AGENT[agent],
        bindingVersion: BINDING_VERSION,
        inputFormat: "artifact-reference:v1",
        outputContract: "node-output-contract:v2",
        validator: "node-output-contract:v2",
        allowedSideEffects: ["workspace-local-write", "run-journal-write"],
        // Same class derivation as the real adapter's capabilityClass.
        timeoutMs: point.capability === "implementation"
          ? BINDING_TIMEOUT_IMPL_MS
          : BINDING_TIMEOUT_NON_IMPL_MS,
        failurePolicy: "retry_other_binding",
        enabled: agent === q1SlotAgent(point.capability, point.executionRole),
      });
    }
  }
  return bindings;
}

/**
 * Initial registry: 8 execution points x 3 agents = 24 bindings. Exactly one
 * binding is enabled per slot per Q1 (Kimi×4, Codex×2, Hermes×2); the other
 * 16 stay disabled. The registry and every nested object/array are deeply
 * frozen — runtime mutation is impossible.
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
 * Returns the single enabled binding for a (capability, executionRole) slot.
 * Fail-closed: zero or multiple enabled bindings for one slot is a registry
 * violation; requesting a role the capability does not require is one too.
 */
export function getEnabledBinding(
  registry: BindingRegistry,
  capability: NodeCapabilityId,
  executionRole: CapabilityExecutionRole,
): AgentCapabilityBinding {
  validateBindingRegistry(registry);
  if (!(NODE_CAPABILITY_EXECUTION_ROLES[capability] as readonly string[]).includes(executionRole)) {
    throw new Error(`capability ${capability} does not require execution role ${executionRole}`);
  }
  const enabled = registry.bindings.filter(
    (binding) => binding.capability === capability && binding.executionRole === executionRole && binding.enabled,
  );
  if (enabled.length !== 1) {
    throw new Error(
      `capability ${capability} role ${executionRole} must have exactly one enabled binding, found ${enabled.length}`,
    );
  }
  return enabled[0];
}

/**
 * W2 anti-silent-cutover guard (wiring-design §3b): a registry is "Q1-shaped"
 * iff every one of the eight execution points has the Q1-assigned agent as
 * its sole enabled binding. Missing slot, non-unique enablement, or a drifted
 * enabled agent all return false (never throw) so the real capability source
 * refuses to start instead of silently dispatching on a non-Q1 map.
 */
export function isQ1BindingRegistry(registry: BindingRegistry): boolean {
  for (const point of LOOP_CAPABILITY_EXECUTION_POINTS) {
    let enabled: AgentCapabilityBinding;
    try {
      enabled = getEnabledBinding(registry, point.capability, point.executionRole);
    } catch {
      return false;
    }
    if (enabled.agent !== q1SlotAgent(point.capability, point.executionRole)) {
      return false;
    }
  }
  return true;
}

/**
 * Replace the executor for a (capability, executionRole) slot: produces a NEW
 * deeply frozen registry snapshot with `fromBindingId` disabled and
 * `toBindingId` enabled. The input registry and the node contracts are never
 * modified. Every slot keeps exactly one enabled binding.
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
  if (from.capability !== to.capability || from.executionRole !== to.executionRole) {
    throw new Error("replacement bindings must serve the same capability execution role");
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
  // Fail-closed invariant: every capability execution role still has exactly
  // one enabled binding in the resulting snapshot.
  for (const point of LOOP_CAPABILITY_EXECUTION_POINTS) {
    getEnabledBinding(next, point.capability, point.executionRole);
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
