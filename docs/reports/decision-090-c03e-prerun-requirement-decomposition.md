# C03-E-PRE-RUN 需求拆分设计

> Version: 1.0.0
> Status: ACCEPTED（2026-09-05，Current User 逐条裁决①–⑤后接受；本文成为 G1 启动输入与各包需求冻结基线）
> 上游权威: [Decision-090](../decisions/Decision-090-c03e-prerun-governance-readiness-replan.md) · [冻结执行计划](decision-090-c03e-prerun-governance-plan.md)
> Date: 2026-09-04
> 授权声明: 本文是规划文档，不授权任何代码修改、Skill/runtime 实施或业务仓操作；每包实施仍按冻结计划 §6 节奏单独申请授权。恢复入口仍是 Control Plane STATE。

## 1. 拆分原则与需求模型

### 1.1 三条拆分原则

1. **分层冻结（P-STAGED-FREEZE）**：D-088-01 的教训是在未稳定的需求边界上持续优化实现。因此只有当前活动 Gate（G1）的需求拆到条目级；G2–G6 拆到需求域级，条目级细则在各包 Gate 启动时的"合同/不变量复核"步骤冻结（冻结计划 §6 节奏），避免对尚未存在的共同语义合同（D-090-01 产物）做投机性细化。
2. **条目可验收（P-VERIFIABLE）**：每个条目必须能映射到一种验收证据类型（测试断言 / 审查结论 / 产物文件 / STATE 事实），不允许只写方向性描述。
3. **需求不等于授权（P-REQ-NOT-AUTH）**：需求条目的冻结只说明"要做什么、怎么算做完"；实施授权仍由 STATE `next_transition` + Current User 逐包给出。

### 1.2 需求 ID 与状态机

- ID 方案：`D-<decision>-<seq>-R<nn>`（如 `D-088-01-R01`），与既有包编号 `D-<decision>-<seq>` 及 findings 命名（`D088-R1-H*`）同族。
- 状态机：`PROPOSED → FROZEN（该包 Gate 启动时经 Current User 确认）→ SATISFIED（证据落库）`；变更走 `SUPERSEDED` 并留新旧映射，不原地改写已冻结条目。
- 本文角色：G1 条目（§3）在 Current User 接受本文后即视为 `FROZEN` 候选，G1 第一个动作是将其细化为 v3 行为规格；G2–G6 的需求域（§4–§8）只锁定范围边界，条目编号在各包启动时分配。

## 2. 拆分总览

| Gate | 工作包 | 拆分粒度 | 数量 | 条目冻结时点 |
| --- | --- | --- | --- | --- |
| G1 | D-088-01 | **条目级** | 27 条（A–G 七模块，含 2 个内嵌裁决点） | Current User 接受本文后，随 v3 规格冻结 |
| G2 | D-090-01 | 需求域级 | 7 个域 | G2 启动时 |
| G3 | D-090-02 | 需求域级 | 6 个域（对应冻结计划六子任务） | G3 启动时 |
| G4 | D-087-01..05 | 包级调整点 | 5 个调整点 + 1 个授权裁决 | G4 启动时（delta assessment） |
| G5 | D-090-03 | 需求域级 | 5 个域 | G5 启动时 |
| G6 | D-090-04 | 矩阵级 | 3 个域（矩阵轴/比较对象/完成门） | G6 启动时 |

依赖链不变（冻结计划 §4）：G0（已完成）→ G1 → G2 → G3 → G4 → G5 → G6 → 申请 run8。G2–G6 的需求域边界以冻结计划对应小节为唯一来源，本文仅做结构化引用，不新增范围。

## 3. G1 — D-088-01 需求条目（本轮冻结对象）

### 3.0 G1 交付链（两个阶段）

- **阶段 A（只读，无需实施授权）**：按 R01–R22 冻结 v3 行为规格与逐文件迁移分类方法 → 对候选实现 `a626335` 做相对 v3 的只读差距审查（R27）→ 输出有界修复清单 → **停等 Current User 实施授权**。
- **阶段 B（实施授权后）**：按修复清单实现 → R23/R24 矩阵全绿 → R26 旧 findings 重归因关闭 → 一次根因合并式只读复审 → Current User 裁决 G1 完成。
- 候选事实基线（差距审查锚点，@ `a626335`）：`bootstrap-knowledge-target.sh`（1822 行：`legacy_root_present`/`detect_profile_hint` 检测、`generate_*` 八类生成件、`scan_and_stage_candidates` 聚类、staging+digest 原子写、`plan_file` 计划面）、`bootstrap-entry-coverage-profile.sh`（662 行）、validator 与测试（R1/R2 两轮修复共 8 个 fix 提交）。

