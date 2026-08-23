// LOOP Decision Delta Blob Integrity — Tests (Round 3 review F1)
// ==============================================================
// The decision delta of a succeeded formal_verdict is physically bound like
// revision outputs and finding evidence. Error mapping must match
// verifyRevisionBlob / verifyFindingEvidenceBlob exactly:
// - append: missing or digest-drifted blob → ILLEGAL_TRANSITION;
// - append: corrupt blob content → STORE_CORRUPT (not STORE_FAILURE);
// - read (list/snapshot/findLatest/recovery): missing/drifted/corrupt →
//   STORE_CORRUPT (not STORE_FAILURE);
// Regression: ARTIFACT_CORRUPT previously fell through to the generic
// storageFailure() translation on both decision-delta paths.

import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION } from "../core/loop-capability-execution";
import { recoverRunContext } from "../core/loop-recovery";
import { LoopRunStore } from "../core/loop-run-store";
import { LoopRunJournalError, type LoopRunIdentity } from "../core/loop-executor-types";
import {
  createDeterministicCapabilityGateway,
  createRuntimeBindingRegistry,
  run,
} from "../runtime";

let passed = 0;
function ok(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  passed += 1;
}

function throwsCode(code: string, fn: () => unknown, message: string): void {
  try {
    fn();
    assert.fail(message);
  } catch (error) {
    ok(error instanceof LoopRunJournalError && error.code === code, `${message} (got ${error instanceof LoopRunJournalError ? error.code : String(error)})`);
  }
}

const TS = "2026-08-23T08:00:00.000Z";
const now = (): string => TS;

interface TestEnv {
  root: string;
  runStore: LoopRunStore;
  artifactStore: LoopArtifactStore;
  identity: LoopRunIdentity;
  requirementId: string;
}

function makeEnv(tag: string): TestEnv {
  const root = mkdtempSync(join(tmpdir(), `loop-delta-integrity-${tag}-`));
  mkdirSync(join(root, "repo"), { recursive: true });
  const artifactStore = new LoopArtifactStore({
    controlRoot: join(root, "control"),
    repositoryPath: join(root, "repo"),
  });
  const runStore = new LoopRunStore(join(root, "journal.db"), { artifactStore });
  runStore.init();
  artifactStore.init();
  const requirementId = `REQ-DELTA-${tag.toUpperCase()}`;
  const identity: LoopRunIdentity = Object.freeze({
    runId: `run-${requirementId}`,
    requirementId,
    repository: "local",
    repositoryPath: join(root, "repo"),
    baseBranch: "main",
    expectedBaseSha: "0".repeat(40),
    taskBranch: `runtime/${requirementId}`,
    controlRoot: join(root, "control"),
    createdAt: now(),
  });
  return { root, runStore, artifactStore, identity, requirementId };
}

function closeEnv(env: TestEnv): void {
  env.artifactStore.close();
  env.runStore.close();
  rmSync(env.root, { recursive: true, force: true });
}

function deltaBlobPath(env: TestEnv, digest: string): string {
  return join(env.root, "control", "artifacts", "v1", "solution_review", digest.slice(0, 2), `${digest}.blob`);
}

function refDigest(ref: string): string {
  return ref.slice(ref.lastIndexOf(":") + 1);
}

/**
 * Drives requirement-intake → solution-design → adversarial_scan through the
 * real runtime, stopping at the dispatch safety bound one point short of the
 * formal_verdict. Re-review F2-1: the runtime materializes every dispatched
 * producer's revision, so the seeded pre-chain is fully legal — no hand-built
 * chain may rely on the closed pending-revision bypass anymore.
 */
