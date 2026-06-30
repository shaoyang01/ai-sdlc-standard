# Governance Portability

## Purpose

This guide defines how AI SDLC Standard should share `.specify` governance rules across repositories.

The standard package owns shared governance rules. Target repositories own only repository-specific facts and profiles.

When `sdlc-speckit-pipeline` runs, it must read shared rules from this standard package first, then read the target repository profile. Business-domain documents are generated after migration by a repository bootstrap step and are not copied from other repositories.

## Ownership Model

### Standard Package Owns

Shared rules live in `ai-sdlc-standard` and must not be copied into every repository.

Shared ownership includes:

- Lifecycle and phase rules.
- DocFlow and artifact storage rules.
- Complexity routing.
- Change control and Re-Gate rules.
- Skill contracts and Skill category rules.
- Governance portability rules.
- Generic documentation metadata and revision rules.
- Generic AI write-lock and authorization rules.
- Generic SDD stage sequence.
- Generic sync and reconciliation principles.
- Generic business-domain structure rules.
- Generic templates for project profiles and entry coverage profiles.

### Target Repository Owns

Repository-specific facts stay in the target repository.

Project ownership includes:

- `.specify/project-governance-profile.yaml`
- `.specify/entry-coverage-profile.yaml`
- `.specify/business-domain-bootstrap.yaml`
- `.specify/business_domain/**` generated after migration
- `.specify/reports/**`
- optional project-specific coding guide overlays
- optional project-specific governance exceptions
- codebase-specific module layout, entry types, class naming rules, and evidence-chain rules

The target repository should not store copies of shared workflow or memory documents unless they are legacy files or explicit project overrides.

## Migration Output Files

Migration should create or update only the governance skeleton and project profiles:

```text
.specify/
├── project-governance-profile.yaml
├── entry-coverage-profile.yaml
├── business-domain-bootstrap.yaml
└── reports/
```

`business_domain/**` is outside the migration payload. It must be regenerated from the target repository after migration.

Do not require these shared files in the target repository:

```text
.specify/memory/DocumentationStandard.md
.specify/memory/AiGovernance.md
.specify/memory/InteractionProtocol.md
.specify/memory/RoleAtlas.md
.specify/workflow/SDDWorkflow.md
.specify/workflow/GovernanceAuditWorkflow.md
.specify/workflow/QualityWorkflow.md
```

If a repository already has those files, treat them as legacy project-local copies. During migration, classify each rule as shared, project override, or obsolete.

## Project Profile

`project-governance-profile.yaml` tells agents how the standard package applies to this repository.

It should describe:

- Project name and repository type.
- Source roots and module globs.
- Location of `.specify`, `specs`, and `library`.
- Which standard package version is used.
- Whether legacy `.specify/memory` or `.specify/workflow` files still exist.
- Project-specific overlays and exceptions.
- Required project-generated documents.

Use `templates/project-governance-profile-template.yaml`.

## Entry Coverage Profile

`entry-coverage-profile.yaml` tells audit tools and agents how to discover code entries and evidence chains in this repository.

It should describe:

- Entry types.
- Path patterns.
- Class suffixes.
- Exclude patterns.
- Service, manager, mapper, DAO, controller, listener, schedule, worker, processor, or equivalent layer rules.
- Business-chain evidence model.
- Technical-bridge evidence model.
- Strict-mode blocking outputs.

Use `templates/entry-coverage-profile-template.yaml`.

## Post-Migration Generated Documents

The standard package does not know each repository's business domains. After migration, an agent or script must inspect the target repository and generate repository-owned business-domain documents.

### Business Domain Bootstrap Outputs

```text
.specify/business_domain/00BusinessLandscape.md
.specify/business_domain/00UbiquitousLanguage.md
.specify/business_domain/01DomainCatalog.md
```

These files are generated after migration. Do not copy them from another repository.

`00BusinessLandscape.md` should include:

- Repository business purpose.
- Fact-source layering.
- Routing principle.
- Main business domains.
- Code anchors for each domain.

`00UbiquitousLanguage.md` should include:

- Domain terms.
- Common abbreviations.
- Entity and status vocabulary.
- Cross-team wording rules.

`01DomainCatalog.md` should include:

- L1/L2 domain index.
- Main document paths.
- Planned L4 count or maturity.
- Routing notes.

### Required Project Profiles

```text
.specify/project-governance-profile.yaml
.specify/entry-coverage-profile.yaml
.specify/business-domain-bootstrap.yaml
```

