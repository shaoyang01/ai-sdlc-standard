// G6 / D-090-04 — instrument presence (R15 review suggestion, non-blocking)
// ============================================================================
// R15's reviewer observed that deleting the coverage auditor from the suite
// silently removed its evidence: the full run reported 171 files and the
// failure list was unchanged (the by-design red matrix), so the auditor's
// evidence vanished without a signal. This file is the suite's own presence
// pin for the acceptance instrument's files — a deleted auditor, ledger,
// guard, event stream, matrix or negative suite now fails the full run.

import { existsSync } from "node:fs";
import { join } from "node:path";

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

console.log("G6 acceptance-instrument presence pin (R15 suggestion)");

const ROOT = process.cwd();
const required: readonly { label: string; path: string }[] = [
  { label: "negative-coverage auditor", path: "tests/g6-negative-coverage-audit.test.ts" },
  { label: "frozen ledger (sealed data)", path: "tests/g6-parity/frozen-ledger.json" },
  { label: "ledger guard (seal + wrapper)", path: "tests/g6-parity/ledger-guard.ts" },
  { label: "event stream (execution events)", path: "tests/g6-parity/event-stream.ts" },
  { label: "artifact matrix runner", path: "tests/g6-parity-matrix.test.ts" },
  { label: "behavior matrix runner", path: "tests/g6-parity-behavior-matrix.test.ts" },
  { label: "behavior negative suite", path: "tests/g6-parity-behavior-negative.test.ts" },
  { label: "comparator negative suite", path: "tests/g6-parity-comparator-negative.test.ts" },
];
for (const item of required) {
  ok(existsSync(join(ROOT, item.path)), `instrument file present: ${item.label} (${item.path})`);
}

console.log(`\n==== g6 instrument presence summary: ${passed} passed, ${failed} failed ====`);
if (failed > 0) process.exit(1);
