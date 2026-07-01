# AI SDLC Standard Roadmap

> Version: v0.1.0  
> Status: draft / portable standard package  
> Purpose: 跟踪 `ai-sdlc-standard` 从标准包、Prompt Skill、投放脚本到真实项目验证的推进方向。

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
| `sdlc-docflow-writer` | 已完成 | 负责生成 Markdown、HTML、飞书文档，并更新 manifest。 |
| 安装边界 | 已完成 | 安装 Skill 只是复制副本，必须由用户明确触发。 |
| README / docs 拆分 | 已完成 | README 已变成入口文档，使用、配置、投放、Skill 开发、校验、路线图说明拆到 `docs/`。 |
| 需求变更流程 | 已新增基础标准 | `ai-sdlc/change-control.md` 定义中途变更、返工、误解需求后的重走 Gate 规则。 |
| Manifest 活动日志 | 已补模板与存储规则 | `templates/artifact-manifest-template.md` 和 `ai-sdlc/artifact-storage.md` 已支持 Activity Log、Change History、Superseded、Re-Gate。 |
| 方案审阅 Skill | 已实现初版 | `skills/sdlc-solution-reviewer/` 已实现全局 DocFlow Gate、开发路径建议和阻塞条件。 |
| Skill 分类治理 | 已补 | `skill-contracts/skill-category-guide.md` 已定义 Intake / Producer / Auditor / Reviewer / Executor / Renderer / Publisher / Sync / Workflow 的分类和副作用边界。 |
| Speckit 生命周期 Skill | 进行中 | `sdlc-speckit-pipeline` 及 specify / clarify / plan / tasks / analyze / checklist / implement / sync / reconcile 已有初版；不再规划多 Agent 版本 pipeline。 |
| Speckit 项目投放 | tooling ready | `scripts/bootstrap-speckit-project.sh` 已具备 dry-run、profile、project-context、reports、双轨隔离和 code evidence 生成能力。 |
| 方案审核分流与文档治理收口 | 下一阶段大方向 | 需要把方案审核后的开发路径建议、Direct Implementation、Speckit Pipeline、business_domain 文档治理尾段统一成标准流程。 |
| 多代码库需求 | 后续优化方向 | 需要补充全局需求主流程、每仓子流程、Cross-Repo Gate 和 artifact placement policy。 |
| work-journal 集成 | 远期规划 | 未来读取标准产物，不再依赖聊天碎片；必须与现有事件源互斥。 |

## 核心原则

- 标准仓库是事实源；Agent Skill 目录只是安装副本。
- 每个 Skill 先定义合同，再决定是否重写执行体。
- `sdlc-docflow-writer` 负责写文档，不负责判断文档是否合格。
- 审阅、实现、同步、日报这类能力必须分层，不混在一个 Skill 里。
- 所有 Gate 必须能落到 `library/{requirement_id}/manifest.md` 和对应节点产物。
- 需求变化不删除历史产物，通过版本、superseded 标记和 re-Gate 记录处理。
- 在修改或重写 Skill 前，必须先模拟输入状态和边界数据，再编码或写合同。
- 已建立的标准文件不做推翻式大改。后续以增量补充、合同接入、示例验证为主。
- 外部 v1.0 文档只作为缺口校准来源，不按其目录结构照搬，也不覆盖本仓库已稳定的标准结构。
- Specification Audit 是所有需求的通用 Gate，不归属于某一条 SpecKit pipeline；DeepSeek 或人工产出技术方案后，Codex 应先通过 `sdlc-solution-reviewer` 审阅方案。
- `sdlc-solution-reviewer` 不只判断方案是否可实现，还要给出开发路径建议：`DIRECT_IMPLEMENTATION`、`SPECKIT_PIPELINE_REQUIRED` 或 `BLOCKED_NEEDS_REVISION`。
- 在新流程中，`sdlc-specification-writer` 与 `sdlc-solution-reviewer` 会前置承担大部分 Specify / Clarify 责任；进入 Speckit 时，通常不应再出现需要重新澄清的核心需求问题。
- 如果需求使用 Speckit pipeline，pipeline 消费的是已审阅通过的方案和路由建议；方案审阅不是 Speckit 内部阶段。
- 如果需求走直接实现，也不能完全绕开文档治理；实现后仍需要进入轻量文档治理尾段，至少完成实现记录、代码审查、测试反馈、必要的 business_domain sync 和 code-doc reconcile。
- business_domain 文档治理不是完整 Speckit SDD 的专属能力；它应该被抽象成所有实现路径都可能使用的收口阶段。
- 单代码库需求的 DocFlow 产物默认跟随目标代码库；多代码库需求的全局产物必须放在统一 global artifact workspace，仓库局部产物仍留在各自代码库，通过 manifest 互相引用。
- Renderer 只能改变展示形式，不能承担需求理解、业务语义补全或规格内容生成。

## 推进方式

后续推进分成四类任务，避免把标准、Skill 实现、下游产品和真实项目验证混在一起：

| 任务类型 | 做什么 | 不做什么 |
| --- | --- | --- |
| 标准补齐 | 补缺失流程、补 manifest 字段、补 change-control、补 Gate 映射。 | 不重写已稳定的 ESS、Gate、生命周期正文。 |
| Skill 接入 | 为 Skill 补合同、登记 registry、明确输入输出副作用。 | 不把所有外部 Skill 复制进本仓库。 |
| 执行体改造 | 在目标 Agent Skill 目录或对应产品仓库新增 `sdlc-*` 可执行 Skill。 | 不修改、不覆盖原有外部 Skill；不在标准包里直接改业务代码或产品代码。 |
| 样例验证 | 用真实项目 dry-run、Direct Implementation 和 Speckit 需求闭环验证标准。 | 不用未验证假设继续扩展大量新能力。 |

每个后续任务都应按这个顺序执行：

1. 模拟输入数据和当前状态。
2. 判断属于标准补齐、Skill 接入、执行体改造还是样例验证。
3. 如果是 Skill，先补合同，再决定是否写或改执行体。
4. 如果会影响 Gate，先明确 manifest 和 DocFlow 产物如何表达。
5. 如果会影响 direct / Speckit 分流，先明确方案审核输出字段和后续收口路径。
6. 如果会影响多代码库需求，先明确全局产物与仓库局部产物的放置边界。
7. 提交前检查 registry、contract、README/docs、manifest 入口是否一致。

## 外部 v1.0 文档吸收策略

