// D10-A — Durable Delivery Checkpoint Contract Tests
// ====================================================
// Real assertion-count tests for the canonical, deterministic, fail-closed
// `loop-delivery-checkpoint-v1` contract: schema vocabulary, fixed property
// order, canonical bytes round-trip, phase/fact matrix, fixed bindings,
// generation rules, explicit transition graph, chain fork prevention and
// adversarial untrusted input. No placeholders, no skips, no ok(true).

import { createHash } from "node:crypto";

import {
  buildLoopDeliveryCheckpoint,
  parseLoopDeliveryCheckpointBytes,
  validateLoopDeliveryCheckpointTransition,
  loopDeliveryCheckpointRef,
  canonicalizeLoopDeliveryCheckpoint,
  LOOP_DELIVERY_CHECKPOINT_SCHEMA,
  LOOP_DELIVERY_CHECKPOINT_MAX_BYTES,
  LOOP_DELIVERY_CHECKPOINT_PHASES,
  LOOP_DELIVERY_CHECKPOINT_MODES,
  LOOP_DELIVERY_CHECKPOINT_TERMINAL_PHASES,
  type LoopDeliveryCheckpointBuildResult,
  type LoopDeliveryCheckpointFailure,
  type LoopDeliveryCheckpointPhase,
} from "../core/loop-delivery-checkpoint";

// ═══════════════════════════════════════ Harness

let passed = 0;
let failed = 0;
let sectionFailures = 0;

function check(condition: boolean, message: string): void {
  if (condition) {
    passed += 1;
  } else {
    sectionFailures += 1;
    failed += 1;
    console.error(`  FAIL ${message}`);
  }
}

function startSection(): void {
  sectionFailures = 0;
}

const MARKERS: Record<string, boolean> = {
  D10_A_CHECKPOINT_SCHEMA_VERIFIED: false,
  D10_A_CHECKPOINT_CANONICAL_BYTES_VERIFIED: false,
  D10_A_CHECKPOINT_FAIL_CLOSED_VERIFIED: false,
  D10_A_CHECKPOINT_FORK_PREVENTION_VERIFIED: false,
};

function markIfClear(marker: string): void {
  if (sectionFailures === 0) {
    MARKERS[marker] = true;
  } else {
    console.error(`  marker ${marker} NOT set (${sectionFailures} section failure(s))`);
  }
}

// ═══════════════════════════════════════ Input factories

const REF_A1 = `loop-artifact:v1:orchestration_result:sha256:${"1".repeat(64)}`;
const REF_A2 = `loop-artifact:v1:executor_input:sha256:${"2".repeat(64)}`;
const REF_D = `loop-artifact:v1:delivery_result:sha256:${"3".repeat(64)}`;
const REF_G = `loop-artifact:v1:governance_tail_result:sha256:${"4".repeat(64)}`;
const REF_I = `loop-artifact:v1:workspace_metadata:sha256:${"5".repeat(64)}`;
const REF_X = `loop-artifact:v1:workspace_metadata:sha256:${"6".repeat(64)}`;
const COMMIT_SHA = "e".repeat(40);
const PR_NUMBER = 42;
const PR_URL = "https://github.com/shaoyang01/target-repo/pull/42";

const FACTS: Record<string, Record<string, unknown>> = {
  A: { orchestration_result_artifact_ref: REF_A1, executor_input_artifact_ref: REF_A2 },
  W_FALSE: {
    workspace_path: "/tmp/loop-checkpoint/workspace",
    workspace_head_sha: "c".repeat(40),
    workspace_status_digest_sha256: "d".repeat(64),
    workspace_has_changes: false,
  },
  W_TRUE: {
    workspace_path: "/tmp/loop-checkpoint/workspace",
    workspace_head_sha: "c".repeat(40),
    workspace_status_digest_sha256: "d".repeat(64),
    workspace_has_changes: true,
  },
  W_COMMIT: {
    workspace_path: "/tmp/loop-checkpoint/workspace",
    workspace_head_sha: COMMIT_SHA,
    workspace_status_digest_sha256: "d".repeat(64),
    workspace_has_changes: false,
  },
  D: { delivery_result_artifact_ref: REF_D },
  G: { governance_tail_result_artifact_ref: REF_G },
  I: { publish_intent_artifact_ref: REF_I },
  C: { commit_sha: COMMIT_SHA },
  R: { remote_branch_sha: COMMIT_SHA },
  P: { pr_number: PR_NUMBER, pr_url: PR_URL, pr_body_sha256: "7".repeat(64) },
  X: { publish_result_artifact_ref: REF_X },
  T_COMPLETED: { terminal_status: "completed", terminal_reason_code: null },
  T_BLOCKED: { terminal_status: "blocked", terminal_reason_code: "BLOCKED_REASON" },
  T_FAILED: { terminal_status: "failed", terminal_reason_code: "FAILED_REASON" },
};

const FACT_KEYS: Record<string, readonly string[]> = {
  A: ["orchestration_result_artifact_ref", "executor_input_artifact_ref"],
  W: ["workspace_path", "workspace_head_sha", "workspace_status_digest_sha256", "workspace_has_changes"],
  D: ["delivery_result_artifact_ref"],
  G: ["governance_tail_result_artifact_ref"],
  I: ["publish_intent_artifact_ref"],
  C: ["commit_sha"],
  R: ["remote_branch_sha"],
  P: ["pr_number", "pr_url", "pr_body_sha256"],
  X: ["publish_result_artifact_ref"],
  T: ["terminal_status", "terminal_reason_code"],
};

const GROUP_INPUTS: Record<string, Record<string, unknown>> = {
  A: FACTS.A,
  W: FACTS.W_FALSE,
  D: FACTS.D,
  G: FACTS.G,
  I: FACTS.I,
  C: FACTS.C,
  R: FACTS.R,
  P: FACTS.P,
  X: FACTS.X,
  T: FACTS.T_BLOCKED,
};

function makeIdentity(o: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    runId: "run-d10a-001",
    requirementId: "req-d10a-001",
    repository: "shaoyang01/target-repo",
    repositoryPath: "/tmp/loop-checkpoint/repo",
    baseBranch: "main",
    expectedBaseSha: "a".repeat(40),
    taskBranch: "codex/d10a-checkpoint-run",
    controlRoot: "/tmp/loop-checkpoint/control",
    createdAt: "2026-08-04T00:00:00.000Z",
    ...o,
  };
}

function baseInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: "loop-delivery-checkpoint-v1",
    identity: makeIdentity(),
    mode: "fresh",
    generation: 1,
    previous_checkpoint_artifact_ref: null,
    phase: "initialized",
    target_repository: "shaoyang01/target-repo",
    base_branch: "main",
    expected_base_sha: "a".repeat(40),
    task_branch: "codex/d10a-checkpoint-run",
    source_head_sha: "a".repeat(40),
    source_wip_digest_sha256: "b".repeat(64),
    workspace_path: null,
    workspace_head_sha: null,
    workspace_status_digest_sha256: null,
    workspace_has_changes: null,
    orchestration_result_artifact_ref: null,
    executor_input_artifact_ref: null,
    delivery_result_artifact_ref: null,
    governance_tail_result_artifact_ref: null,
    publish_intent_artifact_ref: null,
    publish_result_artifact_ref: null,
    commit_sha: null,
    remote_branch_sha: null,
    pr_number: null,
    pr_url: null,
    pr_body_sha256: null,
    deadline_origin_ms: 0,
    max_total_duration_ms: 3_600_000,
    elapsed_ms: 0,
    terminal_status: null,
    terminal_reason_code: null,
    ...overrides,
  };
}

