# AI Change Guardrails

## Status

`guidance_only`

## Purpose

Small fixes should avoid broad metadata and artifact churn. They should minimize token usage, review scope, and copy/paste drift. This document defines two modes for future AI/Codex changes.

## Small Fix Mode

Use this mode by default for targeted changes:

- Modify only the files explicitly requested.
- Do not update global metadata unless required by failing tests.
- Do not modify `package.json` unless the task explicitly requires it.
- Do not create new artifacts.
- Do not add tests unless the task explicitly requires it or an existing test must be adjusted.
- Do not move or delete files.
- Do not change the recommended next PR unless explicitly requested.
- Do not claim that future artifacts are already present.
- Prefer exact wording fixes over regenerating an entire stage artifact.

## Stage Artifact Mode

Use this mode only with explicit user approval:

- Avoid creating `ts`/`md`/`json`/`test` quartets by default.
- Prefer one consolidated artifact when a single document can represent the stage.
- Keep the current stage and the next stage clearly separated.
- Do not continue a rollout/gate/plan chain automatically.

## Default Review Scope

Future reviews should proceed in this order:

1. Changed files only.
2. Canonical files if broader context is needed.
3. Individual evidence artifacts only if directly modified.

## Canonical Files

For Hermes Phase-2 work, see the canonical file list in `HERMES_PHASE_2_CONSOLIDATION.md` and `CAPABILITY_ARTIFACT_DIRECTORY_CLEANUP_PLAN.md`.

## Non-goals

- No Runtime changes.
- No Gateway changes.
- No implementation changes.
- No rollout planning.
- No directory migration.
- No metadata sync.
