# G1 / D-088-01 v3 收口报告

> Version: 1.0.0
> Status: CLOSED（2026-09-05，独立复审最终建议 PASS @ `707e6d0`，Current User 据此裁决 G1 完成）
> 上游: [v3 行为规格 v1.0.0](d088-01-v3-behavior-spec.md) · [冻结执行计划](decision-090-c03e-prerun-governance-plan.md) §4/G1 · [需求拆分 v1.0.0](decision-090-c03e-prerun-requirement-decomposition.md)（DP1–DP5）· [差距审查](d088-01-v3-gap-review.md)（F1–F7）
> 授权边界声明: 本报告是治理事实记录；G2（D-090-01 共同语义合同）未启动、未授权。

## 1. 交付事实

- 实施范围：冻结计划 §5 D-088-01 文件面（`scripts/bootstrap-knowledge-target.sh`、`scripts/bootstrap-entry-coverage-profile.sh` 联动、`scripts/validate-skill-contracts.rb`、`skills/sdlc-knowledge-sync/SKILL.md`、`tests/bootstrap-knowledge-target.test.sh`）；无夹带（三轮独立复审逐提交核验）。
- 实施链：候选 `a626335`（v2 双模式 + R1/R2）→ 规格接受 `f21b0aa` → F1–F7 实施 `ef8d470`/`ce60539` → 修复轮 `77600fb`/`b390261`/`f05d7cb` → 验收网补强 `707e6d0`。
- 最终验证：**557 passed / 0 failed**；validator `skill contract validation ok`（exit 0，三 self-test true）；反向变异探针 P1–P6 经实现方与独立复审双方实测承重。

## 2. 验收覆盖（v3 规格 §8）

- 决策表矩阵：54 组输入状态 × 3 只读执行模式 = 162 组执行，覆盖规格名义 108 格；逐格断言类型判定、零写入，LEGACY 格另断言 plan 内容与 pre-digest 绑定。
- 代表组合 A1–A16（含 DP1 拒绝/确认双路径、内容漂移拒绝、移动前缀回滚、AUDIT 路径门禁、非法 UTF-8 fail-closed、C8 残留幂等哨兵）与边界 B6/B8/B9/B10 独立用例。
- v2 场景 1–35 按新规格重归因后全部保持。

## 3. 复审史（根因合并，逐轮独立只读复审 + 变异探针）

各 finding 经多轮根因级复核后全部关闭：

| 轮次 | 结论 | findings（根因合并） | 关闭方式 |
| --- | --- | --- | --- |
| R1 | FAIL | G1-R1-H1..H7 + M1（7 blocker） | 事务性重写、四类判定、DP1 绑定、门禁前置等整体修复 |
| R2 | FAIL | G1-R2-H1..H5 + M1（5 blocker） | 双路径 union 合并、门禁取消知识豁免、EXIT 事务窗、报告参数化、验收网改造 |
| R3 | FAIL | G1-R3-H1/H2（2 blocker） | 单一组合式 EXIT 守卫、AUDIT 创建时登记、双数组资格判定 |
| R4 | FAIL | G1-R4-H1（1 blocker）+ M1（1 回归） | AUDIT 扫描逐文件 rescue 进门禁；document_scope 处置记录恢复 |
| R5 | PASS | G1-R5-M1（1 测试承重缺口，已按给定关闭条件补齐并实测 P2 双红） | 场景 50 断言补齐 |

复审裁定保留：D2 细化、知识文件无整件豁免（未否定退役词 → 回滚待人工）、`document_scope`/`entry_types` 记录不并入、C9 结构化判据、场景 6/22 重写、A10/A13/A14 = 阻断零写入。

## 4. 遗留与待裁决（不阻塞 G1 关闭）

1. **A10/A13/A14 冻结矛盾**（复审确认的规格内部矛盾）：代表组合"LEGACY × 已有 .sdlc × apply"在决策表 D1/D2 下不可达（=阻断零写入，场景 39 按此验收）。"是否支持向已治理 `.sdlc` 表面迁移"为 **Current User 独立规格裁决项**；如支持需修订冻结组合与冲突优先级。
2. **R2-P5 建议**：测试网可补跨秒 plan digest 稳定性断言（复审建议项，非 blocker）。
3. G3 完成后需重做五目录 Skill 同步（当前各 agent 安装的是 G3 修复前版本）。

## 5. 下一步（冻结顺序）

下一转换为 **G2 / D-090-01 手动/runtime 共同语义合同冻结**（需求拆分 §4 七个需求域；含裁决点③ `proposedDepthBasis` 判定表落地）。G2 启动及其任何实施须按冻结计划 §6 由 Current User 显式授权；本报告不构成该授权。
