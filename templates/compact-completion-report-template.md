# Compact Completion Report Template

> 预算：`target_lines: 30-80`，`minimum_lines: 20`，`hard_limit_lines: 120`。
> 只覆盖紧凑的实施事实、文件、验证、Git、PR、CI 状态、剩余问题和停止标记。
> 不要求、不容纳：完整执行 Prompt、完整 stdout/stderr、完整 CI 日志、完整
> diff 或全部历史 findings。
> 报告接收方、名称、最大行数和停止条件来自 Capsule `completion_report`
> 字段（合同：`ai-sdlc/compact-prompt-standard.md` 第 7 节）。

```yaml
result: <SUCCESS|FAILURE|BLOCKED>
pre_HEAD: <40-char-lowercase-hex-sha>
post_HEAD: <40-char-lowercase-hex-sha>
commit: <40-char-lowercase-hex-sha|none>
changed_files:
  - <repository-relative-path>
change_summary: <change-summary>
local_validation: <per-command-pass-fail>
remote_branch_HEAD: <40-char-lowercase-hex-sha|none>
pull_request: <pr-number-and-url|none>
CI_status: <not_waited|passed|failed>
scope_violation: <false|blocking-detail>
remaining_findings: <none|list>
```

要求：

- `changed_files` 列出全部实际修改文件；
- `change_summary` 给出变更摘要；
- `local_validation` 逐项给出 PASS/FAIL；
- `pull_request` 给出编号和 URL，未涉及 PR 时为 `none`；
- `CI_status` 未等待时记录为 `not_waited`；
- `scope_violation` 明确为 `false`，或报告具体阻塞；
- 不附带完整 diff、完整日志或下一阶段计划。

PRODUCE 专用 machine-result 表面（PCE_01_BOUNDED_EXACT_RESULT_HANDOFF_G02_
ROLE_OUTPUT_BINDING）：仅当 Capsule 声明 `result_handoff.role: PRODUCE`
时，报告必须额外输出独立的结构化 `produced_result` 块（不是上述 metadata
字段的成员）：

```yaml
produced_result:
  identity: <与 result_handoff.identity 精确一致>
  payload: <完整非空 UTF-8 结果，bytesize ≤ maximum_bytes>
```

- 不得把 `change_summary` / `remaining_findings` / prose 当作 payload；
- `produced_result` 是执行后由 Agent 产出的 machine result；frozen 后
  verbatim 复制进后续 CONSUME 契约，无需 Agent 重建；
- 无 `result_handoff` 或 role 非 PRODUCE 时，报告不输出 `produced_result`。
