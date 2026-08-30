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
import type { AgentCliProviderId } from "./agent-cli-profile";
import {
  parseNodeOutputEnvelope,
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
}

const INPUT_TEXT_KEYS = ["inputText", "text", "prompt", "requirement"] as const;

function extractInputText(input: Record<string, unknown> | undefined): string {
  if (input === undefined) fail("REAL_GATEWAY_NO_INPUT", "node request has no input");
  for (const key of INPUT_TEXT_KEYS) {
    const value = input[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
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
 * expects, by ROLE: verdict carries gateResult; verdict/scan/code-review carry
 * a findings ledger; everyone else carries neither. Pure — unit-testable
 * without the recovery/node-order machinery.
 */
export function buildCapabilityOutcome(
  envelope: ParsedNodeOutputEnvelope,
  capability: NodeCapabilityId,
  role: CapabilityExecutionRole,
): CapabilityOutcome {
  const verdict = isVerdictRole(capability, role);
  const findings = verdict || isScanRole(capability, role) || capability === "code-review";
  return {
    gateResult: verdict ? envelope.gateResult : null,
    unresolvedFindings: findings ? envelope.findings : null,
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

    const inputText = extractInputText(enriched.input);
    const prompt = buildNodeCapabilityPrompt({
      requirementId: enriched.requirementId,
      node: enriched.node,
      capability: nodeCapability,
      executionRole: role,
      inputText,
    });
    const cwd = this.realDeps.attemptWorkspace(enriched);

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

    const cliText = (cliResult.output as Readonly<Record<string, unknown>> | undefined)?.["text"];
    if (typeof cliText !== "string" || cliText.trim().length === 0) {
      fail("REAL_GATEWAY_BAD_ADAPTER_RESULT", "adapter returned no final text");
    }

    const verdictRole = isVerdictRole(nodeCapability, role);
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
    };
    if (outcome.gateResult !== null) output.gateResult = outcome.gateResult;
    if (outcome.unresolvedFindings !== null) output.unresolvedFindings = outcome.unresolvedFindings;

    return Object.freeze({
      success: true,
      node: enriched.node,
      agent: enriched.agent,
      output: Object.freeze(output),
      artifacts: Object.freeze([artifact]),
    });
  }
}
