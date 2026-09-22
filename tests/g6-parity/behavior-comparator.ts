// G6 / D-090-04 — behavior-layer comparator (frozen spec §4.1/§4.2)
// ============================================================================
// The behavior layer judges dims 1/2/6/7/8/9 (node-sequence, gate-roles,
// decision-depth, next-eligibility, earliest-reroute, final-handoff) from
// the production entry's observed decision trajectory; dims 3/4/5 are the
// artifact layer's and are reported NOT_JUDGED here (the mirror image of the
// artifact comparator). The reference is the shared fact script — the same
// script the manual face declares, so agreement with it IS cross-face
// agreement.

import type { DimensionResult } from "./types";
import { NINE_DIMENSIONS } from "./types";
import type { BehaviorTrace } from "./behavior-face";
import type { FactScript } from "./types";

export interface BehaviorComparison {
  readonly dimensions: readonly DimensionResult[];
  readonly equal: boolean;
}

/** The script's expected dispatch sequence (the nodes in script order; the
 *  dual-role solution-gate expands into its two role terminals per round). */
function expectedDispatch(script: FactScript): readonly string[] {
  const sequence: string[] = [];
  for (const node of script.nodes) {
    sequence.push(node.node);
    if (node.node === "solution-gate") sequence.push(node.node);
  }
  return sequence;
}

/** The script's expected verdict rounds (the gate nodes in order). */
function expectedVerdicts(script: FactScript): readonly { gateResult: string; decisionStatus: string; decisionDepth: string | null }[] {
  return script.nodes
    .filter((node) => node.node === "solution-gate")
    .map((node) => ({
      gateResult: node.gateResult ?? "PASS",
      decisionStatus: node.decisionStatus ?? "CONFIRMED",
      decisionDepth: node.decisionDepth ?? null,
    }));
}

/** The script's expected terminal: the last gate verdict decides. */
function expectedTerminal(script: FactScript): { success: boolean } {
  const gates = script.nodes.filter((node) => node.node === "solution-gate");
  const last = gates[gates.length - 1];
  return { success: last?.gateResult === "PASS" || last?.gateResult === "PASS_WITH_RISK" };
}

export function compareBehaviorLayer(script: FactScript, trace: BehaviorTrace): BehaviorComparison {
  const dispatchedNodes = trace.terminals.map((terminal) => terminal.capability);
  const expectedNodes = expectedDispatch(script);
  const dims: DimensionResult[] = NINE_DIMENSIONS.map((dimension) => {
    switch (dimension) {
      case "node-sequence": {
        const same = JSON.stringify(dispatchedNodes) === JSON.stringify(expectedNodes);
        return { dimension, verdict: same ? "MATCH" : "DIVERGE", detail: same ? `dispatch sequence matches the script (${dispatchedNodes.length} terminals)` : `runtime [${dispatchedNodes.join(",")}] vs script [${expectedNodes.join(",")}]` };
      }
      case "gate-roles": {
        // Every gate round must dispatch BOTH the adversarial_scan and the
        // formal_verdict (the dual-binding node).
        const gateRounds = trace.terminals.filter((t) => t.capability === "solution-gate" && t.executionRole === "adversarial_scan").length;
        const verdictRounds = trace.verdicts.length;
        const scriptRounds = expectedVerdicts(script).length;
        const same = gateRounds === scriptRounds && verdictRounds === scriptRounds;
        return { dimension, verdict: same ? "MATCH" : "DIVERGE", detail: same ? `${scriptRounds} gate rounds, both roles dispatched` : `scans ${gateRounds}/verdicts ${verdictRounds} vs script rounds ${scriptRounds}` };
      }
      case "decision-depth": {
        const expected = expectedVerdicts(script);
        const actual = trace.verdicts.map((v) => ({ gateResult: v.gateResult, decisionStatus: v.decisionStatus, decisionDepth: v.decisionDepth }));
        const same = JSON.stringify(actual) === JSON.stringify(expected);
        return { dimension, verdict: same ? "MATCH" : "DIVERGE", detail: same ? `verdict triples match the script (${actual.map((v) => `${v.gateResult}/${v.decisionStatus}/${v.decisionDepth ?? "-"}`).join("; ")})` : `runtime ${JSON.stringify(actual)} vs script ${JSON.stringify(expected)}` };
      }
      case "next-eligibility": {
        const expected = expectedTerminal(script);
        const completed = trace.chainStatus === "COMPLETED" && trace.finalStatus === "success";
        const same = completed === expected.success;
        return { dimension, verdict: same ? "MATCH" : "DIVERGE", detail: same ? `terminal ${trace.finalStatus}/${trace.chainStatus} as the script requires` : `terminal ${trace.finalStatus}/${trace.chainStatus}${trace.blockingReasonCode === null ? "" : ` (${trace.blockingReasonCode})`} vs script expects ${expected.success ? "success/COMPLETED" : "a blocked chain"}` };
      }
      case "earliest-reroute": {
        // The reflow targets: the findings' earliest nodes (the finding-driven
        // backward jumps). A WP-1 feedback wave adds its own restart target —
        // the full rebuild restarts at the first lagging node
        // (requirement-intake): a generation restart, not a finding reflow.
        const expectedTargets = [
          ...new Set([
            ...script.findings
              .filter((finding) => finding.action === undefined || finding.action.action !== "accept")
              .map((finding) => finding.earliest),
            ...(script.nodes.some((node) => node.opensFeedbackChange === true) ? ["requirement-intake"] : []),
          ]),
        ];
        const actualTargets = trace.reflowTargets;
        const same = JSON.stringify([...actualTargets].sort()) === JSON.stringify([...expectedTargets].sort());
        return { dimension, verdict: same ? "MATCH" : "DIVERGE", detail: same ? `reflow targets match the findings' earliest nodes (${actualTargets.join(",") || "none"})` : `runtime reflowed to [${actualTargets.join(",")}] vs findings' earliest [${expectedTargets.join(",")}]` };
      }
      case "final-handoff": {
        // The terminal handoff state: the completed chain's last node is the
        // knowledge-sync terminal (the finished state); a blocked chain stops
        // at its blocking point.
        const lastTerminal = trace.terminals[trace.terminals.length - 1];
        const expectedLast = script.nodes[script.nodes.length - 1]?.node;
        const same = lastTerminal?.capability === expectedLast && trace.finalStatus === "success";
        return { dimension, verdict: same ? "MATCH" : "DIVERGE", detail: same ? `terminal at ${lastTerminal?.capability} (success)` : `terminal at ${lastTerminal?.capability ?? "none"} vs expected ${expectedLast ?? "none"}` };
      }
      default:
        // Dims 3/4/5 (artifact-paths / version-state / finding-identity) are
        // the artifact layer's; the behavior layer never judges them.
        return {
          dimension,
          verdict: "NOT_JUDGED" as const,
          detail: "artifact layer (judged by the manifest comparison)",
        };
    }
  });
  return { dimensions: dims, equal: dims.every((d) => d.verdict !== "DIVERGE") };
}
