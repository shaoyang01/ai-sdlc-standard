# G5 剩余计划：D-090-03 runtime manifest 投影与双路径接线（承接版）

> Version: 1.1.0
> Status: PLANNING_BASELINE — 仅完成规划与承接梳理；实施、验证均未授权（见 §9 授权边界）
> Date: 2026-09-08（v1.1.0 同日按核查意见修正 manifest 职责、投影差量与依赖表述）
> Parent: [Decision-090 冻结执行计划](decision-090-c03e-prerun-governance-plan.md) §4/G5（D-090-03，原文保留）· [LOOP-CORE-C03-E-PLAN](../LOOP-CORE-C03-E-PLAN.md) v0.4.0 · Decision-063/064
> 依据合同: [manual-runtime-semantic-contract](../../ai-sdlc/manual-runtime-semantic-contract.md) v1.0.0（G2/D-090-01 冻结；§6.1/§6.2 为本文投影语义的唯一权威）· [LOOP Core Contract](../LOOP_CORE_CONTRACT.md)（Draft 基线）
> 承接事实: G4/D-087 R11 复审 PASS @ `a038d2b`，D091 五轮复审 PASS @ `41dd8da`，两者已随 2026-09-08 收口一次性集成 `feature/loop-runtime-v1`（PR #129 `31a67ce`、PR #130 `53b58fe`）；本文撰写时主线工作区 HEAD `44e3be6`

## 1. 目标与范围边界

G5 的冻结合同目标不变：**runtime journal/artifact store 保持机器权威，同时确定性地产生与手动路径相同的 `manifest.md` 人工视图**。本文件只做需求条目到现有实现的承接梳理与剩余差量规划，不是全仓缺陷审核；条目核实沿实际调用关系进行到足以规划为止。

**manifest 三对象职责（合同 §6.1，本文全程遵守，不借 G5 改变）**：`00-需求资料/intake.manifest.json` 是 runtime 入口确认与触发对象（`loop-intake-manifest:v1`），**不随流程演进**，本包不写它；`library/{id}/manifest.md` 是七节点生命周期人工投影（§6.2 格式），创建职责唯一在 requirement-intake，更新职责在 publisher；`.sdlc/business_domain/knowledge-target.yaml` 是项目级知识路由（G1 规格），与本包无关。

## 2. 冻结计划条目 → 现有实现的承接表

> 证据口径：G4 需求冻结（`g4-d087-requirement-freeze.md`，ACCEPTED 2026-09-06）+ G4-R5..R10 整改报告与 R11 复审 PASS（`g4-r10-d087-r10-rework-report.md`、`g4-d087-d091-closure-governance-record.md`）+ 2026-09-08 主线代码事实（HEAD `44e3be6`）。标注"代码核实"的条目均沿实际文件/调用关系确认。

