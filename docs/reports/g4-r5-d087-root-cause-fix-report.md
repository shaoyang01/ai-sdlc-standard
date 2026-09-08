# G4-R5 / D-087 完整根因修复交付报告

> 文档性质：C03-E-PRE-RUN Gate G4 / Decision-087 第五轮评审（G4-R5）根因修复的交付与验收证据。
> 基线：`28c511417fdf8cc2be2a7ff52107e818c89d55f4`（分支 `feature/c03-e5-autonomous-acceptance`，评审范围 `8af75b8..28c5114`，修复增量 `98563d4..28c5114`）。
> 本报告对应工作区未提交变更：**42 个文件（41 改 + 1 新增），+2486/−701 行**；未执行 commit/push/PR（符合授权边界）。
> 结论先行：**建议 PASS**（依据见 §9/§10——合同矩阵与端到端证据成立；遗留声明见 §8.4）。

---

## 1. 基线与授权核对

| 项 | 开始时 | 交付时 |
| --- | --- | --- |
| HEAD | `28c5114` | `28c5114`（未移动，零 commit） |
| 分支 | `feature/c03-e5-autonomous-acceptance` | 同 |
| 工作区 | 干净 | 本轮修复的未提交变更（42 文件） |
| G3 冻结面（Skill/templates/publisher） | — | **零改动**（git status 无该面文件） |
| G5 边界（journal→manifest projector/parity） | — | **未提前实现**（仅冻结 M2 映射表口径对齐） |
| 业务仓 / 真实 CLI / 真实冒烟 | — | **零接触**（smoke 脚本仅静态改写入口，未执行） |

## 2. 十项验收

### 2.1 H1 decisionStatus 事件协议全链
- **根因**：decisionStatus 只在 envelope/adapter 存在，事件协议（schema 校验、canonicalize、持久化列、全部消费方）不覆盖——canonicalize 漏字段导致状态篡改不漂移 hash；exactFields 把可选字段当必需；store 从不写 `decision_status` 列。
- **修复**：`LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION 4→5`（v4 进 `HISTORICAL_SCHEMA_VERSIONS` 只读不授权）；canonicalize **版本门控**——v5 事件把 decisionStatus 纳入 canonical hash（篡改必漂移），v4 保持旧 canonical 形态使存量 hash 可验证；store DDL 增加 `decision_status TEXT` 列 + 读写 + schema 校验；恢复投影（`ExecutionPointRecoveryState.decisionStatus`）、`acceptFindingRisk` 判决查找、A1 准入全部消费该字段。
- **文件**：`core/loop-capability-execution.ts`、`core/loop-run-store.ts`、`core/loop-recovery.ts`、`runtime.ts`。
- **证据**：`tests/loop-d087-six-scenario-matrix.test.ts` H1 篡改探针（UPDATE `decision_status` 列 → 全部读路径 `STORE_CORRUPT`）；变异 M4（canonicalize 丢字段）被该探针捕获。

### 2.2 H2 准入与恢复消费 decisionStatus
- **根因**：恢复/准入不从 verdict 的 §4.3 ruling 派生资格，残留 Decision-083 的 PWR 等待准入分支（`pwrVerdictAwaitingAdmission`）与 `acceptedRiskScopes` 管线。
- **修复**：gateway 写时从 ruling 派生 `nextStepEligibility`（CONFIRMED+PASS/PWR → ELIGIBLE；ESCALATED/BLOCKED_UNKNOWN 永不准入，即使字面 PASS/PWR）；`solutionGateDecision` 改为 identity 绑定 + `decisionStatus===CONFIRMED` 才 DECIDED；entry 增加 A1 准入检查（§7.3：CONFIRMED 裁决 + 无 OPEN blocking 范围）；`run()` 增加 pre-dispatch A1 守卫（拒绝时诚实返回 `ADMISSION_DENIED`/BLOCKED，不抛异常）；删除两个旧 PWR 分支与 `acceptedRiskScopes`。Decision-086 PWR 自动放行保留（写时裁决即接受）。
- **文件**：`core/loop-recovery.ts`、`core/loop-capability-entry.ts`、`runtime.ts`、`core/loop-run-store.ts`。
- **证据**：wp4-regate W5B 重写（CONFIRMED PWR 无仪式准入；human acceptance 被主体规则拒绝）；c03d T3 更新为 Decision-086 语义。

