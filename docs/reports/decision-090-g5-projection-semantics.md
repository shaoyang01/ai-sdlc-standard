# G5-T1 投影语义冻结稿：journal / finding store → manifest.md 投影协议实例化

> Version: 1.3.0（R3 评审 R3-H1/H2/H4 修订版；SEMANTICS_FREEZE 候选——Current User / 复审确认后冻结为 G5-T2 编码依据）
> Date: 2026-09-09
> v1.2.0 → v1.3.0: 按 [G5-T1-REVIEW-R3](/tmp/g5-t1-review-r3/.review-tmp/G5-T1-REVIEW-R3.md) 修订——R3-H1 solution-gate entry 拆分「产物绑定槽 / 裁决事实槽」（formal_verdict succeeded 无条件更新裁决三字段，含无 revision 的 FAIL/BLOCKED_UNKNOWN；scan blocked 双绑定 Ledger 与 blocked 报告）；R3-H2 前缀时点归约补具体规则（producer 事件序时钟、替换与失效边时点判定）并把公开 appendFinding 独立登记路径的时点不可还原性显式声明为**接线约束 A**；R3-H4 parity 比较域三分（跨面语义等价域 / 面内自洽域 / MANUAL 混合权威期承接域）与接管 A/B 完整状态机落库。
> v1.1.0 → v1.2.0: R2-H2 fold 全函数 + D-9 pending 物化前置（D-9 新增）；v1.0.0 → v1.1.0: R1-H1..H7（进度语义、D-1 discovered_at、D-2 ACCEPTED bound=null、D-3 SUPERSEDED、D-4 parity 排除、D-5 canonical YAML、执行对象 D-8、路径三层 D-7）。
> Parent: [G5 剩余计划](decision-090-g5-remaining-plan.md) v1.1.0 @ `0f8c964`（G5-T1）· Decision-090 §4/G5
> 唯一权威: [manual-runtime-semantic-contract](../../ai-sdlc/manual-runtime-semantic-contract.md) v1.0.0 §6.2（协议）、§6.2.2（三级有序判别）、§6.2.3（追平发布）、§6.2.4（投影字段映射）、§6.2.5/§6.2.6（repair）、§6.2.7（BLOCKED_AMBIGUOUS）、§7.2（失败码）
> 载体裁决: Current User 2026-09-09——TS 原生实现，以真实手动发布器产物做逐场景 parity 锁定
> 本文地位: 把合同 §6.2 抽象协议实例化到 runtime 具体数据模型。凡与合同冲突，以合同为准并回改本文。

## 1. 数据对象与输入输出

### 1.1 输入

| 对象 | 权威 | 关键字段（实际字段名；完整 46 字段见 `core/loop-capability-execution.ts:65`） |
| --- | --- | --- |
| capability journal | `loop_capability_executions` 表（**不是** `loop_events`；两表各有独立 `(run_id, sequence)` 序列域） | `sequence`（run 内单调）、`executionEventId`、`runId`、`capability`（=nodeId，J:265 强制相等）、`executionRole`（primary / adversarial_scan / formal_verdict，node-capability-contract 角色表）、`attempt`、`status`（**仅 started/succeeded/failed/blocked**）、`createdAt`、`inputArtifactRef/inputArtifactVersion/inputDigest`、`outputArtifactRef/outputArtifactVersion/outputDigest`、`gateResult`、`unresolvedFindingsRef/Digest`、`consumedFindingsRef/Digest`、`decisionDepth/decisionStatus/decisionScopeId/decisionDeltaRef/decisionDeltaDigest`、`nextStepEligibility`、`errorCode/retryable/reasonCode`、binding/executor/process/staging/promotion/humanAction 字段 |
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

文档 = 标题行 + self-attesting 注释 + 单一 YAML 块。YAML 顶层键全集（发布器实际形态，含 repair 后的 `corrections`）：

