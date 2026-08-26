// C03 Delivery Tail — runtime guards and manual handoff contract
// =================================================================
// c1: development_path_entry deterministic guard (migrated from retired
//     gate-runner; Decision-044 single-rail: solution-gate depth verdict
//     is the sole authority for entering implementation path).
// c2: documentation_governance_tail_completion check (migrated to C03
//     Delivery Tail / delivery-checkpoint; INV9 base reused).
// c3: manual handoff checklist aggregation contract (READY_FOR_MANUAL_GIT_HANDOFF
//     or honest blocked;对接 C05 未来验收).
//
// Pure functions. No runtime side effects, no agents, no DB, no Gateway.
// Consumes store public facts only.

import { NODE_CAPABILITY_CONTRACTS } from "./node-capability-contracts";

// ═══════════════════════════════════════ Types

export type SolutionGateResult = "PASS" | "FAIL" | "PASS_WITH_RISK";

export type DesignDepth = "LIGHT" | "STANDARD" | "DEEP";

export type DecisionStatus = "DECIDED" | "BLOCKED_UNKNOWN";

export interface SolutionGateVerdict {
  readonly gateResult: SolutionGateResult;
  readonly depth: DesignDepth | null;
  readonly decisionStatus: DecisionStatus;
  readonly blockingFindings: readonly string[];
  readonly riskAcceptanceRefs: readonly string[];
  readonly verdictArtifactRef: string | null;
}

export type DevelopmentPathEntryDecision =
  | { readonly allowed: true; readonly reason: string; readonly depth: DesignDepth }
  | { readonly allowed: false; readonly reason: string; readonly blockingFindings: readonly string[] };

export interface NodeEvidenceStatus {
  readonly capability: string;
  readonly artifactPresent: boolean;
  readonly artifactRef: string | null;
  readonly version: string | null;
  readonly gateMet: boolean | null;
  readonly notes: string;
}

export type DocumentationGovernanceTailStatus =
  | { readonly complete: true; readonly reason: string; readonly evidence: readonly NodeEvidenceStatus[] }
  | { readonly complete: false; readonly reason: string; readonly missing: readonly string[]; readonly evidence: readonly NodeEvidenceStatus[] };

export interface ManualHandoffChecklist {
  readonly schema: "c03-manual-handoff-checklist-v1";
  readonly runId: string;
  readonly requirementId: string;
  readonly generation: number;
  readonly status: "READY_FOR_MANUAL_GIT_HANDOFF" | "BLOCKED" | "FAILED";
  readonly reason: string;

  // c3 aggregation fields
  readonly implementationRecord: {
    readonly present: boolean;
    readonly artifactRef: string | null;
    readonly summary: string;
    readonly unexecutedItems: readonly string[];
  };
  readonly codeReview: {
    readonly present: boolean;
    readonly artifactRef: string | null;
    readonly summary: string;
    readonly openFindings: readonly string[];
    readonly closureReviewDone: boolean;
  };
  readonly knowledgeSync: {
    readonly present: boolean;
    readonly artifactRef: string | null;
    readonly decision: "NO_CHANGE" | "APPLY_LOCAL" | "PROPOSAL_ONLY" | "BLOCKED_CONFLICT" | null;
    readonly summary: string;
  };
  readonly residualRisks: readonly {
    readonly id: string;
    readonly description: string;
    readonly severity: "low" | "medium" | "high";
    readonly acceptanceRef: string | null;
  }[];
  readonly recoveryInstructions: string;
  readonly evidenceDigest: string | null;
  readonly generatedAt: string;
}

// ═══════════════════════════════════════ c1: development_path_entry guard

