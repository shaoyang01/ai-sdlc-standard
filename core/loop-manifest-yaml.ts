/**
 * G5-T2 (D-090-03 Δ1): deterministic YAML emitter — TS replica of the manual
 * publisher's Ruby `YAML.dump` (Psych 5.1.2) serialization, frozen decision
 * D-5 of the G5-T1 projection-semantics freeze document. The manifest
 * self-digest (contract §6.2.1) is sha256 over exactly this serialization, so
 * every byte is normative.
 *
 * Byte parity with the reference interpreter (Ruby 3.3.12 / Psych 5.1.2) is
 * probe-verified per shape class; the G5-T5 parity matrix
 * (tests/loop-manifest-yaml-parity-matrix.test.ts) pins every probed form.
 * Rules (all probed, see the matrix for the exact expected bytes):
 *   - document header `---`; mappings indent at 2-space steps; sequence items
 *     sit AT their owning key's indent; nested sequences are compact
 *     (`- - a` / `  - b`); null prints as an empty value; empty map `{}`,
 *     empty array `[]`
 *   - a leading UNCONDITIONAL YAML indicator or `:` forces DOUBLE quotes;
 *     strings resolving to a scalar type (int, float, bool, sexagesimal,
 *     timestamp, broken octal, radix 0x/0b) get SINGLE quotes; exactly `y`/`n`
 *     get DOUBLE quotes (`Y`/`N` stay plain); a leading double quote always
 *     takes the double-escaped form; soft indicators (`-` `?` `+` `.` `~`)
 *     with a double quote inside stay PLAIN, while hard indicators with a
 *     double quote inside fall back to SINGLE (`:"y` / `!"z`); mid-string
 *     indicators (`it's`, `a:b`, `a #b` minus the space form) are plain;
 *     `: `/` #`/trailing-`:` single-quote; leading space or tab double-quote,
 *     trailing space single-quote
 *   - double-quote escapes: `\0 \a \b \t \n \v \f \r \e \" \\ \N` (NEL),
 *     `\xNN` / `\uNNNN` / `\UNNNNNNNN` with UPPERCASE hex (libyaml prints
 *     only #x20-#x7E, #xA0-#xD7FF, #xE000-#xFFFD raw; astral always escapes)
 *   - U+2028/U+2029 (no LF): single-quoted with the break written raw plus
 *     the continuation indent = owning indent + 2 (`a<LS>b` at top level ->
 *     `'a<LS>  b'`; deeper positions indent deeper — R3-B3)
 *   - embedded LF: clean block literals (`|-` strip / `|` clip / `|2` explicit
 *     indent when the first line starts with space); tabs or trailing spaces
 *     on any line fall back to double-quoted escapes; a single trailing LF
 *     falls back to the single-quoted fold form
 *   - line folding: when writing a space past column 80 (line start counts the
 *     `key: `/`- ` prefix), the space becomes a break plus the owning indent + 2
 */

export class LoopManifestYamlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoopManifestYamlError";
  }
}

/** Ordered-entry shape the emitter accepts: plain objects (insertion order). */
export type YamlValue =
  | null
  | boolean
  | number
  | string
  | { readonly [key: string]: YamlValue }
  | readonly YamlValue[];

// Leading characters that force DOUBLE quotes (probed: all YAML indicators
// plus the resolver-significant `+`/`.`/`~` prefixes — `+abc`, `.hidden` and
// `~foo` are double-quoted by the reference just like `-1` and `:foo`).
// ---------------------------------------------------------------------------
// Scalar style selection — a faithful TS port of the reference interpreter's
// decision chain (psych/visitors/yaml_tree.rb visit_String + psych/
// scalar_scanner.rb ScalarScanner, probed against Ruby 3.3.12 / Psych 5.1.2):
//   1. a break that is neither at the end nor just before one trailing break
//      -> LITERAL block
//   2. exactly "y"/"n" -> DOUBLE ("Y"/"N" are plain)
//   3. first character non-word ([^a-zA-Z0-9_]) and no '"' anywhere -> DOUBLE
//      (this is why `-foo` double-quotes while `-"hi` stays plain)
//   4. ScalarScanner#tokenize resolves the string to a non-String (number,
//      bool, null, date/time, symbol, sexagesimal) or it is a "broken octal"
//      -> SINGLE
//   5. otherwise PLAIN, with libyaml's plain-safety fallback (single-quoted
//      for `: `/` #`/trailing `:`/trailing space, double for tabs/controls,
//      single-fold for one trailing break)
// ---------------------------------------------------------------------------

