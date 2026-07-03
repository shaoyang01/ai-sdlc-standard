# Speckit 新轨产物语义等价二次评估

> **日期**: 2026-07-01  
> **状态**: 临时 Review 结果，不提交  
> **范围**: 基于 PR1-PR6 后的当前标准包，重新判断新版 `sdlc-*` Skill、共享标准文档、bootstrap 脚本和可能生成的新私有文档，能否复现旧版 Speckit 产物语义。  
> **样例仓库**: `logistics-center`、`pfms`、`pfms-rn`、`tms-flink-finance`  

## 1. 评估边界

本次操作是标准包开发期的结果检验，不是新版 Skill 后续运行时的必要步骤。

运行时边界仍然是：

- 新版 `sdlc-*` Skill 不读取旧版 `.specify/memory/**`、`.specify/workflow/**`、`.specify/coding_guide/**` 作为普通输入。
- 新版 Skill 只能读取标准包共享文档、bootstrap 生成的新私有文档、目标代码、用户确认事实、`specs/**` 当前阶段产物和 `.specify/business_domain/**` 长期知识。
- 旧版 Skill 和旧版治理文档保持不动，继续服务旧轨。
- `specs/**` 是 Skill 执行过程产物。
- `.specify/business_domain/**` 是长期代码事实和业务事实知识库。

这次读取旧版 Skill、旧版治理文档和样例仓既有产物，只用于抽象标准和判断新版差距。

## 2. 总体结论

PR1-PR6 后，当前新版标准包已经从“方向正确但缺主干能力”推进到“主干产物语义基本成型，但 pipeline 主控和前端特殊产物仍不完全等价”。

粗略等价度判断：

| 维度 | 当前等价度 | 结论 |
| --- | ---: | --- |
| 后端业务服务 `specs/**` | 80% - 85% | `spec.md`、Plan companion、Tasks/Implement/Sync 主线已接近旧版。 |
| 后端业务服务 `business_domain/**` | 75% - 80% | L1/L2/L4、EntryCoverage、create-if-missing 主线已补上，但 Domain Route 主控仍不够强。 |
| 管理后台混合项目 | 70% - 75% | entry profile 能覆盖 controller/worker/MQ/OAS 等，但 `pfms` 本轮 dry-run 未完成，仍需单独验证性能和噪声。 |
| 纯前端 / RN 项目 | 60% - 65% | frontend profile 已能生成 route/page/component/store/API/popup 入口，但旧版 `implementation-details.md`、`SDD_WORKFLOW_STATUS.md`、视觉自检/反馈循环等产物还没完全承接。 |
| ETL / 数据管道项目 | 80% 左右 | `data-pipeline-etl` profile、Plan contract、Sync fact 形态已较接近；仍需加强 Analyze/Sync 对 SQL lineage、分区覆盖、重跑幂等的强约束。 |
| pipeline 主控等价 | 65% - 70% | 最大剩余差距。新版 `sdlc-speckit-pipeline` 包含 Domain Route，但还没有像旧版 `speckit-pipeline-confirmed-single` 一样把 Domain Route 写成完整阶段合同。 |

一句话结论：

> 如果现在在一个项目里执行 bootstrap，再用新版 pipeline 开发需求，后端和 ETL 场景大概率可以生成接近旧版的 `specs` 与 `business_domain` 产物；但还不能说“完美复现”。最需要补的是 pipeline 的 Domain Route 阶段合同、前端特殊产物承接、以及 entry coverage / sync 在各项目类型上的更强强制项。

## 3. 已经明显收敛的部分

### 3.1 双轨隔离

当前标准包已经明确：

- 旧版 `.specify/memory/**`、`.specify/workflow/**`、`.specify/coding_guide/**` 被保留，但不是新版运行时输入。
- 新版 bootstrap 生成 `.specify/project-governance-profile.yaml`、`.specify/entry-coverage-profile.yaml`、`.specify/business-domain-bootstrap.yaml` 和 `.specify/project-context/**`。
- `speckit_dual_rail`、`runtime_source_policy`、`legacy_runtime_action=preserved_not_read` 已写入生成 profile。

这一点已经符合用户要求。

### 3.2 项目类型 Profile

PR1 后，样例项目的核心识别已经接近预期：

