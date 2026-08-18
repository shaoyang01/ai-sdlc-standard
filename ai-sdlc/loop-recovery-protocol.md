# Loop Recovery Protocol（跨入口恢复协议）

> 状态：Accepted（2026-08-19，WP-4 交付，Decision-027）
> 关联：[Entry Contract](loop-entry-contract.md) · [Agent Capability Binding](agent-capability-binding.md) · [LOOP Core Contract](../docs/LOOP_CORE_CONTRACT.md) §6.2

## 1. Purpose

定义跨入口恢复协议与执行溯源合同：**每次节点执行记录实际使用的 binding、binding 版本与输入产物引用；入口以 Requirement ID 定位最新已验证运行记录并恢复当前节点、阶段、attempt、fixRound、阻塞/失败原因与最近执行溯源，不重解释已确认事实**（C01 完成合同第 1、2 条）。

## 2. 执行溯源（Event Provenance）

run journal 事件 schema 扩展三个可空字段（C01 WP-4）：

```text
bindingId:          本次节点执行实际使用的 binding（binding-{agent}-{capability}）
bindingVersion:     binding 合同版本（如 1.0.0）
inputArtifactRef:   输入产物引用（可选）
```

约束：

- 字段可空（`null`），旧库事件读取为 `null`，canonical 哈希与旧数据兼容；
- fail-closed：非 null 必须是合法字符串，错误消息不回显输入；
- 旧库自动迁移：`loop_events` 表缺列时 init 时补列（`binding_id` / `binding_version` / `input_artifact_ref`），存量行按 `null` 参与验证，无需重建；
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
- 不修改节点合同与 binding 层（WP-2/WP-3 已验收）。

## Revision Record

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 0.1.0 | 2026-08-19 | Accepted | WP-4 交付：事件溯源字段（bindingId/bindingVersion/inputArtifactRef）、recordNodeExecution、recoverRunContext、checkpoint 复用裁剪。 |
