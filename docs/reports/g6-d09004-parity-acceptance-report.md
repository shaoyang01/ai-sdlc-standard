# G6 / D-090-04 离线 parity 验收报告

> 规格：`docs/reports/decision-090-g6-parity-acceptance-spec.md`（冻结，D-2/D-3 坐标与 §4.2 两层比较、§7 本报告格式、§8 完成门）。
> 实施分支：`feat/g6-t2-m2-scenarios` @ `dca0df5`（未上主线；M1 已由 PR #195/#196 合入 `feature/loop-runtime-v1` @ `b8923fc`；M2 收口单 PR #197 已开，base `feature/loop-runtime-v1`）。
> 本报告为 G6 gate 的证据包（§7）：逐场景判定 → 汇总表 → 账目对账 → 剔除项清单 → 结论（完成门三项逐项判定）。
> 改动面纪律：M2 全部工作限于 `tests/`（fixtures/harness）与交接文档，**生产代码零改动**；D-090-04 授权边界（fixtures/harness/acceptance reports；禁真实 CLI、业务仓、shadow、合同变更）全程遵守。
> **A′ 现实声明**（Current User 2026-09-23 R1 裁决）：路由发现 R-G6-01（生产入口 c2/c3 handoff checklist 证据链双症状，见 §6.5）使**任何 conforming 完成链**的 checklist 恒 BLOCKED；A′ 口径要求该分歧 surfaced、永不报 MATCH。故行为层合并判定当前为 **0/50 按设计红态**（已知原因桶 50/50 零新因、非 dim-9 分歧 0），完成门第 1 项**等 R-G6-01 生产修复**（需 decision record + 生产代码变更，超 D-090-04 授权，单独路由）——本报告如实呈现，不掩盖、不抢跑。

## 1. 目标、范围与方法

- **目标**（§1 合同口径）：对相同 fixture，手动路径（真实 publisher 声明）与 runtime 路径（生产入口本体 `runProduction` + 脚本化确定性网关）归一化后完全等价；journal/manifest digest 不一致时 STOP_AND_REPORT。
- **两层比较**（§4.2，Current User 2026-09-20 裁决 B）：
  - **产物层**（维度 3/4/5：artifact-paths、version-state、finding-identity）：T5 store 级同事实驱动（journal 事件携带与手动面同一 raw digest，经 projector 产 manifest），`normalize()` 冻结白名单归一化后**全文档相等**为判据；维度行只作诊断归因、永不进判定路径（G6T2-R1-H4 教训）。
  - **行为层**（维度 1/2/6/7/8/9：node-sequence、gate-roles、decision-depth、next-eligibility、earliest-reroute、final-handoff）：生产入口 `runProduction` 真实门 + 注入脚本化网关的决策轨迹；参照物是两面共用的事实脚本（与脚本一致即两面一致）。dim 9 以入口返回的**真实 handoff 三元组**（status/reason/artifact ref）与声明期望逐字段比对，缺失证据拒判（R1-H1）；BLOCKED 永不报 MATCH（A′）。
  - **合并判定**：场景 PASS = 产物层全等 且 行为层六维全 MATCH；行为层维度不谎报 MATCH（NOT_JUDGED 即不判），产物层只判 3 维（R2 约束①④）。
- **无 shadow**（§8 门 2）：harness 只用真实生产入口（publisher / `runProduction` 真实门 + 注入网关）；`--capability-source real` 全程未用；真实 CLI 未调用。
- **诚实性仪器**（R1/R2 加固）：runner 输出 ① dim-9 已知原因桶 pin（必须恰等于完成场景数且签名精确，否则硬失败）；② **非 dim-9 分歧计数必须为零**（任何非 dim-9 分歧即回归，独立于桶）；③ 负向矩阵（比较器 38 项 + 行为 **49** 项）钉死 fail-closed 面。

## 2. 验证记录

环境前置：node v24.12.0；`npm test` 须 PATH 前置 `/opt/homebrew/opt/ruby@3.3/bin`（系统 2.6.10 触发 canonical gate 假阳，README Validation 区已文档化，PR #196）。

| 校验 | 命令 | 结果 |
| --- | --- | --- |
| 类型 | `npx tsc --noEmit` | **0** |
| 产物层矩阵 | `node --import tsx tests/g6-parity-matrix.test.ts` | **50 passed / 0 failed** |
| 行为层矩阵（合并判定） | `node --import tsx tests/g6-parity-behavior-matrix.test.ts` | **A′ 红态（按设计）**：合并 0 passed / 50 failed；dim-9 已知原因桶 **50/50、零新因**；**非 dim-9 分歧 0**；超限单列 **4 passed / 0 failed**（durable 终态码 `REGATE_ROUND_BUDGET_EXHAUSTED`）；退出码 1 为预期 |
| 负向（比较器 fail-open / R2-H3 逐行证明） | `node --import tsx tests/g6-parity-comparator-negative.test.ts` | **38 passed / 0 failed** |
| 负向（R1-H1 真实 handoff / R2-H1 ABSENT / R3-H1+R4-H1+H2 WP-1 波 / R1-H2 崩溃篡改 / R8-H4 三态禁写 / R9-H2 回滚后拒判） | `node --import tsx tests/g6-parity-behavior-negative.test.ts` | **49 passed / 0 failed** |
| 既有投影回归 | loop-manifest-t5-parity / loop-manifest-yaml-parity-matrix | **32/0** · **150/0**（R6 独立复跑核验） |
| 全量回归 | `npm test`（PATH 前置 ruby@3.3，并行） | 见 §2.1 |

### 2.1 全量回归与并行抖动归因

`npm test`（并行，171 文件）：**逐文件断言全绿**；文件级失败 2 = ① `tests/g6-parity-behavior-matrix.test.ts`——按 A′ 设计红的行为矩阵（退出码 1 是 §1 A′ 声明的预期形态，非失控）；② `tests/loop-codex-implementation-adapter.test.ts`——已知并行抖动（隔离复跑 220 检查 0 失败，恢复）。**更正说明（R8 复审方指出）**：日志末尾的 `Results: 1767 passed / 0 failed` 是 `system-capability-review.test.ts` 的**单文件内统计**，并行 runner 不打印跨文件断言总数——历史多处「全量 1767」均为该误述，本报告予以更正，后续以「逐文件全绿 + 文件级失败清单」表述。

已知环境抖动（非代码问题，历次在案）：并行满载下间歇 1 文件失败，已两次观察到不同文件——`loop-delivery-checkpoint-store.test.ts`（隔离 268/0 恢复）与 `loop-codex-implementation-adapter.test.ts`（隔离 220 检查 0 失败恢复）；R4/R6 复审方另观察到 `bootstrap` shell 文件因沙箱禁 AF_UNIX socket 的失败（隔离恢复）。形态一致（跨进程资源竞争），抖文件均不 import G6 harness，与本改动面无因果路径；按协议隔离复跑确认恢复。

serial 基准说明：serial runner 为 fail-fast 语义，会在按设计红的行为矩阵处停跑——**serial 全绿在 R-G6-01 修复前不可达**（这是 A′ 的真实代价，如实记录）。验收基准取并行全量 + 抖文件隔离复跑 + R6 外部独立复跑（产物 50/0、负向 38/0+41/0（R6 时点）、T5 32/0、YAML 150/0，与自述逐字吻合）。

## 3. 逐场景判定（54 节）

> 每节：唯一 scenario-id / 矩阵坐标 / 剪枝标注 / 两面轨迹摘要 / 九维逐维判定（含判定层）/ 分歧根因。九维编号见 §4；「产物层」= T5 归一化全文档相等，「行为层」= 生产入口轨迹六维。**54 节 = 54 个唯一 scenario-id 标题，一一可定位**（R7-H1 后无合并标题；程序化提取核对：54 ID ↔ 54 标题）。
> **50 个完成场景的共同行为层形态**：dims 1/2/6/7/8 MATCH、dim 9 DIVERGE——R-G6-01 已路由生产缺陷（§6.5），签名 = handoff BLOCKED + reason∈{两症状} + artifactRef 存在；A′ surfaced。逐节不再重复根因，标「△9-RG6-01」。产物层 50 场景全部归一化全文档相等。

