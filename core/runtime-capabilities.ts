// Runtime Capabilities Loader
// ============================
// Read-only loader for machine-readable capability metadata.
// Does not affect runtime behavior. For tests and tooling only.

import * as fs from "node:fs";
import * as path from "node:path";

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
}>;

export function loadRuntimeCapabilities(
  filePath = "runtime-capabilities.json"
): RuntimeCapabilities {
  const fullPath = path.resolve(filePath);
  const raw = fs.readFileSync(fullPath, "utf-8");
  return JSON.parse(raw) as RuntimeCapabilities;
}
