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
[result_handoff]   # 可选 role-discriminated result-handoff 契约（PRODUCE|CONSUME）
[produced_result]  # PRODUCE 专用 machine-result 输出表面（identity 绑定 + payload 槽位）
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
- result_handoff（PCE_01_BOUNDED_EXACT_RESULT_HANDOFF_G02_ROLE_OUTPUT_
  BINDING）：可选 role-discriminated 单一契约；省略时输出 byte-identical。
  PRODUCE = {role, identity, maximum_bytes, required}（无预置 payload；
  输出要求 produced_result machine surface）；CONSUME = {role,
  expected_identity, maximum_bytes, frozen_result {identity, payload}}。
  frozen_result.identity != expected_identity → `RESULT_IDENTITY_MISMATCH`；
  payload 缺失/空 → `MISSING_REQUIRED_FIELD`；超界 →
  `RESULT_PAYLOAD_OVER_BOUND`；禁止重建/hash/summary 替换；canonical
  渲染并始终受 Budget Gate 约束。CONSUME 预算记账走
  control-envelope budget projection：完整 exact payload 始终 inline
  于 stdout，普通 line/byte/proxy-token 记账仅在 structural
  projection 上执行（frozen_result.payload 值被 canonical empty
  string `""` 结构性替换，投影记账内容零字节，绝不对渲染文本
  search/replace，projection 从不输出）；control envelope 自身超限
  仍 fail closed。PRODUCE 与无 result_handoff capsule 保持
  full-output 记账，byte-identical。
- produced_result（PRODUCE 专用）：`{identity, payload}` machine-result
  输出表面；identity 预填声明的 producer identity，payload 为空槽位（Agent
  以完整非空 UTF-8 结果填充，bytesize ≤ maximum_bytes）；与 Completion
  Report metadata 分离；frozen 后 verbatim 复制进 CONSUME。

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
proxy_tokens）。CONSUME capsule 的普通预算记账在 structural
control-envelope budget projection 上执行（仅 frozen_result.payload
值被 canonical empty string `""` 替换，投影记账内容零字节，从
validated capsule 结构重建）；完整 exact payload 始终 inline 于
stdout，完整实际输出在任何预算判定前先通过 canonical output
verification。
