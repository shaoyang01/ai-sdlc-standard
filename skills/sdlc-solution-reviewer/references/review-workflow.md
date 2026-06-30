# Solution Reviewer Workflow

## Purpose

Use this workflow to review a technical specification before implementation path selection.

The expected upstream flow is:

```text
sdlc-requirement-normalizer
  -> sdlc-specification-writer
  -> sdlc-solution-reviewer
  -> DIRECT_IMPLEMENTATION / SPECKIT_PIPELINE_REQUIRED / BLOCKED_NEEDS_REVISION
```

## Step 1: Input Resolution

Resolve these values:

| Field | Rule |
| --- | --- |
| Requirement ID | Prefer explicit user input; otherwise infer from `library/{requirement_id}` path. |
| Specification artifact | Must come from `01-技术方案`. |
| Review output | Must target `02-方案审核`. |
| Manifest | Optional input; recommend updates even if missing. |
| Repository context | Optional; use when needed to validate implementation risk. |

Stop if no technical specification can be found.

## Step 2: Source Reading

Read the technical specification completely.

Read optional context only when needed:

- `00-需求资料` for requirement intent.
- `manifest.md` for current stage, old Gate result, superseded artifacts, and Re-Gate records.
- `specs/**` only when the user says the requirement already entered Speckit or references a specific spec path.
- Code files only when the technical specification depends on actual code behavior.

Do not treat chat history as a stable source unless the user explicitly confirms it as requirement input.

## Step 3: Schema Coverage

Check the specification against `ess/specification-schema.md`.

Required sections include:

- 背景
- 目标
- Scope
- 原流程
- 新流程
- 行为约束
- 实现约束
- 状态流转
- 数据来源
- 日志
- 监控
- 异常处理
- 边界条件
- 测试方案
- 风险

Conditional sections become required when relevant:

- 数据变更
- 接口变更
- 数据库变更
- 缓存影响
- MQ 影响

Missing required behavior-affecting sections are Critical or High.

## Step 4: Behavior Safety Review

Check whether the specification answers:

- 条件未命中时是否保持原流程。
- 新逻辑失败时是否影响原流程。
- 新逻辑超时时是否影响原流程。
- 新逻辑异常是否允许向上传播。
- 是否改变原返回值。
- 是否改变原状态。
- 是否改变原事务边界。
- 是否改变原日志、MQ、缓存、DB 写入。

If the implementation would require guessing any of these answers, mark Critical and recommend `BLOCKED_NEEDS_REVISION`.

## Step 5: Risk and Test Review

Check:

- Failure handling: API/RPC/MQ/DB/Redis/Timeout/Exception.
- Idempotency: duplicate execution and retry behavior.
- Concurrency: conflict and race handling.
- Data behavior: empty data, historical data, invalid data.
- Observability: logs, metrics, alerts, troubleshooting fields.
- Testability: main path, miss path, failure downgrade, idempotency, old-flow compatibility.

Testing gaps that prevent validating the core requirement are Critical or High.

## Step 6: Gate and Path Decision

After issue classification:

1. Decide Gate Result.
2. Decide Development Path Recommendation.
3. Explain why.
4. List required fixes before the next stage.
5. Recommend manifest updates.

Never recommend direct implementation when Critical or unaccepted High issues exist.
