# New-Rail Enhanced Speckit Pipeline 下一阶段执行计划

> **日期**: 2026-07-02  
> **状态**: 下一阶段改造计划  
> **位置**: `temp/new-rail-enhanced-pipeline-next-20260702/route-artifact-next-plan.md`  
> **依据**: `temp/speckit-new-rail-product-parity-review-20260702.md`、当前 `main` 分支代码、围绕新版 pipeline skill 的讨论结论。  
> **目标**: 明确 PR A 之后的下一阶段改造顺序，优先稳定新版 pipeline 的 Route Artifact Schema，再继续收敛 Project-Type L4 模板、前端过程产物、Entry Coverage 精度和大仓 bootstrap 性能。

---

## 1. 当前总体判断

PR A 已经有效推进新版 Speckit pipeline 的核心定位。

当前 `sdlc-speckit-pipeline` 已经明确为 **New-Rail Enhanced Speckit Pipeline**，不是 legacy wrapper，也不是旧版 Skill 的调度器。运行时只能使用：

```text
sdlc-speckit-* 子 Skill
${AI_SDLC_STANDARD_HOME} 下的共享标准文档
.specify/project-governance-profile.yaml
.specify/entry-coverage-profile.yaml
.specify/business-domain-bootstrap.yaml
.specify/project-context/**
.specify/business_domain/**
specs/**
library/**
.specify/reports/**
目标代码库
用户显式确认事实
```

运行时禁止：

```text
调用旧版 speckit-* Skill
fallback 到旧版 Skill
读取 .specify/memory/** 作为新轨输入
读取 .specify/workflow/** 作为新轨输入
读取 .specify/coding_guide/** 作为新轨输入
把 legacy workflow / memory / coding guide 内容复制进新轨生成文档
```

PR A 后，当前项目已具备：

```text
1. New-Rail Enhanced Pipeline 身份定义。
2. runtime redlines。
3. ProjectWorkflowGuide.md。
4. ProjectDocumentationGuide.md。
5. ProjectCodingGuide.md / RepositoryStructure.md / ProjectGovernanceOverrides.md。
6. Clarify 边界策略。
7. pipeline report 中的 New-Rail Runtime Check。
8. pipeline report 中的 Domain Route Summary。
```

根据最新 parity review，整体差距已经明显缩小。后端和 ETL 已接近可实战闭环；admin mixed 主要卡在大仓扫描性能和 L4 模板；frontend / RN 主要卡在过程状态、实现细节、视觉反馈和 L4 子文档体系。

当前不能说“完美复现旧版 Skill 所有产物语义”，但可以说：

```text
新版 rail 的架构隔离、pipeline 主控定位、项目私有上下文承接点已经基本建立。
接下来要从“报告中的 summary”升级为“可稳定驱动后续子 Skill 的 route artifact”。
```

---

## 2. 当前已完成能力

### 2.1 Pipeline 主控身份已建立

新版 `sdlc-speckit-pipeline` 已经明确：

```text
1. 它是 New-Rail Enhanced Speckit Pipeline。
2. 它不是旧版 pipeline 的 wrapper。
3. 它不调用旧版 Skill。
4. 它不读取 legacy 文档作为 runtime 输入。
5. 它只编排新版 sdlc-speckit-* 子 Skill。
```

当前 stage 仍然保持：

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

但每个阶段的执行者必须是新版 Skill：

| Stage | Runtime executor |
| --- | --- |
| Preflight | `sdlc-speckit-pipeline` controller |
| Domain Route | `sdlc-speckit-pipeline` controller |
| Specify | `sdlc-speckit-specify` |
| Clarify | `sdlc-speckit-clarify` |
| Plan | `sdlc-speckit-plan` |
| Tasks | `sdlc-speckit-tasks` |
| Analyze | `sdlc-speckit-analyze` |
| Implement | `sdlc-speckit-implement` |
| Sync | `sdlc-speckit-sync` |
| Reconcile | `sdlc-speckit-code-doc-reconcile` |