### 3.1 S-CORE 首轮（12）

family 形状（depth=LIGHT/STANDARD/DEEP × verdict=PASS/FAIL/PWR/BU，round=first）：

- **PASS × 3**：plain 七节链，gate PASS/CONFIRMED/depth；runtime success/COMPLETED。
- **FAIL × 3**：d087 scenario-2 返工 wave（真实手动流程）：FAIL 首裁 → gate finding（SOLUTION, earliest=solution-design，锚定被审 design v1，注册即置 design v1 STALE = 回退授权来源）→ design v2 → 重裁 PASS（gate revision semver 2.0.0）→ finding 逐条关闭（绑 gate revision、verdict 产物为证据）→ 下游链。
- **PWR × 3**：§3 PWR 定义事实——scan 来源 finding 接受：scan 轮携带 canonical `loop-capability-findings:v1` ledger（1 成员），verdict 终态内经公开 `acceptFindingRisk` 风险接受（ACCEPTED_RISK、closed_by=formal_verdict、裁决自身 scope + Gate Result blob 为证据）；finding 不回流。
- **BU × 3**：gateResult FAIL + decisionStatus BLOCKED_UNKNOWN + **显式 null** depth（信封规则；缺失 depth 是另一事实、必败）；verdict 永远 succeeded 渲染决策 triple（WP6）；非通过 verdict 不产 gate revision 并密封链；转返工 wave。

#### S-CORE-LIGHT-PASS-first
- 坐标：depth=LIGHT · verdict=PASS · round=first
- 轨迹：intake→design→gate(scan+verdict PASS/CONFIRMED/LIGHT)→planning→implementation→code-review→knowledge-sync
- 九维：1 ✓行为 2 ✓行为 3 ✓产物 4 ✓产物 5 ✓产物 6 ✓行为 7 ✓行为 8 ✓行为 9 △9-RG6-01

#### S-CORE-LIGHT-FAIL-first
- 坐标：depth=LIGHT · verdict=FAIL · round=first
- 轨迹：返工 wave（见 family FAIL 形状，深度 LIGHT）
- 九维：1-8 ✓（层同上）· 9 △9-RG6-01

#### S-CORE-LIGHT-PASS_WITH_RISK-first
- 坐标：depth=LIGHT · verdict=PWR · round=first
- 轨迹：PWR 形状（见 family）；scan finding F01 终态内风险接受
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-CORE-LIGHT-BLOCKED_UNKNOWN-first
- 坐标：depth=LIGHT · verdict=BU · round=first
- 轨迹：BU 首裁 → 返工 wave → PASS
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-CORE-STANDARD-PASS-first
- 坐标：depth=STANDARD · verdict=PASS · round=first
- 轨迹：plain 七节链（family PASS 形状），深度 STANDARD
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-CORE-STANDARD-FAIL-first
- 坐标：depth=STANDARD · verdict=FAIL · round=first
- 轨迹：d087 返工 wave（family FAIL 形状），深度 STANDARD
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-CORE-STANDARD-PASS_WITH_RISK-first
- 坐标：depth=STANDARD · verdict=PWR · round=first
- 轨迹：family PWR 形状（scan ledger F01 终态内风险接受），深度 STANDARD
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-CORE-STANDARD-BLOCKED_UNKNOWN-first
- 坐标：depth=STANDARD · verdict=BU · round=first
- 轨迹：BU 首裁（显式 null depth）→ 返工 wave → PASS，深度 STANDARD
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-CORE-DEEP-PASS-first
- 坐标：depth=DEEP · verdict=PASS · round=first
- 轨迹：plain 七节链，深度 DEEP
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-CORE-DEEP-FAIL-first
- 坐标：depth=DEEP · verdict=FAIL · round=first
- 轨迹：d087 返工 wave，深度 DEEP
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-CORE-DEEP-PASS_WITH_RISK-first
- 坐标：depth=DEEP · verdict=PWR · round=first
- 轨迹：family PWR 形状，深度 DEEP
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-CORE-DEEP-BLOCKED_UNKNOWN-first
- 坐标：depth=DEEP · verdict=BU · round=first
- 轨迹：BU 首裁 → 返工 wave → PASS，深度 DEEP
- 九维：1-8 ✓ · 9 △9-RG6-01

### 3.2 S-CORE 升档（4）

family 形状（d087 升档波）：R1 PASS+ESCALATED 携带**新** required_depth（publisher 同发布更新 = 投影器 foldDepth，代码级互证）；§5.4 reflow 授权（FAIL/ESCALATED verdict 欠链 reflow 事实由 store `registerReflowFinding` 合成——harness 显式注册，Fa 绑该轮 design revision）；design 按升档深度重建；R2 重裁 PASS/PWR 且 CONFIRMED。

#### S-CORE-LIGHT-PASS-upgrade
- 坐标：depth=LIGHT · verdict=PASS · round=upgrade（LIGHT→STANDARD）
- 轨迹：intake→design v1→gate R1(PASS/ESCALATED, depth=STANDARD)→design v2→gate R2(PASS/CONFIRMED/STANDARD)→下游链
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-CORE-LIGHT-PASS_WITH_RISK-upgrade
- 坐标：depth=LIGHT · verdict=PWR · round=upgrade（LIGHT→STANDARD，R2 终裁 PWR）
- 轨迹：同上升档形状，R2 = PASS_WITH_RISK/CONFIRMED/STANDARD
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-CORE-STANDARD-PASS-upgrade
- 坐标：depth=STANDARD · verdict=PASS · round=upgrade（STANDARD→DEEP）
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-CORE-STANDARD-PASS_WITH_RISK-upgrade
- 坐标：depth=STANDARD · verdict=PWR · round=upgrade（STANDARD→DEEP，R2 终裁 PWR）
- 九维：1-8 ✓ · 9 △9-RG6-01

### 3.3 S-CORE 多轮返工（A，3）

family 形状（finding 持续累积模型 = Current User 2026-09-21 定案的现实手动复审流程）：finding 是全局集合（无 partial 态），每轮回退由 OPEN 集合授权、各自确认轮绑该轮 revision 闭合；**每轮一个 finding**（两条引擎硬约束：同轮 finding 共享 scan-ledger blob 令 takeover 配对歧义拒判；投影 provenance 要求闭捆 revision ref 唯一——两 finding 绑同轮 revision = duplicate-closures MANIFEST_CORRUPT_STOP）。形态 FAIL→FAIL→FAIL→PASS：R1 注册 Fa→FAIL；R2 关 Fa（design v2）、注册 Fb→FAIL；R3 关 Fb（design v3）、注册 Fc→FAIL；R4 关 Fc（design v4）→PASS。

#### S-CORE-LIGHT-FAIL-multiround
- 坐标：depth=LIGHT · verdict=FAIL · round=re-gate
- 轨迹：4 轮 verdict（FAIL×3 BLOCKED → PASS ELIGIBLE）；Fa/Fb/Fc 各绑 design v2/v3/v4 闭合；gate revision 恰 1（PASS，semver 4.0.0）；design v1-v3 STALE、v4 ACTIVE；两面 findingIndex 三行深比较一致（1:1）
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-CORE-STANDARD-FAIL-multiround
- 坐标：depth=STANDARD · verdict=FAIL · round=re-gate（同 family 形状）
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-CORE-DEEP-FAIL-multiround
- 坐标：depth=DEEP · verdict=FAIL · round=re-gate（同 family 形状）
- 九维：1-8 ✓ · 9 △9-RG6-01

