# C03-LOOP-GW 验收台账（spruce_logistics_gateway 真实仓材料）

> 链路 ID：`C03-LOOP-GW`。本台账是该链实施事实唯一权威；恢复上下文 = 本台账 + CP
> `condition_ref`。append-only，回填只追加不改写。

## 0. 链路定位与裁决

- **背景**：C03-E E5 全波次（G 系列 + S3/S1/S2/T1）已门 6 闭环（HEAD 基线
  `2cb46a0`）；E5-L3（真实自主 fixture run）冻结中，其输入项（真实需求 vs 合成
  fixture）未决。Current User 2026-08-31 提供替代验收材料：本机真实业务仓
  `spruce_logistics_gateway` 的只读审查缺陷清单，选定其中适合离线验收的条目作为
  LOOP 验收测试材料，并指定三级验收节奏。
- **授权**：Decision-076（`docs/decisions/Decision-076-c03-loop-gateway-material-and-rhythm-authorized.md`）。
  冒烟级范围由 Current User 2026-08-31 明确勾选（「先来冒烟级的，就在当前分支上搞，
  不要切换其他分支」+「在开始验收之前先做一下项目治理」）。
- **与 E5-L3 的关系**：本链是 E5-L3 验收材料与节奏的落地化（真实仓缺陷修复代替
  待定需求输入）；E5-L3 正式收口条件（真实 CLI run 证据面）是否由本链替代/部分
  替代，**留待 Current User 后续裁决，本台账不预写结论**。

## 1. 材料登记

- **被验仓**：`/Users/eric_shaoooo/meicai/projects/spruce_logistics_gateway`
  （远程 `shaoyang01` 组织内私有仓，Java 21 / Spring Boot 3.3.2 / WebFlux，221 Java 文件）。
- **工作分支**：`feature/dev_20260831_loop_test`（Current User 拉取，基线 master，
  起点 HEAD=`cc06c605`）。**约定：全程不切换分支。**
- **只读审查报告**：`docs/reports/c03-loop-gateway-readonly-review.md`
  （三路只读探查 + P0 逐条人工复核；P0×4 实锤：明文凭据 / endsWith+query string
  绕过 6 filter / SALT header 覆盖服务端盐 / 配置三写无事务；另 P1×15、P2×10、
  测试真空、37 份逐字节拷贝 job）。

## 2. 验收节奏（Decision-076 固化）

| 级 | 内容 | 能力类 | 状态 |
|----|------|--------|------|
| W-GW-FIX（前置波） | REAL_GATEWAY_NO_INPUT 接线缺口修复 + run()+real 最小回归 + 冒烟重跑 | runtime 仓 | 修复+回归完成（`69f72cd`）；重跑已执行并真实推进至 gate 后合法停等（PASS_WITH_RISK，待 Current User 决策卡裁决） |
| W-GW-DIAG（问题修复波 1） | P-E 最小释放门（--release + 审计证据 + 合法矩阵）+ P-A 后进程证据包装 + P-I journal_path | runtime 仓 | **IMPLEMENTED**（Decision-079 波 1，`a6e1ece`；新增 33 checks） |
| W-GW-PREP（问题修复波 2） | P-B C1：ProductionRunDeps 可选 prepareWorkspace，内核 prepare→inspect | runtime 仓 | **IMPLEMENTED**（Decision-079 波 2，`31c63eb`；新增 7 checks 含真实 git 仓 e2e） |
| ① 冒烟 | MD5Util `System.exit(-1)`→抛异常+离线单测；`GatewayDubboSyncInvoker:36` logger 类名笔误；`GatewayInvokeServiceImpl.invokeTest` 死代码整段删除（含接口声明） | 非实现类 | run4 推进至 gate 后停等：正式裁决 **FAIL**（ADV-004/005，需方案返工重进门禁），待 Current User 决策卡 |
| ② 主测 | P0-2：6 filter `endsWith(getURI())` query-string 绕过修复 + 单测（`?x=.js` 不再放行） | 实现类 | PENDING 放行 |
| ③ 批量 | NPE 判空（`GatewayConfigCacheServiceImpl:161`）+ 缓存字段 volatile + Dict 空列表守卫 | 非实现类 | PENDING 放行 |

**排除项（不入验收，理由见 Decision-076）**：P0-1 明文密码（运维/轮换）；P0-3
SALT/CORS/盐迁 ACM（安全语义取舍，验收口径定不清）；P0-4 @Transactional（多数据源
运行时验证缺基建）；37 份拷贝收敛（无测试网中型重构）。

**验证口径**：`mvn compile` 全绿 + 新增离线单测绿 + 目标行为断言。每级完成后交付
汇报并停等 Current User 放行下一级。

## 3. 波次账

### W-GW-FIX（runtime 接线缺口修复，2026-09-01 授权）

- **授权**：Decision-078（Current User 2026-09-01 范围裁决：入口触发层设计认可
  + D1 授权 + D3-deterministic 立项；**D2 生产门 real 通道继续挂账**）。
- **范围**：`REAL_GATEWAY_NO_INPUT` 缺口修复——方向二选一（`run()` 派发把
  requirement 文本带给 real gateway，或 `extractInputText` 支持
  `inputArtifactRef` 解析），实施时按证据定，不夹带；最小回归测试补
  run()+real 端到端盲区（至少到达 CLI spawn、不再死在 staging 前，
  Decision-077 §决策.3）。
- **完成口径**：修复合入 + 回归绿 + **W-GW-SMOKE 冒烟重跑**
  （`scripts/loop-gw-smoke-real.ts`）出真实结果并回填 §3；重跑 PASS → ② 主测
  提请 Current User 放行（逐级停等不变）。
- **边界**：不解除 D2（`runProduction` real 门）；不动 E5-L3 冻结；spruce 零
  写入。
- **状态**：AUTHORIZED，待开工。

#### W-GW-FIX 实施与冒烟重跑回填（2026-09-01，事实记录）

**修复实施**（commit `69f72cd`）：方向按证据定为 **`extractInputText` 支持
`inputArtifactRef` 解析**——resolver（`artifactText`）由唯一装配点
`createCapabilityGateway` 用其自持的 artifactStore 注入（execution/
real-capability-gateway.ts、execution/capability-gateway-source.ts）；自由文本
键保持优先（canary/测试的手工请求零改动）；无 resolver/解析为空仍 fail-closed。
最小回归 `tests/loop-gw-fix-run-real-reaches-spawn.test.ts` 12 checks：run()+real
端到端到达 adapter（spawn 点）且 staged 内容=需求原文、越过 intake、fail-closed
负向 3 例。tsc clean；全量测试基线 23 个失败文件 → 修复后 22（无新增失败；
该 22 个全部系 `93f4a5c` 冒烟脚本的 SDLC_HERMES_* 环境标记触发 hermes
phase-2 guardrail 套件的**既有失败**，根因抽样三件确认一致，本波不夹带处理）。

