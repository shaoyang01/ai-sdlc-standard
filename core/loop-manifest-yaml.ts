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
 *   - a leading YAML indicator character (including `-`, `?`, `:`, `+`, `.`,
 *     `~`) forces DOUBLE quotes; strings resolving to a scalar type (int,
 *     float, bool, sexagesimal, timestamp, broken octal, radix 0x/0b) get
 *     SINGLE quotes; exactly `y`/`n` get DOUBLE quotes (`Y`/`N` stay plain);
 *     mid-string indicators (`it's`, `a:b`, `a #b` minus the space form) are
 *     plain; `: `/` #`/trailing-`:` single-quote; leading/trailing space or
 *     tab double-quote
 *   - double-quote escapes: `\0 \a \b \t \n \v \f \r \e \" \\ \N` (NEL),
 *     `\xNN` / `\uNNNN` / `\UNNNNNNNN` with UPPERCASE hex (libyaml prints
 *     only #x20-#x7E, #xA0-#xD7FF, #xE000-#xFFFD raw; astral always escapes)
 *   - U+2028/U+2029 (no LF): single-quoted with the break written raw plus a
 *     two-space continuation indent (`a<LS>b` -> `'a<LS>  b'`)
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
  if (PSYCH_TIME.test(s)) return true;
  if (/^\d{4}-(?:1[012]|0\d|\d)-(?:[12]\d|3[01]|0\d|\d)$/.test(s)) return true;
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
    else if (code >= 0x20 && code <= 0x7e) out += ch;
    else if (code >= 0xa1 && code <= 0xd7ff) out += ch;
    else if (code >= 0xe000 && code <= 0xfffd) out += ch;
    else out += doubleEscape(code);
  }
  return out + '"';
}

/** Probed: U+2028/U+2029 emit raw inside single quotes + a 2-space
 * continuation indent after each break (even before the closing quote). */
function containsUnicodeBreak(s: string): boolean {
  return s.includes("\u2028") || s.includes("\u2029");
}

function singleQuotedWithBreaks(s: string): string {
  let body = "";
  for (const ch of s) {
    if (ch === "'") body += "''";
    else {
      body += ch;
      if (ch === "\u2028" || ch === "\u2029") body += "  ";
    }
  }
  return `'${body}'`;
}

type Scalar = null | boolean | number | string;

// Leading characters that force quoting when they start a scalar the
// double-quote rule passed over (strings containing a double quote): all
// YAML indicators plus the resolver-significant prefixes.
const DOUBLE_FIRST = new Set([
  ",", "[", "]", "{", "}", "#", "&", "*", "!", "|", ">", "'", '"', "%", "@", "`",
  "-", "?", ":", "+", ".", "~",
]);

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
  if (s.length > 0 && !PSYCH_WORD.test(s[0]) && !s.includes('"')) return "double";
  if (tokenizeResolvesNonString(s) || PSYCH_BROKEN_OCTAL.test(s)) return "single";
  return "plain";
}



/** libyaml plain-analysis fallback for a PLAIN-requested scalar. */
function plainFallbackToken(s: string): string {
  if (s === "") return "''";
  if (/\t/.test(s)) return doubleQuoted(s);
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (code > 0xffff || code === 0xfffe || code === 0xffff) return doubleQuoted(s);
  }
  // A leading indicator the double-quote rule passed over (because the string
  // contains a double quote) is still plain-unsafe for libyaml: it falls back
  // to the single-quoted form with apostrophe doubling.
  if (DOUBLE_FIRST.has(s[0]) && s[0] !== '"') return singleQuoted(s);
  if (/[\x00-\x1f\x7f-\x9f\x85\u2028\u2029]/.test(s)) return doubleQuoted(s);
  if (s.includes(": ") || s.includes(" #") || s.endsWith(":")) return singleQuoted(s);
  if (/ $/.test(s)) return singleQuoted(s);
  if (s.endsWith("\n")) return `${singleQuoted(s.slice(0, -1))}\n\n  `;
  return s;
}

function serializeScalarString(s: string, blockIndent = 0): string {
  const style = psychStyleOf(s);
  if (style === "literal") return multilineScalar(s, blockIndent);
  if (style === "double") return doubleQuoted(s);
  if (style === "single") return singleQuoted(s);
  if (containsUnicodeBreak(s)) return singleQuotedWithBreaks(s);
  return plainFallbackToken(s);
}