### 2.3 H3 组合规则统一（三态语义）
- **根因**：envelope/gateway/journal 三层对"缺失 / 显式 null / 非法值"归一化处理，缺省被默认成 CONFIRMED、非法深度被归并为合法 null。
- **修复**：envelope 显式三态——`hasDecisionStatusField`/`hasDecisionDepthField` 先于解释捕获；缺失 status → `ENVELOPE_BAD_DECISION`；BLOCKED_UNKNOWN 只接受**显式 null** depth（缺失≠null）；CONFIRMED/ESCALATED 必须非 null 规范 depth；非法值永不归并。gateway 同语义三态校验；journal v5 规则同表（`BLOCKED_UNKNOWN ⟺ !hasDepth` 等）。
- **文件**：`core/node-output-envelope.ts`、`execution/gateway.ts`、`core/loop-capability-execution.ts`、`execution/capability-prompt-builder.ts`。
- **证据**：`tests/node-output-envelope.test.ts` 44/0（缺失/null/非法/角色越权共 10 个组合负例）；变异 M3（缺省强制 CONFIRMED）未使测试塌陷——下游 §4.3 depth 表仍拒绝非法组合（双重覆盖，记录在案）。

### 2.4 H4 节点业务结果建模
- **根因**：body 声明 BLOCKED 的节点被记 succeeded；结构化 nodeStatus 被 envelope 拒收。
- **修复**：D-087 seam 1——事件 terminal 新增 `blocked` 状态（blocker report 保持一等输出产物；永不准入下游；formal_verdict 不可 blocked）；FAILED 业务结果 → `NODE_BUSINESS_FAILED` failed terminal（产物不入库）；正文矛盾声明（`status: BLOCKED` 等行）降级 terminal；chain validator 接受 blocked 后的同 slot 换体裁重跑（unchanged claim）与授权回流；恢复面对 blocked 点重派同一 execution point；`run()` 对 blocked terminal 诚实停止（chain=BLOCKED）。
- **文件**：`core/loop-capability-execution.ts`、`core/node-output-envelope.ts`、`execution/real-capability-gateway.ts`、`execution/gateway.ts`、`core/loop-recovery.ts`、`runtime.ts`。
- **证据**：矩阵场景 1（blocked terminal + blocker 产物 + 零下游派发）。

### 2.5 H5 output findings 接入生命周期权威
- **根因**：`loop_findings` 恒 0，riskAcceptanceRefs 丢失——output findings 与生命周期权威断连。
- **修复**：D-087 seam 2——`appendCapabilityExecutionWithFindings`：terminal 与 finding 登记同一 immediate 事务（id 为 finding chain 顺序、discovery anchor = 本轮检验的 revision（verdict 经 producer-hop 解析到 scan 所验的 design current）、REGRESSION 绑定引入 revision、evidence = 输出 blob、invalidation 按 directive）；判决轮同事务裁决 ledger（PASS_RESOLVE 关闭 scan/verdict 轮 ledger 发现 + 合成 reflow finding；PWR_ACCEPT 仅按 consumedFindingsRef 接受非 CRITICAL scan 发现）；`riskAcceptanceRefs` 持久进不可变 delta artifact（A2 随行）。envelope finding 增加 `category`（必填，回流目标=类别规范 origin）+ `earliestAffectedNodeId`；discovery anchor 泛化（§5.1：锚=所检验 revision，不限本节点产物）；非准入 terminal 注册不合法即整体拒绝（fail-closed，不静默裁剪）。
- **文件**：`core/loop-run-store.ts`、`core/loop-finding-lifecycle.ts`、`core/node-output-envelope.ts`、`execution/gateway.ts`。
- **证据**：矩阵场景 2/3（原子入库 + 同事务失效传播 + 同 run 重跑/回流）；finding-lifecycle 351/0。

