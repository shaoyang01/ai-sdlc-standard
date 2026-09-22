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
 */
export interface CompareOptions {
  readonly catchUpRegime?: boolean;
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
  if (options?.catchUpRegime === true && Array.isArray(clone.finding_index)) {
    for (const row of clone.finding_index as Record<string, unknown>[]) {
      // D-17: the row id flips to the runtime id on closure; the evidence
      // reference + discovering node is the stable cross-face identity.
      row.finding_id = `${String(row.discovered_at)}::${String(row.evidence_ref)}`;
    }
  }
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
