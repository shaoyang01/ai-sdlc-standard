// WP3.5-B Round 2 Corrections — H1 Ledger Attempt-Immutable Binding
// ================================================================
// The Round 2 review found H1's fix only bound the Ledger at the formal
// started instant: a terminal event or a retry could still substitute a
// different Finding Ledger. These tests pin the closure:
//
// T1: formal started(A) → succeeded(B) is rejected (terminal substitution).
// T2: formal started(A) → failed(A) → retry started(B) is rejected (retry
//     substitution), and a retry attempt's terminal swap is rejected too.
// T3: the legitimate A→A retry chain still validates.
// T4: a SQLite row swap to Ledger B with a RECOMPUTED canonical hash is
//     STORE_CORRUPT on every read/recovery path (live listing, live snapshot,
//     reopened store listing, reopened recovery projection).
// T5: the empty-Ledger envelope A→A chain round-trips through the store and
//     the recovery projection still exposes the scan Ledger.
//
// T1/T2/T4 were first written to FAIL against the Round 1 baseline and turn
// green only with the sameAttemptIdentity/retry-binding fix.

import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createHash } from "node:crypto";

import {
  canonicalizeLoopCapabilityExecutionEvent,
  validateLoopCapabilityExecutionChain,
  type LoopCapabilityExecutionEvent,
} from "../core/loop-capability-execution";
import { recoverRunContext } from "../core/loop-recovery";
import { LoopRunStore } from "../core/loop-run-store";
import { LoopRunJournalError, type LoopRunIdentity } from "../core/loop-executor-types";

let passed = 0;
function ok(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  passed += 1;
}

function expectThrow(code: string, fn: () => unknown, message: string): void {
  try {
    fn();
    assert.fail(`${message} (no error thrown)`);
  } catch (error) {
    if (!(error instanceof LoopRunJournalError)) console.log("RAW:", error);
    ok(
      error instanceof LoopRunJournalError && error.code === code,
      `${message} (got ${error instanceof LoopRunJournalError ? error.code : "NOT_JOURNAL_ERROR"})`,
    );
  }
}

const TS = "2026-08-22T12:00:00.000Z";
const RUN = "run-r2-001";
const REQUIREMENT = "REQ-R2-001";
// Any seed maps to a deterministic lowercase-hex digest.
const dg = (seed: string): string => createHash("sha256").update(seed, "utf8").digest("hex");

function ref(kind: string, letter: string): string {
  return `loop-artifact:v1:${kind}:sha256:${dg(letter)}`;
}

let seq = 0;
const attemptCounts = new Map<string, number>();
function nextAttempt(capability: string, role: string): number {
  const key = `${capability}:${role}`;
  const next = (attemptCounts.get(key) ?? 0) + 1;
  attemptCounts.set(key, next);
  return next;
}

interface EventOpts {
  capability: string;
  executionRole: string;
  status: "started" | "succeeded" | "failed";
  attemptNumber: number;
  agent?: string;
  inputRef: string;
  outputRef?: string;
  gate?: string;
  findingsRef?: string;
  consumedRef?: string | null;
  errorCode?: string;
  retryable?: boolean;
  reasonCode?: string;
}

