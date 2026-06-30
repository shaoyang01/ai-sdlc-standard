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

Draft using `templates/technical-specification-template.md`.

Keep sections even when details are missing:

- Use `不涉及` for truly irrelevant sections.
- Use `待确认` for relevant but unknown sections.
- Use concise bullets for constraints and tests.

## Step 5: Self-Check

Before output, check:

- All ESS required sections exist.
- Scope is explicit.
- Behavior constraints answer old-flow preservation.
- Failure and timeout behavior are stated.
- State and data behavior are stated.
- Tests cover main path, miss path, failure path, idempotency, and old-flow compatibility.
- Pending confirmations are not hidden.

## Step 6: Handoff

After output:

- Recommend `sdlc-solution-reviewer`.
- Recommend manifest Artifact Index and Activity Log updates.
- If HTML or Lark/Feishu output is requested, route through `sdlc-docflow-writer`.
