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
| 纯后端业务服务，如 `logistics-center` | `backend-business-service` | `controller`、`rpc_provider`、`message_listener`、`scheduled_job`，不得因为普通 `package.json` 或静态资源误判为前端。 |
| 后端管理/配置混合系统，如 `pfms` | `admin-mixed-workflow` + `backend-business-service` | `controller`、`worker`、`scheduled_job`、`mcq_consumer`、`oas_event`、`data_console`、`spi`、`rpc_provider`。 |
| React Native / 纯前端应用，如 `pfms-rn` | `frontend-application` | `route`、`page`、`component`、`store_action`、`api_client`、`popup`、`navigation_guard`；Android/iOS native shell 不应触发 Java backend 风格入口。 |
| Spark/Flink/ETL 计算项目，如 `tms-flink-finance` | `data-pipeline-etl` | `spark_job`、`spark_online_etl`、`flink_main`、`flink_process_function`、`mcq_connector`，不应退化成普通 Controller/Service 覆盖模型。 |
| 传统 Java Web 混合项目，如 `wms-monitor` | `frontend-application` + `backend-business-service` | 同时生成 Controller/RPC/MQ/Schedule 入口和 JSP/page/component/API/popup/navigation 等 webapp 入口。 |

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
library/{requirement_id}/03-实现记录/{requirement_id}__实现记录.md
library/{requirement_id}/04-交付总结/{requirement_id}__交付总结.md
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
