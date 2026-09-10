# G5-T1 投影语义冻结稿：journal / finding store → manifest.md 投影协议实例化

> Version: 1.4.0（R4 评审 R4-H1/H2/H3 修订版；SEMANTICS_FREEZE 候选——Current User / 复审确认后冻结为 G5-T2 编码依据）
> Date: 2026-09-09
> v1.3.0 → v1.4.0: 按 [G5-T1-REVIEW-R4](/tmp/g5-t1-review-r4/.review-tmp/G5-T1-REVIEW-R4.md) 修订——R4-H1 终态表移除 formal_verdict failed 错误禁令（failed 对所有合法角色更新执行事实并保留产物/裁决槽；blocked formal 禁令保持）；无 revision 的 FAIL 分支 `decision_depth` 按实际 `decisionStatus` 赋值（FAIL+CONFIRMED/ESCALATED 非 null，仅 UNKNOWN 为 null）；前缀校验覆盖全部三槽位（裁决事实与执行事实纳入逐字段比对，rehash 篡改不再逃逸）。R4-H3 六缺口闭合：parity 表补 depth 四字段/逻辑版本映射/双角色 binding/eligibility/reroute 轨迹来源；digest 链消歧补 (node, producerExecutionId, revision sequence) 三元组；finding 一一对应建立（Ledger 行位置→登记声明→store sequence 链，缺失/多解 STOP）；承接格式/来源标记/映射表以 manifest 顶层 `projection_provenance` 键进入冻结格式与 self-digest 覆盖；MANUAL 接管 A/B 完整状态机（含零游标承接与全量重放基准）落库。
> v1.2.0 → v1.3.0: R3-H1 Gate 三字段当前裁决事实槽、R3-H2 前缀时点归约 + 接线约束 A（D-10）、R3-H4 parity 协议落库方向。
> v1.1.0 → v1.2.0: R2-H2 fold 全函数 + D-9 pending 物化前置、R2-H3 时点归约方向、R2-H5 集合顺序。
> v1.0.0 → v1.1.0: R1-H1..H7。
> Parent: [G5 剩余计划](decision-090-g5-remaining-plan.md) v1.1.0 @ `0f8c964`（G5-T1）· Decision-090 §4/G5
> 唯一权威: [manual-runtime-semantic-contract](../../ai-sdlc/manual-runtime-semantic-contract.md) v1.0.0 §6.2（协议）、§6.2.2（三级有序判别）、§6.2.3（追平发布）、§6.2.4（投影字段映射）、§6.2.5/§6.2.6（repair）、§6.2.7（BLOCKED_AMBIGUOUS）、§7.2（失败码）
> 载体裁决: Current User 2026-09-09——TS 原生实现，以真实手动发布器产物做逐场景 parity 锁定
> 本文地位: 把合同 §6.2 抽象协议实例化到 runtime 具体数据模型。凡与合同冲突，以合同为准并回改本文。

## 1. 数据对象与输入输出

### 1.1 输入

