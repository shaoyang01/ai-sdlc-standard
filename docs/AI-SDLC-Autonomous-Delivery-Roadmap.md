# AI-SDLC LOOP Core Roadmap

> Version: 2.3.4
> Planning baseline: [LOOP Core Contract](LOOP_CORE_CONTRACT.md)
> Authority: 这是 `ai-sdlc` 的稳定 Roadmap planning surface。当前执行指针、Gate、授权、live finding、PR/CI/HEAD 和执行尝试只记录在 `ai-project-control-plane` 的 STATE 及执行证据中。

## 1. Purpose and Authority

本 Roadmap 采用 `ai-project-control-plane/protocols/PROJECT_CONTROL.md` §14 的完整规划合同。其目标不是把 Agent、代码文件、PR 或会话列成阶段，而是让 fresh Controller 仅凭权威文档和仓库事实，恢复：当前产品目标、剩余可接受结果、依赖、完成条件、持续性关系和已知 Definition Gap。

LOOP 产品的目标是让用户只需向任一已支持入口提交一次需求，由 LOOP runtime 按 binding 自动调用真实 Agent CLI，经由标准产物、最早受影响节点 Re-Gate、实现、审核和验收，连续推进到 `READY_FOR_MANUAL_GIT_HANDOFF`。正常路径不得要求用户为推进流程而机械切换 Kimi、Codex、Hermes 等 Agent；业务仓 commit、push、PR、Ready、merge 和发布仍不属于 LOOP Core。

本文件与其他权威材料的分工如下：

| 文档/事实 | 职责 | 不承担 |
| --- | --- | --- |
| [LOOP Core Contract](LOOP_CORE_CONTRACT.md) | 产品边界、产物链、Agent binding、Re-Gate 和人工 Git 交接语义 | 当前执行状态或授权 |
| 本 Roadmap | Requirement/Sub-requirement 的稳定合同、依赖、完成覆盖和 Definition Gap | 当前 Gate、PR、CI、执行命令或临时顺序 |
| `projects/ai-sdlc/STATE.yaml` | 当前 Requirement/Sub-requirement 指针、Gate、授权、阻塞与临时控制状态 | 第二份需求合同或长期路线定义 |
| Git/tree/diff、PR/CI/tests、执行产物 | 当前实现与尝试证据 | Roadmap 或授权权威 |

若发生冲突，先以已验证的仓库事实、既有项目治理和明确用户授权为准。任何实质 Roadmap 修改都必须经用户授权；本文件自身不授予代码、Agent 调用、Git 或外部副作用权限。

## 2. Canonical Hierarchy and Status Semantics

```text
Project: ai-sdlc
├── Requirement: LOOP-CORE-00
│   ├── Sub-requirement: LOOP-CORE-01
│   ├── Sub-requirement: LOOP-CORE-02
│   ├── Sub-requirement: LOOP-CORE-03
│   ├── Sub-requirement: LOOP-CORE-04（已取消，Decision-044，内容保留为历史记录）
│   └── Sub-requirement: LOOP-CORE-05
├── Requirement: LOOP-ADVANCED-01
├── Requirement: LOOP-ADVANCED-02
├── Requirement: LOOP-ADVANCED-03
└── Requirement: LOOP-ADVANCED-04
```

- `definition_status` 只取 `DEFINED` 或 `PLANNING_REQUIRED`。
- `DEFINED` 表示 mandatory planning semantics 足以开始受控执行规划，不表示已实现、已通过、已授权、已合并或已发布。
- `PLANNING_REQUIRED` 表示它是当前父目标完成所需的真实 material outcome，但仍有不能安全猜测的合同缺口；其已知事实和 `NOT_YET_AUTHORITATIVELY_DEFINED` 语义必须写出，且不得作为执行入口。
- `definition_provenance` 独立于 readiness：`user_accepted` 是用户确认的产品方向，`source_verified` 是可由当前 Source 验证的事实，`recovered` 是历史路线恢复的定义。它们均不自动形成授权或实现证据。
- `LOOP-CORE-01`～`05` 是为了完成 `LOOP-CORE-00` 而定义的独立 material outcome；它们不是 prompt、PR、commit、review round、bug fix、会话或文件名。

## 3. Core Parent Requirement

### LOOP-CORE-00 — Artifact-Driven Single-Repository Delivery Core

