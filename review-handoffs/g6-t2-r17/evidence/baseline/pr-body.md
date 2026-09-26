## G6 / D-090-04 M2 — parity harness 全矩阵 + S-CRASH 中断-重入 + 验收报告（完成门证据包）

**Base**：`feature/loop-runtime-v1` @ `b8923fc7`（M1 PR #195/#196 已合入）。本 PR 为 M2 单 PR 收口（同 M1 惯例）。diff `b8923fc7..2ec9ecb` 仅涉 `tests/` + `docs/`（**生产代码零 diff**）；b8923fc..2ec9ecb 实算 **64 commits**（数据基线 = 代码提交 `2ec9ecb`；当前 PR head = 数据基线 + 1 笔纯 docs 同步提交，共 **65 commits**）。

### R1 自证（整改方声称——仅供核对）

**改动面**：harness = fact-scripts（全家族波形 + crashPoint 事实）、behavior-face（行为层驱动器：信封 finding 下放 / invocation 间派生结算 / 有界 invocation / durable-block 护栏 / WP-1 记录 journal 回读 / S-CRASH 中断-重入）、runtime-face（findingProof 回传）、manual-face（finding-action 结算点镜像）、behavior-comparator（六维判定 + final-handoff 真实三元组 + WP-1 逐波声明校验）、comparator（catch-up 机制模式 + D-17 逐行证明赦免）、ledger-guard + frozen-ledger.json（仪器冻结账本：场景 ID 清单 50/4/6、负向分组登记 10 组/54 与 5 组/38；数据封签 + 代码封签常量 + 逐 ID 双向核对 + 结构化 settle——R12-H1）、**event-stream.ts + 执行事件核验（R15-H5：断言/场景/pin 在求值点发结构化事件；handle settle 时封闭；pin 事件内置；审计器核验事件本身 + 印行交叉核对 + 双路 stderr）**、**g6-negative-coverage-audit.test.ts（R13-H1 建 → R14-H1 → R15-H5 演进：账本的独立消费者，不信任被审代码的自述与印行）**、**g6-parity-instrument-presence.test.ts（R15 建议落地：仪器文件被删即全量回归失败）**、types、两 runner、负向矩阵（比较器 38 项 + 行为 54 项）。文档 = 验收报告 `docs/reports/g6-d09004-parity-acceptance-report.md`（§7 证据包）+ 交接更新。

**验证**（只读命令与结果，2026-09-27 实测，数据基线 = 最后代码提交 `2ec9ecb`）：

| 校验 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | **0**（冻结 HEAD 复跑） |
| 产物层矩阵 | **50 passed / 0 failed**（完成注册表先按账本逐 ID 钉 50） |
| 行为层矩阵 | **A′ 红态（按设计）**：合并 0/50；dim-9 已知原因桶 **50/50 零新因**（分母钉冻结账本 50）；**非 dim-9 分歧 0**；超限单列 **4/0**（账本钉 4）；退出码 1 预期 |
| 崩溃事实独立计数 | **6/6**（分母 = 账本崩溃注册表） |
| 负向（行为，10 组 / 冻结 54 条） | **54 passed / 0 failed**（结构化 settle；R13-H2 后冻结 HEAD 可运行） |
| 负向（比较器，5 组 / 冻结 38 条） | **38 passed / 0 failed** |
| 负向覆盖审计（R15-H5 事件核验 / R16-H6·H7 双路+逐条对应） | **11 passed / 0 failed**（自算封签互核 2 + 包装合成体探针 5 含 settle 后 handle 封闭 + 四入口执行事件核验 4：事件分组条数/场景 ID 集合/pin 观测值对账本 + 印行与事件逐条对应 + 严格事件解析 + 成功/失败双路 stderr 捕获） |
| 仪器存在性 pin（R15 建议） | **8 passed / 0 failed** |
| 既有投影回归 | T5 **32/0** · YAML **150/0** |
| 全量回归（并行，173 文件） | **逐文件断言全绿**；文件级失败 = 按 A′ 设计红的行为矩阵（+ 已知 codex-adapter 抖动时隔离复跑恢复）。**注**：日志末尾 `Results: 1767` 系 system-capability-review 单文件内统计，runner 不打印跨文件总量 |

