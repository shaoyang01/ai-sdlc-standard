# Node Capability Contract（节点能力合同）

> 状态：Accepted（2026-08-19，WP-2 交付，Decision-023）
> 关联：[LOOP Core Contract](../docs/LOOP_CORE_CONTRACT.md) §6.1 · [Development Path Governance](development-path-governance.md) · [Artifact Flow](artifact-flow.md) · [Entry Contract](loop-entry-contract.md)

## 1. Purpose

定义 LOOP 的节点能力合同面：**节点声明它需要的能力，而不是声明由哪个 Agent 执行**。能力是 Agent 中立的合同类型（需求归一化、技术方案生成、方案挑战、方案审核、实现、代码审核、测试验收）；选择实际执行者属于 binding 层（WP-3）。

本合同的验收基线：任何节点合同字段中不得出现 Agent 专属名（Kimi / Codex / Hermes）；替换执行者不改变节点合同（Requirement ID、产物 schema、finding 语义、Re-Gate 路由、人工 Git 边界）。

## 2. 能力类型清单

| 能力 ID | 标题 | 对应产物节点 |
| --- | --- | --- |
| `requirement-intake` | 需求归一化 | `00-需求资料/` |
| `tech-design` | 技术方案生成 | `01-技术方案/` |
| `solution-challenge` | 方案挑战 | 方案挑战产物 |
| `solution-review` | 方案审核 | `02-方案审核/` |
| `implementation` | 实现 | 实现产物（工作区改动） |
| `code-review` | 代码审核 | `04-代码审核/` |
| `test-validation` | 测试验收 | `05-测试验收/` |

能力清单对应 LOOP Core Contract §4 的 Canonical Artifact Chain；链上的"方案挑战"与"方案审核"是两个独立能力（挑战发现有效问题时先回流最早受影响节点，再进入审核）。

## 3. 节点合同模板

每个能力一个节点合同，字段：

```text
capability:           能力 ID（§2 清单）
title:                能力标题
inputArtifacts:       输入产物引用（library/{requirement_id}/ 下有效版本）
outputArtifact:       输出产物节点路径
gate:                 进入/退出本节点必须通过的 Gate
sideEffectBoundary:   本节点允许的副作用
prohibited:           本节点禁止的副作用
```

约束：

- 合同字段不得出现 Agent 专属名；
- 输入必须引用**当前有效版本**的产物（版本与引用规则见 [Artifact Versioning](artifact-versioning.md)）；
- Gate 与 [Phase Gates](phase-gates.md) / `sdlc-gate-runner` 对齐；
- 节点合同由 binding（WP-3）选择执行者，执行者替换不修改本合同。

## 4. 七个能力的节点合同

### 4.1 `requirement-intake` — 需求归一化

```text
inputArtifacts:      [需求来源（对话/飞书/HTML/Markdown/PDF/截图）]
outputArtifact:      library/{requirement_id}/00-需求资料/{requirement_id}_需求摘要.md
gate:                入口义务完成（Entry Contract §3）；业务目标可识别
sideEffectBoundary:  创建/恢复运行记录（run journal）；写入 00-需求资料
prohibited:          生成技术方案；决定开发路径；修改生产代码、specs/**、.specify/**
```

### 4.2 `tech-design` — 技术方案生成

```text
inputArtifacts:      [00-需求资料/{requirement_id}_需求摘要.md]
outputArtifact:      library/{requirement_id}/01-技术方案/{requirement_id}_技术方案.md
gate:                需求摘要有效；Specification Audit 前置要求满足
sideEffectBoundary:  写入 01-技术方案
prohibited:          绕过需求摘要；补造未定义业务规则；修改生产代码
```

### 4.3 `solution-challenge` — 方案挑战

```text
inputArtifacts:      [01-技术方案/{requirement_id}_技术方案.md（当前版本）]
outputArtifact:      方案挑战产物（findings：已解决/未解决，引用方案版本）
gate:                技术方案存在且为有效版本
sideEffectBoundary:  记录 findings；发现有效问题时回流最早受影响节点
prohibited:          仅凭"再次执行了 Agent"推定问题关闭；跳过审核直接放行
```

### 4.4 `solution-review` — 方案审核

```text
inputArtifacts:      [01-技术方案（当前版本）；方案挑战 findings]
outputArtifact:      library/{requirement_id}/02-方案审核/{requirement_id}_方案审核.html|md
gate:                Specification Completeness Audit（`sdlc-solution-reviewer`）；无未解决 Blocking finding
sideEffectBoundary:  输出 Gate Result（PASS / FAIL / PASS_WITH_RISK）与开发路径建议
prohibited:          代写技术方案；无开发路径建议时放行进入实现
```

### 4.5 `implementation` — 实现

```text
inputArtifacts:      [01-技术方案（已审核通过）；02-方案审核/开发路径决定；任务边界]
outputArtifact:      工作区改动 + 实现记录（library/{requirement_id}/03-实现记录/）
gate:                方案审核通过；路径决定为 DIRECT_IMPLEMENTATION 或 Speckit 任务准入
sideEffectBoundary:  受已批准方案约束的代码改动；本地验证
prohibited:          超出已批准行为；commit/push/PR/merge/发布；补未定义业务规则
```

### 4.6 `code-review` — 代码审核

```text
inputArtifacts:      [实现产物/diff；01-技术方案；任务边界]
outputArtifact:      library/{requirement_id}/04-代码审核/{requirement_id}_代码审核.md
gate:                实现记录存在；审核范围（changed files → canonical files）确定
sideEffectBoundary:  输出可定位、可修复的 findings（severity + 位置/证据）
prohibited:          输出泛泛不可执行建议；把方案缺口只当作代码问题（应回流技术方案）
```

### 4.7 `test-validation` — 测试验收

```text
inputArtifacts:      [实现产物；测试结果；01-技术方案；04-代码审核]
outputArtifact:      library/{requirement_id}/05-测试验收/{requirement_id}_测试验收.html|md
gate:                代码审核通过；测试证据可复现
sideEffectBoundary:  执行验证；记录未执行项、残余风险、恢复说明
prohibited:          以未验证测试或历史 CI 替代本次验收；伪造通过
```

## 5. 与现有 DocFlow 节点/执行面的关系

- 本合同是**能力合同面**；现有图节点（`loop/types` 的 `DocFlowNode`）与执行产物是**执行面**。
- 能力与产物节点通过 §2 表格映射；节点合同不要求修改现有图（图改造与执行溯源属 WP-4）。
- `loop/types` 的 `AgentMapEntry`（node→agent 静态绑定）**废弃**（Decision-020/023）：节点选择使用能力合同，选择执行者是 binding 层职责；该类型仅保留供 legacy 引擎兼容，不再作为 C01 节点绑定依据。

## 6. 与 WP-3（Agent Capability Binding）的关系

- WP-3 的 binding 只做一件事：**为节点合同选择已启用执行者**，并校验执行者输出是否符合节点输出合同。
- binding 不定义、不修改节点合同；替换 binding 不改变 Requirement ID、产物 schema、finding 语义、Re-Gate 路由、人工 Git 边界。

## 7. 边界（本 WP 不做）

- 不实现 binding 的启用/注册/替换（WP-3）；
- 不调用任何真实 Agent；
- 不改造现有图节点执行语义（WP-4）；
- 不产生任何 Git 发布动作。

## Revision Record

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 0.1.0 | 2026-08-19 | Accepted | WP-2 交付：7 个能力类型清单、节点合同模板与完整合同、AgentMapEntry 废弃决策、与执行面/binding 的关系。 |
