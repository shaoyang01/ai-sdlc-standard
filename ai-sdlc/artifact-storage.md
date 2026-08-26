# Artifact Storage Standard

> 状态：Draft（2026-08-22，C02-WP3.5 合同重基线，Decision-044/045；收口后升 Accepted）
> 关联：[Lifecycle](lifecycle.md) · [Artifact Flow](artifact-flow.md) · [Artifact Versioning](artifact-versioning.md) · [Phase Gates](phase-gates.md)

## 目标

在无法自动串联 Agent 和 Skill 的阶段，用固定文档目录、文件名和 Gate 产物实现人工工作流。

本标准规定：

- 每个需求在 `library/` 下拥有独立目录。
- 同一个需求的跨 Agent 交接产物都放在该需求目录下。
- 需求目录内部只保留少量高价值节点目录（v2 七节点 + C03 Delivery Tail）。
- 下一个节点是否可进入，不只看文件是否存在，还要看 Gate 结论与设计深度裁决；确定性检查由 LOOP runtime 执行。

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

标准结构（v2 七节点 + C03 Delivery Tail）：

```text
library/{requirement_id}/
├── 00-需求资料/
├── 01-技术方案/
├── 02-方案审核/
├── 03-任务规划/
├── 04-实现记录/
├── 05-代码审核/
├── 06-知识同步/
├── 07-交付总结/          # C03 Delivery Tail，不映射节点能力
└── manifest.md
```

## 目录职责

| 目录 | 是否必需 | 职责 |
| --- | --- | --- |
| `00-需求资料/` | 必需（唯一入口） | 保存需求摘要与 change record（新需求/补充/变更/返工/反馈驱动变更）、原始需求、截图、飞书导出、测试或线上反馈整理（必要时渲染到 `00-需求资料/反馈/`）。 |
| `01-技术方案/` | 必需 | 保存面向人工阅读的技术方案，按已裁决深度档位（LIGHT/STANDARD/DEEP）深化，由 solution-design 执行 binding 生成。 |
| `02-方案审核/` | 必需 | 保存 solution-gate 产物：adversarial_scan 的 Finding Ledger 与 formal_verdict 的 Gate Result + 设计深度裁决（depth + decision_status）；两角色必须由不同 Agent binding 执行。 |
| `03-任务规划/` | 必需 | 保存 task-planning 的任务计划与实现前一致性审计结论（v2 新增节点）。 |
| `04-实现记录/` | 实际实现时必需 | 保存实现摘要、涉及模块、验证情况、未完成项和残余风险；每项声明引用 diff、测试输出或 journal 事件证据。 |
| `05-代码审核/` | 实际实现时必需 | 保存代码审查报告（Review Summary，含 Finding Ledger / closure review）。 |
| `06-知识同步/` | 必需 | 保存 knowledge-sync 结果（decision = NO_CHANGE / APPLY_LOCAL / PROPOSAL_ONLY / BLOCKED_CONFLICT、候选稳定事实、目标路径、reconcile result、残余风险、evidence digest）；无新增稳定事实时输出 NO_CHANGE 也是有效 current revision。 |
| `07-交付总结/` | Delivery Tail 时必需 | 属于 C03 Delivery Tail，不映射节点能力；保存交付摘要、验证结果、遗留风险、发布或回滚说明和下一责任人；与 delivery checkpoint（READY_FOR_MANUAL_GIT_HANDOFF）单独登记。 |
| `manifest.md` | 进入实现或 Delivery Tail 时必需 | 保存该需求的产物索引、当前 generation、七节点 current revision/Gate、Design Depth Decision、Delivery Tail 与 external evidence references。 |

当需求产生实际代码、配置或行为实现时，`04-实现记录`、`05-代码审核` 均为必需证据，不得因修改较小而静默省略。节点准入的确定性检查由 LOOP runtime 执行，不再依赖人工 Gate Skill（`sdlc-gate-runner` 已退役）。[RETIRED — C03-B]

### Manifest 必需性

