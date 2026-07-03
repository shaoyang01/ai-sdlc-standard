# Business-Domain Compatible Update — Expected Semantics

This is a **development-time fixture**, not target project runtime input.

## Required Semantic Surface

### Compatible Update

- Existing L4 update preserves title, metadata, section language, table style, revision history style.
- Stable facts are inserted into closest matching existing section.
- Unknown insertion point → update proposal.
- Conflicting facts → reconcile proposal.
- New-Rail fixed English sections must not be injected into legacy-shaped L4 by default (no forced New-Rail section injection — must not inject Entry Chain into legacy-shaped doc by default — forbidden).
- Whole-document rewrite is prohibited unless explicit owner authorization and separate migration plan exist (must not rewrite existing L4 to New-Rail template — forbidden).
- Revision records include rail, sync_source_mode, source_artifacts, update_section, implementation evidence, verification evidence (revision and traceability).

### Fact Conflict Types

- semantic_conflict: same concept, different meaning
- code_drift: code changed but document not updated
- doc_drift: document updated but code unchanged
- stale_fact: fact was true but is now outdated
- scope_conflict: fact belongs to different L2/L4 scope
- duplicate_fact: same fact already exists in another L4
- source_priority_conflict: spec vs library vs code disagree

### Output Modes

- DIRECT_UPDATE: all safe insert conditions satisfied
- UPDATE_PROPOSAL: shape understood but insertion point uncertain
- RECONCILE_PROPOSAL: fact conflict or drift detected
- BLOCKED: target/shape/evidence/authorization missing

### Revision and Traceability

Revision records include rail, sync_source_mode, source_artifacts, update_section, implementation evidence, verification evidence.

### Library-Driven

library_driven can propose/update only from approved/current library evidence and verification evidence. Must not overwrite conflicting business facts (must not overwrite conflicting business facts — forbidden). Must not delete existing facts without explicit supersession (must not delete existing facts without explicit supersession — forbidden). Must not use chat as source of truth (must not use chat as source of truth — forbidden).

## Redlines

- Must not rewrite existing L4 to New-Rail template (forbidden)
- Must not inject Entry Chain into legacy-shaped doc by default (forbidden)
- Must not overwrite conflicting business facts (forbidden)
- Must not delete existing facts without explicit supersession (forbidden)
- Must not use chat as source of truth (forbidden)

Legacy Skill usage: none
Legacy document runtime input: none
Legacy document write target: none

## PR L Cleanup: Anti-Regression

- create-if-missing blocking must use project canonical naming + project shape profile, not Project Type Profiles / Selected L4 Template as primary conditions.
- Project Type Profiles / selected fallback template can block only when standard template fallback is explicitly active (standard template fallback is explicitly active).
- Sync workflow target resolution includes library artifacts / manifest in library_driven mode (library artifacts / manifest in library_driven mode).