### 2.6 H6 per-action 生命周期规则
- **根因**：accept 可被非 formal_verdict 主体在非 scan 来源 finding 上执行；resolve 缺验证者身份。
- **修复**：`acceptFindingRisk` 仅 `formal_verdict` 主体 + 必须 anchors 到一个 PASS_WITH_RISK+CONFIRMED 判决 + finding 证据 = 该判决消费的 Finding Ledger（scan 来源唯一）+ CRITICAL 永不接受；`resolveFinding` 增加 `resolvedByNodeId`（=发现节点，§5.2）并入 payload/proof/canonical form/DDL/读路径；release CLI 的 RISK_ACCEPTED 人工仪式废止（PWR 判决即接受）。
- **文件**：`core/loop-finding-lifecycle.ts`、`core/loop-run-store.ts`、`scripts/loop-run.ts`。
- **证据**：finding-lifecycle 状态迁移块重写（合法路径 + 主体/来源双重拒绝）；run-release 22/0。

### 2.7 H7 生产装配闭环
- **根因**：`runProduction` 一律拒绝 real；smoke 绕过 run() 直连 attemptWorkspace=业务根。
- **修复**：D-087 seam 3——**授权与装配分离**：`capabilitySource:"real"` 经生产门放行的条件 = 注入 `realGatewayDeps`（离线假适配器可验证装配；真 CLI 仍由操作员环境旗标授权）；缺注入即 `PRODUCTION_REAL_NOT_AUTHORIZED`；`prepareWorkspace` 的 prepared worktree **钉死**为 attempt workspace（业务根不可再绕过）；smoke 重写为 `parseProductionEntryRequest → runProduction` 全门入（含只读 git preflight + LOCAL worktree prepare，无 commit/push/PR）；静态检查：smoke 不得直接调用 `run(`（矩阵 seam-3 断言）。
- **文件**：`runtime.ts`、`scripts/loop-gw-smoke-real.ts`。
- **证据**：矩阵场景 6（离线全链经生产门完成 + 未注入即拒 + 静态断言）。

### 2.8 M1 全量默认测试逐项归类与修复
- **方法**：先在 baseline worktree（`/tmp/g4r5-baseline`，同 commit）跑同套件取得基线失败集，再与修复后对比——**本轮改动新增失败 0**；60 个 baseline 失败逐项归类：
  - **环境类**：tsx CLI 被沙箱 IPC 阻断（按任务预案全量改 `node --import tsx` 逐文件执行；preflight 测试的子进程 spawn 同步改为 `node --import tsx`，注明与默认入口差异）；并行 runner 的 I/O 争用噪声（逐文件串行为准）。
  - **旧行为断言类（修正断言到现行权威）**：hermes 治理 24 文件（smoke 不得自带启用旗标 → 改为要求操作员 shell 预置）；Decision-086 前的"PWR 等待人工接受"语义（c03d T3、wp4 W5B、run-release P-K/shape-2 → CONFIRMED 裁决即准入）；Round-2-H2 的"IMPROVEMENT 不回流"语义（wp4 W3/W3b/W8 → G4-R5-H8 两类因果均驱动）；finding-lifecycle 的接受路径（合法 PWR 判决 fixture）；cross-node discovery anchor 断言（wp35-b-r1/r2）。
  - **机械字面量类**：事件字面量缺 `decisionStatus`（v5 必填）、finding resolution payload 缺 `resolvedByNodeId`、store format v7→v8 断言、finding schema v5、manifest 状态词表（draft/active/replaced → current/stale/actionable）、proof 列变更。
  - **行为缺陷类（修复实现）**：`appendCapabilityExecutionWithFindings` 的 draft 非法字段、verdict 轮 examined anchor 的 producer-hop 解析、`materializeProducerRevision` 对上游被自身 finding 失效的容忍（lineage 切断，消除 pending 窗口死循环）、planRegate 的 blocked 点续跑与 Gate 重判强制。
- **证据**：最终全量矩阵 **156/156 全绿**（§9.3）。