| 仓库 | 当前识别结果 | 判断 |
| --- | --- | --- |
| `logistics-center` | `backend-business-service` | 本轮 dry-run 结果正确，不再误判为前端。 |
| `pfms-rn` | `frontend-application` | 本轮 dry-run 结果正确，入口类型是 route/page/component/store/API/popup。 |
| `tms-flink-finance` | `data-pipeline-etl` | 本轮 dry-run 结果正确。 |
| `pfms` | 预期 `admin-mixed-workflow + backend-business-service` | 本轮 dry-run 扫描超时被中断，需后续单独复验。 |

仍有噪声：

- `pfms-rn` 的 source roots 仍包含 Android/iOS native shell 和 Pods，导致 code evidence 中出现 Java listener / manager 噪声。
- `tms-flink-finance` 会把 example consumer / producer 作为 MQ evidence，需要 profile 或 audit runner 支持 technical bridge 排除。
- `logistics-center` 的注解类也会进入 message listener inventory，后续 strict audit 需要识别 abstract/annotation/base 类。

### 3.3 `spec.md` 产品形状

PR3 后，新版 `technical-specification-template.md`、`sdlc-speckit-specify` 和 contract 已强制 legacy-critical sections：

- `Domain Route / Scope Baseline`
- `Requirement Type`
- `Business Domain Targets`
- `Entry Coverage Target`
- `Sync Targets`
- `Representative Data Simulation`
- `Edge Cases`
- `Functional Requirements`
- `Key Entities / Data Contracts`
- `Success Criteria`
- `Source Artifact Traceability`
- `Branch / Repository Boundary`

这已经覆盖了 `logistics-center` 直送出库、`tms-flink-finance` 鲜猪肉质检计薪这类旧版产物中的关键语义。

### 3.4 Plan companion artifacts

PR4 后，Plan 阶段必须生成或显式跳过：

- `plan.md`
- `research.md`
- `data-model.md`
- `contracts/`
- `quickstart.md`

并且 skip record 必须包含：

- `Artifact:`
- `Skip Reason:`
- `Risk:`
- `Impact:`
- `Accepted By:`
- `Re-Gate Required:`

这已基本复现旧版 `speckit-plan` 对 companion artifacts 的产物语义。

### 3.5 Entry coverage audit runner

PR2 已新增 `scripts/audit-entry-coverage.rb`，可生成：

- `entry_inventory.tsv`
- `service_inventory.tsv`
- `entry_chain_evidence.md`
- `unarchived_entries.md`
- `unarchived_services.md`
- `cross_domain_conflicts.md`
- `entry_coverage_report.md`

并且 `--strict` 可作为 Sync / Reconcile gate 使用。

这填上了旧版 `audit-entry-coverage.sh --strict` 的标准包级替代能力，但还需要继续压实类型识别和 technical bridge 噪声。

### 3.6 Sync create-if-missing

PR6 后，新版 `sdlc-speckit-sync` 已补齐：

- existing L4 只更新授权目标。
- missing L4 必须有 confirmed L1/L2、owner、create-if-missing 授权、reserved L4 id。
- 创建 L4 skeleton 时必须更新 L2 main document index 和 `01DomainCatalog.md`。
- 不允许把缺失目标写入 `99PendingConfirmation` 作为长期事实。
- one-off / 未验证 / owner 不清 / 审计失败 / 已有冲突事实全部 BLOCKED。

这已经接近旧版 Sync 的长期知识回填语义。

## 4. 样例仓语义对照

### 4.1 `logistics-center`

读取到的旧版产物语义：

- `specs/feature/dev_20260615_receive_outbound/spec.md` 已包含 Domain Route、Entry Coverage Target、Sync Targets、Representative Data Simulation、Edge Cases、FR、Success Criteria。
- `tasks.md` 把 entry audit、business_domain 回写、create L4、update EntryCoverage、reconcile 都列为实现后的任务。
- L4 `010104StraightOrderOutboundReceipt(直送出库回执).md` 沉淀 RPC -> Service -> Manager -> Mapper 主链、幂等 SQL、生命周期节点、查询展示、回滚补偿。
- `010199EntryCoverage(销单入口覆盖对账).md` 以入口类型、入口类、代码路径、RPC 方法、Service 主链、稳定事实构成 strict gate 数据落点。