| 对象 | 权威 | 关键字段（实际字段名全列；完整 46 字段见 `core/loop-capability-execution.ts:65`） |
| --- | --- | --- |
| capability journal | `loop_capability_executions` 表（**不是** `loop_events`；两表各有独立 `(run_id, sequence)` 序列域） | `sequence`（run 内单调）、`executionEventId`、`runId`、`capability`（=nodeId，J:265 强制相等）、`executionRole`（primary / adversarial_scan / formal_verdict，node-capability-contract 角色表）、`attempt`、`status`（**仅 started/succeeded/failed/blocked**）、`createdAt`、`inputArtifactRef`、`inputArtifactVersion`、`inputDigest`、`outputArtifactRef`、`outputArtifactVersion`、`outputDigest`、`gateResult`、`unresolvedFindingsRef`、`unresolvedFindingsDigest`、`consumedFindingsRef`、`consumedFindingsDigest`、`decisionDepth`、`decisionStatus`、`decisionScopeId`、`decisionDeltaRef`、`decisionDeltaDigest`、`nextStepEligibility`、`errorCode`、`retryable`、`reasonCode`、binding/executor/process/staging/promotion/humanAction 字段 |
| finding store | `loop_findings`（24 列）+ durable 证明 `LoopFindingProof`（11 字段：`findingId/proofKind/revisionId/revisionNodeId/revisionArtifactRef/revisionArtifactDigest/evidenceRef/evidenceDigest/riskAcceptedBy/riskAcceptedScopeId/resolvedByNodeId`） | 行：`finding_id/sequence/source_capability/source_revision_id/cause_kind/severity/category/evidence_ref/evidence_digest/earliest_affected_node_id/status/resolved_by_revision_id/resolution_evidence_ref/resolution_evidence_digest/risk_accepted_by/risk_acceptance_evidence_ref/risk_acceptance_evidence_digest/risk_accepted_scope_id/superseded_by/created_at/canonical_sha256` 等 |
| finding invalidation 边 | `appendFinding` 同事务写入（指向被 STALE 的 revision）；**实际四字段 `findingId/invalidationIndex/revisionId/nodeId`，无 capability 事件序、无时间戳**（R3 实证） | 失效时点还原的约束来源（§4.2 接线约束 A） |
| artifact store / revisions | content-addressed blob + `loop_artifact_revisions` | blob（ref/kind/digest/sizeBytes，**无 stablePath**）；revision：`revisionId/nodeId/sequence/stablePath/semver/artifactRef/digest/producerExecutionId/producerExecutionRole/gateResult/validity/supersededBy/upstreamRevisionIds/createdAt` |
| finding 独立登记入口 | 公开 `appendFinding`（独立 finding 序列，**不推进 capability journal**；C:4243 合同与 S:2054 原子注册并存） | gateway 原子注册（finding 时点=terminal 事件序）与本入口（时点不可由 capability 序列还原）是**两条现役登记路径**（§4.2 接线约束 A） |
| recovery 状态 | `recovery.pendingRevisionMaterialization` | 投影调用前置（§3.2 前置条件 D-9） |
| 当前 manifest.md | `library/{id}/manifest.md` | 手动发布器产物（§2 冻结格式） |

读取纪律：finding/journal/revision 一律经**现役已验证读接口**（不直读 SQLite 绕过 schema/hash/身份校验）。

### 1.2 输出与不变量

`library/{id}/manifest.md`；失败码 `MANIFEST_CORRUPT_STOP` / `JOURNAL_MANIFEST_MISMATCH_STOP`；合法待投影 → 幂等追平；无 manifest 存量目录 → `BLOCKED_AMBIGUOUS`。
不变量：intake.manifest.json 零触碰；finding 状态迁移不触碰 entries 产物绑定字段；同输入重放逐字节同一 manifest。

## 2. manifest 文档格式（冻结）

### 2.1 顶层键全集

文档 = 标题行 + self-attesting 注释 + 单一 YAML 块。YAML 顶层键全集（发布器实际形态 + 本协议新增的 `projection_provenance`，后者进入 self-digest 覆盖范围）：

