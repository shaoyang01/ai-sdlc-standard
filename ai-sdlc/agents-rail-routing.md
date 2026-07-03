# AGENTS.md Rail Routing

> **Reference**: `${AI_SDLC_STANDARD_HOME}/ai-sdlc/agents-rail-routing.md`

## Purpose

Define how project `AGENTS.md` routes between legacy Speckit rail and New-Rail AI SDLC rail when both are declared or implied.

## Rail Definitions

### legacy_speckit rail

Activated by legacy Speckit commands and patterns:

- `/speckit.*` slash commands
- `$speckit-*` skill invocations
- Explicit references to `.specify/memory/**`, `.specify/workflow/**`, `.specify/coding_guide/**` as authoritative sources
- Pipeline orchestration via legacy Speckit pipeline skill

When `legacy_speckit` rail is active:
- Use legacy Speckit skills and workflow.
- Read `.specify/memory/**` as governance source.
- Read `.specify/workflow/**` as workflow definition.
- Read `.specify/coding_guide/**` as coding rules.
- Generate specs under `specs/` or `.specify/specs/` per project convention.

### new_rail_sdlc rail

Activated by explicit New-Rail AI SDLC commands and patterns:

- `sdlc-*` skill invocations
- `sdlc-speckit-*` skill invocations
- Explicit phrases: `new rail`, `AI SDLC 标准库`, `使用新版 sdlc`
- Bootstrap-initiated project configuration via `scripts/bootstrap-speckit-project.sh`

When `new_rail_sdlc` rail is active:
- Use only `sdlc-*` and `sdlc-speckit-*` child skills.
- Read `.specify/project-context/ProjectWorkflowGuide.md` instead of `.specify/workflow/**`.
- Read `.specify/project-context/ProjectDocumentationGuide.md` instead of `.specify/memory/**` documentation guides.
- Read `.specify/project-context/ProjectCodingGuide.md` instead of `.specify/coding_guide/**`.
- Read `${AI_SDLC_STANDARD_HOME}/ai-sdlc/**` as standard rules.
- Never read `.specify/memory/**`, `.specify/workflow/**`, or `.specify/coding_guide/**` as runtime input.

## Explicit Activation Rule

The rail is determined by the first explicit command or phrase that unambiguously selects a rail:

1. If the user invokes `/speckit.*` or `$speckit-*`, the rail is `legacy_speckit`.
2. If the user invokes `sdlc-*`, `sdlc-speckit-*`, or explicitly says `new rail` / `AI SDLC 标准库` / `使用新版 sdlc`, the rail is `new_rail_sdlc`.
3. Once a rail is active for a session or requirement, do not switch mid-stream unless the user explicitly requests a different rail.

## Ambiguous Rail Handling

When the user request does not clearly indicate which rail to use:

1. If only one rail's artifacts exist (e.g., `.specify/project-context/` exists but `.specify/workflow/SDDWorkflow.md` does not), infer that rail.
2. If both rails' artifacts exist, ask the user which rail to use.
3. If the request involves writing to `.specify/business_domain/**` and the rail is ambiguous, **must ask the user before writing**.
4. Do not guess the rail when business_domain write is involved.

## AGENTS.md Addendum Policy

Project `AGENTS.md` should not be automatically overwritten by either rail. When a project adopts New-Rail:

1. Generate an addendum suggestion using `${AI_SDLC_STANDARD_HOME}/templates/agents-rail-routing-addendum.md`.
2. Present the addendum to the user for review.
3. Only append to `AGENTS.md` when the user explicitly authorizes it.
4. The addendum must preserve all existing legacy Speckit commands and references.

## Legacy Commands Remain Legacy

The following remain `legacy_speckit` rail regardless of any addendum:

- `/speckit.*` slash commands
- `$speckit-*` skill invocations

These must never be silently reinterpreted as `new_rail_sdlc` commands.

## New-Rail Redlines

New-Rail must never:

- Read `.specify/memory/**` as runtime input.
- Read `.specify/workflow/**` as runtime input.
- Read `.specify/coding_guide/**` as runtime input.
- Write to `.specify/memory/**`.
- Write to `.specify/workflow/**`.
- Write to `.specify/coding_guide/**`.
- Copy legacy document content into new-rail documents without target-code evidence or explicit user confirmation.

（New-Rail 不读取 `.specify/memory/**`、`.specify/workflow/**`、`.specify/coding_guide/**`。）

## Shared Governance

`.specify/business_domain/**` is a shared long-term knowledge base. Both rails may read and write it, subject to `${AI_SDLC_STANDARD_HOME}/ai-sdlc/shared-business-domain-governance.md`.
