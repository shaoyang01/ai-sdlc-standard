# Gate Matrix

## Gate Types

| Gate | Checks Entry Into | Required Evidence | Blocking Result |
| --- | --- | --- | --- |
| Requirement Gate | Specification writing | `00-需求资料` or user-confirmed requirement source | Missing business goal, unresolved core scope, blocking source conflict |
| Specification Gate | Development path routing or implementation planning | `01-技术方案` and `02-方案审核` | Missing specification, `sdlc-solution-reviewer` FAIL, missing risk acceptance |
| Planning Gate | Task breakdown or implementation | Plan artifact or Speckit `plan.md` | Plan changes approved specification, missing rollback or failure strategy |
| Task Gate | Implementation | Task artifact or Speckit `tasks.md` | Tasks not traceable to specification or plan, missing verification tasks |
| Implementation Gate | Code review or test | `03-实现记录`, diff summary, verification result | Out-of-scope implementation, missing verification, undefined behavior discovered |
| Code Review Gate | Test | `04-代码审核` | Review FAIL, blocking issue not resolved, risk acceptance incomplete |
| Test Gate | Knowledge sync or follow-up summary | `05-测试验收` | Test FAIL, Specification Missing without upstream Re-Gate |
| Knowledge Sync Gate | Speckit Sync or knowledge update | Sync decision and source artifacts | Syncing stale or failed artifacts, missing residual risk note |

## Severity Mapping

### Critical

Use Critical when:

- Required artifact is missing.
- Gate result is missing for a required Gate.
- Existing Gate result is `FAIL`.
- Current evidence references a stale or replaced artifact.
- Re-Gate is required but missing.
- Continuing would rely on guessed business behavior.

### High

Use High when:

- `PASS_WITH_RISK` lacks any required risk acceptance field.
- Development Path Decision is missing before implementation.
- Required manifest section is missing and hides Gate evidence.
- Artifact version in manifest differs from the reviewed artifact.
- Blocking Issues contain unresolved items.

### Medium

Use Medium when:

- Activity Log is incomplete but Gate evidence is still clear.
- Manifest has stale timestamps.
- Optional artifact metadata is missing.
- Non-blocking TODO items are not assigned.

### Low

Use Low when:

- Formatting is inconsistent.
- Naming could be clearer.
- Notes are duplicated.
- Non-blocking manifest wording needs cleanup.

## Development Path Checks

Before implementation, verify Development Path Decision:

- Complexity must be present and must be `SIMPLE`, `MEDIUM`, `COMPLEX`, or `BLOCKED_UNKNOWN`.
- `DIRECT_IMPLEMENTATION` can continue only when Specification Gate is `PASS` or valid `PASS_WITH_RISK`.
- `SPECKIT_PIPELINE_REQUIRED` should route to `sdlc-speckit-pipeline`, not direct implementation.
- `BLOCKED_NEEDS_REVISION` must not continue to implementation.
- `undecided` blocks implementation unless the user explicitly asks only for planning or draft work.
- `BLOCKED_UNKNOWN` blocks implementation and requires solution revision.

## Node Directory Mapping

Use these directories when writing a Gate report:

| Gate | Recommended Node Directory |
| --- | --- |
| Requirement Gate | `00-需求资料/` |
| Specification Gate | `02-方案审核/` |
| Planning Gate | `01-技术方案/` or Speckit plan location |
| Task Gate | `01-技术方案/` or Speckit tasks location |
| Implementation Gate | `03-实现记录/` |
| Code Review Gate | `04-代码审核/` |
| Test Gate | `05-测试验收/` |
| Knowledge Sync Gate | `05-测试验收/` |

When the node cannot be determined, return the report in the response and recommend a path instead of writing a file.