```yaml
schema_version: '1.0'
requirement_id: <id>
title: <str>                    # init 由 requirement-intake 写入；投影不改动
publish_seq: <int>              # = projected_through（runtime，§3.1）；手动=声明 seq
projected_through: <int|MANUAL> # runtime=最后已投影 capability 事件 sequence；手动=MANUAL
updated_at: <ISO-8601 引号字符串>
depth: {decision_scope, requested_depth, initial_depth_basis, required_depth}
entries:                        # 七节点各一行；init 形态 §2.2
finding_index:                  # 每 finding 恰一行，11 字段（§2.3）
declaration_log:                # 手动完成声明日志 {seq,kind,input_digest}；runtime 投影不追加（D-4）
corrections:                    # 发布器 repair 后的更正登记（发布器既有行为）；投影保留原样
projection_provenance:          # G5 接线（§8）：MANUAL 接管的持久承接记录（R4-H3 缺口 4）
  mode: manual-takeover-A|manual-takeover-B|null
  accepted_at: <ISO-8601|null>
  logical_identity_map:         # 逻辑身份映射表（持久保存，进入 self-digest）
  - runtime_finding_id: <durable id>
    manual_finding_id: <manual id>
    source_revision_runtime: <revision id>
    source_revision_manual: <版本标签>
    evidence_digest_runtime: <sha256>
    evidence_digest_manual: <digest 或引用>
repair_records: []
manifest_digest: 'sha256:<hex>' # = sha256(YAML.dump(剥离 manifest_digest 后的完整状态，含 projection_provenance))
```

`projection_provenance` 的冻结 schema：`mode` ∈ `manual-takeover-A`（journal 空，cursor=0 承接）/ `manual-takeover-B`（journal 有事件，全事件语义对账后承接）；`logical_identity_map` 逐行登记 runtime durable finding ID ↔ 手动 finding ID、两面 source_revision、两面 evidence digest——它是 §7.4 面间身份对应函数的持久载体。投影器每次运行校验该键存在性与映射行完整性（缺键或行损坏 → `MANIFEST_CORRUPT_STOP`）。

init 形态（发布器 P:220–232）：七节点 pending 行 + depth 块 + 空索引/日志/修复记录 + `projection_provenance: null`（全新 requirement 无接管）。`projection_provenance: null` 与 `mode: null` 均为合法初始态，读取为「无接管」。

### 2.2 entries 行 schema

七节点各一行；init 形态 status=pending + 五 null 字段（artifact_path/version/digest/updated_at/source_event_ref）。

| 字段 | 槽位 | 合法值 |
| --- | --- | --- |
| `node` | — | 七节点 |
| `status` | 产物生命周期 | pending / current / stale（冻结映射；runtime 无 actionable） |
| `artifact_path` | 产物绑定 | 相对 requirement library 根的路径（H6 转换表语义键） |
| `version` | 产物绑定 | semver 字符串 |
| `digest` | 产物绑定 | 64 位小写 hex |
| `updated_at` | 产物绑定 | ISO-8601 |
| `source_event_ref` | 产物绑定来源 | runtime=executionEventId；手动=上游产物路径 |
| `gate_result` / `decision_depth` / `decision_status` | 当前裁决事实（仅 solution-gate 行） | PASS/FAIL/PWR；LIGHT/STANDARD/DEEP 或 null；CONFIRMED/ESCALATED/BLOCKED_UNKNOWN 或 null |
| `execution` | 执行事实（仅 runtime 面投影追加；手动面无此键） | `{status: succeeded\|blocked\|failed, error_code, reason_code, execution_event_ref, ledger_ref?, ledger_digest?, blocked_report_ref?, blocked_report_digest?}` |

### 2.3 finding_index 行 schema（11 字段）

见 §3.4 映射表（finding_id/discovered_at/root_cause_category/earliest_affected_node_id/source_revision/evidence_ref/status/closed_by/closure_evidence_ref/closure_evidence_digest/closure_bound_revision_id）。

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
| 任何角色 failed | **保持不变**（有 revision 时保留其绑定与当前裁决；无 revision 保持 pending；failed 无正式裁决输出 J:519–526，裁决槽不动） | `{status: failed, error_code ← errorCode, reason_code ← reasonCode, execution_event_ref}` |
| formal_verdict blocked | 现役禁止（J:509–511） | — | 数据出现 = 损坏，走停止路径 |

批次无关性：fold 逐步确定性、槽位覆盖式更新，单批/分批/从基线全量 fold 结果相同（fold 结合律，R2 已验证，本轮保持）。

`entry.status` 合法值全程 = `pending | current | stale`；`execution.status` 合法值 = `succeeded | blocked | failed`。两枚举分离，不混用（C:174）。

