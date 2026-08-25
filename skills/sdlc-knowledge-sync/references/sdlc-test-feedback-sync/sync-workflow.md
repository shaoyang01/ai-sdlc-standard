# Test Feedback Sync Workflow

## Purpose

Use this workflow to consume a classified `05-测试验收` artifact and decide which process rules, checklists, schemas, manifest fields, or later knowledge-sync actions should be updated.

This skill produces recommendations. It does not directly edit Checklist, Schema, or long-term knowledge files.

## Step 1: Confirm Classified Input

Required input:

- `library/{requirement_id}/05-测试验收/*`

Recommended context:

- `01-技术方案`
- `02-方案审核`
- `03-实现记录`
- `04-代码审核`
- `manifest.md`

Stop if the feedback artifact has unresolved classification or missing failure basis.

## Step 2: Extract Classifications

For each failed or risk item, extract:

- Case or item ID
- Primary classification
- Affected node
- Required action
- Re-Gate required
- Checklist update required
- Schema update required
- Code fix required
- Review gap
- Environment or data issue

## Step 3: Determine Process Impact

Map each item to possible updates:

- Specification Checklist
- Code Review Checklist
- Test Feedback Schema
- Artifact Manifest
- Change History
- Re-Gate Records
- Speckit Sync target

Do not recommend long-term sync when the item is still unresolved or failed Gate.

## Step 4: Decide Blocking Status

Block sync when:

- Classification is unresolved.
- Requirement Change is undecided.
- Specification Missing lacks Re-Gate.
- The evidence comes only from failed behavior.
- The sync target is unclear.

## Step 5: Produce Recommendations

Generate:

- What to update
- Why it should be updated
- Source evidence
- Target file or area
- Whether user confirmation is required
- Whether Re-Gate must happen first

## Step 6: Recommend Next Step

Use one:

- `Return to sdlc-specification-writer`
- `Run sdlc-solution-reviewer`
- `Fix implementation and update sdlc-implementation-recorder`
- `Update code review checklist`
- `Update specification checklist/schema`
- `Apply change-control`
- `Run sdlc-speckit-sync after Gate passes`
- `No sync required`
