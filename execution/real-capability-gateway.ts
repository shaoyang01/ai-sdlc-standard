// Real Capability Gateway — C03-E E1/E2 integration (Decision-071, Decision A)
// ============================================================================
// The SINGLE production product-source for canonical node capabilities. It
// extends ExecutionGateway and overrides ONLY executePrimary; the base class's
// executeCapabilityWithTracing still owns the one canonical tracing state
// machine (atomic started claim → output-contract validation → artifact/ledger
// → succeeded/failed terminal). No second state machine lives here.
//
// executePrimary pipeline for a canonical node request:
//   node context (role/attempt/runId come from request.loopExecution, which the
//   base preserves on boundRequest) → canonical prompt (Decision A: E3 sentinel
//   contract) → injected RealCapabilityAdapter (spawns nothing itself) →
//   parseNodeOutputEnvelope (fail-closed) → ONE canonical text artifact reused
//   from buildCapabilityTextArtifact → an ExecutionResult shaped exactly for
//   the base readCapabilityOutcome / output-contract checks.
//
// Non-canonical requests (code_review/bugfix/llm_task/shadow) fall through to
// the base implementation unchanged.

import { ExecutionGateway, type ExecutionGatewayOptions } from "./gateway";
import type { ExecutionRequest, ExecutionResult } from "./types";
import { CapabilityProcessEvidenceError } from "./types";
import { RealCapabilityAdapter, RealCapabilityAdapterError } from "./real-capability-adapter";
import { getAgentCliProfile, type AgentCliProviderId } from "./agent-cli-profile";
import { stagePromptInput } from "./prompt-workspace";
import {
  parseNodeOutputEnvelope,
  NodeOutputEnvelopeError,
  type ParsedNodeOutputEnvelope,
  type NodeOutputFinding,
  type NodeGateVerdict,
} from "../core/node-output-envelope";
import { buildNodeCapabilityPrompt } from "./capability-prompt-builder";
import { buildCapabilityTextArtifact } from "./codex-real-dispatch-runner";
import { CAPABILITY_ARTIFACT_TYPES } from "../core/agent-capability-bindings";
import {
  NODE_CAPABILITY_IDS,
  type CapabilityExecutionRole,
  type NodeCapabilityId,
} from "../loop/types";

export type RealGatewayErrorCode =
  | "REAL_GATEWAY_INVALID_CONTEXT"
  | "REAL_GATEWAY_NO_INPUT"
  | "REAL_GATEWAY_BAD_ADAPTER_RESULT";

export class RealCapabilityGatewayError extends Error {
  readonly code: RealGatewayErrorCode;
  constructor(code: RealGatewayErrorCode, message: string) {
    super(message);
    this.name = "RealCapabilityGatewayError";
    this.code = code;
  }
}

function fail(code: RealGatewayErrorCode, message: string): never {
  throw new RealCapabilityGatewayError(code, message);
}

/** Structural subset — satisfied by RealCapabilityAdapter; fakes in tests. */
export type RealGatewayAdapter = Pick<RealCapabilityAdapter, "execute">;

export interface RealCapabilityGatewayDeps {
  readonly adapter: RealGatewayAdapter;
  /** Resolve the attempt workspace cwd for a request (production injects it). */
  readonly attemptWorkspace: (request: ExecutionRequest) => string;
  /**
   * Resolve a loop input artifact ref to its text. Bound to the run's OWN
   * artifact store by createCapabilityGateway (the single assembly point):
   * canonical run() dispatch carries only { inputArtifactRef }, and the
   * store is not reachable from here. A directly-constructed gateway without
   * this resolver keeps failing closed on artifact-ref-only requests.
   */
  readonly artifactText?: (artifactRef: string) => string;
}

const INPUT_TEXT_KEYS = ["inputText", "text", "prompt", "requirement"] as const;

