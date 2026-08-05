# Compact Codex Execution Prompt Template

> 固定模板：只渲染一份 `CODEX_EXECUTION_PROMPT`，section 顺序固定为
> 1 路由 → 2 Exact Baseline → 3 唯一目标 → 4 Delta → 5 Scope 与 Acceptance →
> 6 Validation → 7 Git 与 Draft PR → 8 Forbidden Actions → 9 Completion Report →
> 10 Stop Condition。
> 本模板不渲染；Renderer 属于 PCE-01-B。实例由 Compact Execution Capsule v1
> 填充（合同：`ai-sdlc/compact-prompt-standard.md`）。

## 1. 路由

```yaml
delivery_type: CODEX_EXECUTION_PROMPT
recipient: <recipient>
paste_location: <paste-location>
purpose: <purpose>
report_back_to: <report-back-to>
next_hop_after_report: <next-hop-after-report>
```

给谁：<recipient>；在哪里粘贴：<paste-location>；完成后的报告给谁：
<report-back-to>；当前不要做什么：<next-hop-after-report> 之前不推进。

## 2. Exact Baseline

```yaml
repository: <owner/name>
fact_branch: <fact-branch>
expected_fact_HEAD: <40-char-lowercase-hex-sha>
task_branch: <task-branch>
branch_creation_base: <40-char-lowercase-hex-sha>
```

开始修改前必须：获取远端最新 refs；核验远端事实分支精确等于 expected HEAD；
核验工作树没有会被覆盖的未提交修改；从 expected HEAD 创建唯一任务分支。
若远端事实分支不再等于 expected HEAD，立即停止，不得修改仓库。

## 3. 唯一目标

本轮唯一目标：<single-objective>。

本轮只建立 <objective-scope>。不得实现 <out-of-scope>，不得进入
<next-phase>。

## 4. Delta

- 当前 open findings：<open-findings>（每条只保留 id 与 OPEN 状态）。
- 需要变更：<required-changes>。
- 验收标准：<acceptance-criteria>。
- 保留的 closed findings：<preserved-closed-findings>（只保留 id 与 CLOSED
  状态）。

continuation 只携带当前 delta；closed finding 只保留 ID 和 `CLOSED` 状态。

## 5. Scope 与 Acceptance

- 只允许创建或修改：<allowed-files>。
- 最大变更文件数：<maximum-changed-files>。
- 出现需要第十一个文件、需要修改现有 validator、需要修改 CI workflow、需要
  实现 <out-of-scope-tooling> 等任一情况时，停止并报告，不得自行扩大范围。
- 完成结果必须满足：<acceptance-criteria>。

## 6. Validation

- validation_profile：<validation-profile>。
- 必须运行且只需运行：<required-commands>。
- 不得运行：<forbidden-commands>。
- 若某个必需命令失败：只在范围内修复；若修复需要越出范围，停止并报告
  <scope-escalation-code>。

## 7. Git 与 Draft PR

```yaml
commit_count: <0|1>
commit_message: <commit-message>
push_mode: <NORMAL_PUSH|NO_PUSH>
pull_request_action: <CREATE_DRAFT|NONE>
pull_request_base: <fact-branch>
```

验证全部通过后：一个实现 commit、普通 push、一个 Draft PR（如有）。禁止
amend、rebase、squash、force push、直接修改事实分支、创建第二分支或第二 PR、
Ready、merge、auto-merge、publication。

## 8. Forbidden Actions

<forbidden-actions>。出现任一禁止行为时停止。

## 9. Completion Report

完成后只输出 <completion-report-name>，最多 <completion-report-maximum-lines>
行，仅包含实施事实字段（result、pre_HEAD、post_HEAD、commit、changed_files、
contract_assets、fixture_summary、local_validation、remote_branch_HEAD、
Draft_PR、CI_status、scope_violation、remaining_findings），报告最后一行必须为
<specialized-review-request-line>。不附带完整 diff、完整日志或下一阶段计划。

## 10. Stop Condition

完成报告后立即停止，不得自行进入 <next-phase>、Ready、merge 或 publication。
CI 状态记录为 `not_waited`，由 <report-back-to> 独立核验。

```yaml
completion_report_recipient: <completion-report-recipient>
completion_report_name: <completion-report-name>
stop_after_report: true
```