`AI_SDLC_Docs_v1.0 (1)` 中的三份文档提供的是流程校准，不是迁移目标。当前仓库已经有 `ai-sdlc/`、`ess/`、`templates/`、`registry/`、`skill-contracts/` 等结构，因此后续只吸收以下问题：

| 问题 | 当前路线图处理 |
| --- | --- |
| 开发前缺 Specification Audit | 将 `sdlc-solution-reviewer` 明确为所有需求通用的 Specification Completeness Auditor，并要求它在选择开发路径前完成。 |
| Skill 缺统一分类 | 增加 Intake / Producer / Auditor / Renderer / Executor / Reviewer / Sync 分类治理。 |
| Renderer 与 Producer 容易混淆 | 明确 `sdlc-specification-writer` 负责语义规格，`html-doc-style` 和 `sdlc-docflow-writer` 不负责补业务内容。 |
| Speckit Specify / Clarify 职责漂移 | 明确 `sdlc-specification-writer` 产物可作为轻量需求的规格事实；进入 Speckit 时，`sdlc-speckit-specify` / `sdlc-speckit-clarify` 以复用和校验前置产物为主。 |
| Gate 输出需要统一 | 已实现 `sdlc-gate-runner` 初版，后续用真实 manifest 样例迭代 PASS / FAIL / PASS_WITH_RISK 与 Re-Gate 检查细节。 |
| Review 报告不可执行 | 已实现 `sdlc-code-review-normalizer` 初版，把多来源 Review 归一到 Code Review Schema；后续用真实 Review 样例迭代。 |
| 测试问题没有反向沉淀 | 已实现 `sdlc-test-feedback-sync` 初版，把 Specification Missing / Requirement Change 等分类转成 Checklist、Schema、manifest 或 change-control 建议。 |
| 直接实现缺少文档治理收口 | 新增下一阶段方向：Direct Implementation 完成后仍进入轻量 documentation governance tail。 |
| 多代码库需求缺跨仓 Gate | 作为下一阶段后续优化方向，补全 global requirement flow、repo subflow 和 Cross-Repo Gate。 |
| 多代码库产物放置边界不清 | 作为下一阶段后续优化方向，补全 artifact placement policy：单仓跟代码库，多仓全局产物进统一 workspace，局部产物留在各仓库。 |

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
| Workflow | 编排多个阶段和 Skill，维护 Gate、确认和 Re-Gate 顺序。 | 不吞掉子 Skill 的阻塞条件，不绕过用户确认边界。 |

## 流程补齐清单

这些是后续需要逐步补齐的流程能力，不要求一次完成。

| 流程能力 | 当前情况 | 后续动作 |
| --- | --- | --- |
| 需求归一化 | `sdlc-requirement-normalizer` 为 `prompt_skill_ready`。 | 后续通过真实需求样例迭代飞书、HTML、Markdown、纯文本等来源进入 `00-需求资料` 的细节。 |
| 规格编写 | `sdlc-docflow-writer` 能写文档，但不等于规格生成器。 | `sdlc-specification-writer` 作为 Speckit 之外的通用规格生成入口；小需求可直接把其产物作为规格事实。 |
| 规格完整性审计 | `sdlc-solution-reviewer` 已实现初版。 | 明确方案审核必须输出开发路径建议和后续文档治理收口建议。 |
| Gate 执行 | `sdlc-gate-runner` 为 `prompt_skill_ready`。 | 统一 PASS / FAIL / PASS_WITH_RISK、风险接受、superseded artifact、Re-Gate、development path decision 和 doc governance tail 检查。 |
| 复杂度分级 | 已补基础标准 | `ai-sdlc/complexity-routing.md` 定义 SIMPLE / MEDIUM / COMPLEX / BLOCKED_UNKNOWN，并接入开发路径决策。 |
| 开发路径分流 | 已有基础，但需强化 | 将 `DIRECT_IMPLEMENTATION`、`SPECKIT_PIPELINE_REQUIRED`、`BLOCKED_NEEDS_REVISION` 固化为方案审核后的必填决策，并记录到 manifest。 |
| 直接实现后的文档治理尾段 | 下一阶段重点 | Direct Implementation 完成后仍需执行实现记录、代码审核、测试反馈、必要的 sync 与 reconcile。 |
| business_domain 文档治理 | 已由 Speckit 相关 Skill 承担初版 | 从完整 Speckit pipeline 中抽象出可复用的 documentation governance tail，供 Direct Implementation 和 Speckit 路径共用。 |
| 多代码库需求 | 后续优化方向 | 新增 multi-repository flow 和 Cross-Repo Gate，处理全局需求主流程与各仓子流程。 |
| 产物放置策略 | 后续优化方向 | 单仓需求产物跟目标代码库走；多仓需求全局产物进统一 artifact workspace，局部产物留在各代码库，并通过 manifest 双向引用。 |
| 上线准入阶段总结 | 当前标准包有 Test/Code Review，发布执行动作不进入工作流。 | 后续只补测试后的阶段性总结规则；该结论不是 Gate，不阻塞节点流转，不代表需求结束。 |
| Code Review 归一化 | `sdlc-code-review-normalizer` 为 `prompt_skill_ready`。 | 后续统一 DeepSeek/Codex/人工 Review 输出的真实样例和边界规则。 |
| 测试反馈反向沉淀 | `sdlc-test-feedback-sync` 为 `prompt_skill_ready`。 | 后续用真实测试反馈沉淀样例迭代 Checklist/Schema/Skill 规则建议。 |
| 知识同步 | `sdlc-speckit-sync` 为 `prompt_skill_ready`。 | 后续通过真实实现记录、代码审核和测试反馈样例迭代可同步事实、目标路径和冲突处理。 |
| Speckit 项目投放/初始化 | bootstrap 脚本为 `tooling_ready`，相关 Skill 为 `prompt_skill_ready`。 | 共享治理规则、文档治理和节点产物规格留在标准包；目标仓库通过脚本生成 project profile、entry coverage profile、business-domain bootstrap 配置，`business_domain/**` 由目标项目代码重新生成。 |
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

- `skills/sdlc-docflow-writer/`
- `skill-contracts/known-skills/sdlc-docflow-writer.md`
- `skills/sdlc-docflow-writer/references/execution-scenarios.md`
- `PORTABILITY.md` 安装边界补充
- `docs/USAGE.md`
- `docs/CONFIGURATION.md`
- `docs/SPECKIT_BOOTSTRAP.md`
- `docs/SKILL_DEVELOPMENT.md`
- `docs/VALIDATION.md`
- `docs/ROADMAP_GUIDE.md`

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

