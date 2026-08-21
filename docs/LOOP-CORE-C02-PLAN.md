# LOOP-CORE-02 有界实现规划（C02 Bounded Implementation Plan）

> 规划状态：**ACCEPTED**（2026-08-20，Current User 裁决接受全部六个裁决点，Decision-036；正式规划合同，与 `docs/LOOP_CORE_CONTRACT.md` 同层级）
> 实施状态：**IN PROGRESS**（2026-08-20，C02-WP1 已实施、复审通过并收口，Decision-037/038；WP2～WP6 仍需逐 WP 单独授权）
> 日期：2026-08-20
> 相关决定：Decision-034（C01 收口）、Decision-035（C02 有界规划授权）、Decision-036（C02 规划裁决与 planning handoff 发布授权）、Decision-037（C02-WP1 授权与实施）、Decision-038（C02-WP1 复审通过与收口）
> 权威依据：
> - [Autonomous Delivery Roadmap](AI-SDLC-Autonomous-Delivery-Roadmap.md) v2.1.0 §4 `LOOP-CORE-02`
> - [LOOP Core Contract](LOOP_CORE_CONTRACT.md) v0.3.0 §2、§4、§5
> - `ai-project-control-plane/projects/ai-sdlc/STATE.yaml`：C02 四项 `INCOMPLETE / NOT_AUTHORIZED`

## 1. 文档定位与授权边界

本文件是 C02 的有界实现规划草案，负责把 Roadmap 已接受的 C02 完成合同分解为最小充分工作包，并记录当前 Source 能力复用结论、设计不变量、验收映射和待用户裁决点。

Current User 本轮只授权：

1. 读取并核对当前产品仓库、Roadmap、Core Contract 和控制平面状态；
2. 形成 C02 规划草案、Decision-035 和规划验证证据；
3. commit、push，并通过受保护分支要求创建 Draft PR 供审阅；
4. 在控制平面登记“规划已授权、草案待审”，但不登记任何 C02 完成项。

本轮不授权：

- C02 任一工作包的实现或修正；
- 真实 Agent 调用、Kimi/Hermes 启用或新 Provider；
- 目标项目代码修改、workspace 执行、checkpoint 推进；
- commit/push/PR/Ready/merge/publication 等 LOOP runtime 副作用；
- C03 Direct Delivery、C04 Speckit Projection、C05 Core MVP 验收；
- Exchange/PKB 外部发布（需在规划被接受后另行决定）。

## 2. C02 完成合同

### 2.1 Objective

把需求摘要、技术方案、方案挑战、方案审核、Development Path Decision、实现、代码审核和测试验收的当前有效版本组织为可恢复的协调链，使后续节点只消费当前有效事实；发现问题时回到最早受影响节点并使依赖它的下游事实失效。

### 2.2 Roadmap completion contract

1. 对同一 Requirement 明确分类：新需求、补充、变更、返工、反馈驱动变更；
2. 有效 finding 使受影响下游产物失效，并路由到正确的最早节点；
3. 后续节点只消费当前有效的上游产物版本和 Gate 结论；
4. 中断后可由另一入口或 binding 继续，不重解释已确认事实。

### 2.3 Durable continuity rules

| 变化或发现 | 最早受影响节点 | 必需后续动作 |
| --- | --- | --- |
| 业务目标、范围、验收或来源冲突 | `requirement-intake` | 修订需求摘要，重新生成方案并重新 Gate |
| 架构、接口、数据、异常、兼容性或风险缺口 | `tech-design` | 修订技术方案，重新挑战、审核并刷新下游边界 |
| 实现错误且不改变已批准行为 | `implementation` | 修复后重新代码审核和测试验收 |
| 代码审核或测试揭示方案缺口 | `tech-design` | 不得只修代码；重新挑战、审核、实现和复核 |
| Development Path Decision 失效 | `solution-review` 或更早受影响节点 | 重新审核并生成当前路径决定 |

## 3. 当前 Source 复用审计

