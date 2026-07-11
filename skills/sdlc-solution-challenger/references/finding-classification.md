# Finding Classification

## Finding Schema

Each finding must contain:

```yaml
id:  # unique finding ID within this report

necessity:
  BLOCKING
  REQUIRED
  NON_BLOCKING
  OUT_OF_SCOPE

category:
  MISSING_REQUIRED_DETAIL
  INCONSISTENCY
  UNHANDLED_FAILURE
  UNSUPPORTED_ASSUMPTION
  PHASE_BOUNDARY_MISSING
  OVERDESIGN
  TEST_GAP

severity:
  CRITICAL
  HIGH
  MEDIUM
  LOW

phase_relevance:
  CURRENT_PHASE_REQUIRED
  CURRENT_PHASE_OPTIONAL
  FUTURE_PHASE
  UNKNOWN_PHASE

scope_basis:
  type:  # REQUIREMENT | ACCEPTANCE_CRITERIA | EXISTING_FLOW | SPECIFICATION_DECISION | REQUIRED_CORRECTNESS
  reference:  # corresponding requirement, acceptance criteria, original flow, or specification section

existing_mechanism_verification:  # REQUIRED for BLOCKING and REQUIRED findings
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

target_section:  # which section of the specification is affected

issue:  # concise description of the gap

impact:  # what happens if not addressed

challenge_question:  # the specific question the specification must answer

minimum_sufficient_fix:  # the simplest sufficient resolution

required_resolution:
  IMPLEMENT_NOW
  DEFINE_MANUAL_FALLBACK
  DOCUMENT_CONSTRAINT
  MONITOR_ONLY
  FUTURE_PHASE_BACKLOG

complexity_impact:
  LOW
  MEDIUM
  HIGH

phase_value:
  ESSENTIAL
  USEFUL
  FUTURE

blocking:
  true
  false

# BLOCKING counter-evidence (required for every BLOCKING finding)
blocking_counter_evidence:
  equivalent_mechanism_absent:
  manual_fallback_absent_or_insufficient:
  documentation_only_fix_insufficient:
  parameter_only_fix_insufficient:
  risk_unrecoverable_or_unacceptable:
  current_phase_goal_prevented:
```

## Severity Calibration Order

Always calibrate bottom-up, not top-down:

1. **Already covered** (existing mechanism sufficient for current phase)
   → no finding. Do not output BLOCKING or REQUIRED.

2. **Existing mechanism present, only description or parameters missing**
   → NON_BLOCKING or REQUIRED. Minimum fix: supplement description, parameters, or operational steps. Do not add a duplicate mechanism.

3. **Current-phase behavior truly missing, but reasonable manual/procedural fallback exists**
   → REQUIRED. Minimum fix: document fallback, define ownership, add monitoring.

4. **Current-phase behavior missing, severe risk, no reasonable fallback**
   → BLOCKING. Must complete blocking_counter_evidence.

A parameter-only gap (timeout value, retry count, backoff interval) is not BLOCKING by default, unless the absence of that parameter would directly cause unacceptable and unrecoverable risk with no fallback in the current phase.

## Necessity Classification

### BLOCKING
The specification cannot proceed to formal Gate review until this is resolved. The issue would prevent correct completion of current phase goals, or creates unacceptable correctness, safety, data consistency, or acceptance risk, AND no reasonable minimum fallback exists.

Max 5 BLOCKING findings.

### REQUIRED
Must be addressed before formal Gate, but the specification can proceed with a documented constraint or manual fallback. The issue is necessary for correctness but has an acceptable minimum fallback.

Max 10 REQUIRED findings.

### NON_BLOCKING
Helpful improvement but does not prevent correct delivery of the current phase. Can be addressed later.

Max 5 NON_BLOCKING findings.

### OUT_OF_SCOPE
Outside the approved requirement scope or current phase. Cannot block. Cannot be required.

Max 3 OUT_OF_SCOPE observations.

## Status Rules

```
Any BLOCKING or REQUIRED finding
  → NEEDS_REVISION

Only NON_BLOCKING and OUT_OF_SCOPE findings remain
  → READY_FOR_GATE
```