- **id**：`LOOP-CORE-00`
- **type**：Requirement
- **parent**：`ai-sdlc`
- **title**：Artifact-Driven Single-Repository Delivery Core
- **definition_status**：`DEFINED`
- **definition_provenance**：`user_accepted`
- **objective**：使任意已支持 Agent 入口能以同一套产物和 Gate 启动或恢复一个单仓需求，由 LOOP runtime 按 capability binding 自动调用真实 Agent CLI，并在单轨七节点链（requirement-intake → solution-design → solution-gate → task-planning → implementation → code-review → knowledge-sync）中完成设计、实现、审核和知识同步，交付人工 Git 交接包。
- **rationale**：需求和设计细节散落在不同聊天或 Agent 上会导致遗漏；当前首要价值是可靠完成设计—开发—验收循环，而不是无人监督地发布远程 Git 变更。
- **inputs_or_prerequisites**：LOOP Core Contract；目标项目的冻结需求、方案、测试与文档合同；已支持 Agent 的实际适配能力；目标仓库事实。
- **expected_output**：可恢复的 Requirement 运行记录、有效产物链、真实 CLI capability execution journal、可追溯的 Agent binding/adapter/输入输出版本、单轨实现结果、审核与验收结论，以及 `READY_FOR_MANUAL_GIT_HANDOFF` 或如实的 `blocked`/`failed` 结果。
- **depends_on**：无上游 Roadmap Requirement。
- **scope**：C01～C03 与 C05 定义的统一入口、产物协调、单轨交付和真实单仓验收；C04 已取消（Decision-044）。
- **out_of_scope**：业务仓自动 commit/push/PR/Ready/merge/发布；为业务仓远程 Git 副作用设计的恢复；多仓业务事务；Personal-KB 项目产物发布；平台化队列、UI、daemon、registry 或新 Provider 接入；Direct/Speckit 双轨路径分流（Decision-044 已裁决不恢复）。
- **completion_contract**：C01～C03 与 C05 均按各自完成合同完成；至少一个真实单仓需求由一次入口启动后，经真实 Agent CLI 自动贯通单轨链，证明完整产物链、有效 Re-Gate、可恢复执行、可追溯 binding 与人工 Git 交接；正常完成路径 `manual_agent_switch_count = 0`；不存在把 shadow executor、自述记录或业务仓远程 Git 副作用误写为 Core 成功条件的残留合同。
- **continuity**：C01～C03 与 C05 的子项共同覆盖 Core（C04 已取消）；若执行中发现新的 material outcome，必须暂停受影响范围、受控重排本父目标的子项覆盖后再恢复，不能通过会话或 Handoff 隐式扩展。

## 4. Core Sub-requirements

### LOOP-CORE-01 — Unified Entry and Replaceable Agent Binding

- **id**：`LOOP-CORE-01`
- **type**：Sub-requirement
- **parent**：`LOOP-CORE-00`
- **title**：Unified Entry and Replaceable Agent Binding
- **definition_status**：`DEFINED`
- **definition_provenance**：`user_accepted`
- **objective**：让任意已支持入口 Agent 或等价 Skill/命令，以同一 Requirement ID、来源记录和运行状态启动或恢复 LOOP；节点按 capability binding 选择实际执行 Agent，而不写死角色。
- **rationale**：需求不能绑定在单个聊天会话、单一 CLI 或“需求必须由某 Agent 做”的固定分工上；可替换执行者必须是产品合同的一部分。
- **inputs_or_prerequisites**：LOOP Core Contract；标准需求、方案、审核和验收产物合同；当前 Kimi、Codex、Hermes 适配事实。
- **expected_output**：入口归一化合同；可版本化的 Node Capability Contract 与 binding；每次节点执行的 binding、Agent/adapter 版本、输入产物版本、尝试和结果记录。
- **depends_on**：无上游 Core 子项。
- **scope**：Requirement ID 与来源识别；新需求/补充/变更/返工/反馈分类；binding 的启用、版本、输入输出校验、副作用、超时、失败和替换边界；跨入口恢复。
- **out_of_scope**：把某 Agent 指定为永久总控或节点唯一执行者；新增 Provider；业务流程实现；自动 Git 动作；调度平台。
- **completion_contract**：至少一个已支持入口可以创建或恢复同一 Requirement；每个节点可记录实际 binding 和输入/输出来源；binding 替换不改变 Requirement ID、产物 schema、finding 语义、Re-Gate 路由或人工 Git 边界；不可用/超时/不合格结果产生可恢复的失败尝试而非伪造通过。
- **continuity**：当前定义将 C01 作为一个统一的、可独立验收的入口与 binding outcome。首次 material execution 前必须用当前 Source 事实重新做分解评估；只有发现不可由同一合同覆盖的独立 material outcome 时，才在用户授权的 Roadmap 重排中增设子项。

