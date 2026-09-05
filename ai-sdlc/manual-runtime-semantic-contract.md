# Manual/Runtime Semantic Contract（手动与 runtime 共同语义合同）

> Version: 0.8.0 (PROPOSED)
> Status: 待独立只读复审 + Current User 裁决冻结；冻结后为 G3（手动主路径修复）与 G5（runtime 投影/parity）的唯一语义权威
> 上游: Decision-090 及其[冻结执行计划](../docs/reports/decision-090-c03e-prerun-governance-plan.md) §4/G2 · [需求拆分 v1.0.0](../docs/reports/decision-090-c03e-prerun-requirement-decomposition.md) §4（DP1–DP5）· Decision-084/086 · [v3 规格 v1.1.0](../docs/reports/d088-01-v3-behavior-spec.md)
> 修订: v0.4.0 按 G2-R3-H1/H2/H3/M1 全量修订——深度触发枚举单一化，complexity-routing 引用本合同不再自维护清单（H1）；finding 登记与发现节点解耦、复用现役类别×来源矩阵，全组合合法（H2）；manifest 增加 `projectedThrough` 投影基线，区分合法待投影/真分叉/损坏，重放幂等规则固定（H3）；恢复完整 C1–C20 与 N1–N9 表、更正残留引用（M1）。

## 1. 定位与权威关系

1. 本合同是**七节点流程语义的唯一权威**：节点顺序、输入输出、稳定路径、深度语义、Finding/Ledger/Gate 生命周期、manifest 职责、发布协议、失败码、回流与准入。手动 Skill prompt 与 LOOP runtime 代码消费同一份合同；实现机制可以不同，**语义必须等价**。
2. 冲突时本合同优先于：各 `skills/sdlc-*/SKILL.md` 的流程性条款、`execution/gateway.ts` 等运行时代码、以及 §10 同步清单中标注"替代"的既有合同条款。未标注替代的内容性条款（如 artifact-flow 的产物内容要求、Skill 的领域指令）继续有效。
3. 本合同**只定义语义，不授权实现**：G3（手动面落地）与 G5（runtime 落地）分别按冻结计划 §6 申请授权；§8 变更清单即其范围依据。
4. 变更控制：语义修订走 Revision Record；已冻结字段（§3–§7）的修改须同步更新 §8.2 负向矩阵与 §10 同步清单。

## 2. 冻结不变量

- I-A 单轨 7+1：`requirement-intake → solution-design → solution-gate → task-planning → implementation → code-review → knowledge-sync`；`docflow-writer` 提供模板职能，不是流程节点。
- I-B solution-gate 双 binding 隔离：`adversarial_scan` 与 `formal_verdict` 不得由同一 Agent binding 执行。
- I-C 人工 Git 边界：任何执行面不产生业务仓 commit/push/PR。
- I-D PWR 自动推进（Decision-086）：verdict 的 scope 级判断即风险验收，无 risk acceptance proof 仪式；**code-review 实现类 finding 直接返工 implementation，不重走 Gate**。
- I-E 失败封闭：类型不清/证据不足 → BLOCKED，零部分推进。
- I-F 知识保护：节点不得无证据覆盖既有确认知识；受控知识维护（有验证证据的更新）按 `ai-sdlc/business-domain-compatible-update.md` 执行。
- I-G 单一生命周期权威：runtime 运行状态以 journal 为机器权威；`manifest.md` 为唯一人工投影（§6）；不存在第三份生命周期权威。

## 3. 域一：节点输入/输出与稳定路径（冻结表；canonical 文件名）

产物根为 `library/{requirement_id}/`。下表为唯一合法稳定路径集合；版本与生命周期状态由文件头元数据 + `manifest.md` 表达（§5），禁止以 `-R1/-R2`、`_R1` 等轮次后缀派生新文件名。

| 节点 | 输入（当前版本） | 输出稳定路径 | 准入谓词（§7.3） |
| --- | --- | --- | --- |
| requirement-intake | 用户原始输入 | `00-需求资料/{id}_需求摘要.md`；`00-需求资料/intake.manifest.json`（§6.1 对象一）；`library/{id}/manifest.md`（**本节点创建**） | 归一化事实完备；深度提案产出（§4） |
| solution-design | `{id}_需求摘要.md`（current）；`requiredDepth` + 深度提案（§4） | `01-技术方案/{id}_技术方案.md`（含 `depthCoverageLedger`） | 摘要 current；**不等待 Gate** |
| solution-gate / adversarial_scan | 技术方案 current | `02-方案审核/{id}_FindingLedger.md`（行式追加，§5） | 方案 current；异 binding |
| solution-gate / formal_verdict | 技术方案 + FindingLedger | `02-方案审核/{id}_方案审核.md`（Gate Result，§5.4） | Ledger current 且 `scannedDesignVersion` 匹配（§5.4）；异 binding |
| task-planning | Gate Result（current）+ 技术方案（current） | `03-任务规划/{id}_任务计划.md` | A1（§7.3） |
| implementation | 任务计划（current） | `04-实现记录/{id}_实现记录.md` + 生产代码变更 | A2（§7.3） |
| code-review | 实现记录（current）+ 代码变更证据（§5.5） | `05-代码审核/{id}_代码审核.md` | A3（§7.3） |
| knowledge-sync | 代码与验证证据 + routed 声明 | `06-知识同步/{id}_知识同步结果.md` + `.sdlc/business_domain/**`（受 G1 规格约束） | A4（§7.3） |

