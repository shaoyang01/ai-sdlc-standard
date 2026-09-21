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

/**
 * The plain seven-node chain with a scripted gate verdict (passing verdicts).
 * PASS is the plain chain; PWR carries the frozen spec's defining fact — a
 * scan-sourced finding risk-accepted under the PWR ruling (§3: "PASS_WITH_RISK,
 * scan 来源 finding 接受"; G6T2-R1-H5).
 */
function chainWithVerdict(
  requirementId: string,
  depth: "LIGHT" | "STANDARD" | "DEEP",
  verdict: "PASS" | "FAIL" | "PASS_WITH_RISK" | "BLOCKED_UNKNOWN",
): { nodes: NodeFact[]; findings: FindingFact[] } {
  const gateExtra: Partial<NodeFact> =
    verdict === "PASS"
      ? { gateResult: "PASS", decisionStatus: "CONFIRMED", decisionDepth: depth }
      : verdict === "PASS_WITH_RISK"
        ? { gateResult: "PASS_WITH_RISK", decisionStatus: "CONFIRMED", decisionDepth: depth }
        : verdict === "FAIL"
          ? { gateResult: "FAIL", decisionStatus: "CONFIRMED", decisionDepth: depth }
          : { gateResult: "FAIL", decisionStatus: "BLOCKED_UNKNOWN" };
  const gateContent = `# ${requirementId} gate\n`;
  const gateNode =
    verdict === "PASS_WITH_RISK"
      ? nodeFact("solution-gate", "solution_review", gateContent, "1.0.0", {
          ...gateExtra,
          // The scan round's Finding Ledger: one member, the finding the PWR
          // ruling risk-accepts (the store cross-checks the membership count).
          ledgerContent: `${JSON.stringify({
            schema: "loop-capability-findings:v1",
            findings: [{ finding_id: `${requirementId}-scan-1` }],
          })}\n`,
          // The scan finding invalidates the examined design current — the
          // manual face mirrors that truth on the gate entry-update (T5
          // ACCEPTED pattern: a current design row would be a real B2 drift).
          staleNodes: ["solution-design"],
        })
      : nodeFact("solution-gate", "solution_review", gateContent, "1.0.0", gateExtra);
  const nodes: NodeFact[] = [
    nodeFact("requirement-intake", "requirement_summary", `# ${requirementId} intake\n`, "1.0.0"),
    nodeFact("solution-design", "technical_design", `# ${requirementId} design\n`, "1.0.0"),
    gateNode,
    nodeFact("task-planning", "task_plan", `# ${requirementId} plan\n`, "1.0.0"),
    nodeFact("implementation", "implementation_record", `# ${requirementId} impl\n`, "1.0.0"),
    nodeFact("code-review", "review_summary", `# ${requirementId} review\n`, "1.0.0"),
    nodeFact("knowledge-sync", "knowledge_sync_result", `# ${requirementId} knowledge\n`, "1.0.0"),
  ];
  if (verdict !== "PASS_WITH_RISK") {
    return { nodes, findings: [] };
  }
  const runId = runtimeRunId(requirementId);
  // The scan-source finding: discovered at the solution-gate, its evidence IS
  // the consumed Finding Ledger (the only origin the risk-acceptance path
  // admits), anchored to the examined design revision, accepted by the PWR
  // ruling (closed_by=formal_verdict; the bound id is the verdict artifact
  // version, per the publisher's accept rule).
  const findings: FindingFact[] = [
    Object.freeze({
      findingId: `${requirementId}-F01`,
      discoveredAt: "solution-gate",
      category: "SOLUTION",
      earliest: "solution-design",
      sourceRevisionId: `${runId}:revision:solution-design:1`,
      evidenceKind: "capability_findings",
      evidenceContent: gateNode.ledgerContent!,
      registerAfter: "solution-gate",
      resolveAfter: "solution-gate",
      action: Object.freeze({
        action: "accept" as const,
        closedBy: "formal_verdict",
        evidenceKind: "solution_review",
        evidenceContent: gateContent,
        boundRevisionId: "1.0.0",
      }),
    }),
  ];
  return { nodes, findings };
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
  const chain = chainWithVerdict(requirementId, depth, verdict);
  return Object.freeze({
    requirementId,
    requestedDepth: depth,
    nodes: chain.nodes,
    findings: chain.findings,
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

/**
 * The escalation wave (d087 scenario shape, verified at
 * tests/loop-d087-six-scenario-matrix.test.ts:398-399): the first-round
 * verdict is PASS + ESCALATED at the requested depth (the gate passes but
 * mandates deeper analysis; required_depth rises in the SAME publish on the
 * manual face — G3-R1-H4 — and via foldDepth on the runtime face), the design
 * is rebuilt at the escalated depth, and the re-adjudication is
 * PASS + CONFIRMED at the escalated depth. The reflow carries the same
 * finding pattern as the FAIL wave: a FAIL/ESCALATED verdict reflowing to
 * solution-design owes the chain the §5.4 reflow fact (store synthesizes it —
 * loop-run-store.ts registerReflowFinding; category SOLUTION ⇒ earliest
 * solution-design), which authorizes the design-v2 restart. Registered after
 * the first gate round, resolved by the re-adjudicating round.
 */
function waveWithUpgrade(
  requirementId: string,
  requestedDepth: "LIGHT" | "STANDARD" | "DEEP",
  escalatedDepth: "STANDARD" | "DEEP",
  finalVerdict: "PASS" | "PASS_WITH_RISK",
): { nodes: NodeFact[]; findings: FindingFact[] } {
  const nodes: NodeFact[] = [
    nodeFact("requirement-intake", "requirement_summary", `# ${requirementId} intake\n`, "1.0.0"),
    nodeFact("solution-design", "technical_design", `# ${requirementId} design\n`, "1.0.0"),
    // ESCALATED carries the NEW required depth (publisher: required_depth =
    // DDEPTH in the same publish; projector: foldDepth returns it) — the depth
    // the rework round must run at, not the requested one.
    nodeFact("solution-gate", "solution_review", `# ${requirementId} gate\n`, "1.0.0", {
      attempt: 1,
      gateResult: "PASS",
      decisionStatus: "ESCALATED",
      decisionDepth: escalatedDepth,
    }),
    nodeFact("solution-design", "technical_design", `# ${requirementId} design v2 (${escalatedDepth})\n`, "2.0.0", { attempt: 2 }),
    nodeFact("solution-gate", "solution_review", `# ${requirementId} gate v2\n`, "2.0.0", {
      attempt: 2,
      gateResult: finalVerdict,
      decisionStatus: "CONFIRMED",
      decisionDepth: escalatedDepth,
    }),
    nodeFact("task-planning", "task_plan", `# ${requirementId} plan\n`, "1.0.0"),
    nodeFact("implementation", "implementation_record", `# ${requirementId} impl\n`, "1.0.0"),
    nodeFact("code-review", "review_summary", `# ${requirementId} review\n`, "1.0.0"),
    nodeFact("knowledge-sync", "knowledge_sync_result", `# ${requirementId} knowledge\n`, "1.0.0"),
  ];
  const findings: FindingFact[] = [
    Object.freeze({
      findingId: `${requirementId}-F01`,
      discoveredAt: "solution-gate",
      category: "SOLUTION",
      earliest: "solution-design",
      sourceRevisionId: `${runtimeRunId(requirementId)}:revision:solution-design:1`,
      evidenceKind: "technical_design",
      evidenceContent: `# ${requirementId} design\n`,
      registerAfter: "solution-gate",
      resolveAfter: "solution-gate",
      action: Object.freeze({
        action: "resolve" as const,
        closedBy: "solution-gate",
        evidenceKind: "solution_review",
        evidenceContent: `# ${requirementId} gate v2\n`,
        boundRevisionId: `${runtimeRunId(requirementId)}:revision:solution-gate:1`,
      }),
    }),
  ];
  return { nodes, findings };
}

const ESCALATION_LADDER: Readonly<Record<string, "STANDARD" | "DEEP">> = Object.freeze({
  LIGHT: "STANDARD",
  STANDARD: "DEEP",
});

/** S-CORE upgrade-round scenarios: depth × final verdict (6). */
export function coreUpgradeScenarios(): ScenarioSpec[] {
  const specs: ScenarioSpec[] = [];
  for (const depth of ["LIGHT", "STANDARD"] as const) {
    for (const finalVerdict of ["PASS", "PASS_WITH_RISK"] as const) {
      const id = `S-CORE-${depth}-${finalVerdict}-upgrade`;
      specs.push(
        Object.freeze({
          id,
          family: "S-CORE" as const,
          coords: coords({ depth, verdict: finalVerdict, round: "upgrade" }),
          prunes: "DEEP has no escalation target (hard ceiling); ESCALATED first verdict + deeper rework + CONFIRMED final (d087 shape)",
          build: () => {
            const wave = waveWithUpgrade(`20260920-${id}`, depth, ESCALATION_LADDER[depth], finalVerdict);
            return Object.freeze({
              requirementId: `20260920-${id}`,
              requestedDepth: depth,
              nodes: wave.nodes,
              findings: wave.findings,
            });
          },
        }),
      );
    }
  }
  return specs;
}
