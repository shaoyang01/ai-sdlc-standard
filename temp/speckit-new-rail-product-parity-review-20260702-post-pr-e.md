# New-Rail Speckit Product Parity Review After PR E

Date: 2026-07-02

## Review Goal

This is a development-time parity review. It compares the current new-rail
`sdlc-speckit-*` Skills, shared standard documents, bootstrap scripts, generated
private project documents, and typed business-domain templates against legacy
Speckit examples from:

- `/Users/eric_shaoooo/meicai/projects/logistics-center`
- `/Users/eric_shaoooo/meicai/projects/pfms`
- `/Users/eric_shaoooo/meicai/projects/pfms-rn`
- `/Users/eric_shaoooo/meicai/projects/tms-flink-finance`

This review does not mean new-rail runtime should compare against legacy files.
The expected runtime model remains fully isolated: new-rail Skills read the
standard package, generated project-private documents, current `specs/{feature}`
artifacts, and `.specify/business_domain/**`; legacy Skills and legacy docs stay
untouched.

## Commands And Evidence

Executed:

```bash
ruby scripts/validate-skill-contracts.rb
scripts/bootstrap-speckit-project.sh /Users/eric_shaoooo/meicai/projects/logistics-center --dry-run
scripts/bootstrap-speckit-project.sh /Users/eric_shaoooo/meicai/projects/pfms --dry-run
scripts/bootstrap-speckit-project.sh /Users/eric_shaoooo/meicai/projects/pfms-rn --dry-run
scripts/bootstrap-speckit-project.sh /Users/eric_shaoooo/meicai/projects/tms-flink-finance --dry-run
```

Result:

- `validate-skill-contracts.rb`: passed.
- `logistics-center` bootstrap dry-run: completed; selected `backend-business-service`.
- `pfms-rn` bootstrap dry-run: completed; selected `frontend-application`.
- `tms-flink-finance` bootstrap dry-run: completed; selected `data-pipeline-etl`.
- `pfms` bootstrap dry-run: stopped after exceeding the practical review window;
  this indicates a remaining large-repository performance/scan-scope risk.

Also reviewed current PR E validation report:

- `temp/entry-coverage-precision-validation-report.md`

That report showed the enhanced runner output shape is correct, but all four
sample repositories currently lack `.specify/entry-coverage-profile.yaml`, so
repository-local strict audit cannot run until bootstrap/profile generation is
applied.

## Legacy Sample Product Shape

### logistics-center

Observed:

- `specs/**`: 89 files.
- Core legacy Speckit files: 11 `spec.md`, 10 `plan.md`, 10 `tasks.md`, 10
  `research.md`, 10 `data-model.md`, 10 `quickstart.md`, 10 checklist files,
  plus contracts and SQL migration files.
- `.specify/business_domain/**`: 26 files.
- EntryCoverage docs: 10.

Representative legacy semantics:

- Backend entry chain: RPC, MQ processor, schedule/task.
- Stable L4 facts include entry chain, transaction or consistency boundary,
  idempotency, rollback, compensation, verification matrix, code anchors, and
  Sync mapping.
- Old quickstart files include behavior simulation and strict entry coverage
  gate command.

Current new-rail parity:

- Strong. `backend-business-service` template covers entry chain, transaction,
  idempotency, rollback, compensation, stable facts, and test evidence.
- PR E runner can classify and match backend entries and service reverse
  coverage, but sample repo still needs generated `.specify/entry-coverage-profile.yaml`.

Remaining gap:

- Some backend technical bridge families such as annotation processors and MCQ
  base processors are still easy to classify as business entries unless profile
  overrides or broader classifier terms are added.
- New bootstrap can detect many entries, but it cannot infer confirmed business
  L1/L2/L4 ownership without user-confirmed domain map.

### pfms

Observed:

- `specs/**`: 58 files.
- Core files include 9 `spec.md`, 8 `plan.md`, 7 `tasks.md`, 6 `research.md`,
  6 `data-model.md`, 6 `quickstart.md`, contracts, implementation subdocs, and
  one HTML plan artifact.
- `.specify/business_domain/**`: 41 files.
- EntryCoverage docs: 12.

Representative legacy semantics:

- Admin/backend mixed workflow.
- L4 docs include approval state machines, OAS callbacks, audit/log records,
  import/export style flows, read-only RPCs, persistence side effects,
  transaction boundaries, error messages, and code evidence index.

Current new-rail parity:

- Mostly strong in document semantics. `admin-mixed-workflow` template covers
  configuration lifecycle, approval/audit, import/export, read-only query, and
  concurrency/rollback.
- `technical-specification-template.md` and `sdlc-speckit-plan` now require
  backend/admin evidence and contract coverage.

Remaining gap:

- The `pfms` bootstrap dry-run did not complete within the review window. This
  is not a semantic design failure, but it is a rollout risk for larger backend
  admin repositories.
- Existing PFMS L4 docs have rich concrete code facts, SQL conditions, status
  machines, and exact error messages. Bootstrap can create the skeleton, but
  equivalent richness only appears after Specify/Plan/Implement/Sync extracts
  and verifies facts.

