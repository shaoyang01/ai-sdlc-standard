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

## 2026-09-22 晚：M2 第 1 步完成——行为层全家族扩展 47/47（家用机会话）

- 行为层矩阵从 S-CORE 首轮 12 扩到**全 47 场景合并判定**（多轮 3 / review 返工 3 / review→re-gate 3 / 需求级回流 2 / feedback re-gate 2 / 升档×FAIL 2 / 升档 4 / S-MANIFEST 2 / S-CRASH 6 / S-INIT 8），`47 passed / 0 failed`；产物层 47/0、负向 28/0、tsc 0、全量 1767/0（170 文件）无回归。改动面仅 tests/（runner + behavior-face + behavior-comparator），**生产代码零改动**。
- 实测路径：纯注册先跑出缺口图（27 绿/20 红，红面与静态预测逐条吻合）→ 机制扩展 → 45/47 → F 族接线 47/47。
- 驱动器机制（behavior-face.ts）：① **信封 finding 下放**——非 gate 节点（code-review）完成带 finding 时信封携带（B/C/E 唯一注册通道）；D 的 REQUIREMENT finding 走 **verdict 信封**（scan 注册不带 §5.4 边、无法触发 intake 回流；verdict 注册带边）② **派生闭合只能在 invocation 间**——store 明禁活动执行期 finding 转换（"finding transitions cannot advance while a capability execution is active"，adapter 内闭合实测 illegal：scan attempt 失败→受控重试→轨迹污染，已弃）；闭合规则=「声明绑定 revision 当前 ACTIVE 即闭合」，证据=materialize 该 revision 的终态事件自身 output（M1 的确认轮 verdict 即其特例）③ **有界 invocation**（maxDispatches=1，纯安全边界、不落持久 block）覆盖三类波：多轮/G（闭合须落轮间——下一轮 verdict 合成 reflow 会 stale 绑定 revision）、D/E（requirement 级回流跨边界才重导 origin 规范源）、F（WP-1 记录注入点）；其余波整 invocation 跑到底、staged 停点闭合（M1 原路径不变）④ 未映射合成 reflow 行（D 波多出的 SOLUTION 行）按其 earliest 节点当前 revision 闭合 ⑤ F 族：触发终态 settle 后于 invocation 间落 WP-1 FEEDBACK_DRIVEN_CHANGE 记录，生产 recovery 自行推导二代整链重建；staged 循环退出条件=「无推进（无闭合/无 feedback）且无 live next」。
- 比较器（behavior-comparator.ts）：earliest-reroute 期望目标在 opensFeedbackChange 时含 requirement-intake（feedback 整链重建是代际重启、非 finding 回流）。
- runner 两处修正：catchUpRegime 传参（reconcile/crash 的 D-7/D-17 豁免——行为层 runner 原本漏传，注册前必修）；S-MANIFEST-corrupt 的 expectStop 处理（fail-closed 单级判别按冻结规格，行为层只做轨迹回放、输出单列）。
- 新实证生产语义（评审必含，接七条之后的第 8/9/10 条）：⑧ **活动执行期禁止 finding 转换**——finding 闭合的合法窗口只在 invocation 之间；⑨ **invocation 内回流到 requirement-intake 无法重导 origin 规范源**（loop-capability-entry.ts point 0 检查 + 每迭代输入采用只认前驱输出、point 0 无前驱），只有跨 invocation 边界的 deriveDispatchCommand 推导——requirement 级回流必须跨 run 边界；⑩ **FAIL/ESCALATED verdict 合成 SOLUTION reflow 行**（带边、立即失效当前 design），agent 声明的非 SOLUTION 行不抑制合成（D 波因此多一行，harness 显式闭合）。
- 剩余（每步先请 Current User 确认）：第 2 步超限暂停 4（FAIL×LIGHT/STANDARD/DEEP + BU×STANDARD，行为层 only，runner 单列不计产物层通过数）→ 第 3 步账目对账 + 验收报告骨架 docs/reports/g6-d09004-parity-acceptance-report.md（规格 §7）→ 第 4 步单 PR（base feature/loop-runtime-v1）+ R1 自证 + 独立复审（范围含 D-7/D-17 + 七条 + ⑧⑨⑩ + 账目对账）。

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
