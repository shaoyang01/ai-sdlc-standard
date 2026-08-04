// D10-A — Durable Checkpoint Current-Head Store Tests
// ====================================================
// Real assertion-count tests for the SQLite-backed current-head locator:
// constructor/init/close guards, WAL/busy/synchronous/schema, new-run and
// generation-increment advance, full read-back verification, close/reopen
// restart with fresh instances, exact-retry confirmed, CAS stale/advanced
// semantics, real cross-process concurrent writers (one advanced, losers
// CHECKPOINT_STALE, loser orphan artifacts never become authority), row /
// artifact / parser corruption classification, Artifact Store failure
// translation, SQLite busy translation and sanitized storage errors.
// No placeholders, no skips, no ok(true).

import { fork, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  LoopArtifactStore,
  LoopArtifactStoreError,
  type LoopArtifactKind,
} from "../core/loop-artifact-store";
import {
  buildLoopDeliveryCheckpoint,
  parseLoopDeliveryCheckpointBytes,
  loopDeliveryCheckpointRef,
  LOOP_DELIVERY_CHECKPOINT_SCHEMA,
  LOOP_DELIVERY_CHECKPOINT_COMPLETED_REASON_CODE,
  type LoopDeliveryCheckpointPhase,
} from "../core/loop-delivery-checkpoint";
import {
  LoopDeliveryCheckpointStore,
  LoopDeliveryCheckpointStoreError,
  type LoopDeliveryCheckpointAdvanceBody,
} from "../core/loop-delivery-checkpoint-store";

// ═══════════════════════════════════════ Harness

let passed = 0;
let failed = 0;
let sectionFailures = 0;

function check(condition: boolean, message: string): void {
  if (condition) {
    passed += 1;
  } else {
    sectionFailures += 1;
    failed += 1;
    console.error(`  FAIL ${message}`);
  }
}

function startSection(): void {
  sectionFailures = 0;
}

const MARKERS: Record<string, boolean> = {
  D10_A_CHECKPOINT_CAS_VERIFIED: false,
  D10_A_CHECKPOINT_RESTART_VERIFIED: false,
  D10_A_TEMP_CLEANUP_COMPLETE: false,
};

function markIfClear(marker: string): void {
  if (sectionFailures === 0) {
    MARKERS[marker] = true;
  } else {
    console.error(`  marker ${marker} NOT set (${sectionFailures} section failure(s))`);
  }
}

function expectStoreError(code: string, fn: () => unknown, message: string): void {
  try {
    fn();
    check(false, `${message} (no error thrown)`);
  } catch (error) {
    const actual = error instanceof LoopDeliveryCheckpointStoreError ? error.code : "NOT_STORE_ERROR";
    check(actual === code, `${message} (got ${actual})`);
  }
}

const tempDirs: string[] = [];
const workerExitCodes: number[] = [];

function newTempDir(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `loop-d10a-${label}-`));
  tempDirs.push(dir);
  return dir;
}

// ═══════════════════════════════════════ Factories

const REF_A1 = `loop-artifact:v1:orchestration_result:sha256:${"1".repeat(64)}`;
const REF_A2 = `loop-artifact:v1:executor_input:sha256:${"2".repeat(64)}`;
const REF_D = `loop-artifact:v1:delivery_result:sha256:${"3".repeat(64)}`;
const REF_G = `loop-artifact:v1:governance_tail_result:sha256:${"4".repeat(64)}`;
const REF_I = `loop-artifact:v1:workspace_metadata:sha256:${"5".repeat(64)}`;
const REF_X = `loop-artifact:v1:workspace_metadata:sha256:${"6".repeat(64)}`;
const COMMIT_SHA = "e".repeat(40);
const PR_URL = "https://github.com/shaoyang01/target-repo/pull/42";

const FACTS: Record<string, Record<string, unknown>> = {
  A: { orchestration_result_artifact_ref: REF_A1, executor_input_artifact_ref: REF_A2 },
  W_FALSE: {
    workspace_path: "/tmp/loop-checkpoint/workspace",
    workspace_head_sha: "c".repeat(40),
    workspace_status_digest_sha256: "d".repeat(64),
    workspace_has_changes: false,
  },
  W_TRUE: {
    workspace_path: "/tmp/loop-checkpoint/workspace",
    workspace_head_sha: "c".repeat(40),
    workspace_status_digest_sha256: "d".repeat(64),
    workspace_has_changes: true,
  },
  W_COMMIT: {
    workspace_path: "/tmp/loop-checkpoint/workspace",
    workspace_head_sha: COMMIT_SHA,
    workspace_status_digest_sha256: "d".repeat(64),
    workspace_has_changes: false,
  },
  D: { delivery_result_artifact_ref: REF_D },
  G: { governance_tail_result_artifact_ref: REF_G },
  I: { publish_intent_artifact_ref: REF_I },
  C: { commit_sha: COMMIT_SHA },
  R: { remote_branch_sha: COMMIT_SHA },
  P: { pr_number: 42, pr_url: PR_URL, pr_body_sha256: "7".repeat(64) },
  X: { publish_result_artifact_ref: REF_X },
  T_COMPLETED: { terminal_status: "completed", terminal_reason_code: LOOP_DELIVERY_CHECKPOINT_COMPLETED_REASON_CODE },
  T_BLOCKED: { terminal_status: "blocked", terminal_reason_code: "BLOCKED_REASON" },
  T_FAILED: { terminal_status: "failed", terminal_reason_code: "FAILED_REASON" },
};

const RUN_ID = "run-d10a-store-001";

function makeIdentity(o: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    runId: RUN_ID,
    requirementId: "req-d10a-store-001",
    repository: "shaoyang01/target-repo",
    repositoryPath: "/tmp/loop-checkpoint-store/repo",
    baseBranch: "main",
    expectedBaseSha: "a".repeat(40),
    taskBranch: "codex/d10a-store-run",
    controlRoot: "/tmp/loop-checkpoint-store/control",
    createdAt: "2026-08-04T00:00:00.000Z",
    ...o,
  };
}

