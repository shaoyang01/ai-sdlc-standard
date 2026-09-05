# Manual/Runtime Semantic Contract（手动与 runtime 共同语义合同）

> Version: 0.2.0 (PROPOSED)
> Status: 待独立只读复审 + Current User 裁决冻结；冻结后为 G3（手动主路径修复）与 G5（runtime 投影/parity）的唯一语义权威
> 上游: Decision-090 及其[冻结执行计划](../docs/reports/decision-090-c03e-prerun-governance-plan.md) §4/G2 · [需求拆分 v1.0.0](../docs/reports/decision-090-c03e-prerun-requirement-decomposition.md) §4（DP1–DP5）· Decision-084/086 · [v3 规格 v1.1.0](../docs/reports/d088-01-v3-behavior-spec.md)
> 修订: v0.2.0 按 G2-R1-H1..H4/M1/L1 全量修订——深度状态机封闭（H1）、统一生命周期与准入表（H2）、manifest 发布协议（H3）、现役合同同步清单与 canonical 文件名（H4）、N2 检查对象修正与逐条承重绑定（M1）、交叉引用更正（L1）。

## 1. 定位与权威关系

1. 本合同是**七节点流程语义的唯一权威**：节点顺序、输入输出、稳定路径、深度语义、Finding/Ledger/Gate 生命周期、manifest 职责、发布协议、失败码、回流与准入。手动 Skill prompt 与 LOOP runtime 代码消费同一份合同；实现机制可以不同，**语义必须等价**。
2. 冲突时本合同优先于：各 `skills/sdlc-*/SKILL.md` 的流程性条款、`execution/gateway.ts` 等运行时代码、以及 §10 同步清单中标注"替代"的既有合同条款。未标注替代的内容性条款（如 artifact-flow 的产物内容要求、Skill 的领域指令）继续有效。
3. 本合同**只定义语义，不授权实现**：G3（手动面落地）与 G5（runtime 落地）分别按冻结计划 §6 申请授权；§8 变更清单即其范围依据。
4. 变更控制：语义修订走 Revision Record；已冻结字段（§3–§7）的修改须同步更新 §9 负向矩阵与 §10 同步清单。

## 2. 冻结不变量

- I-A 单轨 7+1：`requirement-intake → solution-design → solution-gate → task-planning → implementation → code-review → knowledge-sync`；`docflow-writer` 提供模板职能，不是流程节点。
- I-B solution-gate 双 binding 隔离：`adversarial_scan` 与 `formal_verdict` 不得由同一 Agent binding 执行。
- I-C 人工 Git 边界：任何执行面不产生业务仓 commit/push/PR。
- I-D PWR 自动推进（Decision-086）：verdict 的 scope 级判断即风险验收，无 risk acceptance proof 仪式。
- I-E 失败封闭：类型不清/证据不足 → BLOCKED，零部分推进。
- I-F 知识保护：节点不得无证据覆盖既有确认知识；**受控知识维护**（有验证证据的更新）按 `ai-sdlc/business-domain-compatible-update.md` 执行，不属于本条禁止范围。
- I-G 单一生命周期权威：runtime 运行状态以 journal 为机器权威；`manifest.md` 为唯一人工投影（§6）；不存在第三份生命周期权威。

## 3. 域一：节点输入/输出与稳定路径（冻结表；文件名维持既有 canonical 形态）

产物根为 `library/{requirement_id}/`。下表为唯一合法稳定路径集合；版本与生命周期状态由文件头元数据 + `manifest.md` 表达（§5），禁止以 `-R1/-R2`、`_R1` 等轮次后缀派生新文件名。

