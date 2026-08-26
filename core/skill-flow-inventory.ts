// Skill Flow Inventory Loader
// ============================
// Read-only loader for machine-readable skill flow inventory.
// Does not affect runtime behavior. For tests and tooling only.

import * as fs from "node:fs";
import * as path from "node:path";

export type SkillFlowInventory = Readonly<{
  version: number;
  source_report: string;
  model: string;
  global_entry_skill: string;
  skills: ReadonlyArray<Record<string, unknown>>;
  flows: ReadonlyArray<Record<string, unknown>>;
  runtime_relationships: ReadonlyArray<Record<string, unknown>>;
  retired_flows: ReadonlyArray<Record<string, unknown>>;
  summary: Record<string, unknown>;
}>;

export function loadSkillFlowInventory(
  filePath = "metadata/capabilities/shared/skill-flow-inventory.json"
): SkillFlowInventory {
  const fullPath = path.resolve(filePath);
  const raw = fs.readFileSync(fullPath, "utf-8");
  return JSON.parse(raw) as SkillFlowInventory;
}
