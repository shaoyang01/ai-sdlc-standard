# Rail Routing and Business-Domain Sync — Expected Semantics

This is a **development-time fixture**, not target project runtime input.

## Rail Routing

- `/speckit.*` and `$speckit-*` → legacy Speckit rail. Continue using existing Speckit skills, `.specify/memory/`, `.specify/workflow/`, `.specify/coding_guide/`.
- `sdlc-*` and `sdlc-speckit-*`, `new rail`, `AI SDLC 标准库` → New-Rail AI SDLC rail.
- Ambiguous rail + business_domain write → must ask user before writing.
- AGENTS.md should not be auto-overwritten; only suggest addendum.
- New-Rail must not read or write `.specify/memory/**`, `.specify/workflow/**`, `.specify/coding_guide/**`.
- New-Rail 不读取 `.specify/memory/**`、`.specify/workflow/**`、`.specify/coding_guide/**`。

## Specs Run Lifecycle

- `specs/` is a run-level artifact, not requirement-level.
- One run = one set of specs; rail must be consistent within one run.
- Same `requirement_id` can have multiple specs runs across rails.
- After business_domain sync, specs may be archived.

## Shared Business-Domain Governance

- `.specify/business_domain/` is a shared long-term knowledge base for both rails.
- Target L4 exists → update existing document; do not create parallel L4.
- Document naming follows project current convention.
- Record rail/source in revision record.

## Sync Source Modes

- **speckit_driven**: Pipeline Sync/Reconcile path. Authoritative after pipeline sync.
- **library_driven**: No `specs/{feature}/**` required. Uses library artifacts. Without implementation/verification evidence → proposal only.
- **hybrid**: Both specs and library exist. Source priority by manifest freshness.

## Duplicate Sync Guard

- Manifest records `business_domain_sync` with `pipeline_sync_executed`, `library_sync_executed`, `duplicate_sync_guard`.
- Pipeline sync executed → library sync default blocked.
- Library sync executed → pipeline sync must read manifest.

## Redlines

- Must not use `.specify/memory/**` as runtime input
- Must not use `.specify/workflow/**` as runtime input
- Must not use `.specify/coding_guide/**` as runtime input
- Must not recommend filename-versioned artifacts

Legacy Skill usage: none
Legacy document runtime input: none
Legacy document write target: none
