// G5-T5: YAML byte-parity matrix — every form class from the G5-T2-R1
// 17-shape table plus the probe-derived edge shapes, pinned against
// Ruby 3.3.12 / Psych 5.1.2 EXPECTED BYTES captured verbatim from
// `YAML.dump` probes (the goldens below are independent constants, not
// outputs of the emitter under test). The residual-table rule: every case
// here must be byte-identical to the reference interpreter.
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
const NEL = "\u0085";

/** Expected full-document bytes for `{ k: <value> }`. */
function expectBytes(value: string, expected: string, label: string): void {
  const actual = dumpRubyYaml({ k: value });
  ok(
    actual === expected,
    `${label}: ${actual === expected ? "byte-identical" : `MISMATCH actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`}`,
  );
}

/** Expected full-document bytes for an arbitrary top-level document. */
function expectDoc(doc: { readonly [key: string]: YamlValue }, expected: string, label: string): void {
  const actual = dumpRubyYaml(doc);
  ok(
    actual === expected,
    `${label}: ${actual === expected ? "byte-identical" : `MISMATCH actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`}`,
  );
}

/** The emitter's output must parse back to the exact input string. */
function expectRoundTrip(value: string, label: string): void {
  const text = dumpRubyYaml({ k: value });
  const parsed = parseRubyYaml(text) as { k: string };
  ok(parsed.k === value, `${label}: round-trip preserves the string`);
}

