# G5-T1 跨机交接（2026-09-09 晚间）——v1.4.0 冻结稿待复审

## 本线信息

- 产品仓：`shaoyang01/ai-sdlc-standard`，分支 `feature/loop-runtime-v1`
- 本地/远端 HEAD：`5c18de798bb8`（PR #141 合并：T1 冻结稿 v1.4.0）
- 授权：Current User 2026-09-09 G5 进入授权（CP PR #75 合并，STATE = G5 ACTIVE / D09003_GATE OPEN / G5_MANIFEST_PROJECTION）
- 剩余计划基线：`docs/reports/decision-090-g5-remaining-plan.md` v1.1.0 @ `0f8c964`（PR #136）
- 工作区：干净（skills 残留清理 + v1.4.0 修订 + 本交接文件全部已推送）

## 当前进度

### G5-T1 投影语义冻结稿演进

| 版本 | 提交/PR | 复审结果 |
| --- | --- | --- |
| v1.0.0 | PR #137 → `ddab203` | G5-T1-REVIEW（R1）FAIL：7 项阻塞（H1–H7） |
| v1.1.0 | PR #138 → `38e179d`（后续 PR #140 补修至 `a905f25`） | G5-T1-REVIEW-R2 FAIL：4 项阻塞（R2-H2/H3/H5/H6） |
| v1.3.0 | PR #140 → `a905f25` | G5-T1-REVIEW-R3 FAIL：3 项阻塞（R3-H1/H2/H4） |
| **v1.4.0** | **PR #141 → `5c18de7`（当前主线）** | **待复审（R5）** |

### v1.4.0（当前 HEAD）相对 v1.3.0 的修订

- R4-H1：终态表移除 formal_verdict failed 错误禁令（J:519–526 仅禁成功输出）；FAIL/BLOCKED_UNKNOWN 的 decision_depth 按实际 decisionStatus 赋值
- R4-H2：前缀校验覆盖三槽位（产物绑定/当前裁决/执行事实），rehash 篡改不再逃逸
- R4-H3：parity 协议补全（§7 比较域三分 + 逻辑身份对应 + 消歧 + MANUAL 接管状态机）

## 下一步（回家后）

1. `git pull` 获取本文件
2. 复制 `docs/handoffs/2026-09-09-g5-t1/review-request.md` 全文发给复审方（G5-T1-REVIEW-R5）
3. 复审方复用 R1..R4 附件推演脚本（`/tmp/g5-t1-review*/.review-tmp/`）按 v1.4.0 规则修订后重跑
4. PASS → T2 编码启动；FAIL → 按修正清单修订后重新提交

## 边界（未授权/未完成）

- D091 业务仓收编执行、pending_confirmation 裁决、Decision-091 终值改注：未授权
- G6/run8/C03-E 完成判断/C05：未授权
- 产品运行时代码：T2 之后才涉及（当前 G5-T1 仍为语义冻结阶段）
- "四个业务仓"精确打包：UNVERIFIED