### 2.2 新版项目私有上下文已补齐第一版

Bootstrap 现在会生成或预览：

```text
.specify/project-context/ProjectWorkflowGuide.md
.specify/project-context/ProjectDocumentationGuide.md
.specify/project-context/ProjectCodingGuide.md
.specify/project-context/RepositoryStructure.md
.specify/project-context/ProjectGovernanceOverrides.md
```

其中：

```text
ProjectWorkflowGuide.md
  承接项目本地 workflow、确认策略、分支、发布、验证、回滚、Direct Implementation 与 full SDD 切换规则。

ProjectDocumentationGuide.md
  承接 business_domain、L4、EntryCoverage、文档索引、Sync / Reconcile 文档更新规则。
```

这些文档不是 legacy 文档的兼容格式，而是新版 rail 的 project-private context。

### 2.3 Clarify 边界策略已确立

当前确认策略为：

```text
Pre-Clarify：Preflight / Domain Route / Specify 成功后询问是否进入下一节点。
Clarify Gate：Clarify 发现核心问题时停止。
Post-Clarify：Clarify 通过后，Plan -> Tasks -> Analyze -> Implement -> Sync -> Reconcile 连续执行。
```

进入 Post-Clarify 连续执行前，必须提前收集必要授权：

```text
代码实现授权
business_domain Sync 目标与写入授权
Reconcile apply 授权
风险接受 owner 确认
create-if-missing 创建 L4 授权
```

---

## 3. 当前剩余主要差距

### 3.1 Domain Route 仍只是 summary，不是稳定 artifact

当前 pipeline report 中已经有 `Domain Route Summary`，但它还没有升级为稳定 schema 或独立 route artifact。

这会导致：

```text
1. Specify 只能从 pipeline report 或上下文中读取 route 信息。
2. Plan / Analyze / Sync 缺少统一 route source of truth。
3. Route Type、L1/L2/L4、Entry Coverage Surface、Sync Targets、create-if-missing 决策可能在不同阶段表述不一致。
4. Route unknown 时的阻断条件不够可机器检查。
```

因此下一步最优先应该实现 **Route Artifact Schema**。

### 3.2 Project-Type L4 模板还不够强

Confirmed business_domain mode 已经可以生成真实 L1/L2/L4 skeleton，但 L4 内容仍偏通用。

目前差距：

```text
Backend:
  需要更强的 entry/service/manager/mapper、事务、幂等、回滚、补偿结构。

Admin Mixed:
  需要默认包含配置生命周期、审批/审核、导入导出、日志审计、只读 ETL 查询、并发与回滚、页面展示契约。

Frontend / RN:
  需要 Arch/API/Spec/Popups 子文档体系、route/page/component/store/API/popup 结构、视觉验证、backend/mock boundary。

ETL:
  需要 trigger/input/output/SQL lineage/partition/window/checkpoint/replay/idempotency/downstream consumer 结构。
```

### 3.3 Frontend process products 未标准化

旧版前端项目中存在过程性产物，例如：

```text
implementation-details.md
SDD_WORKFLOW_STATUS.md
```

新版目前还没有明确新轨等价位置。

建议后续标准化为：

```text
specs/{feature}/implementation.md
specs/{feature}/workflow-status.md 或 manifest Speckit Pipeline Status
library/{requirement_id}/03-实现记录/{requirement_id}__实现记录.md
pipeline result 的 Stage Timeline / Gate Results
```

其中 manifest 应作为状态权威源，`workflow-status.md` 只作为可选机器侧可读产物。

### 3.4 Entry Coverage runner 需要真实项目打磨

`audit-entry-coverage.rb` 已经实现 MVP，但当前匹配逻辑仍需要增强。

重点差距：

