# LOOP-CORE-02 有界实现规划（C02 Bounded Implementation Plan）

> 规划状态：**ACCEPTED**（2026-08-20，Current User 裁决接受全部六个裁决点，Decision-036；正式规划合同，与 `docs/LOOP_CORE_CONTRACT.md` 同层级）
> 实施状态：**COMPLETED**（2026-08-25 终局裁决 Decision-049 登记 LOOP-CORE-02 = COMPLETED。历程：2026-08-21，C02-WP1 重开后经 Round 9 复审 PASS 重新收口、C02-WP2 复审通过并收口、C02-WP3 Round 2 复审 PASS 收口，Decision-037/038/040/041/042/043；2026-08-21 Current User 裁决单轨重基线并授权 C02-WP3.5 治理登记，Decision-044；2026-08-22 Current User 补充裁决 Skill 收敛映射与两个非节点 Skill 的去留，Decision-045；2026-08-22 Current User 验收 WP3.5 阶段 2 输出 A～G（PR #93 合入 491c0e2），控制平面登记 `C02_WP3_5_STAGE_3_IMPLEMENTATION` 授权（AUTHORIZED_NOT_STARTED_RESERVED_FOR_NEXT_AGENT）；阶段 3：WP3.5-A 已合入但因 H3（归 C03-B）保持不收口，**WP3.5-B 经 Round 3 复审 PASS 于 2026-08-22 收口（PR #95/#96/#97），WP3.5-C 经 Round 2 复审 PASS 于 2026-08-23 收口（PR #98），C02-WP4 经多轮独立复审 PASS 于 2026-08-24 收口（实施 PR #100；复审修正与收口 PR #101）**；2026-08-24 Current User 裁决授权 C02-WP5（Decision-047，Q1/Q2/Q3 均按推荐方案：因果证据近似接受为基线、候选补丁 reference-only 重实现、单受支持入口 + store 级薄入口证明跨入口等价）；**C02-WP5 经多轮独立复审 PASS 于 2026-08-25 收口，最终实现基线 `9936a1d`（修订记录 1.2.7；实现与收口登记经 PR #102 承载）**；2026-08-25 Current User 裁决授权 C02-WP6（Decision-048，C02 最终综合验收包；R-A 定向变异证据标准 / R-B WP5 新增面纳入对抗矩阵 / R-C Q1-A 近似延续三项裁定固化）；WP6 经独立完整范围复审 PASS（无未解决 P1/P2，PR #103 head `dd5d44f`）于 2026-08-25 由 Current User 裁决**消费最终工作包授权并登记 LOOP-CORE-02 = COMPLETED**（Decision-049；最终基线 merge `06b8d75`；四项完成合同联合证据固化）；H3 与 O-2 归属 C03-B 保持 open；C03、C05 仍未授权）
> 日期：2026-08-20
> 相关决定：Decision-034（C01 收口）、Decision-035（C02 有界规划授权）、Decision-036（C02 规划裁决与 planning handoff 发布授权）、Decision-037（C02-WP1 授权与实施）、Decision-038（C02-WP1 复审通过与收口）、Decision-039（npm test 并发 runner 改造）、Decision-040（C02-WP2 授权与实施）、Decision-041（C02-WP1 重新收口与 C02-WP2 复审通过与收口）、Decision-042（C02-WP3 授权与实施）、Decision-043（C02-WP3 复审通过与收口）、Decision-044（C02-WP3.5 单轨生命周期重基线授权与两项治理裁决）、Decision-045（Skill 收敛映射与非节点通用 Skill 边界）
> 权威依据：
> - [Autonomous Delivery Roadmap](AI-SDLC-Autonomous-Delivery-Roadmap.md) v2.2.3 §4 `LOOP-CORE-02`
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

把需求摘要、技术方案、方案门禁（挑战/澄清/裁决）、任务规划、实现、代码审核和知识同步的当前有效版本组织为可恢复的协调链，使后续节点只消费当前有效事实；发现问题时回到最早受影响节点并使依赖它的下游事实失效。设计深度由 solution-gate 按 LIGHT/STANDARD/DEEP 档位裁决（Decision-044 Q2）；不再存在 Development Path 分流。

### 2.2 Roadmap completion contract

1. 对同一 Requirement 明确分类：新需求、补充、变更、返工、反馈驱动变更；
2. 有效 finding 使受影响下游产物失效，并路由到正确的最早节点；
3. 后续节点只消费当前有效的上游产物版本和 Gate 结论；
4. 中断后可由另一入口或 binding 继续，不重解释已确认事实。

### 2.3 Durable continuity rules

> 2026-08-21 按 Decision-044 单轨裁决重基线为 v2 节点链（requirement-intake → solution-design → solution-gate → task-planning → implementation → code-review → knowledge-sync）；旧节点名映射：tech-design→solution-design，solution-challenge/solution-review→solution-gate，test-validation 退出 LOOP。

| 变化或发现 | 最早受影响节点 | 必需后续动作 |
| --- | --- | --- |
| 业务目标、范围、验收或来源冲突 | `requirement-intake` | 修订需求摘要，重新生成方案并重新 Gate |
| 架构、接口、数据、异常、兼容性或风险缺口 | `solution-design` | 修订技术方案，重新过 solution-gate 并刷新下游边界 |
| 实现错误且不改变已批准行为 | `implementation` | 修复后重新代码审核和知识同步 |
| 代码审核揭示方案缺口 | `solution-design` | 不得只修代码；重新过 solution-gate、任务规划、实现和复核 |
| 线下测试/线上反馈（非 LOOP 节点） | `requirement-intake` | 经 WP1 分类（FEEDBACK_DRIVEN_CHANGE 等）开启新 generation，按分类结果路由最早受影响节点 |
| 设计深度决策失效 | `solution-gate` 或更早受影响节点 | 重新深度裁决并生成当前深度决定 |

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
| Development Path Governance | 三个固定路径、FULL_REQUIREMENT/DELTA_CHANGE、最早节点返工和 stale 规则 | ~~C02 路径决定与变更范围语义来源~~（2026-08-21 失效：Decision-044 取消路径分流，Decision Scope/Delta 隔离与用户 override 语义平移入深度档位模型；该文档群的重写属 WP3.5 后续工作包范围） |

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

