# G4 / D-087 恢复与调整——Delta Assessment 与需求冻结（条目级）

> Version: 1.0.0
> Status: ACCEPTED（2026-09-06，G4 Gate 启动时按冻结计划 §6 节奏冻结）
> 完成门: Decision-087 决策 2 离线端到端测试矩阵全绿 + validator ok，不发真实 CLI 冒烟。

## 1. Delta Assessment（GW_VERTICAL_REBUILD 原授权 vs 冻结合同差异）

| 原授权范围（Decision-087） | 冻结合同 v1.0.0 调整 | 差异性质 |
| --- | --- | --- |
| 接缝 1：E3 信封增 nodeStatus，gateway 校验正文与实际一致 | 合同 §4.1 深度字段重构（requestedDepth/requiredDepth 分离）+ §4.3 合法组合表 + gateway 移除 `decisionDepth:"STANDARD"` 硬编码 | **扩展**：gateway 不再硬编码，而是从 verdict 事件读取真实深度；信封移除 riskAcceptanceRefs 强制 |
| 接缝 2：findings 原子物化为 loop_findings 行 | 合同 §5.1 全链 finding 生命周期（两类承载分离 + per-origin 登记/处置 + §7.3 回流映射） | **兼容**：store 模型（appendFinding/resolveFinding/acceptFindingRisk + durable proof）已存在；需对齐 per-action role 规则和 earliest-affected-node 回流映射 |
| 接缝 3：唯一生产装配入口（production factory） | 合同 §6.1 manifest 三对象 + readiness preflight | **兼容**：factory 已有骨架；增加 manifest readiness 检查 |
| 离线端到端测试矩阵六场景 | 合同 §8.2 N1–N9 负向矩阵 | **扩展**：新增 V2/V4/V6′/V9 等场景覆盖 |

**结论**：原 GW_VERTICAL_REBUILD 授权的三条 seam 方向与冻结合同**完全兼容**；差异为**调整**而非重设计。消费该授权并按合同 §8.1 C16–C18 调整实施。

## 2. 需求条目

| ID | 合同项 | 条目 | 实施文件 | 验收 |
| --- | --- | --- | --- | --- |
| G4-01 | C16 | gateway `decisionDepth:"STANDARD"` 硬编码移除：从 verdict 事件读取真实 `decisionDepth` | `execution/gateway.ts` L549/565/1106 | 非 STANDARD verdict fixture 产出对应深度；字面扫描无硬编码 |
| G4-02 | C17 | envelope `riskAcceptanceRefs` 非空强制移除 | `core/node-output-envelope.ts` L20/165 | PWR + 空 riskAcceptanceRefs 不再 INVALID |
| G4-03 | C15 | recovery `projectedThrough`/投影基线映射；STALE 吸收态声明 | `core/loop-recovery.ts` | 恢复后 eligibility 推导与 manifest 一致 |
| G4-04 | C14 | finding lifecycle `resolveFinding` 对齐合同 §5.2 per-action role（accept=closed_by formal_verdict） | `core/loop-finding-lifecycle.ts` | 手动面/行为等价 |
| G4-05 | C13 | `development-path-governance.md` / `lifecycle.md` / `phase-gates.md` / `project-type-contract-artifact-matrix.md` 旧 `DECIDED` 枚举替换为合同 §4.3 三态 | 4 份合同 | 无现役 DECIDED 残留 |
| G4-06 | 离线矩阵 | Decision-087 决策 2 六场景 + 合同 N1–N9 G4 承重项全绿 | `tests/loop-*.test.ts` | 全绿 |

## 3. 边界

- G5（D-090-03 manifest projector/parity）不在本波——journal→manifest 投影器属 G5。
- 不修改业务仓、不执行真实 Agent CLI、不发真实 CLI 冒烟。
- 不修改 Skill/templates/publisher（G3 已完成，冻结）。
