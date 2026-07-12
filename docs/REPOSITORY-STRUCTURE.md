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
| `fanout_engine/` | Multi-repo fanout orchestration utilities used by the Runtime for fanout implementations. |
| `fanout_feedback/` | Feedback collection and mapping for fanout results. |
| `evolution/` | Proposal collection and metrics for runtime/evolution feedback. |
| `adoption/` | Intake, classifier, validator, and executor helpers for adopting the standard package. |

These modules continue to compile and appear in `tsconfig.json`. Their long-term relationship to the Runtime is documented under **Open Decisions** below.

## Open Decisions

The following questions are intentionally left open and are out of scope for this structural document:

1. **Lifecycle classification of compatible/auxiliary modules** — Whether `loop/`, `docflow/`, `fanout_engine/`, `fanout_feedback/`, `evolution/`, and `adoption/` should be promoted to first-class Runtime subsystems, extracted into separate packages, or maintained as stable compatibility layers.
2. **Standard package and Runtime co-location** — Whether the standard package (`manifest.yaml`, governance docs, templates, skills) and the Runtime (`package.json`, TypeScript source) should remain in one repository or split.
3. **Single source of truth for status documents** — Which file among `SYSTEM_STATUS.md`, `SYSTEM_CAPABILITY_REVIEW.md`, `runtime-capabilities.json`, and the capability JSON files is the canonical status source.
4. **Runtime source layout** — Whether Runtime code should migrate into an `src/` directory or remain at the repository root.

## Capability and Material Boundaries

- Root-level capability Markdown/JSON files (for example, `HERMES_GATEWAY_REAL_DISPATCH_*.md`, `KIMI_GATEWAY_REAL_DISPATCH_*.md`, and their JSON counterparts) are still referenced by code, tests, or documentation. Before any reorganization, a per-file reference matrix must be established.
- `docs/reports/archive/` is the location for historical reports and post-review artifacts.
- `temp/` is a working directory and is **not** an authoritative entrypoint.
- `CAPABILITY_ARTIFACT_DIRECTORY_CLEANUP_PLAN.md` describes a future cleanup plan; no root capability files have been moved or deleted.

## Review Guidance

When changing Runtime behavior, start with:

1. `runtime.ts`
2. `sdlc_graph/transitions.ts`
3. `sdlc_graph/graph.ts`
4. `core/state-machine-vm.ts`
5. The relevant `tests/**` file

When changing standard package content, start with `manifest.yaml` and the document it points to.