solution-gate 行的 scan/verdict 双角色归约：adversarial_scan 事件只写执行事实槽（Ledger 绑定）；formal_verdict 的 PASS/PWR 事件更新产物槽与三扩展字段。执行事实槽保存最后一次终态的事实；scan 与 verdict 两角色的轨迹证据由 journal（bindingId/Version、executorAgent、gateResult）承载（§7 轨迹证据来源）。

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
| `closure_bound_revision_id` | RESOLVED: `resolved_by_revision_id`；ACCEPTED: **null**（D-2，合同明文）；OPEN/SUPERSEDED: null | |

## 4. 三级有序判别（R4-H2 修正：前缀校验覆盖全部三槽位；顺序固定互斥）

### 4.1 第 1 级 损坏 → `MANIFEST_CORRUPT_STOP`

YAML 解析失败；self-digest 校验失败（canonical 序列化 = 发布器 `YAML.dump` 行为的 TS 复刻，D-5，G3 fixtures 逐字节对拍锁定）。不静默修复、不重建。

**`projection_provenance` 键的版本适配（R5-H2 缺口 4 修正）**：该键**缺失**时**不判为损坏**——它标记 manifest 处于「接管前旧格式」状态，投影器应触发接管对账（§8）而非 STOP。接管对账通过后由投影器写入 `projection_provenance`（接管完成后该键进入 self-digest 覆盖范围）。仅当该键**存在但内容损坏**（mode 非法、logical_identity_map 行结构错误）→ 第 1 级 STOP。

### 4.2 第 2 级 真分叉 → `JOURNAL_MANIFEST_MISMATCH_STOP`

**第 4.2(a) 前缀完整校验（R4-H2 修正：三槽位全覆盖）**——对 `sequence ≤ projected_through` 的已投影前缀，重推导每节点（每角色终态事件）的**三个槽位**并与 manifest 逐字段比对：

| 槽位 | 重推导规则（时点 C = projected_through） | 比对字段 |
| --- | --- | --- |
| 产物绑定槽 | 节点有效 revision = producer 事件序 ≤ C 的 revision 中 `revision.sequence` 最大者 r_k；r_k 状态：finding invalidation 边（时点 = finding 来源 terminal 事件序 ≤ C）指向 r_k → **stale**；否则 **current** | `artifact_path/version/digest/updated_at`（← r_k；rehash 篡改任一字段即检出）；`source_event_ref`（← r_k 的 producerExecutionId；rehash 篡改即检出） |
| 当前裁决事实槽（仅 solution-gate） | C 内最后 succeeded formal_verdict 事件的 gate_result/decision_depth/decision_status | gate_result/decision_depth/decision_status 三字段（rehash 篡改任一即检出） |
| 执行事实槽 | C 内最后终态事件的 status/error_code/reason_code/execution_event_ref/Ledger 绑定/blocked 报告绑定 | 全部字段（rehash 篡改任一即检出） |

- r_k 为空候选（该节点前缀内无事件且 init 为 pending）→ entry = init pending 形态；
- 任一字段不一致 → `JOURNAL_MANIFEST_MISMATCH_STOP`（真分叉/篡改，不得进入第 3 级）。

**接线约束 A 保持（D-10）**：公开 `appendFinding` 独立登记路径的失效时点在 capability 序列域不可还原——本前缀校验的 finding 失效时点仅认 gateway 绑定路径的 terminal 事件序；独立登记路径不在投影器适用域（显式声明，D-10）。

**第 4.2(b) findingIndex 集合完整性与逐行交叉验证（R2-H5 顺序保持 + R4-H3 补充）**：

