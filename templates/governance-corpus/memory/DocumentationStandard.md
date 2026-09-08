# 文档编写规范 (Documentation Standard)

> **Metadata**
> - **Version**: 0.1.0
> - **Date**: {{DOC_DATE}}
> - **Author**: {{AUTHOR}}
> - **Status**: Skeleton（初始化器生成的项目治理参考骨架；项目专属条目待 Owner 确认）
> - **Summary**: 定义 {{PROJECT_NAME}} 的文档分层、命名、元数据与知识回填规则（对齐 `.sdlc` 体系）。

## 1. 命名与存放 (Naming & Location)

- 治理文档：`/.sdlc/memory/`
- 编码指南：`/.sdlc/coding_guide/`
- 长期业务知识：`/.sdlc/business_domain/`
- 机器工件：`.sdlc/business_domain/knowledge-target.yaml`、`.sdlc/project-governance-profile.yaml`、`.sdlc/entry-coverage-profile.yaml`、`.sdlc/business-domain-map.yaml`
- 运行报告：`/.sdlc/reports/`
- 历史归档（只读）：`/.sdlc/legacy/`
- <pending-owner-confirmation: 项目专属文档位置约定>

## 2. Markdown 结构规则 (Structure)

1. 一级标题后必须包含 Metadata 块：`Version/Date/Author/Status/Summary`。
2. 二级标题建议格式：`## N. 中文标题 (English Title)`。
3. 同一文件禁止出现重复二级标题。
4. `## 修订记录` 必须位于文档末尾。
5. `Version` 必须与修订记录的最新版本一致。

## 3. business_domain 分层模型 (Business Domain Model)

- 物理形态：L1、L2 使用目录表达；L4 为 L2 目录下的流程主文档或子文档。
- 根入口文档：`00BusinessLandscape.md`、`00UbiquitousLanguage.md`、`01DomainCatalog.md`。
- 编号规则：L1/L2 两位编号；L4 完整编号六位（L1 两位 + L2 两位 + L4 两位）；
  入口覆盖文档固定为 xx99（L1 两位 + L2 两位 + 99）命名；入口类唯一归属一个 L2。
- 顶层分层必须按业务能力拆分，禁止按技术目录建顶层领域。

## 4. 文档拆分规则 (Document Splitting)

- 单文件超过 500 行、预估超过 15,000 tokens、或同时面向多类读者时建议拆分。
- 子文档后缀建议：`Spec`（规格验收）/ `Arch`（架构状态机）/ `API`（契约错误码）/ `Impl`（实现映射）/ `Test`（回归矩阵）。
- 拆分后主文档必须保留 Metadata、背景与范围、子文档索引、修订记录。

## 5. 元数据与修订历史 (Metadata & History)

- `Date` 必须使用 `YYYY-MM-DD`。
- 新建或修订文档前，必须先读取 `git config user.name`；若为空，禁止落盘。
- 所有署名字段统一使用当前 `git config user.name`，禁止写入模型名或别名。
- 版本步进：Major=治理原则/分层模型不兼容变化；Minor=新增规则章节；Patch=文案格式修订。
- 修订窗口上限：治理与业务知识文档 ≤ 5 条。

## 6. 知识回填 (Knowledge Sync)

1. 稳定事实由 sdlc-knowledge-sync 依 `library/{requirement_id}/` 过程产物、代码与验证证据写入
   `.sdlc/business_domain/**`；初始化器只建结构，不发明业务事实。
2. 同步前声明状态必须为 `routed`（Owner 已确认 `.sdlc/business-domain-map.yaml`）。
3. 入口覆盖以 xx99 文档对账；每个入口必须命中至少一个 L4 文档，技术桥接入口允许边界证据。
4. <pending-owner-confirmation: 项目专属回填口径>

## 7. 路径引用规则 (Linking)

1. 治理域内部优先使用相对链接。
2. 表示物理路径时使用反引号包裹，避免不可跳转的伪链接。
3. 禁止写入带用户目录的绝对路径到项目治理文档。

## 修订记录

| 日期 | 版本 | 修订者 | 变更描述 |
| :--- | :--- | :--- | :--- |
| {{DOC_DATE}} | 0.1.0 | {{AUTHOR}} | 初始化器生成骨架，待 Owner 逐条确认。 |
