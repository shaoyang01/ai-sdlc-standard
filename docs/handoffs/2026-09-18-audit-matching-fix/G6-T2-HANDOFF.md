# G6-T2 交接（2026-09-21 公司机会话更新，接 2026-09-20 晚家用机收工态）

> 状态：**M1 12/12，R1 两项阻塞（H4/H5）经 R2 独立复核 PASS 闭环**；PR #195（base `feature/loop-runtime-v1`）CI 四 job 全绿、CLEAN，合并授权已获 Current User 2026-09-21 确认。分支 `feat/g6-t2-parity-harness` @ `4ee3c90`（R2 后无新提交）。
> Control Plane 不变：G6/D-090-04 ACTIVE（CP PR #88 合并 `7222d6a`），product_commit 仍指 `e34a4a6`（G6 工作未上主线，均在 feature 分支）。

## 2026-09-21 R2 独立复核：PASS（M1 构成 M2 可靠基线）

R1 判定 FAIL（两项阻塞），修复后经同一复审方 R2 全量只读复核 **PASS**：H4/H5 逐项 CLOSED、三项 CLOSED 根因无回归。复审方独立推演：H4 22 项变异（含对负向测试做「破坏 comparator 看测试失败」的空转探测——恢复旧逻辑后 24 项负向恰 4 项失败）；H5 三档各 14 断言 + 4 例 publisher 准入实测 + 4 道 fail-closed 负向（错误 scope / ledger 充当证据 / 非 scan 来源 / 成员数漂移全部 ILLEGAL_TRANSITION）；另 12 项自由裁量新反例（未映射顶层键、entries 类型混淆、ACCEPTED 行闭捆漂移、resolve 闭捆上游/STALE revision、共享时钟变体）全部正确拒判。回归复跑与自述逐字吻合（全量 1767/0/169 等）。

**M2 开工前必须承接的四条约束（R2 钉下）**：
1. 产物层只判 3 维（artifact-paths / version-state / finding-identity），其余 6 维行为层判——产物层永不宣称行为层 MATCH；
2. 比较器判据须保持全文档相等（`diffs.length === 0`），任何维度映射不得进入判定路径，未映射差异必须使场景失败；
3. finding 模式复用范围：PWR 接受 = scan 来源 finding + 该轮 PWR/CONFIRMED 裁决自身 scope + 裁决 Gate Result blob 证据；返工 wave = 被审 design 锚定 + 重裁 revision 闭捆；注册时机固定 scan 终态后、verdict 前（membership receipt）；逐事件时间戳（RC1-1 可判定性）；
4. runner 诚实性：产物层通过必须明示部分覆盖（"artifact layer only: 3 of 9"），不得表述为九维全绿。

R2 两条不阻塞建议：ruby@3.3 PATH 依赖文档化（README Validation 区，合并后单独落）；M2 报告可单列「未归因 diff」。

## 2026-09-21 R1 独立复审：FAIL → H4/H5 修复（三项既定根因均 CLOSED）

独立复审（全量只读、根因合并式）判定 **FAIL**，两个新阻塞；三项既定根因（verdict 终态模型、返工 wave、B2 墙）均判 CLOSED。修复如下：

### G6T2-R1-H4 比较器 fail-open（已修 + 24 项负向测试钉死）

- 病象：`compareArtifactLayer` 取了完整 diffs 但只把少数路径映射到维度，`entries.*.digest` 无映射被静默丢弃——合法重封后的 digest 漂移被判九维全 MATCH（复审独立复现）。
- 修法：返回值增加 `equal` + 原始 `diffs`——**产物层判据 = 归一化后全文档相等**（冻结规格 §4.2），维度行只作诊断归因、永不过滤判据；六个行为层维度报 **NOT_JUDGED**（不再谎报 MATCH），产物层只判 3/4/5 三维；runner 按 `equal` 失败并打印原始 diff path；补 `runStore.close()`（复审建议项）。
- 负向测试 `tests/g6-parity-comparator-negative.test.ts`（24 项）：同文档→相等；8 个 head + 3 个 entry 剔除字段逐一变异→仍相等；entry digest/version/status/path/node、findingIndex、非剔除顶层、缺项/多项→必不相等且给出原始 diff path；H4 原始复现用例；行为层 NOT_JUDGED。

### G6T2-R1-H5 PWR 风险接受事实缺失（已修 + 三档实测）

- 病象：规格 §3 定义 PWR =「PASS_WITH_RISK，scan 来源 finding 接受」，但 PWR 场景 `findings: []`——finding-identity 维度空集对空集；runtime driver 也无视 action 类型恒调 resolveFinding。
- 修法：PWR 三场景携带 canonical `loop-capability-findings:v1` ledger（1 成员）；finding 在 **scan 终态后**注册（membership receipt：createdAt 即 scan 终态的；且必须在 verdict 前——PWR verdict 之后再注册会连它产出的 gate revision 一起失效），evidence = 被消费 ledger；PWR 裁决经公开 `acceptFindingRisk` API 风险接受（ACCEPTED_RISK、closed_by=formal_verdict、裁决自身 scope + Gate Result blob 为证据）；手动面 `--stale-nodes solution-design` 镜像失效真相并执行 `finding-action --action accept`。
- 连带修正：gate-round finding 注册时机从 verdict 后移到 scan 终态后；settle 按 action 类型分派 accept/resolve；逐事件时间戳（T5 stamp 模式——共用时钟会令投影器失效边恢复不可判定，RC1-1 fail-closed）。
- 三档实测：store finding ACCEPTED_RISK（acceptedBy=formal_verdict、scope=裁决 scope）、manifest 两面 ACCEPTED 行逐字段一致、evidence=ledger、design 行两面同步 stale。

### 验证

矩阵 12/0；负向 24/0；全量 **1767/0（169 文件）**；T5 32/0、YAML 150/0、投影器 122/0、manual-chain 106/0、bootstrap 820/0、audit-entry-coverage 34/0；tsc 0。改动面仅 tests/ + docs。

## 2026-09-21 定案：verdict 终态模型纠偏 + FAIL/BLOCKED_UNKNOWN 返工 wave

### 1. 交接前版（6/12）的终态模型是非法的，已按生产 canonical 形状纠正

`tests/g6-parity/runtime-face.ts` 的 verdict 终态机三形状（succeeded/failed/blocked）中，后两种对 formal_verdict 均不合法：

- **blocked 终态**：store 明令 `a formal_verdict execution cannot end blocked — it renders a decision instead`（core/loop-capability-execution.ts:513-515）。
- **failed 终态携 gateResult/output refs**：store 明令 failed 执行不得携带任何结果字段（output/gateResult/findings），且必须 errorCode/reasonCode + eligibility=BLOCKED + retryable（:519-527）。

**canonical 生产形状（三方证据）**：verdict 永远 succeeded、渲染决策 triple——WP6 测试注释「a SUCCEEDED verdict must materialize its decision triple even when the adjudication is FAIL」；d087 场景 2（FAIL verdict succeeded + gateResult=FAIL + CONFIRMED + depth + eligibility=BLOCKED）；G5-T2 投影器测试「UNKNOWN verdict folds a null decision_depth with the FAIL adjudication」（BLOCKED_UNKNOWN = gateResult FAIL + decisionStatus BLOCKED_UNKNOWN + **显式 null** depth）。非通过 verdict **不产出 gate revision**（WP6：artifact-revision 合同只准入 PASS/PWR；createLoopArtifactRevision 对 FAIL 直接拒）并**密封链**（链校验器 isCanonicalNext 要求前一事件 eligibility=ELIGIBLE）。

### 2. 为什么仅修终态形状到不了 12/12：takeover-B 结构性墙（已实测）

manual publisher 只会把 verdict triple 写在 **current** 行上（entry-update 无条件置 current）；而 FAIL/BLOCKED_UNKNOWN verdict 无 revision，journal 侧 gate 行只能是 **pending**。两种 manual 记法实测都被 B2 拒：

- manual 发布（current+triple）→ `B2 reconciliation drift at solution-gate.status: journal pending vs manual current`
- manual 不发布（pending 无 triple）→ `B2 reconciliation drift at solution-gate.gate_result: journal FAIL vs manual undefined`

**两面只在「最终裁到 PASS」时收敛**（PASS 才产出 revision，行变 current+triple，两面一致）。

### 3. 落地模型：返工 wave（d087 pattern = Current User 描述的真实手动流程）

FAIL/BLOCKED_UNKNOWN 首轮场景统一建模为一轮返工后重裁 PASS：

```
design v1 → gate 裁决 FAIL/BLOCKED_UNKNOWN（attempt 1，eligibility=BLOCKED，无 revision）
→ 注册 gate finding（SOLUTION，earliest=solution-design，锚定被审 design v1 revision；
   注册即时将 design v1 置 STALE——这正是回退重启的授权来源）
→ finding 授权 restart → design v2（attempt 2，输入=复用的 intake 产出）
→ 重新 gate：scan + formal_verdict PASS（attempt 2，产出 gate revision，semver 2.0.0）
→ finding 逐条关闭（绑定重裁 revision + PASS verdict 产物作证据）
→ task-planning → implementation → code-review（无 finding）→ knowledge-sync
```

实现要点（tests/g6-parity/）：fact-scripts 的 `waveWithRework`（9 节点 + 1 finding）；runtime driver 增加 per-execution-point 产出追踪（generation restart 消费上游 point 的最后成功产出，而非脚本上一节点的产出）、attempt 贯穿、gate-round finding 生命周期（`appendFinding`/`resolveFinding` ↔ publisher `finding-register`/`finding-action`，闭捆 revision 为 `g6-<req>:revision:solution-gate:1`，证据为重裁 verdict 产物）。

### 4. 验证

g6 矩阵 **12 passed / 0 failed**；tsc 0；全量套件 **1767 passed / 0 failed（168 文件）**；T5 parity 32/0、YAML 矩阵 150/0、投影器 122/0、manual-chain 106/0、bootstrap 820/0、audit-entry-coverage 34/0。

## 挂账两项（Current User 2026-09-21 裁决：不在 G6 内改，出决策再动）

