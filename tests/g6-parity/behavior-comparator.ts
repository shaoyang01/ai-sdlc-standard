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

/**
 * H1-remediation: the derived final-handoff expectation from the script's own
 * terminal SHAPE — a completing script (last node knowledge-sync) expects the
 * entry's READY_FOR_MANUAL_GIT_HANDOFF checklist with a persisted artifact
 * ref; any other terminal shape means the chain never completed and the entry
 * builds no handoff artifact (ABSENT). This derivation reads the script, NOT
 * the runtime's success proxy — R-G6-01: completing scripts currently OBSERVE
 * BLOCKED (the c3 checklist reads a contract-pinned field); that divergence is
 * surfaced and bucketed by the runner, never reported as MATCH.
 */
function deriveExpectedHandoff(script: FactScript): {
  status: "READY_FOR_MANUAL_GIT_HANDOFF" | "BLOCKED" | "FAILED" | "ABSENT";
  reason: string | null;
  requireArtifactRef: boolean;
} {
  const completes = script.nodes[script.nodes.length - 1]?.node === "knowledge-sync";
  return completes
    ? { status: "READY_FOR_MANUAL_GIT_HANDOFF", reason: null, requireArtifactRef: true }
    : { status: "ABSENT", reason: null, requireArtifactRef: false };
}

