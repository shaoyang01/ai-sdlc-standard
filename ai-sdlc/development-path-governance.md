# Development Path Governance

> Canonical standard for Development Path Decision 与 Shared Documentation Governance Tail。
> 本文件是 Development Path 和 Shared Tail 的 canonical definition；其他标准文件只表达各自职责并引用本文件。
> Task 07-A 只建立标准层基线。Skill、Contract、Template、Validator、Scenario Fixture 与 Pipeline 接入属于后续有限任务；本文件不宣称这些接入已完成。

## Purpose and Scope

本标准统一规范以下流程：

```text
方案审核
  -> Development Path Decision
  -> DIRECT_IMPLEMENTATION 或 SPECKIT_PIPELINE_REQUIRED
  -> 实现
  -> Shared Documentation Governance Tail
  -> Tail Completion Gate
```

适用范围：

- 所有经过 `sdlc-solution-reviewer` 方案审核的需求，包括 `FULL_REQUIREMENT` 与 `DELTA_CHANGE`。
- Direct Implementation 与 Speckit SDD Core 两条可实现路径。
- 实现之后的文档治理尾段（Shared Documentation Governance Tail，以下简称 Shared Tail）。

不适用：

- 本标准不替代方案审核、复杂度分级或任何现有 Gate。
- 本标准不降低任何 PASS / FAIL / PASS_WITH_RISK、风险接受或 Reviewed Artifact Version 绑定要求。
- 本标准不授权任何执行、上线、灰度、投产、回滚或外部发布动作。

## 规范流程

```text
DIRECT_IMPLEMENTATION
  -> Implementation
  -> Shared Documentation Governance Tail
  -> Tail Completion Gate

SPECKIT_PIPELINE_REQUIRED
  -> Speckit SDD Core through Implement
  -> Shared Documentation Governance Tail
  -> Tail Completion Gate

BLOCKED_NEEDS_REVISION
  -> Earliest Affected Upstream Node
  -> Re-Gate
```

Direct Implementation 与 Speckit SDD Core 完成实现后，必须进入同一个 Shared Tail。Shared Tail 位于 `sdlc-speckit-pipeline` 运行边界之外，不属于 Speckit SDD Core，也不是新的需求分析、需求澄清或方案设计阶段。

`BLOCKED_NEEDS_REVISION` 不得进入实现或 Tail，必须返回最早受影响的上游节点重新 Gate。

## Development Path Decision

Development Path 只能输出以下三个值之一，不得 rename、创建别名或创建第四种路径：

- `DIRECT_IMPLEMENTATION`
- `SPECKIT_PIPELINE_REQUIRED`
- `BLOCKED_NEEDS_REVISION`

Complexity 只能输出以下四个值之一，不得创建第五种：

- `SIMPLE`
- `MEDIUM`
- `COMPLEX`
- `BLOCKED_UNKNOWN`

### Decision Scope

路径选择前必须确定 Decision Scope：

- `FULL_REQUIREMENT`
- `DELTA_CHANGE`

当 Decision Scope 为 `DELTA_CHANGE` 时：

- Development Path 必须基于 Current Change Scope 或 Delta Scope。
- Aggregate Requirement Scope 只能作为上下文。
- Aggregate Complexity 只能标记为 `reference only`。
- 原需求中的 DB、MQ、schedule、多模块、状态机或知识同步因素不得自动继承为 Delta Complexity Triggers，必须进入 Ignored Aggregate Triggers。
- 只有 Delta Scope 自身存在强复杂度因素时，才能默认进入 Speckit。
- Delta Scope 不清楚时，必须 `BLOCKED_NEEDS_REVISION`。

### 路径由当前实现范围复杂度决定

Development Path 由 Current Implementation Scope 或 Delta Scope 自身的复杂度决定。

需要评估或执行 business_domain_sync、需要记录稳定业务事实或需要评估知识同步，本身不自动触发 `SPECKIT_PIPELINE_REQUIRED`。只有当前实现范围自身涉及多模块、跨仓、状态机、DB schema、MQ、schedule、关键数据写入、复杂事务或其他完整 SDD 强触发因素时，才默认进入 Speckit。

### DIRECT_IMPLEMENTATION

