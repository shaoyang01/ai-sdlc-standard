# sdlc-knowledge-sync Skill Contract

## Metadata

```yaml
name: sdlc-knowledge-sync
version: 0.1.0
category: Sync Skill
stage: Knowledge Sync
standard_package: ai-sdlc-standard
status: active
input_artifacts:
  - LOOP runtime recovery-context pinned inputs（当前有效上游产物）
output_artifacts:
  - .specify/business_domain/ 及声明知识目标
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
  - facts are unverified or unresolved```
```

## Responsibilities

知识同步器：把稳定可复用事实写入长期知识目标，并对代码/文档/知识做一致性对账。


## Core Rules

1. Consume current code state, approved artifacts, implementation evidence, classified feedback, and declared knowledge targets.
2. Single-rail reconciliation baseline: library 工件 + LOOP artifact revision 为唯一对账基准（单轨模式，无多源模式开关）。
3. Sync only stable reusable facts; never sync raw chat, temp debugging notes, speculative design, unverified findings, or unresolved risks.
4. Require explicit target path and sync authorization before modifying `.specify/business_domain/**`。
5. Preserve existing knowledge structure, terminology, ownership; uncertain items stay `待确认同步项`。
6. Classify inconsistencies before recommending changes; route violations to earliest affected node via runtime Re-Gate, verified-but-missing facts to sync.
7. Default read-only audit; do not modify production code.
8. Do not overwrite classified feedback results; use `ai-sdlc/change-control.md` for Specification Missing / Review Missing / Requirement Change.


## Capability Source Trace（Decision-045 冻结映射）

| 来源旧包 | 吸收位置 |
| --- | --- |
| `sdlc-speckit-sync` | 本包 Core Rules 全量吸收 |
| `sdlc-speckit-code-doc-reconcile` | 本包 Core Rules 全量吸收 |
| `sdlc-test-feedback-sync` | 本包 Core Rules 全量吸收 |

