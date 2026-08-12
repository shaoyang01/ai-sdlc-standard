# sdlc-solution-challenger Skill Contract

## Metadata

```yaml
name: sdlc-solution-challenger
version: 0.1.0
category: Auditor Skill
stage: Specification Challenge / Pre-Gate Review
standard_package: ai-sdlc-standard
status: active
input_artifacts:
  - library/{requirement_id}/01-技术方案/*
  - library/{requirement_id}/00-需求资料/*
  - optional manifest
  - optional previous challenge report
output_artifacts:
  - library/{requirement_id}/01-技术方案/{requirement_id}_方案挑战报告.md
  - manifest.md activity log update recommendation
required_schema:
  - ess/specification-schema.md
required_checklist:
  - checklists/specification-checklist.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/artifact-versioning.md
  - ai-sdlc/artifact-flow.md
  - ai-sdlc/change-control.md
side_effects:
  - write challenge report when explicitly asked to produce output
  - recommend manifest.md updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: false
blocking_conditions:
  - missing technical specification
  - unreadable required artifact
  - requirement scope indeterminable
  - current delivery goal completely indeterminable
  - original flow impact unidentifiable
  - any key finding requires guessing business rules
```

## Responsibilities

`sdlc-solution-challenger` 在 `sdlc-specification-writer` 生成技术方案之后、`sdlc-solution-reviewer` 正式 Gate 审核之前，对技术方案进行有边界的对抗式审视。

它负责：

- 在不扩展需求范围、不提前建设系统终局能力的前提下，主动发现当前技术方案中会阻碍本阶段正确交付的细节遗漏。
- 按当前交付阶段审方案，而不是按系统最终形态审方案。
- 检查隐藏假设、遗漏分支、失败场景、一致性问题、边界条件、方案中未写清楚的细节。
- 为每条 finding 提供 scope_basis、phase_relevance、minimum_sufficient_fix 和 required_resolution。
- 挑战主流程和一级恢复策略；对恢复机制本身的失败只要求可观测性、ownership、告警和人工兜底。
- 按根因合并 findings，遵守数量限制。
- 输出 `NEEDS_REVISION` 或 `READY_FOR_GATE`，推动方案达到最小充分、可进入正式 Gate 的状态。

它不负责：

- 编写或重写技术方案。
- 做出正式 Gate 决策（PASS / FAIL / PASS_WITH_RISK）。
- 决定开发路径（DIRECT_IMPLEMENTATION / SPECKIT_PIPELINE_REQUIRED / BLOCKED_NEEDS_REVISION）。
- 扩展产品范围或引入新业务目标、新用户场景、新功能。
- 修改业务代码。
- 代替 `sdlc-solution-reviewer` 做正式审核。
- 将不确定业务规则写成确定事实。
- 为未来不确定需求提前建设架构。

### Goal-Anchored Global Reasoning Contract

绑定 `ai-sdlc/goal-anchored-global-reasoning.md`（GRP-01 shared reference），保留既有 scope/phase firewall、existing-mechanism 与 minimum-sufficient 规则：

- 扫描 global-before-local：先枚举当前 goal 的 applicable material surfaces，再逐项扫描；
- 每个 material finding 关闭直接 impact（caller/callee 或 dependency、consumer、state/data、failure/compatibility、verification）；
- findings 按 root cause 收敛（consolidation），同一根因不重复计数；
- fail-worthy finding 后继续剩余可靠 bounded surfaces；不 fail-fast on the first finding；
- 不引入第二套 reasoning 协议，不改变 Gate 决策语义。

## Input Contract

必需输入：

- `library/{requirement_id}/01-技术方案/*`
- `library/{requirement_id}/00-需求资料/*`

可选输入：

- `manifest`
- 原流程文档、接口定义、数据模型、相关代码上下文
- 历史技术方案、上一轮 challenge report
- 已确认的一期/当前阶段范围、用户明确延期的能力列表

缺失输入处理：

- 技术方案缺失或不可读时停止。
- 需求范围无法确定时停止。
- 当前交付目标完全无法判断时：停止，返回 missing-input diagnostics，不输出 NEEDS_REVISION / READY_FOR_GATE，不继续完整挑战扫描。
- 阶段边界信息不完整但当前交付目标仍然可识别时：继续 INITIAL_CHALLENGE，输出 PHASE_BOUNDARY_MISSING finding，标记不确定项为 UNKNOWN_PHASE，不发明阶段边界。
- 原流程影响无法识别时停止。
- 任何关键 finding 需要猜测业务规则时停止。

不得自行补写技术方案。

## Output Contract

### Artifact Versioning Contract

Any DocFlow requirement artifact produced or updated by this skill must follow
`ai-sdlc/artifact-versioning.md`:

- use the stable path recorded in manifest, not a filename-versioned path;
- include Metadata `Version` and `Status`;
- include `## 修订记录`;
- keep the body to current effective content only;
- recommend manifest updates with stable path, internal version, and status.

挑战报告必须输出到：

```text
library/{requirement_id}/01-技术方案/{requirement_id}_方案挑战报告.md
```

输出结构必须包含：

