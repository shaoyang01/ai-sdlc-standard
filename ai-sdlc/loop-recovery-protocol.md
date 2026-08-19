# Loop Recovery Protocol（跨入口恢复协议）

> 状态：Accepted（2026-08-19，WP-4 收口，Decision-029）——**仅限 Decision-027 窄范围**：三字段事件溯源 + 原子迁移 + recordNodeExecution/recoverRunContext helper。数据模型完整性与生产链路接线由 WP-4B 承接（Decision-028）；C01 完成合同第 1、2 条在 WP-4B 收口前不得登记完成。
> 关联：[Entry Contract](loop-entry-contract.md) · [Agent Capability Binding](agent-capability-binding.md) · [LOOP Core Contract](../docs/LOOP_CORE_CONTRACT.md) §6.2

## 1. Purpose

定义跨入口恢复协议与执行溯源合同：**每次节点执行记录实际使用的 binding、binding 版本与输入产物引用；入口以 Requirement ID 定位最新已验证运行记录并恢复当前节点、阶段、attempt、fixRound、阻塞/失败原因与最近执行溯源，不重解释已确认事实**（C01 完成合同第 1、2 条）。

WP-4（Decision-027）只提供最小 helper 与恢复面，**不单独构成 C01 完成合同第 1、2 条的完成证据**；完整溯源模型与生产接线由 WP-4B 承接（Decision-028）。

## 2. 执行溯源（Event Provenance）

run journal 事件 schema 扩展三个可空字段（C01 WP-4）：

```text
bindingId:          本次节点执行实际使用的 binding（binding-{agent}-{capability}）
bindingVersion:     binding 合同版本（如 1.0.0）
inputArtifactRef:   输入产物引用（可选）
```

约束：

- 字段可空（`null`），旧库事件读取为 `null`；
- 哈希迁移：旧库事件的 `canonical_sha256` 按扩展前 13 字段集计算。init() 在单个迁移事务内完成补列、验证与重算：先用旧字段集形式验证每个历史事件（三个溯源字段必须全为 `null`），再把 hash 原子重算为扩展字段集形式，最后置 `user_version = 1` 标记迁移完成；任一事件两种形式都不匹配（含旧 hash 被篡改）判 `STORE_CORRUPT`，整个事务回滚——补列、已重算的 hash、`user_version` 均不落库，修复数据后重试 init 即可幂等完成迁移；
- 读取单一形式：迁移完成后读取只接受扩展字段集一种 hash 形式——即使溯源字段全为 `null` 的事件被替换为合法旧格式 hash，也判 `STORE_CORRUPT`（格式来源由迁移持久化，不依赖读取侧猜测）；
- 格式版本 fail-closed：`user_version` 只接受 0（待迁移）与 1（已迁移）；其它值（含未知未来版本、负数）init() 直接判 `STORE_CORRUPT`；
- fail-closed：非 null 必须是合法字符串，错误消息不回显输入；
- 旧库自动迁移：`loop_events` 表缺列时 init 时补列（`binding_id` / `binding_version` / `input_artifact_ref`），存量行按 `null` 参与验证并按上述规则重算 hash，无需重建；
- 每次节点执行（stage_started / stage_succeeded / stage_failed）都应携带溯源字段，形成可追溯的 binding 尝试链（LOOP Core Contract §6.2：每次节点执行记录实际使用的 binding、Agent/adapter 标识和版本、输入产物版本、执行尝试与结果）。

## 3. 溯源写入（recordNodeExecution）

```text
recordNodeExecution(store, {
  runId, stage, attempt, kind,
  createdAt,
  provenance: { bindingId, bindingVersion, inputArtifactRef },
  inputDigest?, outputArtifactRef?, outputDigest?,
  errorCode?, retryable?, reasonCode?
})
```

- sequence 由 run journal 状态机派生（lastSequence + 1），保证事件通过转移校验；
- 输入边界 fail-closed：`record` 与 `provenance` 必须是普通数据对象，且所有消费字段（runId/stage/kind/attempt/createdAt、provenance 三字段、各可选标量）在触碰 journal 之前完成存在性与类型校验——null、缺失字段、accessor 属性、任意 Proxy（透明 / revoked / 带 trap，复制前经 `util.types.isProxy` 检测）一律 `INVALID_INPUT`（绝不抛裸 TypeError），不产生任何事件或状态变化；
- 返回的事件对象已冻结（`Object.freeze`），与持久化读回事件的不可变约定一致；
- 事件持久化后可由任意入口读取（跨入口恢复的基础）。

## 4. 跨入口恢复（recoverRunContext）