审计基线：产品 `feature/loop-runtime-v1` commit `93e9c45f1b8ae8512451090284ce90d715429458`；控制平面 main commit `515fa2193e55a79f15c01e20225d87ca14a8331d`。

### 3.1 可直接复用

| 资产 | 当前事实 | C02 用途 |
| --- | --- | --- |
| `LoopRunStore` + capability attempt journal | SQLite v2；追加式事件、hash 校验、事务迁移、跨连接 claim、corruption-first | 作为 C02 运行记录与迁移基底；历史 attempt 不重写 |
| `LoopCapabilityEntry` + `recoverRunContext` | 可按 Requirement ID 创建/恢复；严格线性消费前一能力有效输出；中断 attempt 可关闭并重试 | 作为 C02 跨入口恢复与 dispatch 接线基底 |
| `LoopArtifactStore` | content-addressed blob、ref/digest 绑定、大小/路径/权限 fail-closed | 存放不可变 C02 artifact/finding/snapshot 内容 |
| Node Capability Contract + BindingRegistry | 七能力合同、21 binding、每能力唯一 enabled、替换不改变节点合同 | 保持 Agent 中立的节点调用边界 |
| capability execution event | 已记录 input/output ref+version+digest、Gate、unresolved findings、eligibility 和执行者快照 | 作为一次执行事实；C02 不复制执行者模型 |
| Artifact/Version/Gate 标准 | 稳定路径 + 内部 SemVer；Gate 绑定 Reviewed Artifact Version；Manifest Artifact Index / Change History / Re-Gate Records | C02 版本、stale 和 Re-Gate 语义来源 |
| Development Path Governance | 三个固定路径、FULL_REQUIREMENT/DELTA_CHANGE、最早节点返工和 stale 规则 | C02 路径决定与变更范围语义来源 |

### 3.2 部分复用

| 资产 | 可复用部分 | 不能直接复用的原因 |
| --- | --- | --- |
| `loop-requirement-design-orchestrator.ts`（D08） | 需求归一化、技术方案多轮修订、方案审核、Direct/Speckit/Blocked 路由及不可变 artifact 链 | 单次内存编排；未接 C01 journal；缺 solution-challenge、完整 finding 生命周期、跨入口恢复和下游失效传播 |
| `solution-challenge-state.ts` | challenge finding/route 的验证语义 | 主要是 shadow/Graph 观察状态，不是 C02 持久 finding authority |
| `loop-delivery-checkpoint(-store)` | generation、不可变 previous ref、CAS、崩溃恢复模式 | phase 含 commit/push/PR 等发布语义；C02 只复用 generation/CAS 思路，不接发布 phase |
| `manifest.md` 模板 | 当前稳定路径、版本、Gate、Change History、Re-Gate Records | 人工 DocFlow/Tail 视图；不能替代 run journal，也不能形成第二份 runtime schema |
| `loop-governance-tail-result.ts` | 当前/非 stale 证据、Re-Gate evidence、Manifest/Tail Gate 交叉绑定 | 属实现之后 Shared Tail/C03 后段，不能反向成为 C02 上游编排器 |
| legacy `loop/` engine | 固定节点表和基础流转参考 | 节点集合不完整且仍带静态 Agent 映射兼容面；不能承载版本失效图 |

### 3.3 基线验证

本轮独立复跑：

- capability execution：86/86；
- artifact store：266/266；
- D08 requirement/design orchestrator：7066/7066；
- checkpoint store：268/268；
- governance tail result：727/727。

这些结果证明候选资产当前可复用，不证明 C02 已实现。

## 4. 已确认缺口

### G1. 没有机器可判定的 Requirement change record

入口合同要求分类新需求/补充/变更/返工/反馈，但当前 run journal 没有固定 schema 的分类事件、Delta Scope、来源版本或“哪些已确认事实保持不变”的记录。恢复入口只能看到线性能力执行结果，不能区分一次新执行与对既有 Requirement 的变更。

### G2. 没有当前有效 artifact revision authority