/** Canonical node order (the reflow direction's basis). */
const NODE_ORDER = [
  "requirement-intake", "solution-design", "solution-gate", "task-planning",
  "implementation", "code-review", "knowledge-sync",
];

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
        // H1-remediation: not counts — the ACTUAL binding entries per gate
        // round. Every round must dispatch BOTH roles (adversarial_scan +
        // formal_verdict, the dual-binding node) at that round's attempt; a
        // missing/duplicated/misattempted binding entry is a DIVERGE.
        const expectedEntries: string[] = [];
        for (const node of script.nodes) {
          if (node.node !== "solution-gate") continue;
          const attempt = node.attempt ?? 1;
          expectedEntries.push(`adversarial_scan:${attempt}`, `formal_verdict:${attempt}`);
        }
        const actualEntries = trace.terminals
          .filter((t) => t.capability === "solution-gate")
          .map((t) => `${t.executionRole}:${t.attempt}`);
        const same = JSON.stringify(actualEntries) === JSON.stringify(expectedEntries);
        return { dimension, verdict: same ? "MATCH" : "DIVERGE", detail: same ? `${expectedEntries.length / 2} gate rounds, both binding entries per round with the round's attempt` : `runtime bindings [${actualEntries.join(",")}] vs script [${expectedEntries.join(",")}]` };
      }
      case "decision-depth": {
        const expected = expectedVerdicts(script);
        const actual = trace.verdicts.map((v) => ({ gateResult: v.gateResult, decisionStatus: v.decisionStatus, decisionDepth: v.decisionDepth }));
        const same = JSON.stringify(actual) === JSON.stringify(expected);
        return { dimension, verdict: same ? "MATCH" : "DIVERGE", detail: same ? `verdict triples match the script (${actual.map((v) => `${v.gateResult}/${v.decisionStatus}/${v.decisionDepth ?? "-"}`).join("; ")})` : `runtime ${JSON.stringify(actual)} vs script ${JSON.stringify(expected)}` };
      }
      case "next-eligibility": {
        // H1-remediation: not a chain-terminal boolean — the PER-ROUND
        // admission (§7.3 A1), grounded in the OBSERVED dispatch sequence (a
        // fabricated entry-reported field can no longer print MATCH):
        //   admitting verdict (PASS/PWR + CONFIRMED)  ⇒ forward progress next
        //   non-admitting (FAIL / BLOCKED_UNKNOWN / ESCALATED) ⇒ the
        //     finding-authorized backward jump (the reflow to the earliest
        //     affected node), or an honest stop ONLY where the script
        //     declares the round budget (the over-limit pause's durable block
        //     before the reflow dispatch).
        const completed = trace.chainStatus === "COMPLETED" && trace.finalStatus === "success";
        const gates = script.nodes.filter((node) => node.node === "solution-gate");
        const divergences: string[] = [];
        for (const gate of gates) {
          const attempt = gate.attempt ?? 1;
          const verdictIdx = trace.terminals.findIndex(
            (t) => t.capability === "solution-gate" && t.executionRole === "formal_verdict" && t.attempt === attempt,
          );
          if (verdictIdx < 0) {
            divergences.push(`round ${attempt}: no verdict terminal`);
            continue;
          }
          const actualNext = trace.terminals[verdictIdx + 1]?.capability ?? null;
          const admitting =
            (gate.gateResult === "PASS" || gate.gateResult === "PASS_WITH_RISK") && gate.decisionStatus === "CONFIRMED";
          if (admitting) {
            // The WP-1 feedback path (the F family): an admitting gate round
            // may OPEN a new generation — the FEEDBACK_DRIVEN_CHANGE record
            // drives a full rebuild from requirement-intake that is a
            // GENERATION RESTART, not a finding reflow (R2-H1-A). R3-H1: the
            // backward jump is legitimate only when the SCRIPT declares the
            // trigger at this round AND the journal carries the matching
            // verified WP-1 record (type / CLASSIFIED status / generation
            // binding / trigger round) AND the next intake dispatch shows the
            // NEW GENERATION's attempt — the declaration alone, or the next
            // node name alone, no longer admits. An undeclared backward jump
            // after an admitting verdict still DIVERGEs.
            const declaredTrigger = script.nodes.find(
              (n) => n.opensFeedbackChange === true && n.node === "solution-gate" && (n.attempt ?? 1) === attempt,
            );
            const forward = actualNext !== null && NODE_ORDER.indexOf(actualNext) > NODE_ORDER.indexOf("solution-gate");
            let okAdmit = forward;
            let restartDetail = "";
            if (declaredTrigger !== undefined && actualNext === "requirement-intake") {
              // The declared restart trajectory: the script's next node after
              // the trigger is the new generation's intake, carrying ITS
              // attempt — a re-dispatch at the run's continuing attempt, not a
              // fresh attempt-1 intake (a fabricated restart).
              const declaredIntake = script.nodes[script.nodes.findIndex((n) => n === declaredTrigger) + 1];
              const expectedIntakeAttempt = declaredIntake?.attempt ?? 1;
              const observedIntakeAttempt = trace.terminals[verdictIdx + 1]?.attempt ?? null;
              const record = trace.generationRestarts.find(
                (item) =>
                  item.changeKind === "FEEDBACK_DRIVEN_CHANGE" &&
                  item.status === "CLASSIFIED" &&
                  item.triggerCapability === declaredTrigger.node &&
                  item.triggerAttempt === attempt,
              );
              const generationOk =
                record !== undefined &&
                record.previousGeneration !== null &&
                record.previousGeneration >= 1 &&
                record.previousGeneration + 1 === trace.generation;
              const attemptOk = observedIntakeAttempt === expectedIntakeAttempt && expectedIntakeAttempt > 1;
              okAdmit = generationOk && attemptOk;
              restartDetail = record === undefined
                ? "declared WP-1 restart but the journal carries no matching CLASSIFIED FEEDBACK_DRIVEN_CHANGE record for this trigger round"
                : `declared WP-1 restart: record ${record.changeKind}/${record.status}/gen ${record.previousGeneration ?? "?"} (trigger ${record.triggerCapability}@${record.triggerAttempt}), run generation ${trace.generation}, next intake attempt ${observedIntakeAttempt ?? "none"} vs expected ${expectedIntakeAttempt}`;
            }
            if (!okAdmit) {
              divergences.push(
                `round ${attempt}: admitting ${gate.gateResult}/${gate.decisionStatus} but next dispatch ${actualNext ?? "none"}` +
                  `${restartDetail === "" ? "" : ` — ${restartDetail}`}`,
              );
            }
            continue;
          }
          const roundFindings = script.findings.filter(
            (finding) => finding.discoveredAt === "solution-gate" && (finding.gateRound ?? 1) === attempt,
          );
          // The reflow target: the round's declared findings' earliest node;
          // a verdict with no declared finding still owes the synthesized
          // SOLUTION reflow row (semantics ⑩ — earliest solution-design).
          const earliest = roundFindings.length > 0
            ? roundFindings.map((finding) => NODE_ORDER.indexOf(finding.earliest)).sort((a, b) => a - b)[0]!
            : NODE_ORDER.indexOf("solution-design");
          const budgetDenied = script.maxRegateRounds !== undefined && gate === gates[gates.length - 1];
          const okNext =
            actualNext === null ? budgetDenied : NODE_ORDER.indexOf(actualNext) === earliest;
          if (!okNext) {
            divergences.push(`round ${attempt}: non-admitting ${gate.gateResult}/${gate.decisionStatus ?? "-"} but next dispatch ${actualNext ?? "none"} (expected reflow to ${NODE_ORDER[earliest]}${budgetDenied ? " or the budget-denied stop" : ""})`);
          }
        }
        const expected = expectedTerminal(script);
        const terminalOk = completed === expected.success;
        const same = divergences.length === 0 && terminalOk;
        return { dimension, verdict: same ? "MATCH" : "DIVERGE", detail: same ? `terminal ${trace.finalStatus}/${trace.chainStatus} as the script requires; per-round admission consistent (${gates.length} rounds)` : [...divergences, ...(terminalOk ? [] : [`terminal ${trace.finalStatus}/${trace.chainStatus}${trace.blockingReasonCode === null ? "" : ` (${trace.blockingReasonCode})`} vs script expects ${expected.success ? "success/COMPLETED" : "a blocked chain"}`])].join(" | ") };
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
        // H1-remediation: the terminal handoff state is the production
        // entry's REAL c2/c3 handoff triple (status / reason / artifact ref),
        // compared field-for-field against the declared (or script-shape
        // derived) expectation. A success proxy can no longer print MATCH on
        // a BLOCKED handoff (R1-H1's counterexample: a COMPLETED/success
        // chain whose checklist reports BLOCKED "code review closure review
        // not done" — R-G6-01, the routed production finding).
        const lastTerminal = trace.terminals[trace.terminals.length - 1];
        const expectedLast = script.nodes[script.nodes.length - 1]?.node;
        const terminal = expectedTerminal(script);
        const stoppedRight = lastTerminal?.capability === expectedLast;
        const expected = script.expectedHandoff ?? deriveExpectedHandoff(script);
        const observed = trace.handoff;
        let handoffOk: boolean;
        let handoffDetail: string;
        if (expected.status === "ABSENT") {
          // R2-H1-B: ABSENT means the entry built NO handoff artifact — the
          // whole triple must be null. A non-null reason or artifactRef on a
          // null status is fabricated evidence and must not pass as MATCH.
          handoffOk = observed.status === null && observed.reason === null && observed.artifactRef === null;
          handoffDetail = handoffOk
            ? "chain not completed: no handoff artifact (status/reason/ref all null), as the script's terminal requires"
            : `ABSENT expectation violated: observed status=${String(observed.status)} reason=${String(observed.reason)} ref=${observed.artifactRef === null ? "null" : "present"}`;
        } else if (observed.status === null) {
          // Missing evidence refuses to judge — never a MATCH.
          handoffOk = false;
          handoffDetail = `no handoff artifact observed (expected ${expected.status}) — evidence missing, refusing to judge as MATCH`;
        } else {
          handoffOk =
            observed.status === expected.status &&
            observed.reason === expected.reason &&
            (expected.requireArtifactRef ? observed.artifactRef !== null : observed.artifactRef === null);
          handoffDetail = handoffOk
            ? `handoff ${observed.status}/${observed.reason ?? "-"} (artifactRef ${observed.artifactRef !== null ? "present" : "absent"}) as required`
            : `handoff ${observed.status}/${observed.reason ?? "-"} (ref ${observed.artifactRef !== null ? "present" : "absent"}) vs expected ${expected.status}/${expected.reason ?? "-"} (ref ${expected.requireArtifactRef ? "required" : "absent"})`;
        }
        const same = stoppedRight && handoffOk;
        return { dimension, verdict: same ? "MATCH" : "DIVERGE", detail: same ? `terminal at ${lastTerminal?.capability}; ${handoffDetail}` : `terminal at ${lastTerminal?.capability ?? "none"} vs expected ${expectedLast ?? "none"}; ${handoffDetail}` };
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