| 节点 | 输入（当前版本） | 输出稳定路径 | 准入谓词（进入本节点的条件，§7.3） |
| --- | --- | --- | --- |
| requirement-intake | 用户原始输入 | `00-需求资料/{id}_需求摘要.md`；`00-需求资料/intake.manifest.json`（§6.1 对象一）；`library/{id}/manifest.md`（**本节点创建**） | 归一化事实完备；深度提案产出（§4） |
| solution-design | `{id}_需求摘要.md`（当前）；`requiredDepth` + 深度提案（§4） | `01-技术方案/{id}_技术方案.md`（含 `depthCoverageLedger`） | 摘要 current；**不等待 Gate** |
| solution-gate / adversarial_scan | 技术方案 current | `02-方案审核/{id}_FindingLedger.md`（行式追加，§5） | 方案 current；异 binding |
| solution-gate / formal_verdict | 技术方案 + FindingLedger | `02-方案审核/{id}_方案审核.md`（Gate Result，§5.4） | Ledger current；异 binding |
| task-planning | Gate Result（current）+ 技术方案（current） | `03-任务规划/{id}_任务计划.md` | A1（§7.3） |
| implementation | 任务计划（current） | `04-实现记录/{id}_实现记录.md` + 生产代码变更 | A2（§7.3） |
| code-review | 实现记录（current）+ 代码变更证据（§5.5） | `05-代码审核/{id}_代码审核.md` | A3（§7.3） |
| knowledge-sync | 代码与验证证据 + routed 声明 | `06-知识同步/{id}_知识同步结果.md` + `.sdlc/business_domain/**`（受 G1 规格约束） | A4（§7.3） |

**代码变更证据绑定**：implementation 在实现记录中固定 `{baseRevision, reviewedRevision, changeDigest}`（content-addressed，复用既有 artifact 证据机制）；code-review 消费同一 `{reviewedRevision, changeDigest}` 并在审核结果中回写——两执行面审的是同一份变更。

## 4. 域二：深度语义（封闭状态机，G2-R1-H1）

### 4.1 字段（结构化，全部可机器承载）

| 字段 | 取值 | 产生者 | 语义 |
| --- | --- | --- | --- |
| `decisionScope` | FULL_REQUIREMENT \| DELTA_CHANGE | requirement-intake | 沿用 `complexity-routing.md` 的 Decision Scope |
| `requestedDepth` | LIGHT \| STANDARD \| DEEP | requirement-intake | 首轮要求档位的**实际值**（§4.2 判定表或用户显式指定） |
| `initialDepthBasis` | `user_requested` \| `normalized_proposal` \| `PROVISIONAL_STANDARD` | requirement-intake | `requestedDepth` 的**来源标签**，与档位值成对记录 |
| `requiredDepth` | LIGHT \| STANDARD \| DEEP | 初值=requestedDepth；仅 formal_verdict 可上调 | 当前生效要求档位（升档改写它，不改写 requestedDepth） |
| `depthCoverageLedger` | 三档要求清单 × 已覆盖/未覆盖 | solution-design | §4.4 冻结清单逐项标注；未覆盖项必须显式列出 |
| `decisionDepth` | LIGHT \| STANDARD \| DEEP \| null | **仅** formal_verdict | 最终持守档位；null 仅与 BLOCKED_UNKNOWN 组合 |
| `decisionStatus` | CONFIRMED \| ESCALATED \| BLOCKED_UNKNOWN | **仅** formal_verdict | 见 §4.3 |

### 4.2 归一深度判定表（枚举；手动与 runtime 共用；用户显式指定永远最高优先）

判定输入限**归一化产物中当前可判定的事实**（范围、触达的模块/数据/接口），禁止依赖设计期结论（如路线数）。`decisionScope` 一并记录：

| 序 | 条件 | `requestedDepth` |
| --- | --- | --- |
| T1 | 存在任一强触发：状态机变更；DB/schema 变更；MQ/异步链路；事务/幂等/回滚要求；数据迁移；跨系统接口；不可逆操作 | DEEP |
| T2 | 跨模块/跨服务变更（≥2 模块或服务），无 T1 强触发 | STANDARD |
| T3 | 单模块内展示或逻辑变更，边界明确，无 T1 因子 | LIGHT |
| T4 | 以上均无法判定 | `PROVISIONAL_STANDARD`（来源标签，附"判定不足"理由；档位按 STANDARD 准备） |

