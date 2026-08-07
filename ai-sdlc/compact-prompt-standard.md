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
  push_mode: *      # NONE | NORMAL_PUSH
  pull_request_action: * # NONE | CREATE_DRAFT | UPDATE_DRAFT

forbidden_actions:  # 非空字符串列表

completion_report:  # 精确四字段
  recipient: *      # 报告接收方
  name: *           # 报告名称
  maximum_lines: *  # 20-120 的整数
  stop_after_report: true # 必须为 true
```

v1 约束至少包括：

- `prompt_mode` 只能为四种已定义模式（见第 2 节）；
- `baseline.repository` 使用 `owner/name` 形式；
- `baseline.head` 为 40 位小写十六进制 SHA；
- `scope.allowed_files` 与 `delta.required_changes` 只允许安全仓库相对路径：
  禁止绝对路径、反斜杠、`..`、`~`、空路径；
- `git.commit_count` 只能为 `0` 或 `1`；
- `git.push_mode` 只能为 `NONE` 或 `NORMAL_PUSH`；
- `git.pull_request_action` 只能为 `NONE`、`CREATE_DRAFT` 或 `UPDATE_DRAFT`；
- `delta.required_changes`、`delta.acceptance_criteria`、`scope.allowed_files`
  与 `forbidden_actions` 必须非空；空数组分类为 `MISSING_REQUIRED_FIELD`；
- `completion_report.maximum_lines` 必须是 20-120 的整数；类型错误或越界
  分类为 `FIELD_TYPE_INVALID`；
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
| 必填数组为空 | `delta.required_changes`、`delta.acceptance_criteria`、`scope.allowed_files`、`forbidden_actions` 为空数组 |
| 字段类型或枚举越界 | 字段类型错误或枚举越界（如 `completion_report.maximum_lines` 越界） |
| anchor | 任何 YAML anchor（`&name`） |
| alias | 任何 YAML alias（`*name`） |
| explicit tag | 任何显式 tag（`!!str`、`!foo` 等） |
| merge key | 任何 merge key（`<<`） |
| null | 任何 `null` / `~` / 空标量值 |
| 多目标 | `objective` 不是单个非空标量（如列表或 mapping） |
| 多文档或零文档 | 受限 YAML 必须恰好包含一个 document |
| 不安全路径 | 绝对路径、反斜杠、`..`、`~`、空路径 |
| 非法 Git SHA | `baseline.head` 不是 40 位小写十六进制 |
| 缺失停止条件 | `completion_report.stop_after_report` 不为 `true` |

### 1.4 公共分类

validator（`scripts/validate-compact-prompt-contracts.rb`）与 negative
fixture 使用以下稳定公共分类；`expected_classification` 只能取其中一种：

| 分类码 | 含义 |
| --- | --- |
| `UNKNOWN_KEY` | 出现合同未定义的键 |
| `MISSING_REQUIRED_FIELD` | 必填字段缺失、必填标量为空或必填数组为空 |
| `DUPLICATE_KEY` | 同一 mapping 内重复键 |
| `YAML_ALIAS` | 任何 YAML alias（`*name`） |
| `YAML_ANCHOR` | 任何 YAML anchor（`&name`） |
| `YAML_TAG` | 任何显式 tag（`!!str`、`!foo` 等） |
| `YAML_MERGE_KEY` | 任何 merge key（`<<`） |
| `YAML_NULL` | 任何 `null` / `~` / 空标量值 |
| `YAML_DOCUMENT_COUNT_INVALID` | 受限 YAML 不是恰好一个 document |
| `INVALID_SHA` | `baseline.head` 不是 40 位小写十六进制 |
| `UNSAFE_PATH` | 绝对路径、反斜杠、`..`、`~`、空路径 |
| `MULTIPLE_OBJECTIVES` | `objective` 不是单个非空标量 |
| `VALIDATION_UNDERSPECIFIED` | 验证等级不足 |
| `VALIDATION_OVERPROVISIONED` | 验证等级过重 |
| `MISSING_STOP_CONDITION` | `completion_report.stop_after_report` 不为 `true` |
| `FIELD_TYPE_INVALID` | 字段类型错误或枚举越界 |

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
7. Git 与 PR
8. Forbidden Actions
9. Completion Report
10. Stop Condition

模板头部生成固定路由字段 `delivery_type: CODEX_EXECUTION_PROMPT`、`recipient`、
`paste_location`、`purpose`、`report_back_to`、`next_hop_after_report`；模板末尾
生成 `completion_report_recipient`、`completion_report_name`、
`stop_after_report: true`。模板不得附带第二份 Handoff、备选 Prompt、下一阶段
Prompt 或完整历史讨论。

## 6. Template Value Source Table

Codex Prompt 模板（`templates/compact-codex-prompt-template.md`）的每个输入
必须且只能绑定一个来源。来源类别为：

- `CAPSULE_FIELD`：Capsule 根字段（含嵌套字段路径）；
- `STANDARD_CONSTANT`：本合同固定的常量文本（如 `delivery_type` 与十个固定
  section 标题）；
- `PCE_01_B_PROJECT_MAPPING`：项目对验证命令 ID 的映射（属于后续阶段
  PCE-01-B，本表只登记绑定关系，不实现映射）。

| 模板输入 | 来源 | 说明 |
| --- | --- | --- |
| `<recipient>` | CAPSULE_FIELD `routing.recipient` | 执行方 |
| `<paste-location>` | CAPSULE_FIELD `routing.paste_location` | 粘贴位置 |
| `<purpose>` | CAPSULE_FIELD `objective` | 本轮唯一目标（purpose 不设独立字段） |
| `<report-back-to>` | CAPSULE_FIELD `routing.report_back_to` | 报告接收方 |
| `<next-hop-after-report>` | CAPSULE_FIELD `routing.next_hop_after_report` | 报告后的下一跳 |
| `<repository>` | CAPSULE_FIELD `baseline.repository` | owner/name |
| `<fact-branch>` | CAPSULE_FIELD `baseline.branch` | 事实分支 |
| `<fact-head>` | CAPSULE_FIELD `baseline.head` | 40 位小写十六进制 SHA |
| `<pull-request>` | CAPSULE_FIELD `baseline.pull_request` | none 或 PR 编号 |
| `<objective>` | CAPSULE_FIELD `objective` | 唯一目标 |
| `<open-findings>` | CAPSULE_FIELD `delta.open_findings` | 未关闭 findings |
| `<required-changes>` | CAPSULE_FIELD `delta.required_changes` | 变更路径列表 |
| `<acceptance-criteria>` | CAPSULE_FIELD `delta.acceptance_criteria` | 验收标准列表 |
| `<preserved-closed-findings>` | CAPSULE_FIELD `delta.preserved_closed_findings` | 已关闭 findings |
| `<allowed-files>` | CAPSULE_FIELD `scope.allowed_files` | 允许修改的文件 |
| `<maximum-changed-files>` | CAPSULE_FIELD `scope.maximum_changed_files` | 最大变更文件数 |
| `<validation-profile>` | CAPSULE_FIELD `validation_profile` | 验证等级 |
| `<required-commands>` | PCE_01_B_PROJECT_MAPPING | 验证命令 ID |
| `<forbidden-commands>` | PCE_01_B_PROJECT_MAPPING | 禁止命令 ID |
| `<commit-count>` | CAPSULE_FIELD `git.commit_count` | 0 或 1 |
| `<commit-message>` | CAPSULE_FIELD `git.commit_message` | 提交信息 |
| `<push-mode>` | CAPSULE_FIELD `git.push_mode` | NONE 或 NORMAL_PUSH |
| `<pull-request-action>` | CAPSULE_FIELD `git.pull_request_action` | NONE、CREATE_DRAFT 或 UPDATE_DRAFT |
| `<forbidden-actions>` | CAPSULE_FIELD `forbidden_actions` | 禁止行为列表 |
| `<completion-report-name>` | CAPSULE_FIELD `completion_report.name` | 报告名称 |
| `<completion-report-maximum-lines>` | CAPSULE_FIELD `completion_report.maximum_lines` | 20-120 |
| `<completion-report-recipient>` | CAPSULE_FIELD `completion_report.recipient` | 报告接收方 |
| `delivery_type` | STANDARD_CONSTANT | 固定为 `CODEX_EXECUTION_PROMPT` |
| 十个固定 section 标题 | STANDARD_CONSTANT | 见第 5 节固定顺序 |

约束：

- 模板中出现的每个 `<...>` 占位符都必须在本表中有且仅有一行；
- 本表中每个占位符行都必须真实出现在模板中；
- 无合法来源的占位符（如任务分支、下一阶段、scope escalation 代码、
  专项审查请求行）不得出现在模板中；
- validator 必须提取模板全部占位符，验证不存在未知占位符、每个占位符都有
  唯一来源、source table 与模板占位符集合完全一致、不存在遗留或重复占位符。

## 7. Compact Completion Report

- 预算：`target_lines: 30-80`，`minimum_lines: 20`，`hard_limit_lines: 120`；
  `completion_report.maximum_lines` 必须是 20-120 的整数，类型错误或越界
  分类为 `FIELD_TYPE_INVALID`。
- 公共字段必须且只能覆盖：

```yaml
result:
pre_HEAD:
post_HEAD:
commit:
changed_files:
change_summary:
local_validation:
remote_branch_HEAD:
pull_request:
CI_status:
scope_violation:
remaining_findings:
```

- `change_summary` 记录变更摘要；`pull_request` 给出 PR 编号和 URL 或
  `none`；`CI_status` 按实际等待情况记录（`not_waited` / `passed` /
  `failed`）。
- 报告接收方、名称、最大行数和停止条件来自 Capsule `completion_report`
  字段。
- 不得要求或容纳：完整执行 Prompt、完整 stdout/stderr、完整 CI 日志、完整
  diff、全部历史 findings。

## 8. 交付与停止规则

- 一次只能交付一份执行材料。
- 报告后停止：`completion_report.stop_after_report` 必须为 `true`，报告完成后
  不得继续进入下一阶段。

## 9. 边界

本文件及 PCE-01-A 合同不实现、不声明：

- Renderer CLI（属于 PCE-01-B）；
- 项目 profile resolution 与命令解析（属于 PCE-01-B）；
- 精确 Token 计算；
- 个人知识库接入（属于后续阶段）；
- PCE-01 已完成、PCE-01 source_verified、GRP-01 已启动、D10-B 已恢复或
  PCE-01-B 命令已经存在。

## 10. CLI 合同（PCE-01-B）

Renderer 以 `ruby scripts/ai-sdlc-prompt.rb` 提供，只接受两个 subcommand：

- `validate <capsule.yaml>`：执行 Capsule、project policy、template binding 与
  Git baseline preflight，不渲染 Prompt；成功时 stdout 精确输出
  `compact execution capsule valid`（单行、LF 结尾），stderr 为空，exit 0。
- `compile <capsule.yaml>`：复用 preflight，再渲染并执行 budget gate；成功时
  stdout 仅输出最终一份 `CODEX_EXECUTION_PROMPT`，stderr 为空，exit 0。

Capsule 路径按 cwd 解析；target repository 为 cwd 所属 Git root；policy 固定
读取 `<git-root>/.ai-sdlc/prompt-policy.yaml`。

任意失败：stdout 为空，stderr 仅稳定 diagnostics（见第 14 节），不得输出
backtrace 或部分 Prompt。exit codes：

| exit | 类别 | 覆盖 |
| --- | --- | --- |
| 0 | success | validate / compile 成功 |
| 2 | CLI_OR_INPUT | 参数错误、文件缺失、编码无效 |
| 3 | CONTRACT_OR_POLICY | Capsule 合同违规、policy 违规、模板绑定违规 |
| 4 | GIT_BASELINE | Git 仓库、origin 身份、fact branch、named ref 核验失败 |
| 5 | RENDER_OR_BUDGET | 渲染不完整、行数或字节超限 |

## 11. Project Policy（PCE-01-B）

固定路径 `<git-root>/.ai-sdlc/prompt-policy.yaml`，根字段只能为：

- `schema: compact-prompt-project-policy-v1`；
- `project_id`：非空 ID；
- `repository`：owner/name；
- `fact_branch`：合法 Git branch 名；
- `commands`：`COMMAND_ID → {argv: [string, ...]}`；
- `validation_profiles`：五种标准 Profile 的非空子集 →
  `{required_command_ids: [...], forbidden_command_ids: [...]}`。

policy 使用受限 YAML；拒绝 unknown key、missing、duplicate、anchor、alias、
tag、merge、null、零文档或多文档。`COMMAND_ID` 匹配
`[A-Z][A-Z0-9_]{0,63}`；`argv` 非空、元素为非空单行字符串且不含 NUL、CR、
LF。

五种标准 Profile 是标准 vocabulary（`DOC_ONLY`、`TYPE_ONLY`、
`LOCAL_BEHAVIOR`、`PERSISTENCE_CONCURRENCY`、`GLOBAL_CONTRACT`）；project
policy 只声明项目真实支持的非空 Profile 子集：

- Profile key 存在表示项目真实支持该 Profile；
- Profile key 缺失表示项目不支持该 Profile，缺失未选择的 Profile 合法；
- `validation_profiles` 为空 mapping 分类为 `POLICY_PROFILE_MAPPING_MISSING`；
- unknown Profile key 分类为 `POLICY_SCHEMA_INVALID`（即使同时没有声明任何
  支持的 Profile，`POLICY_SCHEMA_INVALID` 也获胜）；
- Capsule 选择 policy 未声明的 Profile 时，稳定返回
  `VALIDATION_PROFILE_UNSUPPORTED`（exit 3，CONTRACT_OR_POLICY），不回退到
  其他 Profile，也不把缺失 Profile 的 required/forbidden commands 静默渲染
  为 `none`；
- 诊断 precedence：policy 结构与已声明 Profile 校验错误先于
  `VALIDATION_PROFILE_UNSUPPORTED`；`VALIDATION_PROFILE_UNSUPPORTED` 先于
  command ID resolution（其他已声明 Profile 中的 unknown command）；
- 禁止伪映射：不得用 unittest、语法检查、no-op 或命令名包装填充
  `TYPE_ONLY` 等未真实支持的 Profile。

已声明 Profile 的 required 非空；required 与 forbidden 各自无重复、二者无
交集，且全部 ID 已在 `commands` 登记。所有已声明 Profile 的 command ID 都
必须解析，而不只是被选择的 Profile。

policy 不得覆盖公共模板、Mode budget、forbidden actions 或 Git write policy；
Capsule 不接受命令文本，Renderer 只渲染命令、不执行项目验证命令。
`DOC_ONLY` 的 required 不得解析为根 `npm test` 或 `npm run test`。

标准库命令 ID 与 profile 映射见 `.ai-sdlc/prompt-policy.yaml`；命令显示文本
只能由 `Shellwords.join(argv)` 生成。

## 12. Checkout-Independent Git Gate（PCE-01-B）

只允许 `Open3.capture3(*argv)` 固定 argv；不得使用 shell、fetch、
ls-remote。核验顺序：

1. cwd 属于 Git repository（`git rev-parse --show-toplevel`）；
2. policy 文件已被 Git 跟踪（`git ls-files --error-unmatch`）；
3. origin 解析并做三方 identity 闭合：归一化 origin identity == Capsule
   `baseline.repository` == policy `repository`，三方均按 GitHub owner/repo
   大小写不敏感比较。origin 只接受锁定三种形式：
   `https://github.com/<owner>/<repo>[.git]`、
   `git@github.com:<owner>/<repo>[.git]`、
   `ssh://git@github.com/<owner>/<repo>[.git]`；提取 identity 前显式拒绝
   userinfo、query（`?`）、fragment（`#`）、控制字符、额外路径、本地路径、
   file URL、自定义 SSH alias 与歧义 scp-like URL。无效 origin 与三方不闭合
   统一为 `REPOSITORY_IDENTITY_MISMATCH`，使用固定通用 message，不得回显
   URL、可疑 segment、用户名、密码、token、query 或 fragment；
