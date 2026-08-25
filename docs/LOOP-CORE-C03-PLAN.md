# LOOP-CORE-03 有界实现规划（C03 Single-Rail Skill Delivery — Bounded Implementation Plan）

> 规划状态：**ACCEPTED**（2026-08-25，Current User 裁决接受全部五项裁决点的建议方案，
> Decision-050；本规划成为正式合同。接受前仅为草案，不构成任何实施授权、不消费
> `LOOP_CORE_C03_ENTRY_AUTHORIZATION_GATE`——三包实施授权仍逐包单独申请）
> 执行状态：**C03-A CLOSED（2026-08-25，Decision-051）· C03-B AUTHORIZED（2026-08-25，Decision-052，HOLD 已解除）· C03-C 未授权**
> （C03-B HOLD 解除裁决：Current User 明确 go/no-go —— 旧版 sdlc-* Skill 退役时点 = 随 C03-B 实施一次性原子切换；解除后按规划 §6 C03-B b1～b7 执行，独立复审后收口。）
> 日期：2026-08-25
> 上游依据：
> - [Autonomous Delivery Roadmap](AI-SDLC-Autonomous-Delivery-Roadmap.md) v2.2.3 §4 `LOOP-CORE-03`
> - [Decision-045] Skill 收敛映射（21 → 7+1 拓扑，唯一归属权威）
> - [Decision-044] 单轨重基线六项固定决策（Q2 深度档位、Q1 声明式 cutover）
> - [WP3.5 影响分析](LOOP-CORE-C02-WP3.5-SINGLE-RAIL-IMPACT-ANALYSIS.md) §6 D3 规则、§8 F row 7～9、H3 裁决记录
> - [Decision-049] LOOP-CORE-02 = COMPLETED（前置已满足）

## 1. 文档定位与授权边界

本文件把 Roadmap 已接受的 `LOOP-CORE-03` 完成合同分解为三个有界工作包（沿用影响分析
§8 F row 7～9 的既定拆分），并记录现状审计、设计不变量、验收映射与待裁决点。

本轮（起草轮）仅覆盖：

1. 盘点当前 Skill 交付面现状；
2. 形成本草案并登记「草案待审」；
3. 提出待 Current User 裁决的点（§11）。

本轮不授权：任何 Skill 包的实现、manifest/registry 变更、旧包删除、安装副本处置、
校验器修改、Delivery Tail 代码改动。三工作包将按 §7 顺序**逐包单独授权**
（影响分析既定规则：每包只消费本行授权，前一包通过不自动授权后一包）。

## 2. 完成合同（Roadmap §4 LOOP-CORE-03）

- **objective**：在 C02 单轨链的有效方案与深度裁决之上，交付与七节点一一对应的
  canonical Skill 集，以及不拥有 LOOP 生命周期状态的通用文档 Skill
  `sdlc-docflow-writer`（收敛映射见 Decision-045），并在一个真实目标仓库中完成受约束
  的实现、文档治理、代码审核和知识同步，交付人工 Git 交接包。
- **expected_output**：七个 canonical 节点 Skill、一个 non-node utility skill 及其
  合同/注册/校验器；工作区改动、实现记录、代码审核、知识同步结论、未执行项、残余风
  险、恢复说明和 `READY_FOR_MANUAL_GIT_HANDOFF` 或明确失败结果。
- **completion_contract**：无 blocking finding 时，工作区与当前产物一致，且已记录改
  动文件、验证命令及结果、未执行检查、残余风险和恢复说明；只输出
  `READY_FOR_MANUAL_GIT_HANDOFF`，不产生远程 Git 副作用；否则输出可继续的
  blocked/failed 结论。
- **continuity**：C03 定义 Core 的共同交付尾部；若代码审核改变已批准行为/架构/验收事
  实，必须回流 C02。

## 3. 现状审计（基线：产品仓 `d2770c2`）

