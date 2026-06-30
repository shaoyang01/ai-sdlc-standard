# AI SDLC Standard Roadmap

## 定位

本路线图用于跟踪 `ai-sdlc-standard` 从“标准包已建立”到“核心 Skill 与下游工具完成落地”的完整改造过程。

它不是某一次对话里的短期 TODO，而是后续推进的主索引。每次继续改造前，优先查看本文件，确认：

- 当前阶段做到哪里。
- 下一个应该改哪个 Skill 或标准文件。
- 哪些 Skill 需要新建，哪些只需要补合同，哪些需要重写。
- 哪些能力只是后续产品集成，暂不进入当前实现。

## 当前状态

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| 可迁移标准包 | 已完成 | 标准文件放在本仓库，不放在任何 Agent 配置目录。 |
| DocFlow 产物目录 | 已完成 | `library/{requirement_id}/` 是人工交接与 Gate 视图。 |
| `docflow-writer` | 已完成 | 负责生成 Markdown、HTML、飞书文档，并更新 manifest。 |
| 安装边界 | 已完成 | 安装 Skill 只是复制可执行副本，必须由用户明确触发。 |
| 完整路线图 | 进行中 | 本文件作为后续 Skill 改造总入口，并吸收外部 v1.0 文档暴露的路线图缺口。 |
| 需求变更流程 | 已新增基础标准 | `ai-sdlc/change-control.md` 定义中途变更、返工、误解需求后的重走 Gate 规则。 |
| Manifest 活动日志 | 已补模板与存储规则 | `templates/artifact-manifest-template.md` 和 `ai-sdlc/artifact-storage.md` 已支持 Activity Log、Change History、Superseded、Re-Gate。 |
| 方案审阅 Skill | 已实现初版 | `skills/solution-reviewer/` 已实现全局 DocFlow Gate、开发路径建议和阻塞条件。 |
| Skill 分类治理 | 待补 | 需要把 Intake / Producer / Auditor / Renderer / Executor / Reviewer / Sync 写成接入规则。 |
| Speckit 生命周期 Skill | 待改造 | 需要补合同、收紧 Gate、必要时重写执行体。 |
| work-journal 集成 | 远期规划 | 未来读取标准产物，不再依赖聊天碎片；必须与现有事件源互斥。 |

## 核心原则

- 标准仓库是事实源；Agent Skill 目录只是安装副本。
- 每个 Skill 先定义合同，再决定是否重写执行体。
- `docflow-writer` 负责写文档，不负责判断文档是否合格。
- 审阅、实现、同步、日报这类能力必须分层，不混在一个 Skill 里。
- 所有 Gate 必须能落到 `library/{requirement_id}/manifest.md` 和对应节点产物。
- 需求变化不删除历史产物，通过版本、superseded 标记和 re-Gate 记录处理。
- 在修改或重写 Skill 前，必须先模拟输入状态和边界数据，再编码或写合同。
- 已建立的标准文件不做推翻式大改。后续以增量补充、合同接入、示例验证为主。
- 外部 v1.0 文档只作为缺口校准来源，不按其目录结构照搬，也不覆盖本仓库已稳定的标准结构。
- Specification Audit 是所有需求的通用 Gate，不归属于某一条 SpecKit pipeline；DeepSeek 或人工产出技术方案后，Codex 应先通过 `solution-reviewer` 审阅方案。
- `solution-reviewer` 不只判断方案是否可实现，还要给出开发路径建议：直接实现，或唤醒 `speckit-pipeline-confirmed-single` 进入完整 SDD 流程。
- 在新流程中，`specification-writer` 与 `solution-reviewer` 会前置承担大部分 Specify / Clarify 责任；进入 Speckit 时，通常不应再出现需要重新澄清的核心需求问题。
- 如果需求使用 Speckit pipeline，pipeline 消费的是已审阅通过的方案和路由建议；方案审阅不是 Speckit 内部阶段。
- Renderer 只能改变展示形式，不能承担需求理解、业务语义补全或规格内容生成。

