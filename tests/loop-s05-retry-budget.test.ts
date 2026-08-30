// E5-W1 (S05 controlled retry budget) — focused negative-matrix regression.
// ============================================================================
// Plan §7 S05: "进程非零退出且无工作区变化 → failed event；同 binding 最多一次
// 受控重试". E5-L1 found the budget missing (G-S05): re-dispatch of a failed
// retryable execution point was unbounded. The fix enforces the budget at the
// single dispatch choke point (deriveDispatchCommand):
//   - a point tail failed with retryable=true may be re-dispatched ONCE;
//   - a second controlled business failure exhausts the budget — further
//     dispatch is refused fail-closed (ILLEGAL_TRANSITION, no journal writes);
//   - ATTEMPT_INTERRUPTED failures are crash recovery, never counted.
// Zero real CLI calls: fake runners only (Decision-075 boundary).

import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LoopArtifactStore } from "../core/loop-artifact-store";
import {
  LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION,
  type LoopCapabilityExecutionEvent,
} from "../core/loop-capability-execution";
import { LoopCapabilityEntry } from "../core/loop-capability-entry";
import { recoverRunContext } from "../core/loop-recovery";
import { LoopRunStore } from "../core/loop-run-store";
import { LoopRunJournalError, type LoopRunIdentity } from "../core/loop-executor-types";
import { INITIAL_BINDING_REGISTRY } from "../core/agent-capability-bindings";
import type { NodeCapabilityFakeRunner } from "../execution/multi-agent-fake-runners";
import { createKimiFakeRunner } from "../execution/multi-agent-fake-runners";
import { ExecutionGateway } from "../execution/gateway";
import { MultiAgentFakeGateway } from "./fixtures/multi-agent-fake-gateway";
import { materializeProducerRevision } from "../runtime";

let passed = 0;
function ok(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  passed += 1;
}

async function rejectsCodeAndMessage(
  code: string,
  messagePart: string,
  fn: () => Promise<unknown>,
  label: string,
): Promise<void> {
  try {
    await fn();
    assert.fail(`${label} (no error)`);
  } catch (error) {
    ok(
      error instanceof LoopRunJournalError && error.code === code &&
        error.message.includes(messagePart),
      label,
    );
    passed += 1;
  }
}

const TS = "2026-08-30T10:00:00.000Z";
const DIGEST = "a".repeat(64);

function identity(root: string): LoopRunIdentity {
  return Object.freeze({
    runId: "run-s05-budget-001",
    requirementId: "REQ-S05-001",
    repository: "example",
    repositoryPath: join(root, "repo"),
    baseBranch: "main",
    expectedBaseSha: "1".repeat(40),
    taskBranch: "feature/s05-budget-test",
    controlRoot: join(root, "control"),
    createdAt: TS,
  });
}

function event(runId: string, overrides: Partial<LoopCapabilityExecutionEvent>): LoopCapabilityExecutionEvent {
  return Object.freeze({
    schemaVersion: LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION,
    executionEventId: `${runId}:capability:0:started`,
    runId,
    sequence: 0,
    capability: "requirement-intake",
    executionRole: "primary",
    nodeId: "requirement-intake",
    attempt: 1,
    status: "started",
    createdAt: TS,
    bindingId: "binding-codex-requirement-intake-primary",
    bindingVersion: "2.0.0",
    bindingRegistryVersion: "1",
    executorAgent: "codex",
    executorAdapter: "codex-real-dispatch",
    executorVersion: "1.0.0",
    inputArtifactRef: `loop-artifact:v1:requirement_summary:sha256:${DIGEST}`,
    inputArtifactVersion: "1.0.0",
    inputDigest: DIGEST,
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
    ...overrides,
  });
}

/**
 * Mutable kimi fake (solution-design:primary is kimi-bound). The test decides
 * per dispatch whether the runner fails or succeeds. "fail" throws — the
 * gateway converts it to a failed terminal (EXECUTOR_EXCEPTION, retryable
 * under retry_other_binding) WITHOUT process evidence: the exact S05 shape.
 */
function makeSwitchableRunner(): { runner: NodeCapabilityFakeRunner; setBehavior(next: "fail" | "succeed"): void } {
  let behavior: "fail" | "succeed" = "succeed";
  const successRunner = createKimiFakeRunner();
  const runner: NodeCapabilityFakeRunner = {
    async run(request) {
      if (behavior === "fail") throw new Error("S05 fixture: business failure");
      return successRunner.run(request);
    },
  };
  return { runner, setBehavior: (next) => { behavior = next; } };
}

