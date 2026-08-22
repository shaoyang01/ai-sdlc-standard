# C02-WP3.5 单轨生命周期重基线：阶段 2 影响分析与实施规划

> Version: 0.1.0
> Status: **DRAFT FOR CURRENT USER REVIEW**
> Date: 2026-08-22
> Scope: C02-WP3.5 阶段 2 输出 A～G；只形成合同与实施规划，不实施 runtime、Skill、registry、安装副本或外部同步
> Governing decisions: Decision-044、Decision-045
> Authorization boundary: 本文不是 C02-WP3.5 阶段 3、C02-WP4～WP6、C03、C05 或 Git/CP/PKB 发布授权

## 1. 目的与完成口径

Decision-044 已接受 canonical 生命周期从 v1 切换到 v2 单轨七节点链：

`requirement-intake → solution-design → solution-gate → task-planning → implementation → code-review → knowledge-sync`

Decision-045 已补齐现有 21 个 SDLC Skill 的逐项收敛映射，并裁决：

- 保留 `sdlc-docflow-writer`，但它只是 `non-node utility skill`；
- 删除 `sdlc-gate-runner` 与 `sdlc-speckit-pipeline`，必要职责分别迁入 LOOP runtime、canonical 节点 Skill 和 C03 Delivery Tail。

本文补齐 Decision-044 未保存的阶段 2 输出 A～G，使 fresh controller 不依赖历史聊天即可回答：改什么、为什么改、按什么顺序改、什么算完成、下一次授权最多能消费到哪里。

本文完成不等于方案已被 Current User 接受。只有 Current User 明确接受本稿后，才可把阶段 2 标记为 `ACCEPTED / COMPLETE`；任何实施仍须按 §8 的工作包逐包授权。

## 2. 不可变边界

1. 只有一条活跃生命周期和一组 canonical 节点 ID；不得保留 Direct/Speckit、旧五节点或 v1 七节点作为第二套运行时权威。
2. 每个 canonical 节点只有一个 canonical Skill；`sdlc-docflow-writer` 无节点状态、Gate、finding、generation 或推进权威。
3. `solution-gate` 的对抗扫描与正式裁决属于同一节点的两个执行角色，必须由不同 Agent binding 执行；不得拆成第八个节点，也不得由同一 Agent 自审自批。
4. 测试和线上反馈是外部 change input，经 `requirement-intake` 开启新 generation；`test-validation` 不再是 LOOP 节点。
5. WP1 change record 合同原位保留；WP2 artifact revision 与 WP3 finding/invalidation 合同按 v2 条款级升版，不削弱既有篡改、事务、CAS、proof/scope 与 fail-closed 保证。
6. 旧 v5 journal 不做语义重写；发现真实 v5 journal 必须停止并重新申请裁决。
7. `STORE_CORRUPT` 只表示已声明支持格式内的损坏；已知旧格式必须返回 `UNSUPPORTED_HISTORICAL_FORMAT`。
8. 单轨取消的是独立 Speckit 产物轨道和流程权威，不是被七节点吸收的需求澄清、方案深化、任务拆解、一致性审计、实现和知识对账能力。
9. Delivery Tail、delivery checkpoint 和 `READY_FOR_MANUAL_GIT_HANDOFF` 保留，但它们不成为第八个节点。
10. 本轮不修改 CP、PKB、全局 Skill 安装目录，不 commit/push。

## 3. 输出 A：v1 → v2 合同映射

### A1. 节点与执行角色映射

| 现有执行面 | v2 归属 | 迁移规则 |
| --- | --- | --- |
| `requirement-intake` | `requirement-intake` | ID 保留；吸收反馈分类，成为所有新需求、补充、变更、测试反馈和线上反馈的唯一入口。 |
| `tech-design` | `solution-design` | 重命名并吸收 specify/plan 的结构映射与深度深化能力；删除独立 Speckit spec/plan 轨道。 |
| `solution-challenge` | `solution-gate` / `adversarial_scan` | 不再是独立节点；产出首轮 Finding Ledger，不得给正式 Gate。 |
| `solution-review` | `solution-gate` / `formal_verdict` | 不再是独立节点；消费当前方案和扫描 ledger，给 Gate 与设计深度裁决。 |
| 无 canonical 节点 | `task-planning` | 新增节点；承接 tasks、analyze 和 checklist 的实现前规划与一致性审计。 |
| `implementation` | `implementation` | ID 保留；吸收 implementation recorder，节点成功必须同时形成实现输出和可核验证据。 |
| `code-review` | `code-review` | ID 保留；吸收 review normalizer，首轮审查与 closure review 共享同一节点合同。 |
| `test-validation` | 无节点 | 退役；可复现测试仍是 implementation、code-review、Delivery Tail 的证据，失败反馈作为 change input 回到 intake。 |
| 无 canonical 节点 | `knowledge-sync` | 新增节点；承接稳定事实筛选、代码/文档/长期知识 Reconcile 和已验证复用知识沉淀。 |