**档位内容要求清单（`depthCoverageLedger` 的规范来源）**：引用 `ai-sdlc/complexity-routing.md` §档位定义——LIGHT 精简主干；STANDARD 覆盖架构、接口、数据、异常、兼容性与验证；DEEP 强制状态机/DB/MQ/事务/回滚/代表数据/边界场景章节。该文件按 §10 同步清单于 G2 收口修订。

### 4.3 状态机（唯一合法转换；S1/S2 走查的唯一结果集）

1. **首轮**：solution-design 按 `requiredDepth` 立即产出方案 + 覆盖台账；不等待 Gate。
2. **verdict 求值**：formal_verdict 对照 `requiredDepth` 档位要求清单与 Ledger 判定，输出且仅输出以下组合之一：
   - `CONFIRMED` + `decisionDepth=requiredDepth`：方案满足当前要求 → 可进入下游（§7.3）；
   - `ESCALATED` + `decisionDepth=requiredDepth'`（requiredDepth'>requiredDepth）：要求上调至 requiredDepth'，回流 solution-design；
   - `CONFIRMED` + `decisionDepth < requiredDepth`：方案为超集，verdict 判定低档已足够——无害降持，记录即可，不回流；
   - `BLOCKED_UNKNOWN` + `decisionDepth=null`：关键事实缺失，无法分级 → 回流补事实（按 finding 指向 intake 或 solution-design），不可进入下游。
3. **升档回流**：ESCALATED 即时使旧方案/旧 Gate/全部下游产物 stale（§5.4）；solution-design 只生产新旧 `requiredDepth` 要求清单的**缺口增量**并更新台账；Re-Gate 时 verdict 对照**上调后的 requiredDepth** 判定 → 可 CONFIRMED（消除对 initial 值的比较，杜绝反复升档）。
4. **合法组合表**：`(decisionStatus, decisionDepth, 下游准入)` 仅有：`(CONFIRMED, LIGHT/STANDARD/DEEP, 准入)`、`(ESCALATED, LIGHT/STANDARD/DEEP, 禁止)`、`(BLOCKED_UNKNOWN, null, 禁止)`。除此之外不存在合法状态。

## 5. 域三：Finding / Ledger / Gate 生命周期（G2-R1-H2）

### 5.1 Finding identity 与状态

- `finding_id = {requirement_id}-F{两位序号}`，由 adversarial_scan 在首次登记时分配，**不可变**；后续轮次引用同一 ID。
- Ledger 行：`{finding_id, round, cause, severity, earliestAffectedNodeId, sourceRevision, evidenceRef, status}`。
- `status ∈ OPEN → RESOLVED | ACCEPTED`：登记者=adversarial_scan；**处置者=formal_verdict**（RESOLVED=已修复并验证；ACCEPTED=PWR scope 级接受，无独立证明仪式）；手动与 runtime 同此。
- finding 一经登记行不可改写，状态迁移以新行追加（保留审计面）。

### 5.2 版本绑定

Gate Result 头部必须绑定：`{designVersion, ledgerDigest, verdictBinding, decisionDepth, decisionStatus, gateVersion}`；manifest 记录各产物 current 版本与 digest（§6）。

### 5.3 轮次

每轮 Re-Gate 产生 Gate Result 新版本（version 递增）；旧版本标 superseded 并保留（审计面，§10 与 artifact-versioning 的历史保存映射）。轮次信息只存在于版本元数据，不进入文件名。

### 5.4 失效传播与发布时点

verdict 输出 `ESCALATED` 或 `FAIL` 的**同一发布事务**内（§6.2 协议）：旧 Gate Result 与技术方案标 stale，全部下游产物标 stale，回流目标节点标 actionable。stale 产物不可作为任何下游准入输入（§7.3 谓词包含 current 条件）。回流目标节点自身在完成新产出前保持 `actionable` 状态（无中间"半失效"态）。

### 5.5 证据身份

implementation/code-review 的代码变更证据 = `{baseRevision, reviewedRevision, changeDigest}`（content-addressed）；不新增固定 diff 文件。

## 6. 域四/五：manifest 三对象与发布协议（G2-R1-H3）

