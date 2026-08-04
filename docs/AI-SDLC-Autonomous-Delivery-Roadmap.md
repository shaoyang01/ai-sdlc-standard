# AI-SDLC Autonomous Delivery Roadmap

> LOOP Foundation, Delivery 01–10, and Advanced 11–14

## Purpose and Authority

本文件是 **Autonomous Delivery 能力阶段定义索引**，不是执行授权，也不是实时状态页。

文档角色：

- Autonomous Delivery 能力阶段定义索引；
- 定义阶段目标、边界、依赖、完成合同和 definition provenance；
- 作为 D01～D14 的长期规划入口；
- 与 Standard Package Roadmap（`ROADMAP.md`）和宏观 Implementation Roadmap（`docs/AI-SDLC-Implementation-Roadmap.md`）并列互补。

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

### Definition status（定义状态）

- **source_verified**：名称和主要职责可由当前 Source 实现直接验证；
- **recovered**：由早期项目路线材料明确恢复，当前 Source 未必实现；
- **partially_recovered**：高层目标已恢复，精确合同仍待恢复；
- **proposed**：新候选方案，尚未成为 accepted 路线定义。

### Status vocabulary（状态词汇）

各状态维度相互独立，**明确禁止从一个状态自动推导另一个状态**：

- **definition status**：阶段定义本身是否被验证/恢复/提议；
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

| ID | Title | Definition Status | Primary Outcome | Depends On | Current implementation orientation |
| --- | --- | --- | --- | --- | --- |
| LOOP-FOUNDATION-00 | LOOP Executor Kernel Foundation | source_verified | 独立、注入式、deterministic、bounded、fail-closed 的 LOOP kernel 基线 | — | `loop/` 包已实现 kernel 基线 |
| LOOP-DELIVERY-01 | Durable Run State and Artifact Foundation | source_verified | 并发安全 run state 与 durable/content-addressed artifact | Foundation-00 | `core/loop-run-state.ts`、`core/loop-run-store.ts`、`core/loop-artifact-store.ts` |
| LOOP-DELIVERY-02 | Controlled POSIX Process Runner | source_verified | 受控 POSIX 进程执行边界 | D01 | `core/loop-posix-process-runner.ts` |
| LOOP-DELIVERY-03 | Isolated Git Workspace | source_verified | 隔离 workspace 与 Source WIP invariance | D02 | `core/loop-git-workspace.ts` |
| LOOP-DELIVERY-04 | Bounded Multi-File Patch Application | source_verified | 安全受限的补丁应用与证据 | D02、D03 | `core/loop-patch-application.ts` |
| LOOP-DELIVERY-05 | Codex Multi-File Implementation Adapter | source_verified | 结构化请求到 Codex 实现与 patch evidence | D01、D02、D03、D04 | `core/loop-codex-implementation-adapter.ts` |
| LOOP-DELIVERY-06 | Autonomous Test, Fix, and Review Loop | source_verified | 有界测试/修复/审核循环结果与证据 | D01、D02、D03、D05 | `core/loop-autonomous-delivery-loop.ts` |
| LOOP-DELIVERY-07 | Recoverable Git Delivery Publisher | source_verified | 一个 commit、一次 push、Draft PR 与恢复 | D01、D02、D03、D06 | `core/loop-delivery-publisher.ts` |
| LOOP-DELIVERY-08 | Requirement and Design Orchestration | source_verified | 自然语言需求到 direct executor input | D01、D06 | `core/loop-requirement-design-orchestrator.ts` |
| LOOP-DELIVERY-09 | Review and Governance Tail | source_verified | 自然语言需求到带治理证据 Draft PR 的治理闭环 | D08、D03、D06、D07、Topic 07 Shared Tail 稳定合同 | exact contract accepted；A1 governance-tail-result contract 已进入 Source；D07 governed mode 已进入 Source；D09-B production coordinator 已通过最终实施审查并随 PR #60 合并至事实分支（merge commit `845ff9ee`），post-merge fact-branch verification 已通过 |
| LOOP-DELIVERY-10 | Real Single-Repository Acceptance and Hardening | recovered | 真实单仓 MVP 验收与硬化 | D01～D09 | 无 production module |
| LOOP-ADVANCED-11 | Real Review, Feedback, and Re-Gate | recovered | 真实反馈回流与 Re-Gate | D09、D10 | 无 production module |
| LOOP-ADVANCED-12 | Complex Requirement and Speckit Delivery | recovered | 复杂需求与 Speckit 共同治理尾部 | D08、D09 | 无 production module |
| LOOP-ADVANCED-13 | Multi-Repository Autonomous Delivery | recovered | 跨仓自主交付协调 | D10 | 无 production module |
| LOOP-ADVANCED-14 | Product Operations and Model Portability | recovered | 队列、CLI/API、observability 与可移植性 | D10 | 无 production module |

