# G5-T1 投影语义冻结稿：journal / finding store → manifest.md 投影协议实例化

> Version: 1.2.0（R2 评审 R2-H2/H3/H5/H6 修订版；SEMANTICS_FREEZE 候选——Current User / 复审确认后冻结为 G5-T2 编码依据）
> Date: 2026-09-09
> v1.1.0 → v1.2.0: 按 [G5-T1-REVIEW-R2](/tmp/g5-t1-review-r2/.review-tmp/G5-T1-REVIEW-R2.md) 修订——R2-H2 终态归约改逐事件 fold 全函数（产物状态与执行事实双槽位，覆盖三角色×终态×Gate/decision×revision 全组合与 pending 物化前置）；R2-H3 前缀归约改时点语义（producer 事件序时钟 + finding invalidation 边时点，尾段/无替换 STALE 不再误判）；R2-H5 第 2 级重排（集合完整性先行、共有行三步、新行独立入第 3 级）；R2-H6 parity 归一化协议表落库（§7）并固定 MANUAL 接管完整步骤（§8）。S1 字典勘误吸收。
> v1.0.0 → v1.1.0: R1 评审 H1/H2/H4/H5/H6/H7 修订（进度语义、discovered_at 语义、ACCEPTED bound null、BLOCKED_UNKNOWN null、execution 兼容承载、三层路径关系）。
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
| artifact store / revisions | content-addressed blob + `loop_artifact_revisions` | blob（ref/kind/digest/sizeBytes，**无 stablePath**）；revision：`revisionId/nodeId/sequence/stablePath/semver/artifactRef/digest/producerExecutionId/producerExecutionRole/gateResult/validity/supersededBy/upstreamRevisionIds/createdAt` |
| finding invalidation 边 | `appendFinding` 同事务写入的失效证据（指向被 STALE 的 revision） | 时点 = 该 finding 的来源 terminal 事件 `sequence`（R2-H3 时钟输入） |
| recovery 状态 | `recovery.pendingRevisionMaterialization` | 投影调用前置（§3.2 前置条件） |
| 当前 manifest.md | `library/{id}/manifest.md` | 手动发布器产物（§2 冻结格式） |

读取纪律：finding/journal/revision 一律经**现役已验证读接口**（不直读 SQLite 绕过 schema/hash/身份校验）。

### 1.2 输出与不变量

`library/{id}/manifest.md`；失败码 `MANIFEST_CORRUPT_STOP` / `JOURNAL_MANIFEST_MISMATCH_STOP`；合法待投影 → 幂等追平；无 manifest 存量目录 → `BLOCKED_AMBIGUOUS`。
不变量：intake.manifest.json 零触碰；finding 状态迁移不触碰 entries/产物 digest；同输入重放逐字节同一 manifest。

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
  status: pending|current|stale
  artifact_path: <rel path|null>
  version: <semver|null>
  digest: <sha256|null>
  updated_at: <ISO-8601|null>
  source_event_ref: <str|null>  # runtime=executionEventId；手动=上游产物路径；init=null
  gate_result: PASS|FAIL|PASS_WITH_RISK|null   # 仅 solution-gate 行
  decision_depth: LIGHT|STANDARD|DEEP|null     # 仅 solution-gate 行；BLOCKED_UNKNOWN 合法 null
  decision_status: CONFIRMED|ESCALATED|BLOCKED_UNKNOWN|null  # 仅 solution-gate 行
  execution: {status: succeeded|blocked|failed, error_code: <str|null>, reason_code: <str|null>, execution_event_ref: <id>, ledger_ref: <str|null>, ledger_digest: <sha256|null>, blocked_report_ref: <str|null>, blocked_report_digest: <sha256|null>}  # 仅 runtime 面投影追加的执行事实承载（D-8）；手动面无此键
