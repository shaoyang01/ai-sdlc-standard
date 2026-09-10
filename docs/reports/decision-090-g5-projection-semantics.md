# G5-T1 投影语义冻结稿：journal / finding store → manifest.md 投影协议实例化

> Version: 1.7.0（R7 评审 R7-H1/R7-H2 修正版；SEMANTICS_FREEZE 候选——Current User / 复审确认后冻结为 G5-T2 编码依据）
> Date: 2026-09-09
> v1.6.0 → v1.7.0: 按 [G5-T1-REVIEW-R7](/tmp/g5-t1-review-r7/.review-tmp/G5-T1-REVIEW-R7.md) 修订——(1) R7-H1 持久容器：`logical_identity_map` 由单数组改为**对象三分区** `findings/revisions/closures`（数组无法承载独立 revision 对应的矛盾消除，D-19）；(2) R7-H1 未配对行：`manual_id/runtime_id` 允许 null（至少一侧非空），W2 类真实承接行逐行登记为 `source: manual` 未配对行，A/B 初始化填充义务落库（D-20）；(3) R7-H1 承接基线与重入：`baseline.manifest_digest_at_takeover` 时点锚 + §8.5 六步重放函数（承接状态持久于 manifest/provenance 自证覆盖内，重建 = 读当前文件 + cursor 后 tail，无需独立快照，D-19）；(4) R7-H1 RESOLVED 跨面：废止 `closure_bound_revision_id` 字面比较，改为 `map.closures` 解析函数（零解/多解 STOP），`impl-fixed` 哨兵语义落库（D-21）；(5) R7-H1 非 scan 定位：双向 locator（manual {artifact_path, index} ↔ runtime {source_capability, producer_execution_id, store_sequence}）+ 唯一性不变量（D-22）；(6) R7-H1 谓词/时点：eligibility 四条件谓词落库，时间域统一为事件时点（D-23）；(7) R7-H2 depth parity：拆为「裁决档位断言」与「要求档位断言」双断言，decisionDepth 与 required_depth 不再作同维比较，12 合法场景反例（CONFIRMED 降持 / UNKNOWN null）消除（D-24）；(8) S1：v1.6.0 删减的全部表格按 v1.5.0 基线恢复，正文自含、废止"同 v1.4.0"自指。
> v1.5.0 → v1.6.0: 按 [G5-T1-REVIEW-R6](/tmp/g5-t1-review-r6/.review-tmp/G5-T1-REVIEW-R6.md) R6-H2 六子项修订——版本边界三态互斥（D-15）、per-row 来源标记（D-16）、mapped 行权威切换（D-17）、非 scan 不强求 Ledger（D-18）。
> v1.4.0 → v1.5.0: R5-H1 formal failed 裁决槽保持；R5-H2 `projection_provenance` 键缺失不判损坏。
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
projection_provenance:            # §8.0 冻结 schema；键不存在 = 接管前旧格式（§4.1 三态）
  schema: 'g5-projection-provenance/1'
  mode: manual-takeover-A|manual-takeover-B
  accepted_at: <ISO-8601>
  takeover_cursor: <int>          # 接管时 journal 末序号；A=0；B=末序号
  baseline:
    manifest_digest_at_takeover: 'sha256:<hex>'   # 接管完成时 manifest self-digest（时点锚）
  logical_identity_map:           # 对象三分区（D-19）；行形态与不变量见 §7.2/§8.0
    findings:                     # finding 身份对应行
    - manual_id: <str|null>       # 未配对 runtime 行为 null
      runtime_id: <durable id|null>
      source: manual|runtime
      first_seen:
        manual_locator: {artifact_path, finding_index} | null
        runtime_locator: {source_capability, producer_execution_id, store_sequence} | null
    revisions:                    # 来源修订对应行（kind=discovery；D-12 落库）
    - kind: discovery
      manual_ref: <版本标签|impl-fixed|null>
      runtime_revision_id: <durable id|null>
    closures:                     # RESOLVED 修复依据对应行（D-21 落库）
    - manual_ref: <修复依据标签|impl-fixed|null>
      runtime_revision_id: <durable id|null>
      resolution_evidence_digest: <sha256>
