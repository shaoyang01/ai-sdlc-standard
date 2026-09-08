# Decision-087：纵向主干重建——P-K-d 之外的三条接缝修复与离线测试矩阵

## 状态

Accepted（2026-09-02，Current User 授权立项。依据 = codex 评审报告五条根因 +
Current User 确认方向：「不做补丁叠补丁，要做就做彻底」）

## 背景

- run3～run7 六轮真实冒烟暴露了 runtime 在真实 agent 派发下的系统性缺陷，
  远超单点修复能覆盖的范围。codex 独立评审确认了五个根因，其中两个是
  Decision-080/082/083 已部分实施但未彻底解决的遗留：
  1. E3 信封缺节点业务状态字段：agent 正文声明 BLOCKED 时 runtime 仍记
     succeeded（RealCapabilityGateway 只要 envelope 可解析即 success:true）
  2. Finding 生命周期两套事实系统：gateway 写 blob + eligibility=BLOCKED，
     但 Re-Gate 只消费 loop_findings 表，两者无原子物化桥梁
  3. 冒烟绕过生产入口：smoke 直接调 run()，journal 记 repository=local、
     零 base SHA、无独立 task worktree
  4. Decision-086 半回滚：验收闸门回滚了但 risk_accepted 事件/
     acceptedRiskScopes/链校验器 PWR 特殊准入/RISK_ACCEPTANCE_PENDING 仍残留
  5. Control Plane STATE 过期，product_commit 指向旧 commit

## 问题

逐层补丁的方式使 runtime 沉积了多套互相矛盾的准入机制（RISK_ACCEPTANCE_
PENDING / acceptedRiskScopes / risk_accepted event / pwrAdmitted / H1 特殊
准入），每套解决一个症状但引入新的不一致。代码、测试和 Decision 三者互相
矛盾，无法通过离线测试矩阵验证。

## 决策

1. **立项纵向主干重建波**，范围限三条接缝的修复，不推倒底层组件
   （journal/artifact store/resume lease/process evidence/binding registry/
   Git workspace manager 保留）：
   - **接缝 1：节点结果模型**——E3 信封增加 `nodeStatus` 字段
     （SUCCEEDED / BLOCKED / FAILED），gateway 校验正文声明与实际输出一致，
     不一致时降级为 BLOCKED 并携带原因
   - **接缝 2：Finding 物化与路由**——scan/verdict/code-review 的 findings
     在 succeeded 事件同一事务内原子物化为 `loop_findings` 行（含 cause/
     severity/earliestAffectedNodeId/source revision/evidence ref）；由
     recovery 自动路由（implementation 直接重跑 / solution-design 回流重走
     gate），禁止人工补行
   - **接缝 3：唯一生产装配入口**——真实冒烟只能从 loop-run →
     runProduction → production factory 进入，factory 注入真实 identity/
     prepared worktree/real adapter/attemptWorkspace/allowed write set/
     artifact/journal store；删除或禁止冒烟脚本直接调用 run()
2. **离线端到端测试矩阵**（全部通过前不发真实 CLI 冒烟）：

| 输入场景 | 必须得到的机器结果 |
|---|---|
| implementation 正文声明 BLOCKED | 节点 terminal=BLOCKED；不得派发 code-review |
| formal verdict FAIL + solution finding | finding 原子入库；同一 run 下一点 = solution-design |
| code-review HIGH，earliest=implementation | implementation current 失效；同一 run 重跑 implementation |
| PWR | 按已有规则自动推进；风险作为普通 risk refs 随行 |
| resume | runId、requirementId 不变，sequence 续增；禁止 run-run |
| workspace 越界或根仓有副作用 | 保留隔离证据并 BLOCKED；根工作分支零污染 |

3. **回滚**：Decision-080/082/083 中与上述三条接缝冲突的代码全部回滚
   （RISK_ACCEPTANCE_PENDING / risk_accepted event / acceptedRiskScopes
   / RISK_ACCEPTANCE_PENDING / pwrAdmitted），保留其中与接缝修复兼容的
   部分（P-A 证据包装、P-I journal_path、P-B fresh-prepare）。
4. **新冒烟使用全新 run**：run4～现有 run 只作为缺陷发现证据保留。
   目标仓中的 prompt-input/ 和 .usage-*.json 残留先作为证据归档，再经
   Current User 授权清理。
5. **完成标准**：离线端到端测试矩阵 + 现有全量测试全部变绿后，发一次
   全新真实 CLI 冒烟验证全链。

## 原因

- 逐层补丁的方式已证明不可持续——每轮冒烟暴露下一个接缝的断裂，修复
  一个暴露一个；
- 三条接缝互相依赖：节点结果模型不准确则 finding gate 语义无意义；
  finding 不物化则 Re-Gate 无路由依据；生产入口不统一则测试不覆盖
  真实路径；
- 离线测试先行可以安全地验证全链逻辑，不需要真实 CLI 调用（速度快、
  可重复、无成本）。

## 影响

- runtime 代码：runtime.ts + core/loop-recovery.ts +
  core/loop-capability-execution.ts + core/loop-run-store.ts +
  core/loop-capability-entry.ts + execution/gateway.ts +
  execution/real-capability-gateway.ts + core/loop-executor-types.ts +
  core/loop-run-state.ts + scripts/loop-run.ts + scripts/loop-gw-smoke-real.ts
- Decision-080/082/083 中与本波冲突的代码回滚
- P-K-d 中的 PWR→ELIGIBLE 派生（040a1f9）保留
- 四仓传播：本 Decision 记录 + 实施完成后的收口

## 实现状态

- 产品仓：本 Decision + 索引 + 台账（本 commit）；四仓传播随即执行
- 实施：治理落账后立即开工（本 Decision 授权）

## 依据

- codex 评审报告（Current User 2026-09-03 转交，五条根因 + 纵向重建建议）
- 台账 §3 全部 run 块（run3～run7 + P-L 收口波）
- Decision-080～086（相关前置授权与回滚）
- 代码证据：`core/node-output-envelope.ts:71`、`execution/gateway.ts:505`、
  `runtime.ts:1006`、`core/loop-run-store.ts` regateChainContext、
  `execution/agent-cli-profile.ts:252`
