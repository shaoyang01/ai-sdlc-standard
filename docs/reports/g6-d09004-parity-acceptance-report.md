# G6 / D-090-04 离线 parity 验收报告

> 规格：`docs/reports/decision-090-g6-parity-acceptance-spec.md`（冻结，D-2/D-3 坐标与 §4.2 两层比较、§7 本报告格式、§8 完成门）。
> 实施分支：`feat/g6-t2-m2-scenarios`（未上主线；M1 已由 PR #195/#196 合入 `feature/loop-runtime-v1` @ `b8923fc`）。
> 本报告为 G6 gate CLOSED 申请的证据包（§7）：逐场景判定 → 汇总表 → 账目对账 → 剔除项清单 → 结论（完成门三项逐项判定）。
> 改动面纪律：M2 全部工作限于 `tests/`（fixtures/harness）与交接文档，**生产代码零改动**；D-090-04 授权边界（fixtures/harness/acceptance reports；禁真实 CLI、业务仓、shadow、合同变更）全程遵守。

## 1. 目标、范围与方法

- **目标**（§1 合同口径）：对相同 fixture，手动路径（真实 publisher 声明）与 runtime 路径（生产入口本体 `runProduction` + 脚本化确定性网关）归一化后完全等价；journal/manifest digest 不一致时 STOP_AND_REPORT。
- **两层比较**（§4.2，Current User 2026-09-20 裁决 B）：
  - **产物层**（维度 3/4/5：artifact-paths、version-state、finding-identity）：T5 store 级同事实驱动（journal 事件携带与手动面同一 raw digest，经 projector 产 manifest），`normalize()` 冻结白名单归一化后**全文档相等**为判据；维度行只作诊断归因、永不进判定路径（G6T2-R1-H4 教训）。
  - **行为层**（维度 1/2/6/7/8/9：node-sequence、gate-roles、decision-depth、next-eligibility、earliest-reroute、final-handoff）：生产入口 `runProduction` 真实门 + 注入脚本化网关的决策轨迹；参照物是两面共用的事实脚本（与脚本一致即两面一致）。
  - **合并判定**：场景 PASS = 产物层全等 且 行为层六维全 MATCH；行为层维度不谎报 MATCH（NOT_JUDGED 即不判），产物层只判 3 维（R2 约束①④）。
- **无 shadow**（§8 门 2）：harness 只用真实生产入口（publisher / `loop-run` deterministic 档等效注入）；`--capability-source real` 全程未用；真实 CLI 未调用。

## 2. 验证记录

环境前置：node v24.12.0；`npm test` 须 PATH 前置 `/opt/homebrew/opt/ruby@3.3/bin`（系统 2.6.10 触发 canonical gate 假阳，README Validation 区已文档化，PR #196）。

| 校验 | 命令 | 结果 |
| --- | --- | --- |
| 类型 | `npx tsc --noEmit` | 0 |
| 产物层矩阵 | `node --import tsx tests/g6-parity-matrix.test.ts` | **50 passed / 0 failed** |
| 行为层矩阵（合并判定） | `node --import tsx tests/g6-parity-behavior-matrix.test.ts` | **50 passed / 0 failed** |
| 行为层单列（超限暂停） | 同上（同文件第二节） | **4 passed / 0 failed** |
| 负向（比较器 fail-open 钉死） | `node --import tsx tests/g6-parity-comparator-negative.test.ts` | **28 passed / 0 failed** |
| 全量回归 | `npm test`（PATH 前置 ruby@3.3） | 见 §2.1 |

### 2.1 全量回归

`npm test`（并行）连续两跑，断言数均为 **1767 passed / 0 failed**，但各出现 1 个文件级失败：

- 首跑（840.1s）：`tests/loop-delivery-checkpoint-store.test.ts` 失败（failed_file_count: 1）——已知环境抖动类（历次记录在案：并行满载下跨进程并发写竞争）。**隔离复跑确认恢复：268 passed / 0 failed。**
- 第二跑（792.9s）：`tests/loop-codex-implementation-adapter.test.ts` 失败（failed_file_count: 1）——**新观察到的抖动文件**（此前名单为 checkpoint-store / git-workspace）。**隔离复跑确认恢复：D05 各计数 failures=0（marker/prompt/taxonomy/adapter-contract/git-env/marker-derivation 全绿）。**

两跑失败的是不同文件、且均隔离即恢复，符合「并行满载下跨进程资源竞争」的抖动形态；两文件均不 import G6 harness，与本次改动面（`tests/g6-parity/` + docs）无因果路径。为排除环境变量，另以 serial 模式（单文件串行、无并行竞争；有真失败即停）跑全量：

> **serial 全量（`npm test -- --serial`）：1767 passed / 0 failed / 170 文件 / failed_file_count 0。** 本报告以此串行结果为回归基准。

有界 invocation 使行为层矩阵明显变慢，并行全量约 790–960s、serial 显著更长，均属预期。

## 3. 逐场景判定（54 节）

> 每节：scenario-id / 矩阵坐标 / 剪枝标注 / 两面轨迹摘要 / 九维逐维判定（含判定层）/ 分歧根因。九维编号见 §4.1；「产物层」= T5 归一化全文档相等，「行为层」= 生产入口轨迹六维。全部 54 节零分歧。

