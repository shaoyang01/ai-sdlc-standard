// LOOP-DELIVERY-08 — Targeted Test Suite
// ============================================
// Tests for LoopRequirementDesignOrchestrator (requirement → design →
// solution review → direct executor input orchestration).
//
// Uses fake agents/reviewers/stores for contract coverage and a real D01
// temp store for artifact verification. No real agent, no network, no shell,
// no git side effects. The D06 loop is only instantiated with throwing fakes
// to prove the executor input maps losslessly to LoopAutonomousDeliveryRequest.

import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LoopRequirementDesignOrchestrator } from "../core/loop-requirement-design-orchestrator";
import type {
  LoopRequirementDesignResult,
  LoopRequirementDesignRoute,
} from "../core/loop-requirement-design-orchestrator";
import { LoopArtifactStore, type LoopArtifactKind, type LoopStoredArtifact } from "../core/loop-artifact-store";
import { LoopAutonomousDeliveryLoop } from "../core/loop-autonomous-delivery-loop";
import type { LoopAutonomousDeliveryRequest, LoopDeliveryCommandStep } from "../core/loop-autonomous-delivery-loop";
import type { LoopRunIdentity } from "../core/loop-executor-types";

const TS = "2026-08-01T00:00:00.000Z";

// ═══════════════════════════════════════ Harness

let GLOBAL_PASSED = 0;
let GLOBAL_FAILED = 0;
let sectionFailures = 0;

function check(condition: boolean, message: string): void {
  if (condition) {
    GLOBAL_PASSED += 1;
  } else {
    sectionFailures += 1;
    GLOBAL_FAILED += 1;
    console.error(`  FAIL ${message}`);
  }
}

function startSection(): void {
  sectionFailures = 0;
}

function markIfClear(marker: string): void {
  if (sectionFailures === 0) {
    MARKERS[marker] = true;
  } else {
    console.error(`  marker ${marker} NOT set (${sectionFailures} section failure(s))`);
  }
}

const MARKERS: Record<string, boolean> = {
  D08_STRICT_DIRECT_PATH_VERIFIED: false,
  D08_NO_FALLBACK_VERIFIED: false,
  D08_PENDING_PAUSE_ROUTES_VERIFIED: false,
  D08_SOLUTION_REVIEW_GATE_VERIFIED: false,
  D08_EXECUTOR_INPUT_D06_COMPATIBLE: false,
  D08_ARTIFACT_CHAIN_VERIFIED: false,
  D08_NO_EXECUTION_SIDE_EFFECTS: false,
  D08_REGRESSION_MARKERS_PRESERVED: false,
};

function failExit(msg: string): never {
  console.error(`FATAL: ${msg}`);
  process.exit(1);
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

// ═══════════════════════════════════════ Fixtures

function makeIdentity(o?: Partial<LoopRunIdentity>): LoopRunIdentity {
  return Object.freeze({
    runId: "run-008",
    requirementId: "req-008",
    repository: "shaoyang01/ai-sdlc-standard",
    repositoryPath: "/tmp/loop-d08/repo",
    baseBranch: "feature/loop-runtime-v1",
    expectedBaseSha: "a".repeat(40),
    taskBranch: "codex/loop-d08-run-001",
    controlRoot: "/tmp/loop-d08/control",
    createdAt: TS,
    ...o,
  });
}

function makePathPolicy(o?: { allowedRoots?: string[]; deniedPaths?: string[] }): Record<string, unknown> {
  return {
    allowedRoots: o?.allowedRoots ?? ["core", "tests", "docs"],
    deniedPaths: o?.deniedPaths ?? ["core/legacy", "tests/slow"],
  };
}

function makeCommandPolicy(allowedExecutableIds?: string[]): Record<string, unknown> {
  return { allowedExecutableIds: allowedExecutableIds ?? ["node", "tsx", "npm"] };
}

function makeLimits(o?: Record<string, number>): Record<string, number> {
  return {
    maxDesignRounds: 2,
    maxTotalDurationMs: 120000,
    maxRequirementBytes: 65536,
    maxAgentOutputBytes: 131072,
    maxFixRounds: 4,
    executorMaxTotalDurationMs: 1800000,
    ...o,
  };
}

function makeRequest(o?: {
  identity?: unknown;
  rawRequirement?: unknown;
  pathPolicy?: unknown;
  commandPolicy?: unknown;
  limits?: unknown;
}): Record<string, unknown> {
  return {
    identity: o?.identity ?? makeIdentity(),
    rawRequirement: o?.rawRequirement ?? "Add a bounded content-addressed artifact store test suite.\nKeep all contracts intact.",
    pathPolicy: o?.pathPolicy ?? makePathPolicy(),
    commandPolicy: o?.commandPolicy ?? makeCommandPolicy(),
    limits: o?.limits ?? makeLimits(),
  };
}

function makeSummary(o?: Record<string, unknown>): Record<string, unknown> {
  return {
    schema: "loop_requirement_summary_v1",
    title: "Bounded artifact store test suite",
    objective: "Add tests that verify the content-addressed artifact store contracts.",
    acceptanceCriteria: ["Store content-addressed artifacts", "Verify exact bytes on readback"],
    constraints: ["No new dependencies"],
    ambiguities: [],
    productChoices: [],
    missingPermissions: [],
    riskFlags: [],
    repositoryScope: "single_repository",
    complexity: "direct",
    requestedSideEffects: ["source_change", "commit", "push", "pull_request"],
    ...o,
  };
}

function makeStep(o?: Partial<LoopDeliveryCommandStep>): LoopDeliveryCommandStep {
  return {
    id: o?.id ?? "artifact-store-tests",
    executableId: o?.executableId ?? "tsx",
    args: o?.args ?? ["tests/loop-artifact-store.test.ts"],
    timeoutMs: o?.timeoutMs ?? 120000,
    maxStdoutBytes: o?.maxStdoutBytes ?? 1048576,
    maxStderrBytes: o?.maxStderrBytes ?? 262144,
  };
}

function makeDesign(o?: Record<string, unknown>): Record<string, unknown> {
  return {
    schema: "loop_technical_design_v1",
    approach: "Extend the existing artifact store with bounded test coverage.",
    components: ["core/loop-artifact-store.ts", "tests/loop-artifact-store.test.ts"],
    interfaces: ["LoopArtifactStore.put", "LoopArtifactStore.read"],
    dataChanges: ["No data migration"],
    allowedPaths: ["core/loop-artifact-store.ts", "tests/loop-artifact-store.test.ts", "docs"],
    implementationConstraints: ["No new dependencies"],
    testPlan: [makeStep()],
    reviewPlan: [makeStep({ id: "artifact-store-review", args: ["tests/loop-review.test.ts"] })],
    riskControls: ["Atomic writes", "Strict blob mode"],
    commitSubject: "feat: add bounded artifact store tests",
    prTitle: "feat: add bounded artifact store tests",
    ...o,
  };
}

function makeReview(status: "PASS" | "NEEDS_REVISION" | "BLOCKED", o?: Record<string, unknown>): Record<string, unknown> {
  const findings = o?.findings ?? (status === "PASS" ? [] : [{ code: "MISSING_COVERAGE", detail: "add more cases" }]);
  const directPathEligible = o?.directPathEligible ?? (status === "PASS");
  return {
    schema: "loop_solution_review_v1",
    status,
    findings,
    directPathEligible,
    ...o,
  };
}

// ═══════════════════════════════════════ Fake dependencies

interface FakeAgent {
  normalize: (input: unknown) => unknown;
  design: (input: unknown) => unknown;
  normalizeCalls: unknown[];
  designCalls: unknown[];
}

function makeAgent(summary?: unknown, design?: unknown): FakeAgent {
  const agent: FakeAgent = {
    normalizeCalls: [],
    designCalls: [],
    normalize: () => undefined,
    design: () => undefined,
  };
  agent.normalize = (input: unknown): unknown => {
    agent.normalizeCalls.push(input);
    return summary === undefined ? makeSummary() : summary;
  };
  agent.design = (input: unknown): unknown => {
    agent.designCalls.push(input);
    return design === undefined ? makeDesign() : design;
  };
  return agent;
}

function makeReviewer(review?: unknown): { review: (input: unknown) => unknown; reviewCalls: unknown[] } {
  const reviewer: { review: (input: unknown) => unknown; reviewCalls: unknown[] } = {
    reviewCalls: [],
    review: () => undefined,
  };
  reviewer.review = (input: unknown): unknown => {
    reviewer.reviewCalls.push(input);
    return review === undefined ? makeReview("PASS") : review;
  };
  return reviewer;
}

function makeRealStore(): { store: LoopArtifactStore; tempRoot: string; repository: string; controlRoot: string } {
  const tempRoot = mkdtempSync(join(tmpdir(), "loop-d08-"));
  const repository = join(tempRoot, "repo");
  mkdirSync(repository, { recursive: true });
  const controlRoot = join(tempRoot, "control");
  const store = new LoopArtifactStore({ controlRoot, repositoryPath: repository });
  store.init();
  return { store, tempRoot, repository, controlRoot };
}

function descriptorOf(kind: LoopArtifactKind, bytes: Uint8Array): LoopStoredArtifact {
  const digest = createHash("sha256").update(bytes).digest("hex");
  return Object.freeze({
    artifactRef: `loop-artifact:v1:${kind}:sha256:${digest}`,
    kind,
    digest,
    sizeBytes: bytes.length,
  });
}

/** Fake store that records every put and can fail on the Nth call or return a lying descriptor. */
function makeRecordingStore(failOnPut?: number, lie?: (kind: LoopArtifactKind, bytes: Uint8Array) => LoopStoredArtifact): {
  store: { put: (kind: LoopArtifactKind, content: string | Uint8Array) => LoopStoredArtifact };
  putCalls: { kind: LoopArtifactKind; content: string | Uint8Array }[];
} {
  const putCalls: { kind: LoopArtifactKind; content: string | Uint8Array }[] = [];
  const store = {
    put: (kind: LoopArtifactKind, content: string | Uint8Array): LoopStoredArtifact => {
      putCalls.push({ kind, content });
      if (failOnPut !== undefined && putCalls.length === failOnPut) {
        throw new Error("store exploded");
      }
      const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
      if (lie) return lie(kind, bytes);
      return descriptorOf(kind, bytes);
    },
  };
  return { store, putCalls };
}

function newOrchestrator(deps: {
  agent?: FakeAgent;
  reviewer?: ReturnType<typeof makeReviewer>;
  store?: { put: (kind: LoopArtifactKind, content: string | Uint8Array) => LoopStoredArtifact };
  clock?: { nowMs(): number };
}): LoopRequirementDesignOrchestrator {
  return new LoopRequirementDesignOrchestrator({
    agent: deps.agent ?? makeAgent(),
    reviewer: deps.reviewer ?? makeReviewer(),
    artifactStore: deps.store ?? makeRecordingStore().store,
    clock: deps.clock,
  });
}

function assertTerminalContract(result: LoopRequirementDesignResult, route: LoopRequirementDesignRoute, reasonCode: string): void {
  check(result.route === route, `route is ${route} (got ${result.route})`);
  check(result.reasonCode === reasonCode, `reasonCode is ${reasonCode} (got ${result.reasonCode})`);
  check(result.trace.length >= 1, "trace is non-empty");
  const terminals = result.trace.filter((t) => t.kind === "terminal");
  check(terminals.length === 1, "exactly one terminal trace entry");
  check(result.trace[result.trace.length - 1]!.kind === "terminal", "terminal is the last trace entry");
  check(result.trace[result.trace.length - 1]!.outcome === reasonCode, "terminal outcome is the reasonCode");
  for (let i = 0; i < result.trace.length; i++) {
    const entry = result.trace[i]!;
    check(entry.sequence === i + 1, `trace sequence continuous (entry ${i})`);
    check(typeof entry.kind === "string" && typeof entry.round === "number" &&
      typeof entry.outcome === "string" && typeof entry.elapsedMs === "number", `trace entry ${i} exact fields`);
    check(entry.artifactRef === null || typeof entry.artifactRef === "string", `trace entry ${i} artifactRef type`);
  }
  check(Object.isFrozen(result.trace), "result trace frozen");
  check(Object.isFrozen(result.designArtifactRefs), "designArtifactRefs frozen");
  check(Object.isFrozen(result.solutionReviewArtifactRefs), "solutionReviewArtifactRefs frozen");
}

function traceKinds(result: LoopRequirementDesignResult): string[] {
  return result.trace.map((t) => t.kind);
}

function readPayload(store: LoopArtifactStore, ref: string): Record<string, unknown> {
  const bytes = store.read(ref);
  return JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
}

function isDeepFrozen(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== "object") return true;
  if (!Object.isFrozen(value)) return false;
  if (Array.isArray(value)) {
    for (const item of value) if (!isDeepFrozen(item)) return false;
    return true;
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (!isDeepFrozen((value as Record<string, unknown>)[key])) return false;
  }
  return true;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== (b as unknown[]).length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], (b as unknown[])[i])) return false;
    return true;
  }
  const ka = Object.keys(a as Record<string, unknown>);
  const kb = Object.keys(b as Record<string, unknown>);
  if (ka.length !== kb.length) return false;
  for (const key of ka) {
    if (!(key in (b as Record<string, unknown>))) return false;
    if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
  }
  return true;
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

