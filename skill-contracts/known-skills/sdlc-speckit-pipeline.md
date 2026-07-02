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
  - .specify/project-governance-profile.yaml
  - .specify/entry-coverage-profile.yaml
  - .specify/project-context/ProjectWorkflowGuide.md
  - .specify/project-context/ProjectDocumentationGuide.md
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
  - ai-sdlc/artifact-versioning.md
  - ai-sdlc/change-control.md
skill_path:
  - skills/sdlc-speckit-pipeline/SKILL.md
references:
  - skills/sdlc-speckit-pipeline/references/activation-and-inputs.md
  - skills/sdlc-speckit-pipeline/references/new-rail-enhanced-pipeline.md
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
  - never read or write .specify/memory/**, .specify/workflow/**, or .specify/coding_guide/** during new-rail runtime
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
  - runtime execution would require a legacy Skill or legacy .specify/memory/**, .specify/workflow/**, or .specify/coding_guide/** input
  - Clarify passed but required downstream authorization for continuous execution is missing
  - any stage has unresolved Critical issue
```

## Standard Path Resolution

本合同中 `required_schema`、`required_checklist`、`required_storage`、`skill_path` 与 `references` 里的共享标准路径，均相对 `AI_SDLC_STANDARD_HOME` 解析。

执行 Skill 前必须先读取 `${AI_SDLC_STANDARD_HOME}/ai-sdlc/standard-package-resolution.md`，确认标准包根目录有效。目标项目不需要、也不应该复制共享 `ai-sdlc/**`、`ess/**`、`checklists/**`、`templates/**` 或 `skill-contracts/**` 文件。

## Responsibilities

`sdlc-speckit-pipeline` 是方案审阅后的可选完整 SDD 路径，也是 New-Rail Enhanced Speckit Pipeline 的运行期控制器。

它负责：

- 在激活条件满足后串行执行 `Preflight -> Domain Route -> Specify -> Clarify -> Plan -> Tasks -> Analyze -> Implement -> Sync -> Reconcile`。
- 在运行期只调度 `sdlc-speckit-*` 子 Skill，不调度 legacy `speckit-*` Skill。
- 在 Clarify 之前按节点询问是否进入下一节点；Clarify 通过后连续执行 Plan / Tasks / Analyze / Implement / Sync / Reconcile。
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
- 把 legacy Skill 或 `.specify/memory/**`、`.specify/workflow/**`、`.specify/coding_guide/**` 作为运行期依赖。
- 在目标项目运行期执行新旧文档对比；旧版内容只能作为标准包开发期 development-time fixture / parity fixture。

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
- `.specify/project-context/ProjectWorkflowGuide.md`
- `.specify/project-context/ProjectDocumentationGuide.md`
- `.specify/project-context/ProjectCodingGuide.md`
- `.specify/project-context/RepositoryStructure.md`
- `.specify/project-context/ProjectGovernanceOverrides.md`
- 目标仓库已生成的 `.specify/business_domain/**`
- 相关 L1 / L2 / L4 业务知识文档，仅当它们已经由目标仓库 bootstrap 生成

缺失输入处理：

- 缺少方案或方案审核时停止。
- 缺少 manifest 时可以创建或建议创建，但必须记录 Activity Log。
- 缺少项目 profile 时，先执行 Speckit project bootstrap。
- 缺少业务知识库时，先执行 business-domain bootstrap，不能跳过治理检查。
- 缺少 profile 声明为 required 的 project-context 文档时停止。
- 所需事实只存在于 legacy `.specify/memory/**`、`.specify/workflow/**` 或 `.specify/coding_guide/**` 时停止，要求目标代码证据、business_domain 证据或用户确认。

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

- `Preflight`：检查 `.specify` 基线、新轨运行期红线与关键入口文档。
- `Domain Route`：基于已审阅方案判断 `existing-change` / `new-flow` / `integration-change` / `data-change` / `unknown`，并输出 Domain Route Summary。
- `Specify`：复用 `01-技术方案` 和 `02-方案审核`，同步或派生 `specs/spec.md`。
- `Clarify`：只校验残余未决问题；若发现核心问题，停止并回到方案修订 / 方案审核。Clarify 通过后进入连续执行区。
- `Plan`：不得改变已通过方案的业务边界。
- `Tasks`：任务必须追溯到已审阅方案、plan 或审核修复项。
- `Analyze`：审计 plan/tasks/specs 一致性，不替代 `sdlc-solution-reviewer`。
- `Implement`：不得实现方案外行为。
- `Sync`：只沉淀稳定事实，不把聊天片段作为事实源。
- `Reconcile`：默认只读 audit，除非用户明确要求 apply。

Clarify 边界确认规则：

- Preflight -> Domain Route、Domain Route -> Specify、Specify -> Clarify 都必须询问是否进入下一节点。
- Clarify 通过后，Plan -> Tasks -> Analyze -> Implement -> Sync -> Reconcile 按顺序连续执行，不再询问是否进入下一节点。
- 进入连续执行区前，必须已经具备实现授权、Sync 目标和写授权、Reconcile apply 授权（如需 apply）以及风险接受 owner 确认（如适用）。
- 如果这些授权缺失，停在 Clarify 边界，不进入后续连续执行区。

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

必须输出或建议输出：

- New-Rail Runtime Check
- Domain Route Summary
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

- Clarify 之前进入下一阶段。
- 进入 post-Clarify continuous execution 前的实现授权。
- 进入 post-Clarify continuous execution 前的 Sync 目标和写授权。
- 进入 post-Clarify continuous execution 前的 `sdlc-speckit-code-doc-reconcile --apply` 授权（仅当需要 apply）。

禁止：

- 无用户确认跨阶段推进。
- Clarify 之后继续做 stage-by-stage transition prompt。
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
- 运行期需要 legacy Skill 或 legacy `.specify/memory/**`、`.specify/workflow/**`、`.specify/coding_guide/**` 输入。
- Clarify 已通过但后续连续执行所需授权缺失。

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
