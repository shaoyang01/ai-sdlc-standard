# Compact Prompt Standard (v2)

## Purpose

PCE-01 是 **Compact Prompt Standard and Lightweight Renderer**。本文件定义其中的
Compact Prompt Contract v1（PCE-01-A 范围）与 Compact Execution Envelope v2
production 输出合同（PCE-01-B 范围）：

- Compact Execution Capsule v1 合同；
- 四种 Prompt Mode 及其硬限制（lines / bytes / proxy tokens）；
- PCE_UNICODE_WORDPUNCT_V1 proxy-token metric；
- 五种 Validation Profile；
- Canonical Execution Envelope v2（production 输出 schema）；
- Template Asset Contract Manifest（v2 模板资产合同）；
- Compact Completion Report 合同。

本文件只定义合同。Renderer CLI 属于 PCE-01-B；两个项目真实验收属于
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

pr_head:            # 可选（PCE_01_PR_ONLY_ZERO_DELTA_F01）：仅 zero-repository-delta
                    # + CREATE_DRAFT 必填；非零 delta 禁止携带
  branch: *         # PR head 分支名（合法 Git branch 名）
  sha: *            # 40 位小写十六进制 SHA（字符串；纯数字 sha 必须加引号）

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

### 1.5 Zero-Repository-Delta 形状（PCE_01_PR_ONLY_ZERO_DELTA_F01 / PCE_01_GENERIC_ZERO_DELTA_NO_PR_G01）

zero-repository-delta 只允许精确三重形状：`delta.required_changes: []` +
`scope.allowed_files: []` + `scope.maximum_changed_files: 0`，且
`git.commit_count: 0`、`git.push_mode: NONE`。执行形状二选一：

- `git.pull_request_action: CREATE_DRAFT`（PCE_01_PR_ONLY_ZERO_DELTA_F01，
  Draft-PR 执行）：必须提供根字段 `pr_head: {branch, sha}`；
- `git.pull_request_action: NONE`（PCE_01_GENERIC_ZERO_DELTA_NO_PR_G01，
  通用无 PR 执行）：禁止携带 `pr_head`，编译输出不渲染任何 git mutation，
  也不渲染 `VERIFY_EXACT_PR_HEAD_BEFORE_PR`。

- 空 `required_changes` 但 `allowed_files` 非空或 `maximum_changed_files`
  为正 → 分类为 `MISSING_REQUIRED_FIELD`（不得只空 changes 却保留 scope）；
- 非 zero-delta 的 `maximum_changed_files` 保持正整数要求（`0` 仅
  zero-delta 三重形状允许）；zero-delta 的 `maximum_changed_files` 必须精确
  为 `0`；
- zero-delta 的 git 必须为 `commit_count: 0`、`push_mode: NONE` 且
  `pull_request_action` 为 `CREATE_DRAFT` 或 `NONE`（zero-delta 只表达
  Draft-PR 或通用无 PR 执行；任何其他组合 → `FIELD_TYPE_INVALID`）；
- zero-delta + CREATE_DRAFT 必须提供根字段 `pr_head: {branch, sha}`，
  缺失 → `MISSING_REQUIRED_FIELD`；`branch` 必须是非空合法 Git branch 名，
  `sha` 必须是字符串形式的 40 位小写十六进制（纯数字 sha 未加引号会被
  YAML 解析为整数 → `FIELD_TYPE_INVALID`；非字符串 → `FIELD_TYPE_INVALID`；
  非 40 位十六进制 → `INVALID_SHA`）；
- zero-delta + NONE 携带 `pr_head` → 分类为 `FIELD_TYPE_INVALID`（G01 无 PR
  形状禁止 PR-head 声明）；非 zero-delta capsule 携带 `pr_head` →
  分类为 `FIELD_TYPE_INVALID`（nonzero-delta PR head 由 implementation
  分支派生，不接受 contract 声明）；
- baseline 保持 exact PR base：`baseline.head` 仍是 PR 的 base（fact
  branch exact HEAD），`pr_head.sha` 是 PR head 的 canonical exact identity。

### 1.6 Bounded Exact Result Handoff（PCE_01_BOUNDED_EXACT_RESULT_HANDOFF_G02_ROLE_OUTPUT_BINDING）

