# Decision-090：C03-E 运行前治理就绪与手动/runtime 双执行面合同收口

## 状态

Accepted（2026-09-04，Current User 明确要求把 D-088-01 与现役手动 Skill 流程问题作为 LOOP runtime 继续开发前置，并授权本轮形成 Decision、完成项目治理和建立可恢复执行计划）。本状态只授权治理事实落库与四仓传播，不授权继续修改 D-088-01、D-087-*、现役 Skill、runtime 或业务仓。

## 背景

- Decision-084 已确认 7+1 `sdlc-*` Skill 是当前生产使用面；LOOP runtime 是后续自动化执行面，两者不能形成两套治理结果。
- Decision-087 已把 C03-E 后续路线改为 production entry、node result、Finding materialization 三条纵向 seam；Decision-088/089 又在 run8 前插入 D-088-01 知识目标初始化器。
- D-088-01 在多轮修复中已形成候选实现（截至产品仓 `a626335`），但 Current User 重新澄清的真实目标不只是“生成 `.sdlc` 空骨架”：初始化器必须覆盖新项目、无知识沉淀的既有代码项目、以及使用过原版 SDD 或 SDLC-SDD 的存量项目，并对旧内容做有选择的保留、转换、退役和补齐。
- 2026-09-04 在 `wms-monitor` 的真实手动交付中暴露三类阻断：`solution-design` 与 `solution-gate` 对首轮深度的前置关系形成循环；方案门禁的 Ledger/Gate 产物数量、稳定路径与 current/stale 关系缺乏唯一闭环口径；`library/{requirement_id}/manifest.md` 没有稳定创建者和更新者。
- 静态合同与 runtime 进一步证明这不是单一 Skill bug：`ai-sdlc/node-capability-contract.md` 明确首轮方案无深度前置，但 `skills/sdlc-solution-design/SKILL.md` 禁止在深度裁决前生成正式方案；runtime gateway 又把正式裁决深度写死为 `STANDARD`。现状无法保证手动与自动路径的语义等价。

## 问题

1. 若继续对 D-088-01 做 Round 3/4 局部补丁，会在错误的需求边界上继续优化实现；Decision-089 将存量迁移排除为“单独授权”，与 Current User 的初始化场景不一致。
2. 若直接恢复 D-087-*，runtime 会把尚未稳定的深度、Ledger/Gate、manifest 生命周期固化进生产入口，后续必然返工。
3. “手动优先”若只写成方向而没有逐包规划、完成门和唯一恢复入口，会重现 7+1 改造时“只记录目标、具体规划未落库”的恢复失败。
4. `intake.manifest.json`、`library/{requirement_id}/manifest.md` 与 `.sdlc/business_domain/knowledge-target.yaml` 是三个不同对象；继续统称 manifest 会造成触发、需求生命周期与知识路由互相代替。

## 决策

1. 在 `LOOP-CORE-03/C03-E` 内新增受控前置节点 **`C03-E-PRE-RUN — Project Governance Readiness and Dual-Path Contract Closure`**。它不是新的顶层 Requirement，也不改变 LOOP Core 最终目标；它是 D-087-*、真实 CLI run8 和 C05 重验继续前必须通过的 prerequisite。
2. 按 [冻结执行计划](../reports/decision-090-c03e-prerun-governance-plan.md) 固定以下顺序：
   1. `D-088-01` 需求重基线与实现收口；
   2. `D-090-01` 手动/runtime 共同语义合同冻结；
   3. `D-090-02` 手动 Skill 主路径修复并达到 `MANUAL_OPERATIONAL`；
   4. 恢复并按共同合同调整 `D-087-01..05`；
   5. `D-090-03` runtime manifest 投影与双路径语义对齐；
   6. `D-090-04` 离线 parity 验收；随后才允许申请真实 CLI run8。
