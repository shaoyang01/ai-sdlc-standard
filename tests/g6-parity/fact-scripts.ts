// G6 / D-090-04 offline parity harness — fact-script builders
// ============================================================================
// Each scenario family gets a builder producing the shared FactScript. The
// script is the SINGLE source of facts for both faces: the manual face
// declares it through the publisher, the runtime face replays it through the
// scripted deterministic gateway.

import type { FactScript, FindingFact, NodeFact, ScenarioCoords, ScenarioSpec } from "./types";
import { runtimeRunId } from "./types";

const REQ_BASE = "20260920-G6";

function nodeFact(
  node: string,
  artifactKind: string,
  content: string,
  version: string,
  extra: Partial<NodeFact> = {},
): NodeFact {
  return Object.freeze({ node, artifactKind, content, version, ...extra });
}

/** The plain seven-node chain with a scripted gate verdict (passing verdicts). */
function chainWithVerdict(
  requirementId: string,
  depth: "LIGHT" | "STANDARD" | "DEEP",
  verdict: "PASS" | "FAIL" | "PASS_WITH_RISK" | "BLOCKED_UNKNOWN",
): NodeFact[] {
  const gateExtra: Partial<NodeFact> =
    verdict === "PASS"
      ? { gateResult: "PASS", decisionStatus: "CONFIRMED", decisionDepth: depth }
      : verdict === "FAIL"
        ? { gateResult: "FAIL", decisionStatus: "CONFIRMED", decisionDepth: depth }
        : verdict === "PASS_WITH_RISK"
          ? { gateResult: "PASS_WITH_RISK", decisionStatus: "CONFIRMED", decisionDepth: depth }
          : { gateResult: "FAIL", decisionStatus: "BLOCKED_UNKNOWN" };
  return [
    nodeFact("requirement-intake", "requirement_summary", `# ${requirementId} intake\n`, "1.0.0"),
    nodeFact("solution-design", "technical_design", `# ${requirementId} design\n`, "1.0.0"),
    nodeFact("solution-gate", "solution_review", `# ${requirementId} gate\n`, "1.0.0", gateExtra),
    nodeFact("task-planning", "task_plan", `# ${requirementId} plan\n`, "1.0.0"),
    nodeFact("implementation", "implementation_record", `# ${requirementId} impl\n`, "1.0.0"),
    nodeFact("code-review", "review_summary", `# ${requirementId} review\n`, "1.0.0"),
    nodeFact("knowledge-sync", "knowledge_sync_result", `# ${requirementId} knowledge\n`, "1.0.0"),
  ];
}

/**
 * The rework wave for a non-passing first-round verdict (d087 scenario-2
 * pattern = the real manual flow: the gate FAILs, the finding reflows to
 * solution-design, the rebuilt design is re-adjudicated until PASS). The
 * manifests converge only once a PASS verdict authors the gate revision — a
 * FAIL/BLOCKED_UNKNOWN verdict authors none (WP6), so a wave that never
 * re-gates to PASS can never reach cross-face equivalence.
 */