```yaml
schema_version: '1.0'
requirement_id: <id>
title: <str>                    # init 由 requirement-intake 写入；投影不改动
publish_seq: <int>              # = projected_through（runtime，§3.1）；手动=声明 seq
projected_through: <int|MANUAL> # runtime=最后已投影 capability 事件 sequence；手动=MANUAL
updated_at: <ISO-8601 引号字符串>
depth: {decision_scope, requested_depth, initial_depth_basis, required_depth}
entries:                        # 七节点各一行；init 形态 status=pending + 五 null 字段
- node: <capability>
  status: pending|current|stale # 产物生命周期状态（revision validity 映射）
  artifact_path: <rel path|null>   # 产物绑定：该 entry 当前指向的产物相对路径
  version: <semver|null>           # 产物绑定
  digest: <sha256|null>            # 产物绑定
  updated_at: <ISO-8601|null>      # 产物绑定最后更新时刻
  source_event_ref: <str|null>     # 产物绑定来源（runtime=executionEventId；手动=上游产物路径；init=null）
  gate_result: PASS|FAIL|PASS_WITH_RISK|null            # 仅 solution-gate 行：当前裁决事实（R3-H1）
  decision_depth: LIGHT|STANDARD|DEEP|null              # 仅 solution-gate 行：当前裁决事实；BLOCKED_UNKNOWN 合法 null（R3-H1）
  decision_status: CONFIRMED|ESCALATED|BLOCKED_UNKNOWN|null  # 仅 solution-gate 行：当前裁决事实（R3-H1）
  execution: {...}              # 仅 runtime 面投影追加的执行事实承载（D-8；完整形态见 §3.2 注）
finding_index:                  # 每 finding 恰一行，11 字段（§3.4）
declaration_log:                # 手动完成声明日志 {seq,kind,input_digest}；runtime 投影不追加（D-4）
corrections:                    # 发布器 repair 后的更正登记（发布器既有行为）；投影保留原样
repair_records: []
manifest_digest: 'sha256:<hex>' # = sha256(YAML.dump(剥离 manifest_digest 后的完整状态))
```

init 形态（发布器 P:220–232）：七节点 pending 行 + depth 块 + 空索引/日志/修复记录。

**solution-gate 行的字段分类（R3-H1 修正）**：solution-gate 行由两类字段构成——
- **产物绑定槽**（`status/artifact_path/version/digest/updated_at/source_event_ref`）：由产生 revision 的 formal_verdict succeeded (PASS/PWR) 事件驱动；
- **当前裁决事实槽**（`gate_result/decision_depth/decision_status`）：由**每个 formal_verdict succeeded 事件无条件更新**（不论是否物化 revision，与真实发布器 P 的行为一致——P 在 FAIL/BLOCKED_UNKNOWN 裁决后同样更新 Gate 三字段）。

## 3. 投影映射表

### 3.1 head 进度（保持）

| 字段 | runtime 规则 |
| --- | --- |
| `projected_through` | **= 已处理的最后 capability 事件 `sequence`**（消费域 = `loop_capability_executions`，同 run 绑定）。finding-only 差量发布不推进。 |
| `publish_seq` | **= `projected_through`**（同域同步）。finding-only 差量发布两者均不动。 |
| 超前/失效游标 | `projected_through` > 该 run 实际最大 capability 事件 `sequence`，或游标处无对应事件 → `JOURNAL_MANIFEST_MISMATCH_STOP`。 |
| MANUAL 接管基线 | 见 §8（完整步骤与状态机）。 |

### 3.2 entries：逐事件 fold 全函数（保持，补充裁决事实槽与 scan blocked 双绑定）

**前置条件（D-9）**：投影调用前，`recovery.pendingRevisionMaterialization` 必须为 null。pending 非空时投影器不发布，返回暂缓。

**fold 全函数**：对每节点，取其 capability 事件按 `sequence` 升序的终态子序列，从该节点 init 状态出发逐事件归约，维护三个槽位：

- **产物绑定槽**：`status/artifact_path/version/digest/updated_at/source_event_ref`——仅由产生 revision 的 succeeded 终态更新；
- **当前裁决事实槽**（仅 solution-gate 行）：`gate_result/decision_depth/decision_status`——由**每个 formal_verdict succeeded 事件无条件更新**（不论是否物化 revision，R3-H1 修正）；
- **执行事实槽**（`execution` 对象，D-8）：由每个终态事件更新。

逐事件规则（角色 × status 全组合；现役 validator 合法组合）：

