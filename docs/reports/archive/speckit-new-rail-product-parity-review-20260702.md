# Speckit 新轨产物语义等价三次评估

> **日期**: 2026-07-02  
> **状态**: 临时 Review 结果，不提交  
> **范围**: 基于 PR A 当前工作区改动，复检新版 `sdlc-*` Skill、共享标准文档、bootstrap 脚本和可能生成的新私有文档，能否复现旧版 Speckit 的 `specs/**` 与 `.specify/business_domain/**` 产物语义。  
> **样例仓库**: `logistics-center`、`pfms`、`pfms-rn`、`tms-flink-finance`  

## 1. 本次结论

PR A 后，最大变化是 `sdlc-speckit-pipeline` 从“包含 Domain Route 的新 Skill”推进成了更明确的 **New-Rail Enhanced Speckit Pipeline**：

- runtime 只允许 `sdlc-speckit-*` 子 Skill；
- legacy Skill 和 legacy 文档只作为标准包开发期 fixture；
- bootstrap 新增 `ProjectWorkflowGuide.md` 与 `ProjectDocumentationGuide.md`；
- profile/template 注册 `workflow_guides` 与 `documentation_guides`；
- pipeline 输出新增 `New-Rail Runtime Check` 与 `Domain Route Summary`；
- Clarify 前按节点询问，Clarify 后连续执行 Plan -> Tasks -> Analyze -> Implement -> Sync -> Reconcile。

因此，本次修改后与旧版产物语义的差距明显缩小。整体判断：

| 维度 | 上次粗略等价度 | 本次粗略等价度 | 判断 |
| --- | ---: | ---: | --- |
| 后端业务服务 `specs/**` | 80% - 85% | 86% - 90% | 主要结构已能复现，剩余在 entry audit 精度和 Domain Route 产物化。 |
| 后端业务服务 `business_domain/**` | 75% - 80% | 82% - 86% | Sync/create-if-missing 与 EntryCoverage 主线接近，L4 内容模板还需项目类型化。 |
| 管理后台混合项目 | 70% - 75% | 78% - 82% | 标准语义已覆盖 admin mixed，但 `pfms` 全量 dry-run 性能需解决。 |
| 纯前端 / RN 项目 | 60% - 65% | 70% - 75% | profile 和合同已覆盖前端入口，仍缺旧版特殊状态/实现细节产物。 |
| ETL / 数据管道项目 | 80% 左右 | 84% - 88% | ETL profile、contracts、Sync 基本接近，Analyze/EntryCoverage 仍需更强约束。 |
| Pipeline 主控等价 | 65% - 70% | 80% - 85% | PR A 已补主控身份、红线、私有上下文和 Clarify 边界；还差 Route artifact schema。 |

一句话结论：

> 现在如果在后端或 ETL 项目执行 bootstrap 再用新版 pipeline 开发需求，已经大概率能生成与旧版 Skill 语义接近的 `specs/**` 和 `.specify/business_domain/**` 产物；但还不能说“完美复现”。当前剩余差距主要在 route 阶段独立产物、前端特殊产物、business_domain 项目类型化模板、entry coverage 精度和大仓扫描性能。

## 2. 本次读取与验证范围

### 2.1 规模

| 仓库 | specs 文件 | business_domain 文件 | legacy 治理文档 |
| --- | ---: | ---: | ---: |
| `logistics-center` | 88 | 25 | 14 |
| `pfms` | 58 | 41 | 14 |
| `pfms-rn` | 57 | 30 | 25 |
| `tms-flink-finance` | 117 | 40 | 14 |
| 合计 | 320 | 136 | 67 |

### 2.2 bootstrap dry-run 结果

| 仓库 | 本次 dry-run 结论 |
| --- | --- |
| `logistics-center` | 成功；识别 `primary_language=java`、`application_type=backend`、`backend-business-service`；预览 `ProjectWorkflowGuide.md` 与 `ProjectDocumentationGuide.md`；检测 RPC 19、Message Listener 86、Schedule 43。 |
| `pfms-rn` | 成功；识别 `primary_language=typescript`、`application_type=frontend`、`frontend-application`；预览两份新 project-context；仍有 Android native listener 噪声。 |
| `tms-flink-finance` | 成功；识别 `primary_language=java`、`application_type=batch`、`data-pipeline-etl`；预览两份新 project-context；检测 Schedule/Job 36、Service 16、Persistence 11。 |
| `pfms` | 全量 dry-run 超过两分钟未返回，已中止。通过 specs、business_domain、entry_coverage report 与源码信号确认其语义属于 `admin-mixed-workflow + backend-business-service`；扫描性能需要作为后续问题处理。 |

## 3. 已经补上的关键差距

### 3.1 Pipeline 主控身份

旧版 `$speckit-pipeline-confirmed-single` 是完整串行控制器，明确 `Preflight -> Domain Route -> Specify -> Clarify -> Plan -> Tasks -> Analyze -> Implement -> Sync -> Reconcile`。

PR A 后，新版 `sdlc-speckit-pipeline` 已明确：

