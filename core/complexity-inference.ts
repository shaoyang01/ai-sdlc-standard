// Complexity Inference — Safe Heuristic
// ======================================
// Purely rule-based, no AI, no randomness.
// Returns "medium" for unknown inputs (conservative default).

export function inferComplexity(
  input: Record<string, unknown> | string | null | undefined
): "low" | "medium" | "high" {
  if (!input) return "medium";

  const text = typeof input === "string" ? input : JSON.stringify(input);

  if (text.length < 200) return "low";
  if (text.length > 2000) return "high";

  return "medium";
}