**代码变更证据绑定**：implementation 在实现记录中固定 `{baseRevision, reviewedRevision, changeDigest}`（content-addressed）；code-review 消费同一标识并回写审核结果——两执行面审的是同一份变更。

## 4. 域二：深度语义（封闭状态机）

### 4.1 字段

| 字段 | 取值 | 产生者 | 语义 |
| --- | --- | --- | --- |
| `decisionScope` | FULL_REQUIREMENT \| DELTA_CHANGE | requirement-intake | 沿用 complexity-routing 的 Decision Scope |
| `requestedDepth` | LIGHT \| STANDARD \| DEEP | requirement-intake | 首轮要求档位**实际值**（§4.2 判定表或用户显式指定） |
| `initialDepthBasis` | `user_requested` \| `normalized_proposal` \| `PROVISIONAL_STANDARD` | requirement-intake | `requestedDepth` 的来源标签，与档位值成对记录 |
| `requiredDepth` | LIGHT \| STANDARD \| DEEP | 初值=requestedDepth；仅 formal_verdict 可上调 | 当前生效要求档位 |
| `depthCoverageLedger` | §4.4 清单 × 已覆盖/未覆盖 | solution-design | 未覆盖项必须显式列出 |
| `decisionDepth` | LIGHT \| STANDARD \| DEEP \| null | **仅** formal_verdict | 最终持守档位；null 仅与 BLOCKED_UNKNOWN 组合 |
| `decisionStatus` | CONFIRMED \| ESCALATED \| BLOCKED_UNKNOWN | **仅** formal_verdict | 见 §4.3 |

### 4.2 归一深度判定表（**唯一触发枚举**；intake 提案权威；用户显式指定永远最高优先）

判定输入限**归一化产物中当前可判定的事实**。`decisionScope` 一并记录。T1 为**唯一**强触发枚举——`complexity-routing.md` 不再自维护触发清单，直接引用本表（§10 C1）：

| 序 | 强触发因子（T1，任一即 DEEP） |
| --- | --- |
| F1 | 状态机、状态流转、任务生命周期或单据生命周期变化 |
| F2 | DB schema、关键数据写入、数据迁移、回填或数据一致性变化 |
| F3 | MQ 生产、消费、重试、幂等、顺序或补偿变化 |
| F4 | 定时任务、监听器、异步任务、批处理或流程编排变化 |
| F5 | 事务边界、幂等边界、补偿策略或回滚策略复杂 |
| F6 | 跨系统接口 |
| F7 | 不可逆操作 |
| F8 | 权限、资金、库存、履约、计费、结算等高影响域 |
| F9 | 新流程或大幅改变既有主流程 |

| 序 | 条件 | `requestedDepth` |
| --- | --- | --- |
| T1 | F1–F9 任一命中 | DEEP |
| T2 | 多模块/多服务/跨仓协作，且 F1–F9 全部不命中（纯协作拆分） | STANDARD |
| T3 | 单模块内展示或逻辑变更，边界明确，无 T1 因子 | LIGHT |
| T4 | 以上均无法判定 | `PROVISIONAL_STANDARD`（来源标签；档位按 STANDARD 准备，附"判定不足"理由） |

**分层权威**：本表是 **intake 提案权威**；formal_verdict 是**唯一正式裁决点**，依方案揭示的风险可上调（ESCALATED）——上调依据是 §4.3 的风险判定，**不构成第二张 intake 判定表**。`complexity-routing.md` 的档位**内容**要求保留为 §4.4 规范来源（内容要求与触发枚举是两个维度）。

### 4.3 状态机（唯一合法转换）

1. **首轮**：solution-design 按 `requiredDepth` 立即产出方案 + 覆盖台账；不等待 Gate。
2. **verdict 求值**：输出且仅输出以下组合之一：
   - `CONFIRMED` + `decisionDepth=requiredDepth`：满足当前要求 → 可进入下游；
   - `CONFIRMED` + `decisionDepth < requiredDepth`：方案为超集，verdict 判定低档已足够——无害降持，记录即可；
   - `ESCALATED` + `decisionDepth=requiredDepth'`（>requiredDepth）：要求上调，回流 solution-design；
   - `BLOCKED_UNKNOWN` + `decisionDepth=null`：关键事实缺失 → 按 finding 指向回流（intake 或 solution-design），不可进入下游。
3. **升档回流**：ESCALATED 即时使旧方案/旧 Gate/全部下游 stale（§5.4）；solution-design 只生产新旧 `requiredDepth` 清单的**缺口增量**并更新台账；Re-Gate 对照**上调后的 requiredDepth** 判定 → 可 CONFIRMED。
4. **合法组合表**：`(CONFIRMED, LIGHT/STANDARD/DEEP, 准入)`、`(ESCALATED, LIGHT/STANDARD/DEEP, 禁止)`、`(BLOCKED_UNKNOWN, null, 禁止)`。无其他合法状态。

### 4.4 档位内容要求清单（`depthCoverageLedger` 规范来源）

