import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

import { LoopArtifactStore, type LoopArtifactKind } from "../core/loop-artifact-store";
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
import { LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION, createLoopArtifactRevision } from "../core/loop-artifact-revision";
import { LoopRunJournalError, type LoopRunEvent, type LoopRunIdentity } from "../core/loop-executor-types";
import {
  CAPABILITY_ARTIFACT_TYPES,
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

import { materializeProducerRevision } from "../runtime";
import {
  LOOP_CAPABILITY_EXECUTION_POINTS,
  NODE_CAPABILITY_IDS,
  type CapabilityExecutionRole,
  type NodeCapabilityId,
} from "../loop/types";
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
  // C02-WP5 (clause 0.1.4): supported entries require the run journal bound
  // to the same artifact store instance they read through.
  const artifactStore = new LoopArtifactStore({ controlRoot: id.controlRoot, repositoryPath: repo });
  const runStore = new LoopRunStore(join(root, "journal.db"), { artifactStore });
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
    executionRole: "primary" as const,
    inputArtifactRef: source.artifactRef,
    inputArtifactVersion: "1.0.0",
    inputDigest: source.digest,
    outputArtifactVersion: "1.0.0",
    input: { requirement: "recover an interrupted execution" },
  });
  const output = first.recoveryContext.capabilityStates[0]!;
  // F2-1: land the intake producer's revision so later entries dispatch
  // against an established current instead of an open terminal→revision
  // window.
  materializeProducerRevision(
    runStore, id.requirementId, id.runId,
    runStore.listCapabilityExecutions(id.runId).find(
      (event) => event.executionEventId === first.producerTerminalEventId,
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
    // C02-WP5: the output version is attempt-scoped (N.0.0); the entry
    // enforces the recovered next-attempt number.
    outputArtifactVersion: `${attempt}.0.0`,
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
  throwsCode("INVALID_INPUT", () => validateLoopCapabilityExecutionEvent(event({ nodeId: "solution-design" })), "capability/node mismatch rejected");
  throwsCode("INVALID_INPUT", () => validateLoopCapabilityExecutionEvent(event({ inputDigest: "b".repeat(64) })), "artifact ref/digest mismatch rejected");
  throwsCode("INVALID_INPUT", () => validateLoopCapabilityExecutionEvent(event({
    executionEventId: "run-wp4b-001:capability:1:succeeded", status: "succeeded",
  })), "success without output/Gate rejected");
  throwsCode("INVALID_INPUT", () => validateLoopCapabilityExecutionEvent(event({
    executionEventId: "run-wp4b-001:capability:1:failed",
    status: "failed", nextStepEligibility: "ELIGIBLE", errorCode: "X", retryable: true,
  })), "failed execution cannot make next step eligible");
  // v2 (A2): the execution role is a required, capability-bound scalar.
  throwsCode("INVALID_INPUT", () => validateLoopCapabilityExecutionEvent(event({
    executionRole: "adversarial_scan" as CapabilityExecutionRole,
  })), "primary node cannot claim a gate role");
  throwsCode("INVALID_INPUT", () => validateLoopCapabilityExecutionEvent(event({
    bindingId: "binding-codex-requirement-intake",
  })), "bindingId must carry agent, capability and role");
  throwsCode("INVALID_INPUT", () => validateLoopCapabilityExecutionChain([
    event({ capability: "solution-design", nodeId: "solution-design", bindingId: "binding-codex-solution-design-primary" }),
  ], "run-wp4b-001"), "capability chain cannot skip requirement intake");
  ok(canonicalizeLoopCapabilityExecutionEvent(event()).includes('"executorAgent":"codex"'), "canonical form contains executor snapshot");

  console.log("WP-4B: capability prompt contract for the v2 execution points");
  const reviewPrompt = buildCapabilityPrompt({
    type: "solution-gate", node: "solution-gate", agent: "codex", requirementId: "REQ-WP4B", input: {},
  }, "solution-gate", "{}");
  ok(reviewPrompt.includes("GATE_RESULT"), "Gate capability prompt requires a machine-readable Gate marker");
  ok(parseCapabilityOutcomeMarkers("solution-gate", "review\nGATE_RESULT: PASS")["gateResult"] === "PASS",
    "real-runner Gate marker parser extracts one canonical result");
  ok(Array.isArray(parseCapabilityOutcomeMarkers(
    "code-review", 'review\nUNRESOLVED_FINDINGS_JSON: [{"severity":"P1"}]',
  )["unresolvedFindings"]), "real-runner finding marker parser extracts a JSON array");
  ok(parseCapabilityOutcomeMarkers(
    "solution-gate", "GATE_RESULT: PASS\nGATE_RESULT: FAIL",
  )["gateResult"] === undefined, "duplicate Gate markers fail closed");

  console.log("WP3.5-B: journal v6 cutover is declarative and fail-closed");
  const migrationRoot = mkdtempSync(join(tmpdir(), "loop-wp4b-migration-"));
  try {
    mkdirSync(join(migrationRoot, "repo"));
    // A supported v6 store initializes and stays readable.
    const v6Path = join(migrationRoot, "journal.db");
    const v6Store = new LoopRunStore(v6Path);
    v6Store.init();
    v6Store.createRun(identity(migrationRoot));
    v6Store.close();
    const v6db = new Database(v6Path);
    ok(v6db.pragma("user_version", { simple: true }) === 7, "fresh store declares format v7");
    v6db.close();
    const reopened = new LoopRunStore(v6Path);
    reopened.init();
    ok(reopened.getSnapshot("run-wp4b-001") !== undefined, "v6 run remains readable");
    reopened.close();

    // Known historical formats 1..5 are rejected — never migrated.
    for (const historical of [1, 2, 3, 4, 5, 6]) {
      const historicalPath = join(migrationRoot, `historical-${historical}.db`);
      const seed = new Database(historicalPath);
      seed.pragma(`user_version = ${historical}`);
      seed.close();
      const rejected = new LoopRunStore(historicalPath);
      throwsCode("UNSUPPORTED_HISTORICAL_FORMAT", () => rejected.init(), `format ${historical} is rejected as unsupported history`);
    }

    // A declared version above the supported one is a future format.
    const futurePath = join(migrationRoot, "future.db");
    const futureSeed = new Database(futurePath);
    futureSeed.pragma("user_version = 8");
    futureSeed.close();
    const futureRejected = new LoopRunStore(futurePath);
    throwsCode("UNSUPPORTED_FUTURE_FORMAT", () => futureRejected.init(), "format 8 is rejected as a future format");

    // An unversioned database that already carries LOOP business tables is
    // history, never a fresh store; an empty v0 database initializes fresh.
    const unversionedPath = join(migrationRoot, "unversioned.db");
    const unversionedSeed = new Database(unversionedPath);
    unversionedSeed.exec("CREATE TABLE loop_runs (run_id TEXT PRIMARY KEY)");
    unversionedSeed.close();
    const unversionedRejected = new LoopRunStore(unversionedPath);
    throwsCode("UNSUPPORTED_HISTORICAL_FORMAT", () => unversionedRejected.init(), "unversioned database with LOOP tables is rejected as history");

    const freshPath = join(migrationRoot, "fresh-empty.db");
    new Database(freshPath).close();
    const freshStore = new LoopRunStore(freshPath);
    freshStore.init();
    ok(new Database(freshPath).pragma("user_version", { simple: true }) === 7, "empty unversioned database initializes fresh to v7");
    freshStore.close();

    // Inside the declared v6 format, drift is STORE_CORRUPT — not a format
    // error.
    const corruptV6 = new Database(v6Path);
    corruptV6.exec("DROP TABLE loop_capability_executions");
    corruptV6.close();
    const corruptRejected = new LoopRunStore(v6Path);
    throwsCode("STORE_CORRUPT", () => corruptRejected.init(), "v6 marker with missing capability table is corrupt inside the supported format");
  } finally {
    rmSync(migrationRoot, { recursive: true, force: true });
  }

  console.log("WP3.5-B: eight-point chain enforces scan/verdict separation");
  {
    const ledgerDigest = "e".repeat(64);
    const ledgerRef = `loop-artifact:v1:capability_findings:sha256:${ledgerDigest}`;
    const scanOutputDigest = "f".repeat(64);
    const scanOutputRef = `loop-artifact:v1:solution_review:sha256:${scanOutputDigest}`;
    // solution-design consumes the intake product and produces the design.
    const intakeProductDigest = "b".repeat(64);
    const intakeProductRef = `loop-artifact:v1:requirement_summary:sha256:${intakeProductDigest}`;
    const designDigest = "c".repeat(64);
    const designRef = `loop-artifact:v1:technical_design:sha256:${designDigest}`;
    const intakeOutput = event({
      executionEventId: "run-wp4b-001:capability:2:succeeded",
      sequence: 2,
      status: "succeeded",
      outputArtifactRef: intakeProductRef,
      outputArtifactVersion: "1.0.0",
      outputDigest: intakeProductDigest,
      gateResult: "NOT_APPLICABLE",
      nextStepEligibility: "ELIGIBLE",
    });
    const designStarted = event({
      executionEventId: "run-wp4b-001:capability:3:started",
      sequence: 3,
      capability: "solution-design",
      nodeId: "solution-design",
      attempt: 1,
      bindingId: "binding-codex-solution-design-primary",
      inputArtifactRef: intakeProductRef,
      inputArtifactVersion: "1.0.0",
      inputDigest: intakeProductDigest,
    });
    const designSucceeded = event({
      ...designStarted,
      executionEventId: "run-wp4b-001:capability:4:succeeded",
      sequence: 4,
      status: "succeeded",
      outputArtifactRef: designRef,
      outputArtifactVersion: "1.0.0",
      outputDigest: designDigest,
      gateResult: "NOT_APPLICABLE",
      nextStepEligibility: "ELIGIBLE",
    });
    const scanStarted = event({
      executionEventId: "run-wp4b-001:capability:5:started",
      sequence: 5,
      capability: "solution-gate",
      executionRole: "adversarial_scan",
      nodeId: "solution-gate",
      attempt: 1,
      bindingId: "binding-codex-solution-gate-adversarial_scan",
      inputArtifactRef: designRef,
      inputArtifactVersion: "1.0.0",
      inputDigest: designDigest,
    });
    const scanSucceeded = event({
      ...scanStarted,
      executionEventId: "run-wp4b-001:capability:6:succeeded",
      sequence: 6,
      status: "succeeded",
      outputArtifactRef: scanOutputRef,
      outputArtifactVersion: "1.0.0",
      outputDigest: scanOutputDigest,
      gateResult: "NOT_APPLICABLE",
      nextStepEligibility: "ELIGIBLE",
      unresolvedFindingsRef: ledgerRef,
      unresolvedFindingsDigest: ledgerDigest,
    });
    void scanSucceeded;
    validateLoopCapabilityExecutionChain([event(), intakeOutput, designStarted, designSucceeded, scanStarted, scanSucceeded], "run-wp4b-001");
    ok(true, "scan role succeeds with NOT_APPLICABLE Gate despite carrying findings");

    // The verdict dispatch to the SAME agent fails closed at the chain level.
    const verdictSameAgent = event({
      executionEventId: "run-wp4b-001:capability:7:started",
      sequence: 7,
      capability: "solution-gate",
      executionRole: "formal_verdict",
      nodeId: "solution-gate",
      attempt: 1,
      bindingId: "binding-codex-solution-gate-formal_verdict",
      inputArtifactRef: scanOutputRef,
      inputArtifactVersion: "1.0.0",
      inputDigest: scanOutputDigest,
      consumedFindingsRef: ledgerRef,
      consumedFindingsDigest: ledgerDigest,
      decisionDepth: null,
      decisionScopeId: null,
      decisionDeltaRef: null,
      decisionDeltaDigest: null,
    });
    throwsCode(
      "INVALID_INPUT",
      () => validateLoopCapabilityExecutionChain([event(), intakeOutput, designStarted, designSucceeded, scanStarted, scanSucceeded, verdictSameAgent], "run-wp4b-001"),
      "formal_verdict dispatched to the adversarial_scan agent is rejected",
    );

    // A different agent may take the verdict, and it must return a conclusive
    // Gate result on success.
    const verdictStarted = event({
      ...verdictSameAgent,
      executorAgent: "hermes" as const,
      executorAdapter: "hermes-cli",
      bindingId: "binding-hermes-solution-gate-formal_verdict",
      inputArtifactRef: scanOutputRef,
      inputDigest: scanOutputDigest,
      consumedFindingsRef: ledgerRef,
      consumedFindingsDigest: ledgerDigest,
      decisionDepth: null,
      decisionScopeId: null,
      decisionDeltaRef: null,
      decisionDeltaDigest: null,
    });
    const reviewDigest = "d".repeat(64);
    const reviewRef = `loop-artifact:v1:solution_review:sha256:${reviewDigest}`;
    throwsCode("INVALID_INPUT", () => validateLoopCapabilityExecutionChain([
      event(), intakeOutput, designStarted, designSucceeded, scanStarted, scanSucceeded, verdictStarted,
      event({
        ...verdictStarted,
        executionEventId: "run-wp4b-001:capability:8:succeeded",
        sequence: 8,
        status: "succeeded",
        outputArtifactRef: reviewRef,
        outputArtifactVersion: "1.0.0",
        outputDigest: reviewDigest,
        gateResult: "NOT_APPLICABLE",
        decisionDepth: "STANDARD" as const,
        decisionScopeId: "run-wp4b-001:decision:1",
        decisionDeltaRef: reviewRef,
        decisionDeltaDigest: reviewDigest,
        nextStepEligibility: "ELIGIBLE",
      }),
    ], "run-wp4b-001"), "formal_verdict success without a conclusive Gate result is rejected");
    validateLoopCapabilityExecutionChain([
      event(), intakeOutput, designStarted, designSucceeded, scanStarted, scanSucceeded, verdictStarted,
      event({
        ...verdictStarted,
        executionEventId: "run-wp4b-001:capability:8:succeeded",
        sequence: 8,
        status: "succeeded",
        outputArtifactRef: reviewRef,
        outputArtifactVersion: "1.0.0",
        outputDigest: reviewDigest,
        gateResult: "PASS_WITH_RISK",
        decisionDepth: "STANDARD" as const,
        decisionScopeId: "run-wp4b-001:decision:1",
        decisionDeltaRef: reviewRef,
        decisionDeltaDigest: reviewDigest,
        nextStepEligibility: "ELIGIBLE",
      }),
    ], "run-wp4b-001");
    ok(true, "different-agent formal_verdict with a conclusive Gate completes the node");
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

  console.log("WP3.5-B: traced scan dispatch succeeds and the same-agent verdict dispatch is firewalled");
  const gateRoot = mkdtempSync(join(tmpdir(), "loop-wp4b-gate-"));
  try {
    mkdirSync(join(gateRoot, "repo"));
    const gateIdentity = identity(gateRoot);
    const gateArtifacts = new LoopArtifactStore({
      controlRoot: gateIdentity.controlRoot,
      repositoryPath: gateIdentity.repositoryPath,
    });
    const gateStore = new LoopRunStore(join(gateRoot, "journal.db"), { artifactStore: gateArtifacts });
    gateStore.init();
    gateArtifacts.init();
    gateStore.createRun(gateIdentity);
    gateStore.appendEvent(runEvent(gateIdentity.runId, 2, "run_started"));
    const gateSource = gateArtifacts.put("requirement_summary", "gate test Requirement source");
    let inputRef = gateSource.artifactRef;
    let inputDigest = gateSource.digest;
    let sequence = 1;
    for (const capability of NODE_CAPABILITY_IDS.slice(0, 2)) {
      const nodeId = capability;
      const start = event({
        executionEventId: `${gateIdentity.runId}:capability:${sequence}:started`,
        sequence,
        capability,
        nodeId,
        bindingId: `binding-codex-${capability}-primary`,
        inputArtifactRef: inputRef,
        inputDigest,
      });
      gateStore.appendCapabilityExecution(start);
      const seededOutput = gateArtifacts.put(CAPABILITY_ARTIFACT_TYPES[capability] as LoopArtifactKind, `seed output for ${capability}`);
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
      // F2-1: land the producer's revision before the next point starts so
      // the seeded chain stays a legal precondition chain.
      materializeProducerRevision(
        gateStore, gateIdentity.requirementId, gateIdentity.runId,
        gateStore.listCapabilityExecutions(gateIdentity.runId).at(-1)!,
        () => TS,
      );
      inputRef = outputRef;
      inputDigest = outputDigest;
      sequence += 2;
    }
    const gateGateway = new ExecutionGateway({
      env: { SDLC_EXECUTION_MODE: "codex", SDLC_CODEX_REAL_DISPATCH: "enabled" },
      codexRunner: createCodexFakeRunner({ scenario: "success_code_patch" }),
      capabilityTracing: {
        runStore: gateStore,
        artifactStore: gateArtifacts,
        bindingRegistry: INITIAL_BINDING_REGISTRY,
        executorVersions: { codex: "1.0.0", kimi: "1.0.0", hermes: "1.0.0" },
        now: () => TS,
      },
    });
    // The adversarial_scan dispatch runs first and never writes a Gate result.
    const scanResult = await gateGateway.execute({
      type: "solution-gate",
      node: "solution-gate",
      agent: "codex",
      requirementId: gateIdentity.requirementId,
      input: { designRef: inputRef },
      loopExecution: {
        runId: gateIdentity.runId,
        attempt: 1,
        executionRole: "adversarial_scan" as CapabilityExecutionRole,
        inputArtifactRef: inputRef,
        inputArtifactVersion: "1.0.0",
        inputDigest,
        outputArtifactVersion: "1.0.0",
      },
    });
    ok(scanResult.success === true, "adversarial_scan dispatch succeeds without a Gate marker");
    const gateEvents = gateStore.listCapabilityExecutions(gateIdentity.runId);
    ok(gateEvents.at(-1)?.status === "succeeded", "scan outcome is recorded as a succeeded attempt");
    ok(gateEvents.at(-1)?.executionRole === "adversarial_scan", "scan attempt records the adversarial_scan role");
    ok(gateEvents.at(-1)?.gateResult === "NOT_APPLICABLE", "scan Gate result is fixed to NOT_APPLICABLE");

    // The formal_verdict dispatch to the SAME agent is firewalled before
    // dispatch (the store re-validates before promotion).
    const gateEntry = new LoopCapabilityEntry({
      runStore: gateStore,
      artifactStore: gateArtifacts,
      bindingRegistry: INITIAL_BINDING_REGISTRY,
      gateway: gateGateway,
      now: () => TS,
    });
    // The verdict consumes the scan's effective output triple.
    const scanEvent = gateEvents.at(-1)!;
    await rejectsCode("ILLEGAL_TRANSITION", () => gateEntry.execute({
      requirementId: gateIdentity.requirementId,
      capability: "solution-gate",
      executionRole: "formal_verdict",
      inputArtifactRef: scanEvent.outputArtifactRef!,
      inputArtifactVersion: scanEvent.outputArtifactVersion!,
      inputDigest: scanEvent.outputDigest!,
      outputArtifactVersion: "1.0.0",
      input: { designRef: inputRef },
    }), "same-agent formal_verdict dispatch is rejected by the pre-dispatch firewall");
    gateArtifacts.close();
    gateStore.close();
  } finally {
    rmSync(gateRoot, { recursive: true, force: true });
  }

  console.log("WP3.5-B: supported entry completes and recovers the full eight-point chain");
  const chainRoot = mkdtempSync(join(tmpdir(), "loop-wp4b-chain-"));
  try {
    mkdirSync(join(chainRoot, "repo"));
    const chainIdentity = identity(chainRoot);
    const chainArtifacts = new LoopArtifactStore({
      controlRoot: chainIdentity.controlRoot,
      repositoryPath: chainIdentity.repositoryPath,
    });
    const chainStore = new LoopRunStore(join(chainRoot, "journal.db"), { artifactStore: chainArtifacts });
    chainStore.init();
    chainArtifacts.init();
    // v2: the formal_verdict slot is bound to a second agent so the scan and
    // verdict roles of one solution-gate round are provably executed by
    // different agents.
    const chainRegistry = replaceBinding(
      INITIAL_BINDING_REGISTRY,
      "binding-codex-solution-gate-formal_verdict",
      "binding-hermes-solution-gate-formal_verdict",
    ).registry;
    const stubNow = (): string => TS;
    const chainTracing = {
      runStore: chainStore,
      artifactStore: chainArtifacts,
      bindingRegistry: chainRegistry,
      executorVersions: { codex: "1.0.0", kimi: "1.0.0", hermes: "1.0.0" },
      now: () => TS,
    };
    class ChainStubGateway extends ExecutionGateway {
      constructor() { super({ capabilityTracing: chainTracing }); }
      override async execute(request: import("../execution/types").ExecutionRequest) {
        const context = request.loopExecution as Record<string, unknown>;
        const runId = String(context.runId);
        const capability = request.type as NodeCapabilityId;
        const executionRole = String(context.executionRole);
        const agent = (request.agent ?? "codex") as "codex" | "kimi" | "hermes";
        const existing = chainStore.listCapabilityExecutions(runId);
        const sequence = existing.length + 1;
        if (process.env["R1_DEBUG"] && executionRole === "formal_verdict") {
          console.error("DBG verdict context keys:", Object.keys(context).join(","), "consumed:", String(context.consumedFindingsRef).slice(0, 40));
        }
        const base = {
          schemaVersion: LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION,
          runId,
          capability,
          executionRole: executionRole as CapabilityExecutionRole,
          nodeId: String(request.node),
          attempt: Number(context.attempt),
          bindingId: `binding-${agent}-${capability}-${executionRole}`,
          bindingVersion: "2.0.0",
          bindingRegistryVersion: chainRegistry.version,
          executorAgent: agent,
          executorAdapter: agent === "codex" ? "codex-real-dispatch" : `${agent}-cli`,
          executorVersion: "1.0.0",
          inputArtifactRef: String(context.inputArtifactRef),
          inputArtifactVersion: String(context.inputArtifactVersion),
          inputDigest: String(context.inputDigest),
          consumedFindingsRef:
            typeof context.consumedFindingsRef === "string" ? context.consumedFindingsRef : null,
          consumedFindingsDigest:
            typeof context.consumedFindingsDigest === "string" ? context.consumedFindingsDigest : null,
        };
        chainStore.appendCapabilityExecution(Object.freeze({
          ...base,
          executionEventId: `${runId}:capability:${sequence}:started`,
          sequence,
          status: "started" as const,
          createdAt: stubNow(),
          outputArtifactRef: null,
          outputArtifactVersion: null,
          outputDigest: null,
          gateResult: null,
          unresolvedFindingsRef: null,
          unresolvedFindingsDigest: null,
          consumedFindingsRef: base.consumedFindingsRef,
          consumedFindingsDigest: base.consumedFindingsDigest,
          decisionDepth: null,
          decisionScopeId: null,
          decisionDeltaRef: null,
          decisionDeltaDigest: null,
          nextStepEligibility: null,
          errorCode: null,
          retryable: null,
          reasonCode: null,
        }));
        const output = chainArtifacts.put(
          CAPABILITY_ARTIFACT_TYPES[capability] as LoopArtifactKind,
          `stub node product for ${capability}/${executionRole} @${sequence}`,
        );
        // v3: the scan round always persists an immutable (possibly empty)
        // Finding Ledger artifact.
        const isScanPoint = capability === "solution-gate" && executionRole === "adversarial_scan";
        const ledgerEnvelope = isScanPoint
          ? chainArtifacts.put("capability_findings", `[] scan round @${sequence}`)
          : null;
        const isVerdictPoint = capability === "solution-gate" && executionRole === "formal_verdict";
        const gateResult = isVerdictPoint
          ? "PASS" as const
          : "NOT_APPLICABLE" as const;
        // v4: the stub verdict materializes its STANDARD depth decision with
        // an immutable delta artifact, mirroring runtime.ts.
        const decisionScopeId = isVerdictPoint ? `${runId}:decision:${context.attempt}` : null;
        const decisionDelta = isVerdictPoint
          ? chainArtifacts.put("solution_review", `depth=STANDARD decision delta for ${runId} attempt ${context.attempt}`)
          : null;
        chainStore.appendCapabilityExecution(Object.freeze({
          ...base,
          executionEventId: `${runId}:capability:${sequence + 1}:succeeded`,
          sequence: sequence + 1,
          status: "succeeded" as const,
          createdAt: stubNow(),
          outputArtifactRef: output.artifactRef,
          outputArtifactVersion: String(context.outputArtifactVersion),
          outputDigest: output.digest,
          gateResult,
          unresolvedFindingsRef: ledgerEnvelope?.artifactRef ?? null,
          unresolvedFindingsDigest: ledgerEnvelope?.digest ?? null,
          consumedFindingsRef: base.consumedFindingsRef,
          consumedFindingsDigest: base.consumedFindingsDigest,
          decisionDepth: isVerdictPoint ? ("STANDARD" as const) : null,
          decisionScopeId,
          decisionDeltaRef: decisionDelta?.artifactRef ?? null,
          decisionDeltaDigest: decisionDelta?.digest ?? null,
          nextStepEligibility: "ELIGIBLE" as const,
          errorCode: null,
          retryable: null,
          reasonCode: null,
        }));
        return Object.freeze({
          success: true,
          node: request.node,
          agent,
          output: Object.freeze({ result: "capability_completed" }),
          artifacts: Object.freeze([]),
        });
      }
    }
    const chainGateway = new ChainStubGateway();
    const chainEntry = new LoopCapabilityEntry({
      runStore: chainStore,
      artifactStore: chainArtifacts,
      bindingRegistry: chainRegistry,
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
    for (let index = 0; index < LOOP_CAPABILITY_EXECUTION_POINTS.length; index += 1) {
      const point = LOOP_CAPABILITY_EXECUTION_POINTS[index]!;
      const step = await chainEntry.execute({
        requirementId: chainIdentity.requirementId,
        ...(index === 0 ? { identity: chainIdentity } : {}),
        capability: point.capability,
        executionRole: point.executionRole,
        inputArtifactRef: chainInput.artifactRef,
        inputArtifactVersion: chainInput.version,
        inputDigest: chainInput.digest,
        outputArtifactVersion: "1.0.0",
        input: { previousArtifactRef: chainInput.artifactRef },
      });
      ok(step.execution.success === true, `${point.capability}/${point.executionRole} produces a qualified traced result`);
      chainRecovery = step.recoveryContext;
      if (point.capability === "solution-gate" && point.executionRole === "formal_verdict") {
        ok(
          chainRecovery.solutionGateDecision?.status === "BLOCKED_UNKNOWN",
          "verdict without its current gate revision remains BLOCKED_UNKNOWN",
        );
        ok(
          chainRecovery.nextExecutionPoint === null && chainRecovery.nextCapability === null,
          "blocked depth decision exposes no contradictory next dispatch projection",
        );
        ok(
          chainRecovery.capabilityChainStatus === "BLOCKED",
          "blocked depth decision projects a BLOCKED capability chain",
        );
      }
      // Round 2 H2: the depth decision binds to the CURRENT gate-node
      // revision, so a compliant driver authors a node revision after every
      // succeeded execution (mirroring runtime.ts). Scan rounds persist only
      // their Finding Ledger and never author the solution-gate revision.
      const produced = chainStore.listCapabilityExecutions(chainIdentity.runId).at(-1)!;
      const isChainScanRound =
        produced.capability === "solution-gate" && produced.executionRole === "adversarial_scan";
      if (!isChainScanRound) {
        const priorForNode = chainStore.listArtifactRevisions(chainIdentity.runId)
          .filter((item) => item.nodeId === produced.capability);
        const nodeIdx = NODE_CAPABILITY_IDS.indexOf(produced.capability);
        const upstreamNodeId = nodeIdx > 0 ? NODE_CAPABILITY_IDS[nodeIdx - 1]! : null;
        const upstreamCurrent = upstreamNodeId === null
          ? undefined
          : chainStore.getCurrentArtifactRevision(chainIdentity.runId, upstreamNodeId);
        chainStore.appendArtifactRevision(createLoopArtifactRevision({
          runId: chainIdentity.runId,
          requirementId: chainIdentity.requirementId,
          nodeId: produced.capability,
          sequence: priorForNode.length + 1,
          generation: chainStore.getRunGeneration(chainIdentity.runId),
          stablePath: `library/${chainIdentity.requirementId}/${LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[produced.capability].stablePathSegment}/${chainIdentity.requirementId}_${produced.capability}.md`,
          artifactKind: LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[produced.capability].artifactKind,
          semver: `${produced.attempt}.0.0`,
          artifactRef: produced.outputArtifactRef!,
          digest: produced.outputDigest!,
          producerExecutionId: produced.executionEventId,
          producerExecutionRole: produced.executionRole,
          gateResult: produced.gateResult,
          upstreamRevisionIds: upstreamCurrent === undefined ? [] : [upstreamCurrent.revisionId],
          createdAt: stubNow(),
        }));
      }
      const pointState = chainRecovery.executionPointStates[index]!;
      chainInput = {
        artifactRef: pointState.effectiveOutputArtifactRef!,
        version: pointState.effectiveOutputArtifactVersion!,
        digest: pointState.effectiveOutputDigest!,
      };
    }
    ok(chainRecovery?.capabilityChainStatus === "COMPLETED", "recovery distinguishes a completed capability chain");
    ok(chainRecovery?.nextCapability === null, "completed capability chain has no next capability");
    ok(chainRecovery?.nextExecutionPoint === null, "completed chain has no next execution point");
    ok(chainStore.listCapabilityExecutions(chainIdentity.runId).length === 16, "eight attempts persist sixteen immutable events");
    const verdictEvents = chainStore.listCapabilityExecutions(chainIdentity.runId).filter(
      (item) => item.capability === "solution-gate",
    );
    ok(
      verdictEvents.some((item) => item.executionRole === "adversarial_scan" && item.executorAgent === "codex") &&
      verdictEvents.some((item) => item.executionRole === "formal_verdict" && item.executorAgent === "hermes"),
      "solution-gate records both roles with different executor agents",
    );
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
      type: "solution-gate",
      node: "solution-gate",
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
      capability: "solution-design",
      nodeId: "solution-design",
      inputArtifactRef: claimedFixture.techInput.artifactRef,
      inputArtifactVersion: claimedFixture.techInput.version,
      inputDigest: claimedFixture.techInput.digest,
      bindingId: "binding-codex-solution-design-primary",
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
    const resumed = await recoveryEntry(claimedFixture).execute(techRequest(claimedFixture, 2));
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
    const resumed = await recoveryEntry(dispatchFixture).execute(techRequest(dispatchFixture, 2));
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
    const resumed = await recoveryEntry(terminalFixture).execute(techRequest(terminalFixture, 2));
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
  const artifactStore = new LoopArtifactStore({ controlRoot: id.controlRoot, repositoryPath: repo });
  const runStore = new LoopRunStore(join(root, "journal.db"), { artifactStore });
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
      executionRole: "primary" as const,
      inputArtifactRef: source.artifactRef,
      inputArtifactVersion: "1.0.0",
      inputDigest: source.digest,
      outputArtifactVersion: "1.0.0",
      input: { requirement: "build a local feature" },
    });
    ok(first.recovered === false, "first entry creates the Requirement run");
    ok(first.runId === id.runId, "created entry uses the supplied run identity");
    ok(first.execution.success === true, "qualified capability output succeeds");
    ok(first.recoveryContext.nextCapability === "solution-design", "recovery advances to the next capability");
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
    // F2-1: the second entry may only start after intake's revision landed.
    materializeProducerRevision(
      runStore, id.requirementId, id.runId,
      runStore.listCapabilityExecutions(id.runId).find(
        (event) => event.executionEventId === first.producerTerminalEventId,
      )!,
      () => TS,
    );

    const unrelated = artifactStore.put("capability_output", "unrelated but valid artifact");
    await rejectsCode("INVALID_INPUT", () => entry.execute({
      requirementId: id.requirementId,
      capability: "solution-design",
      executionRole: "primary" as const,
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
      "binding-codex-solution-design-primary",
      "binding-kimi-solution-design-primary",
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
      capability: "solution-design",
      executionRole: "primary" as const,
      inputArtifactRef: currentOutput.effectiveOutputArtifactRef!,
      inputArtifactVersion: currentOutput.effectiveOutputArtifactVersion!,
      inputDigest: currentOutput.effectiveOutputDigest!,
      outputArtifactVersion: "1.0.0",
      input: { requirementSummaryRef: currentOutput.effectiveOutputArtifactRef },
    });
    ok(second.recovered === true, "second entry recovers the existing Requirement");
    ok(second.runId === first.runId, "second entry resumes the same run");
    ok(second.execution.success === false, "unqualified shadow result is not reported as success");
    ok(second.recoveryContext.nextCapability === "solution-design", "retryable failure remains recoverable at the same capability");
    const allEvents = runStore.listCapabilityExecutions(id.runId);
    ok(allEvents.length === 4, "replacement attempt adds started and failed events");
    ok(allEvents[0]?.bindingId === "binding-codex-requirement-intake-primary", "historical binding snapshot remains unchanged");
    ok(allEvents[2]?.bindingId === "binding-kimi-solution-design-primary", "new attempt records replacement binding");
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
