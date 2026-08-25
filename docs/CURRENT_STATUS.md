# Current Status

> 角色：本文件是 canonical human-readable current repository status/index（仓库当前人类可读状态/索引）。
> 优先级：Git commit/tree/diff、可执行测试、PR 事实和 CI 是实现事实权威；它们在任何冲突中都优先于本文件，本文件永远不覆盖代码、测试、PR 或 CI。

> **时效提示（2026-08-26 补充）**：本文件是 Document Governance 阶段边界处的冻结快照（snapshot_mode 见下），由 `scripts/validate-capability-metadata-chain.rb` 钉住，不随 LOOP-CORE 程序推进自动更新。其 A/B 两节描述的是该阶段边界的事实，**不代表当前项目状态**。当前项目状态（LOOP-CORE-02 已完成、LOOP-CORE-03 进行中）的权威来源是：`ai-project-control-plane` 的 STATE、`docs/decisions/` 决策索引、以及 `docs/AI-SDLC-Autonomous-Delivery-Roadmap.md`（LOOP Core 规划面）。

## 基线

- Repository：`shaoyang01/ai-sdlc-standard`
- Fact branch：`feature/loop-runtime-v1`
- As-of source commit：`05b064dcce688f0d7f8dbf41f049052534faab54`

    snapshot_mode: stage_boundary_reviewed_snapshot
    update_every_commit: false

- 本文件是在阶段边界经 review 的固定快照，不要求每个 commit 自动更新。
- 仅在重要 implementation batch、阶段切换、进入 closure 前或 live assertion 被 Git 事实超越时才更新。
- 每次更新必须重新核对当时的实际事实 HEAD，并同步 metadata-chain validator 的 expected baseline。
- validator 不访问网络，也不查询浮动 branch；本文件不引用任何未来任务 commit 或未来 merge commit。

## 产品面

仓库包含两个并列产品面：

- **Standard Package**：治理文档、模板、skills 和 validators；canonical entrypoints 为 `README.md`、`manifest.yaml`、`ROADMAP.md`、`PORTABILITY.md`、`AI_CHANGE_GUARDRAILS.md`。
- **Runtime**：确定性 TypeScript graph 解释器；入口为 `package.json`、`runtime.ts`、`demo.ts`，以及 `core/`、`execution/`、`sdlc_graph/`、`tests/` 和 CI。

## A. Source implementation facts

以下为本仓库的 Source 代码实现事实，以上述固定 source commit 核对：

1. Repository：`shaoyang01/ai-sdlc-standard`；sole fact branch：`feature/loop-runtime-v1`。
2. Graph 仍为六节点：`requirement-summary`、`tech-design`、`solution-challenge`、`review`、`implementation`、`validation`。
3. Runtime/Gateway 继续保持 shadow-first、default-off、feature-flagged 边界；所有真实执行都是 feature-flagged、opt-in。
4. Codex 真实执行仅限其当前已实现和已验证的请求类型边界（feature-flagged，限 `code_generation`）。
5. Kimi 真实 Gateway dispatch 继续保持其当前请求类型和 feature flag 边界（feature-flagged，限 `llm_task`）。
6. Hermes 保持 default-off、sidecar-bounded，范围为 `review` / `code_review` / `validation`；旧 Hermes Phase-2 shadow sidecar 与新 code-review canary 是不同实现路径。
7. PR #31：plan-only Controlled Rollout Plan 已进入事实分支。
8. PR #32：Task A structured approval gate 已进入事实分支。
9. PR #33：Task B fixed synthetic payload、dedicated executor、POSIX process runner 已进入事实分支。
10. PR #34：Task C isolated process-local session entry 已进入事实分支。
11. PR #35：Consolidation 与 accepted root classification 已进入事实分支。
12. Tasks A/B/C 是 isolated supporting capabilities，不是 Gateway 或 Runtime 的自动执行路径；Gateway primary/final result、Runtime `final_status` 和 routing 未被新 canary 接管。
13. 已批准 capability migration batches 已完成；当前没有 Document Governance closure 前必须执行的新 capability migration。
14. Accepted root classification 已记录于 `docs/CAPABILITY-REFERENCE-MATRIX.md`。
15. 七份 root archive reference notes 继续保留；不存在自动删除授权。
16. External Risk 继续为 `unknown`；`unknown` 已被项目总控接受为 Document Governance closure 的非阻塞残余风险。
17. `SYSTEM_STATUS.md` 与 `SYSTEM_CAPABILITY_REVIEW.md` 是 historical, non-authoritative snapshots。
18. `docs/CURRENT_STATUS.md` 不覆盖 Git/tests/PR/CI。

    controlled_rollout_plan_exists: true
    controlled_rollout_plan_status: plan_only
    operator_action_authorization: not_granted
    rollout_authorization: not_granted
    operator_action_executed: false
    task_c_gateway_wiring: false
    task_c_runtime_wiring: false
    real_canary_executed: false
    rollout_executed: false
    phase_3_executed: false
    new_capability_migration_required_for_closure: false
    external_consumer_risk: unknown

本部分不得宣称：Hermes Phase 2 整体 ready；Task D 已完成；fake preflight 已执行；real canary 已批准；rollout 已批准；Document Governance 已关闭；项目主线已恢复；external compatibility 已解决；compatibility notes 可以删除。

## B. Project Controller governance state — not implementation fact

    topic_09_status: frozen
    task_d_status: hold
    document_governance_stage_closed: false
    project_mainline_return_status: pending_document_governance_closure

- 这些是 Project Controller 当前治理决定，不是 Source 代码实现事实，也不是永久 capability 状态。
- Topic 04 closure 不自动解冻 Topic 09。
- Roadmap 后续优先级必须由 Project Controller 在 closure 后单独决定。

## Skill inventory

- `metadata/capabilities/shared/existing-skills-inventory.json`
- `metadata/capabilities/shared/skill-flow-inventory.json`

## 状态材料地图

| 材料 | 角色 |
| --- | --- |
| `docs/REPOSITORY-STRUCTURE.md` | 仓库结构权威地图与 layered status authority 模型 |
| `docs/CAPABILITY-REFERENCE-MATRIX.md` | capability path 与 migration ledger，含 accepted root material classification |
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