| # | 冻结计划条目（G5 §必须修复/实现面） | 当前实现与收口证据 | 判定 |
| --- | --- | --- | --- |
| 1 | gateway `STANDARD` 硬编码移除，深度从 verdict 事件读取 | **G4-01 CLOSED**：`execution/gateway.ts` 从 verdict 事件读取真实 `decisionDepth`（R11 PASS；159 测试文件全绿含 `loop-wp5-cross-entry`）。代码核实：production 决策路径无 `"STANDARD"` 字面硬编码；残留字面仅为合法枚举表 `DECISION_DEPTH`（L639）与离线 shadow 路径 `SHADOW_DEFAULT_DEPTH`（L1407，生产入口不使用 shadow，属 G6"无 shadow 替代生产入口"完成门的既有监管对象） | 已完成，复用为回归依赖 |
| 2 | envelope 陈旧 `riskAcceptanceRefs` 非空强制 | **G4-02 CLOSED**：`core/node-output-envelope.ts` 中该字段为可选（仅在显式出现时校验数组形态，L276–278）；PWR + 空 refs 不再 INVALID（R2 轮起多轮回归） | 已完成，复用为回归依赖 |
| 3 | formal_verdict 重复 Finding 来源 | **G4-03/04 及 R8-F1 CLOSED**：finding 生命周期按合同 §5.1/§5.2 落地为 per-origin 登记/处置 + per-action role（`core/loop-finding-lifecycle.ts`）；R8/R9/R10 对 ledger 对账（含合成回流 finding 不入对账）反复收敛至 R11 PASS | 已完成，复用为回归依赖 |
| 4 | journal→manifest 投影基线（冻结表 G4-03 `projectedThrough`） | **部分完成（范围收窄，差量见 §3 Δ2）**。如实记录：冻结表 `projectedThrough` 字段名未出现于最终代码（R7–R10 rework 期间条目形态演进）。既有基础仅为两处局部能力：①恢复侧运行状态投影（`core/loop-recovery.ts` 的 point-wise/Re-Gate plan projection）；②journal↔manifest Artifact Index **单行**交叉绑定（`core/loop-artifact-revision.ts`，G4-R5-M2：路径/版本/status/Gate 结果比对，STABLE_PATH/VERSION/STATUS_DRIFT STOP）。**经核实其不承载完整 `projectedThrough` 语义**，以下仍缺：已投影 journal 前缀的逐事件进度与一致性校验（合同 §6.2.2(a)）；manifest 自身 digest 校验（§6.2.2 第 1 级）；**finding store 独立生命周期变化的投影**（§6.2.2(b)/第 3 级——finding 关闭/风险接受可以不产生新的节点 terminal 事件，投影路径不能只挂在"节点 terminal 后"） | 部分完成：局部校验复用；前缀进度、manifest 自证 digest、finding 生命周期投影为剩余差量 |
| 5 | runtime manifest 创建/更新缺口 | **未完成，G5 核心差量**。代码核实：手动侧确定性发布器 `scripts/publish-requirement-manifest.sh`（contract §6.2：init/entry-update/publish/finding-register/finding-action/check-admission/repair，可重放、原子、A1–A4 准入）已由 G3 交付；runtime 侧（`runtime.ts` 生产入口路径）没有任何 manifest 创建/更新调用——manifest 仅出现在 artifact-revision 交叉绑定校验与 Delivery Tail 报告引用中。**投影对象仅为 `library/{id}/manifest.md`**（§6.1：`intake.manifest.json` 不随流程演进） | **剩余（本包核心）** |
| 6 | 投影进度、恢复、准入与不一致处理 | 部分基础：准入判定（A1–A4）与 repair/重放语义在手动发布器中已实现；单行交叉绑定 STOP 已实现。剩余：runtime 侧 **§6.2.2 三级有序判别**的完整实现与出口接线——**第 1 级损坏**（self-digest/解析失败 → `MANIFEST_CORRUPT_STOP`）与**第 2 级真分叉**（前缀逐事件比对失败、findingIndex 身份/投影字段漂移且无合法后继依据 → `JOURNAL_MANIFEST_MISMATCH_STOP`）才停止；**第 3 级待投影**（journal 尾段 + finding store 生命周期差量、含合法落后 OPEN→RESOLVED/ACCEPTED）是**幂等追平发布而非 STOP**。三类输入（尾段/生命周期差量/新完成声明）并存时合入同一次原子发布（V9），不得互相丢弃 | **剩余** |
| 7 | 生产入口接线（冻结 G4 调整点：entry 增加项目初始化/manifest readiness preflight） | 部分完成：production entry 已有 read-only git-snapshot preflight（`runtime.ts` L1393–1440）与 containment marker 判别（R10-F4 修复）；**manifest readiness preflight 与节点 terminal 后的投影调用钩子不存在**（代码核实：`runtime.ts` 无 manifest 引用） | **剩余（接线差量，归本包）** |

## 3. G5 剩余差量（唯一实施面）

**Δ1 manifest projector（核心，对象仅为 `library/{id}/manifest.md`）**：在 runtime 侧新增确定性投影器——按 `manual-runtime-semantic-contract` v1.0.0 §6.2 与手动发布器**同语义**，从 journal 与 finding store 的当前事实产出/更新 manifest。`00-需求资料/intake.manifest.json` 是入口触发对象，投影器**不得创建、更新或重建**它。语义要求：§6.2.2 三级有序判别前置；可重放（同输入逐字节同一 manifest，§6.2.3）；原子 rename 发布；Agent 自由文本不得直写生命周期权威字段。
**Δ2 三级判别与不一致出口接线（§6.2.2）**：第 1 级损坏 → `MANIFEST_CORRUPT_STOP`（不静默修复、不重建）；第 2 级真分叉 → `JOURNAL_MANIFEST_MISMATCH_STOP`（前缀逐事件比对 + findingIndex 身份/投影字段整行绑定与方向性规则）；第 3 级待投影（journal 尾段 + finding store 生命周期差量，**含不经过节点 terminal 的 finding 关闭/风险接受迁移**）→ 幂等追平发布。**单独 finding 生命周期差量仅更新 findingIndex（`entries` 不变）；与 journal 尾段并存时，entries 按尾段映射更新、findingIndex 按权威记录对齐，两类变化合入同一次原子发布（V9）。**区分“正常待追平/损坏/真正分叉”，不得把所有差异都写成 STOP。
**Δ3 生产入口接线**：production entry 的 manifest readiness preflight——存在且 self-digest 通过 → 正常进入；损坏 → `MANIFEST_CORRUPT_STOP`（人工修复走 §6.2.6 repair 路径）；**无 manifest 的存量 requirement 目录 → `BLOCKED_AMBIGUOUS`（合同 §6.2.7/DP4：只读归档知识源，不重建、不修复复用，G5 不引入任何重建路径）**；仅全新 requirement 由 requirement-intake 承担创建职责。节点 terminal → projector 调用点 + crash 后由恢复路径按 §6.2.2 重判并补投影的幂等性。

