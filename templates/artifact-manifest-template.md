# Artifact Manifest: <Requirement ID>

> 状态：Draft（2026-08-22，C02-WP3.5 合同重基线，Decision-044/045；收口后升 Accepted）
> 关联：[Lifecycle](../ai-sdlc/lifecycle.md) · [Artifact Storage](../ai-sdlc/artifact-storage.md) · [Artifact Versioning](../ai-sdlc/artifact-versioning.md) · [Phase Gates](../ai-sdlc/phase-gates.md)

## Metadata

- Requirement ID:
- Requirement Name:
- Version: 1.0.0
- Status: active / blocked / completed / abandoned / stale / replaced
- Repository:
- Created At:
- Current Generation: 1
- Current Node: requirement-intake / solution-design / solution-gate / task-planning / implementation / code-review / knowledge-sync / delivery_tail（07）
- Current Status: active / blocked / completed / abandoned
- Versioning Model: stable-path-internal-version
- Related Branch:
- Current Owner:
- Last Updated At:

## Design Depth Decision

本字段是 solution-gate（formal_verdict）设计深度裁决在 Manifest 中的唯一模板权威，语义遵循 `ai-sdlc/phase-gates.md` 与 `templates/gate-result-template.md`。

- Depth: LIGHT / STANDARD / DEEP
- Decision Status: DECIDED / BLOCKED_UNKNOWN
- Decision Scope: FULL_REQUIREMENT / DELTA_CHANGE（变更时）
- Decided At:
- Decision Source: sdlc-solution-gate / formal_verdict
- Decision Artifact: `library/{requirement_id}/02-方案审核/{requirement_id}_方案审核.md`
- Gate Artifact Version:
- Finding Ledger Reference:
- Verdict Executor Binding（formal_verdict）:
- Scan Executor Binding（adversarial_scan）:（必须与 Verdict Executor Binding 不同，Decision-044）
- Reason:
- Follow-up:
- Current / Stale:
- Stale Condition: 01-技术方案 版本变化或 finding 使裁决失效时

规则：

- `BLOCKED_UNKNOWN` 不进入实现；必须回到需求/方案补齐事实后重新正式裁决。
- 深度档位或 decision_status 变化必须重新过 solution-gate（formal_verdict），不得自行沿用旧裁决。
- 对抗扫描与正式裁决必须由不同 Agent binding 执行（Decision-044）；同一 Agent 执行两角色即 fail-closed。

## Generation 与变更记录

- Current Generation: 1
- 变更（含测试/线上反馈）经 requirement-intake 分类为 change record（NEW_REQUIREMENT / SUPPLEMENT / CHANGE / REWORK / FEEDBACK_DRIVEN_CHANGE）后开启新 generation；旧 generation 产物只读，不自动提升为 current。

## 变更范围（Delta Scope）

v2 change-control 保留字段（完整语义见 `ai-sdlc/change-control.md`）：

- Delta Scope:（本次补充 / 返工 / 测试反馈 / Review 暴露缺口真正处理的当前变更范围）
- Aggregate Requirement Scope:（同一 `requirement_id` 已归档、已审核或已实现的完整原需求范围，只作为上下文）
- Same Requirement Decision: yes / no（是否沿用原 `requirement_id` 的显式决策）
- Earliest Affected Node: 00-需求资料 / 01-技术方案 / 02-方案审核 / 03-任务规划 / 04-实现记录 / 05-代码审核 / 06-知识同步

## Artifact Index

| Node | Required | Directory | Stable Path | Version | Status | Result / Gate | Updated At |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 00 需求资料 | yes | `00-需求资料/` |  |  | draft / active / stale / replaced |  |  |
| 01 技术方案 | yes | `01-技术方案/` |  |  | draft / active / stale / replaced |  |  |
| 02 方案审核 | yes | `02-方案审核/` |  |  | draft / active / stale | PASS / FAIL / PASS_WITH_RISK |  |
| 03 任务规划 | yes | `03-任务规划/` |  |  | draft / active / stale |  |  |
| 04 实现记录 | actual_implementation_required | `04-实现记录/` |  |  | draft / active / stale |  |  |
| 05 代码审核 | actual_implementation_required | `05-代码审核/` |  |  | draft / active / stale | closed / blocked / risk_accepted |  |
| 06 知识同步 | yes | `06-知识同步/` |  |  | draft / active / stale | NO_CHANGE / APPLY_LOCAL / PROPOSAL_ONLY / BLOCKED_CONFLICT |  |

`07 交付总结` 属于 C03 Delivery Tail，不映射节点能力，不进入 node Artifact Index；单独登记，见下文 Delivery Tail 区段。

Required 语义说明：

- `yes`：节点不可跳过（节点产物可精简，节点顺序不变）。
- `actual_implementation_required`：产生实际代码、配置或行为实现时为 required；纯文档、纯分析或纯治理且不产生实际实现时，对应项可以判定为 `not_applicable`，但必须记录范围、原因、证据、decision source 和 decision owner。
- 只有 solution-gate（02）输出结论性 Gate；`05` 的 Result 是 closure review 结论，`06` 的 Result 是 knowledge-sync decision，均不是 Gate。
- v1 旧产物不进入本表：`00/01/02` 可作历史输入引用，旧 `03/04/05` 保持只读历史；若确需复用，必须在新 generation 中显式导入为 evidence 并生成 v2 revision。

