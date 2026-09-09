# G5-T1 投影语义冻结稿：journal / finding store → manifest.md 投影协议实例化

> Version: 1.1.0（R1 评审 H1–H7 修订版；SEMANTICS_FREEZE 候选——Current User / 复审确认后冻结为 G5-T2 编码依据）
> Date: 2026-09-09
> v1.0.0 → v1.1.0: 按 [G5-T1-REVIEW](/tmp/g5-t1-review/.review-tmp/G5-T1-REVIEW.md) H1–H7 全量修订（进度语义、终态映射确定性表、前缀时点归约、depth 更新规则、新登记差量、路径三层关系、parity 归一化协议）；S1 字典勘误、S2 corrections 补录、S3 D5 对拍记录、S4 D6 编号勘误已吸收。
> Parent: [G5 剩余计划](decision-090-g5-remaining-plan.md) v1.1.0 @ `0f8c964`（G5-T1）· Decision-090 §4/G5
> 唯一权威: [manual-runtime-semantic-contract](../../ai-sdlc/manual-runtime-semantic-contract.md) v1.0.0 §6.2（协议）、§6.2.2（三级有序判别）、§6.2.3（追平发布）、§6.2.4（投影字段映射）、§6.2.5/§6.2.6（repair）、§6.2.7（BLOCKED_AMBIGUOUS）、§7.2（失败码）
> 载体裁决: Current User 2026-09-09——TS 原生实现，以真实手动发布器产物做逐场景 parity 锁定
> 本文地位: 把合同 §6.2 抽象协议实例化到 runtime 具体数据模型。凡与合同冲突，以合同为准并回改本文。

## 1. 数据对象与输入输出

### 1.1 输入

| 对象 | 权威 | 关键字段（实际形态；字段字典勘误见 §7-S1） |
| --- | --- | --- |
| capability journal | `loop_capability_executions` 表（**不是** `loop_events`——两表各有独立 `(run_id, sequence)` 序列域） | `LoopCapabilityExecutionEvent` 46 字段：`sequence`（run 内单调）、`executionEventId`、`runId`、`capability`（=nodeId，J:265 强制相等）、`executionRole`（primary / adversarial_scan / formal_verdict）、`attempt`、`status`（**仅 started/succeeded/failed/blocked**）、`createdAt`、`input/outputArtifactRef/Version/Digest`、`gateResult`、`unresolvedFindingsRef/Digest`、`consumedFindingsRef/Digest`、`decisionDepth/decisionStatus/decisionScopeId/decisionDeltaRef/Digest`、`nextStepEligibility`、`errorCode/retryable/reasonCode`、binding/executor/process/staging/promotion/humanAction 字段 |
| finding store | `loop_findings`（24 列）+ durable 证明 `LoopFindingProof`（11 字段：`findingId/proofKind/revisionId/revisionNodeId/revisionArtifactRef/revisionArtifactDigest/evidenceRef/evidenceDigest/riskAcceptedBy/riskAcceptedScopeId/resolvedByNodeId`） | 行：`finding_id/sequence/source_capability/source_revision_id/cause_kind/severity/category/evidence_ref/evidence_digest/earliest_affected_node_id/status(OPEN/RESOLVED/ACCEPTED_RISK/SUPERSEDED)/resolved_by_revision_id/resolution_evidence_ref/resolution_evidence_digest/risk_accepted_by/risk_acceptance_evidence_ref/risk_acceptance_evidence_digest/risk_accepted_scope_id/superseded_by/created_at/canonical_sha256` |
| artifact store / revisions | content-addressed blob + `loop_artifact_revisions` | blob（`LoopStoredArtifact`：ref/kind/digest/sizeBytes，**无 stablePath**）；revision：`revisionId/nodeId/sequence/stablePath/semver/artifactRef/digest/producerExecutionId/producerExecutionRole/gateResult/validity(ACTIVE/STALE/SUPERSEDED)/supersededBy/createdAt` |
| 当前 manifest.md | `library/{id}/manifest.md` | 手动发布器产物（§2 冻结格式；`corrections` 顶层键说明见 §7-S2） |

读取纪律：finding/journal/revision 一律经**现役已验证读接口**（不直读 SQLite 绕过 schema/hash/身份校验）。

### 1.2 输出与不变量

`library/{id}/manifest.md`；失败码 `MANIFEST_CORRUPT_STOP` / `JOURNAL_MANIFEST_MISMATCH_STOP`；合法待投影 → 幂等追平；无 manifest 存量目录 → `BLOCKED_AMBIGUOUS`。
不变量：intake.manifest.json 零触碰；finding 状态迁移不触碰 entries/产物 digest；同输入重放逐字节同一 manifest。

## 2. manifest 文档格式（冻结）