OUT_OF_SCOPE and FUTURE_PHASE findings never block READY_FOR_GATE.

## Phase Blocking Judgment

For each finding that might block the current phase, answer:

1. If not resolved, can the current phase goal still be completed?
2. If not resolved, does it create unacceptable correctness, safety, data consistency, or acceptance risk?
3. Is there a simpler manual, process, or local technical fallback?

A finding can only be marked as current-phase BLOCKING when:

```
Not resolving it prevents phase goal completion

OR

It would cause unacceptable severe errors, data corruption, security issues,
unrecoverable states, or acceptance failure

AND

No reasonable minimum fallback exists
```

Do not mark as current-phase blocking just because "it would be more complete in the long term."

## Complexity Budget

### Per-Finding Assessment
```yaml
complexity_impact: LOW | MEDIUM | HIGH
phase_value: ESSENTIAL | USEFUL | FUTURE
```

### Processing Rules
```
ESSENTIAL + any complexity
  → Must resolve in current phase, but prioritize minimum sufficient fix.

USEFUL + LOW
  → Optional suggestion, cannot block.

USEFUL + MEDIUM / HIGH
  → Defer to future phase.

FUTURE + any complexity
  → Always defer to future phase.
```

### Overall Assessment
```yaml
phase_complexity_assessment:
  current_design: LOW | MEDIUM | HIGH
  proposed_revision_delta: LOW | MEDIUM | HIGH
  exceeds_phase_budget: true | false
```

If `exceeds_phase_budget` is true, re-screen findings:
- Move non-essential items to future phase
- Keep only the minimum revisions required for current phase goals

## Finding Count Limits

- BLOCKING: max 5
- REQUIRED: max 10
- NON_BLOCKING: max 5
- OUT_OF_SCOPE: max 3
- future_phase_observations: max 5

## Consolidation Rule

```
Consolidate findings by root cause.

Do not inflate the report by splitting one missing decision
into multiple findings.
```

Example consolidation:
- "Missing retry count" + "Missing retry interval" + "Missing retry trigger" + "Missing post-retry-exhaustion behavior"
- → Single finding: "Retry strategy undefined" with sub-items listing the missing details.

## Required Resolution Levels

```yaml
required_resolution:
  IMPLEMENT_NOW          # Must implement in current phase
  DEFINE_MANUAL_FALLBACK # Define manual fallback procedure
  DOCUMENT_CONSTRAINT    # Document the constraint or limitation
  MONITOR_ONLY           # Only need monitoring/alerting
  FUTURE_PHASE_BACKLOG   # Defer to future phase backlog
```

Example: Compensation failure
- Current phase minimum sufficient fix: log failure state, trigger alert, designated owner retries manually via existing admin console.
- Required resolution: `DEFINE_MANUAL_FALLBACK`
- Do NOT automatically require: building a universal compensation platform, building a compensation task scheduling system, building a visual compensation backend, building compensation platform disaster recovery.

## Future Phase Observations

```yaml
future_phase_observations:
  - capability:
    reason:
    recommended_phase:
    current_phase_action: none
```

Max 5 items. Never appear in blocking_findings, required_findings, current_phase_revision, sections_requiring_revision, or required_actions.

## Out of Scope Observations

```yaml
out_of_scope_observations:
  - observation:
    reason_out_of_scope:
    blocking: false
```

Max 3 items. Never block READY_FOR_GATE.

## Prevention of Future Over-Abstraction

Default rejection rule: do not accept the reasoning "we might need to support X in the future, so we must abstract Y now in the current phase."

Only allow limited evolution headroom in the current phase when:
1. Subsequent capabilities are on a confirmed near-term roadmap.
2. Current implementation would create irreversible data or interface lock-in.
3. Current low cost avoids high future migration cost.
4. Multiple known current scenarios explicitly share this capability.

Reasonable headroom:
- Stable primary keys
- Basic API versioning
- Avoiding non-extensible boolean states
- Avoiding hard-coded non-migratable data formats
- Moderate interface-implementation decoupling

Unreasonable pre-building:
- Plugin platform for one scenario
- DSL for fixed rules
- Complex multi-tenancy for single tenant
- Event middle platform for one consumer
- Unified governance platform for phase one
