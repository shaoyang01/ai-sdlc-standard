// Policy Memory Context
// =======================
// Pure factory. Wraps memory config + summary into a context object.
// No DB reads. No side effects.

import { PolicyMemorySummary } from "./policy-memory-types";

export type PolicyMemoryContext = Readonly<{
  enabled: boolean;
  available: boolean;
  summary: PolicyMemorySummary;
}>;

export function buildPolicyMemoryContext(input: {
  enabled: boolean;
  summary: PolicyMemorySummary;
}): PolicyMemoryContext {
  return {
    enabled: input.enabled,
    available: input.summary.available,
    summary: input.summary,
  };
}
