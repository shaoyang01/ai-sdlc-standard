# sdlc-speckit-checklist Skill Contract

## Metadata

```yaml
name: sdlc-speckit-checklist
version: 0.1.0
category: Producer Skill / Auditor Skill
stage: Speckit Checklist / Stage-Specific Inspection
standard_package: ai-sdlc-standard
status: active
input_artifacts:
  - specs/{feature}/spec.md
  - optional specs/{feature}/plan.md
  - optional specs/{feature}/tasks.md
  - optional specs/{feature}/checklists/*
  - library/{requirement_id}/01-技术方案/*
  - library/{requirement_id}/02-方案审核/*
  - optional implementation result from sdlc-speckit-implement
  - optional sync result from sdlc-speckit-sync
  - optional reconcile result from sdlc-speckit-code-doc-reconcile
  - optional library/{requirement_id}/manifest.md
output_artifacts:
  - specs/{feature}/checklists/{stage}-checklist.md
  - checklist validation report
  - manifest.md Activity Log or Re-Gate update recommendation
required_checklist:
  - checklists/specification-checklist.md
  - checklists/plan-checklist.md
  - checklists/task-checklist.md
  - checklists/implementation-checklist.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - create or update requirement-specific checklist when requested
  - validate existing checklist
  - recommend manifest.md Activity Log or Re-Gate updates
  - recommend shared checklist sync through responsible sync skills
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - target checklist stage is unclear
  - required source artifacts are missing or stale
  - checklist item would introduce new business behavior
  - existing checklist conflicts with current approved artifacts
  - checklist generation would replace Gate, Analyze, Review, or Test Acceptance
```

## Standard Path Resolution

本合同中 `required_schema`、`required_checklist`、`required_storage`、`skill_path` 与 `references` 里的共享标准路径，均相对 `AI_SDLC_STANDARD_HOME` 解析。

执行 Skill 前必须先读取 `${AI_SDLC_STANDARD_HOME}/ai-sdlc/standard-package-resolution.md`，确认标准包根目录有效。目标项目不需要、也不应该复制共享 `ai-sdlc/**`、`ess/**`、`checklists/**`、`templates/**` 或 `skill-contracts/**` 文件。

## Responsibilities

`sdlc-speckit-checklist` 是 Speckit 生命周期中的需求专用 Checklist 生成和校验 Skill。

它负责：

- 基于当前有效的 DocFlow、spec、plan、tasks、实现证据或同步证据生成阶段检查清单。
- 复用 `checklists/*.md` 的通用规则，并映射到当前需求上下文。
- 校验已有 checklist 是否过期、无来源或与当前产物冲突。
- 为每个检查项记录来源、预期证据、严重级别和责任 Skill。
- 输出 checklist 结果、阻塞项、Re-Gate 建议和 manifest 更新建议。

它不负责：

- 替代任何 Gate 结论。
- 替代 `sdlc-speckit-analyze`、Code Review 或测试验收。
- 新增业务规则、技术决策或验收标准。
- 修改生产代码。
- 回写 `.specify/business_domain/**`。
- 直接修改共享 `checklists/*.md`。

## Input Contract

必需输入：

- Requirement ID。
- Checklist stage。
- 当前阶段必需的 source artifacts。
- `library/{requirement_id}/01-技术方案/*` 或当前 `specs/{feature}/spec.md`。

建议输入：

- `specs/{feature}/plan.md`
- `specs/{feature}/tasks.md`
- `specs/{feature}/checklists/*`
- `library/{requirement_id}/02-方案审核/*`
- `library/{requirement_id}/manifest.md`
- Re-Gate Records。
- Replaced Artifact Paths。
- 已接受风险记录。
- 实现、代码审核、测试反馈、Sync 或 Reconcile 结果。

前置条件：

- Checklist stage 明确。
- Source artifacts 是当前有效版本。
- 已有 Gate 结果没有未解决 Critical / High 阻塞。
- 输出不会改变需求、方案、计划、任务或实现边界。

缺失输入处理：

- 缺少 stage 时停止。
- 缺少 source artifacts 时停止并建议回到对应阶段。
- 缺少 manifest 时可以输出 checklist，但必须建议补 Activity Log。
- 发现可复用规则缺口时只输出建议，不能直接修改共享 checklist。

## Output Contract

默认输出到：

```text
specs/{feature}/checklists/{stage}-checklist.md
```

输出必须覆盖：

- Source Artifacts。
- Checklist Stage。
- Target Checklist。
- Checklist Items。
- Traceability Summary。
- Stale Or Invalid Items。
- Blocking Items。
- Re-Gate Recommendation。
- Manifest Update Recommendation。
- Next Step。

允许的结果：

- `GENERATED`
- `VALIDATED`
- `STALE`
- `BLOCKED`
- `PROPOSED`

## Side Effects

允许：

- 生成或更新需求专用 checklist。
- 校验已有需求专用 checklist。
- 建议更新 manifest Activity Log。
- 建议创建 Re-Gate Records。
- 建议通过 `sdlc-test-feedback-sync` 或 `sdlc-speckit-sync` 沉淀通用 checklist 改进。

禁止：

- 修改生产代码。
- 修改 `.specify/business_domain/**`。
- 直接修改共享 `checklists/*.md`。
- 把 checklist item 当作已批准需求。
- 用 checklist 替代 Gate、Analyze、Review 或测试验收。
- 生成无来源的执行项。

## Blocking Conditions

必须停止的情况：

- Checklist stage 不明确。
- 当前 source artifacts 缺失或 stale。
- Source artifacts 之间存在冲突。
- 检查项需要新增业务规则或技术决策。
- 已有 checklist 与当前有效产物冲突。
- 用户要求通过 checklist 绕过 Gate 或实现前准入。
- 可复用 checklist 改进缺少 sync 或治理路径。

## Gate Requirements

前置 Gate：

- Specification checklist 需要已有方案或 spec。
- Plan checklist 需要 Plan Gate 输入。
- Task checklist 需要 Task Gate 输入。
- Implementation readiness checklist 需要 Analyze Gate 输入。
- Sync readiness checklist 需要已验证实现证据。
- Reconcile readiness checklist 需要代码范围、specs、DocFlow 和 Sync 状态。

后置 Gate：

- Checklist 输出可作为相关 Gate 或 auditor Skill 的输入。
- Checklist 输出不能直接决定 Gate pass/fail。
- `BLOCKED` 或 `STALE` 必须记录 Re-Gate 建议。
- 发现通用规则缺口时，必须路由到 `sdlc-test-feedback-sync`、`sdlc-speckit-sync` 或标准治理更新。