旧五节点 `requirement-summary / tech-design / review / implementation / validation` 分别映射到 `requirement-intake / solution-design / solution-gate / implementation / 外部证据与反馈入口`。`loop/registry/node_map.ts` 与 `sdlc_graph/**` 不得继续充当兼容层。

### A2. Binding 与 capability execution 合同

现有 binding registry 只支持 `(capability, agent)`，并要求每个 capability 恰有一个 enabled binding；该模型无法证明 `solution-gate` 的扫描和裁决由不同 Agent 执行。v2 固定为：

- 新增 `executionRole`：普通节点固定为 `primary`；`solution-gate` 固定需要 `adversarial_scan` 和 `formal_verdict` 两个角色；
- binding 唯一键升级为 `(capability, executionRole, agent)`，binding ID 同时包含三者；
- 每个必需 `(capability, executionRole)` 恰有一个 enabled binding；
- 同一 `solution-gate` revision 的两个角色必须满足 `executorAgent` 不同，runtime 在 dispatch 前和结果提升为 current 前各校验一次；
- capability execution event、恢复上下文和 artifact producer 绑定均记录 `executionRole`；只有 `formal_verdict` 可写 `PASS / FAIL / PASS_WITH_RISK`，扫描角色的 Gate 固定为 `NOT_APPLICABLE`；
- binding registry、node output contract、capability execution schema 均升版；不得用可选字符串在旧 schema 上静默兼容。

### A3. Finding 分类、来源与最早回退节点

v1 把 `category` 与 `sourceCapability` 绑定在同一矩阵行，导致代码审核发现的方案缺口只能被标成 REVIEW，也无法表达节点外反馈。v2 将“在哪里发现”与“问题属于哪一层”分离：

| v2 category | 允许的发现来源示例 | canonical earliest affected node | 路由说明 |
| --- | --- | --- | --- |
| `REQUIREMENT` | intake、任一下游节点 | `requirement-intake` | 目标、范围、验收或来源冲突；全链失效。 |
| `SOLUTION` | solution-design、solution-gate、task-planning、implementation、code-review | `solution-design` | 行为、架构、接口或约束缺口；不得只在代码层修补。 |
| `PLANNING` | task-planning、implementation、code-review | `task-planning` | 任务遗漏、顺序、依赖或验证计划错误；若根因是方案缺失，必须改标 `SOLUTION`。 |
| `IMPLEMENTATION` | implementation、code-review | `implementation` | 已批准方案内的实现错误、测试失败或证据缺失。 |
| `REVIEW` | code-review | `code-review` | 审查产物、范围或 closure protocol 本身不完整；代码缺陷不得借此留在 code-review。 |
| `KNOWLEDGE` | knowledge-sync | `knowledge-sync` | 稳定事实筛选、知识目标或对账证据错误；若发现上游事实错误，按根因改标更早 category。 |

v2 finding 仍要求非空 `sourceCapability` 和 current `sourceRevisionId`，但 category 不再由 source capability 推导。原始测试/线上反馈不是当前 run 的 finding：它先使用 WP1 既有 schema 形成 `changeKind=FEEDBACK_DRIVEN_CHANGE` 的 change record，并通过 `sourceRefs` / `triggerEvidence` 保存来源后进入 `requirement-intake`；intake 确认事实后，在新 generation 中按上表建立 finding 或直接形成新的 requirement revision。这样既保持 WP1 合同原位不变，也不制造 `test-validation` 伪节点。

多个 change/finding 同时存在时，runtime 取 canonical chain 中最早的 `earliestAffectedNodeId`。所有下游 current revision、Gate 和深度裁决在 finding 写入同一事务内失效；关闭 finding 不自动恢复资格，必须重建 current revision 并重新通过适用 Gate。

### A4. Artifact、Manifest 与稳定路径

v2 新 generation 使用以下唯一 active Artifact Index：