每个阶段使用统一字段：Definition status、Objective、Problem closed、Required inputs、Required outputs、Depends on、In scope、Out of scope、Completion contract、Expected evidence、Relationship to previous stage、Relationship to next stage、Definition provenance。各阶段不携带 live authorization 或 merge 状态字段。

## LOOP-FOUNDATION-00

- **Definition status**：source_verified
- **Objective**：建立独立、注入式、deterministic、bounded、fail-closed 的 LOOP Executor Kernel 基线，并输出公共 identity、state、artifact、dependency boundary 的基础约束。
- **Problem closed**：此前 LOOP 能力散落在 Runtime 边界内，无法在不侵入 Source workspace 的前提下独立构建后续执行阶段。
- **Required inputs**：无上游阶段；输入为 kernel 契约与现有 Source 边界约束。
- **Required outputs**：kernel 基线、公共 identity/state/artifact/dependency boundary 基础约束。
- **Depends on**：无。
- **In scope**：纯 kernel 状态机、类型与依赖边界；注入式依赖约定；确定性执行与 fail-closed 语义。
- **Out of scope**：不把 Runtime/Gateway/Graph ownership 移交给 LOOP。
- **Completion contract**：后续 D01～D10 可在不直接侵入 Source workspace 的条件下构建。
- **Expected evidence**：`loop/` 包存在且职责注释与基线一致。
- **Relationship to previous stage**：无。
- **Relationship to next stage**：D01 在其上建立 durable run/artifact facts。
- **Definition provenance**：Authorized Source tree 可直接验证（`loop/types`、`loop/core/loop_engine.ts`、`loop/executor`、`loop/router`、`loop/registry`）。

## LOOP-DELIVERY-01

- **Definition status**：source_verified
- **Objective**：建立并发安全 run state、durable/content-addressed artifact 与 identity binding。
- **Problem closed**：run 状态与产物无法可靠持久化、无法跨连接并发安全读写、无法绑定 identity。
- **Required inputs**：Foundation-00 kernel 基线。
- **Required outputs**：供后续阶段复用的 durable run/artifact facts。
- **Depends on**：Foundation-00。
- **In scope**：并发安全 run state、durable/content-addressed artifact、identity binding。
- **Out of scope**：进程执行、Git workspace、发布。
- **Completion contract**：后续执行阶段可通过注入的 store 读取/写入 run 与 artifact facts。
- **Expected evidence**：`core/loop-run-state.ts`、`core/loop-run-store.ts`、`core/loop-artifact-store.ts` 存在且职责注释与合同一致。
- **Relationship to previous stage**：在 Foundation-00 基线上建立持久化基础。
- **Relationship to next stage**：D02 复用其 identity/artifact facts。
- **Definition provenance**：Authorized Source tree 可直接验证。

## LOOP-DELIVERY-02

- **Definition status**：source_verified
- **Objective**：提供受控 POSIX 进程执行：executable allowlist、cwd/env boundary、timeout、output bounds、cleanup。
- **Problem closed**：进程执行无边界，存在越权、失控、泄漏风险。
- **Required inputs**：D01 identity 与依赖注入约定。
- **Required outputs**：可被后续执行阶段注入的受控 runner。
- **Depends on**：D01。
- **In scope**：allowlist、cwd/env 边界、timeout、output bounds、cleanup。
- **Out of scope**：业务流程判断、Git ownership、Agent policy。
- **Completion contract**：后续阶段通过注入 runner 执行命令且不直接触碰 child_process。
- **Expected evidence**：`core/loop-posix-process-runner.ts` 存在且平台限制声明完整。
- **Relationship to previous stage**：复用 D01 的注入式依赖边界。
- **Relationship to next stage**：D03 的所有 Git 命令经其执行。
- **Definition provenance**：Authorized Source tree 可直接验证。