`recoverRunContext` 从七能力历史中寻找第一个未完成/可重试节点；已经成功的上游能力没有 supersede/invalidate/generation 语义，`LoopCapabilityEntry` 也拒绝调用非 `nextCapability`。它不能表达"测试发现方案缺口 → 方案节点 generation 2 → 下游全部重新有效化"（2026-08-21 起按 Decision-044：该例中的节点名按 v2 链解读——线下测试反馈经 requirement-intake 新 generation 进入，方案节点为 solution-design，下游为 solution-gate/task-planning/implementation/code-review/knowledge-sync）。

### G5. 设计深度决策未接入 C01 持久链

> 2026-08-21 重基线（Decision-044 Q2）：原"Development Path Decision 未接入持久链"缺口随双轨取消改写——Direct/Speckit/Blocked 三值路径分流不再存在，待接入持久链的是 solution-gate 的设计深度决策（depth = LIGHT/STANDARD/DEEP，decision_status = DECIDED/BLOCKED_UNKNOWN，含 Decision Scope 与 Delta 隔离语义平移）。

原缺口事实保持有效：C01 的 solution-review（现 solution-gate）succeeded event 只保存 Gate 与 generic capability output，没有当前决策、Decision Scope 和失效关系的机器投影。

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
9. **深度决策只有三个档位**：solution-gate 输出的设计深度决策只取 `LIGHT`、`STANDARD`、`DEEP`，`decision_status` 只取 `DECIDED`、`BLOCKED_UNKNOWN`；C02 不创建第四种深度，也不恢复任何 Direct/Speckit 路径分流（2026-08-21 由 Decision-044 Q2 取代原"路径决定三值"不变量；`BLOCKED_UNKNOWN` 不进入实现）。
10. **C01 binding 合同保持**：Re-Gate 可以替换 binding，但不得改变节点输入输出合同或历史执行者快照；节点输入输出合同本身随 WP3.5 链重定义时，须经合同升版而非静默修改（Decision-044）。
11. **不偷渡 Git**：C02 结束于可恢复的 orchestration state；不执行 commit/push/PR/Ready/merge/publication。
12. **迁移原子性**：run store v2→后续格式迁移必须在单事务内完成 schema 校验、数据迁移和 version 落标；失败全部回滚并可幂等重试。
13. **历史格式 fail-closed 且可区分**：canonical 链/格式变更采用声明式 cutover，不做历史语义重写、不建链版本化或永久兼容机器；旧格式 journal 打开必须返回明确的 `UNSUPPORTED_HISTORICAL_FORMAT`，不得伪装为 `STORE_CORRUPT`；cutover 前必须完成受支持范围的持久化 journal preflight，发现真实历史数据即停止并重新裁决（Decision-044 Q1）。

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

- 状态（2026-08-21）：**Accepted / 已重新收口**（Decision-041）；原 Accepted/收口结论（Decision-038）经 Round 3～8 复审发现缺口后重开、不沿用。Round 3 缺口：WP1 可跨 run 重复声明 `NEW_REQUIREMENT`——已修正为跨 run 写入守卫（合同 1.0.1）。Round 4 缺口：守卫以未验证的原始行裁决、`findLatestRequirementChangeByRequirement` 返回尾部 BLOCKED 与合同语义不符——已修正为同事务内验证相关链再裁决、findLatest 只返回最新 CLASSIFIED（合同 1.0.2）。Round 5 缺口：守卫用 `some()` 短路——已修正为逐一完整读验所有相关链（合同 1.0.3）。Round 6 缺口：守卫与恢复查询以未验证的 `loop_runs.requirement_id` 列选择相关 run（篡改该列可把旧 run 从守卫/恢复中隐藏）——已修正为枚举全部 run、经已验证快照路径验证 identity 后按已验证 identity 过滤，覆盖 append、findLatest 与入口恢复负例（合同 1.0.4）。Round 7 缺口：公开读路径把快照验证与明细返回拆在两个事务（事务间隙可被并发连接篡改 identity 绑定，返回脱离已验证快照的数据）——已修正为单事务"验证快照 + 读明细"，内部读取器只接收已验证 requirementId、不再自查表列（合同 1.0.5）。Round 8 缺口：Round 7 的"事务间隙"回归未真正复现 TOCTOU（篡改在公开读调用前已提交，无法区分单/双事务实现）——已重写为确定性屏障回归：屏障在快照验证后、明细读取前经第二连接提交篡改，断言 list/findLatest 返回本事务一致快照、篡改在事务结束后被下一次读取以 `STORE_CORRUPT` 检出；原回归改标为事务开始前篡改 fail-closed（合同 1.0.6，仅证据与表述修正，语义不变）。Round 9 独立复审 PASS（专项 loop-change-classification 132/132、loop-run-store 185/185、loop-run-provenance 79/79、loop-capability-execution 86/86、loop-validation-guards 49/49，`tsc --noEmit`、`git diff --check`、完整 `npm test` 129 文件 1767/0、mutation gate 14/14 杀死 + 3/3 探针；GitHub Actions run 32440818155 四项检查全绿），Current User 裁决重新收口；合同前进 1.1.0 Accepted。授权 `C02_WP1_REQUIREMENT_CHANGE_CLASSIFICATION` 维持已消费。

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

