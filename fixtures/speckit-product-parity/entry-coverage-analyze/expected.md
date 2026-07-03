# Entry Coverage + Analyze Gate — Expected Semantics

This is a **development-time fixture**, not target project runtime input.

## Required Semantic Surface

### Entry Coverage Precision

- Entry coverage profile: `.specify/entry-coverage-profile.yaml`
- TSV outputs: `entry_inventory.tsv`, `service_inventory.tsv`
- Classification: `classification`, `classification_reason`
- Match metadata: `match_strength`, `match_reason`
- Reverse coverage: `reverse_coverage_status`, `no_entry_reverse_coverage`
- Bridge types: `technical_bridge`, `framework_bridge`, `generated_or_vendor`, `native_shell`, `abstract_or_base`, `annotation_or_marker`
- Non-applicable: `not_applicable`
- Business match: `business_entry`
- Missing L4: `business_domain L4 missing`

### Analyze Gate

- Analyze Gate Result = `FAIL` when profile is missing
- Required Action status = `PENDING_CONFIRMATION` when only candidate profile exists
- Analyze must parse TSV fields (not grep whole markdown report)

## Redlines

- Must not use `.specify/memory/**` as runtime input
- Must not use `.specify/workflow/**` as runtime input
- Must not use `.specify/coding_guide/**` as runtime input
- Must not recommend filename-versioned artifacts

Legacy Skill usage: none
Legacy document runtime input: none
Legacy document write target: none