可选单一 `result_handoff` 根契约（role-discriminated，不引入平行机制；现有
capsule 省略它时编译输出 byte-identical）。`role` 必须为 `PRODUCE` 或
`CONSUME`。

**PRODUCE**（producer 输入，无预置结果）：

```yaml
result_handoff:
  role: PRODUCE
  identity: "<stable-producer-identity>"   # 非空字符串
  maximum_bytes: <positive-integer>        # 有限字节上界
  required: true                           # 必须为 true
```

- PRODUCE 输入**不得**携带预置 payload / frozen_result（exact key 集之外的
  键 → `UNKNOWN_KEY`）；`required` 非 true → `FIELD_TYPE_INVALID`；
- 编译后 Agent-visible Envelope 必须显式要求一个专用 machine-result 输出
  表面 `produced_result: {identity, payload}`：`identity` 预填为声明的
  producer identity，`payload` 为待产生槽位（Agent 必须以完整非空 UTF-8
  结果填充，bytesize ≤ `maximum_bytes`）；
- `produced_result` 与 Completion Report metadata 分离：不得把
  `change_summary` / `remaining_findings` / prose 当作 payload；不得用
  聊天记忆、repository 文件、hash/摘要或 Agent 重建作为结果传递；
- PRODUCE 输出契约：`produced_result.identity` 必须等于声明的 producer
  identity；required 输出缺失、identity 不匹配或超界输出均为
  non-conformant，MUST STOP handoff（由执行侧校验，不落入既有 Prompt
  Budget Gate 之外）。

**CONSUME**（consumer 输入，携带 frozen 结果）：

```yaml
result_handoff:
  role: CONSUME
  expected_identity: "<stable-identity>"
  maximum_bytes: <positive-integer>
  frozen_result:
    identity: "<stable-identity>"          # 必须等于 expected_identity
    payload: "<exact-frozen-payload>"      # 完整 frozen 字节
```

- `frozen_result.identity` 必须等于 `expected_identity`，否则 →
  `RESULT_IDENTITY_MISMATCH`（exit 3，`CONTRACT_OR_POLICY`）fail closed；
- payload 缺失/空 → `MISSING_REQUIRED_FIELD`；payload 字节数超过
  `maximum_bytes` → `RESULT_PAYLOAD_OVER_BOUND` fail closed；
- 禁止任何 reconstruction / hash / summary 替换：CONSUME 必须携带完整
  frozen payload，不得要求 Agent 重建。

**CONSUME control-envelope budget projection**（预算记账口径）：canonical
输出始终在 stdout 完整 inline 携带 exact `frozen_result.payload`（不得
截断、摘要、hash 替换、改道或重建）；只有普通 line/byte/proxy-token
预算记账在 deterministic structural control-envelope projection 上
执行——该 projection 从 validated capsule 结构重建，唯一改动是把
`frozen_result.payload` 值替换为固定哨兵
`PCE_CONTROL_ENVELOPE_PROJECTION`，再经同一 canonical builder 序列化；
绝不对渲染文本做 search/replace，也从不写入 stdout。完整实际输出仍在
任何预算判定前通过 canonical output verification；projection 上的
line/byte/proxy-token 超限依然 fail closed（普通 Prompt Mode 预算不被
禁用或扩大）；`maximum_bytes`、identity equality、UTF-8 与 over-bound
fail-closed 语义不变。PRODUCE 与不携带 `result_handoff` 的 capsule
保持既有 full-output 记账，编译输出 byte-identical。

**跨检查点绑定**：human checkpoint 只 freeze/select 精确的
`produced_result`；PCE 不实现 persistence / workflow；frozen
`produced_result` 必须可 verbatim 复制进后续 CONSUME 契约，无需 Agent
重建。两形状都保持 canonical 渲染；预算记账按上述口径（CONSUME 走
control-envelope projection，其余形状走完整 verified 输出）。

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

公共合同精确定义（v2：line limits 保持为 secondary safety signal；byte caps
替换为 compact-envelope caps；新增 PCE_UNICODE_WORDPUNCT_V1 proxy-token cap）：