| 面 | 现状 |
| --- | --- |
| `skills/` | 21 个旧包目录（每个含 SKILL.md ± references/）：code-review-excellence、code-review-normalizer、docflow-writer、gate-runner、implementation-recorder、requirement-normalizer、solution-challenger、solution-reviewer、specification-writer、speckit-analyze、speckit-checklist、speckit-clarify、speckit-code-doc-reconcile、speckit-implement、speckit-pipeline、speckit-plan、speckit-specify、speckit-sync、speckit-tasks、test-feedback-classifier、test-feedback-sync |
| `skill-contracts/known-skills/` | 与上 21 个一一对应的合同文件 + skill-category-guide |
| `manifest.yaml` | 公开注册全部 21 个包（path/contract/references 三元组）；**含 H3 断链**：speckit-pipeline / speckit-sync 引用已删除的合同文件 |
| `registry/skill-registry.md` | 21 包注册文档 |
| 全局安装副本 | 仓外用户级安装副本（位置随用户环境），内容为某历史时点的同一包集 |
| 校验器 | `validate-skill-contracts.rb`（manifest↔skills↔known-skills 一致性）、`validate-gate-runner-scenarios.rb`（gate-runner 专属，退役后需处置）、其余 standards 校验器与本包无关 |
| 特殊 Gate 遗产 | gate-runner 拥有两个 canonical 特殊 Gate：`development_path_entry`、`documentation_governance_tail_completion`（Decision-045 裁定其承接：确定性准入迁 runtime、治理尾部完成检查迁 Delivery Tail） |
| 新拓扑包 | **尚不存在**——七个节点 Skill 与（复核后的）docflow-writer 均未创建 |

### H3 中间态声明

`H3`（旧包引用已删合同文件的公开断链）在本规划全程维持 OPEN、归属 C03-B；A 阶段不修
旧包引用（既有裁决：不得塞入他包、只能原子消除）。这意味着 A 阶段结束时仓库处于
「新八包完整可用但未公开注册 + 旧二十一包仍公开注册且部分断链」的双拓扑中间态——该
中间态已被 H3 裁决接受为合法过渡，B 阶段一次性消除。

## 4. 缺口

- **G1** 七个节点 Skill 包不存在；其能力散落在 14 个旧包中（映射见 §6-A2 表）。
- **G2** 八份新合同（7 node + docflow-writer 边界声明）不存在；旧 known-skills 合同
  不能直接复用（职责边界变化，如 solution-gate 吸收 clarify/challenger）。
- **G3** manifest / registry / known-skills 的公开拓扑仍是 21 旧包；切换与删除未执行。
- **G4** 全局安装副本未盘点、未处置。
- **G5** gate-runner 退役后，`development_path_entry` 与
  `documentation_governance_tail_completion` 两个特殊 Gate 的承接落点未落地。
- **G6** `validate-skill-contracts.rb` 需扩展以校验七加一新拓扑（存在性、无悬空引
  用、节点清单与 runtime `NODE_CAPABILITY_IDS` 对齐）；gate-runner 场景校验器需随退
  役处置。

## 5. 设计不变量（Accepted 后成为硬边界）

1. **INV1 节点 Skill 无流程权威**：节点 Skill 只承载专业内容能力；Gate 裁决、节点准
   入、generation/Re-Gate 推进权一律属于 C02 runtime。docflow-writer 额外排除节点注
   册资格（non-node utility）。
2. **INV2 solution-gate 双角色防火墙**：adversarial_scan 与 formal_verdict 由不同
   Agent binding 承载；Skill 层仅提供两类内容能力并在合同中显式声明不得合并执行。
3. **INV3 原子 cutover**：B 阶段在同一变更边界内完成「新八包可用 → manifest/registry
   切换 → 旧二十包及其依赖删除」；H3 由此闭合。禁止分批切换、禁止保留旧 ID 别名或
   shim。
4. **INV4 合同完整性（反 H3 再发）**：任何公开注册条目引用的文件必须存在；校验器强
   制「零悬空引用」，违者 standards 门禁红。
5. **INV5 映射冻结**：Decision-045 的能力归属映射是唯一权威；实现期发现的能力归届
   疑义回 Current User 裁决，不得就地重新分派。
