// G6 / D-090-04 — frozen-registry guard (R9-H1 / R10-H1)
// ============================================================================
// The matrix runners' denominators come from the FROZEN scenario registers
// (the spec §3 ledger), never from the scenarios that happened to run: a
// register that silently lost or duplicated an entry must fail loudly with
// its own diagnostic, because the red A' state (or any other exit code) is
// not evidence that the register was checked. R10-H1: the completing /
// over-limit registers had no such guard (a deleted completing scenario
// reported 49/0, exit 0; a deleted over-limit scenario 3/0 or 0/0 with no
// dedicated error); R9-H1: the crash register's denominator came from the
// per-script crashPoint under verification.

import type { ScenarioSpec } from "./types";

/** The frozen ledger sizes (spec §3): the artifact-layer matrix and the
 *  behavior-only over-limit single-listing. */
export const FROZEN_COMPLETING_SCENARIOS = 50;
export const FROZEN_OVER_LIMIT_SCENARIOS = 4;
export const FROZEN_CRASH_SCENARIOS = 6;

export interface RegistryAudit {
  readonly label: string;
  readonly ranCount: number;
  readonly uniqueCount: number;
  readonly expected: number;
  readonly duplicated: readonly string[];
}

/** Audits a register against its frozen size. */
export function auditFrozenRegistry(
  label: string,
  specs: readonly ScenarioSpec[],
  expected: number,
): RegistryAudit {
  const counts = new Map<string, number>();
  for (const spec of specs) {
    counts.set(spec.id, (counts.get(spec.id) ?? 0) + 1);
  }
  const duplicated = [...counts.entries()]
    .filter(([, n]) => n > 1)
    .map(([id]) => id)
    .sort();
  return Object.freeze({
    label,
    ranCount: specs.length,
    uniqueCount: counts.size,
    expected,
    duplicated,
  });
}

/**
 * Throws with a dedicated diagnostic unless the register is exactly the
 * frozen register: the expected count, no duplicates. A lost entry
 * (ranCount < expected) and a duplicated entry (duplicated non-empty) are
 * distinct failures — the message names which.
 */
export function assertFrozenRegistry(label: string, specs: readonly ScenarioSpec[], expected: number): RegistryAudit {
  const audit = auditFrozenRegistry(label, specs, expected);
  const lost = audit.expected - audit.ranCount;
  if (audit.ranCount !== expected || audit.uniqueCount !== expected || audit.duplicated.length > 0) {
    throw new Error(
      `frozen ${label} register drifted: ran ${audit.ranCount}, unique ${audit.uniqueCount}, expected ${expected}` +
        `${lost > 0 ? `; ${lost} entr(y/ies) lost from the register` : ""}` +
        `${audit.duplicated.length > 0 ? `; duplicated: ${audit.duplicated.join(", ")}` : ""}`,
    );
  }
  return audit;
}
