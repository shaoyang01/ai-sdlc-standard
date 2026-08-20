// LOOP Requirement Change Classification Tests (C02 WP-1)
// ========================================================
// Canonical change kinds, payload forms, blocked persistence, idempotent
// replay, CAS/conflict semantics, cross-entry reads, adversarial input
// boundaries and v2→v3 migration. All databases live in disposable temp
// directories outside the repository. No Git, no network, no Agent.

import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  LOOP_CHANGE_BLOCKED_REASON_CODES,
  LOOP_CHANGE_KINDS,
  LOOP_CHANGE_PAYLOAD_FORMS,
  LOOP_CHANGE_RECORD_SCHEMA_VERSION,
  LOOP_CHANGE_SOURCE_TYPES,
  canonicalizeLoopRequirementChangeRecord,
  createLoopRequirementChangeRecord,
  validateLoopRequirementChangeRecord,
  type LoopRequirementChangeDraft,
  type LoopRequirementChangeRecord,
} from "../core/loop-change-classification";
import {
  LoopRunJournalError,
  type LoopRunEvent,
  type LoopRunIdentity,
} from "../core/loop-executor-types";
import type { LoopCapabilityExecutionEvent } from "../core/loop-capability-execution";
import { recoverRunContext } from "../core/loop-recovery";
import { LoopRunStore } from "../core/loop-run-store";
import { runtimeExecutionPointForCapability } from "../core/runtime-capability-map";

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

const TS = "2026-08-20T00:00:00.000Z";
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
    repositoryPath: "/tmp/loop-change-cls-test/target-repo",
    baseBranch: "main",
    expectedBaseSha: "a".repeat(40),
    taskBranch: "codex/loop-change-cls-test-run-001",
    controlRoot: "/tmp/loop-change-cls-test/control",
    createdAt: TS,
    ...o,
  });
}