### 3.4 S-CORE review 本地返工（B，3）

family 形状（wms-monitor 生产实证：lifecycle-actions 22 个 + config-page-usability 4 个 code-review findings）：review 段 IMPLEMENTATION finding（earliest=implementation，注册即失效被审 impl 当前 = 重启授权）→ impl v2 → re-review 闭合（绑 impl revision、**重审产物**为证据）；gate 首轮通过、本波不触发 re-gate（流程模型定案：仅方案/需求级问题才 re-gate）。

#### S-CORE-LIGHT-PASS-reviewwave
- 坐标：depth=LIGHT · verdict=PASS · round=first（gate 首轮 PASS；返工在 review 段）
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-CORE-STANDARD-PASS-reviewwave
- 坐标：depth=STANDARD · verdict=PASS · round=first
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-CORE-DEEP-PASS-reviewwave
- 坐标：depth=DEEP · verdict=PASS · round=first
- 九维：1-8 ✓ · 9 △9-RG6-01

### 3.5 S-CORE review 发现方案问题→re-gate（C，3）

family 形状（wms-monitor 生产实证 lifecycle-actions CR-F12）：review finding（SOLUTION, earliest=solution-design）→ reflow design → re-gate 闭合（绑 design v2、**design 产物**为证据，closed_by=code-review）；下游按规范序重跑后通过。re-gate 轮次按 stage 独立计数（gate 段 / review 段各一套）。

#### S-CORE-LIGHT-PASS-review-regate
- 坐标：depth=LIGHT · verdict=PASS · round=re-gate
- 轨迹：intake→design v1→gate R1 PASS→planning→impl v1→review v1(CR-F01)→reflow→design v2→gate R2 PASS→planning v2→impl v2→review v2 闭合→sync
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-CORE-STANDARD-PASS-review-regate
- 坐标：depth=STANDARD · verdict=PASS · round=re-gate
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-CORE-DEEP-PASS-review-regate
- 坐标：depth=DEEP · verdict=PASS · round=re-gate（+E/F×2 同坐标加挂，见 §5.3）
- 九维：1-8 ✓ · 9 △9-RG6-01

### 3.6 S-CORE PWR × Re-Gate（3，账目对账补建）

family 形状：冻结矩阵 PWR×Re-Gate 行（2026-09-23 对账发现无场景且无剔除依据——规划遗漏，Current User 裁决补建，记录见 §5.4）。落地 = C 族 re-gate 授权 + PWR 首轮（scan finding 风险接受）。新实证生产语义：**finding 注册的 source revision 必须 ACTIVE 且为当前指针**（`loop-run-store.ts` appendFinding）——PWR 轮 scan finding 的失效令被审 design v1 转 STALE，故 review 发现（CR-F01）锚定改挂被审 **implementation v1**（§5.1 允许任意节点产物作发现锚），earliest（回流目标）不变。手动面 finding-action 结算点镜像修复随之落地（§6.2）。

#### S-CORE-LIGHT-PASS_WITH_RISK-review-regate
- 坐标：depth=LIGHT · verdict=PWR · round=re-gate（补建行）
- 轨迹：intake→design v1→gate R1(PWR：scan ledger F01 终态内风险接受)→planning→impl v1→review v1(CR-F01，锚 impl v1)→reflow→design v2→gate R2 PASS→planning v2→impl v2→review v2→sync
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-CORE-STANDARD-PASS_WITH_RISK-review-regate
- 坐标：depth=STANDARD · verdict=PWR · round=re-gate（补建行）
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-CORE-DEEP-PASS_WITH_RISK-review-regate
- 坐标：depth=DEEP · verdict=PWR · round=re-gate（补建行）
- 九维：1-8 ✓ · 9 △9-RG6-01

### 3.7 S-CORE gate 发现需求级回流（D，1）

#### S-CORE-DEEP-FAIL-requirement-reflow
- 坐标：depth=DEEP · verdict=FAIL · round=re-gate（加挂于 DEEP×FAIL×Re-Gate 行）
- 剪枝：wms-monitor 生产实证 config-page-usability F07：REQUIREMENT finding（earliest=requirement-intake）锚定被审 intake revision、**verdict 信封登记**（§5.4 边必须来自 verdict 注册——scan 注册按设计不带边、无法触发 intake 回流；语义 ⑩：agent 声明的非 SOLUTION 行不抑制合成 reflow，故本波多一条 SOLUTION 行，harness 显式闭合）；失效全 scope、回流 requirement-intake；整链从 intake 重跑，确认 re-gate（gate stage round 2）绑新 intake revision 闭合。requirement 级回流跨 invocation 边界（语义 ⑨）。
- 轨迹：intake v1→design v1→gate R1 FAIL(G01 REQUIREMENT + 合成 SOLUTION 行)→整链回退→intake v2→design v2→gate R2 PASS→下游链
- 九维：1-8 ✓ · 9 △9-RG6-01

### 3.8 S-CORE review 发现需求补充（E，1）

#### S-CORE-DEEP-PASS-requirement-reflow
- 坐标：depth=DEEP · verdict=PASS · round=re-gate（加挂于 DEEP×PASS×Re-Gate 行）
- 剪枝：需求补充路径（同 D 机制换发现节点：review 阶段 REQUIREMENT finding，信封登记带边）；重审查（review stage round 2）绑新 intake revision 闭合。
- 轨迹：intake v1→design→gate R1 PASS→planning→impl→review v1(F01 REQUIREMENT)→整链回退→intake v2→design v2→gate R2 PASS→下游 v2→sync
- 九维：1-8 ✓ · 9 △9-RG6-01

### 3.9 S-CORE 反馈驱动 re-gate（F，2）

family 形状（零 finding 的非 finding 路径）：WP-1 `FEEDBACK_DRIVEN_CHANGE` 记录开启新代际，生产 recovery 自行推导二代整链重建（从 intake）；授权经 store regate 上下文 feedback 分支。harness 在触发终态 settle 后的 invocation 间窗口落记录（多轮/G/D/E/F 有界 invocation，闭合与记录均落合法窗口——语义 ⑧）。R3/R4/R5 三轮复审后，dim 7 的 WP-1 放行以 **journal 记录证据**为据：逐波声明校验（`verifyDeclaredWaves`）唯一所有——每波恰一条已验证记录（FEEDBACK_DRIVEN_CHANGE/CLASSIFIED/触发轮归因，歧义拒判）、有序代际绑定（previousGeneration=波序）、末波锚 run 最终代际、重启 intake 的新代际 attempt；gate 轮分支只留结构性准入（已声明必须实际 restart 到 intake——R4-H2）。

#### S-CORE-DEEP-PASS-feedback-regate-post-review
- 坐标：depth=DEEP · verdict=PASS · round=re-gate（加挂于 DEEP×PASS×Re-Gate 行；触发点=一代整链完成后）
- 轨迹：一代整链（intake→…→review v1，WP-1 记录于 invocation 间）→二代从 intake 全链重建→gate 二代 PASS→下游→sync；重启 intake attempt 2
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-CORE-DEEP-PASS-feedback-regate-post-gate
- 坐标：depth=DEEP · verdict=PASS · round=re-gate（加挂；触发点=gate verdict 后、一代中断）
- 轨迹：一代至 gate v1 verdict（WP-1 记录）→二代从 intake 重建→gate 二代 PASS→下游→sync
- 九维：1-8 ✓ · 9 △9-RG6-01

### 3.10 S-CORE 升档 × FAIL（G，2）

