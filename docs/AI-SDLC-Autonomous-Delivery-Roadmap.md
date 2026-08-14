# AI-SDLC Autonomous Delivery Roadmap

> LOOP Foundation, Delivery 01–10, and Advanced 11–14

## Purpose and Authority

本文件是 **Autonomous Delivery 能力阶段定义索引**，不是执行授权，也不是实时状态页。

文档角色：

- Autonomous Delivery 能力阶段定义索引；
- 定义阶段目标、边界、依赖、完成合同和 definition provenance；
- 作为 D01～D14 的长期规划入口；
- 与 Standard Package Roadmap（`ROADMAP.md`）和宏观 Implementation Roadmap（`docs/AI-SDLC-Implementation-Roadmap.md`）并列互补。

本文件的 planning semantics 遵循 Shared `PROJECT_CONTROL.md` §14 “Shared Roadmap Planning and Continuity”（authoritative source：`shaoyang01/ai-project-control-plane`）；详见下文 “Shared §14 Conformance Binding and Crosswalk”。

本文件**不得**声称自己是：

- 当前 Git 实现事实最高权威；
- 当前 PR/CI 状态页；
- authorization authority；
- merge authority；
- operator authority；
- publication authority；
- Handoff；
- Codex Prompt；
- Exchange artifact；
- Personal-KB publication。

### 事实优先级

本仓库的当前事实按以下优先级判断：

1. 当前 commit/tree/diff；
2. 当前 PR/CI/tests；
3. accepted decisions；
4. 当前状态快照（`docs/CURRENT_STATUS.md`）；
5. Roadmap 定义（本文件及既有路线文档）；
6. Handoff/历史材料。

本文件属于第 5 层。它不能覆盖当前 Source 实现事实；实现状态变化不要求每次修改本路线定义。当前实现状态请直接查看 Git、PR、CI 和 `docs/CURRENT_STATUS.md`；`docs/CURRENT_STATUS.md` 也不具有 planning 或 authorization authority。

## Relationship to Existing Roadmaps

| 文档 | 职责 | 边界 |
| --- | --- | --- |
| `ROADMAP.md` | Standard Package、Skill、DocFlow、Speckit 与落地路线 | 不承载 Foundation/D01～D14 的阶段定义 |
| `docs/AI-SDLC-Implementation-Roadmap.md` | Phase 1～4 宏观架构演进 | 不承载 D01～D14 的阶段定义 |
| `docs/AI-SDLC-Autonomous-Delivery-Roadmap.md`（本文件） | LOOP Foundation、D01～D10、Advanced 11～14 的阶段定义索引 | 不是当前状态页，不是授权来源 |
| `docs/CURRENT_STATUS.md` | 阶段边界状态快照 | 无 planning 或 authorization authority |

三份路线文档并列互补，彼此不替代。冲突时先按“事实优先级”明确文档职责，不静默覆盖。

## Definition and Status Vocabulary

### Shared definition readiness（canonical definition_status）

- 本文件的 `definition_status` 只表达 Shared §14.4 的执行规划就绪度，canonical 取值仅为 `DEFINED | PLANNING_REQUIRED`；
- `DEFINED`：该 planning unit 的 mandatory planning semantics 已被权威充分定义，可支撑执行规划；
- `PLANNING_REQUIRED`：该 planning unit / Definition Gap 已知为其 parent Requirement 完成所必需，但当前权威或证据不足以安全定义其完整 durable contract；未解决的 mandatory semantics 必须显式写作 `NOT_YET_AUTHORITATIVELY_DEFINED` 或等价值，不得猜测填充；
- `PLANNING_REQUIRED` 的 planning unit 不具备执行就绪度。

### Definition provenance vocabulary（项目本地 provenance）

以下词汇只描述定义来源/恢复历史，记录于各 planning unit 的 `definition_provenance`（或等价 provenance 文本），**不是** Shared readiness，任何本地标签都不自动蕴含 `DEFINED`：

- **source_verified**：名称和主要职责可由当前 Source 实现直接验证；
- **recovered**：由早期项目路线材料明确恢复，当前 Source 未必实现；
- **partially_recovered**：高层目标已恢复，精确合同仍待恢复；
- **proposed**：新候选方案，尚未成为 accepted 路线定义。
- **accepted_reconstruction**：历史 exact definition 无法唯一恢复后，基于 surviving authoritative constraints 形成、由当前用户显式接受并 materialize 的受控重建定义；它不声称恢复历史定义，也不因 semantic acceptance/materialization 自动成为 `source_verified`。

### Status vocabulary（状态词汇）

各状态维度相互独立，**明确禁止从一个状态自动推导另一个状态**：

- **definition readiness**：planning unit 的 Shared canonical readiness（`DEFINED | PLANNING_REQUIRED`）；
- **definition provenance**：定义来源/恢复历史（`source_verified`、`recovered`、`accepted_reconstruction` 等），独立于 readiness；
- **implementation status**：当前 Source 是否已实现该阶段能力；
- **review status**：路线定义或实现是否经过 review，`proposed` 不等于 PASS；
- **authorization status**：是否获得执行授权；
- **execution status**：授权后是否已执行；
- **merge status**：变更是否被授权并完成 merge；
- **publication status**：是否已完成 Exchange / Personal-KB 等外部发布。

例如：`source_verified` 不自动等于 review PASS；execution 完成不自动等于 merge 授权；CI success 不自动等于 merge authorization。

### Depends On（依赖语义）

**Depends On** 标识履行当前阶段完成合同所需的直接上游阶段或稳定合同（stable request/artifact/evidence contract）。

它不是：
- 原始 TypeScript import 列表；
- 全部传递依赖列表；
- 执行顺序授权；
- implementation-status 声明；
- 所有可能最终消费本阶段输出的能力列表。

语义边界：

- 阶段可以依赖另一阶段的稳定 request、artifact 或 evidence 合同，而不执行该阶段；
- 阶段消费另一阶段的必需输出时，即使不存在 production import，也必须将该上游阶段列入 Depends On；
- 纯下游实现能力不得作为 planning-only 阶段的依赖列出。

## Outcome Ladder

- **Foundation-00**：建立 LOOP Executor Kernel 基线；
- **D01～D04**：持久状态、受控进程、隔离 workspace、安全补丁应用；
- **D05～D07**：结构化 Executor 输入到真实 Draft PR；
- **D08～D09**：自然语言需求到带治理证据的 Draft PR；
- **D10**：真实单仓需求验收与硬化；
- **Advanced 11～14**：真实反馈、复杂需求、多仓和产品运营愿景。

## Stage Index

> “Current implementation orientation” 只是基于 Authorized Source HEAD 的创建时方向提示：非实时状态，不覆盖 Git/PR/CI，后续不要求每次 commit 更新。
> “Definition status” 列为 Shared §14 canonical readiness，括号内为 definition provenance；provenance 不构成 readiness。