引用 `ai-sdlc/complexity-routing.md` 档位定义（§10 C1 修订版）：LIGHT 精简主干；STANDARD 覆盖架构、接口、数据、异常、兼容性与验证；DEEP 强制状态机/DB/MQ/事务/回滚/代表数据/边界场景章节。该清单是台账逐项标注的唯一规范来源；修订即本合同修订。

## 5. 域三：Finding 全链生命周期（G2-R3-H2：登记与发现节点解耦，覆盖全部"发现节点×根因类别"合法组合）

### 5.1 登记（在发现节点登记，与回流目标解耦）

- **任何节点**在其产出产物的 finding 段登记它发现的 finding（引用现役类别×来源矩阵，`ai-sdlc/loop-finding-lifecycle.md`：类别×来源的合法组合以该矩阵为准，本合同不另造分类体系）。
- `finding_id = {requirement_id}-F{两位序号}`，全 requirement 单一序列，任一来源登记即占用，**不可变**；状态迁移以新行追加。
- 每条 finding 携带：`{finding_id, discoveredAt(发现节点), rootCauseCategory(现役类别), earliestAffectedNodeId(回流目标), sourceRevision, evidenceRef, status, fixedBy?}`。发现节点 ≠ 回流目标是**合法且常见**组合（例：code-review 发现方案缺口 → discoveredAt=code-review，earliestAffectedNodeId=solution-design）。
- `earliestAffectedNodeId` 值域 = 七节点全集，回流映射枚举闭合（§7.3）。
- 全部来源的 finding 经 publisher 汇入 **manifest finding 索引**（§6.2）——单一索引，状态迁移同步投影。

### 5.2 修复者、关闭验证者与状态处置（G2-R4-H2）

- `status ∈ OPEN → RESOLVED | ACCEPTED`；状态迁移以新行追加，原行不改写。
- **修复者 = `earliestAffectedNodeId` 节点**：执行返工/修订，并在其产物中登记返工完成证据（不等于关闭）。
- **关闭验证者 = 发现节点（discoveredAt）**：复验修复后在其 finding 段登记 RESOLVED。"实现类 finding 由 code-review 复验关闭"仅指 discoveredAt=code-review 的来源；其他发现节点（如 knowledge-sync）按本通则自行复验。
- **关闭复验是 finding 生命周期管理动作，不是一次节点运行**：验证者直接对照 finding 的 `evidenceRef`/验收基准与修复者产出的修复证据（digest 绑定）复核——**不依赖 §7.3 的下游准入谓词**（准入谓词管制的是"节点产出新周期产物进入下游"，不管制 finding 生命周期管理），因此不会出现"OPEN finding 阻断了自己的关闭复验"的死锁。独立验证责任保留：修复者不得自行登记 RESOLVED。
- **关闭复验动作的三步收尾（G2-R6-H1；v0.8.0 按 G2-R8-H1 修订——状态迁移是生命周期元数据，不产生产物新修订）**：①复验通过后在**来源 finding 段**登记 RESOLVED 行（持久化；产物**内容字节不变**——finding 段是产物的 finding 生命周期记录区，其追加不改变既有产物内容的 digest，见 §5.5'）。②触发 publisher 发布（§6.2）：差量并入 manifest `findingIndex`；**entry 的 `version`/`digest` 不变**（无内容修订即无新 revision——现役 revision 机制要求新修订绑定成功 producer 执行（`loop-artifact-revision.md` §4 四项绑定），关闭复验不是节点运行，不得伪造执行、不得豁免完整性绑定）；findingIndex 的演进由其自身修订计数 `findingIndexRev` 承载（§6.2.3）。③此后 §7.3 准入谓词读到 RESOLVED，阻断解除；产物完整性校验对原 digest 继续成立。复验动作未触发发布前，阻断持续（关闭事实以 manifest findingIndex 为准）。
- **ACCEPTED 仅适用于 scan 来源**（formal_verdict 的 PWR scope 判断，I-D）：记录于 Gate Ledger 并投影至 manifest finding 索引。非 scan 来源的 finding 只有 RESOLVED 或维持 OPEN（阻断其下游）两条路——不存在第二套风险接受仪式。
- OPEN finding 的阻断范围由 §7.3 准入表定义（仅阻断 `earliestAffectedNodeId` 下游的准入），不扩大到无关节点。

### 5.3 Gate Ledger 的专属边界

`{id}_FindingLedger.md` 是 **solution-gate 的设计阶段台账**：只承载 adversarial_scan 登记的方案类 finding。其他来源的 finding 登记在发现节点自己的产物 finding 段（§5.1），不经由 Gate Ledger——代码返工 therefore 不产生任何 Gate 仪式（I-D）。所有来源的 finding 统一汇入 manifest finding 索引（§6.2），下游消费索引而非逐文件扫描。

### 5.4 版本绑定、失效传播与发布时点