### S-CORE 首轮（12）

#### S-CORE-LIGHT-PASS-first
- **矩阵坐标**：depth=LIGHT · verdict=PASS · round=first · init=new-project · manifest=new · crash=none
- **剪枝标注**：—
- **两面轨迹摘要**：intake→design→gate(adversarial_scan + formal_verdict, PASS/CONFIRMED/LIGHT)→task-planning→implementation→code-review→knowledge-sync；runtime 终态 success/COMPLETED。
- **九维逐维判定**：1 MATCH(行为层) · 2 MATCH(行为层) · 3 MATCH(产物层) · 4 MATCH(产物层) · 5 MATCH(产物层) · 6 MATCH(行为层) · 7 MATCH(行为层) · 8 MATCH(行为层) · 9 MATCH(行为层)
- **分歧根因**：无

#### S-CORE-LIGHT-FAIL-first
- **矩阵坐标**：depth=LIGHT · verdict=FAIL · round=first
- **剪枝标注**：d087 scenario-2 形状（真实手动流程）：FAIL 首裁 → gate finding（SOLUTION, earliest=solution-design，锚定被审 design v1）授权回退 → design v2 → 重裁 PASS（gate revision semver 2.0.0）→ finding 逐条关闭 → 下游链。
- **两面轨迹摘要**：intake→design v1→gate R1(scan+verdict FAIL/CONFIRMED)→reflow→design v2→gate R2 PASS→planning→impl→review→sync；finding 在确认轮闭合（绑 gate revision、verdict 产物为证据）。
- **九维逐维判定**：1-9 全 MATCH（1/2/6/7/8/9 行为层，3/4/5 产物层）
- **分歧根因**：无

#### S-CORE-LIGHT-PASS_WITH_RISK-first
- **矩阵坐标**：depth=LIGHT · verdict=PASS_WITH_RISK · round=first
- **剪枝标注**：§3 PWR 定义事实——scan 来源 finding 接受（G6T2-R1-H5 修复后携带 canonical `loop-capability-findings:v1` ledger，1 成员）。
- **两面轨迹摘要**：intake→design→gate R1(scan 携带 ledger F01；verdict PASS_WITH_RISK/CONFIRMED，终态内经公开 `acceptFindingRisk` 风险接受 ACCEPTED_RISK、closed_by=formal_verdict)→下游链；finding 不回流（接受即关闭路径）。
- **九维逐维判定**：1-9 全 MATCH（3/4/5 产物层）
- **分歧根因**：无

#### S-CORE-LIGHT-BLOCKED_UNKNOWN-first
- **矩阵坐标**：depth=LIGHT · verdict=BLOCKED_UNKNOWN · round=first
- **剪枝标注**：BU = gateResult FAIL + decisionStatus BLOCKED_UNKNOWN + **显式 null** depth（信封规则）；verdict 永远 succeeded 并渲染决策 triple（WP6）。
- **两面轨迹摘要**：intake→design v1→gate R1(FAIL/BLOCKED_UNKNOWN/null)→reflow→design v2→gate R2 PASS→下游链。
- **九维逐维判定**：1-9 全 MATCH
- **分歧根因**：无

#### S-CORE-STANDARD-PASS-first / S-CORE-STANDARD-FAIL-first / S-CORE-STANDARD-PASS_WITH_RISK-first / S-CORE-STANDARD-BLOCKED_UNKNOWN-first
- **矩阵坐标**：depth=STANDARD · verdict=PASS / FAIL / PASS_WITH_RISK / BLOCKED_UNKNOWN · round=first
- **剪枝标注**：同 LIGHT 对应场景（FAIL/BU 为 d087 返工 wave；PWR 为 scan finding 接受）。
- **两面轨迹摘要**：同 LIGHT 对应场景，深度=STANDARD。
- **九维逐维判定**：各 1-9 全 MATCH
- **分歧根因**：无

#### S-CORE-DEEP-PASS-first / S-CORE-DEEP-FAIL-first / S-CORE-DEEP-PASS_WITH_RISK-first / S-CORE-DEEP-BLOCKED_UNKNOWN-first
- **矩阵坐标**：depth=DEEP · verdict=PASS / FAIL / PASS_WITH_RISK / BLOCKED_UNKNOWN · round=first
- **剪枝标注**：同 LIGHT 对应场景。
- **两面轨迹摘要**：同 LIGHT 对应场景，深度=DEEP。
- **九维逐维判定**：各 1-9 全 MATCH
- **分歧根因**：无

### S-CORE 升档（4）

#### S-CORE-LIGHT-PASS-upgrade / S-CORE-LIGHT-PASS_WITH_RISK-upgrade
- **矩阵坐标**：depth=LIGHT · verdict=PASS / PASS_WITH_RISK · round=upgrade
- **剪枝标注**：d087 升档形状：R1 PASS+ESCALATED 携带**新** required_depth（publisher 同发布更新 = 投影器 foldDepth，代码级互证）→ design 按升档深度重建（§5.4 reflow 授权——FAIL/ESCALATED verdict 欠链 reflow 事实由 store `registerReflowFinding` 合成）→ R2 重裁 PASS/PWR。
- **两面轨迹摘要**：intake→design v1→gate R1(PASS/ESCALATED, depth=STANDARD)→design v2→gate R2(PASS/PWR, CONFIRMED, depth=STANDARD)→下游链。
- **九维逐维判定**：各 1-9 全 MATCH
- **分歧根因**：无

