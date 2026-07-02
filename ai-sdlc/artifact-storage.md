# Artifact Storage Standard

## 目标

在无法自动串联 Agent 和 Skill 的阶段，用固定文档目录、文件名和 Gate 产物实现人工工作流。

本标准规定：

- 每个需求在 `library/` 下拥有独立目录。
- 同一个需求的跨 Agent 交接产物都放在该需求目录下。
- 需求目录内部只保留少量高价值节点目录，避免把 SpecKit 机器产物重复文档化。
- 下一个节点是否可进入，不只看文件是否存在，还要看 Gate 结论。

## 推荐根目录

业务代码库中推荐使用：

```text
{repo_root}/library/{requirement_id}/
```

`library/` 通常应由业务仓库 `.gitignore` 忽略，用于保存本地过程文档、方案、审查报告、测试反馈和人工 Gate 产物。

## 需求 ID

需求 ID 用于命名需求目录，并串联该需求下的全部产物。

格式：

```text
YYYYMMDD-short-name
```

示例：

```text
20260629-ai-sdlc-standard
20260629-straight-order-outbound-receipt
20260629-prod-batch-schedule-config
```

同一天同名需求增加序号：

```text
20260629-ai-sdlc-standard-01
20260629-ai-sdlc-standard-02
```

## 需求目录结构

标准结构：

```text
library/{requirement_id}/
├── 00-需求资料/
├── 01-技术方案/
├── 02-方案审核/
├── 03-实现记录/
├── 04-交付总结/
├── 04-代码审核/
├── 05-测试验收/
└── manifest.md
```

## 目录职责

| 目录 | 是否必需 | 职责 |
| --- | --- | --- |
| `00-需求资料/` | 可选 | 保存原始需求、截图、飞书导出、测试或业务补充说明。 |
| `01-技术方案/` | 必需 | 保存面向人工阅读的技术方案，通常由 DeepSeek 或 html-doc-style 生成。 |
| `02-方案审核/` | 必需 | 保存 Codex 对技术方案的审阅结论，作为开发前 Gate。 |
| `03-实现记录/` | 建议 | 保存 Codex 实现摘要、涉及模块、验证情况、未完成项和残余风险。 |
| `04-交付总结/` | 建议 | 保存最终交付摘要、验证结果、遗留风险、发布或回滚说明和下一责任人。 |
| `04-代码审核/` | 按需必需 | 保存 DeepSeek 或其他 Reviewer 的代码审查报告。 |
| `05-测试验收/` | 按需必需 | 保存测试同事反馈、截图、Bug 描述的结构化整理，不要求自动化测试。 |
| `manifest.md` | 建议 | 保存该需求的产物索引、当前状态和下一步。 |

## Manifest 记录规则

`manifest.md` 是需求目录的索引和状态视图，不替代任何节点产物。

推荐使用 `templates/artifact-manifest-template.md`，至少维护以下信息：

- Metadata：需求 ID、仓库、当前阶段、当前状态、关联 `specs/**` 和分支。
- Development Path Decision：方案审阅后基于复杂度和风险决定直接实现、唤醒 Speckit pipeline，或阻塞返修。
- Artifact Index：当前有效产物路径、版本、Gate 结果和更新时间。
- Activity Log：当天发生的关键动作，供人工追踪和后续日报读取。
- Change History：需求变更、规格遗漏、Review 遗漏、实现 Bug、测试口径等变化事件。
- Replaced Artifact Paths：仅记录旧路径、拆分文件或迁移文件被稳定路径替代的情况。
- Re-Gate Records：变更后从哪个节点重新 Gate、结果是什么、下一步是什么。
- Stage Summaries：记录不作为 Gate 的阶段性总结，例如测试后的上线准入结论。
- Speckit Process Products：记录 `specs/{feature}/implementation.md`、`workflow-status.md`、`debug-guide.md` 和 `observability.md` 的路径、状态和版本；manifest 是状态权威源。
- Speckit Sync：是否需要知识沉淀、是否已执行、目标路径和残余风险。

Activity Log 应记录工作流动作，而不是聊天全文。

示例：

```text
2026-06-30 | Codex / sdlc-solution-reviewer | 方案审核 | 02-方案审核 | ...__方案审核.md | PASS | Reviewed Version 1.0.0，建议 DIRECT_IMPLEMENTATION
2026-06-30 | Codex | 唤醒 Speckit | 02-方案审核 | ...__方案审核.md | SPECKIT_PIPELINE_REQUIRED | 复杂度高，进入完整 SDD
```

Development Path Decision 只记录当前有效决策。它必须包含 Complexity、Complexity Triggers 和 Full SDD Override，并遵循 `ai-sdlc/complexity-routing.md`。历史决策变化必须同时写入 Activity Log 和 Change History。