`LoopArtifactStore` 只保存不可变 blob；capability event 中的 `inputArtifactVersion` / `outputArtifactVersion` 是执行事件字段，但没有存储层验证“这个 semantic version 对应哪个 stable path、blob、前驱版本和当前指针”。因此无法机器判定某个历史成功产物是否仍 current。

### G3. 没有 finding 生命周期和依赖失效传播

C01 可持久化 unresolved findings ref 并阻塞下一节点，但没有 finding 的来源版本、分类、最早受影响节点、解决证据、accepted-risk 约束或 transitive invalidation 记录。当前测试明确要求 finding 阻塞后**不得自动 Re-Gate**。

### G4. 当前 capability chain 只能线性前进

`recoverRunContext` 从七能力历史中寻找第一个未完成/可重试节点；已经成功的上游能力没有 supersede/invalidate/generation 语义，`LoopCapabilityEntry` 也拒绝调用非 `nextCapability`。它不能表达“测试发现方案缺口 → tech-design generation 2 → challenge/review/implementation/code-review/test 全部重新有效化”。

### G5. Development Path Decision 未接入 C01 持久链

标准与 D08 已有 Direct/Speckit/Blocked 语义，但 C01 的 solution-review succeeded event 只保存 Gate 与 generic capability output，没有当前 Development Path Decision、Decision Scope 和失效关系的机器投影。

### G6. 恢复上下文不包含 C02 全量事实

当前恢复可返回 capability 的最近成功输出、Gate、unresolved findings 和资格，但不返回：变更分类、orchestration generation、current artifact map、stale/superseded revisions、finding lifecycle、invalidation edges、Development Path Decision 或 Re-Gate 目标。

## 5. C02 设计不变量

以下不变量作为后续实现评审的硬边界；规划审阅通过后才能成为 Accepted implementation contract。

1. **历史不可变**：C01 capability attempt 与既有 artifact blob 不重写、不删除；新版本通过追加 revision/event 表达。
2. **单一运行权威**：run journal 保存机器可恢复的 orchestration authority；`manifest.md` 保持目标项目人工 DocFlow/Tail 状态权威。二者通过 requirement、stable path、version、ref、digest 交叉绑定；不一致时 STOP，不静默选一边覆盖另一边。
3. **双重 artifact identity**：每个当前产物同时具有稳定路径 + 内部 SemVer，以及不可变 content-addressed ref + digest；四项必须绑定为同一 revision。
4. **显式 generation**：一次新 Requirement 从 generation 1 开始；补充/变更/返工/反馈创建新的 orchestration generation。generation 只前进，不回退或复用。
5. **失效不等于删除**：受影响 revision 标记 stale/superseded；历史 Gate/finding/执行者仍可审计，但不能获得 current eligibility。
6. **先失效后调度**：变更或有效 finding 的分类、最早节点和下游失效必须原子持久化成功，随后入口才能 dispatch Re-Gate。
7. **版本资格 fail-closed**：后续节点必须精确消费 current revision 的 path/version/ref/digest 和 current Gate；任一漂移、缺失或 stale 均拒绝。
8. **finding 关闭有证据**：不得因再次调用 Agent 自动关闭 finding；resolved/accepted-risk 必须引用当前修订和 Gate/用户风险接受证据。
9. **路径决定只有三个值**：`DIRECT_IMPLEMENTATION`、`SPECKIT_PIPELINE_REQUIRED`、`BLOCKED_NEEDS_REVISION`；C02 不创建第四种路径。
10. **C01 binding 合同保持**：Re-Gate 可以替换 binding，但不得改变节点输入输出合同或历史执行者快照。
11. **不偷渡 Git**：C02 结束于可恢复的 orchestration state；不执行 commit/push/PR/Ready/merge/publication。
12. **迁移原子性**：run store v2→后续格式迁移必须在单事务内完成 schema 校验、数据迁移和 version 落标；失败全部回滚并可幂等重试。

## 6. 有界工作包