#### S-CORE-LIGHT-FAIL-upgrade
- 坐标：depth=LIGHT · verdict=FAIL · round=upgrade（LIGHT→STANDARD）
- 剪枝：升档 × FAIL：R1 ESCALATED 注册 Fa；R2 关 Fa（design v2）、注册 Fb 并 FAIL；R3 关 Fb（design v3）PASS；gate stage 轮次独立计数。
- 轨迹：intake→design v1→gate R1(PASS/ESCALATED, 新深度)→design v2→gate R2 FAIL→design v3→gate R3 PASS→下游链
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-CORE-STANDARD-FAIL-upgrade
- 坐标：depth=STANDARD · verdict=FAIL · round=upgrade（STANDARD→DEEP）
- 九维：1-8 ✓ · 9 △9-RG6-01

### 3.11 S-MANIFEST（2）

#### S-MANIFEST-STANDARD-reconcile
- 坐标：depth=STANDARD · verdict=PASS · round=first · manifest=reconcile
- 剪枝：V9 语义：中途 takeover + 混合追平——journal 尾段与 finding 闭合一次原子落盘，重放 NO_OP 逐字节稳定；两面在 code-review 轮同点快照。R2-H3 后 D-17 赦免升级为逐行 journal 证明（证假必败）。
- 轨迹：中途快照 → runtime takeover 投影 → 尾段 catch-up → 最终文档逐字节一致
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-MANIFEST-STANDARD-corrupt
- 坐标：depth=STANDARD · verdict=PASS · round=first · manifest=corrupt
- 剪枝：篡改 self-digest 后投影器 `MANIFEST_CORRUPT_STOP` fail-closed，单级判别（冻结规格：与 verdict/round 无组合语义）；行为层只做轨迹回放 + fail-closed 断言。
- 轨迹：runtime takeover 基线被篡改 → 投影 fail-closed STOP；行为层轨迹同首轮 PASS
- 九维：1 ✓行为 2 ✓行为 3-5 = fail-closed STOP 断言（产物层单级判别，非比较） 6-8 ✓行为 · 9 △9-RG6-01

### 3.12 S-CRASH（6，R1-H2 中断-重入）

family 形状（2026-09-24 R1-H2 落地）：行为层从「store 级崩溃/恢复语义回放」升级为**经生产入口走真实恢复路径的中断-重入**——首 invocation 以 `maxDispatches` 安全边界在崩溃点 dispatch 边界中断（纯循环边界、不落持久 block），同 runId 重入续跑。manifest 库以手动面中间态清单播种，入口 takeover 后每终态投影点持续 catch-up，journal/manifest 追赶可观测。三崩溃点映射：post-gate-verdict = 首轮 gate verdict 后；post-finding-migration = 闭合窗（fix revision 物化后、finding 于 invocation 间窗口结算）；pre-manifest-write = 倒数第二 dispatch 后（末终态及其投影故意落在重入里，成为可捕获的丢失写）。丢失写模拟：回滚到**中断窗口处捕获的已接管清单**（journal 背书、normal catch-up 路径——两面 digest 覆盖对象按设计不同，对 populated journal 重新 takeover manual 种子必在 B2 digest 检查漂移，故 manual 种子只作 takeover-A 引导），重入必须逐字节重推一致；双恢复第二次重入零 dispatch 且清单字节稳定（NO_OP）。产物层 store 级 digest 对照保留（不代称入口恢复）。六场景共同断言：`interruptedAtBoundary=true`、`duplicateDispatches=0`、**`manifestCaughtUp=true`**（R7-H2 后：清单 taken-over cursor 必须追平 journal head——「文件存在」不再足够，落后即假绿）；pre-manifest-write 两场景另证 `lostWriteOccurred=true`（末次投影确已发生：文档相对中断窗口态发生分化，回滚/重推分支确已执行——非 vacuous pass）+ `redriveByteIdentical=true`；**三个** double-resume 场景另证 `doubleResumeNoOp=true`（拒判时不得记 NO_OP——R9-H2：零 dispatch 对着被拒清单不证明任何事）；全部六场景另证 `refusedManifestStable=true`（R8-H4：无 manifest STOP 拒绝时不适用；一旦拒绝，驱动不得改写被拒字节）。runner 独立计数：分母取自 **S-CRASH 注册表**（冻结六场景族身份，非待核验的 crashPoint——R9-H1：crashPoint 全缺失时旧计数退化为 0/0 无专属失败），**6/6 必须全部返回非空事实且 crashPoint 齐全**，硬失败。

#### S-CRASH-STANDARD-post-gate-verdict-resume
- 坐标：depth=STANDARD · verdict=PASS · round=first · crash=post-gate-verdict（干净 PASS 链：gate verdict 后 journal 尾段未投影）
- 轨迹：中断于首轮 verdict 后（4 dispatch）→ 重入续跑尾段（planning/impl/review/sync）→ 每终态投影 catch-up → COMPLETED；手动侧 publisher 同输入重放逐字节幂等（已断言）
- 九维：1-8 ✓ · 9 △9-RG6-01；崩溃事实：interrupt@boundary ✓ 零重派 ✓ manifest ✓

#### S-CRASH-STANDARD-post-gate-verdict-double-resume
- 坐标：同上 · crash=post-gate-verdict · 双恢复
- 轨迹：同上 + 第二次重入零 dispatch、清单字节稳定（NO_OP）
- 九维：1-8 ✓ · 9 △9-RG6-01；崩溃事实：interrupt ✓ 零重派 ✓ manifest ✓ doubleNoOp ✓

#### S-CRASH-STANDARD-post-finding-migration-resume
- 坐标：depth=STANDARD · verdict=PASS · round=first · crash=post-finding-migration（review 返工链；finding 迁移后未投影）
- 轨迹：中断于闭合窗（impl v2 物化后）→ invocation 间窗口 finding 闭合（绑 impl v2）→ 重入续跑 re-review + sync → catch-up 追平 → COMPLETED
- 九维：1-8 ✓ · 9 △9-RG6-01；崩溃事实：interrupt ✓ 零重派 ✓ manifest ✓

#### S-CRASH-STANDARD-post-finding-migration-double-resume
- 坐标：同上 · 双恢复
- 九维：1-8 ✓ · 9 △9-RG6-01；崩溃事实：interrupt ✓ 零重派 ✓ manifest ✓ doubleNoOp ✓

#### S-CRASH-STANDARD-pre-manifest-write-resume
- 坐标：depth=STANDARD · verdict=PASS · round=first · crash=pre-manifest-write（投影已运行、写丢失）
- 轨迹：中断于倒数第二 dispatch → 窗口捕获已接管清单 → 重入派发末终态及其投影（=丢失写，捕获）→ 回滚到窗口清单 → 再重入重推 → **逐字节一致** → COMPLETED
- 九维：1-8 ✓ · 9 △9-RG6-01；崩溃事实：interrupt ✓ 零重派 ✓ manifest ✓ redriveByteIdentical ✓

#### S-CRASH-STANDARD-pre-manifest-write-double-resume
- 坐标：同上 · 双恢复
- 轨迹：同上 + 第二次重入零 dispatch、清单字节稳定
- 九维：1-8 ✓ · 9 △9-RG6-01；崩溃事实：interrupt ✓ 零重派 ✓ manifest ✓ redrive ✓ doubleNoOp ✓

### 3.13 S-INIT（8）

family 形状（D-088-01 重基线四类初始化）：类差异在 requirement-intake 节点收敛（intake 携带的 init 材料不同）、其后链同构；每类 × STANDARD × {PASS 首轮, FAIL 回流}。

