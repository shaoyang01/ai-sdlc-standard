// C03-E W5 (E3-T2): the NINE classes of invalid node output must each fail
// closed END-TO-END through the real LoopCapabilityEntry -> gateway -> store
// chain: no effective artifact, no promotion, no advance to the next point,
// and a stable decidable code. This is NOT a unit re-test of the validators;
// every case except C9 dispatches a real execute() (C9 is rejected at registry
// validation, before any executable entry can exist) and asserts the "no advance" surface.
//
// Nine classes (plan §6 E3 acceptance):
//   C1 invalid output ............ non-verdict node returns a Gate result / bad outcome
//   C2 stale input ............... input does not match predecessor effective output
//   C3 wrong generation .......... downstream input version is not the producer's revision
//   C4 forged digest ............. input digest is a well-formed but wrong SHA-256
//   C5 wrong agent ............... result tries to claim an agent other than the bound agent
//   C6 same-agent dual Gate role . formal_verdict bound to the same agent as adversarial_scan
//   C7 stale revision ............ downstream binds an outdated predecessor revision
//   C8 unclosed finding .......... verdict PASS while carrying unresolved findings
//   C9 out-of-bound write ........ binding tries to expand allowedSideEffects beyond canonical
//
// Point order (capabilityStates index): 0 intake, 1 design, 2 gate/scan,
// 3 gate/verdict, 4 planning, 5 implementation, 6 code-review, 7 knowledge-sync.

import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CAPABILITY_ARTIFACT_TYPES,
  INITIAL_BINDING_REGISTRY,
  replaceBinding,
  validateBindingRegistry,
} from "../core/agent-capability-bindings";
import { createArtifact } from "../core/artifact";
import { LoopArtifactStore, LoopArtifactStoreError } from "../core/loop-artifact-store";
import { LoopCapabilityEntry } from "../core/loop-capability-entry";
import { LoopRunJournalError } from "../core/loop-executor-types";
import { LoopRunStore } from "../core/loop-run-store";
import type { LoopRunIdentity } from "../core/loop-executor-types";
import { materializeProducerRevision } from "../runtime";
import { MultiAgentFakeGateway } from "./fixtures/multi-agent-fake-gateway";
import type { ExecutionRequest, ExecutionResult } from "../execution/types";

const TS = "2026-08-29T10:00:00.000Z";
let passed = 0;
function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  passed += 1;
}
function eq(actual: unknown, expected: unknown, msg: string): void {
  if (actual !== expected) throw new Error(`FAIL: ${msg} (got ${String(actual)}, want ${String(expected)})`);
  passed += 1;
}

interface Harness {
  root: string;
  id: LoopRunIdentity;
  artifactStore: LoopArtifactStore;
  runStore: LoopRunStore;
}

function makeHarness(suffix: string): Harness {
  const root = mkdtempSync(join(tmpdir(), `loop-w5-${suffix}-`));
  mkdirSync(join(root, "repo"), { recursive: true });
  const id: LoopRunIdentity = Object.freeze({
    runId: `run-w5-${suffix}`,
    requirementId: `REQ-W5-${suffix}`,
    repository: "example",
    repositoryPath: join(root, "repo"),
    baseBranch: "main",
    expectedBaseSha: "5".repeat(40),
    taskBranch: `feature/w5-${suffix.toLowerCase()}`,
    controlRoot: join(root, "control"),
    createdAt: TS,
  });
  const artifactStore = new LoopArtifactStore({ controlRoot: id.controlRoot, repositoryPath: id.repositoryPath });
  const runStore = new LoopRunStore(join(root, "journal.db"), { artifactStore });
  runStore.init();
  artifactStore.init();
  return { root, id, artifactStore, runStore };
}

