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
├── ROADMAP.md
├── ai-sdlc/
│   ├── lifecycle.md
│   ├── phase-gates.md
│   ├── artifact-flow.md
│   ├── artifact-storage.md
│   └── change-control.md
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
│   ├── sync-skill-contract.md
│   └── known-skills/
│       ├── sdlc-code-review-normalizer.md
│       ├── sdlc-docflow-writer.md
│       ├── sdlc-gate-runner.md
│       ├── sdlc-implementation-recorder.md
│       ├── sdlc-requirement-normalizer.md
│       ├── sdlc-specification-writer.md
│       ├── sdlc-solution-reviewer.md
│       ├── sdlc-speckit-clarify.md
│       ├── sdlc-speckit-specify.md
│       ├── sdlc-speckit-pipeline.md
│       ├── sdlc-test-feedback-classifier.md
│       └── sdlc-test-feedback-sync.md
├── skills/
│   ├── sdlc-code-review-normalizer/
│   │   ├── SKILL.md
│   │   └── references/
│   ├── sdlc-docflow-writer/
│   │   ├── SKILL.md
│   │   └── references/
│   ├── sdlc-gate-runner/
│   │   ├── SKILL.md
│   │   └── references/
│   ├── sdlc-implementation-recorder/
│   │   ├── SKILL.md
│   │   └── references/
│   ├── sdlc-requirement-normalizer/
│   │   ├── SKILL.md
│   │   └── references/
│   ├── sdlc-specification-writer/
│   │   ├── SKILL.md
│   │   └── references/
│   ├── sdlc-solution-reviewer/
│   │   ├── SKILL.md
│   │   └── references/
│   ├── sdlc-speckit-clarify/
│   │   ├── SKILL.md
│   │   └── references/
│   ├── sdlc-speckit-specify/
│   │   ├── SKILL.md
│   │   └── references/
│   ├── sdlc-test-feedback-classifier/
│   │   ├── SKILL.md
│   │   └── references/
│   └── sdlc-test-feedback-sync/
│       ├── SKILL.md
│       └── references/
├── templates/
│   ├── gate-result-template.md
│   ├── technical-specification-template.md
│   ├── artifact-manifest-template.md
│   └── skill-registry-entry-template.md
└── registry/
    └── skill-registry.md
```

说明：

- 上面的 `sdlc-*` 是标准包新增或重写后的安装目标。
- 仓库中未加 `sdlc-` 前缀的既有 Skill 目录或合同可以保留原样，用于历史对照或迁移过渡，但不属于标准包安装清单。
- 安装或同步到 Agent Skill 目录时，只同步 `skills/sdlc-*`，不要整包同步 `skills/`。

## 使用方式

1. 需求或方案进入下一阶段前，先查看 `ai-sdlc/phase-gates.md`。
2. 需要判断标准包下一步改造顺序时，先查看 `ROADMAP.md`。
3. 生成技术方案时，遵循 `ess/specification-schema.md` 和 `templates/technical-specification-template.md`。
4. 审阅方案时，使用 `checklists/specification-checklist.md` 和 `templates/gate-result-template.md`。
5. 需求中途变更、返工或理解错误时，遵循 `ai-sdlc/change-control.md`。
6. 过程产物落盘时，遵循 `ai-sdlc/artifact-storage.md`。
7. 改造或新增 Skill 时，先在 `registry/skill-registry.md` 中登记，再补充对应 `skill-contracts/`。
8. 安装可执行 Skill 时，先阅读 `PORTABILITY.md` 的安装边界，再从 `skills/sdlc-*` 同步到目标 Agent 的 Skill 目录。

## Skill 命名规则

- 标准包内新增或重写的可安装 Skill 一律使用 `sdlc-*` 命名。
- 对已有外部 Skill 的标准化改造也视为新增 Skill，只新增 `sdlc-*` 版本，不修改、不覆盖、不迁移原 Skill 本体。
- `skills/` 下的目录名、`SKILL.md` frontmatter `name`、`skill-contracts/known-skills/` 文件名和 `registry/skill-registry.md` 登记名必须一致。
- 仅有合同、执行体尚未实现的 Skill 只登记合同，不在 `skills/` 目录中占位。
- 原有外部 Skill 或未加前缀的历史目录可保留原样，但不能作为本标准包的安装目标名称。

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
2. 使用 `skills/sdlc-docflow-writer/` 生成 Markdown、HTML 或飞书文档。
3. 给其他常用 Skill 补充 Skill Contract。
4. 让工作流 Skill 在阶段之间输出 Gate Result。
5. 将测试发现的规格遗漏沉淀到 Checklist 和 Schema。
