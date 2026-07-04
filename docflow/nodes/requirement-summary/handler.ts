// Requirement Summary Node
// ========================
// Pure parser: extracts basic structure fields from raw text.
// Detects multi-repo via rule-based keyword matching ONLY.
// NO decision making, NO complexity inference, NO routing.
// PURE STATE MACHINE NODE.

import {
  DocFlowNode,
  DocFlowContext,
  StageRecord,
  RequirementSummaryOutput,
} from "../../types/index";

import { RequirementSummarySchema } from "./schema";

// Rule-based multi-repo detection keywords ONLY
const MULTI_REPO_KEYWORDS: RegExp[] = [
  /\b(sync|integration|event|pipeline|API|service|system|orchestrat)\b/i,
];

// Multiple system names pattern (e.g. "repo-A calls repo-B")
const MULTI_SYSTEM_PATTERN: RegExp = /\b([A-Z][a-z]+[-_][A-Z][a-z]+)\b.*\b([A-Z][a-z]+[-_][A-Z][a-z]+)\b/;

export class RequirementSummaryNode implements DocFlowNode {
  name = "requirement-summary";

  async execute(context: DocFlowContext): Promise<DocFlowContext> {
    const startedAt = new Date().toISOString();
    const record: StageRecord = {
      stage: this.name,
      status: "running",
      started_at: startedAt,
      completed_at: null,
      output: null,
      error: null,
    };

    try {
      const output = this.parse(context);
      RequirementSummarySchema.parse(output);

      record.status = "completed";
      record.completed_at = new Date().toISOString();
      record.output = output as unknown as Record<string, unknown>;

      context.artifacts["requirement-summary"] = output;
      context.current_stage = this.name;
      context.history.push(record);
      context.updated_at = record.completed_at;

      return context;
    } catch (error) {
      record.status = "failed";
      record.completed_at = new Date().toISOString();
      record.error = error instanceof Error ? error.message : String(error);
      context.history.push(record);
      throw error;
    }
  }

  private parse(context: DocFlowContext): RequirementSummaryOutput {
    const text = context.raw_text;
    const multiRepo = this.detectMultiRepo(text);
    const subRequirements = multiRepo ? this.extractSubRequirements(text) : [];

    return {
      requirement_id: context.requirement_id,
      multi_repo: multiRepo,
      main_repo: this.extractMainRepo(text),
      sub_requirements: subRequirements,
      raw_text: text,
      parsed_at: new Date().toISOString(),
    };
  }

  // RULE 4: Multi-repo detection is PURELY rule-based
  private detectMultiRepo(text: string): boolean {
    const hasKeyword = MULTI_REPO_KEYWORDS.some((p) => p.test(text));
    const hasMultipleSystems = MULTI_SYSTEM_PATTERN.test(text);
    return hasKeyword || hasMultipleSystems;
  }

  // Extract sub-requirements per repo — structural only, no intelligence
  private extractSubRequirements(text: string): RequirementSummaryOutput["sub_requirements"] {
    const results: RequirementSummaryOutput["sub_requirements"] = [];
    const sentences = text.split(/[.;。；\n]+/);

    for (const sentence of sentences) {
      const repoMatch = sentence.match(/\b(repo[-_][A-Z]+|[A-Z][a-z]+Repo)\b/i);
      if (repoMatch) {
        results.push({
          repo: repoMatch[1],
          description: sentence.trim(),
        });
      }
    }

    return results.length > 0 ? results : [];
  }

  // Extract main repo name — structural only
  private extractMainRepo(text: string): string {
    const match = text.match(/\b(repo[-_][A-Z]+|[A-Z][a-z]+Repo|main[-_]repo[:\s]*([A-Za-z_-]+))\b/i);
    return match ? match[1] || match[2] || "unknown" : "unknown";
  }
}
