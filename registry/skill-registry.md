# Skill Registry

> 本文件登记接入 AI SDLC（LOOP-CORE-03，Decision-045 收敛）的 7+1 拓扑 Skill。
> 七个 canonical 节点 Skill + 一个 non-node utility skill（sdlc-docflow-writer）。
> 公开注册面 = 本文件 + manifest.yaml + skill-contracts/known-skills/；三者由 validate-skill-contracts.rb 强制一致。
> 旧二十包（speckit-*、gate-runner 等）已于 C03-B 原子 cutover 移除（INV8）；历史文档提及属档案。

## Registered Skills

### sdlc-code-review

```yaml
name: sdlc-code-review
category: Reviewer Skill
stage: per LOOP-CORE-C03-PLAN §6 C03-A
status: active
skill_path:
  - skills/sdlc-code-review/SKILL.md
contract:
  - skill-contracts/known-skills/sdlc-code-review.md
required_schema:
  - ai-sdlc/node-capability-contract.md
side_effects:
  - write designated node output artifacts when explicitly dispatched
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: false
blocking_conditions:
  - a finding lacks file location and specification basis (recorded as Missing Information)
  - referenced approved artifacts are stale
```

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

### sdlc-implementation

```yaml
name: sdlc-implementation
category: Executor Skill / Producer Skill
stage: per LOOP-CORE-C03-PLAN §6 C03-A
status: active
skill_path:
  - skills/sdlc-implementation/SKILL.md
contract:
  - skill-contracts/known-skills/sdlc-implementation.md
required_schema:
  - ai-sdlc/node-capability-contract.md
side_effects:
  - write designated node output artifacts when explicitly dispatched
can_modify_code: true
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - implementation requires undefined behavior or unapproved scope change
  - verification evidence is missing (recorded as 验证缺口)
```

### sdlc-knowledge-sync

```yaml
name: sdlc-knowledge-sync
category: Sync Skill
stage: per LOOP-CORE-C03-PLAN §6 C03-A
status: active
skill_path:
  - skills/sdlc-knowledge-sync/SKILL.md
contract:
  - skill-contracts/known-skills/sdlc-knowledge-sync.md
required_schema:
  - ai-sdlc/node-capability-contract.md
side_effects:
  - write designated node output artifacts when explicitly dispatched
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: true
can_execute_commands: false
blocking_conditions:
  - sync target path lacks explicit authorization
  - facts are unverified or unresolved (kept as 待确认同步项)
```

### sdlc-requirement-intake

```yaml
name: sdlc-requirement-intake
category: Intake Skill / Producer Skill
stage: per LOOP-CORE-C03-PLAN §6 C03-A
status: active
skill_path:
  - skills/sdlc-requirement-intake/SKILL.md
contract:
  - skill-contracts/known-skills/sdlc-requirement-intake.md
required_schema:
  - ai-sdlc/node-capability-contract.md
side_effects:
  - write designated node output artifacts when explicitly dispatched
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: false
blocking_conditions:
  - generation-skipping or conflicting change records are rejected
  - required source is missing or unreadable
```

### sdlc-solution-design

```yaml
name: sdlc-solution-design
category: Producer Skill
stage: per LOOP-CORE-C03-PLAN §6 C03-A
status: active
skill_path:
  - skills/sdlc-solution-design/SKILL.md
contract:
  - skill-contracts/known-skills/sdlc-solution-design.md
required_schema:
  - ai-sdlc/node-capability-contract.md
side_effects:
  - write designated node output artifacts when explicitly dispatched
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: false
blocking_conditions:
  - runtime inputs are missing or not the pinned recovery context
  - drafting requires undefined behavior or unapproved scope change
```

### sdlc-solution-gate

```yaml
name: sdlc-solution-gate
category: Auditor Skill / Reviewer Skill
stage: per LOOP-CORE-C03-PLAN §6 C03-A
status: active
skill_path:
  - skills/sdlc-solution-gate/SKILL.md
contract:
  - skill-contracts/known-skills/sdlc-solution-gate.md
required_schema:
  - ai-sdlc/node-capability-contract.md
side_effects:
  - write designated node output artifacts when explicitly dispatched
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: false
blocking_conditions:
  - this round's scan Finding Ledger is missing
  - both gate roles would resolve to the same Agent binding
```

### sdlc-task-planning

```yaml
name: sdlc-task-planning
category: Producer Skill
stage: per LOOP-CORE-C03-PLAN §6 C03-A
status: active
skill_path:
  - skills/sdlc-task-planning/SKILL.md
contract:
  - skill-contracts/known-skills/sdlc-task-planning.md
required_schema:
  - ai-sdlc/node-capability-contract.md
side_effects:
  - write designated node output artifacts when explicitly dispatched
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: false
blocking_conditions:
  - task breakdown requires scope/plan/compatibility/rollback changes (route back to solution-design)
  - approved upstream artifacts are stale or inconsistent
```
