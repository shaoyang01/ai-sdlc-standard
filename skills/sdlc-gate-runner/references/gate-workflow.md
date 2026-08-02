# Gate Runner Workflow

## Purpose

Use this workflow to determine whether a requirement may enter the next DocFlow phase.

`sdlc-gate-runner` checks evidence and process validity. It does not replace the specialized skill that produces a content review, such as `sdlc-solution-reviewer` for the Specification Gate.

## Step 1: Identify Gate Context

Collect:

- Requirement ID
- Manifest path
- Current phase
- Target next phase
- Gate name
- Gate Type: `generic` / `development_path_entry` / `documentation_governance_tail_completion`
- Reviewed artifact
- Gate artifact, if separate from the reviewed artifact
- Current effective artifact versions
- Development Path Decision, if checking implementation entry

If the user provides only a requirement ID, search within:

```text
library/{requirement_id}/manifest.md
```

Stop if the manifest cannot be found.

## Step 2: Determine Gate Type

Classify the Gate explicitly before any gate-specific check:

- `generic` for Requirement Gate, Specification Gate, Planning Gate, Task Gate, Implementation Gate, Code Review Gate, Test Gate, and Knowledge Sync Gate.
- `development_path_entry` when checking entry into the implementation path.
- `documentation_governance_tail_completion` when checking Shared Documentation Governance Tail completion.

Generic Gate behavior stays compatible. The two special Gate Type values are canonical: do not rename them, create aliases, or add a third special value.

Both special Gates read `ai-sdlc/development-path-governance.md` in addition to the Required Standard Files. If the Gate Type cannot be inferred from the manifest or user request, ask for the target phase.

## Step 3: Check Manifest Completeness

Verify that the manifest has enough evidence:

- Metadata
- Development Path Decision, when implementation entry is being checked
- Artifact Index
- Activity Log
- Change History
- Replaced Artifact Paths
- Re-Gate Records
- Gate Decisions
- Missing Artifacts
- Blocking Issues
- Next Step

For Tail checks, the Manifest `documentation_governance_tail` section is the Tail status authority: it owns the current Tail status and evidence pointers. Missing optional sections are Medium unless they hide required Gate evidence.

## Step 4: Check Required Artifacts

For every required artifact:

- Confirm the path is present in Artifact Index or provided by the user.
- Confirm the file exists or the source is otherwise readable.
- Confirm the file belongs to the same `library/{requirement_id}/` directory.
- Confirm the stable path is the one recorded in the Manifest.
- Confirm the stable path and 内部 Version match the current effective version.
- Confirm the artifact is not stale.

Missing required artifacts are Critical.

## Step 5: Check Existing Gate Results

When a previous Gate result is the basis for continuing:

- `PASS` permits continuation unless change-control blocks it.
- `PASS_WITH_RISK` permits continuation only with complete risk acceptance.
- `FAIL` blocks continuation.
- Missing result blocks continuation when the phase requires a Gate.

Do not reinterpret a specialized review as passing when it did not explicitly say `PASS` or `PASS_WITH_RISK`.

## Step 6: Check Change-Control

Inspect:

- Change History
- Replaced Artifact Paths
- Re-Gate Records
- Blocking Issues
- 风险接受记录

If an open change affects an earlier node, require Re-Gate from that node before allowing continuation. Confirm the reviewed artifact path and Version are current before relying on any Gate or decision.

## Step 7: Run Development Path Entry Checks

When the Gate Type is `development_path_entry`, execute the routing rules from `ai-sdlc/development-path-governance.md`:

- Manifest readable and Requirement ID consistent.
- Specification Gate current and allows continuation.
- Development Path Decision exists and is exactly `DIRECT_IMPLEMENTATION`, `SPECKIT_PIPELINE_REQUIRED`, or `BLOCKED_NEEDS_REVISION`.
- Decision Scope current and exactly `FULL_REQUIREMENT` or `DELTA_CHANGE`.
- Complexity current and exactly `SIMPLE`, `MEDIUM`, `COMPLEX`, or `BLOCKED_UNKNOWN`.
- Decision source and Decision artifact exist and are current.
- Reviewed artifact path and Version current.
- Tail required, Tail scope, and initial Tail status determined.
- No stale evidence, no unresolved blocking change, and required Re-Gate passed.

