# Skill Registry

> 本文件用于登记接入 AI SDLC Standard 的 Skill。第一阶段只登记，不要求立刻改造所有 Skill。

## Registered Skills

### sdlc-docflow-writer

```yaml
name: sdlc-docflow-writer
category: Producer Skill / Renderer Skill / Publisher Skill
stage: DocFlow artifact generation
status: active
skill_path:
  - skills/sdlc-docflow-writer/SKILL.md
contract:
  - skill-contracts/known-skills/sdlc-docflow-writer.md
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

### sdlc-requirement-normalizer

```yaml
name: sdlc-requirement-normalizer
category: Intake Skill / Producer Skill
stage: Requirement Intake / Requirement Normalization
status: active
skill_path:
  - skills/sdlc-requirement-normalizer/SKILL.md
contract:
  - skill-contracts/known-skills/sdlc-requirement-normalizer.md
references:
  - skills/sdlc-requirement-normalizer/references/intake-workflow.md
  - skills/sdlc-requirement-normalizer/references/source-handling.md
  - skills/sdlc-requirement-normalizer/references/conflict-and-blocking.md
  - skills/sdlc-requirement-normalizer/references/output-artifact.md
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
  - first stable input for sdlc-specification-writer
  - does not write technical specifications
```

### sdlc-solution-reviewer

```yaml
name: sdlc-solution-reviewer
category: Auditor Skill
stage: Specification Audit / Development Path Routing
status: active
skill_path:
  - skills/sdlc-solution-reviewer/SKILL.md
contract:
  - skill-contracts/known-skills/sdlc-solution-reviewer.md
references:
  - skills/sdlc-solution-reviewer/references/review-workflow.md
  - skills/sdlc-solution-reviewer/references/development-path-decision.md
  - skills/sdlc-solution-reviewer/references/checklist.md
  - skills/sdlc-solution-reviewer/references/output-report.md
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
  - optionally call sdlc-docflow-writer for output routing when explicitly requested
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
  - not owned by sdlc-speckit-pipeline
```

### sdlc-specification-writer

```yaml
name: sdlc-specification-writer
category: Producer Skill
stage: Specification Writing
status: active
skill_path:
  - skills/sdlc-specification-writer/SKILL.md
contract:
  - skill-contracts/known-skills/sdlc-specification-writer.md
references:
  - skills/sdlc-specification-writer/references/writing-workflow.md
  - skills/sdlc-specification-writer/references/schema-mapping.md
  - skills/sdlc-specification-writer/references/blocking-rules.md
  - skills/sdlc-specification-writer/references/output-artifact.md
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
  - optionally call sdlc-docflow-writer for output routing when explicitly requested
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
  - output can be reused by sdlc-speckit-specify when full SDD is required
```

### sdlc-gate-runner

```yaml
name: sdlc-gate-runner
category: Auditor Skill
stage: All Gates
status: active
skill_path:
  - skills/sdlc-gate-runner/SKILL.md
contract:
  - skill-contracts/known-skills/sdlc-gate-runner.md
references:
  - skills/sdlc-gate-runner/references/gate-workflow.md
  - skills/sdlc-gate-runner/references/gate-matrix.md
  - skills/sdlc-gate-runner/references/risk-and-regate.md
  - skills/sdlc-gate-runner/references/output-report.md
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
  - does not replace specialized reviewers such as sdlc-solution-reviewer
```

### sdlc-implementation-recorder

```yaml
name: sdlc-implementation-recorder
category: Producer Skill
stage: Implementation Recording
status: active
skill_path:
  - skills/sdlc-implementation-recorder/SKILL.md
contract:
  - skill-contracts/known-skills/sdlc-implementation-recorder.md
references:
  - skills/sdlc-implementation-recorder/references/recording-workflow.md
  - skills/sdlc-implementation-recorder/references/evidence-sources.md
  - skills/sdlc-implementation-recorder/references/deviation-and-blocking.md
  - skills/sdlc-implementation-recorder/references/output-artifact.md
required_schema:
  - ai-sdlc/artifact-flow.md