function makeEvent(o: Partial<LoopRunEvent> & Pick<LoopRunEvent, "sequence" | "kind">): LoopRunEvent {
  const stageLevel = o.kind.startsWith("stage_");
  return Object.freeze({
    eventId: o.eventId ?? `${o.runId ?? "run-001"}:${o.sequence}:${o.kind}${o.stage ? `:${o.stage}` : ""}`,
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

function capabilityStartedEvent(): LoopCapabilityExecutionEvent {
  return Object.freeze({
    schemaVersion: 1,
    executionEventId: "run-001:capability:1:started",
    runId: "run-001",
    sequence: 1,
    capability: "requirement-intake",
    nodeId: runtimeExecutionPointForCapability("requirement-intake"),
    attempt: 1,
    status: "started",
    createdAt: nextTs(),
    bindingId: "binding-codex-requirement-intake",
    bindingVersion: "1.0.0",
    bindingRegistryVersion: "1",
    executorAgent: "codex",
    executorAdapter: "codex-real-dispatch",
    executorVersion: "1.0.0",
    inputArtifactRef: `loop-artifact:v1:requirement_summary:sha256:${"b".repeat(64)}`,
    inputArtifactVersion: "1.0.0",
    inputDigest: "b".repeat(64),
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
  });
}

function sourceRef(priority: number, locator: string): LoopRequirementChangeDraft["sourceRefs"][number] {
  return Object.freeze({
    sourceType: "CONVERSATION",
    locator,
    priority,
    sourceVersion: null,
    observedAt: TS,
  });
}

function newRequirementDraft(o?: Record<string, unknown>): LoopRequirementChangeDraft {
  return {
    runId: "run-001",
    requirementId: "req-001",
    sequence: 1,
    status: "CLASSIFIED",
    changeKind: "NEW_REQUIREMENT",
    payloadForm: "FULL_REQUIREMENT",
    previousGeneration: null,
    currentChangeScope: "完整需求范围：订单规则初始化",
    confirmedFactsPreserved: [],
    sourceRefs: [sourceRef(1, "conversation:current")],
    triggerEvidence: ["source:conversation:current"],
    classificationReason: "该 Requirement 无既有运行记录，按新需求处理",
    blockedReasonCode: null,
    createdAt: nextTs(),
    ...o,
  } as LoopRequirementChangeDraft;
}

function deltaDraft(
  changeKind: LoopRequirementChangeRecord["changeKind"],
  o?: Record<string, unknown>,
): LoopRequirementChangeDraft {
  return {
    runId: "run-001",
    requirementId: "req-001",
    sequence: 2,
    status: "CLASSIFIED",
    changeKind,
    payloadForm: "DELTA_CHANGE",
    previousGeneration: 1,
    currentChangeScope: "本次仅补充异常分支口径",
    confirmedFactsPreserved: ["业务目标不变", "既有技术方案 1.0.0 保持有效"],
    sourceRefs: [sourceRef(1, "conversation:follow-up")],
    triggerEvidence: [`loop-artifact:v1:requirement_summary:sha256:${"c".repeat(64)}`],
    classificationReason: "业务目标不变，仅补充边界条件",
    blockedReasonCode: null,
    createdAt: nextTs(),
    ...o,
  } as LoopRequirementChangeDraft;
}

function blockedDraft(o?: Record<string, unknown>): LoopRequirementChangeDraft {
  return {
    runId: "run-001",
    requirementId: "req-001",
    sequence: 1,
    status: "BLOCKED",
    changeKind: null,
    payloadForm: null,
    previousGeneration: null,
    currentChangeScope: null,
    confirmedFactsPreserved: [],
    sourceRefs: [sourceRef(1, "lark:doc:unreadable"), sourceRef(2, "conversation:current")],
    triggerEvidence: ["source:conversation:current"],
    classificationReason: "两个来源对验收口径冲突，无法裁决",
    blockedReasonCode: "SOURCE_PRIORITY_CONFLICT",
    createdAt: nextTs(),
    ...o,
  } as LoopRequirementChangeDraft;
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

function withStore(fn: (store: LoopRunStore, dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "loop-change-cls-"));
  const store = new LoopRunStore(join(dir, "journal.db"));
  store.init();
  try {
    fn(store, dir);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("change classification: canonical tokens and schema constants");
{
  assert(LOOP_CHANGE_KINDS.length === 5, "exactly five canonical change kinds");
  assert(
    LOOP_CHANGE_KINDS.join(",") === "NEW_REQUIREMENT,SUPPLEMENT,CHANGE,REWORK,FEEDBACK_DRIVEN_CHANGE",
    "five canonical change kind tokens",
  );
  assert(
    LOOP_CHANGE_PAYLOAD_FORMS.join(",") === "FULL_REQUIREMENT,DELTA_CHANGE",
    "two canonical payload forms",
  );
  assert(LOOP_CHANGE_RECORD_SCHEMA_VERSION === 1, "change record schema version is 1");
  assert(LOOP_CHANGE_SOURCE_TYPES.length === 5, "five canonical source types");
  assert(LOOP_CHANGE_BLOCKED_REASON_CODES.length === 5, "five canonical blocked reason codes");
}

console.log("change classification: five kinds build valid records (positive)");
{
  const created = createLoopRequirementChangeRecord(newRequirementDraft());
  assert(created.changeRecordId === `run-001:change:1:classified`, "canonical record id derived");
  assert(Object.isFrozen(created) && Object.isFrozen(created.sourceRefs), "record is deep-frozen");
  validateLoopRequirementChangeRecord(created);
  assert(true, "NEW_REQUIREMENT record passes validation");
  for (const kind of ["SUPPLEMENT", "CHANGE", "REWORK", "FEEDBACK_DRIVEN_CHANGE"] as const) {
    const record = createLoopRequirementChangeRecord(deltaDraft(kind));
    validateLoopRequirementChangeRecord(record);
    assert(record.changeKind === kind && record.payloadForm === "DELTA_CHANGE", `${kind} record passes validation`);
  }
}

console.log("change classification: per-kind incoherent payloads fail closed (negative)");
{
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
    newRequirementDraft({ payloadForm: "DELTA_CHANGE" }),
  ), "NEW_REQUIREMENT with DELTA_CHANGE rejected");
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
    newRequirementDraft({ previousGeneration: 1 }),
  ), "NEW_REQUIREMENT with previous generation rejected");
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
    newRequirementDraft({ confirmedFactsPreserved: ["业务目标不变"] }),
  ), "NEW_REQUIREMENT claiming confirmed facts rejected");
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
    deltaDraft("SUPPLEMENT", { payloadForm: "FULL_REQUIREMENT" }),
  ), "SUPPLEMENT with FULL_REQUIREMENT rejected");
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
    deltaDraft("CHANGE", { previousGeneration: null }),
  ), "CHANGE without previous generation rejected");
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
    deltaDraft("REWORK", { payloadForm: "FULL_REQUIREMENT" }),
  ), "REWORK with FULL_REQUIREMENT rejected");
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
    deltaDraft("FEEDBACK_DRIVEN_CHANGE", { confirmedFactsPreserved: [] }),
  ), "FEEDBACK_DRIVEN_CHANGE without confirmed-fact boundary rejected");
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
    deltaDraft("SUPPLEMENT", { changeKind: "EDIT" }),
  ), "unknown change kind rejected");
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
    deltaDraft("SUPPLEMENT", { previousGeneration: 0 }),
  ), "non-positive previous generation rejected");
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
    deltaDraft("SUPPLEMENT", { triggerEvidence: ["random-text"] }),
  ), "non-canonical trigger evidence rejected");
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
    deltaDraft("SUPPLEMENT", { sourceRefs: [sourceRef(1, "a"), sourceRef(1, "b")] }),
  ), "duplicate source priorities rejected");
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
    deltaDraft("SUPPLEMENT", { sourceRefs: [] }),
  ), "missing source refs rejected");
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
    deltaDraft("SUPPLEMENT", { sourceRefs: [{ ...sourceRef(1, "a"), sourceType: "EMAIL" }] }),
  ), "unknown source type rejected");
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
    deltaDraft("SUPPLEMENT", { confirmedFactsPreserved: ["x", "x"] }),
  ), "duplicate confirmed facts rejected");
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
    deltaDraft("SUPPLEMENT", { currentChangeScope: "  padded " }),
  ), "untrimmed change scope rejected");
}

console.log("change classification: blocked persistence never guesses facts");
{
  const blocked = createLoopRequirementChangeRecord(blockedDraft());
  validateLoopRequirementChangeRecord(blocked);
  assert(blocked.status === "BLOCKED" && blocked.changeKind === null, "blocked record persists without a kind");
  assert(blocked.changeRecordId.endsWith(":blocked"), "blocked record id carries the blocked slug");
  const uncertain = createLoopRequirementChangeRecord(blockedDraft({
    blockedReasonCode: "CLASSIFICATION_UNCERTAIN",
    triggerEvidence: [],
  }));
  validateLoopRequirementChangeRecord(uncertain);
  assert(true, "uncertain classification persists as blocked with canonical reason");

  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
    blockedDraft({ changeKind: "SUPPLEMENT", payloadForm: "DELTA_CHANGE" }),
  ), "blocked record must not carry a classified kind");
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
    blockedDraft({ blockedReasonCode: null }),
  ), "blocked record requires a blocked reason code");
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
    blockedDraft({ blockedReasonCode: "UNKNOWN_REASON" }),
  ), "unknown blocked reason code rejected");
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
    blockedDraft({ currentChangeScope: "猜测的范围" }),
  ), "blocked record must not carry a guessed scope");
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
    blockedDraft({ confirmedFactsPreserved: ["猜测的事实"] }),
  ), "blocked record must not claim confirmed facts");
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
    newRequirementDraft({ status: "BLOCKED" }),
  ), "classified fields under blocked status rejected");
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
    deltaDraft("SUPPLEMENT", { blockedReasonCode: "CLASSIFICATION_UNCERTAIN" }),
  ), "classified record must not carry a blocked reason code");
}

