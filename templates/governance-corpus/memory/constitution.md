# {{PROJECT_NAME}} 项目宪章 (Constitution)

> **Metadata**
> - **Version**: 0.1.0
> - **Date**: {{DOC_DATE}}
> - **Author**: {{AUTHOR}}
> - **Status**: Skeleton（初始化器生成的项目治理参考骨架；条款须经 Owner 确认后生效）
> - **Summary**: {{PROJECT_NAME}} 的项目宪章骨架：约束业务知识沉淀、一致性与交付质量的核心原则。

## 1. 核心原则 (Core Principles)

1. 知识先行：业务事实只沉淀到 `.sdlc/business_domain/**`，由 sdlc-knowledge-sync 依声明状态机写入。
2. 一致性与幂等优先：写链路必须显式定义事务边界、幂等键、锁策略与失败补偿。
3. 契约、审计与可观测：对外契约、状态迁移与异步链路必须可追溯、可审计。
4. 质量门禁：核心改动必须可验证；入库前通过测试与知识回填审计。
5. <pending-owner-confirmation: 项目专属核心原则>

## 2. 工程约束 (Engineering Constraints)

- 核心治理目录：`/.sdlc/memory`、`/.sdlc/coding_guide`。
- 长期业务知识目录：`/.sdlc/business_domain/**`。
- 业务代码改动必须与文档变更保持可追溯关联。
- <pending-owner-confirmation: 项目专属工程约束>

## 3. 治理 (Governance)

本宪章是 {{PROJECT_NAME}} 的项目治理参考。跨项目一致的治理规则以
`${AI_SDLC_STANDARD_HOME}` 的 `AGENTS.md` 与治理合同为权威；本文件仅记录项目专属约定。
变更宪章时必须同步更新版本、日期与修订记录。

## 修订记录

| 日期 | 版本 | 修订者 | 变更描述 |
| :--- | :--- | :--- | :--- |
| {{DOC_DATE}} | 0.1.0 | {{AUTHOR}} | 初始化器生成骨架，待 Owner 逐条确认。 |
