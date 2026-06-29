# AI SDLC Standard

> Version: v0.1.0
> Status: portable standard package

## 定位

本标准包用于约束人工唤醒 Skill 的研发协作流程。

它不是某一个 Agent 的配置，也不是某一个 Skill 的实现，而是一套可迁移的公共标准。Codex、zcode、DeepSeek、其他 Agent 工具或人工流程都可以引用它。

## 核心目标

- 让需求分析、技术方案、方案审阅、代码实现、Code Review、测试反馈之间使用统一交接文档。
- 让每个 Skill 被主动唤醒时都有明确输入、输出、副作用和阻塞条件。
- 让 Gate 即使不能自动化，也可以人工检查并形成可传递结论。
- 避免实现阶段补业务规则、猜测未定义行为或扩大范围。

## 目录结构

```text
ai-sdlc-standard/
├── README.md
├── ai-sdlc/
│   ├── lifecycle.md
│   ├── phase-gates.md
│   ├── artifact-flow.md
│   └── artifact-storage.md
├── ess/
│   ├── specification-schema.md
│   ├── review-schema.md
│   ├── code-review-schema.md
│   └── test-feedback-schema.md
├── checklists/
│   ├── specification-checklist.md
│   ├── plan-checklist.md
│   ├── task-checklist.md
│   ├── implementation-checklist.md
│   └── code-review-checklist.md
├── skill-contracts/
│   ├── skill-contract-template.md
│   ├── producer-skill-contract.md
│   ├── auditor-skill-contract.md
│   ├── renderer-skill-contract.md
│   ├── executor-skill-contract.md
│   └── sync-skill-contract.md
├── templates/
│   ├── gate-result-template.md
│   ├── technical-specification-template.md
│   ├── artifact-manifest-template.md
│   └── skill-registry-entry-template.md
└── registry/
    └── skill-registry.md
```

## 使用方式

1. 需求或方案进入下一阶段前，先查看 `ai-sdlc/phase-gates.md`。
2. 生成技术方案时，遵循 `ess/specification-schema.md` 和 `templates/technical-specification-template.md`。
3. 审阅方案时，使用 `checklists/specification-checklist.md` 和 `templates/gate-result-template.md`。
4. 过程产物落盘时，遵循 `ai-sdlc/artifact-storage.md`。
5. 改造或新增 Skill 时，先在 `registry/skill-registry.md` 中登记，再补充对应 `skill-contracts/`。

## 文档门禁

当工作流暂时无法自动化时，节点推进依赖文档门禁：

- 每个需求使用独立目录：`library/{requirement_id}/`。
- 同一需求的不同节点产物放入不同子目录，例如 `01-技术方案/`、`02-方案审核/`、`04-代码审核/`。
- 文件名必须符合 `{requirement_id}__{artifact_type}__v{version}.{ext}`。
- Gate 文档必须包含 `PASS`、`FAIL` 或 `PASS_WITH_RISK`。
- 只有 `PASS` 或带风险接受说明的 `PASS_WITH_RISK` 可以进入下一节点。
- `library/{requirement_id}/` 是人工交接与门禁视图；`specs/**` 仍是 SpecKit 机器事实源。

## 迁移原则

- 不依赖 `.codex`、`.claude`、`.agents`、`.config` 等任何 Agent 配置目录。
- 不写死本机路径、仓库路径或工具路径。
- 标准包本身不直接修改代码、不执行命令、不写入业务知识库。
- 各 Agent 的 Skill 只引用本标准包，不复制大段规则到各自配置中。

## 推荐落地顺序

1. 建立本标准包。
2. 给常用 Skill 补充 Skill Contract。
3. 让文档生成 Skill 遵循 ESS 输出。
4. 让工作流 Skill 在阶段之间输出 Gate Result。
5. 将测试发现的规格遗漏沉淀到 Checklist 和 Schema。