These profiles should be regenerated or reviewed when:

- The repository module layout changes.
- Entry types change.
- Evidence-chain rules change.
- The repository migrates to a new standard package version.

### Optional Project Documents

Create only when the repository needs them:

```text
.specify/coding_guide/ProjectCodingGuide.md
.specify/coding_guide/BackendCodingGuide.md
.specify/coding_guide/FrontendCodingGuide.md
.specify/project-overrides.md
```

Optional project documents must contain project-specific facts. Do not copy shared standard-package rules into them.

## Migration Workflow

Use this workflow when applying AI SDLC Standard to a repository.

### Step 1: Read Standard Package

Read from `ai-sdlc-standard`:

- `README.md`
- `ai-sdlc/lifecycle.md`
- `ai-sdlc/artifact-storage.md`
- `ai-sdlc/change-control.md`
- `ai-sdlc/complexity-routing.md`
- `ai-sdlc/governance-portability.md`
- relevant `skills/sdlc-*/` instructions

### Step 2: Inspect Target Repository

Inspect:

- module layout
- source roots
- existing `.specify/**`
- existing `specs/**`
- domain terminology
- major entry points
- existing code architecture and layer names

### Step 3: Classify Existing `.specify` Files

For each existing `.specify` file, classify it as:

| Classification | Meaning | Action |
| --- | --- | --- |
| Shared rule duplicate | Same rule already lives in standard package. | Remove from future required set or mark legacy. |
| Project profile fact | Module layout, entry types, evidence chain, project paths. | Move into profile. |
| Project business fact | Business domain, glossary, lifecycle, status, code anchor. | Exclude from migration; regenerate after bootstrap. Existing target-repository facts may be used only as bootstrap input. |
| Project override | Necessary repository-specific exception. | Keep as explicit override. |
| Obsolete | No longer valid or conflicts with standard. | Do not migrate. |

### Step 4: Generate Governance Skeleton

Create or update:

- `.specify/project-governance-profile.yaml`
- `.specify/entry-coverage-profile.yaml`
- `.specify/business-domain-bootstrap.yaml`

Profiles must be explicit enough that another agent can run `sdlc-speckit-pipeline` without reading legacy `.specify/memory` or `.specify/workflow` copies.

Do not migrate `.specify/business_domain/**` content from another repository.

### Step 5: Run Business Domain Bootstrap

After migration, run the repository-specific business-domain bootstrap step described by `.specify/business-domain-bootstrap.yaml`.

The bootstrap step should inspect the target repository and generate:

- `00BusinessLandscape.md`
- `00UbiquitousLanguage.md`
- `01DomainCatalog.md`
- L1/L2/L4 skeletons only from observed business domains or user-approved target domains.

### Step 6: Validate Migration

Before using the migrated repository:

- Confirm shared rules are not duplicated as required local files.
- Confirm project profiles exist and are readable.
- Confirm business-domain bootstrap configuration exists.
- Confirm entry coverage profile can express all important entry types.
- Confirm project-specific exceptions are explicit.

## Pipeline Read Order

When `sdlc-speckit-pipeline` starts:

1. Read standard package rules.
2. Read `.specify/project-governance-profile.yaml`.
3. Read `.specify/entry-coverage-profile.yaml` if entry coverage or sync is needed.
4. Read `.specify/business-domain-bootstrap.yaml` if business-domain documents are missing.
5. If business-domain documents exist, read `.specify/business_domain/00BusinessLandscape.md`.
6. Read `.specify/business_domain/00UbiquitousLanguage.md`.
7. Read `.specify/business_domain/01DomainCatalog.md`.
8. Read only the L1/L2/L4 documents relevant to the current requirement.

Do not read legacy `.specify/memory/**` or `.specify/workflow/**` as authoritative unless the project profile explicitly marks them as project overrides.

## Blocking Conditions

Stop migration or pipeline activation when:

- Project profile is missing.
- Entry coverage is required but entry coverage profile is missing.
- Business-domain documents are missing and bootstrap configuration is missing.
- Legacy local rules conflict with standard package rules.
- Project-specific exceptions are implicit or undocumented.
- The agent would need to guess business domains from package names only.

## Non-Goals

This guide does not:

- Copy shared standard files into target repositories.
- Migrate `.specify/business_domain/**` content from another repository.
- Move project business facts into the standard package.
- Replace `specs/**` as the short-term feature source.
- Replace `.specify/business_domain/**` as the long-term repository knowledge source.
- Implement the entry coverage audit engine.
