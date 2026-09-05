# Manual/Runtime Semantic Contract（手动与 runtime 共同语义合同）

> Version: 0.1.0 (PROPOSED)
> Status: 待独立只读复审 + Current User 裁决冻结；冻结后为 G3（手动主路径修复）与 G5（runtime 投影/parity）的唯一语义权威
> 上游: Decision-090 及其[冻结执行计划](../docs/reports/decision-090-c03e-prerun-governance-plan.md) §4/G2 · [需求拆分 v1.0.0](../docs/reports/decision-090-c03e-prerun-requirement-decomposition.md) §4（G2 七域，DP1–DP5）· Decision-084/086 · [v3 规格 v1.1.0](../docs/reports/d088-01-v3-behavior-spec.md)（G1 交付，本文的上游前置）
> 事实基线: 本稿起草时归集的冲突证据——`node-capability-contract.md` §4.2 深度循环条款、`skills/sdlc-solution-design/SKILL.md` Core Rule 10、`execution/gateway.ts:549/565` `decisionDepth: "STANDARD"` 硬编码、`core/node-output-envelope.ts` riskAcceptanceRefs 强制、`sdlc-requirement-intake` 无 manifest 职责条款。

## 1. 定位与权威关系

1. 本合同是**七节点流程语义的唯一权威**：节点顺序、输入输出、稳定路径、深度语义、Finding/Ledger/Gate 生命周期、manifest 职责、失败码与回流。手动 Skill prompt 与 LOOP runtime 代码消费同一份合同；二者实现机制可以不同（prompt vs 代码），**语义必须等价**（Decision-084 单轨约束）。
2. 冲突时本合同优先于：各 `skills/sdlc-*/SKILL.md` 的流程性条款、`execution/gateway.ts` 等运行时代码、`ai-sdlc/node-capability-contract.md` §4.2/§4.3 的深度条款、`ai-sdlc/artifact-flow.md` 的路径条款（路径以本合同 §3 表为准，二者一致）。非流程性内容（如 Skill 的领域指令）不受影响。
3. 本合同**只定义语义，不授权实现**：G3（手动面落地）与 G5（runtime 落地）分别按冻结计划 §6 申请授权；本合同的变更清单（§7）即其范围依据。
4. 变更控制：任何语义修订走本文件的 Revision Record；已冻结字段（§3–§8）的修改须同时更新 §9 负向矩阵并说明对 G3/G5 已落地面的影响。

## 2. 冻结不变量（继承并收口）

- I-A 单轨 7+1：`requirement-intake → solution-design → solution-gate → task-planning → implementation → code-review → knowledge-sync`；`docflow-writer` 提供模板职能，不是流程节点。
- I-B solution-gate 双 binding 隔离：`adversarial_scan` 与 `formal_verdict` 不得由同一 Agent binding 执行（手动与 runtime 同此约束）。
- I-C 人工 Git 边界：任何执行面不产生业务仓 commit/push/PR。
- I-D PWR 自动推进（Decision-086）：verdict agent 的 scope 级判断即风险验收，**无** risk acceptance proof 仪式。
- I-E 失败封闭：类型不清/证据不足 → BLOCKED，零部分推进。
- I-F 知识不可覆盖：任何节点不得改写既有确认知识（G1 规格 I1 同源）。
- I-G 单一生命周期权威：运行时状态以 journal 为机器权威；`manifest.md` 是其人工投影（§6）；二者之外不存在第三份生命周期权威。

## 3. 域一：节点输入/输出与稳定路径（冻结表）

产物根为 `library/{requirement_id}/`。下表为**唯一**合法稳定路径集合；不带版本后缀的文件名恒定，版本与生命周期状态由文件头元数据 + `manifest.md` 表达（§5），**禁止**以 `-R1/-R2` 等轮次后缀派生新文件名。

