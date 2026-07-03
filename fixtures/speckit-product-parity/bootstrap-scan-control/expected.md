# Bootstrap Scan Control — Expected Semantics

This is a **development-time fixture**, not target project runtime input.

## Required Semantic Surface

### CLI Options

- `--scan-root`: limit scan to target-relative paths (repeatable)
- `--include-root`: alias for `--scan-root`
- `--scan-timeout`: stop scan after N seconds
- `--max-samples`: limit evidence samples per section

### Scan Control Outputs

- `scan_duration_seconds`: actual scan wall time
- `timeout_occurred`: true/false
- `partial_scan`: true when timeout or root-limited
- `scan_roots`: user-specified scan roots
- `include_roots`: user-specified include roots
- `effective_scan_roots`: resolved effective scan roots
- `exclude_patterns`: prune patterns including `android/build`, `ios/build`, `node_modules`, `large-fixtures`, `__snapshots__`, `mock-data`

### Structured Inventory

- `relative path`: file path relative to target
- `file type` / `extension`: file extension
- `matched include root`: which scan root covers this file
- `included reason`: why the file was included

### Critical Semantic

- `TIMEOUT / PARTIAL` must not be reported as complete success
- bounded file inventory must use post-collection sort, not pre-collection sort
- skipped/excluded count must be labeled as pruned estimate, not real count

## Redlines

- Must not use `.specify/memory/**` as runtime input
- Must not use `.specify/workflow/**` as runtime input
- Must not use `.specify/coding_guide/**` as runtime input
- Must not recommend filename-versioned artifacts

Legacy Skill usage: none
Legacy document runtime input: none
Legacy document write target: none