const PSYCH_WORD = /[\p{L}\p{M}\p{Nd}\p{Pc}]/u;
const PSYCH_EARLY_STRING = /^[^\d.:-]?[a-zA-Z_\s!@#$%^&*(){}<>|/\\~;=]+/;
const PSYCH_TIME = /^-?\d{4}-\d{1,2}-\d{1,2}(?:[Tt]|\s+)\d{1,2}:\d\d:\d\d(?:\.\d*)?(?:\s*(?:Z|[-+]\d{1,2}:?(?:\d\d)?))?$/;
const PSYCH_FLOAT = /^[-+]?([0-9][0-9_,]*)?\.[0-9]*([eE][-+][0-9]+)?$/;
const PSYCH_INTEGER_LEGACY = /^[-+]?(?:0b[0-1_,]+|0[0-7_,]+|(?:0|[1-9](?:[0-9]|,[0-9]|_[0-9])*)|0x[0-9a-fA-F_,]+)$/;
const PSYCH_SEXAGESIMAL = /^[-+]?[0-9][0-9_]*(:[0-5]?[0-9]){1,2}$/;
const PSYCH_SEXAGESIMAL_FLOAT = /^[-+]?[0-9][0-9_]*(:[0-5]?[0-9]){1,2}\.[0-9_]*$/;
const PSYCH_BROKEN_OCTAL = /^0[0-7]*[89]/;

/** Psych parse_time/strptime are wrapped in `rescue ArgumentError -> String`:
 * month 0/13 and day 0/>=32 raise -> the scalar stays a String (plain); days
 * 1-31 normalise past the real calendar exactly like Time.utc (2019-02-29 ->
 * 2019-03-01 — R3-B2); hh==24 only as 24:00:00. */
function isLeapYear(y: number): boolean {
  return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
}
function validCalendarDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const perMonth = [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= perMonth[m - 1]!;
}
function timeScalarResolves(s: string): boolean {
  if (!PSYCH_TIME.test(s)) return false;
  const datePart = s.split(/[Tt]|\s+/)[0]!;
  const [y, m, d] = datePart.split("-").map((v) => Number(v));
  // Psych parse_time calls Time.utc(y, m, d, ...): month 1-12 and day 1-31
  // are ALL accepted — days normalise past the real calendar (2019-02-29 ->
  // 2019-03-01, 2020-04-31 -> 2020-05-01); only m=0/13 and d=0/>=32 raise
  // (R3-B2: the strict calendar check under-quoted the normalising forms).
  // The date-only path keeps the strict calendar (Date.strptime semantics).
  if (m === undefined || d === undefined || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const md = /(\d{1,2}):(\d\d):(\d\d)/.exec(s);
  if (md === null) return false;
  const hh = Number(md[1]);
  const mm = Number(md[2]);
  const ss = Number(md[3]);
  if (mm > 59 || ss > 60) return false;
  // Psych parse_time uses Time.utc: hh == 24 is legal only as 24:00:00
  // (it normalises to the next day); 24:00:01 / 24:01:00 raise ArgumentError
  // and stay Strings.
  if (hh === 24) return mm === 0 && ss === 0;
  return hh <= 23;
}
function dateScalarResolves(s: string): boolean {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m === null) return false;
  const day = m[3]!;
  // Psych's date regex admits 1-2 digit day up to 31; the calendar check is
  // what rejects 2020-02-31 and 1999-02-29.
  return validCalendarDate(Number(m[1]), Number(m[2]), Number(day));
}

/** ScalarScanner#tokenize: does the string resolve to a NON-String value? */
function tokenizeResolvesNonString(s: string): boolean {
  if (s === "") return true;
  if (PSYCH_EARLY_STRING.test(s) || s.includes("\n")) {
    if (s.length > 5) return false;
    if (/^[^ytonf~]/i.test(s)) return false;
    if (s === "~" || /^null$/i.test(s)) return true;
    if (/^(yes|true|on)$/i.test(s)) return true;
    if (/^(no|false|off)$/i.test(s)) return true;
    return false;
  }
  if (timeScalarResolves(s)) return true;
  if (dateScalarResolves(s)) return true;
  if (/^\+?\.inf$/i.test(s)) return true;
  if (/^-\.inf$/i.test(s)) return true;
  if (/^\.nan$/i.test(s)) return true;
  if (/^:./.test(s)) return true;
  if (PSYCH_SEXAGESIMAL.test(s)) return true;
  if (PSYCH_SEXAGESIMAL_FLOAT.test(s)) return true;
  if (PSYCH_FLOAT.test(s)) return !/^[-+]?\.$/.test(s);
  if (PSYCH_INTEGER_LEGACY.test(s)) return true;
  return false;
}

function singleQuoted(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** libyaml escape table (probed): shorthand forms, uppercase hex digits. */
function doubleEscape(code: number): string {
  switch (code) {
    case 0x00: return "\\0";
    case 0x07: return "\\a";
    case 0x08: return "\\b";
    case 0x09: return "\\t";
    case 0x0a: return "\\n";
    case 0x0b: return "\\v";
    case 0x0c: return "\\f";
    case 0x0d: return "\\r";
    case 0x1b: return "\\e";
    case 0x85: return "\\N";
    case 0x2028: return "\\L";
    case 0x2029: return "\\P";
    default: break;
  }
  if (code <= 0xff) return `\\x${code.toString(16).padStart(2, "0").toUpperCase()}`;
  if (code <= 0xffff) return `\\u${code.toString(16).padStart(4, "0").toUpperCase()}`;
  return `\\U${code.toString(16).padStart(8, "0").toUpperCase()}`;
}

function doubleQuoted(s: string): string {
  let out = '"';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    // R6-B1-Ⅴ-β: LS/PS are escape tokens in the double-quoted form — the raw
    // pass-through range must exclude them so they reach doubleEscape.
    else if (code === 0x2028 || code === 0x2029) out += doubleEscape(code);
    else if (code >= 0x20 && code <= 0x7e) out += ch;
    else if (code >= 0xa1 && code <= 0xd7ff) out += ch;
    else if (code >= 0xe000 && code <= 0xfffd) out += ch;
    else out += doubleEscape(code);
  }
  return out + '"';
}

/** Probed: U+2028/U+2029 emit raw inside single quotes, each break followed
 * by the continuation indent (owning indent + 2 — R4-N4a keeps the column
 * model consistent with applyFolding). */
function containsUnicodeBreak(s: string): boolean {
  return s.includes("\u2028") || s.includes("\u2029");
}

function singleQuotedWithBreaks(s: string, blockIndent = 0): string {
  // R5-B1-Ⅳ: ruby inserts the continuation indent only after the LAST break
  // of a consecutive run (`a<LS><PS>b` -> 'a<LS><PS>  b'), never after each.
  const cont = " ".repeat(blockIndent + 2);
  const chars = Array.from(s);
  let body = "";
  for (let idx = 0; idx < chars.length; idx += 1) {
    const ch = chars[idx]!;
    if (ch === "'") body += "''";
    else {
      body += ch;
      const next = chars[idx + 1];
      if ((ch === "\u2028" || ch === "\u2029") && next !== "\u2028" && next !== "\u2029") {
        body += cont;
      }
    }
  }
  return `'${body}'`;
}

type Scalar = null | boolean | number | string;

type PsychStyle = "literal" | "double" | "single" | "plain";

function psychStyleOf(s: string): PsychStyle {
  // /\n(?!\Z)/ in Ruby: a break that is neither the last character nor the
  // second-to-last with exactly one trailing break.
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === "\n" && i < s.length - 1 && !(i === s.length - 2 && s[s.length - 1] === "\n")) {
      return "literal";
    }
  }
  if (s === "y" || s === "n") return "double";
  // Probed (R4-N1): a scalar whose FIRST character is a double quote takes
  // the double-escaped form when that is the ONLY double quote (`"a` ->
  // \"a); a SECOND double quote anywhere flips the whole scalar to the
  // single-quoted form with apostrophe doubling (`"a"` -> '"a"', `""` ->
  // '"").
  if (s.length > 0 && s[0] === '"' && s.indexOf('"', 1) !== -1) return "single";
  if (s.length > 0 && s[0] === '"') return "double";
  if (s.length > 0 && !PSYCH_WORD.test(s[0]) && !s.includes('"')) return "double";
  if (tokenizeResolvesNonString(s) || PSYCH_BROKEN_OCTAL.test(s)) return "single";
  return "plain";
}



