// G6 / D-090-04 — negative-coverage auditor (R13-H1 → R14-H1 → R15-H5)
// ============================================================================
// The frozen ledger anchors the negative suites' coverage — the suites
// themselves cannot be that anchor's only consumer: a runner rewritten to
// call its body directly (bypassing runNegativeSuite), or with the guard
// stubbed, still settled green (R13-H1). The wrapper alone is not an
// enforced boundary.
//
// R14-H1 hardened the auditor to verify EXECUTION instead of the audited
// code's WORDS (source-string checks + the coverage line each suite printed
// about itself): own seal recomputation, a synthetic-body probe of the
// committed wrapper, and subprocess runs of all four entry points.
//
// R15-H5 closed the last self-report hole: that version still counted the
// ✓/✗ TEXT LINES the entries printed and dropped stderr on the success path.
// A mutated entry that printed one extra green line (53 real assertions + 1
// fabricated line), or wrote a real red assertion after the settle, still
// settled green — output text is not execution evidence. This version
// verifies STRUCTURED EVENTS emitted at the evaluation points (the guard
// handle's ok/group/settle; the matrices' per-scenario judge and every A′
// pin), cross-checked against the printed lines: a printed assertion line
// without a backing event is itself a failure. Both stdout and stderr are
// captured on success and failure. The guard's handle is closed at settle,
// so a post-settle assertion throws instead of silently counting.
//
// Honest boundary (single repository): events are still emitted by audited
// code — tamper-EVIDENT, not tamper-PROOF. Fabricating a coherent stream
// means forging structured execution records at the evaluation points AND
// keeping every printed line consistent with them, which is far more visible
// than the R13/R14 bypasses; the review process re-runs the false-green
// probes each round.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExecutionEvent } from "./g6-parity/event-stream";
import { FROZEN_LEDGER_DIGEST, loadFrozenLedger, runNegativeSuite } from "./g6-parity/ledger-guard";

const ROOT = process.cwd();
const LEDGER_PATH = join(ROOT, "tests", "g6-parity", "frozen-ledger.json");
// The probe bodies run in THIS process — never let a stray stream path leak
// the auditor's own probes into a subprocess's event file.
delete process.env.G6_EVENT_STREAM;

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

console.log("G6 negative-coverage auditor (R13-H1/R14-H1/R15-H5): execution-EVENT verified, not line-counted");

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
  // R15-H5: the handle must be CLOSED at settle — an assertion written after
  // the settle window (via a captured handle) is not an execution.
  let captured: { ok(condition: boolean, message: string): void } | null = null;
  try {
    await runNegativeSuite("audit-probe", section, (h) => {
      captured = h;
      h.group("a");
      h.ok(true, "probe a1");
      h.ok(true, "probe a2");
      h.group("b");
      h.ok(true, "probe b1");
    });
  } catch {
    /* the exact body settles green — capturing the handle is the point */
  }
  let afterSettleMsg = "";
  try {
    captured?.ok(true, "probe after settle");
  } catch (error) {
    afterSettleMsg = (error as Error).message;
  }
  ok(afterSettleMsg.includes("after settle"),
    "wrapper probe: a handle used after settle is rejected (post-settle assertions cannot slip in)");
}

interface RunTrace {
  readonly code: number;
  readonly output: string;
  readonly events: readonly ExecutionEvent[];
}

/**
 * Runs one entry as a subprocess with a FRESH event stream (the path is the
 * auditor's, in a temp dir the audited code never sees), and returns the
 * exit code, the MERGED output (stdout and stderr — the ok() handle writes
 * failing lines to stderr, and the R15-H5 late-red probe wrote its red line
 * there while exiting 0), and the parsed events.
 */
const runEntry = (suite: string, file: string, eventDir: string): RunTrace => {
  const eventPath = join(eventDir, `${suite}.ndjson`);
  try {
    const output = execFileSync("node", ["--import", "tsx", file], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, G6_EVENT_STREAM: eventPath },
      timeout: 1_800_000,
    });
    return { code: 0, output, events: parseEvents(eventPath) };
  } catch (error) {
    const err = error as { status?: number; stdout?: string | Buffer; stderr?: string | Buffer };
    const merge = (value: string | Buffer | undefined): string => (typeof value === "string" ? value : String(value ?? ""));
    return {
      code: err.status ?? -1,
      output: `${merge(err.stdout)}\n${merge(err.stderr)}`,
      events: parseEvents(eventPath),
    };
  }
};

