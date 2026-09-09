# G5-T1 投影语义冻结稿：journal / finding store → manifest.md 投影协议实例化

> Version: 1.0.0-candidate（SEMANTICS_FREEZE 候选——Current User / 复审确认后冻结为 G5-T2 编码依据）
> Date: 2026-09-09
> Parent: [G5 剩余计划](decision-090-g5-remaining-plan.md) v1.1.0 @ `0f8c964`（G5-T1）· Decision-090 §4/G5
> 唯一权威: [manual-runtime-semantic-contract](../../ai-sdlc/manual-runtime-semantic-contract.md) v1.0.0 §6.2（协议）、§6.2.2（三级有序判别）、§6.2.3（追平发布）、§6.2.4（投影字段映射）、§6.2.5/§6.2.6（repairRecords 与修复基线重建）、§6.2.7（BLOCKED_AMBIGUOUS）、§7.2（失败码）
> 载体裁决: Current User 2026-09-09——TS 原生实现，以真实手动发布器产物做逐场景 parity 锁定
> 本文地位: 把合同 §6.2 抽象协议**实例化**到 runtime 具体数据模型（`LoopCapabilityExecutionEvent` / `loop_findings` 行 + `LoopFindingProof` / `manifest.md` 文档形态）。本文不引入合同之外的新语义；凡与合同冲突，以合同为准并回改本文。

## 1. 数据对象与输入输出

### 1.1 输入

| 对象 | 权威 | 关键字段（runtime 实际形态） |
| --- | --- | --- |
| journal 事件序列 | `core/loop-run-store.ts`（`loop_events`，单 run 全序） | `LoopCapabilityExecutionEvent`：`sequence`（单调全序）、`executionEventId`、`nodeId`、`capability`、`status`（succeeded/blocked/failed/started/…）、`createdAt`、`outputArtifactRef/Version/Digest`、`gateResult`、`decisionDepth/decisionStatus/decisionScopeId`、`inputArtifactRef/Version/Digest` |
| finding store | `core/loop-run-store.ts`（`loop_findings` 行）+ durable 证明（`LoopFindingProof`） | 行：`finding_id/requirement_id/sequence/source_capability/source_revision_id/cause_kind/severity/category/evidence_ref/evidence_digest/earliest_affected_node_id/status/resolved_by_revision_id/resolution_evidence_ref/resolution_evidence_digest/risk_accepted_by/risk_acceptance_evidence_ref/risk_acceptance_evidence_digest/risk_accepted_scope_id/superseded_by/created_at`；证明：`resolvedByNodeId/resolvedByRevisionId`（RESOLVED）、`riskAcceptedBy`（ACCEPTED，行字段） |
| artifact store | `core/loop-artifact-store.ts`（content-addressed）+ `loop_artifact_revisions` | `outputArtifactRef` → `{artifactPath(stable), version, digest}`；revision `validity: ACTIVE/STALE/SUPERSEDED` |
| 当前 manifest.md | `library/{id}/manifest.md` | 手动面发布器产物（冻结格式见 §2） |

### 1.2 输出

`library/{id}/manifest.md`（与手动路径同 stable path、同文档结构、同 current/stale 语义、同 digest 自证）；不一致/损坏时失败码 `MANIFEST_CORRUPT_STOP` / `JOURNAL_MANIFEST_MISMATCH_STOP`；合法待投影 → 幂等追平发布。

### 1.3 不变量（全文贯穿）

- `00-需求资料/intake.manifest.json` 零触碰（合同 §6.1）。
- finding 状态迁移不触碰 entries/产物 digest（合同 §6.2.3、C15）。
- Agent 自由文本不得直写生命周期权威字段（合同 §6.2.4 尾）。
- 同输入重放产出逐字节同一 manifest（§6.2.3）。

## 2. manifest 文档格式（V2 冻结——runtime 面与手动面同构）

文档形态 = 手动发布器产物同构（标题 + self-attesting 注释 + 单一 YAML 块），字段全集：