### Wave 4: 通用 DocFlow Gate 与核心新建 Skill

状态：`sdlc-requirement-normalizer`、`sdlc-specification-writer`、`sdlc-solution-reviewer`、`sdlc-gate-runner`、`sdlc-implementation-recorder`、`sdlc-code-review-normalizer`、`sdlc-test-feedback-classifier`、`sdlc-test-feedback-sync` 已实现初版；后续通过真实样例验证。

这些 Skill 都作为 `sdlc-*` 新 Skill 落地。即使能力来自既有 Skill 的标准化重做，也不修改、不覆盖原有外部 Skill。其中 `sdlc-solution-reviewer` 是全局方案审阅 Gate，所有需求都应经过它；它先于开发路径选择发生，并决定本需求适合直接开发、进入 Speckit pipeline，还是阻塞返修。

| Skill | 优先级 | 类型 | 责任 | 主要输出 |
| --- | --- | --- | --- | --- |
| `sdlc-requirement-normalizer` | 高 | 已实现初版 | 归一化飞书、HTML、Markdown、纯文本等原始需求。 | `00-需求资料/{requirement_id}__需求摘要__vN.md` |
| `sdlc-specification-writer` | 高 | 已实现初版 | 作为 Speckit 之外的通用规格生成入口，按 ESS 生成可审计技术规格。 | `01-技术方案/{requirement_id}__技术方案__vN.md` |
| `sdlc-solution-reviewer` | 高 | 已实现初版 | 作为 Specification Completeness Auditor，审阅技术方案是否满足 ESS、Gate、兼容、异常、测试要求，并输出开发路径建议。 | `02-方案审核/{requirement_id}__方案审核__vN.html|md` |
| `sdlc-implementation-recorder` | 中 | 已实现初版 | 根据 diff、测试、未完成项生成实现记录。 | `03-实现记录/{requirement_id}__实现记录__vN.md` |
| `sdlc-test-feedback-classifier` | 中 | 已实现初版 | 结构化测试反馈并判断返工类型。 | `05-测试验收/{requirement_id}__测试验收__vN.html|md` |
| `sdlc-gate-runner` | 中 | 已实现初版 | 检查 manifest 与节点产物是否满足进入下一阶段条件。 | Gate 审计报告或 manifest 更新建议 |
| `sdlc-code-review-normalizer` | 中 | 已实现初版 | 将多来源代码审查结果统一成 Code Review Schema。 | `04-代码审核/{requirement_id}__代码审核__vN.md` |
| `sdlc-test-feedback-sync` | 中 | 已实现初版 | 将测试发现的规格遗漏、Checklist 缺口和需求变化反向沉淀。 | Checklist / Schema / Sync 记录 |

#### `sdlc-solution-reviewer` / Specification Completeness Auditor

定位：

- 它属于 DocFlow 通用 Gate，不归属于 `sdlc-speckit-pipeline`。
- 每个需求只要存在 `01-技术方案`，都必须产生对应 `02-方案审核`。
- 它在开发路径选择前执行：不使用 Speckit 的需求，审阅通过后可以进入直接实现；需要完整 SDD 的需求，审阅通过后再唤醒 Speckit pipeline。
- 当 `sdlc-solution-reviewer` 发现仍有核心待确认问题时，应输出 `BLOCKED_NEEDS_REVISION`，回到方案修订，而不是先进入 Speckit 再依赖 `sdlc-speckit-clarify` 追问。

必须输出：

- Gate Result：`PASS` / `FAIL` / `PASS_WITH_RISK`。
- 开发路径建议：`DIRECT_IMPLEMENTATION` / `SPECKIT_PIPELINE_REQUIRED` / `BLOCKED_NEEDS_REVISION`。
- 推荐理由。
- 风险接受要求。
- 后续文档治理建议：是否需要 business_domain sync、code-doc reconcile、entry coverage、manifest 更新。

### Wave 5: Speckit 生命周期合同

状态：进行中。

目标：

- 把 SpecKit 机器事实源和 DocFlow 人工 Gate 视图连接起来。
- 每个阶段都有明确输入、输出、副作用和阻塞条件。
- pipeline Skill 不再靠隐式习惯推进，而是读取通用 Gate 产物与 manifest。
- `sdlc-solution-reviewer` 不放在 Speckit 专属流程里；只有当方案审阅建议为 `SPECKIT_PIPELINE_REQUIRED`，或用户明确要求完整 SDD 流程时，才唤醒 `sdlc-speckit-pipeline`。
- `sdlc-speckit-specify` 和 `sdlc-speckit-clarify` 在新流程中的作用会减弱：它们不再负责从零理解需求，而是复用 `01-技术方案` 和 `02-方案审核`，生成/校验 `specs/**` 机器事实源。

| Skill | 优先级 | 处理方式 | 说明 |
| --- | --- | --- | --- |
| `sdlc-speckit-specify` | 高 | 已实现初版 | 从已审阅的 `01-技术方案` / `02-方案审核` 派生或同步 `specs/spec.md`，避免重新解释需求。 |
| `sdlc-speckit-clarify` | 高 | 已实现初版 | 默认校验无未决问题；若发现新核心问题，应阻塞并回到方案修订 / 方案审核，而不是在 pipeline 内扩大范围。 |
| `sdlc-speckit-plan` | 高 | 已实现初版 | 定义技术计划、约束、风险和 Plan Gate。 |
| `sdlc-speckit-tasks` | 高 | 已实现初版 | 定义任务拆解、任务 Gate、实现前准入。 |
| `sdlc-speckit-analyze` | 中 | 已实现初版 | 定义跨 spec / plan / tasks / DocFlow 的一致性审计。 |
| `sdlc-speckit-pipeline` | 高 | 已实现初版 | 串联单需求全流程，必须严格执行 Gate。 |
| `sdlc-speckit-pipeline-batch` | - | 不规划 | 多 Agent 版本 pipeline 不再使用；并行 Agent 编排若未来需要，放到新的编排设计中另行规划。 |
| `sdlc-speckit-checklist` | 中 | 已实现初版 | 定义需求专用 Checklist 生成/校验边界，不替代 Gate。 |
| `sdlc-speckit-taskstoissues` | 低 | 待改造 | GitHub Issue 导出是可选集成，不作为主流程必需项。 |