**harness 修正**（commit `3b0b874`）：冒烟脚本 TARGET_REPO 由 kimi 会话主机的
`/Users/eric/...` 修正为本机 `/Users/eric_shaoooo/...`。环境：默认 node 切至
v24.12.0（Current User 指示；nvm alias + `.zshrc` PATH 前置）；codex 使用
nvm node24 下既有可用安装 codex-cli 0.150.1（`~/.local/bin/codex` 缺平台依赖，
未重装）。

**重跑 run3**（runId `run-REQ-LOOP-GW-mtic6mh6-1788247153486`，fixture
`/private/var/folders/1c/…/loop-gw-smoke-WxQix2`，临时目录易失，本块引述的
digest/文本为持久记录）：
- `requirement-intake/primary : kimi : started → succeeded`（324s，exit 0）
  ——**旧 4ms 死点确认消除，W-GW-FIX 在真实链生效**；
- `solution-design/primary : kimi : attempt 1 started → failed
  （EXECUTOR_EXCEPTION，无进程证据，~408s）`。根因（kimi 会话日志实证）：
  kimi 正常完成 turn（8 次 LLM 调用，并将技术方案写入 spruce
  `library/REQ-LOOP-GW-mtic6mh6/01-技术方案/`），但 stdout 未带可解析 E3
  信封——**后进程输出不合格类失败在 gateway 的 adapter try/catch 之外抛出，
  被抹成无证据 EXECUTOR_EXCEPTION**（发现问题清单 P-A）；
- resume（同一 fixture，attempt 2）：design succeeded（365s）→ gate
  adversarial_scan codex succeeded（177s）→ formal_verdict hermes succeeded
  （231s）→ **`gate_result = PASS_WITH_RISK`**，unresolved findings：
  ADV-001 [LOW]（原 HIGH 判定经代码核实不成立）、ADV-002 [MEDIUM]（删
  `GatewayInvokeService.invokeTest` 公开接口方法属二进制不兼容变更，webflux
  配内部 Nexus 发布）、ADV-003 [MEDIUM]（实施计划验证列缺确定性静态 oracle，
  compile 查不出三类残留）。按合同 PASS_WITH_RISK 须风险接受记录、未决
  findings 阻塞推进 → **链于 gate 后合法停等（BLOCKED，无 next point）**，
  等待 Current User 决策卡裁决（放行/返工/收口）。三项 spruce 缺陷修复未产出
  （implementation 未到达）。

**同波 D3-deterministic 交付**（Decision-078 §决策.3，事实记录）：intake
manifest 封闭 schema + 校验（18 checks，`d3ea311`）；`loop-run
--from-intake/--prepare-only`（CLI 解析 expectedBaseSha + 冻结请求落盘审计，
19 checks 含真实临时 git 仓）；agent 触发协议文档（`d1f53b0`；step 4 决策卡
硬义务 `0fa3cf8`）；deterministic 端到端演练 COMPLETED（七节点 16 事件全部
started→succeeded，Q1 槽位映射正确）。

### 发现问题清单（冒烟重跑 2026-09-01，处置已裁决 → Decision-079）

| # | 问题 | 证据锚点 | 定性 | 处置（Decision-079） |
|---|------|----------|------|----------------------|
| P-A | 后进程输出不合格丢失全部进程证据（信封解析在 adapter try/catch 之外） | design attempt 1（~408s，journal 全空） | runtime 诊断性缺口 | **波 1 W-GW-DIAG**：证据包装延伸到后进程段，真实错误码保留 |
| P-B | 生产门 fresh-prepare 缺口：inspect 只认已存在 exact-ok 工作树，无人调 prepare；工作树路径含运行时 runId 摘要无法预建 | deterministic 演练（E1 生产测试全为注入 stub 故未暴露） | 生产门硬阻断 | **波 2 W-GW-PREP**：C1（ProductionRunDeps 可选 prepareWorkspace，内核 prepare→inspect），独立小波 |
| P-C | delivery-tail 物化器缺失：stable_path 仅元数据，canonical 产物不落目标仓；链尾仅产 checklist | 02-方案审核只在 artifact store；spruce 内 00/01 系 kimi 自写 | 交付形态缺口 | 方向认可（链尾单点物化 + canonical 覆盖 + 漂移报告）；**时机缓**，随交付尾波立项 |
| P-D | agent 自写文件与 canonical revision 无一致性校验 | 同上（00/01 仓内文件 vs 信封正文可漂移） | 一致性缺口 | 并入 P-C（漂移报告即校验产出），同缓 |
| P-E | BLOCKED 无主动询问：无通知通道、无决策卡渲染、CLI 无 `--release RISK_ACCEPTED/SCOPE_RESET` 面（释放语义仅在 journal 层） | gate 后停等仅可经查日志发现 | 人机交互缺口 | **波 1 W-GW-DIAG**：方案 1 最小释放门（closed 旗标 + 释放事件含审计 + 合法矩阵）；通知钩子/渲染另立，agent 义务已由协议 step 4 承载 |
| P-F | E3 信封输出合规为概率行为（design 尝试 1/2 不合规） | attempt 1 失败/attempt 2 成功 | 观察，retry 已按设计吸收 | 观察不立项；P-A 落地后积累证据再议 |
| P-G | 冒烟脚本 TARGET_REPO 硬编码他机路径 | 已修（`3b0b874`） | harness，已闭环 | 已闭环 |
| P-H | 默认 node 22 遮蔽 + `~/.local/bin/codex` 损坏 | 已按 Current User 指示切 node 24；codex 用 nvm 下可用安装 | 环境，已闭环 | 已闭环 |
| P-I | 注入 stores 时 RuntimeResult.journal_path=null（上次遗留） | run3 summary `journalPath: null` | 观测瑕疵，未修 | **波 1 W-GW-DIAG** 顺手修（回填 databaseFilePath） |

冒烟本链去向：**run3 停驻不收口**；波 1、波 2 落地验证后**重发全新冒烟 run**
（预期 gate 停等 → 决策卡 → 经新释放门放行 → 全链首次端到端）。处置与波次
授权见 Decision-079；本清单不另行预写结论。