| 事件 | 产物绑定槽 | 当前裁决事实槽（仅 solution-gate） | 执行事实槽 |
| --- | --- | --- | --- |
| primary / formal_verdict succeeded，revision 已物化 | status ← revision validity（current/stale）；产物四字段 ← revision（§3.2）；source_event_ref ← executionEventId | formal_verdict：三扩展字段 ← 事件 | `{status: succeeded, execution_event_ref}` |
| formal_verdict succeeded (FAIL/BLOCKED_UNKNOWN)，不物化 revision | **保持不变**（含 pending 初值） | **三扩展字段 ← 事件**（gate_result/decision_status/decision_depth=null，R3-H1 修正：无条件更新） | `{status: succeeded, execution_event_ref}` |
| adversarial_scan succeeded | **保持不变** | **保持不变**（Ledger 不冒充正式 Gate） | `{status: succeeded, ledger_ref ← unresolvedFindingsRef, ledger_digest, execution_event_ref}` |
| adversarial_scan blocked | **保持不变** | **保持不变** | `{status: blocked, ledger_ref/digest, blocked_report_ref ← outputArtifactRef, blocked_report_digest ← outputDigest, execution_event_ref}`（scan blocked 双绑定：Ledger + blocked 报告，R3-H1 补全） |
| primary blocked | **保持不变** | — | `{status: blocked, blocked_report_ref/digest ← output 字段, execution_event_ref}` |
| 任何角色 failed | **保持不变** | formal_verdict failed：现役禁止（J:519） | `{status: failed, error_code, reason_code, execution_event_ref}` |
| formal_verdict blocked | 现役禁止（J:509） | — | 数据出现 = 损坏，走停止路径 |

批次无关性：fold 逐步确定性、槽位覆盖式更新，单批/分批/从基线全量 fold 结果相同（R2 已验证，本轮保持）。

`entry.status` 合法值全程 = `pending | current | stale`；`execution.status` 合法值 = `succeeded | blocked | failed`。两枚举分离，不混用（C:174）。

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
| `closed_by` | RESOLVED: proof.**`resolvedByNodeId`**；ACCEPTED: `risk_accepted_by` | proof 字典勘误 S1（解决 revision 的字段名为 `revisionId`） |
| `closure_evidence_ref` | RESOLVED: `resolution_evidence_ref`；ACCEPTED: `risk_acceptance_evidence_ref` | |
| `closure_evidence_digest` | RESOLVED: `resolution_evidence_digest`；ACCEPTED: `risk_acceptance_evidence_digest` | |
| `closure_bound_revision_id` | RESOLVED: `resolved_by_revision_id`；ACCEPTED: **null**（D2，合同明文）；OPEN/SUPERSEDED: null | |

## 4. 三级有序判别（R3-H2 修正，顺序固定互斥）

### 4.1 第 1 级 损坏 → `MANIFEST_CORRUPT_STOP`

YAML 解析失败；self-digest 校验失败（canonical 序列化 = 发布器 `YAML.dump` 行为的 TS 复刻，D-5，G3 fixtures 逐字节对拍锁定）。不静默修复、不重建。

### 4.2 第 2 级 真分叉 → `JOURNAL_MANIFEST_MISMATCH_STOP`

**第 2 级输入选择（R2-H5 重排，保持）**：先建立身份集合，再做逐行检查；新登记行不在本级别 STOP。

- (i) 对 finding store 逐行建立身份集 `SI`（store 内重复 `finding_id` → 数据损坏，走停止路径）。
- (ii) 对 findingIndex 逐行建立身份集 `IM`；索引内重复 `finding_id` → `MANIFEST_CORRUPT_STOP`。
- (iii) `IM − SI`（索引多出行，且无 SUPERSEDED/权威依据可循）→ `JOURNAL_MANIFEST_MISMATCH_STOP`。

**第 2 级逐行检查仅作用于 `SI ∩ IM` 的共有行**（三步有序互斥，首中即决）：

1. **身份字段**：`finding_id/discovered_at/root_cause_category/earliest_affected_node_id/source_revision/evidence_ref` 与 store 行逐字段一致，否则 STOP。
2. **状态一致 → 投影字段整行交叉绑定**：status 一致时按 §3.4 生成期望行逐字段比对（RESOLVED 绑定复验者/证据/revision；ACCEPTED 绑定接受者/证据，`closure_bound_revision_id` 不参与），漂移 → STOP。
3. **合法落后**：索引 OPEN、权威 RESOLVED/ACCEPTED_RISK、依据有效、除生命周期新增字段外无其他漂移 → 列入第 3 级追平。未知/反向/无依据 → STOP。

**第 2 级(a) journal 前缀校验（R3-H2 修正：具体归约规则补回）**：

前缀校验 = 对 `sequence ≤ projected_through` 的已投影前缀，重推导每节点的产物绑定并与 manifest entries 比对。

**时点时钟与可还原性声明（接线约束 A）**：

