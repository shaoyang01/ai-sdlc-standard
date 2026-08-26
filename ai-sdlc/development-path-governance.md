# Development Path Governance（单轨，v2）

> 状态：Draft（2026-08-22，C02-WP3.5 合同重基线，Decision-044/045；收口后升 Accepted）
> 关联：[LOOP Core Contract](../docs/LOOP_CORE_CONTRACT.md) · [Complexity Routing（深度档位）](complexity-routing.md) · [Node Capability Contract](node-capability-contract.md) · [Lifecycle（v2）](lifecycle.md)

## 目的与范围

本标准定义 v2 单轨下"方案如何进入实现、知识如何同步、交付如何收口"的治理规则。

Decision-044 裁决：**不存在 Direct/Speckit 路径分流**，不存在独立 Speckit 产物轨道，不存在 `development_path_entry` 与 Shared Documentation Governance Tail 作为第二套流程权威。方案如何进入实现由 `solution-gate` 的正式裁决（Gate + 设计深度裁决）决定；实现后的知识同步由 `knowledge-sync` 节点承担；交付收口由 C03 Delivery Tail（`READY_FOR_MANUAL_GIT_HANDOFF`）承担。

本文件不再定义 Development Path Decision。原 Development Path 与 Shared Tail 的职责承接：

- 复杂度分级与深度调节 → [Complexity Routing](complexity-routing.md) 的深度档位模型（solution-gate 唯一裁决点）。
- 原路径阻塞语义（Blocked 路径值）→ `decision_status = BLOCKED_UNKNOWN` 与 finding/Re-Gate 机器（回到最早受影响节点）。
- business_domain_sync decision → `knowledge-sync` 节点的稳定事实筛选与写授权判定。
- Reconcile decision → `knowledge-sync` 节点的代码/文档/知识对账。
- Tail Completion Gate → C03 Delivery Tail 与 delivery checkpoint（`READY_FOR_MANUAL_GIT_HANDOFF`，人工 Git 交接）。

不适用：

- 本标准不替代方案门禁、深度裁决或任何现有 Gate。
- 本标准不降低任何 PASS / FAIL / PASS_WITH_RISK、风险接受或 Reviewed Artifact Version 绑定要求。
- 本标准不授权任何执行、上线、灰度、投产、回滚或外部发布动作。

## 单轨规范流程

```text
requirement-intake -> solution-design -> solution-gate -> task-planning
  -> implementation -> code-review -> knowledge-sync
  -> C03 Delivery Tail（READY_FOR_MANUAL_GIT_HANDOFF / blocked / failed）
```

- `solution-gate` 通过（Gate = PASS / PASS_WITH_RISK）且 `decision_status = DECIDED` 后，才能进入任务规划与实现。
- `decision_status = BLOCKED_UNKNOWN` 不得进入实现，必须返回最早受影响节点补齐事实。
- `code-review` 揭示方案缺口时，必须按根因回流 `solution-design` / `task-planning`，不得只修代码。
- `knowledge-sync` 完成后进入 C03 Delivery Tail；Delivery Tail 的确定性准入检查由 LOOP runtime 执行，`sdlc-gate-runner` 已退役（Decision-045）。

## 深度裁决（替代原路径决定）

方案门禁的正式裁决输出互斥的设计深度（完整规则见 [Complexity Routing](complexity-routing.md)）：

- `depth = LIGHT | STANDARD | DEEP`；`decision_status = DECIDED | BLOCKED_UNKNOWN`。
- `solution-gate` 是唯一深度裁决点；`BLOCKED_UNKNOWN` 不进入实现。
- Decision Scope / Delta 隔离（FULL_REQUIREMENT / DELTA_CHANGE、Ignored Aggregate Triggers）与用户 override（`user_requested`）、later Gate 升级（`later_gate_required`）语义平移保留。
- 深度升级经 finding → 最早受影响节点 Re-Gate 由机器强制下游失效；不得用文档记录代替机器失效。

