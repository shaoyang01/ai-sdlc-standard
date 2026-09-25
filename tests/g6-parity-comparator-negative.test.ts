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
import { makeNegativeGuard } from "./g6-parity/negative-guard";
import { coreFirstRoundScenarios, coreManifestStateScenarios } from "./g6-parity/fact-scripts";
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

// R11-H1: the negative matrix's own coverage is pinned (frozen groups + frozen total).
const negativeGuard = makeNegativeGuard(
  "comparator negative",
  ["identical", "whitelist-drops", "out-of-drop-set", "catch-up-scoped-exemptions", "d17-real-baseline"],
  38,
);

// ── 1. identical manifests ────────────────────────────────────────────────
negativeGuard.group("identical");
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
negativeGuard.group("whitelist-drops");
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
negativeGuard.group("out-of-drop-set");
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
negativeGuard.group("catch-up-scoped-exemptions");
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

negativeGuard.group("d17-real-baseline");
// ── 5. D-17 on a REAL finding baseline (R1-H3 remediation) ────────────────
// The reviewer's counterexample: on a closure row, a FORGED runtime finding
// id compared EQUAL because the catch-up regime rewrote every row's id before
// the comparison (the old D-17 branch never ran — its PASS baseline carried
// no findings). The exemption is now pairing-gated and proven against the
// store's finding ids; these cases pin both directions.
{
  const reconcileSpec = coreManifestStateScenarios().find((s) => s.id === "S-MANIFEST-STANDARD-reconcile")!;
  const reconcileScript = reconcileSpec.build();
  const d17Root = mkdtempSync(join(tmpdir(), "g6-negative-d17-"));
  let d17Manual: string;
  let d17Runtime: string;
  let d17Proof: ReadonlyMap<string, { readonly id: string; readonly status: string }>;
  try {
    const manual = driveManualFace(join(d17Root, "lib-manual"), reconcileScript);
    d17Manual = manual.manifestText;
    const stores = makeStores("negative-d17");
    try {
      const runtime = driveRuntimeStoreLevel(
        stores,
        reconcileScript,
        join(d17Root, "lib-runtime"),
        manual.manifestText,
        manual.intermediateManifestText,
      );
      d17Runtime = runtime.manifestText;
      d17Proof = runtime.findingProof;
    } finally {
      stores.runStore.close();
      rmSync(stores.root, { recursive: true, force: true });
    }
  } finally {
    rmSync(d17Root, { recursive: true, force: true });
  }
  const regime17 = { catchUpRegime: true, findingProof: d17Proof };
  // (a) Positive control: the REAL pair passes WITH the exemption — the
  //     closure row's id flipped to the store-assigned id and the per-row
  //     proof forgives exactly that flip.
  {
    const result = compareArtifactLayer(d17Manual, d17Runtime, reconcileScript, regime17);
    ok(result.equal, "D-17 real baseline: the proven closure-row id flip compares equal");
  }
  // (b) The reviewer's counterexample: a forged runtime id on the closure row
  //     (same discovering node + evidence) must FAIL — a forged id is not the
  //     id the journal binds to that row, so the row compares literally.
  {
    const doc = parse(d17Runtime);
    const rows = doc.finding_index as Record<string, unknown>[];
    ok(rows.length > 0, "D-17 real baseline: the closure row exists (the old branch was skipped)");
    rows[0]!["finding_id"] = "forged-unrelated-finding-id";
    const result = compareArtifactLayer(d17Manual, render(doc, reconcileScript.requirementId), reconcileScript, regime17);
    ok(!result.equal, "D-17: a forged closure-row id FAILS (the exemption requires per-row proof)");
  }
  // (c) The takeover regime carries no exemption: the real flipped id must
  //     FAIL there (literal comparison).
  {
    const result = compareArtifactLayer(d17Manual, d17Runtime, reconcileScript, { catchUpRegime: false });
    ok(!result.equal, "D-17: the real id flip FAILS under the takeover regime (exemptions are catch-up-only)");
  }
  // (d) An unpaired row — even carrying a STORE-PROVEN id — must FAIL: the
  //     stable identity has no manual counterpart (the OPEN-row case).
  {
    const doc = parse(d17Runtime);
    const rows = doc.finding_index as Record<string, unknown>[];
    rows[0]!["discovered_at"] = "implementation";
    const result = compareArtifactLayer(d17Manual, render(doc, reconcileScript.requirementId), reconcileScript, regime17);
    ok(!result.equal, "D-17: a store-proven id on an unpaired row FAILS (pairing is required)");
  }
  // (e) An OPEN row keeps its literal id (R2-H3): flipping an OPEN row's id
  //     fails even when the journal proves the finding — only closure rows
  //     (RESOLVED/ACCEPTED) may carry the flip.
  {
    const manualDoc = parse(d17Manual);
    const runtimeDoc = parse(d17Runtime);
    for (const doc of [manualDoc, runtimeDoc]) {
      (doc.finding_index as Record<string, unknown>[])[0]!["status"] = "OPEN";
    }
    (runtimeDoc.finding_index as Record<string, unknown>[])[0]!["finding_id"] = "forged-open-row-id";
    const result = compareArtifactLayer(
      render(manualDoc, reconcileScript.requirementId),
      render(runtimeDoc, reconcileScript.requirementId),
      reconcileScript,
      regime17,
    );
    ok(!result.equal, "D-17: an OPEN row's id flip FAILS (closure rows only)");
  }
  // (f) Per-row proof (R2-H3): a closure row's id must be the journal id bound
  //     to THAT row's identity — a sibling finding's id in the same run is not
  //     proof, and a duplicated pairing is not one-to-one.
  {
    const row = (id: string, key: string, status: string): Record<string, unknown> => ({
      finding_id: id,
      discovered_at: "code-review",
      root_cause_category: "SOLUTION",
      earliest_affected_node_id: "solution-design",
      source_revision: null,
      evidence_ref: `loop-artifact:v1:review_summary:sha256:${key}`,
      status,
      closed_by: "code-review",
      closure_evidence_ref: `loop-artifact:v1:technical_design:sha256:${key}`,
      closure_evidence_digest: key,
      closure_bound_revision_id: `g6-${key}:revision:solution-design:2`,
    });
    const k1 = "a".repeat(8);
    const k2 = "b".repeat(8);
    // The proof map is keyed by the stable cross-face identity, exactly as
    // runtime-face builds it from the journal facts.
    const identityOf = (key: string): string => `code-review::loop-artifact:v1:review_summary:sha256:${key}`;
    const proof = new Map([
      [identityOf(k1), { id: `${k1}-store`, status: "RESOLVED" }],
      [identityOf(k2), { id: `${k2}-store`, status: "RESOLVED" }],
    ]);
    const opts = { catchUpRegime: true, findingProof: proof };
    const manualDoc: Doc = { entries: [], finding_index: [row(`${k1}-declared`, k1, "RESOLVED"), row(`${k2}-declared`, k2, "RESOLVED")] };
    const legit: Doc = { entries: [], finding_index: [row(`${k1}-store`, k1, "RESOLVED"), row(`${k2}-store`, k2, "RESOLVED")] };
    const swapped: Doc = { entries: [], finding_index: [row(`${k2}-store`, k1, "RESOLVED"), row(`${k2}-store`, k2, "RESOLVED")] };
    const duplicated: Doc = { entries: [], finding_index: [row(`${k1}-store`, k1, "RESOLVED"), row(`${k1}-store`, k1, "RESOLVED")] };
    const manualOpen: Doc = { entries: [], finding_index: [row(`${k1}-declared`, k1, "OPEN")] };
    const runtimeOpen: Doc = { entries: [], finding_index: [row(`${k1}-store`, k1, "OPEN")] };
    ok(compareArtifactLayer(render(manualDoc, requirementId), render(legit, requirementId), script, opts).equal,
      "D-17: two proven closure rows (distinct per-row ids) compare equal");
    ok(!compareArtifactLayer(render(manualDoc, requirementId), render(swapped, requirementId), script, opts).equal,
      "D-17: a row carrying a SIBLING finding's store id FAILS (per-row proof)");
    ok(!compareArtifactLayer(render(manualDoc, requirementId), render(duplicated, requirementId), script, opts).equal,
      "D-17: a duplicated pairing (two rows on one identity) FAILS (one-to-one)");
    ok(!compareArtifactLayer(render(manualOpen, requirementId), render(runtimeOpen, requirementId), script, opts).equal,
      "D-17: an OPEN row's id flip FAILS (closure rows only)");
  }
}

negativeGuard.settle(passed);
console.log(`\n==== g6 comparator negative summary: ${passed} passed, ${failed} failed (frozen coverage: ${38} assertions across 5 groups — R11-H1) ====`);
console.log(`(drop-set exemptions pinned; ${NINE_DIMENSIONS.length - 6} artifact-layer dimensions judge, 6 behavior-layer NOT_JUDGED)`);
if (failed > 0) process.exit(1);
