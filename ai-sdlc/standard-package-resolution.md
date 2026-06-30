# Standard Package Resolution

## Purpose

This guide defines how an installed Skill or agent locates the local AI SDLC Standard package.

Shared standard documents must live in the local standard package. Target repositories should not copy shared `ai-sdlc/**`, `ess/**`, `checklists/**`, `templates/**`, or `skill-contracts/**` files into their own `.specify` directory.

## Resolution Order

After downloading or updating the standard package, run:

```bash
scripts/init-standard-home.sh
```

The initializer writes `AI_SDLC_STANDARD_HOME` into the user's shell profile through a managed block.

When a Skill needs shared standard files, resolve `AI_SDLC_STANDARD_HOME` in this order:

1. Use environment variable `AI_SDLC_STANDARD_HOME` when it is set and points to a directory containing `manifest.yaml`.
2. Use `.specify/project-governance-profile.yaml` from the target repository when `standard_package.source.location` points to a local directory containing `manifest.yaml`.
3. Use the current repository root when it contains `manifest.yaml` and `ai-sdlc/`.
4. Use the installed Skill's bundled development fallback only when the Skill is still inside this standard repository.
5. Stop and ask the user to configure `AI_SDLC_STANDARD_HOME` when no valid package root can be found.

Do not infer the standard package root from target repository `.specify/memory/**` or `.specify/workflow/**`.

## Required Validation

After resolving `AI_SDLC_STANDARD_HOME`, verify:

- `${AI_SDLC_STANDARD_HOME}/manifest.yaml` exists.
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/lifecycle.md` exists.
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/speckit-document-governance.md` exists.
- `${AI_SDLC_STANDARD_HOME}/skill-contracts/` exists.
- `${AI_SDLC_STANDARD_HOME}/templates/` exists.

If validation fails, stop before running a Speckit workflow stage.

## Path Usage

All shared standard paths in Skill instructions are relative to `AI_SDLC_STANDARD_HOME`.

Examples:

```text
${AI_SDLC_STANDARD_HOME}/ai-sdlc/artifact-storage.md
${AI_SDLC_STANDARD_HOME}/ess/specification-schema.md
${AI_SDLC_STANDARD_HOME}/checklists/specification-checklist.md
${AI_SDLC_STANDARD_HOME}/templates/artifact-manifest-template.md
```

Target repository paths remain relative to the target repository root.

Examples:

```text
library/{requirement_id}/manifest.md
specs/{feature}/spec.md
.specify/project-governance-profile.yaml
.specify/business_domain/00BusinessLandscape.md
```

## Project Profile Contract

Generated target repositories should include:

```yaml
standard_package:
  name: ai-sdlc-standard
  version: 0.1.0
  source:
    type: local_or_git
    location: "<path-or-git-url-to-ai-sdlc-standard>"
```

Agents may use `source.location` only when it is a local path. Git URLs are provenance metadata unless the agent explicitly downloads or checks out the standard package with user approval.

## Blocking Conditions

Stop when:

- `AI_SDLC_STANDARD_HOME` cannot be resolved.
- `manifest.yaml` is missing.
- The resolved package does not contain required standard files.
- The target project attempts to treat shared `.specify/memory/**` or `.specify/workflow/**` as the standard source.
- A Skill would need to copy shared standard documents into the target repository.