### LOOP-CORE-02 — Artifact-Led Orchestration and Re-Gate

- **id**：`LOOP-CORE-02`
- **type**：Sub-requirement
- **parent**：`LOOP-CORE-00`
- **title**：Artifact-Led Orchestration and Re-Gate
- **definition_status**：`DEFINED`
- **definition_provenance**：`user_accepted`
- **objective**：把需求摘要、技术方案、方案门禁（挑战/澄清/裁决）、任务规划、实现、代码审核和知识同步的当前有效版本组织为可恢复的协调链；设计深度由 solution-gate 按 LIGHT/STANDARD/DEEP 档位裁决（Decision-044），不再存在 Direct/Speckit 路径分流。
- **rationale**：不同 Agent 只凭聊天摘要会遗漏前序事实；返工若只修代码则会保留失效方案和审核结论。
- **inputs_or_prerequisites**：C01 的入口与 binding 记录；目标项目适用的 Standard Package、Gate 和文档治理合同。
- **expected_output**：可以判定当前节点、有效产物引用、Gate 结果、未解决 finding、受影响下游失效关系和下一步资格的运行记录。
- **depends_on**：`LOOP-CORE-01`。
- **scope**：来源冲突/缺失处理；产物版本与引用；方案门禁收敛协议；设计深度裁决；最早受影响节点 Re-Gate；有界失败、暂停和恢复；C02-WP3.5 单轨生命周期重基线（Decision-044，逐阶段单独授权；[阶段 2 A～G 已验收实施规划](LOOP-CORE-C02-WP3.5-SINGLE-RAIL-IMPACT-ANALYSIS.md)）。
- **out_of_scope**：以聊天记忆替代产物；将普通执行尝试提升为 Roadmap 阶段；直接修改远程 Git；恢复 Direct/Speckit 路径分流或独立 Speckit 产物轨道。
- **completion_contract**：对同一 Requirement 可明确分类新需求、补充、变更、返工和反馈；有效 finding 会失效受影响下游产物并回流正确最早节点；后续节点只消费有效上游版本和 Gate 结论；中断后可由另一入口/binding 继续而不重解释已确认事实。
- **continuity**：业务目标、范围、验收或来源冲突回流 requirement-intake；架构、接口、数据、异常、兼容性和风险问题回流 solution-design；实现错误仅在不改变已批准行为时可停留在 implementation；代码审核揭示方案缺口必须回流 solution-design 并重新过 solution-gate；线下测试/线上反馈不是 LOOP 节点，经 requirement-intake 分类为新输入开启新 generation。

### LOOP-CORE-03 — Single-Rail Skill Delivery, Autonomous Runtime and Manual Handoff

