# C03-E E5-L1 自动负向矩阵映射报告

> 文档性质：E5 第 1 层（自动负向矩阵）验收证据映射。授权依据 Decision-075；
> 本报告零 CLI 调用、零生产代码改动，全部证据引用自 E1–E4 已复审落账的
> 测试面（台账 `c03-e-e1e4-task-set-and-gate-audit.md`）与本报告当日实测
> 检索（分支 `feature/c03-e5-autonomous-acceptance` @ `d0a3f0e`）。
>
> 规划要求（`LOOP-CORE-C03-E-PLAN.md` §6 E5 第 1 层）：fake runner +
> fault injection 证明 **fail-closed、恢复、Re-Gate、并发、Git 边界**；
> 只能证明机制，不能证明 provider 可用。

## 1. 五类机制要求 → 证据映射

### 1.1 fail-closed

| 证据 | 测试面 | 断言/口径 | 波次/复审 |
| --- | --- | --- | --- |
| 生产请求 v1 解析：exact schema、未知字段/非法路径 spawn 前拒绝 | `tests/loop-production-entry.test.ts` | 46 断言 | E1-T1，DONE |
| CLI 入口封闭 argv：未知 flag/位置参/缺值/重复/坏 source 全拒、注入形值惰性 | `tests/loop-run-cli.test.ts` | 注入面 fuzz 14 断言 | W3 ✅ `598cc72` |
| runProduction 门：只认 parse 产物、preflight 拦 base drift/dirty、**硬拒 real** | `tests/run-production.test.ts` | 18 断言 | W3 ✅ |
| real-vs-deterministic 开关：real 需显式 source + Q1 + realDeps 三条件，缺一 fail-closed 绝不回落 shadow | `tests/capability-gateway-source.test.ts` | 16 断言 | W2 ✅ `b94a382` |
| argv 注入闭合：`shell:false`、executable allowlist、动态内容只走 stdin | adapter 契约测试 | 13 绕过变体全拦 | E2-T5，R2 `23f9880` |
| process evidence 双层校验（event validator + store write gate） | `tests/loop-w6a-process-evidence-recovery.test.ts` | 12 类非法双层拒绝 | W6a ✅ |
| resume lease：无 lease 进入窗口 fail-closed `STORE_BUSY`；异 journal 不算持有 | `tests/loop-w6b1-resume-lease-window.test.ts` | 27 断言（T1/T4/T6） | W6b1 ✅ |

### 1.2 恢复（recovery）

| 证据 | 测试面 | 口径 | 波次/复审 |
| --- | --- | --- | --- |
| 五分类 `classifyCapabilityRecovery`（SAFE_RETRY / VERIFY_STAGED / CLEANUP_REQUIRED / HUMAN_INPUT_REQUIRED / TERMINAL_FAILED_BLOCKED） | 同上 W6a 文件 | 五类均有用例（本报告实测计数：5/1/3/2/1），优先级 human＞verify-staged＞cleanup＞safe-retry＞terminal | W6a ✅ |
| claim-persisted / in-dispatch / terminal-write loss 三种中断 → `ATTEMPT_INTERRUPTED` + attempt=2 幂等重试 | `tests/loop-capability-execution.test.ts`（:984/:1038/:1066） | 中断闭账 + 重试不再重解释事实 | E3/E4 链，C-T1 ✅ |
| terminal→revision 窗口崩溃：revision 未物化 → 幂等补写 | `tests/loop-regate-dispatch-window.test.ts`（:311/:333/:475）+ W6a T2-A4 | finalized revision 绑定崩溃派发的 exact terminal event | 既有 + W6a ✅ |
| bootstrap/pre-claim 崩溃：消费 pinned anchor 而非 resume 文本 | `tests/loop-wp5-cross-entry.test.ts` B1R.row2 | 时间戳对 journal 尾单调 | C02 链，C-T1 ✅ |
| active started claim 崩溃窗口 | `tests/loop-wp6-completion-contracts.test.ts`（:427/:460）+ wp5 B1R.row3 | `ATTEMPT_INTERRUPTED` + attempt2 完成 | 既有，C-T1 ✅ |

### 1.3 Re-Gate

| 证据 | 测试面 | 口径 | 波次/复审 |
| --- | --- | --- | --- |
| 九类无效输出端到端「四不」（invalid/旧 input/错 generation/伪造 digest/错 Agent/双 Gate role/stale revision/未闭合 finding/越界写） | `tests/loop-w5-invalid-output-no-advance.test.ts` | 31 断言，真实 entry→gateway→store 链，四向反向探针实证 | W5 ✅ `eac94c9` |
| 最早受影响节点 Re-Gate 编排：upstream 只读复用、downstream 重建、RESOLVED 编排 | `tests/loop-wp4-regate.test.ts` | §8 F row-4 完成合同 | C02-WP4，C-T1 ✅ |
| finding 生命周期（含 S02/S14 回流语义） | `tests/loop-finding-lifecycle.test.ts` | 350 断言 | 既有，C-T1 ✅ |
| terminal→revision 派发窗口合同 | `tests/loop-regate-dispatch-window.test.ts` | 崩溃后派发不重解释、无预算块误落 | 既有，C-T1 ✅ |

