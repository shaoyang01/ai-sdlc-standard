# Output Report Structure

## Output Location

Write to:
```
library/{requirement_id}/01-技术方案/{requirement_id}_方案挑战报告.md
```

This keeps it as an auxiliary artifact within the specification phase, without renumbering existing DocFlow directories (00, 01, 02, 04).

## Report Structure

```yaml
requirement_id:

reviewed_artifact:  # the specification file reviewed

mode:
  INITIAL_CHALLENGE
  FOLLOW_UP_VERIFICATION

challenge_context:
  current_phase:
  phase_goal:
  must_have:
  phase_constraints:
  explicitly_deferred:
  future_direction:

scope_boundary:
  reviewed_in_scope:
  explicitly_not_reviewed:

challenge_result:
  status:
    NEEDS_REVISION
    READY_FOR_GATE

  blocking_count:
  required_count:
  non_blocking_count:
  out_of_scope_count:

phase_complexity_assessment:
  current_design: LOW | MEDIUM | HIGH
  proposed_revision_delta: LOW | MEDIUM | HIGH
  exceeds_phase_budget: true | false

findings:
  - id:
    necessity: BLOCKING | REQUIRED | NON_BLOCKING | OUT_OF_SCOPE
    category: MISSING_REQUIRED_DETAIL | INCONSISTENCY | UNHANDLED_FAILURE | UNSUPPORTED_ASSUMPTION | PHASE_BOUNDARY_MISSING | OVERDESIGN | TEST_GAP
    severity: CRITICAL | HIGH | MEDIUM | LOW
    phase_relevance: CURRENT_PHASE_REQUIRED | CURRENT_PHASE_OPTIONAL | FUTURE_PHASE | UNKNOWN_PHASE
    scope_basis:
      type: REQUIREMENT | ACCEPTANCE_CRITERIA | EXISTING_FLOW | SPECIFICATION_DECISION | REQUIRED_CORRECTNESS
      reference:
    target_section:
    issue:
    impact:
    challenge_question:
    minimum_sufficient_fix:
    required_resolution: IMPLEMENT_NOW | DEFINE_MANUAL_FALLBACK | DOCUMENT_CONSTRAINT | MONITOR_ONLY | FUTURE_PHASE_BACKLOG
    complexity_impact: LOW | MEDIUM | HIGH
    phase_value: ESSENTIAL | USEFUL | FUTURE
    blocking: true | false

accepted_phase_constraints:
  - risk:
    reason:
    current_fallback:
    owner:
    follow_up_phase:

future_phase_observations:
  - capability:
    reason:
    recommended_phase:
    current_phase_action: none

out_of_scope_observations:
  - observation:
    reason_out_of_scope:
    blocking: false

sections_requiring_revision:
  - section:
    findings:
    priority:

closed_previous_findings:  # FOLLOW_UP_VERIFICATION mode only
  - finding_id:
    resolution:
    verified:

remaining_previous_findings:  # FOLLOW_UP_VERIFICATION mode only
  - finding_id:
    status:

recommended_next_step:
  RETURN_TO_SPECIFICATION_WRITER
  PROCEED_TO_SOLUTION_REVIEWER
```

## Section Details

### challenge_context
Extracted from specification, requirements, manifest, and user statements. Records the delivery phase boundary used for this challenge. If the phase boundary is not declared, note it as a finding but do not invent boundaries.

### scope_boundary
Explicitly states what was reviewed and what was intentionally not reviewed. Prevents scope creep in the challenge process.

### challenge_result
Summary counts and status. The status is determined by the presence of BLOCKING or REQUIRED findings.

### findings[]
The core output. Each finding is fully classified. Findings are ordered by: BLOCKING first, then REQUIRED, then NON_BLOCKING, then OUT_OF_SCOPE. Within each group, ordered by severity (CRITICAL → HIGH → MEDIUM → LOW).

### accepted_phase_constraints
Risks and limitations that are accepted for the current phase with documented rationale, current fallback, ownership, and planned follow-up phase.

### future_phase_observations
Capabilities identified as potentially valuable in future phases. Max 5 items. Does not block READY_FOR_GATE.

### out_of_scope_observations
Observations outside the approved scope. Max 3 items. Does not block READY_FOR_GATE.

### sections_requiring_revision
Specific specification sections that need updates, mapped to the findings that drive them, with priority ordering.

### closed_previous_findings / remaining_previous_findings
Only in FOLLOW_UP_VERIFICATION mode. Tracks which previous BLOCKING / REQUIRED findings have been resolved and which remain.

### recommended_next_step
- `RETURN_TO_SPECIFICATION_WRITER` — when status is NEEDS_REVISION
- `PROCEED_TO_SOLUTION_REVIEWER` — when status is READY_FOR_GATE

## Manifest Update Recommendation

After output, recommend updating:
- Activity Log: challenge completed with status
- Missing Artifacts: if challenge report is absent
- Next Step: according to recommended_next_step
