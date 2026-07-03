# Speckit 新轨产物语义等价四次评估（PR B 后）

> **日期**: 2026-07-02  
> **状态**: 临时 Review 结果，不提交  
> **范围**: 基于当前工作区 PR B `Route Artifact Schema` 改动，复检新版 `sdlc-*` Skill、共享标准文档、validator 和可能生成的新私有产物，判断其能否复现旧版 Speckit `specs/**` 与 `.specify/business_domain/**` 的产物语义。  
> **样例仓库**: `logistics-center`、`pfms`、`pfms-rn`、`tms-flink-finance`  
> **注意**: 本次是标准包开发期结果检验。目标项目真实运行时仍禁止新版 Skill 读取、比较或迁移旧版 Skill / legacy 文档。

## 1. 本次结论

PR B 后，上次最大 P0 缺口已经明显收敛：

- `Domain Route Summary` 不再只是 pipeline report 里的一段文字；
- 新增稳定产物 schema：`specs/{feature}/route.md`；
- `sdlc-speckit-specify` 必须读取 `route.md` 或 Pipeline Domain Route Summary，并在 `spec.md` 中引用；
- `Route Type = unknown` 默认阻断进入 Specify，除非用户显式确认 route；
- `Create-If-Missing Decision` 必须记录 L1/L2/L4、owner、authorization 和 entry coverage status；
- `New-Rail Runtime Check` 明确 `Legacy Skill usage: none`、`Legacy document runtime input: none`、`Legacy document write target: none`；
- validator 已覆盖 route artifact schema 与跨 Skill 集成要求。

整体判断：

| 维度 | PR A 后粗略等价度 | PR B 后粗略等价度 | 判断 |
| --- | ---: | ---: | --- |
| Pipeline 主控 / Route 边界 | 80% - 85% | 90% - 94% | Route 已有稳定 artifact，后续子 Skill 不再各自解释 route。 |
| 后端业务服务 `specs/**` | 86% - 90% | 90% - 93% | Domain Route、Entry Coverage、Sync Target 继承能力基本到位。 |
| 后端业务服务 `business_domain/**` | 82% - 86% | 86% - 89% | create-if-missing 决策更稳，但 L4 项目类型模板仍需加强。 |
| 管理后台混合项目 | 78% - 82% | 82% - 85% | route 能承接 admin/backend 多入口，但 admin L4 模板仍偏弱。 |
| 纯前端 / RN 项目 | 70% - 75% | 74% - 78% | route/page/API/popup 边界更稳；过程状态和 implementation details 仍缺。 |
| ETL / 数据管道项目 | 84% - 88% | 88% - 91% | ETL route、输入输出、lineage、replay 边界更稳；Analyze gate 还可加强。 |

一句话结论：

> PR B 把“新轨是否能像旧版一样先做 Domain Route，再驱动 Specify/Plan/Analyze/Sync”的核心差距基本补上了。当前整体剩余差距从 PR A 后约 **15% - 20%** 缩小到约 **10% - 15%**。主要缺口已经从 pipeline route 边界，转移到项目类型化 L4 模板、前端过程产物、Entry Coverage 精度和大仓扫描性能。

## 2. 本次读取与对比证据

本次重新读取了四个样例仓库的 `specs/**` 与 `.specify/business_domain/**`，并对照当前标准包以下文件：

- `skills/sdlc-speckit-pipeline/SKILL.md`
- `skills/sdlc-speckit-pipeline/references/domain-route-artifact.md`
- `skills/sdlc-speckit-pipeline/references/new-rail-enhanced-pipeline.md`
- `skills/sdlc-speckit-pipeline/references/output-and-manifest.md`
- `skills/sdlc-speckit-pipeline/references/stage-sequence.md`
- `skills/sdlc-speckit-specify/SKILL.md`
- `skills/sdlc-speckit-specify/references/spec-sync-mapping.md`
- `skills/sdlc-speckit-specify/references/output-and-manifest.md`
- `skill-contracts/known-skills/sdlc-speckit-pipeline.md`
- `skill-contracts/known-skills/sdlc-speckit-specify.md`
- `docs/VALIDATION.md`
- `scripts/validate-skill-contracts.rb`

