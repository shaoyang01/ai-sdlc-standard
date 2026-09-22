// G6 / D-090-04 — comparator negative matrix (G6T2-R1-H4 regression)
// ============================================================================
// The artifact-layer verdict is the normalized FULL-DOCUMENT equality; the
// dimension rows are diagnostic attribution only. These negative cases pin
// that: whitelist-dropped fields never fail a comparison, and ANY difference
// outside the drop set (entry digest/version/status/path, findingIndex,
// non-dropped head fields, missing/extra entries) fails it with the raw diff
// path — the fail-open that judged unclassified diffs as all-MATCH is closed.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { driveManualFace } from "./g6-parity/manual-face";
import { driveRuntimeStoreLevel, makeStores } from "./g6-parity/runtime-face";
import { compareArtifactLayer } from "./g6-parity/comparator";
import { coreFirstRoundScenarios } from "./g6-parity/fact-scripts";
import { NINE_DIMENSIONS } from "./g6-parity/types";
import { parseRubyYaml, dumpRubyYaml } from "../core/loop-manifest-yaml";
import { extractManifestYaml, wrapManifestYaml } from "../core/loop-manifest-projector";

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

type Doc = Record<string, unknown>;

function parse(text: string): Doc {
  return JSON.parse(JSON.stringify(parseRubyYaml(extractManifestYaml(text)))) as Doc;
}

function render(doc: Doc, requirementId: string): string {
  return wrapManifestYaml(dumpRubyYaml(doc as never), requirementId);
}

function entriesOf(doc: Doc): Record<string, unknown>[] {
  return doc.entries as Record<string, unknown>[];
}

function entry(doc: Doc, node: string): Record<string, unknown> {
  const found = entriesOf(doc).find((e) => e["node"] === node);
  if (found === undefined) throw new Error(`entry ${node} missing`);
  return found;
}

