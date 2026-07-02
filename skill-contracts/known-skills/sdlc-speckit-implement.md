# sdlc-speckit-implement Skill Contract

## Metadata

```yaml
name: sdlc-speckit-implement
version: 0.1.0
category: Executor Skill / Producer Skill
stage: Speckit Implement / Implementation Execution
standard_package: ai-sdlc-standard
status: active
input_artifacts:
  - specs/{feature}/spec.md
  - specs/{feature}/plan.md
  - specs/{feature}/tasks.md
  - optional specs/{feature}/implementation.md
  - optional specs/{feature}/workflow-status.md
  - optional specs/{feature}/debug-guide.md
  - optional specs/{feature}/observability.md
  - analyze gate result from sdlc-speckit-analyze
  - library/{requirement_id}/01-技术方案/*
  - library/{requirement_id}/02-方案审核/*
  - optional library/{requirement_id}/manifest.md
output_artifacts:
  - production code changes
  - task status updates
  - optional specs/{feature}/implementation.md
  - optional specs/{feature}/workflow-status.md
  - optional specs/{feature}/debug-guide.md
  - optional specs/{feature}/observability.md
  - verification evidence
  - optional library/{requirement_id}/03-实现记录/*
  - optional library/{requirement_id}/04-交付总结/*
  - manifest.md Activity Log or Re-Gate update recommendation
required_checklist:
  - checklists/implementation-checklist.md
  - checklists/task-checklist.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/artifact-versioning.md
  - ai-sdlc/change-control.md
side_effects:
  - modify production code for approved tasks
  - add or update tests for approved tasks
  - update specs/{feature}/tasks.md status when verified
  - produce or recommend implementation, workflow-status, debug, and observability process products
  - produce or recommend implementation record
  - produce or recommend delivery summary
  - recommend manifest.md Activity Log or Re-Gate updates
can_modify_code: true
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - sdlc-speckit-analyze has unresolved blocking item
  - implementation would exceed approved tasks
  - implementation requires undefined business behavior
  - verification fails or cannot be defined
```

## Standard Path Resolution

本合同中 `required_schema`、`required_checklist`、`required_storage`、`skill_path` 与 `references` 里的共享标准路径，均相对 `AI_SDLC_STANDARD_HOME` 解析。

执行 Skill 前必须先读取 `${AI_SDLC_STANDARD_HOME}/ai-sdlc/standard-package-resolution.md`，确认标准包根目录有效。目标项目不需要、也不应该复制共享 `ai-sdlc/**`、`ess/**`、`checklists/**`、`templates/**` 或 `skill-contracts/**` 文件。

## Responsibilities

`sdlc-speckit-implement` 是 Speckit Implement 阶段的标准 Skill。

它负责：

- 读取已通过 Analyze Gate 的 spec、plan、tasks 和 DocFlow 产物。
- 只执行 `specs/{feature}/tasks.md` 中已批准、可追踪的任务。
- 在修改代码前模拟正常、边界、失败和兼容数据场景。
- 按仓库既有模式修改生产代码和测试。
- 执行或记录必要验证。
- 更新已完成任务状态。
- 只允许更新已完成且已验证任务的状态，不得改写任务描述、任务范围或任务顺序。
- 输出实现摘要、验证证据、未完成项和下一步建议。
- 为 frontend/RN 和通用实现阶段输出或建议输出新轨过程产物：
  `specs/{feature}/implementation.md`、`workflow-status.md`、`debug-guide.md`、
  `observability.md`、`03-实现记录` 和 `04-交付总结`。

它不负责：

- 从零理解需求。
- 修改 `01-技术方案` 或 `02-方案审核`。
- 重新生成 spec、plan 或 tasks。
- 实现任务外行为。
- 通过改写 `tasks.md` 任务描述、范围或顺序来适配实现。
- 补造未定义业务规则。
- 执行知识同步。
- 替代 Code Review 或测试验收。

## Input Contract

必需输入：

- `specs/{feature}/spec.md`
- `specs/{feature}/plan.md`
- `specs/{feature}/tasks.md`
- `sdlc-speckit-analyze` 的无阻塞 Analyze Gate 结论。
- `library/{requirement_id}/01-技术方案/*`
- `library/{requirement_id}/02-方案审核/*`

建议输入：

