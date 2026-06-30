# Skill Registry

> 本文件用于登记接入 AI SDLC Standard 的 Skill。第一阶段只登记，不要求立刻改造所有 Skill。

## Registered Skills

### docflow-writer

```yaml
name: docflow-writer
category: Producer Skill / Renderer Skill / Publisher Skill
stage: DocFlow artifact generation
status: active
skill_path:
  - skills/docflow-writer/SKILL.md
contract:
  - skill-contracts/known-skills/docflow-writer.md
required_schema:
  - ess/specification-schema.md
  - ess/review-schema.md
  - ess/code-review-schema.md
  - ess/test-feedback-schema.md
required_storage:
  - ai-sdlc/artifact-storage.md
side_effects:
  - create library/{requirement_id}/ directories
  - write Markdown or HTML files
  - update manifest.md
  - create or update Lark/Feishu documents through lark-cli
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - output format cannot be inferred
  - artifact node cannot be inferred
  - requirement_id cannot be safely generated
  - Lark/Feishu authorization is missing or expired
  - required schema sections would be omitted
  - Lark/Feishu update mode is unspecified
```

### requirement-normalizer

```yaml
name: requirement-normalizer
category: Intake Skill / Producer Skill
stage: Requirement Intake / Requirement Normalization
status: active
skill_path:
  - skills/requirement-normalizer/SKILL.md
contract:
  - skill-contracts/known-skills/requirement-normalizer.md
references:
  - skills/requirement-normalizer/references/intake-workflow.md
  - skills/requirement-normalizer/references/source-handling.md
  - skills/requirement-normalizer/references/conflict-and-blocking.md
  - skills/requirement-normalizer/references/output-artifact.md
required_schema:
  - ai-sdlc/artifact-flow.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - write library/{requirement_id}/00-需求资料 normalized requirement artifact when requested
  - recommend manifest.md updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - requirement source is missing or unreadable
  - business goal cannot be identified
  - conflicting sources have no priority
  - required attachment or context is missing
notes:
  - first stable input for specification-writer
  - does not write technical specifications
```

### solution-reviewer

```yaml
name: solution-reviewer
category: Auditor Skill
stage: Specification Audit / Development Path Routing
status: active
skill_path:
  - skills/solution-reviewer/SKILL.md
contract:
  - skill-contracts/known-skills/solution-reviewer.md
references:
  - skills/solution-reviewer/references/review-workflow.md
  - skills/solution-reviewer/references/development-path-decision.md
  - skills/solution-reviewer/references/checklist.md
  - skills/solution-reviewer/references/output-report.md
required_schema:
  - ess/specification-schema.md
  - ess/review-schema.md
required_checklist:
  - checklists/specification-checklist.md
required_templates:
  - templates/gate-result-template.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - write library/{requirement_id}/02-方案审核 review artifact when requested
  - recommend manifest.md updates
  - optionally call docflow-writer for output routing when explicitly requested
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - technical specification is missing or unreadable
  - requirement boundary cannot be determined
  - implementation would require undefined business behavior
  - critical or unaccepted high risk exists
  - PASS_WITH_RISK lacks risk acceptance
development_path_recommendations:
  - DIRECT_IMPLEMENTATION
  - SPECKIT_PIPELINE_REQUIRED
  - BLOCKED_NEEDS_REVISION
notes:
  - global DocFlow gate before implementation path selection
  - not owned by speckit-pipeline-confirmed-single
```

### specification-writer

```yaml
name: specification-writer
category: Producer Skill
stage: Specification Writing
status: active
skill_path:
  - skills/specification-writer/SKILL.md
contract:
  - skill-contracts/known-skills/specification-writer.md
references:
  - skills/specification-writer/references/writing-workflow.md
  - skills/specification-writer/references/schema-mapping.md
  - skills/specification-writer/references/blocking-rules.md
  - skills/specification-writer/references/output-artifact.md
required_schema:
  - ess/specification-schema.md
required_checklist:
  - checklists/specification-checklist.md
required_templates:
  - templates/technical-specification-template.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - write library/{requirement_id}/01-技术方案 technical specification when requested
  - recommend manifest.md updates
  - optionally call docflow-writer for output routing when explicitly requested
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - missing requirement source
  - unclear business goal
  - unclear in-scope or out-of-scope boundary
  - multiple reasonable business interpretations
  - required behavior would need to be guessed
notes:
  - general specification producer outside Speckit
  - output can be specification fact for lightweight requirements
  - output can be reused by speckit-specify when full SDD is required
```

### gate-runner

