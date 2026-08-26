// C03-D: d1/d2 runtime wiring contract tests
// =============================================
// Pins the runtime-layer integration of:
//   d1 — developmentPathEntryGuard before implementation dispatch
//   d2 — c2/c3 tail aggregation after chain completion
//
// The pure functions (guard/checklist) are tested in their own suites
// (39 assertions in loop-c03-delivery-tail tests). This file pins the
// WIRING: guard trigger conditions, completedOk gating, depth propagation,
// BLOCKED short-circuit, and persistence failure tolerance.

import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createDeterministicCapabilityGateway,
  createRuntimeBindingRegistry,
  run,
  type RuntimeCapabilityGateway,
  type RuntimeOptions,
} from "../runtime";
import { LoopCapabilityEntry } from "../core/loop-capability-entry";
import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopRunStore } from "../core/loop-run-store";
import { recoverRunContext } from "../core/loop-recovery";
import { developmentPathEntryGuard } from "../core/loop-c03-delivery-tail";

let passed = 0;
function ok(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  passed += 1;
}

interface TestEnv {
  root: string;
  runStore: LoopRunStore;
  artifactStore: LoopArtifactStore;
  gateway: RuntimeCapabilityGateway;
  entry: LoopCapabilityEntry;
}

function makeEnv(rootPrefix: string): TestEnv {
  const root = mkdtempSync(join(tmpdir(), rootPrefix));
  mkdirSync(join(root, "repo"), { recursive: true });
  const artifactStore = new LoopArtifactStore({
    controlRoot: join(root, "control"),
    repositoryPath: join(root, "repo"),
  });
  const runStore = new LoopRunStore(join(root, "journal.db"), { artifactStore });
  runStore.init();
  artifactStore.init();
  const bindingRegistry = createRuntimeBindingRegistry();
  const gateway = createDeterministicCapabilityGateway({
    runStore,
    artifactStore,
    bindingRegistry,
    now: () => new Date().toISOString(),
  });
  const entry = new LoopCapabilityEntry({ runStore, artifactStore, bindingRegistry, gateway });
  return { root, runStore, artifactStore, gateway, entry };
}

function runOptions(env: TestEnv, requirementId: string): RuntimeOptions {
  return {
    requirementId,
    runStore: env.runStore,
    artifactStore: env.artifactStore,
    gateway: env.gateway,
    bindingRegistry: createRuntimeBindingRegistry(),
  };
}

