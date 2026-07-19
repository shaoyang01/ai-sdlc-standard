# AI SDLC Standard Library

> **Version**: v0.1.0
> **Status**: Active — PR J–P mainline completed
> **Language**: zh-CN

## Standard Package Release Summary

> 本节是标准包发布摘要，不是 canonical Runtime/project status。当前项目状态见 [docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md)；仓库结构与状态权威模型见 [docs/REPOSITORY-STRUCTURE.md](docs/REPOSITORY-STRUCTURE.md)。

Current mainline completed through PR J–P. Final Audit Cleanup completed. Full repository review: PASS（0 P0, 2 P1 resolved, 4 P2 noted）. All validators pass, 16/16 product parity fixtures pass, 3/3 acceptance commands pass.

## Repository Structure

This repository contains two product surfaces:

- **Standard Package** — governance docs, templates, skills, and validators. Canonical entrypoints: `README.md`, `manifest.yaml`, `ROADMAP.md`, `PORTABILITY.md`, and `AI_CHANGE_GUARDRAILS.md`. `manifest.yaml` is the standard package index, not a Runtime manifest.
- **Runtime** — the deterministic TypeScript graph interpreter. Entrypoints: `package.json`, `runtime.ts`, `demo.ts`, plus `core/`, `execution/`, `sdlc_graph/`, `tests/`, and CI.

See [`docs/REPOSITORY-STRUCTURE.md`](docs/REPOSITORY-STRUCTURE.md) for the full authority map.

## What This Repository Provides

### DocFlow / AI SDLC

Requirement-level workspace under `library/{requirement_id}/`:

- `00-需求资料` — requirement intake
- `01-技术方案` — technical specification
- `02-方案审核` — solution review
- `03-实现记录` — implementation record
- `04-代码审核` / `04-交付总结` — code review / delivery summary
- `05-测试验收` — test acceptance
- artifact manifest / change control / Re-Gate

### New-Rail Enhanced Speckit Pipeline

- `legacy_speckit` / `new_rail_sdlc` rail separation
- `speckit_driven` / `library_driven` / `hybrid` sync source modes
- shared business domain governance（`.specify/business_domain/`）
- compatible update with conflict proposal（preserve existing shape/facts）
- specs run lifecycle metadata and archive/cleanup policy
- library-driven sync runtime hardening
- project-type contract artifact matrix
- product parity fixtures and validators (16 fixtures, 2 validators)

## Key Documents

| Document | Purpose |
| --- | --- |
| [New-Rail Enhanced Speckit Pipeline Summary](docs/NEW_RAIL_ENHANCED_SPECKIT_PIPELINE_SUMMARY.md) | Comprehensive overview of PR J–P capabilities |
| [Final Audit Report](docs/reports/final-audit-report.md) | PR J–P consistency audit findings and resolution |
| [Full Repository Review Report](docs/reports/full-repository-review-report.md) | 12-area repository audit |
| [Validation Guide](docs/VALIDATION.md) | Validator descriptions and expected checks |
| [manifest.yaml](manifest.yaml) | Standard package index（entrypoints, skills, templates, scripts） |

## Standard Package Entrypoints

`manifest.yaml` is the standard package index. Governance docs, templates, and scripts are discoverable through manifest entrypoints. Do not rely on `temp/` as authoritative.

## Validation

```bash
ruby scripts/validate-skill-contracts.rb       # skill contract consistency
ruby scripts/validate-product-parity-fixtures.rb  # product parity fixtures (16/16)
git diff --check                                # whitespace validation
```

All three pass.

## Operational Redlines

- New-Rail must not fallback to legacy Skill runtime.
- New-Rail must not read or write target `.specify/memory/**`, `.specify/workflow/**`, `.specify/coding_guide/**`.
- `library/{requirement_id}/` is a requirement-level workspace, not a long-term knowledge base.
- `specs/` is a run-level artifact, not requirement-level.
- `.specify/business_domain/` writes must preserve existing shape and facts.
- Cleanup must not delete `library/` or `business_domain/` content.
- No filename-versioned artifacts.

## Adoption

- Existing legacy Speckit projects continue using `legacy_speckit`.
- Explicit `sdlc-*` / `sdlc-speckit-*` activation enters `new_rail_sdlc`.
- Direct Implementation / library-only DocFlow can use `library_driven` sync.
- Read the [summary document](docs/NEW_RAIL_ENHANCED_SPECKIT_PIPELINE_SUMMARY.md) before starting a pilot.
- Execute `scripts/bootstrap-speckit-project.sh <target> --dry-run` to generate project profiles and private context files.

## Core Directory

```text
ai-sdlc/          Governance protocols (rail routing, sync modes, business domain, lifecycle, runtime)
checklists/       Stage-specific checklists
ess/              Technical spec, solution review, code review, test feedback schemas
skill-contracts/  Skill contracts and category guide
skills/           Installable sdlc-* / sdlc-speckit-* Prompt Skills
scripts/          Validators, bootstrap, audit-entry-coverage
templates/        DocFlow, manifest, profile, Speckit report, proposal templates
registry/         Skill Registry
fixtures/         Product parity fixtures (16 synthetic test categories)
docs/             Guides, reports, and summary documentation
```

Full entrypoint list is in `manifest.yaml`.

## AI Change Guardrails

For AI-assisted or Codex-assisted changes, follow [`AI_CHANGE_GUARDRAILS.md`](AI_CHANGE_GUARDRAILS.md).

Small fixes should modify only explicitly requested files, avoid broad metadata/artifact churn, and avoid changing recommended next PRs unless explicitly requested.

For Hermes Phase-2 work, use the consolidation and cleanup plans as review-scope references:

- [`HERMES_PHASE_2_CONSOLIDATION.md`](HERMES_PHASE_2_CONSOLIDATION.md)
- [`CAPABILITY_ARTIFACT_DIRECTORY_CLEANUP_PLAN.md`](CAPABILITY_ARTIFACT_DIRECTORY_CLEANUP_PLAN.md)

