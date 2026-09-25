// G6 / D-090-04 — negative-matrix coverage guard (R11-H1)
// ============================================================================
// A negative matrix's pass count is not its coverage: `passed` only
// accumulates the assertions that still execute, so deleting assertions —
// or the whole matrix — used to settle green (54→49/0, 38→37/0, exit 0).
// R10-H1 pinned the scenario registers; this pins the negative COVERAGE:
// a frozen group register (every group must run exactly once) plus a frozen
// assertion total, each with its own diagnostic.

export interface NegativeGuard {
  /** Registers a frozen group by label (throws on an unregistered label). */
  group(label: string): void;
  /** Settles the matrix: all groups ran exactly once, non-empty, exact total. Throws otherwise. */
  settle(actualTotal: number): void;
}

export function makeNegativeGuard(
  suite: string,
  frozenGroups: readonly string[],
  frozenTotal: number,
): NegativeGuard {
  const executed: string[] = [];
  return Object.freeze({
    group(label: string): void {
      if (!frozenGroups.includes(label)) {
        throw new Error(`${suite}: unregistered negative group "${label}" — the frozen register is the only source of groups`);
      }
      executed.push(label);
    },
    settle(actualTotal: number): void {
      const counts = new Map<string, number>();
      for (const label of executed) counts.set(label, (counts.get(label) ?? 0) + 1);
      const duplicated = [...counts.entries()].filter(([, n]) => n > 1).map(([label]) => label).sort();
      const missing = frozenGroups.filter((label) => !counts.has(label)).sort();
      if (missing.length > 0) {
        throw new Error(`${suite}: frozen negative group(s) never ran (coverage lost): ${missing.join(", ")}`);
      }
      if (duplicated.length > 0) {
        throw new Error(`${suite}: negative group(s) ran more than once: ${duplicated.join(", ")}`);
      }
      if (actualTotal === 0) {
        throw new Error(`${suite}: the negative matrix is EMPTY — an empty matrix must never settle green`);
      }
      if (actualTotal !== frozenTotal) {
        throw new Error(
          `${suite}: assertion count drifted — executed ${actualTotal}, frozen ${frozenTotal}` +
            `${frozenTotal > actualTotal ? ` (${frozenTotal - actualTotal} assertion(s) lost from the matrix)` : ` (${actualTotal - frozenTotal} unexpected assertion(s))`}`,
        );
      }
    },
  });
}