```text
1. technical bridge 分类不够细。
2. annotation/base/abstract/native shell/Pods 噪声需要排除。
3. Service/Manager/Mapper 反向覆盖需要增强。
4. ETL core unit reverse coverage 需要增强。
5. frontend route/page/component/store/API/popup 精确匹配需要增强。
6. EntryCoverage Markdown 表格解析需要强于简单全文包含匹配。
```

### 3.5 Bootstrap 大仓扫描性能需要处理

`pfms` 全量 dry-run 超过两分钟未返回，说明当前 bootstrap 在大仓上仍有性能风险。

需要后续支持：

```text
扫描进度日志
统一 file inventory cache
--scan-root / --include-root
--scan-timeout
--max-samples
更强默认 exclude
扫描耗时与 sampling 状态记录
```

---

## 4. 下一阶段 PR 顺序

### PR B: Route Artifact Schema

优先级：

```text
P0
```

目标：

```text
将 Domain Route Summary 从 pipeline report 中的一段 summary 升级为标准 route artifact schema。
```

建议新增：

```text
skills/sdlc-speckit-pipeline/references/domain-route-artifact.md
```

建议新增 route artifact 物化规则：

```text
1. pipeline report 中必须保留 Domain Route Summary。
2. 当 feature id 已确定并进入 full SDD 时，物化为 specs/{feature}/route.md。
3. specs/{feature}/spec.md 必须引用 route.md 或 Domain Route Summary。
```

必填字段：

```text
Requirement ID
Feature ID
Route Type
Project Type Profiles
Business Domain Targets
Business Knowledge Read Set
Entry Coverage Surface
Sync Targets
Create-If-Missing Decision
Unresolved Questions
Blocking Items
New-Rail Runtime Check
Source Artifacts
Manifest Recommendation
```

Route Type 枚举：

```text
existing-change
new-flow
integration-change
data-change
unknown
```

Business Domain Targets 应包含：

```text
L1
L2
L4
Target Status: existing / missing / create-if-missing-candidate / pending-confirmation
Owner
Evidence
```

Entry Coverage Surface 应包含：

```text
backend entries
admin entries
frontend entries
ETL entries
library/shared-component entries
```

New-Rail Runtime Check 必须包含：

```text
Runtime child skills: sdlc-speckit-* only
Legacy Skill usage: none
Legacy document runtime input: none
Legacy document write target: none
Project private context read set
Standard package resolution
```

#### PR B 需要改的文件

```text
skills/sdlc-speckit-pipeline/SKILL.md
skills/sdlc-speckit-pipeline/references/new-rail-enhanced-pipeline.md
skills/sdlc-speckit-pipeline/references/stage-sequence.md
skills/sdlc-speckit-pipeline/references/output-and-manifest.md
skills/sdlc-speckit-pipeline/references/domain-route-artifact.md
skills/sdlc-speckit-specify/SKILL.md
skills/sdlc-speckit-specify/references/spec-sync-mapping.md
skills/sdlc-speckit-specify/references/output-and-manifest.md
skill-contracts/known-skills/sdlc-speckit-pipeline.md
skill-contracts/known-skills/sdlc-speckit-specify.md
docs/VALIDATION.md
```

#### PR B 验收标准

```text
1. Route Type = unknown 时禁止进入 Specify，除非用户显式确认 route。
2. create-if-missing 必须记录目标 L1/L2/L4 和授权状态。
3. New-Rail Runtime Check 必须明确 legacy Skill usage = none。
4. New-Rail Runtime Check 必须明确 legacy document runtime input = none。
5. specs/{feature}/spec.md 必须引用 route.md 或 pipeline Domain Route Summary。
6. Route artifact 必须能作为 Plan / Analyze / Sync 的统一输入边界。
```

---

### PR C: Project-Type L4 Templates

优先级：

```text
P1
```

目标：

```text
让 business_domain confirmed mode 和 Sync create-if-missing 生成项目类型化 L4 skeleton，而不是通用 L4 skeleton。
```

建议新增模板：

