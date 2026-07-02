# Project Type Checks

Analyze Gate must derive Project Type Profiles from `specs/{feature}/route.md`
and `.specify/entry-coverage-profile.yaml`. If they conflict, Analyze is
Blocking until Domain Route / Analyze Re-Gate resolves the mismatch.

When multiple project_type_profiles are present, apply every matching section.
Do not collapse a mixed project into a single backend gate.

## backend-business-service

Check:

- entry -> service -> manager/repository/mapper coverage;
- transaction boundary;
- rollback path;
- idempotency;
- compensation;
- API/RPC/MQ/Schedule contract.

Blocking examples:

- business entry has no service/manager/repository/mapper evidence and no accepted exception;
- transaction, rollback, idempotency, or compensation is required by route/spec/plan but missing from plan/tasks;
- API/RPC/MQ/Schedule contract changed without contract or verification evidence.

## admin-mixed-workflow

Check:

- controller / worker / schedule / data-console / SPI / RPC coverage;
- config lifecycle;
- approval/audit;
- import/export;
- read-only query contract;
- concurrency/rollback.

Blocking examples:

- configuration change lacks lifecycle state and rollback path;
- approval/audit behavior is required but absent from tasks or verification;
- import/export has no file/data validation, partial failure, or retry decision;
- read-only query contract is changed without pagination/filter/security evidence;
- concurrent admin operations can race without accepted mitigation.

## frontend-application

Check:

- route/page/component/store/API/popup/navigation coverage;
- state and visibility;
- backend/mock boundary;
- visual verification;
- implementation/debug/observability process products when applicable;
- native shell technical bridge handling.
- native shell technical bridge does not block unless business behavior is explicit.

Blocking examples:

- route/page/component/store/API/popup/navigation impact exists but has no task or verification path;
- state visibility or permission-controlled UI state is ambiguous;
- backend/mock boundary is unclear for implementation or testing;
- visual verification is missing for user-visible changes;
- `specs/{feature}/implementation.md`, `specs/{feature}/debug-guide.md`, or
  `specs/{feature}/observability.md` is required by feature risk but missing;
- `native_shell` is explicit business behavior but is treated as non-blocking technical bridge.

`native_shell` technical bridge does not block by default when it has no
user-visible business behavior.

## data-pipeline-etl

Check:

- trigger/input/output;
- SQL lineage;
- partition/window/checkpoint;
- replay/idempotency;
- downstream consumer;
- function/connector/sink coverage.

Blocking examples:

- trigger, input, or output contract is missing;
- SQL lineage cannot trace source to output;
- partition/window/checkpoint behavior is unspecified for stateful jobs;
- replay/idempotency is missing for rerun or recovery scenarios;
- downstream consumer contract is unknown;
- function/connector/sink entries are missing from entry coverage evidence.

## library-shared-component

Check:

- public API;
- consumer scenario;
- compatibility;
- deprecation/migration;
- test evidence.

Blocking examples:

- public API change lacks consumer scenario and compatibility notes;
- breaking change has no deprecation/migration path;
- tests do not cover public contract or representative consumers;
- route/spec/plan disagree on supported consumers.

## Output Mapping

Summarize these checks under `Project Type Profile Checks` with:

```text
Project Type Profile | Check | Status | Evidence | Blocking Item | Earliest Affected Node
```

Use `Blocking` for missing mandatory implementation readiness evidence.
Use `Warning` only for accepted shared/platform/scheduling/integration boundary
duplication or explicitly accepted non-blocking risk.
