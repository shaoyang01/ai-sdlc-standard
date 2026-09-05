# Manual/Runtime Semantic Contract（手动与 runtime 共同语义合同）

> Version: 0.3.0 (PROPOSED)
> Status: 待独立只读复审 + Current User 裁决冻结；冻结后为 G3（手动主路径修复）与 G5（runtime 投影/parity）的唯一语义权威
> 上游: Decision-090 及其[冻结执行计划](../docs/reports/decision-090-c03e-prerun-governance-plan.md) §4/G2 · [需求拆分 v1.0.0](../docs/reports/decision-090-c03e-prerun-requirement-decomposition.md) §4（DP1–DP5）· Decision-084/086 · [v3 规格 v1.1.0](../docs/reports/d088-01-v3-behavior-spec.md)
> 修订: v0.3.0 按 G2-R2-H1/H2/H3/L1 全量修订——深度规范权威分层并全面重写 complexity-routing（H1）；finding 生命周期推广为全链、回流枚举闭合、Ledger-设计版本绑定（H2）；manifest 改为**自证格式**并重定义发布/崩溃/修复协议（H3）；新增 §4.4 并更正全部交叉引用（L1）。

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
| solution-gate / formal_verdict | 技术方案 + FindingLedger | `02-方案审核/{id}_方案审核.md`（Gate Result，§5.4） | Ledger current 且 `scannedDesignVersion` 匹配（§5.6）；异 binding |
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

### 4.2 归一深度判定表（intake 提案权威；用户显式指定永远最高优先）

判定输入限**归一化产物中当前可判定的事实**。`decisionScope` 一并记录：

| 序 | 条件 | `requestedDepth` |
| --- | --- | --- |
| T1 | 存在任一强触发：状态机/状态流转/单据生命周期变更；DB schema/关键数据写入/迁移/回填/一致性变化；MQ 生产/消费/重试/幂等/顺序/补偿变化；事务/幂等/补偿/回滚边界复杂；定时任务/监听器/异步/批处理/流程编排变化；跨系统接口；不可逆操作；权限/资金/库存/履约/计费/结算等高影响域 | DEEP |
| T2 | 多模块/多服务/跨仓协作，**但无任何 T1 强触发**（纯协作拆分） | STANDARD |
| T3 | 单模块内展示或逻辑变更，边界明确，无 T1 因子 | LIGHT |
| T4 | 以上均无法判定 | `PROVISIONAL_STANDARD`（来源标签；档位按 STANDARD 准备，附"判定不足"理由） |

**分层权威**：本表是 **intake 提案权威**；formal_verdict 仍是**唯一正式裁决点**，可依方案揭示的风险上调（ESCALATED）。`complexity-routing.md` 的 DEEP 触发清单已按 T1 重写（§10 C1）；其判据内容与 T1 因子一一对应，无第二套档位规则。

### 4.3 状态机（唯一合法转换）

1. **首轮**：solution-design 按 `requiredDepth` 立即产出方案 + 覆盖台账；不等待 Gate。
2. **verdict 求值**：输出且仅输出以下组合之一：
   - `CONFIRMED` + `decisionDepth=requiredDepth`：满足当前要求 → 可进入下游；
   - `CONFIRMED` + `decisionDepth < requiredDepth`：方案为超集，verdict 判定低档已足够——无害降持，记录即可；
   - `ESCALATED` + `decisionDepth=requiredDepth'`（>requiredDepth）：要求上调，回流 solution-design；
   - `BLOCKED_UNKNOWN` + `decisionDepth=null`：关键事实缺失 → 按 finding 指向回流（intake 或 solution-design），不可进入下游。
3. **升档回流**：ESCALATED 即时使旧方案/旧 Gate/全部下游 stale（§5.4）；solution-design 只生产新旧 `requiredDepth` 清单的**缺口增量**并更新台账；Re-Gate 对照**上调后的 requiredDepth** 判定 → 可 CONFIRMED（无反复升档）。
4. **合法组合表**：`(CONFIRMED, LIGHT/STANDARD/DEEP, 准入)`、`(ESCALATED, LIGHT/STANDARD/DEEP, 禁止)`、`(BLOCKED_UNKNOWN, null, 禁止)`。无其他合法状态。

