// C03-E W6a (E4-T1 + E4-T2): durable process evidence and recovery
// classification.
//
// T1: the ten nullable process-evidence fields (invocation digest, exit code,
// signal, duration, truncated flag, staging/promotion pairs, human-action
// anchor) round-trip through the journal and are fail-closed at BOTH the
// event validator and the store write gate; they are part of the canonical
// hash. Deterministic shadow events carry all of them null.
//
// T2: classifyCapabilityRecovery yields exactly one of the five classes, and
// recoverRunContext projects it so a fresh operator decides the next move
// from the journal alone.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { LoopRunStore } from "../core/loop-run-store";
import { LoopRunJournalError, type LoopRunIdentity } from "../core/loop-executor-types";
import {
  LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION,
  validateLoopCapabilityExecutionEvent,
  type LoopCapabilityExecutionEvent,
} from "../core/loop-capability-execution";
import {
  classifyCapabilityRecovery,
  recoverRunContext,
  type RecoveryClassification,
} from "../core/loop-recovery";

let passed = 0;
function ok(condition: boolean, message: string): void {
  if (condition) { passed += 1; } else { throw new Error(`FAIL: ${message}`); }
}
function eq<T>(actual: T, expected: T, message: string): void {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  if (!same) throw new Error(`FAIL: ${message} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
  passed += 1;
}
function sha(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
function ref(kind: string, content: string): { artifactRef: string; digest: string } {
  const digest = sha(content);
  return { artifactRef: `loop-artifact:v1:${kind}:sha256:${digest}`, digest };
}

const TS = "2026-08-29T00:00:00.000Z";
function identity(o: Partial<LoopRunIdentity> = {}): LoopRunIdentity {
  return Object.freeze({
    runId: "run-w6a-001",
    requirementId: "req-w6a-001",
    repository: "shaoyang01/target-repo",
    repositoryPath: "/tmp/w6a/target-repo",
    baseBranch: "main",
    expectedBaseSha: "a".repeat(40),
    taskBranch: "codex/w6a-run-001",
    controlRoot: "/tmp/w6a/control",
    createdAt: TS,
    ...o,
  });
}

type CapOverrides = Partial<LoopCapabilityExecutionEvent> & { sequence: number; status: "started" | "succeeded" | "failed" };
function capEvent(o: CapOverrides): LoopCapabilityExecutionEvent {
  const sequence = o.sequence;
  const status = o.status;
  const attempt = o.attempt ?? 1;
  const input = ref("requirement_summary", `input-${attempt}`);
  const output = status === "succeeded" ? ref("requirement_summary", `output-${sequence}`) : null;
  return Object.freeze({
    schemaVersion: LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION,
    executionEventId: `run-w6a-001:capability:${sequence}:${status}`,
    runId: "run-w6a-001",
    sequence,
    capability: "requirement-intake",
    executionRole: "primary",
    nodeId: "requirement-intake",
    attempt,
    status,
    createdAt: TS,
    bindingId: "binding-kimi-requirement-intake-primary",
    bindingVersion: "2.0.0",
    bindingRegistryVersion: "1",
    executorAgent: "kimi",
    executorAdapter: "kimi-cli",
    executorVersion: "1.0.0",
    inputArtifactRef: input.artifactRef,
    inputArtifactVersion: "1.0.0",
    inputDigest: input.digest,
    outputArtifactRef: output?.artifactRef ?? null,
    outputArtifactVersion: output ? "1.0.0" : null,
    outputDigest: output?.digest ?? null,
    gateResult: status === "succeeded" ? "NOT_APPLICABLE" : null,
    unresolvedFindingsRef: null,
    unresolvedFindingsDigest: null,
    consumedFindingsRef: null,
    consumedFindingsDigest: null,
    decisionDepth: null,
    decisionScopeId: null,
    decisionDeltaRef: null,
    decisionDeltaDigest: null,
    nextStepEligibility:
      status === "succeeded" ? "ELIGIBLE" : status === "failed" ? "BLOCKED" : null,
    errorCode: status === "failed" ? "EXECUTOR_UNAVAILABLE" : null,
    retryable: status === "failed" ? true : null,
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
    ...o,
  });
}

function openStore(): { store: LoopRunStore; root: string } {
  const root = mkdtempSync(join(tmpdir(), "w6a-"));
  const store = new LoopRunStore(join(root, "journal.db"));
  store.init();
  store.createRun(identity());
  store.ensureRunStarted("run-w6a-001");
  return { store, root };
}

// A validator rejection that the store write gate must share.
function rejectsAtBothLayers(mutant: Partial<LoopCapabilityExecutionEvent>, message: string): void {
  const event = capEvent({ sequence: 2, status: "succeeded", ...mutant });
  let validatorCaught: unknown;
  try { validateLoopCapabilityExecutionEvent(event); } catch (e) { validatorCaught = e; }
  ok(validatorCaught instanceof Error, `${message} — validator rejects`);
  const { store, root } = openStore();
  store.appendCapabilityExecution(capEvent({ sequence: 1, status: "started" }));
  let storeCaught: unknown;
  try { store.appendCapabilityExecution(event); } catch (e) { storeCaught = e; }
  ok(storeCaught instanceof LoopRunJournalError, `${message} — store write gate rejects`);
  rmSync(root, { recursive: true, force: true });
  passed += 2;
}

async function main(): Promise<void> {
  // ── T1-A: full process evidence round-trips exactly ──
  {
    const { store, root } = openStore();
    store.appendCapabilityExecution(capEvent({ sequence: 1, status: "started" }));
    const invocation = sha("normalized-argv-shape");
    const staging = ref("requirement_summary", "staged");
    const promotion = ref("requirement_summary", "promoted");
    const ev = capEvent({
      sequence: 2, status: "succeeded",
      processInvocationDigest: invocation,
      processExitCode: 0,
      processDurationMs: 1240,
      processTruncated: false,
      stagingRef: staging.artifactRef,
      stagingDigest: staging.digest,
      promotionRef: promotion.artifactRef,
      promotionDigest: promotion.digest,
    });
    const result = store.appendCapabilityExecution(ev);
    ok(result.appended === true, "T1-A a fully-evidenced real success appends");
    const read = store.listCapabilityExecutions("run-w6a-001").find((e) => e.sequence === 2)!;
    eq(read.processInvocationDigest, invocation, "T1-A invocation digest round-trips");
    eq(read.processExitCode, 0, "T1-A exit code round-trips");
    eq(read.processSignal, null, "T1-A absent signal reads back null");
    eq(read.processDurationMs, 1240, "T1-A duration round-trips");
    eq(read.processTruncated, false, "T1-A truncated flag round-trips");
    eq(read.stagingRef, staging.artifactRef, "T1-A staging ref round-trips");
    eq(read.promotionRef, promotion.artifactRef, "T1-A promotion ref round-trips");
    rmSync(root, { recursive: true, force: true });
  }

  // ── T1-B: a shadow started event carries all-null evidence cleanly ──
  {
    const { store, root } = openStore();
    store.appendCapabilityExecution(capEvent({ sequence: 1, status: "started" }));
    const read = store.listCapabilityExecutions("run-w6a-001").at(-1)!;
    ok(read.processInvocationDigest === null && read.processExitCode === null &&
      read.processSignal === null && read.processDurationMs === null &&
      read.processTruncated === null && read.stagingRef === null &&
      read.promotionRef === null && read.humanActionRef === null,
      "T1-B a deterministic shadow started event reads all evidence null");
    rmSync(root, { recursive: true, force: true });
  }

  // ── T1-C: canonical hash moves when process evidence changes (no fork) ──
  {
    const inv = sha("same-invocation");
    const a = capEvent({ sequence: 1, status: "succeeded", processInvocationDigest: inv, processExitCode: 0, processDurationMs: 100 });
    const b = capEvent({ sequence: 1, status: "succeeded", processInvocationDigest: inv, processExitCode: 0, processDurationMs: 200 });
    // Both valid in isolation; their canonical form differs, so a rewritten
    // duration cannot hide behind an identical hash.
    validateLoopCapabilityExecutionEvent(a);
    validateLoopCapabilityExecutionEvent(b);
    const { canonicalizeLoopCapabilityExecutionEvent } = await import("../core/loop-capability-execution");
    ok(canonicalizeLoopCapabilityExecutionEvent(a) !== canonicalizeLoopCapabilityExecutionEvent(b),
      "T1-C process evidence is part of the canonical hash (no silent fork)");
  }

  // ── T1-D: every malformed evidence shape is rejected at BOTH layers ──
  rejectsAtBothLayers({ processExitCode: 256 }, "T1-D1 exit code above 255");
  rejectsAtBothLayers({ processExitCode: -1 }, "T1-D2 negative exit code");
  rejectsAtBothLayers({ processSignal: "SIGEVIL" as never }, "T1-D3 signal outside the closed allowlist");
  rejectsAtBothLayers({ processExitCode: 1, processSignal: "SIGTERM" }, "T1-D4 exit code and signal cannot coexist");
  rejectsAtBothLayers({ processDurationMs: 0 }, "T1-D5 non-positive duration");
  // D6 is a positive control: a complete real-success evidence set is accepted.
  {
    const okEvent = capEvent({
      sequence: 9, status: "succeeded",
      processInvocationDigest: sha("x"), processDurationMs: 5, processExitCode: 0,
    });
    validateLoopCapabilityExecutionEvent(okEvent);
    passed += 1;
  }
  rejectsAtBothLayers({ processDurationMs: 5 }, "T1-D7 process fact without invocation digest");
  {
    const staging = ref("requirement_summary", "s");
    rejectsAtBothLayers({ stagingRef: staging.artifactRef }, "T1-D8 staging ref without its digest");
  }
  {
    const promotion = ref("requirement_summary", "p");
    rejectsAtBothLayers({ promotionRef: promotion.artifactRef, promotionDigest: promotion.digest },
      "T1-D9 promotion without staging evidence");
  }
  rejectsAtBothLayers({ status: "started", processInvocationDigest: sha("x"), nextStepEligibility: null,
    gateResult: null, errorCode: null, retryable: null, outputArtifactRef: null,
    outputArtifactVersion: null, outputDigest: null }, "T1-D10 a started event carries no process evidence");
  rejectsAtBothLayers({ processExitCode: 1, processInvocationDigest: sha("x"), processDurationMs: 5 },
    "T1-D11 a succeeded real process must exit 0");
  rejectsAtBothLayers({
    status: "failed", nextStepEligibility: "BLOCKED", retryable: false, errorCode: "X",
    gateResult: null, outputArtifactRef: null, outputArtifactVersion: null, outputDigest: null,
    promotionRef: ref("requirement_summary", "p").artifactRef,
    promotionDigest: ref("requirement_summary", "p").digest,
    stagingRef: ref("requirement_summary", "s").artifactRef,
    stagingDigest: ref("requirement_summary", "s").digest,
  }, "T1-D12 a failed event carries no promotion");

  // ── T2-A: pure classifier covers all five classes plus null cases ──
  const lastLike = (patch: Partial<LoopCapabilityExecutionEvent>): LoopCapabilityExecutionEvent =>
    capEvent({ sequence: 1, status: "failed", ...patch });
  const classify = (
    chainStatus: "READY" | "RUNNING" | "BLOCKED" | "COMPLETED",
    last: LoopCapabilityExecutionEvent | null,
    hasPendingRevisionMaterialization = false,
  ): RecoveryClassification | null =>
    classifyCapabilityRecovery({ chainStatus, last: last, hasPendingRevisionMaterialization });

  eq(classify("COMPLETED", lastLike({})), null, "T2-A1 a completed chain needs no recovery");
  eq(classify("READY", null), null, "T2-A2 a run with no capability event needs no recovery");
  eq(classify("RUNNING", lastLike({ status: "started", nextStepEligibility: null,
    errorCode: null, retryable: null, gateResult: null })), "SAFE_RETRY",
    "T2-A3 an interrupted started attempt is safe to retry");
  eq(classify("BLOCKED", lastLike({ retryable: true }), true), "SAFE_RETRY",
    "T2-A4 an open revision-materialization window is safe to replay");
  eq(classify("BLOCKED", lastLike({ retryable: true, processInvocationDigest: null })), "SAFE_RETRY",
    "T2-A5 a deterministic shadow retryable failure is safe (no real process)");
  eq(classify("BLOCKED", lastLike({
    stagingRef: ref("requirement_summary", "s").artifactRef,
    stagingDigest: ref("requirement_summary", "s").digest,
  })), "VERIFY_STAGED", "T2-A6 a staged-but-unpromoted result must be verified");
  eq(classify("BLOCKED", lastLike({ humanActionRef: ref("human_action", "h").artifactRef })),
    "HUMAN_INPUT_REQUIRED", "T2-A7 a human-action anchor requests human input");
  eq(classify("BLOCKED", lastLike({ processInvocationDigest: sha("real-run") })), "CLEANUP_REQUIRED",
    "T2-A8 a real process that failed without staging requires attempt cleanup");
  eq(classify("BLOCKED", lastLike({ retryable: false })), "TERMINAL_FAILED_BLOCKED",
    "T2-A9 a non-retryable failure is terminal-blocked");
  // Precedence: human outranks cleanup; staged outranks cleanup.
  eq(classify("BLOCKED", lastLike({
    retryable: false, processInvocationDigest: sha("real"),
    humanActionRef: ref("human_action", "h").artifactRef,
  })), "HUMAN_INPUT_REQUIRED", "T2-A10 human input outranks cleanup/terminal");

  // ── T2-B: recoverRunContext projects the class end-to-end from journal facts ──
  {
    const { store, root } = openStore();
    eq(recoverRunContext(store, "req-w6a-001")!.recoveryClassification, null,
      "T2-B1 a fresh run projects null classification");
    // A deterministic shadow failure (retryable, no process evidence).
    store.appendCapabilityExecution(capEvent({ sequence: 1, status: "started" }));
    store.appendCapabilityExecution(capEvent({
      sequence: 2, status: "failed", attempt: 1, errorCode: "EXECUTOR_UNAVAILABLE", retryable: true,
      nextStepEligibility: "BLOCKED", gateResult: null,
      outputArtifactRef: null, outputArtifactVersion: null, outputDigest: null,
    }));
    eq(recoverRunContext(store, "req-w6a-001")!.recoveryClassification, "SAFE_RETRY",
      "T2-B2 a shadow retryable failure projects SAFE_RETRY through recovery");
    rmSync(root, { recursive: true, force: true });
  }
  {
    const { store, root } = openStore();
    store.appendCapabilityExecution(capEvent({ sequence: 1, status: "started" }));
    store.appendCapabilityExecution(capEvent({
      sequence: 2, status: "failed", attempt: 1, errorCode: "PROCESS_NONZERO_EXIT", retryable: true,
      nextStepEligibility: "BLOCKED", gateResult: null,
      outputArtifactRef: null, outputArtifactVersion: null, outputDigest: null,
      processInvocationDigest: sha("real-spawn"), processExitCode: 1, processDurationMs: 800,
    }));
    eq(recoverRunContext(store, "req-w6a-001")!.recoveryClassification, "CLEANUP_REQUIRED",
      "T2-B3 a real-process failure projects CLEANUP_REQUIRED through recovery");
    rmSync(root, { recursive: true, force: true });
  }

  console.log(`loop-w6a process-evidence + recovery-classification: ${passed} passed`);
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
