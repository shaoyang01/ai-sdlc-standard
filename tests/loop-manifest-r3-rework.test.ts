// G5-T5-R3 rework regression — the five blockers, verified against the
// reference interpreter LIVE (ruby runs per assertion; no baked-in golden
// bytes — the R1/R2 lesson: never use our own output as the baseline).
// EXECUTED scenarios — the list below IS the main() call list; keep them in
// sync (a header that outruns main() is a defect, not a summary):
//   1. scenarioQuoteFallbackFamily      B1+S1: quote-fallback chain vs ruby
//   2. scenarioDatetimeDayNormalisation B2: day 1-31 normalise like Time.utc
//   3. scenarioContinuationIndent       B3: continuation indent = owning+2,
//                                       emitter AND reader, all positions
//   4. scenarioRepairKeyOrderReload     B4: real repair key order reloads
//   5. scenarioQuoteChainClosures       R4-N1..N4: >=2-quote leading forms,
//                                       leading blank x quote, soft
//                                       indicator+blank x quote, double-form
//                                       LS/PS escapes, folding x LS (incl. a
//                                       pub1-shaped end-to-end reload)
//   6. scenarioQuoteResidualRoots        R5-B1-Ⅰ..Ⅳ: break-adjacency gate
//                                       (blank after break), \L/\P pass-
//                                       through column model, bare-break
//                                       column reset to zero, consecutive-
//                                       break indent, + pubC/D/E/F-shaped
//                                       end-to-end reloads
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LoopRunStore } from "../core/loop-run-store";
import type { LoopRunEvent, LoopRunIdentity } from "../core/loop-executor-types";
import { LOOP_MANIFEST_SCHEMA_VERSION, extractManifestYaml, projectLoopManifest, sealManifest } from "../core/loop-manifest-projector";
import { dumpRubyYaml, parseRubyYaml, type YamlValue } from "../core/loop-manifest-yaml";

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

/** Reference output for a {k: value} document, produced LIVE by ruby. */
function rubyScalarDoc(value: string): string {
  return execFileSync("ruby", ["-ryaml", "-rjson", "-e", 'puts YAML.dump({ "k" => JSON.parse(STDIN.read) })'], {
    input: JSON.stringify(value),
  }).toString();
}

/** Reference output for a whole document, produced LIVE by ruby. */
function rubyDoc(mapping: Record<string, YamlValue>): string {
  return execFileSync("ruby", ["-ryaml", "-rjson", "-e", 'puts YAML.dump(JSON.parse(STDIN.read))'], {
    input: JSON.stringify(mapping),
  }).toString();
}

const LS = "\u2028";
const PS = "\u2029";

// ===========================================================================
async function scenarioQuoteFallbackFamily(): Promise<void> {
  const forms = [
    '"a', '"', "a", "-\"hi", "-a\"b", "?\"x", "+\"o", ".\"n", "~\"m",
    ":\"y", "!\"z", "|\"w", "#\"u", "!abc", '"quoted title', "plain",
  ];
  for (const form of forms) {
    const ts = dumpRubyYaml({ k: form });
    const rb = rubyScalarDoc(form);
    ok(ts === rb, `quote form ${JSON.stringify(form)} byte-identical with ruby`);
  }
}

// ===========================================================================
async function scenarioDatetimeDayNormalisation(): Promise<void> {
  const normalising = [
    "2019-02-29T00:00:00Z", "2019-02-29T24:00:00Z",
    "2020-02-30T00:00:00Z", "2020-02-30T24:00:00Z",
    "2020-02-31T00:00:00Z", "2020-04-31T24:00:00Z",
  ];
  for (const stamp of normalising) {
    const ts = dumpRubyYaml({ k: stamp });
    const rb = rubyScalarDoc(stamp);
    ok(ts === rb, `day-normalising ${stamp} byte-identical (quoted like Time.utc)`);
  }
  const raising = ["2020-02-32T00:00:00Z", "2020-00-15T00:00:00Z", "2020-13-15T00:00:00Z", "2020-02-00T00:00:00Z"];
  for (const stamp of raising) {
    const ts = dumpRubyYaml({ k: stamp });
    const rb = rubyScalarDoc(stamp);
    ok(ts === rb, `out-of-range ${stamp} stays a plain String on both sides`);
  }
}

