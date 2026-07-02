---
name: sdlc-speckit-pipeline
description: |
  This skill should be used when the user asks to "执行完整 Speckit 流程", "进入完整 SDD 流程", "唤醒 sdlc-speckit-pipeline", "按 Speckit pipeline 开发", or asks to run the optional full Speckit path after sdlc-solution-reviewer recommends `SPECKIT_PIPELINE_REQUIRED` or the user explicitly chooses full SDD.
version: 0.1.0
---

# sdlc-speckit-pipeline

Orchestrate the optional full Speckit SDD path after solution review. Treat this skill as the New-Rail Enhanced Speckit Pipeline controller: verify activation, run each child skill in order, stop at every blocking Gate, preserve user confirmation boundaries, and keep implementation, sync, and reconciliation side effects owned by the responsible child skills.

## Core Rules

1. Start only after `sdlc-solution-reviewer` passes. A user full SDD request can override `DIRECT_IMPLEMENTATION`, but cannot skip `01-技术方案` or `02-方案审核`.
2. Do not treat Pipeline as the default path for every requirement.
3. Require `SPECKIT_PIPELINE_REQUIRED`, explicit user choice, or a later Gate decision that direct implementation is too risky.
4. Reuse approved `01-技术方案` and `02-方案审核`; do not reinterpret requirements from chat.
5. Execute stages in order: Preflight, Domain Route, Specify, Clarify, Plan, Tasks, Analyze, Implement, Sync, Reconcile.
6. Stop at every blocking result and route to the earliest affected upstream node.
7. Ask whether to enter the next stage only before the Clarify boundary. After Clarify passes, run Plan, Tasks, Analyze, Implement, Sync, and Reconcile in order without stage-by-stage transition prompts.
8. Before entering the post-Clarify continuous execution segment, collect any missing authorization for code implementation, knowledge sync target/write, reconcile apply, or accepted-risk ownership.
9. Use only `sdlc-speckit-*` child Skills at runtime; legacy `speckit-*` Skills are development-time fixtures only.
10. Do not read `.specify/memory/**`, `.specify/workflow/**`, or `.specify/coding_guide/**` as runtime inputs.
11. Do not bypass child skill contracts, checklists, or stop conditions.
12. Do not let Clarify expand scope; unresolved core questions must return to solution writing and review.
13. Do not let Plan or Tasks change approved business behavior.
14. Do not let Implement add unapproved behavior.
15. Do not let Sync persist chat fragments, unstable facts, or unauthorized targets.
16. Do not let Reconcile rewrite documents to legitimize code drift.
17. Recommend manifest Activity Log, Gate, Re-Gate, Sync, and Reconcile updates after every stage.

## Standard Package Resolution

Before loading shared files, resolve `AI_SDLC_STANDARD_HOME` using this order:

1. Environment variable `AI_SDLC_STANDARD_HOME` when it points to a directory containing `manifest.yaml`.
2. Target repository `.specify/project-governance-profile.yaml` `standard_package.source.location` when it points to a local standard package.
3. Current repository root when it contains `manifest.yaml` and `ai-sdlc/`.
4. Installed Skill development fallback only when this Skill still lives inside the standard repository.

After resolution, read `${AI_SDLC_STANDARD_HOME}/ai-sdlc/standard-package-resolution.md` and validate required files before continuing.

Do not resolve shared standard files from the target repository `.specify/memory/**`, `.specify/workflow/**`, or `.specify/coding_guide/**`. Target repositories store only project profiles, generated business-domain documents, reports, and explicit overrides.

## Required Standard Files

Use these files from the resolved `AI_SDLC_STANDARD_HOME` as authoritative rules:

- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/standard-package-resolution.md`
- `${AI_SDLC_STANDARD_HOME}/skill-contracts/known-skills/sdlc-speckit-pipeline.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/lifecycle.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/phase-gates.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/artifact-flow.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/artifact-storage.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/change-control.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/speckit-generation-source-model.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/speckit-dual-rail-isolation.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/speckit-document-generation-spec.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/speckit-document-governance.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/speckit-project-bootstrap.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/speckit-skill-product-compatibility.md`
- `${AI_SDLC_STANDARD_HOME}/templates/artifact-manifest-template.md`

## Reference Files

Load these references as needed:

- `references/activation-and-inputs.md` for activation rules, inputs, and path selection.
- `references/new-rail-enhanced-pipeline.md` for new-rail runtime identity, legacy isolation, project private context, Domain Route summary, and Clarify-boundary transition policy.
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
- Project private documents declared in `.specify/project-governance-profile.yaml`
- `.specify/project-context/ProjectWorkflowGuide.md`, when declared
- `.specify/project-context/ProjectDocumentationGuide.md`, when declared
- `manifest.md`, if available

Stop when the review result is failed, blocked, missing, or recommends direct implementation without explicit full SDD confirmation.

### 2. Run Preflight And Domain Route

Read:

- `references/new-rail-enhanced-pipeline.md`
- `references/stage-sequence.md`
- `references/gate-and-regate.md`

Verify:

- `.specify/project-governance-profile.yaml` exists when the target project uses Speckit.
- Shared governance rules are read from this standard package, not copied from target `.specify/memory` or `.specify/workflow`.
- Project private documents required by the profile are present and are read after standard package rules.
- Runtime dispatch is limited to `sdlc-speckit-*` child Skills.
- Legacy Skills and legacy `.specify/memory/**`, `.specify/workflow/**`, `.specify/coding_guide/**` documents are treated only as development-time fixtures, never runtime inputs.
- Project overrides are explicit when local private documents conflict with shared standard rules.
- Domain route is known: existing-change, new-flow, integration-change, data-change, or unknown.
- Required business knowledge inputs are present, or `.specify/business-domain-bootstrap.yaml` exists so they can be generated before knowledge routing.
- Domain Route Summary and New-Rail Runtime Check can be reported before Specify starts.

Stop when project profile, bootstrap configuration, required private documents, explicit overrides, or domain route cannot be determined.

### 3. Execute Speckit Authoring Gates

Run or route to child skills in order:

- `sdlc-speckit-specify`
- `sdlc-speckit-clarify`
- `sdlc-speckit-plan`
- `sdlc-speckit-tasks`
- `sdlc-speckit-analyze`

After Preflight, Domain Route, and Specify:

- Capture result, output artifact, blocking items, and manifest recommendation.
- Output stage conclusion, produced or reused artifacts, Gate result, accepted or unresolved risk, and recommended next step.
- Ask whether to enter the next stage.
- Stop on `FAIL`, `BLOCKED`, unresolved core ambiguity, unaccepted risk, or stale or replaced artifact.
- Route to the earliest affected upstream node.

At Clarify:

- Stop on unresolved core questions.
- When Clarify passes, collect any missing authorization for implementation, Sync target/write, Reconcile apply, or accepted risk.
- If authorization is complete, continue through Plan, Tasks, Analyze, Implement, Sync, and Reconcile without asking whether to enter each next stage.
- If authorization is missing, stop at the Clarify boundary and report exactly what is missing.

### 4. Execute Implementation Gate

Before implementation:

- Confirm that Analyze Gate passed.
- Confirm implementation authorization was already collected before the post-Clarify continuous execution segment.
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
- New-Rail Runtime Check
- Domain Route Summary
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
- New-Rail Runtime Check
- Domain Route Summary
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
- User full SDD request exists but `01-技术方案` or `02-方案审核` is missing.
- Development path is `DIRECT_IMPLEMENTATION` and the user did not explicitly choose full SDD.
- A pre-Clarify stage completed but the user has not confirmed entering the next stage.
- Clarify passed but required downstream authorization for continuous execution is missing.
- Runtime execution would require a forbidden legacy Skill or forbidden legacy `.specify/memory/**`, `.specify/workflow/**`, or `.specify/coding_guide/**` input.
- A required artifact is missing or stale.
- A child skill returns `FAIL`, `BLOCKED`, or unresolved Critical issue.
- A stage would reinterpret approved requirements.
- Implementation would require unapproved behavior.
- Sync target or write authorization is unclear.
- Reconcile finds blocking code, spec, DocFlow, knowledge, or manifest drift.