Stage Summaries 只记录阶段性状态，不替代 Gate Decisions。

上线准入结论属于 Stage Summaries：

- 可引用测试验收、代码审核、当前有效 Gate 和 manifest 状态。
- 只能说明当前证据下是否具备上线条件。
- 不作为进入任何节点的门槛。
- 不代表需求已结束。
- 不编排上线、灰度、投产、回滚执行或外部发布动作。

## 文件命名

标准格式：

```text
{requirement_id}__{artifact_type}.{ext}
```

示例：

```text
20260629-ai-sdlc-standard__技术方案.html
20260629-ai-sdlc-standard__方案审核.html
20260629-ai-sdlc-standard__实现记录.md
20260629-ai-sdlc-standard__代码审核.html
20260629-ai-sdlc-standard__测试验收.html
```

字段说明：

- `requirement_id`：需求 ID，必须与需求目录名一致。
- `artifact_type`：产物类型，建议与目录名保持一致。
- `ext`：文档默认 HTML；实现记录或 manifest 可使用 Markdown。

## 版本规则

同一节点只有一个稳定当前文件。版本写入文档内部 Metadata：

```markdown
## Metadata

- Version: 1.2.0
```

文档底部必须包含 `## 修订记录`。

新版本适用场景：

- 用户补充需求边界。
- 方案审阅发现 Specification Missing。
- 实现阶段发现原方案理解错误。
- Code Review 或测试反馈导致方案、实现记录、测试验收需要更新。
- 风险接受内容发生变化。

规则：

- 不通过文件名表达版本。
- 不为了版本递增创建多个文件。
- 正文只保留当前有效内容。
- 历史变化写入 `## 修订记录` 和 Git history。
- `manifest.md` 的 Artifact Index 记录当前稳定路径、内部版本、状态和 Gate 结果。

禁止作为正式路径：

```text
20260629-ai-sdlc-standard__技术方案__v1.html  # forbidden
20260629-ai-sdlc-standard__技术方案__v2.html  # forbidden
20260629-ai-sdlc-standard__方案审核__v1.md  # forbidden
20260629-ai-sdlc-standard__方案审核__v2.md  # forbidden
```

这些 filename-based versioning 形式只能出现在明确标注为禁止或历史迁移说明的上下文中。

旧路径、拆分文件或从文件名版本模型迁移来的文件，才记录到 `manifest.md`
的 Replaced Artifact Paths 中。正常版本升级只更新稳定文件的内部
`Version` 和 `Change History`。

当前有效版本以 Artifact Index 中记录的稳定路径和内部版本为准。

## Re-Gate 规则

发生变更时，从最早受影响节点重新 Gate。

常见判断：

| 变化 | 最早受影响节点 | 必需动作 |
| --- | --- | --- |
| 需求目标、范围或成功标准变化 | `00-需求资料` | 更新需求资料，重新生成或修订技术方案。 |
| 行为约束、异常处理、兼容性、数据来源、状态流转变化 | `01-技术方案` | 更新稳定技术方案文件的内部版本，重新方案审核。 |
| 开发路径建议变化 | `02-方案审核` | 更新稳定方案审核或 Gate 记录，更新 Development Path Decision。 |
| 实现偏离方案 | `03-实现记录` 或 `01-技术方案` | 判断是 Implementation Bug 还是 Specification Missing，再决定回退节点。 |
| 代码审核发现阻塞项 | `04-代码审核` | 修复后更新实现记录，必要时重新代码审核。 |
| 测试反馈暴露规格遗漏 | `05-测试验收` 和 `01-技术方案` | 记录测试反馈，回到技术方案并重新方案审核。 |

每次 Re-Gate 必须在 `manifest.md` 的 Re-Gate Records 中记录触发原因、回退节点、Gate 产物、结果和下一步。

新 Gate 通过前，不得继续使用 stale 的旧 Gate 作为进入后续阶段的依据。

## 示例

```text
library/20260629-ai-sdlc-standard/
├── 00-需求资料/
│   └── 20260629-ai-sdlc-standard__需求资料.md
├── 01-技术方案/
│   └── 20260629-ai-sdlc-standard__技术方案.html
├── 02-方案审核/
│   └── 20260629-ai-sdlc-standard__方案审核.html
├── 03-实现记录/
│   └── 20260629-ai-sdlc-standard__实现记录.md
├── 04-交付总结/
│   └── 20260629-ai-sdlc-standard__交付总结.md
├── 04-代码审核/
│   └── 20260629-ai-sdlc-standard__代码审核.html
├── 05-测试验收/
│   └── 20260629-ai-sdlc-standard__测试验收.html
└── manifest.md
```