当前新版覆盖情况：

- `backend-business-service` profile 正确。
- `spec.md` 产品形状已能复现。
- Plan/Tasks/Sync 主线已能复现。
- EntryCoverage runner 有基础替代能力。

剩余差距：

- Pipeline 主控的 Domain Route 阶段还不够像旧版 confirmed-single，容易让路由摘要只散落在 `specify/sync` 子 Skill 中。
- Entry audit runner 对 annotation / abstract processor / technical bridge 的噪声处理还需增强。

### 4.2 `pfms`

读取到的旧版产物语义：

- `business_domain` 中有复杂 admin + backend 混合入口，例如 controller、worker、schedule、MCQ consumer、OAS event、data console、SPI、RPC。
- `010199EntryCoverage(员工生命周期入口覆盖对账).md` 不只是入口清单，还包含 Service / Manager / Mapper 证据矩阵。
- `010104SignCheckAndBankCardApproval(签约校验与银行卡审批回写).md` 包含 HTTP、OAS Event、Service 回调、事务边界、错误语义、代码证据索引。

当前新版覆盖情况：

- `admin-mixed-workflow` profile 已存在。
- entry profile 已包含 controller、worker、scheduled_job、mcq_consumer、oas_event、data_console、spi、rpc_provider 等方向。
- `sdlc-speckit-plan` 已要求 admin/back-office 的 audit/approval/import/export/month-copy 等合同面。

剩余差距：

- 本轮 `pfms` bootstrap dry-run 未完成，说明真实大仓扫描性能或文件过滤仍需优化。
- 入口证据矩阵对 Service/Manager/Mapper 的推荐层级虽然在 profile 中有，但 audit runner 还需要更贴近旧版的矩阵化输出。

### 4.3 `pfms-rn`

读取到的旧版产物语义：

- `specs/000002-accuracy-check/spec.md` 包含 `Clarifications`、用户故事、验收场景、Edge Cases、FR、Key Entities、Success Criteria。
- `plan.md` 覆盖 RN + API 跨仓重构、Route、页面、组件、MobX Action、API client、后端 Dubbo 合同、回滚兼容。
- `tasks.md` 包含前端 Jest、组件、页面、Route 注册、MobX、API、手工验证、视觉文本/按钮/标签检查。
- 旧版 `implementation-details.md` 独立承载内部逻辑、重构说明、副作用、性能、安全、测试策略。
- 旧版 workflow 还包含 `SDD_WORKFLOW_STATUS.md`、Feedback Loop、visual self-correction、impact analysis、dependency pre-check。
- `business_domain/060201AccuracyCheck(分拣抽查).md` 以移动端业务流程和后端支撑契约为主，不是 Java service 文档。

当前新版覆盖情况：

- `frontend-application` profile 正确。
- entry profile 有 route、navigation_guard、page、component、popup、store_action、api_client。
- Plan contract 已覆盖 page/route behavior、frontend state/API、popup/interaction 等方向。

剩余差距：

- 新版没有明确规定何时生成或替代旧版 `implementation-details.md`。
- 新版没有等价承接 `SDD_WORKFLOW_STATUS.md` 的阶段状态记录。
- frontend visual self-correction、impact analysis、dependency pre-check 还没有作为 pipeline / implement 的强制输出。
- bootstrap code evidence 对 Android native shell / Pods 仍有噪声，需要在 frontend profile 下默认弱化 native shell，除非需求明确涉及 native。

### 4.4 `tms-flink-finance`

读取到的旧版产物语义：

- `specs/011-fresh-pork-inspection-salary/spec.md` 有 ETL 代表性数据模拟，覆盖正常计薪、缺价、无有效工时、无工作量、生产发送门禁、非生产代理、PFMS 消费。
- `plan.md` 强制写明 Spark batch job、Hive 双表、MQ、PFMS 消费、SQL lineage、分区覆盖、生产门禁、敏感日志。
- L4 `030501FreshPorkInspectionSalaryOnlineFlow` 沉淀 Job/ETL、日期窗口、单价预加载、工作量/工时查询、落库/MQ、PFMS handler、空分区覆盖。
- `010199EntryCoverage(批流入口覆盖对账).md` 覆盖 Spark job、Spark online ETL、Flink main、Flink process、MCQ connector 和核心处理单元反查。