## 推进方式

后续推进分成三类任务，避免把标准、Skill 实现和下游产品混在一起：

| 任务类型 | 做什么 | 不做什么 |
| --- | --- | --- |
| 标准补齐 | 补缺失流程、补 manifest 字段、补 change-control、补 Gate 映射。 | 不重写已稳定的 ESS、Gate、生命周期正文。 |
| Skill 接入 | 为 Skill 补合同、登记 registry、明确输入输出副作用。 | 不把所有外部 Skill 复制进本仓库。 |
| 执行体改造 | 在目标 Agent Skill 目录或对应产品仓库重写/适配可执行 Skill。 | 不在标准包里直接改业务代码或产品代码。 |

每个后续任务都应按这个顺序执行：

1. 模拟输入数据和当前状态。
2. 判断属于标准补齐、Skill 接入还是执行体改造。
3. 如果是 Skill，先补合同，再决定是否写或改执行体。
4. 如果会影响 Gate，先明确 manifest 和 DocFlow 产物如何表达。
5. 提交前检查 registry、contract、README/manifest 入口是否一致。

## 外部 v1.0 文档吸收策略

`AI_SDLC_Docs_v1.0 (1)` 中的三份文档提供的是流程校准，不是迁移目标。当前仓库已经有 `ai-sdlc/`、`ess/`、`templates/`、`registry/`、`skill-contracts/` 等结构，因此后续只吸收以下问题：

| 问题 | 当前路线图处理 |
| --- | --- |
| 开发前缺 Specification Audit | 将 `solution-reviewer` 明确为所有需求通用的 Specification Completeness Auditor，并要求它在选择开发路径前完成。 |
| Skill 缺统一分类 | 增加 Intake / Producer / Auditor / Renderer / Executor / Reviewer / Sync 分类治理。 |
| Renderer 与 Producer 容易混淆 | 明确 `specification-writer` 负责语义规格，`html-doc-style` 和 `docflow-writer` 不负责补业务内容。 |
| Speckit Specify / Clarify 职责漂移 | 明确 `specification-writer` 产物可作为轻量需求的规格事实；进入 Speckit 时，`speckit-specify` / `speckit-clarify` 以复用和校验前置产物为主。 |
| Gate 输出需要统一 | 沿用既有 `templates/gate-result-template.md`，后续新增 `gate-runner` 合同。 |
| Review 报告不可执行 | 规划 `code-review-normalizer`，把多来源 Review 归一到 Code Review Schema。 |
| 测试问题没有反向沉淀 | 规划 `test-feedback-sync`，把 Specification Missing / Requirement Change 等分类回写 Checklist、Schema 或 change-control。 |
| MVP 顺序需要收敛 | 不再从零创建目录；当前 MVP 聚焦 Manifest 活动模型、方案审计 Skill、pipeline Gate 顺序。 |

## Skill 职责分类

所有接入本标准的 Skill 必须至少声明一个主类别，不允许以“万能 Skill”身份同时承担语义生成、审计、渲染、实现和同步。

| 类别 | 职责 | 不允许做 |
| --- | --- | --- |
| Intake | 接收、解析、归一化原始需求，保留来源信息。 | 不生成技术方案，不判断实现方式。 |
| Producer | 生成标准研发产物，例如规格、计划、任务、报告。 | 不绕过 Gate 直接实现代码。 |
| Auditor | 审计产物完整性、风险和缺口。 | 不直接改代码，不重写完整方案。 |
| Renderer | 把已确认的标准产物渲染成 Markdown、HTML、PDF 或在线文档。 | 不改变语义，不删除必填章节，不补造业务逻辑。 |
| Executor | 按已通过 Gate 的任务执行代码或命令。 | 不自行补未定义业务规则。 |
| Reviewer | 审查代码或实现是否符合规格、计划和任务。 | 不输出无法定位、无法修复的泛泛建议。 |
| Sync | 将稳定事实沉淀到知识库、Checklist、Schema 或 Workflow。 | 不把聊天片段当作长期事实源。 |