- 是 New-Rail Enhanced Speckit Pipeline；
- 不是 legacy wrapper；
- runtime 不调用旧版 Skill；
- runtime 不读取 `.specify/memory/**`、`.specify/workflow/**`、`.specify/coding_guide/**`；
- 输出必须包含 `New-Rail Runtime Check` 与 `Domain Route Summary`。

这解决了上次评估中“pipeline 主控等价不足”的最大问题。

### 3.2 新项目私有上下文

旧版 workflow / documentation / coding 语义原来混在 legacy 文档里。PR A 后 bootstrap 会生成：

- `ProjectWorkflowGuide.md`: 本地 workflow、确认策略、分支、发布、验证、回滚规则。
- `ProjectDocumentationGuide.md`: business_domain、L4、EntryCoverage、文档索引和文档形态规则。
- `ProjectCodingGuide.md`
- `RepositoryStructure.md`
- `ProjectGovernanceOverrides.md`

这使新版 Skill 在完全隔离 legacy 文档的前提下，有地方承接旧版私有语义。

### 3.3 Clarify 边界策略

旧版是每阶段都问是否继续。用户本次明确要求：

- Clarify 前节点都询问是否进入下一个节点；
- Clarify 后节点按顺序依次执行，不再询问。

PR A 已把这个策略写进：

- pipeline Skill 主文档；
- `new-rail-enhanced-pipeline.md`；
- `stage-sequence.md`；
- `side-effect-boundaries.md`；
- skill contract；
- bootstrap 生成的 `ProjectWorkflowGuide.md`。

这部分已经和用户最新流程预期一致。

## 4. 样例仓库复检

### 4.1 `logistics-center`

旧版语义重点：

- SDDWorkflow 要求 Domain Route 先读 landscape / glossary / L2，枚举 `rpc/process/schedule/mcq/service` 入口。
- Analyze 要覆盖 `Service + Manager + Process/Schedule/MQ`，并反查核心 `ServiceImpl` 是否被已归档入口命中。
- business_domain L4 如 `020103AllotInOutAndQuery` 沉淀流程边界、Pool 口径、有效查询口径和验证口径。
- EntryCoverage 文档有入口清单、方法级协同覆盖、ServiceImpl 覆盖。

新版覆盖情况：

- bootstrap dry-run 正确识别 backend；
- `speckit-project-type-profiles.md` 已覆盖 RPC/MQ/Schedule/Service 链路、reverse service coverage、strict blockers；
- `sdlc-speckit-specify` 已强制 Domain Route / Entry Coverage Target / Representative Data Simulation；
- `sdlc-speckit-sync` 已强制 business_domain target、create-if-missing、entry coverage audit。

剩余差距：

- `Domain Route Summary` 目前是报告结构，不是独立 `route.md` 或可复用 route artifact；
- audit runner 对 annotation/base/abstract processor 的 technical bridge 判断还不够精细。

### 4.2 `pfms`

旧版语义重点：

- `pfms` 是 admin mixed + backend：controller、data-console、worker/schedule、processor、import/export、审批/审核、RPC/API 同时存在。
- L4 如 `020305LeaderAttendanceRatioConfig` 包含入口与主链路、稳定业务规则、导入导出、日志审计、ETL 只读查询契约、并发与回滚、代码证据索引。
- EntryCoverage 如 `020399EntryCoverage` 以 controller -> Service -> Manager -> Mapper 矩阵表达覆盖。

新版覆盖情况：

- 标准 profile 已定义 `admin-mixed-workflow`；
- Plan contract 已覆盖 audit/approval/import/export/month-copy、worker/schedule/config/write path；
- pfms 仓库已存在 `.specify/reports/entry_coverage/**`，新版 runner 的目标产物形态与旧版 strict gate 接近。

剩余差距：

- `pfms` dry-run 性能未达标，说明 bootstrap 扫描需要 timeout / exclude / sampling 优化；
- admin mixed 的 business_domain L4 模板还不够强，尚未把“配置生命周期、导入导出、日志审计、只读 ETL 查询、并发回滚”做成默认必填结构。

### 4.3 `pfms-rn`

旧版语义重点：

- specs 有 `clarification.md`、`implementation-details.md`、`SDD_WORKFLOW_STATUS.md` 等过程/状态产物。
- L4 标准包括 APIContract、BusinessSpecification、PopupsSpecification。
- `060201AccuracyCheck` L4 以移动端用户流程为中心：最新任务概览、任务失效、线路确认、异常包裹扫描、当前异常记录、后端支撑契约、状态一致性。

新版覆盖情况：

- bootstrap dry-run 正确识别 frontend；
- frontend profile 覆盖 route/page/view/component/store-action/api-client/popup/navigation-guard；
- specify/plan 已要求 route/page/component/store/API mapping、popup trigger、visibility rule、backend/mock boundary、visual verification note、dependency pre-check。

剩余差距：

- `implementation-details.md` 没有新轨等价产物或明确映射；
- `SDD_WORKFLOW_STATUS.md` 没有新轨等价产物或 manifest/status 映射；
- frontend L4 的 Arch/API/Spec/Popups 子文档拆分还只是 profile 语义，不是 bootstrap 或 sync 的强模板；
- native shell 噪声仍会进入 code evidence，需要 profile 下默认弱化。