console.log("change classification: adversarial input boundaries fail closed");
{
  const draft = newRequirementDraft();
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(new Proxy({ ...draft }, {})),
    "Proxy draft rejected");
  const accessorDraft = { ...draft };
  Object.defineProperty(accessorDraft, "sequence", { get: () => 1, enumerable: true });
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(accessorDraft),
    "accessor property rejected before invocation");
  const symbolDraft = { ...draft } as Record<string | symbol, unknown>;
  symbolDraft[Symbol("stealth")] = "x";
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(symbolDraft),
    "symbol-keyed field rejected");
  const protoDraft = Object.create(null);
  for (const [key, value] of Object.entries(draft)) protoDraft[key] = value;
  Object.defineProperty(protoDraft, "__proto__", { value: "x", enumerable: true });
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(protoDraft),
    "__proto__ own key rejected");
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord({ ...draft, extra: "x" }),
    "unknown extra field rejected");
  const missing = { ...draft } as Record<string, unknown>;
  delete missing["classificationReason"];
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(missing),
    "missing required field rejected");
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord({ ...draft, schemaVersion: 1 }),
    "draft must not pre-set schema-managed fields");

  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
    deltaDraft("SUPPLEMENT", { sourceRefs: new Proxy([sourceRef(1, "a")], {}) }),
  ), "Proxy source ref array rejected");
  const accessorArray = [sourceRef(1, "a")];
  Object.defineProperty(accessorArray, "0", { get: () => sourceRef(1, "a"), enumerable: true });
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
    deltaDraft("SUPPLEMENT", { sourceRefs: accessorArray }),
  ), "accessor array element rejected before invocation");
  const holeArray = new Array(1);
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
    deltaDraft("SUPPLEMENT", { triggerEvidence: holeArray }),
  ), "sparse array rejected");
  class NotPlain {}
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
    deltaDraft("SUPPLEMENT", { sourceRefs: [new NotPlain()] }),
  ), "class-instance source ref rejected");
  expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
    deltaDraft("SUPPLEMENT", { sourceRefs: [new Proxy(sourceRef(1, "a") as object, {})] }),
  ), "Proxy source ref element rejected");

  const sentinel = "SENTINEL-INPUT-2b7d41";
  try {
    createLoopRequirementChangeRecord(deltaDraft("SUPPLEMENT", { currentChangeScope: `${sentinel}\u0000` }));
    assert(false, "sentinel input not echoed (no error thrown)");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    assert(!message.includes(sentinel), "error message does not echo input sentinel");
  }
  const tamperedId = createLoopRequirementChangeRecord(newRequirementDraft());
  expectThrow("INVALID_INPUT", () => validateLoopRequirementChangeRecord(
    { ...tamperedId, changeRecordId: "run-001:change:1:blocked" },
  ), "forged record id rejected");
}

console.log("change classification: store append binds run, requirement and generation reference");
withStore((store) => {
  expectThrow("RUN_NOT_FOUND", () => store.appendRequirementChange(
    createLoopRequirementChangeRecord(newRequirementDraft()),
  ), "change record for a missing run rejected");
  store.createRun(makeIdentity());
  const first = store.appendRequirementChange(createLoopRequirementChangeRecord(newRequirementDraft()));
  assert(first.appended === true, "first classification appended");
  const second = store.appendRequirementChange(createLoopRequirementChangeRecord(deltaDraft("SUPPLEMENT")));
  assert(second.appended === true, "delta classification bound to previous generation appended");
  const chain = store.listRequirementChanges("run-001");
  assert(chain.length === 2, "change chain lists both records");
  assert(chain[0].requirementId === "req-001" && chain[1].requirementId === "req-001", "records bound to Requirement ID");
  assert(chain[1].previousGeneration === 1, "delta record bound to the previous generation reference");
  assert(
    chain[1].sourceRefs.length === 1 && chain[1].sourceRefs[0].locator === "conversation:follow-up",
    "delta record carries its source refs",
  );
  expectThrow("INVALID_INPUT", () => store.appendRequirementChange(
    createLoopRequirementChangeRecord(deltaDraft("CHANGE", { requirementId: "req-002", sequence: 3 })),
  ), "requirement identity mismatch rejected");
});

console.log("change classification: exact replay is idempotent, conflicts fail closed");
withStore((store) => {
  store.createRun(makeIdentity());
  const record = createLoopRequirementChangeRecord(newRequirementDraft());
  const first = store.appendRequirementChange(record);
  const replay = store.appendRequirementChange(record);
  assert(first.appended === true && replay.appended === false, "exact replay does not duplicate the record");
  assert(store.listRequirementChanges("run-001").length === 1, "replay leaves a single persisted record");

  const sameIdDifferent = createLoopRequirementChangeRecord(newRequirementDraft({
    classificationReason: "不同的分类原因",
  }));
  expectThrow("EVENT_ID_CONFLICT", () => store.appendRequirementChange(sameIdDifferent),
    "same record id with different content rejected");
  const sameSequence = createLoopRequirementChangeRecord(blockedDraft({ sequence: 1 }));
  expectThrow("EVENT_SEQUENCE_CONFLICT", () => store.appendRequirementChange(sameSequence),
    "occupied sequence with different id rejected");
});