function ev(o: EventOpts): LoopCapabilityExecutionEvent {
  seq += 1;
  const agent = o.agent ?? "codex";
  const succeeded = o.status === "succeeded";
  return Object.freeze({
    schemaVersion: 4,
    executionEventId: `${RUN}:capability:${seq}:${o.status}`,
    runId: RUN,
    sequence: seq,
    capability: o.capability,
    executionRole: o.executionRole,
    nodeId: o.capability,
    attempt: o.attemptNumber,
    status: o.status,
    createdAt: TS,
    bindingId: `binding-${agent}-${o.capability}-${o.executionRole}`,
    bindingVersion: "2.0.0",
    bindingRegistryVersion: "1",
    executorAgent: agent as LoopCapabilityExecutionEvent["executorAgent"],
    executorAdapter: agent === "codex" ? "codex-real-dispatch" : `${agent}-cli`,
    executorVersion: "1.0.0",
    inputArtifactRef: o.inputRef,
    inputArtifactVersion: "1.0.0",
    inputDigest: o.inputRef.slice(-64),
    outputArtifactRef: succeeded ? o.outputRef! : null,
    outputArtifactVersion: succeeded ? "1.0.0" : null,
    outputDigest: succeeded ? o.outputRef!.slice(-64) : null,
    gateResult: succeeded ? o.gate ?? "NOT_APPLICABLE" : null,
    unresolvedFindingsRef: succeeded ? o.findingsRef ?? null : null,
    unresolvedFindingsDigest: succeeded && o.findingsRef ? o.findingsRef.slice(-64) : null,
    consumedFindingsRef: o.consumedRef ?? null,
    consumedFindingsDigest: o.consumedRef ? o.consumedRef.slice(-64) : null,
    decisionDepth: (o.status === "succeeded" && o.capability === "solution-gate" && o.executionRole === "formal_verdict") ? "STANDARD" as const : null,
    decisionScopeId: (o.status === "succeeded" && o.capability === "solution-gate" && o.executionRole === "formal_verdict") ? `${RUN}:decision:${(o as { _attempt?: number })._attempt ?? nextAttempt(o.capability, o.executionRole)}` : null,
    decisionDeltaRef: (o.status === "succeeded" && o.capability === "solution-gate" && o.executionRole === "formal_verdict") ? `loop-artifact:v1:solution_review:sha256:${dg("decision-delta")}` : null,
    decisionDeltaDigest: (o.status === "succeeded" && o.capability === "solution-gate" && o.executionRole === "formal_verdict") ? dg("decision-delta") : null,
    nextStepEligibility: succeeded ? "ELIGIBLE" : o.status === "failed" ? "BLOCKED" : null,
    errorCode: o.status === "failed" ? o.errorCode ?? "EXEC_FAILED" : null,
    retryable: o.status === "failed" ? o.retryable ?? true : null,
    reasonCode: o.status === "failed" ? o.reasonCode ?? "AGENT_FAILURE" : null,
  }) as unknown as LoopCapabilityExecutionEvent;
}

/**
 * intake → design → adversarial_scan prefix. The scan persists `ledger` and
 * succeeds; the formal_verdict dispatch follows in each scenario.
 */
function prefix(ledger: string): { events: LoopCapabilityExecutionEvent[]; scanOutput: string } {
  seq = 0;
  attemptCounts.clear();
  const events: LoopCapabilityExecutionEvent[] = [];
  const intakeIn = ref("requirement_summary", "a");
  let attemptNumber = nextAttempt("requirement-intake", "primary");
  events.push(ev({
    capability: "requirement-intake", executionRole: "primary", status: "started",
    attemptNumber, inputRef: intakeIn,
  }));
  events.push(ev({
    capability: "requirement-intake", executionRole: "primary", status: "succeeded",
    attemptNumber, inputRef: intakeIn, outputRef: ref("requirement_summary", "b"),
  }));
  const designIn = ref("requirement_summary", "b");
  attemptNumber = nextAttempt("solution-design", "primary");
  events.push(ev({
    capability: "solution-design", executionRole: "primary", status: "started",
    attemptNumber, inputRef: designIn,
  }));
  events.push(ev({
    capability: "solution-design", executionRole: "primary", status: "succeeded",
    attemptNumber, inputRef: designIn, outputRef: ref("technical_design", "d"),
  }));
  const scanIn = ref("technical_design", "d");
  const scanOut = ref("solution_review", "f");
  attemptNumber = nextAttempt("solution-gate", "adversarial_scan");
  events.push(ev({
    capability: "solution-gate", executionRole: "adversarial_scan", status: "started",
    attemptNumber, inputRef: scanIn, agent: "kimi",
  }));
  events.push(ev({
    capability: "solution-gate", executionRole: "adversarial_scan", status: "succeeded",
    attemptNumber, inputRef: scanIn, agent: "kimi", outputRef: scanOut, findingsRef: ledger,
  }));
  return { events, scanOutput: scanOut };
}

function verdictStarted(attemptNumber: number, scanOutput: string, consumed: string): LoopCapabilityExecutionEvent {
  return ev({
    capability: "solution-gate", executionRole: "formal_verdict", status: "started",
    attemptNumber, inputRef: scanOutput, agent: "codex", consumedRef: consumed,
  });
}