说明：

这里不是把 `sdlc-solution-reviewer` 归入 Speckit，而是把它作为 Speckit 的前置路由 Gate。`sdlc-speckit-pipeline` 启动后仍按自己的 `Preflight -> Domain Route -> Specify -> Clarify -> Plan -> Tasks -> Analyze -> Implement -> Sync -> Reconcile` 顺序执行，但 `Specify` 应消费已审阅方案，`Clarify` 应只做残余未决问题校验。若仍存在核心澄清问题，应回到 `01-技术方案` / `02-方案审核` 重新 Gate。

### Wave 6: 实现、同步与代码文档一致性

状态：进行中，`sdlc-speckit-implement` / `sdlc-speckit-sync` / `sdlc-speckit-code-doc-reconcile` 已实现初版，后续通过真实需求样例继续校正边界。

目标：

- 实现 Skill 必须受已通过 Gate 的方案约束。
- 实现结果必须形成实现记录。
- 知识沉淀必须由 sync 负责，不写入 `library/` 长期事实。
- 代码与文档漂移必须有审计和修正流程。

| Skill | 优先级 | 处理方式 | 说明 |
| --- | --- | --- | --- |
| `sdlc-speckit-implement` | 高 | 已实现初版 | 明确生产代码副作用、验证、回滚兼容、实现记录。 |
| `sdlc-speckit-sync` | 高 | 已实现初版 | 明确哪些事实进入 `.specify/business_domain/**`。 |
| `sdlc-speckit-code-doc-reconcile` | 中 | 已实现初版 | 审计代码、spec、DocFlow、business_domain、manifest 是否一致。 |

### Wave 6.5: 方案审核分流与文档治理收口

状态：下一阶段大方向。

为什么要做：

当前 `sdlc-solution-reviewer` 已经负责输出开发路径建议，`sdlc-speckit-pipeline` 已经作为完整 SDD 的可选路径存在。但由于 `sdlc-speckit-pipeline` 内部承担了 business_domain 文档治理、sync 和 code-doc reconcile 等收尾能力，直接实现路径如果完全绕开 Speckit，会导致实现后的长期知识沉淀和代码文档一致性缺口。

因此下一阶段需要把“完整 Speckit SDD”和“文档治理尾段”拆开：

```text
方案审核
  ↓
开发路径建议
  ├─ DIRECT_IMPLEMENTATION
  │    ↓
  │  直接实现
  │    ↓
  │  Documentation Governance Tail
  │    ├─ 实现记录
  │    ├─ 代码审核
  │    ├─ 测试反馈
  │    ├─ 必要的 business_domain sync
  │    └─ code-doc reconcile
  │
  ├─ SPECKIT_PIPELINE_REQUIRED
  │    ↓
  │  完整 Speckit SDD
  │    ↓
  │  Documentation Governance Tail
  │
  └─ BLOCKED_NEEDS_REVISION
       ↓
     回到方案修订与方案审核
```

目标：

- 明确 `02-方案审核` 必须输出开发路径建议。
- 明确 direct implementation 不是“无治理实现”，而是“不进入完整 SDD，但仍需要实现后文档治理收口”。
- 将 business_domain sync 和 code-doc reconcile 从“Speckit pipeline 内部收尾”抽象成所有实现路径可共用的 Documentation Governance Tail。
- 避免为了获得 business_domain 文档治理能力而强制所有需求进入完整 Speckit pipeline。
- 明确哪些需求只需要轻量文档治理，哪些必须完整 SDD。

#### 开发路径建议字段

`02-方案审核` 应至少输出：

```text
Development Path Recommendation: DIRECT_IMPLEMENTATION | SPECKIT_PIPELINE_REQUIRED | BLOCKED_NEEDS_REVISION
Recommendation Reason:
Documentation Governance Required: yes/no
Documentation Governance Scope:
  - implementation_record
  - code_review
  - test_feedback
  - business_domain_sync
  - code_doc_reconcile
  - entry_coverage_check
Risk Acceptance Required: yes/no
Re-Gate Starting Point:
```

#### Direct Implementation 路径

适用：

- 需求边界清晰。
- 技术方案完整。
- 改动单仓或低耦合。
- 不涉及复杂状态机、跨业务域、复杂数据迁移或高风险回滚。
- 不需要完整 `specs/plan.md` / `specs/tasks.md` / `analyze` Gate。

流程：

```text
00-需求资料
  ↓
01-技术方案
  ↓
02-方案审核：DIRECT_IMPLEMENTATION
  ↓
实现
  ↓
03-实现记录
  ↓
04-代码审核
  ↓
05-测试验收
  ↓
Documentation Governance Tail
```

Direct Implementation 完成后，如果实现中产生了稳定、可复用、会影响后续需求判断的事实，应进入文档治理尾段，而不是停在实现记录。

#### Speckit Pipeline 路径

适用：

- 多模块或多代码库复杂变更。
- 状态流、库存/订单/履约等核心业务流变化。
- DB / MQ / listener / schedule / batch / rpc_provider 组合变化。
- 回滚、灰度、兼容性、数据迁移或幂等策略复杂。
- 方案审核认为直接实现风险不可接受。

流程：

```text
00-需求资料
  ↓
01-技术方案
  ↓
02-方案审核：SPECKIT_PIPELINE_REQUIRED
  ↓
sdlc-speckit-pipeline
  ↓
Documentation Governance Tail
```

完整 Speckit pipeline 仍然包含 Specify / Clarify / Plan / Tasks / Analyze / Implement / Sync / Reconcile，但其中的 Sync / Reconcile 能力后续应被抽象成可复用的治理尾段。

#### Documentation Governance Tail

该尾段不是完整 Speckit SDD，也不是新需求重新分析阶段。

输入：

- 已通过的 `01-技术方案`。
- 已通过的 `02-方案审核`。
- 实现记录。
- Code Review 结果。
- 测试反馈。
- 代码 diff 或实现证据。
- 项目 profile 与 business-domain bootstrap 配置。

输出：

- `03-实现记录` 完整或更新。
- `04-代码审核` 完整或更新。
- `05-测试验收` 完整或更新。
- `.specify/business_domain/**` 的 sync proposal 或授权写入结果。
- code-doc reconcile report。
- manifest 的 Sync / Reconcile / Re-Gate 记录。

原则：