#### S-CORE-STANDARD-PASS-upgrade / S-CORE-STANDARD-PASS_WITH_RISK-upgrade
- **矩阵坐标**：depth=STANDARD · verdict=PASS / PASS_WITH_RISK · round=upgrade
- **剪枝标注**：同 LIGHT 升档形状，阶梯 STANDARD→DEEP。
- **两面轨迹摘要**：同 LIGHT 升档，升档深度=DEEP。
- **九维逐维判定**：各 1-9 全 MATCH
- **分歧根因**：无

### S-CORE 多轮（A，3）

#### S-CORE-LIGHT-FAIL-multiround / S-CORE-STANDARD-FAIL-multiround / S-CORE-DEEP-FAIL-multiround
- **矩阵坐标**：depth=LIGHT/STANDARD/DEEP · verdict=FAIL · round=re-gate
- **剪枝标注**：finding 持续累积模型（Current User 2026-09-21 定案 = 现实手动复审流程）：finding 是全局集合，每轮回退由 OPEN 集合授权、各自确认轮绑该轮 revision 闭合；**每轮一个 finding**（两条引擎硬约束：同轮 finding 共享 scan-ledger blob 令 takeover 配对歧义拒判；投影 provenance 要求闭捆 revision ref 唯一）。
- **两面轨迹摘要**：4 轮 verdict（FAIL×3 → PASS）；Fa/Fb/Fc 各绑 design v2/v3/v4 闭合；gate revision 恰 1（PASS）；design v1-v3 STALE、v4 ACTIVE；两面 findingIndex 三行深比较一致（1:1）。
- **九维逐维判定**：各 1-9 全 MATCH
- **分歧根因**：无

### S-CORE review 本地返工（B，3）

#### S-CORE-LIGHT-PASS-reviewwave / S-CORE-STANDARD-PASS-reviewwave / S-CORE-DEEP-PASS-reviewwave
- **矩阵坐标**：depth × PASS · round=first（gate 首轮通过；返工在 review 段，不触发 re-gate——流程模型定案）
- **剪枝标注**：wms-monitor 生产实证（lifecycle-actions 22 个 + config-page-usability 4 个 code-review findings）。
- **两面轨迹摘要**：intake→design→gate R1 PASS→planning→impl v1→review v1（IMPLEMENTATION finding，earliest=implementation）→impl v2→review v2 闭合（绑 impl revision、重审产物为证据）→sync。
- **九维逐维判定**：各 1-9 全 MATCH
- **分歧根因**：无

### S-CORE review 发现方案问题→re-gate（C，3）

#### S-CORE-LIGHT-PASS-review-regate / S-CORE-STANDARD-PASS-review-regate / S-CORE-DEEP-PASS-review-regate
- **矩阵坐标**：depth × PASS · round=re-gate
- **剪枝标注**：wms-monitor 生产实证 lifecycle-actions CR-F12：review finding（SOLUTION, earliest=solution-design）→ reflow design → re-gate 闭合（绑 design v2、**design 产物**为证据）；下游重跑后通过。re-gate 轮次按 stage 独立计数。
- **两面轨迹摘要**：intake→design v1→gate R1 PASS→planning→impl v1→review v1(CR-F01)→reflow→design v2→gate R2 PASS→planning v2→impl v2→review v2→sync。
- **九维逐维判定**：各 1-9 全 MATCH
- **分歧根因**：无

### S-CORE PWR × Re-Gate（3，2026-09-23 账目对账补建）

#### S-CORE-LIGHT-PASS_WITH_RISK-review-regate / S-CORE-STANDARD-PASS_WITH_RISK-review-regate / S-CORE-DEEP-PASS_WITH_RISK-review-regate
- **矩阵坐标**：depth × PASS_WITH_RISK · round=re-gate
- **剪枝标注**：冻结矩阵 PWR×Re-Gate 行。2026-09-23 账目对账发现这三行**无场景且无任何既定剔除依据**（规划遗漏，非设计剔除），Current User 裁决补建。形状 = C 族 re-gate 授权 + PWR 首轮（scan finding 风险接受）。本轮实证的新生产语义：finding 注册时 source revision 必须 ACTIVE 且为当前指针（`loop-run-store.ts` appendFinding）——PWR 轮 scan finding 的失效令被审 design v1 转 STALE，故 review 发现（CR-F01）锚定被审 implementation v1（§5.1 允许任意节点产物作发现锚），回流目标 earliest 不变。
- **两面轨迹摘要**：intake→design v1→gate R1(PWR：scan ledger F01 终态内风险接受)→planning→impl v1→review v1(CR-F01，锚 impl v1)→reflow→design v2→gate R2 PASS→planning v2→impl v2→review v2→sync。
- **九维逐维判定**：各 1-9 全 MATCH
- **分歧根因**：无

### S-CORE gate 发现需求级回流（D，1）

