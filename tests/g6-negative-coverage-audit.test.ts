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
// R16-H6/R16-H7 closed the last two holes in that version: the success path
// still returned stdout only (a red line on stderr with exit 0 was
// invisible), the parser silently dropped corrupt event lines, and the
// printed lines were compared to events by COUNT only (one altered line —
// same count, different ID — passed). Now: spawnSync captures both streams
// on success and failure; a corrupt or foreign event line fails the audit
// with its line number; and every printed assertion line must correspond
// ONE BY ONE to an event (exact message text; the matrices' scenario events
// carry id AND message).
//
// Honest boundary (single repository): events are still emitted by audited
// code — tamper-EVIDENT, not tamper-PROOF. Within the declared same-repo
// boundary, appending a few consistent event records and matching printed
// lines is possible (the reviewer's event-forge probe passed by design);
// what each round raises is the cost and the visibility of that edit. The
// review process re-runs the false-green probes each round.

import { spawnSync } from "node:child_process";
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
  /** Non-empty when the stream holds a line that is not a valid event. */
  readonly corruptLines: readonly string[];
}

/**
 * Runs one entry as a subprocess with a FRESH event stream (the path is the
 * auditor's, in a temp dir the audited code never sees), and returns the
 * exit code, the MERGED output (spawnSync captures stdout AND stderr on the
 * SUCCESS path too — the R16-H6 form wrote its red assertion to stderr while
 * exiting 0, and a stdout-only capture never saw it), and the parsed events.
 */
const runEntry = (suite: string, file: string, eventDir: string): RunTrace => {
  const eventPath = join(eventDir, `${suite}.ndjson`);
  const result = spawnSync("node", ["--import", "tsx", file], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, G6_EVENT_STREAM: eventPath },
    timeout: 1_800_000,
  });
  return {
    code: result.status ?? -1,
    output: `${String(result.stdout ?? "")}\n${String(result.stderr ?? "")}`,
    ...parseEvents(eventPath),
  };
};

interface ParsedStream {
  readonly events: readonly ExecutionEvent[];
  readonly corruptLines: readonly string[];
}

/**
 * Strict event-stream parse: every line must be a JSON object carrying the
 * event tag `t`. A corrupt or foreign line is REPORTED, not silently dropped
 * (R16-H7: a valid settle followed by one appended garbled record used to
 * pass the audit 11/0 because the parser discarded it).
 */
const parseEvents = (path: string): ParsedStream => {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return { events: [], corruptLines: ["<event stream missing>"] };
  }
  const events: ExecutionEvent[] = [];
  const corruptLines: string[] = [];
  let lineNo = 0;
  for (const line of text.split("\n")) {
    lineNo += 1;
    if (line.trim() === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      corruptLines.push(`line ${lineNo}: not valid JSON (${line.slice(0, 60)})`);
      continue;
    }
    if (typeof parsed !== "object" || parsed === null || typeof (parsed as { t?: unknown }).t !== "string") {
      corruptLines.push(`line ${lineNo}: not an event object (${line.slice(0, 60)})`);
      continue;
    }
    events.push(parsed as ExecutionEvent);
  }
  return { events, corruptLines };
};

/** The assertion-shaped lines an entry actually printed (any stream). */
const printedLines = (trace: RunTrace, mark: "✓" | "✗"): readonly string[] =>
  trace.output.split("\n").filter((line) => line.startsWith(`  ${mark} `));

/** The message text of those printed lines (the part after the mark). */
const printedTexts = (trace: RunTrace, mark: "✓" | "✗"): readonly string[] =>
  printedLines(trace, mark).map((line) => line.slice(4));

const scenarioIds = (events: readonly ExecutionEvent[]): readonly string[] =>
  events.filter((event) => event.t === "scenario").map((event) => String(event.id ?? ""));

const sameSet = (a: readonly string[], b: readonly string[]): boolean => {
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.length === sortedB.length && sortedA.every((value, index) => value === sortedB[index]);
};

const noDuplicates = (ids: readonly string[]): boolean => new Set(ids).size === ids.length;

/** Multiset equality on sorted arrays (same length, same elements). */
const sameMultiset = (a: readonly string[], b: readonly string[]): boolean => {
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.length === sortedB.length && sortedA.every((value, index) => value === sortedB[index]);
};

