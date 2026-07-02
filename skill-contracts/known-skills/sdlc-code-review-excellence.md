# sdlc-code-review-excellence Skill Contract

## Metadata

```yaml
name: sdlc-code-review-excellence
version: 0.1.0
category: Reviewer Skill / Auditor Skill
stage: Code Review Execution
standard_package: ai-sdlc-standard
status: active
input_artifacts:
  - code diff, commit range, PR, or changed file list
  - library/{requirement_id}/01-技术方案/*
  - optional library/{requirement_id}/02-方案审核/*
  - optional library/{requirement_id}/03-实现记录/*
  - optional specs/{feature}/spec.md
  - optional specs/{feature}/plan.md
  - optional specs/{feature}/tasks.md
  - optional verification evidence
  - optional library/{requirement_id}/manifest.md
output_artifacts:
  - code review result
  - findings grouped by severity
  - normalizer handoff recommendation
  - manifest.md Code Review Gate update recommendation
required_schema:
  - ess/code-review-schema.md
required_checklist:
  - checklists/code-review-checklist.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/artifact-versioning.md
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
```

## Responsibilities

`sdlc-code-review-excellence` 是代码审查执行阶段的标准 Skill。

它负责：

- 基于已批准方案、spec、plan、tasks、实现记录和 diff 审查代码。
- 发现正确性、兼容性、数据一致性、事务、幂等、异常、安全、性能、可维护性和测试缺口问题。
- 为每个问题输出 Severity、File、Line or Symbol、Specification Basis、Impact、Suggested Fix 和 Blocking。
- 判断代码审查结果：`PASS`、`FAIL` 或 `PASS_WITH_RISK`。
- 将需要落盘或归一化的结果交给 `sdlc-code-review-normalizer`。
- 输出 Re-Gate、修复、manifest 和后续验证建议。

它不负责：

- 修改生产代码。
- 修复审查发现的问题。
- 将多来源 Review 归一成 `04-代码审核` DocFlow artifact。
- 替代 `sdlc-code-review-normalizer`。
- 替代测试验收。
- 新增业务范围或技术方案。
- 直接修改共享 checklist、schema 或知识库。

## Input Contract

必需输入：

- 代码 diff、commit range、PR 或变更文件列表。
- `library/{requirement_id}/01-技术方案/*` 或当前 `specs/{feature}/spec.md`。

建议输入：

- `library/{requirement_id}/02-方案审核/*`
- `library/{requirement_id}/03-实现记录/*`
- `specs/{feature}/plan.md`
- `specs/{feature}/tasks.md`
- 验证命令和结果。
- `library/{requirement_id}/manifest.md`
- Re-Gate Records。
- Replaced Artifact Paths。
- 已接受风险记录。

前置条件：

- 实现已完成或已有可审查 diff。
- 行为变更有规格依据。
- 当前 source artifacts 未被 stale。
- Review 范围明确。

缺失输入处理：

- 缺少 diff 或变更文件列表时停止。
- 缺少实现记录时可以审查 diff，但必须标记实现记录缺口。
- 缺少验证证据时可继续审查，并按影响标记 Test Gap。
- 行为变更缺少规格依据时，不得给出通过结论。

## Output Contract

### Artifact Versioning Contract

Any DocFlow requirement artifact produced or updated by this skill must follow
`ai-sdlc/artifact-versioning.md`:

- use the stable path recorded in manifest, not a filename-versioned path;
- include Metadata `Version` and `Status`;
- include `## 修订记录`;
- keep the body to current effective content only;
- recommend manifest updates with stable path, internal version, and status;
- include `Reviewed Artifact` and `Reviewed Artifact Version` for Gate,
  review, sync, and reconcile artifacts, plus `Gate Artifact Version` when
  the artifact is itself a Gate result.

输出必须覆盖：

- Source Artifacts。
- Reviewed Scope。
- Review Result。
- Findings By Severity。
- Missing Information。
- Re-Gate Recommendation。
- Suggested Fixes。
- Normalizer Handoff。
- Manifest Update Recommendation。
- Next Step。

每个 actionable finding 必须包含：

- ID。
- Severity。
- Category。
- File。
- Line or Symbol。
- Specification Basis。
- Problem。
- Impact。
- Suggested Fix。
- Blocking。

允许的结果：

- `PASS`
- `FAIL`
- `PASS_WITH_RISK`
- `BLOCKED_MISSING_INPUT`

## Side Effects

允许：

- 读取代码 diff、变更文件、spec、plan、tasks、实现记录和验证证据。
- 执行非破坏性检查命令以理解代码或验证审查判断。
- 输出代码审查结果。
- 建议调用 `sdlc-code-review-normalizer` 写入 `04-代码审核`。
- 建议创建 Re-Gate Records 或 manifest Code Review Gate 更新。

禁止：

- 修改生产代码。
- 修改技术方案、实现记录或代码审核报告。
- 修改 `.specify/business_domain/**`。
- 直接修改共享 `checklists/*.md` 或 `ess/*.md`。
- 自动接受风险。
- 把无规格依据的建议变成必须实现项。

## Blocking Conditions

必须停止或输出不通过的情况：

- diff、commit range、PR 或变更文件列表缺失。
- 行为类审查缺少 Specification Basis。
- 源产物之间存在无法判断的冲突。
- 代码违反已批准行为、兼容性、数据一致性、事务、幂等、异常或安全要求。
- 存在 Critical 问题。
- High 问题缺少明确风险接受。
- Suggested Fix 会引入方案外行为。
- Review 需要猜测业务行为。

## Gate Requirements

前置 Gate：

- 实现已完成，或用户明确要求审查当前 diff。
- `01-技术方案` 或 `specs/{feature}/spec.md` 应存在。
- `03-实现记录` 建议存在；缺失时必须标记。

后置 Gate：

- `PASS` 可进入测试验收或后续发布准备。
- `PASS_WITH_RISK` 必须记录 Accepted Risk、Accepted By、Accepted At、Accepted Reason、Accepted Scope、Follow-up Required、Follow-up Owner。
- `FAIL` 必须回到实现修复或最早受影响 Gate。
- 正式 DocFlow 报告应交给 `sdlc-code-review-normalizer`。
- Review Missing 或通用审查规则缺口应交给 `sdlc-test-feedback-sync` 或标准治理流程。