### C02-WP1：Requirement Change Classification Contract

**Material outcome**：同一 Requirement 的每次入口变化都形成固定、可恢复、可审计的 change record，而不是只存在于 prompt 或聊天摘要。

范围：

- 定义 canonical change kind：`NEW_REQUIREMENT`、`SUPPLEMENT`、`CHANGE`、`REWORK`、`FEEDBACK_DRIVEN_CHANGE`；
- 记录 `FULL_REQUIREMENT` / `DELTA_CHANGE`、来源引用、当前 change scope、保留的 confirmed facts、触发证据、分类原因；
- 建立 create/classify API，禁止调用方直接伪造持久事件；
- 同一输入精确重放幂等，不同输入并发使用 CAS/冲突语义；
- 分类不确定或来源冲突时持久化 blocked 状态，不猜测业务事实。

验收：五类均有正反例；分类与 Requirement ID、source refs 和前一 generation 绑定；另一入口恢复后读到相同分类和 confirmed-fact 边界。

明确排除：artifact 失效计算、Re-Gate dispatch、业务实现。

- 状态（2026-08-21）：**Round 8 复审 CHANGES_REQUESTED 已修正，待重新复审**；原 Accepted/收口结论（Decision-038）不沿用。Round 3 缺口：WP1 可跨 run 重复声明 `NEW_REQUIREMENT`——已修正为跨 run 写入守卫（合同 1.0.1）。Round 4 缺口：守卫以未验证的原始行裁决、`findLatestRequirementChangeByRequirement` 返回尾部 BLOCKED 与合同语义不符——已修正为同事务内验证相关链再裁决、findLatest 只返回最新 CLASSIFIED（合同 1.0.2）。Round 5 缺口：守卫用 `some()` 短路——已修正为逐一完整读验所有相关链（合同 1.0.3）。Round 6 缺口：守卫与恢复查询以未验证的 `loop_runs.requirement_id` 列选择相关 run（篡改该列可把旧 run 从守卫/恢复中隐藏）——已修正为枚举全部 run、经已验证快照路径验证 identity 后按已验证 identity 过滤，覆盖 append、findLatest 与入口恢复负例（合同 1.0.4）。Round 7 缺口：公开读路径把快照验证与明细返回拆在两个事务（事务间隙可被并发连接篡改 identity 绑定，返回脱离已验证快照的数据）——已修正为单事务"验证快照 + 读明细"，内部读取器只接收已验证 requirementId、不再自查表列（合同 1.0.5）。Round 8 缺口：Round 7 的"事务间隙"回归未真正复现 TOCTOU（篡改在公开读调用前已提交，无法区分单/双事务实现）——已重写为确定性屏障回归：屏障在快照验证后、明细读取前经第二连接提交篡改，断言 list/findLatest 返回本事务一致快照、篡改在事务结束后被下一次读取以 `STORE_CORRUPT` 检出；原回归改标为事务开始前篡改 fail-closed（合同 1.0.6，仅证据与表述修正，语义不变）。

### C02-WP2：Artifact Revision and Current Authority

**Material outcome**：每个 canonical 节点拥有机器可验证的 current artifact revision，稳定路径/SemVer 与 immutable ref/digest 不再脱节。

范围：

- 定义 artifact revision schema：Requirement、generation、capability/node、stable path、internal version、artifact ref/digest、producer execution、upstream revision refs、Gate binding、validity；
- append-only revision + 每节点 current pointer；并发更新采用事务/CAS；
- 版本关系 fail-closed：SemVer、stable path、artifact kind、digest、producer event 和 upstream refs 必须一致；
- current / stale / superseded 是 runtime validity，不覆盖 DocFlow 文档自身的 draft/active/passed/failed 状态；
- 定义 journal ↔ `manifest.md` Artifact Index 的交叉绑定边界，不新建第二份 Manifest schema。

验收：创建 revision、版本前进、精确重放、并发冲突、篡改/缺失 blob、Manifest 漂移全部可判定；任何 stale revision 不能成为节点输入。

