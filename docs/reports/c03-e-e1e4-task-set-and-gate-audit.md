# C03-E E1～E4 稳定任务集与 Task Gate 一致性审计

> **文档性质：事后重建（reconstructed after the fact）**
>
> 本文件不是开工前的原始 Task Gate 产物。E1～E4 实施于授权后在另一台机器上
> 启动，其事前任务集/Task Gate 未形成可恢复落盘记录（产品仓、CP、Exchange/PKB
> 均不可考）。按 Current User 2026-08-28 裁决「事后重建+追认」，本文件基于
> **已落盘事实**重建稳定任务集并补做 §14.2 第 6/7 条审计；它不伪装为事前产物，
> Task Gate 是否追认 PASS 仍由 Current User 独立裁决。
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
| 6 | 稳定任务集（目标/依赖/source trace/verification/exclusions） | 本文件 §2 | ✅（事后重建，待追认） |
| 7 | 一致性审计无 stale artifact/未接受风险/readiness blocker | 本文件 §3 | ⚠️ 3 项 blocker 已识别，均不阻断本追认、阻断后续阶段（见 §3.4） |

## 2. 稳定任务集

规则：stable ID / 可执行动作 / 目标面 / 依赖 / source trace / verification。
状态以 `b842b18` 已落盘事实为准；DONE 附实现提交，PENDING 为收口前剩余工作。

### E1 — Production Entry and Run Ownership（规划 §6 E1）

| ID | 动作 | 目标面 | 依赖 | Source trace | 状态/证据 | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| E1-T1 | production request v1 fail-closed 解析（exact schema、未知字段/非法路径 spawn 前拒绝） | `core/loop-production-entry.ts`（232 行） | — | 规划 §6 E1；Decision A | DONE `3da342b` | `tests/loop-production-entry.test.ts` 46 断言 |
| E1-T2 | canonical 节点 prompt builder（哨兵/字段名单一事实源） | `execution/capability-prompt-builder.ts`（127 行） | E3-T1 | Decision A（2026-08-28） | DONE `eb8b5c5` | `tests/capability-prompt-builder.test.ts` 33 断言 |
| E1-T3 | 本地入口 `scripts/loop-run.ts`：仅 `--request-file`/`--resume`，closed 字段集，无 token/cmd/argv/env 承载 | `scripts/loop-run.ts`（新增） | E1-T1,T4,E2-T6 | 规划 §6 E1；HANDOFF §4.3 | PENDING | 契约测试：注入面 fuzz 全拒绝 |
| E1-T4 | `runtime.ts` 消费真实 `LoopRunIdentity` 与注入 gateway；现 `run()` 标记 test-only/非生产 | `runtime.ts`（冻结面） | E2-T6 | 规划 §6 E1 | PENDING | 既有 137 文件回归 0 差异 |
| E1-T5 | production-entry 契约与 resume 恢复测试 | `tests/` | E1-T3,T4 | 规划 §6 E1 验收 | PARTIAL（解析侧 46 断言已 DONE；resume 随 T3/T4） | fail-closed 分支全覆盖 |

### E2 — Real CLI Adapters and Production Gateway（规划 §6 E2）

