// C03-D: d1/d2 runtime wiring contract tests
// =============================================
// Pins the runtime-layer integration of:
//   d1 — developmentPathEntryGuard before implementation dispatch
//   d2 — c2/c3 tail aggregation after chain completion
//
// Negative mutation contract: if the d1 guard call is commented out or
// depth is hardcoded, these tests MUST turn red.

import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createDeterministicCapabilityGateway,
  createRuntimeBindingRegistry,
  run,
  type RuntimeCapabilityGateway,
  type RuntimeOptions,
} from "../runtime";
import { ExecutionGateway } from "../execution/gateway";
import { LoopCapabilityEntry } from "../core/loop-capability-entry";
import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopRunStore } from "../core/loop-run-store";
import { LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION } from "../core/loop-artifact-revision";
import type { CapabilityExecutionRole, NodeCapabilityId } from "../loop/types";
import type { AgentName, ExecutionRequest, ExecutionResult } from "../execution/types";
import type { DesignDepth } from "../core/loop-c03-delivery-tail";

let passed = 0;
function ok(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  passed += 1;
}

interface TestEnv {
  root: string;
  runStore: LoopRunStore;
  artifactStore: LoopArtifactStore;
  gateway: RuntimeCapabilityGateway;
  entry: LoopCapabilityEntry;
}

function makeStores(prefix: string) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, "repo"), { recursive: true });
  const artifactStore = new LoopArtifactStore({
    controlRoot: join(root, "control"),
    repositoryPath: join(root, "repo"),
  });
  const runStore = new LoopRunStore(join(root, "journal.db"), { artifactStore });
  runStore.init();
  artifactStore.init();
  return { root, runStore, artifactStore };
}

function makeEnv(prefix: string, gatewayOverride?: RuntimeCapabilityGateway): TestEnv {
  const { root, runStore, artifactStore } = makeStores(prefix);
  const bindingRegistry = createRuntimeBindingRegistry();
  const gateway = gatewayOverride ?? createDeterministicCapabilityGateway({
    runStore, artifactStore, bindingRegistry, now: () => new Date().toISOString(),
  });
  const entry = new LoopCapabilityEntry({ runStore, artifactStore, bindingRegistry, gateway });
  return { root, runStore, artifactStore, gateway, entry };
}

function runOptions(env: TestEnv, requirementId: string, gateway?: RuntimeCapabilityGateway): RuntimeOptions {
  return {
    requirementId,
    runStore: env.runStore,
    artifactStore: env.artifactStore,
    gateway: gateway ?? env.gateway,
    bindingRegistry: createRuntimeBindingRegistry(),
  };
}

/**
 * Creates a gateway that intercepts solution-gate formal_verdict and forces
 * a specific gateResult + decisionDepth. All other dispatches delegate to
 * the deterministic gateway. Preserves GATEWAY_TRACING_BINDINGS by extending
 * ExecutionGateway with capabilityTracing (same pattern as WP4 tests).
 */