// One real scenario's manifest pair (both faces driven through production paths).
const spec = coreFirstRoundScenarios().find((s) => s.id === "S-CORE-STANDARD-PASS-first")!;
const script = spec.build();
const root = mkdtempSync(join(tmpdir(), "g6-negative-"));
let manualText: string;
let runtimeText: string;
try {
  const manual = driveManualFace(join(root, "lib-manual"), script);
  manualText = manual.manifestText;
  const stores = makeStores("negative");
  try {
    const runtime = driveRuntimeStoreLevel(stores, script, join(root, "lib-runtime"), manualText);
    runtimeText = runtime.manifestText;
  } finally {
    stores.runStore.close();
    rmSync(stores.root, { recursive: true, force: true });
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}

const requirementId = script.requirementId;
console.log("G6 comparator negative matrix (G6T2-R1-H4): one real PASS pair + mutations");

// ── 1. identical manifests ────────────────────────────────────────────────
{
  const result = compareArtifactLayer(manualText, runtimeText, script);
  ok(result.equal && result.diffs.length === 0, "identical manifests compare equal");
  const judged = result.dimensions.filter((d) => d.verdict !== "NOT_JUDGED");
  ok(judged.length === 3 && judged.every((d) => d.verdict === "MATCH"), "the three artifact-layer dimensions judge MATCH");
  const notJudged = result.dimensions.filter((d) => d.verdict === "NOT_JUDGED").map((d) => d.dimension);
  ok(
    notJudged.length === 6 &&
      notJudged.includes("node-sequence") && notJudged.includes("gate-roles") &&
      notJudged.includes("decision-depth") && notJudged.includes("next-eligibility") &&
      notJudged.includes("earliest-reroute") && notJudged.includes("final-handoff"),
    "the six behavior-layer dimensions are NOT_JUDGED, never MATCH",
  );
}

// ── 2. whitelist-dropped fields never fail a comparison ───────────────────
{
  const headDrops = [
    "projection_provenance", "declaration_log", "publish_seq", "projected_through",
    "updated_at", "corrections", "repair_records", "manifest_digest",
  ];
  for (const field of headDrops) {
    const doc = parse(runtimeText);
    (doc as Record<string, unknown>)[field] = field === "manifest_digest" ? "0".repeat(64) : [{ injected: true }];
    const result = compareArtifactLayer(manualText, render(doc, requirementId), script);
    ok(result.equal, `dropped head field ${field} mutated → still equal`);
  }
  const entryDrops = ["source_event_ref", "updated_at", "execution"];
  for (const field of entryDrops) {
    const doc = parse(runtimeText);
    entry(doc, "requirement-intake")[field] = { injected: true };
    const result = compareArtifactLayer(manualText, render(doc, requirementId), script);
    ok(result.equal, `dropped entry field ${field} mutated → still equal`);
  }
}

// ── 3. any difference outside the drop set fails with the raw diff path ───
{
  const mutateEntry = (node: string, field: string, value: unknown): string => {
    const doc = parse(runtimeText);
    entry(doc, node)[field] = value;
    return render(doc, requirementId);
  };
  const cases: readonly { label: string; text: string; expectPath: RegExp }[] = [
    { label: "entry digest", text: mutateEntry("requirement-intake", "digest", "f".repeat(64)), expectPath: /digest/ },
    { label: "entry version", text: mutateEntry("requirement-intake", "version", "9.9.9"), expectPath: /version/ },
    { label: "entry status", text: mutateEntry("requirement-intake", "status", "stale"), expectPath: /status/ },
    { label: "entry artifact_path", text: mutateEntry("requirement-intake", "artifact_path", "00-需求资料/forged.md"), expectPath: /artifact_path/ },
    { label: "entry node id", text: mutateEntry("requirement-intake", "node", "forged-node"), expectPath: /node/ },
  ];
  for (const testCase of cases) {
    const result = compareArtifactLayer(manualText, testCase.text, script);
    ok(!result.equal && result.diffs.some((d) => testCase.expectPath.test(d)),
      `mutated ${testCase.label} → NOT equal with raw diff path (${result.diffs[0] ?? "none"})`);
  }

  // findingIndex row mutation.
  {
    const doc = parse(runtimeText);
    const rows = doc.finding_index as Record<string, unknown>[];
    rows.push({
      finding_id: "forged-F99", discovered_at: "solution-design", root_cause_category: "SOLUTION",
      earliest_affected_node_id: "solution-design", source_revision: "x", evidence_ref: "y", status: "OPEN",
      closed_by: null, closure_evidence_ref: null, closure_evidence_digest: null, closure_bound_revision_id: null,
    });
    const result = compareArtifactLayer(manualText, render(doc, requirementId), script);
    ok(!result.equal && result.diffs.some((d) => /finding_index/.test(d)), "mutated findingIndex → NOT equal with raw diff path");
  }

  // Non-dropped head field mutation.
  {
    const doc = parse(runtimeText);
    doc.title = "forged title";
    const result = compareArtifactLayer(manualText, render(doc, requirementId), script);
    ok(!result.equal && result.diffs.some((d) => /title/.test(d)), "mutated non-dropped head field (title) → NOT equal");
  }

  // Missing / extra entry.
  {
    const doc = parse(runtimeText);
    entriesOf(doc).splice(0, 1);
    const result = compareArtifactLayer(manualText, render(doc, requirementId), script);
    ok(!result.equal && result.diffs.some((d) => /entries/.test(d)), "missing entry → NOT equal");
  }
  {
    const doc = parse(runtimeText);
    entriesOf(doc).push({ ...entry(doc, "requirement-intake"), node: "forged-extra" });
    const result = compareArtifactLayer(manualText, render(doc, requirementId), script);
    ok(!result.equal, "extra entry → NOT equal");
  }

  // The reviewer's exact H4 reproduction: a legally re-sealed runtime manifest
  // whose intake digest drifted must NOT read as all-MATCH.
  {
    const result = compareArtifactLayer(manualText, mutateEntry("requirement-intake", "digest", "a".repeat(64)), script);
    const allMatch = result.dimensions.every((d) => d.verdict === "MATCH");
    ok(!result.equal && !allMatch, "H4 reproduction (intake digest drift) → NOT all-MATCH");
  }
}

// ── 4. catch-up regime (S-MANIFEST reconcile): the designed exemptions are SCOPED ──
{
  const runtimeDoc = parse(runtimeText);
  const manualDoc = parse(manualText);
  const regime = { catchUpRegime: true };
  // (a) A basename-only difference is the D-7 exemption: still equal.
  {
    const doc = JSON.parse(JSON.stringify(runtimeDoc)) as Record<string, unknown>;
    const impl = (doc.entries as Record<string, unknown>[]).find((e) => e["node"] === "implementation")!;
    impl["artifact_path"] = "04-实现记录/forged-basename.md";
    const result = compareArtifactLayer(manualText, render(doc, requirementId), script, regime);
    ok(result.equal, "catch-up regime: basename-only path difference is the D-7 exemption (still equal)");
  }
  // (b) A DIRECTORY-segment difference is NOT exempted: must fail.
  {
    const doc = JSON.parse(JSON.stringify(runtimeDoc)) as Record<string, unknown>;
    const impl = (doc.entries as Record<string, unknown>[]).find((e) => e["node"] === "implementation")!;
    impl["artifact_path"] = "99-forged-dir/forged-basename.md";
    const result = compareArtifactLayer(manualText, render(doc, requirementId), script, regime);
    ok(!result.equal && result.diffs.some((d) => /artifact_path/.test(d)),
      "catch-up regime: directory-segment path difference still FAILS (exemption is basename-only)");
  }
  // (c) A digest difference is NOT exempted: must fail.
  {
    const doc = JSON.parse(JSON.stringify(runtimeDoc)) as Record<string, unknown>;
    const impl = (doc.entries as Record<string, unknown>[]).find((e) => e["node"] === "implementation")!;
    impl["digest"] = "b".repeat(64);
    const result = compareArtifactLayer(manualText, render(doc, requirementId), script, regime);
    ok(!result.equal && result.diffs.some((d) => /digest/.test(d)),
      "catch-up regime: digest difference still FAILS");
  }
  // (d) A finding-id difference is the D-17 exemption; a finding EVIDENCE
  //     difference is not: must fail.
  {
    const doc = JSON.parse(JSON.stringify(runtimeDoc)) as Record<string, unknown>;
    const rows = doc.finding_index as Record<string, unknown>[];
    if (rows.length > 0) {
      rows[0]!["evidence_ref"] = "forged-evidence-ref";
      const result = compareArtifactLayer(manualText, render(doc, requirementId), script, regime);
      ok(!result.equal, "catch-up regime: finding evidence difference still FAILS (only the id is exempted)");
    }
  }
  // (e) The takeover regime does NOT carry the exemptions: the same basename
  //     difference must fail there.
  {
    const doc = JSON.parse(JSON.stringify(runtimeDoc)) as Record<string, unknown>;
    const impl = (doc.entries as Record<string, unknown>[]).find((e) => e["node"] === "implementation")!;
    impl["artifact_path"] = "04-实现记录/forged-basename.md";
    const result = compareArtifactLayer(manualText, render(doc, requirementId), script);
    ok(!result.equal, "takeover regime: the same basename difference FAILS (exemptions are catch-up-only)");
  }
}

console.log(`\n==== g6 comparator negative summary: ${passed} passed, ${failed} failed ====`);
console.log(`(drop-set exemptions pinned; ${NINE_DIMENSIONS.length - 6} artifact-layer dimensions judge, 6 behavior-layer NOT_JUDGED)`);
if (failed > 0) process.exit(1);
