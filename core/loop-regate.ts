// C02-WP4: Earliest-Affected-Node Re-Gate Orchestration — planning layer
// ======================================================================
// Pure functions over journal facts. No store access, no I/O, no skill
// surface: a Re-Gate plan never contains, accepts or forwards skill,
// flowId or legacy Skill IDs (WP4/WP5 skill-isolation audit, CONDITIONAL
// PASS resume precondition #1).
//
// Inputs are reduced facts only:
// - findings: status / severity / earliestAffectedNodeId / createdAt;
// - currentByNode: per-node CURRENT revision facts (validity + generation).
//
// Semantics (plan §C02-WP4, impact analysis §8 F row 4):
// - Every OPEN finding blocks completion. Only causal regressions raised
//   against a fix-wave product re-drive a Re-Gate generation; findings on
//   the original product remain improvement obligations without rerouting.
// - A finding's rebuild scope is its canonical downstream set (itself
//   included). The scope is incomplete while any node in it has no current
//   revision or a non-ACTIVE current.
// - The restart target is the FIRST node of the governing finding's scope
//   (earliest start index; tie → oldest finding) that still needs a rebuild.
//   Upstream nodes are reused read-only; everything from the target on must
//   be rebuilt and re-gated.

import {
  LOOP_CAPABILITY_EXECUTION_POINTS,
  NODE_CAPABILITY_IDS,
  type CapabilityExecutionPoint,
  type NodeCapabilityId,
} from "../loop/types";
import { downstreamNodeIds } from "./loop-finding-lifecycle";

/** Reduced journal facts for one finding (no evidence blobs, no skill). */
export interface RegateFindingFacts {
  findingId: string;
  severity: string;
  status: string;
  earliestAffectedNodeId: NodeCapabilityId;
  /** Kept only as a deterministic tie-breaker between same-node findings. */
  createdAt: string;
  /**
   * DIRECT causal evidence (Round 2 review H2): the raising capability
   * declares REGRESSION (re-drives its rebuild scope) or IMPROVEMENT (blocks
   * completion only). Restart authorization is never inferred from a
   * revision's sequence number — both false positives (a sequence-2
   * improvement) and false negatives (a sequence-1 baseline invalidation)
   * are impossible by construction.
   */
  causeKind: "REGRESSION" | "IMPROVEMENT";
}

/** Reduced facts for a node's CURRENT artifact revision pointer. */
export interface CurrentRevisionFacts {
  validity: string;
  /** Re-Gate generation tag recorded by the runner (attempt number). */
  generation: number | null;
}

/**
 * Reduced fact of the latest verified FEEDBACK_DRIVEN_CHANGE record (WP1).
 * `previousGeneration` opens generation previousGeneration + 1: the wave is
 * consumed once every canonical node's CURRENT revision carries a strictly
 * greater generation.
 */
export interface FeedbackChangeFact {
  previousGeneration: number;
}

export interface RegatePlan {
  kind: "none" | "regate";
  /** Dispatch target as an index into LOOP_CAPABILITY_EXECUTION_POINTS. */
  restartPointIndex: number | null;
  /** Canonical node of the restart point (null when kind === "none"). */
  restartNode: NodeCapabilityId | null;
  /** Causal OPEN findings driving this plan (incomplete scope). */
  governingFindingIds: readonly string[];
  /** Earliest affected node of the governing set. */
  earliestAffectedNode: NodeCapabilityId | null;
  /** Nodes before the restart target whose currents are reused read-only. */
  reusedUpstreamNodes: readonly NodeCapabilityId[];
  /** Nodes from the restart target on that must be rebuilt and re-gated. */
  nodesToRebuild: readonly NodeCapabilityId[];
}

/**
 * Per-execution-point last attempt numbers (`"capability:executionRole"` →
 * attempt). Optional planner input used to refine the gate node's restart
 * target between its two roles mid-wave: after adversarial_scan has run a
 * newer attempt than formal_verdict, the wave continues at formal_verdict.
 */
export type PointLastAttempts = ReadonlyMap<string, number>;

/** First execution-point index of a canonical node (solution-gate → scan). */
export function firstExecutionPointIndexForNode(nodeId: NodeCapabilityId): number {
  return LOOP_CAPABILITY_EXECUTION_POINTS.findIndex(
    (point: CapabilityExecutionPoint) => point.capability === nodeId,
  );
}

function nodeIndexOf(nodeId: NodeCapabilityId): number {
  return NODE_CAPABILITY_IDS.indexOf(nodeId);
}

