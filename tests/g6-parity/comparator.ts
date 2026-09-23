// G6 / D-090-04 offline parity harness — two-layer comparator (frozen spec §4.2)
// ============================================================================
// Artifact layer (dims 3/4/5): T5 whitelist normalization + byte-exact digest
// comparison. Behavior layer (dims 1/2/6/7/8/9): manifest semantic fields +
// behavior traces via the full-chain pair [M2]. This module implements the
// artifact layer now and exposes the behavior-layer entry point for M2.

import { parseRubyYaml } from "../../core/loop-manifest-yaml";
import { extractManifestYaml } from "../../core/loop-manifest-projector";
import type { DimensionResult, FactScript } from "./types";
import {
  NINE_DIMENSIONS,
  NORMALIZE_DROP_ENTRY,
  NORMALIZE_DROP_HEAD,
} from "./types";

/**
 * Comparison options. The takeover regime (both faces carry the same object)
 * is compared byte-exact. The catch-up regime (S-MANIFEST reconcile) carries
 * the projector's two DESIGNED face exemptions, which the projector's own
 * reconciliation applies and this comparator must therefore mirror:
 *   - D-7 / RC4-1(a): artifact basenames are the face mapping exemption —
 *     the real manual manifests carry Chinese basenames while runtime
 *     revisions derive their own; the semantic key is (directory segment,
 *     capability). Only the BASENAME is exempted: a different directory
 *     segment is still a divergence.
 *   - D-17: when a finding closure lands, the row's authority flips to the
 *     runtime face and the row id becomes the store-assigned id; the
 *     evidence (reference + digest + discovering node) is the identity.
 *     R1-H3 remediation: the id flip is forgiven ONLY when the runtime id is
 *     PROVEN store-bound (`storeFindingIds` — the run's journal finding ids,
 *     passed by the caller from the store) AND the row pairs with a manual
 *     row on the stable identity (discovered_at + evidence_ref). An OPEN
 *     row, an unpaired row, or any forged id is compared literally.
 */
export interface CompareOptions {
  readonly catchUpRegime?: boolean;
  /**
   * The run's store-assigned finding ids (journal fact, read from the run
   * store by the driver). required for the catch-up regime: without it NO
   * finding-id exemption applies (fail closed).
   */
  readonly storeFindingIds?: ReadonlySet<string>;
}

/** T5-frozen normalization: drop face-only progress/execution fields. */
export function normalize(doc: Record<string, unknown>, options?: CompareOptions): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  for (const key of NORMALIZE_DROP_HEAD) delete clone[key];
  const entries = clone.entries as Record<string, unknown>[] | undefined;
  if (Array.isArray(entries)) {
    for (const entry of entries) {
      for (const key of NORMALIZE_DROP_ENTRY) delete entry[key];
      if (options?.catchUpRegime === true && typeof entry.artifact_path === "string") {
        // D-7: compare the semantic key (directory segment :: capability),
        // never the basename.
        const semantic = String(entry.artifact_path).replace(/\//g, "/");
        const dir = semantic.slice(0, semantic.lastIndexOf("/"));
        entry.artifact_path = `${dir}::${String(entry.node)}`;
      }
    }
  }
  // The D-17 finding-id exemption is NOT applied here (R1-H3): the blanket
  // rewrite below made every finding row's id unobservable, so a forged id on
  // a closure row compared equal. The exemption now lives in
  // applyVerifiedFindingIdExemption — bilateral, pairing-gated, and proven
  // against the store's finding ids.
  return clone;
}

function diffPaths(a: unknown, b: unknown, path = ""): string[] {
  if (a === b) return [];
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return [`${path || "<root>"}: manual=${JSON.stringify(a)} runtime=${JSON.stringify(b)}`];
  }
  const diffs: string[] = [];
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  for (const key of [...keys].sort()) {
    diffs.push(...diffPaths((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], path ? `${path}.${key}` : key));
  }
  return diffs;
}

export interface ComparisonResult {
  /**
   * The artifact-layer verdict: the two normalized documents are field-for-
   * field equal. This — NOT the per-dimension rows — is the pass/fail
   * criterion (frozen spec §4.2: after the whitelist normalization, any
   * difference outside the drop set FAILS). The dimension rows below are
   * diagnostic attribution only and must never filter the verdict.
   */
  readonly equal: boolean;
  /** Every normalized diff path (capped for reporting), empty when equal. */
  readonly diffs: readonly string[];
  readonly dimensions: readonly DimensionResult[];
}

