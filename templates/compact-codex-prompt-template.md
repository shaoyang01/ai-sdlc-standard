# Compact Codex Execution Prompt Template

> 固定模板：只渲染一份 `CODEX_EXECUTION_PROMPT`，section 顺序固定为
> 1 路由 → 2 Exact Baseline → 3 唯一目标 → 4 Delta → 5 Scope 与 Acceptance →
> 6 Validation → 7 Git 与 PR → 8 Forbidden Actions → 9 Completion Report →
> 10 Stop Condition。
> 本模板不渲染；Renderer 属于后续阶段。每个占位符的输入来源见
> `ai-sdlc/compact-prompt-standard.md` 的 Template Value Source Table。
> 条件化渲染（按 `git` 字段裁剪段落）属于后续阶段；本模板只建立可条件化的
> 公共合同，覆盖全部合法 Git 组合。

## 1. 路由

```yaml
delivery_type: CODEX_EXECUTION_PROMPT
recipient: <recipient>
paste_location: <paste-location>
purpose: <purpose>
report_back_to: <report-back-to>
next_hop_after_report: <next-hop-after-report>
```

路由字段含义：recipient 是执行方，paste_location 是粘贴位置，purpose 是本轮
唯一目标（来自 Capsule `objective`），report_back_to 是报告接收方，
next_hop_after_report 是报告后的下一跳。

## 2. Exact Baseline

```yaml
repository: <repository>
fact_branch: <fact-branch>
expected_fact_HEAD: <fact-head>
pull_request: <pull-request>
```

开始修改前必须：获取远端最新 refs；核验远端事实分支精确等于 expected HEAD；
核验工作树没有会被覆盖的未提交修改。若远端事实分支不再等于 expected HEAD，
立即停止，不得修改仓库。

## 3. 唯一目标

本轮唯一目标：<objective>。

## 4. Delta

- 当前 open findings：<open-findings>（每条只保留 id 与 OPEN 状态）。
- 需要变更：<required-changes>。
- 保留的 closed findings：<preserved-closed-findings>（只保留 id 与 CLOSED
  状态）。

continuation 只携带当前 delta；closed finding 只保留 ID 和 `CLOSED` 状态。

## 5. Scope 与 Acceptance

- 只允许创建或修改：<allowed-files>。
- 最大变更文件数：<maximum-changed-files>。
- 完成结果必须满足：<acceptance-criteria>。
- 出现任何超出上述范围的需求时，停止并报告，不得自行扩大范围。

## 6. Validation

- validation_profile：<validation-profile>。
- 必须运行：<required-commands>。
- 不得运行：<forbidden-commands>。
- 若某个必需命令失败：只在范围内修复；若修复需要越出范围，停止并报告。

## 7. Git 与 PR

```yaml
commit_count: <commit-count>
commit_message: <commit-message>
push_mode: <push-mode>
pull_request_action: <pull-request-action>
```

按 `git` 字段执行：`commit_count` 为 1 时创建恰好一个实现 commit（为 0 时
不提交）；`push_mode` 为 NORMAL_PUSH 时普通 push 至任务分支（任务分支由执行
方从事实分支派生；NONE 时不推送）；`pull_request_action` 为 CREATE_DRAFT 时
创建 Draft PR、UPDATE_DRAFT 时更新既有 Draft PR（编号见 Exact Baseline 的
`pull_request`）、NONE 时不操作 PR。PR base 为事实分支。
禁止 amend、rebase、squash、force push、直接修改事实分支、Ready、merge、
auto-merge、publication。

## 8. Forbidden Actions

<forbidden-actions>。出现任一禁止行为时停止。

## 9. Completion Report

完成后只输出实施报告（名称与接收方见第 10 节 footer），最多
<completion-report-maximum-lines> 行，仅包含公共字段（result、pre_HEAD、
post_HEAD、commit、changed_files、change_summary、local_validation、
remote_branch_HEAD、pull_request、CI_status、scope_violation、
remaining_findings）。不附带完整 diff、完整日志或下一阶段计划。

## 10. Stop Condition

完成报告后立即停止，不得自行进入下一阶段、Ready、merge 或 publication。
`CI_status` 如实记录等待状态（not_waited / passed / failed），不得虚构
结果；需要独立核验的 CI 结果由报告接收方（见第 1 节 report_back_to）处理。

```yaml
completion_report_recipient: <completion-report-recipient>
completion_report_name: <completion-report-name>
stop_after_report: true
```