### W-GW-DIAG / W-GW-PREP 实施回填（2026-09-01，Decision-079 波 1、波 2）

**波 1 W-GW-DIAG**（commit `a6e1ece`）：
- P-E 最小释放门：`loop-run --resume <runId> --release
  <RISK_ACCEPTED|SCOPE_RESET> --release-by <who> --release-note <text>`（closed
  旗标增量）；合法矩阵 fail-closed——journal blocked 且
  `REGATE_ROUND_BUDGET_EXHAUSTED` → 两种码走 store 既有 release 事件；gate
  `PASS_WITH_RISK` 停等 → 仅 RISK_ACCEPTED，把每条 OPEN blocking finding 经
  `acceptFindingRisk` 绑定到 verdict 的 decisionScopeId，并落
  `human_action_required` 证据 artifact（who+note+findingIds，哈希校验）；
  CRITICAL 拒绝、SCOPE_RESET 在 gate 停等拒绝（返工走 Re-Gate 机制）、其余状态
  一律 NOT_RELEASABLE；测试 21 checks（argv 6 + 矩阵/审计 15）；
- P-A：executePrimary 的后进程段（空最终文本 / E3 信封解析 / 产物构造）统一
  以 `CapabilityProcessEvidenceError` 携带 adapter 已有 processEvidence 重抛，
  并经 tracing 层落真实 cause code（`REAL_GATEWAY_BAD_ADAPTER_RESULT` /
  `REAL_GATEWAY_ENVELOPE_INVALID`，additive：无码时维持 EXECUTOR_EXCEPTION /
  EXECUTOR_TIMEOUT 原映射）；测试 12 checks；
- P-I：注入 stores 时 `RuntimeResult.journal_path` 回填
  `runStore.databaseFilePath`。

**波 2 W-GW-PREP**（commit `31c63eb`）：`ProductionRunDeps` 增可选
`prepareWorkspace`（C1）——提供时内核先 prepare 后 inspect（缺省保持只读，
注入 stub 的既有测试零变化；无 inspect 而单独给 prepare → fail-closed）；
loop-run 接线真 manager 的 prepare，loop-run 头注释的 W3 只读边界随本裁决
改写（worktree 创建=本地 git 操作，人工 Git 边界不变）。测试 7 checks：真实
git 仓上无钩子 fresh run 仍 `WORKSPACE_NOT_FOUND`（钉住缺口）、有钩子 fresh
生产运行全链 deterministic COMPLETED、二次 inspect 稳定无漂移。

两波 tsc clean；全量 155 测试文件 22 个失败均为既有 hermes-guardrail 项
（P-G 同源），无新增失败。

### run4 重发冒烟回填（2026-09-01，修复波落地后全新 run）

**runId** `run-REQ-LOOP-GW-mtijjrbl-1788259523604`（fixture
`…/loop-gw-smoke-NCpMNL`，易失目录；关键事实引述如下）：
- 首段：intake kimi 174s ✓ → design kimi 479s ✓（一次过）→ gate scan codex
  135s ✓ → **formal_verdict attempt 1 failed `REAL_GATEWAY_ENVELOPE_INVALID`**
  （hermes 53s，exit 0，输出未过信封校验）——**P-A 修复直接生效**：失败原因与
  进程证据（exit/duration）首次无需考古即可从 journal 读出；链 READY 可续跑；
- resume（attempt 2）：formal_verdict succeeded，**`gate_result = FAIL`**
  （decisionDepth=STANDARD，scope 绑定，exit 0）→ 链于 gate 后合法停等
  （BLOCKED，无 next point）。scan 本轮未产出 findings（空 ledger），FAIL 纯
  粹来自裁决文本；
- **裁决内容（hermes，实证级）**：ADV-004 [HIGH]——方案声称「null byte[] 继
  续抛 IllegalArgumentException + 零行为变化 + 测试全绿」三者矛盾，hermes 在
  OpenJDK 21.0.4 实测 `MessageDigest.getInstance("MD5").update((byte[])null)`
  实抛 **NullPointerException**，要求修订契约表述或显式声明行为变更；
  ADV-005 [MEDIUM]——`mvn -pl … -am` 不构建下游模块，方案 §4/§6 的确定性断
  言无法闭环消费者边界，要求全仓 test-compile / `-amd` / 依赖图证明三选一；
  裁决明确「不允许携带风险放行」，退出条件四条写入裁决正文；
- P-I 补全（5 处 journal_path 全部回填）在 run4 期间落账，run4 日志仍为 null
  属时序正常；
- 停驻点：FAIL ≠ 可释放状态（释放门仅适用于 PWR/预算阻塞，矩阵 fail-closed
  拒绝），出路为方案返工重进门禁（Re-Gate 语义），待 Current User 决策卡。

**观察**：两次冒烟（run3/run4）+ resume 共 9 次真实节点派发，P-F（信封合规
概率）累计 2 次不合规 / 9 次；P-A 落地后每次均有完整证据。门禁连续两轮产出
实质对抗结论（run3 PWR、run4 FAIL），LOOP 验收链的核心价值得到真实验证。

### 返工轮回填（2026-09-02，run4 续作）

- **返工 finding 登记**：`:finding:1`（OPEN，HIGH，source=solution-design:1
  revision——run4 真实链的 verdict 未物化 revision（real gateway 不回
  terminal event id，P-J 附注），故 source 绑定被返工的 design
  revision；evidence=`human_action_required` blob 载返工令与 ADV-004/005 修
  订要求，绑定 verdict scope decision:2）。登记即触发 invalidation：design
  current → STALE（失效语义正确）。
- **首轮 resume 尝试失败（harness 环境）**：hermes 夜间自动更新窗口内探测
  瞬时失败（`no runnable hermes on PATH`），重跑即过——非链路问题。
- **返工轮全链**：design attempt 2 succeeded（rev 2.0.0，按 ADV-004/005 修
  订要求重写）→ scan attempt 2/3 ✓ → verdict attempt 3 succeeded →
  **`gate_result = PASS_WITH_RISK`（decision:3，depth STANDARD，无
  CRITICAL/HIGH/MEDIUM）**。裁决逐条复核 ADV-001/002/004/005 闭环；新接受风
  险两项 LOW：ADV-006（MD5 固定 oracle 未冻结，关闭条件=任务规划冻结期望值）、
  ADV-007（扫描命令未排除 target/回归口径，关闭条件=干净编译闭环）。裁决采
  纳 scan 建议将深度档位降为 LIGHT（正文），envelope 字段仍记 STANDARD——
  记 P-F 观察一次。
