# AI 治理规约 (AiGovernance)

> **Metadata**
> - **Version**: 0.1.0
> - **Date**: {{DOC_DATE}}
> - **Author**: {{AUTHOR}}
> - **Status**: Skeleton（初始化器生成的项目治理参考骨架；条款须经 Owner 确认后生效）
> - **Summary**: 定义 {{PROJECT_NAME}} 的 AI 协作边界、治理写锁与知识回填责任。

本规约定义 AI 在 {{PROJECT_NAME}} 项目中的协作边界、写入门禁与审计责任，
是 [项目宪章](./constitution.md) 的执行层规范。

## 1. 核心行为准则 (Core Behavior)

1. 宪章先行：执行任何任务前必须对齐 `constitution.md`。
2. 语言统一：除代码标识符外，文档、注释、提交说明统一使用中文。
3. 范围约束：仅修改用户授权范围内文件，禁止顺手改动。
4. 风险熔断：遇到事务一致性、锁竞争、幂等冲突等高风险改动必须立即停止并请求人工确认。
5. <pending-owner-confirmation: 项目专属行为准则>

## 2. 治理写锁协议 (Governance Write-Lock Protocol)

1. 触发条件：当任务涉及 `.sdlc/**` 或根 `AGENTS.md` 修改时，默认进入治理写锁。
2. 写前要求：先输出影响范围、风险点和改动方案，未经明确许可不得写入。
3. 署名要求：写入任意 Markdown 文档前，必须先读取 `git config user.name`；若为空，禁止创建或修订文档。
4. `Author`、`作者`、`修订者`、`修订人`、`修改人` 等署名字段必须统一写为当前 `git config user.name`，禁止写入模型名或别名。
5. 授权口令：仅在用户给出明确授权（如"执行修复/同意写入/开始迁移"）后执行写入。
6. 写后要求：同轮同步更新 Metadata 与 `## 修订记录`，并回显变更清单与验证结果。

## 3. 知识库路由协议 (Knowledge Routing Protocol)

1. 知识目标由 `.sdlc/business_domain/knowledge-target.yaml` 声明；声明状态为
   `candidate_pending_confirmation` 时，sdlc-knowledge-sync 只产 PROPOSAL，不写 confirmed 领域事实。
2. 声明状态为 `routed` 时，新需求先读取命中的 L2 主文档（existing-change），或先在 L2 主文档
   登记 L4 编号再按 create-if-missing 创建骨架（new-flow）。
3. 严禁未做路由就把需求写进任意技术目录说明。
4. 稳定事实由 sdlc-knowledge-sync 依 `library/{requirement_id}/` 过程产物、代码与验证证据写入。

## 4. 权限分级 (Execution Levels)

- **L0**: 只读分析与建议。
- **L1**: 文件修改与本地校验。
- **L2**: 提交与交付动作。
- **L3**: 推送、批量治理域重写、高风险回滚，需二次确认。

## 5. 提交流程门禁 (Commit Gate)

提交前至少满足：

- 需求与任务映射清晰。
- 核心测试通过。
- 无冲突标记、无调试噪音。
- 文档修订记录与 Metadata 已同步。
- 业务知识回填与 `.sdlc/business_domain/**` 的对应关系可追溯。

## 6. 规范溯源 (Specification Traceability)

- 宪章基准：[`constitution.md`](./constitution.md)
- 交互协议：[`InteractionProtocol.md`](./InteractionProtocol.md)
- 文档标准：[`DocumentationStandard.md`](./DocumentationStandard.md)
- 工程规范：[`EngineeringStandard.md`](./EngineeringStandard.md)
- 跨项目治理权威：`${AI_SDLC_STANDARD_HOME}` 的 `AGENTS.md` 与治理合同

## 修订记录

| 日期 | 版本 | 修订者 | 变更描述 |
| :--- | :--- | :--- | :--- |
| {{DOC_DATE}} | 0.1.0 | {{AUTHOR}} | 初始化器生成骨架，待 Owner 逐条确认。 |
