// LOOP Artifact Store — Tests (LOOP-DELIVERY-01)
// ===============================================
// Content-addressed immutable artifact store tests, Run/Event linkage
// integration, and real concurrent put via child processes.

import { fork, type ChildProcess } from "node:child_process";
import Database from "better-sqlite3";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  LoopArtifactStore,
  LoopArtifactStoreError,
  type LoopArtifactKind,
} from "../core/loop-artifact-store";
import { LoopRunJournalError, type LoopRunEvent, type LoopRunIdentity } from "../core/loop-executor-types";
import { LoopRunStore } from "../core/loop-run-store";

const TS = "2026-07-26T00:00:00.000Z";

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

function expectThrow(code: string, fn: () => unknown, message: string): void {
  try {
    fn();
    assert(false, `${message} (no error thrown)`);
  } catch (error) {
    const actual = error instanceof LoopArtifactStoreError || error instanceof LoopRunJournalError ? error.code : "NOT_JOURNAL_ERROR";
    assert(actual === code, `${message} (got ${actual})`);
  }
}

function makeIdentity(o?: Partial<LoopRunIdentity>): LoopRunIdentity {
  return Object.freeze({
    runId: "run-001",
    requirementId: "req-001",
    repository: "shaoyang01/target-repo",
    repositoryPath: "/tmp/loop-art/target-repo",
    baseBranch: "main",
    expectedBaseSha: "a".repeat(40),
    taskBranch: "codex/loop-art-run-001",
    controlRoot: "/tmp/loop-art/control",
    createdAt: TS,
    ...o,
  });
}

function makeEvent(o: Partial<LoopRunEvent> & Pick<LoopRunEvent, "sequence" | "kind">): LoopRunEvent {
  const stageLevel = o.kind.startsWith("stage_");
  return Object.freeze({
    eventId: o.eventId ?? `run-001:${o.sequence}:${o.kind}${o.stage ? `:${o.stage}` : ""}`,
    runId: "run-001",
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
  });
}

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full));
    else out.push(full);
  }
  return out;
}

function workerMain(): void {
  const store = new LoopArtifactStore({
    controlRoot: process.env.LOOP_CONTROL_ROOT!,
    repositoryPath: process.env.LOOP_REPOSITORY!,
  });
  store.init();
  const descriptor = store.put(process.env.LOOP_KIND as LoopArtifactKind, process.env.LOOP_CONTENT!);
  store.close();
  if (process.send) {
    process.send({ ok: true, artifactRef: descriptor.artifactRef, digest: descriptor.digest, sizeBytes: descriptor.sizeBytes });
  }
  process.exit(0);
}

if (process.env.LOOP_WORKER === "1") {
  process.on("message", (message) => {
    if ((message as { go?: boolean }).go === true) workerMain();
  });
  if (process.send) process.send({ ready: true });
} else {
  main();
}

type WorkerResult = { ok: boolean; artifactRef?: string; digest?: string; sizeBytes?: number };

