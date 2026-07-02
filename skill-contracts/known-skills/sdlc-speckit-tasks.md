# sdlc-speckit-tasks Skill Contract

## Metadata

```yaml
name: sdlc-speckit-tasks
version: 0.1.0
category: Producer Skill / Auditor Skill
stage: Speckit Tasks / Task Gate
standard_package: ai-sdlc-standard
status: active
input_artifacts:
  - specs/{feature}/spec.md
  - specs/{feature}/plan.md
  - plan gate result from sdlc-speckit-plan
  - library/{requirement_id}/01-技术方案/*
  - library/{requirement_id}/02-方案审核/*
  - optional library/{requirement_id}/manifest.md
output_artifacts:
  - specs/{feature}/tasks.md
  - task coverage summary
  - manifest.md Activity Log update recommendation
required_schema:
  - ess/specification-schema.md
required_checklist:
  - checklists/task-checklist.md
  - checklists/plan-checklist.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/artifact-versioning.md
  - ai-sdlc/change-control.md
side_effects:
  - create or update specs/{feature}/tasks.md
  - recommend manifest.md Activity Log or Re-Gate updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - sdlc-speckit-plan has unresolved blocking item
  - tasks would change approved scope, plan, or behavior
  - tasks require undefined business or technical behavior
  - tasks cannot support acceptance criteria or verification
```

## Standard Path Resolution

本合同中 `required_schema`、`required_checklist`、`required_storage`、`skill_path` 与 `references` 里的共享标准路径，均相对 `AI_SDLC_STANDARD_HOME` 解析。

执行 Skill 前必须先读取 `${AI_SDLC_STANDARD_HOME}/ai-sdlc/standard-package-resolution.md`，确认标准包根目录有效。目标项目不需要、也不应该复制共享 `ai-sdlc/**`、`ess/**`、`checklists/**`、`templates/**` 或 `skill-contracts/**` 文件。

## Responsibilities

`sdlc-speckit-tasks` 是 Speckit Tasks 阶段的标准 Skill。

它负责：

- 读取已通过 Plan Gate 的 `specs/{feature}/plan.md`。
- 生成或审阅 `specs/{feature}/tasks.md`。
- 把已批准的 spec 和 plan 拆成可执行、可验证、可追踪的任务。
- 校验任务是否覆盖验收标准、实现范围、测试、回滚、兼容和观测要求。
- 输出 Task Gate 结论和下一步建议。

它不负责：

- 从零理解需求。
- 编写 `01-技术方案`。
- 审阅方案完整性以替代 `sdlc-solution-reviewer`。
- 生成或修改 `specs/{feature}/plan.md`。
- 修改 `01-技术方案` 或 `02-方案审核`。
- 修改业务代码。
- 回写 `.specify/business_domain/**`。

## Input Contract

必需输入：

- `specs/{feature}/spec.md`
- `specs/{feature}/plan.md`
- `sdlc-speckit-plan` 的无阻塞 Plan Gate 结论。
- `library/{requirement_id}/01-技术方案/*`
- `library/{requirement_id}/02-方案审核/*`

建议输入：

- `library/{requirement_id}/manifest.md`
- 已接受风险记录。
- Re-Gate Records。
- Replaced Artifact Paths。
- 既有 `specs/{feature}/tasks.md`。

前置条件：

- `sdlc-speckit-plan` 不存在 Blocking Items。
- `specs/{feature}/plan.md` 与当前有效 `specs/{feature}/spec.md`、`01-技术方案`、`02-方案审核` 一致。
- Development Path Decision 为 `SPECKIT_PIPELINE_REQUIRED`，或用户明确要求完整 SDD。

缺失输入处理：

- 缺少 `specs/{feature}/spec.md` 时停止并回到 `sdlc-speckit-specify`。
- 缺少 `specs/{feature}/plan.md` 时停止并建议运行 `sdlc-speckit-plan`。
- 缺少 Plan Gate 结论时停止并建议补 Plan Gate。
- 缺少技术方案或方案审核时停止。
- manifest 缺失时可以继续生成 tasks，但必须建议创建或更新 Activity Log。

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
specs/{feature}/tasks.md
```

输出必须覆盖：

- 实现任务，并映射到 plan 和 spec。
- 测试与验证任务，并映射到验收标准。
- 数据、状态、事务、缓存、MQ、API、Schedule、Listener 等计划内影响。
- 失败、超时、异常、重试、幂等、回滚和兼容任务。
- 日志、监控、灰度、发布和回滚观察任务。
- 文档、配置、迁移、清理任务。
- 任务依赖顺序和可并行性。
- 与 `specs/{feature}/spec.md`、`specs/{feature}/plan.md`、`01-技术方案`、`02-方案审核` 的追溯关系。

最终输出必须包含：

- Task Coverage Summary。
- Task Gate Result。
- Blocking Items。
- Re-Gate Recommendation。
- Manifest Update Recommendation。
- Next Step。

## Side Effects

允许：

- 创建或更新 `specs/{feature}/tasks.md`。
- 建议更新 manifest Activity Log。
- 建议创建 Re-Gate Records。

禁止：

- 修改业务代码。
- 修改 `specs/{feature}/plan.md`。
- 修改 `.specify/business_domain/**`。
- 修改 `01-技术方案` 或 `02-方案审核`。
- 在 tasks 中扩大 Scope。
- 用任务拆解补造未定义业务规则或技术行为。

## Blocking Conditions

必须停止的情况：

- `sdlc-speckit-plan` 仍有 Blocking Items。
- Tasks 与 `specs/{feature}/spec.md` 或 `specs/{feature}/plan.md` 冲突。
- Tasks 改变已审核方案范围。
- Tasks 改变状态流转、异常处理、兼容策略、数据写入或测试验收口径。
- Tasks 需要新增方案或计划中没有定义的业务规则。
- Tasks 无法覆盖验收标准或验证要求。
- 当前有效方案、审核产物、spec 或 plan 已被 stale。

## Gate Requirements

前置 Gate：

- `sdlc-speckit-specify` 已生成或同步 `specs/{feature}/spec.md`。
- `sdlc-speckit-clarify` 已校验无核心未决问题。
- `sdlc-speckit-plan` 已通过 Plan Gate。
- `sdlc-solution-reviewer` 已通过。

后置 Gate：

- Tasks 必须通过 `checklists/task-checklist.md`。
- 无 Blocking Items 时，可进入 `sdlc-speckit-analyze`。
- 存在核心缺口时，必须回到最早受影响节点，并在 manifest Re-Gate Records 中记录。
