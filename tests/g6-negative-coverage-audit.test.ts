// G6 / D-090-04 — negative-coverage auditor (R13-H1, hardened in R14-H1)
// ============================================================================
// The frozen ledger anchors the negative suites' coverage — the suites
// themselves cannot be that anchor's only consumer: a runner rewritten to
// call its body directly (bypassing runNegativeSuite), or with the guard
// stubbed, still settled green (R13-H1). The wrapper alone is not an
// enforced boundary.
//
// R14-H1 hardening: the first auditor trusted the audited code's WORDS —
// source-string counts and the coverage line the suite prints about itself.
// A runner that prints a forged line while executing 37 (or 0) assertions
// still passed. This auditor verifies EXECUTION instead:
//   1. the ledger seal, recomputed here from the file itself and cross-checked
//      against the guard module's exported constant (independent of the
//      loader, so a stubbed loader cannot launder a tampered ledger);
//   2. the committed wrapper, probed with synthetic bodies: it must settle an
//      exact body green and reject a deleted assertion, an empty body, and a
//      duplicated group (a stubbed guard fails the probe);
//   3. all four entry points, run as subprocesses and verified by their
//      OBSERVABLE execution traces — exit codes, assertion-line counts and the
//      scenario IDs carrying those lines — matched against the ledger. The
//      matrices' scenario coverage is ID-verified: a deleted scenario or a
//      commented-out register pin changes the trace.
//
// Honest boundary (single repository): the auditor verifies execution
// artifacts, not intentions; forging the trace means fabricating an entire
// plausible output inside the audited runner — a much more visible edit than
// the R13 bypasses, and still one the review process re-runs each round.
// Tamper-evident, not tamper-proof.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { FROZEN_LEDGER_DIGEST, loadFrozenLedger, runNegativeSuite } from "./g6-parity/ledger-guard";

const ROOT = process.cwd();
const LEDGER_PATH = join(ROOT, "tests", "g6-parity", "frozen-ledger.json");

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

console.log("G6 negative-coverage auditor (R13-H1/R14-H1): execution-verified, not self-reported");

// ── 1. the seal, recomputed here from the file (independent of the loader) ──
const parsedLedger = JSON.parse(readFileSync(LEDGER_PATH, "utf8")) as Record<string, unknown>;
const sealed = parsedLedger["ledger_digest"];
const { ledger_digest: _drop, ...ledgerContent } = parsedLedger;
const recomputedDigest = `sha256:${createHash("sha256").update(JSON.stringify(ledgerContent), "utf8").digest("hex")}`;
ok(typeof sealed === "string" && recomputedDigest === sealed,
  "the ledger file's own seal verifies (content digest recomputed in this file)");
ok(recomputedDigest === FROZEN_LEDGER_DIGEST,
  "the ledger content matches the guard module's code seal (a loader stub cannot launder this)");
const ledger = loadFrozenLedger();

// ── 2. the committed wrapper, probed with synthetic bodies ──────────────────
async function wrapperProbe(): Promise<void> {
  const section = { groups: { a: 2, b: 1 }, total: 3 };
  let exactGreen = true;
  try {
    await runNegativeSuite("audit-probe", section, (h) => {
      h.group("a");
      h.ok(true, "probe a1");
      h.ok(true, "probe a2");
      h.group("b");
      h.ok(true, "probe b1");
    });
  } catch {
    exactGreen = false;
  }
  ok(exactGreen, "wrapper probe: the committed guard settles an exact body green");
  let shortMsg = "";
  try {
    await runNegativeSuite("audit-probe", section, (h) => {
      h.group("a");
      h.ok(true, "probe a1");
      h.group("b");
      h.ok(true, "probe b1");
    });
  } catch (error) {
    shortMsg = (error as Error).message;
  }
  ok(shortMsg.includes("group count drift"), "wrapper probe: a deleted assertion fails the settle");
  let emptyMsg = "";
  try {
    await runNegativeSuite("audit-probe", section, (h) => {
      h.group("a");
      h.group("b");
    });
  } catch (error) {
    emptyMsg = (error as Error).message;
  }
  ok(emptyMsg.includes("EMPTY"), "wrapper probe: an empty body fails the settle");
  let dupMsg = "";
  try {
    await runNegativeSuite("audit-probe", section, (h) => {
      h.group("a");
      h.group("a");
      h.ok(true, "probe a1");
      h.ok(true, "probe a2");
      h.group("b");
      h.ok(true, "probe b1");
    });
  } catch (error) {
    dupMsg = (error as Error).message;
  }
  ok(dupMsg.includes("more than once") || dupMsg.includes("twice in a row"),
    "wrapper probe: a duplicated group fails the settle");
}

interface RunTrace {
  readonly code: number;
  readonly output: string;
}

