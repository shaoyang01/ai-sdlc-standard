# Speckit Document Split

## Purpose

This guide fixes the split model for legacy mixed Speckit documents.

Many existing project `.specify` documents contain both shared workflow rules and project-specific facts. New `sdlc-*` Skills must not read those mixed legacy documents as their primary source. Instead, shared content is owned by AI SDLC Standard, and private content is owned by generated project-context documents.

Old documents are not moved, renamed, deleted, or rewritten by the bootstrap process. They remain available for legacy workflows.

## Split Rule

For every legacy mixed document:

```text
legacy mixed document
  -> shared part: AI_SDLC_STANDARD_HOME/**
  -> private part: target repository .specify/project-context/**
```

New `sdlc-*` Skills must read:

1. Shared standard documents from `${AI_SDLC_STANDARD_HOME}`.
2. Project profile files from `.specify/*.yaml`.
3. Project private documents from `.specify/project-context/**`.
4. Business facts from `.specify/business_domain/**`.

New `sdlc-*` Skills must not use legacy mixed documents as authoritative workflow rules.

## Generated Private Documents

Project bootstrap creates these private documents:

```text
.specify/project-context/
├── ProjectCodingGuide.md
├── RepositoryStructure.md
└── ProjectGovernanceOverrides.md
```

These documents are the project-private counterparts to shared standard documents.

| New private document | Purpose |
| --- | --- |
| `ProjectCodingGuide.md` | Project-specific coding rules, framework adapters, utility classes, package naming, local exceptions, and implementation constraints. |
| `RepositoryStructure.md` | Source roots, module boundaries, generated-code paths, excluded paths, entry directories, and repository layout notes. |
| `ProjectGovernanceOverrides.md` | Explicit local overrides to shared standard rules, including reason, owner, and affected standard rule. |

## Legacy Split Mapping

Use this mapping during project bootstrap or a one-time split task when an existing project already has legacy mixed files.

| Legacy mixed document pattern | Shared standard source | New private source |
| --- | --- | --- |
| `.specify/memory/DocumentationStandard.md` | `${AI_SDLC_STANDARD_HOME}/ai-sdlc/speckit-document-governance.md` | `.specify/project-context/RepositoryStructure.md` and `.specify/project-context/ProjectGovernanceOverrides.md` |
| `.specify/memory/AiGovernance.md` | `${AI_SDLC_STANDARD_HOME}/ai-sdlc/speckit-document-governance.md`, `${AI_SDLC_STANDARD_HOME}/ai-sdlc/change-control.md` | `.specify/project-context/ProjectGovernanceOverrides.md` |
| `.specify/memory/InteractionProtocol.md` | `${AI_SDLC_STANDARD_HOME}/ai-sdlc/speckit-document-governance.md` | `.specify/project-context/ProjectGovernanceOverrides.md` |
| `.specify/memory/EngineeringStandard.md` | `${AI_SDLC_STANDARD_HOME}/ai-sdlc/speckit-document-governance.md` | `.specify/project-context/ProjectCodingGuide.md` and `.specify/project-context/RepositoryStructure.md` |
| `.specify/coding_guide/*.md` | `${AI_SDLC_STANDARD_HOME}/ai-sdlc/speckit-document-governance.md` for generic rules | `.specify/project-context/ProjectCodingGuide.md` |
| `.specify/workflow/*.md` | `${AI_SDLC_STANDARD_HOME}/ai-sdlc/lifecycle.md`, `${AI_SDLC_STANDARD_HOME}/ai-sdlc/phase-gates.md`, `${AI_SDLC_STANDARD_HOME}/ai-sdlc/speckit-document-governance.md` | `.specify/project-context/ProjectGovernanceOverrides.md` |
| `.specify/business_domain/**` | No shared replacement. | Keep as target repository business facts. |
| `.specify/reports/**` | No shared replacement. | Regenerate as local runtime reports. |

## Skill Read Contract

When a Skill previously needed a legacy mixed document, replace that dependency with two stable reads:

```text
shared standard document from AI_SDLC_STANDARD_HOME
project private document from .specify/project-context/**
```

Examples:

| Old dependency | New dependencies |
| --- | --- |
| `DocumentationStandard.md` | `speckit-document-governance.md` + `RepositoryStructure.md` |
| `EngineeringStandard.md` | `speckit-document-governance.md` + `ProjectCodingGuide.md` |
| `SpringBackendCodingGuide.md` | Java/Spring checklist in `speckit-document-governance.md` + `ProjectCodingGuide.md` |
| `SDDWorkflow.md` | `lifecycle.md` + `phase-gates.md` + `ProjectGovernanceOverrides.md` |
| `GovernanceAuditWorkflow.md` | `speckit-document-governance.md` + `ProjectGovernanceOverrides.md` |

## Bootstrap Behavior

Project bootstrap must:

- Generate new project-context documents when missing.
- Refuse to overwrite existing project-context documents unless `--force` is used.
- Never modify legacy mixed documents.
- Record legacy mixed document patterns as legacy input in `.specify/project-governance-profile.yaml`.
- Keep shared standard paths in the standard package, not in the target repository.
- Keep new `sdlc-*` Skills pointed at `.specify/project-context/**`, not at legacy mixed documents.

## Conflict Handling

Use this rule:

```text
shared rule conflict -> standard package wins unless ProjectGovernanceOverrides.md and project_overrides declare an override
project fact conflict -> project-context or business_domain wins depending on fact type
unknown classification -> stop
```

Do not silently merge old mixed documents into new project-context documents.

New Skills do not perform this split repeatedly. If project-context documents are missing or incomplete, stop and ask for bootstrap/split update.
