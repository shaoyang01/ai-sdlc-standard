# Specs Run Lifecycle — Expected Semantics

This is a **development-time fixture**, not target project runtime input.

## Required Semantic Surface

### Specs Run Identity

- specs is run-level artifact, not requirement-level (specs is not requirement-level artifact — not runtime input).
- Same requirement_id can have multiple specs_run_id.
- One specs run has one rail. Different specs runs may use different rails.
- Rail consistency within run is enforced (rail consistency within run).

### Manifest Authority

- manifest is lifecycle authority.
- workflow-status.md is only machine snapshot (workflow-status.md is machine snapshot).
- If manifest and workflow-status.md conflict, manifest wins (MANIFEST_DRIFT).

### Lifecycle States

- created → active → business_domain_synced → archived / superseded / cleaned.
- business_domain_synced: result=synced or not_required → archive/cleanup eligible.
- result=proposal or blocked → cleanup not allowed (must not cleanup pending sync specs — not runtime input).

### Archive / Cleanup Gate

- archive_allowed: lifecycle is business_domain_synced or superseded, not active, BD sync synced/not_required, no open blocking items (must not archive active specs by default — not runtime input).
- cleanup_allowed: archived or superseded, manifest retains metadata, BD sync synced/not_required, no audit needs originals.
- cleanup must not delete library/{requirement_id} (cleanup must not delete library — not runtime input).
- cleanup must not delete .specify/business_domain (cleanup must not delete business_domain — not runtime input).
- no filename-versioned artifacts.

### Library-Driven

- library_driven may have no specs and must not require archive/cleanup (library_driven may have no specs).
- Missing specs is expected and must not block.

### Sync/Reconcile

- sync records specs_run_id when specs exist.
- library_driven without specs: record requirement_id and sync_source_mode only.
- reconcile uses specs_runs metadata to distinguish current/stale/archived/cleaned.
- archived/cleaned specs with manifest traceability is not drift.

### Redlines

- Must not treat specs as requirement-level artifact (forbidden — development-time fixture only)
- Must not delete library during cleanup (forbidden — development-time fixture only)
- Must not delete business_domain during cleanup (forbidden — development-time fixture only)
- Manifest is lifecycle authority, not workflow-status (forbidden — development-time fixture only)
- Must not archive active specs by default (forbidden — development-time fixture only)
- Must not cleanup pending sync specs (forbidden — development-time fixture only)
- No filename-versioned artifacts

Legacy Skill usage: none
Legacy document runtime input: none
Legacy document write target: none