本次验证命令：

```bash
ruby scripts/validate-skill-contracts.rb
git diff --check
```

结果均通过。

## 3. PR B 已补上的旧版语义

### 3.1 Domain Route 从隐式段落升级为稳定产物

旧版样例中，`logistics-center` 的 `spec.md` 往往先写：

- Route Type；
- Primary Domain / L1 / L2 / L4；
- Entry Coverage Target；
- Collaborating Boundary；
- Sync Targets；
- create-if-missing L4。

例如 `feature/dev_20260615_receive_outbound/spec.md` 将直送出库回执路由到 `01SaleOrder/01ReceiveAndFulfillment`，规划 `010104StraightOrderOutboundReceipt`，并要求 `010199EntryCoverage` 后续补 RPC provider 入口。

PR B 后，`route.md` 的 schema 已能直接承接这些字段：

- Requirement ID / Feature ID；
- Route Type；
- Project Type Profiles；
- Business Domain Targets；
- Business Knowledge Read Set；
- Entry Coverage Surface；
- Sync Targets；
- Create-If-Missing Decision；
- Unresolved Questions；
- Blocking Items；
- New-Rail Runtime Check；
- Source Artifacts；
- Manifest Recommendation。

这基本补齐了旧版“先 route，再 specify，再 plan/sync”的事实源语义。

### 3.2 unknown route 阻断明确化

旧版流程里，如果 L1/L2/L4 或入口归属不确定，Domain Route 不应该直接进入 Specify。PR B 已将此规则写入：

- pipeline Skill；
- route artifact reference；
- specify Skill；
- skill contracts；
- validation 文档；
- validator。

当前规则是：

```text
Route Type = unknown 时阻断 Specify；
除非用户显式确认 route type、目标 business-domain 文档、entry coverage surface 和 risk owner。
```

这比 PR A 的 `Domain Route Summary` 更接近旧版 strict gate。

### 3.3 create-if-missing 决策可追踪

旧版 `logistics-center` 和 `tms-flink-finance` 都有“新增 L4 / 回写 L4 / 更新 EntryCoverage”的场景。PR B 后，`route.md` 必须记录：

- Target L1；
- Target L2；
- Target L4 Id；
- Target L4 Document；
- Owner；
- Authorization；
- Entry Coverage Status；
- Source Evidence。

这能防止新版 Sync 在缺 L4 时把 `99PendingConfirmation` 或临时描述当成长期治理结果。

### 3.4 多项目类型入口面已进入 route source of truth

旧版样例不是单一后端：

- `logistics-center`: RPC / Service / Manager / Mapper / MQ / Schedule；
- `pfms`: Controller / data-console / worker / schedule / import/export / audit / ETL read-only gateway；
- `pfms-rn`: route / page / component / store / API / popup / navigation；
- `tms-flink-finance`: Spark job / Flink function / connector / SQL lineage / partition / MQ sink。

PR B 的 `Entry Coverage Surface` 明确列出：

- backend entries；
- admin entries；
- frontend entries；
- ETL entries；
- library/shared-component entries。

这解决了早期 strict gate 过度后端化的问题。当前 route artifact 至少不会把 `wms-monitor`、`pfms-rn`、`tms-flink-finance` 这类项目退化成单一 Controller/Service 覆盖模型。

## 4. 样例仓库复检

### 4.1 `logistics-center`

旧版重点：

- `spec.md` 中有 Domain Route / Planned L4 / Entry Coverage Target / Sync Targets；
- L4 文档沉淀入口、幂等、生命周期、查询展示、回滚补偿；
- EntryCoverage 按 L4 反查入口和主链路。

PR B 后覆盖情况：

- `route.md` 能承接 `010104StraightOrderOutboundReceipt` 这类 create-if-missing 决策；
- Specify 必须引用 route source，避免后续 `spec.md` 自己重写 route；
- Plan / Analyze / Sync / Reconcile 必须沿用同一个 route boundary。

剩余差距：

