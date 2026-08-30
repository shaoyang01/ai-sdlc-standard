# C03-E E5 自主运行验收任务集与验收审计台账

> 文档性质：E5 任务集台账（正式验收证据面载体）。授权依据 Decision-075
> （2026-08-30，Current User「可以开始搞E5了」，分层推进）；规划依据
> `LOOP-CORE-C03-E-PLAN.md` §6 E5。E1–E4 台账
> （`c03-e-e1e4-task-set-and-gate-audit.md`）不重开，本文件独立记账。

## 1. 稳定任务集

| ID | 层 | 动作 | 目标面 | 依赖 | 状态 | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| E5-L1 | 第 1 层 | 自动负向矩阵映射：五类机制要求 + §7 S1–S18 + 六 crash window 盘点，产出映射报告与缺口清单 | `docs/reports/c03-e5-l1-negative-matrix-mapping.md` | Decision-075 | ✅ **MAPPING DONE WITH GAPS（2026-08-30）**：五类机制（fail-closed/恢复/Re-Gate/并发/Git 边界）全部有已复审自动化证据；S1–S18 中 13 项 ✅、S17/S18 纪律/预检级已闭、2 项中等级缺口（G-S05 重试预算缺失、G-S09 截断证据链断裂）+ 2 项低级口径项（G-S08 码名漂移、G-WINDOW 三窗口 dispatch 级泛化覆盖）+ 承接 G-P1（C-T1 P1 六合法码字面钉） | 映射报告 §1–§4；关键零命中结论经双次独立检索 |
| E5-G1 | 缺口修复 | **W1（2026-08-30 立项并完成，Current User「修吧」授权）**：① G-S05 受控重试预算——`ExecutionPointRecoveryState.controlledFailuresSinceSuccess`（上次成功后的受控业务失败数，ATTEMPT_INTERRUPTED 不计入）+ `deriveDispatchCommand` 预算门（≥2 即 ILLEGAL_TRANSITION 拒派，零 journal 副作用）；② G-S09(b) process 证据映射——`CapabilityProcessEvidence`/`CapabilityProcessEvidenceError`/`ExecutionResult.processEvidence`（types.ts）+ adapter 计算 `invocationDigest`（sha256 归一化调用形状，无动态内容）并产出成功/失败证据 + real gateway 转译带证据失败 + tracing gateway 两路终态映射（shadow/确定性路径保持全 null）；③ G-P1 六合法码字面量等值钉（W6b2 测试全序比较）。验证：新测试 `loop-s05-retry-budget` 12 断言 + `loop-process-evidence-mapping` 27 断言 + W6b2 84 断言全绿；tsc 干净；node@24 全套件 **1767 passed / 0 failed**（148 文件；2 个文件级失败=artifact-store/delivery-checkpoint-store 并发用例，**stash 对照实证基线代码失败特征完全相同**——本会话环境漂移，非本波回归） | `core/loop-recovery.ts` / `execution/gateway.ts` / `execution/types.ts` / `execution/real-capability-adapter.ts` / `execution/real-capability-gateway.ts` + 2 个新测试文件 | E5-L1 | ✅ **DONE（2026-08-30）** | ✅ 独立复审 **APPROVE**（2026-08-30，基线 `8d18193`，五项全 PASS，0 阻塞；见 §5-①） |
| E5-G2 | 口径修订 | **随 W1 同批完成（同授权）**：规划 §7 S08 码名对齐实现（CLEANUP_BLOCKED）+ E4 验收补三窗口 dispatch 级泛化覆盖口径注记；**映射报告 S09 更正**（(a) runner 截断测试实际存在 `tests/loop-posix-process-runner.test.ts:127/346`、(c) 泄密扫描已实现且有测试 `tests/real-capability-adapter.test.ts:201`——L1 首轮检索 `\|` 交替语法缺陷误报零命中，唯一真缺口为 (b)，已在报告 §2/§4/§6 显式更正留痕） | `LOOP-CORE-C03-E-PLAN.md` §7/E4 + `c03-e5-l1-negative-matrix-mapping.md` §2/§4/§6 | E5-L1 | ✅ **DONE（2026-08-30）** | ✅ 随 W1 同批复审 **APPROVE**（§5-① 第 4 项 PASS） |
| E5-L2 | 第 2 层 | 真实 Adapter canary：Kimi/Codex/Hermes 经 production gateway 在隔离 fixture 执行最小 canonical capability，记录 executable/profile/version、started/terminal、output/validation/promotion digest | production gateway + real adapter + 三 provider CLI | E5-G1 闭合 | ⏸️ **冻结：真实 CLI 触发前须 Current User 再次确认**；触发前须复查本机三 CLI 登录态/鉴权（E2-P 为 2026-08-28 快照） | canary 证据面（待产） |
| E5-L3 | 第 3 层 | 真实自主 fixture run：一次入口启动、完整八 execution point、`manual_agent_switch_count=0`、≥1 次受控 Re-Gate/恢复、只出人工 Git handoff | 同上 | E5-L2 PASS | ⏸️ **冻结：触发前须 Current User 再次确认** | 自主 run 证据面（待产） |
| E5-C | 收口 | E5 复审 + Current User 验收裁决 → Decision → CP → Exchange/PKB 归档；`live_authorizations` 的 `E5_AUTONOMOUS_ACCEPTANCE` 整条移出 | — | E5-L3 PASS | ⏸️ 未开工 | CP/Exchange/PKB 回执 |