console.log("change classification: chain rules are fail-closed");
withStore((store) => {
  store.createRun(makeIdentity());
  store.appendRequirementChange(createLoopRequirementChangeRecord(newRequirementDraft()));
  expectThrow("ILLEGAL_TRANSITION", () => store.appendRequirementChange(
    createLoopRequirementChangeRecord(deltaDraft("NEW_REQUIREMENT", {
      sequence: 2, payloadForm: "FULL_REQUIREMENT", previousGeneration: null, confirmedFactsPreserved: [],
    })),
  ), "a second NEW_REQUIREMENT classification is rejected");
  expectThrow("ILLEGAL_TRANSITION", () => store.appendRequirementChange(
    createLoopRequirementChangeRecord(deltaDraft("CHANGE", { sequence: 4 })),
  ), "non-contiguous sequence rejected");
  expectThrow("ILLEGAL_TRANSITION", () => store.appendRequirementChange(
    createLoopRequirementChangeRecord(deltaDraft("CHANGE", { sequence: 2, createdAt: TS })),
  ), "non-monotonic timestamp rejected");
});
withStore((store) => {
  store.createRun(makeIdentity());
  const blocked = store.appendRequirementChange(createLoopRequirementChangeRecord(blockedDraft()));
  assert(blocked.appended === true, "blocked record persists as the first chain entry");
  const resolved = store.appendRequirementChange(createLoopRequirementChangeRecord(
    newRequirementDraft({ sequence: 2, classificationReason: "来源补齐后确认为新需求" }),
  ));
  assert(resolved.appended === true, "a later record may carry the resolved classification");
  const chain = store.listRequirementChanges("run-001");
  assert(chain[0].status === "BLOCKED" && chain[1].changeKind === "NEW_REQUIREMENT",
    "blocked state remains auditable after resolution");
});

