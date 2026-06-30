---
name: sdlc-speckit-pipeline
description: |
  This skill should be used when the user asks to "执行完整 Speckit 流程", "进入完整 SDD 流程", "唤醒 sdlc-speckit-pipeline", "按 Speckit pipeline 开发", or asks to run the optional full Speckit path after sdlc-solution-reviewer recommends `SPECKIT_PIPELINE_REQUIRED` or the user explicitly chooses full SDD.
version: 0.1.0
---

# sdlc-speckit-pipeline

Orchestrate the optional full Speckit SDD path after solution review. Treat this skill as a stage controller: verify activation, run each child skill in order, stop at every blocking Gate, preserve user confirmation boundaries, and keep implementation, sync, and reconciliation side effects owned by the responsible child skills.

## Core Rules

1. Start only after `sdlc-solution-reviewer` passes or the user explicitly requests full SDD.
2. Do not treat Pipeline as the default path for every requirement.
3. Require `SPECKIT_PIPELINE_REQUIRED`, explicit user choice, or a later Gate decision that direct implementation is too risky.
4. Reuse approved `01-技术方案` and `02-方案审核`; do not reinterpret requirements from chat.
5. Execute stages in order: Preflight, Domain Route, Specify, Clarify, Plan, Tasks, Analyze, Implement, Sync, Reconcile.
6. Stop at every blocking result and route to the earliest affected upstream node.
7. Require explicit confirmation before starting implementation, writing knowledge sync, or applying reconciliation updates.
8. Do not bypass child skill contracts, checklists, or stop conditions.
9. Do not let Clarify expand scope; unresolved core questions must return to solution writing and review.
10. Do not let Plan or Tasks change approved business behavior.
11. Do not let Implement add unapproved behavior.
12. Do not let Sync persist chat fragments, unstable facts, or unauthorized targets.
13. Do not let Reconcile rewrite documents to legitimize code drift.
14. Recommend manifest Activity Log, Gate, Re-Gate, Sync, and Reconcile updates after every stage.

## Required Standard Files

Use these repository standard files as authoritative rules:

- `../../skill-contracts/known-skills/sdlc-speckit-pipeline.md`
- `../../ai-sdlc/lifecycle.md`
- `../../ai-sdlc/phase-gates.md`
- `../../ai-sdlc/artifact-flow.md`
- `../../ai-sdlc/artifact-storage.md`
- `../../ai-sdlc/change-control.md`
- `../../ai-sdlc/governance-portability.md`
- `../../templates/artifact-manifest-template.md`

## Reference Files

Load these references as needed:

- `references/activation-and-inputs.md` for activation rules, inputs, and path selection.
- `references/stage-sequence.md` for stage order, child skill mapping, and handoff rules.
- `references/gate-and-regate.md` for Gate stops, Re-Gate routing, and confirmation boundaries.
- `references/side-effect-boundaries.md` for code, docs, knowledge, and command side effects.
- `references/output-and-manifest.md` for pipeline report and manifest recommendations.

## Workflow

### 1. Verify Activation

Read `references/activation-and-inputs.md`.

Identify:

- Requirement ID
- Source `01-技术方案`
- Source `02-方案审核`
- Solution review result and Development Path Decision
- User confirmation for full SDD, if needed
- Existing `specs/**`, if available
- `.specify/project-governance-profile.yaml`
- `.specify/entry-coverage-profile.yaml`
- `.specify/business-domain-bootstrap.yaml`, when business_domain is missing
- `manifest.md`, if available

Stop when the review result is failed, blocked, missing, or recommends direct implementation without explicit full SDD confirmation.

### 2. Run Preflight And Domain Route

Read:

- `references/stage-sequence.md`
- `references/gate-and-regate.md`

Verify:

- `.specify/project-governance-profile.yaml` exists when the target project uses Speckit.
- Shared governance rules are read from this standard package, not copied from target `.specify/memory` or `.specify/workflow`.
- Domain route is known: existing-change, new-flow, integration-change, data-change, or unknown.
- Required business knowledge inputs are present, or `.specify/business-domain-bootstrap.yaml` exists so they can be generated before knowledge routing.

Stop when project profile, bootstrap configuration, or domain route cannot be determined.

### 3. Execute Speckit Authoring Gates

Run or route to child skills in order:

- `sdlc-speckit-specify`
- `sdlc-speckit-clarify`
- `sdlc-speckit-plan`
- `sdlc-speckit-tasks`
- `sdlc-speckit-analyze`

After each stage:

- Capture result, output artifact, blocking items, and manifest recommendation.
- Stop on `FAIL`, `BLOCKED`, unresolved core ambiguity, unaccepted risk, or superseded artifact.
- Route to the earliest affected upstream node.

### 4. Execute Implementation Gate

Before implementation:

- Confirm that Analyze Gate passed.
- Confirm user approval to modify code.
- Confirm approved tasks and verification scope.

Then route to `sdlc-speckit-implement`.

Stop if implementation requires undefined behavior, hidden scope change, or unsafe local state.

### 5. Execute Sync And Reconcile

After implementation:

- Route stable reusable facts to `sdlc-speckit-sync` only with explicit target and write authorization.
- Route consistency audit to `sdlc-speckit-code-doc-reconcile`.
- Keep sync failure, partial sync, or reconcile drift visible as post-implementation governance state.

Do not mark the full pipeline complete while Sync or Reconcile has blocking drift.

### 6. Output Pipeline Result

Read `references/output-and-manifest.md`.

Report:

- Activation basis
- Stage timeline
- Stage results
- Artifacts produced or reused
- Code, doc, and knowledge side effects
- Blocking items and Re-Gate route
- Manifest update recommendation
- Next step

## Output Requirements

Every pipeline result must contain:

- Activation Basis
- Source Artifacts
- Stage Timeline
- Gate Results
- Produced Or Reused Artifacts
- Side Effects
- Blocking Or Deferred Items
- Re-Gate Recommendation
- Manifest Update Recommendation
- Next Step

## Stop Conditions

Stop instead of continuing when:

- Solution review is missing, failed, or blocked.
- Development path is `DIRECT_IMPLEMENTATION` and the user did not explicitly choose full SDD.
- A required artifact is missing or superseded.
- A child skill returns `FAIL`, `BLOCKED`, or unresolved Critical issue.
- A stage would reinterpret approved requirements.
- Implementation would require unapproved behavior.
- Sync target or write authorization is unclear.
- Reconcile finds blocking code, spec, DocFlow, knowledge, or manifest drift.
