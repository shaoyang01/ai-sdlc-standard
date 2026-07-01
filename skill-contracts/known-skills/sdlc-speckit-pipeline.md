# sdlc-speckit-pipeline Skill Contract

## Metadata

```yaml
name: sdlc-speckit-pipeline
version: 0.1.0
category: Workflow Skill / Executor Skill / Sync Skill
stage: Optional full SDD path after solution review
standard_package: ai-sdlc-standard
status: active
input_artifacts:
  - library/{requirement_id}/01-技术方案/*
  - library/{requirement_id}/02-方案审核/*
  - library/{requirement_id}/manifest.md
  - optional specs/**
output_artifacts:
  - specs/** machine artifacts
  - implementation changes
  - library/{requirement_id}/03-实现记录/*
  - sync result for .specify/business_domain/**
required_schema:
  - ess/specification-schema.md
  - ess/review-schema.md
  - ess/test-feedback-schema.md
required_checklist:
  - checklists/specification-checklist.md
  - checklists/plan-checklist.md
  - checklists/task-checklist.md
  - checklists/implementation-checklist.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
skill_path:
  - skills/sdlc-speckit-pipeline/SKILL.md
references:
  - skills/sdlc-speckit-pipeline/references/activation-and-inputs.md
  - skills/sdlc-speckit-pipeline/references/stage-sequence.md
  - skills/sdlc-speckit-pipeline/references/gate-and-regate.md
  - skills/sdlc-speckit-pipeline/references/side-effect-boundaries.md
  - skills/sdlc-speckit-pipeline/references/output-and-manifest.md
side_effects:
  - create or update specs/**
  - modify code during implement stage
  - update task status
  - update .specify/business_domain/** during sync
  - recommend or write DocFlow implementation records
can_modify_code: true
can_modify_docs: true
can_modify_knowledge_base: true
can_execute_commands: true
blocking_conditions:
  - solution review is missing
  - solution review result is FAIL
  - development path recommendation is BLOCKED_NEEDS_REVISION
  - user has not confirmed entering full SDD path
  - user requested full SDD but solution review is missing
  - implementation requires undefined business behavior
  - any stage has unresolved Critical issue
```

## Standard Path Resolution

本合同中 `required_schema`、`required_checklist`、`required_storage`、`skill_path` 与 `references` 里的共享标准路径，均相对 `AI_SDLC_STANDARD_HOME` 解析。

执行 Skill 前必须先读取 `${AI_SDLC_STANDARD_HOME}/ai-sdlc/standard-package-resolution.md`，确认标准包根目录有效。目标项目不需要、也不应该复制共享 `ai-sdlc/**`、`ess/**`、`checklists/**`、`templates/**` 或 `skill-contracts/**` 文件。

## Responsibilities

`sdlc-speckit-pipeline` 是方案审阅后的可选完整 SDD 路径。

它负责：

- 在激活条件满足后串行执行 `Preflight -> Domain Route -> Specify -> Clarify -> Plan -> Tasks -> Analyze -> Implement -> Sync -> Reconcile`。
- 复用已审阅的 `01-技术方案` 和 `02-方案审核`，避免重新解释需求。
- 将 `sdlc-specification-writer` 的产物同步或派生为 `specs/spec.md`。
- 在实现完成后将稳定业务事实回写到 `.specify/business_domain/**`。
- 在 DocFlow 和 manifest 中形成阶段结果、实现记录、Sync 状态和 Reconcile 结论建议。

它不负责：

- 替代 `sdlc-solution-reviewer` 做方案审阅。
- 在方案审核失败时继续推进。
- 从零重新澄清已经审阅过的需求。
- 在 `sdlc-speckit-clarify` 中扩大需求范围。
- 自动绕过用户确认进入实现。
- 直接替代子 Skill 的合同、Gate 或停止条件。

## Activation Contract

允许启动的条件：

- `sdlc-solution-reviewer` 输出 `SPECKIT_PIPELINE_REQUIRED`。
- 用户在 `sdlc-solution-reviewer` 已通过后明确要求完整 SDD 流程。
- 后续 Gate 发现直接实现风险过高，并由用户确认切换到完整 SDD。

禁止启动的条件：

- 方案审核结果为 `FAIL`。
- 开发路径建议为 `BLOCKED_NEEDS_REVISION`。
- 缺少 `01-技术方案` 或 `02-方案审核`。
- 缺少用户确认。

