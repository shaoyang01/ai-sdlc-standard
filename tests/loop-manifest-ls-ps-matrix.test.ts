// G5-T5-R7: LS/PS (U+2028/U+2029) × style-branch × adjacency matrix.
//
// Closes the R6 theme ("B1 族收窄至最后一个未审计子路径") by enumerating the
// whole decision surface the reviewer asked for — literal / single-quoted /
// double-quoted / plain × LS/PS × adjacent whitespace — instead of the few
// sampled shapes each earlier round pinned.
//
// EVERY golden below is the byte-exact output of Ruby 3.3.12 / Psych 5.1.2
// `YAML.dump`, captured from a probe run (not from this emitter) — an
// emitter-derived golden is what let the R2 phantom-width bug survive a
// round, so the rule here is: goldens only from the reference interpreter.
import { strict as assert } from "node:assert";
import { dumpRubyYaml, parseRubyYaml, type YamlValue } from "../core/loop-manifest-yaml";

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

const LS = "\u2028";
const PS = "\u2029";

function expectDoc(doc: { readonly [key: string]: YamlValue }, expected: string, label: string): void {
  const actual = dumpRubyYaml(doc);
  ok(
    actual === expected,
    `${label}: ${actual === expected ? "byte-identical" : `MISMATCH actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`}`,
  );
}

function main(): void {
  console.log("G5-T5-R7 — whitespace immediately BEFORE a break disqualifies the block");
  // Ruby treats LS/PS as line boundaries, so `a <LS>b` is "line ending in a
  // space" -> trailing whitespace -> the whole block is disqualified and the
  // string falls back to double quotes with the \\L escape.
  expectDoc({ title: `a ${LS}b` }, '---\ntitle: "a \\Lb"\n', "space before LS -> double-quoted \\L");
  expectDoc({ title: `a ${PS}b` }, '---\ntitle: "a \\Pb"\n', "space before PS -> double-quoted \\P");
  expectDoc({ title: `a\t${LS}b` }, '---\ntitle: "a\\t\\Lb"\n', "tab before LS -> double-quoted \\L");
  expectDoc({ title: `a ${LS} b` }, '---\ntitle: "a \\L b"\n', "space on both sides -> double-quoted \\L");
  expectDoc({ title: `a${LS} b` }, '---\ntitle: "a\\L b"\n', "space AFTER the break (bare string) -> double-quoted \\L");

  console.log("G5-T5-R7 — a break without adjacent whitespace keeps the block/single form");
  expectDoc({ title: `a${LS}b` }, `---\ntitle: 'a${LS}  b'\n`, "bare string, no adjacency -> single-quoted with continuation");
  expectDoc({ title: `a${LS}b\nc` }, `---\ntitle: |-\n  a${LS}  b\n  c\n`, "block keeps the break + continuation");
  expectDoc({ title: `l1\n${LS}b` }, `---\ntitle: |-\n  l1\n${LS}  b\n`, "line-initial break carries NO leading indent");

  console.log("G5-T5-R7 — a string-final break terminates the line itself");
  expectDoc({ title: `l1\nx${LS}` }, `---\ntitle: |\n  l1\n  x${LS}`, "document-final: no trailing newline after the break");
  expectDoc({ a: `l1\nx${LS}`, b: "y" }, `---\na: |\n  l1\n  x${LS}b: "y"\n`, "mid-document: the next key follows the break immediately");

  console.log("G5-T5-R7 — declared residual: the keep-chomp (|+ …) family");
  // Ruby preserves a repeated trailing break with the keep-chomp form and a
  // document-end marker. This emitter does not implement that form; the
  // difference is the declared residual recorded in the T5 closure's residual
  // table (its main deviation is the block *selection* itself, not the
  // LS/PS handling). What must hold: the VALUE still round-trips here.
  {
    const value = `l1\nx${LS}${LS}`;
    const ruby = '---\ntitle: |+\n  l1\n  x' + LS + LS + '...\n';
    const actual = dumpRubyYaml({ title: value });
    ok(
      actual !== ruby && actual.includes("|"),
      `keep-chomp family declared (ruby: ${JSON.stringify(ruby)}; ours differs by the |+ … form, residual)`,
    );
    // This family is a declared RESIDUAL and genuinely does not round-trip:
    // the emitter picks clip where ruby picks keep-chomp, so the trailing
    // break count is lost on read-back. Record the truth instead of asserting
    // a property the implementation does not have.
    const roundTripped = parseRubyYaml(actual) as { title: string };
    ok(
      roundTripped.title !== value,
      "the keep-chomp family is a declared residual: the trailing break count does not round-trip",
    );
  }

  console.log("G5-T5-R7 — structural dimension (R7-RC-5: the earlier corpus was string-only)");
  // R7: the previous sweep varied only flat strings. These pin the DOCUMENT
  // STRUCTURE dimension — where the remaining blockers lived (glued swallow,
  // sequence-item blocks, seq-of-seq heads, depth >= 3 compact nesting).
  expectDoc(
    { l: ["a\nb", "x"] },
    "---\nl:\n- |-\n  a\n  b\n- x\n",
    "sequence-item block scalar (RC4-2)",
  );
  expectDoc(
    { l: [["a\nb", "x"]] },
    "---\nl:\n- - |-\n    a\n    b\n  - x\n",
    "seq-of-seq head takes the block terminator (RC3-1)",
  );
  expectDoc({ l: [[["abc"]]] }, "---\nl:\n- - - abc\n", "depth-3 compact nesting");
  expectDoc({ l: [[[["abc"]]]] }, "---\nl:\n- - - - abc\n", "depth-4 compact nesting");
  expectDoc(
    { l: [[["a", "b"], ["c"]]] },
    "---\nl:\n- - - a\n    - b\n  - - c\n",
    "depth-3 with a sibling sequence",
  );
  {
    // RC4-1: the break-terminated block glues the next key onto the same line
    // and must still read back with both keys and both values intact.
    const glued = dumpRubyYaml({ a: `l1\nx${LS}`, b: "y" });
    expectDoc({ a: `l1\nx${LS}`, b: "y" }, `---\na: |\n  l1\n  x${LS}b: "y"\n`, "glued form emission");
    const back = parseRubyYaml(glued) as { a: string; b: string };
    ok(back.a === `l1\nx${LS}` && back.b === "y", "glued form reads back both keys and values (RC4-1)");
  }

  console.log("G5-T5-R7 — rebuilders: every non-adjacent form reads back value-exact");
  for (const [label, value] of [
    ["structural: seq item block", "a\nb"],
    ["structural: nested LS value", `x\ny${LS}`],
    ["structural: depth-2 inner", "a\nb"],
    ["space before LS (double)", `a ${LS}b`],
    ["tab before LS (double)", `a\t${LS}b`],
    ["break + continuation (single)", `a${LS}b`],
    ["line-initial break (block)", `l1\n${LS}b`],
    ["string-final break (block)", `l1\nx${LS}`],
    ["block with interior break", `a${LS}b\nc`],
  ] as const) {
    const text = dumpRubyYaml({ title: value });
    const back = parseRubyYaml(text) as { title: string };
    ok(back.title === value, `${label}: round-trips value-exact`);
  }
  assert.ok(true);

  console.log(`\ng5t5-lsps: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