- 不因为需要 sync/reconcile 就强制进入完整 SDD。
- 不把聊天片段写入 business_domain。
- 不将 `library/{requirement_id}/` 当长期知识库。
- 不用 reconcile 把代码漂移合法化；发现 drift 时应回到最早受影响节点。
- Sync 写入需要明确目标路径和授权。

#### 需要补的标准和 Skill 边界

| 项目 | 处理方式 | 说明 |
| --- | --- | --- |
| `ai-sdlc/development-path-governance.md` | 新增标准 | 定义方案审核后的 direct / Speckit / blocked 分流和治理尾段。 |
| `templates/gate-result-template.md` | 更新 | 增加开发路径建议和文档治理建议字段。 |
| `templates/artifact-manifest-template.md` | 更新 | 增加 Development Path Decision 与 Documentation Governance Tail 记录。 |
| `skills/sdlc-solution-reviewer` | 更新合同和 references | 强化方案审核输出路径建议与治理尾段建议。 |
| `skills/sdlc-gate-runner` | 更新合同和 references | 检查路径决策和治理尾段是否满足进入实现/收口条件。 |
| `skills/sdlc-speckit-sync` | 更新说明 | 从 Speckit-only sync 扩展为 Documentation Governance Tail 可复用能力。 |
| `skills/sdlc-speckit-code-doc-reconcile` | 更新说明 | 从 Speckit-only reconcile 扩展为所有实现路径可复用的一致性审计能力。 |
| `docs/USAGE.md` | 更新 | 增加 Direct Implementation + Documentation Governance Tail 流程图。 |

验收标准：

- `02-方案审核` 无开发路径建议时，不能进入实现。
- Direct Implementation 不再被理解为“实现后流程结束”。
- 完整 Speckit pipeline 不再只是为了获得 business_domain 文档治理而被滥用。
- Sync / Reconcile 能被 direct 和 Speckit 两条路径复用，但仍保持授权、稳定事实、Re-Gate 边界。
- 至少用一条真实小需求验证 Direct Implementation + Documentation Governance Tail。
- 至少用一条复杂需求验证 Speckit Pipeline + Documentation Governance Tail。

### Wave 6.6: 多代码库需求、产物放置策略与 Cross-Repo Gate

状态：下一阶段后续优化方向。

为什么要做：

当一个需求涉及多个代码库时，如果每个仓库各自独立跑完整流程，容易丢失端到端业务一致性；如果只做一份全局方案，又容易忽略每个仓库的局部实现风险。如果把全部产物放进某一个业务代码库，会让该代码库被迫承担全局需求仓库职责；如果把全部局部产物放进全局仓库，又会让全局仓库变成实现细节大杂烩，并逐渐脱离代码事实。

因此多代码库需求需要先明确 artifact placement policy。

#### Artifact Placement Policy

核心原则：

```text
单代码库需求：
  产物跟代码库走。

多代码库需求：
  全局产物进入统一 global artifact workspace。
  仓库局部产物留在各自代码库。
  全局 manifest 引用局部产物。
  本地 manifest 反向引用全局 requirement。
```

三类仓库/位置必须分清：

| 位置 | 作用 | 不应承担 |
| --- | --- | --- |
| `ai-sdlc-standard` | 标准包，只放规则、模板、Skill、脚本。 | 不存放具体需求产物。 |
| `global artifact workspace` | 多代码库需求的全局产物、端到端方案、跨仓 Gate、联调、发布、回滚计划。 | 不沉淀每个仓库的全部局部实现细节。 |
| 业务代码库 | 本仓库相关方案、实现记录、代码审核、测试反馈、project-context、business_domain。 | 不承担跨仓全局主控仓库职责。 |

#### 单代码库需求

如果一个需求只涉及一个代码库，默认所有 DocFlow 产物都放在该代码库中：

```text
repo-a/
├── library/{requirement_id}/
│   ├── 00-需求资料/
│   ├── 01-技术方案/
│   ├── 02-方案审核/
│   ├── 03-实现记录/
│   ├── 04-代码审核/
│   ├── 05-测试验收/
│   └── manifest.md
└── .specify/
    ├── project-governance-profile.yaml
    ├── project-context/
    └── business_domain/
```

默认不需要 global artifact workspace，除非组织管理上明确要求纳入某个项目集。

#### 多代码库需求

如果一个需求涉及多个代码库，应使用统一 global artifact workspace 存放全局产物：

```text
global-artifact-repo/
└── library/{requirement_id}/
    ├── 00-需求资料/
    ├── 01-技术方案/
    │   └── {requirement_id}__端到端技术方案__v1.md
    ├── 02-方案审核/
    │   ├── {requirement_id}__端到端方案审核__v1.md
    │   └── {requirement_id}__cross-repo-gate__v1.md
    ├── 03-实现记录/
    │   └── {requirement_id}__跨仓实现汇总__v1.md
    ├── 04-代码审核/
    │   └── {requirement_id}__跨仓代码审核汇总__v1.md
    ├── 05-测试验收/
    │   └── {requirement_id}__端到端测试验收__v1.md
    ├── repos/
    │   ├── repo-a.md
    │   ├── repo-b.md
    │   └── repo-c.md
    └── manifest.md
```

每个业务代码库只保存本仓相关产物：

```text
repo-a/
└── library/{requirement_id}/
    ├── 01-技术方案/
    │   └── {requirement_id}__repo-a技术方案__v1.md
    ├── 02-方案审核/
    │   └── {requirement_id}__repo-a方案审核__v1.md
    ├── 03-实现记录/
    │   └── {requirement_id}__repo-a实现记录__v1.md
    ├── 04-代码审核/
    │   └── {requirement_id}__repo-a代码审核__v1.md
    ├── 05-测试验收/
    │   └── {requirement_id}__repo-a测试验收__v1.md
    └── manifest.md
```

#### 全局产物范围

global artifact workspace 存放：

- 端到端业务目标。
- 涉及代码库清单。
- 跨仓接口契约。
- 跨仓数据流。
- 跨仓状态流。
- 跨仓发布顺序。
- 跨仓回滚顺序。
- 联调计划。
- 端到端测试结果。
- Cross-Repo Gate。
- 各仓库局部产物引用。

#### 局部产物范围

业务代码库存放：

- 本仓入口。
- 本仓接口。
- 本仓 DB / MQ / RPC / Cache。
- 本仓兼容策略。
- 本仓测试。
- 本仓实现记录。
- 本仓代码审核。
- 本仓业务域事实。
- 本仓 `.specify/business_domain/**`。