| ID | Title | Definition Status | Primary Outcome | Depends On | Current implementation orientation |
| --- | --- | --- | --- | --- | --- |
| LOOP-FOUNDATION-00 | LOOP Executor Kernel Foundation | DEFINED（source_verified） | 独立、注入式、deterministic、bounded、fail-closed 的 LOOP kernel 基线 | — | `loop/` 包已实现 kernel 基线 |
| LOOP-DELIVERY-01 | Durable Run State and Artifact Foundation | DEFINED（source_verified） | 并发安全 run state 与 durable/content-addressed artifact | Foundation-00 | `core/loop-run-state.ts`、`core/loop-run-store.ts`、`core/loop-artifact-store.ts` |
| LOOP-DELIVERY-02 | Controlled POSIX Process Runner | DEFINED（source_verified） | 受控 POSIX 进程执行边界 | D01 | `core/loop-posix-process-runner.ts` |
| LOOP-DELIVERY-03 | Isolated Git Workspace | DEFINED（source_verified） | 隔离 workspace 与 Source WIP invariance | D02 | `core/loop-git-workspace.ts` |
| LOOP-DELIVERY-04 | Bounded Multi-File Patch Application | DEFINED（source_verified） | 安全受限的补丁应用与证据 | D02、D03 | `core/loop-patch-application.ts` |
| LOOP-DELIVERY-05 | Codex Multi-File Implementation Adapter | DEFINED（source_verified） | 结构化请求到 Codex 实现与 patch evidence | D01、D02、D03、D04 | `core/loop-codex-implementation-adapter.ts` |
| LOOP-DELIVERY-06 | Autonomous Test, Fix, and Review Loop | DEFINED（source_verified） | 有界测试/修复/审核循环结果与证据 | D01、D02、D03、D05 | `core/loop-autonomous-delivery-loop.ts` |
| LOOP-DELIVERY-07 | Recoverable Git Delivery Publisher | DEFINED（source_verified） | 一个 commit、一次 push、Draft PR 与恢复 | D01、D02、D03、D06 | `core/loop-delivery-publisher.ts` |
| LOOP-DELIVERY-08 | Requirement and Design Orchestration | DEFINED（source_verified） | 自然语言需求到 direct executor input | D01、D06 | `core/loop-requirement-design-orchestrator.ts` |
| LOOP-DELIVERY-09 | Review and Governance Tail | DEFINED（source_verified） | 自然语言需求到带治理证据 Draft PR 的治理闭环 | D08、D03、D06、D07、Topic 07 Shared Tail 稳定合同 | exact contract accepted；A1 governance-tail-result contract 已进入 Source；D07 governed mode 已进入 Source；D09-B production coordinator 已通过最终实施审查并随 PR #60 合并至事实分支（merge commit `845ff9ee`），post-merge fact-branch verification 已通过 |
| LOOP-DELIVERY-10 | Real Single-Repository Acceptance and Hardening | DEFINED（recovered） | 真实单仓 MVP 验收与硬化 | D01～D09 | D10-A durable checkpoint foundation 已进入 Source；candidate 55d1215c；merge commit 65bedd33；post-merge fact-branch verification PASS；D10-B～D10-F 尚未完成 |
| LOOP-ADVANCED-11 | Real Review, Feedback, and Re-Gate | PLANNING_REQUIRED（recovered） | 真实反馈回流与 Re-Gate | D09、D10 | 无 production module |
| LOOP-ADVANCED-12 | Complex Requirement and Speckit Delivery | PLANNING_REQUIRED（recovered） | 复杂需求与 Speckit 共同治理尾部 | D08、D09 | 无 production module |
| LOOP-ADVANCED-13 | Multi-Repository Autonomous Delivery | PLANNING_REQUIRED（recovered） | 跨仓自主交付协调 | D10 | 无 production module |
| LOOP-ADVANCED-14 | Product Operations and Model Portability | PLANNING_REQUIRED（recovered） | 队列、CLI/API、observability 与可移植性 | D10 | 无 production module |

每个 planning unit 使用 Shared §14.3 canonical 统一字段：`id`、`type`、`parent`、`title`、`definition_status`、`objective`、`rationale`、`inputs_or_prerequisites`、`expected_output`、`depends_on`、`scope`、`out_of_scope`、`completion_contract`、`continuity`；可选字段 `stable_constraints`、`expected_evidence`、`definition_provenance` 在有用时保留。各阶段不携带 live authorization 或 merge 状态字段。

## Shared §14 Conformance Binding and Crosswalk

本节是本 Roadmap 对 Shared `PROJECT_CONTROL.md` §14 “Shared Roadmap Planning and Continuity” 的 conformance binding 与 crosswalk；它不改变任何既有 Stage/Requirement ID、编号或实质定义，也不在 Shared §14 之外创建第二个治理权威。

### Canonical hierarchy crosswalk（层级映射）

- Canonical hierarchy 为 `Project -> optional Milestone -> Requirement -> optional Sub-requirement`（Shared §14.2）；本项目不使用 Milestone 层。
- 映射：`Project` = ai-sdlc Autonomous Delivery program（`ai-sdlc`）；既有 `Stage` = canonical `Requirement`；既有 material `Substage` = canonical `Sub-requirement`。
- 历史 ID（LOOP-FOUNDATION-00、LOOP-DELIVERY-01～10、LOOP-ADVANCED-11～14、D10-A～D10-F 等）全部保留，仅映射 canonical type；不因 canonical 术语而重命名。

### Project-local semantics retained（保留的项目本地语义）

本文件只保留以下项目特定语义：

- Stage Index 的 “Current implementation orientation” 创建时方向提示；
- Definition provenance vocabulary（`source_verified` / `recovered` / `partially_recovered` / `proposed` / `accepted_reconstruction`），独立于 Shared readiness；
- Depends On 依赖语义细则；
- D09 / D10 的历史 implementation / review / Source-closure narrative（非层级历史材料）；
- D10-C～D10-F 作为显式 `PLANNING_REQUIRED` Definition Gap 的当前项目事实。

### Governed by Shared §14（由 Shared §14 治理，不在本地复制）

以下规则由 Shared §14 统一治理，本文件不复制为竞争性本地治理条款：

- decomposition timing 与 coverage（§14.6）：Requirement 首次实质执行前进行 decomposition assessment；已知必需但无法安全定义的 child 以 `PLANNING_REQUIRED` fail-closed 记录；
- granularity（§14.7）：Sub-requirement 必须是可独立成败与验收的 material outcome；prompt、commit、PR、finding、review round、fix、rework、execution attempt、session 或单条 evidence 不构成 Sub-requirement；不创建递归 Sub-sub-requirement 层级；
- controlled replanning（§14.8）：实质 planning 语义变化须经授权 Roadmap replanning；实现方式、普通 bug fix、refactor、同合同修正不默认改变 Roadmap；
- Roadmap / STATE / execution authority separation（§14.9）：Roadmap 存放稳定 planning definitions、dependencies、Completion Contracts 与显式 Definition Gaps；动态 cursor、Gate、authorization、current work、live findings、临时顺序、PR / CI / HEAD 与执行状态属于 Roadmap 之外的既有权威；不在 STATE 中创建第二 planning authority，也不在 Roadmap 中创建动态 project-state 区；execution artifacts 记录尝试与证据，不进入层级；
- pointer 与 execution-readiness invariant（§14.10）：活跃执行单元必须唯一解析且为 `DEFINED`；
- Fresh-session recovery acceptance（§14.11）：Fresh Controller/Specialist 仅凭权威 Roadmap/Governance/STATE 与仓库事实即可恢复当前 planning contract 与剩余 Definition Gaps；
- anti-platformization（§14.13）：本文件只是文档化 planning surface，不创建 Roadmap 数据库、registry、dashboard/UI、workflow engine、scheduler/daemon、自动 session 创建器、compiler/validator 服务、digest/hash 体系或同步层。