```text
recoverRunContext(store, requirementId)
  -> { snapshot, currentStage, currentAttempt, fixRound, status,
       blockingReasonCode, failureReasonCode, lastExecution } | undefined
```

- 基于 WP-1 已验收的 `findLatestRunByRequirement`（最新已验证 run 快照，corruption-first）；
- 恢复内容：当前阶段、attempt、fixRound、运行状态、阻塞/失败原因码、最近一次节点执行的溯源（binding id/版本、输入产物引用、输出引用、原因码）；
- requirement 尚无 run 时返回 undefined（入口据此进入"创建"路径）；
- 恢复后继续的是已确认事实：入口不得凭新会话重新解释（Entry Contract §7）。

## 5. 与 checkpoint 的关系（复用裁剪）

- `loop-delivery-checkpoint`（D10-A）的 fresh/recovery 模式与不可变 generation 链可作为后续恢复机制的支撑候选；
- 其**发布 phase（publish_intent / commit / push / pr 等）不进入 C01**（LOOP Core Contract §8 Non-Goals）；
- C01 跨入口恢复以 run journal（本协议）为持久恢复面；checkpoint 发布语义留在历史，不作为 Core 验收条件。

## 6. 边界（本 WP 不做）

- 不实现 checkpoint 发布链；
- 不调用任何真实 Agent；
- 不产生任何 Git 发布动作；
- 不修改节点合同与 binding 层（WP-2/WP-3 已验收）；
- 不在 journal 写入层强制溯源字段（`appendEvent` 保持 WP-1 已验收的通用语义；写入侧强制随 ExecutionGateway 接线在 WP-4B 落地）；
- **授权拆分（Decision-028）：溯源模型扩展（adapter/Agent 标识与版本、有效产物版本、Gate、未解决 finding、下一步资格）与 recordNodeExecution/recoverRunContext 的生产接线（当前无生产调用方）拆分为 WP-4B；在 WP-4B 收口前，WP-4 不视为 C01 完成合同第 1、2 条的完成证据，C01 不得标记为完整需求完成。**

## Revision Record

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 0.1.0 | 2026-08-19 | Accepted | WP-4 交付：事件溯源字段（bindingId/bindingVersion/inputArtifactRef）、recordNodeExecution、recoverRunContext、checkpoint 复用裁剪。 |
| 0.1.1 | 2026-08-19 | Accepted | 复审修正：旧库事件的 canonical 哈希按扩展前 13 字段集计算，读取侧接受旧字段集哈希（溯源字段全 null 时），补真实历史数据回归；修正"canonical 哈希与旧数据兼容"的不准确表述。 |
| 0.1.2 | 2026-08-19 | Accepted | 复审修正：0.1.1 的读取侧双形态接受引入降级绕过（新行可换合法旧 hash）。改为 init() 迁移事务内先验证旧 hash 再原子重算为扩展 hash（`user_version` 标记完成），读取恢复单一形式严格校验；补 v2 行降级为 v1 hash 的拒绝回归。 |
| 0.1.3 | 2026-08-19 | Accepted | 复审修正：recordNodeExecution 输入边界 fail-closed（null/缺失字段/accessor/Proxy 一律 INVALID_INPUT，零副作用）；迁移原子性扩到补列——补列、hash 重算、`user_version` 并入单一事务，失败全部回滚且可幂等重试。 |
| 0.1.4 | 2026-08-19 | 复审中 | 复审修正：recordNodeExecution 全部消费字段在触碰 journal 前完成形状校验（缺失 stage/kind/attempt/createdAt 等直接 INVALID_INPUT），透明 Proxy 语义如实标注；返回值冻结；`user_version` 只接受 0/1，未知版本 STORE_CORRUPT。文档状态从 Accepted 降为复审中。Decision-028：模型完整性与生产接线拆分为 WP-4B，WP-4 不视为 C01 完成合同第 1、2 条的完成证据。 |
| 0.1.5 | 2026-08-19 | 复审中 | 复审修正：Proxy 输入（透明/revoked/带 trap）在复制前经 `util.types.isProxy` 一律拒绝为 INVALID_INPUT，删除"透明 Proxy 无法检测"的错误表述与正例；C01 计划验收映射第 1、2 条补 WP-4B；Purpose 明确 WP-4 不单独构成完成证据。 |
| 0.2.0 | 2026-08-19 | Accepted | WP-4 收口（Decision-029，用户复审通过）：范围限 Decision-027（三字段溯源 + 原子迁移 + helper + 最小恢复上下文）；模型完整性与生产接线归 WP-4B（Decision-028），C01 完成合同第 1、2 条待 WP-4B 收口后方可登记。 |