### 3.1 模块 A — 输入检测 DETECT

| ID | 需求条目 | 验收证据 |
| --- | --- | --- |
| D-088-01-R01 | 四类输入 `NEW_EMPTY` / `EXISTING_CODE_NO_KNOWLEDGE` / `LEGACY_SDD` / `LEGACY_SDLC_SDD` 的判定规则必须枚举化（`.sdlc` 存在性、`business_domain` 完整性、`.specify`/speckit 残留、三份治理 YAML 特征、代码树信号），不得依赖隐式启发 | v3 规格判定表 + 检测用例 |
| D-088-01-R02 | LEGACY 必须区分原版 SDD 与 SDLC-SDD（后者以三份治理 YAML + 混合流程语义为特征）；误判视为验收失败 | 判定用例含两类 legacy 对照 |
| D-088-01-R03 | 类型不清或同一文件同时承载知识与旧流程语义 → `BLOCKED_AMBIGUOUS` + 逐文件清单，**零部分升级**（不做任何部分初始化） | 歧义场景用例断言零写入 |
| D-088-01-R04 | 多信号并存时输出全部 profile 判定及依据（继承候选 `e37b523` 多 profile 行为并规格化） | 混合信号用例 |
| D-088-01-R05 | 检测幂等：同一输入重复检测输出一致（含输出顺序稳定） | 重复检测比对断言 |

### 3.2 模块 B — 迁移规划 PLAN

| ID | 需求条目 | 验收证据 |
| --- | --- | --- |
| D-088-01-R06 | 每个 Legacy/既有文件必须获得 `PRESERVE` / `TRANSFORM` / `RETIRE` / `ADD` / `BLOCKED_AMBIGUOUS` 之一并附判定理由；分类表是 APPLY 的唯一输入 | 分类表 schema + 覆盖用例 |
| D-088-01-R07 | `RETIRE` 仅限旧流程承载件（旧 templates、旧 workflow、旧脚本）；迁移后活动新表面不得残留旧 SDD/SDLC-SDD owner/rail 语义 | 迁移后禁词/引用扫描 |
| D-088-01-R08 | 知识本体（`business_domain/**`）只能 `PRESERVE` 或 `TRANSFORM`，禁止 `RETIRE`；人工改写内容视为权威不得覆盖 | 红线断言用例 |
| D-088-01-R09 | dry-run 输出完整分类计划（逐文件动作 + 目标路径）且零写入；APPLY 不得超出计划面 | dry-run 零写入断言 + 计划面比对 |
| D-088-01-R10 | 【裁决点①】首次 APPLY 前分类计划是否需要 owner 显式确认，或 dry-run 报告即视为确认依据 | v3 规格冻结时定 |

### 3.3 模块 C — 预检与安全 PREFLIGHT

| ID | 需求条目 | 验收证据 |
| --- | --- | --- |
| D-088-01-R11 | 执行前提检查：git user.name 存在（继承 v2）、目标路径可写 | 前置缺失用例 |
| D-088-01-R12 | 符号链接、不可读文件、越界路径必须被识别并按文件归入 `BLOCKED`，不得崩溃或静默跳过（继承候选 R1/R2 修复并规格化） | 边界用例（R24 复用） |
| D-088-01-R13 | 零接触边界：只写目标仓 `.sdlc/**` 与允许的报告路径；禁止触碰其他业务仓与仓外路径 | 写入面审计断言 |

### 3.4 模块 D — 执行 APPLY

