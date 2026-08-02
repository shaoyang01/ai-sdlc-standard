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
| Development Path Entry Gate | Implementation path | Specification Gate, Development Path Decision, Decision Scope, Complexity, decision source/artifact, Tail required/scope/status | missing/stale/invalid decision, BLOCKED_NEEDS_REVISION, BLOCKED_UNKNOWN, wrong route, missing Re-Gate |
| Shared Documentation Governance Tail Completion Gate | Tail completed | Evidence inputs: Manifest Tail, 03/04/05 when actual implementation, Sync decision, Reconcile decision, required conditional execution, applicable Entry Coverage, required Re-Gate, risk acceptance, non-stale upstream evidence. Gate output confirmation: persisted Gate artifact written, read back, and verified; completion source establishment | response-only formal completion, persistence not authorized, write failure, read-back failure, invalid persisted binding, unresolved external evidence failure |

## Severity Mapping

### Critical

Use Critical when:

- Required artifact is missing.
- Gate result is missing for a required Gate.
- Existing Gate result is `FAIL`.
- Current evidence references a stale or replaced artifact.
- Re-Gate is required but missing.
- Continuing would rely on guessed business behavior.
- Missing always-required Tail evidence.
- Required Tail evidence is stale.
- Formal completion source cannot be established after authorized persistence and read-back.
- Required conditional execution is incomplete.
- Invalid Development Path route when implementation entry is requested.

### High

Use High when:

- `PASS_WITH_RISK` lacks any required risk acceptance field.
- Development Path Decision is missing before implementation.
- Required manifest section is missing and hides Gate evidence.
- Artifact version in manifest differs from the reviewed artifact.
- Blocking Issues contain unresolved items.
- Current Development Path Decision is missing but implementation entry is not yet requested.
- Unresolved High blocking item.
- Non-Critical risk that is eligible for complete risk acceptance.

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

Medium and Low are allowed only for optional metadata or formatting issues that do not hide required Gate evidence.

## Development Path Checks

Before implementation, verify Development Path Decision:

- Complexity must be present and must be `SIMPLE`, `MEDIUM`, `COMPLEX`, or `BLOCKED_UNKNOWN`.
- `DIRECT_IMPLEMENTATION` can continue only when Specification Gate is `PASS` or valid `PASS_WITH_RISK`.
- `SPECKIT_PIPELINE_REQUIRED` should route to `sdlc-speckit-pipeline`, not direct implementation.
- `BLOCKED_NEEDS_REVISION` must not continue to implementation.
- `undecided` blocks implementation unless the user explicitly asks only for planning or draft work.
- `BLOCKED_UNKNOWN` blocks implementation and requires solution revision.

## Tail Completion Checks

Before marking the Tail completed, verify the Shared Documentation Governance Tail Completion Gate. Distinguish evidence inputs from Gate output confirmation:

- Evidence inputs: Manifest Tail section is the authority for Tail required, scope, and status; `03-实现记录`, `04-代码审核`, and `05-测试验收` are required when there is actual code, configuration, or behavior implementation; business_domain_sync decision and Reconcile decision are current with decision and execution result separated; required conditional execution is complete; Entry Coverage applies only when applicable (`PENDING`, `FAILED`, or `BLOCKED` blocks completion); required Re-Gate has passed; risk acceptance is complete; upstream evidence is not stale.
- Gate output confirmation: the persisted Gate artifact is written, read back, and verified; completion source establishment happens only after read-back verification. First-run absence of the stable artifact is not an external evidence failure; the first formal run can create and confirm its own Gate artifact.
- Blocking: response-only formal completion, persistence not authorized, write failure, read-back failure, invalid persisted binding, and unresolved external evidence failure.

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
| Development Path Entry Gate | `02-方案审核/` |
| Tail Completion Gate | `05-测试验收/` |

When the node cannot be determined, return the report in the response and recommend a path instead of writing a file.