/** libyaml plain-analysis fallback for a PLAIN-requested scalar. */
// Unconditional YAML indicators plus the resolver-significant `:` — when one
// of these starts a plain-style scalar (which now only happens when the
// string contains a double quote), libyaml's plain analysis still refuses and
// the reference falls back to the single-quoted form with apostrophe doubling
// (probed: :"y / !"z / |"w / #"u -> single).
const HARD_FIRST = new Set([
  ",", "[", "]", "{", "}", "#", "&", "*", "!", "|", ">", "'", "%", "@", "`", ":",
]);

function plainFallbackToken(s: string, blockIndent = 0): string {
  if (s === "") return "''";
  // Exactly one trailing LF takes the single-quoted fold form (probed
  // 'ab\n' -> 'ab\n\n  '); this must precede the control-character gate,
  // since LF is itself a control character.
  if (s.endsWith("\n") && !s.slice(0, -1).includes("\n") && !s.slice(0, -1).includes("\t")) {
    // Probed: 'ab\n' -> 'ab\n\n  ' — the breaks and continuation indent sit
    // INSIDE the quotes; the continuation indent is the owning indent + 2
    // (R3-B3: no longer hardcoded for nested positions).
    const body = s.slice(0, -1).replace(/'/g, "''");
    return `'${body}\n\n${" ".repeat(blockIndent + 2)}'`;
  }
  // Probed (R4-N2): plain-safety analysis is independent of the quote gate —
  // a leading blank WITH a double quote takes the single-quoted form
  // (' "a'); a leading soft indicator followed by a blank with a double quote
  // is a plain-unsafe sequence/mapping indicator form and is single-quoted
  // too (`- "x"` / `? "x"`); the no-quote leading-blank case was already
  // routed to the double-escaped form upstream.
  if (/^ /.test(s)) return s.includes('"') ? singleQuoted(s) : doubleQuoted(s);
  if (/^[-?] /.test(s) && s.includes('"')) return singleQuoted(s);
  if (/\t/.test(s)) return doubleQuoted(s);
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (code > 0xffff || code === 0xfffe || code === 0xffff) return doubleQuoted(s);
  }
  if (s[0] === '"') return doubleQuoted(s);
  if (HARD_FIRST.has(s[0])) return singleQuoted(s);
  // Soft indicators (`-` `?` `+` `.` `~`) with a double quote inside stay
  // PLAIN (probed: -"hi / ?"x / +"o / ."n / ~"m — G5-T5-R3-S1); the remaining
  // plain-unsafe conditions below still apply to them.
  if (/[\x00-\x1f\x7f-\x9f\x85\u2028\u2029]/.test(s)) return doubleQuoted(s);
  if (s.includes(": ") || s.includes(" #") || s.endsWith(":")) return singleQuoted(s);
  if (/ $/.test(s)) return singleQuoted(s);
  return s;
}

/** Double-quoted emitter with \L/\P breaks: the break resets the column to
 * the continuation indent, spaces fold exactly like applyFolding (R4-N4b).
 * Escape tokens count their own written width; astral code points escape as
 * one \U token. */
function doubleQuotedFolded(s: string, blockIndent: number, columnBefore = 1): string {
  const cont = blockIndent + 2;
  const chars = Array.from(s);
  let out = '"';
  let column = columnBefore + 1; // prefix + the opening quote
  for (let idx = 0; idx < chars.length; idx += 1) {
    const ch = chars[idx]!;
    const code = ch.codePointAt(0)!;
    if (ch === "\u2028" || ch === "\u2029") {
      out += ch === "\u2028" ? "\\L" : "\\P";
      // R5-B1-Ⅱ: \L/\P are ESCAPE TOKENS in the double-quoted form, not
      // structural breaks — they count their own written width (2 columns)
      // and do NOT reset the column (ruby-probed: folding past column 80
      // after the escape uses the continued column).
      column += 2;
      continue;
    }
    const token = ch === '"'
      ? '\\"'
      : ch === "\\"
        ? "\\\\"
        : (code >= 0x20 && code <= 0x7e) || (code >= 0xa1 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd)
          ? ch
          : doubleEscape(code);
    // Fold decision mirrors applyFolding's neighbour rules, evaluated on the
    // original string neighbours.
    if (
      token === " " && column > 80 &&
      chars[idx - 1] !== " " && chars[idx + 1] !== undefined && chars[idx + 1] !== " "
    ) {
      out += "\n" + " ".repeat(cont);
      column = cont;
      continue;
    }
    out += token;
    column += token.length;
  }
  return out + '"';
}

