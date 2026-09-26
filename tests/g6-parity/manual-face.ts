// G6 / D-090-04 offline parity harness — manual face driver
// ============================================================================
// Replays a FactScript through the REAL publisher (the G5-ratified parity
// reference), generalizing the T5 driveManualChain pattern to arbitrary
// scripts. The manual face declares: init (depth) + finding register/action +
// one entry-update per node completion (with gate fields on solution-gate).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { FactScript, NodeFact } from "./types";
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
  /** The seed manifest produced by `init` — the shared starting state for both faces. */
  readonly seedManifestText: string;
  /**
   * S-MANIFEST reconcile: the manifest snapshot taken right after the
   * midTakeoverAfter node's entry-update — the takeover baseline for the
   * runtime face's intermediate projection.
   */
  readonly intermediateManifestText?: string;
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

  const seedManifestText = readFileSync(join(libDir, "manifest.md"), "utf8");

  let seq = 2;
  const manifestPath = join(libDir, "manifest.md");
  let intermediateManifestText: string | undefined;
  let lastEntryUpdateArgs: string[] = [];
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

  // Finding ACTIONS publish BETWEEN declarations at the settlement points the
  // runtime face uses — the real manual flow's shape. The publisher validates
  // an accept against the gate's CURRENT verdict row, so a PWR accept must
  // land while its own round's row is current: end-batching the actions reads
  // a later re-gate's PASS row and refuses (the PWR × Re-Gate wave's first
  // failure). The rule mirrors runtime-face's settleFindingActions exactly:
  // the round basis is STAGE-LOCAL (the solution-gate stage counts gate
  // rounds, the code-review stage counts review rounds — neither shares the
  // other's counter), a finding carrying closedAtRound settles at that
  // stage-round's node, and an M1-shape finding (accepts, single-wave
  // resolves) settles at the first passing gate round or its non-gate
  // closing node.
  let gateRoundCounter = 0;
  let reviewRoundCounter = 0;
  const settledFindingIds = new Set<string>();
  const settleDueFindingActions = (node: NodeFact): void => {
    let stageRound = 0;
    if (node.node === "solution-gate") {
      gateRoundCounter += 1;
      stageRound = gateRoundCounter;
    } else if (node.node === "code-review") {
      reviewRoundCounter += 1;
      stageRound = reviewRoundCounter;
    }
    const gatePassing =
      node.node === "solution-gate" && (node.gateResult === "PASS" || node.gateResult === "PASS_WITH_RISK");
    for (const finding of script.findings) {
      if (finding.action === undefined || settledFindingIds.has(finding.findingId)) continue;
      if (finding.resolveAfter !== node.node) continue;
      if (finding.closedAtRound !== undefined) {
        if (finding.closedAtRound !== stageRound) continue;
      } else if (node.node === "solution-gate" && !gatePassing) {
        continue;
      }
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
      settledFindingIds.add(finding.findingId);
    }
  };

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
    if (node.node === "solution-gate") args.push("--binding", "formal_verdict");
    if (node.gateResult !== undefined) args.push("--gate-result", node.gateResult);
    if (node.decisionStatus !== undefined) args.push("--decision-status", node.decisionStatus);
    if (node.decisionDepth !== undefined) args.push("--decision-depth", node.decisionDepth);
    // Mirror the finding-invalidation truth the runtime store applies when a
    // gate-round finding registers (its earliest-affected scope goes STALE) —
    // a current row there would be a genuine B2 divergence (T5 ACCEPTED).
    if (node.staleNodes !== undefined && node.staleNodes.length > 0) {
      args.push("--stale-nodes", node.staleNodes.join(","));
    }
    publisher(libDir, args);
    lastEntryUpdateArgs = args;
    if (
      script.midTakeoverAfter !== undefined &&
      node.node === script.midTakeoverAfter &&
      intermediateManifestText === undefined
    ) {
      intermediateManifestText = readFileSync(manifestPath, "utf8");
    }
    settleDueFindingActions(node);
  }

  // S-CRASH manual-face assertion: the publisher's same-input replay is a
  // NO-OP that leaves the manifest byte-identical.
  if (script.assertPublisherReplayIdempotent === true && lastEntryUpdateArgs.length > 0) {
    const beforeReplay = readFileSync(manifestPath, "utf8");
    publisher(libDir, lastEntryUpdateArgs);
    if (readFileSync(manifestPath, "utf8") !== beforeReplay) {
      throw new Error("publisher same-input replay is not byte-idempotent");
    }
  }

  // Every declared action must have landed at its settlement point — an
  // unsettleable finding is a script/driver bug, never a silent drop.
  const unsettled = script.findings.filter(
    (finding) => finding.action !== undefined && !settledFindingIds.has(finding.findingId),
  );
  if (unsettled.length > 0) {
    throw new Error(`findings never reached their settlement point: ${unsettled.map((f) => f.findingId).join(", ")}`);
  }

  return {
    manifestPath,
    manifestText: readFileSync(manifestPath, "utf8"),
    seedManifestText,
    ...(intermediateManifestText === undefined ? {} : { intermediateManifestText }),
  };
}
