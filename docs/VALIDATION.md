# 校验指南

> 本指南说明当前仓库真实存在的校验能力，以及在真实项目试跑前应做的人工检查。

## 当前自动校验脚本

当前仓库提供：

```bash
ruby scripts/validate-skill-contracts.rb
```

该脚本用于校验标准包内部一致性。

## validate-skill-contracts.rb 检查什么

当前脚本检查：

```text
1. 每个 skills/sdlc-* 是否有对应 skill-contracts/known-skills/sdlc-*.md。
2. 合同 YAML 元数据是否包含必填字段。
3. 合同 name 是否与文件名一致。
4. category 是否属于允许分类。
5. can_modify_code / can_modify_knowledge_base 是否与 Skill 分类匹配。
6. manifest.yaml 中登记的 skill path 和 contract 是否存在。
7. registry/skill-registry.md 中登记的 Skill 是否与 manifest.yaml 一致。
8. skills/sdlc-* 下是否仍使用 ../../ai-sdlc、../../ess、../../templates、../../skill-contracts 等相对标准路径。
9. 新版 sdlc-* Skill 是否把旧版 .specify/memory、.specify/workflow、.specify/coding_guide 当作正常输入。
10. bootstrap 脚本是否具备 project-context candidate 策略，且不再依赖单一 --force。
11. New-Rail Enhanced Pipeline 是否声明 ProjectWorkflowGuide / ProjectDocumentationGuide、`sdlc-speckit-*` only、development-time fixture、Clarify 边界确认策略和 legacy path no-read/no-write 红线。
12. Frontend Process Products 是否声明并接入 implement / pipeline / reconcile：`specs/{feature}/implementation.md`、`workflow-status.md`、`debug-guide.md`、`observability.md`、`03-实现记录`、`04-交付总结`，且 manifest is status authority。
13. Feature-scoped path consistency 是否通过：当前 runtime 路径必须使用 `specs/{feature}/spec.md`、`specs/{feature}/plan.md`、`specs/{feature}/tasks.md`、`specs/{feature}/route.md`；implement 只能沿用 route artifact，不重新解释 route。
```

成功时输出：

```text
skill contract validation ok
```

失败时输出具体错误并返回非零状态。

## 双轨隔离校验

validator 会扫描 `skills/sdlc-*` 下的 Markdown。

危险语义示例：

```text
read .specify/memory/xxx.md
load .specify/workflow/xxx.md
use .specify/coding_guide/xxx.md as input
```

允许语义示例：

```text
do not read .specify/memory/**
preserve only
preserved_not_runtime_input
preserved_not_read
remain untouched
```

这用于防止新版 `sdlc-*` Skill 把旧版 Speckit 文档当作正常输入。

## bootstrap dry-run 校验

对目标项目执行：

```bash
scripts/bootstrap-speckit-project.sh <target-project-path> --dry-run
```

检查点：

```text
1. 是否预览 .specify/project-governance-profile.yaml。
2. 是否预览 .specify/entry-coverage-profile.yaml。
3. 是否预览 .specify/business-domain-bootstrap.yaml。
4. 是否预览 .specify/project-context/ProjectWorkflowGuide.md。
5. 是否预览 .specify/project-context/ProjectDocumentationGuide.md。
6. 是否预览 .specify/project-context/ProjectCodingGuide.md。
7. 是否预览 .specify/project-context/RepositoryStructure.md。
8. 是否预览 .specify/project-context/ProjectGovernanceOverrides.md。
9. 是否预览 .specify/reports/speckit_generation_report.md。
10. generation report 是否说明旧版文档 runtime action 为 preserved_not_read 或 not_present。
11. 是否不会写文件。
12. 是否不会生成 specs/** 或 .specify/business_domain/**。
```

已有 profile 时，dry-run 应提示真实写入需要 `--force-profiles`，但不应直接失败。

### project type profile 回归样例

对标准包 profile 选择逻辑做结果检验时，可用以下已有仓库形态作为语义样例。该检查是标准包开发期 review，不是目标项目 runtime 必须执行的旧文档对比。

| 样例仓库形态 | 期望 project type profiles | 期望 entry profile 重点 |
| --- | --- | --- |
| 纯后端业务服务，如 `logistics-center` | `backend-business-service` | `controller`、`rpc_provider`、`message_listener`、`scheduled_job`，不得因为普通 `package.json` 或静态资源误判为前端；package.json-only 不能触发 frontend-application。 |
| 后端管理/配置混合系统，如 `pfms` | `admin-mixed-workflow` + `backend-business-service` | `controller`、`worker`、`scheduled_job`、`mcq_consumer`、`oas_event`、`data_console`、`spi`、`rpc_provider`。 |
| React Native / 纯前端应用，如 `pfms-rn` | `frontend-application` | `route`、`page`、`component`、`store_action`、`api_client`、`popup`、`navigation_guard`；Android/iOS native shell 不应触发 Java backend 风格入口。 |
| Spark/Flink/ETL 计算项目，如 `tms-flink-finance` | `data-pipeline-etl` | `spark_job`、`spark_online_etl`、`flink_main`、`flink_process_function`、`mcq_connector`，不应退化成普通 Controller/Service 覆盖模型。 |
| 传统 Java Web 混合项目，如 `wms-monitor` | `frontend-application` + `backend-business-service` | 同时生成 Controller/RPC/MQ/Schedule 入口和 JSP/page/component/API/popup/navigation 等 webapp 入口。 |

Frontend heuristic 不得由 `package.json` 单独触发。只有出现明确前端业务目录或文件时才可选择 `frontend-application`：

```text
src/pages
src/views
src/screens
src/components
src/component
src/router
src/routers
src/routes
src/navigation
src/store
src/stores
src/models
src/actions
src/api
src/services
src/main/webapp
*.jsp / *.ftl / *.vm
```

## bootstrap 正式写入前检查

正式执行前确认：

```text
1. 目标项目是否允许新增 .specify/project-context/**。
2. 目标项目是否允许新增 .specify/reports/**。
3. 目标项目是否允许新增 library/ 并写入 .gitignore 的 /library/。
4. 已有 project-context 是否应生成 .candidate，而不是覆盖。
5. 是否真的需要 --force-profiles。
6. 是否需要保留旧版 Speckit rail。
```

默认不建议直接使用：

```bash
--force-profiles
--force-context
```

除非已经人工确认。

## bootstrap 输出检查

正式执行后检查：