| Manifest node label | canonical node | stable path | 主 artifact kind |
| --- | --- | --- | --- |
| `00 需求资料` | `requirement-intake` | `library/{requirement_id}/00-需求资料/` | `requirement_summary`（保留） |
| `01 技术方案` | `solution-design` | `library/{requirement_id}/01-技术方案/` | `technical_design`（保留） |
| `02 方案审核` | `solution-gate` | `library/{requirement_id}/02-方案审核/` | `solution_review`（保留；内含扫描 ledger 引用、正式 verdict 和 depth decision） |
| `03 任务规划` | `task-planning` | `library/{requirement_id}/03-任务规划/` | 新增 `task_plan` |
| `04 实现记录` | `implementation` | `library/{requirement_id}/04-实现记录/` | 新增 `implementation_record`；代码 patch 仍用 `code_patch` |
| `05 代码审核` | `code-review` | `library/{requirement_id}/05-代码审核/` | `review_summary`（保留） |
| `06 知识同步` | `knowledge-sync` | `library/{requirement_id}/06-知识同步/` | 新增 `knowledge_sync_result` |

非节点产物不进入 node Artifact Index：

- 可复现测试、运行日志和外部系统回执写入 content-addressed evidence store，由相应节点 revision 或 Delivery Tail 引用；
- 原始反馈作为 intake source ref，必要时渲染到 `00-需求资料/反馈/`；
- `07-交付总结/` 与 delivery checkpoint 属于 C03 Delivery Tail，单独登记，不映射 node capability；
- Manifest 删除 Development Path Decision、pipeline state、specs run、sync source mode；新增 `Design Depth Decision`、current generation、七节点 current revision/Gate、Delivery Tail 和 external evidence references。

v1 的 `00/01/02` 语义和路径可直接作为历史输入引用，但只有 v2 capability execution 产生的 revision 才能成为 current。v1 的 `03-实现记录 / 04-代码审核 / 05-测试验收` 不自动重命名、不自动提升为 current；已有文件保持只读历史，若确需复用，必须在新 generation 中显式导入为 evidence 并重新生成 v2 revision。旧 journal 仍按 §6 直接拒绝，不因文件可读而恢复兼容执行。

## 4. 输出 B：C02-WP4～WP6 重基线

| Work Package | 保留 | 重写/新增 | 退役 |
| --- | --- | --- | --- |
| C02-WP4 Re-Gate Orchestration | earliest-node 选择、generation、上游只读复用、下游重建、bounded retry/pause/block | 按 v2 六类 finding 与 external feedback 入口路由；solution-gate 双角色；depth decision 绑定 formal verdict；knowledge-sync 恢复语义；收敛协议 | Direct/Speckit 选择、test-validation 回流、调用方自选历史 artifact |
| C02-WP5 Recovery and Wiring | current pointer、CAS、防迟到覆盖、binding/executor lineage、跨入口一致恢复 | 恢复七节点 current map、两个 solution-gate 角色、depth decision、Finding Ledger/closure round、knowledge-sync 与 v6 format；受支持入口只消费 runtime authority | `loop/registry/node_map.ts`、`sdlc_graph/**`、`runtime-capability-map` 的桥接权威和旧五节点恢复上下文 |
| C02-WP6 Validation Guards | plain-data/Proxy/accessor/Symbol 防护、事务/回滚/并发、stale/伪造/late-result fail-closed、默认 CI 与独立复审 | v2 chain 全矩阵、双角色不同 Agent、六类 finding、外部反馈重入、v5 preflight/拒绝、收敛协议、knowledge-sync 单轨场景 | 把旧断言简单删掉来获得绿灯；把历史成功、shadow 或 helper 测试当生产路径证明 |

WP4～WP6 的编号、material outcome 和独立授权边界不变。WP4 不能顺带接生产入口，WP5 不能用接线结果替代 WP6 对抗验收，WP6 不产生真实目标仓交付授权。

## 5. 输出 C：C03 Single-Rail Skill Delivery 拆分

Decision-045 的 21 项映射是固定输入。C03 实施按以下顺序进行，避免“先删旧 Skill、后发现能力丢失”：

