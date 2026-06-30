---
name: sdlc-code-review-excellence
description: |
  This skill should be used when the user asks to "执行代码审查", "做 Code Review", "审查这次实现", "检查实现是否符合方案", "按标准做代码审核", or asks to review code changes against approved DocFlow, specs, tasks, implementation records, and verification evidence before sdlc-code-review-normalizer writes the `04-代码审核` artifact.
version: 0.1.0
---

# sdlc-code-review-excellence

Perform standards-based code review for an implemented requirement. Treat the approved specification, solution review, tasks, implementation record, and diff as review sources; identify actionable findings with severity and evidence; then hand the review result to `sdlc-code-review-normalizer` or `sdlc-docflow-writer` when a formal `04-代码审核` artifact is needed.

## Core Rules

1. Review code against approved artifacts, not personal preference.
2. Require diff, changed file list, or commit range before making file-level findings.
3. Require specification basis for behavioral findings.
4. Focus on correctness, compatibility, data consistency, transaction, idempotency, exception handling, performance, security, maintainability, and test gaps.
5. Distinguish blocking issues from suggestions, nits, and learning notes.
6. Do not modify production code.
7. Do not rewrite specs, implementation records, review artifacts, or knowledge base documents.
8. Do not invent findings that are not supported by code or artifact evidence.
9. Do not turn style preferences into blocking issues when formatting or linting should handle them.
10. Do not accept implementation behavior that exceeds approved scope.
11. Route scope gaps, requirement changes, or specification missing findings to the earliest affected Gate.
12. Route formal report normalization to `sdlc-code-review-normalizer`.
13. Route reusable checklist or schema improvements to `sdlc-test-feedback-sync` or standard governance.
14. Recommend manifest Code Review Gate updates, but do not write them unless explicitly requested through the appropriate writer.

## Required Standard Files

Use these repository standard files as authoritative rules:

- `../../skill-contracts/known-skills/sdlc-code-review-excellence.md`
- `../../ess/code-review-schema.md`
- `../../checklists/code-review-checklist.md`
- `../../ai-sdlc/phase-gates.md`
- `../../ai-sdlc/artifact-storage.md`
- `../../ai-sdlc/change-control.md`
- `../../templates/artifact-manifest-template.md`

## Reference Files

Load these references as needed:

- `references/review-inputs.md` for required inputs and readiness checks.
- `references/review-workflow.md` for review order and inspection dimensions.
- `references/finding-standards.md` for finding shape, severity, and evidence rules.
- `references/blocking-and-regate.md` for blocking conditions and upstream routing.
- `references/output-and-handoff.md` for output shape, normalizer handoff, and manifest recommendations.

## Workflow

### 1. Resolve Review Inputs

Read `references/review-inputs.md`.

Identify:

- Requirement ID
- Reviewed diff, commit range, PR, or changed file list
- Source technical specification
- Source solution review
- Source implementation record
- Source `specs/**`, plan, and tasks when Speckit was used
- Verification evidence
- Existing code review report, if any
- `manifest.md`, if available

Stop when diff or changed file scope is missing.

### 2. Verify Review Readiness

Read:

- `references/review-inputs.md`
- `references/blocking-and-regate.md`

Continue only when implementation evidence and specification basis are sufficient for meaningful review. Mark missing artifacts explicitly.

### 3. Review Code Systematically

Read `references/review-workflow.md`.

Inspect in this order:

- Scope and traceability to approved tasks
- Behavioral correctness
- Compatibility with existing flow
- Data consistency and persistence
- Transaction, idempotency, retry, timeout, and rollback behavior
- Exception handling and failure semantics
- Security and authorization
- Performance and scalability
- Observability and diagnosability
- Test coverage and verification quality
- Maintainability and fit with existing patterns

### 4. Classify Findings

Read `references/finding-standards.md`.

For every finding, include:

- Severity
- Category
- File and line or symbol
- Specification basis
- Problem
- Impact
- Suggested fix
- Blocking decision

Keep suggestions separate from required fixes.

### 5. Decide Review Result

Read `references/blocking-and-regate.md`.

Use:

- `FAIL` when any Critical issue exists.
- `FAIL` when any High issue lacks explicit risk acceptance.
- `PASS_WITH_RISK` when High issues exist and risk acceptance is complete.
- `PASS` when no Critical or unaccepted High issue exists.

### 6. Output And Handoff

Read `references/output-and-handoff.md`.

Report:

- Review result
- Findings grouped by severity
- Missing information
- Re-Gate recommendation
- Normalizer handoff recommendation
- Manifest update recommendation
- Next step

## Output Requirements

Every code review result must contain:

- Source Artifacts
- Reviewed Scope
- Review Result
- Findings By Severity
- Missing Information
- Re-Gate Recommendation
- Suggested Fixes
- Normalizer Handoff
- Manifest Update Recommendation
- Next Step

## Stop Conditions

Stop instead of producing a confident review result when:

- Reviewed diff, commit range, or changed file list is missing.
- Required specification basis is missing for behavior-changing code.
- Implementation evidence is missing or contradicts the diff.
- Current source artifacts conflict.
- Review would require guessing business behavior.
- Suggested fix would expand approved scope.
- User asks to modify code inside this skill.
