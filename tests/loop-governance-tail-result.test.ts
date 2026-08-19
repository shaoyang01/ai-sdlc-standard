// D09-A1 — Governance Tail Result Contract Tests
// ===============================================
// Real assertion-count tests for the canonical, deterministic, fail-closed
// `loop-governance-tail-result-v1` contract: builder, parser, canonical
// bytes, adversarial untrusted input, conditional decision matrix,
// Manifest/Tail Gate binding, and the Artifact Store kind extension.
//
// Positive, negative, canonical-bytes, adversarial-object and cleanup
// coverage. Markers are only printed when every assertion of the
// corresponding section succeeded. No placeholders, no skips, no ok(true).

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildLoopGovernanceTailResult,
  parseLoopGovernanceTailResultBytes,
  LOOP_GOVERNANCE_TAIL_RESULT_SCHEMA,
  LOOP_GOVERNANCE_TAIL_RESULT_MAX_BYTES,
  type LoopGovernanceTailResultBuildResult,
} from "../core/loop-governance-tail-result";
import {
  LoopArtifactStore,
  LOOP_ARTIFACT_KINDS,
  type LoopArtifactKind,
} from "../core/loop-artifact-store";

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
  D09_A1_GOVERNANCE_TAIL_RESULT_SCHEMA_VERIFIED: false,
  D09_A1_GOVERNANCE_TAIL_RESULT_CANONICAL_BYTES_VERIFIED: false,
  D09_A1_GOVERNANCE_TAIL_RESULT_FAIL_CLOSED: false,
  D09_A1_ARTIFACT_KIND_VERIFIED: false,
  D09_A1_D01_D08_REGRESSION_PRESERVED: false,
  D09_A1_TEMP_CLEANUP_COMPLETE: false,
  D09_A1_PARSER_UNTRUSTED_BYTES_FAIL_CLOSED_VERIFIED: false,
  D09_A1_ARRAY_PLAIN_PROTOTYPE_VERIFIED: false,
  D09_A1_BOUNDED_UTF8_BUDGET_VERIFIED: false,
};

function markIfClear(marker: string): void {
  if (sectionFailures === 0) {
    MARKERS[marker] = true;
  } else {
    console.error(`  marker ${marker} NOT set (${sectionFailures} section failure(s))`);
  }
}

const tempDirs: string[] = [];

function performCleanup(dirs: string[]): boolean {
  let allClean = true;
  for (const dir of dirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      allClean = false;
    }
  }
  return allClean;
}

// ═══════════════════════════════════════ Valid input factory

const REPO_ORCH = `loop-artifact:v1:orchestration_result:sha256:${"1".repeat(64)}`;
const REPO_EXEC = `loop-artifact:v1:executor_input:sha256:${"2".repeat(64)}`;
const REPO_DELIVERY = `loop-artifact:v1:delivery_result:sha256:${"3".repeat(64)}`;
const D_IMPL = "1".repeat(64);
const D_REVIEW = "2".repeat(64);
const D_ACCEPT = "3".repeat(64);
const D_SYNC = "4".repeat(64);
const D_RECONCILE = "5".repeat(64);
const D_ENTRY = "6".repeat(64);
const D_REGATE = "7".repeat(64);
const D_MANIFEST = "8".repeat(64);
const D_GATE = "9".repeat(64);

const VALID_FILES = [
  "03-实现记录/implementation-record.md",
  "04-代码审核/code-review.md",
  "05-测试验收/tail-gate.md",
  "05-测试验收/test-acceptance.md",
  "core/loop-requirement-design-orchestrator.ts",
  "docs/entry-coverage-evidence.md",
  "docs/manifest.md",
  "docs/reconcile-evidence.md",
  "docs/regate-evidence.md",
  "docs/sync-evidence.md",
  "tests/loop-governance-tail-result.test.ts",
];