const parseEvents = (path: string): readonly ExecutionEvent[] => {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const events: ExecutionEvent[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      events.push(JSON.parse(line) as ExecutionEvent);
    } catch {
      // a corrupt line is not an event — the count/consistency checks catch the drift
    }
  }
  return events;
};

/** The assertion-shaped lines an entry actually printed (any stream). */
const printedLines = (trace: RunTrace, mark: "✓" | "✗"): readonly string[] =>
  trace.output.split("\n").filter((line) => line.startsWith(`  ${mark} `));

const scenarioIds = (events: readonly ExecutionEvent[]): readonly string[] =>
  events.filter((event) => event.t === "scenario").map((event) => String(event.id ?? ""));

const sameSet = (a: readonly string[], b: readonly string[]): boolean => {
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.length === sortedB.length && sortedA.every((value, index) => value === sortedB[index]);
};

const noDuplicates = (ids: readonly string[]): boolean => new Set(ids).size === ids.length;

// ── the audit itself (async: the wrapper probe awaits the guard's settle) ───
void (async (): Promise<void> => {
  await wrapperProbe();

  const eventDir = mkdtempSync(join(tmpdir(), "g6-audit-events-"));
  try {
    // ── 3. the negative suites: EVENT-verified (assert events per group at the
    //       frozen counts; settled; no failed event; every printed green line
    //       backed by an event) ─────────────────────────────────────────────
    const negativeSuites: readonly { label: string; suite: string; file: string }[] = [
      { label: "behavior negative", suite: "behavior negative", file: "tests/g6-parity-behavior-negative.test.ts" },
      { label: "comparator negative", suite: "comparator negative", file: "tests/g6-parity-comparator-negative.test.ts" },
    ];
    for (const entry of negativeSuites) {
      const trace = runEntry(entry.suite, entry.file, eventDir);
      const frozen = entry.suite === "behavior negative" ? ledger.negatives.behavior : ledger.negatives.comparator;
      const asserts = trace.events.filter((event) => event.t === "assert");
      const settled = trace.events.filter((event) => event.t === "settle");
      const perGroup = Object.fromEntries(
        Object.keys(frozen.groups).map((group) => [
          group,
          asserts.filter((event) => event.group === group && event.ok === true).length,
        ]),
      );
      const groupsExact = Object.entries(perGroup).every(([group, count]) => count === frozen.groups[group]);
      const printedGreen = printedLines(trace, "✓").length;
      const printedRed = printedLines(trace, "✗").length;
      ok(
        trace.code === 0 &&
          settled.length === 1 &&
          groupsExact &&
          asserts.length === frozen.total &&
          asserts.every((event) => event.ok === true) &&
          printedGreen === frozen.total &&
          printedRed === 0,
        `${entry.label}: under audit — exit ${trace.code}, ${asserts.length} assertion EVENTS across ${Object.keys(frozen.groups).length} groups ` +
          `(frozen ${frozen.total}), ${settled.length} settle event(s), printed green ${printedGreen} / red ${printedRed} (must equal the events)`,
      );
    }

    // ── 4. the artifact matrix: scenario events ID-verified + register pin ──
    const artifactTrace = runEntry("artifact-matrix", "tests/g6-parity-matrix.test.ts", eventDir);
    const artifactScenarioEvents = artifactTrace.events.filter((event) => event.t === "scenario");
    const artifactIds = scenarioIds(artifactScenarioEvents);
    const artifactRegisterPin = artifactTrace.events.find(
      (event) => event.t === "pin" && event.name === "register" && event.label === "completing matrix",
    );
    const artifactPrintedGreen = printedLines(artifactTrace, "✓").length;
    const artifactPrintedRed = printedLines(artifactTrace, "✗").length;
    ok(
      artifactTrace.code === 0 &&
        artifactRegisterPin !== undefined && artifactRegisterPin.ok === true &&
        noDuplicates(artifactIds) &&
        sameSet(artifactIds, ledger.scenarios.completing) &&
        artifactScenarioEvents.every((event) => event.ok === true) &&
        artifactPrintedGreen === artifactIds.length &&
        artifactPrintedRed === 0,
      `artifact matrix: exit ${artifactTrace.code}, register pin ${artifactRegisterPin === undefined ? "event MISSING (the pin did not run)" : "ran (event from the guard)"}, ` +
        `${artifactIds.length} scenario EVENTS (all passed) vs the ledger's ${ledger.scenarios.completing.length}; ` +
        `printed green ${artifactPrintedGreen} / red ${artifactPrintedRed} (must equal the events)`,
    );

    // ── 5. the behavior matrix: scenario events + the A′ pin events, values
    //       cross-checked against the sealed ledger ─────────────────────────
    const behaviorTrace = runEntry("behavior-matrix", "tests/g6-parity-behavior-matrix.test.ts", eventDir);
    const behaviorScenarioEvents = behaviorTrace.events.filter((event) => event.t === "scenario");
    const behaviorFailedIds = scenarioIds(behaviorScenarioEvents.filter((event) => event.ok === false));
    const behaviorPauseIds = scenarioIds(behaviorScenarioEvents.filter((event) => event.ok === true));
    const pin = (name: string): ExecutionEvent | undefined =>
      behaviorTrace.events.find((event) => event.t === "pin" && event.name === name);
    const registerPins = behaviorTrace.events.filter(
      (event) => event.t === "pin" && event.name === "register",
    );
    const registerPinsOk =
      registerPins.length === 3 &&
      registerPins.every((event) => event.ok === true) &&
      registerPins.map((event) => event.label).sort().join("|") === "completing matrix|crash|over-limit pause";
    const bucketPin = pin("dim9-bucket");
    const nonDim9Pin = pin("non-dim9");
    const crashPin = pin("crash-facts");
    const overLimitPin = pin("over-limit");
    const behaviorPrintedGreen = printedLines(behaviorTrace, "✓").length;
    const behaviorPrintedRed = printedLines(behaviorTrace, "✗").length;
    ok(
      behaviorTrace.code === 1 &&
        noDuplicates([...behaviorFailedIds, ...behaviorPauseIds]) &&
        sameSet(behaviorFailedIds, ledger.scenarios.completing) &&
        sameSet(behaviorPauseIds, ledger.scenarios.overLimit) &&
        behaviorPrintedGreen === behaviorPauseIds.length &&
        behaviorPrintedRed === behaviorFailedIds.length &&
        registerPinsOk &&
        bucketPin !== undefined && bucketPin.ok === true &&
        bucketPin.known === 50 && bucketPin.expected === 50 && bucketPin.newCause === 0 &&
        nonDim9Pin !== undefined && nonDim9Pin.ok === true && nonDim9Pin.value === 0 &&
        crashPin !== undefined && crashPin.ok === true &&
        crashPin.withFacts === 6 && crashPin.total === 6 && crashPin.crashPointMissing === 0 &&
        overLimitPin !== undefined && overLimitPin.ok === true &&
        overLimitPin.passed === 4 && overLimitPin.failed === 0,
      `behavior matrix: exit ${behaviorTrace.code} (A' red by design), ${behaviorFailedIds.length} failing scenario EVENTS vs ledger completing ${ledger.scenarios.completing.length}, ` +
        `${behaviorPauseIds.length} passing vs ledger over-limit ${ledger.scenarios.overLimit.length}; register pins ${registerPins.length}/3 ran (events from the guard); ` +
        `pins: bucket 50/50 zero new cause, non-dim-9 0, crash 6/6, over-limit 4/0 — ` +
        `printed green ${behaviorPrintedGreen} / red ${behaviorPrintedRed} (must equal the events)`,
    );
  } finally {
    rmSync(eventDir, { recursive: true, force: true });
  }

  console.log(`\n==== g6 negative-coverage audit summary: ${passed} passed, ${failed} failed ====`);
  console.log(`(R13-H1/R14-H1/R15-H5: the ledger's independent consumer — own seal recomputation + wrapper probe + four entries verified by structured EXECUTION EVENTS, cross-checked against printed lines, stdout+stderr merged)`);
  if (failed > 0) process.exit(1);
})();
