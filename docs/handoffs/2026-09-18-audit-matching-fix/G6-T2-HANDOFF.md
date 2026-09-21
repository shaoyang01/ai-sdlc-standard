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
## 2026-09-21 晚 M2 进展（家用机会话）

分支 `feat/g6-t2-m2-scenarios`（未上主线）。**矩阵 16/16 绿**：S-CORE 首轮 12 + **升档波 4**（LIGHT→STANDARD、STANDARD→DEEP × PASS/PWR 终裁）——升档波按 d087 形状落实并双方言协议实证：ESCALATED verdict 携带**新** required_depth（publisher 同发布更新 = 投影器 foldDepth，代码级互证），reflow 由 §5.4 finding 授权（FAIL/ESCALATED verdict 欠链 reflow 事实，store `registerReflowFinding` 可合成，harness 显式注册）。

**多轮波（FAIL→FAIL→PASS）待定案，两个协议约束已实证**：
1. 单 finding 只授权**一次** restart 跳转——同一 OPEN finding 下的第二次反向跳转被链校验器拒（regate 上下文按 journal 事实推导授权）；
2. 一个 revision 只容**一条** closure 行——两个 finding 闭合于同一最终 gate revision = duplicate-closures `MANIFEST_CORRUPT_STOP`。

两个候选模型（下一beat 定）：
(a) 每波 finding + **各异闭合 revision**（F01 绑最终 gate revision、F02 绑解决其轮的 design revision）——需两侧驱动器支持 per-finding 闭合 revision 指定（runtime settle 现硬绑最新 gate revision）；`gateRound` 机械已落地为地基（`fb2ee1a`）；
(b) 两个 PASS 终止波（FAIL→PASS，变更触发 FAIL→PASS）——各 finding 闭合于各自波的 gate revision 无重复，但第二波的下游失效（design 变更令 task-planning 等 stale）需建模。

剩余家族（S-INIT 8 / S-MANIFEST 2 / S-CRASH 6 / 超限暂停 4 行为层 only）与行为层 full-chain 驱动器按事实快照的计划推进。
