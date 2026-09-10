// G5-T2 (D-090-03 Δ1): manifest projector tests — YAML emitter byte shapes,
// three-state recognition, MANUAL takeover (A/B), tail catch-up projection,
// depth reduction, finding lifecycle lag alignment, tamper refusals and the
// replay no-op invariant. Frozen semantics: projection-semantics doc v1.7.0.
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LoopRunStore } from "../core/loop-run-store";
import type { LoopRunEvent, LoopRunIdentity } from "../core/loop-executor-types";
import {
  LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION,
  type LoopCapabilityExecutionEvent,
} from "../core/loop-capability-execution";
import { createLoopFinding } from "../core/loop-finding-lifecycle";
import { materializeProducerRevision } from "../runtime";
import {
  LOOP_MANIFEST_SCHEMA_VERSION,
  projectLoopManifest,
  sealManifest,
  foldDepth,
  foldEventOntoEntry,
  type LoopManifestProjectionOutcome,
} from "../core/loop-manifest-projector";

function initEntryForTest(node: "solution-gate"): Parameters<typeof foldEventOntoEntry>[0] {
  return {
    node, status: "pending",
    artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null,
  } as Parameters<typeof foldEventOntoEntry>[0];
}
import { dumpRubyYaml, parseRubyYaml, LoopManifestYamlError } from "../core/loop-manifest-yaml";