1. **Canonical contract first**：创建七个 node Skill contract 和 `sdlc-docflow-writer` non-node contract；逐项列出旧 Skill 的输入、输出、阻塞条件、证据和副作用如何被吸收。
2. **Package construction**：创建七个新 Skill 包；`sdlc-solution-gate` 明确两个执行角色但仍是一个 Skill；`sdlc-docflow-writer` 删除节点推断和 Gate 推进语义，只保留独立生成及受控渲染/落盘/发布。
3. **Runtime/registry shadow verification**：新旧包并存期间只做等价性验证；canonical runtime 只识别七个新节点 Skill，不以旧包作为 fallback。
4. **Atomic registry cutover**：同一个变更内更新 `manifest.yaml`、`registry/skill-registry.md`、known-skill contracts、validator 和 runtime registry；七个 node ID 各有且只有一个 canonical Skill。
5. **Old package retirement**：等价性证据通过后删除 18 个已合并旧包、`sdlc-gate-runner` 和 `sdlc-speckit-pipeline`；保留 `sdlc-docflow-writer`。旧包名不得作为 alias、fallback 或第二套公开入口继续存在。
6. **Installation publication**：仓内合同通过后，按独立发布授权同步 `/Users/eric/.codex/skills` 的 21 个现有安装副本；当前核对未发现 `/Users/eric/.agents/skills` 下的 SDLC 安装副本。旧副本删除和新副本安装必须在同一发布批次核验，且新会话重新发现后才算部署成功。
7. **Delivery Tail integration**：runtime 负责确定性准入，节点 Skill 负责专业判断，C03 负责治理尾部与人工 Git handoff；不得复活 gate-runner。

Skill 完整映射以 Decision-045 为权威，本文不复制第二份可独立修改的映射表。

> **2026-08-22 补充裁决（WP3.5-A Round 2 复审）**：上述顺序方向确认不变；但当前 WP3.5-A 已删除仍被公开注册旧 Skill（`sdlc-speckit-pipeline`、`sdlc-speckit-sync` 等，见 `manifest.yaml`）消费的合同文件（library-driven-sync-runtime.md、speckit-project-bootstrap.md 等），形成中间态断链，登记为 open finding H3。“活动路径残留扫描清零”仅对部分目录成立；归档链接不能替代运行所需合同。该裁决同时明确：(1) 不得把 Skill 修复塞入 WP3.5-A；(2) C03-B 原子 cutover 必须在同一变更内完成「新包可用 → registry 切换 → 旧包及其依赖删除」；(3) 若要在 C03 前保持旧 Skill 可调用，必须先重新裁决当前删除顺序。H3 关闭前 WP3.5-A 不得收口。
>
> **Round 2 跟进（同日）**：H2（stablePath 结构校验）修复经独立复审通过并标记关闭，未发现新的 Critical/High。根因归并：节点产物与失效起点过去由调用方自由表达、缺少单一 canonical authority，已由固定映射与写入/读回/交叉绑定校验消除（H1/H2）；文档代码退役与公开 Skill 注册切换原先不在同一原子边界，属切换治理缺口——因此 H3 只能由 C03-B 的原子 cutover 消除，不能扩大为 WP3.5-A 内的临时补丁。下一有效边界：执行并独立复审 C03-B，届时做活动路径残留扫描与真实入口可调用性验证。

## 6. 输出 D：C04 与历史兼容处置

### D1. C04 状态

`LOOP-CORE-04` 保持 `CANCELLED`，不得以“兼容旧 Speckit”为理由恢复依赖。其可复用能力已映射到七节点；其流程、轨道、运行元数据和自动归档语义不进入 v2。

### D2. 文档处置规则

- active standard 中删除 Direct/Speckit、dual-rail、specs-run、sync source mode 和 pipeline authority；
- 已被七节点吸收的通用规则迁入对应 active standard 后，删除旧 active entrypoint；Git 历史即历史权威，不维持可被误调用的“旧标准副本”；
- `docs/NEW_RAIL_ENHANCED_SPECKIT_PIPELINE_SUMMARY.md` 移入 `docs/reports/archive/` 并加 Historical banner；
- Roadmap 内 C04 的 cancelled 段继续保留，明确不构成依赖或完成声明；
- 不为旧 Skill ID、旧 node ID、旧 Manifest 或 v5 journal 建 alias/fallback。

### D3. Journal cutover

v2 store 格式固定前进到 v6：