### Parent-Goal Anchoring（父目标锚定，项目既有约束与 Shared §14 一致）

- child 不得扩大或重解释 parent Requirement 的 objective、scope、depends_on 或 completion_contract；
- 当 required material child outcome 或未解决的 material continuity gap 仍然 open 时，不得声称 parent completion；该 gap 尚未被权威定义时保留为显式 `PLANNING_REQUIRED` Definition Gap，而不是静默关闭 parent 或制造 child 定义。

## LOOP-FOUNDATION-00

- **id**：LOOP-FOUNDATION-00
- **type**：Requirement
- **parent**：ai-sdlc
- **title**：LOOP Executor Kernel Foundation
- **definition_status**：DEFINED
- **objective**：建立独立、注入式、deterministic、bounded、fail-closed 的 LOOP Executor Kernel 基线，并输出公共 identity、state、artifact、dependency boundary 的基础约束。
- **rationale**：此前 LOOP 能力散落在 Runtime 边界内，无法在不侵入 Source workspace 的前提下独立构建后续执行阶段。
- **inputs_or_prerequisites**：无上游阶段；输入为 kernel 契约与现有 Source 边界约束。
- **expected_output**：kernel 基线、公共 identity/state/artifact/dependency boundary 基础约束。
- **depends_on**：无。
- **scope**：纯 kernel 状态机、类型与依赖边界；注入式依赖约定；确定性执行与 fail-closed 语义。
- **out_of_scope**：不把 Runtime/Gateway/Graph ownership 移交给 LOOP。
- **completion_contract**：后续 D01～D10 可在不直接侵入 Source workspace 的条件下构建。
- **continuity**：none。
- **expected_evidence**：`loop/` 包存在且职责注释与基线一致。
- **definition_provenance**：source_verified——Authorized Source tree 可直接验证（`loop/types`、`loop/core/loop_engine.ts`、`loop/executor`、`loop/router`、`loop/registry`）。

## LOOP-DELIVERY-01

- **id**：LOOP-DELIVERY-01
- **type**：Requirement
- **parent**：ai-sdlc
- **title**：Durable Run State and Artifact Foundation
- **definition_status**：DEFINED
- **objective**：建立并发安全 run state、durable/content-addressed artifact 与 identity binding。
- **rationale**：run 状态与产物无法可靠持久化、无法跨连接并发安全读写、无法绑定 identity。
- **inputs_or_prerequisites**：Foundation-00 kernel 基线。
- **expected_output**：供后续阶段复用的 durable run/artifact facts。
- **depends_on**：Foundation-00。
- **scope**：并发安全 run state、durable/content-addressed artifact、identity binding。
- **out_of_scope**：进程执行、Git workspace、发布。
- **completion_contract**：后续执行阶段可通过注入的 store 读取/写入 run 与 artifact facts。
- **continuity**：none。
- **expected_evidence**：`core/loop-run-state.ts`、`core/loop-run-store.ts`、`core/loop-artifact-store.ts` 存在且职责注释与合同一致。
- **definition_provenance**：source_verified——Authorized Source tree 可直接验证。

## LOOP-DELIVERY-02

- **id**：LOOP-DELIVERY-02
- **type**：Requirement
- **parent**：ai-sdlc
- **title**：Controlled POSIX Process Runner
- **definition_status**：DEFINED
- **objective**：提供受控 POSIX 进程执行：executable allowlist、cwd/env boundary、timeout、output bounds、cleanup。
- **rationale**：进程执行无边界，存在越权、失控、泄漏风险。
- **inputs_or_prerequisites**：D01 identity 与依赖注入约定。
- **expected_output**：可被后续执行阶段注入的受控 runner。
- **depends_on**：D01。
- **scope**：allowlist、cwd/env 边界、timeout、output bounds、cleanup。
- **out_of_scope**：业务流程判断、Git ownership、Agent policy。
- **completion_contract**：后续阶段通过注入 runner 执行命令且不直接触碰 child_process。
- **continuity**：none。
- **expected_evidence**：`core/loop-posix-process-runner.ts` 存在且平台限制声明完整。
- **definition_provenance**：source_verified——Authorized Source tree 可直接验证。

## LOOP-DELIVERY-03

- **id**：LOOP-DELIVERY-03
- **type**：Requirement
- **parent**：ai-sdlc
- **title**：Isolated Git Workspace
- **definition_status**：DEFINED
- **objective**：提供隔离 Git workspace：isolated task branch/worktree、Source WIP invariance、recovery、cleanup。
- **rationale**：并发 run 共享 workspace 会污染 Source WIP 且无法恢复。
- **inputs_or_prerequisites**：D02 受控 runner。
- **expected_output**：可信 workspace snapshot。
- **depends_on**：D02。
- **scope**：隔离 worktree/branch、WIP invariance、recovery、cleanup。
- **out_of_scope**：patch semantics、implementation、publish。
- **completion_contract**：workspace 生命周期完整且 Source 工作树不变。
- **continuity**：none。
- **expected_evidence**：`core/loop-git-workspace.ts` 存在且仅通过注入 runner 执行 Git。
- **definition_provenance**：source_verified——Authorized Source tree 可直接验证。

## LOOP-DELIVERY-04

- **id**：LOOP-DELIVERY-04
- **type**：Requirement
- **parent**：ai-sdlc
- **title**：Bounded Multi-File Patch Application
- **definition_status**：DEFINED
- **objective**：提供有界多文件补丁应用：受限 unified diff、多文件 whitelist、文本创建/修改、index 保护、reconciliation。
- **rationale**：补丁应用越界（binary/rename/copy/delete/mode/symlink/gitlink）会造成不可审计的 workspace 变化。
- **inputs_or_prerequisites**：D02 runner、D03 workspace。
- **expected_output**：安全应用后的 workspace changes 和 evidence。
- **depends_on**：D02、D03。
- **scope**：受限 unified diff、多文件 whitelist、文本创建/修改、index 保护、reconciliation。
- **out_of_scope**：Agent prompt、测试循环、commit/push/PR。
- **completion_contract**：拒绝 binary、rename、copy、delete、mode、symlink、gitlink 等越界操作，fail-closed；index 与 task HEAD 不被修改。
- **continuity**：none。
- **expected_evidence**：`core/loop-patch-application.ts` 存在且 fail-closed 语义与文档一致。
- **definition_provenance**：source_verified——Authorized Source tree 可直接验证。历史 performance correction `D04-MUTATION-PERFORMANCE` 见 “Roadmap Amendments and Inserted Work”（非层级修正材料，不改变本 Requirement 定义）。

## LOOP-DELIVERY-05