1. **生产默认轮数 2→3**：`loop-requirement-design-orchestrator.ts` 的 `maxDesignRounds` 默认 2、硬顶 2（超限终态 `paused`/`DESIGN_REVISION_EXHAUSTED` 已存在；`maxFixRounds` 默认 4、`maxTotalDurationMs` 总时长预算）。Current User 提出默认三轮更合适——改默认值+抬硬顶属冻结合同/生产参数变更，需 decision record。
2. **journal 级回流 wave 无显式轮数上限**：finding 授权重启（loop-regate）只要求 OPEN 阻塞 finding，attempt 无数字封顶；现实刹车是 finding 生命周期（PASS 不自动关 finding，必须逐条带真实修复证据关闭，否则运行一直 BLOCKED）。全自动 LOOP 的死循环防护目前缺显式预算，建议补（默认几轮随项 1 一并决策）。

## 之后的路径（M2，模式已备）

- 其余 40 场景：S-CORE 升档/Re-Gate 24 + S-INIT 8 + S-MANIFEST 2 + S-CRASH 6。返工 wave 的 finding 模式可直接复用（code-review 返工 = 同一模式换节点）。
- 行为层 full-chain 驱动器（runProduction + 脚本化网关，runtime-face.ts 内 M2 标记处）。
- 多轮失败变体（FAIL→FAIL→PASS）与超限暂停场景（runtime paused vs 手动面停）归升档/Re-Gate 坐标；后者产物层无法 parity（pending 行 triple 漂移），只能作行为层轨迹断言。
- 全量回归 → PR（base feature/loop-runtime-v1）+ R1 自证 → 独立复审 prompt（模板 `docs/handoffs/2026-09-09-g5-t1/review-request.md`）。

## 环境提醒（不变）

- ruby 须 PATH 前置 `/opt/homebrew/opt/ruby@3.3/bin`（系统 2.6.10 触发 canonical gate 假阳）；node v24。
- 测试跑法：`node --import tsx tests/g6-parity-matrix.test.ts`（勿用 bun）。
## 2026-09-22 晚收工状态（公司机会话第三波收工；回家后按本文件 + 唤醒 prompt 继续）

**下一步（按序，每步先请 Current User 确认）**：
1. **行为层扩展到其余家族**：把两层合并判定从 S-CORE 首轮 12 铺到其余 35 个波形（多轮 3 / review 返工 3 / review→re-gate 3 / 需求级回流 2 / feedback re-gate 2 / 升档×FAIL 2 / S-MANIFEST 2 / S-CRASH 6 / S-INIT 8 + 升档 4）。驱动器与分级 resume 已泛化，预计是接线而非新机制；注意多轮波 finding 的注册/闭合跨 run 交织（store 的 currency 规则要求闭合发生在被绑 revision 被新 finding 失效之前），接管时按实测调整。
2. **超限暂停 4**（FAIL×LIGHT/STANDARD/DEEP + BU×STANDARD，行为层 only）：轮数预算超限 → runtime 终态 vs 手动面「人停下不等了」——产物层无法 parity（pending 行 triple 漂移，同 D-7/D-17 分析），作行为层轨迹断言，runner 单列不计入产物层通过数。
3. **账目对账**：产物层 47 + 行为层 12 vs 规格 52，逐条列清（剪枝组合 + 返工波编组粒度 + 两层各自坐标），写入验收报告骨架 docs/reports/g6-d09004-parity-acceptance-report.md（规格 §7 格式）。
4. **收尾**：全量回归 → 单 PR（base feature/loop-runtime-v1，分支保护禁直推）→ R1 自证 → 独立复审 prompt（**会话内展示、不落文档**；逐字遵循 docs/handoffs/2026-09-09-g5-t1/review-request.md 模板；评审范围必须含 D-7/D-17 表示分歧发现 + 行为层七条生产语义实证 + 账目对账）→ PASS 后请 Current User 授权合并。
5. 远期不变：G6 完成门 = 全矩阵通过 + 无 shadow 替代生产入口；run8/C03-E/C05 单独授权。挂账两项（maxDesignRounds 默认 2→3；journal 回流显式上限）不在 G6 内改。

## 2026-09-23 公司机会话：R2 复审 FAIL → 三修复（R2-H1-A/B、R2-H3 闭合，验证全绿）

**R2 判定 FAIL**（@87c0b51，三阻塞均判据缺口，非机制回退）：R2-H1-A F 族合法 WP-1 反馈重建被 dim 7 误拒、R2-H1-B ABSENT 期望只查 status 放行伪造 reason/ref、R2-H3 ID 赦免只验集合成员资格未绑具体行（OPEN 行翻转、同 run 错行 ID 均放行）。R-G6-01 证据与 H2/H4 计划部分本轮判 CLOSED（证据真实、范围界定正确）；R1-H2/H4 维持 OPEN。

**三修复（harness-only，生产零改动）**：
1. **R2-H1-A**：dim 7 准入判据放行**脚本声明的 WP-1 新代际重启**（`opensFeedbackChange` 的 gate 轮，admitting verdict 后回到 requirement-intake 合法——代际重启非 finding 回流）；未声明的回退仍 DIVERGE。真实 F post-gate 复跑 MATCH；去声明负向 DIVERGE。
2. **R2-H1-B**：dim 9 ABSENT 分支要求 status/reason/artifactRef **全 null**；任一非空即 DIVERGE（伪造证据拒判）。
3. **R2-H3**：D-17 赦免从「集合成员」升级为**逐行 journal 证明**——赦免需同时满足：稳定身份一对一配对、行为闭合行（RESOLVED/ACCEPTED）、行的 id 正是 journal 绑定该身份的 store id、journal 状态为已闭合；OPEN 行/未配对/伪造 ID/同 run 兄弟行 ID/重复配对全部字面比较必败。runtime-face 回传 `findingProof`（身份键 → {id, status}），两 runner 传图。
4. 采纳复审建议：runner 增**机器可判的「非 dim-9 分歧数必须为零」**汇总（0/50 红态与 50/50 桶不得再 mask 非 dim-9 回归——F 族回归正是这样藏了一轮）。

**验证**：tsc 0；产物层 50/0；比较器负向 **38/0**（+5：OPEN 翻转、同 run 错行 ID、重复配对、两行正控等）；行为负向 **16/0**（+5：ABSENT 注入×2、ABSENT 正控、F 真实 WP-1 重启、去声明负向）；行为层矩阵：**非 dim-9 分歧 0**、桶 50/50 已知原因 0 新因、超限 4/4。合并判定 0/50 仍为 A′ 预期红态（等 R-G6-01 生产修复）。

剩余（每步先请 Current User 确认）：R3 独立复审（本 prompt 见会话）→ PASS 后：S-CRASH 中断-重入实现 → H4 报告重写 → 全量 serial 回归 → 单 PR 收口。

## 2026-09-23 家用机会话：R3 复审 FAIL → R3-H1 修复（WP-1 重启准入改挂 journal 证据）

**R3 判定 FAIL**（外部只读副本 @b9cf3db，一项阻塞）：**R3-H1（R2-H1-A 同一根因未闭环）**——dim 7 的 WP-1 新代际重启放行仍仅凭脚本声明 + 下一节点名：屏蔽 WP-1 记录证据或把第二代 intake 的 attempt 2→1 注入，仍报 MATCH。R2-H1-B、R2-H3 及全部已 CLOSED 面复审判 CLOSED 不回归（负向 38/0、16/0；产物 50/0；桶 50/50 零新因；非 dim-9 仪器灵敏度实测：注入缺 scan 计数为 2、普通失败计数强制 0 仍退出 1）。R1-H2/H4 维持 OPEN。

**修复（harness-only，生产零改动；@d6a6432 已推）**：
- **behavior-face**：`BehaviorTrace` 增 `generationRestarts`（跑完后从 journal 回读 WP-1 change 记录：changeKind / CLASSIFIED 状态 / previousGeneration 代际绑定 / trigger 终态——以记录自身 sourceRef 的 observedAt 与 journal 终态 join，歧义或缺失即无 trigger）与 `generation`（run 最终代际）。证据取自 store 回读而非 driver 内存。
- **behavior-comparator**：dim 7 admitting 分支的放行三条件齐备才 admit——① 脚本在该 gate 轮声明 opensFeedbackChange 且下一节点为 intake（原有）；② journal 存在匹配的已验证记录（FEEDBACK_DRIVEN_CHANGE + CLASSIFIED + previousGeneration≥1 且 +1 = run 最终代际 + trigger 轮一致）；③ 重启 intake 的观测 attempt = 脚本声明 attempt 且 >1（第二代重派必须是 run attempt 计数延续，attempt 1 是伪造重启）。任缺即 DIVERGE；未声明回退仍 DIVERGE。
- **behavior-negative**：+10 例（16→**26/0**）：真实 F post-gate 跑证记录在 trace 内（FEEDBACK_DRIVEN_CHANGE/CLASSIFIED/gen 1→2/trigger solution-gate@1）+ 重启 intake attempt 2 观测；剥离记录、错记录类型、非 CLASSIFIED、错/缺代际绑定、错 trigger 轮/能力、attempt 2→1 全部 DIVERGE。

**验证**：tsc 0；行为负向 **26/0**；产物层 **50/0**；比较器负向 **38/0**；行为矩阵 A′ 四要素完整（合并 0/50 按设计、桶 50/50 零新因、**非 dim-9 分歧 0**、超限 4/4，退出码 1 预期）；并行全量套件（R3 前基线）1767 passed/0 failed，唯一红文件=按 A′ 设计红的行为矩阵（171 文件）。

剩余（每步先请 Current User 确认）：R4 独立复审（prompt 本会话内交付、按纪律未落文档；范围=R3-H1 闭环 + R2-H1-B/H3 不回归 + 攻击「修复是否引入新恒真/恒假」：WP-1 放行是否过严错过合法多变体、attempt>1 是否过严、observedAt join 的确定性）→ PASS 后：S-CRASH 中断-重入实现 → H4 报告重写 → 全量 serial 回归 → 单 PR 收口（PR #197）。

## 2026-09-23 家用机会话：R4 复审 FAIL → R4-H1/H2 修复（有序代际绑定 + 已声明必须实际重启）

**R4 判定 FAIL**（外部只读副本 @6fd12c8，两项新阻塞；R3-H1 原两条绕过判定已闭合，R2-H1-B/H3、R1-H3 等已 CLOSED 面复审判不回归；observedAt join 实测 10/10 唯一，非阻塞建议「改用稳定 journal event id 绑定触发事件」记录在案）：