```yaml
name: gate-runner
category: Auditor Skill
stage: All Gates
status: active
skill_path:
  - skills/gate-runner/SKILL.md
contract:
  - skill-contracts/known-skills/gate-runner.md
references:
  - skills/gate-runner/references/gate-workflow.md
  - skills/gate-runner/references/gate-matrix.md
  - skills/gate-runner/references/risk-and-regate.md
  - skills/gate-runner/references/output-report.md
required_schema:
  - templates/gate-result-template.md
required_storage:
  - ai-sdlc/phase-gates.md
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - write gate result report when requested
  - recommend manifest.md updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - manifest is missing or unreadable
  - required artifact is missing
  - gate result cannot be determined
  - PASS_WITH_RISK lacks risk acceptance
notes:
  - generic gate checker
  - does not replace specialized reviewers such as solution-reviewer
```

### code-review-normalizer

```yaml
name: code-review-normalizer
category: Reviewer Skill / Producer Skill
stage: Code Review Normalization
status: proposed
planned_skill_path:
  - skills/code-review-normalizer/SKILL.md
contract:
  - skill-contracts/known-skills/code-review-normalizer.md
required_schema:
  - ess/code-review-schema.md
required_checklist:
  - checklists/code-review-checklist.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - write library/{requirement_id}/04-代码审核 normalized review artifact when requested
  - recommend manifest.md updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - review report is missing
  - code diff or changed file list is missing
  - behavioral finding lacks specification basis
  - finding cannot be mapped to file, line, or symbol
notes:
  - normalizes DeepSeek, Codex, human, or other review reports
  - does not fix code
```

### test-feedback-sync

```yaml
name: test-feedback-sync
category: Sync Skill / Producer Skill
stage: Test Feedback Classification / Knowledge Sync
status: proposed
planned_skill_path:
  - skills/test-feedback-sync/SKILL.md
contract:
  - skill-contracts/known-skills/test-feedback-sync.md
required_schema:
  - ess/test-feedback-schema.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - write library/{requirement_id}/05-测试验收 structured feedback artifact when requested
  - recommend checklist, schema, or manifest updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - raw feedback is missing
  - failure cannot be classified
  - specification missing is detected but no re-gate path is recorded
  - requirement change is detected but no change-control decision exists
notes:
  - classifies test and acceptance feedback
  - routes specification missing and requirement change back to upstream gates
```

### html-doc-style

```yaml
name: html-doc-style
category: Renderer Skill
stage: Specification Writing / Report Rendering
status: legacy
required_schema:
  - ess/specification-schema.md
  - ess/review-schema.md
  - ess/code-review-schema.md
required_storage:
  - ai-sdlc/artifact-storage.md
side_effects:
  - write document file
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - missing required schema sections
  - rendering would remove semantic content
  - target requirement directory cannot be determined
notes:
  - superseded by docflow-writer for DocFlow artifact routing
  - may remain as a legacy HTML visual style reference
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
skill_reference:
  - speckit-pipeline-confirmed-single
contract:
  - skill-contracts/known-skills/speckit-pipeline-confirmed-single.md
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
  - solution review is missing or failed
  - development path recommendation is BLOCKED_NEEDS_REVISION
  - development path recommendation is DIRECT_IMPLEMENTATION without explicit user request for full SDD
  - any Critical gate issue
  - user refuses phase transition
  - implementation requires undefined business behavior
notes:
  - optional full SDD path after solution-reviewer
  - not the default path for every requirement
```

### speckit-specify

```yaml
name: speckit-specify
category: Producer Skill
stage: Speckit Specify / Spec Sync
status: proposed
skill_reference:
  - speckit-specify
contract:
  - skill-contracts/known-skills/speckit-specify.md
required_schema:
  - ess/specification-schema.md
required_checklist:
  - checklists/specification-checklist.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - create or update specs/**
  - optionally create feature branch when executing the underlying Speckit script
  - recommend manifest.md Activity Log updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - solution review is missing or failed
  - development path is not SPECKIT_PIPELINE_REQUIRED without explicit user request for full SDD
  - technical specification has unresolved core ambiguity
  - sync to specs/spec.md would require reinterpreting business scope
notes:
  - consumes specification-writer output
  - syncs reviewed DocFlow specification into specs/spec.md
  - does not reinterpret approved requirements
```

### speckit-clarify

```yaml
name: speckit-clarify
category: Auditor Skill / Producer Skill
stage: Residual Clarification Validation
status: proposed
skill_reference:
  - speckit-clarify
contract:
  - skill-contracts/known-skills/speckit-clarify.md
required_schema:
  - ess/specification-schema.md
required_checklist:
  - checklists/specification-checklist.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - update specs/{feature}/spec.md after accepted clarification
  - recommend manifest.md Activity Log or Re-Gate updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - core business ambiguity remains after solution review
  - clarification would change approved scope
  - answer requires user or business confirmation but is unavailable
  - clarification contradicts approved technical specification
notes:
  - validates residual ambiguity only
  - returns to 01-技术方案 / 02-方案审核 for core requirement gaps
  - does not expand scope inside the Speckit pipeline
```

## Pending Detailed Contracts

- speckit-plan
- speckit-tasks
- speckit-analyze
- speckit-implement
- speckit-sync
- speckit-code-doc-reconcile
