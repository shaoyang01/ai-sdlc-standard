# LOOP Finding Lifecycle and Dependency Invalidation Contract（Finding 生命周期与依赖失效合同）

> 状态：0.1.1 Draft（2026-08-21，C02-WP3 Round 1 复审修正，Decision-042；待独立复审）
> 关联：[C02 有界实现规划](../docs/LOOP-CORE-C02-PLAN.md) §4 G3 / §6 C02-WP3 · [LOOP Artifact Revision and Current Authority Contract](loop-artifact-revision.md) · [LOOP Requirement Change Classification Contract](loop-change-classification.md) · [LOOP Core Contract](../docs/LOOP_CORE_CONTRACT.md)

## 1. Purpose

定义 LOOP 的 finding 生命周期持久合同：每一次审核/测试/入口发现的问题都形成固定 schema、可恢复、可审计的 finding record，绑定具体 artifact revision 持久化在 run journal 中；有效 finding 的失效影响由 canonical 依赖图计算并在**同一事务**内落库，而不是只存在于 review 文本或聊天摘要（规划 §4 缺口 G3）。

C01 只在 capability execution 事件上携带 opaque 的 `unresolvedFindingsRef` 并阻塞下一节点；本合同把 finding 提升为一等持久事实，并固定"失效传播 + next eligibility 推导"的存储语义。Re-Gate 节点编排（选择最早节点、创建新 generation）属于 C02-WP4，本合同不实现。

## 2. Canonical 定义

- **Severity**（固定四值）：`CRITICAL` / `HIGH` / `MEDIUM` / `LOW`。
- **Category**（固定五值，与来源 capability 绑定校验）：

  | Category | 语义 | 允许的 sourceCapability |
  | --- | --- | --- |
  | `REQUIREMENT` | 需求资料缺陷 | `requirement-intake` |
  | `SOLUTION` | 技术方案缺陷 | `tech-design`、`solution-challenge`、`solution-review` |
  | `IMPLEMENTATION` | 实现缺陷 | `implementation` |
  | `REVIEW` | 代码审核发现 | `code-review` |
  | `TEST` | 测试验收发现 | `test-validation` |

  这就是规划验收要求的五类 finding 路由矩阵：category 必须与 sourceCapability 落在上表同一行，否则 fail-closed（`INVALID_INPUT`）。
- **状态机**（固定，不可回退）：
  - `OPEN → RESOLVED`：仅经 `resolveFinding`，必须携带**当前**修订与 Gate 证据（不变量 8）；
  - `OPEN → ACCEPTED_RISK`：仅经 `acceptFindingRisk`，必须携带用户风险接受证据；
  - `OPEN / RESOLVED / ACCEPTED_RISK → SUPERSEDED`：仅经 `supersedeFinding`（同 run 追加替代 finding 时回填）；
  - `RESOLVED` / `ACCEPTED_RISK` / `SUPERSEDED` 对关闭语义均为吸收态；`SUPERSEDED` 完全吸收。
- **Canonical 依赖图**：节点级依赖图固定为 `NODE_CAPABILITY_IDS` 的线性序（`requirement-intake → tech-design → solution-challenge → solution-review → implementation → code-review → test-validation`）；revision 级依赖为各 revision 的 `upstreamRevisionIds`（WP2 合同）。失效传播只沿"节点序下游"计算，调用方不得提交任意失效列表。
- **最早受影响节点**：finding 的 `earliestAffectedNodeId` 必须满足 `index(earliestAffectedNodeId) ≤ index(sourceCapability)`——不可能在缺陷存在之前发现它。

## 3. Finding Record Schema