- 一旦需求进入实际代码、配置或行为实现，Manifest 必须存在。
- 一旦进入 knowledge-sync 或 C03 Delivery Tail，Manifest 必须存在。
- Manifest 承载：当前 generation、Design Depth Decision、七节点 current revision/Gate、Delivery Tail 与 external evidence references、Activity Log、Change History、Re-Gate Records、blocking state。
- Manifest 不能被 Delivery Summary、workflow-status snapshot、聊天结论或单独的节点文件替代。
- 不进入实现的纯文档、纯分析或纯治理事项，可以正式判定 Manifest 为 `not_applicable`，但必须记录明确范围、原因、证据、decision source 和 decision owner。
- 不要求迁移历史 Manifest；不修改 Artifact Manifest Template；不创建第二份 Manifest schema。

## Manifest 记录规则

`manifest.md` 是需求目录的索引和状态视图，不替代任何节点产物。

推荐使用 `templates/artifact-manifest-template.md`，至少维护以下信息：

- Metadata：需求 ID、仓库、当前 generation、当前节点、当前状态、关联分支。
- Design Depth Decision：solution-gate 正式裁决输出的深度档位（LIGHT/STANDARD/DEEP）与 decision_status（DECIDED/BLOCKED_UNKNOWN）；`BLOCKED_UNKNOWN` 不进入实现；深度档位或 decision_status 变化必须重新过 solution-gate。
- Artifact Index：七节点（00-06）当前有效产物路径、版本、状态和 Gate/结论；`07-交付总结` 单独登记，不映射节点能力。
- External Evidence References：content-addressed evidence（可复现测试输出、运行日志、外部系统回执）引用，由相应节点 revision 或 Delivery Tail 引用。
- Activity Log：当天发生的关键动作，供人工追踪和后续日报读取。
- Change History：需求变更、规格遗漏、Review 遗漏、实现 Bug、反馈驱动变更等变化事件。
- Replaced Artifact Paths：仅记录旧路径、拆分文件或迁移文件被稳定路径替代的情况。
- Re-Gate Records：变更后从哪个节点重新 Gate、结果是什么、下一步是什么。
- Stage Summaries：记录不作为 Gate 的阶段性总结，例如测试后的上线准入结论。

Activity Log 应记录工作流动作，而不是聊天全文。

示例：

```text
2026-08-22 | binding-A / sdlc-solution-gate (adversarial_scan) | 对抗扫描 | 02-方案审核 | ..._方案审核.md | Finding Ledger 首轮建立（3 项 finding） | Reviewed Version 1.0.0
2026-08-22 | binding-B / sdlc-solution-gate (formal_verdict) | 正式裁决 | 02-方案审核 | ..._方案审核.md | PASS | depth=STANDARD, decision_status=DECIDED
```

## 文件命名

标准格式：

```text
{requirement_id}_{artifact_type}.{ext}
```

示例：

```text
20260629-ai-sdlc-standard_需求摘要.md
20260629-ai-sdlc-standard_技术方案.html
20260629-ai-sdlc-standard_方案审核.html
20260629-ai-sdlc-standard_任务计划.md
20260629-ai-sdlc-standard_实现记录.md
20260629-ai-sdlc-standard_代码审核.html
20260629-ai-sdlc-standard_知识同步结果.md
20260629-ai-sdlc-standard_交付总结.md
```

字段说明：

- `requirement_id`：需求 ID，必须与需求目录名一致。
- `artifact_type`：产物类型，建议与目录名保持一致。
- `ext`：文档默认 HTML；实现记录、任务计划、知识同步结果或 manifest 可使用 Markdown。

## 版本规则

同一节点只有一个稳定当前文件。版本写入文档内部 Metadata：

```markdown
## Metadata

- Version: 1.2.0
```

文档底部必须包含 `## 修订记录`。

新版本适用场景：

- 用户补充需求边界。
- 方案审核发现 Specification Missing。
- 实现阶段发现原方案理解错误。
- Code Review 或测试反馈导致方案、实现记录需要更新。
- 风险接受内容发生变化。

规则：

- 不通过文件名表达版本。
- 不为了版本递增创建多个文件。
- 正文只保留当前有效内容。
- 历史变化写入 `## 修订记录` 和 Git history。
- `manifest.md` 的 Artifact Index 记录当前稳定路径、内部版本、状态和 Gate 结果。

禁止作为正式路径：

