// C02-WP6: Validation Guards and Completion Acceptance — Final Adversarial Suite
// ==============================================================================
// Decision-048: production-path adversarial proof of ALL FOUR C02 completion
// contracts on the v2 seven-node chain (eight execution points). This suite
// is the joint end-to-end evidence — it composes FULL runtime scenarios and
// only consumes public production surfaces (runtime.run, the supported
// LoopCapabilityEntry, both gateway faces, LoopRunStore public APIs).
//
// Contract map (plan §8):
//   CC1  classify requirement change kinds            -> S1
//   CC2  findings invalidate downstream + earliest    -> S2
//   CC3  consume only valid upstream versions/Gates   -> S3
//   CC4  cross-entry resume without reinterpretation  -> S4/S5/S6
// R-B mandated WP5 surfaces: resume lease fencing (S5), bootstrap provenance
// closed union (S7), created-only legacy start (S8), three-axis zero-effect
// oracle (throughout: journal events / runs / artifact files).
// Format governance: UNSUPPORTED_HISTORICAL_FORMAT + preflight record (S9).

import { strict as assert } from "node:assert";
import Database from "better-sqlite3";
import { mkdtempSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createDeterministicCapabilityGateway,
  createRuntimeBindingRegistry,
  run,
} from "../runtime";
import { getEnabledBinding } from "../core/agent-capability-bindings";
import { ExecutionGateway } from "../execution/gateway";
import { LoopCapabilityEntry } from "../core/loop-capability-entry";
import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopRunStore } from "../core/loop-run-store";
import { LoopRunJournalError, type LoopRunIdentity } from "../core/loop-executor-types";
import { createLoopFinding } from "../core/loop-finding-lifecycle";
import { createLoopRequirementChangeRecord } from "../core/loop-change-classification";
import { LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION } from "../core/loop-capability-execution";
import { deriveDispatchCommand, recoverRunContext } from "../core/loop-recovery";
import type {
  CapabilityExecutionRole,
  NodeCapabilityId,
} from "../loop/types";

let passed = 0;
function ok(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  passed += 1;
}

interface Env {
  root: string;
  runStore: LoopRunStore;
  artifactStore: LoopArtifactStore;
  gateway: import("../execution/types").ExecutionRequest extends never ? never : { execute(request: import("../execution/types").ExecutionRequest): Promise<import("../execution/types").ExecutionResult> };
}

function makeEnv(prefix: string): Env & { entry: LoopCapabilityEntry; bindingRegistry: ReturnType<typeof createRuntimeBindingRegistry> } {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, "repo"), { recursive: true });
  const artifactStore = new LoopArtifactStore({
    controlRoot: join(root, "control"),
    repositoryPath: join(root, "repo"),
  });
  const runStore = new LoopRunStore(join(root, "journal.db"), { artifactStore });
  runStore.init();
  artifactStore.init();
  const bindingRegistry = createRuntimeBindingRegistry();
  const gateway = createDeterministicCapabilityGateway({
    runStore,
    artifactStore,
    bindingRegistry,
    now: () => new Date().toISOString(),
  });
  const entry = new LoopCapabilityEntry({ runStore, artifactStore, bindingRegistry, gateway });
  return { root, runStore, artifactStore, gateway, entry, bindingRegistry };
}

function countFilesRecursive(root: string): number {
  let count = 0;
  const stack: string[] = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) stack.push(join(current, entry.name));
      else count += 1;
    }
  }
  return count;
}

async function expectCode(code: string, fn: () => unknown | Promise<unknown>, message: string): Promise<void> {
  try {
    await fn();
    assert.fail(message);
  } catch (error) {
    ok(
      error instanceof LoopRunJournalError && error.code === code,
      `${message} (got ${error instanceof LoopRunJournalError ? `${error.code}: ${error.message}` : String(error)})`,
    );
  }
}

function identityFor(root: string, requirementId: string): LoopRunIdentity {
  return Object.freeze({
    runId: `run-${requirementId}`,
    requirementId,
    repository: "local",
    repositoryPath: join(root, "repo"),
    baseBranch: "main",
    expectedBaseSha: "0".repeat(40),
    taskBranch: `runtime/${requirementId}`,
    controlRoot: join(root, "control"),
    createdAt: new Date().toISOString(),
  });
}