- 状态（2026-08-21）：**Accepted / 已收口**（Decision-041；实施授权 Decision-040）；Round 1 复审 CHANGES_REQUESTED（读回 producer 绑定重验、链非末尾 ACTIVE 规则、测试控制字节）已修正；Round 2 复审 FAIL（H3：写入路径以转换前状态校验候选链）已修正为转换后状态校验 + `supersedeArtifactRevision` 纯函数统一语义；Round 3 复审 CHANGES_REQUESTED（缺失 blob 可判定）已修正为第五项 blob 绑定（合同 0.1.3）；Round 4～6 复审的入口/gateway 接线修正（入口强制同实例绑定、gateway tracing 同实例校验、非虚拟判定与配置冻结，合同 0.1.4～0.1.6）经 Round 8 复审裁定越出 WP2 授权的生产入口接线边界（WP5 范畴），已整体拆出为未提交的 WP5 候选，WP2 仅保留 `LoopRunStoreOptions.artifactStore` 与 store 级 blob 读写校验；Round 7 复审 CHANGES_REQUESTED（公开读路径的快照验证与明细返回拆在两个事务）已修正为单事务化 + 内部读取器只接收已验证 requirementId（合同 0.1.7）；Round 8 复审 CHANGES_REQUESTED（Round 7 的 TOCTOU 回归未复现真正的事务间隙）已修正为确定性屏障回归：屏障在快照验证后、明细读取前经第二连接提交篡改，断言 list/getCurrent 返回本事务一致快照、篡改在事务结束后被下一次读取以 `STORE_CORRUPT` 检出（合同 0.1.8）。store 级端到端 supersede 成功路径覆盖经 Current User 显式重基线，随 C02-WP4 链扩展一并验收。Round 9 独立复审 PASS（专项 loop-artifact-revision 212/212、loop-change-classification 132/132、loop-run-store 185/185、loop-run-provenance 79/79、loop-capability-execution 86/86、loop-validation-guards 49/49，`tsc --noEmit`、`git diff --check`、完整 `npm test` 129 文件 1767/0、mutation gate 14/14 杀死 + 3/3 探针；GitHub Actions run 32440818155 四项检查全绿），Current User 裁决收口；合同前进 1.0.0 Accepted。授权 `C02_WP2_ARTIFACT_REVISION_AUTHORITY` 已消费。

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

- 状态（2026-08-21）：**Accepted / 已收口**（Decision-043；实施授权 Decision-042）；交付 `core/loop-finding-lifecycle.ts`（finding schema、固定状态机、五类路由矩阵绑定、依赖图下游计算、关闭证明与失效范围模型、computeFindingGate 资格推导）与 `core/loop-run-store.ts` v5（`loop_findings` + `loop_finding_invalidations` + `loop_finding_proofs` + `loop_finding_scopes`、appendFinding 同事务失效传播与 scope 落库、resolve/accept/supersede guarded 迁移与证明写删、读回 proof/scope 全量重验、finding 链挂入快照校验）。Round 1 复审 CHANGES_REQUESTED（2 High：关闭证据未绑定当前事实、失效边完整性未持久化比对）已修正（合同 0.1.1）；Round 2 独立复审（codex）全量重审 `8d1d697..fdc6610` PASS 无阻塞，两项 High 关闭均独立复核成立，两条非阻塞回归加固建议（删中间边重编号命中 scope digest 分支、proof/scope 插入点故障回滚与关闭迁移并发竞争矩阵）已落实（专项 303→340/340、回归 185/79/86/132/212、全量 npm test 130 文件 0 失败、`tsc --noEmit` 与 `git diff --check` 通过；GitHub Actions run 32464819692 与 32469000224 四 job 全绿，后者 ci-tests 首跑命中 C01 期 loop-git-workspace 并发 worktree flake、rerun 后通过），Current User 裁决收口；合同前进 1.0.0 Accepted。授权 `C02_WP3_FINDING_LIFECYCLE_AND_INVALIDATION` 已消费。

### C02-WP3.5：Single-Rail Lifecycle Re-baseline

**Material outcome**：canonical 节点链从 v1（含 tech-design/solution-challenge/solution-review/test-validation）受控切换到 v2 单轨七节点链（requirement-intake → solution-design → solution-gate → task-planning → implementation → code-review → knowledge-sync），WP1～WP3 合同条款级升版重基线，双轨路径语义与旧 5 节点执行面退役，WP4～WP6 获得在新链上实施的合同依据。

阶段划分（逐阶段单独授权）：

- **阶段 1：治理登记**（本轮，Decision-044）：Roadmap v2.2.0、本规划 v1.1.0、控制平面 STATE 登记；不含任何代码/Skill/合同实现。
- **阶段 2：只读影响分析与实施规划**（沿用 2026-08-21 WP3.5 原始授权）：输出 A（v1→v2 节点/finding 分类/最早回退节点/artifact 兼容映射）、B（WP4～WP6 重基线/保留/废弃清单）、C（C03 拆分 Single-Rail Skill Delivery）、D（C04 历史兼容内容处置）、E（受影响标准文档/Skill 合同/校验器/registry/安装副本精确改动清单）、F（后续独立授权工作包：先合同、后实现、后真实复杂需求验证）、G（收敛协议与 knowledge-sync 单轨迁移验收场景）；输出后停止等授权。
- **阶段 3 起**：按阶段 2 的 F 清单逐包授权实施。

#### 阶段 2 完整输出（待 Current User 验收）

[C02-WP3.5 单轨生命周期重基线：阶段 2 影响分析与实施规划](LOOP-CORE-C02-WP3.5-SINGLE-RAIL-IMPACT-ANALYSIS.md) 已物化 A～G，包含：

- v1→v2 节点/执行角色、六类 finding、外部反馈入口、最早回退节点和 v2 Artifact Index；
- WP4～WP6 重基线与 C03 Skill/registry/install/Delivery Tail 拆分；
- C04 active standards 和 v5 journal 声明式 cutover；
- 受影响文档、runtime、旧执行面、Skill、安装副本和测试的精确清单；
- 十个逐包授权边界，以及 solution-gate/code-review 收敛协议和 knowledge-sync 验收场景。

该文档当前状态为 `DRAFT FOR CURRENT USER REVIEW`。内容已补全不等于阶段 2 已被接受，更不构成阶段 3、WP4～WP6、C03、C05、CP/PKB 同步或 Git 发布授权。

#### 阶段 2 输出 C：Skill 收敛映射（Decision-045）

最终 Skill 拓扑为七个 canonical 节点 Skill，加一个不拥有 LOOP 生命周期状态的 `non-node utility skill`：`sdlc-docflow-writer`。表中“合并”表示能力迁入目标 Skill，并在替代合同、调用方、registry、校验器和安装副本完成切换后退役旧 Skill 包；不允许先删除旧包再补能力。