当前新版覆盖情况：

- `data-pipeline-etl` profile 正确。
- entry profile 覆盖 spark_job、spark_online_etl、flink_main、flink_process_function、mcq_connector。
- Plan contract 已补 input tables/topics/files、output tables/topics/reports、SQL/data lineage、rerun/replay/idempotency。
- Sync create-if-missing 已能承接 ETL L4 回填。

剩余差距：

- Analyze 还需要更硬地检查分区覆盖、窗口、SQL lineage、重跑/补数/回放。
- Sync 还需要更明确 ETL L4 必填字段，例如 trigger、input、output、partition/window、failure/replay、data quality、downstream consumer。
- audit runner 对 Flink function / connector / technical bridge 的分类仍需实测打磨。

## 5. 最大剩余问题：Pipeline Domain Route

用户指出的理解是正确的：

> `sdlc-speckit-pipeline` 应该是 `$speckit-pipeline-confirmed-single` 的新版增强版。

当前新版 pipeline 确实包含 Domain Route：

- Core Rules 中写了阶段顺序：`Preflight, Domain Route, Specify, Clarify, Plan, Tasks, Analyze, Implement, Sync, Reconcile`
- Workflow 中有 `Run Preflight And Domain Route`
- Stop Conditions 中有 domain route 不能确定就停止

但它还没有完全复刻旧版 confirmed-single 的 Domain Route 语义。

旧版 `speckit-pipeline-confirmed-single` 明确规定：

- Domain Route 开始先读 `00BusinessLandscape.md` 和 `00UbiquitousLanguage.md`
- 判断 `existing-change` / `new-flow`
- `existing-change` 必须命中 L1/L2/L4 文档
- `new-flow` 必须确定 L2、L4 编号/命名、create-if-missing 目标
- 阶段输出必须包含：
  - 路由结论和判断依据
  - 必读知识库文档清单
  - in-scope / out-of-scope
  - Sync 回写或 create-if-missing 目标
  - 未决路由问题

新版 pipeline 目前只是抽象地说“Domain route is known”，没有把这些作为 pipeline 主控的硬性阶段合同。

因此当前最大差距不是“有没有 Domain Route”，而是：

> 新版 pipeline 没有把 Domain Route 作为一个可传递、可校验、后续阶段必须继承的独立产物。

这会带来风险：

- `sdlc-speckit-specify` 可能生成了路由章节，但 pipeline 没有先锁定路由边界。
- `sdlc-speckit-plan/tasks/analyze` 可能没有统一继承同一份路由摘要。
- `sdlc-speckit-sync` 虽然现在有 create-if-missing 规则，但目标可能来自后置推断，而不是 pipeline 早期确认。

## 6. 建议下一轮 PR

### PR7: Pipeline Domain Route Parity

目标：让 `sdlc-speckit-pipeline` 完全复刻并增强旧版 `speckit-pipeline-confirmed-single` 的 Domain Route 能力。

建议修改：

- `skills/sdlc-speckit-pipeline/SKILL.md`
- `skills/sdlc-speckit-pipeline/references/stage-sequence.md`
- 新增或强化 `skills/sdlc-speckit-pipeline/references/domain-route.md`
- `skill-contracts/known-skills/sdlc-speckit-pipeline.md`
- `docs/VALIDATION.md`
- `scripts/validate-skill-contracts.rb`

必须新增的 Domain Route 输出合同：

```text
Route Type:
Route Evidence:
Business Knowledge Read Set:
Matched L1:
Matched L2:
Matched L4:
Entry Coverage Target:
Sync Targets:
Create-If-Missing Decision:
In Scope:
Out Of Scope:
Unresolved Route Questions:
Route Summary Handoff:
```

必须强制后续阶段继承：

- Specify 必须继承 `Route Summary Handoff`
- Clarify 不能扩大 route scope
- Plan/Tasks 不能改变 route boundary
- Analyze 必须检查 route / spec / plan / tasks 一致
- Implement 必须只实现 route scope 内任务
- Sync 必须只写 route 允许的 target

### PR8: Frontend Product Parity

目标：补齐 `pfms-rn` 旧版产物语义。

建议补：

