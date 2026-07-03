# New-Rail Enhanced Speckit Pipeline Summary

> **Status**: Completed（PR J–P 已完成，Final Audit P1 已修复）
> **Date**: 2026-07-03
> **Version**: 0.1.0

## 1. Purpose

`ai-sdlc-standard` 是一套可迁移的 Speckit 标准库。它将 Speckit 相关规则从分散的 Skill、memory、workflow、coding guide 和项目文档中抽象为可版本管理的标准包，解决以下问题：

- **规则碎片化**：旧版 Speckit 规则散布在 `.specify/memory/`、`.specify/workflow/`、`.specify/coding_guide/` 以及各项目的 AGENTS.md 中，难以统一维护和迁移。
- **双轨共存**：存量项目继续使用 `legacy_speckit`，新项目或显式切换的项目使用 `new_rail_sdlc`，两套流程互不干扰。
- **灵活路径**：支持完整的 Speckit pipeline（speckit_driven），也支持 Direct Implementation / library-only DocFlow（library_driven）。
- **长期知识治理**：`.specify/business_domain/` 作为 `legacy_speckit` 与 `new_rail_sdlc` 共享的长期知识库，通过命名、形态、兼容更新、冲突协调等协议保证一致性。
- **防回归体系**：通过 `validate-skill-contracts.rb`、`validate-product-parity-fixtures.rb` 和 16 个 synthetic fixture 形成完整的横向防回归层。

本标准库不删除 legacy Speckit。使用旧 Skill 的项目继续使用 `legacy_speckit`。显式使用 `sdlc-*` / `sdlc-speckit-*` 的项目进入 `new_rail_sdlc`。

## 2. Rail Model

### legacy_speckit

- 由 `/speckit.*` 或 `$speckit-*` 激活。
- 使用旧版 Speckit Skill 和旧版文档（`.specify/memory/**`、`.specify/workflow/**`、`.specify/coding_guide/**`）。
- 可以继续读写 `.specify/business_domain/` 作为共享长期知识库。
- AGENTS.md 中的 legacy Speckit 命令保持不变。

### new_rail_sdlc

- 由 `sdlc-*` / `sdlc-speckit-*` / `new rail` / `AI SDLC 标准库` 显式激活。
- 不 fallback 到 legacy Skill runtime。
- 不读取或写入 target `.specify/memory/**`、`.specify/workflow/**`、`.specify/coding_guide/**` 作为 runtime input 或 target。
- 使用标准包的 `ai-sdlc/`、`skill-contracts/`、`templates/`、`scripts/`、`fixtures/` 作为运行时规则源。

### Ambiguous Rail

- 当用户输入无法明确区分使用哪条 rail 时，必须 ask 或 block。
- 单个 specs run 必须 rail-consistent，不允许 mid-run 切换 rail。
- 不同 specs run 之间可以使用不同 rail。

## 3. Core Artifact Boundaries

### specs/

- **run-level artifact**，不是 requirement-level artifact。
- 一个 `requirement_id` 可以有多个 `specs_run_id`。
- 每个 specs run 有独立生命周期：`created` → `active` → `business_domain_synced` → `archived` / `superseded` / `cleaned`。
- 满足 archive/cleanup gate 条件后可以归档或清理。
- 清理时不得删除 `library/{requirement_id}/**` 或 `.specify/business_domain/**`。

### library/

- **requirement-level DocFlow workspace**，独立于 specs run lifecycle。
- 不是 legacy protected directory。
- 不是 long-term knowledge base。
- 可以作为 source evidence 用于 library_driven sync。
- 简单需求（Direct Implementation）可以只产生 library 产物，不产生 specs。

### .specify/business_domain/

- **shared long-term knowledge base**，`legacy_speckit` 与 `new_rail_sdlc` 都可以治理。
- 单个 specs run 必须 rail-consistent，但不同 rail 可以在不同 run 中写入同一 business_domain。
- 所有写入必须通过命名协议、形态协议、兼容更新协议、冲突协调协议。

## 4. Sync Source Modes

### speckit_driven

- Speckit pipeline 产生 specs，Sync/Reconcile 以 specs run 和 pipeline evidence 为主要来源。
- pipeline Sync/Reconcile 执行后为 authoritative business_domain governance path。
- 不应重复执行 library_driven sync（除非满足 supplemental sync 条件）。

### library_driven