```yaml
schema_version: '1.0'          # 冻结
requirement_id: <id>
title: <str>                   # init 时由 requirement-intake 写入；runtime 投影不改动
publish_seq: <int>             # 手动=完成声明 seq；runtime=投影批次 seq（单调递增）
projected_through: <int|MANUAL> # runtime=已投影最后一个 journal sequence；MANUAL=手动面
updated_at: <ISO-8601>
depth:                         # init 建立；verdict 裁决后由投影更新 required_depth/decision_scope
  decision_scope: FULL_REQUIREMENT|DELTA_CHANGE
  requested_depth: LIGHT|STANDARD|DEEP
  initial_depth_basis: user_requested|normalized_proposal|PROVISIONAL_STANDARD
  required_depth: LIGHT|STANDARD|DEEP
entries:                       # 每节点一行（七节点；solution-gate 行含 gate 扩展字段）
- node: <capability>
  status: current|stale        # ← revision 状态映射（§3.2）；runtime 面无 actionable
  artifact_path: <stable rel path>
  version: <semver>
  digest: <sha256>
  updated_at: <ISO-8601>
  source_event_ref: <executionEventId>   # runtime；手动=上游产物路径
  gate_result: PASS|FAIL|PASS_WITH_RISK  # 仅 solution-gate 行
  decision_depth: LIGHT|STANDARD|DEEP    # 仅 solution-gate 行
  decision_status: CONFIRMED|ESCALATED|BLOCKED_UNKNOWN  # 仅 solution-gate 行
finding_index:                 # 每 finding 恰一行（当前状态），11 字段见 §4
declaration_log:               # 手动面完成声明日志；runtime 投影不追加（进度由 projected_through 承载）
repair_records: []             # 唯一修复记录位置（§5）
manifest_digest: sha256:<hex>  # = sha256(canonical_yaml(head+depth+entries+finding_index+declaration_log+repair_records))
```

字段命名沿用发布器实际 snake_case（`publish_seq/projected_through/finding_index/repair_records/manifest_digest/source_event_ref`）——与合同 §6.2 的 camelCase 术语一一对应，映射在 §3 固定。`depth` 块、`title`、`declaration_log` 为发布器现存字段，runtime 面原样承载（§3.5/§4.4）。

## 3. 投影映射表（§6.2.4 实例化）

### 3.1 head 字段

| manifest 字段 | runtime 来源 | 规则 |
| --- | --- | --- |
| `schema_version` | 冻结 `'1.0'` | 不变 |
| `requirement_id` | identity | init 承接，不变 |
| `title` | init 承接 | runtime 投影不改动 |
| `publish_seq` | 投影批次序号 | 手动声明与 runtime 投影共享同一单调序列；runtime 每次有实变更的投影发布 +1 |
| `projected_through` | journal `sequence` | 推进到最后已投影事件；finding-only 差量发布**不推进**（§6.2.3） |
| `updated_at` | 最后已投影事件 `createdAt`（尾段发布）/ 不变（finding-only） | |

### 3.2 entries 映射（journal terminal 事件 → entry）

触发：事件 `status` ∈ 终态 {succeeded, blocked, failed} 且 `outputArtifactRef != null` 的 capability 节点（`started`/中间事件只消费进度，不产 entry）。

| entry 字段 | 来源 | 规则 |
| --- | --- | --- |
| `node` | `nodeId` | 七节点 |
| `status` | `outputArtifactRef` 所指 revision 的 `validity` | ACTIVE→`current`；STALE/SUPERSEDED→`stale`（§6.2.4 冻结映射；runtime 无 actionable） |
| `artifact_path` | artifact store 解析的 stable path | 手动同构（`0X-*/…`） |
| `version` | `outputArtifactVersion` / revision semver | |
| `digest` | `outputDigest` | 原产物 digest，状态迁移不触碰 |
| `updated_at` | 事件 `createdAt` | |
| `source_event_ref` | `executionEventId` | runtime 专属；手动=上游产物路径 |

