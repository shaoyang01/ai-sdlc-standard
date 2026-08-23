// WP3.5-B Round 1 Corrections — Reproduction & Regression Tests
// ==============================================================
// H1: semantic evidence bindings (Finding Ledger persistence + consumption,
//     finding source-revision node/currency binding).
// H2: preflight candidate discovery (SQLite magic header over extensions)
//     and the complete LOOP physical table catalogue shared with the store.
//
// Each R# below was first written to FAIL against the Round 0 baseline and
// turns green only with the corresponding fix.

import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createHash } from "node:crypto";

import {
  canonicalizeLoopCapabilityExecutionEvent,
  validateLoopCapabilityExecutionChain,
  validateLoopCapabilityExecutionEvent,
  type LoopCapabilityExecutionEvent,
} from "../core/loop-capability-execution";
import { createLoopFinding, validateLoopFinding } from "../core/loop-finding-lifecycle";
import { createLoopArtifactRevision } from "../core/loop-artifact-revision";
import { recoverRunContext } from "../core/loop-recovery";
import { LoopRunStore } from "../core/loop-run-store";
import { LoopRunJournalError, type LoopRunIdentity } from "../core/loop-executor-types";
import { preflightLoopRunStoreV2Cutover } from "../scripts/preflight-loop-run-store-v2-cutover";

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
const RUN = "run-r1-001";
// Any seed maps to a deterministic lowercase-hex digest.
const dg = (seed: string): string => createHash("sha256").update(seed, "utf8").digest("hex");

function ref(kind: string, letter: string): string {
  return `loop-artifact:v1:${kind}:sha256:${dg(letter)}`;
}

let seq = 0;
const attempts = new Map<string, number>();
function attempt(capability: string, role: string): number {
  const key = `${capability}:${role}`;
  const next = (attempts.get(key) ?? 0) + 1;
  attempts.set(key, next);
  return next;
}

interface EventOpts {
  capability: string;
  executionRole: string;
  status: "started" | "succeeded" | "failed";
  agent?: string;
  inputRef?: string;
  outputRef?: string | null;
  gate?: string | null;
  eligible?: string | null;
  findingsRef?: string | null;
  consumedRef?: string | null;
}

function ev(o: EventOpts): LoopCapabilityExecutionEvent {
  seq += 1;
  const agent = o.agent ?? "codex";
  return Object.freeze({
    schemaVersion: 3,
    executionEventId: `${RUN}:capability:${seq}:${o.status}`,
    runId: RUN,
    sequence: seq,
    capability: o.capability,
    executionRole: o.executionRole,
    nodeId: o.capability,
    attempt: (o as { _attempt?: number })._attempt ?? attempt(o.capability, o.executionRole),
    status: o.status,
    createdAt: TS,
    bindingId: `binding-${agent}-${o.capability}-${o.executionRole}`,
    bindingVersion: "2.0.0",
    bindingRegistryVersion: "1",
    executorAgent: agent as LoopCapabilityExecutionEvent["executorAgent"],
    executorAdapter: agent === "codex" ? "codex-real-dispatch" : `${agent}-cli`,
    executorVersion: "1.0.0",
    inputArtifactRef: o.inputRef ?? ref("requirement_summary", "a"),
    inputArtifactVersion: "1.0.0",
    inputDigest: (o.inputRef ?? ref("requirement_summary", "a")).slice(-64),
    outputArtifactRef: o.status === "succeeded" ? o.outputRef ?? null : null,
    outputArtifactVersion: o.status === "succeeded" && o.outputRef ? "1.0.0" : null,
    outputDigest: o.status === "succeeded" && o.outputRef ? (o.outputRef.slice(-64)) : null,
    gateResult: o.status === "succeeded" ? o.gate ?? "NOT_APPLICABLE" : null,
    unresolvedFindingsRef: o.status === "succeeded" ? o.findingsRef ?? null : null,
    unresolvedFindingsDigest: o.status === "succeeded" && o.findingsRef ? o.findingsRef.slice(-64) : null,
    consumedFindingsRef: o.consumedRef ?? null,
    consumedFindingsDigest: o.consumedRef ? o.consumedRef.slice(-64) : null,
    nextStepEligibility: o.status === "succeeded" ? o.eligible ?? "ELIGIBLE" : null,
    errorCode: null,
    retryable: null,
    reasonCode: null,
  }) as unknown as LoopCapabilityExecutionEvent;
}