适用条件：

- Specification Gate 为 `PASS`，或为具有完整风险接受的 `PASS_WITH_RISK`。
- 当前实现范围为 `SIMPLE` 或 `MEDIUM`。
- 范围、行为、异常、兼容、测试和副作用边界明确。
- 当前实现范围不需要完整 SDD。
- 不存在未接受的 Critical 或 High 风险。

Direct Implementation 不等于实现后流程结束。完成实际实现后，必须进入 Shared Tail。

### SPECKIT_PIPELINE_REQUIRED

适用条件：

- 当前实现范围自身为 `COMPLEX`。
- 用户在方案审核通过后明确要求 Full SDD（Full SDD Override = `user_requested`）。
- 后续 Gate 判断 Direct 风险过高，并形成当前有效的 `later_gate_required` 决策。

Speckit SDD Core 负责完整 SDD 和受控实现，但不拥有 Shared Tail 最终完成判定。

### BLOCKED_NEEDS_REVISION

以下情况必须阻塞：

- Specification Gate 为 `FAIL`。
- Complexity 为 `BLOCKED_UNKNOWN`。
- 当前实现范围无法确定。
- 实现必须猜测业务行为。
- 方案、风险接受、失败策略或测试策略缺失。
- 变更影响行为，但当前技术方案或方案审核未覆盖。
- required Re-Gate 缺失或 stale。

阻塞路径必须返回最早受影响的上游节点，不得进入实现或 Tail。

## Speckit SDD Core 边界

Canonical Speckit SDD Core 止于 Implement：它指 `sdlc-speckit-pipeline` 的完整 SDD 阶段链（Preflight、Domain Route、Specify、Clarify、Plan、Tasks、Analyze、Implement）到实现完成为止。Shared Tail 从实现完成后开始；business_domain_sync decision 和 conditional execution 属于 Shared Tail；Reconcile decision 和 conditional execution 属于 Shared Tail。

Shared Tail 位于该 canonical Core 边界之外：

- 不是 Speckit SDD Core 的组成部分。
- 不是新的需求理解阶段。
- 不是新的方案审核阶段。
- 不重新 Clarify 核心业务规则。
- 不允许用文档更新接受方案外代码行为。

Speckit SDD Core 的 Pipeline result、Stage Summary 或 workflow-status snapshot 均不能替代 Shared Tail 与 Tail Completion Gate。

### 当前 Pipeline 实现差异（current implementation gap）

必须诚实区分 canonical 目标与当前实现事实：

- Canonical 目标：Speckit SDD Core through Implement，随后进入 Shared Tail。
- 当前实现事实：当前 `sdlc-speckit-pipeline` 仍按现有实现串行调度 Implement 之后的 Sync 和 Reconcile。这是当前实现状态，不是 canonical Core 边界。
- 将当前 Pipeline 编排收敛到 canonical Shared Tail 边界属于后续 Task 07-E；本任务不修改 Pipeline Skill、Contract、references 或执行行为，也不声称 07-E 已实施。
- 当前 Pipeline 已产生且 current、non-stale、适用范围明确的 Sync 或 Reconcile 结果，可以作为 Shared Tail 候选证据；是否满足 Tail requirement，仍由 Manifest 当前状态和 Tail Completion Gate 判断，不得因此自动重复执行 Sync 或 Reconcile。
- 当前 Pipeline result 不能替代 Tail Completion Gate。

## Shared Documentation Governance Tail

### 位置

Shared Tail 位于实现之后、Tail Completion Gate 之前，对 Direct Implementation 与 Speckit SDD Core 两条路径完全统一。

### Tail 最小状态模型

canonical 逻辑字段及其语义如下。本任务不修改 Manifest Template，不创建第二份 Manifest schema，也不宣称模板已接入这些字段：

