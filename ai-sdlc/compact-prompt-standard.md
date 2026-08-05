# Compact Prompt Standard (v1)

## Purpose

PCE-01 是 **Compact Prompt Standard and Lightweight Renderer**。本文件定义其中的
Compact Prompt Contract v1（PCE-01-A 范围）：

- Compact Execution Capsule v1 合同；
- 四种 Prompt Mode 及其硬限制；
- 五种 Validation Profile；
- 固定 Codex Prompt section 顺序；
- Compact Completion Report 合同。

本文件只定义合同。Renderer CLI 属于后续 PCE-01-B；两个项目真实验收属于
PCE-01-C。本文件不代表 Renderer 已实现、不代表个人知识库已经接入、不代表
PCE-01 已完成。

## 1. Compact Execution Capsule v1

Capsule 是单份、受限 YAML 结构的执行材料，用于把一次执行请求压缩为最小事实集。

### 1.1 基本规则

- 一个 Capsule 只能表达一个目标：`objective` 是单个非空标量字符串。
- continuation 只携带当前 delta，不携带完整历史讨论。
- closed finding 只保留 `id` 和 `CLOSED` 状态，不保留历史正文。
- Capsule 不接受自由 shell command：验证命令只能来自项目对路径类别和命令 ID
  的映射，Capsule 内不内嵌可执行命令。
- v1 只接受受限 YAML（见 1.3）。

### 1.2 根字段与嵌套字段

根字段必须且只能覆盖（`*` 表示必填非空）：

```yaml
task_id: *          # 任务 ID
prompt_mode: *      # 四种 Prompt Mode 之一

routing:            # 精确四字段
  recipient: *      # 执行方（如 Codex）
  paste_location: * # 粘贴位置
  report_back_to: * # 完成报告接收方（不得使用 report_to）
  next_hop_after_report: * # 报告后的下一跳

baseline:           # 精确四字段
  repository: *     # owner/name
  branch: *         # 事实分支
  head: *           # 40 位小写十六进制 SHA
  pull_request: *   # none 或正整数 PR 编号

objective: *        # 单个非空标量字符串（一个 Capsule 一个目标）

delta:              # 精确四字段
  open_findings: *          # 未关闭 finding 列表
  required_changes: *       # 变更路径列表
  acceptance_criteria: *    # 验收标准列表
  preserved_closed_findings: * # 只保留 id 与 CLOSED 的已关闭 finding 列表

scope:              # 精确两字段
  allowed_files: *  # 安全仓库相对路径列表
  maximum_changed_files: * # 正整数

validation_profile: * # 五种 Validation Profile 之一

git:                # 精确四字段
  commit_count: *   # 只能是 0 或 1
  commit_message: * # 非空字符串
  push_mode: *      # NORMAL_PUSH | NO_PUSH
  pull_request_action: * # CREATE_DRAFT | NONE

forbidden_actions:  # 非空字符串列表

completion_report:  # 精确四字段
  recipient: *      # 报告接收方
  name: *           # 报告名称
  maximum_lines: *  # 正整数
  stop_after_report: true # 必须为 true
```

v1 约束至少包括：

- `prompt_mode` 只能为四种已定义模式（见第 2 节）；
- `baseline.repository` 使用 `owner/name` 形式；
- `baseline.head` 为 40 位小写十六进制 SHA；
- `scope.allowed_files` 与 `delta.required_changes` 只允许安全仓库相对路径：
  禁止绝对路径、反斜杠、`..`、`~`、空路径；
- `git.commit_count` 只能为 `0` 或 `1`；
- `completion_report.stop_after_report` 必须为 `true`；
- finding 条目只允许 `id` 与 `status` 两个字段；`open_findings` 的条目状态必须为
  `OPEN`，`preserved_closed_findings` 的条目状态必须为 `CLOSED`。

### 1.3 受限 YAML

v1 仅接受受限 YAML。以下情况全部拒绝（对应 validator 分类码见
`scripts/validate-compact-prompt-contracts.rb` 与 `docs/VALIDATION.md`）：

| 拒绝项 | 说明 |
| --- | --- |
| unknown key | 出现合同未定义的键 |
| duplicate key | 同一 mapping 内重复键（含 root 与嵌套层） |
| 缺失必填字段 | 必填字段缺失或必填标量为空 |
| anchor | 任何 YAML anchor（`&name`） |
| alias | 任何 YAML alias（`*name`） |
| explicit tag | 任何显式 tag（`!!str`、`!foo` 等） |
| merge key | 任何 merge key（`<<`） |
| null | 任何 `null` / `~` / 空标量值 |
| 多目标 | `objective` 不是单个非空标量（如列表或 mapping） |
| 不安全路径 | 绝对路径、反斜杠、`..`、`~`、空路径 |
| 非法 Git SHA | `baseline.head` 不是 40 位小写十六进制 |
| 缺失停止条件 | `completion_report.stop_after_report` 不为 `true` |