// A qualified successful result for the bound node (mirrors validation-guards).
function qualified(request: ExecutionRequest, outputOverrides: Record<string, unknown> = {}): ExecutionResult {
  const capability = request.type as keyof typeof CAPABILITY_ARTIFACT_TYPES;
  const role = request.loopExecution?.executionRole;
  const output: Record<string, unknown> = { result: "capability_completed", ...outputOverrides };
  if (capability === "solution-gate" || capability === "code-review") {
    output.unresolvedFindings = outputOverrides["unresolvedFindings"] ?? [];
  }
  if (capability === "solution-gate" && role === "formal_verdict" && output["gateResult"] === undefined) {
    output.gateResult = "PASS";
  }
  return Object.freeze({
    success: true,
    node: request.node,
    agent: request.agent,
    output: Object.freeze(output),
    artifacts: Object.freeze([createArtifact({
      id: `${request.requirementId}:${capability}:${role ?? "primary"}:ok`,
      requirementId: request.requirementId,
      node: request.node,
      type: CAPABILITY_ARTIFACT_TYPES[capability],
      content: { node_output: `qualified ${String(capability)}` },
      agent: request.agent,
      source: "execution_gateway",
      createdAt: TS,
    })]),
  });
}

function makeEntry(h: Harness, overrides: Record<string, unknown> = {}): LoopCapabilityEntry {
  return new LoopCapabilityEntry({
    runStore: h.runStore,
    artifactStore: h.artifactStore,
    bindingRegistry: INITIAL_BINDING_REGISTRY,
    gateway: new MultiAgentFakeGateway({
      capabilityTracing: {
        runStore: h.runStore,
        artifactStore: h.artifactStore,
        bindingRegistry: INITIAL_BINDING_REGISTRY,
        executorVersions: { codex: "1.0.0", kimi: "1.0.0", hermes: "1.0.0" },
        now: () => TS,
      },
      // Q1: intake/design are Kimi; tests drive the returned result per node.
      kimiRunnerOverride: { run: async (req: ExecutionRequest) => qualified(req) } as never,
      hermesRunnerOverride: { run: async (req: ExecutionRequest) => qualified(req) } as never,
      ...overrides,
    }),
    now: () => TS,
  });
}

// Run requirement-intake to success and materialize its node revision, then
// return the canonical tech input the successor (solution-design) needs.
async function seedIntake(h: Harness, overrides: Record<string, unknown> = {}): Promise<{ ref: string; version: string; digest: string }> {
  const source = h.artifactStore.put("requirement_summary", "W5 requirement source");
  const entry = makeEntry(h, overrides);
  const res = await entry.execute({
    requirementId: h.id.requirementId,
    identity: h.id,
    capability: "requirement-intake",
    executionRole: "primary" as const,
    inputArtifactRef: source.artifactRef,
    inputArtifactVersion: "1.0.0",
    inputDigest: source.digest,
    outputArtifactVersion: "1.0.0",
    input: { requirement: "W5 seed" },
  });
  ok(res.execution.success === true, "seed: intake succeeds");
  const producer = h.runStore.listCapabilityExecutions(h.id.runId)
    .find((e) => e.status === "succeeded" && e.capability === "requirement-intake")!;
  materializeProducerRevision(h.runStore, h.id.requirementId, h.id.runId, producer, () => TS);
  const state = res.recoveryContext.capabilityStates[0]!;
  return {
    ref: state.effectiveOutputArtifactRef!,
    version: state.effectiveOutputArtifactVersion!,
    digest: state.effectiveOutputDigest!,
  };
}

async function expectJournalCode(fn: () => Promise<unknown>, code: string, msg: string): Promise<void> {
  let caught: unknown;
  try { await fn(); } catch (e) { caught = e; }
  ok(caught instanceof LoopRunJournalError && caught.code === code, `${msg} (got ${(caught as Error)?.message ?? "nothing"})`);
}

async function expectStoreCode(fn: () => Promise<unknown>, code: string, msg: string): Promise<void> {
  let caught: unknown;
  try { await fn(); } catch (e) { caught = e; }
  ok(caught instanceof LoopArtifactStoreError && caught.code === code, `${msg} (got ${(caught as Error)?.message ?? "nothing"})`);
}