## 流程补齐清单

这些是后续需要逐步补齐的流程能力，不要求一次完成。

| 流程能力 | 当前情况 | 后续动作 |
| --- | --- | --- |
| 需求归一化 | 目前依赖用户输入和 SpecKit 入口。 | 规划 `requirement-normalizer` 合同，定义飞书、HTML、Markdown、纯文本需求如何进入 `00-需求资料`。 |
| 规格编写 | `docflow-writer` 能写文档，但不等于规格生成器。 | `specification-writer` 作为 Speckit 之外的通用规格生成入口；小需求可直接把其产物作为规格事实。 |
| 规格完整性审计 | 已规划 `solution-reviewer`，但需与 Specification Audit 对齐。 | 将 `solution-reviewer` 定位为全局 DocFlow Gate，而不是 Speckit 专属阶段。 |
| Gate 执行 | 有 Gate 模板，但缺统一 Gate 执行 Skill。 | 规划 `gate-runner`，统一 PASS / FAIL / PASS_WITH_RISK；`gate-auditor` 仅作为历史别名处理。 |
| 复杂度分级 | 当前路线未区分 Simple / Medium / Complex。 | 补充复杂度分级策略，用于决定是否走完整 SpecKit pipeline。 |
| Release Gate | 当前标准包有 Test/Code Review，但 release 链路弱。 | 后续补 release checklist / release gate / release-review 规划。 |
| Code Review 归一化 | 有 code review schema，但缺报告归一化 Skill。 | 规划 `code-review-normalizer`，统一 DeepSeek/Codex/人工 Review 输出。 |
| 测试反馈反向沉淀 | 有 test feedback schema，但 sync 动作不完整。 | 规划 `test-feedback-sync`，把规格遗漏回写 Checklist/Schema/Skill 规则。 |
| 知识同步 | 已明确交给 `speckit-sync`。 | 补 `speckit-sync` 合同，定义哪些事实能沉淀，哪些只留在 DocFlow。 |
| 日报数据源 | 已规划 work-journal 远期互斥模式。 | 等 manifest 活动模型稳定后，再定义产品侧实现契约。 |

## 路线图阶段

### Wave 1: 标准基础

状态：基本完成。

目标：

- 建立独立、可迁移的标准包。
- 定义研发生命周期、Gate、ESS Schema、Checklist、Artifact Storage。
- 建立 Skill Contract 模板与 Registry。
- 建立 DocFlow 目录结构和 `manifest.md` 模板。

已完成：

- `README.md`
- `manifest.yaml`
- `ai-sdlc/lifecycle.md`
- `ai-sdlc/phase-gates.md`
- `ai-sdlc/artifact-flow.md`
- `ai-sdlc/artifact-storage.md`
- `ess/*.md`
- `checklists/*.md`
- `skill-contracts/*.md`
- `templates/*.md`
- `registry/skill-registry.md`

### Wave 2: 文档流与安装边界

状态：已完成主线，后续按使用反馈修补。

目标：

- 让标准产物可以稳定写入 `library/{requirement_id}/`。
- 支持 Markdown、HTML、飞书文档输出。
- 明确飞书发布必须使用 `lark-cli` user 身份。
- 明确 Skill 安装只是复制副本，不把标准包变成本机配置。

已完成：

- `skills/docflow-writer/`
- `skill-contracts/known-skills/docflow-writer.md`
- `skills/docflow-writer/references/execution-scenarios.md`
- `PORTABILITY.md` 安装边界补充

后续只做：

- 使用反馈修补。
- 输出样式细节微调。
- 飞书 CLI 参数随版本变化时同步 reference。

### Wave 3: 变更控制与 Manifest 活动模型

状态：基础版已补，后续随 Skill 合同继续细化。

为什么先做：