async function seedChainToVerdict(env: TestEnv) {
  const result = await run("delta integrity requirement source", {
    requirementId: env.requirementId,
    runStore: env.runStore,
    artifactStore: env.artifactStore,
    gateway: createDeterministicCapabilityGateway({
      runStore: env.runStore,
      artifactStore: env.artifactStore,
      bindingRegistry: createRuntimeBindingRegistry(),
      now,
    }),
    bindingRegistry: createRuntimeBindingRegistry(),
    maxDispatches: 3,
  });
  ok(result.final_status === "failed", "seed invocation stops at the dispatch bound without completing");
  const events = env.runStore.listCapabilityExecutions(result.run_id);
  ok(events.length === 6, "three seeded attempts persist exactly six events");
  ok(
    events.every((event) =>
      event.status !== "succeeded" ||
      event.outputArtifactRef === null ||
      (event.capability === "solution-gate" && event.executionRole === "adversarial_scan") ||
      env.runStore.listArtifactRevisions(result.run_id)
        .some((revision) => revision.producerExecutionId === event.executionEventId)),
    "every seeded succeeded producer owns exactly its revision",
  );
  const scan = events.find(
    (item) => item.capability === "solution-gate" && item.executionRole === "adversarial_scan" && item.status === "succeeded",
  )!;
  return { runId: result.run_id, scan, verdictSequence: events.length + 1 };
}

/** Appends the formal_verdict started/succeeded pair around the given delta binding. */
function appendVerdict(
  env: TestEnv,
  seeded: Awaited<ReturnType<typeof seedChainToVerdict>>,
  delta: { ref: string | null; digest: string | null },
): void {
  const { runId, scan, verdictSequence } = seeded;
  const base = {
    schemaVersion: LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION,
    runId,
    capability: "solution-gate" as const,
    executionRole: "formal_verdict" as const,
    nodeId: "solution-gate",
    attempt: 1,
    bindingId: "binding-hermes-solution-gate-formal_verdict",
    bindingVersion: scan.bindingVersion,
    bindingRegistryVersion: scan.bindingRegistryVersion,
    executorAgent: "hermes" as const,
    executorAdapter: "hermes-cli",
    executorVersion: "1.0.0",
    inputArtifactRef: scan.outputArtifactRef!,
    inputArtifactVersion: scan.outputArtifactVersion!,
    inputDigest: scan.outputDigest!,
    consumedFindingsRef: scan.unresolvedFindingsRef,
    consumedFindingsDigest: scan.unresolvedFindingsDigest,
  };
  env.runStore.appendCapabilityExecution(Object.freeze({
    ...base,
    executionEventId: `${runId}:capability:${verdictSequence}:started`,
    sequence: verdictSequence,
    status: "started" as const,
    createdAt: now(),
    outputArtifactRef: null,
    outputArtifactVersion: null,
    outputDigest: null,
    gateResult: null,
    unresolvedFindingsRef: null,
    unresolvedFindingsDigest: null,
    decisionDepth: null,
    decisionScopeId: null,
    decisionDeltaRef: null,
    decisionDeltaDigest: null,
    nextStepEligibility: null,
    errorCode: null,
    retryable: null,
    reasonCode: null,
  }));
  const product = env.artifactStore.put("solution_review", `verdict product for ${env.identity.runId}`);
  env.runStore.appendCapabilityExecution(Object.freeze({
    ...base,
    executionEventId: `${runId}:capability:${verdictSequence + 1}:succeeded`,
    sequence: verdictSequence + 1,
    status: "succeeded" as const,
    createdAt: now(),
    outputArtifactRef: product.artifactRef,
    outputArtifactVersion: "1.0.0",
    outputDigest: product.digest,
    gateResult: "PASS" as const,
    unresolvedFindingsRef: null,
    unresolvedFindingsDigest: null,
    decisionDepth: "STANDARD" as const,
    decisionScopeId: `${runId}:decision:1`,
    decisionDeltaRef: delta.ref,
    decisionDeltaDigest: delta.digest,
    nextStepEligibility: "ELIGIBLE" as const,
    errorCode: null,
    retryable: null,
    reasonCode: null,
  }));
}

