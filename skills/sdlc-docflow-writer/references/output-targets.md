# Output Targets

## Artifact Versioning Requirements

When this reference produces or updates a DocFlow requirement artifact under
`library/{requirement_id}/`, it must use a stable path and update the same file.
Do not create `_vN.md` or other filename-versioned artifacts.

The artifact must include:

```markdown
## Metadata

- Requirement ID:
- Artifact Type:
- Version: 1.0.0
- Status: current / stale / actionable（manifest 冻结映射词表；`draft`/`active`/`replaced` 已废止——loop-artifact-revision.md）
- Author / Skill:
- Created At:
- Updated At:
- Reviewed Artifact:
- Reviewed Artifact Version:
- Gate Artifact Version:

## 修订记录

| Version | Date | Author / Skill | Change Type | Summary | Re-Gate |
| --- | --- | --- | --- | --- | --- |
| 1.0.0 |  |  | initial | Initial current artifact. | no |
```

For non-Gate artifacts, `Reviewed Artifact`, `Reviewed Artifact Version`, and
`Gate Artifact Version` may be omitted when there is no reviewed upstream
artifact. For Gate, review, sync, and reconcile artifacts, they are required.

The body must contain only the current effective content. Historical changes
belong in `## 修订记录`, manifest `Change History`, and Git history.

## Standard Local Root

Write DocFlow artifacts under:

```text
library/{requirement_id}/
```

Use this node layout:

```text
library/{requirement_id}/
├── 00-需求资料/
├── 01-技术方案/
├── 02-方案审核/
├── 03-任务规划/
├── 04-实现记录/
├── 05-代码审核/
├── 06-知识同步/
└── manifest.md
```

## File Naming

Use:

```text
{requirement_id}_{artifact_type}.{ext}
```

Canonical 当前文件（contract §3.1；solution-gate 双 binding 为唯一双文件节点）：

```text
00-需求资料/{id}_需求摘要.md
01-技术方案/{id}_技术方案.md
02-方案审核/{id}_方案审核问题台账.md   # adversarial_scan 台账（原 {id}_FindingLedger.md，2026-09-16 更名）
02-方案审核/{id}_方案审核.md           # formal_verdict（manifest solution-gate 当前指针指向此文件）
03-任务规划/{id}_任务计划.md
04-实现记录/{id}_实现记录.md
05-代码审核/{id}_代码审核.md           # 初审/返工复验/最终复验同一文件
06-知识同步/{id}_知识同步结果.md
```

Examples:

```text
20260629-ai-sdlc-standard_技术方案.html
20260629-ai-sdlc-standard_方案审核问题台账.md
20260629-ai-sdlc-standard_方案审核.html
20260629-ai-sdlc-standard_实现记录.md
20260629-ai-sdlc-standard_代码审核.html
20260629-ai-sdlc-standard_测试验收.html
```

Forbidden top-level suffix patterns（创建即稳定路径违规；完整清单与历史迁移规则见 artifact-versioning.md 与 contract §3.1）：`_vN`、`_R1`、`-R2`、`_round2`、`_第N轮`、`_对抗扫描`、`_闭环复核`、`_再次复核`、`_正式裁决`、`_复验`、`_再次复验`、`_准入修正`、`_最终复验`、`_最终版`、`_最新版`。英文 `{id}_FindingLedger.md` 不再作为新需求的当前产物路径。历史文件迁 `{node_directory}/evidence/history/` 并附迁移表；`evidence/**` 不计入顶层当前文件数量，也不得成为 manifest 当前指针。

## Version And Update Mode

When writing a DocFlow artifact:

1. Use the stable file name `{requirement_id}_{artifact_type}.{ext}`.
2. If the stable file does not exist, create it with Metadata `Version: 1.0.0`.
3. If the stable file exists, update the same file and increment its internal Metadata `Version` according to `ai-sdlc/artifact-versioning.md`.
4. Keep only the current valid body content in the artifact.
5. Record historical changes in `## 修订记录`, `manifest.md`, and Git history.

## Manifest Behavior

Maintain:

```text
library/{requirement_id}/manifest.md
```

Resolve standard-package paths from the repository root that contains `manifest.yaml`.

`manifest.md` 由 `sdlc-requirement-intake` 经 `scripts/publish-requirement-manifest.sh init` 创建（manual-runtime-semantic-contract §6.1）；其余节点经 `entry-update` 提交（§6.2 publisher 唯一写入，禁止直接编辑或按模板直建）。`manifest.md` 缺失的存量 `library/` 目录不得复用为现役产物面（§6.1），须先由 Owner 决定重建或归档。

Update manifest after successful local write or Lark/Feishu publication:

- Node
- Path or URL
- Version
- Status
- Result, if the artifact is a Gate or review document
- Updated time
- Next step

## Legacy Summary Paths

The old `html-doc-style` paths such as `library/技术方案/` and `library/代码审核/` are compatibility summary paths only.

Do not use them as the primary DocFlow path.

If a user explicitly asks to keep the old summary path, write the DocFlow standard path first, then optionally create a secondary copy in the legacy path.
