# G5-T1 投影语义冻结稿：journal / finding store → manifest.md 投影协议实例化

> Version: 1.6.0（R6 评审 R6-H2 六子项协议补全版；SEMANTICS_FREEZE 候选——Current User / 复审确认后冻结为 G5-T2 编码依据）
> Date: 2026-09-09
> v1.5.0 → v1.6.0: 按 [G5-T1-REVIEW-R6](/tmp/g5-t1-review-r6/.review-tmp/G5-T1-REVIEW-R6.md) R6-H2 六子项全量修订——(1) 版本边界：`projection_provenance` 缺失/存在/损坏三态互斥规则落库（旧格式入口/已接管新格式/有键损坏三种入口互斥识别，接管后丢键不再回退旧格式）；(2) 持久承接格式补全 per-row 来源标记（`source: manual|runtime`）、承接基线锚点（`takeover_cursor`）、独立 revision 对应（`logical_identity_map.revision_dimension`）；(3) mapped 行后继：承接行 OPEN→RESOLVED/ACCEPTED 的权威切换与去重规则落库；(4) 跨面身份：finding_id/source_revision/evidence_ref 按 digest 链 + (node, producerExecutionId, revision sequence) 三元组建对应（同 digest 不同轮次/节点不再合并）；(5) 轨迹比较输入：双角色 binding/eligibility/reroute 从 journal 取证的比较域落库；(6) 持久重入：进程重启后从 `projection_provenance.mode` + `takeover_cursor` 确定基线并全量重放的步骤落库。
> v1.4.0 → v1.5.0: R5-H1 formal failed 裁决槽保持（J:519–526 failed 无 Gate/decision 字段，不映射为 FAIL 裁决）；R5-H2 `projection_provenance` 键缺失不判损坏（版本适配方向，本轮补全实施细节）。
> v1.3.0 → v1.4.0: R4-H1 终态表 formal failed 合法化 + 前缀三槽位全覆盖；R4-H2 前缀 rehash 四变体 CLOSE。
> v1.2.0 → v1.3.0: R3-H1 Gate 三字段裁决槽、R3-H2 前缀时点归约、R3-H4 parity 方向。
> v1.1.0 → v1.2.0: R2-H2 fold 全函数 + D-9 前置、R2-H3 时点方向、R2-H5 集合顺序。
> v1.0.0 → v1.1.0: R1-H1..H7。
> Parent: [G5 剩余计划](decision-090-g5-remaining-plan.md) v1.1.0 @ `0f8c964`（G5-T1）· Decision-090 §4/G5
> 唯一权威: [manual-runtime-semantic-contract](../../ai-sdlc/manual-runtime-semantic-contract.md) v1.0.0 §6.2（协议）、§6.2.2（三级有序判别）、§6.2.3（追平发布）、§6.2.4（投影字段映射）、§6.2.5/§6.2.6（repair）、§6.2.7（BLOCKED_AMBIGUOUS）、§7.2（失败码）
> 载体裁决: Current User 2026-09-09——TS 原生实现，以真实手动发布器产物做逐场景 parity 锁定
> 本文地位: 把合同 §6.2 抽象协议实例化到 runtime 具体数据模型。凡与合同冲突，以合同为准并回改本文。

## 1. 数据对象与输入输出

### 1.1 输入

| 对象 | 权威 | 关键字段（实际字段名全列） |
| --- | --- | --- |
| capability journal | `loop_capability_executions`（**不是** `loop_events`） | `sequence`（run 内单调）、`executionEventId`、`runId`、`capability`（=nodeId）、`executionRole`（primary/adversarial_scan/formal_verdict）、`attempt`、`status`（仅 started/succeeded/failed/blocked）、`createdAt`、`inputArtifactRef/Version/Digest`、`outputArtifactRef/Version/Digest`、`gateResult`、`unresolvedFindingsRef/Digest`、`consumedFindingsRef/Digest`、`decisionDepth/decisionStatus/decisionScopeId`、`nextStepEligibility`、`errorCode/retryable/reasonCode` 等 |
| finding store | `loop_findings`（24 列）+ proof `LoopFindingProof`（11 字段） | `finding_id/sequence/source_capability/source_revision_id/cause_kind/severity/category/evidence_ref/evidence_digest/earliest_affected_node_id/status/resolved_by_revision_id/resolution_evidence_ref/resolution_evidence_digest/risk_accepted_by/risk_acceptance_evidence_ref/risk_acceptance_evidence_digest/risk_accepted_scope_id/superseded_by/created_at/canonical_sha256` |
| finding invalidation 边 | 四字段 `findingId/invalidationIndex/revisionId/nodeId`，**无时点字段**（R3 实证） | 失效时点由 finding 来源 terminal 事件序推导（接线约束 A，D-10） |
| artifact store / revisions | blob + `loop_artifact_revisions` | revision：`revisionId/nodeId/sequence/stablePath/semver/artifactRef/digest/producerExecutionId/producerExecutionRole/gateResult/validity/supersededBy/createdAt` |
| finding 独立登记 | 公开 `appendFinding`（独立序列，不推进 capability journal） | 两条现役登记路径之一（D-10 适用域约束） |
| recovery 状态 | `recovery.pendingRevisionMaterialization` | 投影调用前置（D-9） |
| manifest.md | `library/{id}/manifest.md` | 手动/接管产物（§2 冻结格式） |