/**
 * R16-H7: the printed lines must CORRESPOND to the events one by one — by
 * exact message text for the negative suites (assert events carry the
 * message) and by message text for the matrices' scenario events. Comparing
 * only COUNTS let a run that printed one altered line (same count, different
 * ID/text) pass while the events recorded the original execution.
 */
const printedMatchEvents = (trace: RunTrace, events: readonly ExecutionEvent[]): boolean => {
  const green = events.filter((event) => event.t === "assert" || event.t === "scenario").filter((event) => event.ok === true).map((event) => String(event.msg ?? ""));
  const red = events.filter((event) => event.t === "assert" || event.t === "scenario").filter((event) => event.ok === false).map((event) => String(event.msg ?? ""));
  return sameMultiset(printedTexts(trace, "✓"), green) && sameMultiset(printedTexts(trace, "✗"), red);
};

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
          trace.corruptLines.length === 0 &&
          settled.length === 1 &&
          groupsExact &&
          asserts.length === frozen.total &&
          asserts.every((event) => event.ok === true) &&
          printedMatchEvents(trace, asserts),
        `${entry.label}: under audit — exit ${trace.code}, ${asserts.length} assertion EVENTS across ${Object.keys(frozen.groups).length} groups ` +
          `(frozen ${frozen.total}), ${settled.length} settle event(s), corrupt stream lines ${trace.corruptLines.length}, ` +
          `printed vs events: ${printedMatchEvents(trace, asserts) ? "one-to-one" : "MISMATCH"}`,
      );
      if (trace.corruptLines.length > 0) {
        console.error(`    corrupt event stream: ${trace.corruptLines.slice(0, 3).join(" | ")}`);
      }
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
        artifactTrace.corruptLines.length === 0 &&
        artifactRegisterPin !== undefined && artifactRegisterPin.ok === true &&
        noDuplicates(artifactIds) &&
        sameSet(artifactIds, ledger.scenarios.completing) &&
        artifactScenarioEvents.every((event) => event.ok === true) &&
        printedMatchEvents(artifactTrace, artifactScenarioEvents),
      `artifact matrix: exit ${artifactTrace.code}, register pin ${artifactRegisterPin === undefined ? "event MISSING (the pin did not run)" : "ran (event from the guard)"}, ` +
        `${artifactIds.length} scenario EVENTS (all passed) vs the ledger's ${ledger.scenarios.completing.length}; ` +
        `corrupt stream lines ${artifactTrace.corruptLines.length}; printed vs events: ` +
        `${printedMatchEvents(artifactTrace, artifactScenarioEvents) ? "one-to-one" : "MISMATCH"} ` +
        `(printed green ${artifactPrintedGreen} / red ${artifactPrintedRed})`,
    );
    if (artifactTrace.corruptLines.length > 0) {
      console.error(`    corrupt event stream: ${artifactTrace.corruptLines.slice(0, 3).join(" | ")}`);
    }

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
        behaviorTrace.corruptLines.length === 0 &&
        noDuplicates([...behaviorFailedIds, ...behaviorPauseIds]) &&
        sameSet(behaviorFailedIds, ledger.scenarios.completing) &&
        sameSet(behaviorPauseIds, ledger.scenarios.overLimit) &&
        printedMatchEvents(behaviorTrace, behaviorScenarioEvents) &&
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
        `corrupt stream lines ${behaviorTrace.corruptLines.length}; printed vs events: ` +
        `${printedMatchEvents(behaviorTrace, behaviorScenarioEvents) ? "one-to-one" : "MISMATCH"} ` +
        `(printed green ${behaviorPrintedGreen} / red ${behaviorPrintedRed})`,
    );
    if (behaviorTrace.corruptLines.length > 0) {
      console.error(`    corrupt event stream: ${behaviorTrace.corruptLines.slice(0, 3).join(" | ")}`);
    }
  } finally {
    rmSync(eventDir, { recursive: true, force: true });
  }

  console.log(`\n==== g6 negative-coverage audit summary: ${passed} passed, ${failed} failed ====`);
  console.log(`(R13-H1/R14-H1/R15-H5: the ledger's independent consumer — own seal recomputation + wrapper probe + four entries verified by structured EXECUTION EVENTS, cross-checked against printed lines, stdout+stderr merged)`);
  if (failed > 0) process.exit(1);
})();