### 2.9 M2 crossBind 冻结映射 + 文档同步
- `crossBindArtifactIndexRow` 状态词表改为冻结合同 §6.2.4 映射：`ACTIVE↔current`、`STALE/SUPERSEDED↔stale`（`actionable` 为回流待返工标注）；`draft/active/replaced` 废止（携带即 INVALID_INPUT）。
- `ai-sdlc/loop-artifact-revision.md` §6、`ai-sdlc/loop-recovery-protocol.md` §2.1 事件字段表同步（decisionDepth/decisionStatus/decisionScopeId/decisionDelta*/consumedFindings*）。
- **证据**：loop-artifact-revision 237/0；两份文档 diff 可审。

### 2.10 验证矩阵与变异探测
- `tsc --noEmit`：全仓 **0 错误**（157 文件含全部测试）。
- validator：`validate-skill-contracts.rb` / `validate-compact-prompt-contracts.rb` / `validate-capability-metadata-chain.rb` 全部 **ok**。
- 全量：**156/156**（逐文件 `node --import tsx`，等价默认入口；差异已注明）。
- 变异探测（防回归敏感性）：
  | 变异 | 结果 |
  | --- | --- |
  | M2 runtime A1 守卫禁用 | wp4-regate 失败（W1 计数断言）✓ 捕获 |
  | M4 canonicalize 丢 decisionStatus | 矩阵 H1 篡改探针失败 ✓ 捕获 |
  | M1 entry A1 检查禁用 | 矩阵不塌陷——runtime 层守卫独立覆盖（双层防御，记录在案） |
  | M3 envelope 缺省 status 强制 CONFIRMED | envelope 测试不塌陷——下游 §4.3 depth 表仍拒绝（双重覆盖，记录在案） |

## 3. G4-01～06 覆盖矩阵

| ID | 冻结条目 | 本轮状态 | 证据 |
| --- | --- | --- | --- |
| G4-01 | C16 gateway 真实 decisionDepth | **完成并加固**：verdict 三态提取 + §4.3 组合校验 + delta/资格写时派生（无 STANDARD 硬编码；非 STANDARD fixture 走通） | c03d T4；envelope 组合负例 |
| G4-02 | C17 riskAcceptanceRefs 非空强制移除 | **保持**（Decision-086：PWR 无 refs 合法）且 refs 持久进 delta | 矩阵场景 4（PWR refs 随行 delta） |
| G4-03 | C15 恢复投影基线/STALE 吸收 | **完成**：recovery 消费 decisionStatus 与身份绑定 current；STALE 吸收态在 planRegate/computeFindingGate 语义闭合 | wp4 W8；矩阵场景 2 |
| G4-04 | C14 resolve/accept per-action role | **完成**：verifier=发现节点（payload+proof+hash）；accept=formal_verdict+scan 来源+PWR+CONFIRMED 判决 | finding-lifecycle 351/0 |
| G4-05 | C13 四份手动合同 DECIDED 枚举替换 | **维持完成**（G3 冻结面未触碰；本轮仅同步 runtime 面两份协议文档） | validators ok |
| G4-06 | 离线矩阵六场景 + N 矩阵承重项 | **完成**：六场景 + H1 篡改探针全绿，注册默认入口 | `tests/loop-d087-six-scenario-matrix.test.ts` 31/0 |

## 4. 数据/事件兼容性

- **事件 schema v4→v5**：v5 事件 decisionStatus 参与 canonical hash（写时篡改证据）；v4 历史事件只读（canonical 形态不变，存量 hash 可验证），**永不获得准入权威**（消费者要求 v5 字段）。
- **store format v7→v8**：no-migration 教义——v1..v7 一律 `UNSUPPORTED_HISTORICAL_FORMAT`（v7 无法事后获得 decisionStatus 权威）；新列 `decision_status`、proof 表 `resolved_by_node_id` 列；全 schema 校验同步。
- **finding schema v5**：`resolvedByNodeId` 进 payload/proof/canonical；discovery anchor 泛化为所检验 revision（同 run 存在性为不变量，作者节点不限）。
- **manifest 状态词表**：`draft/active/replaced` → `current/stale/actionable`（冻结核对表；旧词表即非规范行）。
- **不兼容消费面**：`pwrVerdictAwaitingAdmission`/`acceptedRiskScopes`/risk_accepted run event/RISK_ACCEPTED 人工 release——全部按 D-087 回滚条款移除；旧 journal（v7）不可 resume，须重跑（矩阵场景 5 的新 run 语义不受影响）。