```text
.specify/project-governance-profile.yaml
.specify/entry-coverage-profile.yaml
.specify/business-domain-bootstrap.yaml
.specify/project-context/ProjectWorkflowGuide.md
.specify/project-context/ProjectDocumentationGuide.md
.specify/project-context/ProjectCodingGuide.md
.specify/project-context/RepositoryStructure.md
.specify/project-context/ProjectGovernanceOverrides.md
.specify/reports/speckit_generation_report.md
```

不应生成 legacy inventory 或 pending comparison report；旧版文档只应保留给 legacy rail。

## entry coverage audit 校验

标准 runner：

```bash
scripts/audit-entry-coverage.rb <target-project-path>
```

默认读取：

```text
.specify/entry-coverage-profile.yaml
.specify/business_domain/**
目标代码库
```

默认输出到：

```text
.specify/reports/entry_coverage/
```

必须生成：

```text
entry_inventory.tsv
service_inventory.tsv
entry_chain_evidence.md
unarchived_entries.md
unarchived_services.md
cross_domain_conflicts.md
entry_coverage_report.md
```

阻断式调用使用：

```bash
scripts/audit-entry-coverage.rb <target-project-path> --strict
```

检查点：

```text
1. 无 .specify/business_domain 或无 L4 文档时，仍生成全部报告，并在 summary 中标记 BLOCKED。
2. 有 L4 文档时，entry_inventory.tsv 能区分 archived / unarchived。
3. 同一 entry 命中多个 L2 时，cross_domain_conflicts.md 非空并阻断。
4. 前端、传统 Java Web、后端、ETL、library 项目按 entry profile 的 entry_types 扫描，不按语言硬编码。
5. --strict 在 BLOCKED / PENDING 状态返回非零，供 Sync / Reconcile gate 使用。
6. EntryCoverage table parsing 不再只依赖全文 contains，Markdown 表格中的 Entry Type、Entry Name、Code Anchor、Path、Method、Function、Route、API client、Topic、Job、SQL、Connector、Sink、L4、Status、Evidence、Technical Bridge、Not Applicable 都可作为 evidence。
7. entry_inventory.tsv 必须包含 classification、classification_reason、match_strength、match_reason 或等价字段。
8. service_inventory.tsv 必须包含 classification、classification_reason、reverse_coverage_status 或等价字段。
9. technical bridge、framework bridge、generated/vendor、frontend native shell、abstract/base、annotation/marker、not applicable 必须保留在 inventory 并说明 reason，但不默认成为 blocking unarchived entry。
10. Service / Manager / Mapper reverse coverage 必须检查 entry -> service -> manager -> mapper/repository/client 链路证据；多 L4 命中进入 cross-domain conflict 或 multi-domain warning。
11. ETL core unit reverse coverage 必须支持 spark_job、spark_online_etl、flink_main、flink_process_function、mcq_connector、sink/publisher/downstream handler、SQL lineage、repository、calculator 等 evidence。
12. frontend/RN entry coverage 必须支持 route、page、component、popup/dialog/modal/sheet、store/action/model/reducer、api_client/request/service、navigation_guard、backend/mock boundary。
13. Pods、android/build、ios/build、MainActivity、AppDelegate、node_modules、generated/vendor 等噪声必须按 native_shell 或 generated_or_vendor 分类；只有 profile/evidence 明确纳入业务行为时才作为 business entry 阻断。
14. --requirement-id 或 --feature 传入时，应区分 current_requirement、historical_repository_residue、repository_wide、unmatched scope。
```

## Speckit sync create-if-missing 校验

`sdlc-speckit-sync` 只有在 business_domain 路由已确认时，才允许用 create-if-missing 创建缺失 L4。

必须记录：

```text
Target L1:
Target L2:
Target L4 Id:
Target L4 Document:
Target Owner:
Create-If-Missing Authorization:
Source Evidence:
Entry Coverage Status:
L2 Main Document Index Update:
01DomainCatalog.md Update:
Revision History Update:
```

检查点：

```text
1. 已存在 L4 时，只更新授权目标并保留 source evidence / revision history。
2. 缺失 L4 时，必须确认 L1/L2、owner、create-if-missing 授权和 L4 id reservation。
3. 创建 L4 skeleton 后必须同步更新 L2 main document index 和 01DomainCatalog.md。
4. 前端、后端、ETL、integration、scheduled-job entry fact 都必须说明 entry coverage audit 结果。
5. one-off、未验证、owner 不明确、只服务当前需求的事实不得 create-if-missing。
6. L1/L2 未确认、L4 id 无法保留、business_domain 已有冲突事实或 entry coverage audit 失败时必须 BLOCKED。
7. 不得把缺失目标写入 99PendingConfirmation 当作长期同步结果。
```

## Project-Type L4 Templates 校验

标准包必须提供项目类型化 L4 skeleton 模板：

```text
templates/business-domain-l4/backend-business-service.md
templates/business-domain-l4/admin-mixed-workflow.md
templates/business-domain-l4/frontend-application.md
templates/business-domain-l4/data-pipeline-etl.md
templates/business-domain-l4/library-shared-component.md
```

bootstrap confirmed mode 与 `sdlc-speckit-sync` create-if-missing 必须按 Project Type Profiles 选择模板：

```text
admin-mixed-workflow
data-pipeline-etl
frontend-application
library-shared-component
backend-business-service
```

检查点：