## 对实际实现始终必需的证据

当需求产生实际代码、配置或行为实现时，下列证据始终必需：

- 当前有效的 `00-需求资料`（含 change record）。
- 当前有效的 `01-技术方案`（按已裁决深度档位）。
- 当前有效的 `02-方案审核`（Gate + 设计深度裁决 + Finding Ledger 引用）。
- 当前有效的 `03-任务规划`（任务边界与实现前一致性审计）。
- 当前有效的 `04-实现记录`（每项声明引用 diff/测试输出/journal 事件证据）。
- 当前有效的 `05-代码审核`（Finding Ledger 与 closure review）。
- 当前有效的 `06-知识同步`（decision、候选稳定事实、reconcile result、evidence digest）。

这些证据不得因为"修改较小"或"未走特殊路径"而被静默省略。不产生实际代码、配置或行为实现的纯文档或纯治理任务，可以将对应节点产物判定为 `not_required` 或 `not_applicable`，但必须记录：范围、原因、证据、decision source、decision owner、当前 artifact 和 version 依据，以及使该判断失效的条件。

## knowledge-sync 决策（承接 business_domain_sync 与 Reconcile）

`knowledge-sync` 节点统一输出（详见 [Finding Lifecycle Contract](loop-finding-lifecycle.md) 与 C02-WP3.5 影响分析 §9 G2）：

- `decision ∈ {NO_CHANGE, APPLY_LOCAL, PROPOSAL_ONLY, BLOCKED_CONFLICT}`。
- 稳定事实筛选：只有稳定、可复用且已验证的事实才可同步；必须有明确目标；实际写入必须有明确写授权；缺少目标或授权时只能 `PROPOSAL_ONLY` 或 `BLOCKED_CONFLICT`。
- 对账（Reconcile）：默认只读；存在代码/文档差异风险、Manifest drift、规格或实现不一致迹象时应执行；结果与 `decision`、source revision IDs、目标路径、diff/proposal、entry coverage、未执行项、残余风险和 evidence digest 一起落库。
- 原始测试/线上反馈不得直接进入 knowledge-sync，必须先经 `requirement-intake` 分类（changeKind=FEEDBACK_DRIVEN_CHANGE）。
- 唯一输入权威：当前 generation 七节点 current revisions、已关闭/已接受 finding proof、代码/测试 evidence、目标知识现状；`specs/**`、pipeline run、sync source mode 与历史聊天均不能成为并列 authority。

## C03 Delivery Tail

- 位置：`knowledge-sync` 之后；输出 `READY_FOR_MANUAL_GIT_HANDOFF` 或如实的 `blocked` / `failed`。
- delivery checkpoint 的 generation/CAS 机器底座保留；`READY_FOR_MANUAL_GIT_HANDOFF` 只交付可人工处理的变更包，不产生 commit/push/PR/Ready/merge/发布。
- 确定性准入检查（current revision、blocking finding、风险接受证据、下一节点 eligibility）由 LOOP runtime 执行；专业内容判断由节点 Skill 承担；治理尾部检查由 Delivery Tail/checkpoint 承担（`sdlc-gate-runner` 不复活）。[RETIRED — C03-B]
- 用户确认边界成为显式人工 Gate。

## Topic 07 状态说明

原 `development-path-governance` 的 Topic 07 formal closure 基于双轨路径体系建立；Decision-044 取消双轨属于**受控重排**，不构成对 Topic 07 结论的静默删除。本文件 v2 取代原路径治理正文；历史正文保留于 Git 历史，不再作为 active 标准。

## Revision Record

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 2.0.0 | 2026-08-22 | Draft | Decision-044/045 重基线：删除 Development Path Decision（路径三值）与 Shared Tail 双轨语义；深度裁决移交 solution-gate（引用 complexity-routing）；business_domain_sync/Reconcile 承接进 knowledge-sync；Tail Completion 承接进 C03 Delivery Tail；sdlc-gate-runner 退役登记；Topic 07 降级标注。 |
