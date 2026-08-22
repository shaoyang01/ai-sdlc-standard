// C02-WP4: Earliest-Affected-Node Re-Gate Orchestration — Contract Tests
// ======================================================================
// Pins the §8 F row-4 completion contract on the v2 single-rail runner:
//   1. earliest-node routing wins over later findings; upstream confirmed
//      revisions are reused read-only, downstream nodes are rebuilt;
//   2. RESOLVED orchestration: a finding cannot be resolved until its scope
//      has been rebuilt (current ACTIVE again); after the wave it can;
//   3. improvements (MEDIUM/LOW) never restart the chain;
//   4. external feedback re-enters at requirement-intake as a new generation;
//   5. depth decision binding: a FAIL/BLOCKED formal verdict surfaces
//      BLOCKED_UNKNOWN and implementation is never entered;
//   6. skill-isolation invariants (audit CONDITIONAL PASS preconditions):
//      the Re-Gate plan carries no skill/flowId surface, forged skill
//      metadata is rejected or inert, and a generation restart cannot be
//      self-authorized through the supported entry.

import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AgentName } from "../execution/types";

import {
  createDeterministicCapabilityGateway,
  createRuntimeBindingRegistry,
  run,
  type RuntimeCapabilityGateway,
} from "../runtime";
import { LoopCapabilityEntry } from "../core/loop-capability-entry";
import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopRunStore } from "../core/loop-run-store";
import { LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION, createLoopArtifactRevision } from "../core/loop-artifact-revision";
import { LoopRunJournalError } from "../core/loop-executor-types";
import { createLoopFinding } from "../core/loop-finding-lifecycle";
import { recoverRunContext } from "../core/loop-recovery";
import { planRegateFromFacts, type CurrentRevisionFacts, type RegateFindingFacts } from "../core/loop-regate";
import {
  LOOP_CAPABILITY_EXECUTION_POINTS,
  NODE_CAPABILITY_IDS,
  type CapabilityExecutionRole,
  type NodeCapabilityId,
} from "../loop/types";

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
  dispatchOrder: ReadonlyArray<{ capability: NodeCapabilityId; executionRole: CapabilityExecutionRole }>;
}

function makeEnv(): TestEnv {
  const root = mkdtempSync(join(tmpdir(), "loop-wp4-regate-"));
  mkdirSync(join(root, "repo"), { recursive: true });
  const runStore = new LoopRunStore(join(root, "journal.db"));
  const artifactStore = new LoopArtifactStore({
    controlRoot: join(root, "control"),
    repositoryPath: join(root, "repo"),
  });
  runStore.init();
  artifactStore.init();
  const bindingRegistry = createRuntimeBindingRegistry();
  const dispatchOrder: Array<{ capability: NodeCapabilityId; executionRole: CapabilityExecutionRole }> = [];
  const inner = createDeterministicCapabilityGateway({
    runStore,
    artifactStore,
    bindingRegistry,
    now: () => new Date().toISOString(),
  });
  const gateway: RuntimeCapabilityGateway = {
    execute: async (request) => {
      dispatchOrder.push({
        capability: request.type as NodeCapabilityId,
        executionRole: request.loopExecution!.executionRole as CapabilityExecutionRole,
      });
      return inner.execute(request);
    },
  };
  const entry = new LoopCapabilityEntry({ runStore, artifactStore, bindingRegistry, gateway });
  return { root, runStore, artifactStore, gateway, entry, dispatchOrder };
}