function runConcurrentPuts(controlRoot: string, repository: string, kind: string, content: string, count: number): Promise<WorkerResult[]> {
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
    }, 120_000);
    for (let index = 0; index < count; index += 1) {
      const child = fork(__filename, [], {
        env: {
          ...process.env,
          LOOP_WORKER: "1",
          LOOP_CONTROL_ROOT: controlRoot,
          LOOP_REPOSITORY: repository,
          LOOP_KIND: kind,
          LOOP_CONTENT: content,
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
        if (code !== 0 && results[index] === undefined) {
          results[index] = { ok: false };
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

async function main(): Promise<void> {
  console.log("LOOP Artifact Store Tests (Delivery-01)\n");

  const tempRoot = mkdtempSync(join(tmpdir(), "loop-d01-art-"));
  try {
    const repository = join(tempRoot, "repo");
    mkdirSync(repository, { recursive: true });
    const controlRoot = join(tempRoot, "control");

    // ── constructor and options validation ──
    console.log("constructor and options validation");
    expectThrow("INVALID_INPUT", () => new LoopArtifactStore(null as never), "null options rejected");
    expectThrow("INVALID_INPUT", () => new LoopArtifactStore({ controlRoot: "", repositoryPath: repository }), "empty controlRoot rejected");
    expectThrow("INVALID_INPUT", () => new LoopArtifactStore({ controlRoot: "relative", repositoryPath: repository }), "relative controlRoot rejected");
    expectThrow("INVALID_INPUT", () => new LoopArtifactStore({ controlRoot, repositoryPath: "relative" }), "relative repositoryPath rejected");
    expectThrow("INVALID_INPUT", () => new LoopArtifactStore({ controlRoot, repositoryPath: repository, maxArtifactBytes: 0 }), "maxArtifactBytes 0 rejected");
    expectThrow("INVALID_INPUT", () => new LoopArtifactStore({ controlRoot, repositoryPath: repository, maxArtifactBytes: 16_777_217 }), "maxArtifactBytes above bound rejected");
    expectThrow("INVALID_INPUT", () => new LoopArtifactStore({ controlRoot, repositoryPath: repository, maxArtifactBytes: 1.5 }), "non-integer maxArtifactBytes rejected");

    // ── init lifecycle and containment ──
    console.log("init lifecycle and containment");
    {
      const store = new LoopArtifactStore({ controlRoot, repositoryPath: repository });
      expectThrow("ARTIFACT_STORE_CLOSED", () => store.put("code_patch", "x"), "put before init rejected");
      expectThrow("ARTIFACT_STORE_CLOSED", () => store.read("loop-artifact:v1:code_patch:sha256:" + "a".repeat(64)), "read before init rejected");
      store.init();
      assert(true, "init succeeds with valid options");
      expectThrow("ARTIFACT_STORE_CLOSED", () => store.init(), "double init rejected");
      store.close();
      expectThrow("ARTIFACT_STORE_CLOSED", () => store.put("code_patch", "x"), "put after close rejected");
      store.close();
      assert(true, "close idempotent");
      expectThrow("ARTIFACT_STORE_CLOSED", () => store.init(), "re-init after close rejected");
    }
    {
      const missing = new LoopArtifactStore({ controlRoot, repositoryPath: join(tempRoot, "missing-repo") });
      expectThrow("INVALID_INPUT", () => missing.init(), "missing repository rejected");
      const same = new LoopArtifactStore({ controlRoot: repository, repositoryPath: repository });
      expectThrow("INVALID_INPUT", () => same.init(), "controlRoot == repository rejected");
      const contains = new LoopArtifactStore({ controlRoot: join(tempRoot, "control-parent"), repositoryPath: join(tempRoot, "control-parent", "repo") });
      expectThrow("INVALID_INPUT", () => contains.init(), "controlRoot containing repository rejected");
      const contained = new LoopArtifactStore({ controlRoot: join(repository, "control-inside"), repositoryPath: repository });
      expectThrow("INVALID_INPUT", () => contained.init(), "repository containing controlRoot rejected");
      // artifact root symlink
      const symControl = join(tempRoot, "control-symlink");
      mkdirSync(join(symControl, "artifacts"), { recursive: true });
      symlinkSync(join(tempRoot, "outside-target"), join(symControl, "artifacts", "v1"), "dir");
      const symStore = new LoopArtifactStore({ controlRoot: symControl, repositoryPath: repository });
      expectThrow("ARTIFACT_CORRUPT", () => symStore.init(), "artifact root symlink rejected");
    }

    // ── put/read basics ──
    console.log("put/read basics");
    const store = new LoopArtifactStore({ controlRoot, repositoryPath: repository });
    store.init();
    {
      expectThrow("INVALID_INPUT", () => store.put("bogus_kind" as never, "x"), "invalid kind rejected");
      expectThrow("INVALID_INPUT", () => store.put("code_patch", 42 as never), "non-string/buffer content rejected");
      const small = new LoopArtifactStore({ controlRoot: join(tempRoot, "control-small"), repositoryPath: repository, maxArtifactBytes: 4 });
      small.init();
      expectThrow("ARTIFACT_TOO_LARGE", () => small.put("code_patch", "12345"), "oversized content rejected");
      small.close();

      const descriptor = store.put("code_patch", "diff --git a/x.ts b/x.ts\n+fixed\n");
      assert(descriptor.kind === "code_patch", "descriptor kind");
      assert(descriptor.artifactRef === `loop-artifact:v1:code_patch:sha256:${descriptor.digest}`, "artifactRef canonical format");
      assert(/^[0-9a-f]{64}$/.test(descriptor.digest), "digest is lowercase sha256");
      assert(descriptor.sizeBytes === "diff --git a/x.ts b/x.ts\n+fixed\n".length, "descriptor size");
      const bytes = store.read(descriptor.artifactRef);
      assert(bytes.toString("utf8") === "diff --git a/x.ts b/x.ts\n+fixed\n", "string put/read round-trip UTF-8");
      const verified = store.read(descriptor.artifactRef, descriptor.digest);
      assert(verified.equals(bytes), "read with expected digest returns same bytes");
      expectThrow("ARTIFACT_DIGEST_MISMATCH", () => store.read(descriptor.artifactRef, "b".repeat(64)), "expected digest mismatch rejected");
      expectThrow("ARTIFACT_NOT_FOUND", () => store.read(`loop-artifact:v1:code_patch:sha256:${"b".repeat(64)}`, "b".repeat(64)), "valid-format unknown reference returns ARTIFACT_NOT_FOUND");
      expectThrow("INVALID_INPUT", () => store.read("not-a-ref"), "invalid artifactRef rejected");
      expectThrow("INVALID_INPUT", () => store.read(descriptor.artifactRef, "ZZZ"), "invalid expectedDigest format rejected");
      expectThrow("ARTIFACT_NOT_FOUND", () => store.read(`loop-artifact:v1:test_summary:sha256:${"b".repeat(64)}`), "missing blob returns ARTIFACT_NOT_FOUND");

      const binary = new Uint8Array([0, 1, 2, 255, 254, 128]);
      const binDescriptor = store.put("test_summary", binary);
      const binBytes = store.read(binDescriptor.artifactRef);
      assert(binBytes.length === 6 && binBytes[3] === 255 && binBytes[5] === 128, "Uint8Array exact bytes preserved");

      // final mode 0600
      const shardDir = join(controlRoot, "artifacts", "v1", "code_patch", descriptor.digest.slice(0, 2));
      const finalPath = join(shardDir, `${descriptor.digest}.blob`);
      const mode = lstatSync(finalPath).mode & 0o777;
      assert(mode === 0o600, `final blob mode 0600 (got ${mode.toString(8)})`);

      // exact idempotent put keeps mtime
      const mtimeBefore = lstatSync(finalPath).mtimeMs;
      const again = store.put("code_patch", "diff --git a/x.ts b/x.ts\n+fixed\n");
      assert(again.artifactRef === descriptor.artifactRef && again.digest === descriptor.digest, "exact idempotent put returns same descriptor");
      assert(lstatSync(finalPath).mtimeMs === mtimeBefore, "idempotent put does not change mtime");

      // tampered blob → corrupt
      writeFileSync(finalPath, "tampered");
      expectThrow("ARTIFACT_CORRUPT", () => store.read(descriptor.artifactRef), "tampered blob rejected");
      rmSync(finalPath);

      // existing final directory → corrupt
      mkdirSync(finalPath, { recursive: true });
      expectThrow("ARTIFACT_CORRUPT", () => store.put("code_patch", "diff --git a/x.ts b/x.ts\n+fixed\n"), "existing final directory rejected");
      rmSync(finalPath, { recursive: true, force: true });

      // shard symlink rejected
      rmSync(join(controlRoot, "artifacts", "v1", "code_patch"), { recursive: true, force: true });
      mkdirSync(join(tempRoot, "outside-shard"), { recursive: true });
      symlinkSync(join(tempRoot, "outside-shard"), join(controlRoot, "artifacts", "v1", "code_patch"), "dir");
      expectThrow("ARTIFACT_CORRUPT", () => store.put("code_patch", "fresh"), "shard symlink rejected");
      rmSync(join(controlRoot, "artifacts", "v1", "code_patch"), { recursive: true, force: true });

      // final symlink rejected on read
      const linkDescriptor = store.put("review_summary", "review-ok");
      const linkPath = join(controlRoot, "artifacts", "v1", "review_summary", linkDescriptor.digest.slice(0, 2), `${linkDescriptor.digest}.blob`);
      rmSync(linkPath);
      symlinkSync("/etc/hostname", linkPath);
      expectThrow("ARTIFACT_CORRUPT", () => store.read(linkDescriptor.artifactRef), "final symlink rejected on read");
      rmSync(linkPath);
    }

    // ── orphan temp and restart ──
    console.log("orphan temp and restart");
    {
      const descriptor = store.put("delivery_result", "delivered");
      const shardDir = join(controlRoot, "artifacts", "v1", "delivery_result", descriptor.digest.slice(0, 2));
      const orphanPath = join(shardDir, `.${descriptor.digest}.999999.orphan.tmp`);
      writeFileSync(orphanPath, "orphan");
      rmSync(join(shardDir, `${descriptor.digest}.blob`));
      const recovered = store.put("delivery_result", "delivered");
      assert(recovered.artifactRef === descriptor.artifactRef, "orphan temp does not block republish");
      assert(existsSync(join(shardDir, `${descriptor.digest}.blob`)), "final blob republished despite orphan");
      const files = readdirSync(shardDir).filter((name) => name.endsWith(".tmp"));
      assert(files.length === 1 && files[0] === `.${descriptor.digest}.999999.orphan.tmp`, "only the original orphan temp remains (not adopted as artifact)");
      rmSync(orphanPath);

      // restart read with a new instance
      const storeRestart = new LoopArtifactStore({ controlRoot, repositoryPath: repository });
      storeRestart.init();
      const bytes = storeRestart.read(descriptor.artifactRef, descriptor.digest);
      assert(bytes.toString("utf8") === "delivered", "restart read with new instance succeeds");
      storeRestart.close();
    }

    // ── concurrent same-content put ──
    console.log("concurrent same-content put");
    {
      const results = await runConcurrentPuts(controlRoot, repository, "workspace_metadata", "concurrent-content", 3);
      assert(results.every((result) => result.ok === true), "all concurrent same-content puts succeed");
      const refs = new Set(results.map((result) => result.artifactRef));
      assert(refs.size === 1, "all concurrent descriptors identical");
      const ref = results[0]!.artifactRef!;
      const digest = ref.split(":").pop()!;
      const shardDir = join(controlRoot, "artifacts", "v1", "workspace_metadata", digest.slice(0, 2));
      const blobs = readdirSync(shardDir).filter((name) => name.endsWith(".blob"));
      assert(blobs.length === 1, "exactly one final blob after concurrent put");
      const temps = readdirSync(shardDir).filter((name) => name.endsWith(".tmp"));
      assert(temps.length === 0, "loser temp cleaned after concurrent put");
    }

    // ── Run/Event/Artifact linkage integration ──
    console.log("Run/Event/Artifact linkage");
    {
      const integrationControl = join(tempRoot, "control-int");
      const artifactStore = new LoopArtifactStore({ controlRoot: integrationControl, repositoryPath: repository });
      artifactStore.init();
      const descriptor = artifactStore.put("code_patch", "diff --git a/src/main.ts b/src/main.ts\n+patched\n");

      const runDbPath = join(integrationControl, "journal", "run.db");
      const runStore = new LoopRunStore(runDbPath);
      runStore.init();
      runStore.createRun(makeIdentity());
      runStore.appendEvent(makeEvent({ sequence: 2, kind: "run_started" }));
      runStore.appendEvent(makeEvent({
        sequence: 3,
        kind: "stage_started",
        stage: "prepare_workspace",
        attempt: 1,
      }));
      runStore.appendEvent(makeEvent({
        sequence: 4,
        kind: "stage_succeeded",
        stage: "prepare_workspace",
        attempt: 1,
      }));
      runStore.appendEvent(makeEvent({
        sequence: 5,
        kind: "stage_started",
        stage: "generate_patch",
        attempt: 1,
      }));
      runStore.appendEvent(makeEvent({
        sequence: 6,
        kind: "stage_succeeded",
        stage: "generate_patch",
        attempt: 1,
        outputArtifactRef: descriptor.artifactRef,
        outputDigest: descriptor.digest,
      }));
      runStore.close();
      artifactStore.close();

      // fresh instances after process restart
      const runStore2 = new LoopRunStore(runDbPath);
      runStore2.init();
      const snapshot = runStore2.getSnapshot("run-001")!;
      const linkageEvent = snapshot.events.find((event) => event.outputArtifactRef !== null)!;
      assert(linkageEvent.outputArtifactRef === descriptor.artifactRef, "event carries artifactRef after restart");
      assert(linkageEvent.outputDigest === descriptor.digest, "event carries outputDigest after restart");
      const artifactStore2 = new LoopArtifactStore({ controlRoot: integrationControl, repositoryPath: repository });
      artifactStore2.init();
      const bytes = artifactStore2.read(linkageEvent.outputArtifactRef!, linkageEvent.outputDigest!);
      assert(bytes.toString("utf8") === "diff --git a/src/main.ts b/src/main.ts\n+patched\n", "artifact bytes recovered via event linkage");
      artifactStore2.close();
      runStore2.close();

      // SQLite schema has no artifact-content columns
      const db = new Database(runDbPath, { readonly: true });
      const columns = ["loop_runs", "loop_stage_states", "loop_events"].flatMap(
        (table) => (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name),
      );
      const badColumn = columns.find((name) => /content|payload|body|blob|patch_text|raw_/i.test(name));
      assert(badColumn === undefined, "SQLite schema has no artifact-content columns");
      db.close();
    }

    // ── repository has no blobs/temp/db residue ──
    console.log("repository residue check");
    {
      const repoFiles = listFilesRecursive(repository);
      const residue = repoFiles.find((file) => /\.(blob|tmp|db|db-wal|db-shm|wal|shm)$/.test(file));
      assert(residue === undefined, "repository directory has no blob/temp/sqlite residue");
      assert(existsSync(join(controlRoot, "artifacts", "v1")), "artifact root lives under controlRoot outside repository");
    }

    store.close();
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
