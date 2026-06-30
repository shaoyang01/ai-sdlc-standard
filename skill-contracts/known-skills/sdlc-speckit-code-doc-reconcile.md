# sdlc-speckit-code-doc-reconcile Skill Contract

## Metadata

```yaml
name: sdlc-speckit-code-doc-reconcile
version: 0.1.0
category: Auditor Skill / Sync Skill
stage: Speckit Reconcile / Code Documentation Consistency
standard_package: ai-sdlc-standard
status: active
input_artifacts:
  - current code state, diff, commit range, or implementation scope
  - specs/{feature}/spec.md
  - specs/{feature}/plan.md
  - specs/{feature}/tasks.md
  - implementation result from sdlc-speckit-implement
  - optional sync result from sdlc-speckit-sync
  - library/{requirement_id}/01-技术方案/*
  - library/{requirement_id}/02-方案审核/*
  - optional library/{requirement_id}/03-实现记录/*
  - optional library/{requirement_id}/04-代码审核/*
  - optional library/{requirement_id}/05-测试验收/*
  - optional library/{requirement_id}/manifest.md
  - optional .specify/business_domain/** or declared knowledge target
output_artifacts:
  - reconciliation report
  - drift matrix
  - Re-Gate recommendation
  - sync recommendation
  - manifest.md update recommendation
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
required_contract:
  - skill-contracts/auditor-skill-contract.md
  - skill-contracts/sync-skill-contract.md
side_effects:
  - produce reconciliation report
  - recommend manifest, Re-Gate, sync, or record updates
  - optionally prepare authorized documentation or knowledge update proposals
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: true
can_execute_commands: true
blocking_conditions:
  - requirement or feature scope is unclear
  - required artifacts are missing or superseded
  - current source of truth conflicts across approved artifacts
  - code behavior cannot be inspected
  - drift correction would require production code changes
  - user did not authorize document or knowledge writes
```

## Standard Path Resolution

本合同中 `required_schema`、`required_checklist`、`required_storage`、`skill_path` 与 `references` 里的共享标准路径，均相对 `AI_SDLC_STANDARD_HOME` 解析。

执行 Skill 前必须先读取 `${AI_SDLC_STANDARD_HOME}/ai-sdlc/standard-package-resolution.md`，确认标准包根目录有效。目标项目不需要、也不应该复制共享 `ai-sdlc/**`、`ess/**`、`checklists/**`、`templates/**` 或 `skill-contracts/**` 文件。

## Responsibilities

`sdlc-speckit-code-doc-reconcile` 是 Speckit Reconcile 阶段的标准 Skill。

它负责：

- 审计代码、`specs/**`、DocFlow、manifest 和长期知识目标之间的一致性。
- 判断漂移属于代码、规格、DocFlow、知识库、manifest 还是未验证事实。
- 输出 Drift Matrix、证据、阻塞项和下一步责任 Skill。
- 发现代码偏离时回到 `sdlc-speckit-implement` 或更早 Gate。
- 发现长期知识缺口时回到 `sdlc-speckit-sync`。
- 发现 Gate、需求或方案冲突时回到最早受影响节点。

它不负责：

- 修改生产代码。
- 用修改文档掩盖未授权实现。
- 把聊天片段作为事实源。
- 替代代码审核、测试验收或实现修复。
- 在缺少授权时写入 DocFlow 或知识库。

## Input Contract

必需输入：

- 当前代码状态、diff、commit range 或实现范围。
- `specs/{feature}/spec.md`
- `specs/{feature}/plan.md`
- `specs/{feature}/tasks.md`
- `sdlc-speckit-implement` 的实现结果。
- `library/{requirement_id}/01-技术方案/*`
- `library/{requirement_id}/02-方案审核/*`

建议输入：

- `sdlc-speckit-sync` 的同步结果。
- `library/{requirement_id}/03-实现记录/*`
- `library/{requirement_id}/04-代码审核/*`
- `library/{requirement_id}/05-测试验收/*`
- `library/{requirement_id}/manifest.md`
- `.specify/business_domain/**` 或其他声明的知识目标。
- Re-Gate Records。
- Superseded Artifacts。
- 已接受风险记录。

前置条件：

- 审计范围明确。
- 当前有效产物和 superseded 产物可以区分。
- 代码行为或 diff 可以被检查。
- 纠偏方式不需要在本 Skill 内修改生产代码。

缺失输入处理：

- 缺少代码范围时停止。
- 缺少 `specs/**` 时停止并建议回到相应 Speckit 阶段。
- 缺少 DocFlow 技术方案或方案审核时停止并建议回到 `sdlc-specification-writer` 或 `sdlc-solution-reviewer`。
- 缺少实现记录时可继续审计实际代码，但必须标记记录缺口并建议 `sdlc-implementation-recorder`。
- 缺少知识目标时只审计代码、specs、DocFlow 和 manifest，不判断知识同步完整性。

## Output Contract

输出必须覆盖：

- Source Artifacts。
- Audit Scope。
- Drift Matrix。
- Result Classification。
- Evidence。
- Blocking Items。
- Recommended Owner Or Skill。
- Manifest Update Recommendation。
- Next Step。

允许的结果：

- `CONSISTENT`
- `CODE_DRIFT`
- `SPEC_DRIFT`
- `DOCFLOW_DRIFT`
- `KNOWLEDGE_DRIFT`
- `MANIFEST_DRIFT`
- `UNVERIFIED_FACT`
- `BLOCKED`

## Side Effects

允许：

- 读取代码、specs、DocFlow、manifest 和知识目标。
- 执行非破坏性检查命令。
- 输出 Reconciliation Report。
- 建议更新 manifest、DocFlow、specs 或知识目标。
- 在用户明确授权时准备或应用文档、manifest、知识目标更新。

禁止：

- 修改生产代码。
- 修改代码以消除漂移。
- 修改文档以掩盖未授权代码行为。
- 写入未授权知识目标。
- 使用聊天记录替代已批准产物。
- 在当前事实源冲突时继续推进下游。

## Blocking Conditions

必须停止的情况：

- Requirement ID 或 feature scope 不明确。
- 当前有效 DocFlow、specs 或实现范围缺失。
- 源产物之间存在无法判定优先级的冲突。
- 代码行为无法检查。
- 发现的漂移需要生产代码修复。
- 文档或知识库写入缺少授权。
- 审计结论依赖未验证事实。

## Gate Requirements

前置 Gate：

- `sdlc-speckit-implement` 已产生实现结果，或用户明确要求对当前代码状态进行漂移审计。
- 必要时 `sdlc-speckit-sync` 已执行或已明确未执行。
- 相关 DocFlow 和 Speckit 产物为当前版本。

后置 Gate：

- `CONSISTENT` 可进入后续代码审核、测试验收、发布报告或归档。
- `CODE_DRIFT` 必须回到 `sdlc-speckit-implement` 或更早 Gate。
- `SPEC_DRIFT` 必须回到 `sdlc-speckit-specify`、`sdlc-speckit-plan` 或 `sdlc-speckit-tasks`。
- `DOCFLOW_DRIFT` 必须回到 `sdlc-specification-writer`、`sdlc-solution-reviewer` 或 `sdlc-gate-runner`。
- `KNOWLEDGE_DRIFT` 必须回到 `sdlc-speckit-sync`。
- `MANIFEST_DRIFT` 必须建议 manifest Activity Log、Change History、Re-Gate Records 或 Sync 状态修正。