- **id**：`LOOP-CORE-03`
- **type**：Sub-requirement
- **parent**：`LOOP-CORE-00`
- **title**：Single-Rail Skill Delivery, Autonomous Runtime and Manual Handoff
- **definition_status**：`DEFINED`
- **definition_provenance**：`user_accepted`
- **objective**：在 C02 单轨链的有效方案与深度裁决之上，交付与七节点一一对应的 canonical Skill 集，并由 LOOP runtime 通过生产级 adapter 自动调用真实 Agent CLI，完成节点推进、Re-Gate、恢复、实现、代码审核和知识同步，最终交付人工 Git 交接包。`sdlc-docflow-writer` 仅作为不拥有 LOOP 生命周期状态的通用文档 Skill 保留，不用于治理或推进 LOOP。
- **rationale**：近期需要首先证明完整的单仓产品闭环可用；工作区改动成功不能被误读为远程交付成功。Skill 收敛后每节点有唯一执行能力归属；非节点通用文档生成仍有独立使用价值，但不得取得节点、Gate 或流程推进权威；Delivery Tail 语义不随双轨取消而改变。
- **inputs_or_prerequisites**：C02 的审核通过方案、深度裁决、有效 finding/Gate；目标仓库事实；适用测试、代码审核和文档治理约束。
- **expected_output**：七个 canonical 节点 Skill、一个 `non-node utility skill` 及其合同/注册/校验器；真实 CLI adapter 与受控进程执行面；持久化 capability execution journal；自动节点推进、Re-Gate 和恢复；工作区改动、实现记录、代码审核、知识同步结论、未执行项、残余风险、恢复说明和 `READY_FOR_MANUAL_GIT_HANDOFF` 或明确失败结果。
- **depends_on**：`LOOP-CORE-02`。
- **scope**：C03-A～D 已交付的单轨 Skill、注册切换、Delivery Tail 与 runtime 接线；C03-E Real Multi-Agent Autonomous Dispatch，覆盖真实 Kimi/Codex/Hermes CLI adapter、受控进程调用、输出校验、durable journal、自动推进、失败恢复和 Re-Gate；清理活动 Skill reference 中已退役的 Direct/Speckit 路径语义；保留 `sdlc-docflow-writer` 作为非节点通用文档 Skill，且不用于治理 LOOP；**Delivery Tail 保留**（delivery checkpoint 的 generation/CAS 机器底座与 `READY_FOR_MANUAL_GIT_HANDOFF` 语义不变）。
- **out_of_scope**：业务仓 commit、push、Draft PR、Ready、merge、发布；Personal-KB 项目产物发布；scheduler、daemon、UI、服务端控制平面或新增 Provider；以未验证测试、shadow executor、Markdown 自述或历史 CI 替代真实执行证据；恢复 Speckit pipeline、`sdlc-gate-runner` 独立 Skill或 Direct/Speckit 路径分流；把 `sdlc-docflow-writer` 注册为 LOOP 节点、授予 Gate 裁决权或流程推进权。
- **completion_contract**：C03-A～E 均完成；生产入口默认不再使用 deterministic shadow；每个节点由 runtime 真实调用所选 binding 并记录不可伪造的 started/terminal event、adapter/版本、输入输出 digest 与尝试结果；正常路径无需用户切换 Agent，失败或不合格输出可恢复；无 blocking finding 时只输出 `READY_FOR_MANUAL_GIT_HANDOFF`，不产生业务仓远程 Git 副作用。
- **continuity**：C03-E 当前 Accepted 合同仍为 [LOOP-CORE-C03-E 规划](LOOP-CORE-C03-E-PLAN.md) v0.3.0 与 Decision-063；v0.4.0-draft / Decision-064 仅提出在 E0 后前置三 Agent `PROVIDER_REACHABILITY_ONLY` 预检，修订 A1 尚待 Current User 接受。Q1～Q7 仍按原推荐值冻结，未授予任务规划、Agent CLI 或实施权限。若代码审核改变已批准行为、架构或验收事实，必须回流 C02；不得把 direct CLI 可达性、人工 Agent 切换、shadow executor 或执行者自述当作自主闭环通过。

### LOOP-CORE-04 — Speckit Projection and SDD Integration（已取消）

> **状态：CANCELLED（2026-08-21，Decision-044）**。单轨裁决（六项固定决策第 1～3 项）取消了 `SPECKIT_PIPELINE_REQUIRED` 路径与独立 Speckit 产物轨道，本 Sub-requirement 的存在前提消失。其原有职责的承接关系：specify/plan 的方案映射与深化语义并入 solution-design（深度档位模型）；clarify 并入 solution-gate；tasks 保留为 task-planning；analyze/checklist 降级为 task-planning/implementation 内部校验；sync/code-doc-reconcile 合并为 knowledge-sync。development-path-governance 的 Topic 07 formal closure 同步降级标注。以下内容保留为历史记录，不再构成当前 Core 的顺序、依赖或完成声明。