1. **集合建立与异常先行**：对 finding store 逐行建立身份集 `SI`（store 内重复 `finding_id` → 数据损坏，停止路径）；对 findingIndex 逐行建立身份集 `IM`（重复 → `MANIFEST_CORRUPT_STOP`）。
2. **集合差判别**：`IM − SI`（索引多出行，且无 SUPERSEDED/权威依据可循）→ `JOURNAL_MANIFEST_MISMATCH_STOP`；`SI − IM`（store 有索引无）→ **新登记差量**（第 3 级输入，见 §4.3）；`SI ∩ IM`（共有行）→ 逐行交叉验证。
3. **共有行三步有序互斥检查**（R2-H5 CLOSED 保持）：
   1. **身份字段**：`finding_id/discovered_at/root_cause_category/earliest_affected_node_id/source_revision/evidence_ref` 与 store 行逐字段一致，否则 STOP；
   2. **状态一致 → 投影字段整行交叉绑定**：status 一致时按 §3.4 生成期望行逐字段比对（RESOLVED 绑定复验者/证据/revision；ACCEPTED 绑定接受者/证据，`closure_bound_revision_id` 不参与），漂移 → STOP；
   3. **合法落后**：索引 OPEN、权威 RESOLVED/ACCEPTED_RISK、依据有效、除生命周期新增字段外无其他漂移 → 列入第 3 级追平；未知/反向/无依据 → STOP。

**`projection_provenance` 参与校验**：存在 `mode: manual-takeover-*` 时，findingIndex 的承接行按手动自洽校验（不套 runtime store 行），runtime 新增行按 store 交叉绑定校验；无该键（无接管）→ 全行按 store 交叉绑定校验。两域以来源标记区分，不得混判。

### 4.3 第 3 级 待投影 → 幂等追平

输入 = **journal 尾段**（`sequence > projected_through`）∪ **新登记行**（`SI − IM`：按 §3.4 映射生成行——OPEN 行直接插入；首投影前已 RESOLVED/ACCEPTED 的行按 §3.4 带完整生命周期字段插入）∪ **合法落后迁移**（§4.2 第 3 步命中行）。三者无任何存在 → no-op 原样退出；任一存在 → 按 §6.2.3 发布：尾段更新 entries 与 `projected_through/publish_seq/updated_at`；新登记/迁移仅对齐 findingIndex（entries 产物绑定四不动）；混合输入合入同一次原子发布（V9）。

## 5. 发布、repair 与失败出口

发布 = canonical 序列化（D-5）→ self-digest 重算 → 原子 rename；崩溃后旧/新均自洽。repair 基线重建五步照 §6.2.6（runtime 面第 ③ 步 = projected_through 重设 journal 末 capability 事件序号）；`corrections`/`repair_records` 按发布器既有形态保留。失败出口 `MANIFEST_CORRUPT_STOP` / `JOURNAL_MANIFEST_MISMATCH_STOP` / `BLOCKED_AMBIGUOUS` 进 runtime 运行出口（§7.2）。

## 6. 边界决策记录

