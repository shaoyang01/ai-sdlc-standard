# Skill Registry

> 本文件用于登记接入 AI SDLC Standard 的 Skill。第一阶段只登记，不要求立刻改造所有 Skill。

## Registered Skills

### html-doc-style

```yaml
name: html-doc-style
category: Renderer Skill
stage: Specification Writing / Report Rendering
status: proposed
required_schema:
  - ess/specification-schema.md
  - ess/review-schema.md
  - ess/code-review-schema.md
side_effects:
  - write document file
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - missing required schema sections
  - rendering would remove semantic content
```

### karpathy-guidelines

```yaml
name: karpathy-guidelines
category: Behavioral Guideline
stage: All implementation and review stages
status: proposed
required_schema: []
required_checklist:
  - checklists/implementation-checklist.md
side_effects: []
can_modify_code: false
can_modify_docs: false
can_modify_knowledge_base: false
can_execute_commands: false
blocking_conditions:
  - unclear assumptions
  - multiple reasonable interpretations without user confirmation
```

### speckit-pipeline-confirmed-single

```yaml
name: speckit-pipeline-confirmed-single
category: Workflow Skill
stage: Full lifecycle
status: proposed
required_schema:
  - ess/specification-schema.md
  - ess/review-schema.md
  - ess/test-feedback-schema.md
required_checklist:
  - checklists/specification-checklist.md
  - checklists/plan-checklist.md
  - checklists/task-checklist.md
  - checklists/implementation-checklist.md
side_effects:
  - create or update specs
  - modify code during implement stage
  - update business knowledge during sync stage
can_modify_code: true
can_modify_docs: true
can_modify_knowledge_base: true
can_execute_commands: true
blocking_conditions:
  - any Critical gate issue
  - user refuses phase transition
  - implementation requires undefined business behavior
```

## Pending Detailed Contracts

- speckit-specify
- speckit-clarify
- speckit-plan
- speckit-tasks
- speckit-analyze
- speckit-implement
- speckit-sync
- speckit-code-doc-reconcile