// ===========================================================================
async function scenarioContinuationIndent(): Promise<void> {
  const value = `a${LS}b${PS}c`;
  const deep = `line1${LS}line2${LS}line3`;

  // Emitter: every nesting position, compared LIVE with ruby.
  const docs: Record<string, YamlValue>[] = [
    { k: value },
    { outer: { k: value } },
    { outer2: { outer: { k: deep } } },
    { seq: [value] },
    { seqmap: [{ k: value }] },
    { seqmap: [{ inner: value }] },
  ];
  for (const doc of docs) {
    const ts = dumpRubyYaml(doc as never);
    const rb = rubyDoc(doc);
    ok(ts === rb, `LS/PS continuation at ${Object.keys(doc)[0]!} byte-identical with ruby`);
  }

  // Reader: a ruby-produced 4/6-space continuation document reads back the
  // EXACT value (no phantom spaces), and re-dumps byte-identically.
  for (const doc of docs) {
    const rubyText = rubyDoc(doc);
    const parsed = parseRubyYaml(rubyText) as never;
    const redumped = dumpRubyYaml(parsed);
    ok(redumped === rubyText, `read→write round-trip byte-stable for ${Object.keys(doc)[0]!}`);
  }
  const deepParsed = (parseRubyYaml(rubyDoc(docs[2]!)) as Record<string, never>).outer2 as Record<string, never>;
  const deepInner = (deepParsed.outer as Record<string, string>).k;
  ok(deepInner === deep, "deep LS value reads back without phantom spaces");

  // Single trailing LF fold form at a nested position (owning indent + 2).
  const foldDocs: Record<string, YamlValue>[] = [
    { k: "ab\n" },
    { outer: { k: "ab\n" } },
    { outer2: { outer: { k: "ab\n" } } },
  ];
  for (const doc of foldDocs) {
    const ts = dumpRubyYaml(doc as never);
    const rb = rubyDoc(doc);
    ok(ts === rb, `trailing-LF fold at ${Object.keys(doc)[0]!} byte-identical with ruby`);
  }
}