function scopeIncomplete(
  finding: RegateFindingFacts,
  currentByNode: ReadonlyMap<NodeCapabilityId, CurrentRevisionFacts>,
): boolean {
  return downstreamNodeIds(finding.earliestAffectedNodeId).some((nodeId) => {
    const current = currentByNode.get(nodeId);
    // Clock-free by design: the STALE mark written at finding-append time is
    // the invalidation truth, and only a rebuild wave flips it back to
    // ACTIVE. Wall-clock comparisons would break on skewed or forward-dated
    // findings.
    return current === undefined || current.validity !== "ACTIVE";
  });
}

/**
 * True when `node` still needs a rebuild: its CURRENT pointer is missing or
 * does not point at an ACTIVE revision (i.e., invalidation has not been
 * superseded by a fresh generation yet).
 */
export function nodeNeedsRebuild(
  nodeId: NodeCapabilityId,
  currentByNode: ReadonlyMap<NodeCapabilityId, CurrentRevisionFacts>,
): boolean {
  const current = currentByNode.get(nodeId);
  return current === undefined || current.validity !== "ACTIVE";
}

/**
 * G1 causal classification (Round 2 review H2): a finding re-drives the wave
 * only when its DIRECT declared cause kind is REGRESSION. The kind is a
 * mandatory persisted fact on every finding — there is no inference from
 * revision sequence numbers and no unknown default.
 */
function isCausalRegression(finding: RegateFindingFacts): boolean {
  return finding.causeKind === "REGRESSION";
}

/**
 * Plans the next dispatch under open Re-Gate obligations. Deterministic and
 * side-effect free: identical facts always yield the identical plan, so a
 * fresh agent can recover the same next action from the journal alone.
 */
export function planRegateFromFacts(
  findings: readonly RegateFindingFacts[],
  currentByNode: ReadonlyMap<NodeCapabilityId, CurrentRevisionFacts>,
  pointLastAttempts?: PointLastAttempts,
  feedbackChange?: FeedbackChangeFact | null,
): RegatePlan {
  // WP4 Round 1 H3 fix: external feedback re-enters ONLY through a verified
  // WP1 FEEDBACK_DRIVEN_CHANGE record, which opens the next generation. The
  // feedback wave starts at requirement-intake and takes precedence: a full
  // rebuild subsumes any finding-driven scope.
  let feedbackLaggingIdx: number | null = null;
  if (feedbackChange !== undefined && feedbackChange !== null) {
    const lagging = NODE_CAPABILITY_IDS.findIndex((nodeId) => {
      const current = currentByNode.get(nodeId);
      return current === undefined || (current.generation ?? 0) <= feedbackChange.previousGeneration;
    });
    if (lagging >= 0) feedbackLaggingIdx = lagging;
  }
  if (feedbackLaggingIdx !== null) {
    const targetNode = NODE_CAPABILITY_IDS[feedbackLaggingIdx]!;
    let fbPointIndex = firstExecutionPointIndexForNode(targetNode);
    if (targetNode === "solution-gate" && pointLastAttempts !== undefined) {
      const scanAtt = pointLastAttempts.get("solution-gate:adversarial_scan") ?? 0;
      const verdictAtt = pointLastAttempts.get("solution-gate:formal_verdict") ?? 0;
      if (scanAtt > verdictAtt) {
        fbPointIndex = firstExecutionPointIndexForNode("solution-gate") + 1;
      }
    }
    return Object.freeze({
      kind: "regate" as const,
      restartPointIndex: fbPointIndex,
      restartNode: targetNode,
      governingFindingIds: Object.freeze([]),
      earliestAffectedNode: NODE_CAPABILITY_IDS[0]!,
      reusedUpstreamNodes: Object.freeze(NODE_CAPABILITY_IDS.slice(0, feedbackLaggingIdx)),
      nodesToRebuild: Object.freeze(NODE_CAPABILITY_IDS.slice(feedbackLaggingIdx)),
    });
  }
  // Frozen v2 contract: ANY open finding blocks its scope's validity and
  // completion (computeFindingGate blocks on every OPEN). Round 2 review H2:
  // only CAUSAL regressions — findings whose declared causeKind is REGRESSION,
  // bound to the fix-wave revision that introduced them — RE-DRIVE a backward
  // wave. IMPROVEMENT findings keep completion blocked until resolved but
  // never re-route the chain, regardless of their source revision's sequence.
  const pending = findings.filter(
    (finding) =>
      finding.status === "OPEN" &&
      scopeIncomplete(finding, currentByNode) &&
      isCausalRegression(finding),
  );
  if (pending.length === 0) {
    return Object.freeze({
      kind: "none" as const,
      restartPointIndex: null,
      restartNode: null,
      governingFindingIds: Object.freeze([]),
      earliestAffectedNode: null,
      reusedUpstreamNodes: Object.freeze([]),
      nodesToRebuild: Object.freeze([]),
    });
  }
  // Conflict priority: the earliest affected node wins; ties break to the
  // oldest finding so wave progress is monotonic in creation order.
  const governing = [...pending].sort((a, b) => {
    const byNode = nodeIndexOf(a.earliestAffectedNodeId) - nodeIndexOf(b.earliestAffectedNodeId);
    if (byNode !== 0) return byNode;
    return a.createdAt.localeCompare(b.createdAt);
  })[0]!;
  const startIdx = nodeIndexOf(governing.earliestAffectedNodeId);
  // Wave progress: the first node in the governing scope that still needs a
  // rebuild is the dispatch target; earlier scope nodes were already rebuilt
  // after the finding landed.
  let targetIdx = -1;
  for (let i = startIdx; i < NODE_CAPABILITY_IDS.length; i += 1) {
    if (nodeNeedsRebuild(NODE_CAPABILITY_IDS[i]!, currentByNode)) {
      targetIdx = i;
      break;
    }
  }
  if (targetIdx < 0) {
    // Scope fully rebuilt since planning facts were taken — nothing to do.
    return Object.freeze({
      kind: "none" as const,
      restartPointIndex: null,
      restartNode: null,
      governingFindingIds: Object.freeze([]),
      earliestAffectedNode: null,
      reusedUpstreamNodes: Object.freeze([]),
      nodesToRebuild: Object.freeze([]),
    });
  }
  const restartNode = NODE_CAPABILITY_IDS[targetIdx]!;
  let restartPointIndex = firstExecutionPointIndexForNode(restartNode);
  if (restartNode === "solution-gate" && pointLastAttempts !== undefined) {
    // Mid-wave refinement: if the scan role already ran a newer attempt than
    // the verdict role, this gate round continues at formal_verdict.
    const scanAtt = pointLastAttempts.get("solution-gate:adversarial_scan") ?? 0;
    const verdictAtt = pointLastAttempts.get("solution-gate:formal_verdict") ?? 0;
    if (scanAtt > verdictAtt) {
      restartPointIndex = firstExecutionPointIndexForNode("solution-gate") + 1;
    }
  }
  return Object.freeze({
    kind: "regate" as const,
    restartPointIndex,
    restartNode,
    governingFindingIds: Object.freeze(pending.map((finding) => finding.findingId)),
    earliestAffectedNode: governing.earliestAffectedNodeId,
    reusedUpstreamNodes: Object.freeze(
      NODE_CAPABILITY_IDS.slice(0, targetIdx).filter(
        (nodeId) => !nodeNeedsRebuild(nodeId, currentByNode),
      ),
    ),
    nodesToRebuild: Object.freeze(NODE_CAPABILITY_IDS.slice(targetIdx)),
  });
}

