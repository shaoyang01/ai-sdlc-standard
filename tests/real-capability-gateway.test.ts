// RealCapabilityGateway — integration seam tests (C03-E E1/E2).
//
// Two layers, because the recovery authority enforces node ORDER (a fresh run
// may only dispatch its first node; solution-gate sits at the chain tail):
//   A) End-to-end through the BASE tracing state machine on requirement-intake
//      (the legal first node): proves executePrimary override reuses started→
//      succeeded, output artifact and terminal-event wiring, with a fake
//      adapter isolating process spawn.
//   B) Pure role mapping (buildCapabilityOutcome): verdict/scan/code-review/
//      ordinary → gateResult / findings ledger, no store needed.
import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopRunStore } from "../core/loop-run-store";
import type { LoopRunIdentity } from "../core/loop-executor-types";
import { INITIAL_BINDING_REGISTRY, CAPABILITY_ARTIFACT_TYPES } from "../core/agent-capability-bindings";
import {
  NODE_OUTPUT_ENVELOPE_BEGIN,
  NODE_OUTPUT_ENVELOPE_END,
  parseNodeOutputEnvelope,
} from "../core/node-output-envelope";
import {
  RealCapabilityGateway,
  buildCapabilityOutcome,
  type RealGatewayAdapter,
} from "../execution/real-capability-gateway";
import type { ExecutionRequest } from "../execution/types";
import type { CapabilityExecutionRole, NodeCapabilityId } from "../loop/types";