```text
templates/business-domain-l4/backend-business-service.md
templates/business-domain-l4/admin-mixed-workflow.md
templates/business-domain-l4/frontend-application.md
templates/business-domain-l4/data-pipeline-etl.md
templates/business-domain-l4/library-shared-component.md
```

Backend L4 默认结构：

```text
Business Scope
Entry / API / RPC / MQ / Schedule
Service / Manager / Mapper / Repository Chain
State / Data / Transaction
Idempotency / Rollback / Compensation
Failure Branches
Verification
Sync Notes
Revision History
```

Admin Mixed L4 默认结构：

```text
Configuration Lifecycle
Controller / Worker / Schedule / Data Console / SPI / RPC
Approval / Audit
Import / Export
Month Copy
Read / Write Separation
Optimistic Locking
Precision
Page Display Contract
Log / Trace Evidence
```

Frontend L4 默认结构：

```text
Route / Page / Component / Store / API Mapping
Popup Trigger / Visibility
Backend / Mock Boundary
Visual Verification
Dependency Pre-check
Arch Subdocument
API Subdocument
Spec Subdocument
Popups Subdocument
```

ETL L4 默认结构：

```text
Trigger
Input Tables / Topics / Files
Output Tables / Topics / Reports
SQL / Data Lineage
Partition / Window / Checkpoint
Rerun / Replay / Idempotency
Failure Branches
Downstream Consumer Contract
```

#### PR C 验收标准

```text
1. confirmed business_domain bootstrap 根据 selected profile 选择 L4 模板。
2. Sync create-if-missing 根据 selected profile 选择 L4 模板。
3. admin mixed L4 不再只是通用 skeleton。
4. frontend L4 能表达 Arch/API/Spec/Popups 体系。
5. ETL L4 能表达 trigger/input/output/lineage/replay/downstream consumer。
```

---

### PR D: Frontend Process Products

优先级：

```text
P1
```

目标：

```text
标准化前端 / RN 旧版过程性产物在新轨中的等价位置。
```

建议定义：

```text
specs/{feature}/implementation.md
specs/{feature}/workflow-status.md
library/{requirement_id}/03-实现记录/{requirement_id}__实现记录.md
manifest Speckit Pipeline Status
```

映射建议：

```text
implementation-details.md
  -> specs/{feature}/implementation.md
  -> library/{requirement_id}/03-实现记录/{requirement_id}__实现记录.md

SDD_WORKFLOW_STATUS.md
  -> specs/{feature}/workflow-status.md 或 manifest Speckit Pipeline Status
  -> pipeline result Stage Timeline / Gate Results
```

#### PR D 需要改的文件

```text
skills/sdlc-speckit-implement/SKILL.md
skills/sdlc-speckit-implement/references/output-and-manifest.md
skills/sdlc-speckit-pipeline/references/output-and-manifest.md
skills/sdlc-speckit-pipeline/references/stage-sequence.md
skill-contracts/known-skills/sdlc-speckit-implement.md
skill-contracts/known-skills/sdlc-speckit-pipeline.md
templates/artifact-manifest-template.md
docs/VALIDATION.md
```

#### PR D 验收标准

```text
1. 前端 / RN 实现细节有标准新轨产物承接。
2. workflow status 有 manifest 或 specs status 产物承接。
3. 不恢复旧版文件名作为兼容格式。
4. manifest 仍是状态权威源。
```

---

### PR E: Entry Coverage Precision

优先级：

```text
P1
```

目标：

```text
提升 audit-entry-coverage.rb 的匹配准确度，降低误报与漏报。
```

增强点：

```text
1. 解析 EntryCoverage Markdown 表格。
2. 支持 code anchor / class name / method name / route path / topic / job name。
3. 增加 technical bridge 分类。
4. 排除 annotation/base/abstract/native shell/Pods/generated code 噪声。
5. 增强 Service/Manager/Mapper reverse coverage。
6. 增强 ETL core unit reverse coverage。
7. 增强 frontend route/page/component/store/API/popup 精确匹配。
8. 更可靠地区分 current requirement 与 historical residue。
```

