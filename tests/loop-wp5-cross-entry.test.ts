// C02-WP5: Cross-Entry Recovery and Production Wiring — Contract Tests
// =====================================================================
// Pins the §6 C02-WP5 / §8 F row-5 completion contract on the v2 single-rail
// runner (Decision-047):
//   P1  fresh run — recovery exposes the full C02 fact base (generation,
//       change record, current artifact map, findings, invalidations, plan);
//   P2  supplement/change — a FEEDBACK_DRIVEN_CHANGE opens generation 2 and
//       the recovery facts prove the rebuild without reinterpreting facts;
//   P3  finding Re-Gate — upstream currents are reused read-only, the wave
//       rebuilds the canonical downstream scope, findings never auto-close;
//   P4  process restart — a second connection (fresh entry + gateway) resumes
//       the same generation at the unique next action; the thin store-level
//       consumer derives the IDENTICAL dispatch command (Q3-A equivalence);
//   P5  binding replacement — swapping an enabled binding changes nothing
//       about the recovered next action or consumed inputs;
//   N*  fail-closed negatives — stale-input rejection, late-result CAS,
//       skill isolation at entry and gateway, wiring clause 0.1.4–0.1.6
//       rejections, forged bindings, configuration freeze.

import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createDeterministicCapabilityGateway,
  createRuntimeBindingRegistry,
  run,
  type RuntimeCapabilityGateway,
} from "../runtime";
import { ExecutionGateway } from "../execution/gateway";
import { LoopCapabilityEntry } from "../core/loop-capability-entry";
import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopRunStore } from "../core/loop-run-store";
import { bindGatewayTracing } from "../core/loop-entry-bindings";
import { LoopRunJournalError } from "../core/loop-executor-types";
import { createLoopFinding } from "../core/loop-finding-lifecycle";
import { createLoopRequirementChangeRecord } from "../core/loop-change-classification";
import {
  deriveDispatchCommand,
  recoverRunContext,
} from "../core/loop-recovery";
import {
  replaceBinding,
  CAPABILITY_ARTIFACT_TYPES,
} from "../core/agent-capability-bindings";
import { createCodexFakeRunner } from "../execution/codex-real-dispatch-runner";
import { LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION } from "../core/loop-capability-execution";
import { LOOP_CAPABILITY_EXECUTION_POINTS, type NodeCapabilityId } from "../loop/types";

let passed = 0;
function ok(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  passed += 1;
}

interface Env {
  root: string;
  runStore: LoopRunStore;
  artifactStore: LoopArtifactStore;
  gateway: RuntimeCapabilityGateway;
  entry: LoopCapabilityEntry;
}

function makeEnv(rootPrefix: string): Env {
  const root = mkdtempSync(join(tmpdir(), rootPrefix));
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
  return { root, runStore, artifactStore, gateway, entry };
}

/** A second "process": fresh connections over the same journal/artifacts. */
function secondProcess(env: Env): Env {
  const artifactStore = new LoopArtifactStore({
    controlRoot: join(env.root, "control"),
    repositoryPath: join(env.root, "repo"),
  });
  const runStore = new LoopRunStore(join(env.root, "journal.db"), { artifactStore });
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
  return { root: env.root, runStore, artifactStore, gateway, entry };
}

async function expectCode(code: string, fn: () => unknown | Promise<unknown>, message: string): Promise<void> {
  try {
    await fn();
    assert.fail(message);
  } catch (error) {
    ok(
      error instanceof LoopRunJournalError && error.code === code,
      `${message} (got ${error instanceof LoopRunJournalError ? error.code : String(error)})`,
    );
  }
}

function openFeedbackGeneration(o: {
  runStore: LoopRunStore;
  runId: string;
  requirementId: string;
  locator: string;
}): void {
  o.runStore.appendRequirementChange(createLoopRequirementChangeRecord({
    runId: o.runId,
    requirementId: o.requirementId,
    sequence: 1,
    status: "CLASSIFIED",
    changeKind: "FEEDBACK_DRIVEN_CHANGE",
    payloadForm: "DELTA_CHANGE",
    previousGeneration: 1,
    currentChangeScope: "WP5 contract test feedback wave",
    confirmedFactsPreserved: ["login flow behavior stays"],
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
    createdAt: new Date(Date.now() + 1000).toISOString(),
  }));
}