### 4.4 档位内容要求清单（`depthCoverageLedger` 规范来源）

引用 `ai-sdlc/complexity-routing.md` 档位定义（§10 C1 修订版）：LIGHT 精简主干；STANDARD 覆盖架构、接口、数据、异常、兼容性与验证；DEEP 强制状态机/DB/MQ/事务/回滚/代表数据/边界场景章节。该清单是台账逐项标注的唯一规范来源；修订即本合同修订。

## 5. 域三：Finding 全链生命周期（G2-R2-H2：适用于所有 finding 来源，不限 Gate）

### 5.1 登记与处置（按来源定义；全链闭合）

| finding 来源 | 登记者 | 登记位置 | 处置者 | 处置 |
| --- | --- | --- | --- | --- |
| 方案类（design 阶段） | adversarial_scan | `{id}_FindingLedger.md` | formal_verdict | RESOLVED（已修复并验证）/ ACCEPTED（PWR scope 接受）/ 维持 OPEN |
| 实现类（code-review/implementation 阶段） | code-review | `{id}_代码审核.md`（finding 段） | code-review（返工修复后复验） | RESOLVED（direct rework 后验证，**不重走 Gate**，I-D）/ 维持 OPEN |
| 知识类（knowledge-sync 阶段） | knowledge-sync | `{id}_知识同步结果.md`（finding 段） | knowledge-sync | RESOLVED / 维持 OPEN |
| 深度/事实类（verdict 阶段） | formal_verdict | `{id}_方案审核.md` + Ledger | formal_verdict | BLOCKED_UNKNOWN 回流后由复验关闭 |

- `finding_id = {requirement_id}-F{两位序号}`，全 requirement 单一序列，任一来源登记即占用，**不可变**；状态迁移以新行追加。
- `earliestAffectedNodeId` 的合法值域 = 七节点全集（含 `code-review`、`knowledge-sync`）。
- OPEN finding 的阻断范围由 §7.3 准入表定义（仅阻断其 `earliestAffectedNodeId` 下游的准入），不扩大到无关节点。

### 5.2 版本绑定

Gate Result 头部绑定 `{designVersion, ledgerDigest, scannedDesignVersion, verdictBinding, decisionDepth, decisionStatus, gateVersion}`；**准入要求 `scannedDesignVersion == designVersion`**（Ledger 所审方案与 Gate 所裁方案为同一修订，否则 verdict 不得产出，须重扫）。

### 5.3 轮次

每轮 Re-Gate 产生 Gate Result 新版本（version 递增）；旧版本标 superseded 并**保留正文**（§10 C12 历史保存规则）。轮次只存在于版本元数据，不进入文件名。

### 5.4 失效传播与发布时点

verdict 输出 `ESCALATED` 或 `FAIL` 时，旧 Gate/方案/下游 stale 标记与新 Gate 条目在**同一 manifest 修订**（§6.2 单次原子写入）中生效——"同事务"即单文件原子性，不依赖跨记录协议。stale 产物不可作为下游准入输入；回流目标节点完成新产出前保持 `actionable`。

### 5.5 证据身份

implementation/code-review 的代码变更证据 = `{baseRevision, reviewedRevision, changeDigest}`（content-addressed）；不新增固定 diff 文件。

## 6. 域四/五：manifest 三对象与自证发布协议（G2-R2-H3）

### 6.1 三个对象，互不替代

| 对象 | 唯一职责 | 创建者 | 更新者 |
| --- | --- | --- | --- |
| `00-需求资料/intake.manifest.json` | runtime 入口确认与触发（`loop-intake-manifest:v1`） | requirement-intake | 不随流程演进 |
| `library/{id}/manifest.md` | 七节点生命周期人工投影（§6.2 格式） | requirement-intake（创建职责唯一） | **publisher**（§6.2） |
| `.sdlc/business_domain/knowledge-target.yaml` | 项目级长期知识路由（G1 规格） | 初始化器 | absent → candidate_pending_confirmation → routed |

### 6.2 自证发布协议（手动与 runtime 共用）