- **停驻点**：PWR-DECIDED 需要一条 `ACCEPTED_RISK` finding 绑定 decision:3；
  本轮 scan ledger 含 ADV-006/007 但 runtime 未将其物化为 finding 行（仅
  ledger artifact），故待 Current User 对「接受两项 LOW 风险进入实现」裁决
  后，经 `acceptFindingRisk(:finding:1, scope=decision:3, evidence=verdict)`
  一次动作同时完成返工单关闭与 PWR 证明。②级实质内容（三项缺陷的实现）随后
  在 task-planning → implementation 展开。
- **接受执行与 P-K 实施现状（2026-09-02）**：Current User 选择接受
  ADV-006/007；`acceptFindingRisk` 已执行（finding → ACCEPTED_RISK 绑
  decision:3，证据 `7db299c6…`），recovery `gateDecision = DECIDED`。P-K 修复
  已实施三处准入（recovery 线性走查 / deriveDispatchCommand / capability
  entry，commits `040a1f9`+`88db2fd`）。**但 resume 仍止步于第四道门**：链校
  验器的 Round 2 H1 规则——「resolved 或 risk-accepted findings 永不授权新写
  入」——把 PWR verdict 之后的 canonical forward（task-planning started）判为
  未授权跳转。**设计级矛盾**：PWR-DECIDED 三条件说"验收后可进 task-planning"，
  H1 说"risk-accepted 不授权写入"，二者合成 = PWR 波次验收后必然死锁。
  runtime 代码未再动（chain validator 是刻意的反伪造规则，不由本波擅自修
  改）；run4 journal 无半成品写入，安全停驻。**待 Current User 设计级裁决**：
  ① 修订 H1——同 scope ACCEPTED_RISK 证明允许 PWR verdict 之后的一次
  canonical forward（chain validator 增设该准入 + 测试）；② 或引入新机制
  （验收后 runtime 签发授权标记事件）；③ 或收口。台账本条即权威记录。

**Current User 裁决（2026-09-01）：返工**。执行口径：将裁决正文的修订要求
（ADV-004/005）登记为绑定 verdict scope 的 OPEN finding（source=solution-gate
verdict revision，earliestAffected=solution-design），走 runtime 既有的
finding 驱动 Re-Gate 回流——solution-design 重做方案后重进门禁。
**新发现 P-J（记账）**：无结构化 findings 的 FAIL 裁决在 recovery 中无回流
路由（nextExecutionPoint=null，普通 resume 不派发）——E3 verdict 契约未强制
FAIL 携带阻塞原因 findings，路由完全依赖 scan/verdict 的 ledger；处置待裁决
（prompt 契约强化 vs 接受层拒绝无 findings 的 FAIL vs 人工触发入口），本波
以「治理侧按裁决登记 finding」的最小合法方式执行返工，不改 runtime。
**执行状态（2026-09-02 更新）：返工 finding 已登记（`:finding:1` OPEN HIGH，
source=solution-design:1，evidence=human_action_required blob 绑 decision:2）
→ design attempt 2 重做 → 重扫描 → 重裁决 PWR（decision:3）。Current User
选择「接受 ADV-006/007 放行进实现」，`acceptFindingRisk` 已执行（finding →
ACCEPTED_RISK 绑 decision:3，证据 `7db299c6…`）。发现 **P-K**：recovery 线性
推进信任 verdict 事件不可变 `nextStepEligibility=BLOCKED`，验收不参与推导，
gateDecision=DECIDED 而 next=null → 授权最小修复（Decision-080），修复后
resume 进 task-planning → implementation。
治理收口（2026-09-01 晚）：本块 + P-J + 跨机指南 commit `dc5dbf7`；Exchange
issue #96（REQ-20260901T113309Z-RUN4-PARKED-REWORK-DEFERRED）PUBLISHED，run
`106845b` / pointer `91ddeb2` / handoff sha256 `6739dbeb…ff8c`；PKB 派生归档
commit `d2d83cc`（handoff 2026-09-01-run4-parked-rework-deferred + current.md
指针刷新至 dc5dbf7）；CP PR #38 合 main（`47a65f8`，validator PASS v2：
route_state=`C03_LOOP_GW_SMOKE_REWORK_PENDING`、active_work=
`C03-LOOP-GW-SMOKE-REWORK` PAUSED（pause 带 resume_authority）、live 授权
+GW_SMOKE_REWORK_EXECUTION 且 DIAG/PREP 两授权消费移出、product_commit=
`dc5dbf7`、next_transition=REWORK_EXECUTION_NEXT_SESSION）。
续作入口（本机）：① finding 登记/续跑脚本要点已验证——finding 形态
（source=solution-gate :1 revision、category=SOLUTION、earliestAffected=
solution-design、evidence=human_action_required blob）在
`tests/loop-run-release.test.ts` 的 store 级 fixture 中等价验证过 append 路径；
② fixture 已持久化：`~/loop-gw-fixtures/run4/`（journal.db + control，
2026-09-01 自 /tmp 抢救，268K）；③ 续作 = 登记 finding → `run()` resume
（requirementId `REQ-LOOP-GW-mtijjrbl`）→ solution-design attempt 2 重做方案
→ 重进门禁。若 fixture 丢失（跨机），fallback = 重新发起全新冒烟（run5），
返工裁决并入新 run 的预期流程。

### W-GW-SMOKE（冒烟级，2026-08-31 立项即实施）

- **范围**：上述 ① 三项，范围严格限定，不夹带其他缺陷。
- **执行环境**：本机会话 agent（Current User 在场）；LOOP-runtime 真实 CLI run
  不在本波范围。
- **状态**：FAIL-CLOSED——真实 run 在 requirement-intake/primary 即刹车，三项
  缺陷修复未产出；根因为 runtime 仓真实接线缺口，修复待 Current User 裁决。
- **回填**：见下方 2026-09-01 回填块（证据、根因、审计、停驻点）。

#### W-GW-SMOKE 回填（2026-09-01，冒烟真实 run 结果）

**口径变更（Current User 裁决，本块如实记录）**：冒烟定位改为「测试 LOOP
runtime 本体」——三项 spruce 缺陷是喂给 LOOP 的需求输入，由 LOOP 自主解决，
会话 agent 不得手改代码；真实 CLI run 经 Current User 显式放行（原登记
「执行者=本会话 agent；真实 CLI run 不在本波范围」按当时口径保留不改写，以本
块为准）。执行方式：Current User 将本会话产出的冒烟 brief 交 kimi 会话执行，
kimi 只负责装配入口脚本、执行、验收、报告，不亲手改 Java 代码。

