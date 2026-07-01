# Output Targets

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
├── 03-实现记录/
├── 04-代码审核/
├── 05-测试验收/
└── manifest.md
```

## File Naming

Use:

```text
{requirement_id}__{artifact_type}.{ext}
```

Examples:

```text
20260629-ai-sdlc-standard__技术方案.html
20260629-ai-sdlc-standard__方案审核.html
20260629-ai-sdlc-standard__实现记录.md
20260629-ai-sdlc-standard__代码审核.html
20260629-ai-sdlc-standard__测试验收.html
```

## Version And Update Mode

When writing a DocFlow artifact:

1. Use the stable file name `{requirement_id}__{artifact_type}.{ext}`.
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

If `manifest.md` does not exist, create it from `templates/artifact-manifest-template.md` when possible.

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
