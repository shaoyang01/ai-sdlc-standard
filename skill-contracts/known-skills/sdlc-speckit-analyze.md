# sdlc-speckit-analyze Skill Contract

## Metadata

```yaml
name: sdlc-speckit-analyze
version: 0.1.0
category: Auditor Skill
stage: Speckit Analyze / Implementation Readiness Gate
standard_package: ai-sdlc-standard
status: active
input_artifacts:
  - specs/{feature}/spec.md
  - specs/{feature}/plan.md
  - specs/{feature}/tasks.md
  - task gate result from sdlc-speckit-tasks
  - library/{requirement_id}/01-技术方案/*
  - library/{requirement_id}/02-方案审核/*
  - optional library/{requirement_id}/manifest.md
output_artifacts:
  - analyze consistency report
  - implementation readiness recommendation
  - manifest.md Activity Log or Re-Gate update recommendation
required_schema:
  - ess/specification-schema.md
required_checklist:
  - checklists/specification-checklist.md
  - checklists/plan-checklist.md
  - checklists/task-checklist.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - produce consistency report
  - recommend manifest.md Activity Log or Re-Gate updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - spec, plan, tasks, or DocFlow artifacts conflict
  - required artifact is missing or stale
  - task requires undefined business or technical behavior
  - implementation readiness cannot be established
```

## Standard Path Resolution

本合同中 `required_schema`、`required_checklist`、`required_storage`、`skill_path` 与 `references` 里的共享标准路径，均相对 `AI_SDLC_STANDARD_HOME` 解析。

执行 Skill 前必须先读取 `${AI_SDLC_STANDARD_HOME}/ai-sdlc/standard-package-resolution.md`，确认标准包根目录有效。目标项目不需要、也不应该复制共享 `ai-sdlc/**`、`ess/**`、`checklists/**`、`templates/**` 或 `skill-contracts/**` 文件。

## Responsibilities

`sdlc-speckit-analyze` 是 Speckit Analyze 阶段的标准 Skill。

它负责：

- 读取当前有效的 DocFlow、spec、plan、tasks 和 Gate 结果。
- 审计 `01-技术方案`、`02-方案审核`、`specs/spec.md`、`plan.md`、`tasks.md` 是否一致。
- 判断实现前是否存在未解决的范围、计划、任务、风险、验证或回滚缺口。
- 输出 Analyze Gate 结论和下一步建议。
- 将阻塞项路由到最早受影响节点。

它不负责：

- 从零理解需求。
- 编写或修改 `01-技术方案`。
- 审阅方案完整性以替代 `sdlc-solution-reviewer`。
- 生成或修改 `specs/{feature}/spec.md`、`plan.md`、`tasks.md`。
- 修改业务代码。
- 回写 `.specify/business_domain/**`。

## Input Contract

必需输入：

- `specs/{feature}/spec.md`
- `specs/{feature}/plan.md`
- `specs/{feature}/tasks.md`
- `sdlc-speckit-tasks` 的无阻塞 Task Gate 结论。
- `library/{requirement_id}/01-技术方案/*`
- `library/{requirement_id}/02-方案审核/*`

建议输入：

- `library/{requirement_id}/manifest.md`
- 已接受风险记录。
- Re-Gate Records。
- Replaced Artifact Paths。
- `sdlc-speckit-plan` 的 Plan Gate 结论。
- `sdlc-speckit-clarify` 的残余澄清结论。

前置条件：

- `sdlc-speckit-tasks` 不存在 Blocking Items。
- `specs/spec.md`、`specs/plan.md`、`specs/tasks.md` 均为当前有效版本。
- `02-方案审核`、Plan Gate、Task Gate 均为 `PASS` 或有效 `PASS_WITH_RISK`。
- Development Path Decision 为 `SPECKIT_PIPELINE_REQUIRED`，或用户明确要求完整 SDD。

缺失输入处理：

- 缺少 `specs/spec.md` 时停止并回到 `sdlc-speckit-specify`。
- 缺少 `specs/plan.md` 时停止并回到 `sdlc-speckit-plan`。
- 缺少 `specs/tasks.md` 时停止并回到 `sdlc-speckit-tasks`。
- 缺少技术方案或方案审核时停止。
- manifest 缺失时可以继续审计，但必须建议创建或更新 Activity Log。

## Output Contract

输出必须覆盖：

- Source Artifacts。
- Consistency Matrix。
- Analyze Gate Result。
- Blocking Items。
- Deferred Non-Blocking Items。
- Earliest Affected Node。
- Re-Gate Recommendation。
- Manifest Update Recommendation。
- Next Step。

允许的 Gate 结果：

- `PASS`
- `FAIL`
- `PASS_WITH_RISK`

`PASS_WITH_RISK` 只允许用于已明确接受、不会导致实现阶段猜测的风险。

## Side Effects

允许：

- 输出一致性审计报告。
- 建议更新 manifest Activity Log。
- 建议创建 Re-Gate Records。

禁止：

- 修改业务代码。
- 修改 `specs/{feature}/spec.md`。
- 修改 `specs/{feature}/plan.md`。
- 修改 `specs/{feature}/tasks.md`。
- 修改 `.specify/business_domain/**`。
- 修改 `01-技术方案` 或 `02-方案审核`。
- 用 Analyze 结论补造未定义业务规则或技术行为。

## Blocking Conditions

必须停止的情况：

- `sdlc-speckit-tasks` 仍有 Blocking Items。
- 当前有效 DocFlow、spec、plan 或 tasks 冲突。
- 任何必需产物缺失或已被 stale。
- Tasks 要求实现 spec 或 plan 以外的行为。
- Plan 中影响实现的事项没有任务覆盖。
- 验收标准没有验证路径。
- 风险接受缺失、过期或被后续产物否定。
- 实现将需要猜测业务规则或技术决策。

## Gate Requirements

前置 Gate：

- `sdlc-solution-reviewer` 已通过。
- `sdlc-speckit-specify` 已生成或同步 `specs/spec.md`。
- `sdlc-speckit-clarify` 已校验无核心未决问题。
- `sdlc-speckit-plan` 已通过 Plan Gate。
- `sdlc-speckit-tasks` 已通过 Task Gate。

后置 Gate：

- Analyze 必须无 Blocking Items。
- `PASS` 或有效 `PASS_WITH_RISK` 后，可进入 `sdlc-speckit-implement`。
- 存在核心缺口时，必须回到最早受影响节点，并在 manifest Re-Gate Records 中记录。
