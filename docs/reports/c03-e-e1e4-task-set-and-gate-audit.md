# C03-E E1～E4 稳定任务集与 Task Gate 一致性审计

> **文档性质：事后重建（reconstructed after the fact）**
>
> 本文件不是开工前的原始 Task Gate 产物。E1～E4 实施于授权后在另一台机器上
> 启动，其事前任务集/Task Gate 未形成可恢复落盘记录（产品仓、CP、Exchange/PKB
> 均不可考）。按 Current User 2026-08-28 裁决「事后重建+追认」，本文件基于
> **已落盘事实**重建稳定任务集并补做 §14.2 第 6/7 条审计；它不伪装为事前产物。
> Task Gate 已经 Current User 于 **Decision-072（2026-08-28）事后追认 PASS**；
> 本文件保留事后重建形态，追认裁决正文以 Decision-072 为准。
>
> 重建基线：分支 `feature/c03-e1-e4-runtime-implementation` @ `b842b18`；
> 规划基线 `docs/LOOP-CORE-C03-E-PLAN.md` v0.4.0；授权 Decision-071。

## 1. Task Gate 七条件核验（规划 §14.2）

| # | 条件 | 证据 | 状态 |
| --- | --- | --- | --- |
| 1 | 计划 ACCEPTED | Decision-063（v0.3.0） | ✅ |
| 2 | Q1～Q7 全部裁决 | Decision-063 接受全部推荐值，Q6 经 Decision-064/A1 修订 | ✅ |
| 3 | Solution Gate PASS 或明确风险接受 | Decision-063 Current User 风险接受（本轮不执行双 binding Solution Gate） | ✅（残余风险已接受） |
| 4 | v0.4.0 A1 修订经 Current User 接受 | Decision-064 | ✅ |
| 5a | E0 独立收口 | Decision-068（复审 R2 PASS，PR#123 merge `158536b`） | ✅ |
| 5b | E2-P 单独授权且三 Agent 全 PASS | Decision-069/070（Kimi 0.38.0 / Codex 0.150.1 / Hermes 0.20.5） | ✅ |
| 5c | E1～E4 实施包授权另行成立 | Decision-071 `E1_E4_RUNTIME_IMPLEMENTATION` | ✅ |
| 6 | 稳定任务集（目标/依赖/source trace/verification/exclusions） | 本文件 §2 | ✅（事后重建，Decision-072 事后追认 PASS） |
| 7 | 一致性审计无 stale artifact/未接受风险/readiness blocker | 本文件 §3 | ⚠️ 3 项 blocker 已识别，均不阻断本追认、阻断后续阶段（见 §3.4） |

## 2. 稳定任务集

规则：stable ID / 可执行动作 / 目标面 / 依赖 / source trace / verification。
状态以 `b842b18` 已落盘事实为准；DONE 附实现提交，PENDING 为收口前剩余工作。

### E1 — Production Entry and Run Ownership（规划 §6 E1）