/** Intake + design prefix; returns the design output ref. */
function prefixEvents(): { designOut: string; events: LoopCapabilityExecutionEvent[] } {
  const intakeS = ev({
    capability: "requirement-intake", executionRole: "primary", status: "succeeded",
    outputRef: ref("requirement_summary", "b"), eligible: "ELIGIBLE", gate: "NOT_APPLICABLE",
  });
  // started event for intake must precede it — rebuild properly below.
  return { designOut: ref("technical_design", "d"), events: [] };
}

/**
 * Canonical happy-path eight-point chain builder. The scan round persists a
 * Finding Ledger (possibly EMPTY) and the formal_verdict consumes exactly it.
 */
function buildChain(opts: {
  scanFindingsRef?: string | null;
  consumedRef?: string | null;
  verdictAgent?: string;
}): { events: LoopCapabilityExecutionEvent[]; ledgerRef: string } {
  // Each built chain is an independent run: reset shared counters.
  seq = 0;
  attempts.clear();
  const ledger = opts.scanFindingsRef !== undefined ? opts.scanFindingsRef : ref("capability_findings", "e");
  const events: LoopCapabilityExecutionEvent[] = [];
  let previousOutput = ref("requirement_summary", "b");
  const push = (
    capability: string, role: string, outKind: string, outLetter: string,
    extra: Partial<EventOpts> = {},
  ): void => {
    // started and terminal of ONE attempt share the attempt number.
    const attemptNumber = attempt(capability, role);
    const started = ev({
      capability, executionRole: role, status: "started",
      inputRef: previousOutput, ...extra,
      _attempt: attemptNumber,
    } as EventOpts & { _attempt?: number });
    events.push(started as LoopCapabilityExecutionEvent);
    const succeeded = ev({
      capability, executionRole: role, status: "succeeded",
      inputRef: previousOutput,
      outputRef: ref(outKind, outLetter),
      gate: capability === "solution-gate" && role === "formal_verdict" ? "PASS" : "NOT_APPLICABLE",
      eligible: "ELIGIBLE",
      findingsRef: role === "adversarial_scan" ? (extra.findingsRef ?? null) : undefined,
      consumedRef: role === "formal_verdict" ? extra.consumedRef : undefined,
      agent: extra.agent,
      _attempt: attemptNumber,
    } as EventOpts & { _attempt?: number });
    events.push(succeeded);
    previousOutput = ref(outKind, outLetter);
  };
  push("requirement-intake", "primary", "requirement_summary", "b");
  push("solution-design", "primary", "technical_design", "d");
  push("solution-gate", "adversarial_scan", "solution_review", "f", {
    agent: "kimi",
    findingsRef: ledger === null ? null : ledger,
  });
  push("solution-gate", "formal_verdict", "solution_review", "g", {
    consumedRef: opts.consumedRef !== undefined ? opts.consumedRef : ledger,
    agent: opts.verdictAgent ?? "codex",
  });
  push("task-planning", "primary", "task_plan", "h");
  push("implementation", "primary", "implementation_record", "i");
  push("code-review", "primary", "review_summary", "j");
  push("knowledge-sync", "primary", "knowledge_sync_result", "k");
  return { events, ledgerRef: ledger };
}

function identity(root: string): LoopRunIdentity {
  return Object.freeze({
    runId: RUN,
    requirementId: "REQ-R1-001",
    repository: "example",
    repositoryPath: join(root, "repo"),
    baseBranch: "main",
    expectedBaseSha: "1".repeat(40),
    taskBranch: "feature/r1-test",
    controlRoot: join(root, "control"),
    createdAt: TS,
  });
}