required_checklist:
  - checklists/implementation-checklist.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - write library/{requirement_id}/03-实现记录 implementation record when requested
  - recommend manifest.md updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - changed file list or diff is missing
  - specification basis is missing for behavior-changing implementation
  - implementation includes undefined business behavior
  - required verification is missing or failed
notes:
  - factual handoff from implementation to code review
  - does not modify production code
  - does not replace sdlc-code-review-normalizer
```

### sdlc-test-feedback-classifier

```yaml
name: sdlc-test-feedback-classifier
category: Reviewer Skill / Producer Skill
stage: Test Feedback Classification
status: active
skill_path:
  - skills/sdlc-test-feedback-classifier/SKILL.md
contract:
  - skill-contracts/known-skills/sdlc-test-feedback-classifier.md
references:
  - skills/sdlc-test-feedback-classifier/references/classification-workflow.md
  - skills/sdlc-test-feedback-classifier/references/classification-rules.md
  - skills/sdlc-test-feedback-classifier/references/evidence-and-blocking.md
  - skills/sdlc-test-feedback-classifier/references/output-artifact.md
required_schema:
  - ess/test-feedback-schema.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - write library/{requirement_id}/05-测试验收 classified feedback artifact when requested
  - recommend manifest.md updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - raw feedback is missing
  - reproduction or observed behavior is missing for failed cases
  - failure cannot be classified
  - requirement change has no change-control decision
notes:
  - classifies feedback before fixes or sync
  - does not modify code
  - sdlc-test-feedback-sync handles later checklist/schema/knowledge sync
```

### sdlc-code-review-excellence

```yaml
name: sdlc-code-review-excellence
category: Reviewer Skill / Auditor Skill
stage: Code Review Execution
status: active
skill_path:
  - skills/sdlc-code-review-excellence/SKILL.md
contract:
  - skill-contracts/known-skills/sdlc-code-review-excellence.md
references:
  - skills/sdlc-code-review-excellence/references/review-inputs.md
  - skills/sdlc-code-review-excellence/references/review-workflow.md
  - skills/sdlc-code-review-excellence/references/finding-standards.md
  - skills/sdlc-code-review-excellence/references/blocking-and-regate.md
  - skills/sdlc-code-review-excellence/references/output-and-handoff.md
required_schema:
  - ess/code-review-schema.md
required_checklist:
  - checklists/code-review-checklist.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - produce code review result
  - recommend fixes, Re-Gate, normalization, and manifest updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - reviewed diff or changed file list is missing
  - specification basis is missing for behavior-changing code
  - implementation evidence contradicts code diff
  - Critical or unaccepted High issue exists
  - suggested fix would expand approved scope
notes:
  - executes standards-based code review
  - hands formal report writing to sdlc-code-review-normalizer
  - does not fix code
```

### sdlc-code-review-normalizer

```yaml
name: sdlc-code-review-normalizer
category: Reviewer Skill / Producer Skill
stage: Code Review Normalization
status: active
skill_path:
  - skills/sdlc-code-review-normalizer/SKILL.md
contract:
  - skill-contracts/known-skills/sdlc-code-review-normalizer.md
references:
  - skills/sdlc-code-review-normalizer/references/normalization-workflow.md
  - skills/sdlc-code-review-normalizer/references/finding-mapping.md
  - skills/sdlc-code-review-normalizer/references/blocking-and-scope.md
  - skills/sdlc-code-review-normalizer/references/output-artifact.md
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

### sdlc-test-feedback-sync