### 1.4 并发

| 证据 | 测试面 | 口径 | 波次/复审 |
| --- | --- | --- | --- |
| resume lease 强制 + 并发 claim/spawn 互斥（S12） | `tests/loop-w6b1-resume-lease-window.test.ts` T7 | 至多一个真实 spawn | W6b1 ✅ |
| 跨进程真实并发：独立 Node 子进程竞写同一 SQLite + 快照隔离 | `tests/loop-run-concurrency.test.ts` | 无网络无 Agent | LOOP-DELIVERY-01，C-T1 ✅ |
| `busy_timeout=0` 必须保持（改 5000 → loser 阻塞事件循环 6s） | W6b1 反向探针 P6 | 机制劣化即红 | W6b1 ✅ |

### 1.5 Git 边界

| 证据 | 测试面 | 口径 | 波次/复审 |
| --- | --- | --- | --- |
| attempt workspace 三态 promote/isolate/block；越界两路输入（committed diff + status）；判定顺序越界＞unknown＞failed＞succeeded | `tests/loop-w6b3-attempt-workspace-three-state.test.ts` | 41 断言（真 git + 真 worktree），B1 rename 逃逸修复 | W6b3 ✅ |
| committed diff 门控（未传 `allowedPaths` 不跑 diff）；`allowedPaths:[]` 空权限集仍 block | `tests/loop-w6b3-…`（45/47 断言） | T10/T10c 双钉 | W6b4/W6b5 ✅ |
| workspace 结构/祖先/漂移校验基础面 | `tests/loop-git-workspace.test.ts` | 110 断言 | 既有，C-T1 ✅ |
| Path A 冻结 + 生产零 real 实例化机械锁定 | `validate-skill-contracts.rb` B-7 tripwire + PATH A FROZEN banner | 删装配行/引冻结符号即红 | W4 ✅ `f10aef1` |
| promote 不 merge/push/触碰 base branch | W6b3 复审形态裁决② | 合同内最小形态 | W6b3 ✅ |

## 2. 规划 §7 S1–S18 场景映射

| 场景 | 期望机器结果（规划原文） | L1 判定 | 证据/缺口 |
| --- | --- | --- | --- |
| S01 完整来源、base 匹配、profiles 可用 | 八点自动推进到 handoff | **机制部分已覆盖** | `loop-autonomous-delivery-loop` / `loop-c03-delivery-tail` / `loop-c03d-runtime-wiring`；「三 profile 可用」属 provider 可用性 → L2 |
| S02 blocking findings 回流 | ledger 持久化、下游失效重走 | ✅ | `loop-finding-lifecycle` 350 + `loop-wp4-regate` |
| S03 verdict 未绑定本轮 ledger | `OUTPUT_CONTRACT_VIOLATION` | ✅ | W5（错 Agent / 双 Gate role 类）+ `execution/gateway.ts` 实现码 |
| S04 CLI 不存在 | `EXECUTOR_UNAVAILABLE`，无 shadow fallback | ✅（机制级） | W2 三条件 fail-closed 不回落 + `loop-validation-guards`；真实 CLI 行为 → L2 |
| S05 非零退出无工作区变化 | failed event；**同 binding 最多一次受控重试** | ⚠️ **缺口 G-S05** | failed event + SAFE_RETRY + 同输入门控已有；**「至多一次」预算无实现无测试**（全仓无 `attemptBudget`/`maxAttempts` 生产逻辑，`MAX_ATTEMPT` 仅 adapter 内 1e6 解析上限） |
| S06 timeout 且 worktree 有变化 | 保留隔离 attempt，进 recovery verification | ✅ | runner `timed_out`（`loop-posix-runner-timeout-bound` 5 断言）+ W6b3 isolate + VERIFY_STAGED/CLEANUP_REQUIRED |
| S07 exit 0 缺 digest | invalid；不 promotion 不推进 | ✅ | W5 invalid output 类 |
| S08 result 指向 allowed path 外 | `WORKSPACE_BOUNDARY_VIOLATION`，run blocked | ⚠️ **码名漂移 G-S08** | 语义已实现且复审 PASS：`classifyWorkspaceCleanup` → block 抛 **`CLEANUP_BLOCKED`**（W6b3/4/5，47 断言）。规划文本的码名与实现不一致——语义等价（run blocked + 证据保留），建议规划修订为实际码名，非代码改动 |
| S09 stdout 超限/疑似 token 回显 | 截断/泄密失败证据；原文不落 journal | ⚠️ **缺口 G-S09** | runner 层有 `stdoutTruncated/stderrTruncated/字节计数` 机制（`loop-posix-process-runner.ts:27,188`）但 **(a) 全测试面零覆盖，(b) real 链路（real-capability-gateway/adapter）未把 truncation 映射进 `processTruncated` 证据（现恒 null），(c) 泄密/token 回显扫描未见实现** |
| S10 result 已写、terminal append 前崩溃 | resume 重验 staging 幂等提交，不再调 Agent | ✅ | `loop-capability-execution.test.ts:1066` terminal-write loss |
| S11 terminal 成功、revision 未写崩溃 | pending materialization 幂等补写 | ✅ | `loop-regate-dispatch-window` + W6a T2-A4 |
| S12 并发 resume | lease + claim CAS 至多一个 spawn | ✅ | W6b1 T7 + `loop-run-concurrency` |
| S13 resume 文本与 pinned 来源冲突 | 保持旧事实；`SOURCE_CONFLICT` human action | ✅ | `SOURCE_CONFLICT` 为六合法码之一（`loop-human-action-artifact.ts` + W6b2）+ wp5 B1R.row2 |
| S14 code-review 方案级缺口回流 | 回流 solution-design 过双角色 Gate | ✅ | `loop-wp4-regate` RESOLVED 编排 + finding lifecycle |
| S15 通过但未授权 Git | `READY_FOR_MANUAL_GIT_HANDOFF`，零 commit/push | ✅ | `loop-c03-delivery-tail` 实现码 + W6b3 promote 形态裁决② |
| S16 real 失败但 shadow 成功 | real 仍失败；shadow 非验收证据 | ✅（机制级） | W2 fail-closed 不回落；真实失败行为 → L2 实证 |
| S17 CLI 交互登录/鉴权失败 | `PROVIDER_FEASIBILITY_BLOCKED` | ✅（已闭） | E2-P 已按 Decision-070 收口；L2 canary 前复查本机登录态 |
| S18 E5 中 canonical result 不合格 | E5 FAIL，不得降级放行 | ✅（纪律级） | 不可自动证明；L2/L3 触发时按本纪律执行 |

