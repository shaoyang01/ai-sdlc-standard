# Artifact Manifest: <Requirement ID>

## Metadata

- Requirement ID:
- Requirement Name:
- Version: 1.0.0
- Status: active / blocked / completed / abandoned / stale / replaced
- Repository:
- Created At:
- Current Stage:
- Current Status: active / blocked / completed / abandoned
- Versioning Model: stable-path-internal-version
- Related Specs Directory:
- Related Branch:
- Current Owner:
- Last Updated At:

## Development Path Decision

- Decision: DIRECT_IMPLEMENTATION / SPECKIT_PIPELINE_REQUIRED / BLOCKED_NEEDS_REVISION / undecided
- Decision Scope: FULL_REQUIREMENT / DELTA_CHANGE
- Parent Requirement ID:
- Current Change Scope:
- Original Requirement Context:
- Aggregate Requirement Scope:
- Original Implemented / Approved Scope:
- Out of Delta Scope:
- Complexity: SIMPLE / MEDIUM / COMPLEX / BLOCKED_UNKNOWN
- Delta Complexity: SIMPLE / MEDIUM / COMPLEX / BLOCKED_UNKNOWN
- Aggregate Complexity: reference only
- Complexity Triggers:
- Delta Complexity Triggers:
- Ignored Aggregate Triggers:
- Full SDD Override: none / user_requested / later_gate_required
- Decided By:
- Decision Source: sdlc-solution-reviewer / user / sdlc-gate-runner / other
- Development Path Decision Source:
- Decision Artifact:
- Reason:
- Follow-up:

Manifest rule: when a Change Event exists, do not reuse an old Development Path
Decision as the new delta route. Record a new Re-Gate Decision or Delta
Development Path Decision based on Current Change Scope / Delta Scope.

## Delta Development Path Decision

- Change Event:
- Parent Requirement ID:
- Same Requirement Decision:
- Decision Scope: FULL_REQUIREMENT / DELTA_CHANGE
- Current Change Scope / Delta Scope:
- Aggregate Requirement Scope:
- Aggregate Complexity: reference only
- Delta Complexity:
- Delta Complexity Triggers:
- Ignored Aggregate Triggers:
- Re-Gate Source:
- Earliest Affected Node:
- Decision:
- Decision Source:
- Decision Artifact:
- Required Re-Gate:
- Status: open / passed / blocked / superseded

## Artifact Index

| Node | Required | Directory | Stable Path | Version | Status | Result | Updated At |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 00 需求资料 | no | `00-需求资料/` |  |  | draft / active / stale / replaced |  |  |
| 01 技术方案 | yes | `01-技术方案/` |  |  | draft / active / stale / replaced |  |  |
| 02 方案审核 | yes | `02-方案审核/` |  |  | draft / active / stale | PASS / FAIL / PASS_WITH_RISK |  |
| 03 实现记录 | actual_implementation_required | `03-实现记录/` |  |  | draft / active / stale |  |  |
| 04 交付总结 | recommended | `04-交付总结/` |  |  | draft / active / stale |  |  |
| 04 代码审核 | actual_implementation_required | `04-代码审核/` |  |  | draft / active / stale | PASS / FAIL / PASS_WITH_RISK |  |
| 05 测试验收 | actual_implementation_required | `05-测试验收/` |  |  | draft / active / stale | PASS / FAIL / PASS_WITH_RISK |  |

Required 语义说明：

- `actual_implementation_required`：产生实际代码、配置或行为实现时为 required。
- 纯文档、纯分析或纯治理且不产生实际实现时，对应项可以判定为 `not_applicable`，但必须记录范围、原因、证据、decision source 和 decision owner。
- 不得继续使用无条件 `recommended` 或无证据 `conditional` 代替上述语义。
- `04 交付总结` 继续为 `recommended`；它不是 Gate，不能替代 `03 实现记录`、`04 代码审核`、`05 测试验收` 或 Tail Completion Gate。

## Documentation Governance Tail

Canonical Field: `documentation_governance_tail`