| ID | 动作 | 目标面 | 依赖 | Source trace | 状态/证据 | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| E1-T1 | production request v1 fail-closed 解析（exact schema、未知字段/非法路径 spawn 前拒绝） | `core/loop-production-entry.ts`（232 行） | — | 规划 §6 E1；Decision A | DONE `3da342b` | `tests/loop-production-entry.test.ts` 46 断言 |
| E1-T2 | canonical 节点 prompt builder（哨兵/字段名单一事实源） | `execution/capability-prompt-builder.ts`（127 行） | E3-T1 | Decision A（2026-08-28） | DONE `eb8b5c5` | `tests/capability-prompt-builder.test.ts` 33 断言 |
| E1-T3 | 本地入口 `scripts/loop-run.ts`：仅 `--request-file`/`--resume`/`--capability-source`/`--help`，closed 字段集，无 token/cmd/argv/env 承载 | `scripts/loop-run.ts`（新增） | E1-T1,T4,E2-T6 | 规划 §6 E1；HANDOFF §4.3；wiring §4 | ✅ **PASS（W3，独立复审 `598cc72`，零阻塞；建议 S1 已并入已知错误桶）**：纯封闭 argv parser（未知 flag/位置参/缺值/重复/坏 source 全拒、注入形值保持惰性字符串），读封闭 request→parse identity→受控读 sourceFiles→只读 git inspect（不建 worktree、不 spawn Agent）→runProduction→封闭结果集；CLI 烟囱 help=0/拒绝=1 | 契约测试：注入面 fuzz 全拒绝（14 断言） |
| E1-T4 | `runtime.ts` 消费真实 `LoopRunIdentity` 与注入 gateway；现 `run()` 标记 test-only/非生产 | `runtime.ts`（冻结面） | E2-T6 | 规划 §6 E1；wiring §5 | ✅ **PASS（W3，独立复审 `598cc72`，零阻塞；建议 S2 已补自建 stores 门测）**：新增薄生产门 `runProduction`（只认 parse 产物、只读 preflight 拦 base drift/dirty、拒 real、复用同一 run 内核不复制）；`productionIdentity ?? local 占位` 并经 journal 复验+一致性 fail-closed；scratch repo mkdir 仅自建 stores 分支；非生产 run() 行为不变（141 文件 0 失败） | 既有套件回归 0 差异 + 生产门 18 断言 |
| E1-T5 | production-entry 契约与 resume 恢复测试 | `tests/` | E1-T3,T4 | 规划 §6 E1 验收 | PARTIAL（解析侧 46 断言已 DONE；resume 随 T3/T4） | fail-closed 分支全覆盖 |

### E2 — Real CLI Adapters and Production Gateway（规划 §6 E2）

| ID | 动作 | 目标面 | 依赖 | Source trace | 状态/证据 | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| E2-T1 | 三 provider profile + 能力矩阵 + Q4/§9 bounds（绑定 E2-P 实测 identity/version/transport） | `execution/agent-cli-profile.ts`（301 行） | E2-P PASS | 规划 §6 E2；D-070 实测版本 | DONE `f5c4559` | `tests/agent-cli-profile.test.ts` 51 断言 |
| E2-T2 | 统一 real-capability-adapter（invocation/result envelope）+ fake runner 矩阵 | `execution/real-capability-adapter.ts`（370 行） | E2-T1 | 规划 §6 E2 | DONE `898026c` | `tests/real-capability-adapter.test.ts` 40 断言 |
| E2-T3 | runner per-attempt 上限 10→30min（默认 120s 不变，仅显式 profile 提升） | `core/loop-posix-process-runner.ts`（+4/-2） | — | 规划 §9；Q4 | DONE `a135a36` | `tests/loop-posix-runner-timeout-bound.test.ts` 5 断言 |
| E2-T4 | `RealCapabilityGateway`：只 override `executePrimary`，复用基类唯一 tracing 状态机，不造第二套 | `execution/real-capability-gateway.ts`（203 行）；`execution/gateway.ts` executePrimary private→protected（+4/-1，零行为变化） | E2-T2,E3-T1,E1-T2 | Decision A | DONE `c3abf17` | `tests/real-capability-gateway.test.ts` 18 断言 |
| E2-T5 | argv 注入闭合：`shell:false`、executable allowlist、动态需求只走 stdin；13 个绕过变体全拦 | E2-T1/T2 内 | E2-T2 | R1 B1 → `23f9880`，R2 PASS | DONE | 13 绕过变体负向测试；argv 零动态内容审计 |
| E2-T6 | production factory 接线 + real-vs-deterministic 选择开关（**默认 deterministic shadow，不得静默切 real**） | 开关工厂 `execution/capability-gateway-source.ts` + `runtime.ts` 装配点（路径 A 的 autonomous-loop/coordinator 按方法二 W4 冻结、不接入） | E2-T4 | 规划 §6 E2；HANDOFF §4.1-4.2；wiring §3 | ✅ **PASS（W2，独立复审 `b94a382`，零阻塞零建议）**：`199aeea` 单一工厂 `createCapabilityGateway`，deterministic 逐字复用、real 三条件（显式 source + Q1 + realDeps）fail-closed 绝不回落 shadow，选择逻辑唯一权威、版本单一真值；反向探针 + 139 文件 0 失败 / 16 断言独立确认，默认零行为变化，real 仍休眠（W3 loop-run）、D-071 保持 | 选择开关默认值断言；shadow 回归全绿 |
| E2-T7 | 淘汰生产路径三个自定义 spawn runner；Kimi/Hermes sidecar 归档（不被 factory 选中）；Codex `shadow_fallback` 改 fail-closed | `execution/` 旧 runner | E2-T6 | 规划 §6 E2；wiring §7 | ✅ **PASS（W4 独立复审 `f10aef1`，零阻塞）**：三个自定义 spawn runner 精确对象由引用图闭合（`docs/reports/c03-e-w4-spawn-reference-graph.md` §6：Codex/Kimi/Hermes）；路径 A 四编排 + L0/L1 共 17 文件加 FROZEN banner；validator B-7 机械锁定新装配（factory/CLI/kernel）零 import 冻结符号（双向探针已证）。**物理淘汰、sidecar 归档移除、shadow_fallback fail-closed 属 E5 canary 后的删除批次，本期不删不改（wiring §7 物理删除条件）** | production factory 不引用归档符号（B-7 机械锁定 + 双向探针） |
| E2-T8 | Q1 binding 对齐：intake/design/task-planning/knowledge-sync→kimi，scan+implementation→codex，verdict+code-review→hermes | binding registry | E2-T6 | Q1 裁决；HANDOFF §3 | ✅ **PASS（W1，独立复审 R2 `a698808`）**：`7f36b8d` 实现 + `10b798c` 修 R1 阻塞 F1/F2；R2 反向探针 + ci-standards 6 步 + tsc + 全套件 138 文件 0 失败独立确认，I1～I5 不变量保持；进 W2 | 7×3 矩阵与 Q1 逐格断言 |