**诚实性陈述**：产物层只判 3/9 维并明示；行为层 NOT_JUDGED 不谎报 MATCH、BLOCKED 永不报 MATCH（A′）；超限 4 场景 runner 单列、不计入产物层通过数。**仪器自防六层，每层经变异实证**：① 场景注册表逐 ID 双向核对（50/4/6）；② 崩溃计数账本化（6/6）；③ 负向矩阵冻结覆盖（54/38，settle 结构化）；④ **冻结账本独立锚点（R12-H1：分母是 runner 外的封签数据 + 代码封签常量）**；⑤ **负向覆盖审计器（R13-H1 建 → R14-H1 → R15-H5 → R16-H6/H7：核验求值点结构化事件而非被审代码的自述与印行，成功/失败双路捕获、严格事件解析、印行与事件逐条对应——R13/R14/R15/R16 累计九种单文件变异形式全部拒绝：直调 body、settle 打桩、删场景+注销钉、53 实跑+1 伪造绿行、49 场景+1 伪造 ID 行、settle 后真实红断言、退出 0 的 stderr 红行、同数不同 ID、settle 后追加损坏事件行。诚实边界：单仓内补写个别一致的事件记录仍可能通过——已声明为同仓同步修改边界，本层提价的是「令每条印行与事件逐条互洽」的成本形态）**；⑥ **仪器存在性 pin（R15：审计器/账本/守卫/入口被删即全量回归显式失败）**。桶 pin 分母 = 冻结 50；崩溃事实的 vacuous/退化路径已闭合 5 条，**逐路径证据归属**（与报告 §6.2 一致）：R7-H2（重入投影跳过）= runner 的 manifestCaughtUp/lostWriteOccurred 断言 + R8 轮变异推演（负向矩阵中无该路径的独立用例）；R8-H3（null 事实放行）= runner 的注册表计数与 null 专属报错 + R8/R9 轮变异推演（无独立负向用例）；R8-H4（STOP 后改写被拒清单）= 行为负向 3 态；R9-H1（0/0 退化）= runner 注册表分母 + crashPoint 缺失专属报错 + frozen-ledger 单元负向 5 例；R9-H2（回滚后拒判记 NO_OP）= 行为负向 1 态（onPostRollback）——按 R9-H3 修订不再作「无 vacuous 路径」全称断言。账目三本账逐条可复算；产物层未归因 diff 无。**诚实边界（单仓内）**：各层均为 tamper-EVIDENT（防意外漂移与单/双文件篡改的逐层提价），非 tamper-PROOF；最终防线 = 独立复审每轮重放全部假绿推演——此边界已写入 ledger-guard 模块注释、event-stream 文件头与报告 §6.2。**纪律教训（R13-H2）**：冻结 HEAD 不得携带未提交修复——代码提交前必须对**提交物本身**跑 tsc 与受影响套件（R12-H1 提交误冻改写中的负向套件，补修 9a3e4a5）。**元教训递进**：R14-H1——同仓审计不得以被审方自述（源码串、自印覆盖行）为证据；R15-H5——「印行」本身仍是输出文本，不是执行证据，必须核验求值点发出的结构化事件并令印行与事件互洽。

**M2 关键裁决与实证**（详见验收报告与交接）
- 行为层合并判定从 S-CORE 首轮 12 扩到全家族（产物层 50 = 52−5 剔−4 退+7 挂），超限暂停 4 行为层单列（durable 终态）
- 账目对账发现 PWR×Re-Gate ×3 无场景且无剔除依据（规划遗漏）→ Current User 裁决补建；新实证：finding 注册要求 source revision ACTIVE 且为当前指针
- S-CRASH（R1-H2）：行为层从 store 级语义回放升级为**经生产入口走真实恢复路径的中断-重入**（maxDispatches 边界中断 + 同 runId 重入 + manifest 播种/catch-up 可观测 + 丢失写逐字节重推 + 双恢复 NO_OP + 被拒清单禁写）
- 预算分层实证：入口预算是链内核 `maxRegateRounds`（permit 事务落 durable block、零 dispatch）；orchestrator 的 `maxDesignRounds`/`DESIGN_REVISION_EXHAUSTED` **不在** runProduction 路径上
- D-7/D-17 catch-up 表示分歧豁免（basename-only / finding-id，R2-H3 后升级为逐行 journal 证明）；takeover 场景逐字节字面比较不受影响
- **措辞纪律**（2026-09-24 确立）：复审/唤醒 prompt 属仪器审计语义，禁安全攻击类词汇，一律中性词——防评审方会话安全检查误报