| Prompt Mode | hard_limit_lines | hard_limit_bytes | hard_limit_proxy_tokens |
| --- | --- | --- | --- |
| `MICRO_FIX` | 120 | 2048 | 512 |
| `SESSION_CONTINUATION` | 220 | 4096 | 1024 |
| `BOOTSTRAP` | 400 | 8192 | 2048 |
| `RECOVERY` | 400 | 8192 | 2048 |

Budget gate 顺序固定（在 canonical output verification 之后）：

```text
canonical output verification
→ line gate
→ byte gate
→ proxy-token gate
→ stdout
```

CONSUME capsule 的普通预算记账在 deterministic structural
control-envelope projection（第 1.6 节）上执行：完整 exact payload
始终 inline 于 stdout，仅其值不参与 line/byte/proxy-token 计量；
control envelope 自身的超限仍按上述固定顺序 fail closed。其余形状
（PRODUCE、无 result_handoff）在完整 verified 输出上记账，不变。

超限规则（按顺序执行）：

```text
删除重复历史
→ closed findings 压缩为 ID:CLOSED
→ 仍超限则 TASK_SPLIT_REQUIRED
```

禁止：

- silent pass / 自动删除约束 / 自动升级模式 / numeric waiver；
- 声称进行了精确 Token 计算（proxy metric 不是 model-exact token count）。

### PCE_UNICODE_WORDPUNCT_V1 proxy-token metric

`PCE_UNICODE_WORDPUNCT_V1` 是 deterministic proxy metric，**不是**
model-exact token count。无 Unicode normalization。在 valid UTF-8 canonical
output 上，语义等价于扫描：

```text
/[\p{Han}\p{Hiragana}\p{Katakana}\p{Hangul}]|[\p{L}\p{M}\p{N}_]+|[^\p{Space}]/u
```

语义（fixture-locked，case 表是 authority）：

```text
Han/Hiragana/Katakana/Hangul:
  each code point = 1

other Unicode letter/mark/number/underscore:
  contiguous run = 1

all other non-whitespace code points:
  each = 1

whitespace:
  0
```

实现注意：Onigmo 的 `\p{L}` 包含 Han/Hiragana/Katakana/Hangul，直接 alternation
扫描会把 Han 字符并入相邻字母 run（如 "A中B" 得 1 而非 3）。实现先把 CJK 码点
切分出来，再对剩余片段扫描 letter-run alternation，从而精确满足冻结语义。

fixture-locked cases（validator 必须逐条断言）：

```yaml
cases:
  "abc def": 2
  "abc_def123": 1
  "中文": 2
  "A中B": 3
  "a-b": 3
  "你好，world!": 5
  "e\u0301": 1
  "🙂": 1
  " \n\t": 0
  "<x>": 3
```

不得引入 tokenizer gem、网络或 model dependency。

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

补充 code 信号（PCE-MR3-M4E4-REVIEW-01）：对无扩展名的
`delta.required_changes` 路径，当且仅当该路径已存在于 exact
`baseline.head` 的 Git 树中且树条目为 `100755` blob 时，分类为代码类：

```text
code: 已知代码扩展名
      或（无扩展名 required_change 且 exact baseline.head 树条目 == 100755 blob）
```

约束：

- 无扩展名路径在纯 Capsule 阶段不提前判为 non-code；其 code/non-code
  结果影响 Profile applicability 时延后到 exact Git baseline 证据后再判定；
- brand-new 无扩展名新增（baseline 树中不存在该条目）不产生 code 信号；
- 无扩展名 `100644` blob 不产生 code 信号；
- symlink（`120000`）、gitlink（`160000`）、tree 等非 blob 条目不产生
  code 信号；
- code 信号 authority 只有 Capsule `baseline.head` 的 exact commit 树；
  working-tree 权限位、当前 checkout、隐式 HEAD 或文件名猜测均不是
  authority。

项目级 profile 映射（真实命令解析）属于 PCE-01-B，不在本文件定义。

## 4. Continuation 与 Findings

- continuation 只携带当前 delta：不含上一轮完整 Prompt、完整 stdout/stderr 或
  完整历史讨论。
- closed finding 只保留 `id` 和 `CLOSED` 状态；历史正文不得进入 Capsule。
- finding 条目只有 `id` 与 `status` 两个字段；详情属于 delta 正文。

## 5. Canonical Execution Envelope v2