### E3 — Output Validation / Auto-Progression / Re-Gate（规划 §6 E3）

| ID | 动作 | 目标面 | 依赖 | Source trace | 状态/证据 | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| E3-T1 | node output envelope：哨兵 `<!--@loop-output-begin/end-->` 唯一 I/O 契约；role 感知——仅 formal_verdict 可出 verdict，adversarial_scan 强制 NOT_APPLICABLE 但必留 findings ledger | `core/node-output-envelope.ts`（230 行） | — | Decision A；规划 §6 E3 | DONE `494e5de`+`c3abf17` | `tests/node-output-envelope.test.ts` 24 断言 |
| E3-T2 | 节点输出校验/自动推进/Re-Gate 随 gateway 接线固化（invalid/旧 input/错 generation/伪造 digest/错 Agent/双 Gate role/越界写一律不推进） | gateway + coordinator | E2-T6 | 规划 §6 E3 验收 | **W5 ✅ PASS（独立复审零阻塞，`eac94c9`；R2 两观察项已清，31 断言）**：`tests/loop-w5-invalid-output-no-advance.test.ts`，九类（invalid output／旧 input／错 generation／伪造 digest／错 Agent／同 Agent 双 Gate role／stale revision／未闭合 finding／越界写）逐类经真实 entry→gateway→store 链证明「四不」（不成功、无 effective artifact、不前进到下一节点、落稳定可判定码）；纯新增测试、零生产改动，四向反向探针验证 | 九类无效输出负向 e2e（31 断言全绿、复审 PASS） |

### E4 — Durable Recovery and Human Boundary（规划 §6 E4）

