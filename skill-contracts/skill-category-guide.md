# Skill Category Guide

## Purpose

This guide defines how AI SDLC Standard classifies workflow Skills.

Use it before creating or changing any `sdlc-*` Skill contract. The category determines default responsibility, input/output expectations, side effects, and stop conditions.

This guide applies to AI SDLC workflow Skills only. Professional domain Skills, such as WMS configuration Skills, are outside this standard package unless they are explicitly used as evidence inside a requirement workflow.

## Category Selection Rules

Choose the narrowest category that describes the Skill's primary responsibility.

When a Skill has multiple responsibilities:

- Put the primary category first.
- Add secondary categories only when the Skill actually produces that type of side effect.
- Do not use a broad category to gain permission for unrelated work.
- Declare every side effect explicitly in the Skill contract.

Examples:

| Skill | Category | Reason |
| --- | --- | --- |
| `sdlc-requirement-normalizer` | Intake Skill / Producer Skill | Converts raw requirement input into a normalized requirement artifact. |
| `sdlc-specification-writer` | Producer Skill | Writes a technical specification from approved requirement input. |
| `sdlc-solution-reviewer` | Auditor Skill | Reviews a solution and decides path/risk without implementing. |
| `sdlc-code-review-excellence` | Reviewer Skill / Auditor Skill | Executes code review and classifies findings without fixing code. |
| `sdlc-code-review-normalizer` | Reviewer Skill / Producer Skill | Converts raw review feedback into a standard report artifact. |
| `sdlc-speckit-implement` | Executor Skill / Producer Skill | Modifies code and records implementation evidence. |
| `sdlc-docflow-writer` | Producer Skill / Renderer Skill / Publisher Skill | Writes and renders DocFlow artifacts, including Lark/Feishu publishing when authorized. |
| `sdlc-speckit-sync` | Sync Skill / Producer Skill | Writes authorized stable facts to long-term knowledge targets. |
| `sdlc-speckit-pipeline` | Workflow Skill / Executor Skill / Sync Skill | Orchestrates child stages and delegates side effects to child Skills. |

## Category Definitions

### Intake Skill

Use when the Skill normalizes raw input before formal specification.

Responsibilities:

- Identify requirement source, business goal, scope, constraints, and missing context.
- Preserve source traceability.
- Stop on conflicting or insufficient input.

Default side effects:

- May write normalized requirement documents when requested.
- Must not modify code or knowledge bases.

Typical outputs:

- Normalized requirement.
- Source summary.
- Missing information list.

### Producer Skill

Use when the Skill creates or updates a standard workflow artifact.

Responsibilities:

- Generate artifacts from approved inputs and schemas.
- Preserve scope and source traceability.
- Recommend manifest updates.

Default side effects:

- May write documents or `specs/**` only when the contract allows it.
- Must not modify production code unless paired with Executor.
- Must not write knowledge bases unless paired with Sync.

Typical outputs:

- Requirement, specification, plan, tasks, report, implementation record, checklist, or sync proposal.

### Auditor Skill

Use when the Skill checks quality, completeness, consistency, or Gate readiness.

Responsibilities:

- Inspect artifacts against schemas, checklists, and approved scope.
- Identify risks, blockers, missing evidence, and earliest affected upstream node.
- Produce Gate or Re-Gate recommendations.

Default side effects:

- Read-only by default.
- May produce review/audit reports.
- Must not implement fixes.

Typical outputs:

- Review report.
- Gate result.
- Blocking items.
- Re-Gate recommendation.

### Reviewer Skill

Use when the Skill reviews implementation, feedback, or human/AI findings.

Responsibilities:

- Evaluate reviewable evidence such as code diff, raw review, test feedback, or implementation record.
- Classify findings with severity, file/symbol evidence, impact, and suggested next step.
- Distinguish blocking findings from suggestions.

Default side effects:

- Read-only by default.
- May produce review results.
- Must not fix code unless also explicitly classified as Executor and the contract allows it.

Typical outputs:

- Code review result.
- Test feedback classification.
- Normalized findings.

### Executor Skill

Use when the Skill modifies production code, tests, configuration, tasks, or other executable project state.

Responsibilities:

- Execute only approved tasks.
- Model concrete normal, boundary, failure, and compatibility cases before code changes.
- Run relevant verification.
- Record changed files, verification results, unfinished work, and residual risk.

Default side effects:

- May modify code only when the contract explicitly permits it.
- May update task status only for verified completed tasks.
- Must not expand scope or invent business behavior.