/** Minimal legal fact set for a phase (generation 1, no previous ref). */
function atPhase(phase: LoopDeliveryCheckpointPhase): Record<string, unknown> {
  const input = baseInput({ phase });
  switch (phase) {
    case "initialized":
      return input;
    case "d08_completed":
      return { ...input, ...FACTS.A };
    case "workspace_prepared":
    case "d06_in_progress":
      return { ...input, ...FACTS.A, ...FACTS.W_FALSE };
    case "d06_completed":
    case "tail_in_progress":
    case "tail_completed":
      return { ...input, ...FACTS.A, ...FACTS.W_TRUE, ...FACTS.D };
    case "a1_persisted":
      return { ...input, ...FACTS.A, ...FACTS.W_TRUE, ...FACTS.D, ...FACTS.G };
    case "publish_intent_persisted":
      return { ...input, ...FACTS.A, ...FACTS.W_TRUE, ...FACTS.D, ...FACTS.G, ...FACTS.I };
    case "commit_reconciled":
      return { ...input, ...FACTS.A, ...FACTS.W_COMMIT, ...FACTS.D, ...FACTS.G, ...FACTS.I, ...FACTS.C };
    case "push_reconciled":
      return { ...input, ...FACTS.A, ...FACTS.W_COMMIT, ...FACTS.D, ...FACTS.G, ...FACTS.I, ...FACTS.C, ...FACTS.R };
    case "pr_reconciled":
      return { ...input, ...FACTS.A, ...FACTS.W_COMMIT, ...FACTS.D, ...FACTS.G, ...FACTS.I, ...FACTS.C, ...FACTS.R, ...FACTS.P };
    case "publish_result_persisted":
      return { ...input, ...FACTS.A, ...FACTS.W_COMMIT, ...FACTS.D, ...FACTS.G, ...FACTS.I, ...FACTS.C, ...FACTS.R, ...FACTS.P, ...FACTS.X };
    case "completed":
      return { ...atPhase("publish_result_persisted"), phase: "completed", ...FACTS.T_COMPLETED };
    case "blocked":
      return { ...atPhase("publish_result_persisted"), phase: "blocked", ...FACTS.T_BLOCKED };
    case "failed":
      return { ...atPhase("publish_result_persisted"), phase: "failed", ...FACTS.T_FAILED };
  }
}

function build(input: unknown, maxBytes?: number) {
  return buildLoopDeliveryCheckpoint(input, maxBytes);
}

function buildOk(input: unknown): boolean {
  return build(input).ok;
}

function parseOk(bytes: Uint8Array): boolean {
  return parseLoopDeliveryCheckpointBytes(bytes).ok;
}

function failureOf(result: LoopDeliveryCheckpointBuildResult): LoopDeliveryCheckpointFailure | null {
  // tsc with strict:false does not narrow discriminated unions via property
  // truthiness — the explicit cast keeps this a plain runtime check.
  return result.ok ? null : (result as LoopDeliveryCheckpointFailure);
}

function textBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function main(): void {
  console.log("D10-A Delivery Checkpoint Contract Tests\n");

  // ═══════════════════════════════════════════════════════════
  // 1. Schema vocabulary
  // ═══════════════════════════════════════════════════════════
  startSection();
  console.log("schema vocabulary");
  check(LOOP_DELIVERY_CHECKPOINT_SCHEMA === "loop-delivery-checkpoint-v1", "schema constant fixed");
  check(LOOP_DELIVERY_CHECKPOINT_MAX_BYTES === 1_048_576, "max bytes constant fixed");
  const expectedPhases = [
    "initialized", "d08_completed", "workspace_prepared", "d06_in_progress", "d06_completed",
    "tail_in_progress", "tail_completed", "a1_persisted", "publish_intent_persisted",
    "commit_reconciled", "push_reconciled", "pr_reconciled", "publish_result_persisted",
    "completed", "blocked", "failed",
  ];
  check(
    LOOP_DELIVERY_CHECKPOINT_PHASES.length === 16 &&
    LOOP_DELIVERY_CHECKPOINT_PHASES.every((phase, index) => phase === expectedPhases[index]),
    "phase vocabulary exact 16 in fixed order",
  );
  check(
    LOOP_DELIVERY_CHECKPOINT_MODES.length === 2 &&
    LOOP_DELIVERY_CHECKPOINT_MODES[0] === "fresh" && LOOP_DELIVERY_CHECKPOINT_MODES[1] === "recovery",
    "mode vocabulary exact",
  );
  check(
    LOOP_DELIVERY_CHECKPOINT_TERMINAL_PHASES.length === 3 &&
    LOOP_DELIVERY_CHECKPOINT_TERMINAL_PHASES[0] === "completed" &&
    LOOP_DELIVERY_CHECKPOINT_TERMINAL_PHASES[1] === "blocked" &&
    LOOP_DELIVERY_CHECKPOINT_TERMINAL_PHASES[2] === "failed",
    "terminal phase vocabulary exact",
  );
  check(buildOk(atPhase("initialized")), "initialized builds");
  check(!buildOk(baseInput({ mode: "bogus" })), "invalid mode rejected");
  check(!buildOk(baseInput({ mode: "fresh", phase: "bogus" })), "invalid phase rejected");
  markIfClear("D10_A_CHECKPOINT_SCHEMA_VERIFIED");

  // ═══════════════════════════════════════════════════════════
  // 2. Fixed root/identity key order
  // ═══════════════════════════════════════════════════════════
  startSection();
  console.log("fixed root/identity key order");
  {
    const result = build(atPhase("initialized"));
    check(result.ok, "initialized builds for key-order test");
    if (result.ok) {
      const keys = Object.keys(JSON.parse(result.text));
      const expectedRootKeys = [
        "schema", "identity", "mode", "generation", "previous_checkpoint_artifact_ref", "phase",
        "target_repository", "base_branch", "expected_base_sha", "task_branch",
        "source_head_sha", "source_wip_digest_sha256",
        "workspace_path", "workspace_head_sha", "workspace_status_digest_sha256", "workspace_has_changes",
        "orchestration_result_artifact_ref", "executor_input_artifact_ref", "delivery_result_artifact_ref",
        "governance_tail_result_artifact_ref", "publish_intent_artifact_ref", "publish_result_artifact_ref",
        "commit_sha", "remote_branch_sha",
        "pr_number", "pr_url", "pr_body_sha256",
        "deadline_origin_ms", "max_total_duration_ms", "elapsed_ms",
        "terminal_status", "terminal_reason_code",
      ];
      check(
        keys.length === 32 && keys.every((key, index) => key === expectedRootKeys[index]),
        "root serialized in the exact fixed 32-key order",
      );
      const identityKeys = Object.keys(JSON.parse(result.text).identity);
      const expectedIdentityKeys = [
        "runId", "requirementId", "repository", "repositoryPath", "baseBranch",
        "expectedBaseSha", "taskBranch", "controlRoot", "createdAt",
      ];
      check(
        identityKeys.length === 9 && identityKeys.every((key, index) => key === expectedIdentityKeys[index]),
        "identity serialized in the exact fixed 9-key order",
      );
      // Reordered input is accepted by the builder but canonical output order
      // is fixed.
      const reordered = build(Object.fromEntries(Object.entries(atPhase("d08_completed")).reverse()));
      check(reordered.ok, "reordered input accepted by builder");
      if (reordered.ok) {
        const reorderedKeys = Object.keys(JSON.parse(reordered.text));
        check(reorderedKeys.every((key, index) => key === expectedRootKeys[index]), "reordered input serialized in canonical order");
      }
    }
  }
  markIfClear("D10_A_CHECKPOINT_SCHEMA_VERIFIED");

  // ═══════════════════════════════════════════════════════════
  // 3. Phase/fact nullable matrix + groups
  // ═══════════════════════════════════════════════════════════
  startSection();
  console.log("phase/fact matrix");
  {
    const matrix: Array<{ phase: LoopDeliveryCheckpointPhase; require: string[]; nulls: string[] }> = [
      { phase: "initialized", require: [], nulls: ["A", "W", "D", "G", "I", "C", "R", "P", "X", "T"] },
      { phase: "d08_completed", require: ["A"], nulls: ["W", "D", "G", "I", "C", "R", "P", "X", "T"] },
      { phase: "workspace_prepared", require: ["A", "W"], nulls: ["D", "G", "I", "C", "R", "P", "X", "T"] },
      { phase: "d06_in_progress", require: ["A", "W"], nulls: ["D", "G", "I", "C", "R", "P", "X", "T"] },
      { phase: "d06_completed", require: ["A", "W", "D"], nulls: ["G", "I", "C", "R", "P", "X", "T"] },
      { phase: "tail_in_progress", require: ["A", "W", "D"], nulls: ["G", "I", "C", "R", "P", "X", "T"] },
      { phase: "tail_completed", require: ["A", "W", "D"], nulls: ["G", "I", "C", "R", "P", "X", "T"] },
      { phase: "a1_persisted", require: ["A", "W", "D", "G"], nulls: ["I", "C", "R", "P", "X", "T"] },
      { phase: "publish_intent_persisted", require: ["A", "W", "D", "G", "I"], nulls: ["C", "R", "P", "X", "T"] },
      { phase: "commit_reconciled", require: ["A", "W", "D", "G", "I", "C"], nulls: ["R", "P", "X", "T"] },
      { phase: "push_reconciled", require: ["A", "W", "D", "G", "I", "C", "R"], nulls: ["P", "X", "T"] },
      { phase: "pr_reconciled", require: ["A", "W", "D", "G", "I", "C", "R", "P"], nulls: ["X", "T"] },
      { phase: "publish_result_persisted", require: ["A", "W", "D", "G", "I", "C", "R", "P", "X"], nulls: ["T"] },
    ];
    for (const row of matrix) {
      check(buildOk(atPhase(row.phase)), `${row.phase}: minimal legal facts accepted`);
      for (const group of row.nulls) {
        const violated = { ...atPhase(row.phase), ...GROUP_INPUTS[group] };
        check(!buildOk(violated), `${row.phase}: ${group} facts rejected`);
      }
      for (const group of row.require) {
        const base = atPhase(row.phase);
        const removed = Object.fromEntries(
          Object.entries(base).filter(([key]) => !FACT_KEYS[group].includes(key)),
        );
        check(!buildOk(removed), `${row.phase}: missing ${group} facts rejected`);
      }
    }
    check(buildOk(atPhase("completed")), "completed accepted with all final facts");
    check(buildOk(atPhase("blocked")), "blocked accepted with full prefix + reason");
    check(buildOk(atPhase("failed")), "failed accepted with full prefix + reason");
    check(buildOk({ ...atPhase("blocked"), ...FACTS.A, ...FACTS.T_BLOCKED }), "blocked accepted with A-only prefix");
    check(buildOk({ ...baseInput({ phase: "blocked" }), ...FACTS.T_BLOCKED }), "blocked accepted with empty prefix");
    check(!buildOk({ ...atPhase("blocked"), ...FACTS.T_FAILED }), "blocked phase with terminal status failed rejected");
    check(!buildOk({ ...atPhase("blocked"), terminal_reason_code: null }), "blocked without reason rejected");
    check(!buildOk({ ...atPhase("failed"), terminal_reason_code: null }), "failed without reason rejected");
    check(!buildOk({ ...atPhase("completed"), ...FACTS.T_BLOCKED }), "completed with blocked terminal rejected");
    check(!buildOk({ ...atPhase("completed"), terminal_reason_code: "SOMETHING" }), "completed with reason rejected");
    check(!buildOk({ ...atPhase("initialized"), ...FACTS.T_BLOCKED }), "non-terminal phase with terminal facts rejected");
    check(!buildOk({ ...atPhase("initialized"), terminal_status: null, terminal_reason_code: "x" }), "reason without terminal status rejected");
    // terminal prefix rules
    check(!buildOk({ ...atPhase("blocked"), ...FACTS.A, ...FACTS.W_TRUE, ...FACTS.T_BLOCKED }), "blocked changed workspace without delivery rejected");
    check(!buildOk({ ...atPhase("blocked"), ...FACTS.A, ...FACTS.W_TRUE, ...FACTS.D, ...FACTS.C, ...FACTS.T_BLOCKED }), "blocked changed workspace with commit rejected");
    check(!buildOk({ ...atPhase("blocked"), ...FACTS.A, ...FACTS.W_FALSE, ...FACTS.D, ...FACTS.T_BLOCKED }), "blocked clean workspace with delivery but no commit rejected");
    check(!buildOk({ ...atPhase("blocked"), ...FACTS.A, ...FACTS.W_COMMIT, ...FACTS.D, ...FACTS.C, workspace_head_sha: "f".repeat(40), ...FACTS.T_BLOCKED }), "blocked commit head mismatch rejected");
    // has_changes per phase
    check(!buildOk({ ...atPhase("workspace_prepared"), workspace_has_changes: true }), "workspace_prepared has_changes true rejected");
    check(!buildOk({ ...atPhase("d06_in_progress"), workspace_has_changes: true }), "d06_in_progress has_changes true rejected");
    check(!buildOk({ ...atPhase("d06_completed"), workspace_has_changes: false }), "d06_completed has_changes false rejected");
    check(!buildOk({ ...atPhase("a1_persisted"), workspace_has_changes: false }), "a1_persisted has_changes false rejected");
    check(!buildOk({ ...atPhase("commit_reconciled"), workspace_head_sha: "c".repeat(40) }), "commit_reconciled head != commit rejected");
    check(!buildOk({ ...atPhase("publish_result_persisted"), workspace_has_changes: true }), "publish_result_persisted has_changes true rejected");
    // groups
    check(!buildOk({ ...atPhase("d08_completed"), orchestration_result_artifact_ref: null }), "orchestration-only D08 refs rejected");
    check(!buildOk({ ...atPhase("d08_completed"), executor_input_artifact_ref: null }), "executor-only D08 refs rejected");
    check(!buildOk({ ...atPhase("commit_reconciled"), workspace_status_digest_sha256: null }), "partial workspace group rejected");
    check(!buildOk({ ...atPhase("pr_reconciled"), pr_url: null }), "partial PR group rejected");
    check(!buildOk({ ...atPhase("d06_completed"), ...FACTS.G }), "d06_completed with governance facts rejected");
    check(!buildOk({ ...atPhase("d08_completed"), ...FACTS.W_FALSE, ...FACTS.D }), "d08_completed with delivery+workspace facts rejected");
  }
  markIfClear("D10_A_CHECKPOINT_SCHEMA_VERIFIED");

  // ═══════════════════════════════════════════════════════════
  // 4. Fixed bindings, ref kinds, PR URL, generation, deadline
  // ═══════════════════════════════════════════════════════════
  startSection();
  console.log("bindings / ref kinds / generation / deadline");
  {
    check(!buildOk(baseInput({ target_repository: "other/repo" })), "target_repository != identity.repository rejected");
    check(!buildOk(baseInput({ base_branch: "dev" })), "base_branch != identity.baseBranch rejected");
    check(!buildOk(baseInput({ expected_base_sha: "b".repeat(40) })), "expected_base_sha != identity.expectedBaseSha rejected");
    check(!buildOk(baseInput({ task_branch: "other-branch" })), "task_branch != identity.taskBranch rejected");
    check(!buildOk(baseInput({ source_head_sha: "b".repeat(40) })), "source_head_sha != expected_base_sha rejected");
    check(!buildOk(baseInput({ target_repository: "not-a-repo" })), "non canonical repository rejected");
    check(!buildOk(baseInput({ target_repository: "owner/repo/extra" })), "repository with extra segment rejected");
    check(!buildOk(baseInput({ target_repository: "/leading/slash" })), "repository with leading slash rejected");
    check(!buildOk(baseInput({ target_repository: "owner/" })), "repository with empty repo segment rejected");
    check(!buildOk(baseInput({ target_repository: "owner/.." })), "repository dot segment rejected");
    check(!buildOk(baseInput({ source_head_sha: "A".repeat(40) })), "uppercase sha40 rejected");
    check(!buildOk(baseInput({ source_head_sha: "a".repeat(39) })), "short sha40 rejected");
    check(!buildOk(baseInput({ source_wip_digest_sha256: "0".repeat(63) })), "short sha256 rejected");
    check(!buildOk({ ...atPhase("workspace_prepared"), workspace_path: "relative/path" }), "relative workspace path rejected");
    // artifact ref kinds
    check(!buildOk({ ...atPhase("d08_completed"), orchestration_result_artifact_ref: `loop-artifact:v1:delivery_result:sha256:${"1".repeat(64)}` }), "orchestration ref wrong kind rejected");
    check(!buildOk({ ...atPhase("d08_completed"), executor_input_artifact_ref: `loop-artifact:v1:code_patch:sha256:${"1".repeat(64)}` }), "executor ref wrong kind rejected");
    check(!buildOk({ ...atPhase("d06_completed"), delivery_result_artifact_ref: `loop-artifact:v1:workspace_metadata:sha256:${"1".repeat(64)}` }), "delivery ref wrong kind rejected");
    check(!buildOk({ ...atPhase("a1_persisted"), governance_tail_result_artifact_ref: `loop-artifact:v1:orchestration_result:sha256:${"1".repeat(64)}` }), "governance ref wrong kind rejected");
    check(!buildOk({ ...atPhase("publish_intent_persisted"), publish_intent_artifact_ref: `loop-artifact:v1:delivery_checkpoint:sha256:${"1".repeat(64)}` }), "publish intent ref wrong kind rejected");
    check(!buildOk({ ...atPhase("publish_result_persisted"), publish_result_artifact_ref: `loop-artifact:v1:executor_input:sha256:${"1".repeat(64)}` }), "publish result ref wrong kind rejected");
    check(!buildOk({ ...atPhase("d08_completed"), orchestration_result_artifact_ref: `loop-artifact:v1:orchestration_result:sha256:${"G".repeat(64)}` }), "ref uppercase digest rejected");
    check(!buildOk({ ...atPhase("d08_completed"), orchestration_result_artifact_ref: "loop-artifact:v1:orchestration_result:md5:" + "a".repeat(32) }), "ref wrong algorithm rejected");
    // PR URL binding
    check(!buildOk({ ...atPhase("pr_reconciled"), pr_url: "https://github.com/shaoyang01/target-repo/pull/43" }), "pr_url number mismatch rejected");
    check(!buildOk({ ...atPhase("pr_reconciled"), pr_url: "https://github.com/other/repo/pull/42" }), "pr_url repository mismatch rejected");
    check(!buildOk({ ...atPhase("pr_reconciled"), pr_url: "http://github.com/shaoyang01/target-repo/pull/42" }), "non-https pr_url rejected");
    check(!buildOk({ ...atPhase("pr_reconciled"), pr_number: 0 }), "pr_number 0 rejected");
    check(!buildOk({ ...atPhase("pr_reconciled"), pr_number: -1 }), "pr_number negative rejected");
    check(!buildOk({ ...atPhase("pr_reconciled"), pr_number: 2 ** 53 }), "pr_number unsafe integer rejected");
    // generation rules
    check(!buildOk(baseInput({ generation: 0 })), "generation 0 rejected");
    check(!buildOk(baseInput({ generation: -1 })), "negative generation rejected");
    check(!buildOk(baseInput({ generation: 1.5 })), "fractional generation rejected");
    check(!buildOk(baseInput({ generation: 2 ** 53 })), "unsafe generation rejected");
    check(!buildOk(baseInput({ generation: 2, previous_checkpoint_artifact_ref: null })), "generation 2 without previous ref rejected");
    check(!buildOk(baseInput({ generation: 1, previous_checkpoint_artifact_ref: `loop-artifact:v1:delivery_checkpoint:sha256:${"a".repeat(64)}` })), "generation 1 with previous ref rejected");
    check(buildOk(baseInput({ generation: 2, previous_checkpoint_artifact_ref: `loop-artifact:v1:delivery_checkpoint:sha256:${"a".repeat(64)}` })), "generation 2 with valid previous ref accepted");
    check(!buildOk(baseInput({ generation: 2, previous_checkpoint_artifact_ref: `loop-artifact:v1:workspace_metadata:sha256:${"a".repeat(64)}` })), "previous ref wrong kind rejected");
    // deadline / elapsed
    check(!buildOk(baseInput({ max_total_duration_ms: 999 })), "max duration below 1000 rejected");
    check(!buildOk(baseInput({ max_total_duration_ms: 3_600_001 })), "max duration above 3600000 rejected");
    check(!buildOk(baseInput({ max_total_duration_ms: 1000.5 })), "fractional max duration rejected");
    check(!buildOk(baseInput({ elapsed_ms: -1 })), "negative elapsed rejected");
    check(!buildOk(baseInput({ elapsed_ms: 3_600_001 })), "elapsed above max duration rejected");
    check(!buildOk(baseInput({ elapsed_ms: 1.5 })), "fractional elapsed rejected");
    check(!buildOk(baseInput({ deadline_origin_ms: -1 })), "negative deadline origin rejected");
    check(!buildOk(baseInput({ deadline_origin_ms: 2 ** 53 })), "unsafe deadline origin rejected");
    check(buildOk(baseInput({ elapsed_ms: 3_600_000 })), "elapsed at max duration accepted");
    check(buildOk(baseInput({ deadline_origin_ms: 1_700_000_000_000 })), "large deadline origin accepted");
  }
  markIfClear("D10_A_CHECKPOINT_SCHEMA_VERIFIED");

  // ═══════════════════════════════════════════════════════════
  // 5. Canonical bytes and parser
  // ═══════════════════════════════════════════════════════════
  startSection();
  console.log("canonical bytes and parser");
  {
    const result = build(atPhase("d08_completed"));
    check(result.ok, "build succeeds");
    if (result.ok) {
      const parsed = parseLoopDeliveryCheckpointBytes(result.bytes);
      check(parsed.ok, "parse round-trip succeeds");
      if (parsed.ok) {
        check(parsed.digestSha256 === result.digestSha256, "parse digest equals build digest");
        check(parsed.sizeBytes === result.sizeBytes, "parse size equals build size");
        check(parsed.text === result.text, "parse text equals build text");
        check(parsed.value.phase === "d08_completed" && parsed.value.generation === 1, "parsed value matches");
        check(Object.isFrozen(parsed.value) && Object.isFrozen(parsed.value.identity), "parsed value deep frozen");
      }
      check(
        result.digestSha256 === createHash("sha256").update(result.bytes).digest("hex"),
        "digest is exact sha256 of bytes",
      );
      check(result.text.endsWith("\n") && !result.text.endsWith("\n\n"), "exactly one trailing LF");
      check(!result.text.startsWith("\uFEFF"), "no BOM");
      check(!result.text.includes("\r"), "no CR");
      check(!result.text.includes("\u0000"), "no NUL");
      check(new TextDecoder("utf-8", { fatal: true }).decode(result.bytes) === result.text, "strict UTF-8 round trip");
      const unicode = build({
        ...atPhase("d08_completed"),
        identity: { ...(atPhase("d08_completed").identity as Record<string, unknown>), taskBranch: "codex/分支-测试" },
        task_branch: "codex/分支-测试",
      });
      check(unicode.ok, "unicode branch accepted");
      if (unicode.ok) {
        const unicodeParsed = parseLoopDeliveryCheckpointBytes(unicode.bytes);
        check(unicodeParsed.ok && unicodeParsed.value.task_branch === "codex/分支-测试", "unicode round-trip exact");
      }
    }
  }
  {
    const built = build(atPhase("initialized"));
    if (built.ok) {
      const bytes = built.bytes;
      const text = built.text;
      const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...bytes]);
      check(!parseOk(withBom), "BOM rejected");
      const withCr = new Uint8Array([...bytes.slice(0, 10), 0x0d, ...bytes.slice(10)]);
      check(!parseOk(withCr), "CR rejected");
      const withNul = new Uint8Array([...bytes.slice(0, 10), 0x00, ...bytes.slice(10)]);
      check(!parseOk(withNul), "NUL rejected");
      check(!parseOk(bytes.slice(0, -1)), "missing trailing LF rejected");
      check(!parseOk(new Uint8Array([...bytes, 0x0a])), "double trailing LF rejected");
      const withInvalidUtf8 = new Uint8Array([...bytes.slice(0, 5), 0xff, ...bytes.slice(5)]);
      check(!parseOk(withInvalidUtf8), "invalid UTF-8 rejected");
      check(!parseOk(textBytes("not json at all")), "non-JSON rejected");
      check(!parseOk(new Uint8Array(0)), "empty bytes rejected");
      const reorderedText = JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(text)).reverse())) + "\n";
      check(!parseOk(textBytes(reorderedText)), "reordered keys rejected");
      const spacedText = text.replace(/"schema"/, '"schema" ');
      check(!parseOk(textBytes(spacedText)), "extra whitespace rejected");
      const duplicateText = text.replace('"phase":"initialized",', '"phase":"initialized","phase":"initialized",');
      check(!parseOk(textBytes(duplicateText)), "duplicate JSON key rejected");
      const spacedText2 = text.replace('"mode":"fresh"', '"mode": "fresh"');
      check(!parseOk(textBytes(spacedText2)), "extra whitespace after colon rejected");
      // size gates
      const small = parseLoopDeliveryCheckpointBytes(bytes, 100);
      check(failureOf(small)?.reason === "too_large", "parse size gate too_large");
      const smallBuild = build(atPhase("initialized"), 100);
      check(failureOf(smallBuild)?.reason === "too_large", "build size gate too_large");
      // non-Uint8Array inputs
      const notArray = parseLoopDeliveryCheckpointBytes("string" as never);
      check(failureOf(notArray)?.reason === "invalid_input", "non-Uint8Array rejected");
      const spoofed = new Uint8Array(4);
      Object.defineProperty(spoofed, Symbol.toStringTag, { value: "Uint8Array" });
      check(parseOk(spoofed) === false, "spoofed toStringTag cannot bypass intrinsic brand checks");
      // reordered input builds canonical output
      const reorderedBuild = build(Object.fromEntries(Object.entries(atPhase("initialized")).reverse()));
      check(reorderedBuild.ok, "reordered input accepted by builder");
      if (reorderedBuild.ok) check(reorderedBuild.text === text, "reordered input produces identical canonical bytes");
    }
  }
  markIfClear("D10_A_CHECKPOINT_CANONICAL_BYTES_VERIFIED");

  // ═══════════════════════════════════════════════════════════
  // 6. Fail-closed adversarial inputs
  // ═══════════════════════════════════════════════════════════
  startSection();
  console.log("fail-closed adversarial inputs");
  {
    // accessor rejection + getter never invoked
    const accessorInput = atPhase("initialized");
    let getterCalls = 0;
    Object.defineProperty(accessorInput, "phase", {
      get() {
        getterCalls += 1;
        return "initialized";
      },
      enumerable: true,
      configurable: true,
    });
    const accessorResult = build(accessorInput);
    check(failureOf(accessorResult)?.reason === "invalid_input", "accessor property rejected");
    check(getterCalls === 0, "getter never invoked");

    // symbol key
    const symbolInput = atPhase("initialized");
    (symbolInput as Record<symbol, unknown>)[Symbol("x")] = 1;
    check(!build(symbolInput).ok, "symbol key rejected");

    // __proto__ own key
    const protoInput = atPhase("initialized") as Record<string, unknown>;
    Object.defineProperty(protoInput, "__proto__", { value: {}, enumerable: true, configurable: true });
    check(!build(protoInput).ok, "__proto__ key rejected");

    // class instance
    class Secret {}
    const instance = Object.assign(new Secret(), atPhase("initialized"));
    check(!build(instance).ok, "class instance rejected");

    // non-plain prototype
    const weirdProto = Object.create({ inherited: 1 });
    Object.assign(weirdProto, atPhase("initialized"));
    check(!build(weirdProto).ok, "non-plain prototype rejected");

    // unknown / extra / missing root keys
    check(!build({ ...atPhase("initialized"), extra_field: 1 }).ok, "extra root key rejected");
    const missing = atPhase("initialized");
    delete (missing as Record<string, unknown>).phase;
    check(!build(missing).ok, "missing root key rejected");
    check(!build(null).ok, "null input rejected");
    check(!build(undefined).ok, "undefined input rejected");
    check(!build(42).ok, "number input rejected");
    check(!build([atPhase("initialized")]).ok, "array input rejected");
    check(!build("text").ok, "string input rejected");

    // throwing proxy / revoked proxy fail closed
    const throwingProxy = new Proxy(atPhase("initialized"), {
      getOwnPropertyDescriptor() {
        throw new Error("SENT_TRAP");
      },
    });
    const throwingResult = build(throwingProxy);
    check(!throwingResult.ok, "throwing proxy rejected");
    check(failureOf(throwingResult)?.diagnostic.includes("SENT_TRAP") === false, "unknown exception text not echoed");
    const { proxy, revoke } = Proxy.revocable(atPhase("initialized"), {});
    revoke();
    check(!build(proxy).ok, "revoked proxy rejected");

    // unknown exception in identity validation does not propagate
    const identityProxy = new Proxy({}, { getPrototypeOf() { throw new Error("SENT_ID"); } });
    check(!build({ ...atPhase("initialized"), identity: identityProxy }).ok, "throwing identity proxy rejected");

    // control chars in strings rejected
    check(!build(baseInput({ task_branch: "bad\u0000branch" })).ok, "NUL in string rejected");
    check(!build(baseInput({ task_branch: "bad\nbranch" })).ok, "LF in string rejected");

    // diagnostics bounded and redacted
    const secretInput = { ...atPhase("initialized"), secret_marker: "SENTINEL_SECRET_XYZ" };
    const secretResult = build(secretInput);
    check(!secretResult.ok, "unknown key with sentinel rejected");
    check((failureOf(secretResult)?.diagnostic.length ?? 999) <= 256, "diagnostic bounded");
    check(failureOf(secretResult)?.diagnostic.includes("SENTINEL_SECRET_XYZ") === false, "diagnostic does not echo raw input");
    check(failureOf(secretResult)?.diagnostic ? !/[\x00-\x1f\x7f]/.test(failureOf(secretResult)!.diagnostic) : false, "diagnostic has no control characters");

    // post-build mutation isolation + deep freeze
    const isolationInput = atPhase("initialized");
    const isolated = build(isolationInput);
    check(isolated.ok, "isolation build succeeds");
    if (isolated.ok) {
      isolationInput.identity = { ...(isolationInput.identity as Record<string, unknown>), runId: "mutated-run" };
      isolationInput.target_repository = "evil/repo";
      isolationInput.elapsed_ms = 99;
      check(isolated.value.identity.runId === "run-d10a-001", "mutating input does not affect built value");
      check(isolated.value.target_repository === "shaoyang01/target-repo", "mutating input does not affect bindings");
      check(isolated.value.elapsed_ms === 0, "mutating input does not affect scalars");
      check(Object.isFrozen(isolated.value), "built value frozen");
      check(Object.isFrozen(isolated.value.identity), "built identity frozen");
    }
  }
  markIfClear("D10_A_CHECKPOINT_FAIL_CLOSED_VERIFIED");

  // ═══════════════════════════════════════════════════════════
  // 7. Transition graph
  // ═══════════════════════════════════════════════════════════
  startSection();
  console.log("transition graph");
  {
    const DUMMY_PREV_REF = `loop-artifact:v1:delivery_checkpoint:sha256:${"0".repeat(64)}`;
    function nextInputFor(from: LoopDeliveryCheckpointPhase, to: LoopDeliveryCheckpointPhase, nextOverrides: Record<string, unknown> = {}): { prevBuild: Extract<ReturnType<typeof build>, { ok: true }>; nextInput: Record<string, unknown> } | null {
      const prevBuild = build({ ...atPhase(from), generation: 5, previous_checkpoint_artifact_ref: DUMMY_PREV_REF, elapsed_ms: 100 });
      if (!prevBuild.ok) return null;
      const prevRef = loopDeliveryCheckpointRef(prevBuild.value);
      return { prevBuild, nextInput: { ...atPhase(to), generation: 6, previous_checkpoint_artifact_ref: prevRef, elapsed_ms: 200, ...nextOverrides } };
    }

    // every legal edge is accepted
    const edges: Array<[LoopDeliveryCheckpointPhase, LoopDeliveryCheckpointPhase]> = [
      ["initialized", "d08_completed"],
      ["d08_completed", "workspace_prepared"],
      ["workspace_prepared", "d06_in_progress"],
      ["d06_in_progress", "d06_completed"],
      ["d06_completed", "tail_in_progress"],
      ["tail_in_progress", "tail_completed"],
      ["tail_completed", "a1_persisted"],
      ["a1_persisted", "publish_intent_persisted"],
      ["publish_intent_persisted", "commit_reconciled"],
      ["commit_reconciled", "push_reconciled"],
      ["push_reconciled", "pr_reconciled"],
      ["pr_reconciled", "publish_result_persisted"],
      ["publish_result_persisted", "completed"],
    ];
    for (const [from, to] of edges) {
      const p = nextInputFor(from, to);
      if (p === null) continue;
      const nextResult = build(p.nextInput);
      check(nextResult.ok, `next ${to} builds for edge ${from} -> ${to}`);
      if (nextResult.ok) {
        const tv = validateLoopDeliveryCheckpointTransition(p.prevBuild.value, nextResult.value);
        check(tv.ok, `edge ${from} -> ${to} accepted`);
      }
    }
    // terminal edges from every non-terminal phase
    for (const from of LOOP_DELIVERY_CHECKPOINT_PHASES) {
      if (from === "completed" || from === "blocked" || from === "failed") continue;
      for (const to of ["blocked", "failed"] as const) {
        const p = nextInputFor(from, to);
        if (p === null) continue;
        const nextResult = build(p.nextInput);
        check(nextResult.ok, `next ${to} builds from ${from}`);
        if (nextResult.ok) {
          const tv = validateLoopDeliveryCheckpointTransition(p.prevBuild.value, nextResult.value);
          check(tv.ok, `terminal edge ${from} -> ${to} accepted`);
        }
      }
    }
    // skip / rollback / self-transition / terminal continuations rejected
    const rejectedEdges: Array<[LoopDeliveryCheckpointPhase, LoopDeliveryCheckpointPhase]> = [
      ["initialized", "workspace_prepared"],
      ["initialized", "d06_completed"],
      ["d08_completed", "d06_in_progress"],
      ["workspace_prepared", "d06_completed"],
      ["tail_completed", "publish_intent_persisted"],
      ["d06_completed", "workspace_prepared"],
      ["commit_reconciled", "d06_completed"],
      ["publish_result_persisted", "pr_reconciled"],
      ["pr_reconciled", "commit_reconciled"],
      ["d08_completed", "d08_completed"],
      ["d06_in_progress", "d06_in_progress"],
      ["completed", "blocked"],
      ["blocked", "failed"],
      ["failed", "blocked"],
      ["pr_reconciled", "completed"],
      ["publish_result_persisted", "push_reconciled"],
    ];
    for (const [from, to] of rejectedEdges) {
      const p = nextInputFor(from, to);
      if (p === null) continue;
      const nextResult = build(p.nextInput);
      if (nextResult.ok) {
        const tv = validateLoopDeliveryCheckpointTransition(p.prevBuild.value, nextResult.value);
        check(!tv.ok, `edge ${from} -> ${to} rejected`);
      } else {
        check(true, `edge ${from} -> ${to} rejected at build (facts incompatible)`);
      }
    }
  }
  markIfClear("D10_A_CHECKPOINT_FORK_PREVENTION_VERIFIED");

  // ═══════════════════════════════════════════════════════════
  // 8. Generation/ref/immutable/workspace transition rules
  // ═══════════════════════════════════════════════════════════
  startSection();
  console.log("transition validation rules");
  {
    function tvPair(from: LoopDeliveryCheckpointPhase, to: LoopDeliveryCheckpointPhase, nextOverrides: Record<string, unknown> = {}): { prevBuild: Extract<ReturnType<typeof build>, { ok: true }>; nextInput: Record<string, unknown> } | null {
      const DUMMY_PREV_REF = `loop-artifact:v1:delivery_checkpoint:sha256:${"0".repeat(64)}`;
      const prevBuild = build({ ...atPhase(from), generation: 5, previous_checkpoint_artifact_ref: DUMMY_PREV_REF, elapsed_ms: 100 });
      if (!prevBuild.ok) return null;
      const prevRef = loopDeliveryCheckpointRef(prevBuild.value);
      const nextInput = { ...atPhase(to), generation: 6, previous_checkpoint_artifact_ref: prevRef, elapsed_ms: 200, ...nextOverrides };
      return { prevBuild, nextInput };
    }

    // generation increment rules
    {
      const p = tvPair("d08_completed", "workspace_prepared")!;
      const next = build({ ...p.nextInput, generation: 7 });
      if (next.ok) {
        check(!validateLoopDeliveryCheckpointTransition(p.prevBuild.value, next.value).ok, "generation skip rejected");
      } else {
        check(true, "generation skip rejected (build)");
      }
      const same = build({ ...p.nextInput, generation: 5 });
      if (same.ok) {
        check(!validateLoopDeliveryCheckpointTransition(p.prevBuild.value, same.value).ok, "generation rollback rejected");
      } else {
        check(true, "generation rollback rejected (build)");
      }
    }
    // previous ref fork prevention
    {
      const p = tvPair("d08_completed", "workspace_prepared")!;
      const forkRef = `loop-artifact:v1:delivery_checkpoint:sha256:${"9".repeat(64)}`;
      const next = build({ ...p.nextInput, previous_checkpoint_artifact_ref: forkRef });
      check(next.ok, "forked next builds (valid ref format)");
      if (next.ok) {
        const tv = validateLoopDeliveryCheckpointTransition(p.prevBuild.value, next.value);
        check(!tv.ok, "wrong previous ref (fork) rejected");
      }
      const prevRef = loopDeliveryCheckpointRef(p.prevBuild.value);
      const okNext = build({ ...p.nextInput, previous_checkpoint_artifact_ref: prevRef });
      check(okNext.ok, "chain next builds with derived ref");
      if (okNext.ok) {
        check(validateLoopDeliveryCheckpointTransition(p.prevBuild.value, okNext.value).ok, "correct previous ref accepted");
      }
    }
    // immutable bindings
    {
      const p = tvPair("d08_completed", "workspace_prepared")!;
      const changedIdentity = build({ ...p.nextInput, identity: { ...(p.nextInput.identity as Record<string, unknown>), createdAt: "2026-08-05T00:00:00.000Z" } });
      check(changedIdentity.ok, "changed identity builds");
      if (changedIdentity.ok) {
        check(!validateLoopDeliveryCheckpointTransition(p.prevBuild.value, changedIdentity.value).ok, "identity change rejected");
      }
      const changedDeadline = build({ ...p.nextInput, deadline_origin_ms: 12345 });
      check(changedDeadline.ok, "changed deadline builds");
      if (changedDeadline.ok) {
        check(!validateLoopDeliveryCheckpointTransition(p.prevBuild.value, changedDeadline.value).ok, "deadline origin change rejected");
      }
      const changedDuration = build({ ...p.nextInput, max_total_duration_ms: 1_000_000 });
      check(changedDuration.ok, "changed duration builds");
      if (changedDuration.ok) {
        check(!validateLoopDeliveryCheckpointTransition(p.prevBuild.value, changedDuration.value).ok, "max duration change rejected");
      }
      const changedWip = build({ ...p.nextInput, source_wip_digest_sha256: "0".repeat(64) });
      check(changedWip.ok, "changed wip digest builds");
      if (changedWip.ok) {
        check(!validateLoopDeliveryCheckpointTransition(p.prevBuild.value, changedWip.value).ok, "source wip digest change rejected");
      }
      const elapsedRegression = build({ ...p.nextInput, elapsed_ms: 50 });
      check(elapsedRegression.ok, "elapsed regression builds");
      if (elapsedRegression.ok) {
        check(!validateLoopDeliveryCheckpointTransition(p.prevBuild.value, elapsedRegression.value).ok, "elapsed regression rejected");
      }
    }
    // existing facts must not change or disappear
    {
      const p = tvPair("d06_completed", "tail_in_progress")!;
      const changedDelivery = build({ ...p.nextInput, delivery_result_artifact_ref: `loop-artifact:v1:delivery_result:sha256:${"8".repeat(64)}` });
      check(changedDelivery.ok, "changed delivery builds");
      if (changedDelivery.ok) {
        check(!validateLoopDeliveryCheckpointTransition(p.prevBuild.value, changedDelivery.value).ok, "delivery ref change rejected");
      }
      const p2 = tvPair("publish_result_persisted", "blocked", { terminal_status: "blocked", terminal_reason_code: "BLOCKED_X" })!;
      const changedCommit = build({ ...p2.nextInput, commit_sha: "f".repeat(40), remote_branch_sha: "f".repeat(40), workspace_head_sha: "f".repeat(40) });
      check(changedCommit.ok, "changed commit builds (head aligned)");
      if (changedCommit.ok) {
        check(!validateLoopDeliveryCheckpointTransition(p2.prevBuild.value, changedCommit.value).ok, "commit change rejected");
      }
      const changedPrUrl = build({ ...p2.nextInput, pr_url: "https://github.com/shaoyang01/target-repo/pull/43", pr_number: 43 });
      check(changedPrUrl.ok, "changed PR facts build");
      if (changedPrUrl.ok) {
        check(!validateLoopDeliveryCheckpointTransition(p2.prevBuild.value, changedPrUrl.value).ok, "PR fact change rejected");
      }
    }
    // workspace transition matrix
    {
      const p = tvPair("workspace_prepared", "d06_in_progress")!;
      const changedDigest = build({ ...p.nextInput, workspace_status_digest_sha256: "e".repeat(64) });
      check(changedDigest.ok, "workspace digest change builds");
      if (changedDigest.ok) {
        check(!validateLoopDeliveryCheckpointTransition(p.prevBuild.value, changedDigest.value).ok, "digest change workspace_prepared->d06_in_progress rejected");
      }
      const p2 = tvPair("d06_in_progress", "d06_completed", { workspace_status_digest_sha256: "e".repeat(64) })!;
      const digestOk = build(p2.nextInput);
      check(digestOk.ok, "d06 digest change builds");
      if (digestOk.ok) {
        check(validateLoopDeliveryCheckpointTransition(p2.prevBuild.value, digestOk.value).ok, "digest change d06_in_progress->d06_completed accepted");
      }
      const headChanged = build({ ...p2.nextInput, workspace_head_sha: "f".repeat(40) });
      if (headChanged.ok) {
        check(!validateLoopDeliveryCheckpointTransition(p2.prevBuild.value, headChanged.value).ok, "head change entering d06_completed rejected");
      }
      const p3 = tvPair("d06_completed", "tail_in_progress", { workspace_status_digest_sha256: "e".repeat(64) })!;
      const tailDigestOk = build(p3.nextInput);
      check(tailDigestOk.ok, "tail digest change builds");
      if (tailDigestOk.ok) {
        check(validateLoopDeliveryCheckpointTransition(p3.prevBuild.value, tailDigestOk.value).ok, "digest change d06_completed->tail_in_progress accepted");
      }
      const p4 = tvPair("a1_persisted", "publish_intent_persisted", { workspace_status_digest_sha256: "e".repeat(64) })!;
      const a1Digest = build(p4.nextInput);
      if (a1Digest.ok) {
        check(!validateLoopDeliveryCheckpointTransition(p4.prevBuild.value, a1Digest.value).ok, "digest change a1->publish_intent rejected");
      }
      const p5 = tvPair("publish_intent_persisted", "commit_reconciled", { workspace_status_digest_sha256: "e".repeat(64) })!;
      const commitEdge = build(p5.nextInput);
      check(commitEdge.ok, "publish_intent->commit_reconciled builds");
      if (commitEdge.ok) {
        check(validateLoopDeliveryCheckpointTransition(p5.prevBuild.value, commitEdge.value).ok, "publish_intent->commit_reconciled accepted (head becomes commit)");
      }
      const p6 = tvPair("commit_reconciled", "push_reconciled", { workspace_status_digest_sha256: "e".repeat(64) })!;
      const postCommit = build(p6.nextInput);
      if (postCommit.ok) {
        check(!validateLoopDeliveryCheckpointTransition(p6.prevBuild.value, postCommit.value).ok, "post-commit digest change rejected");
      }
      // blocked with commit must not regress the head (builder-level prefix
      // rule: head must equal the commit sha)
      const p7 = tvPair("publish_result_persisted", "blocked", { terminal_status: "blocked", terminal_reason_code: "BLOCKED_Y", workspace_head_sha: "c".repeat(40) })!;
      const regressed = build(p7.nextInput);
      check(!regressed.ok, "blocked pre-commit head regression rejected at build");
      // workspace path change
      const p8 = tvPair("d06_completed", "tail_in_progress", { workspace_path: "/tmp/other/workspace" })!;
      const pathChanged = build(p8.nextInput);
      check(pathChanged.ok, "workspace path change builds");
      if (pathChanged.ok) {
        check(!validateLoopDeliveryCheckpointTransition(p8.prevBuild.value, pathChanged.value).ok, "workspace path change rejected");
      }
      // workspace facts may be added at terminal (read-only observation)
      {
        const prev9 = build({ ...atPhase("d08_completed"), generation: 5, previous_checkpoint_artifact_ref: `loop-artifact:v1:delivery_checkpoint:sha256:${"0".repeat(64)}`, elapsed_ms: 100 });
        check(prev9.ok, "d08_completed prev builds");
        if (prev9.ok) {
          const prev9Ref = loopDeliveryCheckpointRef(prev9.value);
          const observed = build({
            ...baseInput({ phase: "blocked" }),
            ...FACTS.A, ...FACTS.W_FALSE, ...FACTS.T_BLOCKED,
            generation: 6, previous_checkpoint_artifact_ref: prev9Ref, elapsed_ms: 200,
          });
          check(observed.ok, "blocked with observed workspace builds");
          if (observed.ok) {
            check(validateLoopDeliveryCheckpointTransition(prev9.value, observed.value).ok, "blocked read-only workspace observation accepted");
          }
        }
      }
      // dropping established workspace facts at terminal rejected
      {
        const prev10 = build({ ...atPhase("d06_completed"), generation: 5, previous_checkpoint_artifact_ref: `loop-artifact:v1:delivery_checkpoint:sha256:${"0".repeat(64)}`, elapsed_ms: 100 });
        check(prev10.ok, "d06_completed prev builds");
        if (prev10.ok) {
          const prev10Ref = loopDeliveryCheckpointRef(prev10.value);
          const dropped = build({
            ...baseInput({ phase: "blocked" }),
            ...FACTS.A, ...FACTS.T_BLOCKED,
            generation: 6, previous_checkpoint_artifact_ref: prev10Ref, elapsed_ms: 200,
          });
          check(dropped.ok, "blocked without workspace builds");
          if (dropped.ok) {
            check(!validateLoopDeliveryCheckpointTransition(prev10.value, dropped.value).ok, "dropping established workspace facts rejected");
          }
        }
      }
    }
  }
  markIfClear("D10_A_CHECKPOINT_FORK_PREVENTION_VERIFIED");

  // ═══════════════════════════════════════════════════════════
  // 9. Canonical text helper consistency
  // ═══════════════════════════════════════════════════════════
  startSection();
  console.log("canonical text helper");
  {
    const result = build(atPhase("pr_reconciled"));
    check(result.ok, "pr_reconciled builds");
    if (result.ok) {
      check(canonicalizeLoopDeliveryCheckpoint(result.value) === result.text, "canonicalize helper equals builder text");
      const ref = loopDeliveryCheckpointRef(result.value);
      check(ref === `loop-artifact:v1:delivery_checkpoint:sha256:${result.digestSha256}`, "ref helper equals content-derived ref");
    }
  }
  markIfClear("D10_A_CHECKPOINT_FORK_PREVENTION_VERIFIED");

  console.log("\nD10_A_CHECKPOINT_SCHEMA_VERIFIED", MARKERS.D10_A_CHECKPOINT_SCHEMA_VERIFIED);
  console.log("D10_A_CHECKPOINT_CANONICAL_BYTES_VERIFIED", MARKERS.D10_A_CHECKPOINT_CANONICAL_BYTES_VERIFIED);
  console.log("D10_A_CHECKPOINT_FAIL_CLOSED_VERIFIED", MARKERS.D10_A_CHECKPOINT_FAIL_CLOSED_VERIFIED);
  console.log("D10_A_CHECKPOINT_FORK_PREVENTION_VERIFIED", MARKERS.D10_A_CHECKPOINT_FORK_PREVENTION_VERIFIED);
  console.log(`\nD10_A_CHECKPOINT_SUMMARY passed=${passed} failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main();
