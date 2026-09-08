# Decision-076：C03-LOOP-GW 验收材料选定与三级验收节奏授权（spruce_logistics_gateway）

## 状态

Accepted（2026-08-31，Current User 裁决组合：「先来冒烟级的，就在当前分支上搞，
不要切换其他分支」+「在开始验收之前先做一下项目治理，这次要求 CP、PKB、本地台账、
decision、gateway 报告与验收节奏都记录下来，回家能继续」）

## 背景

C03-E E5 全波次已门 6 闭环（产品仓 HEAD `2cb46a0`）；E5-L3（真实自主 fixture run）
冻结中，输入项（真实需求 vs 合成 fixture）未决。Current User 2026-08-31 转向新
验收材料：本机真实业务仓 `spruce_logistics_gateway` 的只读审查缺陷清单（三路只读
探查 + P0 逐条人工复核，报告见 `docs/reports/c03-loop-gateway-readonly-review.md`），
选定适合离线验收的条目测试 LOOP，并要求先完成治理落档（CP / PKB / 台账 /
Decision / 报告 / 节奏）再开工。

## 问题

1. 真实仓材料引入后若不立项登记，实施将脱离治理视野（无台账 = 波次不存在）；
2. 跨机续作（Current User 下班后回家机继续）要求 CP/PKB/台账/Exchange 全部可
   迁移，PKB 写入必须走 Exchange 标准发布路径（派生归档铁律）；
3. 缺陷清单中并非所有条目都适合离线验收，需明确入选/排除口径，防止范围漂移。

## 决策

1. **新链立项 `C03-LOOP-GW`**，台账 = `docs/reports/c03-loop-gateway-acceptance-audit.md`
   （实施事实唯一权威）；审查报告入库为
   `docs/reports/c03-loop-gateway-readonly-review.md`。
2. **验收材料**：本机 `/Users/eric_shaoooo/meicai/projects/spruce_logistics_gateway`，
   工作分支 `feature/dev_20260831_loop_test`（起点 `cc06c605`），**全程不切换分支**。
3. **三级验收节奏（Current User 选定）**：
   - **① 冒烟（非实现类，本轮授权范围）**：`GatewayMD5Util` `System.exit(-1)`→
     抛异常 + 新增离线单测；`GatewayDubboSyncInvoker` logger 类名笔误；
     `GatewayInvokeServiceImpl.invokeTest` 死代码整段删除（含接口声明）；
   - **② 主测（实现类）**：P0-2 endsWith query-string 绕过修复 + `?x=.js` 不再
     放行的单测；
   - **③ 批量（非实现类）**：NPE 判空 / 缓存字段 volatile / Dict 空列表守卫。
   - 每级完成 → 交付汇报 → **停等 Current User 显式放行下一级**。
4. **排除项（不入验收）**：P0-1 明文密码（运维轮换，非代码任务）；P0-3 SALT/
   CORS/盐迁 ACM（安全语义取舍，验收口径定不清）；P0-4 @Transactional（多数据源
   运行时验证缺基建）；37 份 job 拷贝收敛（无测试网中型重构，等测试地基后另议）。
5. **执行者与环境**：本会话 agent（Current User 在场监督）；LOOP-runtime 真实
   CLI run（三 provider）不在本决策范围。
6. **验证口径**：`mvn compile` 全绿 + 新增离线单测绿 + 目标行为断言。
7. **治理落档路径**：产品仓事实 → Exchange run（issue 触发
   `exchange-publisher`，PKB 写入一律经此派生）→ PKB 派生归档（handoff +
   `current.md` 指针）→ CP STATE 更新（branch + PR 合 main，常设授权）。

## 原因

- 三项冒烟条目均为机械改动且可离线验证（编译 + 单测自证），是验证「全链路能
  干净跑完、退出不假挂」的最低成本材料；
- endsWith 绕过（②）是全场唯一「语义修复 + 验收天然可写」的题目，适合测真实
  理解力；排除项的共同特征是正确答案依赖外部系统或运行时验证，验收口径无法
  在仓内自洽判定，交给 LOOP 必然产生假 PASS/假 FAIL；
- 先治理后施工：无台账条目 = 波次不存在 = 禁止一切技术工作；跨机续作要求
  治理四件套（CP/PKB/台账/Decision）先于代码落地。

## 影响

- LOOP 验收从「待定输入」变为「真实仓缺陷驱动的三级阶梯」，且跨机可续作；
- spruce 仓进入治理视野，后续对该仓的任何代码改动须查本台账；
- **范围边界**：spruce 仓改动仅限授权三项，实施中发现新问题记台账挂后续，不
  夹带；spruce 分支 push 属外部可见动作，每级完成后单独向 Current User 确认；
- E5-L3 冻结状态不变：本链是 E5-L3 材料与节奏的落地化，其正式收口条件（真实
  CLI run 证据面）是否由本链替代/部分替代，留待 Current User 后续裁决；
- 不请求 C05，不激活 LOOP 真实 CLI 路径；排除项不因本决策关闭，另立材料时可复议。

## 实现状态

- 产品仓：台账 + 报告 + 本 Decision + 索引行，2026-08-31 落档（见本仓 git log）；
- Exchange run：REQ-见 issue（触发 `exchange-publish`，run/pointer commit 回填
  台账 §5）；
- PKB：派生归档 handoff + `current.md` 指针更新（`feature/knowledge-base-v1`）；
- CP：STATE 更新经 branch `docs/c03-loop-gw-smoke-state` PR 合 main（常设授权）；
- 冒烟级实施：RUNNING，完成后回填台账 §3 波次账（commit 链、验证输出、停驻点）。

## 依据

- Decision-075（E5 分层授权，E5-L3 冻结中）
- `docs/reports/c03-e5-task-set-and-acceptance-audit.md`（E5 台账）
- `docs/reports/c03-loop-gateway-readonly-review.md` / `c03-loop-gateway-acceptance-audit.md`
- CP `projects/ai-sdlc/STATE.yaml`；PKB `10-projects/ai-sdlc-standard/current.md`