固定字段集（schema version 1；失效明细以子表持久化，不存 JSON 载荷）：

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `schemaVersion` | `1` | 固定值；未知版本 fail-closed |
| `findingId` | string | 派生自 `{runId}:finding:{sequence}`，不得伪造 |
| `runId` | string | 所属 run；必须存在 |
| `requirementId` | string | 必须与已验证 run identity 精确一致 |
| `sequence` | number | 每 run 独立序列，从 1 连续 |
| `sourceCapability` | NodeCapabilityId | 七个 canonical id 之一；与 category 同表行绑定 |
| `sourceRevisionId` | string / `null` | 绑定具体 artifact revision；必须引用同 run 现存 revision；Gate FAIL 等无产物场景可为 `null` |
| `severity` | Severity | canonical 四值 |
| `category` | Category | canonical 五值 |
| `evidenceRef` | string | `loop-artifact:v1:<kind>:sha256:<digest>` 形式，与 evidenceDigest 一致 |
| `evidenceDigest` | string | sha256 hex |
| `earliestAffectedNodeId` | NodeCapabilityId | 满足 §2 序约束 |
| `status` | `OPEN` / `RESOLVED` / `ACCEPTED_RISK` / `SUPERSEDED` | 出生即 `OPEN`；迁移只经 §2 状态机 |
| `resolvedByRevisionId` | string / `null` | RESOLVED 必填：必须是该节点**当前** ACTIVE revision |
| `resolutionEvidenceRef` / `resolutionEvidenceDigest` | string / `null` | RESOLVED 必填：引用当前 Gate/审核证据 |
| `riskAcceptedBy` | string / `null` | ACCEPTED_RISK 必填：风险接受者标识 |
| `riskAcceptanceEvidenceRef` / `riskAcceptanceEvidenceDigest` | string / `null` | ACCEPTED_RISK 必填：用户风险接受证据 |
| `supersededBy` | string / `null` | SUPERSEDED 时指向替代 findingId |
| `createdAt` | string | ISO 时间戳 |
| `canonicalSha256` | string | 固定 canonical 形式的 sha256 |

## 4. 失效传播与原子性

- 写入唯一入口为 `appendFinding`：记录 finding 的**同一事务**内，store 依据 `earliestAffectedNodeId` 沿 canonical 节点序计算全部下游（含该节点自身）当前 ACTIVE revision 集合，逐一执行 STALE 标记（复用 WP2 的单 revision STALE 原语语义：guarded UPDATE + canonical hash 重算），并把每条失效边持久化到 `loop_finding_invalidations` 子表（`finding_id + invalidation_index + revision_id + node_id`）。
- 调用方只提供 finding 本体与最早受影响节点；**不得**提交任意失效列表——失效集合由 store 计算，计算结果与持久化不一致即 `STORE_CORRUPT`。
- **Append-time 完整失效范围持久化**（0.1.1）：同一事务内把计算出的完整失效集合归约为 `loop_finding_scopes` 记录（`finding_id + edge_count + scope_digest + canonical_sha256`），其中 `scope_digest` 是对按 `invalidation_index` 排序的完整失效边列表 canonical 形式的 sha256；**空失效集合是一等值**（`edge_count = 0`，空列表 digest）。读回时逐 finding 重算存活边的 digest 与计数并与持久化 scope 比对——删除首/中/末/全部失效边、删除 scope 记录、篡改 scope digest 均 `STORE_CORRUPT`，杜绝"残存边合法即通过"的静默缺边。
- 无下游 ACTIVE revision 时失效集合为空是合法结果（finding 仍然持久化）。
- "先失效后调度"（不变量 6）：finding、失效边、STALE 标记、scope 记录在同一事务原子提交；之后任何恢复/入口读取看到的 eligibility 都已经反映失效。next eligibility **不单独持久化**，由 durable 事实（STALE current、OPEN finding、Gate 结果）按 §6 固定规则推导，推导结果与持久化事实天然一致。

## 5. 状态迁移与关闭证据