console.log("change classification: NEW_REQUIREMENT is unique across runs of one requirement");
withStore((store) => {
  store.createRun(makeIdentity());
  const original = createLoopRequirementChangeRecord(newRequirementDraft());
  assert(store.appendRequirementChange(original).appended === true, "first run classifies NEW_REQUIREMENT");
  store.createRun(makeIdentity({ runId: "run-002", createdAt: nextTs() }));
  // The requirement already has a classified change record in run-001, so a
  // second run must not declare NEW_REQUIREMENT again (contract §2/§5).
  expectThrow("ILLEGAL_TRANSITION", () => store.appendRequirementChange(
    createLoopRequirementChangeRecord(newRequirementDraft({
      runId: "run-002", classificationReason: "重复声明新需求",
    })),
  ), "cross-run duplicate NEW_REQUIREMENT is rejected");
  // A delta classification in the follow-up run remains legal.
  const supplement = store.appendRequirementChange(createLoopRequirementChangeRecord(
    deltaDraft("SUPPLEMENT", { runId: "run-002", sequence: 1 }),
  ));
  assert(supplement.appended === true, "follow-up run may classify a delta change");
  // The cross-run rule does not break exact-replay idempotency.
  const replay = store.appendRequirementChange(original);
  assert(replay.appended === false, "replaying the original NEW_REQUIREMENT stays idempotent");
});
withStore((store) => {
  // A prior run whose chain holds only BLOCKED records never classified the
  // requirement, so a later run may still declare NEW_REQUIREMENT.
  store.createRun(makeIdentity());
  store.appendRequirementChange(createLoopRequirementChangeRecord(blockedDraft()));
  store.createRun(makeIdentity({ runId: "run-002", createdAt: nextTs() }));
  const resolved = store.appendRequirementChange(createLoopRequirementChangeRecord(
    newRequirementDraft({ runId: "run-002", classificationReason: "前序 run 仅阻塞未分类，按新需求处理" }),
  ));
  assert(resolved.appended === true, "NEW_REQUIREMENT allowed when prior runs hold only blocked records");
});
withStore((store) => {
  store.createRun(makeIdentity());
  store.createRun(makeIdentity({ runId: "run-002", createdAt: nextTs() }));
  const first = store.appendRequirementChange(createLoopRequirementChangeRecord(
    newRequirementDraft({ runId: "run-002" }),
  ));
  assert(first.appended === true, "NEW_REQUIREMENT allowed while no run of the requirement has classified");
});
{
  // Cross-connection: the uniqueness rule holds for concurrent writers.
  const dir = mkdtempSync(join(tmpdir(), "loop-change-cls-"));
  const path = join(dir, "journal.db");
  const storeA = new LoopRunStore(path);
  const storeB = new LoopRunStore(path);
  storeA.init();
  storeB.init();
  try {
    storeA.createRun(makeIdentity());
    storeB.createRun(makeIdentity({ runId: "run-002", createdAt: nextTs() }));
    assert(storeA.appendRequirementChange(createLoopRequirementChangeRecord(newRequirementDraft())).appended === true,
      "first connection classifies NEW_REQUIREMENT");
    expectThrow("ILLEGAL_TRANSITION", () => storeB.appendRequirementChange(
      createLoopRequirementChangeRecord(newRequirementDraft({ runId: "run-002" })),
    ), "second connection cannot re-declare NEW_REQUIREMENT");
  } finally {
    storeA.close();
    storeB.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

{
  // The cross-run guard adjudicates on verified chains only: a historical
  // CLASSIFIED row tampered to BLOCKED (stale canonical hash) must surface
  // as corruption inside the guard, not silently pass a second NEW through.
  const dir = mkdtempSync(join(tmpdir(), "loop-change-cls-"));
  const path = join(dir, "journal.db");
  const store = new LoopRunStore(path);
  store.init();
  try {
    store.createRun(makeIdentity());
    store.appendRequirementChange(createLoopRequirementChangeRecord(newRequirementDraft()));
    store.createRun(makeIdentity({ runId: "run-002", createdAt: nextTs() }));
    const raw = new Database(path);
    raw.prepare(
      "UPDATE loop_requirement_changes SET status = 'BLOCKED', change_kind = NULL WHERE run_id = 'run-001'",
    ).run();
    raw.close();
    expectThrow("STORE_CORRUPT", () => store.appendRequirementChange(
      createLoopRequirementChangeRecord(newRequirementDraft({ runId: "run-002" })),
    ), "tampered historical chain surfaces as corruption inside the cross-run guard");
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

{
  // corruption-first, no short-circuit: even though run-001 already holds a
  // valid CLASSIFIED record (enough to reject the second NEW), the guard must
  // still verify every related chain — a corrupt later chain surfaces as
  // STORE_CORRUPT, not ILLEGAL_TRANSITION.
  const dir = mkdtempSync(join(tmpdir(), "loop-change-cls-"));
  const path = join(dir, "journal.db");
  const store = new LoopRunStore(path);
  store.init();
  try {
    store.createRun(makeIdentity());
    store.appendRequirementChange(createLoopRequirementChangeRecord(newRequirementDraft()));
    store.createRun(makeIdentity({ runId: "run-002", createdAt: nextTs() }));
    store.appendRequirementChange(createLoopRequirementChangeRecord(blockedDraft({ runId: "run-002" })));
    store.createRun(makeIdentity({ runId: "run-003", createdAt: nextTs() }));
    const raw = new Database(path);
    raw.prepare(
      "UPDATE loop_requirement_changes SET classification_reason = 'tampered reason' WHERE run_id = 'run-002'",
    ).run();
    raw.close();
    expectThrow("STORE_CORRUPT", () => store.appendRequirementChange(
      createLoopRequirementChangeRecord(newRequirementDraft({ runId: "run-003" })),
    ), "corrupt related chain surfaces before the uniqueness decision (no short-circuit)");
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

{
  // The guard, the recovery lookups and entry recovery must not trust the
  // persisted requirement_id column: tampering it breaks the run identity
  // hash, and every run enumeration now verifies each run's identity through
  // the verified snapshot path before filtering by the verified identity.
  const dir = mkdtempSync(join(tmpdir(), "loop-change-cls-"));
  const path = join(dir, "journal.db");
  const store = new LoopRunStore(path);
  store.init();
  try {
    store.createRun(makeIdentity());
    store.appendRequirementChange(createLoopRequirementChangeRecord(newRequirementDraft()));
    store.createRun(makeIdentity({ runId: "run-002", createdAt: nextTs() }));
    const raw = new Database(path);
    raw.prepare("UPDATE loop_runs SET requirement_id = 'req-hidden' WHERE run_id = 'run-001'").run();
    raw.close();
    expectThrow("STORE_CORRUPT", () => store.appendRequirementChange(
      createLoopRequirementChangeRecord(newRequirementDraft({ runId: "run-002" })),
    ), "guard verifies run identities, not the persisted requirement column (append)");
    expectThrow("STORE_CORRUPT", () => store.listRunsByRequirement("req-001"),
      "run enumeration verifies identities (listRunsByRequirement)");
    expectThrow("STORE_CORRUPT", () => store.findLatestRequirementChangeByRequirement("req-001"),
      "latest-classification query verifies identities");
    expectThrow("STORE_CORRUPT", () => recoverRunContext(store, "req-001"),
      "entry recovery verifies identities");
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

{
  // Transaction-gap regression: a second connection rewrites the run's
  // requirement_id AND rehashes the change record to match, so the tampered
  // detail row is self-consistent under the tampered identity. Snapshot
  // verification and record return happen in ONE transaction, so the read
  // must fail closed instead of returning the tampered record.
  const dir = mkdtempSync(join(tmpdir(), "loop-change-cls-"));
  const path = join(dir, "journal.db");
  const store = new LoopRunStore(path);
  store.init();
  try {
    store.createRun(makeIdentity());
    const record = createLoopRequirementChangeRecord(newRequirementDraft());
    store.appendRequirementChange(record);
    const tampered: LoopRequirementChangeRecord = Object.freeze({ ...record, requirementId: "req-tampered" });
    const raw = new Database(path);
    raw.prepare("UPDATE loop_runs SET requirement_id = 'req-tampered' WHERE run_id = 'run-001'").run();
    raw.prepare(
      "UPDATE loop_requirement_changes SET requirement_id = 'req-tampered', canonical_sha256 = ? WHERE change_record_id = ?",
    ).run(
      createHash("sha256").update(canonicalizeLoopRequirementChangeRecord(tampered)).digest("hex"),
      record.changeRecordId,
    );
    raw.close();
    expectThrow("STORE_CORRUPT", () => store.listRequirementChanges("run-001"),
      "listRequirementChanges verifies identity and records in one transaction");
    expectThrow("STORE_CORRUPT", () => store.findLatestRequirementChangeByRequirement("req-001"),
      "findLatest verifies identity and records in one transaction");
    expectThrow("STORE_CORRUPT", () => store.findLatestRequirementChangeByRequirement("req-tampered"),
      "findLatest under the tampered requirement id fails closed");
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("change classification: latest classification query skips blocked-only tails");
withStore((store) => {
  store.createRun(makeIdentity());
  store.appendRequirementChange(createLoopRequirementChangeRecord(newRequirementDraft()));
  const classified = store.appendRequirementChange(createLoopRequirementChangeRecord(deltaDraft("CHANGE"))).record;
  store.appendRequirementChange(createLoopRequirementChangeRecord(blockedDraft({ sequence: 3 })));
  const latest = store.findLatestRequirementChangeByRequirement("req-001");
  assert(latest !== undefined && latest.changeRecordId === classified.changeRecordId,
    "query returns the latest classified record, not a trailing blocked record");
});
withStore((store) => {
  store.createRun(makeIdentity());
  store.appendRequirementChange(createLoopRequirementChangeRecord(blockedDraft()));
  assert(store.findLatestRequirementChangeByRequirement("req-001") === undefined,
    "blocked-only requirement reads as unclassified");
});

console.log("change classification: run state guards");
withStore((store) => {
  store.createRun(makeIdentity());
  store.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
  store.appendEvent(makeEvent({ sequence: 3, kind: "stage_started", stage: "prepare_workspace", attempt: 1 }));
  expectThrow("ILLEGAL_TRANSITION", () => store.appendRequirementChange(
    createLoopRequirementChangeRecord(newRequirementDraft()),
  ), "change record rejected while a delivery stage is active");
});
withStore((store) => {
  store.createRun(makeIdentity());
  store.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
  store.appendCapabilityExecution(capabilityStartedEvent());
  expectThrow("ILLEGAL_TRANSITION", () => store.appendRequirementChange(
    createLoopRequirementChangeRecord(newRequirementDraft()),
  ), "change record rejected while a capability execution is active");
});
withStore((store) => {
  store.createRun(makeIdentity());
  store.appendEvent(makeEvent({ sequence: 2, kind: "run_failed", errorCode: "X" }));
  expectThrow("ILLEGAL_TRANSITION", () => store.appendRequirementChange(
    createLoopRequirementChangeRecord(newRequirementDraft()),
  ), "terminal run must not accept change records");
});

console.log("change classification: concurrent writers use CAS/conflict semantics");
{
  const dir = mkdtempSync(join(tmpdir(), "loop-change-cls-"));
  const path = join(dir, "journal.db");
  const storeA = new LoopRunStore(path);
  const storeB = new LoopRunStore(path);
  storeA.init();
  storeB.init();
  try {
    storeA.createRun(makeIdentity());
    const winner = createLoopRequirementChangeRecord(newRequirementDraft());
    assert(storeA.appendRequirementChange(winner).appended === true, "first writer wins the sequence");
    const loser = createLoopRequirementChangeRecord(blockedDraft({ sequence: 1 }));
    expectThrow("EVENT_SEQUENCE_CONFLICT", () => storeB.appendRequirementChange(loser),
      "concurrent different input on the same sequence conflicts");
    assert(storeB.appendRequirementChange(winner).appended === false,
      "concurrent identical input replays idempotently");
    assert(storeB.listRequirementChanges("run-001").length === 1, "conflict leaves exactly one record");
  } finally {
    storeA.close();
    storeB.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("change classification: another entry reads the same classification and confirmed-fact boundary");
{
  const dir = mkdtempSync(join(tmpdir(), "loop-change-cls-"));
  const path = join(dir, "journal.db");
  const storeA = new LoopRunStore(path);
  storeA.init();
  storeA.createRun(makeIdentity());
  storeA.appendRequirementChange(createLoopRequirementChangeRecord(newRequirementDraft()));
  const record = createLoopRequirementChangeRecord(deltaDraft("FEEDBACK_DRIVEN_CHANGE"));
  storeA.appendRequirementChange(record);
  storeA.close();

  const storeB = new LoopRunStore(path);
  storeB.init();
  try {
    const recovered = storeB.findLatestRequirementChangeByRequirement("req-001");
    assert(recovered !== undefined, "second entry recovers the latest classification");
    assert(
      canonicalizeLoopRequirementChangeRecord(recovered!) === canonicalizeLoopRequirementChangeRecord(record),
      "recovered classification is byte-identical across entries",
    );
    assert(
      recovered!.changeKind === "FEEDBACK_DRIVEN_CHANGE" &&
        recovered!.confirmedFactsPreserved.join("|") === "业务目标不变|既有技术方案 1.0.0 保持有效",
      "recovered record preserves the confirmed-fact boundary",
    );
    const chain = storeB.listRequirementChanges("run-001");
    assert(chain.length === 2 && chain[0].changeKind === "NEW_REQUIREMENT", "full chain readable across entries");
    assert(storeB.findLatestRequirementChangeByRequirement("req-absent") === undefined,
      "unknown requirement has no classification");
    expectThrow("INVALID_INPUT", () => storeB.findLatestRequirementChangeByRequirement("req\u0007-bad"),
      "requirement query input validated fail-closed");

    // A newer run without records falls back to the newest classified run.
    storeB.createRun(makeIdentity({ runId: "run-002", createdAt: nextTs() }));
    const fallback = storeB.findLatestRequirementChangeByRequirement("req-001");
    assert(fallback !== undefined && fallback.changeKind === "FEEDBACK_DRIVEN_CHANGE",
      "latest classification survives a newer run without records");
  } finally {
    storeB.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("change classification: corruption is detected through normal reads");
withStore((store, dir) => {
  store.createRun(makeIdentity());
  store.appendRequirementChange(createLoopRequirementChangeRecord(newRequirementDraft()));
  const db = new Database(join(dir, "journal.db"));
  try {
    db.prepare("UPDATE loop_requirement_changes SET canonical_sha256 = ? WHERE change_record_id = ?")
      .run("0".repeat(64), "run-001:change:1:classified");
  } finally {
    db.close();
  }
  expectThrow("STORE_CORRUPT", () => store.listRequirementChanges("run-001"),
    "tampered change hash raises STORE_CORRUPT");
  expectThrow("STORE_CORRUPT", () => store.getSnapshot("run-001"),
    "tampered change hash detected through snapshot reads");
});
withStore((store, dir) => {
  store.createRun(makeIdentity());
  store.appendRequirementChange(createLoopRequirementChangeRecord(newRequirementDraft()));
  store.appendRequirementChange(createLoopRequirementChangeRecord(deltaDraft("SUPPLEMENT")));
  const db = new Database(join(dir, "journal.db"));
  try {
    db.prepare("UPDATE loop_change_confirmed_facts SET fact = ? WHERE change_record_id = ? AND fact_index = 0")
      .run("被篡改的事实", "run-001:change:2:classified");
  } finally {
    db.close();
  }
  expectThrow("STORE_CORRUPT", () => store.listRequirementChanges("run-001"),
    "tampered confirmed fact raises STORE_CORRUPT");
});
withStore((store, dir) => {
  store.createRun(makeIdentity());
  store.appendRequirementChange(createLoopRequirementChangeRecord(newRequirementDraft()));
  const db = new Database(join(dir, "journal.db"));
  try {
    db.prepare("DELETE FROM loop_change_source_refs WHERE change_record_id = ?")
      .run("run-001:change:1:classified");
  } finally {
    db.close();
  }
  expectThrow("STORE_CORRUPT", () => store.listRequirementChanges("run-001"),
    "deleted source ref row raises STORE_CORRUPT");
});
withStore((store, dir) => {
  store.createRun(makeIdentity());
  store.appendRequirementChange(createLoopRequirementChangeRecord(newRequirementDraft()));
  const db = new Database(join(dir, "journal.db"));
  try {
    db.prepare(`INSERT INTO loop_requirement_changes (
      change_record_id, run_id, requirement_id, sequence, schema_version, status,
      classification_reason, created_at, canonical_sha256
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run("run-001:change:2:classified", "run-001", "req-001", 2, 1, "CLASSIFIED",
        "伪造记录", nextTs(), "0".repeat(64));
  } finally {
    db.close();
  }
  expectThrow("STORE_CORRUPT", () => store.listRequirementChanges("run-001"),
    "directly forged persisted record raises STORE_CORRUPT");
});

console.log("change classification: review round 1 corrections");
// High-1: a tampered record whose requirementId was rebound to another
// requirement — with a freshly recomputed canonical hash — must still fail
// closed on every read path, because reads cross-bind each record to the
// owning run identity.
function recomputeCanonicalHash(record: LoopRequirementChangeRecord): string {
  return createHash("sha256").update(JSON.stringify({
    schemaVersion: record.schemaVersion,
    changeRecordId: record.changeRecordId,
    runId: record.runId,
    requirementId: record.requirementId,
    sequence: record.sequence,
    status: record.status,
    changeKind: record.changeKind,
    payloadForm: record.payloadForm,
    previousGeneration: record.previousGeneration,
    currentChangeScope: record.currentChangeScope,
    confirmedFactsPreserved: record.confirmedFactsPreserved,
    sourceRefs: record.sourceRefs,
    triggerEvidence: record.triggerEvidence,
    classificationReason: record.classificationReason,
    blockedReasonCode: record.blockedReasonCode,
    createdAt: record.createdAt,
  })).digest("hex");
}
withStore((store, dir) => {
  store.createRun(makeIdentity());
  store.appendRequirementChange(createLoopRequirementChangeRecord(newRequirementDraft()));
  const tampered = createLoopRequirementChangeRecord(newRequirementDraft({ requirementId: "req-002" }));
  const db = new Database(join(dir, "journal.db"));
  try {
    db.prepare("UPDATE loop_requirement_changes SET requirement_id = ?, canonical_sha256 = ? WHERE change_record_id = ?")
      .run("req-002", recomputeCanonicalHash(tampered), "run-001:change:1:classified");
  } finally {
    db.close();
  }
  expectThrow("STORE_CORRUPT", () => store.listRequirementChanges("run-001"),
    "rehashed mis-bound record raises STORE_CORRUPT on chain read");
  expectThrow("STORE_CORRUPT", () => store.getSnapshot("run-001"),
    "rehashed mis-bound record detected through snapshot reads");
  expectThrow("STORE_CORRUPT", () => store.findLatestRequirementChangeByRequirement("req-001"),
    "rehashed mis-bound record detected through cross-entry reads");
});

// Medium-1: source-scoped trigger evidence must reference a locator that is
// actually recorded in the record's sourceRefs — at construction and on
// persisted read-back.
expectThrow("INVALID_INPUT", () => createLoopRequirementChangeRecord(
  newRequirementDraft({ triggerEvidence: ["source:conversation:not-recorded"] }),
), "unrecorded source evidence locator fails closed at construction");
withStore((store, dir) => {
  store.createRun(makeIdentity());
  const record = createLoopRequirementChangeRecord(newRequirementDraft());
  store.appendRequirementChange(record);
  const renamedRef = Object.freeze({ ...record.sourceRefs[0]!, locator: "conversation:renamed" });
  const tampered = { ...record, sourceRefs: Object.freeze([renamedRef]) } as LoopRequirementChangeRecord;
  const db = new Database(join(dir, "journal.db"));
  try {
    db.prepare("UPDATE loop_change_source_refs SET locator = ? WHERE change_record_id = ? AND source_index = 0")
      .run("conversation:renamed", record.changeRecordId);
    db.prepare("UPDATE loop_requirement_changes SET canonical_sha256 = ? WHERE change_record_id = ?")
      .run(recomputeCanonicalHash(tampered), record.changeRecordId);
  } finally {
    db.close();
  }
  expectThrow("STORE_CORRUPT", () => store.listRequirementChanges("run-001"),
    "persisted evidence locator unbound from sourceRefs raises STORE_CORRUPT");
});

// Medium-2: foreign key column drift on the change tables must fail closed,
// not just the referenced table and delete action.
console.log("change classification: foreign key column drift fails closed");
{
  const dir = mkdtempSync(join(tmpdir(), "loop-change-cls-"));
  const path = join(dir, "journal.db");
  const store1 = new LoopRunStore(path);
  store1.init();
  store1.close();
  const raw = new Database(path);
  raw.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE loop_change_source_refs;
    CREATE TABLE loop_change_source_refs (
      change_record_id TEXT NOT NULL,
      source_index INTEGER NOT NULL,
      source_type TEXT NOT NULL,
      locator TEXT NOT NULL,
      priority INTEGER NOT NULL,
      source_version TEXT,
      observed_at TEXT NOT NULL,
      PRIMARY KEY (change_record_id, source_index),
      FOREIGN KEY (locator) REFERENCES loop_requirement_changes(change_record_id) ON DELETE CASCADE
    );
  `);
  raw.close();
  const store2 = new LoopRunStore(path);
  expectThrow("STORE_CORRUPT", () => store2.init(), "child table foreign key column drift is rejected");
  store2.close();
  rmSync(dir, { recursive: true, force: true });
}
{
  const dir = mkdtempSync(join(tmpdir(), "loop-change-cls-"));
  const path = join(dir, "journal.db");
  const store1 = new LoopRunStore(path);
  store1.init();
  store1.close();
  const raw = new Database(path);
  raw.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE loop_requirement_changes;
    CREATE TABLE loop_requirement_changes (
      change_record_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      requirement_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      schema_version INTEGER NOT NULL,
      status TEXT NOT NULL,
      change_kind TEXT,
      payload_form TEXT,
      previous_generation INTEGER,
      current_change_scope TEXT,
      classification_reason TEXT NOT NULL,
      blocked_reason_code TEXT,
      created_at TEXT NOT NULL,
      canonical_sha256 TEXT NOT NULL,
      UNIQUE (run_id, sequence),
      FOREIGN KEY (requirement_id) REFERENCES loop_runs(run_id) ON DELETE CASCADE
    );
  `);
  raw.close();
  const store2 = new LoopRunStore(path);
  expectThrow("STORE_CORRUPT", () => store2.init(), "main table foreign key column drift is rejected");
  store2.close();
  rmSync(dir, { recursive: true, force: true });
}

console.log("change classification: closed store behavior");
{
  const dir = mkdtempSync(join(tmpdir(), "loop-change-cls-"));
  const store = new LoopRunStore(join(dir, "journal.db"));
  store.init();
  store.close();
  expectThrow("STORE_CLOSED", () => store.listRequirementChanges("run-001"), "closed store raises STORE_CLOSED");
  rmSync(dir, { recursive: true, force: true });
}

console.log("change classification: v2 to v3 migration is atomic and retryable");
{
  const dir = mkdtempSync(join(tmpdir(), "loop-change-cls-"));
  const path = join(dir, "journal.db");
  const store1 = new LoopRunStore(path);
  store1.init();
  store1.createRun(makeIdentity());
  store1.close();
  // Simulate a pre-WP1 journal: no change tables, format marker v2.
  const v2 = new Database(path);
  for (const table of [
    "loop_change_trigger_evidence", "loop_change_confirmed_facts",
    "loop_change_source_refs", "loop_requirement_changes",
  ]) {
    v2.exec(`DROP TABLE ${table}`);
  }
  v2.pragma("user_version = 2");
  v2.close();
  const store2 = new LoopRunStore(path);
  store2.init();
  assert(store2.getSnapshot("run-001") !== undefined, "v2 run remains readable after v3 migration");
  assert(store2.listRequirementChanges("run-001").length === 0, "migrated journal has an empty change chain");
  store2.close();
  const migrated = new Database(path, { readonly: true });
  assert(migrated.pragma("user_version", { simple: true }) === 4, "migration atomically records format v4");
  assert(
    migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'loop_requirement_changes'").get() !== undefined,
    "migration creates the requirement change table",
  );
  migrated.close();
  rmSync(dir, { recursive: true, force: true });
}
{
  const dir = mkdtempSync(join(tmpdir(), "loop-change-cls-"));
  const path = join(dir, "journal.db");
  const store1 = new LoopRunStore(path);
  store1.init();
  store1.createRun(makeIdentity());
  store1.close();
  const v2 = new Database(path);
  for (const table of [
    "loop_change_trigger_evidence", "loop_change_confirmed_facts",
    "loop_change_source_refs", "loop_requirement_changes",
  ]) {
    v2.exec(`DROP TABLE ${table}`);
  }
  v2.pragma("user_version = 2");
  // A bogus pre-existing table makes the migration's schema verification fail.
  v2.exec("CREATE TABLE loop_requirement_changes (bogus TEXT)");
  v2.close();
  const store2 = new LoopRunStore(path);
  expectThrow("STORE_CORRUPT", () => store2.init(), "wrong-schema change table aborts migration");
  store2.close();
  const probe = new Database(path, { readonly: true });
  assert(probe.pragma("user_version", { simple: true }) === 2, "user_version unchanged after migration rollback");
  assert(
    probe.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'loop_change_source_refs'").get() === undefined,
    "child tables not persisted after rollback",
  );
  probe.close();
  // The failed migration is retryable: removing the bogus table lets init succeed.
  const fix = new Database(path);
  fix.exec("DROP TABLE loop_requirement_changes");
  fix.close();
  const store3 = new LoopRunStore(path);
  store3.init();
  assert(store3.getSnapshot("run-001") !== undefined, "repaired journal migrates and reads back");
  store3.close();
  const retry = new Database(path, { readonly: true });
  assert(retry.pragma("user_version", { simple: true }) === 4, "retry completes the v4 migration");
  retry.close();
  rmSync(dir, { recursive: true, force: true });
}
{
  const dir = mkdtempSync(join(tmpdir(), "loop-change-cls-"));
  const path = join(dir, "journal.db");
  const store1 = new LoopRunStore(path);
  store1.init();
  store1.createRun(makeIdentity());
  store1.close();
  const raw = new Database(path);
  raw.exec("DROP TABLE loop_requirement_changes");
  raw.close();
  const store2 = new LoopRunStore(path);
  expectThrow("STORE_CORRUPT", () => store2.init(), "v3 marker with missing change table is rejected");
  store2.close();
  rmSync(dir, { recursive: true, force: true });
}

console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
