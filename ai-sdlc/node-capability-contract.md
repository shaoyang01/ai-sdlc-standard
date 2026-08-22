# Node Capability Contract（节点能力合同）

> 状态：Draft（2026-08-22，C02-WP3.5 阶段 3 合同重基线，Decision-044/045；待独立复审与 Current User 收口后升 Accepted）
> 关联：[LOOP Core Contract](../docs/LOOP_CORE_CONTRACT.md) §6.1 · [C02-WP3.5 影响分析与实施规划](../docs/LOOP-CORE-C02-WP3.5-SINGLE-RAIL-IMPACT-ANALYSIS.md) §3 A1/A2 · [Artifact Flow](artifact-flow.md) · [Entry Contract](loop-entry-contract.md)

## 1. Purpose

定义 LOOP 的节点能力合同面：**节点声明它需要的能力，而不是声明由哪个 Agent 执行**。能力是 Agent 中立的合同类型（需求归一化、技术方案设计、方案门禁、任务规划、实现、代码审核、知识同步）；选择实际执行者属于 binding 层（WP-3）。

v2 单轨（Decision-044）：canonical 链固定为 `requirement-intake → solution-design → solution-gate → task-planning → implementation → code-review → knowledge-sync`；不再存在 Direct/Speckit 路径分流与独立 Speckit 产物轨道；`solution-gate` 是**一个节点、两个执行角色**（`adversarial_scan` 对抗扫描 / `formal_verdict` 正式裁决），两角色必须由不同 Agent binding 执行（绑定级分离）。

本合同的验收基线：任何节点合同字段中不得出现 Agent 专属名（Kimi / Codex / Hermes）；替换执行者不改变节点合同（Requirement ID、产物 schema、finding 语义、Re-Gate 路由、人工 Git 边界）。

## 2. 能力类型清单

| 能力 ID | 标题 | 执行角色 | 对应产物节点 |
| --- | --- | --- | --- |
| `requirement-intake` | 需求归一化与反馈分类 | `primary` | `00-需求资料/` |
| `solution-design` | 技术方案设计与深化 | `primary` | `01-技术方案/` |
| `solution-gate` | 方案门禁（对抗扫描与正式裁决） | `adversarial_scan` + `formal_verdict` | `02-方案审核/` |
| `task-planning` | 任务规划与实现前一致性审计 | `primary` | `03-任务规划/` |
| `implementation` | 实现与证据记录 | `primary` | `04-实现记录/` |
| `code-review` | 代码审核与收敛复审 | `primary` | `05-代码审核/` |
| `knowledge-sync` | 知识同步与对账 | `primary` | `06-知识同步/` |

能力清单对应 LOOP Core Contract §4 的 Canonical Artifact Chain（v2）。`solution-gate` 的对抗扫描产出 Finding Ledger、正式裁决消费该 ledger 并输出 Gate 与设计深度裁决；两角色不得由同一 Agent 执行（Decision-044）。

## 3. 节点合同模板

每个能力一个节点合同，字段：

```text
capability:           能力 ID（§2 清单）
title:                能力标题
executionRoles:       执行角色（数组；`solution-gate` 为两个，其余为一个）
inputArtifacts:       输入产物引用（library/{requirement_id}/ 下有效版本）
outputArtifact:       输出产物节点路径
gate:                 进入/退出本节点必须通过的 Gate
sideEffectBoundary:   本节点允许的副作用
prohibited:           本节点禁止的副作用
```

约束：

- 合同字段不得出现 Agent 专属名；
- 输入必须引用**当前有效版本**的产物（版本与引用规则见 [Artifact Versioning](artifact-versioning.md)）；
- Gate 与 [Phase Gates](phase-gates.md) 对齐；节点准入的确定性检查由 LOOP runtime 执行，不依赖人工调用 Gate Skill；
- 节点合同由 binding（WP-3）选择执行者，执行者替换不修改本合同；`solution-gate` 的两角色必须解析为不同 Agent（绑定级分离）。

### 3.5 规范源与一致性守卫