## 2. 边界（Decision-075 全程有效）

- 全程零业务仓写入、零远程 Git 副作用、零 merge/push/发布；attempt 隔离 staging。
- real 路径保持休眠（B-7 tripwire + PATH A FROZEN + `runProduction` 硬拒 real），
  直至 E5-L2/E5-L3 各自触发前确认完成。
- 任一层 FAIL 只能回流 E2/E3 修复；不得用 shadow 结果、执行者自述或旧证据
  降级放行（规划 S16/S18）。
- E5 PASS 前不请求真实业务 C05。

## 3. 缺口登记（引自映射报告 §4）

| ID | 内容 | 严重度 | 状态 |
| --- | --- | --- | --- |
| G-S05 | 受控重试预算缺失（S05「至多一次」无实现无测试；`lastAttempt+1` 无上限，`core/loop-capability-entry.ts:436`） | 中 | ✅ W1-① 修复（journal 层计数 + deriveDispatchCommand 预算门，12 断言） |
| G-S09 | 截断证据链断裂（runner truncation 零测试覆盖；real 链路未映射 `processTruncated`；泄密扫描未实现） | 中 | **更正**：(a)(c) 为误报（runner 截断测试与 adapter 泄密扫描实际存在），唯一真缺口 = (b) process 证据未映射，✅ W1-② 修复（invocationDigest + 两路终态映射，27 断言） |
| G-S08 | 码名漂移（S08 `WORKSPACE_BOUNDARY_VIOLATION` vs 实现 `CLEANUP_BLOCKED`，语义等价） | 低 | ✅ W1（E5-G2 同批，规划对齐） |
| G-WINDOW | spawn/result/validation 三 crash window 无逐点专用注入（dispatch 级泛化覆盖，恢复语义无损） | 低 | ✅ W1（E5-G2 同批，口径注记） |
| G-P1 | C-T1 P1：六合法码 5 个无字面钉 | 低 | ✅ W1-③（六码全序字面钉） |

## 4. Current User 裁决记录

| 日期 | 裁决 |
| --- | --- |
| 2026-08-30 | 「可以开始搞E5了」→ Decision-075 授权成立，分层推进（L1 立即；L2/L3 真实 CLI 触发前再确认） |
| 2026-08-30 | 「修吧」→ E5-G1 缺口修复 + E5-G2 口径修订全部立项为 W1 同批（含 G-P1 并入确认；L2 仍冻结待触发前确认） |

## 5. 独立复审记录

### ① W1 复审（2026-08-30，外部 agent，只读）

- **结论：APPROVE**（五项全 PASS，0 阻塞）。复审基线 `8d1819390b3c9fd08fd9a87c052612c65cd442fe`（= origin tip），提交链 `ca0de30 → 51e69dd → 8d18193` 核验一致，工作树干净。
- 分项：① G-S05 预算 PASS（计数 `core/loop-recovery.ts:497-503`、门 `:959-968`，claim 前拒派零 journal 副作用，12 断言实跑全绿）；② G-S09(b) 证据链 PASS（digest 仅覆盖六字段调用形状，四路失败+成功终态全带证据，shadow/确定性全 null，started 强制全 null，27 断言全绿）；③ G-P1 字面钉 PASS（**变异验证实证承重**：worktree 改一码拼写 T1 变红，84 passed）；④ 文档口径 PASS（三处误报更正与代码事实一致）；⑤ 台账真实性 PASS（复审方自跑全套件 **1767 passed / 0 failed / 148 文件 / exit 0**，数字与台账吻合；台账声称的 2 个文件级环境失败本轮未复现，与「环境漂移」结论方向一致）。
- **两条非阻塞备注**（不夹带本批，挂后续波次或文档点明）：
  1. S05 预算按**执行点**计数而非规划原文「同 binding 最多一次」——方向更严（fail-closed），可接受，建议后续文档点明此语义差；
  2. 映射报告引用泄密扫描行号过期（`:347` → 实际 `:365`），实质正确。
- 承接确认：上一轮 W6b2 复审建议项 P1（六码无字面钉）在本批闭环，且经变异测试证明钉子承重。

### ② E5-L2 预触发复查（2026-08-30，Current User 授权触发 L2 后）

- 程序：`scripts/e2p-provider-reachability.sh`（重跑）+ Hermes/Codex 单独补跑（同 argv 口径，隔离临时 fixture，退出即删）。
- **Kimi：PASS**（版本漂移 0.38.0 → 0.39.1；6s，ping 命中，凭据可用）。
- **Hermes：PASS**（模型漂移 deepseek-v4-flash → deepseek-v4-pro；5s，ping 命中，usage 报告正常）。
- **Codex：BLOCKED（网络层，非鉴权非版本）**——WebSocket 重连 5/5 超时、HTTPS 降级超时、`chatgpt.com/backend-api/ps/mcp` 传输通道全部连不通；两次独立探针（20min 无超时循环 + 120s 有界重试 exit 137）同特征，稳定事实非瞬时抖动。版本显示 0.147.0（E2-P 记录 0.150.1，漂移存疑但不影响本次定性——请求在传输层即超时）。
- **影响**：三 provider 缺一，E5-L2（Kimi/Codex/Hermes 全经 production gateway）无法开工；按规划「不通过时 unavailable，不猜测修复」，等 Current User 修复本机网络/通道后重新复查。脚本缺陷记录：e2p 探针无 per-provider 超时保护（本次实证 codex 可无限循环）。