solution-gate 行扩展：`gate_result`←`gateResult`、`decision_depth`←`decisionDepth`、`decision_status`←`decisionStatus`（仅 formal_verdict 终态事件携带）。

### 3.3 depth 块更新（verdict 裁决投影）

formal_verdict succeeded 事件投影时：`depth.required_depth`←`decisionDepth`；`depth.decision_scope`←事件 `decisionScopeId` 对应范围（DELTA_CHANGE 时）；`decision_depth`/`decision_status` 同步 entry 扩展字段。ESCALATED 回流后 solution-design 增量产物的后续投影不改 depth（等待下一次 verdict）。

### 3.4 finding_index 行映射（loop_findings 行 + 证明 → 11 字段）

| finding_index 字段 | 来源 | 说明 |
| --- | --- | --- |
| `finding_id` | `finding_id` | 身份 |
| `discovered_at` | `source_capability` | **语义 = 发现来源节点**（历史字段名；发布器 ACCEPTED 校验 `== solution-gate` 即 scan 来源判定，佐证） |
| `root_cause_category` | `category` | SOLUTION/IMPLEMENTATION/…（与发布器 register CAT 同域） |
| `earliest_affected_node_id` | `earliest_affected_node_id` | |
| `source_revision` | `source_revision_id` | |
| `evidence_ref` | `evidence_ref` | |
| `status` | `status` 投影 | OPEN→OPEN；RESOLVED→RESOLVED；**ACCEPTED_RISK→ACCEPTED**（合同投影映射）；SUPERSEDED→SUPERSEDED（runtime 面全集，边界见 §6） |
| `closed_by` | RESOLVED: 证明 `resolvedByNodeId`（关闭复验者）；ACCEPTED: `risk_accepted_by`；OPEN/SUPERSEDED: null | §6.2.2(b) 第 2 步 |
| `closure_evidence_ref` | RESOLVED: `resolution_evidence_ref`；ACCEPTED: `risk_acceptance_evidence_ref` | |
| `closure_evidence_digest` | RESOLVED: `resolution_evidence_digest`；ACCEPTED: `risk_acceptance_evidence_digest` | |
| `closure_bound_revision_id` | RESOLVED: `resolved_by_revision_id`；ACCEPTED: **null**（合同明文：runtime 接受路径无对应字段，该项不参与 runtime 映射）；OPEN: null | §6.2.2(b) 第 2 步 |

## 4. 三级有序判别（runtime 适配，顺序固定互斥）

### 4.1 第 1 级 损坏 → `MANIFEST_CORRUPT_STOP`

YAML 解析失败；或 self-digest 校验失败（复刻发布器算法：剥离 `manifest_digest` 后对剩余状态做 canonical YAML 序列化，sha256 与 claimed 比对）。canonical 序列化 = 发布器 `YAML.dump` 行为的 TS 复刻（键插入序、2 空格缩进、标量风格），以 G3 发布器全部 fixture 逐字节对拍锁定（T5）。不静默修复、不重建（DP4）。

### 4.2 第 2 级 真分叉 → `JOURNAL_MANIFEST_MISMATCH_STOP`（两项校验任一不过，不得进入第 3 级）

- **(a) journal 前缀**：对 `sequence ≤ projected_through` 的每事件按 §3.2 映射重推导 entry（含 artifact store 解析），与 manifest `entries` 逐字段比对；Gate 扩展字段与 `depth` 块一并比对。不一致即分叉（纯执行映射——finding 迁移不经过 journal 事件）。
- **(b) findingIndex 交叉验证**（对每行，有序互斥，首中即决）：
  1. **身份字段**：`finding_id/discovered_at/root_cause_category/earliest_affected_node_id/source_revision/evidence_ref` 与 finding store 行逐字段一致，否则 STOP（身份漂移不可用"领先"解释）。
  2. **状态一致 → 投影字段整行交叉绑定**：status 一致时按 §3.4 生成期望行（RESOLVED 绑定复验者/证据/revision；ACCEPTED 绑定接受者/证据，`closure_bound_revision_id` 不参与），任一投影字段漂移 → STOP。
  3. **合法落后**：索引 status=OPEN 且权威 status ∈ {RESOLVED, ACCEPTED}、后继依据有效（RESOLVED: durable 证明；ACCEPTED: scan 来源 + PWR durable 证明）、除生命周期新增字段外无其他漂移 → 列入第 3 级追平。未知权威状态值一律 STOP。

