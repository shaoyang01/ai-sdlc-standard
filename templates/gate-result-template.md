# Gate Result: <Phase Name>

> 状态：Draft（2026-08-22，C02-WP3.5 合同重基线，Decision-044/045；收口后升 Accepted）
> 关联：[Phase Gates](../ai-sdlc/phase-gates.md) · [Artifact Versioning](../ai-sdlc/artifact-versioning.md) · [Artifact Flow](../ai-sdlc/artifact-flow.md)

## Metadata

- Requirement ID:
- Artifact Type: 方案审核（solution-gate 正式裁决）/ 其他
- Version: 1.0.0
- Status: draft / active / passed / failed / stale / replaced
- Reviewer / Skill:
- Created At:
- Updated At:
- Reviewed Artifact:
- Reviewed Artifact Version:
- Scanned Design Version:（adversarial_scan 所审方案修订；必须等于 Reviewed Artifact Version——manual-runtime-semantic-contract §5.4 同修订前置）
- Ledger Digest:
- Gate Artifact Version:
- Gate Name:
- Gate Type: solution_gate / other
- Manifest Path:
- Gate Basis:
- Result: PASS / FAIL / PASS_WITH_RISK
- Can Continue: yes/no

本模板只用于产出结论性 Gate；只有 solution-gate 的 `formal_verdict` 输出结论性 Gate（PASS / FAIL / PASS_WITH_RISK），`adversarial_scan` 角色产出的 Finding Ledger 不给正式 Gate。其他节点的确定性准入按 manual-runtime-semantic-contract §7.3 统一准入表（A1–A4）执行，不产出本模板；`sdlc-gate-runner` 已退役。[RETIRED — C03-B]

## Conclusion

- Result: PASS / FAIL / PASS_WITH_RISK
- Can Continue: yes/no
- Reviewed Artifact:
- Reviewed Artifact Version:
- Gate Artifact Version:

## Design Depth Decision（solution-gate 正式裁决必填）

- decisionDepth: LIGHT / STANDARD / DEEP（BLOCKED_UNKNOWN 时为空）
- decisionStatus: CONFIRMED / ESCALATED / BLOCKED_UNKNOWN
- requiredDepth:（当前生效要求档位；ESCALATED 时为新上调值）
- Decision Scope: FULL_REQUIREMENT / DELTA_CHANGE
- Decision Artifact:
- Current / Stale:
- Stale Condition:

合法组合（manual-runtime-semantic-contract §4.3）：`CONFIRMED`+`decisionDepth=requiredDepth` 可进入下游（A1）；`CONFIRMED`+低档=无害超集；`ESCALATED` 一律回流 solution-design（增量补强，同一 manifest 修订内下游标 stale）；`BLOCKED_UNKNOWN` 一律回流补事实。旧 `DECIDED` 枚举废止。

## Depth Coverage Ledger（solution-gate 专用节）

对照 manual-runtime-semantic-contract §4.4 档位内容要求清单逐项核验方案覆盖：

| 档位要求项 | 方案覆盖 | 缺口/备注 |
| --- | --- | --- |
| （按 requiredDepth 档位要求逐项列出） | 已覆盖 / 未覆盖 | 未覆盖项必须显式说明 |

（CONFIRMED 前提：requiredDepth 档位要求全部覆盖或 verdict 认定低档充分；ESCALATED 时本表即升档回流 solution-design 的缺口清单。）

## Finding Ledger Reference（solution-gate 正式裁决必填）

- Finding Ledger Artifact:
- Finding Ledger Version:
- Scan Executor Binding:（adversarial_scan 角色）
- Verdict Executor Binding:（formal_verdict 角色，必须与 Scan Executor Binding 不同）
- Ledger Current / Stale:
- Baseline Findings（总数 / 已关闭）:
- 未解决 Blocking Findings：Critical: / High:

对抗扫描与正式裁决必须由不同 Agent binding 执行（Decision-044）；同一 Agent 执行两角色、输入 revision 不同或 ledger 非 current 均 fail-closed。closure review 新增 blocking finding 只有两种合法来源：本轮修复直接引入的回归，或足以证明 baseline/输入完整性失效的新证据。

## Critical

| ID | Location | Summary | Required Action |
| --- | --- | --- | --- |

## High

| ID | Location | Summary | Required Action |
| --- | --- | --- | --- |

## Medium

| ID | Location | Summary | Required Action |
| --- | --- | --- | --- |

## Low

| ID | Location | Summary | Suggestion |
| --- | --- | --- | --- |

## Missing Information

## Required Actions

## Risk Acceptance

仅当 Result 为 PASS_WITH_RISK 时填写：

- Accepted Risk:
- Accepted By:
- Accepted At:
- Accepted Reason:
- Accepted Scope:
- Follow-up Required: yes/no
- Follow-up Owner:

`PASS_WITH_RISK` 只消费 current `ACCEPTED_RISK` proof；Critical 与未接受 High 始终阻塞。

## Re-Gate Check

- Required: yes/no
- Trigger:
- Earliest Affected Node / Starting Point:
- Gate Artifact:
- Gate Artifact Version:
- Result:
- Current / Stale:
- Evidence:
- Next Step:
- Manifest Current Version:
- Reviewed Version Matches Manifest: yes/no
- Stale Because:
- Required Re-Gate:
- Depth Re-Verdict: 重新裁决 / 沿用

## Next Step

## 修订记录

| Version | Date | Reviewer / Skill | Change Type | Summary | Re-Gate |
| --- | --- | --- | --- | --- | --- |
| 2.0.0 | 2026-08-22 | C02-WP3.5 | rebaseline | v2 合同重基线（Decision-044/045）：删除 Development Path / Tail / pipeline 相关字段与检查区段（Development Path Check、Documentation Governance Tail Evidence Check、Tail Completion Decision）；新增 Design Depth Decision 与 Finding Ledger Reference 区段（solution-gate 正式裁决必填）；Gate Type 收敛为 solution_gate / other，明确唯一结论性 Gate。 | no |
| 1.0.0 |  |  | initial | Initial gate result. | no |
