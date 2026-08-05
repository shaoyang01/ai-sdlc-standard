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
