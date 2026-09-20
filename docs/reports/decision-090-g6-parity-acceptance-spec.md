# G6 / D-090-04 离线 parity 验收规格冻结稿（T1 草案，待 Current User 确认后冻结）

> Date: 2026-09-20 · 状态：**草案，待裁决冻结**
> 依据：Decision-090 §4/G6（`docs/reports/decision-090-c03e-prerun-governance-plan.md`，FROZEN 基线）；
> `ai-sdlc/manual-runtime-semantic-contract.md` v1.0.0 §6.2（自证投影协议）；
> Control Plane STATE `C03_E_G6_D09004_OFFLINE_PARITY_ACCEPTANCE_ACTIVE`（PR #88 合并 `7222d6a`）。
> 沿 G5-T1 先例：先产出规格再编码。本稿经 Current User 确认后冻结，作为 T2–T4 的唯一验收基准。

## 1. 目标与完成门（合同口径，不重开）

证明 **manual 路径与 runtime 路径在全部离线场景下归一化等价**：相同事实输入下，两执行面对同一 requirement 产出的语义内容（九维，§4）完全一致；任一面单独可见的执行面字段（§4.2 归一化剔除集）不参与比较。完成门（冻结计划 §4/G6 原文）：**全部离线场景通过；无 shadow executor 替代生产入口；随后才允许申请真实 CLI run8**。

## 2. 事实快照（既有资产盘点，2026-09-20 @ `e34a4a6`）

| 层 | 资产 | 状态 |
| --- | --- | --- |
| 手动面执行核心 | `scripts/publish-requirement-manifest.sh`（真实 publisher） | 现役；G5 已裁定为 parity 对照物 |
| 手动面驱动模式 | `tests/loop-manifest-t5-parity.test.ts` 内 `driveManualChain`（结构化完成声明→publisher） | 现役但 test-inline，T2 需泛化进 harness |
| runtime 面生产入口 | `scripts/loop-run.ts`：`--request-file`（闭 schema JSON）/ `--resume <runId>` / `--capability-source deterministic\|real` | 现役；**deterministic 为默认**，real 未授权（`PRODUCTION_REAL_NOT_AUTHORIZED`）；本 CLI 不 spawn Agent CLI、只跑只读 git preflight |
| runtime 面语义核心 | `core/loop-run-store.ts`（journal）、`core/loop-manifest-projector.ts`（G5 投影器）、`core/loop-finding-lifecycle.ts`（finding store）、`core/loop-recovery.ts`（恢复） | 现役 |
| 既有 parity 测试 | `tests/loop-manifest-yaml-parity-matrix.test.ts`（YAML 字节级，224 行）、`tests/loop-manifest-t5-parity.test.ts`（投影轨迹级，770 行，含 `normalize()` 归一化与 takeover-B 判定） | 现役；G6 建其上，不重造 |
| fixtures | `fixtures/`、`tests/fixtures/` | 现役，T2 扩充 |

**离线语义裁定（本稿核心设计决策 D-1）**：runtime 面以 `scripts/loop-run.ts --capability-source deterministic`（默认档）驱动——这是**生产入口本体**，非 shadow（完成门「无 shadow executor 替代生产入口」得到满足）；`--capability-source real` 属真实 CLI run8 范畴，G6 期间禁用。手动面以结构化完成声明驱动真实 publisher（driveManualChain 模式的泛化）。

## 3. 矩阵枚举与剪枝（D-2）

冻结计划原文矩阵：四类项目初始化 × 三档深度 × PASS/FAIL/PWR/BLOCKED_UNKNOWN × 首轮/升档/Re-Gate × manifest new/reconcile/corrupt × crash/resume。全交叉 864 组合中大量为退化或语义不可能组合，本稿将「全部离线场景」定义为下述**分层场景集**（剪枝论证逐条给出）：

**S-CORE 核心交叉（depth × verdict × round = 3×4×3 = 36 场景）**，固定代表性 init 类（新项目）与 manifest=new、无 crash：
- round 语义：`首轮`=一次通过/一次裁决；`升档`=执行中深度升档返工（LIGHT→STANDARD 或 STANDARD→DEEP，返工后重裁）；`Re-Gate`=方案变更触发 solution-gate 重跑（Decision-086 PWR 口径不变）。
- verdict 语义：PASS（CONFIRMED）/ FAIL / PWR（PASS_WITH_RISK，scan 来源 finding 接受）/ BLOCKED_UNKNOWN（verdict 无法分级）。