### 6.1 三个对象，互不替代

| 对象 | 唯一职责 | 创建者 | 更新者 |
| --- | --- | --- | --- |
| `00-需求资料/intake.manifest.json` | runtime 入口确认与触发（封闭 schema `loop-intake-manifest:v1`） | requirement-intake | 不随流程演进 |
| `library/{id}/manifest.md` | 七节点生命周期人工投影：`{node, status, artifactPath, version, digest, updatedAt}` 每节点一条 + finding/深度字段引用 + 修复记录 | requirement-intake（**创建职责唯一**） | **publisher**（§6.2） |
| `.sdlc/business_domain/knowledge-target.yaml` | 项目级长期知识路由（G1 规格） | 初始化器 | 状态机 absent → candidate_pending_confirmation → routed |

### 6.2 发布协议（手动与 runtime 共用同一协议与同一 manifest 格式）

1. **输入**：手动面 = 节点完成的结构化声明（Skill 产出）；runtime = journal terminal 事件。二者是各自执行面的事实来源，产出同一格式的 manifest 变更。
2. **步骤**：读当前 manifest → 校验文件实际 digest == 上次发布记录的 digest（不等 → CORRUPT，见 4）→ 确定性生成新全文（固定键序）→ 写 `.tmp` → 原子 rename 覆盖 → 在完成声明/journal 事件中记录新 digest。
3. **崩溃语义**：原子 rename 保证 manifest 只有旧或新两种状态；孤儿 `.tmp` 为垃圾、忽略。**不存在"未完成投影"中间态**。
4. **runtime 投影**：journal 为机器权威；projector 从 journal 事件确定性推导 manifest 变更（字段映射：terminal 事件 kind/depth/status/finding refs → manifest 条目）；Agent 自由文本不得直写。
5. **CORRUPT（解析失败或 digest 不符）→ `MANIFEST_CORRUPT_STOP`**：不静默修复、不重建（DP4）。
6. **人工修复**：人工编辑 manifest 后，追加显式修复记录 `{repairSeq, who, when, reason, correctedEntries}`；下一次发布以**schema 校验 + 按实际产物重算 digest** 重建基线（不比对旧 digest），修复记录保留于文件。
7. **无 manifest 的存量 requirement = 只读归档知识源**（DP4）：不重建；新流程复用其目录 → `BLOCKED_AMBIGUOUS`（原因：无 manifest 存量目录不可复用）。

## 7. 域五/六：失败码、回流映射与统一准入（G2-R1-H2）

### 7.1 PWR

PWR 按 Decision-086 自动推进：verdict 的 scope 级判断即验收；被接受风险在 Ledger 中标 `ACCEPTED`（处置者=formal_verdict），以 risk refs 随行下游；envelope 不得强制 `riskAcceptanceRefs` 非空；无任何 acceptance 仪式产物。

### 7.2 失败码（全执行面统一）

`GATE_FAIL` / `BLOCKED_UNKNOWN` / `BLOCKED_AMBIGUOUS` / `MANIFEST_CORRUPT_STOP` / `JOURNAL_MANIFEST_MISMATCH_STOP` / `ADMISSION_DENIED`。三处 BLOCKED 语义区分：`BLOCKED_UNKNOWN` 仅指 verdict 无法分级/判定；`BLOCKED_AMBIGUOUS` 指结构歧义（双根、无 manifest 复用等）；其余终止态用 `MANIFEST_CORRUPT_STOP`/`JOURNAL_MANIFEST_MISMATCH_STOP`。

### 7.3 回流映射与统一准入表

**回流映射**（finding 的 `earliestAffectedNodeId` 直接命名回流节点，枚举闭合）：`requirement-intake`（需求事实/范围修订类）→ intake；`solution-design`（方案类）→ solution-design 重走 gate；`task-planning` → task-planning；`implementation` → implementation 重跑。不存在"solution-design 之前泛指"——需求修订**必须回 intake**。

**统一准入表**（下游准入谓词；`current` 均指 manifest 中 current 且 digest 一致）：