function makeValidInput(): Record<string, unknown> {
  return {
    schema: "loop-governance-tail-result-v1",
    status: "completed",
    reason_code: "GOVERNANCE_TAIL_COMPLETED",
    identity: {
      runId: "run-d09a1-001",
      requirementId: "req-d09a1-001",
      repository: "shaoyang01/target-repo",
      repositoryPath: "/tmp/loop-governance-tail/repo",
      baseBranch: "main",
      expectedBaseSha: "a".repeat(40),
      taskBranch: "codex/d09a1-tail-run",
      controlRoot: "/tmp/loop-governance-tail/control",
      createdAt: "2026-08-03T00:00:00.000Z",
    },
    orchestration_result_artifact_ref: REPO_ORCH,
    executor_input_artifact_ref: REPO_EXEC,
    delivery_result_artifact_ref: REPO_DELIVERY,
    final_workspace: {
      workspace_path: "/tmp/loop-governance-tail/workspace",
      task_branch: "codex/d09a1-tail-run",
      task_head_sha: "b".repeat(40),
      status_digest_sha256: "c".repeat(64),
      task_has_changes: true,
    },
    implementation_files: ["core/loop-requirement-design-orchestrator.ts", "tests/loop-governance-tail-result.test.ts"],
    files: VALID_FILES,
    docflow: {
      implementation_record: { path: "03-实现记录/implementation-record.md", version: "v1", digest_sha256: D_IMPL },
      code_review: { path: "04-代码审核/code-review.md", version: "v1", digest_sha256: D_REVIEW, result: "PASS" },
      test_acceptance: { path: "05-测试验收/test-acceptance.md", version: "v1", digest_sha256: D_ACCEPT, result: "PASS" },
    },
    business_domain_sync: {
      decision: "SYNC_REQUIRED",
      write_authorized: true,
      execution_status: "completed",
      evidence: { path: "docs/sync-evidence.md", version: "v1", digest_sha256: D_SYNC },
      basis: null,
    },
    reconcile: {
      decision: "required",
      execution_status: "completed",
      evidence: { path: "docs/reconcile-evidence.md", version: "v1", digest_sha256: D_RECONCILE },
      basis: null,
    },
    entry_coverage: {
      status: "PASS",
      evidence: { path: "docs/entry-coverage-evidence.md", version: "v1", digest_sha256: D_ENTRY },
      basis: null,
    },
    regate: {
      status: "PASS",
      evidence: { path: "docs/regate-evidence.md", version: "v1", digest_sha256: D_REGATE },
      basis: null,
    },
    manifest: {
      path: "docs/manifest.md",
      version: "manifest-v1",
      digest_sha256: D_MANIFEST,
      tail_status: "completed",
      completion_evidence: [
        { path: "03-实现记录/implementation-record.md", version: "v1", digest_sha256: D_IMPL },
        { path: "04-代码审核/code-review.md", version: "v1", digest_sha256: D_REVIEW },
        { path: "05-测试验收/test-acceptance.md", version: "v1", digest_sha256: D_ACCEPT },
        { path: "docs/entry-coverage-evidence.md", version: "v1", digest_sha256: D_ENTRY },
        { path: "docs/reconcile-evidence.md", version: "v1", digest_sha256: D_RECONCILE },
        { path: "docs/regate-evidence.md", version: "v1", digest_sha256: D_REGATE },
        { path: "docs/sync-evidence.md", version: "v1", digest_sha256: D_SYNC },
      ],
      completion_decision_source: { path: "05-测试验收/tail-gate.md", version: "gate-v1", digest_sha256: D_GATE },
    },
    tail_gate: {
      path: "05-测试验收/tail-gate.md",
      version: "gate-v1",
      digest_sha256: D_GATE,
      result: "PASS",
      persisted: true,
      read_back_verified: true,
      reviewed_manifest_version: "manifest-v1",
      completion_decision_source: { path: "05-测试验收/tail-gate.md", version: "gate-v1", digest_sha256: D_GATE },
    },
    blocking_items: [],
    elapsed_ms: 1234,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildValid(): LoopGovernanceTailResultBuildResult {
  return buildLoopGovernanceTailResult(makeValidInput());
}

// ═══════════════════════════════════════ Negative helper

function expectBuildFailure(
  name: string,
  mutate: (input: Record<string, unknown>) => void,
  expectedReason: string,
  opts?: { diagnostic?: string; effect?: (input: Record<string, unknown>) => boolean },
): void {
  const input = clone(makeValidInput());
  const before = JSON.stringify(input);
  mutate(input);
  const after = JSON.stringify(input);
  if (opts?.effect !== undefined) {
    check(opts.effect(input), `${name}: mutation actually took effect`);
  } else {
    check(before !== after, `${name}: mutation actually changed the input`);
  }
  let result: LoopGovernanceTailResultBuildResult;
  try {
    result = buildLoopGovernanceTailResult(input);
  } catch {
    check(false, `${name}: build must not throw for untrusted input`);
    return;
  }
  check(result.ok === false, `${name}: build fails closed`);
  if (result.ok === false) {
    check(result.reason === expectedReason, `${name}: failure reason ${expectedReason} (got ${result.reason})`);
    check(result.diagnostic.length > 0 && result.diagnostic.length <= 256, `${name}: diagnostic safe bounded length`);
    if (opts?.diagnostic !== undefined) {
      check(result.diagnostic.includes(opts.diagnostic), `${name}: diagnostic mentions '${opts.diagnostic}' (got '${result.diagnostic}')`);
    }
  }
}

function expectParseFailure(
  name: string,
  bytes: Uint8Array,
  expectedReason: string,
  opts?: { diagnostic?: string },
): void {
  let result: LoopGovernanceTailResultBuildResult;
  try {
    result = parseLoopGovernanceTailResultBytes(bytes);
  } catch {
    check(false, `${name}: parser must not throw for untrusted bytes`);
    return;
  }
  check(result.ok === false, `${name}: parser fails closed`);
  if (result.ok === false) {
    check(result.reason === expectedReason, `${name}: parser reason ${expectedReason} (got ${result.reason})`);
    if (opts?.diagnostic !== undefined) {
      check(result.diagnostic.includes(opts.diagnostic), `${name}: diagnostic mentions '${opts.diagnostic}' (got '${result.diagnostic}')`);
    }
  }
}

/**
 * Parser negative-input helper for the untrusted bytes boundary. Explicitly
 * proves no-throw, binds the exact failure reason, and verifies the
 * diagnostic stays static, bounded and free of any sentinel exception text.
 */
function expectUntrustedBytesRejection(
  name: string,
  input: unknown,
  expectedReason: string,
  opts?: { sentinel?: string; maxBytes?: number },
): void {
  let result: LoopGovernanceTailResultBuildResult;
  let threw = false;
  try {
    result = parseLoopGovernanceTailResultBytes(input as Uint8Array, opts?.maxBytes);
  } catch {
    threw = true;
    result = { ok: false, reason: "invalid_input", diagnostic: "parser threw" };
  }
  check(!threw, `${name}: parser must not throw for untrusted bytes`);
  check(result.ok === false, `${name}: parser fails closed`);
  if (result.ok === false) {
    check(result.reason === expectedReason, `${name}: parser reason ${expectedReason} (got ${result.reason})`);
    check(result.diagnostic.length > 0 && result.diagnostic.length <= 256, `${name}: diagnostic safe bounded length`);
    if (opts?.sentinel !== undefined && opts.sentinel.length > 0) {
      check(!result.diagnostic.includes(opts.sentinel), `${name}: diagnostic does not leak sentinel`);
    }
  }
}

// ═══════════════════════════════════════ 1. schema and canonical build

async function sectionSchema(): Promise<void> {
  startSection();
  console.log("1. schema, fixed values, canonical root order");
  check(LOOP_GOVERNANCE_TAIL_RESULT_SCHEMA === "loop-governance-tail-result-v1", "schema constant is loop-governance-tail-result-v1");
  const built = buildValid();
  check(built.ok === true, "canonical build succeeds");
  if (built.ok) {
    const value = built.value;
    check(value.schema === "loop-governance-tail-result-v1", "schema fixed");
    check(value.status === "completed", "status fixed");
    check(value.reason_code === "GOVERNANCE_TAIL_COMPLETED", "reason_code fixed");
    check(Array.isArray(value.blocking_items) && value.blocking_items.length === 0, "blocking_items exactly empty");
    check(Number.isSafeInteger(value.elapsed_ms) && value.elapsed_ms >= 0 && value.elapsed_ms <= 3_600_000, "elapsed_ms bounded safe integer");

    const parsed = JSON.parse(built.text) as Record<string, unknown>;
    const rootOrder = Object.keys(parsed);
    check(
      JSON.stringify(rootOrder) === JSON.stringify([
        "schema", "status", "reason_code", "identity", "orchestration_result_artifact_ref",
        "executor_input_artifact_ref", "delivery_result_artifact_ref", "final_workspace",
        "implementation_files", "files", "docflow", "business_domain_sync", "reconcile",
        "entry_coverage", "regate", "manifest", "tail_gate", "blocking_items", "elapsed_ms",
      ]),
      "canonical root property order fixed",
    );
    check(
      Object.keys(parsed.identity as Record<string, unknown>).join(",") ===
        "runId,requirementId,repository,repositoryPath,baseBranch,expectedBaseSha,taskBranch,controlRoot,createdAt",
      "identity nine fields in canonical order",
    );
    const docflow = parsed.docflow as Record<string, unknown>;
    check(Object.keys(docflow).join(",") === "implementation_record,code_review,test_acceptance", "docflow canonical order");
    const implRecord = docflow.implementation_record as Record<string, unknown>;
    check(Object.keys(implRecord).join(",") === "path,version,digest_sha256", "evidence ref canonical order");
    const codeReview = docflow.code_review as Record<string, unknown>;
    check(Object.keys(codeReview).join(",") === "path,version,digest_sha256,result", "review record canonical order");
    const sync = parsed.business_domain_sync as Record<string, unknown>;
    check(Object.keys(sync).join(",") === "decision,write_authorized,execution_status,evidence,basis", "sync canonical order");
    const manifest = parsed.manifest as Record<string, unknown>;
    check(
      Object.keys(manifest).join(",") === "path,version,digest_sha256,tail_status,completion_evidence,completion_decision_source",
      "manifest canonical order",
    );
    const tailGate = parsed.tail_gate as Record<string, unknown>;
    check(
      Object.keys(tailGate).join(",") === "path,version,digest_sha256,result,persisted,read_back_verified,reviewed_manifest_version,completion_decision_source",
      "tail gate canonical order",
    );

    // identity is captured as a fresh plain snapshot — later caller mutation
    // of the original identity object must not reach the canonical value.
    const input = makeValidInput();
    const snapshot = buildLoopGovernanceTailResult(input);
    (input.identity as Record<string, unknown>).taskBranch = "hacked-branch";
    (input.identity as Record<string, unknown>).runId = "hacked-run";
    check(snapshot.ok === true, "identity snapshot build succeeds");
    if (snapshot.ok) {
      check(snapshot.value.identity.taskBranch === "codex/d09a1-tail-run", "identity snapshot unaffected by caller mutation");
      check(snapshot.value.identity.runId === "run-d09a1-001", "identity snapshot runId unaffected by caller mutation");
    }

    // upstream refs are validated with exact kind binding
    check(/^loop-artifact:v1:orchestration_result:sha256:[0-9a-f]{64}$/.test(value.orchestration_result_artifact_ref), "orchestration ref kind bound");
    check(/^loop-artifact:v1:executor_input:sha256:[0-9a-f]{64}$/.test(value.executor_input_artifact_ref), "executor input ref kind bound");
    check(/^loop-artifact:v1:delivery_result:sha256:[0-9a-f]{64}$/.test(value.delivery_result_artifact_ref), "delivery result ref kind bound");

    // cross-bindings
    check(value.final_workspace.task_branch === value.identity.taskBranch, "final_workspace.task_branch equals identity.taskBranch");
    check(value.tail_gate.reviewed_manifest_version === value.manifest.version, "reviewed manifest version equals manifest.version");
    check(
      value.manifest.completion_decision_source.path === value.tail_gate.path &&
        value.manifest.completion_decision_source.version === value.tail_gate.version &&
        value.manifest.completion_decision_source.digest_sha256 === value.tail_gate.digest_sha256,
      "manifest completion decision source equals tail gate file",
    );
    check(
      value.tail_gate.completion_decision_source.path === value.tail_gate.path &&
        value.tail_gate.completion_decision_source.digest_sha256 === value.tail_gate.digest_sha256,
      "tail gate completion decision source equals tail gate file",
    );
    const implSet = new Set(value.implementation_files);
    check(value.implementation_files.every((file) => value.files.includes(file)), "implementation files are a subset of files");
    check(implSet.size === value.implementation_files.length, "implementation files no duplicates");
    check(new Set(value.files).size === value.files.length, "files no duplicates");
    check(value.docflow.implementation_record.path.includes("03-实现记录"), "03 path present");
    check(value.docflow.code_review.path.includes("04-代码审核"), "04 path present");
    check(value.docflow.test_acceptance.path.includes("05-测试验收"), "05 path present");
    check(value.manifest.path.split("/").pop() === "manifest.md", "manifest file named manifest.md");
    check(value.manifest.path !== value.tail_gate.path, "manifest path differs from tail gate path");
    check(value.blocking_items.length === 0, "blocking_items empty in value");
  }
  markIfClear("D09_A1_GOVERNANCE_TAIL_RESULT_SCHEMA_VERIFIED");
}

// ═══════════════════════════════════════ 2. canonical bytes and parser round-trip

function sectionCanonicalBytes(): void {
  startSection();
  console.log("2. canonical bytes, parser round-trip, deep freeze");
  const built = buildValid();
  check(built.ok === true, "build succeeds for canonical bytes section");
  if (built.ok) {
    const text = built.text;
    check(text.endsWith("\n") && !text.endsWith("\n\n"), "exactly one trailing LF");
    check(!text.includes("\r"), "no actual CR");
    check(!text.includes("\u0000"), "no actual NUL");
    check(!text.startsWith("\ufeff"), "no BOM");
    check(built.bytes instanceof Uint8Array, "bytes is Uint8Array");
    check(built.sizeBytes === built.bytes.length, "sizeBytes equals bytes length");
    check(built.digestSha256 === createHash("sha256").update(built.bytes).digest("hex"), "digest is sha256 of bytes");
    check(/^[0-9a-f]{64}$/.test(built.digestSha256), "digest lowercase hex");
    check(new TextDecoder("utf-8").decode(built.bytes) === text, "bytes decode back to canonical text");

    // parser round-trip
    const parsed = parseLoopGovernanceTailResultBytes(built.bytes);
    check(parsed.ok === true, "parser round-trip succeeds");
    if (parsed.ok) {
      check(parsed.digestSha256 === built.digestSha256, "parsed digest identical");
      check(parsed.sizeBytes === built.sizeBytes, "parsed size identical");
      check(JSON.stringify(parsed.value) === JSON.stringify(built.value), "parsed value identical");
      check(parsed.text === built.text, "parsed text identical");
      check(parsed.bytes !== built.bytes, "parsed bytes is a distinct object");
      // defensive bytes: mutating the caller's input bytes must not reach
      // the parsed result's bytes
      built.bytes[0] = 0x42;
      check(parsed.bytes[0] !== 0x42, "parsed bytes do not share backing storage with input");
      check(parsed.bytes[0] === new TextEncoder().encode(parsed.text)[0], "parsed bytes still match parsed text");
    }

    // deep freeze
    check(Object.isFrozen(built.value), "root value frozen");
    check(Object.isFrozen(built.value.identity), "identity frozen");
    check(Object.isFrozen(built.value.docflow), "docflow frozen");
    check(Object.isFrozen(built.value.manifest), "manifest frozen");
    check(Object.isFrozen(built.value.manifest.completion_evidence), "completion evidence array frozen");
    check(Object.isFrozen(built.value.files), "files array frozen");
    let mutationThrew = false;
    try {
      (built.value as { status: string }).status = "pending";
    } catch {
      mutationThrew = true;
    }
    check(mutationThrew || built.value.status === "completed", "root mutation attempt ineffective");
    let nestedMutationThrew = false;
    try {
      (built.value.docflow as { implementation_record: { version: string } }).implementation_record.version = "hacked";
    } catch {
      nestedMutationThrew = true;
    }
    check(nestedMutationThrew || built.value.docflow.implementation_record.version === "v1", "nested mutation attempt ineffective");
    check(built.value.status === "completed", "value unchanged after mutation attempts");
    check(built.value.docflow.implementation_record.version === "v1", "nested value unchanged after mutation attempts");
  }
  markIfClear("D09_A1_GOVERNANCE_TAIL_RESULT_CANONICAL_BYTES_VERIFIED");
}

// ═══════════════════════════════════════ 3. conditional decision matrix (positive)

function sectionConditionalMatrix(): void {
  startSection();
  console.log("3. conditional decision matrix positive states");
  const fullBasis = {
    scope: "documentation_governance_tail",
    reason: "no business domain write required for this requirement",
    evidence: "03-实现记录/implementation-record.md",
    decision_source: "sdlc-gate-runner",
    decision_owner: "project-controller",
    version_basis: "v1",
    stale_condition: "none",
  };

  // default: sync required/complete, reconcile required/complete,
  // entry PASS, regate PASS, review/test PASS
  {
    const built = buildValid();
    check(built.ok === true, "default completed matrix succeeds");
    if (built.ok) {
      check(built.value.business_domain_sync.decision === "SYNC_REQUIRED" && built.value.business_domain_sync.write_authorized === true, "sync required and authorized");
      check(built.value.business_domain_sync.execution_status === "completed", "sync completed");
      check(built.value.business_domain_sync.evidence !== null && built.value.business_domain_sync.basis === null, "sync evidence present, basis null");
      check(built.value.reconcile.decision === "required" && built.value.reconcile.execution_status === "completed", "reconcile required and completed");
      check(built.value.entry_coverage.status === "PASS" && built.value.entry_coverage.evidence !== null, "entry coverage PASS");
      check(built.value.regate.status === "PASS" && built.value.regate.evidence !== null, "regate PASS");
      check(built.value.docflow.code_review.result === "PASS", "code review PASS");
      check(built.value.docflow.test_acceptance.result === "PASS", "test acceptance PASS");
      check(built.value.tail_gate.result === "PASS" && built.value.tail_gate.persisted === true && built.value.tail_gate.read_back_verified === true, "tail gate PASS persisted read-back verified");
    }
  }

  // PASS_WITH_RISK on review and test acceptance
  {
    const input = clone(makeValidInput());
    (input.docflow as Record<string, unknown>).code_review = { ...(input.docflow as Record<string, unknown>).code_review as Record<string, unknown>, result: "PASS_WITH_RISK" };
    (input.docflow as Record<string, unknown>).test_acceptance = { ...(input.docflow as Record<string, unknown>).test_acceptance as Record<string, unknown>, result: "PASS_WITH_RISK" };
    (input.tail_gate as Record<string, unknown>).result = "PASS_WITH_RISK";
    const built = buildLoopGovernanceTailResult(input);
    check(built.ok === true, "PASS_WITH_RISK matrix succeeds");
    if (built.ok) {
      check(built.value.docflow.code_review.result === "PASS_WITH_RISK", "code review PASS_WITH_RISK preserved");
      check(built.value.docflow.test_acceptance.result === "PASS_WITH_RISK", "test acceptance PASS_WITH_RISK preserved");
      check(built.value.tail_gate.result === "PASS_WITH_RISK", "tail gate PASS_WITH_RISK preserved");
    }
  }

  // sync NOT_REQUIRED with full basis
  {
    const input = clone(makeValidInput());
    input.business_domain_sync = {
      decision: "NOT_REQUIRED",
      write_authorized: false,
      execution_status: "not_required",
      evidence: null,
      basis: fullBasis,
    };
    input.manifest = {
      ...input.manifest as Record<string, unknown>,
      completion_evidence: (input.manifest as Record<string, unknown>).completion_evidence as Array<Record<string, unknown>>,
    };
    (input.manifest as Record<string, unknown>).completion_evidence = ((input.manifest as Record<string, unknown>).completion_evidence as Array<Record<string, unknown>>)
      .filter((entry) => entry.path !== "docs/sync-evidence.md");
    const built = buildLoopGovernanceTailResult(input);
    check(built.ok === true, "sync NOT_REQUIRED with basis succeeds");
    if (built.ok) {
      check(built.value.business_domain_sync.decision === "NOT_REQUIRED", "sync decision NOT_REQUIRED");
      check(built.value.business_domain_sync.write_authorized === false && built.value.business_domain_sync.execution_status === "not_required", "sync not authorized/not required");
      check(built.value.business_domain_sync.evidence === null, "sync evidence null");
      check(built.value.business_domain_sync.basis !== null && built.value.business_domain_sync.basis!.scope === "documentation_governance_tail", "sync basis present");
      check(built.value.manifest.completion_evidence.every((entry) => entry.path !== "docs/sync-evidence.md"), "manifest omits not-required sync evidence");
    }
  }

  // reconcile not_required with full basis
  {
    const input = clone(makeValidInput());
    input.reconcile = {
      decision: "not_required",
      execution_status: "not_required",
      evidence: null,
      basis: fullBasis,
    };
    (input.manifest as Record<string, unknown>).completion_evidence = ((input.manifest as Record<string, unknown>).completion_evidence as Array<Record<string, unknown>>)
      .filter((entry) => entry.path !== "docs/reconcile-evidence.md");
    const built = buildLoopGovernanceTailResult(input);
    check(built.ok === true, "reconcile not_required with basis succeeds");
    if (built.ok) {
      check(built.value.reconcile.decision === "not_required" && built.value.reconcile.evidence === null, "reconcile not_required");
      check(built.value.reconcile.basis !== null, "reconcile basis present");
    }
  }

  // entry coverage not_applicable with full basis
  {
    const input = clone(makeValidInput());
    input.entry_coverage = {
      status: "not_applicable",
      evidence: null,
      basis: fullBasis,
    };
    (input.manifest as Record<string, unknown>).completion_evidence = ((input.manifest as Record<string, unknown>).completion_evidence as Array<Record<string, unknown>>)
      .filter((entry) => entry.path !== "docs/entry-coverage-evidence.md");
    const built = buildLoopGovernanceTailResult(input);
    check(built.ok === true, "entry coverage not_applicable with basis succeeds");
    if (built.ok) {
      check(built.value.entry_coverage.status === "not_applicable" && built.value.entry_coverage.evidence === null, "entry not_applicable");
      check(built.value.entry_coverage.basis !== null, "entry basis present");
    }
  }

  // regate not_required with full basis
  {
    const input = clone(makeValidInput());
    input.regate = {
      status: "not_required",
      evidence: null,
      basis: fullBasis,
    };
    (input.manifest as Record<string, unknown>).completion_evidence = ((input.manifest as Record<string, unknown>).completion_evidence as Array<Record<string, unknown>>)
      .filter((entry) => entry.path !== "docs/regate-evidence.md");
    const built = buildLoopGovernanceTailResult(input);
    check(built.ok === true, "regate not_required with basis succeeds");
    if (built.ok) {
      check(built.value.regate.status === "not_required" && built.value.regate.evidence === null, "regate not_required");
      check(built.value.regate.basis !== null, "regate basis present");
    }
  }
}

// ═══════════════════════════════════════ 4. fail-closed negative coverage

function sectionFailClosed(): void {
  startSection();
  console.log("4. fail-closed negative coverage");

  // root shape
  check(buildLoopGovernanceTailResult(null).ok === false, "null input rejected");
  check(buildLoopGovernanceTailResult([1, 2, 3]).ok === false, "array input rejected");
  check(buildLoopGovernanceTailResult("text").ok === false, "string input rejected");
  {
    const instance = new (class Fake {})();
    check(buildLoopGovernanceTailResult(instance).ok === false, "class instance rejected");
  }
  {
    const evil = clone(makeValidInput());
    Object.setPrototypeOf(evil, { extra: 1 });
    const result = buildLoopGovernanceTailResult(evil);
    check(result.ok === false, "non-plain prototype rejected");
  }
  {
    const evil = clone(makeValidInput());
    Object.setPrototypeOf(evil.identity as Record<string, unknown>, { extra: 1 });
    const result = buildLoopGovernanceTailResult(evil);
    check(result.ok === false, "nested non-plain prototype rejected");
  }

  // revoked proxy and throwing proxies — must fail closed without throwing
  {
    const { proxy, revoke } = Proxy.revocable(clone(makeValidInput()), {});
    revoke();
    let result: LoopGovernanceTailResultBuildResult;
    let threw = false;
    try {
      result = buildLoopGovernanceTailResult(proxy);
    } catch {
      threw = true;
      result = { ok: false, reason: "invalid_input", diagnostic: "proxy threw" };
    }
    check(!threw, "revoked proxy does not propagate an exception");
    check(result.ok === false && result.reason === "invalid_input", "revoked proxy fails closed with invalid_input");
  }
  {
    const proxy = new Proxy(clone(makeValidInput()), {
      getPrototypeOf(): object {
        throw new Error("SENTINEL_PROXY");
      },
    });
    let result: LoopGovernanceTailResultBuildResult;
    let threw = false;
    try {
      result = buildLoopGovernanceTailResult(proxy);
    } catch {
      threw = true;
      result = { ok: false, reason: "invalid_input", diagnostic: "proxy threw" };
    }
    check(!threw, "throwing proxy does not propagate an exception");
    check(result.ok === false && result.reason === "invalid_input", "throwing proxy fails closed");
  }

  // exact-key scan: unknown / missing / symbol / accessor
  expectBuildFailure("unknown root field", (input) => { input.extra = 1; }, "invalid_input", { diagnostic: "root has an unknown key" });
  expectBuildFailure("missing root field", (input) => { delete input.elapsed_ms; }, "invalid_input", { diagnostic: "elapsed_ms must be a safe integer" });
  expectBuildFailure("unknown nested field", (input) => { (input.docflow as Record<string, unknown>).code_review = { ...(input.docflow as Record<string, unknown>).code_review as Record<string, unknown>, extra: 1 }; }, "invalid_input", { diagnostic: "docflow.code_review has an unknown key" });
  expectBuildFailure(
    "symbol root key",
    (input) => { Object.defineProperty(input, Symbol("x"), { value: 1, enumerable: true }); },
    "invalid_input",
    { diagnostic: "root has a symbol key", effect: (input) => Object.getOwnPropertySymbols(input).length === 1 },
  );
  expectBuildFailure(
    "accessor root field",
    (input) => {
      Object.defineProperty(input, "status", { get: () => "completed", enumerable: true, configurable: true });
    },
    "invalid_input",
    { diagnostic: "root has an accessor property", effect: (input) => "get" in Object.getOwnPropertyDescriptor(input, "status")! },
  );
  expectBuildFailure(
    "proto key",
    (input) => { Object.defineProperty(input, "__proto__", { value: 1, enumerable: true, writable: true, configurable: true }); },
    "invalid_input",
    { diagnostic: "root has a __proto__ key" },
  );

  // fixed values
  expectBuildFailure("wrong schema", (input) => { input.schema = "loop-governance-tail-result-v2"; }, "invalid_input", { diagnostic: "schema must be loop-governance-tail-result-v1" });
  expectBuildFailure("wrong status", (input) => { input.status = "pending"; }, "invalid_input", { diagnostic: "status must be completed" });
  expectBuildFailure("wrong reason code", (input) => { input.reason_code = "TAIL_BLOCKED"; }, "invalid_input", { diagnostic: "reason_code must be GOVERNANCE_TAIL_COMPLETED" });

  // identity
  expectBuildFailure("invalid identity sha", (input) => { (input.identity as Record<string, unknown>).expectedBaseSha = "zz"; }, "invalid_input", { diagnostic: "identity must satisfy the canonical LoopRunIdentity contract" });
  expectBuildFailure("identity control char", (input) => { (input.identity as Record<string, unknown>).runId = "run\x00bad"; }, "invalid_input", { diagnostic: "identity.runId must not contain control characters" });

  // upstream refs
  expectBuildFailure("wrong upstream kind", (input) => { input.orchestration_result_artifact_ref = `loop-artifact:v1:code_patch:sha256:${"1".repeat(64)}`; }, "invalid_input", { diagnostic: "orchestration_result_artifact_ref must be a canonical loop-artifact:v1:orchestration_result reference" });
  expectBuildFailure("malformed upstream ref", (input) => { input.delivery_result_artifact_ref = "not-a-ref"; }, "invalid_input", { diagnostic: "delivery_result_artifact_ref must be a canonical loop-artifact:v1:delivery_result reference" });
  expectBuildFailure("uppercase digest in ref", (input) => { input.executor_input_artifact_ref = `loop-artifact:v1:executor_input:sha256:${"B".repeat(64)}`; }, "invalid_input", { diagnostic: "executor_input_artifact_ref must be a canonical loop-artifact:v1:executor_input reference" });

  // final workspace
  expectBuildFailure("workspace no changes", (input) => { (input.final_workspace as Record<string, unknown>).task_has_changes = false; }, "invalid_input", { diagnostic: "final_workspace.task_has_changes must be true" });
  expectBuildFailure("task branch mismatch", (input) => { (input.final_workspace as Record<string, unknown>).task_branch = "codex/other-branch"; }, "invalid_input", { diagnostic: "final_workspace.task_branch must equal identity.taskBranch" });
  expectBuildFailure("bad task head sha", (input) => { (input.final_workspace as Record<string, unknown>).task_head_sha = "xyz"; }, "invalid_input", { diagnostic: "final_workspace.task_head_sha must be 40 lowercase hex" });
  expectBuildFailure("relative workspace path", (input) => { (input.final_workspace as Record<string, unknown>).workspace_path = "relative/workspace"; }, "invalid_input", { diagnostic: "final_workspace.workspace_path must be an absolute path" });

  // file sets
  expectBuildFailure("unsorted files", (input) => { (input.files as string[]).reverse(); }, "invalid_input", { diagnostic: "files must be strictly sorted ascending with no duplicates" });
  expectBuildFailure("duplicate files", (input) => { (input.files as string[]).push("docs/manifest.md"); }, "invalid_input", { diagnostic: "files must be strictly sorted ascending with no duplicates" });
  expectBuildFailure("absolute path in files", (input) => { (input.files as string[])[0] = "/etc/passwd"; }, "invalid_input", { diagnostic: "files[0] must not be an absolute path" });
  expectBuildFailure("backslash path in files", (input) => { (input.files as string[])[1] = "docs\\x.md"; }, "invalid_input", { diagnostic: "files[1] must use forward slashes" });
  expectBuildFailure("dot segment in files", (input) => { (input.files as string[])[2] = "docs/../x.md"; }, "invalid_input", { diagnostic: "files[2] must not contain dot segments" });
  expectBuildFailure("git path in files", (input) => { (input.files as string[])[3] = ".git/config"; }, "invalid_input", { diagnostic: "files[3] must not live under the git directory" });
  expectBuildFailure("control char in path", (input) => { (input.files as string[])[4] = "docs/x\u0000.md"; }, "invalid_input", { diagnostic: "files[4] must not contain control characters" });
  expectBuildFailure("empty files list", (input) => { input.files = []; }, "invalid_input", { diagnostic: "files must not be empty" });
  expectBuildFailure("implementation not subset", (input) => {
    // Replace an implementation file with a valid sorted path that is not in
    // the root files set — the subset constraint fires (not the sort check).
    input.implementation_files = ["core/loop-patch-application.ts", "core/loop-requirement-design-orchestrator.ts"];
  }, "invalid_input", { diagnostic: "implementation_files must be a subset of files" });
  expectBuildFailure("unsorted implementation files", (input) => { (input.implementation_files as string[]).reverse(); }, "invalid_input", { diagnostic: "implementation_files must be strictly sorted ascending with no duplicates" });

  // docflow 03/04/05 and result enums
  expectBuildFailure("03 path outside dir", (input) => { (input.docflow as Record<string, unknown>).implementation_record = { path: "docs/sync-evidence.md", version: "v1", digest_sha256: D_IMPL }; }, "invalid_input", { diagnostic: "docflow.implementation_record.path must live under 03-实现记录" });
  expectBuildFailure("04 path outside dir", (input) => { (input.docflow as Record<string, unknown>).code_review = { path: "docs/manifest.md", version: "v1", digest_sha256: D_REVIEW, result: "PASS" }; }, "invalid_input", { diagnostic: "docflow.code_review.path must live under 04-代码审核" });
  expectBuildFailure("05 path outside dir", (input) => { (input.docflow as Record<string, unknown>).test_acceptance = { path: "docs/manifest.md", version: "v1", digest_sha256: D_ACCEPT, result: "PASS" }; }, "invalid_input", { diagnostic: "docflow.test_acceptance.path must live under 05-测试验收" });
  expectBuildFailure("code review FAIL", (input) => { (input.docflow as Record<string, unknown>).code_review = { ...(input.docflow as Record<string, unknown>).code_review as Record<string, unknown>, result: "FAIL" }; }, "invalid_input", { diagnostic: "docflow.code_review.result must be PASS or PASS_WITH_RISK" });
  expectBuildFailure("test acceptance pending", (input) => { (input.docflow as Record<string, unknown>).test_acceptance = { ...(input.docflow as Record<string, unknown>).test_acceptance as Record<string, unknown>, result: "pending" }; }, "invalid_input", { diagnostic: "docflow.test_acceptance.result must be PASS or PASS_WITH_RISK" });
  expectBuildFailure("empty version", (input) => { (input.docflow as Record<string, unknown>).code_review = { ...(input.docflow as Record<string, unknown>).code_review as Record<string, unknown>, version: "" }; }, "invalid_input", { diagnostic: "docflow.code_review.version must be a trimmed non-empty string" });
  expectBuildFailure("empty digest", (input) => { (input.docflow as Record<string, unknown>).implementation_record = { path: "03-实现记录/implementation-record.md", version: "v1", digest_sha256: "" }; }, "invalid_input", { diagnostic: "docflow.implementation_record.digest_sha256 must be 64 lowercase hex" });
  expectBuildFailure("evidence path not in files", (input) => { (input.docflow as Record<string, unknown>).implementation_record = { path: "03-实现记录/other.md", version: "v1", digest_sha256: D_IMPL }; }, "invalid_input", { diagnostic: "docflow.implementation_record.path must appear in root files" });

  // business_domain_sync matrix
  expectBuildFailure("sync required but not authorized", (input) => { (input.business_domain_sync as Record<string, unknown>).write_authorized = false; }, "invalid_input", { diagnostic: "business_domain_sync.write_authorized must be true when decision is SYNC_REQUIRED" });
  expectBuildFailure("sync required but not completed", (input) => { (input.business_domain_sync as Record<string, unknown>).execution_status = "in_progress"; }, "invalid_input", { diagnostic: "business_domain_sync.execution_status must be completed when decision is SYNC_REQUIRED" });
  expectBuildFailure("sync proposal required", (input) => { (input.business_domain_sync as Record<string, unknown>).decision = "PROPOSAL_REQUIRED"; }, "invalid_input", { diagnostic: "business_domain_sync.decision must be SYNC_REQUIRED or NOT_REQUIRED" });
  expectBuildFailure("sync blocked", (input) => { (input.business_domain_sync as Record<string, unknown>).decision = "BLOCKED"; }, "invalid_input", { diagnostic: "business_domain_sync.decision must be SYNC_REQUIRED or NOT_REQUIRED" });
  expectBuildFailure("sync not-required without basis", (input) => {
    input.business_domain_sync = { decision: "NOT_REQUIRED", write_authorized: false, execution_status: "not_required", evidence: null, basis: null };
  }, "invalid_input", { diagnostic: "business_domain_sync.basis must be a plain object" });
  expectBuildFailure("sync not-required with evidence", (input) => {
    input.business_domain_sync = {
      decision: "NOT_REQUIRED", write_authorized: false, execution_status: "not_required",
      evidence: { path: "docs/sync-evidence.md", version: "v1", digest_sha256: D_SYNC },
      basis: { scope: "s", reason: "r", evidence: "e", decision_source: "d", decision_owner: "o", version_basis: "v", stale_condition: "n" },
    };
  }, "invalid_input", { diagnostic: "business_domain_sync.evidence must be null when decision is NOT_REQUIRED" });

  // reconcile matrix
  expectBuildFailure("reconcile required but not completed", (input) => { (input.reconcile as Record<string, unknown>).execution_status = "pending"; }, "invalid_input", { diagnostic: "reconcile.execution_status must be completed when decision is required" });
  expectBuildFailure("reconcile not-required without basis", (input) => {
    input.reconcile = { decision: "not_required", execution_status: "not_required", evidence: null, basis: null };
  }, "invalid_input", { diagnostic: "reconcile.basis must be a plain object" });

  // entry coverage matrix
  expectBuildFailure("entry PENDING", (input) => { (input.entry_coverage as Record<string, unknown>).status = "PENDING"; }, "invalid_input", { diagnostic: "entry_coverage.status must be PASS or not_applicable" });
  expectBuildFailure("entry FAILED", (input) => { (input.entry_coverage as Record<string, unknown>).status = "FAILED"; }, "invalid_input", { diagnostic: "entry_coverage.status must be PASS or not_applicable" });
  expectBuildFailure("entry BLOCKED", (input) => { (input.entry_coverage as Record<string, unknown>).status = "BLOCKED"; }, "invalid_input", { diagnostic: "entry_coverage.status must be PASS or not_applicable" });
  expectBuildFailure("entry current", (input) => { (input.entry_coverage as Record<string, unknown>).status = "current"; }, "invalid_input", { diagnostic: "entry_coverage.status must be PASS or not_applicable" });
  expectBuildFailure("entry not-applicable without basis", (input) => {
    input.entry_coverage = { status: "not_applicable", evidence: null, basis: null };
  }, "invalid_input", { diagnostic: "entry_coverage.basis must be a plain object" });

  // regate matrix
  expectBuildFailure("regate failed", (input) => { (input.regate as Record<string, unknown>).status = "failed"; }, "invalid_input", { diagnostic: "regate.status must be PASS or not_required" });
  expectBuildFailure("regate stale", (input) => { (input.regate as Record<string, unknown>).status = "stale"; }, "invalid_input", { diagnostic: "regate.status must be PASS or not_required" });
  expectBuildFailure("regate not-required without basis", (input) => {
    input.regate = { status: "not_required", evidence: null, basis: null };
  }, "invalid_input", { diagnostic: "regate.basis must be a plain object" });

  // manifest
  expectBuildFailure("manifest not completed", (input) => { (input.manifest as Record<string, unknown>).tail_status = "pending"; }, "invalid_input", { diagnostic: "manifest.tail_status must be completed" });
  expectBuildFailure("manifest wrong file name", (input) => { (input.manifest as Record<string, unknown>).path = "docs/sync-evidence.md"; }, "invalid_input", { diagnostic: "manifest.path must be a file named manifest.md" });
  expectBuildFailure("manifest path not in files", (input) => { (input.manifest as Record<string, unknown>).path = "docs/other-manifest.md"; }, "invalid_input", { diagnostic: "manifest.path must appear in root files" });
  expectBuildFailure("completion evidence missing sync", (input) => {
    (input.manifest as Record<string, unknown>).completion_evidence = ((input.manifest as Record<string, unknown>).completion_evidence as Array<Record<string, unknown>>)
      .filter((entry) => entry.path !== "docs/sync-evidence.md");
  }, "invalid_input", { diagnostic: "manifest.completion_evidence must include business_domain_sync evidence" });
  expectBuildFailure("completion evidence missing review", (input) => {
    (input.manifest as Record<string, unknown>).completion_evidence = ((input.manifest as Record<string, unknown>).completion_evidence as Array<Record<string, unknown>>)
      .filter((entry) => entry.path !== "04-代码审核/code-review.md");
  }, "invalid_input", { diagnostic: "manifest.completion_evidence must include code_review" });
  expectBuildFailure("completion evidence unsorted", (input) => {
    const entries = (input.manifest as Record<string, unknown>).completion_evidence as Array<Record<string, unknown>>;
    entries.reverse();
  }, "invalid_input", { diagnostic: "manifest.completion_evidence must be sorted by path with no duplicates" });
  expectBuildFailure("completion evidence duplicate", (input) => {
    const entries = (input.manifest as Record<string, unknown>).completion_evidence as Array<Record<string, unknown>>;
    (input.manifest as Record<string, unknown>).completion_evidence = [
      ...entries,
      { path: "docs/sync-evidence.md", version: "v1", digest_sha256: D_SYNC },
    ];
  }, "invalid_input", { diagnostic: "manifest.completion_evidence must be sorted by path with no duplicates" });
  expectBuildFailure("completion evidence path outside files", (input) => {
    const entries = (input.manifest as Record<string, unknown>).completion_evidence as Array<Record<string, unknown>>;
    (input.manifest as Record<string, unknown>).completion_evidence = [
      ...entries,
      { path: "03-实现记录/extra-evidence.md", version: "v1", digest_sha256: "a".repeat(64) },
    ];
  }, "invalid_input", { diagnostic: "manifest.completion_evidence[7].path must appear in root files" });
  expectBuildFailure("completion evidence empty", (input) => { (input.manifest as Record<string, unknown>).completion_evidence = []; }, "invalid_input", { diagnostic: "manifest.completion_evidence must not be empty" });

  // tail gate
  expectBuildFailure("tail gate not persisted", (input) => { (input.tail_gate as Record<string, unknown>).persisted = false; }, "invalid_input", { diagnostic: "tail_gate.persisted must be true" });
  expectBuildFailure("tail gate read-back false", (input) => { (input.tail_gate as Record<string, unknown>).read_back_verified = false; }, "invalid_input", { diagnostic: "tail_gate.read_back_verified must be true" });
  expectBuildFailure("tail gate reviewed version mismatch", (input) => { (input.tail_gate as Record<string, unknown>).reviewed_manifest_version = "other-version"; }, "invalid_input", { diagnostic: "tail_gate.reviewed_manifest_version must equal manifest.version" });
  expectBuildFailure("tail gate result failed", (input) => { (input.tail_gate as Record<string, unknown>).result = "FAIL"; }, "invalid_input", { diagnostic: "tail_gate.result must be PASS or PASS_WITH_RISK" });
  expectBuildFailure("tail gate outside 05", (input) => { (input.tail_gate as Record<string, unknown>).path = "docs/manifest.md"; }, "invalid_input", { diagnostic: "tail_gate.path must live under 05-测试验收" });
  expectBuildFailure("manifest completion source mismatch", (input) => {
    (input.manifest as Record<string, unknown>).completion_decision_source = { path: "04-代码审核/code-review.md", version: "v1", digest_sha256: D_REVIEW };
  }, "invalid_input", { diagnostic: "manifest.completion_decision_source must exactly equal the tail gate file path/version/digest" });
  expectBuildFailure("tail gate completion source mismatch", (input) => {
    (input.tail_gate as Record<string, unknown>).completion_decision_source = { path: "03-实现记录/implementation-record.md", version: "v1", digest_sha256: D_IMPL };
  }, "invalid_input", { diagnostic: "tail_gate.completion_decision_source must exactly equal the tail gate file path/version/digest" });

  // root cross constraints
  expectBuildFailure("blocking items non-empty", (input) => { input.blocking_items = ["blocker"]; }, "invalid_input", { diagnostic: "blocking_items must be exactly []" });
  expectBuildFailure("elapsed over limit", (input) => { input.elapsed_ms = 3_600_001; }, "invalid_input", { diagnostic: "elapsed_ms must be a safe integer in 0..3600000" });
  expectBuildFailure("elapsed negative", (input) => { input.elapsed_ms = -1; }, "invalid_input", { diagnostic: "elapsed_ms must be a safe integer in 0..3600000" });
  expectBuildFailure("elapsed non-integer", (input) => { input.elapsed_ms = 12.5; }, "invalid_input", { diagnostic: "elapsed_ms must be a safe integer in 0..3600000" });
  expectBuildFailure("shared semantic path", (input) => {
    // The sync evidence adopts the manifest path. Both the evidence ref and
    // the manifest completion_evidence entry are updated consistently (kept
    // strictly sorted), so every earlier check passes and the
    // distinct-semantic-paths cross constraint fires.
    (input.business_domain_sync as Record<string, unknown>).evidence = { path: "docs/manifest.md", version: "v1", digest_sha256: D_SYNC };
    (input.manifest as Record<string, unknown>).completion_evidence = [
      { path: "03-实现记录/implementation-record.md", version: "v1", digest_sha256: D_IMPL },
      { path: "04-代码审核/code-review.md", version: "v1", digest_sha256: D_REVIEW },
      { path: "05-测试验收/test-acceptance.md", version: "v1", digest_sha256: D_ACCEPT },
      { path: "docs/entry-coverage-evidence.md", version: "v1", digest_sha256: D_ENTRY },
      { path: "docs/manifest.md", version: "v1", digest_sha256: D_SYNC },
      { path: "docs/reconcile-evidence.md", version: "v1", digest_sha256: D_RECONCILE },
      { path: "docs/regate-evidence.md", version: "v1", digest_sha256: D_REGATE },
    ];
  }, "invalid_input", { diagnostic: "distinct semantic evidences must not share a path" });

  // arrays
  expectBuildFailure(
    "sparse files array",
    (input) => { const arr = (input.files as string[]); arr.length = arr.length + 1; },
    "invalid_input",
    { diagnostic: "files must be a dense array" },
  );
  expectBuildFailure(
    "files array extra property",
    (input) => { const arr = input.files as string[] & { extra?: number }; arr.extra = 1; },
    "invalid_input",
    { diagnostic: "files must not have extra own properties", effect: (input) => "extra" in (input.files as object) },
  );

  // size bounds
  check(buildLoopGovernanceTailResult(makeValidInput(), 512).ok === false, "oversize build fails closed");
  {
    const result = buildLoopGovernanceTailResult(makeValidInput(), 512);
    check(result.ok === false && result.reason === "too_large", "oversize build reason too_large");
  }
  check(buildLoopGovernanceTailResult(makeValidInput(), 0).ok === false, "maxBytes 0 rejected");
  check(buildLoopGovernanceTailResult(makeValidInput(), 1.5).ok === false, "non-integer maxBytes rejected");
  check(buildLoopGovernanceTailResult(makeValidInput(), 2_000_000).ok === false, "maxBytes above bound rejected");

  // parser byte-level rejections
  const built = buildValid();
  check(built.ok === true, "build ok for parser negative cases");
  if (built.ok) {
    const bytes = built.bytes;
    expectParseFailure("BOM prefix", new Uint8Array([0xef, 0xbb, 0xbf, ...bytes]), "invalid_bytes", { diagnostic: "must not start with a BOM" });
    const withCr = new Uint8Array(bytes.length + 1);
    withCr.set(bytes.subarray(0, 5), 0);
    withCr[5] = 0x0d;
    withCr.set(bytes.subarray(5), 6);
    expectParseFailure("CR byte", withCr, "invalid_bytes", { diagnostic: "must not contain CR" });
    const withNul = new Uint8Array(bytes.length + 1);
    withNul.set(bytes.subarray(0, 5), 0);
    withNul[5] = 0x00;
    withNul.set(bytes.subarray(5), 6);
    expectParseFailure("NUL byte", withNul, "invalid_bytes", { diagnostic: "must not contain NUL" });
    expectParseFailure("missing trailing LF", bytes.subarray(0, bytes.length - 1), "invalid_bytes", { diagnostic: "must end with exactly one LF" });
    const doubleLf = new Uint8Array(bytes.length + 1);
    doubleLf.set(bytes, 0);
    doubleLf[bytes.length] = 0x0a;
    expectParseFailure("extra trailing LF", doubleLf, "invalid_bytes", { diagnostic: "must end with exactly one LF" });
    expectParseFailure("empty bytes", new Uint8Array(0), "invalid_bytes", { diagnostic: "must end with exactly one LF" });
    expectParseFailure("invalid UTF-8", new Uint8Array([0xff, 0x0a]), "invalid_bytes", { diagnostic: "not valid UTF-8" });
    expectParseFailure("noncanonical whitespace", new TextEncoder().encode(built.text.replace('{"schema"', '{ "schema"')), "invalid_bytes", { diagnostic: "round-trip mismatch" });
    expectParseFailure(
      "wrong property order",
      new TextEncoder().encode(built.text.replace('"status":"completed","reason_code":"GOVERNANCE_TAIL_COMPLETED"', '"reason_code":"GOVERNANCE_TAIL_COMPLETED","status":"completed"')),
      "invalid_bytes",
      { diagnostic: "round-trip mismatch" },
    );
    expectParseFailure(
      "duplicate JSON keys",
      new TextEncoder().encode(built.text.replace('"schema":"loop-governance-tail-result-v1"', '"schema":"loop-governance-tail-result-v1","schema":"loop-governance-tail-result-v1"')),
      "invalid_bytes",
      { diagnostic: "round-trip mismatch" },
    );
    expectParseFailure("noncanonical number", new TextEncoder().encode(built.text.replace('"elapsed_ms":1234', '"elapsed_ms":1234.0')), "invalid_bytes", { diagnostic: "round-trip mismatch" });
    expectParseFailure("noncanonical escaping", new TextEncoder().encode(built.text.replace('"status":"completed"', '"status":"\\u0063ompleted"')), "invalid_bytes", { diagnostic: "round-trip mismatch" });
    check(parseLoopGovernanceTailResultBytes(bytes, 512).ok === false, "oversize parse fails closed");
    {
      const result = parseLoopGovernanceTailResultBytes(bytes, 512);
      check(result.ok === false && result.reason === "too_large", "oversize parse reason too_large");
    }
    check(parseLoopGovernanceTailResultBytes("not-bytes" as unknown as Uint8Array).ok === false, "non-Uint8Array rejected");
    check(parseLoopGovernanceTailResultBytes(bytes, 0).ok === false, "parse maxBytes 0 rejected");
  }
  markIfClear("D09_A1_GOVERNANCE_TAIL_RESULT_FAIL_CLOSED");
}

// ═══════════════════════════════════════ 5. artifact store kind and D01-D08 regression

function sectionArtifactStoreKind(): { store: LoopArtifactStore; tempRoot: string } {
  startSection();
  console.log("5. artifact store new kind");
  const tempRoot = mkdtempSync(join(tmpdir(), "loop-d09a1-"));
  tempDirs.push(tempRoot);
  const repository = join(tempRoot, "repo");
  mkdirSync(repository, { recursive: true });
  const controlRoot = join(tempRoot, "control");
  const store = new LoopArtifactStore({ controlRoot, repositoryPath: repository });
  store.init();

  const content = '{"schema":"loop-governance-tail-result-v1","status":"completed"}';
  const bytes = Buffer.from(content, "utf8");
  const descriptor = store.put("governance_tail_result", content);
  check(descriptor.kind === "governance_tail_result", "new kind put kind");
  check(descriptor.artifactRef === `loop-artifact:v1:governance_tail_result:sha256:${descriptor.digest}`, "new kind canonical ref");
  check(/^loop-artifact:v1:governance_tail_result:sha256:[0-9a-f]{64}$/.test(descriptor.artifactRef), "new kind ref format");
  check(descriptor.digest === createHash("sha256").update(bytes).digest("hex"), "new kind digest exact");
  check(descriptor.sizeBytes === bytes.length, "new kind size exact");
  const readback = store.read(descriptor.artifactRef, descriptor.digest);
  check(readback.equals(bytes), "new kind exact readback");
  const again = store.put("governance_tail_result", content);
  check(again.artifactRef === descriptor.artifactRef, "new kind idempotent put");
  const finalPath = join(controlRoot, "artifacts", "v1", "governance_tail_result", descriptor.digest.slice(0, 2), `${descriptor.digest}.blob`);
  const mode = require("node:fs").lstatSync(finalPath).mode & 0o777;
  check(mode === 0o600, `new kind blob mode 0600 (got ${mode.toString(8)})`);
  let invalidKindRejected = false;
  try {
    store.put("bogus_kind" as never, "x");
  } catch {
    invalidKindRejected = true;
  }
  check(invalidKindRejected, "invalid kind still rejected");

  markIfClear("D09_A1_ARTIFACT_KIND_VERIFIED");
  return { store, tempRoot };
}

function sectionD01D08Regression(store: LoopArtifactStore): void {
  startSection();
  console.log("6. D01-D08 regression preserved");
  const originalKinds = [
    "code_patch", "test_summary", "review_summary", "delivery_result", "workspace_metadata",
    "requirement_summary", "technical_design", "solution_review", "executor_input", "orchestration_result",
  ] as const;
  check(
    LOOP_ARTIFACT_KINDS.length === 14,
    "kind list has 12 historical entries plus 2 WP-4B entries",
  );
  check(
    originalKinds.every((kind, index) => LOOP_ARTIFACT_KINDS[index] === kind),
    "original ten kinds keep their positions",
  );
  check(LOOP_ARTIFACT_KINDS[10] === "governance_tail_result", "governance_tail_result is the eleventh kind");
  check(LOOP_ARTIFACT_KINDS[11] === "delivery_checkpoint", "delivery_checkpoint retains its historical position");
  check(LOOP_ARTIFACT_KINDS[12] === "capability_output", "WP-4B capability output kind is appended");
  check(LOOP_ARTIFACT_KINDS[13] === "capability_findings", "WP-4B capability findings kind is appended");
  for (const kind of originalKinds) {
    const content = `{"kind":"${kind}"}`;
    const expectedDigest = createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
    const descriptor = store.put(kind, content);
    check(descriptor.kind === kind, `original kind ${kind} put`);
    check(descriptor.artifactRef === `loop-artifact:v1:${kind}:sha256:${expectedDigest}`, `original kind ${kind} ref`);
    const readback = store.read(descriptor.artifactRef, descriptor.digest);
    check(readback.toString("utf8") === content, `original kind ${kind} readback`);
  }
  markIfClear("D09_A1_D01_D08_REGRESSION_PRESERVED");
}

// ═══════════════════════════════════════ 8. parser untrusted bytes boundary

function sectionParserUntrustedBytes(): void {
  startSection();
  console.log("8. parser untrusted bytes fail-closed snapshot");
  const built = buildValid();
  check(built.ok === true, "canonical build ok for parser boundary section");
  if (built.ok) {
    const bytes = built.bytes;

    // genuine Uint8Array round trip still succeeds
    const roundTrip = parseLoopGovernanceTailResultBytes(bytes);
    check(roundTrip.ok === true, "genuine Uint8Array round trip succeeds");
    if (roundTrip.ok) {
      check(roundTrip.digestSha256 === built.digestSha256, "genuine round trip digest identical");
      check(roundTrip.sizeBytes === bytes.length, "genuine round trip size identical");
    }

    // Node Buffer keeps compatibility
    const bufferParse = parseLoopGovernanceTailResultBytes(Buffer.from(bytes));
    check(bufferParse.ok === true, "Node Buffer input accepted");
    if (bufferParse.ok) {
      check(bufferParse.digestSha256 === built.digestSha256, "Buffer parse digest identical");
    }

    // Proxy-wrapped valid Uint8Array: the design rejects every proxied typed
    // array — fail closed, never throw.
    expectUntrustedBytesRejection("proxy-wrapped Uint8Array", new Proxy(bytes, {}), "invalid_input");

    // revoked Proxy: no-throw, fail closed
    const revocable = Proxy.revocable(bytes, {});
    const revokedBytes = revocable.proxy;
    revocable.revoke();
    expectUntrustedBytesRejection("revoked proxy bytes", revokedBytes, "invalid_input");

    // throwing proxy traps: sentinel must never reach the diagnostic
    const trapBytes = new Proxy(bytes, {
      get(_target: object, prop: PropertyKey): unknown {
        throw new Error("SENTINEL_BYTES_TRAP");
      },
      getPrototypeOf(): object {
        throw new Error("SENTINEL_BYTES_TRAP");
      },
    });
    expectUntrustedBytesRejection("throwing proxy trap bytes", trapBytes, "invalid_input", { sentinel: "SENTINEL_BYTES_TRAP" });

    // other typed arrays / views
    expectUntrustedBytesRejection("Int8Array input", new Int8Array(bytes), "invalid_input");
    expectUntrustedBytesRejection("Uint16Array input", new Uint16Array(bytes), "invalid_input");
    expectUntrustedBytesRejection("DataView input", new DataView(bytes.buffer), "invalid_input");

    // plain objects and Symbol.toStringTag spoofs
    expectUntrustedBytesRejection("plain object input", {}, "invalid_input");
    expectUntrustedBytesRejection(
      "Symbol.toStringTag spoof input",
      { [Symbol.toStringTag]: "Uint8Array", length: bytes.length, 0: bytes[0] },
      "invalid_input",
    );

    // genuine oversized Uint8Array — trusted intrinsic length gates before copy
    const oversized = new Uint8Array(LOOP_GOVERNANCE_TAIL_RESULT_MAX_BYTES + 1);
    expectUntrustedBytesRejection("genuine oversized Uint8Array", oversized, "too_large");
    expectUntrustedBytesRejection("genuine bytes above caller maxBytes", bytes, "too_large", { maxBytes: bytes.length - 1 });
  }
  markIfClear("D09_A1_PARSER_UNTRUSTED_BYTES_FAIL_CLOSED_VERIFIED");
}

// ═══════════════════════════════════════ 9. plain array prototype enforcement

function sectionArrayPlainPrototype(): void {
  startSection();
  console.log("9. plain array prototype enforcement");

  expectBuildFailure(
    "files custom prototype",
    (input) => { Object.setPrototypeOf(input.files as object, { extra: 1 }); },
    "invalid_input",
    {
      diagnostic: "files has a non-plain array prototype",
      effect: (input) => Object.getPrototypeOf(input.files as object) !== Array.prototype,
    },
  );
  expectBuildFailure(
    "implementation_files custom prototype",
    (input) => { Object.setPrototypeOf(input.implementation_files as object, { extra: 1 }); },
    "invalid_input",
    {
      diagnostic: "implementation_files has a non-plain array prototype",
      effect: (input) => Object.getPrototypeOf(input.implementation_files as object) !== Array.prototype,
    },
  );
  expectBuildFailure(
    "manifest.completion_evidence custom prototype",
    (input) => { Object.setPrototypeOf((input.manifest as Record<string, unknown>).completion_evidence as object, { extra: 1 }); },
    "invalid_input",
    {
      diagnostic: "manifest.completion_evidence has a non-plain array prototype",
      effect: (input) => Object.getPrototypeOf((input.manifest as Record<string, unknown>).completion_evidence as object) !== Array.prototype,
    },
  );
  expectBuildFailure(
    "blocking_items empty array custom prototype",
    (input) => { Object.setPrototypeOf(input.blocking_items as object, { extra: 1 }); },
    "invalid_input",
    {
      diagnostic: "blocking_items has a non-plain array prototype",
      effect: (input) => Object.getPrototypeOf(input.blocking_items as object) !== Array.prototype,
    },
  );
  expectBuildFailure(
    "files null prototype",
    (input) => { Object.setPrototypeOf(input.files as object, null); },
    "invalid_input",
    {
      diagnostic: "files has a non-plain array prototype",
      effect: (input) => Object.getPrototypeOf(input.files as object) === null,
    },
  );

  // Array subclass — proto is the subclass prototype, not Array.prototype
  {
    const input = clone(makeValidInput());
    class ArraySubclass extends Array {}
    const sub = new ArraySubclass();
    sub.push(...(input.files as string[]));
    check(Array.isArray(sub) === true, "array subclass passes Array.isArray");
    check(Object.getPrototypeOf(sub) !== Array.prototype, "array subclass mutation actually took effect");
    input.files = sub;
    let result: LoopGovernanceTailResultBuildResult;
    let threw = false;
    try {
      result = buildLoopGovernanceTailResult(input);
    } catch {
      threw = true;
      result = { ok: false, reason: "invalid_input", diagnostic: "threw" };
    }
    check(!threw, "array subclass does not propagate an exception");
    check(result.ok === false && result.reason === "invalid_input", "array subclass rejected with invalid_input");
    if (result.ok === false) {
      check(result.diagnostic.includes("files has a non-plain array prototype"), "array subclass diagnostic bound");
    }
  }

  // getPrototypeOf trap proxy — trap genuinely fires and still fails closed
  {
    const input = clone(makeValidInput());
    const trapState: { fired: boolean } = { fired: false };
    const proxy = new Proxy(input.files as object, {
      getPrototypeOf(): object {
        trapState.fired = true;
        throw new Error("SENTINEL_PROTO_TRAP");
      },
    });
    check(trapState.fired === false, "getPrototypeOf trap not fired before build");
    input.files = proxy;
    let result: LoopGovernanceTailResultBuildResult;
    let threw = false;
    try {
      result = buildLoopGovernanceTailResult(input);
    } catch {
      threw = true;
      result = { ok: false, reason: "invalid_input", diagnostic: "threw" };
    }
    check(trapState.fired === true, "getPrototypeOf trap actually fired");
    check(!threw, "getPrototypeOf trap does not propagate an exception");
    check(result.ok === false && result.reason === "invalid_input", "getPrototypeOf trap proxy rejected");
    if (result.ok === false) {
      check(result.diagnostic.includes("files array prototype reflection failed"), "getPrototypeOf trap diagnostic bound");
      check(!result.diagnostic.includes("SENTINEL_PROTO_TRAP"), "getPrototypeOf trap sentinel not leaked");
    }
  }

  // revoked array proxy — genuinely revoked and still fails closed
  {
    const input = clone(makeValidInput());
    const { proxy, revoke } = Proxy.revocable(input.files as object, {});
    revoke();
    let revokedReflectionThrew = false;
    try {
      Array.isArray(proxy);
    } catch {
      revokedReflectionThrew = true;
    }
    check(revokedReflectionThrew, "revoked array proxy is genuinely revoked");
    input.files = proxy;
    let result: LoopGovernanceTailResultBuildResult;
    let threw = false;
    try {
      result = buildLoopGovernanceTailResult(input);
    } catch {
      threw = true;
      result = { ok: false, reason: "invalid_input", diagnostic: "threw" };
    }
    check(!threw, "revoked array proxy does not propagate an exception");
    check(result.ok === false && result.reason === "invalid_input", "revoked array proxy rejected");
    if (result.ok === false) {
      check(result.diagnostic.includes("files array reflection failed"), "revoked array proxy diagnostic bound");
    }
  }

  // existing dense/sparse and extra-property rejections remain
  expectBuildFailure(
    "sparse array still rejected",
    (input) => { (input.files as string[]).length += 1; },
    "invalid_input",
    { diagnostic: "files must be a dense array" },
  );
  expectBuildFailure(
    "extra own property still rejected",
    (input) => { (input.files as string[] & { extra?: number }).extra = 1; },
    "invalid_input",
    {
      diagnostic: "files must not have extra own properties",
      effect: (input) => "extra" in (input.files as object),
    },
  );
  markIfClear("D09_A1_ARRAY_PLAIN_PROTOTYPE_VERIFIED");
}

// ═══════════════════════════════════════ 10. bounded UTF-8 byte budget

function sectionBoundedUtf8Budget(): void {
  startSection();
  console.log("10. bounded UTF-8 byte budget");

  // 65536 ASCII bytes boundary: passes
  {
    const input = clone(makeValidInput());
    (input.identity as Record<string, unknown>).runId = "a".repeat(65_536);
    const result = buildLoopGovernanceTailResult(input);
    check(result.ok === true, "65536 ASCII bytes string passes the per-string bound");
  }
  // 65537 ASCII code units: rejected before any scan (fast reject)
  expectBuildFailure(
    "65537 ASCII code units rejected",
    (input) => { (input.identity as Record<string, unknown>).runId = "a".repeat(65_537); },
    "invalid_input",
    { diagnostic: "identity.runId exceeds the per-string byte bound" },
  );

  // exactly 65536-byte multibyte boundary: 32768 × U+00E9 (2 bytes)
  {
    const input = clone(makeValidInput());
    (input.identity as Record<string, unknown>).runId = "\u00E9".repeat(32_768);
    const result = buildLoopGovernanceTailResult(input);
    check(result.ok === true, "exactly 65536-byte multibyte string passes");
  }
  expectBuildFailure(
    "multibyte string over per-string bound",
    (input) => { (input.identity as Record<string, unknown>).runId = "\u00E9".repeat(32_769); },
    "invalid_input",
    { diagnostic: "identity.runId exceeds the per-string byte bound" },
  );

  // valid surrogate pair counts 4 bytes and skips the low surrogate
  {
    const input = clone(makeValidInput());
    (input.identity as Record<string, unknown>).runId = "\uD83D\uDE00".repeat(16_384);
    const result = buildLoopGovernanceTailResult(input);
    check(result.ok === true, "valid surrogate pairs at the 65536-byte boundary pass");
  }
  expectBuildFailure(
    "surrogate pairs over per-string bound",
    (input) => { (input.identity as Record<string, unknown>).runId = "\uD83D\uDE00".repeat(16_385); },
    "invalid_input",
    { diagnostic: "identity.runId exceeds the per-string byte bound" },
  );

  // lone surrogates follow TextEncoder replacement semantics: 3 bytes each
  {
    const input = clone(makeValidInput());
    (input.identity as Record<string, unknown>).runId = "\uD83D".repeat(21_845);
    const result = buildLoopGovernanceTailResult(input);
    check(result.ok === true, "lone high surrogates at 65535-byte boundary pass");
  }
  expectBuildFailure(
    "lone high surrogates over per-string bound",
    (input) => { (input.identity as Record<string, unknown>).runId = "\uD83D".repeat(21_846); },
    "invalid_input",
    { diagnostic: "identity.runId exceeds the per-string byte bound" },
  );
  {
    const input = clone(makeValidInput());
    (input.identity as Record<string, unknown>).runId = "\uDE00".repeat(21_845);
    const result = buildLoopGovernanceTailResult(input);
    check(result.ok === true, "lone low surrogates at 65535-byte boundary pass");
  }
  expectBuildFailure(
    "lone low surrogates over per-string bound",
    (input) => { (input.identity as Record<string, unknown>).runId = "\uDE00".repeat(21_846); },
    "invalid_input",
    { diagnostic: "identity.runId exceeds the per-string byte bound" },
  );

  // control characters keep being rejected (C0, DEL, C1)
  expectBuildFailure(
    "C0 control still rejected",
    (input) => { (input.identity as Record<string, unknown>).runId = "run\u0001bad"; },
    "invalid_input",
    { diagnostic: "identity.runId must not contain control characters" },
  );
  expectBuildFailure(
    "DEL still rejected",
    (input) => { (input.identity as Record<string, unknown>).runId = "run\u007Fbad"; },
    "invalid_input",
    { diagnostic: "identity.runId must not contain control characters" },
  );
  expectBuildFailure(
    "C1 control still rejected",
    (input) => { (input.identity as Record<string, unknown>).runId = "run\u0085bad"; },
    "invalid_input",
    { diagnostic: "identity.runId must not contain control characters" },
  );

  // aggregate budget overflow: too_large with the exact diagnostic
  {
    const result = buildLoopGovernanceTailResult(makeValidInput(), 512);
    check(result.ok === false, "aggregate budget overflow fails closed");
    if (result.ok === false) {
      check(result.reason === "too_large", "aggregate overflow reason too_large");
      check(result.diagnostic.includes("artifact exceeds maxBytes"), "aggregate overflow diagnostic bound");
    }
  }

  // ── TextEncoder sentinel: budget rejection must happen before any full
  //    encode. A throwing TextEncoder would surface as an unexpected failure
  //    if the budget path still called it; the specific reasons below prove
  //    the bounded counter rejected the input first.
  const originalTextEncoder = globalThis.TextEncoder;
  let encoderRestored = false;
  try {
    globalThis.TextEncoder = class {
      encode(): Uint8Array {
        throw new Error("SENTINEL_ENCODER");
      }
    } as unknown as typeof TextEncoder;
    {
      // necessarily over the per-string bound: 70000 ASCII code units
      const input = clone(makeValidInput());
      (input.identity as Record<string, unknown>).runId = "a".repeat(70_000);
      let result: LoopGovernanceTailResultBuildResult;
      let threw = false;
      try {
        result = buildLoopGovernanceTailResult(input);
      } catch {
        threw = true;
        result = { ok: false, reason: "invalid_input", diagnostic: "threw" };
      }
      check(!threw, "per-string overflow with sentinel encoder does not throw");
      check(result.ok === false && result.reason === "invalid_input", "per-string overflow rejected before any full encode");
      if (result.ok === false) {
        check(result.diagnostic.includes("exceeds the per-string byte bound"), "per-string overflow diagnostic specific");
        check(!result.diagnostic.includes("SENTINEL_ENCODER"), "per-string overflow does not leak sentinel");
      }
    }
    {
      // single strings valid per-string, aggregate budget exceeded
      let result: LoopGovernanceTailResultBuildResult;
      let threw = false;
      try {
        result = buildLoopGovernanceTailResult(makeValidInput(), 512);
      } catch {
        threw = true;
        result = { ok: false, reason: "invalid_input", diagnostic: "threw" };
      }
      check(!threw, "aggregate overflow with sentinel encoder does not throw");
      check(result.ok === false && result.reason === "too_large", "aggregate overflow rejected before any full encode");
      if (result.ok === false) {
        check(result.diagnostic.includes("artifact exceeds maxBytes"), "aggregate overflow diagnostic bound");
        check(!result.diagnostic.includes("SENTINEL_ENCODER"), "aggregate overflow does not leak sentinel");
      }
    }
  } finally {
    globalThis.TextEncoder = originalTextEncoder;
    encoderRestored = true;
  }
  check(encoderRestored, "TextEncoder restored unconditionally in finally");

  // after restoration the normal builder still uses the real TextEncoder
  {
    const result = buildLoopGovernanceTailResult(makeValidInput());
    check(result.ok === true, "normal build succeeds after TextEncoder restoration");
  }
  markIfClear("D09_A1_BOUNDED_UTF8_BUDGET_VERIFIED");
}

// ═══════════════════════════════════════ main

function main(): void {
  console.log("D09-A1 Governance Tail Result Contract Tests\n");

  sectionSchema();
  sectionCanonicalBytes();
  sectionConditionalMatrix();
  sectionFailClosed();
  const { store, tempRoot } = sectionArtifactStoreKind();
  sectionD01D08Regression(store);
  store.close();
  sectionParserUntrustedBytes();
  sectionArrayPlainPrototype();
  sectionBoundedUtf8Budget();

  // ── 7. cleanup (including cleanup-failure handling) ──
  startSection();
  console.log("7. temp cleanup");
  const fakeDir = join(tempRoot, "fake-cleanup-dir");
  mkdirSync(fakeDir, { recursive: true });
  const fsMod = require("node:fs") as typeof import("node:fs");
  const origRmSync = fsMod.rmSync;
  let cleanupFailureReported = false;
  try {
    fsMod.rmSync = function (path: string): void {
      if (String(path).includes("fake-cleanup-dir")) {
        const error = new Error("SENT_CLEANUP") as NodeJS.ErrnoException;
        error.code = "EACCES";
        throw error;
      }
      return origRmSync.call(fsMod, path);
    } as typeof fsMod.rmSync;
    const ok = performCleanup([fakeDir]);
    cleanupFailureReported = !ok;
  } finally {
    fsMod.rmSync = origRmSync;
  }
  check(cleanupFailureReported, "cleanup failure is reported as failure");
  check(existsSync(fakeDir), "cleanup-failure sentinel dir remains (not silently ignored)");
  const cleaned = performCleanup(tempDirs);
  check(cleaned === true, "all registered temp dirs removed");
  check(!existsSync(tempRoot), "artifact store temp root removed");
  check(!existsSync(fakeDir), "sentinel dir removed with temp root");
  markIfClear("D09_A1_TEMP_CLEANUP_COMPLETE");

  // ── summary ──
  console.log(`\nD09_A1_GOVERNANCE_TAIL_RESULT_SUMMARY passed=${passed} failed=${failed}`);
  for (const [marker, value] of Object.entries(MARKERS)) {
    console.log(`${marker} ${value}`);
  }
  if (failed > 0) {
    console.error(`FAIL: ${failed} assertion(s) failed`);
    process.exit(1);
  }
  for (const [marker, value] of Object.entries(MARKERS)) {
    if (!value) {
      console.error(`FAIL: marker ${marker} is false`);
      process.exit(1);
    }
  }
  process.exit(0);
}

main();
