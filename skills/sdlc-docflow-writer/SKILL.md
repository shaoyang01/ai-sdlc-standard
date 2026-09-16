---
name: sdlc-docflow-writer
description: |
  This skill should be used when the user asks to "生成技术文档", "生成html技术文档", "生成markdown技术方案", "生成飞书文档", "生成方案审核", "生成代码审核报告", "整理测试反馈成文档", "输出实现记录", or asks to create Markdown, HTML, or Lark/Feishu documents for DocFlow artifacts.
version: 0.1.0
---

# DocFlow Writer

## Purpose

Generate DocFlow-aligned documents from user intent. Determine the artifact node, output format, requirement ID, and target path before writing or publishing.

Support three output targets:

- Markdown file
- HTML file
- Lark/Feishu online document through `lark-cli` user identity

## Canonical 当前文件表（contract §3.1——写入前必须命中其一）

| 节点 / binding | canonical 当前文件 |
| --- | --- |
| requirement-intake | `00-需求资料/{id}_需求摘要.md` |
| solution-design | `01-技术方案/{id}_技术方案.md` |
| solution-gate / adversarial_scan | `02-方案审核/{id}_方案审核问题台账.md` |
| solution-gate / formal_verdict | `02-方案审核/{id}_方案审核.md` |
| task-planning | `03-任务规划/{id}_任务计划.md` |
| implementation | `04-实现记录/{id}_实现记录.md` |
| code-review | `05-代码审核/{id}_代码审核.md` |
| knowledge-sync | `06-知识同步/{id}_知识同步结果.md` |

solution-gate 是唯一双 canonical 文件节点（两个隔离 binding 各一）；manifest 的 solution-gate 当前指针指向 `{id}_方案审核.md`；正式裁决经路径/版本/digest 绑定当前 `{id}_方案审核问题台账.md`；台账不创建第二个 manifest 节点。

## 多轮更新规则（contract §3.1）

再次扫描、复核、裁决或复验一律**更新同一 canonical 文件**：读取已有文件 → 更新正文为当前有效内容 → 按语义变化递增 Metadata Version（PATCH/MINOR/MAJOR）→ 更新 `Updated At` → 追加「修订记录」行 → 经 `scripts/publish-requirement-manifest.sh` 更新 manifest 版本/digest/状态/结果。Finding 状态迁移经 publisher 生命周期操作记录，不为关闭 Finding 创建新报告文件。

**禁止**在 canonical 文件之外创建同节点、同职责、带轮次或状态后缀的顶层当前文档。禁止后缀（中英文，完整清单见 artifact-versioning.md）：`_v1`、`_v2`、`_vN`、`_R1`、`-R2`、`_round2`、`_第1轮`、`_第2轮`、`_第N轮`、`_对抗扫描`、`_闭环复核`、`_再次复核`、`_正式裁决`、`_复验`、`_再次复验`、`_准入修正`、`_最终复验`、`_最终版`、`_最新版`。历史证据归 `{node_directory}/evidence/history/` + 迁移表；历史文件不成为 current、不被 publisher 登记为当前路径、不被下游当当前输入；`evidence/**` 不计入顶层当前文件数量。

## Core Rules

1. Classify the requested artifact node before generating content.
2. Classify the requested output format before writing or publishing.
3. If the output format cannot be inferred, ask the user to choose Markdown, HTML, or Lark/Feishu.
4. Write local DocFlow artifacts under `library/{requirement_id}/{node_directory}/`.
5. Do not use legacy `library/技术方案/` or `library/代码审核/` as the primary DocFlow path.
6. Treat `library/{requirement_id}/**` as the human handoff view. `specs/**` 与 `.specify/**` 是 D-088-01 v3 迁移前的退役历史面（原件归档 `.sdlc/legacy/**`）：只读引用，不是 source of truth，也不得作为新产物生成依据；现役事实源见 manual-runtime-semantic-contract（library 产物 + requirement manifest + `.sdlc/business_domain/**`）。
7. When publishing to Lark/Feishu, use `lark-cli` with user identity. If authorization expires, stop and ask the user to renew authorization.
8. Do not silently downgrade a requested Lark/Feishu document into a local-only file.

## Required References

Load these references as needed:

- `references/routing-rules.md` for artifact node and output format inference.
- `references/output-targets.md` for local file paths, naming, and manifest behavior.
- `references/lark-cli.md` for Lark/Feishu output rules.
- `references/legacy-html-style.md` for compatibility with the old `html-doc-style` visual constraints.

Load `references/execution-scenarios.md` before any write or publish operation.

Use repository standard files as authoritative rules:

- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/manual-runtime-semantic-contract.md`（§3 稳定路径、§5 状态与 Finding、§6 publisher、§7.3 准入）
- `${AI_SDLC_STANDARD_HOME}/ess/specification-schema.md`
- `${AI_SDLC_STANDARD_HOME}/ess/review-schema.md`
- `${AI_SDLC_STANDARD_HOME}/ess/code-review-schema.md`
- `${AI_SDLC_STANDARD_HOME}/ess/test-feedback-schema.md`
- `${AI_SDLC_STANDARD_HOME}/templates/artifact-manifest-template.md`

## Workflow

### 1. Parse Intent

Extract:

- Artifact node
- Output format
- Requirement ID or requirement short name
- Source materials
- Whether the document is a new artifact or an update

If the artifact node cannot be inferred, ask one short clarification question.

If the output format cannot be inferred, ask:

```text
这份文档要输出为哪种格式：Markdown、HTML，还是飞书文档？
```

### 2. Resolve Requirement ID

Use an existing requirement ID if the user provides one.

If no requirement ID is provided:

1. Generate `YYYYMMDD-short-name`.
2. Use a concise lowercase kebab-case English short name when possible.
3. If only a Chinese requirement name exists, use a short pinyin-like or semantic English slug when obvious; otherwise ask for a short name.

### 3. Resolve Target

For local output, use:

```text
library/{requirement_id}/{node_directory}/{requirement_id}_{artifact_type}.{ext}
```

For Lark/Feishu output:

1. Create or update the online document through `lark-cli`.
2. Record the online document URL via `scripts/publish-requirement-manifest.sh`（publisher 唯一写入；禁止直接编辑 `library/{requirement_id}/manifest.md`）。
3. If the user requests local backup, also write Markdown or HTML to the standard node directory.

### 4. Dry-Run Before Output

Before changing files or publishing documents, report the dry-run result from `references/execution-scenarios.md`:

- Requirement ID
- Artifact node and node directory
- Binding 或 role（solution-gate 必须区分 adversarial_scan / formal_verdict）
- Canonical target path（必须命中上表；台账用 `{id}_方案审核问题台账.md`）
- 文件是否已存在
- 本次是 CREATE 还是 UPDATE
- 原 Metadata Version → 目标 Metadata Version
- 是否发现同节点非 canonical 顶层文件（轮次/状态后缀文件）
- manifest 当前路径
- Blocking questions, if any

发现同节点已有轮次/状态后缀文件时：停止创建新文件 → 标记为稳定路径违规 → 给出整理或迁移计划（evidence/history/ + 迁移表）→ 不删除被历史 Finding 引用的证据 → 不把旧轮次文件继续登记为 current。

Stop before writing or publishing if any blocking question remains.

### 5. Generate Content

Use the schema matching the artifact node:

- 技术方案: `${AI_SDLC_STANDARD_HOME}/ess/specification-schema.md`
- 方案审核: `${AI_SDLC_STANDARD_HOME}/ess/review-schema.md` and `${AI_SDLC_STANDARD_HOME}/templates/gate-result-template.md`
- 实现记录: include implementation summary, verification, unfinished items, and residual risks
- 代码审核: `${AI_SDLC_STANDARD_HOME}/ess/code-review-schema.md`
- 测试反馈分类: `${AI_SDLC_STANDARD_HOME}/ess/test-feedback-schema.md`（消费 requirement-intake 已确认的内容，归 `00-需求资料/反馈/`）
- 需求资料: preserve source facts and clearly mark unresolved context

Do not invent business rules. Mark missing or uncertain information explicitly.

Do not omit required schema sections. If source material is missing, keep the section and mark the missing information explicitly.

### 6. Write or Publish

For Markdown:

- Write `.md` to the resolved node directory.

For HTML:

- Write complete `.html` to the resolved node directory.
- Follow `references/legacy-html-style.md` unless the user requests a different style.

For Lark/Feishu:

- Use `lark-cli` user identity.
- Stop if authorization is missing or expired.
- Report the document URL after success.

### 7. Report Result

Always report:

- Artifact node
- Output format
- Requirement ID
- Local path or Lark/Feishu URL
- Any missing information
- Whether the artifact can be used as a Gate input

## Side Effects

Allowed:

- Create directories under `library/{requirement_id}/`
- Write Markdown or HTML files
- Submit manifest updates through `scripts/publish-requirement-manifest.sh`（禁止直接编辑 manifest.md）
- Create or update Lark/Feishu documents through `lark-cli`

Not allowed:

- Modify production code
- Modify `specs/**` or `.specify/**`（retired read-only historical roots; never a source of truth）
- Modify `.specify/business_domain/**`
- Commit or push git changes
- Treat Lark/Feishu publication as complete when authorization failed

## 非节点边界（C03-A / Decision-045 / LOOP-CORE-C03-PLAN INV1）

`sdlc-docflow-writer` 是 **non-node utility skill**：

- 不注册为 LOOP 节点能力，不出现在 runtime 的 NODE_CAPABILITY_IDS 中；
- 不拥有 Gate 裁决权、节点准入权或任何流程推进权；
- 在 LOOP 内只负责渲染、落盘与发布**已被节点确认**的内容（Markdown/HTML/飞书等），
  输入一律来自节点已产出并经 Gate 确认的产物；
- 与七个 canonical 节点 Skill 的关系是渲染服务，而非对等节点。
