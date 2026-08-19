// LOOP Run Store — Cross-Process Concurrency Tests (LOOP-DELIVERY-01)
// ===================================================================
// Real independent Node/tsx child processes racing on one SQLite file.
// Deterministic snapshot-isolation check included. No network, no Agent.

import { fork, type ChildProcess } from "node:child_process";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  LoopRunJournalError,
  type LoopRunEvent,
  type LoopRunIdentity,
} from "../core/loop-executor-types";
import { LoopRunStore } from "../core/loop-run-store";

const TS = "2026-07-26T00:00:00.000Z";

function makeIdentity(o?: Partial<LoopRunIdentity>): LoopRunIdentity {
  return Object.freeze({
    runId: "run-001",
    requirementId: "req-001",
    repository: "shaoyang01/target-repo",
    repositoryPath: "/tmp/loop-conc/target-repo",
    baseBranch: "main",
    expectedBaseSha: "a".repeat(40),
    taskBranch: "codex/loop-conc-run-001",
    controlRoot: "/tmp/loop-conc/control",
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
    createdAt: o.createdAt ?? "2026-07-26T00:00:02.000Z",
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

type WorkerPayload =
  | { action: "create"; identity: LoopRunIdentity; runId?: undefined }
  | { action: "append"; event: LoopRunEvent };

function workerMain(): void {
  const dbPath = process.env.LOOP_DB!;
  const payload = JSON.parse(process.env.LOOP_PAYLOAD!) as WorkerPayload & { busyTimeoutMs?: number };
  const send = (result: unknown): void => {
    if (process.send) process.send(result);
  };
  try {
    const store = new LoopRunStore(dbPath, payload.busyTimeoutMs !== undefined ? { busyTimeoutMs: payload.busyTimeoutMs } : undefined);
    store.init();
    if (payload.action === "create") {
      const identity = (payload as { identity: LoopRunIdentity }).identity;
      store.createRun(identity);
    } else {
      const event = (payload as { event: LoopRunEvent }).event;
      store.appendEvent(event);
    }
    store.close();
    send({ ok: true, code: "ok" });
  } catch (error) {
    if (error instanceof LoopRunJournalError) {
      send({ ok: false, code: error.code, message: error.message });
    } else {
      send({ ok: false, code: "NOT_JOURNAL_ERROR", message: String(error) });
    }
  }
  process.exit(0);
}

type WorkerResult = { ok: boolean; code: string; message?: string };

function runWorkers(dbPath: string, payloads: Array<Record<string, unknown>>, count: number): Promise<WorkerResult[]> {
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
          LOOP_WORKER: "1",
          LOOP_DB: dbPath,
          LOOP_PAYLOAD: JSON.stringify(payloads[index % payloads.length]),
        },
        execArgv: ["--import", "tsx"],
        silent: true,
      });
      workers.push(child);
      child.on("message", (message) => {
        if ((message as { ready?: boolean }).ready === true) {
          ready += 1;
          if (ready === count) {
            for (const worker of workers) worker.send({ go: true });
          }
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
        if (code !== 0 && results[index] === undefined) {
          results[index] = { ok: false, code: `EXIT_${code}` };
          finished += 1;
          if (finished === count) {
            clearTimeout(watchdog);
            resolve(results);
          }
        }
      });
      child.send({ prepare: true });
    }
  });
}

// Worker-side ready/go handshake: workers signal ready immediately after boot;
// parent sends go; workers then run the payload. To keep it simple the worker
// waits for the go message before executing.
if (process.env.LOOP_WORKER === "1") {
  process.on("message", (message) => {
    if ((message as { go?: boolean }).go === true) {
      workerMain();
    }
  });
  if (process.send) process.send({ ready: true });
} else {
  main();
}

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

function openStore(dbPath: string, options?: { busyTimeoutMs?: number }): LoopRunStore {
  const store = new LoopRunStore(dbPath, options);
  store.init();
  return store;
}