```yaml
name: sdlc-test-feedback-sync
category: Sync Skill / Producer Skill
stage: Test Feedback Sync / Knowledge Sync
status: active
skill_path:
  - skills/sdlc-test-feedback-sync/SKILL.md
contract:
  - skill-contracts/known-skills/sdlc-test-feedback-sync.md
references:
  - skills/sdlc-test-feedback-sync/references/sync-workflow.md
  - skills/sdlc-test-feedback-sync/references/classification-routing.md
  - skills/sdlc-test-feedback-sync/references/sync-boundaries.md
  - skills/sdlc-test-feedback-sync/references/output-report.md
required_schema:
  - ess/test-feedback-schema.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - recommend checklist, schema, or manifest updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - classified test feedback artifact is missing
  - feedback classification is unresolved
  - specification missing is detected but no re-gate path is recorded
  - requirement change is detected but no change-control decision exists
notes:
  - consumes sdlc-test-feedback-classifier output
  - handles checklist, schema, manifest, and later sync recommendations
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
  - DocFlow artifact routing uses sdlc-docflow-writer
  - this entry remains only as a legacy HTML visual style reference
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

### sdlc-speckit-pipeline

```yaml
name: sdlc-speckit-pipeline
category: Workflow Skill
stage: Full lifecycle
status: active
skill_path:
  - skills/sdlc-speckit-pipeline/SKILL.md
contract:
  - skill-contracts/known-skills/sdlc-speckit-pipeline.md
references:
  - skills/sdlc-speckit-pipeline/references/activation-and-inputs.md
  - skills/sdlc-speckit-pipeline/references/stage-sequence.md
  - skills/sdlc-speckit-pipeline/references/gate-and-regate.md
  - skills/sdlc-speckit-pipeline/references/side-effect-boundaries.md
  - skills/sdlc-speckit-pipeline/references/output-and-manifest.md
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
  - optional full SDD path after sdlc-solution-reviewer
  - not the default path for every requirement
  - orchestrates child sdlc-speckit-* skills without replacing their contracts
```

### sdlc-speckit-checklist

```yaml
name: sdlc-speckit-checklist
category: Producer Skill / Auditor Skill
stage: Speckit Checklist / Stage-Specific Inspection
status: active
skill_path:
  - skills/sdlc-speckit-checklist/SKILL.md
contract:
  - skill-contracts/known-skills/sdlc-speckit-checklist.md
references:
  - skills/sdlc-speckit-checklist/references/checklist-inputs.md
  - skills/sdlc-speckit-checklist/references/item-generation-rules.md
  - skills/sdlc-speckit-checklist/references/staleness-and-regate.md
  - skills/sdlc-speckit-checklist/references/output-targets.md
  - skills/sdlc-speckit-checklist/references/output-and-manifest.md
required_checklist:
  - checklists/specification-checklist.md
  - checklists/plan-checklist.md
  - checklists/task-checklist.md
  - checklists/implementation-checklist.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - create or update requirement-specific checklist when requested
  - validate existing checklist
  - recommend manifest.md Activity Log or Re-Gate updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - target checklist stage is unclear
  - required source artifacts are missing or superseded
  - checklist item would introduce new business behavior
  - existing checklist conflicts with current approved artifacts
  - checklist generation would replace Gate, Analyze, Review, or Test Acceptance
notes:
  - produces requirement-specific checklist material
  - does not decide Gate pass or fail
  - does not directly modify shared checklists
```

### sdlc-speckit-specify

```yaml
name: sdlc-speckit-specify
category: Producer Skill
stage: Speckit Specify / Spec Sync
status: active
skill_path:
  - skills/sdlc-speckit-specify/SKILL.md
contract:
  - skill-contracts/known-skills/sdlc-speckit-specify.md
references:
  - skills/sdlc-speckit-specify/references/docflow-inputs.md
  - skills/sdlc-speckit-specify/references/spec-sync-mapping.md
  - skills/sdlc-speckit-specify/references/blocking-and-regate.md
  - skills/sdlc-speckit-specify/references/output-and-manifest.md
required_schema:
  - ess/specification-schema.md