6. **INV6 形态沿用**：新包沿用现行 SKILL.md 形态（frontmatter name/description/
   version + 正文 Core Rules + references/ 分册）与 known-skills 合同格式；不引入新
   的打包机制。
7. **INV7 无第二编排**：不新增任何流程推进、状态机或调度逻辑；Skill 与 C02 runtime
   的关系是「内容能力被 runtime 通过 binding 调用」。
8. **INV8 退役即删除**：cutover 后旧 ID（含 speckit-\*、gate-runner）在仓内无目录、
   无 manifest 条目、无 registry 条目；历史文档中的提及属档案不受此限。
9. **INV9 Delivery Tail 语义不变**：delivery checkpoint 的 generation/CAS 底座与
   `READY_FOR_MANUAL_GIT_HANDOFF` 输出契约保持原样。
10. **INV10 副本一致**：全局安装副本与仓内包集的一致性由 B 阶段统一建立并纳入校验。

## 6. 工作包

### C03-A — Canonical Skill Delivery（影响分析 F row 7）

**Material outcome**：八个目标包（7 node + docflow-writer 复核）在仓内完整交付——合
同、SKILL.md、references 齐备，校验器可验证——但不触碰公开注册面（留给 B）。

任务分解：

- **A1 合同先行**：起草 8 份 `known-skills` 合同，逐包明确：输入产物、输出产物、
  Core Rules、与其他节点的边界、禁则（含 INV1/INV2 条款）。solution-gate 合同必须
  显式包含双角色条款（adversarial_scan 内容能力 vs formal_verdict 裁决内容能力，
  二者由不同 Agent binding 承载）。
- **A2 节点包实现**（映射冻结，来源吸收清单如下）：

  | 新包 | 吸收来源（Decision-045 冻结） |
  | --- | --- |
  | `sdlc-requirement-intake` | requirement-normalizer + test-feedback-classifier |
  | `sdlc-solution-design` | specification-writer + speckit-specify + speckit-plan |
  | `sdlc-solution-gate` | solution-challenger + solution-reviewer + speckit-clarify |
  | `sdlc-task-planning` | speckit-tasks + speckit-analyze（+checklist 内部校验） |
  | `sdlc-implementation` | speckit-implement + implementation-recorder（+checklist 内部校验） |
  | `sdlc-code-review` | code-review-excellence + code-review-normalizer |
  | `sdlc-knowledge-sync` | speckit-sync + speckit-code-doc-reconcile + test-feedback-sync |

  实现方式：按映射**迁移并重写**各旧包 SKILL.md 与 references 到新包命名空间，消除
  旧职责表述；每个新包附「能力来源对照表」（旧 ID → 本包章节），供复审逐项核对
  Decision-045 落点。
- **A3 docflow-writer 复核**：保留现目录；补充非节点边界声明（不注册节点、无 Gate
  权）到其合同与 SKILL.md。
- **A4 校验器扩展**：`validate-skill-contracts.rb` 增加——七加一存在性与完备性、零悬
  空引用（INV4）、节点 Skill 名单与 `NODE_CAPABILITY_IDS` 的对齐测试（防漂移）；
  gate-runner 场景校验器的处置随 B（见 C03-B 任务 b5）。
- **A5 role firewall 可验证物**：solution-gate 合同条款 + 一个专项测试/校验断言，证
  明双角色条款存在且与 binding 结构（C02 registry）一致。

验收（F row 7）：Decision-045 能力逐项有落点（对照表齐全）；solution-gate role
firewall 可验证；`validate-skill-contracts.rb` 全绿（新八包 + 旧二十一包并存通过——
旧包断链维持现状豁免至 B）。明确不做：registry/manifest 变更、旧包删除、安装副本。

### C03-B — Registry and Install Cutover（影响分析 F row 8）

**Material outcome**：原子切换完成后，公开面只剩七加一拓扑；H3 关闭。

任务分解：

- b1 `manifest.yaml`：删除 20 个旧条目（21 减 docflow-writer），新增/替换为 8 个新
  条目（path/contract/references 全部指向存在的文件——INV4）。