- Direct Implementation / library-only DocFlow 场景。
- 不要求 `specs/{feature}/**`，不要求 `specs_run_id`。
- `requirement_id` 必须存在。
- direct write 必须有 implementation evidence 和 verification evidence。
- insufficient evidence → `proposal` / `not_required` / `blocked`。
- 不满足 readiness 时不能 direct confirmed write。

### hybrid

- specs 与 library artifacts 都存在。
- 通过 manifest `current effective version`、pipeline status、source freshness、gate result 判断 source priority。
- 避免同一事实被 speckit_driven 和 library_driven 重复写入。

### Duplicate Sync Guard

- `pipeline_sync_executed=true` 且 `result=synced` 时，`library_driven` direct write 默认 blocked。
- supplemental sync 需要显式授权，且需要检测无重复事实。
- same fact already synced → `NOT_REQUIRED` 或 `DUPLICATE_SYNC_BLOCKED`。
- manifest 必须记录 `duplicate_sync_guard` 和 `business_domain_sync` 状态。

## 5. Business Domain Governance

### create-if-missing

- target L4 missing 时，不默认使用 standard L4 template。
- 必须先使用 project canonical naming + project shape。
- standard template fallback 只在 explicit fallback 条件下允许：no existing project shape exists + user confirms fallback + `standard_template_fallback_allowed=true` + no conflict。
- 必须更新 L2 main document index 和 `01DomainCatalog.md`。
- 必须记录 `naming_pattern_source`、`shape_profile_source`、`shape_confidence`、rail、source_artifacts。
- 不得创建同义重复 L4。

### existing L4 update

- 使用 compatible update。
- preserve existing shape（标题格式、Metadata 字段、章节语言、表格结构、修订记录格式）。
- preserve existing facts（除非有明确的 supersession 证据）。
- safe insertion point 必须明确。unknown → update proposal。
- fact conflict → reconcile proposal。
- no whole-document rewrite。
- no forced New-Rail section injection。

### Conflict Handling

冲突类型：`semantic_conflict`、`code_drift`、`doc_drift`、`stale_fact`、`scope_conflict`、`duplicate_fact`、`source_priority_conflict`。

冲突时不覆盖、不删除 existing fact。生成 reconcile proposal，推荐进入 `sdlc-speckit-code-doc-reconcile`。

## 6. Specs Run Lifecycle

### Identity

- `specs_run_id`、`requirement_id`、`feature_id`、`rail`、`generated_by`、`source_mode`。

### Lifecycle States

| State | Description |
| --- | --- |
| `created` | Specs run 已生成。 |
| `active` | 当前实现、review、verification 仍引用该 run。 |
| `business_domain_synced` | 仅当 `business_domain_sync.result` 为 `synced` 或 `not_required` 时有效。 |
| `archived` | 不再是 active reference，保留 traceability。 |
| `superseded` | 被同 `requirement_id` 下另一个 `specs_run_id` 替代。 |
| `cleaned` | 文件已清理，manifest 保留 metadata。 |

### Authority

- manifest 是 lifecycle authority。
- `workflow-status.md` 只是 machine snapshot，不是 authority。
- 冲突时以 manifest 为准，记录 `MANIFEST_DRIFT`。

### Archive / Cleanup Gates

- archive allowed: lifecycle `business_domain_synced` 或 `superseded`，BD sync result `synced`/`not_required`，not active，无 open blocking items。
- cleanup allowed: archived 或 superseded，manifest 保留 metadata，BD sync result `synced`/`not_required`，owner confirms。
- cleanup forbidden: active, BD sync `pending`/`proposal`/`blocked`, audit needs originals, evidence only in specs files。
- cleanup must not delete `library/{requirement_id}/**` 或 `.specify/business_domain/**`。
- no filename-versioned artifacts。

## 7. Library-Driven Sync Runtime

### Runtime Inputs

- `requirement_id`
- current library artifact / manifest
- `01-技术方案`
- `02-方案审核` PASS / PASS_WITH_RISK
- implementation evidence
- verification evidence
- business_domain target

### Evidence Classification

- **Implementation evidence 来源**：`03-实现记录`、implementation result、accepted code diff、accepted review evidence、delivery summary、commit range。
- **Verification evidence 来源**：`05-测试验收`、test result、accepted review/test feedback、delivery summary with verification outcome、CI/test log summary。
- **Insufficient evidence**：only chat discussion、only speculative design、only pending review、only unverified code diff、missing `02-方案审核` decision、`02-方案审核` rejected/blocked。