#### business_domain 放置规则

本仓业务事实应放在各自代码库：

```text
repo-a/.specify/business_domain/**
repo-b/.specify/business_domain/**
```

原因：

```text
business_domain 应由目标代码库的代码事实、实现记录、测试反馈和稳定业务事实驱动。
```

跨仓业务视图可以放在 global artifact workspace，但不应替代各代码库自己的 `.specify/business_domain/**`：

```text
global-artifact-repo/library/{requirement_id}/01-技术方案/cross-repo-domain-view.md
```

该文档用于表达跨仓业务流程、状态流、术语映射、上下游契约和领域边界关系。

#### Manifest 引用关系

全局 manifest 应记录：

```yaml
requirement_id: <id>
scope: multi_repository

affected_repositories:
  - name: repo-a
    role: upstream_provider
    local_library: repo-a/library/<id>
    gate_status: PASS
    implementation_status: completed
    pr: <repo-a-pr-url>

cross_repo_gate:
  status: PASS
  artifact: 02-方案审核/<id>__cross-repo-gate__v1.md

integration_test:
  status: pending

release_order:
  - repo-a
  - repo-b

rollback_order:
  - repo-b
  - repo-a
```

本仓 manifest 应记录：

```yaml
requirement_id: <id>
scope: repository_local
repository: repo-a

parent_requirement:
  global_workspace: <global-artifact-repo>
  global_manifest: library/<id>/manifest.md

local_role:
  role: upstream_provider
  depends_on: []
  downstream:
    - repo-b

local_gate:
  solution_review: PASS

local_implementation:
  status: completed
  pr: <repo-a-pr-url>

doc_governance:
  business_domain_sync: required
  code_doc_reconcile: required
```

#### Cross-Repo Gate

推荐模型：

```text
Global Requirement Flow
  ↓
Repo A Subflow
Repo B Subflow
Repo C Subflow
  ↓
Cross-Repo Gate
  ↓
Integration Test / Release / Rollback Coordination
```

Cross-Repo Gate 检查：

- 所有 affected repositories 是否都有子方案。
- 所有子方案是否通过审核。
- 接口契约是否一致。
- 字段、状态、枚举、错误码是否一致。
- 上下游兼容策略是否一致。
- 发布顺序是否明确。
- 回滚顺序是否明确。
- 联调和测试责任是否明确。
- 是否存在某个仓库未准备好但其他仓库已经实现的风险。

#### 需要补的标准和模板

| 项目 | 处理方式 | 说明 |
| --- | --- | --- |
| `ai-sdlc/artifact-placement-policy.md` | 新增标准 | 定义单仓和多仓需求的产物放置规则。 |
| `ai-sdlc/multi-repository-flow.md` | 新增标准 | 定义全局需求主流程、仓库子流程和跨仓 Gate。 |
| `templates/global-requirement-manifest-template.md` | 新增模板 | 定义全局 manifest 字段。 |
| `templates/repository-subflow-manifest-template.md` | 新增模板 | 定义本仓子流程 manifest 字段。 |
| `templates/cross-repo-gate-template.md` | 新增模板 | 记录跨仓接口、字段、状态、发布、回滚、联调风险。 |
| `templates/artifact-manifest-template.md` | 更新 | 增加 affected_repositories、repo_gate_status、cross_repo_gate_status、integration_test_status、release_order、rollback_order。 |
| `docs/USAGE.md` | 更新 | 增加多代码库需求流程和产物放置策略。 |
| `sdlc-solution-reviewer` | 后续更新 | 支持识别多仓需求并要求 Cross-Repo Gate。 |
| `sdlc-gate-runner` | 后续更新 | 支持检查 repo subflow 与 cross-repo gate 状态。 |

多代码库需求暂不要求所有仓库都执行 Speckit bootstrap。只有长期纳入 AI SDLC / Speckit 文档治理的核心仓库才需要 bootstrap。

### Wave 7: 审查、报告与阶段总结

状态：待改造。

目标：

- 代码审查、方案审阅、测试反馈、上线准入阶段总结、报告渲染都遵循 ESS 和 DocFlow。
- 在线文档发布有清晰身份、失败、备份和 manifest 记录边界。
- 上线、灰度、投产等发布执行动作不进入本工作流。
- 上线准入结论只是测试后的阶段性总结，不作为任何节点 Gate，不阻塞后续知识同步、日报沉淀或其他收尾工作，也不代表需求已结束。

| Skill | 优先级 | 处理方式 | 说明 |
| --- | --- | --- | --- |
| `sdlc-code-review-excellence` | 中 | 已实现初版 | 执行标准化代码审查；正式报告归一化交给 `sdlc-code-review-normalizer`。 |
| `html-doc-style` | 低 | legacy | 只作为视觉参考，不能再做 DocFlow 路由。 |
| Lark/Feishu 文档 Skills | 中 | 下游边界定义 | 保持工具执行细节外置，标准包只定义 DocFlow 输出边界。 |
| `sdlc-docflow-writer` | 已完成 | 维护 | 继续作为文档写入和发布入口。 |

### Wave 8: 专业 Skill 边界

状态：不纳入本标准包改造范围。

目标：

- 明确 WMS 等专业 Skill 是领域执行能力，不是 AI SDLC 工作流节点。
- 本标准包不改造、不包装、不覆盖专业 Skill。
- 专业 Skill 被需求开发引用时，其输出只作为实现证据、附件或人工上下文；是否写 DocFlow / manifest 由当前需求工作流负责，不要求专业 Skill 自身承担。

处理方式：