### 1.2 输出与不变量

`library/{id}/manifest.md`；失败码 `MANIFEST_CORRUPT_STOP` / `JOURNAL_MANIFEST_MISMATCH_STOP`；合法待投影 → 幂等追平；无 manifest 存量目录 → `BLOCKED_AMBIGUOUS`。
不变量：intake.manifest.json 零触碰；finding 状态迁移不触碰 entries 产物绑定字段；同输入重放逐字节同一 manifest。

## 2. manifest 文档格式（冻结）

### 2.1 顶层键全集

```yaml
schema_version: '1.0'
requirement_id: <id>
title: <str>
publish_seq: <int>
projected_through: <int|MANUAL>
updated_at: <ISO-8601 引号字符串>
depth: {decision_scope, requested_depth, initial_depth_basis, required_depth}
entries:
finding_index:
declaration_log:
corrections:
projection_provenance:          # §3 详述；null = 无接管
  mode: manual-takeover-A|manual-takeover-B|null
  accepted_at: <ISO-8601|null>
  takeover_cursor: <int|null>   # 接管时的 journal 末序号（B 模式非 null；A 模式固定 0）
  logical_identity_map:         # 持久逻辑身份映射表（§7.2）
  - runtime_finding_id: <durable id>
    manual_finding_id: <manual id>
    source_capability: <node>
    source_revision_runtime: <revision id>
    source_revision_manual: <版本标签>
    evidence_digest_runtime: <sha256>
    evidence_digest_manual: <digest 或引用>
repair_records: []
manifest_digest: 'sha256:<hex>'
```

### 2.2 entries 行 schema

| 字段 | 槽位 | 合法值 |
| --- | --- | --- |
| `node` | — | 七节点 |
| `status` | 产物生命周期 | pending / current / stale |
| `artifact_path` | 产物绑定 | 相对路径（H6 转换表语义键） |
| `version` | 产物绑定 | semver |
| `digest` | 产物绑定 | 64 hex |
| `updated_at` | 产物绑定 | ISO-8601 |
| `source_event_ref` | 产物绑定来源 | runtime=executionEventId；手动=上游产物路径；init=null |
| `gate_result` / `decision_depth` / `decision_status` | 当前裁决（仅 solution-gate） | 见 §3.3 |
| `execution` | 执行事实（仅 runtime 面） | 见 §3.2 注 |

### 2.3 finding_index 行 schema（11 字段）

见 §3.4 映射表。

## 3. 投影映射表

### 3.1 head 进度（保持）

| 字段 | runtime 规则 |
| --- | --- |
| `projected_through` | = 已处理最后 capability 事件 sequence（`loop_capability_executions` 域）。finding-only 不推进。 |
| `publish_seq` | = `projected_through`。finding-only 不动。 |
| 超前/失效游标 | > 实际最大 sequence 或无对应事件 → STOP。 |
| MANUAL 接管 | 见 §8。 |

### 3.2 entries：逐事件 fold 全函数（保持）

**前置（D-9）**：`recovery.pendingRevisionMaterialization` 为 null。

**fold 初始态**：
- 全新 requirement：init pending 行；
- 接管 A 承接后：承接基线行（手动形态保留，cursor=0）；
- 接管 B 承接后：对账通过后的行，cursor = 末序号。

**三槽位**：产物绑定 / 当前裁决事实（仅 solution-gate）/ 执行事实（D-8）。

逐事件规则：见 §3.2 既有表（R4-H1 修正后形态保持；R5-H1 修正后 failed 裁决槽不动）。批次无关（fold 结合律）。

### 3.3 depth 块（H4 CLOSED，保持）

见 §3.3 既有表（CONFIRMED 保留 / ESCALATED 升档 / UNKNOWN 保留 + null）。

### 3.4 finding_index 行映射（11 字段，保持）

见 §3.4 既有表（11 字段，D-1/D-2/D-3 保持）。

## 4. 三级有序判别（R6-H2 修正：版本边界 + 前缀三槽位 + 集合完整性）

### 4.1 第 1 级 损坏 → `MANIFEST_CORRUPT_STOP`

YAML 解析失败；self-digest 校验失败（D-5）。不静默修复、不重建。

**`projection_provenance` 三态识别（R6-H2 子项 1 修正）**：

该键存在且值合法 → 已接管新格式，正常进入后续步骤。该键存在但 mode 非法 / logical_identity_map 行结构错误 → 损坏。该键**不存在** → **旧格式**（接管前），投影器触发接管对账（§8），**不走后续三级判别**。三条路径互斥。