function serializeScalarString(s: string, blockIndent = 0, columnBefore = 1): string {
  // psych visit_String: o == '<<' is an explicit !!str single-quoted branch
  // (it would otherwise resolve as a merge key).
  if (s === "<<") return "!!str '<<'";
  const style = psychStyleOf(s);
  if (style === "literal") return multilineScalar(s, blockIndent);
  if (containsUnicodeBreak(s)) {
    // R4-N3/N4 model (ruby-probed):
    //   - a tab, control byte, or astral char forces the double-escaped form
    //     (raw control bytes can never ride the single-quoted LS form);
    //   - a blank IMMEDIATELY BEFORE a break is trailing whitespace at a
    //     fold point — the single-quoted form would strip it and change the
    //     value, so the reference switches to double + \L (value fidelity);
    //   - style "double" (leading quote, y/n, non-word start) rides the
    //     folding double emitter so \L/\P stay escaped;
    //   - everything else takes the single-quoted LS form, where the break
    //     RESETS the column (R4-N4a: no phantom folds after it).
    // R5-B1-Ⅰ: the value-fidelity gate covers blanks on BOTH sides of a
    // break — a blank after the break would be silently stripped by the
    // single-quoted reader (value corrosion), so such scalars take the
    // double-escaped form too (`a<LS> b` -> "a\L b").
    const breakAdjacentBlank = new RegExp(` [${"\u2028\u2029"}]|[${"\u2028\u2029"}] `).test(s);
    const doubleForced =
      /\t/.test(s) ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(s) ||
      [...s].some((ch) => {
        const code = ch.codePointAt(0)!;
        return code > 0xffff || code === 0xfffe || code === 0xffff;
      });
    if (style === "double" || doubleForced || breakAdjacentBlank) {
      return doubleQuotedFolded(s, blockIndent, columnBefore);
    }
    return singleQuotedWithBreaks(s, blockIndent);
  }
  if (style === "double") return doubleQuoted(s);
  if (style === "single") return singleQuoted(s);
  return plainFallbackToken(s, blockIndent);
}

function serializeScalar(value: Scalar, blockIndent = 0, columnBefore = 1): string {
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new LoopManifestYamlError("non-finite number is not YAML-dumpable");
    return String(value);
  }
  return serializeScalarString(value, blockIndent, columnBefore);
}

/**
 * Embedded-LF forms (probed):
 *   clean lines, no trailing LF            -> `|-` block (strip)
 *   clean lines + single trailing LF       -> `|` block (clip)
 *   first line starts with a space         -> explicit indent indicator (`|2-`)
 *   tab or trailing space on any line      -> double-quoted escapes
 *   LF-only / multiple trailing empty lines -> double-quoted escapes
 */
function multilineScalar(s: string, blockIndent = 0): string {
  const lines = s.split("\n");
  const trailingEmpty = lines.length > 0 && lines[lines.length - 1] === "";
  const bodyLines = trailingEmpty ? lines.slice(0, -1) : lines;
  const extraTrailingEmpties = trailingEmpty && bodyLines.length > 0 && bodyLines[bodyLines.length - 1] === "";
  if (extraTrailingEmpties) return doubleQuoted(s); // keep-chomp: handled with the document-end marker below
  const contentLines = bodyLines;
  // R6-B1-Ⅴ-α: LS/PS are line boundaries too, so a space/tab immediately
  // before one is trailing whitespace on that boundary and disqualifies the
  // whole block (ruby-probed: `a <LS>b` -> double-quoted with \L).
  const blockEligible = contentLines.every(
    (line) => !line.includes("\t") && !/[ \t]$/.test(line) && !/[ \t][\u2028\u2029]/.test(line),
  );
  if (!blockEligible) return doubleQuoted(s);
  const firstLineLeadingSpace = /^[ \t]/.test(contentLines[0]);
  const firstLineEmpty = contentLines[0] === "";
  // A trailing LS/PS is a trailing line break: ruby clips with `|` (probed
  // `l1\na<LS>` -> `|\n  l1\n  a<LS>`).
  const endsWithBreak = /[\u2028\u2029]$/.test(s);
  const chomp = trailingEmpty || endsWithBreak ? "" : "-";
  const indicator = firstLineLeadingSpace || (firstLineEmpty && contentLines.length > 1) ? "2" : "";
  const header = `|${indicator}${chomp}`;
  const linePad = " ".repeat(blockIndent + 2);
  let out = `${header}\n`;
  contentLines.forEach((line, index) => {
    if (line === "") {
      out += "\n";
      return;
    }
    // A line that STARTS with a break has an empty leading segment, which
    // carries no indentation (probed `l1\n<LS>b` -> `  l1\n<LS>  b`).
    const leadingPad = /^[\u2028\u2029]/.test(line) ? "" : linePad;
    // The continuation indent follows a break only when content follows on
    // the SAME physical line (a line-final break gets none).
    const body = line.replace(/([\u2028\u2029])(?=[^\u2028\u2029])/g, "$1" + linePad);
    // A string-final break IS the final line break: ruby emits no trailing
    // newline for it (probed `l1\nx<LS>` -> `|\n  l1\n  x<LS>`).
    const isLast = index === contentLines.length - 1;
    out += isLast && endsWithBreak ? `${leadingPad}${body}` : `${leadingPad}${body}\n`;
  });
  return out;
}

function isScalar(v: YamlValue): v is Scalar {
  return v === null || typeof v === "boolean" || typeof v === "number" || typeof v === "string";
}

function isEmptyContainer(v: YamlValue): boolean {
  if (Array.isArray(v)) return v.length === 0;
  if (!isScalar(v)) return Object.keys(v).length === 0;
  return false;
}

/** Best-width folding (probed): a space written past column 80 becomes a
 * break plus the owning indent + 2; consecutive spaces never fold. */
function applyFolding(token: string, columnBefore: number, continuationIndent: number): string {
  const limit = 80;
  let out = "";
  let column = columnBefore;
  for (let i = 0; i < token.length; i += 1) {
    const ch = token[i];
    // R4-N4a / R5-B1-Ⅲ: a raw LS/PS is a REAL break — the column resets to
    // ZERO (Time-independence: the following continuation-indent blanks then
    // count normally from 0; resetting to the continuation indent instead
    // shifted every post-break fold point by two columns). No fold ever
    // happens AT the break itself.
    if (ch === "\u2028" || ch === "\u2029") {
      out += ch;
      column = 0;
      continue;
    }
    if (ch === " " && column > limit && token[i - 1] !== " " && token[i + 1] !== " " && token[i + 1] !== undefined) {
      out += "\n" + " ".repeat(continuationIndent);
      column = continuationIndent;
      continue;
    }
    out += ch;
    column += 1;
  }
  return out;
}