function extractInputText(
  input: Record<string, unknown> | undefined,
  artifactText?: (artifactRef: string) => string,
): string {
  if (input === undefined) fail("REAL_GATEWAY_NO_INPUT", "node request has no input");
  for (const key of INPUT_TEXT_KEYS) {
    const value = input[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  // W-GW-FIX (Decision-078): the canonical run() dispatch hands each node its
  // input as { inputArtifactRef } — resolve the loop's own artifact instead of
  // dying pre-staging. Free-text keys above keep precedence (hand-built entry
  // requests from the canary/tests are unchanged).
  const ref = input["inputArtifactRef"];
  if (typeof ref === "string" && ref.trim().length > 0) {
    if (artifactText === undefined) {
      fail("REAL_GATEWAY_NO_INPUT", "node request carries only inputArtifactRef but no artifactText resolver is wired");
    }
    const resolved = artifactText(ref);
    if (typeof resolved === "string" && resolved.trim().length > 0) return resolved;
    fail("REAL_GATEWAY_NO_INPUT", `input artifact resolved to empty text for ref ${ref}`);
  }
  fail("REAL_GATEWAY_NO_INPUT", "node request carries no non-empty input text");
}

export interface CapabilityOutcome {
  readonly gateResult: NodeGateVerdict | null;
  readonly unresolvedFindings: readonly NodeOutputFinding[] | null;
}

/** True only for the role that may issue a conclusive Gate verdict. */
export function isVerdictRole(capability: NodeCapabilityId, role: CapabilityExecutionRole): boolean {
  return capability === "solution-gate" && role === "formal_verdict";
}

/** True for the scan role, which always persists a Finding Ledger. */
export function isScanRole(capability: NodeCapabilityId, role: CapabilityExecutionRole): boolean {
  return capability === "solution-gate" && role === "adversarial_scan";
}

/**
 * Map a parsed E3 envelope to exactly what the base readCapabilityOutcome
 * expects, by ROLE: verdict carries gateResult; EVERY canonical role may carry
 * findings (G4-R5-H5: discovery is a whole-chain duty per frozen contract
 * §5.1 — intake/implementation/knowledge-sync findings ride the same channel
 * as scan/verdict/code-review ones). Pure — unit-testable without the
 * recovery/node-order machinery.
 */
export function buildCapabilityOutcome(
  envelope: ParsedNodeOutputEnvelope,
  capability: NodeCapabilityId,
  role: CapabilityExecutionRole,
): CapabilityOutcome {
  const verdict = isVerdictRole(capability, role);
  return {
    gateResult: verdict ? envelope.gateResult : null,
    unresolvedFindings: envelope.findings,
  };
}

export class RealCapabilityGateway extends ExecutionGateway {
  private readonly realDeps: RealCapabilityGatewayDeps;

  constructor(options: ExecutionGatewayOptions, deps: RealCapabilityGatewayDeps) {
    super(options);
    this.realDeps = Object.freeze({ ...deps });
  }

  protected override async executePrimary(enriched: ExecutionRequest): Promise<ExecutionResult> {
    const capability = enriched.type;
    // Only canonical node capabilities use the real route; everything else
    // (code_review / bugfix / llm_task / shadow) keeps the base behaviour.
    if (typeof capability !== "string" || !(NODE_CAPABILITY_IDS as readonly string[]).includes(capability)) {
      return super.executePrimary(enriched);
    }
    const nodeCapability = capability as NodeCapabilityId;

    const loopExecution = enriched.loopExecution as Readonly<Record<string, unknown>> | undefined;
    const executionRole = loopExecution?.["executionRole"];
    const attempt = loopExecution?.["attempt"];
    const runId = loopExecution?.["runId"];
    if (
      typeof executionRole !== "string" ||
      typeof attempt !== "number" ||
      !Number.isSafeInteger(attempt) ||
      typeof runId !== "string" ||
      runId.trim().length === 0
    ) {
      fail("REAL_GATEWAY_INVALID_CONTEXT", "real node dispatch requires runId/attempt/executionRole in loopExecution");
    }
    const role = executionRole as CapabilityExecutionRole;
    const providerId = enriched.agent as AgentCliProviderId;

    // G4-R7-B5 (§7.3 A2 随行): the PWR risk provenance carried on the dispatch
    // input — the ruling's verified decision-delta pointer and its non-empty
    // risk refs — is appended to the actual input TEXT so it reaches every
    // content carrier (staged workspace file, stdin transport and prompt).
    // Absent/empty provenance leaves the upstream text byte-identical.
    const rawInputText = extractInputText(enriched.input, this.realDeps.artifactText);
    const provenanceRefs = Array.isArray(enriched.input?.["riskAcceptanceRefs"])
      ? (enriched.input["riskAcceptanceRefs"] as unknown[]).filter(
        (ref): ref is string => typeof ref === "string" && ref.length > 0,
      )
      : [];
    const deltaRef = enriched.input?.["decisionDeltaRef"];
    const deltaDigest = enriched.input?.["decisionDeltaDigest"];
    const inputText = provenanceRefs.length > 0 &&
      typeof deltaRef === "string" && deltaRef.length > 0 &&
      typeof deltaDigest === "string" && deltaDigest.length > 0
      ? `${rawInputText}\n\n## Gate risk acceptance provenance (§7.3 A2)\n\n- decisionDeltaRef: ${deltaRef}\n- decisionDeltaDigest: ${deltaDigest}\n${provenanceRefs.map((ref) => `- riskAcceptanceRef: ${ref}\n`).join("")}`
      : rawInputText;
    const cwd = this.realDeps.attemptWorkspace(enriched);

    // ── E5-W3 plan C: keep the instruction shell small and constant ──
    // The upstream artifact (requirement → design → implementation record)
    // grows at every hop, so content must not ride the shell (4096 B per argv
    // entry). Two routes: the shell names a staged workspace file and the agent
    // reads it ("workspace-file"), or the content is piped on stdin ("stdin",
    // for providers that cannot read a staged file — codex's fs sandbox helper
    // fails inside a nested sandbox). The file is staged under BOTH routes: it
    // is the journal's evidence anchor for what the agent was fed, and the
    // fallback once content outgrows stdin's 1 MiB ceiling.
    const profile = getAgentCliProfile(providerId);
    const staged = stagePromptInput({
      workspaceDir: cwd,
      content: inputText,
      capability: nodeCapability,
      executionRole: role,
      attempt,
    });
    const useStdin = profile.contentTransport === "stdin";
    const pointerPath = profile.pointerPathMode === "absolute" ? staged.absolutePath : staged.relativePath;

    const prompt = useStdin
      ? buildNodeCapabilityPrompt({
          requirementId: enriched.requirementId,
          node: enriched.node,
          capability: nodeCapability,
          executionRole: role,
          inputStdin: { digest: staged.digest, bytes: staged.bytes },
        })
      : buildNodeCapabilityPrompt({
          requirementId: enriched.requirementId,
          node: enriched.node,
          capability: nodeCapability,
          executionRole: role,
          inputPointer: { path: pointerPath, digest: staged.digest, bytes: staged.bytes },
        });

    // E5-W1 (G-S09b): a failure AFTER the process ran carries bounded
    // evidence on the error; re-raise it as a CapabilityProcessEvidenceError
    // so the tracing gateway can persist the evidence on the FAILED terminal
    // event. Pre-process failures keep their original error (all-null event).
    let cliResult: ExecutionResult;
    try {
      cliResult = await this.realDeps.adapter.execute({
        providerId,
        runId,
        invocationId: `${runId}:${nodeCapability}:${role}:${attempt}`,
        requirementId: enriched.requirementId,
        node: enriched.node,
        capability: nodeCapability,
        executionRole: role,
        attempt,
        prompt,
        stdinContent: useStdin ? inputText : undefined,
        promptPointers: [staged],
        cwd,
      });
    } catch (error) {
      if (error instanceof RealCapabilityAdapterError && error.evidence !== null) {
        const ev = error.evidence;
        throw new CapabilityProcessEvidenceError(error.message, Object.freeze({
          invocationDigest: ev.invocationDigest,
          // A process terminates by exit code OR signal, never both; the
          // journal validator enforces the 0..255 exit range.
          signal: ev.signal ?? null,
          exitCode:
            ev.signal === null && ev.exitCode !== null && ev.exitCode >= 0 && ev.exitCode <= 255
              ? ev.exitCode
              : null,
          durationMs: ev.durationMs >= 1 ? ev.durationMs : null,
          truncated: ev.stdoutTruncated || ev.stderrTruncated,
        }));
      }
      throw error;
    }

    // W-GW-DIAG P-A: everything AFTER a successful adapter return is a
    // POST-PROCESS failure — the process ran (evidence is in hand) but its
    // output was empty or failed the E3 output contract. These used to escape
    // as bare errors and journal as evidence-free EXECUTOR_EXCEPTION, hiding
    // "the agent worked for minutes" behind "nothing happened". Wrap them so
    // the FAILED terminal keeps the real cause code AND the process evidence.
    const postEvidence = cliResult.processEvidence ?? null;
    const verdictRole = isVerdictRole(nodeCapability, role);
    try {
      return this.buildNodeOutcomeFromCliResult(enriched, nodeCapability, role, verdictRole, cliResult);
    } catch (error) {
      if (error instanceof CapabilityProcessEvidenceError) throw error;
      const cause = error instanceof RealCapabilityGatewayError
        ? error.code
        : error instanceof NodeOutputEnvelopeError
          ? "REAL_GATEWAY_ENVELOPE_INVALID"
          : "REAL_GATEWAY_OUTPUT_CONTRACT";
      throw new CapabilityProcessEvidenceError(
        `${cause}: ${(error as Error).message}`,
        postEvidence,
        cause,
      );
    }
  }

  /** Post-process section of executePrimary, extracted for the P-A evidence wrap. */
  private buildNodeOutcomeFromCliResult(
    enriched: ExecutionRequest,
    nodeCapability: NodeCapabilityId,
    role: CapabilityExecutionRole,
    verdictRole: boolean,
    cliResult: ExecutionResult,
  ): ExecutionResult {
    const cliText = (cliResult.output as Readonly<Record<string, unknown>> | undefined)?.["text"];
    if (typeof cliText !== "string" || cliText.trim().length === 0) {
      fail("REAL_GATEWAY_BAD_ADAPTER_RESULT", "adapter returned no final text");
    }

    // E3 envelope, role-aware: only formal_verdict may carry a verdict.
    const envelope = parseNodeOutputEnvelope(cliText, nodeCapability, { isVerdict: verdictRole });

    // Reuse the existing text→canonical-artifact builder (source/agent typed
    // exactly as the base output-contract check requires).
    const artifact = buildCapabilityTextArtifact(
      enriched,
      nodeCapability,
      envelope.body,
      CAPABILITY_ARTIFACT_TYPES[nodeCapability],
      enriched.agent,
    );

    // Role-exact mapping for the base readCapabilityOutcome.
    const outcome = buildCapabilityOutcome(envelope, nodeCapability, role);
    const output: Record<string, unknown> = {
      summary: envelope.summary,
      text: envelope.body,
      // G4-R5-H4: the node business result rides the output verbatim — the
      // tracing gateway owns the SUCCEEDED/BLOCKED/FAILED terminal mapping.
      nodeStatus: envelope.nodeStatus,
    };
    if (outcome.gateResult !== null) output.gateResult = outcome.gateResult;
    if (outcome.unresolvedFindings !== null) output.unresolvedFindings = outcome.unresolvedFindings;
    if (verdictRole) {
      // G4-R5-H3: the decision fields are ALWAYS present on a verdict
      // dispatch — including the explicit null of a BLOCKED_UNKNOWN ruling —
      // so the tracing gateway can distinguish "explicit null" (legal
      // business block) from "missing" (contract violation).
      output.decisionDepth = envelope.decisionDepth;
      output.decisionStatus = envelope.decisionStatus;
      if (outcome.gateResult === "PASS_WITH_RISK" && envelope.riskAcceptanceRefs.length > 0) {
        // G4-R5-H5: risk references persist with the decision delta — see the
        // tracing gateway's delta artifact.
        output.riskAcceptanceRefs = envelope.riskAcceptanceRefs;
      }
    }

    return Object.freeze({
      success: true,
      node: enriched.node,
      agent: enriched.agent,
      output: Object.freeze(output),
      artifacts: Object.freeze([artifact]),
      // E5-W3 finding: the adapter already builds bounded process evidence for
      // the success path (real-capability-adapter.ts:428-434 — exit 0, no
      // signal, untruncated, durationMs floor-checked) and returns it. The
      // tracing gateway spreads `processEventFields(result.processEvidence)`
      // onto the SUCCEEDED terminal (gateway.ts:571), so omitting this
      // pass-through made every successful real dispatch journal an all-null
      // process-evidence block. The failure path carries its own evidence via
      // CapabilityProcessEvidenceError above.
      processEvidence: cliResult.processEvidence ?? null,
    });
  }
}