const runEntry = (file: string): RunTrace => {
  try {
    const output = execFileSync("node", ["--import", "tsx", file], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 900_000,
    });
    return { code: 0, output };
  } catch (error) {
    const err = error as { status?: number; stdout?: string | Buffer; stderr?: string | Buffer };
    // The entries' ok() prints passing lines to stdout and failing lines to
    // stderr — the trace must see BOTH (a red matrix writes its evidence to
    // stderr; capturing stdout alone would silently verify half the run).
    const merge = (value: string | Buffer | undefined): string => (typeof value === "string" ? value : String(value ?? ""));
    return { code: err.status ?? -1, output: `${merge(err.stdout)}\n${merge(err.stderr)}` };
  }
};

/** The assertion lines an entry actually printed (the wrapper's handle output). */
const assertionLines = (trace: RunTrace, mark: "✓" | "✗"): readonly string[] =>
  trace.output.split("\n").filter((line) => line.startsWith(`  ${mark} `));

/** The scenario IDs carrying those assertion lines (the first token, colon-stripped). */
const lineIds = (lines: readonly string[]): readonly string[] =>
  lines.map((line) => line.trim().slice(2).split(/[\s:]/)[0] ?? "").filter((id) => id.length > 0);

const sameSet = (a: readonly string[], b: readonly string[]): boolean => {
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.length === sortedB.length && sortedA.every((value, index) => value === sortedB[index]);
};

// ── the audit itself (async: the wrapper probe awaits the guard's settle) ───
void (async (): Promise<void> => {
  await wrapperProbe();

// ── 3. the negative suites: exit 0, exactly the frozen assertion lines ──────
const negativeSuites: readonly { label: string; file: string; total: number }[] = [
  { label: "behavior negative", file: "tests/g6-parity-behavior-negative.test.ts", total: ledger.negatives.behavior.total },
  { label: "comparator negative", file: "tests/g6-parity-comparator-negative.test.ts", total: ledger.negatives.comparator.total },
];
for (const suite of negativeSuites) {
  const trace = runEntry(suite.file);
  const green = assertionLines(trace, "✓").length;
  const red = assertionLines(trace, "✗").length;
  ok(
    trace.code === 0 && green === suite.total && red === 0,
    `${suite.label}: under audit — exit ${trace.code}, ${green} assertions executed (frozen ${suite.total}), ${red} failed`,
  );
}

// ── 4. the matrices: scenario coverage is ID-verified against the ledger ────
const artifactTrace = runEntry("tests/g6-parity-matrix.test.ts");
const artifactIds = lineIds(assertionLines(artifactTrace, "✓"));
ok(
  artifactTrace.code === 0 && sameSet(artifactIds, ledger.scenarios.completing),
  `artifact matrix: exit ${artifactTrace.code}, ${artifactIds.length} scenarios passed — ID-identical to the ledger's ${ledger.scenarios.completing.length} (a deleted scenario or a dead register pin changes this)`,
);

const behaviorTrace = runEntry("tests/g6-parity-behavior-matrix.test.ts");
const behaviorFailedIds = lineIds(assertionLines(behaviorTrace, "✗"));
const behaviorPauseIds = lineIds(assertionLines(behaviorTrace, "✓"));
const crashLine = /crash-recovery facts: (\d+)\/(\d+)/.exec(behaviorTrace.output);
const bucketLine = /known-cause bucket[^:]*: (\d+)\/(\d+)/.exec(behaviorTrace.output);
const nonDim9 = /non-dim-9 divergences: (\d+)/.exec(behaviorTrace.output);
const overLimitLine = /over-limit pause \(behavior layer only\): (\d+) passed, (\d+) failed/.exec(behaviorTrace.output);
ok(
  behaviorTrace.code === 1 &&
    sameSet(behaviorFailedIds, ledger.scenarios.completing) &&
    sameSet(behaviorPauseIds, ledger.scenarios.overLimit) &&
    crashLine !== null && crashLine[1] === "6" && crashLine[2] === "6" &&
    bucketLine !== null && bucketLine[1] === "50" && bucketLine[2] === "50" &&
    nonDim9 !== null && nonDim9[1] === "0" &&
    overLimitLine !== null && overLimitLine[1] === "4" && overLimitLine[2] === "0",
  `behavior matrix: exit ${behaviorTrace.code} (A' red by design), ${behaviorFailedIds.length} completing IDs match the ledger, ` +
    `${behaviorPauseIds.length} over-limit IDs match, crash ${crashLine?.[1]}/${crashLine?.[2]}, bucket ${bucketLine?.[1]}/${bucketLine?.[2]}, non-dim-9 ${nonDim9?.[1]}, over-limit ${overLimitLine?.[1]}/${overLimitLine?.[2]}`,
);

console.log(`\n==== g6 negative-coverage audit summary: ${passed} passed, ${failed} failed ====`);
console.log(`(R13-H1/R14-H1: the ledger's independent consumer — own seal recomputation + wrapper probe + subprocess execution traces ID-verified against the ledger)`);
if (failed > 0) process.exit(1);
})();
