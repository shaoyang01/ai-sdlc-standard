# Compact Codex Prompt Template — Execution Envelope v2 Contract Manifest

> 本资产是 `compact-execution-envelope-v2` 的 contract manifest 与
> human-readable canonical shape reference。
>
> 它不是 production placeholder interpolation source：production renderer
> 直接从 normalized execution IR（validated Capsule + project policy +
> resolved profile mapping）构造单一 canonical compact YAML document。
>
> 本资产不含 production placeholder、WHEN/ENDWHEN 块，也不声明固定十节
> Markdown 合同（fixed_10_section_contract: false）。

## Contract Manifest Properties

```yaml
schema_marker: compact-execution-envelope-v2
production_placeholders: 0
WHEN_ENDWHEN_blocks: 0
fixed_10_section_contract: false
```

## Canonical Shape（顶层 key 顺序固定）

单一 canonical YAML document text，2 空格缩进、LF 行尾、恰好一个末尾 LF、
deterministic key order、无注释、无 document marker。

```yaml
delivery_type: CODEX_EXECUTION_PROMPT
schema: compact-execution-envelope-v2
recipient: routing.recipient 的值（示例：Codex）
```

顶层顺序：

```text
delivery_type
schema
recipient
paste_location
purpose            # 唯一目标，只表达一次（来自 Capsule objective）
report_back_to
next_hop_after_report
baseline           # repository / branch / head / [pull_request 仅正整数]
changes            # required_changes；zero-delta 形状渲染为 []
[scope_extra | allowed_files]   # scope derivation，二者互斥
max_changed_files
accept             # acceptance criteria
[open_findings]    # 非空才输出，仅 id 列表
[closed_findings]  # 非空才输出，仅 id 列表
validation         # profile / run / [forbid 仅非空]
[git]              # positive-action allowlist，三 NONE 时整体省略
[result_handoff]   # 可选单一 bounded exact result-handoff 契约（G02）
rules              # 12 个 stable rule codes，固定列表
[forbidden]        # task-specific prohibitions（去重、剔除与 stable code 相同的项）
report             # max_lines / fields
completion_report_recipient
completion_report_name
stop_after_report: true
```

## Zero-Repository-Delta Shape（PCE_01_PR_ONLY_ZERO_DELTA_F01 / PCE_01_GENERIC_ZERO_DELTA_NO_PR_G01）

零仓库 delta 执行只允许精确三重形状：`required_changes: []` +
`allowed_files: []` + `maximum_changed_files: 0`，且 git 为
`commit_count: 0` / `push_mode: NONE`。执行形状二选一：

- `pull_request_action: CREATE_DRAFT`（F01）：canonical envelope 渲染：

```yaml
changes: []
max_changed_files: 0
...
git:
  pr: CREATE_DRAFT
  pr_base: FACT_BRANCH
  pr_head:            # canonical exact PR-head identity
    branch: "pr-head-branch 的值（示例：codex/pce-zero-delta-draft）"
    sha: "40-char-lowercase-hex-sha 的值（字符串，纯数字必须加引号）"
```

- `pull_request_action: NONE`（G01，generic zero-delta no-PR）：禁止
  `pr_head`，整个 git mapping 省略，rules 不包含
  `VERIFY_EXACT_PR_HEAD_BEFORE_PR`。

`pr_head` 是可选根字段 `{branch, sha}`：仅 zero-delta + CREATE_DRAFT 必填；
zero-delta + NONE 或非零 delta 携带 `pr_head` 会被拒绝；baseline 保持 exact
PR base。

### Repository-Aware PR-Head Binding（PCE_01_PR_ONLY_ZERO_DELTA_F01_HEAD_BINDING）

zero-delta + CREATE_DRAFT 时，`pr_head.sha` 不是自由声明值：validate
preflight 与 compile 渲染前都要求 `refs/heads/pr_head.branch` 与
`refs/remotes/origin/pr_head.branch` 两个 exact full ref 均等于
`pr_head.sha`。缺失 → `PR_HEAD_REF_MISSING`；不一致 → `PR_HEAD_SHA_MISMATCH`
（exit 4，GIT_BASELINE）。drift/deletion 意味着 STOP，绝不输出 stale
PR-head identity。

## Omission / Derivation 规则（摘要）

- `baseline.pull_request`：`none` 省略；正整数渲染。
- findings：空数组省略；非空渲染 id 列表，状态由 key 派生（open/closed），
  不重复输出 OPEN/CLOSED。
- scope：required_changes 与 allowed_files 精确相同 → 只渲染 changes；
  两者元素唯一且 allowed_files 是 required_changes 的严格 superset →
  changes + scope_extra（extras 保持 allowed_files 顺序）；否则 →
  changes + 完整 allowed_files。不得为了压缩丢失 scope。
- `validation.forbid`：仅 forbidden command 列表非空时输出。
- git：`commit: 1` / `message` 仅 commit_count == 1；`branch:
  DERIVE_FROM_FACT_BRANCH` / `push: NORMAL_PUSH` 仅 NORMAL_PUSH；
  `pr: CREATE_DRAFT` + `pr_base: FACT_BRANCH` 仅 CREATE_DRAFT；
  `pr: UPDATE_DRAFT` 仅 UPDATE_DRAFT；commit_count == 0 且 push_mode == NONE
  且 PR action == NONE 时整个 git mapping 省略。
- forbidden：Capsule forbidden_actions 的 exact duplicate 只保留第一项；
  与 stable rule code 完全相同的项不重复；不做 fuzzy NLP 删除。
- pr_head（PCE_01_PR_ONLY_ZERO_DELTA_F01）：仅 zero-delta + CREATE_DRAFT
  必填，渲染 `git.pr_head.branch` 与 `git.pr_head.sha`（canonical exact
  PR-head identity）；zero-delta + NONE 与非零 delta 携带 pr_head 被拒绝。
- result_handoff（PCE_01_BOUNDED_EXACT_RESULT_HANDOFF_G02）：可选单一契约
  `{identity, maximum_bytes, required, payload}`；省略时输出 byte-identical。
  payload 为完整 frozen 字节且 bytesize ≤ maximum_bytes；缺失 payload/
  identity、超界（`RESULT_PAYLOAD_OVER_BOUND`）、或任何重建要求 fail
  closed；canonical 渲染并始终受 Budget Gate 约束。

## Stable Rules（12 codes，固定列表）

```text
FETCH_VERIFY_EXACT_BASE
VERIFY_WORKTREE_SAFE
NO_AMEND
NO_REBASE
NO_SQUASH
NO_FORCE_PUSH
NO_DIRECT_FACT_BRANCH_WRITE
NO_READY
NO_MERGE
NO_AUTO_MERGE
NO_PUBLICATION
STOP_ON_SCOPE_EXPANSION
```

## Budget Gate（顺序固定）

```text
canonical output verification
→ line gate
→ byte gate
→ PCE_UNICODE_WORDPUNCT_V1 proxy-token gate
→ stdout
```

四种 Prompt Mode 的 hard limits 见标准第 2 节（lines / bytes /
proxy_tokens）。
