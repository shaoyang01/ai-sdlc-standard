# G4-R6 / D-087 复审整改交付报告

> 文档性质：C03-E-PRE-RUN Gate G4 / Decision-087 第六轮复审（G4-R6，结论 FAIL）逐条整改的交付与验收证据。
> 整改基线：`b5a7e93`（分支 `feature/c03-e5-autonomous-acceptance`；复审对象 = G4-R5 修复轮 `f8fe344`，评审基线 `28c5114`）。
> 本轮变更：**代码 24 个文件（23 改 + 1 新增测试），+951/−299 行；另含本交付报告**（commit `5988014`，25 文件）。
> 结论先行：**12/12 条目（6 Blocker + 4 Major + 2 Minor）整改闭环**；全量验证结果见 §4，变异探测见 §5。

---

## 1. 逐条整改（R6-H1～H6 Blocker）

### 1.1 R6-H1｜v4 未受哈希保护的状态获得准入权威
- **整改**（按复审修改方案三条落地）：
  1. **新写入入口只接受 v5**：`appendCapabilityExecutionInTransaction`（全部能力事件写入的唯一汇合点，含 claim / 终态 / 带 findings 终态）拒绝 `schemaVersion !== 5` 的新写入（`INVALID_INPUT`）；幂等重放检查在其之前，历史事件重放不受影响。
  2. **历史 v4 不得产生 decisionStatus 权威**：消费端版本判定成为强制不变量——恢复 A1 投影（`loop-recovery.ts` `decisionAdmits`）与 `acceptFindingRisk` 判决查找均增加 `schemaVersion === LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION` 前置；同事务裁决入口（`validateRegistrationBindingAgainstEvent`）同校验。不存在任何默认 CONFIRMED 路径。
  3. **一致的版本判定**：三个消费点全部引用同一常量，注释即不变量（"v4 canonical form does not cover decisionStatus"）。
- **防回归**：`tests/loop-g4-r6-fix-round.test.ts` H1 块——v4 写入拒绝；**复审原始探针复现**（SQL 将 v5 verdict 行改写为 schema_version=4 + decision_status='CONFIRMED' 并按 v4 canonical 规则重算覆盖 hash）→ 恢复投影不产 DECIDED、不获准入；`acceptFindingRisk` 拒绝；v5 三档正例保留（矩阵 G4-01/02）。

### 1.2 R6-H2｜finding 接受依据与登记事务未绑定同一裁决事实
- **整改**（共享事务边界核对，三种表现全部闭合）：
  1. **登记证据 = 终态事件自身产物**：`validateRegistrationBindingAgainstEvent` 在任何写入（含重放路径）前强制 `registration.evidenceRef/Digest === 事件.unresolvedFindingsRef/Digest（否则 outputArtifactRef/Digest）`——"无关 human_action_required 文本作为接受依据"结构性不可能；
  2. **裁决 scope 派生自已验证事实**：PWR 接受的 scope 取事件自身 `decisionScopeId`（`${runId}:decision:${attempt}`），调用方 scope 必须与之相等，`unrelated-scope` 直接拒绝；接受证据强制等于裁决事件的 Gate Result blob（ref+digest 双绑定）；
  3. **真实 scan producer 核对**：同事务内校验存在 succeeded adversarial_scan 其 `unresolvedFindingsRef/Digest` 与被消费 ledger 完全一致，且 finding `sourceCapability === "solution-gate"`、evidence digest 与 ledger 一致——借引用的外来 finding 拒绝；
  4. **重放比较登记语义**：`verifyReplayedRegistrationInTransaction`——精确重放仅在 drafts（含合成 reflow 语义）与 ledger 接受结果（可接受者已 ACCEPTED_RISK 于本 scope、CRITICAL 仍 OPEN）与原事务一致时才是 no-op；改 CRITICAL、改 digest、改 scope 的冲突重放全部拒绝且零写入。
- **防回归**：fix-round H2 块 7 断言（合法 in-terminal PWR 接受继续成功且 scope/证据绑定裁决产物；借引用拒绝；无关依据拒绝；精确重放 no-op；三类冲突重放拒绝）。

