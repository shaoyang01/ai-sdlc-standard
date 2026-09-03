# Decision-086：PWR verdict 自动推进——finding gate 语义简化与 H1 死锁消除

## 状态

Accepted（2026-09-02，Current User 确认设计原则：「有风险要暴露出来没问题，有风险不暴露出来反而有问题，但是一旦我做了决定，就不应该再有任何阻碍」+ Re-Gate 路由规则确认）

## 背景

- run4/run5/run6 六轮真实冒烟暴露了 P-K 设计矛盾的完整面貌：PWR verdict
  产生的 OPEN findings 阻塞链推进，而验收仪式无法在自动化冒烟中完成。
- Current User 澄清了根本设计原则：
  1. 有风险要暴露（scan/verdict 产出 findings——已工作）
  2. 用户做二选一决定：接受→直走；不接受→返工
  3. **决定做出后，零阻碍执行**
- Code-review findings 的 Re-Gate 路由规则（Current User 确认）：
  - 代码实现遗漏/代码与产物不一致 → earliestAffectedNodeId =
    implementation → 直接重跑 implementation，不需要重走 gate
  - 方案本身有问题（前后矛盾/覆盖不足）→ earliestAffectedNodeId =
    solution-design → 回流 solution-design 重走完整链

## 问题

1. PWR verdict 的 findings（OPEN）阻塞链推进——与 PWR-DECIDED 矛盾，导致
   自动化冒烟死锁；
2. Recovery 线性走查在 verdict BLOCKED eligibility 处断裂；
3. 链校验器 isCanonicalNext 拒绝非 ELIGIBLE 前驱的 canonical forward。

## 决策

1. **PWR verdict 自动推进**：formal_verdict 以 PASS_WITH_RISK succeeded 时，
   recovery 将 gateDecision 判为 DECIDED（不再要求 ACCEPTED_RISK finding
   proof）。链自动推进到 task-planning → implementation → code-review →
   knowledge-sync。findings 记录在案但不再阻塞。
2. **gateway 派生规则**：formal_verdict PASS_WITH_RISK →
   `nextStepEligibility = ELIGIBLE`（Decision-080 已实施，保留）。
3. **链校验器 isCanonicalNext**：succeeded formal_verdict + PWR + ELIGIBLE →
   canonical forward 自然放行（不需要额外准入分支）。
4. **回滚**：Decision-082/083 的验收闸门/停等码/risk_accepted 事件类型/
   acceptedRiskScopes 管道——全部回滚（它们在解一个不存在的问题）。
5. **保留**：Decision-080 的 P-K 线性走查再推导（兼容存量 BLOCKED 事件）、
   P-A 证据包装、P-I journal_path、P-B fresh-prepare、sandbox workspace-write。
6. **P-C/P-D 缓行**：ledger 行物化与 finding 生命周期口径随交付尾波设计；
   P-L 模板已交付（Decision-084），作为后续物化器的输入契约。

## 原因

- LOOP 为 Current User 服务，Current User 的裁决是最终决定。PWR verdict
  已经是门禁的判断，不需要第三方再审批一遍；
- `PASS_WITH_RISK` 与 `PASS` 的区别仅在于：PWR 的 findings 会在后续节点中
  显眼标记（implementation record 的 Gate-risk closure table、code-review
  的 closure verification），但不再阻塞链推进；
- findings 的价值在于暴露和记录，不在于阻塞。阻塞只在 FAIL（需要返工）
  时才发生。

## 影响

- run4/run5 的 BLOCKED 状态将可被 resume 穿越到全链完成；
- code-review findings 的 ADV 关闭条件由 implementation record 的 Gate-risk
  closure table 和 code-review 的 closure verification 承载（模板已有）；
- `computeFindingGate` 的 OPEN blocking 逻辑暂不修改（它独立于链推进，影
  响的是 knowledge-sync 的 eligibility，后续 P-C/P-D 波再调）。

## 实现状态

- 产品仓：本 Decision + 索引 + 台账回填（本 commit）；四仓传播随即执行；
- 实施：治理落账后立即开工（本 Decision 授权）。

## 依据

- 台账 §3 run4 块 + P-L 实施回填（`30579b1`/`ec9caaf`/`b720be8`/`13eddda`）
- Decision-080～085
- Current User 2026-09-02 设计原则确认与 Re-Gate 路由规则确认
- 代码证据：`core/loop-recovery.ts` 线性走查 + `computeFindingGate`、
  `core/loop-capability-execution.ts` isCanonicalNext、
  `execution/gateway.ts` nextStepEligibility 派生
