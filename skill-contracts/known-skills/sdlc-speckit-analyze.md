# sdlc-speckit-analyze Skill Contract

## Metadata

```yaml
name: sdlc-speckit-analyze
version: 0.1.0
category: Auditor Skill
stage: Speckit Analyze / Implementation Readiness Gate
standard_package: ai-sdlc-standard
status: active
input_artifacts:
  - specs/{feature}/route.md
  - specs/{feature}/spec.md
  - specs/{feature}/plan.md
  - specs/{feature}/tasks.md
  - .specify/entry-coverage-profile.yaml
  - .specify/reports/entry_coverage/entry_coverage_report.md
  - .specify/reports/entry_coverage/entry_inventory.tsv
  - .specify/reports/entry_coverage/service_inventory.tsv
  - .specify/reports/entry_coverage/cross_domain_conflicts.md
  - .specify/reports/entry_coverage/unarchived_entries.md
  - .specify/reports/entry_coverage/unarchived_services.md
  - task gate result from sdlc-speckit-tasks
  - library/{requirement_id}/01-技术方案/*
  - library/{requirement_id}/02-方案审核/*
  - optional library/{requirement_id}/manifest.md
output_artifacts:
  - analyze consistency report
  - implementation readiness recommendation
  - manifest.md Activity Log or Re-Gate update recommendation
required_schema:
  - ess/specification-schema.md
required_checklist:
  - checklists/specification-checklist.md
  - checklists/plan-checklist.md
  - checklists/task-checklist.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/artifact-versioning.md
  - ai-sdlc/change-control.md
side_effects:
  - produce consistency report
  - recommend manifest.md Activity Log or Re-Gate updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - missing .specify/entry-coverage-profile.yaml
  - only .specify/entry-coverage-profile.candidate.yaml exists without confirmation
  - entry coverage TSV reports missing or unparseable
  - unarchived business_entry or core business unit
  - reverse_coverage_status=no_entry_reverse_coverage
  - unaccepted cross-domain conflict
  - spec, plan, tasks, or DocFlow artifacts conflict
  - required artifact is missing or stale
  - task requires undefined business or technical behavior
  - implementation readiness cannot be established
```

## Standard Path Resolution

本合同中 `required_schema`、`required_checklist`、`required_storage`、`skill_path` 与 `references` 里的共享标准路径，均相对 `AI_SDLC_STANDARD_HOME` 解析。

执行 Skill 前必须先读取 `${AI_SDLC_STANDARD_HOME}/ai-sdlc/standard-package-resolution.md`，确认标准包根目录有效。目标项目不需要、也不应该复制共享 `ai-sdlc/**`、`ess/**`、`checklists/**`、`templates/**` 或 `skill-contracts/**` 文件。

## Responsibilities

`sdlc-speckit-analyze` 是 Speckit Analyze 阶段的标准 Skill。

它负责：

- 读取当前有效的 DocFlow、spec、plan、tasks 和 Gate 结果。
- 读取 `specs/{feature}/route.md`、Project Type Profiles、entry coverage profile 和 reports。
- 审计 `01-技术方案`、`02-方案审核`、`specs/{feature}/spec.md`、`specs/{feature}/plan.md`、`specs/{feature}/tasks.md` 是否一致。
- 基于 `entry_inventory.tsv` 和 `service_inventory.tsv` 的字段解析执行 Entry Coverage Gate。
- 基于 project_type_profiles 执行差异化实现前 Gate。
- 判断实现前是否存在未解决的范围、计划、任务、风险、验证或回滚缺口。
- 输出 Analyze Gate 结论和下一步建议。
- 将阻塞项路由到最早受影响节点。

它不负责：

- 从零理解需求。
- 编写或修改 `01-技术方案`。
- 审阅方案完整性以替代 `sdlc-solution-reviewer`。
- 生成或修改 `specs/{feature}/spec.md`、`plan.md`、`tasks.md`。
- 修改业务代码。
- 回写 `.specify/business_domain/**`。

## Input Contract

必需输入：

