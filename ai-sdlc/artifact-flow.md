# Artifact Flow

> 状态：Draft（2026-08-22，C02-WP3.5 合同重基线，Decision-044/045；收口后升 Accepted）
> 关联：[Lifecycle](lifecycle.md) · [Artifact Storage](artifact-storage.md) · [Artifact Versioning](artifact-versioning.md) · [Phase Gates](phase-gates.md) · [Node Capability Contract](node-capability-contract.md)

## 核心观点

不同 Agent 之间只通过文档联系时，文档就是接口。

每个阶段的输出必须能被下一阶段直接消费，不能依赖口头记忆或隐含上下文。

## 标准产物流（v2 单轨七节点）

所有需求走同一条 canonical 链（Decision-044），不再存在 Development Path 分流（DIRECT_IMPLEMENTATION / SPECKIT_PIPELINE_REQUIRED）与独立 Speckit 产物轨道：

```text
requirement-intake（00-需求资料）
  -> solution-design（01-技术方案）
  -> solution-gate（02-方案审核）
       |-- adversarial_scan：对抗扫描，产出 Finding Ledger（不给正式 Gate）
       +-- formal_verdict：正式裁决，输出 Gate Result 与设计深度裁决
  -> task-planning（03-任务规划）
  -> implementation（04-实现记录）
  -> code-review（05-代码审核）
  -> knowledge-sync（06-知识同步）
  -> C03 Delivery Tail（07-交付总结 / Manual Git Handoff，不映射节点能力）
```

`solution-gate` 是一个节点、两个执行角色，两角色必须由不同 Agent binding 执行（Decision-044）；同一 Agent 执行两角色即 fail-closed。只有 `solution-gate` 的 `formal_verdict` 输出结论性 Gate（PASS / FAIL / PASS_WITH_RISK）与设计深度裁决（depth = LIGHT/STANDARD/DEEP；decision_status = DECIDED/BLOCKED_UNKNOWN）；`BLOCKED_UNKNOWN` 不进入实现。其他节点的确定性准入由 LOOP runtime 执行，不再依赖人工 Gate Skill（`sdlc-gate-runner` 已退役）。

测试与线上反馈是外部 change input：先经 `requirement-intake` 分类为 `changeKind=FEEDBACK_DRIVEN_CHANGE` 开启新 generation，不再存在 `05-测试验收` LOOP 节点（已退役）。可复现测试仍是 implementation、code-review 与 Delivery Tail 的证据。

### 产物路径速查

| Manifest 节点标签 | canonical 节点 | 稳定路径 | 主产物 kind |
| --- | --- | --- | --- |
| `00 需求资料` | `requirement-intake` | `library/{requirement_id}/00-需求资料/` | `requirement_summary`（保留） |
| `01 技术方案` | `solution-design` | `library/{requirement_id}/01-技术方案/` | `technical_design`（保留） |
| `02 方案审核` | `solution-gate` | `library/{requirement_id}/02-方案审核/` | `solution_review`（保留；含扫描 ledger 引用、正式 verdict 与深度裁决） |
| `03 任务规划` | `task-planning` | `library/{requirement_id}/03-任务规划/` | `task_plan`（新增） |
| `04 实现记录` | `implementation` | `library/{requirement_id}/04-实现记录/` | `implementation_record`（新增；代码 patch 仍用 `code_patch`） |
| `05 代码审核` | `code-review` | `library/{requirement_id}/05-代码审核/` | `review_summary`（保留） |
| `06 知识同步` | `knowledge-sync` | `library/{requirement_id}/06-知识同步/` | `knowledge_sync_result`（新增） |
| `07 交付总结` | C03 Delivery Tail（非节点） | `library/{requirement_id}/07-交付总结/` | `delivery_summary`（单独登记） |

### 历史产物的引用边界

- v1 的 `00/01/02` 产物语义与路径可直接作为历史输入引用，但只有 v2 capability execution 产生的 revision 才能成为 current。
- v1 的 `03-实现记录 / 04-代码审核 / 05-测试验收` 不自动重命名、不自动提升为 current；已有文件保持只读历史，若确需复用，必须在新 generation 中显式导入为 evidence 并重新生成 v2 revision。
- `specs/**` 不再承担机器事实源职责；`.specify/**` 是禁止写入边界。