## LOOP-DELIVERY-03

- **Definition status**：source_verified
- **Objective**：提供隔离 Git workspace：isolated task branch/worktree、Source WIP invariance、recovery、cleanup。
- **Problem closed**：并发 run 共享 workspace 会污染 Source WIP 且无法恢复。
- **Required inputs**：D02 受控 runner。
- **Required outputs**：可信 workspace snapshot。
- **Depends on**：D02。
- **In scope**：隔离 worktree/branch、WIP invariance、recovery、cleanup。
- **Out of scope**：patch semantics、implementation、publish。
- **Completion contract**：workspace 生命周期完整且 Source 工作树不变。
- **Expected evidence**：`core/loop-git-workspace.ts` 存在且仅通过注入 runner 执行 Git。
- **Relationship to previous stage**：复用 D02 执行边界。
- **Relationship to next stage**：D04 在其中应用补丁。
- **Definition provenance**：Authorized Source tree 可直接验证。

## LOOP-DELIVERY-04

- **Definition status**：source_verified
- **Objective**：提供有界多文件补丁应用：受限 unified diff、多文件 whitelist、文本创建/修改、index 保护、reconciliation。
- **Problem closed**：补丁应用越界（binary/rename/copy/delete/mode/symlink/gitlink）会造成不可审计的 workspace 变化。
- **Required inputs**：D02 runner、D03 workspace。
- **Required outputs**：安全应用后的 workspace changes 和 evidence。
- **Depends on**：D02、D03。
- **In scope**：受限 unified diff、多文件 whitelist、文本创建/修改、index 保护、reconciliation。
- **Out of scope**：Agent prompt、测试循环、commit/push/PR。
- **Completion contract**：拒绝 binary、rename、copy、delete、mode、symlink、gitlink 等越界操作，fail-closed；index 与 task HEAD 不被修改。
- **Expected evidence**：`core/loop-patch-application.ts` 存在且 fail-closed 语义与文档一致。
- **Relationship to previous stage**：复用 D03 隔离 workspace。
- **Relationship to next stage**：D05 复用其补丁应用能力。
- **Definition provenance**：Authorized Source tree 可直接验证。

## LOOP-DELIVERY-05

- **Definition status**：source_verified
- **Objective**：将结构化 implementation/test-repair/review-repair 请求映射到 Codex，并复用 D04 patch application。
- **Problem closed**：结构化 Executor 输入与 Codex 真实执行之间缺少受控适配层。
- **Required inputs**：D01/D02/D03/D04 能力。
- **Required outputs**：canonical implementation result 与 patch evidence。
- **Depends on**：D01、D02、D03、D04。
- **In scope**：请求校验、workspace drift 检查、bounded prompt、Codex 调用、单一 unified diff 解析、patch bytes 持久化与应用。
- **Out of scope**：直接拥有测试、review loop、Git publish。
- **Completion contract**：返回显式 succeeded/failed，patch 字节与持久化字节一致。
- **Expected evidence**：`core/loop-codex-implementation-adapter.ts` 存在且职责注释与合同一致。
- **Relationship to previous stage**：复用 D04 patch application。
- **Relationship to next stage**：D06 将其作为实现子阶段注入。
- **Definition provenance**：Authorized Source tree 可直接验证。

## LOOP-DELIVERY-06

- **Definition status**：source_verified
- **Objective**：提供自主测试、修复、审核循环：initial implementation、真实 test plan、review plan、bounded repair、no-progress、deadline。
- **Problem closed**：测试/修复/审核循环无界，存在死循环与证据丢失。
- **Required inputs**：D01 artifact store、D02 runner、D03 workspace、D05 adapter。
- **Required outputs**：delivery result 与 implementation/test/review evidence。
- **Depends on**：D01、D02、D03、D05。
- **In scope**：initial implementation、真实 test plan、review plan、bounded repair、no-progress、deadline。
- **Out of scope**：commit、push、创建 PR、merge。
- **Completion contract**：返回不可变、确定性、有界的 round trace，终态为 succeeded/failed/blocked。
- **Expected evidence**：`core/loop-autonomous-delivery-loop.ts`、`core/loop-delivery-evidence.ts` 存在且边界声明一致。
- **Relationship to previous stage**：以 D05 为实现子阶段。
- **Relationship to next stage**：D07 发布其交付结果。
- **Definition provenance**：Authorized Source tree 可直接验证。

