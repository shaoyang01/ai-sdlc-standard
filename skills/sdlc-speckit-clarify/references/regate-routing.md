# Re-Gate Routing

## When To Re-Gate

Recommend Re-Gate when residual clarification reveals:

- Specification Missing
- Requirement Change
- Scope conflict
- Behavior conflict
- Missing failure strategy
- Missing compatibility strategy
- Missing data or state behavior
- Missing acceptance criteria

## Earliest Affected Node

| Issue | Earliest Affected Node |
| --- | --- |
| Requirement goal or scope changed | `00-需求资料` |
| Technical behavior missing or changed | `01-技术方案` |
| Solution review required action unresolved | `02-方案审核` |
| SpecKit spec sync mismatch | `sdlc-speckit-specify` output plus DocFlow source check |

## Recommended Skill

Use:

- `sdlc-requirement-normalizer` for changed or unclear requirement goal.
- `sdlc-specification-writer` for missing technical behavior.
- `sdlc-solution-reviewer` for renewed Specification Gate.
- `sdlc-gate-runner` for readiness verification.

## Manifest Recommendation

Record:

- Trigger
- From Node
- Required Gate
- Gate Artifact
- Result
- Next Step

Do not proceed to `sdlc-speckit-plan` until the required Gate passes.
