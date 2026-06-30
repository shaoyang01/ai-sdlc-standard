# Activation And Inputs

## Activation Modes

Allow Pipeline activation only in these cases:

- `sdlc-solution-reviewer` recommends `SPECKIT_PIPELINE_REQUIRED`.
- User explicitly says to run full SDD or full Speckit pipeline.
- A later Gate determines direct implementation is too risky and the user confirms switching to full SDD.

Do not activate by default for small requirements.

Use `../../../ai-sdlc/complexity-routing.md` to interpret the route:

- `COMPLEX` normally maps to `SPECKIT_PIPELINE_REQUIRED`.
- `SIMPLE` or `MEDIUM` should not activate the pipeline unless Full SDD Override is `user_requested` or `later_gate_required`.
- `BLOCKED_UNKNOWN` must return to solution revision before pipeline activation.

## Required Inputs

Collect:

- Requirement ID.
- `library/{requirement_id}/01-技术方案/*`.
- `library/{requirement_id}/02-方案审核/*`.
- Development Path Decision.
- Gate result: `PASS` or accepted `PASS_WITH_RISK`.
- `library/{requirement_id}/manifest.md`, if available.

## Recommended Inputs

Use when available:

- Existing `specs/{feature}/spec.md`, `plan.md`, `tasks.md`.
- Re-Gate Records.
- Superseded Artifacts.
- Existing `.specify/business_domain/**` documents.
- Previous code review, test feedback, or implementation records.

## Path Decision Handling

Handle development path decisions as follows:

| Decision | Pipeline Behavior |
| --- | --- |
| `SPECKIT_PIPELINE_REQUIRED` | Proceed after input readiness check. |
| `DIRECT_IMPLEMENTATION` | Stop unless the user explicitly requests full SDD. |
| `BLOCKED_NEEDS_REVISION` | Stop and return to `sdlc-specification-writer` or `sdlc-solution-reviewer`. |
| Missing | Stop and request solution review output. |

## Risk Acceptance

Allow `PASS_WITH_RISK` only when risk acceptance is explicit and current.

Stop when:

- Risk owner is missing.
- Risk acceptance is stale.
- Accepted risk contradicts later plan, tasks, implementation, or sync.