| # | 决策 | 依据/状态 |
| --- | --- | --- |
| D-1 | `discovered_at` = 发现来源节点（source_capability） | R1/R2/R3/R4 复审认可 |
| D-2 | ACCEPTED 行 `closure_bound_revision_id` runtime 面 null；parity 状态限定仅 ACCEPTED，RESOLVED 不豁免 | R1..R4 复审认可；§7 表承接 |
| D-3 | finding_index 含 SUPERSEDED（runtime 全集） | R1..R4 复审认可；发布器 self-consistency 枚举差异由合法轨迹等价吸收 |
| D-4 | `declaration_log`/`publish_seq`/`projected_through` 不参与 parity 等价维度（面内进度） | R1..R4 复审认可；H1 修正后 publish_seq 语义 = 末事件序号 |
| D-5 | canonical YAML 序列化 = TS 复刻发布器 `YAML.dump` 行为，以发布器全部 fixture 逐字节对拍锁定（版本/bytes 记录归 T5） | R1..R4 复审认可 |
| D-6 | task-planning/implementation SKILL 的 checklist 措辞移除退役术语字样（E0.4 active-context 规则） | R2/R3/R4 复审认可更正 |
| D-7 | 路径三层关系（blob/ref / revision.stablePath / library canonical）与七节点转换表；canonical-vs-materialized 命名对齐显式声明为实施面调整、提请下一轮复审 | R1-H6/R2/R3 认可方向；R4 认可细则落库于本轮 §7 |
| D-8 | `execution` 兼容承载对象（runtime 面专属；手动面无此键） | R2 认可方向；R3 认可具体映射本轮 §3.2 闭合；R4 确认 |
| D-9 | 投影调用前置：`recovery.pendingRevisionMaterialization == null` | R2 认可；R3 认可（runtime:455/605/651/691 补账次序支持）；R4 确认 |
| D-10 | **接线约束 A**：公开 `appendFinding` 独立登记路径的失效时点在 capability 序列域不可还原；runtime 投影器适用域显式限定为「finding 生命周期经 gateway 绑定 terminal 注册的 runtime 生产链 requirement」 | R3-H2 修正边界要求；R4 复审认可 |
| D-11 | **MANUAL 接管的持久承接记录**：`projection_provenance` 顶层键（mode/accepted_at/logical_identity_map）进入 manifest self-digest 覆盖范围 | R4-H3 修正边界要求"承接格式/来源标记/映射表/基线及摘要覆盖放进本协议唯一可验证状态"；本版落库 |
| D-12 | **逻辑版本对应**：同一逻辑修订的 runtime attempt 版本与手动 semver 的映射在接管/对账时建立并持久保存（logical_identity_map 的 revision 维度）；parity 的 version 比较走映射，不走字面 | R4-H3 缺口 5 修正边界要求 |
| D-13 | **digest 链消歧**：同 digest 多 revision 按 (node, producerExecutionId, revision sequence) 三元组消歧；跨面对应要求"逻辑修订的 producer 轮次与来源节点"一致，非唯一配对 → STOP | R4-H3 缺口 2 修正边界 |
| D-14 | **finding 一一对应**：FindingLedger 行位置 → 登记声明顺序 → store sequence 的链式对应；缺失/多解 → STOP | R4-H3 缺口 3 修正边界 |

## 7. parity 归一化协议（R4-H3 补全，R4-H3 修正边界落实）

**两种断言分离**：断言 A = runtime 面内同输入重放逐字节一致；断言 B = 同 fixture 手动轨迹与 runtime 轨迹的**语义等价**（跨面，按本表归一化后比较）。

### 7.1 比较域与归一化规则（逐维度完整表，R4 缺口 1 修正）

