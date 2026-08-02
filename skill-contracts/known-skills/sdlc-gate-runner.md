# sdlc-gate-runner Skill Contract

## Metadata

```yaml
name: sdlc-gate-runner
version: 0.1.0
category: Auditor Skill
stage: All Gates
standard_package: ai-sdlc-standard
status: active
input_artifacts:
  - library/{requirement_id}/manifest.md
  - current node artifact
  - previous gate artifact when applicable
  - existing Tail Completion Gate artifact when present (optional)
  - Development Path Decision artifact
  - 03-实现记录
  - 04-代码审核
  - 05-测试验收
  - Sync decision artifact
  - Reconcile decision artifact
  - Entry Coverage artifact
  - Re-Gate artifact
output_artifacts:
  - gate result report
  - manifest.md update recommendation
required_schema:
  - templates/gate-result-template.md
  - templates/artifact-manifest-template.md
required_storage:
  - ai-sdlc/development-path-governance.md
  - ai-sdlc/phase-gates.md
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/artifact-versioning.md
  - ai-sdlc/change-control.md
side_effects:
  - write gate result report when explicitly requested
  - recommend manifest.md updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - manifest is missing or unreadable
  - required artifact is missing
  - gate result cannot be determined
  - PASS_WITH_RISK lacks risk acceptance
  - missing or stale Development Path evidence
  - invalid route
  - missing Tail section
  - actual implementation lacks 03/04/05
  - missing or blocked Sync decision
  - missing or blocked Reconcile decision
  - incomplete required conditional execution
  - required Entry Coverage pending, failed, or blocked
  - required Re-Gate missing
  - response-only cannot formally complete
  - persistence not authorized for formal completion
  - authorized persistence failed
  - persisted artifact read-back failed
  - persisted artifact binding invalid
  - formal completion source cannot be established after persistence
  - unresolved blocking item
```

## Responsibilities

`sdlc-gate-runner` 是通用 Gate 执行器，同时是 Development Path Entry Gate 与 Shared Documentation Governance Tail Completion Gate 的 owner。

它负责：

- 根据 `ai-sdlc/phase-gates.md` 检查某一阶段是否允许进入下一阶段（generic Gate）。
- 执行 Development Path Entry enforcement：检查 `development_path_entry` Gate 的决策、路由与证据。
- 执行 Tail Completion enforcement：检查 `documentation_governance_tail_completion` Gate 的 Tail 证据、conditional execution 与 completion 边界。
- 执行 provisional evidence evaluation（阶段 A）：评估外部 Tail evidence，不把本次将生成的 report 当作预先输入。
- 在用户明确授权时执行 persistence（阶段 B）：写入 Gate report。
- 写入后执行 read-back verification：回读并验证结构与绑定。
- 在 read-back 验证通过后执行 formal result establishment：建立 formal result 与 completion_decision_source。
- 执行 persisted completion-source verification：formal Tail completion 依赖当前、non-stale 的 persisted Gate artifact；该 artifact 可以在首次正式调用中由本次写入并回读验证后建立。
- 读取 `manifest.md`、节点产物和相关 Gate 产物。
- 输出 `PASS` / `FAIL` / `PASS_WITH_RISK`。
- 检查 `PASS_WITH_RISK` 是否有风险接受说明。
- 建议更新 manifest 的 Gate Decisions、Activity Log、Blocking Issues、Re-Gate Records。

它不负责：

- 编写技术方案。
- 审阅方案内容细节以替代 `sdlc-solution-reviewer`。
- 生成 `03-实现记录` 或执行代码审核。
- 生成 `04-代码审核`。
- 执行测试或反馈分类，生成 `05-测试验收`。
- 执行 Sync、Reconcile 或 Entry Coverage。
- 修改生产代码或知识材料。
- 代替专业 Skill 作专业 decision。
- 自动接受风险。
- 静默修改 Manifest。
- 自动进入下一阶段。

## Input Contract

必需输入：

- `library/{requirement_id}/manifest.md`
- 当前阶段对应的节点产物。
- 对应 Gate 标准或模板。
- 进入实现检查时：Development Path Decision artifact。
- Tail Completion 检查时：外部 Tail evidence（canonical Documentation Governance Tail section、`03-实现记录`、`04-代码审核`、`05-测试验收`、Sync/Reconcile decisions、conditional execution、Entry Coverage、Re-Gate、risk acceptance、non-stale upstream evidence）。

可选输入：

- 上一个 Gate 结果。
- existing Gate artifact（Tail Completion 稳定路径已存在时读取当前内部 Version；首次正式运行时允许不存在）。
- Change History。
- Replaced Artifact Paths。
- Re-Gate Records。
- `03-实现记录`、`04-代码审核`、`05-测试验收`。
- Sync decision artifact。
- Reconcile decision artifact。
- Entry Coverage artifact。
- 风险接受记录。

