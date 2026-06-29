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

## 版本策略

- Patch：修正文案、示例、排版，不改变规则。
- Minor：新增 Checklist、Schema 字段或 Contract 类型。
- Major：改变生命周期、Gate 阻塞规则或 Skill 合同语义。

## 禁止事项

- 不要把本标准包改成某个 Agent 专用格式。
- 不要在标准包中写死本机路径。
- 不要让标准包直接执行命令。
- 不要把业务仓库的临时事实写成本标准的通用规则。