```text
1. backend-business-service L4 必须包含 Entry Chain、Transaction Boundary、Idempotency、Rollback And Compensation、Test Evidence。
2. admin-mixed-workflow L4 必须包含 Configuration Lifecycle、Approval / Audit、Import / Export、Read-Only Query Contract、Concurrency And Rollback。
3. frontend-application L4 必须包含 Route / Page / Component Surface、API And Backend Boundary、Popup / Interaction、State And Visibility、Visual Verification。
4. data-pipeline-etl L4 必须包含 Trigger And Runtime、Input Contract、Output Contract、SQL Lineage、Partition / Window / Checkpoint、Replay And Idempotency、Downstream Consumer Contract。
5. library-shared-component L4 必须包含 Public API、Consumer Scenario、Compatibility、Deprecation / Migration、Test Evidence。
6. `scripts/bootstrap-business-domain.sh --confirmed` 必须从 domain map 或 `.specify/project-governance-profile.yaml` 的 `project_type_profiles` 选择 L4 模板。
7. `sdlc-speckit-sync` create-if-missing 必须从 `specs/{feature}/route.md` 或 Pipeline Domain Route Summary 读取 Project Type Profiles，并记录 Selected L4 Template。
8. 通用 L4 skeleton 不得作为所有项目类型的唯一默认输出；只能在缺少 profile 时记录 conservative backend-business-service fallback。
9. 不得引入 legacy Skill 或 `.specify/memory/**`、`.specify/workflow/**`、`.specify/coding_guide/**` runtime dependency。
```

## Frontend Process Products 校验

新轨实现阶段必须有明确过程产物落点，不恢复旧版文件名作为兼容格式。

必须声明：

```text
specs/{feature}/implementation.md
specs/{feature}/workflow-status.md
specs/{feature}/debug-guide.md
specs/{feature}/observability.md
library/{requirement_id}/03-实现记录/{requirement_id}_实现记录.md
library/{requirement_id}/04-交付总结/{requirement_id}_交付总结.md
manifest is status authority
```

检查点：

```text
1. sdlc-speckit-implement 必须知道这些产物的输出边界、生成建议和 stop conditions。
2. sdlc-speckit-pipeline 的 Stage Timeline、Produced Or Reused Artifacts 和 Manifest Recommendation 必须包含过程产物。
3. sdlc-speckit-code-doc-reconcile 必须检查 implementation/workflow/debug/observability 与代码和 manifest 的 drift。
4. workflow-status.md 只能作为机器侧状态快照；manifest 是状态权威源。
5. 旧版文件名只能作为 Legacy Semantic Mapping Source Only 出现在说明中，不得作为 runtime input、output path 或兼容格式。
```

旧版语义映射来源：

```text
implementation-details.md
SDD_WORKFLOW_STATUS.md
API_DEBUG_GUIDE.md
QUICK_DEBUG_REFERENCE.md
LOGGING_IMPLEMENTATION.md
FINAL_SUMMARY.md
```

## Feature-Scoped Path Consistency 校验

当前 new-rail runtime 必须使用 feature-scoped Speckit 路径：

```text
specs/{feature}/route.md
specs/{feature}/spec.md
specs/{feature}/plan.md
specs/{feature}/tasks.md
```

检查点：

```text
1. runtime input、output、前置条件、阻断条件、校验规则不得把 specs/spec.md、specs/plan.md、specs/tasks.md 当作当前主路径。
2. 历史说明、legacy 对比说明或明确反例中可以出现 specs/spec.md、specs/plan.md、specs/tasks.md，但必须说明不是当前 runtime path / not current runtime path。
3. sdlc-speckit-implement 必须读取或继承 specs/{feature}/route.md 或 Analyze Gate route source。
4. Implement 不重新判断 Route Type。
5. Implement 不重新解释 Business Domain Targets。
6. Implement 只沿用 specs/{feature}/route.md、Analyze Gate 和 approved specs/{feature}/tasks.md 的边界执行。
7. 如果 implementation 发现 route 与代码实际边界冲突，必须停止并回到 Analyze / Domain Route / Re-Gate，不得自行改写 route。
8. Validator anchor: Implement does not reinterpret Route Type.
9. Validator anchor: Implement does not reinterpret Business Domain Targets.
10. Validator anchor: Implement executes only inside specs/{feature}/route.md, Analyze Gate, and approved `specs/{feature}/tasks.md` boundaries.
```

## Speckit specify 产品形状校验

`sdlc-speckit-specify` 生成或更新 `specs/{feature}/spec.md` 时，必须保留以下 legacy-critical sections：

```text
## Domain Route / Scope Baseline
## Requirement Type
## Business Domain Targets
## Entry Coverage Target
## Sync Targets
## Representative Data Simulation
## Edge Cases
## Functional Requirements
## Key Entities / Data Contracts
## Success Criteria
## Source Artifact Traceability
## Branch / Repository Boundary
```

检查点：

```text
1. Requirement Type 必须是 existing-change / new-flow / integration-change / data-change / unknown 之一。
2. Business Domain Targets 必须说明目标 L1/L2/L4 或 pending/blocking 原因。
3. Entry Coverage Target 必须来自 .specify/entry-coverage-profile.yaml 或明确说明缺失阻断。
4. Sync Targets 必须列出后续可沉淀的稳定事实，不能直接写入 business_domain。
5. Representative Data Simulation 至少覆盖 normal / empty / missing / exception 数据形态。
6. Source Artifact Traceability 必须能追溯到 01-技术方案、02-方案审核、manifest.md。
7. Branch / Repository Boundary 必须说明目标仓库、分支、模块和跨仓边界。
8. 如果任一章节需要编造事实，Specify 必须 blocked 并回到 DocFlow / Gate。
```

## Speckit route artifact 校验

`sdlc-speckit-pipeline` 在 Domain Route 阶段必须保留 Pipeline `Domain Route Summary`。当 feature id 已确定并进入 full SDD 时，必须物化：

```text
specs/{feature}/route.md
```

`route.md` 必须包含：

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

检查点：

```text
1. Route Type 必须是 existing-change / new-flow / integration-change / data-change / unknown 之一。
2. Route Type = unknown 时必须阻断进入 Specify，除非用户显式确认 route type、目标 business-domain 文档、entry coverage surface 和 risk owner。
3. Business Domain Targets 必须记录 L1 / L2 / L4、Target Status、Owner、Evidence。
4. Entry Coverage Surface 必须覆盖 backend entries、admin entries、frontend entries、ETL entries、library/shared-component entries，不能按单一后端入口模型退化。
5. Create-If-Missing Decision 必须记录 Target L1、Target L2、Target L4 Id、Owner、Authorization、Entry Coverage Status。
6. New-Rail Runtime Check 必须明确 Runtime child skills: sdlc-speckit-* only、Legacy Skill usage: none、Legacy document runtime input: none、Legacy document write target: none。
7. specs/{feature}/spec.md 必须引用 specs/{feature}/route.md；如果 route 尚未物化，则必须引用 Pipeline Domain Route Summary。
8. Plan / Analyze / Sync / Reconcile 必须把 route.md 或 Pipeline Domain Route Summary 作为统一输入边界，不能各自重新解释 route。
```

## Entry Coverage Profile Bootstrap 校验

PR F-0 的 `scripts/bootstrap-entry-coverage-profile.sh` 是限制性 Entry Coverage Profile Bootstrap。它只用于让目标项目安全获得 entry coverage audit 的最小 profile，不是全量 Speckit bootstrap。

支持两种执行方式：

```bash
Usage: scripts/bootstrap-entry-coverage-profile.sh [target-project-path] [options]

# 从标准包目录执行，显式传入目标项目路径
scripts/bootstrap-entry-coverage-profile.sh <target-project-path> --dry-run

# 从目标项目目录执行，未传 target-project-path 时默认使用 Dir.pwd
$AI_SDLC_STANDARD_HOME/scripts/bootstrap-entry-coverage-profile.sh --dry-run
```

如果当前目录看起来是 `ai-sdlc-standard` 标准包自身，例如同时存在 `manifest.yaml`、`ai-sdlc/`、`skills/`，且用户没有显式传入 `target-project-path`，脚本必须停止并提示显式传目标路径，避免误初始化标准包仓库。

允许写入的稳定路径只有：

```text
.specify/entry-coverage-profile.yaml
.specify/reports/entry_coverage_profile_bootstrap_report.md
```

当 `.specify/entry-coverage-profile.yaml` 已存在且未提供 `--force-entry-coverage-profile` 时，只能写候选文件：

```text
.specify/entry-coverage-profile.candidate.yaml
```

Restricted Write Boundary 必须禁止写入：

```text
.specify/business_domain/**
specs/**
library/**
.specify/memory/**
.specify/workflow/**
.specify/coding_guide/**
```

运行期隔离要求：

```text
1. 不调用 legacy `speckit-*` Skill。
2. 不读取 `.specify/memory/**`、`.specify/workflow/**`、`.specify/coding_guide/**` 作为 runtime 输入。
3. 不创建 filename-versioned artifact。
4. dry-run 只能预览 profile 和 `.specify/reports/entry_coverage_profile_bootstrap_report.md`。
```

`project_type_profiles` 来源优先级：

```text
1. .specify/project-governance-profile.yaml
2. 用户参数 --project-type-profile
3. 代码结构启发式检测
4. backend-business-service conservative candidate，并在 report 中标记 pending confirmation
```

生成的 `.specify/entry-coverage-profile.yaml` 必须包含：

```text
version
project_type_profiles
scope.source_roots
scope.include_file_patterns
scope.exclude_file_patterns
scope.document_scope
scope.report_dir
entry_types
layers.service
layers.manager
layers.persistence
```

项目类型 entry_types 检查：

```text
backend-business-service:
  controller / RPC / MQ / schedule / service / manager / mapper

admin-mixed-workflow:
  controller / data_console / worker / schedule / import / export / SPI / RPC

admin-mixed-workflow + backend-business-service:
  backend_controller / backend_RPC / backend_schedule / backend_service / backend_manager / backend_mapper
  admin_controller / admin_RPC / admin_schedule / admin_data_console / admin_worker / admin_import / admin_export / admin_SPI
  复合 profile 不得使用 name-only 去重吞掉 admin/backend 的同名 entry type 语义；至少必须按 [name, evidence_mode] 去重。

frontend-application:
  route / page / component / store / action / api_client / popup / native_shell

data-pipeline-etl:
  spark_job / flink_main / flink_process_function / connector / sink / publisher / sql

library-shared-component:
  public_api / consumer_scenario / adapter / extension_point
```

验收检查：

```text
1. 没有 profile 的目标项目，dry-run 能预览 profile。
2. 正式执行只写 entry coverage profile 和 bootstrap report。
3. 已有 profile 时默认不覆盖稳定路径。
4. 生成 profile 能被 scripts/audit-entry-coverage.rb 读取。
5. ruby scripts/validate-skill-contracts.rb 通过。
6. git diff --check 通过。
```

## Bootstrap Performance / Large Repo Scan Control 校验

PR G 要求 Speckit bootstrap 在大仓中可控、可限时、可采样、可解释。以下两个脚本都必须支持相同扫描控制参数：

```bash
scripts/bootstrap-speckit-project.sh <target-project-path> --dry-run --scan-root service-a --include-root web-a --scan-timeout 60 --max-samples 30
scripts/bootstrap-entry-coverage-profile.sh [target-project-path] --dry-run --scan-root service-a --include-root web-a --scan-timeout 60 --max-samples 30
```

扫描参数语义：

```text
--scan-root PATH
  只扫描指定 target-relative 路径，可重复传入多个。

--include-root PATH
  scan-root 的白名单别名，可与 --scan-root 合并使用。

--scan-timeout SECONDS
  限制扫描阶段耗时。超时后必须报告 timeout / partial scan，不能声称完整成功。

--max-samples N
  限制每类 evidence / file inventory samples 的输出数量，默认值必须保守。
```

dry-run 和正式 report 必须输出 scan summary：

```text
scan started at
scan ended at
scan duration seconds
scanned file count
sampled file count
skipped/excluded count
timeout occurred
partial scan
scan roots
include roots
effective scan roots
exclude patterns
max samples
scan timeout
```

timeout / partial scan 语义：

```text
1. Scan Status 必须是 COMPLETE 或 TIMEOUT / PARTIAL。
2. TIMEOUT / PARTIAL 时不得把 profile、context、source_roots、project_type_profiles 当作 confirmed fact。
3. 报告必须写明 Affected Outputs 和 Recommended Action。
4. project bootstrap 可以继续生成 conservative evidence scaffold，但必须降级为 pending confirmation / needs-user-confirmation-partial-scan。
5. entry coverage profile bootstrap 在 timeout 时默认写 candidate profile，除非显式 --force-entry-coverage-profile。
```

默认 exclude 目录必须覆盖：

```text
.git
target
build
dist
out
node_modules
vendor
coverage
generated
.idea
.gradle
.mvn
.venv
venv
Pods
ios/Pods
android/build
ios/build
fixtures / fixture / test-fixtures / test_fixtures / large-fixtures
__snapshots__ / snapshots / mock-data / mock_data
```

检查点：

```text
1. 两个 bootstrap 都必须先生成一次 bounded file inventory，后续 project type detection、source roots detection、entry profile evidence、report sample 复用 inventory。
2. inventory 至少能解释 relative path、file type / extension、matched include root、included / excluded reason；正式写入时只能落到允许的 .specify/reports/** 或 profile 摘要中。
3. RN native shell、Pods、android/build、ios/build 不得污染 source_roots。
4. pfms 这类大仓必须优先用 --scan-root 限定目标业务模块或服务目录；不知道模块名时不要硬编码，应由使用者选择目标目录。
5. entry coverage profile bootstrap 仍支持从目标目录直接执行：`$AI_SDLC_STANDARD_HOME/scripts/bootstrap-entry-coverage-profile.sh --dry-run --scan-root . --scan-timeout 60 --max-samples 30`。
6. dry-run 不得写 target repo。
7. 不读取或写入 legacy `.specify/memory/**`、`.specify/workflow/**`、`.specify/coding_guide/**`。
```

## Delta Change Routing / Supplement Requirement Path 校验

补充需求、规格遗漏、返工或反馈驱动变更不能按完整原需求重新判断 pipeline。

必须识别的输入：

```text
Requirement Supplement
Requirement Change
Rework
Specification Missing
Feedback-Driven Change
已实现后发现遗漏细节
开发过程中发现方案缺口
测试或 Review 暴露规格遗漏
```

同一 requirement_id 下必须区分：

```text
Parent Requirement ID
Intake Classification
Same Requirement Decision
Change Event Type
Aggregate Requirement Scope
Original Implemented / Approved Scope
Current Change Scope / Delta Scope
Out of Delta Scope
Affected Node
Required Re-Gate
Re-Gate Records
Decision Scope: FULL_REQUIREMENT / DELTA_CHANGE
```

路由规则：

```text
1. Aggregate Requirement Scope 只能作为上下文。
2. Development Path Decision for delta must use Current Change Scope.
3. 原需求复杂度触发因素只能作为 context，不能作为 delta route trigger。
4. package / pipeline route should not use aggregate scope for supplements。
5. 已实现后补充遗漏细节，应回到最早受影响节点 Re-Gate。
6. Delta Scope 简单/中等且方案审核通过后，可以 DIRECT_IMPLEMENTATION after delta Re-Gate。
7. Delta Scope 自身复杂时，才可以 SPECKIT_PIPELINE_REQUIRED。
8. SPECKIT_PIPELINE_REQUIRED only when delta itself is complex。
9. 缺少 Delta Scope 或影响范围不清时，必须 BLOCKED_NEEDS_REVISION。
10. 不得因为原需求是 COMPLEX 就自动要求本次补充走 pipeline。
```

人工语义验收：

```text
场景 A:
原需求很复杂且已经实现。用户说“少了一块细节，在原需求上补一下”。
期望 Same Requirement: yes；Decision Scope: DELTA_CHANGE；Aggregate triggers only context；
如果 delta 简单且方案审核通过，Development Path Decision = DIRECT_IMPLEMENTATION。

场景 B:
原需求已实现，补充内容本身新增 MQ consumer 或 DB schema。
期望 Same Requirement: yes；Decision Scope: DELTA_CHANGE；Delta Complexity = COMPLEX；
Development Path Decision = SPECKIT_PIPELINE_REQUIRED 或 BLOCKED_NEEDS_REVISION，理由来自 delta 本身。

场景 C:
补充内容影响行为但没有技术方案新版本。
期望 BLOCKED_NEEDS_REVISION；Earliest Affected Node = 01-技术方案。

场景 D:
补充内容业务目标已经独立。
期望 New Requirement Needed = yes，不把新需求 Gate 混入原 requirement_id。
```

## Analyze Gate Strengthening 校验

`sdlc-speckit-analyze` 必须把 route artifact、project_type_profiles、
entry coverage reports 和 process products 纳入实现前 Gate。

必需输入：

```text
specs/{feature}/route.md
specs/{feature}/spec.md
specs/{feature}/plan.md
specs/{feature}/tasks.md
.specify/entry-coverage-profile.yaml
.specify/reports/entry_coverage/entry_coverage_report.md
.specify/reports/entry_coverage/entry_inventory.tsv
.specify/reports/entry_coverage/service_inventory.tsv
.specify/reports/entry_coverage/cross_domain_conflicts.md
.specify/reports/entry_coverage/unarchived_entries.md
.specify/reports/entry_coverage/unarchived_services.md
```

缺 `.specify/entry-coverage-profile.yaml` 时 Analyze Gate Result 必须为 `FAIL`，
并记录 `BLOCKED` Blocking Item。
如果只有 `.specify/entry-coverage-profile.candidate.yaml`，Analyze Gate Result
必须为 `FAIL`，Required Action status 为 `PENDING_CONFIRMATION`，Required Action 指向：

```bash
$AI_SDLC_STANDARD_HOME/scripts/bootstrap-entry-coverage-profile.sh --dry-run
$AI_SDLC_STANDARD_HOME/scripts/bootstrap-entry-coverage-profile.sh
```

Analyze 不允许因为缺 profile 而跳过 entry coverage audit。

Analyze 必须解析 TSV 字段，不得 grep 整个 markdown 判断 blocker。必须读取：

```text
entry_inventory.tsv:
  classification
  classification_reason
  match_strength
  match_reason
  requirement_scope

service_inventory.tsv:
  reverse_coverage_status
```

不单独阻断的 classifications：

```text
technical_bridge
framework_bridge
generated_or_vendor
native_shell
abstract_or_base
annotation_or_marker
not_applicable
```

必须阻断：

```text
business_entry 未归档
core business unit 未归档
reverse_coverage_status=no_entry_reverse_coverage
未接受的 cross-domain conflict
business_domain L4 missing
```

shared/platform/scheduling/integration L2 重复命中只有在 `specs/{feature}/route.md`
或 `.specify/entry-coverage-profile.yaml` 明确 accepted shared boundary 时才能
降级为 warning。

项目类型检查：

```text
backend-business-service:
  entry -> service -> manager/repository/mapper coverage
  transaction boundary
  rollback path
  transaction / rollback / idempotency / compensation
  API/RPC/MQ/Schedule contract

admin-mixed-workflow:
  controller / worker / schedule / data-console / SPI / RPC
  config lifecycle
  approval/audit
  import/export
  read-only query contract
  concurrency/rollback

frontend-application:
  route/page/component/store/API/popup/navigation
  state and visibility
  backend/mock boundary
  visual verification
  implementation/debug/observability process products when applicable
  native shell technical bridge does not block unless business behavior is explicit

data-pipeline-etl:
  trigger/input/output
  SQL lineage
  partition/window/checkpoint
  replay/idempotency
  downstream consumer
  function/connector/sink coverage

library-shared-component:
  public API
  consumer scenario
  compatibility
  deprecation/migration
  test evidence
```

Analyze 输出必须包含：

```text
Project Type Profile Checks
Entry Coverage Gate
Parsed Entry Inventory Summary
Parsed Service Inventory Summary
Shared-Domain Duplication Decision
Blocking Items
Earliest Affected Node
Re-Gate Recommendation
Manifest Update Recommendation
Next Step
```

## Speckit plan companion artifacts 校验

`sdlc-speckit-plan` 必须生成或显式跳过：

```text
specs/{feature}/plan.md
specs/{feature}/research.md
specs/{feature}/data-model.md
specs/{feature}/contracts/
specs/{feature}/quickstart.md
```

跳过任一 companion artifact 必须记录：

```text
Artifact:
Skip Reason:
Risk:
Impact:
Accepted By:
Re-Gate Required:
```

检查点：

```text
1. plan.md 中必须列出 companion artifact 状态。
2. research.md 记录技术决策、替代方案、依赖约束和未决技术问题，或有完整 skip record。
3. data-model.md 记录实体、状态、持久化副作用、前端 state 或 ETL schema，或有完整 skip record。
4. contracts/ 不能在 API/RPC/MQ、前端 route/page/state/API、ETL input/output 变化时跳过。
5. quickstart.md 记录验证命令、环境、种子数据、代表性用例、回滚检查和预期观察，或有完整 skip record。
6. 缺 companion artifact 且无完整 skip record 时，Plan Gate 必须 BLOCKED。
```

## business_domain bootstrap 校验

对目标项目执行：

```bash
scripts/bootstrap-business-domain.sh <target-project-path> --dry-run
```

检查点：

```text
1. 是否预览 00BusinessLandscape.md。
2. 是否预览 00UbiquitousLanguage.md。
3. 是否预览 01DomainCatalog.md。
4. 是否预览 99PendingConfirmation/01CodeEvidence/** 骨架。
5. 是否预览 business_domain_bootstrap_report.md。
6. 已有 business_domain 文件是否写 .candidate，而不是覆盖。
7. 是否不会读取旧版 .specify/memory、workflow、coding_guide。
8. 是否不会生成 specs/**。
```

### confirmed-domain bootstrap 校验

当 `.specify/business-domain-bootstrap.yaml` 含有用户确认的 `confirmed_domains` 时，执行：

```bash
scripts/bootstrap-business-domain.sh <target-project-path> --confirmed --dry-run
```

或：

```bash
scripts/bootstrap-business-domain.sh <target-project-path> --domain-map .specify/business-domain-bootstrap.yaml --dry-run
```

检查点：

```text
1. 缺少 confirmed_domains 时必须失败，不得退化为猜测生成真实 L1/L2/L4。
2. confirmed_domains 非空时，预览 00BusinessLandscape.md、00UbiquitousLanguage.md、01DomainCatalog.md。
3. 预览 .specify/business_domain/{L1}/{L2}/{L2MainDocument}.md。
4. 预览 .specify/business_domain/{L1}/{L2}/{L4Document}.md。
5. 预览 .specify/business_domain/{L1}/{L2}/{EntryCoverageDocument}.md。
6. 生成 report 时必须标记 Mode 为 confirmed，并记录 Domain Map。
7. 已有文件默认写 .candidate，只有显式 --force 才覆盖。
8. 不得读取 `.specify/memory/**`、`.specify/workflow/**`、`.specify/coding_guide/**` 作为 domain map。
```

## 真实项目试跑检查项

### 投放层检查

```text
1. 旧版 .specify/memory/** 未被修改。
2. 旧版 .specify/workflow/** 未被修改。
3. 旧版 .specify/coding_guide/** 未被修改。
4. 旧版 Skill 未被覆盖。
5. 新 project-context 文件来自目标代码扫描和占位确认，不复制旧版文档内容。
6. generation report 能说明代码证据、project type semantic profile hint、旧版 runtime action 和待确认事实。
```

### Direct Implementation 流程检查

```text
1. 00-需求资料 是否保留来源信息。
2. 01-技术方案 是否符合 ESS 必填章节。
3. 02-方案审核 是否输出 PASS / FAIL / PASS_WITH_RISK。
4. 方案审核是否输出 DIRECT_IMPLEMENTATION / SPECKIT_PIPELINE_REQUIRED / BLOCKED_NEEDS_REVISION。
5. 实现阶段是否没有补造未定义业务规则。
6. Code Review 是否能归一为标准问题类型。
7. 测试反馈是否能分类并反向沉淀。
```

### Speckit Pipeline 检查

```text
1. Pipeline 是否只在方案审核通过后启动。
2. 用户 full SDD 是否没有绕过 01-技术方案 / 02-方案审核。
3. specify 是否复用已审阅 DocFlow 产物。
4. clarify 是否只处理残留问题。
5. plan/tasks 是否没有改变业务行为。
6. implement 是否按 approved tasks 执行。
7. sync 是否只沉淀稳定事实。
8. reconcile 是否能发现 drift。
9. Clarify 之前是否按节点询问是否进入下一节点。
10. Clarify 之后是否按 Plan -> Tasks -> Analyze -> Implement -> Sync -> Reconcile 连续执行，不再询问是否进入下一节点。
11. 是否输出 New-Rail Runtime Check 和 Domain Route Summary。
12. 运行期是否没有调用 legacy `speckit-*` Skill，也没有读取或写入 `.specify/memory/**`、`.specify/workflow/**`、`.specify/coding_guide/**`。
```

## 当前校验能力边界

当前自动校验脚本不能证明：

```text
1. 每个 Skill 在真实需求中输出一定正确。
2. business_domain 生成一定准确。
3. ProjectWorkflowGuide、ProjectDocumentationGuide 或 ProjectCodingGuide 中 detected evidence 已经是权威规则。
4. 方案审核一定发现所有业务风险。
5. 测试反馈沉淀一定能自动改进 Checklist。
```

这些必须通过真实项目样例持续验证。

## 推荐校验顺序

```text
1. ruby scripts/validate-skill-contracts.rb
2. scripts/init-standard-home.sh --dry-run
3. scripts/bootstrap-speckit-project.sh <target> --dry-run
4. 人工检查 generation report / project-context / project type semantic profile
5. 测试仓库正式 bootstrap
6. Direct Implementation 小需求闭环
7. Complex Speckit pipeline 闭环
```

## Fixture-Based Product Parity Validator 校验

### 概述

`validate-product-parity-fixtures.rb` 是标准包开发期回归校验器。它使用最小 synthetic fixtures 验证 New-Rail Enhanced Speckit Pipeline 的关键产品语义，防止后续修改破坏已完成能力。

关键约束：

- fixtures 是标准包开发期回归，不是目标项目 runtime 输入（not target project runtime input）。
- 不复制真实项目代码或业务文档。
- validator 不访问真实业务仓库。
- validator 覆盖 route artifact、project-type L4、frontend process products、entry coverage analyze、bootstrap scan control、delta change routing。

### 执行命令

```bash
ruby scripts/validate-product-parity-fixtures.rb
```

### 与 validate-skill-contracts.rb 的关系

| 校验器 | 检查范围 |
| --- | --- |
| `scripts/validate-skill-contracts.rb` | 标准文件和规则锚点是否存在、是否一致 |
| `scripts/validate-product-parity-fixtures.rb` | 跨 PR 语义组合是否仍然成立（development-time fixture） |

`validate-skill-contracts.rb` 检查 contract YAML、manifest 登记、路径一致性、legacy source 红线等。
`validate-product-parity-fixtures.rb` 检查 fixture 目录下的 `fixture.yaml` + `expected.md`，验证 required_standard_files 存在、required_terms 在标准文件中能找到、forbidden_terms 不会作为 runtime dependency 出现。

### Fixture 覆盖

| Fixture 目录 | 产品语义覆盖 |
| --- | --- |
| `backend-business-service/` | Project-type L4: entry→service→manager/mapper chain, transaction, rollback, idempotency, compensation |
| `admin-mixed-workflow/` | Project-type L4: controller/worker/schedule/data-console/SPI/RPC, config lifecycle, approval/audit |
| `frontend-application/` | Project-type L4 + frontend process products: route/page/component/store/API, implementation/debug/observability |
| `data-pipeline-etl/` | Project-type L4: spark/flink entry, SQL lineage, replay/idempotency, connector/sink |
| `library-shared-component/` | Project-type L4: public API, consumer scenario, compatibility, deprecation |
| `route-artifact/` | Route artifact: route type, business domain targets, entry coverage, create-if-missing |
| `entry-coverage-analyze/` | Entry coverage precision + Analyze Gate: TSV parsing, classification, technical bridge, reverse coverage |
| `bootstrap-scan-control/` | Bootstrap performance: --scan-root, --scan-timeout, structured inventory, timeout/partial |
| `delta-change-supplement/` | Delta change routing: Requirement Supplement, Specification Missing, Decision Scope, aggregate vs delta |
| `project-type-contract-matrix/` | Plan contract matrix: companion artifact status table, project-type contract granularity, BLOCKED on missing contracts |

## Project-Type Contract Matrix 校验

Plan 阶段必须按 `project_type_profiles` 输出 contract artifact matrix。Plan Gate 对缺少 companion / contract artifact 且无完整 skip record 的情况必须 BLOCKED。

### Companion Artifact Status Table

Plan 输出必须包含 companion artifact status table:

| Artifact | Status | Path | Skip Reason | Risk | Impact | Accepted By | Re-Gate Required |
| --- | --- | --- | --- | --- | --- | --- | --- |

Status 必须是 `Produced` / `Reused` / `Not Applicable` / `Deferred` 之一。

### Contract Matrix 覆盖

按项目类型定义的 contract matrix（`skills/sdlc-speckit-plan/references/project-type-contract-matrix.md`）:

- **backend-business-service**: API, RPC, MQ, Schedule, DB migration, failure/rollback/idempotency
- **admin-mixed-workflow**: config lifecycle, approval/audit, import/export, read-only query, concurrency/rollback, operator permission
- **frontend-application**: route/page, component/state/store, API client, backend/mock boundary, popup/dialog, visual verification
- **data-pipeline-etl**: trigger, input, output, SQL lineage, partition/window/checkpoint, replay/idempotency, downstream consumer
- **library-shared-component**: public API, consumer scenario, compatibility, deprecation/migration, representative test

### Skip Record

缺少 artifact 时必须包含完整 skip record:

- Artifact
- Project Type Profile
- Skip Reason
- Risk
- Impact
- Accepted By
- Re-Gate Required

### BLOCKED Conditions

- `project_type_profiles` 未知或未识别
- Companion artifact 缺失且无完整 skip record（含 Project Type Profile、Contract Type、Skip Reason、Risk、Impact、Accepted By、Re-Gate Required、Verification Alternative）
- `contracts/` 被跳过但 feature 改变了 contract matrix 中列出的 contract surface
- `Deferred` artifact 无 accepted risk 或无 Re-Gate Required → Plan Gate BLOCKED
- `Deferred` without `Accepted By` → Plan Gate BLOCKED
- Skip Reason 空泛（如 "not needed"）→ Plan Gate BLOCKED

## Rail Routing And Business-Domain Sync 校验

### Rail Routing

- `AGENTS.md` 中 `/speckit.*` 和 `$speckit-*` 仍然走 legacy Speckit rail。
- `sdlc-*`、`sdlc-speckit-*`、`new rail`、`AI SDLC 标准库` 明确进入 new rail。
- 未明确 rail 且涉及 `.specify/business_domain/` 写入时，必须先询问用户。
- New-Rail 不读取/写入 `.specify/memory/**`、`.specify/workflow/**`、`.specify/coding_guide/**`。
- AGENTS.md 不应被自动覆盖，只能生成 addendum 建议。

### Specs Run Lifecycle

- `specs/` 是 run-level artifact，不是 requirement-level artifact。
- 一套 specs 内 rail 必须一致。
- 同一 `requirement_id` 可以有多套 specs（不同 rail、不同迭代）。
- specs 完成 business_domain sync 后可 archive / cleanup。

### Shared Business-Domain Governance

- `.specify/business_domain/` 是 legacy 和 new-rail 共同治理的长期知识库。
- 写入前必须解析 L1/L2/L4。
- 文件命名遵守项目当前 business_domain 命名方式。
- 目标 L4 已存在时，必须 update existing document，不得创建同义重复 L4。
- 每次写入必须记录 rail/source 和 revision record。

### Sync Source Modes

三种 sync source mode：`speckit_driven`、`library_driven`、`hybrid`。

- **speckit_driven sync**: pipeline Sync/Reconcile 后为 authoritative path。
- **library_driven sync**: 不要求 `specs/{feature}/**` 存在。无实现/验证证据时只输出 proposal。
- **hybrid**: 以 manifest freshness 和 pipeline status 决定 source priority。
- 同一事实不允许被两种 mode 重复写入（duplicate sync guard）。

### Library-Driven Sync Validation

- library-driven sync 可以在没有 specs 时运行。
- 最小 readiness：requirement_id 明确、`01-技术方案` 存在、审核通过、实现证据存在、验证证据存在、target 可解析。
- 无实现/验证证据 → 只能 proposal。
- Simple requirement 无 pipeline → library-driven sync evaluation 仍是必选检查项。

### Duplicate Sync Guard

- manifest 记录 `business_domain_sync` 状态。
- `pipeline_sync_executed=true` + `result=synced` → library sync 默认 blocked。
- `library_sync_executed=true` → pipeline sync 必须读 manifest，避免重复写作。

## Business-Domain Naming and Project Shape 校验

### Naming Gate

- business_domain 文档命名必须遵守项目当前 canonical naming convention。
- 常见模式：`{L4_ID}{L4_NAME_EN}({L4_NAME_CN}).md`、`{L4_ID}EntryCoverage({CN}入口覆盖对账).md` 等。
- naming pattern 来源：sibling L4、01DomainCatalog.md、L2 index、governance profile、user confirmation。
- naming pattern 未知 → proposal only，不得直接写。
- create-if-missing 使用 project canonical naming，不使用标准库默认命名。

### Project Shape Gate

- document shape 是项目级不变量（标题格式、Metadata 字段、章节语言、表格结构、修订记录）。
- Target L4 exists → preserve existing shape。不得整体重写为 New-Rail 模板。
- Target L4 missing → 从同 L2 sibling L4 推断 project shape。
- shape confidence：high / medium → 可直接 create-if-missing；low → 需用户确认；unknown → block/proposal。
- 标准库 `templates/business-domain-l4/*.md` 只能作为 new project / no-shape fallback，不得覆盖已有项目 shape。

### Create-If-Missing 规则

- 需要单独授权（不等于 generic write authorization）。
- 使用 project canonical naming + project shape。
- 记录：rail/source_artifacts/naming_pattern_source/shape_profile_source/shape_confidence。
- 必须更新 L2 index + 01DomainCatalog.md + revision record。
- 不得创建同义重复 L4。

### Whole-Document Rewrite 禁止（whole-document rewrite forbidden）

- Update existing → compatible section update，不得整体重写。
- 保留 title format、existing section names、table styles、revision history format。
- 不得为适配 New-Rail 模板新增大段不符合项目 shape 的英文固定章节。

### Library-Driven Inputs Cleanup

- library_driven required inputs 从强制 00/01/02/03/04/05 全部存在改为 readiness gate：
  - 01 + 02 必须存在。
  - 实现证据可来自 03、implementation result、或 code diff。
  - 验证证据可来自 05、04、test result、或 accepted review。
  - Incomplete evidence 只能产生 proposal/not_required/blocked，不能直接 confirmed write。

## PR K Cleanup Validation

- PR K cleanup validates stale template-primary create-if-missing rules are removed.
- PR K cleanup validates `library_driven` reconcile does not require specs.
- PR K cleanup validates standard L4 templates are fallback-only, not create-if-missing primary path.
- `templates/business-domain-l4/` loaded only when standard template fallback is explicitly active.
- Library-driven reconcile in `library_driven` mode: missing specs is expected and must not block.
- Cleanup 2 validates sync SKILL workflow no longer routes create-if-missing through template-primary path.
- Cleanup 2 validates reconcile contract has mode-specific required inputs (speckit_driven / library_driven / hybrid).
- Cleanup 2 validates validator catches workflow-level stale template-primary rules.
- Global Cleanup 1 validates sdlc-speckit-sync mode-specific input contract.
- Global Cleanup 1 validates library_driven sync does not require specs.
- Global Cleanup 1 validates missing specs only blocks speckit_driven or hybrid current source-of-truth.
- Global Cleanup 1 validates target project workflow/coding_guide redline.
- Global Cleanup 2 validates sync description includes library-driven / Direct Implementation.
- Global Cleanup 2 validates sync contract responsibilities are mode-aware.
- Global Cleanup 2 validates shared business-domain target resolution supports library artifacts / manifest.
- Global Cleanup 2 validates Source Priority by Mode is authoritative.
- Global Cleanup 2.1 validates sdlc-speckit-sync frontmatter description indentation and removes residual L4 skeleton wording.

## PR L: Compatible Update and Conflict Proposal 校验

- compatible update validation: existing L4 update preserves shape, facts, and uses safe insertion point.
- update proposal validation: unknown insertion point → proposal, not direct write.
- reconcile proposal validation: fact conflict → reconcile proposal with conflict type classification.
- no whole-document rewrite validation: existing L4 must not be fully replaced.
- no forced New-Rail section injection validation: fixed English sections must not be injected into legacy-shaped L4 by default.
- conflict classification validation: semantic_conflict, code_drift, doc_drift, stale_fact, scope_conflict, duplicate_fact, source_priority_conflict.
- revision/source traceability validation: every update records rail, sync_source_mode, source_artifacts, update_section, evidence.
- implementation/verification evidence validation: no direct update without evidence.
- PR L cleanup validates conflict-and-blocking no longer treats Project Type Profiles / selected L4 template as create-if-missing primary blockers.
- PR L cleanup validates compatible update required files and terms.
- PR L cleanup validates no whole-document rewrite / no forced section injection / no overwrite conflict / no chat source-of-truth guards.

## PR M: Specs Run Lifecycle Metadata and Archive/Cleanup 校验

- specs_run_id / requirement_id / feature_id metadata validation
- manifest lifecycle authority validation (workflow-status.md is snapshot only)
- rail consistency within run validation
- archive gate validation: lifecycle business_domain_synced or superseded, BD sync synced/not_required, not active
- cleanup gate validation: archived/superseded, manifest traceability, owner confirmation
- library_driven no-specs validation: no archive/cleanup required when specs never existed
- no deletion of library/{requirement_id}/** or .specify/business_domain/** validation
- lifecycle/result consistency validation: business_domain_synced only with synced/not_required

## PR N: Library-Driven Sync Runtime Hardening 校验

- library_driven runtime readiness validation
- no specs required validation (specs, specs_run_id not required)
- implementation/verification evidence validation (no direct write without both)
- sync need classification validation (SYNC_REQUIRED/NOT_REQUIRED/PROPOSAL_REQUIRED/BLOCKED/DUPLICATE_SYNC_BLOCKED)
- duplicate sync guard validation (pipeline_sync_executed + result=synced blocks library_driven)
- supplemental sync validation (only when explicitly authorized, no duplicate facts)
- manifest business_domain_sync library_driven validation (source_of_truth, stable_fact_candidates, synced targets)
- PR N cleanup validates sync-inputs references library-driven-sync-runtime.
- PR N cleanup validates output-and-manifest records library_driven business_domain_sync.
- PR N cleanup validates PR N required files/terms and forbidden behavior.
- PR N cleanup validates duplicate sync guard before direct write.
- no filename-versioned artifacts validation
- Plan 用 contract artifact 反补未审阅业务规则 → Plan Gate BLOCKED

### 关键术语

- Companion Artifact Status
- Project-Type Contract Matrix
- Contract Skip Records
- `specs/{feature}/research.md`
- `specs/{feature}/data-model.md`
- `specs/{feature}/contracts/`
- `specs/{feature}/quickstart.md`
- Produced / Reused / Not Applicable / Deferred
- Verification Alternative
- Deferred without Accepted By
- Plan Gate BLOCKED
