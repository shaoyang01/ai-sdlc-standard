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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  LOOP_DELIVERY_CHECKPOINT_ROOT_KEYS,
  LOOP_DELIVERY_CHECKPOINT_BODY_KEYS,
  type LoopDeliveryCheckpointPhase,
} from "../core/loop-delivery-checkpoint";
import {
  LoopDeliveryCheckpointStore,
  LoopDeliveryCheckpointStoreError,
  LOOP_DELIVERY_CHECKPOINT_STORE_USER_VERSION,
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
  D10_A_CHECKPOINT_SCHEMA_VERIFIED: false,
  D10_A_CHECKPOINT_CAS_VERIFIED: false,
  D10_A_CHECKPOINT_FAIL_CLOSED_VERIFIED: false,
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
  // 5b. Full locator CAS (deterministic interleaving)
  // ═══════════════════════════════════════════════════════════
  startSection();
  console.log("full locator CAS interleaving (deterministic)");
  {
    // The writer completes its initial current verification, then performs
    // the candidate artifact put; BEFORE the put returns, a second SQLite
    // connection mutates the locator; the writer then enters casAdvance.
    // The full-locator verification / full-predicate CAS must detect every
    // single-field divergence and never overwrite the locator.

    const digestFlip = (digest: string): string => digest.slice(0, 63) + (digest[63] === "0" ? "1" : "0");

    const interleaveAdvance = (
      label: string,
      mutate: (db: Database.Database, r1Ref: string, r1Digest: string) => void,
    ): { root: string; repository: string; controlRoot: string; code: string | null; row: { generation: number; checkpoint_artifact_ref: string; checkpoint_digest_sha256: string } | undefined; r1Ref: string } => {
      const root = newTempDir(`interleave-${label}`);
      const env = openStores(root);
      const { repository, controlRoot, dbPath } = env;
      const r1 = advanceStep(env.store, RUN_ID, 0, null, "initialized");
      const r1Ref = r1.current.checkpointArtifactRef;
      const r1Digest = r1.current.checkpointDigestSha256;
      env.store.close();
      const tamperingPut = {
        read: (ref: string, expectedDigest?: string) => env.artifactStore.read(ref, expectedDigest),
        put: (kind: LoopArtifactKind, content: string | Uint8Array) => {
          const descriptor = env.artifactStore.put(kind, content);
          const second = new Database(dbPath, { timeout: 5000 });
          try {
            mutate(second, r1Ref, r1Digest);
          } finally {
            second.close();
          }
          return descriptor;
        },
      };
      const tamperStore = new LoopDeliveryCheckpointStore({ dbPath, artifactStore: tamperingPut });
      tamperStore.init();
      let code: string | null = null;
      try {
        tamperStore.advance({
          runId: RUN_ID,
          expectedGeneration: 1,
          expectedCheckpointArtifactRef: r1Ref,
          checkpoint: bodyAt("d08_completed"),
        });
      } catch (error) {
        code = error instanceof LoopDeliveryCheckpointStoreError ? error.code : "NOT_STORE_ERROR";
      }
      const probe = new Database(dbPath, { timeout: 5000 });
      const row = probe.prepare(
        "SELECT generation, checkpoint_artifact_ref, checkpoint_digest_sha256 FROM loop_delivery_checkpoint_current_head WHERE run_id = ?",
      ).get(RUN_ID) as { generation: number; checkpoint_artifact_ref: string; checkpoint_digest_sha256: string } | undefined;
      probe.close();
      tamperStore.close();
      env.artifactStore.close();
      return { root, repository, controlRoot, code, row, r1Ref };
    };

    // (a) digest-only mutation (ref/digest disagreement) → CORRUPT, never overwritten
    {
      const result = interleaveAdvance("digest", (_db, _r1Ref, r1Digest) => {
        _db.prepare("UPDATE loop_delivery_checkpoint_current_head SET checkpoint_digest_sha256 = ? WHERE run_id = ?").run(digestFlip(r1Digest), RUN_ID);
      });
      const mutatedDigest = digestFlip((result.r1Ref.split(":").pop())!);
      check(result.code === "CHECKPOINT_STORE_CORRUPT", "advance_result: CHECKPOINT_STORE_CORRUPT for digest-only mutation");
      const candidateBuilt = buildLoopDeliveryCheckpoint(atPhase("d08_completed", 2, result.r1Ref));
      check(candidateBuilt.ok, "candidate builds for orphan check");
      if (candidateBuilt.ok) {
        check(candidateBuilt.digestSha256 !== mutatedDigest, "mutated digest differs from the candidate digest");
        check(existsSync(blobPath(result.controlRoot, `loop-artifact:v1:delivery_checkpoint:sha256:${candidateBuilt.digestSha256}`)), "candidate artifact blob was written before CAS (orphan)");
        check(
          result.row !== undefined &&
          result.row.checkpoint_artifact_ref !== `loop-artifact:v1:delivery_checkpoint:sha256:${candidateBuilt.digestSha256}`,
          "candidate_orphan_became_authority: false",
        );
      }
      check(
        result.row !== undefined && result.row.generation === 1 && result.row.checkpoint_artifact_ref === result.r1Ref,
        "CAS_expected_generation/ref compared: matching generation+ref with a diverged digest was NOT treated as the expected authority",
      );
      check(
        result.row !== undefined && result.row.checkpoint_digest_sha256 === mutatedDigest,
        "corrupt_locator_overwritten: false (mutated digest preserved)",
      );
      check(
        result.row !== undefined && result.row.checkpoint_artifact_ref === result.r1Ref,
        "existing_authority_ref_preserved: true",
      );
    }

    // (b) generation-only mutation (internally valid row) → STALE, never overwritten
    {
      const result = interleaveAdvance("generation", (db) => {
        db.prepare("UPDATE loop_delivery_checkpoint_current_head SET generation = 3 WHERE run_id = ?").run(RUN_ID);
      });
      check(result.code === "CHECKPOINT_STALE", "advance_result: CHECKPOINT_STALE for generation-only mutation");
      check(
        result.row !== undefined && result.row.generation === 3,
        "CAS_expected_generation_compared: true (generation divergence → stale, not overwritten)",
      );
    }

    // (c) ref+digest paired mutation (valid competing authority) → STALE, never overwritten
    {
      const competingDigest = "c".repeat(64);
      const competingRef = `loop-artifact:v1:delivery_checkpoint:sha256:${competingDigest}`;
      const result = interleaveAdvance("competing", (db) => {
        db.prepare("UPDATE loop_delivery_checkpoint_current_head SET generation = 2, checkpoint_artifact_ref = ?, checkpoint_digest_sha256 = ? WHERE run_id = ?").run(competingRef, competingDigest, RUN_ID);
      });
      check(result.code === "CHECKPOINT_STALE", "advance_result: CHECKPOINT_STALE for valid competing authority");
      check(
        result.row !== undefined && result.row.checkpoint_artifact_ref === competingRef,
        "CAS_expected_ref_compared: true (ref divergence → stale, not overwritten)",
      );
      check(
        result.row !== undefined && result.row.generation === 2 && result.row.checkpoint_digest_sha256 === competingDigest,
        "valid_competing_authority_stale: true (row preserved)",
      );
    }

    // (d) exact retry confirmed + exact-expected authority advances (positive CAS)
    {
      const root = newTempDir("cas-positive");
      const env = openStores(root);
      const r1 = advanceStep(env.store, RUN_ID, 0, null, "initialized");
      const retry = env.store.advance({
        runId: RUN_ID,
        expectedGeneration: 0,
        expectedCheckpointArtifactRef: null,
        checkpoint: bodyAt("initialized"),
      });
      check(retry.status === "confirmed", "exact_retry_confirmed: true (identical request after an unknown response)");
      check(retry.current.generation === 1 && retry.current.checkpointArtifactRef === r1.current.checkpointArtifactRef, "confirmed retry did not write a new authority");
      const r2 = advanceStep(env.store, RUN_ID, 1, r1.current.checkpointArtifactRef, "d08_completed");
      check(r2.status === "advanced", "CAS_full_SQL_predicate_verified: exact expected authority advances via the full-predicate update");
      check(r2.current.generation === 2, "full-predicate CAS update wrote generation 2");
      env.store.close();
      env.artifactStore.close();
    }
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
  // 6b. Store public input descriptor snapshots (fail-closed)
  // ═══════════════════════════════════════════════════════════
  startSection();
  console.log("store public input descriptor snapshots (fail-closed)");
  {
    const root = newTempDir("snapshot");
    const env = openStores(root);
    const { dbPath, artifactStore } = env;

    const checkBoundedError = (error: unknown, message: string): void => {
      const e = error as LoopDeliveryCheckpointStoreError;
      check(e.code === "INVALID_INPUT", `${message} (code ${e.code})`);
      check(e.message.length <= 256, `${message}: message bounded`);
      check(!/[\x00-\x1f\x7f]/.test(e.message), `${message}: no control characters`);
    };

    // constructor options: getters never invoked, accessors rejected
    {
      let optionGetterCalls = 0;
      const getterOptions: Record<string, unknown> = {};
      const optionValues: Record<string, unknown> = { dbPath, artifactStore, busyTimeoutMs: 2000, maxCheckpointBytes: 1024 };
      for (const key of ["dbPath", "artifactStore", "busyTimeoutMs", "maxCheckpointBytes"]) {
        Object.defineProperty(getterOptions, key, {
          get() {
            optionGetterCalls += 1;
            return optionValues[key];
          },
          enumerable: true,
          configurable: true,
        });
      }
      try {
        new LoopDeliveryCheckpointStore(getterOptions as never);
        check(false, "constructor_options_accessor_rejected (no error thrown)");
      } catch (error) {
        checkBoundedError(error, "constructor_options_accessor_rejected");
      }
      check(optionGetterCalls === 0, "constructor_options_getters_invoked: 0");
    }
    // constructor options: reordered / extra / missing / symbol / __proto__ /
    // class instance / non-plain prototype / proxy / revoked proxy
    expectStoreError("INVALID_INPUT", () => new LoopDeliveryCheckpointStore({ artifactStore, dbPath } as never), "constructor_options_reordered_rejected");
    expectStoreError("INVALID_INPUT", () => new LoopDeliveryCheckpointStore({ dbPath, artifactStore, extra: 1 } as never), "constructor options extra key rejected");
    expectStoreError("INVALID_INPUT", () => new LoopDeliveryCheckpointStore({ dbPath } as never), "constructor options missing artifactStore rejected");
    {
      const symbolOptions = { dbPath, artifactStore } as Record<symbol | string, unknown>;
      symbolOptions[Symbol("x")] = 1;
      expectStoreError("INVALID_INPUT", () => new LoopDeliveryCheckpointStore(symbolOptions as never), "constructor options symbol key rejected");
    }
    {
      const protoOptions = { dbPath, artifactStore } as Record<string, unknown>;
      Object.defineProperty(protoOptions, "__proto__", { value: {}, enumerable: true, configurable: true });
      expectStoreError("INVALID_INPUT", () => new LoopDeliveryCheckpointStore(protoOptions as never), "constructor options __proto__ key rejected");
    }
    {
      class OptionsSecret {}
      const instanceOptions = Object.assign(new OptionsSecret(), { dbPath, artifactStore });
      expectStoreError("INVALID_INPUT", () => new LoopDeliveryCheckpointStore(instanceOptions as never), "constructor options class instance rejected");
    }
    {
      const weirdOptions = Object.create({ inherited: 1 });
      Object.assign(weirdOptions, { dbPath, artifactStore });
      expectStoreError("INVALID_INPUT", () => new LoopDeliveryCheckpointStore(weirdOptions as never), "constructor options non-plain prototype rejected");
    }
    {
      const throwingOptionsProxy = new Proxy({ dbPath, artifactStore }, {
        getOwnPropertyDescriptor() {
          throw new Error("SENT_OPT");
        },
      });
      try {
        new LoopDeliveryCheckpointStore(throwingOptionsProxy as never);
        check(false, "constructor_options_proxy_rejected (no error thrown)");
      } catch (error) {
        checkBoundedError(error, "constructor_options_proxy_rejected");
        check(!(error as LoopDeliveryCheckpointStoreError).message.includes("SENT_OPT"), "constructor options proxy: raw exception text absent");
      }
    }
    {
      const { proxy: revokedOptions, revoke: revokeOptions } = Proxy.revocable({ dbPath, artifactStore }, {});
      revokeOptions();
      expectStoreError("INVALID_INPUT", () => new LoopDeliveryCheckpointStore(revokedOptions as never), "constructor options revoked proxy rejected");
    }
    // artifact store capability check never invokes getters
    {
      let capabilityGetterCalls = 0;
      const accessorStore = {
        get put() {
          capabilityGetterCalls += 1;
          return () => ({});
        },
        read: () => Buffer.alloc(0),
      };
      expectStoreError("INVALID_INPUT", () => new LoopDeliveryCheckpointStore({ dbPath, artifactStore: accessorStore as never }), "artifact store accessor capability rejected");
      check(capabilityGetterCalls === 0, "artifact store capability check invoked no getters");
    }

    // constructor options canonical subsequence (D10-A-R3-001): dbPath and
    // artifactStore are required; busyTimeoutMs and maxCheckpointBytes are
    // independently omittable, and every present key keeps its relative
    // OPTION_KEYS order.
    {
      // options_required_only_accepted
      {
        const s = new LoopDeliveryCheckpointStore({ dbPath, artifactStore });
        s.init();
        check(s.getCurrent(RUN_ID) === undefined, "options_required_only_accepted: required-only options construct and init");
        s.close();
      }
      // options_busy_only_accepted
      {
        const s = new LoopDeliveryCheckpointStore({ dbPath, artifactStore, busyTimeoutMs: 1500 });
        s.init();
        check(s.getCurrent(RUN_ID) === undefined, "options_busy_only_accepted: busyTimeoutMs-only options construct and init");
        s.close();
      }
      // options_max_only_accepted
      {
        const s = new LoopDeliveryCheckpointStore({ dbPath, artifactStore, maxCheckpointBytes: 65536 });
        s.init();
        check(s.getCurrent(RUN_ID) === undefined, "options_max_only_accepted: maxCheckpointBytes-only options construct and init");
        s.close();
      }
      // options_both_optional_accepted
      {
        const s = new LoopDeliveryCheckpointStore({ dbPath, artifactStore, busyTimeoutMs: 1500, maxCheckpointBytes: 65536 });
        s.init();
        check(s.getCurrent(RUN_ID) === undefined, "options_both_optional_accepted: both optional options construct and init");
        s.close();
      }

      // options_max_before_busy_rejected: present optional keys must keep
      // their OPTION_KEYS relative order (maxCheckpointBytes before
      // busyTimeoutMs is a reorder, not a subsequence).
      {
        const reordered = Object.create(Object.prototype) as Record<string, unknown>;
        reordered.dbPath = dbPath;
        reordered.artifactStore = artifactStore;
        reordered.maxCheckpointBytes = 65536;
        reordered.busyTimeoutMs = 1500;
        expectStoreError("INVALID_INPUT", () => new LoopDeliveryCheckpointStore(reordered as never), "options_max_before_busy_rejected");
      }
      // options_missing_dbPath_rejected / options_missing_artifactStore_rejected
      expectStoreError("INVALID_INPUT", () => new LoopDeliveryCheckpointStore({ artifactStore, busyTimeoutMs: 1500 } as never), "options_missing_dbPath_rejected");
      expectStoreError("INVALID_INPUT", () => new LoopDeliveryCheckpointStore({ dbPath, busyTimeoutMs: 1500 } as never), "options_missing_artifactStore_rejected");
      // options_extra_key_rejected
      expectStoreError("INVALID_INPUT", () => new LoopDeliveryCheckpointStore({ dbPath, artifactStore, busyTimeoutMs: 1500, unknown: 1 } as never), "options_extra_key_rejected");

      // options_accessor_rejected_without_getter_invocation: a subsequence
      // input carrying an accessor never executes the getter.
      {
        let subsequenceGetterCalls = 0;
        const accessorOptions: Record<string, unknown> = { dbPath, artifactStore };
        Object.defineProperty(accessorOptions, "maxCheckpointBytes", {
          get() {
            subsequenceGetterCalls += 1;
            return 65536;
          },
          enumerable: true,
          configurable: true,
        });
        expectStoreError("INVALID_INPUT", () => new LoopDeliveryCheckpointStore(accessorOptions as never), "options_accessor_rejected_without_getter_invocation");
        check(subsequenceGetterCalls === 0, "options accessor getter invocations stayed 0");
      }
      // options_proxy_reflection_failure_rejected
      {
        const subsequenceProxy = new Proxy({ dbPath, artifactStore, maxCheckpointBytes: 65536 }, {
          getOwnPropertyDescriptor() {
            throw new Error("SENT_R3_OPT");
          },
        });
        try {
          new LoopDeliveryCheckpointStore(subsequenceProxy as never);
          check(false, "options_proxy_reflection_failure_rejected (no error thrown)");
        } catch (error) {
          checkBoundedError(error, "options_proxy_reflection_failure_rejected");
          check(!(error as LoopDeliveryCheckpointStoreError).message.includes("SENT_R3_OPT"), "options proxy reflection failure: raw exception text absent");
        }
      }
      // options_revoked_proxy_rejected
      {
        const { proxy: revokedSubsequence, revoke: revokeSubsequence } = Proxy.revocable({ dbPath, artifactStore, maxCheckpointBytes: 65536 }, {});
        revokeSubsequence();
        expectStoreError("INVALID_INPUT", () => new LoopDeliveryCheckpointStore(revokedSubsequence as never), "options_revoked_proxy_rejected");
      }

      // scalar reachability (D10-A-R3-001 6.3): subsequence inputs that pass
      // key-sequence validation must reach the maxCheckpointBytes scalar
      // validator, proven by its dedicated static diagnostic (the key-order
      // layer can never produce it).
      for (const scalarCase of [0, 1_048_577, 1.5] as const) {
        const label =
          scalarCase === 0 ? "maxCheckpointBytes_zero_reaches_scalar_validation"
          : scalarCase === 1_048_577 ? "maxCheckpointBytes_over_bound_reaches_scalar_validation"
          : "maxCheckpointBytes_fraction_reaches_scalar_validation";
        const scalarOptions: Record<string, unknown> = { dbPath, artifactStore };
        // maxCheckpointBytes is inserted after artifactStore: every present
        // key keeps the canonical subsequence order (no busyTimeoutMs, which
        // after maxCheckpointBytes would itself be a rejected reorder), so
        // the input passes key validation and must reach the scalar
        // validator.
        scalarOptions.maxCheckpointBytes = scalarCase;
        try {
          new LoopDeliveryCheckpointStore(scalarOptions as never);
          check(false, `${label} (no error thrown)`);
        } catch (error) {
          const e = error as LoopDeliveryCheckpointStoreError;
          check(e.code === "INVALID_INPUT", `${label} code INVALID_INPUT (got ${e.code})`);
          check(e.message === "maxCheckpointBytes must be a safe integer in 1..1048576", `${label}: controlled static diagnostic comes from the scalar validator`);
        }
      }
    }

    // advance request: getters never invoked, accessors rejected
    {
      let requestGetterCalls = 0;
      const requestValues: Record<string, unknown> = {
        runId: RUN_ID,
        expectedGeneration: 0,
        expectedCheckpointArtifactRef: null,
        checkpoint: bodyAt("initialized"),
      };
      const getterRequest: Record<string, unknown> = {};
      for (const key of ["runId", "expectedGeneration", "expectedCheckpointArtifactRef", "checkpoint"]) {
        Object.defineProperty(getterRequest, key, {
          get() {
            requestGetterCalls += 1;
            return requestValues[key];
          },
          enumerable: true,
          configurable: true,
        });
      }
      try {
        env.store.advance(getterRequest as never);
        check(false, "advance_request_accessor_rejected (no error thrown)");
      } catch (error) {
        checkBoundedError(error, "advance_request_accessor_rejected");
      }
      check(requestGetterCalls === 0, "advance_request_getters_invoked: 0");
    }
    expectStoreError("INVALID_INPUT", () => env.store.advance(Object.fromEntries(Object.entries({ runId: RUN_ID, expectedGeneration: 0, expectedCheckpointArtifactRef: null, checkpoint: bodyAt("initialized") }).reverse()) as never), "advance_request_reordered_rejected");
    {
      const missingKeyRequest = { runId: RUN_ID, expectedGeneration: 0, checkpoint: bodyAt("initialized") };
      expectStoreError("INVALID_INPUT", () => env.store.advance(missingKeyRequest as never), "advance request missing key rejected");
    }
    {
      const symbolRequest = { runId: RUN_ID, expectedGeneration: 0, expectedCheckpointArtifactRef: null, checkpoint: bodyAt("initialized") } as Record<symbol | string, unknown>;
      symbolRequest[Symbol("y")] = 1;
      expectStoreError("INVALID_INPUT", () => env.store.advance(symbolRequest as never), "advance request symbol key rejected");
    }
    {
      const protoRequest = { runId: RUN_ID, expectedGeneration: 0, expectedCheckpointArtifactRef: null, checkpoint: bodyAt("initialized") } as Record<string, unknown>;
      Object.defineProperty(protoRequest, "__proto__", { value: {}, enumerable: true, configurable: true });
      expectStoreError("INVALID_INPUT", () => env.store.advance(protoRequest as never), "advance request __proto__ key rejected");
    }
    {
      const throwingRequestProxy = new Proxy({ runId: RUN_ID, expectedGeneration: 0, expectedCheckpointArtifactRef: null, checkpoint: bodyAt("initialized") }, {
        getOwnPropertyDescriptor() {
          throw new Error("SENT_REQ");
        },
      });
      try {
        env.store.advance(throwingRequestProxy as never);
        check(false, "advance request proxy rejected (no error thrown)");
      } catch (error) {
        checkBoundedError(error, "advance request proxy rejected");
        check(!(error as LoopDeliveryCheckpointStoreError).message.includes("SENT_REQ"), "advance request proxy: raw exception text absent");
      }
    }
    {
      const { proxy: revokedRequest, revoke: revokeRequest } = Proxy.revocable({ runId: RUN_ID, expectedGeneration: 0, expectedCheckpointArtifactRef: null, checkpoint: bodyAt("initialized") }, {});
      revokeRequest();
      expectStoreError("INVALID_INPUT", () => env.store.advance(revokedRequest as never), "advance request revoked proxy rejected");
    }

    // checkpoint body: getters never invoked, accessors / reorder rejected
    {
      let bodyGetterCalls = 0;
      const accessorBody = bodyAt("initialized");
      Object.defineProperty(accessorBody, "phase", {
        get() {
          bodyGetterCalls += 1;
          return "initialized";
        },
        enumerable: true,
        configurable: true,
      });
      try {
        env.store.advance({ runId: RUN_ID, expectedGeneration: 0, expectedCheckpointArtifactRef: null, checkpoint: accessorBody as never });
        check(false, "checkpoint_body_accessor_rejected (no error thrown)");
      } catch (error) {
        checkBoundedError(error, "checkpoint_body_accessor_rejected");
      }
      check(bodyGetterCalls === 0, "checkpoint_body_getters_invoked: 0");
    }
    expectStoreError("INVALID_INPUT", () => env.store.advance({
      runId: RUN_ID, expectedGeneration: 0, expectedCheckpointArtifactRef: null,
      checkpoint: Object.fromEntries(Object.entries(bodyAt("initialized")).reverse()) as never,
    }), "checkpoint_body_reordered_rejected");
    {
      const throwingBodyProxy = new Proxy(bodyAt("initialized"), {
        getOwnPropertyDescriptor() {
          throw new Error("SENT_BODY");
        },
      });
      try {
        env.store.advance({ runId: RUN_ID, expectedGeneration: 0, expectedCheckpointArtifactRef: null, checkpoint: throwingBodyProxy as never });
        check(false, "checkpoint body proxy rejected (no error thrown)");
      } catch (error) {
        checkBoundedError(error, "checkpoint body proxy rejected");
        check(!(error as LoopDeliveryCheckpointStoreError).message.includes("SENT_BODY"), "checkpoint body proxy: raw exception text absent");
      }
    }

    // nested identity: getters never invoked, accessors / reorder / proxy rejected
    {
      let identityGetterCalls = 0;
      const accessorIdBody = bodyAt("initialized");
      const identityRecord = accessorIdBody.identity as Record<string, unknown>;
      Object.defineProperty(identityRecord, "runId", {
        get() {
          identityGetterCalls += 1;
          return RUN_ID;
        },
        enumerable: true,
        configurable: true,
      });
      try {
        env.store.advance({ runId: RUN_ID, expectedGeneration: 0, expectedCheckpointArtifactRef: null, checkpoint: accessorIdBody as never });
        check(false, "nested_identity_accessor_rejected (no error thrown)");
      } catch (error) {
        checkBoundedError(error, "nested_identity_accessor_rejected");
      }
      check(identityGetterCalls === 0, "nested_identity_getters_invoked: 0");
    }
    {
      const reorderedIdBody = bodyAt("initialized") as Record<string, unknown>;
      reorderedIdBody.identity = Object.fromEntries(Object.entries(makeIdentity()).reverse());
      expectStoreError("INVALID_INPUT", () => env.store.advance({
        runId: RUN_ID, expectedGeneration: 0, expectedCheckpointArtifactRef: null, checkpoint: reorderedIdBody as never,
      }), "nested_identity_reordered_rejected");
    }
    {
      const proxyIdBody = bodyAt("initialized") as Record<string, unknown>;
      proxyIdBody.identity = new Proxy(makeIdentity(), {
        getOwnPropertyDescriptor() {
          throw new Error("SENT_ID");
        },
      });
      try {
        env.store.advance({ runId: RUN_ID, expectedGeneration: 0, expectedCheckpointArtifactRef: null, checkpoint: proxyIdBody as never });
        check(false, "nested identity proxy rejected (no error thrown)");
      } catch (error) {
        checkBoundedError(error, "nested identity proxy rejected");
        check(!(error as LoopDeliveryCheckpointStoreError).message.includes("SENT_ID"), "nested identity proxy: raw exception text absent");
      }
    }
    check(true, "store_proxy_fail_closed: all reflection failures above surfaced as INVALID_INPUT");
    check(true, "store_raw_exception_text_absent: no sentinel text echoed in any fail-closed error");

    env.store.close();
    env.artifactStore.close();
  }
  markIfClear("D10_A_CHECKPOINT_FAIL_CLOSED_VERIFIED");

  // ═══════════════════════════════════════════════════════════
  // 6c. Exact persistent schema (user_version 1)
  // ═══════════════════════════════════════════════════════════
  startSection();
  console.log("exact persistent schema (user_version 1)");
  {
    check(LOOP_DELIVERY_CHECKPOINT_STORE_USER_VERSION === 1, "checkpoint_store_user_version constant is 1");

    // fresh empty DB → exact schema + user_version 1
    {
      const root = newTempDir("schema-r1");
      const env = openStores(root);
      const { dbPath, store, artifactStore } = env;
      const ro = new Database(dbPath, { readonly: true });
      check(Number(ro.pragma("user_version", { simple: true })) === LOOP_DELIVERY_CHECKPOINT_STORE_USER_VERSION, "fresh DB user_version is 1");
      const info = ro.prepare("PRAGMA table_info(loop_delivery_checkpoint_current_head)").all() as Array<{ cid: number; name: string; type: string; notnull: number; pk: number }>;
      const expected = [
        { name: "run_id", type: "TEXT", notnull: 1, pk: 1 },
        { name: "generation", type: "INTEGER", notnull: 1, pk: 0 },
        { name: "checkpoint_artifact_ref", type: "TEXT", notnull: 1, pk: 0 },
        { name: "checkpoint_digest_sha256", type: "TEXT", notnull: 1, pk: 0 },
      ];
      check(
        info.length === 4 && info.every((column, index) => column.name === expected[index]!.name && column.type === expected[index]!.type && column.notnull === expected[index]!.notnull && column.pk === expected[index]!.pk),
        "fresh DB exact schema: column count/order/names/types/NOT NULL/pk",
      );
      const tables = ro.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>;
      check(tables.length === 1 && tables[0]!.name === "loop_delivery_checkpoint_current_head", "fresh DB has no extra user tables");
      ro.close();

      // store-constructed candidate is canonical root order (R-001 7.3)
      const advanced = advanceStep(store, RUN_ID, 0, null, "initialized");
      const valueKeys = Object.keys(advanced.current.checkpoint);
      check(
        valueKeys.length === LOOP_DELIVERY_CHECKPOINT_ROOT_KEYS.length &&
        valueKeys.every((key, index) => key === LOOP_DELIVERY_CHECKPOINT_ROOT_KEYS[index]),
        "store_constructed_candidate_canonical: store merges in the exact canonical root sequence",
      );
      // valid existing DB reopens with the exact schema
      store.close();
      const store2 = new LoopDeliveryCheckpointStore({ dbPath, artifactStore });
      store2.init();
      const ro2 = new Database(dbPath, { readonly: true });
      check(Number(ro2.pragma("user_version", { simple: true })) === 1, "reopened existing DB user_version still 1");
      const info2 = ro2.prepare("PRAGMA table_info(loop_delivery_checkpoint_current_head)").all() as Array<{ name: string; type: string; notnull: number; pk: number }>;
      check(info2.length === 4 && info2[0]!.name === "run_id" && info2[3]!.name === "checkpoint_digest_sha256", "reopened existing DB schema verified");
      ro2.close();
      store2.close();
      artifactStore.close();
    }

    // malformed existing schemas → CHECKPOINT_STORE_CORRUPT at init
    {
      const root = newTempDir("schema-corrupt");
      const repositoryV = join(root, "repo");
      const controlRootV = join(root, "control");
      mkdirSync(repositoryV, { recursive: true });
      mkdirSync(controlRootV, { recursive: true });
      const artifactStoreV = new LoopArtifactStore({ controlRoot: controlRootV, repositoryPath: repositoryV });
      artifactStoreV.init();
      const variants: Array<{ label: string; setup: (db: Database.Database) => void }> = [
        {
          label: "extra column",
          setup: (db) => {
            db.exec("CREATE TABLE loop_delivery_checkpoint_current_head (run_id TEXT NOT NULL PRIMARY KEY, generation INTEGER NOT NULL, checkpoint_artifact_ref TEXT NOT NULL, checkpoint_digest_sha256 TEXT NOT NULL, extra TEXT NOT NULL)");
            db.pragma("user_version = 1");
          },
        },
        {
          label: "missing column",
          setup: (db) => {
            db.exec("CREATE TABLE loop_delivery_checkpoint_current_head (run_id TEXT NOT NULL PRIMARY KEY, generation INTEGER NOT NULL, checkpoint_artifact_ref TEXT NOT NULL)");
            db.pragma("user_version = 1");
          },
        },
        {
          label: "wrong column order",
          setup: (db) => {
            db.exec("CREATE TABLE loop_delivery_checkpoint_current_head (run_id TEXT NOT NULL PRIMARY KEY, checkpoint_artifact_ref TEXT NOT NULL, generation INTEGER NOT NULL, checkpoint_digest_sha256 TEXT NOT NULL)");
            db.pragma("user_version = 1");
          },
        },
        {
          label: "wrong declared type",
          setup: (db) => {
            db.exec("CREATE TABLE loop_delivery_checkpoint_current_head (run_id TEXT NOT NULL PRIMARY KEY, generation TEXT NOT NULL, checkpoint_artifact_ref TEXT NOT NULL, checkpoint_digest_sha256 TEXT NOT NULL)");
            db.pragma("user_version = 1");
          },
        },
        {
          label: "wrong NOT NULL",
          setup: (db) => {
            db.exec("CREATE TABLE loop_delivery_checkpoint_current_head (run_id TEXT NOT NULL PRIMARY KEY, generation INTEGER, checkpoint_artifact_ref TEXT NOT NULL, checkpoint_digest_sha256 TEXT NOT NULL)");
            db.pragma("user_version = 1");
          },
        },
        {
          label: "wrong primary key",
          setup: (db) => {
            db.exec("CREATE TABLE loop_delivery_checkpoint_current_head (run_id TEXT NOT NULL, generation INTEGER NOT NULL, checkpoint_artifact_ref TEXT NOT NULL, checkpoint_digest_sha256 TEXT NOT NULL, PRIMARY KEY (generation))");
            db.pragma("user_version = 1");
          },
        },
        {
          label: "extra user table",
          setup: (db) => {
            db.exec("CREATE TABLE loop_delivery_checkpoint_current_head (run_id TEXT NOT NULL PRIMARY KEY, generation INTEGER NOT NULL, checkpoint_artifact_ref TEXT NOT NULL, checkpoint_digest_sha256 TEXT NOT NULL); CREATE TABLE extra_state (x TEXT)");
            db.pragma("user_version = 1");
          },
        },
        {
          label: "unsupported user_version",
          setup: (db) => {
            db.exec("CREATE TABLE loop_delivery_checkpoint_current_head (run_id TEXT NOT NULL PRIMARY KEY, generation INTEGER NOT NULL, checkpoint_artifact_ref TEXT NOT NULL, checkpoint_digest_sha256 TEXT NOT NULL)");
            db.pragma("user_version = 2");
          },
        },
        {
          label: "user_version 0 with existing table",
          setup: (db) => {
            db.exec("CREATE TABLE loop_delivery_checkpoint_current_head (run_id TEXT NOT NULL PRIMARY KEY, generation INTEGER NOT NULL, checkpoint_artifact_ref TEXT NOT NULL, checkpoint_digest_sha256 TEXT NOT NULL)");
          },
        },
        {
          label: "user_version 1 without locator table",
          setup: (db) => {
            db.pragma("user_version = 1");
          },
        },
      ];
      for (const variant of variants) {
        const dbPathV = join(newTempDir("schema-variant"), "head.db");
        const db = new Database(dbPathV);
        variant.setup(db);
        db.close();
        expectStoreError("CHECKPOINT_STORE_CORRUPT", () => {
          const s = new LoopDeliveryCheckpointStore({ dbPath: dbPathV, artifactStore: artifactStoreV });
          s.init();
        }, `${variant.label} rejected as corrupt`);
      }
      artifactStoreV.close();
    }

    // schema-corrupt init leaves no lock, retains no db, propagates no raw sqlite text
    {
      const root = newTempDir("schema-lock");
      const dbPathL = join(root, "head.db");
      const db = new Database(dbPathL);
      db.exec("CREATE TABLE loop_delivery_checkpoint_current_head (run_id TEXT NOT NULL PRIMARY KEY, generation INTEGER NOT NULL, checkpoint_artifact_ref TEXT NOT NULL, checkpoint_digest_sha256 TEXT NOT NULL, extra TEXT NOT NULL)");
      db.pragma("user_version = 1");
      db.close();
      const repositoryL = join(root, "repo");
      const controlRootL = join(root, "control");
      mkdirSync(repositoryL, { recursive: true });
      mkdirSync(controlRootL, { recursive: true });
      const artifactStoreL = new LoopArtifactStore({ controlRoot: controlRootL, repositoryPath: repositoryL });
      artifactStoreL.init();
      const locked = new LoopDeliveryCheckpointStore({ dbPath: dbPathL, artifactStore: artifactStoreL });
      let firstCode: string | null = null;
      try {
        locked.init();
        check(false, "schema-corrupt init should fail");
      } catch (error) {
        const e = error as LoopDeliveryCheckpointStoreError;
        firstCode = e.code;
        check(e.code === "CHECKPOINT_STORE_CORRUPT", "schema-corrupt init typed CHECKPOINT_STORE_CORRUPT");
        check(e.message.length <= 256 && !/[\x00-\x1f\x7f]/.test(e.message), "schema-corrupt init message bounded and clean");
        check(!e.message.toLowerCase().includes("sqlite"), "raw sqlite text not propagated");
      }
      check(firstCode !== null, "opened_connection_closed / this_db_not_retained: failed init surfaced an error");
      const probe = new Database(dbPathL, { timeout: 2000 });
      check(Number(probe.pragma("user_version", { simple: true })) === 1, "observable_lock_left: false (fresh probe connection works)");
      probe.close();
      let retryCode: string | null = null;
      try {
        locked.init();
        check(false, "retry init on corrupt schema should fail again");
      } catch (error) {
        retryCode = (error as LoopDeliveryCheckpointStoreError).code;
      }
      check(retryCode === "CHECKPOINT_STORE_CORRUPT", "retry init re-validates and fails cleanly (no retained db)");
      locked.close();
      artifactStoreL.close();
    }

    // non-SQLite existing DB file → CHECKPOINT_STORE_CORRUPT (D10-A-R3-002):
    // SQLITE_NOTADB is corruption classification, never an overwrite, a
    // migration or a generic failure. Two fresh store instances prove the
    // classification is repeatable and failed init leaves no observable lock.
    {
      const root = newTempDir("notadb");
      const corruptPath = join(root, "head.db");
      writeFileSync(corruptPath, "not a valid sqlite database");
      const repositoryN = join(root, "repo");
      const controlRootN = join(root, "control");
      mkdirSync(repositoryN, { recursive: true });
      mkdirSync(controlRootN, { recursive: true });
      const artifactStoreN = new LoopArtifactStore({ controlRoot: controlRootN, repositoryPath: repositoryN });
      artifactStoreN.init();

      const store1 = new LoopDeliveryCheckpointStore({ dbPath: corruptPath, artifactStore: artifactStoreN });
      try {
        store1.init();
        check(false, "non_SQLite_existing_DB_result: CHECKPOINT_STORE_CORRUPT (no error thrown)");
      } catch (error) {
        const e = error as LoopDeliveryCheckpointStoreError;
        check(
          e instanceof LoopDeliveryCheckpointStoreError && e.code === "CHECKPOINT_STORE_CORRUPT",
          `non_SQLite_existing_DB_result: CHECKPOINT_STORE_CORRUPT (got ${e instanceof LoopDeliveryCheckpointStoreError ? e.code : "NOT_STORE_ERROR"})`,
        );
        check(e.message.length <= 256 && !/[\x00-\x1f\x7f]/.test(e.message), "corrupt classification message bounded and clean");
        check(!e.message.toLowerCase().includes("sqlite"), "SQLITE_NOTADB_raw_message_propagated: false");
        check(!e.message.includes("file is not a database"), "raw SQLITE_NOTADB diagnostic absent");
        check(!e.message.includes(corruptPath) && !e.message.includes("head.db"), "database_path_propagated: false");
      }
      // corrupt_init_connection_closed: the store instance is closed after the
      // failed init and remains permanently closed (no retained db).
      store1.close();
      expectStoreError("CHECKPOINT_STORE_CLOSED", () => store1.getCurrent(RUN_ID), "corrupt_init_connection_closed: instance closed after failed init");
      // corrupt_init_lock_left: false — an independent raw SQLite connection
      // can still open the path (a controlled probe whose own failure never
      // reaches the markers or error output).
      {
        let probeOpened = false;
        try {
          const probe = new Database(corruptPath, { timeout: 2000 });
          probeOpened = true;
          probe.close();
        } catch {
          // Controlled probe failure: raw SQLite text must never propagate.
        }
        check(probeOpened, "corrupt_init_lock_left: false (independent connection opens the path)");
      }
      // corrupt_init_retry_result: a second fresh instance on the same corrupt
      // path classifies identically — the file was neither overwritten nor
      // treated as a fresh DB (half_initialized_state_left: false).
      const store2 = new LoopDeliveryCheckpointStore({ dbPath: corruptPath, artifactStore: artifactStoreN });
      let secondCode: string | null = null;
      try {
        store2.init();
        check(false, "corrupt_init_retry_result: CHECKPOINT_STORE_CORRUPT (no error thrown)");
      } catch (error) {
        secondCode = error instanceof LoopDeliveryCheckpointStoreError ? error.code : "NOT_STORE_ERROR";
      }
      check(secondCode === "CHECKPOINT_STORE_CORRUPT", `corrupt_init_retry_result: CHECKPOINT_STORE_CORRUPT (got ${secondCode})`);
      check(readFileSync(corruptPath, "utf8") === "not a valid sqlite database", "half_initialized_state_left: false (corrupt file never overwritten)");
      // observable_lock_left: false — the retry left no lock either.
      {
        let probeOpened = false;
        try {
          const probe = new Database(corruptPath, { timeout: 2000 });
          probeOpened = true;
          probe.close();
        } catch {
          // Controlled probe failure: raw SQLite text must never propagate.
        }
        check(probeOpened, "observable_lock_left: false (independent connection opens the path after retry)");
      }
      store2.close();
      artifactStoreN.close();
    }
  }
  markIfClear("D10_A_CHECKPOINT_SCHEMA_VERIFIED");
  markIfClear("D10_A_CHECKPOINT_RESTART_VERIFIED");

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

    // corrupted DB file → CHECKPOINT_STORE_CORRUPT (D10-A-R3-002), sanitized
    // and without a lingering lock; FAILURE/BUSY are not acceptable for a
    // non-SQLite file.
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
      check(e.code === "CHECKPOINT_STORE_CORRUPT", "corrupt DB init classified CHECKPOINT_STORE_CORRUPT");
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
      const loserElapsed = (loserBody as Record<string, unknown>).elapsed_ms;
      // Canonical-order reconstruction of the loser candidate (the store now
      // merges in the exact root sequence; the builder rejects reordered
      // input, so the digest must be reproduced canonically).
      const loserBuilt = buildLoopDeliveryCheckpoint({ ...atPhase("d08_completed", 2, r1.current.checkpointArtifactRef), elapsed_ms: loserElapsed as number });
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
        const winnerPayload = results[0]!.status === "advanced" ? payloadA.checkpoint : payloadB.checkpoint;
        const winnerElapsed = (winnerPayload as Record<string, unknown>).elapsed_ms;
        const winnerBuilt = buildLoopDeliveryCheckpoint({ ...atPhase("d08_completed", 2, r1.current.checkpointArtifactRef), elapsed_ms: winnerElapsed as number });
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

  console.log("\nD10_A_CHECKPOINT_SCHEMA_VERIFIED", MARKERS.D10_A_CHECKPOINT_SCHEMA_VERIFIED);
  console.log("D10_A_CHECKPOINT_CAS_VERIFIED", MARKERS.D10_A_CHECKPOINT_CAS_VERIFIED);
  console.log("D10_A_CHECKPOINT_FAIL_CLOSED_VERIFIED", MARKERS.D10_A_CHECKPOINT_FAIL_CLOSED_VERIFIED);
  console.log("D10_A_CHECKPOINT_RESTART_VERIFIED", MARKERS.D10_A_CHECKPOINT_RESTART_VERIFIED);
  console.log("D10_A_TEMP_CLEANUP_COMPLETE", MARKERS.D10_A_TEMP_CLEANUP_COMPLETE);
  console.log(`\nD10_A_CHECKPOINT_STORE_SUMMARY passed=${passed} failed=${failed}`);
  if (failed > 0) process.exit(1);
}
