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
| ① 冒烟 | MD5Util `System.exit(-1)`→抛异常+离线单测；`GatewayDubboSyncInvoker:36` logger 类名笔误；`GatewayInvokeServiceImpl.invokeTest` 死代码整段删除（含接口声明） | 非实现类 | **RUNNING** |
| ② 主测 | P0-2：6 filter `endsWith(getURI())` query-string 绕过修复 + 单测（`?x=.js` 不再放行） | 实现类 | PENDING 放行 |
| ③ 批量 | NPE 判空（`GatewayConfigCacheServiceImpl:161`）+ 缓存字段 volatile + Dict 空列表守卫 | 非实现类 | PENDING 放行 |

**排除项（不入验收，理由见 Decision-076）**：P0-1 明文密码（运维/轮换）；P0-3
SALT/CORS/盐迁 ACM（安全语义取舍，验收口径定不清）；P0-4 @Transactional（多数据源
运行时验证缺基建）；37 份拷贝收敛（无测试网中型重构）。

**验证口径**：`mvn compile` 全绿 + 新增离线单测绿 + 目标行为断言。每级完成后交付
汇报并停等 Current User 放行下一级。

## 3. 波次账

### W-GW-SMOKE（冒烟级，2026-08-31 立项即实施）

- **范围**：上述 ① 三项，范围严格限定，不夹带其他缺陷。
- **执行环境**：本机会话 agent（Current User 在场）；LOOP-runtime 真实 CLI run
  不在本波范围。
- **状态**：RUNNING（治理落档后立即实施）。
- **回填**：待实施完成后补（commit 链、验证输出、停驻点）。

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