| ID | 动作 | 目标面 | 依赖 | Source trace | 状态/证据 | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| E2-T1 | 三 provider profile + 能力矩阵 + Q4/§9 bounds（绑定 E2-P 实测 identity/version/transport） | `execution/agent-cli-profile.ts`（301 行） | E2-P PASS | 规划 §6 E2；D-070 实测版本 | DONE `f5c4559` | `tests/agent-cli-profile.test.ts` 51 断言 |
| E2-T2 | 统一 real-capability-adapter（invocation/result envelope）+ fake runner 矩阵 | `execution/real-capability-adapter.ts`（370 行） | E2-T1 | 规划 §6 E2 | DONE `898026c` | `tests/real-capability-adapter.test.ts` 40 断言 |
| E2-T3 | runner per-attempt 上限 10→30min（默认 120s 不变，仅显式 profile 提升） | `core/loop-posix-process-runner.ts`（+4/-2） | — | 规划 §9；Q4 | DONE `a135a36` | `tests/loop-posix-runner-timeout-bound.test.ts` 5 断言 |
| E2-T4 | `RealCapabilityGateway`：只 override `executePrimary`，复用基类唯一 tracing 状态机，不造第二套 | `execution/real-capability-gateway.ts`（203 行）；`execution/gateway.ts` executePrimary private→protected（+4/-1，零行为变化） | E2-T2,E3-T1,E1-T2 | Decision A | DONE `c3abf17` | `tests/real-capability-gateway.test.ts` 18 断言 |
| E2-T5 | argv 注入闭合：`shell:false`、executable allowlist、动态需求只走 stdin；13 个绕过变体全拦 | E2-T1/T2 内 | E2-T2 | R1 B1 → `23f9880`，R2 PASS | DONE | 13 绕过变体负向测试；argv 零动态内容审计 |
| E2-T6 | production factory 接线 + real-vs-deterministic 选择开关（**默认 deterministic shadow，不得静默切 real**） | `core/loop-autonomous-delivery-loop.ts`/`loop-production-coordinator.ts`/`runtime.ts` 装配点 `runtime.ts:325` | E2-T4 | 规划 §6 E2；HANDOFF §4.1-4.2 | PENDING（当前新模块生产路径零引用，未激活） | 选择开关默认值断言；shadow 回归全绿 |
| E2-T7 | 淘汰生产路径三个自定义 spawn runner；Kimi/Hermes sidecar 归档（不被 factory 选中）；Codex `shadow_fallback` 改 fail-closed | `execution/` 旧 runner | E2-T6 | 规划 §6 E2 | PENDING | production factory 不引用归档符号 |
| E2-T8 | Q1 binding 对齐：intake/design/task-planning/knowledge-sync→kimi，scan+implementation→codex，verdict+code-review→hermes | binding registry | E2-T6 | Q1 裁决；HANDOFF §3 | IMPLEMENTED `7f36b8d`（W1：INITIAL 已按 Q1 八槽对齐 + 三 Agent 专门 fake runner + Q1 矩阵测试，全套件 138 文件 0 失败）；独立只读复审进行中，复审 PASS 且 W2 开关保持 deterministic 默认后 B1 方解除 | 7×3 矩阵与 Q1 逐格断言 |

### E3 — Output Validation / Auto-Progression / Re-Gate（规划 §6 E3）

| ID | 动作 | 目标面 | 依赖 | Source trace | 状态/证据 | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| E3-T1 | node output envelope：哨兵 `<!--@loop-output-begin/end-->` 唯一 I/O 契约；role 感知——仅 formal_verdict 可出 verdict，adversarial_scan 强制 NOT_APPLICABLE 但必留 findings ledger | `core/node-output-envelope.ts`（230 行） | — | Decision A；规划 §6 E3 | DONE `494e5de`+`c3abf17` | `tests/node-output-envelope.test.ts` 24 断言 |
| E3-T2 | 节点输出校验/自动推进/Re-Gate 随 gateway 接线固化（invalid/旧 input/错 generation/伪造 digest/错 Agent/双 Gate role/越界写一律不推进） | gateway + coordinator | E2-T6 | 规划 §6 E3 验收 | PARTIAL（基类既有 tracing/finding 机制；端到端"不推进"断言随接线） | 九类无效输出负向 e2e |

### E4 — Durable Recovery and Human Boundary（规划 §6 E4）