/**
 * Serialize a value tree exactly like Ruby `YAML.dump` (probed behavior).
 * The top-level value must be a mapping (the manifest state object); keys are
 * inserted-order strings exactly like the publisher's JSON state round-trip.
 */
export function dumpRubyYaml(value: { readonly [key: string]: YamlValue }): string {
  return "---\n" + emitMapping(Object.entries(value), 0);
}

function inlineScalarToken(value: Scalar, columnBefore: number, continuationIndent: number): string {
  const token = serializeScalar(value, continuationIndent - 2, columnBefore);
  if (token.startsWith("|")) return token; // block forms carry their own lines
  if (token.includes("\n")) return token; // pre-broken forms (single-fold)
  return applyFolding(token, columnBefore, continuationIndent);
}

/**
 * R6-B1-Ⅴ: a block whose value ends with exactly one LS/PS is terminated by
 * that break — ruby emits the next line immediately after it, with no
 * newline of its own (probed in ALL positions: `a: |\n  l1\n  x<LS>b: "y"`,
 * and the document-final form ends without a trailing newline). Every other
 * scalar takes the caller's newline.
 */
function lineTerminatorFor(token: string): string {
  // Block forms terminate their own line: a normal block already ends with
  // its final newline, and a break-terminated block ends with the break
  // itself. Neither takes the caller's newline.
  return token.startsWith("|") ? "" : "\n";
}

function emitMapping(entries: readonly (readonly [string, YamlValue])[], indent: number): string {
  if (entries.length === 0) return "{}\n";
  const pad = " ".repeat(indent);
  let out = "";
  for (const [key, val] of entries) {
    const keyToken = serializeScalar(key);
    out += `${pad}${keyToken}:`;
    if (!isScalar(val)) {
      if (isEmptyContainer(val)) {
        out += ` ${Array.isArray(val) ? "[]" : "{}"}\n`;
      } else if (Array.isArray(val)) {
        out += "\n";
        out += emitSequence(val, indent);
      } else {
        out += "\n";
        out += emitMapping(Object.entries(val), indent + 2);
      }
    } else {
      // Probed: null prints as `key:` with NO trailing space.
      const valueColumn = pad.length + keyToken.length + 2;
      const valueToken = val === null ? null : inlineScalarToken(val, valueColumn, indent + 2);
      out += valueToken === null ? "\n" : ` ${valueToken}${lineTerminatorFor(valueToken)}`;
    }
  }
  return out;
}

function emitSequence(items: readonly YamlValue[], indent: number): string {
  const pad = " ".repeat(indent);
  let out = "";
  for (const item of items) {
    if (!isScalar(item) && !Array.isArray(item)) {
      const entries = Object.entries(item);
      if (entries.length === 0) {
        out += `${pad}- {}\n`;
        continue;
      }
      const [firstKey, firstVal] = entries[0];
      out += `${pad}- ${serializeScalar(firstKey)}:`;
      if (!isScalar(firstVal)) {
        if (isEmptyContainer(firstVal)) {
          out += ` ${Array.isArray(firstVal) ? "[]" : "{}"}\n`;
        } else if (Array.isArray(firstVal)) {
          out += "\n";
          out += emitSequence(firstVal, indent + 2);
        } else {
          out += "\n";
          out += emitMapping(Object.entries(firstVal), indent + 2);
        }
      } else {
        const firstValueToken = firstVal === null
          ? null
          : inlineScalarToken(firstVal, pad.length + 4 + firstKey.length, indent + 4);
        out += firstValueToken === null ? "\n" : ` ${firstValueToken}${lineTerminatorFor(firstValueToken)}`;
      }
      if (entries.length > 1) out += emitMapping(entries.slice(1), indent + 2);
    } else if (Array.isArray(item)) {
      if (item.length === 0) {
        out += `${pad}- []\n`;
        continue;
      }
      // Probed compact nested form: `- - a` / `  - b` — the nested sequence's
      // first item rides the parent dash line, the rest indent +2.
      if (isScalar(item[0])) {
        const token = serializeScalar(item[0], indent + 2);
        // The nested item's own content starts after `- - ` (4 columns), so a
        // fold continuation lands at indent + 4 (probed).
        // The token carries its own `pad + "- - "` prefix, so it starts at
        // physical column 0 — passing indent + 4 here double-counted the
        // prefix and broke one word early (phantom width).
        const head = applyFolding(`${pad}- - ${token}`, 0, indent + 4);
        out += `${head}\n`;
        out += emitSequence(item.slice(1), indent + 2);
      } else {
        out += `${pad}-\n`;
        out += emitSequence(item, indent + 2);
      }
    } else {
      const token = emitScalar(item);
      const itemToken = token === "" ? null : inlineScalarToken(item, pad.length + 2, indent + 2);
      out += itemToken === null ? `${pad}-\n` : `${pad}- ${itemToken}${lineTerminatorFor(itemToken)}`;
    }
  }
  return out;
}

function emitScalar(value: Scalar): string {
  return serializeScalar(value);
}

// ---------------------------------------------------------------------------
// Minimal strict reader (round-trip grammar of dumpRubyYaml)
// ---------------------------------------------------------------------------

type Line = { indent: number; text: string; raw: string };

type ParseResult = { value: YamlValue; next: number };

function splitLines(text: string): Line[] {
  if (!text.startsWith("---\n")) {
    throw new LoopManifestYamlError("missing YAML document start marker '---'");
  }
  const rawLines = text.slice(4).split("\n");
  // The document ends with "\n"; the split's trailing empty elements are
  // artifacts, not content. Interior empty lines (block scalars only) are
  // kept with indent -1 so the block collector can see them while every
  // other consumer treats them as a region end.
  while (rawLines.length > 0 && rawLines[rawLines.length - 1] === "") rawLines.pop();
  const lines: Line[] = [];
  for (const raw of rawLines) {
    if (raw === "...") break; // document-end marker (keep-chomp block forms)
    if (raw === "") {
      lines.push({ indent: -1, text: "", raw });
      continue;
    }
    const match = /^( *)([\s\S]*)$/.exec(raw);
    if (match === null) throw new LoopManifestYamlError(`unparseable line: ${JSON.stringify(raw)}`);
    lines.push({ indent: match[1].length, text: match[2], raw });
  }
  return lines;
}

