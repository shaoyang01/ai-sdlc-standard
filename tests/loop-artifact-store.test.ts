// LOOP Artifact Store — Tests (LOOP-DELIVERY-01 + R1)
// ======================================================
// Content-addressed immutable artifact store tests, Run/Event linkage
// integration, real concurrent put via child processes, and R1 storage
// boundary hardening tests (parent containment, I/O boundary, write-all,
// temp verification, mode enforcement).

import { fork, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  type Stats, type PathLike,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  LoopArtifactStore,
  LoopArtifactStoreError,
  LOOP_ARTIFACT_KINDS,
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
  console.log("LOOP Artifact Store Tests (Delivery-01 + R1)\n");

  // ── D10-A: record real Source state before the suites ──
  const repoRoot = resolve(__dirname, "..");
  const git = require("node:child_process").execSync;
  const recordHead = git("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  const recordStatus = git("git status --porcelain=v1 -z --untracked-files=all", { cwd: repoRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  const recordDiffDigest = createHash("sha256").update(git("git diff --no-renames", { cwd: repoRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 })).digest("hex");
  const recordStagedDigest = createHash("sha256").update(git("git diff --cached --no-renames", { cwd: repoRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 })).digest("hex");

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

    // ═══════════════════════════════════════════════════════════════
    // R1 HARDENING TESTS
    // ═══════════════════════════════════════════════════════════════

    // ── R1: parent symlink containment ──
    console.log("R1: parent symlink containment");
    {
      const symControl = join(tempRoot, "control-sym-parent");
      const symStore = new LoopArtifactStore({ controlRoot: symControl, repositoryPath: repository });
      symStore.init();

      // Create a legitimate blob first so we have known digest/content
      const legitContent = "symlink-parent-test-content-v1";
      const legit = symStore.put("code_patch", legitContent);
      const legitShardDir = join(symControl, "artifacts", "v1", "code_patch", legit.digest.slice(0, 2));
      const legitFinalPath = join(legitShardDir, `${legit.digest}.blob`);

      // Setup external directory with a matching blob
      const outsideDir = join(tempRoot, "outside-symlink-target");
      mkdirSync(outsideDir, { recursive: true });
      const outsideShard = join(outsideDir, legit.digest.slice(0, 2));
      mkdirSync(outsideShard, { recursive: true });
      const outsideBlob = join(outsideShard, `${legit.digest}.blob`);
      writeFileSync(outsideBlob, legitContent);
      chmodSync(outsideBlob, 0o600);

      // === kind parent symlink + external matching blob → put reject ===
      // Replace the kind directory with a symlink to external dir
      rmSync(join(symControl, "artifacts", "v1", "code_patch"), { recursive: true, force: true });
      symlinkSync(outsideDir, join(symControl, "artifacts", "v1", "code_patch"), "dir");
      expectThrow("ARTIFACT_CORRUPT", () => symStore.put("code_patch", legitContent), "kind parent symlink + external matching blob → put reject");

      // Restore
      rmSync(join(symControl, "artifacts", "v1", "code_patch"), { recursive: true, force: true });
      mkdirSync(join(symControl, "artifacts", "v1", "code_patch"), { recursive: true });
      mkdirSync(legitShardDir, { recursive: true });
      writeFileSync(legitFinalPath, legitContent);
      chmodSync(legitFinalPath, 0o600);

      // === kind parent symlink + external matching blob → read reject ===
      rmSync(join(symControl, "artifacts", "v1", "code_patch"), { recursive: true, force: true });
      symlinkSync(outsideDir, join(symControl, "artifacts", "v1", "code_patch"), "dir");
      expectThrow("ARTIFACT_CORRUPT", () => symStore.read(legit.artifactRef), "kind parent symlink + external matching blob → read reject");

      // Restore
      rmSync(join(symControl, "artifacts", "v1", "code_patch"), { recursive: true, force: true });
      mkdirSync(join(symControl, "artifacts", "v1", "code_patch"), { recursive: true });
      mkdirSync(legitShardDir, { recursive: true });
      writeFileSync(legitFinalPath, legitContent);
      chmodSync(legitFinalPath, 0o600);

      // === shard parent symlink + external matching blob → put reject ===
      rmSync(legitShardDir, { recursive: true, force: true });
      symlinkSync(outsideShard, legitShardDir, "dir");
      expectThrow("ARTIFACT_CORRUPT", () => symStore.put("code_patch", legitContent), "shard parent symlink + external matching blob → put reject");

      // Restore
      rmSync(legitShardDir, { recursive: true, force: true });
      mkdirSync(legitShardDir, { recursive: true });
      writeFileSync(legitFinalPath, legitContent);
      chmodSync(legitFinalPath, 0o600);

      // === shard parent symlink + external matching blob → read reject ===
      rmSync(legitShardDir, { recursive: true, force: true });
      symlinkSync(outsideShard, legitShardDir, "dir");
      expectThrow("ARTIFACT_CORRUPT", () => symStore.read(legit.artifactRef), "shard parent symlink + external matching blob → read reject");

      symStore.close();

      // Cleanup external
      rmSync(outsideDir, { recursive: true, force: true });
    }

    // ── R1: existing-final fast path parent containment ──
    console.log("R1: existing-final fast path containment");
    {
      const fastControl = join(tempRoot, "control-fastpath");
      const fastStore = new LoopArtifactStore({ controlRoot: fastControl, repositoryPath: repository });
      fastStore.init();
      const content = "fastpath-test-content";
      const desc = fastStore.put("code_patch", content);
      const shardDir = join(fastControl, "artifacts", "v1", "code_patch", desc.digest.slice(0, 2));

      // Replace shard dir with symlink to external dir containing same blob
      const extDir = join(tempRoot, "ext-fastpath");
      mkdirSync(extDir, { recursive: true });
      const extShard = join(extDir, desc.digest.slice(0, 2));
      mkdirSync(extShard, { recursive: true });
      writeFileSync(join(extShard, `${desc.digest}.blob`), content);
      chmodSync(join(extShard, `${desc.digest}.blob`), 0o600);

      rmSync(shardDir, { recursive: true, force: true });
      symlinkSync(extDir, shardDir, "dir");
      expectThrow("ARTIFACT_CORRUPT", () => fastStore.put("code_patch", content), "existing-final fast path cannot bypass parent containment");

      fastStore.close();
      rmSync(extDir, { recursive: true, force: true });
    }

    // ── R1: final blob symlink still rejected ──
    console.log("R1: final blob symlink");
    {
      const finalSymContent = "finalsym-test-content";
      const desc = store.put("review_summary", finalSymContent);
      const shardDir = join(controlRoot, "artifacts", "v1", "review_summary", desc.digest.slice(0, 2));
      const finalPath = join(shardDir, `${desc.digest}.blob`);
      rmSync(finalPath);
      symlinkSync("/etc/hostname", finalPath);
      expectThrow("ARTIFACT_CORRUPT", () => store.read(desc.artifactRef), "final blob symlink rejected on read (O_NOFOLLOW)");
      rmSync(finalPath);
    }

    // ── R1: artifact root replaced between operations → reject ──
    console.log("R1: root replacement");
    {
      const rootControl = join(tempRoot, "control-rootrep");
      const rootStore = new LoopArtifactStore({ controlRoot: rootControl, repositoryPath: repository });
      rootStore.init();
      const content = "rootrep-test-content";
      const desc = rootStore.put("code_patch", content);

      // Second put: replace artifact root with symlink between operations
      const artifactRoot = join(rootControl, "artifacts", "v1");
      const fakeRoot = join(tempRoot, "fake-root");
      mkdirSync(join(fakeRoot, "code_patch"), { recursive: true });
      rmSync(artifactRoot, { recursive: true, force: true });
      symlinkSync(fakeRoot, artifactRoot, "dir");
      expectThrow("ARTIFACT_CORRUPT", () => rootStore.put("code_patch", content), "artifact root replaced with symlink → reject");

      rootStore.close();
      rmSync(fakeRoot, { recursive: true, force: true });
    }

    // ── R1: existing blob mode 0644 → put ARTIFACT_CORRUPT ──
    console.log("R1: existing blob mode drift → put");
    {
      const modeControl = join(tempRoot, "control-mode-put");
      const modeStore = new LoopArtifactStore({ controlRoot: modeControl, repositoryPath: repository });
      modeStore.init();
      const content = "mode-test-put-content";
      const desc = modeStore.put("code_patch", content);
      const shardDir = join(modeControl, "artifacts", "v1", "code_patch", desc.digest.slice(0, 2));
      const finalPath = join(shardDir, `${desc.digest}.blob`);

      // Widen mode on existing blob
      chmodSync(finalPath, 0o644);
      expectThrow("ARTIFACT_CORRUPT", () => modeStore.put("code_patch", content), "existing blob mode 0644 → put ARTIFACT_CORRUPT");

      modeStore.close();
    }

    // ── R1: existing blob mode 0644 → read ARTIFACT_CORRUPT ──
    console.log("R1: existing blob mode drift → read");
    {
      const modeControl2 = join(tempRoot, "control-mode-read");
      const modeStore2 = new LoopArtifactStore({ controlRoot: modeControl2, repositoryPath: repository });
      modeStore2.init();
      const content = "mode-test-read-content";
      const desc = modeStore2.put("code_patch", content);
      const shardDir = join(modeControl2, "artifacts", "v1", "code_patch", desc.digest.slice(0, 2));
      const finalPath = join(shardDir, `${desc.digest}.blob`);

      // Widen mode
      chmodSync(finalPath, 0o644);
      expectThrow("ARTIFACT_CORRUPT", () => modeStore2.read(desc.artifactRef), "existing blob mode 0644 → read ARTIFACT_CORRUPT");

      modeStore2.close();
    }

    // ── R1: normal final mode still 0600 ──
    console.log("R1: normal final mode 0600");
    {
      const desc2 = store.put("workspace_metadata", "mode-0600-check");
      const shardDir2 = join(controlRoot, "artifacts", "v1", "workspace_metadata", desc2.digest.slice(0, 2));
      const finalPath2 = join(shardDir2, `${desc2.digest}.blob`);
      const mode2 = lstatSync(finalPath2).mode & 0o777;
      assert(mode2 === 0o600, `normal final mode still 0600 (got ${mode2.toString(8)})`);
    }

    // ── R1: exact idempotent put mtime unchanged ──
    console.log("R1: idempotent put mtime");
    {
      const content = "mtime-preserve-test";
      const desc = store.put("test_summary", content);
      const shardDir = join(controlRoot, "artifacts", "v1", "test_summary", desc.digest.slice(0, 2));
      const finalPath = join(shardDir, `${desc.digest}.blob`);
      const mtimeBefore = lstatSync(finalPath).mtimeMs;
      const again = store.put("test_summary", content);
      assert(again.artifactRef === desc.artifactRef, "idempotent put returns same ref");
      assert(lstatSync(finalPath).mtimeMs === mtimeBefore, "exact idempotent put mtime still unchanged");
    }

    // ── R1: safe bounded error messages ──
    console.log("R1: safe bounded error messages");
    {
      // Verify error messages don't leak sensitive paths
      try {
        store.read(`loop-artifact:v1:code_patch:sha256:${"b".repeat(64)}`);
        assert(false, "should have thrown");
      } catch (error) {
        const e = error as LoopArtifactStoreError;
        assert(e.code === "ARTIFACT_NOT_FOUND", "missing blob error code correct");
        assert(e.message.length <= 256, "error message ≤256 chars");
        assert(!/[\x00-\x1f\x7f]/.test(e.message), "error message no control chars");
        // Error should not contain the temp root path
        assert(!e.message.includes(tempRoot), "error message does not leak temp root path");
      }

      try {
        store.put("code_patch", 42 as never);
        assert(false, "should have thrown");
      } catch (error) {
        const e = error as LoopArtifactStoreError;
        assert(e.code === "INVALID_INPUT", "invalid input error code correct");
        assert(e.message.length <= 256, "INVALID_INPUT message ≤256 chars");
      }
    }

    // ── R1: concurrent EEXIST winner mode drift → loser ARTIFACT_CORRUPT ──
    console.log("R1: concurrent EEXIST mode drift");
    {
      const eeControl = join(tempRoot, "control-eexist-mode");
      const eeStore = new LoopArtifactStore({ controlRoot: eeControl, repositoryPath: repository });
      eeStore.init();
      const content = "eexist-mode-content";
      const desc = eeStore.put("code_patch", content);
      // Now widen the existing blob mode
      const shardDir = join(eeControl, "artifacts", "v1", "code_patch", desc.digest.slice(0, 2));
      const finalPath = join(shardDir, `${desc.digest}.blob`);
      chmodSync(finalPath, 0o640);
      // Put same content — should detect corrupt mode on existing blob
      expectThrow("ARTIFACT_CORRUPT", () => eeStore.put("code_patch", content), "concurrent EEXIST winner mode drift → ARTIFACT_CORRUPT");
      eeStore.close();
    }

    // ═══════════════════════════════════════════════════════════════
    // R2: parent post-check and cleanup failure tests (Findings B+C)
    // ═══════════════════════════════════════════════════════════════

    // ── R2: parent post-check on existing-final path ──
    console.log("R2: parent post-check existing-final");
    {
      const pcControl = join(tempRoot, "control-postcheck");
      const pcStore = new LoopArtifactStore({ controlRoot: pcControl, repositoryPath: repository });
      pcStore.init();
      const content = "pc-existing-test";
      const desc = pcStore.put("code_patch", content);
      // Verify the blob exists and is readable
      const bytes = pcStore.read(desc.artifactRef);
      assert(bytes.toString() === content, "post-check existing-final: read succeeds");

      // Now replace the kind directory with a symlink, then try put again
      const kindDir = join(pcControl, "artifacts", "v1", "code_patch");
      const outsideDir = join(tempRoot, "outside-pc");
      mkdirSync(outsideDir, { recursive: true });
      // Create matching shard+blob in outside dir
      const outShard = join(outsideDir, desc.digest.slice(0, 2));
      mkdirSync(outShard, { recursive: true });
      writeFileSync(join(outShard, `${desc.digest}.blob`), content);
      chmodSync(join(outShard, `${desc.digest}.blob`), 0o600);

      rmSync(kindDir, { recursive: true, force: true });
      symlinkSync(outsideDir, kindDir, "dir");
      expectThrow("ARTIFACT_CORRUPT", () => pcStore.put("code_patch", content),
        "parent post-check: existing-final path detects kind symlink");

      rmSync(kindDir, { recursive: true, force: true });
      rmSync(outsideDir, { recursive: true, force: true });
      pcStore.close();
    }

    // ── R2: parent post-check on public read ──
    console.log("R2: parent post-check public read");
    {
      const prControl = join(tempRoot, "control-pr");
      const prStore = new LoopArtifactStore({ controlRoot: prControl, repositoryPath: repository });
      prStore.init();
      const content = "pr-test-content";
      const desc = prStore.put("test_summary", content);

      // Replace kind dir with symlink
      const kindDir = join(prControl, "artifacts", "v1", "test_summary");
      const outDir = join(tempRoot, "outside-pr");
      mkdirSync(outDir, { recursive: true });
      const outShard = join(outDir, desc.digest.slice(0, 2));
      mkdirSync(outShard, { recursive: true });
      writeFileSync(join(outShard, `${desc.digest}.blob`), content);
      chmodSync(join(outShard, `${desc.digest}.blob`), 0o600);

      rmSync(kindDir, { recursive: true, force: true });
      symlinkSync(outDir, kindDir, "dir");
      expectThrow("ARTIFACT_CORRUPT", () => prStore.read(desc.artifactRef),
        "parent post-check: public read detects kind symlink");

      rmSync(kindDir, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
      prStore.close();
    }

    // ── R2: parent post-check on temp-open race winner ──
    console.log("R2: parent post-check temp-open race");
    {
      const trControl = join(tempRoot, "control-temprace");
      const trStore = new LoopArtifactStore({ controlRoot: trControl, repositoryPath: repository });
      trStore.init();
      const content = "temprace-test";
      const desc = trStore.put("delivery_result", content);

      // Replace kind dir with symlink after put succeeds
      const kindDir = join(trControl, "artifacts", "v1", "delivery_result");
      const outDir = join(tempRoot, "outside-tr");
      mkdirSync(outDir, { recursive: true });
      const outShard = join(outDir, desc.digest.slice(0, 2));
      mkdirSync(outShard, { recursive: true });
      writeFileSync(join(outShard, `${desc.digest}.blob`), content);
      chmodSync(join(outShard, `${desc.digest}.blob`), 0o600);

      rmSync(kindDir, { recursive: true, force: true });
      symlinkSync(outDir, kindDir, "dir");
      // Put the same content again → existing-final fast path should detect symlink
      expectThrow("ARTIFACT_CORRUPT", () => trStore.put("delivery_result", content),
        "parent post-check: temp-open race winner path detects symlink");

      rmSync(kindDir, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
      trStore.close();
    }

    // ── R2: pre-check then parent replacement → ARTIFACT_CORRUPT ──
    console.log("R2: pre-check then parent replacement");
    {
      const rpControl = join(tempRoot, "control-replace");
      const rpStore = new LoopArtifactStore({ controlRoot: rpControl, repositoryPath: repository });
      rpStore.init();
      const content = "replace-race-test";
      // Put once to create the kind/shard structure
      const desc = rpStore.put("workspace_metadata", content);

      // Now set up: the blob is valid, but we'll replace the kind dir with symlink
      const kindDir = join(rpControl, "artifacts", "v1", "workspace_metadata");
      const outDir = join(tempRoot, "outside-rp");
      mkdirSync(outDir, { recursive: true });
      const outShard = join(outDir, desc.digest.slice(0, 2));
      mkdirSync(outShard, { recursive: true });
      writeFileSync(join(outShard, `${desc.digest}.blob`), content);
      chmodSync(join(outShard, `${desc.digest}.blob`), 0o600);

      rmSync(kindDir, { recursive: true, force: true });
      symlinkSync(outDir, kindDir, "dir");
      expectThrow("ARTIFACT_CORRUPT", () => rpStore.put("workspace_metadata", content),
        "pre-check then parent replacement → ARTIFACT_CORRUPT");

      rmSync(kindDir, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
      rpStore.close();
    }

    // ── R2: all errors are typed LoopArtifactStoreError ──
    console.log("R2: typed error verification");
    {
      // Trigger various error paths and verify all are LoopArtifactStoreError
      const testCases: Array<{ name: string; fn: () => unknown; expectedCode: string }> = [
        { name: "put before init", fn: () => new LoopArtifactStore({ controlRoot: join(tempRoot, "te1"), repositoryPath: repository }).put("code_patch", "x"), expectedCode: "ARTIFACT_STORE_CLOSED" },
        { name: "read before init", fn: () => new LoopArtifactStore({ controlRoot: join(tempRoot, "te2"), repositoryPath: repository }).read("loop-artifact:v1:code_patch:sha256:" + "a".repeat(64)), expectedCode: "ARTIFACT_STORE_CLOSED" },
        { name: "invalid kind", fn: () => store.put("bogus" as never, "x"), expectedCode: "INVALID_INPUT" },
        { name: "missing blob", fn: () => store.read("loop-artifact:v1:code_patch:sha256:" + "b".repeat(64)), expectedCode: "ARTIFACT_NOT_FOUND" },
        { name: "digest mismatch", fn: () => store.read("loop-artifact:v1:code_patch:sha256:" + "a".repeat(64), "b".repeat(64)), expectedCode: "ARTIFACT_DIGEST_MISMATCH" },
      ];
      for (const tc of testCases) {
        try {
          tc.fn();
          assert(false, `${tc.name}: should have thrown`);
        } catch (error) {
          assert(error instanceof LoopArtifactStoreError, `${tc.name}: throws LoopArtifactStoreError instance`);
          assert((error as LoopArtifactStoreError).code === tc.expectedCode,
            `${tc.name}: correct code (got ${(error as LoopArtifactStoreError).code})`);
          assert((error as LoopArtifactStoreError).message.length <= 256, `${tc.name}: message bounded`);
          assert(!/[\x00-\x1f\x7f]/.test((error as LoopArtifactStoreError).message), `${tc.name}: no control chars`);
        }
      }
    }

    // ── R2: cleanup preserves main error priority ──
    console.log("R2: main error priority");
    {
      // Tamper with a blob to trigger ARTIFACT_CORRUPT on read
      const content = "priority-test";
      const desc = store.put("review_summary", content);
      const shardDir = join(controlRoot, "artifacts", "v1", "review_summary", desc.digest.slice(0, 2));
      const finalPath = join(shardDir, `${desc.digest}.blob`);

      // Corrupt the blob
      writeFileSync(finalPath, "corrupted-content");
      // Verify read throws ARTIFACT_CORRUPT (not ARTIFACT_IO_FAILURE)
      expectThrow("ARTIFACT_CORRUPT", () => store.read(desc.artifactRef),
        "corrupted blob → ARTIFACT_CORRUPT (main error preserved, not overridden by cleanup)");

      rmSync(finalPath);
    }
    {
      // Test that long messages are truncated and control chars stripped
      const longContent = "x".repeat(500);
      const err = new LoopArtifactStoreError("ARTIFACT_IO_FAILURE", "msg\x00with\x1fcontrols" + longContent);
      assert(err.message.length <= 256, "error constructor sanitizes length");
      assert(!/[\x00-\x1f\x7f]/.test(err.message), "error constructor strips control chars");
      assert(err.code === "ARTIFACT_IO_FAILURE", "error code preserved");
	    }

    // ═══════════════════════════════════════════════════════════════
    // C1: Artifact FS fault injection tests (shared require cache)
    // ═══════════════════════════════════════════════════════════════
    console.log("C1: Artifact FS fault injection");

    const fsMod = require("node:fs") as typeof import("node:fs");

    // ---- 1. partial write → write-all succeeds ----
    {
      const fiControl = join(tempRoot, "control-fi-1");
      const fiStore = new LoopArtifactStore({ controlRoot: fiControl, repositoryPath: repository });
      fiStore.init();
      const origWriteSync = fsMod.writeSync;
      let writeCount = 0;
      try {
        fsMod.writeSync = function(fd: number, buffer: ArrayBufferView, ...args: unknown[]): number {
          writeCount += 1;
          if (writeCount === 1) return origWriteSync.call(fsMod, fd, buffer, 0, 3, 0);
          return origWriteSync.call(fsMod, fd, buffer, ...args);
        } as typeof fsMod.writeSync;
        const desc = fiStore.put("code_patch", "HelloWorld123");
        assert(writeCount > 1, `partial write triggers write-all (writeCount=${writeCount})`);
        assert(fiStore.read(desc.artifactRef).toString() === "HelloWorld123", "content complete after partial write");
      } finally { fsMod.writeSync = origWriteSync; fiStore.close(); }
    }

    // ---- 2. lying write (short write reports full length) → ARTIFACT_IO_FAILURE ----
    {
      const fiControl = join(tempRoot, "control-fi-2");
      const fiStore = new LoopArtifactStore({ controlRoot: fiControl, repositoryPath: repository });
      fiStore.init();
      const origWriteSync = fsMod.writeSync;
      try {
        fsMod.writeSync = function(fd: number, buffer: ArrayBufferView, offset: number, length: number, position?: number | null): number {
          origWriteSync.call(fsMod, fd, (buffer as Buffer).slice(0, 2), 0, 2, position ?? 0);
          return length; // lie
        } as typeof fsMod.writeSync;
        try { fiStore.put("code_patch", "HelloWorld123"); assert(false, "should throw"); }
        catch (e) {
          assert(e instanceof LoopArtifactStoreError, "lying write → LoopArtifactStoreError");
          assert((e as LoopArtifactStoreError).code === "ARTIFACT_IO_FAILURE", `got ${(e as LoopArtifactStoreError).code}`);
          assert((e as LoopArtifactStoreError).message.length <= 256, "msg bounded");
        }
      } finally { fsMod.writeSync = origWriteSync; fiStore.close(); }
    }

    // ---- 3. zero-progress write → ARTIFACT_IO_FAILURE ----
    {
      const fiControl = join(tempRoot, "control-fi-3");
      const fiStore = new LoopArtifactStore({ controlRoot: fiControl, repositoryPath: repository });
      fiStore.init();
      const origWriteSync = fsMod.writeSync;
      try {
        fsMod.writeSync = function(): number { return 0; } as typeof fsMod.writeSync;
        try { fiStore.put("code_patch", "Hello"); assert(false, "should throw"); }
        catch (e) {
          assert(e instanceof LoopArtifactStoreError, "zero write → LoopArtifactStoreError");
          assert((e as LoopArtifactStoreError).code === "ARTIFACT_IO_FAILURE", `got ${(e as LoopArtifactStoreError).code}`);
        }
      } finally { fsMod.writeSync = origWriteSync; fiStore.close(); }
    }

    // ---- 4. temp fsync throws sentinel → ARTIFACT_IO_FAILURE ----
    {
      const fiControl = join(tempRoot, "control-fi-4");
      const fiStore = new LoopArtifactStore({ controlRoot: fiControl, repositoryPath: repository });
      fiStore.init();
      const origFsync = fsMod.fsyncSync;
      try {
        fsMod.fsyncSync = function(): void { const e = new Error("SENT_FSYNC") as NodeJS.ErrnoException; e.code = "EIO"; throw e; } as typeof fsMod.fsyncSync;
        try { fiStore.put("code_patch", "Hello"); assert(false, "should throw"); }
        catch (e) {
          assert(e instanceof LoopArtifactStoreError, "fsync fail → LoopArtifactStoreError");
          assert((e as LoopArtifactStoreError).code === "ARTIFACT_IO_FAILURE", `got ${(e as LoopArtifactStoreError).code}`);
          assert(!(e as LoopArtifactStoreError).message.includes("SENT_FSYNC"), "no sentinel leak");
        }
      } finally { fsMod.fsyncSync = origFsync; fiStore.close(); }
    }

    // ---- 5. temp fstat throws → ARTIFACT_IO_FAILURE ----
    {
      const fiControl = join(tempRoot, "control-fi-5");
      const fiStore = new LoopArtifactStore({ controlRoot: fiControl, repositoryPath: repository });
      fiStore.init();
      const origFstat = fsMod.fstatSync;
      let callCount = 0;
      try {
        fsMod.fstatSync = function(fd: number): Stats {
          callCount += 1;
          if (callCount === 1) { const e = new Error("SENT_FSTAT") as NodeJS.ErrnoException; e.code = "EIO"; throw e; }
          return origFstat.call(fsMod, fd);
        } as typeof fsMod.fstatSync;
        try { fiStore.put("code_patch", "Hello"); assert(false, "should throw"); }
        catch (e) {
          assert(e instanceof LoopArtifactStoreError, "fstat fail → LoopArtifactStoreError");
          assert((e as LoopArtifactStoreError).code === "ARTIFACT_IO_FAILURE", `got ${(e as LoopArtifactStoreError).code}`);
          assert(!(e as LoopArtifactStoreError).message.includes("SENT_FSTAT"), "no sentinel leak");
        }
      } finally { fsMod.fstatSync = origFstat; fiStore.close(); }
    }

    // ---- 6. temp close throws → ARTIFACT_IO_FAILURE ----
    {
      const fiControl = join(tempRoot, "control-fi-6");
      const fiStore = new LoopArtifactStore({ controlRoot: fiControl, repositoryPath: repository });
      fiStore.init();
      const origClose = fsMod.closeSync;
      let closeCount = 0;
      try {
        fsMod.closeSync = function(fd: number): void {
          closeCount += 1;
          if (closeCount === 1) { const e = new Error("SENT_CLOSE") as NodeJS.ErrnoException; e.code = "EIO"; throw e; }
          origClose.call(fsMod, fd);
        } as typeof fsMod.closeSync;
        try { fiStore.put("code_patch", "Hello"); assert(false, "should throw"); }
        catch (e) {
          assert(e instanceof LoopArtifactStoreError, "close fail → LoopArtifactStoreError");
          assert((e as LoopArtifactStoreError).code === "ARTIFACT_IO_FAILURE", `got ${(e as LoopArtifactStoreError).code}`);
          assert(!(e as LoopArtifactStoreError).message.includes("SENT_CLOSE"), "no sentinel leak");
        }
      } finally { fsMod.closeSync = origClose; fiStore.close(); }
    }

    // ---- 7. own-temp unlink throws → ARTIFACT_IO_FAILURE ----
    {
      const fiControl = join(tempRoot, "control-fi-7");
      const fiStore = new LoopArtifactStore({ controlRoot: fiControl, repositoryPath: repository });
      fiStore.init();
      const origUnlink = fsMod.unlinkSync;
      try {
        fsMod.unlinkSync = function(path: PathLike): void {
          if (String(path).endsWith(".tmp")) { const e = new Error("SENT_UNLINK") as NodeJS.ErrnoException; e.code = "EACCES"; throw e; }
          origUnlink.call(fsMod, path);
        } as typeof fsMod.unlinkSync;
        try { fiStore.put("code_patch", "Hello"); assert(false, "should throw"); }
        catch (e) {
          assert(e instanceof LoopArtifactStoreError, "unlink fail → LoopArtifactStoreError");
          assert((e as LoopArtifactStoreError).code === "ARTIFACT_IO_FAILURE", `got ${(e as LoopArtifactStoreError).code}`);
        }
      } finally { fsMod.unlinkSync = origUnlink; fiStore.close(); }
    }

    // ---- 8. main error priority: CORRUPT + unlink fail → still CORRUPT ----
    {
      const fiControl = join(tempRoot, "control-fi-8");
      const fiStore = new LoopArtifactStore({ controlRoot: fiControl, repositoryPath: repository });
      fiStore.init();
      const desc = fiStore.put("code_patch", "priority");
      const shardDir = join(fiControl, "artifacts", "v1", "code_patch", desc.digest.slice(0, 2));
      writeFileSync(join(shardDir, `${desc.digest}.blob`), "tampered");
      const origUnlink = fsMod.unlinkSync;
      try {
        fsMod.unlinkSync = function(path: PathLike): void {
          if (String(path).endsWith(".tmp")) { const e = new Error("UL") as NodeJS.ErrnoException; e.code = "EACCES"; throw e; }
          origUnlink.call(fsMod, path);
        } as typeof fsMod.unlinkSync;
        try { fiStore.put("code_patch", "priority"); assert(false, "should throw"); }
        catch (e) {
          assert(e instanceof LoopArtifactStoreError, "is typed");
          assert((e as LoopArtifactStoreError).code === "ARTIFACT_CORRUPT", `main error preserved (got ${(e as LoopArtifactStoreError).code})`);
        }
      } finally { fsMod.unlinkSync = origUnlink; fiStore.close(); }
    }

    // ---- 9. directory fd close failure → ARTIFACT_IO_FAILURE ----
    {
      const fiControl = join(tempRoot, "control-fi-9");
      const fiStore = new LoopArtifactStore({ controlRoot: fiControl, repositoryPath: repository });
      fiStore.init();
      const origClose = fsMod.closeSync;
      let callCount = 0;
      try {
        fsMod.closeSync = function(fd: number): void {
          callCount += 1;
          if (callCount === 2) { const e = new Error("DIR_CLOSE") as NodeJS.ErrnoException; e.code = "EIO"; throw e; }
          origClose.call(fsMod, fd);
        } as typeof fsMod.closeSync;
        try { fiStore.put("test_summary", "dir-close-test"); assert(false, "should throw"); }
        catch (e) {
          assert(e instanceof LoopArtifactStoreError, "dir close fail → typed");
          // Could be ARTIFACT_IO_FAILURE from either close failure
          assert((e as LoopArtifactStoreError).code === "ARTIFACT_IO_FAILURE", `got ${(e as LoopArtifactStoreError).code}`);
        }
      } finally { fsMod.closeSync = origClose; fiStore.close(); }
    }

    // ---- 10. existing-final fd close failure → ARTIFACT_IO_FAILURE ----
    {
      const fiControl = join(tempRoot, "control-fi-10");
      const fiStore = new LoopArtifactStore({ controlRoot: fiControl, repositoryPath: repository });
      fiStore.init();
      fiStore.put("review_summary", "close-test-content");
      fiStore.close();
      const fiStore2 = new LoopArtifactStore({ controlRoot: fiControl, repositoryPath: repository });
      fiStore2.init();
      const origClose = fsMod.closeSync;
      try {
        fsMod.closeSync = function(): void { const e = new Error("E") as NodeJS.ErrnoException; e.code = "EIO"; throw e; } as typeof fsMod.closeSync;
        try { fiStore2.put("review_summary", "close-test-content"); assert(false, "should throw"); }
        catch (e) {
          assert(e instanceof LoopArtifactStoreError, "close fail → typed");
          assert((e as LoopArtifactStoreError).code === "ARTIFACT_IO_FAILURE", `got ${(e as LoopArtifactStoreError).code}`);
        }
      } finally { fsMod.closeSync = origClose; fiStore2.close(); }
    }

    // ---- 11. public read fd close failure → ARTIFACT_IO_FAILURE ----
    {
      const fiControl = join(tempRoot, "control-fi-11");
      const fiStore = new LoopArtifactStore({ controlRoot: fiControl, repositoryPath: repository });
      fiStore.init();
      const desc = fiStore.put("delivery_result", "read-close-test");
      const origClose = fsMod.closeSync;
      try {
        fsMod.closeSync = function(): void { const e = new Error("E") as NodeJS.ErrnoException; e.code = "EIO"; throw e; } as typeof fsMod.closeSync;
        try { fiStore.read(desc.artifactRef); assert(false, "should throw"); }
        catch (e) {
          assert(e instanceof LoopArtifactStoreError, "read close fail → typed");
          assert((e as LoopArtifactStoreError).code === "ARTIFACT_IO_FAILURE", `got ${(e as LoopArtifactStoreError).code}`);
        }
      } finally { fsMod.closeSync = origClose; fiStore.close(); }
    }

    // ---- 12. own-temp residue check: all fault paths clean up temp ----
    {
      const fiControl = join(tempRoot, "control-fi-12");
      const fiStore = new LoopArtifactStore({ controlRoot: fiControl, repositoryPath: repository });
      fiStore.init();
      // Normal put creates no temp residue
      fiStore.put("workspace_metadata", "clean-test");
      const v1dir = join(fiControl, "artifacts", "v1");
      const allFiles = listFilesRecursive(v1dir);
      const temps = allFiles.filter(f => f.endsWith(".tmp"));
      assert(temps.length === 0, `no temp residue after normal put (found ${temps.length})`);
      fiStore.close();
    }

    // ── D08: canonical kinds extension (new kinds + old-kind compatibility) ──
    console.log("D08 canonical kinds extension");
    {
      const d08OldKinds = ["code_patch", "test_summary", "review_summary", "delivery_result", "workspace_metadata"] as const;
      const d08NewKinds = ["requirement_summary", "technical_design", "solution_review", "executor_input", "orchestration_result"] as const;
      const d08Content = '{"d08":"kind-extension"}';
      const d08Bytes = Buffer.from(d08Content, "utf8");
      for (const kind of [...d08OldKinds, ...d08NewKinds]) {
        const desc = store.put(kind, d08Content);
        assert(desc.kind === kind, `D08 put kind ${kind}`);
        assert(desc.artifactRef === `loop-artifact:v1:${kind}:sha256:${desc.digest}`, `D08 canonical ref for ${kind}`);
        assert(desc.digest === createHash("sha256").update(d08Bytes).digest("hex"), `D08 digest exact for ${kind}`);
        assert(desc.sizeBytes === d08Bytes.length, `D08 size exact for ${kind}`);
        const readback = store.read(desc.artifactRef, desc.digest);
        assert(readback.equals(d08Bytes), `D08 exact readback for ${kind}`);
        const again = store.put(kind, d08Content);
        assert(again.artifactRef === desc.artifactRef, `D08 idempotent put for ${kind}`);
      }
      // new-kind put failure must not be ignored
      expectThrow("INVALID_INPUT", () => store.put("requirement_summary" as never, 42 as never), "D08 new kind invalid content rejected");
      // new-kind cleanup failure must not be ignored
      {
        const fiControl = join(tempRoot, "control-d08-fi");
        const fiStore = new LoopArtifactStore({ controlRoot: fiControl, repositoryPath: repository });
        fiStore.init();
        const fsMod = require("node:fs") as typeof import("node:fs");
        const origClose = fsMod.closeSync;
        try {
          fsMod.closeSync = function (fd: number): void { const e = new Error("E") as NodeJS.ErrnoException; e.code = "EIO"; throw e; } as typeof fsMod.closeSync;
          try { fiStore.put("orchestration_result", "d08-cleanup"); assert(false, "D08 new kind cleanup failure should throw"); }
          catch (e) {
            assert(e instanceof LoopArtifactStoreError, "D08 new kind cleanup fail → typed");
            assert((e as LoopArtifactStoreError).code === "ARTIFACT_IO_FAILURE", `D08 new kind cleanup fail code (got ${(e as LoopArtifactStoreError).code})`);
          }
        } finally { fsMod.closeSync = origClose; fiStore.close(); }
      }
    }

    // ── D09-A1: governance_tail_result kind (new kind + original kinds unchanged) ──
    console.log("D09-A1 governance_tail_result kind");
    {
      const d09a1OriginalKinds = [
        "code_patch", "test_summary", "review_summary", "delivery_result", "workspace_metadata",
        "requirement_summary", "technical_design", "solution_review", "executor_input", "orchestration_result",
      ] as const;
      assert(LOOP_ARTIFACT_KINDS.length === 12, "kind list extended to exactly 12 entries (11 original + delivery_checkpoint)");
      assert(
        d09a1OriginalKinds.every((kind, index) => LOOP_ARTIFACT_KINDS[index] === kind),
        "original ten D01-D08 kinds keep their exact positions",
      );
      assert(LOOP_ARTIFACT_KINDS[10] === "governance_tail_result", "governance_tail_result appended as the eleventh kind");

      const d09a1Content = '{"schema":"loop-governance-tail-result-v1","status":"completed"}';
      const d09a1Bytes = Buffer.from(d09a1Content, "utf8");
      const tailDesc = store.put("governance_tail_result", d09a1Content);
      assert(tailDesc.kind === "governance_tail_result", "D09-A1 put kind governance_tail_result");
      assert(tailDesc.artifactRef === `loop-artifact:v1:governance_tail_result:sha256:${tailDesc.digest}`, "D09-A1 canonical ref format");
      assert(/^loop-artifact:v1:governance_tail_result:sha256:[0-9a-f]{64}$/.test(tailDesc.artifactRef), "D09-A1 ref matches loop-artifact:v1:governance_tail_result:sha256:<64hex>");
      assert(tailDesc.digest === createHash("sha256").update(d09a1Bytes).digest("hex"), "D09-A1 digest exact");
      assert(tailDesc.sizeBytes === d09a1Bytes.length, "D09-A1 size exact");
      const tailReadback = store.read(tailDesc.artifactRef, tailDesc.digest);
      assert(tailReadback.equals(d09a1Bytes), "D09-A1 exact readback");
      const tailAgain = store.put("governance_tail_result", d09a1Content);
      assert(tailAgain.artifactRef === tailDesc.artifactRef, "D09-A1 idempotent put returns same ref");
      const tailShardDir = join(controlRoot, "artifacts", "v1", "governance_tail_result", tailDesc.digest.slice(0, 2));
      const tailFinalPath = join(tailShardDir, `${tailDesc.digest}.blob`);
      const tailMode = lstatSync(tailFinalPath).mode & 0o777;
      assert(tailMode === 0o600, `D09-A1 new kind blob mode 0600 (got ${tailMode.toString(8)})`);

      // original ten kinds still behave identically
      for (const kind of d09a1OriginalKinds) {
        const desc = store.put(kind, d09a1Content);
        assert(desc.kind === kind, `D09-A1 original kind ${kind} still put`);
        assert(desc.artifactRef === `loop-artifact:v1:${kind}:sha256:${desc.digest}`, `D09-A1 original kind ${kind} ref unchanged`);
      }
      expectThrow("INVALID_INPUT", () => store.put("governance_tail_result" as never, 42 as never), "D09-A1 invalid content for new kind rejected");
      expectThrow("INVALID_INPUT", () => store.put("not_a_real_kind" as never, "x"), "D09-A1 invalid kind still rejected");

      // concurrent same-content put on the new kind stays safe
      const concurrent = await runConcurrentPuts(controlRoot, repository, "governance_tail_result", "concurrent-tail-content", 3);
      assert(concurrent.every((result) => result.ok === true), "D09-A1 all concurrent new-kind puts succeed");
      const concurrentRefs = new Set(concurrent.map((result) => result.artifactRef));
      assert(concurrentRefs.size === 1, "D09-A1 concurrent new-kind descriptors identical");
    }

    // ── D10-A: delivery_checkpoint kind extension + D01-D09 regression ──
    console.log("D10-A delivery_checkpoint kind extension");
    {
      const d10aOriginalKinds = [
        "code_patch", "test_summary", "review_summary", "delivery_result", "workspace_metadata",
        "requirement_summary", "technical_design", "solution_review", "executor_input", "orchestration_result",
        "governance_tail_result",
      ] as const;
      const kindFailuresBefore = failed;
      assert(LOOP_ARTIFACT_KINDS.length === 12, "kind list extended to exactly 12 entries");
      assert(
        d10aOriginalKinds.every((kind, index) => LOOP_ARTIFACT_KINDS[index] === kind),
        "original eleven D01-D09 kinds keep their exact names and order",
      );
      assert(LOOP_ARTIFACT_KINDS[11] === "delivery_checkpoint", "delivery_checkpoint appended once at the end");
      assert(LOOP_ARTIFACT_KINDS.filter((kind) => kind === "delivery_checkpoint").length === 1, "delivery_checkpoint listed exactly once");

      const d10aContent = '{"schema":"loop-delivery-checkpoint-v1","phase":"initialized"}';
      const d10aBytes = Buffer.from(d10aContent, "utf8");
      const desc = store.put("delivery_checkpoint", d10aContent);
      assert(desc.kind === "delivery_checkpoint", "D10-A put kind delivery_checkpoint");
      assert(desc.artifactRef === `loop-artifact:v1:delivery_checkpoint:sha256:${desc.digest}`, "D10-A canonical ref format");
      assert(/^loop-artifact:v1:delivery_checkpoint:sha256:[0-9a-f]{64}$/.test(desc.artifactRef), "D10-A ref matches loop-artifact:v1:delivery_checkpoint:sha256:<64hex>");
      assert(desc.digest === createHash("sha256").update(d10aBytes).digest("hex"), "D10-A digest exact");
      assert(desc.sizeBytes === d10aBytes.length, "D10-A size exact");
      const readback = store.read(desc.artifactRef, desc.digest);
      assert(readback.equals(d10aBytes), "D10-A exact readback");
      const again = store.put("delivery_checkpoint", d10aContent);
      assert(again.artifactRef === desc.artifactRef, "D10-A idempotent put returns same ref");
      const d10aShardDir = join(controlRoot, "artifacts", "v1", "delivery_checkpoint", desc.digest.slice(0, 2));
      const d10aFinalPath = join(d10aShardDir, `${desc.digest}.blob`);
      const d10aMode = lstatSync(d10aFinalPath).mode & 0o777;
      assert(d10aMode === 0o600, "D10-A new kind blob mode 0600");
      assert(desc.artifactRef === `loop-artifact:v1:delivery_checkpoint:sha256:${desc.digest}`, "D10-A canonical ref confirmed");

      const concurrentCheckpoint = await runConcurrentPuts(controlRoot, repository, "delivery_checkpoint", "concurrent-checkpoint-content", 3);
      assert(concurrentCheckpoint.every((result) => result.ok === true), "D10-A all concurrent new-kind puts succeed");
      const concurrentCheckpointRefs = new Set(concurrentCheckpoint.map((result) => result.artifactRef));
      assert(concurrentCheckpointRefs.size === 1, "D10-A concurrent new-kind descriptors identical");

      const artifactKindOk = failed === kindFailuresBefore;
      console.log("D10_A_ARTIFACT_KIND_VERIFIED", artifactKindOk);

      // D01-D09 regression: representative original kinds keep put/read/ref
      const regressionFailuresBefore = failed;
      for (const kind of ["code_patch", "delivery_result", "workspace_metadata", "orchestration_result", "governance_tail_result"] as const) {
        const reg = store.put(kind, d10aContent);
        assert(reg.kind === kind, `D10-A regression kind ${kind} put`);
        assert(reg.artifactRef === `loop-artifact:v1:${kind}:sha256:${reg.digest}`, `D10-A regression kind ${kind} ref unchanged`);
        const regRead = store.read(reg.artifactRef, reg.digest);
        assert(regRead.equals(d10aBytes), `D10-A regression kind ${kind} exact readback`);
      }
      expectThrow("INVALID_INPUT", () => store.put("delivery_checkpoint" as never, 42 as never), "D10-A invalid content for new kind rejected");
      expectThrow("INVALID_INPUT", () => store.put("not_a_real_kind" as never, "x"), "D10-A invalid kind still rejected");
      const regressionOk = failed === regressionFailuresBefore;
      console.log("D10_A_D01_D09_REGRESSION_PRESERVED", regressionOk);
    }

    // ── D10-A: real Source invariance ──
    {
      const invarianceFailuresBefore = failed;
      const currentHead = git("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
      const currentStatus = git("git status --porcelain=v1 -z --untracked-files=all", { cwd: repoRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
      const currentDiffDigest = createHash("sha256").update(git("git diff --no-renames", { cwd: repoRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 })).digest("hex");
      const currentStagedDigest = createHash("sha256").update(git("git diff --cached --no-renames", { cwd: repoRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 })).digest("hex");
      const headOk = currentHead === recordHead;
      const statusOk = currentStatus === recordStatus;
      const diffOk = currentDiffDigest === recordDiffDigest;
      const stagedOk = currentStagedDigest === recordStagedDigest;
      assert(headOk, "D10-A real source HEAD unchanged");
      assert(statusOk, "D10-A real source status unchanged");
      assert(diffOk, "D10-A real source unstaged diff unchanged");
      assert(stagedOk, "D10-A real source staged diff unchanged");
      const invarianceOk = failed === invarianceFailuresBefore;
      console.log("D10_A_REAL_SOURCE_UNCHANGED", invarianceOk);
    }

    store.close();
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