/**
 * Deterministic guard for entering the implementation path.
 * Migrated from retired gate-runner's development_path_entry special Gate.
 * Decision-044 single-rail: solution-gate depth verdict is the sole authority.
 *
 * Rules:
 * - gateResult must be PASS or PASS_WITH_RISK (FAIL → blocked)
 * - decisionStatus must be DECIDED (BLOCKED_UNKNOWN → blocked, must return to earliest affected node)
 * - depth must be non-null (LIGHT/STANDARD/DEEP)
 * - PASS_WITH_RISK requires at least one riskAcceptanceRef
 * - blockingFindings must be empty
 */
export function developmentPathEntryGuard(verdict: SolutionGateVerdict): DevelopmentPathEntryDecision {
  // FAIL → blocked
  if (verdict.gateResult === "FAIL") {
    return {
      allowed: false,
      reason: "solution-gate verdict is FAIL; cannot enter implementation path",
      blockingFindings: verdict.blockingFindings,
    };
  }

  // BLOCKED_UNKNOWN → blocked
  if (verdict.decisionStatus === "BLOCKED_UNKNOWN") {
    return {
      allowed: false,
      reason: "decision_status is BLOCKED_UNKNOWN; must return to earliest affected node to complete facts",
      blockingFindings: verdict.blockingFindings,
    };
  }

  // depth must be non-null
  if (verdict.depth === null) {
    return {
      allowed: false,
      reason: "depth verdict is null; solution-gate must adjudicate design depth before implementation",
      blockingFindings: verdict.blockingFindings,
    };
  }

  // blocking findings must be empty
  if (verdict.blockingFindings.length > 0) {
    return {
      allowed: false,
      reason: `${verdict.blockingFindings.length} unresolved blocking finding(s); cannot enter implementation`,
      blockingFindings: verdict.blockingFindings,
    };
  }

  // PASS_WITH_RISK requires risk acceptance
  if (verdict.gateResult === "PASS_WITH_RISK" && verdict.riskAcceptanceRefs.length === 0) {
    return {
      allowed: false,
      reason: "PASS_WITH_RISK requires at least one risk acceptance reference; none provided",
      blockingFindings: [],
    };
  }

  // All checks passed
  return {
    allowed: true,
    reason: `solution-gate ${verdict.gateResult}, depth=${verdict.depth}, decision_status=DECIDED; implementation path entry granted`,
    depth: verdict.depth,
  };
}

// ═══════════════════════════════════════ c2: documentation_governance_tail_completion

/**
 * Checks whether the documentation governance tail is complete.
 * Migrated from retired gate-runner's documentation_governance_tail_completion
 * special Gate to C03 Delivery Tail.
 *
 * Checks all seven node artifacts are present and gates are met:
 * 00-需求资料, 01-技术方案, 02-方案审核, 03-任务规划,
 * 04-实现记录, 05-代码审核, 06-知识同步
 */
export function checkDocumentationGovernanceTailCompletion(
  evidence: readonly NodeEvidenceStatus[]
): DocumentationGovernanceTailStatus {
  const requiredCapabilities = NODE_CAPABILITY_CONTRACTS.map((c) => c.capability);
  const missing: string[] = [];

  for (const cap of requiredCapabilities) {
    const nodeEvidence = evidence.find((e) => e.capability === cap);
    if (!nodeEvidence || !nodeEvidence.artifactPresent) {
      missing.push(cap);
    } else if (nodeEvidence.gateMet === false) {
      missing.push(`${cap} (gate not met)`);
    }
  }

  if (missing.length > 0) {
    return {
      complete: false,
      reason: `${missing.length} missing or incomplete node artifact(s)`,
      missing,
      evidence,
    };
  }

  return {
    complete: true,
    reason: `all ${requiredCapabilities.length} node artifacts present and gates met`,
    evidence,
  };
}

// ═══════════════════════════════════════ c3: manual handoff checklist builder

/**
 * Builds the manual handoff checklist aggregation contract.
 * Outputs READY_FOR_MANUAL_GIT_HANDOFF or honest blocked/failed.
 *对接 C05 未来验收.
 *
 * Aggregates: implementation record, code review, knowledge sync,
 * unexecuted items, residual risks, recovery instructions.
 */
