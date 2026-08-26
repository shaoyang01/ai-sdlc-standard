# Decision-051：C03-A 收口与 C03-B 挂起（Current User 裁决）

## 状态

Accepted（2026-08-25，Current User 裁决：消费 C03-A 授权并收口；**C03-B 明确挂起**——旧版 Skill 仍在日常开发中使用，切换时点待用户确认）

## 背景

C03-A（Canonical Skill Delivery）实施完成并经三轮独立复审：Round 1 FAIL（B-1～B-6）→ Round 2 FAIL（R2-1/R2-2 文档层残留）→ **Round 3 PASS 无未解决 P1/P2**（R2-1/R2-2 均 CLOSED、S 系列处置留痕验证通过）。非阻塞建议 S-4 / intake 叠字 / 校验器双 ok 打印已随收口修正推送（`d579d14`）。

同时，Current User 指出关键运营事实：**旧版 sdlc-\* Skill 仍在日常开发中被活跃使用**。C03-B 的原子切换将删除这些旧包——执行时点必须与使用方协调，不能由治理流程自动推进。

## 问题

如何在登记 C03-A 收口的同时，把「旧版 Skill 仍在生产使用、C03-B 切换时点未定」这一运营约束固化为权威状态，避免后续会话误判为可自动开启 C03-B？

## 决策

1. **消费授权**：`C03_A_CANONICAL_SKILL_DELIVERY` 授权消费；C03-A 收口基线 = PR #106 head `d579d14`。
2. **C03-B 挂起**：C03-B（Registry and Install Cutover）进入 **CURRENT_USER_HOLD** 状态——不是排队待授权，而是被 Current User 显式搁置。解除条件（全部满足才可申请解除）：
   - a. Current User 明确给出旧版 Skill 停用与切换时点（go/no-go）；
   - b. 解除后仍须按既定粒度提交 C03-B 授权申请并经独立复审。
3. **中间态合法化确认**：挂起期间仓库维持 H3 裁决接受的双拓扑中间态（新八包完整未注册 + 旧二十一包注册可用且部分断链）；H3 保持 OPEN 归 C03-B；此状态可持续任意时长，不产生任何超时压力。
4. **新包冻结语义**：已交付的新八包在挂起期间保持内容冻结——不得在无新授权的情况下修改、注册或部分启用。

## 原因

治理流程服务于使用者而非相反。C03-B 的删除动作对在用开发是破坏性变更，其时点只能由 Current User 根据实际开发节奏决定；将其固化为显式 HOLD 而非「待授权队列」，防止任何后续会话把「上一包已收口」误解为「下一包可自动推进」。

## 影响

- `LOOP-CORE-03` 保持 IN PROGRESS（A 收口、B 挂起、C 未授权且因依赖 B 顺延不可开始）；
- C02 收口登记不受影响；H3 与 R4_O2 观察项归属不变；
- 挂起期间旧版 Skill 的日常使用完全合法且不受任何本仓改动影响。

## 实现状态

C03-A 实现 PR #106 已合并（`06b8d75` 后续 merge），收口修正至 `d579d14`。

## 依据

- WP6/WP5 同款收口流程先例；Decision-050 Q5（逐包授权）；H3 裁决（原子切换唯一性）；
- Current User 指令「C03-A 收口，但先不要开启 C03-B，因为目前还在使用旧版 SKILL 进行开发」（2026-08-25）。

## 状态更新（2026-08-26，Current User 裁决：C03-B 收口）

**C03-B 从 CURRENT_USER_HOLD → CLOSED。**

- HOLD 解除：Decision-052（2026-08-26）授权 C03-B 实施，HOLD 正式释放。
- 实施基线：单一原子提交 `2f822a2`（aace600 之上仅 1 提交），PR #108 合并。
- 复审全链路：Round 1（F1/F2/F3）→ Round 2（H1/H2）→ Round 3（R3-F1/R3-F2）→ Round 4（R4-F1）→ **Round 5 PASS**，五轮已关闭项零回归，INV1~10 与 b1~b7 全绿，三面一致 8/8/8/8，CI 四 job 全绿。
- 交付内容：manifest/registry/known-skills 三面 7+1 拓扑、20 旧包退役删除、校验器缩减+references/category/旧ID 扫描、本机 b6 安装副本 8/8 一致、H3 finding CLOSED（CP 1753f2b）。
- C03-C（runtime 消费面切换：agent-skill-registry 内存表、skill-flow-orchestrator FLOW_DEFINITIONS、metadata inventory）顺延，需单独授权。
