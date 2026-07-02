# Entry Coverage Precision Validation Report

Date: 2026-07-02

## Scope

Validated current `main` of `ai-sdlc-standard` against these sample repositories:

- `/Users/eric_shaoooo/meicai/projects/logistics-center`
- `/Users/eric_shaoooo/meicai/projects/pfms`
- `/Users/eric_shaoooo/meicai/projects/pfms-rn`
- `/Users/eric_shaoooo/meicai/projects/tms-flink-finance`

This validation is read-only for sample repositories. Diagnostic profiles and generated reports were written only under `/private/tmp`.

## Commands

```bash
ruby scripts/validate-skill-contracts.rb
ruby scripts/audit-entry-coverage.rb /Users/eric_shaoooo/meicai/projects/logistics-center --dry-run
ruby scripts/audit-entry-coverage.rb /Users/eric_shaoooo/meicai/projects/pfms --dry-run
ruby scripts/audit-entry-coverage.rb /Users/eric_shaoooo/meicai/projects/pfms-rn --dry-run
ruby scripts/audit-entry-coverage.rb /Users/eric_shaoooo/meicai/projects/tms-flink-finance --dry-run
```

`validate-skill-contracts.rb` passed.

The default runner command failed for all four sample repositories because none of them currently has:

```text
.specify/entry-coverage-profile.yaml
```

All four repositories have `.specify/business_domain/**`; logistics-center, pfms, and tms-flink-finance also have old entry coverage reports, but those old reports are three-column legacy outputs and do not contain PR E fields.

Because no repository has both confirmed business_domain and the new entry profile, official `--strict` was not run against repository-local profile. Instead, `--strict` was run with temporary diagnostic profiles under `/private/tmp` to validate runner behavior without writing sample repositories.

## Output Compatibility

The PR E runner still produces the original seven report names:

- `entry_inventory.tsv`
- `service_inventory.tsv`
- `entry_chain_evidence.md`
- `unarchived_entries.md`
- `unarchived_services.md`
- `cross_domain_conflicts.md`
- `entry_coverage_report.md`

Diagnostic TSV headers now include the expected PR E fields:

```text
entry_inventory.tsv:
entry_type, evidence_mode, symbol, path, module, archived,
classification, classification_reason, match_strength, match_reason,
matched_l2, matched_docs, requirement_scope

service_inventory.tsv:
kind, symbol, path, module, archived,
classification, classification_reason, match_strength, match_reason,
reverse_coverage_status, matched_l2, matched_docs, requirement_scope
```

## Repository Results

### logistics-center

Default command:

```text
Entry coverage profile not found
```

Diagnostic sample:

```text
Status: BLOCKED
Entries: 45
Business Entries: 45
Technical Bridges: 0
Core Units: 15
Unarchived Entries: 0
Unarchived Core Units: 14
Cross-Domain Conflicts: 27
strict_exit: 1
```

Observed behavior:

- New TSV fields are present.
- Entries mostly match through `text path`, strength `70`, because existing L4 documents are old report-style documents rather than structured PR E tables.
- `cross_domain_conflicts.md` explains conflict basis with matched L2 domains and matched docs.
- Service reverse coverage is visible: `covered`, `entry_chain_only_unarchived`, and `no_entry_reverse_coverage`.

Main false positives / gaps:

- `LcMcqProcessor` and similar base/processor bridge classes are still classified as `business_entry`; current automatic bridge classifier only catches `Abstract*`, `Base*`, generated/vendor/native shell, annotation/marker, and explicit bridge-ish names. logistics-center needs profile-level technical bridge overrides or additional classifier terms for base MCQ processors.
- Many old EntryCoverage docs intentionally duplicate shared entries across a domain L2 and `06SharedCapability`, causing cross-domain conflicts. This is useful for Analyze, but PR F should distinguish accepted shared-capability duplication from true ownership conflict.
- Many services have no reverse entry coverage under diagnostic sampling; this is expected partly because the sample profile was bounded, but it shows PR F should consume `reverse_coverage_status`, not only archived/unarchived flags.

### pfms

Default command:

```text
Entry coverage profile not found
```

Diagnostic sample:

```text
Status: BLOCKED
Entries: 45
Business Entries: 43
Technical Bridges: 2
Core Units: 15
Unarchived Entries: 0
Unarchived Core Units: 10
Cross-Domain Conflicts: 48
strict_exit: 1
```

Observed behavior:

- New fields are present.
- `abstract_or_base` classification appears in entry results, proving non-business technical classification is active.
- Service reverse coverage distinguishes `covered`, `multi_domain_warning`, `no_entry_reverse_coverage`, and `entry_chain_only_unarchived`.
- Cross-domain conflict report includes matched L2 domains and matched docs.

Main false positives / gaps:

- Admin/controller entries are heavily duplicated across business domains and platform/integration coverage documents. This yields many conflicts, but some are likely historical repository residue or shared platform coverage rather than true current-domain conflicts.
- Existing business_domain docs are not consistently PR E table-shaped, so match_strength is usually `70` text path rather than stronger table/code-anchor matches.
- Diagnostic profile's `data_console`/processor sampling is intentionally coarse; a real profile should separate controller, worker, scheduled job, MCQ/OAS, SPI, import/export, and read-only query entries.

### pfms-rn

Default command:

```text
Entry coverage profile not found
```

Diagnostic sample:

```text
Status: BLOCKED
Entries: 75
Business Entries: 65
Technical Bridges: 10
Core Units: 0
Unarchived Entries: 15
Unarchived Core Units: 0
Cross-Domain Conflicts: 7
strict_exit: 1
```