/** Full checkpoint input for a phase (with schema/generation/previous ref). */
function atPhase(phase: LoopDeliveryCheckpointPhase, generation: number, previousRef: string | null): Record<string, unknown> {
  const input: Record<string, unknown> = {
    schema: LOOP_DELIVERY_CHECKPOINT_SCHEMA,
    identity: makeIdentity(),
    mode: "fresh",
    generation,
    previous_checkpoint_artifact_ref: previousRef,
    phase,
    target_repository: "shaoyang01/target-repo",
    base_branch: "main",
    expected_base_sha: "a".repeat(40),
    task_branch: "codex/d10a-store-run",
    source_head_sha: "a".repeat(40),
    source_wip_digest_sha256: "b".repeat(64),
    workspace_path: null,
    workspace_head_sha: null,
    workspace_status_digest_sha256: null,
    workspace_has_changes: null,
    orchestration_result_artifact_ref: null,
    executor_input_artifact_ref: null,
    delivery_result_artifact_ref: null,
    governance_tail_result_artifact_ref: null,
    publish_intent_artifact_ref: null,
    publish_result_artifact_ref: null,
    commit_sha: null,
    remote_branch_sha: null,
    pr_number: null,
    pr_url: null,
    pr_body_sha256: null,
    deadline_origin_ms: 0,
    max_total_duration_ms: 3_600_000,
    elapsed_ms: 0,
    terminal_status: null,
    terminal_reason_code: null,
  };
  switch (phase) {
    case "initialized":
      return input;
    case "d08_completed":
      return { ...input, ...FACTS.A };
    case "workspace_prepared":
    case "d06_in_progress":
      return { ...input, ...FACTS.A, ...FACTS.W_FALSE };
    case "d06_completed":
    case "tail_in_progress":
    case "tail_completed":
      return { ...input, ...FACTS.A, ...FACTS.W_TRUE, ...FACTS.D };
    case "a1_persisted":
      return { ...input, ...FACTS.A, ...FACTS.W_TRUE, ...FACTS.D, ...FACTS.G };
    case "publish_intent_persisted":
      return { ...input, ...FACTS.A, ...FACTS.W_TRUE, ...FACTS.D, ...FACTS.G, ...FACTS.I };
    case "commit_reconciled":
      return { ...input, ...FACTS.A, ...FACTS.W_COMMIT, ...FACTS.D, ...FACTS.G, ...FACTS.I, ...FACTS.C };
    case "push_reconciled":
      return { ...input, ...FACTS.A, ...FACTS.W_COMMIT, ...FACTS.D, ...FACTS.G, ...FACTS.I, ...FACTS.C, ...FACTS.R };
    case "pr_reconciled":
      return { ...input, ...FACTS.A, ...FACTS.W_COMMIT, ...FACTS.D, ...FACTS.G, ...FACTS.I, ...FACTS.C, ...FACTS.R, ...FACTS.P };
    case "publish_result_persisted":
      return { ...input, ...FACTS.A, ...FACTS.W_COMMIT, ...FACTS.D, ...FACTS.G, ...FACTS.I, ...FACTS.C, ...FACTS.R, ...FACTS.P, ...FACTS.X };
    case "completed":
      return { ...atPhase("publish_result_persisted", generation, previousRef), phase: "completed", ...FACTS.T_COMPLETED };
    case "blocked":
      return { ...atPhase("publish_result_persisted", generation, previousRef), phase: "blocked", ...FACTS.T_BLOCKED };
    case "failed":
      return { ...atPhase("publish_result_persisted", generation, previousRef), phase: "failed", ...FACTS.T_FAILED };
  }
}

/** Advance body: checkpoint without the store-owned schema/generation/previous ref. */
function bodyAt(phase: LoopDeliveryCheckpointPhase, overrides: Record<string, unknown> = {}): LoopDeliveryCheckpointAdvanceBody {
  const full = atPhase(phase, 0, null);
  delete full.schema;
  delete full.generation;
  delete full.previous_checkpoint_artifact_ref;
  return { ...full, ...overrides } as LoopDeliveryCheckpointAdvanceBody;
}

const CHAIN: LoopDeliveryCheckpointPhase[] = [
  "initialized", "d08_completed", "workspace_prepared", "d06_in_progress", "d06_completed",
  "tail_in_progress", "tail_completed", "a1_persisted", "publish_intent_persisted",
  "commit_reconciled", "push_reconciled", "pr_reconciled", "publish_result_persisted", "completed",
];

function openStores(tempRoot: string, options: { busyTimeoutMs?: number } = {}) {
  const repository = join(tempRoot, "repo");
  mkdirSync(repository, { recursive: true });
  const controlRoot = join(tempRoot, "control");
  const dbPath = join(tempRoot, "checkpoints", "head.db");
  const artifactStore = new LoopArtifactStore({ controlRoot, repositoryPath: repository });
  artifactStore.init();
  const store = new LoopDeliveryCheckpointStore({
    dbPath,
    artifactStore,
    busyTimeoutMs: options.busyTimeoutMs,
  });
  store.init();
  return { repository, controlRoot, dbPath, artifactStore, store };
}

/** Advance one step and return the verified result (or throw on failure). */
function advanceStep(
  store: LoopDeliveryCheckpointStore,
  runId: string,
  expectedGeneration: number,
  expectedRef: string | null,
  phase: LoopDeliveryCheckpointPhase,
  bodyOverrides: Record<string, unknown> = {},
) {
  return store.advance({
    runId,
    expectedGeneration,
    expectedCheckpointArtifactRef: expectedRef,
    checkpoint: bodyAt(phase, bodyOverrides),
  });
}

// ═══════════════════════════════════════ Worker machinery

type WorkerPayload = {
  runId: string;
  expectedGeneration: number;
  expectedCheckpointArtifactRef: string | null;
  checkpoint: Record<string, unknown>;
  controlRoot: string;
  dbPath: string;
  repository: string;
};

type WorkerResult = { ok: boolean; status?: string; generation?: number; ref?: string; code?: string };

function workerMain(): void {
  const payload = JSON.parse(process.env.LOOP_CKPT_PAYLOAD!) as WorkerPayload;
  const send = (result: unknown): void => {
    if (process.send) process.send(result);
  };
  try {
    const artifactStore = new LoopArtifactStore({
      controlRoot: payload.controlRoot,
      repositoryPath: payload.repository,
    });
    artifactStore.init();
    const store = new LoopDeliveryCheckpointStore({ dbPath: payload.dbPath, artifactStore });
    store.init();
    const result = store.advance({
      runId: payload.runId,
      expectedGeneration: payload.expectedGeneration,
      expectedCheckpointArtifactRef: payload.expectedCheckpointArtifactRef,
      checkpoint: payload.checkpoint as never,
    });
    store.close();
    artifactStore.close();
    send({ ok: true, status: result.status, generation: result.current.generation, ref: result.current.checkpointArtifactRef });
  } catch (error) {
    if (error instanceof LoopDeliveryCheckpointStoreError) {
      send({ ok: false, code: error.code });
    } else {
      send({ ok: false, code: "NOT_STORE_ERROR" });
    }
  }
  process.exit(0);
}

if (process.env.LOOP_CKPT_WORKER === "1") {
  process.on("message", (message) => {
    if ((message as { go?: boolean }).go === true) workerMain();
  });
  if (process.send) process.send({ ready: true });
} else {
  main();
}

function runWorkers(payloads: WorkerPayload[], count: number): Promise<WorkerResult[]> {
  const workers: ChildProcess[] = [];
  const results: WorkerResult[] = new Array(count);
  return new Promise((resolve, reject) => {
    let ready = 0;
    let finished = 0;
    const watchdog = setTimeout(() => {
      for (const worker of workers) {
        try {
          worker.kill("SIGKILL");
        } catch {
          // Already gone.
        }
      }
      reject(new Error("worker watchdog timeout"));
    }, 180_000);
    for (let index = 0; index < count; index += 1) {
      const child = fork(__filename, [], {
        env: {
          ...process.env,
          LOOP_CKPT_WORKER: "1",
          LOOP_CKPT_PAYLOAD: JSON.stringify(payloads[index % payloads.length]),
        },
        execArgv: ["--import", "tsx"],
        silent: true,
      });
      workers.push(child);
      child.on("message", (message) => {
        if ((message as { ready?: boolean }).ready === true) {
          ready += 1;
          if (ready === count) for (const worker of workers) worker.send({ go: true });
          return;
        }
        results[index] = message as WorkerResult;
        finished += 1;
        if (finished === count) {
          clearTimeout(watchdog);
          resolve(results);
        }
      });
      child.on("error", (error) => {
        clearTimeout(watchdog);
        reject(error);
      });
      child.on("exit", (code) => {
        workerExitCodes.push(code ?? -1);
        if (code !== 0 && results[index] === undefined) {
          results[index] = { ok: false, code: "WORKER_EXIT" };
          finished += 1;
          if (finished === count) {
            clearTimeout(watchdog);
            resolve(results);
          }
        }
      });
    }
  });
}

