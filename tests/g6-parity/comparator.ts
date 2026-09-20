// G6 / D-090-04 offline parity harness — two-layer comparator (frozen spec §4.2)
// ============================================================================
// Artifact layer (dims 3/4/5): T5 whitelist normalization + byte-exact digest
// comparison. Behavior layer (dims 1/2/6/7/8/9): manifest semantic fields +
// behavior traces via the full-chain pair [M2]. This module implements the
// artifact layer now and exposes the behavior-layer entry point for M2.

import { parseRubyYaml } from "../../core/loop-manifest-yaml";
import type { DimensionResult, FactScript } from "./types";
import {
  NINE_DIMENSIONS,
  NORMALIZE_DROP_ENTRY,
  NORMALIZE_DROP_HEAD,
} from "./types";

/** T5-frozen normalization: drop face-only progress/execution fields. */
export function normalize(doc: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  for (const key of NORMALIZE_DROP_HEAD) delete clone[key];
  const entries = clone.entries as Record<string, unknown>[] | undefined;
  if (Array.isArray(entries)) {
    for (const entry of entries) {
      for (const key of NORMALIZE_DROP_ENTRY) delete entry[key];
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
  readonly dimensions: DimensionResult[];
}

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
): ComparisonResult {
  const manual = normalize(
    JSON.parse(JSON.stringify(parseRubyYaml(manualManifestText))) as Record<string, unknown>,
  );
  const runtime = normalize(
    JSON.parse(JSON.stringify(parseRubyYaml(runtimeManifestText))) as Record<string, unknown>,
  );
  const diffs = diffPaths(manual, runtime);
  const dims: DimensionResult[] = NINE_DIMENSIONS.map((dimension) => {
    const relevant = diffs.filter((d) => diffBelongsToDimension(d, dimension));
    return Object.freeze({
      dimension,
      verdict: relevant.length === 0 ? ("MATCH" as const) : ("DIVERGE" as const),
      detail: relevant.length === 0 ? "normalized manifests deep-equal" : relevant.slice(0, 5).join("; "),
    });
  });
  return { dimensions: dims };
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
