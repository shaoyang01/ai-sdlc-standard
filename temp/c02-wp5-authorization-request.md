# C02-WP5 授权申请：Cross-Entry Recovery and Production Wiring

> 状态：**ACCEPTED BY CURRENT USER（2026-08-24）**——三项裁决点全部采纳推荐方案（Q1-A/Q2-A/Q3-A），已登记为 Decision-047 与控制平面授权 `C02_WP5_CROSS_ENTRY_RECOVERY_AND_PRODUCTION_WIRING`；本文件转为授权边界的历史依据，不再是待审草案。
>
> 裁决记录（2026-08-24）：Current User 指示「都按推荐方案来」，§4 Q1/Q2/Q3 全部按推荐选项成立。授权后登记动作 §7 已执行：Decision-047 创建、控制平面条目与 Gate 消费登记、规划文档 rev 1.2.6。
> 日期：2026-08-24
> 申请授权标识：`C02_WP5_CROSS_ENTRY_RECOVERY_AND_PRODUCTION_WIRING`
> 当前 Gate：`LOOP_CORE_C02_WP5_ENTRY_AUTHORIZATION_GATE`；控制平面 `route_state = C02_WP4_CLOSED_AWAITING_NEXT_PACKAGE_AUTHORIZATION`

## 1. 申请事项与基线事实

申请 Current User 单独授权实施 C02-WP5（跨入口恢复与生产入口接线），并确认本文件 §2 范围、§4 裁决结论、§5 验收与 §6 排除作为该授权的合同边界。

基线事实：

- C02 规划 rev **1.2.5 Accepted**（docs/LOOP-CORE-C02-PLAN.md）；WP5 范围定义见规划 §6，依赖顺序见 §7（WP5 依赖 WP4 的唯一 next-action 语义）。
- **C02-WP4 已于 2026-08-24 收口**：实施 PR #100 → 独立复审修正链 `c1ecd8a..ee83381` → F2-1 终局修正 `6137afd` → 终局复审 PASS 无 Critical/High/Medium/Low；收口登记 PR #101 merge `86ca3a7`。授权 `C02_WP4_REGATE_ORCHESTRATION` 已消费。
- 控制平面已登记：WP4/WP5 联合只读 skill-isolation 审计结论 **CONDITIONAL PASS**，其前置条件随 WP4 授权条目持久化；其中第（2）项明确标注 **REMAINING FOR WP5**（canonical 入口 skill 剥离 + gateway skill-registry 解耦）。
- WP2 Round 8 复审裁定越界的入口/gateway 接线修正（合同条款 0.1.4～0.1.6）整体拆出为未提交候选补丁 `temp/wp5-candidate-entry-wiring.patch`（401 行，触及 `core/loop-capability-entry.ts`、`core/loop-run-store.ts`、`execution/gateway.ts` 及两个测试文件），归本包授权范围，**须在 v2 单轨链下重新核对**（规划 §6 WP5 边界注记）。
- H3（公开注册旧 Skill 断链）保持 open，归属 C03-B 原子 registry/install cutover，不随本包转移。

## 2. 授权范围

### 2.1 恢复上下文扩展（规划 §6 WP5 第 1 项）

恢复上下文在 v2 七节点链（requirement-intake → solution-design → solution-gate → task-planning → implementation → code-review → knowledge-sync）上补齐 G6 缺口：

- change record（WP1 分类）、orchestration generation（WP4 run 级权威）、current artifact map（WP2 current pointer）、current Gates、open findings、invalidated/superseded revisions、设计深度决策（LIGHT/STANDARD/DEEP + DECIDED/BLOCKED_UNKNOWN，WP4 verdict schema v4）、next capability 与 eligibility；
- 含 task-planning / knowledge-sync 的恢复语义（v2 链新增节点不得成为恢复盲区）。

### 2.2 入口调度权威与并发安全（第 2～3 项）

- 受支持入口只能从恢复结果取得 dispatch command，调用方不得自选非当前节点；
- claim 前再次验证 current pointers；
- terminal 写入 CAS：进程中断 / binding 替换 / 另一入口接管后，旧 generation 的晚到结果一律 fail-closed，不得提升为 current。

### 2.3 中断语义与 lineage 保留（第 4 项）

复用 C01 interrupted-attempt 关闭语义；保留历史 binding / executor / lineage 快照，不重写历史。

### 2.4 首个受支持生产入口接线（Material outcome 本体）

首个受支持入口与 Gateway 真正消费 C02 orchestration authority：

- 承接 WP2 Round 8 拆出的合同条款 0.1.4～0.1.6：入口强制同实例 `LoopArtifactStore` 绑定、gateway tracing 同实例校验、非虚拟判定与配置冻结；
- 候选补丁 `temp/wp5-candidate-entry-wiring.patch` 的处置方式按 §4 Q2 裁决执行。

### 2.5 Skill 隔离前置（WP4 收口遗留，控制平面已登记）

- canonical capability entry 必须在进入 gateway 前**拒绝或剥离** skill/flowId 元数据；
- 验证 gateway 对 canonical dispatch 不再读取 skill registry；
- fail-open 仅保留给 legacy 非 C02 请求；canonical 入口**不承诺 fail-open**；
- 以正反例测试固定（伪造 skill runtime option 拒绝、with-skill / without-skill 恢复出相同 next action）。

### 2.6 场景覆盖（第 5 项）

至少一个受支持入口覆盖：fresh 启动、supplement/change、finding Re-Gate、process restart、binding replacement 五类场景（正例与恢复例）。

## 3. 前置条件承接（不重新裁决）

以下结论已在控制平面/规划中登记，本申请直接承接、不重开：