## 与 specs/ 的边界

`specs/**` 和 `library/{requirement_id}/**` 不能互相替代。

推荐边界：

```text
specs/**                 = SpecKit 机器事实源
library/{requirement_id}/ = 人工交接与门禁视图
```

具体规则：

- `specs/{feature}/spec.md`、`specs/{feature}/plan.md`、`specs/{feature}/tasks.md` 仍由 SpecKit 工作流维护；`specs/spec.md`、`specs/plan.md`、`specs/tasks.md` 只属于历史或反例表述，不是当前 runtime path。
- `specs/{feature}/implementation.md`、`specs/{feature}/workflow-status.md`、`specs/{feature}/debug-guide.md` 和 `specs/{feature}/observability.md` 记录新轨实现阶段过程事实；其中 `specs/{feature}/workflow-status.md` 只是机器侧快照，manifest 是状态权威源。
- `library/{requirement_id}/01-技术方案/` 可以引用或渲染 `specs/**`，但不是 SpecKit 写入源。
- `library/{requirement_id}/03-实现记录/` 可以引用 tasks 完成情况、代码 diff 和测试命令。
- `library/{requirement_id}/04-交付总结/` 汇总最终交付范围、验证结果、遗留风险、发布或回滚说明。
- 如果 `library` 与 `specs/**` 不一致，必须以 `specs/**` 和当前代码事实为准，并在后续审核或实现记录中说明差异。

## 进入下一节点的判断规则

进入下一节点必须同时满足：

1. 上一关键节点产物存在。
2. 文件名符合命名规则。
3. 文件位于当前需求目录下的规定节点文件夹。
4. 文档 Metadata 必须包含当前内部 `Version`。
5. 如果上一节点是 Gate，文档内必须包含 Gate Result 和 Reviewed Artifact Version。
6. Gate Result 必须是 `PASS` 或 `PASS_WITH_RISK`。
7. `PASS_WITH_RISK` 必须包含风险接受说明。
8. manifest Artifact Index 中的路径和版本必须与当前文件一致。

## 最小门禁链路

### 进入代码实现

必须存在：

```text
library/{requirement_id}/01-技术方案/{requirement_id}__技术方案.html
library/{requirement_id}/02-方案审核/{requirement_id}__方案审核.html
```

且方案审核结论允许继续。

### 进入代码审核

建议存在：

```text
library/{requirement_id}/03-实现记录/{requirement_id}__实现记录.md
```

实现记录用于说明 Codex 实际改了什么、跑过什么验证、还有哪些残余风险，便于 DeepSeek 或其他 Reviewer 审查。

### 进入交付总结

最终交付前建议存在或建议生成：

```text
library/{requirement_id}/04-交付总结/{requirement_id}__交付总结.md
```

交付总结用于说明最终交付范围、验证结果、遗留风险、发布或回滚说明和下一责任人。

### 进入修复

如果存在代码审核报告：

```text
library/{requirement_id}/04-代码审核/{requirement_id}__代码审核.html
```

且其中存在 Critical 或 High，必须先修复。

### 处理测试反馈

当测试同事反馈 Bug、截图、复现步骤或验收问题时，写入：

```text
library/{requirement_id}/05-测试验收/{requirement_id}__测试验收.html
```

测试验收不是自动化测试报告，而是测试反馈结构化入口。它必须尽量判断反馈属于：

- Implementation Bug
- Specification Missing
- Review Missing
- Requirement Change
- Test Case / Test Expectation Issue
- Environment / Data Issue

## 知识沉淀边界

`library/{requirement_id}/` 不单独设置知识沉淀目录。

知识沉淀由 Speckit Sync 或等价工作流负责：

```text
specs/** + 实现结果
  -> .specify/business_domain/**
  -> 必要时 .specify/memory/**
  -> 必要时 .specify/workflow/**
  -> 必要时 .specify/coding_guide/**
```

`manifest.md` 可以记录 Sync 是否执行、输出路径和残余风险，但不把 `library` 作为长期知识库事实源。

## 与现有 html-doc-style 路径的关系

现有按文档类型分散归档的路径可以作为兼容路径，但 AI SDLC 标准路径优先。

推荐规则：

- AI SDLC 过程产物优先写入 `library/{requirement_id}/{节点目录}/`。
- 如果团队仍需要 `library/技术方案/` 或 `library/代码审核/` 汇总目录，可额外复制最终版文档，但不得替代需求目录内的门禁产物。
- 下一个节点判断是否可进入时，只认 `library/{requirement_id}/` 下的标准产物。