1. **格式（自证）**：manifest = `head`（schema_version/requirement_id/updated_at/publishSeq）+ `entries`（每节点 `{node, status, artifactPath, version, digest, updatedAt}` + finding 索引 + 深度字段引用 + 修复记录）+ **`manifestDigest = sha256(规范化的 head+entries)`**。digest 内嵌于文件——文件自带完整性证据，**不存在 manifest 之外的 digest 记录**，因此不存在跨记录崩溃窗口。
2. **发布步骤**：读 manifest → 重算 `manifestDigest` 比对（不符 → CORRUPT，见 5）→ 确定性生成新 `head+entries`（含本次全部变更：新节点条目、stale 标记、§5.4 同事务语义）→ 计算新 `manifestDigest` → 原子 rename 写入 → 完成。**发布是幂等的**：崩溃后文件为旧或新，两者均自洽，重跑发布得到同一结果。
3. **runtime 投影**：journal 为机器权威；projector 从 journal 事件确定性推导 entries。发布前交叉校验：由 journal 推导的当前条目必须与 manifest entries 在最后已知事件之后一致——不一致（超出发بو事件范围的分叉）→ `JOURNAL_MANIFEST_MISMATCH_STOP`。手动面无 journal，其完成声明即事实来源（两执行面同格式同协议，语义 parity）。
4. **CORRUPT**：self-digest 不符或解析失败 → `MANIFEST_CORRUPT_STOP`，不静默修复、不重建（DP4）。
5. **人工修复**：人工修正 entries → **重算并写入新 `manifestDigest`** → 追加修复记录（who/when/reason/correctedEntries，属 entries 一部分、进入新 digest）。信任重建 = self-digest 自洽 + 各 entry 的产物 digest 与实际文件核验 + runtime 面 journal 交叉校验；三者通过，下一次发布正常进行。修复记录永久保留于文件。
6. **无 manifest 的存量 requirement = 只读归档知识源**（DP4）：不重建；新流程复用其目录 → `BLOCKED_AMBIGUOUS`。

## 7. 域六：PWR、失败码、回流映射与统一准入

### 7.1 PWR

PWR 自动推进：verdict 的 scope 级判断即验收；被接受风险在 Ledger 标 `ACCEPTED`（处置者=formal_verdict），以 risk refs 随行下游；envelope 不得强制 `riskAcceptanceRefs` 非空；无 acceptance 仪式产物。

### 7.2 失败码

`GATE_FAIL` / `BLOCKED_UNKNOWN` / `BLOCKED_AMBIGUOUS` / `MANIFEST_CORRUPT_STOP` / `JOURNAL_MANIFEST_MISMATCH_STOP` / `ADMISSION_DENIED`。区分：`BLOCKED_UNKNOWN` 仅指 verdict 无法分级/判定；`BLOCKED_AMBIGUOUS` 指结构歧义（双根、无 manifest 复用）；文件级终止用 `MANIFEST_CORRUPT_STOP`/`JOURNAL_MANIFEST_MISMATCH_STOP`；下游准入拒绝用 `ADMISSION_DENIED`。

### 7.3 回流映射与统一准入

**回流映射（枚举闭合 = 七节点全集）**：`earliestAffectedNodeId` 直接命名回流节点——requirement-intake（需求事实/范围）、solution-design（方案）、solution-gate（裁决过程缺陷 → 重跑 gate）、task-planning（计划）、implementation（实现返工，code-review finding 的直达返工不重走 Gate，I-D）、code-review（审核缺陷 → 重跑 code-review）、knowledge-sync（知识条目）。

**统一准入表**（`current` = manifest 中 current 且 digest 一致）：

| 准入 | 谓词 A（裁决面） | 谓词 B（产物面） |
| --- | --- | --- |
| A1 task-planning | Gate Result current ∧ `decisionStatus=CONFIRMED` ∧ gateResult ∈ {PASS, PASS_WITH_RISK} ∧ 无 OPEN blocking（§5.1 阻断范围） | 技术方案 current |
| A2 implementation | 任务计划 current ∧ PWR 风险 refs 随行 | — |
| A3 code-review | 实现记录 current | 证据绑定（§5.5）完整 |
| A4 knowledge-sync | code-review current ∧ 无 OPEN blocking（ACCEPTED 不阻断） | routed 声明；非 routed → PROPOSAL_ONLY |