4. Capsule `baseline.branch` == policy `fact_branch`；
5. `policy.fact_branch` 必须通过 `git check-ref-format --branch`（branch
   validity 权威；不得以 `git rev-parse <ref>` 作为 named-ref authority，
   因为它会按 revision expression 解释）；不合法统一为
   `FACT_BRANCH_INVALID`；
6. `refs/heads/<fact_branch>` 与 `refs/remotes/origin/<fact_branch>` 均经
   `git show-ref --verify --hash` 精确全 ref 查找（exact full-ref lookup，
   无 shell、无网络、无 revision expression），必须精确等于 Capsule
   `baseline.head`；缺失为 `BASELINE_REF_MISSING`，不一致为
   `BASELINE_HEAD_MISMATCH`。

不得要求当前 checkout branch 等于事实分支；current checkout 与 current HEAD
均不是 baseline authority。remote-tracking ref 仅代表上游预先 fetch 后的本地
缓存，不得声称在线确认 GitHub 最新 HEAD（`git_fetch_performed=false`、
`live_GitHub_HEAD_guaranteed=false`）。禁止 checkout、branch、update-ref、
reset、rebase、commit、push 或 PR 操作。

## 13. Renderer（PCE-01-B）

只使用 Template Value Source Table 登记的 27 个占位符与来源
`CAPSULE_FIELD | STANDARD_CONSTANT | PCE_01_B_PROJECT_MAPPING`；保持固定十
节顺序，只生成一份 `CODEX_EXECUTION_PROMPT`。

