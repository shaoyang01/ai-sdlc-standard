# AGENTS.md Rail Routing Addendum

> **Template**: Append this addendum to project `AGENTS.md` when adopting New-Rail AI SDLC.
> **Policy**: This is an addendum suggestion. Do not automatically overwrite the project's existing `AGENTS.md`. Present for user review and only modify `AGENTS.md` with explicit user authorization.

---

## AI SDLC New-Rail Addendum

This project supports both legacy Speckit and New-Rail AI SDLC workflows. The following rules determine which rail is active.

### Rail Selection

- `/speckit.*` and `$speckit-*` commands → **legacy Speckit rail**. Continue using existing Speckit skills, `.specify/memory/`, `.specify/workflow/`, and `.specify/coding_guide/` as before.
- `sdlc-*` and `sdlc-speckit-*` commands, or explicit phrases `new rail`, `AI SDLC 标准库`, `使用新版 sdlc` → **New-Rail AI SDLC rail**. Use only `sdlc-*` and `sdlc-speckit-*` skills with `${AI_SDLC_STANDARD_HOME}` standard rules and `.specify/project-context/` project-private documents.
- If the rail is ambiguous and the request involves writing to `.specify/business_domain/`, ask the user which rail to use before writing.

### Artifact Ownership

| Artifact Area | Lifecycle | Rail |
| --- | --- | --- |
| `specs/` | Run-level (per pipeline execution) | Either rail |
| `library/{requirement_id}/` | Requirement-level (AI SDLC DocFlow workspace) | New-Rail SDLC |
| `.specify/business_domain/` | Long-term shared knowledge base | Both rails |
| `.specify/memory/` | Legacy governance source | Legacy Speckit only |
| `.specify/workflow/` | Legacy workflow definition | Legacy Speckit only |
| `.specify/coding_guide/` | Legacy coding rules | Legacy Speckit only |
| `.specify/project-context/` | New-Rail project-private documents | New-Rail SDLC only |

### New-Rail Redlines

New-Rail must never read or write:
- `.specify/memory/**`
- `.specify/workflow/**`
- `.specify/coding_guide/**`

### Specs

- Specs are run-level artifacts. One pipeline run produces one set of specs.
- The same requirement may have multiple specs runs across different rails.
- After business_domain sync, specs may be archived.

### Business Domain

- `.specify/business_domain/` is the shared long-term knowledge base for both rails.
- Writes must follow shared governance rules and record the rail/source.
- When target L4 exists, update the existing document; do not create a parallel L4.

### Library

- `library/{requirement_id}/` is the AI SDLC requirement-level DocFlow workspace.
- Simple requirements may only produce library artifacts without running Speckit pipeline.
- Library artifacts may serve as sync sources for business_domain in `library_driven` mode.
