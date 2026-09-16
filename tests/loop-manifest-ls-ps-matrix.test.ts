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
import { execFileSync } from "node:child_process";
import { dumpRubyYaml, parseRubyYaml, LoopManifestYamlError, type YamlValue } from "../core/loop-manifest-yaml";

let passed = 0;
let failed = 0;
/** LIVE ruby reference for a whole document — never a baked golden. */
function rubyDumpFor(mapping: Record<string, YamlValue>): string {
  return execFileSync("ruby", ["-ryaml", "-rjson", "-e", 'puts YAML.dump(JSON.parse(STDIN.read))'], {
    input: JSON.stringify(mapping),
  }).toString();
}

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
    //   shape:   {l:[{a:[null]}]} and deeper nestings ({l:[[{a:[null]}]]},
    //            depth >= 3, null-only / mixed elements — R11 verified 7/7
    //            forms BYTE-EQ).
    //   truth (R11-corrected layered history; the R10 registration claiming
    //   "nested seq-HEAD emission differs" and an undifferentiated
    //   "same behaviour on the r7..r10 heads" were BOTH false):
    //     - flat seq-item AND chain-head positions: our emission is
    //       byte-identical with ruby and our reader fails closed
    //       (LoopManifestYamlError: expected 'key: value') — identical on
    //       all four heads, R2-era;
    //     - nested seq-HEAD positions: the r7 head crashed UNCONTROLLED
    //       (TypeError from the emitter), the r8 head emitted DIFF bytes
    //       with the null sequence silently truncated (self-read "ok" —
    //       content loss invisible), and the r9 head onward is BYTE-EQ +
    //       fail-closed (fixed during R8/R9).
    //   reach:   unreachable - the frozen manifest schema has no null sequence
    //            elements (null appears only as mapping values); fail-closed
    //            is the safe direction.
    const famA = { l: [{ a: [null] }] };
    const famAEmit = dumpRubyYaml(famA);
    ok(
      famAEmit === "---\nl:\n- a:\n  -\n",
      "residual(5) family A flat position: emission captured (byte-identical with ruby, probe-verified)",
    );
    let famASelfRead = "ok";
    try {
      parseRubyYaml(famAEmit);
    } catch (error) {
      famASelfRead = error instanceof LoopManifestYamlError ? "fail-closed" : "other";
    }
    ok(famASelfRead === "fail-closed", "residual(5) family A: our reader fails closed (R2-era, flat position)");

    // R5-B1-Ⅱ family A nested seq-HEAD forms: BYTE-EQ on the current head
    // (7/7 nested variants verified against ruby — R11 variant-1 correction:
    // the R10 registration claiming a nested emission difference was false).
    const famANested: Record<string, YamlValue>[] = [
      { l: [[{ a: [null] }]] },
      { l: [{ a: [{ b: [null] }] }] },
      { l: [[null]] },
      { l: [{ a: [null, 1] }] },
      { l: [[{ a: [null] }, { b: 1 }]] },
      { l: [{ a: [[null]] }] },
      { o: { i: { k: [null] } } },
    ];
    for (const doc of famANested) {
      ok(dumpRubyYaml(doc) === rubyDumpFor(doc), `residual(5) family A nested ${JSON.stringify(Object.keys(doc)[0]!)}: BYTE-EQ with ruby`);
    }

    // (6) family B - R10-RC3-1(b) / R11-RC1-1 variant 3: QUOTED KEYS at
    //     seq-item mapping / chain-head positions, classified EXHAUSTIVELY
    //     (R11 probe: emission is BYTE-EQ with ruby across all 15 key forms —
    //     the divergence is entirely in OUR reader's self-read).
    //   shape:   {l:[{<quoted-key>:1}]} — key forms below.
    //   truth (reader behaviour classes):
    //     a) resolver-sensitive keys (boolean words y/n/yes/no/true/false/
    //        on/off, numeric forms 1/1.5, ~) -> FAIL CLOSED
    //        (R2-era; class name widened per R11 — the R10 registration only
    //        said "boolean words");
    //     b) colon-TAIL / colon-HEAD keys (`ab:` / `:ab`) -> FAIL CLOSED;
    //     c) colon-WITHOUT-space keys (`a:b`) -> SILENT CORRUPTION: our bytes
    //        read back as a STRING ITEM {l:["a:b: 1"]} while ruby cross-reading
    //        our bytes is EXACT ({l:[{"a:b":1}]}) — the only class outside the
    //        fail-closed principle (R11-registered);
    //     d) space-bearing keys (`a b`) -> value-FAITHFUL (R5-probed).
    //   reach:   unreachable - the manifest key vocabulary is all snake_case
    //            (no boolean-word / numeric / colon-bearing / space-bearing
    //            keys anywhere in the frozen schema).
    const famB = { l: [{ y: 1 }] };
    const famBEmit = dumpRubyYaml(famB);
    ok(
      famBEmit === "---\nl:\n- \"y\": 1\n",
      "residual(6) family B flat position: emission quotes exactly like ruby (probe-verified)",
    );
    const resolverSensitive = ["y", "n", "yes", "no", "true", "false", "on", "off", "1", "1.5", "~"];
    for (const key of resolverSensitive) {
      let cls = "ok";
      try {
        parseRubyYaml(dumpRubyYaml({ l: [{ [key]: 1 }] }));
      } catch (error) {
        cls = error instanceof LoopManifestYamlError ? "fail-closed" : "other";
      }
      ok(cls === "fail-closed", `residual(6a) resolver-sensitive quoted key ${JSON.stringify(key)}: our reader fails closed (declared)`);
    }
    for (const key of ["ab:", ":ab"]) {
      let cls = "ok";
      try {
        parseRubyYaml(dumpRubyYaml({ l: [{ [key]: 1 }] }));
      } catch (error) {
        cls = error instanceof LoopManifestYamlError ? "fail-closed" : "other";
      }
      ok(cls === "fail-closed", `residual(6b) colon-tail/head quoted key ${JSON.stringify(key)}: our reader fails closed (declared)`);
    }
    {
      const colonNoSpace = dumpRubyYaml({ l: [{ "a:b": 1 }] });
      const selfValue = JSON.stringify(parseRubyYaml(colonNoSpace));
      ok(
        selfValue === JSON.stringify({ l: ["a:b: 1"] }),
        "residual(6c) colon-without-space quoted key: SILENT CORRUPTION to a string item (declared, R11)",
      );
      const rubyCross = execFileSync("ruby", ["-ryaml", "-rjson", "-e", 'puts JSON.generate(YAML.load(STDIN.read))'], {
        input: colonNoSpace,
      }).toString().trim();
      ok(
        rubyCross === JSON.stringify({ l: [{ "a:b": 1 }] }),
        "residual(6c) ruby cross-reading our bytes is EXACT (the corruption is one-sided, declared)",
      );
    }
    ok(
      JSON.stringify(parseRubyYaml(dumpRubyYaml({ l: [{ "a b": 1 }] }))) === JSON.stringify({ l: [{ "a b": 1 }] }),
      "residual(6d) family B space-bearing key: reads back value-exact (probed, not fail-closed)",
    );

    // (7) R10 suggestion 2 note (registered in situ): the rc2-values probe's
    //     "seq-of-seq-item block (3rd level)" form is rejected BY RUBY TOO —
    //     a ruby-same-reject shape, i.e. bidirectional fail-closed, NOT a
    //     divergence. Recorded here so later rounds do not misread it.
    ok(
      JSON.stringify(parseRubyYaml("---\nl:\n- a: 1\n  b: 2\n")) === JSON.stringify({ l: [{ a: 1, b: 2 }] }),
      "suggestion-2 note: normal seq-item map values stay exact; the 3rd-level block form is ruby-same-reject (bidirectional fail-closed, not a divergence)",
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