| 现有 Skill | 最终归属 | 处置与保留语义 |
| --- | --- | --- |
| `sdlc-requirement-normalizer` | `sdlc-requirement-intake` | 合并为需求归一化与来源冲突处理主能力。 |
| `sdlc-test-feedback-classifier` | `sdlc-requirement-intake` | 合并为测试/线上反馈的新输入分类；反馈开启新 generation，`05-测试验收` 不再是 LOOP 节点。 |
| `sdlc-specification-writer` | `sdlc-solution-design` | 合并为方案内容生成主能力。 |
| `sdlc-speckit-specify` | `sdlc-solution-design` | 只保留结构化映射与可追溯性能力；删除独立 `specs/{feature}/spec.md` 投影轨道。 |
| `sdlc-speckit-plan` | `sdlc-solution-design` | 合并为按 LIGHT/STANDARD/DEEP 深度生成技术深化内容；删除独立 Speckit `plan.md` 轨道。 |
| `sdlc-solution-challenger` | `sdlc-solution-gate` | 合并为对抗扫描与首轮 Finding Ledger 能力；不得作正式 Gate 裁决。 |
| `sdlc-solution-reviewer` | `sdlc-solution-gate` | 合并为正式 Gate 与深度档位裁决；删除 Direct/Speckit 路径决定。 |
| `sdlc-speckit-clarify` | `sdlc-solution-gate` | 合并为正式裁决前的残余澄清与一致性检查。 |
| `sdlc-speckit-tasks` | `sdlc-task-planning` | 合并为任务拆解主能力。 |
| `sdlc-speckit-analyze` | `sdlc-task-planning` | 合并为实现前跨产物一致性审计。 |
| `sdlc-speckit-checklist` | `sdlc-task-planning` / `sdlc-implementation` 内部校验 | 不再独立拥有节点；按阶段作为可追溯 checklist 校验能力被节点调用。 |
| `sdlc-speckit-implement` | `sdlc-implementation` | 合并为受约束实现主能力。 |
| `sdlc-implementation-recorder` | `sdlc-implementation` | 合并为证据记录能力；完成声明必须引用 diff、测试输出或 journal 事件。 |
| `sdlc-code-review-excellence` | `sdlc-code-review` | 合并为实际代码审查与 finding 发现能力。 |
| `sdlc-code-review-normalizer` | `sdlc-code-review` | 合并为 Finding Ledger 归一化、正式报告与 closure review 能力。 |
| `sdlc-speckit-sync` | `sdlc-knowledge-sync` | 合并为稳定事实筛选与知识写入能力；删除 dual-rail、sync source mode 与 specs-run 语义。 |
| `sdlc-speckit-code-doc-reconcile` | `sdlc-knowledge-sync` | 合并为代码、library 工件与长期知识的 Reconcile 能力。 |
| `sdlc-test-feedback-sync` | `sdlc-knowledge-sync` | 只承接已验证、可复用的 checklist/schema/知识改进；原始反馈及需求变化仍从 requirement-intake 重入。 |
| `sdlc-docflow-writer` | 保留为 `non-node utility skill` | 保留独立 Skill 身份，可在非 DocFlow/非 LOOP 场景生成 Markdown、HTML、飞书等文档；在 LOOP 内只负责渲染、落盘和发布节点已确认内容，不注册 node capability，不裁决 Gate、不关闭 finding、不推进 generation。 |
| `sdlc-gate-runner` | 删除；能力拆分迁移 | 确定性节点准入迁入 LOOP runtime；专业内容判断归各节点 Skill；`development_path_entry` 删除；治理尾部完成检查迁入 C03 Delivery Tail/checkpoint；不保留手动调用 Skill。 |
| `sdlc-speckit-pipeline` | 删除；编排迁移 | activation、阶段停靠、暂停/恢复与 Re-Gate 编排由 LOOP runtime 承接，不保留 Speckit pipeline 或路径分流。 |

`sdlc-solution-gate` 虽为一个 canonical 节点 Skill，其对抗扫描与正式裁决仍必须由不同 Agent binding 执行。`sdlc-docflow-writer` 的保留不改变“每个 LOOP 节点只有一个 canonical Skill”：该约束不禁止无节点状态、无流程权威的通用辅助 Skill。

范围（阶段 3 起的实施边界，由阶段 2 细化）：

- canonical 链 v2 定义与全部硬编码镜像（Gate 二元划分、类别绑定、首节点、相邻推进、binding 矩阵）的同步切换；
- WP2/WP3 Accepted 合同条款级升版（路由矩阵、canonical 依赖图、Gate 绑定、Manifest Index 映射）；WP1 合同原位保留，仅确认交叉引用；
- 声明式 cutover：旧格式 journal 打开返回 `UNSUPPORTED_HISTORICAL_FORMAT`（不得伪装为 `STORE_CORRUPT`）；cutover 前执行受支持范围持久化 journal preflight，发现真实 v5 journal 即停止并重新申请裁决，不得自动降级（不变量 13）；
- 设计深度决策模型落地（depth LIGHT/STANDARD/DEEP + decision_status DECIDED/BLOCKED_UNKNOWN，solution-gate 唯一裁决点）取代 Development Path Decision；
- solution-gate/code-review 收敛协议合同化（Finding Ledger、closure review、新 finding 举证责任、轮次耗尽升级裁决）；solution-gate 对抗扫描与裁决的绑定级分离；
- 旧 5 节点执行面（`loop/registry/node_map.ts`、`sdlc_graph`、runtime-capability-map 桥接）退役；
- Skill 收敛映射登记（含 sdlc-requirement-normalizer → requirement-intake 载体、sdlc-specification-writer → solution-design 的显式归属）；pipeline 删除后编排职责由 LOOP runtime 接管；implementation 合并 recorder 后的证据生成约束；
- knowledge-sync 单轨化：library 工件 + LOOP artifact revision 为 Reconcile 单一对账基准；sync source mode 文档重写为单模式。

验收：链切换后默认 npm test/typecheck/standards 全绿；旧格式打开报 `UNSUPPORTED_HISTORICAL_FORMAT` 负例；preflight 记录归档；WP1～WP3 既有测试在新链定义下等价通过（允许按新链重基线断言，不允许削弱）；收敛协议与 knowledge-sync 迁移验收场景（阶段 2 输出 G）全部可执行。

明确排除：治理登记与影响分析阶段不含任何 runtime 代码、Skill、合同实现、registry、安装副本、Git 发布；实施阶段不恢复 Direct/Speckit 分流，不重写历史 journal。