| ID | 需求条目 | 验收证据 |
| --- | --- | --- |
| D-088-01-R14 | staging + digest 基线原子落盘；中断不留半成品（继承候选机制并规格化） | 原子性用例 |
| D-088-01-R15 | create-if-missing：已有知识文件永不覆盖，只补缺失件（继承 v2 不变量） | 覆盖红线用例 |
| D-088-01-R16 | 幂等：任一四类场景 apply 后重复执行为 no-op 且报告一致 | re-run 断言（R23 轴） |
| D-088-01-R17 | apply 中途失败必须回滚到执行前 digest 基线并输出失败报告 | 注入失败回滚用例 |
| D-088-01-R18 | TRANSFORM/RETIRE 执行后，旧根/旧 owner 不得再被新表面引用（禁词门禁扩展到迁移后校验，含 `.specify`） | 迁移后禁词扫描 |

### 3.5 模块 E — 生成目标形态 VERIFY

| ID | 需求条目 | 验收证据 |
| --- | --- | --- |
| D-088-01-R19 | 冻结计划 §3 目标状态表逐行转为可验证断言（骨架齐备性、candidate/PROPOSAL_ONLY 状态、routable 门控、各场景允许自动猜测范围） | 断言表与计划表一一映射 |
| D-088-01-R20 | 生成件齐备：三根文档 + 三份 YAML + map 模板 + audit wrapper（v2 骨架清单）；EXISTING 场景另含入口事实、候选域与 xx99 EntryCoverage | 骨架清单断言 |
| D-088-01-R21 | 声明状态机 `absent → candidate_pending_confirmation (routable:false) → routed` 在四类场景下落位正确；非 routed 一律 PROPOSAL_ONLY | 状态机用例 |

### 3.6 模块 F — 报告 REPORT

| ID | 需求条目 | 验收证据 |
| --- | --- | --- |
| D-088-01-R22 | 每次执行输出审计报告：逐文件分类清单与理由、跳过项、blocked 项、digest 记录、回滚记录；报告机器可校验，不得自述成功 | 报告 schema + 校验器 |

### 3.7 模块 G — 验收与 G1 完成门

| ID | 需求条目 | 验收证据 |
| --- | --- | --- |
| D-088-01-R23 | 主矩阵：四类 × {empty, partial, complete} × {map absent, candidate, routed} × {dry-run, apply, re-run} | 全绿矩阵报告 |
| D-088-01-R24 | 边界矩阵：symlink / 不可读 / 跨仓路径 / 人工改写 / 旧根混合语义 / 失败回滚 / 中断恢复 | 独立边界用例 |
| D-088-01-R25 | 【裁决点②】矩阵剪枝原则。建议：dry-run 层全组合，apply/re-run 层按代表组合 + 全部边界用例覆盖；剪枝方案随 v3 规格一并冻结 | v3 规格中的矩阵定义 |
| D-088-01-R26 | R1/R2 全部 findings 按 v3 规格重新归因（仍成立 / 已被规格消灭 / 需修复），不得以旧 Round 全绿代替 | 重归因清单 |
| D-088-01-R27 | 对 `a626335` 候选做相对 v3 的只读差距审查，产出有界修复清单（保留/修改/删除），停等实施授权 | 差距审查报告 + 修复清单 |

## 4. G2 — D-090-01 共同语义合同（需求域级）

范围边界以冻结计划 §4/G2"必须冻结的字段"为唯一来源。需求域：

1. **合同权威落位**：新建 `ai-sdlc/manual-runtime-semantic-contract.md`，同步 `node-capability-contract.md`、`artifact-flow.md` 及 schema/模板引用；流程定义从 Skill prompt / runtime code / 业务产物中收敛到单一权威。
2. **节点 IO 与稳定路径域**：七节点及 solution-gate 双角色的输入、输出、stable path。
3. **深度语义域**：`initialDepthBasis` / `decisionDepth` / `decisionStatus` / 升档回流。深度起点规则（【裁决点③】2026-09-05 Current User 确认折中方案 (c′)）：用户显式指定 → `user_requested` 最高优先；未指定 → 归一按枚举判定表输出 `proposedDepthBasis`（含理由）作为设计的**约束性下限**；判定表无法分类 → `PROVISIONAL_STANDARD` 兜底。`formal_verdict` 保留确认/升档两个动作（升档走深度覆盖台账的增量补强），`decisionDepth` 正式输出权仅在 `formal_verdict`；降档为无害超集，只记录不回流。判定表随 G2 冻结，须枚举可测试以满足 runtime parity。本域构成对 Decision-090 决策 4 默认行为的修订，G2/D-090-01 冻结合同时正式记录。
4. **Finding/Ledger/Gate 生命周期域**：Finding identity；`{id}_FindingLedger.md` 与 `{id}_方案审核.md` 两个稳定路径；轮次/版本/current/stale/superseded 表达规则。
5. **manifest 三对象域**：`intake.manifest.json`（触发）/ `manifest.md`（生命周期投影，intake 创建 + 确定性 publisher 更新 + reconcile 重建）/ `knowledge-target.yaml`（项目级路由）；互不替代。
6. **journal↔manifest 投影域**：交叉绑定 digest、失败码、回流节点、下游准入；不一致 STOP。
7. **PWR 口径域**：自动推进保持，清除全部 risk acceptance 仪式残留。

