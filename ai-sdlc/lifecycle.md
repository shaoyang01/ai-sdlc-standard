# AI SDLC Lifecycle（v2 单轨）

> 状态：Draft（2026-08-22，C02-WP3.5 合同重基线，Decision-044/045；收口后升 Accepted）
> 关联：[LOOP Core Contract](../docs/LOOP_CORE_CONTRACT.md) · [Node Capability Contract](node-capability-contract.md) · [Development Path Governance（单轨重写）](development-path-governance.md) · [Phase Gates](phase-gates.md)

## 适用场景

本生命周期适用于人工唤醒 Skill 的 AI 辅助研发流程，尤其适用于不同 Agent 之间只能通过文档交接的场景。

## Canonical 七节点链（v2，Decision-044）

所有需求走同一条链；复杂度只决定深度档位，不改变链结构：

```text
requirement-intake
  -> solution-design
  -> solution-gate（adversarial_scan 对抗扫描 + formal_verdict 正式裁决 + 设计深度裁决）
  -> task-planning
  -> implementation
  -> code-review
  -> knowledge-sync
  -> Manual Git Handoff（C03 Delivery Tail）
```

节点能力合同见 [Node Capability Contract](node-capability-contract.md)；门禁语义见 [Phase Gates](phase-gates.md)；返回最早受影响节点规则见 [LOOP Core Contract](../docs/LOOP_CORE_CONTRACT.md) §5.3。

## 阶段职责

### requirement-intake — 需求归一化与反馈分类

接收原始需求（含测试/线上反馈），不做实现判断。

输出：
- Requirement ID 与 change record（新需求/补充/变更/返工/反馈驱动变更）
- Source / Format / Missing Context / Conflicting Sources
- Business Goal / User Intent / Current Problem / Initial Scope / Uncertainties
- In Scope / Out of Scope / Success Criteria / Pending Questions

原始测试/线上反馈不是 LOOP 节点产物：先经 change record 分类为 `FEEDBACK_DRIVEN_CHANGE`，intake 确认事实后在新 generation 中进入本链。

### solution-design — 技术方案设计与深化

生成符合 ESS 的技术方案，并按已裁决深度档位深化。

输出：
- Technical Specification（LIGHT/STANDARD/DEEP 档位对应的章节深度）
- Open Questions / Assumptions

### solution-gate — 方案门禁（对抗扫描与正式裁决）

开发前审计规格是否完整，阻止未定义行为进入实现阶段。两个执行角色必须由不同 Agent binding 执行：

- `adversarial_scan`：对抗扫描，产出首轮 Finding Ledger；不给正式 Gate。
- `formal_verdict`：消费当前方案与扫描 ledger，输出 Gate Result 与设计深度裁决（depth = LIGHT/STANDARD/DEEP；decision_status = DECIDED/BLOCKED_UNKNOWN）。

输出：
- Gate Result（PASS / FAIL / PASS_WITH_RISK）
- Design Depth Decision
- Critical / High / Medium / Low findings
- Missing Constraints / Required Actions

### task-planning — 任务规划与实现前一致性审计

将通过方案门禁的方案转化为实现计划，并做实现前内部一致性审计（原 analyze/checklist 的降级形态）。

输出：
- Task Plan（可执行、可追溯、可测试的任务清单）
- 实现前一致性审计结论（覆盖规格、计划、测试、回滚和风险项）

### implementation — 实现与证据记录

按任务实现，同时形成可核验证据。遇到未定义行为时停止并反馈，不自行补业务规则。

输出：
- 工作区改动（代码 patch）
- Implementation Record（每项声明引用 diff、测试输出或 journal 事件证据，禁止自述）

### code-review — 代码审核与收敛复审

审查代码是否符合规格与任务边界，而不只是审查代码风格。首轮建立 Finding Ledger baseline，后续轮次为 closure review（只逐项验证修复证据；新 blocking finding 必须证明由本轮修复直接引入或证明 baseline 失效）。

输出：
- Review Summary（含 Finding Ledger / closure review）
- 可定位、可修复的 findings（severity + 位置/证据）

### knowledge-sync — 知识同步与对账

将稳定业务事实、规格遗漏和反复出现的问题沉淀到知识库、Checklist 或 Schema；校对代码、规格、业务文档之间的一致性。唯一输入权威是当前 generation 的七节点 current revisions、已关闭/已接受 finding proof、代码/测试 evidence 与目标知识现状。

输出：
- decision（NO_CHANGE / APPLY_LOCAL / PROPOSAL_ONLY / BLOCKED_CONFLICT）
- 候选稳定事实 / source revision IDs / 目标路径 / diff 或 proposal / reconcile result
- 未执行项、残余风险和 evidence digest

默认只读，明确写授权后才写入目标知识。

## 返回最早受影响节点（Re-Gate）

任何节点发现有效 finding 时，按 [LOOP Core Contract](../docs/LOOP_CORE_CONTRACT.md) §5.3 的 v2 路由表返回最早受影响节点；`solution-gate` 与 `code-review` 的收敛协议见 [Finding Lifecycle Contract](loop-finding-lifecycle.md) 与 C02-WP3.5 影响分析 §9 G1。

## 裁剪规则

简单需求可以裁剪阶段内容，但必须说明裁剪原因，且不改变链结构。

裁剪原因必须遵循 [Complexity Routing](complexity-routing.md) 的深度档位模型：

- `LIGHT`：方案与任务内容可精简；节点顺序不变。
- `STANDARD`：常规单模块改造的完整内容。
- `DEEP`：完整状态机/DB/MQ/事务/回滚/代表数据/边界场景章节 + 实现前一致性审计。
- `BLOCKED_UNKNOWN`：必须回到需求/方案补齐事实，不能靠猜测裁剪。

不可裁剪的内容：
- Scope / Out of Scope
- 行为保持
- 失败策略
- 测试方式
- 副作用边界
- 七节点顺序与 Gate 结论（节点产物可能精简，节点不得跳过）

## Revision Record

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 2.0.0 | 2026-08-22 | Draft | C02-WP3.5 重基线：阶段集切换为 v2 七节点链；Specification Gate 改为 solution-gate 双角色 + 设计深度裁决；删除 Development Path 分流、Shared Tail 与 pipeline 语义；Test 阶段退役（反馈经 intake 重入）；新增 task-planning/knowledge-sync 职责；裁剪规则按深度档位重写。 |