- 不新增 `sdlc-domain-skill-guide`。
- 不新增 WMS 相关 `sdlc-*` 包装 Skill。
- 不要求专业 Skill 引用本标准包。
- 如果某个需求的研发流程使用了专业 Skill，仍由当前需求的 `sdlc-implementation-recorder`、`sdlc-code-review-excellence`、`sdlc-docflow-writer` 等工作流 Skill 记录证据和 Gate 状态。

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
| `sdlc-docflow-writer` | 已实现 | 维护 | 已完成 | 2 |
| `sdlc-requirement-normalizer` | 已实现初版 | 维护并按实际需求入口反馈迭代；作为需求归一化入口 | 高 | 4 |
| `sdlc-specification-writer` | 已实现初版 | 维护并按实际规格生成反馈迭代；产物可被 `sdlc-speckit-specify` 复用 | 高 | 4/5 |
| `sdlc-solution-reviewer` | 已实现初版 | 必须输出开发路径建议和文档治理收口建议 | 高 | 4/6.5 |
| `sdlc-implementation-recorder` | 已实现初版 | 维护并按真实实现记录样例迭代 | 中 | 4/6.5 |
| `sdlc-test-feedback-classifier` | 已实现初版 | 维护并按真实测试反馈样例迭代 | 中 | 4/6.5 |
| `sdlc-gate-runner` | 已实现初版 | 维护并按真实 manifest 样例迭代；检查路径决策、治理尾段与 Re-Gate | 中 | 4/6.5 |
| `sdlc-code-review-normalizer` | 已实现初版 | 维护并按真实代码审查样例迭代 | 中 | 7 |
| `sdlc-test-feedback-sync` | 已实现初版 | 维护并按真实测试反馈沉淀样例迭代 | 中 | 6/7 |
| `sdlc-speckit-specify` | 已实现初版 | 复用已审阅方案生成 / 同步 `specs/spec.md`；执行体待改造 | 高 | 5 |
| `sdlc-speckit-clarify` | 已实现初版 | 校验残余未决问题；发现核心问题则回退方案 Gate；执行体待改造 | 高 | 5 |
| `sdlc-speckit-plan` | 已实现初版 | 生成 / 校验 `specs/plan.md`；发现核心缺口则回退方案 Gate | 高 | 5 |
| `sdlc-speckit-tasks` | 已实现初版 | 生成 / 校验 `specs/tasks.md`；发现任务拆解需要补新行为则回退上游 Gate | 高 | 5 |
| `sdlc-speckit-analyze` | 已实现初版 | 审计 DocFlow / spec / plan / tasks 一致性；无阻塞后才进入实现 | 中 | 5 |
| `sdlc-speckit-pipeline` | 已实现初版 | 作为方案审阅后的可选完整 SDD 路径；只做阶段编排、Gate 停顿和 Re-Gate 路由 | 高 | 5 |
| `sdlc-speckit-pipeline-batch` | 不规划 | 多 Agent 版本 pipeline 不再使用；保留单 Agent `sdlc-speckit-pipeline` 作为标准路径 | - | - |
| `sdlc-speckit-implement` | 已实现初版 | 按 Analyze Gate 通过后的 tasks 执行代码改动；验证失败或方案外行为则阻塞回退 | 高 | 6 |
| `sdlc-speckit-sync` | 已实现初版 | 从 Speckit-only sync 扩展为 Documentation Governance Tail 可复用能力；只同步已验证稳定事实 | 高 | 6/6.5 |
| `sdlc-speckit-code-doc-reconcile` | 已实现初版 | 从 Speckit-only reconcile 扩展为所有实现路径可复用的一致性审计能力 | 中 | 6/6.5 |
| `sdlc-speckit-checklist` | 已实现初版 | 生成或校验需求专用 checklist；检查项必须可追溯，不替代 Gate、Analyze、Review 或测试验收 | 中 | 5 |
| `sdlc-speckit-taskstoissues` | 待改造 | 可选下游 | 低 | 9 |
| `sdlc-code-review-excellence` | 已实现初版 | 基于 diff、规格依据、实现记录和验证证据执行代码审查；不修代码，正式报告交给 normalizer | 中 | 7 |
| `html-doc-style` | legacy | 退到视觉参考 | 低 | 7 |
| Lark/Feishu Skills | 外部工具 Skill | 输出边界定义 | 中 | 7 |
| WMS / 业务专业 Skills | 外部专业 Skill | 不纳入本标准包改造；不新增 `sdlc-*` 包装 Skill | - | - |
| `work-journal-agent` | 产品仓库 | 远期互斥数据源模式 | 中 | 9 |

## 近期执行顺序