function verdictSucceeded(attemptNumber: number, scanOutput: string, consumed: string): LoopCapabilityExecutionEvent {
  return ev({
    capability: "solution-gate", executionRole: "formal_verdict", status: "succeeded",
    attemptNumber, inputRef: scanOutput, agent: "codex", consumedRef: consumed,
    outputRef: ref("solution_review", "g"), gate: "PASS",
  });
}

function verdictFailed(attemptNumber: number, scanOutput: string, consumed: string): LoopCapabilityExecutionEvent {
  return ev({
    capability: "solution-gate", executionRole: "formal_verdict", status: "failed",
    attemptNumber, inputRef: scanOutput, agent: "codex", consumedRef: consumed,
    errorCode: "EXEC_FAILED", retryable: true, reasonCode: "AGENT_FAILURE",
  });
}

function identity(root: string): LoopRunIdentity {
  return Object.freeze({
    runId: RUN,
    requirementId: REQUIREMENT,
    repository: "example",
    repositoryPath: join(root, "repo"),
    baseBranch: "main",
    expectedBaseSha: "1".repeat(40),
    taskBranch: "feature/r2-test",
    controlRoot: join(root, "control"),
    createdAt: TS,
  });
}

const LEDGER_A = ref("capability_findings", "ledger-a");
const LEDGER_B = ref("capability_findings", "ledger-b");