production 输出 schema 冻结为 `compact-execution-envelope-v2`。输出必须是
**单一 canonical YAML document text**，不得包含：

```text
Markdown section headings
十节固定 prose
WHEN/ENDWHEN comments
production placeholder interpolation
解释每个字段用途的自然语言段落
```

固定原则：

```yaml
canonical_output:
  valid_UTF8: true
  CR: forbidden
  document_marker: omitted
  comments: forbidden
  indent: 2_spaces
  trailing_LF: exactly_one
  deterministic_key_order: true
```

不得直接依赖 `YAML.dump` 的版本相关 formatting 作为 byte authority；复用
现有 safe scalar encoding 并由代码显式 canonical serialize。

### 5.1 Canonical shape

顶层 key 顺序固定：

```text
delivery_type
schema
recipient
paste_location
purpose            # 唯一目标，只表达一次（来自 Capsule objective）
report_back_to
next_hop_after_report
baseline           # repository / branch / head / [pull_request 仅正整数]
changes            # required_changes
[scope_extra | allowed_files]   # scope derivation，二者互斥
max_changed_files
accept             # acceptance criteria
[open_findings]    # 非空才输出，仅 id 列表
[closed_findings]  # 非空才输出，仅 id 列表
validation         # profile / run / [forbid 仅非空]
[git]              # positive-action allowlist，三 NONE 时整体省略
rules              # 12 个 stable rule codes，固定列表
[forbidden]        # task-specific prohibitions（去重、剔除与 stable code 相同的项）
report             # max_lines / fields
completion_report_recipient
completion_report_name
stop_after_report: true
```

示例形状（字段 contract，不是要求所有 optional key 永远输出）：

```yaml
delivery_type: CODEX_EXECUTION_PROMPT
schema: compact-execution-envelope-v2
recipient: "<routing.recipient 的值>"
baseline:
  repository: "<baseline.repository>"
  branch: "<baseline.branch>"
  head: "<baseline.head>"
validation:
  profile: GLOBAL_CONTRACT
  run:
    - "<resolved command argv>"
git:
  commit: 1
  message: "<commit message>"
  branch: DERIVE_FROM_FACT_BRANCH
  push: NORMAL_PUSH
rules:
  - FETCH_VERIFY_EXACT_BASE
  - VERIFY_WORKTREE_SAFE
  - NO_AMEND
  - NO_REBASE
  - NO_SQUASH
  - NO_FORCE_PUSH
  - NO_DIRECT_FACT_BRANCH_WRITE
  - NO_READY
  - NO_MERGE
  - NO_AUTO_MERGE
  - NO_PUBLICATION
  - STOP_ON_SCOPE_EXPANSION
report:
  max_lines: 80
  fields: [result, pre_HEAD, post_HEAD, commit, changed_files, change_summary,
           local_validation, remote_branch_HEAD, pull_request, CI_status,
           scope_violation, remaining_findings]
completion_report_recipient: "<completion_report.recipient>"
completion_report_name: "<completion_report.name>"
stop_after_report: true
```

### 5.2 Omission / Derivation 规则

- **Objective**：Capsule `objective` 只进入 `purpose` 一次；不得再有第二个
  `objective:` / `goal:` / 唯一目标副本。
- **Pull Request Baseline**：`baseline.pull_request == "none"` 时省略
  `baseline.pull_request`；正整数时渲染。
- **Findings**：空数组省略；非空渲染 id 列表，状态由 key 派生
  （`open_findings` / `closed_findings`），不重复输出 `OPEN/CLOSED`。
- **required_changes / allowed_files**：
  - 两个数组精确相同 → 只渲染 `changes`；
  - 两者元素唯一 且 `allowed_files` 是 `required_changes` 的严格 superset →
    `changes` + `scope_extra`（extras 保持 `allowed_files` 顺序筛选）；
  - 无法安全证明上述 derivation → `changes` + 完整 `allowed_files`；
  - 不得为了压缩丢失 scope。`max_changed_files` 保留。
- **Validation**：总是输出 `profile` 与 `run`；只有 forbidden command 列表
  非空时输出 `validation.forbid`，空列表不渲染 `none`。
