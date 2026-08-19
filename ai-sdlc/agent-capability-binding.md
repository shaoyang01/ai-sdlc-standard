# Agent Capability Binding（Agent 能力绑定合同）

> 状态：Accepted（2026-08-19，WP-3 交付，Decision-025）
> 关联：[LOOP Core Contract](../docs/LOOP_CORE_CONTRACT.md) §6.2 · [Node Capability Contract](node-capability-contract.md) · [Entry Contract](loop-entry-contract.md)

## 1. Purpose

定义 LOOP 的 binding 层合同：**为节点能力合同选择已启用执行者，并校验执行者输出是否符合节点输出合同**。binding 是配置，不是节点定义；替换 binding 不改变 Requirement ID、产物 schema、finding 语义、Re-Gate 路由或人工 Git 边界（LOOP Core Contract §6）。

## 2. 全能力矩阵（Decision-020）

每个已支持 Agent 都能独立完成所有节点能力；binding 支持任意节点 × 任意 Agent 的组合：

| Agent | adapter | 初始状态 | 说明 |
| --- | --- | --- | --- |
| codex | `codex-real-dispatch` | **enabled（全部 7 能力）** | 请求类型已扩展至全部节点能力（Decision-020） |
| kimi | `kimi-cli` | disabled（全部 7 能力） | 全能力模型注册；真实环境复核后启用 |
| hermes | `hermes-cli` | disabled（全部 7 能力） | 全能力模型注册；真实环境复核后启用 |

矩阵规模：7 能力 × 3 Agent = 21 bindings（`core/agent-capability-bindings.ts`）。

## 3. Binding Schema

```text
bindingId:            binding-{agent}-{capability}（唯一）
capability:           节点能力 ID（Node Capability Contract §2）
agent:                实际执行者（codex / kimi / hermes）
adapter:              执行者适配器标识（codex-real-dispatch / kimi-cli / hermes-cli）
bindingVersion:       binding 合同版本
inputFormat:          可接受的输入格式
outputContract:       输出产物合同引用（与节点合同的 outputArtifact 对齐）
validator:            结果校验器标识
allowedSideEffects:   允许的副作用（workspace-local-write / run-journal-write）
timeoutMs:            超时上限
failurePolicy:        失败处理策略（retry_other_binding / block）
enabled:              启用状态
```

约束：

- binding 字段**不得包含**任何 Git 发布字段（commit / push / PR / merge / publication）；
- binding 不携带 Requirement ID（Requirement 身份属于运行记录与产物，不属于 binding）；
- 节点合同（WP-2 已验收）由 binding 层只读消费，**不得修改**；
- 启用、停用、替换是配置层操作，不修改 LOOP 主流程、产物链或节点业务合同。

## 4. 替换语义

```text
replaceBinding(fromBindingId, toBindingId)
  -> 同一 capability 下：from 置 disabled，to 置 enabled
```

- 替换必须发生在同一 capability 内（不同能力替换被拒绝）；
- 替换只生成新的深冻结配置快照，registry 正整数版本递增；节点合同对象不变；
- 执行事件同时记录 registry version 与 binding version，因此后续再次替换不会改写历史实际执行者快照；
- 替换后执行者改变，但 Requirement ID、产物 schema、finding 语义、Re-Gate 路由、人工 Git 边界均不变（守卫测试断言）。

## 5. 失败与超时

- binding 不可用、超时或输出不合格时，按 `failurePolicy` 处理：
  - `retry_other_binding`：协调器可选择另一已启用 binding 重新执行（一轮新的、可追溯的尝试）；
  - `block`：停止并报告，不得伪造通过。
- 禁止用 shadow 结果、历史结果或前一执行者的失败伪装成本次通过（LOOP Core Contract §6.2）。

## 6. 与节点能力合同的关系

- WP-2 定义了"节点需要什么能力"（合同面）；本 WP 定义"哪个执行者、用什么 adapter、按什么校验器执行"（选择面）。
- binding 只选择与校验，不定义节点；两层面组合构成 LOOP Core Contract §6 的完整执行语义。

## 7. 边界（本 WP 不做）

- 不调用任何真实 Agent（real dispatch 保持 feature-flagged：`SDLC_EXECUTION_MODE=codex` + `SDLC_CODEX_REAL_DISPATCH=enabled`）；
- 不产生任何 Git 发布动作；
- 不修改节点合同（WP-2 已验收）；
- 不新增 Agent Provider（Advanced-03）。

## Revision Record

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 0.1.0 | 2026-08-19 | Accepted | WP-3 交付：全能力矩阵（7×3）、binding schema、替换语义、失败/超时策略、与 WP-2 关系。 |
| 0.1.1 | 2026-08-19 | 等待 WP-4B 复审 | WP-4B 接线补充：每次 replacement 递增不可变 registry snapshot version，供 capability execution 事件持久化历史选择快照。 |
