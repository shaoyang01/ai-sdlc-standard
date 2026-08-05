# Compact Completion Report Template

> 预算：`target_lines: 30-80`；`hard_limit_lines: 120`。
> 只覆盖紧凑的实施事实、文件、验证、Git、PR、CI 状态、剩余问题和停止标记。
> 不要求、不容纳：完整执行 Prompt、完整 stdout/stderr、完整 CI 日志、完整
> diff 或全部历史 findings。
> 合同：`ai-sdlc/compact-prompt-standard.md`（PCE-01-A）第 6 节。

```yaml
result: <SUCCESS|FAILURE|BLOCKED>
pre_HEAD: <40-char-lowercase-hex-sha>
post_HEAD: <40-char-lowercase-hex-sha>
commit: <40-char-lowercase-hex-sha|none>
changed_files:
  - <repository-relative-path>
contract_assets:
  - <repository-relative-path>
fixture_summary: <fixtures-verified>
local_validation: <per-command-pass-fail>
remote_branch_HEAD: <40-char-lowercase-hex-sha>
Draft_PR: <pr-number-and-url|none>
CI_status: <not_waited|passed|failed>
scope_violation: <false|blocking-detail>
remaining_findings: <none|list>
```

报告最后一行必须为：

```text
REQUEST_PCE_01_A_SPECIALIZED_REVIEW
```

要求：

- `changed_files` 列出全部实际修改文件；
- `local_validation` 逐项给出 PASS/FAIL；
- `Draft_PR` 给出编号和 URL；
- `CI_status` 未等待时记录为 `not_waited`；
- `scope_violation` 明确为 `false`，或报告具体阻塞；
- 不附带完整 diff、完整日志或下一阶段计划。