完成门（继承冻结计划）：合同无相互矛盾；模板/Skill/runtime 变更清单与负向矩阵可机械验证；solution-gate 双 binding 隔离未被削弱。

## 5. G3 — D-090-02 手动主路径修复（需求域级）

六个需求域对应冻结计划六子任务：① solution-design 深度前置解耦，接入 `initialDepthBasis`；② Ledger/Gate 两稳定路径与角色边界落地；③ intake 创建 requirement manifest + 后续节点原子更新；④ Re-Gate 的 current/stale/superseded 标记；⑤ Decision-086 已取消的 risk proof 残留清除；⑥ 存量 `library` 无 manifest 处置规则（2026-09-05 Current User 裁决【裁决点④】撤销，相对冻结计划子任务 6 收窄）：存量无 manifest 的 requirement 视为只读归档知识源——knowledge-sync 仍可消费其知识内容，但不进入新生命周期管理；新流程 requirement 一律由 intake 创建 manifest；新流程试图复用无 manifest 的存量目录 → `BLOCKED`；corrupt manifest 中途 → STOP。不做任何存量重建/恢复。

完成门 `MANUAL_OPERATIONAL`（继承）：隔离 fixture 从 intake 到 knowledge-sync 全链无人工补文件/改状态；至少一个真实业务需求只读重放证明相同准入结果。

## 6. G4 — D-087-01..05 恢复与调整（包级调整点）

三条 seam 保留，五个调整点（冻结计划 §4/G4）：`D-087-01` production entry 增加初始化/manifest readiness preflight；`D-087-02` node result 承载真实深度三字段、禁止硬编码；`D-087-03` Finding materialization 消费 G2 identity 与 Ledger/Gate 生命周期；`D-087-04` auto-reroute 用共同 earliest-affected-node 语义；`D-087-05` Skill path fix 验证 `.sdlc` 初始化结果可被 runtime binding 解析。

授权规则：G3 达成后 Controller 先做 delta decomposition assessment，Current User 据此决定是否沿用未消费的 `GW_VERTICAL_REBUILD`（【裁决点⑤】裁决形式见 §10）。D-087 离线端到端矩阵继续有效。

## 7. G5 — D-090-03 runtime manifest 投影（需求域级）

需求域：① manifest projector（journal 机器权威 → 确定性生成与手动路径一致的 `manifest.md`，禁止 Agent 自由文本写生命周期权威字段）；② gateway `decisionDepth: STANDARD` 硬编码修复；③ envelope 陈旧 `riskAcceptanceRefs` 强制清除；④ formal_verdict 重复 Finding 来源修复；⑤ journal/manifest digest 不一致 `STOP_AND_REPORT`。

完成门（继承）：相同 fixture 的 manual trace 与 runtime trace 归一化后完全等价。

## 8. G6 — D-090-04 离线 parity 验收（矩阵级）

需求域：① parity 矩阵（轴：四类项目初始化 × 三档深度 × PASS/FAIL/PWR/BLOCKED_UNKNOWN × 首轮/升档/Re-Gate × manifest new/corrupt × crash/resume；reconcile 轴随【裁决点④】撤销移除）；② 比较对象集（节点序列、双 Gate 角色、stable artifact paths、版本/current/stale、Finding identity、decisionDepth、next eligibility、earliest reroute、最终 handoff 状态）；③ 完成门（全场景通过、无 shadow executor，通过后才能申请真实 CLI run8）。