### Sync Need Classification

| Classification | Condition |
| --- | --- |
| `SYNC_REQUIRED` | Stable facts + evidence + target clear + guard clear。 |
| `NOT_REQUIRED` | No stable facts, one-off, or already synced。 |
| `PROPOSAL_REQUIRED` | Evidence partial, target/section unclear, authorization missing。 |
| `BLOCKED` | Evidence/gate/target conflict。 |
| `DUPLICATE_SYNC_BLOCKED` | Pipeline sync already executed without supplemental authorization。 |

## 8. Project-Type Contract Artifact Matrix

### Project Type Profiles

`backend-business-service`、`frontend-application`、`admin-mixed-workflow`、`data-pipeline-etl`、`library-shared-component`。

### Artifact Status

| Status | Requirements |
| --- | --- |
| `Produced` | 本 run 生成。 |
| `Reused` | 复用已有 artifact，requires `source_artifacts` + `freshness`。 |
| `Not Applicable` | 不需要，requires project-type justification。 |
| `Deferred` | 暂不生成，requires `accepted_by` + `verification_alternative` + `re_gate_required`。 |

### Plan Gate BLOCKED

- required artifact missing。
- Deferred without `accepted_by`（→ BLOCKED）。
- Deferred without `verification_alternative`（→ BLOCKED）。
- Not Applicable without project-type justification。
- Reused without `source_artifacts` / `freshness`。
- profile unknown 且 no conservative baseline / user confirmation。

### Key Rules

- `workflow-status.md` is snapshot，manifest is authority。
- no filename-versioned companion artifacts。
- library_driven without specs does not require specs companion artifacts。

## 9. Skill Responsibilities

### sdlc-speckit-plan

- 生成 / 验证 `plan.md` 及 companion artifacts（`research.md`、`data-model.md`、`contracts/`、`quickstart.md`）。
- 应用 Project-Type Contract Artifact Matrix。
- 执行 Plan Gate，缺失 required artifact 或 invalid skip/defer → BLOCKED。

### sdlc-speckit-sync

- 将稳定可复用的实现事实同步到 `.specify/business_domain/`。
- 支持 `speckit_driven` / `library_driven` / `hybrid` 三种 sync_source_mode。
- library_driven runtime readiness 检查。
- duplicate sync guard。
- 输出 manifest `business_domain_sync` 推荐。

### sdlc-speckit-code-doc-reconcile

- 检测 code / specs / DocFlow / business_domain 之间的 drift。
- 兼容更新冲突处理。
- 区分 legacy / new-rail 产品来源。
- 保持 baseline traceability。

## 10. Validation and Fixture System

### Validators

| Script | Purpose |
| --- | --- |
| `scripts/validate-skill-contracts.rb` | 检查 Skill contract、manifest、reference、legacy source 红线、rail routing、sync source modes、business_domain governance、specs lifecycle、library_driven runtime、project-type contract matrix、forbidden behavior 等静态一致性。 |
| `scripts/validate-product-parity-fixtures.rb` | 读取 `fixtures/speckit-product-parity/**/fixture.yaml`，验证 required_standard_files 存在、required_terms 在标准文件中出现、forbidden_terms 只以 guard context 出现。 |

### Fixture Categories（16 fixtures）

| Category | Covering |
| --- | --- |
| rail routing | legacy_speckit / new_rail_sdlc 激活边界 |
| sync source modes | speckit_driven / library_driven / hybrid / duplicate sync guard |
| business-domain naming/shape | canonical naming, project shape, standard template fallback |
| business-domain compatible update | preserve shape/facts, update proposal, reconcile proposal |
| specs-run lifecycle | specs_run_id, manifest authority, archive/cleanup gate |
| library-driven sync runtime | evidence classification, sync need classification, supplemental sync |
| project-type contract matrix | Produced/Reused/NA/Deferred, BLOCKED conditions |
| legacy-new-rail-product-parity-expanded | PR J–P 横向综合覆盖 |

### Forbidden Terms Guard Context

Forbidden terms 可以出现在 expected.md 或 standard files 中，但必须带有 guard context：
`must not`、`forbidden`、`prohibited`、`not allowed`、`no`、`cannot`、`do not`、`不得`、`禁止`、`不允许`、`不能`。

