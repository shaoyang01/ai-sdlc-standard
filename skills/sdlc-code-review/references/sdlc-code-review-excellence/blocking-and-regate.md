# Blocking And Re-Gate

## Blocking Findings

Block review when:

- Critical issue exists.
- High issue exists（HIGH 一律阻断：经 implementation 直接返工后由本 Skill
  独立复验 RESOLVED——manual-runtime-semantic-contract §5.2；非 scan 来源
  无 ACCEPTED 路径，"High 缺风险接受才阻断"的旧规则废止）.
- Code violates approved scope or behavior.
- Existing flow compatibility is broken without approval.
- Data write, state transition, or transaction behavior is unsafe.
- Security or authorization behavior is undefined or wrong.
- Required verification for core behavior is missing.
- Suggested fix requires new business behavior.

## Result Rules

Use（05-代码审核 closure review 结论，非 Gate）:

- `resolved`: 全部 blocking 关闭（HIGH 经 implementation 返工并由本 Skill
  独立复验 RESOLVED，经 publisher 写入生命周期记录——manual-runtime-
  semantic-contract §5.2；Decision-086）。
- `blocked`: Critical 未关、High 待返工，或审核无法安全完成。
- 非 scan 来源无 `risk_accepted` 路径；`PASS_WITH_RISK` 是 solution-gate
  formal_verdict 的裁决组合，不出现在本节点。

## Earliest Affected Node

Route to:

| Finding | Route（earliest affected node，manual-runtime-semantic-contract §7.3） |
| --- | --- |
| Requirement unclear | `sdlc-requirement-intake` |
| Technical solution incomplete | `sdlc-solution-design` |
| Solution risk or scope disputed | `sdlc-solution-gate` |
| Spec, plan, or tasks stale | `sdlc-solution-design` / `sdlc-task-planning` |
| Implementation deviates from approved tasks | `sdlc-implementation` |
| Implementation record missing or stale | `sdlc-implementation`（实现记录登记） |
| Review output needs registration | 本节点 `finding-register`（状态迁移经 `finding-action`） |
| Review checklist gap discovered | `sdlc-requirement-intake` 分类重入 or standard governance |

## Risk Refs（仅 solution-gate PWR 裁决携带）

实现类 finding 无独立风险接受仪式（manual-runtime-semantic-contract §7.1，
Decision-086）：`PASS_WITH_RISK` 的 scope 级裁决属 solution-gate
formal_verdict，随行 Risk Refs 指向 Finding Ledger 行；本节点只登记发现与
关闭复验结论。
- Follow-up owner.
- Follow-up deadline or trigger.

Do not accept Critical risk inside code review.
