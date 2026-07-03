# PR G / PR H Runtime Validation Report

> **Date**: 2026-07-03
> **Purpose**: Record runtime smoke validation results for PR G (Bootstrap Performance / Large Repo Scan Control) and PR H (Delta Change Routing / Supplement Requirement Path).

## Commit SHAs

| PR | Commit Message | SHA |
| --- | --- | --- |
| PR G | feat: control bootstrap scans for large repos | `ea3a774` |
| PR H | feat: support delta change routing | `57e30c1` |
| PR G + H cleanup | fix: PR G + PR H cleanup — scan-timeout bypass, structured inventory, delta-change semantics | `13344e7` |
| Hotfix | fix: move generate_inventory_table before call site | `a24ab9d` |

## Validation Scope

- Static checks: `validate-skill-contracts.rb`, `bash -n` syntax
- Dry-run: logistics-center (full scan), pfms (`--scan-root pfms-main`)
- DocFlow semantic regression: "补充需求" scenario chain

## Commands / Checks

| # | Command / Check | Result |
| --- | --- | --- |
| 1 | `grep -n 'generate_inventory_table()' scripts/bootstrap-speckit-project.sh` | ✅ Defined at line 909 (moved before call site) |
| 2 | `ruby scripts/validate-skill-contracts.rb` | ✅ `skill contract validation ok` |
| 3 | `bash -n scripts/bootstrap-speckit-project.sh` | ✅ `SYNTAX OK` |
| 4 | `ruby -c scripts/bootstrap-entry-coverage-profile.sh` | ✅ `Syntax OK` |
| 5 | `scripts/bootstrap-speckit-project.sh .../logistics-center --dry-run --scan-timeout 60 --max-samples 30` | ✅ `scan_status: COMPLETE`, all profiles previewed |
| 6 | `scripts/bootstrap-speckit-project.sh .../pfms --dry-run --scan-root pfms-main --scan-timeout 60 --max-samples 5` | ✅ `effective_scan_roots: pfms-main`, `scanned_file_count: 40`, inventory table rendered |
| 7 | DocFlow "补充需求" semantic regression | ✅ Full chain: intake → classification → tie-breaking → manifest |

## Key Evidence Summary

### PR G — Bootstrap Performance / Large Repo Scan Control

- `--scan-timeout` no longer bypassed by `find | sort -u`; find streams directly into while-read with per-path timeout checks; sort -u deferred to post-collection bounded inventory only.
- Structured file inventory table (Relative Path | File Type | Matched Include Root | Included Reason) rendered correctly in both `RepositoryStructure.md` and `speckit_generation_report.md`.
- Skipped / Excluded Count annotated as "pruned estimate, not individually counted".
- `--scan-root` limits scan to specified directories; confirmed via pfms dry-run with `--scan-root pfms-main` → 40 files vs full-scan thousands.
- `bootstrap_performance_paths` unified validation block covers both scripts and docs in `validate-skill-contracts.rb`.

### PR H — Delta Change Routing / Supplement Requirement Path

- "Specification Missing" added to Intake Classification table with default node `01-技术方案`.
- `Intake Classification:` field now includes `Specification Missing`.
- `sdlc-requirement-normalizer` contract line 49 already declares recognition of Specification Missing.
- Tie-Breaking Rules now separate `FULL_REQUIREMENT` vs `DELTA_CHANGE` paths; aggregate triggers listed as Ignored, cannot trigger SPECKIT_PIPELINE_REQUIRED.
- Manifest Change History example row fixed: 14 cells, Classification → col 4, Decision Scope → col 6.

## Fixed Issues

| Issue | Severity | Description |
| --- | --- | --- |
| PR G scan-timeout bypass | P0 | `find | sort -u` blocked while-read; removed pipe sort, deferred sort to bounded inventory |
| Structured inventory table | P1 | Replaced flat path samples with 4-column markdown table |
| generate_inventory_table call site | P0 | Function defined after call site; moved before `INVENTORY_TABLE` assignment |
| PR H Specification Missing | P1 | Added missing classification to Intake Classification table and field |
| DELTA_CHANGE tie-breaking | P1 | Separated FULL_REQUIREMENT vs DELTA_CHANGE tie-breaking rules |
| Manifest Change History | P2 | Fixed 13→14 cells, aligned Classification and Decision Scope columns |

## Current Conclusion

| PR | Status | Notes |
| --- | --- | --- |
| PR G | ✅ PASS | All dry-runs pass, scan-timeout enforces correctly, inventory table renders |
| PR H | ✅ PASS | DocFlow semantic regression passes, Specification Missing is valid classification |

## Next Step

- PR I: Fixture-Based Product Parity Validator —固化本报告中的手动 smoke validation 为标准包内可重复执行的 fixture validator。