| 准入 | 谓词 A（裁决面） | 谓词 B（产物面） |
| --- | --- | --- |
| A1 task-planning | Gate Result current ∧ `decisionStatus=CONFIRMED` ∧ gateResult ∈ {PASS, PASS_WITH_RISK} ∧ Ledger 无 OPEN blocking | 技术方案 current |
| A2 implementation | 任务计划 current ∧ PWR 风险 refs 随行 | — |
| A3 code-review | 实现记录 current | 证据绑定（§5.5）完整 |
| A4 knowledge-sync | code-review current ∧ Ledger 无 OPEN blocking（ACCEPTED 不阻断） | routed 声明；非 routed → PROPOSAL_ONLY |

`decisionStatus=ESCALATED` 或 `BLOCKED_UNKNOWN` 的 Gate Result **不满足 A1**——即使 gateResult 字面为 PASS/PWR（堵住 S2 的提前准入解释）。**旧准入条款**（phase-gates 的 OPEN-blocking+ACCEPTED_RISK proof、project-type-matrix 的 DECIDED/accepted-risk evidence）按 §10 同步清单废止。

## 8. 变更清单与负向矩阵

### 8.1 变更清单（G3/G5 授权范围依据 + G2 收口同步项）

| # | 文件 | 变更 | 落点 |
| --- | --- | --- | --- |
| C1 | `ai-sdlc/complexity-routing.md` | decision_status 改 CONFIRMED/ESCALATED/BLOCKED_UNKNOWN；intake 提案输入；档位判据保留为本合同 §4.4 规范来源 | **G2 收口（本修订随附）** |
| C2 | `skills/sdlc-requirement-intake/SKILL.md` | manifest 创建 + §4.2 判定表 + `requestedDepth/initialDepthBasis/decisionScope` 输出；**移除 runtime recovery context 依赖** | G3 |
| C3 | `skills/sdlc-solution-design/SKILL.md` | Core Rule 10 → §4.3 首轮解耦 + 覆盖台账 | G3 |
| C4 | `skills/sdlc-solution-gate/SKILL.md` | 稳定路径 + CONFIRMED/ESCALATED/BLOCKED_UNKNOWN 组合 + 移除 runtime 推进权依赖 | G3 |
| C5 | `skills/sdlc-task-planning/SKILL.md` | A1 准入引用 + 移除 runtime 依赖 | G3 |
| C6 | `skills/sdlc-code-review/SKILL.md` | 清除 PWR 接受者/证据残留 + A3 引用 | G3 |
| C7 | `skills/sdlc-docflow-writer/SKILL.md` | manifest 直写 → publisher 调用 | G3 |
| C8 | 其余 `skills/sdlc-*/SKILL.md` | publisher 更新条款 + §7.3 准入引用 | G3 |
| C9 | `templates/**` | Ledger/Gate 头部元数据（version/current/supersededBy/绑定字段）+ 覆盖台账模板 | G3 |
| C10 | manifest publisher 工具 | §6.2 协议实现（含 schema 校验/修复基线重建） | G3 |
| C11 | `ai-sdlc/artifact-flow.md` | 逐条标注：路径保留；DECIDED/深度前置/准入条款替代 | G3 |
| C12 | `ai-sdlc/artifact-versioning.md` / `artifact-storage.md` | superseded 保留映射（归档目录）；manifest 必需性对齐 intake 全创建；旧深度状态清理 | G3 |
| C13 | `ai-sdlc/development-path-governance.md` / `lifecycle.md` / `phase-gates.md` / `project-type-contract-artifact-matrix.md` | DECIDED→新状态映射；knowledge-sync 准入对齐 A4；accepted-risk evidence 移除 | G3 |
| C14 | `ai-sdlc/loop-finding-lifecycle.md` | finding id/状态迁移映射至 §5 | G5 |
| C15 | `ai-sdlc/loop-artifact-revision.md` / `loop-recovery-protocol.md` | STALE 吸收态复用声明 + 深度结构映射 | G5 |
| C16 | `execution/gateway.ts` | 移除 `decisionDepth:"STANDARD"` 硬编码（549/565），消费 verdict 真实深度 | G5 |
| C17 | `core/node-output-envelope.ts` | 移除 riskAcceptanceRefs 非空强制 | G5 |
| C18 | journal→manifest projector + recovery | §6.2.4 确定性投影 + mismatch STOP_AND_REPORT；formal_verdict 重复 Finding 来源处理 | G5 |
| C19 | `ai-sdlc/shared-business-domain-governance.md` / `standard-package-resolution.md` | G1 根语义引用同步（旧 `.specify` 活动根/profile 解析条款） | G3 |
| C20 | tests/validator 承重点 | §9 表"落点"列逐项落地（G3/G5 各自波次） | G3/G5 |

