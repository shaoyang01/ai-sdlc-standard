# Execution Scenarios

Use these scenarios as dry-run checks before writing or publishing DocFlow artifacts.

## Dry-Run Matrix

| User prompt | Artifact node | Output format | Requirement ID | Expected action |
| --- | --- | --- | --- | --- |
| 生成订单下发规则 HTML 技术方案 | `01-技术方案` | HTML | `20260629-order-dispatch-rule` | Write `library/20260629-order-dispatch-rule/01-技术方案/20260629-order-dispatch-rule_技术方案.html` and update `manifest.md`. |
| 生成方案审核报告 20260629-ai-sdlc-standard | `02-方案审核` | unknown | `20260629-ai-sdlc-standard` | Ask for Markdown, HTML, or Lark/Feishu before writing. |
| 生成飞书代码审核报告，更新这个文档 URL | `05-代码审核` | Lark/Feishu | from URL/context, or unknown | Read `lark-cli skills read lark-doc`; confirm append, overwrite, or section replacement if the update mode is unspecified. |
| 整理原始测试反馈成文档，已有稳定文件 | `00-需求资料/反馈` | user-specified | existing requirement ID | 由 `sdlc-requirement-intake` 分类并确认内容，再渲染反馈资料；已有文件不改变节点归属，新 generation 由 Owner 显式发起。 |
| 渲染已由 code-review 确认的实现期审核反馈 | `05-代码审核` | user-specified | existing requirement ID | 渲染已确认的代码审核内容，按 publisher 登记当前产物；finding 关闭动作仅更新生命周期记录，不回写发现产物。 |
| 只发飞书，不要本地备份 | inferred from intent | Lark/Feishu | provided or generated | Publish through `lark-cli`; update `manifest.md` with the URL when possible; do not create a local Gate artifact unless requested. |
| 生成技术文档 | `01-技术方案` | unknown | possibly unknown | Ask for the output format first; ask for a short requirement name only if the ID cannot be safely generated. |
| 第2轮方案扫描 / 闭环复核 20260629-x | `02-方案审核/adversarial_scan` | user-specified | existing | UPDATE the same `02-方案审核/{id}_方案审核问题台账.md`（递增 Version + 修订记录；禁止新建 `_第2轮`/`_闭环复核` 文件）。 |
| 第2轮正式裁决 20260629-x | `02-方案审核/formal_verdict` | user-specified | existing | UPDATE the same `02-方案审核/{id}_方案审核.md`（绑定当前台账版本/digest；禁止新建 `_正式裁决` 文件）。 |
| 实现返工后的代码复验 20260629-x | `05-代码审核` | user-specified | existing | UPDATE the same `05-代码审核/{id}_代码审核.md`（禁止新建 `_复验`/`_最终复验` 文件）。 |

## Required Dry-Run Output

Before changing files or publishing documents, determine and report:

- Requirement ID.
- Artifact node and node directory; binding/role for solution-gate (adversarial_scan vs formal_verdict).
- Output format.
- Canonical target path (must hit the contract §3.1 table; adversarial_scan uses `{id}_方案审核问题台账.md`).
- Whether the file already exists (CREATE vs UPDATE).
- Original → target Metadata Version.
- Whether same-node non-canonical top-level files (round/status suffixes) exist.
- manifest current path.
- Blocking questions, if any.

Same-node round/status-suffix files found: stop creating, flag as a stable-path violation, propose a migration plan (`evidence/history/` + migration table), never delete evidence referenced by historical findings, never re-register old round files as current.

## Blocking Examples

Stop and ask one short question when:

- The output format is unknown.
- The artifact node cannot be inferred.
- The requirement ID cannot be safely generated.
- A Lark/Feishu update target exists but the update mode is unspecified.
- Required schema sections would be omitted due to missing source material.

## Non-Blocking Defaults

Use these defaults when they are safe:

- Use Metadata `Version: 1.0.0` when creating a stable artifact for the first time.
- Increment the internal Metadata Version when updating an existing stable artifact.
- Use today's date for a newly generated requirement ID.
- Use the standard DocFlow path before any legacy summary path.