- **id**：LOOP-DELIVERY-05
- **type**：Requirement
- **parent**：ai-sdlc
- **title**：Codex Multi-File Implementation Adapter
- **definition_status**：DEFINED
- **objective**：将结构化 implementation/test-repair/review-repair 请求映射到 Codex，并复用 D04 patch application。
- **rationale**：结构化 Executor 输入与 Codex 真实执行之间缺少受控适配层。
- **inputs_or_prerequisites**：D01/D02/D03/D04 能力。
- **expected_output**：canonical implementation result 与 patch evidence。
- **depends_on**：D01、D02、D03、D04。
- **scope**：请求校验、workspace drift 检查、bounded prompt、Codex 调用、单一 unified diff 解析、patch bytes 持久化与应用。
- **out_of_scope**：直接拥有测试、review loop、Git publish。
- **completion_contract**：返回显式 succeeded/failed，patch 字节与持久化字节一致。
- **continuity**：none。
- **expected_evidence**：`core/loop-codex-implementation-adapter.ts` 存在且职责注释与合同一致。
- **definition_provenance**：source_verified——Authorized Source tree 可直接验证。

## LOOP-DELIVERY-06

- **id**：LOOP-DELIVERY-06
- **type**：Requirement
- **parent**：ai-sdlc
- **title**：Autonomous Test, Fix, and Review Loop
- **definition_status**：DEFINED
- **objective**：提供自主测试、修复、审核循环：initial implementation、真实 test plan、review plan、bounded repair、no-progress、deadline。
- **rationale**：测试/修复/审核循环无界，存在死循环与证据丢失。
- **inputs_or_prerequisites**：D01 artifact store、D02 runner、D03 workspace、D05 adapter。
- **expected_output**：delivery result 与 implementation/test/review evidence。
- **depends_on**：D01、D02、D03、D05。
- **scope**：initial implementation、真实 test plan、review plan、bounded repair、no-progress、deadline。
- **out_of_scope**：commit、push、创建 PR、merge。
- **completion_contract**：返回不可变、确定性、有界的 round trace，终态为 succeeded/failed/blocked。
- **continuity**：none。
- **expected_evidence**：`core/loop-autonomous-delivery-loop.ts`、`core/loop-delivery-evidence.ts` 存在且边界声明一致。
- **definition_provenance**：source_verified——Authorized Source tree 可直接验证。

## LOOP-DELIVERY-07

- **id**：LOOP-DELIVERY-07
- **type**：Requirement
- **parent**：ai-sdlc
- **title**：Recoverable Git Delivery Publisher
- **definition_status**：DEFINED
- **objective**：提供可恢复的 Git 交付发布：delivery artifact gate、exact staging、publish intent、一个 commit、普通 push、Draft PR、恢复。
- **rationale**：发布流程缺少可恢复、可重入且可核验的阶段事实，部分成功后无法安全续跑。
- **inputs_or_prerequisites**：D06 succeeded delivery result artifact；D01 artifact store、D02 runner、D03 workspace。
- **expected_output**：publish intent/result、commit、remote branch 和 Draft PR facts。
- **depends_on**：D01、D02、D03、D06。
- **scope**：delivery artifact gate、exact staging、publish intent、一个 commit、普通 push、Draft PR、失败恢复。
- **out_of_scope**：mark Ready、merge、执行业务实现。D07 不提供对 commit、remote branch 或 pull request 的破坏性回滚：它只记录并恢复部分发布进度，不擦除或逆转已创建的远程事实。
- **completion_contract**：至多产生一个 commit、一次普通 push、一个 Draft PR；fail-closed 且不 force/amend/merge。
- **continuity**：D07 消费 D06 delivery-result contract 与 evidence，但不执行 D06；D08 编排的自然语言需求路径最终落到 D05～D07。
- **expected_evidence**：`core/loop-delivery-publisher.ts` 存在且 fail-closed 语义一致。
- **definition_provenance**：source_verified——Authorized Source tree 可直接验证。

## LOOP-DELIVERY-08

- **id**：LOOP-DELIVERY-08
- **type**：Requirement
- **parent**：ai-sdlc
- **title**：Requirement and Design Orchestration
- **definition_status**：DEFINED
- **objective**：提供需求与设计编排：自然语言需求归一化、technical design、solution review、路径选择、direct executor input。
- **rationale**：自然语言需求无法确定性路由到 direct 路径，且缺少编排产物。
- **inputs_or_prerequisites**：D01 artifact store、注入的 agent、注入的 solution reviewer；当前 D06 request/command-step contract 作为 design-time 稳定合同，而非被调用的运行时依赖。
- **expected_output**：requirement/design/review/executor-input/orchestration artifacts。
- **depends_on**：D01、D06。
- **scope**：需求归一化、有界 technical design 轮次、solution review（PASS/NEEDS_REVISION/BLOCKED）、路径选择、direct executor input。
- **out_of_scope**：调用 D03/D05/D06/D07；产生 Git/PR 副作用。
- **completion_contract**：路由至少区分 direct、Speckit pending、multi-repo pending、paused、blocked、failed；不产生 Git/PR 副作用。
- **continuity**：D08 产出 Direct Executor Input，其可无损映射到当前 D06 `LoopAutonomousDeliveryRequest` contract，并复用 D06 request/command-step contract 作为稳定下游接口；D08 不执行 D06，仅计划与路由。
- **expected_evidence**：`core/loop-requirement-design-orchestrator.ts` 存在且路由语义一致。
- **definition_provenance**：source_verified——Authorized Source tree 可直接验证。

## LOOP-DELIVERY-09

- **id**：LOOP-DELIVERY-09
- **type**：Requirement
- **parent**：ai-sdlc
- **title**：Review and Governance Tail
- **definition_status**：DEFINED
- **objective**：Review and Governance Tail——承接 D08 自然语言需求路径（`direct / DIRECT_READY`），与 D06 的实现、测试、审核与 D07 governed publish 形成治理闭环，支持“自然语言需求到带治理证据 Draft PR”的阶段成果。
- **rationale**：自然语言需求路径缺治理收口，导致 Draft PR 缺乏可核验的治理证据闭环；已接受的 D09 exact contract 定义了 direct-only 消费、D03 workspace 准备、D06 执行、Tail Completion Gate 先于 D07 publish、D07 governed mode 发布最终治理文件集合等边界。
- **inputs_or_prerequisites**：D08 `direct / DIRECT_READY` artifacts；D06 delivery result 与 evidence；D07 governed publish 前的治理证据。
- **expected_output**：带治理证据的 Draft PR 事实集；A1 阶段建立 `governance_tail_result` 完成结果合同与对应 artifact kind。
- **depends_on**：D08、D03、D06、D07 与 Topic 07 Shared Documentation Governance Tail 稳定合同。
- **scope**（已接受 exact contract）：D09 只消费 D08 `direct / DIRECT_READY` artifacts；D09 调用 D03 准备 workspace；D09 调用 D06 执行实现、测试和内部 review；D05 只能由 D06 内部调用；D09 编排 Topic 07 Shared Documentation Governance Tail；Tail Completion Gate 必须在 D07 publish 之前完成；D07 governed mode 必须发布最终治理文件集合。
- **out_of_scope**：Tail `pending` 或 `in_progress` 不能构成 D09 success；D09 success 不等于 requirement completion、merge authorization 或 publication；A1 只建立完成结果合同与 artifact kind，不实现 production coordinator，不修改 D07 publisher。
- **completion_contract**：已接受 exact contract 摘要见上；A1 只建立合同，不完成 D09；`governance_tail_result` 只表达 Shared Tail 已正式完成并具备 governed publish 资格，不表达 pending/blocked/failed/部分完成。
- **continuity**：none。
- **expected_evidence**：D09-B production coordinator（`core/loop-production-coordinator.ts`）实现 D09 执行链（固定 orchestration artifact → producer-owned D08 parsers → D03 prepare → pristine workspace gate → D06 execute + read-back → 注入式 Shared Tail → Tail immutable snapshot + completed reason gate → pre-A1 cross-binding → A1 build/store/read-back/parse + post-A1 defense → D03 post-Tail inspect → publisher factory create(remaining budget) → D07 governed publish + read-back → persisted publish full-chain binding）；production implementation 本身不是 implementation review PASS。
- **definition_provenance**：source_verified——D09 exact contract 已由项目总控接受，记录于本路线；D09-A1 governance-tail-result contract 已进入 Source（implementation review 与 post-merge closure 已完成）；D09-A2 governed publisher 已进入 Source（governed mode 消费 A1 并以 A1 final governed files 作为发布依据）；D09-B production coordinator 已通过最终实施审查（历史审查过程：项目总控 Review 4850508514 判定 REWORK 后完成 D09-B-R1 集中修复并重新提交，随后完成 D09-B-R2 窄范围修复 F-008：typed records 顺序无关 exact-key snapshot 并重新提交），PR #60 已合并至事实分支，candidate head `6ac187ac`，merge commit `845ff9ee`，post-merge fact-branch verification 已通过；D09 Source closure 完成（D09 Source closure 不等于真实单仓 acceptance，D10 仍未授权）；accepted exact contract 是 planning 事实，implementation review 结果决定 D09 是否通过。