**S-INIT 初始化类扫描（4 类 × 2 关键 verdict = 8 场景）**：四类项目初始化（新项目/既有代码/原版 SDD/原版 SDLC-SDD，D-088-01 口径）各取 `STANDARD × PASS × 首轮` 与 `STANDARD × FAIL × 回流` 两场景——init 类只影响入口节点与 readiness preflight，与 verdict 维度无交互作用（论证：init 类差异在 requirement-intake 节点收敛，其后链同构）。

**S-MANIFEST manifest 态定向（3 场景）**：new（S-CORE 已覆盖，不重复）、`reconcile`（runtime 尾段 + finding 差量混合追平，V9 语义）、`corrupt`（self-digest 失败 → `MANIFEST_CORRUPT_STOP` 终态，单级判别无需交叉——剪枝论证：corrupt 是第 1 级终止判别，与 verdict/round 无组合语义）。

**S-CRASH crash/resume 定向（6 场景）**：runtime 面 `--resume` 在三个种子崩溃点（gate 裁决后 journal 尾段未投影 / finding 迁移后未投影 / manifest 写入前）各 2 场景（崩溃后恢复、崩溃后重复恢复验证幂等）；手动面对应语义为 publisher 同输入重放逐字节幂等（6 场景中的手动面断言）。

**剪枝汇总**：36 + 8 + 2 + 6 = **52 场景**。退化组合剔除项及理由：`BLOCKED_UNKNOWN × Re-Gate`（verdict 无法分级时不存在重跑 Gate 的裁决输入，走回流映射——语义不可能）；`corrupt × crash`（corrupt 终止先于任何崩溃点）；`升档 × BLOCKED_UNKNOWN`（升档返工的完成声明携带有效裁决，与无法分级互斥）。上述剔除项在验收报告逐条列示，供复审复核。

## 4. 九维比较规格（D-3）

### 4.1 九维（冻结计划 §4/G6 原文）→ 可执行断言

| # | 维度 | 断言（两面对比） |
| --- | --- | --- |
| 1 | 节点序列 | manifest entries 的 node 顺序与各 node status 序列一致（七节点链） |
| 2 | 两个 Gate 角色 | solution-gate 节点的双 binding 条目均在：adversarial_scan 台账绑定记录 + formal_verdict manifest current |
| 3 | stable artifact paths | 各 entry `artifactPath` 逐条相等（同为合同 §3.1 canonical 路径） |
| 4 | 版本/current/stale | entry `version` 相等；生命周期状态映射一致（revision ACTIVE→current、STALE/SUPERSEDED→stale） |
| 5 | Finding identity | findingIndex 各行身份字段（`finding_id`/`discoveredAt`/`rootCauseCategory`/`earliestAffectedNodeId`/`sourceRevision`/`evidenceRef`）逐字段一致 |
| 6 | decisionDepth | 实际执行深度与 envelope `decisionDepth`/`decisionStatus` 记录一致（禁 hardcode，G4 收口语义） |
| 7 | next eligibility | 同一准入谓词（A1–A4）在两面的判定结果一致（如 Gate PASS+CONFIRMED ⇒ A1 task-planning 可准入；ESCALATED/BLOCKED_UNKNOWN ⇒ A1 拒绝） |
| 8 | earliest reroute | finding 的 `earliestAffectedNodeId` 回流目标一致（实现类直达 implementation 不重走 Gate 等 §7.3 映射） |
| 9 | 最终 handoff 状态 | 终态 handoff 产物（human_action_required / 完成态）状态一致 |

### 4.2 归一化规则（承 T5 `normalize()` 并冻结）

比较前从两侧 manifest **剔除执行面字段**（面特有设计，非语义内容）：head 的 `publish_seq`/`projected_through`/`updated_at`；entry 的 `source_event_ref`/`updated_at`/`execution`；顶层 `manifest_digest`/`projection_provenance`/`declaration_log`/`corrections`/`repair_records`。**剔除集即白名单之外的字段**——T2 实现时以断言形式固定：剔除集之外任何字段差异即 FAIL（防止归一化被用来掩盖真实分歧）。语义内容（entries 节点/状态/产物三元组、findingIndex、repair 之外的全部）逐字段深比较。