- revision 的 producer 时点 = `revision.producerExecutionId` → 对应 capability 事件的 `sequence`（现役可查，唯一）。
- finding 失效的时点分两路径：
  - **gateway 原子注册路径**：finding 登记时点 = 其绑定 terminal 事件的 `sequence`（唯一、可查）；
  - **公开 `appendFinding` 独立登记路径**：不推进 capability journal，其登记与失效**时点在 capability 序列域中不可还原**。
- 本冻结稿的适用域声明：runtime 投影器适用于「finding 生命周期经 gateway 绑定 terminal 注册的 runtime 生产链 requirement」；**公开 `appendFinding` 独立登记路径的 requirement 不在本投影器适用域**，若需支持须作为接线扩展显式提请复审（接线约束 A）。在该约束下，前缀时点归约的输入是可还原的（所有相关时点均以 capability 事件序为时钟），不虚构任何事件序号。

**前缀归约规则（对每节点 N，时点 C = projected_through）**：

- 候选集 = N 的全部 revision 中 **producer 事件 sequence ≤ C** 者，按 revision `sequence` 升序排列为 r₁…rₖ；
- 若候选集为空 → N 在前缀内无产物（pending 或承接形态，与 manifest entries 比对按承接规则）；
- rₖ 为前缀末有效 revision；rₖ 的前缀状态：
  - 存在 **finding invalidation 边**指向 rₖ（四字段绑定：findingId/revisionId/nodeId，R3 实证无时点字段），且该边的 finding 来源 terminal 事件 `sequence ≤ C` → **stale**（finding 致失效在前缀内已生效）；
  - 否则若 k > 1 且 rₖ₋₁ 的 producer 事件序 ≤ C → rₖ₋₁ 已被 rₖ 替换（SUPERSEDED 历史形态）→ 当前状态由 rₖ 决定（ACTIVE）；
  - 否则（k = 1 且无失效边）→ **current**；
- 非 rₖ 的早期 revision 的历史状态不参与 entries 比对（entries 每节点一行，仅承载当前绑定）。

**比对字段与规则**：

| entry 字段 | 比对规则 |
| --- | --- |
| `artifact_path` | ← rₖ 的 stablePath 去 `library/{id}/` 前缀（H6 转换表）；不一致 → STOP |
| `version` | ← rₖ semver（attempt.0.0）；与 manifest version 字面比较；不一致 → STOP |
| `digest` | ← rₖ digest；不一致 → STOP |
| `updated_at` | ← rₖ 的 createdAt；不一致 → STOP |
| `source_event_ref` | ← rₖ 的 producerExecutionId；不一致 → STOP |

任一字段不一致 → `JOURNAL_MANIFEST_MISMATCH_STOP`（真分叉/篡改，不得进入第 3 级）。

**前缀校验先于尾段追平完成**（顺序固定）；前缀通过后，尾段/失效进入第 3 级追平。

### 4.3 第 3 级 待投影 → 幂等追平

输入 = **journal 尾段**（`sequence > projected_through`）∪ **新登记行**（`SI − IM`：按 §3.4 映射生成行——OPEN 行直接插入；首投影前已 RESOLVED/ACCEPTED 的行按 §3.4 带完整生命周期字段插入）∪ **合法落后迁移**（§4.2 第 3 步命中行）。三者无任何存在 → no-op 原样退出；任一存在 → 按 §6.2.3 发布：尾段更新 entries 与 `projected_through/publish_seq/updated_at`；新登记/迁移仅对齐 findingIndex（entries 产物绑定四不动）；混合输入合入同一次原子发布（V9）。

## 5. 发布、repair 与失败出口

发布 = canonical 序列化（D-5）→ self-digest 重算 → 原子 rename；崩溃后旧/新均自洽。repair 基线重建五步照 §6.2.6（runtime 面第 ③ 步 = projected_through 重设 journal 末 capability 事件序号）；`corrections`/`repair_records` 按发布器既有形态保留。失败出口 `MANIFEST_CORRUPT_STOP` / `JOURNAL_MANIFEST_MISMATCH_STOP` / `BLOCKED_AMBIGUOUS` 进 runtime 运行出口（§7.2）。

## 6. 边界决策记录