明确排除：finding 分类和自动路由。

- 状态（2026-08-21）：**已实施，Round 8 复审修正后待重新复审**（Decision-040）；Round 1 复审 CHANGES_REQUESTED（读回 producer 绑定重验、链非末尾 ACTIVE 规则、测试控制字节）已修正；Round 2 复审 FAIL（H3：写入路径以转换前状态校验候选链）已修正为转换后状态校验 + `supersedeArtifactRevision` 纯函数统一语义；Round 3 复审 CHANGES_REQUESTED（缺失 blob 可判定）已修正为第五项 blob 绑定（合同 0.1.3）；Round 4～6 复审的入口/gateway 接线修正（入口强制同实例绑定、gateway tracing 同实例校验、非虚拟判定与配置冻结，合同 0.1.4～0.1.6）经 Round 8 复审裁定越出 WP2 授权的生产入口接线边界（WP5 范畴），已整体拆出为未提交的 WP5 候选，WP2 仅保留 `LoopRunStoreOptions.artifactStore` 与 store 级 blob 读写校验；Round 7 复审 CHANGES_REQUESTED（公开读路径的快照验证与明细返回拆在两个事务）已修正为单事务化 + 内部读取器只接收已验证 requirementId（合同 0.1.7）；Round 8 复审 CHANGES_REQUESTED（Round 7 的 TOCTOU 回归未复现真正的事务间隙）已修正为确定性屏障回归：屏障在快照验证后、明细读取前经第二连接提交篡改，断言 list/getCurrent 返回本事务一致快照、篡改在事务结束后被下一次读取以 `STORE_CORRUPT` 检出（合同 0.1.8）。store 级端到端 supersede 成功路径覆盖经 Current User 显式重基线，随 C02-WP4 链扩展一并验收。授权 `C02_WP2_ARTIFACT_REVISION_AUTHORITY` 未消费。

### C02-WP3：Finding Lifecycle and Dependency Invalidation

**Material outcome**：finding 成为绑定具体 artifact revision 的持久事实，并能原子使受影响下游 current revisions/Gates 失效。

范围：

- canonical finding record：id、来源 capability/revision、severity/category、evidence ref、最早受影响节点、状态、解决/风险接受证据；
- 状态至少覆盖 `OPEN`、`RESOLVED`、`ACCEPTED_RISK`、`SUPERSEDED`，迁移只能按固定状态机；
- 由 canonical artifact dependency graph 计算 transitive downstream invalidation；调用方不能自由提交任意失效列表；
- finding + invalidation + next eligibility 在同一事务提交；
- PASS_WITH_RISK 只能消费具有当前证据的 `ACCEPTED_RISK`，Critical/未接受 High 仍阻塞。

验收：需求/方案/实现/审核/测试五类 finding 路由矩阵；下游 revision 与 Gate 精确失效；关闭 finding 但未重新 Gate 时仍不能继续；历史记录保持可审计。

明确排除：实际执行 Re-Gate 节点。

### C02-WP4：Earliest-Affected-Node Re-Gate Orchestration

**Material outcome**：协调器依据 change/finding 和 current dependency graph 选择唯一最早节点，创建新 generation 的 Re-Gate 计划并逐节点恢复资格。

范围：

- 固化最早节点路由矩阵及冲突优先级；多个 finding 取 canonical chain 中最早节点；
- 新 generation 从最早节点开始，上游未受影响 confirmed revisions 只读复用，下游必须重建/重新 Gate；
- 重新接入 `solution-challenge`、`solution-review` 和 Development Path Decision；
- 后续 dispatch 的输入由 orchestration context 生成，调用方不得绕过 current pointers 自选历史 artifact；
- Direct/Speckit/Blocked 三路径决定必须绑定当前 solution-review revision 和 Gate；Blocked 不进入实现；
- bounded retry、pause、blocked、failed 保持 C01 durable attempt 语义。

