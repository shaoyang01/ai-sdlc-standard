# Speckit Dual-Rail Isolation

## Purpose

This guide defines the isolation model between legacy Speckit workflows and the new AI SDLC Speckit rail.

The goal is fully isolated dual rails. During standard-package development, legacy project files may be used as semantic fixtures. During project bootstrap runtime, the new rail is initialized from the standard package and target repository facts, not from a comparison with legacy documents.

## Rails

### Legacy Speckit Rail

The legacy rail includes:

- legacy Speckit Skills
- legacy workflow Skills
- legacy `.specify/memory/**`
- legacy `.specify/workflow/**`
- legacy `.specify/coding_guide/**`
- any document paths those legacy Skills already use

Rules:

1. Legacy Skills keep using their existing inputs.
2. New bootstrap must not modify, move, rename, delete, or overwrite legacy documents.
3. New bootstrap must not overwrite legacy Skills.
4. New standard-package installation must not make legacy workflow invalid.

### New AI SDLC Speckit Rail

The new rail includes:

- new `sdlc-*` Skills
- shared standard documents under `${AI_SDLC_STANDARD_HOME}`
- `.specify/project-governance-profile.yaml`
- `.specify/entry-coverage-profile.yaml`
- `.specify/business-domain-bootstrap.yaml`
- `.specify/project-context/**`
- generated reports under `.specify/reports/**`

Rules:

1. New Skills read shared rules from `${AI_SDLC_STANDARD_HOME}`.
2. New Skills read project-private facts from generated `.specify/project-context/**` and project profiles.
3. New Skills must not read legacy `.specify/memory/**` during normal workflow execution.
4. New Skills must not read legacy `.specify/workflow/**` during normal workflow execution.
5. New Skills must not read legacy `.specify/coding_guide/**` during normal workflow execution.
6. Legacy files are preserved for legacy workflows, but new bootstrap does not inventory or compare them.

## Shared Product Artifacts

Both rails may create workflow products:

- `specs/**`
- `.specify/business_domain/**`
- `library/**`

These outputs are products, not rail-owned shared rule sources.

When both rails produce outputs for the same project and requirement, each rail's own gates validate its outputs. Project bootstrap is not a cutover or runtime comparison process.

## Isolation Checks

After bootstrap or standard-package updates, verify:

- new `sdlc-*` Skill instructions do not use legacy `.specify/memory/**` as normal input
- new `sdlc-*` Skill instructions do not use legacy `.specify/workflow/**` as normal input
- new `sdlc-*` Skill instructions do not use legacy `.specify/coding_guide/**` as normal input
- bootstrap writes no legacy document
- bootstrap writes no legacy Skill
- project-context files are not silently overwritten

## Explicit Prohibitions

Do not:

- copy concrete legacy project facts into this standard package
- copy one project's legacy business domains into another project
- require a target project to have legacy Speckit documents before bootstrap
- use legacy documents as the primary source for new project-private docs
- block new bootstrap because legacy docs are absent
- treat `specs/**` or `.specify/business_domain/**` as migration objects
- generate runtime legacy comparison reports during bootstrap
- use a full SDD request to skip `sdlc-solution-reviewer`

## Blocking Conditions

Stop when:

- new rail execution would depend on legacy `.specify/memory/**`, `.specify/workflow/**`, or `.specify/coding_guide/**`
- a legacy file would be modified by new bootstrap
- a project asks to cut over from legacy to new rail without an explicit project decision
- the process needs legacy output as evidence for new-rail generation
