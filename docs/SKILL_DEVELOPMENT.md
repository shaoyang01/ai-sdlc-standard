# Skill 开发指南

> 本指南说明当前仓库中 `sdlc-*` Skill 的真实组织方式、合同要求、Registry 和 Manifest 维护规则。

## 核心原则

本标准包内新增或重写的可安装 Skill 一律使用：

```text
sdlc-*
```

即使能力来自既有外部 Skill 的标准化重做，也只在本标准包内新增 `sdlc-*` 版本，不修改、不覆盖、不迁移外部 Skill 本体。

## Skill 文件结构

当前可安装 Skill 存放在：

```text
skills/sdlc-*/SKILL.md
skills/sdlc-*/references/*.md
```

每个 Skill 至少应有：

```text
SKILL.md
references/
```

`SKILL.md` frontmatter 中的 `name` 必须与目录名一致，例如：

```yaml
---
name: sdlc-solution-reviewer
description: |
  ...
version: 0.1.0
---
```

## Skill 合同

每个可安装 Skill 必须有对应合同：

```text
skill-contracts/known-skills/{skill-name}.md
```

例如：

```text
skills/sdlc-solution-reviewer/SKILL.md
skill-contracts/known-skills/sdlc-solution-reviewer.md
```

合同 YAML 元数据必须包含当前 validator 要求的字段：

```text
name
category
stage
status
input_artifacts
output_artifacts
side_effects
can_modify_code
can_modify_docs
can_modify_knowledge_base
can_execute_commands
blocking_conditions
```

## Skill 分类

分类规则见：

```text
skill-contracts/skill-category-guide.md
```

当前允许的类别：

```text
Intake Skill
Producer Skill
Auditor Skill
Reviewer Skill
Executor Skill
Renderer Skill
Publisher Skill
Sync Skill
Workflow Skill
```

约束：

- `can_modify_code=true` 要求 Skill 属于 `Executor Skill` 或 `Workflow Skill`。
- `can_modify_knowledge_base=true` 要求 Skill 属于 `Sync Skill` 或 `Workflow Skill`。
- Renderer 只能改变展示形式，不能补业务语义。
- Executor 不得自行补未定义业务规则。
- Sync 不得把聊天片段当作长期事实源。

## Registry

Skill Registry 位于：

```text
registry/skill-registry.md
```

Registry 中的 Skill 名称、path 和 contract 必须与 `manifest.yaml` 保持一致。

## Manifest

`manifest.yaml` 是标准包的机器可读入口。

新增或改造 Skill 时，应维护：

```yaml
skills:
  sdlc_xxx:
    path: skills/sdlc-xxx/SKILL.md
    contract: skill-contracts/known-skills/sdlc-xxx.md
    references:
      - skills/sdlc-xxx/references/...
```

新增公共文档入口时，应维护：

```yaml
entrypoints:
  xxx: path/to/file.md
```

## 标准包路径引用

Skill 中引用共享标准文件时，应使用：

```text
${AI_SDLC_STANDARD_HOME}/...
```

不要使用：

```text
../../ai-sdlc/**
../../ess/**
../../templates/**
../../skill-contracts/**
```

validator 会检查相对标准路径风险。

## Speckit 双轨隔离约束

新版 `sdlc-*` Skill 正常运行时不得把旧版路径当作输入：

```text
.specify/memory/**
.specify/workflow/**
.specify/coding_guide/**
```

允许在禁止语义或参考语义中提到它们，例如：

```text
do not read
must not read
preserve only
preserved_not_runtime_input
preserved_not_read
remain untouched
```

不允许写成正常输入，例如：

```text
read .specify/memory/EngineeringStandard.md
load .specify/workflow/pipeline.md
use .specify/coding_guide/java.md as input
```

`validate-skill-contracts.rb` 会扫描 `skills/sdlc-*` 下的 Markdown，发现危险 legacy source 引用时报错。

## 新增 Skill 流程

推荐顺序：

```text
1. 判断是否真的需要新增 Skill。
2. 明确 Skill 类别和副作用边界。
3. 新增 skill-contracts/known-skills/sdlc-xxx.md。
4. 新增 skills/sdlc-xxx/SKILL.md 和 references。
5. 更新 registry/skill-registry.md。
6. 更新 manifest.yaml。
7. 运行 ruby scripts/validate-skill-contracts.rb。
8. 用真实输入样例验证 Skill 输出。
```

## 不建议现在新增的能力

当前项目下一阶段以真实项目验证为主，不建议继续新增大量 Skill。

特别不建议当前阶段新增：

```text
work-journal
Dashboard
GitHub Issue 自动导出
多 Agent pipeline
通用业务域自动生成器
```

这些能力应等真实项目样例验证后再决定是否进入路线图。

## 状态命名建议

当前仓库已开始区分：

```text
prompt_skill_ready
tooling_ready
```

建议继续使用该语义：

- `prompt_skill_ready`：已有可安装 Prompt Skill 指令体，但不是独立工具服务。
- `tooling_ready`：已有可直接执行的脚本工具。
- `contracted`：只有合同，尚无执行体。
- `validated`：已通过真实项目样例验证。

当前大部分 `sdlc-*` Skill 应视为 `prompt_skill_ready`，不应宣传为完整自动化工具。
