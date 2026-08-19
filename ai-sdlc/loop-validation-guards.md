# LOOP Validation and Replacement Guards（验证与替换守卫）

> 状态：WP-5 已实施，等待独立复审（2026-08-19，Decision-033）
> 关联：[Agent Capability Binding](agent-capability-binding.md) · [Loop Recovery Protocol](loop-recovery-protocol.md) · [LOOP Core Contract](../docs/LOOP_CORE_CONTRACT.md) §6

## 1. Purpose

本合同固化 C01 完成合同第 3、4 条的生产边界：binding 可以替换执行者，但不能改变 Requirement 身份、节点产物合同、finding/Gate 语义、下一步资格或人工 Git 边界；执行者不可用、超时或结果不合格只能形成可恢复的失败 attempt，不能以 shadow、迟到结果或历史结果伪造本次通过。

## 2. Binding Registry 运行时守卫

`validateBindingRegistry` 是执行与替换共用的 fail-closed 边界：

- registry 必须是深冻结普通数据快照，版本为正整数；固定为 7 capability × 3 Agent 的 21 个 binding，且每个 capability 恰有一个 enabled binding；
- 每个 binding 必须恰好包含已验收的 12 个字段；ID、capability、Agent、adapter、binding 版本必须相互一致；
- `inputFormat`、`outputContract`、`validator` 与 `allowedSideEffects` 必须保持 canonical 值；副作用只能是 workspace local write 与 run journal write，不得扩入 Git/PR/发布动作；
- timeout 必须是正整数且不超过运行时计时器上限，failure policy 只能是 `retry_other_binding` 或 `block`；
- replacement 只接受“同 capability、当前 enabled source → 当前 disabled target”，生成新深冻结快照并递增 registry version。重放旧 replacement、跨 capability、未知 binding 或合同漂移均拒绝。

Node Capability Contract 本身及其嵌套数组也在运行时深冻结；replacement 不修改 Requirement ID、节点合同、产物类型映射、finding/Gate 解释或路由规则。

## 3. 失败分类与持久语义

| 场景 | journal `errorCode` | 结果 reason | 可成为有效输出 |
| --- | --- | --- | --- |
| binding 实际不可用 / 返回 shadow | `EXECUTOR_UNAVAILABLE` | `executor_unavailable` | 否 |
| 超过 binding `timeoutMs` | `EXECUTOR_TIMEOUT` | `executor_timeout` | 否 |
| adapter 抛异常 | `EXECUTOR_EXCEPTION` | `executor_exception` | 否 |
| 产物类型、身份、节点、Agent、Gate/finding 等合同不合格 | `OUTPUT_CONTRACT_VIOLATION` | 合同失败结果 | 否 |
| 输出持久化失败 | `OUTPUT_RECORDING_FAILED` | 安全记录失败结果 | 否 |

所有场景先有 durable started claim，再以 failed terminal 闭合；failed 事件的 `retryable` 取自本次历史 binding 快照的 failure policy。失败不产生 output artifact ref/digest，不改变前一能力的有效产物，也不能让下一能力获得资格。

## 4. 超时与迟到结果

ExecutionGateway 在 binding 边界执行 timeout。底层 adapter 若不支持取消，超时后仍可能在进程内晚到；Gateway 会观察并丢弃该完成值或异常，不再校验、持久化或追加 succeeded。journal 中已经提交的 failed attempt 是唯一事实。

恢复只能创建 attempt + 1，并再次调用当前 enabled binding；不得复用 shadow、迟到输出、失败 attempt 的输出或历史成功结果替代本次执行。输入 ref/version/digest 仍必须与 canonical lineage 完全一致。

## 5. Finding、Gate、Re-Gate 与人工 Git 边界

- finding-producing capability 必须返回结构化 unresolved findings；非空 finding 被持久化并令能力链 `BLOCKED`，不能自动进入方案审核或 Re-Gate；
- Gate-producing capability 必须返回 `PASS / FAIL / PASS_WITH_RISK`；FAIL 不得 `ELIGIBLE`；
- C01 只保证这些事实在 replacement 前后语义不变且可恢复；Re-Gate 编排本体属于 C02；
- registry 和节点合同均不授予 commit、push、PR、Ready、merge 或 publication。仓库发布仍为人工治理动作。

## 6. 验证证据与收口边界

`tests/loop-validation-guards.test.ts` 通过默认 `npm test` 执行，覆盖：运行时 schema 漂移拒绝、replacement 不变量、不可用 binding、timeout、迟到输出、错误产物、fresh retry、历史执行者快照、finding 阻塞与无自动 Re-Gate。

本文件记录“实现完成、等待独立复审”，不自行构成 C01 第 3、4 条的完成登记。只有独立复审通过并由用户裁决收口后，才能消费 WP-5 授权、将本合同升为 Accepted，并登记 C01 完成。

## Revision Record

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 0.1.0 | 2026-08-19 | 等待独立复审 | WP-5 实施：binding 运行时守卫、替换不变量、不可用/超时/不合格失败 attempt、迟到结果丢弃与 fresh retry 综合验证。 |
