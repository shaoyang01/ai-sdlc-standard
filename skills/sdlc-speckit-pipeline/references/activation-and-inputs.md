# Activation And Inputs

## Activation Modes

Allow Pipeline activation only in these cases:

- `sdlc-solution-reviewer` recommends `SPECKIT_PIPELINE_REQUIRED`.
- User explicitly says to run full SDD or full Speckit pipeline.
- A later Gate determines direct implementation is too risky and the user confirms switching to full SDD.

Do not activate by default for small requirements.

Use `${AI_SDLC_STANDARD_HOME}/ai-sdlc/complexity-routing.md` to interpret the route:

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
- `.specify/project-governance-profile.yaml` when target repository uses Speckit governance.
- `.specify/entry-coverage-profile.yaml` when entry coverage or sync is required.
- `.specify/business-domain-bootstrap.yaml` when `.specify/business_domain/**` has not been generated yet.
- Project private documents declared in `.specify/project-governance-profile.yaml` when they are required for the current stage.
- `library/{requirement_id}/manifest.md`, if available.

## Recommended Inputs

Use when available:

- Existing `specs/{feature}/spec.md`, `plan.md`, `tasks.md`.
- Existing `specs/{feature}` provenance, when the target feature directory already exists.
- Re-Gate Records.
- Superseded Artifacts.
- Existing `.specify/business_domain/**` documents generated in the target repository.
- Previous code review, test feedback, or implementation records.

Do not require target repositories to store shared `.specify/memory/**` or `.specify/workflow/**` copies. Shared governance rules come from the standard package.

Read project private documents only through `.specify/project-governance-profile.yaml` declarations and generated `.specify/project-context/**` files. Treat undeclared `.specify/memory/**` or `.specify/workflow/**` files as legacy local input, not authoritative workflow rules.

Do not classify legacy mixed documents during normal workflow execution. If a required private fact still exists only in a legacy mixed document, stop and ask to run project bootstrap or a one-time split update that writes the fact into `.specify/project-context/**`.

When a project private document conflicts with shared standard rules, require an explicit `project_overrides` entry. Otherwise stop before starting the affected stage.

Do not treat existing `specs/{feature}` as reusable merely because the feature name matches. Existing specs must be traceable to the same requirement or explicitly accepted as the current feature source.

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