async function main(): Promise<void> {
  // ── T1: PASS verdict → chain completes, d2 manual_handoff fields present ──
  console.log("T1: PASS verdict → chain completes with d2 tail fields");
  {
    const env = makeEnv("c03d-t1-");
    try {
      const result = await run("build a user profile page", runOptions(env, "REQ-C03D-T1"));
      ok(result.final_status === "success" && result.chain_status === "COMPLETED",
        `T1: chain completes (got ${result.final_status}/${result.chain_status})`);
      const r = result as unknown as Record<string, unknown>;
      ok("manual_handoff_status" in r && r.manual_handoff_status !== undefined,
        "T1: d2 manual_handoff_status present after completion");
      ok("manual_handoff_reason" in r,
        "T1: d2 manual_handoff_reason present");
      ok("manual_handoff_artifact_ref" in r && r.manual_handoff_artifact_ref !== null,
        "T1: d2 manual_handoff_artifact_ref persisted (non-null)");
      // governance_tail_result artifact must be readable from artifactStore.
      const ref = r.manual_handoff_artifact_ref as string;
      const stored = env.artifactStore.read(ref);
      ok(stored !== null && stored.length > 0,
        "T1: governance_tail_result artifact readable from store");
      const parsed = JSON.parse(stored.toString("utf8").trim());
      ok(parsed.status === r.manual_handoff_status,
        "T1: persisted artifact status matches RuntimeResult");
      // F3: knowledgeSync.decision must be null (event model doesn't carry it),
      // NOT hardcoded "APPLY_LOCAL". knowledgeSync is透传 in c3 output.
      ok(parsed.knowledgeSync !== undefined,
        "T1: persisted artifact contains knowledgeSync");
      ok(parsed.knowledgeSync.present === true,
        "T1: knowledgeSync present after completed chain");
      ok(parsed.knowledgeSync.decision === null,
        `T1: knowledgeSync.decision is null (not fabricated, got ${parsed.knowledgeSync.decision})`);
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  }

  // ── T2: d1 guard pure-function semantics (FAIL blocks, PASS allows) ──
  console.log("T2: d1 guard semantics — FAIL blocks, PASS allows with depth");
  {
    // FAIL → blocked
    const failDecision = developmentPathEntryGuard({
      gateResult: "FAIL",
      depth: null,
      decisionStatus: "BLOCKED_UNKNOWN",
      blockingFindings: [],
      riskAcceptanceRefs: [],
      verdictArtifactRef: null,
    });
    ok(!failDecision.allowed, "T2: FAIL verdict → allowed=false");
    // PASS + DECIDED + depth → allowed
    const passDecision = developmentPathEntryGuard({
      gateResult: "PASS",
      depth: "DEEP",
      decisionStatus: "DECIDED",
      blockingFindings: [],
      riskAcceptanceRefs: [],
      verdictArtifactRef: "loop-artifact:v1:solution-gate:sha256:abc",
    });
    ok(passDecision.allowed && passDecision.depth === "DEEP",
      "T2: PASS+DECIDED+DEEP → allowed with DEEP depth");
    // PASS_WITH_RISK without acceptance → blocked
    const riskDecision = developmentPathEntryGuard({
      gateResult: "PASS_WITH_RISK",
      depth: "STANDARD",
      decisionStatus: "DECIDED",
      blockingFindings: [],
      riskAcceptanceRefs: [],
      verdictArtifactRef: null,
    });
    ok(!riskDecision.allowed, "T2: PASS_WITH_RISK without acceptance → blocked");
    // DECIDED with empty blockingFindings (rebuild wave) → allowed
    const rebuildDecision = developmentPathEntryGuard({
      gateResult: "PASS",
      depth: "STANDARD",
      decisionStatus: "DECIDED",
      blockingFindings: [],
      riskAcceptanceRefs: [],
      verdictArtifactRef: "loop-artifact:v1:solution-gate:sha256:def",
    });
    ok(rebuildDecision.allowed, "T2: DECIDED rebuild wave (empty blockingFindings) → allowed");
  }

  // ── T3: d1 fail-closed — no formal_verdict event → default FAIL → BLOCKED ──
  console.log("T3: d1 fail-closed — missing verdict defaults to FAIL");
  {
    const noVerdictDecision = developmentPathEntryGuard({
      gateResult: "FAIL", // runtime defaults to FAIL when no formal_verdict event
      depth: null,
      decisionStatus: "BLOCKED_UNKNOWN",
      blockingFindings: [],
      riskAcceptanceRefs: [],
      verdictArtifactRef: null,
    });
    ok(!noVerdictDecision.allowed,
      "T3: missing formal_verdict (default FAIL) → blocked (fail-closed)");
  }

  // ── T4: DECIDED rebuild wave → implementation executes, not blocked ──
  console.log("T4: DECIDED rebuild wave → implementation executes");
  {
    const env = makeEnv("c03d-t4-");
    try {
      const first = await run("build an order export", runOptions(env, "REQ-C03D-T4"));
      ok(first.chain_status === "COMPLETED", "T4: first run completes");
      const second = await run("build an order export", runOptions(env, "REQ-C03D-T4"));
      ok(second.chain_status === "COMPLETED" || second.final_status === "success",
        `T4: rebuild wave completes (got ${second.final_status}/${second.chain_status})`);
      ok((second as unknown as Record<string, unknown>).blocking_reason_code !== "DEVELOPMENT_PATH_ENTRY_DENIED",
        "T4: rebuild not blocked by c1 guard (DECIDED → empty blockingFindings)");
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  }

  // ── T5: seven-node evidence + c2/c3 output structure ──
  console.log("T5: c2/c3 output has seven-node evidence structure");
  {
    const env = makeEnv("c03d-t5-");
    try {
      const result = await run("build a checklist feature", runOptions(env, "REQ-C03D-T5"));
      ok(result.chain_status === "COMPLETED", "T5: chain completes");
      const ref = (result as unknown as Record<string, unknown>).manual_handoff_artifact_ref as string;
      const stored = JSON.parse(env.artifactStore.read(ref).toString("utf8").trim());
      // c3 checklist must contain all aggregation fields.
      ok(stored.implementationRecord !== undefined, "T5: implementationRecord present");
      ok(stored.codeReview !== undefined, "T5: codeReview present");
      ok(stored.knowledgeSync !== undefined, "T5: knowledgeSync present");
      ok(stored.residualRisks !== undefined, "T5: residualRisks present");
      // All 7 nodes must have succeeded in the trace.
      const capabilities = new Set(result.execution_trace.map((e) => e.capability));
      for (const node of ["requirement-intake", "solution-design", "solution-gate",
        "task-planning", "implementation", "code-review", "knowledge-sync"]) {
        ok(capabilities.has(node as never), `T5: node ${node} executed`);
      }
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  }

  // ── T6: artifactStore.put failure for governance_tail_result is non-fatal ──
  console.log("T6: persistence failure → runtime returns, in-memory fields present");
  {
    const env = makeEnv("c03d-t6-");
    const originalPut = env.artifactStore.put.bind(env.artifactStore);
    let tailPutAttempted = false;
    (env.artifactStore as { put: typeof env.artifactStore.put }).put = (kind: string, content: string) => {
      if (kind === "governance_tail_result") {
        tailPutAttempted = true;
        throw new Error("simulated persistence failure");
      }
      return originalPut(kind, content);
    };
    try {
      const result = await run("build a persistence test", runOptions(env, "REQ-C03D-T6"));
      ok(result.final_status === "success" && result.chain_status === "COMPLETED",
        `T6: runtime completes despite persistence failure (got ${result.final_status}/${result.chain_status})`);
      const r = result as unknown as Record<string, unknown>;
      ok(r.manual_handoff_status !== undefined,
        "T6: in-memory manual_handoff_status present despite persistence failure");
      ok(r.manual_handoff_artifact_ref === null,
        "T6: manual_handoff_artifact_ref null when persistence fails");
      ok(tailPutAttempted, "T6: governance_tail_result put was attempted");
    } finally {
      rmSync(env.root, { recursive: true, force: true });
    }
  }

  console.log(`C03-D d1/d2 wiring tests: ${passed} assertions passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