## 11. Manifest and Standard Package Entrypoints

`manifest.yaml` 是标准包的索引文件，包含所有 `ai-sdlc/` governance 文件、`templates/`、`scripts/` 的 entrypoint。标准包使用者应通过 `manifest.yaml` 发现和引用标准文件。

旧 reference `skills/sdlc-speckit-plan/references/project-type-contract-matrix.md` 已标记为 `superseded` / `not authoritative`。Authoritative matrix 位于 `ai-sdlc/project-type-contract-artifact-matrix.md`。

## 12. Adoption Guide

### Existing Legacy Speckit Project

- 不强制迁移。继续使用 `legacy_speckit`。
- 如需使用 New-Rail，必须显式切换（`sdlc-*` / `sdlc-speckit-*`）。
- `.specify/business_domain/` 现有 shape/naming 必须保留，New-Rail 写入时遵守 compatible update 协议。
- 执行 `scripts/bootstrap-speckit-project.sh` 生成 `project-context/` 文件，由 owner review 确认后使用。

### New Project

- 使用 `manifest.yaml` 初始化标准包。
- 执行 `scripts/bootstrap-speckit-project.sh` 建立 `.specify/project-governance-profile.yaml`。
- 使用 `sdlc-*` / `sdlc-speckit-*`。
- 如需 business_domain，可执行 `scripts/bootstrap-business-domain.sh --confirmed`。

### Direct Implementation / Library-Only DocFlow

- 使用 `library_driven` sync mode。
- 不要求 `specs/`。
- 实现和验证证据齐备后可通过 `sdlc-speckit-sync` 同步 business_domain。
- 否则输出 proposal、not_required 或 blocked。

### Hybrid Project

- specs 和 library 共存。
- 通过 manifest source freshness 和 duplicate sync guard 决策。
- 避免 speckit_driven 和 library_driven 重复写入同一 business_domain 事实。

## 13. Operational Redlines

必须禁止的行为：

- New-Rail fallback 到 legacy Skill runtime。
- New-Rail runtime read/write target `.specify/memory/**`、`.specify/workflow/**`、`.specify/coding_guide/**`。
- Treat `library/{requirement_id}/` as legacy protected directory。
- Treat `library/{requirement_id}/` as long-term knowledge base。
- Treat `specs/` as requirement-level artifact。
- Direct write `.specify/business_domain/` without implementation evidence and verification evidence。
- Whole-document rewrite existing L4。
- Forced New-Rail section injection into legacy-shaped L4。
- Cleanup deletes `library/{requirement_id}/**` 或 `.specify/business_domain/**`。
- Workflow-status as lifecycle authority。
- Plan Gate PASS with missing required artifact。
- Deferred without `accepted_by` / `verification_alternative`。
- Filename-versioned artifacts。

## 14. Current Completion Status

| PR | Status | Summary |
| --- | :--: | --- |
| PR J | ✅ Completed | Rail routing, sync_source_mode, shared business_domain governance |
| PR K | ✅ Completed | Business-domain naming + shape governance, create-if-missing |
| PR L | ✅ Completed | Compatible update, update proposal, reconcile proposal, conflict types |
| PR M | ✅ Completed | specs_run_id lifecycle, archive/cleanup policy |
| PR N | ✅ Completed | Library-driven sync runtime hardening |
| PR O | ✅ Completed | Project-type contract artifact matrix |
| PR P | ✅ Completed | Legacy/new-rail product parity fixture expansion, validator guard |
| Final Audit Cleanup | ✅ Completed | manifest entrypoints, plan deferred hardening |

**Verification**：
- `ruby scripts/validate-skill-contracts.rb` → ok
- `ruby scripts/validate-product-parity-fixtures.rb` → ok（16/16 fixtures pass）
- `git diff --check` → ok
- Final audit P1 findings resolved。

## 15. Next Recommended Work

- **不再扩协议**。当前 PR J–P 已覆盖 New-Rail Enhanced Speckit Pipeline 的核心语义。
- **选一个真实项目做 pilot**。建议从 `pfms` 或 `logistics-center` 开始。
- **输出 migration/adoption report**。观察 New-Rail 是否能在真实项目中完整跑通：plan → implement → sync → reconcile → archive/cleanup，以及 library_driven sync。
- **pilot 后再决定**是否抽象更多 project type profile、是否实现 writer script、是否补充更多 fixture。
