# Decision-050：接受 LOOP-CORE-03 有界实现规划（Single-Rail Skill Delivery）

## 状态

Accepted（2026-08-25，Current User 裁决接受规划草案全部五项裁决点的建议方案；规划状态 Draft → Accepted，成为 LOOP-CORE-03 正式实施合同）

## 背景

LOOP-CORE-02 于 2026-08-25 收口（Decision-049），控制平面 route_state 进入
`LOOP_CORE_02_COMPLETED_AWAITING_C03_AUTHORIZATION_REQUEST`，Gate 预置为
`LOOP_CORE_C03_ENTRY_AUTHORIZATION_GATE`。C03 的工作包分解已在 WP3.5 阶段 2 验收时
冻结（影响分析 §8 F row 7～9：`C03-A-CANONICAL-SKILL-DELIVERY` /
`C03-B-REGISTRY-AND-INSTALL-CUTOVER` / `C03-C-DELIVERY-TAIL-INTEGRATION`），能力归
属映射由 Decision-045 冻结，H3 原子切换顺序由既有裁决钉死。本轮将这些分散的既定事
实收拢为单一实施合同文档 `docs/LOOP-CORE-C03-PLAN.md`（三工作包任务分解、十项设计
不变量 INV1～INV10、现状审计、缺口 G1～G6、风险表、五项裁决点）。

## 问题

C03 是否需要重新进行需求拆分，或可直接在无实施合同的情况下开工？若不需要重拆，接
受该规划时应固化哪些裁决点，以避免历史上出现过的「节点定义仅存在于对话上下文、切
换会话后丢失」的治理失效？

## 决策

1. **接受规划**：`docs/LOOP-CORE-C03-PLAN.md` 状态 Draft → **Accepted**（本决定即接
   受裁决）；规划成为 LOOP-CORE-03 的正式实施合同。
2. **五项裁决点全部按建议方案成立**：
   - Q1 ✅ C03-A 八包在同一实施分支串行交付、整包送审；
   - Q2 ✅ `development_path_entry` 迁入 runtime 确定性守卫；
     `documentation_governance_tail_completion` 迁入 C03-C Delivery Tail 流程；
   - Q3 ✅ B 阶段删除清单 = 20 个旧包目录 + 20 份旧合同 + manifest/registry 对应条
     目 + gate-runner 场景校验器；docflow-writer 全套保留；
   - Q4 ✅ 全局安装副本由实施方盘点并给出处置记录，位置清单随 b6 提交说明留痕；
   - Q5 ✅ 三包逐包授权——**本规划 Accepted 不等于任何实施授权**，C03-A 实施授权仍
     须单独申请并消费 `LOOP_CORE_C03_ENTRY_AUTHORIZATION_GATE`。
3. **命名裁定**：工作包沿用影响分析 §8 F 表冻结 ID（C03-A/B/C），不改为 WP 编号风
   格——与已接受材料及 H3 裁决记录保持引用连续性。
4. **持久性语义确认**：规划文本随 PR 合并入 `feature/loop-runtime-v1` 即完成定义持
   久化；控制平面仅承载动态指针与授权状态，不复制规划全文。

## 原因

三包分解、能力映射、切换顺序均已在前序被接受的材料中冻结，重新拆分只会制造第二份
权威；但缺少单一实施合同文档会让逐包授权失去可引用边界。将既有事实收拢成合同并同
步固化五个执行期裁量点，是启动 C03-A 前的最小充分步骤。

## 影响

- 规划 Accepted 后，下一有效转换为 **C03-A 实施授权申请**（单独请求、单独消费
  Gate）；B、C 依既定粒度逐包后续授权。
- 本决定不构成任何实施授权、不产生 Git Ready/merge 之外的副作用、不改变 C02 收口登
  记与 H3/O-2 的归属边界。
- 十项不变量 INV1～INV10 自本决定起对 C03 全部工作包生效。

## 实现状态

规划随 PR #105 合并持久化（分支 feature/c03-planning-draft → feature/loop-runtime-
v1）。C03-A/B/C 实现均未开始。

## 依据

- [LOOP-CORE-C03 有界实现规划](../LOOP-CORE-C03-PLAN.md) rev 0.2.0；
- [Autonomous Delivery Roadmap](../AI-SDLC-Autonomous-Delivery-Roadmap.md) v2.2.3 §4 LOOP-CORE-03；
- [Decision-045] Skill 收敛映射；[WP3.5 影响分析](../LOOP-CORE-C02-WP3.5-SINGLE-RAIL-IMPACT-ANALYSIS.md) §8 F row 7～9 与 H3 裁决；
- Current User 指令「Q1～Q5 裁决吧，都按你的建议来」（2026-08-25）。