| 节点 | 输入（当前版本） | 输出稳定路径 | 关键准入 |
| --- | --- | --- | --- |
| requirement-intake | 用户原始输入 | `00-需求资料/{id}_需求摘要.md`；`00-需求资料/intake.manifest.json`（§6 对象一）；`library/{id}/manifest.md`（**本节点创建**，§6 对象二） | 归一化事实完备；深度提案产出（§4） |
| solution-design | `{id}_需求摘要.md`；深度提案（§4） | `01-技术方案/{id}_技术方案.md`（含深度覆盖台账，§4.3） | 摘要有效；**不等待 Gate**（首轮解耦，§4.2） |
| solution-gate / adversarial_scan | 技术方案当前版本 | `02-方案审核/{id}_FindingLedger.md`（finding 追加，§5） | 与 formal_verdict 异 binding |
| solution-gate / formal_verdict | 技术方案 + FindingLedger | `02-方案审核/{id}_方案审核.md`（Gate Result：PASS/FAIL/PASS_WITH_RISK/BLOCKED_UNKNOWN + `decisionDepth`/`decisionStatus`） | 无未解决 Blocking；扫描/裁决异 binding |
| task-planning | Gate Result（当前）+ 技术方案 | `03-任务规划/{id}_任务规划.md` | verdict ELIGIBLE（PASS 或 PWR） |
| implementation | 任务计划 | `04-实现记录/{id}_实现记录.md` + 生产代码变更（工作区内） | 计划存在且未失效 |
| code-review | 实现记录 + 代码 diff | `05-代码审核/{id}_代码审核.md` | 实现记录有效 |
| knowledge-sync | 代码与验证证据 + routed 声明 | `06-知识同步/{id}_知识同步.md` + `.sdlc/business_domain/**`（受 G1 规格约束） | 声明 routed；非 routed 一律 PROPOSAL_ONLY |

## 4. 域二：深度语义（裁决点③ c′ 方案冻结）

### 4.1 字段

| 字段 | 类型 | 产生者 | 语义 |
| --- | --- | --- | --- |
| `initialDepthBasis` | `user_requested` \| `normalized_proposal` \| `PROVISIONAL_STANDARD` | requirement-intake | 首轮设计输入；约束性**下限** |
| `proposedDepthBasis` | 枚举 + 理由数组 | requirement-intake（§4.2 判定表） | 仅 `normalized_proposal` 时附带 |
| `depthCoverageLedger` | 台账（§4.3） | solution-design | 已覆盖/未覆盖的档位要求清单 |
| `decisionDepth` | LIGHT \| STANDARD \| DEEP | **仅** formal_verdict | 正式档位，全流程唯一正式深度来源 |
| `decisionStatus` | CONFIRMED \| ESCALATED | formal_verdict | 确认（零回流）/ 升档（触发增量回流） |

### 4.2 归一深度判定表（枚举、可测试；runtime 与手动共用同一表）

按序求值，首条命中即提案；**用户显式指定永远最高优先，跳过本表**：

| 序 | 条件（归一化产物中可判定） | 提案 |
| --- | --- | --- |
| T1 | 涉数据迁移/ schema 变更 / 不可逆操作 / 跨系统接口 | DEEP |
| T2 | 跨模块（≥2 个模块/服务）单条可行路线 | STANDARD |
| T3 | 单模块内展示或逻辑变更，无 T1 因子 | LIGHT |
| T4 | 以上均无法判定（信息不足） | `PROVISIONAL_STANDARD`（兜底，附"判定不足"理由） |

禁止依赖表外启发式；判定表修订即本合同修订。

### 4.3 首轮、升档与降档

