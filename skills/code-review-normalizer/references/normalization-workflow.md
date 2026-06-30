# Code Review Normalization Workflow

## Purpose

Use this workflow to convert raw DeepSeek, Codex, human, or other review feedback into a stable `04-代码审核` artifact.

The output must let the implementer understand exactly what to fix and let the Gate decide whether the requirement can proceed.

## Step 1: Identify Review Context

Collect:

- Requirement ID
- Reviewer or review source
- Review date
- Reviewed diff, commit range, PR, patch, or changed file list
- Related `01-技术方案`
- Related `02-方案审核`
- Related `03-实现记录`
- Test or verification context if referenced

Stop if both raw review feedback and reviewed code scope are missing.

## Step 2: Split Raw Review Into Findings

Split the raw review into independent findings.

Each finding should have:

- Short title
- File
- Line or symbol
- Problem
- Impact
- Suggested fix
- Severity
- Blocking flag

Do not merge unrelated findings under one ID.

## Step 3: Map Findings To Specification Basis

For behavior-affecting findings, identify the basis from:

- Technical specification
- Solution review Gate
- Implementation record
- Explicit approved user requirement
- Code review checklist

If no basis exists, mark `Specification Basis: missing` and decide whether this is Specification Missing or an out-of-scope suggestion.

## Step 4: Normalize Severity

Use Critical, High, Medium, Low.

Critical and High must be actionable and include file/symbol evidence.

Low can include style, naming, comments, or non-blocking maintainability suggestions.

## Step 5: Decide Gate Result

Use:

- `FAIL` for Critical.
- `FAIL` for unaccepted High.
- `PASS_WITH_RISK` for accepted High.
- `PASS` when only Medium/Low/non-blocking findings remain.

## Step 6: Recommend Next Step

Use one:

- `Fix implementation and update implementation record`
- `Apply change-control and re-Gate`
- `Return to specification-writer`
- `Run implementation-recorder`
- `Run test-feedback-classifier`
- `Run gate-runner`

Do not recommend direct test/release when Critical or unaccepted High remains.