required_checklist:
  - checklists/specification-checklist.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - create or update specs/**
  - optionally create feature branch when executing the SDD workflow script
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
  - consumes sdlc-specification-writer output
  - syncs reviewed DocFlow specification into specs/spec.md
  - does not reinterpret approved requirements
```

### sdlc-speckit-clarify

```yaml
name: sdlc-speckit-clarify
category: Auditor Skill / Producer Skill
stage: Residual Clarification Validation
status: active
skill_path:
  - skills/sdlc-speckit-clarify/SKILL.md
contract:
  - skill-contracts/known-skills/sdlc-speckit-clarify.md
references:
  - skills/sdlc-speckit-clarify/references/clarification-scope.md
  - skills/sdlc-speckit-clarify/references/coverage-check.md
  - skills/sdlc-speckit-clarify/references/regate-routing.md
  - skills/sdlc-speckit-clarify/references/output-and-manifest.md
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

### sdlc-speckit-plan

```yaml
name: sdlc-speckit-plan
category: Producer Skill / Auditor Skill
stage: Speckit Plan / Plan Gate
status: active
skill_path:
  - skills/sdlc-speckit-plan/SKILL.md
contract:
  - skill-contracts/known-skills/sdlc-speckit-plan.md
references:
  - skills/sdlc-speckit-plan/references/plan-inputs.md
  - skills/sdlc-speckit-plan/references/planning-scope.md
  - skills/sdlc-speckit-plan/references/plan-gate-check.md
  - skills/sdlc-speckit-plan/references/output-and-manifest.md
required_schema:
  - ess/specification-schema.md
required_checklist:
  - checklists/plan-checklist.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - create or update specs/{feature}/plan.md
  - recommend manifest.md Activity Log or Re-Gate updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - sdlc-speckit-clarify has unresolved blocking ambiguity
  - plan would change approved scope or behavior
  - plan requires undefined business behavior
  - plan cannot support acceptance criteria
notes:
  - consumes sdlc-speckit-clarify output
  - creates or validates specs plan.md only
  - does not generate tasks or modify code
```

### sdlc-speckit-tasks

```yaml
name: sdlc-speckit-tasks
category: Producer Skill / Auditor Skill
stage: Speckit Tasks / Task Gate
status: active
skill_path:
  - skills/sdlc-speckit-tasks/SKILL.md
contract:
  - skill-contracts/known-skills/sdlc-speckit-tasks.md
references:
  - skills/sdlc-speckit-tasks/references/task-inputs.md
  - skills/sdlc-speckit-tasks/references/task-scope.md
  - skills/sdlc-speckit-tasks/references/task-gate-check.md
  - skills/sdlc-speckit-tasks/references/output-and-manifest.md
required_schema:
  - ess/specification-schema.md
required_checklist:
  - checklists/task-checklist.md
  - checklists/plan-checklist.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - create or update specs/{feature}/tasks.md
  - recommend manifest.md Activity Log or Re-Gate updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - sdlc-speckit-plan has unresolved blocking item
  - tasks would change approved scope, plan, or behavior
  - tasks require undefined business or technical behavior
  - tasks cannot support acceptance criteria or verification
notes:
  - consumes sdlc-speckit-plan output
  - creates or validates specs tasks.md only
  - does not modify plan or production code
```

### sdlc-speckit-analyze

```yaml
name: sdlc-speckit-analyze
category: Auditor Skill
stage: Speckit Analyze / Implementation Readiness Gate
status: active
skill_path:
  - skills/sdlc-speckit-analyze/SKILL.md
contract:
  - skill-contracts/known-skills/sdlc-speckit-analyze.md
references:
  - skills/sdlc-speckit-analyze/references/analyze-inputs.md
  - skills/sdlc-speckit-analyze/references/consistency-scope.md
  - skills/sdlc-speckit-analyze/references/analyze-gate-check.md
  - skills/sdlc-speckit-analyze/references/output-and-manifest.md
required_schema:
  - ess/specification-schema.md
required_checklist:
  - checklists/specification-checklist.md
  - checklists/plan-checklist.md
  - checklists/task-checklist.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - produce consistency report
  - recommend manifest.md Activity Log or Re-Gate updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - spec, plan, tasks, or DocFlow artifacts conflict
  - required artifact is missing or superseded
  - task requires undefined business or technical behavior
  - implementation readiness cannot be established
notes:
  - consumes sdlc-speckit-tasks output
  - audits DocFlow, spec, plan, and tasks consistency
  - does not modify artifacts or production code
```

### sdlc-speckit-implement

```yaml
name: sdlc-speckit-implement
category: Executor Skill / Producer Skill
stage: Speckit Implement / Implementation Execution
status: active
skill_path:
  - skills/sdlc-speckit-implement/SKILL.md
contract:
  - skill-contracts/known-skills/sdlc-speckit-implement.md
references:
  - skills/sdlc-speckit-implement/references/implementation-inputs.md
  - skills/sdlc-speckit-implement/references/execution-boundaries.md
  - skills/sdlc-speckit-implement/references/verification-and-recording.md
  - skills/sdlc-speckit-implement/references/blocking-and-regate.md
  - skills/sdlc-speckit-implement/references/output-and-manifest.md
required_checklist:
  - checklists/implementation-checklist.md
  - checklists/task-checklist.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - modify production code for approved tasks
  - add or update tests for approved tasks
  - update specs/{feature}/tasks.md status when verified
  - produce or recommend implementation record
  - recommend manifest.md Activity Log or Re-Gate updates
can_modify_code: true
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - sdlc-speckit-analyze has unresolved blocking item
  - implementation would exceed approved tasks
  - implementation requires undefined business behavior
  - verification fails or cannot be defined
notes:
  - consumes sdlc-speckit-analyze output
  - modifies code only for approved tasks
  - hands implementation evidence to sdlc-implementation-recorder
```

### sdlc-speckit-sync

```yaml
name: sdlc-speckit-sync
category: Sync Skill / Producer Skill
stage: Speckit Sync / Knowledge Sync
status: active
skill_path:
  - skills/sdlc-speckit-sync/SKILL.md
contract:
  - skill-contracts/known-skills/sdlc-speckit-sync.md
references:
  - skills/sdlc-speckit-sync/references/sync-inputs.md
  - skills/sdlc-speckit-sync/references/sync-targets.md
  - skills/sdlc-speckit-sync/references/fact-eligibility.md
  - skills/sdlc-speckit-sync/references/conflict-and-blocking.md
  - skills/sdlc-speckit-sync/references/output-and-manifest.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
required_contract:
  - skill-contracts/sync-skill-contract.md
side_effects:
  - update authorized knowledge targets
  - recommend checklist, schema, or manifest updates
  - recommend Re-Gate or reconcile actions
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: true
can_execute_commands: true
blocking_conditions:
  - implementation is unverified
  - target path or ownership is unclear
  - user did not authorize writing to target
  - proposed fact is unstable, one-off, or contradicted
notes:
  - consumes verified implementation evidence
  - syncs only stable reusable facts
  - does not use chat fragments as long-term facts
```

### sdlc-speckit-code-doc-reconcile

```yaml
name: sdlc-speckit-code-doc-reconcile
category: Auditor Skill / Sync Skill
stage: Speckit Reconcile / Code Documentation Consistency
status: active
skill_path:
  - skills/sdlc-speckit-code-doc-reconcile/SKILL.md
contract:
  - skill-contracts/known-skills/sdlc-speckit-code-doc-reconcile.md
references:
  - skills/sdlc-speckit-code-doc-reconcile/references/reconcile-inputs.md
  - skills/sdlc-speckit-code-doc-reconcile/references/drift-categories.md
  - skills/sdlc-speckit-code-doc-reconcile/references/audit-workflow.md
  - skills/sdlc-speckit-code-doc-reconcile/references/apply-boundaries.md
  - skills/sdlc-speckit-code-doc-reconcile/references/output-and-manifest.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
required_contract:
  - skill-contracts/auditor-skill-contract.md
  - skill-contracts/sync-skill-contract.md
side_effects:
  - produce reconciliation report
  - recommend manifest, Re-Gate, sync, or record updates
  - optionally prepare authorized documentation or knowledge update proposals
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: true
can_execute_commands: true
blocking_conditions:
  - requirement or feature scope is unclear
  - required artifacts are missing or superseded
  - current source of truth conflicts across approved artifacts
  - code behavior cannot be inspected
  - drift correction would require production code changes
  - user did not authorize document or knowledge writes
notes:
  - default behavior is read-only reconciliation
  - routes code drift to sdlc-speckit-implement
  - routes knowledge drift to sdlc-speckit-sync
```

## Pending Detailed Contracts

- none