### 8.2 负向矩阵（每条绑定：规范输入 / 违规变异 / 判定结果 / 承重落点）

| # | 断言 | 规范输入 | 违规变异（应变红） | 判定 | 承重落点 |
| --- | --- | --- | --- | --- | --- |
| N1 | 无硬编码 `decisionDepth:"STANDARD"`；非 STANDARD verdict 输入产出对应深度 | 非 STANDARD verdict 事件 fixture | 恢复 549/565 硬编码 | 输出深度断言 + 字面扫描 | G5 gateway 测试 |
| N2 | 产物目录无轮次后缀派生文件（模式 `[-_]R[0-9]+`） | 多轮 Re-Gate fixture | 生成 `_R1` Gate 文件 | 稳定路径 validator/fixture 文件名断言 | G3 路径 validator + fixture |
| N3 | scan 与 verdict 异 binding；同 binding 拒绝 | 同 binding 双角色执行 fixture | 去除 binding 比较 | 拒绝断言（执行记录实际两次 binding） | G3 执行记录 + G5 binding 校验 |
| N4 | 首轮无 Gate 输入仍可产出待审方案 | 无 verdict 历史的新需求 fixture | 恢复深度前置条款/准入 | 时序断言（design 产物先于任何 verdict）+ prompt 条款扫描 | G3 harness + G5 节点准入 |
| N5 | Agent 自由文本不落 manifest；无 manifest 存量目录复用被拒 | 直写尝试 + 复用尝试 fixture | publisher 绕过 / 移除 DP4 前置阻断 | 拒绝断言（两个独立变异各自变红） | G3 publisher + intake |
| N6 | PWR 无 riskAcceptanceRefs 非空强制、无仪式产物 | PWR fixture | 恢复 envelope 强制 | envelope 断言 + 下游准入场景 | G5 envelope 测试 + G3/G5 准入 |
| N7 | journal/manifest digest 不一致 → STOP_AND_REPORT | 注入不一致 fixture（区分合法发布中间态与真损坏） | 移除 mismatch 检查 | STOP 断言 | G5 projector/recovery 注入测试 |
| N8 | 升档回流=台账缺口补齐：漏补必需项、删除已确认内容分别变红 | 升档 fixture（要求清单 + 已确认内容清单） | 漏补 / 删除受保护内容 | 台账覆盖断言 + 受保护内容 diff 断言 | G3/G5 升档 fixture |
| N9 | 第三份 Gate 权威文件被拒；历史 evidence 引用不误杀 | 第三权威文件 + 历史 evidence fixture | 引入第三文件 / 误杀历史引用 | 稳定路径表比对 + evidence 排除断言 | G3 路径 validator + G5 投影 |

## 9. 与既有合同的关系

- `ai-sdlc/node-capability-contract.md`：§4.2/§4.3 深度条款与输出路径按 §10 同步清单修订；§3 文件名维持 canonical（本合同 §3 已对齐，无第二套路径）。
- `ai-sdlc/complexity-routing.md`：C1（G2 收口随附修订）；档位判据内容保留为 §4.4 规范来源。
- `ai-sdlc/artifact-flow.md`：路径与内容性要求保留；DECIDED/深度前置/准入条款由 C11 替代。
- 其余见 §10 同步清单（每个冲突条款一行处置，不留给实施者自行选择）。

