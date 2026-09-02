# Decision-082：P-K-d 立项——方案 C（PWR eligibility 口径修正 + 派发验收闸门）

## 状态

Accepted（2026-09-02，Current User 裁决：采用方案 C 并授权治理 + 实施；
PWR 字段口径定为 ELIGIBLE）

## 背景

- run4 收口时发现 P-K 死锁的设计根源（Decision-081）：`nextStepEligibility`
  一个字段被迫表达两件事——agent 的裁判结论（门禁过没过）与 runtime 的过程
  准入（人接受了吗）。hermes 在 PWR 时写 BLOCKED 是替 runtime 越权表达流程状
  态，事件不可变 → 写完即死。
- 方案比选：A（修 H1）动防伪规则；B（验收标记事件）动 schema；**C（本
  Decision）**——字段只归 agent 裁判，人闸门移到派发命令推导处，H1 与
  schema 均不动，改动面最小且职责分清。

## 问题

1. PWR verdict 的事件口径未定义：agent 写 ELIGIBLE 还是 BLOCKED 无契约依据，
   写 BLOCKED 即死锁（P-K）；
2. 人闸门（风险接受）缺少派发侧的执行点：验收前 runtime 不得派发
   task-planning；
3. 消费的 Finding Ledger 未物化为 finding 行，逐条验收缺载体（P-J 同源）。

## 决策

1. **字段口径（部件 1，根）**：`nextStepEligibility` = **agent 对门禁结论的
   裁判**——PASS 与 PASS_WITH_RISK 均记 `ELIGIBLE`（PWR = 通过、风险已作为
   findings 记录），FAIL 记 `BLOCKED`（需返工）。「等人验收」不再由该字段表
   达，改由部件 2 的派发闸门表达。落点：runtime prompt builder 指引更新 +
   能力契约文档写明（含「BLOCKED 仅用于裁决认为链路不该继续的场景」）。
2. **派发验收闸门（部件 2）**：`deriveDispatchCommand` 对「succeeded
   formal_verdict 且 gateResult=PASS_WITH_RISK」的派发请求：存在绑定该
   verdict decisionScopeId 的 `ACCEPTED_RISK` finding 行方可派发；否则抛新码
   `RISK_ACCEPTANCE_PENDING`（run 停等，决策卡由入口协议渲染；验收经既有
   `acceptFindingRisk`/释放门完成）。scope 级验收（一次接受覆盖该轮全部风
   险，evidence 指名各 finding），不要求逐 finding 行——与 run4 实证一致。
3. **ledger 行物化（部件 3）缓行**：逐条物化存在「SOLUTION 类 finding 触发
   design current 失效 → 重返工死循环」的语义陷阱，本波不做；验收闸门采用
   scope 级（读 verdict 事件 bindings，不依赖行）。ledger 行物化与 finding
   生命周期口径一并留待 P-C/P-D 交付尾波设计。
4. **过渡兼容保留（部件 4，已实现）**：recovery 对存量 BLOCKED PWR 事件的
   同 scope 验收再推导保留（run4 即此类），新口径 run 不再产生该形态。
5. **测试**：PWR+ELIGIBLE 无验收行 → `RISK_ACCEPTANCE_PENDING` 拒派；
   同 scope 验收行存在 → 派发 task-planning；既有 fail-closed 分支不回归。
6. **边界**：H1 与 journal schema 不动；run4 收口状态不变（其 journal 属存
   量形态，由部件 4 兼容续跑）；D2 挂账、E5-L3 冻结、②③停等、零远程 Git
   副作用、不请求 C05。

## 原因

- 裁判与准入分离：agent 只判方案质量，runtime 管流程准入——字段的语义唯一
  且可测试；
- H1 与 schema 零改动：防伪规则与不可变审计面完整保留；人闸门真实存在（无
  验收即无派发），伪造成本不变（哈希证据 + acceptedBy + scope 一次性绑定）；
- 部件 4 已实现，run4 可直接续跑至全链完成，验证成本最低。

## 影响

- 波次：本 Decision 即 P-K-d 实施授权（部件 1/2/4 收尾 + 测试），完成后
  resume run4 至全链完成；实施与 resume 结果回填台账；
- prompt 口径变化写入能力契约文档（明示非静默变更）；`RISK_ACCEPTANCE_PENDING`
  作为新错误码进入 entry/resume 错误面；
- P-C/P-D（ledger 行物化与生命周期口径）随交付尾波设计，范围含本 Decision
  决策.3 的缓行原因。

## 实现状态

- 产品仓：本 Decision + 索引 + 台账回填（本 commit）；四仓传播随即执行；
- 实施：治理落账后立即开工。

## 依据

- 台账 §3 run4/返工轮回填块与 P-K 现状（`0166ca3`/`f445b2c`）
- Decision-080/081（P-K 修复授权与收口）
- 代码证据：`core/loop-recovery.ts`（acceptedRiskScopes 与线性走查 P-K 分
  支，已实现）、`core/loop-recovery.ts` deriveDispatchCommand（部件 2 落
  点）、`execution/capability-prompt-builder.ts`（部件 1 指引落点）