function main(): void {
  console.log("G5-T5 parity matrix — leading indicators force double quotes");
  for (const [label, form] of [
    ["-lead", "-foo"], ["?-lead", "?foo"], [":-lead", ":foo"],
    ["dash-space", "- foo"], ["comma", ",x"], ["bracket", "[x"], ["brace", "{x"],
    ["hash", "#x"], ["amp", "&x"], ["star", "*x"], ["bang", "!x"],
    ["pipe", "|x"], ["gt", ">x"], ["pct", "%x"], ["at", "@x"],
    ["backtick", "`x"], ["pre-quoted", "'quoted'"],
    ["lone-dash", "-"], ["lone-?", "?"], ["lone-:", ":"],
    ["dot-lead-word", ".hidden"], ["plus-lead-word", "+abc"], ["tilde-lead-word", "~foo"],
  ] as const) {
    expectBytes(form, `---\nk: "${form}"\n`, label);
  }

  console.log("G5-T5 parity matrix — numeric / bool resolvable forms");
  for (const [label, form] of [
    ["neg1", "-1"], ["plus1", "+1"], ["neg05", "-0.5"], ["neg15", "-1.5"],
    ["neg0", "-0"], ["plus123", "+123"], ["dot5", ".5"], ["inf", ".inf"],
    ["neginf", "-.inf"], ["plusinf", "+.inf"], ["dotINF", ".INF"], ["nan", ".nan"],
    ["tilde", "~"], ["lone-dot", "."],
  ] as const) {
    expectBytes(form, `---\nk: "${form}"\n`, label);
  }
  for (const [label, form] of [
    ["int42", "42"], ["zero", "0"], ["lead0", "007"], ["lead017", "017"],
    ["float15", "1.5"], ["true", "true"], ["True", "True"], ["yes", "yes"],
    ["no", "no"], ["on", "on"], ["off", "off"], ["sex12", "1:2"],
    ["sex123", "1:2:3"], ["sexlegal", "12:34"], ["ts1", "2026-09-14"],
    ["ts2", "2026-09-14T10:00:00Z"], ["broknoct", "094fe8b3"],
    ["hex1f", "0x1F"], ["bin", "0b11"], ["underscore", "1_000"],
    ["underscore-float", "1_000.5"], ["dot-end", "1."],
  ] as const) {
    expectBytes(form, `---\nk: '${form}'\n`, label);
  }
  for (const [label, form] of [
    ["y", "y"], ["n", "n"],
  ] as const) {
    expectBytes(form, `---\nk: "${form}"\n`, label);
  }
  for (const [label, form] of [
    ["Y", "Y"], ["N", "N"], ["e3", "1e3"], ["float-e3", "1.5e3"],
    ["oct0o", "0o17"], ["sexillegal", "12:99"], ["sex-bad2", "12:60"],
    ["sex-bad3", "1:2:60"], ["underscore-lead", "_1"],
  ] as const) {
    expectBytes(form, `---\nk: ${form}\n`, label);
  }

  console.log("G5-T5 parity matrix — plain mid-string indicators");
  for (const [label, form] of [
    ["apos-mid", "it's"], ["dquote-mid", 'say "hi"'], ["question-mid", "a?b"],
    ["colon-mid", "a:b"], ["dash-mid", "a-b"], ["dot-mid", "a.b"],
    ["plus-mid", "a+b"], ["yes-mid", "ayes"], ["nbsp", "a\u00a0b"],
    ["u00a1", "a\u00a1b"], ["u1000", "a\u1000b"],
  ] as const) {
    expectBytes(form, `---\nk: ${form}\n`, label);
  }
  expectBytes("'say \"hi\"'", "---\nk: '''say \"hi\"'''\n", "both-quotes single-doubled");
  expectBytes("a ", "---\nk: 'a '\n", "trailing space single");
  expectBytes("a\t", '---\nk: "a\\t"\n', "trailing tab double");
  expectBytes(" a", '---\nk: " a"\n', "leading space double");
  expectBytes("", "---\nk: ''\n", "empty single");
  expectBytes("a\tb", '---\nk: "a\\tb"\n', "mid tab double");

  console.log("G5-T5 parity matrix — escape forms (uppercase hex, shorthand names)");
  expectBytes("a\x01b", '---\nk: "a\\x01b"\n', "ctl 0x01");
  expectBytes("a\x7fb", '---\nk: "a\\x7Fb"\n', "DEL uppercase hex");
  expectBytes("a\x00b", '---\nk: "a\\0b"\n', "NUL shorthand");
  expectBytes("a\x07b", '---\nk: "a\\ab"\n', "BEL shorthand");
  expectBytes("a\x08b", '---\nk: "a\\bb"\n', "BS shorthand");
  expectBytes("a\x0bb", '---\nk: "a\\vb"\n', "VT shorthand");
  expectBytes("a\x0cb", '---\nk: "a\\fb"\n', "FF shorthand");
  expectBytes("a\x1bb", '---\nk: "a\\eb"\n', "ESC shorthand");
  expectBytes("a\x80b", '---\nk: "a\\x80b"\n', "C1 0x80");
  expectBytes("a\x9eb", '---\nk: "a\\x9Eb"\n', "C1 0x9E");
  expectBytes(`a${NEL}b`, '---\nk: "a\\Nb"\n', "NEL shorthand");
  expectBytes("a\U0001F600b".replace("U0001F600", "\u{1F600}"), '---\nk: "a\\U0001F600b"\n', "astral uppercase 8-hex");
  expectBytes("a\u{10000}b", '---\nk: "a\\U00010000b"\n', "astral U+10000");

  console.log("G5-T5 parity matrix — Unicode line separators (single + continuation)");
  expectBytes(`a${LS}b`, `---\nk: 'a${LS}  b'\n`, "LS mid");
  expectBytes(`a${PS}b`, `---\nk: 'a${PS}  b'\n`, "PS mid");
  expectBytes(`a${LS}b${LS}c`, `---\nk: 'a${LS}  b${LS}  c'\n`, "LS multiple");
  expectBytes(`ab${LS}`, `---\nk: 'ab${LS}  '\n`, "LS tail keeps the continuation indent");

  console.log("G5-T5 parity matrix — embedded LF: block literals and fallbacks");
  expectBytes("a\nb", "---\nk: |-\n  a\n  b\n", "clean block strip");
  expectBytes("x\ny\nz", "---\nk: |-\n  x\n  y\n  z\n", "three-line block");
  expectBytes("x\ny\n", "---\nk: |\n  x\n  y\n", "trailing LF clip block");
  expectBytes("a\n\nb", "---\nk: |-\n  a\n\n  b\n", "interior empty line");
  expectBytes("a\n\n\nb", "---\nk: |-\n  a\n\n\n  b\n", "two interior empty lines");
  expectBytes(" a\nb", "---\nk: |2-\n   a\n  b\n", "first-line leading space -> explicit indent");
  expectBytes("\nab", "---\nk: |2-\n\n  ab\n", "empty first line -> explicit indent");
  expectBytes("a\n b", "---\nk: |-\n  a\n   b\n", "later-line leading space preserved");
  expectBytes("a\n\tb", '---\nk: "a\\n\\tb"\n', "tab on line -> double escapes");
  expectBytes("a\nb \nc", '---\nk: "a\\nb \\nc"\n', "trailing space on line -> double escapes");
  expectBytes("\n", '---\nk: "\\n"\n', "LF only -> double escapes");

  console.log("G5-T5 parity matrix — line folding past column 80");
  const words20 = Array.from({ length: 20 }, () => "word").join(" ");
  expectBytes(
    words20,
    "---\nk: " + Array.from({ length: 16 }, () => "word").join(" ") + "\n  " + Array.from({ length: 4 }, () => "word").join(" ") + "\n",
    "plain fold at column 80 (16+4 words)",
  );
  const longQuoted = "'" + words20;
  expectBytes(
    longQuoted,
    '---\nk: "' + longQuoted.slice(0, 1 + 16 * 5 - 1) + "\n  " + longQuoted.slice(1 + 16 * 5) + '"\n',
    "double-quoted fold (leading quote form)",
  );
  expectDoc(
    { outer: { inner: words20 } },
    "---\nouter:\n  inner: " + Array.from({ length: 15 }, () => "word").join(" ") + "\n    " + Array.from({ length: 5 }, () => "word").join(" ") + "\n",
    "nested fold indent = owning indent + 2",
  );
  expectDoc(
    { l: [words20] },
    "---\nl:\n- " + Array.from({ length: 16 }, () => "word").join(" ") + "\n  " + Array.from({ length: 4 }, () => "word").join(" ") + "\n",
    "sequence item fold",
  );

  console.log("G5-T5 parity matrix — compact nested sequences");
  assert.ok(true);
  {
    const actual = dumpRubyYaml({ l: [["a", "b"], ["c"]] } as never);
    ok(actual === "---\nl:\n- - a\n  - b\n- - c\n", `nested sequences compact (got ${JSON.stringify(actual)})`);
  }

  console.log("G5-T5 parity matrix — nested block literal carries the deeper indent");
  {
    const actual = dumpRubyYaml({ outer: { inner: "x\ny\nz" } } as never);
    ok(actual === "---\nouter:\n  inner: |-\n    x\n    y\n    z\n", `nested block literal (got ${JSON.stringify(actual)})`);
  }

  console.log("G5-T5 parity matrix — round-trips through the strict reader");
  for (const [label, form] of [
    ["block strip", "a\nb"], ["block three lines", "x\ny\nz"], ["block clip", "x\ny\n"],
    ["block interior empty", "a\n\nb"], ["block explicit indent", " a\nb"],
    ["double escapes", "a\n\tb"], ["double trailing space line", "a\nb \nc"],
    ["LS mid", `a${LS}b`], ["LS multiple", `a${LS}b${LS}c`],
    ["NEL escape", `a${NEL}b`], ["escapes", "a\x01b\tc\rd"],
    ["fold plain", words20], ["fold quoted", longQuoted],
    ["underscore int", "1_000"], ["broken octal", "094fe8b3"],
  ] as const) {
    expectRoundTrip(form, label);
  }

  console.log(`\ng5t5-matrix: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