#### S-CORE-DEEP-FAIL-requirement-reflow
- **矩阵坐标**：depth=DEEP · verdict=FAIL · round=re-gate
- **剪枝标注**：wms-monitor 生产实证 config-page-usability F07：REQUIREMENT finding（earliest=requirement-intake）锚定被审 intake revision、失效全 scope、回流 requirement-intake；整链从 intake 重跑，确认 re-gate（gate stage round 2）绑新 intake revision 闭合。
- **两面轨迹摘要**：intake v1→design v1→gate R1 FAIL(G01 REQUIREMENT)→整链回退→intake v2→design v2→gate R2 PASS→下游链。
- **九维逐维判定**：1-9 全 MATCH
- **分歧根因**：无

### S-CORE review 发现需求补充（E，1）

#### S-CORE-DEEP-PASS-requirement-reflow
- **矩阵坐标**：depth=DEEP · verdict=PASS · round=re-gate
- **剪枝标注**：需求补充路径（同 D 机制换发现节点：review 阶段 REQUIREMENT finding）；重审查（review stage round 2）绑新 intake revision 闭合。
- **两面轨迹摘要**：intake v1→design→gate R1 PASS→planning→impl→review v1(F01 REQUIREMENT)→整链回退→intake v2→design v2→gate R2 PASS→下游 v2→sync。
- **九维逐维判定**：1-9 全 MATCH
- **分歧根因**：无

### S-CORE 反馈驱动 re-gate（F，2）

#### S-CORE-DEEP-PASS-feedback-regate-post-review / S-CORE-DEEP-PASS-feedback-regate-post-gate
- **矩阵坐标**：depth=DEEP · verdict=PASS · round=re-gate
- **剪枝标注**：零 finding 的非 finding 路径：WP-1 `FEEDBACK_DRIVEN_CHANGE` 记录开启新代际，生产 recovery 自行推导二代整链重建（从 intake）；授权经 store regate 上下文 feedback 分支。两个触发点（review 完成 / gate verdict 后）。
- **两面轨迹摘要**：一代整链（或至 gate verdict）→ WP-1 记录落 invocation 间→二代从 intake 全链重建→gate 二代 PASS→下游→sync。
- **九维逐维判定**：各 1-9 全 MATCH
- **分歧根因**：无

### S-CORE 升档 × FAIL（G，2）

#### S-CORE-LIGHT-FAIL-upgrade / S-CORE-STANDARD-FAIL-upgrade
- **矩阵坐标**：depth=LIGHT/STANDARD · verdict=FAIL · round=upgrade
- **剪枝标注**：升档 × FAIL：R1 ESCALATED（LIGHT→STANDARD / STANDARD→DEEP）注册 Fa；R2 关 Fa（design v2）、注册 Fb 并 FAIL；R3 关 Fb（design v3）PASS；gate stage 轮次与 review stage 独立计数。
- **两面轨迹摘要**：intake→design v1→gate R1(PASS/ESCALATED, 新深度)→design v2→gate R2 FAIL→design v3→gate R3 PASS→下游链。
- **九维逐维判定**：各 1-9 全 MATCH
- **分歧根因**：无

### S-MANIFEST manifest 态（2）

#### S-MANIFEST-STANDARD-reconcile
- **矩阵坐标**：depth=STANDARD · verdict=PASS · round=first · manifest=reconcile
- **剪枝标注**：V9 语义：中途 takeover + 混合追平——journal 尾段与 finding 闭合一次原子落盘，重放 NO_OP 逐字节稳定。
- **两面轨迹摘要**：中途快照 → runtime takeover 投影 → 尾段 catch-up → 最终文档逐字节一致。
- **九维逐维判定**：1-9 全 MATCH
- **分歧根因**：无

#### S-MANIFEST-STANDARD-corrupt
- **矩阵坐标**：depth=STANDARD · verdict=PASS · round=first · manifest=corrupt
- **剪枝标注**：篡改 self-digest 后投影器 `MANIFEST_CORRUPT_STOP` fail-closed，单级判别（冻结规格：与 verdict/round 无组合语义）；行为层只做轨迹回放。
- **两面轨迹摘要**：runtime takeover 基线被篡改 → 投影 fail-closed STOP；行为层轨迹同首轮 PASS。
- **九维逐维判定**：1/2/6/7/8/9 MATCH(行为层)；3/4/5 = fail-closed STOP 断言（单级判别，非比较）
- **分歧根因**：无

### S-CRASH crash/resume（6）

#### S-CRASH-STANDARD-post-gate-verdict-resume / -double-resume
- **矩阵坐标**：depth=STANDARD · verdict=PASS · round=first · crash=crash-resume（崩溃点：gate 裁决后 journal 尾段未投影）
- **剪枝标注**：post-gate-verdict：尾部未投影 → resume catch-up 追平；double-resume 须 NO_OP 逐字节稳定。
- **两面轨迹摘要**：崩溃点后 resume 一次投影追平；二次 resume NO_OP；手动侧 publisher 同输入重放逐字节幂等（已断言）。
- **九维逐维判定**：各 1-9 全 MATCH
- **分歧根因**：无

