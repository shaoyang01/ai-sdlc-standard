// Kimi One-Shot Text Output Normalizer
// =======================================
// Narrow normalization for Kimi `--output-format text` one-shot output.
// Removes only a known presentation prefix ("• ") when it appears at the
// beginning of the complete response.
//
// Deliberately does NOT:
//   - extract JSON from arbitrary prose
//   - search for the first `{` and last `}`
//   - strip markdown fences
//   - silently repair malformed JSON
//
// Runtime schema validation remains authoritative.

const KIMI_BULLET_PREFIX = "\u2022 "; // "• "

/**
 * Normalize Kimi one-shot `--output-format text` output.
 *
 * Allowed transformations:
 *   - Trim leading/trailing whitespace
 *   - Remove exactly one leading "• " (bullet + space) when it appears
 *     at the beginning of the complete response
 *
 * Deliberately does NOT:
 *   - Remove a bare bullet character without trailing space
 *   - Extract JSON from arbitrary prose
 *   - Search for the first `{` and last `}`
 *   - Strip markdown fences
 *   - Silently repair malformed JSON
 *
 * Runtime schema validation remains authoritative.
 */
export function normalizeKimiOneShotTextOutput(value: string): string {
  let result = value.trim();
  if (result.startsWith(KIMI_BULLET_PREFIX)) {
    result = result.slice(KIMI_BULLET_PREFIX.length);
  }
  return result;
}
