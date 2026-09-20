// G6 / D-090-04 offline parity harness — fact-script builders
// ============================================================================
// Each scenario family gets a builder producing the shared FactScript. The
// script is the SINGLE source of facts for both faces: the manual face
// declares it through the publisher, the runtime face replays it through the
// scripted deterministic gateway.

import type { FactScript, NodeFact, ScenarioCoords, ScenarioSpec } from "./types";

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

/** The plain seven-node chain with a scripted gate verdict. */
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
          : { decisionStatus: "BLOCKED_UNKNOWN", decisionDepth: depth };
  return [
    nodeFact("requirement-intake", "requirement_summary", `# ${requirementId} intake\n`, "1.0.0"),
    nodeFact("solution-design", "technical_design", `# ${requirementId} design\n`, "1.0.0"),
    nodeFact("solution-gate", "solution_review", `# ${requirementId} gate\n`, "1.0.0", gateExtra),
    nodeFact("task-planning", "task_plan", `# ${requirementId} plan\n`, "1.0.0"),
    nodeFact("implementation", "implementation_record", `# ${requirementId} impl\n`, "1.0.0"),
    nodeFact("code-review", "code_review_record", `# ${requirementId} review\n`, "1.0.0"),
    nodeFact("knowledge-sync", "knowledge_sync_result", `# ${requirementId} knowledge\n`, "1.0.0"),
  ];
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