本区段是 Shared Documentation Governance Tail 当前状态、证据路径和版本指针的唯一模板权威，语义遵循 `ai-sdlc/development-path-governance.md`。本区段不创建第二份状态字段；Tail 状态只有 `documentation_governance_tail.status`。

- required: yes/no
- scope:
- status: planned / in_progress / blocked / completed / not_required / stale
- required_artifacts:

| Item | Requirement Basis | Expected Artifact | Expected Version / Current Basis | Status |
| --- | --- | --- | --- | --- |

- completed_artifacts:

| Item | Artifact Path | Version | Status | Result | Evidence | Current / Stale |
| --- | --- | --- | --- | --- | --- | --- |

- skipped_items:

| Item | Decision: not_required / not_applicable | Reason | Evidence | Decision Source | Decision Owner | Artifact / Version Basis | Stale Condition |
| --- | --- | --- | --- | --- | --- | --- | --- |

- blocking_items:

| Item | Reason | Owner | Earliest Affected Node | Required Action | Status |
| --- | --- | --- | --- | --- | --- |

### business_domain_sync

Manifest Field: `documentation_governance_tail.business_domain_sync`

- business_domain_sync_decision: SYNC_REQUIRED / NOT_REQUIRED / PROPOSAL_REQUIRED / BLOCKED / DUPLICATE_SYNC_BLOCKED
- mode: none / speckit_driven / library_driven / hybrid
- decision_source:
- decision_artifact:
- current_sync_owner: sdlc-speckit-sync / none
- execution_required: yes/no
- execution_status:
- execution_result: not_run / synced / proposal / partial / not_required / blocked
- source_of_truth:
- target_documents:
- execution_artifact:
- duplicate_sync_guard: active
- stable_fact_candidates:
- synced_facts:
- proposed_updates:
- skipped_facts:
- blocked_reasons:
- residual_risks:
- current / stale:
- stale_condition:

decision 与 execution result 必须分离：`business_domain_sync_decision` 记录五种固定判定之一，`execution_result` 记录六种执行结果之一。duplicate guard 阻止执行时，decision 保持 `DUPLICATE_SYNC_BLOCKED`，execution_result 按是否实际尝试记录 `blocked` 或 `not_run`，blocking reason 与 duplicate evidence 必须记录。现有 Sync output 到 execution_result 的映射：`SYNCED -> synced`、`PROPOSED -> proposal`、`PARTIAL -> partial`、`BLOCKED -> blocked`、未执行 -> `not_run`、`NOT_REQUIRED` decision 且无需执行 -> `not_required`。

Legacy compatibility：历史 Manifest 中的 `## Speckit Sync` 区段允许兼容读取，读取时映射到 `documentation_governance_tail.business_domain_sync`；新 Manifest 不得同时创建旧区段和本区段；不要求自动迁移历史 Manifest；不删除历史事实；compatibility read 不允许继续新写旧字段。

### Reconcile

- reconcile_decision: required / not_required / blocked
- decision_source:
- decision_artifact:
- audit_scope:
- execution_required: yes/no
- execution_status:
- reconciliation_artifact:
- result_classification:
- evidence:
- blocking_drift:
- earliest_affected_node:
- stale_condition:

本子区段只记录 decision 与结果指针；模板不得执行或替代 Reconcile。

### Entry Coverage

- status:
- artifact:
- scope:
- evidence:
- blocking_items:
- current / stale:

`PENDING`、`FAILED` 或 `BLOCKED` 的 Entry Coverage 不能支持 Tail completion。

### regate_result

- required: yes/no
- trigger:
- starting_point:
- gate_artifact:
- gate_artifact_version:
- result:
- current / stale:
- evidence:
- next_step:

### Completion 记录

- completion_evidence:
- completion_decision_source:
- Tail Completion Gate artifact:
- Gate artifact version:
- Gate result: PASS / FAIL / PASS_WITH_RISK
- Decided By: sdlc-gate-runner
- Decided At:
- Manifest Version:
- Blocking Items:

不新增独立的第二份完成状态字段；只有 `documentation_governance_tail.status` 是 Tail 状态。只有当前、non-stale 的 Tail Completion Gate artifact 可以成为 `completion_decision_source`。

## Activity Log

| Date | Actor / Skill | Action | Node | Artifact | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |

## Change History

| Change ID | Date | Source | Classification | Parent Requirement ID | Decision Scope | Current Change Scope | Affected Node | Artifact | Previous Version | New Version | Summary | Re-Gate Required | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  | Requirement Supplement / Requirement Change / Rework / Specification Missing / Feedback-Driven Change / Review Missing / Implementation Bug / Test Case Issue / Environment / Documentation Correction |  | FULL_REQUIREMENT / DELTA_CHANGE |  |  |  |  |  |  | yes/no | open/resolved |

## Replaced Artifact Paths

Use this only when a legacy path, split artifact, or renamed file is replaced.
Normal updates to the same stable file use `Version` and `Change History`.

| Old Path | Replaced By | Reason | Date | Recorded By |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## Re-Gate Records

| Date | Trigger | Parent Requirement ID | Decision Scope | Current Change Scope | From Node | Upstream Artifact | Upstream Version | Required Gate | Gate Artifact | Gate Artifact Version | Result | Development Path Decision Source | Next Step |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  | FULL_REQUIREMENT / DELTA_CHANGE |  |  |  |  |  |  |  | PASS / FAIL / PASS_WITH_RISK |  |  |

## Gate Decisions

### 方案审核

- Result:
- Can Continue:
- Risk Accepted: yes/no
- Accepted Risk:
- Accepted By:
- Accepted At:
- Accepted Reason:
- Accepted Scope:
- Follow-up Required: yes/no
- Follow-up Owner:
- Development Path Recommendation:

### 代码审核

- Result:
- Blocking Issues:
- Required Fixes:

### 测试验收

- Result:
- Feedback Classification:
- Required Action:

### Shared Documentation Governance Tail Completion Gate

- Gate Artifact:
- Gate Artifact Version:
- Result: PASS / FAIL / PASS_WITH_RISK
- Can Continue: yes/no
- Completion Eligible: yes/no
- Risk Accepted: yes/no
- Blocking Items:
- Decided By: sdlc-gate-runner
- Decided At:

Stage Summary 不是该 Gate；Pipeline result、Delivery Summary、workflow-status snapshot 和聊天结论不能替代该 Gate。

## Stage Summaries

### 上线准入结论

- Status Summary:
- Evidence:
- Risk Notes:
- Follow-up:
- Notes: This is not a Gate, does not set `Can Continue`, does not block later workflow steps, and does not mark the requirement completed.

## Speckit Process Products

`manifest.md` is the status authority. `workflow-status.md` is only a
machine-side snapshot.

| Artifact | Stable Path | Version | Status | Updated At | Notes |
| --- | --- | --- | --- | --- | --- |
| Implementation | `specs/{feature}/implementation.md` |  | draft / active / stale |  |  |
| Workflow Status Snapshot | `specs/{feature}/workflow-status.md` |  | draft / active / stale |  | manifest is status authority |
| Debug Guide | `specs/{feature}/debug-guide.md` |  | draft / active / stale |  |  |
| Observability | `specs/{feature}/observability.md` |  | draft / active / stale |  |  |

## DocFlow Handoff Products

| Artifact | Stable Path | Version | Status | Updated At | Notes |
| --- | --- | --- | --- | --- | --- |
| Implementation Record | `library/{requirement_id}/03-实现记录/{requirement_id}_实现记录.md` |  | draft / active / stale |  |  |
| Delivery Summary | `library/{requirement_id}/04-交付总结/{requirement_id}_交付总结.md` |  | draft / active / stale |  |  |

## Missing Artifacts

## Blocking Issues

## Next Step

## 修订记录

| Version | Date | Author / Skill | Change Type | Summary | Re-Gate |
| --- | --- | --- | --- | --- | --- |
| 1.0.0 |  |  | initial | Initial manifest. | no |