## 产物要求

所有跨 Agent 人工交接产物落盘时必须遵循 `ai-sdlc/artifact-storage.md`。同一需求的人工产物放在 `library/{requirement_id}/` 下，不同节点放入不同子目录。

### Requirement Understanding（requirement-intake）

必须说明：
- 业务目标
- 用户意图
- 当前问题
- 初步范围
- 不确定点

### Requirement Boundary（requirement-intake）

必须说明：
- In Scope
- Out of Scope
- 本次明确不做的内容
- 成功标准
- 待确认事项

intake 同时承担反馈分类：新需求 / 补充 / 变更 / 返工 / 反馈驱动变更（`FEEDBACK_DRIVEN_CHANGE`）都必须先形成 change record 再进入本链。

### Technical Specification（solution-design）

必须遵循 `ess/specification-schema.md`，并按已裁决深度档位（LIGHT/STANDARD/DEEP）确定章节深度。

### Finding Ledger（solution-gate / adversarial_scan）

对抗扫描首轮建立不可变 Finding Ledger baseline，每项包含 finding ID、category（REQUIREMENT / SOLUTION / PLANNING / IMPLEMENTATION / REVIEW / KNOWLEDGE）、severity、evidence、source revision 与 earliest affected node；后续轮次为 closure review，只逐项验证 baseline finding 的修复证据，不给正式 Gate。

### Gate Result（solution-gate / formal_verdict）

必须遵循 `templates/gate-result-template.md`，包含 Gate Result（PASS / FAIL / PASS_WITH_RISK）、Reviewed Artifact / Reviewed Artifact Version、设计深度裁决（depth + decision_status）与 Finding Ledger 引用。`BLOCKED_UNKNOWN` 不进入实现。

### Task Plan（task-planning）

必须说明：
- 任务清单：唯一 ID、明确文件或模块范围、可执行、可验证
- 每个任务能追溯到技术方案或深度裁决
- 顺序与依赖、失败策略、回滚与测试任务覆盖
- 实现前一致性审计结论（覆盖规格、计划、测试、回滚和风险项）

### Implementation Record（implementation）

必须说明：
- 涉及模块
- 主链路
- 数据变更
- 状态流转
- 失败策略
- 回滚策略
- 测试策略与验证情况
- 未完成项和残余风险

每项声明必须引用 diff、测试输出或 journal 事件证据，禁止以自述代替证据。

### Code Review Report（code-review）

必须遵循 `ess/code-review-schema.md`，包含 Finding Ledger / closure review 结论。方案缺口按根因回流 `solution-design` / `task-planning`，不得只修代码；审查合同自身缺口才留在 `code-review`。

### Knowledge Sync Result（knowledge-sync）

必须记录：
- decision：NO_CHANGE / APPLY_LOCAL / PROPOSAL_ONLY / BLOCKED_CONFLICT
- 候选稳定事实 / source revision IDs / 目标路径 / diff 或 proposal
- reconcile result、未执行项、残余风险与 evidence digest

默认只读，明确写授权后才写入目标知识；只有已验证且可复用的规则 / checklist / schema 改进可沉淀。

### Test 与线上反馈（外部证据，非节点产物）

可复现测试输出、运行日志与外部系统回执写入 content-addressed evidence store，由相应节点 revision 或 Delivery Tail 引用。原始测试/线上反馈经 `requirement-intake` 以 `changeKind=FEEDBACK_DRIVEN_CHANGE` 重入，必要时渲染到 `00-需求资料/反馈/`。`05-测试验收` 已退役，不再作为 LOOP 节点产物。

## Revision Record

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 2.0.0 | 2026-08-22 | Draft | C02-WP3.5 重基线（Decision-044/045）：产物流切换为 v2 七节点单轨链（00-06 + C03 Delivery Tail 07）；solution-gate 双角色（adversarial_scan / formal_verdict）与设计深度裁决；删除 Development Path 分流、specs/**/pipeline/dual-rail 语义；测试反馈改为外部 change input 经 intake 重入（05-测试验收 退役）；明确 00/01/02 旧产物可作历史输入引用、旧 03/04/05 保持只读历史。 |