async function main(): Promise<void> {
  console.log("F1 append: corrupt delta blob content fails closed as STORE_CORRUPT");
  {
    const env = makeEnv("append-corrupt");
    try {
      const seeded = await seedChainToVerdict(env);
      const delta = env.artifactStore.put("solution_review", "honest delta content");
      // Physical content drift: the blob no longer hashes to its ref digest.
      writeFileSync(deltaBlobPath(env, delta.digest), "tampered delta bytes");
      throwsCode(
        "STORE_CORRUPT",
        () => appendVerdict(env, seeded, { ref: delta.artifactRef, digest: delta.digest }),
        "append carrying a corrupt delta blob is STORE_CORRUPT, not STORE_FAILURE",
      );
    } finally {
      closeEnv(env);
    }
  }

  console.log("F1 append: missing delta blob rejects the transition (ILLEGAL_TRANSITION)");
  {
    const env = makeEnv("append-missing");
    try {
      const seeded = await seedChainToVerdict(env);
      const ghostDigest = "f".repeat(64);
      throwsCode(
        "ILLEGAL_TRANSITION",
        () => appendVerdict(env, seeded, {
          ref: `loop-artifact:v1:solution_review:sha256:${ghostDigest}`,
          digest: ghostDigest,
        }),
        "append carrying a never-written delta blob is ILLEGAL_TRANSITION",
      );
    } finally {
      closeEnv(env);
    }
  }

  console.log("F1 append: declared digest drift is rejected even earlier (INVALID_INPUT)");
  {
    const env = makeEnv("append-drift");
    try {
      const seeded = await seedChainToVerdict(env);
      const delta = env.artifactStore.put("solution_review", "honest delta content");
      // The event validator rejects a ref/digest pair that contradicts itself
      // before the blob binding is ever consulted — layered fail-closed.
      throwsCode(
        "INVALID_INPUT",
        () => appendVerdict(env, seeded, { ref: delta.artifactRef, digest: "e".repeat(64) }),
        "append whose declared digest contradicts the ref is INVALID_INPUT",
      );
    } finally {
      closeEnv(env);
    }
  }

  // Read-path matrix: a fully completed, healthy chain whose verdict delta
  // blob is then destroyed or corrupted must fail EVERY validating read path
  // closed as STORE_CORRUPT.
  const readVariants = [
    { tag: "read-corrupt", label: "content drift", tamper: (env: TestEnv, digest: string) => writeFileSync(deltaBlobPath(env, digest), "tampered delta bytes") },
    { tag: "read-deleted", label: "blob deletion", tamper: (env: TestEnv, digest: string) => unlinkSync(deltaBlobPath(env, digest)) },
  ] as const;
  for (const variant of readVariants) {
    console.log(`F1 read: verdict delta ${variant.label} fails every read path as STORE_CORRUPT`);
    const env = makeEnv(variant.tag);
    try {
      const result = await run("delta integrity read path", {
        requirementId: env.requirementId,
        runStore: env.runStore,
        artifactStore: env.artifactStore,
        gateway: createDeterministicCapabilityGateway({
          runStore: env.runStore,
          artifactStore: env.artifactStore,
          bindingRegistry: createRuntimeBindingRegistry(),
          now,
        }),
        bindingRegistry: createRuntimeBindingRegistry(),
      });
      ok(result.final_status === "success", "healthy chain completes before tampering");
      const verdict = env.runStore.listCapabilityExecutions(result.run_id).find(
        (item) => item.capability === "solution-gate" && item.executionRole === "formal_verdict" && item.status === "succeeded",
      )!;
      ok(verdict.decisionDeltaRef !== null && verdict.decisionDeltaDigest !== null, "verdict carries a materialized delta");
      const digest = refDigest(verdict.decisionDeltaRef!);
      variant.tamper(env, digest);
      throwsCode("STORE_CORRUPT", () => env.runStore.listCapabilityExecutions(result.run_id), `listCapabilityExecutions after ${variant.label}`);
      throwsCode("STORE_CORRUPT", () => env.runStore.getSnapshot(result.run_id), `getSnapshot after ${variant.label}`);
      throwsCode("STORE_CORRUPT", () => env.runStore.findLatestRunByRequirement(env.requirementId), `findLatestRunByRequirement after ${variant.label}`);
      throwsCode("STORE_CORRUPT", () => recoverRunContext(env.runStore, env.requirementId), `recoverRunContext after ${variant.label}`);
    } finally {
      closeEnv(env);
    }
  }

  console.log(`\ndecision delta integrity tests: ${passed} assertions passed`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