/**
 * Historical restart authorization (read-path counterpart of the live
 * pending-plan check): a recorded backward jump to `targetPointIndex` is
 * accepted during full-chain re-validation iff some non-superseded causal
 * finding whose rebuild scope covers the target node exists anywhere in the
 * run. Finding source revisions are immutable journal facts, so replay can
 * distinguish a fix-wave regression from an original-product improvement.
 * A journal with no covering causal finding fails closed. Creation-time
 * comparisons are deliberately NOT used here: findings may carry
 * forward-dated createdAt by contract.
 */
export function historicalRestartAuthorized(
  findings: readonly RegateFindingFacts[],
  targetPointIndex: number,
): boolean {
  const targetNode = LOOP_CAPABILITY_EXECUTION_POINTS[targetPointIndex]?.capability;
  if (targetNode === undefined) return false;
  const targetIdx = NODE_CAPABILITY_IDS.indexOf(targetNode);
  return findings.some((finding) =>
    finding.status !== "SUPERSEDED" &&
    isCausalRegression(finding) &&
    NODE_CAPABILITY_IDS.indexOf(finding.earliestAffectedNodeId) <= targetIdx,
  );
}

/**
 * Design-depth decision surface (§C02-WP4): the depth verdict binds to the
 * current solution-gate formal_verdict round. PASS adjudicates the depth
 * decision; anything else leaves it BLOCKED_UNKNOWN and implementation must
 * not be entered.
 */
export type SolutionGateDecisionStatus = "DECIDED" | "BLOCKED_UNKNOWN";

export function solutionGateDecisionFromGateResult(
  formalGateResult: string | null,
): SolutionGateDecisionStatus | null {
  if (formalGateResult === null) return null;
  return formalGateResult === "PASS" ? "DECIDED" : "BLOCKED_UNKNOWN";
}
