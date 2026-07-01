# Speckit Generation Source Model

## Purpose

This guide defines the source model for the new AI SDLC Speckit rail.

The new rail is code-driven. It must generate project-private documents and workflow products from the target repository, explicit user-confirmed facts, and shared generation rules from this standard package.

Legacy Speckit documents are not migration content. They may be used only as abstract samples and semantic gold fixtures during standard-package development. Project bootstrap runtime does not compare against them.

## Source Layers

| Layer | Source | Role | May Contribute Concrete Project Content |
| --- | --- | --- | --- |
| Standard package | `${AI_SDLC_STANDARD_HOME}` | Shared rules, schemas, templates, generation specifications, validation rules. | No |
| Target repository code | Target project root | Primary content source for modules, source roots, entries, layers, state, data access, integrations, tests, and local conventions. | Yes |
| User-confirmed facts | Explicit user or owner confirmation | Business boundary, domain split, ambiguity resolution, risk acceptance, and facts code cannot reliably infer. | Yes |
| Generated project-private docs | `.specify/project-context/**` and `.specify/*.yaml` | Stable local inputs for new `sdlc-*` Skills. | Yes, if generated from target code or user-confirmed facts |
| Workflow products | `specs/**`, `.specify/business_domain/**`, `library/**` | Outputs of a workflow stage. | Yes, as stage outputs |
| Legacy Speckit docs | `.specify/memory/**`, `.specify/workflow/**`, `.specify/coding_guide/**` | Development-time semantic fixtures or preserved local legacy files. | No, not for new generated content |

## Allowed Inputs

New project-private documents may use:

- target repository source files
- build descriptors such as `pom.xml`, `package.json`, `go.mod`, `pyproject.toml`
- target repository configuration files
- target repository tests
- target repository local docs when the user confirms they are current project facts
- explicit user or owner confirmation
- standard-package generation rules and templates

New project-private documents must not use:

- another project's business-domain documents
- another project's legacy `.specify/**` content
- copied controller, MQ, DB, status, glossary, or module lists from a sample project
- inferred business domains based only on package names
- stale or unknown-source `specs/**` content

## Legacy Source Role

Legacy documents may be read only in this context:

| Context | Allowed Use |
| --- | --- |
| Standard-package development | Abstract document structure, field names, generation rules, validation ideas, and semantic coverage fixtures. |

Legacy documents must not be used as the primary source for:

- `.specify/project-context/**`
- `.specify/business_domain/**`
- `specs/**`
- `entry-coverage-profile.yaml`
- `business-domain-bootstrap.yaml`

## Code-Driven Facts

The target repository code is the primary source for:

- source roots and module layout
- Controller, RPC provider, Listener, Consumer, Schedule, Job, Worker, and Processor entries
- Service, Manager, DomainService, DAO, Mapper, Repository, and persistence layers
- DTO, Entity, Model, enum, and status definitions
- MQ topics and producer or consumer wiring
- DB table and field access through SQL, mapper XML, annotations, or DAO methods
- configuration keys and default values
- tests and fixtures
- local framework adapters and utility classes

If code evidence is incomplete, the generation report must record the gap instead of inventing facts.

## User Confirmation

User confirmation is required when code cannot reliably answer:

- business domain names
- L1/L2/L4 split
- whether a technical entry is business-facing
- whether a status is business-visible
- whether a flow is current, historical, or deprecated
- whether a generated document may be treated as authoritative

Confirmed facts must be recorded in the generation report with source, date, and scope.

## Product Artifacts

`specs/**` and `.specify/business_domain/**` are workflow products.

They are not migration payloads and are not standard-package source files.

Both legacy and new rails may generate these products, but project bootstrap is not a comparison or migration process. New-rail completeness is judged by standard-package rules, target-code evidence, user-confirmed facts, and generated validation reports.

## Blocking Conditions

Stop generation when:

- the target project path is missing or unreadable
- the generation would require copying another project's facts
- business boundaries cannot be inferred and no user confirmation exists
- existing generated target files would be overwritten silently
- legacy documents are treated as the new rail's primary source
- a generated output cannot cite code evidence or user confirmation for concrete project facts
