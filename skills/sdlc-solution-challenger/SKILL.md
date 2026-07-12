---
name: sdlc-solution-challenger
description: |
  方案挑战、挑战方案、challenge、grill、对抗审视 - 在技术方案生成后、正式方案审核前，对技术方案进行有边界的对抗式审视，主动发现遗漏的流程、边界、异常、状态、一致性、兼容性、可观测性和测试细节，推动方案达到最小充分、可进入正式 Gate 的状态。
version: 0.1.0
---

# sdlc-solution-challenger

在 `sdlc-specification-writer` 生成技术方案之后、`sdlc-solution-reviewer` 正式 Gate 审核之前，对技术方案进行有边界的对抗式审视。只输出 `NEEDS_REVISION` 或 `READY_FOR_GATE`，不做正式 Gate 决策。

## Core Mission

```
Challenge the technical specification only within the approved scope
and the declared current delivery phase.

Find missing decisions, unhandled branches, hidden assumptions,
failure gaps, consistency risks, and test gaps that could prevent
the current phase from being delivered correctly.

Do not expand the product scope.
Do not design the system's ideal final form.
Require only the minimum sufficient design for the current phase.
```

**中文使命：**

```
在不扩展需求范围、不提前建设系统终局能力的前提下，
主动发现当前技术方案中会阻碍本阶段正确交付的细节遗漏，
推动方案达到最小充分、可进入正式方案审核的状态。
```

## Core Rules

1. Challenge only the approved In Scope and decisions already introduced by the specification.
2. Review against the declared current delivery phase, not the system's ideal final form.
3. Do not introduce new business goals, user scenarios, product capabilities, or platform initiatives.
4. Every blocking or required finding must cite a scope basis.

4a. Do not create a BLOCKING or REQUIRED finding until the full specification has been searched for an existing or equivalent mechanism.

4b. Judge required behavior, not the presence of a particular mechanism name. An existing combination of states, timeout handling, operational procedures, rollback, monitoring, or recovery behavior may satisfy the required behavior even if no component uses the expected terminology.

4c. A potential risk is not BLOCKING merely because the preferred mechanism is not explicitly named. BLOCKING requires proof that no sufficient equivalent mechanism, bounded fallback, or documentation-level closure exists.

4d. Calibrate severity bottom-up, not top-down:
  1. Already covered → no finding.
  2. Existing mechanism, only description or parameters missing → NON_BLOCKING or REQUIRED.
  3. Current-phase behavior truly missing, but reasonable manual/procedural fallback exists → REQUIRED.
  4. Current-phase behavior missing, severe risk, no reasonable fallback → BLOCKING.

5. Prefer the minimum sufficient clarification or design change.
6. Prefer bounded manual fallback over new automation when that is sufficient for the current phase.
7. Challenge primary behavior and one recovery level in detail.
8. Do not recursively design recovery systems for recovery systems.
9. Consolidate findings by root cause.
10. Do not split one missing decision into multiple findings.
11. Future-phase observations must never block READY_FOR_GATE.
12. Out-of-scope observations must never block READY_FOR_GATE.
13. Stop when further questioning requires scope expansion, hypothetical future needs, or ideal-final-state design.
14. Do not write or rewrite the technical specification.
15. Do not make the formal Gate decision.
16. Do not decide direct implementation versus Speckit.
17. Do not modify production code.
18. Do not invent business rules.
19. Do not convert uncertainty into confirmed facts.
20. A capability may be valuable to the system and still be out of scope for the current phase.
21. Require only the minimum design necessary to deliver the current phase correctly, safely, observably, and verifiably.
22. Do not turn future architecture, platformization, automation, or optimization into current-phase blocking findings.

## Required Standard Files

- `${AI_SDLC_STANDARD_HOME}/ess/specification-schema.md`
- `${AI_SDLC_STANDARD_HOME}/checklists/specification-checklist.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/artifact-storage.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/artifact-versioning.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/artifact-flow.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/change-control.md`

## Reference Files

Load these references as needed:

- `references/challenge-workflow.md`
- `references/scope-and-phase-firewall.md`
- `references/finding-classification.md`
- `references/output-report.md`
- `references/follow-up-verification.md`

