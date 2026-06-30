# Sync Boundaries

## May Recommend

`sdlc-test-feedback-sync` may recommend updates to:

- Specification Checklist
- Code Review Checklist
- Test Feedback Schema
- Manifest Activity Log
- Manifest Change History
- Manifest Re-Gate Records
- Manifest Blocking Issues
- Speckit Sync target list
- Future reviewer or tester guidance

## Must Not Directly Modify

Do not directly modify:

- Business code
- Technical specification artifacts
- Code review artifacts
- Test feedback classification artifacts
- `.specify/business_domain/**`
- Checklist or Schema files
- Long-term knowledge files

Those modifications require a separate explicit user request or the appropriate downstream skill.

## Sync Eligibility

An item is eligible for later knowledge sync only when:

- The classification is resolved.
- Required Re-Gate has passed.
- The fact is validated by implementation or accepted process decision.
- The source artifact is the current effective version.
- The item is reusable beyond a one-off test failure.

## Do Not Sync

Do not sync:

- Failed behavior as current fact.
- Superseded specification.
- Unconfirmed requirement change.
- Environment-specific data accident.
- One-off test case mistake.
- Reviewer opinion without approved basis.

## Confirmation Required

Require explicit confirmation before recommending actual write-back for:

- Checklist or Schema edits.
- `.specify/**` updates.
- Business domain knowledge updates.
- Process rule changes that affect future requirements.

## Residual Risk

Every sync recommendation should record:

- Source artifact
- Reason
- Target area
- Required confirmation
- Re-Gate dependency
- Residual risk if not synced