模板结构在共享库有唯一 template-structure gate（CLI validate、CLI compile
与 contract validator 共同调用），fail closed 检查：固定十节 heading 精确且
顺序精确，不得缺节、重复节或出现额外编号节；任意行首 `delivery_type:` 恰好
一行且值精确为 `CODEX_EXECUTION_PROMPT`（missing、duplicate、wrong 均失败）；
模板内全部 `WHEN` / `ENDWHEN` 类 HTML marker 被完整扫描——只有精确合法
marker 才被接受，malformed、unknown field/value、unpaired、nested、
duplicate、跨节 marker 全部失败，任何不匹配合法 token 正则的 WHEN-like /
ENDWHEN-like 文本不得被静默忽略。结构失败为 `TEMPLATE_STRUCTURE_INVALID` /
`TEMPLATE_CONDITIONAL_INVALID`，stdout 为空，exit 3。

模板绑定在共享库有唯一 template-binding validator（CLI validate、CLI
compile 与 contract validator 共同调用），运行时证明：模板占位符集合精确等于
27 个 `PLACEHOLDER_SOURCES`；每个占位符恰好出现一次；无 unknown、missing、
duplicate 或 source-set drift。绑定失败为
`TEMPLATE_PLACEHOLDER_UNKNOWN` / `TEMPLATE_PLACEHOLDER_MISSING` /
`TEMPLATE_PLACEHOLDER_DUPLICATE`，stdout 为空，exit 3。