Observed behavior:

- Frontend sample profile finds page/component/api_client/store_action/popup/native_shell entries.
- `native_shell` classification is active for Android/iOS shell files.
- Native shell entries are counted as technical bridges and are not the source of blocking unarchived business entries.
- Frontend evidence enters the chain through path and symbol matching.

Main false positives / gaps:

- Existing pfms-rn business_domain documents are page/domain oriented but not PR E table-shaped; match_strength is often text path/symbol rather than structured route/component/API evidence.
- The sample `page` pattern intentionally included files under `src/pages/**`, so action/store/API files inside page folders may be grouped as `page`; a real profile should make route/page/component/store/API/popup patterns mutually clearer.
- `Route` appears as unmatched business entry; likely needs explicit route registry/profile evidence or route constants classification.
- `unarchived_entries.md` includes a non-blocking technical section whose text contains `native_shell`; the blocking rows themselves are business entries. PR F should read structured rows/counts, not grep the whole markdown for class names.

### tms-flink-finance

Default command:

```text
Entry coverage profile not found
```

Diagnostic sample:

```text
Status: BLOCKED
Entries: 45
Business Entries: 45
Technical Bridges: 1
Core Units: 27
Unarchived Entries: 0
Unarchived Core Units: 4
Cross-Domain Conflicts: 48
strict_exit: 1
```

Observed behavior:

- ETL entry types enter inventory: `flink_main`, `flink_process`, `mcq_consumer`, `spark_job`, `spark_online_etl`.
- ETL match evidence is visible through `text path`; runner also supports job/function/connector/sink/SQL evidence.
- `BaseSparkService` is classified as `abstract_or_base` with `non_blocking_technical_bridge`.
- Reverse coverage status exposes `covered`, `multi_domain_warning`, `entry_chain_only_unarchived`, and `no_entry_reverse_coverage`.
- Cross-domain conflicts explain matched L2 domains and docs for Flink main entries.

Main false positives / gaps:

- `StringDeserializationSchema` is classified as business entry under the sampled `mcq_consumer` entry type, but semantically it is a connector/serialization technical bridge. This requires profile refinement or classifier additions for Schema/Serialization classes.
- Many ETL jobs match both generic job scheduling docs and concrete finance flow docs. PR F should treat some multi-domain hits as warning when one L2 is platform/scheduling and another is business flow.
- Existing ETL docs have SQL/input/output concepts, but not consistently in PR E table columns, so evidence is mostly path-based. To get stronger `match_strength`, L4 EntryCoverage docs should add structured Code Anchor / Job / Function / SQL / Connector / Sink columns.

## Cross-Cutting Findings

### What Works

- `entry_inventory.tsv` and `service_inventory.tsv` contain the requested PR E fields.
- Technical/non-business classifications are visible and non-blocking in diagnostic output.
- `match_strength` and `match_reason` are populated and useful for explaining why a row matched.
- `reverse_coverage_status` is present and gives PR F a better input than archived/unarchived alone.
- `cross_domain_conflicts.md` now explains matched L2 domains and matched docs.
- Frontend and ETL entries can enter evidence chain with project-type profiles.

### Current Limitations

- The four sample repositories do not yet have `.specify/entry-coverage-profile.yaml`, so the standard runner cannot be used directly by Analyze Gate without bootstrap/profile generation.
- Existing business_domain EntryCoverage docs mostly predate PR E and are not structured Markdown tables. The runner falls back to text/path matches, so `match_strength` is usually lower than it would be with PR E tables.
- Some technical bridges still need project-specific or broader classifier rules:
  - logistics-center MCQ base processor / shared processor classes;
  - tms-flink-finance serialization schema / connector helper classes;
  - pfms-rn route registry/constants.
- Cross-domain conflicts are useful but noisy when one side is a shared/platform/scheduling coverage L2. PR F needs accepted shared-domain duplication semantics.

## Analyze Gate Readiness

Current runner is ready to enter PR F Analyze Gate strengthening as a data source, with one condition:

```text
Analyze Gate must require a generated .specify/entry-coverage-profile.yaml first.
```

The runner itself has no must-fix PR E blocker based on this validation. The must-fix blocker for operational rollout is profile availability in sample repositories.

## PR E Blockers

No code-level PR E blocker found in the runner output shape or report compatibility.

Operational blockers before full Analyze Gate enforcement:

1. No sample repository has the new entry coverage profile at `.specify/entry-coverage-profile.yaml`.
2. Existing L4 EntryCoverage docs are old-style and do not consistently provide structured table columns, limiting match_strength.
3. Technical bridge classification needs profile override support or additional built-in patterns for known bridge/helper families.

## PR F Inputs To Depend On

PR F Analyze Gate strengthening should depend on these fields:

- `entry_inventory.tsv`
  - `classification`
  - `classification_reason`
  - `match_strength`
  - `match_reason`
  - `matched_l2`
  - `matched_docs`
  - `requirement_scope`
- `service_inventory.tsv`
  - `classification`
  - `classification_reason`
  - `match_strength`
  - `match_reason`
  - `reverse_coverage_status`
  - `matched_l2`
  - `matched_docs`
  - `requirement_scope`
- `entry_coverage_report.md`
  - `Status`
  - `Business Entries`
  - `Technical Bridges`
  - `Unarchived Entries`
  - `Unarchived Core Units`
  - `Cross-Domain Conflicts`
- `cross_domain_conflicts.md`
  - matched L2 domains
  - matched docs
  - match reason

PR F should not infer blockers by grepping full markdown text. It should parse TSV fields and treat non-blocking classifications separately from business entries.
