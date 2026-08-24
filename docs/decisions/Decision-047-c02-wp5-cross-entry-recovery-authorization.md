# Decision-047：授权实施 C02-WP5 Cross-Entry Recovery and Production Wiring

## 状态

Accepted（2026-08-24，Current User 单独授权实施 C02-WP5；授权申请草案 `temp/c02-wp5-authorization-request.md` 的三项边界裁决点全部采用推荐方案）

## 背景

C02-WP4 已于 2026-08-24 经 Current User 裁决收口（实施 PR #100 merge `8e7839af` → 独立复审修正链 `c1ecd8a..ee83381` → F2-1 终局修正 `6137afd` → 终局复审 PASS 无 Critical/High/Medium/Low；收口登记 PR #101 merge `86ca3a7`，规划 rev 1.2.5）。控制平面 `route_state = C02_WP4_CLOSED_AWAITING_NEXT_PACKAGE_AUTHORIZATION`，当前 Gate 为 `LOOP_CORE_C02_WP5_ENTRY_AUTHORIZATION_GATE`。规划 §7 依赖图的下一工作包是 C02-WP5（跨入口恢复与生产入口接线），主覆盖缺口 G6（恢复上下文不包含 C02 全量事实），并完成 Material outcome「首个受支持入口和 Gateway 真正消费 C02 orchestration authority」。既有承接事实：WP4/WP5 联合只读 skill-isolation 审计结论 CONDITIONAL PASS 及其前置条件已随 WP4 授权条目登记于控制平面；WP2 Round 8 复审裁定越界的入口/gateway 接线修正（合同条款 0.1.4～0.1.6）拆出为未提交候选补丁 `temp/wp5-candidate-entry-wiring.patch`（401 行），归本包授权范围且须在 v2 单轨链下重新核对。

## 问题

如何在不改写 C01/C02 历史、不进入 C03/C04/C05 边界、不提前消费 WP6 综合验收的前提下，把恢复上下文扩展到 C02 全量事实（change record、generation、current artifact map、Gates、open findings、invalidated revisions、深度决策、next capability/eligibility）、让入口只能从恢复结果取得 dispatch command、以 claim 前 current-pointer 重验与 terminal 写入 CAS 保证旧 generation 晚到结果 fail-closed，并把首个受支持生产入口与 Gateway 接线到该权威上？同时须处置三项边界不确定性：finding 直连因果证据的近似表达、候选补丁的审计方式、「不同入口恢复」的验收层级。

## 决策

1. **授权**：登记授权标识 `C02_WP5_CROSS_ENTRY_RECOVERY_AND_PRODUCTION_WIRING`（authorized_by CURRENT_USER，authorized_at 2026-08-24），范围以规划 §6 C02-WP5、影响分析 §8 F row 5 与本决定为准；控制平面同步登记并消费 `LOOP_CORE_C02_WP5_ENTRY_AUTHORIZATION_GATE`。
2. **范围六项**：(a) 恢复上下文扩展（v2 七节点链全量事实，含 task-planning/knowledge-sync 恢复语义）；(b) 入口调度权威——dispatch command 只来自恢复结果；(c) 并发安全——claim 前 current pointer 重验、terminal 写入 CAS、旧 generation 晚到结果不得提升为 current；(d) 复用 C01 interrupted-attempt 关闭语义并保留 binding/executor/lineage 快照；(e) 首个受支持生产入口接线——承接 WP2 Round 8 条款 0.1.4～0.1.6（入口强制同实例 `LoopArtifactStore` 绑定、gateway tracing 同实例校验、非虚拟判定与配置冻结）；(f) 场景覆盖 fresh / supplement-change / finding Re-Gate / process restart / binding replacement。
3. **Skill 隔离前置承接**（WP4 收口遗留，非新裁决）：canonical capability entry 必须在进入 gateway 前拒绝或剥离 skill/flowId 元数据；验证 gateway 对 canonical dispatch 不再读取 skill registry；fail-open 仅保留给 legacy 非 C02 请求，canonical 入口不承诺 fail-open；以正反例测试固定。
4. **裁决点 Q1＝A（因果证据近似接受）**：WP4 H2 关闭时登记的 revision-generation 分类近似（`introducedByRevisionId` 尚无精确字段）接受为 WP5/WP6 验收基线；精确因果字段的缺口登记为已知近似，留待后续独立裁决。本包不扩大 finding schema 变更面。
5. **裁决点 Q2＝A（候选补丁 reference-only）**：`temp/wp5-candidate-entry-wiring.patch` 仅作参考；条款 0.1.4～0.1.6 对应能力按当前 HEAD 在 v2 链下重新实现，独立复审以整包对照合同条款审计，不做逐行移植 delta 对照。
6. **裁决点 Q3＝A（单受支持入口 + store 级薄入口证明跨入口等价）**：本包只接线一个受支持生产入口（canonical LOOP entry）；「不同入口恢复出相同 current facts 和唯一 next action」由同一 run journal 权威上的第二个薄入口（store 级 API 消费者，可为测试级实现）证明；第二生产入口接线不属本包。
7. **验收标准**：五类场景恢复唯一 next action 且 confirmed facts 不被重解释；晚到结果 CAS fail-closed 正反例齐备；跨入口恢复一致；claim 重验/CAS/lineage 保留有正负例；skill 隔离前置正反例通过且 legacy fail-open 无回归；条款 0.1.4～0.1.6 能力等价或更强落地；完整 `npm test`、`tsc --noEmit`、standards 校验器、mutation gate 与 CI 四 job 全绿；独立完整范围复审 PASS 后方可申请收口裁决。
8. **明确排除**：C03 全部内容（含 H3 处置，归属 C03-B 原子 registry/install cutover）、C04 取消语义、C05 验收、Git 副作用超出 Draft PR（Governance §6）、新 Agent Provider 或 Kimi/Hermes 默认启用面变化、C01/C02 历史改写、第二份 Manifest schema、Direct/Speckit 分流恢复、WP6 validation guards 与完成合同终局判定。