| 比较维度 | runtime 面输入 | 手动面输入 | 归一化比较规则 |
| --- | --- | --- | --- |
| `entries.node` | nodeId（=capability） | node | 字面相等 |
| `entries.artifact_path` | revision.stablePath 去 `library/{id}/` 前缀 | 手动相对路径（中文基名） | **语义键 = (目录段, capability)**（七节点转换表）；基名差异（英文/中文）按 D-7 面间映射豁免字面比较，但每面各自要求路径上产物文件存在且 digest 匹配 |
| `entries.version` | revision semver（attempt.0.0） | 声明 semver（如 1.3.0/1.1.0） | **面内自洽**：面内单调即可；跨面字面不等为既定事实（runtime attempt.0.0 vs 手动 1.3.0），经 D-12 逻辑修订映射表对应后**不作字面比较** |
| `entries.digest` | outputDigest | 声明 digest | 字面比较（64 hex，跨面应相等——同一逻辑产物） |
| `entries.status` | revision validity 映射（current/stale；pending 为 init 态） | current/stale/pending | 字面比较 |
| `entries.updated_at` | 事件 createdAt | 声明确认时刻 | 面内单调；跨面不比较（时钟不同） |
| `entries.source_event_ref` | executionEventId | 上游产物路径 | **面内字段，不跨面比较**；每面各自自洽 |
| solution-gate 三扩展 | gateResult/decisionDepth/decisionStatus | 同名 | 字面比较 |
| `entries.execution` | runtime 专属 | 手动无 | 不跨面比较；runtime 面按 §3.2 自洽 |
| `depth` 四字段 | verdict 投影 + init | init/ESCALATED 更新 | 逐字段字面比较（H4 12 组合对拍口径） |
| `finding_index` 11 字段 | store 行+proof（§3.4） | 手动声明行（P:451–459/503–508 形态） | 逐字段**语义对应**比较；`finding_id` 跨面按逻辑身份对应函数（同一逻辑 finding 两面各自 ID，轨迹等价断言内建立映射）；`source_revision`/`evidence_ref` 面内绑定自洽即可 |
| `finding_index.status` | OPEN/RESOLVED/ACCEPTED/SUPERSEDED | OPEN/RESOLVED/ACCEPTED | SUPERSEDED 仅 runtime（D-3）；共同合法轨迹（无 supersede）字面等价 |
| `closure_bound_revision_id` | RESOLVED=resolved_by_revision_id；ACCEPTED=null（D-2） | RESOLVED=修复依据；ACCEPTED=PWR 裁决 revision | **状态限定**：RESOLVED 字面比较；ACCEPTED runtime null ↔ 手动非空为既定差异，parity 记录为 D-2 差异而非缺陷 |
| `publish_seq`/`projected_through`/`declaration_log` | runtime 进度 | 手动进度 | **不参与比较**（D-4） |
| self-digest | 每面独立：canonical YAML → sha256 | 同 | 各面独立断言；跨面 digest 不比较 |
| 双角色/eligibility/reroute 轨迹证据 | journal：bindingId/Version、executorAgent、gateResult、decision*、nextStepEligibility、earliest_affected_node 路由 | Gate Result 文件、方案修订版本、路由登记 | parity 的轨迹断言从 journal 取证（两 binding 分离、深度档位、eligibility、earliest 节点），不要求 manifest 承载 |

### 7.2 逻辑身份对应函数（R4-H3 缺口 3 修正）

finding 的跨面一一对应按下述链建立，缺失/多解 → `JOURNAL_MANIFEST_MISMATCH_STOP`：

1. **Ledger 行位置链**：FindingLedger 的 finding 行按（扫描轮次、行序）定位——Ledger 行序 ↔ gateway 原子注册的 finding 登记顺序（§5.1：Ledger 行式追加、登记即占用）。
2. **登记声明顺序链**：公开 `appendFinding` 独立登记的 finding 按其 sequence 定位（与 gateway 绑定路径共存时按登记时序合并）。
3. **store sequence 链**：store 行按 finding `sequence` 定位。

三条链交叉验证一致 → 一一对应成立；任一环节缺失/多解 → `JOURNAL_MANIFEST_MISMATCH_STOP`（不猜测配对）。

### 7.3 parity 断言失败的处理

任何归一化后不等 → 映射表或投影器缺陷，按 §9 复审收敛；**不得**通过删除字段、泛化豁免或自制 normalizer 掩盖。

## 8. MANUAL 接管完整状态机（R4-H3 闭合：A/B 步骤 + 混合权威期 + 重入）

### 8.1 接管 A（journal 无 capability 事件）

| 步骤 | 操作 | 状态 |
| --- | --- | --- |
| A1 | 手动面自洽校验（self-digest + 一致性） | 通过 → 继续；失败 → STOP |
| A2 | `projected_through = 0`、`publish_seq = 0`；entries/finding_index/depth/corrections 原样承接；写入 `projection_provenance = {mode: manual-takeover-A, accepted_at, logical_identity_map: []}`（**持久承接记录**，进入 self-digest 覆盖——R4-H3 缺口 4 修正） | 承接完成 |
| A3 | 重入：首投影（新事件）→ 逐事件 fold（execution 键按 §3.2 出现）→ no-op 确认 | 稳定 |