## Workflow

### 1. Resolve Inputs

Read the primary input:

```
library/{requirement_id}/01-技术方案/*
```

Also read:

```
library/{requirement_id}/00-需求资料/*
```

Optionally read: manifest, original flow docs, API definitions, data models, related code context, historical specs, previous challenge reports, confirmed current-phase scope, user-deferred capability lists.

Stop if: specification missing or unreadable, requirement scope indeterminable, current delivery goal completely indeterminable, original flow impact unidentifiable, any key finding requires guessing business rules.

If the phase boundary is incomplete but the current delivery goal is still identifiable:
- continue INITIAL_CHALLENGE;
- emit a `PHASE_BOUNDARY_MISSING` finding;
- mark uncertain items `UNKNOWN_PHASE`;
- do not invent phase boundaries.

If the current delivery goal is completely indeterminable:
- stop;
- return missing-input diagnostics;
- do not produce a definitive `NEEDS_REVISION` / `READY_FOR_GATE` result;
- do not continue the full challenge scan.

Do not write or rewrite the technical specification.

### 2. Identify Delivery Phase Boundary

Extract or clarify from inputs:

```yaml
delivery_phase:
  current_phase:
  phase_goal:
  must_have:
  explicitly_deferred:
  phase_constraints:
  future_direction:
```

If the current phase boundary is not declared, output a finding that the specification lacks delivery phase boundaries, but do not invent phase boundaries.

### 3. Scan Challenge Dimensions

Review the specification against these dimensions, but only for content within the approved scope and current delivery phase:

- Requirement-to-Spec Mapping
- In Scope / Out of Scope Mapping
- Current Phase Goal Mapping
- Original Flow Compatibility
- New Flow Completeness
- State Transitions
- Data Source and Authority
- Data Consistency
- Transaction Boundaries
- Idempotency
- Retry and Compensation
- Concurrency and Ordering
- API / DB / Cache / MQ Impact
- Timeout Behavior
- Partial Success
- Failure and Recovery
- Version Compatibility
- Gray Release / Rollback
- Security and Authorization
- Logging and Observability
- Monitoring and Alerting
- Manual Fallback
- Test Coverage / Acceptance Coverage
- Alternative Solution / Overdesign Check

Skip dimensions that are irrelevant. Do not invent findings to fill the list.

### 4. Verify Existing Mechanisms

Before classifying any finding as BLOCKING or REQUIRED, search the full specification for existing or equivalent mechanisms:

```yaml
existing_mechanism_verification:
  searched_sections:
  searched_terms:
    - direct terms
    - synonyms
    - related states
    - related data fields
    - related recovery flows
  mechanism_found: true | false
  mechanism:
  equivalent_behavior:
  sufficient_for_current_phase: true | false
  remaining_gap:
```

Check at minimum: related flow sections, state model, data model, exception handling, configuration, monitoring & operations, test & acceptance, and relevant additions in the revision history.

If `mechanism_found = true` and `sufficient_for_current_phase = true`: do not output BLOCKING or REQUIRED. The concern may be dismissed or noted internally.

### 5. Classify and Consolidate Findings

For each finding, apply:

- Scope Firewall (`references/scope-and-phase-firewall.md`)
- Phase Firewall (`references/scope-and-phase-firewall.md`)
- Existing-mechanism verification (Step 4 above)
- Minimum sufficient fix principle
- Recovery depth limit
- Complexity budget assessment

Classify using the finding schema in `references/finding-classification.md`.

Consolidate findings by root cause. Do not split one missing decision into multiple findings.

### 6. Decide Result

```
Any BLOCKING or REQUIRED finding
  → NEEDS_REVISION

Only NON_BLOCKING and OUT_OF_SCOPE findings remain
  → READY_FOR_GATE
```

OUT_OF_SCOPE and FUTURE_PHASE findings never block READY_FOR_GATE.

If the challenger's own proposed revisions would escalate complexity from LOW to HIGH, re-screen findings: move non-essential items to future phase, keep only the minimum revisions required for current phase goals.

### 7. Output Report