## 3. E4 验收六 crash window 覆盖判定

规划 E4 验收原文：「对 started/spawn/result/validation/terminal/revision 各
crash window 做 fault injection」。

- **专用边界注入（3/6）**：started（wp5 B1R.row3、wp6、capability-exec
  claim-persisted）、terminal（terminal-write loss，S10）、revision（S11 +
  T2-A4）。
- **dispatch 级泛化注入（3/6）**：spawn/result/validation 三窗口的崩溃统一
  由 in-dispatch interruption（`capability-execution:1038`）覆盖——中断语义
  上三窗口同质（任何 dispatch 内崩溃 → `ATTEMPT_INTERRUPTED` + 同输入重试），
  但**无逐子边界专用注入**。
- **判定**：恢复语义无损（dispatch 级注入是三窗口崩溃的严格泛化），判为
  **验收口径差异而非缺口**；如 Current User 要求逐点钉死，可立微波补三个
  边界注入，否则建议规划文本口径修订（与 G-S08 同批处理）。

## 4. 缺口清单（L1 唯一产出物）

| ID | 内容 | 严重度 | 处置建议 |
| --- | --- | --- | --- |
| **G-S05** | 受控重试预算缺失：S05 要求「同 binding 最多一次受控重试」，实现只有「同输入 + retryable」门控，无计数上限、无测试 | 中 | 新波次实现 retry 计数上限（journal 层同输入计数即可），逐波复审 |
| **G-S09** | 截断证据链断裂：runner 有 truncation 机制但零测试覆盖，real 链路未映射进 `processTruncated`，泄密扫描未实现 | 中 | 新波次：(a) runner truncation 测试；(b) real adapter→gateway 映射 `processTruncated`；(c) 泄密扫描按规划口径补或规划修订 |
| **G-S08** | 码名漂移：规划 S08 `WORKSPACE_BOUNDARY_VIOLATION` vs 实现 `CLEANUP_BLOCKED` | 低 | 仅规划文本修订（语义已实现且 PASS），随下次规划维护批次处理 |
| **G-WINDOW** | spawn/result/validation 三 crash window 无逐点专用注入（dispatch 级泛化覆盖） | 低 | 判口径差异；二选一：微波补注入，或规划口径修订 |
| **G-P1**（承接 C-T1 P1） | 六合法码 5 个无字面钉，缺六个字面量等值断言 | 低 | 与 G-S05/G-S09 波次同批或单开，须 Current User 确认（Decision-075 决策 5） |

## 5. L1 结论

- 五类机制要求（fail-closed、恢复、Re-Gate、并发、Git 边界）全部有已复审
  的自动化证据承载，**L1 主体判定：PASS with gaps**——机制存在性满足，
  但存在 2 个中等级缺口（G-S05、G-S09）须修复后才可声明第 1 层完整闭合。
- 缺口闭合前 **不得进入 L2 真实 canary**（规划：第 1 层是 L2 的机制前提）。
- 本报告全程零 CLI 调用、零生产代码改动，符合 Decision-075 边界。

## 6. 复核方式说明

- 证据计数取自台账（已逐波独立复审确认）与本报告当日 grep 实测（分支
  `d0a3f0e`）；关键零命中结论（`ATTEMPT_BUDGET`/`maxAttempts` 全仓无生产
  逻辑、`stdoutTruncated` 全测试面零引用、`real-capability-gateway.ts` 无
  truncated 映射）均经两次独立检索确认。
- 后续波次复审时，复审方可按 §4 缺口清单逐条复现。