function tracedGateway(
  runStore: LoopRunStore,
  artifactStore: LoopArtifactStore,
  kimiRunner: NodeCapabilityFakeRunner,
): ExecutionGateway {
  return new MultiAgentFakeGateway({
    kimiRunnerOverride: kimiRunner,
    capabilityTracing: {
      runStore,
      artifactStore,
      bindingRegistry: INITIAL_BINDING_REGISTRY,
      executorVersions: { codex: "1.0.0", kimi: "1.0.0", hermes: "1.0.0" },
      now: () => TS,
    },
  });
}

async function completedIntakeFixture(prefix: string, kimiRunner: NodeCapabilityFakeRunner): Promise<Readonly<{
  root: string;
  id: LoopRunIdentity;
  runStore: LoopRunStore;
  artifactStore: LoopArtifactStore;
  techInput: Readonly<{ artifactRef: string; version: string; digest: string }>;
}>> {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const repo = join(root, "repo");
  mkdirSync(repo);
  const id = identity(root);
  const artifactStore = new LoopArtifactStore({ controlRoot: id.controlRoot, repositoryPath: repo });
  const runStore = new LoopRunStore(join(root, "journal.db"), { artifactStore });
  runStore.init();
  artifactStore.init();
  const source = artifactStore.put("requirement_summary", "S05 retry budget Requirement source");
  const entry = new LoopCapabilityEntry({
    runStore,
    artifactStore,
    bindingRegistry: INITIAL_BINDING_REGISTRY,
    gateway: tracedGateway(runStore, artifactStore, kimiRunner),
    now: () => TS,
  });
  const first = await entry.execute({
    requirementId: id.requirementId,
    identity: id,
    capability: "requirement-intake",
    executionRole: "primary" as const,
    inputArtifactRef: source.artifactRef,
    inputArtifactVersion: "1.0.0",
    inputDigest: source.digest,
    outputArtifactVersion: "1.0.0",
    input: { requirement: "exercise the S05 controlled retry budget" },
  });
  const output = first.recoveryContext.capabilityStates[0]!;
  materializeProducerRevision(
    runStore, id.requirementId, id.runId,
    runStore.listCapabilityExecutions(id.runId).find(
      (ev) => ev.executionEventId === first.producerTerminalEventId,
    ) ?? runStore.listCapabilityExecutions(id.runId).at(-1)!,
    () => TS,
  );
  return Object.freeze({
    root,
    id,
    runStore,
    artifactStore,
    techInput: Object.freeze({
      artifactRef: output.effectiveOutputArtifactRef!,
      version: output.effectiveOutputArtifactVersion!,
      digest: output.effectiveOutputDigest!,
    }),
  });
}

function techRequest(
  fixture: Awaited<ReturnType<typeof completedIntakeFixture>>,
  attempt = 1,
) {
  return Object.freeze({
    requirementId: fixture.id.requirementId,
    capability: "solution-design" as const,
    executionRole: "primary" as const,
    inputArtifactRef: fixture.techInput.artifactRef,
    inputArtifactVersion: fixture.techInput.version,
    inputDigest: fixture.techInput.digest,
    outputArtifactVersion: `${attempt}.0.0`,
    input: { requirementSummaryRef: fixture.techInput.artifactRef },
  });
}

function recoveryEntry(
  fixture: Awaited<ReturnType<typeof completedIntakeFixture>>,
  kimiRunner: NodeCapabilityFakeRunner,
): LoopCapabilityEntry {
  return new LoopCapabilityEntry({
    runStore: fixture.runStore,
    artifactStore: fixture.artifactStore,
    bindingRegistry: INITIAL_BINDING_REGISTRY,
    gateway: tracedGateway(fixture.runStore, fixture.artifactStore, kimiRunner),
    now: () => TS,
  });
}

function closeFixture(fixture: Awaited<ReturnType<typeof completedIntakeFixture>>): void {
  fixture.artifactStore.close();
  fixture.runStore.close();
  rmSync(fixture.root, { recursive: true, force: true });
}

function solutionDesignPoint(fixture: Awaited<ReturnType<typeof completedIntakeFixture>>) {
  const recovery = recoverRunContext(fixture.runStore, fixture.id.requirementId)!;
  return recovery.executionPointStates.find(
    (point) => point.capability === "solution-design" && point.executionRole === "primary",
  )!;
}

