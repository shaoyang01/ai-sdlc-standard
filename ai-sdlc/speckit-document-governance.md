# Speckit Document Governance

## Purpose

This guide defines shared Speckit document governance rules for AI SDLC Standard.

It distills reusable rules from existing project practices into standard-package rules. Project-specific module names, business domains, code anchors, and local terminology must remain in the target repository profiles or generated business-domain documents.

## Standardized Rules From Existing Practice

The following rules are standard-package rules:

- Speckit fact-source layering.
- Metadata, author, and revision requirements.
- Business-domain document structure.
- Document splitting rules.
- Domain route and sync principles.
- AI write-lock behavior.
- Interaction levels.
- SDD node order and node artifact expectations.
- Governance audit checklist.
- Quality gate checklist.
- Entry coverage evidence model.
- Java/Spring backend engineering checklist as an optional project-type profile.

The following are project-owned facts:

- concrete business domains
- L1/L2/L4 names
- repository module paths
- entry type names and path patterns
- class naming exceptions
- framework-specific utility class names
- API module names
- MQ topic names
- generated audit reports
- generated business-domain content

## Fact Source Layering

Use these layers:

| Layer | Path | Owner | Purpose |
| --- | --- | --- | --- |
| Standard rules | `ai-sdlc-standard/**` | Standard package | Shared governance, gates, contracts, templates, and bootstrap scripts. |
| Short-term feature facts | `specs/{feature}/**` | Target repository | Single-requirement process artifacts and machine-readable Speckit facts. |
| Human handoff and gates | `library/{requirement_id}/**` | Target repository or document workspace | Human-readable requirement, solution, review, implementation, code review, and acceptance artifacts. |
| Long-term business facts | `.specify/business_domain/**` | Target repository | Stable business-domain knowledge generated from the target repository. |
| Project profiles | `.specify/*.yaml` | Target repository | Project-specific configuration for standard rules. |
| Runtime reports | `.specify/reports/**` | Target repository | Regenerated local audit outputs. |

Do not make target-local `.specify/memory/**` or `.specify/workflow/**` the default shared rule source. They are allowed only as legacy files or explicit project overrides.

## Shared And Private Document Boundaries

The standard package and target repository documents are both required, but they have different authority.

Shared standard documents define:

- workflow stage order
- gate semantics
- artifact schemas
- generic checklists
- generic document governance
- generic Speckit project bootstrap rules
- Skill contracts

Project private documents define:

- business-domain facts
- repository module structure
- codebase-specific coding rules
- framework adapter names
- utility classes and local conventions
- deployment/runtime notes
- integration topology
- explicit local overrides

Project private documents must be generated under `.specify/project-context/**` and declared in `.specify/project-governance-profile.yaml` before they are treated as required workflow context.

For legacy mixed documents, follow `speckit-document-split.md`: bootstrap or a one-time split task extracts the private half into `.specify/project-context/**`, while shared rules stay in the standard package.

If a local legacy document is not declared, new `sdlc-*` Skills must not read it as normal workflow context.

New `sdlc-*` Skills should not classify legacy mixed documents during normal workflow execution. Classification happens only during project bootstrap or a one-time split task. After that, Skills use:

| Content type | Read from |
| --- | --- |
| Shared workflow, gate, schema, or generic checklist | `${AI_SDLC_STANDARD_HOME}` |
| Project module paths, source roots, package naming, utility classes, framework adapters, deployment notes, and runtime constraints | `.specify/project-context/**` |
| Business-domain terminology, statuses, lifecycle, and code anchors | `.specify/business_domain/**` |
| Local exception to a shared standard rule | `.specify/project-context/ProjectGovernanceOverrides.md` plus `project_overrides` profile entries |
| Runtime report or generated output | `.specify/reports/**`, regenerated locally |

## Metadata Rules

Markdown governance and business documents should include a metadata block near the top:

```markdown
> **Metadata**
> - **Version**: 0.1.0
> - **Date**: YYYY-MM-DD
> - **Author**: <git config user.name>
> - **Summary**: <one-sentence summary>
```

Rules:

1. `Date` must use `YYYY-MM-DD`.
2. Before creating or revising Markdown documents, read `git config user.name`.
3. If `git config user.name` is empty, stop before writing.
4. `Author`, `作者`, `修订者`, `修订人`, and `修改人` fields must use the current `git config user.name`.
5. Do not write model names, tool names, or local aliases into author fields.
6. `Version` should match the newest row in `## 修订记录`.
7. `## 修订记录` should stay at the end of the document.

