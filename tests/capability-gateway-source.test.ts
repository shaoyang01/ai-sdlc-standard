// Capability source switch — W2 factory + runtime seam tests
// (wiring-design §3, Decision-072). Locks: deterministic default is unchanged,
// real is reachable only with Q1+deps, and every real misconfig fails closed
// instead of dropping to the shadow.

import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopRunStore } from "../core/loop-run-store";
import { INITIAL_BINDING_REGISTRY, replaceBinding } from "../core/agent-capability-bindings";
import { ExecutionGateway, createDeterministicCapabilityGateway } from "../execution/gateway";
import { RealCapabilityGateway, type RealGatewayAdapter } from "../execution/real-capability-gateway";
import {
  createCapabilityGateway,
  isCapabilitySource,
  CapabilitySourceError,
  DEFAULT_CAPABILITY_SOURCE,
} from "../execution/capability-gateway-source";
import { run, type RuntimeOptions } from "../runtime";

let passed = 0;
function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  passed += 1;
}

async function expectThrow(fn: () => unknown, code: string, msg: string): Promise<void> {
  let threw: unknown;
  try {
    await fn();
  } catch (error) {
    threw = error;
  }
  ok(threw instanceof CapabilitySourceError && threw.code === code, msg);
}

function makeStores(): { runStore: LoopRunStore; artifactStore: LoopArtifactStore } {
  const root = mkdtempSync(join(tmpdir(), "cap-src-"));
  const repo = join(root, "repo");
  mkdirSync(repo, { recursive: true });
  const controlRoot = join(root, "control");
  const artifactStore = new LoopArtifactStore({ controlRoot, repositoryPath: repo });
  const runStore = new LoopRunStore(join(root, "journal.db"), { artifactStore });
  runStore.init();
  artifactStore.init();
  return { runStore, artifactStore };
}

const fakeAdapter: RealGatewayAdapter = {
  async execute(req) {
    return { success: true, node: req.node, agent: req.providerId, output: { text: "{}" }, artifacts: [] };
  },
};
const realDeps = { adapter: fakeAdapter, attemptWorkspace: (): string => "." };
const now = (): string => "2026-08-28T10:00:00.000Z";

async function main(): Promise<void> {
  // ── closed enum + default ──
  ok(isCapabilitySource("deterministic") && isCapabilitySource("real"), "enum accepts deterministic|real");
  ok(!isCapabilitySource("shadow") && !isCapabilitySource(undefined) && !isCapabilitySource(""), "enum rejects other values");
  ok(DEFAULT_CAPABILITY_SOURCE === "deterministic", "default capability source is deterministic");

  const { runStore, artifactStore } = makeStores();
  const base = { runStore, artifactStore, bindingRegistry: INITIAL_BINDING_REGISTRY, now };

  // ── deterministic face: unchanged construction, never a Real gateway ──
  const det = createCapabilityGateway({ ...base, source: "deterministic" });
  const directDet = createDeterministicCapabilityGateway(base);
  ok(det instanceof ExecutionGateway, "deterministic factory yields an ExecutionGateway");
  ok(!(det instanceof RealCapabilityGateway), "deterministic factory never yields a Real gateway");
  ok(
    Object.getPrototypeOf(det.constructor) === ExecutionGateway &&
      Object.getPrototypeOf(directDet.constructor) === ExecutionGateway,
    "factory deterministic reuses the existing deterministic gateway lineage",
  );

  // ── real face: reachable with Q1 + deps ──
  const real = createCapabilityGateway({ ...base, source: "real", realDeps });
  ok(real instanceof RealCapabilityGateway, "real + Q1 registry + deps builds a RealCapabilityGateway");

  // ── (b) non-Q1 registry fails closed, never shadow ──
  const nonQ1 = replaceBinding(
    INITIAL_BINDING_REGISTRY,
    "binding-kimi-requirement-intake-primary",
    "binding-codex-requirement-intake-primary",
  ).registry;
  await expectThrow(
    () => createCapabilityGateway({ ...base, bindingRegistry: nonQ1, source: "real", realDeps }),
    "REAL_SOURCE_REQUIRES_Q1_REGISTRY",
    "real refuses a drifted (non-Q1) registry instead of dispatching/falling back",
  );

  // ── (c) missing/incomplete realDeps fails closed ──
  await expectThrow(
    () => createCapabilityGateway({ ...base, source: "real" }),
    "REAL_SOURCE_MISCONFIGURED",
    "real without deps is misconfigured (no silent shadow fallback)",
  );
  await expectThrow(
    () => createCapabilityGateway({ ...base, source: "real", realDeps: { attemptWorkspace: realDeps.attemptWorkspace } as never }),
    "REAL_SOURCE_MISCONFIGURED",
    "real without an adapter is misconfigured",
  );
  await expectThrow(
    () => createCapabilityGateway({ ...base, source: "real", realDeps: { adapter: fakeAdapter, attemptWorkspace: "x" as never } }),
    "REAL_SOURCE_MISCONFIGURED",
    "real with a non-function attemptWorkspace is misconfigured",
  );

  // ── unknown source fails closed (runtime callers bypassing TS) ──
  await expectThrow(
    () => createCapabilityGateway({ ...base, source: "shadow" as never }),
    "UNKNOWN_CAPABILITY_SOURCE",
    "an unknown source string fails closed instead of defaulting",
  );

  // ── runtime seam: default run() still walks the deterministic path ──
  const { runStore: rs2, artifactStore: as2 } = makeStores();
  const defaultResult = await run("build a footer", {
    requirementId: "REQ-W2-DEFAULT", runStore: rs2, artifactStore: as2, maxDispatches: 2,
  });
  ok(Array.isArray(defaultResult.execution_trace) && defaultResult.execution_trace.length >= 1,
    "run() with no capabilitySource still dispatches via deterministic shadow (zero behaviour change)");

  // ── runtime seam: real without deps rejects (default registry is Q1) ──
  const { runStore: rs3, artifactStore: as3 } = makeStores();
  let realNoDepsFailed = false;
  try {
    await run("build a header", { requirementId: "REQ-W2-REALNODEPS", runStore: rs3, artifactStore: as3, capabilitySource: "real" });
  } catch (error) {
    realNoDepsFailed = error instanceof CapabilitySourceError && error.code === "REAL_SOURCE_MISCONFIGURED";
  }
  ok(realNoDepsFailed, "run(capabilitySource=real) without deps fails closed at gateway construction");

  // ── runtime seam: closed enum + source/gateway mutual exclusion ──
  const badCases: Array<Pick<RuntimeOptions, "capabilitySource" | "gateway">> = [
    { capabilitySource: "bogus" as RuntimeOptions["capabilitySource"] },
    { capabilitySource: "real", gateway: det },
  ];
  for (const bad of badCases) {
    let rejected = false;
    try {
      const s = makeStores();
      await run("x", { requirementId: `REQ-W2-BAD-${Math.random()}`, runStore: s.runStore, artifactStore: s.artifactStore, ...bad });
    } catch {
      rejected = true;
    }
    ok(rejected, "runtime rejects invalid capabilitySource / real+gateway conflict (INVALID_INPUT)");
  }

  console.log(`capability-gateway-source: ${passed} passed`);
}

void main();
