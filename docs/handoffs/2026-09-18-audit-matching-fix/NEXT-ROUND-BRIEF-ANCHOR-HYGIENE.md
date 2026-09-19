# 下一轮工作项全文：锚点卫生轮（表通道 method/function owner 门 + 口径说明收口）

> Date: 2026-09-19 · 状态：**未开工，等 Current User 授权**
> 来源：PR #181 R2 复审报告 §8（S3 三项 + S2 排序建议）+ #179 R2/R3 遗留裁决项（J-1/J-2/J-3）
> 归口：`scripts/audit-entry-coverage.rb` 匹配口径第四轮（小轮次）；与 J-2 合并实施，共享 #181 回归基建

## 1. 两条改动（均 ≤5 行级）

### AH-1 表通道 code_anchor 的 method/function 成分补 owner 门（R2-S3①）

`match_row_to_record` 的 `code_anchor` 候选 token 来自 `record.code_anchors`，其中含
`function_names`（`process`/`execute`/`handle` 族）——探针实证：`Code Anchor` 单元格
写裸 `process` 仍以 `table code_anchor`@90 命中**所有**定义 `process` 的类（base/head
同形，#181 未触及）。修法：code_anchor 候选中的 method/function 成分比照文本通道
owner 门（R1-P1-4 / #181 §2-2 同纪律）要求行内 owner 上下文，或将其从 code_anchor
装配中拆出独立低强度候选——二选一，实施方论证后定。**双仓真实样本零发生**
（R2 §6 自设门实证），属既有面修补而非行为回归修复。

### AH-2 `text function` 死检查处置（R2-S3②）+ 口径说明收口（J-1/J-2/J-3）

- `text function`@58 检查被 #181 owner 门结构性遮蔽（门开 ⟺ symbol 直证在场并
  遮蔽之；双仓 head 产物 `text function=` 0 次）——R2 判定冗余但无害。**实施方
  建议：删除**（#179-H1 死候选教训：死代码形态是复审拦截的高发面；其覆盖意图已被
  owner 门 + symbol 直证完全承载）。复审如持「保留作文档性信号」意见，实施时按
  复审意见定。
- 口径说明随本轮一并补齐四句（全部为**维持现状的明示**，无行为变更）：
  J-1 跨通道 Reason 展示维持通道序（`impl_alias` 标签如实披露，不改展示）；
  J-2 `ImplImpl`→`Impl` 机械别名**明示接纳**（双方唯一守卫已覆盖，非缺陷）；
  J-3 中文表头映射维持惰性（`符号`/`代码路径` canonical 化为空键，logistics 别名
  覆盖已由文本通道稳定承载）；S3① 修法论证一并写入。

## 2. 回归矩阵

1. AH-1 反例：`Code Anchor` 单元格裸 `process` → 不得命中任何定义该方法的类（base
   `84e0a20` 红）；正向：单元格含 owner 符号 + 方法名 → 仍命中。
2. AH-2 删除死检查：双仓 head 产物 `text function=` 0 次的前置事实不变；fixture
   既有 30 断言零回归（无断言依赖该 Reason）。
3. 既有面：三级判别回退（数字随新增用例如实更新）、tsc / bootstrap / manual-chain /
   三 Ruby 校验器全量；#176/#179/#181 全部 CLOSED 项与不变量守恒（A179-R3 探针组
   `/tmp/a179-probes/` 授权复用）。
4. 真实样本：logistics @ `53251a99` 同树双口径——**预期零漂移**（AH-1 形态双仓
   零发生、AH-2 为死检查删除）；若漂移须逐行归因并视为缺陷信号。wms 信息性非样板。

## 3. 验收要求（沿用既有口径）

- 改动面合同：仅 `scripts/audit-entry-coverage.rb` + `tests/audit-entry-coverage.test.sh`；
  越界零 diff；`git diff --check` clean；PR base `feature/loop-runtime-v1`。
- 完成后交独立复审（全量、只读、深度根因合并式，沿 A181-REVIEW 任务书模板），
  PASS 才合并；合并后沿先例做第四次登记（预期零漂移，若属实仅需一行口径注记）。

## 4. 边界

- 不重开 #176/#179/#181 已 CLOSED 项；不启动 G6/run8/C03-E/C05、D091 业务收编。
- B 线文档侧收敛（59 行冲突中经 #181-R2 确认的真实重复面 + 4 项归属复核：
  DiplomacyService、BatchManager 族、UserWarehouseService、
  WarehouseSkuPurchaseRelationService）与本轮解耦，待 Current User 发话。