### 4.3 第 3 级 待投影 → 幂等追平

输入 = journal 尾段（`sequence > projected_through`）**∪** finding store 相对 findingIndex 的差量（合法落后行）。无尾段且无差量 → no-op 原样退出；任一存在 → 按合同 §6.2.3 发布：尾段更新 entries 与 `projected_through/publish_seq/updated_at`；finding 差量仅对齐 findingIndex，**entries/`publish_seq`/`projected_through`/`updated_at` 全部不变**；混合输入（V9）合入同一次原子发布。

## 5. 发布、repair 与失败出口

- 发布 = canonical 序列化 → self-digest 重算 → 原子 rename（临时文件同目录 rename）。崩溃后文件为旧或新均自洽（self-digest 自证），重跑即追平。
- repair 基线重建（§6.2.6 五步）：runtime 面第 ③ 步 = `projected_through` 重设当前 journal 末尾；先写 `repair_records` 再算 digest。
- 出口接线（Δ2/T3）：`MANIFEST_CORRUPT_STOP` / `JOURNAL_MANIFEST_MISMATCH_STOP` 进 runtime 运行出口（失败码面，§7.2）；无 manifest 存量目录 → `BLOCKED_AMBIGUOUS`（§6.2.7，不重建）；仅全新 requirement 由 requirement-intake 创建。
- 无自动/人工释放协议变化；隔离与 containment（R10-F4）不受本投影影响。

## 6. 边界决策记录

| # | 决策 | 依据 |
| --- | --- | --- |
| D-1 | `discovered_at` 语义 = 发现来源节点（映射 `source_capability`） | 发布器 ACCEPTED 校验 `== solution-gate`；字段名为历史遗留 |
| D-2 | ACCEPTED 行 `closure_bound_revision_id` runtime 面 = null | 合同 §6.2.2(b) 第 2 步明文"不参与 runtime 映射" |
| D-3 | finding_index status 含 SUPERSEDED（runtime 全集）；手动发布器 self-consistency 枚举差异由 parity 的"合法轨迹等价"定义吸收 | 合同 §5.1 状态机全集；正常轨迹无 SUPERSEDED |
| D-4 | runtime 投影不追加 `declaration_log`（手动完成声明载体）；等价性比较维度不含 `declaration_log`/`publish_seq`/`projected_through`（面内进度字段） | 剩余计划 §7 完成门列举维度 |
| D-5 | canonical YAML 序列化 = TS 复刻发布器 `YAML.dump` 行为，以发布器全部 fixture 逐字节对拍锁定 | 载体裁决 TS-native；parity 逐字节要求 |
| D-6 | `projected_through` 为数字（runtime）；对照表行豁免后，`SPECKIT_PIPELINE_REQUIRED`/`Development Path Decision is` 出现即红（废止声明豁免保留于 DECIDED 门） | §6.2.1；E0.4 既有规则 |

## 7. 验收映射（G5-T5 引用）

- 三级判别：损坏 / 真分叉（前缀漂移、身份漂移、投影字段漂移、非法后继）/ 合法落后（RESOLVED、ACCEPTED）各正反例；
- V9 混合发布：尾段 + finding-only 差量并存，entries 与 findingIndex 双更新同一次原子发布；
- finding-only 差量：entries/`publish_seq`/`projected_through`/`updated_at` 四不动；
- 重放确定性：同输入两次投影逐字节一致；含 repair_records 的 manifest 重放逐字节一致；
- parity：同 fixture 手动轨迹 vs runtime 轨迹按 §4/D-4 归一化等价。
