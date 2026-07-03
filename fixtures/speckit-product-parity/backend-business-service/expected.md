# Backend Business Service — Expected Semantics

This is a **development-time fixture**, not target project runtime input.

## Project Type Profile

- Project type: `backend-business-service`
- Template: `templates/business-domain-l4/backend-business-service.md`

## Required Semantic Surface

The backend-business-service profile must cover:

- **Entry Chain**: entry → service → manager/repository/mapper coverage
- **Transaction Boundary**: explicit transaction scope
- **Rollback Path**: documented rollback or compensation path
- **Idempotency**: idempotency key or dedup strategy
- **Compensation**: compensating transaction or saga step
- **API/RPC/MQ/Schedule Contract**: stable contract surface

## Redlines

- Must not use `.specify/memory/**` as runtime input
- Must not use `.specify/workflow/**` as runtime input
- Must not use `.specify/coding_guide/**` as runtime input
- Must not recommend filename-versioned artifacts

Legacy Skill usage: none
Legacy document runtime input: none
Legacy document write target: none