**接管后丢键（版本降级反例的闭合）**：接管 A/B 完成后写入的 `projection_provenance` 进入 self-digest 覆盖。若该键被删并重算摘要，self-digest 仍有效，但 `projected_through` 为数值且无 `projection_provenance` → **不识别为旧格式**（旧格式 `projected_through` = `MANUAL` 字符串），而是 `JOURNAL_MANIFEST_MISMATCH_STOP`（数值游标 + 缺接管锚点 = 接管状态被篡改）。

### 4.2 第 2 级 真分叉 → `JOURNAL_MANIFEST_MISMATCH_STOP`

**仅适用于已接管新格式（`projection_provenance` 存在且合法）。** 旧格式走 §8 接管对账。

### 4.2(a) 前缀完整校验——三槽位全覆盖

对 `sequence ≤ projected_through` 的已投影前缀，重推导每节点三槽位并与 manifest 逐字段比对。规则与字段同 v1.4.0 §4.2(a)（R4-H2 CLOSED 保持），此处不重复。

### 4.2(b) findingIndex 集合完整性与逐行交叉验证

同 v1.4.0 §4.2(b)（R2-H5 CLOSED 保持），集合差判别 → 共有行三步 → 新登记差量。

### 4.3 第 3 级 待投影 → 幂等追平

同 v1.4.0 §4.3。

## 5. 发布、repair 与失败出口

同 v1.4.0 §5。

## 6. 边界决策记录

同 v1.4.0 §6，追加：

| # | 决策 | 依据/状态 |
| --- | --- | --- |
| D-11 | MANUAL 接管持久承接记录（projection_provenance 键） | R4 落库；R5/R6 认可方向 |
| D-12 | 逻辑版本映射（logical_identity_map.revision_dimension） | R4 落库方向；R5/R6 认可 |
| D-13 | digest 链消歧（node, producerExecutionId, revision sequence 三元组） | R4 落库方向；R5/R6 认可 |
| D-14 | finding 一一对应（Ledger 行→登记→store 链） | R4 落库方向；R5/R6 认可 |
| D-15 | **接管状态互斥三态**：有 provenance 键（已接管）→ 正常判别；无键 + projected_through=MANUAL → 旧格式触发接管；无键 + projected_through=数值 → 接管状态被篡改 STOP（不回退旧格式） | R6-H2 子项 1 修正 |
| D-16 | **per-row 来源标记**：projection_provenance.logical_identity_map 逐行含 `source: manual\|runtime` 字段，区分承接行与 runtime 新增行；混合权威期校验按此字段分域 | R6-H2 子项 2 修正 |
| D-17 | **mapped 行权威切换**：接管对账后，mapped 行（逻辑身份映射表中已有对应的行）从 OPEN 迁移到 RESOLVED/ACCEPTED 时按 §6.2.3 更新 findingIndex 同一行（不按集合差 STOP），权威从手动切换到 runtime；迁移后重放 no-op | R6-H2 子项 3/6 修正 |
| D-18 | **finding 一一对应的非 scan 来源**：非 scan 来源 finding 不走 Ledger 链，按 store `source_capability` + `sequence` 定位（与 gateway 原子注册共享 store sequence 域）；不因无 scan Ledger 而 STOP | R6-H2 子项 3 补充 |

## 7. parity 归一化协议

同 v1.4.0 §7，补充：

### 7.1 补充：轨迹比较域（R6-H2 子项 5 落库）

| 轨迹维度 | runtime 来源 | 比较规则 |
| --- | --- | --- |
| 双角色 binding 分离 | journal `bindingId/bindingVersion`（adversarial_scan ≠ formal_verdict） | 两 binding 不同 → parity 断言通过；相同 → FAIL |
| depth 档位 | journal `decisionDepth` | 与 manifest `depth.required_depth` 比较 |
| eligibility | journal `nextStepEligibility` | 与 manifest `entries[].status` 联合核验 |
| reroute | finding `earliest_affected_node_id` | 与 manifest findingIndex 行 `earliest_affected_node_id` 比较 |
| eligibility/reroute 轨迹证据 | journal 取证 | 不要求 manifest 承载 |

### 7.2 补充：逻辑版本映射（D-12 落库）

接管/对账时建立 runtime `attempt.N.0.0` ↔ 手动 semver 的映射并持久保存于 `projection_provenance.logical_identity_map.revision_dimension`。parity 时 version 比较走映射，不走字面。

## 8. MANUAL 接管完整状态机（保持）

同 v1.4.0 §8（A/B 步骤 + 混合权威期 + 重入），追加：接管 A/B 完成后，`projection_provenance` 键写入 manifest 并进入 self-digest 覆盖范围——后续投影按新格式执行（含 §4.1 版本边界校验）。

## 9. 验收映射

同 v1.4.0 §9，追加：接管后丢键 rehash → STOP（版本降级反例）；mapped 行 OPEN→RESOLVED/ACCEPTED 权威切换；进程重启后从承接基线全量重放。

## 10. 非阻塞建议吸收记录

同 v1.4.0 §10。
