# Portability Guide

## 目标

本标准包必须能被多个 Agent 工具、人工流程和不同代码仓库复用。

## 放置位置建议

推荐放置在以下位置之一：

- 独立 Git 仓库，例如 `ai-sdlc-standard`。
- 团队共享文档仓库。
- 业务代码仓根目录下的 `engineering-standard/`。
- 共享网盘或知识库导出的标准目录。

不推荐放置在：

- 任意 Agent 的配置目录。
- 任意单一工具的私有缓存目录。
- 只对某个 Agent 可见的本机隐藏目录。

## 引用方式

各 Agent 或 Skill 应该引用本标准包中的相对路径，例如：

```text
遵循 ai-sdlc-standard/ess/specification-schema.md
遵循 ai-sdlc-standard/templates/gate-result-template.md
遵循 ai-sdlc-standard/skill-contracts/renderer-skill-contract.md
```

不要在 Skill 中复制大段标准正文。正确方式是：

1. Skill 声明自己的角色和副作用。
2. Skill 引用本标准包中的 Schema、Checklist、Contract。
3. 标准变更时，只更新标准包。

## 业务仓库落地建议

在业务代码库中，推荐将每个需求的过程产物写入独立目录：

```text
{repo_root}/library/{requirement_id}/
```

并在需求目录内按节点分文件夹：

```text
library/{requirement_id}/00-需求资料/
library/{requirement_id}/01-技术方案/
library/{requirement_id}/02-方案审核/
library/{requirement_id}/03-实现记录/
library/{requirement_id}/04-代码审核/
library/{requirement_id}/05-测试验收/
```

具体路径和命名规则见 `ai-sdlc/artifact-storage.md`。

## 迁移步骤

### 1. 复制标准包

将整个 `ai-sdlc-standard/` 目录复制到目标位置。

### 2. 更新引用前缀

如果目标位置改名为 `engineering-standard/`，只需要在 Skill 或提示词中更新引用前缀。

示例：

```text
ai-sdlc-standard/ess/specification-schema.md
```

改为：

```text
engineering-standard/ess/specification-schema.md
```

### 3. 登记 Skill

在 `registry/skill-registry.md` 中登记目标环境中的 Skill。

### 4. 薄改 Skill

每个 Skill 只补：

- category
- stage
- input_artifacts
- output_artifacts
- required_schema
- required_checklist
- side_effects
- blocking_conditions

### 5. 运行人工 Gate

迁移初期不需要自动化。只要每个阶段按 `templates/gate-result-template.md` 输出结论即可。

### 6. 建立需求文档目录

在业务仓库中为每个需求建立 `library/{requirement_id}/`。该目录通常应被业务仓库 `.gitignore` 忽略。

### 7. 安装 Skill

可执行 Skill 放在标准包的 `skills/` 目录下。

安装是把标准包中的 Skill 复制为目标 Agent 可执行的副本，不是把本标准包移动到 Agent 配置目录。

只有当用户明确要求安装或同步时，才执行安装动作。普通“生成文档”“审阅方案”“输出报告”请求只使用标准包规则，不自动写入任何全局 Skill 目录。

例如将 `skills/docflow-writer/` 同步到目标 Agent 的 Skill 目录：

```text
skills/docflow-writer/
```

安装后的副本可以被 Agent 使用，但 GitHub 标准仓库仍是主源。

安装前应确认：

- 目标 Agent 类型明确。
- 目标 Skill 目录明确且可写。
- 本次安装范围明确，是单 Agent 还是多 Agent。
- 目标目录中已有同名 Skill 时，用户已确认覆盖、合并或跳过。

安装后应报告：

- 源路径。
- 目标路径。
- 是否覆盖了旧副本。
- 是否保留标准仓库为主源。
- 失败时的具体原因。

不得在标准包内写死某台机器的绝对路径。不同环境的目标 Skill 目录应由执行者在安装时确认。

## 版本策略

- Patch：修正文案、示例、排版，不改变规则。
- Minor：新增 Checklist、Schema 字段或 Contract 类型。
- Major：改变生命周期、Gate 阻塞规则或 Skill 合同语义。

## 禁止事项

- 不要把本标准包改成某个 Agent 专用格式。
- 不要在标准包中写死本机路径。
- 不要让标准包直接执行命令。
- 不要把业务仓库的临时事实写成本标准的通用规则。