async function main(): Promise<void> {
  // ── Scenario 1: two controlled failures → third dispatch refused ──
  console.log("S05 budget: one controlled retry, then fail-closed");
  {
    const { runner, setBehavior } = makeSwitchableRunner();
    const fixture = await completedIntakeFixture("loop-s05-budget-exhaust-", runner);
    try {
      setBehavior("fail");
      const first = await recoveryEntry(fixture, runner).execute(techRequest(fixture, 1));
      ok(first.execution.success === false, "attempt 1 fails (controlled business failure)");
      ok(solutionDesignPoint(fixture).controlledFailuresSinceSuccess === 1, "one controlled failure counted");

      const second = await recoveryEntry(fixture, runner).execute(techRequest(fixture, 2));
      ok(second.execution.success === false, "attempt 2 (the single controlled retry) still allowed");
      ok(solutionDesignPoint(fixture).controlledFailuresSinceSuccess === 2, "second controlled failure counted");

      const eventCountBefore = fixture.runStore.listCapabilityExecutions(fixture.id.runId).length;
      await rejectsCodeAndMessage(
        "ILLEGAL_TRANSITION",
        "controlled retry budget exhausted",
        () => recoveryEntry(fixture, runner).execute(techRequest(fixture, 3)),
        "attempt 3 is refused fail-closed by the S05 budget",
      );
      ok(
        fixture.runStore.listCapabilityExecutions(fixture.id.runId).length === eventCountBefore,
        "budget refusal has zero journal side effects (no started claim, no spawn)",
      );
    } finally {
      closeFixture(fixture);
    }
  }

  // ── Scenario 2: single retry then success is unaffected ──
  console.log("S05 budget: fail once, retry once, succeed — no false block");
  {
    const { runner, setBehavior } = makeSwitchableRunner();
    const fixture = await completedIntakeFixture("loop-s05-budget-recover-", runner);
    try {
      setBehavior("fail");
      await recoveryEntry(fixture, runner).execute(techRequest(fixture, 1));
      setBehavior("succeed");
      const second = await recoveryEntry(fixture, runner).execute(techRequest(fixture, 2));
      ok(second.execution.success === true, "the single controlled retry succeeds");
      const point = solutionDesignPoint(fixture);
      ok(point.status === "succeeded", "point closes as succeeded after the retry");
      ok(point.controlledFailuresSinceSuccess === 0, "budget suffix resets after a success");
    } finally {
      closeFixture(fixture);
    }
  }

  // ── Scenario 3: ATTEMPT_INTERRUPTED never consumes the budget ──
  console.log("S05 budget: crash-recovery interruptions stay unbounded");
  {
    const { runner, setBehavior } = makeSwitchableRunner();
    const fixture = await completedIntakeFixture("loop-s05-budget-interrupt-", runner);
    try {
      const runId = fixture.id.runId;
      const capabilityEvents = fixture.runStore.listCapabilityExecutions(runId);
      const nextSequence = capabilityEvents[capabilityEvents.length - 1]!.sequence + 1;
      const base = {
        capability: "solution-design" as const,
        executionRole: "primary" as const,
        nodeId: "solution-design",
        attempt: 1,
        bindingId: "binding-codex-solution-design-primary",
        inputArtifactRef: fixture.techInput.artifactRef,
        inputArtifactVersion: fixture.techInput.version,
        inputDigest: fixture.techInput.digest,
      };
      fixture.runStore.appendCapabilityExecution(event(runId, {
        ...base,
        executionEventId: `${runId}:capability:${nextSequence}:started`,
        sequence: nextSequence,
        status: "started",
      }));
      fixture.runStore.appendCapabilityExecution(event(runId, {
        ...base,
        executionEventId: `${runId}:capability:${nextSequence + 1}:failed`,
        sequence: nextSequence + 1,
        status: "failed",
        nextStepEligibility: "BLOCKED",
        errorCode: "ATTEMPT_INTERRUPTED",
        retryable: true,
        reasonCode: "ENTRY_RECOVERY",
      }));
      ok(
        solutionDesignPoint(fixture).controlledFailuresSinceSuccess === 0,
        "interrupted terminal does not count toward the S05 budget",
      );
      setBehavior("succeed");
      const resumed = await recoveryEntry(fixture, runner).execute(techRequest(fixture, 2));
      ok(resumed.attempt === 2 && resumed.execution.success === true, "crash recovery re-drive is not budget-blocked");
    } finally {
      closeFixture(fixture);
    }
  }

  console.log(`\nS05 retry budget: ${passed} assertions passed`);
  if (passed === 0) throw new Error("no assertions ran");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
