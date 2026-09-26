// G6 / D-090-04 — frozen-ledger guard (R10-H1 / R11-H1 / R12-H1)
// ============================================================================
// The acceptance instrument's own denominators must not live in the runner
// they guard: R10-H1 / R11-H1 pinned the scenario registers and the negative
// coverage against constants and counts the guarded runner itself carried —
// shrinking a frozen value together with the coverage (or bypassing the
// settle) still settled green. R12-H1's fix: a FROZEN LEDGER as data
// (`frozen-ledger.json`), sealed by a digest constant held in THIS module
// (two files to forge, tamper-evident for accidental drift), verified
// bidirectionally by ID (scenario registers) and by per-group runtime counts
// (negative suites), with the negative suites structurally wrapped so the
// settle cannot be bypassed. Limitations are honest: within one repository
// the seal is tamper-EVIDENT, not tamper-PROOF; the review process re-runs
// the four false-green probes each round.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { ScenarioSpec } from "./types";
import { emitEvent } from "./event-stream";

const LEDGER_PATH = join(process.cwd(), "tests", "g6-parity", "frozen-ledger.json");

/**
 * The sealed digest of the ledger content (everything except ledger_digest).
 * Editing the ledger without re-sealing fails loudly; re-sealing requires
 * touching this module — the ledger is data, the seal is code.
 */
export const FROZEN_LEDGER_DIGEST = "sha256:5bc9326000b1b1730c0f68ff3398b837eeb830a45318df990a1639a062ae8315";

export interface FrozenLedger {
  readonly scenarios: {
    readonly completing: readonly string[];
    readonly overLimit: readonly string[];
    readonly crash: readonly string[];
  };
  readonly negatives: {
    readonly behavior: { readonly groups: Readonly<Record<string, number>>; readonly total: number };
    readonly comparator: { readonly groups: Readonly<Record<string, number>>; readonly total: number };
  };
}

export function loadFrozenLedger(): FrozenLedger {
  const parsed = JSON.parse(readFileSync(LEDGER_PATH, "utf8")) as FrozenLedger & { ledger_digest?: unknown };
  const sealed = parsed.ledger_digest;
  const { ledger_digest: _drop, ...content } = parsed;
  const actual = `sha256:${createHash("sha256").update(JSON.stringify(content), "utf8").digest("hex")}`;
  if (typeof sealed !== "string" || sealed !== actual) {
    throw new Error(
      `frozen ledger seal mismatch: content digest ${actual}, sealed ${String(sealed)} — ` +
        "the ledger is the instrument's anchor data; edit it only through a coverage decision (and re-seal deliberately)",
    );
  }
  if (actual !== FROZEN_LEDGER_DIGEST) {
    throw new Error(
      `frozen ledger digest does not match the guard module's seal: content ${actual}, module ${FROZEN_LEDGER_DIGEST} — ` +
        "the ledger data and its code seal have drifted apart (both must change together, by decision)",
    );
  }
  return content;
}

/** Bidirectional ID-set equality against the ledger's frozen register. */
export function assertScenarioLedger(label: string, specs: readonly ScenarioSpec[], expectedIds: readonly string[]): void {
  const ids = specs.map((spec) => spec.id);
  const duplicated = ids.filter((id, index) => ids.indexOf(id) !== index);
  const actual = new Set(ids);
  const expected = new Set(expectedIds);
  const missing = expectedIds.filter((id) => !actual.has(id)).sort();
  const extra = [...actual].filter((id) => !expected.has(id)).sort();
  if (duplicated.length > 0 || missing.length > 0 || extra.length > 0) {
    throw new Error(
      `frozen ${label} register drifted vs the ledger` +
        `${duplicated.length > 0 ? ` — duplicated: ${[...new Set(duplicated)].join(", ")}` : ""}` +
        `${missing.length > 0 ? ` — missing (in ledger, not in the register): ${missing.join(", ")}` : ""}` +
        `${extra.length > 0 ? ` — unexpected (in the register, not in the ledger): ${extra.join(", ")}` : ""}`,
    );
  }
  // R15-H5: the pin IS the evaluation — its event is emitted here, so a
  // commented-out or bypassed pin leaves no event at all (a separate emit
  // statement after the call could survive neutralizing the call itself).
  emitEvent({ t: "pin", suite: "scenario-ledger", name: "register", label, ok: true, size: ids.length, frozen: expectedIds.length });
}

export interface NegativeSuiteHandle {
  ok(condition: boolean, message: string): void;
  group(label: string): void;
}