## LOOP-DELIVERY-07

- **Definition status**：source_verified
- **Objective**：提供可恢复的 Git 交付发布：delivery artifact gate、exact staging、publish intent、一个 commit、普通 push、Draft PR、恢复。
- **Problem closed**：发布流程缺少可恢复、可重入且可核验的阶段事实，部分成功后无法安全续跑。
- **Required inputs**：D06 succeeded delivery result artifact；D01 artifact store、D02 runner、D03 workspace。
- **Required outputs**：publish intent/result、commit、remote branch 和 Draft PR facts。
- **Depends on**：D01、D02、D03、D06。
- **In scope**：delivery artifact gate、exact staging、publish intent、一个 commit、普通 push、Draft PR、失败恢复。
- **Out of scope**：mark Ready、merge、执行业务实现。D07 不提供对 commit、remote branch 或 pull request 的破坏性回滚：它只记录并恢复部分发布进度，不擦除或逆转已创建的远程事实。
- **Completion contract**：至多产生一个 commit、一次普通 push、一个 Draft PR；fail-closed 且不 force/amend/merge。
- **Expected evidence**：`core/loop-delivery-publisher.ts` 存在且 fail-closed 语义一致。
- **Relationship to previous stage**：发布 D06 的交付结果；D07 消费 D06 delivery-result contract 与 evidence，但不执行 D06。
- **Relationship to next stage**：D08 编排的自然语言需求路径最终落到 D05～D07。
- **Definition provenance**：Authorized Source tree 可直接验证。

## LOOP-DELIVERY-08

- **Definition status**：source_verified
- **Objective**：提供需求与设计编排：自然语言需求归一化、technical design、solution review、路径选择、direct executor input。
- **Problem closed**：自然语言需求无法确定性路由到 direct 路径，且缺少编排产物。
- **Required inputs**：D01 artifact store、注入的 agent、注入的 solution reviewer；当前 D06 request/command-step contract 作为 design-time 稳定合同，而非被调用的运行时依赖。
- **Required outputs**：requirement/design/review/executor-input/orchestration artifacts。
- **Depends on**：D01、D06。
- **In scope**：需求归一化、有界 technical design 轮次、solution review（PASS/NEEDS_REVISION/BLOCKED）、路径选择、direct executor input。
- **Out of scope**：调用 D03/D05/D06/D07；产生 Git/PR 副作用。
- **Completion contract**：路由至少区分 direct、Speckit pending、multi-repo pending、paused、blocked、failed；不产生 Git/PR 副作用。
- **Expected evidence**：`core/loop-requirement-design-orchestrator.ts` 存在且路由语义一致。
- **Relationship to previous stage**：承接 D01 基础；D08 产出 Direct Executor Input，其可无损映射到当前 D06 `LoopAutonomousDeliveryRequest` contract，并复用 D06 request/command-step contract 作为稳定下游接口；D08 不执行 D06，仅计划与路由。
- **Relationship to next stage**：D09 承接其自然语言需求路径形成治理闭环。
- **Definition provenance**：Authorized Source tree 可直接验证。

## LOOP-DELIVERY-09

