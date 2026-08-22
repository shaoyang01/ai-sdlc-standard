// Canonical projection from the legacy Runtime execution points to v2
// agent-neutral node capabilities. Delivery LoopStageName values deliberately
// do not appear here: delivery stages are a different state machine.
//
// @deprecated C02-WP3.5 (Decision-044): this bridge maps the OLD five-node
// graph (sdlc_graph) to canonical capabilities and is retired together with
// the old execution face in WP3.5-C. v2 capabilities with no old-graph home
// (task-planning, knowledge-sync) are intentionally absent; the old
// solution-challenge/review points both resolve to solution-gate. Do not
// extend this map.

import type { NodeType } from "../sdlc_graph/types";
import type { NodeCapabilityId } from "../loop/types";

export type RuntimeCapabilityExecutionPoint = Exclude<NodeType, "validation"> | "code-review";

export const RUNTIME_CAPABILITY_BY_EXECUTION_POINT: Readonly<
  Record<RuntimeCapabilityExecutionPoint, NodeCapabilityId>
> = Object.freeze({
  "requirement-summary": "requirement-intake",
  "tech-design": "solution-design",
  "solution-challenge": "solution-gate",
  review: "solution-gate",
  implementation: "implementation",
  "code-review": "code-review",
});

export function capabilityForRuntimeExecutionPoint(
  nodeId: RuntimeCapabilityExecutionPoint,
): NodeCapabilityId {
  const capability = RUNTIME_CAPABILITY_BY_EXECUTION_POINT[nodeId];
  if (capability === undefined) throw new Error("runtime execution point is not mapped to a capability");
  return capability;
}

export function runtimeExecutionPointForCapability(
  capability: NodeCapabilityId,
): RuntimeCapabilityExecutionPoint {
  const entry = Object.entries(RUNTIME_CAPABILITY_BY_EXECUTION_POINT).find(([, value]) => value === capability);
  if (entry === undefined) throw new Error("capability is not mapped to a runtime execution point");
  return entry[0] as RuntimeCapabilityExecutionPoint;
}