### pfms-rn

Observed:

- `specs/**`: 57 files.
- Unique frontend/RN legacy process files:
  - `implementation-details.md`
  - `SDD_WORKFLOW_STATUS.md`
  - `API_DEBUG_GUIDE.md`
  - `QUICK_DEBUG_REFERENCE.md`
  - `LOGGING_IMPLEMENTATION.md`
  - `FINAL_SUMMARY.md`
- `.specify/business_domain/**`: 30 files.
- EntryCoverage docs: 0.

Representative legacy semantics:

- Route registration, MobX store/action registration, page/component mapping,
  API client mapping, popup/dialog flow, visual behavior, mock/real data,
  detailed API debug, logging diagnostics, and final handoff summary.
- Business-domain L4 docs are page-oriented implementation maps, with page flow,
  feature parity, API endpoints, state management, and business rules.

Current new-rail parity:

- Much improved after PR D. New stable process product paths now exist:
  - `specs/{feature}/implementation.md`
  - `specs/{feature}/workflow-status.md`
  - `specs/{feature}/debug-guide.md`
  - `specs/{feature}/observability.md`
  - `library/{requirement_id}/03-实现记录/...`
  - `library/{requirement_id}/04-交付总结/...`
- `frontend-application` L4 template covers route/page/component/store/API,
  popup, state/visibility, backend/mock boundary, and visual verification.
- Bootstrap dry-run correctly selected `frontend-application`.

Remaining gap:

- Bootstrap source-root detection for RN currently includes native/Pods-style
  paths and undercounts actual JavaScript business entries. The generated
  profile has frontend entry types, but the code evidence summary is noisy.
- PR E audit can match frontend route/page/component/store/API/popup when the
  profile is tuned, but bootstrap needs better default RN source-root filtering
  and frontend entry discovery.
- Existing RN business_domain docs are not EntryCoverage-shaped. New audit
  matching falls back to text/path evidence unless docs are normalized or sync
  adds structured evidence.

### tms-flink-finance

Observed:

- `specs/**`: 117 files.
- Core files include 11 `spec.md`, 11 `plan.md`, 11 `tasks.md`, 11
  `research.md`, 11 `data-model.md`, many contract files, `analyze.md`,
  `reconcile.md`, quality gate files, and ETL-specific SQL/data contracts.
- `.specify/business_domain/**`: 40 files.
- EntryCoverage docs: 1.

Representative legacy semantics:

- ETL job entry, Spark/Flink runtime, trigger/config parameters, input/output
  contracts, SQL lineage, partition/window, replay/idempotency, downstream MQ
  consumer, diagnostics, quality gate, and rollback.

Current new-rail parity:

- Stronger after PR C and PR E. `data-pipeline-etl` template covers trigger,
  input, output, SQL lineage, partition/window/checkpoint, replay/idempotency,
  downstream consumer, and test evidence.
- Bootstrap dry-run correctly selected `data-pipeline-etl`.
- PR E audit recognizes job/function/connector/sink/SQL evidence.

Remaining gap:

- ETL legacy specs use many focused contract files under `contracts/`. New-rail
  `sdlc-speckit-plan` requires contract coverage, but there is not yet a
  project-type contract file matrix that forces separate ETL contract artifacts
  to match old output granularity.
- Technical connector classes such as deserialization schema or sink helpers can
  still require profile override/classifier tuning to avoid false business
  blocking.

## New-Rail Capability Matrix

| Capability | Current status | Parity estimate | Notes |
| --- | --- | ---: | --- |
| Dual-rail isolation | Good | 95% | New Skills explicitly avoid legacy Skill calls and legacy `.specify/memory/**`, `.specify/workflow/**`, `.specify/coding_guide/**` runtime input. |
| Core specs products | Good | 85% | `spec.md`, `plan.md`, `tasks.md`, route, manifest, gates, and contracts are covered; old `research.md`, `data-model.md`, `quickstart.md` can be represented but are not always forced as separate files. |
| Domain Route boundary | Good | 90% | `specs/{feature}/route.md` now gives a stable boundary for Specify/Plan/Analyze/Sync/Reconcile. |
| Frontend/RN process products | Good | 85% | PR D gives new stable landing zones for old implementation/debug/logging/status/final-summary semantics. |
| Project-type L4 skeletons | Good | 80% | Typed templates cover backend, admin, frontend, ETL, and library shape. Concrete old-doc richness still depends on verified sync. |
| Entry coverage precision | Improved | 80% | PR E fields and reports are usable. Operationally blocked until profiles exist in repos. |
| Analyze Gate readiness | Partial | 70% | Analyze reads PR E fields, but full enforcement depends on PR F and generated profiles. |
| Bootstrap project-type detection | Mixed | 70% | backend and ETL detection are acceptable; RN source-root and large PFMS performance need work. |
| Sync create-if-missing | Mostly good | 80% | Uses route Project Type Profiles and typed templates; still needs strict profile availability and clearer wording around non-business sync targets. |
| Legacy product exactness | Partial | 75% | Semantics are mostly covered, but old output granularity is not always reproduced as separate artifacts. |