### 4.4 `tms-flink-finance`

旧版语义重点：

- specs 明确 Representative Data Simulation、Hive 表契约、MQ/PFMS 消费、生产发送门禁、空数据安全、缺价跳过。
- L4 `030501FreshPorkInspectionSalaryOnlineFlow` 记录 Job/ETL、日期窗口、查仓、单价预加载、工作量/工时查询、薪资计算、落库/MQ、PFMS handler。
- EntryCoverage 覆盖 spark_job、spark_online_etl、flink_main、flink_process、mcq_consumer，并反查核心处理单元。
- SparkFlinkCodingGuide 强制 ETL + connector + service + calculator + repository + mqPublisher 分层。

新版覆盖情况：

- bootstrap dry-run 正确识别 data-pipeline-etl；
- project type profile 覆盖 job/ETL/function/connector/SQL/sink；
- specify/plan 已要求 input/output、SQL/data lineage、partition/window/checkpoint、rerun/replay/idempotency、downstream consumer；
- sync 已覆盖 ETL entry coverage fact 的稳定沉淀。

剩余差距：

- ETL L4 模板仍不够强，缺少 trigger/input/output/partition/window/failure/replay/downstream consumer 的默认结构；
- Analyze 还需要对分区覆盖、重跑幂等、生产发送门禁、SQL lineage 做更硬的 gate；
- audit runner 对 Flink Function、Connector、Sink 和 technical bridge 需要实测打磨。

## 5. 当前还能不能生成旧版一样的产物

分场景判断：

| 场景 | 当前是否可用 | 风险 |
| --- | --- | --- |
| 后端业务服务 specs | 基本可用 | 需要 agent 严格执行 Domain Route Summary，否则 route 仍可能写得松。 |
| 后端 business_domain sync | 基本可用 | L4 内容质量依赖现有 business_domain 和人工确认；audit technical bridge 噪声需处理。 |
| admin mixed specs | 可用但需复验 | profile 语义够，但大仓扫描性能和 admin L4 模板不足。 |
| admin mixed business_domain | 部分可用 | 配置生命周期、审批、导入导出、日志审计等需要更明确模板。 |
| frontend specs | 可用但不完整 | spec/plan/tasks 可生成；implementation-details/status/视觉反馈产物缺口明显。 |
| frontend business_domain | 部分可用 | route/page/API/popup 语义有，Arch/API/Spec/Popups 子文档形态还未产品化。 |
| ETL specs | 基本可用 | contracts 已覆盖主要语义。 |
| ETL business_domain | 基本可用但需增强 | L4 模板与 Analyze gate 还要强化。 |

总体差距从上次约 **30%** 缩小到约 **15% - 20%**。后端和 ETL 差距更小，前端和 admin mixed 仍是主要缺口。

## 6. 建议下一步

优先级从高到低：

1. **PR B: Route Artifact Schema**
   - 为 pipeline 增加标准 `Domain Route Summary` schema 或 `route.md` 产品形状。
   - 字段至少包含 Route Type、L1/L2/L4、Read Set、Entry Coverage Surface、Sync Targets、create-if-missing 决策、unresolved questions、New-Rail Runtime Check。

2. **PR C: Project-Type L4 Templates**
   - 增强 business-domain bootstrap / sync skeleton。
   - backend/admin/frontend/ETL 分别提供 L4 默认章节。
   - 尤其补 admin config lifecycle、frontend Arch/API/Spec/Popups、ETL trigger/input/output/lineage/replay。

3. **PR D: Frontend Process Products**
   - 明确 `implementation-details.md` 与 `SDD_WORKFLOW_STATUS.md` 的新轨等价位置。
   - 建议映射到 `library/{requirement_id}/03-实现记录/`、manifest status、或 `specs/{feature}/implementation.md`，但必须标准化。

4. **PR E: Entry Coverage Precision**
   - 增强 technical bridge 分类。
   - 排除 annotation/base/abstract/native shell/Pods 噪声。
   - 增强 Service/Manager/Mapper 矩阵与 ETL core unit reverse coverage。

5. **PR F: Bootstrap Performance**
   - 为大仓如 `pfms` 增加扫描 timeout、默认 exclude、最大样本数、可配置 root。
   - dry-run 必须能在可接受时间内返回 profile 判断。

## 7. 最终判断

PR A 是有效的：它补上了 pipeline 主控隔离、项目私有 workflow/documentation 承接点、Clarify 边界策略和 validator 红线，确实把新版向旧版产物语义等价推进了一大步。

但“完美复现旧版 Skill 所有产物语义”还没完成。当前可以认为：

- **后端 / ETL**: 已接近可实战闭环；
- **admin mixed**: 语义已具备，工程扫描和模板还需增强；
- **frontend / RN**: 入口语义已具备，但旧版过程状态、实现细节、视觉反馈和 L4 子文档体系仍需补齐。

下一步建议先做 **Route Artifact Schema**，因为它会直接稳定 pipeline 主控和所有后续子 Skill 的输入边界。