文档 = 标题行 + self-attesting 注释 + 单一 YAML 块。YAML 顶层键全集（发布器实际形态，**含 repair 后的 `corrections`**）：

```yaml
schema_version: '1.0'
requirement_id: <id>
title: <str>                    # init 由 requirement-intake 写入；投影不改动
publish_seq: <int>              # = projected_through（runtime）；手动=声明 seq（§3.1）
projected_through: <int|MANUAL> # runtime=最后已投影 capability 事件 sequence；手动=MANUAL
updated_at: <ISO-8601 引号字符串>
depth: {decision_scope, requested_depth, initial_depth_basis, required_depth}
entries:                        # 七节点各一行；init 形态 status=pending + 五 null 字段
- node: <capability>
  status: pending|current|stale
  artifact_path: <rel path|null>
  version: <semver|null>
  digest: <sha256|null>
  updated_at: <ISO-8601|null>
  source_event_ref: <str|null>  # runtime=executionEventId；手动=上游产物路径；init=null
  gate_result: PASS|FAIL|PASS_WITH_RISK|null   # 仅 solution-gate 行
  decision_depth: LIGHT|STANDARD|DEEP|null     # 仅 solution-gate 行；BLOCKED_UNKNOWN 合法 null
  decision_status: CONFIRMED|ESCALATED|BLOCKED_UNKNOWN|null  # 仅 solution-gate 行
  execution: {status: succeeded|blocked|failed, error_code: <str|null>, reason_code: <str|null>, execution_event_ref: <id>}  # 仅 runtime 面；执行事实兼容承载（§3.2），手动面无此键
finding_index:                  # 每 finding 恰一行，11 字段（§3.4）
declaration_log:                # 手动完成声明日志 {seq,kind,input_digest}；runtime 投影不追加（D-4）
corrections:                    # 发布器 repair 后的更正登记（发布器既有行为，§7-S2）；投影保留原样
repair_records: []
manifest_digest: 'sha256:<hex>' # = sha256(YAML.dump(剥离 manifest_digest 后的完整状态))
```

init 形态（发布器 P:220–232）：七节点 pending 行 + depth 块 + 空索引/日志/修复记录。

## 3. 投影映射表

### 3.1 head 进度（H1 修正）

| 字段 | runtime 规则 |
| --- | --- |
| `projected_through` | **= 已处理的最后 capability 事件 `sequence`**（消费域 = `loop_capability_executions`，同 run 绑定——不是 `loop_events`）。finding-only 差量发布不推进。 |
| `publish_seq` | **= `projected_through`**（同一序列域同步推进；合同 §6.2.3 第 1 项"均推进到已处理末事件"）。finding-only 差量发布两者均不动。 |
| 超前游标 | `projected_through` > 该 run 实际最大事件 sequence，或指向不存在事件 → `JOURNAL_MANIFEST_MISMATCH_STOP`（游标锚点失效，不是"无尾段 no-op"）。 |
| MANUAL 接管基线（确定性） | 首次 runtime 投影遇 `projected_through: MANUAL`：(i) 手动面自洽校验（self-digest + 一致性）通过；(ii) 若 journal 无 capability 事件 → `projected_through/publish_seq = 0`，现有 entries 作为承接基线；(iii) 若 journal 有事件 → 对**全部事件**按 §3.2 推导期望 entries，与现有 entries 做语义对账（节点集合、每节点产物 digest/版本一致，路径按 H6 归一化函数比较）——一致 → `projected_through = 末事件 sequence` 基线承接；不一致 → `JOURNAL_MANIFEST_MISMATCH_STOP`（两执行面对同一 requirement 的事实分叉，人工处置）。 |

### 3.2 entries 映射（H2 修正：executionRole × status × revision 存在性 确定性归约表）

归约单位 = **节点**：每节点取其 `sequence` 最大的终态事件为该节点当前行驱动；更早事件只参与前缀校验（§4.2(a)）。

| 执行角色 | 事件 status | 附加条件 | entry 行为 |
| --- | --- | --- | --- |
| primary（六节点） | succeeded | revision 已物化 | `status` ← revision validity（current/stale）；产物五字段按 revision 填充；`execution: {succeeded}`；`source_event_ref` ← executionEventId |
| primary | succeeded | revision 未物化（未来分支，现役不产生） | 冻结为 fail-closed：`JOURNAL_MANIFEST_MISMATCH_STOP`（不得伪造 revision） |
| primary | blocked | —（blocked 必有 output：J:496） | `entry.status` 保持原值（pending/current）；`execution: {blocked}`；产物引用 = blocked 报告实际路径（gateway 持久化的 first-class 产物）；不产 revision、不改产物字段 |
| primary | failed | —（failed 无输出：J:514） | `entry.status` 保持原值；`execution: {failed, error_code/reason_code}`；无产物字段变更 |
| adversarial_scan | succeeded / blocked | —（Ledger 由 gateway 持久化为 first-class 产物） | **不产/不改 solution-gate entry**（Ledger 不冒充正式 Gate——复审 H2 规则）；仅推进 `projected_through`；`finding_index` 按扫描登记差量对齐 |
| formal_verdict | succeeded (PASS/PWR) | revision 已物化 | solution-gate entry ← revision（current）；扩展三字段 ← 事件；`execution: {succeeded}` |
| formal_verdict | succeeded (FAIL / BLOCKED_UNKNOWN) | 不物化 revision（runtime:270–278） | solution-gate entry `status` 保持（pending/current）；扩展字段 ← 事件（gate_result=FAIL / decision_status=BLOCKED_UNKNOWN + `decision_depth: null` 合法）；`execution: {succeeded}` |
| formal_verdict | blocked | 现役 validator 禁止（J:509） | 不存在此分支；出现即数据损坏（第 1/2 级路径） |

