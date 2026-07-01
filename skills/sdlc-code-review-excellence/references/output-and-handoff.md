# Output And Handoff

## Artifact Versioning Requirements

When this reference produces or updates a DocFlow requirement artifact under
`library/{requirement_id}/`, it must use a stable path and update the same file.
Do not create `__vN.md` or other filename-versioned artifacts.

The artifact must include:

```markdown
## Metadata

- Requirement ID:
- Artifact Type:
- Version: 1.0.0
- Status: draft / active / passed / failed / stale / replaced
- Author / Skill:
- Created At:
- Updated At:
- Reviewed Artifact:
- Reviewed Artifact Version:
- Gate Artifact Version:

## 修订记录

| Version | Date | Author / Skill | Change Type | Summary | Re-Gate |
| --- | --- | --- | --- | --- | --- |
| 1.0.0 |  |  | initial | Initial current artifact. | no |
```

For non-Gate artifacts, `Reviewed Artifact`, `Reviewed Artifact Version`, and
`Gate Artifact Version` may be omitted when there is no reviewed upstream
artifact. For Gate, review, sync, and reconcile artifacts, they are required.

The body must contain only the current effective content. Historical changes
belong in `## 修订记录`, manifest `Change History`, and Git history.

## Review Result Shape

Use this structure:

```md
# Code Review Result

## Source Artifacts

- Requirement ID:
- Reviewed scope:
- Specification:
- Implementation record:
- Verification evidence:

## Review Result

- Result: PASS / FAIL / PASS_WITH_RISK
- Can Continue: yes/no

## Findings By Severity

### Critical

### High

### Medium

### Low

### Notes

## Missing Information

- None, or list missing source/evidence.

## Suggested Fixes

- Finding ID:
- Fix direction:
- Scope boundary:

## Re-Gate Recommendation

- Required:
- Earliest affected node:

## Normalizer Handoff

- Recommended: yes/no
- Target: `sdlc-code-review-normalizer`
- Notes:

## Manifest Update Recommendation

- Code Review Gate:
- Activity Log:
- Blocking Issues:

## Next Step

- Recommended action:
```

## Handoff To Normalizer

Use `sdlc-code-review-normalizer` when:

- The review must be written to `library/{requirement_id}/04-代码审核/`.
- Multiple review sources must be merged.
- The report must strictly follow `ess/code-review-schema.md`.
- Manifest Code Review Gate recommendations need a DocFlow artifact.

## Manifest Recommendation

Recommend manifest updates with:

- Timestamp.
- Reviewer or Skill: `sdlc-code-review-excellence`.
- Reviewed scope.
- Result.
- Blocking findings.
- Risk acceptance, if any.
- Next step.

Do not write manifest directly unless the user explicitly requests document writing through the appropriate DocFlow path.
