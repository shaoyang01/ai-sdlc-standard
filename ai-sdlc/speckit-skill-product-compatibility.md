# Speckit Skill Product Compatibility

## Purpose

This document defines the product-level compatibility contract between legacy Speckit Skills / workflow Skills and the new `sdlc-*` Speckit Skills.

The goal is not to run a legacy comparison during target-project bootstrap. The goal is that this standard package carries enough semantics for new Skills to generate products with the same meaning, coverage, gate behavior, and workflow capability as legacy Skills.

## Compatibility Principle

New `sdlc-*` Skills may improve structure, storage, routing, and governance, but they must preserve legacy Skill capabilities at the product semantics level.

Product compatibility means:

1. The same user requirement can enter the same Speckit workflow stage.
2. The generated artifact has the same effective purpose and decision power.
3. Required sections, evidence, blockers, and next-step routing are not weakened.
4. Gate pass/fail semantics remain equivalent or stricter.
5. Runtime side effects stay explicit and no broader than the Skill contract.
6. Stable facts can still flow from short-term specs to long-term business-domain documents.
7. Project-type differences are expressed through profiles, not hard-coded to one repository.

## Development-Time Fixture Rule

Legacy repositories and their existing Speckit documents are semantic gold fixtures during standard-package development.

For each supported fixture project type, standard-package maintainers must confirm that the new standard documents can express the old workflow and generate equivalent products:

| Fixture type | Compatibility coverage |
| --- | --- |
| Backend business service | Domain route, specify, clarify, plan, tasks, analyze, implement, sync, entry coverage, code-doc reconciliation. |
| Admin mixed workflow | UI/config lifecycle, worker/schedule/data-console/SPI/RPC coverage, approval/audit/import/export/month-copy behavior. |
| Frontend application | Route/page/component/store/API/popup mapping, visual/dependency self-check, frontend L4 document shape. |
| Data pipeline and ETL | Job/ETL/Flink/function/connector coverage, SQL/data lineage, metric contract, idempotency, replay, partition/window/checkpoint. |

This fixture rule is a standard development requirement. It is not a target-project bootstrap step.

## Runtime Rule

At runtime, new Skills must read:

| Semantic source | Runtime path |
| --- | --- |
| Shared workflow and gate rules | `${AI_SDLC_STANDARD_HOME}/ai-sdlc/**` |
| Skill-specific product contracts | `${AI_SDLC_STANDARD_HOME}/skill-contracts/known-skills/**` and `skills/sdlc-*/references/**` |
| Project semantic profile | `.specify/project-governance-profile.yaml` and `.specify/entry-coverage-profile.yaml` |
| Project code/context facts | `.specify/project-context/**`, target code, and explicit user-confirmed facts |
| Long-term business facts | `.specify/business_domain/**` |
| Runtime reports | `.specify/reports/**` regenerated locally |

Runtime new Skills must not read legacy `.specify/memory/**`, `.specify/workflow/**`, or `.specify/coding_guide/**` as normal inputs.

## Product Compatibility Matrix

| Legacy capability | New Skill product | Preserved semantics |
| --- | --- | --- |
| Specify | `specs/{feature}/spec.md` | Goal, scope, current/new flow, behavior constraints, state/data changes, exceptions, acceptance, traceability to approved proposal/review. |
| Clarify | updated `specs/{feature}/spec.md` Clarifications plus coverage summary | Only residual, bounded clarification; scope-changing ambiguity blocks and routes upstream. |
| Plan | `specs/{feature}/plan.md` plus Plan Gate conclusion | Implementation approach, affected modules, contracts, data, tests, risks, and traceability to spec/proposal/review. |
| Tasks | `specs/{feature}/tasks.md` plus Task Gate conclusion | Ordered, traceable, implementable tasks; no scope expansion; no task generation without valid plan/spec. |
| Analyze | consistency report | Spec/plan/tasks/proposal/review consistency, blocking items, risk, and Re-Gate routing. |
| Checklist | `specs/{feature}/checklists/{stage}-checklist.md` | Context-specific checklist items, pass/fail evidence, blockers, and reusable rule improvement routing. |
| Implement | code changes plus implementation summary / task status | Execute approved tasks only, record verification evidence, stop on undefined behavior or unresolved blockers. |
| Sync | sync report and optional `.specify/business_domain/**` updates | Only stable, verified, authorized facts sync; skips and risks are explicit. |
| Pipeline workflow | staged execution record | `Preflight -> Domain Route -> Specify -> Clarify -> Plan -> Tasks -> Analyze -> Implement -> Sync -> Reconcile` order and stop conditions. |
| Code-doc reconcile | reconciliation report | Drift categories, evidence, ownership, and next responsible Skill without silent mutation. |
| Doc bootstrap/governance | project profiles, project-context, generation report | Runtime direct generation from standards/code/user facts, preserve legacy rail, no migration/comparison. |

## Product Shape Requirements

Every new Speckit product that replaces or extends a legacy product must preserve these shape requirements unless the individual Skill contract is stricter:

1. Stable path and artifact versioning rules from `artifact-versioning.md`.
2. Metadata with status, source, and traceability when the artifact is human-facing.
3. Explicit input artifact references and effective versions for gate, review, sync, and reconcile outputs.
4. Blocking items separated from risks and open questions.
5. Next-step routing that identifies the responsible Skill or upstream artifact.
6. No hidden assumptions when business behavior, data contract, or side effect is unknown.
7. Project-type profile influence is visible in the artifact when it affects evidence or gate semantics.

## Gate Compatibility

Legacy Skill gate behavior is preserved by these rules:

1. Missing required input blocks the stage.
2. Failed upstream gate blocks downstream execution.
3. Scope-changing clarification routes back to proposal/review, not forward.
4. Plan/tasks/analyze cannot change approved business scope.
5. Implementation cannot execute tasks outside approved specs/tasks.
6. Sync cannot write unverified or unauthorized facts.
7. Reconcile cannot silently apply changes unless the user explicitly requested apply mode.

## Project-Type Compatibility

Project-type profiles in `speckit-project-type-profiles.md` provide the project-specific semantic layer required for product compatibility.

New Skills must use the selected profile to decide:

- which entry categories count as strict coverage inputs
- which evidence chain proves behavior
- which document sections are mandatory
- which coding redlines apply
- which implementation facts must sync
- which audit reports block the gate

If no selected profile can express a legacy fixture's old semantics, the standard package is incomplete and must be extended before claiming compatibility.

## Blocking Conditions

Stop standard-package development or runtime Skill execution when:

- a required legacy capability has no new standard representation
- a new Skill would generate a weaker artifact than the old Skill for the same stage
- project-type semantics are hard-coded to one repository shape
- a runtime workflow would need legacy mixed documents as normal inputs
- a gate passes while old semantics would have blocked
- generated products omit required traceability, blockers, or next-step routing

## Non-Goals

This contract does not require:

- copying legacy documents into the standard package
- comparing old and new documents during target-project bootstrap
- preserving legacy file names when the new artifact path is governed by standard storage
- preserving wording when the effective product semantics are equivalent or stronger