## 2. 四种 Prompt Mode

公共合同精确定义：

| Prompt Mode | hard_limit_lines | hard_limit_bytes |
| --- | --- | --- |
| `MICRO_FIX` | 120 | 32768 |
| `SESSION_CONTINUATION` | 220 | 65536 |
| `BOOTSTRAP` | 400 | 98304 |
| `RECOVERY` | 400 | 98304 |

超限规则（按顺序执行）：

```text
删除重复历史
→ closed findings 压缩为 ID:CLOSED
→ 仍超限则 TASK_SPLIT_REQUIRED
```

不得自动升级模式、不得扩大限制、不得声称进行了精确 Token 计算。

## 3. 五种 Validation Profile

必须且只能定义以下五种（语义见 `templates/compact-validation-profiles.yaml`）：

| Profile | 语义 |
| --- | --- |
| `DOC_ONLY` | 纯文档变更；默认禁止根 `npm test`（`root_npm_test: forbidden_by_default`） |
| `TYPE_ONLY` | 代码变更但只要求类型检查（`require_typecheck: true`） |
| `LOCAL_BEHAVIOR` | 要求聚焦行为测试（`require_focused_tests: true`） |
| `PERSISTENCE_CONCURRENCY` | 要求聚焦持久化与并发测试（`require_focused_persistence_and_concurrency_tests: true`） |
| `GLOBAL_CONTRACT` | 合同真正共享时允许全量套件（`allow_full_suite_when_contract_really_shared: true`） |

同时明确：

- 验证等级不足必须拒绝：`DOC_ONLY` 的 `delta.required_changes` 不得包含代码类路径；
- 验证等级过重必须拒绝：`PERSISTENCE_CONCURRENCY` 与 `GLOBAL_CONTRACT` 的
  `delta.required_changes` 必须至少包含一个代码类路径；
- 项目只映射路径类别和命令 ID；Capsule 不接受自由 shell command；
- 普通文档任务不得默认映射到根 `npm test`。

v1 路径类别启发式（validator 实现常量，不是项目 profile resolution）：

```text
documentation: .md .markdown .yaml .yml .json .txt
code:          .ts .tsx .js .jsx .rb .py .go .java .sh
```

项目级 profile 映射（真实命令解析）属于 PCE-01-B，不在本文件定义。

## 4. Continuation 与 Findings

- continuation 只携带当前 delta：不含上一轮完整 Prompt、完整 stdout/stderr 或
  完整历史讨论。
- closed finding 只保留 `id` 和 `CLOSED` 状态；历史正文不得进入 Capsule。
- finding 条目只有 `id` 与 `status` 两个字段；详情属于 delta 正文。

## 5. 固定 Prompt Section 顺序

Codex Prompt 模板（`templates/compact-codex-prompt-template.md`）只能渲染一份
`CODEX_EXECUTION_PROMPT`，section 顺序固定：

1. 路由
2. Exact Baseline
3. 唯一目标
4. Delta
5. Scope 与 Acceptance
6. Validation
7. Git 与 Draft PR
8. Forbidden Actions
9. Completion Report
10. Stop Condition

模板头部生成固定路由字段 `delivery_type: CODEX_EXECUTION_PROMPT`、`recipient`、
`paste_location`、`purpose`、`report_back_to`、`next_hop_after_report`；模板末尾
生成 `completion_report_recipient`、`completion_report_name`、
`stop_after_report: true`。模板不得附带第二份 Handoff、备选 Prompt、下一阶段
Prompt 或完整历史讨论。

## 6. Compact Completion Report

- 预算：`target_lines: 30-80`，`hard_limit_lines: 120`。
- 覆盖紧凑的实施事实、文件、验证、Git、PR、CI 状态、剩余问题和停止标记。
- 不得要求或容纳：完整执行 Prompt、完整 stdout/stderr、完整 CI 日志、完整
  diff、全部历史 findings。

## 7. 交付与停止规则

- 一次只能交付一份执行材料。
- 报告后停止：`completion_report.stop_after_report` 必须为 `true`，报告完成后
  不得继续进入下一阶段。

## 8. 边界

本文件及 PCE-01-A 合同不实现、不声明：

- Renderer CLI（属于 PCE-01-B）；
- 项目 profile resolution 与命令解析（属于 PCE-01-B）；
- 精确 Token 计算；
- 个人知识库接入（属于后续阶段）；
- PCE-01 已完成、PCE-01 source_verified、GRP-01 已启动、D10-B 已恢复或
  PCE-01-B 命令已经存在。