如果不先定义“需求中途变更、方案返工、实现后发现理解错误”的规则，后续 pipeline、方案审阅、实现 Skill 都会缺少共同边界。

交付物：

- 新增 `ai-sdlc/change-control.md`（已完成基础版）
- 更新 `templates/artifact-manifest-template.md`（已完成）
- 必要时更新 `ai-sdlc/artifact-storage.md`（已完成）

必须覆盖：

- 需求变更时是否沿用原 `requirement_id`。
- 什么情况下必须新建 `requirement_id`。
- 哪些旧产物要标记为 superseded。
- 哪些节点必须重新生成。
- 从哪个 Gate 重新开始。
- `PASS_WITH_RISK` 的风险接受记录如何延续到新版本。
- 实现完成后发现方案理解错误时如何回退到方案阶段。

初始规则方向：

- 业务目标不变时，默认沿用原 `requirement_id`。
- 通过 `v2`, `v3` 产物推进，不覆盖旧产物。
- 从最早受影响节点重新 Gate。
- 只有目标变成独立需求、独立排期或显著不同业务目标时，才新建流程。

### Wave 4: 通用 DocFlow Gate 与核心新建 Skill

状态：`solution-reviewer` 合同已补；其他核心 Skill 待新建或待补合同。

这些 Skill 不是简单“改造旧 Skill”，而是当前标准落地缺失的核心能力。其中 `solution-reviewer` 是全局方案审阅 Gate，所有需求都应经过它；它先于开发路径选择发生，并决定本需求适合直接开发还是进入 Speckit pipeline。

| Skill | 优先级 | 类型 | 责任 | 主要输出 |
| --- | --- | --- | --- | --- |
| `requirement-normalizer` | 高 | 新建或并入入口 Skill 合同 | 归一化飞书、HTML、Markdown、纯文本等原始需求。 | `00-需求资料/{requirement_id}__需求摘要__vN.md` |
| `specification-writer` | 高 | 新建 | 作为 Speckit 之外的通用规格生成入口，按 ESS 生成可审计技术规格。 | `01-技术方案/{requirement_id}__技术方案__vN.md` |
| `solution-reviewer` | 高 | 新建 | 作为 Specification Completeness Auditor，审阅技术方案是否满足 ESS、Gate、兼容、异常、测试要求。 | `02-方案审核/{requirement_id}__方案审核__vN.html|md` |
| `implementation-recorder` | 中 | 新建或并入实现 Skill 合同 | 根据 diff、测试、未完成项生成实现记录。 | `03-实现记录/{requirement_id}__实现记录__vN.md` |
| `test-feedback-classifier` | 中 | 新建或并入测试验收流程 | 结构化测试反馈并判断返工类型。 | `05-测试验收/{requirement_id}__测试验收__vN.html|md` |
| `gate-runner` | 中 | 新建 | 检查 manifest 与节点产物是否满足进入下一阶段条件。 | Gate 审计报告或 manifest 更新建议 |
| `code-review-normalizer` | 中 | 新建或并入代码审查流程 | 将多来源代码审查结果统一成 Code Review Schema。 | `04-代码审核/{requirement_id}__代码审核__vN.md` |
| `test-feedback-sync` | 中 | 新建或并入 Sync 流程 | 将测试发现的规格遗漏、Checklist 缺口和需求变化反向沉淀。 | Checklist / Schema / Sync 记录 |

#### `solution-reviewer` / Specification Completeness Auditor

这是当前最明确缺失的 Skill。

标准入口流：

```text
DeepSeek / 人工产出技术方案
        ↓
Codex 使用 solution-reviewer 审阅方案
        ↓
输出 02-方案审核 + 开发路径建议
        ↓
直接开发 或 唤醒 speckit-pipeline-confirmed-single
```

定位：