- `required`：本需求是否需要 Shared Tail。
- `scope`：Tail 覆盖的实现范围与证据边界。
- `status`：`planned` / `in_progress` / `blocked` / `completed` / `not_required` / `stale`。
- `required_artifacts`：必需证据清单。
- `completed_artifacts`：已完成且当前有效的证据清单。
- `skipped_items`：被判定为 not_required 或 not_applicable 的项及依据。
- `blocking_items`：阻塞 Tail completion 的事项。
- `business_domain_sync_decision`：知识同步判定。
- `reconcile_decision`：一致性审计判定。
- `entry_coverage_result`：适用的 entry coverage 结果。
- `regate_result`：必需的 Re-Gate 结果。
- `completion_evidence`：完成判定所依据的证据指针。
- `completion_decision_source`：完成判定来源，必须指向当前有效的 Tail Completion Gate。

### 对实际实现始终必需的证据

当需求产生实际代码、配置或行为实现时，下列证据始终必需：

- 当前有效的 `03-实现记录`。
- 当前有效的 `04-代码审核`。
- 当前有效的 `05-测试验收`。
- 当前有效的 business_domain_sync decision。
- 当前有效的 Reconcile decision。
- Manifest Tail 状态和证据指针。
- 当前有效的 Tail Completion Gate 结果。

`03-实现记录`、`04-代码审核`、`05-测试验收` 不得因为路径是 Direct、修改较小、未进入 Speckit、已有 Pipeline result 或已有交付总结而被静默省略。

不产生实际代码、配置或行为实现的纯文档或纯治理任务，可以将对应 Tail 项判定为 `not_required` 或 `not_applicable`，但必须记录：范围、原因、证据、decision source、decision owner、当前 artifact 和 version 依据，以及使该判断失效的条件。

### business_domain_sync

每个实现路径必须记录 business_domain_sync decision，允许使用现有 Sync Need Classification：

- `SYNC_REQUIRED`
- `NOT_REQUIRED`
- `PROPOSAL_REQUIRED`
- `BLOCKED`
- `DUPLICATE_SYNC_BLOCKED`

business_domain_sync execution 为 conditional：

- 只有稳定、可复用且已验证的事实才可以同步。
- 必须有明确目标。
- 实际写入必须有明确授权。
- `library_driven` 模式不要求 `specs/**`。
- 没有稳定可复用事实时允许 `NOT_REQUIRED`，但必须记录原因和证据。
- 缺少目标或授权时只能 proposal 或 blocked。
- 专业判断和执行继续由现有 `sdlc-speckit-sync` 负责，Skill ID 不变。

新写规范统一使用 `business_domain_sync`。旧标题或字段 `Speckit Sync` 只允许作为历史 Manifest 的兼容读取入口。不得将 Speckit Sync 作为新写规范，不得要求本任务迁移历史 Manifest，不得删除旧字段，不得创建第二套 Sync Skill，不得放宽 duplicate sync guard，不得放宽目标或写授权。

### Reconcile

每个实现路径必须形成 Reconcile decision：

- `required`
- `not_required`
- `blocked`

Decision 必须记录：是否需要实际执行、判断依据、当前代码、规格、DocFlow、知识材料和 Manifest 适用范围、not_required 的证据、decision owner、decision source、当前 artifact/version 依据，以及使 decision 变为 stale 的条件。

Reconcile execution 为 conditional：

- 存在代码/文档差异风险、Sync、Manifest drift、规格或实现不一致迹象时应执行。
- 当前改动明确、无文档或知识影响且证据充分时允许 `not_required`。
- 专业审计继续由现有 `sdlc-speckit-code-doc-reconcile` 执行，Skill ID 不变。
- Reconcile 默认只读。
- 发现 code drift 时，必须返回 Implementation 或最早受影响 Gate；不得修改文档来合法化未批准代码行为。

### Entry Coverage

Entry Coverage 为 conditional Tail 项。以下情况适用：

- business_domain_sync 实际写入。
- 准备确认写入。
- 当前业务知识目标要求 entry coverage。
- Sync 或 Reconcile 合同要求标准 entry coverage audit。

不适用时必须记录 `not_applicable` 或等价 decision 及原因。`PENDING`、`FAILED` 或 `BLOCKED` 的 entry coverage 不能支持 Tail completion。

## Tail Completion Gate

Tail completion owner 为 `sdlc-gate-runner`。

Gate Runner 只负责：