- b2 `registry/skill-registry.md` 重写为七加一拓扑文档。
- b3 `skill-contracts/known-skills/`：删除 20 份旧合同，落入 A1 的 8 份新合同；
  category-guide 相应更新。
- b4 删除 20 个旧 `skills/` 目录（docflow-writer 保留）。
- b5 校验器收尾：移除 gate-runner 场景校验器或改造为其遗产 Gate 的迁移说明；全量
  standards 门禁绿。
- b6 安装副本（G4）：盘点 → 重建为七加一 → 与仓内一致性校验（INV10）；处置方式记
  录进本包提交说明。
- b7 **H3 关闭验证**：活动路径残留扫描清零（无任何公开条目引用不存在文件）+ 真实
  入口可调用性验证（新会话能发现并调用七加一拓扑）；finding 转 CLOSED。

验收（F row 8）：原子切换（单提交/单 PR）；旧 ID 无公开入口；新会话发现七加一拓
扑。明确不做：除上述外的任何行为变更。

### C03-C — Delivery Tail Integration（影响分析 F row 9）

**Material outcome**：gate-runner 退役后，治理尾部仍可产出可恢复的
`READY_FOR_MANUAL_GIT_HANDOFF` 或诚实阻塞。

任务分解：

- c1 `development_path_entry` 确定性准入：迁入 LOOP runtime 守卫（对齐 Decision-045
  「确定性节点准入归 runtime」），以 store 公开事实判定，输出与原 Gate 兼容的结
  论结构。
- c2 `documentation_governance_tail_completion`：迁入 C03 Delivery Tail /
  delivery-checkpoint 流程（INV9 底座复用）。
- c3 manual handoff 清单：实现记录、代码审核、知识同步结论、未执行项、残余风险、恢
  复说明的聚合输出契约（对接 C05 未来验收）。

验收（F row 9）：无 gate-runner 仍可得到可恢复的 handoff 结论或诚实阻塞。明确不
做：commit/push/PR/merge 等远程副作用。

## 7. 依赖顺序与授权粒度

```
C03-A ──> C03-B ──> C03-C
```

严格串行；每阶段单独授权、单独实施分支、Draft PR、独立复审、Current User 收口裁
决（沿用 C01～C02 既定循环）。前一包 PASS 不自动授权后一包。

## 8. 完成合同验收映射

| Roadmap 完成合同要素 | 主覆盖包 | 证据 |
| --- | --- | --- |
| 七节点一一对应 canonical Skill 集 | A | A2 对照表 + A4 校验器 + B 后 registry |
| docflow-writer 非节点地位 | A3/A1 | 合同边界声明 + 校验器排除节点注册 |
| 合同/注册/校验器齐备 | A1/A4/B | standards 门禁全绿（含新校验规则） |
| 受约束实现/文档治理/审核/知识同步能力可用 | B | 真实入口可调用性验证（b7） |
| `READY_FOR_MANUAL_GIT_HANDOFF` 或诚实阻塞 | C | c1～c3 产出契约 + 演示场景 |
| 无远程 Git 副作用 | 全程 | 沿用 C01/C02 边界扫描惯例 |

## 9. 明确不做

- C05 真实单仓验收；真实 Agent Provider；commit/push/Draft PR 之外的远程副作用；
- 恢复 speckit 独立轨道、gate-runner 独立 Skill、Direct/Speckit 路径分流；
- docflow-writer 注册为 LOOP 节点、授予 Gate/流程推进权；
- 改动 C02 runtime 编排语义（c1/c2 仅消费 store 公开事实与既有 checkpoint 底座）;
- 新增第二套打包/安装机制（INV6）。

## 10. 风险与控制