Typical outputs:

- Code changes.
- Test updates.
- Task status updates.
- Implementation result.

### Renderer Skill

Use when the Skill changes artifact presentation format.

Responsibilities:

- Render standard artifacts into Markdown, HTML, PDF, Lark/Feishu, or other presentation formats.
- Preserve schema-required content and semantic meaning.
- Respect output path and publishing rules.

Default side effects:

- May write rendered documents when target path is explicit.
- Must not reinterpret business content.

Typical outputs:

- Rendered Markdown, HTML, PDF, or online document.

### Publisher Skill

Use when the Skill publishes an artifact to an external system.

Responsibilities:

- Verify identity, authorization, target, update mode, backup, and failure handling.
- Record published URL or external document identifier.
- Stop on missing authorization.

Default side effects:

- May call external tools only when authorized.
- Must record publishing result and failure state.

Typical outputs:

- Published document.
- External URL.
- Manifest recommendation.

### Sync Skill

Use when the Skill writes stable verified facts to long-term knowledge or shared standards.

Responsibilities:

- Filter stable reusable facts from verified source artifacts.
- Select explicit target path and owner.
- Require write authorization.
- Preserve existing knowledge structure.

Default side effects:

- May modify knowledge targets only with explicit authorization.
- Must not sync chat fragments, temporary debugging notes, or one-off delivery facts.

Typical outputs:

- Knowledge update.
- Checklist/schema update proposal.
- Sync report.

### Workflow Skill

Use when the Skill orchestrates multiple child Skills or lifecycle stages.

Responsibilities:

- Verify activation conditions.
- Sequence child Skills.
- Stop on child Skill blockers.
- Preserve confirmation boundaries.
- Delegate side effects to the responsible child Skill.

Default side effects:

- Should not perform child-stage work directly when a specialized `sdlc-*` Skill exists.
- May recommend manifest Activity Log updates.
- Must not bypass child Skill contracts.

Typical outputs:

- Stage timeline.
- Gate summary.
- Next-step routing.

## Side Effect Defaults

| Category | Code | Docs | Knowledge | Commands | External Systems |
| --- | --- | --- | --- | --- | --- |
| Intake | no | optional | no | optional read-only | no |
| Producer | no by default | yes when authorized | no by default | optional | no by default |
| Auditor | no | report only | no | optional read-only | no |
| Reviewer | no | report only | no | optional read-only | no |
| Executor | yes when authorized | optional | no by default | yes | no by default |
| Renderer | no | yes | no | optional | optional when paired with Publisher |
| Publisher | no | yes | no | yes | yes when authorized |
| Sync | no | optional | yes when authorized | optional | optional |
| Workflow | delegated | delegated | delegated | delegated | delegated |

If a Skill needs a side effect outside its default category, declare a secondary category and explain the permission in the Skill contract.

## Composite Category Rules

Use composite categories carefully:

- `Producer Skill / Auditor Skill`: allowed when the Skill both creates an artifact and checks its Gate readiness.
- `Reviewer Skill / Producer Skill`: allowed when raw review or feedback is converted into a standard report.
- `Executor Skill / Producer Skill`: allowed when implementation also records implementation evidence.
- `Sync Skill / Producer Skill`: allowed when sync produces a report or proposed update.
- `Producer Skill / Renderer Skill / Publisher Skill`: allowed when content writing, rendering, and external publishing are all supported.
- `Workflow Skill / Executor Skill / Sync Skill`: allowed only when the workflow may reach implementation and sync stages through child Skills.

Do not use composite categories to blur ownership. The contract must say which part owns each output and side effect.

## Blocking Defaults

Every category must stop when:

- Required input is missing.
- Current artifact is superseded.
- Source-of-truth conflict cannot be resolved.
- Continuing would require guessing business behavior.
- Continuing would expand approved scope.
- Required write authorization is missing.

Executor, Sync, and Publisher Skills have stricter stop conditions because their side effects are higher risk.

## Contract Checklist

Every Skill contract must answer:

- What category or categories apply?
- What input artifacts are required?
- What output artifacts are produced?
- What side effects are allowed?
- Which side effects are explicitly forbidden?
- Which Gate is required before running?
- Which Gate or Skill consumes the output?
- What missing input or conflict forces a stop?
- Does the Skill modify code, docs, knowledge, commands, or external systems?

If these answers are unclear, do not mark the Skill active.
