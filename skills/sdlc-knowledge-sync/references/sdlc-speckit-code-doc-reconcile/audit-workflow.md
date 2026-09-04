# Audit Workflow

## 1. Establish Scope

Define the exact scope before comparing:

- Requirement ID.
- Legacy feature directory under `specs/**` (not a single-rail input; may be absent).
- Code modules, files, commits, or diff range.
- DocFlow directories (`library/{requirement_id}/**`).
- Process product paths:
  `specs/{feature}/implementation.md`,
  `specs/{feature}/workflow-status.md`,
  `specs/{feature}/debug-guide.md`, and
  `specs/{feature}/observability.md`.
- Knowledge target paths (`.sdlc/business_domain/**`).
- Whether the audit is full lifecycle or focused on one suspected drift.
- Sync provenance: `library/{requirement_id}/` artifacts + code state + verification evidence (single rail).

### Single-Rail Reconcile

When the requirement has no legacy `specs/{feature}/**`:

- Do not block because specs are missing; specs are not single-rail inputs.
- Use `library/{requirement_id}/**` as the primary document evidence source.
- Compare code ↔ library artifacts ↔ business_domain.
- Missing specs is not a drift; absence of legacy specs paths is expected on the single rail.
- Check manifest `business_domain_sync` status for prior sync attempts.

## 2. Build Artifact Inventory

Create an inventory with:

- Path.
- Version or timestamp.
- Current or stale state.
- Gate result.
- Source owner.
- Evidence available.

Mark missing artifacts as gaps. Do not infer absent artifacts from chat.

When `.sdlc/entry-coverage-profile.yaml` exists, run or reuse the standard entry coverage audit:

```bash
${AI_SDLC_STANDARD_HOME}/scripts/audit-entry-coverage.rb <target-project-path>
```

Include these generated files in the artifact inventory:

- `.sdlc/reports/entry_coverage/entry_inventory.tsv`
- `.sdlc/reports/entry_coverage/service_inventory.tsv`
- `.sdlc/reports/entry_coverage/entry_chain_evidence.md`
- `.sdlc/reports/entry_coverage/unarchived_entries.md`
- `.sdlc/reports/entry_coverage/unarchived_services.md`
- `.sdlc/reports/entry_coverage/cross_domain_conflicts.md`
- `.sdlc/reports/entry_coverage/entry_coverage_report.md`

## 3. Compare By Behavior

Compare artifacts at the behavior level, not only by file presence:

- Business rule.
- Input and output contract.
- Failure behavior.
- Authorization and data visibility.
- Data model, schema, or persistence.
- Idempotency, retry, and transaction behavior.
- Rollback and compatibility.
- Verification requirements.
- Frontend route, page, component, store, API, popup, visibility, backend/mock
  boundary, and visual verification behavior when applicable.
- Debug, reproduction, mock/real data switching, logging, metrics, frontend
  analytics, error state observation, and debug logs when applicable.

## 4. Trace Tasks To Code

For each implemented task:

- Confirm task exists in current `tasks.md`.
- Confirm task maps to spec and plan.
- Confirm changed code matches the task.
- Confirm verification exists for completed task status.
- Flag untracked code changes as `CODE_DRIFT` unless explicitly out of scope and unrelated.

## 5. Trace Code To Documents

For relevant code behavior:

- Locate supporting spec, plan, task, or DocFlow statement.
- Locate implementation record evidence.
- Locate process product evidence from `implementation.md`, `debug-guide.md`,
  and `observability.md`.
- Locate test or verification evidence.
- Locate synced knowledge fact, when applicable.

Classify any behavior without approved basis.

## 5.1 Trace Process Products To Code And Manifest

Process Product Drift must be evaluated against approved artifacts, the actual
code diff, and manifest.

For each new-rail process product:

- `specs/{feature}/implementation.md`: confirm file changes, technical
  decisions, frontend state, interaction behavior, and backend/mock boundary
  match the actual diff and approved tasks.
- `specs/{feature}/workflow-status.md`: confirm it is only a machine-side
  snapshot and that manifest is status authority. Any mismatch with manifest
  Current Stage, Current Status, Activity Log, Gate Records, Re-Gate Records, or
  Blocking Issues is `MANIFEST_DRIFT` or process product drift.
- `specs/{feature}/debug-guide.md`: confirm API debug steps, quick references,
  mock/real data switching, and reproduction steps still match the code and
  environment assumptions.
- `specs/{feature}/observability.md`: confirm logging, metrics, frontend
  analytics, error state observation, and debug logs match the implemented code
  or are explicitly not applicable.

Missing required frontend/RN process evidence should be recorded as a
documentation or process-product gap, not silently ignored.

## 6. Trace Knowledge To Evidence

For each changed or missing knowledge fact:

- Confirm the fact is reusable and stable.
- Confirm implementation and verification evidence exists.
- Confirm target ownership and authorization.
- Confirm no conflicting knowledge remains.

Route eligible missing facts to `sdlc-speckit-sync`.

## 7. Check Business-Domain Sync Status

Read manifest `business_domain_sync` section when present:

- Verify `duplicate_sync_guard`: if the record already shows `result: synced` for the same facts, flag potential duplicate sync.
- Verify `result`: if `synced`, check that business_domain facts can be traced to library source artifacts or verification evidence.
- Verify `result`: if `not_required`, confirm the reason is still valid.
- If library artifacts exist but business_domain facts are missing, flag as missing sync.
- If library evidence and code state disagree, flag as conflict.

## 8. Decide Result

Produce one primary classification and any secondary classifications.

Use `BLOCKED` when source-of-truth conflict prevents a safe decision.

Use entry coverage reports to classify drift:

- `unarchived_entries.md` non-empty: code entry exists without long-term knowledge coverage.
- `unarchived_services.md` non-empty: core unit lacks archived entry or accepted technical reason.
- `cross_domain_conflicts.md` non-empty: code/document routing conflict across L2 domains.
- `entry_coverage_report.md` status `BLOCKED`: reconciliation cannot mark code and business-domain docs consistent.

## 9. Check Business-Domain Naming And Shape

Verify business_domain document naming and shape consistency per `${AI_SDLC_STANDARD_HOME}/ai-sdlc/business-domain-naming-and-shape.md`:

- Document naming follows project current convention.
- Business_domain facts can be traced to source artifacts.
- New L4 documents record `naming_pattern_source` and `shape_profile_source`.
- No duplicate L4 candidates exist.
- Existing L4 shape was preserved (no whole-document rewrite without authorization).
- L2 main document index and `01DomainCatalog.md` include new L4 documents.

Flag as drift:
- **naming drift**: Document naming does not follow project convention.
- **shape drift**: Document shape differs from sibling L4 documents.
- **duplicate L4 drift**: Same domain concept covered by multiple L4 documents.
- **catalog/index drift**: L2 index or `01DomainCatalog.md` missing new L4.
- **source traceability drift**: Business_domain fact missing source artifact reference.
- Detect unsafe compatible update attempts.
- Detect whole-document rewrite drift.
- Detect New-Rail fixed section injection into legacy-shaped docs.
- Detect facts without source traceability.
- Detect missing implementation/verification evidence behind business_domain updates.
- Detect conflicting facts and classify conflict type (semantic_conflict, code_drift, doc_drift, stale_fact, scope_conflict, duplicate_fact, source_priority_conflict).
- Verify revision record includes rail/source/update section/evidence.
- Verify update proposal / reconcile proposal was generated when direct update was unsafe.
- Trace business_domain facts to approved/current library evidence; legacy specs paths are not single-rail inputs.