finding_index:                  # 每 finding 恰一行，11 字段（§3.4）
declaration_log:                # 手动完成声明日志 {seq,kind,input_digest}；runtime 投影不追加（D-4）
corrections:                    # 发布器 repair 后的更正登记（发布器既有行为）；投影保留原样
repair_records: []
manifest_digest: 'sha256:<hex>' # = sha256(YAML.dump(剥离 manifest_digest 后的完整状态))
```

init 形态（发布器 P:220–232）：七节点 pending 行 + depth 块 + 空索引/日志/修复记录。

## 3. 投影映射表

### 3.1 head 进度（H1 修正，保持）

| 字段 | runtime 规则 |
| --- | --- |
| `projected_through` | **= 已处理的最后 capability 事件 `sequence`**（消费域 = `loop_capability_executions`，同 run 绑定；不是 `loop_events`）。finding-only 差量发布不推进。 |
| `publish_seq` | **= `projected_through`**（同域同步；合同 §6.2.3 第 1 项"均推进到已处理末事件"）。finding-only 差量发布两者均不动。 |
| 超前/失效游标 | `projected_through` > 该 run 实际最大 capability 事件 `sequence`，或游标处无对应事件 → `JOURNAL_MANIFEST_MISMATCH_STOP`（游标锚点失效，不是"无尾段 no-op"）。 |
| MANUAL 接管基线（确定性） | 见 §8（完整步骤：对账一致承接 / 分叉 STOP / 空 journal 承接为 0）。 |

### 3.2 entries：逐事件 fold 全函数（H2 修正）

**前置条件（pending materialization）**：投影调用前，`recovery.pendingRevisionMaterialization` 必须为 null（runtime recovery 的补账循环先把"terminal 已提交、revision 未落盘"的合法窗口物化完毕）。pending 非空时投影器**不发布**，返回暂缓（由调用方先跑 recovery）——不得把该合法窗口判为分叉或自行物化。

**fold 全函数**：对每节点，取其 capability 事件按 `sequence` 升序的**终态**子序列（started 不参与槽位更新，只计入进度），从该节点 init 状态（pending + 五 null 字段）出发逐事件归约，维护两个独立槽位：

- **产物槽**（`status/artifact_path/version/digest/updated_at/source_event_ref` + solution-gate 三扩展字段）：仅由"产生 revision 的 succeeded 终态"更新（status ← revision validity 映射）。
- **执行事实槽**（`execution` 对象，D-8）：由**每个终态事件**更新，承载 C:174 要求的执行完成/失败事实（与产物生命周期状态分离，不混用）。

逐事件规则（角色 × status 全组合；现役 validator 合法组合）：

| 事件 | 产物槽 | 执行事实槽 |
| --- | --- | --- |
| primary / formal_verdict succeeded，revision 已物化 | status ← revision validity（current/stale）；产物四字段 ← revision（§3.2）；solution-gate 行扩展三字段 ← 事件 | `{status: succeeded, execution_event_ref}` |
| formal_verdict succeeded (FAIL/BLOCKED_UNKNOWN)，不物化 revision | **保持不变**（含 pending 初值） | `{status: succeeded, gate_result, decision_status, decision_depth(UNKNOWN=null), execution_event_ref}` |
| adversarial_scan succeeded / blocked | **保持不变**（Ledger 不入 entries，不冒充正式 Gate） | `{status: <st>, ledger_ref ← unresolvedFindingsRef, ledger_digest ← unresolvedFindingsDigest, execution_event_ref}`（Ledger 绑定承载） |
| primary blocked | **保持不变** | `{status: blocked, blocked_report_ref ← outputArtifactRef, blocked_report_digest ← outputDigest, execution_event_ref}`（blocked 报告为 first-class 产物，J:496） |
| 任何角色 failed | **保持不变** | `{status: failed, error_code ← errorCode, reason_code ← reasonCode, execution_event_ref}`（failed 无输出，J:514） |
| formal_verdict blocked | 现役禁止（J:509） | 数据出现 = 损坏，走停止路径（不产 execution） |

批次无关性：fold 逐步确定性、槽位覆盖式更新，单批/分批/从基线全量 fold 结果相同（R2-H2 反例的批次依赖消除）。

`entry.status` 合法值全程 = `pending | current | stale`；`execution.status` 合法值 = `succeeded | blocked | failed`。两枚举分离，不混用（C:174）。

solution-gate 行的 scan/verdict 双角色归约：每节点（solution-gate）只有一行 entry；adversarial_scan 事件只写执行事实槽（Ledger 绑定）；formal_verdict 的 PASS/PWR 事件更新产物槽与三扩展字段。执行事实槽保存**最后一次**终态的事实；scan 与 verdict 两角色的轨迹证据由 journal（bindingId/Version、executorAgent、gateResult）承载，manifest 不重复（§7 轨迹证据来源）。

### 3.3 depth 块更新（H4 CLOSED，保持）

| verdict 结果 | `depth.required_depth` | entry `decision_depth` |
| --- | --- | --- |
| CONFIRMED | **保留既有值**（无害降持/持守） | ← `decisionDepth`（可低于 required） |
| ESCALATED | ← `decisionDepth`（唯一升档更新来源） | ← `decisionDepth` |
| BLOCKED_UNKNOWN | **保留既有值** | **null**（合法；J:357–360） |

`depth.decision_scope`：由 requirement-intake 的 init/变更分类承接，不从 `decisionScopeId`（轮次身份 ID）猜测枚举。

### 3.4 finding_index 行映射（11 字段，v1.1.0 勘误后保持）

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

## 4. 三级有序判别（R2-H3/H5 修正，顺序固定互斥）

### 4.1 第 1 级 损坏 → `MANIFEST_CORRUPT_STOP`

YAML 解析失败；self-digest 校验失败（canonical 序列化 = 发布器 `YAML.dump` 行为的 TS 复刻，D-5，G3 fixtures 逐字节对拍锁定）。不静默修复、不重建。

### 4.2 第 2 级 真分叉 → `JOURNAL_MANIFEST_MISMATCH_STOP`

**第 2 级输入选择（R2-H5 重排）**：先建立身份集合，再做逐行检查；新登记行**不在**本级别 STOP。

- (i) 对 finding store 逐行建立身份集 `SI`（`finding_id` 集合；store 内重复 `finding_id` → 数据损坏，走停止路径）。
- (ii) 对 findingIndex 逐行建立身份集 `IM`；索引内重复 `finding_id` → `MANIFEST_CORRUPT_STOP`。
- (iii) `IM − SI`（索引多出行，且无 SUPERSEDED/权威依据可循）→ `JOURNAL_MANIFEST_MISMATCH_STOP`（索引 fantom 行；有权威行佐证的例外见 §4.2(b) 第 3 步合法落后）。

**第 2 级逐行检查仅作用于 `SI ∩ IM` 的共有行**（三步有序互斥，首中即决）：

1. **身份字段**：`finding_id/discovered_at/root_cause_category/earliest_affected_node_id/source_revision/evidence_ref` 与 store 行逐字段一致，否则 STOP。
2. **状态一致 → 投影字段整行交叉绑定**：status 一致时按 §3.4 生成期望行逐字段比对（RESOLVED 绑定复验者/证据/revision；ACCEPTED 绑定接受者/证据，`closure_bound_revision_id` 不参与），漂移 → STOP。
3. **合法落后**：索引 OPEN、权威 RESOLVED/ACCEPTED_RISK、依据有效、除生命周期新增字段外无其他漂移 → 列入第 3 级追平。未知/反向/无依据 → STOP。

### 4.3 第 3 级 待投影 → 幂等追平

输入 = **journal 尾段**（`sequence > projected_through`）∪ **新登记行**（`SI − IM`：按 §3.4 映射生成行——OPEN 行直接插入；首投影前已 RESOLVED/ACCEPTED 的行按 §3.4 带完整生命周期字段插入）∪ **合法落后迁移**（§4.2 第 3 步命中行）。三者无任何存在 → no-op 原样退出；任一存在 → 按 §6.2.3 发布：尾段更新 entries 与 `projected_through/publish_seq/updated_at`；新登记/迁移仅对齐 findingIndex（entries 四不动）；混合输入合入同一次原子发布（V9）。

## 5. 发布、repair 与失败出口

发布 = canonical 序列化（D-5）→ self-digest 重算 → 原子 rename；崩溃后旧/新均自洽。repair 基线重建五步照 §6.2.6（runtime 面第 ③ 步 = projected_through 重设 journal 末 capability 事件序号）；`corrections`/`repair_records` 按发布器既有形态保留。失败出口 `MANIFEST_CORRUPT_STOP` / `JOURNAL_MANIFEST_MISMATCH_STOP` / `BLOCKED_AMBIGUOUS` 进 runtime 运行出口（§7.2）。

## 6. 边界决策记录

| # | 决策 | 依据/状态 |
| --- | --- | --- |
| D-1 | `discovered_at` = 发现来源节点（source_capability） | R1/R2 复审认可 |
| D-2 | ACCEPTED 行 `closure_bound_revision_id` runtime 面 null；parity 状态限定仅 ACCEPTED，RESOLVED 不豁免 | R1/R2 复审认可；H7 表承接 |
| D-3 | finding_index 含 SUPERSEDED（runtime 全集） | R1/R2 复审认可；发布器 self-consistency 枚举差异由合法轨迹等价吸收 |
| D-4 | `declaration_log`/`publish_seq`/`projected_through` 不参与 parity 等价维度（面内进度） | R1/R2 复审认可；H1 修正后 publish_seq 语义 = 末事件序号 |
| D-5 | canonical YAML 序列化 = TS 复刻发布器 `YAML.dump` 行为，以发布器全部 fixture 逐字节对拍锁定（版本/bytes 记录归 T5） | R1/R2 复审认可 |
| D-6 | task-planning/implementation SKILL 的 checklist 措辞移除退役术语字样（E0.4 active-context 规则） | R2 复审认可更正（v1.1.0 曾编号错位，已订正） |
| D-7 | 路径三层关系（blob/ref / revision.stablePath / library canonical）与七节点转换表；**canonical-vs-materialized 命名对齐显式声明为实施面调整、提请下一轮复审** | R1-H6 修正边界；R2 认可方向、细则落库于本轮 §7 |
| D-8 | `execution` 兼容承载对象（runtime 面专属；手动面无此键） | R2 认可选定方向；具体映射本轮 §3.2 闭合 |
| D-9 | 投影调用前置：`recovery.pendingRevisionMaterialization == null`（合法物化窗口先由 recovery 补账，projector 不对窗口内形态自行发明 entry） | R2-H2 修正边界要求"固定 pending materialization 的调用前置/暂缓策略" |

## 7. parity 归一化协议表（R2-H6 落库）

**两种断言分离**：断言 A = runtime 面内同输入重放逐字节一致（§3.2 fold + §5 seal 的确定性）；断言 B = 同 fixture 手动轨迹与 runtime 轨迹的**语义等价**（跨面，按本表归一化后比较；两执行面 ID/路径/时间字面值必然不同，不做字面比较）。

### 7.1 比较域与归一化规则（逐字段）

| 字段/维度 | runtime 面值 | 手动面值 | 归一化比较 |
| --- | --- | --- | --- |
| `entries.node` | nodeId（=capability） | node | 字面相等 |
| `entries.artifact_path` | revision.stablePath 去 `library/{id}/` 前缀 | 手动相对路径（中文基名） | **语义键 = (目录段, capability)**（七节点转换表）；基名差异（英文/中文）按 D-7 面间映射豁免字面比较，但每面各自要求路径上产物文件存在且 digest 匹配 |
| `entries.version` | revision semver（attempt.0.0） | 声明 semver | 字面比较 |
| `entries.digest` | outputDigest | 声明 digest | 字面比较（64 hex） |
| `entries.status` | revision validity 映射（current/stale；pending 为 init 态） | current/stale/pending | 字面比较 |
| `entries.updated_at` | 事件 createdAt | 声明确认时刻 | 面内单调；跨面不比较（时钟不同） |
| `entries.source_event_ref` | executionEventId | 上游产物路径 | **面内字段，不跨面比较**（D-4 同族）；每面各自自洽 |
| solution-gate 三扩展 | gateResult/decisionDepth/decisionStatus | 同名 | 字面比较 |
| `entries.execution` | runtime 专属 | 手动无 | 不跨面比较；runtime 面按 §3.2 自洽 |
| `finding_index` 11 字段 | store 行+proof（§3.4） | 手动声明行（P:451–459/503–508 形态） | 逐字段**语义对应**比较；`finding_id` 跨面按逻辑身份对应函数（同一逻辑 finding 两面各自 ID，轨迹等价断言内建立映射）；`source_revision`/`evidence_ref` 面内绑定自洽即可 |
| `finding_index.status` | OPEN/RESOLVED/ACCEPTED/SUPERSEDED | OPEN/RESOLVED/ACCEPTED | SUPERSEDED 仅 runtime（D-3）；共同合法轨迹（无 supersede）字面等价 |
| `closure_bound_revision_id` | RESOLVED=resolved_by_revision_id；ACCEPTED=null（D-2） | RESOLVED=修复依据；ACCEPTED=PWR 裁决 revision | **状态限定**：RESOLVED 字面比较；ACCEPTED runtime null ↔ 手动非空为既定差异，parity 记录为 D-2 差异而非缺陷 |
| `depth` 四字段 | verdict 投影 + init | init/ESCALATED 更新 | 字面比较（H4 12 组合对拍口径） |
| `publish_seq`/`projected_through`/`declaration_log` | runtime 进度 | 手动进度 | **不参与比较**（D-4） |
| self-digest | 每面独立：canonical YAML → sha256 | 同 | 各面独立断言；跨面 digest 不比较 |
| 双角色/eligibility/reroute 轨迹证据 | journal：bindingId/Version、executorAgent、gateResult、decision*、nextStepEligibility、earliest_affected_node 路由 | Gate Result 文件、方案修订版本、路由登记 | parity 的轨迹断言从 journal 取证（两 binding 分离、深度档位、eligibility、earliest 节点），不要求 manifest 承载 |

### 7.2 parity 断言失败的处理

任何归一化后不等 → 映射表或投影器缺陷，按 §9 复审收敛；**不得**通过删除字段、泛化豁免或自制 normalizer 掩盖。

## 8. MANUAL 接管完整步骤（H1/H6 闭合）

**接管 A（journal 无 capability 事件）**：
1. 手动面自洽校验（self-digest + 一致性）通过；
2. `projected_through = 0`、`publish_seq = 0`；entries/finding_index/depth 原样承接（手动字段保留，`execution` 键不出现）；
3. 重入：首投影（新事件）→ 逐事件 fold（execution 键按 §3.2 出现）→ no-op 确认。

**接管 B（journal 有 capability 事件）**：
1. 手动面自洽校验通过；
2. **全事件语义对账**：journal 全事件按 §3.2 推导期望 entries/finding_index，与现有手动形态做语义对账（比较域按 §7.1 归一化：路径按转换表语义键；finding 按逻辑身份对应）——一致 → 承接；不一致 → `JOURNAL_MANIFEST_MISMATCH_STOP`（两执行面事实分叉，人工处置）；
3. 承接：`projected_through/publish_seq` = 末事件 sequence；`source_event_ref` 保留手动形态直至该行被后续尾段更新（更新行起按 runtime 形态重写）；
4. 重入：首尾段投影 → 逐事件 fold → no-op 确认。

接管 B 的对账函数即 §7.1 的归一化比较（方向反转：journal 推导 vs 手动现存），同一实现两用。

## 9. 验收映射（G5-T5 引用；R2 回归矩阵逐项对应）

见 R2 报告 §4 各阻塞"回归核验"清单 + R1 报告 §3 矩阵 + 本版新增：单批/分批/全量 fold 等价、pending→成功→失败、已有产物→blocked、verdict→scan、scan/verdict 各自失败、FAIL/UNKNOWN/ESCALATED/PWR 组合、合法未物化恢复窗口、真正缺 revision、空索引+新 OPEN、共有行+跨来源新行、首投影前已关闭/接受、同批登记并迁移、尾段+新登记、重复/多出/身份漂移、ACTIVE→SUPERSEDED 尾段、finding 致 STALE 尾段、Re-Gate 多轮、诚实 stale 通过、重算 hash 篡改 STOP、重复追平不变、接管 A/B 完整步骤。

## 10. 非阻塞建议吸收记录

S1 字段字典勘误已吸收（§1.1 实际字段名清单；`inputDigest/outputDigest` 等全名引用）。S2 上轮报告 /tmp 路径链接改为审计引用（本版 v1.1.0 头部；最终冻结时可再落 PKB 归档引用）。S3 D5 对拍的 Ruby/Psych 版本与完整 bytes 记录归 T5 fixture（本版 §6/D-5 已标注）。S4 D6 编号勘误已订正（R2 已认可）。