async function main(): Promise<void> {
  console.log("LOOP Run Concurrency Tests (Delivery-01)\n");

  const tempRoot = mkdtempSync(join(tmpdir(), "loop-d01-conc-"));
  try {
    // ── 1. concurrent same-identity create ──
    console.log("concurrent same identity create");
    {
      const dbPath = join(tempRoot, "c1.db");
      const identity = makeIdentity();
      const payloads = [0, 1, 2, 3].map(() => ({ action: "create", identity, busyTimeoutMs: 5000 }));
      const results = await runWorkers(dbPath, payloads, 4);
      assert(results.every((result) => result.code === "ok"), "all four same-identity creates succeed");
      const store = openStore(dbPath);
      const snapshot = store.getSnapshot("run-001")!;
      assert(snapshot.events.length === 1 && snapshot.events[0]!.kind === "run_created", "exactly one run_created event after race");
      assert(snapshot.state.lastSequence === 1, "one run after same-identity race");
      store.close();
    }

    // ── 2. concurrent conflicting identity create ──
    console.log("concurrent conflicting identity create");
    {
      const dbPath = join(tempRoot, "c2.db");
      const identityA = makeIdentity();
      const identityB = makeIdentity({ requirementId: "req-other", expectedBaseSha: "b".repeat(40) });
      const payloads = [
        { action: "create", identity: identityA, busyTimeoutMs: 5000 },
        { action: "create", identity: identityA, busyTimeoutMs: 5000 },
        { action: "create", identity: identityB, busyTimeoutMs: 5000 },
        { action: "create", identity: identityB, busyTimeoutMs: 5000 },
      ];
      const results = await runWorkers(dbPath, payloads, 4);
      const okCount = results.filter((result) => result.code === "ok").length;
      const conflictCount = results.filter((result) => result.code === "RUN_ID_CONFLICT").length;
      assert(okCount === 2, `exactly two same-identity creates succeed (got ${okCount})`);
      assert(conflictCount === 2, `exactly two RUN_ID_CONFLICT results (got ${conflictCount})`);
      const store = openStore(dbPath);
      assert(store.getSnapshot("run-001")!.events.length === 1, "conflicting race leaves exactly one run_created event");
      store.close();
    }

    // ── 3. concurrent exact duplicate event ──
    console.log("concurrent exact duplicate event");
    {
      const dbPath = join(tempRoot, "c3.db");
      const seed = openStore(dbPath);
      seed.createRun(makeIdentity());
      seed.close();
      const event = makeEvent({ sequence: 2, kind: "run_started" });
      const payloads = [0, 1, 2, 3].map(() => ({ action: "append", event, busyTimeoutMs: 5000 }));
      const results = await runWorkers(dbPath, payloads, 4);
      assert(results.every((result) => result.code === "ok"), "all exact duplicate appends succeed");
      const store = openStore(dbPath);
      const snapshot = store.getSnapshot("run-001")!;
      assert(snapshot.events.length === 2, "duplicate event written exactly once");
      assert(snapshot.state.lastSequence === 2 && snapshot.state.status === "running", "state consistent after duplicate race");
      store.close();
    }

    // ── 4. concurrent same eventId different content ──
    console.log("concurrent same eventId different content");
    {
      const dbPath = join(tempRoot, "c4.db");
      const seed = openStore(dbPath);
      seed.createRun(makeIdentity());
      seed.close();
      const digests = ["c", "d", "e", "f"];
      const payloads = digests.map((letter) => ({
        action: "append",
        event: makeEvent({ sequence: 2, kind: "run_started", outputDigest: letter.repeat(64) }), busyTimeoutMs: 5000,
      }));
      const results = await runWorkers(dbPath, payloads, 4);
      const okCount = results.filter((result) => result.code === "ok").length;
      const conflictCount = results.filter((result) => result.code === "EVENT_ID_CONFLICT").length;
      assert(okCount === 1, `exactly one writer wins (got ${okCount})`);
      assert(conflictCount === 3, `exactly three EVENT_ID_CONFLICT results (got ${conflictCount})`);
      const store = openStore(dbPath);
      assert(store.getSnapshot("run-001")!.events.length === 2, "one event persisted after eventId race");
      store.close();
    }

    // ── 5. concurrent same sequence different eventId ──
    console.log("concurrent same sequence different eventId");
    {
      const dbPath = join(tempRoot, "c5.db");
      const seed = openStore(dbPath);
      seed.createRun(makeIdentity());
      seed.close();
      const payloads = [0, 1, 2, 3].map((index) => ({
        action: "append",
        event: makeEvent({ sequence: 2, kind: "run_started", eventId: `run-001:2:run_started:v${index}` }), busyTimeoutMs: 5000,
      }));
      const results = await runWorkers(dbPath, payloads, 4);
      const okCount = results.filter((result) => result.code === "ok").length;
      const conflictCount = results.filter((result) => result.code === "EVENT_SEQUENCE_CONFLICT").length;
      assert(okCount === 1, `exactly one writer wins sequence (got ${okCount})`);
      assert(conflictCount === 3, `exactly three EVENT_SEQUENCE_CONFLICT results (got ${conflictCount})`);
      const store = openStore(dbPath);
      assert(store.getSnapshot("run-001")!.events.length === 2, "one event persisted after sequence race");
      store.close();
    }

    // ── 6. busy timeout → STORE_BUSY ──
    console.log("busy timeout");
    {
      const dbPath = join(tempRoot, "c6.db");
      const seed = openStore(dbPath);
      seed.createRun(makeIdentity());
      seed.close();
      const raw = new Database(dbPath);
      raw.pragma("journal_mode = WAL");
      raw.prepare("BEGIN IMMEDIATE").run();
      const payloads = [
        { action: "append", event: makeEvent({ sequence: 2, kind: "run_started" }), busyTimeoutMs: 1 },
      ];
      const results = await runWorkers(dbPath, payloads, 1);
      raw.prepare("ROLLBACK").run();
      raw.close();
      assert(results[0]!.code === "STORE_BUSY", `short busy timeout returns STORE_BUSY (got ${results[0]!.code})`);
      assert(
        results[0]!.message === undefined || (results[0]!.message!.length <= 256 && !/[\x00-\x1f\x7f]/.test(results[0]!.message!)),
        "STORE_BUSY message bounded and clean",
      );
      assert(
        results[0]!.message === undefined || !results[0]!.message!.toLowerCase().includes("sqlite"),
        "no raw sqlite text in STORE_BUSY message",
      );
      const store = openStore(dbPath);
      assert(store.getSnapshot("run-001")!.events.length === 1, "busy failure left no partial write");
      store.close();
    }

    // ── 7. journal error shapes across races ──
    console.log("journal error shapes");
    {
      const dbPath = join(tempRoot, "c7.db");
      const seed = openStore(dbPath);
      seed.createRun(makeIdentity());
      seed.close();
      const payloads = [0, 1].map((index) => ({
        action: "append",
        event: makeEvent({ sequence: 2, kind: "run_started", eventId: `run-001:2:run_started:v${index}` }), busyTimeoutMs: 5000,
      }));
      const results = await runWorkers(dbPath, payloads, 2);
      for (const result of results) {
        assert(
          ["ok", "EVENT_SEQUENCE_CONFLICT"].includes(result.code),
          `race result is a typed journal code (got ${result.code})`,
        );
        if (result.message !== undefined) {
          assert(result.message.length <= 256 && !/[\x00-\x1f\x7f]/.test(result.message), "race error message bounded and clean");
        }
      }
      const store = openStore(dbPath);
      const snapshot = store.getSnapshot("run-001")!;
      assert(snapshot.events.length === 2, "race winner persisted exactly one event");
      assert(snapshot.state.lastSequence === 2, "post-race database replays cleanly");
      store.close();
    }

    // ── 8. deterministic snapshot isolation ──
    console.log("deterministic snapshot isolation");
    {
      const dbPath = join(tempRoot, "c8.db");
      const identity = makeIdentity();
      const writer = openStore(dbPath);
      writer.createRun(identity);
      const reader = openStore(dbPath);
      const readerDb = (reader as unknown as { db: Database.Database }).db;
      const originalPrepare = readerDb.prepare.bind(readerDb);
      let injected: boolean = false;
      (readerDb as { prepare: typeof originalPrepare }).prepare = ((sql: string, ...args: unknown[]) => {
        if (!injected && typeof sql === "string" && sql.includes("FROM loop_stage_states")) {
          injected = true;
          // A writer commits a legal event after the reader's first run-row
          // read but before its subsequent stage/event reads — all inside the
          // reader's single read transaction.
          writer.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
        }
        return originalPrepare(sql, ...args as []);
      }) as typeof originalPrepare;
      try {
        const snapshot = reader.getSnapshot("run-001")!;
        assert(injected, "writer commit was injected mid-read");
        assert(snapshot.state.lastSequence === 1, "reader still sees the old consistent run state");
        assert(snapshot.events.length === 1, "reader still sees the old consistent event list");
      } finally {
        (readerDb as { prepare: typeof originalPrepare }).prepare = originalPrepare;
      }
      const after = reader.getSnapshot("run-001")!;
      assert(after.state.lastSequence === 2 && after.events.length === 2, "fresh snapshot after restore sees the committed event");
      reader.close();
      writer.close();
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