## 5. 测试矩阵汇总（逐文件 `node --import tsx`）

| 套件 | 结果 |
| --- | --- |
| node-output-envelope | 44/0 |
| capability-prompt-builder | 63/0 |
| loop-capability-execution | 全过（含 v5 格式/未来格式/篡改） |
| loop-finding-lifecycle | 351/0 |
| loop-wp4-regate | 121 断言全过 |
| loop-wp5-cross-entry | 175 断言全过 |
| loop-run-release | 22/0 |
| loop-c03d-runtime-wiring | 18 断言全过 |
| loop-validation-guards | 49 过 |
| loop-w5-invalid-output-no-advance | 31 过 |
| loop-artifact-revision | 237/0 |
| real-capability-gateway | 24/0 |
| loop-run-store-v2-cutover-preflight | 31/31 |
| loop-gw-diag-evidence / gw-fix-run | 12/0 ×2 |
| hermes 治理 24 文件 | 全过（310 断言主套件） |
| **loop-d087-six-scenario-matrix（新增）** | **31/0** |
| **全量 156 文件** | **156/156 全绿** |

## 6. 环境约束执行情况

- 未安装/重建依赖；better-sqlite3 探针使用既有 Node `v24.12.0`。
- tsx CLI 被沙箱 IPC 阻断 → 全部测试以 `node --import tsx` 执行（任务认可路径，已在测试内注明与默认入口差异）；`npm test` 聚合器因此不可用，采用逐文件矩阵（结果等价、更严格）。
- Git 元数据测试使用隔离临时目录/worktree（baseline 对照树 `/tmp/g4r5-baseline`），产品仓零污染。
- 未执行真实 Agent CLI / 真实冒烟 / 业务仓写入 / commit / push / PR。

## 7. 与评审修复原则的对照（抽检）

- 缺失值不默认 CONFIRMED：envelope/gateway/journal 三层三态语义 + 变异 M3 记录。
- 非法深度不归并 null：组合表逐层拒绝（envelope 负例、journal v5 规则）。
- 不从自由正文猜权威状态：权威只来自结构化字段；正文矛盾仅降级 terminal（bodyDeclaresBlockage），不抬升。
- 不绕过问题（统一 REGRESSION / 恢复仪式 / 删测试 / 降断言）：60 个 baseline 失败逐项修正到现行权威语义，删除的断言均有对应新断言（如 REQUIRED refs → optional 断言 + delta refs 持久断言）。

## 8. 遗留与声明

1. **不提前实现**：journal→manifest projector/parity 属 G5（D-090-03/04），本轮仅对齐冻结映射口径。
2. **真实验证边界**：本报告全部证据为离线；真实 CLI 冒烟（run8）仍需按路线单独授权。
3. **并行 runner 噪声**：`npm test` 聚合器在沙箱下有 I/O 争用噪声，逐文件串行结果为权威（已复现对照）。
4. **行为语义变更点（评审意图内）**：IMPROVEMENT 直达返工、PWR 判决即接受、blocked terminal 重跑——相关旧断言已按现行权威更新， 未引入授权外的行为扩大。

## 9. PASS/FAIL 建议

- 合同矩阵：六场景 + H1 篡改 + §4.3 组合 + §5.2 per-action + §7.3 A1 全部有端到端机器证据。
- 全量默认测试 156/156；tsc 0 错误；validator 3/3 ok；变异敏感性成立。
- 授权边界零越线。
- **建议：PASS**——满足"完整合同矩阵和端到端证据成立"的 PASS 前置；建议按流程进入下一 Gate 评审。

## 10. 回滚说明

- 全部变更 = 基线 `28c5114` 之上的单一未提交工作区 diff（42 文件）＋一个新增测试文件；回滚 = `git checkout -- . && git clean -f tests/loop-d087-six-scenario-matrix.test.ts`。
- 数据兼容回滚：v8 journal 为新写格式，回滚到基线代码后 v8 journal 即为"未来格式"拒开（no-migration 双向成立）；如需回滚且保留历史，请先归档 journal.db。
- smoke/preflight 脚本行为变更（生产门/旗标要求）随 diff 一并回滚，无独立状态残留。