- Gate Result 头部绑定 `{designVersion, ledgerDigest, scannedDesignVersion, verdictBinding, decisionDepth, decisionStatus, gateVersion}`；**`scannedDesignVersion == designVersion` 为 verdict 产出前置**——Ledger 所审方案与 Gate 所裁方案必须是同一修订。
- `ESCALATED`/`FAIL` 的失效传播与新 Gate 条目在**同一 manifest 修订**（§6.2 单次原子写入）中生效；stale 产物不可作为下游准入输入；回流目标节点完成新产出前保持 `actionable`。
- runtime 面：verdict 发布的 journal 事件 ref 记入 manifest 条目；下游准入（§7.3）校验 `projectedThrough`（§6.2）已覆盖该事件——runtime 看到的提交边界与 manifest 一致。

### 5.5 证据身份

implementation/code-review 的代码变更证据 = `{baseRevision, reviewedRevision, changeDigest}`（content-addressed）；不新增固定 diff 文件。

## 6. 域四/五：manifest 三对象与自证投影协议（G2-R3-H3）

### 6.1 三个对象，互不替代

| 对象 | 唯一职责 | 创建者 | 更新者 |
| --- | --- | --- | --- |
| `00-需求资料/intake.manifest.json` | runtime 入口确认与触发（`loop-intake-manifest:v1`） | requirement-intake | 不随流程演进 |
| `library/{id}/manifest.md` | 七节点生命周期人工投影（§6.2 格式） | requirement-intake（创建职责唯一） | **publisher**（§6.2） |
| `.sdlc/business_domain/knowledge-target.yaml` | 项目级长期知识路由（G1 规格） | 初始化器 | absent → candidate_pending_confirmation → routed |

### 6.2 自证投影协议（手动与 runtime 共用格式；三级有序判别；按执行面适配；重放确定）

1. **格式（自证 + 投影基线）**：manifest = `head`（schema_version/requirement_id/publishSeq/`projectedThrough`/updated_at）+ `entries`（每节点 `{node, status, artifactPath, version, digest, updatedAt, sourceEventRef}`）+ **`findingIndex`**（§5 全来源 finding 及状态，§5.2；携带 `findingIndexRev` 修订计数）+ `repairRecords[]` + **`manifestDigest = sha256(规范化 head+entries+findingIndex+repairRecords)`**。digest 内嵌——文件自带完整性证据，不存在 manifest 之外的 digest 记录。
   - runtime 面：`projectedThrough` = 已投影的最后一个 journal 事件序号；`sourceEventRef` = 事件标识。
   - 手动面：`projectedThrough = MANUAL`；`publishSeq` = 手动完成声明的**单调递增序列号**（每个结构化完成声明携带 seq）；`updated_at` = 该声明确认时刻。手动面不读 journal——协议中涉及 journal 的步骤对手动面跳过，追平输入改为"自上次 publishSeq 以来的完成声明"。
2. **三级有序判别（顺序固定，互斥；每次发布前执行）**：
   - **第 1 级 损坏**：self-digest 校验失败或解析失败 → `MANIFEST_CORRUPT_STOP`（不静默修复、不重建，DP4）。
   - **第 2 级 真分叉**（两项校验，任一不通过 → `JOURNAL_MANIFEST_MISMATCH_STOP`，不得进入第 3 级）：
     (a) **journal 前缀**：对 `≤ projectedThrough` 的已投影前缀逐事件按 §6.2.4 映射推导条目，**加上 `findingIndexRev` 内已发布的 finding 状态迁移**（它们不产生新 journal 事件、也不产生新 revision，是 entries 之外合法的投影事实——G2-R8-H1 闭合）后与 manifest entries 比对——不一致即分叉。因此 finding 差量发布后的下一次发布，前缀推导结果与已发布的 entries 一致，不会误判分叉；真实分叉仍 STOP。
     (b) **findingIndex 权威交叉验证（方向性，整行绑定）**：findingIndex 每行的**全部字段**（`finding_id`、`status`、`evidenceRef`、`earliestAffectedNodeId` 等）必须在某来源 finding 段（Gate Ledger 或对应产物 finding 段，§5.1）中存在逐字段一致的凭据行——存在索引有而来源段无逐字段凭据的行 → `JOURNAL_MANIFEST_MISMATCH_STOP`（堵住"仅篡改 evidenceRef 等非键字段再重算 digest"的旁路，并明确服从本方向性规则而非全等检查）。**来源段领先于索引的行不是分叉**——它们是第 3 级的合法追平输入（含关闭复验登记的 RESOLVED 行）。**findingIndexRev 单调**：索引修订计数必须随发布单调递增且不跳号——重放/追平产出与既有值不同的 `findingIndexRev` 视为分叉。
   - **第 3 级 待投影**：输入 = journal 尾段事件 **+ 来源 finding 段相对 findingIndex 的差量**（含关闭复验登记的 RESOLVED 行，§5.2）→ publisher 按序追平（幂等）。**无尾段且 findingIndex 无差量 → no-op，原样退出**；任一存在 → 发布（仅差量时 `projectedThrough`/`publishSeq` 不推进，findingIndex + `findingIndexRev` + `manifestDigest` 更新，entries 不动——§6.2.3）。
   - 手动面：第 2 级(a)跳过（无 journal），(b)照常执行；第 3 级输入为完成声明 + finding 段差量。