模板只允许非嵌套标记 `<!-- WHEN <field>=<value> -->` 与 `<!-- ENDWHEN -->`。
条件字段和值只能是：

```text
git.commit_count=0|1
git.push_mode=NONE|NORMAL_PUSH
git.pull_request_action=NONE|CREATE_DRAFT|UPDATE_DRAFT
```

每个合法值恰有一个 block；不得缺失、重复、嵌套或跨节。渲染后删除全部条件
标记，每组只保留命中 block。`commit_count=0` 不得声称创建 commit；
`push_mode=NONE` 不得声称 push；PR action 为 `NONE` 时不得声称操作 PR；
`CREATE_DRAFT` 要求 `baseline.pull_request=none`；`UPDATE_DRAFT` 要求其为
正整数。

列表按 Capsule 输入顺序渲染为紧凑 bullets；空 findings 渲染为 `none`。渲染器
按输出上下文区分并集中实现四种 renderer（finding F06）：`render_yaml_scalar`
处理 fenced YAML block（路由 / Exact Baseline / Git 与 PR / Completion Report
footer）中的字符串，用确定性 YAML 双引号 scalar——反斜杠、双引号、CR、LF、
tab、NUL 及其他控制字符编为 YAML 转义（`\\` `\"` `\r` `\n` `\t` `\0` `\xNN`），
`<` / `>` 编为 `\u003C` / `\u003E` 以保持合法 YAML 且不形成占位符或条件标记；
整数与 boolean 保持 YAML 原生类型（bare），字符串 `"none"` 保持带引号
（不得解析为 null）。`render_prose_scalar` 处理模板正文单行字符串，
`render_list_item` 处理 prose 列表项，`render_finding` 处理 finding id/status，
三者统一使用集中式可见单行编码（CR、LF、tab、NUL、其他控制字符以及 `<`、
`>`、`&` 编为 `\r` `\n` `\t` `\0` `\xNN` `\<` `\>` `\&`）。所有编码保留语义、
不静默删除任何字符，原单行注入防护不得弱化；因此注入的第二 `delivery_type`、
heading/YAML 控制行、额外材料、占位符、WHEN/ENDWHEN 标记或 CR 字节无法形成。
成功 compile 输出的每一个 fenced YAML block 都可用
`YAML.safe_load(permitted_classes: [], aliases: false)` 独立解析，字段值与
类型与原 Capsule/Standard 常量精确一致。输出固定 UTF-8、LF、恰好一个末尾
LF；不含 CR、时间、用户、主机或随机值；相同 Capsule、policy 与 Standard
Package bytes 必须 byte-identical。