1. **R4-H1 双代际误拒**：store 接受连续两条 CLASSIFIED WP-1 记录（代际 1→2→3）且该双重启轨迹合法，但比较器要求**每一波**记录的 previousGeneration+1 都等于 run **最终**代际——第一波（1+1=2≠3）即被 dim 7 误拒。修法边界（评审给定）：按各触发轮与紧随其后的重启核对**有序代际**（第 i 个声明触发期望 previousGeneration=i，每个 WP-1 恰好推进一代），只用最终代际校验最后一波（未声明的多余记录会使其漂移而被抓）。
2. **R4-H2 dim 7 放行掩蔽**：已声明 F post-gate 重启时，若实际下一节点改为前进节点且无 WP-1 记录，代码先按 forward 放行、只在 next=intake 时才查记录——「声明了却没重启」被掩蔽（dim 1 仍 DIVERGE、合并判定未假绿，但 dim 7 仪器被污染）。修法边界：gate 轮已声明重启时，脚本和实际下一节点**均**须为 intake 才走完整证据校验；保留 F post-review 的 gate-round 前进分支（无 gate 声明时不变）。

**修复（harness-only，生产零改动；@b1bd730 已推）**：
- **behavior-comparator.ts**：① admitting 分支按声明分叉——`declaredTrigger !== undefined && actualNext !== "requirement-intake"` 直接 DIVERGE（声明即期望，前进/非 intake 回退都是未发生重启）；② `declaredTrigger && actualNext === intake` 走完整校验：记录匹配（类型/CLASSIFIED/触发轮）+ **有序代际**（`declaredWaves` 按脚本声明序取 waveIndex，previousGeneration 必须等于 waveIndex；仅最后一波追加 `trace.generation === waveIndex + 1`）+ restart intake attempt=脚本声明 attempt 且 >1。
- **behavior-negative.test.ts**：+8 例（26→**34/0**）：合成双代际脚本（两 gate 触发、intake attempt 2/3、末波后下游 attempt 1）合法轨迹六维全 MATCH；任一波代际错、最终代际漂移、第二波缺记录均 DIVERGE；已声明但 forward / 已声明但跳非 intake 节点均 DIVERGE（真实 F post-gate 轨迹注入）。

**验证**：tsc 0；行为负向 **34/0**；产物层 **50/0**；比较器负向 **38/0**；行为矩阵 A′ 四要素完整（合并 0/50 按设计、桶 50/50 零新因、**非 dim-9 分歧 0**、超限 4/4；退出码 1 预期）。

剩余（每步先请 Current User 确认）：R5 独立复审（prompt 本会话内交付、按纪律未落文档；范围=R4-H1/H2 闭环 + 已 CLOSED 面不回归 + 新注入面：三波有序代际、gate/review 混类触发轮的 waveIndex 计数、forward/non-intake 掩蔽变体、observedAt join 重复实测）→ PASS 后：S-CRASH 中断-重入实现 → H4 报告重写 → 全量 serial 回归 → 单 PR 收口（PR #197）。

## 2026-09-24 家用机会话：R5 复审 FAIL → R5-H1 修复（逐波声明校验接管全部触发类型）

**R5 判定 FAIL**（外部只读副本 @1271ee5，一项阻塞；R4-H1/H2 原始反例复审判已闭合）：**R5-H1 混类 WP-1 波记录核验缺口**——dim 7 的记录证据在 gate 轮分支内，而 dim 7 循环只遍历 gate 轮：review 触发的波无人核验。病象：gate→review 两波合法轨迹六维 MATCH（正确），但剥离末波（review）记录、置空其触发归因、或最终代际 3→4 漂移仍六维 MATCH；同探针在 6fd12c8 为 DIVERGE——确证末波代际锚的放行是本轮（R4）修复引入的 mask。反向 review→gate 链剥离前波记录同样假 MATCH。评审方以真实 store 连续记录（review、gate 代际 1、2）独立取证。

**修复（harness-only，生产零改动；@268e6e0 已推）**：
- **结构改制**：WP-1 记录证据从 gate 轮分支摘出，归**独立的逐波声明校验 `verifyDeclaredWaves`** 唯一所有——按脚本声明序遍历**全部**声明触发（gate 或 review 任意类型）：每波恰一条已验证记录（FEEDBACK_DRIVEN_CHANGE/CLASSIFIED + 触发轮归因，归因不唯一拒判）、有序代际绑定（previousGeneration = 波序，每个 WP-1 推进一代）、末波锚 run 最终代际（未声明多余记录会漂移而被抓）、重启 intake 的新代际 attempt、以及「每条 journal 记录都必须匹配某声明波」的反向审计（无声明而有记录 = 未授权代际推进，拒判）。
- **gate 轮分支只留结构性准入**：R4-H2 的声明后强制 restart（declared gate trigger 的下一节点必须为 requirement-intake）+ 无声明时的前进/回流判定；证据类校验全部移交逐波校验。
- **behavior-negative**：+7 例（34→**41/0**）：gate→review 与 review→gate 合法链六维全 MATCH；剥离 review 末波记录、置空 review 波归因、最终代际 3→4 漂移、剥离 review 前波记录全部 DIVERGE。

**验证**：tsc 0；行为负向 **41/0**；产物层 **50/0**；比较器负向 **38/0**；行为矩阵 A′ 四要素完整（合并 0/50 按设计、桶 50/50 零新因、**非 dim-9 分歧 0**、超限 4/4；退出码 1 预期）。

剩余（每步先请 Current User 确认）：R6 独立复审（prompt 本会话内交付、按纪律未落文档；范围=R5-H1 闭环 + 全部已 CLOSED 面不回归 + 新注入面：三波/四波有序链、gate/review 交替触发、逐波 attempt 伪造、记录多于声明波、无声明而有记录、observedAt join 重复实测）→ PASS 后：S-CRASH 中断-重入实现 → H4 报告重写 → 全量 serial 回归 → 单 PR 收口（PR #197）。

## 2026-09-24 家用机会话：R6 复审 PASS + R1-H2 S-CRASH 中断-重入实现（@c5c2a77 已推）

**R6 判定 PASS**（外部只读副本 @7cd336f）：R5-H1 CLOSED（原两条绕过闭合、混类双波合法链六维 MATCH、剥离/置空/漂移攻击全 DIVERGE），无新阻塞，全部已 CLOSED 面不回归（负向 38/0、41/0；产物 50/0；A′ 四要素完整；T5 32/0、YAML 150/0）。非阻塞建议留存：trigger 归因绑定改稳定 journal event id。

**R1-H2 S-CRASH 落地**（harness-only，生产零改动）：崩溃场景从「轨迹重放」升级为**经生产入口走真实恢复路径的中断-重入**——
- **fact-scripts**：补漏——`crashPoint` 字段类型早有、builder 从未设置（行为层此前看不见崩溃族）。
- **behavior-face crash 模式**：manifest 库以**手动面中间态清单**播种（发布态），入口 preflight 对其 takeover-A（无对账）后每终态投影点持续 catch-up——journal/manifest 追赶可观测。首 invocation 以 **maxDispatches 安全边界**在崩溃点 dispatch 边界中断（不落持久 block），同 runId 重入走真实恢复。边界映射：post-gate-verdict = 首轮 gate verdict 后；post-finding-migration = 闭合窗（fix revision 物化后，finding 于 invocation 间窗口结算）；pre-manifest-write = 倒数第二个 dispatch 后（**末终态及其投影故意落在重入里**，成为可捕获的丢失写）。
- **丢失写模拟**：回滚目标是**中断窗口处捕获的已接管清单**（journal 背书、normal catch-up 路径）——**绝不是 manual 种子**（两面 digest 覆盖对象按设计不同：raw content vs 输出 envelope，对 populated journal 重新 takeover manual 种子必在 B2 digest 检查漂移——本轮实测抓到的坑）；重入必须逐字节重推一致。双恢复：第二次重入零 dispatch 且清单字节稳定（NO_OP）。
- **runner**：六崩溃场景断言 recovery 事实（interruptedAtBoundary / duplicateDispatches=0 / manifestProjected / loseManifestWrite⇒redriveByteIdentical / resumeTwice⇒doubleResumeNoOp）。**负向** +1：对篡改的发布态清单重入必须 fail-closed（MANIFEST_CORRUPT_STOP），绝不静默续跑。
- **验证**：tsc 0；行为负向 **42/0**；产物 **50/0**；比较器负向 **38/0**；行为矩阵 A′ 四要素完整（合并 0/50 按设计、桶 50/50 零新因、非 dim-9 **0**、超限 4/4），六崩溃场景全部 interrupt@boundary=true、零重派、manifest=true，pre-manifest-write 两场景 redrive=true，三个 double-resume 场景 doubleNoOp=true；全量 **1767/0 / 171 文件**（唯一红文件=按设计红矩阵）。

剩余（每步先请 Current User 确认）：**H4 报告重写**（54 个可定位逐场景条目 + 账目 52−5−4+7=50 三本账 + D-7/D-17 finding-identity 说明 + 十条生产语义 + ⑧⑨⑩ + R-G6-01 双症状单列 + S-INIT 边界发现 + S-CRASH 行为层恢复路径新覆盖）→ 全量 serial 回归 → 单 PR 收口（更新 PR #197）→ 独立复审（R7）→ PASS 后请合并授权。

## 2026-09-24 家用机会话：R1-H4 验收报告重写完成（@62ff715 已推）

- **54 个可定位唯一条目**：每节唯一 scenario-id 标题（坐标/两面轨迹/九维逐维含层与未判范围/根因）；50 个完成场景的 dim-9 分歧逐节标注「△9-RG6-01」（A′ surfaced，不再有旧骨架的「全绿」表述）；corrupt 场景 3/4/5 维为 fail-closed STOP 单级断言；超限 4 节 3/4/5 维明示 NOT_JUDGED。
- **账目三本账**：剔 5（升档×BU×2 + BU×Re-Gate×3）/ 退 4（DEEP×升档）/ 挂 7（B×3、E/F×3、D×1）；52−5−4+7=**50** 产物层场景（补建 3 行含于 27 建成行内，补建前 24）；单列 4 不计产物层通过数；两层合计 54 条目。
- **新增章节**：R-G6-01 双症状单列（完成门阻塞项、已路由、六轮中各被观测 33/17 次）；S-INIT 规格-实现边界发现（init readiness ≠ 入口 manifest readiness，路由建议 §3 论证修订或归 D-088-01 验收面）；S-CRASH 中断-重入覆盖（本波落地）；外部独立复审全轮记录（G6T2-R1(M1) + G6-T2-R1..R6(M2)）；十条生产语义（第 1 条按 D 族 verdict 登记通道改写、第 2 条细化合成 reflow 不抑制语义）。
- **完成门按 A′ 现实重述**：门 1 = **BLOCKED（等 R-G6-01 生产修复）**——产物层全绿 + 行为层仪器面全绿（非 dim-9=0）+ dim-9 等价性被已路由生产缺陷阻塞，不判 PASS 不掩盖；门 2 = PASS（无 shadow）；门 3 = 未申请。serial 全绿在修复前不可达（fail-fast 停在按设计红矩阵），如实记录；验收基准 = 并行全量 + 抖文件隔离复跑 + R6 外部独立复跑。
- **验证记录更新**：行为层矩阵 = A′ 红态（0/50、桶 50/50 零新因、非 dim-9=0、超限 4/4、退出码 1 预期）；负向 38/0 + 42/0；全量 1767/0、171 文件、唯一红文件=按设计红矩阵；T5 32/0、YAML 150/0（R6 核验）。

