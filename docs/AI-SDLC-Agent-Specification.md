# AI-SDLC Agent Specification

> 导航：[架构基线](AI-SDLC-Architecture-Baseline.md) · [决策记录](AI-SDLC-Decision-Records.md) · [工作流设计](AI-SDLC-Workflow-Design.md) · [实施路线图](AI-SDLC-Implementation-Roadmap.md) · [当前状态](CURRENT_STATUS.md)

## 统一 Agent 模板

每个 Agent 定义必须包含：名称、目标、职责、输入、输出、Tools、显式 Skills、Artifact、限制、状态管理、错误/fallback 和审计要求。

共同硬约束：Agent 不拥有全局状态、不编排 Workflow、不直接修改 Graph、不决定下一节点或 `final_status`、不按 `(agent,node,requestType)` 隐式选择 Skill。状态由 Runtime/ExecutionState 管理；Agent 只返回当前能力结果。真实副作用由 Gateway 和 feature flag 约束。

## Requirement Agent

- 状态：【部分实现】；当前 `requirement-summary` 映射 Kimi，但无独立 Agent 类或服务。
- 目标：把原始需求转为可供设计使用的明确输入。
- 职责：需求理解、缺失信息标识、结构化摘要；不决定技术路线或下一节点。
- 输入：原始 requirement、已有 intake Artifact、Execution Context。
- 输出：requirement summary；缺失/冲突 diagnostics。
- Tools：Kimi CLI/Gateway、文档读取工具。
- Skills：全局入口只能是 `sdlc-requirement-normalizer`；当前 Runtime 未动态加载它。
- Artifact：`requirement_summary`，DocFlow 对应 `library/{id}/00-需求资料/`。
- 状态管理：仅消费当前上下文并返回结果；Runtime 写 trace/Artifact。
- 错误与 fallback：Kimi real dispatch 失败按 Gateway fallback；不得伪造已澄清需求。
- 审计：记录输入来源、执行 source、fallback、Agent、时间和 Artifact id。
- 代码依据：`runtime.ts`、`core/runtime-executors.ts`、`execution/kimi-gateway-real-dispatch.ts`、`skills/sdlc-requirement-normalizer/`。

## Design Agent

- 状态：【部分实现】；`tech-design` 默认映射 Kimi，方案能力由 executor/Skill 契约表达。
- 目标：从需求摘要生成当前 scope 的最小充分技术方案。
- 职责：设计组件、接口、风险和验收对应关系；响应 challenge/review feedback。
- 输入：requirement summary、历史 review/challenge 状态、相关 Artifact。
- 输出：tech design / `01-技术方案`。
- Tools：代码库搜索、文档工具、Kimi Gateway（当前节点无完整 real Skill 调用证据）。
- Skills：`sdlc-specification-writer`；必须显式调用，registry 当前为 metadata-only。
- Artifact：`tech_design`。
- 限制：不自行进入 challenge/review，不绕过 scope/phase，不决定 Direct/Speckit。
- 状态管理：Runtime 保存 challenge state 到 execution metadata；Agent 不持久化全局状态。
- 错误与 fallback：缺少关键输入时返回 diagnostics；不得用假设补成已确认事实。
- 审计：设计依据、未决项、版本/Artifact lineage 可追踪。
- 代码依据：`runtime.ts`、`core/context-builder.ts`、`core/agent-skill-registry.ts`、`skills/sdlc-specification-writer/`。

## Coding Agent

- 状态：【已实现】执行路径；当前 implementation 映射 Codex，不代表独立自治服务。
- 目标：按已评审方案产出可验证代码或结构化实现结果。
- 职责：Direct Implementation、fanout 或 Speckit 路径中的实现；提交 code patch Artifact。
- 输入：需求、设计、review、execution mode、现有 Artifact。
- 输出：代码/patch、execution result、fanout result 或 Speckit stages；标准 `implementation_outcome`。
- Tools：Codex CLI、代码编辑、测试工具、fanout executor。
- Skills：Direct 不绑定 Skill；Speckit 显式使用 `sdlc-speckit-pipeline` 及其子 Skill。
- Artifact：`code_patch`、`implementation_plan`、`fanout_result`。
- 限制：不选下一节点、不决定 `final_status`、不越过 Gateway 开关、不把 shadow patch 宣称真实实现。
- 状态管理：Runtime 管 implementation outcome、trace、Artifact 和后续 review loop。
- 错误与 fallback：real dispatch 失败遵循 Codex fallback policy；失败 outcome 为 `failed` 或受控 shadow 结果，以实际输出为准。
- 审计：记录 real/shadow source、feature flag 结果、fallback、命令/解析摘要和 Artifact。
- 代码依据：`core/runtime-executors.ts`、`execution/codex-real-dispatch-*.ts`、`tests/runtime-no-auto-skill-annotation.test.ts`。

