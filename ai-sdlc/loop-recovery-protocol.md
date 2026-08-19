# Loop Recovery Protocol（跨入口恢复协议）

> 状态：WP-4 + WP-4B Accepted（2026-08-19，Decision-029/031/032）。两者的联合证据已满足 C01 完成合同第 1、2 条；第 3、4 条仍归 WP-5，须单独授权。
> 关联：[Entry Contract](loop-entry-contract.md) · [Agent Capability Binding](agent-capability-binding.md) · [LOOP Core Contract](../docs/LOOP_CORE_CONTRACT.md) §6.2

## 1. Purpose

定义跨入口恢复协议与执行溯源合同：**每次节点执行记录实际使用的 binding、binding 版本与输入产物引用；入口以 Requirement ID 定位最新已验证运行记录并恢复当前节点、阶段、attempt、fixRound、阻塞/失败原因与最近执行溯源，不重解释已确认事实**（C01 完成合同第 1、2 条）。

WP-4（Decision-027）提供最小 helper 与恢复面；WP-4B（Decision-028/031）增加完整 capability attempt 模型、ExecutionGateway 强制写入与受支持入口。WP-4B 经两轮独立复审后由用户裁决通过（Decision-032），两者共同构成 C01 完成合同第 1、2 条的已验收证据。

## 2. 执行溯源（Event Provenance）

run journal 事件 schema 扩展三个可空字段（C01 WP-4）：

```text
bindingId:          本次节点执行实际使用的 binding（binding-{agent}-{capability}）
bindingVersion:     binding 合同版本（如 1.0.0）
inputArtifactRef:   输入产物引用（可选）
```

约束：

- 字段可空（`null`），旧库事件读取为 `null`；
- 哈希迁移：旧库事件的 `canonical_sha256` 按扩展前 13 字段集计算。init() 在单个迁移事务内完成补列、验证与重算：先用旧字段集形式验证每个历史事件（三个溯源字段必须全为 `null`），再把 hash 原子重算为扩展字段集形式；同一初始化流程继续创建/校验 capability event 表并最终置 `user_version = 2`。任一事件两种形式都不匹配（含旧 hash 被篡改）判 `STORE_CORRUPT`，整个事务回滚——补列、已重算的 hash、新表、`user_version` 均不落库，修复数据后重试 init 即可幂等完成迁移；
- 读取单一形式：迁移完成后读取只接受扩展字段集一种 hash 形式——即使溯源字段全为 `null` 的事件被替换为合法旧格式 hash，也判 `STORE_CORRUPT`（格式来源由迁移持久化，不依赖读取侧猜测）；
- 格式版本 fail-closed：当前 `user_version = 2`；v0 先完成旧事件 hash/溯源列迁移，v1 在同一初始化事务中增加 capability execution 表后升 v2；未知未来版本、负数、v2 缺表或表结构/约束漂移均在 init() 判 `STORE_CORRUPT`；
- fail-closed：非 null 必须是合法字符串，错误消息不回显输入；
- 旧库自动迁移：`loop_events` 表缺列时 init 时补列（`binding_id` / `binding_version` / `input_artifact_ref`），存量行按 `null` 参与验证并按上述规则重算 hash，无需重建；
- 每次节点执行（stage_started / stage_succeeded / stage_failed）都应携带溯源字段，形成可追溯的 binding 尝试链（LOOP Core Contract §6.2：每次节点执行记录实际使用的 binding、Agent/adapter 标识和版本、输入产物版本、执行尝试与结果）。

### 2.1 Capability Execution Event（WP-4B）

七个 `NodeCapabilityId` 与既有八个 `LoopStageName` 是不同状态机。WP-4B 因此在同一 run journal 内增加正交的 `loop_capability_executions` 事件流，不把能力名称伪装成 delivery stage；这是 Decision-028 所允许的 `recordNodeExecution` 后继 API。

每个 started/succeeded/failed 事件固定记录：

```text
schemaVersion / executionEventId / runId / sequence
capability / nodeId / attempt / status / createdAt
bindingId / bindingVersion / bindingRegistryVersion
executorAgent / executorAdapter / executorVersion
inputArtifactRef / inputArtifactVersion / inputDigest
outputArtifactRef / outputArtifactVersion / outputDigest
gateResult
unresolvedFindingsRef / unresolvedFindingsDigest
nextStepEligibility
errorCode / retryable / reasonCode
```

约束：

- 固定字段集，未知/缺失字段、Proxy、非法版本/时间/摘要/引用一律 `INVALID_INPUT`；读取持久数据时统一转为 `STORE_CORRUPT`；
- artifact ref 内的 SHA-256 必须与独立 digest 字段一致；成功输出仅允许 `capability_output`，finding 引用仅允许 `capability_findings`；
- 七能力按 canonical 顺序执行；失败仅在 `retryable=true` 时允许同能力下一 attempt；Gate/finding 阻塞时不得进入下一能力；
- started 是互斥执行 claim。完全相同的重复写入只算幂等回放，不取得第二次 dispatch 权；存在 active capability 时 delivery journal 不允许推进；
- `solution-review` / `test-validation` 必须提供结构化 `PASS / FAIL / PASS_WITH_RISK`，其它能力使用 `NOT_APPLICABLE`；未解决 finding 或 FAIL Gate 不得产生 `ELIGIBLE`；
- 普通 `getSnapshot/getRun/findLatestRunByRequirement` 同时验证 legacy delivery 事件与 capability 事件，任何一侧损坏都 fail-closed。

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
       blockingReasonCode, failureReasonCode, lastExecution,
       capabilityStates, capabilityChainStatus,
       nextCapability, lastCapabilityExecution } | undefined