1. 新增错误码 `UNSUPPORTED_HISTORICAL_FORMAT` 与 `UNSUPPORTED_FUTURE_FORMAT`；
2. store 在任何 v1→v5 迁移或表创建前读取 `PRAGMA user_version`；已知 1～5 返回 historical 错误，格式高于 v6 返回 future 错误，v6 内 schema/hash 漂移才是 `STORE_CORRUPT`；
3. `user_version=0` 只有在库中不存在 LOOP 业务表时才可作为 fresh DB 初始化为 v6；存在旧表的 v0 DB 不得被误判 fresh；
4. 新增只读 `scripts/preflight-loop-run-store-v2-cutover.ts`，要求显式传入一个或多个受支持持久化根目录，不提供 HOME/仓库根目录默认扫描；输出固定 JSON/Markdown 清单和 digest，不修改文件；
5. preflight 发现 v1～v5、未知/不可读 SQLite 或无法确认 owner 的候选文件均返回非零；发现真实 v5 journal 的唯一下一步是 `STOP_AND_RE_RULE`；
6. preflight 结果作为 WP3.5 实施证据归档，不能用“代码搜索没有实例化”替代实际受支持根目录扫描。

## 7. 输出 E：精确改动清单

以下是后续实施的最低完整影响面；同一文件若同时出现于多组，以更严格处置为准。

### E1. 产品合同与 active standards

必须重写：

- `docs/LOOP_CORE_CONTRACT.md`
- `ai-sdlc/lifecycle.md`
- `ai-sdlc/node-capability-contract.md`
- `ai-sdlc/phase-gates.md`
- `ai-sdlc/artifact-flow.md`
- `ai-sdlc/artifact-storage.md`
- `ai-sdlc/artifact-versioning.md`
- `ai-sdlc/change-control.md`
- `ai-sdlc/complexity-routing.md`
- `ai-sdlc/development-path-governance.md`
- `ai-sdlc/loop-change-classification.md`
- `ai-sdlc/loop-artifact-revision.md`
- `ai-sdlc/loop-finding-lifecycle.md`
- `ai-sdlc/loop-recovery-protocol.md`
- `ai-sdlc/project-type-contract-artifact-matrix.md`
- `ai-sdlc/business-domain-compatible-update.md`
- `ai-sdlc/shared-business-domain-governance.md`
- `templates/artifact-manifest-template.md`
- `templates/gate-result-template.md`
- `manifest.yaml`

从 active entrypoints 退役，并在可复用条款迁移后删除或归档：

- `ai-sdlc/agents-rail-routing.md`
- `ai-sdlc/business-domain-sync-source-modes.md`
- `ai-sdlc/library-driven-sync-runtime.md`
- `ai-sdlc/specs-run-lifecycle.md`
- `ai-sdlc/specs-run-metadata-and-archive.md`
- `ai-sdlc/speckit-dual-rail-isolation.md`
- `ai-sdlc/speckit-document-generation-spec.md`
- `ai-sdlc/speckit-document-governance.md`
- `ai-sdlc/speckit-document-split.md`
- `ai-sdlc/speckit-project-bootstrap.md`
- `ai-sdlc/speckit-project-type-profiles.md`
- `ai-sdlc/speckit-skill-product-compatibility.md`
- `docs/NEW_RAIL_ENHANCED_SPECKIT_PIPELINE_SUMMARY.md`
- `templates/specs-run-metadata-template.yaml`
- `templates/specs-archive-cleanup-proposal-template.md`
- `templates/library-driven-sync-decision-template.md`

### E2. Runtime、schema 与旧执行面

必须升版/重写：

- `loop/types/index.ts`
- `core/node-capability-contracts.ts`
- `core/agent-capability-bindings.ts`
- `core/loop-capability-entry.ts`
- `core/loop-capability-execution.ts`
- `core/loop-artifact-revision.ts`
- `core/loop-finding-lifecycle.ts`
- `core/loop-run-store.ts`
- `core/loop-recovery.ts`
- `core/agent-policy-engine.ts`
- `core/agent-skill-registry.ts`
- `core/execution-context.ts`
- `core/runtime-executors.ts`
- `core/skill-flow-orchestrator.ts`
- `core/loop-requirement-design-orchestrator.ts`
- `core/loop-production-coordinator.ts`
- `execution/types.ts`
- `execution/gateway.ts`
- `execution/codex-real-dispatch-runner.ts`
- `execution/codex-real-dispatch-real-runner.ts`
- `loop/registry/agent_map.ts`
- `runtime.ts`

退役，不作为 v2 兼容层保留：