### D09 historical implementation and Source-closure narrative（非层级历史记录）

以下为本树能力记录（D09-A2 governed publisher 与 D09-B production coordinator 对应树），属于历史 implementation/Source-closure narrative，不构成 Roadmap 层级单元：

- D07 保留 standalone mode（字节级兼容）；
- D07 存在可选 governed mode；
- governed mode 消费 A1（`loop-governance-tail-result-v1`）；
- governed mode 以 A1 final governed files 发布；
- D07 不执行 Shared Tail；
- D07 不 mark Ready；
- D07 不 merge；
- D09-B production coordinator 存在：固定 orchestration artifact ref 为唯一根输入；四个 canonical parsers 为 producer-owned additive contracts（`parseLoopOrchestrationResultBytes`/`parseLoopDirectExecutorInputBytes` 归 D08、`parseLoopDeliveryResultBytes` 归 D06、`parseLoopDeliveryPublishResultBytes` 归 D07，coordinator 只 import/consume，不再镜像 producer schema）；request/identity 单次 descriptor snapshot；pristine workspace gate（recovered/dirty workspace 禁止重放 D06）；注入式 Shared Tail 依赖 + Tail 不可变 snapshot 与 completed reason 精确绑定；A1 put 前 coordinator-owned pre-A1 cross-binding；D07 经 `publisherFactory.create(remaining budget)` 注入并以当前剩余预算执行 governed publish（请求始终携带 `governanceTailResultArtifactRef`，无 standalone fallback）；persisted publish result 全链绑定（orchestration/executor/delivery/governance refs、implementation files、final files、commit/push/PR facts）；共享 deadline；D06/D07 歧义窗口 blocked 不重放；D09-B request 不接受 `recoveryPublishIntentArtifactRef`（跨进程 publish-intent 恢复不承载，完整崩溃恢复留给 D10）；R2/F-008：coordinator 自有 typed records（request、identity、Tail 顶层结果、completion package 根对象）顺序无关 exact-key descriptor snapshot（一次捕获、内部 fixed-order rebuild、frozen、零引用共享），D08/D06/D07/A1 canonical artifact parser 保持 order-sensitive；
- D09-B production coordinator 已通过最终实施审查（历史审查过程：D09-B-R1 集中修复、D09-B-R2 窄范围修复 F-008 order-independent typed record snapshot），PR #60 已合并至事实分支（candidate head `6ac187ac`，merge commit `845ff9ee`），post-merge fact-branch verification 已通过；D09 Source closure 完成；D10 仍未授权——CI success 不等于 implementation review PASS，D09 Source closure 不等于真实单仓 acceptance。

## LOOP-DELIVERY-10

- **id**：LOOP-DELIVERY-10
- **type**：Requirement
- **parent**：ai-sdlc
- **title**：Real Single-Repository Acceptance and Hardening
- **definition_status**：DEFINED
- **objective**：Real Single-Repository Acceptance and Hardening——用真实单仓需求验证 D01～D09 端到端闭环并硬化。
- **rationale**：能力在合成环境下已验证，缺少真实仓库端到端验收。
- **inputs_or_prerequisites**：D01～D09 能力与真实单仓需求。
- **expected_output**：单仓 MVP acceptance/hardening evidence。
- **depends_on**：D01～D09。
- **scope**：真实 repository、真实 Draft PR、失败恢复、可信 evidence、运行边界。
- **out_of_scope**：自动扩展到多仓、企业平台或无人监督高风险操作。
- **completion_contract**：真实单仓需求跑通 D01～D09 闭环并产出硬化证据。
- **continuity**：D10 parent completion 被以下未解决的 required child outcome / Definition Gap 显式阻塞：D10-B（Sub-requirement，`PLANNING_REQUIRED`，其 accepted reconstruction 的 dependency-readiness gap `B01_DEPENDENCY_CONTRACT_INCONSISTENCY` 未解决）与 D10-C～D10-F（Sub-requirement Definition Gaps，`PLANNING_REQUIRED`，实质语义与顺序尚未被权威定义）。在这些 child gap 解决之前不得声称 D10 completion；不得从编号、历史对话、Handoff、实现代码或表面顺序发明其定义、顺序或依赖。
- **expected_evidence**：D10-A foundation evidence 已存在；真实单仓 acceptance/hardening evidence 仍待 D10-B～D10-F。
- **definition_provenance**：recovered——早期项目路线材料恢复出高层名称“Real Acceptance and Hardening”。

### D10-A

- **id**：D10-A
- **type**：Sub-requirement
- **parent**：LOOP-DELIVERY-10
- **title**：NOT_YET_AUTHORITATIVELY_DEFINED（历史 durable-checkpoint capability 标签见 definition_provenance，不构成已恢复的原始 title）
- **definition_status**：PLANNING_REQUIRED
- **objective**：NOT_YET_AUTHORITATIVELY_DEFINED
- **rationale**：NOT_YET_AUTHORITATIVELY_DEFINED
- **inputs_or_prerequisites**：NOT_YET_AUTHORITATIVELY_DEFINED
- **expected_output**：NOT_YET_AUTHORITATIVELY_DEFINED
- **depends_on**：NOT_YET_AUTHORITATIVELY_DEFINED
- **scope**：NOT_YET_AUTHORITATIVELY_DEFINED
- **out_of_scope**：NOT_YET_AUTHORITATIVELY_DEFINED
- **completion_contract**：NOT_YET_AUTHORITATIVELY_DEFINED
- **continuity**：已知 D10-A↔D10-B 边界（来自 D10-B accepted reconstruction）：D10-A 独占 durable checkpoint persistence、current-head selection、CAS/integrity 与 restart durability；D10-B 消费这些事实但不重开、重命名或重接受 D10-A，且 D10-B 不因 checkpoint restart survival 而满足。D10-A 的 Source-closure 事实不构成 D10 completion。
- **definition_provenance**：以下为 D10-A Source-closure 历史记录，是已完成的历史证据/provenance，不声称原始 planning contract 已被恢复：
  - capability：immutable delivery_checkpoint artifact；generation-linear SQLite current-head locator；full generation/ref/digest CAS；restart、corruption 与 fail-closed evidence；
  - candidate_HEAD：55d1215c9c205f6b475a9e502b040e4e7336a192；
  - merge_commit：65bedd33b1c205e404eb51e8fae7dcabcfecf7e7；
  - post_merge_verification：PASS；
  - D10_overall_definition_status（历史记录值）：recovered；
  - D10_overall_completed：false；
  - real_single_repository_acceptance_completed：false；
  - D10_B_to_D10_F_completed：false。

