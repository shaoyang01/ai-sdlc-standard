# Full Repository Review Report

> **Date**: 2026-07-04
> **Scope**: DocFlow + Speckit/New-Rail + Skills/Contracts + Templates + Manifest/Registry + Validators/Fixtures + Scripts/Bootstrap + Docs/Temp
> **Method**: Read-only audit via grep, find, and manual inspection. No files modified.

## Executive Summary

**Overall: PASS — 0 P0, 2 P1, 4 P2**

The repository is structurally sound. All 20 skills have matching contracts. 16 fixtures pass. Validators pass. No legacy runtime fallback. No unguarded redline violations. Two P1 gaps and four P2 nice-to-haves identified.

---

## Scope

| Area | Coverage |
| --- | --- |
| Repository Structure | Top-level dirs, temp/, docs/ |
| DocFlow | library/{requirement_id}/ workspace, 00-05 artifacts, manifest, change control |
| Speckit/New-Rail | Rail routing, sync source modes, business_domain governance, compatible update, specs lifecycle, library_driven runtime, project-type matrix |
| Skills & Contracts | 20 skills, 20 contracts, alignment checks |
| Templates | 19 templates, manifest entrypoints, field consistency |
| Manifest & Registry | Entrypoints, skill references, registry alignment |
| Validators & Fixtures | 2 validators, 16 fixtures, coverage analysis |
| Scripts & Bootstrap | bootstrap-speckit-project.sh, audit-entry-coverage.rb |
| Documentation | docs/, temp/, summary doc |

---

## P0 Blockers

None found.

---

## P1 Required Cleanup

### F-001: temp/ directory contains 8 stale report files

| Field | Value |
| --- | --- |
| Severity | P1 |
| Area | Repository Structure / Documentation |
| Files | `temp/entry-coverage-precision-validation-report.md`, `temp/new-rail-vs-legacy-speckit-gap-analysis.md`, `temp/speckit-new-rail-product-parity-review-20260701.md`, `temp/speckit-new-rail-product-parity-review-20260702-post-pr-e.md`, `temp/speckit-new-rail-product-parity-review-20260702-pr-b.md`, `temp/speckit-new-rail-product-parity-review-20260702.md`, `temp/plans/route-artifact-next-plan.md`, `temp/plans/pr-g-pr-h-runtime-validation-report.md` |
| Evidence | `temp/` contains 8 markdown files (4 speckit review reports, 1 entry coverage report, 1 gap analysis, 2 plan files) that are development-time artifacts. The `temp/` directory is not referenced by any validator, manifest, or governance doc. |
| Why it matters | Stale development-time artifacts in the standard package repository cause confusion about what is authoritative. `temp/` is not a standard library directory. |
| Recommended fix | Move all 8 files to `temp/archive/` or delete them. Keep only `temp/final-audit-report.md` and `temp/plans/README.md` if needed. |

### F-002: `README.md` references outdated PR B–F content and pre-New-Rail structure

| Field | Value |
| --- | --- |
| Severity | P1 |
| Area | Documentation / Manifest |
| Files | `README.md` |
| Evidence | `README.md` (7,702 bytes) describes an earlier version of the standard library focused on PR B–F (route artifact, project-type L4 templates, frontend process products, entry coverage precision, Analyze Gate). It does not mention PR J–P, New-Rail Enhanced Speckit Pipeline, rail routing, sync source modes, business_domain governance, compatible update, or any of the 15-chapter summary doc content. |
| Why it matters | `README.md` is the first document users see. It should accurately describe the current state of the standard library. |
| Recommended fix | Update `README.md` to reflect current PR J–P state, or add a pointer to `docs/NEW_RAIL_ENHANCED_SPECKIT_PIPELINE_SUMMARY.md`. |

---

## P2 Nice-to-Have

### F-003: `skills/sdlc-speckit-analyze/SKILL.md` and other older Speckit skills reference `.specify/` legacy paths

| Field | Value |
| --- | --- |
| Severity | P2 |
| Area | Skills & Contracts |
| Files | `skills/sdlc-speckit-analyze/SKILL.md`, `skills/sdlc-speckit-checklist/SKILL.md`, `skills/sdlc-speckit-clarify/SKILL.md`, `skills/sdlc-speckit-code-doc-reconcile/SKILL.md`, `skills/sdlc-speckit-implement/SKILL.md` |
| Evidence | `grep -rl '\.specify/memory\|\.specify/workflow\|\.specify/coding_guide' skills/sdlc-*/SKILL.md` returns 5 files. These files reference the legacy paths in their `Do not read` / `preserved_not_runtime_input` redlines, which is correct guard context. Not a violation but worth verifying during update cycles. |
| Why it matters | Minor — these are correct prohibitions. No action needed now but worth noting for future cleanup. |
| Recommended fix | No immediate action. Verify these remain correct during next skill update cycle. |