const KEY_VALUE = /^([^:]+):(?: ([\s\S]*))?$/;

const DOUBLE_ESCAPE_MAP: Record<string, string> = {
  "0": "\0", a: "\x07", b: "\x08", t: "\t", n: "\n", v: "\x0b", f: "\x0c",
  r: "\r", e: "\x1b", " ": " ", '"': '"', "\\": "\\", "/": "/", N: "\x85",
  _: "\xa0", L: "\u2028", P: "\u2029",
};

function decodeDoubleQuoted(token: string): string {
  let body = token.slice(1, -1);
  // YAML line folding: a raw break plus the continuation indent folds to a
  // single space. (Escaped \\n is not a raw break and decodes literally.)
  body = body.replace(/\n[ \t]*/g, " ");
  let out = "";
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = body[i + 1];
    if (next === undefined) throw new LoopManifestYamlError("dangling escape in double-quoted scalar");
    if (next === "x" || next === "u" || next === "U") {
      const width = next === "x" ? 2 : next === "u" ? 4 : 8;
      const hex = body.slice(i + 2, i + 2 + width);
      if (hex.length !== width || !/^[0-9a-fA-F]+$/.test(hex)) {
        throw new LoopManifestYamlError(`invalid \\${next} escape in double-quoted scalar`);
      }
      out += String.fromCodePoint(parseInt(hex, 16));
      i += 1 + width;
      continue;
    }
    const mapped = DOUBLE_ESCAPE_MAP[next];
    if (mapped === undefined) throw new LoopManifestYamlError(`unknown escape \\${next} in double-quoted scalar`);
    out += mapped;
    i += 1;
  }
  return out;
}

function parseQuoted(token: string): string | undefined {
  if (token.startsWith("'") && token.endsWith("'") && token.length >= 2) {
    let body = token.slice(1, -1).replace(/''/g, "'");
    // Single-quoted Unicode-break continuation: the break was written raw
    // followed by the continuation indent (owning indent + 2) — strip ALL
    // blanks after the break, so deeper-nested producers read back clean
    // (R3-B3: reading ruby 4/6-space continuations no longer grows phantom
    // spaces).
    body = body.replace(/([\u2028\u2029])[ \t]*/g, "$1");
    // Psych single-quoted folding: trailing spaces are stripped at a break,
    // one break folds to a space, and a run of n >= 2 breaks folds to n - 1
    // breaks (the closing-quote form 'ab\n\n  ' therefore reads back as "ab\n").
    const lines = body.split("\n");
    const normalized = lines
      .map((line, index) => (index === lines.length - 1 ? line : line.replace(/[ \t]+$/, "")))
      .join("\n");
    return normalized.replace(/\n+/g, (run) => (run.length === 1 ? " " : "\n".repeat(run.length - 1)));
  }
  if (token.startsWith('"') && token.endsWith('"') && token.length >= 2) {
    return decodeDoubleQuoted(token);
  }
  return undefined;
}

function parseInlineScalar(token: string): YamlValue {
  // psych emits `!!str '<<'` for the merge-key sentinel: the tag pins the
  // scalar's type, the value is what follows.
  if (token.startsWith("!!str ")) return parseInlineScalar(token.slice("!!str ".length));
  if (token === "") return null;
  if (token === "[]") return Object.freeze([]);
  if (token === "{}") return Object.freeze({});
  const quoted = parseQuoted(token);
  if (quoted !== undefined) return quoted;
  if (token === "true") return true;
  if (token === "false") return false;
  if (/^-?\d+$/.test(token)) return Number(token);
  return token;
}

/**
 * Parse back a manifest YAML document. The projector only consumes documents
 * produced by this emitter or the manual publisher (same grammar), so anything
 * outside the round-trip grammar fails closed instead of guessing.
 */
export function parseRubyYaml(text: string): { readonly [key: string]: YamlValue } {
  const lines = splitLines(text);
  if (lines.length === 0) return Object.freeze({});
  const parsed = parseMappingAt(lines, 0, lines[0].indent);
  if (parsed.next !== lines.length) {
    throw new LoopManifestYamlError(`trailing content at line: ${lines[parsed.next].raw}`);
  }
  return parsed.value as { readonly [key: string]: YamlValue };
}

/** A folded scalar's continuation lines (deeper indent, folded to spaces). */
function joinFoldContinuation(value: string, continuationLines: readonly Line[]): string {
  let out = value;
  for (const line of continuationLines) out += ` ${line.text.replace(/[ \t]+$/, "")}`;
  return out;
}

/** A quoted scalar whose closing quote is on a later line (folding). */
function startsUnterminatedQuote(rest: string): boolean {
  if (rest.length < 2) return rest === "'" || rest === '"';
  const q = rest[0];
  if (q !== "'" && q !== '"') return false;
  // The empty scalar '' / "" is terminated (its body is empty) — parsing it
  // used to loop forever because the empty parse result is falsy.
  if (rest === "''" || rest === '""') return false;
  return parseQuoted(rest) === undefined;
}

/** Collect the quoted scalar text across continuation lines (joined with the
 * raw breaks that parseQuoted's folding rules decode). */
function collectQuotedRest(lines: Line[], start: number, rest: string, keyIndent: number): { text: string; next: number } {
  let text = rest;
  let j = start;
  // `parseQuoted` returns "" for a legitimately empty scalar, which is falsy —
  // test against undefined instead or the loop never terminates.
  while (parseQuoted(text) === undefined) {
    if (j >= lines.length) {
      throw new LoopManifestYamlError("unterminated quoted scalar in manifest");
    }
    // A quoted scalar continues across any line until its closing quote:
    // YAML does not bound it by indentation, so the terminator is the quote
    // itself. An unterminated quote therefore swallows the remaining lines and
    // fails closed at EOF, which is the safe direction.
    void keyIndent;
    text += "\n" + lines[j]!.text;
    j += 1;
  }
  return { text, next: j };
}

