# Task Inputs

## Required Inputs

任务规划（A1，manual-runtime-semantic-contract §7.3）requires:

- Gate Result current 且 `decisionStatus=CONFIRMED` 且
  `gateResult ∈ {PASS, PASS_WITH_RISK}`（ESCALATED/BLOCKED_UNKNOWN 即使
  字面 PASS 也不准入）
- `library/{requirement_id}/01-技术方案/*` current（被扫描对象与 Gate
  裁决对象同一修订）
- `library/{requirement_id}/02-方案审核/*`（FindingLedger current，
  `scannedDesignVersion` 与方案版本匹配）

`specs/{feature}/spec.md`、`specs/{feature}/plan.md` 与旧 Plan Gate 是
退役历史面（原件归档 `.sdlc/legacy/**`），不作为准入前置。

Recommended:

- `library/{requirement_id}/manifest.md`（由 publisher 维护）
- Gate Risk Refs（PASS_WITH_RISK 随行，指向 Finding Ledger 行）
- Re-Gate Records

## Readiness Checks

Continue only when:

- Gate Result current 且 `decisionStatus=CONFIRMED` 且 gateResult ∈
  {PASS, PASS_WITH_RISK}（manual-runtime-semantic-contract §7.3 A1）。
- `02-方案审核` 的 FindingLedger current 且 `scannedDesignVersion` 与
  技术方案当前版本一致。
- No open Required Action affects task scope, dependency order, implementation behavior, or verification.

## Missing Gate Result

无 current Gate Result（或 `decisionStatus` 非 CONFIRMED）时不产任务集
（A1 fail-closed）：回流 solution-design / solution-gate 补齐裁决。
不得以 specs/Plan Gate、未审阅方案或部分批准的实现说明替代准入
（manual-runtime-semantic-contract §7.3）。

## Source Priority

Priority order:

1. Current effective `01-技术方案`（Gate 裁决对象）.
2. Current effective `02-方案审核`（FindingLedger 与 Gate Result）.
3. Current manifest（Re-Gate Records / Risk Refs）.
4. Explicit user confirmation that does not change approved behavior or plan.

`specs/**` 为退役只读历史面：可作历史输入引用，不参与准入与优先级排序
（manual-runtime-semantic-contract §6.1/§7.3）。

If user input changes approved behavior or plan, stop and apply change-control.