```

- 基于 WP-1 已验收的 `findLatestRunByRequirement`（最新已验证 run 快照，corruption-first）；
- 恢复内容：当前阶段、attempt、fixRound、运行状态、阻塞/失败原因码、最近一次 legacy 节点执行；并为七能力恢复最近 attempt、实际 binding/registry/Agent/adapter/executor 版本、有效输出版本与摘要、Gate、未解决 finding、下一步资格、`READY / RUNNING / BLOCKED / COMPLETED` 能力链状态及 canonical `nextCapability`；
- `RUNNING` 表示存在尚未闭合的 started claim，此时 `nextCapability = null`：它不是可直接 dispatch 的下一步，必须先由受支持入口执行 §4.1 的中断关闭；
- requirement 尚无 run 时返回 undefined（入口据此进入"创建"路径）；
- 恢复后继续的是已确认事实：入口不得凭新会话重新解释（Entry Contract §7）。

### 4.1 受支持入口与生产写入

- `LoopCapabilityEntry` 是 WP-4B 的受支持入口：按 Requirement ID 创建或定位最新已验证 run；对半完成的 `created` run 补 `run_started`；只允许执行 `nextCapability`；
- 第一能力消费已持久化的 `requirement_summary`，后续能力必须逐字段匹配前一能力的有效 output ref/version/digest，合法但无关的 artifact 也会被拒绝；
- ExecutionGateway 在 dispatch 前从不可变 BindingRegistry 选择唯一 enabled binding 并写 started claim；只有取得 claim 的调用方才执行 Agent adapter；
- 当恢复到 active started（包括 claim 落库后、dispatch 进行中或 terminal 写入前进程中断），入口只接受与该 claim 的 capability 和 input ref/version/digest 完全一致的请求；随后调用 journal 的原子中断 API，以固定 `ATTEMPT_INTERRUPTED / ENTRY_RECOVERY` failed 事件关闭它。关闭事件逐字段复制已持久化的 binding/registry/Agent/adapter/executor 与输入快照，不由新入口重构或替换；
- 中断事件的 `retryable` 取自 active claim 对应历史 binding 的 `failurePolicy`：`retry_other_binding` 才允许生成下一 attempt，`block` 则保持阻塞。关闭与新 attempt 是两个独立持久事实，迟到的旧执行者不能覆盖已占用的 terminal sequence；
- shadow、执行异常、Agent 不匹配、产物类型不符、Gate/finding 缺失或输出无法安全持久化均写 failed attempt，不产生有效输出；
- binding 替换会递增 registry snapshot version；历史事件保存原 binding/registry/executor 快照，新 attempt 使用新快照。
- 配置 `capabilityTracing` 后，七个 canonical capability 请求必须携带完整 `loopExecution`；缺失时 Gateway 在 binding 选择、journal 写入和 Agent dispatch 前以 `INVALID_INPUT` 拒绝。legacy 非 capability 请求保持原兼容路径。

## 5. 与 checkpoint 的关系（复用裁剪）

- `loop-delivery-checkpoint`（D10-A）的 fresh/recovery 模式与不可变 generation 链可作为后续恢复机制的支撑候选；
- 其**发布 phase（publish_intent / commit / push / pr 等）不进入 C01**（LOOP Core Contract §8 Non-Goals）；
- C01 跨入口恢复以 run journal（本协议）为持久恢复面；checkpoint 发布语义留在历史，不作为 Core 验收条件。

## 6. 边界

- 不实现 checkpoint 发布链；
- 不调用任何真实 Agent；
- 不产生任何 Git 发布动作；
- 不修改 WP-2 节点能力合同；binding schema 保持 12 字段不变，仅使 registry replacement 递增不可变快照版本；
- legacy `appendEvent` 保持 WP-1 通用语义；生产 capability 写入由 ExecutionGateway + `appendCapabilityExecution` 强制；
- 不把本轮产品仓库 commit/push 解释为 LOOP 节点可执行的 Git 副作用；人工 Git 边界不变；
- WP-4B 已经 review 与用户裁决收口；C01 完成合同第 1、2 条已完成。第 3、4 条及 WP-5 不因本次收口获得授权。

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
| 0.3.0 | 2026-08-19 | 等待复审 | WP-4B（Decision-031）：新增正交 capability attempt 事件流、journal v2 迁移、完整执行者/产物/Gate/finding/资格恢复投影、BindingRegistry/Gateway 强制写入与按 Requirement ID 创建/恢复的受支持入口。 |
| 0.3.1 | 2026-08-19 | 等待复审 | WP-4B review round 1 correction：`RUNNING` 不再暴露不可执行的 nextCapability；受支持入口按历史 binding failurePolicy 原子关闭中断 attempt 并重试，关闭事件复制原 started 执行者与输入快照；配置 tracing 的 canonical capability 缺 `loopExecution` 时 dispatch 前 fail-closed。 |
| 0.4.0 | 2026-08-19 | Accepted | WP-4B review round 2 通过并收口（Decision-032）：独立复核确认中断恢复、历史执行者快照、binding 替换后的重试、无 tracing context 绕过均闭合；WP-4 + WP-4B 联合满足 C01 完成合同第 1、2 条，第 3、4 条继续归 WP-5 且须单独授权。 |