本文档 §4 是合同的**单一规范源**（人工权威）；`core/node-capability-contracts.ts` 是其机器投影（WP-3 消费）。测试解析器（`tests/node-capability-contract.test.ts`）**直接读取本文档 §4 的 ```text 块**，按以下规则解析后与机器投影深度比较，任一侧漂移即失败：

- 标量字段（`capability` / `title` / `outputArtifact` / `gate` / `sideEffectBoundary`）：`字段: 值` 单行；
- 数组字段（`executionRoles` / `inputArtifacts` / `prohibited`）：`字段:` 后跟随 `  - 子项` 行，直到下一个字段或块尾；
- Markdown 反引号是展示标记，解析时剥离后比较。

修改 §4 任一字段时，必须同步更新机器投影；反之亦然。测试不依赖任何第三份手工副本。

## 4. 七个能力的节点合同

### 4.1 `requirement-intake` — 需求归一化与反馈分类

```text
capability:          requirement-intake
title:               需求归一化与反馈分类
executionRoles:
  - primary
inputArtifacts:
  - 需求来源（对话/飞书/HTML/Markdown/PDF/截图/测试反馈）
outputArtifact:      library/{requirement_id}/00-需求资料/{requirement_id}_需求摘要.md
gate:                入口义务完成（Entry Contract §3）；业务目标可识别；change record 已建立（新需求/补充/变更/返工/反馈）
sideEffectBoundary:  创建/恢复运行记录（run journal）；写入 00-需求资料
prohibited:
  - 生成技术方案
  - 裁决设计深度
  - 修改生产代码、specs/**、.specify/**
```

### 4.2 `solution-design` — 技术方案设计与深化

```text
capability:          solution-design
title:               技术方案设计与深化
executionRoles:
  - primary
inputArtifacts:
  - 00-需求资料/{requirement_id}_需求摘要.md（当前版本）
outputArtifact:      library/{requirement_id}/01-技术方案/{requirement_id}_技术方案.md
gate:                需求摘要有效（当前版本）；无首轮深度前置——深度档位由 solution-gate 首次裁决，升档返工时按当前深度裁决重新设计
sideEffectBoundary:  写入 01-技术方案
prohibited:
  - 绕过需求摘要
  - 补造未定义业务规则
  - 修改生产代码
  - 恢复独立 Speckit 产物轨道
```

### 4.3 `solution-gate` — 方案门禁（对抗扫描与正式裁决）

```text
capability:          solution-gate
title:               方案门禁（对抗扫描与正式裁决）
executionRoles:
  - adversarial_scan
  - formal_verdict
inputArtifacts:
  - 01-技术方案/{requirement_id}_技术方案.md（当前版本）
  - 对抗扫描 Finding Ledger（formal_verdict 消费）
outputArtifact:      library/{requirement_id}/02-方案审核/{requirement_id}_方案审核.md（含 verdict 与设计深度裁决）
gate:                Specification Completeness Audit（sdlc-solution-gate）；无未解决 Blocking finding；扫描与裁决由不同 Agent binding 执行
sideEffectBoundary:  输出 Gate Result（PASS / FAIL / PASS_WITH_RISK）与设计深度裁决（depth + decision_status）
prohibited:
  - 同一 Agent 执行扫描与裁决
  - 仅凭再次执行 Agent 推定 finding 关闭
  - 无深度裁决时放行进入实现
  - 代写技术方案
```

### 4.4 `task-planning` — 任务规划与实现前一致性审计

```text
capability:          task-planning
title:               任务规划与实现前一致性审计
executionRoles:
  - primary
inputArtifacts:
  - 01-技术方案（当前版本）
  - 02-方案审核（Gate 与深度裁决）
outputArtifact:      library/{requirement_id}/03-任务规划/{requirement_id}_任务计划.md
gate:                方案审核通过；深度裁决为 DECIDED
sideEffectBoundary:  写入 03-任务规划；实现前一致性审计
prohibited:
  - 改变已批准方案行为
  - 跳过方案缺口直接拆任务
  - 把 analyze/checklist 恢复为独立产物轨道
```

### 4.5 `implementation` — 实现与证据记录

```text
capability:          implementation
title:               实现与证据记录
executionRoles:
  - primary
inputArtifacts:
  - 01-技术方案（已审核通过）
  - 02-方案审核（Gate 与深度裁决）
  - 03-任务规划（任务边界）
outputArtifact:      工作区改动 + 实现记录（library/{requirement_id}/04-实现记录/）
gate:                方案审核通过；深度裁决为 DECIDED；任务边界确定
sideEffectBoundary:  受已批准方案约束的代码改动；本地验证；记录证据（引用 diff/测试输出/journal 事件）
prohibited:
  - 超出已批准行为
  - commit/push/PR/merge/发布
  - 补未定义业务规则
  - 以自述代替证据
```

### 4.6 `code-review` — 代码审核与收敛复审

```text
capability:          code-review
title:               代码审核与收敛复审
executionRoles:
  - primary
inputArtifacts:
  - 实现产物/diff
  - 01-技术方案
  - 03-任务规划
  - 02-方案审核
outputArtifact:      library/{requirement_id}/05-代码审核/{requirement_id}_代码审核.md（含 Finding Ledger 与 closure review）
gate:                实现记录存在且证据可核验；审核范围（changed files → canonical files）确定
sideEffectBoundary:  输出可定位、可修复的 findings（severity + 位置/证据）；closure review 只审关闭
prohibited:
  - 输出泛泛不可执行建议
  - 把方案缺口只当作代码问题（应回流 solution-design）
  - 自审自批
```

### 4.7 `knowledge-sync` — 知识同步与对账

```text
capability:          knowledge-sync
title:               知识同步与对账
executionRoles:
  - primary
inputArtifacts:
  - 七节点 current revisions
  - 已关闭/已接受 finding proof
  - 代码/测试 evidence
  - 目标知识现状
outputArtifact:      library/{requirement_id}/06-知识同步/{requirement_id}_知识同步结果.md
gate:                当前 generation 七节点 current revisions 有效；无未关闭 blocking finding
sideEffectBoundary:  写入 06-知识同步；本地写授权下更新目标知识
prohibited:
  - 以 specs/**、pipeline run、sync source mode 或历史聊天为并列 authority
  - 未经 requirement-intake 直接消费原始测试/线上反馈
  - 自行选择稳定事实或标记同步完成
```

## 5. 与现有执行面的关系

- 本合同是**能力合同面**；旧图节点（`loop/types` 的 `DocFlowNode`、`sdlc_graph/**`、`loop/registry/node_map.ts`）是历史执行面，随 v2 cutover 退役（WP3.5-C），不得作为第二套运行时权威。
- 能力与产物节点通过 §2 表格映射；`solution-gate` 的两个执行角色不拆分为两个节点。
- `loop/types` 的 `AgentMapEntry`（node→agent 静态绑定）**废弃**（Decision-020/023）：节点选择使用能力合同，选择执行者是 binding 层职责；该类型仅保留供 legacy 引擎兼容，不再作为节点绑定依据。

## 6. 与 WP-3（Agent Capability Binding）的关系

- WP-3 的 binding 只做一件事：**为节点合同选择已启用执行者**，并校验执行者输出是否符合节点输出合同。
- binding 不定义、不修改节点合同；替换 binding 不改变 Requirement ID、产物 schema、finding 语义、Re-Gate 路由、人工 Git 边界。
- `solution-gate` 的 `adversarial_scan` 与 `formal_verdict` 必须解析为不同 Agent binding（Decision-044）；binding 模型升版为 `(capability, executionRole, agent)` 属 WP3.5-B 实施范围，本合同只固定该约束。

## 7. 边界（本 WP 不做）

- 不实现 binding 的启用/注册/替换（WP3.5-B）；
- 不调用任何真实 Agent；
- 不改造旧图节点执行语义（WP3.5-C）；
- 不产生任何 Git 发布动作。

## Revision Record

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 2.0.0 | 2026-08-22 | Draft | C02-WP3.5 阶段 3 合同重基线（Decision-044/045）：能力集切换为 v2 七节点单轨链；新增 `executionRoles` 字段（solution-gate 固定双角色，其余 primary）；Gate/产物路径/禁止项按 v2 语义重写（深度裁决、Finding Ledger、03-任务规划/06-知识同步 新路径、05-测试验收 退役）。 |
| 0.1.2 | 2026-08-19 | Accepted | Correction（review round 2）：§4 规范化（显式 capability/title、数组多行列表），成为可机械解析的单一规范源；测试改为直接解析文档 §4 与投影深度比较，删除第三份 EXPECTED 副本；§3.5 更新守卫描述。 |
| 0.1.1 | 2026-08-19 | Accepted | Correction（review round 1）：明确 `core/node-capability-contracts.ts` 为规范机器投影（补全 §4 全部约束，不再弱化）；新增 §3.5 规范源声明与文档—投影一致性守卫。 |
| 0.1.0 | 2026-08-19 | Accepted | WP-2 交付：7 个能力类型清单、节点合同模板与完整合同、AgentMapEntry 废弃决策、与执行面/binding 的关系。 |