- **id**：`LOOP-CORE-04`（CANCELLED）
- **type**：Sub-requirement
- **parent**：`LOOP-CORE-00`
- **title**：Speckit Projection and SDD Integration
- **definition_status**：`DEFINED`
- **definition_provenance**：`user_accepted`
- **objective**：当 C02 选择 `SPECKIT_PIPELINE_REQUIRED` 时，将已批准的 DocFlow 需求和技术方案投影为 Speckit 实现产物，并经 C03 的共同交付尾部完成实现、审核和人工 Git 交接。
- **rationale**：`specify`/`clarify` 与需求摘要、技术方案、挑战和审核存在重叠；若两条链独立定义业务事实，必然产生漂移。
- **inputs_or_prerequisites**：C02 的路径决定与已批准业务事实；C03 的共同交付尾部合同；Speckit `spec.md`、`plan.md`、`tasks.md`、`analyze`、`implement` 的稳定产物合同。
- **expected_output**：可追溯的 DocFlow 到 `spec.md` 投影；仅处理残余问题的 `clarify`；与同一业务事实一致的实施级计划、任务、分析、实现和 C03 交接结果。
- **depends_on**：`LOOP-CORE-02`、`LOOP-CORE-03`。
- **scope**：Requirement ID/版本/引用映射；`specify` 投影；`clarify` 残余问题；派生产物一致性检查；回流 C02 与 C03 的 Re-Gate。
- **out_of_scope**：用 `specify` 重新发明需求或技术方案；建立第二套独立业务治理；自动远程 Git 发布。
- **completion_contract**：复杂需求能明确选择该路径；每个 Speckit 业务语义都可追溯至当前批准的 DocFlow 事实；残余澄清或不一致回流最早受影响节点；后续实现、审核和验收满足 C03 的共同交付尾部合同。
- **continuity**：若 Speckit 派生产物改变业务行为，必须回流 C02 的技术方案、挑战和审核；若只影响实施细节，按 C03 的审核和验收语义复核。

### LOOP-CORE-05 — Recoverable Evidence and Real Core MVP Acceptance

- **id**：`LOOP-CORE-05`
- **type**：Sub-requirement
- **parent**：`LOOP-CORE-00`
- **title**：Recoverable Evidence and Real Core MVP Acceptance
- **definition_status**：`DEFINED`
- **definition_provenance**：`user_accepted`
- **objective**：以真实单仓需求证明 Core 的产物链、binding、返工、证据和人工 Git 边界在中断、输入不完整或 Agent 不可用时仍可恢复。
- **rationale**：已有代码组件、文档或样例不能替代真实需求上的端到端证明。
- **inputs_or_prerequisites**：完成 C03-E 的真实 CLI 自主调度；真实需求来源、目标仓库和适用执行授权。
- **expected_output**：可复核的真实 run evidence、至少一次有效 Re-Gate、binding/输入版本追溯，以及最终人工 Git 交接包或如实的失败/阻塞结论。
- **depends_on**：`LOOP-CORE-03`；真实需求证据。（原对 `LOOP-CORE-04` 的条件性依赖随 C04 取消而移除，Decision-044。）
- **scope**：真实需求验收；中断/不可用恢复；输入输出版本追溯；对已验证、未验证、失败和未授权动作的明确区分。
- **out_of_scope**：用虚构样例、聊天摘要、旧 PR/CI 或执行者自述替代验证；自动 Git 发布。
- **completion_contract**：至少一个新的真实单仓需求从已支持入口一次启动或恢复；runtime 真实调用所选 Agent CLI，正常路径不要求人工切换 Agent；标准产物贯通设计、实现、审核和验收；至少一个有效 finding 回流正确最早节点；机器 journal 可追溯每次 binding、输入输出版本和 terminal result；在无业务仓远程 Git 副作用条件下输出人工 Git 交接包，或在条件不满足时输出可恢复失败/阻塞。
- **continuity**：验收产物须让 fresh operator 无需旧会话即可区分已通过、待验证、失败、阻塞和未授权动作；若真实验证发现 Parent Core 覆盖缺口，必须受控重排 C01～C05 后再继续。

## 5. Advanced Requirements and Explicit Definition Gaps

### LOOP-ADVANCED-01 — Governed Multi-Repository Delivery

