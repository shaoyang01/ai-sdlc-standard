# Scope and Phase Firewall

## Scope Firewall

### Allowed Question Types

Only these question types may generate BLOCKING or REQUIRED findings:

1. Details already implied by current In Scope but not covered by the specification.
2. Behavior actively introduced by the current specification but not handled completely.
3. Content that is the minimum necessary to ensure correct delivery of the current requirement.
4. Content explicitly required by current acceptance criteria.
5. Content required by current original flow compatibility.
6. Direct consequences of state, data, interface, or dependency decisions made in the current specification.

### Prohibited Question Types

These must never generate BLOCKING or REQUIRED findings:

1. New business goals
2. New user scenarios
3. New features
4. New product capabilities
5. New platform capabilities
6. Pre-building for uncertain future requirements
7. Adding non-essential architecture to be "more complete"
8. Upgrading optional optimizations to current-phase blocking items
9. Forcing the system's final form into the current phase

### Scope Basis Requirement

Every BLOCKING or REQUIRED finding must include:

```yaml
scope_basis:
  type:
    REQUIREMENT
    ACCEPTANCE_CRITERIA
    EXISTING_FLOW
    SPECIFICATION_DECISION
    REQUIRED_CORRECTNESS
  reference: <对应需求、验收标准、原流程或方案章节>
```

Findings without a clear `scope_basis`:
- Cannot be BLOCKING
- Cannot be REQUIRED
- Cannot enter current-phase revision tasks
- Can only be placed in `out_of_scope_observations`
- Never block READY_FOR_GATE

## Phase Firewall

```
Review the specification against the declared current delivery phase,
not against the system's ideal final form.

A capability may be valuable to the system and still be out of scope
for the current phase.

Do not turn future architecture, platformization, automation,
or optimization opportunities into current-phase blocking findings.
```

### Delivery Phase Identification

Before challenging, identify:
```yaml
delivery_phase:
  current_phase:
  phase_goal:
  must_have:
  explicitly_deferred:
  phase_constraints:
  future_direction:
```

Read from: `00-需求资料`, `01-技术方案`, `manifest`, user's explicit statements.

If not declared, output a finding but do not invent phase boundaries.

### Phase Relevance Marking

Every finding must be marked:

```yaml
phase_relevance:
  CURRENT_PHASE_REQUIRED
  CURRENT_PHASE_OPTIONAL
  FUTURE_PHASE
  UNKNOWN_PHASE
```

#### CURRENT_PHASE_REQUIRED
- Not resolving it prevents correct completion of current phase goals, or creates unacceptable correctness, safety, data consistency, or acceptance risk.
- Can enter current-phase required actions.

#### CURRENT_PHASE_OPTIONAL
- Helpful for the current phase but not essential for core goal closure.
- Cannot block. Can only be a non-blocking suggestion.

#### FUTURE_PHASE
- May be needed in the long term but does not belong to the current phase.
- Can only enter `future_phase_observations`.
- Cannot enter current-phase revision tasks.

#### UNKNOWN_PHASE
- Current materials cannot determine phase attribution.
- Require supplementary phase information.
- Cannot be auto-upgraded to current-phase development tasks.

## Current Phase Minimum Closure Principle

The judgment standard must be:

```
Can the current specification deliver the current phase goals
correctly, safely, observably, and verifiably at minimum cost?
```

### Must NOT use these standards:
- "Is this system ultimately complete?"
- "Does this architecture cover all future scenarios?"
- "Can we build it as a platform in one step?"

### Current phase typically must cover:
- Core normal flow
- Key state changes
- Necessary data consistency
- Core idempotency requirements
- Key failure behavior
- Minimum timeout and retry strategy
- Basic logging and monitoring
- Executable acceptance criteria
- Necessary manual fallback
- Explicit risks and limitations

### Current phase typically should NOT be forced to pre-build:
- Generic rule engines
- Unified middle platforms
- Auto-compensation platforms
- Complex multi-tenancy
- Full-scenario configuration
- Plugin systems
- DSLs
- Full operations backends
- Cross-region disaster recovery
- Future multi-business-line abstractions
- Full auto-recovery systems
- System final-state architecture

## Minimum Sufficient Fix Principle

For every finding, determine `minimum_sufficient_fix`. Always ask:

```
Could this be solved by a local rule,
a bounded fallback,
or a documented operational procedure
inside the current component?
```

If yes, do not recommend platform-level solutions.

### Prefer:
- Local rules
- Explicit constraints
- Simple state design
- Bounded retry
- Explicit failure states
- Manual fallback
- Existing admin operations
- Existing monitoring
- Existing alerting channels
- Documented operational procedures
- Clear ownership

### Do not default to recommending:
- New services
- New middle platforms
- New databases
- New message queues
- New scheduling platforms
- New rule engines
- New state machine frameworks
- Unified governance platforms
- Generic abstractions
- Multi-tenancy
- Plugin systems
- DSLs
- Complex automation platforms

Unless the current requirement scope and current delivery phase can justify these as the minimum necessary approach.

## Recovery Depth Limit

```
Challenge primary behavior and one recovery level in detail.

For failures of the recovery mechanism itself,
require observability, ownership, alerting, and manual fallback.

Do not recursively design recovery systems for recovery systems.
```

Example:
```
Message send failure
→ Check retry, idempotency, failure state, alerting, or manual resend

Manual resend failure
→ Require failure logging, alerting, and clear ownership

Do NOT continue to auto-extend:
- Resend scheduling platform
- Auto-recovery for resend platform
- Cross-region disaster recovery for resend platform
- Governance system for resend platform
```