### F-004: `templates/project-type-contract-artifact-matrix-template.yaml` has "filename-versioned" in comment without guard

| Field | Value |
| --- | --- |
| Severity | P2 |
| Area | Templates |
| Files | `templates/project-type-contract-artifact-matrix-template.yaml` |
| Evidence | The template mentions "# No filename-versioned artifacts. Stable paths only." which IS correct guard context (it says "No"). The grep matched on the underscored pattern. |
| Why it matters | False positive — the comment is a correct prohibition. No action needed. |
| Recommended fix | None. |

### F-005: `docs/` contains SPECKIT_BOOTSTRAP.md (pre-New-Rail) without superseded marking

| Field | Value |
| --- | --- |
| Severity | P2 |
| Area | Documentation |
| Files | `docs/SPECKIT_BOOTSTRAP.md` |
| Evidence | This file describes bootstrap functionality but is from the pre-New-Rail era. It may contain outdated rules about template-primary create-if-missing paths. |
| Why it matters | Users reading old docs may follow outdated guidance (e.g., using standard L4 templates as default). |
| Recommended fix | Add a "Superseded by" note pointing to `docs/NEW_RAIL_ENHANCED_SPECKIT_PIPELINE_SUMMARY.md` and the relevant PR K/L governance docs. Or migrate relevant content and mark the old doc as historical. |

### F-006: Multiple ai-sdlc/ files lack consistent section numbering / formatting

| Field | Value |
| --- | --- |
| Severity | P2 |
| Area | Documentation |
| Files | Various `ai-sdlc/` files |
| Evidence | Some files use `## 1.`, `## 2.` numbered sections; others use `##` named sections only. No consistency standard enforced. |
| Why it matters | Minor readability issue. Does not affect protocol correctness. |
| Recommended fix | Optional: adopt a consistent section formatting standard across all `ai-sdlc/` files during a future docs sprint. |

---

## Area-by-Area Assessment

| Area | Status | Notes |
| --- | :--: | --- |
| Repository Structure | PASS | 25 `ai-sdlc/` files, 20 skills, 20 contracts, 19 templates, 16 fixtures, 2 validators. Structure is logical. `temp/` has 8 stale files (P1). |
| DocFlow | PASS | `library/{requirement_id}/` workspace rules consistent. 00-05 artifact chain clear. No filename-versioned artifacts in active use. `02-方案审核` PASS/PASS_WITH_RISK consistent. |
| Speckit/New-Rail | PASS | Rail routing clean. No legacy fallback. Sync source modes consistent. Business_domain governance, compatible update, specs lifecycle, library_driven runtime all consistent with PR J–P protocols. Final audit P1s resolved. |
| Skills & Contracts | PASS | 20/20 alignment. No missing contracts. No contract-skill mismatches. Legacy path references are in correct prohibitive context. |
| Templates | PASS | All 19 templates present. manifest.yaml has entries for PR J–P templates. Template fields align with protocols. One false-positive filename-versioned grep (correct prohibition). |
| Manifest & Registry | PASS | `manifest.yaml` has PR J–P governance entries and templates. `registry/skill-registry.md` aligns with manifest. `README.md` is outdated (P1). |
| Validators & Fixtures | PASS | `validate-skill-contracts.rb` covers core redlines, PR J–P terms, forbidden behavior. `validate-product-parity-fixtures.rb` covers 16 fixtures with guard context checking. `docs/VALIDATION.md` accurately describes validators. |
| Scripts & Bootstrap | PASS | `bootstrap-speckit-project.sh` writes `project-context/`, not `memory/workflow/coding_guide`. Dry-run support present. Scripts referenced in manifest. |
| Documentation | ⚠️ | `docs/SPECKIT_BOOTSTRAP.md` pre-New-Rail without superseded note (P2). `README.md` outdated (P1). Summary doc (`docs/NEW_RAIL_ENHANCED_SPECKIT_PIPELINE_SUMMARY.md`) is current and accurate. |

---

## Validation Commands

```bash
ruby scripts/validate-skill-contracts.rb  # → skill contract validation ok
ruby scripts/validate-product-parity-fixtures.rb  # → 16/16 pass
git diff --check  # → ok
```

All three pass.

---

## Suggested Cleanup Plan

| Priority | ID | Action | Effort |
| :--: | --- | --- | :--: |
| P1 | F-001 | Archive or delete 8 stale `temp/` files | Minutes |
| P1 | F-002 | Update `README.md` to reflect current state | Minutes |
| P2 | F-005 | Add superseded note to `docs/SPECKIT_BOOTSTRAP.md` | Minutes |
| P2 | F-003 | Verify legacy path references during next skill update | Deferred |
| P2 | F-006 | Optional docs formatting consistency sprint | Optional |