3. **追平发布（幂等纯函数；三类输入的进度与绑定规则，G2-R7-H2）**：输入 = (校验通过的当前 manifest, journal 尾段事件, 来源 finding 段差量, 新完成声明)。
   - **runtime 尾段**：entries/findingIndex 按事件映射生成；`publishSeq`/`projectedThrough` 推进到已处理末事件；`updated_at` = 最后已投影事件时间戳。
   - **手动新完成声明**：按声明生成/更新条目；`publishSeq` 推进到声明 seq，**`projectedThrough` 保持 `MANUAL`**；`updated_at` = 声明确认时刻。
   - **纯 finding 差量**（G2-R8-H1：状态迁移是生命周期元数据）：findingIndex 更新（按 §6.2.2(b) 凭据）+ `findingIndexRev` 递增；**`entries` 全部不变**（无内容修订 → 无新 revision → entry version/digest 不动，产物完整性对原 digest 继续成立）；`publishSeq`/`projectedThrough` 均不推进；`updated_at` 不变。
   - self-digest 重算；**原子 rename**。同输入重放产出**逐字节同一 manifest**；崩溃后文件为旧或新，均自洽，重跑即追平——每个崩溃点的恢复结果唯一。
4. **runtime 投影字段映射（对齐现役 journal/revision 模型）**：journal terminal 事件字段 `nodeId/status/executionEventId` → entry `{node, status, sourceEventRef}`；产物三元组经 `outputArtifactRef`（content-addressed）由 artifact store/revision 解析出 `outputArtifactPath + outputArtifactVersion + outputDigest` → entry `{artifactPath, version, digest}`。**状态映射**：执行事件 status（SUCCEEDED/FAILED/BLOCKED…）是执行事实，映射为 entry 的完成/失败事实；entry 的生命周期状态（current/stale/actionable，§5.4）由 revision 状态（ACTIVE/STALE/SUPERSEDED）映射——ACTIVE→current，STALE/SUPERSEDED→stale；两枚举不混用，映射表冻结于本条。**findingIndex 投影自全部来源的 finding 段**（Gate Ledger + 各产物 finding 段，§5.1/§5.2），状态迁移随之投影——不限于 verdict 载荷；每次含 finding 差量的发布使 `findingIndexRev` 递增（G2-R8-M1：迁移行**不**携带所在产物的 digest——产物 digest 不因 finding 状态迁移改变，由 entry 原值继续绑定）。findingIndex 的权威交叉验证见 §6.2.2(b)（整行绑定 + 方向性规则 + findingIndexRev 单调）。Agent 自由文本不得直写。
5. **修复记录的唯一位置与重放处理（G2-R6-M1）**：修复记录**唯一存放于顶层 `repairRecords[]`**（不写入 entries）。修复记录仅在人工修复动作时写入 `repairRecords` 并计入其后所有 `manifestDigest`；发布追平/重放**不追加、不改动**修复记录——重放对含修复记录的 manifest 同样逐字节确定。
6. **人工修复后的可信基线重建（G2-R7-M1：hash 收尾——先写完 repairRecords 再算 digest）**：人工修复 = ①修正 `entries`/`findingIndex`；②按实际产物重算各 entry 的 artifact digest；③runtime 面将 `projectedThrough` 重设为当前 journal 末尾；④**写入**修复记录（who/when/reason/correctedEntries + ②③的基线重设事实）至顶层 `repairRecords[]`；⑤**最后**重算 `manifestDigest`（覆盖 head/entries/findingIndex/repairRecords 全部内容）并原子 rename 发布。**信任重建判据**：self-digest 自洽（⑤后必然成立，因 repairRecords 先于 digest 写入）+ 全部 entry digest 与实际产物核验通过 + runtime 面 journal 交叉校验通过——三者全过，下一次发布按正常协议进行。人工修复后**不做**普通前缀校验（修复基线已重设）。修复记录写入后、digest 计算前不得再追加任何内容。
7. **无 manifest 的存量 requirement = 只读归档知识源**（DP4）：不重建；新流程复用其目录 → `BLOCKED_AMBIGUOUS`。

## 7. 域六：PWR、失败码、回流映射与统一准入

### 7.1 PWR

PWR 自动推进：verdict 的 scope 级判断即验收；被接受风险在**其来源 finding 记录**标 `ACCEPTED`（scan 来源=Gate Ledger；处置者=formal_verdict——非 scan 来源无 ACCEPTED 路径，见 §5.2），经 manifest finding 索引以 risk refs 随行下游；envelope 不得强制 `riskAcceptanceRefs` 非空；无 acceptance 仪式产物。

### 7.2 失败码

`GATE_FAIL` / `BLOCKED_UNKNOWN` / `BLOCKED_AMBIGUOUS` / `MANIFEST_CORRUPT_STOP` / `JOURNAL_MANIFEST_MISMATCH_STOP` / `ADMISSION_DENIED`。区分：`BLOCKED_UNKNOWN` 仅指 verdict 无法分级/判定；`BLOCKED_AMBIGUOUS` 指结构歧义（双根、无 manifest 复用）；文件级终止用 `MANIFEST_CORRUPT_STOP`/`JOURNAL_MANIFEST_MISMATCH_STOP`；下游准入拒绝用 `ADMISSION_DENIED`。

### 7.3 回流映射与统一准入

