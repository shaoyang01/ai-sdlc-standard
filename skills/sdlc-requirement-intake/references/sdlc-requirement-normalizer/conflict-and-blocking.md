# Conflict And Blocking Rules

## Conflict Types

| Conflict Type | Example | Action |
| --- | --- | --- |
| Goal Conflict | One source says optimize existing flow; another says replace it. | Block and ask for source priority. |
| Scope Conflict | User says only backend; document includes frontend changes. | Block if scope affects delivery. |
| Compatibility Conflict | User says do not affect old logic; draft says remove fallback. | Block and require confirmation. |
| Success Criteria Conflict | One source requires real-time result; another allows async. | Block if acceptance changes. |
| Data Source Conflict | One source says use DB table; another says use API. | Block before specification. |
| Timing Conflict | One source says current sprint; another says future enhancement. | Record and ask if it affects delivery. |

## Blocking Conditions

Stop and report a blocked intake when:

- No readable source exists.
- The business goal cannot be identified.
- The user intent cannot be separated from implementation guesses.
- In Scope and Out of Scope cannot be separated.
- A required attachment, screenshot, or linked document is missing.
- Source conflicts affect goal, scope, compatibility, data source, or success criteria.
- Producing the artifact would require inventing business rules.

## Non-Blocking Issues

Continue with explicit notes when:

- Only wording differs between sources.
- A non-core implementation detail is missing.
- Acceptance criteria can be marked as draft without changing scope.
- The missing context is useful but not required for specification.
- The user explicitly asks for a draft and accepts that it contains pending questions.

## Change Or Rework Detection

Treat input as a change or rework when it mentions:

- "补充一下"
- "少了一块"
- "刚刚实现完发现漏了"
- "不是完整需求"
- "在原需求上补一个细节"
- "还是同一个需求"
- "需求变了"
- "不是这个意思"
- "理解错了"
- "重新设计"
- "开发到一半发现"
- "测试发现原方案不对"
- "方案需要调整"
- "之前那个不要这样做"

Also detect change or rework when new input contradicts an existing current artifact.

Treat "已实现后发现遗漏细节", "开发过程中发现方案缺口", "测试或 Review 暴露规格遗漏", and any Specification Missing as Same Requirement candidates when the business goal is unchanged.

## Same Requirement Or New Requirement

Default to the same `requirement_id` when:

- Intake Classification is Requirement Supplement, Requirement Change, Rework, Specification Missing, or Feedback-Driven Change and the business goal is unchanged.
- The business goal is unchanged.
- The change only adds edge cases, compatibility rules, or acceptance details.
- The implementation approach changes but the user-facing goal remains the same.
- The issue is a specification missing or implementation bug within the same delivery.

Recommend a new `requirement_id` when:

- The business goal is different.
- The new work can be scheduled, delivered, or accepted independently.
- The original requirement is already completed and the input is a follow-up enhancement.
- Keeping the change in the old flow would make Gate decisions unreadable.
- The user explicitly asks to split it.

For same-requirement supplements, always output:

```text
Same Requirement Decision:
Same Requirement: yes
Parent Requirement ID:
New Requirement Needed: no
Current Change Scope / Delta Scope:
Aggregate Requirement Scope:
Aggregate Scope Reference:
Out of Delta Scope:
Earliest Affected Node:
Required Re-Gate:
Decision Scope: DELTA_CHANGE
Decision Scope Values: FULL_REQUIREMENT / DELTA_CHANGE
Re-Gate Records:
```

Block instead of guessing when Current Change Scope / Delta Scope cannot be separated from Aggregate Requirement Scope, or when the supplement may be an independent business goal.

## Downstream Impact

When the requirement already has downstream artifacts, identify the earliest affected node:

- Requirement goal, scope, or success criteria changes -> `00-需求资料`
- Behavior, compatibility, exception, data, API, state, or acceptance detail changes -> `01-技术方案`
- Gate decision or risk acceptance changes -> `02-方案审核`
- Implementation scope or verification result changes -> `03-实现记录`
- Review result changes -> `04-代码审核`
- Test feedback or acceptance evidence changes -> `05-测试验收`

Recommend Re-Gate from that node.