| # | 决策 | 依据/状态 |
| --- | --- | --- |
| D-1 | `discovered_at` = 发现来源节点（source_capability） | R1/R2/R3 复审认可 |
| D-2 | ACCEPTED 行 `closure_bound_revision_id` runtime 面 null；parity 状态限定仅 ACCEPTED，RESOLVED 不豁免 | R1/R2/R3 复审认可；H7 表承接 |
| D-3 | finding_index 含 SUPERSEDED（runtime 全集） | R1/R2/R3 复审认可；发布器 self-consistency 枚举差异由合法轨迹等价吸收 |
| D-4 | `declaration_log`/`publish_seq`/`projected_through` 不参与 parity 等价维度（面内进度） | R1/R2/R3 复审认可；H1 修正后 publish_seq 语义 = 末事件序号 |
| D-5 | canonical YAML 序列化 = TS 复刻发布器 `YAML.dump` 行为，以发布器全部 fixture 逐字节对拍锁定（版本/bytes 记录归 T5） | R1/R2/R3 复审认可 |
| D-6 | task-planning/implementation SKILL 的 checklist 措辞移除退役术语字样（E0.4 active-context 规则） | R2/R3 复审认可更正 |
| D-7 | 路径三层关系（blob/ref / revision.stablePath / library canonical）与七节点转换表；**canonical-vs-materialized 命名对齐显式声明为实施面调整、提请下一轮复审** | R1-H6/R2 认可方向；R3-H6 修正边界确认细则落库于本轮 §7 |
| D-8 | `execution` 兼容承载对象（runtime 面专属；手动面无此键） | R2 认可方向；R3-H1 修正边界确认具体映射本轮 §3.2 闭合 |
| D-9 | 投影调用前置：`recovery.pendingRevisionMaterialization == null` | R2 认可；R3 复审认可（runtime:455/605/651/691 补账次序支持） |
| D-10 | **接线约束 A**：公开 `appendFinding` 独立登记路径的失效时点在 capability 序列域不可还原；runtime 投影器适用域显式限定为「finding 生命周期经 gateway 绑定 terminal 注册的 runtime 生产链 requirement」 | R3-H2 修正边界要求"明确给出需确认的调用/基线约束或合同澄清"；本文为本澄清的载体，待 Current User / 合同维护者确认后生效 |

## 7. parity 归一化协议表（R3-H4 落库）

**两种断言分离**：断言 A = runtime 面内同输入重放逐字节一致（§3.2 fold + §5 seal 的确定性）；断言 B = 同 fixture 手动轨迹与 runtime 轨迹的**语义等价**（跨面，按本表归一化后比较；两执行面 ID/路径/时间字面值必然不同，不做字面比较——R3-H4 修正）。

### 7.1 比较域三分（R3-H4 修正边界落实）

| 比较域 | 字段 | 规则 |
| --- | --- | --- |
| **跨面语义等价域** | entries 产物 digest（同一逻辑产物两面字节一致）、entries.status（current/stale 语义对应）、solution-gate 三扩展字段（gate_result/decision_depth/decision_status，R3-H1 修正：无 revision 裁决由当前裁决事实槽承载，P 同步更新三字段，两面对齐）、finding_index.status（OPEN/RESOLVED/ACCEPTED/SUPERSEDED 语义对应）、finding_index 的 evidence digest（同一逻辑证据） | 归一化后字面比较 |
| **面内自洽域**（不跨面比较，仅面内校验） | `finding_id`（runtime durable ID / 手动本地 ID）、`source_revision`（revision ID / 版本标签）、`closure_bound_revision_id`（canonical revision ID / 版本标签，**仅 ACCEPTED 差异为 D-2 既定**、RESOLVED 按逻辑修复依据对应后仍严格比较 digest 链）、`source_event_ref`（executionEventId / 上游产物路径）、时间字段（面内单调） | 每面各自自洽；跨面建立**逻辑身份映射**（同一逻辑 finding/修订/证据在两面的 ID 对应关系），映射建立后按映射比较语义绑定 |
| **MANUAL 混合权威期承接域** | 接管 A/B 承接的手动行（findingIndex 行、entries 手动字段） | 承接行以**手动自洽**校验；runtime 新增行以 **store 交叉绑定**校验；两域在 findingIndex 中以承接标记区分 |

### 7.2 逻辑身份对应函数

| 逻辑对象 | runtime 面身份 | 手动面身份 | 对应建立方式 |
| --- | --- | --- | --- |
| finding | durable `finding_id`（`run:finding:n`） | 手动声明 `finding_id`（如 `REQ-F01`） | 接管对账时按语义对齐建立映射（登记声明 ↔ store 行），映射表持久保存于承接记录 |
| revision | canonical `revision_id` | 版本标签/修订标注（如 `impl-fixed`） | 按**逻辑修复产物的证据 digest 链**对应：runtime revision 的 digest 与手动标注指向的产物 digest 相等即同一逻辑修订 |
| evidence | content-addressed `evidence_ref` | 手动路径/结构化 ref | 同上：digest 链对应 |

