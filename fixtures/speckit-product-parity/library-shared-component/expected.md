# Library Shared Component — Expected Semantics

This is a **development-time fixture**, not target project runtime input.

## Project Type Profile

- Project type: `library-shared-component`
- Template: `templates/business-domain-l4/library-shared-component.md`

## Required Semantic Surface

The library-shared-component profile must cover:

- **Public API**: exported public API surface
- **Consumer Scenario**: documented consumer scenario
- **Compatibility**: backward compatibility rules
- **Deprecation/Migration**: deprecation timeline and migration guide
- **Test Evidence**: test coverage evidence

## Redlines

- Must not use `.specify/memory/**` as runtime input
- Must not use `.specify/workflow/**` as runtime input
- Must not use `.specify/coding_guide/**` as runtime input
- Must not recommend filename-versioned artifacts

Legacy Skill usage: none
Legacy document runtime input: none
Legacy document write target: none
