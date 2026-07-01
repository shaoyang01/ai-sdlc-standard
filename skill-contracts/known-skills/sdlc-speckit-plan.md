# sdlc-speckit-plan Skill Contract

## Metadata

```yaml
name: sdlc-speckit-plan
version: 0.1.0
category: Producer Skill / Auditor Skill
stage: Speckit Plan / Plan Gate
standard_package: ai-sdlc-standard
status: active
input_artifacts:
  - specs/{feature}/spec.md
  - library/{requirement_id}/01-技术方案/*
  - library/{requirement_id}/02-方案审核/*
  - clarification result from sdlc-speckit-clarify
  - optional library/{requirement_id}/manifest.md
output_artifacts:
  - specs/{feature}/plan.md
  - plan coverage summary
  - manifest.md Activity Log update recommendation
required_schema:
  - ess/specification-schema.md
required_checklist:
  - checklists/plan-checklist.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/artifact-versioning.md
  - ai-sdlc/change-control.md
side_effects:
  - create or update specs/{feature}/plan.md
  - recommend manifest.md Activity Log or Re-Gate updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - sdlc-speckit-clarify has unresolved blocking ambiguity
  - plan would change approved scope or behavior
  - plan requires undefined business behavior
  - plan cannot support acceptance criteria
```

## Standard Path Resolution

本合同中 `required_schema`、`required_checklist`、`required_storage`、`skill_path` 与 `references` 里的共享标准路径，均相对 `AI_SDLC_STANDARD_HOME` 解析。

执行 Skill 前必须先读取 `${AI_SDLC_STANDARD_HOME}/ai-sdlc/standard-package-resolution.md`，确认标准包根目录有效。目标项目不需要、也不应该复制共享 `ai-sdlc/**`、`ess/**`、`checklists/**`、`templates/**` 或 `skill-contracts/**` 文件。

## Responsibilities

`sdlc-speckit-plan` 是 Speckit Plan 阶段的标准 Skill。

它负责：

- 读取已通过残余澄清校验的 `specs/{feature}/spec.md`。
- 生成或审阅 `specs/{feature}/plan.md`。
- 明确技术实现路线、模块范围、数据与集成影响、异常和回滚策略。
- 校验 Plan 是否忠实于已审阅方案和 SpecKit spec。
- 输出 Plan Gate 结论和下一步建议。

它不负责：

- 从零理解需求。
- 编写 `01-技术方案`。
- 审阅方案完整性以替代 `sdlc-solution-reviewer`。
- 修改 `01-技术方案` 或 `02-方案审核`。
- 生成 `tasks.md`。
- 修改业务代码。
- 回写 `.specify/business_domain/**`。

## Input Contract

必需输入：

- `specs/{feature}/spec.md`
- `library/{requirement_id}/01-技术方案/*`
- `library/{requirement_id}/02-方案审核/*`
- `sdlc-speckit-clarify` 的无阻塞结论，或用户明确确认无残余核心未决问题。

建议输入：

- `library/{requirement_id}/manifest.md`
- 已接受风险记录。
- Re-Gate Records。
- Replaced Artifact Paths。

前置条件：

- `sdlc-speckit-clarify` 不存在 Blocking Items。
- `specs/spec.md` 与当前有效 `01-技术方案`、`02-方案审核` 一致。
- Development Path Decision 为 `SPECKIT_PIPELINE_REQUIRED`，或用户明确要求完整 SDD。

缺失输入处理：

- 缺少 `specs/spec.md` 时停止并回到 `sdlc-speckit-specify`。
- 缺少澄清结果时停止并建议运行 `sdlc-speckit-clarify`。
- 缺少技术方案或方案审核时停止。
- manifest 缺失时可以继续生成 plan，但必须建议创建或更新 Activity Log。

## Output Contract

### Artifact Versioning Contract

Any DocFlow requirement artifact produced or updated by this skill must follow
`ai-sdlc/artifact-versioning.md`:

- use the stable path recorded in manifest, not a filename-versioned path;
- include Metadata `Version` and `Status`;
- include `## 修订记录`;
- keep the body to current effective content only;
- recommend manifest updates with stable path, internal version, and status;
- include `Reviewed Artifact` and `Reviewed Artifact Version` for Gate,
  review, sync, and reconcile artifacts, plus `Gate Artifact Version` when
  the artifact is itself a Gate result.

输出到：

```text
specs/{feature}/plan.md
```

输出必须覆盖：

- 技术路线。
- 涉及模块和文件范围。
- 数据、状态、事务、缓存、MQ、API、Schedule、Listener 影响。
- 失败、超时、异常、重试、幂等、回滚和兼容策略。
- 日志、监控、灰度、发布和回滚观察点。
- 验证策略，并映射到验收标准。
- 风险和缓解措施。
- 与 `specs/spec.md`、`01-技术方案`、`02-方案审核` 的追溯关系。

最终输出必须包含：

- Plan Coverage Summary。
- Plan Gate Result。
- Blocking Items。
- Re-Gate Recommendation。
- Manifest Update Recommendation。
- Next Step。

## Side Effects

允许：

- 创建或更新 `specs/{feature}/plan.md`。
- 建议更新 manifest Activity Log。
- 建议创建 Re-Gate Records。

禁止：

- 修改业务代码。
- 生成 `specs/{feature}/tasks.md`。
- 修改 `.specify/business_domain/**`。
- 修改 `01-技术方案` 或 `02-方案审核`。
- 在 Plan 中扩大 Scope。
- 用技术计划补造未定义业务规则。

## Blocking Conditions

必须停止的情况：

- `sdlc-speckit-clarify` 仍有 Blocking Items。
- Plan 与 `specs/spec.md` 冲突。
- Plan 改变已审核方案范围。
- Plan 改变状态流转、异常处理、兼容策略、数据写入或测试验收口径。
- Plan 需要新增方案中没有定义的业务规则。
- Plan 无法支撑验收标准。
- 当前有效方案或审核产物已被 stale。

## Gate Requirements

前置 Gate：

- `sdlc-speckit-specify` 已生成或同步 `specs/spec.md`。
- `sdlc-speckit-clarify` 已校验无核心未决问题。
- `sdlc-solution-reviewer` 已通过。

后置 Gate：

- Plan 必须通过 `checklists/plan-checklist.md`。
- 无 Blocking Items 时，可进入 `sdlc-speckit-tasks`。
- 存在核心缺口时，必须回到 `01-技术方案` / `02-方案审核`，并在 manifest Re-Gate Records 中记录。