输出前验证（canonical output verifier）：有效 UTF-8；不含 CR；任意
`^delivery_type:` 恰好一行且值为 `CODEX_EXECUTION_PROMPT`；零未解析占位符
（27 个已登记占位符均不再以原样出现）；零未转义条件标记；十节顺序正确；恰好
一个末尾 LF。budget gate 在此 canonical 输出上执行。

## 14. Diagnostics 与 Budget（PCE-01-B）

diagnostics 格式精确为 `<CODE>\t<field-or-source-path>\t<short-message>`，每条以单个
LF 结尾；多条按 code、path、message 排序。`path` 与 `message` 中的 tab、CR、LF、
NUL 及控制字符必须经确定性可见转义（`\t` `\r` `\n` `\0` `\xNN`），保证三字段
形状稳定。diagnostic 不得包含 secret、credential、backtrace、origin 原文或不稳定
环境文本。Capsule 复用 A 公共分类（第 1.4 节），其 exit 映射与全部 B 稳定码在
以下 registry 表中集中定义（validator 静态证明 registry 与标准双向一致、每个
code 在共享库有输出点、CLI 失败出口只经 registry 解析）：

| code | exit | 类别 | 含义 |
| --- | --- | --- | --- |
| `CLI_USAGE_INVALID` | 2 | CLI_OR_INPUT | argv 不是 validate\|compile <capsule.yaml> |
| `INPUT_FILE_INVALID` | 2 | CLI_OR_INPUT | capsule 文件不存在或不是普通文件 |
| `INPUT_ENCODING_INVALID` | 2 | CLI_OR_INPUT | capsule 文本不是有效 UTF-8 |
| `UNKNOWN_KEY` | 3 | CONTRACT_OR_POLICY | 出现合同未定义的键 |
| `MISSING_REQUIRED_FIELD` | 3 | CONTRACT_OR_POLICY | 必填字段缺失、标量为空或数组为空 |
| `DUPLICATE_KEY` | 3 | CONTRACT_OR_POLICY | 同一 mapping 内重复键 |
| `YAML_ALIAS` | 3 | CONTRACT_OR_POLICY | 存在 YAML alias（*name） |
| `YAML_ANCHOR` | 3 | CONTRACT_OR_POLICY | 存在 YAML anchor（&name） |
| `YAML_TAG` | 3 | CONTRACT_OR_POLICY | 存在显式 YAML tag |
| `YAML_MERGE_KEY` | 3 | CONTRACT_OR_POLICY | 存在 merge key（<<） |
| `YAML_NULL` | 3 | CONTRACT_OR_POLICY | 存在 null / ~ / 空标量 |
| `YAML_DOCUMENT_COUNT_INVALID` | 3 | CONTRACT_OR_POLICY | 受限 YAML 不是恰好一个 document |
| `YAML_SYNTAX` | 3 | CONTRACT_OR_POLICY | 受限 YAML 无法解析 |
| `YAML_UNSUPPORTED` | 3 | CONTRACT_OR_POLICY | 受限 YAML 被 safe-load 拒绝 |
| `INVALID_SHA` | 3 | CONTRACT_OR_POLICY | baseline.head 不是 40 位小写十六进制 |
| `UNSAFE_PATH` | 3 | CONTRACT_OR_POLICY | 绝对路径、反斜杠、..、~ 或空路径 |
| `MULTIPLE_OBJECTIVES` | 3 | CONTRACT_OR_POLICY | objective 不是单个非空标量 |
| `VALIDATION_UNDERSPECIFIED` | 3 | CONTRACT_OR_POLICY | 验证等级不足 |
| `VALIDATION_OVERPROVISIONED` | 3 | CONTRACT_OR_POLICY | 验证等级过重 |
| `MISSING_STOP_CONDITION` | 3 | CONTRACT_OR_POLICY | completion_report.stop_after_report 不为 true |
| `FIELD_TYPE_INVALID` | 3 | CONTRACT_OR_POLICY | 字段类型错误或枚举越界 |
| `POLICY_FILE_MISSING` | 3 | CONTRACT_OR_POLICY | git root 下找不到 policy 文件 |
| `POLICY_SCHEMA_INVALID` | 3 | CONTRACT_OR_POLICY | policy schema、键、类型或枚举违规 |
| `POLICY_PROFILE_MAPPING_MISSING` | 3 | CONTRACT_OR_POLICY | profile 映射缺失或 required 为空 |
| `POLICY_COMMAND_ID_UNKNOWN` | 3 | CONTRACT_OR_POLICY | 命令 ID 未在 commands 登记 |
| `POLICY_COMMAND_CONFLICT` | 3 | CONTRACT_OR_POLICY | 重复或 required/forbidden 交集 |
| `VALIDATION_PROFILE_UNSUPPORTED` | 3 | CONTRACT_OR_POLICY | Capsule 选择的 Validation Profile 未被 project policy 声明 |
| `DOC_ONLY_ROOT_NPM_TEST_FORBIDDEN` | 3 | CONTRACT_OR_POLICY | DOC_ONLY 不得要求根 npm test |
| `TEMPLATE_FILE_MISSING` | 3 | CONTRACT_OR_POLICY | 找不到 prompt 模板文件 |
| `TEMPLATE_PLACEHOLDER_UNKNOWN` | 3 | CONTRACT_OR_POLICY | 模板占位符无来源行 |
| `TEMPLATE_PLACEHOLDER_MISSING` | 3 | CONTRACT_OR_POLICY | 已登记占位符在模板中缺失 |
| `TEMPLATE_PLACEHOLDER_DUPLICATE` | 3 | CONTRACT_OR_POLICY | 已登记占位符出现多次 |
| `TEMPLATE_SOURCE_BINDING_MISMATCH` | 3 | CONTRACT_OR_POLICY | 占位符来源不可解析 |
| `TEMPLATE_STRUCTURE_INVALID` | 3 | CONTRACT_OR_POLICY | 模板十节形状或 delivery_type 身份违规 |
| `TEMPLATE_CONDITIONAL_INVALID` | 3 | CONTRACT_OR_POLICY | 条件块缺失、重复、嵌套或畸形 |
| `GIT_REPOSITORY_NOT_FOUND` | 4 | GIT_BASELINE | cwd 不在 git repository 内 |
| `POLICY_NOT_TRACKED` | 4 | GIT_BASELINE | policy 文件未被 git 跟踪 |
| `REPOSITORY_IDENTITY_MISMATCH` | 4 | GIT_BASELINE | origin/capsule/policy 三方 identity 不闭合 |
| `FACT_BRANCH_MISMATCH` | 4 | GIT_BASELINE | capsule baseline.branch != policy fact_branch |
| `FACT_BRANCH_INVALID` | 4 | GIT_BASELINE | fact_branch 未通过 git check-ref-format |
| `BASELINE_REF_MISSING` | 4 | GIT_BASELINE | 精确全 ref 不存在 |
| `BASELINE_HEAD_MISMATCH` | 4 | GIT_BASELINE | 精确 ref head != capsule baseline.head |
| `RENDER_INCOMPLETE` | 5 | RENDER_OR_BUDGET | canonical 输出验证失败 |
| `PROMPT_LINE_LIMIT_EXCEEDED` | 5 | RENDER_OR_BUDGET | 逻辑行数超过 Mode 硬限制 |
| `PROMPT_BYTE_LIMIT_EXCEEDED` | 5 | RENDER_OR_BUDGET | UTF-8 字节数超过 Mode 硬限制 |
| `INTERNAL_ERROR` | 5 | RENDER_OR_BUDGET | fail-closed 内部/渲染错误；不输出 backtrace |