- **Git**：git map 是 positive-action allowlist。
  - `commit_count == 1` → `commit: 1` + `message`；
  - `commit_count == 0` → 省略 commit + message；
  - `push_mode == NORMAL_PUSH` → `branch: DERIVE_FROM_FACT_BRANCH` +
    `push: NORMAL_PUSH`；`NONE` → 省略 push；
  - `CREATE_DRAFT` → `pr: CREATE_DRAFT` + `pr_base: FACT_BRANCH`；
  - `UPDATE_DRAFT` → `pr: UPDATE_DRAFT`；`NONE` → 省略 pr；
  - 保留 CREATE/UPDATE 与 `baseline.pull_request` 的合法关系：
    `CREATE_DRAFT` 要求 `baseline.pull_request=none`；`UPDATE_DRAFT` 要求其为
    正整数；冲突时 fail closed（`GIT_ACTION_CONFLICT`）。
- **Zero-Delta PR-Head**（PCE_01_PR_ONLY_ZERO_DELTA_F01）：zero-delta
  CREATE_DRAFT 形状在 `git` 块内额外渲染 `pr_head: {branch, sha}`
  （canonical exact PR-head identity）；`changes: []` 与
  `max_changed_files: 0` 渲染为零 delta 形状；baseline 保持 exact PR base。
  非零 delta 不渲染 `pr_head`。

### 5.3 Stable Rules + Task Prohibitions

v2 不再发送长 Git safety prose。固定 concise rule codes（agent-visible 输出
只发送 codes；stable semantics 如下）：

| code | stable semantics |
| --- | --- |
| `FETCH_VERIFY_EXACT_BASE` | 开始前获取远端 refs 并核验 exact base，drift 即停止 |
| `VERIFY_WORKTREE_SAFE` | 核验工作树无可冲突 tracked/staged 修改，不 reset/stash/clean |
| `NO_AMEND` | 禁止 amend |
| `NO_REBASE` | 禁止 rebase（不得 rebase 到新 Source） |
| `NO_SQUASH` | 禁止 squash |
| `NO_FORCE_PUSH` | 禁止 force push / force-with-lease |
| `NO_DIRECT_FACT_BRANCH_WRITE` | 禁止直接写 fact branch |
| `NO_READY` | 禁止将 PR 标记为 Ready |
| `NO_MERGE` | 禁止 merge |
| `NO_AUTO_MERGE` | 禁止 auto-merge |
| `NO_PUBLICATION` | 禁止 publication |
| `STOP_ON_SCOPE_EXPANSION` | scope 扩张时停止，不得自行扩 scope |

### Conditional Execution-Time Rule（EXECUTION_TIME_PR_HEAD_DRIFT_STOP）

`VERIFY_EXACT_PR_HEAD_BEFORE_PR` 是 **conditional** Agent-visible rule code：
仅 zero-repository-delta + `pull_request_action: CREATE_DRAFT` 时出现在
envelope 的 `rules` 列表中（追加在 12 个 stable codes 之后）；普通非零 delta
输出绝不包含它。

Authoritative semantics（mutation-time drift-stop）：

```text
immediately before CREATE_DRAFT:
  fetch authoritative refs
  → reverify exact base (baseline.head / fact branch local+origin refs)
  → reverify refs/heads/<pr_head.branch> and
    refs/remotes/origin/<pr_head.branch> against git.pr_head.sha
  → missing or drift: STOP（不执行 CREATE_DRAFT）
  → CREATE_DRAFT only after all checks PASS
```

两层分离（不得混为一谈）：

- **compile-time layer**：`GitBaseline.check` 的 repository-aware PR-head
  exact-ref gate（`PR_HEAD_REF_MISSING` / `PR_HEAD_SHA_MISMATCH`，exit 4）
  是 renderer 编译/渲染前的校验，属于本标准 §12；它保证
  canonical envelope 不会携带 stale PR-head identity。
- **mutation-time layer**：`VERIFY_EXACT_PR_HEAD_BEFORE_PR` 指示执行方
  Agent 在真正执行 `CREATE_DRAFT` 动作前重新 fetch/reverify 权威 refs；
  它不是 compile-time 校验的描述，compile-time 校验也不代表 mutation-time
  已执行。

Capsule `forbidden_actions`：