| ID | 动作 | 目标面 | 依赖 | Source trace | 状态 | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| E4-T1 | process evidence artifact：invocation/process/staging/promotion/human-action 固定字段，append/readback 校验 | `core/loop-capability-execution.ts`（schema 字段+校验）、`core/loop-run-store.ts`（列/读写/canonical hash）、`core/loop-recovery.ts`、gateway | E2-T6 | 规划 §6 E4 | **W6a ✅ PASS（独立复审零阻塞，`5b1855a`，68 断言；CP pass-state PR #22）**：10 个 nullable 字段（processInvocationDigest/processExitCode/processSignal/processDurationMs/processTruncated、staging pair、promotion pair、humanActionRef）进 v7 事件、journal 列与 canonical hash；validator 与 store 写门双层 fail-closed（exit 0..255、signal 封闭枚举、exit/signal 互斥、duration 正整数、ref/digest 成对且匹配、promotion 需先 staging、started 零证据、succeeded 真进程必 exit 0、failed 无 promotion）；确定性 shadow 事件全 null | `tests/loop-w6a-process-evidence-recovery.test.ts` round-trip/12 类非法双层拒绝/hash 防分叉 |
| E4-T2 | recovery 分类：safe retry / verify staged / cleanup required / human input / terminal failed-blocked | `core/loop-recovery.ts`（纯函数 `classifyCapabilityRecovery` + `RunRecoveryContext.recoveryClassification`） | E4-T1 | 规划 §6 E4 | **W6a ✅ PASS（独立复审零阻塞，`5b1855a`；P1–P5 反向探针实证；CP pass-state PR #22）**：五分类 + null（COMPLETED/未派发）单一机器可读出口；优先级 human＞verify-staged＞cleanup＞safe-retry＞terminal；仅当真进程跑过（invocation 非 null）且无 staging 才 CLEANUP_REQUIRED，确定性 shadow retryable 失败仍 SAFE_RETRY（旧"无副作用即可重试"仅在无真进程时成立）；pending revision 窗口归 SAFE_RETRY | 同文件纯函数 10 例 + recoverRunContext 端到端 3 例 |
| E4-T3 | resume lease 覆盖 recovery→claim→spawn→terminal/promotion 窗口 | `core/loop-resume-lock.ts:130` `withResumeLease` + `:205` `isResumeLeaseHeld`；`core/loop-capability-entry.ts:153`/`:212` 可选守卫；`runtime.ts:386` 装配、`:397` lease | E4-T1、E4-T2 | 规划 §6 E4 | **W6b1 ✅ PASS（独立复审零阻塞，`5f2bcd8`，27 断言）**：取证确认窗口**结构性已覆盖**（`runProduction` 无条件委托 `run()`，两个 `entry.execute` 均在 lease 闭包内，`claimNextCapabilityExecution` 生产调用点仅两处且只能经 entry 到达），本波把它变成**强制**：进入窗口前 fail-closed `STORE_BUSY`（位于 recovery/bootstrap/claim 全部之前）；lease 身份按 `leasePathFor` 重算，异 journal 不算持有；并发 resume 至多一个 spawn（S12）。**复审建议 S1/S2 已补**（Current User 裁决"现在补"）：`scripts/validate-skill-contracts.rb` 新增 **B-8 装配机械锁定**（删装配行 → 校验器 exit=1；此前 P2 实证全套件不捕获）、T6 扩展覆盖非字符串 `as any`（`123`/`{}`/`null`/`true`/`[]`） | 并发 claim/spawn 互斥（T7）+ 零持久化写入（T1）+ 异 journal 拒绝（T4）+ 反向探针 P1–P6（P6 证明 `busy_timeout=0` 必须保持：改 5000 时 loser 的 BEGIN 在 SQLite C 层同步阻塞并冻结事件循环 6s） |
| E4-T4 | `human_action_required` 机器可读 artifact，reason 仅限 6 个合法码；`SWITCH_AGENT_REQUIRED`/`SHADOW_FALLBACK_REQUIRED` 非法 | 新增 artifact kind `human_action_required`：`core/loop-artifact-store.ts:14` 联合类型 **+ `:34` LOOP_ARTIFACT_KINDS 数组（两处必须同步）**；对接 `core/loop-capability-execution.ts:102` 的 `humanActionRef` 锚点 | E4-T1 | 规划 §6 E4 | **W6b2 ✅ PASS（独立复审零阻塞，`99c9df3`，82 断言；CP pass-state PR #24）**：新增 kind 同步**三处**（`loop-artifact-store.ts:14` 联合类型 + `:34` KINDS 数组 + `loop-artifact-revision.ts` `LOOP_ARTIFACT_REVISION_KINDS`——第三处由编译期穷尽性检查暴露，非裁决时预估的两处）；6 合法码 allowlist，`SWITCH_AGENT_REQUIRED`／`SHADOW_FALLBACK_REQUIRED` 非法；固定键序确定 digest 由 store enforce；**ref kind 强制只放读回路径**（`isHumanActionRequiredRef`），事件层保持不透明——取证确认生产代码无任何非 null `humanActionRef` 赋值（gateway 五处硬编码 null），事件层强制需改 `loop-capability-execution.ts:373` 并重写 W6a 已冻结的 T2-A7/A10，构成推翻已 PASS 波次（复审裁决二.a 认可）；`Readonly<union>` 破坏判别联合 → 改具名成员 + 导出 `isFailure`。**建议项（不阻塞，本波未做）**：F1＝T7 异 kind fixture 改存合法 human-action 内容以真正钉住前置正则（P4 未变红，因 fixture 本身非 JSON，前置检查被 parse 层掩盖）；S2＝`LOOP_ARTIFACT_REVISION_KINDS` 名实已分离（兼任 canonical-kind 注册表），未来可拆分数组。**两条建议项均已在 W6b3 顺手清掉（见 E4-T5 行）；本行 PASS 结论与 82 断言基线不变（F1 后为 83）** | `tests/loop-w6b2-human-action-artifact.test.ts` 82 断言（6 码接受 + 2 非法码拒绝 + 大小写变体 + digest 不匹配拒绝 + 异 kind 读回拒绝）+ 反向探针 P1–P7（P7 证实 tsc 漂移检查真实承载；P4 未变红 → 记为 F1） |
| E4-T5 | attempt workspace 清理/保留：成功提升、失败隔离、未知副作用保留证据并阻塞 | `core/loop-git-workspace.ts` cleanup options `:88`／result `:93`／manager `:224` | E4-T1、E4-T2（CLEANUP_REQUIRED 驱动） | 规划 §6 E4 | **W6b3：实现完成 `02b642a`（35 断言）→ 独立复审 NOT_CLOSED（1 项阻塞 B1）→ B1 已修复 `05d12d2`（41 断言）→ **B1 聚焦复审 CLOSED（零阻塞）→ W6b3 ✅ PASS，CP pass-state PR #25 已合并（main `2d2ff53`）。**W6b4（E4-T5 收口）：`1605a84` 把 committed diff 门控到 `allowedPaths !== null`，45 断言，聚焦复审待回**。
**B1 聚焦复审结论（2026-08-29，零阻塞）**：复现对照与实现方逐字吻合（`02b642a` 修复前 `decision=promote / worktreeRemoved=true / 证据销毁`；`05d12d2` 修复后抛 `CLEANUP_BLOCKED`、worktree 与 `src/b.ts` 证据保留）；`git show 05d12d2` 恰为两文件、无夹带无顺手加固，复审方核验备选写法（`-M0`／`--diff-filter`／`diff-tree -r`）后确认**单 flag 是最小且正确手段**，并逐条排除新漏判（chmod／二进制／子模块／copy／空目录），`--no-renames` 严格扩大报告集合；T9a／T9b／T9c 全部真实承载；探针 P1 恰 `39 passed, 2 FAILED`（T9a 两红、T9b/T9c 绿）与实现方口径一致，P2 复现已知边界并判定**划为范围外成立**，P3 证明 `pre` 参数真实承载；**复审方环境全套件 146 文件 / failed=0 / exit=0 / 278.8s**，两个已知环境缺口文件在其环境隔离单跑**全绿**（266／268），证实实现方本机失败确为 broker 拦截 `link`(2) 的环境能力缺口、非本波回归。
**建议项（1 条，非阻塞，须新波次立项）**：若未来合同要求「中间提交的越界痕迹」也可判定，需**逐提交 diff-tree 遍历**的新机制。
**PASS ≠ 激活真实 Agent**：E5 真实 canary／真 spawn 仍需另行授权。
**复审结论（2026-08-29）**：契约 a)–h) 除 B1 外全部 CLOSED，F1/S2 处置正确；两项形态裁决（非阻塞）——① cleanup 零生产调用方下交付三态契约属**合同内正确形态**（与 W6b2「先立契约」同构，且台账明确要求改 options/result/manager 三处落点，无必须本波接调用方的合同依据）；② `promote` 不 merge/push 属**合同内最小形态**（规划只要求「成功提升」，D-071 + E5 未授权禁止触碰 base branch，要求 merge 语义反而违反合同）。
**阻塞项 B1（已修）**：已提交 rename 逃逸越界检测（I7 破窗，且销毁证据）——`diff --name-only -z <base>...HEAD` 走 git 默认 rename 检测、rename 只输出目的路径，attempt `git mv secret/b.ts src/b.ts` 并提交后越界源不进 `changedPaths`，工作区干净 + 声称 succeeded + `allowedPaths:["src"]` → `promote`，worktree 回收、证据销毁。实证（复审方与实现方各自端到端复现一致）：修复前 `no throw / decision=promote / removed=true`；同仓库 `--no-renames` 输出 `["secret/b.ts","src/b.ts"]`。方向矛盾佐证：未提交半段 `statusPaths` 刻意把 rename 原路径计入（`:263-265` 注释 "those bytes were touched too"），已提交半段却漏了同一保守方向。
**修复（按复审给的边界一次性完成）**：`:533` committed diff 加 `--no-renames` 单 flag（本轮唯一生产改动），rename 即按 delete+add 上报、源路径进入分类器。**已知边界（如实记录、未修）**：本修复覆盖「越界源存在于 base commit」的 rename；若 attempt 自建越界文件于一个提交、再于后续提交 mv/删除，`<base>...HEAD` 的最终 diff 本就不含该路径、任何 diff flag 都无法恢复——属「中间提交痕迹不出现在最终 diff」这一更宽问题（不限于 rename），规划 `:443-444` 的不变量按 `<base>...HEAD` 定义，故严格说不违反 I7，划为**范围外、须新波次处理**。
**三态机制本体**：三态决策 promote／isolate／block 落地于 `core/loop-git-workspace.ts`——新增 `LoopGitWorkspaceAttemptOutcome`（succeeded/failed/unknown）与 `LoopGitWorkspaceCleanupDecision`，`cleanup()` options 新增 `outcome`／`allowedPaths`，result 新增 `decision`／`outOfBoundsPaths`／`evidenceRetained`，并导出纯函数 `classifyWorkspaceCleanup`（判定顺序：**越界 → unknown → failed → succeeded**，故越界与 unknown 均压过调用方声称的 `succeeded`）。越界输入**两路**：已提交改动（`diff --name-only -z <base>...HEAD`）＋未提交/未跟踪（`status --porcelain=v1 -z -uall`），重命名/复制的第二条原路径亦计入；`allowedPaths` 仅显式提供时启用越界检测，既有 30+ 处 cleanup 调用与 `WORKSPACE_DIRTY` 语义**零改动**。`promote` **不 merge、不 push、不触碰 base branch**（E5 未授权）。`isolate` 以结果返回并保留 worktree＋分支（绕过 `WORKSPACE_DIRTY`，但不绕过结构/head/base 祖先/drift 校验）；`block` 抛 `CLEANUP_BLOCKED`，故 `result.decision === "block"` 在 cleanup 返回里不可达。取证：`cleanup()` 在本波之前**无任何生产调用方**（仅测试调用），既有断言为字段级非整对象比较。顺带清掉 W6b2 两条建议项：**F1**（T7 异 kind fixture 改存合法 human-action 内容 → 删 ref kind 前置检查时 T7 转红，此前不转红）与 **S2**（导出同一数组对象的具名别名 `LOOP_ARTIFACT_CANONICAL_KINDS` 供 canonical-kind 消费点使用，不复制第二份；编译期漂移哨兵保留未削弱）。**待办**：CP pass-state PR #25 待合并；之后进 W7（C-T1 全量只读复审 → C-T2 Current User 收口） | `tests/loop-w6b3-attempt-workspace-three-state.test.ts` **41 断言**（真 `LoopPosixProcessRunner`＋真 git＋真 worktree；T1 promote／T2 isolate／T3 block-unknown／T4 已提交越界压过声称成功／T5 纯函数 9 例含 `srcfoo` 前缀边界／T6 options 校验 8 例／T7 遗留 WORKSPACE_DIRTY／T8 block 后分支与 worktree 仍注册／**T9a 已提交 rename 越界源→允许汇 = block（B1 回归①）／T9b 允许集合内 rename 仍 promote（②）／T9c 越界纯删除 block（③）**；`setupRepo(pre)` 支持在 base commit 预置文件，`git add f.txt`→`git add -A`）＋反向探针 P1–P4 实证转红并还原（P4＝把 `changedPaths` 换回 `statusPaths(status)` → T4 红）。**B1 新增探针 P5＝去掉 `--no-renames` → T9a 两条转红（`39 passed, 2 FAILED`）、T9b/T9c 仍绿**，还原后 41 全绿 |