async function main(): Promise<void> {
  // ── C1 invalid output: a non-verdict node returns a Gate result ──
  {
    const h = makeHarness("C1");
    const tech = await seedIntake(h, {
      kimiRunnerOverride: {
        run: async (req: ExecutionRequest) =>
          (req.type as string) === "solution-design"
            ? qualified(req, { gateResult: "PASS" }) // non-verdict must not emit a Gate
            : qualified(req),
      } as never,
    });
    const res = await makeEntry(h, {
      kimiRunnerOverride: {
        run: async (req: ExecutionRequest) => qualified(req, { gateResult: "PASS" }),
      } as never,
    }).execute({
      requirementId: h.id.requirementId, identity: h.id, capability: "solution-design",
      executionRole: "primary" as const, inputArtifactRef: tech.ref, inputArtifactVersion: tech.version,
      inputDigest: tech.digest, outputArtifactVersion: "1.0.0",
      input: { requirementSummaryRef: tech.ref },
    });
    ok(res.execution.success === false, "C1 invalid output is not a success");
    const s = res.recoveryContext.capabilityStates[1]!;
    eq(s.status, "failed", "C1 design point is failed, not advanced");
    eq(s.errorCode, "OUTPUT_CONTRACT_VIOLATION", "C1 carries a stable violation code");
    ok(s.effectiveOutputArtifactRef === null, "C1 produces no effective artifact");
    eq(res.recoveryContext.nextCapability, "solution-design", "C1 stays on the same point (no advance)");
  }

  // ── C2 stale input: input ref/digest does not match the predecessor output ──
  {
    const h = makeHarness("C2");
    await seedIntake(h);
    const decoy = h.artifactStore.put("requirement_summary", "a different, older artifact");
    await expectJournalCode(() => makeEntry(h).execute({
      requirementId: h.id.requirementId, identity: h.id, capability: "solution-design",
      executionRole: "primary" as const, inputArtifactRef: decoy.artifactRef, inputArtifactVersion: "1.0.0",
      inputDigest: decoy.digest, outputArtifactVersion: "1.0.0",
      input: { requirementSummaryRef: decoy.artifactRef },
    }), "INVALID_INPUT", "C2 a stale/foreign predecessor input is rejected before dispatch");
    const designEvents = h.runStore.listCapabilityExecutions(h.id.runId).filter((e) => e.capability === "solution-design");
    eq(designEvents.length, 0, "C2 no design dispatch is journaled (no side effect)");
  }

  // ── C3 wrong generation: downstream input version mismatches the producer revision ──
  {
    const h = makeHarness("C3");
    const tech = await seedIntake(h);
    await expectJournalCode(() => makeEntry(h).execute({
      requirementId: h.id.requirementId, identity: h.id, capability: "solution-design",
      executionRole: "primary" as const, inputArtifactRef: tech.ref, inputArtifactVersion: "9.0.0",
      inputDigest: tech.digest, outputArtifactVersion: "1.0.0",
      input: { requirementSummaryRef: tech.ref },
    }), "INVALID_INPUT", "C3 a wrong input generation/version is rejected before dispatch");
    eq(h.runStore.listCapabilityExecutions(h.id.runId)
      .filter((e) => e.capability === "solution-design").length, 0,
      "C3 a wrong generation dispatches zero downstream executions");
  }

  // ── C4 forged digest: well-formed but wrong SHA-256 for the claimed ref ──
  {
    const h = makeHarness("C4");
    const tech = await seedIntake(h);
    const forged = "a".repeat(64); // 64-hex, but not the content digest of tech.ref
    ok(forged !== tech.digest, "C4 fixture: forged digest differs from the real one");
    await expectStoreCode(() => makeEntry(h).execute({
      requirementId: h.id.requirementId, identity: h.id, capability: "solution-design",
      executionRole: "primary" as const, inputArtifactRef: tech.ref, inputArtifactVersion: tech.version,
      inputDigest: forged, outputArtifactVersion: "1.0.0",
      input: { requirementSummaryRef: tech.ref },
    }), "ARTIFACT_DIGEST_MISMATCH", "C4 a forged digest is rejected (content-addressing binds ref to digest)");
  }

  // ── C5 wrong agent: the result may not claim an agent other than the binding ──
  {
    const h = makeHarness("C5");
    const tech = await seedIntake(h);
    const res = await makeEntry(h, {
      kimiRunnerOverride: {
        // solution-design is bound to kimi; the runner lies and claims hermes.
        run: async (req: ExecutionRequest) => ({ ...qualified(req), agent: "hermes" as never }),
      } as never,
    }).execute({
      requirementId: h.id.requirementId, identity: h.id, capability: "solution-design",
      executionRole: "primary" as const, inputArtifactRef: tech.ref, inputArtifactVersion: tech.version,
      inputDigest: tech.digest, outputArtifactVersion: "1.0.0",
      input: { requirementSummaryRef: tech.ref },
    });
    const terminal = h.runStore.listCapabilityExecutions(h.id.runId)
      .filter((e) => e.capability === "solution-design").at(-1)!;
    eq(terminal.executorAgent, "kimi", "C5 the journaled executor is always the BOUND agent, never the claimed one");
    ok(res.execution.agent !== "hermes", "C5 a forged agent identity cannot surface on the result");
  }

  // ── C6 same-agent dual Gate role: formal_verdict must differ from adversarial_scan ──
  {
    const h = makeHarness("C6");
    // adversarial_scan is Codex under Q1. Run a clean scan round first.
    const tech = await seedIntake(h);
    // design must succeed to reach the gate; drive it via kimi.
    const design = await makeEntry(h).execute({
      requirementId: h.id.requirementId, identity: h.id, capability: "solution-design",
      executionRole: "primary" as const, inputArtifactRef: tech.ref, inputArtifactVersion: tech.version,
      inputDigest: tech.digest, outputArtifactVersion: "1.0.0", input: { requirementSummaryRef: tech.ref },
    });
    const designProducer = h.runStore.listCapabilityExecutions(h.id.runId)
      .find((e) => e.status === "succeeded" && e.capability === "solution-design")!;
    materializeProducerRevision(h.runStore, h.id.requirementId, h.id.runId, designProducer, () => TS);
    const designState = design.recoveryContext.capabilityStates[1]!;
    const scan = await makeEntry(h, {
      codexRunner: { run: async (req: ExecutionRequest) => qualified(req, { unresolvedFindings: [] }) },
    }).execute({
      requirementId: h.id.requirementId, identity: h.id, capability: "solution-gate",
      executionRole: "adversarial_scan" as const,
      inputArtifactRef: designState.effectiveOutputArtifactRef!, inputArtifactVersion: designState.effectiveOutputArtifactVersion!,
      inputDigest: designState.effectiveOutputDigest!, outputArtifactVersion: "1.0.0",
      input: { solutionDesignRef: designState.effectiveOutputArtifactRef! },
    });
    ok(scan.execution.success === true, "C6 fixture: adversarial_scan (codex) succeeds with its ledger");
    const scanProducer = h.runStore.listCapabilityExecutions(h.id.runId)
      .find((e) => e.status === "succeeded" && e.capability === "solution-gate" && e.executionRole === "adversarial_scan")!;
    materializeProducerRevision(h.runStore, h.id.requirementId, h.id.runId, scanProducer, () => TS);
    const scanState = scan.recoveryContext.capabilityStates[2]!;
    // Drift the registry so formal_verdict is ALSO codex (same agent as the scan).
    const sameAgentRegistry = replaceBinding(
      INITIAL_BINDING_REGISTRY,
      "binding-hermes-solution-gate-formal_verdict",
      "binding-codex-solution-gate-formal_verdict",
    ).registry;
    const driftedEntry = new LoopCapabilityEntry({
      runStore: h.runStore, artifactStore: h.artifactStore, bindingRegistry: sameAgentRegistry,
      gateway: new MultiAgentFakeGateway({
        capabilityTracing: {
          runStore: h.runStore, artifactStore: h.artifactStore, bindingRegistry: sameAgentRegistry,
          executorVersions: { codex: "1.0.0", kimi: "1.0.0", hermes: "1.0.0" }, now: () => TS,
        },
      }),
      now: () => TS,
    });
    await expectJournalCode(() => driftedEntry.execute({
      requirementId: h.id.requirementId, identity: h.id, capability: "solution-gate",
      executionRole: "formal_verdict" as const,
      inputArtifactRef: scanState.effectiveOutputArtifactRef!, inputArtifactVersion: scanState.effectiveOutputArtifactVersion!,
      inputDigest: scanState.effectiveOutputDigest!, outputArtifactVersion: "1.0.0",
      input: { findingsLedgerRef: scanState.unresolvedFindingsRef! },
    }), "ILLEGAL_TRANSITION", "C6 a same-agent formal_verdict is rejected before dispatch");
    const verdictEvents = h.runStore.listCapabilityExecutions(h.id.runId)
      .filter((e) => e.capability === "solution-gate" && e.executionRole === "formal_verdict");
    eq(verdictEvents.length, 0, "C6 no formal_verdict dispatch is journaled (no advance)");
  }

  // ── C7 stale revision: a successor may not bind a non-current (grandparent) revision ──
  {
    const h = makeHarness("C7");
    const intake = await seedIntake(h);
    // solution-design succeeds on the CURRENT intake revision and becomes the
    // current predecessor of task-planning.
    const design = await makeEntry(h).execute({
      requirementId: h.id.requirementId, identity: h.id, capability: "solution-design",
      executionRole: "primary" as const, inputArtifactRef: intake.ref, inputArtifactVersion: intake.version,
      inputDigest: intake.digest, outputArtifactVersion: "1.0.0", input: { requirementSummaryRef: intake.ref },
    });
    ok(design.execution.success === true, "C7 fixture: design succeeds on the current intake revision");
    const dp = h.runStore.listCapabilityExecutions(h.id.runId)
      .find((e) => e.status === "succeeded" && e.capability === "solution-design")!;
    materializeProducerRevision(h.runStore, h.id.requirementId, h.id.runId, dp, () => TS);
    // task-planning tries to consume the STALE grandparent (intake) revision
    // instead of the current solution-design predecessor.
    await expectJournalCode(() => makeEntry(h).execute({
      requirementId: h.id.requirementId, identity: h.id, capability: "task-planning",
      executionRole: "primary" as const, inputArtifactRef: intake.ref, inputArtifactVersion: intake.version,
      inputDigest: intake.digest, outputArtifactVersion: "1.0.0",
      input: { solutionDesignRef: design.recoveryContext.capabilityStates[1]!.effectiveOutputArtifactRef! },
    }), "INVALID_INPUT", "C7 a stale non-current-predecessor revision cannot advance the chain");
  }

  // ── C8 unclosed finding: a PASS verdict carrying unresolved findings is BLOCKED ──
  {
    const h = makeHarness("C8");
    const tech = await seedIntake(h);
    const design = await makeEntry(h).execute({
      requirementId: h.id.requirementId, identity: h.id, capability: "solution-design",
      executionRole: "primary" as const, inputArtifactRef: tech.ref, inputArtifactVersion: tech.version,
      inputDigest: tech.digest, outputArtifactVersion: "1.0.0", input: { requirementSummaryRef: tech.ref },
    });
    const dp = h.runStore.listCapabilityExecutions(h.id.runId)
      .find((e) => e.status === "succeeded" && e.capability === "solution-design")!;
    materializeProducerRevision(h.runStore, h.id.requirementId, h.id.runId, dp, () => TS);
    const ds = design.recoveryContext.capabilityStates[1]!;
    const unclosed = [{ id: "F-C8-1", severity: "CRITICAL", message: "unresolved blocker", cause: "REGRESSION" }];
    const scan = await makeEntry(h, {
      codexRunner: { run: async (req: ExecutionRequest) => qualified(req, { unresolvedFindings: unclosed }) },
    }).execute({
      requirementId: h.id.requirementId, identity: h.id, capability: "solution-gate",
      executionRole: "adversarial_scan" as const,
      inputArtifactRef: ds.effectiveOutputArtifactRef!, inputArtifactVersion: ds.effectiveOutputArtifactVersion!,
      inputDigest: ds.effectiveOutputDigest!, outputArtifactVersion: "1.0.0",
      input: { solutionDesignRef: ds.effectiveOutputArtifactRef! },
    });
    const sp = h.runStore.listCapabilityExecutions(h.id.runId)
      .find((e) => e.status === "succeeded" && e.capability === "solution-gate" && e.executionRole === "adversarial_scan")!;
    materializeProducerRevision(h.runStore, h.id.requirementId, h.id.runId, sp, () => TS);
    const ss = scan.recoveryContext.capabilityStates[2]!;
    // formal_verdict returns PASS but the finding ledger still carries a CRITICAL issue.
    const verdict = await makeEntry(h, {
      hermesRunnerOverride: { run: async (req: ExecutionRequest) => qualified(req, { gateResult: "PASS", unresolvedFindings: unclosed }) } as never,
    }).execute({
      requirementId: h.id.requirementId, identity: h.id, capability: "solution-gate",
      executionRole: "formal_verdict" as const,
      inputArtifactRef: ss.effectiveOutputArtifactRef!, inputArtifactVersion: ss.effectiveOutputArtifactVersion!,
      inputDigest: ss.effectiveOutputDigest!, outputArtifactVersion: "1.0.0",
      input: { findingsLedgerRef: ss.unresolvedFindingsRef! },
    });
    const verdictTerminal = h.runStore.listCapabilityExecutions(h.id.runId)
      .filter((e) => e.capability === "solution-gate" && e.executionRole === "formal_verdict").at(-1)!;
    eq(verdictTerminal.gateResult, "PASS", "C8 the verdict itself is recorded");
    eq(verdictTerminal.nextStepEligibility, "BLOCKED", "C8 an unclosed-finding PASS is BLOCKED, never eligible to advance");
    ok(verdict.recoveryContext.nextCapability !== "task-planning", "C8 a blocked gate never advances to the next point (task-planning)");
  }

  // ── C9 out-of-bound write: a binding may not expand side effects beyond the canonical set ──
  {
    const h = makeHarness("C9");
    const drift = INITIAL_BINDING_REGISTRY.bindings
      .map((b) => b.bindingId === "binding-kimi-solution-design-primary"
        ? Object.freeze({ ...b, allowedSideEffects: Object.freeze(["workspace-local-write", "git-push"] as readonly string[]) })
        : b);
    const driftedRegistry = Object.freeze({ version: "1", bindings: Object.freeze(drift) as never });
    let caught: unknown;
    try {
      validateBindingRegistry(driftedRegistry);
    } catch (e) { caught = e; }
    ok(caught instanceof Error && /side effects/.test(caught.message),
      "C9 an out-of-bound side-effect expansion is rejected at registry validation");
    // And such a registry can never construct an executing entry.
    let entryCaught: unknown;
    try {
      new LoopCapabilityEntry({
        runStore: h.runStore, artifactStore: h.artifactStore,
        bindingRegistry: driftedRegistry,
        gateway: null as never,
      });
    } catch (e) { entryCaught = e; }
    ok(entryCaught instanceof Error, "C9 no executable entry can be built from an out-of-bound binding");
  }

  console.log(`loop-w5 invalid-output no-advance: ${passed} passed`);
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
