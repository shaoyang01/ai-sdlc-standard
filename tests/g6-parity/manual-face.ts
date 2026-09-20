// G6 / D-090-04 offline parity harness — manual face driver
// ============================================================================
// Replays a FactScript through the REAL publisher (the G5-ratified parity
// reference), generalizing the T5 driveManualChain pattern to arbitrary
// scripts. The manual face declares: init (depth) + finding register/action +
// one entry-update per node completion (with gate fields on solution-gate).

import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { FactScript } from "./types";
import { CANONICAL_PATHS } from "./types";

const PUBLISHER = join(process.cwd(), "scripts", "publish-requirement-manifest.sh");

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function publisher(libDir: string, args: readonly string[]): void {
  execFileSync("bash", [PUBLISHER, libDir, ...args], { stdio: "pipe" });
}

export interface ManualFaceResult {
  readonly manifestPath: string;
  readonly manifestText: string;
}

/** Drives the manual face for one fact script. Returns the produced manifest. */
export function driveManualFace(libDir: string, script: FactScript): ManualFaceResult {
  const { requirementId } = script;
  publisher(libDir, [
    "init",
    "--requirement-id",
    requirementId,
    "--requested-depth",
    script.requestedDepth,
    "--depth-basis",
    "user_requested",
    "--decision-scope",
    "FULL_REQUIREMENT",
    "--title",
    `G6 parity ${requirementId}`,
  ]);

  let seq = 2;
  for (const finding of script.findings) {
    publisher(libDir, [
      "finding-register",
      "--finding-id",
      finding.findingId,
      "--discovered-at",
      finding.discoveredAt,
      "--category",
      finding.category,
      "--earliest",
      finding.earliest,
      "--source-revision",
      finding.sourceRevisionId,
      "--evidence-ref",
      `loop-artifact:v1:${finding.evidenceKind}:sha256:${sha256(finding.evidenceContent)}`,
    ]);
  }

  for (const node of script.nodes) {
    const digest = sha256(node.content);
    const args = [
      "entry-update",
      "--node",
      node.node,
      "--declaration-seq",
      String(seq++),
      "--artifact-path",
      CANONICAL_PATHS[node.node].replace("{REQ}", requirementId),
      "--version",
      node.version,
      "--digest",
      digest,
      "--source-ref",
      CANONICAL_PATHS[node.node].replace("{REQ}", requirementId),
    ];
    if (node.gateResult !== undefined) args.push("--gate-result", node.gateResult);
    if (node.decisionStatus !== undefined) args.push("--decision-status", node.decisionStatus);
    if (node.decisionDepth !== undefined) args.push("--decision-depth", node.decisionDepth);
    publisher(libDir, args);
  }

  for (const finding of script.findings) {
    if (finding.action === undefined) continue;
    publisher(libDir, [
      "finding-action",
      "--finding-id",
      finding.findingId,
      "--action",
      finding.action.action,
      "--closed-by",
      finding.action.closedBy,
      "--evidence-ref",
      `loop-artifact:v1:${finding.action.evidenceKind}:sha256:${sha256(finding.action.evidenceContent)}`,
      "--evidence-digest",
      sha256(finding.action.evidenceContent),
      "--bound-revision-id",
      finding.action.boundRevisionId,
    ]);
  }

  const manifestPath = join(libDir, "manifest.md");
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  return { manifestPath, manifestText: readFileSync(manifestPath, "utf8") };
}
