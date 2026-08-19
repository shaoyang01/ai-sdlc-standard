// Canonical projection from the current Runtime execution points to C01
// agent-neutral node capabilities. Delivery LoopStageName values deliberately
// do not appear here: delivery stages are a different state machine.

import type { NodeType } from "../sdlc_graph/types";
import type { NodeCapabilityId } from "../loop/types";

export type RuntimeCapabilityExecutionPoint = NodeType | "code-review";

export const RUNTIME_CAPABILITY_BY_EXECUTION_POINT: Readonly<
  Record<RuntimeCapabilityExecutionPoint, NodeCapabilityId>
> = Object.freeze({
  "requirement-summary": "requirement-intake",
  "tech-design": "tech-design",
  "solution-challenge": "solution-challenge",
  review: "solution-review",
  implementation: "implementation",
  "code-review": "code-review",
  validation: "test-validation",
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