#### S-INIT-new-project-STANDARD-PASS-first
- 坐标：init=new-project（NEW_EMPTY）· depth=STANDARD · verdict=PASS · round=first
- 轨迹：intake（empty repo + requirement doc 材料）→ 其后与 S-CORE STANDARD PASS 首轮同构
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-INIT-new-project-STANDARD-FAIL-reflow
- 坐标：init=new-project（NEW_EMPTY）· depth=STANDARD · verdict=FAIL · round=first（回流形状）
- 轨迹：intake（类特有材料）→ FAIL 首裁 → 返工 wave → PASS
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-INIT-existing-code-STANDARD-PASS-first
- 坐标：init=existing-code（EXISTING_CODE_NO_KNOWLEDGE）· depth=STANDARD · verdict=PASS · round=first
- 轨迹：intake（codebase survey + requirement doc）→ 其后同构
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-INIT-existing-code-STANDARD-FAIL-reflow
- 坐标：init=existing-code · depth=STANDARD · verdict=FAIL · round=first
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-INIT-original-sdd-STANDARD-PASS-first
- 坐标：init=original-sdd（LEGACY_SDD：PRESERVE/TRANSFORM/RETIRE disposition）· depth=STANDARD · verdict=PASS · round=first
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-INIT-original-sdd-STANDARD-FAIL-reflow
- 坐标：init=original-sdd · depth=STANDARD · verdict=FAIL · round=first
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-INIT-original-sdlc-sdd-STANDARD-PASS-first
- 坐标：init=original-sdlc-sdd（LEGACY_SDLC_SDD）· depth=STANDARD · verdict=PASS · round=first
- 九维：1-8 ✓ · 9 △9-RG6-01

#### S-INIT-original-sdlc-sdd-STANDARD-FAIL-reflow
- 坐标：init=original-sdlc-sdd · depth=STANDARD · verdict=FAIL · round=first
- 九维：1-8 ✓ · 9 △9-RG6-01

> **规格-实现边界发现（R1-H2 调查结论，如实单列）**：四类初始化在生产入口路径**无行为面**——init 类属 D-088-01 初始化器层概念（Decision-090/091），入口请求 `sourceFiles` 全仓无下游消费者（`loop-production-entry.ts` 仅校验数组、允许空；`loop-intake-manifest.ts` 的非空要求不在 runProduction 路径）。§3「init 类影响入口节点与 readiness preflight」只剩 intake 材料差异被脚本建模。**须区分**：入口已有的 manifest readiness preflight（`resolveManifestReadiness` 三态）≠ 初始化 readiness——后者无法经本入口 parity。处置：本报告如实记录（不伪造覆盖）；路由建议：§3 论证修订，或 init 类 parity 归 D-088-01 验收面。

### 3.14 超限暂停（行为层单列，4）

> 产物层无法 parity：FAIL/BLOCKED_UNKNOWN verdict 不产出 gate revision（WP6），pending gate 行 triple 在两漂——同 D-7/D-17 分析。此 4 节只作行为层轨迹断言 + durable 超限终态断言，**runner 单列，不计入产物层通过数**（R2 诚实性约束④）。
> family 形状：两轮非收敛裁决后，轮数预算拒绝第二次重启——runtime durable 终态 `REGATE_ROUND_BUDGET_EXHAUSTED`（journal 持久 block、零 dispatch 落定；仅 `releaseRunRegateBlock` 的 RISK_ACCEPTED/SCOPE_RESET 可释放）；手动面对应「人停下不等了」（无 release 决策）。预算经 `FactScript.maxRegateRounds=1` 透传 entry 自身选项（一次重启授权、第二次拒绝 = maxDesignRounds 2 的轮预算语义；同 maxDispatches 性质的边界参数，非 shadow）。停机时 OPEN 集即手动面「修复待办」形状（F01 闭合、F02 与合成 reflow 行保持 OPEN）。

#### S-CORE-LIGHT-FAIL-overlimit-pause
- 坐标：depth=LIGHT · verdict=FAIL · round=re-gate（行为层 only；与 A 族 Re-Gate×FAIL 同行第二种粒度）
- 九维：1/2/6/7/8 ✓行为 · 3/4/5 不判（明示 NOT_JUDGED） · 9 ✓行为（ABSENT 期望：链未完成、无 handoff 工件，三字段全 null）
- 终态码实测：`REGATE_ROUND_BUDGET_EXHAUSTED`

#### S-CORE-STANDARD-FAIL-overlimit-pause
- 坐标：depth=STANDARD · verdict=FAIL · round=re-gate（行为层 only）
- 九维：同上；终态码实测：`REGATE_ROUND_BUDGET_EXHAUSTED`

#### S-CORE-DEEP-FAIL-overlimit-pause
- 坐标：depth=DEEP · verdict=FAIL · round=re-gate（行为层 only）
- 九维：同上；终态码实测：`REGATE_ROUND_BUDGET_EXHAUSTED`

#### S-CORE-STANDARD-BU-overlimit-pause
- 坐标：depth=STANDARD · verdict=BU · round=re-gate（行为层 only；落在规格剔除行「STANDARD BU×Re-Gate」上作轨迹演示）
- 九维：同上；终态码实测：`REGATE_ROUND_BUDGET_EXHAUSTED`

## 4. 汇总表（规格 52 行 × 九维 + 落地映射）

九维通过矩阵（✓=MATCH；△=dim-9 R-G6-01 已路由 surfaced 分歧（A′）；剔=规格剔除项；退=退化项；补=本周期补建；STOP=产物层 fail-closed 单级断言）：

| # | 规格行（depth × verdict × round / 家族） | 落地场景 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | LIGHT×PASS×首轮 | S-CORE-LIGHT-PASS-first | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| 2 | LIGHT×FAIL×首轮 | S-CORE-LIGHT-FAIL-first | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| 3 | LIGHT×PWR×首轮 | S-CORE-LIGHT-PASS_WITH_RISK-first | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| 4 | LIGHT×BU×首轮 | S-CORE-LIGHT-BLOCKED_UNKNOWN-first | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| 5-8 | STANDARD×{PASS,FAIL,PWR,BU}×首轮 | S-CORE-STANDARD-*-first | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| 9-12 | DEEP×{PASS,FAIL,PWR,BU}×首轮 | S-CORE-DEEP-*-first | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| 13 | LIGHT×PASS×升档 | S-CORE-LIGHT-PASS-upgrade | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| 14 | LIGHT×FAIL×升档 | S-CORE-LIGHT-FAIL-upgrade | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| 15 | LIGHT×PWR×升档 | S-CORE-LIGHT-PASS_WITH_RISK-upgrade | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| 16 | LIGHT×BU×升档 | —（升档×BU，规格剔除） | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 |
| 17 | STANDARD×PASS×升档 | S-CORE-STANDARD-PASS-upgrade | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| 18 | STANDARD×FAIL×升档 | S-CORE-STANDARD-FAIL-upgrade | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| 19 | STANDARD×PWR×升档 | S-CORE-STANDARD-PASS_WITH_RISK-upgrade | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| 20 | STANDARD×BU×升档 | —（升档×BU，规格剔除） | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 |
| 21-24 | DEEP×{PASS,FAIL,PWR,BU}×升档 | —（退化：DEEP 无升档目标，hard ceiling） | 退 | 退 | 退 | 退 | 退 | 退 | 退 | 退 | 退 |
| 25 | LIGHT×PASS×Re-Gate | S-CORE-LIGHT-PASS-review-regate | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| 26 | LIGHT×FAIL×Re-Gate | S-CORE-LIGHT-FAIL-multiround | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| 27 | LIGHT×PWR×Re-Gate | S-CORE-LIGHT-PASS_WITH_RISK-review-regate（补建） | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| 28 | LIGHT×BU×Re-Gate | —（BU×Re-Gate，规格剔除；轨迹演示见单列） | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 |
| 29 | STANDARD×PASS×Re-Gate | S-CORE-STANDARD-PASS-review-regate | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| 30 | STANDARD×FAIL×Re-Gate | S-CORE-STANDARD-FAIL-multiround | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| 31 | STANDARD×PWR×Re-Gate | S-CORE-STANDARD-PASS_WITH_RISK-review-regate（补建） | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| 32 | STANDARD×BU×Re-Gate | —（剔除；S-CORE-STANDARD-BU-overlimit-pause 单列演示） | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 |
| 33 | DEEP×PASS×Re-Gate | S-CORE-DEEP-PASS-review-regate（+E/F×2 同坐标加挂） | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| 34 | DEEP×FAIL×Re-Gate | S-CORE-DEEP-FAIL-multiround（+D 同坐标加挂） | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| 35 | DEEP×PWR×Re-Gate | S-CORE-DEEP-PASS_WITH_RISK-review-regate（补建） | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| 36 | DEEP×BU×Re-Gate | —（BU×Re-Gate，规格剔除） | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 | 剔 |
| 37-40 | S-INIT：四类×STANDARD×PASS×首轮 | S-INIT-*-STANDARD-PASS-first | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| 41-44 | S-INIT：四类×STANDARD×FAIL×回流 | S-INIT-*-STANDARD-FAIL-reflow | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| 45 | S-MANIFEST reconcile | S-MANIFEST-STANDARD-reconcile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| 46 | S-MANIFEST corrupt | S-MANIFEST-STANDARD-corrupt | ✓ | ✓ | STOP | STOP | STOP | ✓ | ✓ | ✓ | △ |
| 47-48 | S-CRASH post-gate-verdict（resume/double） | S-CRASH-STANDARD-post-gate-verdict-* | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| 49-50 | S-CRASH post-finding-migration（resume/double） | S-CRASH-STANDARD-post-finding-migration-* | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |
| 51-52 | S-CRASH pre-manifest-write（resume/double） | S-CRASH-STANDARD-pre-manifest-write-* | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | △ |

**行为层单列（不占规格 52 行计数）**：

| 场景 | 坐标 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S-CORE-LIGHT-FAIL-overlimit-pause | LIGHT/FAIL/re-gate | ✓ | ✓ | 不判 | 不判 | 不判 | ✓ | ✓ | ✓ | ✓ |
| S-CORE-STANDARD-FAIL-overlimit-pause | STANDARD/FAIL/re-gate | ✓ | ✓ | 不判 | 不判 | 不判 | ✓ | ✓ | ✓ | ✓ |
| S-CORE-DEEP-FAIL-overlimit-pause | DEEP/FAIL/re-gate | ✓ | ✓ | 不判 | 不判 | 不判 | ✓ | ✓ | ✓ | ✓ |
| S-CORE-STANDARD-BU-overlimit-pause | STANDARD/BU/re-gate | ✓ | ✓ | 不判 | 不判 | 不判 | ✓ | ✓ | ✓ | ✓ |

## 5. 账目对账（规格 52 ↔ 落地 54，三本账）

### 5.1 分解

规格 52 = S-CORE 36（depth×verdict×round 全交叉）+ S-INIT 8 + S-MANIFEST 2 + S-CRASH 6（§3）。S-INIT/S-MANIFEST/S-CRASH 与建成 1:1 对齐，无争议；全部对账张力在 S-CORE 36 行。

| 账 | 行数 | 明细 |
| --- | --- | --- |
| 规格剔除（剔） | 5 | 升档×BU ×2（LIGHT/STANDARD，§3 剔除项）；BU×Re-Gate ×3（§3 剔除项） |
| 退化（退） | 4 | DEEP×升档 ×4：§3 round 语义限定升档仅 LIGHT→STANDARD / STANDARD→DEEP，hard ceiling |
| 同行加挂（挂） | 7 | B×3（首轮 PASS 行：gate-first-pass vs review 本地返工两种粒度）；E/F×3（DEEP×PASS×Re-Gate 行：requirement 回流 / feedback 重建两种授权路径）；D×1（DEEP×FAIL×Re-Gate 行：requirement 级回流 vs finding 多轮） |
| 建成行（S-CORE） | 27 | 36 − 5 − 4；首轮 12 + 升档 6（PASS/FAIL/PWR × LIGHT/STANDARD）+ Re-Gate 9（PASS/FAIL × 3 深度 + **补建 PWR×Re-Gate ×3**） |
| 非 S-CORE 建成 | 16 | S-INIT 8 + S-MANIFEST 2 + S-CRASH 6（1:1） |

### 5.2 账面闭合

- 规格行覆盖：52 = 27 建成 + 5 剔除 + 4 退化 + 16 非 S-CORE（1:1）✓（S-CORE：27+5+4=36 ✓）
- 落地场景：**50 = 27 + 7（加挂）+ 16**；总公式 **52 − 5（剔）− 4（退）+ 7（挂）= 50** ✓（补建 3 行已含于 27 建成行内——补建前为 24 行，补建后 27）
- 行为层单列 **4**（超限暂停）：FAIL×3 与 A 族 Re-Gate×FAIL 同行第二种粒度（预算耗尽终态 vs 收敛终态）；BU×1 落被剔除的 STANDARD BU×Re-Gate 行（轨迹演示，不占行计数）
- 两层合计落地 **54** 个可定位条目；产物层通过数恒为 50，单列 4 不计入（runner 独立摘要行明示）

### 5.3 补建裁决记录（2026-09-23）

账目对账（程序化提取全部场景坐标与规格 §3 逐行比对）发现 **PWR×Re-Gate ×3 无场景、无剔除依据**——属 M2 家族规划遗漏（规格 36 行内的合法坐标：re-gate 终裁 PWR 无语义障碍）。Current User 裁决选项 A 补建（备选 B「事后列剔除」无规格依据、削弱完成门成色，弃）。落地形态：C 族 re-gate 授权 + PWR 首轮，3 深度全建，首跑即过（含手动面 finding-action 结算点镜像修复，见 §6.2）。

## 6. 机制层说明

### 6.1 D-7 / D-17 表示分歧（finding-identity 维度，dim 5）

catch-up 路径会把 cursor 后有事件的节点行整体替换为 runtime 推导行，与手动 publisher 规范存在两处**设计内**表示差异（Current User 裁决选项 A：比较器镜像豁免，非改生产）：

- **D-7**（artifact basename）：runtime 推导英文 canonical 名 vs publisher 硬 gate 强制中文规范名；投影器 `pathSemanticKey` 故意不含 basename。比较器 catch-up 模式按「目录段::capability」语义键比路径；**takeover 机制场景保持逐字节字面比较**（豁免仅限 catch-up）。
- **D-17**（finding 身份）：finding 闭合时行 authority 翻转 runtime、行 id 变 store 分配 id。比较器 catch-up 模式按 `discovered_at::evidence_ref` 匹配 finding 身份；**R2-H3 后赦免升级为逐行 journal 证明**：仅当 runtime ID 经 store 证实（`findingProof`：身份键 → {id, status}，runner 从 journal 事实传入）且与手动行在稳定身份上配对、行为闭合行（RESOLVED/ACCEPTED）、行的 id 正是 journal 绑定该身份的 store id、journal 状态已闭合，才赦免该行的 ID 翻转；OPEN 行/未配对/伪造 ID/同 run 兄弟行 ID/重复配对全部字面比较必败；无证传入时零赦免（fail closed）。

R1-H4 负向回归（38 项，含 R2-H3 新增 5 项）维持 fail-closed 钉死：豁免仅限 basename-only 路径差异与经证实 finding-id 形态；目录段/digest/证据变更仍必失败。

### 6.2 M2 harness 机制变更

