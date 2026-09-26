// G6 / D-090-04 — execution-event stream (R15-H5)
// ============================================================================
// R15-H5's root cause: the auditor verified ASSERTIONS AND SCENARIOS by
// counting the ✓/✗ text lines the audited entries printed — and only kept
// stdout on the success path. Both are properties of the audited code's
// OUTPUT, not of its EXECUTION: a runner that prints one extra green line
// (53 real assertions + 1 fabricated line) or writes a red assertion after
// the settle still settled green.
//
// The fix: the instrument emits STRUCTURED EVENTS at the points where
// assertions and scenarios are actually evaluated (the shared handle's ok /
// the matrices' per-scenario judge), and the auditor verifies those events
// against the sealed ledger. A printed line without a backing event is now
// itself a failure (the auditor cross-checks print counts against event
// counts). The stream is env-gated (G6_EVENT_STREAM) — normal runs are
// unaffected.
//
// Honest boundary (single repository): events are still emitted by audited
// code, so this is tamper-EVIDENT, not tamper-PROOF — a deliberate editor
// can append consistent records (the reviewer's event-forge probe passed by
// design: a 49-scenario run plus one appended scenario event, one register-
// pin event and one matching printed line reads as a coherent 50/50). What
// this layer buys is that every fabricated record must stay consistent with
// the printed lines and the sealed ledger, line by line. The review process
// re-runs the false-green probes each round.

import { appendFileSync } from "node:fs";

/** One structured execution event (NDJSON, one per line). */
export interface ExecutionEvent {
  readonly t: "assert" | "group" | "settle" | "scenario" | "pin";
  readonly suite: string;
  readonly [key: string]: unknown;
}

/**
 * Appends one event to the auditor's stream when G6_EVENT_STREAM names a
 * file. Never throws: an unusable path must not take down the audited run
 * (the auditor detects the missing/empty stream).
 */
export function emitEvent(event: ExecutionEvent): void {
  const path = process.env.G6_EVENT_STREAM;
  if (path === undefined || path === "") return;
  try {
    appendFileSync(path, `${JSON.stringify(event)}\n`, "utf8");
  } catch {
    // intentional: the stream is audit instrumentation, not run output
  }
}