3. **D-088-01 重基线**：初始化器必须对四种可判定输入给出幂等、可审计结果：`NEW_EMPTY`、`EXISTING_CODE_NO_KNOWLEDGE`、`LEGACY_SDD`、`LEGACY_SDLC_SDD`。存量场景必须按 `PRESERVE / TRANSFORM / RETIRE / ADD / BLOCKED_AMBIGUOUS` 分类执行；不得全盘删除，也不得让旧 SDD/SDLC-SDD 工作流继续成为活动权威。Decision-089 决策 3“存量迁移完全排除在初始化器之外”被本 Decision 取代；`.sdlc`、代码事实驱动、业务语义不虚构、create-if-missing 和业务仓零接触等不变量保留。
4. **首轮深度启动规则**：`solution-design` 首轮不等待 Gate。用户明确指定 LIGHT/STANDARD/DEEP 时，以 `user_requested` 作为非 Gate 的设计输入；未指定时以 `PROVISIONAL_STANDARD` 形成可审核的首轮方案。只有 `solution-gate/formal_verdict` 能输出正式 `decisionDepth`。若正式深度高于首轮覆盖，回流 `solution-design`；否则可继续。`BLOCKED_UNKNOWN` 仍 fail-closed。该规则同时约束手动 Skill 与 runtime，禁止 runtime 写死 `STANDARD`。
5. **方案门禁产物规则**：`adversarial_scan` 与 `formal_verdict` 是一个节点的两个隔离角色，允许且要求两个逻辑产物，但各自只有一个稳定路径：Finding Ledger 与正式 Gate Result。轮次、版本、current/stale/superseded 在文件元数据和 requirement manifest 中表达，不用每轮新增任意命名文件形成多份当前权威。
6. **manifest 三对象分工**：
   - `00-需求资料/intake.manifest.json`：仅用于 runtime 入口确认与触发；
   - `library/{requirement_id}/manifest.md`：需求级七节点人工可读生命周期投影，由 intake 创建，后续节点通过确定性发布/对账能力更新；
   - `.sdlc/business_domain/knowledge-target.yaml`：项目级长期知识路由声明。
   三者不得互相替代。runtime journal 保持机器恢复权威，但必须通过同一投影规则与 `manifest.md` 交叉绑定；不一致时 STOP，不静默覆盖。
7. `GW_VERTICAL_REBUILD` 既有授权保持 **未消费**，在 `C03-E-PRE-RUN` 达到 `MANUAL_OPERATIONAL` 且 D-087 调整项重新核对前暂停使用；本 Decision 不取消 Decision-087 的三条 seam，也不授权其实施。
8. Decision-086 的 PWR 自动推进裁决保持有效。本前置波只清除与之冲突的残留合同，不恢复 ACCEPTED_RISK proof、risk acceptance event 或人工风险仪式。
9. 今天的终点是治理落库与传播。D-088-01 候选提交冻结为复审输入，不继续修改；回家后的唯一下一转换为计划中的 **G1：D-088-01 需求重基线复核**，不得从 Round 3 finding 直接续修。

## 原因

- D-088-01 决定任何目标项目能否获得正确的治理骨架，手动合同决定当前工作能否不中断，二者都是 runtime 生产化的输入条件而非 run8 前的附带优化。
- manual-first 能先恢复当前生产效率；共享合同先于 runtime 对齐，避免把手动修复做成一次性旁路。
- 保留 D-087 三条 seam 可避免推倒已验证的 runtime 架构方向；把真实 depth、双角色产物和 manifest projector 接入这些 seam，比另建第二套 runtime 更小、更可验证。
- 冻结逐包计划、完成门和 STATE 下一转换，保证换机器或新会话只读权威文件即可恢复，不依赖聊天摘要。

## 影响

- Roadmap 升级为 v2.5.0，新增 `C03-E-PRE-RUN` 节点并重排 D-088、D-090、D-087、run8 的依赖。
- Decision-089 部分被取代：存量 SDD/SDLC-SDD 迁移不再被整体排除在初始化器需求之外；其余 v2 不变量继续有效。
- D-088-01 现有实现与测试不被判定失败或删除，而是作为重基线后的候选证据重新审查。
- 手动 Skill 将先修；runtime 后续必须消费同一语义合同并通过 parity 测试。实现机制可以不同，节点顺序、输入输出、深度、Finding/Gate、manifest、失效与回流结果必须等价。
- 本轮不修改 Skill/runtime/脚本/测试，不触碰任何业务仓，不运行真实 Agent CLI，不消费实现授权。

## 实现状态

- 本 Decision、Roadmap v2.5.0 与 `docs/reports/decision-090-c03e-prerun-governance-plan.md`：本治理提交落库。
- 产品仓→Exchange→PKB→Control Plane 的治理传播：本轮执行并以回执/STATE 引用为准。
- `D-088-01`：PAUSED，候选实现冻结，等待 G1 重基线复核。
- `D-090-01..04`、调整后的 `D-087-01..05`、run8：NOT_STARTED / 未授权。

## 依据

- Current User 2026-09-04 对真实初始化场景、manual-first/runtime-follow-up、semantic parity、路线图新增节点与本轮完整项目治理的明确裁决；
- `ai-sdlc/node-capability-contract.md` §4.2、`skills/sdlc-solution-design/SKILL.md` Core Rule 10、`skills/sdlc-solution-gate/SKILL.md` 双角色合同；
- `execution/gateway.ts` 当前 `decisionDepth: STANDARD` 实现事实与 `core/node-output-envelope.ts` 残留 PWR risk reference 规则；
- `wms-monitor/library/20260903-supplier-operation-location-collection` 与 `20260904-common-data-collection` 的真实产物形态（深度启动、Ledger/Gate 多轮文件、manifest 缺失）；
- Decision-084、Decision-086、Decision-087、Decision-088、Decision-089；Roadmap §7 受控重规划规则。
