# 配置指南

> 本指南说明当前仓库真实存在的配置方式、路径解析规则和安装边界。

## 配置目标

本标准包要求各 Agent 或人工流程通过同一份标准包读取规则，避免在 `.codex`、`.claude`、`.agents`、`.config` 等工具配置目录中复制大量规则。

标准包路径通过：

```text
AI_SDLC_STANDARD_HOME
```

进行解析。

## 初始化 `AI_SDLC_STANDARD_HOME`

使用脚本：

```bash
scripts/init-standard-home.sh
```

常用命令：

```bash
scripts/init-standard-home.sh --dry-run
scripts/init-standard-home.sh --print
scripts/init-standard-home.sh --profile ~/.zshrc --force
```

脚本会向 shell profile 写入受控块：

```bash
export AI_SDLC_STANDARD_HOME='<path-to-ai-sdlc-standard>'
```

注意：

- `--dry-run` 只预览，不写文件。
- `--print` 输出当前标准包路径。
- `--force` 用于替换已有受控块。
- 该脚本修改的是用户指定的 shell profile，不会自动修改业务代码。

## 标准包路径解析

安装后的 `sdlc-*` Skill 应先读取：

```text
${AI_SDLC_STANDARD_HOME}/ai-sdlc/standard-package-resolution.md
```

当前标准包要求共享标准文件从 `AI_SDLC_STANDARD_HOME` 解析，例如：

```text
${AI_SDLC_STANDARD_HOME}/ai-sdlc/**
${AI_SDLC_STANDARD_HOME}/ess/**
${AI_SDLC_STANDARD_HOME}/checklists/**
${AI_SDLC_STANDARD_HOME}/templates/**
${AI_SDLC_STANDARD_HOME}/skill-contracts/**
```

不得把目标项目中的旧版 Speckit 文档当作新版共享标准源：

```text
.specify/memory/**
.specify/workflow/**
.specify/coding_guide/**
```

这些旧版路径只能作为 legacy rail 的输入。runtime bootstrap 保留它们但不读取、不迁移、不生成同项目对比报告。

## Skill 安装边界

安装或同步到 Agent Skill 目录时，只同步：

```text
skills/sdlc-*
```

不要整包同步 `skills/`。

原因：

- 标准仓库中的可安装 Skill 统一使用 `sdlc-*` 命名。
- 原有外部 Skill 可以继续保留在各自 Agent 的 Skill 目录中。
- 本标准包不修改、不覆盖、不迁移外部 Skill 本体。

## 标准包不绑定具体 Agent

`manifest.yaml` 中标记：

```yaml
agent_bound: false
runtime_dependencies: []
```

这表示当前标准包本身不是 Codex、Claude、zcode 或其他 Agent 的私有配置。

README 中也约束：

```text
不依赖 .codex、.claude、.agents、.config 等任何 Agent 配置目录。
```

## 当前脚本

当前仓库真实存在的脚本：

| 脚本 | 作用 |
| --- | --- |
| `scripts/init-standard-home.sh` | 初始化 `AI_SDLC_STANDARD_HOME`。 |
| `scripts/bootstrap-speckit-project.sh` | 对目标项目生成 Speckit project profile、project-context 和 reports。 |
| `scripts/validate-skill-contracts.rb` | 校验 Skill 合同、manifest、registry、路径和双轨隔离风险。 |

当前没有独立 CLI 服务、后台 daemon 或自动运行机制。所有写入动作都需要用户显式执行脚本或显式唤醒对应 Skill。

## 标准包副作用边界

标准包不会在未获用户明确触发时自动：

- 执行命令。
- 修改业务代码。
- 写入业务知识库。
- 覆盖旧版 Speckit 文档。
- 修改外部 Agent 的原有 Skill。

可以由用户显式触发的动作包括：

- 写入 shell profile 中的 `AI_SDLC_STANDARD_HOME` 受控块。
- 执行 Speckit project bootstrap。
- 创建或更新 `library/{requirement_id}/` 下的 DocFlow 产物。
- 写入 `.specify/project-context/**` 或候选文件。
- 生成 `.specify/reports/**`。

## Speckit 项目配置入口

对目标项目执行：

```bash
scripts/bootstrap-speckit-project.sh <target-project-path> --dry-run
```

该脚本支持的主要参数：

```text
--project-name <name>
--language <language>
--application-type <type>
--standard-package <location>
--force-profiles
--force-context
--dry-run
```

详细见：[Speckit 投放指南](SPECKIT_BOOTSTRAP.md)。

## 配置验证

配置完成后，建议执行：

```bash
ruby scripts/validate-skill-contracts.rb
```

然后对目标项目执行：

```bash
scripts/bootstrap-speckit-project.sh <target-project-path> --dry-run
```

若 `AI_SDLC_STANDARD_HOME` 不可解析，bootstrap 生成的 profile 会将 `local_resolution_required` 标记为 `true`。