**冒烟脚本**：`scripts/loop-gw-smoke-real.ts`（新增未跟踪文件，入库与否待
裁决）。按旧脚本 `codex-runtime-real-smoke.ts` 的 Q1 STALE 头注重写为三 agent
形态：`LoopPosixProcessRunner`（kimi/codex/hermes 经 which -a + --version 解析）
+ `RealCapabilityAdapter` + `run(requirement, { capabilitySource: "real",
realGatewayDeps: { adapter, attemptWorkspace } })`；六个 SDLC_* 环境确认变量由
脚本自检并设置；`tsc --noEmit` 全绿。旧脚本未改动。

**执行记录**：
- run1：立即失败——better-sqlite3 为 Node 24（NODE_MODULE_VERSION 137）编译，
  默认 node v22.23.0 ABI 不符；切 `~/.nvm/versions/node/v24.12.0` 后重跑。
  环境问题，非链路问题。
- run2（正式）：runId `run-REQ-LOOP-GW-mthexwux-1788191319709`，退出码 2
  （fail-closed）。trace 断点：`requirement-intake/primary : kimi : started →
  failed (EXECUTOR_EXCEPTION, 4ms, 无进程证据)`；其余六节点未到达；
  `final_status=failed`，`chain_status=READY`，next_execution_point=
  `requirement-intake/primary`。journal：
  `/private/var/folders/kr/ghjtf54n2_9d091718xznyw00000gn/T/loop-gw-smoke-9FYbkw/journal.db`
  （注入 stores 时 `journal_path` 返回 null，实际路径为 fixtureRoot/journal.db
  ——观测小瑕疵，不阻塞；诊断探针在同 journal 追加过 seq 3–4 attempt-2 记录，
  与正式 run seq 1–2 可区分，同因）。

**根因（kimi 直击探针实证，非推测）**：`run()` 派发时 input 仅含
`{ inputArtifactRef }`（runtime.ts:737-740），而
`RealCapabilityGateway.extractInputText` 只认 inputText/text/prompt/requirement
自由文本键（real-capability-gateway.ts:68-77）→ 预进程阶段抛
`REAL_GATEWAY_NO_INPUT`，tracing 层按设计把消息抹成 EXECUTOR_EXCEPTION 落账。
E5-L2 canary 走手工构造 entry 请求（自带文本）故从未暴露；`run()` + real 端到
端在 HEAD `9d84f30` 上系首次真实驱动，缺口即在此处暴露。**结论：E5 验收未覆
盖 run()+real 生产端到端路径，本冒烟首次驱动即补上该盲区。**

**冒烟判定**：合法冒烟证据，fail-closed 刹车性能通过——无假 PASS、退出码干净、
无半成品污染。三项缺陷修复未产出，主链推进被阻断。

**改动审计**：spruce 仓 `git diff --stat` 为空、status 干净（失败点在 prompt
staging 之前，无 prompt-input 残留）；runtime 仓仅新增未跟踪
`scripts/loop-gw-smoke-real.ts`。无任何 commit/push。

**编译与单测**：无可验代码改动。基线 `mvn -o -q compile` 全绿（exit 0）；新增
JUnit5 单测不存在，无从运行。

**超时张力销项**：brief 中「120s/次」旋钮属已退役的 codexRealDispatchConfig
路径；HEAD 上 Q1 adapter 超时由 profile 权威决定（E5-T1，2026-08-31：非实现类
45min、实现类 60min，runner 上限 3600000ms）——E5 复审遗留的 timeout 张力在上
游已重定标，本台账不再挂该项。本次运行未到达任何 CLI spawn，无超时现象。

**停驻点**：接线缺口修复（`run()` 与 `RealCapabilityGateway` 的 input 接线，
属 runtime 仓改动 + 最小回归测试）超出本波授权，待 Current User 裁决是否立项
修复；修复前冒烟无法推进。

## 4. 跨机续作指南（回家机）

1. 拉取四仓：产品仓 `shaoyang01/ai-sdlc-standard`（fact branch
   `feature/c03-e5-autonomous-acceptance`，本台账所在）；CP `main`；PKB
   `feature/knowledge-base-v1`；Exchange `main`（只读——恢复上下文读最新
   handoff，即 issue #96 的 `…-run4-parked-rework-deferred/handoff.md`，与
   PKB handoff 逐字节一致；Exchange 单写者归 Publisher，会话不得直写）。
2. 被验仓本机路径 `/Users/eric_shaoooo/meicai/projects/spruce_logistics_gateway`，
   分支 `feature/dev_20260831_loop_test`（远程已存在，直接 checkout）。
3. 构建：Java 21（Zulu）+ Maven 3.9.3 已验证可用；冒烟验证命令 =
   `mvn -q compile` + `mvn -q test -pl business-gateway-utils -Dtest=GatewayMD5UtilTest`。
   Node：默认 v24.12.0（2026-09-01 起 nvm default，冒烟脚本依赖 better-sqlite3
   的 Node 24 ABI）。
4. **run4 续作（2026-09-01 停驻点）**：fixture 持久副本
   `~/loop-gw-fixtures/run4/`（journal.db + control，仅存在于本机家目录）。
   本机续作 = 按 §3 run4 块「续作入口」登记返工 finding 后 resume。**跨机**
   则 fixture 不可达 → fallback：重新发起全新冒烟（run5），返工裁决并入新 run
   预期流程（run4 以台账引述为持久证据收档）。
5. 续作入口：本台账 §3 波次账 + CP `next_transition.condition_ref`；下一级
   （②主测）放行须 Current User 显式确认。
6. **PKB 归档派生规则（2026-09-02 补）**：Exchange handoff 写入 PKB 时必须套
   PKB front matter schema（type: source / status: active / created / updated /
   tags / sources / related，模板见 8/27 `ec33af5` 修复）；body 与 Exchange
   逐字节一致。缺 front matter 会被 PKB 助手校验拒绝（本轮 5 件补齐于
   PKB `d635108`）。

## 5. 治理落档记录

- 2026-08-31：本台账创建；审查报告入库；Decision-076 落档并更新决策索引；CP
  STATE 更新（branch `docs/c03-loop-gw-smoke-state` PR 合 main，常设授权）；PKB
  `current.md` 指针更新（`feature/knowledge-base-v1`）。均为 Current User「先做
  项目治理……都记录下来」显式要求授权。