#### PR E 验收标准

```text
1. 同名类不应轻易误匹配。
2. abstract/base/annotation 不应默认成为未归档 blocker。
3. frontend native shell 不应污染业务 entry coverage。
4. ETL Function / Connector / Sink 能进入正确 evidence chain。
5. unarchived_entries / unarchived_services / cross_domain_conflicts 结果可解释。
```

---

### PR F: Bootstrap Performance

优先级：

```text
P1
```

目标：

```text
让大仓 dry-run 能在可接受时间内返回 profile 判断。
```

改造点：

```text
1. 增加扫描进度日志。
2. 统一 file inventory cache。
3. 增加 --scan-root / --include-root。
4. 增加 --scan-timeout。
5. 增加 --max-samples。
6. 增加默认 exclude。
7. 记录 scan duration。
8. 记录是否发生 sampling / timeout。
```

默认 exclude 建议包括：

```text
node_modules
target
build
dist
coverage
generated
Pods
android/build
ios/build
.idea
.gradle
.mvn
large fixture directories
```

#### PR F 验收标准

```text
1. pfms 这类大仓 dry-run 不应长时间无输出。
2. dry-run summary 应显示 scan duration。
3. 发生 timeout / sampling 时必须在 report 中标记。
4. 不能因为性能优化改变产物语义。
```

---

### PR G: Analyze Project-Type Checks Hardening

优先级：

```text
P1
```

目标：

```text
让 sdlc-speckit-analyze 按 selected project_type_profiles 执行差异化实现前审计。
```

建议新增：

```text
skills/sdlc-speckit-analyze/references/project-type-checks.md
```

检查维度：

```text
backend-business-service:
  entry -> service -> manager/domain service -> mapper/repository
  transaction / rollback
  idempotency / compensation
  API/RPC/MQ contract

admin-mixed-workflow:
  controller / worker / schedule / MCQ / OAS / data-console / SPI / RPC
  approval / audit / import / export / month-copy
  read-write separation
  optimistic locking
  precision
  page display contract

frontend-application:
  route / page / component / store / API / popup
  visibility rule
  visual self-correction
  dependency pre-check
  backend/mock boundary

data-pipeline-etl:
  job / main / function / connector
  input/output contract
  SQL/data lineage
  partition/window/checkpoint
  overwrite strategy
  replay/idempotency
  downstream consumer

library-shared-component:
  public API
  consumer scenario
  compatibility
  deprecation/migration
  test evidence
```

#### PR G 验收标准

```text
1. Analyze 必须读取 selected project_type_profiles。
2. Analyze 必须引用 route artifact。
3. Analyze 必须引用 entry coverage audit output。
4. Analyze 不得只做 generic consistency。
5. Analyze 通过后才能进入 Implement。
```

---

### PR H: Fixture-Based Product Parity Validator

优先级：

```text
P2
```

目标：

```text
将当前人工 parity review 沉淀为可持续 regression。
```

新增目录：

```text
fixtures/speckit-product-parity/
  backend-business-service/
  admin-mixed-workflow/
  frontend-application/
  data-pipeline-etl/
```

不要提交真实业务全文，只提交脱敏断言：

```text
expected-profile.yaml
expected-entry-types.yaml
expected-route-artifact.yaml
expected-spec-sections.yaml
expected-plan-products.yaml
expected-business-domain-shape.yaml
expected-entry-audit-reports.yaml
expected-sync-rules.yaml
expected-pipeline-stage-routing.yaml
```

新增脚本：

```text
scripts/validate-product-parity-fixtures.rb
```

#### PR H 验收标准

```text
1. profile selection 不退化。
2. entry profile 不退化。
3. route artifact schema 不退化。
4. spec product sections 不退化。
5. plan companion artifacts 不退化。
6. business_domain confirmed mode 不退化。
7. audit runner 输出不退化。
8. pipeline stage routing 必须 100% 使用新版 sdlc-speckit-* Skill。
```

