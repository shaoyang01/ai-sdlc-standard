// Runtime Capabilities Loader
// ============================
// Read-only loader for machine-readable capability metadata.
// Does not affect runtime behavior. For tests and tooling only.

import * as fs from "node:fs";
import * as path from "node:path";

export type RuntimeCapabilitiesAuthority = Readonly<{
  model: string;
  human_status_index: string;
  implementation_fact_precedence: string;
  global_project_status_authority: boolean;
  planning_authority: boolean;
  authorization_authority: boolean;
  operator_authority: boolean;
  rollout_authority: boolean;
  publication_authority: boolean;
  legacy_recommended_next_pr_authority: string;
  role: string;
  scope: string;
}>;

export type RuntimeCapabilities = Readonly<{
  version: number;
  runtime: Record<string, unknown>;
  execution: Record<string, unknown>;
  artifacts: Record<string, unknown>;
  review_loop: Record<string, unknown>;
  feedback: Record<string, unknown>;
  memory: Record<string, unknown>;
  routing: Record<string, unknown>;
  self_evolution: Record<string, unknown>;
  safety_boundaries: Record<string, unknown>;
  skills: Record<string, unknown>;
  skill_flow_orchestrator: Record<string, unknown>;
  real_agent_adapter_integration: Record<string, unknown>;
  authority: RuntimeCapabilitiesAuthority;
}>;

export function loadRuntimeCapabilities(
  filePath = "runtime-capabilities.json"
): RuntimeCapabilities {
  const fullPath = path.resolve(filePath);
  const raw = fs.readFileSync(fullPath, "utf-8");
  return JSON.parse(raw) as RuntimeCapabilities;
}