- `loop/registry/node_map.ts`
- `core/runtime-capability-map.ts`
- `core/node-artifacts.ts`
- `core/solution-challenge-state.ts`
- `core/state-machine-vm.ts` 中只服务旧图的分支；若无其他调用则整文件删除
- `sdlc_graph/types.ts`
- `sdlc_graph/graph.ts`
- `sdlc_graph/transitions.ts`
- `docflow/core/docflow_engine.ts` 的旧五节点推进权威
- `docflow/schemas/docflow.schema.json` 的旧 node enum
- `docflow/nodes/requirement-summary/**`
- `docflow/nodes/tech-design/**`
- `docflow/nodes/review/**`
- `docflow/nodes/implementation/**`
- `docflow/nodes/validation/**`

旧 DocFlow handler 中仍有价值的渲染逻辑只能迁入 node Skill 或 `sdlc-docflow-writer`；不得以保留 handler 为由继续保留第二套状态机。

### E3. Skill、合同、registry 与安装副本

新增目录与 known-skill contract：

- `skills/sdlc-requirement-intake/**`
- `skills/sdlc-solution-design/**`
- `skills/sdlc-solution-gate/**`
- `skills/sdlc-task-planning/**`
- `skills/sdlc-implementation/**`
- `skills/sdlc-code-review/**`
- `skills/sdlc-knowledge-sync/**`
- 对应 `skill-contracts/known-skills/*.md`

保留并重写：

- `skills/sdlc-docflow-writer/**`
- `skill-contracts/known-skills/sdlc-docflow-writer.md`

按 Decision-045 完成能力吸收后删除：其余 20 个现有 `skills/sdlc-*` 包及对应 known-skill contract，其中包括 `sdlc-gate-runner`、`sdlc-speckit-pipeline`。同步更新：

- `registry/skill-registry.md`
- `manifest.yaml`
- `scripts/validate-skill-contracts.rb`
- 删除 `scripts/validate-gate-runner-scenarios.rb` 及其 fixture/测试入口
- `core/agent-skill-registry.ts`
- `core/skill-flow-orchestrator.ts`

部署副本：当前仓外核对到 `/Users/eric/.codex/skills` 下 21 个现有 SDLC Skill；未核对到 `/Users/eric/.agents/skills` 下的 SDLC 副本。仓外副本不在 WP3.5 合同/运行时变更中修改，须由 C03 发布工作包独立授权并在新会话做发现验证。

### E4. 最低测试与 validator 改造面

必须重基线而非删除：

- `tests/node-capability-contract.test.ts`
- `tests/agent-capability-binding.test.ts`
- `tests/loop-capability-execution.test.ts`
- `tests/loop-artifact-revision.test.ts`
- `tests/loop-finding-lifecycle.test.ts`
- `tests/loop-change-classification.test.ts`
- `tests/loop-run-provenance.test.ts`
- `tests/loop-run-store.test.ts`
- `tests/loop-validation-guards.test.ts`
- `tests/loop-requirement-design-orchestrator.test.ts`
- `tests/loop-production-coordinator.test.ts`
- `tests/agent-skill-registry.test.ts`
- `tests/skill-flow-inventory.test.ts`
- `tests/skill-flow-orchestrator-contract.test.ts`
- `tests/skill-flow-runtime-integration-contract.test.ts`
- `tests/skill-flow-shadow-orchestrator.test.ts`
- `tests/minimal-end-to-end-sdlc-flow.test.ts`

新增至少三组独立测试文件：

- `tests/loop-single-rail-contract.test.ts`
- `tests/loop-run-store-v2-cutover-preflight.test.ts`
- `tests/loop-convergence-and-knowledge-sync.test.ts`

实施完成时执行 residue audit：active code/standard/manifest/registry 中不得再出现旧 node enum、`ExecutionMode`、`DIRECT_IMPLEMENTATION`、`SPECKIT_PIPELINE_REQUIRED`、Development Path Decision、specs-run authority、sync source mode 或被删除 Skill ID；archive、Decision 历史和明确的 negative fixture 可豁免，但必须由 allowlist 点名，禁止宽泛目录豁免。

## 8. 输出 F：后续独立授权工作包