### 收口

| ID | 动作 | 依赖 | 状态 |
| --- | --- | --- | --- |
| C-T1 | 集成层独立全量只读复审（Node v24） | E1-T3/T4、E2-T6/T7/T8、E3-T2、E4 全部 | PENDING |
| C-T2 | Current User 收口裁决 → 产品 Decision → CP lifecycle=CLOSED → Exchange/PKB → publication=COMPLETED | C-T1 PASS | PENDING |

**关键路径**：E2-T6（接线开关）→ E1-T3/T4 + E2-T7/T8 + E3-T2 → E4 全部 → C-T1。
E5 真实 CLI canary 与"默认路径真 spawn 三 Agent"的激活均不在本任务集，须另行授权。

> **施工序 W1～W7 ↔ 正式任务映射**（实施顺序，非新任务；权威定义见
> `docs/reports/c03-e-e1e4-wiring-design.md` §10）：
> **W1=E2-T8（Q1 绑定，✅ PASS，独立复审 R2 `a698808`）** → **W2=E2-T6（gateway 开关，✅ PASS `b94a382`，默认
> deterministic）** → **W3=E1-T3/T4（loop-run + production identity/preflight，✅ PASS `598cc72`，S1/S2 已清）** → **W4=E2-T7/D-073（A 链冻结标注 + spawn 引用图 + B-7 零引用锁定，✅ PASS `f10aef1`）** → **W5=E3-T2（九类无效输出不推进 e2e，✅ PASS `eac94c9`，31 断言）** → **W6a=E4-T1+T2（process evidence 固定字段 + recovery 五分类，✅ PASS 独立复审零阻塞，68 断言，CP pass-state PR #22）** → **W6b1=E4-T3（resume lease 覆盖 recovery→claim→spawn→terminal/promotion 窗口，✅ PASS 独立复审零阻塞，`5f2bcd8`+`d9a7517`，27 断言，CP pass-state PR #23）** → **W6b2=E4-T4（human_action_required 六合法码 + 新增 artifact kind，✅ PASS 独立复审零阻塞，`99c9df3`，82 断言，CP pass-state PR #24）** → **W6b3=E4-T5（attempt workspace 三态 + wip digest 越界检测，`02b642a` 实现 35 断言 → 独立复审 NOT_CLOSED 1 项阻塞 B1（已提交 rename 逃逸越界检测）→ `05d12d2` 修复 41 断言 → **B1 聚焦复审 CLOSED 零阻塞 → ✅ PASS，CP pass-state PR #25 已合并 main `2d2ff53`）** → **W6b4=E4-T5 收口（committed diff 门控：未传 `allowedPaths` 时不跑 `git diff`，消掉 W6b3 给既有 30+ 调用方新增的多余子进程与 `GIT_COMMAND_FAILED` 失败面；`1605a84`，45 断言，聚焦复审待回）** →
> W7=C-T1/C-T2（Node v24 独立全量只读复审 → Current User 收口）。
> 注：T 编号是台账登记顺序，W 编号是安全激活顺序，故 W1=E2-T8 先于 W2=E2-T6 施工
> （E2-T8 无依赖且是激活前 blocker，E2-T6 总开关最后装），二者不矛盾。
>
> **W6b 三条裁决（Current User，2026-08-29）**：① W6b 拆成 **W6b1／W6b2／W6b3 三个子波、各自独立复审**，不合并成一包一次复审；② E4-T4 **新增 artifact kind**（同步改 `core/loop-artifact-store.ts` 联合类型与 LOOP_ARTIFACT_KINDS 两处），不复用既有 kind + payload 约定；③ E4-T5 的「未知副作用→block」**本轮就接 wip digest 越界检测**，不留到 W7/C-T1。
> 子波顺序依据：T3 是并发安全地基；T4 纯 artifact、无副作用；T5 触碰真实 Git 工作区副作用、风险最高，故放最后。