`ESCALATED`/`BLOCKED_UNKNOWN` 的 Gate Result 不满足 A1（即使字面 PASS/PWR）。旧准入条款（phase-gates、project-type-matrix 等）按 §10 废止。

## 8. 变更清单与负向矩阵

### 8.1 变更清单

同 v0.2.0 §8.1（C1–C20），并按 G2-R2 修订：C1 扩展为 complexity-routing **全段重写**（触发清单按 T1/T2 分层、全部 DECIDED 替换、决策字段对齐 §4.1）；C8 明确含 `skills/sdlc-implementation/SKILL.md:15` runtime 依赖移除；C20 落点表随 §9 更新。

### 8.2 负向矩阵

同 v0.2.0 §8.2（N1–N9，含 N2 `[-_]R[0-9]+` 与逐条承重落点），并修订：**N7 判定依据更新**——"合法发布中间态"不存在（§6.2 自证格式下崩溃后文件必自洽），注入变异为"破坏 self-digest"或"journal 分叉"，预期分别变红为 `MANIFEST_CORRUPT_STOP` / `JOURNAL_MANIFEST_MISMATCH_STOP`。

## 9. 复审裁决的落地注记（不构成本轮授权）

FREEZE 后 G3/G5 执行注意：C10 publisher 必须实现 §6.2 自证格式（含修复基线重建）；C18 projector 的 mismatch 判定按 §6.2.3 交叉校验；C2/C4 的深度字段输出按 §4.1 结构化承载；N 系列承重落点见 §8.2 表。

## 10. 现役合同同步清单

同 v0.2.0 §10 全表（16 行处置），并按 G2-R2 修订/精确化：

- C1 行扩展：complexity-routing 全段重写——触发清单按 T1/T2 分层（"多模块/多服务"从 DEEP 默认触发改为"纯协作拆分 → T2 提案 STANDARD、verdict 可依风险升档"）；第 95–111 行 DEEP 触发清单中与 T1 重叠项保留、纯协作项移入 T2；**第 138、153–155、176–177、188 行全部 DECIDED 替换**；"决策字段"节对齐 §4.1 七字段。@ **G2 收口（本修订随附，已完成）**
- `node-capability-contract.md:52` 规范源声明：限定为"节点合同模板与准入引用的规范源；流程语义与深度状态机以 manual-runtime-semantic-contract.md 为权威"。@ G3（C1 同族）
- `skills/sdlc-implementation/SKILL.md:15` runtime 依赖移除：**单列 C8-a**，不再由"其余 Skills"吸收。@ G3
- `skills/sdlc-solution-design/SKILL.md:24` 首轮循环：C3 承载，补入 §10。@ G3
- 其余各行（artifact-flow/artifact-versioning/artifact-storage/development-path/lifecycle/phase-gates/loop-finding-lifecycle/loop-artifact-revision/loop-recovery-protocol/project-type-matrix/change-control/code-review/docflow-writer/shared-knowledge/package-resolution）处置不变，见 v0.2.0 §10。

## 11. Revision Record

- 0.3.0（2026-09-05）：按 G2-R2-H1/H2/H3/L1 修订——深度规范权威分层 + complexity-routing 全段重写随附（H1）；finding 生命周期推广为全链七节点枚举、按来源定登记/处置者、Ledger `scannedDesignVersion` 绑定、Decision-086 直返工保留（H2）；manifest 自证格式（manifestDigest 内嵌，消除跨记录崩溃窗口）+ 幂等发布 + CORRUPT/修复基线重定义（H3）；新增 §4.4、更正交叉引用（L1）。N7 判定依据同步更新。
- 0.2.0（2026-09-05）：按 G2-R1 全量修订（G2-R2 复审：H1 规范同步、H3 发布协议、H4 清单完整性仍有缺口；字段拆分/A1 拒绝/canonical 文件名/矩阵补齐被确认成立并保留）。
- 0.1.0（2026-09-05）：初稿 PROPOSED（G2-R1 复审 FAIL）。
