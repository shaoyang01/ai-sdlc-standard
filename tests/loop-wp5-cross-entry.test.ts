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
import { mkdtempSync, mkdirSync, readdirSync, rmSync } from "node:fs";
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
import { LoopRunJournalError } from "../core/loop-executor-types";
import { validateBootstrapSourceProvenance } from "../core/loop-run-state";
import { withResumeLease } from "../core/loop-resume-lock";
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
  /** Defaults to closing generation 1 (opening generation 2). */
  closesGeneration?: number;
}): void {
  const previousGeneration = o.closesGeneration ?? 1;
  const sequence = previousGeneration;
  o.runStore.appendRequirementChange(createLoopRequirementChangeRecord({
    runId: o.runId,
    requirementId: o.requirementId,
    sequence,
    status: "CLASSIFIED",
    changeKind: "FEEDBACK_DRIVEN_CHANGE",
    payloadForm: "DELTA_CHANGE",
    previousGeneration,
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
  category?: "REQUIREMENT" | "SOLUTION" | "PLANNING" | "IMPLEMENTATION" | "REVIEW" | "KNOWLEDGE";
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
    category: o.category ?? "IMPLEMENTATION",
    evidenceRef: `loop-artifact:v1:${current.artifactKind}:sha256:${current.digest}`,
    evidenceDigest: current.digest,
    earliestAffectedNodeId: o.earliestAffectedNodeId,
    createdAt: new Date(Date.now() + (o.sequence + 10) * 1000).toISOString(),
  });
  o.runStore.appendFinding(finding);
  return finding.findingId;
}

const ALL_POINTS = 8;


function assertSameAuthorityFacts(a: NonNullable<ReturnType<typeof recoverRunContext>>, b: NonNullable<ReturnType<typeof recoverRunContext>>, label: string): void {
  // C02-WP5 B2: STRUCTURAL deep equality over the ENTIRE recovery authority
  // — any field drifting on one connection only (originRequirementInput,
  // solutionGateDecision, findingGate, pendingRevisionMaterialization,
  // execution states, ...) must fail this oracle. No exclusion list: every
  // field of RunRecoveryContext is authoritative plain frozen data.
  try {
    assert.deepStrictEqual(b, a);
  } catch (error) {
    assert.fail(`${label}: recovery authorities diverge — ${(error as Error).message.split("\n")[0]}`);
  }
  passed += 1;
  ok(JSON.stringify(deriveDispatchCommand(a)) === JSON.stringify(deriveDispatchCommand(b)),
    `${label}: dispatch command identical`);
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


function pointDispatchCounts(store: InstanceType<typeof LoopRunStore>, runId: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of store.listCapabilityExecutions(runId)) {
    if (event.status !== "started") continue;
    const key = `${event.capability}:${event.executionRole}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

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

      // F2: a THIRD generation driven by a call passing CONTRADICTORY
      // requirement text — the wave must still consume the ORIGINAL pinned
      // source, never the replacement content.
      const originalIntake = env.runStore.listCapabilityExecutions(
        env.runStore.listRunsByRequirement(requirementId)[0]!.state.identity.runId,
      ).find((event) => event.capability === "requirement-intake" && event.attempt === 1)!;
      openFeedbackGeneration({ runStore: env.runStore, runId: originalIntake.runId, requirementId, locator: "feedback:wp5-p2-gen3", closesGeneration: 2 });
      const gen3 = await run("CONTRADICTORY-REPLACEMENT-REQUIREMENT", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
      ok(gen3.final_status === "success", "generation 3 completes despite the contradictory argument text");
      const gen3Intake = env.runStore.listCapabilityExecutions(gen3.run_id)
        .filter((event) => event.capability === "requirement-intake")
        .at(-1)!;
      ok(gen3Intake.attempt === 3 && gen3Intake.inputArtifactRef === originalIntake.inputArtifactRef &&
        gen3Intake.inputDigest === originalIntake.inputDigest,
        "the generation-3 intake consumed the ORIGINAL pinned source, not the replacement text");
      const recoveryGen3 = recoverRunContext(env.runStore, requirementId)!;
      ok(recoveryGen3.latestChangeRecord!.sequence === 2 &&
        recoveryGen3.latestChangeRecord!.previousGeneration === 2 &&
        recoveryGen3.latestChangeRecord!.changeKind === "FEEDBACK_DRIVEN_CHANGE",
        "the change authority projects the LATEST record (sequence/generation/kind pinned)");
      ok(recoveryGen3.latestChangeRecord!.confirmedFactsPreserved.includes("login flow behavior stays"),
        "confirmed facts preserved across processes in the change authority");
      // B2: the SAME non-trivial authority (non-empty change record,
      // invalidated revisions, multiple attempts) recovered through a SECOND
      // process must deep-equal the first connection — including origin
      // source pinning and confirmed facts.
      const gen3Other = secondProcess(env);
      const recoveryGen3Other = recoverRunContext(gen3Other.runStore, requirementId)!;
      assertSameAuthorityFacts(recoveryGen3, recoveryGen3Other, "gen-3 second process");
      gen3Other.runStore.close();
      gen3Other.artifactStore.close();
      ok(recoveryGen3Other.latestChangeRecord!.confirmedFactsPreserved.includes("login flow behavior stays") &&
        recoveryGen3Other.originRequirementInput !== null &&
        recoveryGen3Other.originRequirementInput!.inputArtifactRef === originalIntake.inputArtifactRef,
        "second process restores confirmed facts and the pinned origin source");
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
      // the FULL recovered fact base and the derived command must match the
      // first connection's exactly — not just generation or chain status.
      const other = secondProcess(env);
      const crossRecovery = recoverRunContext(other.runStore, requirementId)!;
      const originRecovery = recoverRunContext(env.runStore, requirementId)!;
      assertSameAuthorityFacts(originRecovery, crossRecovery, "cross-process recovery");
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
      // Suggested-item hygiene: explicit connection close before temp cleanup.
      other.runStore.close();
      other.artifactStore.close();
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

      // F4: canonical WITHOUT a loopExecution context never falls to the
      // legacy path either — untraced or not, it fails closed.
      const untraced = new ExecutionGateway();
      await expectCode("INVALID_INPUT", () => untraced.execute({
        type: "task-planning", node: "task-planning", agent: "codex",
        requirementId, input: {}, skill: "sdlc-task-planning",
      } as never), "untraced gateway rejects canonical dispatch carrying skill");
      await expectCode("INVALID_INPUT", () => untraced.execute({
        type: "task-planning", node: "task-planning", agent: "codex",
        requirementId, input: {},
      } as never), "untraced gateway rejects canonical dispatch without context");

      // F4: the deterministic face enforces the same firewall directly.
      const deterministic = createDeterministicCapabilityGateway({
        runStore: env.runStore,
        artifactStore: env.artifactStore,
        bindingRegistry: createRuntimeBindingRegistry(),
        now: () => new Date().toISOString(),
      });
      const eventsBeforeDeterministicSkill = env.runStore.listCapabilityExecutions(stopped.run_id).length;
      const runsBeforeDeterministicSkill = env.runStore.listRunsByRequirement(requirementId).length;
      const artifactsBeforeDeterministicSkill = countFilesRecursive(env.root);
      await expectCode("INVALID_INPUT", () => deterministic.execute({
        type: "solution-gate", node: "solution-gate", agent: "codex",
        requirementId, input: {}, skill: "sdlc-speckit-pipeline",
        loopExecution: {
          runId: stopped.run_id, attempt: 1, executionRole: "adversarial_scan",
          inputArtifactRef: designRevision.artifactRef,
          inputArtifactVersion: designRevision.semver,
          inputDigest: designRevision.digest,
          outputArtifactVersion: "1.0.0",
        },
      } as never), "deterministic gateway rejects skill metadata outright");
      ok(env.runStore.listCapabilityExecutions(stopped.run_id).length === eventsBeforeDeterministicSkill,
        "the rejected deterministic dispatch left zero journal side effects");
      ok(env.runStore.listRunsByRequirement(requirementId).length === runsBeforeDeterministicSkill,
        "the rejected deterministic skill dispatch created zero runs");
      ok(countFilesRecursive(env.root) === artifactsBeforeDeterministicSkill,
        "the rejected deterministic skill dispatch wrote zero artifact files");
      const eventsBeforeForged = env.runStore.listCapabilityExecutions(stopped.run_id).length;
      const runsBeforeForged = env.runStore.listRunsByRequirement("REQ-FORGED-IDENTITY").length;
      const artifactsBeforeForged = countFilesRecursive(env.root);
      await expectCode("INVALID_INPUT", () => deterministic.execute({
        type: "solution-gate", node: "solution-gate", agent: "codex",
        requirementId: "REQ-FORGED-IDENTITY", input: {},
        loopExecution: {
          runId: stopped.run_id, attempt: 1, executionRole: "adversarial_scan",
          inputArtifactRef: designRevision.artifactRef,
          inputArtifactVersion: designRevision.semver,
          inputDigest: designRevision.digest,
          outputArtifactVersion: "1.0.0",
        },
      } as never), "deterministic gateway rejects a forged Requirement identity");
      ok(env.runStore.listCapabilityExecutions(stopped.run_id).length === eventsBeforeForged &&
        env.runStore.listRunsByRequirement("REQ-FORGED-IDENTITY").length === runsBeforeForged,
        "forged identity rejection wrote zero journal events and zero runs");
      ok(countFilesRecursive(env.root) === artifactsBeforeForged,
        "forged identity rejection wrote zero artifact files");
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

      // F3/B2: EXACT export audit — neither owning module exposes ANY
      // registrar-shaped symbol (bind*/register*/...Registrar), and both
      // read predicates exist. A renamed registrar cannot slip through.
      const storeModule = await import("../core/loop-run-store");
      const gatewayModule = await import("../execution/gateway");
      const registrarShaped = (key: string): boolean =>
        /^bind/i.test(key) || /^register/i.test(key) || /registrar$/i.test(key);
      ok(Object.keys(storeModule).filter(registrarShaped).join(",") === "",
        `run store module exposes no registrar-shaped export (got ${Object.keys(storeModule).filter(registrarShaped).join(",")})`);
      ok(Object.keys(gatewayModule).filter(registrarShaped).join(",") === "",
        `gateway module exposes no registrar-shaped export (got ${Object.keys(gatewayModule).filter(registrarShaped).join(",")})`);
      ok(typeof storeModule.isLoopRunStoreBoundToArtifactStore === "function" &&
        typeof gatewayModule.isExecutionGatewayTracingBoundTo === "function",
        "both read-only wiring predicates remain exported");
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  }

  // ── F1R: the claim is verified against the CURRENT recovery authority ──
  console.log("F1R: a stale command cannot open an attempt after facts moved");
  {
    const env = makeEnv("loop-wp5-f1r-");
    try {
      const requirementId = "REQ-WP5-F1R";
      // Stop after intake + solution-design (both materialized): recovery
      // says the unique next action is the solution-gate scan.
      await run("build a sidebar", {
        requirementId, runStore: env.runStore, artifactStore: env.artifactStore,
        gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry(), maxDispatches: 2,
      });
      const runId = env.runStore.listRunsByRequirement(requirementId)[0]!.state.identity.runId;
      const before = recoverRunContext(env.runStore, requirementId)!;
      ok(before.nextExecutionPoint?.capability === "solution-gate", "fixture next action is the scan point");
      const designCurrent = before.currentArtifactMap.find((fact) => fact.nodeId === "solution-design")!;
      const nextSequence = env.runStore.listCapabilityExecutions(runId).length + 1;
      // A well-formed scan claim matching the CURRENT command…
      const staleScanStarted = Object.freeze({
        schemaVersion: LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION,
        executionEventId: `${runId}:capability:${nextSequence}:started`,
        runId,
        sequence: nextSequence,
        status: "started" as const,
        capability: "solution-gate" as const,
        nodeId: "solution-gate",
        executionRole: "adversarial_scan" as const,
        attempt: 1,
        bindingId: "binding-codex-solution-gate-adversarial_scan",
        bindingVersion: "1.0.0",
        bindingRegistryVersion: "1",
        executorAgent: "codex",
        executorAdapter: "codex-real-dispatch",
        executorVersion: "1.0.0",
        inputArtifactRef: designCurrent.artifactRef,
        inputArtifactVersion: designCurrent.semver,
        inputDigest: designCurrent.digest,
        consumedFindingsRef: null,
        consumedFindingsDigest: null,
        decisionDepth: null,
        decisionScopeId: null,
        decisionDeltaRef: null,
        decisionDeltaDigest: null,
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
        createdAt: new Date(Date.now() + 20000).toISOString(),
      });
      // …then the facts move UNDER it: a causal regression invalidates the
      // solution-design current and re-routes the unique next action back to
      // solution-design (exactly the reviewer's repro sequence).
      appendRegressionFinding({
        runStore: env.runStore, runId, requirementId,
        sourceCapability: "solution-design", earliestAffectedNodeId: "solution-design",
        category: "SOLUTION", sequence: 1,
      });
      const afterMove = recoverRunContext(env.runStore, requirementId)!;
      ok(afterMove.nextExecutionPoint!.capability === "solution-design",
        "the finding re-routed the unique next action before the claim");
      const executionsBeforeClaim = env.runStore.listCapabilityExecutions(runId).length;
      await expectCode("ILLEGAL_TRANSITION", () =>
        env.runStore.claimNextCapabilityExecution(staleScanStarted),
        "the store rejects a claim whose command is no longer the authority's");
      ok(env.runStore.listCapabilityExecutions(runId).length === executionsBeforeClaim,
        "the rejected stale claim left zero journal side effects");
      // Positive control: the CURRENT authority's own command claims cleanly.
      const intakeCurrent = afterMove.currentArtifactMap.find((fact) => fact.nodeId === "requirement-intake")!;
      const freshDesignClaim = Object.freeze({
        ...staleScanStarted,
        executionEventId: `${runId}:capability:${executionsBeforeClaim + 1}:started`,
        sequence: executionsBeforeClaim + 1,
        capability: "solution-design" as const,
        nodeId: "solution-design",
        executionRole: "primary" as const,
        bindingId: "binding-codex-solution-design-primary",
        attempt: 2,
        inputArtifactRef: intakeCurrent.artifactRef,
        inputArtifactVersion: intakeCurrent.semver,
        inputDigest: intakeCurrent.digest,
        createdAt: new Date(Date.now() + 21000).toISOString(),
      });
      const claimed = env.runStore.claimNextCapabilityExecution(freshDesignClaim);
      ok(claimed.appended === true && claimed.event.capability === "solution-design",
        "the authority's own current command claims successfully");
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  }

  // ── N5: configuration freeze — post-construction mutation is inert ──
  console.log("N5: swapping stores after construction cannot redirect wiring");
  {
    const env = makeEnv("loop-wp5-freeze-");
    try {
      mkdirSync(join(env.root, "foreign-repo"), { recursive: true });
      const foreignArtifacts = new LoopArtifactStore({
        controlRoot: join(env.root, "foreign-control"),
        repositoryPath: join(env.root, "foreign-repo"),
      });
      foreignArtifacts.init();
      const foreignRunStore = new LoopRunStore(join(env.root, "foreign.db"), { artifactStore: foreignArtifacts });
      foreignRunStore.init();

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
      const stableOptions = {
        runStore: env.runStore,
        artifactStore: env.artifactStore,
        bindingRegistry: createRuntimeBindingRegistry(),
        gateway: stableGateway,
      };
      const stableEntry = new LoopCapabilityEntry(stableOptions);
      // REAL mutation attempt: redirect every store to the FOREIGN pair.
      tracing.runStore = foreignRunStore;
      tracing.artifactStore = foreignArtifacts;
      mutableOptions.capabilityTracing = {
        ...tracing,
        runStore: foreignRunStore,
        artifactStore: foreignArtifacts,
      };
      stableOptions.runStore = foreignRunStore;
      stableOptions.artifactStore = foreignArtifacts;

      const result = await run("build a footer", {
        requirementId: "REQ-WP5-N5", runStore: env.runStore, artifactStore: env.artifactStore,
        gateway: stableGateway, bindingRegistry: createRuntimeBindingRegistry(), maxDispatches: 2,
      });
      ok(result.chain_status === "READY" && result.execution_trace.length === 4,
        "the codex-served points dispatched against the construction-time snapshot");
      const events = env.runStore.listCapabilityExecutions(result.run_id);
      ok(events.length === 4, "executions journal into the ORIGINAL run store");
      const withOutput = events.find((event) => event.outputArtifactRef !== null)!;
      ok(withOutput !== undefined && env.artifactStore.read(withOutput.outputArtifactRef!, withOutput.outputDigest!).length > 0,
        "output blobs land in the ORIGINAL artifact store");
      ok(foreignRunStore.listRunsByRequirement("REQ-WP5-N5").length === 0,
        "the foreign run store received nothing");

      // B2: the constructed stableEntry must ALSO execute — and against its
      // construction-time pair, proving entry-side options are snapshotted
      // (a mutable-options defect would route this run into the FOREIGN
      // store and this assertion would fail).
      const entryRequirementId = "REQ-WP5-N5-ENTRY";
      const entrySource = env.artifactStore.put("requirement_summary", "N5 direct entry source");
      await stableEntry.execute({
        requirementId: entryRequirementId,
        identity: Object.freeze({
          runId: `run-${entryRequirementId}`,
          requirementId: entryRequirementId,
          repository: "local",
          repositoryPath: join(env.root, "repo"),
          baseBranch: "main",
          expectedBaseSha: "0".repeat(40),
          taskBranch: `runtime/${entryRequirementId}`,
          controlRoot: join(env.root, "control"),
          createdAt: new Date().toISOString(),
        }),
        capability: "requirement-intake",
        executionRole: "primary",
        inputArtifactRef: entrySource.artifactRef,
        inputArtifactVersion: "1.0.0",
        inputDigest: entrySource.digest,
        outputArtifactVersion: "1.0.0",
        input: {},
      });
      const entryEvents = env.runStore.listCapabilityExecutions(`run-${entryRequirementId}`);
      ok(entryEvents.length === 2 && entryEvents[1]!.status === "succeeded",
        "stableEntry journals into the ORIGINAL run store");
      // B2-1: the output blob must live in the ORIGINAL artifact store and
      // the foreign artifact store must not gain a single file.
      const outputRef = entryEvents[1]!.outputArtifactRef!;
      const outputDigest = entryEvents[1]!.outputDigest!;
      ok(outputRef !== null && env.artifactStore.read(outputRef, outputDigest).length > 0,
        "stableEntry's output blob is readable from the ORIGINAL artifact store");
      const foreignArtifactsAfter = countFilesRecursive(join(env.root, "foreign-control")) +
        countFilesRecursive(join(env.root, "foreign-repo"));
      ok(foreignArtifactsAfter === 0,
        `foreign artifact store stayed empty (got ${foreignArtifactsAfter} files)`);
      ok(foreignRunStore.listRunsByRequirement(entryRequirementId).length === 0,
        "the mutated options never redirect the entry");
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  }


  // ── B1R: crash-window recovery matrix (invariant 14) ──
  console.log("B1R: bootstrap/active-claim crash windows recover without reinterpreting facts");
  {
    // Row: run_started 后、intake started 前 — durable anchor exists, ZERO
    // claims yet. A resuming call passing CONTRADICTORY text must still
    // dispatch the intake consuming the ANCHOR triple.
    console.log("B1R.row2: pre-claim crash consumes the pinned anchor, not the resume text");
    const envA = makeEnv("loop-wp5-b1r-preclaim-");
    try {
      const requirementId = "REQ-WP5-B1R-PRE";
      const anchorSource = envA.artifactStore.put("requirement_summary", "ORIGINAL-PINNED-REQUIREMENT");
      // Simulate the durable state right after atomic bootstrap, before any
      // claim: run exists + run_started provenance + zero executions.
      envA.runStore.bootstrapRunWithSource(Object.freeze({
        runId: `run-${requirementId}`,
        requirementId,
        repository: "local",
        repositoryPath: join(envA.root, "repo"),
        baseBranch: "main",
        expectedBaseSha: "0".repeat(40),
        taskBranch: `runtime/${requirementId}`,
        controlRoot: join(envA.root, "control"),
        createdAt: new Date().toISOString(),
      }), { artifactRef: anchorSource.artifactRef, digest: anchorSource.digest });
      ok(envA.runStore.listCapabilityExecutions(`run-${requirementId}`).length === 0,
        "fixture: bootstrapped run holds zero capability events");
      const contradictory = envA.artifactStore.put("requirement_summary", "CONTRADICTORY-REPLACEMENT-TEXT");
      const resumed = await run("CONTRADICTORY-REPLACEMENT-TEXT", {
        requirementId, runStore: envA.runStore, artifactStore: envA.artifactStore,
        gateway: envA.gateway, bindingRegistry: createRuntimeBindingRegistry(), maxDispatches: 2,
      });
      ok(resumed.final_status === "failed" || resumed.final_status === "success",
        "the pre-claim crash resumes dispatching");
      const intakeStarted = envA.runStore.listCapabilityExecutions(resumed.run_id)
        .find((event) => event.capability === "requirement-intake")!;
      ok(intakeStarted.inputArtifactRef === anchorSource.artifactRef &&
        intakeStarted.inputDigest === anchorSource.digest &&
        intakeStarted.inputArtifactRef !== contradictory.artifactRef,
        "the recovered intake consumed the PINNED anchor, never the contradictory text");
      ok(recoverRunContext(envA.runStore, requirementId)!.originRequirementInput!.inputArtifactRef
        === anchorSource.artifactRef,
        "origin authority remains the anchor after resume");
    } finally {
      rmSync(envA.root, { recursive: true, force: true });
    }

    // Row: intake started 后、terminal 前 — active claim across process death.
    console.log("B1R.row3: active started claim resumes as ATTEMPT_INTERRUPTED + retry");
    const envB = makeEnv("loop-wp5-b1r-active-");
    try {
      const requirementId = "REQ-WP5-B1R-ACT";
      await run("build a panel", {
        requirementId, runStore: envB.runStore, artifactStore: envB.artifactStore,
        gateway: envB.gateway, bindingRegistry: createRuntimeBindingRegistry(), maxDispatches: 1,
      });
      const runId = envB.runStore.listRunsByRequirement(requirementId)[0]!.state.identity.runId;
      const beforeResume = recoverRunContext(envB.runStore, requirementId)!;
      ok(beforeResume.capabilityChainStatus === "READY", "fixture: clean READY after one materialized point");
      // Open an ACTIVE claim exactly as the authority would accept it.
      const intakeCurrent = beforeResume.currentArtifactMap.find((fact) => fact.nodeId === "requirement-intake")!;
      // Timestamps stay MONOTONIC against the journal tail (real crash
      // claims are past-dated; only the fixture must respect the rule).
      const journalTailTs = envB.runStore.listCapabilityExecutions(runId).at(-1)!.createdAt;
      const claimTs = new Date(Date.parse(journalTailTs) + 5).toISOString();
      const designStarted = Object.freeze({
        schemaVersion: LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION,
        executionEventId: `${runId}:capability:3:started`,
        sequence: 3,
        status: "started" as const,
        runId,
        capability: "solution-design" as const,
        nodeId: "solution-design",
        executionRole: "primary" as const,
        attempt: 1,
        bindingId: "binding-codex-solution-design-primary",
        bindingVersion: "2.0.0",
        bindingRegistryVersion: createRuntimeBindingRegistry().version,
        executorAgent: "codex",
        executorAdapter: "codex-real-dispatch",
        executorVersion: "1.0.0",
        inputArtifactRef: intakeCurrent.artifactRef,
        inputArtifactVersion: intakeCurrent.semver,
        inputDigest: intakeCurrent.digest,
        consumedFindingsRef: null,
        consumedFindingsDigest: null,
        decisionDepth: null,
        decisionScopeId: null,
        decisionDeltaRef: null,
        decisionDeltaDigest: null,
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
        createdAt: claimTs,
      });
      envB.runStore.claimNextCapabilityExecution(designStarted);
      const crashed = recoverRunContext(envB.runStore, requirementId)!;
      ok(crashed.capabilityChainStatus === "RUNNING" && crashed.nextExecutionPoint === null &&
        crashed.lastCapabilityExecution?.status === "started",
        "fixture: active started claim with no terminal — the crash window");
      const resumed = await run("build a panel", {
        requirementId, runStore: envB.runStore, artifactStore: envB.artifactStore,
        gateway: envB.gateway, bindingRegistry: createRuntimeBindingRegistry(),
      });
      ok(resumed.final_status === "success" && resumed.chain_status === "COMPLETED",
        "the active-claim crash resumes to completion");
      const designEvents = envB.runStore.listCapabilityExecutions(runId)
        .filter((event) => event.capability === "solution-design");
      ok(designEvents.length === 4, "design point holds exactly two attempts (four events)");
      const interrupted = designEvents[1]!;
      ok(interrupted.status === "failed" && interrupted.errorCode === "ATTEMPT_INTERRUPTED" &&
        interrupted.retryable === true,
        "the stale claim closed as a retryable ATTEMPT_INTERRUPTED");
      ok(interrupted.inputArtifactRef === designStarted.inputArtifactRef &&
        interrupted.bindingId === designStarted.bindingId,
        "the interruption copies the persisted input and binding lineage");
      const retried = designEvents[2]!;
      ok(retried.status === "started" && retried.attempt === 2 &&
        retried.inputArtifactRef === designStarted.inputArtifactRef,
        "attempt two retries the SAME recorded input lineage");
    } finally {
      rmSync(envB.root, { recursive: true, force: true });
    }
  }


  // ── B1-1: live-claim fencing under concurrent resumption ──
  console.log("B1-1.concurrent: two resumers on one stale claim produce exactly one external dispatch");
  {
    const env = makeEnv("loop-wp5-b11-concurrent-");
    try {
      const requirementId = "REQ-WP5-B11";
      await run("build a wizard", {
        requirementId, runStore: env.runStore, artifactStore: env.artifactStore,
        gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry(), maxDispatches: 1,
      });
      const runId = env.runStore.listRunsByRequirement(requirementId)[0]!.state.identity.runId;
      const beforeResume = recoverRunContext(env.runStore, requirementId)!;
      const intakeCurrent = beforeResume.currentArtifactMap.find((fact) => fact.nodeId === "requirement-intake")!;
      const journalTailTs = env.runStore.listCapabilityExecutions(runId).at(-1)!.createdAt;
      const claimTs = new Date(Date.parse(journalTailTs) + 5).toISOString();
      // BOTH resumers will observe this same stale claim.
      env.runStore.claimNextCapabilityExecution(Object.freeze({
        schemaVersion: LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION,
        executionEventId: `${runId}:capability:3:started`,
        sequence: 3,
        status: "started" as const,
        runId,
        capability: "solution-design" as const,
        nodeId: "solution-design",
        executionRole: "primary" as const,
        attempt: 1,
        bindingId: "binding-codex-solution-design-primary",
        bindingVersion: "2.0.0",
        bindingRegistryVersion: createRuntimeBindingRegistry().version,
        executorAgent: "codex",
        executorAdapter: "codex-real-dispatch",
        executorVersion: "1.0.0",
        inputArtifactRef: intakeCurrent.artifactRef,
        inputArtifactVersion: intakeCurrent.semver,
        inputDigest: intakeCurrent.digest,
        consumedFindingsRef: null,
        consumedFindingsDigest: null,
        decisionDepth: null,
        decisionScopeId: null,
        decisionDeltaRef: null,
        decisionDeltaDigest: null,
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
        createdAt: claimTs,
      }));
      const dispatchesBefore = pointDispatchCounts(env.runStore, runId);
      ok((dispatchesBefore.get("solution-design:primary") ?? 0) === 1,
        "fixture: the orphaned claim is attempt 1");
      const t0 = Date.now();
      const attempt = (tag: string) =>
        run("build a wizard", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() })
          .then((r) => ({ tag, ok: true as const, r }), (e: unknown) => ({ tag, ok: false as const, e }));
      const [ra, rb] = await Promise.all([attempt("A"), attempt("B")]);
      const resultA = ra.ok ? ra.r : null;
      const resultB = rb.ok ? rb.r : null;
      if (!ra.ok || !rb.ok) {
        ok(ra.ok === false && rb.ok === false ? false : true, "at least one resumer completed");
        // One side failing with STORE_BUSY under lease contention is an
        // accepted honest outcome as long as external dispatch stayed single.
      }
      const afterDispatches = pointDispatchCounts(env.runStore, runId);
      ok(afterDispatches.get("solution-design:primary") === 2,
        `EXACTLY ONE additional external dispatch across both resumers (got ${afterDispatches.get("solution-design:primary")})`);
      const designEvents = env.runStore.listCapabilityExecutions(runId)
        .filter((event) => event.capability === "solution-design");
      ok(designEvents.length === 4 && designEvents[1]!.errorCode === "ATTEMPT_INTERRUPTED",
        "the stale claim was interrupted exactly once");
      ok(designEvents[3]!.status === "succeeded" && designEvents[3]!.attempt === 2,
        "attempt 2 completed; no attempt inflation from the losing resumer");
      ok(resultA.final_status === "success" || resultB.final_status === "success",
        "at least one resumer drove the chain to completion");
      ok(
        (resultA.chain_status === "COMPLETED" || resultA.chain_status === "READY") &&
        (resultB.chain_status === "COMPLETED" || resultB.chain_status === "READY"),
        "neither resumer crashed the invocation — fencing is deterministic",
      );
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  }

  console.log("B1-1.lease: a held resume lease fails concurrent entry honestly");
  {
    const env = makeEnv("loop-wp5-b11-lease-");
    process.env["SDLC_RESUME_LEASE_BUSY_TIMEOUT_MS"] = "60";
    try {
      const requirementId = "REQ-WP5-B11-LEASE";
      const journalPath = env.runStore.databaseFilePath;
      // Hold the lease for the whole probe; the concurrent run must fail
      // with STORE_BUSY instead of interrupting anything.
      let releaseHolder!: () => void;
      const holder = new Promise<void>((resolve) => { releaseHolder = resolve; });
      const holdPromise = withResumeLease(journalPath, async () => {
        await holder;
        return null;
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      let busyCode = false;
      try {
        await run("build a dialog", {
          requirementId, runStore: env.runStore, artifactStore: env.artifactStore,
          gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry(),
        });
      } catch (error) {
        busyCode = error instanceof LoopRunJournalError && error.code === "STORE_BUSY";
      }
      ok(busyCode, "a concurrent run under a foreign lease fails with STORE_BUSY");
      ok(env.runStore.listCapabilityExecutions(`run-${requirementId}`).length === 0 &&
        env.runStore.listRunsByRequirement(requirementId).length === 0,
        "the lease-blocked run performed zero journal side effects");
      releaseHolder();
      await holdPromise;
      delete process.env["SDLC_RESUME_LEASE_BUSY_TIMEOUT_MS"];
    } finally {
      delete process.env["SDLC_RESUME_LEASE_BUSY_TIMEOUT_MS"];
      rmSync(env.root, { recursive: true, force: true });
    }
  }

  // ── B1-2: closed bootstrap provenance validator probes ──
  console.log("B1-2.probes: writer and reader share one bootstrap source validator");
  {
    const env = makeEnv("loop-wp5-b12-");
    try {
      const artifactsBaseline = countFilesRecursive(env.root);
      const requirementId = "REQ-WP5-B12";

      // Probe 1: non-string ref through the supported entry — INVALID_INPUT,
      // zero durable increments (no native TypeError leak).
      let rejectedNonString = false;
      try {
        await env.entry.execute({
          requirementId,
          identity: Object.freeze({
            runId: `run-${requirementId}-A`, requirementId, repository: "local",
            repositoryPath: join(env.root, "repo"), baseBranch: "main",
            expectedBaseSha: "0".repeat(40), taskBranch: "t",
            controlRoot: join(env.root, "control"), createdAt: new Date().toISOString(),
          }),
          capability: "requirement-intake",
          executionRole: "primary",
          inputArtifactRef: 42 as never,
          inputArtifactVersion: "1.0.0",
          inputDigest: "ab".repeat(32),
          outputArtifactVersion: "1.0.0",
          input: {},
        } as never);
      } catch (error) {
        rejectedNonString = error instanceof LoopRunJournalError && error.code === "INVALID_INPUT";
      }
      ok(rejectedNonString, "non-string artifactRef is rejected with INVALID_INPUT");

      // Probe 2: direct store bootstrap with a WRONG artifact kind — the
      // shared validator refuses before any transaction.
      let rejectedKind = false;
      try {
        env.runStore.bootstrapRunWithSource(Object.freeze({
          runId: `run-${requirementId}-B`, requirementId: `${requirementId}-B`, repository: "local",
          repositoryPath: join(env.root, "repo"), baseBranch: "main",
          expectedBaseSha: "0".repeat(40), taskBranch: "t2",
          controlRoot: join(env.root, "control"), createdAt: new Date().toISOString(),
        }), { artifactRef: `loop-artifact:v1:code_patch:sha256:${"cd".repeat(32)}`, digest: "cd".repeat(32) });
      } catch (error) {
        rejectedKind = error instanceof LoopRunJournalError && error.code === "INVALID_INPUT";
      }
      ok(rejectedKind, "wrong-kind provenance is rejected by the store boundary");

      // Probe 3: canonical-looking but MISSING blob — content confirmation
      // happens BEFORE any durable write.
      let rejectedMissingBlob = false;
      try {
        await env.entry.execute({
          requirementId,
          identity: Object.freeze({
            runId: `run-${requirementId}-C`, requirementId, repository: "local",
            repositoryPath: join(env.root, "repo"), baseBranch: "main",
            expectedBaseSha: "0".repeat(40), taskBranch: "t3",
            controlRoot: join(env.root, "control"), createdAt: new Date().toISOString(),
          }),
          capability: "requirement-intake",
          executionRole: "primary",
          inputArtifactRef: `loop-artifact:v1:requirement_summary:sha256:${"ef".repeat(32)}`,
          inputArtifactVersion: "1.0.0",
          inputDigest: "ef".repeat(32),
          outputArtifactVersion: "1.0.0",
          input: {},
        } as never);
      } catch (error) {
        const code = (error as { code?: unknown }).code;
        rejectedMissingBlob = code === "ARTIFACT_NOT_FOUND" ||
          (error instanceof LoopRunJournalError && error.code === "INVALID_INPUT");
      }
      ok(rejectedMissingBlob, "missing source blob is rejected fail-closed");

      // Zero-increment accounting across ALL probes.
      ok(env.runStore.listRunsByRequirement(requirementId).length === 0 &&
        env.runStore.listRunsByRequirement(`${requirementId}-B`).length === 0,
        "no probe created a run authority");
      ok(countFilesRecursive(env.root) === artifactsBaseline,
        "no probe wrote an artifact file");
      const proxySource = new Proxy({ artifactRef: `loop-artifact:v1:requirement_summary:sha256:${"ab".repeat(32)}`, digest: "ab".repeat(32) }, {});
      let rejectedProxy = false;
      try {
        validateBootstrapSourceProvenance(proxySource);
      } catch (error) {
        rejectedProxy = error instanceof LoopRunJournalError && error.code === "INVALID_INPUT";
      }
      ok(rejectedProxy, "proxy-shaped provenance is rejected by the plain-data boundary");

      // Idempotent replay of the SAME provenance succeeds; a DIFFERENT
      // provenance replay is ILLEGAL_TRANSITION.
      const replayIdentity = Object.freeze({
        runId: `run-${requirementId}-R`, requirementId: `${requirementId}-R`, repository: "local",
        repositoryPath: join(env.root, "repo"), baseBranch: "main",
        expectedBaseSha: "0".repeat(40), taskBranch: "t4",
        controlRoot: join(env.root, "control"), createdAt: new Date().toISOString(),
      });
      const goodSource = env.artifactStore.put("requirement_summary", "replay source");
      env.runStore.bootstrapRunWithSource(replayIdentity, { artifactRef: goodSource.artifactRef, digest: goodSource.digest });
      env.runStore.bootstrapRunWithSource(replayIdentity, { artifactRef: goodSource.artifactRef, digest: goodSource.digest });
      ok(true, "identical provenance replay stays idempotent");
      let replayConflict = false;
      try {
        const otherSource = env.artifactStore.put("requirement_summary", "different replay source");
        env.runStore.bootstrapRunWithSource(replayIdentity, { artifactRef: otherSource.artifactRef, digest: otherSource.digest });
      } catch (error) {
        replayConflict = error instanceof LoopRunJournalError && error.code === "ILLEGAL_TRANSITION";
      }
      ok(replayConflict, "different provenance replay is ILLEGAL_TRANSITION");
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
