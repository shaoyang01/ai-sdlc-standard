# Specification Writer Workflow

## Purpose

Use this workflow to turn requirement input or a draft solution into an ESS-compliant `01-技术方案` artifact.

Expected downstream flow:

```text
sdlc-requirement-normalizer
  -> sdlc-specification-writer
  -> sdlc-solution-reviewer
  -> DIRECT_IMPLEMENTATION / SPECKIT_PIPELINE_REQUIRED / BLOCKED_NEEDS_REVISION
```

## Step 1: Input Resolution

Resolve:

| Field | Rule |
| --- | --- |
| Requirement ID | Prefer explicit user input; otherwise infer from existing `library/{requirement_id}` path or generate a suggested ID. |
| Requirement source | Prefer `00-需求资料`; otherwise use user-confirmed requirement content. |
| Existing draft | Preserve business meaning; normalize structure only. |
| Output target | Default to Markdown under `01-技术方案`. |
| Change Event | Requirement Supplement / Requirement Change / Rework / Specification Missing / Feedback-Driven Change when the input updates an existing requirement. |
| Parent Requirement ID | Reuse the original requirement_id for same-goal supplements. |
| Decision Scope | `FULL_REQUIREMENT` for full new requirements, `DELTA_CHANGE` for supplements and specification missing changes. |

Stop if no requirement source or draft exists.

## Step 2: Requirement Understanding

Extract:

- Business goal.
- User intent.
- Current problem.
- In Scope.
- Out of Scope.
- Success criteria.
- Explicit non-goals.
- Pending questions.

If business goal or Scope cannot be determined, stop and ask for clarification.

For supplements or changes, separate:

- Aggregate Requirement Scope: the full original requirement, used as context.
- Original Scope Context: the original approved or implemented scope.
- Original Implemented / Approved Scope: what has already passed Gate or been implemented.
- Current Change Scope / Delta Scope: the only scope this change event is adding or correcting.
- Out of Delta Scope: original behavior that must not be reimplemented or re-routed by this change.

Do not collapse Current Change Scope into the full original scope.

## Step 3: Context Use

Use repository context only to clarify factual implementation constraints.

Allowed repository context:

- Existing interfaces.
- Data models.
- State transitions.
- Current flow.
- Known logs, MQ, DB, cache, or scheduler behavior.

Do not use repository context to invent new business requirements.

## Step 4: Specification Drafting

Before drafting, build the global model: enumerate the frozen applicable
material surfaces per `ai-sdlc/goal-anchored-global-reasoning.md`
(section 7) and mark each applicable or `NOT_APPLICABLE`; the local example
here defers to the shared surface list and never narrows it. Then draft
using `templates/technical-specification-template.md`.

Keep sections even when details are missing:

- Use `不涉及` for truly irrelevant sections.
- Use `待确认` for relevant but unknown sections.
- Use concise bullets for constraints and tests.

When input is a Requirement Supplement, Requirement Change, Rework, Specification Missing, or Feedback-Driven Change, the technical specification must preserve or generate:

- Change Event
- Parent Requirement ID
- Same Requirement Decision
- Current Change Scope
- Current Change Scope / Delta Scope
- Original Scope Context
- Aggregate Requirement Scope
- Delta Impact Analysis
- Affected Artifacts
- Affected Code / Module Surface
- Re-Gate Required
- Required Re-Gate
- Out of Delta Scope
- Earliest Affected Node
- Re-Gate Records

The body may be updated to current effective content, but the revision record must explain this Change Event and the Delta Scope.

## Step 5: Self-Check

Before output, check:

- All ESS required sections exist.
- Scope is explicit.
- Behavior constraints answer old-flow preservation.
- Failure and timeout behavior are stated.
- State and data behavior are stated.
- Tests cover main path, miss path, failure path, idempotency, and old-flow compatibility.
- Pending confirmations are not hidden.

Whole-model impact self-check: every applicable frozen surface from the shared reference (`ai-sdlc/goal-anchored-global-reasoning.md`, section 7) is covered or explicitly marked `不涉及`/`待确认`; direct impacts are closed per the shared reference (section 3) before the specification is reported ready.

## Step 6: Handoff

After output:

- Recommend `sdlc-solution-reviewer`.
- Recommend manifest Artifact Index and Activity Log updates.
- If HTML or Lark/Feishu output is requested, route through `sdlc-docflow-writer`.