- 2026-08-31 治理回执（跨机核对用）：产品仓本链落档 commit `b8696c7`；Exchange
  issue #92（REQ-20260831T115317Z-C03-LOOP-GW-GOV）PUBLISHED，run `efc6b31` /
  pointer `771150a` / handoff sha256 `05a73a88…10aa`；PKB 派生归档 commit
  `b66145a`（feature/knowledge-base-v1，handoff + current.md）；CP PR #34 合
  main（route_state=`C03_LOOP_GW_ACCEPTANCE_IN_PROGRESS`，active_work=
  `C03-LOOP-GW-SMOKE` RUNNING，product_commit=`b8696c7`）。
- 2026-08-31 备注：Exchange 首次请求因 REQUEST 块尾部混入裸
  `publication_request_id=` 行被发布器拒（INVALID_REQUEST_YAML），删除该行后
  本地过 schema 预检重发成功。该行系照抄 #91 模板的冗余页脚，勿再复制。
- 2026-09-01：W-GW-SMOKE 真实 run 结果回填 §3（本 commit）；Exchange/PKB/CP
  传播与缺口修复立项均待 Current User 指示。
- 2026-09-01 治理回执（Decision-077 记录传播）：Decision-077 + 决策索引 commit
  `e48ad3f`（与 §3 回填 `0b03780` 一并 push）；Exchange issue #93
  （REQ-20260831T160944Z-C03-LOOP-GW-SMOKE-FAILCLOSED，label
  `exchange-publish`）PUBLISHED，run `5b232bf` / pointer `7e23477` / handoff
  sha256 `39a524de…b511`；PKB 派生归档 commit `0eeb366`
  （feature/knowledge-base-v1，handoff 2026-08-31-c03-loop-gw-smoke-fail-closed
  + current.md 指针）；CP PR #35 合 main（`aafc518`，validator PASS v2：
  active_work C03-LOOP-GW-SMOKE BLOCKED、open blocker
  C03_LOOP_GW_SMOKE_WIRING_GAP、C03_LOOP_GW_SMOKE 授权已消费移出 live 列表、
  product_commit=`e48ad3f`、next_transition=
  C03_LOOP_GW_SMOKE_WIRING_FIX_AUTHORIZATION_PENDING）。当前停驻：接线缺口修复
  立项待 Current User 授权，②③不推进。
- 2026-09-01 治理回执（Decision-078 记录传播）：产品仓落档 commit `a371d01`
  （Decision-078 + 决策索引 + 设计文档 Accepted 翻转 + 台账 §2/§3 W-GW-FIX 行，
  已 push）；Exchange issue #94（REQ-20260901T061716Z-DECISION-078-ENTRY-TRIGGER-D1-D3，
  label `exchange-publish`）PUBLISHED，run `38f5398` / pointer `8e379de` /
  handoff sha256 `29cd9cc4…ddee`；PKB 派生归档 commit `23521db`
  （feature/knowledge-base-v1，handoff 2026-09-01-decision-078-entry-trigger-d1-d3
  + current.md 指针刷新至 a371d01）；CP PR #36 合 main（`52ddadd`，validator
  PASS v2：route_state=`C03_LOOP_GW_FIX_IN_PROGRESS`、active_work=
  `C03-LOOP-GW-FIX` NOT_STARTED、live 授权 +GW_WIRING_FIX/+ENTRY_TRIGGER_D3_
  DETERMINISTIC 且 E5 残留条目移除、product_commit=`a371d01`、next_transition=
  C03_LOOP_GW_FIX_IMPLEMENTATION_AND_SMOKE_RERUN）。当前停驻：W-GW-FIX 待开工
  （修复方向按证据定）+ D3-deterministic 待开工；②③继续停等至冒烟重跑 PASS。
- 2026-09-01：W-GW-FIX 实施 + 冒烟重跑结果 + 发现问题清单 P-A～P-I 回填（本
  commit，仅事实无处置结论）；W-GW-FIX/D3 代码与文档 commits `69f72cd`/
  `d3ea311`/`d1f53b0`/`0fa3cf8`/`3b0b874` 已推 origin。Exchange/PKB/CP 传播与
  问题清单处置**均待 Current User 裁决后**随完整治理一次执行。当前停驻：链
  BLOCKED 于 gate 后（PASS_WITH_RISK 待风险裁决），②③不推进。
- 2026-09-01 治理回执（Decision-079 记录传播）：Decision-079 + 索引 + 台账处置
  列 commit `a958d83`（与事实回填 `0716e82` 一并 push）；Exchange issue #95
  （REQ-20260901T091609Z-DECISION-079-SMOKE-PARKED-DIAG-PREP，label
  `exchange-publish`）PUBLISHED，run `af96785` / pointer `159e2a3` / handoff
  sha256 `ebeab734…dd55`；PKB 派生归档 commit `c6071ab`
  （feature/knowledge-base-v1，handoff 2026-09-01-decision-079-smoke-parked-
  diag-prep + current.md 指针刷新至 a958d83）；CP PR #37 合 main（`3ae6e93`，
  validator PASS v2：route_state=`C03_LOOP_GW_DIAG_WAVE_IN_PROGRESS`、
  active_work=`C03-LOOP-GW-DIAG` NOT_STARTED、live 授权 +GW_DIAG_WAVE/
  +GW_PREP_WAVE 且前两条消费移出、**blocker C03_LOOP_GW_SMOKE_WIRING_GAP 关闭
  移出**、product_commit=`a958d83`、next_transition=DIAG→PREP→重发冒烟）。
  当前停驻：波 1 W-GW-DIAG 待开工（授权已生效），波 2 随后，之后重发冒烟。
- 2026-09-01/02：波 1 波 2 实施回填（`a6e1ece`/`31c63eb`）；run4 重发与返工
  轮全链回填（`72a0ddc`/`0166ca3`）；Decision-080（P-K 修复授权）`5143aa7`；
  P-K 修复实施 `040a1f9`/`88db2fd`/`95c0e08`；run4 收口裁决（Decision-081）
  `f445b2c`。