剩余（每步先请 Current User 确认）：全量 serial 回归说明归档 → 单 PR 收口（更新 PR #197，base `feature/loop-runtime-v1`，R1 自证）→ 独立复审（R7，范围 = H4 报告与账目复算 + R1-H2 S-CRASH 实现 + 全部已 CLOSED 面不回归）→ PASS 后请合并授权。

## 2026-09-24 家用机会话：R7 复审 FAIL → R7-H1/H2 修复（@90984c7 已推）

**R7 判定 FAIL**（外部只读副本 @f6ef0e8，两项合并阻塞；其余复算面均 PASS：三本账、D-7/D-17、十条语义、完成门表述、剔除项张力、S-CRASH 边界映射 4/8/9、真实重入、篡改负面、播种建模）：

1. **R7-H1 报告未逐场景成节**：程序化提取 54 ID ↔ 44 标题，16 个 ID 并入 6 个共享标题（STANDARD/DEEP 首轮 ×8 + S-INIT ×8）。修复：拆分为 **54 个唯一 scenario-id 标题**；程序化核对闭合（50 产物层 runner ID + 4 行为层单列 ID ↔ 54 报告标题，双向零差）。
2. **R7-H2 S-CRASH 可于清单未追平时假绿**（仪器诚实性缺陷）：`redriveByteIdentical` 预置 true——末次投影未发生（清单=中断窗口态）时回滚/重推分支根本不执行，标志 vacuous 为 true；`manifestProjected` 只查文件存在。复审方以「重入阶段跳过清单投影」（不改生产代码）复现：journal head 22 / 清单 cursor 18，五项崩溃标志全 true。修复：**`manifestCaughtUp`**（清单 taken-over cursor 必须 = journal head，落后即假绿）+ **`lostWriteOccurred`**（末次投影确已发生——文档相对窗口态分化，证回滚/重推分支确已执行）+ `redriveByteIdentical` 不再预置（分支未执行即 false）。**闭环探针**（复刻该攻击）：manifestCaughtUp=false、lostWriteOccurred=false——攻击被抓住；正常跑六场景 cursor=head、pre-manifest-write lostWrite+redrive=true、doubleNoOp=true。

**验证**：tsc 0；行为矩阵 A′ 四要素完整（合并 0/50 按设计、桶 50/50 零新因、非 dim-9 = 0、超限 4/4）；行为负向 42/0；比较器负向 38/0；产物 50/0；全量 **1767/0 / 171 文件**（唯一红文件 = 按设计红矩阵）。

剩余（每步先请 Current User 确认）：PR #197 描述同步（R7 轮记录 + 强化事实）→ 独立复审（R8，范围 = R7-H1/H2 闭环 + 已 CLOSED 面不回归 + 复算「异常-识别」对）→ PASS 后请 Current User 授权合并。

## 2026-09-24 家用机会话：R8 复审 FAIL → R8-H3/H4 修复（崩溃事实永不为空 + 被拒清单永不被改写；@537aee0 已推）

**R8 判定 FAIL**（外部只读副本 @27bddcb，两项新阻塞；R7-H1 判 CLOSED、R7-H2 原异常路径判 CLOSED——新版探针 manifestCaughtUp/lostWriteOccurred 均 false 识别；其余不变量、账目、十条语义、剔除项复算全 PASS；另指出报告 §6.2 全称表述需修订、§6.4 标题落后一轮、**全量「1767」系单文件内统计非总量的历史误述**）：

1. **R8-H3 崩溃事实为 null 时被放行**：runner 的 `crash === null || …` 无条件接受空值，A′ 红态掩盖断言缺失（变体验证：事实段消失但汇总同为 0/1、桶 1/1、非 dim-9=0）。修复：按 `script.crashPoint` 要求崩溃场景**必须返回非空事实**（null 仅非崩溃场景合法）+ 独立计数摘要行（**6/6**）+ 硬失败。
2. **R8-H4 STOP 后 epilogue 改写被拒清单**：丢失写分支只凭清单文本不同就设 lostWriteOccurred 并回写窗口清单，未先确认重入成功且清单有效——三种不一致态（self-digest / entry digest / 合法封印 cursor 超前）下入口正确 STOP 且当次字节不变，但驱动最终改写被拒字节（finalStable=false）。修复：**任何 manifest STOP 对 harness 即终态**——跳过丢失写与双恢复 epilogue + `refusedManifestStable` 钉死被拒字节于驱动全生命周期；async 测试缝（onCrashWindow，已 await——初版未 await 曾致写入与重入读竞态）。
3. **负向** +6（42→**48/0**）：三态 ×（拒判码正确 + 禁写 + 无 vacuous 事实）；self-digest/entry digest 未封印篡改先撞自摘要检查（MANIFEST_CORRUPT_STOP），cursor 超前态需合法封印文档（取一次正常跑的末态投影）→ JOURNAL_MANIFEST_MISMATCH_STOP。
4. **报告**：§6.2 全称表述改为「以负向矩阵为证」+ 完整诚实化历程（R7-H2→R8-H3→R8-H4）；§6.4 标题/轮次表补至 R8；**§2.1 更正「1767 总量」误述**（实为 system-capability-review 单文件内统计，runner 不打印跨文件总量——历史多处同误，报告内更正、后续以「逐文件全绿+文件级失败清单」表述）。

**验证**：tsc 0；行为负向 **48/0**；产物 **50/0**；比较器负向 **38/0**；行为矩阵 A′ 四要素完整（合并 0/50 按设计、桶 50/50 零新因、非 dim-9=0、超限 4/4）且六崩溃场景 interrupt@boundary=true、零重派、manifestCaughtUp=true、refusedStable=true，pre-manifest-write ×2 lostWrite+redrive=true，double-resume ×3 doubleNoOp=true，**崩溃事实计数 6/6**；全量逐文件断言全绿，文件级失败 2 = 按设计红矩阵 + 已知 codex-adapter 抖动（隔离 220 检查 0 失败恢复）。

剩余（每步先请 Current User 确认）：PR #197 描述同步（R8 轮记录 + 诚实化措辞）→ 独立复审（R9，范围 = R8-H3/H4 闭环 + 全 CLOSED 面不回归 + 崩溃仪器新 vacuous 路径自由裁量）→ PASS 后请 Current User 授权合并。

## 2026-09-25 家用机会话：R9 复审 FAIL → R9-H1/H2/H3 修复（@b0f158a 已推）

**R9 判定 FAIL**（外部只读副本 @7d15561，三项新阻塞；R8 原路径复审方判 CLOSED 不回退；报告 54 标题/三本账/§2.1 口径均 PASS；非阻塞：区间提交实为 46 个）：

1. **R9-H1 崩溃计数可退化为 0/0**：分母用了待核验的 `crashPoint`——六场景 crashPoint 全缺失时计数 0/0、无专属失败（退出码 1 仅来自 A′ 红）。修复：**分母改由 S-CRASH 注册表固定**（冻结六场景族身份），crashPoint 缺失逐场景专属报错 + 计数须 6/6 且 crashPoint 齐全 + 总数硬钉 6。**变异实证**：临时置空工厂 crashPoint → 0/6 + 六条 R9-H1 报错 + 退出 1；还原后 6/6。
2. **R9-H2 回滚后 STOP 仍执行双恢复**：STOP 状态只在回滚前捕获一次；回滚后重入再遭拒（回滚的库被改坏、入口重读前）仍进双恢复分支，凭零 dispatch 记 `doubleResumeNoOp=true`、虚报 `refusedManifestStable=true`。修复：**每次重入后重判 STOP**（回滚重入 + 双恢复重入），首次拒判即钉死当时字节并终止 epilogue，**拒判绝不记 NO_OP**；新增 onPostRollback 测试缝（await）+ 负向 1 例（49/0）。
3. **R9-H3 报告事实与实测不符**：§1/§2 负向 42→**49**；§3.12「六个 double-resume」→**三个**；§6.2「当前不存在已知 vacuous 路径」全称断言被 H1/H2 二次推翻 → 改为**已闭合清单（R7-H2/R8-H3/R8-H4/R9-H1/R9-H2 五条）+ 负向覆盖表述**，不再作全称断言；§6.4 补 R9 行；§9 仪器面句子同步。

**验证**：tsc 0；行为负向 **49/0**；产物 **50/0**；比较器负向 **38/0**；行为矩阵 A′ 四要素完整（合并 0/50 按设计、桶 50/50 零新因、非 dim-9=0、超限 4/4）且崩溃事实计数 **6/6**（注册表分母）；全量逐文件断言全绿，唯一文件级失败 = 按设计红矩阵（codex 抖动本轮未现）。改动面仅 tests/ + docs，生产代码零 diff；区间提交 46 个。

剩余（每步先请 Current User 确认）：PR #197 描述同步（R9 轮记录 + 提交数 46）→ 独立复审（R10，范围 = R9-H1/H2/H3 闭环 + 全 CLOSED 面不回归 + 崩溃仪器仍有的 vacuuous/退化路径自由裁量）→ PASS 后请 Current User 授权合并。

## 2026-09-25 家用机会话：R10 复审 FAIL → R10-H1/H2 修复（@0259e3c 已推）

**R10 判定 FAIL**（外部只读副本 @9937703，两项新阻塞；R9-H1/H2/H3 均判 PASS 不回退；报告 54 标题/三本账/§2.1 口径 PASS；非阻塞：提交数实算 48、页首旧 HEAD 待更新）：