| ID | 动作 | 目标面 | 依赖 | Source trace | 状态 | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| E4-T1 | process evidence artifact：invocation/process/staging/promotion/human-action 固定字段，append/readback 校验 | `core/loop-run-store.ts` 扩展 | E2-T6 | 规划 §6 E4 | PENDING | 事务/读回测试 |
| E4-T2 | recovery 分类：safe retry / verify staged / cleanup required / human input / terminal failed-blocked | recovery context | E4-T1 | 规划 §6 E4 | PENDING | 五类分类测试 |
| E4-T3 | resume lease 覆盖 recovery→claim→spawn→terminal/promotion 窗口 | 既有 `withResumeLease` 扩展 | E4-T1 | 规划 §6 E4 | PENDING | 并发 claim 测试 |
| E4-T4 | `human_action_required` 机器可读 artifact，reason 仅限 6 个合法码；`SWITCH_AGENT_REQUIRED`/`SHADOW_FALLBACK_REQUIRED` 非法 | 新增 | E4-T1 | 规划 §6 E4 | PENDING | allowlist/负向测试 |
| E4-T5 | attempt workspace 清理/保留：成功提升、失败隔离、未知副作用保留证据并阻塞 | `core/loop-git-workspace.ts` | E4-T1 | 规划 §6 E4 | PENDING | 三态测试 |

### 收口

| ID | 动作 | 依赖 | 状态 |
| --- | --- | --- | --- |
| C-T1 | 集成层独立全量只读复审（Node v24） | E1-T3/T4、E2-T6/T7/T8、E3-T2、E4 全部 | PENDING |
| C-T2 | Current User 收口裁决 → 产品 Decision → CP lifecycle=CLOSED → Exchange/PKB → publication=COMPLETED | C-T1 PASS | PENDING |

**关键路径**：E2-T6（接线开关）→ E1-T3/T4 + E2-T7/T8 + E3-T2 → E4 全部 → C-T1。
E5 真实 CLI canary 与"默认路径真 spawn 三 Agent"的激活均不在本任务集，须另行授权。

> **施工序 W1～W7 ↔ 正式任务映射**（实施顺序，非新任务；权威定义见
> `docs/reports/c03-e-e1e4-wiring-design.md` §10）：
> W1=E2-T8（Q1 绑定，已实现 `7f36b8d`、复审中）→ W2=E2-T6（gateway 开关，默认
> deterministic）→ W3=E1-T3/T4（loop-run + identity/preflight）→ W4=E2-T7/D-073
> （A 链冻结标注）→ W5=E3-T2（九类无效输出不推进 e2e）→ W6=E4-T1～T5 →
> W7=C-T1/C-T2（Node v24 独立全量只读复审 → Current User 收口）。
> 注：T 编号是台账登记顺序，W 编号是安全激活顺序，故 W1=E2-T8 先于 W2=E2-T6 施工
> （E2-T8 无依赖且是激活前 blocker，E2-T6 总开关最后装），二者不矛盾。

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

- **B1（阻断真实激活）**：INITIAL_BINDING_REGISTRY 的 intake 原绑 codex、与 Q1
  目标 kimi 不一致（E2-T8）。该 Q1 对齐已由 **W1 实现（`7f36b8d`）**；**暂不关闭**——
  待 W1 独立只读复审 PASS、且 W2 接线开关保持默认 deterministic shadow（真实激活仍未
  授权）后方解除；production gateway 真实派发前若未对齐，adapter 仍抛 BINDING_MISMATCH。
- **B2（本文件）**：Task Gate 事前记录缺失，经本文件事后重建，待 Current User 追认；
  追认前不得进入 C-T1 之后的收口。
- **B3（阻断收口）**：E4（E4-T1～T5）未开始；C-T1 复审前必须完成。

### 3.5 未接受风险 / stale artifact

- 未接受风险：无新增。双 binding Solution Gate 残余风险维持 Decision-063 Current User 接受。
- stale artifact：未发现。旧 sidecar/spawn runner 仍被生产路径引用是**已知待办**（E2-T7），
  非 stale 漂移。

## 4. 请 Current User 追认

基于以上事后重建与审计，请示明：

1. 是否追认 E1～E4 Task Gate 为 **PASS（事后追认）**，接受任务集 §2 为剩余工作的稳定基线；
2. 是否授权按关键路径继续 E2-T6 接线（默认 shadow、不激活真实 Agent，仍在 Decision-071 范围内）；
3. B1/B3 按本文件节点控制，无异议。

追认后：补 CP STATE 登记（active_work=IN_PROGRESS / started:true / Task Gate 追认引用），
本文件随 `feature/c03-e1-e4-runtime-implementation` 分支留存。