1. [x] 完成本路线图，并吸收外部 v1.0 文档暴露的路线图缺口。
2. [x] 更新 `templates/artifact-manifest-template.md`，加入 Activity Log 和 Change History。
3. [x] 更新 `ai-sdlc/artifact-storage.md`，补充 superseded artifact 和 re-Gate 引用。
4. [x] 新建全局 `sdlc-solution-reviewer` 合同，并登记到 `registry/skill-registry.md`。
5. [x] 在 `sdlc-solution-reviewer` 合同中定义开发路径建议：直接实现 / 唤醒 Speckit / 阻塞返修。
6. [x] 调整 `sdlc-speckit-pipeline` 合同，明确它是方案审阅后的可选开发路径，不是默认必经路径。
7. [x] 登记 `sdlc-specification-writer` 的通用规格生成合同，并明确其产物可作为轻量需求的规格事实和 Speckit specify 的输入。
8. [x] 调整 `sdlc-speckit-specify` / `sdlc-speckit-clarify` 合同，弱化从零需求澄清职责，强化复用与阻塞回退规则。
9. [x] 登记并实现 `sdlc-requirement-normalizer` 初版。
10. [x] 登记并实现 `sdlc-gate-runner` 初版，覆盖通用 Gate、风险接受、superseded artifact 和 Re-Gate 检查。
11. [x] 登记并实现 `sdlc-implementation-recorder` 初版，覆盖 diff、验证、未完成项、方案偏离和实现阻塞记录。
12. [x] 登记并实现 `sdlc-test-feedback-classifier` 初版，覆盖测试反馈分类、Re-Gate 路由和 `05-测试验收` 输出。
13. [x] 登记并实现 `sdlc-code-review-normalizer` 初版，覆盖 Review 归一化、严重级别、阻塞判断和修复路由。
14. [x] 登记并实现 `sdlc-test-feedback-sync` 初版，覆盖测试反馈到 Checklist / Schema / manifest / 后续知识同步建议。
15. [x] 登记并实现 `sdlc-speckit-specify` / `sdlc-speckit-clarify` 标准 Skill 初版，明确复用前置 DocFlow 产物并阻塞核心澄清回退。
16. [x] 登记并实现 `sdlc-speckit-plan` 初版，覆盖 Plan Gate、技术计划边界和回退规则。
17. [x] 登记并实现 `sdlc-speckit-tasks` 初版，覆盖 Task Gate、可追踪任务拆解和实现前准入。
18. [x] 登记并实现 `sdlc-speckit-analyze` 初版，覆盖实现前跨产物一致性审计和 Re-Gate 路由。
19. [x] 登记并实现 `sdlc-speckit-implement` 初版，覆盖生产代码副作用、验证、任务状态和实现记录边界。
20. [x] 登记并实现 `sdlc-speckit-sync` 初版，覆盖稳定事实同步、目标授权、冲突处理和 manifest Sync 记录。
21. [x] 登记并实现 `sdlc-speckit-code-doc-reconcile` 初版，覆盖代码、规格、DocFlow、知识库和 manifest 漂移审计与 Re-Gate 路由。
22. [x] 登记并实现 `sdlc-speckit-pipeline` 初版，覆盖完整 SDD 激活条件、阶段编排、用户确认边界和阻塞回退。
23. [x] 登记并实现 `sdlc-speckit-checklist` 初版，覆盖需求专用 checklist 生成、过期校验、可追溯检查项和 Re-Gate 路由。
24. [x] 登记并实现 `sdlc-code-review-excellence` 初版，覆盖标准化代码审查执行、阻塞判断、Re-Gate 和 normalizer 交接边界。
25. [x] 补充 `skill-contracts/skill-category-guide.md`，明确 Skill 分类、复合分类、默认副作用和合同检查清单。
26. [x] 新增 `scripts/validate-skill-contracts.rb`（`tooling_ready`），校验 `sdlc-*` Skill 合同分类、副作用权限、阻塞条件、manifest 覆盖和 registry 一致性。
27. [x] 新增 `ai-sdlc/complexity-routing.md`，明确复杂度分级、开发路径路由、完整 SDD override 和 `sdlc-solution-reviewer` 接入规则。
28. [x] 新增 `ai-sdlc/speckit-project-bootstrap.md`、`ai-sdlc/speckit-document-governance.md`、`ai-sdlc/standard-package-resolution.md` 与项目 profile 模板，明确标准库负责 Speckit 文档治理和投放初始化，`business_domain/**` 由目标仓库 bootstrap 重新生成。
29. [x] 新增 Speckit 来源模型、双轨隔离、代码驱动生成规格和生成/等价校验报告模板，明确旧版文档只作抽象样本或同项目 parity reference。
30. [ ] 新增 `ai-sdlc/development-path-governance.md`，定义方案审核后的 direct / Speckit / blocked 分流和 Documentation Governance Tail。
31. [ ] 更新 `templates/gate-result-template.md`，增加开发路径建议和文档治理建议字段。
32. [ ] 更新 `templates/artifact-manifest-template.md`，增加 Development Path Decision 与 Documentation Governance Tail 记录。
33. [ ] 更新 `sdlc-solution-reviewer` 合同与 references，强化方案审核后的路径建议与治理尾段建议。
34. [ ] 更新 `sdlc-gate-runner` 合同与 references，支持检查 direct implementation 和 doc governance tail 准入/收口。
35. [ ] 更新 `sdlc-speckit-sync` / `sdlc-speckit-code-doc-reconcile` 说明，明确它们可作为 Documentation Governance Tail 的可复用能力。
36. [ ] 在 `docs/USAGE.md` 中补充 Direct Implementation + Documentation Governance Tail 的流程。
37. [ ] 新增 `ai-sdlc/artifact-placement-policy.md`，定义单仓和多仓需求产物放置策略。
38. [ ] 新增 `ai-sdlc/multi-repository-flow.md` 和 `templates/cross-repo-gate-template.md`，作为多代码库需求的后续优化方向。
39. [ ] 新增 `templates/global-requirement-manifest-template.md` 和 `templates/repository-subflow-manifest-template.md`，表达全局 manifest 与本仓 manifest 的双向引用关系。
40. [ ] 更新 `docs/USAGE.md`，补充多代码库需求流程和 artifact placement policy。

## 阶段验收标准

### 标准层验收

- 每个核心阶段都有 ESS / Checklist / Gate / Artifact 规则。
- 每个标准文件有明确入口。
- 需求变更、返工、重新 Gate 有明确路径。
- 方案审核必须输出开发路径建议。
- Direct Implementation 和 Speckit Pipeline 都有明确文档治理收口规则。
- 单仓和多仓需求有明确 artifact placement policy。

### Skill 层验收

- 每个 active 或 proposed 核心 Skill 都有 `skill-contracts/known-skills/*.md`。
- Registry 与合同一致。
- Skill 合同明确输入、输出、副作用、阻塞条件、Gate 要求。
- `ruby scripts/validate-skill-contracts.rb` 通过。
- 新建 Skill 与现有 Skill 职责不重叠。
- `sdlc-solution-reviewer` 输出缺少 Development Path Decision 时，不能进入实现。

### DocFlow 层验收

- 每个需求目录能表达当前状态。
- Manifest 能表达今天发生了什么。
- 旧版本产物不会丢失。
- Gate 失败、风险通过、需求变更都能被追踪。
- Manifest 能表达 direct / Speckit / blocked 开发路径，以及 Documentation Governance Tail 状态。
- 多代码库需求中，全局 manifest 能引用各仓局部 manifest；各仓局部 manifest 能反向引用全局 requirement。

### 真实项目验收

- 至少有一个真实项目完成 bootstrap dry-run。
- 至少有一个小需求完成 Direct Implementation + Documentation Governance Tail。
- 至少有一个复杂需求完成 Speckit Pipeline + Documentation Governance Tail，或明确记录为什么暂缓。
- 至少有一个多代码库需求样例能验证 global artifact workspace + repository local artifacts 的放置策略。
- 至少有一个测试反馈能反向沉淀到 Checklist / Schema / manifest / sync 建议。

### 下游工具验收

- work-journal-agent 的标准产物源有清晰契约。
- 标准产物源与聊天事件源互斥。
- 日报可以从标准产物得到需求、状态、产出、风险、下一步。

## 暂不做

- 不在本仓库实现 `work-journal-agent` 代码。
- 不把所有外部 Skill 复制进本仓库。
- 不改造、不包装 WMS 等专业 Skill。
- 不把 `library/{requirement_id}/` 当长期知识库。
- 不把路线图替代 Gate 或 Skill Contract。
- 不因为需要 business_domain 文档治理而强制所有需求进入完整 Speckit SDD。
- 不把多代码库需求的全局产物放进 `ai-sdlc-standard`。
- 不把某一个业务代码库强制作为跨仓全局产物仓库。
- 不在多代码库需求标准稳定前实现多 Agent pipeline。
