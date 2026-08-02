# Risk And Re-Gate Rules

## PASS_WITH_RISK

`PASS_WITH_RISK` is valid only when all fields exist:

- Accepted Risk
- Accepted By
- Accepted At
- Accepted Reason
- Accepted Scope
- Follow-up Required
- Follow-up Owner

If any field is missing, downgrade the Gate check result to `FAIL`.

Do not infer acceptance from casual language such as "先这样", "问题不大", or "后面再看" unless the user explicitly accepts the risk and the manifest records who accepted it.

## Risk Severity

Use `PASS_WITH_RISK` only for accepted High issues.

Do not allow `PASS_WITH_RISK` for Critical issues.

Medium and Low issues do not require risk acceptance, but must be recorded as TODO or follow-up notes.

## Must-Fail Items (No Risk Acceptance Bypass)

以下情况不能被风险接受绕过，必须 `FAIL`：

- 缺少 always-required external evidence。
- stale required external evidence。
- required Sync execution 未完成。
- required Reconcile execution 未完成。
- required Entry Coverage 未通过。
- required Re-Gate 未通过。
- Critical blocking item。
- authorized persistence failure。
- read-back verification failure。
- formal completion source 无法在阶段 B 建立。

“缺少正式 persisted completion source” 的精确语义必须限定为：

- response-only 无法正式完成；或
- 用户未授权持久化；或
- 已授权但写入/回读失败；或
- 回读后仍无法建立 current completion source。

首次正式运行时 stable artifact 尚不存在，不属于风险不可接受的外部证据失败；只要用户已授权持久化，且写入与回读验证成功，本次调用即可建立 completion source 并形成正式结果。首次运行开始时文件尚不存在不是 must-fail item；授权持久化后仍无法写入或回读验证才是 must-fail item。

## PASS_WITH_RISK Boundaries

`PASS_WITH_RISK`：

- 只适用于有完整接受记录的 eligible High risk。
- 不适用于 Critical。
- 不得豁免 evidence。
- 不得豁免 persistence。
- 不得豁免 Re-Gate。
- 不得豁免 required conditional execution。

## Tail Stale Triggers

以下变化必须使依赖结论 stale，并从最早节点 Re-Gate：

- Development Path Decision。
- Decision Scope。
- Tail Scope。
- implementation files。
- 03/04/05 Version。
- Sync decision/result。
- Reconcile decision/result。
- Entry Coverage。
- Manifest Tail status。
- completion source。

## Stale Artifact Checks

Read `Replaced Artifact Paths` before accepting a Gate result.

Block continuation when:

- Artifact Index points to a stale or replaced artifact.
- Gate Decisions refer to a stale or replaced artifact.
- The newest artifact has no corresponding required Gate.
- The user wants to continue based on an older passed Gate after a newer version exists.

Allow continuation when:

- Stale entries only describe older versions.
- Artifact Index points to the new effective artifact.
- Required Re-Gate result exists and passes.

## Re-Gate Triggers

Require Re-Gate when Change History contains open or unresolved entries affecting:

- Requirement goal, scope, or success criteria
- Behavior constraints
- Failure, timeout, exception, retry, idempotency, or transaction behavior
- Data source, DB, cache, MQ, API, or state transition
- Development path decision
- Implementation scope
- Test feedback classified as Specification Missing

## Re-Gate Evidence

A valid Re-Gate record must include:

- Date
- Trigger
- From Node
- Required Gate
- Gate Artifact
- Result
- Next Step

The result must be `PASS` or valid `PASS_WITH_RISK` to continue.

## Change Classifications

Treat these classifications as potentially blocking:

- Requirement Change
- Specification Missing
- Review Missing
- Implementation Bug

Treat these as non-blocking only when the manifest says they are resolved or not release-blocking:

- Test Case Issue
- Environment / Data Issue
- Documentation Correction

## Next Step Rules

Use:

- `Return to sdlc-requirement-normalizer` when the goal or scope changed.
- `Return to sdlc-specification-writer` when the technical specification is missing or outdated.
- `Run sdlc-solution-reviewer` when specification content changed and needs a new Specification Gate.
- `Continue to direct implementation` only when the Development Path Decision is `DIRECT_IMPLEMENTATION` and the Gate passes.
- `Run sdlc-speckit-pipeline` when the Development Path Decision is `SPECKIT_PIPELINE_REQUIRED`.
- `Resolve blocking issues` when any Critical or unaccepted High remains.