**明确不属于 G5**：journal schema 或 artifact store 重设计（G4 已收口）；手动发布器与其 Skill 面修改（G3 已冻结）；`00-需求资料/intake.manifest.json` 的任何写路径；`SHADOW_DEFAULT_DEPTH` 等 shadow 路径行为（生产入口不使用 shadow；其存在形态由 G6 完成门监管）；业务仓、真实 CLI、pending_confirmation（D091 名下独立事项）。

## 4. 文件面（计划，不等于授权）

| 触点 | 文件 | 性质 |
| --- | --- | --- |
| 新增 | `core/loop-manifest-projector.ts`（或等价命名的单一模块） | 投影器主体；合同 §6.2 三级判别与追平语义 |
| 接线 | `runtime.ts`（readiness preflight、terminal→projector 调用点）、`execution/real-capability-gateway.ts` 或 production assembly（Δ2 出口接线） | 最小接线，不改 G4 已收口 seam 语义 |
| 复用 | `scripts/publish-requirement-manifest.sh`（语义基准与 parity 对照物）、`core/loop-artifact-revision.ts`（单行交叉绑定校验）、`core/loop-recovery.ts`（恢复投影基线）、`core/loop-finding-lifecycle.ts`（finding store 权威读接口） | 只读复用/回归依赖 |
| 测试 | `tests/loop-manifest-projection*.test.ts`（新增）+ 既有 `tests/loop-*.test.ts` 全量回归 | 不改既有断言，除非投影暴露真实缺陷（按 §7 收敛规则处理） |

禁止夹带：`ai-sdlc/**` 合同文本变更、Skill/templates 变更、第二份生命周期 schema、`intake.manifest.json` 写路径、业务仓写入、真实 CLI。

## 5. 输入、输出与依赖

- **输入**：capability execution journal（机器权威）；finding store 当前状态 + durable 证明（`loop_findings`，经既有 `appendFinding`/`resolveFinding`/`acceptFindingRisk` 提交）；`manual-runtime-semantic-contract` v1.0.0 §6.2 冻结字段与三级判别规则；节点输出 envelope（G4 result model）；目标 `library/{id}/` 现状。
- **输出**：`library/{id}/manifest.md`（与手动路径相同 stable path、相同 head/entries/findingIndex/repairRecords/manifestDigest 结构、相同 current/stale/superseded 语义）；不一致/损坏时按三级判别产出对应失败码（`MANIFEST_CORRUPT_STOP` / `JOURNAL_MANIFEST_MISMATCH_STOP`）或幂等追平。
- **上游依赖**：G2（共同语义合同 v1.0.0——投影语义的合同依据，收口事实见 Decision-090 线）；G3（手动链与 `publish-requirement-manifest.sh`——parity 对照物）；G4（D-087 三条 seam，R11 复审 PASS，见收口治理记录）。**G1/D091（初始化器）**：已合并集成主线（PR #129，事实）；但按 Decision-091 集成注记，初始化器继承依赖维持**「候选依赖集、闭合未证明」**，本计划不将其标为已闭合依赖。经沿调用关系核实，G5 投影的运行时对象是 requirement 运行库（`library/{id}/`，由 requirement-intake 创建），未识别对初始化器谱系的具体因果依赖；该注记的存废由 D091 终值改注裁决，不因本计划改变。
- **被依赖（下游）**：G6 离线 parity 的 runtime 轨迹侧；real run8 的前置。

## 6. 有界任务列表