---

## 5. 当前立即执行建议

下一步优先做：

```text
PR B: Route Artifact Schema
```

原因：

```text
1. Route 是 pipeline 主控与所有后续子 Skill 的输入边界。
2. 没有稳定 route artifact，Specify / Plan / Analyze / Sync 都可能各自解释 Domain Route。
3. create-if-missing 的 L1/L2/L4 决策必须在 Route 阶段固化。
4. New-Rail Runtime Check 必须在 Route 阶段成为可审计事实。
5. Route Type = unknown 的阻断需要产品化，而不是只依赖 Agent 自觉。
```

PR B 完成后，再做：

```text
PR C: Project-Type L4 Templates
```

因为 route artifact 稳定后，L4 模板才知道该按 backend/admin/frontend/ETL/library 哪种语义生成。

---

## 6. Codex 执行提示词

可以直接给 Codex：

```text
请在当前 ai-sdlc-standard 仓库中实现 PR B: Route Artifact Schema。

背景：
当前 sdlc-speckit-pipeline 已经定义为 New-Rail Enhanced Speckit Pipeline，并且 runtime 只能使用新版 sdlc-speckit-* Skill、新版标准包文档和新版 project-context / business_domain / specs / library 产物。禁止调用 legacy Skill，禁止读取或写入 .specify/memory/**、.specify/workflow/**、.specify/coding_guide/**。

目标：
将当前 pipeline report 中的 Domain Route Summary 升级为标准 route artifact schema，使 Domain Route 成为 Specify / Plan / Analyze / Sync 的稳定输入边界。

要求：
1. 新增 skills/sdlc-speckit-pipeline/references/domain-route-artifact.md。
2. 定义 route artifact 必填字段：
   - Requirement ID
   - Feature ID
   - Route Type
   - Project Type Profiles
   - Business Domain Targets
   - Business Knowledge Read Set
   - Entry Coverage Surface
   - Sync Targets
   - Create-If-Missing Decision
   - Unresolved Questions
   - Blocking Items
   - New-Rail Runtime Check
   - Source Artifacts
   - Manifest Recommendation
3. Route Type 枚举必须包含 existing-change / new-flow / integration-change / data-change / unknown。
4. Route Type = unknown 时必须阻断进入 Specify，除非用户显式确认 route。
5. 当 feature id 已确定并进入 full SDD 时，route artifact 应物化为 specs/{feature}/route.md。
6. sdlc-speckit-specify 必须读取 route.md 或 pipeline Domain Route Summary，并在 spec.md 中引用。
7. New-Rail Runtime Check 必须记录：
   - Runtime child skills: sdlc-speckit-* only
   - Legacy Skill usage: none
   - Legacy document runtime input: none
   - Legacy document write target: none
8. Create-If-Missing Decision 必须记录 L1/L2/L4、owner、authorization、entry coverage status。
9. 更新相关 Skill 文档、references、skill contracts、docs/VALIDATION.md。
10. 保持 stable artifact versioning，不创建 filename-versioned artifact。
11. 不引入任何 legacy runtime dependency。

验收标准：
- pipeline output 中保留 Domain Route Summary。
- specs/{feature}/route.md schema 明确。
- spec.md 引用 route artifact。
- unknown route 会阻断。
- create-if-missing 决策可追踪。
- New-Rail Runtime Check 可审计。
```

---

## 7. 最终判断

当前代码库已经从：

```text
架构隔离初步成立
```

推进到：

```text
New-Rail Enhanced Pipeline 主控身份基本成立
```

下一阶段核心不是继续讨论“是否兼容旧版”，而是继续把新版增强版 pipeline 的关键 runtime artifact 产品化。

最关键的第一个产品化对象就是：

```text
Route Artifact Schema
```

完成它之后，新版 pipeline 的主控能力、后续子 Skill 输入边界、Sync create-if-missing、Analyze gate 和 Reconcile drift 才会真正稳定。
