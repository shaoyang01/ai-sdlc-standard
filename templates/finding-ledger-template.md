# Finding Ledger: <Requirement Title>（adversarial_scan 第 N 轮）

> 状态：Draft（2026-09-02，Decision-084 P-L 收口波新增；canonical 模板，产出必须遵循本结构）
> 关联：[Artifact Flow · Finding Ledger](../ai-sdlc/artifact-flow.md) · [Node Contract 4.3](../ai-sdlc/node-capability-contract.md) · [Gate Result Template](gate-result-template.md) · [Finding Lifecycle](../ai-sdlc/loop-finding-lifecycle.md)

## Metadata

- Requirement ID:
- Artifact Type: Finding Ledger（solution-gate / adversarial_scan）
- Round:（baseline / closure review 第 N 轮）
- Version: 1.0.0
- Status: current / stale / actionable（manifest 冻结映射词表；`draft`/`active`/`replaced` 已废止，携带即 INVALID_INPUT——loop-artifact-revision.md）
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
- finding ID = `{requirement_id}-F{两位序号}`（如 `20260908-common-data-analysis-F01`），全 requirement 单一序列、发现登记即占用、不可变（manual-runtime-semantic-contract §5.1）。

## Finding Ledger

> severity：CRITICAL / HIGH / MEDIUM / LOW；cause：REGRESSION / IMPROVEMENT；
> earliest affected node：按六类路由的最早受影响节点。

| Finding ID | Category | Severity | Message | Evidence / 位置 | Source Revision | Earliest Affected Node | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| {requirement_id}-F01 | SOLUTION | HIGH |  |  |  | solution-design | OPEN |

## Closure 对照（closure review 轮填写）

> Ledger 只承载不可变的 scan 发现事实（登记时 `OPEN`）。finding 的关闭/接受
> **不在本文件回写**：处置经 `finding-action`（publisher）登记为生命周期记录 /
> manifest findingIndex 行——`OPEN → RESOLVED`（独立关闭复验）或
> `OPEN → ACCEPTED`（仅 scan 来源 + formal_verdict 合法 PASS_WITH_RISK；
> manual-runtime-semantic-contract §5.2/§7.1）。下表只作本轮复核的对照视图，
> 以 publisher 登记的生命周期记录为准。

| Finding ID | 复核轮次 | 修复证据 / 验收引用 | 复核结论 |
| --- | --- | --- | --- |
| {requirement_id}-F01 |  |  |  |

## 结论

（本轮扫描结论：新增 finding 数、关闭数、遗留阻塞项；无阻塞时明确说明
"无阻塞 finding"，正式 Gate 由 formal_verdict 角色另行裁决）