运行产物：本次 Gate report。不得把“本次将生成的 Gate report”列为首次调用前的必需输入。

缺失输入处理：

- manifest 缺失时，可以建议创建，但不能认定 Gate 通过。
- 关键节点产物缺失时输出 `FAIL`。
- 旧版本已 stale 时，不得继续用旧 Gate 结果放行。
- `BLOCKED_NEEDS_REVISION` 或 `BLOCKED_UNKNOWN` 不得进入实现或 Tail。
- actual implementation 缺少 `03-实现记录`、`04-代码审核`、`05-测试验收` 时输出 `FAIL`。
- response-only 无法正式完成时输出 `FAIL`（canonical Result=FAIL、Can Continue=no、Tail Completion Eligible=no）。
- 用户未授权持久化时无法正式完成。
- 已授权但写入失败、read-back 失败、persisted binding 无效，或回读后仍无法建立 completion source 时输出 `FAIL`。
- 首次正式运行时 artifact 尚不存在不属于缺失输入；首次调用可以在授权持久化后创建并回读验证自己的 Gate artifact。

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

默认输出必须遵循：

```text
templates/gate-result-template.md
```

`templates/gate-result-template.md` 是唯一 canonical output structure；本 Skill 不得在 references 中维护第二份完整 canonical template。

必须包含：

- Result: `PASS` / `FAIL` / `PASS_WITH_RISK`
- Can Continue: yes/no
- Reviewed Artifact
- Critical / High / Medium / Low
- Missing Information
- Required Actions
- Risk Acceptance
- Next Step

Gate Type 为 `development_path_entry` 时必须填写 `## Development Path Check`；Gate Type 为 `documentation_governance_tail_completion` 时必须填写 `## Documentation Governance Tail Evidence Check` 和 `## Tail Completion Decision`；其他 Gate 可将特殊区段标记为 `not_applicable`，但不得删除 canonical template 字段。

建议更新：

- manifest Gate Decisions
- Activity Log
- Blocking Issues
- Missing Artifacts
- Re-Gate Records
- Next Step

## Side Effects

允许：

- 写 Gate Result 报告。
- 建议更新 manifest。

禁止：

- 修改业务代码。
- 修改被审阅产物内容。
- 修改 `.specify/business_domain/**`。
- 自动接受风险。
- 自动进入下一阶段。
- 生成实现记录、代码审核或测试验收。
- 执行 Sync、Reconcile 或 Entry Coverage。

## Blocking Conditions

必须输出 `FAIL` 或阻塞的情况：

- 必需产物缺失。
- Gate 依赖的旧版本已被 stale。
- Critical 存在。
- High 存在且没有风险接受。
- `PASS_WITH_RISK` 缺少 Accepted Risk、Accepted By、Accepted At、Accepted Reason、Accepted Scope、Follow-up Required 或 Follow-up Owner。
- 变更后未重新 Gate。
- Development Path evidence 缺失、stale、invalid 或无法证明 current。
- 请求进入实现但路径为 `BLOCKED_NEEDS_REVISION` 或 `BLOCKED_UNKNOWN`，或路由错误。
- canonical Documentation Governance Tail section 缺失。
- actual implementation 缺少 `03-实现记录`、`04-代码审核`、`05-测试验收`。
- Sync decision 或 Reconcile decision 缺失、blocked 或 stale。
- required conditional execution 未完成。
- required Entry Coverage 为 pending、failed 或 blocked。
- required Re-Gate 缺失或未通过。
- response-only 无法正式完成。
- 用户未授权持久化（formal completion）。
- 已授权但 persistence 失败。
- persisted artifact read-back 失败。
- persisted artifact binding 无效。
- persistence 后仍无法建立 formal completion source。
- 存在未解决 blocking item。

## Gate Requirements

`sdlc-gate-runner` 适用于：

- Requirement Gate
- Specification Gate
- Planning Gate
- Task Gate
- Implementation Gate
- Code Review Gate
- Test Gate
- Knowledge Sync Gate
- Development Path Entry Gate（`development_path_entry`）
- Shared Documentation Governance Tail Completion Gate（`documentation_governance_tail_completion`）

规则：

- 任何 Gate 不通过，不能进入下一阶段。
- `PASS_WITH_RISK` 必须写明风险接受。
- 变更、返工或规格遗漏必须遵守 `ai-sdlc/change-control.md` 的 Re-Gate 规则。
- 两个特殊 Gate Type 遵循 `ai-sdlc/development-path-governance.md`；Manifest 是 Tail 状态权威。
- formal Tail completion 需要当前、non-stale 的 persisted Gate artifact；该 artifact 可以由首次正式调用在授权持久化后写入并回读验证建立，不要求调用开始前已存在。