function isBlockHeader(rest: string): boolean {
  return /^\|[-+0-9]*$/.test(rest);
}

function parseBlockScalar(lines: Line[], start: number, keyIndent: number, header: string): ParseResult {
  const strip = header.includes("-");
  const explicitIndent = /^\|(\d)/.exec(header);
  const contentIndent = keyIndent + (explicitIndent !== null ? Number(explicitIndent[1]) : 2);
  const collected: string[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.indent === -1 || line.raw === "") {
      collected.push("");
      i += 1;
      continue;
    }
    // A break sitting at column 0 is block CONTENT (LS/PS are line breaks),
    // not a dedent: the emitter writes `\u2028  b` for a line-initial break.
    let raw = line.raw;
    let lead = "";
    while (raw.length > 0 && (raw[0] === "\u2028" || raw[0] === "\u2029")) {
      lead += raw[0];
      raw = raw.slice(1);
    }
    if (lead === "") {
      if (line.indent < contentIndent) break;
    } else {
      const rest = /^( *)([\s\S]*)$/.exec(raw)!;
      if (rest[2] !== "" && rest[1]!.length < contentIndent) break;
    }
    const body = raw.startsWith(" ".repeat(contentIndent))
      ? raw.slice(contentIndent)
      : raw.replace(/^ */, "");
    collected.push(lead + body);
    i += 1;
  }
  while (collected.length > 0 && collected[collected.length - 1] === "") collected.pop();
  // Reverse the emitter's break continuation: it writes a break followed by
  // exactly the content indent, so strip EXACTLY that many blanks (stripping
  // all of them would eat whitespace that is part of the value).
  const pad = new RegExp("([\u2028\u2029])[ \t]{" + contentIndent + "}", "g");
  let value = collected.join("\n").replace(pad, "$1");
  // Clip keeps one trailing break; a value already ending in a break has it.
  if (!strip && value !== "" && !/[\u2028\u2029]$/.test(value)) value += "\n";
  return { value, next: i };
}


function parseMappingAt(lines: Line[], start: number, indent: number): ParseResult {
  const result: Record<string, YamlValue> = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < indent) break;
    if (line.indent > indent) throw new LoopManifestYamlError(`unexpected indent at line: ${line.raw}`);
    if (line.text.startsWith("- ")) throw new LoopManifestYamlError(`unexpected sequence item at line: ${line.raw}`);
    const kv = KEY_VALUE.exec(line.text);
    if (kv === null) throw new LoopManifestYamlError(`expected 'key: value' at line: ${line.raw}`);
    const key = parseInlineScalar(kv[1]);
    if (typeof key !== "string") throw new LoopManifestYamlError(`non-string mapping key at line: ${line.raw}`);
    const rest = kv[2] ?? "";
    if (isBlockHeader(rest)) {
      const block = parseBlockScalar(lines, i + 1, indent, rest);
      result[key] = block.value;
      i = block.next;
      continue;
    }
    if (rest !== "") {
      if (startsUnterminatedQuote(rest)) {
        const collected = collectQuotedRest(lines, i + 1, rest, indent);
        result[key] = parseInlineScalar(collected.text);
        i = collected.next;
        continue;
      }
      let value = parseInlineScalar(rest);
      const continuations: Line[] = [];
      let j = i + 1;
      while (j < lines.length && lines[j].indent > indent) {
        continuations.push(lines[j]);
        j += 1;
      }
      if (continuations.length > 0 && typeof value === "string") {
        value = joinFoldContinuation(value, continuations);
      } else if (continuations.length > 0) {
        throw new LoopManifestYamlError(`unexpected indent after scalar at line: ${line.raw}`);
      }
      result[key] = value;
      i = j;
      continue;
    }
    if (i + 1 < lines.length && lines[i + 1].indent > indent) {
      if (lines[i + 1].text.startsWith("- ")) {
        const child = parseSequenceAt(lines, i + 1, lines[i + 1].indent);
        result[key] = child.value;
        i = child.next;
      } else {
        const child = parseMappingAt(lines, i + 1, lines[i + 1].indent);
        result[key] = child.value;
        i = child.next;
      }
      continue;
    }
    // Sequence items sit AT their owning key's indent level (probed Psych
    // behavior), so a same-indent `- ` line belongs to this empty-valued key.
    if (
      i + 1 < lines.length && lines[i + 1].indent === indent &&
      (lines[i + 1].text === "-" || lines[i + 1].text.startsWith("- "))
    ) {
      const child = parseSequenceAt(lines, i + 1, indent);
      result[key] = child.value;
      i = child.next;
      continue;
    }
    result[key] = null;
    i += 1;
  }
  return { value: Object.freeze(result), next: i };
}

