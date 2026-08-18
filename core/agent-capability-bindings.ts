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
  return registry.bindings.find((binding) => binding.bindingId === bindingId);
}

/**
 * Returns the single enabled binding for a capability. Fail-closed: zero or
 * multiple enabled bindings for one capability is a registry violation.
 */
export function getEnabledBinding(registry: BindingRegistry, capability: NodeCapabilityId): AgentCapabilityBinding {
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
  const from = getBinding(registry, fromBindingId);
  const to = getBinding(registry, toBindingId);
  if (from === undefined || to === undefined) {
    throw new Error(`unknown binding id: ${from === undefined ? fromBindingId : toBindingId}`);
  }
  if (from.capability !== to.capability) {
    throw new Error("replacement bindings must serve the same capability");
  }
  if (from.agent === to.agent) {
    throw new Error("replacement must change the executor agent");
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
  const next: BindingRegistry = deepFreeze({
    version: registry.version,
    bindings,
  }) as BindingRegistry;
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

/** Canonical output artifact type per node capability (WP-2 contracts). */
export const CAPABILITY_ARTIFACT_TYPES: Readonly<Record<NodeCapabilityId, ExecutionArtifactType>> = Object.freeze({
  "requirement-intake": "requirement_summary",
  "tech-design": "tech_design",
  "solution-challenge": "solution_challenge",
  "solution-review": "solution_review",
  "implementation": "code_patch",
  "code-review": "code_review",
  "test-validation": "validation_report",
});

/**
 * Node output contract validator: the artifact type produced by an executor
 * for a capability must match the capability's canonical output artifact
 * (WP-2 outputArtifact contract). Fails closed on unknown capability or
 * artifact type.
 */
export function validateNodeOutputArtifact(
  artifactType: ExecutionArtifactType,
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