**回流映射（枚举闭合 = 七节点全集）**：`earliestAffectedNodeId` 直接命名回流节点——requirement-intake（需求事实/范围）、solution-design（方案，变更即重走 Gate）、solution-gate（裁决过程缺陷 → 重跑 gate）、task-planning（计划）、implementation（实现返工，code-review 实现类 finding 直达返工不重走 Gate，I-D）、code-review（审核缺陷 → 重跑 code-review）、knowledge-sync（知识条目）。

**统一准入表**（`current` = manifest 中 current 且 digest 一致；runtime 面另要求 §5.4 的 `projectedThrough` 覆盖校验）：

| 准入 | 谓词 A（裁决面） | 谓词 B（产物面） |
| --- | --- | --- |
| A1 task-planning | Gate Result current ∧ `decisionStatus=CONFIRMED` ∧ gateResult ∈ {PASS, PASS_WITH_RISK} ∧ 无 OPEN blocking（§5.2 阻断范围） | 技术方案 current |
| A2 implementation | 任务计划 current ∧ PWR 风险 refs 随行 | — |
| A3 code-review | 实现记录 current | 证据绑定（§5.5）完整 |
| A4 knowledge-sync | code-review current ∧ 无 OPEN blocking（ACCEPTED 不阻断） | routed 声明；非 routed → PROPOSAL_ONLY |

`ESCALATED`/`BLOCKED_UNKNOWN` 的 Gate Result 不满足 A1（即使字面 PASS/PWR）。旧准入条款按 §10 废止。

## 8. 变更清单与负向矩阵

### 8.1 变更清单

| # | 文件 | 变更 | 落点 |
| --- | --- | --- | --- |
| C1 | `ai-sdlc/complexity-routing.md` | 触发枚举单一化（引用 §4.2 T1，删除自维护清单）；纯协作限定传播至 Delta 表；decision_status 枚举替换；决策字段对齐 §4.1 | **G2 收口（已随本修订完成）** |
| C2 | `skills/sdlc-requirement-intake/SKILL.md` | manifest 创建 + §4.2 判定表 + 深度字段输出；移除 runtime recovery context 依赖 | G3 |
| C3 | `skills/sdlc-solution-design/SKILL.md` | Core Rule 10 → §4.3 首轮解耦 + 覆盖台账 | G3 |
| C4 | `skills/sdlc-solution-gate/SKILL.md` | 稳定路径 + §4.3 组合 + `scannedDesignVersion` 绑定 + 移除 runtime 推进权依赖 | G3 |
| C5 | `skills/sdlc-task-planning/SKILL.md` | A1 准入引用 + 移除 runtime 依赖 | G3 |
| C6 | `skills/sdlc-code-review/SKILL.md` | 清除 PWR 接受者/证据残留 + A3 引用 + 全链 finding 登记职责 | G3 |
| C7 | `skills/sdlc-docflow-writer/SKILL.md` | manifest 直写 → publisher 调用 | G3 |
| C8 | `skills/sdlc-implementation/SKILL.md` | **C8-a：`SKILL.md:15` runtime 依赖移除（单列）**；证据绑定输出 | G3 |
| C8-b | 其余 `skills/sdlc-*/SKILL.md`（knowledge-sync） | publisher 更新条款 + §7.3 准入引用 + finding 登记职责 | G3 |
| C9 | `templates/**` | Ledger/Gate 头部元数据 + 覆盖台账模板 + 各产物 finding 段模板 | G3 |
| C10 | manifest publisher 工具 | §6.2 自证投影协议实现（含修复基线重建） | G3 |
| C11 | `ai-sdlc/artifact-flow.md` | 逐条标注：路径保留；DECIDED/深度前置/准入条款替代 | G3 |
| C12 | `ai-sdlc/artifact-versioning.md` / `artifact-storage.md` | superseded 正文保留映射；manifest 必需性对齐；旧深度状态清理 | G3 |
| C13 | `ai-sdlc/development-path-governance.md` / `lifecycle.md` / `phase-gates.md` / `project-type-contract-artifact-matrix.md` | DECIDED→新状态映射；knowledge-sync 准入对齐 A4；accepted-risk evidence 移除 | G3 |
| C14 | `ai-sdlc/loop-finding-lifecycle.md` | 类别×来源矩阵引用至 §5.1；finding id/状态迁移映射至 §5.2；`resolveFinding` 关闭证据模型对齐 §5.2 三步收尾 | G5 |
| C15 | `ai-sdlc/loop-artifact-revision.md` / `loop-recovery-protocol.md` | STALE 吸收态复用声明（**finding 状态迁移不产生产物新修订、不触发 STALE→SUPERSEDED 边**——`findingIndexRev` 为独立投影计数）+ `projectedThrough`/投影基线映射 | G5 |
| C16 | `execution/gateway.ts` | 移除 `decisionDepth:"STANDARD"` 硬编码（549/565），消费 verdict 真实深度 | G5 |
| C17 | `core/node-output-envelope.ts` | 移除 riskAcceptanceRefs 非空强制 | G5 |
| C18 | journal→manifest projector + recovery | §6.2 自证投影协议实现（含 `findingIndexRev` 单调与合成前缀推导）+ mismatch STOP_AND_REPORT + formal_verdict 重复 Finding 来源处理 | G5 |
| C19 | `ai-sdlc/shared-business-domain-governance.md` / `standard-package-resolution.md` | G1 根语义引用同步 | G3 |
| C20 | tests/validator 承重点 | §8.2 表"承重落点"列逐项落地 | G3/G5 |