### 1.3 R6-H3｜PASS 被等同于逐项修复复验，自动关闭 OPEN finding
- **整改**：**取消 PASS_RESOLVE 无条件批量关闭**（registration mode 收窄为 `PWR_ACCEPT` 唯一；store 删除 PASS_RESOLVE 分支与 verdict 产物 ledger 引用收集）。finding 关闭只走既有 `resolveFinding` 生命周期操作：验证者 = 发现节点（既有 G4-R5-H6 规则）、修复 revision = 其节点 CURRENT ACTIVE、证据 blob 校验（既有 §5.2 全部条款）；其余 OPEN finding 保持阻断。合成 reflow finding 不再因后续 PASS 自动销账。PWR_ACCEPT（Decision-086 判决即接受）保留不变。
- **防回归**：矩阵场景 2/5 重写（PASS 后 finding 仍 OPEN、run 停 BLOCKED；逐项关闭后才完成）；fix-round H3 块（重建设计 + 普通 PASS 后全部 OPEN、恢复投影 blocking、逐项合法关闭后完成）；矩阵场景 4（PWR 判决即接受不受影响）。

### 1.4 R6-H4｜blocked 重试同时落入两套互斥输入规则
- **整改**：chain validator 三分支互斥——`blockedRetryOk`（同点同 claim、attempt+1、输入三元组与 consumed ledger 不变）命中时**仅校验原 claim**，不再进入"新输入 = 前驱输出"的普通前进校验（该规则对 blocked 前驱恒假，是重试卡死根因）；普通前进与授权回流分支保持原语义。`runInvalidation` 不再统一排除 BLOCKED 终态（`execution/gateway.ts`）：blocked 终态携带的 finding 按来源类别正常传播 §5.4 失效边；恢复层由 plan 驱动——无 finding 的 blocked 同点恢复、含实现类 finding 的 blocked 先返工 implementation，blocked 产物仍永不准入下游（`nextStepEligibility=BLOCKED` 不变）。
- **防回归**：fix-round H4 块（无 finding 的 blocked 同点重试成功完成；含 IMPLEMENTATION finding 的 blocked 恢复指向 implementation 且其 current 被失效）；矩阵场景 1（blocked 零下游派发）不回归。

### 1.5 R6-H5｜返工计划使用 attempt 数量代理版本，并混用节点索引
- **整改**（按复审四条根因逐项）：
  1. **精确 producer execution 判定**：`planRegateFromFacts` 弃用 attempt 计数，改用 `GateRoundFacts`——最新 succeeded scan 的输入三元组是否等于 CURRENT design revision（ref+semver+digest）、最新 verdict 是否消费该 scan 的 ledger；"重建设计后必须重扫"与"scan 已最新则续审/重裁"均由 identity 判定；
  2. **统一执行点坐标**：blocked 点 scope 下界改用 `firstExecutionPointIndexForNode(earliestAffectedNodeId)`，节点索引不再与执行点索引比较；
  3. **store 与 recovery 共享同一归约**：新增共享 reducer `reduceBlockedPointIndexes`（最新终态/执行点）与 `reduceGateRoundFacts`，recovery 投影与 store 链上下文（raw reader 侧）消费同一实现，消除历史/最新两套事实口径；
  4. **最终目标确定后重新生成整个计划字段**：`nodesToRebuild`/`reusedUpstreamNodes`/`restartNode` 全部从最终 restartPoint 再生；
  5. **附带修复本轮发现的 livelock**：scan 已最新时 gate 节点重驱落在 verdict 点（续审或以新 attempt 重裁）——确定性 scan 对同一设计复现同一 ledger，重扫永不进展（端到端复现为 scan#2..#60 死循环，修复后 verdict#2 正常重裁）。
- **防回归**：fix-round H5 块 4 探针（复审原始两端到端探针的 plan 级等价：重建设计后重扫而非跳 verdict；code-review 范围外的 blocked implementation 点不再劫持计划且 `nodesToRebuild` 与最终目标一致；scope 内 blocked 点先行重驱 + 字段整体再生）；矩阵场景 2/5 端到端（重扫→续审→重裁链路）。