#### S-CRASH-STANDARD-post-finding-migration-resume / -double-resume
- **矩阵坐标**：同点：finding 迁移后未投影（finding 闭合 + 尾段混合追平）
- **剪枝标注**：同上双恢复语义。
- **两面轨迹摘要**：finding 差量与 journal 尾段混合追平；二次 resume NO_OP。
- **九维逐维判定**：各 1-9 全 MATCH
- **分歧根因**：无

#### S-CRASH-STANDARD-pre-manifest-write-resume / -double-resume
- **矩阵坐标**：同点：manifest 写入前（投影已运行、写丢失）
- **剪枝标注**：丢失写后回滚到 takeover 已发布态；resume 重推出的文档必须与丢失写前逐字节一致；双恢复 NO_OP。
- **两面轨迹摘要**：回滚 → resume 重推 → 与丢失写前逐字节一致；二次 resume NO_OP。
- **九维逐维判定**：各 1-9 全 MATCH
- **分歧根因**：无

### S-INIT 初始化类（8）

#### S-INIT-new-project-STANDARD-PASS-first / S-INIT-new-project-STANDARD-FAIL-reflow
- **矩阵坐标**：init=new-project · depth=STANDARD · verdict=PASS / FAIL · round=first（FAIL 为回流形状）
- **剪枝标注**：D-088-01 重基线四类初始化 × 两关键 verdict；类差异在 requirement-intake 收敛、其后链同构（规格 §3 论证由四类全跑两种波形实证）。
- **两面轨迹摘要**：intake（init 类特有材料）→ 其后与 S-CORE STANDARD PASS/FAIL 首轮同构。
- **九维逐维判定**：各 1-9 全 MATCH
- **分歧根因**：无

#### S-INIT-existing-code-…（2）/ S-INIT-original-sdd-…（2）/ S-INIT-original-sdlc-sdd-…（2）
- **矩阵坐标**：init=existing-code / original-sdd / original-sdlc-sdd · depth=STANDARD · verdict=PASS / FAIL · round=first
- **剪枝标注**：同 new-project 两条。
- **两面轨迹摘要**：intake 侧按 init 类形态收敛，其后链同构。
- **九维逐维判定**：各 1-9 全 MATCH
- **分歧根因**：无

### 超限暂停（行为层单列，4）

> 产物层无法 parity：FAIL/BLOCKED_UNKNOWN verdict 不产出 gate revision（WP6），pending gate 行 triple 在两漂——同 D-7/D-17 分析。此 4 节只作行为层轨迹断言 + durable 超限终态断言，**runner 单列，不计入产物层通过数**（R2 诚实性约束④）。

#### S-CORE-LIGHT-FAIL-overlimit-pause / S-CORE-STANDARD-FAIL-overlimit-pause / S-CORE-DEEP-FAIL-overlimit-pause
- **矩阵坐标**：depth=LIGHT/STANDARD/DEEP · verdict=FAIL · round=re-gate（行为层 only）
- **剪枝标注**：轮数预算超限（maxDesignRounds 2：一次重启授权、第二次拒绝——经 entry 自身选项 `ProductionRunDeps.maxRegateRounds=1` 透传，同 maxDispatches 性质的边界参数，非 shadow）；runtime durable 终态 `REGATE_ROUND_BUDGET_EXHAUSTED`（零 dispatch 落定，仅 `releaseRunRegateBlock` RISK_ACCEPTED/SCOPE_RESET 可释放）；手动面对应「人停下不等了」（无 release 决策，OPEN finding 授权着被预算拒绝的重启）。
- **两面轨迹摘要**：intake→design v1→gate R1 FAIL(F01)→design v2→gate R2 FAIL(F02)→预算拒绝第二次回退（零 dispatch）→ durable block。F01 于 design v2 物化后的 invocation 间窗口闭合；F02 与 R2 合成 reflow 行保持 OPEN。
- **九维逐维判定**：1/2/6/7/8/9 MATCH(行为层)；3/4/5 NOT_JUDGED（产物层无法 parity，明示不判）
- **分歧根因**：无；durable 终态码实测 = `REGATE_ROUND_BUDGET_EXHAUSTED`

#### S-CORE-STANDARD-BU-overlimit-pause
- **矩阵坐标**：depth=STANDARD · verdict=BLOCKED_UNKNOWN · round=re-gate（行为层 only）
- **剪枝标注**：同 FAIL×3，两轮 BU（显式 null depth）；落在规格剔除项「BU×Re-Gate」行上作轨迹演示（见 §7 剔除项清单实证备注）。
- **两面轨迹摘要**：同 FAIL×3，两轮 verdict 均为 FAIL/BLOCKED_UNKNOWN/null。
- **九维逐维判定**：1/2/6/7/8/9 MATCH(行为层)；3/4/5 NOT_JUDGED
- **分歧根因**：无；durable 终态码实测 = `REGATE_ROUND_BUDGET_EXHAUSTED`

## 4. 汇总表（规格 52 行 × 九维 + 落地映射）

九维通过矩阵（✓=MATCH；剔=规格剔除项；退=退化项（规格自身语义）；补=本周期补建）：