- **id**：`LOOP-ADVANCED-01`
- **type**：Requirement
- **parent**：`ai-sdlc`
- **title**：Governed Multi-Repository Delivery
- **definition_status**：`PLANNING_REQUIRED`
- **definition_provenance**：`user_accepted`
- **objective**：支持一个业务需求跨多个目标仓库推进，同时维持全局业务一致性、每仓独立治理、跨仓 Re-Gate、全局验收和每仓人工 Git 交接。
- **rationale**：真实需求常改变多个仓库；仅并列执行多个代码 patch 既不能表达跨仓依赖，也不能保证全局验收。
- **inputs_or_prerequisites**：C05 的真实单仓 Core 证据；一个已确认的多仓业务需求；各目标仓库的治理和事实来源。
- **expected_output**：在完整规划后，形成一个全局 Requirement、每仓独立的可追溯范围/方案/实现/审核/验收，以及可反映部分仓阻塞的全局验收结论。
- **depends_on**：`LOOP-CORE-05`。
- **scope**：全局范围和依赖；每仓独立产物、Gate、工作区和人工交接；跨仓接口/范围/finding 的受影响仓 Re-Gate；全局验收。
- **out_of_scope**：多仓事务提交、自动跨仓发布、以多个独立 patch 冒充多仓治理。
- **completion_contract**：在下列未定义语义得到权威规划前，不得执行或分解为执行子项；规划完成后，其子项必须共同覆盖全局与每仓验收。
- **continuity**：已知但尚未定义的语义持续作为父目标的 Definition Gap，不能在单仓成功时被静默关闭。
- **NOT_YET_AUTHORITATIVELY_DEFINED**：全局产物的稳定落点与所有权、跨仓 Requirement ID/版本模型、仓库加入/退出规则、全局与每仓 Gate 冲突裁决、最低跨仓验收证据、部分仓阻塞时的恢复与最终结论语义。

### LOOP-ADVANCED-02 — Optional Remote Git Delivery

- **id**：`LOOP-ADVANCED-02`
- **type**：Requirement
- **parent**：`ai-sdlc`
- **title**：Optional Remote Git Delivery
- **definition_status**：`PLANNING_REQUIRED`
- **definition_provenance**：`recovered`
- **objective**：在 Core 被真实验证后，按独立授权提供可选的远程 Git 交付能力。
- **rationale**：自动 commit/push/PR 的风险和失败语义与 Core 的本地人工交接不同，不能反向定义或阻塞 Core。
- **inputs_or_prerequisites**：C05 的证据；明确的风险范围、远程系统约束和用户授权模型。
- **expected_output**：在完整规划后，得到有明确授权、目标、结果确认、未知结果和失败恢复边界的可选远程 Git 合同。
- **depends_on**：`LOOP-CORE-05`。
- **scope**：未来可选的 commit/push/PR 副作用和其证据/恢复合同。
- **out_of_scope**：作为 C01～C05 的成功条件或默认行为；无授权的远程操作。
- **completion_contract**：在所有未定义语义被权威规划并经独立授权前不得执行。
- **continuity**：未来即使实现，也必须明确区分已确认、未知和未授权远程结果，不得改变 Core 的人工 Git 边界。
- **NOT_YET_AUTHORITATIVELY_DEFINED**：自动化范围、适用风险级别、精确授权模型、幂等和未知结果恢复、服务边界和验收合同。

### LOOP-ADVANCED-03 — Product Operations and Provider Expansion

- **id**：`LOOP-ADVANCED-03`
- **type**：Requirement
- **parent**：`ai-sdlc`
- **title**：Product Operations and Provider Expansion
- **definition_status**：`PLANNING_REQUIRED`
- **definition_provenance**：`recovered`
- **objective**：在 Core 证明真实需求后，评估队列、服务化运营、观测和新增 Agent Provider 的产品化能力。
- **rationale**：这些能力属于后续规模化问题；当前不应以平台化复杂度替代单仓闭环的产品验证。
- **inputs_or_prerequisites**：C05 的证据；明确的真实跨项目失败或运营需求。
- **expected_output**：在完整规划后，得到不破坏产物优先、可替换 binding、可恢复记录和人工 Git 边界的运营/Provider 合同。
- **depends_on**：`LOOP-CORE-05`。
- **scope**：未来的运营、观测和 Provider 准入能力。
- **out_of_scope**：当前创建 scheduler、daemon、UI、registry、dashboard、服务端控制平面或无依据的新 Provider 集成。
- **completion_contract**：在未定义语义完成权威规划并获得独立授权前不得执行。
- **continuity**：新增 Provider 必须通过 C01 的 binding 合同接入，不得把节点重新绑定为固定 Agent 角色。
- **NOT_YET_AUTHORITATIVELY_DEFINED**：产品规模、服务所有权、观测指标、隔离/权限模型、Provider 准入、成本和风险边界。

### LOOP-ADVANCED-04 — Personal-KB Project Artifact Projection

