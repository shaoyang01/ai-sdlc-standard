// C02-WP4: Earliest-Affected-Node Re-Gate Orchestration — Contract Tests
// ======================================================================
// Pins the §8 F row-4 completion contract on the v2 single-rail runner:
//   1. earliest-node routing wins over later findings; upstream confirmed
//      revisions are reused read-only, downstream nodes are rebuilt;
//   2. RESOLVED orchestration: a finding cannot be resolved until its scope
//      has been rebuilt (current ACTIVE again); after the wave it can;
//   3. improvements (MEDIUM/LOW) never restart the chain;
//   4. external feedback re-enters at requirement-intake as a new generation;
//   5. depth decision binding: a FAIL/BLOCKED formal verdict surfaces
//      BLOCKED_UNKNOWN and implementation is never entered;
//   6. skill-isolation invariants (audit CONDITIONAL PASS preconditions):
//      the Re-Gate plan carries no skill/flowId surface, forged skill
//      metadata is rejected or inert, and a generation restart cannot be
//      self-authorized through the supported entry.

import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AgentName } from "../execution/types";

import {
  createDeterministicCapabilityGateway,
  createRuntimeBindingRegistry,
  run,
  type RuntimeCapabilityGateway,
} from "../runtime";
import { LoopCapabilityEntry } from "../core/loop-capability-entry";
import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopRunStore } from "../core/loop-run-store";
import { LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION, createLoopArtifactRevision } from "../core/loop-artifact-revision";
import { LoopRunJournalError } from "../core/loop-executor-types";
import { createLoopFinding } from "../core/loop-finding-lifecycle";
import { createLoopRequirementChangeRecord } from "../core/loop-change-classification";
import { recoverRunContext } from "../core/loop-recovery";
import {
  historicalRestartAuthorized,
  planRegateFromFacts,
  type CurrentRevisionFacts,
  type RegateFindingFacts,
} from "../core/loop-regate";
import {
  LOOP_CAPABILITY_EXECUTION_POINTS,
  NODE_CAPABILITY_IDS,
  type CapabilityExecutionRole,
  type NodeCapabilityId,
} from "../loop/types";

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
  dispatchOrder: ReadonlyArray<{ capability: NodeCapabilityId; executionRole: CapabilityExecutionRole }>;
}

function makeEnv(): TestEnv {
  const root = mkdtempSync(join(tmpdir(), "loop-wp4-regate-"));
  mkdirSync(join(root, "repo"), { recursive: true });
  const artifactStore = new LoopArtifactStore({
    controlRoot: join(root, "control"),
    repositoryPath: join(root, "repo"),
  });
  // Round 2 close-out B1: bind the artifact store so decision-delta and
  // revision blob integrity hold in these scenarios too.
  const runStore = new LoopRunStore(join(root, "journal.db"), { artifactStore });
  runStore.init();
  artifactStore.init();
  const bindingRegistry = createRuntimeBindingRegistry();
  const dispatchOrder: Array<{ capability: NodeCapabilityId; executionRole: CapabilityExecutionRole }> = [];
  const inner = createDeterministicCapabilityGateway({
    runStore,
    artifactStore,
    bindingRegistry,
    now: () => new Date().toISOString(),
  });
  const gateway: RuntimeCapabilityGateway = {
    execute: async (request) => {
      dispatchOrder.push({
        capability: request.type as NodeCapabilityId,
        executionRole: request.loopExecution!.executionRole as CapabilityExecutionRole,
      });
      return inner.execute(request);
    },
  };
  const entry = new LoopCapabilityEntry({ runStore, artifactStore, bindingRegistry, gateway });
  return { root, runStore, artifactStore, gateway, entry, dispatchOrder };
}