- 读取 Manifest。
- 读取当前有效证据。
- 检查 required Tail 项。
- 检查 skipped、not_required 或 not_applicable 是否有充分依据。
- 检查风险接受。
- 检查 stale。
- 检查 Re-Gate。
- 输出 `PASS`、`FAIL` 或有效 `PASS_WITH_RISK`。
- 决定 Tail 是否可标记为 `completed`。

Gate Runner 不得生成实现记录、执行代码审核、执行测试、执行 Sync、执行 Reconcile、修改生产代码、修改知识材料，或代替专业 Skill 作专业判断。

Tail 只有在以下条件全部满足时才能完成：

- Development Path Decision 当前有效。
- Tail scope 当前有效。
- 所有 always-required 证据存在、当前且未 stale。
- 所有 conditional 项均有明确 decision。
- 所有 required execution 已完成。
- 无未解决 blocking item。
- required Re-Gate 已通过。
- Manifest 已记录当前 Tail 状态和证据。
- `completion_decision_source` 指向当前 Tail Completion Gate。

以下内容均不能替代 Tail Completion Gate：Stage Summary、Delivery Summary、Pipeline result、workflow-status snapshot、聊天结论。

## 字段 Owner

- `sdlc-solution-reviewer`：负责 Development Path Decision，负责初始 Tail required 和 scope 建议，不负责最终 Tail completion。
- `sdlc-gate-runner`：负责路径准入检查，负责 Tail Completion Gate，不执行专业工作。
- `manifest.md`：是 Tail 当前状态和证据指针权威；Activity Log、Change History 和 Re-Gate Records 记录变化与过程；其他状态快照不得覆盖 Manifest。
- `sdlc-implementation-recorder`：负责 `03-实现记录`。
- Code Review owner：负责 `04-代码审核` 和 Code Review Gate 证据。
- Test 或 Test Feedback owner：负责 `05-测试验收`、验收结论和反馈分类。
- `sdlc-speckit-sync`：继续负责所有 source mode 下的专业 Sync decision 与执行，Skill ID 保持不变。
- `sdlc-speckit-code-doc-reconcile`：继续负责专业 Reconcile audit，Skill ID 保持不变，默认只读。

不新增 Sync Skill 或 Reconcile Skill。不修改任何现有 Skill ID。

## Manifest Status Authority

`manifest.md` 是 Tail 当前状态和证据指针的唯一权威。workflow-status snapshot、Pipeline report 或 Stage Summary 不得覆盖 Manifest。Manifest 应记录 Tail required、scope、status、evidence 和 decisions；历史变化写入 Activity Log 与 Change History。

## Stale 与 Re-Gate

当上游产物 Version 与 Gate 或 Tail 记录不一致时，对应 Gate 或 Tail 状态视为 stale，必须重新判断。发生变更时从最早受影响节点 Re-Gate，并写入 Manifest Re-Gate Records。新 Gate 通过前，不得继续使用 stale 结论。

Tail 不得通过修改文档或知识材料，把未批准的代码漂移合法化。

## 兼容性

- 三个 Development Path 值、四个 Complexity 值、`FULL_REQUIREMENT` / `DELTA_CHANGE`、`PASS` / `FAIL` / `PASS_WITH_RISK` 语义不变。
- Full SDD Override 值不变：`none` / `user_requested` / `later_gate_required`。
- 旧 Artifact Index、Activity Log、Change History 和 Re-Gate Records 继续有效。
- 旧 Manifest 中的 Speckit Sync 可被后续实现兼容读取；新规范只写 `business_domain_sync`。
- `library_driven` 不要求 `specs/**`；`specs/**` 和 `library/**` 不互相替代。
- Existing Skill IDs、paths、contracts 和 registry entries 不变。

## 当前集成状态边界

Task 07-A 只建立标准层基线。以下接入属于后续有限任务，本任务未实施、也不宣称已完成：

- Gate 和 Manifest Template convergence。
- Solution Reviewer output alignment。
- Gate Runner enforcement。
- Sync 和 Reconcile public-tail metadata alignment。
- Speckit Pipeline boundary alignment。
- Scenario validation。

在本文件中，normative standard 与 current enforcement integration 必须明确区分：上文全部流程语义为 normative standard；现有 Skill、Template、Validator 与 Pipeline 的当前行为以各自现有文件为准，直到后续接入任务完成。