1. WP4/WP5 skill-isolation 审计 CONDITIONAL PASS 及其全部前置条件；
2. WP3.5-B 收口合同推论（RESOLVED 正向关闭以重建 current 为前提）已在 WP4 落地，WP5 只做恢复路径消费；
3. H3 归属 C03-B，不在本包处置；
4. v2 单轨链、深度档位模型、收敛协议（G1 Finding Ledger + closure review + 轮次耗尽升级）为既定合同基线。

## 4. 待 Current User 裁决点

### Q1：causal evidence 近似是否接受

WP4 H2 关闭时登记：finding 直连因果证据字段 `introducedByRevisionId` 目前以 revision-generation 分类**近似**表达（closure review 新增 finding 的因果举证依赖该近似）。两个选项：

- **A（推荐）**：接受该近似作为 WP5/WP6 验收基线；精确因果字段的缺口登记为已知近似，留待后续独立裁决（避免在本包扩大 finding schema 变更面）。
- B：把精确 `introducedByRevisionId` 字段物化纳入 WP5 范围（扩大 finding schema 至下一版本，需同步 WP3 合同升版）。

### Q2：候选补丁处置方式

`temp/wp5-candidate-entry-wiring.patch` 基于 v2 cutover 之前的代码基线裁剪，其后经历 WP3.5-C runtime cutover（`182d8ab`）与 WP4 多轮修正（含 `6137afd` 对同文件的 F2-1 改动），预计无法干净套用。两个选项：

- **A（推荐）**：补丁仅作参考（reference-only），按当前 HEAD 在 v2 链下重新实现条款 0.1.4～0.1.6 对应能力，复审以整包对照合同条款审计，不做逐行 delta 对照。
- B：先移植补丁再对 v2 链做增量修正，复审按「移植 diff + 修正 diff」两段审计。

### Q3：「不同入口恢复」的验收边界

验收要求"中断后可由另一入口或 binding 继续""不同入口恢复出相同 current facts 和唯一 next action"。需要裁决"另一入口"的实现层级：

- **A（推荐）**：WP5 只接线**一个**受支持生产入口（canonical LOOP entry）；跨入口等价性由同一 run journal 权威上的第二个薄入口（store 级 API 消费者，可为测试级实现）证明——与"首个受支持入口"措辞及 C03/C05 分工一致。
- B：WP5 内接线两个受支持生产入口，跨入口等价性由两条生产路径直接证明。

## 5. 验收标准

1. fresh / supplement-change / finding Re-Gate / process restart / binding replacement 全部恢复唯一 next action；中断前后 confirmed facts 不被重解释；
2. 旧进程晚到结果不能覆盖新 generation（CAS fail-closed 正反例齐备）；
3. 不同入口（按 §4 Q3 裁决的层级）恢复出相同 current facts 和唯一 next action；
4. claim 前 current pointer 重验、terminal 写入 CAS、binding/executor/lineage 保留均有正负例；
5. §2.5 skill 隔离前置以正反例验证通过，legacy 非 C02 请求 fail-open 行为无回归；
6. 条款 0.1.4～0.1.6 能力在 v2 链下等价或更强落地；
7. 默认门禁全绿：完整 `npm test`、`tsc --noEmit`、standards 校验器、mutation gate 与 CI 四 job；
8. 独立完整范围复审 PASS 后方可申请 Current User 收口裁决；不以实施方报告代替复审。

## 6. 明确排除

- C03 全部内容：真实单仓交付、workspace 修改、Manual Git Handoff、Skill 包 / `manifest.yaml` / `registry/skill-registry.md` / 安装副本改动、H3 处置（C03-B 原子切换）；
- C04 已取消语义不恢复；C05 真实业务验收；
- Git 副作用仅限 Draft PR（Governance §6）；Ready / merge / Exchange/PKB 发布单独授权；
- 不新增 Agent Provider、不改 Kimi/Hermes 默认启用面；
- 不改写 C01/C02 历史 attempt、revision、finding 或 binding 快照；
- 不建第二份 Manifest schema，不恢复 Direct/Speckit 路径分流；
- 不实现 WP6 的 validation guards 综合验收与完成合同终局判定。

## 7. 裁决后的登记动作（按既有流程执行）

1. 按 `docs/decisions/README.md` 新增流程创建 **Decision-047**（八段格式，独立文件），载明 §4 各裁决点结论原文；
2. 控制平面登记授权条目 `C02_WP5_CROSS_ENTRY_RECOVERY_AND_PRODUCTION_WIRING`（authorized_by CURRENT_USER，scope/exclusions/resume_preconditions 与本文件 §2/§4/§6 一致），消费 `LOOP_CORE_C02_WP5_ENTRY_AUTHORIZATION_GATE` 并更新 route_state；
3. 实施走独立 feature 分支 → Draft PR → 独立复审 → Current User 收口裁决，沿用既有逐 WP 流程；
4. 收口前更新规划文档 Revision Record 与头部实施状态。

## 8. 申请依据

- docs/LOOP-CORE-C02-PLAN.md rev 1.2.5 §6 C02-WP5、§7 依赖图、§8 完成合同映射（合同项 1/3/4 的 WP5 列）；
- docs/LOOP-CORE-C02-WP3.5-SINGLE-RAIL-IMPACT-ANALYSIS.md §8 F row 5；
- 控制平面 STATE.yaml：`C02_WP4_REGATE_ORCHESTRATION` 收口登记及其 resume_preconditions 第（2）（3）项；
- ai-sdlc/loop-artifact-revision.md 合同条款 0.1.4～0.1.6（WP2 Round 8 拆出记录）；
- `temp/wp5-candidate-entry-wiring.patch`（未提交候选，reference-only 待裁决）。