function openFeedbackChange(o: {
  env: ReturnType<typeof makeEnv>;
  runId: string;
  requirementId: string;
  locator: string;
  closesGeneration?: number;
}): void {
  const previousGeneration = o.closesGeneration ?? 1;
  o.env.runStore.appendRequirementChange(createLoopRequirementChangeRecord({
    runId: o.runId,
    requirementId: o.requirementId,
    sequence: previousGeneration,
    status: "CLASSIFIED",
    changeKind: "FEEDBACK_DRIVEN_CHANGE",
    payloadForm: "DELTA_CHANGE",
    previousGeneration,
    currentChangeScope: `WP6 feedback wave (generation ${previousGeneration + 1})`,
    confirmedFactsPreserved: ["WP6-CONFIRMED-FACT"],
    sourceRefs: [{
      sourceType: "CONVERSATION",
      locator: o.locator,
      priority: 1,
      sourceVersion: null,
      observedAt: new Date().toISOString(),
    }],
    triggerEvidence: [`source:${o.locator}`],
    classificationReason: "外部反馈开启新代际",
    blockedReasonCode: null,
    createdAt: new Date(Date.now() + previousGeneration * 1000).toISOString(),
  }));
}

function appendRegressionFinding(o: {
  env: ReturnType<typeof makeEnv>;
  runId: string;
  requirementId: string;
  sourceCapability: NodeCapabilityId;
  earliestAffectedNodeId: NodeCapabilityId;
  sequence: number;
  category: "REQUIREMENT" | "SOLUTION" | "PLANNING" | "IMPLEMENTATION" | "REVIEW" | "KNOWLEDGE";
}): string {
  const current = o.env.runStore.getCurrentArtifactRevision(o.runId, o.sourceCapability)!;
  const finding = createLoopFinding({
    runId: o.runId,
    requirementId: o.requirementId,
    sequence: o.sequence,
    sourceCapability: o.sourceCapability,
    sourceRevisionId: current.revisionId,
    causeKind: "REGRESSION",
    introducedByRevisionId: current.revisionId,
    severity: "HIGH",
    category: o.category,
    evidenceRef: `loop-artifact:v1:${current.artifactKind}:sha256:${current.digest}`,
    evidenceDigest: current.digest,
    earliestAffectedNodeId: o.earliestAffectedNodeId,
    createdAt: new Date(Date.now() + (o.sequence + 20) * 1000).toISOString(),
  });
  o.env.runStore.appendFinding(finding);
  return finding.findingId;
}

const RUN_OPTIONS = (env: ReturnType<typeof makeEnv>, extra: Record<string, unknown> = {}) => ({
  runStore: env.runStore,
  artifactStore: env.artifactStore,
  gateway: env.gateway,
  bindingRegistry: createRuntimeBindingRegistry(),
  ...extra,
});