## 3. 任务一致性审计（规划 §14.2 第 7 条）

### 3.1 范围与越界检查

`b842b18` 相对 merge-base 共 16 文件、+2732/-2：7 个产品模块（1465 行）、
8 个测试文件（1274 行）、1 个 HANDOFF。全部落在规划 §6 E1～E4 候选目标面内；
**未发现范围外文件、未发现业务仓/远程 Git/发布相关改动**。

冻结生产文件零改动（与 HANDOFF 声明逐项核对一致）：
`runtime.ts`、`core/loop-autonomous-delivery-loop.ts`、`core/loop-production-coordinator.ts`、
`core/loop-git-workspace.ts` diff 为空。仅两处冻结面最小改动，均有规划依据、零行为变化：
`execution/gateway.ts` executePrimary private→protected；`core/loop-posix-process-runner.ts` MAX_TO 600000→1800000。

### 3.2 未激活保证（死代码核验）

非测试引用关系实测：`real-capability-gateway` 与 `loop-production-entry`
**无任何生产路径引用**；其余新模块仅被 `real-capability-gateway` 组合引用。
production factory 仍只选 deterministic shadow（装配点 `runtime.ts:325`
`options.gateway ?? createDeterministicCapabilityGateway(...)` 未改）。
结论：所有新代码当前不可达生产，"自动证据一律 fake runner、不调真实 CLI"的授权边界成立。

