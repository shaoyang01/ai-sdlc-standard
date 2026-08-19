// LOOP Run State Machine — Tests (LOOP-MVP-01A)
// ==============================================
// Pure state model tests. No DB, no Git, no network, no Agent.

import {
  LoopRunJournalError,
  type LoopRunEvent,
  type LoopRunIdentity,
  type LoopRunState,
  type LoopStageName,
} from "../core/loop-executor-types";
import {
  applyLoopRunEvent,
  canonicalizeLoopRunEvent,
  canonicalizeLoopRunIdentity,
  createInitialLoopRunState,
  createLoopRunCreatedEvent,
  validateLoopRunEvent,
  validateLoopRunIdentity,
} from "../core/loop-run-state";

let passed = 0;
let failed = 0;
function assert(condition: boolean, message: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

const TS = "2026-07-26T00:00:00.000Z";
let tsCounter = 0;
function nextTs(): string {
  tsCounter += 1;
  return new Date(Date.parse(TS) + tsCounter * 1000).toISOString();
}

function makeIdentity(o?: Partial<LoopRunIdentity>): LoopRunIdentity {
  return Object.freeze({
    runId: "run-001",
    requirementId: "req-001",
    repository: "shaoyang01/target-repo",
    repositoryPath: "/tmp/loop-test/target-repo",
    baseBranch: "main",
    expectedBaseSha: "a".repeat(40),
    taskBranch: "codex/loop-test-run-001",
    controlRoot: "/tmp/loop-test/control",
    createdAt: TS,
    ...o,
  });
}

function makeEvent(o: Partial<LoopRunEvent> & Pick<LoopRunEvent, "sequence" | "kind">): LoopRunEvent {
  const stageLevel = o.kind.startsWith("stage_");
  return Object.freeze({
    eventId: o.eventId ?? `run-001:${o.sequence}:${o.kind}${o.stage ? `:${o.stage}` : ""}`,
    runId: o.runId ?? "run-001",
    sequence: o.sequence,
    kind: o.kind,
    stage: o.stage ?? null,
    attempt: o.attempt ?? (stageLevel ? 1 : 0),
    createdAt: o.createdAt ?? nextTs(),
    inputDigest: o.inputDigest ?? null,
    outputArtifactRef: o.outputArtifactRef ?? null,
    outputDigest: o.outputDigest ?? null,
    errorCode: o.errorCode ?? null,
    retryable: o.retryable ?? null,
    reasonCode: o.reasonCode ?? null,
    bindingId: o.bindingId ?? null,
    bindingVersion: o.bindingVersion ?? null,
    inputArtifactRef: o.inputArtifactRef ?? null,
  });
}

function expectThrow(code: string, fn: () => unknown, message: string): void {
  try {
    fn();
    assert(false, `${message} (no error thrown)`);
  } catch (error) {
    const actual = error instanceof LoopRunJournalError ? error.code : "NOT_JOURNAL_ERROR";
    assert(actual === code, `${message} (got ${actual})`);
  }
}

function run(state: LoopRunState, events: Array<Partial<LoopRunEvent> & Pick<LoopRunEvent, "sequence" | "kind">>): LoopRunState {
  let current = state;
  for (const partial of events) {
    current = applyLoopRunEvent(current, makeEvent(partial));
  }
  return current;
}

function startedState(): LoopRunState {
  return run(createInitialLoopRunState(makeIdentity()), [{ sequence: 2, kind: "run_started" }]);
}

function stageStarted(stage: LoopStageName): LoopRunState {
  let state = startedState();
  const order: LoopStageName[] = ["prepare_workspace", "generate_patch", "validate_patch", "apply_patch", "run_tests"];
  let sequence = 3;
  for (const name of order) {
    state = run(state, [
      { sequence, kind: "stage_started", stage: name, attempt: 1 },
      { sequence: sequence + 1, kind: "stage_succeeded", stage: name, attempt: 1 },
    ]);
    sequence += 2;
    if (name === stage) break;
  }
  return state;
}

function test(): void {
  console.log("LOOP Run State Tests (01A)\n");

  // ── identity validation ──
  console.log("identity validation");
  assert(validateLoopRunIdentity(makeIdentity()) === undefined, "valid identity passes");
  expectThrow("INVALID_INPUT", () => validateLoopRunIdentity(null), "null identity rejected");
  expectThrow("INVALID_INPUT", () => validateLoopRunIdentity([]), "array identity rejected");
  expectThrow("INVALID_INPUT", () => validateLoopRunIdentity(makeIdentity({ runId: "  " })), "blank runId rejected");
  expectThrow("INVALID_INPUT", () => validateLoopRunIdentity(makeIdentity({ runId: " x" })), "untrimmed runId rejected");
  expectThrow("INVALID_INPUT", () => validateLoopRunIdentity(makeIdentity({ runId: "a\tb" })), "control char in runId rejected");
  expectThrow("INVALID_INPUT", () => validateLoopRunIdentity(makeIdentity({ expectedBaseSha: "A".repeat(40) })), "uppercase SHA rejected");
  expectThrow("INVALID_INPUT", () => validateLoopRunIdentity(makeIdentity({ expectedBaseSha: "a".repeat(39) })), "short SHA rejected");
  expectThrow("INVALID_INPUT", () => validateLoopRunIdentity(makeIdentity({ repositoryPath: "relative/path" })), "relative repositoryPath rejected");
  expectThrow("INVALID_INPUT", () => validateLoopRunIdentity(makeIdentity({ controlRoot: "relative" })), "relative controlRoot rejected");
  expectThrow("INVALID_INPUT", () => validateLoopRunIdentity(makeIdentity({ repositoryPath: "/tmp/loop-test/control" })), "repositoryPath == controlRoot rejected");
  expectThrow("INVALID_INPUT", () => validateLoopRunIdentity(makeIdentity({ createdAt: "not-a-date" })), "invalid createdAt rejected");
  expectThrow("INVALID_INPUT", () => validateLoopRunIdentity(makeIdentity({ createdAt: "2026-13-99T99:99:99Z" })), "impossible createdAt rejected");
  {
    const identity = makeIdentity();
    const extra = { ...identity, extraField: 1 };
    expectThrow("INVALID_INPUT", () => validateLoopRunIdentity(extra), "unknown identity field rejected");
    const missing = { ...identity } as Record<string, unknown>;
    delete missing.taskBranch;
    expectThrow("INVALID_INPUT", () => validateLoopRunIdentity(missing), "missing identity field rejected");
    const withGetter = {};
    Object.defineProperty(withGetter, "runId", { get: () => "x", enumerable: true });
    expectThrow("INVALID_INPUT", () => validateLoopRunIdentity(withGetter), "accessor identity rejected");
    const withSymbol = { ...identity, [Symbol("s")]: 1 };
    expectThrow("INVALID_INPUT", () => validateLoopRunIdentity(withSymbol), "symbol key identity rejected");
    const proxied = new Proxy(makeIdentity(), { getPrototypeOf: () => { throw new Error("trap"); } });
    expectThrow("INVALID_INPUT", () => validateLoopRunIdentity(proxied), "throwing proxy identity rejected");
    class IdentityClass {
      runId = "run-001";
    }
    expectThrow("INVALID_INPUT", () => validateLoopRunIdentity(new IdentityClass()), "class instance identity rejected");
  }

  // ── event validation ──
  console.log("event validation");
  assert(validateLoopRunEvent(makeEvent({ sequence: 2, kind: "run_started" })) === undefined, "valid event passes");
  expectThrow("INVALID_INPUT", () => validateLoopRunEvent(makeEvent({ sequence: 0, kind: "run_started" })), "sequence 0 rejected");
  expectThrow("INVALID_INPUT", () => validateLoopRunEvent(makeEvent({ sequence: 1.5, kind: "run_started" })), "non-integer sequence rejected");
  expectThrow("INVALID_INPUT", () => validateLoopRunEvent(makeEvent({ sequence: 2, kind: "bogus" as never })), "unknown kind rejected");
  expectThrow("INVALID_INPUT", () => validateLoopRunEvent(makeEvent({ sequence: 2, kind: "run_started", stage: "prepare_workspace" })), "run-level stage rejected");
  expectThrow("INVALID_INPUT", () => validateLoopRunEvent(makeEvent({ sequence: 2, kind: "run_started", attempt: 1 })), "run-level attempt rejected");
  expectThrow("INVALID_INPUT", () => validateLoopRunEvent(makeEvent({ sequence: 3, kind: "stage_started", stage: null, attempt: 1 })), "stage-level null stage rejected");
  expectThrow("INVALID_INPUT", () => validateLoopRunEvent(makeEvent({ sequence: 3, kind: "stage_started", stage: "prepare_workspace", attempt: 0 })), "stage-level attempt 0 rejected");
  expectThrow("INVALID_INPUT", () => validateLoopRunEvent(makeEvent({ sequence: 3, kind: "stage_started", stage: "bogus" as never, attempt: 1 })), "unknown stage rejected");
  expectThrow("INVALID_INPUT", () => validateLoopRunEvent(makeEvent({ sequence: 3, kind: "stage_started", stage: "prepare_workspace", attempt: 1, inputDigest: "zz" })), "invalid inputDigest rejected");
  assert(validateLoopRunEvent(makeEvent({ sequence: 3, kind: "stage_started", stage: "prepare_workspace", attempt: 1, inputDigest: "b".repeat(64) })) === undefined, "valid 64-hex inputDigest passes");
  expectThrow("INVALID_INPUT", () => validateLoopRunEvent(makeEvent({ sequence: 3, kind: "stage_started", stage: "prepare_workspace", attempt: 1, outputDigest: "b".repeat(63) })), "short outputDigest rejected");
  expectThrow("INVALID_INPUT", () => validateLoopRunEvent(makeEvent({ sequence: 3, kind: "stage_started", stage: "prepare_workspace", attempt: 1, retryable: "yes" as never })), "non-boolean retryable rejected");
  expectThrow("INVALID_INPUT", () => validateLoopRunEvent(makeEvent({ sequence: 2, kind: "run_started", eventId: " " })), "blank eventId rejected");
  expectThrow("INVALID_INPUT", () => validateLoopRunEvent(makeEvent({ sequence: 2, kind: "run_started", createdAt: "yesterday" })), "invalid event createdAt rejected");
  {
    const event = makeEvent({ sequence: 2, kind: "run_started" });
    const extra = { ...event, payload: {} };
    expectThrow("INVALID_INPUT", () => validateLoopRunEvent(extra), "event with payload field rejected");
    const rawPrompt = { ...event, rawPrompt: "secret" };
    expectThrow("INVALID_INPUT", () => validateLoopRunEvent(rawPrompt), "event with rawPrompt field rejected");
    const withGetter = {};
    Object.defineProperty(withGetter, "eventId", { get: () => "x", enumerable: true });
    expectThrow("INVALID_INPUT", () => validateLoopRunEvent(withGetter), "accessor event rejected");
    const withSymbol = { ...event, [Symbol("k")]: 1 };
    expectThrow("INVALID_INPUT", () => validateLoopRunEvent(withSymbol), "symbol key event rejected");
    const proxied = new Proxy(event, { ownKeys: () => { throw new Error("trap"); } });
    expectThrow("INVALID_INPUT", () => validateLoopRunEvent(proxied), "throwing proxy event rejected");
    expectThrow("INVALID_INPUT", () => validateLoopRunEvent([event]), "array event rejected");
  }

  // ── canonicalization ──
  console.log("canonicalization");
  {
    const identity = makeIdentity();
    const shuffled = Object.freeze({
      createdAt: identity.createdAt,
      controlRoot: identity.controlRoot,
      taskBranch: identity.taskBranch,
      expectedBaseSha: identity.expectedBaseSha,
      baseBranch: identity.baseBranch,
      repositoryPath: identity.repositoryPath,
      repository: identity.repository,
      requirementId: identity.requirementId,
      runId: identity.runId,
    });
    assert(
      canonicalizeLoopRunIdentity(identity) === canonicalizeLoopRunIdentity(shuffled),
      "identity canonicalization is insertion-order independent",
    );
    assert(
      canonicalizeLoopRunIdentity(identity) === canonicalizeLoopRunIdentity(makeIdentity()),
      "identity canonicalization is deterministic across calls",
    );
    const event = makeEvent({ sequence: 3, kind: "stage_started", stage: "prepare_workspace", attempt: 1 });
    const eventShuffled = Object.freeze({
      reasonCode: event.reasonCode,
      inputArtifactRef: event.inputArtifactRef,
      bindingVersion: event.bindingVersion,
      bindingId: event.bindingId,
      retryable: event.retryable,
      errorCode: event.errorCode,
      outputDigest: event.outputDigest,
      outputArtifactRef: event.outputArtifactRef,
      inputDigest: event.inputDigest,
      createdAt: event.createdAt,
      attempt: event.attempt,
      stage: event.stage,
      kind: event.kind,
      sequence: event.sequence,
      runId: event.runId,
      eventId: event.eventId,
    });
    assert(
      canonicalizeLoopRunEvent(event) === canonicalizeLoopRunEvent(eventShuffled),
      "event canonicalization is insertion-order independent",
    );
    expectThrow("INVALID_INPUT", () => canonicalizeLoopRunIdentity(makeIdentity({ runId: " x" })), "canonicalize rejects invalid identity");
  }

  // ── initial state and run_created ──
  console.log("initial state");
  {
    const identity = makeIdentity();
    const created = createLoopRunCreatedEvent(identity);
    assert(created.eventId === "run-001:1:run_created", "run_created eventId deterministic");
    assert(created.sequence === 1 && created.kind === "run_created", "run_created shape");
    assert(created.stage === null && created.attempt === 0, "run_created stage/attempt null-zero");
    assert(
      created.inputDigest === null && created.outputArtifactRef === null && created.outputDigest === null &&
        created.errorCode === null && created.retryable === null && created.reasonCode === null,
      "run_created nullable fields all null",
    );
    const state = createInitialLoopRunState(identity);
    assert(state.status === "created", "initial status created");
    assert(state.currentStage === null && state.currentAttempt === 0, "initial no active stage");
    assert(state.fixRound === 0, "initial fixRound 0");
    assert(state.lastSequence === 1 && state.lastEventId === "run-001:1:run_created", "initial last event");
    assert(state.blockingReasonCode === null && state.failureReasonCode === null, "initial reason codes null");
    assert(state.updatedAt === identity.createdAt, "initial updatedAt");
    const stageNames = Object.keys(state.stages);
    assert(stageNames.length === 8, "eight canonical stages");
    assert(
      stageNames.every((name) => state.stages[name as LoopStageName].status === "pending" && state.stages[name as LoopStageName].attempt === 0),
      "all stages pending attempt 0",
    );
    expectThrow("ILLEGAL_TRANSITION", () => applyLoopRunEvent(state, createLoopRunCreatedEvent(identity)), "second run_created rejected");
  }

  // ── run lifecycle ──
  console.log("run lifecycle");
  {
    const state = run(createInitialLoopRunState(makeIdentity()), [{ sequence: 2, kind: "run_started" }]);
    assert(state.status === "running", "created -> running");
    expectThrow("ILLEGAL_TRANSITION", () => applyLoopRunEvent(state, makeEvent({ sequence: 3, kind: "run_started" })), "run_started twice rejected");
    expectThrow("EVENT_SEQUENCE_CONFLICT", () => applyLoopRunEvent(state, makeEvent({ sequence: 4, kind: "run_paused" })), "skipped sequence rejected");
    expectThrow("EVENT_SEQUENCE_CONFLICT", () => applyLoopRunEvent(state, makeEvent({ sequence: 2, kind: "run_paused" })), "duplicate sequence rejected");
    expectThrow("EVENT_ID_CONFLICT", () =>
      applyLoopRunEvent(state, makeEvent({ sequence: 3, kind: "run_paused", eventId: state.lastEventId })),
      "duplicate lastEventId rejected",
    );
    expectThrow("ILLEGAL_TRANSITION", () =>
      applyLoopRunEvent(state, makeEvent({ sequence: 3, kind: "run_paused", runId: "run-other" })),
      "wrong runId rejected with ILLEGAL_TRANSITION",
    );
  }
  {
    // pause/resume
    let state = startedState();
    state = run(state, [{ sequence: 3, kind: "run_paused" }]);
    assert(state.status === "paused", "running -> paused");
    expectThrow("ILLEGAL_TRANSITION", () => applyLoopRunEvent(state, makeEvent({ sequence: 4, kind: "run_started" })), "run_started from paused rejected");
    state = run(state, [{ sequence: 4, kind: "run_resumed" }]);
    assert(state.status === "running", "paused -> running via run_resumed");
    expectThrow("ILLEGAL_TRANSITION", () => applyLoopRunEvent(state, makeEvent({ sequence: 5, kind: "run_resumed" })), "run_resumed from running rejected");
  }
  {
    // blocked
    let state = startedState();
    state = run(state, [{ sequence: 3, kind: "run_blocked", reasonCode: "NEEDS_USER" }]);
    assert(state.status === "blocked" && state.blockingReasonCode === "NEEDS_USER", "running -> blocked with reason");
    expectThrow("ILLEGAL_TRANSITION", () => applyLoopRunEvent(state, makeEvent({ sequence: 4, kind: "run_resumed" })), "blocked cannot resume");
    expectThrow("ILLEGAL_TRANSITION", () => applyLoopRunEvent(state, makeEvent({ sequence: 4, kind: "run_started" })), "blocked cannot run_started");
    expectThrow("ILLEGAL_TRANSITION", () =>
      applyLoopRunEvent(state, makeEvent({ sequence: 4, kind: "stage_started", stage: "prepare_workspace", attempt: 1 })),
      "blocked cannot start stage",
    );
    expectThrow("ILLEGAL_TRANSITION", () => applyLoopRunEvent(state, makeEvent({ sequence: 4, kind: "run_completed" })), "blocked cannot complete");
    state = run(state, [{ sequence: 4, kind: "run_cancelled" }]);
    assert(state.status === "cancelled", "blocked -> cancelled allowed");
  }
  {
    expectThrow("ILLEGAL_TRANSITION", () =>
      run(startedState(), [{ sequence: 3, kind: "run_blocked" }]),
      "run_blocked without reasonCode rejected",
    );
  }
  {
    // failed
    let state = startedState();
    state = run(state, [{ sequence: 3, kind: "run_failed", errorCode: "EXEC_ERROR", reasonCode: "FALLBACK" }]);
    assert(state.status === "failed" && state.failureReasonCode === "EXEC_ERROR", "run_failed prefers errorCode");
    let state2 = startedState();
    state2 = run(state2, [{ sequence: 3, kind: "run_failed", reasonCode: "FALLBACK" }]);
    assert(state2.failureReasonCode === "FALLBACK", "run_failed falls back to reasonCode");
    expectThrow("ILLEGAL_TRANSITION", () => run(startedState(), [{ sequence: 3, kind: "run_failed" }]), "run_failed without codes rejected");
  }
  {
    // pause with active stage rejected
    const state = run(startedState(), [{ sequence: 3, kind: "stage_started", stage: "prepare_workspace", attempt: 1 }]);
    expectThrow("ILLEGAL_TRANSITION", () => applyLoopRunEvent(state, makeEvent({ sequence: 4, kind: "run_paused" })), "run_paused with active stage rejected");
    expectThrow("ILLEGAL_TRANSITION", () => applyLoopRunEvent(state, makeEvent({ sequence: 4, kind: "run_blocked", reasonCode: "X" })), "run_blocked with active stage rejected");
    expectThrow("ILLEGAL_TRANSITION", () => applyLoopRunEvent(state, makeEvent({ sequence: 4, kind: "run_failed", errorCode: "E" })), "run_failed with active stage rejected");
    expectThrow("ILLEGAL_TRANSITION", () => applyLoopRunEvent(state, makeEvent({ sequence: 4, kind: "run_cancelled" })), "run_cancelled with active stage rejected");
  }

  // ── full stage chain to completed ──
  console.log("full chain");
  {
    let state = startedState();
    const chain: LoopStageName[] = ["prepare_workspace", "generate_patch", "validate_patch", "apply_patch", "run_tests", "finalize"];
    let sequence = 3;
    for (const stage of chain) {
      state = run(state, [
        { sequence, kind: "stage_started", stage, attempt: 1 },
        { sequence: sequence + 1, kind: "stage_succeeded", stage, attempt: 1, outputDigest: "c".repeat(64), outputArtifactRef: "artifact://x" },
      ]);
      sequence += 2;
    }
    assert(state.stages.finalize.status === "succeeded", "finalize succeeded");
    state = run(state, [{ sequence, kind: "run_completed" }]);
    assert(state.status === "completed", "run completed after finalize");
    expectThrow("TERMINAL_RUN", () => applyLoopRunEvent(state, makeEvent({ sequence: sequence + 1, kind: "run_paused" })), "completed terminal rejects events");
  }

  // ── stage transition guards ──
  console.log("stage guards");
  {
    const state = startedState();
    expectThrow("ILLEGAL_TRANSITION", () =>
      applyLoopRunEvent(state, makeEvent({ sequence: 3, kind: "stage_succeeded", stage: "prepare_workspace", attempt: 1 })),
      "stage_succeeded before stage_started rejected",
    );
    expectThrow("ILLEGAL_TRANSITION", () =>
      applyLoopRunEvent(state, makeEvent({ sequence: 3, kind: "stage_failed", stage: "prepare_workspace", attempt: 1, errorCode: "E" })),
      "stage_failed before stage_started rejected",
    );
    expectThrow("ILLEGAL_TRANSITION", () =>
      applyLoopRunEvent(state, makeEvent({ sequence: 3, kind: "stage_started", stage: "generate_patch", attempt: 1 })),
      "prerequisite missing rejected",
    );
  }
  {
    let state = run(startedState(), [{ sequence: 3, kind: "stage_started", stage: "prepare_workspace", attempt: 1 }]);
    expectThrow("ILLEGAL_TRANSITION", () =>
      applyLoopRunEvent(state, makeEvent({ sequence: 4, kind: "stage_started", stage: "generate_patch", attempt: 1 })),
      "two stages running simultaneously rejected",
    );
    expectThrow("ILLEGAL_TRANSITION", () =>
      applyLoopRunEvent(state, makeEvent({ sequence: 4, kind: "stage_succeeded", stage: "generate_patch", attempt: 1 })),
      "mismatched stage rejected",
    );
    expectThrow("ILLEGAL_TRANSITION", () =>
      applyLoopRunEvent(state, makeEvent({ sequence: 4, kind: "stage_succeeded", stage: "prepare_workspace", attempt: 2 })),
      "mismatched attempt rejected",
    );
    state = run(state, [{ sequence: 4, kind: "stage_failed", stage: "prepare_workspace", attempt: 1, errorCode: "E" }]);
    assert(state.stages.prepare_workspace.status === "failed", "stage -> failed");
    assert(state.status === "running", "run stays running after stage_failed");
    state = run(state, [{ sequence: 5, kind: "stage_started", stage: "prepare_workspace", attempt: 2 }]);
    assert(state.stages.prepare_workspace.status === "running" && state.currentAttempt === 2, "failed stage retried with attempt+1");
    expectThrow("ILLEGAL_TRANSITION", () =>
      applyLoopRunEvent(state, makeEvent({ sequence: 6, kind: "stage_started", stage: "prepare_workspace", attempt: 4 })),
      "non-contiguous attempt rejected",
    );
    expectThrow("ILLEGAL_TRANSITION", () =>
      applyLoopRunEvent(state, makeEvent({ sequence: 6, kind: "stage_failed", stage: "prepare_workspace", attempt: 2 })),
      "stage_failed without codes rejected",
    );
  }
  {
    // completion before finalize succeeded
    const state = stageStarted("run_tests");
    expectThrow("ILLEGAL_TRANSITION", () => applyLoopRunEvent(state, makeEvent({ sequence: 13, kind: "run_completed" })), "completion before finalize succeeded rejected");
    // finalize prerequisite enforcement
    expectThrow("ILLEGAL_TRANSITION", () =>
      applyLoopRunEvent(stageStarted("apply_patch"), makeEvent({ sequence: 11, kind: "stage_started", stage: "finalize", attempt: 1 })),
      "finalize prerequisite enforcement",
    );
  }

  // ── fix rounds ──
  console.log("fix rounds");
  {
    let state = stageStarted("run_tests");
    let sequence = 13;
    state = run(state, [
      { sequence, kind: "stage_started", stage: "review", attempt: 1 },
      { sequence: sequence + 1, kind: "stage_failed", stage: "review", attempt: 1, errorCode: "REVIEW_ISSUE" },
    ]);
    sequence += 2;
    state = run(state, [
      { sequence, kind: "stage_started", stage: "fix", attempt: 1 },
      { sequence: sequence + 1, kind: "stage_succeeded", stage: "fix", attempt: 1 },
    ]);
    sequence += 2;
    assert(state.fixRound === 1, "fixRound 0 -> 1");
    state = run(state, [
      { sequence, kind: "stage_started", stage: "review", attempt: 2 },
      { sequence: sequence + 1, kind: "stage_failed", stage: "review", attempt: 2, errorCode: "REVIEW_ISSUE" },
    ]);
    sequence += 2;
    state = run(state, [
      { sequence, kind: "stage_started", stage: "fix", attempt: 2 },
      { sequence: sequence + 1, kind: "stage_succeeded", stage: "fix", attempt: 2 },
    ]);
    sequence += 2;
    assert(state.fixRound === 2, "fixRound 1 -> 2");
    expectThrow("ILLEGAL_TRANSITION", () =>
      applyLoopRunEvent(state, makeEvent({ sequence, kind: "stage_started", stage: "fix", attempt: 3 })),
      "third fix rejected (fixRound cap)",
    );
    // fix without failed review
    expectThrow("ILLEGAL_TRANSITION", () =>
      applyLoopRunEvent(stageStarted("run_tests"), makeEvent({ sequence: 13, kind: "stage_started", stage: "fix", attempt: 1 })),
      "fix requires review failed",
    );
  }

  // ── terminal protection ──
  console.log("terminal protection");
  {
    const failed = run(startedState(), [{ sequence: 3, kind: "run_failed", errorCode: "E" }]);
    expectThrow("TERMINAL_RUN", () => applyLoopRunEvent(failed, makeEvent({ sequence: 4, kind: "run_resumed" })), "failed terminal rejects events");
    const cancelled = run(startedState(), [{ sequence: 3, kind: "run_cancelled" }]);
    expectThrow("TERMINAL_RUN", () =>
      applyLoopRunEvent(cancelled, makeEvent({ sequence: 4, kind: "stage_started", stage: "prepare_workspace", attempt: 1 })),
      "cancelled terminal rejects events",
    );
  }

  // ── safe bounded error messages ──
  console.log("safe bounded error messages");
  {
    const secretKey = `UNIQUE_SECRET_SENTINEL_${"k".repeat(400)}`;
    const identityWithSecret = { ...makeIdentity(), [secretKey]: 1 };
    try {
      validateLoopRunIdentity(identityWithSecret);
      assert(false, "secret unknown identity key rejected (no error)");
    } catch (error) {
      const journalError = error as LoopRunJournalError;
      assert(journalError.code === "INVALID_INPUT", "unknown identity key classified INVALID_INPUT");
      assert(!journalError.message.includes("UNIQUE_SECRET_SENTINEL"), "identity error message does not echo unknown key sentinel");
      assert(journalError.message.length <= 256, "identity error message within bound");
      assert(!/[\x00-\x1f\x7f]/.test(journalError.message), "identity error message has no control characters");
    }
    const promptKey = `RAW_PROMPT_SENTINEL_${"p".repeat(400)}`;
    const eventWithSecret = { ...makeEvent({ sequence: 2, kind: "run_started" }), [promptKey]: "x" };
    try {
      validateLoopRunEvent(eventWithSecret);
      assert(false, "secret unknown event key rejected (no error)");
    } catch (error) {
      const journalError = error as LoopRunJournalError;
      assert(journalError.code === "INVALID_INPUT", "unknown event key classified INVALID_INPUT");
      assert(!journalError.message.includes("RAW_PROMPT_SENTINEL"), "event error message does not echo unknown key sentinel");
      assert(journalError.message.length <= 256, "event error message within bound");
      assert(!/[\x00-\x1f\x7f]/.test(journalError.message), "event error message has no control characters");
    }
    // constructor last-line defense: control characters stripped, length bounded
    const rawMessage = `prefix${"x".repeat(500)}\u0007SECRET`;
    const sanitized = new LoopRunJournalError("INVALID_INPUT", rawMessage);
    assert(sanitized.message.length <= 256, "LoopRunJournalError truncates to fixed max length");
    assert(!/[\x00-\x1f\x7f]/.test(sanitized.message), "LoopRunJournalError strips control characters");
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

test();