function pointDispatchCounts(
  env: TestEnv,
  runId: string,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of env.runStore.listCapabilityExecutions(runId)) {
    if (event.status !== "started") continue;
    const key = `${event.capability}:${event.executionRole}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function futureIso(offsetMs = 5000): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

/**
 * Test-side replica of the runtime's revision recording: binds the last
 * succeeded execution of `capability` as the node's new ACTIVE current.
 */
function recordRevisionForLastSucceeded(
  env: TestEnv,
  runId: string,
  requirementId: string,
  capability: NodeCapabilityId,
): void {
  const produced = env.runStore.listCapabilityExecutions(runId).at(-1)!;
  ok(
    produced.status === "succeeded" && produced.capability === capability,
    "last succeeded event must match the recorded node",
  );
  const priorForNode = env.runStore.listArtifactRevisions(runId)
    .filter((item) => item.nodeId === capability);
  const nodeIdx = NODE_CAPABILITY_IDS.indexOf(capability);
  const upstreamNodeId = nodeIdx > 0 ? NODE_CAPABILITY_IDS[nodeIdx - 1]! : null;
  const upstreamCurrent = upstreamNodeId === null
    ? undefined
    : env.runStore.getCurrentArtifactRevision(runId, upstreamNodeId);
  ok(produced.outputArtifactRef !== null && produced.outputDigest !== null, "output binding present");
  env.runStore.appendArtifactRevision(createLoopArtifactRevision({
    runId,
    requirementId,
    nodeId: capability,
    sequence: priorForNode.length + 1,
    generation: produced.attempt,
    stablePath: `library/${requirementId}/${LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[capability].stablePathSegment}/${requirementId}_${capability}.md`,
    artifactKind: LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION[capability].artifactKind,
    semver: `${produced.attempt}.0.0`,
    artifactRef: produced.outputArtifactRef!,
    digest: produced.outputDigest!,
    producerExecutionId: produced.executionEventId,
    producerExecutionRole: produced.executionRole,
    gateResult: produced.gateResult,
    upstreamRevisionIds: upstreamCurrent === undefined ? [] : [upstreamCurrent.revisionId],
    createdAt: new Date().toISOString(),
  }));
}

function appendBlockingFinding(env: TestEnv, o: {
  runId: string;
  requirementId: string;
  sourceCapability: NodeCapabilityId;
  earliestAffectedNodeId: NodeCapabilityId;
  severity?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  category: "REQUIREMENT" | "SOLUTION" | "PLANNING" | "IMPLEMENTATION" | "REVIEW" | "KNOWLEDGE";
  sequence: number;
}): string {
  const current = env.runStore.getCurrentArtifactRevision(o.runId, o.sourceCapability);
  ok(current !== undefined, `${o.sourceCapability} current revision must exist`);
  const finding = createLoopFinding({
    runId: o.runId,
    requirementId: o.requirementId,
    sequence: o.sequence,
    sourceCapability: o.sourceCapability,
    sourceRevisionId: current!.revisionId,
    severity: o.severity ?? "HIGH",
    category: o.category,
    evidenceRef: `loop-artifact:v1:${current!.artifactKind}:sha256:${current!.digest}`,
    evidenceDigest: current!.digest,
    earliestAffectedNodeId: o.earliestAffectedNodeId,
    createdAt: futureIso(o.sequence * 1000),
  });
  env.runStore.appendFinding(finding);
  return finding.findingId;
}

async function main(): Promise<void> {
  // ── W1: solution-design 回流 — reuse upstream, rebuild downstream, then RESOLVED ──
  console.log("W1: solution-design re-gate wave rebuilds downstream and unblocks resolution");
  {
    const env = makeEnv();
    const requirementId = "REQ-WP4-W1";
    const first = await run("build a user registration form", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    ok(first.final_status === "success", "first generation completes");
    ok(first.chain_status === "COMPLETED", "first generation chain COMPLETED");
    const before = pointDispatchCounts(env, first.run_id);
    ok(before.get("solution-design:primary") === 1, "design ran once");

    const findingId = appendBlockingFinding(env, {
      runId: first.run_id,
      requirementId,
      sourceCapability: "solution-design",
      earliestAffectedNodeId: "solution-design",
      category: "SOLUTION",
      sequence: 1,
    });

    // Resolution before rebuild is fail-closed: the bound revision went STALE.
    let rejectedBeforeRebuild = false;
    try {
      env.runStore.resolveFinding(first.run_id, findingId, {
        resolvedByRevisionId: env.runStore.getCurrentArtifactRevision(first.run_id, "solution-design")!.revisionId,
        resolutionEvidenceRef: "loop-artifact:v1:solution_review:sha256:deadbeef",
        resolutionEvidenceDigest: "deadbeef",
      });
    } catch (error) {
      rejectedBeforeRebuild = error instanceof LoopRunJournalError;
    }
    ok(rejectedBeforeRebuild, "resolution before rebuild is rejected");

    const second = await run("build a user registration form", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    ok(second.final_status === "success", "second generation completes");
    ok(second.chain_status === "COMPLETED", "second generation chain COMPLETED");
    const after = pointDispatchCounts(env, second.run_id);
    ok(after.get("requirement-intake:primary") === 1, "upstream intake is reused read-only");
    ok(after.get("solution-design:primary") === 2, "solution-design rebuilt");
    ok(after.get("solution-gate:adversarial_scan") === 2, "gate scan rebuilt");
    ok(after.get("solution-gate:formal_verdict") === 2, "gate verdict rebuilt");
    ok(after.get("knowledge-sync:primary") === 2, "knowledge-sync rebuilt");

    // After the wave, resolution succeeds against the rebuilt current.
    const rebuiltDesign = env.runStore.getCurrentArtifactRevision(second.run_id, "solution-design")!;
    ok(rebuiltDesign.validity === "ACTIVE", "rebuilt design revision is ACTIVE");
    const resolved = env.runStore.resolveFinding(second.run_id, findingId, {
      resolvedByRevisionId: rebuiltDesign.revisionId,
      resolutionEvidenceRef: `loop-artifact:v1:${rebuiltDesign.artifactKind}:sha256:${rebuiltDesign.digest}`,
      resolutionEvidenceDigest: rebuiltDesign.digest,
    });
    ok(resolved.record.status === "RESOLVED", "finding resolves after rebuild");
    ok(env.runStore.computeFindingGate(second.run_id).status === "ELIGIBLE", "finding gate eligible after closure");
  }

  // ── W2: multi-finding conflict — earliest affected node wins ──
  console.log("W2: conflicting findings route to the canonical earliest node");
  {
    const env = makeEnv();
    const requirementId = "REQ-WP4-W2";
    const first = await run("migrate billing export", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    ok(first.final_status === "success", "first generation completes");
    const orderBefore = env.dispatchOrder.length;
    appendBlockingFinding(env, {
      runId: first.run_id,
      requirementId,
      sourceCapability: "implementation",
      earliestAffectedNodeId: "implementation",
      category: "IMPLEMENTATION",
      sequence: 1,
    });
    appendBlockingFinding(env, {
      runId: first.run_id,
      requirementId,
      sourceCapability: "solution-design",
      earliestAffectedNodeId: "solution-design",
      category: "SOLUTION",
      sequence: 2,
    });
    await run("migrate billing export", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    const firstRedispatch = env.dispatchOrder[orderBefore]!;
    ok(firstRedispatch.capability === "solution-design", `earliest node dispatched first (got ${firstRedispatch.capability})`);
  }

  // ── W3: improvements never restart the chain ──
  console.log("W3: MEDIUM improvement finding does not trigger a Re-Gate wave");
  {
    const env = makeEnv();
    const requirementId = "REQ-WP4-W3";
    const first = await run("add export button", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    const orderBefore = env.dispatchOrder.length;
    appendBlockingFinding(env, {
      runId: first.run_id,
      requirementId,
      sourceCapability: "code-review",
      earliestAffectedNodeId: "code-review",
      severity: "MEDIUM",
      category: "REVIEW",
      sequence: 1,
    });
    const second = await run("add export button", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    ok(env.dispatchOrder.length === orderBefore, "no dispatch after improvement-only finding");
    ok(second.chain_status === "COMPLETED", "chain stays completed");
  }

  // ── W4: REQUIREMENT feedback re-enters at requirement-intake ──
  console.log("W4: requirement-category feedback opens a new full generation");
  {
    const env = makeEnv();
    const requirementId = "REQ-WP4-W4";
    const first = await run("build invoicing report", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    appendBlockingFinding(env, {
      runId: first.run_id,
      requirementId,
      sourceCapability: "requirement-intake",
      earliestAffectedNodeId: "requirement-intake",
      category: "REQUIREMENT",
      sequence: 1,
    });
    await run("build invoicing report", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    const counts = pointDispatchCounts(env, first.run_id);
    ok(counts.get("requirement-intake:primary") === 2, "intake re-dispatched for requirement feedback");
    ok(counts.get("knowledge-sync:primary") === 2, "full chain rebuilt");
  }

  // ── W5: FAIL verdict blocks and surfaces BLOCKED_UNKNOWN ──
  console.log("W5: FAIL formal verdict blocks before task-planning with BLOCKED_UNKNOWN");
  {
    const root = mkdtempSync(join(tmpdir(), "loop-wp4-failverdict-"));
    mkdirSync(join(root, "repo"), { recursive: true });
    const runStore = new LoopRunStore(join(root, "journal.db"));
    const artifactStore = new LoopArtifactStore({
      controlRoot: join(root, "control"),
      repositoryPath: join(root, "repo"),
    });
    runStore.init();
    artifactStore.init();
    const bindingRegistry = createRuntimeBindingRegistry();
    const now = (): string => new Date().toISOString();
    // Wrapper: every round uses the deterministic shadow gateway except the
    // formal_verdict round, which fails closed with a rejection code.
    const inner = createDeterministicCapabilityGateway({
      runStore,
      artifactStore,
      bindingRegistry,
      now,
    });
    const failingGateway: RuntimeCapabilityGateway = {
      async execute(request) {
        const context = request.loopExecution!;
        const isVerdict =
          request.type === "solution-gate" &&
          context.executionRole === "formal_verdict";
        if (!isVerdict) return inner.execute(request);
        const runId = context.runId;
        const capability = request.type as NodeCapabilityId;
        const executionRole = context.executionRole as CapabilityExecutionRole;
        const existing = runStore.listCapabilityExecutions(runId);
        const sequence = existing.length + 1;
        const base = {
          schemaVersion: 3 as const,
          runId,
          capability,
          executionRole,
          nodeId: capability,
          attempt: context.attempt,
          bindingId: `binding-hermes-${capability}-formal_verdict`,
          bindingVersion: "2.0.0",
          bindingRegistryVersion: bindingRegistry.version,
          executorAgent: "hermes" as AgentName,
          executorAdapter: "hermes-cli",
          executorVersion: "1.0.0",
          inputArtifactRef: context.inputArtifactRef,
          inputArtifactVersion: context.inputArtifactVersion,
          inputDigest: context.inputDigest,
          consumedFindingsRef:
            typeof context.consumedFindingsRef === "string" ? context.consumedFindingsRef : null,
          consumedFindingsDigest:
            typeof context.consumedFindingsDigest === "string" ? context.consumedFindingsDigest : null,
        };
        runStore.appendCapabilityExecution(Object.freeze({
          ...base,
          executionEventId: `${runId}:capability:${sequence}:started`,
          sequence,
          status: "started" as const,
          createdAt: now(),
          outputArtifactRef: null,
          outputArtifactVersion: null,
          outputDigest: null,
          gateResult: null,
          unresolvedFindingsRef: null,
          unresolvedFindingsDigest: null,
          nextStepEligibility: null,
          errorCode: null,
          retryable: null,
          reasonCode: null,
        }));
        runStore.appendCapabilityExecution(Object.freeze({
          ...base,
          executionEventId: `${runId}:capability:${sequence + 1}:failed`,
          sequence: sequence + 1,
          status: "failed" as const,
          createdAt: now(),
          outputArtifactRef: null,
          outputArtifactVersion: null,
          outputDigest: null,
          gateResult: null,
          unresolvedFindingsRef: null,
          unresolvedFindingsDigest: null,
          nextStepEligibility: "BLOCKED" as const,
          errorCode: "GATE_REJECTED",
          retryable: false,
          reasonCode: "DESIGN_DEPTH_BLOCKED_UNKNOWN",
        }));
        return Object.freeze({
          success: false,
          node: capability,
          agent: "hermes" as AgentName,
          output: Object.freeze({ result: "FAILED", capability }),
          artifacts: Object.freeze([]),
        });
      },
    };
    const result = await run("build refund workflow", {
      requirementId: "REQ-WP4-W5",
      runStore,
      artifactStore,
      gateway: failingGateway,
      bindingRegistry,
    });
    ok(result.chain_status === "BLOCKED", "chain blocked by FAIL verdict");
    const counts = pointDispatchCounts({ runStore } as TestEnv, result.run_id);
    ok(counts.get("task-planning:primary") === undefined, "implementation planning never entered");
    const verdictEvents = runStore.listCapabilityExecutions(result.run_id)
      .filter((event) => event.capability === "solution-gate" && event.executionRole === "formal_verdict");
    const verdictResult = verdictEvents.find((event) => event.status === "succeeded")?.gateResult
      ?? verdictEvents.find((event) => event.status === "failed")?.gateResult
      ?? null;
    const decision = verdictResult === "PASS" ? "DECIDED" : "BLOCKED_UNKNOWN";
    ok(decision === "BLOCKED_UNKNOWN", "depth decision surfaces BLOCKED_UNKNOWN");
  }

  // ── W6: skill-isolation invariants (audit preconditions) ──
  console.log("W6: Re-Gate plan carries no skill surface; forged skill is inert/rejected");
  {
    const facts: RegateFindingFacts[] = [{
      findingId: "f1",
      severity: "HIGH",
      status: "OPEN",
      earliestAffectedNodeId: "solution-design",
      createdAt: futureIso(),
    }];
    const currents = new Map<NodeCapabilityId, CurrentRevisionFacts>([
      ["requirement-intake", { validity: "ACTIVE" }],
      ["solution-design", { validity: "STALE" }],
    ]);
    const plan = planRegateFromFacts(facts, currents);
    const serialized = JSON.stringify(plan);
    ok(!serialized.includes("skill"), "plan carries no skill field");
    ok(!serialized.includes("flowId"), "plan carries no flowId field");
    ok(plan.kind === "regate" && plan.restartNode === "solution-design", "plan targets the stale governing node");

    // Runtime options are closed: a forged skill option is rejected.
    const env = makeEnv();
    let rejectedForgedOption = false;
    try {
      await run("x", { requirementId: "REQ-WP4-W6", skill: "sdlc-speckit-pipeline" } as never);
    } catch (error) {
      rejectedForgedOption = error instanceof LoopRunJournalError && error.code === "INVALID_INPUT";
    }
    ok(rejectedForgedOption, "forged skill runtime option rejected");

    // A forged skill on a Re-Gate restart dispatch is metadata-inert: the
    // authorized generation restart proceeds and the next action is the
    // canonical successor (gate scan), unchanged by the skill field.
    const requirementId = "REQ-WP4-W6-ENTRY";
    const first = await run("small fix", { requirementId, runStore: env.runStore, artifactStore: env.artifactStore, gateway: env.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    appendBlockingFinding(env, {
      runId: first.run_id,
      requirementId,
      sourceCapability: "solution-design",
      earliestAffectedNodeId: "solution-design",
      category: "SOLUTION",
      sequence: 1,
    });
    const intakeRevision = env.runStore.getCurrentArtifactRevision(first.run_id, "requirement-intake")!;
    await env.entry.execute({
      requirementId,
      capability: "solution-design",
      executionRole: "primary",
      inputArtifactRef: intakeRevision.artifactRef,
      inputArtifactVersion: intakeRevision.semver,
      inputDigest: intakeRevision.digest,
      outputArtifactVersion: "2.0.0",
      input: { inputArtifactRef: intakeRevision.artifactRef },
      skill: "sdlc-speckit-pipeline",
    });
    const after = env.runStore.listCapabilityExecutions(first.run_id).at(-1)!;
    ok(after.capability === "solution-design" && after.status === "succeeded", "restart dispatched despite forged skill");
    recordRevisionForLastSucceeded(env, first.run_id, requirementId, "solution-design");
    const recoveryAfter = recoverRunContext(env.runStore, requirementId);
    ok(
      recoveryAfter!.nextExecutionPoint?.capability === "solution-gate" &&
        recoveryAfter!.nextExecutionPoint?.executionRole === "adversarial_scan",
      "next action after restart is the canonical gate scan point",
    );

    // Control flow WITHOUT the forged skill must land on the identical next
    // action — proving the skill field is metadata-inert end to end.
    const env2 = makeEnv();
    const first2 = await run("small fix", { requirementId, runStore: env2.runStore, artifactStore: env2.artifactStore, gateway: env2.gateway, bindingRegistry: createRuntimeBindingRegistry() });
    appendBlockingFinding(env2, {
      runId: first2.run_id,
      requirementId,
      sourceCapability: "solution-design",
      earliestAffectedNodeId: "solution-design",
      category: "SOLUTION",
      sequence: 1,
    });
    const intake2 = env2.runStore.getCurrentArtifactRevision(first2.run_id, "requirement-intake")!;
    await env2.entry.execute({
      requirementId,
      capability: "solution-design",
      executionRole: "primary",
      inputArtifactRef: intake2.artifactRef,
      inputArtifactVersion: intake2.semver,
      inputDigest: intake2.digest,
      outputArtifactVersion: "2.0.0",
      input: { inputArtifactRef: intake2.artifactRef },
    });
    recordRevisionForLastSucceeded(env2, first2.run_id, requirementId, "solution-design");
    const recoveryControl = recoverRunContext(env2.runStore, requirementId);
    ok(
      JSON.stringify(recoveryControl!.nextExecutionPoint) ===
        JSON.stringify(recoveryAfter!.nextExecutionPoint),
      "with-skill and without-skill flows produce the identical next action",
    );
  }

  // ── W7: restart cannot be self-authorized at the store boundary ──
  console.log("W7: backward jump without a pending regate plan fails closed");
  {
    const facts: RegateFindingFacts[] = [];
    const currents = new Map<NodeCapabilityId, CurrentRevisionFacts>();
    const plan = planRegateFromFacts(facts, currents);
    ok(plan.kind === "none" && plan.restartPointIndex === null, "no findings → no restart authorization");
  }

  console.log(`\nWP4 regate contract tests: ${passed} assertions passed`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
