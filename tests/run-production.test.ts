// runProduction — production door tests (C03-E W3, E1-T4, wiring §5).
// Locks: only a parsed production entry is accepted; the read-only preflight
// fails closed on drift/dirty; real is refused; the chain kernel records the
// REAL identity (not the local placeholder); non-production run() is unchanged.

import { mkdtempSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopRunStore } from "../core/loop-run-store";
import {
  parseProductionEntryRequest,
  PRODUCTION_ENTRY_SCHEMA,
  type ParsedProductionEntry,
} from "../core/loop-production-entry";
import { LoopRunJournalError } from "../core/loop-executor-types";
import { run, runProduction, ProductionRunError, type ProductionPreflightSnapshot } from "../runtime";

const TS = "2026-08-28T12:00:00.000Z";
let passed = 0;
function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  passed += 1;
}

function makeRoot(): { root: string; repo: string; control: string } {
  const root = mkdtempSync(join(tmpdir(), "prod-run-"));
  const repo = join(root, "repo");
  const control = join(root, "control");
  mkdirSync(repo, { recursive: true });
  mkdirSync(control, { recursive: true });
  return { root, repo, control };
}

function parsedEntry(parts: { repo: string; control: string; requirementId?: string; runId?: string }): ParsedProductionEntry {
  const raw = {
    schema: PRODUCTION_ENTRY_SCHEMA,
    requirementId: parts.requirementId ?? "REQ-W3",
    repository: "example/repo",
    repositoryPath: parts.repo,
    baseBranch: "loop-runtime-v1",
    expectedBaseSha: "a".repeat(40),
    taskBranch: "feature/w3",
    controlRoot: parts.control,
    sourceFiles: [join(parts.control, "requirement.md")],
    bindingRegistryVersion: "1",
    executionProfileVersion: "1.0.0",
    mode: "real" as const,
  };
  return parseProductionEntryRequest(raw, { now: () => TS, runId: parts.runId ?? "run-w3-001" });
}

function stores(control: string, repo: string): { runStore: LoopRunStore; artifactStore: LoopArtifactStore } {
  const artifactStore = new LoopArtifactStore({ controlRoot: control, repositoryPath: repo });
  const runStore = new LoopRunStore(join(control, "journal.db"), { artifactStore });
  runStore.init();
  artifactStore.init();
  return { runStore, artifactStore };
}

async function expectProdError(fn: () => Promise<unknown>, code: string, msg: string): Promise<void> {
  let caught: unknown;
  try {
    await fn();
  } catch (error) {
    caught = error;
  }
  ok(caught instanceof ProductionRunError && caught.code === code, msg);
}