- **手动面 finding-action 结算点镜像**：finding-action 从「末尾批处理」改为「按结算点在声明之间发布」——与 runtime 面 `settleFindingActions` 的 stage-local 轮次基数（gate 段 / review 段各自计数）逐点镜像。动因：publisher 校验 accept 时读 gate **当前**行，末尾批处理会把 PWR accept 读到后续 re-gate 的 PASS 行而拒收（ADMISSION_DENIED）。同时更贴近真实手动流程。全部 50 场景零回归。
- **预算分层实证**：`maxDesignRounds`/`paused`/`DESIGN_REVISION_EXHAUSTED` 属 design-orchestrator（coordinator 装配），**不在** `runProduction` 链内核路径上；行为层入口预算为链内核 `maxRegateRounds`（按持久化回退跳转计数，`authorizeRegateDispatch` 同 permit 事务落 durable block——零 dispatch、零 revision 写）。超限暂停 4 场景经 `FactScript.maxRegateRounds=1` 透传 entry 自身选项（一次重启授权、第二次拒绝 = maxDesignRounds 2 语义）。
- **驱动器 durable-block 护栏**：预算耗尽后 recovery 仍把 regate 目标报为 next point（非 null）；无护栏会空转重 invoke 至 128 次上限。护栏 = 快照 durable block 存在即诚实停机（对应手动面「人停下不等了」——无 release 决策可 advance）。
- **比较器 final-handoff（dim 9）重构（R1-H1）**：以入口返回的**真实 handoff 三元组**与声明期望（`FactScript.expectedHandoff`，缺省按脚本终态形状推导）逐字段比对；缺失证据拒判；BLOCKED 永不报 MATCH。
- **行为层 WP-1 波证据化（R2-H1-A→R3-H1→R4-H1/H2→R5-H1 四轮加固）**：记录证据从 gate 轮分支摘出、归 `verifyDeclaredWaves` 逐波声明校验唯一所有（任意触发类型、按声明序、有序代际、末波锚、重启 attempt、未匹配记录反向审计）；gate 轮分支只留结构性准入。
- **S-CRASH 中断-重入（R1-H2，2026-09-24；R7-H2/R8-H3/R8-H4/R9-H1/R9-H2 五轮加固）**：见 §3.12 family 形状。runner 断言崩溃事实（interruptedAtBoundary / 零重派 / **manifestCaughtUp（cursor=journal head）** / lostWriteOccurred+redriveByteIdentical / doubleResumeNoOp / refusedManifestStable）并**独立计数**（分母取自 S-CRASH 注册表、必须 6/6 且 crashPoint 齐全——R8-H3：`crashRecovery=null` 曾被无条件放行；R9-H1：分母曾用待核验的 crashPoint、六场景 crashPoint 全缺失时退化为 0/0 无专属失败）。诚实化历程（每轮一个 vacuous/退化路径被独立复审闭合）：R7-H2 前 `redriveByteIdentical` 预置 true、只查存在性（重入投影跳过时五标志全 true 假绿）→ R7-H2 改 cursor=head 比对 + lostWriteOccurred 证分支已执行 → R8-H4 前 STOP 后 epilogue 回写被拒清单 → 改为「任何 manifest STOP 即终态：跳过丢失写/双恢复 epilogue + 钉死被拒字节」→ R9-H2 前 STOP 只在回滚前捕获一次（回滚后重入再遭拒仍进双恢复、凭零 dispatch 记 NO_OP）→ 改为每次重入后重判 STOP + 拒判终止 epilogue + 拒判不记 NO_OP。负向：篡改发布态清单（self-digest / entry digest / 合法封印但 cursor 超前）与回滚后拒判共 **8 个崩溃拒绝态**，全部 fail-closed 且驱动不得改写被拒字节、不得记 vacuous 事实。
  **关于「无已知 vacuous 路径」表述的边界（R9-H3 修订）**：本节的结论形态为「**截至 R9 修复，已闭合并被负向矩阵钉死的 vacuous/退化路径共 5 条（R7-H2 / R8-H3 / R8-H4 / R9-H1 / R9-H2），负向 49/0 对已知路径全拒判」**——历史上该全称断言曾两次被后续复审推翻（R8-H3 推翻「全部事实无 vacuous 路径」、R9-H1/H2 再推翻），故本报告不再作无 vacuuous 路径的全称断言，只陈述已闭合清单与负向覆盖；新路径的发现按阻塞项流程处理。

### 6.3 十条生产语义实证（评审必含）

1. findings 属 scan 轮 ledger envelope；verdict envelope 的 findings 必须为 **[]**（自带 finding 即阻断后续准入）——**例外通道**：非 SOLUTION 类的 agent 声明发现（D 族 REQUIREMENT）经 verdict 信封登记（§5.4 边必须来自 verdict 注册；scan 注册按设计不带边、无法触发该 earliest 节点的回流）；
2. FAIL/BU 回流由网关合成 reflow finding 授权（语义 ⑩ 细化：FAIL/ESCALATED verdict 合成 SOLUTION reflow 行，带边、立即失效当前 design；agent 声明的非 SOLUTION 行不抑制合成——D 波因此多一行，harness 显式闭合）；
3. PWR 裁决终态内接受 ledger 成员（ACCEPTED_RISK、closed_by=formal_verdict、裁决自身 scope + Gate Result blob 为证据）故不回流；
4. BU envelope 须显式 `decisionDepth: null`（缺失是另一事实、必败）；
5. 闭合证据 = 确认轮 verdict 事件自身 output ref/digest（网关存 envelope 非 raw body）；
6. behavior run 的 runId 走小写（生产入口的 run-id 归一化；脚本声明混合大小写形式）；
7. 回流 = 规范序回退跳转（re-gate 是前进不是回流）；
8. ⑧ 活动执行期禁止 finding 转换——finding 闭合的合法窗口只在 invocation 之间（adapter 内闭合实测 illegal：scan attempt 失败→受控重试→轨迹污染）；
9. ⑨ invocation 内回流到 requirement-intake 无法重导 origin 规范源（`loop-capability-entry.ts` point 0 检查 + 每迭代输入采用只认前驱输出、point 0 无前驱），只有跨 invocation 边界的 `deriveDispatchCommand` 推导——requirement 级回流必须跨 run 边界；
10. ⑩ finding 注册的 source revision 必须 ACTIVE 且为当前指针（`loop-run-store.ts` appendFinding；gate 轮 finding 锚被审 revision 的 G4-R5-H5 例外）——PWR 轮 scan finding 的失效令被审 design v1 转 STALE，故 PWR×Re-Gate 波 review 发现锚定被审 implementation v1（§5.1 允许任意节点产物作锚）。

S-CRASH 恢复路径新实证（R1-H2，2026-09-24）：入口 takeover-A 接受 manual 种子（空 journal 无对账）后每终态投影持续 catch-up；两面 digest 覆盖对象按设计不同（raw content vs 输出 envelope）——对 populated journal 重新 takeover manual 种子必在 B2 digest 检查漂移，崩溃回滚须以 journal 背书的窗口清单为目标；`maxDispatches` 安全边界可作干净中断点（不落持久 block）；重投影确定性（回滚→重推逐字节一致）经 projector 实测成立。

### 6.4 外部独立复审全轮记录（G6T2-R1(M1) + G6-T2-R1..R9(M2)）