Routing:

- `DIRECT_IMPLEMENTATION`: only `PASS` or valid `PASS_WITH_RISK` enters direct implementation.
- `SPECKIT_PIPELINE_REQUIRED`: only `PASS` or valid `PASS_WITH_RISK` enters the Speckit path; it must not enter Direct Implementation.
- `BLOCKED_NEEDS_REVISION`: `FAIL`, return to the earliest affected node, no implementation and no Tail.
- `BLOCKED_UNKNOWN`: `FAIL`.
- Missing, stale, invalid, or non-current decision evidence: `FAIL`.

## Step 8: Evaluate Tail Evidence (Evidence Evaluation, Stage A)

When the Gate Type is `documentation_governance_tail_completion`, first evaluate all external completion evidence:

Distinguish actual implementation from pure documentation, analysis, or governance work:

- Actual implementation always requires current valid `03-实现记录`, `04-代码审核`, and `05-测试验收`.
- Pure documentation, analysis, or governance tasks may judge items `not_required` or `not_applicable`, but must record scope, reason, evidence, decision source, decision owner, artifact/version basis, and the stale condition.

Verify:

- Manifest readable and Requirement ID consistent.
- Canonical Documentation Governance Tail section exists.
- Tail required, scope, and status current.
- `required_artifacts` and `completed_artifacts` current.
- `skipped_items` fully justified.
- `blocking_items` has no unresolved items.
- business_domain_sync decision current.
- Reconcile decision current.
- Sync/Reconcile decision and execution result are separated; required execution must be complete before continuing.
- Entry Coverage only when applicable; `PENDING`, `FAILED`, or `BLOCKED` Entry Coverage blocks completion.
- Required Re-Gate passed.
- Risk acceptance complete.
- Upstream evidence not stale.
- `completion_evidence` current and determinable.

Stage A evaluates external evidence only. The Gate report this call will generate is not an input of Stage A, and a persisted Gate artifact is not a required input of Stage A: the persisted artifact is the output of Stage B. First-run absence of the stable artifact is not a pre-evaluation failure.

Do not accept `04-交付总结`, Delivery Summary, Pipeline result, Stage Summary, workflow-status snapshot, or chat conclusions as the Tail Completion Gate. Do not treat Tail Status `planned` or `in_progress`, Pipeline `COMPLETED`, or a Draft PR as completion.

## Step 9: Determine Provisional Evidence Result

After Stage A, determine the internal provisional evidence result: `PASS`, `PASS_WITH_RISK`, or `FAIL`.

The provisional evidence result is internal to this call only: it is not a formal Gate result, does not allow entering the next phase, does not mark the Manifest Tail as completed, and does not become `completion_decision_source`.

If the provisional result is `FAIL`, the formal result is `FAIL`: Can Continue=no and Tail Completion Eligible=no; a FAIL report may be persisted only when the user has authorized persistence; no completion eligibility is produced.

Response-only exit: when the user has not authorized persisting the Gate report, the run ends after Stage A. Return a response-only preview with canonical Result=FAIL, Can Continue=no, and Tail Completion Eligible=no; record persistence not authorized as a blocking item; leave the Manifest unchanged; describe the provisional evidence result in the Conclusion or Tail Completion Decision; do not claim a persisted artifact exists, do not invent artifact paths or Versions, and do not establish `completion_decision_source`.

## Step 10: Persist And Read Back Gate Artifact (Persist And Confirm, Stage B)

Only when all of the following hold may a formal `PASS` or valid `PASS_WITH_RISK` be formed:

- The user explicitly authorized persisting the Gate report.
- The provisional evidence result is `PASS` or valid `PASS_WITH_RISK`.
- The stable path can be determined.
- The next internal Version can be determined.
- The Gate report content can be generated completely.
- The write succeeds and the read back after the write succeeds.
- The read-back content passes structure and binding verification.

Use the stable paths below for the two special Gates (no filename-based versioning):

```text
library/{requirement_id}/02-方案审核/{requirement_id}_开发路径准入门禁.md
library/{requirement_id}/05-测试验收/{requirement_id}_治理尾段完成门禁.md
```

