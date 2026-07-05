// Agent Policy Types
// ===================
// Multi-factor policy weights for agent selection.

export type AgentPolicy = {
  complexityWeight: number;
  costWeight: number;
  latencyWeight: number;
  reasoningWeight: number;
};

export const DEFAULT_POLICY: AgentPolicy = {
  complexityWeight: 0.4,
  costWeight: 0.2,
  latencyWeight: 0.2,
  reasoningWeight: 0.2,
};
