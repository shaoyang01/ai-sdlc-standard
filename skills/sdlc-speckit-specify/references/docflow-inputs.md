# DocFlow Inputs

## Required Inputs

`sdlc-speckit-specify` requires:

- `library/{requirement_id}/01-技术方案/*`
- `library/{requirement_id}/02-方案审核/*`
- `library/{requirement_id}/manifest.md`

Recommended:

- `00-需求资料`
- Development Path Decision
- Re-Gate Records
- Superseded Artifacts
- Accepted risk details

## Readiness Checks

Continue only when:

- `02-方案审核` result is `PASS` or valid `PASS_WITH_RISK`.
- `PASS_WITH_RISK` includes Accepted Risk, Accepted By, Reason, and Follow-up.
- Development Path Decision is `SPECKIT_PIPELINE_REQUIRED`, unless the user explicitly requests full SDD.
- Current artifacts are not superseded.
- No open Blocking Issues affect Scope, behavior, or acceptance.

## Missing Manifest

If manifest is missing:

- Continue only when the user provides exact artifact paths.
- Recommend creating `manifest.md`.
- Include Activity Log update recommendation in the output.

## Source Priority

Priority order:

1. Current effective `01-技术方案`.
2. Current effective `02-方案审核`.
3. Current manifest Development Path Decision and Re-Gate Records.
4. `00-需求资料`.
5. User clarification explicitly given after the Gate.

If later user clarification changes Scope or behavior, stop and apply change-control.
