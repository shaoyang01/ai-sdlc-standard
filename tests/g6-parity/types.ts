// G6 / D-090-04 offline parity harness — shared types (frozen spec §4-§6)
// ============================================================================
// The fact-script model: ONE script drives BOTH faces so they carry the same
// facts (same artifact contents -> same digests), the T5-established parity
// discipline. The manual face replays it through the real publisher; the
// runtime face replays it through the production entry (runProduction) with a
// scripted deterministic gateway (frozen D-1).

/** Canonical stable artifact paths per node (scripts/lib/canonical-artifact-path.rb). */
export const CANONICAL_PATHS: Readonly<Record<string, string>> = Object.freeze({
  "requirement-intake": "00-需求资料/{REQ}_需求摘要.md",
  "solution-design": "01-技术方案/{REQ}_技术方案.md",
  "solution-gate": "02-方案审核/{REQ}_方案审核.md",
  "task-planning": "03-任务规划/{REQ}_任务计划.md",
  "implementation": "04-实现记录/{REQ}_实现记录.md",
  "code-review": "05-代码审核/{REQ}_代码审核.md",
  "knowledge-sync": "06-知识同步/{REQ}_知识同步结果.md",
});

/**
 * The runtime face's run id for a requirement (both faces must agree on it:
 * the manual face's finding bindings reference runtime revision ids).
 */
export function runtimeRunId(requirementId: string): string {
  return `g6-${requirementId}`;
}

export const SEVEN_NODES: readonly string[] = Object.freeze([
  "requirement-intake",
  "solution-design",
  "solution-gate",
  "task-planning",
  "implementation",
  "code-review",
  "knowledge-sync",
]);

/** One node completion fact — the artifact both faces carry. */
export interface NodeFact {
  readonly node: string;
  readonly artifactKind: string;
  readonly content: string;
  readonly version: string;
  /** solution-gate only: the verdict both faces must carry. */
  readonly gateResult?: "PASS" | "FAIL" | "PASS_WITH_RISK";
  readonly decisionStatus?: "CONFIRMED" | "ESCALATED" | "BLOCKED_UNKNOWN";
  readonly decisionDepth?: "LIGHT" | "STANDARD" | "DEEP";
  /** rework wave: attempt > 1 marks a repeat completion of the same node. */
  readonly attempt?: number;
  /**
   * solution-gate only: the scan round's Finding Ledger content (the
   * canonical loop-capability-findings:v1 envelope). A PWR scenario's
   * scan-source finding binds to this ledger as its evidence.
   */
  readonly ledgerContent?: string;
  /**
   * Nodes the manual face must mark stale on THIS node's entry-update,
   * mirroring the finding-invalidation truth the runtime store applies when
   * a gate-round finding registers (its earliest-affected scope goes STALE).
   */
  readonly staleNodes?: readonly string[];
}

/** One finding fact (register + optional lifecycle action). */
export interface FindingFact {
  readonly findingId: string;
  readonly discoveredAt: string;
  readonly category: string;
  readonly earliest: string;
  readonly sourceRevisionId: string;
  readonly evidenceKind: string;
  readonly evidenceContent: string;
  /**
   * Wave wiring (d087 pattern): a gate-round finding registers at the
   * FAILING verdict (the gateway registers the round's findings with the
   * verdict) and resolves at the re-adjudicating PASS verdict (the itemized
   * closure binds the re-adjudicating round's revision + verdict artifact).
   * Both name the solution-gate node; the driver keys the register off a
   * non-passing verdict and the resolve off a passing one.
   */
  readonly registerAfter?: string;
  readonly resolveAfter?: string;
  readonly action?: {
    readonly action: "resolve" | "accept";
    readonly closedBy: string;
    readonly evidenceKind: string;
    readonly evidenceContent: string;
    readonly boundRevisionId: string;
  };
}

/** The shared fact script for one scenario. */
export interface FactScript {
  readonly requirementId: string;
  readonly requestedDepth: "LIGHT" | "STANDARD" | "DEEP";
  readonly nodes: readonly NodeFact[];
  readonly findings: readonly FindingFact[];
}

/** Matrix coordinates (frozen spec §3). */
export interface ScenarioCoords {
  readonly initClass: "new-project" | "existing-code" | "original-sdd" | "original-sdlc-sdd";
  readonly depth: "LIGHT" | "STANDARD" | "DEEP";
  readonly verdict: "PASS" | "FAIL" | "PASS_WITH_RISK" | "BLOCKED_UNKNOWN";
  readonly round: "first" | "upgrade" | "re-gate";
  readonly manifestState: "new" | "reconcile" | "corrupt";
  readonly crashResume: "none" | "crash-resume";
}

export interface ScenarioSpec {
  readonly id: string;
  readonly family: "S-CORE" | "S-INIT" | "S-MANIFEST" | "S-CRASH";
  readonly coords: ScenarioCoords;
  /** Pruning/degeneracy annotation (frozen spec §3), if this scenario replaces a pruned combo. */
  readonly prunes?: string;
  build(): FactScript;
}

/** One dimension verdict in the comparison result. */
export interface DimensionResult {
  readonly dimension: string;
  /**
   * MATCH/DIVERGE for dimensions this layer judges; NOT_JUDGED for
   * behavior-layer dimensions (an unjudged dimension is never MATCH —
   * G6T2-R1-H4).
   */
  readonly verdict: "MATCH" | "DIVERGE" | "NOT_JUDGED";
  readonly detail: string;
}

/** Per-scenario outcome. */
export interface ScenarioOutcome {
  readonly id: string;
  readonly family: string;
  readonly coords: ScenarioCoords;
  readonly dimensions: readonly DimensionResult[];
  readonly manualManifestPath: string;
  readonly runtimeManifestPath: string;
}

/** The frozen normalization whitelist (frozen spec §4.2 / T5 normalize()). */
export const NORMALIZE_DROP_HEAD: readonly string[] = Object.freeze([
  "projection_provenance",
  "declaration_log",
  "publish_seq",
  "projected_through",
  "updated_at",
  "corrections",
  "repair_records",
  "manifest_digest",
]);

export const NORMALIZE_DROP_ENTRY: readonly string[] = Object.freeze([
  "source_event_ref",
  "updated_at",
  "execution",
]);

export const NINE_DIMENSIONS: readonly string[] = Object.freeze([
  "node-sequence",
  "gate-roles",
  "artifact-paths",
  "version-state",
  "finding-identity",
  "decision-depth",
  "next-eligibility",
  "earliest-reroute",
  "final-handoff",
]);
