# Compact Codex Execution Prompt Template

> 固定模板：只渲染一份 `CODEX_EXECUTION_PROMPT`，section 顺序固定为
> 1 路由 → 2 Exact Baseline → 3 唯一目标 → 4 Delta → 5 Scope 与 Acceptance →
> 6 Validation → 7 Git 与 PR → 8 Forbidden Actions → 9 Completion Report →
> 10 Stop Condition；占位符来源见主标准 Template Value Source Table；Git
> 行为段落由受控条件块（WHEN/ENDWHEN 注释标记）按 Capsule `git` 字段展开。

## 1. 路由

```yaml
delivery_type: CODEX_EXECUTION_PROMPT
recipient: <recipient>
paste_location: <paste-location>
purpose: <purpose>
report_back_to: <report-back-to>
next_hop_after_report: <next-hop-after-report>
```

路由字段：recipient 执行方，paste_location 粘贴位置，purpose 唯一目标（来自
Capsule `objective`），report_back_to 报告接收方，next_hop_after_report 下一跳。

## 2. Exact Baseline

```yaml
repository: <repository>
fact_branch: <fact-branch>
expected_fact_HEAD: <fact-head>
pull_request: <pull-request>
```

开始修改前必须：获取远端最新 refs；核验远端事实分支精确等于 expected HEAD；
核验工作树没有会被覆盖的未提交修改。不匹配时立即停止，不得修改仓库。

## 3. 唯一目标

本轮唯一目标：<objective>。

## 4. Delta

- 当前 open findings：
<open-findings>
- 需要变更：
<required-changes>
- 保留的 closed findings：
<preserved-closed-findings>

## 5. Scope 与 Acceptance

- 只允许创建或修改：
<allowed-files>
- 最大变更文件数：<maximum-changed-files>
- 完成结果必须满足：
<acceptance-criteria>

## 6. Validation

- validation_profile：<validation-profile>
- 必须运行：
<required-commands>
- 不得运行：
<forbidden-commands>

## 7. Git 与 PR

```yaml
commit_count: <commit-count>
commit_message: <commit-message>
push_mode: <push-mode>
pull_request_action: <pull-request-action>
```

<!-- WHEN git.commit_count=1 -->
创建恰好一个实现 commit。
<!-- ENDWHEN -->
<!-- WHEN git.commit_count=0 -->
不创建 commit。
<!-- ENDWHEN -->
<!-- WHEN git.push_mode=NORMAL_PUSH -->
验证全部通过后普通 push 至任务分支（任务分支由执行方从事实分支派生）。
<!-- ENDWHEN -->
<!-- WHEN git.push_mode=NONE -->
不执行 push。
<!-- ENDWHEN -->
<!-- WHEN git.pull_request_action=CREATE_DRAFT -->
创建一份 Draft PR，base 为事实分支；`baseline.pull_request` 必须为 `none`。
<!-- ENDWHEN -->
<!-- WHEN git.pull_request_action=UPDATE_DRAFT -->
更新既有 Draft PR（编号见 Exact Baseline 的 `pull_request`，必须为正整数）。
<!-- ENDWHEN -->
<!-- WHEN git.pull_request_action=NONE -->
不操作 PR。
<!-- ENDWHEN -->

禁止 amend、rebase、squash、force push、直接修改事实分支、Ready、merge、
auto-merge、publication。

## 8. Forbidden Actions

<forbidden-actions>

出现任一禁止行为时停止。

## 9. Completion Report

完成后只输出实施报告（名称与接收方见第 10 节 footer），最多
<completion-report-maximum-lines> 行，仅包含公共字段（result、pre_HEAD、
post_HEAD、commit、changed_files、change_summary、local_validation、
remote_branch_HEAD、pull_request、CI_status、scope_violation、
remaining_findings）。

## 10. Stop Condition

完成报告后立即停止，不得自行进入下一阶段、Ready、merge 或 publication。
`CI_status` 如实记录等待状态（not_waited / passed / failed），不得虚构结果。

```yaml
completion_report_recipient: <completion-report-recipient>
completion_report_name: <completion-report-name>
stop_after_report: true
```