### 3.3 验证证据（Node v24.12.0，2026-08-28 重建时复跑）

- `npx tsc --noEmit`：PASS
- 8 个新模块测试：384 断言全绿（51/40/5/46/24/33/18/167，含 runner 既有 167）
- 全套件：**137 文件 / 1767 断言 / 0 failed / exit 0**（264.8s），与 HANDOFF 声称一致
- 环境注记：本机 better-sqlite3 原为 ABI 127（Node v22 编译），v20/v24 均假红；
  已 `npm rebuild` 至 ABI 137（仅动 node_modules，不进 Git）。HANDOFF §0
  "native 模块为 v24 编译"的叙述在重建时点不成立，已纠正。

### 3.4 Readiness blockers（不阻断本次追认，阻断后续阶段）

- **B1（阻断真实激活）— ✅ 已整体解除（W2 独立复审 PASS `b94a382`，零阻塞零建议）**：**Q1 对齐**子项 W1 经独立复审
  R2 PASS（`a698808`）；**开关默认 deterministic** 子项 W2 PASS（`199aeea`）——`createCapabilityGateway` 默认
  deterministic、real 需显式 flag + Q1 + realDeps 三条件、缺一 fail-closed 不回落 shadow。**B1 解除不等于授权真实
  激活**：生产入口传 `source=real` 仍未授权（W3 只装配入口/preflight、默认 deterministic；E5 真实 CLI canary 另批）。