`TEMPLATE_FILE_MISSING` 固定 exit 3。
`INTERNAL_ERROR` 固定 exit 5（fail-closed internal/render 类别）。未登记 code 的
失败一律 fail closed 到 `INTERNAL_ERROR`（exit 5）；CLI 不得有绕过 registry 的裸
exit 常量（`EXIT_OK` 除外）。

budget gate 按 logical line count 与 UTF-8 byte count 同时检查四种 Mode 的
hard limit（见第 2 节），且始终在 canonical 渲染输出上执行（第 13 节）；
`completion_report.maximum_lines` 继续验证 20-120 并原值渲染。超限分类为
`PROMPT_LINE_LIMIT_EXCEEDED` 或 `PROMPT_BYTE_LIMIT_EXCEEDED`。不得自动升级
Mode、扩大限制、声称 Token 计数或输出部分 Prompt。

## 15. 边界（PCE-01-B）

PCE-01-B 只实现 validate、compile、project policy、profile→command ID、
确定性渲染、Git named-ref 只读核验、line/UTF-8 byte budget、diagnostics 与
stdout。不实现：Token 计算、JSON、stdin、inspect、`--output`、clipboard、
网络请求、LLM、Git 写自动化、远程包发布。PCE-01-C（两个项目真实验收）、
personal knowledge base 接入、PCE-01 整体完成与 source_verified 均不属于
PCE-01-B。