- 它属于 DocFlow 通用 Gate，不归属于 `speckit-pipeline-confirmed-single`。
- 每个需求只要存在 `01-技术方案`，都必须产生对应 `02-方案审核`。
- 它在开发路径选择前执行：不使用 Speckit 的需求，审阅通过后可以直接进入实现；需要完整 SDD 的需求，审阅通过后再唤醒 Speckit pipeline。
- 当 `solution-reviewer` 发现仍有核心待确认问题时，应输出 `BLOCKED_NEEDS_REVISION`，回到方案修订，而不是先进入 Speckit 再依赖 `speckit-clarify` 追问。

边界：

- 它负责审方案，不负责写技术方案。
- 它可以调用 `docflow-writer` 的产物路径规则，但不能替代 `docflow-writer`。
- 它必须输出 Gate Result。
- 它必须按问题严重级别列出 Critical / High / Medium / Low。
- 它必须判断是否可以进入实现。
- 它必须输出开发路径建议：`DIRECT_IMPLEMENTATION` / `SPECKIT_PIPELINE_REQUIRED` / `BLOCKED_NEEDS_REVISION`。
- 它的 Gate 结论必须早于任何实现动作，也必须早于是否唤醒 `speckit-pipeline-confirmed-single` 的决策。

输入：

- `library/{requirement_id}/01-技术方案/*`
- 可选 `specs/**`
- 可选当前代码事实
- `ess/specification-schema.md`
- `checklists/specification-checklist.md`
- `templates/gate-result-template.md`

输出：

- `library/{requirement_id}/02-方案审核/{requirement_id}__方案审核__vN.html|md`
- `manifest.md` 中方案审核节点状态
- 开发路径建议与理由

阻塞条件：

- 找不到技术方案。
- 技术方案缺必填章节。
- 行为约束、异常处理、兼容性、测试方案缺失。
- 方案存在 Critical / High 且未修复。
- `PASS_WITH_RISK` 缺少风险接受说明。

### Wave 5: Speckit 生命周期合同

状态：待改造。

目标：

- 把 SpecKit 机器事实源和 DocFlow 人工 Gate 视图连接起来。
- 每个阶段都有明确输入、输出、副作用和阻塞条件。
- pipeline Skill 不再靠隐式习惯推进，而是读取通用 Gate 产物与 manifest。
- `solution-reviewer` 不放在 Speckit 专属流程里；只有当方案审阅建议为 `SPECKIT_PIPELINE_REQUIRED`，或用户明确要求完整 SDD 流程时，才唤醒 `speckit-pipeline-confirmed-single`。
- `speckit-specify` 和 `speckit-clarify` 在新流程中的作用会减弱：它们不再负责从零理解需求，而是复用 `01-技术方案` 和 `02-方案审核`，生成/校验 `specs/**` 机器事实源。

| Skill | 优先级 | 处理方式 | 说明 |
| --- | --- | --- | --- |
| `speckit-specify` | 高 | 补合同 | 从已审阅的 `01-技术方案` / `02-方案审核` 派生或同步 `specs/spec.md`，避免重新解释需求。 |
| `speckit-clarify` | 高 | 补合同 | 默认校验无未决问题；若发现新核心问题，应阻塞并回到方案修订 / 方案审核，而不是在 pipeline 内扩大范围。 |
| `speckit-plan` | 高 | 补合同 | 定义技术计划、约束、风险和 Plan Gate。 |
| `speckit-tasks` | 高 | 补合同 | 定义任务拆解、任务 Gate、实现前准入。 |
| `speckit-analyze` | 中 | 补合同 | 定义跨 spec / plan / tasks / DocFlow 的一致性审计。 |
| `speckit-pipeline-confirmed-single` | 高 | 补合同，可能重写执行体 | 串联单需求全流程，必须严格执行 Gate。 |
| `speckit-pipeline-confirmed` | 中 | 补合同 | 多需求或批量流程，在 single 稳定后处理。 |
| `speckit-checklist` | 中 | 补合同 | 定义 Checklist 生成边界，不替代 Gate。 |
| `speckit-taskstoissues` | 低 | 补合同 | GitHub Issue 导出是可选集成，不作为主流程必需项。 |

