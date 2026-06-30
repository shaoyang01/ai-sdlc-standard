# gate-runner Skill Contract

## Metadata

```yaml
name: gate-runner
version: 0.1.0
category: Auditor Skill
stage: All Gates
standard_package: ai-sdlc-standard
status: proposed
input_artifacts:
  - library/{requirement_id}/manifest.md
  - current node artifact
  - previous gate artifact when applicable
output_artifacts:
  - gate result report
  - manifest.md update recommendation
required_schema:
  - templates/gate-result-template.md
required_storage:
  - ai-sdlc/phase-gates.md
  - ai-sdlc/artifact-storage.md
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
```

## Responsibilities

`gate-runner` 是通用 Gate 执行器。

它负责：

- 根据 `ai-sdlc/phase-gates.md` 检查某一阶段是否允许进入下一阶段。
- 读取 `manifest.md`、节点产物和相关 Gate 产物。
- 输出 `PASS` / `FAIL` / `PASS_WITH_RISK`。
- 检查 `PASS_WITH_RISK` 是否有风险接受说明。
- 建议更新 manifest 的 Gate Decisions、Activity Log、Blocking Issues、Re-Gate Records。

它不负责：

- 编写技术方案。
- 审阅方案内容细节以替代 `solution-reviewer`。
- 修复代码或文档。
- 修改业务知识库。
- 自动推进下一阶段。

## Input Contract

必需输入：

- `library/{requirement_id}/manifest.md`
- 当前阶段对应的节点产物。
- 对应 Gate 标准或模板。

可选输入：

- 上一个 Gate 结果。
- Change History。
- Superseded Artifacts。
- Re-Gate Records。

缺失输入处理：

- manifest 缺失时，可以建议创建，但不能认定 Gate 通过。
- 关键节点产物缺失时输出 `FAIL`。
- 旧版本已 superseded 时，不得继续用旧 Gate 结果放行。

## Output Contract

默认输出必须遵循：

```text
templates/gate-result-template.md
```

必须包含：

- Result: `PASS` / `FAIL` / `PASS_WITH_RISK`
- Can Continue: yes/no
- Reviewed Artifact
- Critical / High / Medium / Low
- Missing Information
- Required Actions
- Risk Acceptance
- Next Step

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

## Blocking Conditions

必须输出 `FAIL` 或阻塞的情况：

- 必需产物缺失。
- Gate 依赖的旧版本已被 superseded。
- Critical 存在。
- High 存在且没有风险接受。
- `PASS_WITH_RISK` 缺少 Accepted By、Reason 或 Follow-up。
- 变更后未重新 Gate。

## Gate Requirements

`gate-runner` 适用于：

- Requirement Gate
- Specification Gate
- Planning Gate
- Task Gate
- Implementation Gate
- Code Review Gate
- Test Gate
- Release Gate
- Knowledge Sync Gate

规则：

- 任何 Gate 不通过，不能进入下一阶段。
- `PASS_WITH_RISK` 必须写明风险接受。
- 变更、返工或规格遗漏必须遵守 `ai-sdlc/change-control.md` 的 Re-Gate 规则。