### D10-B — Governed Cross-Process Publish Recovery Hardening

- **id**：D10-B
- **type**：Sub-requirement
- **parent**：LOOP-DELIVERY-10
- **title**：Governed Cross-Process Publish Recovery Hardening
- **definition_status**：PLANNING_REQUIRED
- **objective**：在一个真实单仓 governed delivery 中，把 D09 已明确留下的跨进程 publish-intent recovery 缺口与 D10-A durable checkpoint foundation 接通；process loss 后，由 fresh process 仅依赖持久化 canonical references / checkpoint facts 恢复并核对既有 governed publish 状态，在不重放已完成 D06、不重复 commit / push / Draft PR side effects、且不绕过 governance evidence binding 的前提下安全续跑或 fail closed。
- **rationale**：D09-B 已能完成 governed delivery，但 request 明确不接受 `recoveryPublishIntentArtifactRef`，因此跨进程 coordinator recovery 没有 accepted contract；D10-A 只建立 durable checkpoint / locator / integrity foundation，并未定义如何从该 foundation 恢复 D09→D07 publish continuity。D10-B 关闭这一 coordinator-level recovery gap。
- **inputs_or_prerequisites**：
  - existing D09 governed production coordinator and canonical root/evidence bindings；
  - existing D07 publish-intent / publish-result recovery contracts；
  - D10-A immutable checkpoint, current-head locator, CAS and integrity semantics；
  - a real single-repository governed delivery path whose eventual publish effect is Draft PR only；
  - an additive recovery-mode reference to persisted D07 publish intent represented as `recoveryPublishIntentArtifactRef`。
- **expected_output**：
  - additive coordinator recovery contract accepting `recoveryPublishIntentArtifactRef` only for explicit recovery mode while preserving the existing normal D09 path；
  - deterministic recovery decisions limited to resume/reconcile, recognizing already-completed effects, or fail-closed blocking；
  - real-single-repository evidence proving no D06 replay and no duplicate commit / push / Draft PR effect；
  - negative integrity evidence for stale, mismatched, corrupted or otherwise non-authoritative recovery references；
  - no new persistent artifact type is required by this definition。
- **depends_on**：`D10-A`、`D09`；D07 recovery capability is consumed through the D09 governed publish boundary and this does not create a new Roadmap stage/dependency chain。（当前权威依赖语义按此保留；PR #75 的 D07 dependency correction 候选未并入本文件，`B01_DEPENDENCY_CONTRACT_INCONSISTENCY` 未解决，详见 definition_provenance。）
- **scope**：
  - recovery after a D07 publish intent has become durable；
  - fresh-process canonical parsing and identity/cross-binding validation；
  - reconciliation against existing publish result / repository facts / D10-A checkpoint facts；
  - safe resume or fail-closed handling across publish ambiguity windows；
  - preservation of the D09 rule that completed D06 work is not replayed；
  - real-single-repository failure-injection acceptance。
- **out_of_scope**：
  - arbitrary recovery of pre-publish D05/D06 in-flight execution；
  - redesign of D10-A checkpoint storage, locator, CAS or corruption semantics；
  - new loop type or mandatory new evidence type；
  - timeout auto-cancellation / abort policy outside this minimum D10-B slice；
  - multi-repository delivery or enterprise scheduler/platform semantics；
  - Ready, merge, publication or unattended high-risk authority；
  - any substantive definition or allocation of D10-C through D10-F。
- **completion_contract**：under separately authorized real-single-repository execution, a governed delivery reaches durable publish intent, the original process is terminated, and a fresh process resumes from durable canonical references. Acceptance requires deterministic behavior for at least: interruption after intent persistence but before first remote publish effect; interruption after a publish side effect but before durable publish-result completion; and stale/tampered/mismatched recovery input. Valid cases converge to one governed Draft PR outcome without replaying D06 or duplicating commit/push/PR effects; invalid or ambiguous cases fail closed with decision-relevant evidence。
- **continuity**：Boundary with D10-A：D10-A exclusively owns durable checkpoint persistence, current-head selection, CAS/integrity and restart durability. D10-B consumes those facts but does not reopen, rename or re-accept D10-A and is not satisfied merely by checkpoint restart survival。Boundary with remaining D10：D10-B consumes only the explicitly deferred cross-process publish recovery slice; D10-C through D10-F remain explicit `PLANNING_REQUIRED` Definition Gaps, no new Roadmap stage is created, and LOOP-DELIVERY-10 is not reordered。
- **expected_evidence**：
  - deterministic unit/contract evidence for recovery-reference parsing and cross-binding；
  - fresh-process integration evidence rather than same-process object reuse；
  - failure-injection evidence for the defined recovery windows；
  - proof completed D06 execution was not replayed；
  - proof commit / push / Draft PR effects were not duplicated；
  - negative fail-closed evidence for corrupted/stale/mismatched recovery state；
  - real-repository commit/push/Draft-PR facts only when separately execution-authorized；
  - applicable repository build/test/security checks at the future implementation anchor。
- **definition_provenance**：accepted_reconstruction——historical exact D10-B definition was not uniquely recoverable. This definition is a controlled reconstruction from surviving authoritative D10 scope, the explicit D09 cross-process recovery deferral and the source-closed D10-A foundation, explicitly accepted by the current user. It is not historical `recovered` fact and does not become `source_verified` merely through acceptance/materialization。Shared readiness 为 `PLANNING_REQUIRED`：dependency-contract inconsistency `B01_DEPENDENCY_CONTRACT_INCONSISTENCY` 尚未解决；PR #75 携带的 D07 dependency correction 是独立修正路线，未并入本文件，本文件保留当前权威依赖事实并显式标记该未解决的 dependency-readiness gap。

### D10-C

