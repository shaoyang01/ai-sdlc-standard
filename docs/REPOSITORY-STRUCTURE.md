# Repository Structure Authority

## Purpose and Scope

This document clarifies the current authority boundaries inside the `ai-sdlc-standard` repository. It exists so that contributors, reviewers, and automation can tell which directories are the active implementation, which are compatibility/auxiliary modules, and which decisions are still open.

This is a structural map only. It does not change file paths, delete directories, or resolve open design questions.

## Current Formal Entrypoints

### Standard Package Surface

The repository ships a portable standard package whose canonical entrypoints are human- and machine-readable documents at the repository root:

- `README.md` — product overview and operational redlines
- `manifest.yaml` — standard package index (skills, templates, scripts, governance docs)
- `ROADMAP.md` — delivery roadmap
- `PORTABILITY.md` — portability constraints
- `AI_CHANGE_GUARDRAILS.md` — guardrails for AI-assisted changes

`manifest.yaml` is the standard package index. It is **not** a Runtime manifest and does not describe Runtime build behavior.

### Runtime Surface

The Runtime is a TypeScript execution engine for the SDLC graph. Its entrypoints are:

- `package.json` — Node package manifest (`ai-sdlc-runtime`)
- `runtime.ts` — primary `run()` API
- `demo.ts` — developer demo entrypoint
- `core/` — execution context, state machine VM, executors, artifacts, feedback
- `execution/` — gateway adapters and real-dispatch contracts
- `sdlc_graph/` — declarative graph and transition authority
- `tests/` — Runtime test suite
- `.github/workflows/` — CI that builds and tests the Runtime

## Current Main Implementation / Authority

The Runtime is the actively executed surface. Its authoritative modules are:

| Module | Authority |
| --- | --- |
| `runtime.ts` | Single `run(requirement, options)` interpreter that drives the graph VM and executors. |
| `core/` | Execution context builder, state machine VM, node executors, artifact collection, feedback analysis, policy memory, and skill-flow shadow integration. |
| `execution/` | `ExecutionGateway` and adapter contracts for Codex, Kimi, Hermes, and real-dispatch boundaries. |
| `sdlc_graph/graph.ts` | Pure declarative graph data: `SDLC_NODES`, `SDLC_EDGES`, and data getters. |
| `sdlc_graph/transitions.ts` | Current transition authority: `getNextNode`, `isTerminal`, `isValidTransition`, retry-loop routing, and solution-challenge routing. |
| `tests/` | Executable contract for Runtime behavior, including graph transitions, replay, gateway contracts, and capability assertions. |

`sdlc_graph/graph.ts` and `sdlc_graph/transitions.ts` together are the current Graph/transition authority. `runtime.ts` consumes them as the single source of truth for routing.

## Current Compatible / Auxiliary Modules

The following modules exist in the repository and are referenced by tests, TypeScript includes, or documentation. They are **not** described as deprecated, orphaned, or superseded. They are also **not** part of the current main Graph authority.

| Module | Role |
| --- | --- |
| `loop/` | Older static node-flow table and linear execution helpers. The Runtime no longer routes through it, but files remain for reference and potential compatibility paths. |
| `docflow/` | Linear deterministic state-machine engine and node handlers. It represents an alternative execution shape that is kept distinct from the graph-based Runtime. |
| `fanout_engine/` | Independent deterministic multi-repo fanout engine. The current main Runtime does **not** use it; Runtime fanout is inline in `core/runtime-executors.ts#executeFanout`. Long-term relationship to the Runtime is undecided. |
| `fanout_feedback/` | Independent result collection, DocFlow validation mapping, and validation report building for fanout outputs. Not wired into the current main Runtime. |
| `evolution/` | Independent read-only observability module: event collection, metrics computation, pattern analysis, and report generation. Does not influence current routing or execution. |
| `adoption/` | Rule-driven change adoption/application gateway for `EvolutionProposal` objects. Not a standard-package installation or rollout helper. |

These modules continue to compile and appear in `tsconfig.json`. Their long-term relationship to the Runtime is documented under **Open Decisions** below.

## Open Decisions

The following questions are intentionally left open and are out of scope for this structural document:

1. **Lifecycle classification of compatible/auxiliary modules** — Whether `loop/`, `docflow/`, `fanout_engine/`, `fanout_feedback/`, `evolution/`, and `adoption/` should be promoted to first-class Runtime subsystems, extracted into separate packages, or maintained as stable compatibility layers.
2. **Standard package and Runtime co-location** — Whether the standard package (`manifest.yaml`, governance docs, templates, skills) and the Runtime (`package.json`, TypeScript source) should remain in one repository or split.
3. **Single source of truth for status documents** — Which file among `docs/CURRENT_STATUS.md`, `SYSTEM_STATUS.md`, `SYSTEM_CAPABILITY_REVIEW.md`, `runtime-capabilities.json`, and the capability JSON files is the canonical status source.
4. **Runtime source layout** — Whether Runtime code should migrate into an `src/` directory or remain at the repository root.

## Capability and Material Boundaries

- Human-readable family capability evidence, contracts, and reviews are primarily organized under `docs/capabilities/**`, including the Codex, Kimi, and Hermes family directories and the Hermes phase-specific subdirectories (`docs/capabilities/hermes/phase-1/`, `docs/capabilities/hermes/phase-2/`).
- Machine-readable family capability contracts, status, and evidence are primarily organized under `metadata/capabilities/**`, including the Kimi and Hermes family directories and the Hermes phase-specific subdirectories (`metadata/capabilities/hermes/phase-1/`, `metadata/capabilities/hermes/phase-2/`).
- Historical capability report bodies may live under `docs/reports/archive/capabilities/**`; `docs/reports/archive/` remains the general location for historical reports and post-review artifacts.
- The repository root remains a mixed surface. It may contain Standard Package canonical entrypoints, high-level status/index files, machine-readable registries, consolidation/governance references, historical compatibility notes, and remaining shared/system materials. Their presence in root does not by itself make them migration leftovers, and not all root capability/material files are expected to be deleted; not all capability/material artifacts have been migrated.
- Detailed current paths, reference types, migration history, compatibility strategy, and the external-risk boundary are recorded in the [Capability Reference Matrix](CAPABILITY-REFERENCE-MATRIX.md). Its initial inventory counts are audit snapshots bound to a historical baseline, not current root file counts. External consumer risk remains `unknown` where in-repository search cannot disprove it. `CAPABILITY_ARTIFACT_DIRECTORY_CLEANUP_PLAN.md` is the original pre-migration cleanup plan, preserved as historical plan context.
- Completed path migrations do not constitute capability approval, enablement, execution, validation, operator acceptance, rollout, or ownership change.
- `temp/` is a working directory and is **not** an authoritative entrypoint.

## Review Guidance

When changing Runtime behavior, start with:

1. `runtime.ts`
2. `sdlc_graph/transitions.ts`
3. `sdlc_graph/graph.ts`
4. `core/state-machine-vm.ts`
5. The relevant `tests/**` file

When changing standard package content, start with `manifest.yaml` and the document it points to.