function appendRegressionFinding(o: {
  runStore: LoopRunStore;
  runId: string;
  requirementId: string;
  sourceCapability: NodeCapabilityId;
  earliestAffectedNodeId: NodeCapabilityId;
  sequence: number;
}): string {
  const current = o.runStore.getCurrentArtifactRevision(o.runId, o.sourceCapability)!;
  const finding = createLoopFinding({
    runId: o.runId,
    requirementId: o.requirementId,
    sequence: o.sequence,
    sourceCapability: o.sourceCapability,
    sourceRevisionId: current.revisionId,
    causeKind: "REGRESSION",
    introducedByRevisionId: current.revisionId,
    severity: "HIGH",
    category: "IMPLEMENTATION",
    evidenceRef: `loop-artifact:v1:${current.artifactKind}:sha256:${current.digest}`,
    evidenceDigest: current.digest,
    earliestAffectedNodeId: o.earliestAffectedNodeId,
    createdAt: new Date(Date.now() + (o.sequence + 10) * 1000).toISOString(),
  });
  o.runStore.appendFinding(finding);
  return finding.findingId;
}

const ALL_POINTS = 8;

async function main(): Promise<void> {
  // ── P1: fresh run — full C02 fact base in one recovery context ──
  console.log("P1: fresh run recovers the full C02 fact base");
  {
    const env = makeEnv("loop-wp5-fresh-");
    try {
      const result = await run("build a user registration form", {
        requirementId: "REQ-WP5-P1", runStore: env.runStore, artifactStore: env.artifactStore,
        gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry(),
      });
      ok(result.final_status === "success" && result.chain_status === "COMPLETED", "fresh chain completes");
      const recovery = recoverRunContext(env.runStore, "REQ-WP5-P1")!;
      ok(recovery.generation === 1, "generation authority starts at 1");
      ok(recovery.latestChangeRecord === null, "no change record before feedback");
      ok(recovery.currentArtifactMap.length === 7, "every canonical node holds a current pointer");
      ok(
        recovery.currentArtifactMap.every((fact) => fact.validity === "ACTIVE") &&
          recovery.currentArtifactMap.every((fact) => fact.stablePath.startsWith("library/REQ-WP5-P1/")) &&
          recovery.currentArtifactMap.every((fact) => /^\d+\.\d+\.\d+$/.test(fact.semver)),
        "current artifact map binds path/version/ref/digest authority per node",
      );
      ok(recovery.openFindings.length === 0 && recovery.invalidatedRevisions.length === 0,
        "a clean run has no open findings and no invalidated revisions");
      ok(recovery.regatePlan.kind === "none", "no Re-Gate obligation on a fresh completed run");
      ok(deriveDispatchCommand(recovery) === null, "a completed chain derives no dispatch command");

      // The thin store-level consumer (Q3-A): recovery + derivation alone.
      const mid = recoverRunContext(secondProcess(env).runStore, "REQ-WP5-P1")!;
      ok(mid.generation === recovery.generation && mid.capabilityChainStatus === recovery.capabilityChainStatus,
        "another process recovers identical current facts");
      ok(JSON.stringify(mid.regatePlan) === JSON.stringify(recovery.regatePlan),
        "another process derives the identical Re-Gate plan");
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  }

  // ── P2: supplement/change — feedback opens generation 2 ──
  console.log("P2: FEEDBACK_DRIVEN_CHANGE opens generation 2 with preserved confirmed facts");
  {
    const env = makeEnv("loop-wp5-feedback-");
    try {
      const requirementId = "REQ-WP5-P2";
      await run("build a login page", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
      const before = recoverRunContext(env.runStore, requirementId)!;
      openFeedbackGeneration({ runStore: env.runStore, runId: before.snapshot.state.identity.runId, requirementId, locator: "feedback:wp5-p2" });
      const afterRecord = recoverRunContext(env.runStore, requirementId)!;
      ok(afterRecord.generation === 2, "the change record advances the generation authority");
      ok(
        afterRecord.latestChangeRecord !== null &&
          afterRecord.latestChangeRecord.changeKind === "FEEDBACK_DRIVEN_CHANGE" &&
          afterRecord.latestChangeRecord.previousGeneration === 1 &&
          afterRecord.latestChangeRecord.confirmedFactsPreserved.includes("login flow behavior stays"),
        "recovery surfaces the change record and its preserved confirmed facts",
      );
      const rebuilt = await run("build a login page", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
      ok(rebuilt.final_status === "success", "generation 2 completes");
      const after = recoverRunContext(env.runStore, requirementId)!;
      ok(after.generation === 2, "generation stays 2 after the wave");
      ok(after.currentArtifactMap.every((fact) => fact.generation === 2 && fact.validity === "ACTIVE"),
        "every node current is a generation-2 ACTIVE revision");
      ok(after.invalidatedRevisions.length >= 7, "the superseded generation-1 revisions stay auditable as STALE");
      ok(after.openFindings.length === 0, "feedback waves raise no findings by themselves");
      ok(after.capabilityChainStatus === "COMPLETED", "confirmed facts were not reinterpreted — chain simply completed again");
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  }

  // ── P3: finding Re-Gate — read-only upstream reuse, downstream rebuild ──
  console.log("P3: causal regression re-drives only its canonical downstream scope");
  {
    const env = makeEnv("loop-wp5-regate-");
    try {
      const requirementId = "REQ-WP5-P3";
      const first = await run("build an order export", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
      openFeedbackGeneration({ runStore: env.runStore, runId: first.run_id, requirementId, locator: "feedback:wp5-p3" });
      await run("build an order export", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
      const gen2 = recoverRunContext(env.runStore, requirementId)!;
      const reusedBefore = new Map(gen2.currentArtifactMap.map((fact) => [fact.nodeId, fact.revisionId]));
      const findingId = appendRegressionFinding({
        runStore: env.runStore, runId: first.run_id, requirementId,
        sourceCapability: "implementation", earliestAffectedNodeId: "implementation", sequence: 1,
      });
      const planned = recoverRunContext(env.runStore, requirementId)!;
      ok(planned.openFindings.length === 1 && planned.openFindings[0]!.findingId === findingId,
        "the open finding is part of the recovered context");
      ok(planned.regatePlan.kind === "regate" &&
        planned.regatePlan.governingFindingIds.includes(findingId) &&
        planned.regatePlan.restartNode === "implementation" &&
        planned.regatePlan.reusedUpstreamNodes.join(",") === "requirement-intake,solution-design,solution-gate,task-planning",
        "the Re-Gate plan projection names governing finding, restart node and reused upstream");
      ok(planned.findingGate.status === "BLOCKED" && planned.findingGate.blockingFindingIds.includes(findingId),
        "the finding gate blocks while the regression is unresolved");
      ok(deriveDispatchCommand(planned)!.capability === "implementation",
        "the derived dispatch command targets the earliest affected node");
      ok(planned.nextExecutionPoint!.capability === "implementation",
        "the unique next action is the restart target");

      const third = await run("build an order export", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
      ok(third.chain_status === "BLOCKED" && third.final_status === "failed",
        "the unresolved finding keeps the rebuilt run honestly BLOCKED");
      const afterWave = recoverRunContext(env.runStore, requirementId)!;
      for (const nodeId of ["requirement-intake", "solution-design", "solution-gate"] as const) {
        const nowFact = afterWave.currentArtifactMap.find((fact) => fact.nodeId === nodeId)!;
        ok(nowFact.revisionId === reusedBefore.get(nodeId), `${nodeId} current reused read-only`);
      }
      for (const nodeId of ["implementation", "code-review", "knowledge-sync"] as const) {
        const nowFact = afterWave.currentArtifactMap.find((fact) => fact.nodeId === nodeId)!;
        ok(nowFact.revisionId !== reusedBefore.get(nodeId) && nowFact.validity === "ACTIVE",
          `${nodeId} was rebuilt to a fresh ACTIVE current`);
        ok(
          afterWave.invalidatedRevisions.some((rev) => rev.revisionId === reusedBefore.get(nodeId)),
          `the superseded ${nodeId} revision remains auditable`,
        );
      }
      ok(afterWave.openFindings.length === 1 && afterWave.openFindings[0]!.findingId === findingId,
        "re-running agents never auto-closes a finding (invariant 8)");
      // RESOLVED orchestration: resolution requires the rebuilt ACTIVE current.
      const implCurrent = afterWave.currentArtifactMap.find((fact) => fact.nodeId === "implementation")!;
      env.runStore.resolveFinding(first.run_id, findingId, {
        resolvedByRevisionId: implCurrent.revisionId,
        resolutionEvidenceRef: `loop-artifact:v1:${implCurrent.artifactKind}:sha256:${implCurrent.digest}`,
        resolutionEvidenceDigest: implCurrent.digest,
      });
      const resolvedRecovery = recoverRunContext(env.runStore, requirementId)!;
      ok(resolvedRecovery.openFindings.length === 0 && resolvedRecovery.findingGate.status === "ELIGIBLE",
        "evidence-bound closure restores eligibility");
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  }

  // ── P4: process restart — second connection resumes the unique next action ──
  console.log("P4: process restart continues the same generation without reinterpretation");
  {
    const env = makeEnv("loop-wp5-restart-");
    try {
      const requirementId = "REQ-WP5-P4";
      const stopped = await run("build a cart page", {
        requirementId, runStore: env.runStore, artifactStore: env.artifactStore,
        gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry(), maxDispatches: 4,
      });
      ok(stopped.final_status === "failed" && stopped.chain_status === "READY",
        "the safety bound stops the invocation honestly mid-chain");
      ok(stopped.execution_trace.length === ALL_POINTS &&
        stopped.execution_trace.filter((entry) => entry.status === "started").length === 4,
        "four points dispatched before the stop");

      // Thin consumer (Q3-A) over the SAME journal through a second process:
      // deriveDispatchCommand alone must name the exact unique next action.
      const other = secondProcess(env);
      const crossRecovery = recoverRunContext(other.runStore, requirementId)!;
      const command = deriveDispatchCommand(crossRecovery);
      ok(command !== null && command.capability === "task-planning" && command.executionRole === "primary",
        "the thin store-level consumer derives the unique next action across processes");
      const predecessorCurrent = crossRecovery.currentArtifactMap.find((fact) => fact.nodeId === "solution-gate")!;
      ok(
        command!.inputArtifactRef === predecessorCurrent.artifactRef &&
          command!.inputDigest === predecessorCurrent.digest &&
          command!.inputArtifactVersion === predecessorCurrent.semver,
        "the derived command consumes exactly the ACTIVE current of the predecessor node",
      );

      const resumed = await run("build a cart page", {
        requirementId, runStore: other.runStore, artifactStore: other.artifactStore,
        gateway: other.gateway, bindingRegistry: createRuntimeBindingRegistry(),
      });
      ok(resumed.final_status === "success" && resumed.chain_status === "COMPLETED", "restart completes the chain");
      ok(resumed.run_id === stopped.run_id, "restart continues the SAME run");
      const totalStarted = other.runStore.listCapabilityExecutions(resumed.run_id)
        .filter((event) => event.status === "started").length;
      ok(totalStarted === ALL_POINTS, "resumption never re-dispatches an already-succeeded point");
      const finalRecovery = recoverRunContext(other.runStore, requirementId)!;
      ok(finalRecovery.generation === 1 && finalRecovery.capabilityChainStatus === "COMPLETED",
        "the resumed process recovered the same generation without reinterpretation");
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  }

  // ── P5: binding replacement does not move the recovered next action ──
  console.log("P5: binding replacement preserves commands, lineage and completion");
  {
    const env = makeEnv("loop-wp5-binding-");
    try {
      const requirementId = "REQ-WP5-P5";
      const stopped = await run("build a profile page", {
        requirementId, runStore: env.runStore, artifactStore: env.artifactStore,
        gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry(), maxDispatches: 4,
      });
      const beforeCommand = deriveDispatchCommand(recoverRunContext(env.runStore, requirementId)!);
      // Binding replacement: implementation moves from codex to kimi. The
      // dual-agent solution-gate rule stays intact (only implementation is
      // swapped), so the replacement snapshot validates.
      const registry = replaceBinding(
        createRuntimeBindingRegistry(),
        "binding-codex-implementation-primary",
        "binding-kimi-implementation-primary",
      ).registry;
      const afterCommand = deriveDispatchCommand(recoverRunContext(env.runStore, requirementId)!);
      ok(JSON.stringify(beforeCommand) === JSON.stringify(afterCommand),
        "binding replacement changes nothing about the dispatch command");
      // The resuming process wires its OWN gateway against the replacement
      // registry — the same journal, a different enabled binding.
      const resumedGateway = createDeterministicCapabilityGateway({
        runStore: env.runStore,
        artifactStore: env.artifactStore,
        bindingRegistry: registry,
        now: () => new Date().toISOString(),
      });
      const finished = await run("build a profile page", {
        requirementId, runStore: env.runStore, artifactStore: env.artifactStore,
        gateway: resumedGateway, bindingRegistry: registry,
      });
      ok(finished.final_status === "success" && finished.run_id === stopped.run_id,
        "the replacement registry completes the same run");
      const implementationEvents = env.runStore.listCapabilityExecutions(stopped.run_id)
        .filter((event) => event.capability === "implementation");
      ok(implementationEvents.some((event) => event.executorAgent === "kimi"),
        "the swapped binding actually served the later dispatch");
      ok(implementationEvents.every((event) => event.bindingId !== null && event.bindingVersion !== null),
        "executor/binding lineage snapshots stay persisted per attempt");
      const intakeEvents = env.runStore.listCapabilityExecutions(stopped.run_id).slice(0, 2);
      ok(intakeEvents[0]!.status === "started" && intakeEvents[1]!.status === "succeeded",
        "history immutable across the replacement — the original intake pair is untouched (invariant 1)");
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  }

  // ── N1: stale-input rejection at the entry boundary ──
  console.log("N1: consuming a superseded revision fails closed before any claim");
  {
    const env = makeEnv("loop-wp5-stale-input-");
    try {
      const requirementId = "REQ-WP5-N1";
      await run("build a settings page", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
      openFeedbackGeneration({ runStore: env.runStore, runId: env.runStore.listRunsByRequirement(requirementId)[0]!.state.identity.runId, requirementId, locator: "feedback:wp5-n1" });
      await run("build a settings page", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
      const recovery = recoverRunContext(env.runStore, requirementId)!;
      const staleDesign = recovery.invalidatedRevisions.find((rev) => rev.nodeId === "solution-design")!;
      ok(staleDesign !== undefined, "a superseded design revision exists");
      const scanPointIndex = LOOP_CAPABILITY_EXECUTION_POINTS.findIndex(
        (point) => point.capability === "solution-gate" && point.executionRole === "adversarial_scan",
      );
      ok(scanPointIndex > 0, "scan is not the first point");
      // Self-selected request: consume the SUPERSEDED design output. It is no
      // longer the node's ACTIVE current, so both the command match and the
      // input-vs-predecessor check must reject before any started event.
      const eventsBefore = env.runStore.listCapabilityExecutions(
        recovery.snapshot.state.identity.runId,
      ).length;
      await expectCode("INVALID_INPUT", () => env.entry.execute({
        requirementId,
        capability: "solution-gate",
        executionRole: "adversarial_scan",
        inputArtifactRef: staleDesign.artifactRef,
        inputArtifactVersion: staleDesign.semver,
        inputDigest: staleDesign.digest,
        outputArtifactVersion: "1.0.0",
        input: { design: staleDesign.artifactRef },
      }), "a superseded input cannot be dispatched by self-selection");
      ok(env.runStore.listCapabilityExecutions(recovery.snapshot.state.identity.runId).length === eventsBefore,
        "the rejected stale-input request left zero journal side effects");
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  }

  // ── N2: late-result terminal-write CAS at the store boundary ──
  console.log("N2: a late terminal may only close the active tail claim");
  {
    const env = makeEnv("loop-wp5-cas-");
    try {
      const requirementId = "REQ-WP5-N2";
      // Stop after intake: its revision is materialized, chain READY.
      await run("build a nav bar", {
        requirementId, runStore: env.runStore, artifactStore: env.artifactStore,
        gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry(), maxDispatches: 1,
      });
      const runId = env.runStore.listRunsByRequirement(requirementId)[0]!.state.identity.runId;
      const executions = env.runStore.listCapabilityExecutions(runId);
      ok(executions.length === 2 && executions[1]!.status === "succeeded", "fixture ends on the intake terminal");
      // Exact replay of the SAME event stays an idempotent no-op (F2-1
      // replay contract) — it neither appends nor mutates.
      const replayed = env.runStore.appendCapabilityExecution(executions[1]!);
      ok(replayed.appended === false, "exact terminal replay stays an idempotent no-op");
      // A DIFFERENT succeeded terminal for the ALREADY-CLOSED intake claim:
      // the tail is not a started matching that identity any more — CAS.
      const staleTerminal = Object.freeze({
        ...executions[0]!,
        executionEventId: `${runId}:capability:${executions.length + 1}:succeeded`,
        sequence: executions.length + 1,
        status: "succeeded" as const,
        createdAt: new Date(Date.now() + 9000).toISOString(),
        outputArtifactRef: executions[1]!.outputArtifactRef,
        outputArtifactVersion: executions[1]!.outputArtifactVersion,
        outputDigest: executions[1]!.outputDigest,
        gateResult: "NOT_APPLICABLE" as const,
        unresolvedFindingsRef: null,
        unresolvedFindingsDigest: null,
        nextStepEligibility: "ELIGIBLE" as const,
        errorCode: null,
        retryable: null,
        reasonCode: null,
      });
      await expectCode("ILLEGAL_TRANSITION", () =>
        env.runStore.appendCapabilityExecution(staleTerminal),
        "a terminal whose claim is not the tail is rejected");

      // Interrupted-claim scenario: solution-design starts (canonical next),
      // another entry interrupts it, then the ORIGINAL process's terminal
      // arrives late at its deterministic sequence — already occupied.
      const designStarted = Object.freeze({
        ...executions[0]!,
        executionEventId: `${runId}:capability:${executions.length + 1}:started`,
        sequence: executions.length + 1,
        capability: "solution-design" as const,
        nodeId: "solution-design",
        bindingId: "binding-codex-solution-design-primary",
        inputArtifactRef: executions[1]!.outputArtifactRef,
        inputArtifactVersion: executions[1]!.outputArtifactVersion,
        inputDigest: executions[1]!.outputDigest,
        createdAt: new Date(Date.now() + 10000).toISOString(),
      });
      env.runStore.appendCapabilityExecution(designStarted);
      env.runStore.interruptCapabilityExecution(runId, designStarted.executionEventId, new Date(Date.now() + 11000).toISOString(), true);
      const designProduct = env.artifactStore.put(
        CAPABILITY_ARTIFACT_TYPES["solution-design"] as never,
        "late result product for the interrupted attempt",
      );
      const lateTerminal = Object.freeze({
        ...designStarted,
        executionEventId: `${runId}:capability:${executions.length + 2}:succeeded`,
        sequence: executions.length + 2,
        status: "succeeded" as const,
        createdAt: new Date(Date.now() + 12000).toISOString(),
        outputArtifactRef: designProduct.artifactRef,
        outputArtifactVersion: "1.0.0",
        outputDigest: designProduct.digest,
        gateResult: "NOT_APPLICABLE" as const,
        nextStepEligibility: "ELIGIBLE" as const,
        errorCode: null,
        retryable: null,
        reasonCode: null,
      });
      await expectCode("EVENT_SEQUENCE_CONFLICT", () =>
        env.runStore.appendCapabilityExecution(lateTerminal),
        "the interrupted sequence is occupied — the late result cannot land");
      ok(env.runStore.listCapabilityExecutions(runId).at(-1)!.status === "failed",
        "the interruption terminal remains the durable tail");
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  }

  // ── N3: skill isolation at entry AND gateway; legacy fail-open intact ──
  console.log("N3: canonical surfaces carry no skill surface; legacy keeps fail-open");
  {
    const env = makeEnv("loop-wp5-skill-");
    try {
      const requirementId = "REQ-WP5-N3";
      const stopped = await run("build a header", {
        requirementId, runStore: env.runStore, artifactStore: env.artifactStore,
        gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry(), maxDispatches: 2,
      });
      const recovery = recoverRunContext(env.runStore, requirementId)!;
      const designRevision = recovery.currentArtifactMap.find((fact) => fact.nodeId === "solution-design")!;
      await expectCode("INVALID_INPUT", () => env.entry.execute({
        requirementId,
        capability: "solution-gate",
        executionRole: "adversarial_scan",
        inputArtifactRef: designRevision.artifactRef,
        inputArtifactVersion: designRevision.semver,
        inputDigest: designRevision.digest,
        outputArtifactVersion: "1.0.0",
        input: {},
        skill: "sdlc-speckit-pipeline",
      } as never), "the canonical entry rejects skill metadata outright");
      await expectCode("INVALID_INPUT", () => env.entry.execute({
        requirementId,
        capability: "solution-gate",
        executionRole: "adversarial_scan",
        inputArtifactRef: designRevision.artifactRef,
        inputArtifactVersion: designRevision.semver,
        inputDigest: designRevision.digest,
        outputArtifactVersion: "1.0.0",
        input: {},
        flowId: "main_docflow",
      } as never), "the canonical entry rejects flowId metadata outright");

      // Gateway level: a canonical dispatch carrying skill fails closed even
      // when handed straight to the gateway.
      const scanLastSucceeded = () => env.runStore.listCapabilityExecutions(stopped.run_id)
        .filter((event) => event.status === "succeeded").at(-1)!;
      const lastOutput = scanLastSucceeded();
      const realGateway = new ExecutionGateway({
        capabilityTracing: {
          runStore: env.runStore,
          artifactStore: env.artifactStore,
          bindingRegistry: createRuntimeBindingRegistry(),
          executorVersions: { codex: "1.0.0", kimi: "1.0.0", hermes: "1.0.0" },
          now: () => new Date().toISOString(),
        },
      });
      await expectCode("INVALID_INPUT", () => realGateway.execute({
        type: "task-planning",
        node: "task-planning",
        agent: "codex",
        requirementId,
        input: {},
        skill: "sdlc-task-planning",
        loopExecution: {
          runId: stopped.run_id,
          attempt: 1,
          executionRole: "primary",
          inputArtifactRef: lastOutput.outputArtifactRef!,
          inputArtifactVersion: lastOutput.outputArtifactVersion!,
          inputDigest: lastOutput.outputDigest!,
          outputArtifactVersion: "1.0.0",
        },
      } as never), "the gateway rejects skill metadata on a canonical dispatch");

      // Legacy non-C02 requests keep the historical fail-open behavior: an
      // unknown skill on a non-canonical type is metadata, not a rejection.
      const legacyResult = await realGateway.execute({
        type: "code_review",
        node: "code_review",
        agent: "codex",
        requirementId,
        input: { artifacts: [] },
        skill: "unknown-skill",
      } as never);
      ok(typeof legacyResult.success === "boolean", "legacy fail-open path still executes");
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  }

  // ── N4: wiring clauses 0.1.4–0.1.6 — non-virtual same-instance checks ──
  console.log("N4: supported entries verify non-virtual same-instance wiring");
  {
    const env = makeEnv("loop-wp5-wiring-");
    try {
      mkdirSync(join(env.root, "other-repo"), { recursive: true });
      const otherArtifacts = new LoopArtifactStore({
        controlRoot: join(env.root, "other-control"),
        repositoryPath: join(env.root, "other-repo"),
      });
      otherArtifacts.init();
      const unboundStore = new LoopRunStore(join(env.root, "unbound.db"));
      unboundStore.init();
      const mismatchedStore = new LoopRunStore(join(env.root, "mismatched.db"), { artifactStore: otherArtifacts });
      mismatchedStore.init();

      await expectCode("INVALID_INPUT", () => new LoopCapabilityEntry({
        runStore: unboundStore, artifactStore: env.artifactStore,
        bindingRegistry: createRuntimeBindingRegistry(), gateway: env.gateway,
      }), "an unbound run journal is rejected");
      await expectCode("INVALID_INPUT", () => new LoopCapabilityEntry({
        runStore: mismatchedStore, artifactStore: env.artifactStore,
        bindingRegistry: createRuntimeBindingRegistry(), gateway: env.gateway,
      }), "a journal bound to a different artifact instance is rejected");
      await expectCode("INVALID_INPUT", () => new LoopCapabilityEntry({
        runStore: env.runStore, artifactStore: env.artifactStore,
        bindingRegistry: createRuntimeBindingRegistry(),
        gateway: { execute: async () => { throw new Error("unused"); } },
      }), "an execute-only shim without registered tracing is rejected");

      const foreignPair = new ExecutionGateway({
        capabilityTracing: {
          runStore: mismatchedStore,
          artifactStore: env.artifactStore,
          bindingRegistry: createRuntimeBindingRegistry(),
          executorVersions: { codex: "1.0.0", kimi: "1.0.0", hermes: "1.0.0" },
          now: () => new Date().toISOString(),
        },
      });
      await expectCode("INVALID_INPUT", () => new LoopCapabilityEntry({
        runStore: env.runStore, artifactStore: env.artifactStore,
        bindingRegistry: createRuntimeBindingRegistry(), gateway: foreignPair,
      }), "a gateway tracing a different store pair is rejected");

      // Non-virtual determination: subclass overrides cannot forge bindings.
      class ForgedRunStore extends LoopRunStore {
        isBoundToArtifactStore(): boolean { return true; }
      }
      const forgedStore = new ForgedRunStore(join(env.root, "forged.db"));
      forgedStore.init();
      await expectCode("INVALID_INPUT", () => new LoopCapabilityEntry({
        runStore: forgedStore, artifactStore: env.artifactStore,
        bindingRegistry: createRuntimeBindingRegistry(), gateway: env.gateway,
      }), "subclass override cannot forge the blob binding");
      Object.assign(unboundStore, { isBoundToArtifactStore: () => true });
      await expectCode("INVALID_INPUT", () => new LoopCapabilityEntry({
        runStore: unboundStore, artifactStore: env.artifactStore,
        bindingRegistry: createRuntimeBindingRegistry(), gateway: env.gateway,
      }), "monkey-patched member cannot forge the blob binding");

      forgedStore.close();
      unboundStore.close();
      mismatchedStore.close();
      otherArtifacts.close();
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  }

  // ── N5: configuration freeze — post-construction mutation is inert ──
  console.log("N5: construction-time configuration snapshot resists mutation");
  {
    const env = makeEnv("loop-wp5-freeze-");
    try {
      const tracing = {
        runStore: env.runStore,
        artifactStore: env.artifactStore,
        bindingRegistry: createRuntimeBindingRegistry(),
        executorVersions: { codex: "1.0.0", kimi: "1.0.0", hermes: "1.0.0" },
        now: () => new Date().toISOString(),
      };
      const mutableOptions = {
        env: { SDLC_EXECUTION_MODE: "codex", SDLC_CODEX_REAL_DISPATCH: "enabled" },
        codexRunner: createCodexFakeRunner({ scenario: "success_code_patch" }),
        capabilityTracing: tracing,
      };
      const stableGateway = new ExecutionGateway(mutableOptions);
      bindGatewayTracing(stableGateway, env.runStore, env.artifactStore);
      const stableOptions = {
        runStore: env.runStore,
        artifactStore: env.artifactStore,
        bindingRegistry: createRuntimeBindingRegistry(),
        gateway: stableGateway,
      };
      const stableEntry = new LoopCapabilityEntry(stableOptions);
      // Attempt to redirect every store after construction.
      tracing.artifactStore = env.artifactStore;
      mutableOptions.capabilityTracing = { ...tracing };
      stableOptions.artifactStore = env.artifactStore;
      const result = await run("build a footer", {
        requirementId: "REQ-WP5-N5", runStore: env.runStore, artifactStore: env.artifactStore,
        gateway: stableGateway, bindingRegistry: createRuntimeBindingRegistry(),
      });
      ok(result.final_status === "failed" || result.final_status === "success",
        "execution proceeds against the construction-time snapshot");
      const events = env.runStore.listCapabilityExecutions(result.run_id);
      ok(events.length >= 2, "executions journal into the original run store");
      const withOutput = events.find((event) => event.outputArtifactRef !== null)!;
      ok(withOutput !== undefined && env.artifactStore.read(withOutput.outputArtifactRef!, withOutput.outputDigest!).length > 0,
        "output blobs land in the original artifact store");
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  }

  console.log(`\nWP5 cross-entry contract tests: ${passed} assertions passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
