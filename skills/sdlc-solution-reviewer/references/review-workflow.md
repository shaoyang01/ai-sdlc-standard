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
| Decision Scope | `FULL_REQUIREMENT` or `DELTA_CHANGE`; infer from Change Event and supplement routing fields. |
| Same Requirement Decision | Required for Requirement Supplement or Specification Missing review. |

Stop if no technical specification can be found.

## Step 2: Source Reading

Read the technical specification completely.

Read optional context only when needed:

- `00-需求资料` for requirement intent.
- `manifest.md` for current stage, old Gate result, stale or replaced artifacts, and Re-Gate records.
- `specs/**` only when the user says the requirement already entered Speckit or references a specific spec path.
- Code files only when the technical specification depends on actual code behavior.

Do not treat chat history as a stable source unless the user explicitly confirms it as requirement input.

For Requirement Supplement or Specification Missing reviews, read the technical specification's Change Event, Parent Requirement ID, Same Requirement Decision, Current Change Scope / Delta Scope, Aggregate Requirement Scope, Original Implemented / Approved Scope, Out of Delta Scope, Earliest Affected Node, Ignored Aggregate Triggers, Aggregate Complexity: reference only, and Re-Gate Records before judging complexity.

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

Before the Gate / Development Path / Tail decision, complete the current-goal global/material scan and close direct impacts (caller/callee or dependency, consumer, state/data, failure/compatibility, verification) per `ai-sdlc/goal-anchored-global-reasoning.md`. A FAIL-eligible finding does not end discovery: continue the remaining reliable bounded material surfaces, then decide.

After issue classification:

1. Decide Gate Result.
2. Decide Decision Scope: `FULL_REQUIREMENT` / `DELTA_CHANGE`.
3. If Decision Scope = `DELTA_CHANGE`, decide Delta Complexity from Current Change Scope / Delta Scope and keep Aggregate Complexity as reference only.
4. Decide Development Path Decision, following the canonical standard `ai-sdlc/development-path-governance.md`: the path is decided only by the complexity of the Current Implementation Scope or Delta Scope itself; business_domain_sync need、knowledge sync need、entry coverage need 或 Shared Tail 工作本身都不是 Speckit 触发因素。
5. Record the Decision evidence: Development Path Decision Source（`sdlc-solution-reviewer`）、Development Path Decision Artifact（response-only 时为 `not_persisted`）、Development Path Decision Artifact Status（`current` / `stale` / `not_persisted`）。
6. Give the initial Shared Documentation Governance Tail recommendation: Tail Required、Tail Scope（来自 Current Implementation Scope 或 Delta Scope）、Tail Status（`planned` / `blocked` / `not_required`）。Solution Reviewer 不作 Tail Completion 判断，不生成 `03-实现记录`、`04-代码审核`、`05-测试验收`，不执行 Sync 或 Reconcile。
7. Explain why.
8. List required fixes before the next stage.
9. Recommend manifest updates.

Never recommend direct implementation when Critical or unaccepted High issues exist.
Do not route by aggregate complexity for requirement supplements; Development Path Decision must be based on Delta Scope.