- 2026-09-02 治理回执（Decision-080/081 记录传播）：Exchange issue #97
  （Decision-080）run `5b8dd7b` / pointer `b69d188`（全 …baa4c44ef249a322
  ba3db1562）/ sha `05c23321…702b8`；issue #98（Decision-081
  REQ-20260902T055500Z-DECISION-081-RUN4-CLOSED-PK-DESIGN）PUBLISHED，run
  `9ace1d9` / pointer `a55ff55…b65a` / handoff sha256 `7672d442…ae80`；PKB
  派生归档 commit `8216a24`（feature/knowledge-base-v1，handoff
  2026-09-02-decision-081-run4-closed-pk-design，已套 front matter schema，
  另 5 件历史 handoff front matter 补齐于 `d635108`）；CP PR #40 合 main
  （`a659aa3`，validator PASS v2：route_state=
  `C03_LOOP_GW_PARKED_PENDING_PK_DESIGN`、active_work=`C03-LOOP-GW-SMOKE`
  PAUSED（P-K-d 设计裁决前置）、REWORK 授权消费、product_commit=`f445b2c`、
  next_transition=`C03_LOOP_GW_PARKED_PENDING_PK_DESIGN_RULING`）。当前停
  驻：P-K-d 设计议题待未来波次立项（候选①H1 修订/②验收授权标记），梯子
  ①②③与 D2/E5-L3 维持既定状态。
- **2026-09-02 治理回执（会话收口传播）**：Exchange issue #105
  （REQ-20260902T121500Z-SESSION-CLOSE-PK-DESIGN）PUBLISHED，run `3bab1d6` /
  pointer `c89b278` / handoff sha256 `7c56e8bd…de2`；PKB 派生归档 commit
  `f163d02`（handoff 2026-09-02-session-close-d080-d085 + current.md 指针刷
  新至 61da714）；CP STATE PR 合 main（validator PASS v2：route_state=
  `C03_LOOP_GW_SMOKE_REWORK_IN_PROGRESS`、授权 +GW_SESSION_CLOSE_D080_D085、
  product_commit=`61da714`、next_transition=P-K-d finding gate 设计矛盾解
  决→run4 续跑或 run5 重发）。**当日收工。**
- **2026-09-02 治理回执（P-L 波收口传播）**：Exchange issue #102 因 base
  drift（#101 pointer 先落）被发布器拒发，修正 base 后重发为 issue #103
  （REQ-20260902T091500Z-P-L-WAVE-COMPLETED）PUBLISHED，run `43d82bb` /
  pointer `481cf92` / handoff sha256 `6d728bf4…0060`（#102 已关闭注明替代）；
  PKB 派生归档 commit `aac759f`（handoff 2026-09-02-pl-wave-completed，front
  matter schema + current.md 指针刷新至 13eddda）；CP STATE PR 合 main
  （validator PASS v2：route_state=`C03_LOOP_GW_SMOKE_REWORK_IN_PROGRESS`、
  product_commit=`13eddda`、next_transition=P-K-d 实施完成→run4 resume）。
  P-L 波至此四仓闭环。
- **2026-09-02 治理回执（Decision-082 记录传播）**：Decision-082 + 索引 +
  台账回填 commit `b8c1c4d`；Exchange issue #99
  （REQ-20260902T063800Z-DECISION-082-PKD-PLAN-C）PUBLISHED，run `04ac15d` /
  pointer `37cc0d1` / handoff sha256 `b3a33e78…a21b8`；PKB 派生归档 commit
  `5e2033e`（handoff 2026-09-02-decision-082-pkd-plan-c，front matter schema
  + current.md 指针刷新至 b8c1c4d）；CP PR #41 合 main（`e28f04e`，validator
  PASS v2：route_state=`C03_LOOP_GW_SMOKE_REWORK_IN_PROGRESS`、active_work
  IN_PROGRESS（pause 解除）、授权 +GW_PKD_PLAN_C_IMPLEMENTATION、
  product_commit=`b8c1c4d`、next_transition=REWORK_COMPLETION）。实施随即
  开工，完成后 resume run4 至全链完成。
- **2026-09-02（续）：P-K-d 立项（Decision-082）**。Current User 讨论后选定
  方案 C 并授权：`nextStepEligibility` 字段口径定为 agent 裁判（PWR→
  ELIGIBLE，FAIL→BLOCKED，「等人验收」移至派发闸门表达）；验收闸门 scope 级
  （verdict scope 存在 ACCEPTED_RISK 行方可派发 task-planning，否则
  `RISK_ACCEPTANCE_PENDING` 停等）；ledger 行物化缓行（SOLUTION finding 会
  失效 design current 致返工死循环，随 P-C/P-D 交付尾波设计）；部件 4 再推
  导保留兼容 run4 存量 journal。H1 与 schema 不动。实施随即开工，完成后
  resume run4 至全链完成。
- **2026-09-02（续三）：Current User 裁决方案②（Decision-083）**。新增一等
  run 级事件 kind `risk_accepted`：acceptFindingRisk 同事务追加（scope 绑定
  经 finding proof 行），投影为记录型事件，链校验器经 regateContext 增派
  acceptedRiskScopes 放行 PWR verdict 后恰一次 canonical forward——H1 字面
  规则不变（closed finding 仍不授权，授权事实由新事件承载）。测试矩阵 +
  run4 续跑授权至全链完成。实施随即开工。
- **2026-09-02 治理回执（Decision-083 记录传播）**：Decision-083 + 索引 +
  台账续三 commit `9e02a54`；Exchange issue #100
  （REQ-20260902T074500Z-DECISION-083-RISK-ACCEPTED-EVENT）PUBLISHED，run
  `3895182` / pointer `35c5755`（全 …d78d7）/ handoff sha256 `b5b1b495…2e25`；
  PKB 派生归档 commit `2a16e97`（feature/knowledge-base-v1，handoff
  2026-09-02-decision-083-risk-accepted-event，front matter schema +
  current.md 指针刷新至 9e02a54）；CP PR #42 合 main（`9b43b0a`，validator
  PASS v2：route_state=`C03_LOOP_GW_SMOKE_REWORK_IN_PROGRESS`、授权
  +GW_RISK_ACCEPTED_EVENT（PLAN_C 实施授权随之覆盖）、product_commit=
  `9e02a54`、next_transition=REWORK_COMPLETION）。实施随即开工。