1. **R10-H1 完成场景与超限场景缺独立规模守卫**：产物 runner 只查已运行条目失败数（删 1 个完成场景 → 49/0、退出 0）；超限循环只查 pauseFailed（删 1/全部 → 3/0、0/0 无专属错误）；桶分母随已运行脚本终态计数；A′ 退出 1 不能充当覆盖证明。R9-H1「分母自指」家族的第二例。修复：新增 **`registry-guard`** 模块（assertFrozenRegistry/auditFrozenRegistry）+ 三 runner 规模硬钉——产物层注册钉 **50 唯一 ID**（先于任何场景运行）；行为层完成注册钉 50 + **桶分母钉 50**（非已运行脚本）+ 超限注册钉 **4**（pausePassed 须等于 4）+ 崩溃注册重复诊断（R9 轮指出的缺失项）。丢项/重复/规模各自带专属诊断硬失败。
2. **R10-H2 报告 §6.2 夸大负向覆盖**：「8 个崩溃拒绝态」实为 **5 种注入状态 × 8 条断言**；「五条路径均被 49 负向钉死」不实——R7-H2 投影跳过、R8-H3 单项 null、R9-H1 crashPoint 缺失三条实际由 runner 守卫与变异推演闭环，负向矩阵中无用例。修复：§6.2 改为**逐路径证据归属表**（负向行 / runner 守卫 / 变异推演三类真实来源分别归属），崩溃拒绝态计数改为 5×8 表述；§1/§2 负向计数 49→**54**；§9 仪器面句子 38+54 + 规模守卫。
3. **负向** +5（49→**54/0**）：registry-guard 单元负向（精确通过 / 丢项 / 重复 / 规模各带诊断抛错 + 真实注册表 12/4/6 审计通过）。

**验证**：tsc 0；行为负向 **54/0**；产物 **50/0**；比较器负向 **38/0**；行为矩阵 A′ 四要素完整（合并 0/50 按设计、桶 50/50 零新因、非 dim-9=0、超限 4/4）且崩溃事实 **6/6**、三注册规模钉宣布生效；**R10-H1 变异实证**：删 S-INIT 族 →「ran 42, expected 50; 8 entries lost」退出 1；删 1 个超限场景 →「ran 3, expected 4; 1 entry lost」退出 1（均还原）；全量逐文件断言全绿，唯一文件级失败 = 按设计红矩阵。改动面 tests/ + docs，生产代码零 diff；b8923fc..HEAD 实算 49 commits，报告页首已同步。

剩余（每步先请 Current User 确认）：PR #197 描述同步（R10 轮记录 + 49 commits）→ 独立复审（R11，范围 = R10-H1/H2 闭环 + 全 CLOSED 面不回归 + 其他计数器/守卫的同类「分母自指/一次性捕获」普查）→ PASS 后请 Current User 授权合并。

## 2026-09-25 家用机会话：R11 复审 FAIL → R11-H1/H2 修复（@ed71783 + docs 已推）

**R11 判定 FAIL**（外部只读副本 @1819eae，两项新阻塞；R10-H1/H2 中 H1 判 PASS/CLOSED、H2 判需修订；R1-R9 CLOSED 面零回归；非阻塞：页首旧 HEAD、「三 runner」数量词、对等量 ID 替换防护边界）：

1. **R11-H1 负向矩阵覆盖数可自减为绿**：负向矩阵的 passed 只累加仍在执行的断言，无独立冻结分母——删 5 条行为负向（R10-H1 五例）→ 49/0 退出 0；删 1 条比较器负向（D-17 OPEN 行）→ 37/0 退出 0。R10-H1 守的是场景注册表，没守负向覆盖登记。修复：新增 **`negative-guard`** 模块（组级 label + 冻结断言总数）：每套负向声明冻结组登记与总数，未登记/重复 label、组缺失、**空集**、总数漂移各自专属硬失败。接线：行为负向 **6 组 / 54 条**、比较器负向 **5 组 / 38 条**。**变异实证（复刻复审方两种删项）**：删 5 条 →「executed 49, frozen 54（5 assertion(s) lost）」退出 1；删 1 条 →「executed 37, frozen 38（1 assertion(s) lost）」退出 1（均还原复绿）。
2. **R11-H2 报告证据归属及版本事实失真**：页首 0259e3c/49 vs 实际 1819eae/50；§1 负向 49 vs 54；§6.2 R7-H2 行把相邻 WP-1 负向误记为投影跳过路径功劳（实际该路径由 runner 断言 + R8 轮归档变异闭环，负向矩阵中无用例）；§6.2 概述「每态断言」范围超出种子用例实际断言；§6.4 缺 R10 行、§9「九轮」过期。修复：**页首确立「数据基线 commit」约定**（实测数字以最后代码提交为准，docs 同步提交只改文档——当前基线 ed71783 / 51 commits）；§1 改 54 + 冻结覆盖登记表述；R7-H2 行去除误记并明示「不得把相邻 WP-1 负向记为该路径证据」；每态断言按实际来源分别表述（种子=拒判码；窗口三态=拒判码+禁写+无 vacuous；回滚后态=另含双恢复不执行）；§6.4 补 R10/R11 行；§9 改十一轮 + 规模守卫/覆盖登记两项；归属表补 R11-H1 行；「三 runner」改「两套矩阵 runner、三类注册守卫」。

**验证**：tsc 0；行为负向 **54/0**（冻结覆盖登记公告生效）；比较器负向 **38/0**（同）；产物 **50/0**；行为矩阵 A′ 四要素完整（合并 0/50 按设计、桶 50/50 零新因、非 dim-9=0、超限 4/4）+ 崩溃 **6/6** + 三注册规模钉；全量逐文件断言全绿，唯一文件级失败 = 按设计红矩阵。改动面 tests/ + docs，生产代码零 diff；b8923fc..ed71783 实算 51 commits。

剩余（每步先请 Current User 确认）：PR #197 描述同步（R12 轮记录 + ledger-guard/frozen-ledger 改动面）→ 独立复审（R13，范围 = R12-H1 闭环 + 全 CLOSED 面不回归 + 账本/封签/包装三层各自的元层次自查：账本注释性漂移、封签算法替换、包装被整体替换等）→ PASS 后请 Current User 授权合并。

## 2026-09-25 家用机会话：R12 复审 FAIL → R12-H1 修复（守卫锚点外置为封签账本；@4c725f2 已推）

**R12 判定 FAIL**（外部只读副本 @ed3cbde，一项新阻塞；R11-H1 原始删项症状、R11-H2 均判 CLOSED 不回退；R1-R11 CLOSED 面零回归）：

**R12-H1 守卫缺少独立锚点**：冻结值与受检 runner 同仓同改——R11-H1 的原始删项能正确失败，但**同步缩减冻结值+删项**（54→49+删 5 条）、**缩组表+删组**、**旁路 settle**、**改场景常量 50→49+删场景**四类均假绿（49/0 退出 0，负向 runner 还输出写死的「54 assertions」）。修复（按评审边界：独立于受检 runner 的冻结账本 + 摘要从实际核验生成）：
- **frozen-ledger.json**（新，数据）：仪器全部分母作为**数据**——场景 ID 清单（完成 50 / 超限 4 / 崩溃 6）+ 两套负向分组登记（行为 10 组/54、比较器 5 组/38），内容摘要自封 `ledger_digest`；
- **ledger-guard.ts**（新，代码）：封签是**代码**——`FROZEN_LEDGER_DIGEST` 常量。只改数据 → 内容摘要不符硬失败；改数据+重封 → 模块封签不符硬失败（伪造需同时故意动两类文件）；`assertScenarioLedger` **逐 ID 双向核对**（丢失/重复/顶替逐名叫名，非计数）；`runNegativeSuite` **结构化包装**——settle 内置于包装内（无独立可删调用点），每组须跑恰冻结条数，摘要行由实际执行生成（不再写死）；
- 旧 registry-guard/negative-guard **合并删除**（单测移植为逐 ID API 四态 + 密封账本本身一例）；四个入口（两矩阵 runner + 两负向）加载同一密封账本——改账本四处处硬失败。

**四类假绿推演实证（复刻复审方手法，全部硬失败）**：①账本总量 54→49+删 5 条 → seal mismatch 退出 1；②缩组表+删组 → seal mismatch 退出 1；③删场景 →「missing: S-CRASH-…（6 个 ID 逐名叫名）」退出 1；④settle 旁路 → 结构性不可达（包装拥有 settle，删除包装=删掉整个入口）。

**验证**：tsc 0；行为负向 **54/0**（10 组，逐组恰冻结条数）；比较器负向 **38/0**（5 组同）；产物 **50/0**；行为矩阵 A′ 四要素完整（合并 0/50 按设计、桶 50/50 零新因、非 dim-9=0、超限 4/4）+ 崩溃 **6/6** + 三注册账本钉；全量逐文件断言全绿，唯一文件级失败 = 按设计红矩阵。改动面 tests/ + docs（2 删 2 增），生产代码零 diff；b8923fc..HEAD 实算 54 commits。报告同步：§6.2 归属表补 R12-H1 行、§6.4 补 R12 行、§9 十二轮 + 独立锚点项、模块名更正。

**措辞纪律（2026-09-24，R8 任务书重发时确立）**：复审 prompt 属**仪器审计**语义，严禁安全攻击类词汇——「攻击 / 抓住 / 篡改 / 假绿 / 对抗 / 构造错误」等一律弃用，改用中性词（异常 / 识别 / 受控修改 / 错误通过 / 构造不一致）。两个原因：①语义失准——我们审的是验收仪器的诚实性，不是网络安全行为；②实操教训——这类词在评审方会话会触发模型侧安全检查误报（Daybreak 类拦截），曾阻塞 prompt 投递。R8 任务书已按净化措辞重发（实质内容零丢失：基线、七张推演门期望、已知事实清单、证据基线数字原样）；**后续各轮复审 prompt（及唤醒 prompt）沿用本纪律**。

## 2026-09-23 公司机会话：R1 独立复审 FAIL → 补救（H3/H1 已落地验证；H2 调查结论+实现待续）

**R1 独立复审判定 FAIL**（外部只读副本 @ d5fe4b2，四项阻塞 R1-H1～H4；对本 harness = 验收仪器本身的缺陷，比场景失败更严重）。Current User 裁决：**H1 用 A′**（surfaced 分歧 + 钉死桶，BLOCKED 永不报 MATCH，门等生产修复）、**H2 授权调查**（含「S-INIT 轴不可经入口驱动」作为可行结论）、生产缺陷 **R-G6-01 单列路由**。