- **id**：D10-C
- **type**：Sub-requirement
- **parent**：LOOP-DELIVERY-10
- **title**：NOT_YET_AUTHORITATIVELY_DEFINED
- **definition_status**：PLANNING_REQUIRED
- **objective**：NOT_YET_AUTHORITATIVELY_DEFINED
- **rationale**：NOT_YET_AUTHORITATIVELY_DEFINED
- **inputs_or_prerequisites**：NOT_YET_AUTHORITATIVELY_DEFINED
- **expected_output**：NOT_YET_AUTHORITATIVELY_DEFINED
- **depends_on**：NOT_YET_AUTHORITATIVELY_DEFINED
- **scope**：NOT_YET_AUTHORITATIVELY_DEFINED
- **out_of_scope**：NOT_YET_AUTHORITATIVELY_DEFINED
- **completion_contract**：NOT_YET_AUTHORITATIVELY_DEFINED
- **continuity**：已知未解决的 D10 child Definition Gap；其存在阻止 D10 被静默视为完成；实质语义与顺序必须在执行前完成规划。
- **definition_provenance**：仅 ID 与“D10 剩余 child Definition Gap”角色来自权威 Roadmap 历史；未从字母序、对话/Handoff、PR、实现代码或表面顺序推断任何实质语义。

### D10-D

- **id**：D10-D
- **type**：Sub-requirement
- **parent**：LOOP-DELIVERY-10
- **title**：NOT_YET_AUTHORITATIVELY_DEFINED
- **definition_status**：PLANNING_REQUIRED
- **objective**：NOT_YET_AUTHORITATIVELY_DEFINED
- **rationale**：NOT_YET_AUTHORITATIVELY_DEFINED
- **inputs_or_prerequisites**：NOT_YET_AUTHORITATIVELY_DEFINED
- **expected_output**：NOT_YET_AUTHORITATIVELY_DEFINED
- **depends_on**：NOT_YET_AUTHORITATIVELY_DEFINED
- **scope**：NOT_YET_AUTHORITATIVELY_DEFINED
- **out_of_scope**：NOT_YET_AUTHORITATIVELY_DEFINED
- **completion_contract**：NOT_YET_AUTHORITATIVELY_DEFINED
- **continuity**：已知未解决的 D10 child Definition Gap；其存在阻止 D10 被静默视为完成；实质语义与顺序必须在执行前完成规划。
- **definition_provenance**：仅 ID 与“D10 剩余 child Definition Gap”角色来自权威 Roadmap 历史；未从字母序、对话/Handoff、PR、实现代码或表面顺序推断任何实质语义。

### D10-E

- **id**：D10-E
- **type**：Sub-requirement
- **parent**：LOOP-DELIVERY-10
- **title**：NOT_YET_AUTHORITATIVELY_DEFINED
- **definition_status**：PLANNING_REQUIRED
- **objective**：NOT_YET_AUTHORITATIVELY_DEFINED
- **rationale**：NOT_YET_AUTHORITATIVELY_DEFINED
- **inputs_or_prerequisites**：NOT_YET_AUTHORITATIVELY_DEFINED
- **expected_output**：NOT_YET_AUTHORITATIVELY_DEFINED
- **depends_on**：NOT_YET_AUTHORITATIVELY_DEFINED
- **scope**：NOT_YET_AUTHORITATIVELY_DEFINED
- **out_of_scope**：NOT_YET_AUTHORITATIVELY_DEFINED
- **completion_contract**：NOT_YET_AUTHORITATIVELY_DEFINED
- **continuity**：已知未解决的 D10 child Definition Gap；其存在阻止 D10 被静默视为完成；实质语义与顺序必须在执行前完成规划。
- **definition_provenance**：仅 ID 与“D10 剩余 child Definition Gap”角色来自权威 Roadmap 历史；未从字母序、对话/Handoff、PR、实现代码或表面顺序推断任何实质语义。

### D10-F

- **id**：D10-F
- **type**：Sub-requirement
- **parent**：LOOP-DELIVERY-10
- **title**：NOT_YET_AUTHORITATIVELY_DEFINED
- **definition_status**：PLANNING_REQUIRED
- **objective**：NOT_YET_AUTHORITATIVELY_DEFINED
- **rationale**：NOT_YET_AUTHORITATIVELY_DEFINED
- **inputs_or_prerequisites**：NOT_YET_AUTHORITATIVELY_DEFINED
- **expected_output**：NOT_YET_AUTHORITATIVELY_DEFINED
- **depends_on**：NOT_YET_AUTHORITATIVELY_DEFINED
- **scope**：NOT_YET_AUTHORITATIVELY_DEFINED
- **out_of_scope**：NOT_YET_AUTHORITATIVELY_DEFINED
- **completion_contract**：NOT_YET_AUTHORITATIVELY_DEFINED
- **continuity**：已知未解决的 D10 child Definition Gap；其存在阻止 D10 被静默视为完成；实质语义与顺序必须在执行前完成规划。
- **definition_provenance**：仅 ID 与“D10 剩余 child Definition Gap”角色来自权威 Roadmap 历史；未从字母序、对话/Handoff、PR、实现代码或表面顺序推断任何实质语义。

## LOOP-ADVANCED-11

- **id**：LOOP-ADVANCED-11
- **type**：Requirement
- **parent**：ai-sdlc
- **title**：Real Review, Feedback, and Re-Gate
- **definition_status**：PLANNING_REQUIRED
- **objective**：Real Review, Feedback, and Re-Gate——真实 reviewer、PR feedback、需求变化回流、correction、Re-Gate。
- **rationale**：静态 review artifact 无法构成真实反馈闭环。
- **inputs_or_prerequisites**：D09/D10 的稳定 evidence 与 governance boundary。
- **expected_output**：真实反馈回流与 Re-Gate 记录。
- **depends_on**：D09、D10。
- **scope**：真实 reviewer 反馈、需求变化回流、correction、Re-Gate。
- **out_of_scope**：把静态 review artifact 当成真实反馈闭环。
- **completion_contract**：真实反馈触发 correction 与 Re-Gate 的可追溯闭环。
- **continuity**：future planning/recovery material：以上为早期路线材料恢复的高层定义，精确合同仍待恢复；decomposition assessment 在其首次实质执行前按 Shared §14.6 进行，不预先编造 child Sub-requirement。
- **expected_evidence**：真实 review/feedback/re-gate 证据（创建时尚未存在）。
- **definition_provenance**：recovered——早期项目路线材料恢复（真实反馈回流）；精确合同仍待恢复，故 Shared readiness 为 `PLANNING_REQUIRED`。

## LOOP-ADVANCED-12

- **id**：LOOP-ADVANCED-12
- **type**：Requirement
- **parent**：ai-sdlc
- **title**：Complex Requirement and Speckit Delivery
- **definition_status**：PLANNING_REQUIRED
- **objective**：Complex Requirement and Speckit Delivery——SPECKIT_PIPELINE_REQUIRED、完整 SDD、复杂需求、Direct/Speckit 共同治理尾部。
- **rationale**：复杂需求路径与 Speckit 的治理尾部未形成统一交付闭环。
- **inputs_or_prerequisites**：D08 路由结果（speckit_pending）、D09 治理尾部。
- **expected_output**：复杂需求经 Speckit 交付并进入共同治理尾部的证据。
- **depends_on**：D08、D09。
- **scope**：SPECKIT_PIPELINE_REQUIRED 路径、完整 SDD、复杂需求、Direct/Speckit 共同治理尾部。
- **out_of_scope**：重写现有 Speckit skills；把 D08 的 speckit_pending 写成已执行。
- **completion_contract**：复杂需求从 speckit_pending 到治理尾部的完整证据链。
- **continuity**：future planning/recovery material：以上为早期路线材料恢复的高层定义，精确合同仍待恢复；decomposition assessment 在其首次实质执行前按 Shared §14.6 进行，不预先编造 child Sub-requirement。
- **expected_evidence**：复杂需求 Speckit 交付与共同尾部证据（创建时尚未存在）。
- **definition_provenance**：recovered——早期项目路线材料恢复（复杂需求/Speckit）；精确合同仍待恢复，故 Shared readiness 为 `PLANNING_REQUIRED`。