- `resolveFinding`：目标必须 `OPEN`；`resolvedByRevisionId` 必须存在、属于 `earliestAffectedNodeId` 或其下游节点、且是该节点**当前 ACTIVE** revision（指向 STALE/SUPERSEDED/历史 revision 一律拒绝，`ILLEGAL_TRANSITION`）；必须携带 resolution 证据 ref/digest。迁移为 guarded UPDATE + hash 重算，并发漂移即 `STORE_CORRUPT`。
- `acceptFindingRisk`：目标必须 `OPEN` 且 severity 不得为 `CRITICAL`（Critical 不可风险接受，只能 RESOLVED 或 SUPERSEDED）；必须携带 `riskAcceptedBy` 与风险接受证据 ref/digest。
- **Durable 关闭证明**（0.1.1）：两种关闭迁移在同一事务内向 `loop_finding_proofs` 写入一条一等持久证明记录（每 finding 至多一条，`proof_kind ∈ {RESOLUTION, RISK_ACCEPTANCE}`，canonical hash 覆盖全字段）：
  - RESOLUTION 证明捕获迁移时刻解决 revision 的**不可变内容绑定**（`revision_id + revision_node_id + revision_artifact_ref + revision_artifact_digest`）；revision 的 validity 不捕获——解决后合法地变为 STALE 属于 Gate 语义（§6 阻塞），不是 corruption。
  - RISK_ACCEPTANCE 证明捕获 `riskAcceptedBy` 与证据 ref/digest；`riskAcceptedBy` 是不透明接受者标识，store 不验证身份本体，其事实锚点是证据 blob（见下）与证明记录的交叉绑定。
  - `supersedeFinding` 置 `SUPERSEDED` 的同一事务内删除被替代 finding 的证明记录（`SUPERSEDED` 不携带任何关闭字段，也不得残留证明）。
- **证据 blob 绑定**（0.1.1）：当 `LoopRunStore` 绑定了 `LoopArtifactStore` 时，resolution 与风险接受证据的 ref/digest 必须指向物理存在且 digest 匹配的 blob——写入时缺失/不匹配即 `ILLEGAL_TRANSITION`，读回时缺失/损坏即 `STORE_CORRUPT`；"伪造但格式正确的 digest" 因此 fail-closed。未绑定 artifact store 时 blob 校验不适用（与 WP2 既有语义一致），关闭事实仍由证明记录与 finding 行的双向字段一致性锚定。
- `supersedeFinding`：同 run 追加替代 finding 时把旧 finding 置 `SUPERSEDED` 并回填 `supersededBy`；旧 finding 必须非 `SUPERSEDED`。
- 不得因再次调用 Agent 自动关闭 finding（不变量 8）；所有关闭/接受路径都要求显式证据字段与 durable 证明记录，缺证据或缺证明 fail-closed。

## 6. PASS_WITH_RISK 消费与阻塞规则

- 固定推导规则 `computeFindingGate(runId)`（只读，供恢复/入口/Re-Gate 编排消费）：
  - 存在 status = `OPEN` 的 finding → `BLOCKED`（无论 severity）；
  - 存在 `OPEN` 已被关闭但 `earliestAffectedNodeId` 或下游节点 current 仍为 STALE / 缺失 → `BLOCKED`（关闭 finding 但未重新 Gate 仍不能继续）；
  - `ACCEPTED_RISK` 只有在风险接受带有 durable 证明记录且证据仍绑定当前事实时才可被 PASS_WITH_RISK 消费（读回已重验证明与证据 blob，伪造的接受根本到不了推导层）；`CRITICAL` 与未接受的 `HIGH` 永远阻塞；
  - 全部 finding 处于 `RESOLVED` / 可消费的 `ACCEPTED_RISK` / `SUPERSEDED` 且下游 current 均为 ACTIVE → `ELIGIBLE`。
- 推导是纯函数式的只读计算，不持久化、不产生第二份权威；与 C01 事件级 `nextStepEligibility` 的关系（事件追加时的静态语义）不在本合同改动范围。

## 7. 持久化与并发语义

- `appendFinding` 精确重放幂等：同 `findingId` 且 canonical 形式完全一致 → 返回既有记录（`appended: false`）；同 id 不同内容 → `EVENT_ID_CONFLICT`；同 `(runId, sequence)` 被占用 → `EVENT_SEQUENCE_CONFLICT`。
- 写入守卫与 WP1/WP2 对齐：terminal run、活动 stage、活动 capability execution 期间拒绝追加（`ILLEGAL_TRANSITION`）；`requirementId` 与已验证 run identity 不一致 → `INVALID_INPUT`。
- 失效传播中的并发败者：STALE 标记的 guarded UPDATE 命中 0 行（并发已改状态）→ `STORE_CORRUPT`；`SQLITE_BUSY/LOCKED` → `STORE_BUSY`。
- 状态迁移（resolve/accept/supersede）同样是 guarded UPDATE + hash 重算 + 同事务失效/证据校验。