RESOLVED 行的跨面绑定检查：runtime 证明的 `resolutionEvidenceDigest`（修复实现的证据摘要）与手动 `closure_evidence_digest` 经 digest 链对应后必须一致——**不豁免 RESOLVED 的绑定语义**（R3-H4 修正边界）。

### 7.3 parity 断言失败的处理

任何归一化后不等 → 映射表或投影器缺陷，按 §9 复审收敛；**不得**通过删除字段、泛化豁免或自制 normalizer 掩盖。

## 8. MANUAL 接管完整状态机（R3-H4 闭合）

### 8.1 接管 A（journal 无 capability 事件）

| 步骤 | 操作 | 状态 |
| --- | --- | --- |
| A1 | 手动面自洽校验（self-digest + 一致性） | 通过 → 继续；失败 → STOP |
| A2 | `projected_through = 0`、`publish_seq = 0`；entries/finding_index/depth/corrections 原样承接（**混合权威期开始**：承接行=手动权威、runtime 新行=runtime 权威） | 承接完成 |
| A3 | 重入：首投影（新事件）→ 逐事件 fold → no-op 确认 | 稳定 |

**接管 A 后的校验适配**：承接行（手动来源）以手动自洽校验；runtime 新增行以 store 交叉绑定校验；两域在 findingIndex 中以**来源标记**区分（承接记录持久保存映射表，§7.2）。

### 8.2 接管 B（journal 有 capability 事件）

| 步骤 | 操作 | 状态 |
| --- | --- | --- |
| B1 | 手动面自洽校验 | 通过 → 继续；失败 → STOP |
| B2 | **全事件语义对账**：journal 全事件按 §3.2 推导期望 entries/finding_index，与现有手动形态做语义对账（比较域按 §7.1 归一化：路径按转换表语义键；finding 按逻辑身份对应）——一致 → 承接；不一致 → `JOURNAL_MANIFEST_MISMATCH_STOP`（两执行面事实分叉，人工处置） | 对账完成 |
| B3 | 承接：`projected_through/publish_seq` = 末事件 sequence；`source_event_ref` 保留手动形态直至该行被后续尾段更新（更新行起按 runtime 形态重写）；逻辑身份映射表持久保存 | 承接完成 |
| B4 | 重入：首尾段投影 → 逐事件 fold → no-op 确认 | 稳定 |

接管 B 的对账函数即 §7.1 的归一化比较（方向反转：journal 推导 vs 手动现存），同一实现两用。

### 8.3 接管后的常规校验适配

- 承接行（手动来源）以手动自洽校验；runtime 新增行以 store 交叉绑定校验；
- 前缀校验的 `source_event_ref` 比较在接管 A/B 后按承接形态适配（承接行保留手动形态，runtime 新增行按 runtime 形态）；
- 逻辑身份映射表持久保存于承接记录，供后续前缀校验与 findingIndex 交叉绑定使用。

## 9. 验收映射（G5-T5 引用；R3 回归矩阵逐项对应）

见 R3 报告 §4 各阻塞"回归核验"清单 + R1/R2 报告 §3 矩阵 + 本版新增：PASS→FAIL/UNKNOWN、已有产物→blocked、scan blocked 的 Ledger+output 双绑定、PASS/PWR 有 revision、FAIL 无 revision、UNKNOWN/PWR 有 revision、verdict→scan→failed、单批/分批/全量 fold 等价、普通成功→失败、D-9 暂缓及 required_depth 保持、接管 A/B 完整步骤、每面独立 self-digest、RESOLVED 跨面绑定按逻辑修复依据对应、错逻辑修订/错证据不可被泛化删除掩盖、MANUAL 空/有 journal × 一致/分叉接管后一次 tail 再 no-op。

## 10. 非阻塞建议吸收记录

S1 字段字典勘误已吸收（§1.1 实际字段名清单）。S2 上轮报告 /tmp 路径链接改为审计引用（本版 v1.1.0 头部；最终冻结时可再落 PKB 归档引用）。S3 D5 对拍的 Ruby/Psych 版本与完整 bytes 记录归 T5 fixture。S4 D6 编号勘误已订正（R2 已认可）。
