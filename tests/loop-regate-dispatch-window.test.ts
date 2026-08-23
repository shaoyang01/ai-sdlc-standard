// LOOP Re-Gate Dispatch Window — Tests (Round 3 review F2)
// ==========================================================
// The terminal→revision window: a succeeded producer execution whose node
// revision has not landed yet must hold dispatch closed across ENTRIES.
// Two real LoopRunStore connections share one journal; entry A is paused by
// a barrier between the gateway's succeeded-terminal commit and the runtime's
// revision materialization while entry B runs a full run() inside the window.
//
// Contract under test:
// - no entry re-dispatches the point while its producer revision is pending;
// - the recovery entry FINALIZES (or replays) the pending materialization
//   instead of calling the agent again;
// - revision materialization binds the exact terminal event of the dispatch;
// - a concurrent lower-budget entry never persists a budget block in the
//   window (F2+F3 interplay), so the original revision append stays
//   admissible;
// - a crashed invocation is recovered by finalizing the pending revision.

import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createDeterministicCapabilityGateway,
  createRuntimeBindingRegistry,
  materializeProducerRevision,
  run,
  type RuntimeCapabilityGateway,
} from "../runtime";
import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopRunStore } from "../core/loop-run-store";
import { LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION } from "../core/loop-capability-execution";
import { createLoopRequirementChangeRecord } from "../core/loop-change-classification";
import { recoverRunContext } from "../core/loop-recovery";
import { LoopRunJournalError } from "../core/loop-executor-types";
import type { LoopCapabilityExecutionEvent } from "../core/loop-capability-execution";
import {
  LOOP_CAPABILITY_EXECUTION_POINTS,
  type NodeCapabilityId,
} from "../loop/types";

let passed = 0;
function ok(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  passed += 1;
}

const now = (): string => new Date().toISOString();

interface WindowEnv {
  root: string;
  journalPath: string;
  artifactStore: LoopArtifactStore;
  storeA: LoopRunStore;
  storeB: LoopRunStore;
  requirementId: string;
}

function makeWindowEnv(tag: string): WindowEnv {
  const root = mkdtempSync(join(tmpdir(), `loop-dispatch-window-${tag}-`));
  mkdirSync(join(root, "repo"), { recursive: true });
  const artifactStore = new LoopArtifactStore({
    controlRoot: join(root, "control"),
    repositoryPath: join(root, "repo"),
  });
  const journalPath = join(root, "journal.db");
  const storeA = new LoopRunStore(journalPath, { artifactStore });
  storeA.init();
  artifactStore.init();
  const storeB = new LoopRunStore(journalPath, { artifactStore });
  // Second real connection on the same journal: init() verifies the existing
  // format without rewriting anything.
  storeB.init();
  return { root, journalPath, artifactStore, storeA, storeB, requirementId: `REQ-WINDOW-${tag.toUpperCase()}` };
}

function closeWindowEnv(env: WindowEnv): void {
  env.artifactStore.close();
  env.storeA.close();
  env.storeB.close();
  rmSync(env.root, { recursive: true, force: true });
}

function gatewayFor(store: LoopRunStore, artifactStore: LoopArtifactStore): RuntimeCapabilityGateway {
  return createDeterministicCapabilityGateway({
    runStore: store,
    artifactStore,
    bindingRegistry: createRuntimeBindingRegistry(),
    now,
  });
}

function startedCount(
  store: LoopRunStore,
  runId: string,
  capability: NodeCapabilityId,
): number {
  return store.listCapabilityExecutions(runId)
    .filter((event) => event.capability === capability && event.status === "started")
    .length;
}

function lastSucceeded(
  store: LoopRunStore,
  runId: string,
  capability: NodeCapabilityId,
): LoopCapabilityExecutionEvent {
  return store.listCapabilityExecutions(runId)
    .filter((event) => event.capability === capability && event.status === "succeeded")
    .at(-1)!;
}

