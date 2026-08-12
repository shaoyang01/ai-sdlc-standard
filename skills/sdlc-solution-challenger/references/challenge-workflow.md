# Challenge Workflow

## Step 1: Resolve Inputs

### Primary Input
```
library/{requirement_id}/01-技术方案/*
```

### Supporting Inputs
```
library/{requirement_id}/00-需求资料/*
manifest
original flow documents
API definitions
data models
related code context
historical technical specifications
previous challenge reports
confirmed current-phase scope
user-deferred capability lists
```

### Stop Conditions (do not proceed if any):
- Technical specification is missing or unreadable
- Requirement scope cannot be determined
- Current phase goal is completely absent and cannot be inferred
- Original flow impact cannot be identified
- Any key finding requires guessing business rules

Do not write or rewrite the technical specification.

## Step 2: Identify Delivery Phase Boundary

Before challenging, extract the delivery phase context from the inputs. Prioritize reading from:
- `00-需求资料`
- `01-技术方案`
- `manifest`
- user's explicit statements

Extract or note as unknown:
```yaml
delivery_phase:
  current_phase:
  phase_goal:
  must_have:
  explicitly_deferred:
  phase_constraints:
  future_direction:
```

If the phase boundary is incomplete but the current delivery goal is still identifiable:
- Continue INITIAL_CHALLENGE.
- Emit a `PHASE_BOUNDARY_MISSING` finding.
- Mark uncertain items `UNKNOWN_PHASE`.
- Do not invent phase boundaries.

If the current delivery goal is completely indeterminable:
- Stop immediately.
- Return missing-input diagnostics.
- Do not produce a definitive `NEEDS_REVISION` / `READY_FOR_GATE` result.
- Do not continue the full challenge scan.

## Step 3: Load Challenge Rules

Load and apply:
- `scope-and-phase-firewall.md` — Scope Firewall and Phase Firewall rules
- `finding-classification.md` — Finding schema and classification rules
- `output-report.md` — Report structure
- `follow-up-verification.md` — If in FOLLOW_UP_VERIFICATION mode
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/goal-anchored-global-reasoning.md` — shared goal-anchored global reasoning contract (global-before-local scan, impact closure, root-cause convergence, bounded continuation)

## Step 4: Scan Challenge Dimensions

Scan global-before-local: enumerate the applicable material surfaces of the current goal before scanning individual dimensions. Do not drill into a single local detail first.

Review the specification against these dimensions. Only check content within the approved scope and current delivery phase. Skip dimensions that are clearly irrelevant to the current specification.

1. Requirement-to-Spec Mapping
2. In Scope / Out of Scope Mapping
3. Current Phase Goal Mapping
4. Original Flow Compatibility
5. New Flow Completeness
6. State Transitions
7. Data Source and Authority
8. Data Consistency
9. Transaction Boundaries
10. Idempotency
11. Retry and Compensation
12. Concurrency and Ordering
13. API Impact
14. DB Impact
15. Cache Impact
16. MQ Impact
17. Timeout Behavior
18. Partial Success
19. Failure and Recovery
20. Version Compatibility
21. Gray Release
22. Rollback
23. Security and Authorization
24. Logging and Observability
25. Monitoring and Alerting
26. Manual Fallback
27. Test Coverage
28. Acceptance Coverage
29. Alternative Solution
30. Overdesign Check

For every material finding, close its direct impacts per the frozen shared surface list (`${AI_SDLC_STANDARD_HOME}/ai-sdlc/goal-anchored-global-reasoning.md`, section 7; section 3) before moving on — the local example defers to the shared surfaces and never narrows them. After a fail-worthy finding, continue the remaining reliable bounded surfaces; the result reflects the complete scan, not the first finding.

## Step 5: Classify and Consolidate Findings

For each finding:
1. Apply Scope Firewall — does it fall within one of the 6 allowed question types? If not, it can only be OUT_OF_SCOPE or future_phase_observations.
2. Apply Phase Firewall — mark phase_relevance and scope_basis.
3. Determine minimum_sufficient_fix — prefer local rules, explicit constraints, simple state design, bounded retry, explicit failure states, manual fallback, existing admin operations, existing monitoring, existing alerting channels, documented operational procedures, clear ownership.
4. Apply recovery depth limit — challenge primary behavior and one recovery level only.
5. Assess complexity_impact and phase_value.
6. Classify using the finding schema.

### Consolidation Rule
Merge findings by root cause. For example:
- "Missing retry count" + "Missing retry interval" + "Missing retry trigger" + "Missing post-retry behavior"
- → Single finding: "Retry strategy undefined" with sub-items.

Do not split one missing decision into multiple findings.

## Step 6: Decide Result

```
Any BLOCKING or REQUIRED finding
  → NEEDS_REVISION

Only NON_BLOCKING and OUT_OF_SCOPE findings remain
  → READY_FOR_GATE
```

OUT_OF_SCOPE and FUTURE_PHASE findings never block READY_FOR_GATE.

### Complexity Budget Re-Check
If the challenger's own proposed revisions would escalate current_design from LOW to HIGH complexity, re-screen findings:
- Move non-essential items to future_phase_observations
- Keep only the minimum revisions required for current phase goals
- Re-assess proposed_revision_delta

## Step 7: Output Report

Write the challenge report using the structure defined in `output-report.md`.

Default output path:
```
library/{requirement_id}/01-技术方案/{requirement_id}_方案挑战报告.md
```

Do not renumber existing DocFlow directories (00, 01, 02, 04).

## Step 8: Recommend Next Step

- `NEEDS_REVISION` → `RETURN_TO_SPECIFICATION_WRITER`
- `READY_FOR_GATE` → `PROCEED_TO_SOLUTION_REVIEWER`