const TS = "2026-08-28T10:00:00.000Z";
let passed = 0;
function check(name: string, cond: boolean): void {
  if (!cond) throw new Error(`✗ ${name}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function envelope(obj: Record<string, unknown>): string {
  return `prose before\n${NODE_OUTPUT_ENVELOPE_BEGIN}\n${JSON.stringify(obj)}\n${NODE_OUTPUT_ENVELOPE_END}\nprose after`;
}

function harness() {
  const root = mkdtempSync(join(tmpdir(), "rg-"));
  const repo = join(root, "repo");
  // W3 plan C stages the task input inside the attempt workspace, so the
  // workspace must be a real directory — "." would write into the repo.
  const workspace = join(root, "workspace");
  mkdirSync(repo, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  const id = Object.freeze({
    runId: "run-rg-001",
    requirementId: "REQ-RG-001",
    repository: "example",
    repositoryPath: repo,
    baseBranch: "loop-runtime-v1",
    expectedBaseSha: "1".repeat(40),
    taskBranch: "feature/rg-test",
    controlRoot: join(root, "control"),
    createdAt: TS,
  }) as LoopRunIdentity;
  const artifactStore = new LoopArtifactStore({ controlRoot: id.controlRoot, repositoryPath: repo });
  const runStore = new LoopRunStore(join(root, "journal.db"), { artifactStore });
  runStore.init();
  artifactStore.init();
  runStore.createRun(id);
  // externally pre-created run must land run_started before a node claim
  runStore.ensureRunStarted(id.runId);
  const input = artifactStore.put("requirement_summary", "upstream requirement body");
  return { identity: id, runStore, artifactStore, workspace, inputRef: input.artifactRef, inputDigest: input.digest };
}

function gatewayWith(runStore: LoopRunStore, artifactStore: LoopArtifactStore, text: string, workspace: string): RealCapabilityGateway {
  const fakeAdapter: RealGatewayAdapter = {
    async execute(req) {
      return { success: true, node: req.node, agent: req.providerId, output: { text }, artifacts: [] };
    },
  };
  return new RealCapabilityGateway(
    {
      capabilityTracing: {
        runStore,
        artifactStore,
        bindingRegistry: INITIAL_BINDING_REGISTRY,
        executorVersions: { codex: "1.0.0", kimi: "1.0.0", hermes: "1.0.0" },
        now: () => TS,
      },
    },
    { adapter: fakeAdapter, attemptWorkspace: () => workspace },
  );
}

function intakeRequest(
  id: LoopRunIdentity,
  inputRef: string,
  inputDigest: string,
  capability: NodeCapabilityId = "requirement-intake",
  role: CapabilityExecutionRole = "primary",
): ExecutionRequest {
  return {
    requirementId: id.requirementId,
    node: capability,
    type: capability,
    input: { inputText: "summarize the requirement" },
    loopExecution: {
      runId: id.runId,
      attempt: 1,
      executionRole: role,
      inputArtifactRef: inputRef,
      inputArtifactVersion: "1.0.0",
      inputDigest,
      outputArtifactVersion: "1.0.0",
    },
  } as unknown as ExecutionRequest;
}

async function main(): Promise<void> {
  // ── A1. first-node intake reuses the base tracing state machine ──
  {
    const h = harness();
    const text = envelope({ summary: "intake done", body: "## Requirement\nsummarized" });
    const gw = gatewayWith(h.runStore, h.artifactStore, text, h.workspace);
    const result = await gw.execute(intakeRequest(h.identity, h.inputRef, h.inputDigest));
    check("intake dispatch succeeds", result.success === true);
    check("intake hands back terminal event id", typeof result.capabilityTerminalEventId === "string");
    const events = h.runStore.listCapabilityExecutions(h.identity.runId);
    check("intake started→succeeded", events.map((e) => e.status).join(",") === "started,succeeded");
    const succeeded = events.find((e) => e.status === "succeeded")!;
    check("intake output artifact recorded", succeeded.outputArtifactRef !== null);
    check("intake is NOT_APPLICABLE gate", succeeded.gateResult === "NOT_APPLICABLE");
    check("exactly one requirement_summary artifact",
      result.artifacts.length === 1 &&
      result.artifacts[0]!.type === CAPABILITY_ARTIFACT_TYPES["requirement-intake"]);
    check("intake output carries no gateResult", result.output["gateResult"] === undefined);
  }

  // ── A2. malformed envelope on the first node never upgrades to success ──
  {
    const h = harness();
    const gw = gatewayWith(h.runStore, h.artifactStore, "no sentinels here at all", h.workspace);
    const result = await gw.execute(intakeRequest(h.identity, h.inputRef, h.inputDigest));
    check("malformed dispatch fails", result.success === false);
    const events = h.runStore.listCapabilityExecutions(h.identity.runId);
    check("malformed ends on failed terminal", events.at(-1)!.status === "failed");
    check("malformed has no succeeded", !events.some((e) => e.status === "succeeded"));
  }

  // ── B. role → outcome mapping (pure, table-driven) ──
  const verdictEnv = parseNodeOutputEnvelope(
    envelope({ summary: "s", body: "b", gateResult: "PASS", findings: [], riskAcceptanceRefs: [] }),
    "solution-gate",
    { isVerdict: true },
  );
  const v = buildCapabilityOutcome(verdictEnv, "solution-gate", "formal_verdict");
  check("verdict carries PASS gateResult", v.gateResult === "PASS");
  check("verdict carries findings ledger", Array.isArray(v.unresolvedFindings));

  const scanEnv = parseNodeOutputEnvelope(
    envelope({ summary: "s", body: "b", findings: [] }),
    "solution-gate",
    { isVerdict: false },
  );
  const sc = buildCapabilityOutcome(scanEnv, "solution-gate", "adversarial_scan");
  check("scan carries no gateResult", sc.gateResult === null);
  check("scan still carries findings ledger", Array.isArray(sc.unresolvedFindings));

  const crEnv = parseNodeOutputEnvelope(
    envelope({ summary: "s", body: "b", findings: [] }),
    "code-review",
  );
  const cr = buildCapabilityOutcome(crEnv, "code-review", "primary");
  check("code-review carries findings ledger", Array.isArray(cr.unresolvedFindings));
  check("code-review carries no gateResult", cr.gateResult === null);

  const ordEnv = parseNodeOutputEnvelope(
    envelope({ summary: "s", body: "b" }),
    "task-planning",
  );
  const ord = buildCapabilityOutcome(ordEnv, "task-planning", "primary");
  check("ordinary node carries no gateResult", ord.gateResult === null);
  check("ordinary node carries no findings", ord.unresolvedFindings === null);

  assert.ok(v);
  console.log(`\nResults: ${passed} passed, 0 failed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