- **Definition status**：source_verified
- **Objective**：Review and Governance Tail——承接 D08 自然语言需求路径（`direct / DIRECT_READY`），与 D06 的实现、测试、审核与 D07 governed publish 形成治理闭环，支持“自然语言需求到带治理证据 Draft PR”的阶段成果。
- **Problem closed**（已接受的部分）：自然语言需求路径缺治理收口，导致 Draft PR 缺乏可核验的治理证据闭环；已接受的 D09 exact contract 定义了 direct-only 消费、D03 workspace 准备、D06 执行、Tail Completion Gate 先于 D07 publish、D07 governed mode 发布最终治理文件集合等边界。
- **Required inputs**：D08 `direct / DIRECT_READY` artifacts；D06 delivery result 与 evidence；D07 governed publish 前的治理证据。
- **Required outputs**：带治理证据的 Draft PR 事实集；A1 阶段建立 `governance_tail_result` 完成结果合同与对应 artifact kind。
- **Depends on**：D08、D03、D06、D07 与 Topic 07 Shared Documentation Governance Tail 稳定合同。
- **In scope**（已接受 exact contract）：D09 只消费 D08 `direct / DIRECT_READY` artifacts；D09 调用 D03 准备 workspace；D09 调用 D06 执行实现、测试和内部 review；D05 只能由 D06 内部调用；D09 编排 Topic 07 Shared Documentation Governance Tail；Tail Completion Gate 必须在 D07 publish 之前完成；D07 governed mode 必须发布最终治理文件集合。
- **Out of scope**：Tail `pending` 或 `in_progress` 不能构成 D09 success；D09 success 不等于 requirement completion、merge authorization 或 publication；A1 只建立完成结果合同与 artifact kind，不实现 production coordinator，不修改 D07 publisher。
- **Completion contract**：已接受 exact contract 摘要见上；A1 只建立合同，不完成 D09；`governance_tail_result` 只表达 Shared Tail 已正式完成并具备 governed publish 资格，不表达 pending/blocked/failed/部分完成。
- **Expected evidence**：D09-B production coordinator（`core/loop-production-coordinator.ts`）实现 D09 执行链（固定 orchestration artifact → producer-owned D08 parsers → D03 prepare → pristine workspace gate → D06 execute + read-back → 注入式 Shared Tail → Tail immutable snapshot + completed reason gate → pre-A1 cross-binding → A1 build/store/read-back/parse + post-A1 defense → D03 post-Tail inspect → publisher factory create(remaining budget) → D07 governed publish + read-back → persisted publish full-chain binding）；production implementation 本身不是 implementation review PASS。
- **Relationship to previous stage**：承接 D08 自然语言需求路径（`direct / DIRECT_READY`）。
- **Relationship to next stage**：为 D10 真实单仓验收提供稳定治理边界。
- **Definition provenance**：D09 exact contract 已由项目总控接受，记录于本路线；D09-A1 governance-tail-result contract 已进入 Source（implementation review 与 post-merge closure 已完成）；D09-A2 governed publisher 已进入 Source（governed mode 消费 A1 并以 A1 final governed files 作为发布依据）；D09-B production coordinator 已通过最终实施审查（历史审查过程：项目总控 Review 4850508514 判定 REWORK 后完成 D09-B-R1 集中修复并重新提交，随后完成 D09-B-R2 窄范围修复 F-008：typed records 顺序无关 exact-key snapshot 并重新提交），PR #60 已合并至事实分支，candidate head `6ac187ac`，merge commit `845ff9ee`，post-merge fact-branch verification 已通过；D09 Source closure 完成（D09 Source closure 不等于真实单仓 acceptance，D10 仍未授权）；accepted exact contract 是 planning 事实，implementation review 结果决定 D09 是否通过。

本树能力记录（D09-A2 governed publisher 与 D09-B production coordinator 对应树）：

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

- **Definition status**：recovered
- **Objective**：Real Single-Repository Acceptance and Hardening——用真实单仓需求验证 D01～D09 端到端闭环并硬化。
- **Problem closed**：能力在合成环境下已验证，缺少真实仓库端到端验收。
- **Required inputs**：D01～D09 能力与真实单仓需求。
- **Required outputs**：单仓 MVP acceptance/hardening evidence。
- **Depends on**：D01～D09。
- **In scope**：真实 repository、真实 Draft PR、失败恢复、可信 evidence、运行边界。
- **Out of scope**：自动扩展到多仓、企业平台或无人监督高风险操作。
- **Completion contract**：真实单仓需求跑通 D01～D09 闭环并产出硬化证据。
- **Expected evidence**：真实仓库验收记录与硬化证据（创建时尚未存在）。
- **Relationship to previous stage**：在 D09 治理闭环之上做真实验收。
- **Relationship to next stage**：为 Advanced 11～14 提供稳定基础。
- **Definition provenance**：早期项目路线材料恢复出高层名称“Real Acceptance and Hardening”。

## LOOP-ADVANCED-11