## Review Agent

- 状态：【部分实现】；方案 review、code review adapter/loop 已有，正式 normalizer Gate 未接入。
- 目标：基于证据判断方案或代码是否满足当前 Gate。
- 职责：pre-implementation solution review；post-implementation reviewer 发现问题；输出明确 findings。
- 输入：方案、challenge report、patch、测试证据和相关 Artifact。
- 输出：PASS/FAIL、findings、review Artifact、开发路径建议（仅方案 reviewer 契约）。
- Tools：代码搜索、diff、测试结果读取、Gateway reviewer。
- Skills：pre-review 为 `sdlc-solution-reviewer`；post-review 目标链路的 `sdlc-code-review-normalizer` 只标准化真实 reviewer 输出，不发现问题。
- Artifact：`solution_review`、`code_review`。
- 限制：Challenger 不是最终 reviewer；normalizer 不新增 findings；Agent 不直接回跳设计或触发 bugfix。
- 状态管理：review retry 与 code-review/bugfix loop 由 Runtime 管理。
- 错误与 fallback：证据不足应失败或返回不确定性，不得把 unavailable 当 PASS。
- 审计：finding 需 severity、位置/证据、owner/handoff；保留原 reviewer 输出与标准化结果关联。
- 代码依据：`runtime.ts`、`execution/code-review-adapter.ts`、`skills/sdlc-solution-reviewer/`、`skills/sdlc-code-review-normalizer/`。

## Test Agent

- 状态：【部分实现】；validation 节点与 Hermes sidecar 存在，无完整独立测试 Agent。
- 目标：用可复现证据验证实现与验收标准。
- 职责：执行/汇总测试、验证 implementation output、分类测试反馈；不修改需求或代码。
- 输入：implementation Artifact、验收标准、环境与测试命令。
- 输出：validation report、测试通过/失败证据、分类建议。
- Tools：项目测试命令、Hermes sidecar、日志/Artifact 读取。
- Skills：按需 `sdlc-test-feedback-classifier`；反馈同步另由 `sdlc-test-feedback-sync`，二者当前未接入 Runtime Graph。
- Artifact：`validation_report`、DocFlow `05-测试验收`。
- 限制：Hermes sidecar 不改变主结果；未实际执行不得声称通过；不自行修复。
- 状态管理：Runtime 决定 validation 节点与最终聚合。
- 错误与 fallback：环境失败必须与产品失败区分，记录命令与错误。
- 审计：测试命令、环境、结果、时间、关联 patch/requirement。
- 代码依据：`core/runtime-executors.ts`、`execution/hermes-gateway-shadow-sidecar.ts`、`skills/sdlc-test-feedback-classifier/`。

## Knowledge Agent

- 状态：【设计基线】【尚未实现】；不得虚构模块或服务。
- 目标：将已验证、稳定、可复用事实提供给 Agent 并同步到长期知识。
- 职责：检索上下文、判断事实资格、冲突检测、授权后同步；不把聊天或未验证结果写为事实。
- 输入：已验证 Artifact、实现/评审/测试证据、目标知识路径。
- 输出：上下文包、同步 proposal/result、冲突与 lineage。
- Tools：Artifact/文档存储、检索；当前仅有 SQLite policy memory 和文件治理规则基础。
- Skills：`sdlc-speckit-sync`、`sdlc-speckit-code-doc-reconcile`，必须显式调用和获得写授权。
- Artifact：同步报告、drift matrix、business-domain 更新证据。
- 限制：不拥有 Workflow；不自动写 `.specify/business_domain/**`；`library/` 不是长期知识库。
- 状态管理：未来状态归 Control Plane/Knowledge Store；当前无统一实现。
- 错误与 fallback：目标、owner、证据或授权不明确时 proposal-only 或阻塞。
- 审计：来源、目标、授权、冲突、跳过项和 revision 全记录。
- 代码依据：`core/policy-memory-store.ts`、`skills/sdlc-speckit-sync/`、`skills/sdlc-speckit-code-doc-reconcile/`。

## Solution Challenger（Review 能力的前置 Skill）

它不是新增全局 Agent，而是 Kimi 可执行的显式 Skill 能力。只挑战当前 scope 的技术方案，遵守 scope/phase firewall、finding 数量上限、已有机制检索和两轮限制；不评商业价值、不做最终 Gate、不决定 Direct/Speckit。gateway shadow 的准确实现表述是“explicit skill binding + Challenger contract prompt”。代码依据：`core/runtime-executors.ts`、`core/solution-challenge-state.ts`、`skills/sdlc-solution-challenger/`。
