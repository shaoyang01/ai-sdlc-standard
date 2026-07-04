// Requirement Summary Node
// ========================
// Parses raw requirement text and generates a structured summary.
// Detects multi-repo scenarios via rule-based keyword matching.
// No AI/ML dependency — pure rule-based detection.

import {
  DocFlowNode,
  DocFlowContext,
  StageRecord,
  RequirementSummaryOutput,
  SubRequirement,
  DependencyType,
  ComplexityHint,
} from "../../types/index";

import { RequirementSummarySchema } from "./schema";

// Multi-repo detection keywords
const MULTI_REPO_PATTERNS: RegExp[] = [
  /\b(multi.repo|multiple repositor|across repo|cross.repo)\b/i,
  /\b(repo.A.*repo.B|repo.B.*repo.A)\b/i,
  /\bA\s+calls\s+B\b/i,
];

// Dependency type keywords
const DEPENDENCY_PATTERNS: Record<DependencyType, RegExp[]> = {
  api: [/\b(API|REST|HTTP|endpoint|接口)\b/i],
  data: [/\b(DB|database|schema|table|数据|schema|migration)\b/i],
  event: [/\b(MQ|MCQ|event|Kafka|message|topic|事件|消息)\b/i],
  unknown: [/.*/],
};

// Complexity keywords
const COMPLEXITY_PATTERNS: Record<ComplexityHint, RegExp[]> = {
  high: [/\b(multi.repo|multi.module|cross.system|orchestrat|complex|复杂)\b/i],
  medium: [/\b(multiple|several|multi|多个|几个)\b/i],
  low: [/\b(simple|single|fix|简单|单个|修复)\b/i],
};

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

      // Validate against schema
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
    const complexity = this.detectComplexity(text, multiRepo);

    return {
      requirement_id: context.requirement_id,
      multi_repo: multiRepo,
      main_repo: this.extractMainRepo(text),
      sub_requirements: subRequirements,
      complexity_hint: complexity,
      raw_text: text,
      parsed_at: new Date().toISOString(),
    };
  }

  // 1. Simple multi-repo detection via regex
  private detectMultiRepo(text: string): boolean {
    return MULTI_REPO_PATTERNS.some((p) => p.test(text));
  }

  // 2. Extract sub-requirements per repo
  private extractSubRequirements(text: string): SubRequirement[] {
    const results: SubRequirement[] = [];
    // Split by sentence boundaries
    const sentences = text.split(/[.;。；\n]+/);

    for (const sentence of sentences) {
      const repoMatch = sentence.match(/\b(repo[-_][A-Z]+|[A-Z][a-z]+Repo)\b/);
      if (repoMatch) {
        const repo = repoMatch[1];
        const depType = this.detectDependencyType(sentence);
        results.push({
          repo,
          dependency_type: depType,
          description: sentence.trim(),
        });
      }
    }

    return results.length > 0 ? results : [];
  }

  // 3. Detect dependency type per sub-requirement
  private detectDependencyType(text: string): DependencyType {
    for (const [type, patterns] of Object.entries(DEPENDENCY_PATTERNS)) {
      if (patterns.some((p) => p.test(text))) {
        return type as DependencyType;
      }
    }
    return "unknown";
  }

  // 4. Complexity hint
  private detectComplexity(text: string, multiRepo: boolean): ComplexityHint {
    if (multiRepo) return "high";
    for (const [level, patterns] of Object.entries(COMPLEXITY_PATTERNS)) {
      if (patterns.some((p) => p.test(text))) {
        return level as ComplexityHint;
      }
    }
    return "medium";
  }

  // 5. Extract main repo name
  private extractMainRepo(text: string): string {
    const match = text.match(/\b(repo[-_][A-Z]+|[A-Z][a-z]+Repo|main[-_]repo[:\s]*([A-Za-z_-]+))\b/i);
    return match ? match[1] || match[2] || "unknown" : "unknown";
  }
}