- **id**：`LOOP-ADVANCED-04`
- **type**：Requirement
- **parent**：`ai-sdlc`
- **title**：Personal-KB Project Artifact Projection
- **definition_status**：`PLANNING_REQUIRED`
- **definition_provenance**：`user_accepted`
- **objective**：在 LOOP Core 全自主运行通过真实验收后，把各项目最终 `library/<requirement-id>/` 产物与相关 `.specify/**` 文档受控投影到 Personal-KB 项目命名空间，为后续开发提供跨项目可查询知识。
- **rationale**：项目产物具有长期开发价值，但 PKB 是独立仓库和写入系统；其 writer、Git、权限、敏感性与知识状态不应扩张或阻塞 Core 自主运行 MVP。
- **inputs_or_prerequisites**：`LOOP-CORE-05`；Personal-KB 当前外部项目发布、单 writer、validator、Query 与 stable 权限合同。
- **expected_output**：Requirement 级项目档案、source provenance/digest、evidence index、PKB publication receipt 与跨项目 Query 证据。
- **depends_on**：`LOOP-CORE-05`。
- **scope**：最终人类可读 LOOP 产物、与 Requirement 有 lineage 的 `.specify/**` 文档、机器证据索引、项目命名空间发布、幂等与失败恢复。
- **out_of_scope**：反向阻塞或重开已完成业务需求；无差别复制构建产物/原始大日志/敏感数据；自动写入全局知识/决策/Prompt/系统目录；自动 stable；绕过 Personal-KB 自身授权与 Git 边界。
- **completion_contract**：在 standing authorization、PKB Git 策略、历史回填范围和敏感性合同经双方规划确认前不得实施；完成后至少一个新 Requirement 的项目档案实际发布并可由现有只读 Query 命中。
- **continuity**：有界草案见 [LOOP-ADVANCED-04 规划](LOOP-ADVANCED-04-PLAN.md)；发布失败只影响 Advanced publication，不改变 Core 或业务 handoff 结果。
- **NOT_YET_AUTHORITATIVELY_DEFINED**：自动发布授权粒度、PKB commit/push 策略、历史 `library/.specify` 回填范围、raw evidence 大小/类型阈值。

## 6. Historical Capability Inventory

以下材料保留为历史事实与可能的复用候选，不再构成当前 Core 的顺序、依赖或完成声明：

| 历史 ID | 已有方向 | 对新 Roadmap 的位置 |
| --- | --- | --- |
| LOOP-FOUNDATION-00、D01～D06 | kernel、durable state/artifact、受控进程、隔离 workspace、patch、Codex adapter、测试/修复/审核 loop | C01～C05 的候选支撑，复用前以当时 Source 和验证事实确认 |
| D07 | recoverable Git delivery publisher | Advanced 02 的历史输入，不是 Core 依赖 |
| D08、D09、D10-A | 需求/方案编排、治理尾部、checkpoint | 可复用经验或支撑，不等于 C01～C05 已完成 |
| D10-B～D10-F、B01、PR #75 | 自动发布、恢复和旧 source-closure 路线的未决材料 | 保留历史，不阻塞 Core；本 Roadmap 不关闭、修改、合并或重写它们 |
| Advanced 11～14 | 旧的复杂需求、多仓、运营编号 | 由 C05、Advanced 01～03 以 Shared §14 合同重新表达（原由已取消的 C04 承担的部分随单轨裁决消解）；旧编号保留在 Git 历史 |

## 7. Controlled Replanning and Recovery Rules

1. C01～C05 的 objective、rationale、inputs、expected output、scope、out-of-scope、depends_on、completion contract、durable authorization/security constraint 或子项覆盖发生实质变化时，必须暂停受影响范围并进行用户授权的 Roadmap replanning。
2. 实现方式、内部代码结构、普通 bug fix、同合同修正、附加文件/测试、调试和重新验证不默认改变 Roadmap。
3. 每个子项第一次 material execution 前都必须用当时的 Source、父目标和完成合同做 decomposition assessment；若当前子项仍是一个完整可接受结果，可以保持不再拆分，不能为了形式制造 implementation-task 子项。
4. STATE 只能指向当前 `LOOP-CORE-00` 与一个 `DEFINED` 子项并记录动态 Gate/授权；它不能复制本节 Requirement body，不能以临时顺序篡改依赖，也不能把 `PLANNING_REQUIRED` Advanced 项作为执行入口。
5. 当前子项完成后，STATE 按本 Roadmap 的 `depends_on` 和完成证据推进到唯一符合条件的下一个 `DEFINED` 子项；若证据显示多个候选或覆盖缺口，则 `STOP_AND_REPORT`，不由会话临时决定路线。