| 顺序 | 工作包 | 可修改范围 | 完成合同 | 明确不包含 |
| --- | --- | --- | --- | --- |
| 1 | `WP3.5-A-CONTRACT-REBASELINE` | §7 E1、machine projection、测试断言 | v2 node/role/finding/artifact/Manifest/store cutover 合同一致；standards validator 通过 | runtime dispatch、Skill 包、安装副本 |
| 2 | `WP3.5-B-V2-MODEL-AND-STORE` | capability/binding/execution、artifact/finding、store v6、preflight | v2 schema/transaction/CAS/proof/scope 等价或更强；v5 明确拒绝；preflight 可执行 | 生产入口、旧执行面删除、Skill 发布 |
| 3 | `WP3.5-C-RUNTIME-CUTOVER` | orchestration/recovery/gateway、旧五节点与 graph 退役 | runtime 只有 v2 七节点权威；solution-gate 双 Agent；旧入口 fail-closed | C03 Skill 包和真实目标仓交付 |
| 4 | `C02-WP4` | earliest-node Re-Gate orchestration | 按 §4 WP4 与 §9 收敛场景通过 | WP5 生产接线 |
| 5 | `C02-WP5` | 首个受支持入口与跨入口恢复 | fresh/restart/replacement/late-result 均恢复唯一 next action | WP6 独立验收、C03 交付 |
| 6 | `C02-WP6` | 生产路径 validation guards/CI | §4 WP6 和 residue audit 全绿，独立完整范围复审 PASS | 自动宣告 C02/C03/C05 完成 |
| 7 | `C03-A-CANONICAL-SKILL-DELIVERY` | 七个 node Skill + docflow writer contract/package | Decision-045 能力逐项有落点，solution-gate role firewall 可验证 | 删除全局安装副本 |
| 8 | `C03-B-REGISTRY-AND-INSTALL-CUTOVER` | manifest/registry/validator/仓内旧包/全局安装副本 | 原子切换、旧 ID 无公开入口、新会话发现七加一拓扑 | runtime 新增第二套编排 |
| 9 | `C03-C-DELIVERY-TAIL-INTEGRATION` | governance tail/checkpoint/manual handoff | 无 gate-runner 仍可得到可恢复的 `READY_FOR_MANUAL_GIT_HANDOFF` 或诚实阻塞 | commit/push/PR/merge |
| 10 | `C05-REAL-SINGLE-REPO-ACCEPTANCE` | 一个经授权的真实复杂需求和目标仓 | 至少一次有效 Re-Gate、双角色 solution-gate、knowledge-sync、恢复与人工 handoff 全证据 | 以样例、历史 CI 或执行者自述代替真实验收 |

每个工作包只消费本行授权；前一包通过不自动授权后一包。若 WP3.5-B preflight 发现真实 v5 journal，立即停止，F 的剩余顺序失效，先产生新的治理裁决。

## 9. 输出 G：收敛协议与 knowledge-sync 验收场景

### G1. solution-gate / code-review 收敛协议

1. 每个 gate/review generation 的首轮建立不可变 `Finding Ledger baseline`，包含 finding ID、category、severity、evidence、source revision 和 earliest affected node。
2. 后续轮次是 closure review，只逐项验证 baseline finding 的修复证据；不得把“重新完整审一遍并不断发现一般改进”当作关闭条件。
3. closure review 新增 blocking finding 只有两种合法来源：本轮修复直接引入的回归，或足以证明 baseline/输入完整性失效的新证据。新增项必须记录 `introducedByRevisionId`、证据和因果说明；否则作为后续 improvement，不阻塞本轮 closure。
4. solution-gate 首轮先由 `adversarial_scan` binding 产出 ledger，再由不同 Agent 的 `formal_verdict` binding 裁决；角色相同、Agent 相同、输入 revision 不同或 ledger 非 current 均 fail-closed。
5. code-review 的 finding 按根因路由：方案缺口回 `solution-design`，任务缺口回 `task-planning`，实现缺陷回 `implementation`，审查合同自身缺口才留在 `code-review`。
6. closure round 复用当前 runtime 的受控 fix-round authority，不再建立第二个聊天计数器。达到批准上限仍有 blocking finding 时，只能 `BLOCKED_NEEDS_USER_DECISION`、有证据的风险接受或范围重置；不得自动 PASS。
7. `PASS_WITH_RISK` 只消费 current `ACCEPTED_RISK` proof；Critical 与未接受 High 始终阻塞。

最低验收场景：

- 同一 Agent 执行 solution-gate 两角色被拒绝；不同 Agent 且同一 current revision 可继续；
- closure review 关闭全部 baseline finding 后通过；关闭 finding 但下游未重建仍阻塞；
- 无因果证据的新 finding 不得无限重启 closure；有直接回归证据的新 High 必须进入 ledger 并回到正确最早节点；
- 轮次耗尽不伪造 PASS；风险接受 proof stale 后立即失效；
- code-review 发现方案缺口回 solution-design，而不是仅生成代码修复。

