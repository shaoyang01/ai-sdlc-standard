# Admin Mixed Workflow — Expected Semantics

This is a **development-time fixture**, not target project runtime input.

## Project Type Profile

- Project type: `admin-mixed-workflow`
- Template: `templates/business-domain-l4/admin-mixed-workflow.md`

## Required Semantic Surface

The admin-mixed-workflow profile must cover:

- **Entry Types**: controller / worker / schedule / data-console / SPI / RPC
- **Configuration Lifecycle**: how config is created, updated, audited
- **Approval/Audit**: approval flow and audit trail
- **Import/Export**: data import and export contracts
- **Read-Only Query Contract**: query surface contract
- **Concurrency/Rollback**: concurrent operation and rollback handling

## Redlines

- Must not use `.specify/memory/**` as runtime input
- Must not use `.specify/workflow/**` as runtime input
- Must not use `.specify/coding_guide/**` as runtime input
- Must not recommend filename-versioned artifacts

Legacy Skill usage: none
Legacy document runtime input: none
Legacy document write target: none
