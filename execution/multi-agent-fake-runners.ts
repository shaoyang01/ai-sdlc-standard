// Multi-Agent Fake Runners — C03-E W1 (Decision-073, Q1 binding)
// ===================================================================
// TEST-ONLY specialized fake dispatchers for the Q1 three-agent binding.
// Each runner owns ONLY the capabilities Q1 assigns to its agent and returns
// the canonical node output artifact through the SAME capability-text
// construction the Codex fake runner uses. No real CLI is ever spawned: these
// are the per-agent fake counterparts a test gateway routes to, mirroring the
// shape of the production RealCapabilityGateway (which would dispatch to a
// real Kimi/Hermes CLI instead of returning deterministic text).
//
// Q1 ownership:
//   Kimi   -> requirement-intake, solution-design, task-planning, knowledge-sync
//   Codex  -> solution-gate/adversarial_scan, implementation (existing fake runner)
//   Hermes -> solution-gate/formal_verdict, code-review

import type { ExecutionRequest, ExecutionResult } from "./types";
import type { CapabilityExecutionRole, NodeCapabilityId } from "../loop/types";
import {
  buildCapabilityTextArtifact,
  checkCapabilityInput,
} from "./codex-real-dispatch-runner";
import { CAPABILITY_ARTIFACT_TYPES } from "../core/agent-capability-bindings";

export interface NodeCapabilityFakeRunner {
  run(request: ExecutionRequest): Promise<ExecutionResult>;
}

type FakeAgentName = "kimi" | "hermes";

function fakeCapabilityOutcome(capability: NodeCapabilityId): Readonly<Record<string, unknown>> {
  if (capability === "solution-gate") {
    // Only formal_verdict reaches this runner for solution-gate (the scan is
    // owned by Codex); the verdict therefore carries the conclusive PASS.
    return Object.freeze({ gateResult: "PASS", unresolvedFindings: Object.freeze([]) });
  }
  if (capability === "code-review") {
    return Object.freeze({ unresolvedFindings: Object.freeze([]) });
  }
  return Object.freeze({});
}

function createNodeCapabilityFakeRunner(
  agent: FakeAgentName,
  owns: ReadonlySet<NodeCapabilityId>,
  requiredRole: CapabilityExecutionRole | null,
): NodeCapabilityFakeRunner {
  return {
    async run(request: ExecutionRequest): Promise<ExecutionResult> {
      if (request.agent !== agent) {
        throw new Error(`${agent} fake runner received a request bound to agent "${request.agent}"`);
      }
      const capability = request.type as NodeCapabilityId;
      if (!owns.has(capability)) {
        throw new Error(
          `${agent} fake runner does not own capability "${request.type}" (Q1 assigns it elsewhere)`,
        );
      }
      if (requiredRole !== null && request.loopExecution?.executionRole !== requiredRole) {
        throw new Error(
          `${agent} fake runner for ${capability} requires executionRole ${requiredRole}, ` +
            `got ${String(request.loopExecution?.executionRole)}`,
        );
      }

      // Fail-closed input safety, identical to the Codex fake runner.
      const inputCheck = checkCapabilityInput(request.input);
      if (inputCheck.ok === false) {
        throw new Error(`${agent} fake runner refused unsafe input: ${inputCheck.reason}`);
      }

      const outputText = `${agent} fake ${capability} deterministic node output`;
      const artifactType = CAPABILITY_ARTIFACT_TYPES[capability];
      if (artifactType === undefined) {
        throw new Error(`${agent} fake runner: no canonical artifact type for ${capability}`);
      }
      const artifact = buildCapabilityTextArtifact(
        request,
        capability,
        outputText,
        artifactType,
        agent,
      );

      return {
        success: true,
        node: request.node,
        agent,
        output: {
          node: request.node,
          agent,
          result: "capability_completed",
          output_char_count: outputText.length,
          ...fakeCapabilityOutcome(capability),
        },
        artifacts: [artifact],
      };
    },
  };
}

/** Kimi fake runner: owns the four Q1 Kimi primary-role capabilities. */
export function createKimiFakeRunner(): NodeCapabilityFakeRunner {
  return createNodeCapabilityFakeRunner(
    "kimi",
    new Set<NodeCapabilityId>([
      "requirement-intake",
      "solution-design",
      "task-planning",
      "knowledge-sync",
    ]),
    null,
  );
}

/** Hermes fake runner: owns the Q1 formal_verdict and code-review points. */
export function createHermesFakeRunner(): NodeCapabilityFakeRunner {
  return createNodeCapabilityFakeRunner(
    "hermes",
    new Set<NodeCapabilityId>(["solution-gate", "code-review"]),
    "formal_verdict",
  );
}