### R-G6-01（路由的生产发现，两个症状，同属 c2/c3 证据链读错源）

生产入口的 c2/c3 handoff checklist 对**任何 conforming completing 链**恒报 BLOCKED：① **closureReviewDone** 读 code-review 事件的 gateResult，而事件合同把非 formal_verdict 执行的该字段钉死为 `NOT_APPLICABLE`（node-output-envelope.ts:22 / loop-capability-execution.ts:479；closure review 裁决本在 review 输出产物里——node-capability-contracts.ts:89-91）；② **pathEntry** 读**单次 invocation 内**的 c1 变量 `resolvedImplementationDepth`（runtime.ts:1089/1271），staged/有界波（正式生产 rework/resume 的常态）在完成 invocation 里该变量已丢 → 「development path entry not allowed: no formal_verdict event with materialized depth found」。两个症状的 reason 串已被 runner 桶钉死（见下）。**修复需 decision record + 生产代码变更，超 D-090-04 授权，单独路由；G6 测试不掩盖。**

### H1 补救（A′，已落地验证）

- **driver**（behavior-face.ts）：捕获生产入口返回的**真实 handoff 三元组**（status/reason/artifact_ref——此前整个丢弃）；trace 增 `handoff` 字段。
- **比较器**（behavior-comparator.ts）：dim 9 = 真实三元组 vs 声明期望（`FactScript.expectedHandoff`，缺省按脚本终态形状推导：末节点 knowledge-sync ⇒ READY_FOR_MANUAL_GIT_HANDOFF + ref 必需；否则 ABSENT），字段级比对、**缺失证据拒判**；dim 2 从计数升级为逐轮双 binding 条目（角色×attempt）；dim 7 从链终态布尔升级为逐轮 §7.3 A1 准入语义（admitting ⇒ 前进；non-admitting ⇒ finding 授权的回退或预算拒绝的停机），以**实际调度序列**为据（伪造入口字段不再能打印 MATCH）。
- **runner A′ 桶**：dim-9 分歧按 R-G6-01 双签名分类（BLOCKED + reason∈{两症状} + ref 存在 = 已知原因）；桶必须恰好等于 completing 场景数且零新因，否则硬失败。本次实测：**50/50 已知原因、0 新因**；合并判定 0 passed / 50 failed（dim-9 surfaced，符合 A′——门等生产修复）；超限单列 4/4 且 durable 终态码恢复（`REGATE_ROUND_BUDGET_EXHAUSTED`——修复了一处 H1 改造误将快照读码回退的回归）。
- **负向钉死**（新文件 tests/g6-parity-behavior-negative.test.ts，11 项）：R-G6-01 反例本例（真实跑 S-CORE-STANDARD-PASS-first：链 COMPLETED/success 而 checklist BLOCKED，比较器必须 DIVERGE）、缺失证据拒判、ref/reason 漂移、dim2 缺 binding/错 attempt、dim7 前进违规/回退错节点。
- **验证**：tsc 0；行为负向 11/0；比较器负向 33/0（+5 新例）。

### H3 补救（已落地验证）

- **comparator.ts**：删 catch-up 模式对**每一行** finding_id 的 blanket 重写（真实 ID 从不参与比较——复审的伪造 ID 反例因此通行）；改为 `applyVerifiedFindingIdExemption`：仅当运行时 ID **经 store 证实时**（`storeFindingIds`，runner 从 journal 事实传入）且与手动行在稳定身份（discovered_at::evidence_ref）上配对，才赦免该闭合行的 ID 翻转；OPEN 行/未配对行/伪造 ID 逐字比较必败；无证传入时零赦免（fail closed）。
- **runtime-face.ts**：StoreLevelResult 回传 store finding ids；两 runner 传证。
- **负向**：reconcile 真实 finding 基线四例——合法翻转赦免（正控）、**复审反例（伪造 ID）必败**、takeover 字面必败、未配对行（即便 ID 有证）必败。产物层矩阵 50/0 复跑确认（reconcile 在新豁免下仍过）。

### H2 调查结论（实现待续）

- **S-INIT：四类初始化在生产入口路径无行为面**（授权分支之一的结论）。init 类（NEW_EMPTY/EXISTING_CODE_NO_KNOWLEDGE/LEGACY_SDD/LEGACY_SDLC_SDD）属 **D-088-01 初始化器层**（Decision-090/091），入口请求的 sourceFiles 全仓无下游消费者（loop-production-entry.ts:173 仅校验数组、允许空；loop-intake-manifest.ts 的非空要求不在 runProduction 路径），入口内无 readiness/类判别逻辑。§3「init 类影响入口节点与 readiness preflight」只剩 intake 材料差异被脚本建模——readiness preflight 部分无法经本入口 parity。处置：如实写入验收报告（H4）为规格-实现边界发现 + 路由建议（§3 论证修订，或 init 类 parity 归 D-088-01 验收面）；不伪造覆盖。
- **S-CRASH：设计已定，实现为下一 beat**。行为层加「中断-重入」模式：三崩溃点映射为 dispatch 边界中断（post-gate-verdict = 首轮 verdict terminal 后；post-finding-migration = 闭合窗（design v2 物化后）；pre-manifest-write = 末节点 terminal 后、invocation 收尾前），首 invocation 以 maxDispatches 定界中断，同 runId 重入 runProduction 走真实恢复路径，断言：不重派已完成节点、链续跑至完成、双恢复稳定；manifestLibraryDir 传入使入口内投影调用点（runtime.ts:1043-1058）生效，journal/manifest 追赶可观测。负向：错误续点必须拒。store 级 digest 对照保留但不代称入口恢复（复审原话）。

### 验证现状（本 beat）

tsc 0；产物层 50/0；行为层负向 11/0；比较器负向 33/0；行为层矩阵：合并 0/50（dim-9 全数 R-G6-01 已知原因，pin 闭合）+ 超限单列 4/0。全量回归待 H2/H4 落地后重跑（serial 基准）。

### 剩余（每步先请 Current User 确认）

① S-CRASH 中断-重入实现 + 负向；② H4 报告重写（54 可定位条目、账目 **52−5−4+7=50**（剔 5/退 4/挂 7）、语义第 1 条按 D 族 verdict 登记通道实证改写、R-G6-01 双症状单列、S-INIT 边界发现、并行抖动归因收窄）；③ 全量回归（serial 基准 + 三 G6 文件 + 两负向）；④ 推送授权；⑤ R2 独立复审（H1～H4 逐项闭环 + 负例全部门 + M1 R2 已 PASS 项不回归）。

## 2026-09-23 公司机会话：M2 第 3 步——PWR×Re-Gate 补建 3 + 账目对账 + 验收报告骨架

- **账目对账结论**（程序化提取全部场景坐标 vs 规格 §3 逐行比对，提取脚本结论已复核）：规格 52 = S-CORE 36 + S-INIT 8 + S-MANIFEST 2 + S-CRASH 6；S-INIT/S-MANIFEST/S-CRASH 与建成 1:1。S-CORE 36 行 = **27 建成行**（24 原有 + 3 补建）+ **5 规格剔除行**（升档×BU×2、BU×Re-Gate×3）+ **4 退化行**（DEEP×升档：规格 round 语义限定升档仅 LIGHT→STANDARD / STANDARD→DEEP，hard ceiling）。34 个 S-CORE 场景 = 27 行 + **7 个同行加挂**（B×3 与首轮 PASS 行、E/F×3 与 DEEP-PASS-Re-Gate 行、D 与 DEEP-FAIL-Re-Gate 行，各为「同行不同粒度/不同授权路径」）。产物层合计 **50 = 52−5+3**；行为层单列 4（FAIL×3 在 A 已覆盖行加第二种粒度、BU×1 在剔除行作演示）。
- **对账发现 + Current User 裁决**：**PWR×Re-Gate ×3（LIGHT/STANDARD/DEEP）无场景且无剔除依据**——M2 家族规划遗漏（规格 36 行内的合法坐标：re-gate 终裁 PWR 无语义障碍）。裁决选项 A **补建**（备选 B「事后列剔除」无规格依据、削弱完成门成色，弃）。落地形态 = C 族 re-gate 授权（review 发现 SOLUTION finding → reflow → re-gate 闭合绑 design v2）+ PWR 首轮（scan finding 风险接受）。
- **补建期两轮修复（新实证生产语义）**：① **手动面 finding-action 结算点镜像**——从「末尾批处理」改为「按结算点在声明之间发布」，镜像 runtime `settleFindingActions` 的 **stage-local 轮次基数**（gate 段用 gateRound、code-review 段用 reviewRound，互不共享；Current User 2026-09-22 流程模型定案的同一原则）。动因：publisher 校验 accept 时读 gate **当前**行，末尾批处理会把 PWR accept 读到后续 re-gate 的 PASS 行而拒收（ADMISSION_DENIED）。50 场景零回归，且更贴近真实手动流程形状。② **finding 注册的 source revision 必须 ACTIVE 且为当前指针**（loop-run-store.ts appendFinding）——PWR 轮 scan finding 注册即失效被审 design v1（M1 已实证、手动面 staleNodes 镜像），故 PWR×Re-Gate 波中 review 发现（CR-F01）锚定改挂被审 **implementation v1**（§5.1 允许任意节点产物作发现锚），earliest（回流目标）不变。
- **验证**：tsc 0；产物层 **50 passed / 0 failed**；行为层 **50/0 合并判定 + 4/0 单列**；负向 28/0；全量 npm test 首跑 1767 passed/0 failed 但触发已知环境抖动（loop-delivery-checkpoint-store.test.ts 并行满载间歇 1 文件失败，failed_file_count 1），隔离复跑 **268/0 恢复**，全量复跑中（干净数字待回填报告 §2.1）。改动面仍限 tests/ + docs，生产代码零改动。
- **验收报告骨架落盘**：`docs/reports/g6-d09004-parity-acceptance-report.md`（规格 §7 格式：逐场景 54 节 / 52 行×九维汇总表 / 账目对账 / D-7/D-17 finding-identity 说明 / 十条生产语义 + 本轮新实证 / 未归因 diff 单列（无）/ 剔除项清单（含 BU×Re-Gate 实证张力备注）/ 完成门三项判定 = PASS·PASS·未申请）。
- 剩余（每步先请 Current User 确认）：本 beat 提交（feat PWR×Re-Gate + docs 交接 + report）→ 全量复跑干净后**推送授权** → 第 4 步单 PR（base feature/loop-runtime-v1）+ R1 自证 + 独立复审 prompt（会话内展示不落文档；范围必须含 D-7/D-17 + 十条 + ⑧⑨⑩ + finding 注册货币性新实证 + 账目对账 + PWR×Re-Gate 补建裁决记录）。