### 8.2 负向矩阵

| # | 断言 | 规范输入 | 违规变异（应变红） | 判定 | 承重落点 |
| --- | --- | --- | --- | --- | --- |
| N1 | 无硬编码 `decisionDepth:"STANDARD"`；非 STANDARD verdict 输入产出对应深度 | 非 STANDARD verdict 事件 fixture | 恢复 549/565 硬编码 | 输出深度断言 + 字面扫描 | G5 gateway 测试 |
| N2 | 产物目录无轮次后缀派生文件（模式 `[-_]R[0-9]+`） | 多轮 Re-Gate fixture | 生成 `_R1`/`-R2` Gate 文件 | 稳定路径 validator/fixture 文件名断言 | G3 路径 validator + fixture |
| N3 | scan 与 verdict 异 binding；同 binding 拒绝 | 同 binding 双角色执行 fixture | 去除 binding 比较 | 拒绝断言（执行记录实际两次 binding） | G3 执行记录 + G5 binding 校验 |
| N4 | 首轮无 Gate 输入仍可产出待审方案 | 无 verdict 历史的新需求 fixture | 恢复深度前置条款/准入 | 时序断言 + prompt 条款扫描 | G3 harness + G5 节点准入 |
| N5 | Agent 自由文本不落 manifest；无 manifest 存量目录复用被拒 | 直写尝试 + 复用尝试 fixture | publisher 绕过 / 移除 DP4 前置阻断 | 拒绝断言（两个独立变异各自变红） | G3 publisher + intake |
| N6 | PWR 无 riskAcceptanceRefs 非空强制、无仪式产物 | PWR fixture | 恢复 envelope 强制 | envelope 断言 + 下游准入场景 | G5 envelope 测试 + G3/G5 准入 |
| N7 | 三态可区分：自洽待投影（追平）/ 真分叉（STOP）/ 损坏（STOP）；两种 STOP 码不得互换 | journal 领先 fixture / journal 分叉 fixture / self-digest 破坏 fixture | 分别移除 projectedThrough 比对、分叉比对、self-digest 校验 | 三种独立变异各自变红为对应码 | G5 projector/recovery 注入测试 |
| N8 | 升档回流=台账缺口补齐：漏补必需项、删除已确认内容分别变红 | 升档 fixture（要求清单 + 已确认内容清单） | 漏补 / 删除受保护内容 | 台账覆盖断言 + 受保护内容 diff 断言 | G3/G5 升档 fixture |
| N9 | 第三份 Gate 权威文件被拒；历史 evidence 引用不误杀 | 第三权威文件 + 历史 evidence fixture | 引入第三文件 / 误杀历史引用 | 稳定路径表比对 + evidence 排除断言 | G3 路径 validator + G5 投影 |

## 9. 复审裁决的落地注记（不构成本轮授权）

FREEZE 后 G3/G5 执行注意：C10 publisher 必须实现 §6.2 自证格式与 `projectedThrough` 语义（含修复基线重建）；C18 projector 的三态判定按 §6.2.2；C2/C4 深度字段输出按 §4.1 结构化承载；§10 C1 已随本修订完成，G3 检查其消费一致性；N 系列承重落点见 §8.2。

## 10. 现役合同同步清单