## 原因

G6 缺口使中断后另一入口无法读到 C02 全量事实；WP4 已交付唯一 next-action 语义，是 WP5 的直接依赖前提，现依赖已满足。恢复上下文与入口接线沿用既定模式（corruption-first 读回交叉绑定、closed input contract、CAS/guarded UPDATE），不引入第二权威。三个裁决点的推荐方案均为最小充分选择：Q1-A 避免 finding schema 扩面挤占本包边界；Q2-A 承认候选补丁基线已过时（其后经历 `182d8ab` cutover 与 `6137afd` 改动），整包重实现比移植+修正两段审计成本更低、证据更干净；Q3-A 与「首个受支持入口」措辞及 C03/C05 分工一致，避免在本包内扩大生产接线面。

## 影响

- 授权 `C02_WP5_CROSS_ENTRY_RECOVERY_AND_PRODUCTION_WIRING` 已生效但**未消费**；消费发生在收口裁决。
- C02 四项完成合同保持 `INCOMPLETE / NOT_AUTHORIZED`（完成项登记仍在收口时进行）；WP6、C03（A/B/C 全部阶段）、C05 保持未授权；H3 归属 C03-B 保持 open。
- 本决定不改变 skill-isolation 审计前置的约束力，不构成任何 Git Ready/merge/发布许可。
- 已知近似（revision-generation 分类因果证据）自本决定起为登记在案的验收基线，复审与 WP6 不得将其误判为本包缺口。

## 实现状态

尚未开始实现。控制平面状态登记为 `AUTHORIZED_NOT_STARTED_RESERVED_FOR_NEXT_AGENT`；实施分支命名、Draft PR 与专项测试矩阵由实施轮次提出，随后进入独立复审。

## 依据

- [C02 有界实现规划](../LOOP-CORE-C02-PLAN.md) rev 1.2.5 §6 C02-WP5、§7 依赖图、§8 完成合同映射；
- [单轨影响分析](../LOOP-CORE-C02-WP3.5-SINGLE-RAIL-IMPACT-ANALYSIS.md) §8 F row 5；
- 控制平面 `ai-project-control-plane/projects/ai-sdlc/STATE.yaml`：`C02_WP4_REGATE_ORCHESTRATION` 收口登记及其 resume_preconditions 第（2）（3）项、skill-isolation 审计 CONDITIONAL PASS 结论；
- 合同 `ai-sdlc/loop-artifact-revision.md` 条款 0.1.4～0.1.6（WP2 Round 8 拆出记录）；
- 授权申请草案 `temp/c02-wp5-authorization-request.md`（2026-08-24 Current User 裁决采纳其 §4 全部推荐方案）。
