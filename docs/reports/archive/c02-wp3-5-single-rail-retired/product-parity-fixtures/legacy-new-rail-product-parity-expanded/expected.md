# Legacy/New-Rail Product Parity — Expected Semantics

This is a **development-time fixture**, not target project runtime input.

## Rail Routing

- legacy_speckit and new_rail_sdlc are explicitly separated (explicit activation).
- New-Rail does not fallback to legacy Skill runtime (must not legacy Skill fallback in New-Rail — forbidden).
- New-Rail must not read target `.specify/memory/**`, `.specify/workflow/**`, `.specify/coding_guide/**` as runtime input (must not read .specify/memory as New-Rail runtime input — forbidden).
- Ambiguous rail must ask or block.

## Specs Run Lifecycle

- specs are run-level artifacts.
- same requirement_id may have multiple specs_run_id.
- one specs run has one rail (rail consistency within run).
- manifest is lifecycle authority. workflow-status.md is machine snapshot only.
- archive/cleanup requires gate (archive_allowed, cleanup_allowed).
- cleanup must not delete library or business_domain (must not cleanup deletes library/{requirement_id} — forbidden, must not cleanup deletes .specify/business_domain — forbidden).
- no filename-versioned artifacts.

## Business Domain Governance

- business_domain is shared long-term knowledge base.
- target L4 missing uses project canonical naming + project shape.
- standard template fallback only when explicit fallback conditions are met.
- target L4 exists uses compatible update (preserve existing shape, preserve existing facts).
- safe insertion point required for direct write.
- fact conflict generates reconcile proposal.
- no whole-document rewrite (must not rewrite existing L4 to New-Rail template — forbidden).
- no forced New-Rail section injection (must not inject Entry Chain into legacy-shaped doc by default — forbidden).
- library artifacts can be source evidence but library is not long-term knowledge base (must not library is long-term knowledge base — forbidden).

## Library-Driven Runtime

- library_driven does not require specs or specs_run_id (specs are not required, specs_run_id is not required).
- requirement_id is required.
- implementation evidence and verification evidence required for direct write (must not direct write without verification evidence — forbidden).
- insufficient evidence produces proposal/not_required/blocked only.
- duplicate sync guard prevents repeated writes (must not duplicate sync allowed by default — forbidden).
- supplemental sync requires explicit authorization and no duplicate fact.
- business_domain_sync manifest records source_of_truth, stable_fact_candidates, synced_business_domain_targets.

## Project-Type Contract Matrix

- project_type_profile controls companion artifact requirements.
- Produced/Reused/Not Applicable/Deferred are explicit statuses.
- Reused requires source_artifacts and freshness.
- Deferred requires accepted_by and verification_alternative (must not Deferred without accepted_by is allowed — forbidden).
- Not Applicable requires project-type justification (must not Not Applicable without justification — forbidden).
- missing required artifact blocks Plan Gate (must not Plan Gate PASS with missing required artifact — forbidden).
- workflow-status.md is not manifest authority (must not workflow-status is lifecycle authority — forbidden).
- no filename-versioned companion artifacts (must not filename-versioned companion artifact — forbidden).
- library_driven without specs does not require specs companion artifacts.

## Legacy/New-Rail Product Parity

- New-Rail must meet or exceed legacy Speckit baseline semantics for spec/plan/task/sync/reconcile products.
- New-Rail may add enhanced artifacts, but cannot drop baseline traceability.
- Old and new rails may both govern business_domain, but not within the same specs run.
- Shared business_domain writes must preserve long-term knowledge integrity.
- Must not use chat as source of truth (must not use chat as source of truth — forbidden).

Legacy Skill usage: none
Legacy document runtime input: none
Legacy document write target: none

## PR P Cleanup: Validator and Contract Traceability

- expanded fixture validates required_standard_files, required_terms, forbidden_terms, and guard context (guard context — must not, forbidden, prohibited, not allowed).
- expected.md may mention forbidden behavior only with guard context (must use must not / forbidden / prohibited / not allowed / no / cannot).
- skill contracts preserve baseline traceability for sync/reconcile/plan (baseline traceability, spec/plan/task/sync/reconcile traceability).
- New-Rail enhanced metadata cannot replace baseline traceability.
- validate-product-parity-fixtures.rb enforces expanded fixture required files/terms/forbidden guard context.
- validate-skill-contracts.rb enforces PR P static terms and forbidden behavior.

## Tail Template Static Contract Validation

- The four tail templates (gate result, artifact manifest, sync status YAML, library-driven sync decision) share static semantic parity: `documentation_governance_tail`, `development_path_entry`, `documentation_governance_tail_completion`, `required_artifacts`, `completed_artifacts`, `skipped_items`, `blocking_items`, `business_domain_sync_decision`, `reconcile_decision`, `entry_coverage_result`, `regate_result`, `completion_evidence`, `completion_decision_source`, `execution_status`, `execution_result`, `partial`, `actual_implementation_required`, `manifest is status authority`.
- Tail Completion owner is exactly `sdlc-gate-runner` (must not use a generic Gate Runner owner phrase — forbidden).
- Manifest has exactly one canonical Tail root section (must not duplicate the `## Documentation Governance Tail` heading — forbidden).
- A second completion state is not allowed (must not introduce `completion_status` — forbidden).
- 03 实现记录, 04 代码审核 and 05 测试验收 are `actual_implementation_required` (must not regress to `03 实现记录 | recommended`, `04 代码审核 | conditional` or `05 测试验收 | conditional` — forbidden).
- 04 交付总结 stays recommended and is not a Gate.
- Sync decision, execution status and execution result are separate fields with fixed pipe-delimited scalars.
- Library-driven decision Metadata must be unique (must not keep a second `## Decision Metadata` section — forbidden).
- Legacy `## Speckit Sync` is compatibility-read only; a real new-write `## Speckit Sync` heading must not exist (must not reintroduce `## Speckit Sync` as a new-write heading — forbidden).
- This fixture only validates static semantic parity; it does not represent runtime enforcement, real Tail completion, or validated instance scenarios.
