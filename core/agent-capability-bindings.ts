// Agent Capability Bindings — versioned executor selection (C01 WP-3)
// ===================================================================
// The binding layer selects an enabled executor for a node capability and
// validates its output against the node contract (WP-2). Bindings are
// configuration: replacing a binding never changes Requirement ID, artifact
// schema, finding semantics, Re-Gate routing or the manual Git boundary
// (LOOP Core Contract §6). Full-capability matrix per Decision-020: every
// supported agent can execute every node; initial state codex enabled,
// kimi/hermes disabled pending real-environment review.

import { NODE_CAPABILITY_IDS, type LoopAgent, type NodeCapabilityId } from "../loop/types";

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

const ADAPTER_BY_AGENT: Record<LoopAgent, string> = {
  codex: "codex-real-dispatch",
  kimi: "kimi-cli",
  hermes: "hermes-cli",
};

const BINDING_VERSION = "1.0.0";
const BINDING_TIMEOUT_MS = 120_000;

function buildBindings(): readonly AgentCapabilityBinding[] {
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
  return Object.freeze(bindings);
}

/** Full-capability matrix: 7 capabilities x 3 agents = 21 bindings. */
export const AGENT_CAPABILITY_BINDINGS: readonly AgentCapabilityBinding[] = buildBindings();

export function getBinding(bindingId: string): AgentCapabilityBinding | undefined {
  return AGENT_CAPABILITY_BINDINGS.find((binding) => binding.bindingId === bindingId);
}

/**
 * Replace the executor for a capability by disabling the current binding and
 * enabling another. Replacement is pure configuration: the node contract
 * objects (NODE_CAPABILITY_CONTRACTS) are never modified, Requirement ID and
 * Git boundaries are untouched. Returns the updated binding pair.
 */
export function replaceBinding(
  fromBindingId: string,
  toBindingId: string,
): Readonly<{ disabled: AgentCapabilityBinding; enabled: AgentCapabilityBinding }> {
  const from = getBinding(fromBindingId);
  const to = getBinding(toBindingId);
  if (from === undefined || to === undefined) {
    throw new Error(`unknown binding id: ${from === undefined ? fromBindingId : toBindingId}`);
  }
  if (from.capability !== to.capability) {
    throw new Error("replacement bindings must serve the same capability");
  }
  const disabled: AgentCapabilityBinding = { ...from, enabled: false };
  const enabled: AgentCapabilityBinding = { ...to, enabled: true };
  return Object.freeze({ disabled, enabled });
}
