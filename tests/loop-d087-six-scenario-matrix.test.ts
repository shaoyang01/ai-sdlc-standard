// D-087 六场景离线端到端矩阵 (G4-R5 default-entry registration)
// ============================================================================
// Decision-087 决策 2 的六场景矩阵，按 G4-R5 修复后的语义全链离线驱动：
// run() + capabilitySource "real" + 假适配器（只产 E3 envelope 文本，
// 不 spawn CLI）。矩阵覆盖三条 seam 的端到端语义：
//   seam 1 节点结果模型：正文/声明 BLOCKED → blocked terminal；
//   seam 2 finding 原子登记：verdict/scan 的 finding 同事务入库 + 失效传播；
//   seam 3 生产装配：runProduction 离线装配 + 冒烟脚本不绕过生产入口。
// 场景表（Decision-087）：
//   1 implementation 正文声明 BLOCKED → terminal=BLOCKED；不派发 code-review
//   2 formal verdict FAIL + solution finding → finding 原子入库；下一点 = solution-design
//   3 code-review HIGH，earliest=implementation → implementation current 失效；同 run 重跑
//   4 PWR → 按已有规则自动推进；风险作为 risk refs 随行
//   5 resume → runId/requirementId 不变，sequence 续增
//   6 workspace 越界/根仓副作用 → 生产装配绑定 prepared worktree（离线装配等价）
import Database from "better-sqlite3";
import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExecutionRequest, ExecutionResult } from "../execution/types";
import { run } from "../runtime";
import { recoverRunContext } from "../core/loop-recovery";
import { parseProductionEntryRequest, PRODUCTION_ENTRY_SCHEMA } from "../core/loop-production-entry";
import { runProduction } from "../runtime";
import { LoopArtifactStore } from "../core/loop-artifact-store";
import { LoopRunStore } from "../core/loop-run-store";
import { createRuntimeBindingRegistry } from "../runtime";
import type { RealGatewayAdapter } from "../execution/real-capability-gateway";
import { NODE_OUTPUT_ENVELOPE_BEGIN, NODE_OUTPUT_ENVELOPE_END } from "../core/node-output-envelope";
import type { CapabilityExecutionRole, NodeCapabilityId } from "../loop/types";

let p = 0;
let f = 0;
function ok(c: unknown, m: string): asserts c {
  if (c) {
    p += 1;
    console.log(`  ✓ ${m}`);
  } else {
    f += 1;
    console.error(`  ✗ ${m}`);
  }
}

type ScriptKey = string; // `${capability}:${executionRole}`
type EnvelopeSpec = Record<string, unknown>;

function envelopeText(spec: EnvelopeSpec): string {
  const body = { nodeStatus: "SUCCEEDED", ...spec };
  return `prose before\n${NODE_OUTPUT_ENVELOPE_BEGIN}\n${JSON.stringify(body)}\n${NODE_OUTPUT_ENVELOPE_END}\nprose after`;
}

/** Scripted fake adapter: returns the next scripted envelope per capability:role. */
function scriptedAdapter(script: Map<ScriptKey, EnvelopeSpec[]>, capture?: (req: Record<string, unknown>) => void): {
  adapter: RealGatewayAdapter;
  calls: ScriptKey[];
  cwds: string[];
} {
  const calls: ScriptKey[] = [];
  const cwds: string[] = [];
  const execute = async (req: Record<string, unknown>): Promise<ExecutionResult> => {
    const key = `${String(req.capability)}:${String(req.executionRole)}`;
    calls.push(key);
    cwds.push(typeof req.cwd === "string" ? req.cwd : "<none>");
    if (capture !== undefined) capture(req);
    const queue = script.get(key) ?? [];
    // Unscripted dispatches answer with a minimal valid product.
    const spec: EnvelopeSpec = queue.length === 0
      ? { summary: "ok", body: "node product" }
      : queue.length === 1 ? { summary: "ok", body: "node product", ...queue[0]! } : { summary: "ok", body: "node product", ...queue.shift()! };
    return {
      success: true,
      node: String(req.node),
      agent: String(req.providerId),
      output: { text: envelopeText(spec) },
      artifacts: [],
    } as ExecutionResult;
  };
  return {
    calls,
    cwds,
    adapter: { execute } as unknown as RealGatewayAdapter,
  };
}

interface Harness {
  root: string;
  workspace: string;
  runStore: LoopRunStore;
  artifactStore: LoopArtifactStore;
  requirementId: string;
}