export interface NegativeSuiteResult {
  readonly passed: number;
  readonly failed: number;
  readonly summary: string;
}

/**
 * Runs a negative suite under the frozen ledger: the suite body registers
 * its groups and asserts through the handle; the settle is STRUCTURAL (this
 * function performs it — a suite cannot forget or bypass it). Every frozen
 * group must run exactly once at exactly its frozen count, and the total
 * must match; each failure class has its own diagnostic, and the summary
 * line is generated from the actual execution, never hardcoded.
 *
 * R15-H5: every evaluation point emits a structured event (assert / group /
 * settle) for the auditor's execution-trace check, and the handle is CLOSED
 * at settle — a captured handle used afterwards throws (an assertion outside
 * the settle window does not count as execution).
 */
export async function runNegativeSuite(
  suite: string,
  section: { readonly groups: Readonly<Record<string, number>>; readonly total: number },
  body: (handle: NegativeSuiteHandle) => Promise<void> | void,
): Promise<NegativeSuiteResult> {
  let passed = 0;
  let failed = 0;
  const executed = new Map<string, number>();
  const order: string[] = [];
  let current: string | null = null;
  let settled = false;
  const handle: NegativeSuiteHandle = {
    ok(condition, message): void {
      if (settled) {
        throw new Error(
          `${suite}: handle used after settle — an assertion outside the settle window is not an execution`,
        );
      }
      if (condition) {
        passed += 1;
        console.log(`  ✓ ${message}`);
      } else {
        failed += 1;
        console.error(`  ✗ ${message}`);
      }
      const key = current ?? "<before any group>";
      executed.set(key, (executed.get(key) ?? 0) + 1);
      emitEvent({ t: "assert", suite, group: key, ok: condition, msg: message });
    },
    group(label): void {
      if (settled) {
        throw new Error(`${suite}: handle used after settle — a group outside the settle window is not a registration`);
      }
      if (!(label in section.groups)) {
        throw new Error(`${suite}: unregistered negative group "${label}" — the frozen ledger is the only source of groups`);
      }
      if (current !== null && !order.includes(label) === false && order[order.length - 1] === label) {
        throw new Error(`${suite}: group "${label}" registered twice in a row`);
      }
      order.push(label);
      current = label;
      emitEvent({ t: "group", suite, label });
    },
  };
  await body(handle);
  const frozenGroups = Object.keys(section.groups);
  const ranGroups = [...executed.keys()].filter((key) => key !== "<before any group>");
  const missing = frozenGroups.filter((label) => !executed.has(label));
  const extra = ranGroups.filter((label) => !(label in section.groups));
  const wrongCounts = frozenGroups
    .filter((label) => executed.has(label) && executed.get(label) !== section.groups[label])
    .map((label) => `${label}: executed ${executed.get(label)}, frozen ${section.groups[label]}`);
  const outsideGroup = executed.get("<before any group>") ?? 0;
  const ranTwice = order.filter((label, index) => order.indexOf(label) !== index);
  const actualTotal = passed + failed;
  const problems: string[] = [];
  if (missing.length > 0) problems.push(`frozen group(s) never ran (coverage lost): ${missing.join(", ")}`);
  if (extra.length > 0) problems.push(`unregistered group(s) ran: ${extra.join(", ")}`);
  if (ranTwice.length > 0) problems.push(`group(s) ran more than once: ${[...new Set(ranTwice)].join(", ")}`);
  if (outsideGroup > 0) problems.push(`${outsideGroup} assertion(s) ran before any group was registered`);
  if (wrongCounts.length > 0) problems.push(`group count drift: ${wrongCounts.join("; ")}`);
  if (actualTotal === 0) problems.push("the negative matrix is EMPTY — an empty matrix must never settle green");
  if (actualTotal !== section.total) {
    problems.push(`total drift: executed ${actualTotal}, frozen ${section.total}${section.total > actualTotal ? ` (${section.total - actualTotal} assertion(s) lost)` : ""}`);
  }
  if (problems.length > 0) {
    throw new Error(`${suite}: frozen coverage violated — ${problems.join("; ")}`);
  }
  const summary = `${suite}: ${passed} passed, ${failed} failed (frozen coverage: ${section.total} assertions across ${frozenGroups.length} groups — every group ran exactly its frozen count)`;
  emitEvent({ t: "settle", suite, passed, failed, total: section.total, groups: frozenGroups.length });
  settled = true;
  return { passed, failed, summary };
}