- 状态（2026-08-22）：**阶段 1 治理登记已完成（Decision-044）**；**阶段 2 输出 A～G 已获 Current User 验收**（2026-08-22，PR #93 合入 `491c0e2`，控制平面登记 `C02_WP3_5_STAGE_2_ACCEPTED`）；Decision-045 登记 21 Skill 收敛映射；控制平面已登记 `C02_WP3_5_STAGE_3_IMPLEMENTATION` 授权（`AUTHORIZED_NOT_STARTED_RESERVED_FOR_NEXT_AGENT`）。阶段 3 自 WP3.5-A（合同重基线：E1 文档、machine projection、测试断言）起逐包实施；WP4～WP6、C03、C05 仍未授权。
- WP3.5-A Round 2 复审（2026-08-22）：结论 **FAIL，5 项 High 不全部关闭**。H1（canonical earliest node 强制校验）、H4（两合同头部 2.0.0 Draft）、H5（首轮 intake → solution-design → solution-gate 循环准入解除）经独立复审确认关闭；H2（stablePath 仅做字符串包含校验）本轮已修复：`validateLoopArtifactRevision` 改为纯逻辑路径结构校验（固定 `library/{requirementId}/{canonical目录段}/…` 形态，拒绝绝对路径、空段、`.`/`..`、反斜杠与错误 requirementId），并覆盖创建、读回（rehash 篡改 STORE_CORRUPT）与 Manifest 交叉绑定负例；默认门禁全绿（npm test 130 文件 1767/1767、`tsc --noEmit`、5 个 Ruby 校验器）。**H3 保持 open**：`manifest.yaml` 仍公开注册 `sdlc-speckit-pipeline`/`sdlc-speckit-sync`，其包内引用已删除的合同文件（library-driven-sync-runtime.md、speckit-project-bootstrap.md 等）形成中间态断链；按裁决不在 WP3.5-A 内偷偷修复 Skill，待 C03-B 原子 registry cutover（新包可用 → registry 切换 → 旧包及其依赖删除）统一处置——H3 关闭前 **WP3.5-A 不得收口**。
- WP3.5-A Round 2 复审跟进（2026-08-22）：**H2 修复经独立复审通过，标记关闭**——实现（`core/loop-artifact-revision.ts`）与合同（`ai-sdlc/loop-artifact-revision.md`）一致；独立复现 `03-任务规划/../01-技术方案/escape.md` 返回 INVALID_INPUT，规范路径通过；创建、读回、Manifest 交叉绑定与 journal current 全部拒绝穿越、外来 requirementId、空段、点段、绝对路径与反斜杠。复审未发现新的 Critical/High。根因归并：节点产物与失效起点过去由调用方自由表达、缺少单一 canonical authority（H1/H2 已由固定映射 + 写入/读回/交叉绑定校验消除）；文档代码退役与公开 Skill 注册切换不在同一原子边界（H3 属 C03-B 切换治理问题，不得扩大为 WP3.5-A 内临时补丁）。**裁决维持：WP3.5-A 不收口，唯一阻塞项为保持 open 的 H3**；专项复跑 artifact revision 245/245、finding 359/359、node capability 165/165、capability execution 86/86。下一有效边界是执行并独立复审 C03-B 原子切换，届时再做活动路径残留扫描与真实入口可调用性验证；C03 当前仍未授权。
- **WP3.5-B 收口（2026-08-22，Current User 裁决；PR #95/#96/#97，merge `406b77b`）**：实施（PR #95 合入 `0bf6a79`）经独立复审 Round 1 FAIL（H1 Finding Ledger 语义绑定降级为可选标量、H2 preflight 候选枚举与 LOOP 表目录不完整）→ 修正 PR #96 合入 `870ea9a`（event schema v3 + consumedFindings 绑定 + appendFinding 三重守卫；共用 15 表目录 + magic header 枚举）→ Round 2 复审 FAIL（H2 关闭确认，H1 残留：Ledger 仅在 started 瞬间绑定）→ Round 2 修正 PR #97 合入 `406b77b`（`sameAttemptIdentity` 与 failed-to-retry 对比固定 consumedFindingsRef/Digest，Ledger attempt 不可变，持久化行交换在链校验报 STORE_CORRUPT；回归矩阵 13/13 先失败后通过）→ **Round 3 复审 PASS，无 Critical/High/Medium/Low，H1 关闭**。收口发布：Exchange run `20260822T141129Z`、PKB `9545905`、CP 登记。合同推论随收口登记：finding 绑定自身 ACTIVE current 且 append 即失效 ⇒ RESOLVED 正向关闭流程以重建 current 为前提、属 WP4 Re-Gate 编排权威，B 层仅保留 fail-closed 守卫。H3 不受影响。
- **WP3.5-C 收口（2026-08-23，Current User 裁决；PR #98，merge `28a44fa`）**：runtime cutover 实施（`182d8ab`：v2 单轨 runner 经八执行点派发、47 文件旧五节点面退役且无兼容层、默认 scan=codex / verdict=hermes 双 Agent registry、shadow gateway 持久化 scan Ledger；CI 修复 `94bcd1e`）→ Round 1 复审 FAIL（H1 黑名单式而非闭合输入合同）→ 修正 `bfa8334`（六键 option allowlist + journal 写前 node===type 双 canonical 校验）→ **Round 2 复审 PASS，H1 经独立复现验证关闭，M1 登记为非阻塞**。收口发布：Exchange run `20260822T163337Z`、PKB `31c944d`、CP 登记。下一有效转换为 C02-WP4 授权；WP3.5-A 的 H3 保持 open 归属 C03-B，不因 B/C 收口改变。

### C02-WP4：Earliest-Affected-Node Re-Gate Orchestration

> 2026-08-21 按 Decision-044 重基线到 v2 单轨链；实施前须先完成 C02-WP3.5 相应阶段。

**Material outcome**：协调器依据 change/finding 和 current dependency graph 选择唯一最早节点，创建新 generation 的 Re-Gate 计划并逐节点恢复资格。

范围：