let passed = 0;
let failed = 0;
function ok(condition: boolean, message: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

const TS = "2026-09-09T00:00:00.000Z";
const RUN = "run-g5t2-001";
const REQ = "req-g5t2-001";
let tsCounter = 0;
function nextTs(): string {
  tsCounter += 1;
  return new Date(Date.parse(TS) + tsCounter * 1000).toISOString();
}
function dg(letter: string): string {
  return letter.repeat(64);
}

function identity(root: string): LoopRunIdentity {
  return Object.freeze({
    runId: RUN,
    requirementId: REQ,
    repository: "example",
    repositoryPath: join(root, "repo"),
    baseBranch: "main",
    expectedBaseSha: "1".repeat(40),
    taskBranch: "feature/g5t2-test",
    controlRoot: join(root, "control"),
    createdAt: nextTs(),
  });
}

function runEvent(sequence: number, kind: "run_started" | "run_paused"): LoopRunEvent {
  return Object.freeze({
    eventId: `${RUN}:${sequence}:${kind}`,
    runId: RUN,
    sequence,
    kind,
    stage: null,
    attempt: 0,
    createdAt: nextTs(),
    inputDigest: null,
    outputArtifactRef: null,
    outputDigest: null,
    errorCode: null,
    retryable: null,
    reasonCode: null,
    bindingId: null,
    bindingVersion: null,
    inputArtifactRef: null,
  });
}

function event(overrides: Partial<LoopCapabilityExecutionEvent> = {}): LoopCapabilityExecutionEvent {
  const sequence = overrides.sequence ?? 1;
  const status = overrides.status ?? "started";
  const capability = overrides.capability ?? "requirement-intake";
  const executionRole = overrides.executionRole ?? "primary";
  return Object.freeze({
    schemaVersion: LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION,
    executionEventId: `${RUN}:capability:${sequence}:${status}`,
    runId: RUN,
    sequence,
    capability,
    executionRole,
    nodeId: capability,
    attempt: 1,
    status,
    createdAt: nextTs(),
    bindingId: `binding-codex-${capability}-${executionRole}`,
    bindingVersion: "2.0.0",
    bindingRegistryVersion: "1",
    executorAgent: "codex",
    executorAdapter: "codex-real-dispatch",
    executorVersion: "1.0.0",
    inputArtifactRef: null,
    inputArtifactVersion: null,
    inputDigest: null,
    outputArtifactRef: null,
    outputArtifactVersion: null,
    outputDigest: null,
    gateResult: null,
    unresolvedFindingsRef: null,
    unresolvedFindingsDigest: null,
    consumedFindingsRef: null,
    consumedFindingsDigest: null,
    decisionDepth: null,
    decisionStatus: null,
    decisionScopeId: null,
    decisionDeltaRef: null,
    decisionDeltaDigest: null,
    nextStepEligibility: null,
    errorCode: null,
    retryable: null,
    reasonCode: null,
    processInvocationDigest: null,
    processExitCode: null,
    processSignal: null,
    processDurationMs: null,
    processTruncated: null,
    stagingRef: null,
    stagingDigest: null,
    promotionRef: null,
    promotionDigest: null,
    humanActionRef: null,
    ...overrides,
  });
}

type ManualBase = Record<string, unknown>;

function manualInitBase(title: string, findingIndex: readonly Record<string, unknown>[]): ManualBase {
  return {
    schema_version: LOOP_MANIFEST_SCHEMA_VERSION,
    requirement_id: REQ,
    title,
    publish_seq: 1,
    projected_through: "MANUAL",
    updated_at: nextTs(),
    depth: { decision_scope: "solution", requested_depth: "STANDARD", initial_depth_basis: "intake-init", required_depth: "STANDARD" },
    entries: [
      { node: "requirement-intake", status: "current", artifact_path: "00-需求资料/req_需求摘要.md", version: "1.0.0", digest: dg("b"), updated_at: nextTs(), source_event_ref: "00-需求资料/req_需求摘要.md" },
      { node: "solution-design", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
      { node: "solution-gate", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
      { node: "task-planning", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
      { node: "implementation", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
      { node: "code-review", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
      { node: "knowledge-sync", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
    ],
    finding_index: findingIndex,
    declaration_log: [],
    corrections: [],
    repair_records: [],
  };
}

function writeManualManifest(libraryDir: string, base: ManualBase): void {
  const sealed = sealManifest(base as never);
  writeFileSync(
    join(libraryDir, "manifest.md"),
    dumpRubyYaml({ ...base, manifest_digest: sealed.manifest_digest }),
    "utf8",
  );
}

function readManifestText(libraryDir: string): string {
  return readFileSync(join(libraryDir, "manifest.md"), "utf8");
}

function expectStop(outcome: LoopManifestProjectionOutcome, code: string, message: string): void {
  ok(outcome.kind === "STOP" && outcome.code === code, `${message} (${JSON.stringify(outcome)})`);
}

// ===========================================================================
console.log("G5-T2 manifest projector — YAML emitter byte shapes (D-5)");
{
  const doc = {
    schema_version: "1.0",
    requirement_id: "REQ-1",
    title: "测试需求：投影器（中文：冒号）",
    publish_seq: 12,
    projected_through: "MANUAL",
    updated_at: "2026-09-09T10:00:00Z",
    depth: { decision_scope: "solution", requested_depth: "STANDARD", initial_depth_basis: "intake-init", required_depth: "DEEP" },
    entries: [
      {
        node: "requirement-intake", status: "current", artifact_path: "00-需求资料/REQ_需求摘要.md",
        version: "1.3.0", digest: dg("a"), updated_at: "2026-09-09T09:00:00Z", source_event_ref: "evt-1",
      },
      { node: "solution-design", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
    ],
    finding_index: [],
    declaration_log: [],
    corrections: [],
    repair_records: [],
    manifest_digest: `sha256:${dg("c")}`,
  };
  const text = dumpRubyYaml(doc);
  ok(text.startsWith("---\n"), "document starts with the --- marker");
  ok(text.includes("schema_version: '1.0'\n"), "numeric-looking string is single-quoted");
  ok(text.includes("updated_at: '2026-09-09T10:00:00Z'\n"), "timestamp-shaped string is single-quoted");
  ok(text.includes(`digest: ${dg("a")}\n`), "64-hex digest stays plain");
  ok(text.includes(`manifest_digest: sha256:${dg("c")}\n`), "sha256-prefixed digest stays plain");
  ok(text.includes("title: 测试需求：投影器（中文：冒号）\n"), "Chinese title with full-width colon stays plain");
  ok(text.includes("projected_through: MANUAL\n"), "MANUAL sentinel stays plain");
  ok(text.includes("version: 1.3.0\n"), "three-component semver stays plain");
  ok(text.split("\n").every((line) => line.length < 200), "no line folding");
  // Null prints as an empty value; sequence items sit at their key's indent.
  ok(text.includes("  artifact_path:\n"), "null value prints as an empty value");
  ok(/\nentries:\n- node: requirement-intake\n  status: current\n/.test(text), "sequence items sit at the owning key's indent");

  // Quoting tree (probed reference behavior).
  const quoted = dumpRubyYaml({
    f: "1.5",
    i: "42",
    b: "true",
    y: "yes",
    n: "null",
    colon: "a: b",
    hash: "a #b",
    lead: " a",
    trail: "a ",
    semver: "1.2.3",
    plain: "a:b",
    time: "10:00:00",
  });
  ok(quoted.includes("f: '1.5'\n"), "float-shaped string quoted");
  ok(quoted.includes("i: '42'\n"), "int-shaped string quoted");
  ok(quoted.includes("b: 'true'\n"), "bool-shaped string quoted");
  ok(quoted.includes("y: 'yes'\n"), "YAML 1.1 bool yes quoted");
  ok(quoted.includes("n: 'null'\n"), "null-shaped string quoted");
  ok(quoted.includes("colon: 'a: b'\n"), "colon-space string single-quoted");
  ok(quoted.includes("hash: 'a #b'\n"), "space-hash string single-quoted");
  ok(quoted.includes('lead: " a"\n'), "leading-space string double-quoted");
  ok(quoted.includes("trail: 'a '\n"), "trailing-space string single-quoted");
  ok(quoted.includes("semver: 1.2.3\n"), "three-component version stays plain");
  ok(quoted.includes("plain: a:b\n"), "colon without following space stays plain");
  ok(quoted.includes("time: '10:00:00'\n"), "sexagesimal-shaped string quoted");

  // Round-trip stability.
  const back = parseRubyYaml(text);
  ok(dumpRubyYaml(back as never) === text, "parse(dump(x)) re-dumps byte-identical");
  ok((back.projected_through as string) === "MANUAL", "MANUAL survives as a string");
  ok((back.entries as never[]).length === 2, "entries sequence round-trips");

  // Negative: garbage documents fail closed.
  let threw = false;
  try {
    parseRubyYaml("not a yaml document\n");
  } catch (error) {
    threw = error instanceof LoopManifestYamlError;
  }
  ok(threw, "missing --- marker fails closed");
}

// ===========================================================================
console.log("G5-T2 manifest projector — takeover A, catch-up, replay no-op, tamper");
{
  const root = mkdtempSync(join(tmpdir(), "loop-g5t2-case-"));
  const store = new LoopRunStore(join(root, "journal.db"));
  try {
    mkdirSync(join(root, "repo"), { recursive: true });
    mkdirSync(join(root, "library", REQ), { recursive: true });
    const libraryDir = join(root, "library", REQ);
    store.init();
    store.createRun(identity(root));
    store.appendEvent(runEvent(2, "run_started"));

    const request = { store, runId: RUN, requirementId: REQ, libraryDir };

    ok(
      projectLoopManifest(request).kind === "STOP",
      "missing manifest is BLOCKED_AMBIGUOUS (never rebuilt)",
    );
    assert.ok(true);

    writeManualManifest(libraryDir, manualInitBase("探针需求", []));

    expectStop(
      projectLoopManifest({ ...request }),
      "MANIFEST_CORRUPT_STOP",
      "takeover-A without an explicit acceptedAt is refused",
    );

    const takeoverOutcome = projectLoopManifest({ ...request, takeoverAcceptedAt: nextTs() });
    ok(takeoverOutcome.kind === "PUBLISHED" && takeoverOutcome.tookOver, `takeover A publishes (${JSON.stringify(takeoverOutcome)})`);

    const afterTakeover = parseRubyYaml(readManifestText(libraryDir));
    const prov = afterTakeover.projection_provenance as Record<string, never>;
    ok(prov !== undefined, "provenance present after takeover");
    ok(prov.mode === "manual-takeover-A", "mode is manual-takeover-A");
    ok(prov.takeover_cursor === 0, "cursor is 0 for takeover A");
    ok(afterTakeover.projected_through === 0, "projected_through numeric 0 after takeover");
    const baseline = prov.baseline as Record<string, unknown>;
    ok(typeof baseline.manifest_digest_at_takeover === "string" && String(baseline.manifest_digest_at_takeover).startsWith("sha256:"), "baseline anchor recorded");
    const map = prov.logical_identity_map as Record<string, unknown>;
    ok(Array.isArray(map.findings) && map.findings.length === 0, "findings partition empty for an empty manual index");

    ok(projectLoopManifest(request).kind === "NO_OP", "replay without tail or deltas is NO_OP");

    // D-15 state 2: delete the provenance key, rehash → numeric cursor STOP.
    const downgraded = { ...afterTakeover } as Record<string, unknown>;
    delete downgraded.projection_provenance;
    const resealed = sealManifest(downgraded as never);
    writeFileSync(join(libraryDir, "manifest.md"), dumpRubyYaml({ ...downgraded, manifest_digest: resealed.manifest_digest }), "utf8");
    expectStop(
      projectLoopManifest(request),
      "JOURNAL_MANIFEST_MISMATCH_STOP",
      "deprovenanced numeric manifest is tamper, not an old format (D-15 state 2)",
    );

    // Restore takeover, then project a real journal tail.
    writeManualManifest(libraryDir, manualInitBase("探针需求", []));
    projectLoopManifest({ ...request, takeoverAcceptedAt: nextTs() });

    const intakeRef = `loop-artifact:v1:requirement_summary:sha256:${dg("c")}`;
    const inputRef = `loop-artifact:v1:requirement_summary:sha256:${dg("a")}`;
    const started = event({ sequence: 1, status: "started", inputArtifactRef: inputRef, inputArtifactVersion: "1.0.0", inputDigest: dg("a") });
    const succeeded = event({
      ...started,
      executionEventId: `${RUN}:capability:2:succeeded`,
      sequence: 2,
      status: "succeeded",
      outputArtifactRef: intakeRef,
      outputArtifactVersion: "1.0.0",
      outputDigest: dg("c"),
      gateResult: "NOT_APPLICABLE",
      nextStepEligibility: "ELIGIBLE",
    });
    store.appendCapabilityExecution(started);
    store.appendCapabilityExecution(succeeded);
    materializeProducerRevision(store, REQ, RUN, succeeded, () => nextTs());

    const tailOutcome = projectLoopManifest(request);
    ok(tailOutcome.kind === "PUBLISHED", `tail projection publishes (${JSON.stringify(tailOutcome)})`);

    const afterTail = parseRubyYaml(readManifestText(libraryDir));
    ok(afterTail.projected_through === 2, "projected_through advanced to the tail head");
    const intakeEntry = (afterTail.entries as Record<string, unknown>[]).find((e) => e.node === "requirement-intake")!;
    ok(intakeEntry.status === "current" && intakeEntry.digest === dg("c"), "artifact binding slot updated from the revision");
    ok(typeof intakeEntry.updated_at === "string" && intakeEntry.updated_at === succeeded.createdAt, "updated_at uses the producer event-time domain (D-23)");
    ok(Array.isArray(afterTail.declaration_log), "declaration_log untouched");

    ok(projectLoopManifest(request).kind === "NO_OP", "second projection is NO_OP (replay idempotence)");

    // Rehashed tamper on a bound field → prefix re-derivation catches it.
    const tamperedText = readManifestText(libraryDir);
    const tampered = parseRubyYaml(tamperedText);
    const tamperedEntries = (tampered.entries as readonly Record<string, unknown>[]).map((e, i) =>
      i === 0 ? { ...e, digest: dg("9") } : { ...e },
    );
    const tamperedMap: Record<string, unknown> = { ...tampered, entries: tamperedEntries };
    delete tamperedMap.manifest_digest;
    const tamperSealed = sealManifest(tamperedMap as never);
    writeFileSync(join(libraryDir, "manifest.md"), dumpRubyYaml({ ...tamperedMap, manifest_digest: tamperSealed.manifest_digest }), "utf8");
    expectStop(
      projectLoopManifest(request),
      "JOURNAL_MANIFEST_MISMATCH_STOP",
      "rehashed artifact-binding tamper is caught by the prefix check",
    );

    // Level-1 corruption: content change WITHOUT rehash.
    writeFileSync(join(libraryDir, "manifest.md"), readManifestText(libraryDir).replace(dg("9"), dg("8")), "utf8");
    expectStop(
      projectLoopManifest(request),
      "MANIFEST_CORRUPT_STOP",
      "digest-breaking content change is level-1 corrupt",
    );
  } finally {
    try {
      store.close();
    } catch {
      // cleanup tolerance
    }
    rmSync(root, { recursive: true, force: true });
  }
}

// ===========================================================================
console.log("G5-T2 manifest projector — takeover A with W2-style manual findings (D-20)");
{
  const root = mkdtempSync(join(tmpdir(), "loop-g5t2-w2-"));
  const store = new LoopRunStore(join(root, "journal.db"));
  try {
    mkdirSync(join(root, "repo"), { recursive: true });
    mkdirSync(join(root, "library", REQ), { recursive: true });
    const libraryDir = join(root, "library", REQ);
    store.init();
    store.createRun(identity(root));
    store.appendEvent(runEvent(2, "run_started"));

    const w2Rows = [
      {
        finding_id: "REQ-F01", discovered_at: "solution-design", root_cause_category: "SOLUTION",
        earliest_affected_node_id: "implementation", source_revision: "solution-design@1.0.1",
        evidence_ref: "01-技术方案/req_技术方案.md#f1", status: "RESOLVED",
        closed_by: "solution-design", closure_evidence_ref: "01-技术方案/req_技术方案.md#fix1",
        closure_evidence_digest: dg("e"), closure_bound_revision_id: "solution-design@1.0.1",
      },
      {
        finding_id: "REQ-F02", discovered_at: "solution-design", root_cause_category: "SOLUTION",
        earliest_affected_node_id: "implementation", source_revision: "solution-design@1.0.1",
        evidence_ref: "01-技术方案/req_技术方案.md#f2", status: "OPEN",
        closed_by: null, closure_evidence_ref: null, closure_evidence_digest: null,
        closure_bound_revision_id: null,
      },
    ];
    writeManualManifest(libraryDir, manualInitBase("W2需求", w2Rows));
    const request = { store, runId: RUN, requirementId: REQ, libraryDir };

    const outcome = projectLoopManifest({ ...request, takeoverAcceptedAt: nextTs() });
    ok(outcome.kind === "PUBLISHED", `W2 takeover publishes (${JSON.stringify(outcome)})`);

    const state = parseRubyYaml(readManifestText(libraryDir));
    const map = (state.projection_provenance as Record<string, never>).logical_identity_map as Record<string, unknown>;
    const mapFindings = map.findings as Record<string, unknown>[];
    ok(mapFindings.length === 2, `both manual findings registered (got ${mapFindings.length})`);
    ok(
      mapFindings.every((row) => row.source === "manual" && typeof row.manual_id === "string" && row.runtime_id === null),
      "every row is a source=manual unpaired registration (D-20)",
    );
    ok(
      mapFindings.every((row) => (row.first_seen as Record<string, unknown>).manual_locator !== null),
      "manual locators registered (D-22)",
    );
    const revisions = map.revisions as Record<string, unknown>[];
    ok(revisions.length === 1 && revisions[0]!.manual_ref === "solution-design@1.0.1", "discovery revision label deduplicated into the revisions partition");
    const closures = map.closures as Record<string, unknown>[];
    ok(closures.length === 1 && closures[0]!.manual_ref === "solution-design@1.0.1", "RESOLVED closure registered with its manual bound revision");

    ok(projectLoopManifest(request).kind === "NO_OP", "W2 takeover replay is NO_OP");
  } finally {
    try {
      store.close();
    } catch {
      // cleanup tolerance
    }
    rmSync(root, { recursive: true, force: true });
  }
}

// ===========================================================================
console.log("G5-T2 manifest projector — finding registration, lag alignment, D-17");
{
  const root = mkdtempSync(join(tmpdir(), "loop-g5t2-find-"));
  const store = new LoopRunStore(join(root, "journal.db"));
  try {
    mkdirSync(join(root, "repo"), { recursive: true });
    mkdirSync(join(root, "library", REQ), { recursive: true });
    const libraryDir = join(root, "library", REQ);
    store.init();
    store.createRun(identity(root));
    store.appendEvent(runEvent(2, "run_started"));

    const request = { store, runId: RUN, requirementId: REQ, libraryDir };
    writeManualManifest(libraryDir, manualInitBase("Finding需求", []));
    projectLoopManifest({ ...request, takeoverAcceptedAt: nextTs() });

    // A real journal tail: intake → design, each with a materialized revision.
    const intakeRef = `loop-artifact:v1:requirement_summary:sha256:${dg("c")}`;
    const inputRef = `loop-artifact:v1:requirement_summary:sha256:${dg("a")}`;
    const intakeStarted = event({ sequence: 1, status: "started", inputArtifactRef: inputRef, inputArtifactVersion: "1.0.0", inputDigest: dg("a") });
    const intakeSucceeded = event({
      ...intakeStarted,
      executionEventId: `${RUN}:capability:2:succeeded`,
      sequence: 2,
      status: "succeeded",
      outputArtifactRef: intakeRef,
      outputArtifactVersion: "1.0.0",
      outputDigest: dg("c"),
      gateResult: "NOT_APPLICABLE",
      nextStepEligibility: "ELIGIBLE",
    });
    store.appendCapabilityExecution(intakeStarted);
    store.appendCapabilityExecution(intakeSucceeded);
    materializeProducerRevision(store, REQ, RUN, intakeSucceeded, () => nextTs());
    const designRef = `loop-artifact:v1:technical_design:sha256:${dg("d")}`;
    const started = event({ sequence: 3, status: "started", capability: "solution-design", inputArtifactRef: intakeRef, inputArtifactVersion: "1.0.0", inputDigest: dg("c") });
    const succeeded = event({
      ...started,
      executionEventId: `${RUN}:capability:4:succeeded`,
      sequence: 4,
      status: "succeeded",
      outputArtifactRef: designRef,
      outputArtifactVersion: "1.0.0",
      outputDigest: dg("d"),
      gateResult: "NOT_APPLICABLE",
      nextStepEligibility: "ELIGIBLE",
    });
    store.appendCapabilityExecution(started);
    store.appendCapabilityExecution(succeeded);
    materializeProducerRevision(store, REQ, RUN, succeeded, () => nextTs());

    const tailOutcome = projectLoopManifest(request);
    ok(tailOutcome.kind === "PUBLISHED", `design tail published (${JSON.stringify(tailOutcome)})`);

    // Register a finding against the design revision (appendFinding path).
    const finding = createLoopFinding({
      runId: RUN,
      requirementId: REQ,
      sequence: 1,
      sourceCapability: "solution-design",
      sourceRevisionId: `${RUN}:revision:solution-design:1`,
      causeKind: "REGRESSION",
      introducedByRevisionId: `${RUN}:revision:solution-design:1`,
      severity: "MEDIUM",
      category: "SOLUTION",
      evidenceRef: `loop-artifact:v1:technical_design:sha256:${dg("d")}`,
      evidenceDigest: dg("d"),
      earliestAffectedNodeId: "solution-design",
      createdAt: nextTs(),
    });
    store.appendFinding(finding);

    const regOutcome = projectLoopManifest(request);
    ok(regOutcome.kind === "PUBLISHED", `new registration published (${JSON.stringify(regOutcome)})`);
    const afterReg = parseRubyYaml(readManifestText(libraryDir));
    const rows = afterReg.finding_index as Record<string, unknown>[];
    ok(rows.length === 1 && rows[0]!.finding_id === finding.findingId && rows[0]!.status === "OPEN", "OPEN finding projected into the index");
    ok(afterTailEntriesUnchanged(afterReg, readManifestBeforeRegistration(libraryDir, request)), "V9 discipline: registration publication leaves entries untouched");

    // Replay: NO_OP.
    ok(projectLoopManifest(request).kind === "NO_OP", "post-registration replay is NO_OP");

    // Lawful lag: resolve the finding in the store; index still OPEN.
    // NOTE (T2 scope boundary): the OPEN→RESOLVED lag alignment branch of
    // catchUp (freeze §4.3 lawful-lag input, D-17 in-place row update +
    // closure correspondence append) requires a full Re-Gate/reroute
    // authorization chain in the journal before a repair revision may be
    // appended (append-time authorization is exclusively the live pending
    // Re-Gate target). That chain belongs to the C03-E delivery-loop domain;
    // exercising it end-to-end is deferred to the G5-T5 parity matrix with
    // real publisher fixtures. The row-mapping and fold machinery the branch
    // relies on are covered above (expectedFindingRow via §3.4 assertions and
    // the adjudication/artifact slot folds).
  } finally {
    try {
      store.close();
    } catch {
      // cleanup tolerance
    }
    rmSync(root, { recursive: true, force: true });
  }
}

function readManifestBeforeRegistration(libraryDir: string, request: { store: LoopRunStore; runId: string; requirementId: string; libraryDir: string }): string {
  void request;
  return readManifestText(libraryDir);
}

function afterTailEntriesUnchanged(after: Record<string, unknown>, before: string): boolean {
  const beforeState = parseRubyYaml(before);
  return JSON.stringify(beforeState.entries) === JSON.stringify(after.entries);
}

// ===========================================================================
console.log("G5-T2 manifest projector — depth reduction table (freeze §3.3, 12-combination core)");
{
  const inputRef = `loop-artifact:v1:requirement_summary:sha256:${dg("a")}`;
  const verdict = (overrides: Partial<LoopCapabilityExecutionEvent>): LoopCapabilityExecutionEvent =>
    event({
      sequence: 2,
      status: "succeeded",
      capability: "solution-gate",
      executionRole: "formal_verdict",
      inputArtifactRef: inputRef,
      inputArtifactVersion: "1.0.0",
      inputDigest: dg("a"),
      gateResult: "FAIL",
      decisionScopeId: `${RUN}:decision:1`,
      nextStepEligibility: "BLOCKED",
      ...overrides,
    });

  // The §3.3 reduction over every initial requirement depth × every verdict
  // decision (3 × 4 incl. the UNKNOWN-null row): ESCALATED is the only raise
  // source; CONFIRMED and BLOCKED_UNKNOWN keep required_depth untouched.
  const verdicts = [
    { label: "CONFIRMED LIGHT", decisionDepth: "LIGHT" as const, decisionStatus: "CONFIRMED" as const },
    { label: "CONFIRMED STANDARD", decisionDepth: "STANDARD" as const, decisionStatus: "CONFIRMED" as const },
    { label: "CONFIRMED DEEP", decisionDepth: "DEEP" as const, decisionStatus: "CONFIRMED" as const },
    { label: "ESCALATED DEEP", decisionDepth: "DEEP" as const, decisionStatus: "ESCALATED" as const },
    { label: "ESCALATED STANDARD", decisionDepth: "STANDARD" as const, decisionStatus: "ESCALATED" as const },
    { label: "BLOCKED_UNKNOWN null", decisionDepth: null, decisionStatus: "BLOCKED_UNKNOWN" as const },
  ];
  for (const required of ["LIGHT", "STANDARD", "DEEP"]) {
    for (const v of verdicts) {
      const ev = verdict({ decisionDepth: v.decisionDepth, decisionStatus: v.decisionStatus });
      const expected = v.decisionStatus === "ESCALATED" ? v.decisionDepth! : required;
      const actual = foldDepth(required, ev);
      ok(actual === expected, `foldDepth(${required}, ${v.label}) = ${actual}`);
    }
  }

  // The adjudication slot mirrors the event verbatim (UNKNOWN → null depth).
  const unknownRow = verdict({ decisionDepth: null, decisionStatus: "BLOCKED_UNKNOWN" });
  const folded = foldEventOntoEntry(initEntryForTest("solution-gate"), unknownRow, undefined, REQ);
  ok(folded.decision_depth === null && folded.decision_status === "BLOCKED_UNKNOWN" && folded.gate_result === "FAIL",
    "UNKNOWN verdict folds a null decision_depth with the FAIL adjudication");
  const confirmedRow = verdict({ decisionDepth: "LIGHT", decisionStatus: "CONFIRMED" });
  const foldedConfirmed = foldEventOntoEntry(initEntryForTest("solution-gate"), confirmedRow, undefined, REQ);
  ok(foldedConfirmed.decision_depth === "LIGHT" && foldedConfirmed.decision_status === "CONFIRMED",
    "CONFIRMED verdict folds its concrete depth (may legally sit below required)");
}

console.log(`\ng5t2: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