- **Definition status**：recovered
- **Objective**：Real Review, Feedback, and Re-Gate——真实 reviewer、PR feedback、需求变化回流、correction、Re-Gate。
- **Problem closed**：静态 review artifact 无法构成真实反馈闭环。
- **Required inputs**：D09/D10 的稳定 evidence 与 governance boundary。
- **Required outputs**：真实反馈回流与 Re-Gate 记录。
- **Depends on**：D09、D10。
- **In scope**：真实 reviewer 反馈、需求变化回流、correction、Re-Gate。
- **Out of scope**：把静态 review artifact 当成真实反馈闭环。
- **Completion contract**：真实反馈触发 correction 与 Re-Gate 的可追溯闭环。
- **Expected evidence**：真实 review/feedback/re-gate 证据（创建时尚未存在）。
- **Relationship to previous stage**：依赖 D09/D10 稳定边界。
- **Relationship to next stage**：为 D12 复杂需求反馈回流提供经验。
- **Definition provenance**：早期项目路线材料恢复（真实反馈回流）。

## LOOP-ADVANCED-12

- **Definition status**：recovered
- **Objective**：Complex Requirement and Speckit Delivery——SPECKIT_PIPELINE_REQUIRED、完整 SDD、复杂需求、Direct/Speckit 共同治理尾部。
- **Problem closed**：复杂需求路径与 Speckit 的治理尾部未形成统一交付闭环。
- **Required inputs**：D08 路由结果（speckit_pending）、D09 治理尾部。
- **Required outputs**：复杂需求经 Speckit 交付并进入共同治理尾部的证据。
- **Depends on**：D08、D09。
- **In scope**：SPECKIT_PIPELINE_REQUIRED 路径、完整 SDD、复杂需求、Direct/Speckit 共同治理尾部。
- **Out of scope**：重写现有 Speckit skills；把 D08 的 speckit_pending 写成已执行。
- **Completion contract**：复杂需求从 speckit_pending 到治理尾部的完整证据链。
- **Expected evidence**：复杂需求 Speckit 交付与共同尾部证据（创建时尚未存在）。
- **Relationship to previous stage**：扩展 D09 治理尾部到 Speckit 路径。
- **Relationship to next stage**：为 D13 多仓协调提供单仓复杂需求基础。
- **Definition provenance**：早期项目路线材料恢复（复杂需求/Speckit）。

## LOOP-ADVANCED-13

- **Definition status**：recovered
- **Objective**：Multi-Repository Autonomous Delivery——global requirement、repo subflows、cross-repo Gate、artifact placement、跨仓 PR 协调。
- **Problem closed**：跨仓需求缺少统一协调、一致性和恢复合同。
- **Required inputs**：D10 单仓交付基础。
- **Required outputs**：跨仓协调与一致性证据。
- **Depends on**：D10。
- **In scope**：global requirement、repo subflows、cross-repo Gate、artifact placement、跨仓 PR 协调。
- **Out of scope**：把多个独立单仓运行简单拼接成多仓事务。
- **Completion contract**：定义并验证新的协调、一致性和恢复合同。
- **Expected evidence**：跨仓交付证据（创建时尚未存在）。
- **Relationship to previous stage**：在 D10 单仓 MVP 之上扩展。
- **Relationship to next stage**：为 D14 产品运营提供多仓运行事实。
- **Definition provenance**：早期项目路线材料恢复（多仓自主交付）。

## LOOP-ADVANCED-14

- **Definition status**：recovered
- **Objective**：Product Operations and Model Portability——任务队列、CLI/API、operator workflow、observability/SLO、Agent/model portability。
- **Problem closed**：自主交付缺少产品化运营与模型可移植性边界。
- **Required inputs**：D10 交付基础。
- **Required outputs**：产品运营与可移植性证据。
- **Depends on**：D10。
- **In scope**：任务队列、CLI/API、operator workflow、observability/SLO、Agent/model portability。
- **Out of scope**：预设企业级 HA、租户或 UI 已获业务证据；削弱 Graph ownership、授权或审计边界。
- **Completion contract**：产品运营能力在有真实业务证据后定义并验证。
- **Expected evidence**：产品运营与可移植性证据（创建时尚未存在）。
- **Relationship to previous stage**：在 D10 基础上产品化。
- **Relationship to next stage**：无（当前路线终点）。
- **Definition provenance**：早期项目路线材料恢复（产品运营/模型可移植性）。

## Roadmap Amendments and Inserted Work

已插入工作必须单独记录，不得伪装成原始阶段。

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
