# Frontend Application — Expected Semantics

This is a **development-time fixture**, not target project runtime input.

## Project Type Profile

- Project type: `frontend-application`
- Template: `templates/business-domain-l4/frontend-application.md`

## Required Semantic Surface

The frontend-application profile must cover:

- **Entry Types**: route / page / component / store / API / popup / navigation
- **State and Visibility**: state management and conditional visibility
- **Backend/Mock Boundary**: API surface and mock strategy
- **Visual Verification**: visual test or screenshot strategy

## Frontend Process Products

- `specs/{feature}/implementation.md`
- `specs/{feature}/workflow-status.md`
- `specs/{feature}/debug-guide.md`
- `specs/{feature}/observability.md`

Native shell technical bridge does not block unless business behavior is explicit.

## Redlines

- Must not use `.specify/memory/**` as runtime input
- Must not use `.specify/workflow/**` as runtime input
- Must not use `.specify/coding_guide/**` as runtime input
- Must not recommend filename-versioned artifacts

Legacy Skill usage: none
Legacy document runtime input: none
Legacy document write target: none
