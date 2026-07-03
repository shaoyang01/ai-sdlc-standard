# Library-Driven Sync Runtime — Expected Semantics

This is a **development-time fixture**, not target project runtime input.

## Required Semantic Surface

### Runtime Inputs

- library_driven sync runtime does not require specs/{feature}/** or specs_run_id (specs are not required, specs_run_id is not required).
- requirement_id is required.
- implementation evidence and verification evidence are required for direct write (implementation evidence, verification evidence — no direct confirmed write without implementation evidence and verification evidence).
- insufficient evidence produces proposal/not_required/blocked only (must not direct write without verification evidence — forbidden).

### Sync Need Classification

- SYNC_REQUIRED: stable facts + evidence + target clear + guard clear.
- NOT_REQUIRED: no stable facts, one-off, or already synced.
- PROPOSAL_REQUIRED: evidence partial, target/section unclear, authorization missing.
- BLOCKED: evidence/gate/target conflict prevents safe decision.
- DUPLICATE_SYNC_BLOCKED: pipeline_sync_executed and result=synced without supplemental authorization (duplicate sync guard).

### Duplicate Sync Guard

- duplicate sync guard blocks repeated sync unless supplemental sync authorized (must not duplicate sync allowed by default — forbidden).
- pipeline_sync_executed=true and result=synced blocks library_driven direct write by default (pipeline_sync_executed, library_sync_executed).
- supplemental sync allowed only when user explicitly authorizes, no duplicate facts, source evidence newer.

### Manifest

- source_of_truth from library artifacts (source_of_truth).
- stable_fact_candidates, synced_business_domain_targets recorded (stable_fact_candidates, synced_business_domain_targets).
- last_sync_source_mode: library_driven.

### Redlines

- Must not require specs in library_driven mode (forbidden — development-time fixture only).
- Must not block because specs are missing (must not missing specs blocks library_driven — forbidden).
- Must not direct write without verification evidence (forbidden — development-time fixture only).
- Must not allow duplicate sync by default (forbidden — development-time fixture only).
- library/{requirement_id} is not long-term knowledge base (must not library is long-term knowledge base — forbidden).
- Must not use chat as source of truth (must not use chat as source of truth — forbidden).

Legacy Skill usage: none
Legacy document runtime input: none
Legacy document write target: none

## PR N Cleanup: Wiring

- sync-inputs references library-driven-sync-runtime.md (library-driven-sync-runtime).
- output-and-manifest includes Library-Driven Manifest Recommendation with business_domain_sync (Library-Driven Manifest Recommendation, business_domain_sync, last_sync_source_mode, proposal_paths, blocked_reasons, Manifest business_domain_sync recommendation).
- duplicate sync guard result must be recorded before direct write.
- source_of_truth must come from current library artifacts or approved evidence.