`execution` 对象为 runtime 面专属兼容承载（手动面无此键，发布器容忍多余键）；它承载 C:174 要求的执行完成/失败事实，与 `entry.status`（revision 生命周期映射）**分离，不混用**。

### 3.3 depth 块更新（H4 修正）

| verdict 结果 | `depth.required_depth` | entry `decision_depth` |
| --- | --- | --- |
| CONFIRMED | **保留既有值**（无害降持/持守；不覆写） | ← `decisionDepth`（可低于 required） |
| ESCALATED | ← `decisionDepth`（唯一升档更新来源） | ← `decisionDepth` |
| BLOCKED_UNKNOWN | **保留既有值** | **null**（合法；J:357–360 强制 null，missing 不算 null） |

`depth.decision_scope`：由 requirement-intake 的 init/变更分类承接（FULL_REQUIREMENT/DELTA_CHANGE），不从 `decisionScopeId`（轮次身份 ID）猜测枚举。

### 3.4 finding_index 行映射（11 字段，v1.1.0 勘误后）

| 字段 | 来源 | 勘误/佐证 |
| --- | --- | --- |
| `finding_id` | `finding_id` | |
| `discovered_at` | `source_capability` | D1（语义=发现来源节点；发布器 ACCEPTED 校验佐证） |
| `root_cause_category` | `category` | |
| `earliest_affected_node_id` | `earliest_affected_node_id` | |
| `source_revision` | `source_revision_id` | |
| `evidence_ref` | `evidence_ref` | |
| `status` | `OPEN→OPEN`；`RESOLVED→RESOLVED`；`ACCEPTED_RISK→ACCEPTED`；`SUPERSEDED→SUPERSEDED`（D3） | 未知值 STOP |
| `closed_by` | RESOLVED: proof.**`resolvedByNodeId`**（关闭复验节点——proof 实际字段；解决 revision 的字段名为 `revisionId`，勘误 S1）；ACCEPTED: `risk_accepted_by` | |
| `closure_evidence_ref` | RESOLVED: `resolution_evidence_ref`；ACCEPTED: `risk_acceptance_evidence_ref` | |
| `closure_evidence_digest` | RESOLVED: `resolution_evidence_digest`；ACCEPTED: `risk_acceptance_evidence_digest` | |
| `closure_bound_revision_id` | RESOLVED: `resolved_by_revision_id`；ACCEPTED: **null**（D2，合同明文）；OPEN/SUPERSEDED: null | |

## 4. 三级有序判别（H3/H5 修正）

### 4.1 第 1 级 损坏 → `MANIFEST_CORRUPT_STOP`

YAML 解析失败；self-digest 校验失败（canonical 序列化 = 发布器 `YAML.dump` 行为的 TS 复刻，D-5，G3 fixtures 逐字节对拍锁定）。不静默修复、不重建。

### 4.2 第 2 级 真分叉 → `JOURNAL_MANIFEST_MISMATCH_STOP`

- **(a) journal 前缀（H3 修正：时点归约）**：对每节点取 `producer 事件 sequence ≤ projected_through` 的**最大 sequence revision** 为该节点前缀末有效 revision；其前缀状态推导 = 若存在同节点、producer 事件序更小、revision 序更大的替换者且替换者事件也在前缀内 → SUPERSEDED/STALE，否则 ACTIVE。按 §3.2 推导期望 entry 并与 manifest entries 逐字段比对。**尾段（> projected_through）事件引起的替换/STALE 不参与前缀状态计算**——那是合法未发布尾段，属第 3 级追平。前缀校验先行完成，之后才发布尾段。同内容多 revision 共享 artifactRef 时按 revision 联合绑定（node/producer/版本）消歧，不以 outputArtifactRef 反查。
- **(b) findingIndex 交叉验证**（三步有序互斥，对 store 每一 finding）：
  1. 身份六字段逐字段一致，否则 STOP；
  2. status 一致 → 按 §3.4 生成期望行逐字段比对（RESOLVED/ACCEPTED 生命周期字段），漂移 → STOP；
  3. 合法落后（索引 OPEN、权威 RESOLVED/ACCEPTED_RISK、依据有效、无其他漂移）→ 列入第 3 级；未知/反向/无依据 → STOP。
