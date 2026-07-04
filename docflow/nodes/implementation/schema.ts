// Implementation Schema — lightweight runtime validation.
export const ImplementationSchema = {
  parse(obj: unknown): asserts obj is Record<string, unknown> {
    const o = obj as Record<string, unknown>;
    if (!o || typeof o !== "object") throw new Error("Invalid implementation");
    if (!Array.isArray(o.files_changed)) throw new Error("files_changed must be array");
  },
};