## 8. 读回交叉绑定

- `listFindings(runId)` / `listFindingInvalidations(runId)`：逐条 schema + canonical hash 重算 + `requirementId` 与已验证 run identity 交叉绑定 + 链校验（sequence 连续、状态机边合法、失效边与当前链一致），任一失败 `STORE_CORRUPT`。
- **失效范围完整性**（0.1.1）：逐 finding 校验 `loop_finding_scopes` 记录存在、canonical hash 一致，并用存活失效边重算 digest 与计数比对——首/中/末/全部边被删除、scope 记录缺失或被篡改均 `STORE_CORRUPT`。
- **关闭证明重验**（0.1.1）：每个 `RESOLVED` / `ACCEPTED_RISK` finding 必须恰好携带一条 `loop_finding_proofs` 记录且 canonical hash 一致；证明字段必须与 finding 行的关闭字段逐一相等；RESOLUTION 证明必须重新绑定到已验证 revision 链（revision 存在、节点一致、artifact ref/digest 与迁移时刻捕获的不可变内容绑定一致）；`OPEN` / `SUPERSEDED` finding 携带证明即 `STORE_CORRUPT`；绑定 artifact store 时证据 blob 必须物理存在且 digest 匹配。
- 与 WP1/WP2 相同：公开读路径在**同一事务**内完成快照验证与明细读取；内部读取器接收快照验证产出的已验证 `requirementId`，不再自查 `loop_runs.requirement_id` 列。
- finding 链校验挂入既有 `verifySnapshotInTransaction`（corruption-first），与 capability execution 链、change 链、revision 链并列。

## 9. 存储与迁移

- run journal 格式版本前进到 **v5**：新增 `loop_findings` 主表（`UNIQUE(run_id, sequence)`、外键 CASCADE、run_id 索引）、`loop_finding_invalidations` 子表（`PRIMARY KEY (finding_id, invalidation_index)`，外键 CASCADE）、`loop_finding_proofs` 证明表（`finding_id` 主键，`proof_kind` CHECK 约束，外键 CASCADE）与 `loop_finding_scopes` 失效范围表（`finding_id` 主键，外键 CASCADE）。v5 的四表定义在 0.1.1 定稿——0.1.0 的 v5 从未进入任何 Accepted 基线，不存在需要回填的 v5 journal。
- v4→v5 与既有 v0→v4 迁移在同一事务内完成；失败全部回滚、可幂等重试；未知版本、v5 标记缺表、schema/约束/外键漂移均 fail-closed（`STORE_CORRUPT`）。
- C01、C02-WP1、C02-WP2 既有事件与历史一律不重写。

## 10. 明确排除（不在本合同范围）

- 实际执行 Re-Gate 节点、最早节点路由编排、generation 推进权威（C02-WP4）；
- 恢复上下文扩展与生产入口接线（C02-WP5）；
- 完成合同验收守卫矩阵（C02-WP6）；
- 业务实现、真实 Agent 调用、任何 Git/PR/发布副作用。

## Revision Record

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 0.1.0 | 2026-08-21 | Draft | C02-WP3 交付：finding record schema、固定状态机、五类路由矩阵、依赖图失效传播（同事务原子化）、PASS_WITH_RISK 消费规则、v4→v5 迁移与读回交叉绑定合同。 |
| 0.1.1 | 2026-08-21 | Draft | Round 1 复审修正（H1/H2）：durable 关闭证明表 `loop_finding_proofs`（RESOLUTION 捕获 revision 不可变内容绑定、RISK_ACCEPTANCE 捕获接受者与证据、supersede 同事务删除、读回全量重验）、绑定 artifact store 时关闭证据 blob 物理存在性校验、append-time 完整失效范围表 `loop_finding_scopes`（含空集语义）与读回全集合比对。 |