- `implementation-details.md` 等价产物，或明确并入 `quickstart.md` / implementation record 的规则。
- `SDD_WORKFLOW_STATUS.md` 等价状态记录，或并入 manifest Activity Log / Pipeline Result。
- visual self-correction、impact analysis、dependency pre-check 的强制输出。
- frontend/native shell 噪声过滤策略。

### PR9: ETL Analyze/Sync Hardening

目标：把 ETL 旧版特有门禁变成新版强规则。

建议补：

- Analyze 检查 SQL lineage、partition/window/checkpoint、rerun/replay/idempotency、downstream consumer。
- Sync L4 必填 trigger/input/output/failure/replay/data quality/downstream sections。
- audit runner 对 Spark/Flink technical bridge 做更细分类。

### PR10: Large Repo Bootstrap Performance

目标：解决 `pfms` dry-run 长时间不结束的问题。

建议补：

- bootstrap 扫描增加文件数量上限、路径 prune、超时保护。
- 优先扫描 source roots，不扫 target/build/node_modules/历史大目录。
- generation report 记录 truncated / sampled 状态。

## 7. 当前能否用于真实需求

可以，但建议限定条件：

- 后端 / ETL：可以继续试跑真实需求，但要人工盯住 Domain Route handoff 和 Sync target。
- 管理后台混合项目：可以试跑，但先单独修复或验证 `pfms` bootstrap 性能。
- 前端 / RN：可以试跑 `specify -> plan -> tasks`，但暂不应宣称完全复现旧版前端 SDD 产物。
- 任何项目：Sync 写 `business_domain` 前必须跑新的 `audit-entry-coverage.rb --strict`，并人工确认 create-if-missing 决策。

## 8. 本次二次评估使用的证据

读取过的代表性产物包括：

- `logistics-center/specs/feature/dev_20260615_receive_outbound/spec.md`
- `logistics-center/specs/feature/dev_20260615_receive_outbound/plan.md`
- `logistics-center/specs/feature/dev_20260615_receive_outbound/tasks.md`
- `logistics-center/.specify/business_domain/01SaleOrder/01ReceiveAndFulfillment/010104StraightOrderOutboundReceipt(直送出库回执).md`
- `logistics-center/.specify/business_domain/01SaleOrder/01ReceiveAndFulfillment/010199EntryCoverage(销单入口覆盖对账).md`
- `pfms/specs/010-signcheck-alipay-risk-check/spec.md`
- `pfms/.specify/business_domain/01EmployeeAndOrg/01EmployeeLifecycle/010104SignCheckAndBankCardApproval(签约校验与银行卡审批回写).md`
- `pfms/.specify/business_domain/01EmployeeAndOrg/01EmployeeLifecycle/010199EntryCoverage(员工生命周期入口覆盖对账).md`
- `pfms-rn/specs/000002-accuracy-check/spec.md`
- `pfms-rn/specs/000002-accuracy-check/plan.md`
- `pfms-rn/specs/000002-accuracy-check/tasks.md`
- `pfms-rn/specs/profitPerformancePageLoadFix/implementation-details.md`
- `pfms-rn/.specify/business_domain/06QualityAppeal/0602SortingAccuracyCheck/060201AccuracyCheck(分拣抽查).md`
- `tms-flink-finance/specs/011-fresh-pork-inspection-salary/spec.md`
- `tms-flink-finance/specs/011-fresh-pork-inspection-salary/plan.md`
- `tms-flink-finance/specs/011-fresh-pork-inspection-salary/tasks.md`
- `tms-flink-finance/.specify/business_domain/03RdcTeamPieceworkSalary/05FreshPorkInspectionSalaryOnline/030501FreshPorkInspectionSalaryOnlineFlow(鲜猪肉质检计薪线上化流程).md`
- `tms-flink-finance/.specify/business_domain/01JobExecutionAndScheduling/01BatchAndStreamProcessing/010199EntryCoverage(批流入口覆盖对账).md`
- 旧版 `/Users/eric_shaoooo/.codex/skills/speckit-pipeline-confirmed-single/SKILL.md`
- 新版 `skills/sdlc-speckit-pipeline/SKILL.md`

本报告未提交，后续 PR 可以按 PR7 开始补 pipeline Domain Route parity。
