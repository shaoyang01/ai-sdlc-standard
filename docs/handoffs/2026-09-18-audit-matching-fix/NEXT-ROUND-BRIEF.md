# 下一轮工作项全文：泛化 token 弱证据轮（R2 建议 2 落地）+ 三项口径增量裁决

> Date: 2026-09-19 · 状态：**已实施合并收官**（PR #181，R2 独立复审 PASS 零阻塞，merge commit `84e0a20`；R2 全量程序化归因：被撤 1845 边 100% 归因 sql 族 1829 + ownerless fn 族 16、0 例未解释，logistics 0/18/153→0/18/59、wms 141/81/65）。§3 三项裁决项与复审新发现 S3①② 移交 **`NEXT-ROUND-BRIEF-ANCHOR-HYGIENE.md`**（锚点卫生轮，未开工等授权）。本文件余文保留为立项原文与实施依据。
> 来源：PR #176 R3 复审报告 §6（根因坐实与量化）+ PR #179 R2/R3 复审报告建议项（S1/S2/O-1）
> 归口：`scripts/audit-entry-coverage.rb` 匹配口径轮第三轮（前两轮：#176 边界口径 `93377d1`、#179 别名口径 `7f3ffd7`）

## 1. 根因（PR #176 R3 §6 已坐实并量化，本项不再重新探测，但实施须先复现）

对 logistics-master 冲突 169 行（pre-`53251a99` 态）2376 条（记录×文档）边的逐边归因：

- 幻影边 2080/2376（87.5%），主体两族：
  1. **`text sql=<泛化碎片>` 1993 边**：`extract_sql_names`（`scripts/audit-entry-coverage.rb` 的 `from/join/into/update/table` 扫描）从 mapper XML 提出泛化碎片 token `id`/`updater`/`is_deleted`/`schedule_task_` 等，经 `identifier_in_text?` 以独立词命中几乎所有文档（如 `BatchMapper.xml` 的 sql token 集 = `["BatchMapper","u_t","id"]`）。
  2. **`text function=<泛化方法名>` 60 边**：`process`（28）/`processTask`（20）等调度类方法名经 `/process|handle|map|execute|run/` 过滤进入 token 集，文本通道 function 无 owner 门（表通道自 R1-P1-4 起有）。
- 余为具体表名弱证据（`t_m_sku` 等 ~25 条）——**保留**（profile `entry_match_rule` 明示 SQL 名为合法证据）。
- path 宽松通道不可能产生符号缺席边（R3 已证伪），不在本轮。
- 按符号承载文档重判，169 行冲突中 120 行消解、49 行保留（量化基于 pre-`53251a99` 态；实施时以现态 153 基线重测）。

## 2. 修复边界（R3 §6 建议，供本轮采纳）

1. `extract_sql_names` 产出物过 **SQL 关键字/通用列名 denylist**（`id`、`updater`、`is_deleted` 等通用列名）且要求含 `_` 或长度阈值——两者关系（AND/OR）实施时给出论证。
2. 文本通道 function token 引入**与表通道一致的 owner 门**，或对 `process`/`execute`/`run` 族泛化方法名 denylist——二选一，实施方论证后定。
3. 口径说明写入 unarchived_services 报告注记（沿 #179 先例）。

**边界之外不动**：具体表名（`t_m_*`）证据保留；path 通道宽松合同依据成立；链图遍历、别名口径（#179）、self_entry 语义零接触。

## 3. 增量裁决项（三项，Current User 授权时一并定夺）

| 编号 | 内容 | 来源 |
| --- | --- | --- |
| J-1 | 跨通道 Reason 展示策略：wms 30 行记录 Reason 由直接点名（`text symbol@60`）显示为 `table impl_alias@75`（跨通道强度交叉，覆盖零漂移）。若裁决「直接点名优先展示」，需在 doc_match 的跨通道比较中引入通道维度（改动 > 3 行，须单独论证） | #179 R3 §7 O-1 |
| J-2 | `ImplImpl`→`Impl` 机械别名：现实现双方唯一时机械成立（无害但口径说明未提及）；裁决为「口径明示接纳」或「显式关闭」 | #179 R2 §8 S2 |
| J-3 | 中文表头映射惰性面：logistics B 线表格（`| 层 | 符号 | 代码路径 |`）表头 canonical 化为空键，名字级单元格为空——别名覆盖在该形态不生效。裁决为「扩展 TABLE_COLUMN_ALIASES 支持中文表头」（会改变 logistics 审计数字口径，需预告方向性移动）或「维持惰性并记入口径说明」 | #179 R3 §4/§6 |

## 4. 回归矩阵（R3 §6 给出，本轮执行）

1. fixture 反例：「mapper XML 含 `from id` 碎片 + 文档含独立词 `id`/`process`」→ 不得命中；正向对照：「文档点名具体表名/符号」→ 仍命中。
2. 既有回归面：fixture 27/0 全保持；三级判别回退（数字随新增用例增长如实更新）；tsc / bootstrap / manual-chain / 三 Ruby 校验器全量。
3. 真实样本预期（方向性移动预告，Current User 已授权口径）：**冲突大幅下降**（旧基线量化 ~49–68，现 153 基线重测）、**未归档核心单元上升**（被幻影边误归档的记录回落）——口径说明中预告；wms-monitor 只读非样板，同树双口径 delta 有效。
4. 复用资产：`/tmp/a179-probes/` 探针基建、fixture 27 断言、同树双口径方法（实施方 R1 自证 + 独立复审「全量、只读、深度根因合并式」，沿 A179-REVIEW 任务书模板）。

## 5. 验收要求（沿用既有口径）

- 先**实测复现**根因（logistics-master `cross_domain_conflicts.md` 逐边归因在现态重跑）再修。
- 改动面合同：仅 `scripts/audit-entry-coverage.rb` + `tests/audit-entry-coverage.test.sh`；越界零 diff（core/、scripts/lib/、skills/、templates/、其他脚本）；`git diff --check` clean。
- PR base 必须是 `feature/loop-runtime-v1`；完成后交独立复审，复审 PASS 才合并。
- 合并后按新口径对 PR #171 勘误块 + PKB 勘误文件做**第三次登记**（沿 S1 二次登记先例）。

## 6. 边界

- 不启动 G6、不做 run8、不做 C03-E 完成判断/C05、不做 D091 业务收编。
- 不重开 #176/#179 已 CLOSED 项；J-1/J-2/J-3 属口径语义裁决，未经 Current User 授权不得随本轮顺手实施（**列为独立提交或独立轮次，实施前逐项授权**）。
- B 线文档侧残余（18 未归档文档面收敛、153 冲突中 5 行真实跨域重复的指针化）与本轮解耦：属文档侧工作，待 Current User 就 4 项归属复核（DiplomacyService、BatchManager 族、UserWarehouseService、WarehouseSkuPurchaseRelationService）发话后另行安排。