function openFeedback(env: WindowEnv, runId: string, sequence: number, previousGeneration: number, locator: string): void {
  env.storeA.appendRequirementChange(createLoopRequirementChangeRecord({
    runId,
    requirementId: env.requirementId,
    sequence,
    status: "CLASSIFIED",
    changeKind: "FEEDBACK_DRIVEN_CHANGE",
    payloadForm: "DELTA_CHANGE",
    previousGeneration,
    currentChangeScope: `feedback opens generation ${previousGeneration + 1}`,
    confirmedFactsPreserved: ["stable behavior stays"],
    sourceRefs: [{
      sourceType: "CONVERSATION", locator, priority: 1,
      sourceVersion: null, observedAt: now(),
    }],
    triggerEvidence: [`source:${locator}`],
    classificationReason: "外部反馈开启新代际",
    blockedReasonCode: null,
    createdAt: now(),
  }));
}

function throwsCode(code: string, fn: () => unknown | Promise<unknown>, message: string): Promise<void> {
  return (async () => {
    try {
      await fn();
      assert.fail(message);
    } catch (error) {
      ok(
        error instanceof LoopRunJournalError && error.code === code,
        `${message} (got ${error instanceof LoopRunJournalError ? error.code : String(error)})`,
      );
    }
  })();
}