行为面比较（维度 7/8/9 非 manifest 静态字段）：harness 捕获两面的**行为轨迹**（准入判定结果、回流动作、退出 envelope/退出码）后按维度比对；runtime 面退出以闭字段集结果为准（loop-run.ts 契约：不输出原始 Agent stdout）。

## 5. Fixture 设计（T2 输入）

每场景一个 fixture 族（`tests/fixtures/g6/<scenario-id>/`）：
- **init 材料**：按 init 类准备 intake 侧材料（新项目=空仓+需求文档；既有代码=带既有库的仓；原版 SDD/SDLC-SDD=对应遗留形态）；
- **事实脚本**：场景的节点产出物（技术方案、实现记录、审核记录等）与 finding 事件脚本（哪些节点发现什么 finding、何时关闭/接受）——**两面共用同一事实脚本**（同 digests，T5 模式）；
- **manifest 态种子**：reconcile/corrupt 场景的初始 manifest 态；
- **崩溃种子**：S-CRASH 的 journal 截断点。
- 每 fixture 附带 `expected.md`：该场景的期望九维结果（含剔除集说明），由 T2 实现时从合同推导生成、T4 复审复核。

## 6. Harness 架构（T2 实现，文件面限于 fixtures/harness/tests）

```
tests/g6-parity/（新目录）
  harness.ts        —— 场景运行器：fixture → 驱动两面 → 捕获轨迹
  manual-face.ts    —— 泛化自 driveManualChain：结构化完成声明 → 真实 publisher
  runtime-face.ts   —— scripts/loop-run.ts --capability-source deterministic
                       （子进程或同模块入口；--resume 用于 S-CRASH）
  comparator.ts     —— 归一化 + 九维比较（含剔除集白名单断言）
  report.ts         —— 验收报告生成（§7 格式）
  matrix.ts         —— 52 场景注册表（scenario-id → fixture/期望/剪枝标注）
```

约束：harness 只用真实生产入口（publisher / loop-run deterministic 档）；不得引入 shadow executor；不得写业务仓；fixture 库一律临时目录（`mkdtemp`）。S-CRASH 的 runtime 侧经 `--resume` 真实恢复路径，手动侧经 publisher 重放幂等断言。

## 7. 验收报告格式（T4 交付物）

`docs/reports/g6-d09004-parity-acceptance-report.md`（或评审指定路径），每场景一节：scenario-id / 矩阵坐标 / 剪枝标注（如适用）/ 两面轨迹摘要 / 九维逐维判定（一致或分歧定位）/ 分歧根因（若有）。汇总表：52 场景 × 九维通过矩阵；剔除项清单；结论（完成门三项逐项判定）。报告随 PR 提交，作为 G6 gate CLOSED 申请的证据包。

## 8. 完成门证据定义（T4 裁决基准）

完成门三项逐项可判：
1. **全部离线场景通过** = 52 场景九维全绿（分歧零容忍；任何分歧先修后重跑，修复按 §6 节奏走根因合并式复审）；
2. **无 shadow executor 替代生产入口** = harness 代码审验 + runtime 面入口路径证据（loop-run deterministic 档即生产入口，`--capability-source real` 全程未用）；
3. **随后才允许申请真实 CLI run8** = 本稿不授权 run8；G6 PASS 后 next_transition 由 Current User 裁决是否申请。

## 9. 授权边界

- 本稿不授权任何实施；T2–T4 实施需 Current User 对本规格确认后逐任务授权（沿 §6 节奏：每任务事实快照→合同/不变量复核→实现→本地矩阵→一次根因合并式只读复审→Current User 裁决）。
- 禁止夹带（冻结计划 §5）：真实 CLI、业务仓副作用、shadow executor、合同文本变更、第二份生命周期 schema。
- 既有 parity 测试（YAML 矩阵、T5）全量回归必须保持；G6 新增断言不改既有断言，除非暴露真实缺陷（按收敛规则处理并复审）。
- run8、C03-E 完成判断、C05 维持未授权。