验收：至少覆盖 requirement→全链、tech-design→挑战/审核/下游、implementation→review/test 三种回流；代码审核/测试揭示方案缺口必须回 tech-design；stale Gate/Decision 不能放行。

明确排除：真实 Direct/Speckit 实现引擎和目标仓库 Git 操作。

### C02-WP5：Cross-Entry Recovery and Production Wiring

**Material outcome**：首个受支持入口和 Gateway 真正消费 C02 orchestration authority，在进程中断、binding 替换或另一入口接管后继续同一 generation/next boundary。

范围：

- 扩展恢复上下文：change record、generation、current artifact map、current Gates、open findings、invalidated revisions、Development Path Decision、next capability/eligibility；
- 入口从恢复结果取得 dispatch command，不接受调用方自选非当前节点；
- claim 前再次验证 current pointers，terminal 写入时 CAS 防止并发变更将旧输出提升为 current；
- 复用 C01 interrupted-attempt 关闭语义，保留历史 binding/executor/lineage；
- 至少一个入口覆盖 fresh、supplement/change、finding Re-Gate、process restart 和 binding replacement。

验收：中断前后不重解释 confirmed facts；旧进程晚到结果不能覆盖新 generation；不同入口恢复出相同 current facts 和唯一 next action。

明确排除：C03 实际单仓交付、C04 Speckit 投影、C05 真实业务验收。

### C02-WP6：Validation Guards and Completion Acceptance

**Material outcome**：用生产路径对抗测试证明 C02 四项完成合同，而不是只验证 helper 或文档矩阵。

范围：

- schema 固定字段、plain-data/Proxy/accessor/Symbol/额外字段边界；
- run store 格式迁移、corruption、回滚、并发/CAS；
- change classification、artifact revision、finding lifecycle、失效传播、Re-Gate、跨入口恢复端到端矩阵；
- stale artifact/Gate/Decision、旧 generation late result、伪造 finding close、手工选择历史输入全部 fail-closed；
- 默认 `npm test`、typecheck、standards、mutation/相关 CI 接入；
- 独立完整范围复审，不以实施方报告代替。

验收：C02 completion contract 1～4 均有生产路径正例、负例和恢复例；无未解决 P1/P2 后才允许消费最终工作包授权并收口 C02。

## 7. 工作包依赖与执行顺序

```text
C02-WP1 Change Classification ───────────────┐
                                              ├─> C02-WP4 Re-Gate Orchestration
C02-WP2 Artifact Revision Authority ─> WP3 ──┘                 │
                                                               v
                                             C02-WP5 Recovery + Production Wiring
                                                               │
                                                               v
                                             C02-WP6 Guards + Completion Acceptance
```

- WP1 与 WP2 可在各自 schema 定案后并行设计，但实施授权仍逐 WP 发放；
- WP3 依赖 WP2 的 canonical revision/dependency model；
- WP4 依赖 WP1～WP3；
- WP5 依赖 WP4 的唯一 next-action 语义；
- WP6 是最终综合验收，不替代各 WP 自身测试和复审。

## 8. 完成合同验收映射

| C02 完成合同 | 主覆盖 WP | 必需证据 |
| --- | --- | --- |
| 1. 明确分类新需求/补充/变更/返工/反馈 | WP1、WP5、WP6 | 持久 change record；跨入口恢复一致；不确定输入 blocked |
| 2. finding 失效下游并回正确最早节点 | WP2、WP3、WP4、WP6 | revision graph；事务失效；路由矩阵；历史审计 |
| 3. 后续节点只消费有效上游版本和 Gate | WP2、WP4、WP5、WP6 | current pointer + CAS；stale/旧 generation/旧 Gate 绕过拒绝 |
| 4. 中断后继续且不重解释 confirmed facts | WP1、WP4、WP5、WP6 | durable generation/context；interruption/late result/binding replacement 恢复 |

## 9. 明确不做

