# Follow-Up Verification Mode

## Purpose

When a specification has been revised in response to a previous INITIAL_CHALLENGE, verify that the BLOCKING and REQUIRED findings have been closed. Do not perform a full re-scan.

## Mode Selection

- First challenge on a specification: always `INITIAL_CHALLENGE`
- After specification revision: `FOLLOW_UP_VERIFICATION`
- Max revision cycles: 2 (one INITIAL_CHALLENGE + one FOLLOW_UP_VERIFICATION)
- The second cycle must use FOLLOW_UP_VERIFICATION mode. It must not diverge into a full re-scan from scratch.

## FOLLOW_UP_VERIFICATION Rules

### 1. Verify Previous Findings Closure
- For each BLOCKING or REQUIRED finding from the previous report, check whether the revised specification addresses it.
- Record closed findings with their resolution and verification status.
- Record remaining unclosed findings.

### 2. Check for New Critical Issues
- Check whether the revisions themselves directly introduced new CRITICAL issues.
- Scope: only issues directly caused by the revision changes.
- Do not perform a full-dimensional re-scan.

### 3. Do Not Add Unrelated Findings
- Do not add new findings that are unrelated to the previous round's BLOCKING/REQUIRED items.
- Exception: if a revision directly introduces a new CRITICAL issue, it must be recorded.
- Do not use FOLLOW_UP_VERIFICATION to expand the challenge scope.

### 4. Result Decision
- If any previous BLOCKING or REQUIRED finding remains unclosed → `NEEDS_REVISION`
- If new CRITICAL issues were introduced by the revision → `NEEDS_REVISION`
- All previous BLOCKING/REQUIRED closed and no new CRITICAL → `READY_FOR_GATE`
- Never output `READY_FOR_GATE` while BLOCKING or REQUIRED findings remain.

### 5. Output
Use the same report structure with:
- `mode: FOLLOW_UP_VERIFICATION`
- `closed_previous_findings` populated
- `remaining_previous_findings` populated if any
- Only new findings if they are CRITICAL and caused by the revision

## Cycle Limit

```
MAX_CHALLENGE_REVISION_CYCLES = 2
```

The second cycle must be FOLLOW_UP_VERIFICATION.

**Cycle exhaustion rule:** If BLOCKING or REQUIRED findings remain after the max two cycles:
- result is `NEEDS_REVISION`;
- `challenge_cycle.exhausted: true`;
- recommended next step: `ESCALATE_TO_SOLUTION_REVIEWER`.

`ESCALATE_TO_SOLUTION_REVIEWER` is a handoff action (not a Gate decision, not a Direct/Speckit decision). The formal Gate review can elevate remaining concerns as needed.

Never output `READY_FOR_GATE` while BLOCKING or REQUIRED findings remain.

## Handoff to Solution Reviewer

When the cycle limit is reached and BLOCKING/REQUIRED findings remain:
- Output `NEEDS_REVISION` with `challenge_cycle.exhausted: true`
- Recommend `ESCALATE_TO_SOLUTION_REVIEWER`
- The formal Gate review can then decide whether to `BLOCKED_NEEDS_REVISION` or accept the remaining risks

When all BLOCKING/REQUIRED findings are closed:
- Output `READY_FOR_GATE`
- Recommend `PROCEED_TO_SOLUTION_REVIEWER`