| 轮次 | 判定 | 内容 | 闭环 |
| --- | --- | --- | --- |
| G6T2-R1（M1） | FAIL→PASS | H4 比较器 fail-open（判据改全文档相等 + 24 负向）/ H5 PWR 风险接受事实缺失 | PR #195 合入 |
| G6-T2 R1（M2） | FAIL | H1 handoff 成功代理谎报（A′）/ H2 S-CRASH 无入口恢复路径 + S-INIT 无入口行为面（调查结论）/ H3 D-17 集合成员赦免过宽 / H4 报告不可复算 | H1/H3 修复（dim 9/放行判据经 R3/R4/R5 三轮加固）；H2 S-CRASH 已落地（§3.12）、S-INIT 如实单列；H4 = 本报告 |
| G6-T2 R2 | FAIL | R2-H1-A F 族 WP-1 重建误拒 / R2-H1-B ABSENT 放行伪造 reason-ref / R2-H3 ID 赦免未绑具体行 | 三修复 + 机器学习可判汇总（负向 38/16） |
| G6-T2 R3 | FAIL | R3-H1（R2-H1-A 同根因）：WP-1 放行缺 journal 记录证据与 attempt 校验 | 记录纳入 trace + 三条件放行（负向 26） |
| G6-T2 R4 | FAIL | R4-H1 双代际误拒（固定最终代际锚）/ R4-H2 声明后 forward 掩蔽 | 有序代际绑定 + 声明必须实际 restart（负向 34） |
| G6-T2 R5 | FAIL | R5-H1 混类 WP-1 波核验盲区（review 触发波无人核验） | 逐波声明校验唯一所有（负向 41） |
| G6-T2 R6 | **PASS** | R5-H1 CLOSED、无新阻塞、已 CLOSED 面不回归（含三/四波交替、归因歧义、记录审计复攻） | 收口进行中 |
| G6-T2 R7 | FAIL | R7-H1 报告 §3 未逐场景成节（16 ID 并入 6 共享标题）/ R7-H2 S-CRASH 可于清单未追平时假绿（`redriveByteIdentical` 预置 true、`manifestProjected` 只查存在——重入投影跳过时五标志全 true） | H1 拆分为 54 唯一标题（双向零差）；H2 事实诚实化（manifestCaughtUp 比 cursor=journal head、lostWriteOccurred 证分支已执行、redrive 不预置） |
| G6-T2 R8 | FAIL | R8-H3 崩溃事实为 null 被放行（`crash === null ||` 无条件接受，A′ 红态掩盖断言缺失）/ R8-H4 STOP 后 epilogue 改写被拒清单（丢失写分支只凭文本不同即回写窗口清单，未先确认重入成功且清单有效） | H3 非空事实 + 独立计数；H4 任何 manifest STOP 即终态——跳过丢失写/双恢复 epilogue + 钉死被拒字节（refusedManifestStable），三态负向钉死禁写（R9 判原路径 CLOSED） |
| G6-T2 R9 | FAIL | R9-H1 崩溃计数分母用待核验的 crashPoint（六场景 crashPoint 全缺失时退化为 0/0 无专属失败）/ R9-H2 STOP 只在回滚前捕获一次（回滚后重入再遭拒仍进双恢复、凭零 dispatch 记 doubleResumeNoOp=true）/ R9-H3 报告事实与实测不符（负向 42 vs 48、double-resume 6 vs 3、§6.2 全称断言被 H1/H2 推翻） | H1 分母改由 S-CRASH 注册表固定 + crashPoint 缺失专属报错 + 硬断言 6/6；H2 每次重入后重判 STOP + 拒判终止 epilogue + 拒判不记 NO_OP + onPostRollback 负向；H3 报告 49/3 + §6.2 改为「已闭合清单 + 负向覆盖」表述——待 R10 复核 |

### 6.5 R-G6-01（路由的生产发现，完成门阻塞项）

生产入口 c2/c3 handoff checklist 对**任何 conforming 完成链**恒报 BLOCKED，两个症状同属证据链读错源：

- **症状 a（closureReviewDone）**：读 code-review 事件的 `gateResult`，而事件合同把非 formal_verdict 执行的该字段钉死为 `NOT_APPLICABLE`（`node-output-envelope.ts` / `loop-capability-execution.ts`；closure review 裁决本在 review 输出产物里——`node-capability-contracts.ts`）→ reason「code review closure review not done」；
- **症状 b（pathEntry）**：读**单次 invocation 内**的 c1 变量 `resolvedImplementationDepth`（`runtime.ts`），staged/有界波（正式生产 rework/resume 的常态）在完成 invocation 里该变量已丢 → reason「development path entry not allowed: no formal_verdict event with materialized depth found」（常与 a 合并）。

**修复需 decision record + 生产代码变更，超 D-090-04 授权——Current User 已裁决单独路由；G6 测试不掩盖。** 行为层 runner 以 A′ 桶钉死：50/50 已知原因、零新因、签名精确匹配，pin 失败即硬失败。R1-R6 六轮中该症状分别被观测 33 / 17 次（R4/R5 复审方计数）。

## 7. 剔除项 / 退化项清单（§3 要求逐条列示，供复审复核）

| 项 | 行 | 依据 | 备注 |
| --- | --- | --- | --- |
| BLOCKED_UNKNOWN × Re-Gate | 3 | §3 剔除项原文：「verdict 无法分级时不存在重跑 Gate 的裁决输入，走回流映射——语义不可能」 | **实证张力备注**：建成的 BU-first 三场景本身即「BU→回流→重裁 PASS」，且 S-CORE-STANDARD-BU-overlimit-pause（单列）演示该坐标的预算耗尽终态——「不存在重跑输入」与实证存在张力，建议复审重点核对本项 |
| 升档 × BLOCKED_UNKNOWN | 2 | §3 剔除项原文：「升档返工的完成声明携带有效裁决，与无法分级互斥」 | — |
| corrupt × crash | （不涉 S-CORE 行） | §3 剔除项原文：「corrupt 终止先于任何崩溃点」 | — |
| DEEP × 升档 | 4 | 退化（非规格剔除项）：§3 round 语义限定升档仅 LIGHT→STANDARD / STANDARD→DEEP；升档族 prunes 注解「hard ceiling」 | 无场景，不建 |

## 8. 未归因 diff 单列

**产物层：无。** 全部 50 个产物层场景归一化后全文档相等（零未归因 diff）。负向矩阵（比较器 38 项）维持 fail-closed 钉死。

**行为层（按 A′ 如实呈现）**：唯一分歧面为 dim-9 final-handoff 的 R-G6-01 已知原因（50/50，§6.5）——已路由、 surfaced、不判 MATCH；非 dim-9 分歧 **0**。超限单列 4 场景无分歧。

机制层观察（非 diff，单列供复审参详）：§7 表中 BU×Re-Gate 剔除理由的实证张力（见该行备注）；S-INIT 规格-实现边界（§3.13）。

## 9. 结论（完成门三项逐项判定，§8，按 A′ 现实重述）

1. **全部离线场景通过（归一化后两面等价）**：**BLOCKED（等 R-G6-01 生产修复）**。已达成面：产物层 50 场景九维中 3/4/5 维全等（含 corrupt 单级 fail-closed）；行为层 dims 1/2/6/7/8 全 MATCH、非 dim-9 分歧 0（R6 外部独立复跑核验）；超限单列 4 场景轨迹 + durable 终态全过；九轮外部复审后仪器面（负向 38+49 项、桶 pin、非 dim-9 计数、崩溃事实独立计数）可信。未达成面：**dim-9 final-handoff 在全部 50 个完成场景上 surfaced R-G6-01 分歧**——该判据的完全满足以生产修复为前提（decision record + 生产代码，单独轨道）。故完成门第 1 项状态 = 仪器与产物层全绿、行为层等价性被已路由生产缺陷阻塞，**不得判 PASS，亦不得掩盖**。
2. **无 shadow executor 替代生产入口**：**PASS**。行为层驱动 = `runProduction` 生产入口本体 + 注入脚本化网关（真实门、真实 store、真实投影器；S-CRASH 走真实恢复路径）；产物层 = T5 store 级同事实驱动 + 真实 publisher。`--capability-source real` 与真实 CLI 全程未用（fixtures/harness/acceptance reports 授权边界内）。
3. **随后才允许申请真实 CLI run8**：**未申请**（§9：本稿不授权 run8；G6 PASS 后 next_transition 由 Current User 裁决；run8 不自动等于 C03-E/C05）。

**申请**：G6 / D-090-04 离线 parity 验收——产物层与行为层仪器面证据包齐备（本报告），gate CLOSED 申请**待 R-G6-01 修复闭环后由 Current User 裁决**。M2 收口：单 PR（base `feature/loop-runtime-v1`，#197）承载全部 `tests/` + docs 改动（生产代码零 diff）；分支保护禁直推主线，合并授权待 Current User 裁决（同 M1 惯例）。挂账两项（maxDesignRounds 默认 2→3；journal 回流显式轮数上限）不在 G6 内改。