## Revision Window

Keep revision history compact enough to be readable:

| Document type | Path scope | Recommended max rows |
| --- | --- | --- |
| Standard governance document | `ai-sdlc/**`, `skill-contracts/**`, `skills/**/references/**` | 5 |
| Project profile | `.specify/*.yaml` | Store status fields instead of long prose history. |
| Business-domain document | `.specify/business_domain/**` | 5 |
| Feature process document | `specs/**` | 3 |
| Human handoff artifact | `library/{requirement_id}/**` | Use artifact version and manifest activity log. |

Version stepping:

- Major: incompatible governance, layering, naming, or workflow change.
- Minor: new rule, section, or required artifact.
- Patch: wording, typo, formatting, or non-semantic clarification.

## Business-Domain Structure

Target repositories should use this structure unless their project profile declares a different one:

- Physical root: `.specify/business_domain/`
- Physical L1/L2: directories.
- Logical L3: described inside the L2 main document.
- Logical L4: process or capability documents stored under the matching L2 directory.

Required root documents:

```text
.specify/business_domain/00BusinessLandscape.md
.specify/business_domain/00UbiquitousLanguage.md
.specify/business_domain/01DomainCatalog.md
```

Naming defaults:

| Level | Shape | Format |
| --- | --- | --- |
| L1 directory | directory | `{two_digit_number}{EnglishName}` |
| L2 directory | directory | `{two_digit_number}{EnglishName}` |
| L2 main document | file | `{L2Number}{EnglishName}({ChineseName}).md` |
| L4 main document | file | `{L1Number}{L2Number}{L4Number}{EnglishName}({ChineseName}).md` |
| L4 subdocument | file | `{L4FullNumber}{EnglishName}{Suffix}({ChineseName}).md` |

Top-level domain grouping should follow business lifecycle, business capability, or bounded context. Do not group top-level domains directly by technical folders such as `service`, `manager`, `schedule`, or `mq`.

## Document Splitting

Split a document when any condition is true:

- It is longer than about 500 lines.
- It is likely to exceed 15,000 tokens.
- It mixes audiences so heavily that business, backend, QA, and operations details become hard to scan.

Recommended L4 subdocument suffixes:

| Suffix | Meaning | Main readers |
| --- | --- | --- |
| `Spec` | Business rules and acceptance criteria. | Product, QA, developer. |
| `Arch` | Architecture, state machine, lock, compensation. | Architect, backend. |
| `API` | RPC, HTTP, MQ, error code, idempotency contracts. | Backend, integration. |
| `Impl` | Key implementation mapping and edge handling. | Developer. |
| `Test` | Test strategy and regression matrix. | QA, developer. |

The main document must keep metadata, scope, child-document index, and revision history.

## Domain Route And Sync

Before writing a feature spec, identify whether the requirement is:

- `existing-change`: modifies an existing business flow.
- `new-flow`: creates a new business flow.
- `integration-change`: changes an external or cross-system contract.
- `data-change`: changes persistence, data migration, or query semantics.
- `unknown`: cannot route without more context.

For `existing-change`:

1. Read business landscape and glossary.
2. Read matched L2 main document.
3. Read relevant L4 documents.
4. List documents that may need sync after implementation.

For `new-flow`:

1. Choose L1/L2 using project profile routing rules.
2. Reserve or create L4 only after evidence or user approval.
3. Generate L4 skeleton before stable facts are synced.

Sync rule:

```text
specs/** -> .specify/business_domain/** -> project profiles or overrides only when governance facts changed
```

Do not sync chat fragments, unstable implementation notes, or unapproved behavior into long-term business documents.

## AI Write-Lock

Enter governance write-lock when a task modifies:

- `.specify/**`
- `ai-sdlc-standard/**`
- root `AGENTS.md`
- Skill contracts
- lifecycle, gates, or standard templates

Write-lock behavior:

1. State the intended scope and likely side effects before writing.
2. Do not expand the scope silently.
3. Use the current `git config user.name` for document authorship when the target document requires authorship.
4. Update metadata and revision history in the same change when applicable.
5. Report files changed and validation results after writing.

## Interaction Levels

Use these levels for AI execution boundaries:

