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
| `04-代码审核/` | 按需必需 | 保存 DeepSeek 或其他 Reviewer 的代码审查报告。 |
| `05-测试验收/` | 按需必需 | 保存测试同事反馈、截图、Bug 描述的结构化整理，不要求自动化测试。 |
| `manifest.md` | 建议 | 保存该需求的产物索引、当前状态和下一步。 |

## Manifest 记录规则

`manifest.md` 是需求目录的索引和状态视图，不替代任何节点产物。

推荐使用 `templates/artifact-manifest-template.md`，至少维护以下信息：

- Metadata：需求 ID、仓库、当前阶段、当前状态、关联 `specs/**` 和分支。
- Development Path Decision：方案审阅后决定直接实现、唤醒 Speckit pipeline，或阻塞返修。
- Artifact Index：当前有效产物路径、版本、Gate 结果和更新时间。
- Activity Log：当天发生的关键动作，供人工追踪和后续日报读取。
- Change History：需求变更、规格遗漏、Review 遗漏、实现 Bug、测试口径等变化事件。
- Superseded Artifacts：被新版本替代但必须保留的旧产物。
- Re-Gate Records：变更后从哪个节点重新 Gate、结果是什么、下一步是什么。
- Speckit Sync：是否需要知识沉淀、是否已执行、目标路径和残余风险。

Activity Log 应记录工作流动作，而不是聊天全文。

示例：

```text
2026-06-30 | Codex / sdlc-solution-reviewer | 方案审核 | 02-方案审核 | ...__方案审核__v1.md | PASS | 建议 DIRECT_IMPLEMENTATION
2026-06-30 | Codex | 唤醒 Speckit | 02-方案审核 | ...__方案审核__v1.md | SPECKIT_PIPELINE_REQUIRED | 复杂度高，进入完整 SDD
```

Development Path Decision 只记录当前有效决策。历史决策变化必须同时写入 Activity Log 和 Change History。

## 文件命名

标准格式：

```text
{requirement_id}__{artifact_type}__v{version}.{ext}
```

示例：

```text
20260629-ai-sdlc-standard__技术方案__v1.html
20260629-ai-sdlc-standard__方案审核__v1.html
20260629-ai-sdlc-standard__实现记录__v1.md
20260629-ai-sdlc-standard__代码审核__v1.html
20260629-ai-sdlc-standard__测试验收__v1.html
```

字段说明：

- `requirement_id`：需求 ID，必须与需求目录名一致。
- `artifact_type`：产物类型，建议与目录名保持一致。
- `version`：同一节点多次修订时递增。
- `ext`：文档默认 HTML；实现记录或 manifest 可使用 Markdown。

## 版本与 Superseded 规则

同一节点产生新版本时，不覆盖旧文件。

新版本适用场景：

- 用户补充需求边界。
- 方案审阅发现 Specification Missing。
- 实现阶段发现原方案理解错误。
- Code Review 或测试反馈导致方案、实现记录、测试验收需要更新。
- 风险接受内容发生变化。

被替代的旧版本必须保留，并在 `manifest.md` 的 Superseded Artifacts 中记录：

```text
Artifact: 01-技术方案/...__技术方案__v1.html
Superseded By: 01-技术方案/...__技术方案__v2.html
Reason: Specification Missing - 未定义失败降级策略
Date: 2026-06-30
Recorded By: Codex
```

当前有效版本以 Artifact Index 中记录的版本为准。

## Re-Gate 规则

发生变更时，从最早受影响节点重新 Gate。

常见判断：

| 变化 | 最早受影响节点 | 必需动作 |
| --- | --- | --- |
| 需求目标、范围或成功标准变化 | `00-需求资料` | 更新需求资料，重新生成或修订技术方案。 |
| 行为约束、异常处理、兼容性、数据来源、状态流转变化 | `01-技术方案` | 新增技术方案版本，重新方案审核。 |
| 开发路径建议变化 | `02-方案审核` | 新增方案审核或 Gate 记录，更新 Development Path Decision。 |
| 实现偏离方案 | `03-实现记录` 或 `01-技术方案` | 判断是 Implementation Bug 还是 Specification Missing，再决定回退节点。 |
| 代码审核发现阻塞项 | `04-代码审核` | 修复后更新实现记录，必要时重新代码审核。 |
| 测试反馈暴露规格遗漏 | `05-测试验收` 和 `01-技术方案` | 记录测试反馈，回到技术方案并重新方案审核。 |

每次 Re-Gate 必须在 `manifest.md` 的 Re-Gate Records 中记录触发原因、回退节点、Gate 产物、结果和下一步。

新 Gate 通过前，不得继续使用已被 superseded 的旧 Gate 作为进入后续阶段的依据。

## 示例

```text
library/20260629-ai-sdlc-standard/
├── 00-需求资料/
│   └── 20260629-ai-sdlc-standard__需求资料__v1.md
├── 01-技术方案/
│   └── 20260629-ai-sdlc-standard__技术方案__v1.html
├── 02-方案审核/
│   └── 20260629-ai-sdlc-standard__方案审核__v1.html
├── 03-实现记录/
│   └── 20260629-ai-sdlc-standard__实现记录__v1.md
├── 04-代码审核/
│   └── 20260629-ai-sdlc-standard__代码审核__v1.html
├── 05-测试验收/
│   └── 20260629-ai-sdlc-standard__测试验收__v1.html
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

- `specs/spec.md`、`plan.md`、`tasks.md` 仍由 SpecKit 工作流维护。
- `library/{requirement_id}/01-技术方案/` 可以引用或渲染 `specs/**`，但不是 SpecKit 写入源。
- `library/{requirement_id}/03-实现记录/` 可以引用 tasks 完成情况、代码 diff 和测试命令。
- 如果 `library` 与 `specs/**` 不一致，必须以 `specs/**` 和当前代码事实为准，并在后续审核或实现记录中说明差异。

## 进入下一节点的判断规则

进入下一节点必须同时满足：

1. 上一关键节点产物存在。
2. 文件名符合命名规则。
3. 文件位于当前需求目录下的规定节点文件夹。
4. 如果上一节点是 Gate，文档内必须包含 Gate Result。
5. Gate Result 必须是 `PASS` 或 `PASS_WITH_RISK`。
6. `PASS_WITH_RISK` 必须包含风险接受说明。

## 最小门禁链路

### 进入代码实现

必须存在：

```text
library/{requirement_id}/01-技术方案/{requirement_id}__技术方案__vN.html
library/{requirement_id}/02-方案审核/{requirement_id}__方案审核__vN.html
```

且方案审核结论允许继续。

### 进入代码审核

建议存在：

```text
library/{requirement_id}/03-实现记录/{requirement_id}__实现记录__vN.md
```

实现记录用于说明 Codex 实际改了什么、跑过什么验证、还有哪些残余风险，便于 DeepSeek 或其他 Reviewer 审查。

### 进入修复

如果存在代码审核报告：

```text
library/{requirement_id}/04-代码审核/{requirement_id}__代码审核__vN.html
```

且其中存在 Critical 或 High，必须先修复。

### 处理测试反馈

当测试同事反馈 Bug、截图、复现步骤或验收问题时，写入：

```text
library/{requirement_id}/05-测试验收/{requirement_id}__测试验收__vN.html
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
