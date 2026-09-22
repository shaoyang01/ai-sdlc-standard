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
      // Closes at the confirming re-gate round (gate stage round 2), binding
      // that round's design revision (the revision that fixed it).
      closedAtRound: 2,
      action: Object.freeze({
        action: "resolve" as const,
        closedBy: "solution-gate",
        evidenceKind: "solution_review",
        evidenceContent: `# ${requirementId} gate v2\n`,
        boundRevisionId: `${runtimeRunId(requirementId)}:revision:solution-design:2`,
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

/**
 * The multi-round rework wave (settled model — Current User's real manual
 * review flow): findings are a PERSISTENT SET with statuses, not wave-owned.
 * Each round is a full re-review: it closes what its re-examination confirms,
 * leaves unfixed findings OPEN (the protocol has no partial state — "partially
 * closed" simply stays open), and registers newly discovered findings. The
 * backward restart each round needs is authorized by the OPEN set (every
 * round lands new findings on the journal). A finding closes at ITS
 * confirming round, binding the revision that fixed it (that round's design
 * revision — the store enforces existence, currency and earliest-node
 * ordering; verdict outcome does not participate) with that round's verdict
 * blob as evidence. The wave ends at a full PASS with an empty OPEN set.
 *
 * Canonical shape (FAIL→FAIL→FAIL→PASS, ONE discovery per round):
 *   R1 scan registers Fa (examines design v1) → FAIL            | design v2
 *   R2 scan closes Fa (binds design v2), registers Fb → FAIL    | design v3
 *   R3 scan closes Fb (binds design v3), registers Fc → FAIL    | design v4
 *   R4 scan closes Fc (binds design v4) → PASS                  | downstream
 *
 * ONE finding per round is FORCED by two independent engine constraints:
 * (1) the takeover pairing matches findings by evidence, so same-round
 * findings sharing one scan-ledger blob are indistinguishable — the pairing
 * refuses on ambiguity (and the manual face cannot cite a shared blob N
 * times unambiguously; cf. the real ledger#F0n per-finding refs);
 * (2) the projection provenance requires unique closure revision refs, so
 * two findings closing on the same round's revision are a duplicate-closures
 * MANIFEST_CORRUPT_STOP. The persistent-SET model itself is untouched.
 */
function waveWithMultiRound(
  requirementId: string,
  depth: "LIGHT" | "STANDARD" | "DEEP",
): { nodes: NodeFact[]; findings: FindingFact[] } {
  const runId = runtimeRunId(requirementId);
  const ledgerFor = (key: string): string =>
    `${JSON.stringify({
      schema: "loop-capability-findings:v1",
      findings: [{ finding_id: `${requirementId}-${key}` }],
    })}\n`;
  const design = (v: number): NodeFact =>
    nodeFact("solution-design", "technical_design", `# ${requirementId} design v${v}\n`, `${v}.0.0`, { attempt: v });
  const failGate = (v: number, ledger: string): NodeFact =>
    nodeFact("solution-gate", "solution_review", `# ${requirementId} gate v${v}\n`, `${v}.0.0`, {
      attempt: v,
      gateResult: "FAIL",
      decisionStatus: "CONFIRMED",
      decisionDepth: depth,
      ledgerContent: ledger,
      // The round's new finding invalidates the examined design current.
      staleNodes: ["solution-design"],
    });
  const passGate = (v: number): NodeFact =>
    nodeFact("solution-gate", "solution_review", `# ${requirementId} gate v${v}\n`, `${v}.0.0`, {
      attempt: v,
      gateResult: "PASS",
      decisionStatus: "CONFIRMED",
      decisionDepth: depth,
    });
  const finding = (
    key: string,
    registeredRound: number,
    examinedDesign: number,
    closedAtRound: number,
  ): FindingFact =>
    Object.freeze({
      findingId: `${requirementId}-${key}`,
      discoveredAt: "solution-gate",
      category: "SOLUTION",
      earliest: "solution-design",
      sourceRevisionId: `${runId}:revision:solution-design:${examinedDesign}`,
      // The finding's evidence IS its round's scan ledger blob (the manual
      // face cites the same ref, so the takeover pairing is 1:1 per round).
      evidenceKind: "capability_findings",
      evidenceContent: ledgerFor(key),
      gateRound: registeredRound,
      closedAtRound,
      registerAfter: "solution-gate",
      resolveAfter: "solution-gate",
      action: Object.freeze({
        action: "resolve" as const,
        closedBy: "solution-gate",
        // The confirming round's verdict blob is the closure evidence; the
        // revision that fixed it (that round's design) is the binding.
        evidenceKind: "solution_review",
        evidenceContent: `# ${requirementId} gate v${closedAtRound}\n`,
        boundRevisionId: `${runId}:revision:solution-design:${closedAtRound}`,
      }),
    });
  const nodes: NodeFact[] = [
    nodeFact("requirement-intake", "requirement_summary", `# ${requirementId} intake\n`, "1.0.0"),
    design(1),
    failGate(1, ledgerFor("Fa")),
    design(2),
    failGate(2, ledgerFor("Fb")),
    design(3),
    failGate(3, ledgerFor("Fc")),
    design(4),
    passGate(4),
    nodeFact("task-planning", "task_plan", `# ${requirementId} plan\n`, "1.0.0"),
    nodeFact("implementation", "implementation_record", `# ${requirementId} impl\n`, "1.0.0"),
    nodeFact("code-review", "review_summary", `# ${requirementId} review\n`, "1.0.0"),
    nodeFact("knowledge-sync", "knowledge_sync_result", `# ${requirementId} knowledge\n`, "1.0.0"),
  ];
  const findings: FindingFact[] = [finding("Fa", 1, 1, 2), finding("Fb", 2, 2, 3), finding("Fc", 3, 3, 4)];
  return { nodes, findings };
}

/** S-CORE multi-round Re-Gate scenarios: the settled persistent-set model × depth (3). */
export function coreMultiRoundScenarios(): ScenarioSpec[] {
  const specs: ScenarioSpec[] = [];
  for (const depth of ["LIGHT", "STANDARD", "DEEP"] as const) {
    const id = `S-CORE-${depth}-FAIL-multiround`;
    specs.push(
      Object.freeze({
        id,
        family: "S-CORE" as const,
        coords: coords({ depth, verdict: "FAIL", round: "re-gate" }),
        prunes: "persistent-set model, one finding per round: Fa closes R2 (design v2), Fb R3 (design v3), Fc R4 (design v4); PASS with empty OPEN set",
        build: () => {
          const wave = waveWithMultiRound(`20260920-${id}`, depth);
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
  return specs;
}

/**
 * B — the review-local rework wave (wms-monitor production sample: 22 of 25
 * code-review findings in lifecycle-actions + all 4 in config-page-usability).
 * An IMPLEMENTATION-class finding discovered at the code-review round: its
 * invalidation stales the examined implementation (authorizing the restart),
 * the reworked implementation lands v2, and the re-review closes it binding
 * that revision with the RE-REVIEW artifact as evidence (the real closure
 * evidence for implementation-class findings). The gate itself passed on the
 * first round — this wave never re-gates (re-gate is the gate's own
 * mechanism, unrelated to the review stage).
 */
function waveWithReviewRework(
  requirementId: string,
  depth: "LIGHT" | "STANDARD" | "DEEP",
): { nodes: NodeFact[]; findings: FindingFact[] } {
  const runId = runtimeRunId(requirementId);
  const reviewV1 = `# ${requirementId} review v1\n`;
  const reviewV2 = `# ${requirementId} review v2\n`;
  const nodes: NodeFact[] = [
    nodeFact("requirement-intake", "requirement_summary", `# ${requirementId} intake\n`, "1.0.0"),
    nodeFact("solution-design", "technical_design", `# ${requirementId} design\n`, "1.0.0"),
    nodeFact("solution-gate", "solution_review", `# ${requirementId} gate\n`, "1.0.0", {
      gateResult: "PASS",
      decisionStatus: "CONFIRMED",
      decisionDepth: depth,
    }),
    nodeFact("task-planning", "task_plan", `# ${requirementId} plan\n`, "1.0.0"),
    nodeFact("implementation", "implementation_record", `# ${requirementId} impl v1\n`, "1.0.0"),
    nodeFact("code-review", "review_summary", reviewV1, "1.0.0", { staleNodes: ["implementation"] }),
    nodeFact("implementation", "implementation_record", `# ${requirementId} impl v2\n`, "2.0.0", { attempt: 2 }),
    nodeFact("code-review", "review_summary", reviewV2, "2.0.0", { attempt: 2 }),
    nodeFact("knowledge-sync", "knowledge_sync_result", `# ${requirementId} knowledge\n`, "1.0.0"),
  ];
  const findings: FindingFact[] = [
    Object.freeze({
      findingId: `${requirementId}-CR-F01`,
      discoveredAt: "code-review",
      category: "IMPLEMENTATION",
      earliest: "implementation",
      sourceRevisionId: `${runId}:revision:implementation:1`,
      evidenceKind: "review_summary",
      evidenceContent: reviewV1,
      registerAfter: "code-review",
      resolveAfter: "code-review",
      // Review stage round 2 — the re-review that confirms the fix.
      closedAtRound: 2,
      action: Object.freeze({
        action: "resolve" as const,
        closedBy: "code-review",
        // The re-review artifact is the closure evidence; the reworked
        // implementation is the binding.
        evidenceKind: "review_summary",
        evidenceContent: reviewV2,
        boundRevisionId: `${runId}:revision:implementation:2`,
      }),
    }),
  ];
  return { nodes, findings };
}

/**
 * C — the review-discovered design-level finding reflowing to re-gate
 * (wms-monitor lifecycle-actions CR-F12: discovered at code-review,
 * earliest=solution-design, closed_by=code-review, closure evidence = the
 * DESIGN artifact, bound = the design revision; CR-F08/F25 stayed OPEN). The
 * finding's fix needs a design change, so the flow reflows to solution-design,
 * the gate re-adjudicates (its own multi-round mechanism — re-gate is re-gate,
 * not part of the review stage), and the confirming gate round closes the
 * finding binding that round's design revision. The downstream chain then
 * re-runs (canonical order) and the second review passes clean.
 */
function waveWithReviewRegate(
  requirementId: string,
  depth: "LIGHT" | "STANDARD" | "DEEP",
): { nodes: NodeFact[]; findings: FindingFact[] } {
  const runId = runtimeRunId(requirementId);
  const reviewV1 = `# ${requirementId} review v1\n`;
  const designV2 = `# ${requirementId} design v2\n`;
  const gateV2 = `# ${requirementId} gate v2\n`;
  const nodes: NodeFact[] = [
    nodeFact("requirement-intake", "requirement_summary", `# ${requirementId} intake\n`, "1.0.0"),
    nodeFact("solution-design", "technical_design", `# ${requirementId} design v1\n`, "1.0.0"),
    nodeFact("solution-gate", "solution_review", `# ${requirementId} gate v1\n`, "1.0.0", {
      gateResult: "PASS",
      decisionStatus: "CONFIRMED",
      decisionDepth: depth,
    }),
    nodeFact("task-planning", "task_plan", `# ${requirementId} plan v1\n`, "1.0.0"),
    nodeFact("implementation", "implementation_record", `# ${requirementId} impl v1\n`, "1.0.0"),
    nodeFact("code-review", "review_summary", reviewV1, "1.0.0", {
      // The design-class finding's invalidation stales the whole downstream
      // scope (design, gate, planning, implementation, review).
      staleNodes: ["solution-design", "solution-gate", "task-planning", "implementation"],
    }),
    // Reflow to solution-design (the finding authorizes the restart); the
    // re-gate round closes it binding this design revision.
    nodeFact("solution-design", "technical_design", designV2, "2.0.0", { attempt: 2 }),
    nodeFact("solution-gate", "solution_review", gateV2, "2.0.0", {
      attempt: 2,
      gateResult: "PASS",
      decisionStatus: "CONFIRMED",
      decisionDepth: depth,
    }),
    nodeFact("task-planning", "task_plan", `# ${requirementId} plan v2\n`, "2.0.0", { attempt: 2 }),
    nodeFact("implementation", "implementation_record", `# ${requirementId} impl v2\n`, "2.0.0", { attempt: 2 }),
    nodeFact("code-review", "review_summary", `# ${requirementId} review v2\n`, "2.0.0", { attempt: 2 }),
    nodeFact("knowledge-sync", "knowledge_sync_result", `# ${requirementId} knowledge\n`, "1.0.0"),
  ];
  const findings: FindingFact[] = [
    Object.freeze({
      findingId: `${requirementId}-CR-F01`,
      discoveredAt: "code-review",
      // Design-class: its fix needs a design change, hence the re-gate reflow.
      category: "SOLUTION",
      earliest: "solution-design",
      sourceRevisionId: `${runId}:revision:solution-design:1`,
      evidenceKind: "review_summary",
      evidenceContent: reviewV1,
      registerAfter: "code-review",
      resolveAfter: "code-review",
      // Review stage round 2 — the re-review after the re-gate reflow; the
      // review stage's round counter is independent of the gate's.
      closedAtRound: 2,
      action: Object.freeze({
        action: "resolve" as const,
        closedBy: "code-review",
        // The design artifact is the closure evidence (production shape:
        // CR-F12); the re-gate round's design revision is the binding.
        evidenceKind: "technical_design",
        evidenceContent: designV2,
        boundRevisionId: `${runId}:revision:solution-design:2`,
      }),
    }),
  ];
  return { nodes, findings };
}

/** B — review-local rework scenarios × depth (3): gate PASS + one implementation-class review finding. */
export function coreReviewReworkScenarios(): ScenarioSpec[] {
  const specs: ScenarioSpec[] = [];
  for (const depth of ["LIGHT", "STANDARD", "DEEP"] as const) {
    const id = `S-CORE-${depth}-PASS-reviewwave`;
    specs.push(
      Object.freeze({
        id,
        family: "S-CORE" as const,
        coords: coords({ depth, verdict: "PASS", round: "first" }),
        prunes: "review-local rework (no re-gate): one IMPLEMENTATION finding at the code-review round → implementation v2 → re-review closes it binding implementation v2; production sample wms-monitor 20260916-config-page-usability F08-F11 / 20260915-exception-lifecycle-actions 22 CR findings",
        build: () => {
          const wave = waveWithReviewRework(`20260920-${id}`, depth);
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
  return specs;
}

/** C — review-discovered design-level finding reflowing to re-gate × depth (3). */
export function coreReviewRegateScenarios(): ScenarioSpec[] {
  const specs: ScenarioSpec[] = [];
  for (const depth of ["LIGHT", "STANDARD", "DEEP"] as const) {
    const id = `S-CORE-${depth}-PASS-review-regate`;
    specs.push(
      Object.freeze({
        id,
        family: "S-CORE" as const,
        coords: coords({ depth, verdict: "PASS", round: "re-gate" }),
        prunes: "review-discovered design-class finding → reflow solution-design → re-gate (the gate's own mechanism) closes it binding design v2 with the design artifact as evidence (production sample lifecycle-actions CR-F12); downstream re-runs then passes",
        build: () => {
          const wave = waveWithReviewRegate(`20260920-${id}`, depth);
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
  return specs;
}

/**
 * D — a gate-discovered REQUIREMENT-level finding reflowing to requirement
 * normalization (production sample: wms-monitor 20260916-config-page-usability
 * F07 — discovered at the solution-gate, earliest=requirement-intake, closed
 * by the gate binding requirement-summary@1.5.0). The requirement-class
 * invalidation stales the whole examined scope, so the reflow lands on
 * requirement-intake and the ENTIRE chain re-runs from intake; the confirming
 * re-gate round (gate stage round 2) closes the finding binding that round's
 * intake revision.
 */
function waveWithGateRequirementReflow(
  requirementId: string,
  depth: "LIGHT" | "STANDARD" | "DEEP",
): { nodes: NodeFact[]; findings: FindingFact[] } {
  const runId = runtimeRunId(requirementId);
  const ledgerV1 = `${JSON.stringify({
    schema: "loop-capability-findings:v1",
    findings: [{ finding_id: `${requirementId}-G01` }],
  })}\n`;
  const intakeV2 = `# ${requirementId} intake v2\n`;
  const nodes: NodeFact[] = [
    nodeFact("requirement-intake", "requirement_summary", `# ${requirementId} intake v1\n`, "1.0.0"),
    nodeFact("solution-design", "technical_design", `# ${requirementId} design v1\n`, "1.0.0"),
    nodeFact("solution-gate", "solution_review", `# ${requirementId} gate v1\n`, "1.0.0", {
      gateResult: "FAIL",
      decisionStatus: "CONFIRMED",
      decisionDepth: depth,
      ledgerContent: ledgerV1,
      // The requirement-class invalidation stales the whole examined scope.
      staleNodes: ["requirement-intake", "solution-design"],
    }),
    // Reflow to requirement normalization; the whole chain re-runs.
    nodeFact("requirement-intake", "requirement_summary", intakeV2, "2.0.0", { attempt: 2 }),
    nodeFact("solution-design", "technical_design", `# ${requirementId} design v2\n`, "2.0.0", { attempt: 2 }),
    nodeFact("solution-gate", "solution_review", `# ${requirementId} gate v2\n`, "2.0.0", {
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
  const findings: FindingFact[] = [
    Object.freeze({
      findingId: `${requirementId}-G01`,
      discoveredAt: "solution-gate",
      category: "REQUIREMENT",
      earliest: "requirement-intake",
      // Anchored to the examined requirement revision (the production shape:
      // source_revision = requirement-summary@…).
      sourceRevisionId: `${runId}:revision:requirement-intake:1`,
      evidenceKind: "capability_findings",
      evidenceContent: ledgerV1,
      registerAfter: "solution-gate",
      resolveAfter: "solution-gate",
      // Gate stage round 2 — the re-gate that confirms the requirement fix.
      closedAtRound: 2,
      action: Object.freeze({
        action: "resolve" as const,
        closedBy: "solution-gate",
        evidenceKind: "solution_review",
        evidenceContent: `# ${requirementId} gate v2\n`,
        // A requirement-class finding binds the INTAKE revision that fixed
        // it (production: closure_bound_revision_id = requirement-summary@…).
        boundRevisionId: `${runId}:revision:requirement-intake:2`,
      }),
    }),
  ];
  return { nodes, findings };
}

/**
 * E — a review-discovered REQUIREMENT-level finding (a requirement addition
 * found during the process) reflowing to requirement normalization: the whole
 * chain re-runs from intake and the re-gate re-adjudicates the rebuilt
 * design. Closes at the re-review (review stage round 2) binding the new
 * intake revision. The Current User's flow ruling: only a design/requirement-
 * level problem reflows to normalization/design — that is when re-gate fires.
 */
function waveWithReviewRequirementReflow(
  requirementId: string,
  depth: "LIGHT" | "STANDARD" | "DEEP",
): { nodes: NodeFact[]; findings: FindingFact[] } {
  const runId = runtimeRunId(requirementId);
  const reviewV1 = `# ${requirementId} review v1\n`;
  const intakeV2 = `# ${requirementId} intake v2\n`;
  const nodes: NodeFact[] = [
    nodeFact("requirement-intake", "requirement_summary", `# ${requirementId} intake v1\n`, "1.0.0"),
    nodeFact("solution-design", "technical_design", `# ${requirementId} design v1\n`, "1.0.0"),
    nodeFact("solution-gate", "solution_review", `# ${requirementId} gate v1\n`, "1.0.0", {
      gateResult: "PASS",
      decisionStatus: "CONFIRMED",
      decisionDepth: depth,
    }),
    nodeFact("task-planning", "task_plan", `# ${requirementId} plan v1\n`, "1.0.0"),
    nodeFact("implementation", "implementation_record", `# ${requirementId} impl v1\n`, "1.0.0"),
    nodeFact("code-review", "review_summary", reviewV1, "1.0.0", {
      staleNodes: ["requirement-intake", "solution-design", "solution-gate", "task-planning", "implementation"],
    }),
    // Reflow to requirement normalization; the whole chain re-runs and the
    // re-gate re-adjudicates.
    nodeFact("requirement-intake", "requirement_summary", intakeV2, "2.0.0", { attempt: 2 }),
    nodeFact("solution-design", "technical_design", `# ${requirementId} design v2\n`, "2.0.0", { attempt: 2 }),
    nodeFact("solution-gate", "solution_review", `# ${requirementId} gate v2\n`, "2.0.0", {
      attempt: 2,
      gateResult: "PASS",
      decisionStatus: "CONFIRMED",
      decisionDepth: depth,
    }),
    nodeFact("task-planning", "task_plan", `# ${requirementId} plan v2\n`, "2.0.0", { attempt: 2 }),
    nodeFact("implementation", "implementation_record", `# ${requirementId} impl v2\n`, "2.0.0", { attempt: 2 }),
    nodeFact("code-review", "review_summary", `# ${requirementId} review v2\n`, "2.0.0", { attempt: 2 }),
    nodeFact("knowledge-sync", "knowledge_sync_result", `# ${requirementId} knowledge\n`, "1.0.0"),
  ];
  const findings: FindingFact[] = [
    Object.freeze({
      findingId: `${requirementId}-CR-F01`,
      discoveredAt: "code-review",
      category: "REQUIREMENT",
      earliest: "requirement-intake",
      sourceRevisionId: `${runId}:revision:requirement-intake:1`,
      evidenceKind: "review_summary",
      evidenceContent: reviewV1,
      registerAfter: "code-review",
      resolveAfter: "code-review",
      // Review stage round 2 — the re-review after the full re-run.
      closedAtRound: 2,
      action: Object.freeze({
        action: "resolve" as const,
        closedBy: "code-review",
        // The updated requirement summary is the closure evidence and the
        // binding is the new intake revision.
        evidenceKind: "requirement_summary",
        evidenceContent: intakeV2,
        boundRevisionId: `${runId}:revision:requirement-intake:2`,
      }),
    }),
  ];
  return { nodes, findings };
}

/** D — gate-discovered requirement-level reflow (DEEP, production sample config-page-usability F07). */
export function coreGateRequirementReflowScenarios(): ScenarioSpec[] {
  const id = "S-CORE-DEEP-FAIL-requirement-reflow";
  return [
    Object.freeze({
      id,
      family: "S-CORE" as const,
      coords: coords({ depth: "DEEP", verdict: "FAIL", round: "re-gate" }),
      prunes: "requirement-level reflow: REQUIREMENT finding at the gate anchors the examined intake revision, stales the whole scope, reflows to requirement-intake; the whole chain re-runs and the confirming re-gate (gate stage round 2) closes it binding the new intake revision; production sample wms-monitor 20260916-config-page-usability F07",
      build: () => {
        const wave = waveWithGateRequirementReflow(`20260920-${id}`, "DEEP");
        return Object.freeze({
          requirementId: `20260920-${id}`,
          requestedDepth: "DEEP" as const,
          nodes: wave.nodes,
          findings: wave.findings,
        });
      },
    }),
  ];
}

/** E — review-discovered requirement-level reflow (DEEP; the requirement-addition path). */
export function coreReviewRequirementReflowScenarios(): ScenarioSpec[] {
  const id = "S-CORE-DEEP-PASS-requirement-reflow";
  return [
    Object.freeze({
      id,
      family: "S-CORE" as const,
      coords: coords({ depth: "DEEP", verdict: "PASS", round: "re-gate" }),
      prunes: "requirement-addition reflow: a requirement-level finding at the review stage reflows to requirement-intake, the whole chain re-runs (re-gate included), the re-review (review stage round 2) closes it binding the new intake revision",
      build: () => {
        const wave = waveWithReviewRequirementReflow(`20260920-${id}`, "DEEP");
        return Object.freeze({
          requirementId: `20260920-${id}`,
          requestedDepth: "DEEP" as const,
          nodes: wave.nodes,
          findings: wave.findings,
        });
      },
    }),
  ];
}

/**
 * F — the feedback-driven re-gate (the non-finding re-gate path): a
 * FEEDBACK_DRIVEN_CHANGE record (WP-1) closes the current generation and
 * opens the next; the feedback wave restarts at the first lagging node —
 * a FULL rebuild from requirement-intake that subsumes any finding-driven
 * scope — and the re-run re-adjudicates at the gate (the re-gate) without
 * any finding ever being registered. Two firing points: after a plain node
 * (the first pass completed) and after the gate verdict (mid-flight).
 */
function waveWithFeedbackRegate(
  requirementId: string,
  depth: "LIGHT" | "STANDARD" | "DEEP",
  fireAfter: "review" | "gate",
): { nodes: NodeFact[]; findings: FindingFact[] } {
  const v1 = (node: string, kind: string, label: string): NodeFact =>
    nodeFact(node, kind, `# ${requirementId} ${label} v1\n`, "1.0.0");
  const v2 = (node: string, kind: string, label: string): NodeFact =>
    nodeFact(node, kind, `# ${requirementId} ${label} v2\n`, "2.0.0", { attempt: 2 });
  const gateV1 = nodeFact("solution-gate", "solution_review", `# ${requirementId} gate v1\n`, "1.0.0", {
    gateResult: "PASS",
    decisionStatus: "CONFIRMED",
    decisionDepth: depth,
  });
  const gateV2 = nodeFact("solution-gate", "solution_review", `# ${requirementId} gate v2\n`, "2.0.0", {
    attempt: 2,
    gateResult: "PASS",
    decisionStatus: "CONFIRMED",
    decisionDepth: depth,
  });
  const firstPass: NodeFact[] =
    fireAfter === "gate"
      ? [
          v1("requirement-intake", "requirement_summary", "intake"),
          v1("solution-design", "technical_design", "design"),
          Object.freeze({ ...gateV1, opensFeedbackChange: true }),
        ]
      : [
          v1("requirement-intake", "requirement_summary", "intake"),
          v1("solution-design", "technical_design", "design"),
          gateV1,
          v1("task-planning", "task_plan", "plan"),
          v1("implementation", "implementation_record", "impl"),
          Object.freeze({ ...v1("code-review", "review_summary", "review"), opensFeedbackChange: true }),
        ];
  // The feedback wave: the whole chain re-runs from requirement-intake in the
  // new generation; the re-run re-adjudicates at the gate (the re-gate).
  const rerun: NodeFact[] = [
    v2("requirement-intake", "requirement_summary", "intake"),
    v2("solution-design", "technical_design", "design"),
    gateV2,
  ];
  if (fireAfter === "review") {
    rerun.push(v2("task-planning", "task_plan", "plan"), v2("implementation", "implementation_record", "impl"), v2("code-review", "review_summary", "review"));
  } else {
    rerun.push(v1("task-planning", "task_plan", "plan"), v1("implementation", "implementation_record", "impl"), v1("code-review", "review_summary", "review"));
  }
  rerun.push(nodeFact("knowledge-sync", "knowledge_sync_result", `# ${requirementId} knowledge\n`, "1.0.0"));
  return { nodes: [...firstPass, ...rerun], findings: [] };
}

/** F — feedback-driven re-gate scenarios (2): fired after the review vs after the gate verdict. */
export function coreFeedbackRegateScenarios(): ScenarioSpec[] {
  const specs: ScenarioSpec[] = [];
  const cases: readonly { depth: "LIGHT" | "STANDARD" | "DEEP"; fireAfter: "review" | "gate"; suffix: string }[] = [
    { depth: "DEEP", fireAfter: "review", suffix: "post-review" },
    { depth: "DEEP", fireAfter: "gate", suffix: "post-gate" },
  ];
  for (const testCase of cases) {
    const id = `S-CORE-${testCase.depth}-PASS-feedback-regate-${testCase.suffix}`;
    specs.push(
      Object.freeze({
        id,
        family: "S-CORE" as const,
        coords: coords({ depth: testCase.depth, verdict: "PASS", round: "re-gate" }),
        prunes: `feedback-driven re-gate (no finding): a FEEDBACK_DRIVEN_CHANGE record fired ${testCase.fireAfter === "review" ? "after the completed first pass" : "after the gate verdict (mid-flight)"} opens generation 2; the feedback wave is a full rebuild from requirement-intake (subsumes any finding-driven scope) and the re-run re-adjudicates at the gate`,
        build: () => {
          const wave = waveWithFeedbackRegate(`20260920-${id}`, testCase.depth, testCase.fireAfter);
          return Object.freeze({
            requirementId: `20260920-${id}`,
            requestedDepth: testCase.depth,
            nodes: wave.nodes,
            findings: wave.findings,
          });
        },
      }),
    );
  }
  return specs;
}

/**
 * G — escalation with a FAIL round (spec coordinate 升档 × FAIL): the
 * escalation verdict (ESCALATED) drives the deeper rework; the re-gate at the
 * deeper level FAILs once (one finding), and the following round passes. Gate
 * stage rounds: R1 ESCALATED (registers Fa), R2 closes Fa (design v2) and
 * registers Fb but FAILs, R3 closes Fb (design v3) and PASSes.
 */
function waveWithEscalationFail(
  requirementId: string,
  depth: "LIGHT" | "STANDARD",
  escalatedDepth: "STANDARD" | "DEEP",
): { nodes: NodeFact[]; findings: FindingFact[] } {
  const runId = runtimeRunId(requirementId);
  const design = (v: number): NodeFact =>
    nodeFact("solution-design", "technical_design", `# ${requirementId} design v${v}\n`, `${v}.0.0`, v === 1 ? {} : { attempt: v });
  const ledgerFor = (key: string): string =>
    `${JSON.stringify({ schema: "loop-capability-findings:v1", findings: [{ finding_id: `${requirementId}-${key}` }] })}\n`;
  const finding = (key: string, registeredRound: number, examinedDesign: number, closedAtRound: number): FindingFact =>
    Object.freeze({
      findingId: `${requirementId}-${key}`,
      discoveredAt: "solution-gate",
      category: "SOLUTION",
      earliest: "solution-design",
      sourceRevisionId: `${runId}:revision:solution-design:${examinedDesign}`,
      evidenceKind: "capability_findings",
      evidenceContent: ledgerFor(key),
      gateRound: registeredRound,
      closedAtRound,
      registerAfter: "solution-gate",
      resolveAfter: "solution-gate",
      action: Object.freeze({
        action: "resolve" as const,
        closedBy: "solution-gate",
        evidenceKind: "solution_review",
        evidenceContent: `# ${requirementId} gate v${closedAtRound}\n`,
        boundRevisionId: `${runId}:revision:solution-design:${closedAtRound}`,
      }),
    });
  const nodes: NodeFact[] = [
    nodeFact("requirement-intake", "requirement_summary", `# ${requirementId} intake\n`, "1.0.0"),
    design(1),
    nodeFact("solution-gate", "solution_review", `# ${requirementId} gate v1\n`, "1.0.0", {
      gateResult: "PASS",
      decisionStatus: "ESCALATED",
      decisionDepth: escalatedDepth,
      ledgerContent: ledgerFor("Fa"),
      staleNodes: ["solution-design"],
    }),
    design(2),
    nodeFact("solution-gate", "solution_review", `# ${requirementId} gate v2\n`, "2.0.0", {
      attempt: 2,
      gateResult: "FAIL",
      decisionStatus: "CONFIRMED",
      decisionDepth: escalatedDepth,
      ledgerContent: ledgerFor("Fb"),
      staleNodes: ["solution-design"],
    }),
    design(3),
    nodeFact("solution-gate", "solution_review", `# ${requirementId} gate v3\n`, "3.0.0", {
      attempt: 3,
      gateResult: "PASS",
      decisionStatus: "CONFIRMED",
      decisionDepth: escalatedDepth,
    }),
    nodeFact("task-planning", "task_plan", `# ${requirementId} plan\n`, "1.0.0"),
    nodeFact("implementation", "implementation_record", `# ${requirementId} impl\n`, "1.0.0"),
    nodeFact("code-review", "review_summary", `# ${requirementId} review\n`, "1.0.0"),
    nodeFact("knowledge-sync", "knowledge_sync_result", `# ${requirementId} knowledge\n`, "1.0.0"),
  ];
  const findings: FindingFact[] = [finding("Fa", 1, 1, 2), finding("Fb", 2, 2, 3)];
  return { nodes, findings };
}

/** G — escalation-with-FAIL scenarios (2): LIGHT→STANDARD and STANDARD→DEEP. */
export function coreEscalationFailScenarios(): ScenarioSpec[] {
  const specs: ScenarioSpec[] = [];
  const cases: readonly { depth: "LIGHT" | "STANDARD"; escalated: "STANDARD" | "DEEP" }[] = [
    { depth: "LIGHT", escalated: "STANDARD" },
    { depth: "STANDARD", escalated: "DEEP" },
  ];
  for (const testCase of cases) {
    const id = `S-CORE-${testCase.depth}-FAIL-upgrade`;
    specs.push(
      Object.freeze({
        id,
        family: "S-CORE" as const,
        coords: coords({ depth: testCase.depth, verdict: "FAIL", round: "upgrade" }),
        prunes: `escalation × FAIL: R1 ESCALATED (${testCase.depth}→${testCase.escalated}) registers Fa; R2 closes Fa (design v2), registers Fb and FAILs; R3 closes Fb (design v3) and PASSes; gate stage rounds counted independently of the review stage`,
        build: () => {
          const wave = waveWithEscalationFail(`20260920-${id}`, testCase.depth, testCase.escalated);
          return Object.freeze({
            requirementId: `20260920-${id}`,
            requestedDepth: testCase.depth,
            nodes: wave.nodes,
            findings: wave.findings,
          });
        },
      }),
    );
  }
  return specs;
}

/**
 * S-MANIFEST-1 — reconcile (V9 semantics): the runtime takes over at an
 * INTERMEDIATE manifest (the finding still OPEN), then the journal tail (the
 * reworked implementation + the re-review) and the finding's closure land in
 * ONE catch-up publish. Both faces snapshot at the same node.
 */
function waveWithReconcile(
  requirementId: string,
  depth: "LIGHT" | "STANDARD" | "DEEP",
): { nodes: NodeFact[]; findings: FindingFact[] } {
  const runId = runtimeRunId(requirementId);
  const reviewV1 = `# ${requirementId} review v1\n`;
  const reviewV2 = `# ${requirementId} review v2\n`;
  const nodes: NodeFact[] = [
    nodeFact("requirement-intake", "requirement_summary", `# ${requirementId} intake\n`, "1.0.0"),
    nodeFact("solution-design", "technical_design", `# ${requirementId} design\n`, "1.0.0"),
    nodeFact("solution-gate", "solution_review", `# ${requirementId} gate\n`, "1.0.0", {
      gateResult: "PASS",
      decisionStatus: "CONFIRMED",
      decisionDepth: depth,
    }),
    nodeFact("task-planning", "task_plan", `# ${requirementId} plan\n`, "1.0.0"),
    nodeFact("implementation", "implementation_record", `# ${requirementId} impl v1\n`, "1.0.0"),
    // The mid-takeover checkpoint: the finding is OPEN here. Its invalidation
    // stales the implementation AND the just-materialized code-review current
    // (the scope covers the discovering node itself) — the manual face mirrors
    // both, otherwise the intermediate takeover drifts.
    nodeFact("code-review", "review_summary", reviewV1, "1.0.0", {
      staleNodes: ["implementation", "code-review"],
    }),
    nodeFact("implementation", "implementation_record", `# ${requirementId} impl v2\n`, "2.0.0", { attempt: 2 }),
    nodeFact("code-review", "review_summary", reviewV2, "2.0.0", { attempt: 2 }),
    nodeFact("knowledge-sync", "knowledge_sync_result", `# ${requirementId} knowledge\n`, "1.0.0"),
  ];
  const findings: FindingFact[] = [
    Object.freeze({
      findingId: `${requirementId}-CR-F01`,
      discoveredAt: "code-review",
      category: "IMPLEMENTATION",
      earliest: "implementation",
      sourceRevisionId: `${runId}:revision:implementation:1`,
      evidenceKind: "review_summary",
      evidenceContent: reviewV1,
      registerAfter: "code-review",
      resolveAfter: "code-review",
      closedAtRound: 2,
      action: Object.freeze({
        action: "resolve" as const,
        closedBy: "code-review",
        evidenceKind: "review_summary",
        evidenceContent: reviewV2,
        boundRevisionId: `${runId}:revision:implementation:2`,
      }),
    }),
  ];
  return { nodes, findings };
}

/** S-MANIFEST-2 — corrupt: the takeover baseline's self-digest is tampered; the level-1 corruption discrimination must fail closed on both faces. */
function waveWithCorrupt(
  requirementId: string,
  depth: "LIGHT" | "STANDARD" | "DEEP",
): { nodes: NodeFact[]; findings: FindingFact[] } {
  const nodes: NodeFact[] = [
    nodeFact("requirement-intake", "requirement_summary", `# ${requirementId} intake\n`, "1.0.0"),
    nodeFact("solution-design", "technical_design", `# ${requirementId} design\n`, "1.0.0"),
    nodeFact("solution-gate", "solution_review", `# ${requirementId} gate\n`, "1.0.0", {
      gateResult: "PASS",
      decisionStatus: "CONFIRMED",
      decisionDepth: depth,
    }),
    nodeFact("task-planning", "task_plan", `# ${requirementId} plan\n`, "1.0.0"),
    nodeFact("implementation", "implementation_record", `# ${requirementId} impl\n`, "1.0.0"),
    nodeFact("code-review", "review_summary", `# ${requirementId} review\n`, "1.0.0"),
    nodeFact("knowledge-sync", "knowledge_sync_result", `# ${requirementId} knowledge\n`, "1.0.0"),
  ];
  return { nodes, findings: [] };
}

/** S-MANIFEST scenarios (2): reconcile (V9 mixed catch-up) + corrupt (fail-closed level-1 discrimination). */
export function coreManifestStateScenarios(): ScenarioSpec[] {
  const specs: ScenarioSpec[] = [];
  {
    const id = "S-MANIFEST-STANDARD-reconcile";
    specs.push(
      Object.freeze({
        id,
        family: "S-MANIFEST" as const,
        coords: coords({ depth: "STANDARD", verdict: "PASS", round: "first", manifestState: "reconcile" }),
        prunes: "reconcile: the runtime takes over at the INTERMEDIATE manual manifest (the review finding still OPEN); the journal tail (implementation v2 + re-review) and the finding closure land in ONE catch-up publish (V9 mixed); both faces snapshot at the code-review round",
        build: () => {
          const wave = waveWithReconcile(`20260920-${id}`, "STANDARD");
          return Object.freeze({
            requirementId: `20260920-${id}`,
            requestedDepth: "STANDARD" as const,
            nodes: wave.nodes,
            findings: wave.findings,
            midTakeoverAfter: "code-review",
          });
        },
      }),
    );
  }
  {
    const id = "S-MANIFEST-STANDARD-corrupt";
    specs.push(
      Object.freeze({
        id,
        family: "S-MANIFEST" as const,
        coords: coords({ depth: "STANDARD", verdict: "PASS", round: "first", manifestState: "corrupt" }),
        prunes: "corrupt: the takeover baseline's self-digest is tampered (first hex digit flipped); the projector must STOP with MANIFEST_CORRUPT_STOP — level-1 discrimination, single-level per the frozen spec (no cross-face comparison); the manual publisher's self-consistency check refuses on the same manifest",
        expectStop: "MANIFEST_CORRUPT_STOP",
        build: () => {
          const wave = waveWithCorrupt(`20260920-${id}`, "STANDARD");
          return Object.freeze({
            requirementId: `20260920-${id}`,
            requestedDepth: "STANDARD" as const,
            nodes: wave.nodes,
            findings: wave.findings,
            tamperTakeoverBaseline: true,
          });
        },
      }),
    );
  }
  return specs;
}