- **(c) 集合完整性（H5 补分支）**：store 身份集 vs 索引身份集——store 有、索引无 → **新登记差量**（第 3 级输入）；索引有、store 无（无 SUPERSEDED 依据）或重复 ID → STOP。

### 4.3 第 3 级 待投影 → 幂等追平

输入 = journal 尾段（`sequence > projected_through`）∪ **新登记行**（store 有索引无：OPEN 行，或首次投影前已 RESOLVED/ACCEPTED 的行——带完整生命周期字段插入）∪ 合法落后迁移。无尾段且无新登记且无迁移 → no-op 原样退出。按合同 §6.2.3：尾段更新 entries 与进度；新登记/迁移仅对齐 findingIndex（四不动）；V9 混合同一次原子发布。

## 5. 发布、repair 与失败出口

发布 = canonical 序列化（D-5）→ self-digest 重算 → 原子 rename；崩溃后旧/新均自洽。repair 基线重建五步照 §6.2.6（runtime 面第 ③ 步 = projected_through 重设 journal 末 capability 事件序号）；`corrections`/`repair_records` 按发布器既有形态保留。失败出口 `MANIFEST_CORRUPT_STOP` / `JOURNAL_MANIFEST_MISMATCH_STOP` / `BLOCKED_AMBIGUOUS` 进 runtime 运行出口（§7.2）。

## 6. 边界决策记录

| # | 决策 | 依据/状态 |
| --- | --- | --- |
| D-1 | `discovered_at` = 发现来源节点（source_capability） | 复审认可 |
| D-2 | ACCEPTED 行 `closure_bound_revision_id` runtime 面 null | 复审认可；parity 归一化承接（H7） |
| D-3 | finding_index 含 SUPERSEDED（runtime 全集） | 复审认可；发布器 self-consistency 枚举差异由合法轨迹等价吸收 |
| D-4 | `declaration_log`/`publish_seq`/`projected_through` 不参与 parity 等价维度（面内进度） | 复审认可；H1 修正后 publish_seq 语义 = 末事件序号 |
| D-5 | canonical YAML = TS 复刻发布器 `YAML.dump`；G3 fixtures 逐字节对拍 | 复审认可；对拍记录按 S3 补版本与字节 |
| D-6 | （勘误）task-planning/implementation checklist 措辞移除退役术语字样（E0.4 active-context） | v1.0.0 的 D6 内容编号错位，本版更正 |
| D-7 | **路径三层关系**：①blob/ref（content-addressed，无路径）；②revision.stablePath（runtime 物化实际路径 = `library/{id}/{中文目录段}/{id}_{capability}.md`，英文基名）；③library canonical path（手动约定中文名，§3 stable path 表）。**投影 entry.artifact_path = revision.stablePath 实际值**（诚实绑定：路径上文件存在且 digest 匹配才可投影为 current）；中文 canonical 与英文物化基名的差异为面间归一化项（§8 H7 表）。**物化命名对齐 canonical 属实施面调整，显式提请下一轮复审确认**（超出 remaining plan §4 原列文件面） | R1-H6 修正边界要求显式说明 |
| D-8 | `execution` 兼容承载对象（runtime 面专属；手动面无此键） | C:174 执行事实/生命周期分离 |

## 7. 非阻塞建议吸收记录

S1 字典勘误已吸收（§1.1/§3.4：outputDigest/inputDigest 实际名、proof.revisionId、executionRole/attempt 关键输入、§引用对齐实际小节）。S2 `corrections` 顶层键补录（§2；投影保留原样、不重复实现发布器 repair 行为）。S3 D5 对拍记录（T5 fixture 记录 Ruby/Psych 版本与完整 bytes，含中文/冒号/多行/时间/null/空数组/repair 样式）。S4 D6 编号勘误（§6）。

## 8. 验收映射（G5-T5 引用；复审回归矩阵逐项对应）

见 R1 报告 §3 回归矩阵 + 本版新增：MANUAL 接管（journal 空/有事件 × 对账一致/分叉）、超前游标、仅 started 尾段、blocked/failed/scan/FAIL-verdict entry 形态、新登记（空索引/跨来源/首投影前已关闭/同批并存/与尾段并存）、集合异常（索引多出/重复）、ACTIVE→SUPERSEDED 尾段、finding 致 STALE 尾段、Re-Gate 多轮、共享 ref 消歧、前缀真篡改仍 STOP。推演无法覆盖的语义（crash 时序 durability）标注人工核验边界。