推荐顺序：

1. 完成全局 `solution-reviewer` 合同，明确开发路径建议字段。
2. 更新 `speckit-pipeline-confirmed-single` 合同，让它只在方案审阅建议或用户明确要求时启动。
3. `speckit-specify`，明确复用 `specification-writer` 的方案产物。
4. `speckit-clarify`，明确只做未决问题校验和阻塞，不重新承担需求澄清主流程。
5. `speckit-plan`
6. `speckit-tasks`
7. `speckit-analyze`
8. `speckit-pipeline-confirmed`

说明：

这里不是把 `solution-reviewer` 归入 Speckit，而是把它作为 Speckit 的前置路由 Gate。`speckit-pipeline-confirmed-single` 启动后仍按自己的 `Preflight -> Domain Route -> Specify -> Clarify -> Plan -> Tasks -> Analyze -> Implement -> Sync -> Reconcile` 顺序执行，但 `Specify` 应消费已审阅方案，`Clarify` 应只做残余未决问题校验。若仍存在核心澄清问题，应回到 `01-技术方案` / `02-方案审核` 重新 Gate。

### Wave 6: 实现、同步与代码文档一致性

状态：待改造，部分可能需要重写。

目标：

- 实现 Skill 必须受已通过 Gate 的方案约束。
- 实现结果必须形成实现记录。
- 知识沉淀必须由 sync 负责，不写入 `library/` 长期事实。
- 代码与文档漂移必须有审计和修正流程。

| Skill | 优先级 | 处理方式 | 说明 |
| --- | --- | --- | --- |
| `speckit-implement` | 高 | 重写或大改 | 明确生产代码副作用、验证、回滚兼容、实现记录。 |
| `speckit-sync` | 高 | 补合同，后续可能改执行体 | 明确哪些事实进入 `.specify/business_domain/**`。 |
| `speckit-code-doc-reconcile` | 中 | 补合同 | 审计代码、spec、DocFlow、business_domain 是否一致。 |

`speckit-implement` 必须覆盖：

- 不得实现方案外行为。
- 不得补造未确认业务规则。
- 代码改动必须有验证记录。
- 涉及旧流程必须说明 rollback compatibility。
- 实现完成必须更新 `03-实现记录` 或触发 `implementation-recorder`。

`speckit-sync` 必须覆盖：

- Sync 输入来自 specs、实现结果、审核结论，而不是聊天片段。
- Sync 输出路径和结果写入 manifest。
- Sync 失败不能被视为完成知识沉淀。
- `library/{requirement_id}/` 不是长期知识库。

### Wave 7: 审查、报告与发布链路

状态：待改造。

目标：

- 代码审查、方案审阅、测试反馈、报告渲染都遵循 ESS 和 DocFlow。
- 在线文档发布有清晰身份、失败、备份和 manifest 记录边界。

| Skill | 优先级 | 处理方式 | 说明 |
| --- | --- | --- | --- |
| `code-review-excellence` | 中 | 补合同或适配 | 对齐 `ess/code-review-schema.md` 和 `04-代码审核`。 |
| `html-doc-style` | 低 | legacy | 只作为视觉参考，不能再做 DocFlow 路由。 |
| Lark/Feishu 文档 Skills | 中 | 下游适配 | 保持工具执行细节外置，标准包只定义 DocFlow 输出边界。 |
| `docflow-writer` | 已完成 | 维护 | 继续作为文档写入和发布入口。 |

后续可能新增：

- `code-reviewer`
- `review-report-writer`
- `test-acceptance-writer`

是否新建取决于现有 `code-review-excellence` 和 `docflow-writer` 的职责边界是否足够清楚。

### Wave 8: 领域 Skill 适配

状态：待规划。

目标：