function makeHarness(name: string): Harness {
  const root = mkdtempSync(join(tmpdir(), `d087-${name}-`));
  const workspace = join(root, "attempt-ws");
  mkdirSync(workspace, { recursive: true });
  mkdirSync(join(root, "repo"), { recursive: true });
  const artifactStore = new LoopArtifactStore({
    controlRoot: join(root, "control"),
    repositoryPath: join(root, "repo"),
  });
  const runStore = new LoopRunStore(join(root, "journal.db"), { artifactStore });
  artifactStore.init();
  runStore.init();
  return {
    root,
    workspace,
    runStore,
    artifactStore,
    requirementId: `REQ-D087-${name.toUpperCase()}`,
  };
}

function closeHarness(h: Harness): void {
  h.runStore.close();
  h.artifactStore.close();
  rmSync(h.root, { recursive: true, force: true });
}

function verdictOf(h: Harness): { gateResult: unknown; decisionStatus: unknown; eligibility: unknown } {
  const verdict = h.runStore.listCapabilityExecutions(h.runStore.listRunsByRequirement(h.requirementId)[0]!.state.identity.runId)
    .filter((e) => e.capability === "solution-gate" && e.executionRole === "formal_verdict").at(-1)!;
  return { gateResult: verdict.gateResult, decisionStatus: verdict.decisionStatus, eligibility: verdict.nextStepEligibility };
}

function lastTerminal(h: Harness, capability: NodeCapabilityId, role: CapabilityExecutionRole = "primary") {
  return h.runStore.listCapabilityExecutions(
    h.runStore.listRunsByRequirement(h.requirementId)[0]!.state.identity.runId,
  ).filter((e) => e.capability === capability && e.executionRole === role).at(-1)!;
}

