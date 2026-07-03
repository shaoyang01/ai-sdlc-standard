# Project-Type Contract Matrix

> **Status**: Superseded by `${AI_SDLC_STANDARD_HOME}/ai-sdlc/project-type-contract-artifact-matrix.md`.
> Runtime rules must use the standard file above. This file is retained for backward-compatible local references only and is not authoritative when the standard file is available (superseded, not authoritative).

> **Reference**: `${AI_SDLC_STANDARD_HOME}/skills/sdlc-speckit-plan/references/project-type-contract-matrix.md`

## Purpose

This matrix defines the contract artifact granularity required by `sdlc-speckit-plan` for each `project_type_profile`. Plan Gate must verify that every relevant contract surface is covered or explicitly skipped with a complete skip record. **Note**: the authoritative matrix is now at `${AI_SDLC_STANDARD_HOME}/ai-sdlc/project-type-contract-artifact-matrix.md`.

## Companion Artifact Status Table

Plan stage must output a companion artifact status table in `plan.md`:

```markdown
| Artifact | Status | Path | Skip Reason | Risk | Impact | Accepted By | Re-Gate Required |
| --- | --- | --- | --- | --- | --- | --- | --- |
| plan.md | Produced | specs/{feature}/plan.md |  |  |  |  | no |
| research.md | Produced / Reused / Not Applicable / Deferred | specs/{feature}/research.md |  |  |  |  |  |
| data-model.md | Produced / Reused / Not Applicable / Deferred | specs/{feature}/data-model.md |  |  |  |  |  |
| contracts/ | Produced / Reused / Not Applicable / Deferred | specs/{feature}/contracts/ |  |  |  |  |  |
| quickstart.md | Produced / Reused / Not Applicable / Deferred | specs/{feature}/quickstart.md |  |  |  |  |  |
```

**Status values**: Produced, Reused, Not Applicable, Deferred.

**Skip Record / Contract Skip Records**: Artifact, Project Type Profile, Skip Reason, Risk, Impact, Accepted By, Re-Gate Required, Verification Alternative.

**Contract types**: API contract, RPC contract, MQ producer / consumer contract, route / page contract, trigger contract, SQL lineage contract, public API contract, backend-business-service, admin-mixed-workflow, frontend-application, data-pipeline-etl, library-shared-component.

Companion artifacts: specs/{feature}/research.md, specs/{feature}/data-model.md, specs/{feature}/contracts/, specs/{feature}/quickstart.md.

Plan Gate BLOCKED when companion artifact missing without complete skip record. Deferred without Accepted By is BLOCKED.