| 风险 | 控制 |
| --- | --- |
| 能力吸收遗漏（旧包内容未迁尽） | A2 强制「来源对照表」逐包落盘；复审按 Decision-045 映射逐项核对 |
| 双拓扑中间态误用（A 阶段有人调用半成品新包） | 新包不注册即不可被发现（发现面只有 manifest/registry）；A 阶段不加调用入口 |
| 原子切换遗漏文件导致二次断链 | b1/b3/b4 以单一提交承载 + INV4 校验器门禁 + b7 双重验证 |
| 安装副本漂移 | b6 盘点-重建-校验三步留痕（INV10） |
| validator 回归破坏既有门禁 | A4/B5 每步跑全量 standards |
| 特殊 Gate 迁移改变语义 | c1/c2 只做承接不改判定规则；输出结构兼容测试 |

## 11. 裁决记录

Current User 于 2026-08-25 裁决（Decision-050）：五项裁决点全部按建议方案成立。

1. **Q1 交付节奏 ✅**：A 阶段八包在同一实施分支串行交付、整包送审（而非逐包 PR）；
2. **Q2 特殊 Gate 承接落点 ✅**：`development_path_entry` 迁入 runtime 确定性守卫、
   `documentation_governance_tail_completion` 迁入 C03-C 的 Delivery Tail 流程
   （对齐 Decision-045 既有裁定方向）;
3. **Q3 删除范围 ✅**：B 阶段删除清单为「20 个旧包目录 + 20 份旧合同 + manifest/
   registry 对应条目 + gate-runner 场景校验器」，docflow-writer 全套保留；
4. **Q4 安装副本盘点责任 ✅**：由实施方盘点并给出处置记录，位置清单随 b6 提交说明
   留痕；
5. **Q5 授权粒度 ✅**：三包逐包授权（既定），C03-A 实施授权在本文档 Accepted 后另
   行申请——本规划 Accepted 不等于任何实施授权。

## 12. 进度管理与收口

- 产品仓保存本规划与各包实施/复审证据；控制平面只记录动态指针与授权状态；
- 每包必须留下：范围、明确排除、产品提交、默认门禁结果、独立复审报告与用户裁决；
- 三包全部收口后，按 Roadmap 完成合同登记 `LOOP-CORE-03 = COMPLETED`（收口裁决由
  Current User 作出）；C05 依赖仅 LOOP-CORE-03，届时另行规划。

## Revision Record

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 0.1.0 | 2026-08-25 | Draft for Current User review | 初稿：三工作包分解（沿用影响分析 F row 7～9）、十项设计不变量、现状审计、缺口 G1～G6、待裁决点 Q1～Q5。 |
| 0.2.0 | 2026-08-25 | Accepted | Current User 裁决接受全部五项裁决点建议方案（Decision-050）；规划状态 Draft → **Accepted**，成为 LOOP-CORE-03 正式实施合同。三包实施授权仍逐包单独申请；本修订随 PR #105 合并持久化。 |
| 1.0.0 | 2026-08-25 | Accepted | 登记 **C03-A 收口与 C03-B 挂起**（Decision-051）：C03-A 经三轮独立复审收口（R3 PASS 无 P1/P2；基线 PR #106 head `d579d14`），授权 `C03_A_CANONICAL_SKILL_DELIVERY` 消费。**C03-B 进入 CURRENT_USER_HOLD**——旧版 sdlc-* Skill 仍在日常开发中活跃使用，原子切换时点由 Current User 决定；挂起期间双拓扑中间态合法持续、新八包内容冻结、H3 维持 OPEN 归 C03-B。C03-C 因依赖 B 顺延不可开始。 |
| 1.0.1 | 2026-08-25 | Accepted | 登记 **C03-B 授权与 HOLD 解除**（Decision-052）：Current User 明确 go/no-go —— 旧版 sdlc-* Skill 退役时点 = 随 C03-B 实施一次性原子切换；`C03_B_REGISTRY_AND_INSTALL_CUTOVER`（F row 8）授权成立，范围＝规划 §6 C03-B b1～b7（manifest/registry/known-skills/旧 skills 目录原子切换、校验器收尾、安装副本盘点重建、H3 关闭双重验证），排除任何超出清单的行为变更。实施按既定节奏：单独分支、Draft PR、独立完整复审、Current User 收口裁决。 |