async function main(): Promise<void> {
  // ── 场景 1: implementation 正文声明 BLOCKED → terminal=BLOCKED；不派发 code-review ──
  console.log("scenario 1: implementation BLOCKED declaration → blocked terminal, no downstream dispatch");
  {
    const h = makeHarness("s1");
    try {
      const script = new Map<ScriptKey, EnvelopeSpec[]>([
        ["solution-gate:formal_verdict", [{ gateResult: "PASS", decisionStatus: "CONFIRMED", decisionDepth: "STANDARD", findings: [] }]],
        ["implementation:primary", [{ nodeStatus: "BLOCKED" }]],
      ]);
      const { adapter, calls } = scriptedAdapter(script);
      const result = await run("build a blocked feature", {
        requirementId: h.requirementId,
        workspaceRoot: h.root,
        runStore: h.runStore,
        artifactStore: h.artifactStore,
        capabilitySource: "real",
        realGatewayDeps: { adapter, attemptWorkspace: () => h.workspace },
      });
      ok(result.final_status === "failed" && result.chain_status === "BLOCKED",
        "blocked node keeps the run honestly failed/BLOCKED");
      const terminal = lastTerminal(h, "implementation");
      ok(terminal.status === "blocked", "the implementation terminal is blocked (not succeeded)");
      ok(terminal.nextStepEligibility === "BLOCKED", "the blocked terminal never admits downstream");
      ok(terminal.outputArtifactRef !== null, "the blocker report stays a first-class output artifact");
      ok(!calls.some((k) => k.startsWith("code-review:")), "code-review is never dispatched after a blocked node");
    } finally {
      closeHarness(h);
    }
  }

  // ── 场景 2: formal verdict FAIL + solution finding → 原子入库；下一点 = solution-design ──
  console.log("scenario 2: FAIL verdict with a solution finding registers atomically and reflows to solution-design");
  {
    const h = makeHarness("s2");
    try {
      const script = new Map<ScriptKey, EnvelopeSpec[]>([
        ["solution-gate:formal_verdict", [
          {
            gateResult: "FAIL", decisionStatus: "CONFIRMED", decisionDepth: "STANDARD",
            findings: [{ id: "F-DES-1", severity: "HIGH", message: "design misses the retention rule", category: "SOLUTION", cause: "IMPROVEMENT" }],
          },
          { gateResult: "PASS", decisionStatus: "CONFIRMED", decisionDepth: "STANDARD", findings: [] },
        ]],
      ]);
      const { adapter } = scriptedAdapter(script);
      const first = await run("build a retention feature", {
        requirementId: h.requirementId,
        workspaceRoot: h.root,
        runStore: h.runStore,
        artifactStore: h.artifactStore,
        capabilitySource: "real",
        realGatewayDeps: { adapter, attemptWorkspace: () => h.workspace },
      });
      // Seam 2: the finding is a lifecycle row created in the SAME terminal
      // transaction as the FAIL verdict, with the design current invalidated.
      const journalRunId = h.runStore.listRunsByRequirement(h.requirementId)[0]!.state.identity.runId;
      const events1 = h.runStore.listCapabilityExecutions(journalRunId);
      const verdict1 = events1.filter((e) => e.executionRole === "formal_verdict" && e.attempt === 1).at(-1)!;
      ok(verdict1.gateResult === "FAIL" && verdict1.nextStepEligibility === "BLOCKED",
        "the FAIL verdict blocks the chain");
      const finding1 = h.runStore.listFindings(journalRunId)[0]!;
      ok(finding1 !== undefined && finding1.sourceCapability === "solution-gate" &&
        finding1.earliestAffectedNodeId === "solution-design",
        "the solution finding registered atomically (gate source, design reflow)");
      // G4-R6-H3: the rebuilt design + plain PASS verdict does NOT close the
      // reflow finding — closure is the per-item resolveFinding lifecycle
      // with real repair evidence; until then the run stops BLOCKED.
      ok(first.final_status === "failed" && first.chain_status === "BLOCKED",
        "the reflow finding keeps the run blocked after the rebuilt design (PASS closes nothing)");
      const stillOpen = h.runStore.listFindings(journalRunId)[0]!;
      const verdict2 = h.runStore.listCapabilityExecutions(journalRunId)
        .filter((e) => e.executionRole === "formal_verdict" && e.attempt === 2).at(-1)!;
      ok(stillOpen.status === "OPEN",
        "the reflow finding stays OPEN after the plain PASS re-verdict (no auto batch closure)");
      // Legal per-item closure (§5.2): the discovering node re-verifies the
      // item against the rebuilt design; the closure proof binds the
      // re-adjudicating round's revision and Gate Result blob.
      const gateCurrentFact = h.runStore.listRegateCurrentFacts(journalRunId)
        .find((fact) => fact.nodeId === "solution-gate")!;
      h.runStore.resolveFinding(journalRunId, stillOpen.findingId, {
        resolvedByNodeId: "solution-gate",
        resolvedByRevisionId: gateCurrentFact.revisionId,
        resolutionEvidenceRef: verdict2.outputArtifactRef,
        resolutionEvidenceDigest: verdict2.outputDigest,
      });
      ok(h.runStore.listFindings(journalRunId)[0]!.status === "RESOLVED" &&
        h.runStore.listFindings(journalRunId)[0]!.resolutionEvidenceRef === verdict2.outputArtifactRef,
        "the itemized closure with real repair evidence resolves the finding (§5.2 re-verification preserved)");
      const second = await run("build a retention feature", {
        requirementId: h.requirementId,
        workspaceRoot: h.root,
        runStore: h.runStore,
        artifactStore: h.artifactStore,
        capabilitySource: "real",
        realGatewayDeps: { adapter, attemptWorkspace: () => h.workspace },
      });
      ok(second.final_status === "success" && second.chain_status === "COMPLETED",
        "the run completes only after the itemized closure");
    } finally {
      closeHarness(h);
    }
  }

  // ── 场景 3: code-review HIGH，earliest=implementation → current 失效；同 run 重跑 ──
  console.log("scenario 3: code-review implementation finding invalidates the implementation current and re-drives it");
  {
    const h = makeHarness("s3");
    try {
      const script = new Map<ScriptKey, EnvelopeSpec[]>([
        ["solution-gate:formal_verdict", [{ gateResult: "PASS", decisionStatus: "CONFIRMED", decisionDepth: "STANDARD", findings: [] }]],
        ["code-review:primary", [
          { findings: [{ id: "F-IMPL-1", severity: "HIGH", message: "error paths untested", category: "IMPLEMENTATION", cause: "REGRESSION" }] },
          { findings: [] },
        ]],
      ]);
      const { adapter } = scriptedAdapter(script);
      const runId = h.runStore.listRunsByRequirement(h.requirementId)[0]?.state.identity.runId;
      const first = await run("build an export button", {
        requirementId: h.requirementId,
        workspaceRoot: h.root,
        runStore: h.runStore,
        artifactStore: h.artifactStore,
        capabilitySource: "real",
        realGatewayDeps: { adapter, attemptWorkspace: () => h.workspace },
      });
      const journalRunId = h.runStore.listRunsByRequirement(h.requirementId)[0]!.state.identity.runId;
      // The wave invalidated implementation, re-drove it directly, and the
      // run stops honestly BLOCKED while the finding is OPEN.
      const designEventsS3 = h.runStore.listCapabilityExecutions(journalRunId)
        .filter((e) => e.capability === "solution-design" && e.executionRole === "primary");
      const findingRow = h.runStore.listFindings(journalRunId)[0]!;
      ok(findingRow !== undefined && findingRow.status === "OPEN" &&
        findingRow.earliestAffectedNodeId === "implementation",
        "the implementation finding registered atomically (OPEN, direct-rework scope)");
      ok(first.chain_status === "BLOCKED" && first.final_status === "failed",
        "the open implementation finding keeps the run honestly BLOCKED");
      const implAfter = lastTerminal(h, "implementation");
      ok(implAfter.attempt === 2 && implAfter.status === "succeeded",
        "the same run re-drives implementation (direct rework, no Gate re-walk)");
      const designAttempts = new Set(h.runStore.listCapabilityExecutions(journalRunId)
        .filter((e) => e.capability === "solution-design" && e.executionRole === "primary")
        .map((e) => e.attempt));
      ok(designAttempts.size === 1 && designAttempts.has(1),
        "implementation rework does not re-walk the design (I-D)");
      // §5.2 closure: the discovering node (code-review) re-verifies the fix
      // against its fresh ACTIVE current — a lifecycle action, not a node run.
      // The resolution binds the rebuilt implementation product (the fix
      // itself); the verifier is the discovering node.
      const crCurrent = h.runStore.getCurrentArtifactRevision(journalRunId, "code-review")!;
      h.runStore.resolveFinding(journalRunId, findingRow.findingId, {
        resolvedByNodeId: "code-review",
        resolvedByRevisionId: crCurrent.revisionId,
        resolutionEvidenceRef: crCurrent.artifactRef,
        resolutionEvidenceDigest: crCurrent.digest,
      });
      const recPre = recoverRunContext(h.runStore, h.requirementId);
      if (process.env.DEBUG_M === "1") {
        console.log("DEBUG s3 pre-run2:", JSON.stringify({ next: recPre?.nextExecutionPoint,
          pending: recPre?.pendingRevisionMaterialization?.producerExecution.executionEventId,
          decision: recPre?.solutionGateDecision?.status, gate: recPre?.findingGate,
          points: recPre?.executionPointStates.map((s3) => `${s3.capability}:${s3.status}:${s3.nextStepEligibility}`) }));
      }
      const second = await run("build an export button", {
        requirementId: h.requirementId,
        workspaceRoot: h.root,
        runStore: h.runStore,
        artifactStore: h.artifactStore,
        capabilitySource: "real",
        realGatewayDeps: { adapter, attemptWorkspace: () => h.workspace },
      });
      if (process.env.DEBUG_M === "1") {
        const rec3 = recoverRunContext(h.runStore, h.requirementId);
        console.log("DEBUG s3 second:", second.final_status, second.chain_status,
          JSON.stringify({ next: rec3?.nextExecutionPoint, blocking: rec3?.blockingReasonCode,
            finding: h.runStore.listFindings(journalRunId).map((x) => x.status),
            gate: rec3?.findingGate, plan: rec3?.regatePlan,
            trace: second.execution_trace.map((t3) => `${t3.capability}:${t3.status}`) }));
      }
      ok(second.final_status === "success" && second.chain_status === "COMPLETED",
        "evidence-bound closure restores eligibility and the run completes");
      void runId;
    } finally {
      closeHarness(h);
    }
  }

  // ── 场景 4: PWR → 自动推进；风险作为 risk refs 随行 ──
  console.log("scenario 4: CONFIRMED PASS_WITH_RISK auto-proceeds with the risk refs riding the delta");
  {
    const h = makeHarness("s4");
    try {
      const script = new Map<ScriptKey, EnvelopeSpec[]>([
        ["solution-gate:formal_verdict", [{
          gateResult: "PASS_WITH_RISK", decisionStatus: "CONFIRMED", decisionDepth: "STANDARD",
          riskAcceptanceRefs: ["RISK-1"], findings: [],
        }]],
      ]);
      // G4-R7-B5: capture the ACTUAL dispatch carriers — the unique risk
      // marker must reach the real staged/stdin content, not just the delta.
      const captured: { stdin: string | null; stagedText: string } = { stdin: null, stagedText: "" };
      const { adapter } = scriptedAdapter(script, (req) => {
        if (req.capability === "task-planning" || req.capability === "implementation") {
          captured.stdin = typeof req.stdinContent === "string" ? req.stdinContent : null;
          const pointers = req.promptPointers as ReadonlyArray<{ absolutePath?: string }> | undefined;
          const path = pointers?.[0]?.absolutePath;
          captured.stagedText = typeof path === "string" ? readFileSync(path, "utf8") : "";
        }
      });
      const result = await run("build a risky feature", {
        requirementId: h.requirementId,
        workspaceRoot: h.root,
        runStore: h.runStore,
        artifactStore: h.artifactStore,
        capabilitySource: "real",
        realGatewayDeps: { adapter, attemptWorkspace: () => h.workspace },
      });
      ok(result.final_status === "success" && result.chain_status === "COMPLETED",
        "the CONFIRMED PWR ruling auto-proceeds (Decision-086, no human ritual)");
      const v = verdictOf(h);
      ok(v.gateResult === "PASS_WITH_RISK" && v.decisionStatus === "CONFIRMED" && v.eligibility === "ELIGIBLE",
        "the PWR verdict is CONFIRMED and eligible");
      const verdictEvent = lastTerminal(h, "solution-gate", "formal_verdict");
      const delta = JSON.parse(h.artifactStore.read(verdictEvent.decisionDeltaRef!, verdictEvent.decisionDeltaDigest!) as unknown as string) as Record<string, unknown>;
      ok(Array.isArray(delta["riskAcceptanceRefs"]) && (delta["riskAcceptanceRefs"] as string[]).includes("RISK-1"),
        "the risk refs ride the immutable delta artifact (A2 admission input)");
      const events = h.runStore.listCapabilityExecutions(
        h.runStore.listRunsByRequirement(h.requirementId)[0]!.state.identity.runId,
      );
      ok(events.some((e) => e.capability === "task-planning" && e.status === "succeeded"),
        "task-planning was admitted (A1) by the CONFIRMED ruling");
      // G4-R7-B5: the risk refs ride the ACTUAL downstream input carriers.
      ok(captured.stdin !== null && captured.stdin.includes("RISK-1") &&
        captured.stagedText.includes("RISK-1") &&
        captured.stagedText.includes("decisionDeltaRef"),
        "the PWR risk refs + delta pointer reach the real staged/stdin input of downstream nodes");
    } finally {
      closeHarness(h);
    }
  }

  // ── 场景 5: resume → runId/requirementId 不变，sequence 续增 ──
  console.log("scenario 5: resume keeps the run identity and continues the sequence");
  {
    const h = makeHarness("s5");
    try {
      const script = new Map<ScriptKey, EnvelopeSpec[]>([
        ["solution-gate:formal_verdict", [
          { gateResult: "PASS", decisionStatus: "ESCALATED", decisionDepth: "STANDARD", findings: [] },
          { gateResult: "PASS", decisionStatus: "CONFIRMED", decisionDepth: "DEEP", findings: [] },
        ]],
        ["solution-design:primary", [{ findings: [] }, { findings: [] }]],
      ]);
      const { adapter } = scriptedAdapter(script);
      const first = await run("build a deep feature", {
        requirementId: h.requirementId,
        workspaceRoot: h.root,
        runStore: h.runStore,
        artifactStore: h.artifactStore,
        capabilitySource: "real",
        realGatewayDeps: { adapter, attemptWorkspace: () => h.workspace },
        maxDispatches: 3,
      });
      const firstRunId = first.run_id;
      const seqAfterFirst = h.runStore.listCapabilityExecutions(firstRunId).length;
      ok(first.chain_status !== "COMPLETED", "the bounded first invocation stops mid-chain");
      const second = await run("build a deep feature", {
        requirementId: h.requirementId,
        workspaceRoot: h.root,
        runStore: h.runStore,
        artifactStore: h.artifactStore,
        capabilitySource: "real",
        realGatewayDeps: { adapter, attemptWorkspace: () => h.workspace },
      });
      ok(second.run_id === firstRunId, "resume continues the SAME run (never run-run)");
      ok(h.runStore.listRunsByRequirement(h.requirementId).length === 1, "exactly one run for the requirement");
      const seqAfterSecond = h.runStore.listCapabilityExecutions(firstRunId).length;
      ok(seqAfterSecond > seqAfterFirst, `the event sequence strictly continues (${seqAfterFirst} → ${seqAfterSecond})`);
      // G4-R6-H3: the ESCALATED reflow finding is not auto-closed by the
      // later CONFIRMED PASS — the resumed run stops BLOCKED until the
      // discovering node closes the item with real repair evidence.
      ok(second.final_status === "failed" && second.chain_status === "BLOCKED",
        "the resumed run stops BLOCKED on the OPEN reflow finding (PASS closes nothing)");
      const reflowFinding = h.runStore.listFindings(firstRunId).find((finding) => finding.status === "OPEN")!;
      ok(reflowFinding !== undefined && reflowFinding.earliestAffectedNodeId === "solution-design",
        "the synthetic reflow finding is the blocking OPEN fact");
      const finalVerdict = h.runStore.listCapabilityExecutions(firstRunId)
        .filter((e) => e.executionRole === "formal_verdict").at(-1)!;
      const gateCurrentFact5 = h.runStore.listRegateCurrentFacts(firstRunId)
        .find((fact) => fact.nodeId === "solution-gate")!;
      h.runStore.resolveFinding(firstRunId, reflowFinding.findingId, {
        resolvedByNodeId: "solution-gate",
        resolvedByRevisionId: gateCurrentFact5.revisionId,
        resolutionEvidenceRef: finalVerdict.outputArtifactRef,
        resolutionEvidenceDigest: finalVerdict.outputDigest,
      });
      const third = await run("build a deep feature", {
        requirementId: h.requirementId,
        workspaceRoot: h.root,
        runStore: h.runStore,
        artifactStore: h.artifactStore,
        capabilitySource: "real",
        realGatewayDeps: { adapter, attemptWorkspace: () => h.workspace },
      });
      ok(third.run_id === firstRunId, "the third invocation continues the same run");
      ok(third.final_status === "success" && third.chain_status === "COMPLETED",
        "the ESCALATED reflow completes on resume after the itemized closure");
    } finally {
      closeHarness(h);
    }
  }

  // ── 场景 6: 生产装配（离线）——runProduction 装配真实链 + prepared worktree 绑定 ──
  console.log("scenario 6: offline production assembly through runProduction with a prepared worktree pin");
  {
    const h = makeHarness("s6");
    try {
      const script = new Map<ScriptKey, EnvelopeSpec[]>([
        ["solution-gate:formal_verdict", [{ gateResult: "PASS", decisionStatus: "CONFIRMED", decisionDepth: "STANDARD", findings: [] }]],
      ]);
      const { adapter, calls, cwds } = scriptedAdapter(script);
      const preparedRoot = mkdtempSync(join(tmpdir(), "d087-s6-prepared-"));
      const parsed = parseProductionEntryRequest({
        schema: PRODUCTION_ENTRY_SCHEMA,
        requirementId: h.requirementId,
        repository: "fixture-repo",
        repositoryPath: join(h.root, "repo"),
        baseBranch: "main",
        expectedBaseSha: "a".repeat(40),
        taskBranch: `runtime/${h.requirementId}`,
        controlRoot: join(h.root, "control"),
        sourceFiles: [],
        bindingRegistryVersion: createRuntimeBindingRegistry().version,
        executionProfileVersion: "1.0.0",
        mode: "real",
      }, { now: () => new Date().toISOString(), runId: `run-${h.requirementId}`.toLowerCase() });
      const result = await runProduction(parsed, "build a produced feature", {
        capabilitySource: "real",
        realGatewayDeps: { adapter, attemptWorkspace: () => h.root },
        runStore: h.runStore,
        artifactStore: h.artifactStore,
        inspectWorkspace: async () => ({ baseDrifted: false, taskHasChanges: false, sourceWipDigestSha256: "0".repeat(64) }),
        prepareWorkspace: async () => ({ workspacePath: preparedRoot }),
      });
      ok(result.final_status === "success" && result.chain_status === "COMPLETED",
        "the real chain assembles and completes through the production door (offline)");
      ok(calls.length >= 7, "every chain node dispatched through the assembled real gateway");
      ok(readFileSync(join(h.root, "journal.db")) !== undefined, "the journal persists under the injected store");
      // G4-R6-M3 (R6-H6): the ADAPTER'S ACTUAL CWD is asserted, not assumed —
      // the prompt inputs are staged into the effective cwd by the real
      // gateway, so their landing directory IS the cwd evidence: staged
      // files live under the PREPARED worktree, and the business root (the
      // injected resolver's stale answer) received none.
      ok(existsSync(join(preparedRoot, "prompt-input")) &&
        readdirSync(join(preparedRoot, "prompt-input")).length >= 7,
        "every dispatch staged its prompt input inside the prepared attempt worktree (actual cwd pin)");
      // G4-R7-B8: EVERY dispatch's actual cwd is asserted individually — a
      // directory-level file count cannot prove each dispatch was pinned.
      ok(cwds.length >= 8 && cwds.every((cwd) => cwd === preparedRoot),
        `all ${cwds.length} dispatched adapters executed with cwd === the prepared worktree (R7-B8)`);
      // The request's REAL business root is the parsed repositoryPath
      // (h.root/repo) — the zero-side-effect assertion checks THAT root (the
      // earlier check of the resolver's stale answer h.root stays as well).
      ok(!existsSync(join(h.root, "prompt-input")) && !existsSync(join(h.root, "repo", "prompt-input")),
        "the business root (and the stale resolver answer) received zero dispatch side effects");
      rmSync(preparedRoot, { recursive: true, force: true });

      // G4-R6-H6 negatives: the prepared workspace is a REQUIRED, VERIFIED
      // production constraint — omission, a dangling path, the business
      // root itself, and a post-run root side effect all fail closed.
      const productionNegatives = async (
        requirementSuffix: string,
        overrides: {
          omitPrepare?: boolean;
          preparePath?: string;
          useBusinessRootAsPrepare?: boolean;
          postRunRootSideEffect?: boolean;
        },
      ): Promise<void> => {
        const hb = makeHarness(`s6-${requirementSuffix}`);
        try {
          const parsedB = parseProductionEntryRequest({
            schema: PRODUCTION_ENTRY_SCHEMA,
            requirementId: `${h.requirementId}-${requirementSuffix}`,
            repository: "fixture-repo",
            repositoryPath: join(hb.root, "repo"),
            baseBranch: "main",
            expectedBaseSha: "a".repeat(40),
            taskBranch: `runtime/${h.requirementId}-${requirementSuffix}`,
            controlRoot: join(hb.root, "control"),
            sourceFiles: [],
            bindingRegistryVersion: createRuntimeBindingRegistry().version,
            executionProfileVersion: "1.0.0",
            mode: "real",
          }, { now: () => new Date().toISOString(), runId: `run-${h.requirementId}-${requirementSuffix}`.toLowerCase() });
          let inspectCalls = 0;
          const resultB = await runProduction(parsedB, "isolation probe", {
            capabilitySource: "real",
            realGatewayDeps: { adapter, attemptWorkspace: () => hb.root },
            runStore: hb.runStore,
            artifactStore: hb.artifactStore,
            inspectWorkspace: async () => {
              inspectCalls += 1;
              // Post-run root side effect: the source WIP digest drifts
              // between the preflight and the post-run inspection.
              return {
                baseDrifted: false,
                taskHasChanges: false,
                sourceWipDigestSha256:
                  overrides.postRunRootSideEffect && inspectCalls >= 2
                    ? "d".repeat(64)
                    : "0".repeat(64),
              };
            },
            ...(overrides.omitPrepare ? {} : {
              prepareWorkspace: async () => ({
                workspacePath: overrides.useBusinessRootAsPrepare
                  ? join(hb.root, "repo")
                  : overrides.preparePath ?? mkdtempSync(join(tmpdir(), "d087-s6-neg-")),
              }),
            }),
          });
          if (overrides.postRunRootSideEffect) {
            ok(resultB.final_status === "failed" && resultB.chain_status === "BLOCKED" &&
              resultB.blocking_reason_code === "PRODUCTION_ISOLATION_VIOLATED",
              "a post-run root side effect flips COMPLETED to an honest BLOCKED failure");
          } else {
            ok(false, "the refusal shape must throw, never complete");
          }
        } finally {
          closeHarness(hb);
        }
      };
      ok(
        await productionNegatives("n1", { omitPrepare: true }).then(
          () => false,
          (error) => (error as { code?: string }).code === "PRODUCTION_ENTRY_INVALID_INPUT",
        ),
        "real without a prepared workspace is refused at the door (no business-root fallback)",
      );
      ok(
        await productionNegatives("n2", { preparePath: join(h.root, "does-not-exist") }).then(
          () => false,
          (error) => (error as { code?: string }).code === "PRODUCTION_ENTRY_INVALID_INPUT",
        ),
        "a prepared workspace path that does not exist is refused",
      );
      ok(
        await productionNegatives("n3", { useBusinessRootAsPrepare: true }).then(
          () => false,
          (error) => (error as { code?: string }).code === "PRODUCTION_ENTRY_INVALID_INPUT",
        ),
        "a prepared workspace equal to the business repository root is refused",
      );
      // n4 resolves (does not throw): the run completes, then the post-run
      // inspection detects the root side effect and the door reports BLOCKED.
      await productionNegatives("n4", { postRunRootSideEffect: true });

      // Negative: the production door refuses real dispatch WITHOUT the
      // injected assembly surface (authorization/assembly split).
      const parsed2 = parseProductionEntryRequest({
        schema: PRODUCTION_ENTRY_SCHEMA,
        requirementId: `${h.requirementId}-B`,
        repository: "fixture-repo",
        repositoryPath: join(h.root, "repo"),
        baseBranch: "main",
        expectedBaseSha: "a".repeat(40),
        taskBranch: `runtime/${h.requirementId}-b`,
        controlRoot: join(h.root, "control"),
        sourceFiles: [],
        bindingRegistryVersion: createRuntimeBindingRegistry().version,
        executionProfileVersion: "1.0.0",
        mode: "real",
      }, { now: () => new Date().toISOString(), runId: `run-${h.requirementId}-b`.toLowerCase() });
      let refusedCode: string | null = null;
      try {
        await runProduction(parsed2, "unauthorized", { capabilitySource: "real" });
      } catch (error) {
        refusedCode = (error as { code?: string }).code ?? null;
      }
      ok(refusedCode === "PRODUCTION_REAL_NOT_AUTHORIZED",
        "capabilitySource real without injected realGatewayDeps is refused at the door");
    } finally {
      closeHarness(h);
    }

    // Seam-3 static check: the smoke script enters through the production
    // entry, never through a direct run() call.
    const smoke = readFileSync("scripts/loop-gw-smoke-real.ts", "utf8");
    ok(/runProduction\(/.test(smoke), "the smoke script enters through runProduction");
    ok(!/await run\(/.test(smoke), "the smoke script never calls run() directly (seam 3)");
  }

  // ── H1 篡改证据: decision_status 是 canonical hash 的一部分 ──
  console.log("H1 tamper evidence: mutating the persisted decisionStatus drifts the hash");
  {
    const h = makeHarness("t1");
    try {
      const script = new Map<ScriptKey, EnvelopeSpec[]>([
        ["solution-gate:formal_verdict", [{ gateResult: "PASS", decisionStatus: "CONFIRMED", decisionDepth: "STANDARD", findings: [] }]],
      ]);
      const { adapter } = scriptedAdapter(script);
      await run("build a tamper probe", {
        requirementId: h.requirementId,
        workspaceRoot: h.root,
        runStore: h.runStore,
        artifactStore: h.artifactStore,
        capabilitySource: "real",
        realGatewayDeps: { adapter, attemptWorkspace: () => h.workspace },
      });
      const journalRunId = h.runStore.listRunsByRequirement(h.requirementId)[0]!.state.identity.runId;
      const verdict = h.runStore.listCapabilityExecutions(journalRunId)
        .filter((e) => e.executionRole === "formal_verdict" && e.status === "succeeded").at(-1)!;
      ok(verdict.decisionStatus === "CONFIRMED", "the probe verdict is CONFIRMED");
      const raw = new Database(join(h.root, "journal.db"));
      raw.prepare("UPDATE loop_capability_executions SET decision_status = ? WHERE execution_event_id = ?")
        .run("ESCALATED", verdict.executionEventId);
      raw.close();
      let corrupt = false;
      try {
        h.runStore.listCapabilityExecutions(journalRunId);
      } catch (error) {
        corrupt = (error as { code?: string }).code === "STORE_CORRUPT";
      }
      ok(corrupt, "a tampered decisionStatus fails every read closed (canonical hash drifts)");
    } finally {
      closeHarness(h);
    }
  }

  console.log(`\nResults: ${p} passed, ${f} failed`);
  if (f > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