// ═══════════════════════════════════════ Main

async function main(): Promise<void> {
  console.log("LOOP-DELIVERY-08 Requirement/Design/Direct-Path Orchestration Tests\n");

  // ═══════════════════════════════════════ 1. constructor / options
  startSection();
  {
    console.log("1. constructor and options validation");
    let threw = false;
    try { new LoopRequirementDesignOrchestrator(null as never); } catch { threw = true; }
    check(threw, "null options rejected");
    threw = false;
    try { new LoopRequirementDesignOrchestrator([] as never); } catch { threw = true; }
    check(threw, "array options rejected");
    threw = false;
    try { new LoopRequirementDesignOrchestrator({ agent: {}, reviewer: {}, artifactStore: {}, clock: {}, extra: 1 } as never); } catch { threw = true; }
    check(threw, "unknown options key rejected");
    threw = false;
    try { new LoopRequirementDesignOrchestrator({ reviewer: {}, artifactStore: {} } as never); } catch { threw = true; }
    check(threw, "missing agent rejected");
    threw = false;
    try { new LoopRequirementDesignOrchestrator({ agent: { normalize: () => 1 }, reviewer: {}, artifactStore: {} } as never); } catch { threw = true; }
    check(threw, "agent without design rejected");
    threw = false;
    try { new LoopRequirementDesignOrchestrator({ agent: makeAgent(), artifactStore: {} } as never); } catch { threw = true; }
    check(threw, "missing reviewer rejected");
    threw = false;
    try { new LoopRequirementDesignOrchestrator({ agent: makeAgent(), reviewer: { review: () => 1 } } as never); } catch { threw = true; }
    check(threw, "missing artifactStore rejected");
    threw = false;
    try { new LoopRequirementDesignOrchestrator({ agent: makeAgent(), reviewer: { review: () => 1 }, artifactStore: {} } as never); } catch { threw = true; }
    check(threw, "artifactStore without put rejected");
    threw = false;
    try { new LoopRequirementDesignOrchestrator({ agent: makeAgent(), reviewer: { review: () => 1 }, artifactStore: { put: () => ({} as LoopStoredArtifact) }, clock: {} } as never); } catch { threw = true; }
    check(threw, "clock without nowMs rejected");
    threw = false;
    try { new LoopRequirementDesignOrchestrator({ agent: makeAgent(), reviewer: { review: () => 1 }, artifactStore: { put: () => ({} as LoopStoredArtifact) }, clock: { nowMs: 5 } } as never); } catch { threw = true; }
    check(threw, "clock nowMs non-function rejected");
    const ok = newLoopDefaultClock();
    check(ok, "valid options construct (default clock)");
  }
  markIfClear("D08_STRICT_DIRECT_PATH_VERIFIED");

  // ═══════════════════════════════════════ 2. request strictness
  startSection();
  {
    console.log("2. request strictness (plain object, exact keys, raw bytes)");
    const agent = makeAgent();
    const reviewer = makeReviewer();
    const { store, putCalls } = makeRecordingStore();
    const orch = newOrchestrator({ agent, reviewer, store });

    const invalidInputs: Record<string, unknown>[] = [
      null as never,
      42 as never,
      "request" as never,
      [] as never,
      { identity: makeIdentity() },
      { ...makeRequest(), extra: 1 },
      { ...makeRequest(), rawRequirement: undefined },
      { ...makeRequest(), pathPolicy: undefined },
      { ...makeRequest(), commandPolicy: undefined },
      { ...makeRequest(), identity: { ...makeIdentity(), bogus: "x" } },
      { ...makeRequest(), identity: null },
      { ...makeRequest(), identity: [] },
      { ...makeRequest(), identity: { ...makeIdentity(), runId: "" } },
      { ...makeRequest(), identity: { ...makeIdentity(), runId: "  x" } },
      { ...makeRequest(), identity: { ...makeIdentity(), expectedBaseSha: "z".repeat(40) } },
      { ...makeRequest(), identity: { ...makeIdentity(), repositoryPath: "relative/path" } },
      { ...makeRequest(), identity: { ...makeIdentity(), repositoryPath: "/tmp/loop-d08/control" } },
      { ...makeRequest(), identity: { ...makeIdentity(), createdAt: "not-a-date" } },
      { ...makeRequest(), pathPolicy: {} },
      { ...makeRequest(), pathPolicy: { allowedRoots: [], deniedPaths: [] } },
      { ...makeRequest(), pathPolicy: { allowedRoots: new Array(65).fill("a"), deniedPaths: [] } },
      { ...makeRequest(), pathPolicy: { allowedRoots: ["core", "core"], deniedPaths: [] } },
      { ...makeRequest(), pathPolicy: { allowedRoots: ["/abs/path"], deniedPaths: [] } },
      { ...makeRequest(), pathPolicy: { allowedRoots: ["core\\back"], deniedPaths: [] } },
      { ...makeRequest(), pathPolicy: { allowedRoots: ["core//x"], deniedPaths: [] } },
      { ...makeRequest(), pathPolicy: { allowedRoots: ["./core"], deniedPaths: [] } },
      { ...makeRequest(), pathPolicy: { allowedRoots: ["core/../x"], deniedPaths: [] } },
      { ...makeRequest(), pathPolicy: { allowedRoots: ["core/"], deniedPaths: [] } },
      { ...makeRequest(), pathPolicy: { allowedRoots: ["core\x01x"], deniedPaths: [] } },
      { ...makeRequest(), pathPolicy: { allowedRoots: ["a".repeat(513)], deniedPaths: [] } },
      { ...makeRequest(), pathPolicy: { allowedRoots: ["core"], deniedPaths: new Array(65).fill("d") } },
      { ...makeRequest(), pathPolicy: { allowedRoots: ["core"], deniedPaths: ["d", "d"] } },
      { ...makeRequest(), commandPolicy: {} },
      { ...makeRequest(), commandPolicy: { allowedExecutableIds: [] } },
      { ...makeRequest(), commandPolicy: { allowedExecutableIds: new Array(33).fill("x") } },
      { ...makeRequest(), commandPolicy: { allowedExecutableIds: ["node", "node"] } },
      { ...makeRequest(), commandPolicy: { allowedExecutableIds: ["bad id!"] } },
      { ...makeRequest(), limits: { maxDesignRounds: 3 } },
      { ...makeRequest(), limits: { maxDesignRounds: 0 } },
      { ...makeRequest(), limits: { maxTotalDurationMs: 999 } },
      { ...makeRequest(), limits: { maxTotalDurationMs: 600001 } },
      { ...makeRequest(), limits: { maxRequirementBytes: 0 } },
      { ...makeRequest(), limits: { maxRequirementBytes: 262145 } },
      { ...makeRequest(), limits: { maxAgentOutputBytes: 0 } },
      { ...makeRequest(), limits: { maxAgentOutputBytes: 1048577 } },
      { ...makeRequest(), limits: { maxFixRounds: -1 } },
      { ...makeRequest(), limits: { maxFixRounds: 5 } },
      { ...makeRequest(), limits: { executorMaxTotalDurationMs: 999 } },
      { ...makeRequest(), limits: { executorMaxTotalDurationMs: 3600001 } },
      { ...makeRequest(), limits: { extraLimit: 1 } },
      { ...makeRequest(), rawRequirement: 42 },
      { ...makeRequest(), rawRequirement: "" },
      { ...makeRequest(), rawRequirement: "   " },
      { ...makeRequest(), rawRequirement: "  padded  " },
      { ...makeRequest(), rawRequirement: "a\x00b" },
      { ...makeRequest(), rawRequirement: "lone-\uD800-surrogate" },
      { ...makeRequest(), rawRequirement: "lone-\uDFFF-surrogate" },
      { ...makeRequest(), rawRequirement: "x".repeat(65537) },
    ];

    for (const invalid of invalidInputs) {
      const result = orch.execute(invalid);
      check(result.route === "failed" && result.reasonCode === "INVALID_INPUT",
        `invalid request → failed/INVALID_INPUT (${describeInvalid(invalid)})`);
      assertTerminalContract(result, "failed", "INVALID_INPUT");
      check(!result.safeMessage.includes("SECRET-REQ"), "safeMessage does not leak raw requirement");
      check(result.requirementArtifactRef === undefined, "no requirement artifact for invalid request");
    }

    // Symbol key / __proto__ / accessor / class-instance prototype
    const symbolReq = makeRequest();
    (symbolReq as Record<symbol, unknown>)[Symbol("x")] = 1;
    let r = orch.execute(symbolReq);
    check(r.reasonCode === "INVALID_INPUT", "symbol key rejected");
    const protoReq = Object.assign(Object.create(null), makeRequest());
    const protoKeyReq = { ...makeRequest() };
    Object.defineProperty(protoKeyReq, "__proto__", { value: 1, enumerable: true, configurable: true });
    r = orch.execute(protoKeyReq);
    check(r.reasonCode === "INVALID_INPUT", "__proto__ key rejected");
    const accessorReq = makeRequest();
    Object.defineProperty(accessorReq, "rawRequirement", {
      get: () => "stolen", enumerable: true, configurable: true,
    });
    r = orch.execute(accessorReq);
    check(r.reasonCode === "INVALID_INPUT", "accessor field rejected");
    class FakeIdentity {
      runId = "run-008";
    }
    const classReq = makeRequest({ identity: new FakeIdentity() });
    r = orch.execute(classReq);
    check(r.reasonCode === "INVALID_INPUT", "class instance identity rejected");
    const proxyReq = new Proxy(makeRequest(), {
      getOwnPropertyDescriptor: () => { throw new Error("trap"); },
    });
    r = orch.execute(proxyReq);
    check(r.reasonCode === "INVALID_INPUT", "reflection-throwing proxy rejected");

    check(agent.normalizeCalls.length === 0, "agent.normalize never called for invalid requests");
    check(agent.designCalls.length === 0, "agent.design never called for invalid requests");
    check(reviewer.reviewCalls.length === 0, "reviewer never called for invalid requests");
    check(putCalls.length === 0, "no artifact puts for invalid requests");

    // defensive snapshot — caller mutation after execute must not affect execution
    const snapAgent = makeAgent();
    const snapResult = newOrchestrator({ agent: snapAgent }).execute(makeRequest());
    const reqToMutate = makeRequest();
    const mutateResult = newOrchestrator({ agent: makeAgent() }).execute(reqToMutate);
    (reqToMutate.rawRequirement as string) = "MUTATED-AFTER-CALL";
    (reqToMutate.pathPolicy as Record<string, unknown>).allowedRoots = ["hacked"];
    check(mutateResult.reasonCode === "DIRECT_READY", "post-call mutation does not affect execution");
    check(!JSON.stringify(mutateResult).includes("MUTATED-AFTER-CALL"), "mutated rawRequirement not reflected");
    check(!JSON.stringify(mutateResult).includes("hacked"), "mutated pathPolicy not reflected");
    check(snapResult.reasonCode === "DIRECT_READY", "baseline direct run succeeds");
  }
  markIfClear("D08_STRICT_DIRECT_PATH_VERIFIED");

  // ═══════════════════════════════════════ 3. normalization contract
  startSection();
  {
    console.log("3. normalization contract (input snapshot, throw, malformed, payload)");
    // input exact keys + frozen
    const agent = makeAgent();
    const reviewer = makeReviewer();
    const { store, tempRoot, repository, controlRoot } = makeRealStore();
    const orch = newOrchestrator({ agent, reviewer, store });
    const req = makeRequest({ rawRequirement: "Normalize me with a newline\nand a tab\tinside." });
    const result = orch.execute(req);
    check(result.reasonCode === "DIRECT_READY", "normalize happy path reaches direct");
    check(agent.normalizeCalls.length === 1, "normalize called exactly once");
    const normInput = agent.normalizeCalls[0] as Record<string, unknown>;
    check(deepEqual(Object.keys(normInput).sort(), ["commandPolicy", "identity", "limits", "pathPolicy", "rawRequirement"]),
      "normalize input exact keys");
    check(Object.isFrozen(normInput), "normalize input frozen");
    check(isDeepFrozen(normInput), "normalize input deep frozen");
    check(normInput.rawRequirement === "Normalize me with a newline\nand a tab\tinside.", "normalize input rawRequirement exact");
    const normIdentity = normInput.identity as Record<string, unknown>;
    check(deepEqual(Object.keys(normIdentity).sort(), [
      "baseBranch", "controlRoot", "createdAt", "expectedBaseSha", "repository",
      "repositoryPath", "requirementId", "runId", "taskBranch",
    ]), "normalize input identity exact keys");
    check((normInput.pathPolicy as Record<string, unknown>).allowedRoots !== (req.pathPolicy as Record<string, unknown>).allowedRoots,
      "normalize input pathPolicy is a defensive copy");
    check((normInput.limits as Record<string, number>).maxDesignRounds === 2, "resolved limits passed to agent");

    // requirement artifact payload
    const reqRef = result.requirementArtifactRef!;
    const payload = readPayload(store, reqRef);
    check(payload.schema === "loop_requirement_artifact_v1", "requirement payload schema");
    check(deepEqual(payload.identity, normIdentity), "requirement payload full identity binding");
    check(payload.rawRequirementDigestSha256 === sha256Hex("Normalize me with a newline\nand a tab\tinside."),
      "requirement payload rawRequirementDigestSha256 exact");
    check(deepEqual(payload.requirement_summary, makeSummary()), "requirement payload canonical summary");
    check(!JSON.stringify(payload).includes("Normalize me"), "rawRequirement text never persisted");
    const rawBytes = store.read(reqRef);
    check(!rawBytes.toString("utf8").endsWith("\n"), "requirement payload has no trailing newline");
    const artifactLine = rawBytes.toString("utf8");
    check(artifactLine === JSON.stringify(payload), "requirement payload is compact fixed-key JSON");
    check(result.requirementArtifactRef === reqRef && result.designArtifactRefs.length === 1,
      "direct path refs present");
    assertTerminalContract(result, "direct", "DIRECT_READY");
    store.close();
    rmSync(tempRoot, { recursive: true, force: true });

    // normalize throws → blocked / DEPENDENCY_FAILED
    const throwAgent = makeAgent();
    throwAgent.normalize = () => { throw new Error("agent exploded with SECRET-NORMALIZE"); };
    const { store: s2, tempRoot: t2 } = makeRealStore();
    const blocked = newOrchestrator({ agent: throwAgent, reviewer: makeReviewer(), store: s2 }).execute(makeRequest());
    check(blocked.route === "blocked" && blocked.reasonCode === "DEPENDENCY_FAILED",
      "normalize throw → blocked/DEPENDENCY_FAILED");
    check(!blocked.safeMessage.includes("SECRET-NORMALIZE"), "dependency exception text never leaks");
    check(blocked.designArtifactRefs.length === 0 && blocked.solutionReviewArtifactRefs.length === 0,
      "no design/review artifacts after normalize failure");
    assertTerminalContract(blocked, "blocked", "DEPENDENCY_FAILED");
    s2.close();
    rmSync(t2, { recursive: true, force: true });

    // normalize returns a Promise (not a plain object) → malformed
    const promiseAgent = makeAgent();
    promiseAgent.normalize = () => Promise.resolve(makeSummary());
    const malformedPromise = newOrchestrator({ agent: promiseAgent, reviewer: makeReviewer() }).execute(makeRequest());
    check(malformedPromise.route === "blocked" && malformedPromise.reasonCode === "DEPENDENCY_RESULT_INVALID",
      "normalize async → DEPENDENCY_RESULT_INVALID");

    // malformed summary variants → blocked / DEPENDENCY_RESULT_INVALID
    const malformedSummaries: Record<string, unknown>[] = [
      makeSummary({ schema: "loop_requirement_summary_v9" }),
      makeSummary({ extraField: 1 }),
      (() => { const s = makeSummary(); delete s.title; return s; })(),
      makeSummary({ title: "" }),
      makeSummary({ title: "  padded  " }),
      makeSummary({ title: 42 }),
      makeSummary({ objective: "" }),
      makeSummary({ repositoryScope: "multi" }),
      makeSummary({ complexity: "hard" }),
      makeSummary({ acceptanceCriteria: "nope" }),
      makeSummary({ acceptanceCriteria: [""] }),
      makeSummary({ acceptanceCriteria: ["has\x01control"] }),
      makeSummary({ acceptanceCriteria: ["dup", "dup"] }),
      makeSummary({ constraints: [42] }),
      makeSummary({ ambiguities: ["ok", 7] }),
      makeSummary({ riskFlags: ["not_a_flag"] }),
      makeSummary({ riskFlags: ["credential_required", "credential_required"] }),
      makeSummary({ requestedSideEffects: ["delete_everything"] }),
      (() => { const s = makeSummary(); const arr: unknown[] = []; const self: Record<string, unknown> = { loop: arr }; arr.push(self); s.acceptanceCriteria = arr; return s; })(),
      (() => { const s = makeSummary(); const cyclic = makeSummary(); s.productChoices = [cyclic]; return s; })(),
      (() => { const s = makeSummary(); Object.defineProperty(s, "title", { get: () => "stolen", enumerable: true, configurable: true }); return s; })(),
      (() => { const s = makeSummary(); (s as Record<symbol, unknown>)[Symbol("x")] = 1; return s; })(),
      (() => { class C { schema = "loop_requirement_summary_v1"; } return new C() as unknown as Record<string, unknown>; })(),
    ];
    for (const bad of malformedSummaries) {
      const mAgent = makeAgent(bad);
      const mReviewer = makeReviewer();
      const mOrch = newOrchestrator({ agent: mAgent, reviewer: mReviewer });
      const mResult = mOrch.execute(makeRequest());
      check(mResult.route === "blocked" && mResult.reasonCode === "DEPENDENCY_RESULT_INVALID",
        `malformed summary → blocked/DEPENDENCY_RESULT_INVALID (${describeInvalid(bad)})`);
      assertTerminalContract(mResult, "blocked", "DEPENDENCY_RESULT_INVALID");
      check(mAgent.designCalls.length === 0 && mReviewer.reviewCalls.length === 0,
        "no design/review after malformed summary");
    }

    // oversize canonical summary
    const bigAgent = makeAgent(makeSummary({ objective: "x".repeat(2000) }));
    const bigOrch = newOrchestrator({ agent: bigAgent, reviewer: makeReviewer() });
    const bigLimits = makeLimits({ maxAgentOutputBytes: 1024 });
    const bigResult = bigOrch.execute(makeRequest({ limits: bigLimits }));
    check(bigResult.route === "blocked" && bigResult.reasonCode === "DEPENDENCY_RESULT_INVALID",
      "oversize canonical summary → DEPENDENCY_RESULT_INVALID");
  }
  markIfClear("D08_NO_FALLBACK_VERIFIED");

  // ═══════════════════════════════════════ 4. routing priority
  startSection();
  {
    console.log("4. routing priority (no fallback, no design/review for non-direct)");
    const routeCases: { summary: Record<string, unknown>; route: LoopRequirementDesignRoute; reason: string }[] = [
      { summary: makeSummary({ repositoryScope: "multi_repository" }), route: "multi_repo_pending", reason: "MULTI_REPOSITORY" },
      { summary: makeSummary({ ambiguities: ["which module?"] }), route: "paused", reason: "AMBIGUITY_REQUIRES_INPUT" },
      { summary: makeSummary({ ambiguities: ["a"], productChoices: ["b"], missingPermissions: ["c"], riskFlags: ["credential_required"] }), route: "paused", reason: "AMBIGUITY_REQUIRES_INPUT" },
      { summary: makeSummary({ productChoices: ["choose A or B"] }), route: "paused", reason: "PRODUCT_DECISION_REQUIRED" },
      { summary: makeSummary({ missingPermissions: ["write to CI"] }), route: "paused", reason: "PERMISSION_REQUIRED" },
      { summary: makeSummary({ riskFlags: ["credential_required"] }), route: "paused", reason: "HIGH_RISK_ACCEPTANCE_REQUIRED" },
      { summary: makeSummary({ riskFlags: ["high_risk_acceptance_required"] }), route: "paused", reason: "HIGH_RISK_ACCEPTANCE_REQUIRED" },
      { summary: makeSummary({ riskFlags: ["irreversible_side_effect"] }), route: "paused", reason: "HIGH_RISK_ACCEPTANCE_REQUIRED" },
      { summary: makeSummary({ requestedSideEffects: ["irreversible"] }), route: "paused", reason: "HIGH_RISK_ACCEPTANCE_REQUIRED" },
      { summary: makeSummary({ complexity: "complex" }), route: "speckit_pending", reason: "COMPLEX_REQUIREMENT" },
      { summary: makeSummary({ riskFlags: ["security_sensitive"] }), route: "speckit_pending", reason: "COMPLEX_REQUIREMENT" },
      { summary: makeSummary({ riskFlags: ["data_migration"] }), route: "speckit_pending", reason: "COMPLEX_REQUIREMENT" },
      { summary: makeSummary({ riskFlags: ["external_system_change"] }), route: "speckit_pending", reason: "COMPLEX_REQUIREMENT" },
      { summary: makeSummary({ requestedSideEffects: ["external_system"] }), route: "speckit_pending", reason: "COMPLEX_REQUIREMENT" },
      { summary: makeSummary({ requestedSideEffects: ["source_change", "commit"] }), route: "direct", reason: "DIRECT_READY" },
    ];
    let directCases = 0;
    for (const routeCase of routeCases) {
      const agent = makeAgent(routeCase.summary);
      const reviewer = makeReviewer();
      const { store, tempRoot } = makeRealStore();
      const result = newOrchestrator({ agent, reviewer, store }).execute(makeRequest());
      assertTerminalContract(result, routeCase.route, routeCase.reason);
      if (routeCase.route !== "direct") {
        check(agent.designCalls.length === 0, `no design call for ${routeCase.reason}`);
        check(reviewer.reviewCalls.length === 0, `no review call for ${routeCase.reason}`);
        check(result.designArtifactRefs.length === 0 && result.solutionReviewArtifactRefs.length === 0,
          `no design/review artifacts for ${routeCase.reason}`);
        check(result.executorInput === undefined, `no executor input for ${routeCase.reason}`);
        check(result.requirementArtifactRef !== undefined, `requirement artifact stored for ${routeCase.reason}`);
        // orchestration_result persisted with route/reason for non-direct routes
        check(result.orchestrationResultArtifactRef !== undefined, `orchestration result stored for ${routeCase.reason}`);
        const orPayload = readPayload(store, result.orchestrationResultArtifactRef!);
        check(orPayload.schema === "loop_requirement_orchestration_result_v1", `orchestration result schema (${routeCase.reason})`);
        check(orPayload.route === routeCase.route, `orchestration result route (${routeCase.reason})`);
        check(orPayload.reason_code === routeCase.reason, `orchestration result reason (${routeCase.reason})`);
        check(orPayload.rounds === 0, `orchestration result rounds 0 (${routeCase.reason})`);
        check(orPayload.requirement_artifact_ref === result.requirementArtifactRef, `orchestration result requirement ref (${routeCase.reason})`);
        check(orPayload.executor_input_artifact_ref === null, `orchestration result executor ref null (${routeCase.reason})`);
        check(orPayload.executor_input_digest_sha256 === null, `orchestration result digest null (${routeCase.reason})`);
        const kinds = traceKinds(result);
        check(deepEqual(kinds, ["normalization_started", "requirement_stored", "route_selected", "orchestration_result_stored", "terminal"]),
          `trace order for ${routeCase.reason}`);
      } else {
        directCases += 1;
        check(agent.designCalls.length === 1, "direct candidate calls design once");
      }
      store.close();
      rmSync(tempRoot, { recursive: true, force: true });
    }
    check(directCases === 1, "exactly one direct case routed to design");
  }
  markIfClear("D08_PENDING_PAUSE_ROUTES_VERIFIED");

  // ═══════════════════════════════════════ 5. design contract
  startSection();
  {
    console.log("5. design contract (input snapshot, step/path bounds, artifacts)");
    const agent = makeAgent();
    const reviewer = makeReviewer();
    const { store, tempRoot } = makeRealStore();
    const orch = newOrchestrator({ agent, reviewer, store });
    const result = orch.execute(makeRequest());
    check(result.reasonCode === "DIRECT_READY", "design happy path");
    check(agent.designCalls.length === 1, "design called once");
    const designInput = agent.designCalls[0] as Record<string, unknown>;
    check(deepEqual(Object.keys(designInput).sort(), [
      "commandPolicy", "identity", "limits", "pathPolicy", "previousDesign", "requirement", "reviewFindings", "round",
    ]), "design input exact keys");
    check(Object.isFrozen(designInput) && isDeepFrozen(designInput), "design input deep frozen");
    check(designInput.round === 1, "first design round is 1");
    check(designInput.previousDesign === null, "first round previousDesign null");
    check(deepEqual(designInput.reviewFindings, []), "first round reviewFindings empty");
    check(deepEqual(designInput.requirement, makeSummary()), "design input requirement is canonical summary");
    check((designInput.pathPolicy as { allowedRoots: unknown[] }).allowedRoots.length === 3, "design input pathPolicy");
    check((designInput.limits as Record<string, number>).maxDesignRounds === 2, "design input limits resolved");

    // technical_design artifact payload
    const designRef = result.designArtifactRefs[0]!;
    const designPayload = readPayload(store, designRef);
    check(designPayload.schema === "loop_technical_design_artifact_v1", "design payload schema");
    check(designPayload.requirementArtifactRef === result.requirementArtifactRef, "design payload requirementArtifactRef");
    check(designPayload.round === 1, "design payload round");
    check(deepEqual(designPayload.design, makeDesign()), "design payload canonical design");
    assertTerminalContract(result, "direct", "DIRECT_READY");
    store.close();
    rmSync(tempRoot, { recursive: true, force: true });

    // design throw → blocked / DEPENDENCY_FAILED (reviewer not called)
    const throwDesignAgent = makeAgent();
    throwDesignAgent.design = () => { throw new Error("design boom SECRET-DESIGN"); };
    const dReviewer = makeReviewer();
    const dThrow = newOrchestrator({ agent: throwDesignAgent, reviewer: dReviewer }).execute(makeRequest());
    check(dThrow.route === "blocked" && dThrow.reasonCode === "DEPENDENCY_FAILED", "design throw → blocked/DEPENDENCY_FAILED");
    check(!dThrow.safeMessage.includes("SECRET-DESIGN"), "design exception text never leaks");
    check(dReviewer.reviewCalls.length === 0, "reviewer not called after design throw");
    assertTerminalContract(dThrow, "blocked", "DEPENDENCY_FAILED");

    // malformed designs → blocked / DEPENDENCY_RESULT_INVALID, reviewer not called
    const malformedDesigns: Record<string, unknown>[] = [
      makeDesign({ schema: "loop_technical_design_v9" }),
      (() => { const d = makeDesign(); delete d.approach; return d; })(),
      makeDesign({ approach: "" }),
      makeDesign({ approach: "  padded" }),
      makeDesign({ approach: 42 }),
      makeDesign({ components: ["core/loop-artifact-store.ts", "core/loop-artifact-store.ts"] }),
      makeDesign({ components: ["has\x01control"] }),
      makeDesign({ components: [""] }),
      makeDesign({ interfaces: [42] }),
      makeDesign({ allowedPaths: [] }),
      makeDesign({ allowedPaths: new Array(129).fill("core/a") }),
      makeDesign({ allowedPaths: ["core/a", "core/a"] }),
      makeDesign({ allowedPaths: ["/abs"] }),
      makeDesign({ allowedPaths: ["hacked/outside"] }),
      makeDesign({ allowedPaths: ["core/legacy/secret.ts"] }),
      makeDesign({ allowedPaths: ["core/legacy"] }),
      makeDesign({ allowedPaths: ["tests/slow/big.ts"] }),
      makeDesign({ testPlan: [] }),
      makeDesign({ testPlan: new Array(33).fill(makeStep()) }),
      makeDesign({ testPlan: [makeStep({ id: "dup" }), makeStep({ id: "dup" })] }),
      makeDesign({ testPlan: [makeStep({ id: "a1" })], reviewPlan: [makeStep({ id: "a1" })] }),
      makeDesign({ testPlan: [makeStep({ executableId: "not-allowed" })] }),
      makeDesign({ testPlan: [makeStep({ id: "bad id!" })] }),
      makeDesign({ testPlan: [makeStep({ id: "ok1", args: ["a".repeat(4097)] })] }),
      makeDesign({ testPlan: [makeStep({ id: "ok1", args: new Array(129).fill("a") })] }),
      makeDesign({ testPlan: [makeStep({ id: "ok1", args: ["a\x00b"] })] }),
      makeDesign({ testPlan: [makeStep({ id: "ok1", args: new Array(100).fill("x".repeat(350)) })] }),
      makeDesign({ testPlan: [makeStep({ id: "ok1", timeoutMs: 99 })] }),
      makeDesign({ testPlan: [makeStep({ id: "ok1", timeoutMs: 600001 })] }),
      makeDesign({ testPlan: [makeStep({ id: "ok1", maxStdoutBytes: 0 })] }),
      makeDesign({ testPlan: [makeStep({ id: "ok1", maxStdoutBytes: 16777217 })] }),
      makeDesign({ testPlan: [makeStep({ id: "ok1", maxStderrBytes: -1 })] }),
      makeDesign({ testPlan: [makeStep({ id: "ok1", maxStderrBytes: "big" as never })] }),
      makeDesign({ testPlan: [{ ...makeStep(), extraKey: 1 }] }),
      makeDesign({ commitSubject: "" }),
      makeDesign({ commitSubject: "has\nnewline" }),
      makeDesign({ commitSubject: "x".repeat(73) }),
      makeDesign({ commitSubject: " padded " }),
      makeDesign({ prTitle: "" }),
      makeDesign({ prTitle: "x".repeat(121) }),
      makeDesign({ prTitle: "two\nlines" }),
    ];
    for (const bad of malformedDesigns) {
      const mAgent = makeAgent(undefined, bad);
      const mReviewer = makeReviewer();
      const mOrch = newOrchestrator({ agent: mAgent, reviewer: mReviewer });
      const mResult = mOrch.execute(makeRequest());
      check(mResult.route === "blocked" && mResult.reasonCode === "DEPENDENCY_RESULT_INVALID",
        `malformed design → blocked/DEPENDENCY_RESULT_INVALID (${describeInvalid(bad)})`);
      check(mReviewer.reviewCalls.length === 0, "reviewer not called after malformed design");
      assertTerminalContract(mResult, "blocked", "DEPENDENCY_RESULT_INVALID");
    }

    // oversize design
    const bigDesignAgent = makeAgent(undefined, makeDesign({ approach: "x".repeat(4000) }));
    const bigDesignResult = newOrchestrator({ agent: bigDesignAgent, reviewer: makeReviewer() })
      .execute(makeRequest({ limits: makeLimits({ maxAgentOutputBytes: 2048 }) }));
    check(bigDesignResult.route === "blocked" && bigDesignResult.reasonCode === "DEPENDENCY_RESULT_INVALID",
      "oversize design → DEPENDENCY_RESULT_INVALID");
  }
  markIfClear("D08_STRICT_DIRECT_PATH_VERIFIED");

  // ═══════════════════════════════════════ 6. solution review gate
  startSection();
  {
    console.log("6. solution review gate (PASS / NEEDS_REVISION / BLOCKED / exhaustion)");
    // review input exact keys
    const agent = makeAgent();
    const reviewer = makeReviewer(makeReview("PASS"));
    const { store, tempRoot } = makeRealStore();
    const orch = newOrchestrator({ agent, reviewer, store });
    const result = orch.execute(makeRequest());
    check(result.reasonCode === "DIRECT_READY", "PASS → direct");
    check(result.designRounds === 1, "one design round on PASS");
    const reviewInput = reviewer.reviewCalls[0] as Record<string, unknown>;
    check(deepEqual(Object.keys(reviewInput).sort(), [
      "design", "designArtifactRef", "identity", "requirement", "requirementArtifactRef", "round",
    ]), "review input exact keys");
    check(Object.isFrozen(reviewInput) && isDeepFrozen(reviewInput), "review input deep frozen");
    check(reviewInput.round === 1, "review round 1");
    check(reviewInput.requirementArtifactRef === result.requirementArtifactRef, "review input requirementArtifactRef");
    check(reviewInput.designArtifactRef === result.designArtifactRefs[0], "review input designArtifactRef");
    check(deepEqual(reviewInput.design, makeDesign()), "review input canonical design");
    store.close();
    rmSync(tempRoot, { recursive: true, force: true });

    // reviewer contradictions / malformed → blocked / DEPENDENCY_RESULT_INVALID
    const badReviews: Record<string, unknown>[] = [
      makeReview("PASS", { findings: [{ code: "X" }] }),
      makeReview("PASS", { directPathEligible: false }),
      makeReview("NEEDS_REVISION", { directPathEligible: true }),
      makeReview("NEEDS_REVISION", { findings: [] }),
      makeReview("BLOCKED", { findings: [] }),
      makeReview("BLOCKED", { directPathEligible: true }),
      makeReview("PASS", { schema: "loop_solution_review_v9" }),
      makeReview("PASS", { status: "MAYBE" }),
      makeReview("PASS", { findings: "not-an-array" }),
      makeReview("PASS", { directPathEligible: "yes" }),
      makeReview("PASS", { extra: 1 }),
      makeReview("NEEDS_REVISION", { findings: [42] }),
      makeReview("NEEDS_REVISION", { findings: ["plain string finding"] }),
      (() => { const r = makeReview("NEEDS_REVISION"); const cyclic: unknown[] = []; cyclic.push(cyclic); r.findings = cyclic; return r; })(),
    ];
    for (const bad of badReviews) {
      const r = newOrchestrator({ agent: makeAgent(), reviewer: makeReviewer(bad) }).execute(makeRequest());
      check(r.route === "blocked" && r.reasonCode === "DEPENDENCY_RESULT_INVALID",
        `malformed review → blocked/DEPENDENCY_RESULT_INVALID (${describeInvalid(bad)})`);
      assertTerminalContract(r, "blocked", "DEPENDENCY_RESULT_INVALID");
    }

    // reviewer throw → blocked / DEPENDENCY_FAILED
    const throwReviewer = makeReviewer();
    throwReviewer.review = () => { throw new Error("review boom SECRET-REVIEW"); };
    const tResult = newOrchestrator({ agent: makeAgent(), reviewer: throwReviewer }).execute(makeRequest());
    check(tResult.route === "blocked" && tResult.reasonCode === "DEPENDENCY_FAILED", "review throw → blocked/DEPENDENCY_FAILED");
    check(!tResult.safeMessage.includes("SECRET-REVIEW"), "review exception text never leaks");

    // NEEDS_REVISION → round 2 with previousDesign + reviewFindings
    const revAgent = makeAgent();
    const revReviewer = makeReviewer();
    const firstFindings = [{ code: "MISSING_COVERAGE", detail: "add more cases" }];
    let reviewCall = 0;
    revReviewer.review = (input: unknown): unknown => {
      revReviewer.reviewCalls.push(input);
      reviewCall += 1;
      if (reviewCall === 1) return makeReview("NEEDS_REVISION", { findings: firstFindings });
      return makeReview("PASS");
    };
    const revResult = newOrchestrator({ agent: revAgent, reviewer: revReviewer }).execute(makeRequest());
    check(revResult.reasonCode === "DIRECT_READY", "NEEDS_REVISION then PASS → direct");
    check(revResult.designRounds === 2, "two design rounds");
    check(revAgent.designCalls.length === 2, "design called twice");
    const secondInput = revAgent.designCalls[1] as Record<string, unknown>;
    check(secondInput.round === 2, "second design round is 2");
    check(deepEqual(secondInput.previousDesign, makeDesign()), "second round previousDesign is round-1 design");
    check(deepEqual(secondInput.reviewFindings, firstFindings), "second round reviewFindings passed through");
    check(revResult.designArtifactRefs.length === 2 && revResult.solutionReviewArtifactRefs.length === 2,
      "two design and two review artifacts");

    // exhaustion — last round still NEEDS_REVISION → paused / DESIGN_REVISION_EXHAUSTED
    const exhaustReviewer = makeReviewer();
    exhaustReviewer.review = () => makeReview("NEEDS_REVISION");
    const exhaustResult = newOrchestrator({ agent: makeAgent(), reviewer: exhaustReviewer })
      .execute(makeRequest({ limits: makeLimits({ maxDesignRounds: 2 }) }));
    check(exhaustResult.route === "paused" && exhaustResult.reasonCode === "DESIGN_REVISION_EXHAUSTED",
      "last round NEEDS_REVISION → paused/DESIGN_REVISION_EXHAUSTED");
    check(exhaustResult.designRounds === 2, "two rounds attempted before exhaustion");
    check(exhaustResult.designArtifactRefs.length === 2 && exhaustResult.solutionReviewArtifactRefs.length === 2,
      "both rounds persisted before exhaustion");

    // single-round budget exhaustion
    const singleExhaust = newOrchestrator({ agent: makeAgent(), reviewer: makeReviewer((() => {
      const r = makeReview("NEEDS_REVISION");
      return r;
    })()) })
      .execute(makeRequest({ limits: makeLimits({ maxDesignRounds: 1 }) }));
    check(singleExhaust.route === "paused" && singleExhaust.reasonCode === "DESIGN_REVISION_EXHAUSTED" &&
      singleExhaust.designRounds === 1, "maxDesignRounds=1 exhaustion");

    // BLOCKED → blocked / SOLUTION_REVIEW_BLOCKED
    const blockedReviewer = makeReviewer(makeReview("BLOCKED"));
    const blockedResult = newOrchestrator({ agent: makeAgent(), reviewer: blockedReviewer }).execute(makeRequest());
    check(blockedResult.route === "blocked" && blockedResult.reasonCode === "SOLUTION_REVIEW_BLOCKED",
      "BLOCKED → blocked/SOLUTION_REVIEW_BLOCKED");
    check(blockedResult.designRounds === 1, "one design round on BLOCKED");
    check(blockedResult.solutionReviewArtifactRefs.length === 1, "blocked review artifact stored");

    // no fallback PASS — a garbage non-PASS output must never produce direct
    const garbageReviewer = makeReviewer({ status: "NEEDS_REVISION", directPathEligible: true, findings: [] });
    const garbageResult = newOrchestrator({ agent: makeAgent(), reviewer: garbageReviewer }).execute(makeRequest());
    check(garbageResult.reasonCode === "DEPENDENCY_RESULT_INVALID", "contradictory review never falls back to PASS");
  }
  markIfClear("D08_SOLUTION_REVIEW_GATE_VERIFIED");
  markIfClear("D08_NO_FALLBACK_VERIFIED");

  // ═══════════════════════════════════════ 7. executor input + D06 compatibility
  startSection();
  {
    console.log("7. executor input (deterministic build, D06 lossless mapping)");
    const limits = makeLimits({ maxFixRounds: 2, executorMaxTotalDurationMs: 3600000 });
    const agent = makeAgent();
    const reviewer = makeReviewer();
    const { store, tempRoot } = makeRealStore();
    const orch = newOrchestrator({ agent, reviewer, store });
    const result = orch.execute(makeRequest({ limits }));
    check(result.reasonCode === "DIRECT_READY", "direct success for executor input");
    const executorInput = result.executorInput!;
    check(Object.isFrozen(executorInput) && isDeepFrozen(executorInput), "executor input deep frozen");
    check(executorInput.schema === "loop_direct_executor_input_v1", "executor input schema");
    check(deepEqual(executorInput.identity, makeIdentity()), "executor input full identity snapshot");
    check(/^[0-9a-f]{40}$/.test(executorInput.identity.expectedBaseSha), "executor input expectedBaseSha 40-hex");
    check(!hasOwn(executorInput as unknown as Record<string, unknown>, "workspace"), "executor input has no workspace");
    check(deepEqual(executorInput.requirement, {
      objective: makeSummary().objective,
      acceptanceCriteria: makeSummary().acceptanceCriteria,
      constraints: makeSummary().constraints,
    }), "executor input requirement deterministic from summary");
    check(!JSON.stringify(executorInput.requirement).includes("Add a bounded content-addressed artifact store test suite."),
      "executor input requirement never copies rawRequirement");
    check(deepEqual(executorInput.designSummary, {
      approach: makeDesign().approach,
      components: makeDesign().components,
      interfaces: makeDesign().interfaces,
      dataChanges: makeDesign().dataChanges,
      riskControls: makeDesign().riskControls,
    }), "executor input designSummary deterministic from design");
    check(deepEqual(executorInput.implementationConstraints, makeDesign().implementationConstraints),
      "executor input implementationConstraints from design");
    check(deepEqual(executorInput.allowedPaths, makeDesign().allowedPaths), "executor input allowedPaths from design");
    check(deepEqual(executorInput.testPlan, makeDesign().testPlan), "executor input testPlan from design");
    check(deepEqual(executorInput.reviewPlan, makeDesign().reviewPlan), "executor input reviewPlan from design");
    check(executorInput.maxFixRounds === 2, "executor input maxFixRounds from limits");
    check(executorInput.maxTotalDurationMs === 3600000, "executor input maxTotalDurationMs from executorMaxTotalDurationMs");
    check(executorInput.commitSubject === "feat: add bounded artifact store tests", "executor input commitSubject");
    check(executorInput.prTitle === "feat: add bounded artifact store tests", "executor input prTitle");

    // executor_input artifact payload
    const eiRef = result.executorInputArtifactRef!;
    const eiPayload = readPayload(store, eiRef);
    check(eiPayload.schema === "loop_direct_executor_input_v1", "executor input artifact schema");
    check(deepEqual(eiPayload, executorInput), "executor input artifact is the canonical executor input");

    // ═════════ D06 lossless mapping ═════════
    // Map executor input → LoopAutonomousDeliveryRequest shape; deterministic
    // JSON round-trip must be lossless, and the real D06 loop must accept the
    // mapped request (failing later at WORKSPACE_DRIFT, not INVALID_INPUT).
    const requirementJson = JSON.stringify(executorInput.requirement);
    const designSummaryJson = JSON.stringify(executorInput.designSummary);
    check(deepEqual(JSON.parse(requirementJson), executorInput.requirement), "requirement JSON round-trip lossless");
    check(deepEqual(JSON.parse(designSummaryJson), executorInput.designSummary), "designSummary JSON round-trip lossless");

    const mappedRequest: LoopAutonomousDeliveryRequest = {
      identity: { ...executorInput.identity },
      workspace: {
        workspacePath: "/tmp/loop-d08/mapped-workspace",
        taskBranch: "codex/loop-d08-mapped",
        expectedTaskHeadSha: "b".repeat(40),
        expectedPreStatusDigestSha256: "c".repeat(64),
      },
      requirement: requirementJson,
      designSummary: designSummaryJson,
      implementationConstraints: [...executorInput.implementationConstraints],
      allowedPaths: [...executorInput.allowedPaths],
      testPlan: executorInput.testPlan.map((s) => ({ ...s, args: s.args ? [...s.args] : undefined })),
      reviewPlan: executorInput.reviewPlan.map((s) => ({ ...s, args: s.args ? [...s.args] : undefined })),
      maxFixRounds: executorInput.maxFixRounds,
      maxTotalDurationMs: executorInput.maxTotalDurationMs,
    };

    const d06 = new LoopAutonomousDeliveryLoop({
      runner: { run: async () => { throw new Error("runner must not be called"); } },
      workspaceManager: { inspect: async () => { throw new Error("workspace inspect boom"); } },
      // D06 persists the delivery result synchronously (no await on put).
      artifactStore: {
        put: (_kind: LoopArtifactKind, content: string | Uint8Array): LoopStoredArtifact => {
          const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
          const digest = createHash("sha256").update(bytes).digest("hex");
          return {
            artifactRef: `loop-artifact:v1:delivery_result:sha256:${digest}`,
            kind: "delivery_result",
            digest,
            sizeBytes: bytes.length,
          };
        },
      },
      implementationAdapter: { execute: async () => { throw new Error("adapter must not be called"); } },
    });
    const d06Result = await d06.execute(mappedRequest);
    check(d06Result.status === "blocked" && d06Result.reasonCode === "WORKSPACE_DRIFT",
      `D06 accepts mapped executor input (got ${d06Result.status}/${d06Result.reasonCode}) — proves validation passed`);

    // Executor input identity must also pass D06 identity validation directly
    const d06b = new LoopAutonomousDeliveryLoop({
      runner: { run: async () => { throw new Error("x"); } },
      workspaceManager: { inspect: async () => { throw new Error("y"); } },
      artifactStore: {
        put: (_kind: LoopArtifactKind, content: string | Uint8Array): LoopStoredArtifact => {
          const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
          const digest = createHash("sha256").update(bytes).digest("hex");
          return {
            artifactRef: `loop-artifact:v1:delivery_result:sha256:${digest}`,
            kind: "delivery_result",
            digest,
            sizeBytes: bytes.length,
          };
        },
      },
      implementationAdapter: { execute: async () => { throw new Error("w"); } },
    });
    const mappedBad = { ...mappedRequest, maxFixRounds: 99 };
    const d06Bad = await d06b.execute(mappedBad);
    check(d06Bad.reasonCode === "INVALID_INPUT", "control: D06 rejects a corrupted mapping");
    store.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
  markIfClear("D08_EXECUTOR_INPUT_D06_COMPATIBLE");

  // ═══════════════════════════════════════ 8. artifact chain (direct path)
  startSection();
  {
    console.log("8. direct artifact chain (order, refs, orchestration result)");
    const agent = makeAgent();
    const reviewer = makeReviewer();
    const { store, tempRoot } = makeRealStore();
    const result = newOrchestrator({ agent, reviewer, store }).execute(makeRequest());
    check(result.reasonCode === "DIRECT_READY", "direct chain run");
    check(deepEqual(traceKinds(result), [
      "normalization_started", "requirement_stored", "route_selected",
      "design_started", "design_stored", "review_started", "review_stored",
      "executor_input_stored", "orchestration_result_stored", "terminal",
    ]), "direct artifact/trace order exact");
    check(result.requirementArtifactRef !== undefined, "requirement ref present");
    check(result.designArtifactRefs.length === 1, "one design ref");
    check(result.solutionReviewArtifactRefs.length === 1, "one review ref");
    check(result.executorInputArtifactRef !== undefined, "executor input ref present");
    check(result.orchestrationResultArtifactRef !== undefined, "orchestration result ref present");
    assertTerminalContract(result, "direct", "DIRECT_READY");

    // every ref is real and readback-verifiable in the store
    for (const ref of [result.requirementArtifactRef!, ...result.designArtifactRefs, ...result.solutionReviewArtifactRefs,
      result.executorInputArtifactRef!, result.orchestrationResultArtifactRef!]) {
      check(/^loop-artifact:v1:[a-z_]+:sha256:[0-9a-f]{64}$/.test(ref), `ref format canonical (${ref.slice(0, 32)}…)`);
      const bytes = store.read(ref);
      check(bytes.length > 0, `readback succeeds (${ref.slice(0, 32)}…)`);
    }

    // orchestration result payload
    const orPayload = readPayload(store, result.orchestrationResultArtifactRef!);
    check(orPayload.schema === "loop_requirement_orchestration_result_v1", "orchestration result schema");
    check(deepEqual(orPayload.identity, makeIdentity()), "orchestration result identity binding");
    check(orPayload.route === "direct" && orPayload.reason_code === "DIRECT_READY", "orchestration result route/reason");
    check(orPayload.rounds === 1, "orchestration result rounds");
    check(orPayload.requirement_artifact_ref === result.requirementArtifactRef, "orchestration result requirement ref");
    check(deepEqual(orPayload.design_artifact_refs, result.designArtifactRefs), "orchestration result design refs");
    check(deepEqual(orPayload.solution_review_artifact_refs, result.solutionReviewArtifactRefs), "orchestration result review refs");
    check(orPayload.executor_input_artifact_ref === result.executorInputArtifactRef, "orchestration result executor ref");
    check(typeof orPayload.executor_input_digest_sha256 === "string" &&
      /^[0-9a-f]{64}$/.test(orPayload.executor_input_digest_sha256 as string), "orchestration result executor digest");
    check(typeof orPayload.elapsed_ms === "number" && (orPayload.elapsed_ms as number) >= 0, "orchestration result elapsed");
    check(result.elapsedMs >= (orPayload.elapsed_ms as number), "result elapsedMs >= orchestration result elapsed");

    // trace entry round/artifactRef fields
    const reqTrace = result.trace.find((t) => t.kind === "requirement_stored")!;
    check(reqTrace.round === 0 && reqTrace.artifactRef === result.requirementArtifactRef, "requirement_stored trace fields");
    const designTrace = result.trace.find((t) => t.kind === "design_stored")!;
    check(designTrace.round === 1 && designTrace.artifactRef === result.designArtifactRefs[0], "design_stored trace fields");
    const terminalTrace = result.trace[result.trace.length - 1]!;
    check(terminalTrace.artifactRef === result.orchestrationResultArtifactRef, "terminal trace artifactRef is orchestration result");

    // design chain for two revision rounds
    const revReviewer = makeReviewer();
    let revCount = 0;
    revReviewer.review = (input: unknown): unknown => {
      revReviewer.reviewCalls.push(input);
      revCount += 1;
      return revCount === 1 ? makeReview("NEEDS_REVISION") : makeReview("PASS");
    };
    const { store: s2, tempRoot: t2 } = makeRealStore();
    const revResult = newOrchestrator({ agent: makeAgent(), reviewer: revReviewer, store: s2 }).execute(makeRequest());
    check(deepEqual(traceKinds(revResult), [
      "normalization_started", "requirement_stored", "route_selected",
      "design_started", "design_stored", "review_started", "review_stored",
      "design_started", "design_stored", "review_started", "review_stored",
      "executor_input_stored", "orchestration_result_stored", "terminal",
    ]), "two-round direct artifact/trace order exact");
    check(revResult.designArtifactRefs.length === 2 && revResult.solutionReviewArtifactRefs.length === 2,
      "two-round refs persisted");
    const orPayload2 = readPayload(s2, revResult.orchestrationResultArtifactRef!);
    check(orPayload2.rounds === 2, "two-round orchestration result rounds");
    s2.close();
    rmSync(t2, { recursive: true, force: true });

    // ═════════ artifact store failure paths (must never be ignored) ═════════
    // put throws on first call → failed / ARTIFACT_STORE_FAILED, no further puts
    const failFirst = makeRecordingStore(1);
    const failFirstResult = newOrchestrator({ agent: makeAgent(), reviewer: makeReviewer(), store: failFirst.store }).execute(makeRequest());
    check(failFirstResult.route === "failed" && failFirstResult.reasonCode === "ARTIFACT_STORE_FAILED",
      "requirement put throw → failed/ARTIFACT_STORE_FAILED");
    check(failFirst.putCalls.length === 1, "no further puts after requirement failure");
    check(failFirstResult.requirementArtifactRef === undefined, "no fabricated ref after put failure");
    assertTerminalContract(failFirstResult, "failed", "ARTIFACT_STORE_FAILED");

    // put throws on executor_input (after requirement/design/review stored)
    const failFourth = makeRecordingStore(4);
    const failFourthResult = newOrchestrator({ agent: makeAgent(), reviewer: makeReviewer(), store: failFourth.store }).execute(makeRequest());
    check(failFourthResult.route === "failed" && failFourthResult.reasonCode === "ARTIFACT_STORE_FAILED",
      "executor_input put throw → failed/ARTIFACT_STORE_FAILED");
    check(failFourth.putCalls.length === 4, "exactly four puts attempted");
    check(failFourthResult.requirementArtifactRef !== undefined, "requirement ref real");
    check(failFourthResult.designArtifactRefs.length === 1 && failFourthResult.solutionReviewArtifactRefs.length === 1,
      "design/review refs real");
    check(failFourthResult.executorInputArtifactRef === undefined, "no executor input ref on put failure");
    check(failFourthResult.executorInput === undefined, "no executor input object on put failure");
    check(failFourthResult.orchestrationResultArtifactRef === undefined, "no orchestration result after put failure");

    // malformed descriptor (wrong kind) → ARTIFACT_STORE_FAILED
    const lieStore = makeRecordingStore(undefined, (kind, bytes) => ({
      artifactRef: `loop-artifact:v1:code_patch:sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      kind: "code_patch",
      digest: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: bytes.length,
    }));
    const lieResult = newOrchestrator({ agent: makeAgent(), reviewer: makeReviewer(), store: lieStore.store }).execute(makeRequest());
    check(lieResult.route === "failed" && lieResult.reasonCode === "ARTIFACT_STORE_FAILED",
      "malformed descriptor (wrong kind) → ARTIFACT_STORE_FAILED");

    // malformed descriptor (wrong digest)
    const lieDigest = makeRecordingStore(undefined, (kind, bytes) => {
      const d = createHash("sha256").update(bytes).digest("hex");
      const wrong = d.startsWith("0") ? "1" + d.slice(1) : "0" + d.slice(1);
      return Object.freeze({ artifactRef: `loop-artifact:v1:${kind}:sha256:${wrong}`, kind, digest: wrong, sizeBytes: bytes.length });
    });
    const lieDigestResult = newOrchestrator({ agent: makeAgent(), reviewer: makeReviewer(), store: lieDigest.store }).execute(makeRequest());
    check(lieDigestResult.route === "failed" && lieDigestResult.reasonCode === "ARTIFACT_STORE_FAILED",
      "malformed descriptor (wrong digest) → ARTIFACT_STORE_FAILED");

    // malformed descriptor (wrong size)
    const lieSize = makeRecordingStore(undefined, (kind, bytes) => {
      const d = createHash("sha256").update(bytes).digest("hex");
      return Object.freeze({ artifactRef: `loop-artifact:v1:${kind}:sha256:${d}`, kind, digest: d, sizeBytes: bytes.length + 1 });
    });
    const lieSizeResult = newOrchestrator({ agent: makeAgent(), reviewer: makeReviewer(), store: lieSize.store }).execute(makeRequest());
    check(lieSizeResult.route === "failed" && lieSizeResult.reasonCode === "ARTIFACT_STORE_FAILED",
      "malformed descriptor (wrong size) → ARTIFACT_STORE_FAILED");

    // real store cleanup failure must not be ignored (fs close failure on put)
    const { store: realStore, tempRoot: rt2 } = makeRealStore();
    const fsMod = require("node:fs") as typeof import("node:fs");
    const origClose = fsMod.closeSync;
    let cleanupResult: LoopRequirementDesignResult | null = null;
    try {
      fsMod.closeSync = function (fd: number): void {
        const e = new Error("EIO-CLOSE") as NodeJS.ErrnoException;
        e.code = "EIO";
        throw e;
      } as typeof fsMod.closeSync;
      cleanupResult = newOrchestrator({ agent: makeAgent(), reviewer: makeReviewer(), store: realStore }).execute(makeRequest());
    } finally {
      fsMod.closeSync = origClose;
    }
    check(cleanupResult !== null && cleanupResult.route === "failed" && cleanupResult.reasonCode === "ARTIFACT_STORE_FAILED",
      "real store cleanup failure → failed/ARTIFACT_STORE_FAILED (not ignored)");
    realStore.close();
    rmSync(rt2, { recursive: true, force: true });
    store.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
  markIfClear("D08_ARTIFACT_CHAIN_VERIFIED");

  // ═══════════════════════════════════════ 9. clock and deadline contracts
  startSection();
  {
    console.log("9. clock and deadline contracts");
    // clock invalid on first read
    for (const bad of [NaN, -1, Infinity, -Infinity, 1.5, "100" as never]) {
      const c = { nowMs: () => bad };
      const r = newOrchestrator({ agent: makeAgent(), reviewer: makeReviewer(), clock: c }).execute(makeRequest());
      check(r.route === "failed" && r.reasonCode === "CLOCK_INVALID", `first clock read ${String(bad)} → CLOCK_INVALID`);
      assertTerminalContract(r, "failed", "CLOCK_INVALID");
    }
    // clock throws
    const throwClock = { nowMs: () => { throw new Error("clock boom"); } };
    const throwClockResult = newOrchestrator({ agent: makeAgent(), reviewer: makeReviewer(), clock: throwClock }).execute(makeRequest());
    check(throwClockResult.reasonCode === "CLOCK_INVALID", "clock throw → CLOCK_INVALID");

    // clock goes backward mid-run
    let bNow = 1000;
    let bCount = 0;
    const backwardClock = { nowMs: () => { bCount += 1; const v = bNow; bNow += 500; if (bCount === 3) return 1000; return v; } };
    const backwardResult = newOrchestrator({ agent: makeAgent(), reviewer: makeReviewer(), clock: backwardClock }).execute(makeRequest());
    check(backwardResult.route === "failed" && backwardResult.reasonCode === "CLOCK_INVALID",
      "backward clock mid-run → CLOCK_INVALID");

    // deadline exceeded after normalize → TOTAL_TIMEOUT before requirement put
    let seqA = 0;
    const seqClockA = { nowMs: () => { seqA += 1; return seqA === 2 ? 5000 : seqA; } };
    const deadlineResult = newOrchestrator({
      agent: makeAgent(),
      reviewer: makeReviewer(),
      clock: seqClockA,
    }).execute(makeRequest({ limits: makeLimits({ maxTotalDurationMs: 1000 }) }));
    check(deadlineResult.route === "failed" && deadlineResult.reasonCode === "TOTAL_TIMEOUT",
      "deadline exceeded after normalize → failed/TOTAL_TIMEOUT");
    check(deadlineResult.requirementArtifactRef === undefined, "no requirement artifact after deadline");
    check(deadlineResult.orchestrationResultArtifactRef === undefined, "no orchestration result after deadline");
    const deadlineKinds = traceKinds(deadlineResult);
    check(deepEqual(deadlineKinds, ["normalization_started", "terminal"]), "deadline trace stops before requirement put");

    // deadline exceeded after requirement put → ref kept, no further side effects
    let seqB = 0;
    const seqClockB = { nowMs: () => { seqB += 1; return seqB === 3 ? 1500 : seqB; } };
    const dAgent = makeAgent();
    const afterPutResult = newOrchestrator({
      agent: dAgent,
      reviewer: makeReviewer(),
      clock: seqClockB,
    }).execute(makeRequest({ limits: makeLimits({ maxTotalDurationMs: 1000 }) }));
    check(afterPutResult.route === "failed" && afterPutResult.reasonCode === "TOTAL_TIMEOUT",
      "deadline exceeded after requirement put → TOTAL_TIMEOUT");
    check(afterPutResult.requirementArtifactRef !== undefined, "requirement ref kept (real persisted fact)");
    check(afterPutResult.designArtifactRefs.length === 0, "no design side effects after deadline");
    check(dAgent.designCalls.length === 0, "design not called after deadline");
    check(afterPutResult.orchestrationResultArtifactRef === undefined, "no orchestration result after deadline");
    const afterPutKinds = traceKinds(afterPutResult);
    check(deepEqual(afterPutKinds, ["normalization_started", "requirement_stored", "terminal"]),
      "trace records requirement_stored then terminal");

    // normal clock with default limits succeeds
    let okNow = 0;
    const okClock = { nowMs: () => { okNow += 1000; return okNow; } };
    const okResult = newOrchestrator({ agent: makeAgent(), reviewer: makeReviewer(), clock: okClock }).execute(makeRequest());
    check(okResult.reasonCode === "DIRECT_READY", "normal clock direct success");
    check(okResult.elapsedMs >= 0, "elapsedMs non-negative");
  }
  markIfClear("D08_NO_EXECUTION_SIDE_EFFECTS");

  // ═══════════════════════════════════════ 10. immutability + no execution side effects
  startSection();
  {
    console.log("10. deep immutability and no execution side effects");
    const { store, tempRoot, controlRoot } = makeRealStore();
    const before = listTree(tempRoot);
    const agent = makeAgent();
    const reviewer = makeReviewer();
    const result = newOrchestrator({ agent, reviewer, store }).execute(makeRequest());
    check(result.reasonCode === "DIRECT_READY", "side-effect census run succeeds");
    check(Object.isFrozen(result), "result frozen");
    check(isDeepFrozen(result), "result deep frozen");
    check(isDeepFrozen(result.executorInput), "executor input deep frozen");
    check(isDeepFrozen(result.executorInput!.testPlan), "testPlan deep frozen");
    check(isDeepFrozen(result.executorInput!.identity), "identity deep frozen");

    // strict mode mutation attempt must not corrupt anything
    try {
      (result as { route: string }).route = "hacked";
    } catch {
      // expected in strict mode
    }
    check(result.route === "direct", "frozen result rejects mutation");

    // no files created outside the control root
    const after = listTree(tempRoot);
    const newFiles = after.filter((f) => !before.includes(f));
    for (const f of newFiles) {
      check(f.startsWith(controlRoot), `file created only under control root (${f})`);
    }

    // the orchestrator module must not import execution-side-effect modules
    const source = readFileSync(join(__dirname, "..", "core", "loop-requirement-design-orchestrator.ts"), "utf8");
    const withoutComments = source.replace(/\/\/[^\n]*/g, "");
    const forbidden = [
      "node:fs", "node:child_process", "child_process", "node:net", "node:http",
      "node:https", "node:os", "node:process", "node:worker_threads",
      "exec(", "spawn(", "process.env",
    ];
    for (const token of forbidden) {
      check(!withoutComments.includes(token), `orchestrator source has no ${token}`);
    }
    store.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
  markIfClear("D08_NO_EXECUTION_SIDE_EFFECTS");

  // ═══════════════════════════════════════ 11. regression kinds (real D01 store)
  startSection();
  {
    console.log("11. all ten canonical kinds through the real D01 temp store");
    const { store, tempRoot, controlRoot } = makeRealStore();
    const oldKinds = ["code_patch", "test_summary", "review_summary", "delivery_result", "workspace_metadata"] as const;
    const newKinds = ["requirement_summary", "technical_design", "solution_review", "executor_input", "orchestration_result"] as const;
    const contentByKind: Record<string, string> = {
      code_patch: "diff --git a/x b/x\n+fix",
      test_summary: '{"schema":"loop-test-summary-v1","passed":1}',
      review_summary: '{"schema":"loop-review-summary-v1","ok":true}',
      delivery_result: '{"schema":"loop-delivery-result-v1","status":"succeeded"}',
      workspace_metadata: '{"schema":"loop-workspace-metadata-v1"}',
      requirement_summary: '{"schema":"loop_requirement_artifact_v1","summary":{}}',
      technical_design: '{"schema":"loop_technical_design_artifact_v1","design":{}}',
      solution_review: '{"schema":"loop_solution_review_artifact_v1","review":{}}',
      executor_input: '{"schema":"loop_direct_executor_input_v1"}',
      orchestration_result: '{"schema":"loop_requirement_orchestration_result_v1"}',
    };
    let modeChecked = false;
    for (const kind of [...oldKinds, ...newKinds]) {
      const content = contentByKind[kind]!;
      const bytes = new TextEncoder().encode(content);
      const descriptor = store.put(kind, content);
      check(descriptor.kind === kind, `put kind ${kind}`);
      check(descriptor.artifactRef === `loop-artifact:v1:${kind}:sha256:${descriptor.digest}`, `ref canonical for ${kind}`);
      check(descriptor.digest === sha256Hex(content), `digest exact for ${kind}`);
      check(descriptor.sizeBytes === bytes.length, `size exact for ${kind}`);
      const readback = store.read(descriptor.artifactRef, descriptor.digest);
      check(readback.equals(bytes), `exact bytes readback for ${kind}`);
      const again = store.put(kind, content);
      check(again.artifactRef === descriptor.artifactRef, `idempotent put for ${kind}`);
      if (!modeChecked) {
        // old-kind contract preserved: blob mode 0600
        const finalPath = join(controlRoot, "artifacts", "v1", kind, descriptor.digest.slice(0, 2), `${descriptor.digest}.blob`);
        const { lstatSync } = require("node:fs") as typeof import("node:fs");
        const mode = lstatSync(finalPath).mode & 0o777;
        check(mode === 0o600, `old-kind blob mode 0600 (${kind})`);
        modeChecked = true;
      }
    }
    check(modeChecked, "mode contract verified");
    store.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
  markIfClear("D08_REGRESSION_MARKERS_PRESERVED");

  // ═══════════════════════════════════════ summary
  const total = GLOBAL_PASSED + GLOBAL_FAILED;
  console.log(`\nD08_TARGETED_SUMMARY total=${total} passed=${GLOBAL_PASSED} failed=${GLOBAL_FAILED}`);
  for (const [marker, value] of Object.entries(MARKERS)) {
    console.log(`${marker} ${value}`);
  }
  if (GLOBAL_FAILED > 0) {
    console.error(`\nFAILED: ${GLOBAL_FAILED} assertion(s) failed`);
    process.exit(1);
  }
  for (const [marker, value] of Object.entries(MARKERS)) {
    if (!value) {
      console.error(`  FAIL: marker ${marker} is false`);
      process.exit(1);
    }
  }
  console.log("\nAll tests passed!");
  process.exit(0);
}

// ═══════════════════════════════════════ helpers

function newLoopDefaultClock(): boolean {
  const { store } = makeRealStore();
  try {
    const orch = new LoopRequirementDesignOrchestrator({
      agent: makeAgent(),
      reviewer: makeReviewer(),
      artifactStore: store,
    });
    const result = orch.execute(makeRequest());
    return result.reasonCode === "DIRECT_READY";
  } finally {
    store.close();
  }
}

function describeInvalid(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value !== "object") return String(value).slice(0, 24);
  const keys = Object.keys(value as Record<string, unknown>);
  if (keys.length === 0) return "empty-object";
  const k = keys[0]!;
  const v = (value as Record<string, unknown>)[k];
  const vDesc = Array.isArray(v) ? `array[${v.length}]` : typeof v === "string" ? JSON.stringify(v.slice(0, 16)) : typeof v;
  return `${k}=${vDesc}`;
}

function listTree(root: string): string[] {
  const { existsSync, readdirSync } = require("node:fs") as typeof import("node:fs");
  const out: string[] = [];
  if (!existsSync(root)) return out;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(root);
  return out;
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
