# Gate Runner Workflow

## Purpose

Use this workflow to determine whether a requirement may enter the next DocFlow phase.

`gate-runner` checks evidence and process validity. It does not replace the specialized skill that produces a content review, such as `solution-reviewer` for the Specification Gate.

## Step 1: Identify Gate Context

Collect:

- Requirement ID
- Manifest path
- Current phase
- Target next phase
- Gate name
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

Use the current phase and target next phase to classify the Gate:

- Requirement Gate
- Specification Gate
- Planning Gate
- Task Gate
- Implementation Gate
- Code Review Gate
- Test Gate
- Release Gate
- Knowledge Sync Gate

If the Gate type cannot be inferred from the manifest or user request, ask for the target phase.

## Step 3: Check Manifest Completeness

Verify that the manifest has enough evidence:

- Metadata
- Development Path Decision, when implementation entry is being checked
- Artifact Index
- Activity Log
- Change History
- Superseded Artifacts
- Re-Gate Records
- Gate Decisions
- Missing Artifacts
- Blocking Issues
- Next Step

Missing optional sections are Medium unless they hide required Gate evidence.

## Step 4: Check Required Artifacts

For every required artifact:

- Confirm the path is present in Artifact Index or provided by the user.
- Confirm the file exists or the source is otherwise readable.
- Confirm the file belongs to the same `library/{requirement_id}/` directory.
- Confirm the filename version matches the current effective version.
- Confirm the artifact is not superseded.

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
- Superseded Artifacts
- Re-Gate Records
- Blocking Issues

If an open change affects an earlier node, require Re-Gate from that node before allowing continuation.

## Step 7: Produce The Gate Report

Use `templates/gate-result-template.md`.

Set:

- `Can Continue: yes` only for `PASS` or valid `PASS_WITH_RISK`.
- `Can Continue: no` for `FAIL`.
- Required Actions for every Critical and High issue.
- Next Step as the exact next process action.

## Step 8: Recommend Manifest Updates

Recommend updates only. Do not edit the manifest unless the user explicitly asks for file changes.