- C03 的真实 Direct single-repository delivery、workspace 修改和 Manual Git Handoff；
- C04 的 Speckit SDD 投影与完整 pipeline 接线；
- C05 的真实单仓需求 Core MVP 验收；
- 自动 commit、push、Draft PR、Ready、merge、发布；
- 新 Agent Provider 或 Kimi/Hermes 默认启用；
- 多仓事务、队列、daemon、UI、服务化、HA/SLO；
- Roadmap/任务数据库、第二份 Manifest schema 或以聊天摘要作为 current authority；
- 重写/清理 C01 历史 attempt、artifact 或 binding snapshot。

## 10. 风险与控制

| 风险 | 控制 |
| --- | --- |
| journal 与 Manifest 形成双 authority | 明确作用域并强制 path/version/ref/digest 交叉绑定；漂移 STOP |
| C01 线性 chain 被直接打补丁后破坏历史 | 新增 append-only orchestration generation；旧 attempt 不变 |
| caller 自报 invalidation 列表导致跳过下游 | 依赖图由 canonical node/revision model 派生，store 事务内计算 |
| finding 被“再次运行 Agent”伪关闭 | 关闭/风险接受必须绑定当前 revision 与 evidence/Gate |
| v2→新格式迁移破坏已验收 run | 单事务、strict schema、corruption-first、真实 v2 数据回归 |
| C02 偷渡 C03 实现或远程 Git | Gateway side-effect allowlist 与测试扫描保持 C01 边界 |
| 复用 D08/D09 造成两条编排主线 | 只复用 producer-owned parser/语义；C02 authority 统一落 run journal |

## 11. 待用户裁决点

规划进入 Accepted 前需要确认：

1. 是否接受六个工作包及上述依赖顺序；
2. 是否接受 change kind 的五个 canonical token；
3. 是否接受“run journal 为 runtime orchestration authority、Manifest 为目标项目 DocFlow/Tail authority，二者必须交叉绑定且漂移 STOP”的边界；
4. 是否接受 append-only generation 方案，而不是修改 C01 capability event 历史；
5. 是否继续沿用 C01 的逐 WP 单独授权、实施、独立复审、收口流程；
6. 规划被接受后是否授权单独发布 Exchange/PKB planning handoff。

裁决记录（2026-08-20，Decision-036）：Current User 裁决第 1～6 点**全部接受**。第 6 点澄清为仅针对本规划的 planning handoff 的一次性发布授权，并已在本次裁决中一并授予；后续各 WP 的实施/closure handoff 沿用既有机制、随逐 WP 授权流程发布，不需逐次单独授权。规划状态升为 Accepted；C02 四个完成合同项保持 `INCOMPLETE / NOT_AUTHORIZED`，C02-WP1 启动仍需 Current User 单独授权。

## 12. 进度管理与收口

- 产品仓库保存本规划、Decision 和 C02 规范/实现；
- 控制平面 STATE 只记录动态指针、规划授权、WP 授权、review finding 和 completion 状态，不复制规划全文；
- 每个 WP 必须记录 scope、明确排除、产品提交、默认测试/CI、独立复审和用户裁决；
- finding 修正仍在原 WP 授权范围内，新增 material outcome 才回到本规划受控重排；
- 只有 WP1～WP6 全部收口且四项完成合同均有联合证据，才能登记 `LOOP-CORE-02 = COMPLETED`；
- C02 收口不自动授权 C03。

## Revision Record

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 0.1.0 | 2026-08-20 | Draft for user review | 基于 C01 收口事实、Roadmap C02 完成合同和当前 Source 复用审计，提出六个有界工作包、设计不变量、验收映射与实施排除。 |
| 1.0.0 | 2026-08-20 | Accepted | Current User 裁决接受全部六个裁决点（Decision-036），规划成为正式合同；实施仍逐 WP 单独授权。 |
| 1.0.1 | 2026-08-20 | Accepted | 登记 C02-WP1 Round 2 复审通过与收口（Decision-038）；C02 四项完成合同保持 INCOMPLETE，WP2～WP6 保持未授权。 |