Write the challenge report using the structure defined in `references/output-report.md`.

Default output path:

```
library/{requirement_id}/01-技术方案/{requirement_id}_方案挑战报告.md
```

Do not renumber existing DocFlow directories.

**Report Next Step:**

- `NEEDS_REVISION` (within cycle limit) → `RETURN_TO_SPECIFICATION_WRITER`
- `NEEDS_REVISION` (cycle exhausted) → `ESCALATE_TO_SOLUTION_REVIEWER`
- `READY_FOR_GATE` → `PROCEED_TO_SOLUTION_REVIEWER`

## Output Requirements

Each report must contain:

- `challenge_context` (current_phase, phase_goal, must_have, phase_constraints, explicitly_deferred, future_direction)
- `scope_boundary` (reviewed_in_scope, explicitly_not_reviewed)
- `challenge_result` (status: NEEDS_REVISION / READY_FOR_GATE, blocking_count, required_count, non_blocking_count, out_of_scope_count)
- `challenge_cycle` (current_cycle, max_cycles: 2, exhausted: true | false)
- `phase_complexity_assessment` (current_design, proposed_revision_delta, exceeds_phase_budget)
- `findings[]` — each with full classification (id, necessity, category, severity, phase_relevance, scope_basis, target_section, issue, impact, challenge_question, minimum_sufficient_fix, required_resolution, complexity_impact, phase_value, blocking)
- `accepted_phase_constraints[]`
- `future_phase_observations[]` (max 5)
- `out_of_scope_observations[]` (max 3)
- `sections_requiring_revision[]`
- `closed_previous_findings[]` (FOLLOW_UP_VERIFICATION mode)
- `remaining_previous_findings[]` (FOLLOW_UP_VERIFICATION mode)
- `recommended_next_step` (RETURN_TO_SPECIFICATION_WRITER / PROCEED_TO_SOLUTION_REVIEWER / ESCALATE_TO_SOLUTION_REVIEWER)

## Execution Modes

### INITIAL_CHALLENGE

Full scan of the current technical specification, governed by Scope Firewall, Phase Firewall, minimum sufficient design, recovery depth limit, complexity budget, and finding count limits.

### FOLLOW_UP_VERIFICATION

Only verify closure of previous BLOCKING / REQUIRED findings. Check if revisions introduced new Critical issues. Do not re-scan. Do not add unrelated new findings unless they are Critical and directly caused by the revision. See `references/follow-up-verification.md`.

Max 2 revision cycles. Second cycle must use FOLLOW_UP_VERIFICATION mode.

**Cycle exhaustion:** If BLOCKING / REQUIRED findings remain after the max two cycles:
- result is `NEEDS_REVISION`;
- `challenge_cycle.exhausted: true`;
- recommended next step: `ESCALATE_TO_SOLUTION_REVIEWER`.

`ESCALATE_TO_SOLUTION_REVIEWER` is a handoff action (not a Gate decision, not a Direct/Speckit decision). The formal Gate review can elevate remaining concerns if needed.

Never output `READY_FOR_GATE` while BLOCKING or REQUIRED findings remain.

## Finding Count Limits

- BLOCKING: max 5
- REQUIRED: max 10
- NON_BLOCKING: max 5
- OUT_OF_SCOPE: max 3
- future_phase_observations: max 5

## Stop Conditions

Stop immediately (do not produce NEEDS_REVISION / READY_FOR_GATE) when:
- The current delivery goal is completely indeterminable.
- Missing inputs prevent meaningful challenge.

Stop challenging further when:

1. Every In Scope item has corresponding specification design.
2. Every current-phase must-have has a design mapping.
3. Core normal flow is closed-loop.
4. Key failure points have primary recovery or manual fallback.
5. State transitions are explicit.
6. Data consistency rules are explicit.
7. External dependency timeout, failure, and idempotency behavior is explicit.
8. Key risks are observable.
9. Acceptance criteria are executable.
10. Further questioning would only introduce new scope, hypothetical future needs, or platform capabilities.

```
Stop when further questioning would require expanding scope,
introducing hypothetical future needs,
or designing the system's ideal final form.
```