async function main(): Promise<void> {
  const { root, repo, control } = makeRoot();
  const parsed = parsedEntry({ repo, control });

  // (1) Happy path: parsed entry + clean read-only preflight + injected stores.
  const s1 = stores(join(root, "c1"), repo);
  mkdirSync(join(root, "c1"), { recursive: true });
  const clean = async (): Promise<ProductionPreflightSnapshot> => ({ baseDrifted: false, taskHasChanges: false });
  const okResult = await runProduction(parsed, "build the thing", {
    inspectWorkspace: clean,
    runStore: s1.runStore,
    artifactStore: s1.artifactStore,
    maxDispatches: 2,
  });
  ok(okResult.run_id === "run-w3-001", "production run records the PARSED identity runId (not a local placeholder)");
  ok(okResult.workspace_root === control, "production workspace_root is the real controlRoot");
  ok(Array.isArray(okResult.execution_trace) && okResult.execution_trace.length >= 1, "deterministic chain dispatched under the production door");

  // (2) The journal identity carries real repository/baseSha, not the local placeholders.
  const state = s1.runStore.findLatestRunByRequirement("REQ-W3");
  ok(state !== undefined, "run is journaled under the requirement id");
  const journalIdentity = state?.state.identity;
  ok(journalIdentity?.repository === "example/repo", "journal identity.repository is real (not 'local')");
  ok(journalIdentity?.expectedBaseSha === "a".repeat(40), "journal identity carries the real 40-char base SHA");
  ok(journalIdentity?.controlRoot === control, "journal identity.controlRoot is real");

  // (3) Raw JSON that was never put through the parser is rejected.
  await expectProdError(
    () => runProduction({} as ParsedProductionEntry, "x"),
    "PRODUCTION_ENTRY_NOT_PARSED",
    "an empty object is not a parsed production entry",
  );
  await expectProdError(
    () => runProduction({ request: { schema: "wrong", mode: "real" }, identity: parsed.identity } as never, "x"),
    "PRODUCTION_ENTRY_NOT_PARSED",
    "a request with the wrong schema is not a parsed production entry",
  );

  // (4) Empty requirement text.
  await expectProdError(
    () => runProduction(parsed, "   "),
    "PRODUCTION_ENTRY_INVALID_INPUT",
    "blank requirement text is rejected",
  );

  // (5) real source is refused at the production door (E5 not granted).
  await expectProdError(
    () => runProduction(parsed, "x", { capabilitySource: "real" }),
    "PRODUCTION_REAL_NOT_AUTHORIZED",
    "capability-source real is refused pending the E5 grant",
  );

  // (6) bad capabilitySource enum.
  await expectProdError(
    () => runProduction(parsed, "x", { capabilitySource: "bogus" as never }),
    "PRODUCTION_ENTRY_INVALID_INPUT",
    "an unknown capabilitySource is rejected at the door",
  );

  // (7) read-only preflight: base drift / dirty source fail closed.
  const s2 = stores(join(root, "c2"), repo);
  mkdirSync(join(root, "c2"), { recursive: true });
  await expectProdError(
    () =>
      runProduction(parsed, "x", {
        runStore: s2.runStore, artifactStore: s2.artifactStore,
        inspectWorkspace: async () => ({ baseDrifted: true, taskHasChanges: false }),
      }),
    "PRODUCTION_BASE_DRIFT",
    "a drifted base fails closed before dispatch",
  );
  const s3 = stores(join(root, "c3"), repo);
  mkdirSync(join(root, "c3"), { recursive: true });
  await expectProdError(
    () =>
      runProduction(parsed, "x", {
        runStore: s3.runStore, artifactStore: s3.artifactStore,
        inspectWorkspace: async () => ({ baseDrifted: false, taskHasChanges: true }),
      }),
    "PRODUCTION_DIRTY_SOURCE",
    "a dirty task worktree fails closed before dispatch",
  );

  // (8) stores must be injected together.
  await expectProdError(
    () => runProduction(parsed, "x", { runStore: s1.runStore }),
    "PRODUCTION_ENTRY_INVALID_INPUT",
    "injecting only one store is rejected",
  );

  // (9) --resume basis: a second invocation with the SAME parsed entry/identity
  // recovers (same runId) instead of minting a conflicting new run.
  const resume = await runProduction(parsed, "build the thing", {
    inspectWorkspace: clean,
    runStore: s1.runStore,
    artifactStore: s1.artifactStore,
    maxDispatches: 2,
  });
  ok(resume.run_id === "run-w3-001", "re-invoking the same parsed entry resumes under the same runId");

  // (S2) Self-built stores branch (the CLI's real path): with NO stores
  // injected, runProduction builds the control-plane journal itself.
  const selfControl = join(root, "c-self");
  mkdirSync(selfControl, { recursive: true });
  const selfParsed = parsedEntry({ repo, control: selfControl, runId: "run-w3-self" });
  const selfResult = await runProduction(selfParsed, "build it", {
    inspectWorkspace: clean,
    maxDispatches: 2,
  });
  ok(selfResult.run_id === "run-w3-self", "self-built-stores branch runs under the parsed identity");
  ok(existsSync(join(selfControl, "journal.db")), "self-built branch lands journal.db under controlRoot");

  // (10) Kernel guard: productionIdentity must match the run requirementId / carry a real SHA.
  const s4 = stores(join(root, "c4"), repo);
  mkdirSync(join(root, "c4"), { recursive: true });
  async function expectKernelReject(opts: { requirementId: string; identity: typeof parsed.identity }, msg: string): Promise<void> {
    let caught: unknown;
    try {
      await run("x", { runStore: s4.runStore, artifactStore: s4.artifactStore, requirementId: opts.requirementId, productionIdentity: opts.identity, maxDispatches: 1 });
    } catch (error) {
      caught = error;
    }
    ok(caught instanceof LoopRunJournalError && caught.code === "INVALID_INPUT", msg);
  }
  await expectKernelReject(
    { requirementId: "REQ-OTHER", identity: parsed.identity },
    "productionIdentity.requirementId mismatch is rejected",
  );
  const zeroShaIdentity = Object.freeze({ ...parsed.identity, expectedBaseSha: "0".repeat(40) });
  await expectKernelReject(
    { requirementId: "REQ-W3", identity: zeroShaIdentity },
    "all-zero placeholder base SHA is rejected for a production identity",
  );

  console.log(`run-production: ${passed} passed`);
}

void main();
