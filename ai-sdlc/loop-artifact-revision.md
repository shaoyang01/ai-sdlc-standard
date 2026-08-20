# LOOP Artifact Revision and Current Authority Contract（产物版本与当前权威合同）

> 状态：0.1.2 Draft（2026-08-20，C02-WP2 实施，Decision-040；Round 2 复审修正后待重新复审）
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

- `listArtifactRevisions(runId)`：读取并完整验证某 run 的 revision 集合（每条记录 schema + canonical hash 重算 + requirementId 与已验证 run identity 逐条比对 + **producer execution 四项绑定逐条重验**（§4：存在且已成功、capability 匹配、output 三元组精确一致、Gate 结果一致）+ 链规则 + current pointer 双向一致性：每个 pointer 必须指向其节点最大 sequence 的 revision，每个节点链必须恰好有一个 pointer；任一失败 `STORE_CORRUPT`）。
- `getCurrentArtifactRevision(runId, nodeId)`：在上述验证之上，pointer 目标必须为 ACTIVE，否则 `STORE_CORRUPT`；run 或节点链不存在返回 `undefined`。
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