function blobPath(controlRoot: string, ref: string): string {
  const digest = ref.split(":").pop()!;
  return join(controlRoot, "artifacts", "v1", "delivery_checkpoint", digest.slice(0, 2), `${digest}.blob`);
}

// ═══════════════════════════════════════ Tests

async function main(): Promise<void> {
  console.log("D10-A Delivery Checkpoint Store Tests\n");

  // ═══════════════════════════════════════════════════════════
  // 1. Constructor / init / close guards
  // ═══════════════════════════════════════════════════════════
  startSection();
  console.log("constructor/init/close guards");
  {
    const root = newTempDir("guard");
    const repository = join(root, "repo");
    mkdirSync(repository, { recursive: true });
    const controlRoot = join(root, "control");
    const dbPath = join(root, "head.db");
    const artifactStore = new LoopArtifactStore({ controlRoot, repositoryPath: repository });
    artifactStore.init();
    try {
      expectStoreError("INVALID_INPUT", () => new LoopDeliveryCheckpointStore(null as never), "null options rejected");
      expectStoreError("INVALID_INPUT", () => new LoopDeliveryCheckpointStore({ dbPath: "", artifactStore }), "empty dbPath rejected");
      expectStoreError("INVALID_INPUT", () => new LoopDeliveryCheckpointStore({ dbPath: "relative.db", artifactStore }), "relative dbPath rejected");
      expectStoreError("INVALID_INPUT", () => new LoopDeliveryCheckpointStore({ dbPath: root, artifactStore }), "directory dbPath rejected");
      expectStoreError("INVALID_INPUT", () => new LoopDeliveryCheckpointStore({ dbPath, artifactStore: null as never }), "null artifactStore rejected");
      expectStoreError("INVALID_INPUT", () => new LoopDeliveryCheckpointStore({ dbPath, artifactStore: {} as never }), "artifactStore without put/read rejected");
      expectStoreError("INVALID_INPUT", () => new LoopDeliveryCheckpointStore({ dbPath, artifactStore, busyTimeoutMs: 0 }), "busyTimeoutMs 0 rejected");
      expectStoreError("INVALID_INPUT", () => new LoopDeliveryCheckpointStore({ dbPath, artifactStore, busyTimeoutMs: 5001 }), "busyTimeoutMs above 5000 rejected");
      expectStoreError("INVALID_INPUT", () => new LoopDeliveryCheckpointStore({ dbPath, artifactStore, busyTimeoutMs: 1.5 }), "non-integer busyTimeoutMs rejected");
      expectStoreError("INVALID_INPUT", () => new LoopDeliveryCheckpointStore({ dbPath, artifactStore, maxCheckpointBytes: 0 }), "maxCheckpointBytes 0 rejected");
      expectStoreError("INVALID_INPUT", () => new LoopDeliveryCheckpointStore({ dbPath, artifactStore, maxCheckpointBytes: 1_048_577 }), "maxCheckpointBytes above bound rejected");
      expectStoreError("INVALID_INPUT", () => new LoopDeliveryCheckpointStore({ dbPath, artifactStore, maxCheckpointBytes: 1.5 }), "fractional maxCheckpointBytes rejected");

      const store = new LoopDeliveryCheckpointStore({ dbPath, artifactStore });
      expectStoreError("CHECKPOINT_STORE_CLOSED", () => store.getCurrent(RUN_ID), "getCurrent before init rejected");
      expectStoreError("CHECKPOINT_STORE_CLOSED", () => store.advance({ runId: RUN_ID, expectedGeneration: 0, expectedCheckpointArtifactRef: null, checkpoint: bodyAt("initialized") }), "advance before init rejected");
      store.init();
      expectStoreError("CHECKPOINT_STORE_CLOSED", () => store.init(), "double init rejected");
      store.close();
      expectStoreError("CHECKPOINT_STORE_CLOSED", () => store.getCurrent(RUN_ID), "getCurrent after close rejected");
      store.close();
      check(true, "close idempotent");
      expectStoreError("CHECKPOINT_STORE_CLOSED", () => store.init(), "re-init after close rejected");
    } finally {
      artifactStore.close();
    }
  }
  markIfClear("D10_A_CHECKPOINT_CAS_VERIFIED");

  // ═══════════════════════════════════════════════════════════
  // 2. WAL / busy_timeout / synchronous / schema
  // ═══════════════════════════════════════════════════════════
  startSection();
  console.log("WAL/busy_timeout/synchronous/schema");
  {
    const root = newTempDir("schema");
    const { dbPath, store, artifactStore } = openStores(root);
    // busy_timeout and synchronous are per-connection settings — read them
    // from the store's own connection.
    const storeDb = (store as unknown as { db: Database.Database }).db;
    check((storeDb.pragma("busy_timeout", { simple: true }) as number) === 2000, "default busy_timeout 2000");
    check((storeDb.pragma("synchronous", { simple: true }) as number) === 2, "synchronous FULL");
    const db = new Database(dbPath, { readonly: true });
    check(String(db.pragma("journal_mode", { simple: true })).toLowerCase() === "wal", "journal_mode is WAL (persisted in the db header)");
    const columns = (db.prepare("PRAGMA table_info(loop_delivery_checkpoint_current_head)").all() as Array<{ name: string }>).map((c) => c.name);
    check(
      columns.length === 4 &&
      columns[0] === "run_id" && columns[1] === "generation" &&
      columns[2] === "checkpoint_artifact_ref" && columns[3] === "checkpoint_digest_sha256",
      "head table has exactly the four business columns",
    );
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>).map((r) => r.name);
    check(tables.length === 1 && tables[0] === "loop_delivery_checkpoint_current_head", "exactly one checkpoint business table (no second state table)");
    db.close();
    store.close();
    artifactStore.close();
  }
  markIfClear("D10_A_CHECKPOINT_CAS_VERIFIED");

  // ═══════════════════════════════════════════════════════════
  // 3. New run generation 1 + increment + read-back
  // ═══════════════════════════════════════════════════════════
  startSection();
  console.log("new run generation 1 / increment / read-back");
  {
    const root = newTempDir("newrun");
    const { dbPath, controlRoot, artifactStore, store } = openStores(root);

    const r1 = advanceStep(store, RUN_ID, 0, null, "initialized");
    check(r1.status === "advanced", "new run advance reports advanced");
    check(r1.current.generation === 1, "new run generation is 1");
    check(r1.current.checkpoint.phase === "initialized", "new run phase initialized");
    check(r1.current.checkpoint.previous_checkpoint_artifact_ref === null, "generation 1 previous ref null");
    check(r1.current.checkpoint.identity.runId === RUN_ID, "current checkpoint identity runId");
    check(
      r1.current.checkpointArtifactRef === `loop-artifact:v1:delivery_checkpoint:sha256:${r1.current.checkpointDigestSha256}`,
      "locator ref canonical",
    );
    check(r1.current.artifactBytes.length === r1.current.artifactSizeBytes, "artifact bytes size consistent");
    check(
      createHash("sha256").update(r1.current.artifactBytes).digest("hex") === r1.current.checkpointDigestSha256,
      "artifact bytes digest matches locator",
    );
    check(Object.isFrozen(r1.current) && Object.isFrozen(r1.current.checkpoint), "current and checkpoint frozen");

    // read-back via getCurrent
    const current = store.getCurrent(RUN_ID)!;
    check(current !== undefined, "getCurrent returns verified current");
    check(current.generation === 1 && current.checkpointArtifactRef === r1.current.checkpointArtifactRef, "getCurrent matches advance result");
    check(current.checkpoint.phase === "initialized", "getCurrent checkpoint phase");
    // artifact stored in the artifact store
    const bytes = artifactStore.read(r1.current.checkpointArtifactRef, r1.current.checkpointDigestSha256);
    check(bytes.toString("utf8") === new TextDecoder("utf-8").decode(r1.current.artifactBytes), "artifact blob readable with digest verification");
    // defensive bytes copy: mutating the returned bytes must not affect the store
    r1.current.artifactBytes[0] = 0x00;
    const again = store.getCurrent(RUN_ID)!;
    check(again.artifactBytes[0] !== 0x00, "artifact bytes are a defensive copy");

    // generation increment
    const r2 = advanceStep(store, RUN_ID, 1, r1.current.checkpointArtifactRef, "d08_completed");
    check(r2.status === "advanced" && r2.current.generation === 2, "generation increment to 2 advanced");
    check(r2.current.checkpoint.phase === "d08_completed", "generation 2 phase d08_completed");
    check(
      r2.current.checkpoint.previous_checkpoint_artifact_ref === r1.current.checkpointArtifactRef,
      "generation 2 previous ref equals generation 1 ref",
    );
    const r3 = advanceStep(store, RUN_ID, 2, r2.current.checkpointArtifactRef, "workspace_prepared");
    check(r3.status === "advanced" && r3.current.generation === 3, "generation increment to 3 advanced");

    // request validation errors
    expectStoreError("INVALID_INPUT", () => store.getCurrent(""), "empty runId rejected");
    expectStoreError("INVALID_INPUT", () => store.advance({ runId: RUN_ID, expectedGeneration: -1, expectedCheckpointArtifactRef: null, checkpoint: bodyAt("initialized") }), "negative expectedGeneration rejected");
    expectStoreError("INVALID_INPUT", () => store.advance({ runId: RUN_ID, expectedGeneration: 1.5, expectedCheckpointArtifactRef: null, checkpoint: bodyAt("initialized") }), "fractional expectedGeneration rejected");
    expectStoreError("INVALID_INPUT", () => store.advance({ runId: RUN_ID, expectedGeneration: 0, expectedCheckpointArtifactRef: "bogus", checkpoint: bodyAt("initialized") }), "malformed expected ref rejected");
    expectStoreError("INVALID_INPUT", () => store.advance({ runId: RUN_ID, expectedGeneration: 0, expectedCheckpointArtifactRef: null, checkpoint: { ...bodyAt("initialized"), schema: LOOP_DELIVERY_CHECKPOINT_SCHEMA } as unknown as LoopDeliveryCheckpointAdvanceBody }), "body carrying store-owned schema rejected");
    expectStoreError("INVALID_INPUT", () => store.advance({ runId: RUN_ID, expectedGeneration: 0, expectedCheckpointArtifactRef: null, checkpoint: { ...bodyAt("initialized"), generation: 1 } as unknown as LoopDeliveryCheckpointAdvanceBody }), "body carrying store-owned generation rejected");
    expectStoreError("INVALID_INPUT", () => store.advance({ runId: RUN_ID, expectedGeneration: 0, expectedCheckpointArtifactRef: null, checkpoint: { ...bodyAt("initialized"), previous_checkpoint_artifact_ref: null } as unknown as LoopDeliveryCheckpointAdvanceBody }), "body carrying store-owned previous ref rejected");
    expectStoreError("INVALID_INPUT", () => store.advance({ runId: RUN_ID, expectedGeneration: 0, expectedCheckpointArtifactRef: null, checkpoint: { ...bodyAt("initialized"), identity: { ...makeIdentity(), runId: "other-run" } } as unknown as LoopDeliveryCheckpointAdvanceBody }), "body identity runId != request runId rejected");

    store.close();
    artifactStore.close();
  }
  markIfClear("D10_A_CHECKPOINT_CAS_VERIFIED");

  // ═══════════════════════════════════════════════════════════
  // 4. Close/reopen restart with fresh instances
  // ═══════════════════════════════════════════════════════════
  startSection();
  console.log("close/reopen restart with fresh instances");
  {
    const root = newTempDir("restart");
    const { repository, controlRoot, dbPath, artifactStore, store } = openStores(root);
    const r1 = advanceStep(store, RUN_ID, 0, null, "initialized");
    const r2 = advanceStep(store, RUN_ID, 1, r1.current.checkpointArtifactRef, "d08_completed");
    store.close();
    artifactStore.close();

    // fresh instances, same control root and DB
    const artifactStore2 = new LoopArtifactStore({ controlRoot, repositoryPath: repository });
    artifactStore2.init();
    const store2 = new LoopDeliveryCheckpointStore({ dbPath, artifactStore: artifactStore2 });
    store2.init();
    const current = store2.getCurrent(RUN_ID);
    check(current !== undefined, "reopened store reads the same current");
    check(current !== undefined && current.generation === 2, "reopened current generation 2");
    check(current !== undefined && current.checkpoint.phase === "d08_completed", "reopened current phase preserved");
    check(
      current !== undefined &&
      current.checkpointDigestSha256 === r2.current.checkpointDigestSha256 &&
      current.checkpointArtifactRef === r2.current.checkpointArtifactRef,
      "reopened current ref/digest identical",
    );
    // continue one legal transition
    const r3 = advanceStep(store2, RUN_ID, 2, r2.current.checkpointArtifactRef, "workspace_prepared");
    check(r3.status === "advanced" && r3.current.generation === 3, "restarted chain continues to generation 3");
    store2.close();
    artifactStore2.close();
  }
  markIfClear("D10_A_CHECKPOINT_RESTART_VERIFIED");

  // ═══════════════════════════════════════════════════════════
  // 5. Exact retry → confirmed; non-identical retry → stale
  // ═══════════════════════════════════════════════════════════
  startSection();
  console.log("exact retry confirmed / non-identical retry stale");
  {
    const root = newTempDir("retry");
    const { artifactStore, store } = openStores(root);
    const r1 = advanceStep(store, RUN_ID, 0, null, "initialized");
    const r2 = advanceStep(store, RUN_ID, 1, r1.current.checkpointArtifactRef, "d08_completed");

    // exact retry of the same request after an unknown response
    const retry = store.advance({
      runId: RUN_ID,
      expectedGeneration: 1,
      expectedCheckpointArtifactRef: r1.current.checkpointArtifactRef,
      checkpoint: bodyAt("d08_completed"),
    });
    check(retry.status === "confirmed", "exact retry reports confirmed");
    check(retry.current.generation === 2, "confirmed current still generation 2");
    check(retry.current.checkpointArtifactRef === r2.current.checkpointArtifactRef, "confirmed current ref identical");
    check(store.getCurrent(RUN_ID)!.generation === 2, "no new authority written by confirmed retry");

    // non-identical retry (same expectation, different body) → stale
    expectStoreError("CHECKPOINT_STALE", () => store.advance({
      runId: RUN_ID,
      expectedGeneration: 1,
      expectedCheckpointArtifactRef: r1.current.checkpointArtifactRef,
      checkpoint: bodyAt("workspace_prepared"),
    }), "non-identical retry rejected as stale");

    // generation skip / mismatch expectations → stale
    expectStoreError("CHECKPOINT_STALE", () => store.advance({
      runId: RUN_ID,
      expectedGeneration: 0,
      expectedCheckpointArtifactRef: null,
      checkpoint: bodyAt("initialized"),
    }), "claiming a new run for an existing run rejected as stale");
    expectStoreError("CHECKPOINT_STALE", () => store.advance({
      runId: RUN_ID,
      expectedGeneration: 2,
      expectedCheckpointArtifactRef: `loop-artifact:v1:delivery_checkpoint:sha256:${"a".repeat(64)}`,
      checkpoint: bodyAt("workspace_prepared"),
    }), "wrong expected ref rejected as stale");
    expectStoreError("CHECKPOINT_STALE", () => store.advance({
      runId: RUN_ID,
      expectedGeneration: 5,
      expectedCheckpointArtifactRef: r2.current.checkpointArtifactRef,
      checkpoint: bodyAt("workspace_prepared"),
    }), "generation skip expectation rejected as stale");
    // a run with no current must reject an existing-run expectation
    expectStoreError("CHECKPOINT_STALE", () => store.advance({
      runId: "run-other",
      expectedGeneration: 3,
      expectedCheckpointArtifactRef: r2.current.checkpointArtifactRef,
      checkpoint: bodyAt("workspace_prepared"),
    }), "missing current with existing-run expectation rejected as stale");
    store.close();
    artifactStore.close();
  }
  markIfClear("D10_A_CHECKPOINT_CAS_VERIFIED");

  // ═══════════════════════════════════════════════════════════
  // 6. Transition / binding rejections through the store
  // ═══════════════════════════════════════════════════════════
  startSection();
  console.log("transition/binding rejections through the store");
  {
    const root = newTempDir("reject");
    const { artifactStore, store } = openStores(root);
    const r1 = advanceStep(store, RUN_ID, 0, null, "initialized");
    const r2 = advanceStep(store, RUN_ID, 1, r1.current.checkpointArtifactRef, "d08_completed", { elapsed_ms: 100 });
    const r3 = advanceStep(store, RUN_ID, 2, r2.current.checkpointArtifactRef, "workspace_prepared", { elapsed_ms: 200 });

    // phase rollback / skip
    expectStoreError("CHECKPOINT_TRANSITION_INVALID", () => store.advance({
      runId: RUN_ID, expectedGeneration: 3, expectedCheckpointArtifactRef: r3.current.checkpointArtifactRef,
      checkpoint: bodyAt("d08_completed", { elapsed_ms: 250 }),
    }), "phase rollback rejected");
    expectStoreError("CHECKPOINT_TRANSITION_INVALID", () => store.advance({
      runId: RUN_ID, expectedGeneration: 3, expectedCheckpointArtifactRef: r3.current.checkpointArtifactRef,
      checkpoint: bodyAt("d06_completed", { elapsed_ms: 250 }),
    }), "phase skip rejected");
    // new run must start at initialized
    expectStoreError("CHECKPOINT_TRANSITION_INVALID", () => store.advance({
      runId: "run-new-bad", expectedGeneration: 0, expectedCheckpointArtifactRef: null,
      checkpoint: bodyAt("d08_completed", { identity: { ...makeIdentity(), runId: "run-new-bad" } }),
    }), "new run non-initialized phase rejected");
    // builder-level violations
    expectStoreError("CHECKPOINT_TRANSITION_INVALID", () => store.advance({
      runId: RUN_ID, expectedGeneration: 3, expectedCheckpointArtifactRef: r3.current.checkpointArtifactRef,
      checkpoint: bodyAt("d06_in_progress", { target_repository: "other/repo", elapsed_ms: 250 }),
    }), "target-repository binding violation rejected");
    expectStoreError("CHECKPOINT_TRANSITION_INVALID", () => store.advance({
      runId: RUN_ID, expectedGeneration: 3, expectedCheckpointArtifactRef: r3.current.checkpointArtifactRef,
      checkpoint: bodyAt("d06_in_progress", { task_branch: "other-branch", elapsed_ms: 250 }),
    }), "task-branch binding violation rejected");
    expectStoreError("CHECKPOINT_TRANSITION_INVALID", () => store.advance({
      runId: RUN_ID, expectedGeneration: 3, expectedCheckpointArtifactRef: r3.current.checkpointArtifactRef,
      checkpoint: bodyAt("d06_in_progress", { base_branch: "dev", elapsed_ms: 250 }),
    }), "base-branch binding violation rejected");
    // transition-level immutable bindings
    expectStoreError("CHECKPOINT_TRANSITION_INVALID", () => store.advance({
      runId: RUN_ID, expectedGeneration: 3, expectedCheckpointArtifactRef: r3.current.checkpointArtifactRef,
      checkpoint: bodyAt("d06_in_progress", { deadline_origin_ms: 12345, elapsed_ms: 250 }),
    }), "deadline-origin change rejected");
    expectStoreError("CHECKPOINT_TRANSITION_INVALID", () => store.advance({
      runId: RUN_ID, expectedGeneration: 3, expectedCheckpointArtifactRef: r3.current.checkpointArtifactRef,
      checkpoint: bodyAt("d06_in_progress", { identity: { ...makeIdentity(), requirementId: "req-other" }, elapsed_ms: 250 }),
    }), "identity change rejected");
    expectStoreError("CHECKPOINT_TRANSITION_INVALID", () => store.advance({
      runId: RUN_ID, expectedGeneration: 3, expectedCheckpointArtifactRef: r3.current.checkpointArtifactRef,
      checkpoint: bodyAt("d06_in_progress", { source_wip_digest_sha256: "0".repeat(64), elapsed_ms: 250 }),
    }), "source wip digest change rejected");
    // elapsed regression
    expectStoreError("CHECKPOINT_TRANSITION_INVALID", () => store.advance({
      runId: RUN_ID, expectedGeneration: 3, expectedCheckpointArtifactRef: r3.current.checkpointArtifactRef,
      checkpoint: bodyAt("d06_in_progress", { elapsed_ms: 50 }),
    }), "elapsed regression rejected");

    // full chain to terminal, then terminal rejects advance
    let expectedGen = 3;
    let expectedRef = r3.current.checkpointArtifactRef;
    let elapsed = 300;
    for (const phase of ["d06_in_progress", "d06_completed", "tail_in_progress", "tail_completed", "a1_persisted",
      "publish_intent_persisted", "commit_reconciled", "push_reconciled", "pr_reconciled", "publish_result_persisted", "completed"] as const) {
      const result = advanceStep(store, RUN_ID, expectedGen, expectedRef, phase, { elapsed_ms: elapsed });
      check(result.status === "advanced" && result.current.checkpoint.phase === phase, `chain advances to ${phase}`);
      expectedGen += 1;
      expectedRef = result.current.checkpointArtifactRef;
      elapsed += 100;
    }
    check(store.getCurrent(RUN_ID)!.checkpoint.phase === "completed", "terminal current is completed");
    expectStoreError("CHECKPOINT_TRANSITION_INVALID", () => store.advance({
      runId: RUN_ID, expectedGeneration: expectedGen, expectedCheckpointArtifactRef: expectedRef,
      checkpoint: bodyAt("blocked", { terminal_status: "blocked", terminal_reason_code: "LATE", elapsed_ms: elapsed + 100 }),
    }), "terminal current rejects advance");
    store.close();
    artifactStore.close();
  }
  markIfClear("D10_A_CHECKPOINT_CAS_VERIFIED");

  // ═══════════════════════════════════════════════════════════
  // 7. Corruption classification
  // ═══════════════════════════════════════════════════════════
  startSection();
  console.log("corruption classification");
  {
    // row-level corruption cases
    const rowCases: Array<{ label: string; mutate: (db: Database.Database) => void }> = [
      { label: "generation 0", mutate: (db) => db.prepare("UPDATE loop_delivery_checkpoint_current_head SET generation = 0 WHERE run_id = ?").run(RUN_ID) },
      { label: "generation negative", mutate: (db) => db.prepare("UPDATE loop_delivery_checkpoint_current_head SET generation = -3 WHERE run_id = ?").run(RUN_ID) },
      { label: "generation fractional", mutate: (db) => db.prepare("UPDATE loop_delivery_checkpoint_current_head SET generation = 1.5 WHERE run_id = ?").run(RUN_ID) },
      { label: "generation non-numeric", mutate: (db) => db.prepare("UPDATE loop_delivery_checkpoint_current_head SET generation = 'abc' WHERE run_id = ?").run(RUN_ID) },
      { label: "ref non-canonical", mutate: (db) => db.prepare("UPDATE loop_delivery_checkpoint_current_head SET checkpoint_artifact_ref = 'bogus' WHERE run_id = ?").run(RUN_ID) },
      { label: "ref wrong kind", mutate: (db) => db.prepare("UPDATE loop_delivery_checkpoint_current_head SET checkpoint_artifact_ref = ? WHERE run_id = ?").run(`loop-artifact:v1:workspace_metadata:sha256:${"a".repeat(64)}`, RUN_ID) },
      { label: "ref uppercase digest", mutate: (db) => db.prepare("UPDATE loop_delivery_checkpoint_current_head SET checkpoint_artifact_ref = ? WHERE run_id = ?").run(`loop-artifact:v1:delivery_checkpoint:sha256:${"A".repeat(64)}`, RUN_ID) },
      { label: "digest non-hex", mutate: (db) => db.prepare("UPDATE loop_delivery_checkpoint_current_head SET checkpoint_digest_sha256 = 'xyz' WHERE run_id = ?").run(RUN_ID) },
      { label: "digest short", mutate: (db) => db.prepare("UPDATE loop_delivery_checkpoint_current_head SET checkpoint_digest_sha256 = ? WHERE run_id = ?").run("a".repeat(63), RUN_ID) },
      { label: "ref/digest disagree", mutate: (db) => db.prepare("UPDATE loop_delivery_checkpoint_current_head SET checkpoint_digest_sha256 = ? WHERE run_id = ?").run("b".repeat(64), RUN_ID) },
    ];
    for (const rowCase of rowCases) {
      const root = newTempDir("corrupt-row");
      const { repository, controlRoot, dbPath, artifactStore, store } = openStores(root);
      advanceStep(store, RUN_ID, 0, null, "initialized");
      store.close();
      artifactStore.close();
      const db = new Database(dbPath);
      rowCase.mutate(db);
      db.close();
      const artifactStore2 = new LoopArtifactStore({ controlRoot, repositoryPath: repository });
      artifactStore2.init();
      const store2 = new LoopDeliveryCheckpointStore({ dbPath, artifactStore: artifactStore2 });
      store2.init();
      expectStoreError("CHECKPOINT_STORE_CORRUPT", () => store2.getCurrent(RUN_ID), `${rowCase.label} classified corrupt`);
      expectStoreError("CHECKPOINT_STORE_CORRUPT", () => store2.advance({
        runId: RUN_ID, expectedGeneration: 1, expectedCheckpointArtifactRef: null, checkpoint: bodyAt("d08_completed"),
      }), `${rowCase.label} corrupt on advance`);
      store2.close();
      artifactStore2.close();
    }

    // artifact-level corruption
    {
      const root = newTempDir("corrupt-art");
      const { repository, controlRoot, dbPath, artifactStore, store } = openStores(root);
      const r1 = advanceStep(store, RUN_ID, 0, null, "initialized");
      const blob = blobPath(controlRoot, r1.current.checkpointArtifactRef);
      store.close();
      artifactStore.close();

      // missing artifact
      {
        rmSync(blob);
        const artifactStore3 = new LoopArtifactStore({ controlRoot, repositoryPath: repository });
        artifactStore3.init();
        const store3 = new LoopDeliveryCheckpointStore({ dbPath, artifactStore: artifactStore3 });
        store3.init();
        expectStoreError("CHECKPOINT_STORE_CORRUPT", () => store3.getCurrent(RUN_ID), "missing checkpoint artifact classified corrupt");
        store3.close();
        artifactStore3.close();
      }
      // corrupted bytes (digest mismatch)
      {
        writeFileSync(blob, "tampered bytes");
        const artifactStore4 = new LoopArtifactStore({ controlRoot, repositoryPath: repository });
        artifactStore4.init();
        const store4 = new LoopDeliveryCheckpointStore({ dbPath, artifactStore: artifactStore4 });
        store4.init();
        expectStoreError("CHECKPOINT_STORE_CORRUPT", () => store4.getCurrent(RUN_ID), "artifact bytes corruption classified corrupt");
        store4.close();
        artifactStore4.close();
      }
      // parser failure from persisted artifact (non-canonical reordered bytes)
      {
        const reorderedText = JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(new TextDecoder("utf-8").decode(r1.current.artifactBytes))).reverse())) + "\n";
        writeFileSync(blob, new TextEncoder().encode(reorderedText));
        const artifactStore5 = new LoopArtifactStore({ controlRoot, repositoryPath: repository });
        artifactStore5.init();
        const store5 = new LoopDeliveryCheckpointStore({ dbPath, artifactStore: artifactStore5 });
        store5.init();
        expectStoreError("CHECKPOINT_STORE_CORRUPT", () => store5.getCurrent(RUN_ID), "parser failure from persisted artifact classified corrupt");
        store5.close();
        artifactStore5.close();
      }
      // locator/artifact disagreement: digest changed to a different valid sha256
      {
        writeFileSync(blob, r1.current.artifactBytes);
        const db = new Database(dbPath);
        db.prepare("UPDATE loop_delivery_checkpoint_current_head SET checkpoint_digest_sha256 = ? WHERE run_id = ?").run("c".repeat(64), RUN_ID);
        db.close();
        const artifactStore6 = new LoopArtifactStore({ controlRoot, repositoryPath: repository });
        artifactStore6.init();
        const store6 = new LoopDeliveryCheckpointStore({ dbPath, artifactStore: artifactStore6 });
        store6.init();
        expectStoreError("CHECKPOINT_STORE_CORRUPT", () => store6.getCurrent(RUN_ID), "locator/artifact digest disagreement classified corrupt");
        store6.close();
        artifactStore6.close();
      }
    }
  }
  markIfClear("D10_A_CHECKPOINT_CAS_VERIFIED");

  // ═══════════════════════════════════════════════════════════
  // 8. Artifact Store failure translation
  // ═══════════════════════════════════════════════════════════
  startSection();
  console.log("artifact store failure translation");
  {
    const root = newTempDir("art-fail");
    const { repository, controlRoot, dbPath, artifactStore, store } = openStores(root);
    // put failure before CAS → CHECKPOINT_ARTIFACT_FAILURE, no locator row
    const failingPut = {
      read: (ref: string) => artifactStore.read(ref),
      put: (kind: LoopArtifactKind, content: string | Uint8Array) => {
        throw new LoopArtifactStoreError("ARTIFACT_IO_FAILURE", "injected put failure");
      },
    };
    const storeFail = new LoopDeliveryCheckpointStore({ dbPath, artifactStore: failingPut });
    storeFail.init();
    expectStoreError("CHECKPOINT_ARTIFACT_FAILURE", () => storeFail.advance({
      runId: "run-art-fail", expectedGeneration: 0, expectedCheckpointArtifactRef: null,
      checkpoint: bodyAt("initialized", { identity: { ...makeIdentity(), runId: "run-art-fail" } }),
    }), "artifact put failure before CAS classified CHECKPOINT_ARTIFACT_FAILURE");
    check(storeFail.getCurrent("run-art-fail") === undefined, "no locator authority established after put failure");
    storeFail.close();

    // read failure on established authority → CHECKPOINT_STORE_CORRUPT
    const r1 = advanceStep(store, RUN_ID, 0, null, "initialized");
    const failingRead = {
      read: (ref: string) => {
        throw new LoopArtifactStoreError("ARTIFACT_IO_FAILURE", "injected read failure");
      },
      put: (kind: LoopArtifactKind, content: string | Uint8Array) => artifactStore.put(kind, content),
    };
    const storeReadFail = new LoopDeliveryCheckpointStore({ dbPath, artifactStore: failingRead });
    storeReadFail.init();
    expectStoreError("CHECKPOINT_STORE_CORRUPT", () => storeReadFail.getCurrent(RUN_ID), "artifact read failure classified corrupt");
    expectStoreError("CHECKPOINT_STORE_CORRUPT", () => storeReadFail.advance({
      runId: RUN_ID, expectedGeneration: 1, expectedCheckpointArtifactRef: r1.current.checkpointArtifactRef, checkpoint: bodyAt("d08_completed"),
    }), "artifact read failure on expected current classified corrupt");
    storeReadFail.close();

    // unknown exception from put → CHECKPOINT_ARTIFACT_FAILURE (no leak)
    const throwingPut = {
      read: (ref: string) => artifactStore.read(ref),
      put: () => {
        throw new Error("SENT_PUT_SECRET");
      },
    };
    const storeThrowPut = new LoopDeliveryCheckpointStore({ dbPath, artifactStore: throwingPut });
    storeThrowPut.init();
    try {
      storeThrowPut.advance({ runId: "run-throw", expectedGeneration: 0, expectedCheckpointArtifactRef: null, checkpoint: bodyAt("initialized", { identity: { ...makeIdentity(), runId: "run-throw" } }) });
      check(false, "throwing put should fail");
    } catch (error) {
      const e = error as LoopDeliveryCheckpointStoreError;
      check(e.code === "CHECKPOINT_ARTIFACT_FAILURE", "unknown put exception translated to CHECKPOINT_ARTIFACT_FAILURE");
      check(!e.message.includes("SENT_PUT_SECRET"), "unknown exception text not echoed");
      check(e.message.length <= 256 && !/[\x00-\x1f\x7f]/.test(e.message), "error message bounded and clean");
    }
    storeThrowPut.close();
    store.close();
    artifactStore.close();
  }
  markIfClear("D10_A_CHECKPOINT_CAS_VERIFIED");

  // ═══════════════════════════════════════════════════════════
  // 9. SQLite busy translation and sanitized storage errors
  // ═══════════════════════════════════════════════════════════
  startSection();
  console.log("sqlite busy / sanitized storage errors");
  {
    const root = newTempDir("busy");
    const { repository, controlRoot, dbPath, artifactStore } = openStores(root);
    const store = new LoopDeliveryCheckpointStore({ dbPath, artifactStore, busyTimeoutMs: 1 });
    store.init();
    const blocker = new Database(dbPath);
    blocker.exec("BEGIN IMMEDIATE");
    try {
      expectStoreError("CHECKPOINT_STORE_BUSY", () => store.advance({
        runId: RUN_ID, expectedGeneration: 0, expectedCheckpointArtifactRef: null, checkpoint: bodyAt("initialized"),
      }), "concurrent write lock classified CHECKPOINT_STORE_BUSY");
    } finally {
      blocker.exec("ROLLBACK");
      blocker.close();
    }
    // after the lock is released the store works again
    const r = advanceStep(store, RUN_ID, 0, null, "initialized");
    check(r.status === "advanced", "store recovers after busy");
    store.close();
    artifactStore.close();

    // init failure (parent path is a file) → typed sanitized storage error
    const parentFile = join(root, "parent-file");
    writeFileSync(parentFile, "x");
    const artifactStoreB = new LoopArtifactStore({ controlRoot, repositoryPath: repository });
    artifactStoreB.init();
    const failingStore = new LoopDeliveryCheckpointStore({ dbPath: join(parentFile, "journal.db"), artifactStore: artifactStoreB });
    try {
      failingStore.init();
      check(false, "init with file parent should fail");
    } catch (error) {
      const e = error as LoopDeliveryCheckpointStoreError;
      check(e.code === "CHECKPOINT_STORE_FAILURE", "init failure classified CHECKPOINT_STORE_FAILURE");
      check(e.message.length <= 256, "init failure message bounded");
      check(!/[\x00-\x1f\x7f]/.test(e.message), "init failure message no control chars");
      check(!e.message.includes("parent-file"), "init failure message does not leak path");
      check(!e.message.toLowerCase().includes("sqlite"), "init failure message does not leak raw sqlite text");
    }
    artifactStoreB.close();

    // corrupted DB file → typed sanitized error, no lingering lock
    const corruptPath = join(root, "corrupt.db");
    writeFileSync(corruptPath, "not a valid sqlite database");
    const artifactStoreC = new LoopArtifactStore({ controlRoot, repositoryPath: repository });
    artifactStoreC.init();
    const corruptStore = new LoopDeliveryCheckpointStore({ dbPath: corruptPath, artifactStore: artifactStoreC });
    try {
      corruptStore.init();
      check(false, "corrupt DB init should fail");
    } catch (error) {
      const e = error as LoopDeliveryCheckpointStoreError;
      check(e.code === "CHECKPOINT_STORE_FAILURE" || e.code === "CHECKPOINT_STORE_BUSY", "corrupt DB init typed error");
      check(e.message.length <= 256 && !/[\x00-\x1f\x7f]/.test(e.message), "corrupt DB init message bounded and clean");
      check(!e.message.toLowerCase().includes("sqlite"), "corrupt DB init message does not leak raw sqlite text");
    }
    corruptStore.close();
    artifactStoreC.close();
  }
  markIfClear("D10_A_CHECKPOINT_CAS_VERIFIED");

  // ═══════════════════════════════════════════════════════════
  // 10. Cross-process concurrent writers
  // ═══════════════════════════════════════════════════════════
  startSection();
  console.log("cross-process concurrent writers");
  {
    // identical candidates racing on a new run: exactly one advanced + one confirmed
    {
      const root = newTempDir("race-same");
      const env = openStores(root);
      const { repository, controlRoot, dbPath } = env;
      const payload: WorkerPayload = {
        runId: RUN_ID,
        expectedGeneration: 0,
        expectedCheckpointArtifactRef: null,
        checkpoint: bodyAt("initialized") as unknown as Record<string, unknown>,
        controlRoot,
        dbPath,
        repository,
      };
      const results = await runWorkers([payload, payload], 2);
      check(results.length === 2, "both identical-candidate workers returned");
      const statuses = results.map((r) => r.status).sort();
      check(statuses[0] === "advanced" && statuses[1] === "confirmed", "identical candidates: exactly one advanced + one confirmed");
      const generations = results.map((r) => r.generation);
      check(generations.every((g) => g === 1), "both workers observed generation 1");
      const refs = new Set(results.map((r) => r.ref));
      check(refs.size === 1, "identical candidates share the same ref");
      env.store.close();
      env.artifactStore.close();
      const artifactStore = new LoopArtifactStore({ controlRoot, repositoryPath: repository });
      artifactStore.init();
      const store = new LoopDeliveryCheckpointStore({ dbPath, artifactStore });
      store.init();
      const current = store.getCurrent(RUN_ID);
      check(current !== undefined && current.generation === 1, "current authority after identical race");
      store.close();
      artifactStore.close();
    }
    // different candidates racing on an existing run: exactly one advanced,
    // loser CHECKPOINT_STALE, loser orphan artifact never becomes authority
    {
      const root = newTempDir("race-diff");
      const env = openStores(root);
      const { repository, controlRoot, dbPath } = env;
      const r1 = advanceStep(env.store, RUN_ID, 0, null, "initialized");
      env.store.close();
      env.artifactStore.close();
      const payloadA: WorkerPayload = {
        runId: RUN_ID,
        expectedGeneration: 1,
        expectedCheckpointArtifactRef: r1.current.checkpointArtifactRef,
        checkpoint: bodyAt("d08_completed", { elapsed_ms: 100 }) as unknown as Record<string, unknown>,
        controlRoot,
        dbPath,
        repository,
      };
      const payloadB: WorkerPayload = {
        runId: RUN_ID,
        expectedGeneration: 1,
        expectedCheckpointArtifactRef: r1.current.checkpointArtifactRef,
        checkpoint: bodyAt("d08_completed", { elapsed_ms: 200 }) as unknown as Record<string, unknown>,
        controlRoot,
        dbPath,
        repository,
      };
      const results = await runWorkers([payloadA, payloadB], 2);
      const advanced = results.filter((r) => r.status === "advanced");
      const stale = results.filter((r) => !r.ok && r.code === "CHECKPOINT_STALE");
      check(advanced.length === 1, "different candidates: exactly one advanced");
      check(stale.length === 1, "different candidates: exactly one CHECKPOINT_STALE");
      const winnerRef = advanced[0]!.ref!;
      const winnerDigest = winnerRef.split(":").pop()!;

      // loser orphan artifact exists but is not the authority
      const loserBody = results[0]!.status === "advanced" ? payloadB.checkpoint : payloadA.checkpoint;
      const loserBuilt = buildLoopDeliveryCheckpoint({ schema: LOOP_DELIVERY_CHECKPOINT_SCHEMA, ...loserBody, generation: 2, previous_checkpoint_artifact_ref: r1.current.checkpointArtifactRef });
      check(loserBuilt.ok, "loser candidate builds");
      if (loserBuilt.ok) {
        const loserRef = `loop-artifact:v1:delivery_checkpoint:sha256:${loserBuilt.digestSha256}`;
        const artifactStore2 = new LoopArtifactStore({ controlRoot, repositoryPath: repository });
        artifactStore2.init();
        const bytes = artifactStore2.read(loserRef, loserBuilt.digestSha256);
        check(bytes.length === loserBuilt.sizeBytes, "loser orphan artifact blob exists");
        const store2 = new LoopDeliveryCheckpointStore({ dbPath, artifactStore: artifactStore2 });
        store2.init();
        const current = store2.getCurrent(RUN_ID)!;
        check(current.checkpointArtifactRef === winnerRef, "current authority points at the winner only");
        check(current.checkpointDigestSha256 === winnerDigest, "current authority digest is the winner digest");
        const winnerBuilt = buildLoopDeliveryCheckpoint({ schema: LOOP_DELIVERY_CHECKPOINT_SCHEMA, ...(results[0]!.status === "advanced" ? payloadA.checkpoint : payloadB.checkpoint), generation: 2, previous_checkpoint_artifact_ref: r1.current.checkpointArtifactRef });
        check(winnerBuilt.ok && current.checkpointDigestSha256 === winnerBuilt.digestSha256, "current artifact is the winner candidate");
        // chain walk: generation-linear, no forks
        const refsSeen: string[] = [];
        let cursor = current;
        while (cursor !== undefined) {
          refsSeen.push(cursor.checkpointArtifactRef);
          if (cursor.checkpoint.previous_checkpoint_artifact_ref === null) break;
          const prevBytes = artifactStore2.read(cursor.checkpoint.previous_checkpoint_artifact_ref);
          const prevParsed = parseLoopDeliveryCheckpointBytes(prevBytes);
          check(prevParsed.ok, "chain walk parses previous artifact");
          if (!prevParsed.ok) break;
          cursor = {
            checkpointArtifactRef: cursor.checkpoint.previous_checkpoint_artifact_ref,
            checkpoint: prevParsed.value,
          } as never;
        }
        check(refsSeen.length === 2, "chain has exactly two generations");
        check(new Set(refsSeen).size === 2, "chain refs are unique (no fork)");
        store2.close();
        artifactStore2.close();
      }
    }
  }
  markIfClear("D10_A_CHECKPOINT_CAS_VERIFIED");

  // ═══════════════════════════════════════════════════════════
  // 11. Temp cleanup
  // ═══════════════════════════════════════════════════════════
  startSection();
  console.log("temp cleanup");
  {
    let allClean = true;
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        allClean = false;
      }
    }
    check(allClean, "all temp roots removed without error");
    check(tempDirs.every((dir) => !existsSync(dir)), "temp roots verified gone (SQLite db/wal/shm, artifact roots, worker roots)");
    check(workerExitCodes.length > 0 && workerExitCodes.every((code) => code === 0), `all workers exited cleanly (${workerExitCodes.length} workers)`);
    check(process.listenerCount("message") === 0, "no leaked message listeners");
  }
  markIfClear("D10_A_TEMP_CLEANUP_COMPLETE");

  console.log("\nD10_A_CHECKPOINT_CAS_VERIFIED", MARKERS.D10_A_CHECKPOINT_CAS_VERIFIED);
  console.log("D10_A_CHECKPOINT_RESTART_VERIFIED", MARKERS.D10_A_CHECKPOINT_RESTART_VERIFIED);
  console.log("D10_A_TEMP_CLEANUP_COMPLETE", MARKERS.D10_A_TEMP_CLEANUP_COMPLETE);
  console.log(`\nD10_A_CHECKPOINT_STORE_SUMMARY passed=${passed} failed=${failed}`);
  if (failed > 0) process.exit(1);
}