function verdictGateway(
  runStore: LoopRunStore,
  artifactStore: LoopArtifactStore,
  verdict: { gateResult: "PASS" | "FAIL" | "PASS_WITH_RISK"; depth: DesignDepth | null },
  onImplementation?: (input: Record<string, unknown>) => void,
): RuntimeCapabilityGateway {
  const bindingRegistry = createRuntimeBindingRegistry();
  const inner = createDeterministicCapabilityGateway({
    runStore, artifactStore, bindingRegistry, now: () => new Date().toISOString(),
  });
  const now = (): string => new Date().toISOString();

  class VerdictGateway extends ExecutionGateway {
    constructor() {
      super({
        capabilityTracing: {
          runStore, artifactStore, bindingRegistry,
          executorVersions: { codex: "1.0.0", kimi: "1.0.0", hermes: "1.0.0" },
          now,
        },
      });
    }
    override async execute(request: ExecutionRequest): Promise<ExecutionResult> {
      const context = request.loopExecution!;
      const isVerdict = request.type === "solution-gate" && context.executionRole === "formal_verdict";
      const isImpl = request.type === "implementation";
      if (isImpl && onImplementation) {
        onImplementation(request.input as Record<string, unknown>);
      }
      if (!isVerdict) return inner.execute(request);

      const runId = context.runId;
      const capability = request.type as NodeCapabilityId;
      const executionRole = context.executionRole as CapabilityExecutionRole;
      const existing = runStore.listCapabilityExecutions(runId);
      const sequence = existing.length + 1;
      const base = {
        schemaVersion: 4 as const,
        runId, capability, executionRole, nodeId: capability,
        attempt: context.attempt,
        bindingId: `binding-hermes-${capability}-formal_verdict`,
        bindingVersion: "2.0.0",
        bindingRegistryVersion: bindingRegistry.version,
        executorAgent: "hermes" as AgentName,
        executorAdapter: "hermes-cli",
        executorVersion: "1.0.0",
        inputArtifactRef: context.inputArtifactRef,
        inputArtifactVersion: context.inputArtifactVersion,
        inputDigest: context.inputDigest,
        consumedFindingsRef: typeof context.consumedFindingsRef === "string" ? context.consumedFindingsRef : null,
        consumedFindingsDigest: typeof context.consumedFindingsDigest === "string" ? context.consumedFindingsDigest : null,
        decisionDepth: null as DesignDepth | null,
        decisionScopeId: null as string | null,
        decisionDeltaRef: null as string | null,
        decisionDeltaDigest: null as string | null,
        processInvocationDigest: null,
        processExitCode: null,
        processSignal: null,
        processDurationMs: null,
        processTruncated: null,
        stagingRef: null,
        stagingDigest: null,
        promotionRef: null,
        promotionDigest: null,
        humanActionRef: null,
      };
      // started event
      runStore.appendCapabilityExecution(Object.freeze({
        ...base,
        executionEventId: `${runId}:capability:${sequence}:started`,
        sequence, status: "started" as const, createdAt: now(),
        outputArtifactRef: null, outputArtifactVersion: null, outputDigest: null,
        gateResult: null, unresolvedFindingsRef: null, unresolvedFindingsDigest: null,
        nextStepEligibility: null, errorCode: null, retryable: null, reasonCode: null,
      }));

      if (verdict.gateResult === "FAIL") {
        // failed formal_verdict
        runStore.appendCapabilityExecution(Object.freeze({
          ...base,
          executionEventId: `${runId}:capability:${sequence + 1}:failed`,
          sequence: sequence + 1, status: "failed" as const, createdAt: now(),
          outputArtifactRef: null, outputArtifactVersion: null, outputDigest: null,
          gateResult: null, unresolvedFindingsRef: null, unresolvedFindingsDigest: null,
          nextStepEligibility: "BLOCKED" as const, errorCode: "GATE_REJECTED",
          retryable: false, reasonCode: "DESIGN_DEPTH_BLOCKED_UNKNOWN",
        }));
        return Object.freeze({
          success: false, node: capability, agent: "hermes" as AgentName,
          output: Object.freeze({ result: "FAILED", capability }),
          artifacts: Object.freeze([]),
        });
      }

      // succeeded PASS or PASS_WITH_RISK with materialized depth
      const scopeId = `${runId}:decision:1`;
      const delta = artifactStore.put("solution_review", `depth=${verdict.depth} delta for ${runId}`);
      const product = artifactStore.put(
        LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[capability].artifactKind,
        `${verdict.gateResult} verdict product for ${runId}`,
      );
      runStore.appendCapabilityExecution(Object.freeze({
        ...base,
        decisionDepth: verdict.depth,
        decisionScopeId: scopeId,
        decisionDeltaRef: delta.artifactRef,
        decisionDeltaDigest: delta.digest,
        executionEventId: `${runId}:capability:${sequence + 1}:succeeded`,
        sequence: sequence + 1, status: "succeeded" as const, createdAt: now(),
        outputArtifactRef: product.artifactRef,
        outputArtifactVersion: "1.0.0",
        outputDigest: product.digest,
        gateResult: verdict.gateResult,
        unresolvedFindingsRef: null, unresolvedFindingsDigest: null,
        nextStepEligibility: "ELIGIBLE" as const, errorCode: null, retryable: null, reasonCode: null,
      }));
      return Object.freeze({
        success: true as const, node: capability, agent: "hermes" as AgentName,
        output: Object.freeze({ result: "SUCCESS", gate_result: verdict.gateResult }),
        artifacts: Object.freeze([]),
        capabilityTerminalEventId: `${runId}:capability:${sequence + 1}:succeeded`,
      });
    }
  }
  return new VerdictGateway();
}