function pointDispatchCounts(
  env: TestEnv,
  runId: string,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of env.runStore.listCapabilityExecutions(runId)) {
    if (event.status !== "started") continue;
    const key = `${event.capability}:${event.executionRole}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function futureIso(offsetMs = 5000): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

/**
 * Test-side replica of the runtime's revision recording: binds the last
 * succeeded execution of `capability` as the node's new ACTIVE current.
 */
function recordRevisionForLastSucceeded(
  env: TestEnv,
  runId: string,
  requirementId: string,
  capability: NodeCapabilityId,
): void {
  const produced = env.runStore.listCapabilityExecutions(runId).at(-1)!;
  ok(
    produced.status === "succeeded" && produced.capability === capability,
    "last succeeded event must match the recorded node",
  );
  const priorForNode = env.runStore.listArtifactRevisions(runId)
    .filter((item) => item.nodeId === capability);
  const nodeIdx = NODE_CAPABILITY_IDS.indexOf(capability);
  const upstreamNodeId = nodeIdx > 0 ? NODE_CAPABILITY_IDS[nodeIdx - 1]! : null;
  const upstreamCurrent = upstreamNodeId === null
    ? undefined
    : env.runStore.getCurrentArtifactRevision(runId, upstreamNodeId);
  ok(produced.outputArtifactRef !== null && produced.outputDigest !== null, "output binding present");
  env.runStore.appendArtifactRevision(createLoopArtifactRevision({
    runId,
    requirementId,
    nodeId: capability,
    sequence: priorForNode.length + 1,
    // Round 2 review H3: run feedback-opened generation, not the attempt.
    generation: env.runStore.getRunGeneration(runId),
    stablePath: `library/${requirementId}/${LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[capability].stablePathSegment}/${requirementId}_${capability}.md`,
    artifactKind: LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[capability].artifactKind,
    semver: `${produced.attempt}.0.0`,
    artifactRef: produced.outputArtifactRef!,
    digest: produced.outputDigest!,
    producerExecutionId: produced.executionEventId,
    producerExecutionRole: produced.executionRole,
    gateResult: produced.gateResult,
    upstreamRevisionIds: upstreamCurrent === undefined ? [] : [upstreamCurrent.revisionId],
    createdAt: new Date().toISOString(),
  }));
}

function appendBlockingFinding(env: TestEnv, o: {
  runId: string;
  requirementId: string;
  sourceCapability: NodeCapabilityId;
  earliestAffectedNodeId: NodeCapabilityId;
  severity?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  category: "REQUIREMENT" | "SOLUTION" | "PLANNING" | "IMPLEMENTATION" | "REVIEW" | "KNOWLEDGE";
  sequence: number;
  /** Defaults to REGRESSION bound to the revision it was raised against. */
  causeKind?: "REGRESSION" | "IMPROVEMENT";
}): string {
  const current = env.runStore.getCurrentArtifactRevision(o.runId, o.sourceCapability);
  ok(current !== undefined, `${o.sourceCapability} current revision must exist`);
  const finding = createLoopFinding({
    runId: o.runId,
    requirementId: o.requirementId,
    sequence: o.sequence,
    sourceCapability: o.sourceCapability,
    sourceRevisionId: current!.revisionId,
    // v3 direct causal evidence: a REGRESSION binds the introducing
    // fix-wave revision (the product it was raised against); an
    // IMPROVEMENT carries no introducing revision.
    causeKind: o.causeKind ?? "REGRESSION",
    introducedByRevisionId:
      (o.causeKind ?? "REGRESSION") === "REGRESSION" ? current!.revisionId : null,
    severity: o.severity ?? "HIGH",
    category: o.category,
    evidenceRef: `loop-artifact:v1:${current!.artifactKind}:sha256:${current!.digest}`,
    evidenceDigest: current!.digest,
    earliestAffectedNodeId: o.earliestAffectedNodeId,
    createdAt: futureIso(o.sequence * 1000),
  });
  env.runStore.appendFinding(finding);
  return finding.findingId;
}

/**
 * Round 2 H2 setup: opens generation 2 via a verified FEEDBACK_DRIVEN_CHANGE
 * record so a subsequently appended finding binds to fix-wave products
 * (sequence >= 2) and classifies as a causal regression — making a backward
 * restart at the earliest affected node live-authorized.
 */
function openFeedbackGeneration(env: TestEnv, o: {
  runId: string;
  requirementId: string;
  locator: string;
}): void {
  env.runStore.appendRequirementChange(createLoopRequirementChangeRecord({
    runId: o.runId,
    requirementId: o.requirementId,
    sequence: 1,
    status: "CLASSIFIED",
    changeKind: "FEEDBACK_DRIVEN_CHANGE",
    payloadForm: "DELTA_CHANGE",
    previousGeneration: 1,
    currentChangeScope: "feedback opens generation 2",
    confirmedFactsPreserved: ["small fix behavior stays"],
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
    createdAt: futureIso(1000),
  }));
}

async function main(): Promise<void> {
  // ── W1: solution-design 回流 — reuse upstream, rebuild downstream, then RESOLVED ──
  console.log("W1: solution-design re-gate wave rebuilds downstream and unblocks resolution");
  {
    const env = makeEnv();
    const requirementId = "REQ-WP4-W1";
    const first = await run("build a user registration form", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    ok(first.final_status === "success", "first generation completes");
    ok(first.chain_status === "COMPLETED", "first generation chain COMPLETED");
    const before = pointDispatchCounts(env, first.run_id);
    ok(before.get("solution-design:primary") === 1, "design ran once");

    // Generation 2 is opened by a verified FEEDBACK_DRIVEN_CHANGE record
    // (H3 path): every node is rebuilt once (attempt 2).
    env.runStore.appendRequirementChange(createLoopRequirementChangeRecord({
      runId: first.run_id,
      requirementId,
      sequence: 1,
      status: "CLASSIFIED",
      changeKind: "FEEDBACK_DRIVEN_CHANGE",
      payloadForm: "DELTA_CHANGE",
      previousGeneration: 1,
      currentChangeScope: "外部反馈：注册表单需支持手机号",
      confirmedFactsPreserved: ["email validation stays"],
      sourceRefs: [{
        sourceType: "CONVERSATION",
        locator: "feedback:uat-1",
        priority: 1,
        sourceVersion: null,
        observedAt: new Date().toISOString(),
      }],
      triggerEvidence: ["source:feedback:uat-1"],
      classificationReason: "线下测试反馈经 intake 分类为反馈驱动变更",
      blockedReasonCode: null,
      createdAt: futureIso(1000),
    }));
    const second = await run("build a user registration form", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    ok(second.final_status === "success" && second.chain_status === "COMPLETED", "feedback generation completes");
    const counts2 = pointDispatchCounts(env, second.run_id);
    ok(counts2.get("requirement-intake:primary") === 2 && counts2.get("knowledge-sync:primary") === 2, "full generation 2 rebuilt");

    // Causal regression: a HIGH SOLUTION finding raised AGAINST the gen2 fix
    // product. It re-drives the wave from solution-design; upstream intake
    // is reused read-only.
    const findingId = appendBlockingFinding(env, {
      runId: second.run_id,
      requirementId,
      sourceCapability: "solution-design",
      earliestAffectedNodeId: "solution-design",
      category: "SOLUTION",
      sequence: 1,
    });

    let rejectedBeforeRebuild = false;
    try {
      env.runStore.resolveFinding(second.run_id, findingId, {
        resolvedByRevisionId: env.runStore.getCurrentArtifactRevision(second.run_id, "solution-design")!.revisionId,
        resolutionEvidenceRef: "loop-artifact:v1:solution_review:sha256:deadbeef",
        resolutionEvidenceDigest: "deadbeef",
      });
    } catch (error) {
      rejectedBeforeRebuild = error instanceof LoopRunJournalError;
    }
    ok(rejectedBeforeRebuild, "resolution before rebuild is rejected");

    const third = await run("build a user registration form", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    ok(third.chain_status === "BLOCKED", "open finding keeps the run BLOCKED after rebuild");
    ok(third.final_status === "failed", "unresolved finding prevents success");
    const recoveryAfterWave = recoverRunContext(env.runStore, requirementId)!;
    ok(recoveryAfterWave.findingGate.status === "BLOCKED", "finding gate BLOCKED while open");
    const after = pointDispatchCounts(env, third.run_id);
    ok(after.get("requirement-intake:primary") === 2, "upstream intake reused across the causal wave");
    ok(after.get("solution-design:primary") === 3, "solution-design rebuilt by causal regression");
    ok(after.get("solution-gate:adversarial_scan") === 3, "gate scan rebuilt");
    ok(after.get("solution-gate:formal_verdict") === 3, "gate verdict rebuilt");
    ok(after.get("knowledge-sync:primary") === 3, "knowledge-sync rebuilt");

    const rebuiltDesign = env.runStore.getCurrentArtifactRevision(third.run_id, "solution-design")!;
    ok(rebuiltDesign.validity === "ACTIVE", "rebuilt design revision is ACTIVE");
    const resolved = env.runStore.resolveFinding(third.run_id, findingId, {
      resolvedByRevisionId: rebuiltDesign.revisionId,
      resolutionEvidenceRef: `loop-artifact:v1:${rebuiltDesign.artifactKind}:sha256:${rebuiltDesign.digest}`,
      resolutionEvidenceDigest: rebuiltDesign.digest,
    });
    ok(resolved.record.status === "RESOLVED", "finding resolves after rebuild");
    const fourth = await run("build a user registration form", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    ok(fourth.final_status === "success" && fourth.chain_status === "COMPLETED", "resolved run completes successfully");
    ok(env.runStore.computeFindingGate(fourth.run_id).status === "ELIGIBLE", "finding gate eligible after closure");

    // Round 2 H1 regression: the immutable RESOLVED finding remains valid
    // replay evidence for the historical jump that it originally caused,
    // but it must not authorize a NEW append after the live plan is gone.
    const completedEvents = env.runStore.listCapabilityExecutions(fourth.run_id);
    const priorDesignStart = [...completedEvents].reverse().find(
      (event) => event.status === "started" && event.capability === "solution-design",
    )!;
    const intakeCurrent = env.runStore.getCurrentArtifactRevision(fourth.run_id, "requirement-intake")!;
    let resolvedFindingReauthorized = false;
    let resolvedFindingRejectionCode: string | null = null;
    let resolvedFindingRejectionMessage: string | null = null;
    try {
      env.runStore.appendCapabilityExecution(Object.freeze({
        ...priorDesignStart,
        executionEventId: `${fourth.run_id}:capability:${completedEvents.length + 1}:started`,
        sequence: completedEvents.length + 1,
        attempt: priorDesignStart.attempt + 1,
        createdAt: futureIso(30_000),
        inputArtifactRef: intakeCurrent.artifactRef,
        inputArtifactVersion: intakeCurrent.semver,
        inputDigest: intakeCurrent.digest,
      }));
      resolvedFindingReauthorized = true;
    } catch (error) {
      resolvedFindingRejectionCode = error instanceof LoopRunJournalError ? error.code : null;
      resolvedFindingRejectionMessage = error instanceof Error ? error.message : null;
    }
    ok(
      resolvedFindingRejectionCode === "ILLEGAL_TRANSITION",
      `resolved finding restart fails at the store transition boundary (got ${resolvedFindingRejectionCode}: ${resolvedFindingRejectionMessage})`,
    );
    ok(!resolvedFindingReauthorized, "resolved finding cannot authorize a fresh backward append");
  }

  // ── W2: multi-finding conflict — earliest affected node wins ──
  console.log("W2: conflicting findings route to the canonical earliest node");
  {
    const env = makeEnv();
    const requirementId = "REQ-WP4-W2";
    const first = await run("migrate billing export", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    ok(first.final_status === "success", "gen1 completes");
    // Feedback record opens generation 2 so later findings bind to fix-wave
    // products (sequence >= 2) and classify as causal regressions.
    env.runStore.appendRequirementChange(createLoopRequirementChangeRecord({
      runId: first.run_id,
      requirementId,
      sequence: 1,
      status: "CLASSIFIED",
      changeKind: "FEEDBACK_DRIVEN_CHANGE",
      payloadForm: "DELTA_CHANGE",
      previousGeneration: 1,
      currentChangeScope: "feedback opens generation 2",
      confirmedFactsPreserved: ["billing export stays idempotent"],
      sourceRefs: [{
        sourceType: "CONVERSATION",
        locator: "feedback:w2",
        priority: 1,
        sourceVersion: null,
        observedAt: new Date().toISOString(),
      }],
      triggerEvidence: ["source:feedback:w2"],
      classificationReason: "外部反馈开启新代际",
      blockedReasonCode: null,
      createdAt: new Date(Date.now() + 1000).toISOString(),
    }));
    await run("migrate billing export", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    const orderBefore = env.dispatchOrder.length;
    appendBlockingFinding(env, {
      runId: first.run_id,
      requirementId,
      sourceCapability: "implementation",
      earliestAffectedNodeId: "implementation",
      category: "IMPLEMENTATION",
      sequence: 1,
    });
    appendBlockingFinding(env, {
      runId: first.run_id,
      requirementId,
      sourceCapability: "solution-design",
      earliestAffectedNodeId: "solution-design",
      category: "SOLUTION",
      sequence: 2,
    });
    await run("migrate billing export", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    const firstRedispatch = env.dispatchOrder[orderBefore]!;
    ok(firstRedispatch.capability === "solution-design", `earliest node dispatched first (got ${firstRedispatch.capability})`);
  }

  // ── W3: improvements never restart the chain ──
  console.log("W3: MEDIUM improvement finding does not trigger a Re-Gate wave");
  {
    const env = makeEnv();
    const requirementId = "REQ-WP4-W3";
    const first = await run("add export button", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    const improvementId = appendBlockingFinding(env, {
      runId: first.run_id,
      requirementId,
      sourceCapability: "code-review",
      earliestAffectedNodeId: "code-review",
      severity: "MEDIUM",
      category: "REVIEW",
      sequence: 1,
      causeKind: "IMPROVEMENT",
    });
    // Round 2 semantics: a non-causal improvement (raised against an
    // original-generation product) never re-drives a backward wave.
    const beforeCounts = pointDispatchCounts(env, first.run_id);
    const second = await run("add export button", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    const afterCounts = pointDispatchCounts(env, second.run_id);
    ok(
      NODE_CAPABILITY_IDS.every((node) =>
        (afterCounts.get(`${node}:primary`) ?? 0) === (beforeCounts.get(`${node}:primary`) ?? 0)),
      "improvement does not drive a rebuild wave",
    );
    ok(second.chain_status === "BLOCKED" && second.final_status === "failed", "open improvement keeps run honestly BLOCKED");
  }

  // ── W3b: causality is the DECLARED fact, never the revision sequence ──
  console.log("W3b: causeKind decides waves in both directions");
  {
    // Negative (production path): an IMPROVEMENT raised against a fix-wave
    // product (source revision sequence 2) must not re-drive a backward
    // wave — the sequence heuristic would have misclassified it as causal.
    const envNeg = makeEnv();
    const reqNeg = "REQ-WP4-W3B-NEG";
    const firstNeg = await run("add export button", { requirementId: reqNeg, runStore: envNeg.runStore, artifactStore: envNeg.artifactStore, gateway: envNeg.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    openFeedbackGeneration(envNeg, { runId: firstNeg.run_id, requirementId: reqNeg, locator: "feedback:w3b-neg" });
    await run("add export button", { requirementId: reqNeg, runStore: envNeg.runStore, artifactStore: envNeg.artifactStore, gateway: envNeg.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    const beforeNeg = pointDispatchCounts(envNeg, firstNeg.run_id);
    const designCurrentNeg = envNeg.runStore.getCurrentArtifactRevision(firstNeg.run_id, "solution-design")!;
    ok(designCurrentNeg.sequence === 2, "negative case binds to a sequence-2 fix-wave product");
    appendBlockingFinding(envNeg, {
      runId: firstNeg.run_id,
      requirementId: reqNeg,
      sourceCapability: "solution-design",
      earliestAffectedNodeId: "solution-design",
      severity: "MEDIUM",
      category: "SOLUTION",
      sequence: 1,
      causeKind: "IMPROVEMENT",
    });
    const afterNegRun = await run("add export button", { requirementId: reqNeg, runStore: envNeg.runStore, artifactStore: envNeg.artifactStore, gateway: envNeg.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    const countsNeg = pointDispatchCounts(envNeg, afterNegRun.run_id);
    ok(
      NODE_CAPABILITY_IDS.every((node) =>
        (countsNeg.get(`${node}:primary`) ?? 0) === (beforeNeg.get(`${node}:primary`) ?? 0)),
      "sequence-2 improvement does not re-drive a wave",
    );
    ok(afterNegRun.chain_status === "BLOCKED" && afterNegRun.final_status === "failed", "open improvement still blocks completion honestly");

    // Positive (production path): a HIGH finding declared REGRESSION and
    // bound to a sequence-1 baseline revision DOES re-drive its rebuild
    // scope — direct evidence works in the direction the sequence heuristic
    // silently dropped.
    const envPos = makeEnv();
    const reqPos = "REQ-WP4-W3B-POS";
    const firstPos = await run("migrate billing export", { requirementId: reqPos, runStore: envPos.runStore, artifactStore: envPos.artifactStore, gateway: envPos.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    const sourceRevisionPos = envPos.runStore.getCurrentArtifactRevision(firstPos.run_id, "solution-design")!;
    ok(sourceRevisionPos.sequence === 1, "positive case binds to a sequence-1 product");
    const orderBeforePos = envPos.dispatchOrder.length;
    appendBlockingFinding(envPos, {
      runId: firstPos.run_id,
      requirementId: reqPos,
      sourceCapability: "solution-design",
      earliestAffectedNodeId: "solution-design",
      severity: "HIGH",
      category: "SOLUTION",
      sequence: 1,
      causeKind: "REGRESSION",
    });
    await run("migrate billing export", { requirementId: reqPos, runStore: envPos.runStore, artifactStore: envPos.artifactStore, gateway: envPos.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    ok(
      envPos.dispatchOrder[orderBeforePos]?.capability === "solution-design",
      "sequence-1 declared regression re-drives its rebuild scope",
    );
  }

  // ── W4: REQUIREMENT feedback re-enters at requirement-intake ──
  console.log("W4: requirement-category feedback opens a new full generation");
  {
    const env = makeEnv();
    const requirementId = "REQ-WP4-W4";
    const first = await run("build invoicing report", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    ok(first.final_status === "success", "first generation completes");
    // WP4 Round 1 H3 fix: external feedback re-enters ONLY through a
    // verified WP1 FEEDBACK_DRIVEN_CHANGE record — never as a raw finding.
    env.runStore.appendRequirementChange(createLoopRequirementChangeRecord({
      runId: first.run_id,
      requirementId,
      sequence: 1,
      status: "CLASSIFIED",
      changeKind: "FEEDBACK_DRIVEN_CHANGE",
      payloadForm: "DELTA_CHANGE",
      previousGeneration: 1,
      currentChangeScope: "外部测试反馈：新增 CSV 导出格式",
      confirmedFactsPreserved: ["invoice numbering stays stable"],
      sourceRefs: [{
        sourceType: "CONVERSATION",
        locator: "feedback:uat-round-1",
        priority: 1,
        sourceVersion: null,
        observedAt: new Date().toISOString(),
      }],
      triggerEvidence: ["source:feedback:uat-round-1"],
      classificationReason: "线下测试反馈经 intake 分类为反馈驱动变更，开启新代际",
      blockedReasonCode: null,
      createdAt: futureIso(1000),
    }));
    await run("build invoicing report", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    const counts = pointDispatchCounts(env, first.run_id);
    ok(counts.get("requirement-intake:primary") === 2, "intake re-dispatched for change-record feedback");
    ok(counts.get("knowledge-sync:primary") === 2, "full chain rebuilt");
    const rebuilt = env.runStore.listRegateCurrentFacts(first.run_id);
    ok(rebuilt.every((fact) => fact.validity === "ACTIVE" && (fact.generation ?? 0) >= 2), "every node carries generation 2");

    // The feedback record remains immutable replay evidence, but once every
    // current has consumed its generation it cannot authorize generation 3.
    const completedEvents = env.runStore.listCapabilityExecutions(first.run_id);
    const priorIntakeStart = completedEvents.find(
      (event) => event.status === "started" && event.capability === "requirement-intake",
    )!;
    const forgedSource = env.artifactStore.put(
      "requirement_summary",
      "unclassified feedback must not open another generation",
    );
    let consumedFeedbackReauthorized = false;
    let consumedFeedbackRejectionCode: string | null = null;
    try {
      env.runStore.appendCapabilityExecution(Object.freeze({
        ...priorIntakeStart,
        executionEventId: `${first.run_id}:capability:${completedEvents.length + 1}:started`,
        sequence: completedEvents.length + 1,
        attempt: priorIntakeStart.attempt + 2,
        createdAt: futureIso(30_000),
        inputArtifactRef: forgedSource.artifactRef,
        inputArtifactVersion: "3.0.0",
        inputDigest: forgedSource.digest,
      }));
      consumedFeedbackReauthorized = true;
    } catch (error) {
      consumedFeedbackRejectionCode = error instanceof LoopRunJournalError ? error.code : null;
    }
    ok(
      consumedFeedbackRejectionCode === "ILLEGAL_TRANSITION",
      `consumed feedback restart fails at the store transition boundary (got ${consumedFeedbackRejectionCode})`,
    );
    ok(!consumedFeedbackReauthorized, "consumed feedback cannot authorize a fresh backward append");
  }

  // ── W4b: generation is run-scoped — the reviewer's fork is unauthorable ──
  console.log("W4b: retry-forked node generations cannot be authored; feedback restarts at intake");
  {
    // Production path: open generation 2, complete it, then prove a revision
    // stamped outside the run's generation authority (the old attempt-as-
    // generation bug, e.g. an intake attempt 3 while the run sits at 2) is
    // rejected at the store boundary.
    const env = makeEnv();
    const requirementId = "REQ-WP4-W4B";
    const first = await run("build invoicing report", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    ok(env.runStore.getRunGeneration(first.run_id) === 1, "fresh run sits in generation 1");
    openFeedbackGeneration(env, { runId: first.run_id, requirementId, locator: "feedback:w4b" });
    ok(env.runStore.getRunGeneration(first.run_id) === 2, "verified feedback record opens generation 2");
    await run("build invoicing report", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    const genAfterWave = env.runStore.getRunGeneration(first.run_id);
    const rebuilt = env.runStore.listRegateCurrentFacts(first.run_id);
    ok(
      rebuilt.every((fact) => fact.generation === genAfterWave),
      "every node current carries the same run generation after a full wave",
    );

    // The fork attempt: stamp a node revision with its would-be ATTEMPT
    // number instead of the run generation. This must fail closed.
    const lastExecution = env.runStore.listCapabilityExecutions(first.run_id).at(-1)!;
    let forkRejectedCode: string | null = null;
    try {
      env.runStore.appendArtifactRevision(createLoopArtifactRevision({
        runId: first.run_id,
        requirementId,
        nodeId: "knowledge-sync",
        sequence: 3,
        generation: lastExecution.attempt + 1,
        stablePath: `library/${requirementId}/${LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION["knowledge-sync"].stablePathSegment}/${requirementId}_knowledge-sync.md`,
        artifactKind: LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION["knowledge-sync"].artifactKind,
        semver: `${lastExecution.attempt + 1}.0.0`,
        artifactRef: lastExecution.outputArtifactRef!,
        digest: lastExecution.outputDigest!,
        producerExecutionId: lastExecution.executionEventId,
        producerExecutionRole: lastExecution.executionRole,
        gateResult: lastExecution.gateResult,
        upstreamRevisionIds: [],
        createdAt: futureIso(1000),
      }));
    } catch (error) {
      forkRejectedCode = error instanceof LoopRunJournalError ? error.code : null;
    }
    ok(forkRejectedCode === "ILLEGAL_TRANSITION", `attempt-stamped generation is rejected at the store boundary (got ${forkRejectedCode})`);

    // Planner contract: with uniform generations and previousGeneration=2,
    // the wave opens at requirement-intake — never skips a "fresher-looking"
    // upstream node.
    const uniformCurrents = new Map<NodeCapabilityId, CurrentRevisionFacts>(
      NODE_CAPABILITY_IDS.map((node) => [node, { validity: "ACTIVE", generation: 2 }]),
    );
    const plan = planRegateFromFacts([], uniformCurrents, undefined, { previousGeneration: 2 });
    ok(
      plan.kind === "regate" && plan.restartNode === "requirement-intake" &&
        plan.restartPointIndex === 0,
      "previousGeneration=2 with all nodes at generation 2 opens the full new generation at intake",
    );
  }

  // ── W5: FAIL verdict blocks and surfaces BLOCKED_UNKNOWN ──
  console.log("W5: FAIL formal verdict blocks before task-planning with BLOCKED_UNKNOWN");
  {
    const root = mkdtempSync(join(tmpdir(), "loop-wp4-failverdict-"));
    mkdirSync(join(root, "repo"), { recursive: true });
    const artifactStore = new LoopArtifactStore({
      controlRoot: join(root, "control"),
      repositoryPath: join(root, "repo"),
    });
    // Round 2 close-out B1: bind the artifact store so decision-delta and
    // revision blob integrity hold in these scenarios too.
    const runStore = new LoopRunStore(join(root, "journal.db"), { artifactStore });
    runStore.init();
    artifactStore.init();
    const bindingRegistry = createRuntimeBindingRegistry();
    const now = (): string => new Date().toISOString();
    // Wrapper: every round uses the deterministic shadow gateway except the
    // formal_verdict round, which fails closed with a rejection code.
    const inner = createDeterministicCapabilityGateway({
      runStore,
      artifactStore,
      bindingRegistry,
      now,
    });
    const failingGateway: RuntimeCapabilityGateway = {
      async execute(request) {
        const context = request.loopExecution!;
        const isVerdict =
          request.type === "solution-gate" &&
          context.executionRole === "formal_verdict";
        if (!isVerdict) return inner.execute(request);
        const runId = context.runId;
        const capability = request.type as NodeCapabilityId;
        const executionRole = context.executionRole as CapabilityExecutionRole;
        const existing = runStore.listCapabilityExecutions(runId);
        const sequence = existing.length + 1;
        const base = {
          schemaVersion: 4 as const,
          runId,
          capability,
          executionRole,
          nodeId: capability,
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
          consumedFindingsRef:
            typeof context.consumedFindingsRef === "string" ? context.consumedFindingsRef : null,
          consumedFindingsDigest:
            typeof context.consumedFindingsDigest === "string" ? context.consumedFindingsDigest : null,
          decisionDepth: null,
          decisionScopeId: null,
          decisionDeltaRef: null,
          decisionDeltaDigest: null,
        };
        runStore.appendCapabilityExecution(Object.freeze({
          ...base,
          executionEventId: `${runId}:capability:${sequence}:started`,
          sequence,
          status: "started" as const,
          createdAt: now(),
          outputArtifactRef: null,
          outputArtifactVersion: null,
          outputDigest: null,
          gateResult: null,
          unresolvedFindingsRef: null,
          unresolvedFindingsDigest: null,
          nextStepEligibility: null,
          errorCode: null,
          retryable: null,
          reasonCode: null,
        }));
        runStore.appendCapabilityExecution(Object.freeze({
          ...base,
          executionEventId: `${runId}:capability:${sequence + 1}:failed`,
          sequence: sequence + 1,
          status: "failed" as const,
          createdAt: now(),
          outputArtifactRef: null,
          outputArtifactVersion: null,
          outputDigest: null,
          gateResult: null,
          unresolvedFindingsRef: null,
          unresolvedFindingsDigest: null,
          nextStepEligibility: "BLOCKED" as const,
          errorCode: "GATE_REJECTED",
          retryable: false,
          reasonCode: "DESIGN_DEPTH_BLOCKED_UNKNOWN",
        }));
        return Object.freeze({
          success: false,
          node: capability,
          agent: "hermes" as AgentName,
          output: Object.freeze({ result: "FAILED", capability }),
          artifacts: Object.freeze([]),
        });
      },
    };
    const result = await run("build refund workflow", {
      requirementId: "REQ-WP4-W5",
      runStore,
      artifactStore,
      gateway: failingGateway,
      bindingRegistry,
    });
    ok(result.chain_status === "BLOCKED", "chain blocked by FAIL verdict");
    const counts = pointDispatchCounts({ runStore } as TestEnv, result.run_id);
    ok(counts.get("task-planning:primary") === undefined, "implementation planning never entered");
    const verdictEvents = runStore.listCapabilityExecutions(result.run_id)
      .filter((event) => event.capability === "solution-gate" && event.executionRole === "formal_verdict");
    const verdictResult = verdictEvents.find((event) => event.status === "succeeded")?.gateResult
      ?? verdictEvents.find((event) => event.status === "failed")?.gateResult
      ?? null;
    const decision = verdictResult === "PASS" ? "DECIDED" : "BLOCKED_UNKNOWN";
    ok(decision === "BLOCKED_UNKNOWN", "depth decision surfaces BLOCKED_UNKNOWN");
  }

  // ── W5b: risk acceptance binds to the exact verdict decision scope ──
  console.log("W5b: PASS_WITH_RISK admits only the acceptance naming THIS verdict's decisionScopeId");
  {
    const root = mkdtempSync(join(tmpdir(), "loop-wp4-riskscope-"));
    mkdirSync(join(root, "repo"), { recursive: true });
    const artifactStore = new LoopArtifactStore({
      controlRoot: join(root, "control"),
      repositoryPath: join(root, "repo"),
    });
    // Round 2 close-out B1: bind the artifact store so decision-delta and
    // revision blob integrity hold in these scenarios too.
    const runStore = new LoopRunStore(join(root, "journal.db"), { artifactStore });
    runStore.init();
    artifactStore.init();
    const bindingRegistry = createRuntimeBindingRegistry();
    const now = (): string => new Date().toISOString();
    // Wrapper: every round uses the deterministic shadow gateway except the
    // formal_verdict round, which succeeds with a PASS_WITH_RISK verdict and
    // materializes its own decision scope.
    const inner = createDeterministicCapabilityGateway({
      runStore,
      artifactStore,
      bindingRegistry,
      now,
    });
    let riskScopeCounter = 0;
    const riskGateway: RuntimeCapabilityGateway = {
      async execute(request) {
        const context = request.loopExecution!;
        const isVerdict =
          request.type === "solution-gate" &&
          context.executionRole === "formal_verdict";
        if (!isVerdict) return inner.execute(request);
        const runId = context.runId;
        const capability = request.type as NodeCapabilityId;
        const executionRole = context.executionRole as CapabilityExecutionRole;
        const existing = runStore.listCapabilityExecutions(runId);
        const sequence = existing.length + 1;
        const base = {
          schemaVersion: 4 as const,
          runId,
          capability,
          executionRole,
          nodeId: capability,
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
          consumedFindingsRef:
            typeof context.consumedFindingsRef === "string" ? context.consumedFindingsRef : null,
          consumedFindingsDigest:
            typeof context.consumedFindingsDigest === "string" ? context.consumedFindingsDigest : null,
          decisionDepth: null,
          decisionScopeId: null,
          decisionDeltaRef: null,
          decisionDeltaDigest: null,
        };
        runStore.appendCapabilityExecution(Object.freeze({
          ...base,
          executionEventId: `${runId}:capability:${sequence}:started`,
          sequence,
          status: "started" as const,
          createdAt: now(),
          outputArtifactRef: null,
          outputArtifactVersion: null,
          outputDigest: null,
          gateResult: null,
          unresolvedFindingsRef: null,
          unresolvedFindingsDigest: null,
          nextStepEligibility: null,
          errorCode: null,
          retryable: null,
          reasonCode: null,
        }));
        riskScopeCounter += 1;
        const scopeId = `${runId}:decision:${riskScopeCounter}`;
        const delta = artifactStore.put(
          "solution_review",
          `depth=STANDARD PASS_WITH_RISK delta for ${runId} scope ${scopeId}`,
        );
        const product = artifactStore.put(
          LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[capability].artifactKind,
          `PASS_WITH_RISK shadow verdict product for ${runId} attempt ${context.attempt}`,
        );
        runStore.appendCapabilityExecution(Object.freeze({
          ...base,
          executionEventId: `${runId}:capability:${sequence + 1}:succeeded`,
          sequence: sequence + 1,
          status: "succeeded" as const,
          createdAt: now(),
          outputArtifactRef: product.artifactRef,
          outputArtifactVersion: String(context.outputArtifactVersion),
          outputDigest: product.digest,
          gateResult: "PASS_WITH_RISK" as const,
          unresolvedFindingsRef: null,
          unresolvedFindingsDigest: null,
          decisionDepth: "STANDARD" as const,
          decisionScopeId: scopeId,
          decisionDeltaRef: delta.artifactRef,
          decisionDeltaDigest: delta.digest,
          nextStepEligibility: "ELIGIBLE" as const,
          errorCode: null,
          retryable: null,
          reasonCode: null,
        }));
        return Object.freeze({
          success: true as const,
          node: capability,
          agent: "hermes" as const,
          output: Object.freeze({ result: "SUCCESS", gate_result: "PASS_WITH_RISK" }),
          artifacts: Object.freeze([]),
        });
      },
    };

    const driveRiskChain = async (rid: string) => {
      const result = await run("small fix", { requirementId: rid, runStore, artifactStore, gateway: riskGateway, bindingRegistry });
      const verdictScopeId = runStore.listCapabilityExecutions(result.run_id)
        .filter((e2) => e2.capability === "solution-gate" && e2.executionRole === "formal_verdict" && e2.status === "succeeded")
        .at(-1)!.decisionScopeId as string;
      return { result, verdictScopeId };
    };

    // Baseline: PASS_WITH_RISK without any acceptance stays sealed.
    {
      const requirementId = "REQ-WP4-W5B-0";
      const { result } = await driveRiskChain(requirementId);
      ok(result.final_status === "failed" && result.chain_status === "BLOCKED",
        "PASS_WITH_RISK without an acceptance blocks before implementation");
      const recovery = recoverRunContext(runStore, requirementId);
      ok(recovery!.solutionGateDecision?.status === "BLOCKED_UNKNOWN",
        "no acceptance -> BLOCKED_UNKNOWN even though gate result is PASS_WITH_RISK");
      ok(recovery!.nextExecutionPoint === null, "unadmitted verdict keeps implementation sealed");
    }

    // Negative: an acceptance naming a STALE decision scope cannot admit
    // this verdict round.
    {
      const requirementId = "REQ-WP4-W5B-STALE";
      const { result, verdictScopeId } = await driveRiskChain(requirementId);
      ok(typeof verdictScopeId === "string" && verdictScopeId.length > 0,
        "the risk verdict materialized its decision scope");
      appendBlockingFinding({ root, runStore, artifactStore, gateway: riskGateway, entry: null as never, dispatchOrder: [] }, {
        runId: result.run_id, requirementId,
        sourceCapability: "solution-gate", earliestAffectedNodeId: "solution-design",
        severity: "MEDIUM", category: "SOLUTION", sequence: 1,
        causeKind: "IMPROVEMENT",
      });
      const evidence = artifactStore.put("capability_findings", "w5b stale-scope acceptance evidence");
      runStore.acceptFindingRisk(result.run_id, `${result.run_id}:finding:1`, {
        riskAcceptedBy: "user:shaoyang01",
        riskAcceptanceEvidenceRef: evidence.artifactRef,
        riskAcceptanceEvidenceDigest: evidence.digest,
        decisionScopeId: `${result.run_id}:decision:999`,
      }).record;
      const recovery = recoverRunContext(runStore, requirementId);
      ok(recovery!.solutionGateDecision?.status === "BLOCKED_UNKNOWN",
        "stale-scope acceptance does not admit the verdict");
      ok(recovery!.nextExecutionPoint === null,
        "stale-scope acceptance keeps implementation sealed");
    }

    // Positive: a finding raised in generation 1, accepted under the
    // generation-2 verdict's OWN decision scope once that round has
    // adjudicated, admits exactly that verdict.
    {
      const requirementId = "REQ-WP4-W5B-LIVE";
      const { result: firstResult } = await driveRiskChain(requirementId);
      appendBlockingFinding({ root, runStore, artifactStore, gateway: riskGateway, entry: null as never, dispatchOrder: [] }, {
        runId: firstResult.run_id, requirementId,
        sourceCapability: "solution-gate", earliestAffectedNodeId: "solution-design",
        severity: "MEDIUM", category: "SOLUTION", sequence: 1,
        causeKind: "IMPROVEMENT",
      });
      // Generation 2: every node rebuilds, the gate current becomes ACTIVE
      // again and a NEW verdict materializes a NEW decision scope.
      openFeedbackGeneration({ root, runStore, artifactStore, gateway: riskGateway, entry: null as never, dispatchOrder: [] }, {
        runId: firstResult.run_id, requirementId, locator: "feedback:w5b-live",
      });
      const second = await run("small fix", { requirementId, runStore, artifactStore, gateway: riskGateway, bindingRegistry });
      ok(second.final_status === "failed" && second.chain_status === "BLOCKED",
        "generation-2 verdict starts BLOCKED_UNKNOWN until its own scope is accepted");
      const liveVerdictScopeId = runStore.listCapabilityExecutions(firstResult.run_id)
        .filter((e2) => e2.capability === "solution-gate" && e2.executionRole === "formal_verdict" && e2.status === "succeeded")
        .at(-1)!.decisionScopeId as string;
      ok(liveVerdictScopeId !== `${firstResult.run_id}:decision:1`,
        "the generation-2 verdict mints a fresh decision scope");
      const evidence = artifactStore.put("capability_findings", "w5b matching-scope acceptance evidence");
      runStore.acceptFindingRisk(firstResult.run_id, `${firstResult.run_id}:finding:1`, {
        riskAcceptedBy: "user:shaoyang01",
        riskAcceptanceEvidenceRef: evidence.artifactRef,
        riskAcceptanceEvidenceDigest: evidence.digest,
        decisionScopeId: liveVerdictScopeId,
      }).record;
      const recovery = recoverRunContext(runStore, requirementId);
      ok(recovery!.solutionGateDecision?.status === "DECIDED",
        "matching-scope acceptance admits the PASS_WITH_RISK verdict");
    }
  }

  // ── W6: skill-isolation invariants (audit preconditions) ──
  console.log("W6: Re-Gate plan carries no skill surface; forged skill is inert/rejected");
  {
    const facts: RegateFindingFacts[] = [{
      findingId: "f1",
      severity: "HIGH",
      status: "OPEN",
      earliestAffectedNodeId: "solution-design",
      causeKind: "REGRESSION",
      createdAt: futureIso(),
    }];
    const currents = new Map<NodeCapabilityId, CurrentRevisionFacts>([
      ["requirement-intake", { validity: "ACTIVE", generation: 1 }],
      ["solution-design", { validity: "STALE", generation: 1 }],
    ]);
    const plan = planRegateFromFacts(facts, currents);
    const serialized = JSON.stringify(plan);
    ok(!serialized.includes("skill"), "plan carries no skill field");
    ok(!serialized.includes("flowId"), "plan carries no flowId field");
    ok(plan.kind === "regate" && plan.restartNode === "solution-design", "plan targets the stale governing node");

    // Runtime options are closed: a forged skill option is rejected.
    const env = makeEnv();
    let rejectedForgedOption = false;
    try {
      await run("x", { requirementId: "REQ-WP4-W6", skill: "sdlc-speckit-pipeline" } as never);
    } catch (error) {
      rejectedForgedOption = error instanceof LoopRunJournalError && error.code === "INVALID_INPUT";
    }
    ok(rejectedForgedOption, "forged skill runtime option rejected");

    // A forged skill on a Re-Gate restart dispatch is metadata-inert: the
    // authorized generation restart proceeds and the next action is the
    // canonical successor (gate scan), unchanged by the skill field.
    const requirementId = "REQ-WP4-W6-ENTRY";
    const first = await run("small fix", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    // Round 2 H2: the restart must be live-authorized, so the finding has to
    // be a causal regression raised against a fix-wave product. A feedback
    // record opens generation 2 first; the HIGH SOLUTION finding then binds
    // to the generation-2 solution-design revision (sequence 2).
    openFeedbackGeneration(env, { runId: first.run_id, requirementId, locator: "feedback:w6-entry" });
    await run("small fix", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    appendBlockingFinding(env, {
      runId: first.run_id,
      requirementId,
      sourceCapability: "solution-design",
      earliestAffectedNodeId: "solution-design",
      category: "SOLUTION",
      sequence: 1,
    });
    const intakeRevision = env.runStore.getCurrentArtifactRevision(first.run_id, "requirement-intake")!;
    const designLastAttempt = env.runStore.listCapabilityExecutions(first.run_id)
      .filter((event) => event.capability === "solution-design")
      .reduce((max, event) => Math.max(max, event.attempt), 0);
    await env.entry.execute({
      requirementId,
      capability: "solution-design",
      executionRole: "primary",
      inputArtifactRef: intakeRevision.artifactRef,
      inputArtifactVersion: intakeRevision.semver,
      inputDigest: intakeRevision.digest,
      outputArtifactVersion: `${designLastAttempt + 1}.0.0`,
      input: { inputArtifactRef: intakeRevision.artifactRef },
      skill: "sdlc-speckit-pipeline",
    });
    const after = env.runStore.listCapabilityExecutions(first.run_id).at(-1)!;
    ok(after.capability === "solution-design" && after.status === "succeeded", "restart dispatched despite forged skill");
    recordRevisionForLastSucceeded(env, first.run_id, requirementId, "solution-design");
    const recoveryAfter = recoverRunContext(env.runStore, requirementId);
    ok(
      recoveryAfter!.nextExecutionPoint?.capability === "solution-gate" &&
        recoveryAfter!.nextExecutionPoint?.executionRole === "adversarial_scan",
      "next action after restart is the canonical gate scan point",
    );

    // Control flow WITHOUT the forged skill must land on the identical next
    // action — proving the skill field is metadata-inert end to end.
    const env2 = makeEnv();
    const first2 = await run("small fix", { requirementId, runStore: env2.runStore, artifactStore: env2.artifactStore, gateway: env2.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    openFeedbackGeneration(env2, { runId: first2.run_id, requirementId, locator: "feedback:w6-control" });
    await run("small fix", { requirementId, runStore: env2.runStore, artifactStore: env2.artifactStore, gateway: env2.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    appendBlockingFinding(env2, {
      runId: first2.run_id,
      requirementId,
      sourceCapability: "solution-design",
      earliestAffectedNodeId: "solution-design",
      category: "SOLUTION",
      sequence: 1,
    });
    const intake2 = env2.runStore.getCurrentArtifactRevision(first2.run_id, "requirement-intake")!;
    const designLastAttempt2 = env2.runStore.listCapabilityExecutions(first2.run_id)
      .filter((event) => event.capability === "solution-design")
      .reduce((max, event) => Math.max(max, event.attempt), 0);
    await env2.entry.execute({
      requirementId,
      capability: "solution-design",
      executionRole: "primary",
      inputArtifactRef: intake2.artifactRef,
      inputArtifactVersion: intake2.semver,
      inputDigest: intake2.digest,
      outputArtifactVersion: `${designLastAttempt2 + 1}.0.0`,
      input: { inputArtifactRef: intake2.artifactRef },
    });
    recordRevisionForLastSucceeded(env2, first2.run_id, requirementId, "solution-design");
    const recoveryControl = recoverRunContext(env2.runStore, requirementId);
    ok(
      JSON.stringify(recoveryControl!.nextExecutionPoint) ===
        JSON.stringify(recoveryAfter!.nextExecutionPoint),
      "with-skill and without-skill flows produce the identical next action",
    );
  }

  // ── W7: restart cannot be self-authorized at the store boundary ──
  console.log("W7: backward jump without a pending regate plan fails closed");
  {
    const facts: RegateFindingFacts[] = [];
    const currents = new Map<NodeCapabilityId, CurrentRevisionFacts>();
    const plan = planRegateFromFacts(facts, currents);
    ok(plan.kind === "none" && plan.restartPointIndex === null, "no findings → no restart authorization");

    const originalProductFinding: RegateFindingFacts = {
      findingId: "original-product-improvement",
      severity: "MEDIUM",
      status: "OPEN",
      earliestAffectedNodeId: "solution-design",
      causeKind: "IMPROVEMENT",
      createdAt: new Date().toISOString(),
    };
    const causalFinding: RegateFindingFacts = {
      ...originalProductFinding,
      findingId: "fix-wave-regression",
      severity: "HIGH",
      causeKind: "REGRESSION",
    };
    const designPoint = LOOP_CAPABILITY_EXECUTION_POINTS.findIndex(
      (point) => point.capability === "solution-design",
    );
    ok(
      !historicalRestartAuthorized([originalProductFinding], designPoint),
      "original-product improvement cannot authorize a historical restart",
    );
    ok(
      historicalRestartAuthorized([causalFinding], designPoint),
      "fix-wave causal finding can validate its recorded historical restart",
    );
  }

  // ── W8: resolved findings never re-authorize a backward jump ──
  console.log("W8: historical/resolved findings cannot self-authorize restarts");
  {
    const facts: RegateFindingFacts[] = [{
      findingId: "resolved-f",
      severity: "HIGH",
      status: "RESOLVED",
      earliestAffectedNodeId: "solution-design",
      causeKind: "REGRESSION",
      createdAt: new Date().toISOString(),
    }];
    const currents = new Map<NodeCapabilityId, CurrentRevisionFacts>([
      ["solution-design", { validity: "ACTIVE", generation: 2 }],
    ]);
    // Live pending plan (what the store passes at append time) ignores the
    // resolved finding entirely.
    const live = planRegateFromFacts(facts, currents);
    ok(live.kind === "none" && live.restartPointIndex === null, "resolved finding yields no live restart target");
  }

  // ── W9: the round budget counts Re-Gate rounds, releases by decision ──
  console.log("W9: plain linear progress never blocks; round budget counts waves; release clears");
  {
    // (1) A truncated LINEAR invocation must not persist any durable block —
    // the next invocation resumes and completes normally.
    const envLin = makeEnv();
    const reqLin = "REQ-WP4-W9-LINEAR";
    const partial = await run("tiny scope", {
      requirementId: reqLin, runStore: envLin.runStore, artifactStore: envLin.artifactStore,
      gateway: envLin.gateway, bindingRegistry: createRuntimeBindingRegistry(), maxDispatches: 2,
    });
    ok(partial.chain_status !== "BLOCKED" || partial.final_status === "success",
      "linear truncation is not a durable block");
    ok(!envLin.runStore.listEvents(partial.run_id).some((e2) => e2.kind === "run_blocked"),
      "no run_blocked event is written for a linear safety stop");
    const resumed = await run("tiny scope", {
      requirementId: reqLin, runStore: envLin.runStore, artifactStore: envLin.artifactStore,
      gateway: envLin.gateway, bindingRegistry: createRuntimeBindingRegistry(),
    });
    ok(resumed.final_status === "success" && resumed.chain_status === "COMPLETED",
      "the next invocation resumes the truncated linear chain to completion");

    // (2) The durable budget counts PERSISTED BACKWARD JUMPS. With a
    // one-round budget, the feedback wave fits but the next causal wave
    // exhausts it and persists REGATE_ROUND_BUDGET_EXHAUSTED.
    const env = makeEnv();
    const requirementId = "REQ-WP4-W9";
    const first = await run("migrate billing export", {
      requirementId, runStore: env.runStore, artifactStore: env.artifactStore,
      gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry(),
    });
    ok(first.final_status === "success", "generation 1 completes within the round budget");
    ok(env.runStore.countRegateRounds(first.run_id) === 0,
      "a plain linear chain (including same-point retries) consumes no rounds");
    openFeedbackGeneration(env, { runId: first.run_id, requirementId, locator: "feedback:w9" });
    const second = await run("migrate billing export", {
      requirementId, runStore: env.runStore, artifactStore: env.artifactStore,
      gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry(), maxRegateRounds: 1,
    });
    ok(second.final_status === "success", "the feedback wave consumes exactly the one allowed round");
    ok(env.runStore.countRegateRounds(first.run_id) === 1, "one backward jump persisted");

    appendBlockingFinding(env, {
      runId: first.run_id, requirementId,
      sourceCapability: "solution-gate", earliestAffectedNodeId: "solution-design",
      severity: "HIGH", category: "SOLUTION", sequence: 1,
    });
    // Round 2 close-out B3: the over-budget wave performs ZERO external
    // dispatches — the permit transaction blocks it before any agent runs.
    const orderBeforeThird = env.dispatchOrder.length;
    const third = await run("migrate billing export", {
      requirementId, runStore: env.runStore, artifactStore: env.artifactStore,
      gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry(), maxRegateRounds: 1,
    });
    console.log("DBG9b:", JSON.stringify({
      before: orderBeforeThird,
      after: env.dispatchOrder.length,
      thirdChain: third.chain_status,
      blocking: recoverRunContext(env.runStore, requirementId)!.blockingReasonCode,
      rounds: env.runStore.countRegateRounds(first.run_id),
      tail: env.dispatchOrder.slice(-4),
    }));
    ok(env.dispatchOrder.length === orderBeforeThird,
      "the over-budget wave performs zero dispatches");
    ok(third.final_status === "failed" && third.chain_status === "BLOCKED",
      "the over-budget wave is blocked honestly without executing");
    const recoveryBlocked = recoverRunContext(env.runStore, requirementId)!;
    ok(
      recoveryBlocked.blockingReasonCode === "REGATE_ROUND_BUDGET_EXHAUSTED",
      `blocking reason persisted (got ${recoveryBlocked.blockingReasonCode})`,
    );

    // (3) Release path: an explicit RISK_ACCEPTED decision clears the
    // durable block; the budget still guards any further waves.
    const orderBeforeRelease = env.dispatchOrder.length;
    const fourth = await run("migrate billing export", {
      requirementId, runStore: env.runStore, artifactStore: env.artifactStore,
      gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry(), maxRegateRounds: 1,
    });
    ok(fourth.chain_status === "BLOCKED" && env.dispatchOrder.length === orderBeforeRelease,
      "blocked run refuses re-dispatch before release");
    env.runStore.releaseRunRegateBlock(first.run_id, { kind: "RISK_ACCEPTED" });
    const recoveryReleased = recoverRunContext(env.runStore, requirementId)!;
    ok(recoveryReleased.blockingReasonCode === null, "release clears the durable block");
    const fifth = await run("migrate billing export", {
      requirementId, runStore: env.runStore, artifactStore: env.artifactStore,
      gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry(), maxRegateRounds: 1,
    });
    ok(fifth.chain_status === "BLOCKED",
      "post-release the budget still guards new waves");
    // Post-release: the interrupted wave RESUMES to completion — no new
    // durable block is persisted for finishing what the release authorized;
    // the run still ends honestly BLOCKED on the unresolved regression.
    const postReleaseRecovery = recoverRunContext(env.runStore, requirementId)!;
    console.log("DBG9:", JSON.stringify({
      blocking: postReleaseRecovery.blockingReasonCode,
      next: postReleaseRecovery.nextExecutionPoint,
      chain: postReleaseRecovery.capabilityChainStatus,
      fifthNext: fifth.next_execution_point,
      fifthChain: fifth.chain_status,
      dispatchesAfterThird: env.dispatchOrder.length - orderBeforeThird,
    }));
    ok(postReleaseRecovery.blockingReasonCode === null,
      "no durable block persists after the released wave completes");
    ok(
      env.runStore.getCurrentArtifactRevision(first.run_id, "solution-gate")!.validity === "ACTIVE",
      "the released wave finished rebuilding downstream",
    );
    ok(fifth.final_status === "failed",
      "the unresolved regression keeps the run honestly blocked");
    ok(env.dispatchOrder.length > orderBeforeThird,
      "post-release the released wave actually resumed dispatching");
  }

    // ── W10: causal evidence and generation authority are store-enforced ──
  console.log("W10: declared causality binds real revisions; generation cannot skip or regress");
  {
    const env = makeEnv();
    const requirementId = "REQ-WP4-W10";
    const first = await run("tiny scope", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });

    // F2 negative: REGRESSION citing a nonexistent introducing revision.
    const designCurrent = env.runStore.getCurrentArtifactRevision(first.run_id, "solution-design")!;
    let f2Code: string | null = null;
    try {
      env.runStore.appendFinding(createLoopFinding({
        runId: first.run_id, requirementId, sequence: 1,
        sourceCapability: "solution-design", sourceRevisionId: designCurrent.revisionId,
        causeKind: "REGRESSION", introducedByRevisionId: `${first.run_id}:revision:solution-design:999`,
        severity: "HIGH", category: "SOLUTION",
        evidenceRef: `loop-artifact:v1:solution_review:sha256:${"c".repeat(64)}`,
        evidenceDigest: "c".repeat(64),
        earliestAffectedNodeId: "solution-design",
        createdAt: new Date(Date.now() + 1000).toISOString(),
      }));
    } catch (error) {
      f2Code = error instanceof LoopRunJournalError ? error.code : null;
    }
    ok(f2Code === "ILLEGAL_TRANSITION", `nonexistent introducedByRevisionId rejected (got ${f2Code})`);

    // F3 negative: skipping ahead beyond the authoritative generation.
    const skipRecord = createLoopRequirementChangeRecord({
      runId: first.run_id, requirementId, sequence: 1,
      status: "CLASSIFIED", changeKind: "FEEDBACK_DRIVEN_CHANGE",
      payloadForm: "DELTA_CHANGE", previousGeneration: 3,
      currentChangeScope: "skip attempt",
      confirmedFactsPreserved: ["billing export stays idempotent"], sourceRefs: [{
        sourceType: "CONVERSATION", locator: "feedback:w10-skip", priority: 1,
        sourceVersion: null, observedAt: new Date().toISOString(),
      }],
      triggerEvidence: ["source:feedback:w10-skip"],
      classificationReason: "skip", blockedReasonCode: null,
      createdAt: futureIso(1000),
    });
    let f3SkipCode: string | null = null;
    try {
      env.runStore.appendRequirementChange(skipRecord);
    } catch (error) {
      f3SkipCode = error instanceof LoopRunJournalError ? error.code : null;
    }
    ok(f3SkipCode === "ILLEGAL_TRANSITION", `generation skip rejected (got ${f3SkipCode})`);

    // Legitimate wave still lands (previousGeneration === current authority).
    openFeedbackGeneration(env, { runId: first.run_id, requirementId, locator: "feedback:w10-ok" });
    ok(env.runStore.getRunGeneration(first.run_id) === 2, "well-formed feedback opens generation 2");

    // F3 regression: another record citing the superseded generation 1.
    const regressRecord = createLoopRequirementChangeRecord({
      runId: first.run_id, requirementId, sequence: 2,
      status: "CLASSIFIED", changeKind: "FEEDBACK_DRIVEN_CHANGE",
      payloadForm: "DELTA_CHANGE", previousGeneration: 1,
      currentChangeScope: "rewind attempt",
      confirmedFactsPreserved: ["billing export stays idempotent"],
      sourceRefs: [{ sourceType: "CONVERSATION", locator: "feedback:w10-rewind", priority: 1,
        sourceVersion: null, observedAt: new Date().toISOString() }],
      triggerEvidence: ["source:feedback:w10-rewind"],
      classificationReason: "rewind", blockedReasonCode: null,
      createdAt: futureIso(2000),
    });
    let f3RewindCode: string | null = null;
    try {
      env.runStore.appendRequirementChange(regressRecord);
    } catch (error) {
      f3RewindCode = error instanceof LoopRunJournalError ? error.code : null;
    }
    ok(f3RewindCode === "ILLEGAL_TRANSITION", `generation rewind rejected (got ${f3RewindCode})`);
  }

  console.log(`\nWP4 regate contract tests: ${passed} assertions passed`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