| # | 规格行（depth × verdict × round / 家族） | 落地场景 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | LIGHT×PASS×首轮 | S-CORE-LIGHT-PASS-first | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | LIGHT×FAIL×首轮 | S-CORE-LIGHT-FAIL-first | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | LIGHT×PWR×首轮 | S-CORE-LIGHT-PASS_WITH_RISK-first | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4 | LIGHT×BU×首轮 | S-CORE-LIGHT-BLOCKED_UNKNOWN-first | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 5-8 | STANDARD×{PASS,FAIL,PWR,BU}×首轮 | S-CORE-STANDARD-*-first | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 9-12 | DEEP×{PASS,FAIL,PWR,BU}×首轮 | S-CORE-DEEP-*-first | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 13 | LIGHT×PASS×升档 | S-CORE-LIGHT-PASS-upgrade | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 14 | LIGHT×FAIL×升档 | S-CORE-LIGHT-FAIL-upgrade | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 15 | LIGHT×PWR×升档 | S-CORE-LIGHT-PASS_WITH_RISK-upgrade | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 16 | LIGHT×BU×升档 | —（升档×BU，规格剔除） | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 |
| 17 | STANDARD×PASS×升档 | S-CORE-STANDARD-PASS-upgrade | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 18 | STANDARD×FAIL×升档 | S-CORE-STANDARD-FAIL-upgrade | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 19 | STANDARD×PWR×升档 | S-CORE-STANDARD-PASS_WITH_RISK-upgrade | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 20 | STANDARD×BU×升档 | —（升档×BU，规格剔除） | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 |
| 21-24 | DEEP×{PASS,FAIL,PWR,BU}×升档 | —（退化：DEEP 无升档目标，hard ceiling） | 退 | 退 | 退 | 退 | 退 | 退 | 退 | 退 | 退 |
| 25 | LIGHT×PASS×Re-Gate | S-CORE-LIGHT-PASS-review-regate | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 26 | LIGHT×FAIL×Re-Gate | S-CORE-LIGHT-FAIL-multiround | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 27 | LIGHT×PWR×Re-Gate | S-CORE-LIGHT-PASS_WITH_RISK-review-regate（补建） | 补 | 补 | 补 | 补 | 补 | 补 | 补 | 补 | 补 |
| 28 | LIGHT×BU×Re-Gate | —（BU×Re-Gate，规格剔除；轨迹演示见单列） | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 |
| 29 | STANDARD×PASS×Re-Gate | S-CORE-STANDARD-PASS-review-regate | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 30 | STANDARD×FAIL×Re-Gate | S-CORE-STANDARD-FAIL-multiround | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 31 | STANDARD×PWR×Re-Gate | S-CORE-STANDARD-PASS_WITH_RISK-review-regate（补建） | 补 | 补 | 补 | 补 | 补 | 补 | 补 | 补 | 补 |
| 32 | STANDARD×BU×Re-Gate | —（剔除；S-CORE-STANDARD-BU-overlimit-pause 单列演示） | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 |
| 33 | DEEP×PASS×Re-Gate | S-CORE-DEEP-PASS-review-regate（+E/F×2 同坐标加挂） | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 34 | DEEP×FAIL×Re-Gate | S-CORE-DEEP-FAIL-multiround（+D 同坐标加挂） | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 35 | DEEP×PWR×Re-Gate | S-CORE-DEEP-PASS_WITH_RISK-review-regate（补建） | 补 | 补 | 补 | 补 | 补 | 补 | 补 | 补 | 补 |
| 36 | DEEP×BU×Re-Gate | —（BU×Re-Gate，规格剔除） | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 |
| 37-40 | S-INIT：{new-project, existing-code, original-sdd, original-sdlc-sdd}×STANDARD×PASS×首轮 | S-INIT-*-STANDARD-PASS-first | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 41-44 | S-INIT：四类×STANDARD×FAIL×回流 | S-INIT-*-STANDARD-FAIL-reflow | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 45 | S-MANIFEST reconcile | S-MANIFEST-STANDARD-reconcile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 46 | S-MANIFEST corrupt | S-MANIFEST-STANDARD-corrupt | ✓ | ✓ | STOP | STOP | STOP | ✓ | ✓ | ✓ | ✓ |
| 47-48 | S-CRASH post-gate-verdict（resume / double） | S-CRASH-STANDARD-post-gate-verdict-* | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 49-50 | S-CRASH post-finding-migration（resume / double） | S-CRASH-STANDARD-post-finding-migration-* | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 51-52 | S-CRASH pre-manifest-write（resume / double） | S-CRASH-STANDARD-pre-manifest-write-* | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**行为层单列（不占规格 52 行计数）**：

| 场景 | 坐标 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S-CORE-LIGHT-FAIL-overlimit-pause | LIGHT/FAIL/re-gate | ✓ | ✓ | 不判 | 不判 | 不判 | ✓ | ✓ | ✓ | ✓ |
| S-CORE-STANDARD-FAIL-overlimit-pause | STANDARD/FAIL/re-gate | ✓ | ✓ | 不判 | 不判 | 不判 | ✓ | ✓ | ✓ | ✓ |
| S-CORE-DEEP-FAIL-overlimit-pause | DEEP/FAIL/re-gate | ✓ | ✓ | 不判 | 不判 | 不判 | ✓ | ✓ | ✓ | ✓ |
| S-CORE-STANDARD-BU-overlimit-pause | STANDARD/BU/re-gate | ✓ | ✓ | 不判 | 不判 | 不判 | ✓ | ✓ | ✓ | ✓ |

