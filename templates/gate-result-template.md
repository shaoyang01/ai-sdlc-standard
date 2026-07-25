# Gate Result: <Phase Name>

## Metadata

- Requirement ID:
- Artifact Type: 方案审核 / 代码审核 / 测试验收 / Gate Result
- Version: 1.0.0
- Status: draft / active / passed / failed / stale / replaced
- Reviewer / Skill:
- Created At:
- Updated At:
- Reviewed Artifact:
- Reviewed Artifact Version:
- Gate Artifact Version:
- Gate Name:
- Gate Type: generic / development_path_entry / documentation_governance_tail_completion / other
- Manifest Path:
- Gate Basis:
- Development Path Decision: DIRECT_IMPLEMENTATION / SPECKIT_PIPELINE_REQUIRED / BLOCKED_NEEDS_REVISION / not_applicable
- Decision Scope: FULL_REQUIREMENT / DELTA_CHANGE / not_applicable
- Complexity: SIMPLE / MEDIUM / COMPLEX / BLOCKED_UNKNOWN / not_applicable
- Development Path Decision Source:
- Development Path Decision Artifact:
- Tail Required: yes / no / not_applicable
- Tail Scope:
- Tail Status: planned / in_progress / blocked / completed / not_required / stale / not_applicable
- Result: PASS / FAIL / PASS_WITH_RISK
- Can Continue: yes/no

非 Development Path 或 Tail Gate 可以将 Development Path、Tail 相关字段标记为 `not_applicable`，但字段本身不得删除。

## Conclusion

## Development Path Check

当 Gate Type 为 `development_path_entry` 时必填；其他 Gate Type 可整体标记 `not_applicable`。

- Decision: DIRECT_IMPLEMENTATION / SPECKIT_PIPELINE_REQUIRED / BLOCKED_NEEDS_REVISION
- Decision Scope: FULL_REQUIREMENT / DELTA_CHANGE
- Complexity: SIMPLE / MEDIUM / COMPLEX / BLOCKED_UNKNOWN
- Decision Source:
- Decision Artifact:
- Current / Stale:
- Implementation Entry Eligible: yes/no
- Blocking Reason:
- Evidence:

## Documentation Governance Tail Evidence Check

当 Gate Type 为 `documentation_governance_tail_completion` 时必填；其他 Gate Type 可整体标记 `not_applicable`。`sdlc-gate-runner` 只检查和判定证据，不生成 `03-实现记录`、`04-代码审核`、`05-测试验收`，不执行 Sync 或 Reconcile，不修改生产代码或知识材料。

- required_artifacts:

| Item | Required | Artifact Path | Expected Version / Basis | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| 03-实现记录 | actual_implementation_required |  |  |  |  |
| 04-代码审核 | actual_implementation_required |  |  |  |  |
| 05-测试验收 | actual_implementation_required |  |  |  |  |
| business_domain_sync decision | required |  |  |  |  |
| Reconcile decision | required |  |  |  |  |

- completed_artifacts:

| Item | Artifact Path | Version | Status | Result | Evidence |
| --- | --- | --- | --- | --- | --- |

- skipped_items:

| Item | Decision | Reason | Evidence | Decision Source | Decision Owner | Stale Condition |
| --- | --- | --- | --- | --- | --- | --- |

- blocking_items:

| Item | Reason | Owner | Earliest Affected Node | Required Action | Status |
| --- | --- | --- | --- | --- | --- |

- business_domain_sync_decision: SYNC_REQUIRED / NOT_REQUIRED / PROPOSAL_REQUIRED / BLOCKED / DUPLICATE_SYNC_BLOCKED
- reconcile_decision: required / not_required / blocked
- entry_coverage_result:
- regate_result:
- completion_evidence:
- completion_decision_source:

对 Tail Completion Gate，`completion_decision_source` 必须指向当前 Gate artifact 和当前 Gate Artifact Version。Manifest 是状态权威；Pipeline result、Delivery Summary、Stage Summary、workflow-status snapshot 和聊天结论不能替代 Tail Completion Gate。

## Critical

| ID | Location | Summary | Required Action |
| --- | --- | --- | --- |

## High

| ID | Location | Summary | Required Action |
| --- | --- | --- | --- |

## Medium

| ID | Location | Summary | Required Action |
| --- | --- | --- | --- |

## Low

| ID | Location | Summary | Suggestion |
| --- | --- | --- | --- |

## Missing Information

## Required Actions

## Risk Acceptance

仅当 Result 为 PASS_WITH_RISK 时填写：

- Accepted Risk:
- Accepted By:
- Accepted At:
- Accepted Reason:
- Accepted Scope:
- Follow-up Required: yes/no
- Follow-up Owner:

## Re-Gate Check

- Required: yes/no
- Trigger:
- Earliest Affected Node / Starting Point:
- Gate Artifact:
- Gate Artifact Version:
- Result:
- Current / Stale:
- Evidence:
- Next Step:
- Manifest Current Version:
- Reviewed Version Matches Manifest: yes/no
- Stale Because:
- Required Re-Gate:

## Tail Completion Decision

仅当 Gate Type 为 `documentation_governance_tail_completion` 时填写；其他 Gate Type 可整体标记 `not_applicable`。

- Tail Completion Eligible: yes/no
- Gate Result: PASS / FAIL / PASS_WITH_RISK
- Completion Evidence:
- Completion Decision Source:
- Manifest Version:
- Blocking Items:
- Next Step:

## Next Step

## 修订记录

| Version | Date | Reviewer / Skill | Change Type | Summary | Re-Gate |
| --- | --- | --- | --- | --- | --- |
| 1.0.0 |  |  | initial | Initial gate result. | no |
