# AI SDLC Standard

> Version: v0.1.0  
> Status: portable standard package / draft  
> Language: zh-CN

## 项目定位

`ai-sdlc-standard` 是一套可迁移的 AI 辅助研发流程标准包，用于约束人工唤醒 Skill 时的研发协作流程。

它不是某一个 Agent 的配置目录，也不是某一个 Skill 的单体实现。Codex、zcode、DeepSeek、其他 Agent 工具或人工流程都可以引用本标准包。

本仓库当前提供：

- AI SDLC 生命周期、Gate、变更控制、复杂度路由和产物存储标准。
- ESS 技术方案、方案审核、代码审核、测试反馈 Schema。
- `sdlc-*` Skill 合同、Prompt Skill 执行体和 Registry。
- DocFlow 人工交接目录规范：`library/{requirement_id}/`。
- Speckit 项目投放治理、双轨隔离和 bootstrap 脚本。
- 标准包路径初始化、项目 bootstrap 和 Skill 合同校验脚本。

## 核心目标

- 让需求分析、技术方案、方案审阅、代码实现、Code Review、测试反馈之间使用统一交接文档。
- 让每个 Skill 被主动唤醒时都有明确输入、输出、副作用和阻塞条件。
- 让 Gate 即使不能自动化，也可以人工检查并形成可传递结论。
- 避免实现阶段补业务规则、猜测未定义行为或扩大范围。

## 当前实现状态

| 模块 | 当前状态 | 说明 |
| --- | --- | --- |
| 标准包结构 | 已建立 | `ai-sdlc/`、`ess/`、`checklists/`、`templates/`、`skill-contracts/`、`skills/`、`scripts/`、`registry/` 已存在。 |
| DocFlow | 可用 | 使用 `library/{requirement_id}/` 作为人工交接和 Gate 视图。 |
| `sdlc-*` Skill | prompt skill ready | 当前 `skills/sdlc-*` 是可安装 Prompt Skill，不等同于独立工具服务。 |
| 标准包路径初始化 | tooling ready | `scripts/init-standard-home.sh` 可写入 `AI_SDLC_STANDARD_HOME`。 |
| Speckit 项目投放 | tooling ready | `scripts/bootstrap-speckit-project.sh` 可生成 profile、project-context 和 reports。 |
| 合同校验 | tooling ready | `scripts/validate-skill-contracts.rb` 校验 contract、manifest、registry、路径和双轨隔离风险。 |
| 真实项目验证 | 待开展 | 需要通过真实 Java 后端项目 dry-run 和需求闭环继续验证。 |

## 快速开始

### 1. 初始化标准包路径

```bash
scripts/init-standard-home.sh --dry-run
scripts/init-standard-home.sh
```

脚本会向 shell profile 写入受控块：

```bash
export AI_SDLC_STANDARD_HOME='<path-to-ai-sdlc-standard>'
```

更多配置见：[配置指南](docs/CONFIGURATION.md)。

### 2. 校验 Skill 合同和入口一致性

```bash
ruby scripts/validate-skill-contracts.rb
```

更多校验规则见：[校验指南](docs/VALIDATION.md)。

### 3. 对目标项目执行 Speckit bootstrap dry-run

```bash
scripts/bootstrap-speckit-project.sh <target-project-path> --dry-run
```

bootstrap 会预览将生成的 `.specify` profile、`.specify/project-context/**`、`.specify/reports/**`、`library/` 和 `.gitignore` 变更。它不会生成或复制 `.specify/business_domain/**`，也不会创建 `specs/**`。

更多投放规则见：[Speckit 投放指南](docs/SPECKIT_BOOTSTRAP.md)。

## 文档导航

| 文档 | 用途 |
| --- | --- |
| [使用指南](docs/USAGE.md) | 说明普通需求、复杂需求、DocFlow、Gate 和 Speckit pipeline 的使用方式。 |
| [配置指南](docs/CONFIGURATION.md) | 说明 `AI_SDLC_STANDARD_HOME`、初始化脚本、安装边界和标准包路径解析。 |
| [Speckit 投放指南](docs/SPECKIT_BOOTSTRAP.md) | 说明 bootstrap、双轨隔离、project-context、reports 和 legacy inventory。 |
| [Skill 开发指南](docs/SKILL_DEVELOPMENT.md) | 说明 `sdlc-*` 命名、合同、Registry、Manifest、副作用边界。 |
| [校验指南](docs/VALIDATION.md) | 说明 `validate-skill-contracts.rb`、bootstrap dry-run 和真实项目验证检查项。 |
| [路线图阅读指南](docs/ROADMAP_GUIDE.md) | 说明如何使用 `ROADMAP.md` 判断下一步改造方向。 |
| [ROADMAP.md](ROADMAP.md) | 项目路线图和 Wave 级推进计划。 |

## 核心目录

```text
ai-sdlc/          AI SDLC 生命周期、Gate、Artifact、变更控制、Speckit 治理标准
checklists/       各阶段人工或 Skill 审查清单
ess/              技术方案、方案审核、代码审核、测试反馈 Schema
skill-contracts/  Skill 分类、合同模板和已知 Skill 合同
skills/           可安装的 sdlc-* Prompt Skill
scripts/          标准包初始化、Speckit bootstrap、合同校验脚本
templates/        DocFlow、Manifest、Project Profile、Speckit 报告模板
registry/         Skill Registry
```

完整入口列表以 `manifest.yaml` 为准。

## 重要边界

- 标准包不依赖 `.codex`、`.claude`、`.agents`、`.config` 等 Agent 配置目录。
- 标准包不会在未获用户明确触发时自动执行命令、修改代码或写入业务知识库。
- 安装或同步到 Agent Skill 目录时，只同步 `skills/sdlc-*`，不要整包同步 `skills/`。
- 旧版 Speckit 文档 `.specify/memory/**`、`.specify/workflow/**`、`.specify/coding_guide/**` 不作为新版内容来源。
- `specs/**` 和 `.specify/business_domain/**` 是流程产物，不是项目 bootstrap 的迁移对象。
- `sdlc-speckit-pipeline` 不是所有需求的默认流程；是否进入完整 SDD 由 `sdlc-solution-reviewer` 的方案审核和开发路径建议决定。

## 推荐下一步

当前仓库已经完成标准包雏形和基础工具硬化。下一阶段建议以真实项目验证为主：

1. 选择一个真实 Java 后端项目。
2. 执行 `scripts/bootstrap-speckit-project.sh <target> --dry-run`。
3. 检查 generation report、project-context candidate、legacy inventory 和双轨隔离。
4. 选择一条小需求跑 Direct Implementation 闭环。
5. 再选择一条复杂需求验证 Speckit pipeline。

验证结果应反向沉淀到 Checklist、Schema、Skill 合同和脚本，而不是继续无依据扩展新能力。
