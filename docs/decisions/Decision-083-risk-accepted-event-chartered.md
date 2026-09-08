# Decision-083：方案②立项——一等事件 `risk_accepted`（P-K-d 实施的 H1 准入授权）

## 状态

Accepted（2026-09-02，Current User 裁决组合：「新事件类型」+「你接下来要做的
应该是项目治理」——本 Decision 落档传播后再实施）

## 背景

- plan C（Decision-082）实施完成后，run4 resume 暴露第五道门 = **H1 本身**：
  store 层链校验器 `validateLoopCapabilityExecutionChain` 的 isCanonicalNext
  判定要求前一事件 `nextStepEligibility === "ELIGIBLE"`，而 run4 的 verdict
  事件 eligibility=BLOCKED（不可变）→ task-planning started 被判非 canonical
  → 无 OPEN finding 授权 → 拒绝（台账 `d04635a`）。
- **结论：Decision-082 的约束「H1 与 schema 不动」使 plan C 无法走完最后一步**
  ——事件口径修正只影响新 run；存量 BLOCKED 事件（run4）的 canonical forward
  必须由 H1 准入。这正是 Decision-081 记录的候选①与候选②的分界点。
- Current User 裁决：**采用候选②——新增一等事件类型**，并要求先治理。

## 问题

1. 「人接受了 PWR 裁决的风险」这一事实目前只存在于 finding 行字段与 proof
   行（run 流不可见），链校验器在追加时无从引用；
2. H1 规则「closed finding 永不授权新写入」必须保持字面不变（防伪造核心），
   因此准入事实需要一个 H1 无法否认的载体；
3. 该载体必须是 run 流内的一等事实（可审计、不可变、投影语义明确）。

## 决策

1. **新增一等 run 级事件 kind：`risk_accepted`**（`LOOP_RUN_EVENT_KINDS` 演进，
   run 级事实事件）：人接受 PWR 裁决风险时，runtime 在同一事务内追加该事件。
   事件即授权事实；scope 绑定经既有的 finding proof 行（`risk_accepted_scope_id`
   + 哈希证据）承载，事件与 proof 同事务落库。
2. **投影语义**：`risk_accepted` 为记录型事件——不改变 run status，不改
   blocking 状态；投影原样通过（校验：任意状态可追加，reasonCode 记录
   decisionScopeId）。
3. **链校验器准入（H1 的受控修订）**：`regateContext` 增派
   `acceptedRiskScopes`（从该 run 的 `ACCEPTED_RISK` finding 行派生，与
   recovery PWR-DECIDED 证明同源）；`validateLoopCapabilityExecutionChain`
   的 isCanonicalNext 判定：前一事件为 succeeded formal_verdict 且
   gateResult=PASS_WITH_RISK 且其 decisionScopeId ∈ acceptedRiskScopes 时，
   canonical forward（恰一次，状态前移后不可重放）视为合法。H1 的其余部分
   （OPEN finding 之外的跳转仍拒绝、历史 finding 不授权新写入）字面不变。
4. **测试矩阵**：risk_accepted 事件追加/投影/幂等；PWR verdict 后无事件 →
   拒绝（fail-closed 不变）；有同 scope 事件 → task-planning canonical forward
   放行；非 PWR / 异 scope 不受影响。
5. **run4 续跑授权**：实施完成后 resume run4（存量 journal 无新事件，由
   recovery 既有再推导 + 本事件的 finding 行派生路径覆盖）至全链完成。
6. **边界**：journal 物理 schema 无迁移（loop_events.kind 为 TEXT）；D2 挂
   账、E5-L3 冻结、②③停等、零远程 Git 副作用、不请求 C05。

## 原因

- 候选②（事件）优于①（修 H1 判定）的点：授权事实进入 run 事件流本身——
  不可变、可投影、可审计，链校验器消费的是「发生过的人决策」而非「行的当
  前状态」；H1 的字面规则（closed finding 不授权）保持成立，准入改由新事件
  事实承载，语义上不是放宽 H1 而是补全人机闭环的事实源；
- 先治理后施工：本 Decision 超出 Decision-082 的「H1/schema 不动」约束，
  必须独立落档授权。

## 影响

- journal 事件流新增一种 run 级 kind（消费方：recovery/投影/链校验器/
  读写路径——全部需评审兼容）；`RISK_ACCEPTANCE_PENDING` 停等在验收后由本
  事件解锁；
- run4 resume 预期：task-planning → implementation（codex 真实修改 spruce
  三处代码，工作区内）→ code-review → knowledge-sync → 人工 Git 交接；
- P-C/P-D（ledger 行物化与生命周期口径）随交付尾波设计不变。

## 实现状态

- 产品仓：本 Decision + 索引 + 台账回填（本 commit）；四仓传播随即执行；
- 实施：治理落账后立即开工（本 Decision 授权）。

## 依据

- 台账 §3 run4 块与 P-K 实施现状（`d04635a`）
- Decision-080/081/082（P-K 修复授权、run4 收口、plan C 立项）
- 代码证据：`core/loop-executor-types.ts` LOOP_RUN_EVENT_KINDS、
  `core/loop-run-state.ts` 投影、`core/loop-capability-execution.ts`
  isCanonicalNext、`core/loop-run-store.ts` acceptFindingRisk/appendEvent