## LOOP-ADVANCED-13

- **id**：LOOP-ADVANCED-13
- **type**：Requirement
- **parent**：ai-sdlc
- **title**：Multi-Repository Autonomous Delivery
- **definition_status**：PLANNING_REQUIRED
- **objective**：Multi-Repository Autonomous Delivery——global requirement、repo subflows、cross-repo Gate、artifact placement、跨仓 PR 协调。
- **rationale**：跨仓需求缺少统一协调、一致性和恢复合同。
- **inputs_or_prerequisites**：D10 单仓交付基础。
- **expected_output**：跨仓协调与一致性证据。
- **depends_on**：D10。
- **scope**：global requirement、repo subflows、cross-repo Gate、artifact placement、跨仓 PR 协调。
- **out_of_scope**：把多个独立单仓运行简单拼接成多仓事务。
- **completion_contract**：定义并验证新的协调、一致性和恢复合同。
- **continuity**：future planning/recovery material：以上为早期路线材料恢复的高层定义，精确合同仍待恢复；decomposition assessment 在其首次实质执行前按 Shared §14.6 进行，不预先编造 child Sub-requirement。
- **expected_evidence**：跨仓交付证据（创建时尚未存在）。
- **definition_provenance**：recovered——早期项目路线材料恢复（多仓自主交付）；精确合同仍待恢复，故 Shared readiness 为 `PLANNING_REQUIRED`。

## LOOP-ADVANCED-14

- **id**：LOOP-ADVANCED-14
- **type**：Requirement
- **parent**：ai-sdlc
- **title**：Product Operations and Model Portability
- **definition_status**：PLANNING_REQUIRED
- **objective**：Product Operations and Model Portability——任务队列、CLI/API、operator workflow、observability/SLO、Agent/model portability。
- **rationale**：自主交付缺少产品化运营与模型可移植性边界。
- **inputs_or_prerequisites**：D10 交付基础。
- **expected_output**：产品运营与可移植性证据。
- **depends_on**：D10。
- **scope**：任务队列、CLI/API、operator workflow、observability/SLO、Agent/model portability。
- **out_of_scope**：预设企业级 HA、租户或 UI 已获业务证据；削弱 Graph ownership、授权或审计边界。
- **completion_contract**：产品运营能力在有真实业务证据后定义并验证。
- **continuity**：future planning/recovery material：以上为早期路线材料恢复的高层定义，精确合同仍待恢复；decomposition assessment 在其首次实质执行前按 Shared §14.6 进行，不预先编造 child Sub-requirement。本 Requirement 为当前路线终点。
- **expected_evidence**：产品运营与可移植性证据（创建时尚未存在）。
- **definition_provenance**：recovered——早期项目路线材料恢复（产品运营/模型可移植性）；精确合同仍待恢复，故 Shared readiness 为 `PLANNING_REQUIRED`。

## Roadmap Amendments and Inserted Work

已插入工作必须单独记录，不得伪装成原始阶段。以下为非层级历史/修正材料，不构成 Requirement 或 Sub-requirement。

| 条目 ID | 类型 | Target Stage | 原因 | 改进方向 | Status orientation | changes_original_sequence |
| --- | --- | --- | --- | --- | --- | --- |
| D04-MUTATION-PERFORMANCE | performance correction | LOOP-DELIVERY-04 | full mode 串行重复 baseline 和 mutations，执行时间过长 | baseline 复用、bounded parallel、quick/full 分级、保持 mutation trust | completed as of Authorized Source | false |

说明：

- D04-MUTATION-PERFORMANCE 曾在 D08 后优先实施，但不改变原 D01～D10 阶段定义或编号。
- 它属于 D04 阶段的性能修正，不是新的原始路线阶段，也不是 D08→D09 阶段序列的一部分。

## Cross-Cutting Guardrails

- Git 当前事实高于 Roadmap；
- execution 不等于 review PASS；
- CI success 不等于 merge authorization；
- Draft PR 不等于 accepted delivery；
- Exchange transport 不等于 publication；
- Direct 与 Speckit 都不能绕过治理尾部；
- Agent 不拥有 Graph、全局状态或隐式 Skill 选择；
- Source workspace invariance；
- bounded execution 和 fail-closed；
- no force/amend/implicit merge；
- advanced roadmap 不自动授权实施。

## Open Definition Recovery Items

以下项目均标记为 **pending**，不给出未经证明的答案：

- Advanced 11～14 的精确任务拆解（pending）；
- Foundation-00 原始历史材料的进一步 provenance（pending）；
- 是否需要后续 accepted decision 固化 definition statuses（pending）。

已由项目总控接受的 D09 exact contract 记录了 D09 消费边界、Tail Completion Gate 先于 D07 publish、D07 governed mode 发布最终治理文件集合等决定，并定义了 D09 与 Topic 07 Shared Documentation Governance Tail 的边界以及 D09/D10 切分；这些不再作为 open definition recovery items。D09-A1 governance-tail-result contract 与 D09-A2 governed publisher 已进入 Source，D09-B production coordinator 已通过最终实施审查并随 PR #60 合并至事实分支（candidate head `6ac187ac`，merge commit `845ff9ee`），post-merge fact-branch verification 已通过，D09 Source closure 完成（R1/R2 为历史审查过程）；D10 仍未授权——D09 Source closure 不等于真实单仓 acceptance，也不等于 requirement completion、后续 merge 授权或 publication。

## Change Rules

- 只在阶段定义、边界或成果发生实质变化时修改本文件；
- implementation commit 不要求自动更新本文件；
- inserted work 必须单独记录，不得伪装成原始阶段；
- recovered/proposed 升级为 accepted 必须有 accepted decision 或 Source evidence；
- 不在本文件中维护实时 PR/CI/HEAD；
- 不从 Handoff 自动推导授权；
- 与现有 Roadmap 冲突时先明确文档职责，不静默覆盖。

本文件当前及未来的 planning 变更遵循 Shared `PROJECT_CONTROL.md` §14，不创建第二个治理权威：

- decomposition timing 与 coverage 按 §14.6：Requirement 首次实质执行前做 decomposition assessment，已知必需但无法安全定义的 child 以 `PLANNING_REQUIRED` fail-closed 记录，不得为显得完整而编造 child；
- granularity 按 §14.7：只有可独立成败与验收的 material outcome 才能成为 Sub-requirement；
- controlled replanning 按 §14.8：实质 planning 语义变化须经授权 Roadmap replanning 后修改本文件；Handoff、Prompt 或对话不得成为隐式 requirement-mutation 通道；
- Fresh-session recovery 按 §14.11：本文件须使 Fresh Controller/Specialist 不依赖退役对话即可恢复当前 planning contract 与剩余 Definition Gaps；
- Roadmap-format/conformance migration 与当前 Gate/STATE drift reconciliation 是不同的控制工作，不得静默合并（§14.12）。
