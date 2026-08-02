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

## Step 8: Run Tail Completion Checks

When the Gate Type is `documentation_governance_tail_completion`:

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
- `completion_evidence` current and `completion_decision_source` formally established from a current, non-stale persisted Gate artifact.

Block when required conditional execution is incomplete, blocking items are non-empty, or the persisted completion source is missing. Response-only output is only a preview and cannot complete the Tail; a response-only preview must not claim completion.

Do not accept `04-交付总结`, Delivery Summary, Pipeline result, Stage Summary, workflow-status snapshot, or chat conclusions as the Tail Completion Gate. Do not treat Tail Status `planned` or `in_progress`, Pipeline `COMPLETED`, or a Draft PR as completion.

## Step 9: Produce The Gate Report

Use `templates/gate-result-template.md`.

Set:

- `Can Continue: yes` only for `PASS` or valid `PASS_WITH_RISK`.
- `Can Continue: no` for `FAIL`.
- Required Actions for every Critical and High issue.
- Next Step as the exact next process action.
- For `development_path_entry`, fill `## Development Path Check`.
- For `documentation_governance_tail_completion`, fill `## Documentation Governance Tail Evidence Check` and `## Tail Completion Decision`.
- For other Gates, the special sections may be marked `not_applicable` but fields must not be deleted.

## Step 10: Recommend Manifest Updates

Recommend updates only. Do not edit the manifest unless the user explicitly asks for file changes.