- 领域 Skill 保持薄。
- 不复制本标准的大段规则。
- 当领域 Skill 参与需求开发时，必须写 DocFlow 产物和 manifest 活动。

范围：

- WMS 模块配置类 Skill
- WMS 节点配置类 Skill
- WMS 鉴权版配置 Skill
- 其他业务域重复配置 / 初始化 / 开仓 / 策略类 Skill

处理方式：

- 不逐个重写为大 Skill。
- 先定义一份 `domain-skill-adapter` 合同或指南。
- 领域 Skill 只声明：
  - 适用业务域
  - 输入参数
  - 产物节点
  - 副作用
  - 回滚或兼容边界
  - 如何引用本标准包

### Wave 9: Tooling 与产品集成

状态：远期规划，不在当前仓库实现。

#### work-journal-agent

目标：

标准流程落地后，日报不再依赖聊天记录碎片推断，而是读取标准产物。

硬边界：

- 新增标准产物数据源模式。
- 该模式必须与当前 Agent event 模式互斥。
- 两种数据源不能同时开启。
- 配置加载阶段发现同时开启应直接失败。

规划配置形态：

```toml
[journal_source]
type = "agent_events" # agent_events / ai_sdlc_artifacts

[sources.ai_sdlc_artifacts]
roots = [
  "/path/to/repo-a/library",
  "/path/to/repo-b/library"
]
```

`agent_events` 模式：

- 保留当前 Codex、OpenCode、Kun、ZCode、Claude、manual event 行为。
- 继续用 SQLite 保存事件、需求候选和日报。

`ai_sdlc_artifacts` 模式：

- 读取 `library/{requirement_id}/manifest.md`。
- 读取 Activity Log、Change History、Gate Result、产物路径。
- 日报显示 `数据来源：AI SDLC 标准产物`。
- 需求状态来自 manifest 和 Gate，不来自 AI 推断。

前置条件：

- manifest Activity Log 标准已定义。
- change-control 标准已定义。
- 至少有一个跨天需求样例能被 manifest 表达。

#### GitHub / Issue 集成

目标：

- 将任务或 Gate 结果导出为 GitHub Issue / PR 描述。
- 作为可选下游，不作为主流程必需项。

#### 报表 / Dashboard

目标：

- 汇总多个需求的状态、Gate 结果、阻塞项和 Sync 状态。
- 作为管理视图，不改变标准事实源。

## Skill 改造总表

| 名称 | 当前状态 | 目标状态 | 优先级 | Wave |
| --- | --- | --- | --- | --- |
| `docflow-writer` | 已实现 | 维护 | 已完成 | 2 |
| `requirement-normalizer` | 合同已补 | 新建执行 Skill 或入口适配；作为需求归一化入口 | 高 | 4 |
| `specification-writer` | 合同已补 | 新建执行 Skill；作为 Speckit 之外的通用规格生成入口，产物可被 `speckit-specify` 复用 | 高 | 4/5 |
| `solution-reviewer` | 已实现初版 | 维护并按实际方案审阅反馈迭代 | 高 | 4 |
| `implementation-recorder` | 缺失 | 新建或合并 | 中 | 4 |
| `test-feedback-classifier` | 缺失 | 新建或合并 | 中 | 4 |
| `gate-runner` | 合同已补 | 新建执行 Skill；作为通用 Gate 检查器 | 中 | 4 |
| `code-review-normalizer` | 合同已补 | 新建执行 Skill 或接入现有代码审查流程 | 中 | 7 |
| `test-feedback-sync` | 合同已补 | 新建执行 Skill 或接入测试验收 / Sync 流程 | 中 | 6/7 |
| `speckit-specify` | 合同已补 | 复用已审阅方案生成 / 同步 `specs/spec.md`；执行体待适配 | 高 | 5 |
| `speckit-clarify` | 合同已补 | 校验残余未决问题；发现核心问题则回退方案 Gate；执行体待适配 | 高 | 5 |
| `speckit-plan` | 待改造 | 合同明确 | 高 | 5 |
| `speckit-tasks` | 待改造 | 合同明确 | 高 | 5 |
| `speckit-analyze` | 待改造 | 合同明确 | 中 | 5 |
| `speckit-pipeline-confirmed-single` | 合同已补 | 作为方案审阅后的可选完整 SDD 路径；执行体待适配 | 高 | 5 |
| `speckit-pipeline-confirmed` | 待改造 | 合同明确 | 中 | 5 |
| `speckit-implement` | 待改造 | 重写或大改 | 高 | 6 |
| `speckit-sync` | 待改造 | 合同明确 | 高 | 6 |
| `speckit-code-doc-reconcile` | 待改造 | 合同明确 | 中 | 6 |
| `speckit-checklist` | 待改造 | 合同明确 | 中 | 5 |
| `speckit-taskstoissues` | 待改造 | 可选下游 | 低 | 9 |
| `code-review-excellence` | 待适配 | 代码审核合同明确 | 中 | 7 |
| `html-doc-style` | legacy | 退到视觉参考 | 低 | 7 |
| Lark/Feishu Skills | 外部工具 Skill | 输出边界适配 | 中 | 7 |
| WMS 领域 Skills | 外部领域 Skill | 薄适配 | 中 | 8 |
| `work-journal-agent` | 产品仓库 | 远期互斥数据源模式 | 中 | 9 |

