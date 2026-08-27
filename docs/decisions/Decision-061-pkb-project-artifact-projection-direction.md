# Decision-061：LOOP 项目产物进入 Personal-KB 的产品方向

## 状态

Accepted direction / Advanced planning pending（2026-08-27，Current User 明确提出：后续各项目 `library/` LOOP 产物与 `.specify/` 文档治理产物应进入 Personal-KB，但重点仍是 LOOP 自主运行，该需求可放到后期 Advanced 阶段）

## 背景

- 当前 LOOP 七节点产物主要保存在目标项目 `library/<requirement-id>/`，且部分项目将 `library/` 排除在 Git 之外。
- 稳定业务/治理文档主要保存在目标项目 `.specify/**`，只能在具体仓库内被发现。
- Personal-KB 已有 `10-projects/<project-slug>/**` 外部项目自助发布边界和跨项目只读 Query，`ai-sdlc-standard` 也已有项目 handoff 发布记录；现有规则仅支持项目选择发布，尚未定义 Requirement 全产物投影。

## 问题

如何让 LOOP 产物成为长期可查询的开发知识，同时不把 PKB 变成构建缓存、不泄露敏感业务数据，也不混淆源项目事实与个人知识状态？

## 决策

1. 新增后期 **LOOP-ADVANCED-04 Personal-KB Project Artifact Projection**；依赖 `LOOP-CORE-05`，不得阻塞 C03-E 或下一条真实 C05。
2. 项目产物只写入 `10-projects/<project-slug>/requirements/<requirement-id>/**`；源项目代码/Git/合同仍是实现事实源，PKB 是带 provenance 的派生快照。
3. 自动投影最终有效的 00～06 人类可读产物、人工 Git handoff、该 Requirement 实际关联的 `.specify/**` 文档和 evidence index；不无差别复制整个目录、构建产物或原始大日志。
4. 每份投影绑定 source repository/branch/code commit/path/artifact version/SHA-256、LOOP run 与 publication identity；ignored `library/` 必须明确使用 final snapshot digest，不能伪称由 source commit 可重建。
5. 自动内容只允许 `draft`/`active`，不得直接进入全局 knowledge/decision/prompt/system 命名空间，不得自动 stable；跨项目通用知识仍走 PKB 既有 Review/Distillation 与用户确认。
6. PKB publication 失败不回滚业务需求或人工 Git handoff，必须留下可独立恢复的失败记录。
7. 具体 standing authorization、PKB 自动 commit/push 和历史回填策略由 `LOOP-ADVANCED-04-PLAN.md` 三项裁决点另行确认；本 Decision 不直接授权修改 Personal-KB。

## 原因

直接移动源文件会破坏项目内执行与审计；完整复制所有机器文件会造成噪声、泄密和查询质量下降。Requirement 级派生快照同时保留开发上下文与可追溯性，并复用 PKB 已有项目命名空间、validator、单 writer 和只读 Query 边界，是最小且可恢复的接入方式。

## 影响

- Roadmap 升级到 v2.3.2；C03 完成覆盖保持 A～E，当前唯一新增 Core 工作包仍是 C03-E。
- 下一条 C05 只验证 LOOP 全自主 CLI 执行、恢复、Re-Gate 与人工 Git 边界，不等待 PKB 能力。
- Personal-KB 侧需要独立受控规划/授权，不能由源项目单方面绕过其 AGENTS、ROADMAP、validator、Git 和 writer 规则。
- 本次已完成的 `wms-monitor/20260827-dashboard-page` 不自动回填；是否历史迁移另行裁决。

## 实现状态

产品方向、Roadmap v2.3.2 与 Advanced 04 草案已在本仓落盘；Personal-KB 未修改，publisher 未实现，未执行任何跨仓写入或 Git 动作。

## 依据

- [LOOP Core Roadmap v2.3.2](../AI-SDLC-Autonomous-Delivery-Roadmap.md)；
- [LOOP-ADVANCED-04 有界规划](../LOOP-ADVANCED-04-PLAN.md)；
- Personal-KB `README.md` 的外部项目发布与只读 Query 边界；
- Personal-KB `90-system/rules/external-project-publishing.md`；
- Personal-KB `AGENTS.md` 的单 writer、命名空间、validator、stable 权限和 Git 边界。