- 后端 L4 skeleton 仍不够项目类型化，入口 -> Service -> Manager -> Mapper、事务、幂等、回滚、补偿还不是模板级强制结构；
- EntryCoverage runner 对 annotation/base/abstract processor 的 technical bridge 判断仍需打磨。

### 4.2 `pfms`

旧版重点：

- admin mixed + backend 复合入口；
- L4 包含配置生命周期、查询/新增/编辑/删除、导入导出、日志审计、ETL 只读查询契约、并发与回滚；
- specs 中也会出现 HTML 技术方案、implementation/code-change-plan 等过程产物。

PR B 后覆盖情况：

- `Entry Coverage Surface` 可以同时记录 admin entries 与 backend entries；
- route artifact 可以记录 ETL read-only gateway 作为 collaborating boundary；
- create-if-missing 决策能区分已有 L4、缺失 L4 和 pending confirmation。

剩余差距：

- admin mixed 的 L4 模板还不够强，尚未默认要求配置生命周期、导入导出、日志审计、只读 ETL 查询、并发回滚；
- `pfms` 大仓 bootstrap dry-run 性能问题仍未解决；
- `specs/{feature}/implementation/code-change-plan.md` 这类实现计划产物还未标准化为新轨等价位置。

### 4.3 `pfms-rn`

旧版重点：

- 前端/RN specs 除 `spec.md` / `plan.md` / `tasks.md` 外，还有：
  - `implementation-details.md`；
  - `SDD_WORKFLOW_STATUS.md`；
  - `API_DEBUG_GUIDE.md`；
  - `QUICK_DEBUG_REFERENCE.md`；
  - `LOGGING_IMPLEMENTATION.md`；
  - `FINAL_SUMMARY.md`。
- L4 以移动端作业流程、页面状态、RPC 契约、禁用/只读规则和后端支撑边界为核心。

PR B 后覆盖情况：

- route artifact 可以承接 route/page/API/popup/navigation 的路由边界；
- Specify mapping 已要求 route/page/component/store/API mapping、popup trigger、visibility rule、backend/mock boundary、visual verification note；
- `unknown` route 阻断能避免前端页面入口未确认就进入 Specify。

剩余差距：

- `implementation-details.md` 仍没有新轨标准等价产物；
- `SDD_WORKFLOW_STATUS.md` 仍没有标准映射，虽然 manifest 可以做状态权威源；
- frontend L4 的 Arch/API/Spec/Popups 子文档体系还未模板化；
- debug guide、logging implementation、final summary 这类前端过程产物还未进入 Skill contract。

### 4.4 `tms-flink-finance`

旧版重点：

- `spec.md` 中有 Route Type、L1/L2/L4、Branch Boundary、Representative Data Simulation；
- L4 固化 Job/ETL、日期窗口、查仓、单价预加载、工作量/工时查询、薪资计算、落库、MQ、PFMS 消费与生产发送门禁；
- EntryCoverage 需要覆盖 job、ETL、connector、calculator、repository、publisher、PFMS handler。

PR B 后覆盖情况：

- `route.md` 可以稳定记录 `new-flow`、TMS/PFMS 跨仓边界、ETL entries、Sync Targets；
- Specify mapping 已要求 input/output、SQL/data lineage、partition/window/checkpoint、rerun/replay/idempotency、downstream consumer；
- create-if-missing 决策可以承接 `030501FreshPorkInspectionSalaryOnlineFlow` 这类新增 L4。

剩余差距：

- ETL L4 skeleton 还不够强，trigger/input/output/lineage/partition/window/failure/replay/downstream consumer 仍靠 agent 执行质量；
- Analyze gate 对分区覆盖、重跑幂等、生产发送门禁、SQL lineage 的硬校验还需加强；
- audit runner 对 Flink Function、Connector、Sink、technical bridge 的分类还需要真实项目打磨。

## 5. 当前差距重新排序

PR B 后，优先级发生变化。