- 必须保留 material task-specific semantics；
- exact duplicate 只保留第一项；
- 与 exact stable rule code 相同时不重复（stable codes 已在 `rules`）；
- 不做 fuzzy NLP / 猜测式 semantic deletion——不得因为某 task prohibition
  "看起来像" stable rule 就删除它。

## 6. Template Asset Contract Manifest

`templates/compact-codex-prompt-template.md` 不再是 production placeholder
interpolation source；它是 `compact-execution-envelope-v2` 的 contract
manifest 与 human-readable canonical shape reference。资产必须满足：

```yaml
template_asset:
  schema_marker: compact-execution-envelope-v2
  production_placeholders: 0
  WHEN_ENDWHEN_blocks: 0
  fixed_10_section_contract: false
```

CLI validate、CLI compile 与 contract validator 共享同一个 fail-closed gate
（`Template.contract_manifest_error`）：

- 必须声明 schema marker `compact-execution-envelope-v2`；
- 必须含零 production placeholder（无 `<...>` token）；
- 必须含零 WHEN/ENDWHEN block（无 `<!-- WHEN` / `<!-- ENDWHEN`）；
- 不得声明固定十节合同（无 `## N. ` 编号 headings）。

违规统一为 `TEMPLATE_CONTRACT_INVALID`（exit 3，CONTRACT_OR_POLICY）。
Renderer 必须直接从 normalized IR 构造 canonical output，不使用资产中的
任何模板文本。

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
- 精确 Token 计算（PCE_UNICODE_WORDPUNCT_V1 是 deterministic proxy metric）；
- 个人知识库接入（属于后续阶段）；
- PCE-01 已完成、PCE-01 source_verified、GRP-01 已启动、D10-B 已恢复或
  PCE-01-B 命令已经存在。

## 10. CLI 合同（PCE-01-B）

Renderer 以 `ruby scripts/ai-sdlc-prompt.rb` 提供，只接受两个 subcommand：

- `validate <capsule.yaml>`：执行 Capsule、project policy、template asset
  contract manifest 与 Git baseline preflight，不渲染 Prompt；成功时 stdout
  精确输出 `compact execution capsule valid`（单行、LF 结尾），stderr 为空，
  exit 0。
- `compile <capsule.yaml>`：复用 preflight，再渲染 canonical
  compact-execution-envelope-v2 YAML 并执行 budget gate；成功时 stdout 仅输出
  最终一份 envelope，stderr 为空，exit 0。

Capsule 路径按 cwd 解析；target repository 为 cwd 所属 Git root；policy 固定
读取 `<git-root>/.ai-sdlc/prompt-policy.yaml`。

任意失败：stdout 为空，stderr 仅稳定 diagnostics（见第 14 节），不得输出
backtrace 或部分 Prompt。exit codes：

| exit | 类别 | 覆盖 |
| --- | --- | --- |
| 0 | success | validate / compile 成功 |
| 2 | CLI_OR_INPUT | 参数错误、文件缺失、编码无效 |
| 3 | CONTRACT_OR_POLICY | Capsule 合同违规、policy 违规、模板资产违规 |
| 4 | GIT_BASELINE | Git 仓库、origin 身份、fact branch、named ref 核验失败 |
| 5 | RENDER_OR_BUDGET | 渲染不完整、行数/字节/proxy-token 超限 |

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
7. Zero-delta Draft-PR head binding（PCE_01_PR_ONLY_ZERO_DELTA_F01_HEAD_BINDING）：
   仅当 Capsule 为 zero-repository-delta 且 `pull_request_action ==
   CREATE_DRAFT` 时，额外要求 `refs/heads/<pr_head.branch>` 与
   `refs/remotes/origin/<pr_head.branch>` 均经 exact full-ref 查找并精确
   等于 `pr_head.sha`；任一缺失为 `PR_HEAD_REF_MISSING`，不一致为
   `PR_HEAD_SHA_MISMATCH`（均为 exit 4，GIT_BASELINE）。这是
   conditional execution-time drift-stop：validate preflight 与 compile
   渲染前 reverify 都执行；drift/deletion 意味着 STOP，绝不输出 stale
   PR-head identity。

