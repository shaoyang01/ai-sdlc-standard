// Tech Design Schema — lightweight runtime validation.
export const TechDesignSchema = {
  parse(obj: unknown): asserts obj is Record<string, unknown> {
    const o = obj as Record<string, unknown>;
    if (!o || typeof o !== "object") throw new Error("Invalid tech design");
    if (!o.approach) throw new Error("Missing approach");
    if (!Array.isArray(o.risks)) throw new Error("risks must be array");
  },
};