// ===========================================================================
async function scenarioRepairKeyOrderReload(): Promise<void> {
  const RUN = "run-g5t5r3-001";
  const REQ = "req-g5t5r3-001";
  const root = mkdtempSync(join(tmpdir(), "loop-g5t5r3-b4-"));
  const store = new LoopRunStore(join(root, "journal.db"));
  try {
    mkdirSync(join(root, "repo"), { recursive: true });
    mkdirSync(join(root, "library", REQ), { recursive: true });
    const libraryDir = join(root, "library", REQ);
    store.init();
    store.createRun({
      runId: RUN, requirementId: REQ, repository: "example", repositoryPath: join(root, "repo"),
      baseBranch: "main", expectedBaseSha: "1".repeat(40), taskBranch: "t", controlRoot: join(root, "control"),
      createdAt: "2026-09-11T00:00:00.000Z",
    } as LoopRunIdentity);
    store.appendEvent({
      eventId: `${RUN}:2:run_started`, runId: RUN, sequence: 2, kind: "run_started", stage: null,
      attempt: 0, createdAt: "2026-09-11T00:00:01.000Z", inputDigest: null, outputArtifactRef: null,
      outputDigest: null, errorCode: null, retryable: null, reasonCode: null, bindingId: null,
      bindingVersion: null, inputArtifactRef: null,
    } as LoopRunEvent);

    const request = { store, runId: RUN, requirementId: REQ, libraryDir };
    // Real publisher repair shape: declaration_log -> repair_records ->
    // corrections, with NO corrections key in unrepaired products. Sealed in
    // TS — the self-digest over this key order must survive load.
    const base: Record<string, unknown> = {
      schema_version: LOOP_MANIFEST_SCHEMA_VERSION, requirement_id: REQ, title: "R3B4需求",
      publish_seq: 1, projected_through: "MANUAL", updated_at: "2026-09-11T00:00:02.000Z",
      depth: { decision_scope: "solution", requested_depth: "STANDARD", initial_depth_basis: "intake-init", required_depth: "STANDARD" },
      entries: [
        { node: "requirement-intake", status: "current", artifact_path: "00-需求资料/req_需求摘要.md", version: "1.0.0", digest: "b".repeat(64), updated_at: "2026-09-11T00:00:02.000Z", source_event_ref: "00-需求资料/req_需求摘要.md" },
        { node: "solution-design", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
        { node: "solution-gate", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
        { node: "task-planning", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
        { node: "implementation", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
        { node: "code-review", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
        { node: "knowledge-sync", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
      ],
      finding_index: [],
      declaration_log: [],
      repair_records: [
        {
          who: "operator", when: "2026-09-11T00:00:03.000Z",
          reason: `drifted digest corrected${LS}second line`, corrected_entries: "solution-design",
          baseline_reset: "projected_through reset to the journal tail",
        },
      ],
      corrections: [{ entry: "solution-design", field: "digest", from: `${"9".repeat(64)}`, to: `${"b".repeat(64)}` }],
    };
    const sealed = sealManifest(base as never);
    writeFileSync(join(libraryDir, "manifest.md"), dumpRubyYaml({ ...base, manifest_digest: sealed.manifest_digest }), "utf8");

    // The reload leg (R3-B4's missing half): load must pass self-digest over
    // the repair key order, then takeover, then replay.
    const outcome = projectLoopManifest({ ...request, takeoverAcceptedAt: "2026-09-11T00:00:04.000Z" });
    ok(outcome.kind === "PUBLISHED", `repaired manifest loads and takes over (${JSON.stringify(outcome)})`);
    const after = parseRubyYaml(extractManifestYaml(readFileSync(join(libraryDir, "manifest.md"), "utf8"))) as Record<string, unknown>;
    ok(Array.isArray(after.repair_records) && Array.isArray(after.corrections), "repair records and corrections survive the round-trip");

    // Byte-parity of the KEY ORDER itself with ruby over the same state.
    const tsDoc = dumpRubyYaml({ ...base, manifest_digest: sealed.manifest_digest });
    const rbDoc = rubyDoc({ ...base, manifest_digest: sealed.manifest_digest });
    ok(tsDoc === rbDoc, "repair key order byte-identical with ruby over the same state");

    ok(projectLoopManifest(request).kind === "NO_OP", "repaired-manifest replay is NO_OP");
  } finally {
    try { store.close(); } catch { /* cleanup tolerance */ }
    rmSync(root, { recursive: true, force: true });
  }
}

// ===========================================================================
async function scenarioQuoteChainClosures(): Promise<void> {
  const LS = "\u2028";
  const PS = "\u2029";
  // R4-N1: a leading double quote with a SECOND quote anywhere -> single.
  const n1 = ['"a"', '""', '"""', "\"'", '"a"b', '"a"b"c', '""a', '"a"', '"a": "', '"a""', '""a""', '" x "'];
  for (const form of n1) {
    ok(dumpRubyYaml({ k: form }) === rubyScalarDoc(form), `N1 ${JSON.stringify(form)} byte-identical with ruby`);
  }
  // R4-N2: leading blank x quote -> single; soft indicator + blank x quote ->
  // single (plain-unsafe sequence/mapping indicator forms).
  const n2 = [' "a', '  "a', ' "', '- "x"', '? "x"'];
  for (const form of n2) {
    ok(dumpRubyYaml({ k: form }) === rubyScalarDoc(form), `N2 ${JSON.stringify(form)} byte-identical with ruby`);
  }
  // R4-N3: double-form x LS/PS -> \L/\P escapes; control bytes must never
  // ride the single-quoted LS form (unparseable documents).
  const n3 = [`"a${LS}b`, `\ta${LS}b`, `😀${LS}`, `a\u0001b${LS}c`, `"a${PS}`];
  for (const form of n3) {
    ok(dumpRubyYaml({ k: form }) === rubyScalarDoc(form), `N3 ${JSON.stringify(form)} byte-identical with ruby`);
  }
  // R4-N4a: <90 x><LS>short tail — no phantom fold right after the break.
  const pub1Title = `${"x".repeat(90)}${LS}short tail`;
  ok(!dumpRubyYaml({ k: pub1Title }).includes("\n  short"), "N4a: no phantom fold right after the LS break");
  ok(dumpRubyYaml({ k: pub1Title }) === rubyScalarDoc(pub1Title), "N4a pub1-shaped value byte-identical with ruby");
  // R4-N4b: any segment needing a fold flips the whole scalar to double+\L.
  const n4b = [`w ${"w ".repeat(20)}${LS}z ${"z ".repeat(20)}`, `${"y".repeat(85)} ${LS}tail tail tail tail`];
  for (const form of n4b) {
    ok(dumpRubyYaml({ k: form }) === rubyScalarDoc(form), `N4b ${JSON.stringify(form.slice(0, 12))}… byte-identical with ruby (double+\\L form)`);
  }

  // End-to-end: the pub1-shaped title loads, takes over, and replays.
  const RUN = "run-g5t5r4-001";
  const REQ = "req-g5t5r4-001";
  const root = mkdtempSync(join(tmpdir(), "loop-g5t5r4-"));
  const store = new LoopRunStore(join(root, "journal.db"));
  try {
    mkdirSync(join(root, "repo"), { recursive: true });
    mkdirSync(join(root, "library", REQ), { recursive: true });
    const libraryDir = join(root, "library", REQ);
    store.init();
    store.createRun({
      runId: RUN, requirementId: REQ, repository: "example", repositoryPath: join(root, "repo"),
      baseBranch: "main", expectedBaseSha: "1".repeat(40), taskBranch: "t", controlRoot: join(root, "control"),
      createdAt: "2026-09-11T00:00:00.000Z",
    } as LoopRunIdentity);
    store.appendEvent({
      eventId: `${RUN}:2:run_started`, runId: RUN, sequence: 2, kind: "run_started", stage: null,
      attempt: 0, createdAt: "2026-09-11T00:00:01.000Z", inputDigest: null, outputArtifactRef: null,
      outputDigest: null, errorCode: null, retryable: null, reasonCode: null, bindingId: null,
      bindingVersion: null, inputArtifactRef: null,
    } as LoopRunEvent);

    const request = { store, runId: RUN, requirementId: REQ, libraryDir };
    const base: Record<string, unknown> = {
      schema_version: LOOP_MANIFEST_SCHEMA_VERSION, requirement_id: REQ, title: pub1Title,
      publish_seq: 1, projected_through: "MANUAL", updated_at: "2026-09-11T00:00:02.000Z",
      depth: { decision_scope: "solution", requested_depth: "STANDARD", initial_depth_basis: "intake-init", required_depth: "STANDARD" },
      entries: [
        { node: "requirement-intake", status: "current", artifact_path: "00-需求资料/req_需求摘要.md", version: "1.0.0", digest: "b".repeat(64), updated_at: "2026-09-11T00:00:02.000Z", source_event_ref: "00-需求资料/req_需求摘要.md" },
        { node: "solution-design", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
        { node: "solution-gate", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
        { node: "task-planning", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
        { node: "implementation", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
        { node: "code-review", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
        { node: "knowledge-sync", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
      ],
      finding_index: [],
      declaration_log: [],
      repair_records: [{ who: "operator", when: "2026-09-11T00:00:03.000Z", reason: `drift${LS}fixed`, corrected_entries: "requirement-intake" }],
    };
    const sealed = sealManifest(base as never);
    writeFileSync(join(libraryDir, "manifest.md"), dumpRubyYaml({ ...base, manifest_digest: sealed.manifest_digest }), "utf8");
    const outcome = projectLoopManifest({ ...request, takeoverAcceptedAt: "2026-09-11T00:00:04.000Z" });
    ok(outcome.kind === "PUBLISHED", `pub1-shaped manifest loads and takes over (${JSON.stringify(outcome)})`);
    ok(projectLoopManifest(request).kind === "NO_OP", "pub1-shaped replay is NO_OP");
  } finally {
    try { store.close(); } catch { /* cleanup tolerance */ }
    rmSync(root, { recursive: true, force: true });
  }
}

// ===========================================================================
async function scenarioQuoteResidualRoots(): Promise<void> {
  const LS = "\u2028";
  const PS = "\u2029";
  // R5-B1-Ⅰ: blank AFTER a break is break-adjacent too (double+escape form;
  // the single-quoted reader would silently strip it — value corrosion).
  for (const form of [`a${LS} b`, `a${PS} b`, `x y${LS} z w`]) {
    ok(dumpRubyYaml({ k: form }) === rubyScalarDoc(form), `B1-1 ${JSON.stringify(form)} byte-identical with ruby`);
  }
  // R5-B1-Ⅱ: \L/\P count their own 2 written columns (folding AFTER the
  // escape uses the continued column).
  const two = `pre ${"x ".repeat(60)}${LS}post ${"y ".repeat(60)}`;
  ok(dumpRubyYaml({ k: two }) === rubyScalarDoc(two), "B1-2 pass-through column model byte-identical with ruby");
  // R5-B1-Ⅲ: a bare break resets the column to ZERO (single-quoted fold
  // position matches ruby exactly).
  const three = `${"s".repeat(22)}${LS}${"t".repeat(60)}`;
  ok(dumpRubyYaml({ k: three }) === rubyScalarDoc(three), "B1-3 bare-break zero reset byte-identical with ruby");
  // R5-B1-Ⅳ: consecutive breaks take the indent only after the LAST one.
  const four = [`hotfix${LS}${PS}rollout`, `a${LS}${LS}b`, `a${PS}${LS}b`];
  for (const form of four) {
    ok(dumpRubyYaml({ k: form }) === rubyScalarDoc(form), `B1-4 ${JSON.stringify(form)} byte-identical with ruby`);
  }

  // pubC/D/E/F-shaped end-to-end reloads: each root's title form must load,
  // take over, and replay (R5 verdict: these were the wedging vectors).
  const titles: Record<string, string> = {
    pubC: `fix login${LS} retry flow`,
    pubD: `${"s".repeat(22)}${LS}${"t".repeat(60)}`,
    pubE: `pre ${"x ".repeat(60)}${LS}post ${"y ".repeat(60)}`,
    pubF: `hotfix${LS}${PS}rollout`,
  };
  for (const [name, title] of Object.entries(titles)) {
    const RUN = `run-${name.toLowerCase()}`;
    const REQ = `req-${name.toLowerCase()}`;
    const root = mkdtempSync(join(tmpdir(), `loop-${name.toLowerCase()}-`));
    const store = new LoopRunStore(join(root, "journal.db"));
    try {
      mkdirSync(join(root, "repo"), { recursive: true });
      mkdirSync(join(root, "library", REQ), { recursive: true });
      const libraryDir = join(root, "library", REQ);
      store.init();
      store.createRun({
        runId: RUN, requirementId: REQ, repository: "example", repositoryPath: join(root, "repo"),
        baseBranch: "main", expectedBaseSha: "1".repeat(40), taskBranch: "t", controlRoot: join(root, "control"),
        createdAt: "2026-09-11T00:00:00.000Z",
      } as LoopRunIdentity);
      store.appendEvent({
        eventId: `${RUN}:2:run_started`, runId: RUN, sequence: 2, kind: "run_started", stage: null,
        attempt: 0, createdAt: "2026-09-11T00:00:01.000Z", inputDigest: null, outputArtifactRef: null,
        outputDigest: null, errorCode: null, retryable: null, reasonCode: null, bindingId: null,
        bindingVersion: null, inputArtifactRef: null,
      } as LoopRunEvent);
      const request = { store, runId: RUN, requirementId: REQ, libraryDir };
      const base: Record<string, unknown> = {
        schema_version: LOOP_MANIFEST_SCHEMA_VERSION, requirement_id: REQ, title,
        publish_seq: 1, projected_through: "MANUAL", updated_at: "2026-09-11T00:00:02.000Z",
        depth: { decision_scope: "solution", requested_depth: "STANDARD", initial_depth_basis: "intake-init", required_depth: "STANDARD" },
        entries: [
          { node: "requirement-intake", status: "current", artifact_path: "00-需求资料/req_需求摘要.md", version: "1.0.0", digest: "b".repeat(64), updated_at: "2026-09-11T00:00:02.000Z", source_event_ref: "00-需求资料/req_需求摘要.md" },
          { node: "solution-design", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
          { node: "solution-gate", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
          { node: "task-planning", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
          { node: "implementation", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
          { node: "code-review", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
          { node: "knowledge-sync", status: "pending", artifact_path: null, version: null, digest: null, updated_at: null, source_event_ref: null },
        ],
        finding_index: [], declaration_log: [],
        repair_records: [{ who: "operator", when: "2026-09-11T00:00:03.000Z", reason: title, corrected_entries: "requirement-intake" }],
      };
      const sealed = sealManifest(base as never);
      writeFileSync(join(libraryDir, "manifest.md"), dumpRubyYaml({ ...base, manifest_digest: sealed.manifest_digest }), "utf8");
      const outcome = projectLoopManifest({ ...request, takeoverAcceptedAt: "2026-09-11T00:00:04.000Z" });
      ok(outcome.kind === "PUBLISHED", `${name}-shaped manifest loads and takes over (${JSON.stringify(outcome)})`);
      ok(projectLoopManifest(request).kind === "NO_OP", `${name}-shaped replay is NO_OP`);
    } finally {
      try { store.close(); } catch { /* cleanup tolerance */ }
      rmSync(root, { recursive: true, force: true });
    }
  }
}

async function main(): Promise<void> {
  console.log("G5-T5-R3 rework — quote-fallback family vs live ruby (B1+S1)");
  await scenarioQuoteFallbackFamily();
  console.log("G5-T5-R3 rework — datetime day normalisation vs live ruby (B2)");
  await scenarioDatetimeDayNormalisation();
  console.log("G5-T5-R3 rework — continuation indent owning+2, emitter and reader (B3)");
  await scenarioContinuationIndent();
  console.log("G5-T5-R3 rework — real repair key order reloads end to end (B4)");
  await scenarioRepairKeyOrderReload();
  console.log("G5-T5-R4 rework — quote chain closures incl. pub1-shaped reload (R4-N1..N4)");
  await scenarioQuoteChainClosures();
  console.log("G5-T5-R5 rework — residual quote-chain roots incl. pubC/D/E/F reloads (R5-B1-Ⅰ..Ⅳ)");
  await scenarioQuoteResidualRoots();
  console.log(`\ng5t5-r3-rework: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void assert;
void parseRubyYaml;
main();