Overall judgment after PR E: the new rail is roughly 80% to 85% semantically
equivalent for generating old-style Speckit/business-domain outcomes, provided
the repository is bootstrapped and has a confirmed route/domain map. It is not
yet safe to claim "perfect old Skill product parity" for all four project types.

## Can A New Bootstrap + New Pipeline Generate Old-Equivalent Products?

Short answer: conditionally yes for structure and most required semantics, not
yet fully for exact old-product richness.

If a project runs bootstrap, confirms project profiles/domain map, then uses
`sdlc-speckit-pipeline` for a requirement:

- It should generate or update the new equivalent of old `spec.md`, `plan.md`,
  `tasks.md`, route, manifest, and gate records.
- It should generate frontend/RN implementation/debug/observability/status
  evidence in new paths instead of old filenames.
- It should be able to create missing L4 skeletons using project-type templates
  instead of one generic backend skeleton.
- It should be able to run enhanced entry coverage once the profile exists.

But it still may not automatically generate:

- the same number and granularity of old `contracts/*.md` files for ETL and
  backend integration flows;
- old-style `quickstart.md` behavior simulation as a dedicated artifact for
  every backend/ETL feature;
- old-style `research.md` and `data-model.md` as separate artifacts when the
  new plan embeds that content;
- rich business_domain facts such as exact error messages, SQL predicates,
  retry windows, diagnostic logs, and state-machine revisions unless those are
  explicitly extracted during Plan/Implement/Sync;
- reliable RN entry inventory without profile tuning.

## Blocking vs Non-Blocking Gaps

### Must Fix Before Claiming Full Parity

1. **Bootstrap/profile availability and performance**
   - Sample repos currently do not have `.specify/entry-coverage-profile.yaml`.
   - `pfms` dry-run was too slow for this review window.
   - PR F should not assume entry coverage is available unless bootstrap/profile
     generation has completed.

2. **RN/front-end source-root and entry detection**
   - Bootstrap currently includes native/Pods paths and undercounts JS business
     routes/pages/stores/APIs.
   - This affects both initial profile quality and later Analyze Gate signal.

3. **ETL/backend contract artifact granularity**
   - New plan says contract coverage is required, but old ETL examples generate
     many explicit contract docs. New rail needs a clearer project-type contract
     matrix or generated contract target list.

4. **Entry coverage classifier override path**
   - PR E handles many technical bridges, but real projects still need local
     overrides for MCQ base processors, route registries, native shell, connector
     helpers, and generated/vendor code.

### Important But Not Immediate Blockers

1. **Old quickstart/research/data-model product exactness**
   - New rail can carry the same meaning in plan/spec/implementation/debug docs,
     but it does not always produce separate old-style files.

2. **business_domain fact richness**
   - Type templates are good skeletons, not substitutes for verified code facts.
   - This should be improved through Sync and Reconcile quality, not by copying
     old docs.

3. **Ambiguous sync-target wording**
   - `skills/sdlc-speckit-sync/references/sync-targets.md` still mentions
     "Coding guides or workflow notes" as common targets. The surrounding rules
     forbid legacy runtime dependency, but this wording should be tightened to
     "project-context guides or approved non-legacy targets" to avoid accidental
     `.specify/workflow/**` / `.specify/coding_guide/**` writes.

## Recommended Next PR

Recommended PR F scope should be **Analyze Gate Strengthening**, but it should
start by depending only on structured fields that already exist:

- `specs/{feature}/route.md`
  - Route Type
  - Project Type Profiles
  - Business Domain Targets
  - Entry Coverage Surface
  - Create-If-Missing Decision
- `entry_inventory.tsv`
  - classification
  - classification_reason
  - match_strength
  - match_reason
  - matched_l2
  - matched_docs
  - requirement_scope
- `service_inventory.tsv`
  - reverse_coverage_status
  - classification
  - match_strength
  - match_reason
- process products
  - `implementation.md`
  - `workflow-status.md`
  - `debug-guide.md`
  - `observability.md`

PR F should not parse free-form markdown as the primary source of truth. It
should fail fast when the entry coverage profile is missing for a requirement
that needs entry coverage, and it should treat technical bridge classifications
as visible evidence rather than default blockers.

## Final Conclusion

Compared with the previous parity state, the gap is meaningfully smaller after
PR C, PR D, PR D cleanup, and PR E:

- The old Domain Route semantics now have a first-class route artifact.
- Frontend/RN process products now have new-rail locations.
- Business-domain L4 skeletons are project-type-specific.
- Entry coverage now has precision fields and non-blocking technical bridge
  classifications.

Remaining gap is no longer "missing whole semantic families"; it is now mainly
about operational hardening and exact product granularity:

- profile generation and performance;
- RN source-root/entry detection;
- ETL/backend contract artifact granularity;
- classifier overrides;
- Analyze Gate enforcement using structured PR E outputs.

Current new rail can support continued development, but should not yet be
declared fully equivalent to legacy Speckit for all sample project types until
the blockers above are addressed.