### 1.6 R6-H6｜生产隔离取决于可选 hook，未形成完整装配约束
- **整改**（不建第二套 factory，复用现有 workspace/production 组件）：
  1. **prepared workspace 成为 real 门必需路径**：`runProduction` 在 `capabilitySource === "real"` 时强制 `attemptWorkspaceRoot` 非空（prepareWorkspace+inspectWorkspace 必须接线）、路径存在且为目录、且**不得等于业务仓根**（`resolve` 对照 `identity.repositoryPath`）；调用方 resolver 被 prepared 路径覆盖绑定（既有机制），业务根回退不可能；
  2. **根目录副作用核验**：preflight snapshot 扩展 `sourceWipDigestSha256`；运行完成后（COMPLETED 场景）再次 inspect——source WIP digest 漂移或 base drift → 结果翻转为 `final_status=failed / chain_status=BLOCKED / blocking_reason_code=PRODUCTION_ISOLATION_VIOLATED`；
  3. **smoke 的 Agent runner 收紧**：`allowedCwdRoots` 移除业务根，仅保留 prepared worktree（先于 runner 构造 prepare）+ control root。
- **防回归**：矩阵场景 6 升级（G4-R6-M3 联动）——**适配器实际 cwd 断言**（staged prompt-input 落于 prepared worktree、业务根零 staged 泄漏）；缺 prepare / 悬空路径 / 业务根路径 / 运行后根目录副作用四个新负例全部 fail-closed；合法 prepared 正例继续成功。

## 2. 逐条整改（R6-M1～M4 Major）

### 2.1 R6-M1｜gateway 静默清除非 verdict 的 decision 声明
- **整改**：gateway 在记录任何产物前做角色专属字段校验——非 verdict dispatch 的 output 声明 `decisionStatus/decision_status/decisionDepth/decision_depth`（含显式 null，语义对齐 envelope 的 presence 规则）→ `GATE_DEPTH_INVALID` 明确 failed terminal，不再清除后记成功；verdict 分支三态组合规则不变，三层（envelope/gateway/journal）共用同一形状。
- **防回归**：矩阵 H1 篡改证据与 G4-01 正例不回归；fix-round H1 块覆盖 verdict 缺失声明拒绝（envelope 层单事实负例见 2.3）。

### 2.2 R6-M2｜PWR 风险只写进 delta，下游仍使用虚构占位引用
- **整改**：移除共享 guard 的独立接受引用门槛（`developmentPathEntryGuard` 不再要求 PWR 非空 refs——Decision-086 自动放行由 §4.3 ruling 承载，此门槛此前只可能被占位值满足）；移除 runtime 的 `"PWR-ACCEPTED"` 占位，改为从**已验证裁决事实**（verdict 事件的 decisionDelta blob，digest 校验后解析 `loop-decision-delta:v1`）传递真实 risk refs，空 refs 合法；读取失败回退为空而非虚构。不提前实现 G5 projector。
- **防回归**：`tests/loop-c03-delivery-tail.test.ts` 重写（空 refs PWR → allowed）；矩阵场景 4（delta 内真实 refs 随行 + A1 准入）不回归。

### 2.3 R6-M3｜测试反例前提不隔离，形成错误关闭证据
- **整改**（四项全部落地）：
  1. 缺 status 负例从完整正例派生、只改目标事实（depth 保留）——status 默认化变异不再被 depth 规则遮蔽；
  2. cross-node 负例改用 run 真实 requirementId（REQ-R1-001），身份前提隔离后按真实迁移守卫（ILLEGAL_TRANSITION）断言；
  3. 生产矩阵断言实际 cwd（staged inputs 落点）与业务根零副作用，新增四个隔离负例（见 1.6）；
  4. 嵌套 tsx 启动改为 `process.execPath --import tsx`（与本套件唯一受沙箱 IPC 影响的文件），原样可复现。

### 2.4 R6-M4｜crossBind 扩展了冻结状态映射
- **整改**：runtime 交叉绑定回归冻结 §6.2.4 逐字映射（ACTIVE↔current；STALE/SUPERSEDED↔stale）；manifest 行携带 `actionable` 即 `STATUS_DRIFT`——手动面 actionable 标注由其真实返工上下文（manual-runtime 语义合同 §5.4）判定，不由 runtime 的"非 ACTIVE 即 actionable"推断。同步协议：`ai-sdlc/loop-artifact-revision.md`（映射条款收敛）、`ai-sdlc/phase-gates.md` 与 `ai-sdlc/loop-recovery-protocol.md`（清除"improvement 不阻 closure"旧表述，对齐 G4-R5-H8 双因驱动语义）。
- **防回归**：`tests/loop-artifact-revision.test.ts` 断言反转（actionable → STATUS_DRIFT）。