- 固化最早节点路由矩阵及冲突优先级；多个 finding 取 canonical chain（v2）中最早节点；
- 新 generation 从最早节点开始，上游未受影响 confirmed revisions 只读复用，下游必须重建/重新 Gate；
- 接入 `solution-gate` 与设计深度决策（depth LIGHT/STANDARD/DEEP + decision_status DECIDED/BLOCKED_UNKNOWN，Decision Scope/Delta 隔离语义平移）；
- 后续 dispatch 的输入由 orchestration context 生成，调用方不得绕过 current pointers 自选历史 artifact；
- 深度决策必须绑定当前 solution-gate revision 和 Gate；`BLOCKED_UNKNOWN` 不进入实现；
- 收敛协议落地：solution-gate/code-review 首轮 Finding Ledger + 后续 closure review，新 finding 须证明由本次修复直接引入，轮次耗尽升级业务裁决/风险接受/范围重置；
- 线下测试/线上反馈经 requirement-intake 分类（WP1 change 路径）开启新 generation，不再经 test-validation 节点回流；
- bounded retry、pause、blocked、failed 保持 C01 durable attempt 语义。

验收：至少覆盖 requirement→全链、solution-design→门禁/任务规划/下游、implementation→code-review/knowledge-sync 三种回流；代码审核或线下测试反馈揭示方案缺口必须回 solution-design（线下测试经 requirement-intake 新 generation）；stale Gate/深度决策不能放行；收敛协议举证与轮次耗尽升级路径有正反例。

明确排除：真实实现引擎和目标仓库 Git 操作。

### C02-WP5：Cross-Entry Recovery and Production Wiring

> 2026-08-21 按 Decision-044 重基线到 v2 单轨链；WP2 Round 8 拆出的入口/gateway 接线候选补丁（`temp/wp5-candidate-entry-wiring.patch`）仍归本 WP 授权范围，并须在 v2 链定义下重新核对。

**Material outcome**：首个受支持入口和 Gateway 真正消费 C02 orchestration authority，在进程中断、binding 替换或另一入口接管后继续同一 generation/next boundary。

范围：

- 扩展恢复上下文：change record、generation、current artifact map、current Gates、open findings、invalidated revisions、设计深度决策、next capability/eligibility（节点集合为 v2 链，含 task-planning/knowledge-sync 的恢复语义）；
- 入口从恢复结果取得 dispatch command，不接受调用方自选非当前节点；
- claim 前再次验证 current pointers，terminal 写入时 CAS 防止并发变更将旧输出提升为 current；
- 复用 C01 interrupted-attempt 关闭语义，保留历史 binding/executor/lineage；
- 至少一个入口覆盖 fresh、supplement/change、finding Re-Gate、process restart 和 binding replacement。

验收：中断前后不重解释 confirmed facts；旧进程晚到结果不能覆盖新 generation；不同入口恢复出相同 current facts 和唯一 next action。

明确排除：C03 实际单仓交付、C05 真实业务验收。

- 状态（2026-08-24）：**已授权实施**（Decision-047；授权标识 `C02_WP5_CROSS_ENTRY_RECOVERY_AND_PRODUCTION_WIRING`，控制平面 `AUTHORIZED_NOT_STARTED_RESERVED_FOR_NEXT_AGENT`）。三项边界裁决均按申请草案推荐方案：Q1-A 因果证据 revision-generation 近似接受为 WP5/WP6 验收基线（精确字段留后续独立裁决）；Q2-A 候选补丁 `temp/wp5-candidate-entry-wiring.patch` 仅作参考，条款 0.1.4～0.1.6 按当前 HEAD 在 v2 链下重新实现、复审整包对照合同条款；Q3-A 本包只接线一个受支持生产入口，跨入口等价由 store 级薄入口证明。Skill 隔离前置承接 WP4 收口登记：canonical 入口在 gateway 前拒绝/剥离 skill/flowId，gateway 对 canonical dispatch 不读 skill registry，fail-open 仅限 legacy 非 C02 请求。H3 归属 C03-B 保持 open。

### C02-WP6：Validation Guards and Completion Acceptance

> 2026-08-21 按 Decision-044 重基线到 v2 单轨链与深度档位模型。

**Material outcome**：用生产路径对抗测试证明 C02 四项完成合同，而不是只验证 helper 或文档矩阵。

范围：

- schema 固定字段、plain-data/Proxy/accessor/Symbol/额外字段边界；
- run store 格式迁移、corruption、回滚、并发/CAS；
- change classification、artifact revision、finding lifecycle、失效传播、Re-Gate、跨入口恢复端到端矩阵（场景按 v2 链枚举，含 task-planning/knowledge-sync）；
- stale artifact/Gate/深度决策、旧 generation late result、伪造 finding close、手工选择历史输入全部 fail-closed；
- 历史格式兼容负例：v1 及更早格式 journal 打开返回 `UNSUPPORTED_HISTORICAL_FORMAT` 而非 `STORE_CORRUPT`（不变量 13）；cutover preflight 程序有执行记录；
- 收敛协议对抗矩阵：首轮 Finding Ledger 完整性、closure review 只审关闭、新 finding 举证失败拒绝、轮次耗尽升级；
- 默认 `npm test`、typecheck、standards、mutation/相关 CI 接入；
- 独立完整范围复审，不以实施方报告代替。

验收：C02 completion contract 1～4 均有生产路径正例、负例和恢复例；无未解决 P1/P2 后才允许消费最终工作包授权并收口 C02。

- 状态（2026-08-25）：**已收口 / CLOSED**（Round 1 独立完整范围复审 PASS——S1～S9 四项完成合同逐项 PROVEN、无未解决 P1/P2、观察项 O-1/O-3 随收口修正 `dd5d44f`、O-2 范围外披露移交 C03-B）。Current User 终局裁决（Decision-049）：消费 `C02_WP6_VALIDATION_GUARDS_AND_COMPLETION_ACCEPTANCE`，登记 **LOOP-CORE-02 = COMPLETED**，最终基线 PR #103 merge `06b8d75`。C02 收口不自动授权 C03。

## 7. 工作包依赖与执行顺序

```text
C02-WP1 Change Classification ───────────────┐
                                              ├─> C02-WP3.5 Single-Rail Re-baseline ─> C02-WP4 Re-Gate Orchestration
C02-WP2 Artifact Revision Authority ─> WP3 ──┘                                                  │
                                                                                                v
                                                                              C02-WP5 Recovery + Production Wiring
                                                                                                │
                                                                                                v
                                                                              C02-WP6 Guards + Completion Acceptance
```