- `library/{requirement_id}/manifest.md`
- 已存在的 `specs/{feature}/implementation.md`、`workflow-status.md`、`debug-guide.md` 或 `observability.md`
- 已接受风险记录。
- Re-Gate Records。
- Replaced Artifact Paths。
- 当前仓库状态。
- 相关测试、构建或验证命令。

前置条件：

- `sdlc-speckit-analyze` 不存在 Blocking Items。
- `specs/spec.md`、`specs/plan.md`、`specs/tasks.md` 均为当前有效版本。
- `02-方案审核`、Plan Gate、Task Gate、Analyze Gate 均为 `PASS` 或有效 `PASS_WITH_RISK`。
- Development Path Decision 为 `SPECKIT_PIPELINE_REQUIRED`，或用户明确要求完整 SDD。

缺失输入处理：

- 缺少 `specs/tasks.md` 时停止并回到 `sdlc-speckit-tasks`。
- 缺少 Analyze Gate 结论时停止并建议运行 `sdlc-speckit-analyze`。
- 缺少技术方案或方案审核时停止。
- manifest 缺失时可以继续实现，但必须建议创建或更新 Activity Log。

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

输出必须覆盖：

- Source Artifacts。
- Implementation Scope。
- Data Cases Considered。
- Completed Tasks。
- Changed Files。
- Verification Results。
- Blocking Or Unfinished Items。
- Re-Gate Recommendation。
- Process Products Produced Or Recommended。
- Implementation Record Recommendation。
- Delivery Summary Recommendation。
- Manifest Update Recommendation。
- Next Step。

允许的实现状态：

- `COMPLETED`: 所有目标任务完成且验证通过。
- `PARTIAL`: 部分任务完成，未完成项已记录且不会伪装为完成。
- `BLOCKED`: 存在未解决阻塞，必须停止或回到上游 Re-Gate。

## Side Effects

允许：

- 修改生产代码。
- 新增或修改测试。
- 更新任务状态。
- 生成或建议生成 `specs/{feature}/implementation.md`、`workflow-status.md`、`debug-guide.md` 和 `observability.md`。
- 生成或建议生成 `03-实现记录`。
- 生成或建议生成 `04-交付总结`。
- 建议更新 manifest Activity Log。
- 建议创建 Re-Gate Records。

禁止：

- 实现任务外行为。
- 修改已审核方案或审核结论。
- 用实现补造未定义业务规则。
- 回写 `.specify/business_domain/**`。
- 将 `workflow-status.md` 当作状态权威源；manifest is status authority。
- 写入旧版过程产物文件名作为兼容格式。
- 隐藏失败验证。
- 覆盖或回退无关用户改动。

## Blocking Conditions

必须停止的情况：

- `sdlc-speckit-analyze` 仍有 Blocking Items。
- 当前有效 DocFlow、spec、plan 或 tasks 缺失或 stale。
- 实现需要任务外行为。
- 实现需要未定义业务规则或技术决策。
- 现有代码事实与已批准假设冲突。
- 编译失败、核心测试失败或必要验证无法定义。
- 无关本地改动导致无法安全修改目标文件。
- 必需过程产物会与 manifest 状态权威记录冲突。
- 用户要求把旧版过程产物文件名作为兼容输出。

## Gate Requirements

前置 Gate：

- `sdlc-solution-reviewer` 已通过。
- `sdlc-speckit-specify` 已生成或同步 `specs/spec.md`。
- `sdlc-speckit-clarify` 已校验无核心未决问题。
- `sdlc-speckit-plan` 已通过 Plan Gate。
- `sdlc-speckit-tasks` 已通过 Task Gate。
- `sdlc-speckit-analyze` 已通过 Analyze Gate。

后置 Gate：

- 已完成任务必须有验证证据。
- 实现完成后必须生成或建议生成 `03-实现记录`。
- 实现完成后必须生成或建议生成 `library/{requirement_id}/03-实现记录/{requirement_id}__实现记录.md`。
- frontend/RN 实现完成后必须生成或建议生成实现、debug、observability 过程产物，并在需要状态快照时生成或建议生成 `workflow-status.md`；manifest is status authority。
- 最终交付时必须生成或建议生成 `library/{requirement_id}/04-交付总结/{requirement_id}__交付总结.md`。
- 无 Blocking Items 时，可进入 `sdlc-code-review-normalizer` 或后续 `sdlc-speckit-sync`。
- 存在规格、计划或任务缺口时，必须回到最早受影响节点，并在 manifest Re-Gate Records 中记录。
