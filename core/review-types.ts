// Code Review Types
// =================
// Pure type definitions for code review and findings.
// No Git / PR / filesystem fields.
// No disk write or commit operations.

export type CodeReviewStatus = "PASS" | "FAIL";

export type CodeReviewFinding = Readonly<{
  severity: "low" | "medium" | "high";
  message: string;
  artifactId?: string;
  file?: string;
}>;

export type CodeReviewResult = Readonly<{
  status: CodeReviewStatus;
  findings: ReadonlyArray<CodeReviewFinding>;
  summary: string;
}>;