| 文件:条款 | 冲突 | 处置 | 落点 |
| --- | --- | --- | --- |
| `complexity-routing.md:19-21` | DECIDED/BLOCKED_UNKNOWN 旧枚举；裁决点表述 | 已重写：CONFIRMED/ESCALATED/BLOCKED_UNKNOWN；intake=提案、gate=唯一正式裁决 | C1 @ G2 收口（完成） |
| `complexity-routing.md:95-111` 触发清单 | 自维护第二套档位规则 | 已删除自维护清单，引用 §4.2 T1 唯一枚举；纯协作限定传播至 Delta 表 | C1 @ G2 收口（完成） |
| `complexity-routing.md:138,153-155,176-177,188` | 现役 DECIDED | 已全部替换为 CONFIRMED/ESCALATED | C1 @ G2 收口（完成） |
| `complexity-routing.md` 决策字段节 | 字段集过时 | 已对齐 §4.1 七字段并声明 §4.1 为唯一权威 | C1 @ G2 收口（完成） |
| `node-capability-contract.md:52` | 规范源声明覆盖流程语义 | 规范源声明限定：流程语义/深度状态机以本合同为权威 | C1 同族 @ G3 |
| `skills/sdlc-implementation/SKILL.md:15` | runtime recovery context 依赖 | **C8-a 单列**：移除 | C8-a @ G3 |
| `skills/sdlc-solution-design/SKILL.md:24` | 首轮深度循环 | C3 承载（Core Rule 10 → §4.3） | C3 @ G3 |
| `artifact-flow.md:29,78,86` | DECIDED；按已裁决深度生成 | 路径保留；状态/前置条款替代 | C11 @ G3 |
| `artifact-versioning.md:29,107,135` | 旧文件名/旧状态；旧正文不保留 | 历史保存映射：superseded 版本正文保留于产物目录、仅标 superseded | C12 @ G3 |
| `artifact-storage.md:85,101,262` | manifest 可 not_applicable | 对齐 intake 全创建；旧状态/风险准入清理 | C12 @ G3 |
| `development-path-governance.md:34` / `lifecycle.md:54` | 依赖 DECIDED | CONFIRMED/ESCALATED 映射 | C13 @ G3 |
| `phase-gates.md:132` | OPEN blocking + ACCEPTED_RISK proof | 废止，对齐 A4 | C13 @ G3 |
| `loop-finding-lifecycle.md:17,29,33,87` | 类别×来源矩阵未接线；风险证明；回流映射 | 矩阵引用至 §5.1；映射至 §5.2；ACCEPTED 无仪式；回流枚举对齐 §7.3 | C14 @ G5 |
| `loop-artifact-revision.md:63,74` / `loop-recovery-protocol.md:47` | STALE 吸收态；深度结构 | 声明复用 + `projectedThrough`/投影基线映射 | C15 @ G5 |
| `project-type-contract-artifact-matrix.md:88` | DECIDED + accepted-risk evidence | 移除，对齐 §7 | C13 @ G3 |
| `change-control.md:111,246` | 需求问题回 intake（保留）；manifest 临时小节写入 | 回流保留；写入改为 publisher 输入 | C10/C13 @ G3 |
| `skills/sdlc-code-review/SKILL.md:26` | PWR 接受者/证据 | 清除 + 全链 finding 登记职责 | C6 @ G3 |
| `skills/sdlc-docflow-writer/SKILL.md:92,157` | manifest 直写 | 改 publisher 调用 | C7 @ G3 |
| `shared-business-domain-governance.md:8` / `standard-package-resolution.md:22` | 旧 `.specify` 活动根/profile 解析 | G1 根语义引用同步（不重开旧根路由） | C19 @ G3 |

## 11. Revision Record

- 0.8.0（2026-09-05）：按 G2-R8-H1/M1 修订——finding 状态迁移重定义为生命周期元数据（**不产生产物新修订**：无内容变更即无新 revision，规避现役四项绑定的成功执行要求；entry version/digest 不动，完整性对原 digest 成立）；`findingIndexRev` 独立投影计数（单调校验入第 2 级(b)）；第 2 级(a) 前缀推导改为"journal 推导 + 已发布 finding 迁移"合成（关闭发布后下一次发布不误判分叉）；L150 残句清除；C14/C15/C18 适配落实。0.7.0 的"状态迁移=产物新修订"设计撤销。
- 0.7.0（2026-09-05）：按 G2-R7-H1/H2/M1 修订——finding 状态迁移=来源产物新修订（findingIndex 发布同步更新 entry version/digest，完整性绑定不豁免）；§6.2.2(b) 凭据校验扩展为整行绑定（堵非键字段篡改）；发布三向进度规则（runtime 尾段/手动声明/纯 finding 差量分别定义 publishSeq/projectedThrough 行为，手动冲突消除）；人工修复 hash 收尾（repairRecords 先于 digest 写入）。
- 0.6.0（2026-09-05）：按 G2-R6-H1/M1 修订——发布判别第 2 级扩展 findingIndex 权威交叉验证、第 3 级输入扩展 finding 段差量（含关闭复验 RESOLVED）、no-op 条件收紧；关闭复验三步收尾（登记→发布→阻断解除）；repairRecords 统一顶层唯一位置并恢复人工修复基线重建规则；发布重放确定性保留。
- 0.5.0（2026-09-05）：按 G2-R5-H1/H2/L1 修订——§6.2 重写为三级有序判别（损坏→前缀分叉→待投影追平，含已追平 no-op 与逐崩溃点恢复结果）+ 手动面适配（MANUAL/声明序列号/声明确认时刻）+ 修复记录重放确定性 + 现役状态映射表；§5.2 关闭复验定义为 finding 生命周期管理动作（准入豁免、独立验证责任保留）；第 34 行引用更正 §5.4。
- 0.4.0（2026-09-05）：按 G2-R3-H1/H2/H3/M1 修订——H1 深度触发枚举单一化（T1 唯一清单 F1–F9，complexity-routing 引用不自维护；纯协作限定传播至 Delta 表）；H2 finding 登记与发现节点解耦（复用现役类别×来源矩阵，全组合合法，处置者=回流目标节点，Gate Ledger 限定为设计阶段台账）；H3 manifest 增加 `projectedThrough` 投影基线 + 三态判别（自洽待投影/真分叉/损坏）+ 幂等重放规则（publishSeq=projectedThrough、时间取事件时间戳）+ runtime 准入投影覆盖校验；M1 恢复完整 C1–C20/N1–N9 表、N7 三态化、C8-a 单列、残留引用更正。
- 0.3.0（2026-09-05）：按 G2-R2 修订（G2-R3 复审：深度规范同步、全链 finding、投影恢复仍不闭合；字段拆分/A1 拒绝/自证 digest 方向被确认成立并保留）。
- 0.2.0（2026-09-05）：按 G2-R1 全量修订。
- 0.1.0（2026-09-05）：初稿 PROPOSED。