## 5. 账目对账（规格 52 ↔ 落地 54）

### 5.1 分解

规格 52 = S-CORE 36（depth×verdict×round 全交叉）+ S-INIT 8 + S-MANIFEST 2 + S-CRASH 6（§3 剪枝汇总）。S-INIT/S-MANIFEST/S-CRASH 与建成 1:1 对齐，无争议；全部对账张力在 S-CORE 36 行。

### 5.2 S-CORE 36 行覆盖

| 类别 | 行数 | 说明 |
| --- | --- | --- |
| 建成行（产物层合并判定） | 27 | 首轮 12 + 升档 6 + Re-Gate 6（PASS/FAIL）+ **补建 PWR×Re-Gate 3** |
| 规格剔除行 | 5 | 升档×BU ×2（LIGHT/STANDARD，§3 剔除项）；BU×Re-Gate ×3（§3 剔除项） |
| 退化行 | 4 | DEEP×升档 ×4：§3 round 语义限定升档仅 LIGHT→STANDARD / STANDARD→DEEP，hard ceiling |
| 合计 | 36 | 27+5+4=36 ✓ |

### 5.3 场景级对账

- 34 个 S-CORE 产物层场景 = 27 建成行 + **7 个同行加挂**（B×3 与首轮 PASS 同行两种粒度：gate-first-pass vs review 本地返工；E/F×3 与 DEEP-PASS-Re-Gate 同行：requirement 回流 / feedback 重建两种授权路径；D 与 DEEP-FAIL-Re-Gate 同行：requirement 级回流 vs finding 多轮）。
- 产物层合计 **50** = S-CORE 34 + S-INIT 8 + S-MANIFEST 2 + S-CRASH 6。账面闭合：**52 − 5（规格剔除）+ 3（补建）= 50**。
- 行为层单列 **4**（超限暂停）：FAIL×3 落在 A 族已覆盖的 Re-Gate×FAIL 行（同行第二种粒度：预算耗尽终态 vs 收敛终态）；BU×1 落在被剔除的 STANDARD BU×Re-Gate 行（轨迹演示，不占行计数）。
- 两层合计落地 **54** 个场景条目；产物层通过数恒为 50，单列 4 不计入（runner 独立摘要行明示）。

### 5.4 补建裁决记录（2026-09-23）

账目对账（程序化提取全部场景坐标与规格 §3 逐行比对）发现 **PWR×Re-Gate ×3 无场景、无剔除依据**——属 M2 家族规划遗漏（规格 36 行内的合法坐标：re-gate 终裁 PWR 无语义障碍）。Current User 裁决选项 A 补建（备选 B「事后列剔除」无规格依据、削弱完成门成色，弃）。落地形态：C 族 re-gate 授权 + PWR 首轮，3 深度全建，首跑即过（含手动面 finding-action 结算点镜像修复，见 §6.2）。

## 6. 机制层说明

### 6.1 D-7 / D-17 表示分歧（finding-identity 维度，dim 5）

catch-up 路径会把 cursor 后有事件的节点行整体替换为 runtime 推导行，与手动 publisher 规范存在两处**设计内**表示差异（Current User 裁决选项 A：比较器镜像豁免，非改生产）：

- **D-7**（artifact basename）：runtime 推导英文 canonical 名 vs publisher 硬 gate 强制中文规范名；投影器 `pathSemanticKey` 故意不含 basename。比较器 catch-up 模式按「目录段::capability」语义键比路径；**takeover 机制 32 场景保持逐字节字面比较**（豁免仅限 catch-up）。
- **D-17**（finding 身份）：finding 闭合时行 authority 翻转 runtime、行 id 变 store 分配 id。比较器 catch-up 模式按 `discovered_at::evidence_ref` 匹配 finding 身份。

R1-H4 负向回归（28 项）不受影响：豁免仅限 basename-only 路径差异与 finding-id 形态；目录段/digest/证据变更仍必失败（负向矩阵已钉死）。

### 6.2 本轮（M2 第 2/3 步）harness 机制变更

- **手动面 finding-action 结算点镜像**：finding-action 从「末尾批处理」改为「按结算点在声明之间发布」——与 runtime 面 `settleFindingActions` 的 stage-local 轮次基数（gate 段 / review 段各自计数）逐点镜像。动因：publisher 校验 accept 时读 gate **当前**行，末尾批处理会把 PWR accept 读到后续 re-gate 的 PASS 行而拒收（ADMISSION_DENIED）。这同时更贴近真实手动流程（finding-action 本就在声明之间）。全部 50 场景零回归。
- **预算分层实证**：`maxDesignRounds`/`paused`/`DESIGN_REVISION_EXHAUSTED` 属 design-orchestrator（coordinator 装配），**不在** `runProduction` 链内核路径上；行为层入口预算为链内核 `maxRegateRounds`（按持久化回退跳转计数，`authorizeRegateDispatch` 同 permit 事务落 durable block——零 dispatch、零 revision 写）。超限暂停 4 场景经 `FactScript.maxRegateRounds=1` 透传 entry 自身选项（一次重启授权、第二次拒绝 = maxDesignRounds 2 语义）。
- **驱动器 durable-block 护栏**：预算耗尽后 recovery 仍把 regate 目标报为 next point（非 null）；无护栏会空转重 invoke 至 128 次上限。护栏 = 快照 durable block 存在即诚实停机（对应手动面「人停下不等了」——无 release 决策可 advance）。
- **比较器 final-handoff 推导**：期望终态按脚本末 gate 裁决推导——非收敛脚本（末 gate 非 PASS）期望「停在最后脚本节点的非成功终态」；47 个收敛脚本语义不变、向后兼容。