## 3. 逐条整改（R6-L1～L2 Minor）

### 3.1 R6-L1｜退役协议仍可写入
- **整改**：`appendEvent` 拒绝 `kind === "risk_accepted"` 的新写入（`INVALID_INPUT`）；幂等重放分支保持在前，历史 journal 的 risk_accepted 事件仍可重放验证（历史兼容读取 ≠ 现役可写）。生产代码本就无该事件写入方（grep 佐证）；finding 的 RISK_ACCEPTANCE proof（合法生命周期记录）不受影响。
- **防回归**：fix-round H1 块 (a2) 断言。

### 3.2 R6-L2｜v8 preflight 返回 OK_V7
- **整改**：成功 verdict 改为版本中立 `OK_SUPPORTED`，detail 携带真实声明版本与构建支持上限（`declaredFormatVersion` 字段不变）；阻塞判定与消费者同步。
- **防回归**：`tests/loop-run-store-v2-cutover-preflight.test.ts` 断言 OK_SUPPORTED + `declaredFormatVersion === 8`。

## 4. 全量验证

| 验证 | 结果 |
| --- | --- |
| `npx --no-install tsc --noEmit` | 退出 0 |
| 全部 159 个测试文件逐文件串行（`node --import tsx` / bash） | **159/159 全绿，0 失败**（156 原有 + 本轮新增 `tests/loop-g4-r6-fix-round.test.ts`；含 shell 套件） |
| 六场景矩阵（`loop-d087-six-scenario-matrix`） | 42/0（含新增 cwd/隔离断言与 4 个 H6 负例） |
| G4-R6 整改反例矩阵（`loop-g4-r6-fix-round`，新增） | 26/0（H1×6、H2×7、H3×4、H4×4、H5×5 含 L1） |
| envelope | 44/0 |
| finding lifecycle | 351/0 |
| artifact revision | 237/0 |
| WP4 regate | 121 断言全过 |
| manual-chain fixture（shell） | 87/0 |
| run-release | 22/0 |
| Ruby validators（skill-contracts / compact-prompt / capability-metadata-chain） | 全部 ok |
| Control Plane `tools/validate_state.rb` | ok |

说明：复审实测矩阵中"155 通过 + 1 环境失败"的 `loop-run-from-intake.test.ts`（嵌套 tsx IPC EPERM）已随 R6-M3-4 修复，原样并入全绿。

## 5. 变异探测

对复审指出的存活变异与本轮关键不变量，在整改后代码上重放（变异→打靶→还原，`git diff` 复核零残留）：

| 变异 | 打靶结果 | 捕获断言 |
| --- | --- | --- |
| M-A：envelope 缺失 status 默认 CONFIRMED（复审存活变异） | **捕获**（envelope 红） | `verdict without decisionStatus (depth present — single-fact negative)`——R6-M3 单事实负例生效，不再被缺 depth 前提遮蔽 |
| M-B：v5 canonical hash 移除 decisionStatus | **捕获**（矩阵红） | H1 SQL 单列篡改探针（hash 漂移 → 全部读路径 fail-closed） |
| M-C：blocked 重试输入规则回退为"输入=前驱输出"（R6-H4 原缺陷） | **捕获**（fix-round 红） | h4a 同点 blocked 重驱断言 |
| M-D：移除恢复 A1 消费端版本判定（R6-H1 消费端） | **捕获**（fix-round 红） | v4 篡改列不获准入断言 |

复审 M3 的要点已落实：变异存活不再归因于"双层防御"，而是定位到具体未覆盖断言并以隔离前提的单事实负例补齐（M-A 即为原存活变异的定向捕获）。

## 6. 边界与遗留声明

- G3 冻结面（Skill/templates/publisher 现役文本）：本轮**零改动**（git status 无该面文件；`ai-sdlc/` 三份协议文档属合同/协议面，为 R6-M4 明令同步对象）。
- G5 边界（journal→manifest projector/parity）：未提前实现（与复审口径一致）。
- 真实 CLI / 真实冒烟：未执行（smoke 仅静态收紧 allowedCwdRoots；授权仍单列）。
- 本报告对应变更已以单 commit 提交于本分支；**push / Control Plane STATE 更新（分支+PR）留待 Current User 指示**。
