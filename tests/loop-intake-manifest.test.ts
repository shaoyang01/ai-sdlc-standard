// LoopIntakeManifest — closed-schema parser tests (Decision-078, design §3).
// ============================================================================
// Positive: both statuses parse with the full field set round-tripped.
// Negative matrix: every fail-closed rule is a distinct, decidable rejection —
// unknown field, missing field, bad schema, bad enum, bad id, control chars,
// relative path, repositoryPath===controlRoot, empty sourceFiles, bad time.
import { strict as assert } from "node:assert";

import {
  INTAKE_MANIFEST_SCHEMA,
  IntakeManifestError,
  parseIntakeManifest,
} from "../core/loop-intake-manifest";

let passed = 0;
function check(name: string, cond: boolean): void {
  if (!cond) throw new Error(`✗ ${name}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: INTAKE_MANIFEST_SCHEMA,
    status: "confirmed",
    requirementId: "20260901-fix-md5",
    changeClass: "new",
    sourceType: "conversation",
    sourceFiles: ["/tmp/library/20260901-fix-md5/00-需求资料/normalized.md"],
    repository: "org/repo",
    repositoryPath: "/tmp/library/repo",
    baseBranch: "main",
    taskBranch: "runtime/20260901-fix-md5",
    controlRoot: "/tmp/library/control",
    confirmedAt: "2026-09-01T08:00:00Z",
    confirmedBy: "current-user",
    ...overrides,
  };
}

function codeOf(raw: unknown): string {
  try {
    parseIntakeManifest(raw);
  } catch (error) {
    if (error instanceof IntakeManifestError) return error.code;
    throw error;
  }
  throw new Error("expected IntakeManifestError");
}

function main(): void {
  // ── positive ──
  {
    const m = parseIntakeManifest(manifest());
    check("confirmed manifest parses", m.status === "confirmed");
    check("requirementId round-trips", m.requirementId === "20260901-fix-md5");
    check("sourceFiles frozen array round-trips", m.sourceFiles.length === 1);
    check("draft manifest parses too (gate enforced by the CLI, not the parser)",
      parseIntakeManifest(manifest({ status: "draft" })).status === "draft");
    check("feedback changeClass parses",
      parseIntakeManifest(manifest({ changeClass: "feedback" })).changeClass === "feedback");
  }

  // ── negative matrix ──
  check("unknown field rejected",
    codeOf(manifest({ token: "smuggled" })) === "INTAKE_MANIFEST_INVALID_INPUT");
  check("missing field rejected",
    codeOf({ ...manifest(), confirmedBy: undefined }) === "INTAKE_MANIFEST_INVALID_INPUT");
  check("non-object rejected", codeOf("nope") === "INTAKE_MANIFEST_INVALID_INPUT");
  check("bad schema rejected",
    codeOf(manifest({ schema: "loop-intake-manifest:v2" })) === "INTAKE_MANIFEST_BAD_SCHEMA");
  check("bad status rejected", codeOf(manifest({ status: "approved" })) === "INTAKE_MANIFEST_INVALID_INPUT");
  check("bad changeClass rejected", codeOf(manifest({ changeClass: "refactor" })) === "INTAKE_MANIFEST_INVALID_INPUT");
  check("bad requirementId rejected",
    codeOf(manifest({ requirementId: "../traversal" })) === "INTAKE_MANIFEST_INVALID_INPUT");
  check("control chars in sourceType rejected",
    codeOf(manifest({ sourceType: "a\nb" })) === "INTAKE_MANIFEST_INVALID_INPUT");
  check("relative sourceFile rejected",
    codeOf(manifest({ sourceFiles: ["relative.md"] })) === "INTAKE_MANIFEST_BAD_PATH");
  check("empty sourceFiles rejected",
    codeOf(manifest({ sourceFiles: [] })) === "INTAKE_MANIFEST_INVALID_INPUT");
  check("relative repositoryPath rejected",
    codeOf(manifest({ repositoryPath: "repo" })) === "INTAKE_MANIFEST_BAD_PATH");
  check("repositoryPath===controlRoot rejected",
    codeOf(manifest({ controlRoot: "/tmp/library/repo" })) === "INTAKE_MANIFEST_BAD_PATH");
  check("bad confirmedAt rejected",
    codeOf(manifest({ confirmedAt: "yesterday" })) === "INTAKE_MANIFEST_BAD_TIME");

  console.log(`\nResults: ${passed} passed, 0 failed`);
}

main();
