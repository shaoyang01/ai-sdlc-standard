// Review Schema — lightweight runtime validation.
export const ReviewSchema = {
  parse(obj: unknown): asserts obj is Record<string, unknown> {
    const o = obj as Record<string, unknown>;
    if (!o || typeof o !== "object") throw new Error("Invalid review");
    if (!["PASS", "FAIL", "PASS_WITH_RISK"].includes(String(o.result))) throw new Error("Invalid review result");
    if (!Array.isArray(o.issues)) throw new Error("issues must be array");
  },
};