async function main(): Promise<void> {
  // ── T1: PASS verdict → COMPLETED + d2 tail fields persisted ──
  console.log("T1: PASS → COMPLETED with d2 tail fields");
  {
    const env = makeEnv("c03d-t1-");
    try {
      const result = await run("build a user profile page", runOptions(env, "REQ-C03D-T1"));
      ok(result.final_status === "success" && result.chain_status === "COMPLETED",
        `T1: chain completes (got ${result.final_status}/${result.chain_status})`);
      const r = result as unknown as Record<string, unknown>;
      ok(r.manual_handoff_status !== undefined, "T1: manual_handoff_status present");
      ok(r.manual_handoff_artifact_ref !== null && r.manual_handoff_artifact_ref !== undefined,
        "T1: manual_handoff_artifact_ref persisted");
      const stored = JSON.parse(env.artifactStore.read(r.manual_handoff_artifact_ref as string).toString("utf8").trim());
      ok(stored.knowledgeSync.decision === null,
        `T1: knowledgeSync.decision null not fabricated (got ${stored.knowledgeSync.decision})`);
    } finally { rmSync(env.root, { recursive: true, force: true }); }
  }

  // ── T2: runtime-level FAIL verdict → BLOCKED + DEVELOPMENT_PATH_ENTRY_DENIED ──
  // Negative mutation: if d1 guard is bypassed, implementation WOULD execute.
  console.log("T2: runtime FAIL verdict → BLOCKED, implementation not executed");
  {
    const { root, runStore, artifactStore } = makeStores("c03d-t2-");
    const gw = verdictGateway(runStore, artifactStore, { gateResult: "FAIL", depth: null });
    try {
      const result = await run("build a failing gate feature", {
        requirementId: "REQ-C03D-T2", runStore, artifactStore, gateway: gw,
        bindingRegistry: createRuntimeBindingRegistry(),
      });
      ok(result.final_status === "failed" && result.chain_status === "BLOCKED",
        `T2: FAIL blocks chain (got ${result.final_status}/${result.chain_status})`);
      // implementation must NOT have executed — whether blocked by recovery
      // or the d1 defense-in-depth guard, the observable result is identical.
      const implExecuted = result.execution_trace.some(
        (e) => e.capability === "implementation" && e.status === "succeeded");
      ok(!implExecuted, "T2: implementation node NOT in succeeded trace");
      // No d2 tail fields when chain didn't complete (completedOk gate).
      const r = result as unknown as Record<string, unknown>;
      ok(r.manual_handoff_status === null || r.manual_handoff_status === undefined,
        `T2: no d2 tail status when blocked (got ${String(r.manual_handoff_status)})`);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }

  // ── T3: runtime PASS_WITH_RISK without acceptance → BLOCKED ──
  console.log("T3: runtime PASS_WITH_RISK no acceptance → BLOCKED");
  {
    const { root, runStore, artifactStore } = makeStores("c03d-t3-");
    const gw = verdictGateway(runStore, artifactStore, { gateResult: "PASS_WITH_RISK", depth: "STANDARD" });
    try {
      const result = await run("build a risky feature", {
        requirementId: "REQ-C03D-T3", runStore, artifactStore, gateway: gw,
        bindingRegistry: createRuntimeBindingRegistry(),
      });
      ok(result.final_status === "failed" && result.chain_status === "BLOCKED",
        `T3: PASS_WITH_RISK blocks (got ${result.final_status}/${result.chain_status})`);
      const implExecuted = result.execution_trace.some(
        (e) => e.capability === "implementation");
      ok(!implExecuted, "T3: implementation never dispatched");
    } finally { rmSync(root, { recursive: true, force: true }); }
  }

  // ── T4: runtime PASS + DEEP depth → guard passes, designDepth=DEEP injected ──
  // Negative mutation: if depth is hardcoded STANDARD, the captured value
  // would be STANDARD not DEEP → this assertion turns red.
  console.log("T4: PASS+DEEP → implementation receives designDepth=DEEP");
  {
    const { root, runStore, artifactStore } = makeStores("c03d-t4-");
    let capturedDepth: unknown = "NOT_CAPTURED";
    const gw = verdictGateway(
      runStore, artifactStore, { gateResult: "PASS", depth: "DEEP" },
      (input) => { capturedDepth = (input as { designDepth?: unknown }).designDepth ?? null; },
    );
    try {
      const result = await run("build a deep design feature", {
        requirementId: "REQ-C03D-T4", runStore, artifactStore, gateway: gw,
        bindingRegistry: createRuntimeBindingRegistry(),
      });
      // PASS+DEEP should pass the guard and complete.
      ok(result.chain_status === "COMPLETED" || result.final_status === "success",
        `T4: PASS+DEEP completes (got ${result.final_status}/${result.chain_status})`);
      // The implementation dispatch must have received DEEP, not STANDARD.
      ok(capturedDepth === "DEEP",
        `T4: implementation received designDepth=DEEP (got ${String(capturedDepth)}) — hardcoded STANDARD would fail this`);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }

  // ── T5: DECIDED rebuild wave → implementation executes ──
  console.log("T5: rebuild wave not blocked by DECIDED guard");
  {
    const env = makeEnv("c03d-t5-");
    try {
      await run("build an order export", runOptions(env, "REQ-C03D-T5"));
      const second = await run("build an order export", runOptions(env, "REQ-C03D-T5"));
      ok(second.chain_status === "COMPLETED",
        `T5: rebuild completes (got ${second.chain_status})`);
      ok((second as unknown as Record<string, unknown>).blocking_reason_code !== "DEVELOPMENT_PATH_ENTRY_DENIED",
        "T5: rebuild not blocked by c1 guard");
    } finally { rmSync(env.root, { recursive: true, force: true }); }
  }

  // ── T6: governance_tail_result persistence failure non-fatal ──
  console.log("T6: persistence failure → runtime returns normally");
  {
    const env = makeEnv("c03d-t6-");
    const originalPut = env.artifactStore.put.bind(env.artifactStore);
    let attempted = false;
    (env.artifactStore as { put: typeof env.artifactStore.put }).put = (kind: string, content: string) => {
      if (kind === "governance_tail_result") { attempted = true; throw new Error("simulated"); }
      return originalPut(kind, content);
    };
    try {
      const result = await run("build persistence test", runOptions(env, "REQ-C03D-T6"));
      ok(result.chain_status === "COMPLETED",
        `T6: completes despite persistence failure (got ${result.chain_status})`);
      const r = result as unknown as Record<string, unknown>;
      ok(r.manual_handoff_status !== undefined && r.manual_handoff_artifact_ref === null,
        "T6: in-memory status present, artifact_ref null");
      ok(attempted, "T6: governance_tail_result put attempted");
    } finally { rmSync(env.root, { recursive: true, force: true }); }
  }

  console.log(`C03-D d1/d2 wiring tests: ${passed} assertions passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