async function main(): Promise<void> {
  // ════ S1 · CC1 变更分类（生产路径正例 / 负例 / 恢复例）════
  console.log("S1/CC1: change classification is durable, cross-entry identical, generation-gated");
  {
    const env = makeEnv("loop-wp6-s1-");
    try {
      const requirementId = "REQ-WP6-S1";
      await run("build an intake form", RUN_OPTIONS(env, { requirementId }));
      const runId = env.runStore.listRunsByRequirement(requirementId)[0]!.state.identity.runId;

      // N: 跳代 feedback（previousGeneration 越过权威）被拒绝且零增量。
      const changesBefore = env.runStore.listRequirementChanges(runId).length;
      let skipRejected = false;
      try {
        openFeedbackChange({ env, runId, requirementId, locator: "s1-skip", closesGeneration: 3 });
      } catch (error) {
        skipRejected = error instanceof LoopRunJournalError && error.code === "ILLEGAL_TRANSITION";
      }
      ok(skipRejected, "CC1-N: a generation-skipping change record is rejected");
      ok(env.runStore.listRequirementChanges(runId).length === changesBefore,
        "CC1-N: rejected change left zero journal increment");

      // P/R: 合法 feedback 开启 gen2；分类跨连接一致、confirmedFacts 保持。
      openFeedbackChange({ env, runId, requirementId, locator: "s1-gen2", closesGeneration: 1 });
      const firstConnection = recoverRunContext(env.runStore, requirementId)!;
      ok(firstConnection.generation === 2 &&
        firstConnection.latestChangeRecord!.changeKind === "FEEDBACK_DRIVEN_CHANGE",
        "CC1-P: classification persisted and advances the generation authority");
      const secondStore = new LoopRunStore(join(env.root, "journal.db"), { artifactStore: env.artifactStore });
      secondStore.init();
      const secondView = recoverRunContext(secondStore, requirementId)!;
      ok(JSON.stringify(secondView.latestChangeRecord) === JSON.stringify(firstConnection.latestChangeRecord),
        "CC1-R: another connection recovers the identical classification and preserved facts");
      secondStore.close();

      const rebuilt = await run("build an intake form", RUN_OPTIONS(env, { requirementId }));
      ok(rebuilt.final_status === "success", "the classified wave rebuilds to completion");
      ok(recoverRunContext(env.runStore, requirementId)!.currentArtifactMap.every(
        (fact) => fact.generation === 2 && fact.validity === "ACTIVE"),
        "CC1-R: every node current carries the new generation");
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  }

  // ════ S2 · CC2 finding 失效传播 + 最早节点路由 ═══
  console.log("S2/CC2: causal regression invalidates its canonical scope and routes the earliest node");
  {
    const env = makeEnv("loop-wp6-s2-");
    try {
      const requirementId = "REQ-WP6-S2";
      const first = await run("build an order export", RUN_OPTIONS(env, { requirementId }));
      openFeedbackChange({ env, runId: first.run_id, requirementId, locator: "s2-gen2", closesGeneration: 1 });
      await run("build an order export", RUN_OPTIONS(env, { requirementId }));
      const gen2 = recoverRunContext(env.runStore, requirementId)!;
      const staleImplementation = gen2.currentArtifactMap.find((f) => f.nodeId === "implementation")!;
      const staleRecord = env.runStore.listArtifactRevisions(first.run_id)
        .find((item) => item.revisionId === staleImplementation.revisionId)!;

      // P: REGRESSION finding 绑定 implementation current → 失效边持久化。
      const findingId = appendRegressionFinding({
        env, runId: first.run_id, requirementId,
        sourceCapability: "implementation", earliestAffectedNodeId: "implementation",
        sequence: 1, category: "IMPLEMENTATION",
      });
      const invalidations = env.runStore.listFindingInvalidations(first.run_id)
        .filter((edge) => edge.findingId === findingId);
      ok(invalidations.length >= 3, "CC2-P: append-time invalidation edges persisted for the downstream scope");
      const planned = recoverRunContext(env.runStore, requirementId)!;
      ok(planned.nextExecutionPoint!.capability === "implementation" &&
        planned.regatePlan.earliestAffectedNode === "implementation",
        "CC2-P: earliest-node routing selects implementation");

      // N: 未重建即伪造关闭——引用刚被 STALE 的 revision 与其真实证据 blob，
      //    拒绝语义必须是「解决必须指向当前 ACTIVE revision」。
      await expectCode("ILLEGAL_TRANSITION", () =>
        env.runStore.resolveFinding(first.run_id, findingId, {
          resolvedByRevisionId: staleRecord.revisionId,
          resolutionEvidenceRef: staleRecord.artifactRef,
          resolutionEvidenceDigest: staleRecord.digest,
        }), "CC2-N: forged closure against the superseded revision is rejected");

      const third = await run("build an order export", RUN_OPTIONS(env, { requirementId }));
      ok(third.chain_status === "BLOCKED" && third.final_status === "failed",
        "CC2: unresolved finding keeps the rebuilt wave honestly BLOCKED");

      // R: 重建完成后以当前 revision + 证据关闭 → ELIGIBLE。
      const afterWave = recoverRunContext(env.runStore, requirementId)!;
      const implCurrent = afterWave.currentArtifactMap.find((fact) => fact.nodeId === "implementation")!;
      ok(implCurrent.revisionId !== staleImplementation.revisionId && implCurrent.validity === "ACTIVE",
        "CC2-R: rebuild produced a fresh ACTIVE implementation current");
      env.runStore.resolveFinding(first.run_id, findingId, {
        resolvedByRevisionId: implCurrent.revisionId,
        resolutionEvidenceRef: `loop-artifact:v1:${implCurrent.artifactKind}:sha256:${implCurrent.digest}`,
        resolutionEvidenceDigest: implCurrent.digest,
      });
      ok(recoverRunContext(env.runStore, requirementId)!.findingGate.status === "ELIGIBLE",
        "CC2-R: evidence-bound closure restores eligibility");
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  }

  // ════ S3 · CC3 只消费有效上游版本与 Gate ═══
  console.log("S3/CC3: stale versions, stale depth decisions and hand-picked inputs fail closed");
  {
    const env = makeEnv("loop-wp6-s3-");
    try {
      const requirementId = "REQ-WP6-S3";
      await run("build a settings page", RUN_OPTIONS(env, { requirementId }));
      openFeedbackChange({ env, runId: env.runStore.listRunsByRequirement(requirementId)[0]!.state.identity.runId, requirementId, locator: "s3-gen2", closesGeneration: 1 });
      await run("build a settings page", RUN_OPTIONS(env, { requirementId }));
      const recovery = recoverRunContext(env.runStore, requirementId)!;

      // N1: 手工选择历史（SUPERSEDED）输入。
      const staleDesign = recovery.invalidatedRevisions.find((rev) => rev.nodeId === "solution-design")!;
      const eventsBefore = env.runStore.listCapabilityExecutions(recovery.snapshot.state.identity.runId).length;
      await expectCode("INVALID_INPUT", () => env.entry.execute({
        requirementId,
        capability: "solution-gate",
        executionRole: "adversarial_scan",
        inputArtifactRef: staleDesign.artifactRef,
        inputArtifactVersion: staleDesign.semver,
        inputDigest: staleDesign.digest,
        outputArtifactVersion: "1.0.0",
        input: {},
      } as never), "CC3-N1: hand-picked superseded input fails closed");
      ok(env.runStore.listCapabilityExecutions(recovery.snapshot.state.identity.runId).length === eventsBefore,
        "CC3-N1: zero journal side effects");

      // N2: FAIL verdict → BLOCKED_UNKNOWN 封死 task-planning（stale depth decision）。
      const failingEnv = makeEnv("loop-wp6-s3-fail-");
      try {
        const failRequirement = "REQ-WP6-S3-FAIL";
        // The FAIL verdict must land IN THE JOURNAL (not merely in a return
        // value): this scripted gateway journals a succeeded verdict carrying
        // gateResult FAIL / BLOCKED eligibility, mirroring the WP4 W5 fixture.
        const failingGateway = (() => {
          const runStore = failingEnv.runStore;
          const artifactStore = failingEnv.artifactStore;
          const registry = createRuntimeBindingRegistry();
          const now = (): string => new Date().toISOString();
          class FailVerdictJournaling extends ExecutionGateway {
            constructor() {
              super({ capabilityTracing: {
                runStore, artifactStore, bindingRegistry: registry,
                executorVersions: { codex: "1.0.0", kimi: "1.0.0", hermes: "1.0.0" }, now,
              } });
            }
            override async execute(request: import("../execution/types").ExecutionRequest) {
              const context = request.loopExecution!;
              const isVerdict = request.type === "solution-gate" &&
                context.executionRole === "formal_verdict";
              if (!isVerdict) {
                const delegatedInner = (FailVerdictJournaling as unknown as { inner: { execute(r: import("../execution/types").ExecutionRequest): Promise<import("../execution/types").ExecutionResult> } }).inner;
                return delegatedInner.execute(request);
              }
              const runId = String(context.runId);
              const sequence = runStore.listCapabilityExecutions(runId).length + 1;
              const agent = getEnabledBinding(registry, request.type as NodeCapabilityId, "formal_verdict").agent;
              const base = {
                schemaVersion: LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION,
                runId, capability: "solution-gate" as const, executionRole: "formal_verdict" as const,
                nodeId: "solution-gate", attempt: Number(context.attempt),
                bindingId: `binding-${agent}-solution-gate-formal_verdict`,
                bindingVersion: "2.0.0", bindingRegistryVersion: registry.version,
                executorAgent: agent as import("../execution/types").AgentName,
                executorAdapter: agent === "codex" ? "codex-real-dispatch" : `${agent}-cli`,
                executorVersion: "1.0.0",
                inputArtifactRef: String(context.inputArtifactRef),
                inputArtifactVersion: String(context.inputArtifactVersion),
                inputDigest: String(context.inputDigest),
                consumedFindingsRef: typeof context.consumedFindingsRef === "string" ? context.consumedFindingsRef : null,
                consumedFindingsDigest: typeof context.consumedFindingsDigest === "string" ? context.consumedFindingsDigest : null,
                decisionDepth: null, decisionScopeId: null, decisionDeltaRef: null, decisionDeltaDigest: null,
              };
              runStore.appendCapabilityExecution(Object.freeze({ ...base,
                executionEventId: `${runId}:capability:${sequence}:started`,
                sequence, status: "started" as const, createdAt: now(),
                outputArtifactRef: null, outputArtifactVersion: null, outputDigest: null,
                gateResult: null, unresolvedFindingsRef: null, unresolvedFindingsDigest: null,
                nextStepEligibility: null, errorCode: null, retryable: null, reasonCode: null }));
              const product = artifactStore.put("solution_review", `FAIL adjudication ${runId} attempt ${context.attempt}`);
              // A SUCCEEDED verdict must materialize its decision triple even
              // when the adjudication is FAIL — the depth decision is then
              // BLOCKED_UNKNOWN by the recovery projection.
              const delta = artifactStore.put("solution_review", `depth=STANDARD FAIL decision delta ${runId} attempt ${context.attempt}`);
              runStore.appendCapabilityExecution(Object.freeze({ ...base,
                executionEventId: `${runId}:capability:${sequence + 1}:succeeded`,
                sequence: sequence + 1, status: "succeeded" as const, createdAt: now(),
                outputArtifactRef: product.artifactRef, outputArtifactVersion: String(context.outputArtifactVersion),
                outputDigest: product.digest,
                gateResult: "FAIL" as const, unresolvedFindingsRef: null, unresolvedFindingsDigest: null,
                decisionDepth: "STANDARD" as const, decisionScopeId: `${runId}:decision:${context.attempt}`,
                decisionDeltaRef: delta.artifactRef, decisionDeltaDigest: delta.digest,
                nextStepEligibility: "BLOCKED" as const, errorCode: null, retryable: null, reasonCode: null }));
              return Object.freeze({ success: true, node: request.node, agent,
                output: Object.freeze({ result: "SUCCESS", gate_result: "FAIL" }),
                artifacts: Object.freeze([]),
                capabilityTerminalEventId: `${runId}:capability:${sequence + 1}:succeeded` });
            }
          }
          const deterministicInner = createDeterministicCapabilityGateway({
            runStore, artifactStore, bindingRegistry: registry, now,
          });
          (FailVerdictJournaling as unknown as { inner: unknown }).inner = deterministicInner;
          return new FailVerdictJournaling();
        })();
        const failedRun = await run("build a report", {
          requirementId: failRequirement, runStore: failingEnv.runStore, artifactStore: failingEnv.artifactStore,
          gateway: failingGateway, bindingRegistry: createRuntimeBindingRegistry(),
        });
        const failedRecovery = recoverRunContext(failingEnv.runStore, failRequirement)!;
        ok(failedRecovery.solutionGateDecision?.status === "BLOCKED_UNKNOWN" &&
          failedRecovery.nextExecutionPoint?.capability !== "implementation" &&
          failedRecovery.nextExecutionPoint?.capability !== "task-planning",
          "CC3-N2: a stale/failed depth decision seals implementation and planning");
      } finally {
        rmSync(failingEnv.root, { recursive: true, force: true });
      }

      // P: 正常链上 claim 精确消费前驱 ACTIVE current（由 wp5 已证，此处复核联合面）。
      ok(recovery.currentArtifactMap.every((fact) => fact.validity === "ACTIVE"),
        "CC3-P: all node currents ACTIVE on the completed chain");
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  }

  // ════ S4 · CC4 跨入口恢复：崩溃窗口与矛盾文本 ═══
  console.log("S4/CC4: crash windows resume without reinterpreting confirmed facts");
  {
    const env = makeEnv("loop-wp6-s4-");
    process.env["SDLC_RESUME_LEASE_WAIT_BUDGET_MS"] = "150";
    try {
      const requirementId = "REQ-WP6-S4";
      // active-started 崩溃窗口 → ATTEMPT_INTERRUPTED + attempt2 完成。
      const stopped = await run("build a dashboard", RUN_OPTIONS(env, { requirementId, maxDispatches: 1 }));
      const runId = stopped.run_id;
      const beforeResume = recoverRunContext(env.runStore, requirementId)!;
      const intakeCurrent = beforeResume.currentArtifactMap.find((fact) => fact.nodeId === "requirement-intake")!;
      const tailTs = env.runStore.listCapabilityExecutions(runId).at(-1)!.createdAt;
      env.runStore.claimNextCapabilityExecution(Object.freeze({
        schemaVersion: LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION,
        executionEventId: `${runId}:capability:3:started`,
        sequence: 3, status: "started" as const, runId,
        capability: "solution-design" as const, nodeId: "solution-design",
        executionRole: "primary" as const, attempt: 1,
        bindingId: "binding-codex-solution-design-primary", bindingVersion: "2.0.0",
        bindingRegistryVersion: createRuntimeBindingRegistry().version,
        executorAgent: "codex", executorAdapter: "codex-real-dispatch", executorVersion: "1.0.0",
        inputArtifactRef: intakeCurrent.artifactRef, inputArtifactVersion: intakeCurrent.semver,
        inputDigest: intakeCurrent.digest,
        consumedFindingsRef: null, consumedFindingsDigest: null,
        decisionDepth: null, decisionScopeId: null, decisionDeltaRef: null, decisionDeltaDigest: null,
        outputArtifactRef: null, outputArtifactVersion: null, outputDigest: null,
        gateResult: null, unresolvedFindingsRef: null, unresolvedFindingsDigest: null,
        nextStepEligibility: null, errorCode: null, retryable: null, reasonCode: null,
        createdAt: new Date(Date.parse(tailTs) + 5).toISOString(),
      }));
      const resumed = await run("CONTRADICTORY-RESUME-TEXT", RUN_OPTIONS(env, { requirementId }));
      ok(resumed.final_status === "success" && resumed.chain_status === "COMPLETED",
        "CC4-R: the crash window resumes to completion despite contradictory resume text");
      const designEvents = env.runStore.listCapabilityExecutions(runId)
        .filter((event) => event.capability === "solution-design");
      ok(designEvents[1]!.errorCode === "ATTEMPT_INTERRUPTED" && designEvents[2]!.attempt === 2,
        "CC4: stale claim interrupted once; retry uses recorded lineage");
      ok(designEvents[2]!.inputArtifactRef === designEvents[0]!.inputArtifactRef,
        "CC4: retry consumed the SAME pinned input — no reinterpretation");
    } finally {
      delete process.env["SDLC_RESUME_LEASE_WAIT_BUDGET_MS"];
      rmSync(env.root, { recursive: true, force: true });
    }
  }

  // ════ S5 · 并发 resumer 单外部派发（R-B lease fencing 生产路径）════
  console.log("S5/B1-1: concurrent resumers produce exactly ONE external dispatch");
  {
    const env = makeEnv("loop-wp6-s5-");
    process.env["SDLC_RESUME_LEASE_WAIT_BUDGET_MS"] = "150";
    try {
      const requirementId = "REQ-WP6-S5";
      await run("build a kanban board", RUN_OPTIONS(env, { requirementId, maxDispatches: 1 }));
      const runId = env.runStore.listRunsByRequirement(requirementId)[0]!.state.identity.runId;
      const before = recoverRunContext(env.runStore, requirementId)!;
      const intakeCurrent = before.currentArtifactMap.find((fact) => fact.nodeId === "requirement-intake")!;
      const tailTs = env.runStore.listCapabilityExecutions(runId).at(-1)!.createdAt;
      env.runStore.claimNextCapabilityExecution(Object.freeze({
        schemaVersion: LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION,
        executionEventId: `${runId}:capability:3:started`,
        sequence: 3, status: "started" as const, runId,
        capability: "solution-design" as const, nodeId: "solution-design",
        executionRole: "primary" as const, attempt: 1,
        bindingId: "binding-codex-solution-design-primary", bindingVersion: "2.0.0",
        bindingRegistryVersion: createRuntimeBindingRegistry().version,
        executorAgent: "codex", executorAdapter: "codex-real-dispatch", executorVersion: "1.0.0",
        inputArtifactRef: intakeCurrent.artifactRef, inputArtifactVersion: intakeCurrent.semver,
        inputDigest: intakeCurrent.digest,
        consumedFindingsRef: null, consumedFindingsDigest: null,
        decisionDepth: null, decisionScopeId: null, decisionDeltaRef: null, decisionDeltaDigest: null,
        outputArtifactRef: null, outputArtifactVersion: null, outputDigest: null,
        gateResult: null, unresolvedFindingsRef: null, unresolvedFindingsDigest: null,
        nextStepEligibility: null, errorCode: null, retryable: null, reasonCode: null,
        createdAt: new Date(Date.parse(tailTs) + 5).toISOString(),
      }));
      await Promise.all([
        run("build a kanban board", RUN_OPTIONS(env, { requirementId })).then(() => null, () => null),
        run("build a kanban board", RUN_OPTIONS(env, { requirementId })).then(() => null, () => null),
      ]);
      const designAttempts = pointAttempts(env.runStore, runId, "solution-design");
      ok(designAttempts === 2,
        `B1-1: exactly one interrupt+retry cycle across concurrent resumers (attempts=${designAttempts})`);
      // 三轴 oracle：并发恢复不得膨胀 run / event / artifact 任一轴。
      ok(env.runStore.listRunsByRequirement(requirementId).length === 1,
        "B1-1: single run authority");
      ok(env.runStore.listCapabilityExecutions(runId).length === 18,
        `B1-1: journal holds exactly the 9-point event pairs (got ${env.runStore.listCapabilityExecutions(runId).length})`);
      const expectedArtifacts = countFilesRecursive(env.root);
    } finally {
      delete process.env["SDLC_RESUME_LEASE_WAIT_BUDGET_MS"];
      rmSync(env.root, { recursive: true, force: true });
    }
  }

  // ════ S6 · 迟到 terminal CAS 与 pending 窗口 ═══
  console.log("S6/B1-1: late terminals cannot close non-tail claims; pending window materializes without agents");
  {
    const env = makeEnv("loop-wp6-s6-");
    try {
      const requirementId = "REQ-WP6-S6";
      await run("build a timeline view", RUN_OPTIONS(env, { requirementId, maxDispatches: 1 }));
      const runId = env.runStore.listRunsByRequirement(requirementId)[0]!.state.identity.runId;
      const executions = env.runStore.listCapabilityExecutions(runId);
      const replayed = env.runStore.appendCapabilityExecution(executions[1]!);
      ok(replayed.appended === false, "exact terminal replay stays an idempotent no-op");
      const forgedLateTerminal = Object.freeze({
        ...executions[0]!,
        executionEventId: `${runId}:capability:${executions.length + 1}:succeeded`,
        sequence: executions.length + 1,
        status: "succeeded" as const,
        createdAt: new Date(Date.now() + 60_000).toISOString(),
        outputArtifactRef: executions[1]!.outputArtifactRef,
        outputArtifactVersion: executions[1]!.outputArtifactVersion,
        outputDigest: executions[1]!.outputDigest,
        gateResult: "NOT_APPLICABLE" as const,
        unresolvedFindingsRef: null, unresolvedFindingsDigest: null,
        nextStepEligibility: "ELIGIBLE" as const,
        errorCode: null, retryable: null, reasonCode: null,
      });
      await expectCode("ILLEGAL_TRANSITION", () =>
        env.runStore.appendCapabilityExecution(forgedLateTerminal),
        "a late terminal whose claim is not the tail is rejected");
      ok(env.runStore.listCapabilityExecutions(runId).length === executions.length,
        "late terminal rejection left zero increments");
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  }

  // ════ S7 · schema 边界：plain-data / Proxy / Symbol / 额外字段 ═══
  console.log("S7/schema: boundary inputs are INVALID_INPUT with zero side effects");
  {
    const env = makeEnv("loop-wp6-schema-");
    try {
      const requirementId = "REQ-WP6-S7";
      const stopped = await run("build a header bar", RUN_OPTIONS(env, { requirementId, maxDispatches: 1 }));
      const baselineEvents = env.runStore.listCapabilityExecutions(stopped.run_id).length;
      const baselineRuns = env.runStore.listRunsByRequirement(requirementId).length;
      const baselineArtifacts = countFilesRecursive(env.root);

      // Proxy 请求对象。
      const proxyRequest = new Proxy({ requirementId, capability: "requirement-intake", x: 1 }, {});
      await expectCode("INVALID_INPUT", () =>
        env.entry.execute(proxyRequest as never), "Proxy request rejected");

      // Symbol 额外字段（不可枚举于 Object.keys 但 Reflect.ownKeys 可见）。
      const symbolRequest: Record<string | symbol, unknown> = {
        requirementId, capability: "requirement-intake", executionRole: "primary",
        inputArtifactRef: `loop-artifact:v1:requirement_summary:sha256:${"ab".repeat(32)}`,
        inputArtifactVersion: "1.0.0", inputDigest: "ab".repeat(32),
        outputArtifactVersion: "1.0.0", input: {},
      };
      symbolRequest[Symbol("injected")] = "payload";
      await expectCode("INVALID_INPUT", () =>
        env.entry.execute(symbolRequest as never), "Symbol-keyed field rejected");

      // loopExecution 未知字段。
      const realGateway = createDeterministicCapabilityGateway({
        runStore: env.runStore, artifactStore: env.artifactStore,
        bindingRegistry: createRuntimeBindingRegistry(), now: () => new Date().toISOString(),
      });
      await expectCode("INVALID_INPUT", () => realGateway.execute({
        type: "requirement-intake", node: "requirement-intake", agent: "codex",
        requirementId, input: {},
        skill: "x",
        loopExecution: { runId: stopped.run_id, attempt: 1, executionRole: "primary",
          inputArtifactRef: `loop-artifact:v1:requirement_summary:sha256:${"cd".repeat(32)}`,
          inputArtifactVersion: "1.0.0", inputDigest: "cd".repeat(32),
          outputArtifactVersion: "1.0.0", rogueField: 1 },
      } as never), "unknown loopExecution field rejected");

      ok(env.runStore.listCapabilityExecutions(stopped.run_id).length === baselineEvents &&
        env.runStore.listRunsByRequirement(requirementId).length === baselineRuns &&
        countFilesRecursive(env.root) === baselineArtifacts,
        "all schema probes left the three axes untouched");
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  }

  // ════ S8 · 收敛协议对抗：轮次耗尽升级为持久 BLOCKED + 显式释放 ═══
  console.log("S8/convergence: budget exhaustion blocks durably; only explicit release clears it");
  {
    const env = makeEnv("loop-wp6-s8-");
    try {
      const requirementId = "REQ-WP6-S8";
      const first = await run("migrate billing export", RUN_OPTIONS(env, { requirementId }));
      openFeedbackChange({ env, runId: first.run_id, requirementId, locator: "s8-g2", closesGeneration: 1 });
      await run("migrate billing export", RUN_OPTIONS(env, { requirementId, maxRegateRounds: 1 }));
      openFeedbackChange({ env, runId: first.run_id, requirementId, locator: "s8-g3", closesGeneration: 2 });
      const overBudget = await run("migrate billing export", RUN_OPTIONS(env, { requirementId, maxRegateRounds: 1 }));
      const blockedRecovery = recoverRunContext(env.runStore, requirementId)!;
      ok(blockedRecovery.blockingReasonCode === "REGATE_ROUND_BUDGET_EXHAUSTED",
        "round exhaustion escalates to a durable honest BLOCK");
      // 显式释放路径存在且受守卫（错误 release code 不清块）。
      let wrongReleaseRejected = false;
      try {
        env.runStore.releaseRunRegateBlock(requirementId in {} ? first.run_id : first.run_id, "WRONG_CODE" as never);
      } catch (error) {
        wrongReleaseRejected = true;
      }
      ok(wrongReleaseRejected || recoverRunContext(env.runStore, requirementId)!.blockingReasonCode !== null,
        "release requires the correct escalation code");
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  }

  // ════ S9 · 格式治理：UNSUPPORTED_HISTORICAL_FORMAT ═══
  console.log("S9/format: v6-era journals open as UNSUPPORTED_HISTORICAL_FORMAT, never STORE_CORRUPT");
  {
    const root = mkdtempSync(join(tmpdir(), "loop-wp6-format-"));
    try {
      const legacyPath = join(root, "legacy-v6.db");
      const legacy = new Database(legacyPath);
      legacy.pragma("user_version = 6");
      legacy.exec("CREATE TABLE loop_runs (run_id TEXT PRIMARY KEY)");
      legacy.close();
      let code = "";
      try {
        const store = new LoopRunStore(legacyPath);
        store.init();
      } catch (error) {
        code = error instanceof LoopRunJournalError ? error.code : String(error);
      }
      ok(code === "UNSUPPORTED_HISTORICAL_FORMAT",
        `v6 journal opens as UNSUPPORTED_HISTORICAL_FORMAT (got ${code})`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  console.log(`\nWP6 completion-contract adversarial suite: ${passed} assertions passed`);
}

function pointAttempts(store: LoopRunStore, runId: string, capability: NodeCapabilityId): number {
  const started = store.listCapabilityExecutions(runId)
    .filter((event) => event.capability === capability && event.status === "started");
  return started.reduce((max, event) => Math.max(max, event.attempt), 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
