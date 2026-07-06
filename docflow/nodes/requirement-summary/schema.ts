// Requirement Summary Schema
// Lightweight runtime validation schema.
// JSON Schema equivalent is at ../../schemas/requirement.schema.json

type RequirementSummarySchemaContract = {
  parse(obj: unknown): asserts obj is Record<string, unknown>;
};

export const RequirementSummarySchema: RequirementSummarySchemaContract = {
  parse(obj: unknown): asserts obj is Record<string, unknown> {
    const o = obj as Record<string, unknown>;
    if (!o || typeof o !== "object") throw new Error("Invalid requirement summary: not an object");
    if (!o.requirement_id) throw new Error("Missing requirement_id");
    if (typeof o.multi_repo !== "boolean") throw new Error("multi_repo must be boolean");
    if (!Array.isArray(o.sub_requirements)) throw new Error("sub_requirements must be array");
  },
};
