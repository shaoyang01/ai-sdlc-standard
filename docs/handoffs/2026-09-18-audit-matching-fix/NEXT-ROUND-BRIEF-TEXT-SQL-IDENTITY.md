# 下一轮工作项全文：表名弱证据轮（text sql 文本通道检查移除）

> Date: 2026-09-20 · 状态：**已实施（与 brief 同 PR），待独立复审 + Current User 授权合并**
> 来源：B 线「44 行真实跨域重复指针化工程」冲突-归属对照表的 D 组发现（2026-09-20
> 公司机会话，逐边 debug 采样 1475 条边归因）；AH-2 死检查先例（#183）的直接推论
> 归口：`scripts/audit-entry-coverage.rb` 匹配口径第五轮（小轮次）

## 1. 一条改动（1 行删除 + 口径说明）

**移除 `doc_match_for_record` 文本通道的 `text sql`@58 检查。**

- 根因：持久层记录的 `sql_names` 证据集含**表名/列名**（`t_m_sku`、`warehouse_id`
  等），而表名是业务域文档的公共词汇——仅含表名的文档即被计为该记录的归属。
  logistics-master @ `fd8e5a45` 的 44 行冲突中，6 行（对照表 D 组
  #35/37/38/39/43/44）的非 owner 边**全部**为 `text sql=表名`，另有 2 行
  （#40/41）的非 owner 边为表名（其余边为真实符号）。
- 为何删除而非加 owner 门：门开 ⟺ 该文档已点名 symbol/class（同谓词、同文本），
  其 @60 直证恒先行命中并遮蔽 @58——与 #183 AH-2 对 `text function` 的删除论证
  完全同构。探针实证：owner 门变体在 lm 真实样本上 `text sql` 边数 = **0**，
  总账与移除版逐字节一致（0/0/36）。取非死代码形态。
- SQL 证据承载面不变：表通道 `sql` 字段（行内 owner 门，@82）原样保留。

## 2. 回归矩阵与实证数字

1. fixture（`tests/audit-entry-coverage.test.sh`）新增 2 断言：异域「仅含
   `t_order_item`、不点名任何类」文档不得归属 OrderMapper、不得制造跨域冲突
   （隐含冲突计数守恒 2）。分支 **34/0 全绿**；base `37e7f39` 回退 **31/3**
   （恰为新增面 3 处失败：表名文档误归属 + 幻影冲突行 + 计数 3≠2）。
2. 真实样本 logistics-master @ `fd8e5a45` 同树双口径：
   **0/0/44 → 0/0/36**（清除 8 行 = D 组 6 + 表名边 2；未归档面零回潮、零新增
   冲突、其余记录零翻转）。
3. wms-monitor（信息性非样板，本机 checkout @ `8bae9ac55`）：159/89/52 →
   **159/90/50**。唯一翻转记录 `Wms5BlameOrderItemDutyUserMapper` 的 base 唯一
   证据为 `text sql=warehouse_id`（**列名碎片**）→ 修复后 no business-domain
   match——弱证据出清而非误伤，与本轮根因同型。
4. 全量：tsc 0、bootstrap 820/0、manual-chain 106/0；`git diff --check` clean。

## 3. 验收要求（沿用既有口径）

- 改动面合同：仅 `scripts/audit-entry-coverage.rb` +
  `tests/audit-entry-coverage.test.sh` + 本 brief；越界零 diff；PR base
  `feature/loop-runtime-v1`。
- 完成后交独立复审（全量、只读、根因合并式，
  沿 `docs/handoffs/2026-09-09-g5-t1/review-request.md` 模板），PASS 后经
  Current User 授权才合并。
- 合并后 B 线执行「冲突-归属对照表」36 行去符号一次写入（另案，对照表已交
  Current User 裁决：#16→0303、#17→0104、#18→0101、#44→0402），验收
  36→0 零新增 + 随行重生成 `fd8e5a45` 树内陈旧报告（§15 卫生项）。

## 4. 边界

- 不重开 #176/#179/#181/#183 已 CLOSED 项；不启动 G6/run8/C03-E/C05、D091。
- 本轮不写 CP/PKB（合并后登记沿先例另发）；wms-monitor 只读、CoW 副本执行。