- **B2（本文件，已关闭）**：Task Gate 事前记录缺失，经本文件事后重建；Current User
  已在 **Decision-072 事后追认 Task Gate PASS**，B2 关闭。事后追认不改变"事前 Task
  Gate 记录缺失"这一历史事实，仅以重建+追认闭合。
- **B3（阻断收口）**：E4（E4-T1～T5）未开始；C-T1 复审前必须完成。

### 3.5 未接受风险 / stale artifact

- 未接受风险：无新增。双 binding Solution Gate 残余风险维持 Decision-063 Current User 接受。
- stale artifact：未发现。旧 sidecar/spawn runner 仍被生产路径引用是**已知待办**（E2-T7），
  非 stale 漂移。

## 4. Current User 追认结果（Decision-072，2026-08-28）

本节原为追认请示，已经 Decision-072 裁决，结果如下：

1. **Task Gate 事后追认 PASS**：接受本文件 §2 稳定任务集为剩余工作的稳定基线；
   明确为事后追认，不改变"事前 Task Gate 落盘记录缺失"的事实，以事后重建+本追认闭合；
2. **授权继续接线**：在 Decision-071 `E1_E4_RUNTIME_IMPLEMENTATION` 授权范围内，按
   关键路径推进 E2-T6（real-vs-deterministic 选择开关，**默认 deterministic shadow、
   不激活真实 Agent**）；
3. B1/B3 按本文件节点控制，无异议。

追认后的 CP STATE 登记已完成（active_work=IN_PROGRESS / started:true，lifecycle 引用
Decision-072）；本文件随 `feature/c03-e1-e4-runtime-implementation` 分支留存。