repair_records: []
manifest_digest: 'sha256:<hex>'
```

`projection_provenance` 进入 self-digest 覆盖范围（D-11）：键写入后随整文件 canonical 序列化参与 `manifest_digest`，其完整性由整文件自证保护，不另设对象级第二摘要。

### 2.2 entries 行 schema

| 字段 | 槽位 | 合法值 |
| --- | --- | --- |
| `node` | — | 七节点 |
| `status` | 产物生命周期 | pending / current / stale |
| `artifact_path` | 产物绑定 | 相对路径（H6 转换表语义键） |
| `version` | 产物绑定 | semver |
| `digest` | 产物绑定 | 64 hex |
| `updated_at` | 产物绑定 | ISO-8601；**事件时点域**（D-23） |
| `source_event_ref` | 产物绑定来源 | runtime=executionEventId；手动=上游产物路径；init=null |
| `gate_result` / `decision_depth` / `decision_status` | 当前裁决（仅 solution-gate） | 见 §3.3 |
| `execution` | 执行事实（仅 runtime 面） | 见 §3.2 注 |

### 2.3 finding_index 行 schema（11 字段）

见 §3.4 映射表。

## 3. 投影映射表

### 3.1 head 进度（保持）

| 字段 | runtime 规则 |
| --- | --- |
| `projected_through` | **= 已处理的最后 capability 事件 `sequence`**（消费域 = `loop_capability_executions`，同 run 绑定）。finding-only 差量发布不推进。 |
| `publish_seq` | **= `projected_through`**（同域同步）。finding-only 差量发布两者均不动。 |
| 超前/失效游标 | `projected_through` > 该 run 实际最大 capability 事件 `sequence`，或游标处无对应事件 → `JOURNAL_MANIFEST_MISMATCH_STOP`。 |
| MANUAL 接管基线 | 见 §8（完整步骤与状态机）。 |

### 3.2 entries：逐事件 fold 全函数（H2 修正，保持；R4-H1 终态表修正）

**前置条件（D-9）**：投影调用前，`recovery.pendingRevisionMaterialization` 必须为 null。pending 非空时投影器不发布，返回暂缓。

**fold 初始态**：
- 全新 requirement：该节点 init 行（pending + 五 null）；
- MANUAL 接管 A 承接后：承接基线行（手动形态，`source_event_ref` 保留手动值，cursor 从 0 起）；
- MANUAL 接管 B 承接后：对账通过后的行（含逻辑身份映射），cursor = B3 步骤记录的 journal 末序号。

**fold 全函数**：对每节点，取其 capability 事件按 `sequence` 升序的**终态**子序列，从上述初始态出发逐事件归约，维护三个槽位：

- **产物绑定槽**（`status/artifact_path/version/digest/updated_at/source_event_ref`）：仅由产生 revision 的 succeeded 终态更新；
- **当前裁决事实槽**（仅 solution-gate 行：`gate_result/decision_depth/decision_status`）：由**每个 formal_verdict succeeded 事件无条件更新**（不论是否物化 revision，R3-H1 修正保持）；
- **执行事实槽**（`execution` 对象，D-8）：由**每个终态事件**更新。

逐事件规则（角色 × status 全组合；现役 validator 合法组合，R4 复审九组合实测）：

| 事件 | 产物绑定槽 | 当前裁决事实槽（仅 solution-gate） | 执行事实槽 |
| --- | --- | --- | --- |
| 任何角色 succeeded，revision 已物化 | status ← revision validity（current/stale）；产物四字段 ← revision；source_event_ref ← executionEventId | formal_verdict：三扩展字段 ← 事件 | `{status: succeeded, execution_event_ref}` |
| formal_verdict succeeded (FAIL / BLOCKED_UNKNOWN)，不物化 revision | **保持不变**（含 pending 初值） | **三扩展字段 ← 事件**：`gate_result = FAIL`；`decision_status ← decisionStatus`；`decision_depth ← decisionDepth`（FAIL+CONFIRMED/ESCALATED 时为事件携带的非 null 档位；**仅 UNKNOWN 时为 null**——R4-H1 修正） | `{status: succeeded, execution_event_ref}` |
| adversarial_scan succeeded / blocked | **保持不变**（Ledger 不入 entries，不冒充正式 Gate） | **保持不变** | `{status: <st>, ledger_ref ← unresolvedFindingsRef, ledger_digest ← unresolvedFindingsDigest, blocked_report_ref ← outputArtifactRef, blocked_report_digest ← outputDigest, execution_event_ref}`（scan blocked 双绑定：Ledger + blocked 报告，R3-H1 保持） |
| primary blocked | **保持不变** | — | `{status: blocked, blocked_report_ref ← outputArtifactRef, blocked_report_digest ← outputDigest, execution_event_ref}`（blocked 报告为 first-class 产物，J:496） |
| 任何角色 failed | **保持不变**（有 revision 时保留其绑定与当前裁决；无 revision 保持 pending；failed 无正式裁决输出 J:519–526，裁决槽不动——R5-H1 保持） | `{status: failed, error_code ← errorCode, reason_code ← reasonCode, execution_event_ref}` |
| formal_verdict blocked | 现役禁止（J:509–511） | — | 数据出现 = 损坏，走停止路径 |

批次无关性：fold 逐步确定性、槽位覆盖式更新，单批/分批/从基线全量 fold 结果相同（fold 结合律，R2 已验证，本轮保持）。

`entry.status` 合法值全程 = `pending | current | stale`；`execution.status` 合法值 = `succeeded | blocked | failed`。两枚举分离，不混用（C:174）。

solution-gate 行的 scan/verdict 双角色归约：adversarial_scan 事件只写执行事实槽（Ledger 绑定）；formal_verdict 的 PASS/PWR 事件更新产物槽与三扩展字段。执行事实槽保存最后一次终态的事实；scan 与 verdict 两角色的轨迹证据由 journal（bindingId/Version、executorAgent、gateResult）承载（§7 轨迹证据来源）。

**`updated_at` 写入口径（D-23 时间域统一）**：fold 对产物绑定槽写入 `updated_at` 时取**产出该 revision 的 producer 终态事件 `createdAt`（事件时点域）**；`loop_artifact_revisions.createdAt`（revision 时点域）用于 r_k 选择与 validity 归约，**不写入也不用于比对 `entries.updated_at`**。两域显式分离，消除 v1.5.0 前缀表（revision 时点）与 parity 表（事件时点）的继承口径差。

### 3.3 depth 块更新（H4 CLOSED，保持）

| verdict 结果 | `depth.required_depth` | entry `decision_depth`（当前裁决事实槽） |
| --- | --- | --- |
| CONFIRMED | **保留既有值**（无害降持/持守） | ← `decisionDepth`（可低于 required） |
| ESCALATED | ← `decisionDepth`（唯一升档更新来源） | ← `decisionDepth` |
| BLOCKED_UNKNOWN | **保留既有值** | **null**（合法；J:357–360） |

`depth.decision_scope`：由 requirement-intake 的 init/变更分类承接，不从 `decisionScopeId`（轮次身份 ID）猜测枚举。

### 3.4 finding_index 行映射（11 字段，保持）

| 字段 | 来源 | 说明 |
| --- | --- | --- |
| `finding_id` | `finding_id` | 身份 |
| `discovered_at` | `source_capability` | D1（语义=发现来源节点） |
| `root_cause_category` | `category` | |
| `earliest_affected_node_id` | `earliest_affected_node_id` | |
| `source_revision` | `source_revision_id` | |
| `evidence_ref` | `evidence_ref` | |
| `status` | `OPEN→OPEN`；`RESOLVED→RESOLVED`；`ACCEPTED_RISK→ACCEPTED`；`SUPERSEDED→SUPERSEDED`（D3） | 未知值 STOP |
| `closed_by` | RESOLVED: proof.**`resolvedByNodeId`**；ACCEPTED: `risk_accepted_by` | proof 字典勘误 S1 |
| `closure_evidence_ref` | RESOLVED: `resolution_evidence_ref`；ACCEPTED: `risk_acceptance_evidence_ref` | |
| `closure_evidence_digest` | RESOLVED: `resolution_evidence_digest`；ACCEPTED: `risk_acceptance_evidence_digest` | |
| `closure_bound_revision_id` | RESOLVED: `resolved_by_revision_id`；ACCEPTED: **null**（D-2，合同明文）；OPEN/SUPERSEDED: null | RESOLVED 的**跨面**比较走 D-21 解析函数（§7.4），不做跨面字面比较 |

## 4. 三级有序判别（R4-H2/R6-H2 修正：版本边界三态互斥 + 前缀三槽位 + 集合完整性；顺序固定互斥）

### 4.1 第 1 级 损坏 → `MANIFEST_CORRUPT_STOP`

YAML 解析失败；self-digest 校验失败（canonical 序列化 = 发布器 `YAML.dump` 行为的 TS 复刻，D-5，G3 fixtures 逐字节对拍锁定）。不静默修复、不重建。

**`projection_provenance` 三态识别（D-15，互斥）**：

1. **键不存在 + `projected_through` = `MANUAL` 字符串** → **接管前旧格式**：投影器触发接管对账（§8.1/§8.2），**不走后续三级判别**。真实旧格式判据 = `projected_through: MANUAL` + 无键（仅"缺键"不构成判据，数值游标缺键见第 3 态）。
2. **键不存在 + `projected_through` = 数值** → 接管状态被篡改（接管后丢键/降级）：即使重算摘要使 self-digest 有效，仍 `JOURNAL_MANIFEST_MISMATCH_STOP`，**不回退识别为旧格式**。
3. **键存在** → 已接管新格式：先校验 `schema` 字段 = `'g5-projection-provenance/1'` 且三分区结构合法（§8.0），失败 → `MANIFEST_CORRUPT_STOP`；通过 → 正常进入后续三级判别。

三态互斥，判定顺序固定；第 2 态优先于任何"缺键 = 旧格式"的一般化概括（本节取代一切将缺键单独作为旧格式判据的表述）。

### 4.2 第 2 级 真分叉 → `JOURNAL_MANIFEST_MISMATCH_STOP`

**仅适用于已接管新格式（态 3）或从未接管的纯 runtime manifest。** 旧格式（态 1）走 §8 接管对账。

**第 4.2(a) 前缀完整校验（R4-H2 修正：三槽位全覆盖）**——对 `sequence ≤ projected_through` 的已投影前缀，重推导每节点（每角色终态事件）的**三个槽位**并与 manifest 逐字段比对：

| 槽位 | 重推导规则（时点 C = projected_through） | 比对字段 |
| --- | --- | --- |
| 产物绑定槽 | 节点有效 revision = producer 事件序 ≤ C 的 revision 中 `revision.sequence` 最大者 r_k；r_k 状态：finding invalidation 边（时点 = finding 来源 terminal 事件序 ≤ C）指向 r_k → **stale**；否则 **current** | `artifact_path/version/digest`（← r_k；rehash 篡改任一字段即检出）；`updated_at`（**← 产出 r_k 的 producer 终态事件 `createdAt`，事件时点域，与 §3.2 fold 写入口径一致**——D-23）；`source_event_ref`（← r_k 的 producerExecutionId；rehash 篡改即检出） |
| 当前裁决事实槽（仅 solution-gate） | C 内最后 succeeded formal_verdict 事件的 gate_result/decision_depth/decision_status | gate_result/decision_depth/decision_status 三字段（rehash 篡改任一即检出） |
| 执行事实槽 | C 内最后终态事件的 status/error_code/reason_code/execution_event_ref/Ledger 绑定/blocked 报告绑定 | 全部字段（rehash 篡改任一即检出） |

- r_k 为空候选（该节点前缀内无事件且 init 为 pending）→ entry = init pending 形态；
- 任一字段不一致 → `JOURNAL_MANIFEST_MISMATCH_STOP`（真分叉/篡改，不得进入第 3 级）。

**接线约束 A 保持（D-10）**：公开 `appendFinding` 独立登记路径的失效时点在 capability 序列域不可还原——本前缀校验的 finding 失效时点仅认 gateway 绑定路径的 terminal 事件序；独立登记路径不在投影器适用域（显式声明，D-10）。

**第 4.2(b) findingIndex 集合完整性与逐行交叉验证（R2-H5 顺序保持 + R4-H3/R7 补充）**：

1. **集合建立与异常先行**：对 finding store 逐行建立身份集 `SI`（store 内重复 `finding_id` → 数据损坏，停止路径）；对 findingIndex 逐行建立身份集 `IM`（重复 → `MANIFEST_CORRUPT_STOP`）。
2. **集合差判别**：`IM − SI`（索引多出行，且无 SUPERSEDED/权威依据可循）→ `JOURNAL_MANIFEST_MISMATCH_STOP`；`SI − IM`（store 有索引无）→ **新登记差量**（第 3 级输入，见 §4.3）；`SI ∩ IM`（共有行）→ 逐行交叉验证。
3. **共有行三步有序互斥检查**（R2-H5 CLOSED 保持）：
   1. **身份字段**：`finding_id/discovered_at/root_cause_category/earliest_affected_node_id/source_revision/evidence_ref` 与 store 行逐字段一致，否则 STOP；
   2. **状态一致 → 投影字段整行交叉绑定**：status 一致时按 §3.4 生成期望行逐字段比对（RESOLVED 绑定复验者/证据/revision；ACCEPTED 绑定接受者/证据，`closure_bound_revision_id` 不参与），漂移 → STOP；
   3. **合法落后**：索引 OPEN、权威 RESOLVED/ACCEPTED_RISK、依据有效、除生命周期新增字段外无其他漂移 → 列入第 3 级追平；未知/反向/无依据 → STOP。

**`projection_provenance` 参与校验（D-16/D-19 域分离）**：已接管时，findingIndex 逐行经 `map.findings` 对应行判定域别——对应行 `source: manual` 且 `runtime_id: null`（未配对承接行）→ **手动自洽校验**（不套 runtime store 行）；对应行已配对（`runtime_id` 非空）或 `source: runtime` → **store 交叉绑定校验**（已知映射的同一行迁移按 D-17 权威切换规则，不按集合差 STOP）。未接管 → 全行按 store 交叉绑定校验。两域不得混判。

### 4.3 第 3 级 待投影 → 幂等追平

输入 = **journal 尾段**（`sequence > projected_through`）∪ **新登记行**（`SI − IM`：按 §3.4 映射生成行——OPEN 行直接插入；首投影前已 RESOLVED/ACCEPTED 的行按 §3.4 带完整生命周期字段插入；同时在 `map.findings` 登记对应行 `source: runtime`）∪ **合法落后迁移**（§4.2 第 3 步命中行）。三者无任何存在 → no-op 原样退出；任一存在 → 按 §6.2.3 发布：尾段更新 entries 与 `projected_through/publish_seq/updated_at`；新登记/迁移仅对齐 findingIndex（entries 产物绑定四不动）；混合输入合入同一次原子发布（V9）。

## 5. 发布、repair 与失败出口

发布 = canonical 序列化（D-5）→ self-digest 重算 → 原子 rename；崩溃后旧/新均自洽。repair 基线重建五步照 §6.2.6（runtime 面第 ③ 步 = projected_through 重设 journal 末 capability 事件序号）；`corrections`/`repair_records` 按发布器既有形态保留。失败出口 `MANIFEST_CORRUPT_STOP` / `JOURNAL_MANIFEST_MISMATCH_STOP` / `BLOCKED_AMBIGUOUS` 进 runtime 运行出口（§7.2）。

## 6. 边界决策记录

| # | 决策 | 依据/状态 |
| --- | --- | --- |
| D-1 | `discovered_at` = 发现来源节点（source_capability） | R1..R4 复审认可 |
| D-2 | ACCEPTED 行 `closure_bound_revision_id` runtime 面 null；parity 状态限定仅 ACCEPTED，RESOLVED 不豁免（v1.7.0 起 RESOLVED 跨面比较改走 D-21 解析函数） | R1..R4 认可；R7-H1 修正比较方式 |
| D-3 | finding_index 含 SUPERSEDED（runtime 全集） | R1..R4 复审认可 |
| D-4 | `declaration_log`/`publish_seq`/`projected_through` 不参与 parity 等价维度（面内进度） | R1..R4 复审认可 |
| D-5 | canonical YAML 序列化 = TS 复刻发布器 `YAML.dump` 行为，fixture 逐字节对拍锁定（版本/bytes 记录归 T5） | R1..R4 复审认可 |
| D-6 | task-planning/implementation SKILL checklist 措辞移除退役术语 | R2/R3/R4 复审认可 |
| D-7 | 路径三层关系与七节点转换表；canonical-vs-materialized 命名对齐为实施面调整 | R1-H6/R2/R3/R4 认可 |
| D-8 | `execution` 兼容承载对象（runtime 面专属） | R2/R3/R4 认可 |
| D-9 | 投影调用前置：`recovery.pendingRevisionMaterialization == null` | R2/R3/R4 认可 |
| D-10 | **接线约束 A**：`appendFinding` 独立登记路径失效时点不可还原；投影器适用域限定为 gateway 绑定 terminal 注册链 | R3-H2/R4 认可 |
| D-11 | **MANUAL 接管持久承接记录**：`projection_provenance` 顶层键进入 manifest self-digest 覆盖范围 | R4-H3 落库；R5/R6 认可 |
| D-12 | **逻辑版本对应**：runtime attempt 版本 ↔ 手动 semver 映射持久保存于 `map.revisions`（kind=discovery）；version 比较走映射 | R4 落库方向；v1.7.0 分区落库 |
| D-13 | **digest 链消歧**：同 digest 多 revision 按 (node, producerExecutionId, revision sequence) 三元组消歧；非唯一配对 → STOP | R4 落库方向；R5/R6 认可 |
| D-14 | **finding 一一对应链**（runtime 面内）：Ledger 行位置 → 登记声明顺序 → store sequence；缺失/多解 → STOP | R4 落库方向；R6 修正非 scan 不强求 Ledger |
| D-15 | **接管状态互斥三态**：有键（校验 schema/结构）→ 正常判别；无键 + `projected_through=MANUAL` → 旧格式触发接管；无键 + 数值游标 → 接管状态被篡改 STOP（不回退旧格式） | R6-H2 落库；R7-a CLOSED |
| D-16 | **per-row 来源标记**：`map.findings` 逐行 `source: manual\|runtime`；混合权威期校验按此分域 | R6-H2 落库；v1.7.0 纳入正式 schema（§8.0） |
| D-17 | **mapped 行权威切换**：已配对行 OPEN→RESOLVED/ACCEPTED 按 §6.2.3 更新同一行（不按集合差 STOP），权威手动→runtime；迁移后重放 no-op | R6-H2 落库；R7-c CLOSED（已知映射同一行操作） |
| D-18 | **非 scan 来源定位**：非 scan finding 不走 Ledger 链，按 store `source_capability` + `sequence` 定位；不因无 Ledger STOP | R6-H2 落库；R7-d 入口子项 CLOSED |
| D-19 | **provenance 容器三分区 + 承接基线**：`logical_identity_map` = 对象 `{findings, revisions, closures}`（单数组无法承载独立 revision 对应）；`baseline.manifest_digest_at_takeover` 记录接管时点锚；`schema: 'g5-projection-provenance/1'` 为已接管格式判定锚；承接状态持久于 manifest+provenance 自证覆盖内，重放按 §8.5（读当前 + tail），不要求独立快照 | R7-H1 容器矛盾/重入修正 |
| D-20 | **未配对行合法形态 + 初始化填充义务**：`findings` 行 `manual_id/runtime_id` 允许 null（**至少一侧非空**，双 null = 损坏）；A2/B3 接管时必须逐行登记承接面全部 finding（`source: manual`、对侧 null）与已存在 revision（`revisions` 分区）；禁止空 map 承接非空 findingIndex | R7-H1 W2 两行/零映射反例修正 |
| D-21 | **RESOLVED 闭包对应函数**：RESOLVED 跨面**废止** `closure_bound_revision_id` 字面比较；改经 `map.closures` 行解析——manual 值（版本标签或 `impl-fixed` 哨兵）唯一解析到 runtime durable revision ID，与 `resolved_by_revision_id` 相等 → PASS；零解/多解 → STOP；两面 `closure_evidence_digest` 仍字面相等（同一物理证据）。`impl-fixed` 哨兵语义 = 修复发生于同一实现批次（P 真实形态），对应行以 resolution 证据 digest 锚定 | R7-H1 RESOLVED 修正 |
| D-22 | **发现位置双向 locator**：`first_seen.manual_locator = {artifact_path, finding_index}`（发现产物内登记序）、`first_seen.runtime_locator = {source_capability, producer_execution_id, store_sequence}`；同一 locator 值至多出现在一行（唯一性不变量）；对应建立时任一侧无法唯一定位 → STOP | R7-H1 非 scan 跨面定位修正 |
| D-23 | **eligibility 谓词 + 时间域统一**：eligibility 比较按 §7.5 四条件谓词（两侧各自求值后比较结果）；时间域显式分离——事件时点域（`executionEventId` 事件 `createdAt`）用于 `entries.updated_at` 写入与前缀比对；revision 时点域（`revision.createdAt/sequence`）用于 r_k 选择与 validity 归约；两域不混用 | R7-H1 谓词/时点修正 |
| D-24 | **depth parity 双断言**：断言 D-a 裁决档位（同 scope/轮次，runtime `decisionStatus/decisionDepth` ↔ 手动 Gate `decision_status/decision_depth`，CONFIRMED/ESCALATED 档位相等、UNKNOWN null 合法）；断言 D-b 要求档位（`required_depth` 按 init+ESCALATED 归约独立复算相等）；合法关系 `decisionDepth ≤ required_depth`（CONFIRMED 降持），`decisionDepth > required_depth` → STOP；**废止** decisionDepth ↔ required_depth 同维直接比较 | R7-H2 修正 |

## 7. parity 归一化协议（R4-H3 补全；R7-H1/H2 修正落实）

**两种断言分离**：断言 A = runtime 面内同输入重放逐字节一致；断言 B = 同 fixture 手动轨迹与 runtime 轨迹的**语义等价**（跨面，按本表归一化后比较）。

### 7.1 比较域与归一化规则（逐维度完整表）

| 比较维度 | runtime 面输入 | 手动面输入 | 归一化比较规则 |
| --- | --- | --- | --- |
| `entries.node` | nodeId（=capability） | node | 字面相等 |
| `entries.artifact_path` | revision.stablePath 去 `library/{id}/` 前缀 | 手动相对路径（中文基名） | **语义键 = (目录段, capability)**（七节点转换表）；基名差异按 D-7 面间映射豁免字面比较，但每面各自要求路径上产物文件存在且 digest 匹配 |
| `entries.version` | revision semver（attempt.0.0） | 声明 semver（如 1.3.0/1.1.0） | **面内自洽**：面内单调即可；跨面字面不等为既定事实，经 `map.revisions`（D-12）映射后**不作字面比较** |
| `entries.digest` | outputDigest | 声明 digest | 字面比较（64 hex，跨面应相等——同一逻辑产物） |
| `entries.status` | revision validity 映射（current/stale；pending 为 init 态） | current/stale/pending | 字面比较 |
| `entries.updated_at` | producer 终态事件 `createdAt`（**事件时点域**，D-23） | 声明确认时刻 | 面内单调；跨面不比较（时钟不同）；**不与 revision 时点域混用** |
| `entries.source_event_ref` | executionEventId | 上游产物路径 | **面内字段，不跨面比较**；每面各自自洽 |
| solution-gate 三扩展 | gateResult/decisionDepth/decisionStatus | 同名 | 字面比较（断言 D-a 的面内形态；跨面断言见 §7.6 D-24） |
| `entries.execution` | runtime 专属 | 手动无 | 不跨面比较；runtime 面按 §3.2 自洽 |
| `depth.required_depth` | verdict 投影（§3.3 归约） | init/ESCALATED 更新 | **断言 D-b（D-24）**：按 §3.3 归约独立复算 == 各面值；不存在 runtime `decisionDepth` ↔ `required_depth` 的直接比较 |
| `depth` 其余三字段 | init/verdict 投影 | init | 逐字段字面比较（H4 12 组合对拍口径） |
| `finding_index` 11 字段 | store 行+proof（§3.4） | 手动声明行（P:451–459/503–508 形态） | 逐字段**语义对应**比较；`finding_id` 跨面按 `map.findings` 映射；`source_revision` 面内自洽 + 跨面经 `map.revisions` 解析（§7.4）；`evidence_ref` 面内绑定自洽 + 跨面同发现事实经 §7.4 locator 对应 |
| `finding_index.status` | OPEN/RESOLVED/ACCEPTED/SUPERSEDED | OPEN/RESOLVED/ACCEPTED | SUPERSEDED 仅 runtime（D-3）；共同合法轨迹（无 supersede）字面等价 |
| `closure_evidence_digest` | RESOLVED: `resolution_evidence_digest`；ACCEPTED: risk 证据 digest | 同名 | **字面比较**（同一物理证据；状态适用时强制） |
| `closure_bound_revision_id` | RESOLVED=`resolved_by_revision_id`；ACCEPTED=null（D-2） | RESOLVED=修复依据标签或 `impl-fixed`；ACCEPTED=PWR 裁决 revision | **状态限定**：ACCEPTED 保持 D-2 差异记录；**RESOLVED 跨面走 §7.4 解析函数（D-21），字面比较废止** |
| `publish_seq`/`projected_through`/`declaration_log` | runtime 进度 | 手动进度 | **不参与比较**（D-4） |
| self-digest | 每面独立：canonical YAML → sha256 | 同 | 各面独立断言；跨面 digest 不比较 |
| 双角色/eligibility/reroute 轨迹证据 | journal：bindingId/Version、executorAgent、gateResult、decision*、nextStepEligibility、earliest_affected_node 路由 | Gate Result 文件、方案修订版本、路由登记 | 轨迹断言从 journal 取证（两 binding 分离、depth 按 §7.6 双断言、eligibility 按 §7.5 谓词、earliest 节点字面），不要求 manifest 承载 |

### 7.2 逻辑身份对应与持久映射（D-19/D-20 落库）

`projection_provenance.logical_identity_map` 为**对象三分区**（不得为单数组——单数组无法承载无 finding 行的独立 revision 对应）：

**分区 1 `findings`（finding 身份对应行）**，每行：

```yaml
- manual_id: <str|null>          # 未配对 runtime 行为 null
  runtime_id: <durable id|null>  # 未配对手动行为 null
  source: manual|runtime         # 行最初登记来源（D-16）
  first_seen:
    manual_locator: {artifact_path: <str>, finding_index: <int>} | null
    runtime_locator: {source_capability: <node>, producer_execution_id: <str>, store_sequence: <int>} | null
