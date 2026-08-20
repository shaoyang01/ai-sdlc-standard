# LOOP Requirement Change Classification Contract（需求变更分类合同）

> 状态：1.0.0 Accepted（2026-08-20，C02-WP1 复审通过与收口，Decision-038；前身为 0.1.0 Draft，Decision-037）
> 关联：[LOOP Entry Contract](loop-entry-contract.md) §4/§6/§7/§8 · [Change Control](change-control.md) · [Development Path Governance](development-path-governance.md) · [LOOP Core Contract](../docs/LOOP_CORE_CONTRACT.md) · [C02 有界实现规划](../docs/LOOP-CORE-C02-PLAN.md) §5/§6

## 1. Purpose

定义 LOOP 的需求变更分类持久合同：同一 Requirement 的每次入口变化都形成固定 schema、可恢复、可审计的 change record，持久化在 run journal 中，而不是只存在于 prompt 或聊天摘要。

本合同是 [LOOP Entry Contract](loop-entry-contract.md) §6 分类语义的机器可判定持久面：入口 Agent 负责判断分类，本合同负责以 fail-closed 方式记录判断结果或 blocked 状态。

## 2. Canonical Change Kind

只有五个 canonical token（`core/loop-change-classification.ts` `LOOP_CHANGE_KINDS`）：

| Change Kind | 语义（与 Entry Contract §6 对齐） | Payload Form | previousGeneration |
| --- | --- | --- | --- |
| `NEW_REQUIREMENT` | 不存在既有产物或既有 ID 无运行记录 | `FULL_REQUIREMENT` | `null` |
| `SUPPLEMENT` | 业务目标不变，补充边界条件或资料 | `DELTA_CHANGE` | 正整数 |
| `CHANGE` | 业务目标不变，范围/验收变化 | `DELTA_CHANGE` | 正整数 |
| `REWORK` | 实现后发现需求理解错误 | `DELTA_CHANGE` | 正整数 |
| `FEEDBACK_DRIVEN_CHANGE` | 测试/审阅反馈改变范围 | `DELTA_CHANGE` | 正整数 |

- `NEW_REQUIREMENT` 只能作为该 run 的第一条 CLASSIFIED 记录出现；同一 run 的后续分类不得再次声明 `NEW_REQUIREMENT`。
- `NEW_REQUIREMENT` 不得声明任何已确认事实（confirmed facts 为空）；其余四类必须显式声明保留的 confirmed-fact 边界（非空）。
- `previousGeneration` 只记录对前一 orchestration generation 的引用绑定；generation 推进权威属于后续编排工作包，本合同不实现。
- 是否新建 Requirement ID 的判断仍按 Entry Contract §4 与 Change Control 执行；本合同不重复定义，只要求 change record 的 `requirementId` 与所属 run 的 identity 精确一致。

## 3. Change Record Schema

固定字段集（schema version 1，多值字段以子表持久化，不存 JSON 载荷）：

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `schemaVersion` | `1` | 固定值；未知版本 fail-closed |
| `changeRecordId` | string | 派生自 `{runId}:change:{sequence}:{classified\|blocked}`，不得伪造 |
| `runId` | string | 所属 run；必须存在 |
| `requirementId` | string | 与 run identity 的 Requirement ID 精确一致；共享入口同一校验器 |
| `sequence` | positive integer | 每 run 独立序列，从 1 连续 |
| `status` | `CLASSIFIED` / `BLOCKED` | canonical |
| `changeKind` | Change Kind / `null` | CLASSIFIED 必填；BLOCKED 必须为 `null` |
| `payloadForm` | `FULL_REQUIREMENT` / `DELTA_CHANGE` / `null` | 与 changeKind 的一致性规则见 §2 |
| `previousGeneration` | positive integer / `null` | 规则见 §2 |
| `currentChangeScope` | string / `null` | CLASSIFIED 必填（本次真正要处理的当前变更范围）；BLOCKED 必须为 `null` |
| `confirmedFactsPreserved` | string 列表 | 保留的已确认事实边界；元素非空、去重；规则见 §2 |
| `sourceRefs` | 列表，≥1 | 来源引用，字段见 §4；priority 唯一 |
| `triggerEvidence` | string 列表 | 触发证据：canonical artifact ref（`loop-artifact:v1:<kind>:sha256:<64hex>`）或 `source:<locator>`；`source:` 形式的 locator 必须精确等于本记录 `sourceRefs` 中已记录的某个 locator；CLASSIFIED 非空 |
| `classificationReason` | string | 分类原因；必填 |
| `blockedReasonCode` | Blocked Reason / `null` | BLOCKED 必填；CLASSIFIED 必须为 `null` |
| `createdAt` | ISO-8601 | 链内单调不减 |

所有字符串为 trimmed、无控制字符的安全标量；错误消息不回显外部输入。

## 4. Source Ref 与 Blocked Reason

`sourceRefs[]` 元素固定字段：

