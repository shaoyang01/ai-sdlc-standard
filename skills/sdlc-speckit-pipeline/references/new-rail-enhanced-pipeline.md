# New-Rail Enhanced Pipeline

## Runtime Identity

`sdlc-speckit-pipeline` is the New-Rail Enhanced Speckit Pipeline.

It is the enhanced successor of the legacy confirmed single pipeline capability, but it is not a wrapper around legacy Skills or legacy documents. At runtime it may use only:

- `sdlc-speckit-*` child Skills;
- shared standard documents from `${AI_SDLC_STANDARD_HOME}`;
- project private documents declared in `.specify/project-governance-profile.yaml`;
- generated `specs/**`, `library/**`, `.specify/reports/**`, and `.specify/business_domain/**` artifacts owned by the new rail.

Legacy Skills and legacy documents are development-time fixtures only. They may be used by standard-package maintainers to review semantic parity, but must not be read, invoked, compared, or updated during target-project runtime.

## Runtime Redlines

Do not:

- forbidden: invoke legacy `speckit-*` Skills;
- forbidden: use `.specify/memory/**` as a new-rail runtime input;
- forbidden: use `.specify/workflow/**` as a new-rail runtime input;
- forbidden: use `.specify/coding_guide/**` as a new-rail runtime input;
- forbidden: copy legacy workflow, memory, or coding guide content into generated new-rail documents;
- forbidden: run a target-project legacy-vs-new comparison as part of normal pipeline execution.

If a required project fact exists only in a legacy document, stop and ask for target-code evidence, generated business_domain evidence, or explicit user confirmation. Do not silently import it.

## Project Private Context

When present in `.specify/project-governance-profile.yaml`, load these project-context files after shared standard rules and before stage execution:

| Profile key | Default path | Purpose |
| --- | --- | --- |
| `workflow_guides` | `.specify/project-context/ProjectWorkflowGuide.md` | Local branch, release, rollback, verification, and confirmation policy constraints. |
| `documentation_guides` | `.specify/project-context/ProjectDocumentationGuide.md` | Local business_domain, L4, EntryCoverage, document index, and documentation shape rules. |
| `coding_guides` | `.specify/project-context/ProjectCodingGuide.md` | Local framework, utility, naming, and implementation conventions. |
| `architecture_guides` / `repository_structure` | `.specify/project-context/RepositoryStructure.md` | Local module boundaries, source roots, and entry locations. |
| `governance_overrides` | `.specify/project-context/ProjectGovernanceOverrides.md` | Explicit local exceptions to shared standard rules. |

Project private documents may add repository facts. They must not redefine shared standard rules unless the override is declared in the profile.

## Stage Transition Confirmation Policy

Stage transition prompts are split by the Clarify boundary:

| Segment | Stages | Transition behavior |
| --- | --- | --- |
| Pre-Clarify | Preflight, Domain Route, Specify | Ask whether to enter the next stage after each successful stage. |
| Clarify Gate | Clarify | Stop on unresolved core questions. When Clarify passes, enter continuous execution. |
| Post-Clarify continuous execution | Plan, Tasks, Analyze, Implement, Sync, Reconcile | Execute in order without asking "whether to enter the next stage" between stages. |

Before entering the Post-Clarify continuous execution segment, collect any required write authorization that is not already present:

- code implementation authorization;
- Sync target and write authorization for `.specify/business_domain/**`;
- Reconcile apply authorization, only when apply behavior is requested;
- accepted-risk owner confirmation when a downstream Gate depends on it.

If required authorization is absent, stop at the Clarify boundary and report the missing authorization. Do not continue into the continuous execution segment and then repeatedly ask between downstream stages.

## Domain Route Summary

Preflight and Domain Route must produce a compact route summary before Specify starts:

| Field | Required content |
| --- | --- |
| Route Type | `existing-change`, `new-flow`, `integration-change`, `data-change`, or `unknown`. |
| Project Type Profiles | Active profiles from `.specify/project-governance-profile.yaml` and `.specify/entry-coverage-profile.yaml`. |
| Entry Coverage Surface | HTTP/RPC/MQ/Schedule/page/route/ETL/library entries relevant to the requirement. |
| Business Knowledge Read Set | Root docs, L2, L4, EntryCoverage, or bootstrap config used for routing. |
| Missing Knowledge | Business-domain or project-context facts that block safe execution. |
| New-Rail Runtime Check | Confirmation that only `sdlc-speckit-*` Skills and new-rail documents are used. |

If Route Type is `unknown`, stop before Specify unless the user explicitly confirms the route and target documents.
