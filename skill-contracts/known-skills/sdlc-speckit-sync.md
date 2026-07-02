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
  - specs/{feature}/route.md
  - specs/{feature}/spec.md
  - specs/{feature}/plan.md
  - specs/{feature}/tasks.md
  - implementation result from sdlc-speckit-implement
  - verification evidence
  - optional library/{requirement_id}/03-实现记录/*
  - optional library/{requirement_id}/04-代码审核/*
  - optional library/{requirement_id}/05-测试验收/*
  - optional library/{requirement_id}/manifest.md
  - optional .specify/entry-coverage-profile.yaml
  - optional .specify/business_domain/01DomainCatalog.md
  - optional .specify/business_domain/** existing L1/L2/L4 documents
  - templates/business-domain-l4/{profile}.md
output_artifacts:
  - sync report
  - knowledge updates or proposed updates
  - authorized create-if-missing L4 skeleton
  - L2 main document index update
  - 01DomainCatalog.md update
  - manifest.md Speckit Sync update recommendation
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/artifact-versioning.md
  - ai-sdlc/change-control.md
required_contract:
  - skill-contracts/sync-skill-contract.md
side_effects:
  - update authorized knowledge targets
  - create authorized missing L4 business-domain documents
  - create authorized missing L4 business-domain documents from project-type L4 templates
  - update L2 main document index and 01DomainCatalog.md for created L4 documents
  - run standard entry coverage audit for business_domain sync
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
  - create-if-missing is missing authorization, confirmed L1/L2, owner, or reserved L4 id
  - create-if-missing cannot resolve Project Type Profiles or selected L4 template
  - entry coverage audit fails for business_domain sync
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
- 在 L1/L2 已确认、owner 明确、create-if-missing 已授权且 L4 id 可保留时，创建缺失的 L4 骨架。
- 创建缺失 L4 时读取 `specs/{feature}/route.md` 或 Pipeline Domain Route Summary 的 Project Type Profiles，并记录 `Selected L4 Template`，选择 `${AI_SDLC_STANDARD_HOME}/templates/business-domain-l4/{profile}.md` 项目类型化模板。
- 创建 L4 时同步维护 L2 main document index 与 `01DomainCatalog.md`。
- 对 `.specify/business_domain/**` 同步运行 entry coverage audit，并在审计失败时阻断最终 Sync。
- 对不适合同步的内容输出跳过原因。
- 输出 Sync 结果、残余风险和 manifest Speckit Sync 更新建议。

它不负责：

- 修改生产代码。
- 替代实现、代码审核或测试验收。
- 把聊天片段沉淀为长期事实。
- 把 `library/{requirement_id}/` 当作长期知识库。
- 在缺少授权时写入知识库。
- 在缺少 create-if-missing 授权时创建 L4。
- 将未确认 L1/L2 或 `99PendingConfirmation` 当作长期同步目标。
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
- Replaced Artifact Paths。
- 现有目标知识文档。
- `.specify/entry-coverage-profile.yaml`。
- `.specify/business_domain/01DomainCatalog.md`。
- business_domain L1/L2/L4 route、owner、entry coverage 状态。
- 缺失 L4 时的 create-if-missing 授权与 L4 id reservation 依据。
- 缺失 L4 时的 Project Type Profiles 与 Selected L4 Template。

前置条件：

- 实现状态为 `COMPLETED`，或同步范围明确限定为已验证完成任务。
- 同步事实有可追溯来源和验证证据。
- 目标路径明确。
- 写入目标已获得用户授权。
- business_domain L1/L2 已确认；缺失 L4 时必须具备 create-if-missing 授权、owner、reserved L4 id。
- 缺失 L4 时必须能从 route artifact 的 Project Type Profiles 选择项目类型化 L4 skeleton。

缺失输入处理：

- 缺少实现结果时停止并回到 `sdlc-speckit-implement`。
- 缺少实现记录时可以输出 proposal，但必须建议运行 `sdlc-implementation-recorder`。
- 缺少目标路径时停止。
- 缺少写入授权时只输出 proposal，不落盘。
- 缺少 confirmed L1/L2、owner、L4 id reservation 或 create-if-missing 授权时停止。
- 缺少 Project Type Profiles 或 selected L4 template 时停止；仅在明确记录 conservative backend-business-service fallback 时可继续。
- entry coverage audit 无法运行或结果为 `BLOCKED` / `PENDING` 时停止。

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
- Sync Scope。
- Target Documents。
- Create-If-Missing Decision。
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
- 在 create-if-missing 已授权且 L1/L2 已确认时，基于 Project Type Profiles 创建 L4 skeleton。
- 更新 L2 main document index。
- 更新 `01DomainCatalog.md`。
- 运行 entry coverage audit。
- 建议更新 checklist、schema 或 workflow。
- 建议更新 manifest Speckit Sync 区块。
- 建议创建 Re-Gate Records。

禁止：

- 修改业务代码。
- 修改 spec、plan、tasks 来适配同步。
- 写入未授权目标。
- 创建缺少 confirmed L1/L2、owner、reserved L4 id 或 create-if-missing 授权的 L4 文档。
- 使用通用 L4 skeleton 作为所有项目类型的唯一默认输出。
- 写入 `99PendingConfirmation` 作为长期事实同步目标。
- 沉淀未验证事实。
- 沉淀一次性需求交付说明。
- 覆盖冲突知识。
- 将聊天记录作为事实源。

## Blocking Conditions

必须停止的情况：

- 实现未验证。
- 来源产物缺失或 stale。
- 同步目标路径、归属或写入权限不明确。
- 缺失 L4 的 L1/L2 未确认。
- 缺失 L4 无 create-if-missing 授权、owner 或 reserved L4 id。
- 缺失 L4 无 Project Type Profiles 或 selected L4 template。
- 候选事实不稳定、不可复用或只服务当前一次需求。
- 候选事实与既有知识冲突。
- 候选事实依赖未完成的代码审核或测试反馈。
- entry coverage audit 对 business_domain 同步返回 `BLOCKED` / `PENDING` 或命令失败。
- 同步需要修改代码、spec、plan 或 tasks。

## Gate Requirements

前置 Gate：

- `sdlc-speckit-implement` 已完成相关任务并有验证证据。
- 必要时 `sdlc-implementation-recorder` 已生成实现记录，或实现结果足以追溯。
- 代码审核或测试反馈中没有阻止同步的未决项。
- business_domain Sync 已确认目标 L1/L2/L4、owner、entry coverage 状态；缺失 L4 时已记录 create-if-missing 决策、Project Type Profiles 和 selected L4 template。

后置 Gate：

- Manifest 的 Speckit Sync 区块必须记录是否执行、目标路径、结果和残余风险。
- 创建 L4 时，L2 main document index 与 `01DomainCatalog.md` 必须同步更新。
- business_domain Sync 后必须记录 entry coverage audit 结果。
- 若发现代码与知识不一致，建议进入 `sdlc-speckit-code-doc-reconcile`。
- 若测试反馈暴露通用规则缺口，建议进入 `sdlc-test-feedback-sync`。