- WP1 与 WP2 可在各自 schema 定案后并行设计，但实施授权仍逐 WP 发放；
- WP3 依赖 WP2 的 canonical revision/dependency model；
- WP3.5 依赖 WP1～WP3 已收口的合同基线（其条款级升版属 WP3.5 实施范围），按阶段单独授权（Decision-044）；
- WP4 依赖 WP1～WP3 与 WP3.5 的 v2 链重基线；
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

- C03 的真实单仓交付、workspace 修改和 Manual Git Handoff；
- C04 已取消（Decision-044）：Speckit SDD 投影与 pipeline 接线永久退出 Core 范围，独立 Speckit 产物轨道不恢复；
- C05 的真实单仓需求 Core MVP 验收；
- 自动 commit、push、Draft PR、Ready、merge、发布；
- 新 Agent Provider 或 Kimi/Hermes 默认启用；
- 多仓事务、队列、daemon、UI、服务化、HA/SLO；
- Roadmap/任务数据库、第二份 Manifest schema 或以聊天摘要作为 current authority；
- 重写/清理 C01 历史 attempt、artifact 或 binding snapshot；
- 历史 journal 的语义重写、链版本化或永久兼容机器（Decision-044 Q1）。

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
- 只有 WP1～WP3.5、WP4～WP6 全部收口且四项完成合同均有联合证据，才能登记 `LOOP-CORE-02 = COMPLETED`；
- C02 收口不自动授权 C03。