## 10. 现役合同同步清单（G2-R1-H4；处置=替代/保留/修订 + 落点）

| 文件:条款 | 冲突 | 处置 | 落点 |
| --- | --- | --- | --- |
| `complexity-routing.md:19-21` | DECIDED/BLOCKED_UNKNOWN；"gate 唯一裁决点" | 替换状态枚举（CONFIRMED/ESCALATED/BLOCKED_UNKNOWN）；"唯一正式裁决点"保留（intake 为提案非裁决） | C1 @ G2 |
| `complexity-routing.md:36-42,95-111` | 强触发/档位覆盖判据 | 保留并并入 §4.2/§4.4 规范来源 | C1 @ G2 |
| `node-capability-contract.md:52,130,193` | 自称规范源；任务/知识文件名 | 修订深度条款引用本合同；文件名 canonical 已一致（`_任务计划.md`/`_知识同步结果.md`，草案 v0.1 曾误改，已回退） | C1 同族 @ G3 |
| `artifact-flow.md:29,78,86` | DECIDED；按已裁决深度生成 | 路径保留；状态/前置条款替代 | C11 @ G3 |
| `artifact-versioning.md:29,107,135` | 旧文件名/旧状态；旧正文不保留 | 历史保存映射：superseded 版本正文保留于产物目录、仅标 superseded（修正"不保留"） | C12 @ G3 |
| `artifact-storage.md:85,101,262` | manifest 可 not_applicable | 对齐 intake 全创建；旧状态/风险准入清理 | C12 @ G3 |
| `development-path-governance.md:34` / `lifecycle.md:54` | 依赖 DECIDED | CONFIRMED/ESCALATED 映射 | C13 @ G3 |
| `phase-gates.md:132` | OPEN blocking + ACCEPTED_RISK proof | 废止，对齐 A4 | C13 @ G3 |
| `loop-finding-lifecycle.md:29,33,87` | 风险证明；固定 earliest 映射 | 映射至 §5（RESOLVED/ACCEPTED 无仪式；回流枚举闭合） | C14 @ G5 |
| `loop-artifact-revision.md:63,74` / `loop-recovery-protocol.md:47` | STALE 吸收态 | 声明复用；深度结构映射 | C15 @ G5 |
| `project-type-contract-artifact-matrix.md:88` | DECIDED + accepted-risk evidence | 移除，对齐 §7 | C13 @ G3 |
| `change-control.md:111,246` | 需求问题回 intake（与 §7.3 一致，保留）；manifest 临时小节写入 | 回流保留；写入改为 publisher 输入 | C10/C13 @ G3 |
| `skills/sdlc-requirement-intake/SKILL.md:18` 等四处 | runtime recovery context 依赖 | 移除，手动主链自足 | C2/C4/C5 @ G3 |
| `skills/sdlc-code-review/SKILL.md:26` | PWR 接受者/证据 | 清除 | C6 @ G3 |
| `skills/sdlc-docflow-writer/SKILL.md:92,157` | manifest 直写 | 改 publisher 调用 | C7 @ G3 |
| `shared-business-domain-governance.md:8` / `standard-package-resolution.md:22` | 旧 `.specify` 活动根/profile 解析 | G1 根语义引用同步（不重开旧根路由） | C19 @ G3 |

## 11. Revision Record

- 0.2.0（2026-09-05）：按 G2-R1-H1..H4/M1/L1 全量修订——深度状态机封闭（requestedDepth/requiredDepth 分离、四种合法组合、Re-Gate 对照 requiredDepth）；统一准入表 A1–A4 与 ESCALATED 阻断；finding_id/状态迁移/版本绑定/发布时点；manifest 发布协议（原子发布、CORRUPT/修复基线、DP4 保留）；canonical 文件名回退；§10 同步清单全量收口；N2 修正 `[-_]R[0-9]+` 并逐条绑定承重落点；交叉引用更正。
- 0.1.0（2026-09-05）：初稿 PROPOSED（G2-R1 复审 FAIL，见复审结论）。
