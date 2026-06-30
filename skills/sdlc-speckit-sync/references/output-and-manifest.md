# Output And Manifest

## Sync Output

Default output:

```text
sync report in response or requested DocFlow/Gate report
```

When authorized, apply changes to the selected target documents and report exact paths.

Do not modify production code.

## Result Template

```markdown
# Speckit Sync Result: <Requirement ID>

## Source Artifacts

- Technical Specification:
- Solution Review:
- SpecKit Spec:
- SpecKit Plan:
- SpecKit Tasks:
- Implementation Result:
- Implementation Record:
- Code Review:
- Test Feedback:
- Manifest:

## Sync Scope

## Target Documents

| Target | Mode | Authorized | Result |
| --- | --- | --- | --- |

## Synced Facts Or Proposed Updates

| Fact | Source Evidence | Target | Result |
| --- | --- | --- | --- |

## Skipped Items

| Item | Reason | Required Evidence Or Action |
| --- | --- | --- |

## Conflict And Blocking Items

## Verification Basis

## Manifest Speckit Sync Recommendation

## Next Step
```

## Result Values

Use:

- `SYNCED`: authorized updates were applied.
- `PROPOSED`: no-write proposal produced.
- `PARTIAL`: some verified facts synced or proposed; skipped items remain.
- `BLOCKED`: sync cannot proceed.

## Manifest Recommendation

Recommend updates for the `Speckit Sync` section:

- Sync Required: yes/no
- Sync Executed: yes/no
- Target Documents
- Executed At
- Sync Artifact
- Residual Risks

Also recommend Activity Log:

- Actor / Skill: `sdlc-speckit-sync`
- Action: knowledge sync or sync proposal
- Result: `SYNCED`, `PROPOSED`, `PARTIAL`, or `BLOCKED`

Do not silently edit manifest unless explicitly requested.
