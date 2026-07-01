# Blocking And Re-Gate

## Blocking Conditions

Stop when:

- Analyze Gate has Blocking Items.
- Required artifacts are missing or stale.
- Task target cannot be mapped to code safely.
- Implementation requires undefined business behavior.
- Existing code contradicts the approved spec, plan, or tasks.
- Required behavior would change original-flow compatibility.
- Required verification cannot be defined.
- Compile or core tests fail.
- Unrelated local changes make safe edits impossible.

## Re-Gate Routing

Route blockers to the earliest affected node:

- Requirement meaning or business goal issue -> `00-需求资料` or `01-技术方案`.
- Technical behavior missing -> `01-技术方案`.
- Unaccepted risk or review gap -> `02-方案审核`.
- Spec mismatch -> `sdlc-speckit-specify`.
- Residual ambiguity -> `sdlc-speckit-clarify`.
- Technical plan gap -> `sdlc-speckit-plan`.
- Missing or invalid task -> `sdlc-speckit-tasks`.
- Cross-artifact inconsistency -> `sdlc-speckit-analyze`.
- Implementation defect within approved scope -> continue implementation and re-verify.

## Requirement Change During Implementation

If a new or changed requirement appears during implementation:

- Stop implementing the affected behavior.
- Apply `ai-sdlc/change-control.md`.
- Mark affected tasks blocked.
- Recommend new artifact version and Re-Gate from the earliest affected node.

## Partial Implementation

Partial implementation is allowed only when:

- Completed tasks are independently safe.
- Unfinished tasks are clearly recorded.
- Verification results are recorded.
- The next step is explicit.

Partial implementation must not be represented as full completion.