- `requirement_id`
- `reviewed_artifact`
- `mode` (INITIAL_CHALLENGE / FOLLOW_UP_VERIFICATION)
- `challenge_context` (current_phase, phase_goal, must_have, phase_constraints, explicitly_deferred, future_direction)
- `scope_boundary` (reviewed_in_scope, explicitly_not_reviewed)
- `challenge_result` (status, blocking_count, required_count, non_blocking_count, out_of_scope_count)
- `challenge_cycle` (current_cycle, max_cycles: 2, exhausted)
- `phase_complexity_assessment` (current_design, proposed_revision_delta, exceeds_phase_budget)
- `findings[]` — 每条包含 id, necessity, category, severity, phase_relevance, scope_basis, existing_mechanism_verification (BLOCKING/REQUIRED 必填；NON_BLOCKING 可选；OUT_OF_SCOPE 不需要), blocking_counter_evidence (仅 BLOCKING 必填，每字段必须明确判断), target_section, issue, impact, challenge_question, minimum_sufficient_fix, required_resolution, complexity_impact, phase_value, blocking
- `accepted_phase_constraints[]`
- `future_phase_observations[]` (最多 5 条)
- `out_of_scope_observations[]` (最多 3 条)
- `sections_requiring_revision[]`
- `closed_previous_findings[]` (仅 FOLLOW_UP_VERIFICATION 模式)
- `remaining_previous_findings[]` (仅 FOLLOW_UP_VERIFICATION 模式)
- `recommended_next_step` (RETURN_TO_SPECIFICATION_WRITER / PROCEED_TO_SOLUTION_REVIEWER / ESCALATE_TO_SOLUTION_REVIEWER)

状态规则：

```
存在 BLOCKING 或 REQUIRED → NEEDS_REVISION
只剩 NON_BLOCKING 和 OUT_OF_SCOPE → READY_FOR_GATE
```

OUT_OF_SCOPE 和 FUTURE_PHASE 永远不能阻塞 READY_FOR_GATE。

### existing_mechanism_verification 适用规则

```text
- BLOCKING / REQUIRED: 必填。必须在分类前完成全文已有机制搜索。
- NON_BLOCKING: 可选。
- OUT_OF_SCOPE: 不需要。
- mechanism_found = true 且 sufficient_for_current_phase = true
  → 该 concern 不得保持 BLOCKING 或 REQUIRED。
```

### blocking_counter_evidence 适用规则

```text
- 仅 BLOCKING 必填。
- 每字段必须包含明确判断（true/false），不得留空。
- 所有条件成立时才能标为 BLOCKING。
```

## Side Effects

允许：

- 写入挑战报告产物。
- 输出 `manifest.md` 更新建议。

禁止：

- 修改业务代码。
- 修改技术方案。
- 输出 PASS / FAIL / PASS_WITH_RISK Gate 结论。
- 决定 DIRECT_IMPLEMENTATION / SPECKIT_PIPELINE_REQUIRED。
- 为了通过而省略已发现的 blocking 问题。

## Blocking Conditions

必须停止的情况：

- 技术方案不存在或无法读取。
- 需求目标或范围无法判断。
- 当前交付目标完全无法判断（完全 indeterminable，非仅阶段边界不完整）。
- 原流程影响无法识别。
- 关键异常、失败降级、幂等、事务、状态流转或测试策略缺失且无法从现有材料中判断。
- 需要猜测业务规则才能完成挑战。

## Gate Requirements

前置 Gate：

- `01-技术方案` 必须存在（由 `sdlc-specification-writer` 生成）。
- `00-需求资料` 应可用。

后置 Gate：

- `NEEDS_REVISION` → 回到 `sdlc-specification-writer` 修订技术方案。
- `READY_FOR_GATE` → 进入 `sdlc-solution-reviewer` 正式 Gate 审核。
- 未经 `sdlc-solution-challenger` 或等效审视，不建议直接进入正式 Gate。

## Relationship With Other Skills

### sdlc-specification-writer

`sdlc-specification-writer` 生成技术方案，`sdlc-solution-challenger` 对其进行对抗式审视。如果结果为 `NEEDS_REVISION`，方案需要回到 `sdlc-specification-writer` 修订。

### sdlc-solution-reviewer

`sdlc-solution-reviewer` 是正式 Gate。`sdlc-solution-challenger` 是正式 Gate 之前的预审。当 `sdlc-solution-challenger` 输出 `READY_FOR_GATE` 时，方案进入 `sdlc-solution-reviewer`。

两个 skill 的区别：
- `sdlc-solution-challenger` 只输出 NEEDS_REVISION / READY_FOR_GATE，不做正式 Gate 决策。
- `sdlc-solution-reviewer` 输出 PASS / FAIL / PASS_WITH_RISK，并决定 DIRECT_IMPLEMENTATION / SPECKIT_PIPELINE_REQUIRED / BLOCKED_NEEDS_REVISION。

### sdlc-speckit-pipeline

`sdlc-solution-challenger` 不决定是否进入 Speckit。这个决定由 `sdlc-solution-reviewer` 在正式 Gate 审核中做出。

## Manifest Update Recommendation

挑战完成后，建议更新：

- Activity Log: 挑战完成及状态
- Missing Artifacts: 如果挑战报告缺失
- Next Step: 根据 recommended_next_step

如果结果是 `NEEDS_REVISION`：
- Current Stage: `01-技术方案`
- Next Step: 修订技术方案后重新挑战

如果结果是 `READY_FOR_GATE`：
- Next Step: 进入 `sdlc-solution-reviewer` 正式 Gate 审核
