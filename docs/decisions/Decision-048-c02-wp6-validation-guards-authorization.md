# Decision-048：授权实施 C02-WP6 Validation Guards and Completion Acceptance

## 状态

Accepted（2026-08-25，Current User 单独授权实施 C02-WP6；本决定同时固化三项延续性裁定 R-A/R-B/R-C 作为授权合同边界）

## 背景

C02-WP5（cross-entry recovery and production wiring）已于 2026-08-25 经 Current User 终局裁决收口：最终实现基线 `9936a1d`，Round 7 PASS 无阻塞项（规划 rev 1.2.7；PR #102 承载实现与收口登记）。控制平面 route_state 进入 `C02_WP5_CLOSED_AWAITING_NEXT_PACKAGE_AUTHORIZATION`，并已预置下一 Gate `LOOP_CORE_C02_WP6_ENTRY_AUTHORIZATION_GATE`。规划 §7 依赖图的最后一个工作包是 C02-WP6（Validation Guards and Completion Acceptance）——C02 的最终综合验收包，Material outcome 是"用生产路径对抗测试证明 C02 四项完成合同，而不是只验证 helper 或文档矩阵"。WP1～WP3.5、WP4、WP5 已全部收口；H3 归属 C03-B 保持 open。

## 问题

如何在不重写各 WP 既有测试与合同、不进入 C03/C05 边界、不扩展 schema 或第二权威的前提下，以生产路径对抗测试证明 C02 四项完成合同（1 变更分类 / 2 finding 失效与最早节点路由 / 3 只消费有效上游版本与 Gate / 4 中断续跑不重解释 confirmed facts），使每一项均有生产路径正例、负例与恢复例，且独立完整范围复审在无未解决 P1/P2 的前提下允许 Current User 消费本最终工作包授权并裁决 C02 收口？

## 决策

1. **授权**：登记授权标识 `C02_WP6_VALIDATION_GUARDS_AND_COMPLETION_ACCEPTANCE`（authorized_by CURRENT_USER，authorized_at 2026-08-25），范围以规划 §6 C02-WP6、影响分析 §8 F row 6 与本决定为准；控制平面同步登记并消费 `LOOP_CORE_C02_WP6_ENTRY_AUTHORIZATION_GATE`。
2. **对抗矩阵枚举基线**：场景按 v2 七节点链（八执行点）枚举，必须包含 task-planning / knowledge-sync 的恢复语义。
3. **延续性裁定 R-A（定向变异证据为标准）**：各包沿用 WP5 确立的 M 系列定向变异证明模式（对关键断言注入生产侧缺陷并验证测试失败）；**不**扩展 D04 通用 mutation harness（其 A～N 集合维持现状）。
4. **延续性裁定 R-B（WP5 新增面纳入对抗矩阵）**：以下 WP5 引入的生产面必须进入 WP6 对抗验证——跨进程 resume lease fencing（含 symlink/canonical 物理身份别名竞争、崩溃自动释放后双侧可恢复、排队/STORE_BUSY 失败方语义）；bootstrap provenance 闭合 union（含公共 appendEvent 门禁、partial/malformed 读回 STORE_CORRUPT、idempotent/conflict replay）；created-only run 的 legacy start 兼容路径；三轴零副作用 oracle（journal events / runs / artifact files）。
5. **延续性裁定 R-C（Q1-A 近似继续有效）**：finding 直连因果证据的 revision-generation 分类近似继续作为完成合同联合证据的基线；仅当 WP6 生产路径探针暴露具体失败时才升级为新裁决点。
6. **验收标准**（规划 §6 全量）：schema 固定字段/plain-data/Proxy/accessor/Symbol/额外字段边界；run store 迁移、corruption、回滚、并发 CAS；change classification、artifact revision、finding lifecycle、失效传播、Re-Gate、跨入口恢复端到端正/负/恢复例；stale artifact/Gate/深度决策、旧 generation late result、伪造 finding close、手工选择历史输入全部 fail-closed；v1 及更早格式 UNSUPPORTED_HISTORICAL_FORMAT 且 cutover preflight 有执行记录；收敛协议对抗矩阵（首轮 Ledger 完整性、closure review 只审关闭、新 finding 举证失败拒绝、轮次耗尽升级）；默认门禁全绿。
7. **明确排除**：C03 全部内容（含 H3 处置）、C04 取消语义、C05 验收、第二生产入口、真实 Agent/Git/Ready/merge/发布、运行时反射等超出声明威胁模型的泛化加固、重写各 WP 既有 Accepted 测试（只允许按新链断言强化，不允许削弱）、新增 Agent Provider。
8. **收口语义**：本授权是 C02 最后一个工作包授权——独立完整范围复审 PASS 且无未解决 P1/P2 后，由 Current User 裁决消费本授权并登记 `LOOP-CORE-02 = COMPLETED`（四项完成合同的联合证据随收口登记固化）；C02 收口不自动授权 C03。

## 原因

四个完成合同横跨 WP1～WP5 的全部持久层与编排面，任何单包测试都无法证明联合行为；WP6 以生产路径（runtime.run、受支持入口、两个 gateway 面、store 公开 API）为唯一被测对象，避免 helper 级测试给出虚假信心。三项延续裁定把 Round 1～7 复审确立的证据标准（定向变异、三轴零副作用、closed input contract、corruption-first 读回）固化为 C02 终局验收的统一口径，防止最后一包出现标准漂移。

## 影响

- 授权未消费前不登记任何完成合同项；消费发生在 Current User 收口裁决。
- H3 归属 C03-B 保持 open，不得转移至 WP6；C03（A/B/C）、C05 保持未授权。
- 本决定不改变既有 Q1-A/Q2-A/Q3-A/W6 收紧等冻结裁决，不构成 Git Ready/merge/发布许可。
- WP6 实施若暴露 Q1-A 近似的具体失败，按 §决策 5 升级为新裁决点并回到本决定修订，而非就地扩大 schema。

## 实现状态

尚未开始实现。控制平面状态登记为 `AUTHORIZED_NOT_STARTED_RESERVED_FOR_NEXT_AGENT`；实施分支、Draft PR 与专项对抗测试文件由实施轮次提出，随后进入独立完整范围复审。

## 依据

- [C02 有界实现规划](../LOOP-CORE-C02-PLAN.md) rev 1.2.7 §6 C02-WP6、§7 依赖图、§8 完成合同映射、§12 进度管理与收口；
- [单轨影响分析](../LOOP-CORE-C02-WP3.5-SINGLE-RAIL-IMPACT-ANALYSIS.md) §8 F row 6；
- [Decision-047](Decision-047-c02-wp5-cross-entry-recovery-authorization.md) 及 WP5 收口登记（rev 1.2.7，baseline `9936a1d`）；
- 控制平面 STATE.yaml：route_state/Gate 预置、skill-isolation 前置条件、H3 归属记录；
- Current User 指令「授权C02-WP6」（2026-08-25）。
