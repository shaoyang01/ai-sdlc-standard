# Route Artifact — Expected Semantics

This is a **development-time fixture**, not target project runtime input.

## Required Semantic Surface

The route artifact must cover:

- **Artifact Path**: `specs/{feature}/route.md`
- **Route Type**: existing-change / new-flow / integration-change / data-change / unknown
- **Business Domain Targets**: matched L1/L2/L4 targets
- **Entry Coverage Surface**: entry types and coverage scope
- **Create-If-Missing Decision**: whether to create L4 skeleton
- **Pipeline Domain Route Summary**: summary of routing decision

## Blocking Semantics

- `unknown` route type blocks before Specify unless user confirms

## Redlines

- Legacy Skill usage: none
- Legacy document runtime input: none
- Legacy document write target: none
- Must not recommend copying business_domain from another repository

Legacy Skill usage: none
Legacy document runtime input: none
Legacy document write target: none