```

**分区 2 `revisions`（来源修订对应行，D-12）**，每行：

```yaml
- kind: discovery
  manual_ref: <版本标签|impl-fixed|null>     # 手动面 source_revision 值；未配对 runtime 行为 null
  runtime_revision_id: <durable id|null>     # 未配对手动行为 null
```

**分区 3 `closures`（RESOLVED 修复依据对应行，D-21）**，每行：

```yaml
- manual_ref: <修复依据标签|impl-fixed|null>   # 手动面 closure_bound_revision_id 值；纯 runtime RESOLVED 为 null
  runtime_revision_id: <durable id|null>       # 纯手动 RESOLVED（runtime 未复跑）为 null
  resolution_evidence_digest: <sha256>          # 对应证据锚（与两面 closure_evidence_digest 相等）
```

**分区级不变量（违反任一 = `MANIFEST_CORRUPT_STOP`）**：
1. 每行**至少一侧 ID 非空**（双 null = 损坏行）；
2. `findings` 内 `manual_id` 非空值唯一、`runtime_id` 非空值唯一；`revisions` 内 `(kind, manual_ref)` 非空组合唯一；`closures` 内 `manual_ref` 非空值唯一；
3. `findings` 行 `source` 与登记方向一致：`source: manual` 行必须 `manual_id` 非空；`source: runtime` 行必须 `runtime_id` 非空；
4. D-22 唯一性：同一 `manual_locator` 值或同一 `runtime_locator` 值至多出现在一行 `findings`；
5. 三分区均为数组（可为空数组），分区键必须存在。

**runtime 面内定位链（D-14 保持）**：scan 来源 finding 按 Ledger 行位置 → 登记声明顺序 → store sequence 链定位；**非 scan 来源**按 D-18/D-22 的 `runtime_locator` 定位（不强求 Ledger）。链缺失/多解 → STOP。

**跨面配对建立（接管对账 / 追平时）**：逻辑同一发现的配对以 `evidence_digest` 相等 + `source_capability` 相等为必要条件；满足条件的候选唯一 → 登记配对行（补齐对侧 ID，行内更新、不增行）；候选多于一个 → STOP（不猜测配对）；手动产物无法给出 `manual_locator`（无登记序）→ 该行保持未配对（合法），其后续 runtime 化按 D-17。

### 7.3 parity 断言失败的处理

任何归一化后不等 → 映射表或投影器缺陷，按 §9 复审收敛；**不得**通过删除字段、泛化豁免或自制 normalizer 掩盖。

### 7.4 跨面解析函数（D-21/D-22 落库）

**RESOLVED 修复依据对应**（输入：手动面 `closure_bound_revision_id` = M，runtime 面 `resolved_by_revision_id` = R，两面 `closure_evidence_digest`）：

1. 两面 `closure_evidence_digest` 字面不等 → STOP（非同一物理证据）。
2. 在 `map.closures` 中查 `manual_ref = M` 的行：**零解** → 若 R 的 revision 可按规则 3 唯一定位且证据 digest 相等 → 登记 closures 行（追平）；否则 STOP。**多解** → STOP（不猜测）。
3. 解析规则：M = `impl-fixed` 哨兵 → 定位 = R 自身（对应行 `{manual_ref: 'impl-fixed', runtime_revision_id: R, resolution_evidence_digest}`；语义 = 修复发生于同一实现批次，P 真实形态）；M = 版本标签 → 先查 `map.revisions`（kind=discovery，`manual_ref = M`）取 `runtime_revision_id`；无 discovery 行时按 (stablePath 目录段, semver) 经 D-13 三元组定位唯一 revision。
4. 解析结果 == R 且证据 digest 与 closures 行一致 → PASS；不等 → STOP。
5. 纯手动 RESOLVED（runtime 无对应事件）：`closures` 行 `runtime_revision_id: null` 合法；该行按手动自洽校验（§4.2(b) 域别）。
6. D-2 不变：ACCEPTED 的 bound=null 差异仍为记录性差异，不走本函数。

**来源修订对应**（`source_revision` 跨面）：手动 M ↔ runtime S 经 `map.revisions`（kind=discovery）解析后相等 → PASS；零解/多解 → STOP；单面缺失对侧 → 未配对（合法，不得冒充相等）。

**发现位置对应**（D-22）：跨面配对行的 `first_seen` 双 locator 齐全时，runtime locator 必须唯一命中 store 行（`source_capability + store_sequence`），manual locator 必须唯一命中手动产物行；任一侧多解/零解（locator 齐全却无法命中）→ STOP。未配对行单侧 locator 合法。

### 7.5 eligibility 谓词（D-23 落库）

比较 scope = 同一 run、同一 capability（nodeId）、同一轮次（journal sequence 窗口）。

**runtime 面谓词**（全部满足 → ELIGIBLE）：
1. 该 capability 最新 formal succeeded 事件 `nextStepEligibility = 'ELIGIBLE'`；
2. 该节点 `entries[].status = 'current'`（产物 current）；
3. Gate 槽 `gate_result = 'PASS'`；
4. `earliest_affected_node_id` 命中该节点的 OPEN finding 数 = 0。

**手动面谓词**（全部满足 → ELIGIBLE）：`entries[].status = 'current'` ∧ `gate_result = 'PASS'` ∧ 手动 findingIndex 无命中该节点的 OPEN 行。

**parity 断言**：两面谓词求值结果相等。**禁止**把 manifest 产物 `status = current` 直接当作 ELIGIBLE（反例：BLOCKED 时产物可仍 current，谓词须为 false）。

**评估时点**：谓词在时点 C（前缀域）求值；条件 1/4 的事件与 finding 以 sequence ≤ C 为限（事件时点域）。

### 7.6 depth parity 双断言（D-24 落库；R7-H2 修正）

**废止**：journal `decisionDepth` 与 manifest `depth.required_depth` 的同维直接比较（R7 反例：12 合法场景中 6 项不相等——CONFIRMED 合法降持 3 项、BLOCKED_UNKNOWN null 3 项）。

**断言 D-a 裁决档位**：同 scope、同轮次，runtime `(decisionStatus, decisionDepth)` ↔ 手动 Gate `(decision_status, decision_depth)`：

| runtime decisionStatus | 断言 |
| --- | --- |
| CONFIRMED | 两面档位相等；且 `decisionDepth ≤ required_depth`（降持合法） |
| ESCALATED | 两面档位相等；且 `decisionDepth = required_depth`（升档后相等） |
| BLOCKED_UNKNOWN | `decisionDepth = null` ∧ 手动面无正式档位（pending）；`required_depth` 不变 |

`decisionDepth = null` 而状态非 UNKNOWN → STOP；`decisionDepth > required_depth` → STOP。

**断言 D-b 要求档位**：`manifest.depth.required_depth` 独立复算 = init(`initial_depth_basis`, `requested_depth`) 经时点 C 内 ESCALATED 事件按 §3.3 归约的结果。CONFIRMED 降持只动 `decision_depth` 不动 `required_depth`；UNKNOWN null 不覆盖 `required_depth`。复算不等 → STOP。

两断言独立求值、独立报告；D-a 漂移与 D-b 漂移分别可检（变异 Gate `decisionDepth` 与变异 manifest `required_depth` 必须分别变红）。

## 8. MANUAL 接管完整状态机（R4-H3 闭合 + R7-H1 重入落库）

### 8.0 `projection_provenance` 冻结 schema（D-19/D-20）

```yaml
schema: 'g5-projection-provenance/1'
mode: manual-takeover-A | manual-takeover-B
accepted_at: <ISO-8601>
takeover_cursor: <int>                          # A=0；B=接管时 journal 末序号
baseline:
  manifest_digest_at_takeover: 'sha256:<hex>'   # 接管完成那次发布的 manifest self-digest（时点锚）