1. **首轮解耦**：solution-design 按下限档位**立即**产出可审核方案，不等待 Gate（手动 prompt 与 runtime 同此；`SKILL.md` Core Rule 10"档位未裁决前不产出正式方案内容"与 contract §4.2 深度循环条款按本条修订）。
2. **覆盖台账**：方案头部携带 `depthCoverageLedger`——按 LIGHT/STANDARD/DEEP 三档要求清单逐项标注"已覆盖/未覆盖"；未覆盖项**必须显式列出**，不许留空（虚报由 formal_verdict 对照判定打回）。
3. **确认**：formal_verdict 判定 `decisionDepth = initialDepthBasis 档位` 且方案满足该档要求 → `decisionStatus=CONFIRMED`，零回流。
4. **升档**：Gate 判定方案揭示的风险要求更高档位 → `decisionStatus=ESCALATED`、`decisionDepth` 升档、回流 solution-design；回流**只生产台账缺口对应的增量内容**并更新台账，已审核部分不重写（G1-R2 裁决的增量补强语义）。
5. **降档**：实际方案超出声明档位为无害超集——`decisionDepth` 记录较低值，不回流、不删减。
6. **BLOCKED_UNKNOWN**：verdict 证据不足时 fail-closed，不猜测。

## 5. 域三：Finding / Ledger / Gate 生命周期（冻结）

1. **Finding identity**：`{cause, severity, earliestAffectedNodeId, sourceRevision, evidenceRef}`；finding 一经登记不可改写，只能被后续状态（解决/接受/升级）取代。
2. **两个稳定产物**：`{id}_FindingLedger.md`（scan 与 verdict 共用的唯一台账，行式追加）与 `{id}_方案审核.md`（formal_verdict 的唯一正式结果）。轮次、current/stale/superseded 由**文件头元数据**（version/updatedAt/supersededBy）与 `manifest.md` 表达；新轮次 = 原位新版本，禁止派生 `-Rn` 文件。
3. **角色边界**：adversarial_scan 只产 Ledger 行；formal_verdict 只消费 Ledger 并产 Gate Result；二者异 binding（I-B）。
4. **失效传播**：上游节点回流时，其下游全部产物在 `manifest.md` 标记 stale；重新产出后恢复 current；被取代的版本标 superseded，文件保留（审计面）。

## 6. 域四/五：manifest 三对象与 journal 投影（冻结）

### 6.1 三个对象，互不替代

| 对象 | 唯一职责 | 创建者 | 更新者 |
| --- | --- | --- | --- |
| `00-需求资料/intake.manifest.json` | runtime 入口确认与触发（封闭 schema `loop-intake-manifest:v1`） | requirement-intake | 不随流程演进 |
| `library/{id}/manifest.md` | 七节点生命周期人工投影：节点状态、产物 current/stale/superseded、digest 交叉绑定 | requirement-intake（**创建职责唯一**） | 各节点经**确定性 publisher** 原子更新；禁止 Agent 自由文本直写 |
| `.sdlc/business_domain/knowledge-target.yaml` | 项目级长期知识路由（G1 规格） | 初始化器 | 状态机 absent → candidate_pending_confirmation → routed |

### 6.2 生命周期规则（含 DP4 裁决）

1. requirement-intake 创建 `manifest.md`（含 initialDepthBasis 与全节点骨架）；此后每节点完成即原子更新对应条目（写临时文件 + 原子替换，digest 记录）。
2. **无 manifest 的存量 requirement = 只读归档知识源**（DP4）：knowledge-sync 可消费其知识内容，但不进入生命周期；新流程**不得**复用无 manifest 的存量目录——试图复用 → `BLOCKED`（提示新建 requirement）。**不存在重建/回填模式。**
3. `manifest.md` 损坏或 digest 与实际产物不一致 → `STOP`（不静默修复、不静默覆盖）；修复是显式的人工动作，修复后须在 manifest 中留修复记录。
4. runtime 侧：journal 是机器恢复权威；`manifest.md` 由确定性 projector 从 journal 事件投影生成（G5 落地），digest 交叉绑定；**不一致 → STOP_AND_REPORT**。

## 7. 域六：PWR 口径与失败码（冻结）