## 9. 依赖、授权与 STATE 传播

1. 每 Gate 按冻结计划 §6 节奏执行；Gate 完成后动作固定为：证据报告落 `docs/reports/` → Control Plane STATE 更新 `next_transition` 至下一 Gate → 需要实施授权的包由 Current User 显式给出。
2. 需求冻结 ≠ 实施授权：本文 §3 条目被接受后，G1 阶段 A（规格冻结 + 只读差距审查）即为合法下一步，无需额外授权；阶段 B（改代码）必须停等。
3. 恢复入口不变：STATE → Decision-090 → 冻结计划 → 本文（G1 启动后）→ 对应包授权/证据。本文被接受后，冻结计划的 §7 恢复动作第 3 步由"重新冻结 v3 行为规格"细化为"按 §3 条目 R01–R22 冻结规格"。

## 10. Current User 裁决记录

| # | 裁决点 | 结论（2026-09-05 Current User） |
| --- | --- | --- |
| ① | D-088-01-R10：LEGACY 分类计划确认点 | **已裁决：采纳建议 (a)**——含 `TRANSFORM`/`RETIRE` 的场景（两类 LEGACY）首次 APPLY 前 owner 显式确认；`NEW_EMPTY`/`EXISTING_CODE_NO_KNOWLEDGE` 只 ADD 不改不删，无需确认；确认后幂等 re-run 免重复确认 |
| ② | D-088-01-R25：验收矩阵剪枝 | **已裁决：采纳建议 (a)**——dry-run 层全组合（4×3×3×3=108），apply/re-run 层代表组合（每轴值至少出现一次 + 高交互风险组合点名，约 15–20 个 apply 场景），边界矩阵独立用例；代表组合的具体清单随 v3 规格冻结列明，不得酌情选取 |
| ③ | G2 域 3：深度默认与升档回流 | **已裁决：确认折中方案 (c′)**——归一定起点：枚举判定表输出 `proposedDepthBasis` 作为设计约束性下限（`user_requested` 最高优先；判定表失能退 `PROVISIONAL_STANDARD` 兜底）；Gate 留终审：`formal_verdict` 确认为主、升档为例外（走深度覆盖台账增量补强），`decisionDepth` 正式输出权不变；降档为无害超集不回流。对 Decision-090 决策 4 的修订随 G2/D-090-01 合同冻结正式记录 |
| ④ | G3 域 6：存量 manifest 处置 | **已裁决：撤销该裁决点**——不做存量 library 重建/恢复（恢复的不是存量 library，是后续流程正确性）；存量无 manifest requirement = 只读归档知识源，不进新生命周期；新流程由 intake 建 manifest，复用无 manifest 存量目录 → `BLOCKED`；知识沉淀内容优先，中间产物不追溯。G3 域 ⑥ 与 G6 矩阵轴已相应收窄 |
| ⑤ | G4：`GW_VERTICAL_REBUILD` 裁决形式 | **已裁决：采纳建议 (a)**——delta assessment 后一次裁决；超出已评估 delta 边界的发现仍需单独授权 |

## 变更记录

- 1.0.0（2026-09-05）：裁决点③确认折中方案 (c′)，五点全部收口；Current User 接受本文，状态 PROPOSED → ACCEPTED，成为 G1 启动输入。
- 0.2.0（2026-09-05）：记录裁决点①②④⑤（④撤销，G3 域 ⑥ 与 G6 矩阵轴相应收窄）；裁决点③转入讨论并记录折中方案 (c′)。
- 0.1.0（2026-09-04）：初稿。

## 11. 与冻结计划的追溯

| 冻结计划章节 | 本文对应 |
| --- | --- |
| §1 目标与恢复原则 | §1.1 原则 1、§9.3 |
| §2 冻结不变量 | 全文继承，未新增或放宽任何不变量 |
| §3 目标状态示例 | R19（逐行转断言） |
| §4/G1 | §3 全部条目 |
| §4/G2–G6 | §4–§8 需求域 |
| §5 文件影响地图 | 未变动；各包实施授权仍以该表为禁止夹带依据 |
| §6 Review 节奏 | §1.2 状态机、§9.1 |
| §7 恢复动作 | §9.3 |
