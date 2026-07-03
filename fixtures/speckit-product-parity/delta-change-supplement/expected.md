# Delta Change / Supplement Requirement — Expected Semantics

This is a **development-time fixture**, not target project runtime input.

## Required Semantic Surface

### Intake Classification

- `Requirement Supplement`: user adds boundary, rule, attachment, or context to the same goal
- `Specification Missing`: original goal unchanged, but technical specification misses behavior, exception, compatibility, data, interface, state, or acceptance details

### Supplement Routing Fields

- `Same Requirement Decision`: yes/no
- `Parent Requirement ID`: original requirement ID
- `New Requirement Needed`: yes/no (only when business goal is independent)
- `Aggregate Requirement Scope`: context only
- `Current Change Scope / Delta Scope`: routing object for Development Path Decision
- `Original Implemented / Approved Scope`: previously approved scope
- `Out of Delta Scope`: what is explicitly excluded from this change

### Development Path Decision (DELTA_CHANGE mode)

- `Decision Scope: DELTA_CHANGE`
- `Delta Complexity`: SIMPLE / MEDIUM / COMPLEX / BLOCKED_UNKNOWN
- `Aggregate Complexity: reference only`
- `Ignored Aggregate Triggers`: original DB/MQ/schedule/multi-module triggers
- Development Path Decision must be based on Delta Scope
- Do not route by aggregate complexity for requirement supplements
- `DIRECT_IMPLEMENTATION` after delta Re-Gate when delta is simple
- `SPECKIT_PIPELINE_REQUIRED` only when delta itself is complex
- `BLOCKED_NEEDS_REVISION` when Delta Scope is missing or not reviewed

## Redlines

- Must not use `.specify/memory/**` as runtime input
- Must not use `.specify/workflow/**` as runtime input
- Must not use `.specify/coding_guide/**` as runtime input
- Aggregate scope must not trigger SPECKIT_PIPELINE_REQUIRED
- Must not recommend filename-versioned artifacts

Legacy Skill usage: none
Legacy document runtime input: none
Legacy document write target: none
