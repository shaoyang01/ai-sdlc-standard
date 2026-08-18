# LOOP Entry Contract（统一入口合同）

> 状态：Accepted（2026-08-19，WP-1 交付，Decision-021）
> 关联：[LOOP Core Contract](../docs/LOOP_CORE_CONTRACT.md) §3 · [Change Control](change-control.md) · [Artifact Storage](artifact-storage.md) · [Requirement Normalizer Skill](../skills/sdlc-requirement-normalizer/SKILL.md)

## 1. Purpose

定义 LOOP 的统一入口合同：任意已支持入口 Agent（Kimi / Codex / Hermes）或等价 Skill / 命令，以**同一 Requirement ID、来源记录和运行状态**启动或恢复 LOOP。

入口 Agent 不是固定的产品总控；它启动同一个 LOOP，并依据明确的能力映射协调后续 Agent 工作（LOOP Core Contract §3）。

## 2. 入口输入

入口至少接收一份可读取的需求来源：

- 当前对话中用户确认的需求内容；
- 飞书 / Lark 文档内容或链接摘要；
- HTML、Markdown、PDF 提取内容或导出的需求文档；
- 截图 OCR 或用户提供的截图说明；
- 历史资料（既有产物、运行记录、决策记录）。

入口必须记录来源元数据：来源类型、来源位置、来源优先级（多来源时）、缺失上下文。

## 3. 入口义务（必须做）

1. **建立或识别 Requirement ID**（规则见 §4）。
2. **记录来源**：类型、位置、优先级、读取方式、冲突和缺失上下文。
3. **读取同一 Requirement ID 的既有当前产物和运行状态**：通过运行记录恢复（§7），不得跳过。
4. **分类**：新需求 / 补充 / 变更 / 返工 / 反馈驱动变更（§6，规则见 Change Control）。
5. **创建或恢复运行记录**（§7）。
6. **无法确定业务目标、范围、来源优先级或必要授权时停止**，并说明阻塞原因（§8）。

## 4. Requirement ID 规则

- Requirement ID 是需求的稳定标识，是产物链、运行记录和 Gate 的公共键。
- 格式与命名沿用 [Artifact Storage](artifact-storage.md) 的需求 ID 规则。
- **业务目标不变**时，变更默认沿用原 Requirement ID，通过稳定文件内部 Version 推进。
- **只有**目标变成独立需求、独立排期或显著不同业务目标时，才新建 Requirement ID（Change Control 规则）。
- Requirement ID 必须是非空、无控制字符的稳定字符串（运行记录查询接口按此校验，fail-closed）。

## 5. 入口禁止（不做）

- 不重新解释已确认的需求：启动者不同不得改变已确认事实。
- 不把不可读取的来源、历史聊天摘要或 Agent 自述当作已确认事实。
- 不生成技术方案（属于 `01-技术方案` 节点）。
- 不决定开发路径（`DIRECT_IMPLEMENTATION` / `SPECKIT_PIPELINE_REQUIRED` / `BLOCKED_NEEDS_REVISION` 是方案审核后的决策）。
- 不修改生产代码、`specs/**`、`.specify/business_domain/**`。

## 6. 分类语义

| 分类 | 语义 | 后续动作 |
| --- | --- | --- |
| 新需求 | 不存在既有产物或既有 ID 无运行记录 | 创建运行记录，从 `00-需求资料` 开始 |
| 补充 | 业务目标不变，补充边界条件或资料 | 沿用 ID，按 Change Control 更新需求资料 |
| 变更 | 业务目标不变，范围/验收变化 | 沿用 ID，标记受影响下游产物失效，从最早受影响节点 Re-Gate |
| 返工 | 实现后发现需求理解错误 | 回到需求摘要重新归一化并重走 Gate |
| 反馈驱动变更 | 测试/审阅反馈改变范围 | 分类为补充或变更，按 Change Control 处理 |

分类无法确定时：停止并说明阻塞原因，不得猜测。

## 7. 运行记录创建与恢复

运行记录是跨入口恢复的持久面（`core/loop-run-store.ts`，SQLite 追加式 run journal）。

- **创建**：新需求或既有 Requirement 无运行记录时，以 Requirement ID 为核心的 identity 创建 run（`createRun`）。
- **恢复**：入口以 Requirement ID 定位最新运行记录（`findLatestRunByRequirement` / `listRunsByRequirement`），恢复当前节点、有效产物版本、Gate 结果、未解决 finding、阻塞项和下一步资格。
- **不重解释**：恢复后继续的是已确认事实，入口不得凭新会话重新解释。
- **查询校验**：Requirement ID 是外部输入，查询接口 fail-closed 校验（非空、trim、无控制字符）；错误消息不回显输入；持久化数据经 corruption-first 完整验证。

## 8. 阻塞条件（STOP）

出现以下任一情况，入口必须停止并说明阻塞原因，不猜测、不静默扩范围：

- 业务目标无法识别；
- 全部来源不可读或缺失关键上下文；
- 来源优先级冲突无法裁决；
- 变更分类无法确定；
- 继续所需授权缺失。

## 9. 产物

- 需求资料：`library/{requirement_id}/00-需求资料/{requirement_id}_需求摘要.md`（默认输出节点，规则见 Artifact Storage）。
- 运行记录：run journal 中的 run（含 identity、阶段事件、attempt、blocking/failure 原因码）。

## 10. 与 sdlc-requirement-normalizer 的关系

- `sdlc-requirement-normalizer` 是入口 Skill 的既有实现候选：本合同是其合同面，Skill 执行体按本合同与自身 SKILL.md 执行。
- 本合同补充 normalizer 合同未覆盖的部分：运行记录创建/恢复调用、Requirement ID 查询校验、跨入口恢复语义。

## Revision Record

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 0.1.0 | 2026-08-19 | Accepted | WP-1 交付：统一入口义务、Requirement ID 规则、分类语义、运行记录创建/恢复、阻塞条件；对齐 LOOP Core Contract §3 与 Change Control。 |