export function buildManualHandoffChecklist(input: {
  readonly runId: string;
  readonly requirementId: string;
  readonly generation: number;
  readonly implementationRecord: ManualHandoffChecklist["implementationRecord"];
  readonly codeReview: ManualHandoffChecklist["codeReview"];
  readonly knowledgeSync: ManualHandoffChecklist["knowledgeSync"];
  readonly residualRisks: ManualHandoffChecklist["residualRisks"];
  readonly recoveryInstructions: string;
  readonly evidenceDigest: string | null;
  readonly tailStatus: DocumentationGovernanceTailStatus;
  readonly pathEntry: DevelopmentPathEntryDecision;
}): ManualHandoffChecklist {
  const generatedAt = new Date().toISOString();

  // Determine status
  let status: ManualHandoffChecklist["status"] = "READY_FOR_MANUAL_GIT_HANDOFF";
  const reasons: string[] = [];

  // c2: tail must be complete
  if (!input.tailStatus.complete) {
    status = "BLOCKED";
    reasons.push(`documentation governance tail incomplete: ${input.tailStatus.reason}`);
  }

  // c1: path entry must be allowed (for implementation-heavy runs)
  if (!input.pathEntry.allowed && input.implementationRecord.present) {
    status = "BLOCKED";
    reasons.push(`development path entry not allowed: ${input.pathEntry.reason}`);
  }

  // implementation record must be present
  if (!input.implementationRecord.present) {
    status = "BLOCKED";
    reasons.push("implementation record missing");
  }

  // code review must be present and closure review done
  if (!input.codeReview.present) {
    status = "BLOCKED";
    reasons.push("code review missing");
  } else if (!input.codeReview.closureReviewDone) {
    status = "BLOCKED";
    reasons.push("code review closure review not done");
  } else if (input.codeReview.openFindings.length > 0) {
    status = "BLOCKED";
    reasons.push(`${input.codeReview.openFindings.length} open code review finding(s)`);
  }

  // knowledge sync must be present
  if (!input.knowledgeSync.present) {
    status = "BLOCKED";
    reasons.push("knowledge sync result missing");
  } else if (input.knowledgeSync.decision === "BLOCKED_CONFLICT") {
    status = "BLOCKED";
    reasons.push("knowledge sync decision is BLOCKED_CONFLICT");
  }

  // high residual risks without acceptance → blocked
  const unacceptedHighRisks = input.residualRisks.filter(
    (r) => r.severity === "high" && r.acceptanceRef === null
  );
  if (unacceptedHighRisks.length > 0) {
    status = "BLOCKED";
    reasons.push(`${unacceptedHighRisks.length} high residual risk(s) without acceptance`);
  }

  const reason = reasons.length > 0
    ? reasons.join("; ")
    : "all checks passed; ready for manual git handoff";

  return {
    schema: "c03-manual-handoff-checklist-v1",
    runId: input.runId,
    requirementId: input.requirementId,
    generation: input.generation,
    status,
    reason,
    implementationRecord: input.implementationRecord,
    codeReview: input.codeReview,
    knowledgeSync: input.knowledgeSync,
    residualRisks: input.residualRisks,
    recoveryInstructions: input.recoveryInstructions,
    evidenceDigest: input.evidenceDigest,
    generatedAt,
  };
}

// ═══════════════════════════════════════ Constants

export const C03_MANUAL_HANDOFF_SCHEMA = "c03-manual-handoff-checklist-v1" as const;

export const C03_REQUIRED_NODE_ARTIFACTS = [
  "00-需求资料",
  "01-技术方案",
  "02-方案审核",
  "03-任务规划",
  "04-实现记录",
  "05-代码审核",
  "06-知识同步",
] as const;

export const C03_TERMINAL_STATUSES = [
  "READY_FOR_MANUAL_GIT_HANDOFF",
  "BLOCKED",
  "FAILED",
] as const;