## 2026-09-23 公司机会话：M2 第 2 步完成——超限暂停 4（行为层单列，全量回归绿）

- 落地超限暂停 4（`S-CORE-LIGHT/STANDARD/DEEP-FAIL-overlimit-pause` + `S-CORE-STANDARD-BU-overlimit-pause`，行为层 only）：两轮非收敛裁决后，轮数预算拒绝第二次重启，runtime 落 **durable 终态 `REGATE_ROUND_BUDGET_EXHAUSTED`**（journal 持久 block、零 dispatch 落定；该码由 run 快照 `blockingReasonCode` 读出——invocation 终态返回不携带它）。合并判定 **47/0 无回归** + 单列 **4/0**；产物层 47/0、负向 28/0、tsc 0、全量 npm test **1767 passed / 0 failed（170 文件，960s）**。改动面仅 tests/（+201/−8，5 文件），**生产代码零改动**。
- **预算分层实证（新知识）**：`maxDesignRounds`/`paused`/`DESIGN_REVISION_EXHAUSTED` 属 design-orchestrator（coordinator 装配），**不在 `runProduction` 链内核路径上**，行为层无法直达该终态；行为层入口的预算是链内核的 `maxRegateRounds`（默认 9，按持久化回退跳转计数，`authorizeRegateDispatch` 同 permit 事务落 block——零 dispatch、零 revision 写；仅 `releaseRunRegateBlock` 的 RISK_ACCEPTED/SCOPE_RESET 可释放）。
- **预算注入口径**：`FactScript.maxRegateRounds`（types.ts 新增字段）把 entry 自身选项 `ProductionRunDeps.maxRegateRounds` 原样透传，这 4 个场景填 1 =「一次重启授权、第二次拒绝」，对应 maxDesignRounds=2 的轮预算语义（2 轮内须 PASS，第三轮设计即超限）。与 maxDispatches 同性质的边界参数，非 shadow；挂账两项（默认 2→3；journal 回流显式上限）不动。
- **驱动器两处新机制**（behavior-face.ts）：① **durable-block 护栏**——预算耗尽后 recovery 仍把 regate 目标报为 next point（非 null），无护栏会空转重 invoke 至 128 次上限；改为快照 durable block 存在即诚实停机（对应手动面「人停下不等了」——无 release 决策可 Advance）② 场景 `maxRegateRounds` 透传。结算逻辑零改动：F01 于 design v2 物化后的 invocation 间窗口闭合（绑 design v2），F02 绑 design v3 永不产出保持 OPEN，R2 verdict 合成 reflow 行因 design v2 已被 stale 无 ACTIVE 可绑保持 OPEN——停机时 OPEN 集即手动面「人停下、修复待办」形状。
- **比较器一处推导**（behavior-comparator.ts）：final-handoff 期望终态按脚本末 gate 裁决推导——非收敛脚本（末 gate 非 PASS）期望「停在最后脚本节点的非成功终态」；现有 47 脚本末 gate 全 PASS/PWR，语义不变、向后兼容。next-eligibility 原已支持（期望 blocked 链）。
- **runner 单列口径**（g6-parity-behavior-matrix.test.ts）：合并判定节 47 不动；新增 over-limit pause 节——只跑生产入口轨迹 + 比较器六维 + 显式断言 durable 终态码，独立计数、独立摘要行，注明「artifact layer NOT judged … not counted in the artifact-layer pass count」（R2 诚实性约束④）。产物层 runner 不 import 新家族，47 计数不变。
- 剩余（每步先请 Current User 确认）：第 3 步账目对账（产物层 47 + 行为层 47 + 超限单列 4 vs 规格 52，逐条列清剪枝组合 + 返工波编组粒度 + 两层各自坐标；超限 4 行是 S-CORE/re-gate 坐标的 behavior-only 新增行，是否计入 S-CORE 36 由对账定）+ 验收报告骨架 docs/reports/g6-d09004-parity-acceptance-report.md（规格 §7；须含 D-7/D-17 finding-identity 说明、十条生产语义、未归因 diff 单列）→ 第 4 步单 PR（base feature/loop-runtime-v1）+ R1 自证 + 独立复审 prompt（会话内展示不落文档；范围含 D-7/D-17 + 七条 + ⑧⑨⑩ + 账目对账）→ PASS 后请授权合并。

## 2026-09-22 晚：M2 第 1 步完成——行为层全家族扩展 47/47（家用机会话）

- 行为层矩阵从 S-CORE 首轮 12 扩到**全 47 场景合并判定**（多轮 3 / review 返工 3 / review→re-gate 3 / 需求级回流 2 / feedback re-gate 2 / 升档×FAIL 2 / 升档 4 / S-MANIFEST 2 / S-CRASH 6 / S-INIT 8），`47 passed / 0 failed`；产物层 47/0、负向 28/0、tsc 0、全量 1767/0（170 文件）无回归。改动面仅 tests/（runner + behavior-face + behavior-comparator），**生产代码零改动**。
- 实测路径：纯注册先跑出缺口图（27 绿/20 红，红面与静态预测逐条吻合）→ 机制扩展 → 45/47 → F 族接线 47/47。
- 驱动器机制（behavior-face.ts）：① **信封 finding 下放**——非 gate 节点（code-review）完成带 finding 时信封携带（B/C/E 唯一注册通道）；D 的 REQUIREMENT finding 走 **verdict 信封**（scan 注册不带 §5.4 边、无法触发 intake 回流；verdict 注册带边）② **派生闭合只能在 invocation 间**——store 明禁活动执行期 finding 转换（"finding transitions cannot advance while a capability execution is active"，adapter 内闭合实测 illegal：scan attempt 失败→受控重试→轨迹污染，已弃）；闭合规则=「声明绑定 revision 当前 ACTIVE 即闭合」，证据=materialize 该 revision 的终态事件自身 output（M1 的确认轮 verdict 即其特例）③ **有界 invocation**（maxDispatches=1，纯安全边界、不落持久 block）覆盖三类波：多轮/G（闭合须落轮间——下一轮 verdict 合成 reflow 会 stale 绑定 revision）、D/E（requirement 级回流跨边界才重导 origin 规范源）、F（WP-1 记录注入点）；其余波整 invocation 跑到底、staged 停点闭合（M1 原路径不变）④ 未映射合成 reflow 行（D 波多出的 SOLUTION 行）按其 earliest 节点当前 revision 闭合 ⑤ F 族：触发终态 settle 后于 invocation 间落 WP-1 FEEDBACK_DRIVEN_CHANGE 记录，生产 recovery 自行推导二代整链重建；staged 循环退出条件=「无推进（无闭合/无 feedback）且无 live next」。
- 比较器（behavior-comparator.ts）：earliest-reroute 期望目标在 opensFeedbackChange 时含 requirement-intake（feedback 整链重建是代际重启、非 finding 回流）。
- runner 两处修正：catchUpRegime 传参（reconcile/crash 的 D-7/D-17 豁免——行为层 runner 原本漏传，注册前必修）；S-MANIFEST-corrupt 的 expectStop 处理（fail-closed 单级判别按冻结规格，行为层只做轨迹回放、输出单列）。
- 新实证生产语义（评审必含，接七条之后的第 8/9/10 条）：⑧ **活动执行期禁止 finding 转换**——finding 闭合的合法窗口只在 invocation 之间；⑨ **invocation 内回流到 requirement-intake 无法重导 origin 规范源**（loop-capability-entry.ts point 0 检查 + 每迭代输入采用只认前驱输出、point 0 无前驱），只有跨 invocation 边界的 deriveDispatchCommand 推导——requirement 级回流必须跨 run 边界；⑩ **FAIL/ESCALATED verdict 合成 SOLUTION reflow 行**（带边、立即失效当前 design），agent 声明的非 SOLUTION 行不抑制合成（D 波因此多一行，harness 显式闭合）。
- 剩余（每步先请 Current User 确认；第 2 步已于 2026-09-23 完成，见上两节；第 3 步亦已完成）：第 4 步单 PR（base feature/loop-runtime-v1）+ R1 自证 + 独立复审（范围含 D-7/D-17 + 七条 + ⑧⑨⑩ + 账目对账）。

## 2026-09-22 收工状态（接 2026-09-21 晚进展；公司机会话第二、三波）

