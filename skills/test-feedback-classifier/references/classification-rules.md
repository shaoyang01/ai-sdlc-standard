# Classification Rules

## Primary Classifications

| Classification | Use When | Required Action |
| --- | --- | --- |
| Implementation Bug | Approved behavior exists, but implementation does not follow it. | Fix code, update `03-实现记录`, rerun verification, and decide whether Code Review must rerun. |
| Specification Missing | Test exposes behavior that should be defined but is absent from `01-技术方案`. | Return to `01-技术方案`, create a new version, and rerun `solution-reviewer`. |
| Review Missing | Code or plan issue should have been caught by review but was not. | Record review gap and recommend Checklist update through `test-feedback-sync`. |
| Requirement Change | Feedback changes business goal, scope, rule, or acceptance criteria. | Apply `ai-sdlc/change-control.md` and decide same requirement vs new requirement. |
| Test Case Issue | Test expectation, data setup, or assertion contradicts approved behavior. | Fix test case or acceptance wording; do not require code or specification changes. |
| Environment / Data Issue | Failure is caused by environment, permissions, configuration, missing data, or unstable dependency. | Record blocker and release impact; rerun after environment/data fix. |

## Decision Hints

Use Implementation Bug when:

- The approved specification clearly defines expected behavior.
- The implementation record says the behavior was implemented.
- The observed behavior differs from both specification and implementation intent.

Use Specification Missing when:

- The expected behavior is reasonable for the requirement but not defined.
- Failure strategy, compatibility, state, data source, or boundary behavior is absent.
- Implementing the fix would require adding a new business rule.

Use Requirement Change when:

- The tester or business owner changes expected behavior after implementation.
- The new expectation expands scope or changes acceptance criteria.
- The feedback can be independently scheduled or accepted.

Use Test Case Issue when:

- The test asserts behavior outside the approved specification.
- Test data does not match the scenario.
- The acceptance wording is outdated or incorrectly interpreted.

Use Environment / Data Issue when:

- The same code path cannot be validated because environment is broken.
- Required data, permission, config, dependency, or external service is unavailable.
- The failure cannot be reproduced outside the environment condition.

## Earliest Affected Node

Map classification to the earliest affected node:

| Classification | Earliest Affected Node |
| --- | --- |
| Requirement Change | `00-需求资料` or `01-技术方案` |
| Specification Missing | `01-技术方案` |
| Review Missing | `04-代码审核` and follow-up checklist sync |
| Implementation Bug | `03-实现记录` and code fix |
| Test Case Issue | `05-测试验收` |
| Environment / Data Issue | `05-测试验收` |

When uncertain, do not guess. Mark `无法分类` and request the missing evidence.
