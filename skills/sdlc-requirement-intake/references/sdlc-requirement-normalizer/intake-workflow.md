# Requirement Normalizer Intake Workflow

## Purpose

Use this workflow to turn raw requirement material into a stable `00-需求资料` artifact.

The output must make downstream work easier by separating confirmed facts, inferred structure, missing context, and source conflicts.

## Step 1: Establish The Requirement ID

Use an existing `requirement_id` when one is provided or when the input clearly refers to an active requirement.

Generate a recommended ID only when the user has not provided one:

```text
YYYYMMDD-short-name
```

Rules:

- Use lowercase ASCII words for `short-name`.
- Keep the name short and business-readable.
- Do not create a new ID for a supplement or rework when the business goal is unchanged.
- When input says "补充一下", "少了一块", "刚刚实现完发现漏了", "不是完整需求", "在原需求上补一个细节", or "还是同一个需求", default to Same Requirement and reuse the Parent Requirement ID unless the business goal or acceptance boundary is independent.
- When the same day and same name already exist, recommend `-01`, `-02`, and so on.

## Step 2: Identify The Intake Classification

Classify the request before writing the summary.

| Classification | Use When | Default Node |
| --- | --- | --- |
| New Requirement | The business goal is new and can start a fresh flow. | `00-需求资料` |
| Requirement Supplement | The user adds boundary, rule, attachment, or context to the same goal. | `00-需求资料` |
| Requirement Change | The goal, scope, rule, or success criteria changes during the flow. | `00-需求资料` or `01-技术方案` |
| Rework | Implementation or review reveals a misunderstood requirement. | Earliest affected node |
| Specification Missing | The original requirement goal is unchanged, but the technical specification misses behavior, exception, compatibility, data, interface, state, or acceptance details. | `01-技术方案` |
| Feedback-Driven Change | Test or review feedback exposes a specification gap. | `05-测试验收` plus affected upstream node |
| Documentation Correction | Only wording, typo, path, or layout changes. | Activity Log only, unless Gate is affected |

For Requirement Supplement, Requirement Change, Rework, Specification Missing, or Feedback-Driven Change, output the supplement routing fields:

```text
Intake Classification: Requirement Supplement / Requirement Change / Rework / Specification Missing / Feedback-Driven Change
Same Requirement: yes / no
Same Requirement Decision:
Parent Requirement ID:
New Requirement Needed: yes / no
Rationale:
Change Event Type:
Earliest Affected Node:
Decision Scope: FULL_REQUIREMENT / DELTA_CHANGE
Aggregate Requirement Scope:
Original Implemented / Approved Scope:
Current Change Scope / Delta Scope:
Out of Delta Scope:
Aggregate Scope Reference:
Required Re-Gate:
Re-Gate Records:
```

Rules:

- Aggregate Requirement Scope is context only.
- Current Change Scope / Delta Scope is the current routing object for downstream Development Path Decision.
- Do not merge a supplement into the original scope in a way that hides the Delta Scope boundary.
- Do not create a new requirement when the business goal is unchanged.
- New Requirement Needed = yes only when the business goal, delivery boundary, or acceptance boundary is independent.

## Step 3: Extract Stable Facts

Record only facts supported by sources:

- Business goal
- User intent
- Current problem
- Trigger scenario
- Users, roles, systems, or modules mentioned
- Initial In Scope
- Initial Out of Scope
- Draft success criteria
- Constraints and non-goals
- Required attachments or unavailable references

Use `待确认` when a statement is relevant but not confirmed.

## Step 4: Separate Fact, Inference, And Question

Use three levels:

- Confirmed: directly supported by source text or user confirmation.
- Inferred: structurally inferred from context, but not yet confirmed.
- Pending: cannot be safely inferred and requires user confirmation.

Do not promote inferred content to confirmed content.

## Step 5: Evaluate Downstream Readiness

Mark `Ready for sdlc-specification-writer: yes` only when:

- Business goal is clear.
- In Scope and Out of Scope are separated.
- Success criteria are at least draftable.
- Source conflicts do not affect core scope.
- Missing context does not affect core behavior.

Mark `Ready for sdlc-specification-writer: no` when core behavior, scope, or source priority is unresolved.

## Step 6: Recommend The Next Step

Use one of:

- `Run sdlc-specification-writer` when the intake is stable.
- `Clarify requirement source` when source priority or core scope is unresolved.
- `Apply change-control and re-Gate` when this is a change to an active flow.
- `Attach missing source` when a referenced document, screenshot, or attachment is required.

Do not recommend `sdlc-solution-reviewer` directly unless a technical specification already exists.
