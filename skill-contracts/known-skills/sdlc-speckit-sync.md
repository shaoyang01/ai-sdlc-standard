# sdlc-speckit-sync Skill Contract

## Metadata

```yaml
name: sdlc-speckit-sync
version: 0.1.0
category: Sync Skill / Producer Skill
stage: Speckit Sync / Knowledge Sync
standard_package: ai-sdlc-standard
status: active
input_artifacts:
  - specs/{feature}/spec.md
  - specs/{feature}/plan.md
  - specs/{feature}/tasks.md
  - implementation result from sdlc-speckit-implement
  - verification evidence
  - optional library/{requirement_id}/03-实现记录/*
  - optional library/{requirement_id}/04-代码审核/*
  - optional library/{requirement_id}/05-测试验收/*
  - optional library/{requirement_id}/manifest.md
output_artifacts:
  - sync report
  - knowledge updates or proposed updates
  - manifest.md Speckit Sync update recommendation
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
required_contract:
  - skill-contracts/sync-skill-contract.md
side_effects:
  - update authorized knowledge targets
  - recommend checklist, schema, or manifest updates
  - recommend Re-Gate or reconcile actions
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: true
can_execute_commands: true
blocking_conditions:
  - implementation is unverified
  - target path or ownership is unclear
  - user did not authorize writing to target
  - proposed fact is unstable, one-off, or contradicted
```

## Standard Path Resolution

本合同中 `required_schema`、`required_checklist`、`required_storage`、`skill_path` 与 `references` 里的共享标准路径，均相对 `AI_SDLC_STANDARD_HOME` 解析。

执行 Skill 前必须先读取 `${AI_SDLC_STANDARD_HOME}/ai-sdlc/standard-package-resolution.md`，确认标准包根目录有效。目标项目不需要、也不应该复制共享 `ai-sdlc/**`、`ess/**`、`checklists/**`、`templates/**` 或 `skill-contracts/**` 文件。

## Responsibilities

`sdlc-speckit-sync` 是 Speckit Sync 阶段的标准 Skill。

它负责：

- 读取已验证实现结果、spec、plan、tasks、实现记录、代码审核和测试反馈。
- 判断哪些事实是稳定、可复用、适合长期沉淀的知识。
- 将已授权的事实同步到 `.specify/business_domain/**` 或其他明确目标。
- 对不适合同步的内容输出跳过原因。
- 输出 Sync 结果、残余风险和 manifest Speckit Sync 更新建议。

它不负责：

- 修改生产代码。
- 替代实现、代码审核或测试验收。
- 把聊天片段沉淀为长期事实。
- 把 `library/{requirement_id}/` 当作长期知识库。
- 在缺少授权时写入知识库。
- 覆盖或删除现有知识。

## Input Contract

必需输入：

- `specs/{feature}/spec.md`
- `specs/{feature}/plan.md`
- `specs/{feature}/tasks.md`
- `sdlc-speckit-implement` 的实现结果。
- 已完成任务的验证证据。

建议输入：

- `library/{requirement_id}/03-实现记录/*`
- `library/{requirement_id}/04-代码审核/*`
- `library/{requirement_id}/05-测试验收/*`
- `library/{requirement_id}/manifest.md`
- 已接受风险记录。
- Re-Gate Records。
- Superseded Artifacts。
- 现有目标知识文档。

前置条件：

- 实现状态为 `COMPLETED`，或同步范围明确限定为已验证完成任务。
- 同步事实有可追溯来源和验证证据。
- 目标路径明确。
- 写入目标已获得用户授权。

缺失输入处理：

- 缺少实现结果时停止并回到 `sdlc-speckit-implement`。
- 缺少实现记录时可以输出 proposal，但必须建议运行 `sdlc-implementation-recorder`。
- 缺少目标路径时停止。
- 缺少写入授权时只输出 proposal，不落盘。

## Output Contract

输出必须覆盖：

- Source Artifacts。
- Sync Scope。
- Target Documents。
- Synced Facts Or Proposed Updates。
- Skipped Items。
- Conflict And Blocking Items。
- Verification Basis。
- Manifest Speckit Sync Recommendation。
- Next Step。

允许的结果：

- `SYNCED`
- `PROPOSED`
- `PARTIAL`
- `BLOCKED`

## Side Effects

允许：

- 修改已授权知识目标。
- 建议更新 checklist、schema 或 workflow。
- 建议更新 manifest Speckit Sync 区块。
- 建议创建 Re-Gate Records。

禁止：

- 修改业务代码。
- 修改 spec、plan、tasks 来适配同步。
- 写入未授权目标。
- 沉淀未验证事实。
- 沉淀一次性需求交付说明。
- 覆盖冲突知识。
- 将聊天记录作为事实源。

## Blocking Conditions

必须停止的情况：

- 实现未验证。
- 来源产物缺失或 superseded。
- 同步目标路径、归属或写入权限不明确。
- 候选事实不稳定、不可复用或只服务当前一次需求。
- 候选事实与既有知识冲突。
- 候选事实依赖未完成的代码审核或测试反馈。
- 同步需要修改代码、spec、plan 或 tasks。

## Gate Requirements

前置 Gate：

- `sdlc-speckit-implement` 已完成相关任务并有验证证据。
- 必要时 `sdlc-implementation-recorder` 已生成实现记录，或实现结果足以追溯。
- 代码审核或测试反馈中没有阻止同步的未决项。

后置 Gate：

- Manifest 的 Speckit Sync 区块必须记录是否执行、目标路径、结果和残余风险。
- 若发现代码与知识不一致，建议进入 `sdlc-speckit-code-doc-reconcile`。
- 若测试反馈暴露通用规则缺口，建议进入 `sdlc-test-feedback-sync`。
