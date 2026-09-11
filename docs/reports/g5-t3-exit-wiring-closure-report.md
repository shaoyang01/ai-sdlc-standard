# G5-T3 manifest 投影失败码出口接线收口报告（R1 一轮评审收敛，R1 PASS）

> Date: 2026-09-12
> 结论: **G5-T3 收口**。G5-T3（Δ2 出口接线：`runtime.ts` 的 `LOOP_MANIFEST_EXIT_STOP_CODES` / `routeManifestProjectionOutcome()` / `manifestProjectionBlockedResult()` 三符号出口通道 + `tests/loop-manifest-projection-exit.test.ts`）@ `9b7094612e9e3f5e190ba6831d7798b9b8d8f1cf`（PR #154 合并提交，feature/loop-runtime-v1 主线）经 G5-T3-R1 独立只读复审 **PASS——五类根因全部 CLOSED、无阻塞项**，Current User 收口裁决已下（2026-09-12），冻结为 G5-T4（Δ3 生产入口接线）编码依据。
> R1 报告: /tmp/g5-t3-review-r1/.review-tmp/G5-T3-REVIEW-R1.md（探针同目录 untracked：channel-probe.ts、exit-mutation-probe.test.ts、route-envelope-probe.ts、debug-two-failures.ts）
> 编码依据链: 冻结稿 v1.8.0 + 合同 v1.0.0 §6.2/§6.2.2/§6.2.7/§7.2 + 剩余计划 §3 Δ2/§4/§6；T2 收口实现（`2b5eb36`）未改动。实施全程未触碰 intake.manifest.json、手动发布器、Skill 面、shadow 路径。

## 1. 评审收敛轨迹（R1 → PASS）

| 轮次 | 评审对象 | 判定 |
| --- | --- | --- |
| R1 | `9b70946`（PR #154，恰 2 文件 +510/−0） | **PASS——五类根因（RC-1 路由完备互斥 / RC-2 出口信封泄露 / RC-3 G4 seam 漂移 / RC-4 范围越界 / RC-5 证据失真）全部 CLOSED，无阻塞项** |

## 2. R1 PASS 判定摘要

- **RC-1 路由完备互斥**：switch 覆盖 outcome 封闭联合全部成员、无穿透；三个 §7.2 停止码逐字进出（`blocking_reason_code` 与投影器产出恒等、reason 原样传递）；三追平形态（NO_OP / PUBLISHED / DEFERRED）经复审方真实状态探针（含真实 D-9 DEFERRED 与 finding 独立差量单独存在）确认**永不阻断运行——「待投影差量走追平不走 STOP」在出口边界成立**。
- **RC-2 出口信封完整**：规范化 blocked 出口 43 项逐字段探针核验（failed/BLOCKED、`next_execution_point` 恒 null、trace 防御性拷贝、`Object.isFrozen` 全链），与既有 ADMISSION_DENIED 出口逐字段同构、无新形态；14 种非三码输入全部拒绝。
- **RC-3 G4 seam 保持**：三个 core 文件零 diff；`RuntimeResult` 形态与全部既有出口零语义改动；对投影器仅 type-only import、无循环依赖。
- **RC-4 范围纪律**：三符号零生产调用点（T4 未实施的预期形态）；复审方独立确认 T4 两调用点（入口 readiness preflight、terminal→projector）所需符号已齐备，接入无需改动本包任何文件。
- **RC-5 证据真实**：shipped 测试真实 store + 真实投影器、无 mock（逐行审计）；复审方以**不同分支**独立触发三码（YAML 解析失败 vs digest 失配、身份字段篡改 vs 调和路径）、前提反转探针原断言位正确反转、STOP 路由前后 manifest 字节逐字节不变（不修复、不重建）。
- **基线复跑**：tsc 0；npm test 161 文件全绿（346s）；三 Ruby 校验器 exit 0；越界路径零 diff。全部由复审方独立复跑，无未复跑项。

## 3. 收口效力

- T4（Δ3：生产入口 manifest readiness preflight + 节点 terminal→projector 调用点 + crash 后恢复重判幂等性；存量无 manifest → `BLOCKED_AMBIGUOUS`）编码依据 = `feature/loop-runtime-v1` @ `9b70946` 的出口接线与冻结稿 v1.8.0；实施中的语义疑问以冻结稿 + 合同 §6.2 为准，不得实施中改语义。
- T4 接入约束（R1 已确认可行）：调用点从 `runtime.ts` 导出的三符号取用出口通道；出口信封与既有 blocked 出口同构；不动本包已收口文件的语义。
- 本报告不改动任何被评审文件——评审对象与收口对象保持同一 SHA。

## 4. 残留项处置（R1，均不阻塞）

| # | 内容 | 处置 |
| --- | --- | --- |
| R1-S1 | `routeManifestProjectionOutcome` 可加 default-throw/never 穷尽守卫（纵深加固，现形态未知输入消费即 TypeError，无"安静放行"） | T4 顺带评估，不强制 |
| **R1-S2** | **STOP `reason` 不入出口信封（`RuntimeResult` 无 reason 字段，系保持 G4 seam 的正确选择）；其持久化是 T4 调用点职责——否则审计事实只活在返回值里** | **纳入 T4 实施范围：调用点必须把 STOP reason 落入 journal 事件（如 `run_blocked` 的 reasonCode 载荷）** |
| R1-S3 | shipped 测试的 DEFERRED 仅路由表级构造覆盖；复审方探针已补真实 D-9 状态触发 | T5 回归矩阵纳入真实态 DEFERRED |

T2 收口报告 §4 的遗留观察项（O-2..O-5、17 形态余量、lag 端到端、D-21/§7.4 跨面解析、ACCEPTED 混合/repair 全流程）维持原处置，归 T5 parity 域，不在本报告重复。

## 5. 治理状态

- Control Plane STATE 随本收口更新 `source_refs.product_commit`（分支 + PR 合控制面 main）——按 GOVERNANCE §15.4，`source_refs` 为登记时刻产品仓 tip 的快照，本报告的合并提交落在其中，故该值与 §1 的评审对象 SHA 不同属构造必然；T4 编码依据仍为 §3 所载 @ `9b70946` 与冻结稿 v1.8.0。`route_state` / `active_work`（D-090-03 IN_PROGRESS）/ `next_transition`（G5_D09003_COMPLETION_REVIEW）与 `[G5_MANIFEST_PROJECTION]` 授权（consumed: false）不变。
- 边界保持：未实施 T4；未触碰 intake.manifest.json、手动发布器、Skill 面、shadow 路径、业务仓、真实 CLI；G6/run8/C03-E 完成判断/C05、D091 业务收编仍不在授权范围。