async function main(): Promise<void> {
  console.log("T1: formal started(A) → succeeded(B) is rejected");
  {
    const { events, scanOutput } = prefix(LEDGER_A);
    const chain = [
      ...events,
      verdictStarted(1, scanOutput, LEDGER_A),
      verdictSucceeded(1, scanOutput, LEDGER_B),
    ];
    expectThrow("INVALID_INPUT", () => validateLoopCapabilityExecutionChain(chain, RUN),
      "terminal event substituting another Ledger fails closed");
  }

  console.log("T2: retry cannot substitute another Ledger");
  {
    const { events, scanOutput } = prefix(LEDGER_A);
    const chain = [
      ...events,
      verdictStarted(1, scanOutput, LEDGER_A),
      verdictFailed(1, scanOutput, LEDGER_A),
      verdictStarted(2, scanOutput, LEDGER_B),
    ];
    expectThrow("INVALID_INPUT", () => validateLoopCapabilityExecutionChain(chain, RUN),
      "retry started event bound to a different Ledger fails closed");
  }
  {
    const { events, scanOutput } = prefix(LEDGER_A);
    const chain = [
      ...events,
      verdictStarted(1, scanOutput, LEDGER_A),
      verdictFailed(1, scanOutput, LEDGER_A),
      verdictStarted(2, scanOutput, LEDGER_A),
      verdictSucceeded(2, scanOutput, LEDGER_B),
    ];
    expectThrow("INVALID_INPUT", () => validateLoopCapabilityExecutionChain(chain, RUN),
      "retry attempt terminal substituting another Ledger fails closed");
  }

  console.log("T3: the legitimate A→A retry chain still validates");
  {
    const { events, scanOutput } = prefix(LEDGER_A);
    const chain = [
      ...events,
      verdictStarted(1, scanOutput, LEDGER_A),
      verdictFailed(1, scanOutput, LEDGER_A),
      verdictStarted(2, scanOutput, LEDGER_A),
      verdictSucceeded(2, scanOutput, LEDGER_A),
    ];
    validateLoopCapabilityExecutionChain(chain, RUN);
    ok(true, "same-Ledger start → fail → retry → success completes the chain");
  }

  console.log("T4: rehashed SQLite row swap to Ledger B is STORE_CORRUPT on every read path");
  {
    const root = mkdtempSync(join(tmpdir(), "loop-r2-tamper-"));
    mkdirSync(join(root, "repo"));
    try {
      const path = join(root, "journal.db");
      const store = new LoopRunStore(path);
      store.init();
      store.createRun(identity(root));
      store.appendEvent(Object.freeze({
        eventId: `${RUN}:2:run_started`, runId: RUN, sequence: 2, kind: "run_started" as const,
        stage: null, attempt: 0, createdAt: TS, inputDigest: null, outputArtifactRef: null,
        outputDigest: null, errorCode: null, retryable: null, reasonCode: null,
        bindingId: null, bindingVersion: null, inputArtifactRef: null,
      }));
      const { events, scanOutput } = prefix(LEDGER_A);
      const chain = [
        ...events,
        verdictStarted(1, scanOutput, LEDGER_A),
        verdictSucceeded(1, scanOutput, LEDGER_A),
      ];
      for (const event of chain) {
        store.appendCapabilityExecution(event);
      }
      const verdictTerminal = chain[chain.length - 1]!;
      ok(verdictTerminal.executionEventId === `${RUN}:capability:8:succeeded`,
        "the formal terminal event is sequence 8");

      // Swap the persisted formal success to Ledger B and RECOMPUTE the row
      // hash so the tamper cannot hide behind hash drift detection.
      const tampered = Object.freeze({
        ...verdictTerminal,
        consumedFindingsRef: LEDGER_B,
        consumedFindingsDigest: dg("ledger-b"),
      }) as LoopCapabilityExecutionEvent;
      const rehashed = createHash("sha256")
        .update(canonicalizeLoopCapabilityExecutionEvent(tampered), "utf8")
        .digest("hex");
      const raw = new Database(path);
      const rewrite = raw.prepare(
        "UPDATE loop_capability_executions SET consumed_findings_ref = ?, consumed_findings_digest = ?, canonical_sha256 = ? WHERE execution_event_id = ?",
      ).run(LEDGER_B, dg("ledger-b"), rehashed, verdictTerminal.executionEventId);
      ok(rewrite.changes === 1, "exactly the formal terminal row was rewritten");
      raw.close();

      expectThrow("STORE_CORRUPT", () => store.listCapabilityExecutions(RUN),
        "live capability listing rejects the rehashed Ledger swap");
      expectThrow("STORE_CORRUPT", () => store.getSnapshot(RUN),
        "live run snapshot rejects the rehashed Ledger swap");
      store.close();

      const reopened = new LoopRunStore(path);
      reopened.init();
      expectThrow("STORE_CORRUPT", () => reopened.listCapabilityExecutions(RUN),
        "reopened store listing rejects the rehashed Ledger swap");
      expectThrow("STORE_CORRUPT", () => recoverRunContext(reopened, REQUIREMENT),
        "reopened recovery projection rejects the rehashed Ledger swap");
      reopened.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  console.log("T5: empty-Ledger A→A chain round-trips and recovery keeps the scan Ledger");
  {
    const root = mkdtempSync(join(tmpdir(), "loop-r2-empty-"));
    mkdirSync(join(root, "repo"));
    try {
      const path = join(root, "journal.db");
      const store = new LoopRunStore(path);
      store.init();
      store.createRun(identity(root));
      store.appendEvent(Object.freeze({
        eventId: `${RUN}:2:run_started`, runId: RUN, sequence: 2, kind: "run_started" as const,
        stage: null, attempt: 0, createdAt: TS, inputDigest: null, outputArtifactRef: null,
        outputDigest: null, errorCode: null, retryable: null, reasonCode: null,
        bindingId: null, bindingVersion: null, inputArtifactRef: null,
      }));
      const emptyLedger = ref("capability_findings", "empty");
      const { events, scanOutput } = prefix(emptyLedger);
      const chain = [
        ...events,
        verdictStarted(1, scanOutput, emptyLedger),
        verdictSucceeded(1, scanOutput, emptyLedger),
      ];
      for (const event of chain) {
        store.appendCapabilityExecution(event);
      }
      store.close();

      const reopened = new LoopRunStore(path);
      reopened.init();
      const executions = reopened.listCapabilityExecutions(RUN);
      ok(executions.length === 8, "the full empty-Ledger chain reads back cleanly");
      const verdictEvents = executions.filter((event) => event.executionRole === "formal_verdict");
      ok(verdictEvents.every((event) => event.consumedFindingsRef === emptyLedger),
        "both formal events still bind the empty-Ledger envelope after reopen");
      const context = recoverRunContext(reopened, REQUIREMENT)!;
      const scanState = context.executionPointStates.find((p) => p.executionRole === "adversarial_scan")!;
      ok(scanState.unresolvedFindingsRef === emptyLedger,
        "the recovery projection preserves the scan Ledger after formal completes");
      reopened.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  console.log(`\nloop-wp35-b-round2-corrections: ${passed}/${passed} assertions passed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