- **2026-09-02（续四）：新发现 P-L——sdlc-* skill 合并后节点文档模板缺口（只读核验，未改任何文件）**。Current User 审计并经本会话独立核验：
  - **已具备 canonical 模板**：solution-design（ess/specification-schema.md +
    templates/technical-specification-template.md）、code-review（ess/
    code-review-schema.md）、formal_verdict（templates/gate-result-template.md，
    artifact-flow 强制）。
  - **缺口（有内容合同、无 v2 对齐的 canonical 文档模板）**：task-planning
    （仅稳定路径 node-capability-contract 4.4 + 任务字段/artifact-flow 要求；
    旧迁移模板 sdlc-speckit-tasks/output-and-manifest.md 仍指向已废弃的
    specs/{feature}/tasks.md 目标）；implementation（仅 04-实现记录 路径 +
    证据要求）；knowledge-sync（仅必备内容要求）；solution-gate/
    adversarial_scan（仅字段合同，Finding Ledger 无文档模板；scan 只产出
    ledger 属设计内）。
  - **边界澄清**：E3 envelope 层（runtime 校验的 summary/body/gateResult/
    findings）完整且不受影响；缺口在**人读文档模板层**——即 agent 产出的
    library/ 文档的格式权威。
  - **影响**：跨 agent/跨 run 的 library/ 人读产物格式漂移（无 canonical 权
    威）；与 P-C/P-D 强相关——物化器（P-C）落盘文档时必须引用统一模板，否则
    两套格式权威并存。P-L 是 P-C/P-D 的前置设计输入。
  - **Current User 倾向（待正式立项确认）**：按统一标准一次收口四类模板
    （03-任务规划/04-实现记录/06-知识同步/adversarial_scan ledger 模板），
    不单独补 task-planning；与 P-C/P-D 交付尾波合并设计。处置立项待裁决。
- **2026-09-02（续五）：Current User 裁决紧急立项（Decision-084）**。sdlc-*
  skills 为现役手动驱动主干，模板缺口升级为紧急生产漏洞，P-L 从「随交付尾
  波缓行」提升为独立收口波：templates/ 新增四份 canonical 文档模板 + 各节点
  SKILL.md 引用 + 旧 specs/** 模板废弃标注 + 00-需求资料 适用性评估。验证口
  径=对照 node-capability-contract 4.1~4.7 + artifact-flow；不涉 runtime/
  E3/H1。P-K-d 现场冻结保留。实施随即开工。
- **2026-09-02（续九）：Decision-086 立项（PWR 自动推进 + finding gate 简化）**。Current User 确认设计原则：「有风险要暴露，有风险不暴露反而有问题；一旦做了决定，就不应该再有任何阻碍；我说不接受就返工，说接受就直接往前推」。Code-review findings 路由规则确认：earliestAffectedNodeId=implementation → 直接重跑 implementation（不重走 gate）；earliestAffectedNodeId=solution-design → 回流 solution-design 重走完整链。授权：PWR verdict 的 gateDecision 判为 DECIDED（`pwrProofSameScope = decisionScopeId !== null`），gateway 派生 PWR→ELIGIBLE 保留；回滚 Decision-082/083 的验收闸门/事件/管道。`computeFindingGate` 的 OPEN blocking 暂不修改（影响 knowledge-sync eligibility，随 P-C/P-D 调）。实施随即执行，resume run4 至全链完成。
- **2026-09-02（续七）：codex sandbox 修正立项（Decision-085）**。codex 自
  身诊断确认 implementation 零改动的根因 = LOOP profile 硬编码
  `--sandbox read-only` + `features.shell_tool=false`（E1-E4 时期安全基线，
  真实派发后与 implementation 合同矛盾）。裁决：codex sandbox 改为
  `workspace-write` + 启用 Shell，kimi/hermes 不动。实施随即执行。
- **2026-09-02 治理回执（Decision-085 记录传播）**：Decision-085 + 索引 +
  台账 commit `77cf853`；Exchange issue #104
  （REQ-20260902T102500Z-DECISION-085-CODEX-SANDBOX-FIX）PUBLISHED，run
  `6495df2` / pointer `ea7eb4` / handoff sha256 `df52b1cc…9482`；PKB 派生归
  档 commit `2130290`（handoff 2026-09-02-decision-085-codex-sandbox-fix +
  current.md 指针刷新至 77cf853）；CP PR #45 合 main（`10cc025`，validator
  PASS v2：route_state=`C03_LOOP_GW_SMOKE_REWORK_IN_PROGRESS`、授权
  +GW_CODEX_SANDBOX_FIX、product_commit=`77cf853`）。codex sandbox 修正已
  推送，run4 可 resume。
- **2026-09-02 P-L 收口实施回填（commit `ec9caaf`）**：四份 canonical 模板落
  地（templates/task-plan-template.md、implementation-record-template.md、
  knowledge-sync-template.md、finding-ledger-template.md——均含 Metadata 契约
  块 + artifact-flow 必备章节 + Gate 随行风险/ADV 关闭对照）；四个节点
  SKILL.md 增补 Canonical 模板引用行；sdlc-speckit-tasks/output-and-manifest.md
  加废弃标注（specs/** 目标 v1 路径，仅迁移参考）。00-需求资料 评估结论：
  requirement-intake 的 output-artifact.md 通用 Metadata 契约 + intake-workflow
  已 v2 对齐（library/{requirement_id}/ 稳定路径、无 specs/** 残留），**无需新
  增模板**——该节点「部分具备」的缺口实为文档组织问题而非模板缺失，结论记
  录在案。验证：typecheck 干净（模板为纯文档，无代码路径）。
- **2026-09-02（续八）：skill 同步副本运维规则执行确认**。sync-skills.sh 已
  运行并刷新 kimi/hermes 共 10 个目录至与仓库一致；四处 SKILL.md 引用路径
  已切换为 `${AI_SDLC_STANDARD_HOME}/templates/…`。后续每次 skills/ 变更后
  必须重跑 `scripts/sync-skills.sh`。
- **2026-09-02（续六）：skill 安装副本同步机制（P-L 收口的运维补全）**。三个
  agent 的已安装 skill 副本（~/.kimi-code/skills、~/.hermes/skills，8/27 手
  动安装）全部滞后于仓库——手动唤醒主干用的就是这些副本。处置：
  ① 四处 SKILL.md 的 canonical 模板引用统一改为
  `${AI_SDLC_STANDARD_HOME}/templates/…`（kimi skill 既有惯例，跨机可移植，
  模板落在标准包内由 env 解析）；② 新增 `scripts/sync-skills.sh`（kimi/
  hermes 安装/刷新 + --check 漂移检查，bash 3.2 兼容），已执行同步：10 个
  漂移目录全部刷新，复查 in sync（kimi/hermes 各 5 节点）。**运维规则**：
  skills/ 变更后必须重跑 sync-skills.sh（或 --check 先查），否则手动主干使
  用的仍是旧副本。