| Level | Name | Allowed | Not allowed |
| --- | --- | --- | --- |
| L0 | Consulting | Analyze, explain, review, propose. | Write files, commit, push. |
| L1 | Implementation | Modify files and run local checks. | Commit or push unless requested. |
| L2 | Delivery | Commit and produce delivery summary. | Push unless requested. |
| L3 | Remote delivery | Push, publish, broad governance rewrite. | Skip validation or hide risk. |

When L0 and L1+ intent are mixed, prefer L0 until the user confirms implementation.

## Speckit Node Artifact Specifications

Use this shared node map unless a project profile declares an explicit override:

| Stage | Required output | Main gate |
| --- | --- | --- |
| Domain Route | route decision, read/write document list | Route is not `unknown`. |
| Specify | `spec.md` or equivalent normalized specification | Requirement is testable and scope-bound. |
| Clarify | `clarification.md` when needed, updated `spec.md` | Core ambiguity is resolved or explicitly accepted. |
| Plan | `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md` as needed | Technical risks and contracts are explicit. |
| Tasks | `tasks.md` | Tasks map to approved spec and plan. |
| Analyze | consistency audit result | No blocking mismatch across spec, plan, and tasks. |
| Implement | code changes, verification evidence, implementation record | Code follows approved tasks and verified scope. |
| Sync | sync report and business-domain updates when authorized | Only stable reusable facts are synced. |
| Reconcile | drift report and optional authorized fixes | Code, specs, DocFlow, and business docs are consistent. |

Small requirements may skip full Speckit pipeline when `sdlc-solution-reviewer` approves direct implementation. In that case, `sdlc-specification-writer` and `sdlc-solution-reviewer` outputs can act as lightweight Specify and Clarify evidence.

## Entry Coverage Evidence Model

Entry coverage is project-specific in discovery, but standard in evidence shape.

Business entry evidence should prefer:

```text
Entry -> Service -> Manager -> Persistence
```

Technical bridge evidence is allowed when an entry does not directly advance business state. Examples:

- view-only route
- framework listener
- client/template/invoker bridge
- event adapter
- health or diagnostic endpoint

Strict mode should block when:

- an important entry has no matched L4 document
- a business entry lacks an evidence chain
- a core service is not reached by any archived entry
- an entry maps to multiple L2 domains without explicit conflict handling
- required reports are missing

Project-specific entry types, class suffixes, and path patterns belong in `.specify/entry-coverage-profile.yaml`.

## Governance Audit Checklist

Audit these areas:

| Area | Blocking examples |
| --- | --- |
| Shared rule ownership | Same rule duplicated or conflicting between standard package and project-local files. |
| Metadata | Missing metadata, stale version, invalid author field, revision history not updated. |
| Business-domain structure | Missing root documents, invalid L1/L2/L4 naming, technical top-level grouping. |
| Feature artifacts | Missing spec, plan, tasks, checklist, or gate output. |
| Traceability | Tasks not traceable to spec, implementation not traceable to tasks, sync not traceable to stable facts. |
| Quality | Missing tests, unclear rollback, missing idempotency, missing contract update. |
| Entry coverage | Missing inventory, missing evidence matrix, non-empty strict blocking reports. |

## Java/Spring Backend Checklist

This is an optional project-type standard. Use it for Java/Spring backend repositories, then override project-specific details in profiles.

General rules:

- Entry layer should delegate, validate inputs, and avoid hidden business state changes.
- Service layer should orchestrate business use cases.
- Manager or equivalent domain-operation layer should own state transitions, locks, batch persistence, and core validation when the project uses that pattern.
- Persistence layer should not contain business decisions.
- External DTO/entity/model conversion should use explicit converters.
- Do not expose persistence entities through external contracts.
- Define transaction boundaries explicitly.
- Do not wrap remote calls, MQ sends, or long-running operations in long transactions.
- State-machine changes must document source state, target state, compensation, and rollback.
- Avoid `SELECT *`.
- Avoid DB/RPC/MQ calls inside loops when batch alternatives exist.
- Check SQL indexes, lock granularity, and N+1 risk for core queries.
- Centralize cache keys, lock keys, configuration keys, MQ topics, and idempotency identifiers.
- Logs must include relevant business identifiers and must not expose secrets.
- Error logs should retain exception stack traces.
- Core business changes require automated tests or repeatable verification steps.
- Contract, MQ, and state-machine changes require regression matrix updates.

Project-specific module names, utility classes, topic names, and framework adapters belong in `.specify/project-governance-profile.yaml` or a project coding-guide overlay.