1. PWR（PASS_WITH_RISK）按 Decision-086 自动推进：verdict 的 scope 级判断即验收；风险作为普通 risk refs 随行；**envelope 不得再强制 `riskAcceptanceRefs` 非空**（该强制按本条废除，G5 落地）；不存在 risk acceptance 事件/仪式。
2. 失败码（跨执行面统一）：`GATE_FAIL` / `BLOCKED_UNKNOWN` / `BLOCKED_AMBIGUOUS` / `MANIFEST_CORRUPT_STOP` / `JOURNAL_MANIFEST_MISMATCH_STOP` / `ADMISSION_DENIED`。
3. 回流路由：finding 的 `earliestAffectedNodeId` 决定回流节点（implementation → implementation 重跑；solution-design 之前 → solution-design 重走 gate）；同 run 内下游准入按 §3 表"关键准入"列判定。

## 8. 域七：变更清单与负向矩阵

### 8.1 变更清单（G3 / G5 授权申请的范围依据；机械可核对）

| 面文件 | 变更 | 落地波 |
| --- | --- | --- |
| `skills/sdlc-requirement-intake/SKILL.md` | 增 manifest 创建职责 + §4.2 判定表执行 + `initialDepthBasis` 输出 | G3 |
| `skills/sdlc-solution-design/SKILL.md` | Core Rule 10 替换为 §4.3 首轮解耦 + 覆盖台账 | G3 |
| `skills/sdlc-solution-gate/SKILL.md` | Ledger/Gate 稳定路径 + CONFIRMED/ESCALATED + 升档增量回流条款 | G3 |
| 其余 `skills/sdlc-*/SKILL.md` | manifest 确定性更新条款 + 下游准入引用 | G3 |
| `templates/**` | FindingLedger/Gate Result 头部元数据（version/current/supersededBy）+ 覆盖台账模板 | G3 |
| manifest publisher/reconcile 工具 | 确定性原子更新 + STOP 语义 | G3 |
| `execution/gateway.ts` | 移除 `decisionDepth:"STANDARD"` 硬编码（549/565），消费 verdict 真实深度 | G5 |
| `core/node-output-envelope.ts` | 移除 riskAcceptanceRefs 非空强制（§7.1） | G5 |
| journal→manifest projector | §6.4 确定性投影 + mismatch STOP_AND_REPORT | G5 |

### 8.2 负向矩阵（每条可机械断言；违反即不满足本合同）

| # | 断言 | 检查方式 |
| --- | --- | --- |
| N1 | runtime 任何路径不得输出硬编码 `decisionDepth: "STANDARD"` | gateway 源码扫描（字面排除）+ parity fixture（同输入下手动/runtime 深度一致） |
| N2 | 产物目录不得出现 `_R\d` 轮次后缀生命周期文件 | 文件名断言（fixture 全量） |
| N3 | 同一 Agent binding 不得同时执行 adversarial_scan 与 formal_verdict | binding 注册表断言 |
| N4 | 首轮方案产出不得以 Gate 裁决为前置（手动 prompt 无该条款；runtime 无该准入） | prompt 条款扫描 + fixture 时序断言 |
| N5 | manifest.md 不得被 Agent 自由文本直写；无 manifest 存量目录不得被新流程复用（DP4） | 写入路径审计 + BLOCKED 用例 |
| N6 | PWR 不得要求 riskAcceptanceRefs 非空；不得出现 risk acceptance 仪式产物 | envelope 断言 + 产物面扫描 |
| N7 | journal/manifest digest 不一致必须 STOP_AND_REPORT，不得静默覆盖 | 注入 fixture 断言 |
| N8 | 升档回流产物必须携带更新后的覆盖台账且未删除已确认内容 | fixture diff 断言 |
| N9 | solution-gate 双产物之外不得存在其他 Gate 权威文件 | 稳定路径表比对 |

## 9. Revision Record

- 0.1.0（2026-09-05）：初稿 PROPOSED。七域冻结草案 + 变更清单 + 负向矩阵 N1–N9；整合裁决 DP1–DP5、c′ 深度合成、DP4 无重建语义。