## Revision Record

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 0.1.0 | 2026-08-20 | Draft for user review | 基于 C01 收口事实、Roadmap C02 完成合同和当前 Source 复用审计，提出六个有界工作包、设计不变量、验收映射与实施排除。 |
| 1.0.0 | 2026-08-20 | Accepted | Current User 裁决接受全部六个裁决点（Decision-036），规划成为正式合同；实施仍逐 WP 单独授权。 |
| 1.0.1 | 2026-08-20 | Accepted | 登记 C02-WP1 Round 2 复审通过与收口（Decision-038）；C02 四项完成合同保持 INCOMPLETE，WP2～WP6 保持未授权。 |
| 1.0.2 | 2026-08-21 | Accepted | 登记 C02-WP1 重开后经 Round 9 复审 PASS 重新收口与 C02-WP2 Round 9 复审通过与收口（Decision-041）；C02 四项完成合同保持 INCOMPLETE，WP3～WP6 保持未授权。 |
| 1.0.3 | 2026-08-21 | Accepted | 登记 C02-WP3 Round 2 复审 PASS 与收口（Decision-043）；C02 四项完成合同保持 INCOMPLETE，WP4～WP6 保持未授权。 |
| 1.1.0 | 2026-08-21 | Accepted | 按 Decision-044 单轨裁决重基线：§2.1/§2.3 节点链与连续性规则切换到 v2 单轨链；§4 G5 改写为设计深度决策缺口；§5 不变量 9 由路径三值改为深度档位、不变量 10 补合同升版约束、新增不变量 13（历史格式 fail-closed 可区分 + cutover preflight）；§6 插入 C02-WP3.5（Single-Rail Lifecycle Re-baseline，三阶段划分）并重基线 WP4～WP6；§7 依赖图插入 WP3.5；§9 登记 C04 取消与历史兼容机器不做。WP1～WP3 收口结论保持有效；WP3.5 实施与 WP4～WP6 保持未授权。 |
| 1.1.1 | 2026-08-22 | Accepted | 按 Decision-045 登记 WP3.5 阶段 2 输出 C 的完整 21 Skill 收敛映射：七个 canonical 节点 Skill + 一个非节点通用 Skill `sdlc-docflow-writer`；`sdlc-gate-runner` 与 `sdlc-speckit-pipeline` 退役删除并迁移必要能力。阶段 2 其余 A、B、D～G 与任何实现仍未因此获得授权。 |
| 1.2.0 | 2026-08-22 | Accepted baseline / Stage 2 draft pending review | 物化 WP3.5 阶段 2 输出 A～G 的独立实施规划，补齐节点/角色/finding/artifact、WP4～WP6、C03/C04、精确改动面、逐包授权与收敛/knowledge-sync 场景；只登记待审规划，不接受其内容，不授权实施。 |
| 1.2.1 | 2026-08-22 | Accepted | 登记 WP3.5 阶段 2 验收（2026-08-22 Current User，PR #93 合入 491c0e2）与阶段 3 实施授权（`C02_WP3_5_STAGE_3_IMPLEMENTATION`，AUTHORIZED_NOT_STARTED）；阶段 3 按影响分析 §8 F 自 WP3.5-A 起逐包实施，WP4～WP6 保持未授权。 |
| 1.2.2 | 2026-08-22 | Round 2 registered / H3 open | 登记 WP3.5-A Round 2 复审（FAIL）及其跟进：H1/H4/H5 确认关闭；**H2 stablePath 结构校验修复经复审关闭**；H3 保持 open——公开注册旧 Skill 引用已删除合同文件构成中间态断链，属 C03-B 原子 registry cutover 的切换治理问题，不得在 WP3.5-A 内打临时补丁；H3 关闭前 WP3.5-A 不得收口，下一有效边界为执行并独立复审 C03-B。 |
| 1.2.3 | 2026-08-22 | Accepted | 登记 **WP3.5-B 收口**（Current User 裁决）：实施 PR #95 → Round 1 复审 FAIL（H1/H2）→ 修正 PR #96 → Round 2 复审 FAIL（H1 残留 attempt 绑定）→ 修正 PR #97（Ledger attempt 不可变）→ Round 3 复审 PASS 无残留 finding，H1/H2 关闭；merge `406b77b`。合同推论随收口登记：RESOLVED 正向关闭以重建 current 为前提、属 WP4 编排权威。H3 不受影响。 |
| 1.2.4 | 2026-08-23 | Accepted | 登记 **WP3.5-C 收口**（Current User 裁决）：runtime cutover 实施 + Round 1 复审 FAIL（H1 黑名单式输入合同）→ 修正 bfa8334（闭合输入合同：六键 allowlist + node===type 双 canonical 校验）→ Round 2 复审 PASS，H1 关闭、M1 非阻塞登记；PR #98 merge `28a44fa`。下一有效转换为 C02-WP4 授权；WP4～WP6、C03、C05 保持未授权；WP3.5-A 的 H3 归属 C03-B、保持 open。 |
| 1.2.5 | 2026-08-24 | Accepted | 登记 **C02-WP4 收口**（Current User 裁决）：实施 PR #100（merge `8e7839af`）→ 独立复审修正链 `c1ecd8a..ee83381`（H1 深度裁决物化于 verdict 事件 schema v4、H2 finding 直连因果证据与 decision-scope 精确绑定、H3 run 级 generation 权威、H4/M 轮次预算计数持久波次+显式 release 路径、F1-F5 默认路径决策完整性/重放不变量生成/原子轮次许可、v7 preflight、B1-B3）→ F2-1 终局修正 `6137afd`（pending revision 窗口收口为 started-append 同事务不变量；supported entry 快速失败；`materializeProducerRevision` 导出为唯一物化推导）→ **终局复审 PASS 无 Critical/High/Medium/Low**。验证：`tsc --noEmit` 干净、npm test 1767 passed/127 files、dispatch-window 49 / decision-delta 24 / capability-execution 104 / finding-lifecycle 350 / artifact-revision 236 assertions。范围裁定：无需求偏离与过度设计；非阻塞建议（pending 窗口内 started 幂等重放顺序断言）已随收口补齐。下一有效转换为 C02-WP5 授权申请（其 skill-isolation 审计前置结论已登记于控制平面）；H3 归属 C03-B 保持 open。 |
| 1.2.6 | 2026-08-24 | Accepted | 登记 **C02-WP5 授权**（Current User 裁决，Decision-047）：授权标识 `C02_WP5_CROSS_ENTRY_RECOVERY_AND_PRODUCTION_WIRING`，范围＝规划 §6 WP5 + 影响分析 §8 F row 5 + WP2 Round 8 拆出条款 0.1.4～0.1.6 重落地 + WP4 收口遗留 skill 隔离前置承接。三项裁决均按申请草案推荐方案——Q1-A 因果证据 revision-generation 近似接受为验收基线（精确字段留后续独立裁决）；Q2-A 候选补丁仅作参考、按当前 HEAD 重实现并整包对照合同条款复审；Q3-A 单受支持生产入口 + store 级薄入口证明跨入口等价。授权未消费；C02 四项完成合同保持 INCOMPLETE；WP6、C03、C05 保持未授权；H3 归属 C03-B 保持 open。 |
| 1.2.7 | 2026-08-25 | Accepted | 登记 **C02-WP5 收口**（Current User 裁决）：cross-entry recovery & production wiring 经多轮独立复审收口——Round1 FAIL 后修正（`86ca3a7..a34dd0c`：resume lease fencing、closed provenance validator、three-axis zero-effect oracle）、Round3 B1/B2 修正 `a34dd0c`、Round4 R4-H1/H2 修正 `3c81363`（canonical-path lease identity、事件级闭合 provenance union、created-run 兼容）、Round5 R5-H1/H2 修正 `d39b4fa`（悬空 symlink 租约身份收敛、ensureRunStarted 成为 created→running 唯一事务仲裁原语）、Round6 R6-H1 修正 `9936a1d`（lstat/readlink 有界错误面：>16 跳与环统一本仓 STORE_FAILURE、缺失父目录原生 ENOENT 双拼写一致且零副作用）。**Current User 终局裁决：以 `9936a1d` 为 WP5 最终实现基线，判定 PASS——R6-H1 CLOSED、R5-H2 CLOSED、R4-L1 CLOSED、无阻塞项**；超出冻结合同的"完整 POSIX component walker／目录链全局 hop 预算／symlink+.. 泛化"被明确撤回，不属于 WP5。验证（`9936a1d` 树）：npm test 128 files 1767 passed / 0 failed；WP5 专项 175 assertions；dispatch-window 49；tsc --noEmit 干净；standards Ruby 校验全过；CI run 32740623445 / 32745516949 四项全绿。交付面：跨进程 resume lease 物理身份 fencing、bootstrap provenance 闭合 union 与 first-writer-wins、created-only 跨入口兼容、store 级薄入口跨入口等价（Q3-A）、wiring 条款 0.1.4～0.1.6、canonical 路径 skill isolation fail-closed。下一有效转换为 C02-WP6 授权申请（未授权）；H3 归属 C03-B 保持 open。 |
| 1.3.0 | 2026-08-25 | Accepted | 登记 **C02-WP6 授权**（Current User 裁决，Decision-048）：授权标识 `C02_WP6_VALIDATION_GUARDS_AND_COMPLETION_ACCEPTANCE`，范围＝规划 §6 WP6 全量对抗验证 + 影响分析 §8 F row 6 + 三项延续裁定（R-A 定向变异证据标准、R-B WP5 新增面纳入对抗矩阵、R-C Q1-A 近似延续）。本包为 C02 最终综合验收包——独立完整范围复审 PASS 且无未解决 P1/P2 后消费授权并登记 LOOP-CORE-02=COMPLETED；C02 收口不自动授权 C03。H3 归属 C03-B 保持 open；WP6 实施保持未启动；C03、C05 保持未授权。 |
| 1.4.0 | 2026-08-25 | Accepted | 登记 **C02-WP6 收口与 LOOP-CORE-02 = COMPLETED**（Current User 终局裁决，Decision-049）：WP6 Round 1 独立完整范围复审 PASS（S1～S9 四项完成合同逐项 PROVEN；FAIL-verdict 物化缺口修复最小性成立；观察项 O-1/O-3 修正 `dd5d44f`、O-2 披露移交 C03-B）；消费 `C02_WP6_VALIDATION_GUARDS_AND_COMPLETION_ACCEPTANCE`；最终基线 PR #103 merge `06b8d75`。§12 收口条件全部满足：WP1～WP3.5、WP4～WP6 全部收口且四项完成合同均有联合证据。**LOOP-CORE-02 = COMPLETED**；H3 与 O-2 归属 C03-B 保持 open；C03 授权申请为下一有效转换但未被授权；C05 未授权。本规划就此完成历史使命。 |