| 字段 | 规则 |
| --- | --- |
| `sourceType` | `CONVERSATION` / `LARK_DOCUMENT` / `EXTRACTED_DOCUMENT` / `VISUAL_CAPTURE` / `HISTORICAL_RECORD`（对齐 Entry Contract §2 的可读来源类别） |
| `locator` | 来源位置（安全字符串） |
| `priority` | 正整数，记录内唯一（多来源优先级） |
| `sourceVersion` | string / `null`（来源版本，未知为 `null`） |
| `observedAt` | ISO-8601 |

`blockedReasonCode` canonical 值（对齐 Entry Contract §8 的 STOP 条件）：

| Blocked Reason | 语义 |
| --- | --- |
| `BUSINESS_GOAL_UNIDENTIFIABLE` | 业务目标无法识别 |
| `SOURCE_UNREADABLE` | 全部来源不可读或缺失关键上下文 |
| `SOURCE_PRIORITY_CONFLICT` | 来源优先级冲突无法裁决 |
| `CLASSIFICATION_UNCERTAIN` | 变更分类无法确定 |
| `AUTHORIZATION_MISSING` | 继续所需授权缺失 |

## 5. 持久化与并发语义

- **写入唯一入口**：只能通过 run store 的 `appendRequirementChange` API 写入；调用方不得直接伪造持久记录（任何绕过 API 写入的行在读取时因 schema/canonical hash 校验失败而为 `STORE_CORRUPT`）。
- **幂等重放**：同一输入精确重放返回已持久记录且不重复写入（`appended: false`）。
- **CAS/冲突**：同一 `changeRecordId` 内容不同 → `EVENT_ID_CONFLICT`；同一 `(runId, sequence)` 被占用 → `EVENT_SEQUENCE_CONFLICT`；跨连接并发依赖事务 + 唯一约束保证。
- **链规则**：sequence 从 1 连续、时间戳单调、记录 id 唯一、Requirement 身份一致、`NEW_REQUIREMENT` 只能是第一条 CLASSIFIED；违反即 `ILLEGAL_TRANSITION`。
- **run 状态守卫**：terminal run（completed/failed/cancelled）、活动 delivery stage、活动 capability execution 期间均拒绝追加（`ILLEGAL_TRANSITION`）。
- **append-only**：change record 不可变、不删除；BLOCKED 不是终态，后续记录可携带解决后的分类，BLOCKED 历史保持可审计。

## 6. Blocked 语义（不猜测）

分类不确定或来源冲突时，入口必须持久化 BLOCKED 记录并停止，不得猜测业务事实：

- BLOCKED 记录不得携带任何分类字段（kind/payload form/generation/scope/confirmed facts 全部为 `null` 或空）；
- BLOCKED 必须携带 canonical `blockedReasonCode` 与 `classificationReason`；
- BLOCKED 记录与 CLASSIFIED 记录在同一链中持久化，跨入口恢复时同样可读。

## 7. 跨入口恢复读取

- `listRequirementChanges(runId)`：读取并完整验证某 run 的 change 链（每条记录 schema + canonical hash + 链规则，任一失败 `STORE_CORRUPT`）。
- `findLatestRequirementChangeByRequirement(requirementId)`：按 Requirement 从新到旧扫描其 run，返回最新 change record；无任何分类返回 `undefined`。
- 另一入口恢复后读到的是**相同**的分类与 confirmed-fact 边界；入口不得凭新会话重新解释已确认事实。
- 每次 run 快照读取都会同时验证 change 链（corruption-first）。

## 8. 存储与迁移

- run journal 格式版本前进到 **v3**：新增 `loop_requirement_changes` 主表与 `loop_change_source_refs` / `loop_change_confirmed_facts` / `loop_change_trigger_evidence` 三个子表（固定标量列、主键、外键 CASCADE、`UNIQUE(run_id, sequence)`）。
- v2→v3 迁移与既有 v0→v1→v2 迁移在同一事务内完成；失败全部回滚、可幂等重试；未知版本、缺表、schema 漂移均 fail-closed（`STORE_CORRUPT`）。
- C01 既有事件与历史一律不重写。

## 9. 明确排除（不在本合同范围）

- artifact 失效计算、stale/superseded 传播（C02-WP2/WP3）；
- Re-Gate dispatch 与最早节点编排（C02-WP4）；
- orchestration generation 推进权威（本合同只记录 previousGeneration 引用）；
- 恢复上下文扩展与生产入口接线（C02-WP5）；
- 业务实现、真实 Agent 调用、任何 Git/发布副作用。

## Revision Record

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 0.1.0 | 2026-08-20 | Draft | C02-WP1 交付：五个 canonical change kind、change record schema、blocked 持久化、幂等/CAS 语义、v2→v3 迁移与跨入口读取合同。 |
| 1.0.0 | 2026-08-20 | Accepted | Round 2 独立复审 PASS，C02-WP1 收口（Decision-038）；合同成为 WP2～WP6 的分类持久基线。 |