- G5-T1 投影器语义冻结稿：journal 字段/finding store 记录 → manifest 字段映射表（对齐合同 §6.2.4 冻结映射与 §6.2.2 三级判别），含前缀进度（`projectedThrough`）、finding 生命周期差量、重放/repair/STOP 语义；先产出再编码（沿 G1 先例）。
- G5-T2 `core/loop-manifest-projector.ts` 实现（Δ1，含 §6.2.2 三级有序判别与第 3 级幂等追平）。
- G5-T3 损坏/真分叉失败码出口接线（Δ2）：`MANIFEST_CORRUPT_STOP` / `JOURNAL_MANIFEST_MISMATCH_STOP` 进 runtime 运行出口；待投影差量走追平不走 STOP。
- G5-T4 生产入口 readiness preflight + terminal 投影调用 + crash 后恢复重判的幂等性（Δ3；存量无 manifest → `BLOCKED_AMBIGUOUS`）。
- G5-T5 新增投影回归测试（含 finding 生命周期独立迁移投影、混合输入 V9、同输入重放逐字节一致）+ 既有全量回归（当前基线 159 文件全绿口径）；同 fixture 的 manual trace（真实发布器产物）作为对照物入库。

## 7. G5 完成门

1. 相同 fixture 下，manual 轨迹（真实手动链产出）与 runtime 轨迹（journal→投影器产物）归一化后**完全等价**（节点序列、Gate 两角色、stable paths、版本/current/stale、finding identity 与生命周期状态、decisionDepth、next eligibility、earliest reroute 不失真）。
2. 三级判别行为与合同 §6.2.2 一致：损坏 → `MANIFEST_CORRUPT_STOP`；真分叉 → `JOURNAL_MANIFEST_MISMATCH_STOP`；合法落后/待投影 → 幂等追平，任一类不被误判为另一类。
3. finding store 独立生命周期迁移（无节点 terminal）被正确投影，`entries` 与产物 digest 不被触碰。
4. 冻结计划 G5"必须修复"四项的回归断言全部在位（条目 1–3 直接复用 G4 既有断言，条目 4–7 由 T2–T4 新增）。
5. 全量既有回归全绿；`tsc --noEmit` 干净；不引入 shadow 替代生产入口。

## 8. 交由 G6 证明的事项

- 完整离线 parity 矩阵（Decision-090 §4/G6）：四类项目初始化 × 三档深度 × PASS/FAIL/PWR/BLOCKED_UNKNOWN × 首轮/升档/Re-Gate × manifest new/reconcile/corrupt × crash/resume。
- 跨场景的归一化等价性证明与"无 shadow 替代生产入口"的完成门；随后才允许申请真实 CLI run8。

## 9. 授权边界与复审收敛适用

- 本计划不授权任何实施；G5 进入需 Current User 对本剩余范围单独确认。G6、真实 run8、C03-E 完成判断、C05 逐级单独授权；真实 run8 不自动等于 C03-E/C05 通过。
- 复审收敛（沿用冻结计划 §6 节奏）：每轮复审做事实快照 → 合同/不变量复核 → 根因合并式只读复审 → Current User 裁决。适用方式：
  1. 问题必须绑定冻结需求条目、直接证据与影响；不受理无合同依据的泛化加固。
  2. 同一根因的变体合并为一次修复边界，不拆成无尽 Round。
  3. 新需求或验收口径变化单独裁决，不自动并入本包。
  4. 已关闭项（G1–G4/D091/D092）只有出现新的直接反证才重开；反证须给出可复现证据。
  5. 不以限制轮数为理由忽略真实阻塞问题——轮次上限不存在，范围上限存在。

## 10. 开放问题（不阻塞规划，G5 启动时裁决）

- **投影器实现载体**：TS 原生实现（与 runtime 同进程、可强类型校验，以手动发布器产物为 parity 对照物锁定语义）vs 直接调用 `publish-requirement-manifest.sh`（零语义漂移，但引入 shell 依赖与跨语言错误面）。计划倾向 TS 实现 + 以真实发布器做逐场景 parity 锁定；最终由 Current User 在 G5 进入授权时确认。

## 11. 与 D091 后续事项的关系

D091 的业务仓正式收编执行、`pending_confirmation` 语料裁决与 Decision-091 终值改注是**独立 Owner 裁决事项**：不阻塞 G5/G6/run8，也不被它们自动完成。独立恢复入口：产品仓 `docs/handoffs/2026-09-07-governance-corpus/RESUME.md`（已随 PR #129 合入 `feature/loop-runtime-v1` @ `4d1c25b`）与 `docs/decisions/Decision-091-governance-corpus-adoption.md` 集成注记（「候选依赖集、闭合未证明」维持原义）。"代码已集成 / 工具复审通过 / 业务仓已执行 / 语料已裁决"四个状态分别表述，不得互相推定；本计划不对「候选依赖集」作闭合推断，因果边界见 §5。