function serializeScalar(value: Scalar, blockIndent = 0): string {
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new LoopManifestYamlError("non-finite number is not YAML-dumpable");
    return String(value);
  }
  return serializeScalarString(value, blockIndent);
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
  const blockEligible = contentLines.every((line) => !line.includes("\t") && !/[ \t]$/.test(line));
  if (!blockEligible) return doubleQuoted(s);
  // Probed: a single content line + trailing LF takes the single-quoted fold
  // form ("ab\n" -> 'ab\n\n  '), not a block.
  if (trailingEmpty && contentLines.length === 1) {
    return `${singleQuoted(contentLines[0])}\n\n  `;
  }
  const firstLineLeadingSpace = /^[ \t]/.test(contentLines[0]);
  const firstLineEmpty = contentLines[0] === "";
  const chomp = trailingEmpty ? "" : "-";
  const indicator = firstLineLeadingSpace || (firstLineEmpty && contentLines.length > 1) ? "2" : "";
  const header = `|${indicator}${chomp}`;
  const linePad = " ".repeat(blockIndent + 2);
  let out = `${header}\n`;
  for (const line of contentLines) out += line === "" ? "\n" : `${linePad}${line}\n`;
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
  const token = serializeScalar(value, continuationIndent - 2);
  // Block forms carry their own lines; the caller's newline is already the
  // block's last line break, so trim the token's trailing one.
  if (token.startsWith("|") && token.endsWith("\n")) return token.slice(0, -1);
  if (token.includes("\n")) return token; // pre-broken forms (single-fold)
  return applyFolding(token, columnBefore, continuationIndent);
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
      out += val === null ? "\n" : ` ${inlineScalarToken(val, valueColumn, indent + 2)}\n`;
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
        out += firstVal === null ? "\n" : ` ${inlineScalarToken(firstVal, pad.length + 4 + firstKey.length, indent + 4)}\n`;
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
        const token = serializeScalar(item[0]);
        const head = applyFolding(`${pad}- - ${token}`, indent, indent + 2);
        out += `${head}\n`;
        out += emitSequence(item.slice(1), indent + 2);
      } else {
        out += `${pad}-\n`;
        out += emitSequence(item, indent + 2);
      }
    } else {
      const token = emitScalar(item);
      out += token === "" ? `${pad}-\n` : `${pad}- ${inlineScalarToken(item, pad.length + 2, indent + 2)}\n`;
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
    // Trailing-break fold form ("ab\n" -> 'ab\n\n  '): the two breaks and the
    // continuation indent collapse back to one newline.
    body = body.replace(/\n\n[ \t]*$/, "\n");
    // Single-quoted Unicode-break continuation: the break was written raw with
    // a two-space indent after it — the fold strips exactly that indent.
    return body.replace(/([\u2028\u2029])  /g, "$1");
  }
  if (token.startsWith('"') && token.endsWith('"') && token.length >= 2) {
    return decodeDoubleQuoted(token);
  }
  return undefined;
}

function parseInlineScalar(token: string): YamlValue {
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
  if (q === '"') return !/[^\\](\\\\)*"$/.test(rest);
  return !/([^']|'')'$/.test(rest) || rest === "'";
}

/** Collect the quoted scalar text across continuation lines (joined with the
 * raw breaks that parseQuoted's folding rules decode). */
function collectQuotedRest(lines: Line[], start: number, rest: string, keyIndent: number): { text: string; next: number } {
  let text = rest;
  let j = start;
  while (!parseQuoted(text)) {
    if (j >= lines.length || lines[j].indent <= keyIndent) {
      throw new LoopManifestYamlError("unterminated quoted scalar in manifest");
    }
    text += "\n" + lines[j].text;
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
    const line = lines[i];
    if (line.indent === -1 || line.raw === "") {
      collected.push("");
      i += 1;
      continue;
    }
    if (line.indent < contentIndent) break;
    collected.push(" ".repeat(line.indent - contentIndent) + line.text);
    i += 1;
  }
  while (collected.length > 0 && collected[collected.length - 1] === "") collected.pop();
  let value = collected.join("\n");
  if (!strip && value !== "") value += "\n";
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
      const map: Record<string, YamlValue> = { [key]: parseInlineScalar(inlineKv[2] ?? "") };
      i += 1;
      const childIndent = indent + 2;
      while (i < lines.length && lines[i].indent === childIndent) {
        if (lines[i].text.startsWith("- ")) throw new LoopManifestYamlError(`unexpected nested item at line: ${lines[i].raw}`);
        const innerKv = KEY_VALUE.exec(lines[i].text);
        if (innerKv === null) throw new LoopManifestYamlError(`expected 'key: value' at line: ${lines[i].raw}`);
        const innerKey = parseInlineScalar(innerKv[1]);
        if (typeof innerKey !== "string") throw new LoopManifestYamlError(`non-string mapping key at line: ${lines[i].raw}`);
        const innerRest = innerKv[2] ?? "";
        if (innerRest !== "") {
          map[innerKey] = parseInlineScalar(innerRest);
          i += 1;
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