不得要求当前 checkout branch 等于事实分支；current checkout 与 current HEAD
均不是 baseline authority。remote-tracking ref 仅代表上游预先 fetch 后的本地
缓存，不得声称在线确认 GitHub 最新 HEAD（`git_fetch_performed=false`、
`live_GitHub_HEAD_guaranteed=false`）。禁止 checkout、branch、update-ref、
reset、rebase、commit、push 或 PR 操作。

## 13. Renderer（PCE-01-B，v2）

v2 production renderer 直接从 normalized execution IR（validated Capsule +
project policy + resolved profile mapping）构造**单一** canonical
`compact-execution-envelope-v2` YAML document。以下全部退休、不得长期保留：

```text
render_v1 / render_v2 双实现
feature flag
legacy production fallback
固定十节 Markdown production 渲染
placeholder interpolation production 路径
```

只存在一个 production renderer。模板资产（第 6 节）只作为 contract
manifest 被读取与验证，不参与输出构造。

canonical serialization 规则：

- 显式按固定 key 顺序构造（deterministic key order），2 空格缩进、LF 行尾、
  恰好一个末尾 LF；`YAML.dump` 的版本相关 formatting 不是 byte authority；
- 固定 contract 值（`delivery_type`、`schema`、枚举、rule codes、report
  fields）渲染为 plain scalar；
- 每个 Capsule/Policy 用户字符串（routing、purpose、baseline 值、路径、
  findings id、acceptance、command argv、forbidden 等）先通过确定性 YAML
  双引号 scalar 编码：反斜杠、双引号、CR、LF、tab、NUL 及其他控制字符编为
  YAML 转义（`\\` `\"` `\r` `\n` `\t` `\0` `\xNN`），`<` / `>` 编为
  `\u003C` / `\u003E`，整数与 boolean 保持 YAML 原生类型（bare），字符串
  `"none"` 保持带引号（不得解析为 null）。所有编码保留语义、不静默删除任何
  字符；注入的第二 `delivery_type`、schema、key、heading、占位符样文本、
  WHEN/ENDWHEN 样文本或 CR 字节无法形成。

输出前验证（canonical output verifier），fail closed：有效 UTF-8；不含 CR；
任意 `^delivery_type:` 恰好一行且值为 `CODEX_EXECUTION_PROMPT`；恰好一行
`schema: compact-execution-envelope-v2`；零 legacy 十节 headings；零
placeholder-like / marker-like token；恰好一个末尾 LF；整份输出必须是单一
restricted-YAML document 且顶层 key 顺序 canonical。budget gate（第 2 节：
line → byte → proxy-token）在此验证之后执行（CONSUME 的记账输入为第 1.6
节定义的 control-envelope projection；完整输出在任何预算判定前已验证），
然后才写 stdout。

