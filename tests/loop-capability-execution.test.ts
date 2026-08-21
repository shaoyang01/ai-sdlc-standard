import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

import { LoopArtifactStore } from "../core/loop-artifact-store";
import {
  canonicalizeLoopCapabilityExecutionEvent,
  LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION,
  validateLoopCapabilityExecutionChain,
  validateLoopCapabilityExecutionEvent,
  type LoopCapabilityExecutionEvent,
} from "../core/loop-capability-execution";
import { LoopCapabilityEntry } from "../core/loop-capability-entry";
import { recoverRunContext } from "../core/loop-recovery";
import { LoopRunStore } from "../core/loop-run-store";
import { LoopRunJournalError, type LoopRunEvent, type LoopRunIdentity } from "../core/loop-executor-types";
import {
  INITIAL_BINDING_REGISTRY,
  replaceBinding,
} from "../core/agent-capability-bindings";
import {
  buildCapabilityPrompt,
  createCodexFakeRunner,
  parseCapabilityOutcomeMarkers,
  type CodexRunner,
} from "../execution/codex-real-dispatch-runner";
import { ExecutionGateway } from "../execution/gateway";
import { RUNTIME_CAPABILITY_BY_EXECUTION_POINT } from "../core/runtime-capability-map";
import { NODE_CAPABILITY_IDS } from "../loop/types";
import { createArtifact } from "../core/artifact";

let passed = 0;
function ok(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  passed += 1;
}

function throwsCode(code: string, fn: () => unknown, message: string): void {
  try {
    fn();
    assert.fail(message);
  } catch (error) {
    ok(error instanceof LoopRunJournalError && error.code === code, message);
  }
}

async function rejectsCode(code: string, fn: () => Promise<unknown>, message: string): Promise<void> {
  try {
    await fn();
    assert.fail(message);
  } catch (error) {
    ok(error instanceof LoopRunJournalError && error.code === code, message);
  }
}

const TS = "2026-08-19T10:00:00.000Z";
const DIGEST = "a".repeat(64);

function identity(root: string): LoopRunIdentity {
  return Object.freeze({
    runId: "run-wp4b-001",
    requirementId: "REQ-WP4B-001",
    repository: "example",
    repositoryPath: join(root, "repo"),
    baseBranch: "main",
    expectedBaseSha: "1".repeat(40),
    taskBranch: "feature/wp4b-test",
    controlRoot: join(root, "control"),
    createdAt: TS,
  });
}

function event(overrides: Partial<LoopCapabilityExecutionEvent> = {}): LoopCapabilityExecutionEvent {
  return Object.freeze({
    schemaVersion: LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION,
    executionEventId: "run-wp4b-001:capability:1:started",
    runId: "run-wp4b-001",
    sequence: 1,
    capability: "requirement-intake",
    nodeId: "requirement-summary",
    attempt: 1,
    status: "started",
    createdAt: TS,
    bindingId: "binding-codex-requirement-intake",
    bindingVersion: "1.0.0",
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
    nextStepEligibility: null,
    errorCode: null,
    retryable: null,
    reasonCode: null,
    ...overrides,
  });
}

function runEvent(runId: string, sequence: number, kind: "run_started" | "run_paused"): LoopRunEvent {
  return Object.freeze({
    eventId: `${runId}:${sequence}:${kind}`,
    runId,
    sequence,
    kind,
    stage: null,
    attempt: 0,
    createdAt: TS,
    inputDigest: null,
    outputArtifactRef: null,
    outputDigest: null,
    errorCode: null,
    retryable: null,
    reasonCode: null,
    bindingId: null,
    bindingVersion: null,
    inputArtifactRef: null,
  });
}

function tracedGateway(
  runStore: LoopRunStore,
  artifactStore: LoopArtifactStore,
  codexRunner: CodexRunner = createCodexFakeRunner({ scenario: "success_code_patch" }),
): ExecutionGateway {
  return new ExecutionGateway({
    env: { SDLC_EXECUTION_MODE: "codex", SDLC_CODEX_REAL_DISPATCH: "enabled" },
    codexRunner,
    capabilityTracing: {
      runStore,
      artifactStore,
      bindingRegistry: INITIAL_BINDING_REGISTRY,
      executorVersions: { codex: "1.0.0", kimi: "1.0.0", hermes: "1.0.0" },
      now: () => TS,
    },
  });
}