## Delivery Tail（07-交付总结，C03）

本区段记录 C03 Delivery Tail 状态与证据指针；Delivery Tail 不映射节点能力，不输出 Gate，不替代七节点产物，不进入 node Artifact Index。

- required: yes/no（进入 C03 Delivery Tail / Manual Git Handoff，即 READY_FOR_MANUAL_GIT_HANDOFF 前为 required）
- status: planned / in_progress / blocked / ready_for_manual_git_handoff / completed / not_required
- delivery_checkpoint:
- 07-交付总结 path / version:
- delivery_summary:
- external_evidence_references:
- manual_git_handoff: pending / done / not_applicable
- next_step:

## External Evidence References

非节点产物（不进入 Artifact Index），以 content-addressed 引用登记（如 `loop-artifact:v1:<kind>:sha256:<digest>`）：

| Ref | Kind（test / log / receipt / feedback / other） | Digest | Source Node / Delivery Tail | Status |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

- 可复现测试输出、运行日志与外部系统回执由相应节点 revision 或 Delivery Tail 引用。
- 原始测试/线上反馈先经 requirement-intake 分类为 `FEEDBACK_DRIVEN_CHANGE`；必要时渲染到 `00-需求资料/反馈/`，其来源作为 intake source ref。

## Activity Log

| Date | Actor / Skill | Action | Node | Artifact | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |

## Change History

| Change ID | Date | Source | Classification | Parent Requirement ID | Decision Scope | Current Change Scope | Affected Node | Artifact | Previous Version | New Version | Summary | Re-Gate Required | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  | Requirement Supplement / Requirement Change / Rework / Specification Missing / Feedback-Driven Change / Review Missing / Implementation Bug / Environment / Documentation Correction |  | FULL_REQUIREMENT / DELTA_CHANGE |  |  |  |  |  |  | yes/no | open/resolved |

注：测试/线上反馈统一按 Feedback-Driven Change 分类（经 intake 建立 change record），不再单列 Test Case Issue。

## Replaced Artifact Paths

Use this only when a legacy path, split artifact, or renamed file is replaced.
Normal updates to the same stable file use `Version` and `Change History`.

| Old Path | Replaced By | Reason | Date | Recorded By |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## Re-Gate Records

| Date | Trigger | Parent Requirement ID | Decision Scope | Current Change Scope | From Node | Upstream Artifact | Upstream Version | Required Gate | Gate Artifact | Gate Artifact Version | Result | Depth Re-Verdict | Next Step |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  | FULL_REQUIREMENT / DELTA_CHANGE |  |  |  |  |  |  |  | PASS / FAIL / PASS_WITH_RISK | 重新裁决 / 沿用 |  |

## Gate 与结论记录

### 方案审核（solution-gate 正式裁决，唯一结论性 Gate）

- Result: PASS / FAIL / PASS_WITH_RISK
- Can Continue: yes/no
- Risk Accepted: yes/no
- Accepted Risk:
- Accepted By:
- Accepted At:
- Accepted Reason:
- Accepted Scope:
- Follow-up Required: yes/no
- Follow-up Owner:
- Reviewed Artifact:
- Reviewed Artifact Version:
- Design Depth Decision: LIGHT / STANDARD / DEEP
- Depth Decision Status: DECIDED / BLOCKED_UNKNOWN
- Finding Ledger Reference:
- Scan Executor Binding:
- Verdict Executor Binding:（必须与 Scan Executor Binding 不同）

### 代码审核（closure review 结论，非 Gate）

- Closure Status: completed / blocked / risk_accepted
- Blocking Findings:
- Required Fixes:
- Finding Ledger Reference:

### 知识同步（knowledge-sync decision，非 Gate）

- Decision: NO_CHANGE / APPLY_LOCAL / PROPOSAL_ONLY / BLOCKED_CONFLICT
- Candidate Stable Facts:
- Source Revision IDs:
- Target Paths:
- Reconcile Result:
- Residual Risks:
- Evidence Digest:

## Stage Summaries

### 上线准入结论

- Status Summary:
- Evidence:
- Risk Notes:
- Follow-up:
- Notes: This is not a Gate, does not set `Can Continue`, does not block later workflow steps, and does not mark the requirement completed.

## Missing Artifacts

## Blocking Issues

## Next Step

## 修订记录

| Version | Date | Author / Skill | Change Type | Summary | Re-Gate |
| --- | --- | --- | --- | --- | --- |
| 2.0.0 | 2026-08-22 | C02-WP3.5 | rebaseline | v2 合同重基线（Decision-044/045）：删除 Development Path Decision / Delta Development Path Decision / Documentation Governance Tail / Speckit Process Products / DocFlow Handoff Products 区段；新增 Design Depth Decision、current generation、七节点 Artifact Index（00-06）、Delivery Tail（07）与 External Evidence References；补回 v2 change-control 保留字段（Delta Scope / Aggregate Requirement Scope / Same Requirement Decision / Earliest Affected Node）；Gate 记录收敛为 solution-gate 唯一结论性 Gate，代码审核/知识同步为非 Gate 结论。 | no |
| 1.0.0 |  |  | initial | Initial manifest. | no |
