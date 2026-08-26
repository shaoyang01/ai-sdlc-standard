// Repository Capability Inventory Loader
// =======================================
// Read-only loader for machine-readable capability inventory.
// Does not affect runtime behavior. For tests and future tooling only.

import * as fs from "node:fs";
import * as path from "node:path";

export type RepositoryCapabilityInventory = Readonly<{
  version: number;
  generated_by: string;
  updated_for: string;
  skills: ReadonlyArray<Record<string, unknown>>;
  skill_registry_files: ReadonlyArray<Record<string, unknown>>;
  runtime_entrypoints: ReadonlyArray<Record<string, unknown>>;
  summary: Record<string, unknown>;
}>;

export function loadRepositoryCapabilityInventory(
  filePath = "metadata/capabilities/shared/existing-skills-inventory.json"
): RepositoryCapabilityInventory {
  const fullPath = path.resolve(filePath);
  const raw = fs.readFileSync(fullPath, "utf-8");
  return JSON.parse(raw) as RepositoryCapabilityInventory;
}