相同 Capsule、policy 与 Standard Package bytes 必须 byte-identical
（deterministic）；输出不含时间、用户、主机或随机值。

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
| `RESULT_PAYLOAD_OVER_BOUND` | 3 | CONTRACT_OR_POLICY | result_handoff payload 字节数超过 maximum_bytes |
| `RESULT_IDENTITY_MISMATCH` | 3 | CONTRACT_OR_POLICY | result_handoff frozen/declared identity 与 expected identity 不一致 |
| `POLICY_FILE_MISSING` | 3 | CONTRACT_OR_POLICY | git root 下找不到 policy 文件 |
| `POLICY_SCHEMA_INVALID` | 3 | CONTRACT_OR_POLICY | policy schema、键、类型或枚举违规 |
| `POLICY_PROFILE_MAPPING_MISSING` | 3 | CONTRACT_OR_POLICY | profile 映射缺失或 required 为空 |
| `POLICY_COMMAND_ID_UNKNOWN` | 3 | CONTRACT_OR_POLICY | 命令 ID 未在 commands 登记 |
| `POLICY_COMMAND_CONFLICT` | 3 | CONTRACT_OR_POLICY | 重复或 required/forbidden 交集 |
| `VALIDATION_PROFILE_UNSUPPORTED` | 3 | CONTRACT_OR_POLICY | Capsule 选择的 Validation Profile 未被 project policy 声明 |
| `DOC_ONLY_ROOT_NPM_TEST_FORBIDDEN` | 3 | CONTRACT_OR_POLICY | DOC_ONLY 不得要求根 npm test |
| `TEMPLATE_FILE_MISSING` | 3 | CONTRACT_OR_POLICY | 找不到 prompt 模板文件 |
| `TEMPLATE_CONTRACT_INVALID` | 3 | CONTRACT_OR_POLICY | 模板资产违反 v2 contract manifest |
| `GIT_ACTION_CONFLICT` | 3 | CONTRACT_OR_POLICY | git.pull_request_action 与 baseline.pull_request 冲突 |
| `GIT_REPOSITORY_NOT_FOUND` | 4 | GIT_BASELINE | cwd 不在 git repository 内 |
| `POLICY_NOT_TRACKED` | 4 | GIT_BASELINE | policy 文件未被 git 跟踪 |
| `REPOSITORY_IDENTITY_MISMATCH` | 4 | GIT_BASELINE | origin/capsule/policy 三方 identity 不闭合 |
| `FACT_BRANCH_MISMATCH` | 4 | GIT_BASELINE | capsule baseline.branch != policy fact_branch |
| `FACT_BRANCH_INVALID` | 4 | GIT_BASELINE | fact_branch 未通过 git check-ref-format |
| `BASELINE_REF_MISSING` | 4 | GIT_BASELINE | 精确全 ref 不存在 |
| `BASELINE_HEAD_MISMATCH` | 4 | GIT_BASELINE | 精确 ref head != capsule baseline.head |
| `PR_HEAD_REF_MISSING` | 4 | GIT_BASELINE | zero-delta PR-head 精确 ref 不存在 |
| `PR_HEAD_SHA_MISMATCH` | 4 | GIT_BASELINE | zero-delta PR-head 精确 ref head != pr_head.sha |
| `RENDER_INCOMPLETE` | 5 | RENDER_OR_BUDGET | canonical 输出验证失败 |
| `PROMPT_LINE_LIMIT_EXCEEDED` | 5 | RENDER_OR_BUDGET | 逻辑行数超过 Mode 硬限制 |
| `PROMPT_BYTE_LIMIT_EXCEEDED` | 5 | RENDER_OR_BUDGET | UTF-8 字节数超过 Mode 硬限制 |
| `PROMPT_PROXY_TOKEN_LIMIT_EXCEEDED` | 5 | RENDER_OR_BUDGET | PCE_UNICODE_WORDPUNCT_V1 proxy-token 数超过 Mode 硬限制 |
| `INTERNAL_ERROR` | 5 | RENDER_OR_BUDGET | fail-closed 内部/渲染错误；不输出 backtrace |

`TEMPLATE_FILE_MISSING` 固定 exit 3。
`INTERNAL_ERROR` 固定 exit 5（fail-closed internal/render 类别）。未登记 code 的
失败一律 fail closed 到 `INTERNAL_ERROR`（exit 5）；CLI 不得有绕过 registry 的裸
exit 常量（`EXIT_OK` 除外）。

budget gate 按固定顺序在 verified canonical 输出上执行（第 2 节）：
logical line count → UTF-8 byte count → PCE_UNICODE_WORDPUNCT_V1 proxy-token
count。CONSUME capsule 的记账输入是 deterministic structural
control-envelope projection（第 1.6 节：仅 `frozen_result.payload` 值被
固定哨兵替换，从 validated capsule 结构重建，绝不对渲染文本
search/replace）；完整 exact payload 仍始终 inline 于 stdout。超限分类为
`PROMPT_LINE_LIMIT_EXCEEDED`、`PROMPT_BYTE_LIMIT_EXCEEDED` 或
`PROMPT_PROXY_TOKEN_LIMIT_EXCEEDED`。不得
自动升级 Mode、扩大限制、声称精确 Token 计数、silent pass、自动删除约束或
输出部分 Prompt。

## 15. 边界（PCE-01-B）

PCE-01-B 只实现 validate、compile、project policy、profile→command ID、
确定性 v2 renderer（canonical YAML envelope）、Git named-ref 只读核验、
line/byte/proxy-token budget、diagnostics 与 stdout。不实现：model-exact
Token 计算、JSON、stdin、inspect、`--output`、clipboard、网络请求、LLM、
Git 写自动化、远程包发布。PCE-01-C（两个项目真实验收）、personal
knowledge base 接入、PCE-01 整体完成与 source_verified 均不属于 PCE-01-B。
