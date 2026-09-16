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
import { dumpRubyYaml, parseRubyYaml, LoopManifestYamlError, type YamlValue } from "../core/loop-manifest-yaml";

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
    void value;
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
    // The family's other member: a break-terminated block whose value ends
    // with LS/PS after an LF (ruby: `|+ …` + document-end marker; ours: clip).
    // Declared residual - cite the R8 unreachability proof (the publisher
    // pipeline JSON-escapes U+2028/U+2029, so raw LS/PS cannot reach it, and
    // shell `$(...)` strips trailing newlines).
    const breakTerminated = "x\n" + LS;
    const btEmit = dumpRubyYaml({ title: breakTerminated });
    ok(
      btEmit.includes("|") && !btEmit.includes("|+"),
      "the break-terminated member of the keep-chomp family is emitted as clip (declared residual)",
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

  console.log("G5-T5 — RESIDUAL TABLE (each entry: shape boundary | behaviour truth | reachability)");
  // Registered per R8/R9 rulings. Each entry is EXECUTED so that "declaration
  // matches implementation" is machine-checked rather than a comment.
  {
    // (1) keep-chomp family - approved for registration by the R9 §6-A ruling.
    //   shape:   a value ruby serializes with `|+` + `...` (multi trailing breaks)
    //   truth:   byte-different (we emit clip) AND no trailing-break round-trip
    //   reach:   unreachable - the publisher pipeline JSON-escapes U+2028/U+2029
    //            to literal \\u2028 text and shell `$(...)` strips trailing newlines
    const kcValue = `l1\nx${LS}${LS}`;
    const kcEmit = dumpRubyYaml({ title: kcValue });
    ok(!kcEmit.includes("|+") && kcEmit.includes("|"), "residual(1) keep-chomp: we emit clip, ruby emits |+ (byte difference)");
    ok((parseRubyYaml(kcEmit) as { title: string }).title !== kcValue,
      "residual(1) keep-chomp: the trailing break count does not round-trip (declared)");

    // (2) N8 - three or more trailing LFs.
    //   shape:   value ending with 3+ LF (with or without LS)
    //   truth:   byte-different (ruby `|+`, we double-quoted); value EXACT both ways
    //   reach:   unreachable in natural operation; constructible via declaration
    //            JSON, where the value stays exact and the digest net is fail-closed
    const n8 = "ab\n\n\n";
    const n8Emit = dumpRubyYaml({ title: n8 });
    ok(!n8Emit.includes("|+") && n8Emit.startsWith('---\ntitle: "'),
      "residual(2) N8: 3+ trailing LFs take double quotes here, `|+` in ruby (byte difference)");
    ok((parseRubyYaml(n8Emit) as { title: string }).title === n8,
      "residual(2) N8: the value is exact in both directions (byte-only difference)");

    // (3) a space immediately before a trailing single LF, with an LS earlier.
    //   shape:   <content><LS><content><space><LF>
    //   truth:   we emit single-quoted, ruby double-quoted; OUR read is exact,
    //            but ruby reading our bytes loses the pre-LF space
    //            (cross-face value corruption, one direction only)
    //   reach:   unreachable - the shape requires a raw LS, which the publisher
    //            pipeline JSON-escapes
    const preLfSpace = `a${LS}b \n`;
    const preLfEmit = dumpRubyYaml({ k: preLfSpace });
    ok(!preLfEmit.includes('"') && preLfEmit.includes("'"),
      "residual(3) pre-LF space: single-quoted here vs double-quoted (\\L) in ruby");
    ok((parseRubyYaml(preLfEmit) as { k: string }).k === preLfSpace,
      "residual(3) pre-LF space: our own read-back is exact (self-consistent)");

    // (4) historical reading gaps (R2-era, closed vocabulary makes them unreachable).
    ok(
      JSON.stringify(parseRubyYaml("---\n'a: b': 1\n")) !== JSON.stringify({ "a: b": 1 }),
      "residual(4a) colon-bearing quoted key: mis-split at the first colon (historical gap, declared)",
    );
    // residual(4b) — R10-RC3-1(c) truthful registration (three elements):
    //   shape:   a seq-item whose FIRST VALUE is a NON-EMPTY MAPPING
    //            ({l:[{a:{x:1,b:2}}]}); scalar first values are NOT affected
    //            (probe12 byteEQ + both reads exact).
    //   truth:   we FLATTEN the nested mapping (`- a:\n  x: 1\n  b: 2` — the
    //            continuation indent is 2, ruby uses 4) and BOTH our reader and
    //            ruby cross-reading our bytes silently corrupt the value to
    //            {a: null, x: 1, b: 2} — the most severe dual-direction silent
    //            corruption on the residual surface.
    //   reach:   unreachable - entries.node / finding_id / sequence first keys
    //            are always scalars in the frozen manifest schema (verified
    //            against the projector field domain).
    ok(
      JSON.stringify(parseRubyYaml("---\nl:\n- a: 1\n  b: 2\n")) === JSON.stringify({ l: [{ a: 1, b: 2 }] }),
      "residual(4b) scalar first values: the normal shape is correct (probe12 byteEQ)",
    );
    const flatMapped = dumpRubyYaml({ l: [{ a: { x: 1, b: 2 } }] });
    ok(
      flatMapped === "---\nl:\n- a:\n  x: 1\n  b: 2\n",
      "residual(4b) non-empty mapping first value: we flatten the nested mapping (declared shape)",
    );
    ok(
      JSON.stringify(parseRubyYaml(flatMapped)) === JSON.stringify({ l: [{ a: null, x: 1, b: 2 }] }),
      "residual(4b) DUAL-DIRECTION silent corruption: {a:{x:1,b:2}} reads back as {a:null,x:1,b:2} (declared truth)",
    );
    ok(
      (parseRubyYaml("---\nk: 1.5\n") as { k: unknown }).k === "1.5",
      "residual(4c) float/null literals read as strings (historical gap, declared: the manifest has no such fields)",
    );

    // (4a execution-position extension, adopted with R10 suggestion 1): the
    // same first-colon mis-split holds at seq-item and chain-head positions
    // and for quoted scalar sequence items.
    ok(
      JSON.stringify(parseRubyYaml("---\nl:\n- 'a: b': 1\n")) !== JSON.stringify({ l: [{ "a: b": 1 }] }),
      "residual(4a) extended: colon-bearing quoted key mis-splits at a seq-item position (declared)",
    );
    ok(
      JSON.stringify(parseRubyYaml("---\nl:\n- a: 1\n- b: 2\n")) === JSON.stringify({ l: [{ a: 1 }, { b: 2 }] }),
      "residual(4a) extended: plain scalar sequence items read as mapping values (probe-verified; the mis-split affects only QUOTED colon-bearing keys)",
    );
    ok(
      JSON.stringify(parseRubyYaml("---\nl:\n- 'a: b'\n")) === JSON.stringify({ l: [{ "'a": "b'" }] }),
      "residual(4a) extended: a QUOTED scalar sequence item is mis-split at the first colon (same root as 4a, declared)",
    );

    // (5) family A - R10-RC3-1(a): a NULL first element inside nested
    //     sequences (seq-item mapping value / chain-head mapping value
    //     positions).
    //   shape:   {l:[{a:[null]}]} and deeper nestings ({l:[[{a:[null]}]]}).
    //   truth:   at flat seq-item positions our emission is byte-identical
    //            with ruby; at nested seq-HEAD positions the emission differs
    //            (`-\n  -` vs `- -`); ruby ALWAYS reads the bytes fine; OUR
    //            reader ALWAYS fails closed (LoopManifestYamlError: expected
    //            'key: value'). Same behaviour on the r7/r8/r9/r10 heads =
    //            R2-era, not a regression.
    //   reach:   unreachable - the frozen manifest schema has no null sequence
    //            elements (null appears only as mapping values); fail-closed
    //            is the safe direction.
    const famA = { l: [{ a: [null] }] };
    const famAEmit = dumpRubyYaml(famA);
    ok(
      famAEmit === "---\nl:\n- a:\n  -\n",
      "residual(5) family A flat position: emission captured (this form byte-identical with ruby, probe-verified)",
    );
    let famASelfRead = "ok";
    try {
      parseRubyYaml(famAEmit);
    } catch (error) {
      famASelfRead = error instanceof LoopManifestYamlError ? "fail-closed" : "other";
    }
    ok(famASelfRead === "fail-closed", "residual(5) family A: our reader fails closed (declared, R2-era)");

    // (6) family B - R10-RC3-1(b): QUOTED KEYS at seq-item mapping / chain-
    //     head positions (YAML 1.1 boolean words y/n/yes, space-bearing keys).
    //   shape:   {l:[{y:1}]} / {l:[[{y:1}]]} / {z:[{n:"x"}]} / {l:[{"a b":1}]}.
    //   truth:   flat seq-item emission is byte-identical with ruby (`- "y": 1`
    //            — we quote exactly like ruby); nested seq-HEAD emission
    //            differs (`-\n  -` vs `- -`); ruby reads fine; OUR reader
    //            FAILS CLOSED on boolean-word keys ("unterminated quoted
    //            scalar", R2-era) — while space-bearing keys read back EXACT
    //            (probed R5 rework, value-faithful).
    //   reach:   unreachable - the manifest key vocabulary is all snake_case
    //            (no boolean-word or space-bearing keys anywhere in the
    //            frozen schema).
    const famB = { l: [{ y: 1 }] };
    const famBEmit = dumpRubyYaml(famB);
    ok(
      famBEmit === "---\nl:\n- \"y\": 1\n",
      "residual(6) family B flat position: emission quotes exactly like ruby (probe-verified)",
    );
    let famBSelfRead = "ok";
    try {
      parseRubyYaml(famBEmit);
    } catch (error) {
      famBSelfRead = error instanceof LoopManifestYamlError ? "fail-closed" : "other";
    }
    ok(famBSelfRead === "fail-closed", "residual(6) family B boolean-word key: our reader fails closed (declared, R2-era)");
    ok(
      JSON.stringify(parseRubyYaml(dumpRubyYaml({ l: [{ "a b": 1 }] }))) === JSON.stringify({ l: [{ "a b": 1 }] }),
      "residual(6) family B space-bearing key: reads back value-exact (probed, not fail-closed)",
    );
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