- `specs/{feature}/route.md`
- `specs/{feature}/spec.md`
- `specs/{feature}/plan.md`
- `specs/{feature}/tasks.md`
- `.specify/entry-coverage-profile.yaml`
- `.specify/reports/entry_coverage/entry_coverage_report.md`
- `.specify/reports/entry_coverage/entry_inventory.tsv`
- `.specify/reports/entry_coverage/service_inventory.tsv`
- `.specify/reports/entry_coverage/cross_domain_conflicts.md`
- `.specify/reports/entry_coverage/unarchived_entries.md`
- `.specify/reports/entry_coverage/unarchived_services.md`
- `sdlc-speckit-tasks` 的无阻塞 Task Gate 结论。
- `library/{requirement_id}/01-技术方案/*`
- `library/{requirement_id}/02-方案审核/*`

建议输入：

- `library/{requirement_id}/manifest.md`
- 已接受风险记录。
- Re-Gate Records。
- Replaced Artifact Paths。
- `sdlc-speckit-plan` 的 Plan Gate 结论。
- `sdlc-speckit-clarify` 的残余澄清结论。
- `specs/{feature}/implementation.md`
- `specs/{feature}/workflow-status.md`
- `specs/{feature}/debug-guide.md`
- `specs/{feature}/observability.md`

前置条件：

- `sdlc-speckit-tasks` 不存在 Blocking Items。
- `specs/{feature}/route.md` 已存在且 Project Type Profiles 与 entry coverage profile 一致。
- `specs/{feature}/spec.md`、`specs/{feature}/plan.md`、`specs/{feature}/tasks.md` 均为当前有效版本。
- `.specify/entry-coverage-profile.yaml` 已存在；缺失时 Analyze Gate 必须 `FAIL` / `BLOCKED`。
- 不允许因为缺 profile 而跳过 entry coverage audit。
- 如果只有 `.specify/entry-coverage-profile.candidate.yaml`，Analyze Gate 必须 `PENDING_CONFIRMATION` 或 `FAIL`，并要求人工确认 candidate。
- Required Action 必须指向 `scripts/bootstrap-entry-coverage-profile.sh` 或 full bootstrap。
- Entry coverage reports 必须存在，且必须解析 TSV 字段，不得 grep 整个 markdown 判断 blocker。
- `entry_inventory.tsv` 必须按字段读取 `classification`、`classification_reason`、`match_strength`、`match_reason`、`requirement_scope`。
- `service_inventory.tsv` 必须按字段读取 `reverse_coverage_status`。
- `02-方案审核`、Plan Gate、Task Gate 均为 `PASS` 或有效 `PASS_WITH_RISK`。
- Development Path Decision 为 `SPECKIT_PIPELINE_REQUIRED`，或用户明确要求完整 SDD。

缺失输入处理：

- 缺少 `specs/{feature}/spec.md` 时停止并回到 `sdlc-speckit-specify`。
- 缺少 `specs/{feature}/route.md` 时停止并回到 Domain Route / Pipeline Re-Gate。
- 缺少 `specs/{feature}/plan.md` 时停止并回到 `sdlc-speckit-plan`。
- 缺少 `specs/{feature}/tasks.md` 时停止并回到 `sdlc-speckit-tasks`。
- 缺少 `.specify/entry-coverage-profile.yaml` 时停止，Required Action 指向 `scripts/bootstrap-entry-coverage-profile.sh` 或 full bootstrap。
- 缺少技术方案或方案审核时停止。
- manifest 缺失时可以继续审计，但必须建议创建或更新 Activity Log。

## Output Contract

### Artifact Versioning Contract

Any DocFlow requirement artifact produced or updated by this skill must follow
`ai-sdlc/artifact-versioning.md`:

- use the stable path recorded in manifest, not a filename-versioned path;
- include Metadata `Version` and `Status`;
- include `## 修订记录`;
- keep the body to current effective content only;
- recommend manifest updates with stable path, internal version, and status;
- include `Reviewed Artifact` and `Reviewed Artifact Version` for Gate,
  review, sync, and reconcile artifacts, plus `Gate Artifact Version` when
  the artifact is itself a Gate result.

输出必须覆盖：

