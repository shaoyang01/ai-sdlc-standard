// Validation Schema — lightweight runtime validation.
export const ValidationSchema = {
  parse(obj: unknown): asserts obj is Record<string, unknown> {
    const o = obj as Record<string, unknown>;
    if (!o || typeof o !== "object") throw new Error("Invalid validation");
    if (typeof o.passed !== "boolean") throw new Error("passed must be boolean");
    if (!Array.isArray(o.checks)) throw new Error("checks must be array");
  },
};