**接管 A 后的校验适配**：承接行（手动来源）以手动自洽校验；runtime 新增行以 store 交叉绑定校验；两域在 findingIndex 中以 `projection_provenance.mode` 区分。cursor=0 的前缀校验：前缀为空 → 无前缀校验（A2 零游标例外，R4-H3 缺口 5 修正）；findingIndex 校验 = 承接行手动自洽 + runtime 新行交叉绑定。

### 8.2 接管 B（journal 有 capability 事件）

| 步骤 | 操作 | 状态 |
| --- | --- | --- |
| B1 | 手动面自洽校验 | 通过 → 继续；失败 → STOP |
| B2 | **全事件语义对账**：journal 全事件按 §3.2 推导期望 entries/finding_index，与现有手动形态做语义对账（比较域按 §7.1 归一化：路径按转换表语义键；finding 按逻辑身份对应）——一致 → 承接；不一致 → `JOURNAL_MANIFEST_MISMATCH_STOP`（两执行面事实分叉，人工处置） | 对账完成 |
| B3 | 承接：`projected_through/publish_seq` = 末事件 sequence；逻辑身份映射表持久保存于 `projection_provenance`（含 runtime↔手动 finding/revision 对应）；`source_event_ref` 保留手动形态直至该行被后续尾段更新 | 承接完成 |
| B4 | 重入：首尾段投影 → 逐事件 fold → no-op 确认 | 稳定 |

接管 B 的对账函数即 §7.1 的归一化比较（方向反转：journal 推导 vs 手动现存），同一实现两用。

### 8.3 接管后的常规校验适配（R4-H3 缺口 5/6 修正）

- **前缀校验**：cursor = B3 末序号；前缀=已 fold 事件——校验按 fold 后状态与 manifest 逐字段比对（归一化规则同 §7.1）。rehash 篡改 → 归一化后不等 → STOP ✓。
- **findingIndex 校验**：承接行手动自洽 + runtime 新行交叉绑定；无该键 → 全行按 store 交叉绑定（无接管时默认）✓。
- **后续差量**：尾段投影（fold）更新对应节点行（runtime 新行）→ 前缀校验按 fold 后状态比对 → 差量追平 ✓。

### 8.4 混合权威期（R4-H3 缺口 6 修正）

接管后 findingIndex 校验为两域混合：承接行（手动自洽）+ runtime 新增行（store 交叉绑定）；映射表（logical_identity_map）持久保存于 `projection_provenance.logical_identity_map` 并逐行登记 runtime↔手动 finding/revision 对应（接管对账时建立）。重复/缺失/漂移 → STOP。cursor 推进只计新事件。

## 9. 验收映射（G5-T5 引用；R4 回归矩阵逐项对应）

见 R4 报告 §4 各阻塞"回归核验"清单 + R1/R2 报告 §3 矩阵 + 本版新增：PASS→FAIL/UNKNOWN、已有产物→blocked、scan blocked 的 Ledger+output 双绑定、PASS/PWR 有 revision、FAIL 无 revision、UNKNOWN/PWR 有 revision、verdict→scan→failed、单批/分批/全量 fold 等价、普通成功→失败、D-9 暂缓及 required_depth 保持、接管 A/B 完整步骤、每面独立 self-digest、RESOLVED 跨面绑定按逻辑修复依据对应、错逻辑修订/错证据不可被泛化删除掩盖、MANUAL 空/有 journal × 一致/分叉接管后一次 tail 再 no-op。

## 10. 非阻塞建议吸收记录

S1 字段字典勘误已吸收（§1.1 实际字段名清单；`inputDigest/outputDigest` 等全名引用）。S2 上轮报告 /tmp 路径链接改为审计引用（本版 v1.1.0 头部；最终冻结时可再落 PKB 归档引用）。S3 D5 对拍的 Ruby/Psych 版本与完整 bytes 记录归 T5 fixture。S4 D6 编号勘误已订正（R2 已认可）。
