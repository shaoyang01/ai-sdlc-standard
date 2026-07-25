# Solution Review Output Report

## Default Report Structure

Use this structure for response output and Markdown artifacts.

```markdown
# Solution Review Report: <Requirement Name>

## Metadata

- Requirement ID:
- Artifact Type: 方案审核
- Version: 1.0.0
- Status: draft / active / passed / failed / stale / replaced
- Reviewer / Skill:
- Created At:
- Updated At:
- Reviewed Artifact:
- Reviewed Artifact Version:
- Gate Artifact Version:
- Result: PASS / FAIL / PASS_WITH_RISK
- Can Continue: yes/no
- Decision Scope: FULL_REQUIREMENT / DELTA_CHANGE
- Complexity: SIMPLE / MEDIUM / COMPLEX / BLOCKED_UNKNOWN
- Delta Complexity: SIMPLE / MEDIUM / COMPLEX / BLOCKED_UNKNOWN
- Aggregate Complexity: reference only
- Complexity Triggers:
- Delta Complexity Triggers:
- Ignored Aggregate Triggers:
- Re-Gate Source:
- Earliest Affected Node:
- Full SDD Override: none / user_requested / later_gate_required
- Development Path Decision: DIRECT_IMPLEMENTATION / SPECKIT_PIPELINE_REQUIRED / BLOCKED_NEEDS_REVISION
- Development Path Decision Reason:
- Development Path Decision Source: sdlc-solution-reviewer
- Development Path Decision Artifact:
- Development Path Decision Artifact Status: current / stale / not_persisted
- Tail Required: yes / no
- Tail Scope:
- Tail Status: planned / blocked / not_required

## Scope Decision

- Parent Requirement ID:
- Intake Classification:
- Same Requirement Decision:
- Change Event Type:
- Aggregate Requirement Scope:
- Original Implemented / Approved Scope:
- Current Change Scope / Delta Scope:
- Out of Delta Scope:
- Required Re-Gate:

## Conclusion

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

## Missing Constraint

## Missing Branch

## Behavior Risk

## Compatibility Risk

## Implementation Risk

## Test Gap

## Pending Confirmation

## Required Actions

## Risk Acceptance

- Accepted Risk:
- Accepted By:
- Accepted At:
- Accepted Reason:
- Accepted Scope:
- Follow-up Required: yes/no
- Follow-up Owner:

## Manifest Update Recommendation

- Artifact Index:
- Manifest Stable Path:
- Manifest Version:
- Manifest Status:
- Gate Decisions:
- Development Path Decision:
  - Decision Scope:
  - Complexity:
  - Delta Complexity:
  - Aggregate Complexity: reference only
  - Complexity Triggers:
  - Delta Complexity Triggers:
  - Ignored Aggregate Triggers:
  - Full SDD Override:
  - Development Path Decision Source:
  - Development Path Decision Artifact:
  - Development Path Decision Artifact Status:
- Documentation Governance Tail（初始建议）:
  - Tail Required:
  - Tail Scope:
  - Tail Status:
- Activity Log:
- Change History:
- Re-Gate Records:
- Blocking Issues:
- Next Step:

## Next Step

## 修订记录

| Version | Date | Reviewer / Skill | Change Type | Summary | Re-Gate |
| --- | --- | --- | --- | --- | --- |
| 1.0.0 |  |  | initial | Initial gate result. | no |
```

## Result Rules

| Result | Can Continue | Required Path |
| --- | --- | --- |
| PASS | yes | Follow Development Path Decision. |
| PASS_WITH_RISK | yes | Continue only if Risk Acceptance is complete. |
| FAIL | no | Return to `01-技术方案`. |

## Manifest Update Suggestions

For `DIRECT_IMPLEMENTATION`:

```text
Development Path Decision: DIRECT_IMPLEMENTATION
Decision Scope: FULL_REQUIREMENT / DELTA_CHANGE
Complexity: SIMPLE or MEDIUM
Delta Complexity: SIMPLE or MEDIUM when Decision Scope = DELTA_CHANGE
Full SDD Override: none
Development Path Decision must be based on Delta Scope when Decision Scope = DELTA_CHANGE
Next Step: enter implementation and write 03-实现记录 after code changes
```

For `SPECKIT_PIPELINE_REQUIRED`:

```text
Development Path Decision: SPECKIT_PIPELINE_REQUIRED
Decision Scope: FULL_REQUIREMENT / DELTA_CHANGE
Complexity: COMPLEX, or SIMPLE/MEDIUM with explicit full SDD override
Delta Complexity: COMPLEX when Decision Scope = DELTA_CHANGE
SPECKIT_PIPELINE_REQUIRED only when delta itself is complex for supplement changes
Full SDD Override: none / user_requested / later_gate_required
Next Step: ask user to confirm entering sdlc-speckit-pipeline
```

For `BLOCKED_NEEDS_REVISION`:

```text
Current Status: blocked
Current Stage: 01-技术方案
Development Path Decision: BLOCKED_NEEDS_REVISION
Decision Scope: FULL_REQUIREMENT / DELTA_CHANGE
Complexity: BLOCKED_UNKNOWN when complexity cannot be classified
Delta Complexity: BLOCKED_UNKNOWN when Current Change Scope / Delta Scope is missing or not reviewed
Next Step: revise technical specification and re-run sdlc-solution-reviewer
```

For Requirement Supplement or Specification Missing, the report must explicitly state:

```text
Do not route by aggregate complexity for requirement supplements.
Aggregate Complexity: reference only
Ignored Aggregate Triggers: <original DB/MQ/schedule/multi-module triggers not touched by delta>
Development Path Decision must be based on Delta Scope.
```

## Artifact Naming

When writing a local artifact, use:

```text
library/{requirement_id}/02-方案审核/{requirement_id}_方案审核.md
```

Update the stable artifact file and increment its internal Metadata Version; preserve history in 修订记录 and Git history.

The report body must contain only the current effective review conclusion. Do
not create `_vN.md` files for revised reviews; update the stable path and mark
downstream artifacts stale when the reviewed artifact version changes.

## Response-Only 与 Persisted 示例

默认 response-only 时，输出必须精确使用：

```text
Development Path Decision Artifact: not_persisted
Development Path Decision Artifact Status: not_persisted
```

response-only 结果仍是本次响应中的审核结论，但不得伪装为 Manifest 可稳定追踪的 persisted evidence；不得虚构路径、版本、文件存在性或 `current` 状态。

持久化示例：

```text
Development Path Decision Artifact: library/{requirement_id}/02-方案审核/{requirement_id}_方案审核.md
Development Path Decision Artifact Status: current
```

只有当方案审核 artifact 位于稳定路径、可读取、未被 replaced、所审核的技术方案版本仍是当前有效版本且自身未 stale 时，才可以标记为 `current`；否则为 `stale`。

## Compatibility-Read（历史 Recommendation 字段）

旧字段 `Development Path Recommendation` 只允许作为历史 artifact 的 compatibility-read 输入：

- 读取旧 artifact 时，把 `Development Path Recommendation` 解释为对应的 canonical `Development Path Decision`。
- 新写 response、Markdown artifact、Manifest recommendation 和示例不得输出旧字段。
- 不得双写 Recommendation 和 Decision。
- 不要求迁移或重写历史 artifact。
- 不得删除历史兼容读取能力。

active output template 中不得出现 `Development Path Recommendation` 字段行。
