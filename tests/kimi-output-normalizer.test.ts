// Regression Test — Kimi One-Shot Text Output Normalizer
// =========================================================
// Tests narrow normalization for Kimi `--output-format text` output.
// Only removes the known `\u2022 ` bullet prefix. No JSON extraction.

import { normalizeKimiOneShotTextOutput } from "../execution/kimi-output-normalizer";

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Kimi Output Normalizer Test\n");

  // Test 1: Clean JSON passes through unchanged
  console.log("Test 1: Clean JSON passes through");
  const json = '{"requirement_id":"REQ-1","multi_repo":false,"main_repo":"main","sub_requirements":[]}';
  const r1 = normalizeKimiOneShotTextOutput(json);
  assert(r1 === json, "JSON unchanged");
  console.log("");

  // Test 2: Bullet prefix removed
  console.log("Test 2: Bullet prefix removed");
  const bulletJson = '\u2022 {"requirement_id":"REQ-1","multi_repo":false}';
  const r2 = normalizeKimiOneShotTextOutput(bulletJson);
  assert(r2 === '{"requirement_id":"REQ-1","multi_repo":false}', "bullet removed");
  assert(!r2.startsWith("\u2022"), "no bullet in result");
  console.log("");

  // Test 3: Bullet prefix with multiline JSON
  console.log("Test 3: Bullet prefix with multiline JSON");
  const multiline = '\u2022 {\n  "requirement_id": "REQ-1",\n  "multi_repo": false\n}';
  const r3 = normalizeKimiOneShotTextOutput(multiline);
  assert(r3.startsWith("{"), "starts with {");
  assert(r3.endsWith("}"), "ends with }");
  assert(r3.includes('"requirement_id"'), "JSON intact");
  assert(!r3.startsWith("\u2022"), "no bullet");
  console.log("");

  // Test 4: Leading/trailing whitespace trimmed
  console.log("Test 4: Whitespace trimmed");
  const wsJson = '  \n  {"requirement_id":"REQ-1"}  \n  ';
  const r4 = normalizeKimiOneShotTextOutput(wsJson);
  assert(r4 === '{"requirement_id":"REQ-1"}', "whitespace trimmed");
  console.log("");

  // Test 5: Bullet + whitespace trimmed together
  console.log("Test 5: Bullet with surrounding whitespace");
  const bulletWs = '  \n  \u2022 {"requirement_id":"REQ-1"}  \n  ';
  const r5 = normalizeKimiOneShotTextOutput(bulletWs);
  assert(r5 === '{"requirement_id":"REQ-1"}', "bullet and whitespace handled");
  console.log("");

  // Test 6: Arbitrary prose NOT normalized (only exact bullet prefix)
  console.log("Test 6: Arbitrary prose is NOT extracted");
  const prose = 'Here is the result: {"requirement_id":"REQ-1"}';
  const r6 = normalizeKimiOneShotTextOutput(prose);
  assert(r6 === prose, "prose unchanged — no JSON extraction");
  assert(r6.startsWith("Here is"), "starts with prose");
  console.log("");

  // Test 7: Prose with bullet mid-text NOT removed
  console.log("Test 7: Bullet mid-text preserved");
  const midBullet = 'Item 1 \u2022 {"requirement_id":"REQ-1"}';
  const r7 = normalizeKimiOneShotTextOutput(midBullet);
  assert(r7 === midBullet, "mid-text bullet preserved");
  console.log("");

  // Test 8: Empty string
  console.log("Test 8: Empty string");
  const r8 = normalizeKimiOneShotTextOutput("");
  assert(r8 === "", "empty unchanged");
  console.log("");

  // Test 9: Only bullet (just the prefix, no content)
  console.log("Test 9: Bullet with no content");
  const r9 = normalizeKimiOneShotTextOutput("\u2022 ");
  assert(r9 === "", "bullet-only becomes empty");
  console.log("");

  // Test 10: Bullet prefix on non-JSON text
  console.log("Test 10: Bullet prefix on non-JSON text");
  const bulletText = "\u2022 Just some text response";
  const r10 = normalizeKimiOneShotTextOutput(bulletText);
  assert(r10 === "Just some text response", "bullet removed from plain text");
  console.log("");

  // Test 11: Markdown fences NOT stripped
  console.log("Test 11: Markdown fences preserved");
  const fenced = '```json\n{"requirement_id":"REQ-1"}\n```';
  const r11 = normalizeKimiOneShotTextOutput(fenced);
  assert(r11 === fenced, "fences preserved — no stripping");
  console.log("");

  // Test 12: Double bullet (only first removed)
  console.log("Test 12: Double bullet — only first removed");
  const doubleBullet = "\u2022 \u2022 content";
  const r12 = normalizeKimiOneShotTextOutput(doubleBullet);
  assert(r12 === "\u2022 content", "only first bullet removed");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
