# Output Targets

## Default Speckit Target

Write or recommend writing requirement-specific checklists under:

```text
specs/{feature}/checklists/{stage}-checklist.md
```

Use lowercase stage names such as:

- `specification-checklist.md`
- `plan-checklist.md`
- `task-checklist.md`
- `analyze-readiness-checklist.md`
- `implementation-readiness-checklist.md`
- `sync-readiness-checklist.md`
- `reconcile-readiness-checklist.md`

## DocFlow Target

Use DocFlow only when the checklist is a human handoff artifact:

```text
library/{requirement_id}/02-方案审核/
library/{requirement_id}/03-实现记录/
library/{requirement_id}/05-测试验收/
```

Do not create a new top-level `library/{requirement_id}/知识沉淀` directory.

## Write Authorization

Allowed without extra authorization:

- Produce checklist content in the assistant response.
- Recommend target path.
- Recommend manifest updates.

Require explicit user request to write:

- `specs/{feature}/checklists/**`.
- `library/{requirement_id}/**`.
- Any shared checklist under `checklists/**`.

## Shared Checklist Updates

Do not update `checklists/*.md` directly from one requirement.

Route reusable improvements through:

- `sdlc-test-feedback-sync` for test-derived gaps.
- `sdlc-speckit-sync` for verified reusable implementation facts.
- Standard governance review when the change affects all future requirements.