function parseSequenceAt(lines: Line[], start: number, indent: number): ParseResult {
  const items: YamlValue[] = [];
  let i = start;
  while (i < lines.length && lines[i].indent === indent && (lines[i].text === "-" || lines[i].text.startsWith("- "))) {
    const body = lines[i].text === "-" ? "" : lines[i].text.slice(2);
    if (body === "") {
      if (i + 1 < lines.length && lines[i + 1].indent > indent) {
        const child = lines[i + 1].text.startsWith("- ")
          ? parseSequenceAt(lines, i + 1, lines[i + 1].indent)
          : parseMappingAt(lines, i + 1, lines[i + 1].indent);
        items.push(child.value);
        i = child.next;
        continue;
      }
      items.push(null);
      i += 1;
      continue;
    }
    // Compact nested sequence: `- - a` / `  - b` (probed Psych form).
    if (body.startsWith("- ") || body === "-") {
      const substituted = lines.slice();
      substituted[i] = { indent: indent + 2, text: body, raw: lines[i].raw };
      const child = parseSequenceAt(substituted, i, indent + 2);
      items.push(child.value);
      i = child.next;
      continue;
    }
    const inlineKv = KEY_VALUE.exec(body);
    if (inlineKv !== null && parseQuoted(inlineKv[1]) === undefined && !/^[0-9:./-]+$/.test(inlineKv[1])) {
      const key = parseInlineScalar(inlineKv[1]);
      if (typeof key !== "string") throw new LoopManifestYamlError(`non-string mapping key at line: ${lines[i].raw}`);
      const map: Record<string, YamlValue> = {};
      const firstRest = inlineKv[2] ?? "";
      const childIndent = indent + 2;
      if (isBlockHeader(firstRest)) {
        // A block scalar may open on the dash line (`- key: |-`); its content
        // indent is measured from the KEY's indent (childIndent), exactly like
        // the inner-key path — using the sequence indent swallowed the sibling
        // keys that follow.
        const block = parseBlockScalar(lines, i + 1, childIndent, firstRest);
        map[key] = block.value;
        i = block.next;
      } else if (startsUnterminatedQuote(firstRest)) {
        // Folded/quoted continuation of the first key's value.
        const collected = collectQuotedRest(lines, i + 1, firstRest, indent);
        map[key] = parseInlineScalar(collected.text);
        i = collected.next;
      } else if (firstRest !== "") {
        let value = parseInlineScalar(firstRest);
        const conts: Line[] = [];
        let j = i + 1;
        // A folded continuation is indented deeper than the key it belongs to
        // (the first key sits on the dash line at childIndent, so its
        // continuations are > childIndent — exactly like inner-key values).
        while (j < lines.length && lines[j].indent > childIndent) {
          conts.push(lines[j]);
          j += 1;
        }
        if (conts.length > 0 && typeof value === "string") {
          value = joinFoldContinuation(value, conts);
          i = j;
        } else {
          i += 1;
        }
        map[key] = value;
      } else if (i + 1 < lines.length && lines[i + 1].indent > childIndent) {
        // `- key:` followed by deeper content: a nested container.
        const child = lines[i + 1]!.text.startsWith("- ")
          ? parseSequenceAt(lines, i + 1, lines[i + 1]!.indent)
          : parseMappingAt(lines, i + 1, lines[i + 1]!.indent);
        map[key] = child.value;
        i = child.next;
      } else if (
        i + 1 < lines.length && lines[i + 1]!.indent === childIndent &&
        lines[i + 1]!.text.startsWith("- ")
      ) {
        // Psych writes a nested sequence at the KEY's own indent.
        const child = parseSequenceAt(lines, i + 1, childIndent);
        map[key] = child.value;
        i = child.next;
      } else {
        map[key] = null;
        i += 1;
      }
      while (i < lines.length && lines[i].indent === childIndent) {
        if (lines[i].text.startsWith("- ")) {
          // A same-indent sequence belongs to the key parsed just above; the
          // key branch consumes it, so reaching here means it has no owner.
          throw new LoopManifestYamlError(`unexpected nested item at line: ${lines[i].raw}`);
        }
        const innerKv = KEY_VALUE.exec(lines[i].text);
        if (innerKv === null) throw new LoopManifestYamlError(`expected 'key: value' at line: ${lines[i].raw}`);
        const innerKey = parseInlineScalar(innerKv[1]);
        if (typeof innerKey !== "string") throw new LoopManifestYamlError(`non-string mapping key at line: ${lines[i].raw}`);
        const innerRest = innerKv[2] ?? "";
        if (isBlockHeader(innerRest)) {
          const block = parseBlockScalar(lines, i + 1, childIndent, innerRest);
          map[innerKey] = block.value;
          i = block.next;
          continue;
        }
        if (startsUnterminatedQuote(innerRest)) {
          const collected = collectQuotedRest(lines, i + 1, innerRest, childIndent);
          map[innerKey] = parseInlineScalar(collected.text);
          i = collected.next;
          continue;
        }
        if (innerRest !== "") {
          let value = parseInlineScalar(innerRest);
          const innerConts: Line[] = [];
          let j = i + 1;
          while (j < lines.length && lines[j].indent > childIndent) {
            innerConts.push(lines[j]);
            j += 1;
          }
          if (innerConts.length > 0 && typeof value === "string") {
            value = joinFoldContinuation(value, innerConts);
            i = j;
          } else {
            i += 1;
          }
          map[innerKey] = value;
          continue;
        }
        if (i + 1 < lines.length && lines[i + 1].indent > childIndent) {
          const child = lines[i + 1].text.startsWith("- ")
            ? parseSequenceAt(lines, i + 1, lines[i + 1].indent)
            : parseMappingAt(lines, i + 1, lines[i + 1].indent);
          map[innerKey] = child.value;
          i = child.next;
          continue;
        }
        if (
          i + 1 < lines.length && lines[i + 1].indent === childIndent &&
          lines[i + 1].text.startsWith("- ")
        ) {
          // Psych writes the nested sequence at the KEY's indent (the real
          // publisher's `corrected_entries` shape).
          const child = parseSequenceAt(lines, i + 1, childIndent);
          map[innerKey] = child.value;
          i = child.next;
          continue;
        }
        map[innerKey] = null;
        i += 1;
      }
      items.push(Object.freeze(map));
      continue;
    }
    if (startsUnterminatedQuote(body)) {
      const collected = collectQuotedRest(lines, i + 1, body, indent);
      items.push(parseInlineScalar(collected.text));
      i = collected.next;
      continue;
    }
    let itemValue = parseInlineScalar(body);
    const continuations: Line[] = [];
    let j = i + 1;
    while (j < lines.length && lines[j].indent > indent) {
      continuations.push(lines[j]);
      j += 1;
    }
    if (continuations.length > 0 && typeof itemValue === "string") {
      itemValue = joinFoldContinuation(itemValue, continuations);
    } else if (continuations.length > 0) {
      throw new LoopManifestYamlError(`unexpected indent after scalar at line: ${lines[i].raw}`);
    }
    items.push(itemValue);
    i = j;
  }
  return { value: Object.freeze(items), next: i };
}