- Source Artifacts。
- Project Type Profile Checks。
- Entry Coverage Gate。
- Parsed Entry Inventory Summary。
- Parsed Service Inventory Summary。
- Shared-Domain Duplication Decision。
- Consistency Matrix。
- Analyze Gate Result。
- Blocking Items。
- Deferred Non-Blocking Items。
- Earliest Affected Node。
- Re-Gate Recommendation。
- Manifest Update Recommendation。
- Next Step。

允许的 Gate 结果：

- `PASS`
- `FAIL`
- `PASS_WITH_RISK`

`PASS_WITH_RISK` 只允许用于已明确接受、不会导致实现阶段猜测的风险。

## Side Effects

允许：

- 输出一致性审计报告。
- 建议更新 manifest Activity Log。
- 建议创建 Re-Gate Records。

禁止：

- 修改业务代码。
- 修改 `specs/{feature}/spec.md`。
- 修改 `specs/{feature}/plan.md`。
- 修改 `specs/{feature}/tasks.md`。
- 修改 `.specify/business_domain/**`。
- 修改 `01-技术方案` 或 `02-方案审核`。
- 用 Analyze 结论补造未定义业务规则或技术行为。

## Blocking Conditions

必须停止的情况：

- `sdlc-speckit-tasks` 仍有 Blocking Items。
- 当前有效 DocFlow、spec、plan 或 tasks 冲突。
- 任何必需产物缺失或已被 stale。
- Tasks 要求实现 spec 或 plan 以外的行为。
- Plan 中影响实现的事项没有任务覆盖。
- 验收标准没有验证路径。
- 风险接受缺失、过期或被后续产物否定。
- 实现将需要猜测业务规则或技术决策。
- 缺少 `.specify/entry-coverage-profile.yaml`。
- 只有 `.specify/entry-coverage-profile.candidate.yaml` 且未人工确认。
- `entry_inventory.tsv` 中 `classification=business_entry` 且未归档。
- `service_inventory.tsv` 中 core business unit 未归档。
- `reverse_coverage_status=no_entry_reverse_coverage`。
- 未被 route.md 或 profile 接受的 cross-domain conflict。
- business_domain L4 missing。

不单独阻断的 classification：

- `technical_bridge`
- `framework_bridge`
- `generated_or_vendor`
- `native_shell`
- `abstract_or_base`
- `annotation_or_marker`
- `not_applicable`

`native_shell` 只有在 route/profile/code evidence 表明它承载显式业务行为时才阻断。

shared/platform/scheduling/integration L2 重复命中只有在 `specs/{feature}/route.md`
或 `.specify/entry-coverage-profile.yaml` 明确 accepted shared boundary 时才能降级为 warning。

## Project Type Gate Requirements

`sdlc-speckit-analyze` 必须按 project_type_profiles 触发差异化 Gate：

- `backend-business-service`: entry -> service -> manager/repository/mapper coverage、transaction boundary、rollback path、transaction / rollback / idempotency / compensation、API/RPC/MQ/Schedule contract。
- `admin-mixed-workflow`: controller / worker / schedule / data-console / SPI / RPC、config lifecycle、approval/audit、import/export、read-only query contract、concurrency/rollback。
- `frontend-application`: route/page/component/store/API/popup/navigation、state and visibility、backend/mock boundary、visual verification、implementation/debug/observability process products when applicable、native shell technical bridge does not block unless business behavior is explicit。
- `data-pipeline-etl`: trigger/input/output、SQL lineage、partition/window/checkpoint、replay/idempotency、downstream consumer、function/connector/sink coverage。
- `library-shared-component`: public API、consumer scenario、compatibility、deprecation/migration、test evidence。

## Gate Requirements

前置 Gate：

- `sdlc-solution-reviewer` 已通过。
- `sdlc-speckit-specify` 已生成或同步 `specs/{feature}/spec.md`。
- `sdlc-speckit-clarify` 已校验无核心未决问题。
- `sdlc-speckit-plan` 已通过 Plan Gate。
- `sdlc-speckit-tasks` 已通过 Task Gate。

后置 Gate：

- Analyze 必须无 Blocking Items。
- `PASS` 或有效 `PASS_WITH_RISK` 后，可进入 `sdlc-speckit-implement`。
- 存在核心缺口时，必须回到最早受影响节点，并在 manifest Re-Gate Records 中记录。