async function main(): Promise<void> {
  // ── 1. A competing entry inside the window finalizes instead of re-dispatching ──
  console.log("F2 window: entry B finalizes the pending revision with zero re-dispatch");
  {
    const env = makeWindowEnv("race");
    try {
      let barrierArmed = true;
      const observations: {
        designStartsBefore?: number;
        designStartsAfterB?: number;
        bFinalStatus?: string;
        bChainStatus?: string;
      } = {};
      const innerA = gatewayFor(env.storeA, env.artifactStore);
      const gatewayA: RuntimeCapabilityGateway = {
        async execute(request) {
          const result = await innerA.execute(request);
          const context = request.loopExecution!;
          if (
            barrierArmed &&
            request.type === "solution-design" &&
            context.executionRole === "primary"
          ) {
            barrierArmed = false;
            // A's succeeded terminal event is committed; A has NOT
            // materialized the node revision yet. Entry B — a second real
            // store connection on the same journal — runs inside the window.
            const runId = context.runId;
            observations.designStartsBefore = startedCount(env.storeB, runId, "solution-design");
            const pending = recoverRunContext(env.storeB, env.requirementId);
            ok(pending?.pendingRevisionMaterialization !== null &&
              pending?.pendingRevisionMaterialization !== undefined,
              "recovery exposes the pending revision materialization");
            ok(
              pending!.pendingRevisionMaterialization!.producerExecution.capability === "solution-design",
              "the pending producer is the just-succeeded design execution",
            );
            const bResult = await run("window race", {
              requirementId: env.requirementId,
              runStore: env.storeB,
              artifactStore: env.artifactStore,
              gateway: gatewayFor(env.storeB, env.artifactStore),
              bindingRegistry: createRuntimeBindingRegistry(),
            });
            observations.designStartsAfterB = startedCount(env.storeB, runId, "solution-design");
            observations.bFinalStatus = bResult.final_status;
            observations.bChainStatus = bResult.chain_status;
          }
          return result;
        },
      };
      const aResult = await run("window race", {
        requirementId: env.requirementId,
        runStore: env.storeA,
        artifactStore: env.artifactStore,
        gateway: gatewayA,
        bindingRegistry: createRuntimeBindingRegistry(),
      });
      const runId = aResult.run_id;
      ok(observations.designStartsBefore === 1, "design dispatched once before the window");
      ok(observations.designStartsAfterB === 1,
        "entry B performs ZERO re-dispatch of the pending producer's point");
      ok(observations.bFinalStatus === "success" && observations.bChainStatus === "COMPLETED",
        "entry B finalizes the pending revision and completes the chain");
      ok(aResult.final_status === "success" && aResult.chain_status === "COMPLETED",
        "entry A resumes over the finalized revision without duplicating work");
      const events = env.storeA.listCapabilityExecutions(runId);
      ok(events.length === 16, "exactly eight attempts persist sixteen events — no duplicate dispatch");
      const designProducer = lastSucceeded(env.storeA, runId, "solution-design");
      const designRevisions = env.storeA.listArtifactRevisions(runId)
        .filter((revision) => revision.nodeId === "solution-design");
      ok(designRevisions.length === 1, "exactly one design revision exists");
      ok(designRevisions[0]!.producerExecutionId === designProducer.executionEventId,
        "the design revision binds the exact succeeded terminal event");
      ok(
        events.every((event) =>
          event.status !== "succeeded" ||
          event.outputArtifactRef === null ||
          (event.capability === "solution-gate" && event.executionRole === "adversarial_scan") ||
          env.storeA.listArtifactRevisions(runId)
            .some((revision) => revision.producerExecutionId === event.executionEventId)),
        "every succeeded producer owns exactly its revision",
      );
      ok(recoverRunContext(env.storeA, env.requirementId)!.pendingRevisionMaterialization === null,
        "no pending materialization remains after both entries settle");
    } finally {
      closeWindowEnv(env);
    }
  }

  // ── 2. Crash recovery: the next invocation replays the materialization ──
  console.log("F2 crash: recovery finalizes the unmaterialized producer instead of re-dispatching");
  {
    const env = makeWindowEnv("crash");
    try {
      let crashed = false;
      const innerA = gatewayFor(env.storeA, env.artifactStore);
      const crashingGateway: RuntimeCapabilityGateway = {
        async execute(request) {
          const result = await innerA.execute(request);
          if (
            !crashed &&
            request.type === "solution-design" &&
            request.loopExecution!.executionRole === "primary"
          ) {
            crashed = true;
            // Simulated process crash: the succeeded terminal event is
            // committed, the revision materialization never ran.
            throw new Error("simulated crash after terminal commit");
          }
          return result;
        },
      };
      let crashSurfaced = false;
      try {
        await run("window crash", {
          requirementId: env.requirementId,
          runStore: env.storeA,
          artifactStore: env.artifactStore,
          gateway: crashingGateway,
          bindingRegistry: createRuntimeBindingRegistry(),
        });
      } catch {
        crashSurfaced = true;
      }
      ok(crashSurfaced, "the crashed invocation surfaces the failure");
      const crashedRunId = recoverRunContext(env.storeB, env.requirementId)!.snapshot.state.identity.runId;
      ok(startedCount(env.storeB, crashedRunId, "solution-design") === 1, "design dispatched once before the crash");
      ok(env.storeB.listArtifactRevisions(crashedRunId)
        .filter((revision) => revision.nodeId === "solution-design").length === 0,
        "the crash left the design revision unmaterialized");
      const recovery = recoverRunContext(env.storeB, env.requirementId)!;
      ok(recovery.pendingRevisionMaterialization !== null,
        "recovery exposes the crashed producer as pending materialization");
      const revive = await run("window crash", {
        requirementId: env.requirementId,
        runStore: env.storeB,
        artifactStore: env.artifactStore,
        gateway: gatewayFor(env.storeB, env.artifactStore),
        bindingRegistry: createRuntimeBindingRegistry(),
      });
      ok(revive.final_status === "success" && revive.chain_status === "COMPLETED",
        "the recovery entry completes the run");
      ok(startedCount(env.storeB, crashedRunId, "solution-design") === 1,
        "recovery finalizes the revision WITHOUT re-dispatching the agent");
      const designProducer = lastSucceeded(env.storeB, crashedRunId, "solution-design");
      const designRevisions = env.storeB.listArtifactRevisions(crashedRunId)
        .filter((revision) => revision.nodeId === "solution-design");
      ok(designRevisions.length === 1 &&
        designRevisions[0]!.producerExecutionId === designProducer.executionEventId,
        "the finalized revision binds the crashed dispatch's exact terminal event");
      ok(env.storeB.listCapabilityExecutions(crashedRunId).length === 16,
        "the recovered run persists exactly sixteen events");
    } finally {
      closeWindowEnv(env);
    }
  }

  // ── 2b. Crash after the formal_verdict: the depth-decision cut makes the
  // pre-loop finalization the ONLY path that can re-open the chain ──
  console.log("F2 crash at verdict: pre-loop finalization re-opens the depth-decision cut");
  {
    const env = makeWindowEnv("verdict-crash");
    try {
      let crashed = false;
      const innerA = gatewayFor(env.storeA, env.artifactStore);
      const crashingGateway: RuntimeCapabilityGateway = {
        async execute(request) {
          const result = await innerA.execute(request);
          if (
            !crashed &&
            request.type === "solution-gate" &&
            request.loopExecution!.executionRole === "formal_verdict"
          ) {
            crashed = true;
            throw new Error("simulated crash after verdict terminal commit");
          }
          return result;
        },
      };
      let crashSurfaced = false;
      try {
        await run("window verdict crash", {
          requirementId: env.requirementId,
          runStore: env.storeA,
          artifactStore: env.artifactStore,
          gateway: crashingGateway,
          bindingRegistry: createRuntimeBindingRegistry(),
        });
      } catch {
        crashSurfaced = true;
      }
      ok(crashSurfaced, "the crashed invocation surfaces the failure");
      const stalled = recoverRunContext(env.storeB, env.requirementId)!;
      const stalledRunId = stalled.snapshot.state.identity.runId;
      ok(stalled.pendingRevisionMaterialization !== null &&
        stalled.pendingRevisionMaterialization!.producerExecution.executionRole === "formal_verdict",
        "the unmaterialized verdict is the pending producer");
      ok(stalled.nextExecutionPoint === null,
        "the unbound depth decision keeps the chain sealed while the revision is pending");
      const revive = await run("window verdict crash", {
        requirementId: env.requirementId,
        runStore: env.storeB,
        artifactStore: env.artifactStore,
        gateway: gatewayFor(env.storeB, env.artifactStore),
        bindingRegistry: createRuntimeBindingRegistry(),
      });
      ok(revive.final_status === "success" && revive.chain_status === "COMPLETED",
        "finalizing the verdict revision re-opens the chain to completion");
      ok(startedCount(env.storeB, stalledRunId, "solution-gate") === 2,
        "the gate round was never re-dispatched (scan + verdict exactly once)");
      const verdictProducer = env.storeB.listCapabilityExecutions(stalledRunId)
        .find((event) => event.capability === "solution-gate" &&
          event.executionRole === "formal_verdict" && event.status === "succeeded")!;
      const gateRevision = env.storeB.getCurrentArtifactRevision(stalledRunId, "solution-gate");
      ok(gateRevision?.producerExecutionId === verdictProducer.executionEventId,
        "the gate current binds the crashed verdict's exact terminal event");
      ok(recoverRunContext(env.storeB, env.requirementId)!.solutionGateDecision?.status === "DECIDED",
        "the depth decision is DECIDED once the verdict revision is materialized");
    } finally {
      closeWindowEnv(env);
    }
  }

  // ── 3. A lower-budget concurrent entry never persists a block in the window ──
  console.log("F2+F3 window: concurrent lower-budget entry persists no budget block");
  {
    const env = makeWindowEnv("budget");
    try {
      const first = await run("window budget", {
        requirementId: env.requirementId,
        runStore: env.storeA,
        artifactStore: env.artifactStore,
        gateway: gatewayFor(env.storeA, env.artifactStore),
        bindingRegistry: createRuntimeBindingRegistry(),
      });
      ok(first.final_status === "success", "generation 1 completes");
      openFeedback(env, first.run_id, 1, 1, "feedback:window-budget-1");
      const second = await run("window budget", {
        requirementId: env.requirementId,
        runStore: env.storeA,
        artifactStore: env.artifactStore,
        gateway: gatewayFor(env.storeA, env.artifactStore),
        bindingRegistry: createRuntimeBindingRegistry(),
        maxRegateRounds: 1,
      });
      ok(second.final_status === "success", "feedback wave 1 completes");
      ok(env.storeA.countRegateRounds(first.run_id) === 1, "one persisted backward jump");
      openFeedback(env, first.run_id, 2, 2, "feedback:window-budget-2");
      // Wave 2's intake jump (round 2) commits its succeeded terminal event;
      // the barrier pauses A before revision materialization. Entry B enters
      // the window with a LOWER budget (1 < 2 historical rounds).
      let barrierArmed = true;
      let bFinalStatus: string | null = null;
      const innerA = gatewayFor(env.storeA, env.artifactStore);
      const gatewayA: RuntimeCapabilityGateway = {
        async execute(request) {
          const result = await innerA.execute(request);
          const context = request.loopExecution!;
          if (
            barrierArmed &&
            request.type === "requirement-intake" &&
            context.attempt === 3
          ) {
            barrierArmed = false;
            const bResult = await run("window budget", {
              requirementId: env.requirementId,
              runStore: env.storeB,
              artifactStore: env.artifactStore,
              gateway: gatewayFor(env.storeB, env.artifactStore),
              bindingRegistry: createRuntimeBindingRegistry(),
              maxRegateRounds: 1,
            });
            bFinalStatus = bResult.final_status;
          }
          return result;
        },
      };
      const third = await run("window budget", {
        requirementId: env.requirementId,
        runStore: env.storeA,
        artifactStore: env.artifactStore,
        gateway: gatewayA,
        bindingRegistry: createRuntimeBindingRegistry(),
        maxRegateRounds: 2,
      });
      ok(bFinalStatus === "success", "the lower-budget entry completes through finalization + linear progress");
      ok(third.final_status === "success" && third.chain_status === "COMPLETED",
        "the original entry completes after the window");
      ok(!env.storeA.listEvents(first.run_id).some((event) => event.kind === "run_blocked"),
        "no budget block is persisted inside the terminal→revision window");
      ok(recoverRunContext(env.storeA, env.requirementId)!.blockingReasonCode === null,
        "no blocking reason persists");
      ok(startedCount(env.storeA, first.run_id, "requirement-intake") === 3,
        "intake dispatched exactly once per generation — no window re-dispatch");
    } finally {
      closeWindowEnv(env);
    }
  }

  // ── 4. The pending window denies EVERY supported entry, not only permits ──
  console.log("F2 bypass: direct supported-entry dispatch stays closed inside the window");
  {
    const env = makeWindowEnv("permit");
    try {
      const designIdx = LOOP_CAPABILITY_EXECUTION_POINTS.findIndex(
        (point) => point.capability === "solution-design" && point.executionRole === "primary",
      );
      let agentCallsA = 0;
      const innerA = gatewayFor(env.storeA, env.artifactStore);
      const countingGatewayA: RuntimeCapabilityGateway = {
        async execute(request) {
          agentCallsA += 1;
          return innerA.execute(request);
        },
      };
      // Drive only requirement-intake through the real entry — its revision
      // is deliberately never materialized.
      const { LoopCapabilityEntry } = await import("../core/loop-capability-entry");
      const entry = new LoopCapabilityEntry({
        runStore: env.storeA,
        artifactStore: env.artifactStore,
        bindingRegistry: createRuntimeBindingRegistry(),
        gateway: countingGatewayA,
        now,
      });
      const source = env.artifactStore.put("requirement_summary", "permit window requirement source");
      const step = await entry.execute({
        requirementId: env.requirementId,
        identity: Object.freeze({
          runId: `run-${env.requirementId}`,
          requirementId: env.requirementId,
          repository: "local",
          repositoryPath: join(env.root, "repo"),
          baseBranch: "main",
          expectedBaseSha: "0".repeat(40),
          taskBranch: `runtime/${env.requirementId}`,
          controlRoot: join(env.root, "control"),
          createdAt: now(),
        }),
        capability: "requirement-intake",
        executionRole: "primary",
        inputArtifactRef: source.artifactRef,
        inputArtifactVersion: "1.0.0",
        inputDigest: source.digest,
        outputArtifactVersion: "1.0.0",
        input: { requirement: "permit window" },
      });
      assert.ok(step.execution.success === true, "intake succeeds");
      const runId = step.runId;
      ok(agentCallsA === 1, "intake dispatched exactly once before the window opens");
      // Reviewer non-blocking coverage note: an exact replay of the
      // ALREADY-appended started event stays idempotent even inside the
      // pending window — pinning that the replay short-circuit precedes the
      // pending-revision transaction guard.
      const originalStarted = env.storeA.listCapabilityExecutions(runId)[0]!;
      ok(originalStarted.status === "started", "the intake claim event is available for replay");
      const replayed = env.storeA.appendCapabilityExecution(originalStarted);
      ok(replayed.appended === false && replayed.event.executionEventId === originalStarted.executionEventId,
        "exact started replay inside the pending window is an idempotent no-op");
      ok(env.storeB.listCapabilityExecutions(runId).length === 2,
        "the idempotent replay adds no journal side effects");
      // Second connection: the permit denies ANY dispatch while the producer
      // revision is pending — without persisting a budget block.
      const denied = env.storeB.authorizeRegateDispatch(runId, designIdx, 10);
      ok(denied.allowed === false && denied.blockedPersisted === false,
        "permit denies dispatch while the revision is pending, without persisting a block");
      ok(!env.storeB.listEvents(runId).some((event) => event.kind === "run_blocked"),
        "no run_blocked event persisted by the pending-window denial");
      // Regression matrix (F2-1) #1+#2: a DIRECT supported-entry call for the
      // next point from a second connection inside the window must fail
      // closed with zero started events and zero external agent dispatches.
      const intakeOutput = lastSucceeded(env.storeB, runId, "requirement-intake");
      let agentCallsB = 0;
      const innerB = gatewayFor(env.storeB, env.artifactStore);
      const countingGatewayB: RuntimeCapabilityGateway = {
        async execute(request) {
          agentCallsB += 1;
          return innerB.execute(request);
        },
      };
      const entryB = new LoopCapabilityEntry({
        runStore: env.storeB,
        artifactStore: env.artifactStore,
        bindingRegistry: createRuntimeBindingRegistry(),
        gateway: countingGatewayB,
        now,
      });
      const bypassRequest = Object.freeze({
        requirementId: env.requirementId,
        capability: "solution-design" as const,
        executionRole: "primary" as const,
        inputArtifactRef: intakeOutput.outputArtifactRef!,
        inputArtifactVersion: intakeOutput.outputArtifactVersion!,
        inputDigest: intakeOutput.outputDigest!,
        outputArtifactVersion: "1.0.0",
        input: { requirementSummaryRef: intakeOutput.outputArtifactRef },
      });
      await throwsCode("ILLEGAL_TRANSITION", () => entryB.execute(bypassRequest),
        "direct supported-entry dispatch inside the window fails closed");
      ok(agentCallsB === 0, "the rejected bypass attempt performs zero Agent calls");
      ok(startedCount(env.storeB, runId, "solution-design") === 0,
        "the rejected bypass attempt appends zero started events");
      ok(env.storeB.listCapabilityExecutions(runId).length === 2,
        "the rejected bypass attempt leaves no journal side effects");
      // Regression matrix (F2-1) #2b: even a raw, schema-valid started event
      // appended straight onto a second connection is rejected by the SAME
      // transaction that owns started appends.
      const rawStarted: LoopCapabilityExecutionEvent = Object.freeze({
        schemaVersion: LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION,
        executionEventId: `${runId}:capability:3:started`,
        sequence: 3,
        status: "started",
        runId,
        capability: "solution-design",
        executionRole: "primary",
        nodeId: "solution-design",
        attempt: 1,
        bindingId: "binding-codex-solution-design-primary",
        bindingVersion: "1.0.0",
        bindingRegistryVersion: "1",
        executorAgent: "codex",
        executorAdapter: "codex-real-dispatch",
        executorVersion: "1.0.0",
        inputArtifactRef: intakeOutput.outputArtifactRef!,
        inputArtifactVersion: intakeOutput.outputArtifactVersion!,
        inputDigest: intakeOutput.outputDigest!,
        outputArtifactRef: null,
        outputArtifactVersion: null,
        outputDigest: null,
        gateResult: null,
        unresolvedFindingsRef: null,
        unresolvedFindingsDigest: null,
        consumedFindingsRef: null,
        consumedFindingsDigest: null,
        decisionDepth: null,
        decisionScopeId: null,
        decisionDeltaRef: null,
        decisionDeltaDigest: null,
        nextStepEligibility: null,
        errorCode: null,
        retryable: null,
        reasonCode: null,
        createdAt: now(),
      });
      throwsCode("ILLEGAL_TRANSITION", () => env.storeB.appendCapabilityExecution(rawStarted),
        "a raw started append inside the window is rejected in-transaction");
      ok(env.storeB.listCapabilityExecutions(runId).length === 2,
        "the rejected raw append has no journal side effect");
      // Finalize the materialization exactly as the runtime would replay it.
      const produced = lastSucceeded(env.storeA, runId, "requirement-intake");
      materializeProducerRevision(env.storeA, env.requirementId, runId, produced, now);
      const admitted = env.storeB.authorizeRegateDispatch(runId, designIdx, 10);
      ok(admitted.allowed === true, "permit opens once the pending revision has landed");
      // Regression matrix (F2-1) #3: after materialization the SAME direct
      // supported-entry request is admitted normally — no permanent lockout.
      const resumed = await entryB.execute(bypassRequest);
      ok(resumed.execution.success === true && resumed.attempt === 1,
        "after materialization the same direct entry request passes");
      ok(startedCount(env.storeB, runId, "solution-design") === 1,
        "design dispatched exactly once once the window is closed");
    } finally {
      closeWindowEnv(env);
    }
  }

  console.log(`\nre-gate dispatch window tests: ${passed} assertions passed`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