/**
 * The artifact layer judges exactly dims 3/4/5 (frozen spec §4.2: artifact
 * paths, version/current/stale, Finding identity). The remaining six are
 * behavior-layer dimensions judged by the full-chain pair in M2 — they are
 * reported NOT_JUDGED here, never as MATCH (an unjudged dimension reported
 * as MATCH is a false green).
 */
const ARTIFACT_LAYER_DIMENSIONS: ReadonlySet<string> = new Set([
  "artifact-paths",
  "version-state",
  "finding-identity",
]);

/**
 * Artifact-layer comparison (dims 3/4/5 + the manifest-shared part of 1/2/5):
 * parse both manifests, normalize with the frozen whitelist, deep-compare.
 * A digest/version/artifactPath difference is a real divergence here — the
 * store-level driver carries the manual face's raw digests.
 */
/**
 * R1-H3 remediation: the D-17 closure-row id flip, forgiven ONLY under proof.
 * A runtime finding row is forgiven when (a) its discovering node + evidence
 * reference pair with a manual row (the stable cross-face identity) and
 * (b) its id is one of the run's STORE-assigned finding ids (the journal
 * fact). Both sides then canonicalize the forgiven pair's id to the stable
 * identity. Every other row keeps its literal id — an OPEN row, an unpaired
 * row, or a forged id fails the full-document comparison.
 */
function applyVerifiedFindingIdExemption(
  manual: Record<string, unknown>,
  runtime: Record<string, unknown>,
  storeFindingIds: ReadonlySet<string> | undefined,
): void {
  const manualRows = Array.isArray(manual.finding_index) ? (manual.finding_index as Record<string, unknown>[]) : [];
  const runtimeRows = Array.isArray(runtime.finding_index) ? (runtime.finding_index as Record<string, unknown>[]) : [];
  if (manualRows.length === 0 || runtimeRows.length === 0) return;
  const identityKey = (row: Record<string, unknown>): string =>
    `${String(row.discovered_at)}::${String(row.evidence_ref)}`;
  const manualKeys = new Set(manualRows.map(identityKey));
  const forgiven = new Set<string>();
  for (const row of runtimeRows) {
    const key = identityKey(row);
    if (!manualKeys.has(key)) continue;
    if (storeFindingIds === undefined || !storeFindingIds.has(String(row.finding_id))) continue;
    row.finding_id = key;
    forgiven.add(key);
  }
  for (const row of manualRows) {
    if (forgiven.has(identityKey(row))) row.finding_id = identityKey(row);
  }
}

export function compareArtifactLayer(
  manualManifestText: string,
  runtimeManifestText: string,
  _script: FactScript,
  options?: CompareOptions,
): ComparisonResult {
  const manual = normalize(
    JSON.parse(JSON.stringify(parseRubyYaml(extractManifestYaml(manualManifestText)))) as Record<string, unknown>,
    options,
  );
  const runtime = normalize(
    JSON.parse(JSON.stringify(parseRubyYaml(extractManifestYaml(runtimeManifestText)))) as Record<string, unknown>,
    options,
  );
  if (options?.catchUpRegime === true) {
    applyVerifiedFindingIdExemption(manual, runtime, options.storeFindingIds);
  }
  const diffs = diffPaths(manual, runtime);
  const dims: DimensionResult[] = NINE_DIMENSIONS.map((dimension) => {
    if (!ARTIFACT_LAYER_DIMENSIONS.has(dimension)) {
      return Object.freeze({
        dimension,
        verdict: "NOT_JUDGED" as const,
        detail: "behavior layer (M2): judged by the full-chain pair, not the artifact layer",
      });
    }
    const relevant = diffs.filter((d) => diffBelongsToDimension(d, dimension));
    return Object.freeze({
      dimension,
      verdict: relevant.length === 0 ? ("MATCH" as const) : ("DIVERGE" as const),
      detail: relevant.length === 0 ? "normalized manifests deep-equal" : relevant.slice(0, 5).join("; "),
    });
  });
  return Object.freeze({ equal: diffs.length === 0, diffs, dimensions: dims });
}

/** Maps a diff path to the dimension it belongs to (artifact-layer mapping). */
function diffBelongsToDimension(path: string, dimension: string): boolean {
  const inEntries = path.startsWith("entries");
  switch (dimension) {
    case "node-sequence":
      return inEntries && /\.node\b/.test(path);
    case "artifact-paths":
      return inEntries && /artifact_?path/i.test(path);
    case "version-state":
      return inEntries && /(version|status)/i.test(path);
    case "finding-identity":
      return path.startsWith("finding_index") || path.startsWith("findingIndex");
    default:
      // Behavior-layer dimensions are judged by the full-chain pair [M2];
      // the artifact layer contributes only manifest-shared evidence.
      return false;
  }
}