function waveWithRework(
  requirementId: string,
  depth: "LIGHT" | "STANDARD" | "DEEP",
  verdict: "FAIL" | "BLOCKED_UNKNOWN",
): { nodes: NodeFact[]; findings: FindingFact[] } {
  const runId = runtimeRunId(requirementId);
  const designV1 = nodeFact("solution-design", "technical_design", `# ${requirementId} design\n`, "1.0.0");
  const designV2 = nodeFact("solution-design", "technical_design", `# ${requirementId} design v2\n`, "2.0.0", { attempt: 2 });
  const gateV1Content = `# ${requirementId} gate\n`;
  const gateV2Content = `# ${requirementId} gate v2\n`;
  const failedExtra: Partial<NodeFact> =
    verdict === "FAIL"
      ? { gateResult: "FAIL", decisionStatus: "CONFIRMED", decisionDepth: depth }
      : { gateResult: "FAIL", decisionStatus: "BLOCKED_UNKNOWN" };
  const nodes: NodeFact[] = [
    nodeFact("requirement-intake", "requirement_summary", `# ${requirementId} intake\n`, "1.0.0"),
    designV1,
    nodeFact("solution-gate", "solution_review", gateV1Content, "1.0.0", failedExtra),
    designV2,
    nodeFact("solution-gate", "solution_review", gateV2Content, "2.0.0", {
      attempt: 2,
      gateResult: "PASS",
      decisionStatus: "CONFIRMED",
      decisionDepth: depth,
    }),
    nodeFact("task-planning", "task_plan", `# ${requirementId} plan\n`, "1.0.0"),
    nodeFact("implementation", "implementation_record", `# ${requirementId} impl\n`, "1.0.0"),
    nodeFact("code-review", "review_summary", `# ${requirementId} review\n`, "1.0.0"),
    nodeFact("knowledge-sync", "knowledge_sync_result", `# ${requirementId} knowledge\n`, "1.0.0"),
  ];
  // The gate-round finding: discovered at the solution-gate (SOLUTION category
  // → earliest node solution-design), anchored to the examined design v1
  // revision, resolved by the re-adjudicating PASS round whose revision and
  // verdict artifact are the closure evidence.
  const findings: FindingFact[] = [
    Object.freeze({
      findingId: `${requirementId}-F01`,
      discoveredAt: "solution-gate",
      category: "SOLUTION",
      earliest: "solution-design",
      sourceRevisionId: `${runId}:revision:solution-design:1`,
      evidenceKind: "technical_design",
      evidenceContent: designV1.content,
      registerAfter: "solution-gate",
      resolveAfter: "solution-gate",
      action: Object.freeze({
        action: "resolve" as const,
        closedBy: "solution-gate",
        evidenceKind: "solution_review",
        evidenceContent: gateV2Content,
        boundRevisionId: `${runId}:revision:solution-gate:1`,
      }),
    }),
  ];
  return { nodes, findings };
}

function coords(over: Partial<ScenarioCoords>): ScenarioCoords {
  return Object.freeze({
    initClass: "new-project",
    depth: "STANDARD",
    verdict: "PASS",
    round: "first",
    manifestState: "new",
    crashResume: "none",
    ...over,
  });
}

export function buildFirstRoundScript(
  depth: "LIGHT" | "STANDARD" | "DEEP",
  verdict: "PASS" | "FAIL" | "PASS_WITH_RISK" | "BLOCKED_UNKNOWN",
  requirementId: string = `${REQ_BASE}-${depth}-${verdict}`,
): FactScript {
  if (verdict === "FAIL" || verdict === "BLOCKED_UNKNOWN") {
    const wave = waveWithRework(requirementId, depth, verdict);
    return Object.freeze({
      requirementId,
      requestedDepth: depth,
      nodes: wave.nodes,
      findings: wave.findings,
    });
  }
  return Object.freeze({
    requirementId,
    requestedDepth: depth,
    nodes: chainWithVerdict(requirementId, depth, verdict),
    findings: [],
  });
}

/** S-CORE first-round scenarios: depth × verdict cross (12). */
export function coreFirstRoundScenarios(): ScenarioSpec[] {
  const specs: ScenarioSpec[] = [];
  for (const depth of ["LIGHT", "STANDARD", "DEEP"] as const) {
    for (const verdict of ["PASS", "FAIL", "PASS_WITH_RISK", "BLOCKED_UNKNOWN"] as const) {
      const id = `S-CORE-${depth}-${verdict}-first`;
      specs.push(
        Object.freeze({
          id,
          family: "S-CORE" as const,
          coords: coords({ depth, verdict, round: "first" }),
          build: () => buildFirstRoundScript(depth, verdict, `20260920-${id}`),
        }),
      );
    }
  }
  return specs;
}