- 分支 `feat/g6-t2-m2-scenarios` @ **`4302b04`** 已推、工作区干净；主线仍 `b8923fc`（M2 未上主线）。
- 矩阵 **47/47 + 行为层 12/12 合并判定全绿**（spec §4.2 merged judgment）：行为层驱动器 = 生产入口本体（runProduction 真实门 + 注入脚本化网关，非 shadow）+ 分级 resume（finding 逐条闭合落在两轮 run 之间，同手动面 finding-action 发布在声明之间）；比较器判 dims 1/2/6/7/8/9（决策轨迹），3/4/5 维 NOT_JUDGED（产物层判）。
- 行为层接线期实证的生产语义（已固化进驱动器）：findings 属 scan 轮 ledger envelope、verdict envelope 必须 findings: []（自带 finding 即阻断）；FAIL/BU 回流由网关合成 reflow finding 授权；PWR 裁决终态内接受 ledger 成员故不回流；BU envelope 须显式 decisionDepth: null；闭合证据=确认轮 verdict 事件自身 output ref/digest（网关存 envelope 非 raw body）；behavior run 的 runId 走小写；回流=规范序回退跳转（re-gate 是前进不是回流）。
- 矩阵 **47/47 绿**：39（见下）+ **S-INIT 8**（四类初始化 D-088-01 重基线：NEW_EMPTY / EXISTING_CODE_NO_KNOWLEDGE / LEGACY_SDD / LEGACY_SDLC_SDD × STANDARD×PASS 首轮 / STANDARD×FAIL 回流；类差异在 requirement-intake 收敛、其后链同构——规格 §3 的论证由四类全跑两种波形实证）。
- **账目对账（待验收报告处理）**：已建 47 = S-CORE 31 + S-MANIFEST 2 + S-CRASH 6 + S-INIT 8；规格 52 = S-CORE 36 + S-INIT 8 + S-MANIFEST 2 + S-CRASH 6，差 5 来自剪枝组合（BU×Re-Gate、升档×BU）与返工波场景同坐标不同粒度的编组，报告需逐条列示。
- 矩阵 **39/39 绿**：33（见下）+ **S-CRASH 6**（三崩溃点 × 单次/双次恢复：post-gate-verdict 尾段未投影→catch-up；post-finding-migration 闭合+尾段混合追平；pre-manifest-write 丢失写后回滚到 takeover 已发布态、resume 重推出文档必须与丢失写前逐字节一致；双次恢复必须 NO_OP 逐字节稳定；手动侧 publisher 同输入重放逐字节幂等已断言）。范围说明：覆盖投影器 store 级崩溃/恢复语义；真实 CLI `--resume` 路径属行为层 full-chain 驱动器。
- 矩阵 **33/33 绿**：31（见下）+ **S-MANIFEST 2**（reconcile：中途 takeover + V9 混合追平——journal 尾段与 finding 闭合一次原子落盘，重放 NO_OP 逐字节稳定；corrupt：篡改 self-digest 后投影器 MANIFEST_CORRUPT_STOP fail-closed，单级判别）；负向 **28/0**（新增 catch-up 机制豁免范围用例：目录段/digest/finding 证据变更仍必失败，basename 豁免仅限 catch-up 机制）。
- **G6 新发现（Current User 裁决选项 A）**：catch-up 路径会把 cursor 后有事件的节点行整体替换为 runtime 推导行，与手动 publisher 规范存在两处**设计内**表示差异——D-7（artifact basename 是 face mapping 豁免：runtime 推导英文名 vs publisher 硬 gate 强制中文规范名，投影器 pathSemanticKey 故意不含 basename）与 D-17（finding 闭合时行 authority 翻转 runtime、行 id 变 store 分配 id）。comparator 增设 catch-up 机制模式镜像这两条豁免（路径按「目录段::capability」语义键、finding 身份按 discovered_at::evidence_ref）；takeover 机制 32 场景保持逐字节字面比较，R1-H4 负向回归不受影响。验收报告需在 finding-identity 维度显式说明 D-17 id 翻转。
- 矩阵 **31/31 绿**：12 首轮 + 4 升档 + 3 多轮（A）+ 3 review 本地返工（B）+ 3 review 发现方案问题→re-gate（C）+ 1 gate 发现需求级回流（D）+ 1 review 发现需求级回流（E）+ **2 feedback 驱动 re-gate（F，零 finding 的非 finding 路径：WP-1 FEEDBACK_DRIVEN_CHANGE 开新代际、从 intake 整链重建、授权经 store regate 上下文 feedback 分支）+ 2 升档×FAIL（G）**；负向 24/0；tsc 0；npm test 全量 1767/0（169 文件）已跑。
- 已知环境抖动（非本次 diff 引起）：`tests/loop-delivery-checkpoint-store.test.ts` 在并行满载下间歇性 1 文件失败（跨进程并发写场景），隔离 268/0；连续两次复跑 0 失败。
- **流程模型（Current User 2026-09-22 详细描述定案）**：方案对抗审核发现方案问题→改方案→re-gate（多轮）；方案通过后经任务拆分/实现/审核，审核发现**代码**问题且不涉方案→直接回流实现修改后重新审核（不触发 re-gate）；**仅当**发现方案问题或需求补充→回流需求归一或方案生成→这才触发 re-gate。**re-gate 轮次按阶段独立计数**（方案审核、代码审核各一套，不共享轮次值）。
- **全部形态由 wms-monitor 生产实证定型**：A=gate finding 闭捆 design 修订（config F01-F06）；B=review finding earliest=implementation、闭捆 implementation 修订、证据=re-review 产物（lifecycle 22 个 + config F08-F11）；C=review finding earliest=solution-design、闭捆 design 修订、证据=**design 产物**（lifecycle CR-F12）；D=gate finding earliest=requirement-intake、闭捆 intake 修订（config F07）；E=需求补充路径（同 C 机制换 REQUIREMENT 类）。同类证据：A 用该轮 gate 产物。
- 驱动器机制：per-stage 双轮次计数器；任意节点完成可注册 finding（该节点完成带 finding 时 eligibility=BLOCKED，回退由 OPEN finding 授权）；闭合证据=脚本声明产物（与手动面同源，修正了升级家族预先存在的「结算轮 vs 声明证据」不一致）。
- 用户裁决（沿用）：① Re-Gate 非 finding 路径（requirement-change 授权）仍待办；② M2 单 PR 收口；③ 超限暂停 4 = FAIL×LIGHT/STANDARD/DEEP + BU×STANDARD（行为层 only）。
- **多轮波收官（本波核心）**：落地形态 = **每轮一个 finding**（非用户示例的 R1 同轮 a/b/c）——两条引擎硬约束逼迫：① takeover 配对按 evidence 唯一匹配，同轮 finding 共享 scan-ledger blob 不可区分（歧义拒判；手动面也无法把同一 blob 引用 N 次而不歧义——真实手动约定是各异 ledger#F0n，反而完全不配对）；② 投影 provenance 要求闭捆 revision ref 唯一，两个 finding 绑同一轮 revision = duplicate-closures MANIFEST_CORRUPT_STOP。持续累积模型完整保留（finding 跨轮累积、每轮回退由 open 集合授权、各自确认轮绑该轮 design revision 闭合）。
- **批量 API 结论（取代原下一beat 计划）**：`appendCapabilityExecutionWithFindings` 的「终态+注册熔合」与「先结算后注册」时序互斥——finding 迁移禁止活跃执行期（终态前结算被拒），批量 invalidation 会使闭捆 revision 在结算前变 STALE（终态后结算被拒）。N=1 时逐条路径本就正确且与生产一致，批量 API 无增益。
- 多轮波实测（STANDARD-FAIL-multiround）：4 轮 verdict（FAIL×3 BLOCKED → PASS ELIGIBLE）；3 finding RESOLVED 各绑 design v2/v3/v4；gate revision 恰 1（PASS，semver 4.0.0）；design v1-v3 STALE、v4 ACTIVE；两面 findingIndex 三行深比较一致（配对 1:1）。
- **用户裁决（2026-09-22）**：① S-CORE 剩余编组——Re-Gate 家族单独编 2-4 场景（方案变更触发重裁，candidate 机制 = requirement-change 记录的 feedbackChange 授权路径）+ FAIL×升档 1-2，剪枝项（BU×Re-Gate、升档×BU）在验收报告列示不建场景；② M2 单 PR 收口（与 M1 一致）；③ 超限暂停 4 = FAIL×LIGHT/STANDARD/DEEP + BU×STANDARD（行为层 only，runner 单列不计产物层通过数）。

## 2026-09-21 晚 M2 进展（家用机会话）

分支 `feat/g6-t2-m2-scenarios`（未上主线）。**矩阵 16/16 绿**：S-CORE 首轮 12 + **升档波 4**（LIGHT→STANDARD、STANDARD→DEEP × PASS/PWR 终裁）——升档波按 d087 形状落实并双方言协议实证：ESCALATED verdict 携带**新** required_depth（publisher 同发布更新 = 投影器 foldDepth，代码级互证），reflow 由 §5.4 finding 授权（FAIL/ESCALATED verdict 欠链 reflow 事实，store `registerReflowFinding` 可合成，harness 显式注册）。

**多轮波（FAIL→FAIL→PASS）待定案，两个协议约束已实证**：
1. 单 finding 只授权**一次** restart 跳转——同一 OPEN finding 下的第二次反向跳转被链校验器拒（regate 上下文按 journal 事实推导授权）；
2. 一个 revision 只容**一条** closure 行——两个 finding 闭合于同一最终 gate revision = duplicate-closures `MANIFEST_CORRUPT_STOP`。

**已定案（Current User 2026-09-21）：finding 持续累积模型 = 现实手动复审流程**——finding 是全局集合、只有状态（open→closed）、不属于轮次；每轮回退由当前 open finding 集合授权；finding 在**其修复被确认的那一轮**关闭并绑该轮 revision/证据；「部分关闭」= 保持 open（协议无 partial 态）。链形态：R1 FAIL 注册 a/b/c → design v2 → R2 关 a/b、c 留 open、注册 d → design v3 → R3 关 c/d、注册 e → design v4 → R4 关 e、PASS → 下游链。两约束天然满足（每轮有新 finding 落账提供授权事实；各 finding 闭合于各自确认轮、closure revision 各异）。

实现进展（2026-09-21 晚续）：
- **store 验证通过**：`resolveFinding` 闭合 revision 只需「存在、不早于 earliest affected node、该节点当前 ACTIVE」——design revision 合法、**非 PASS 轮闭合合法**（verdict 结果不参与校验）。
- **驱动器已改**：`closedAtRound`（按确认轮结算）+ 脚本声明的 `boundRevisionId` 作闭合 revision（不再硬绑 gate revision）+ scan 终态时序「先结算本轮确认、后注册本轮新发现」（新 finding 的 invalidation 会 stale 其绑定 revision）。实现细节恢复 16/16 绿。
- **剩余唯一阻塞（已确诊）**：同轮多 finding 的注册。逐条 `appendFinding` 每条触发一次 invalidation——同轮第二条 finding 的锚定 revision 已被第一条置 STALE 而被拒。**生产正解 = scan ledger 批量注册**：`appendCapabilityExecutionWithFindings(event, registration)`——一个 scan 终态事件携带含 N 个 draft 的 registration，finding 共享 ledger 证据 blob、id 由 store 序算（`loopFindingId`）、invalidation 在全部行插入后统一应用一次（loop-run-store.ts:2476-2510）。
- **下一beat 改包**（多轮波最后一步）：① 驱动器把每轮 finding 装进该轮 scan 的 `loop-capability-findings:v1` ledger，scan 终态改走批量 API；② 手动面对齐：finding 的 evidence 改该轮 ledger 引用（手动 publisher 的 finding-register 用同一 ref）；③ 验证 takeover 对 N finding 的 id/身份映射（双边 findingIndex 深比较见分晓）；④ 回归后注册 `coreMultiRoundScenarios()`。
- 对齐机制备忘：takeover 投影器把手动声明 finding_id 映射进投影结果（实测双边 findingIndex id 一致），单 finding 已证；N finding 的映射按序还是按身份待验证。

剩余家族（S-INIT 8 / S-MANIFEST 2 / S-CRASH 6 / 超限暂停 4 行为层 only）与行为层 full-chain 驱动器按事实快照的计划推进。
