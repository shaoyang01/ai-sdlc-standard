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
| 完整路线图 | 进行中 | 本文件作为后续 Skill 改造总入口。 |
| 需求变更流程 | 已新增基础标准 | `ai-sdlc/change-control.md` 定义中途变更、返工、误解需求后的重走 Gate 规则。 |
| Manifest 活动日志 | 待补 | 需要让 manifest 支持当前状态、今日活动、变更历史。 |
| 方案审阅 Skill | 待新建 | 需要真正审阅技术方案并输出 `02-方案审核` Gate 产物。 |
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

## 流程补齐清单

这些是后续需要逐步补齐的流程能力，不要求一次完成。

| 流程能力 | 当前情况 | 后续动作 |
| --- | --- | --- |
| 需求归一化 | 目前依赖用户输入和 SpecKit 入口。 | 规划 `requirement-normalizer` 合同，定义飞书、HTML、Markdown、纯文本需求如何进入 `00-需求资料`。 |
| 规格编写 | `docflow-writer` 能写文档，但不等于规格生成器。 | 明确 `specification-writer` 是否独立存在，或并入 `speckit-specify` 合同。 |
| 规格完整性审计 | 已规划 `solution-reviewer`，但需与 Specification Audit 对齐。 | 将 `solution-reviewer` 定位为 Specification Completeness Auditor / 方案审阅 Skill。 |
| Gate 执行 | 有 Gate 模板，但缺统一 Gate 执行 Skill。 | 规划 `gate-runner` 或强化 `gate-auditor`，统一 PASS / FAIL / PASS_WITH_RISK。 |
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

状态：下一阶段优先。

为什么先做：

如果不先定义“需求中途变更、方案返工、实现后发现理解错误”的规则，后续 pipeline、方案审阅、实现 Skill 都会缺少共同边界。

交付物：

- 新增 `ai-sdlc/change-control.md`（已完成基础版）
- 更新 `templates/artifact-manifest-template.md`
- 必要时更新 `ai-sdlc/artifact-storage.md`

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

### Wave 4: 核心新建 Skill

状态：待新建或待补合同。

这些 Skill 不是简单“改造旧 Skill”，而是当前标准落地缺失的核心能力。

| Skill | 优先级 | 类型 | 责任 | 主要输出 |
| --- | --- | --- | --- | --- |
| `solution-reviewer` | 高 | 新建 | 审阅技术方案是否满足 ESS、Gate、兼容、异常、测试要求。 | `02-方案审核/{requirement_id}__方案审核__vN.html|md` |
| `implementation-recorder` | 中 | 新建或并入实现 Skill 合同 | 根据 diff、测试、未完成项生成实现记录。 | `03-实现记录/{requirement_id}__实现记录__vN.md` |
| `test-feedback-classifier` | 中 | 新建或并入测试验收流程 | 结构化测试反馈并判断返工类型。 | `05-测试验收/{requirement_id}__测试验收__vN.html|md` |
| `gate-auditor` | 中 | 新建 | 检查 manifest 与节点产物是否满足进入下一阶段条件。 | Gate 审计报告或 manifest 更新建议 |

#### `solution-reviewer`

这是当前最明确缺失的 Skill。

边界：

- 它负责审方案，不负责写技术方案。
- 它可以调用 `docflow-writer` 的产物路径规则，但不能替代 `docflow-writer`。
- 它必须输出 Gate Result。
- 它必须按问题严重级别列出 Critical / High / Medium / Low。
- 它必须判断是否可以进入实现。

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
- pipeline Skill 不再靠隐式习惯推进，而是读取 Gate 产物与 manifest。

| Skill | 优先级 | 处理方式 | 说明 |
| --- | --- | --- | --- |
| `speckit-specify` | 高 | 补合同 | 定义原始需求如何进入 `specs/spec.md` 与 `00-需求资料`。 |
| `speckit-clarify` | 高 | 补合同 | 定义待确认问题如何阻塞后续阶段。 |
| `speckit-plan` | 高 | 补合同 | 定义技术计划、约束、风险和 Plan Gate。 |
| `speckit-tasks` | 高 | 补合同 | 定义任务拆解、任务 Gate、实现前准入。 |
| `speckit-analyze` | 中 | 补合同 | 定义跨 spec / plan / tasks / DocFlow 的一致性审计。 |
| `speckit-pipeline-confirmed-single` | 高 | 补合同，可能重写执行体 | 串联单需求全流程，必须严格执行 Gate。 |
| `speckit-pipeline-confirmed` | 中 | 补合同 | 多需求或批量流程，在 single 稳定后处理。 |
| `speckit-checklist` | 中 | 补合同 | 定义 Checklist 生成边界，不替代 Gate。 |
| `speckit-taskstoissues` | 低 | 补合同 | GitHub Issue 导出是可选集成，不作为主流程必需项。 |

推荐顺序：

1. `speckit-specify`
2. `speckit-clarify`
3. `speckit-plan`
4. `speckit-tasks`
5. `solution-reviewer`
6. `speckit-pipeline-confirmed-single`
7. `speckit-analyze`
8. `speckit-pipeline-confirmed`

说明：

`solution-reviewer` 放在 pipeline single 前，是因为 pipeline 必须知道方案审核 Gate 的真实输入和输出。

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
| `solution-reviewer` | 缺失 | 新建 | 高 | 4 |
| `implementation-recorder` | 缺失 | 新建或合并 | 中 | 4 |
| `test-feedback-classifier` | 缺失 | 新建或合并 | 中 | 4 |
| `gate-auditor` | 缺失 | 新建 | 中 | 4 |
| `speckit-specify` | 待改造 | 合同明确 | 高 | 5 |
| `speckit-clarify` | 待改造 | 合同明确 | 高 | 5 |
| `speckit-plan` | 待改造 | 合同明确 | 高 | 5 |
| `speckit-tasks` | 待改造 | 合同明确 | 高 | 5 |
| `speckit-analyze` | 待改造 | 合同明确 | 中 | 5 |
| `speckit-pipeline-confirmed-single` | proposed | 合同明确，执行体可重写 | 高 | 5 |
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

1. 完成本路线图。
2. 更新 `templates/artifact-manifest-template.md`，加入 Activity Log 和 Change History。
3. 更新 `ai-sdlc/artifact-storage.md`，补充 superseded artifact 和 re-Gate 引用。
4. 新建 `solution-reviewer` 合同，并登记到 `registry/skill-registry.md`。
5. 再改 `speckit-pipeline-confirmed-single` 合同。
6. 继续推进 Speckit 生命周期 Skill 合同。

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