async function completedIntakeFixture(prefix: string): Promise<Readonly<{
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
  const runStore = new LoopRunStore(join(root, "journal.db"));
  const artifactStore = new LoopArtifactStore({ controlRoot: id.controlRoot, repositoryPath: repo });
  runStore.init();
  artifactStore.init();
  const source = artifactStore.put("requirement_summary", "interruption recovery Requirement source");
  const entry = new LoopCapabilityEntry({
    runStore,
    artifactStore,
    bindingRegistry: INITIAL_BINDING_REGISTRY,
    gateway: tracedGateway(runStore, artifactStore),
    now: () => TS,
  });
  const first = await entry.execute({
    requirementId: id.requirementId,
    identity: id,
    capability: "requirement-intake",
    inputArtifactRef: source.artifactRef,
    inputArtifactVersion: "1.0.0",
    inputDigest: source.digest,
    outputArtifactVersion: "1.0.0",
    input: { requirement: "recover an interrupted execution" },
  });
  const output = first.recoveryContext.capabilityStates[0]!;
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

function techRequest(fixture: Awaited<ReturnType<typeof completedIntakeFixture>>) {
  return Object.freeze({
    requirementId: fixture.id.requirementId,
    capability: "tech-design" as const,
    inputArtifactRef: fixture.techInput.artifactRef,
    inputArtifactVersion: fixture.techInput.version,
    inputDigest: fixture.techInput.digest,
    outputArtifactVersion: "1.0.0",
    input: { requirementSummaryRef: fixture.techInput.artifactRef },
  });
}

function recoveryEntry(
  fixture: Awaited<ReturnType<typeof completedIntakeFixture>>,
  gateway = tracedGateway(fixture.runStore, fixture.artifactStore),
): LoopCapabilityEntry {
  return new LoopCapabilityEntry({
    runStore: fixture.runStore,
    artifactStore: fixture.artifactStore,
    bindingRegistry: INITIAL_BINDING_REGISTRY,
    gateway,
    now: () => TS,
  });
}

function closeFixture(fixture: Awaited<ReturnType<typeof completedIntakeFixture>>): void {
  fixture.artifactStore.close();
  fixture.runStore.close();
  rmSync(fixture.root, { recursive: true, force: true });
}

async function main(): Promise<void> {
  console.log("WP-4B: capability model fail-closed");
  validateLoopCapabilityExecutionEvent(event());
  ok(true, "canonical started event validates");
  throwsCode("INVALID_INPUT", () => validateLoopCapabilityExecutionEvent({ ...event(), extra: "x" }), "unknown field rejected");
  throwsCode("INVALID_INPUT", () => validateLoopCapabilityExecutionEvent(event({ executorVersion: "unknown" })), "invalid executor version rejected");
  throwsCode("INVALID_INPUT", () => validateLoopCapabilityExecutionEvent(event({ bindingRegistryVersion: "v1" })), "invalid registry version rejected");
  throwsCode("INVALID_INPUT", () => validateLoopCapabilityExecutionEvent(event({ nodeId: "tech-design" })), "capability/node mismatch rejected");
  throwsCode("INVALID_INPUT", () => validateLoopCapabilityExecutionEvent(event({ inputDigest: "b".repeat(64) })), "artifact ref/digest mismatch rejected");
  throwsCode("INVALID_INPUT", () => validateLoopCapabilityExecutionEvent(event({
    executionEventId: "run-wp4b-001:capability:1:succeeded", status: "succeeded",
  })), "success without output/Gate rejected");
  throwsCode("INVALID_INPUT", () => validateLoopCapabilityExecutionEvent(event({
    executionEventId: "run-wp4b-001:capability:1:failed",
    status: "failed", nextStepEligibility: "ELIGIBLE", errorCode: "X", retryable: true,
  })), "failed execution cannot make next step eligible");
  throwsCode("INVALID_INPUT", () => validateLoopCapabilityExecutionChain([
    event({ capability: "tech-design", nodeId: "tech-design", bindingId: "binding-codex-tech-design" }),
  ], "run-wp4b-001"), "capability chain cannot skip requirement intake");
  ok(canonicalizeLoopCapabilityExecutionEvent(event()).includes('"executorAgent":"codex"'), "canonical form contains executor snapshot");

  console.log("WP-4B: seven Runtime points map exactly to seven capabilities");
  const mapped = Object.values(RUNTIME_CAPABILITY_BY_EXECUTION_POINT);
  ok(mapped.length === 7, "exactly seven Runtime execution points");
  ok(new Set(mapped).size === 7, "capability projection is one-to-one");
  ok(NODE_CAPABILITY_IDS.every((capability) => mapped.includes(capability)), "all canonical capabilities are covered");
  const reviewPrompt = buildCapabilityPrompt({
    type: "solution-review", node: "review", agent: "codex", requirementId: "REQ-WP4B", input: {},
  }, "solution-review", "{}");
  ok(reviewPrompt.includes("GATE_RESULT"), "Gate capability prompt requires a machine-readable Gate marker");
  ok(parseCapabilityOutcomeMarkers("solution-review", "review\nGATE_RESULT: PASS")["gateResult"] === "PASS",
    "real-runner Gate marker parser extracts one canonical result");
  ok(Array.isArray(parseCapabilityOutcomeMarkers(
    "code-review", 'review\nUNRESOLVED_FINDINGS_JSON: [{"severity":"P1"}]',
  )["unresolvedFindings"]), "real-runner finding marker parser extracts a JSON array");
  ok(parseCapabilityOutcomeMarkers(
    "solution-review", "GATE_RESULT: PASS\nGATE_RESULT: FAIL",
  )["gateResult"] === undefined, "duplicate Gate markers fail closed");

  console.log("WP-4B: v1 journal migration and v2 schema marker are fail-closed");
  const migrationRoot = mkdtempSync(join(tmpdir(), "loop-wp4b-migration-"));
  try {
    mkdirSync(join(migrationRoot, "repo"));
    const migrationPath = join(migrationRoot, "journal.db");
    const migrationStore = new LoopRunStore(migrationPath);
    migrationStore.init();
    migrationStore.createRun(identity(migrationRoot));
    migrationStore.close();
    const v1 = new Database(migrationPath);
    v1.exec("DROP TABLE loop_capability_executions");
    v1.pragma("user_version = 1");
    v1.close();
    const upgraded = new LoopRunStore(migrationPath);
    upgraded.init();
    ok(upgraded.getSnapshot("run-wp4b-001") !== undefined, "v1 run remains readable after v2 migration");
    upgraded.close();
    const migrated = new Database(migrationPath);
    ok(migrated.pragma("user_version", { simple: true }) === 5, "v1 migration atomically records format v5");
    ok(migrated.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='loop_capability_executions'").get() !== undefined,
      "v1 migration creates the capability execution table");
    migrated.exec("DROP TABLE loop_capability_executions");
    migrated.close();
    const corruptV2 = new LoopRunStore(migrationPath);
    throwsCode("STORE_CORRUPT", () => corruptV2.init(), "current marker with missing capability table is rejected");
  } finally {
    rmSync(migrationRoot, { recursive: true, force: true });
  }

  console.log("WP-4B: execution claim is exclusive across the two journal streams");
  const claimRoot = mkdtempSync(join(tmpdir(), "loop-wp4b-claim-"));
  try {
    mkdirSync(join(claimRoot, "repo"));
    const claimStore = new LoopRunStore(join(claimRoot, "journal.db"));
    claimStore.init();
    claimStore.createRun(identity(claimRoot));
    claimStore.appendEvent(runEvent("run-wp4b-001", 2, "run_started"));
    const firstClaim = claimStore.appendCapabilityExecution(event());
    ok(firstClaim.appended === true, "first started event acquires the capability execution claim");
    const duplicateClaim = claimStore.appendCapabilityExecution(event());
    ok(duplicateClaim.appended === false, "an exact duplicate started event does not acquire a second claim");
    throwsCode("ILLEGAL_TRANSITION", () => claimStore.appendEvent(
      runEvent("run-wp4b-001", 3, "run_paused"),
    ), "delivery journal cannot advance while a capability attempt is active");
    ok(claimStore.listEvents("run-wp4b-001").length === 2, "rejected cross-stream transition has no side effect");
    claimStore.close();
  } finally {
    rmSync(claimRoot, { recursive: true, force: true });
  }

  console.log("WP-4B: Gate-producing capabilities fail closed without a structured Gate result");
  const gateRoot = mkdtempSync(join(tmpdir(), "loop-wp4b-gate-"));
  try {
    mkdirSync(join(gateRoot, "repo"));
    const gateIdentity = identity(gateRoot);
    const gateStore = new LoopRunStore(join(gateRoot, "journal.db"));
    const gateArtifacts = new LoopArtifactStore({
      controlRoot: gateIdentity.controlRoot,
      repositoryPath: gateIdentity.repositoryPath,
    });
    gateStore.init();
    gateArtifacts.init();
    gateStore.createRun(gateIdentity);
    gateStore.appendEvent(runEvent(gateIdentity.runId, 2, "run_started"));
    const gateSource = gateArtifacts.put("requirement_summary", "gate test Requirement source");
    let inputRef = gateSource.artifactRef;
    let inputDigest = gateSource.digest;
    let sequence = 1;
    for (const capability of NODE_CAPABILITY_IDS.slice(0, 3)) {
      const nodeId = Object.entries(RUNTIME_CAPABILITY_BY_EXECUTION_POINT).find(([, value]) => value === capability)![0];
      const start = event({
        executionEventId: `${gateIdentity.runId}:capability:${sequence}:started`,
        sequence,
        capability,
        nodeId,
        bindingId: `binding-codex-${capability}`,
        inputArtifactRef: inputRef,
        inputDigest,
      });
      gateStore.appendCapabilityExecution(start);
      const seededOutput = gateArtifacts.put("capability_output", `seed output for ${capability}`);
      const outputDigest = seededOutput.digest;
      const outputRef = seededOutput.artifactRef;
      gateStore.appendCapabilityExecution(event({
        ...start,
        executionEventId: `${gateIdentity.runId}:capability:${sequence + 1}:succeeded`,
        sequence: sequence + 1,
        status: "succeeded",
        outputArtifactRef: outputRef,
        outputArtifactVersion: "1.0.0",
        outputDigest,
        gateResult: "NOT_APPLICABLE",
        nextStepEligibility: "ELIGIBLE",
      }));
      inputRef = outputRef;
      inputDigest = outputDigest;
      sequence += 2;
    }
    const gateGateway = new ExecutionGateway({
      env: { SDLC_EXECUTION_MODE: "codex", SDLC_CODEX_REAL_DISPATCH: "enabled" },
      codexRunner: {
        run: async (request) => ({
          success: true,
          node: request.node,
          agent: request.agent,
          output: { result: "capability_completed" },
          artifacts: [createArtifact({
            id: "solution-review-without-gate",
            requirementId: request.requirementId,
            node: request.node,
            type: "solution_review",
            content: { node_output: "review completed but no machine Gate" },
            agent: request.agent,
            source: "execution_gateway",
            createdAt: TS,
          })],
        }),
      },
      capabilityTracing: {
        runStore: gateStore,
        artifactStore: gateArtifacts,
        bindingRegistry: INITIAL_BINDING_REGISTRY,
        executorVersions: { codex: "1.0.0", kimi: "1.0.0", hermes: "1.0.0" },
        now: () => TS,
      },
    });
    const gateResult = await gateGateway.execute({
      type: "solution-review",
      node: "review",
      agent: "codex",
      requirementId: gateIdentity.requirementId,
      input: { designRef: inputRef },
      loopExecution: {
        runId: gateIdentity.runId,
        attempt: 1,
        inputArtifactRef: inputRef,
        inputArtifactVersion: "1.0.0",
        inputDigest,
        outputArtifactVersion: "1.0.0",
      },
    });
    ok(gateResult.success === false, "missing Gate result is not reported as capability success");
    const gateEvents = gateStore.listCapabilityExecutions(gateIdentity.runId);
    ok(gateEvents.at(-1)?.status === "failed", "missing Gate result becomes a durable failed attempt");
    ok(gateEvents.at(-1)?.errorCode === "OUTPUT_CONTRACT_VIOLATION", "failed Gate outcome records a stable reason code");
    ok(gateEvents.at(-1)?.outputArtifactRef === null, "missing Gate result never produces an effective output artifact");
    gateArtifacts.close();
    gateStore.close();
  } finally {
    rmSync(gateRoot, { recursive: true, force: true });
  }

  console.log("WP-4B: supported entry completes and recovers the full seven-capability chain");
  const chainRoot = mkdtempSync(join(tmpdir(), "loop-wp4b-chain-"));
  try {
    mkdirSync(join(chainRoot, "repo"));
    const chainIdentity = identity(chainRoot);
    const chainStore = new LoopRunStore(join(chainRoot, "journal.db"));
    const chainArtifacts = new LoopArtifactStore({
      controlRoot: chainIdentity.controlRoot,
      repositoryPath: chainIdentity.repositoryPath,
    });
    chainStore.init();
    chainArtifacts.init();
    const chainGateway = new ExecutionGateway({
      env: { SDLC_EXECUTION_MODE: "codex", SDLC_CODEX_REAL_DISPATCH: "enabled" },
      codexRunner: createCodexFakeRunner({ scenario: "success_code_patch" }),
      capabilityTracing: {
        runStore: chainStore,
        artifactStore: chainArtifacts,
        bindingRegistry: INITIAL_BINDING_REGISTRY,
        executorVersions: { codex: "1.0.0", kimi: "1.0.0", hermes: "1.0.0" },
        now: () => TS,
      },
    });
    const chainEntry = new LoopCapabilityEntry({
      runStore: chainStore,
      artifactStore: chainArtifacts,
      bindingRegistry: INITIAL_BINDING_REGISTRY,
      gateway: chainGateway,
      now: () => TS,
    });
    const chainSource = chainArtifacts.put("requirement_summary", "full chain Requirement source");
    let chainInput = {
      artifactRef: chainSource.artifactRef,
      version: "1.0.0",
      digest: chainSource.digest,
    };
    let chainRecovery = recoverRunContext(chainStore, chainIdentity.requirementId);
    for (let index = 0; index < NODE_CAPABILITY_IDS.length; index += 1) {
      const capability = NODE_CAPABILITY_IDS[index]!;
      const capabilityInput = capability === "implementation"
        ? {
            implementationExecutorInput: {
              requirement: "implement the approved design",
              requirementId: chainIdentity.requirementId,
              summary: {
                requirement_id: chainIdentity.requirementId,
                multi_repo: false,
                main_repo: "example",
                sub_requirements: [],
                parsed_at: TS,
              },
              designOutput: { artifactRef: chainInput.artifactRef },
              reviewOutput: { result: "PASS" },
              complexity: "low",
              executionMode: "direct",
            },
          }
        : { previousArtifactRef: chainInput.artifactRef };
      const step = await chainEntry.execute({
        requirementId: chainIdentity.requirementId,
        ...(index === 0 ? { identity: chainIdentity } : {}),
        capability,
        inputArtifactRef: chainInput.artifactRef,
        inputArtifactVersion: chainInput.version,
        inputDigest: chainInput.digest,
        outputArtifactVersion: "1.0.0",
        input: capabilityInput,
      });
      ok(step.execution.success === true, `${capability} produces a qualified traced result`);
      chainRecovery = step.recoveryContext;
      const state = chainRecovery.capabilityStates[index]!;
      chainInput = {
        artifactRef: state.effectiveOutputArtifactRef!,
        version: state.effectiveOutputArtifactVersion!,
        digest: state.effectiveOutputDigest!,
      };
    }
    ok(chainRecovery?.capabilityChainStatus === "COMPLETED", "recovery distinguishes a completed capability chain");
    ok(chainRecovery?.nextCapability === null, "completed capability chain has no next capability");
    ok(chainStore.listCapabilityExecutions(chainIdentity.runId).length === 14, "seven attempts persist fourteen immutable events");
    const reopened = recoverRunContext(chainStore, chainIdentity.requirementId);
    ok(reopened?.capabilityChainStatus === "COMPLETED", "another entry recovers the completed chain without reinterpretation");
    chainArtifacts.close();
    chainStore.close();
  } finally {
    rmSync(chainRoot, { recursive: true, force: true });
  }

  console.log("WP-4B round 1: traced Gateway rejects canonical capability bypass");
  const bypassFixture = await completedIntakeFixture("loop-wp4b-bypass-");
  try {
    let dispatchCalls = 0;
    const spyRunner: CodexRunner = {
      run: async (request) => {
        dispatchCalls += 1;
        return createCodexFakeRunner({ scenario: "success_code_patch" }).run(request);
      },
    };
    const gateway = tracedGateway(bypassFixture.runStore, bypassFixture.artifactStore, spyRunner);
    const before = bypassFixture.runStore.listCapabilityExecutions(bypassFixture.id.runId).length;
    await rejectsCode("INVALID_INPUT", () => gateway.execute({
      type: "solution-review",
      node: "review",
      agent: "codex",
      requirementId: bypassFixture.id.requirementId,
      input: { design: "untraced" },
    }), "configured tracing rejects a canonical capability without loopExecution");
    ok(dispatchCalls === 0, "untraced canonical capability is rejected before Agent dispatch");
    ok(
      bypassFixture.runStore.listCapabilityExecutions(bypassFixture.id.runId).length === before,
      "untraced canonical capability rejection has no journal side effect",
    );
  } finally {
    closeFixture(bypassFixture);
  }

  console.log("WP-4B round 1: claim-persisted interruption is closed and retried");
  const claimedFixture = await completedIntakeFixture("loop-wp4b-claimed-");
  try {
    const started = event({
      executionEventId: `${claimedFixture.id.runId}:capability:3:started`,
      runId: claimedFixture.id.runId,
      sequence: 3,
      capability: "tech-design",
      nodeId: "tech-design",
      inputArtifactRef: claimedFixture.techInput.artifactRef,
      inputArtifactVersion: claimedFixture.techInput.version,
      inputDigest: claimedFixture.techInput.digest,
      bindingId: "binding-codex-tech-design",
    });
    claimedFixture.runStore.appendCapabilityExecution(started);
    const running = recoverRunContext(claimedFixture.runStore, claimedFixture.id.requirementId)!;
    ok(running.capabilityChainStatus === "RUNNING", "persisted claim recovers as RUNNING");
    ok(running.nextCapability === null, "RUNNING recovery does not advertise an impossible dispatch");
    const unrelated = claimedFixture.artifactStore.put("capability_output", "unrelated interruption input");
    await rejectsCode("INVALID_INPUT", () => recoveryEntry(claimedFixture).execute({
      ...techRequest(claimedFixture),
      inputArtifactRef: unrelated.artifactRef,
      inputDigest: unrelated.digest,
    }), "mismatched recovery input cannot close the active claim");
    ok(
      claimedFixture.runStore.listCapabilityExecutions(claimedFixture.id.runId).length === 3,
      "mismatched recovery input leaves the active claim unchanged",
    );
    const resumed = await recoveryEntry(claimedFixture).execute(techRequest(claimedFixture));
    ok(resumed.attempt === 2 && resumed.execution.success === true, "claim-persisted interruption resumes as attempt two");
    const events = claimedFixture.runStore.listCapabilityExecutions(claimedFixture.id.runId);
    const interrupted = events[3]!;
    ok(
      interrupted.status === "failed" && interrupted.errorCode === "ATTEMPT_INTERRUPTED" &&
      interrupted.retryable === true && interrupted.reasonCode === "ENTRY_RECOVERY",
      "supported entry closes the abandoned claim with a retryable interruption event",
    );
    ok(
      interrupted.bindingId === started.bindingId && interrupted.bindingVersion === started.bindingVersion &&
      interrupted.bindingRegistryVersion === started.bindingRegistryVersion &&
      interrupted.executorAgent === started.executorAgent && interrupted.executorAdapter === started.executorAdapter &&
      interrupted.executorVersion === started.executorVersion,
      "interruption terminal copies the persisted executor snapshot without fabrication",
    );
    ok(
      interrupted.inputArtifactRef === started.inputArtifactRef &&
      interrupted.inputArtifactVersion === started.inputArtifactVersion && interrupted.inputDigest === started.inputDigest,
      "interruption terminal copies the persisted input lineage",
    );
    ok(events[4]?.attempt === 2 && events[5]?.status === "succeeded", "retry closes as a distinct successful attempt");
  } finally {
    closeFixture(claimedFixture);
  }

  console.log("WP-4B round 1: in-dispatch process loss can be recovered by another entry");
  const dispatchFixture = await completedIntakeFixture("loop-wp4b-dispatch-");
  try {
    let enteredDispatch!: () => void;
    let releaseDispatch!: () => void;
    const entered = new Promise<void>((resolve) => { enteredDispatch = resolve; });
    const released = new Promise<void>((resolve) => { releaseDispatch = resolve; });
    const baseRunner = createCodexFakeRunner({ scenario: "success_code_patch" });
    const hangingRunner: CodexRunner = {
      run: async (request) => {
        enteredDispatch();
        await released;
        return baseRunner.run(request);
      },
    };
    const abandoned = recoveryEntry(
      dispatchFixture,
      tracedGateway(dispatchFixture.runStore, dispatchFixture.artifactStore, hangingRunner),
    ).execute(techRequest(dispatchFixture));
    await entered;
    ok(
      recoverRunContext(dispatchFixture.runStore, dispatchFixture.id.requirementId)?.capabilityChainStatus === "RUNNING",
      "dispatch-in-progress claim is durable before the runner returns",
    );
    const resumed = await recoveryEntry(dispatchFixture).execute(techRequest(dispatchFixture));
    ok(resumed.attempt === 2 && resumed.execution.success === true, "another entry closes and retries an in-dispatch interruption");
    releaseDispatch();
    await rejectsCode(
      "EVENT_SEQUENCE_CONFLICT",
      () => abandoned,
      "late abandoned executor cannot overwrite the interruption terminal",
    );
    const events = dispatchFixture.runStore.listCapabilityExecutions(dispatchFixture.id.runId);
    ok(events.length === 6 && events[3]?.errorCode === "ATTEMPT_INTERRUPTED", "in-dispatch recovery persists one closed interruption and one retry");
  } finally {
    closeFixture(dispatchFixture);
  }

  console.log("WP-4B round 1: terminal-write interruption can be recovered");
  const terminalFixture = await completedIntakeFixture("loop-wp4b-terminal-");
  try {
    const originalAppend = terminalFixture.runStore.appendCapabilityExecution.bind(terminalFixture.runStore);
    let rejectTerminalOnce = true;
    terminalFixture.runStore.appendCapabilityExecution = ((candidate: LoopCapabilityExecutionEvent) => {
      if (rejectTerminalOnce && candidate.status !== "started") {
        rejectTerminalOnce = false;
        throw new LoopRunJournalError("STORE_FAILURE", "injected terminal write failure");
      }
      return originalAppend(candidate);
    }) as typeof terminalFixture.runStore.appendCapabilityExecution;
    await rejectsCode(
      "STORE_FAILURE",
      () => recoveryEntry(terminalFixture).execute(techRequest(terminalFixture)),
      "terminal write failure leaves a durable active claim",
    );
    terminalFixture.runStore.appendCapabilityExecution = originalAppend;
    const stranded = recoverRunContext(terminalFixture.runStore, terminalFixture.id.requirementId)!;
    ok(stranded.capabilityChainStatus === "RUNNING" && stranded.nextCapability === null, "terminal-write interruption is recovered honestly as active");
    const resumed = await recoveryEntry(terminalFixture).execute(techRequest(terminalFixture));
    ok(resumed.attempt === 2 && resumed.execution.success === true, "new entry recovers after terminal write loss");
    const events = terminalFixture.runStore.listCapabilityExecutions(terminalFixture.id.runId);
    ok(events.length === 6 && events[3]?.errorCode === "ATTEMPT_INTERRUPTED", "terminal-write recovery closes the abandoned attempt before retry");
  } finally {
    closeFixture(terminalFixture);
  }

  const root = mkdtempSync(join(tmpdir(), "loop-wp4b-"));
  const repo = join(root, "repo");
  mkdirSync(repo);
  const id = identity(root);
  const runStore = new LoopRunStore(join(root, "journal.db"));
  const artifactStore = new LoopArtifactStore({ controlRoot: id.controlRoot, repositoryPath: repo });
  runStore.init();
  artifactStore.init();
  try {
    const source = artifactStore.put("requirement_summary", "normalized requirement source");
    const gateway = new ExecutionGateway({
      env: { SDLC_EXECUTION_MODE: "codex", SDLC_CODEX_REAL_DISPATCH: "enabled" },
      codexRunner: createCodexFakeRunner({ scenario: "success_code_patch" }),
      capabilityTracing: {
        runStore,
        artifactStore,
        bindingRegistry: INITIAL_BINDING_REGISTRY,
        executorVersions: { codex: "1.0.0", kimi: "1.0.0", hermes: "1.0.0" },
        now: () => TS,
      },
    });
    const entry = new LoopCapabilityEntry({
      runStore,
      artifactStore,
      bindingRegistry: INITIAL_BINDING_REGISTRY,
      gateway,
      now: () => TS,
    });
    const first = await entry.execute({
      requirementId: id.requirementId,
      identity: id,
      capability: "requirement-intake",
      inputArtifactRef: source.artifactRef,
      inputArtifactVersion: "1.0.0",
      inputDigest: source.digest,
      outputArtifactVersion: "1.0.0",
      input: { requirement: "build a local feature" },
    });
    ok(first.recovered === false, "first entry creates the Requirement run");
    ok(first.runId === id.runId, "created entry uses the supplied run identity");
    ok(first.execution.success === true, "qualified capability output succeeds");
    ok(first.recoveryContext.nextCapability === "tech-design", "recovery advances to the next capability");
    const firstEvents = runStore.listCapabilityExecutions(id.runId);
    ok(firstEvents.length === 2, "started and succeeded events persisted");
    ok(firstEvents[0]?.executorAgent === "codex", "actual Agent snapshot persisted");
    ok(firstEvents[0]?.executorAdapter === "codex-real-dispatch", "actual adapter snapshot persisted");
    ok(firstEvents[1]?.outputArtifactVersion === "1.0.0", "effective output version persisted");
    ok(firstEvents[1]?.gateResult === "NOT_APPLICABLE", "Gate result persisted explicitly");
    const duplicateTerminal = runStore.appendCapabilityExecution(firstEvents[1]!);
    ok(duplicateTerminal.appended === false, "an exact duplicate event is idempotent, not a new execution claim");

    const currentOutput = first.recoveryContext.capabilityStates[0]!;
    ok(currentOutput.effectiveOutputArtifactRef !== null, "recovery exposes effective output ref");
    ok(currentOutput.effectiveOutputDigest !== null, "recovery exposes effective output digest");

    const unrelated = artifactStore.put("capability_output", "unrelated but valid artifact");
    await rejectsCode("INVALID_INPUT", () => entry.execute({
      requirementId: id.requirementId,
      capability: "tech-design",
      inputArtifactRef: unrelated.artifactRef,
      inputArtifactVersion: "1.0.0",
      inputDigest: unrelated.digest,
      outputArtifactVersion: "1.0.0",
      input: { requirementSummaryRef: unrelated.artifactRef },
    }), "next capability cannot substitute an unrelated valid artifact");
    ok(runStore.listCapabilityExecutions(id.runId).length === 2, "rejected lineage mismatch has no journal side effect");

    // A replacement creates registry snapshot v2. Kimi is intentionally not
    // real-enabled, so the Gateway returns shadow; tracing must persist a
    // failed attempt rather than a fabricated success.
    const replacement = replaceBinding(
      INITIAL_BINDING_REGISTRY,
      "binding-codex-tech-design",
      "binding-kimi-tech-design",
    );
    ok(replacement.registry.version === "2", "binding replacement increments registry snapshot version");
    const replacedGateway = new ExecutionGateway({
      env: { SDLC_EXECUTION_MODE: "codex", SDLC_CODEX_REAL_DISPATCH: "enabled" },
      codexRunner: createCodexFakeRunner({ scenario: "success_code_patch" }),
      capabilityTracing: {
        runStore,
        artifactStore,
        bindingRegistry: replacement.registry,
        executorVersions: { codex: "1.0.0", kimi: "2.0.0", hermes: "1.0.0" },
        now: () => TS,
      },
    });
    const replacedEntry = new LoopCapabilityEntry({
      runStore,
      artifactStore,
      bindingRegistry: replacement.registry,
      gateway: replacedGateway,
      now: () => TS,
    });
    const second = await replacedEntry.execute({
      requirementId: id.requirementId,
      capability: "tech-design",
      inputArtifactRef: currentOutput.effectiveOutputArtifactRef!,
      inputArtifactVersion: currentOutput.effectiveOutputArtifactVersion!,
      inputDigest: currentOutput.effectiveOutputDigest!,
      outputArtifactVersion: "1.0.0",
      input: { requirementSummaryRef: currentOutput.effectiveOutputArtifactRef },
    });
    ok(second.recovered === true, "second entry recovers the existing Requirement");
    ok(second.runId === first.runId, "second entry resumes the same run");
    ok(second.execution.success === false, "unqualified shadow result is not reported as success");
    ok(second.recoveryContext.nextCapability === "tech-design", "retryable failure remains recoverable at the same capability");
    const allEvents = runStore.listCapabilityExecutions(id.runId);
    ok(allEvents.length === 4, "replacement attempt adds started and failed events");
    ok(allEvents[0]?.bindingId === "binding-codex-requirement-intake", "historical binding snapshot remains unchanged");
    ok(allEvents[2]?.bindingId === "binding-kimi-tech-design", "new attempt records replacement binding");
    ok(allEvents[2]?.bindingRegistryVersion === "2", "new attempt records replacement registry version");
    ok(allEvents[2]?.executorVersion === "2.0.0", "new attempt records replacement executor version");
    ok(allEvents[3]?.status === "failed" && allEvents[3]?.retryable === true, "failure is persisted as a retryable attempt");

    console.log("WP-4B: capability corruption is detected through normal snapshot reads");
    const db = new Database(join(root, "journal.db"));
    db.prepare("UPDATE loop_capability_executions SET executor_adapter = ? WHERE sequence = 1").run("tampered-adapter");
    db.close();
    throwsCode("STORE_CORRUPT", () => runStore.getSnapshot(id.runId), "tampered capability event makes the run snapshot corrupt");
  } finally {
    artifactStore.close();
    runStore.close();
    rmSync(root, { recursive: true, force: true });
  }

  console.log(`loop-capability-execution: ${passed}/${passed} assertions passed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