### 6.3 十条生产语义实证（评审必含）

1. findings 属 scan 轮 ledger envelope；verdict envelope 必须 `findings: []`（自带 finding 即阻断）；
2. FAIL/BU 回流由网关合成 reflow finding 授权；
3. PWR 裁决终态内接受 ledger 成员（ACCEPTED_RISK、closed_by=formal_verdict、裁决自身 scope + Gate Result blob 为证据）故不回流；
4. BU envelope 须显式 `decisionDepth: null`；
5. 闭合证据 = 确认轮 verdict 事件自身 output ref/digest（网关存 envelope 非 raw body）；
6. behavior run 的 runId 走小写；
7. 回流 = 规范序回退跳转（re-gate 是前进不是回流）；
8. ⑧ 活动执行期禁止 finding 转换——闭合的合法窗口只在 invocation 之间；
9. ⑨ invocation 内回流到 requirement-intake 无法重导 origin 规范源——requirement 级回流必须跨 run 边界；
10. ⑩ FAIL/ESCALATED verdict 合成 SOLUTION reflow 行（带边、立即失效当前 design）；agent 声明的非 SOLUTION 行不抑制合成。

本轮新增实证（附录供复审）：**finding 注册的 source revision 必须 ACTIVE 且为当前指针**（`loop-run-store.ts` appendFinding，G4-R5-H5 例外：gate 轮 finding 锚被审 revision）——PWR 轮 scan finding 的失效令被审 design v1 转 STALE，故 PWR×Re-Gate 波中 review 发现锚定被审 implementation v1（§5.1 允许任意节点产物作锚）。

## 7. 剔除项 / 退化项清单（§3 要求逐条列示，供复审复核）

| 项 | 行 | 依据 | 备注 |
| --- | --- | --- | --- |
| BLOCKED_UNKNOWN × Re-Gate | 3 | §3 剔除项原文：「verdict 无法分级时不存在重跑 Gate 的裁决输入，走回流映射——语义不可能」 | **实证备注**：建成的 BU-first 三场景本身即「BU→回流→重裁 PASS」，且 S-CORE-STANDARD-BU-overlimit-pause（单列）演示该坐标的预算耗尽终态——「不存在重跑输入」与实证存在张力，建议复审重点核对本项 |
| 升档 × BLOCKED_UNKNOWN | 2 | §3 剔除项原文：「升档返工的完成声明携带有效裁决，与无法分级互斥」 | — |
| corrupt × crash | （不涉 S-CORE 行） | §3 剔除项原文：「corrupt 终止先于任何崩溃点」 | — |
| DEEP × 升档 | 4 | 退化（非规格剔除项）：§3 round 语义限定升档仅 LIGHT→STANDARD / STANDARD→DEEP；升档族 prunes 注解「hard ceiling」 | 无场景，不建 |

## 8. 未归因 diff 单列

**无。** 全部 54 个场景条目零分歧（50 产物层归一化全文档相等 + 行为层六维全 MATCH；4 单列轨迹断言全过）。R1-H4 负向矩阵 28/28 维持 fail-closed 钉死。

机制层观察（非 diff，单列供复审参详）：§7 表中 BU×Re-Gate 剔除理由的实证张力（见该行备注）。

## 9. 结论（完成门三项逐项判定，§8）

1. **全部离线场景通过**：**PASS**。规格 52 行 = 建成 27 行（九维全绿，无分歧）+ 剔除 5 行（§3 依据，逐条列示）+ 退化 4 行（规格自身语义）；加补建 3 行（PWR×Re-Gate，裁决记录见 §5.4）。产物层 50 场景零分歧；行为层单列 4 场景轨迹断言 + durable 超限终态断言全过。完成门的「52 场景」账面按 52−5+3=50 落地，剔除/退化/补建三本账逐条可查。
2. **无 shadow executor 替代生产入口**：**PASS**。行为层驱动 = `runProduction` 生产入口本体 + 注入脚本化网关（assembly 非 shadow：真实门、真实 store、真实投影器）；产物层 = T5 store 级同事实驱动 + 真实 publisher。`--capability-source real` 与真实 CLI 全程未用（fixtures/harness/acceptance reports 授权边界内）。
3. **随后才允许申请真实 CLI run8**：**未申请**（§9：本稿不授权 run8；G6 PASS 后 next_transition 由 Current User 裁决）。

**申请**：G6 / D-090-04 离线 parity 验收 gate CLOSED。合并授权待 Current User 裁决（分支保护禁直推主线；base `feature/loop-runtime-v1`，单 PR 收口，同 M1 惯例）。