## Revision Record

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 2.3.4 | 2026-08-27 | Amendment draft pointer | Decision-064 授权起草 C03-E v0.4.0-draft：拟拆分 E0 合同收口包与 E1～E4 runtime 实施包，在两者之间增加独立授权的 E2-P 三 Agent direct CLI 可达性预检，并保持 E5 production adapter canary 与完整自主 run 不变；A1 尚未接受，不产生任务规划、CLI 或实施授权。 |
| 2.3.3 | 2026-08-27 | Accepted baseline pointer | Decision-063 接受 C03-E 详细规划 v0.3.0 与 Q1～Q7 推荐值，并显式接受不执行本轮双 binding Solution Gate 的剩余风险；Task Gate、实施、Agent CLI、E0～E5 与下一 C05 均未授权。 |
| 2.3.2 | 2026-08-27 | User-directed priority correction | 将 PKB 项目产物投影从 Core C03-F 移至后期 `LOOP-ADVANCED-04`；Core 主线恢复为 C03-E 真实多 Agent 自主调度 → 下一条真实 C05，PKB 不阻塞全自主 MVP。 |
| 2.3.1 | 2026-08-27 | User-directed controlled replan | 新增 C03-F Personal-KB Project Artifact Projection：Requirement 最终文本产物与选定 `.specify/**` 文档进入 PKB 项目命名空间，原始机器证据以索引/digest 管理；自动内容不得进入全局知识或自动 stable，发布失败不回滚业务交付。 |
| 2.3.0 | 2026-08-27 | User-directed controlled replan | C05 真实需求证明人工七节点交付可用，但未证明 runtime 真实调用多 Agent CLI；按 C05 continuity 重开 C03，新增 C03-E Real Multi-Agent Autonomous Dispatch，并把下一条真实需求的零人工 Agent 切换与机器 execution journal 纳入 C05 完成合同。业务需求的线下视觉/SSO/后端联通验证不反向阻塞其 LOOP 收口。 |
| 2.2.3 | 2026-08-22 | Accepted baseline pointer | 阶段 2 A～G 已获 Current User 验收（PR #93 合入 `491c0e2`），scope 指针由"待审稿"更新为已验收实施规划基线；阶段 3 自 WP3.5-A 起逐包实施。WP3.5-A 执行状态、复审 finding 与收口边界仍由控制平面 STATE 与执行证据记录，本 Roadmap 不登记动态执行事实。 |
| 2.2.2 | 2026-08-22 | Accepted baseline / draft pointer | 为 C02-WP3.5 增加阶段 2 A～G 独立待审稿入口；仅改善规划可恢复性，不表示 Current User 已接受该稿，不产生任何实施或外部同步授权。 |
| 2.2.1 | 2026-08-22 | Accepted | 按 Decision-045 固化 Skill 收敛拓扑：七个 canonical 节点 Skill + 一个非节点通用文档 Skill `sdlc-docflow-writer`；`sdlc-gate-runner` 与 `sdlc-speckit-pipeline` 退役删除，前者的确定性准入、专业判断与 Delivery Tail 检查分别迁移到 LOOP runtime、节点 Skill 与 C03。 |
| 2.2.0 | 2026-08-21 | Accepted | 按 Decision-044 单轨裁决重排：LOOP-CORE-00/02 去除双轨路径表述并引入深度档位语义；C02 插入 WP3.5（Single-Rail Lifecycle Re-baseline）；C03 重写为 Single-Rail Skill Delivery 并保留 Delivery Tail；C04 取消（内容保留为历史记录）；C05 depends_on 重规划为仅 LOOP-CORE-03。 |
| 2.1.0 | 2026-08-16 | Accepted conformance rebaseline | 按 Shared PROJECT_CONTROL §14 建立 Core 父 Requirement 与 C01～C05 子项合同，补齐 Advanced 全字段和显式 Definition Gap，并将动态控制语义移出 Roadmap。 |
| 2.0.0 | 2026-08-16 | Superseded in working tree | 首次按 LOOP Core Contract 重排主线；其产品方向保留，但层级、字段完整性与 STATE 边界由 2.1.0 纠正。 |
| 1.x | 2026-08-15 及以前 | Historical | Foundation、D01～D10、Advanced 11～14 的旧阶段定义及 source-closure 叙事保留于 Git 历史与 control-plane 历史状态。 |
