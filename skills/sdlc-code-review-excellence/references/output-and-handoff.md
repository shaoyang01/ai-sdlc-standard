# Output And Handoff

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
