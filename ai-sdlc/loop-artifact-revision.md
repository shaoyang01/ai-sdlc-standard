# LOOP Artifact Revision and Current Authority Contract（产物版本与当前权威合同）

> 状态：0.1.8 Draft（2026-08-21，C02-WP2 实施，Decision-040；Round 8 复审修正：入口/gateway 接线校验拆出为 WP5 候选、TOCTOU 回归改为确定性屏障证据；待重新复审）
> 关联：[Decision-040](../docs/AI-SDLC-Decision-Records.md#decision-040授权并实施-c02-wp2-artifact-revision-and-current-authority) · [LOOP Requirement Change Classification Contract](loop-change-classification.md) · [C02 有界实现规划](../docs/LOOP-CORE-C02-PLAN.md) §4 G2 / §7 · [Artifact Versioning](artifact-versioning.md) · [Artifact Flow](artifact-flow.md)

## 1. Purpose

定义 LOOP 的产物版本持久合同：每个 canonical 节点的当前交付物都形成固定 schema、可恢复、可审计的 artifact revision，持久化在 run journal 中，并以每节点 current pointer 表达"当前有效"权威，消除 stable path、内部 SemVer、immutable ref/digest 与前驱/current 指针之间的脱节（规划 §4 缺口 G2）。

本合同只固定 revision 链与 current 权威的存储语义：journal 侧拥有 ref/digest，`manifest.md` Artifact Index 侧拥有 DocFlow 状态，二者不互相复制 schema，漂移由显式 cross-bind 函数判定 STOP。

## 2. Canonical 定义

- **节点域**：revision 的 `nodeId` 复用 journal 既有七个 canonical capability id（`NODE_CAPABILITY_IDS`）。Manifest Artifact Index 行到 capability 的映射固定为：`00 需求资料`→requirement-intake、`01 技术方案`→tech-design、`02 方案审核`→solution-review、`03 实现记录`→implementation、`04 代码审核`→code-review、`05 测试验收`→test-validation；`04 交付总结` 行无对应 capability，不在交叉绑定范围；solution-challenge 无 Index 行，属正常。
- **validity 状态机**（固定，不可回退）：
  - `ACTIVE → SUPERSEDED`：仅经 supersede 路径（同节点追加更高 SemVer 的 revision），同事务回填 `supersededBy`；
  - `ACTIVE → STALE`：仅经显式标记原语 `markArtifactRevisionStale`（供 C02-WP3 失效传播调用；本合同不实现依赖图传播）；
  - `STALE` 与 `SUPERSEDED` 均为吸收态；current pointer 指向非 ACTIVE revision 时，current 读取 fail-closed（`STORE_CORRUPT`），链读取保持可审计。
- **Gate 绑定**：Gate 节点（solution-review、test-validation）的 `gateResult` 必须为 `PASS`/`PASS_WITH_RISK` 且与 producer execution 的 Gate 结果精确一致；非 Gate 节点必须为 `NOT_APPLICABLE`。
- **generation**：可空正整数，仅记录引用绑定；generation 推进权威属于 C02-WP4，本合同不实现。

## 3. Revision Record Schema

固定字段集（schema version 1；`upstreamRevisionIds` 以子表持久化，不存 JSON 载荷）：

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `schemaVersion` | `1` | 固定值；未知版本 fail-closed |
| `revisionId` | string | 派生自 `{runId}:revision:{nodeId}:{sequence}`，不得伪造 |
| `runId` | string | 所属 run；必须存在 |
| `requirementId` | string | 与 run identity 的 Requirement ID 精确一致；共享入口同一校验器 |
| `nodeId` | capability id | 七个 canonical capability id 之一 |
| `sequence` | positive integer | 每 run+node 独立序列，从 1 连续 |
| `generation` | positive integer / `null` | 仅引用绑定（§2） |
| `stablePath` | string | 稳定路径（安全标量） |
| `artifactKind` | `LoopArtifactKind` | 必须与 `artifactRef` 的 kind 段一致 |
| `semver` | `x.y.z` | 数值段 SemVer；节点链内严格前进 |
| `artifactRef` | string | canonical 内容寻址引用 `loop-artifact:v1:<kind>:sha256:<64hex>`；digest 段必须与 `digest` 一致 |
| `digest` | sha256 hex | 64 位小写 hex |
| `producerExecutionId` | string | 形如 `{runId}:capability:{sequence}:{status}`；必须指向同 run 已成功 capability execution（§4） |
| `gateResult` | Gate result / `null` | 规则见 §2 Gate 绑定 |
| `validity` | `ACTIVE`/`STALE`/`SUPERSEDED` | 新 revision 只能以 `ACTIVE` 诞生 |
| `supersededBy` | revision id / `null` | 仅 `SUPERSEDED` 携带，必须指向同 run 同 node 的下一 sequence |
| `upstreamRevisionIds` | revision id 列表 | 同 run 前缀、去重、不自引用；追加时刻必须是各自节点的 ACTIVE current（§5） |
| `createdAt` | ISO-8601 | 节点链内单调不减 |

所有字符串为 trimmed、无控制字符的安全标量；错误消息不回显外部输入。

## 4. 四项绑定与执行证据

`appendArtifactRevision` 强制 revision 的 `nodeId`/`artifactRef`/`semver`/`digest` 与 `producerExecutionId` 指向的同 run、已成功 capability execution 事件的 capability 与 output 三元组（`outputArtifactRef`/`outputArtifactVersion`/`outputDigest`）精确匹配；Gate 节点的 `gateResult` 必须等于该事件的 Gate 结果。绑定失败（producer 不存在、未成功、节点不符、三元组漂移、Gate 漂移）一律 `ILLEGAL_TRANSITION` 拒绝。同一四项绑定在**每条读回路径上逐条重验**（§7）：canonical hash 只证明行内自洽，rehash 篡改过的行在 producer 不存在、未成功、节点/三元组/Gate 漂移时必须 `STORE_CORRUPT`。

由于 C01 capability 链每 run 每 capability 只承认一次成功执行，且读回路径重验 producer 绑定，可读的 journal 当前不可能容纳同一节点的两个 revision（第二个 revision 需要同 capability 的第二次成功执行证据）。同节点多 revision（supersede/pointer 前进成功路径）为 C02-WP4 重执行语义预留：存储语义在本合同中完整定义，链规则在链校验器层面验证，store 级 supersede 成功路径覆盖随 WP4 的链扩展一并验收。

**blob 绑定（第五项绑定）**：当 run store 绑定 `LoopArtifactStore`（`LoopRunStoreOptions.artifactStore`）时，`appendArtifactRevision` 在四项绑定之外验证 `artifactRef`/`digest` 指向的物理 blob 真实存在且 digest 一致；blob 从未写入或 digest 漂移一律 `ILLEGAL_TRANSITION` 拒绝，缺失 blob 不得成为 ACTIVE current。该绑定在**每条读回路径逐条重验**（§7）：blob 写后丢失或内容被覆写时读取 fail-closed（`STORE_CORRUPT`）。未绑定 artifact store 的 run store 保持 journal-only 语义（仅限纯 journal 测试与工具）。本合同只定义 store 级绑定语义；**受支持入口是否强制绑定、如何校验 wiring 属生产入口接线范畴，明确排除（§9，C02-WP5）**。

## 5. 持久化与并发语义

- **写入唯一入口**：`appendArtifactRevision` 与 `markArtifactRevisionStale` 是仅有的两个写原语；任何绕过 API 写入的行在读取时因 schema/canonical hash 校验失败而为 `STORE_CORRUPT`。
- **幂等重放**：同一输入精确重放（且持久 revision 仍处原始 ACTIVE 形态）返回已持久 revision 且不重复写入（`appended: false`）。
- **CAS/冲突**：同一 `revisionId` 内容不同 → `EVENT_ID_CONFLICT`；同一 `(runId, nodeId, sequence)` 或 `(runId, nodeId, semver)` 被占用 → `EVENT_SEQUENCE_CONFLICT`；跨连接并发依赖事务 + 唯一约束保证，相同候选并发幂等收敛。
- **版本前进与 supersede 原子化**：新 revision 的 semver 必须按 SemVer 大于该节点前一 current；同事务内 ACTIVE 旧 current 置 `SUPERSEDED` 并回填 `supersededBy`、current pointer 以"期望当前 revision"为谓词 CAS 前进。STALE 旧 current 不发生状态迁移（状态机无 `STALE → SUPERSEDED` 边），pointer 直接前进越过它。候选链校验作用于**转换后状态**——旧 current 以 `supersedeArtifactRevision` 计算出的 SUPERSEDED 形态进入候选集，校验与落库复用同一纯函数产物，不存在第二份 supersede 语义。
- **上游消费 fail-closed**：upstream refs 必须引用同 run 现存 revision，且在追加时刻是各自节点的 current 指针目标且 validity 为 ACTIVE；stale/superseded/不存在/跨 run 的上游一律拒绝。
- **链规则**：节点分组内 sequence 从 1 连续、时间戳单调、SemVer 严格前进、仅节点最新 revision 可为 ACTIVE（更早 revision 只能是 SUPERSEDED 或 STALE）、`supersededBy` 精确指向下一 sequence、upstream 必须解析到同 run 已存 revision 且不晚于消费方创建；违反即 `ILLEGAL_TRANSITION`（追加时）或 `STORE_CORRUPT`（读取时）。
- **run 状态守卫**：terminal run（completed/failed/cancelled）、活动 delivery stage、活动 capability execution 期间均拒绝追加与 STALE 标记（`ILLEGAL_TRANSITION`）。
- **append-only**：revision 不可变（仅 validity/supersededBy 两个状态字段可经上述原语迁移并重算 canonical hash）、不删除；历史保持可审计。

## 6. Manifest 交叉绑定

`crossBindArtifactIndexRow(row, currentRevision)` 为纯函数：调用方提供解析后的 Index 行（node/stablePath/version/status/result）与该节点的 journal current revision（无为 `null`）：

- stablePath 与 version 必须与 current revision 精确一致；
- manifest status 与 runtime validity 映射一致：current ACTIVE ↔ `draft`/`active`；STALE ↔ `stale`；SUPERSEDED ↔ `replaced`；
- Gate 行（`02 方案审核`、`05 测试验收`）的 result 必须等于 revision 的 `gateResult`；非 Gate 行的 result 不参与交叉绑定（DocFlow 评审结果归 manifest 侧所有）；
- 任一漂移返回 `STOP` 诊断（`NODE_NOT_MAPPED`/`CURRENT_REVISION_MISSING`/`NODE_MISMATCH`/`STABLE_PATH_DRIFT`/`VERSION_DRIFT`/`STATUS_DRIFT`/`RESULT_DRIFT`），不静默选边；调用方输入形状非法时 fail-closed（`INVALID_INPUT`）。

## 7. 读回交叉绑定

- `listArtifactRevisions(runId)`：读取并完整验证某 run 的 revision 集合（每条记录 schema + canonical hash 重算 + requirementId 与已验证 run identity 逐条比对 + **producer execution 四项绑定逐条重验**（§4：存在且已成功、capability 匹配、output 三元组精确一致、Gate 结果一致）+ **blob 绑定逐条重验**（§4：绑定 artifact store 时物理 blob 存在且 digest 一致，缺失/覆写即 `STORE_CORRUPT`）+ 链规则 + current pointer 双向一致性：每个 pointer 必须指向其节点最大 sequence 的 revision，每个节点链必须恰好有一个 pointer；任一失败 `STORE_CORRUPT`）。
- `getCurrentArtifactRevision(runId, nodeId)`：在上述验证之上，pointer 目标必须为 ACTIVE，否则 `STORE_CORRUPT`；run 或节点链不存在返回 `undefined`。
- **单事务读路径（无 TOCTOU 间隙）**：与 WP1 合同 §7 同一规则——上述公开读路径必须在**同一事务**内完成快照验证与 revision 明细读取并返回；内部 revision 读取器只接收快照验证产出的已验证 `requirementId`，不得再自行查询 `loop_runs.requirement_id` 列。验证与返回拆分为两个事务会留下并发篡改窗口，使返回的 revision 脱离已验证 identity（本节的篡改 fail-closed 语义即被架空）。
- 每次 run 快照读取同时验证 revision 链与 pointer（corruption-first），挂入 `verifySnapshotInTransaction`。

## 8. 存储与迁移

- run journal 格式版本前进到 **v4**：新增 `loop_artifact_revisions` 主表（`UNIQUE(run_id, node_id, sequence)`、`UNIQUE(run_id, node_id, semver)`、外键 CASCADE、run_id/node_id 索引）、`loop_artifact_revision_upstreams` 子表（`PRIMARY KEY (revision_id, upstream_index)`，外键 CASCADE）、`loop_artifact_current` 每节点 current pointer 表（`PRIMARY KEY (run_id, node_id)`，双外键 CASCADE）。
- v3→v4 与既有 v0→v3 迁移在同一事务内完成；失败全部回滚、可幂等重试；未知版本、v4 标记缺表、schema/约束/外键漂移均 fail-closed（`STORE_CORRUPT`）。
- C01 与 C02-WP1 既有事件与历史一律不重写。

## 9. 明确排除（不在本合同范围）

- finding 分类、依赖图失效传播与自动路由（C02-WP3；本合同仅提供 STALE 标记原语，单 revision、无传播）；
- Re-Gate dispatch 与 generation 推进权威（C02-WP4）；
- 恢复上下文扩展与生产入口接线（C02-WP5）；
- 业务实现、真实 Agent 调用、任何 Git/PR/发布副作用。

## Revision Record

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 0.1.0 | 2026-08-20 | Draft | C02-WP2 交付（Decision-040）：artifact revision schema、validity 状态机、四项绑定与 producer execution 锚定、supersede + current pointer CAS、上游消费 fail-closed、manifest cross-bind、v3→v4 迁移与读回交叉绑定合同。 |
| 0.1.1 | 2026-08-20 | Draft | Round 1 复审修正：四项绑定在每条读回路径逐条重验（rehash 篡改的 producer 不存在/失败/节点/三元组/Gate 漂移均 `STORE_CORRUPT`）；链规则新增"仅节点最新 revision 可为 ACTIVE"；测试预置说明修正——producer 重验后 WP4-era 预置行不再自洽，同节点多 revision 的 store 级 supersede 成功路径覆盖推迟到 C02-WP4 链扩展；测试源码控制字节改为转义字面量。 |
| 0.1.2 | 2026-08-20 | Draft | Round 2 复审修正（H3）：写入路径的候选链校验改为转换后状态，新增 `supersedeArtifactRevision` 纯函数统一校验与落库的 supersede 语义；store 级端到端 supersede 成功路径覆盖经 Current User 显式重基线，随 C02-WP4 链扩展一并验收。 |
| 0.1.3 | 2026-08-20 | Draft | Round 3 复审修正（缺失 blob 可判定）：新增第五项 blob 绑定——run store 经 `LoopRunStoreOptions.artifactStore` 绑定 `LoopArtifactStore` 后，写入路径拒绝 blob 从未写入/digest 漂移的 revision（`ILLEGAL_TRANSITION`），所有读回路径逐条重验物理 blob 存在且 digest 一致（写后丢失/覆写即 `STORE_CORRUPT`）；覆盖"从未存在"与"写后丢失"两类测试；待重新复审。 |
| 0.1.4 | 2026-08-21 | Draft | Round 4 复审修正（blob 校验不得经标准构造路径绕过）：`LoopCapabilityEntry` 构造时强制 `runStore` 已通过 `LoopRunStoreOptions.artifactStore` 绑定且与入口所用 artifact store 为同一实例（`artifactStoreBinding` 访问器判定），未绑定或绑定不匹配 fail-closed（`INVALID_INPUT`）；入口测试基线全部改为绑定构造并新增未绑定/错配负例；待重新复审。 |
| 0.1.5 | 2026-08-21 | Draft | Round 5 复审修正：入口同时约束 gateway——`ExecutionGateway` 新增 `isCapabilityTracingBoundTo` 谓词，入口要求 gateway 的 capability tracing 写入同一对 run store / artifact store 实例（防止输出 blob 与 journal 分裂到不同 store）；同一性判定改为不暴露实例能力的谓词（`LoopRunStore.isBoundToArtifactStore` 取代泄露 put/close 的 `artifactStoreBinding` 访问器）；补 gateway tracing 错配与非真实 gateway 负例；待重新复审。 |
| 0.1.6 | 2026-08-21 | Draft | Round 6 复审修正（同实例校验可伪造、构造后配置可换）：绑定同一性改为**非虚拟**校验——模块级 WeakMap 记录构造期绑定状态，入口经模块函数 `isLoopRunStoreBoundToArtifactStore` / `isExecutionGatewayTracingBoundTo` 判定，子类覆写与猴子补丁实例成员均无法伪造（实例谓词方法移除）；`LoopCapabilityEntry` 与 `ExecutionGateway` 构造时快照并冻结依赖配置（含嵌套 `capabilityTracing`），构造后替换调用方 options 的 gateway/artifactStore/capabilityTracing 均不影响已验 wiring；补子类伪造、猴子补丁、构造后变异与端到端执行回归；待重新复审。 |
| 0.1.7 | 2026-08-21 | Draft | Round 7 复审修正（读路径 TOCTOU）：`listArtifactRevisions` / `getCurrentArtifactRevision`（及 WP1 的对应读路径）的快照验证与 revision 明细读取合入**同一事务**，消除两事务间被并发连接篡改 `requirement_id` 绑定的窗口；内部 revision 读取器改为接收已验证 `requirementId`，不再自行查询表列；新增第二连接确定性事务间隙回归（list/current 在间隙篡改下均 `STORE_CORRUPT`），保留既有 blob 绑定、producer 重验与正常读回回归；待重新复审。 |
| 0.1.8 | 2026-08-21 | Draft | Round 8 复审修正：①范围收口——`LoopCapabilityEntry`/`ExecutionGateway` 的接线校验（同实例绑定、非虚拟 WeakMap 判定、配置快照冻结）及其测试越出 WP2 授权的生产入口接线边界（§9 WP5），全部拆出为未提交的 WP5 候选；`LoopRunStoreOptions.artifactStore` 与 store 级 blob 读写校验保留在 WP2。②TOCTOU 证据修正——Round 7 的两处"事务间隙"回归实际在公开读调用前完成并提交篡改，无法区分单事务与旧双事务实现；已重写为确定性屏障回归：屏障在"快照已验证、明细读取前"经第二连接提交篡改，断言四条公开读路径（WP1 的 list/findLatest、WP2 的 list/getCurrent）返回本事务一致快照（旧数据、不报错），且篡改在事务结束后被下一次读取以 `STORE_CORRUPT` 检出；原两处回归改标为"事务开始前篡改 fail-closed"语义。生产读路径未改；待重新复审。 |