```text
20260629-ai-sdlc-standard_技术方案_v1.html  # forbidden
20260629-ai-sdlc-standard_技术方案_v2.html  # forbidden
20260629-ai-sdlc-standard_方案审核_v1.md  # forbidden
20260629-ai-sdlc-standard_方案审核_v2.md  # forbidden
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
| 需求目标、范围或成功标准变化（含测试/线上反馈） | `00-需求资料` | 经 intake 建立 change record（`FEEDBACK_DRIVEN_CHANGE` 等）开启新 generation，更新需求资料，重新生成或修订技术方案。 |
| 行为约束、异常处理、兼容性、数据来源、状态流转变化 | `01-技术方案` | 更新稳定技术方案文件的内部版本，重新过 solution-gate。 |
| 方案缺口或深度裁决变化 | `02-方案审核` | 更新 Finding Ledger / Gate 记录，重新正式裁决（depth 或 decision_status 变化必须重新裁决）。 |
| 任务遗漏、顺序或验证计划错误 | `03-任务规划` | 更新任务计划；若根因是方案缺失，改标 SOLUTION 并回到 `01-技术方案`。 |
| 实现偏离方案 | `04-实现记录` 或 `01-技术方案` | 判断是 Implementation Bug 还是 Specification Missing，再决定回退节点。 |
| 代码审核发现阻塞项 | `05-代码审核` | 修复后更新实现记录，必要时重新代码审核。 |
| 知识沉淀事实错误 | `06-知识同步` | 更新知识同步结果；若发现上游事实错误，按根因回到更早节点。 |

每次 Re-Gate 必须在 `manifest.md` 的 Re-Gate Records 中记录触发原因、回退节点、Gate 产物、结果和下一步。

新 Gate 通过前，不得继续使用 stale 的旧 Gate 作为进入后续阶段的依据。

## 示例

```text
library/20260629-ai-sdlc-standard/
├── 00-需求资料/
│   ├── 20260629-ai-sdlc-standard_需求摘要.md
│   └── 反馈/
├── 01-技术方案/
│   └── 20260629-ai-sdlc-standard_技术方案.html
├── 02-方案审核/
│   └── 20260629-ai-sdlc-standard_方案审核.html
├── 03-任务规划/
│   └── 20260629-ai-sdlc-standard_任务计划.md
├── 04-实现记录/
│   └── 20260629-ai-sdlc-standard_实现记录.md
├── 05-代码审核/
│   └── 20260629-ai-sdlc-standard_代码审核.html
├── 06-知识同步/
│   └── 20260629-ai-sdlc-standard_知识同步结果.md
├── 07-交付总结/
│   └── 20260629-ai-sdlc-standard_交付总结.md
└── manifest.md
```

## 与 .specify/ 的边界（禁止写入）

`specs/**` 不再承担机器事实源职责，旧文件只读历史；`.specify/**` 是禁止写入边界。

具体规则：

- LOOP 节点产物只写入 `library/{requirement_id}/{节点目录}/`；`library` 与 `.specify/**` 不得互相写入。
- 旧 `specs/**` 文件可作历史输入引用，但只有 v2 capability execution 产生的 revision 能成为 current；不得恢复 specs-run、sync source mode 或 pipeline 语义。
- 历史 v1 `03-实现记录 / 04-代码审核 / 05-测试验收` 文件保持只读历史，不自动重命名、不自动提升为 current；若确需复用，必须在新 generation 中显式导入为 evidence 并重新生成 v2 revision。
- 如果旧文件与当前代码事实不一致，以当前代码事实为准，并在后续审核或实现记录中说明差异。

## Evidence 存储边界

可复现测试输出、运行日志与外部系统回执不属于节点产物：

- 写入 content-addressed evidence store，以 `loop-artifact:v1:<kind>:sha256:<digest>` 形式引用，由相应节点 revision 或 Delivery Tail 引用。
- 原始测试/线上反馈先经 `requirement-intake` 分类为 `FEEDBACK_DRIVEN_CHANGE` 开启新 generation；必要时渲染到 `00-需求资料/反馈/`，其来源作为 intake source ref，不作为节点 current 产物。

## 进入下一节点的判断规则

进入下一节点必须同时满足：

1. 上一关键节点产物存在。
2. 文件名符合命名规则。
3. 文件位于当前需求目录下的规定节点文件夹。
4. 文档 Metadata 必须包含当前内部 `Version`。
5. 如果上一节点是 solution-gate（`02-方案审核`），文档内必须包含 Gate Result、Reviewed Artifact Version 与设计深度裁决（depth + decision_status）。
6. Gate Result 必须是 `PASS` 或 `PASS_WITH_RISK`，且 decision_status = `DECIDED`（`BLOCKED_UNKNOWN` 不进入实现）。
7. `PASS_WITH_RISK` 必须包含风险接受说明（Critical 与未接受 High 始终阻塞）。
8. manifest Artifact Index 中的路径和版本必须与当前文件一致。

节点准入的确定性检查（generation、current revision、Gate、深度裁决、finding 状态）由 LOOP runtime 执行，不依赖人工 Gate Skill。

## 最小门禁链路

### 进入代码实现

必须存在：

```text
library/{requirement_id}/01-技术方案/{requirement_id}_技术方案.md
library/{requirement_id}/02-方案审核/{requirement_id}_方案审核.md
library/{requirement_id}/03-任务规划/{requirement_id}_任务计划.md
```

且方案审核结论允许继续（PASS / PASS_WITH_RISK，decision_status = DECIDED）。

### 进入代码审核

必须存在：

```text
library/{requirement_id}/04-实现记录/{requirement_id}_实现记录.md
```

实现记录用于说明执行 binding 实际改了什么、跑过什么验证、还有哪些残余风险，便于 Reviewer 审查。

### 进入知识同步

建议存在：

```text
library/{requirement_id}/05-代码审核/{requirement_id}_代码审核.md
```

且当前 generation 七节点 current revisions 有效、无未关闭 blocking finding。

### 进入交付总结（C03 Delivery Tail）

最终交付前建议存在或建议生成：

```text
library/{requirement_id}/07-交付总结/{requirement_id}_交付总结.md
```

交付总结用于说明最终交付范围、验证结果、遗留风险、发布或回滚说明和下一责任人；不输出 Gate。

### 进入修复

如果存在代码审核报告：

```text
library/{requirement_id}/05-代码审核/{requirement_id}_代码审核.html
```

且其中存在 Critical 或 High，必须先修复或按根因回流最早受影响节点（方案缺口回 `solution-design` / `task-planning`，不得只修代码）。

### 处理测试/线上反馈

测试反馈、线上反馈不再是节点产物（`05-测试验收` 已退役）：先经 `requirement-intake` 分类为 `FEEDBACK_DRIVEN_CHANGE` 开启新 generation，必要时渲染到 `00-需求资料/反馈/`。intake 确认事实后，按 v2 finding 类别（REQUIREMENT / SOLUTION / PLANNING / IMPLEMENTATION / REVIEW / KNOWLEDGE）建立 finding 或直接形成新的 requirement revision。

## 知识同步边界

`library/{requirement_id}/06-知识同步/` 只保存 knowledge-sync 结果产物（decision、候选稳定事实、source revision IDs、目标路径、diff/proposal、reconcile result、未执行项、残余风险与 evidence digest）。

- 知识同步默认只读；明确写授权后才写入目标知识（Checklist / Schema / 长期知识库）。
- 目标知识更新必须可回溯到 source revision IDs 与 evidence；`library` 不作为长期知识库事实源。
- 新写统一遵循 v2 knowledge-sync 语义；不恢复 Speckit Sync / sync source mode。

## 与现有 html-doc-style 路径的关系

现有按文档类型分散归档的路径可以作为兼容路径，但 AI SDLC 标准路径优先。

推荐规则：

- AI SDLC 过程产物优先写入 `library/{requirement_id}/{节点目录}/`。
- 如果团队仍需要 `library/技术方案/` 或 `library/代码审核/` 汇总目录，可额外复制最终版文档，但不得替代需求目录内的门禁产物。
- 下一个节点判断是否可进入时，只认 `library/{requirement_id}/` 下的标准产物。

## Revision Record

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 2.0.0 | 2026-08-22 | Draft | C02-WP3.5 重基线（Decision-044/045）：目录结构与职责切换为 v2 七节点（00-06）+ C03 Delivery Tail（07）；新增 03-任务规划、06-知识同步，04/05 为原 03/04 顺延，05-测试验收 退役；Manifest 规则更新为 Design Depth Decision、current generation、七节点 current revision/Gate、Delivery Tail 与 external evidence references；specs/**/.specify/** 机器产物与 pipeline/sync source mode 语义删除（.specify/** 保留为禁止写入边界）；测试/线上反馈改为外部 change input 经 intake 重入。 |