## 近期执行顺序

1. [x] 完成本路线图，并吸收外部 v1.0 文档暴露的路线图缺口。
2. [x] 更新 `templates/artifact-manifest-template.md`，加入 Activity Log 和 Change History。
3. [x] 更新 `ai-sdlc/artifact-storage.md`，补充 superseded artifact 和 re-Gate 引用。
4. [x] 新建全局 `solution-reviewer` 合同，并登记到 `registry/skill-registry.md`。
5. [x] 在 `solution-reviewer` 合同中定义开发路径建议：直接实现 / 唤醒 Speckit / 阻塞返修。
6. [x] 调整 `speckit-pipeline-confirmed-single` 合同，明确它是方案审阅后的可选开发路径，不是默认必经路径。
7. [x] 登记 `specification-writer` 的通用规格生成合同，并明确其产物可作为轻量需求的规格事实和 Speckit specify 的输入。
8. [x] 调整 `speckit-specify` / `speckit-clarify` 合同，弱化从零需求澄清职责，强化复用与阻塞回退规则。
9. [x] 登记 `requirement-normalizer`、`gate-runner` 的 proposed 合同边界。
10. [x] 继续推进 `code-review-normalizer`、`test-feedback-sync` 等后续 Skill 合同。

## 阶段验收标准

### 标准层验收

- 每个核心阶段都有 ESS / Checklist / Gate / Artifact 规则。
- 每个标准文件有明确入口。
- 需求变更、返工、重新 Gate 有明确路径。

### Skill 层验收

- 每个 active 或 proposed 核心 Skill 都有 `skill-contracts/known-skills/*.md`。
- Registry 与合同一致。
- Skill 合同明确输入、输出、副作用、阻塞条件、Gate 要求。
- 新建 Skill 与现有 Skill 职责不重叠。

### DocFlow 层验收

- 每个需求目录能表达当前状态。
- Manifest 能表达今天发生了什么。
- 旧版本产物不会丢失。
- Gate 失败、风险通过、需求变更都能被追踪。

### 下游工具验收

- work-journal-agent 的标准产物源有清晰契约。
- 标准产物源与聊天事件源互斥。
- 日报可以从标准产物得到需求、状态、产出、风险、下一步。

## 暂不做

- 不在本仓库实现 `work-journal-agent` 代码。
- 不把所有外部 Skill 复制进本仓库。
- 不把 WMS 领域 Skill 重写成厚 Skill。
- 不把 `library/{requirement_id}/` 当长期知识库。
- 不用路线图替代 Gate 或 Skill Contract。
