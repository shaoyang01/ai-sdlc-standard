/**
 * G5-T2 (D-090-03 Δ1): deterministic YAML emitter — TS replica of the manual
 * publisher's Ruby `YAML.dump` (Psych) serialization, frozen decision D-5 of
 * the G5-T1 projection-semantics freeze document (v1.7.0 @ a5ea687). The
 * manifest self-digest (contract §6.2.1) is sha256 over exactly this
 * serialization, so every byte is normative.
 *
 * Behavior verified against the reference interpreter for the REAL manifest
 * data domain (G5-T2-R1 probe7: full projected manifest round-trip through
 * Ruby 3.3.12 / Psych 5.1.2 is BYTE-IDENTICAL). Documented deviations on
 * out-of-domain shapes exist and are intentionally deferred to the G5-T5
 * parity matrix (17-shape table in G5-T2-REVIEW-R1 §3-RC-6(c)); the comments
 * below state the ACTUAL emitter behavior, not the reference interpreter's:
 *   - document header `---`, mappings at 2-space indent steps
 *   - sequence items are indented AT their owning key's level (`- ` prefix)
 *   - null prints as an empty value (`key:`), not `null`
 *   - empty map `{}`, empty array `[]`
 *   - plain scalars whenever round-trip-safe; single quotes are the fallback;
 *     double quotes only where single-quoted form is not representable
 *     (leading whitespace, tabs, control / non-BMP characters)
 *   - strings that would re-parse as bool / null / int / float / timestamp /
 *     sexagesimal get quoted so the digest input stays type-stable
 *   - no line folding at any width (the reference folds long single-quoted
 *     scalars — T5 matrix)
 *   - known T5-matrix deviations vs the reference: control-char escape width
 *     (`\x0001` vs `\x01`), emoji hex case (lowercase vs `\U0001F600`),
 *     NEL/LS/PS emitted as raw bytes, `-`/`?`/`:` prefixes without a following
 *     space stay plain, `y`/`n`/`1_000`/`1.` stay plain, `0o17`/`1e3`/
 *     `12:99` get (over-)quoted, literal blocks for embedded newlines
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

const PLAIN_FIRST_UNCONDITIONAL = new Set([
  ",", "[", "]", "{", "}", "#", "&", "*", "!", "|", ">", "'", '"', "%", "@", "`",
]);

const BOOL_LITERALS = new Set([
  "true", "True", "TRUE", "false", "False", "FALSE",
  "yes", "Yes", "YES", "no", "No", "NO", "on", "On", "ON", "off", "Off", "OFF",
]);

const NULL_LITERALS = new Set(["null", "Null", "NULL", "~"]);

const DATE_PREFIX = /^\d{4}-\d{1,2}-\d{1,2}([Tt ].*)?$/;
const INT_LITERAL = /^[-+]?[0-9]+$/;
const RADIX_INT = /^[-+]?0[xbo][0-9a-fA-F_]+$/i;
const SPECIAL_FLOAT = /^[-+]?\.(inf|Inf|INF)$|^\.nan$|^\.NaN$|^\.NAN$/;

function wouldReparseAsNonString(s: string): boolean {
  if (NULL_LITERALS.has(s)) return true;
  if (BOOL_LITERALS.has(s)) return true;
  if (INT_LITERAL.test(s)) return true;
  if (RADIX_INT.test(s)) return true;
  // YAML 1.1 resolves a bare "1.5" to float but "1.2.3" stays a string.
  if (/^[-+]?[0-9]+\.[0-9]+([eE][-+]?[0-9]+)?$|^[-+]?[0-9]+[eE][-+]?[0-9]+$|^[-+]?\.[0-9]+/.test(s)) return true;
  if (SPECIAL_FLOAT.test(s)) return true;
  // YAML 1.1 sexagesimal: a pure digits-and-colons scalar re-parses as a number.
  if (/^[-+]?[0-9][0-9:]*$/.test(s) && s.includes(":")) return true;
  if (DATE_PREFIX.test(s)) return true;
  return false;
}

function isPlainSafe(s: string): boolean {
  if (s === "") return false;
  if (s !== s.trim()) return false; // leading/trailing whitespace
  if (s.includes(": ") || s.includes(" #")) return false;
  if (s.endsWith(":")) return false;
  const first = s[0];
  if (PLAIN_FIRST_UNCONDITIONAL.has(first)) return false;
  if ((first === "-" || first === "?" || first === ":") && (s.length === 1 || s[1] === " ")) {
    return false;
  }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s)) return false;
  if (s.includes("\n")) return false;
  if (wouldReparseAsNonString(s)) return false;
  return true;
}

function singleQuoted(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function doubleQuoted(s: string): string {
  let out = '"';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\t") out += "\\t";
    else if (ch === "\r") out += "\\r";
    else if (code >= 0x20 && code <= 0x7e) out += ch;
    else if (code <= 0xffff) out += `\\x${code.toString(16).padStart(4, "0")}`;
    else out += `\\U${code.toString(16).padStart(8, "0")}`;
  }
  return out + '"';
}

/** Probed: leading whitespace, tabs, CR, control and astral chars force double. */
function needsDoubleQuotes(s: string): boolean {
  if (/^[\t ]/.test(s)) return true;
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (ch === "\t" || ch === "\r") return true;
    if (code < 0x20 || code === 0x7f) return true;
    if (code > 0xffff) return true; // probed: emoji -> \U0001F600 escape
  }
  return false;
}

