---
name: test-feedback-sync
description: |
  This skill should be used when the user asks to "同步测试反馈", "沉淀测试问题", "根据 05-测试验收 更新 Checklist", "测试反馈回写", "生成测试反馈同步建议", or asks to turn classified test feedback into checklist, schema, manifest, or later knowledge-sync recommendations.
version: 0.1.0
---

# Test Feedback Sync

Generate sync recommendations from classified DocFlow test feedback. Treat `05-测试验收` as the required input and produce checklist, schema, manifest, and later knowledge-sync recommendations; do not reclassify raw feedback or modify long-term knowledge directly.

## Core Rules

1. Consume classified test feedback only.
2. Do not modify production code.
3. Do not reclassify raw test feedback.
4. Do not overwrite `05-测试验收` classification results.
5. Do not modify technical specifications, implementation records, or code review reports.
6. Do not modify Checklist, Schema, or long-term knowledge unless the user separately asks for that follow-up work.
7. Do not sync unverified or failed facts into long-term knowledge.
8. Preserve uncertain sync items as `待确认同步项`.
9. Use `ai-sdlc/change-control.md` for Specification Missing, Review Missing, and Requirement Change.
10. Recommend manifest updates instead of silently editing `manifest.md`.
11. Route missing or unresolved classification back to `test-feedback-classifier`.
12. Route stable knowledge sync to `speckit-sync` or an equivalent sync flow.

## Required Standard Files

Use these repository standard files as authoritative rules:

- `../../skill-contracts/known-skills/test-feedback-sync.md`
- `../../ess/test-feedback-schema.md`
- `../../ai-sdlc/artifact-storage.md`
- `../../ai-sdlc/change-control.md`
- `../../templates/artifact-manifest-template.md`

## Reference Files

Load these references as needed:

- `references/sync-workflow.md` for the step-by-step feedback sync workflow.
- `references/classification-routing.md` for classification-specific sync recommendations.
- `references/sync-boundaries.md` for what may or must not be synced.
- `references/output-report.md` for the report structure and manifest recommendations.

## Workflow

### 1. Resolve Inputs

Identify:

- Requirement ID
- Classified `05-测试验收` artifact
- Related `01-技术方案`
- Related `02-方案审核`
- Optional `03-实现记录`
- Optional `04-代码审核`
- Manifest path
- Current effective artifact versions

Stop if classified test feedback is missing.

### 2. Load Sync Rules

Read:

- `references/sync-workflow.md`
- `references/classification-routing.md`

Read `references/sync-boundaries.md` whenever:

- Checklist or Schema changes are proposed.
- Long-term knowledge sync is proposed.
- Requirement Change or Specification Missing is present.
- The feedback is not yet resolved.

Read `references/output-report.md` before producing the final report.

### 3. Analyze Feedback Classifications

For each classified item, identify:

- Classification
- Affected node
- Required Re-Gate
- Checklist update candidate
- Schema update candidate
- Manifest update candidate
- Knowledge sync candidate
- Blocking status

Do not generate sync recommendations from unresolved or unclassified items.

### 4. Decide Sync Recommendations

Use these routes:

- Specification Missing -> recommend specification update, solution review Re-Gate, and possible specification checklist/schema update.
- Review Missing -> recommend code review checklist update.
- Requirement Change -> recommend change-control; do not sync as stable fact until Gate passes.
- Implementation Bug -> recommend fix and implementation record update; no schema/checklist sync unless the issue reveals a reusable process gap.
- Test Case Issue -> recommend test case or acceptance wording update.
- Environment / Data Issue -> recommend manifest/blocker update; no knowledge sync unless it exposes reusable environment validation guidance.

### 5. Output Or Write

By default, return the sync recommendation report in the response.

When the user explicitly asks to generate a local artifact, write:

```text
library/{requirement_id}/05-测试验收/{requirement_id}__测试反馈同步建议__vN.md
```

Use `docflow-writer` for HTML, Lark/Feishu, manifest writes, and output routing when requested. Keep this skill responsible for sync recommendations only.

### 6. Report Next Step

Always report:

- Requirement ID
- Input feedback artifact
- Sync recommendation summary
- Required Checklist / Schema recommendations
- Required Re-Gate
- Manifest update recommendations
- Whether `speckit-sync` or equivalent sync is recommended
- Blocking issues
- Next step

## Output Requirements

Every sync recommendation report must contain:

- Source Feedback Artifact
- Classification Summary
- Re-Gate Recommendation
- Checklist Update Recommendation
- Schema Update Recommendation
- Manifest Update Recommendation
- Knowledge Sync Recommendation
- Do Not Sync Items
- Blocking Issues
- Next Step

## Stop Conditions

Stop instead of writing definitive sync recommendations when:

- Classified test feedback artifact is missing.
- Feedback classification is unresolved.
- Specification Missing lacks a Re-Gate path.
- Requirement Change lacks a change-control decision.
- Proposed sync item is unverified or based only on failed behavior.
- Long-term knowledge target cannot be determined.
