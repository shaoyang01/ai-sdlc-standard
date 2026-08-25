# sdlc-solution-gate Skill Contract

## Metadata

```yaml
name: sdlc-solution-gate
version: 0.1.0
category: Auditor Skill / Reviewer Skill
stage: per LOOP-CORE-C03-PLAN §6 C03-A
standard_package: ai-sdlc-standard
status: active
input_artifacts:
  - LOOP runtime recovery-context pinned inputs（当前有效上游产物）
output_artifacts:
  - library/{requirement_id}/02-方案审核/
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

## Responsibilities

方案门禁：adversarial_scan 角色产出 Finding Ledger 式对抗扫描；formal_verdict 角色做出 PASS/FAIL/PASS_WITH_RISK 与深度档位裁决。两角色必须由不同 Agent binding 承载。


## Core Rules

1. Review/challenge only the approved In Scope and decisions already introduced by the specification.
2. Judge against the declared current delivery phase, not the system's ideal final form.
3. Do not introduce new business goals, user scenarios, product capabilities, or platform initiatives.
4. Every BLOCKING **or REQUIRED** finding must cite a scope basis; search the full specification for an existing or equivalent mechanism before raising BLOCKING or REQUIRED（行为等价即可满足，机制名缺失不构成 BLOCKING 或 REQUIRED）。严重度阶梯与三条闭合析取支见 `references/sdlc-solution-challenger/finding-classification.md`。
5. adversarial_scan role：只产出对抗扫描发现（Finding Ledger 内容），不做裁决。
6. formal_verdict role：只消费本轮 scan 的 Ledger 做裁决并输出深度档位（LIGHT/STANDARD/DEEP）；两角色由不同 Agent binding 承载，禁止同一执行者合并执行。
7. Do not write or rewrite the specification; do not modify production code.
8. Treat `library/{requirement_id}/01-技术方案/` as the primary input; write under `library/{requirement_id}/02-方案审核/`。
9. Residual clarification 只能追溯到已批准 DocFlow 产物或显式用户确认；触及 Scope/state/data/failure/compatibility/acceptance 时停止并回流 solution-design。
10. Gate 推进与 generation 权威属于 LOOP runtime；本 Skill 不推进任何流程。

## Dual-Role Firewall

`sdlc-solution-gate` 的两个执行角色由 LOOP runtime 的 BindingRegistry 强制分离：
adversarial_scan（对抗扫描/Finding Ledger 产出）与 formal_verdict（裁决与深度档位）
必须绑定到不同 Agent。本合同禁止任何单一执行者同时承担两角色的输出。


## Capability Source Trace（Decision-045 冻结映射）

| 来源旧包 | 吸收落点 |
| --- | --- |
| `sdlc-solution-challenger` | Core Rules 全部条款吸收至本包 Core Rules 清单；references 迁移件 5 个文件见 `references/sdlc-solution-challenger/` |
| `sdlc-solution-reviewer` | Core Rules 全部条款吸收至本包 Core Rules 清单；references 迁移件 4 个文件见 `references/sdlc-solution-reviewer/` |
| `sdlc-speckit-clarify` | Core Rules 全部条款吸收至本包 Core Rules 清单；references 迁移件 4 个文件见 `references/sdlc-speckit-clarify/` |
