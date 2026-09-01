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
| W-GW-FIX（前置波） | REAL_GATEWAY_NO_INPUT 接线缺口修复 + run()+real 最小回归 + 冒烟重跑 | runtime 仓 | **AUTHORIZED（Decision-078），待开工** |
| ① 冒烟 | MD5Util `System.exit(-1)`→抛异常+离线单测；`GatewayDubboSyncInvoker:36` logger 类名笔误；`GatewayInvokeServiceImpl.invokeTest` 死代码整段删除（含接口声明） | 非实现类 | **FAIL-CLOSED（缺口修复已授权 W-GW-FIX，重跑待其完成）** |
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

1. 拉取三仓：产品仓 `shaoyang01/ai-sdlc-standard`（fact branch
   `feature/c03-e5-autonomous-acceptance`，本台账所在）；CP `main`；PKB
   `feature/knowledge-base-v1`。
2. 被验仓本机路径 `/Users/eric_shaoooo/meicai/projects/spruce_logistics_gateway`，
   分支 `feature/dev_20260831_loop_test`（远程已存在，直接 checkout）。
3. 构建：Java 21（Zulu）+ Maven 3.9.3 已验证可用；冒烟验证命令 =
   `mvn -q compile` + `mvn -q test -pl business-gateway-utils -Dtest=GatewayMD5UtilTest`。
4. 续作入口：本台账 §3 波次账 + CP `next_transition.condition_ref`；下一级放行
   须 Current User 显式确认。

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