### G2. knowledge-sync 单轨合同

`knowledge-sync` 的唯一输入权威是当前 generation 的七节点 current revisions、已关闭/已接受 finding proof、代码/测试 evidence 和目标知识现状。`specs/**`、pipeline run、sync source mode 和历史聊天均不能成为并列 authority。

固定输出包含：`decision`（`NO_CHANGE / APPLY_LOCAL / PROPOSAL_ONLY / BLOCKED_CONFLICT`）、候选稳定事实、source revision IDs、目标路径、diff/proposal、entry coverage、reconcile result、未执行项、残余风险和 evidence digest。

最低验收场景：

- 无新增稳定事实：产生 `NO_CHANGE` current revision，有对账证据，不制造空写；
- 有新增稳定事实且本地写授权有效：`APPLY_LOCAL` 后文件内容、artifact digest、revision 和 Manifest cross-bind；
- 事实应更新但无写授权：`PROPOSAL_ONLY`；若该知识更新是当前需求完成义务则保持 BLOCKED，否则可由明确政策判定非阻塞，不能由 Agent 临场猜测；
- 新事实与既有知识冲突：`BLOCKED_CONFLICT`，保留双方证据；若根因是上游事实错误，按 category 回到更早节点；
- 输入含 stale revision、未关闭 blocking finding、旧 specs-run 或历史 sync 结果时 fail-closed；
- 原始测试/线上反馈被拒绝直接进入 knowledge-sync，必须先经 requirement-intake；只有已验证且可复用的规则/checklist/schema 改进可沉淀；
- `sdlc-docflow-writer` 只能渲染或发布 knowledge-sync 已确认内容，不能自行选择稳定事实或标记同步完成；
- 中断后由另一入口恢复时得到相同 current inputs 和唯一 next action，不重复写入或覆盖较新知识 revision。

## 10. 阶段 2 验收清单

- [x] A：节点、角色、finding、最早回退、artifact/Manifest 与历史 artifact 兼容映射已形成。
- [x] B：WP4～WP6 保留、重写、退役项已形成。
- [x] C：C03 Skill 交付顺序、registry/install cutover 与 Delivery Tail 职责已形成；逐项 Skill 映射引用 Decision-045。
- [x] D：C04 文档退役和 v5 journal 声明式 cutover 已形成。
- [x] E：active standards、runtime、旧执行面、Skill、registry、安装副本、测试与 validator 的最低完整改动清单已形成。
- [x] F：合同 → model/store → runtime → WP4～WP6 → Skill → Tail → 真实验证的独立授权序列已形成。
- [x] G：收敛协议和 knowledge-sync 迁移验收场景已形成。
- [ ] Current User 已审阅并接受阶段 2 输出。
- [ ] 任一实施工作包已获得授权。

当前合法下一步只有：Current User 审阅本文，提出修订或明确接受。不得因文档已落盘而开始 §8 任一实施工作包。

## 11. 核对依据

- `loop/types/index.ts`：v1 七节点 ID、旧 `ExecutionMode`。
- `core/node-capability-contracts.ts`：v1 节点输入输出、Gate 与路径决定。
- `core/agent-capability-bindings.ts`：现有 `(capability, agent)` 完整矩阵和每节点单 enabled binding 限制。
- `core/loop-capability-execution.ts`：现有 Gate capability 二元划分和 capability event。
- `core/loop-artifact-revision.ts`：现有 Gate 绑定、artifact kind 与 Manifest Index 映射。
- `core/loop-finding-lifecycle.ts`：现有五类 category/source capability 强绑定和线性下游失效计算。
- `core/loop-run-store.ts`：v5 store、v0→v5 迁移与 unknown format → `STORE_CORRUPT` 现状。
- `loop/registry/node_map.ts`、`sdlc_graph/**`、`core/runtime-capability-map.ts`：旧五节点/旧图执行权威。
- `ai-sdlc/artifact-storage.md`、`templates/artifact-manifest-template.md`、`ai-sdlc/phase-gates.md`：旧目录、Development Path 与 Gate Runner/Tail 合同。
- `manifest.yaml`、`registry/skill-registry.md`、21 个 `skills/sdlc-*` 与 known-skill contracts：当前 Skill 产品面。
- `/Users/eric/.codex/skills`、`/Users/eric/.agents/skills`：本机安装副本只读盘点。
