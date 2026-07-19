# Current Status

> 角色：本文件是 canonical human-readable current repository status/index（仓库当前人类可读状态/索引）。
> 优先级：Git commit/tree/diff、可执行测试、PR 事实和 CI 是实现事实权威；它们在任何冲突中都优先于本文件，本文件永远不覆盖代码、测试、PR 或 CI。

## 基线

- Repository：`shaoyang01/ai-sdlc-standard`
- Fact branch：`feature/loop-runtime-v1`
- As-of source commit：`721fd120d3ace9335cb010a48275ace0e2253c57`（取代上一固定基线 `07c5d26cc9d11a010cb183934950cdb13cb58d42`）
- 本文件描述的实现事实均以上述固定 source commit 核对，不引用任何未来任务 commit 或 merge commit。

## 本次变更边界

本次为 authority-only 文档/元数据收敛，不改变 Runtime、Gateway、Graph、routing、feature flags、adapters 或任何执行行为。

## 产品面

仓库包含两个并列产品面：

- **Standard Package**：治理文档、模板、skills 和 validators；canonical entrypoints 为 `README.md`、`manifest.yaml`、`ROADMAP.md`、`PORTABILITY.md`、`AI_CHANGE_GUARDRAILS.md`。
- **Runtime**：确定性 TypeScript graph 解释器；入口为 `package.json`、`runtime.ts`、`demo.ts`，以及 `core/`、`execution/`、`sdlc_graph/`、`tests/` 和 CI。

## Runtime 当前形态

- 当前 Graph 固定为六个节点：`requirement-summary`、`tech-design`、`solution-challenge`、`review`、`implementation`、`validation`。
- 执行边界为 shadow-first / default-off：所有真实执行都是 feature-flagged、opt-in。
- Codex 真实执行保持 feature-flagged，且仅限 `code_generation`。
- Kimi 真实 Gateway dispatch 保持 feature-flagged，且仅限 `llm_task`。
- Hermes 保持 default-off、sidecar-bounded，范围为 `review` / `code_review` / `validation`；不拥有 Gateway primary/final result，也不拥有 Runtime `final_status` 或 routing。
- Controlled Rollout Plan 仅以 plan-only 静态材料形式存在（见下节）；没有已执行的 operator action 或 rollout execution。

## Controlled Rollout Plan 状态

固定事实基线 `721fd120d3ace9335cb010a48275ace0e2253c57` 下最终计划文件尚不存在；本变更在合并后创建该 plan-only 静态材料；PR 未合并前不得把 plan_exists 当作事实分支状态。

    controlled_rollout_plan_exists_after_this_change_merges: true
    controlled_rollout_plan_status: plan_only
    implementation_authorization_scope: plan_material_only
    operator_action_authorization: not_granted
    rollout_authorization: not_granted
    operator_action_executed: false
    rollout_executed: false
    initial_rollout_request_type: code_review
    phase_request_caps: 1/5/1/5
    evidence_mode: manual_sanitized_summary_only
    next_governance_decision: separate_operator_action_authorization

- 本 PR 只增加静态计划材料；plan exists 不代表 approved operator action、feature enablement 或 rollout。
- 三个 Hermes flags 保持默认关闭。
- 不改变 Runtime、Gateway、Graph、routing、ownership 或执行行为。
- 计划合并后仍需单独的 operator action 授权；本次直接执行授权只授权 plan material implementation，不授权后续 operator action 或 rollout。

## Skill inventory

- `metadata/capabilities/shared/existing-skills-inventory.json`
- `metadata/capabilities/shared/skill-flow-inventory.json`

## 状态材料地图

| 材料 | 角色 |
| --- | --- |
| `docs/REPOSITORY-STRUCTURE.md` | 仓库结构权威地图与 layered status authority 模型 |
| `runtime-capabilities.json` | `canonical_machine_runtime_capability_registry`（tests/tooling 专用） |
| `system-capability-review.json` | `scoped_system_capability_evidence_review_dataset` |
| `real-agent-adapter-capability-matrix.json` | `scoped_adapter_request_type_evidence_matrix` |
| `metadata/capabilities/**` | scoped family contracts/evidence，非 global project status |
| `SYSTEM_STATUS.md` / `SYSTEM_CAPABILITY_REVIEW.md` | historical, non-authoritative snapshots |
| `scripts/validate-capability-metadata-chain.rb` | metadata-chain validator，已在 ci-standards 中启用 |

## 更新规则

- 人类当前状态：只更新本文件；实现事实变化时必须以当时的 Git commit 为准重新核对。
- 机器 registry：`runtime-capabilities.json` 只服务 tests/tooling，不描述 global project status。
- scoped evidence：`system-capability-review.json` 与 `real-agent-adapter-capability-matrix.json` 只在其声明范围内更新。
- 历史快照：`SYSTEM_STATUS.md`、`SYSTEM_CAPABILITY_REVIEW.md` 不刷新为当前状态。

## 权威边界

    planning_authority: false
    authorization_authority: false
    operator_authority: false
    rollout_authority: false
    publication_authority: false

- `recommended_next_pr` 字段不决定 Project Controller sequencing，也不授权 execution、merge、enablement、operator action、rollout 或 publication；它们只是 compatibility references。
- 计划、授权、operator、rollout、publication 与 Project Controller 排序权威不属于任何 root JSON 文件。