Before persisting, determine: stable path; internal Version; Status; Gate Type; Reviewed Artifact; Reviewed Artifact Version; Gate Artifact Version; Result; `completion_evidence`; `completion_decision_source`.

First formal run: the first formal call does not require a same-type Tail Completion Gate artifact to already exist when the call starts. When the stable path does not exist, as long as the user authorized persistence, the provisional result allows continuation, the stable path and the initial Version can be determined, and the write and read-back succeed, this call may directly form a formal `PASS` or valid `PASS_WITH_RISK`. Do not require a first `FAIL` run followed by a second `PASS` run, a manually pre-created empty Gate artifact, or a pre-filled fake completion source in the Manifest.

When the stable path already exists: read the current internal Version; verify the current artifact-Manifest relationship; determine the next Version per `ai-sdlc/artifact-versioning.md`; update the same stable file and must not create `_vN.md`; read back the new Version after the write; only a new Version that passes read-back may become the new completion source. When the old artifact is stale, replaced, or unverifiable, do not continue on the old artifact; handle it per the existing versioning and change-control rules; do not bypass with a filename companion.

**Read Back And Verify**

After writing, read back and verify:

- The file exists at the exact stable path.
- The file content is readable.
- The Requirement ID is correct.
- The Gate Type is `documentation_governance_tail_completion`.
- The internal Version equals the value determined for this run.
- The Gate Artifact Version equals the value determined for this run.
- The Status matches the Result.
- The Reviewed Artifact path and Version are correct.
- The Result equals the provisional evidence result.
- `completion_evidence` is present.
- `completion_decision_source` points exactly to the just-written stable path and the current Gate Artifact Version.
- The file is not stale or replaced.
- A filename-versioned companion path (such as `_vN.md`) is forbidden.

## Step 11: Establish Formal Gate Result

Use `templates/gate-result-template.md` for the report structure. Set `Can Continue: yes` only for `PASS` or valid `PASS_WITH_RISK`; `Can Continue: no` for `FAIL`. For `development_path_entry`, fill `## Development Path Check`. For `documentation_governance_tail_completion`, fill `## Documentation Governance Tail Evidence Check` and `## Tail Completion Decision`. For other Gates, the special sections may be marked `not_applicable` but fields must not be deleted.

Formal Gate Result is established only after read-back verification succeeds:

- The provisional `PASS` becomes the formal `PASS`; the provisional `PASS_WITH_RISK` becomes the formal `PASS_WITH_RISK`.
- Tail Completion Eligible=yes and Can Continue=yes.
- The Gate report becomes `completion_decision_source`: read-back success establishes `completion_decision_source` pointing to the just-written stable path and the current Gate Artifact Version.

An authorized persistence failure or a read-back failure is fail-closed: when the write failed, the stable path or Version cannot be confirmed, the file does not exist after the write, the read back fails, the read-back content is inconsistent, the Gate Type, Version, or Result does not match, the Reviewed Artifact binding does not match, the `completion_decision_source` self-binding does not match, the file is stale or replaced, or a filename-versioned companion conflict appears, the formal result must be `FAIL` with Can Continue=no and Tail Completion Eligible=no; the unverified file must not be treated as the current Gate artifact, no Manifest completed recommendation may be made, and the persistence or read-back blocker must be reported.

"运行开始时 stable artifact 尚不存在"本身不是 must-fail item；"授权持久化后仍无法写入或回读验证"才是 must-fail item。A persisted completion source is required only as the output of Stage B; missing it is a must-fail only when response-only cannot formally complete, persistence was not authorized, authorized persistence failed, or read-back still cannot establish a current completion source. Block when required conditional execution is incomplete, blocking items are non-empty, or a persisted completion source cannot be established after Stage B persistence and read-back.

## Step 12: Recommend Manifest Updates

Recommend updates only after the formal Gate result is established. Do not edit the manifest unless the user explicitly asks for file changes.

For a formal Tail completion, recommend that the Manifest record the current Gate artifact path, current Gate Artifact Version, Gate result, `completion_evidence`, and `completion_decision_source`; the Manifest may be marked `completed` only after it records these fields.