async function main(): Promise<void> {
  console.log("R1 (H1-1): chain without any persisted Ledger is rejected");
  {
    const { events } = buildChain({ scanFindingsRef: null, consumedRef: null });
    let accepted = false;
    try {
      validateLoopCapabilityExecutionChain(events, RUN);
      accepted = true;
    } catch {
      // rejected
    }
    ok(!accepted, "scan/formal rounds without a persisted Ledger fail closed");
  }

  console.log("R3 (legal path): empty persisted Ledger allows a formal PASS");
  {
    const emptyLedger = ref("capability_findings", "e");
    const { events } = buildChain({ scanFindingsRef: emptyLedger, consumedRef: emptyLedger });
    validateLoopCapabilityExecutionChain(events, RUN);
    ok(true, "empty-Ledger scan plus exact-consumption verdict completes the chain");
  }

  console.log("R2 (H1-2): formal consuming a stale/foreign Ledger is rejected");
  {
    const staleLedger = ref("capability_findings", "z");
    const { events } = buildChain({ scanFindingsRef: ref("capability_findings", "e"), consumedRef: staleLedger });
    expectThrow("INVALID_INPUT", () => validateLoopCapabilityExecutionChain(events, RUN),
      "formal verdict bound to a different Ledger is rejected");
  }
  {
    // Tamper the digest while keeping the ref: hash covers both fields.
    const { events } = buildChain({ consumedRef: ref("capability_findings", "e") });
    const tampered = { ...events[5]!, consumedFindingsDigest: dg("9") } as LoopCapabilityExecutionEvent;
    expectThrow("INVALID_INPUT", () =>
      validateLoopCapabilityExecutionEvent(tampered), "Ledger ref/digest mismatch rejected on the event");
    void canonicalizeLoopCapabilityExecutionEvent(events[5]);
    ok(canonicalizeLoopCapabilityExecutionEvent(events[5]).includes('"consumedFindingsRef"'),
      "canonical form binds the consumed Ledger");
  }

  console.log("R4 (H1-3): recovery keeps the scan Ledger after the verdict lands");
  {
    const root = mkdtempSync(join(tmpdir(), "loop-r1-recovery-"));
    mkdirSync(join(root, "repo"));
    try {
      const store = new LoopRunStore(join(root, "journal.db"));
      store.init();
      store.createRun(identity(root));
      store.appendEvent(Object.freeze({
        eventId: `${RUN}:2:run_started`, runId: RUN, sequence: 2, kind: "run_started" as const,
        stage: null, attempt: 0, createdAt: TS, inputDigest: null, outputArtifactRef: null,
        outputDigest: null, errorCode: null, retryable: null, reasonCode: null,
        bindingId: null, bindingVersion: null, inputArtifactRef: null,
      }));
      const ledgerRef = ref("capability_findings", "e");
      // Drive intake → design → scan → verdict directly through the journal.
      const driverEvents = buildChain({ scanFindingsRef: ledgerRef }).events;
      for (const event of driverEvents.slice(0, 8)) {
        // Only intake..verdict (first 8 events).
        store.appendCapabilityExecution(event);
      }
      const context = recoverRunContext(store, "REQ-R1-001")!;
      const scanState = context.executionPointStates.find((p) => p.executionRole === "adversarial_scan")!;
      ok(scanState.unresolvedFindingsRef === ledgerRef,
        "the scan Ledger survives in the recovery projection after formal completes");
      store.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  console.log("R5 (H1-4 model): source revision node must equal sourceCapability");
  {
    expectThrow("INVALID_INPUT", () => createLoopFinding({
      runId: RUN, requirementId: "req-001", sequence: 1,
      sourceCapability: "solution-design",
      sourceRevisionId: `${RUN}:revision:requirement-intake:1`,
      causeKind: "REGRESSION", introducedByRevisionId: `${RUN}:revision:requirement-intake:1`,
      severity: "HIGH", category: "SOLUTION",
      evidenceRef: ref("capability_findings", "e"), evidenceDigest: dg("e"),
      earliestAffectedNodeId: "solution-design", createdAt: TS,
    }), "finding bound to another node's revision is rejected at construction");
    // The legal shape still validates.
    const legal = createLoopFinding({
      runId: RUN, requirementId: "req-001", sequence: 1,
      sourceCapability: "solution-design",
      sourceRevisionId: `${RUN}:revision:solution-design:1`,
      causeKind: "REGRESSION", introducedByRevisionId: `${RUN}:revision:solution-design:1`,
      severity: "HIGH", category: "SOLUTION",
      evidenceRef: ref("capability_findings", "e"), evidenceDigest: dg("e"),
      earliestAffectedNodeId: "solution-design", createdAt: TS,
    });
    validateLoopFinding(legal);
    ok(true, "node-consistent finding still constructs");
  }

  console.log("R6/R7 (H1-4 store): source revision must exist, match the node and be CURRENT");
  {
    const root = mkdtempSync(join(tmpdir(), "loop-r1-finding-"));
    mkdirSync(join(root, "repo"));
    try {
      const store = new LoopRunStore(join(root, "journal.db"));
      store.init();
      store.createRun(identity(root));
      store.appendEvent(Object.freeze({
        eventId: `${RUN}:2:run_started`, runId: RUN, sequence: 2, kind: "run_started" as const,
        stage: null, attempt: 0, createdAt: TS, inputDigest: null, outputArtifactRef: null,
        outputDigest: null, errorCode: null, retryable: null, reasonCode: null,
        bindingId: null, bindingVersion: null, inputArtifactRef: null,
      }));
      const ledgerRef = ref("capability_findings", "e");
      for (const event of buildChain({ scanFindingsRef: ledgerRef }).events) {
        store.appendCapabilityExecution(event);
      }
      // Build revisions for intake(seq1) and design(seq1): design is current.
      const SEGMENT: Record<string, string> = {
        "requirement-intake": "00-需求资料",
        "solution-design": "01-技术方案",
      };
      const KIND: Record<string, string> = {
        "requirement-intake": "requirement_summary",
        "solution-design": "technical_design",
      };
      const appendRevision = (nodeId: "requirement-intake" | "solution-design", sequence: number, semver: string, seed: string, upstream: string[]) => {
        const executions = store.listCapabilityExecutions(RUN);
        const producer = [...executions].reverse()
          .find((item) => item.capability === nodeId && item.status === "succeeded")!;
        return store.appendArtifactRevision(createLoopArtifactRevision({
          runId: RUN,
          requirementId: "REQ-R1-001",
          nodeId,
          sequence,
          generation: 1,
          stablePath: `library/REQ-R1-001/${SEGMENT[nodeId]}/doc.md`,
          artifactKind: KIND[nodeId] as never,
          semver,
          artifactRef: producer.outputArtifactRef!,
          digest: producer.outputDigest!,
          producerExecutionId: producer.executionEventId,
          producerExecutionRole: "primary" as never,
          gateResult: "NOT_APPLICABLE" as never,
          upstreamRevisionIds: upstream,
          createdAt: TS,
        }));
      };

      const intakeRev = appendRevision("requirement-intake", 1, "1.0.0", "b", []);
      const designRev = appendRevision("solution-design", 1, "1.0.0", "d", [intakeRev.record.revisionId]);

      // R7 first: same node but NOT current (explicitly marked STALE).
      store.markArtifactRevisionStale(RUN, designRev.record.revisionId);
      expectThrow("ILLEGAL_TRANSITION", () => store.appendFinding(createLoopFinding({
        runId: RUN, requirementId: "REQ-R1-001", sequence: 1,
        sourceCapability: "solution-design",
        sourceRevisionId: designRev.record.revisionId,
      causeKind: "REGRESSION", introducedByRevisionId: designRev.record.revisionId,
        severity: "HIGH", category: "SOLUTION",
        evidenceRef: ref("capability_findings", "e"), evidenceDigest: dg("e"),
        earliestAffectedNodeId: "solution-design", createdAt: TS,
      })), "appendFinding rejects a non-current source revision");

      // R6: cross-node reference — the model-level node binding rejects it
      // before the transaction even opens (nothing is persisted).
      expectThrow("INVALID_INPUT", () => store.appendFinding(createLoopFinding({
        runId: RUN, requirementId: "REQ-R1-001", sequence: 2,
        sourceCapability: "solution-design",
        sourceRevisionId: intakeRev.record.revisionId,
      causeKind: "REGRESSION", introducedByRevisionId: intakeRev.record.revisionId,
        severity: "HIGH", category: "SOLUTION",
        evidenceRef: ref("capability_findings", "e"), evidenceDigest: dg("e"),
        earliestAffectedNodeId: "solution-design", createdAt: TS,
      })), "appendFinding rejects a cross-node source revision");

      // Legal: the intake node's CURRENT revision, matching node. The two
      // rejected drafts above never persisted, so this is sequence 1.
      const appended = store.appendFinding(createLoopFinding({
        runId: RUN, requirementId: "REQ-R1-001", sequence: 1,
        sourceCapability: "requirement-intake",
        sourceRevisionId: intakeRev.record.revisionId,
      causeKind: "REGRESSION", introducedByRevisionId: intakeRev.record.revisionId,
        severity: "MEDIUM", category: "REQUIREMENT",
        evidenceRef: ref("capability_findings", "e"), evidenceDigest: dg("e"),
        earliestAffectedNodeId: "requirement-intake", createdAt: TS,
      }));
      ok(appended.appended === true, "current + node-consistent source revision is accepted");
      store.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  console.log("R8 (H2): extension-less SQLite journals are scanned");
  {
    const dir = mkdtempSync(join(tmpdir(), "loop-r1-preflight-"));
    try {
      const noExtV5 = join(dir, "journal-v5");
      const db = new Database(noExtV5);
      db.exec("CREATE TABLE loop_runs (run_id TEXT PRIMARY KEY)");
      db.pragma("user_version = 5");
      db.close();
      const report = preflightLoopRunStoreV2Cutover([dir]);
      ok(report.candidateCount >= 1, "extension-less SQLite file is discovered as a candidate");
      ok(report.requiresGovernanceStop, "extension-less real v5 journal demands the governance stop");
      const candidate = report.candidates.find((item) => item.path === noExtV5);
      ok(candidate?.verdict === "STOP_AND_RE_RULE", "v5 verdict is STOP_AND_RE_RULE");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  {
    const dir = mkdtempSync(join(tmpdir(), "loop-r1-preflight-v6-"));
    try {
      const noExtV6 = join(dir, "journal-v6");
      const db = new Database(noExtV6);
      db.exec("CREATE TABLE loop_runs (run_id TEXT PRIMARY KEY)");
      db.pragma("user_version = 6");
      db.close();
      const report = preflightLoopRunStoreV2Cutover([dir]);
      ok(report.failureCount === 0 && !report.requiresGovernanceStop, "extension-less v6 journal passes");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  console.log("R9 (H2): v0 database carrying only a LOOP child table is history");
  {
    const dir = mkdtempSync(join(tmpdir(), "loop-r1-v0-child-"));
    try {
      const path = join(dir, "child-only.db");
      const db = new Database(path);
      db.exec("CREATE TABLE loop_artifact_current (run_id TEXT NOT NULL, node_id TEXT NOT NULL)");
      db.close();
      const store = new LoopRunStore(path);
      expectThrow("UNSUPPORTED_HISTORICAL_FORMAT", () => store.init(),
        "unversioned database with only a LOOP child table rejected as history");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  console.log(`\nloop-wp35-b-round1-corrections: ${passed}/${passed} assertions passed`);
}

void prefixEvents;
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