logical_identity_map:                            # 对象三分区；形态/不变量见 §7.2
  findings: []
  revisions: []
  closures: []
```

结构校验（§4.1 态 3 入口）：`schema` 值精确匹配；`mode` 枚举合法；三分区键存在且为数组；分区级不变量（§7.2）逐条成立。任一失败 → `MANIFEST_CORRUPT_STOP`。

### 8.1 接管 A（journal 无 capability 事件）

| 步骤 | 操作 | 状态 |
| --- | --- | --- |
| A1 | 手动面自洽校验（self-digest + 一致性） | 通过 → 继续；失败 → STOP |
| A2 | `projected_through = 0`、`publish_seq = 0`；entries/finding_index/depth/corrections 原样承接；写入 `projection_provenance`（§8.0 全形态，`mode: manual-takeover-A`、`takeover_cursor: 0`）。**初始化填充义务（D-20，禁止空 map 承接非空 findingIndex）**：`map.findings` 逐行登记手动 findingIndex **每一行**（`manual_id` = 行 finding_id、`runtime_id: null`、`source: manual`、`first_seen.manual_locator` = 该行在手动发现产物中的 `{artifact_path, finding_index}`）；`map.revisions` 登记手动面非空 `source_revision` 的去重标签集合（`manual_ref`、`runtime_id: null`）；`map.closures` 登记手动面 RESOLVED 行的 `closure_bound_revision_id`（含 `impl-fixed` 哨兵原样登记）+ `resolution_evidence_digest`。findingIndex 为空 → 三分区可为空数组 | 承接完成 |
| A3 | 重入：首投影（新事件）→ 逐事件 fold（execution 键按 §3.2 出现）→ no-op 确认 | 稳定 |

**接管 A 后的校验适配**：`source: manual` 且未配对的行以手动自洽校验；已配对/runtime 新行以 store 交叉绑定校验；两域按 `map.findings` 行判定（§4.2(b)）。cursor=0 的前缀校验：前缀为空 → 无前缀校验（A2 零游标例外保持）。

### 8.2 接管 B（journal 有 capability 事件）

| 步骤 | 操作 | 状态 |
| --- | --- | --- |
| B1 | 手动面自洽校验 | 通过 → 继续；失败 → STOP |
| B2 | **全事件语义对账**：journal 全事件按 §3.2 推导期望 entries/finding_index，与现有手动形态做语义对账（比较域按 §7.1 归一化：路径按转换表语义键；finding 按 §7.2/§7.4 对应函数）——一致 → 承接；不一致 → `JOURNAL_MANIFEST_MISMATCH_STOP`（两执行面事实分叉，人工处置） | 对账完成 |
| B3 | 承接：`projected_through/publish_seq` = 末事件 sequence；`projection_provenance` 按 §8.0 写入（`mode: manual-takeover-B`、`takeover_cursor` = 末序号）；**初始化填充义务同 A2**（D-20：A2 登记内容 + 对账中已配对行补齐 `runtime_id`/`runtime_locator`、`map.revisions` 补 runtime durable ID、`map.closures` 补 runtime 侧解析）；`source_event_ref` 保留手动形态直至该行被后续尾段更新 | 承接完成 |
| B4 | 重入：首尾段投影 → 逐事件 fold → no-op 确认 | 稳定 |

接管 B 的对账函数即 §7.1 的归一化比较（方向反转：journal 推导 vs 手动现存），同一实现两用。

### 8.3 接管后的常规校验适配（保持）

- **前缀校验**：cursor = B3 末序号；前缀=已 fold 事件——校验按 fold 后状态与 manifest 逐字段比对（归一化规则同 §7.1）。rehash 篡改 → 归一化后不等 → STOP ✓。
- **findingIndex 校验**：未配对手动行手动自洽 + runtime 行交叉绑定；无该键 → 全行按 store 交叉绑定 ✓。
- **后续差量**：尾段投影（fold）更新对应节点行 → 前缀校验按 fold 后状态比对 → 差量追平 ✓。

### 8.4 混合权威期（保持）

接管后 findingIndex 校验为两域混合：未配对承接行（手动自洽）+ runtime 行（store 交叉绑定）；映射持久保存于 `projection_provenance.logical_identity_map` 三分区。重复/缺失/漂移 → STOP。cursor 推进只计新事件。

**mapped 行权威切换与后继（D-17 展开）**：`findings` 分区已配对行（双侧 ID 非空）从 OPEN 合法迁移到 RESOLVED/ACCEPTED 时：按 §6.2.3 更新 findingIndex **同一行**（不按集合差 STOP）；RESOLVED 迁移同时在 `map.closures` 追加对应行（`runtime_revision_id` = `resolved_by_revision_id`、`resolution_evidence_digest`；`manual_ref` 取该行既有手动绑定值或 null）；ACCEPTED 迁移按 D-2（bound=null）。迁移后重放 no-op。**未配对手动行**的 RESOLVED/ACCEPTED（runtime 未复跑）为合法手动侧迁移：更新该 findingIndex 行 + `map.closures` 登记手动侧（`runtime_revision_id: null`），不触发 store 交叉绑定。

### 8.5 承接基线与持久重入协议（D-19 落库；R7-H1 重入闭合）

**承接状态的持久化位置（不要求独立快照）**：
- 手动域内容（承接 entries 行、depth 块、findingIndex 手动行）持久于 **manifest 自身**，受 self-digest 保护；未被 runtime 权威覆盖的手动行在接管后保持原值；
- 跨面映射与未配对登记持久于 **`projection_provenance` 三分区**，同受 self-digest 保护（D-11）；
- `baseline.manifest_digest_at_takeover` 记录接管完成时点锚（审计用；不参与日常校验）。

**进程重启后的重放函数（唯一、确定；六步）**：

1. 读 manifest 文件；YAML 解析失败 → `MANIFEST_CORRUPT_STOP`。
2. self-digest 校验（canonical 序列化 rehash vs `manifest_digest`）→ 失败 → `MANIFEST_CORRUPT_STOP`。
3. provenance 三态识别（§4.1）：旧格式 → 转 §8.1/§8.2 接管；数值游标缺键 → STOP；已接管 → §8.0 结构校验，失败 → `MANIFEST_CORRUPT_STOP`。
4. **手动域恢复 = 直接读当前 manifest**：entries 中手动来源行（`source_event_ref` 为手动值/null 且未被 runtime 行覆盖者）、depth 块、findingIndex 中对应 `map.findings` 行 `source: manual` 的行——全部就地可读，**无需重演历史**。
5. journal 侧：`takeover_cursor` 之前的事件存在性与 digest 链校验（前缀域）；`sequence > takeover_cursor` 的事件**全量 fold**（§3.2，从步骤 4 状态出发）至 head。
6. 计算投影 → 与当前 manifest 逐字段比对 → **全量重放 = 增量 = no-op**；不等 → `JOURNAL_MANIFEST_MISMATCH_STOP`。

A 模式（cursor=0）：步骤 5 前缀为空、无 tail 事件，重放退化为纯校验（步骤 4 状态 == 当前 manifest → no-op）。B 模式：前缀校验 + tail fold。两模式共用同一函数。

## 9. 验收映射（G5-T5 引用；R4–R7 回归矩阵逐项对应）

见 R4 报告 §4 各阻塞"回归核验"清单 + R1/R2 报告 §3 矩阵 + 本版新增（R7-H1/H2 回归核验清单）：
- 真实 P/W/W2 × A/B × 有无 finding × 一致/分叉；无 finding 但多 revision（`map.revisions` 非空、`findings` 空数组合法）；
- 手动未配对行 → runtime 新增行 → 建立配对（行内更新、不增行）→ mapped OPEN→RESOLVED/ACCEPTED 权威切换 → 重放 no-op；
- 每项执行"首次接管 → 首 tail → 进程重启 → 全量重放（§8.5 六步）→ 再次 no-op"；映射字段存盘不丢（三分区 roundtrip）、四不动与单行唯一；
- wrong source / wrong evidence / wrong repair revision 分别 STOP；RESOLVED 正向对应通过、零解/多解 STOP；D-2 仅 ACCEPTED；
- depth：12 全组合 + LIGHT→ESCALATED DEEP→重建→CONFIRMED LIGHT 链；变异 Gate `decisionDepth` 与变异 manifest `required_depth` 分别变红（D-24 双断言独立可检）；多 scope、首轮无 verdict、formal failed 保留上一裁决；
- 回归保持：原版本降级反例（R6）、坏 source/map、超前游标、诚实 formal failed（R5-H1）、原四 rehash（R4-H2）不得回退。

## 10. 非阻塞建议吸收记录

S1（R7）继承引用规范化：v1.6.0 删减的全部表格按 v1.5.0（dcc2d5c）基线恢复，正文自含，废止"同 v1.4.0 §x"自指。S2（R7）：§4.1 三态与一般概括已同步（态 2 显式优先）；`schema` 字段落库为已接管格式判定锚；D-16 `source` 已入正式 schema（§7.2/§8.0）。S3（R7）："诚实发布→无尾段重入"与 rehash 负例成对断言保留于 §9；D-5 的 Ruby/Psych 版本、完整 bytes 及特殊标量记录归 T5 fixture（固定 `accepted_at` 局部模型不背书生产时钟）。历史：S1 字段字典勘误（v1.1.0）、S2 /tmp 路径审计引用、S4 D6 编号勘误——均保持。