当 `sdlc-solution-reviewer` 输出 `DIRECT_IMPLEMENTATION` 时，默认不启动本 Skill；除非用户明确要求完整 SDD。Full SDD override 只能覆盖开发路径选择，不能覆盖 `01-技术方案`、`02-方案审核` 或 `sdlc-solution-reviewer` 前置 Gate。

## Input Contract

必需输入：

- `library/{requirement_id}/01-技术方案/{requirement_id}__技术方案.*`
- `library/{requirement_id}/02-方案审核/{requirement_id}__方案审核.*`
- `library/{requirement_id}/manifest.md`

建议输入：

- `specs/**`
- `.specify/project-governance-profile.yaml`
- `.specify/entry-coverage-profile.yaml`
- `.specify/business-domain-bootstrap.yaml`
- 目标仓库已生成的 `.specify/business_domain/**`
- 相关 L1 / L2 / L4 业务知识文档，仅当它们已经由目标仓库 bootstrap 生成

缺失输入处理：

- 缺少方案或方案审核时停止。
- 缺少 manifest 时可以创建或建议创建，但必须记录 Activity Log。
- 缺少项目 profile 时，先执行 Speckit project bootstrap。
- 缺少业务知识库时，先执行 business-domain bootstrap，不能跳过治理检查。

## Flow Contract

本 Skill 内部仍保持串行：

```text
Preflight
-> Domain Route
-> Specify
-> Clarify
-> Plan
-> Tasks
-> Analyze
-> Implement
-> Sync
-> Reconcile
```

阶段规则：

- `Preflight`：检查 `.specify` 基线与关键入口文档。
- `Domain Route`：基于已审阅方案判断 `existing-change` / `new-flow`。
- `Specify`：复用 `01-技术方案` 和 `02-方案审核`，同步或派生 `specs/spec.md`。
- `Clarify`：只校验残余未决问题；若发现核心问题，停止并回到方案修订 / 方案审核。
- `Plan`：不得改变已通过方案的业务边界。
- `Tasks`：任务必须追溯到已审阅方案、plan 或审核修复项。
- `Analyze`：审计 plan/tasks/specs 一致性，不替代 `sdlc-solution-reviewer`。
- `Implement`：不得实现方案外行为。
- `Sync`：只沉淀稳定事实，不把聊天片段作为事实源。
- `Reconcile`：默认只读 audit，除非用户明确要求 apply。

## Output Contract

必须输出或建议输出：

- `specs/spec.md`
- `specs/plan.md`、`research.md`、`data-model.md`、`contracts/`（按需）
- `specs/tasks.md`
- 实现摘要
- `library/{requirement_id}/03-实现记录/{requirement_id}__实现记录.md`
- Sync 目标路径和结果
- manifest Activity Log / Speckit Sync 更新建议

## Side Effects

允许：

- 写 `specs/**`。
- 修改业务代码。
- 更新任务状态。
- 回写 `.specify/business_domain/**`。
- 写 DocFlow 实现记录。

必须显式确认：

- 进入下一阶段。
- 开始修改代码。
- 执行 Sync 回写。
- 对 `sdlc-speckit-code-doc-reconcile` 使用 `--apply`。

禁止：

- 无用户确认跨阶段推进。
- 在 Clarify 阶段扩大需求范围。
- 在 Implement 阶段补造未定义业务规则。
- 在 Sync 阶段沉淀未验证事实。

## Blocking Conditions

必须停止的情况：

- `sdlc-solution-reviewer` 未执行。
- 方案审核未通过。
- `PASS_WITH_RISK` 缺少风险接受说明。
- 开发路径建议不是 `SPECKIT_PIPELINE_REQUIRED`，且用户未明确要求完整 SDD。
- Clarify 发现核心需求仍不明确。
- Plan 改变需求边界。
- Tasks 出现无法追溯到方案或计划的业务任务。
- Implement 需要猜测业务规则。
- Sync 目标文档无法判断。

## Gate Requirements

前置 Gate：

- `02-方案审核` 必须为 `PASS` 或 `PASS_WITH_RISK`。
- Development Path Decision 必须是 `SPECKIT_PIPELINE_REQUIRED`，或用户明确要求完整 SDD。

后置 Gate：

- 每一阶段都必须输出结论、风险和下一步确认。
- 实现完成后必须更新或建议更新 `03-实现记录`。
- Sync 完成后必须更新或建议更新 manifest 的 Speckit Sync 区块。
- Reconcile 完成后必须更新或建议更新 manifest 的 Reconcile 结论。
- 如果任一阶段发现规格遗漏，必须回到 `01-技术方案` / `02-方案审核` 重新 Gate。