| 优先级 | 剩余差距 | 影响 |
| --- | --- | --- |
| P0 | Project-Type L4 Templates | `business_domain` 仍可能生成通用 L4，不能稳定复现 backend/admin/frontend/ETL 旧版 L4 语义。 |
| P0 | Frontend Process Products | `implementation-details.md`、`SDD_WORKFLOW_STATUS.md`、debug/log/final summary 等前端过程产物仍无标准等价。 |
| P1 | Entry Coverage Precision | 当前 route 能列 surface，但 runner 对真实代码入口、technical bridge、反查覆盖仍要增强。 |
| P1 | Analyze Gate 强化 | ETL/admin 的关键门禁还需要更硬的 checklist 和阻断条件。 |
| P1 | Bootstrap Performance | `pfms` 这类大仓 dry-run 性能仍需治理。 |

## 6. 当前是否能生成旧版一样的产物

分场景判断：

| 场景 | 当前判断 | 差距 |
| --- | --- | --- |
| 后端业务服务 specs | 基本可复现 | route 边界已稳，剩余主要是 EntryCoverage 精度。 |
| 后端 business_domain | 接近可复现 | L4 skeleton 还需 backend 类型化模板。 |
| admin mixed specs | 可用但不完整 | route 可承接多入口，但 implementation/code-change-plan 等过程产物未完全标准化。 |
| admin mixed business_domain | 部分可复现 | 配置生命周期、导入导出、日志审计、ETL 只读查询模板缺口明显。 |
| frontend/RN specs | 主要 spec/plan/tasks 可复现 | implementation-details、workflow-status、debug/log/final summary 缺口仍在。 |
| frontend/RN business_domain | 部分可复现 | 移动端 L4 业务流程可写，但 Arch/API/Spec/Popups 子体系未模板化。 |
| ETL specs | 基本可复现 | route 和数据模拟更稳，Analyze 硬门禁还需加强。 |
| ETL business_domain | 接近可复现 | ETL L4 模板仍需标准章节。 |

## 7. 下一步建议

建议下一步不要继续扩 route，而是进入 **PR C: Project-Type L4 Templates**。

理由：

1. Route artifact 已经把 Pipeline / Specify / Plan / Analyze / Sync 的输入边界稳定住。
2. 当前最大剩余差距发生在 `business_domain` 产物质量，而不是 route。
3. 四类样例仓库都表明，旧版 L4 文档有明显项目类型结构：
   - backend: entry/service/manager/mapper、事务、幂等、回滚；
   - admin: 配置生命周期、导入导出、日志审计、只读查询；
   - frontend: route/page/component/store/API/popup、视觉验证、禁用/只读状态；
   - ETL: trigger/input/output/lineage/partition/window/replay/downstream consumer。
4. 如果不先补 L4 模板，即使 route 正确，Sync 也可能生成语义过薄的业务事实文档。

PR C 建议目标：

```text
让 business-domain bootstrap / sync skeleton 根据 project type profiles 生成不同 L4 默认章节。
```

建议验收：

```text
1. backend L4 skeleton 包含入口链路、事务、幂等、回滚、补偿、测试证据。
2. admin mixed L4 skeleton 包含配置生命周期、审批/审核、导入导出、日志审计、只读查询、并发回滚。
3. frontend L4 skeleton 包含 route/page/component/store/API/popup、状态与可见性、backend/mock boundary、视觉验证。
4. ETL L4 skeleton 包含 trigger/input/output/SQL lineage/partition/window/checkpoint/replay/idempotency/downstream consumer。
5. create-if-missing 从 route artifact 读取 project type profiles，并选择对应 L4 skeleton。
```

## 8. 最终判断

PR B 是有效的，而且是关键性补丁。它把之前“Domain Route 只是一段 summary”的问题升级成了可审计、可引用、可阻断、可传递的 `route.md` artifact。

当前可以认为：

- 新版 pipeline 和 specify 已经具备复刻旧版 route-first 能力；
- 后端和 ETL 的 specs 语义已接近旧版；
- `business_domain` 产物仍需要项目类型化模板才能更稳定复现；
- 前端/RN 仍需要单独补过程状态与实现细节产物；
- 完美复现目标仍未完成，但差距已经从 pipeline 主控问题缩小为几个明确的产物形态问题。