**十五轮外部独立复审（M2）**：R1 FAIL（H1 成功代理谎报→A′；H2 S-CRASH 无入口恢复路径/S-INIT 无入口行为面；H3 D-17 集合赦免过宽；H4 报告不可复算）→ R2 FAIL（R2-H1-A WP-1 误拒 / R2-H1-B ABSENT 伪造放行 / R2-H3 ID 赦免未绑行）→ R3 FAIL（R3-H1 记录证据缺失）→ R4 FAIL（R4-H1 双代际误拒 / R4-H2 forward 掩蔽）→ R5 FAIL（R5-H1 混类波核验盲区）→ R6 PASS → R7 FAIL（R7-H1 报告未逐场景成节 / R7-H2 崩溃断言 vacuous pass）→ R8 FAIL（R8-H3 null 事实放行 / R8-H4 改写被拒清单）→ R9 FAIL（R9-H1 计数 0/0 退化 / R9-H2 回滚后拒判仍记 NO_OP / R9-H3 报告事实不符）→ R10 FAIL（R10-H1 三注册表无规模守卫 / R10-H2 报告覆盖归属夸大）→ R11 FAIL（R11-H1 负向覆盖数可自减为绿 / R11-H2 报告版本事实失真）→ R12 FAIL（R12-H1 守卫缺独立锚点）→ R13 FAIL（R13-H1 包装层非强制边界 / R13-H2 冻结提交携带未提交修复 / R13-H3 报告与代码基线不同步）→ R14 FAIL（R14-H1 覆盖审计信任自述被三种单文件变异绕过 / R14-H3 报告与 PR 表述未对齐）→ R15 FAIL（R15-H5 印行计数仍非执行证据——三种新形态错误通过 / R15-H4 PR 证据归属失实；均已修复）→ R16 FAIL（R16-H6 成功路径仍只取 stdout——退出 0 的 stderr 红行不可见 / R16-H7 印行与事件仅核计数 + 解析静默丢弃损坏行——同数不同 ID、追加损坏 NDJSON 均错误通过 / R16-H5 基线引用失实；均已修复）。四要素闭环记录见验收报告 §6.4。

**CI 现状（如实说明）**：`ci-tests` 在该分支持续失败，两类文件：① `tests/g6-parity-behavior-matrix.test.ts`——A′ 按设计红态（退出码 1，R-G6-01 生产修复前必然，非失控）；② `tests/hermes-cli-executor-contract.test.ts`——本地隔离复跑 21/0 全绿，CI 并行满载下失败，属资源竞争类抖动（不 import G6 harness，与本改动面无因果路径）。`ci-typecheck` / `ci-standards` / `ci-loop-patch-mutations` 均 pass。

**已知风险 / 待路由项**
- **R-G6-01（完成门阻塞项，已路由）**：生产入口 c2/c3 handoff checklist 证据链双症状（closureReviewDone 读合同钉死字段 / pathEntry 读单 invocation 变量）→ 任何 conforming 完成链 checklist 恒 BLOCKED；修复需 decision record + 生产代码变更，超 D-090-04 授权，Current User 已裁决单独路由；G6 测试以 A′ surfaced 不掩盖。完成门第 1 项状态 = 产物层全绿 + 行为层仪器面全绿 + dim-9 等价性被该已路由缺陷阻塞（不判 PASS、不掩盖）。
- BU×Re-Gate 规格剔除理由与已建成 BU-first 场景存在实证张力，报告 §7 单列备注，请复审重点核对。
- S-INIT 规格-实现边界发现（init readiness ≠ 入口 manifest readiness），报告 §3.13 如实单列 + 路由建议。

**挂账未动**（Current User 2026-09-21 裁决，不在 G6 内改）：`maxDesignRounds` 默认 2→3；journal 级回流显式轮数上限。

### 复审（R17）

独立复审（外部独立会话、只读、根因合并式）prompt 已按 `docs/handoffs/2026-09-09-g5-t1/review-request.md` 模板备好，范围含：R16-H6/H7/H5 闭环（三新形态——成功路 stderr 红行、同数不同 ID、settle 后损坏事件行——在隔离 worktree 的专属拒绝复算 + 旧六形态回返仍拒 + 事件流严格解析与逐条对应的机制核验）+ PR/报告基线引用（2ec9ecb/64、head 65）与「补写个别一致记录可通过」边界措辞一致 + 全部已 CLOSED 面不回归 + 事件流元层次（事件流停用/被补写/审计器被改）。PASS 后请 Current User 授权合并（分支保护禁直推主线）。

