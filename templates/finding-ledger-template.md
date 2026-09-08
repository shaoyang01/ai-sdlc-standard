# Finding Ledger: <Requirement Title>（adversarial_scan 第 N 轮）

> 状态：Draft（2026-09-02，Decision-084 P-L 收口波新增；canonical 模板，产出必须遵循本结构）
> 关联：[Artifact Flow · Finding Ledger](../ai-sdlc/artifact-flow.md) · [Node Contract 4.3](../ai-sdlc/node-capability-contract.md) · [Gate Result Template](gate-result-template.md) · [Finding Lifecycle](../ai-sdlc/loop-finding-lifecycle.md)

## Metadata

- Requirement ID:
- Artifact Type: Finding Ledger（solution-gate / adversarial_scan）
- Round:（baseline / closure review 第 N 轮）
- Version: 1.0.0
- Status: draft / active / stale / replaced
- Author / Skill:
- Created At:
- Updated At:
- Reviewed Artifact:（被扫描的方案/产物当前版本）
- Reviewed Artifact Version:
- Ledger Artifact Ref:（content-addressed ref，由 runtime 落库）

## 角色边界

- adversarial_scan 只产出本 Ledger（对抗扫描发现），不做 Gate 裁决；
- baseline 轮建立不可变基线；后续轮次为 closure review，只逐项验证 baseline
  finding 的修复证据，不给正式 Gate；
- finding ID 沿用 `ADV-N` 序列，跨轮递增不复用。

## Finding Ledger

> severity：CRITICAL / HIGH / MEDIUM / LOW；cause：REGRESSION / IMPROVEMENT；
> earliest affected node：按六类路由的最早受影响节点。

| Finding ID | Category | Severity | Message | Evidence / 位置 | Source Revision | Earliest Affected Node | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ADV-001 | SOLUTION | HIGH |  |  |  | solution-design | OPEN |

## Closure 对照（closure review 轮填写）

| Finding ID | 处置（RESOLVED / ACCEPTED_RISK / SUPERSEDED） | 修复证据 / 验收引用 | 复核结论 |
| --- | --- | --- | --- |
| ADV-001 |  |  |  |

## 结论

（本轮扫描结论：新增 finding 数、关闭数、遗留阻塞项；无阻塞时明确说明
"无阻塞 finding"，正式 Gate 由 formal_verdict 角色另行裁决）