function scalarToken(s: string): string {
  if (needsDoubleQuotes(s)) return doubleQuoted(s);
  if (isPlainSafe(s)) return s;
  return singleQuoted(s);
}

type Scalar = null | boolean | number | string;

function emitScalar(value: Scalar): string {
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new LoopManifestYamlError("non-finite number is not YAML-dumpable");
    return String(value);
  }
  return scalarToken(value);
}

function isScalar(v: YamlValue): v is Scalar {
  return v === null || typeof v === "boolean" || typeof v === "number" || typeof v === "string";
}

function isEmptyContainer(v: YamlValue): boolean {
  if (Array.isArray(v)) return v.length === 0;
  if (!isScalar(v)) return Object.keys(v).length === 0;
  return false;
}

/**
 * Serialize a value tree exactly like Ruby `YAML.dump` (probed behavior).
 * The top-level value must be a mapping (the manifest state object); keys are
 * inserted-order strings exactly like the publisher's JSON state round-trip.
 */
export function dumpRubyYaml(value: { readonly [key: string]: YamlValue }): string {
  return "---\n" + emitMapping(Object.entries(value), 0);
}

function emitMapping(entries: readonly (readonly [string, YamlValue])[], indent: number): string {
  if (entries.length === 0) return "{}\n";
  const pad = " ".repeat(indent);
  let out = "";
  for (const [key, val] of entries) {
    out += `${pad}${scalarToken(key)}:`;
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
      out += val === null ? "\n" : ` ${emitScalar(val)}\n`;
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
      out += `${pad}- ${scalarToken(firstKey)}:`;
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
        out += firstVal === null ? "\n" : ` ${emitScalar(firstVal)}\n`;
      }
      if (entries.length > 1) out += emitMapping(entries.slice(1), indent + 2);
    } else if (Array.isArray(item)) {
      if (item.length === 0) out += `${pad}- []\n`;
      else {
        out += `${pad}-\n`;
        out += emitSequence(item, indent + 2);
      }
    } else {
      const token = emitScalar(item);
      out += token === "" ? `${pad}-\n` : `${pad}- ${token}\n`;
    }
  }
  return out;
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
  const lines: Line[] = [];
  for (const raw of text.slice(4).split("\n")) {
    if (raw === "") continue;
    const match = /^( *)(.*)$/.exec(raw);
    if (match === null) throw new LoopManifestYamlError(`unparseable line: ${JSON.stringify(raw)}`);
    lines.push({ indent: match[1].length, text: match[2], raw });
  }
  return lines;
}

const KEY_VALUE = /^([^:]+):(?: (.*))?$/;

function parseQuoted(token: string): string | undefined {
  if (token.startsWith("'") && token.endsWith("'") && token.length >= 2) {
    return token.slice(1, -1).replace(/''/g, "'");
  }
  if (token.startsWith('"') && token.endsWith('"') && token.length >= 2) {
    return token.slice(1, -1).replace(/\\(.)/g, (_m, ch: string) => {
      if (ch === "n") return "\n";
      if (ch === "t") return "\t";
      if (ch === "r") return "\r";
      return ch;
    });
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
    if (rest !== "") {
      result[key] = parseInlineScalar(rest);
      i += 1;
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
    items.push(parseInlineScalar(body));
    i += 1;
  }
  return { value: Object.freeze(items), next: i };
}
