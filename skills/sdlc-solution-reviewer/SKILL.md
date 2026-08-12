---
name: sdlc-solution-reviewer
description: |
  This skill should be used when the user asks to "审阅技术方案", "方案审阅", "检查方案是否能开发", "判断是否需要 Speckit", "审核 DeepSeek 方案", "输出方案审核", or asks Codex to review a technical specification and decide whether to implement directly or enter sdlc-speckit-pipeline.
version: 0.1.0
---

# Solution Reviewer

Review a technical specification as the global DocFlow Specification Gate. Decide whether the requirement can proceed to direct implementation, must enter `sdlc-speckit-pipeline`, or must return to specification revision.

## Core Rules

1. Review only the technical specification and supporting context.
2. Do not write or rewrite the technical specification.
3. Do not modify production code.
4. Do not modify `specs/**` or `.specify/business_domain/**`.
5. Do not silently continue when core business behavior is undefined.
6. Treat `library/{requirement_id}/01-技术方案/` as the primary input.
7. Write or recommend output under `library/{requirement_id}/02-方案审核/`.
8. Use `PASS`, `FAIL`, or `PASS_WITH_RISK`.
9. Always output a Development Path Decision:
   - `DIRECT_IMPLEMENTATION`
   - `SPECKIT_PIPELINE_REQUIRED`
   - `BLOCKED_NEEDS_REVISION`
10. Require explicit risk acceptance for `PASS_WITH_RISK`.
11. Apply the Goal-Anchored Global Reasoning contract: complete the current-goal global/material scan and direct impact closure before the unchanged Gate, Development Path and Tail decisions; FAIL eligibility does not end discovery (see `${AI_SDLC_STANDARD_HOME}/ai-sdlc/goal-anchored-global-reasoning.md`).

## Required Standard Files

Use these repository standard files as authoritative rules:

- `${AI_SDLC_STANDARD_HOME}/skill-contracts/known-skills/sdlc-solution-reviewer.md`
- `${AI_SDLC_STANDARD_HOME}/ess/specification-schema.md`
- `${AI_SDLC_STANDARD_HOME}/ess/review-schema.md`
- `${AI_SDLC_STANDARD_HOME}/checklists/specification-checklist.md`
- `${AI_SDLC_STANDARD_HOME}/templates/gate-result-template.md`
- `${AI_SDLC_STANDARD_HOME}/templates/artifact-manifest-template.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/artifact-storage.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/change-control.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/complexity-routing.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/development-path-governance.md`

## Reference Files

Load these references as needed:

- `references/review-workflow.md` for the step-by-step review workflow.
- `references/development-path-decision.md` for direct implementation vs Speckit routing.
- `references/checklist.md` for severity and coverage checks.
- `references/output-report.md` for the report structure and manifest update suggestions.
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/goal-anchored-global-reasoning.md` for the shared goal-anchored global reasoning contract (anchor, global-first, impact closure, root-cause consolidation, bounded continuation).

## Workflow

### 1. Resolve Input

Identify:

- Requirement ID
- Technical specification path
- Optional requirement source path
- Optional manifest path
- Optional repository context
- Requested output format, if any

If the technical specification path is missing, search the current repository for:

```text
library/{requirement_id}/01-技术方案/*
```

If no technical specification can be found, stop and report the missing artifact.

### 2. Load Review Rules

Read:

- `references/review-workflow.md`
- `references/development-path-decision.md`
- `references/checklist.md`

Also read `references/output-report.md` before producing a final report or writing an artifact.

### 3. Review Specification

Check the technical specification against:

- ESS required sections
- Behavior preservation
- Original-flow compatibility
- Failure, timeout, exception, retry, idempotency, and transaction handling
- State transitions
- Data source and empty-data behavior
- DB, cache, MQ, API, and logging impact
- Monitoring and observability
- Test strategy and acceptance criteria
- Requirement change and Re-Gate implications

Classify every issue as Critical, High, Medium, or Low.

Complete the current-goal global/material scan first and close direct impacts (caller/callee or dependency, consumer, state/data, failure/compatibility, verification) before any Gate / Development Path / Tail decision. A FAIL-eligible finding does not end discovery: continue the remaining reliable bounded material surfaces, then decide.

### 4. Decide Gate Result

Use these rules:

- Any Critical issue -> `FAIL`
- Any High issue without explicit risk acceptance -> `FAIL`
- High issues with explicit risk acceptance -> `PASS_WITH_RISK`
- No Critical / unaccepted High -> `PASS`

Do not produce `PASS_WITH_RISK` unless accepted risk, accepted by, reason, and follow-up are known.

### 5. Decide Development Path

Classify complexity first:

- `SIMPLE`
- `MEDIUM`
- `COMPLEX`
- `BLOCKED_UNKNOWN`

Use `${AI_SDLC_STANDARD_HOME}/ai-sdlc/complexity-routing.md` as the routing rule and `${AI_SDLC_STANDARD_HOME}/ai-sdlc/development-path-governance.md` as the canonical Development Path and Shared Documentation Governance Tail standard.

Output exactly one Development Path Decision:

- `DIRECT_IMPLEMENTATION`
- `SPECKIT_PIPELINE_REQUIRED`
- `BLOCKED_NEEDS_REVISION`

Use `BLOCKED_NEEDS_REVISION` whenever the Gate Result is `FAIL`.

The path is decided only by the complexity of the Current Implementation Scope or Delta Scope itself. Use `SPECKIT_PIPELINE_REQUIRED` only when:

1. Current Implementation Scope or Delta Scope itself is `COMPLEX` (multi-module or cross-repo work, state machine changes, DB schema, MQ, schedule/listener/process changes, key data writes, complex transactions, complex rollback, or other genuine full-SDD complexity); or
2. Full SDD Override = `user_requested`; or
3. A current valid later Gate requires switching paths (Full SDD Override = `later_gate_required`).

business_domain_sync need 本身不自动触发 `SPECKIT_PIPELINE_REQUIRED`。知识同步需要、稳定业务事实记录需要、entry coverage 需要或 Shared Tail 工作本身都不是 Speckit 触发因素。

Use `DIRECT_IMPLEMENTATION` only when the specification is complete, Complexity is `SIMPLE` or `MEDIUM`, and implementation can proceed without a full SDD pipeline. Direct Implementation 不要求"实现不需要 domain knowledge sync"。

### 5.1 Initial Shared Tail Recommendation

Solution Reviewer 只负责给出初始 Shared Documentation Governance Tail 建议，不负责最终 Tail Completion。

每份输出必须包含：

- `Tail Required: yes / no`
- `Tail Scope: <current implementation scope or delta scope>`
- `Tail Status: planned / blocked / not_required`

规则：

- 当前范围预计产生代码、配置或行为实现时：`Tail Required: yes`。
- `DIRECT_IMPLEMENTATION` 或 `SPECKIT_PIPELINE_REQUIRED` 且 Tail Required=yes 时：`Tail Status: planned`。
- `BLOCKED_NEEDS_REVISION` 时：`Tail Status: blocked`，不得进入实现或执行 Tail；Tail Required 仍按该范围未来是否会产生实际实现判断，不得因当前被阻塞而静默省略未来必需 Tail。
- 纯文档或纯治理范围、不产生代码、配置或行为实现时：可以 `Tail Required: no` 且 `Tail Status: not_required`，但必须给出明确 basis，不得把普通代码修改误判为纯治理任务。
- `Tail Scope` 必须来自 Current Implementation Scope 或 Delta Scope，不得用整个历史需求的 Aggregate Scope 替代 Delta Scope。

Solution Reviewer 不得将 Tail 标记为 completed，不作 Tail Completion Gate 判断，不生成 `03-实现记录`、`04-代码审核`、`05-测试验收`，不替 business-domain Sync 或 Reconcile 作专业 decision，不执行 Sync 或 Reconcile，不修改生产代码或知识材料。

### 6. Output or Write Report

By default, return the review report in the response (response-only). Response-only 输出必须精确使用：

```text
Development Path Decision Artifact: not_persisted
Development Path Decision Artifact Status: not_persisted
```

response-only 结果仍是本次响应中的审核结论，但不得伪装为 Manifest 可稳定追踪的 persisted evidence；不得虚构路径、版本、文件存在性或 `current` 状态。

When the user explicitly asks to generate an artifact, write:

```text
library/{requirement_id}/02-方案审核/{requirement_id}_方案审核.md
```

`Development Path Decision Artifact` 必须指向该稳定路径，禁止创建 `_vN.md` 或其他 filename-versioned companion artifact。持久化报告必须记录当前内部 Version，并与被审核技术方案的版本绑定。`Development Path Decision Artifact Status` 使用 `current` / `stale`：只有当方案审核 artifact 位于稳定路径、可读取、未被 replaced、所审核的技术方案版本仍是当前有效版本且自身未 stale 时，才可以标记为 `current`。

If the user asks for HTML or Lark/Feishu output, use `sdlc-docflow-writer` for routing and publishing. Keep this skill responsible for review content only.

### 7. Report Manifest Updates

Always recommend manifest updates for:

- Artifact Index: `02 方案审核`
- Gate Decisions: `方案审核`
- Development Path Decision
- Documentation Governance Tail 初始建议（Tail Required / Tail Scope / Tail Status）
- Activity Log
- Blocking Issues or Next Step

Do not silently edit manifest unless the user explicitly asks for file updates.

## Output Requirements

Every review report must contain:

- Reviewed Artifact
- Result
- Can Continue
- Decision Scope: `FULL_REQUIREMENT` / `DELTA_CHANGE`
- Complexity: `SIMPLE` / `MEDIUM` / `COMPLEX` / `BLOCKED_UNKNOWN`
- Delta Complexity
- Aggregate Complexity: reference only
- Complexity Triggers
- Delta Complexity Triggers
- Ignored Aggregate Triggers
- Re-Gate Source
- Earliest Affected Node
- Full SDD Override: `none` / `user_requested` / `later_gate_required`
- Development Path Decision: `DIRECT_IMPLEMENTATION` / `SPECKIT_PIPELINE_REQUIRED` / `BLOCKED_NEEDS_REVISION`
- Development Path Decision Reason
- Development Path Decision Source: `sdlc-solution-reviewer`
- Development Path Decision Artifact
- Development Path Decision Artifact Status: `current` / `stale` / `not_persisted`
- Tail Required
- Tail Scope
- Tail Status
- Critical / High / Medium / Low
- Missing Constraint
- Missing Branch
- Behavior Risk
- Compatibility Risk
- Implementation Risk
- Test Gap
- Pending Confirmation
- Required Actions
- Manifest Update Recommendation
- Next Step

## Compatibility-Read 规则（历史字段）

旧字段 `Development Path Recommendation` 只允许作为历史 artifact 的 compatibility-read 输入：

- 读取旧 artifact 时，可以把 `Development Path Recommendation` 解释为对应的 canonical `Development Path Decision`。
- 新写 response、Markdown artifact、Manifest recommendation 和示例不得输出旧字段。
- 不得双写 Recommendation 和 Decision。
- 不要求迁移或重写历史 artifact。
- 不得删除历史兼容读取能力。

## Pipeline 调用边界

当 Development Path Decision 为 `SPECKIT_PIPELINE_REQUIRED` 时：只输出下一步建议并要求另行确认或授权；不得自动调用 `sdlc-speckit-pipeline`；不修改 Pipeline Skill、contract、references 或 runtime。

## Stop Conditions

Stop instead of guessing when:

- Technical specification is missing or unreadable.
- Requirement boundary cannot be determined.
- Original-flow compatibility is undefined.
- Failure strategy is undefined for behavior-changing logic.
- State transition or data source is undefined.
- Development path cannot be decided without inventing business rules.
