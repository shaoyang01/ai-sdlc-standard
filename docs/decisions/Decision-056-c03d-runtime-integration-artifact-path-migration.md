# Decision-056：C03-D Runtime Integration & Artifact Path Migration 授权（Current User 裁决）

## 状态

DRAFT（2026-08-26，草案待审；Current User 裁决接受后成为正式授权）

## 背景

C03-A/B/C 于 2026-08-26 全部收口（PR #106/#108/#109 merge）。C03-C 实现了 c1（development_path_entry 守卫）、c2（documentation_governance_tail_completion 检查）、c3（manual handoff 清单聚合）三个纯函数契约（core/loop-c03-delivery-tail.ts，39 断言全绿），并完成了 runtime 消费面切换（agent-skill-registry / FLOW_DEFINITIONS / metadata inventory 统一 7+1）。

但 c1/c2/c3 三个纯函数**尚未接入 runtime 调度路径**：
- c1 守卫未在 runtime implementation 节点前被调用——runtime 可在 solution-gate FAIL/BLOCKED_UNKNOWN 时仍进入 implementation，违反 Decision-044「solution-gate 深度裁决是进入 implementation 路径的唯一权威」；
- c2/c3 未在 runtime chain 完成后被调用——runtime 不生成 delivery-checkpoint tail_completed phase、governance-tail-result artifact、manual handoff checklist，C03 完成合同要求的 `READY_FOR_MANUAL_GIT_HANDOFF` 或诚实阻塞结果无法产出。

同时，Decision-055（制品目录编号权威）裁决 WP3.5 单轨新编号（00-需求资料～06-知识同步）为唯一权威，但 `core/loop-governance-tail-result.ts:178-180` 的制品目录常量仍为 legacy 旧编号（03-实现记录/04-代码审核/05-测试验收），与合同/注册面/c2 常量不一致，迁移列为后续包输入。

## 问题

C03-C 完成了 c1/c2/c3 纯函数契约实现，但 runtime 调度路径未接入这些函数——治理尾部的守卫和交接清单无法在真实 runtime 执行中生效。同时制品路径常量未迁移到 WP3.5 权威编号，runtime 生成的制品路径与合同描述分叉。

## 决策（待 Current User 裁决）

1. **授权 C03-D 实施**：`C03_D_RUNTIME_INTEGRATION_ARTIFACT_PATH_MIGRATION` 授权成立，范围＝C03-D 规划 §6 d1～d4。
2. **d1 c1 守卫接入 runtime implementation 前置**：runtime.ts chain 执行循环中，当 nextExecutionPoint.capability === "implementation" 时，在 entry.execute 之前调用 developmentPathEntryGuard；allowed=false 时 chain_status=BLOCKED、blocking_reason_code=DEVELOPMENT_PATH_ENTRY_DENIED、不执行 implementation；allowed=true 时 depth 通过 request metadata 注入 implementation 执行上下文。
3. **d2 c2/c3 接入 runtime chain 完成后尾部处理**：runtime.ts chain 完成后（completedOk=true），调用 checkDocumentationGovernanceTailCompletion 检查七节点 artifact 齐备性，调用 buildManualHandoffChecklist 生成交接清单；结果写入 delivery-checkpoint（tail_completed phase）和 governance-tail-result artifact；c3 READY 时 checkpoint 自动推进到 completed；RuntimeResult 扩展 delivery_checkpoint_artifact_ref / manual_handoff_status / manual_handoff_reason 字段。
4. **d3 制品路径常量迁移**：core/loop-governance-tail-result.ts:178-180 常量从 legacy 旧编号（03-实现记录/04-代码审核/05-测试验收）改为 WP3.5 新编号（03-任务规划/04-实现记录/05-代码审核/06-知识同步）；添加 LEGACY_DIR_ALIASES 向后兼容读取（新路径不存在时回退旧路径）；新写入必须使用新路径；对应测试同步更新。
5. **d4 集成测试补充**：c1 接入集成测试（5+ 场景）、c2/c3 接入集成测试（5+ 场景）、制品路径迁移向后兼容测试；全量回归测试确保 1767+ 断言无新增失败。
6. **待裁决点采纳建议**：Q1=A（c1 blocked 时 chain_status=BLOCKED）、Q2=A（c3 READY 时 checkpoint 自动推进 completed）、Q3=A（LEGACY_DIR_ALIASES 向后兼容读取，不提供迁移脚本）、Q4=A（depth 通过 request metadata 注入，不修改 entry 接口）。
7. **明确不做**：不修改 C02 runtime 编排语义（chain 结构/节点顺序/双角色门/resume lease/recovery）；不修改 C03-A/B/C 已收口面（manifest/registry/known-skills/skills、c1/c2/c3 纯函数逻辑、agent-skill-registry/FLOW_DEFINITIONS/metadata inventory）；不修改 delivery-tail/generation/CAS 底座（INV9）；不做 C05 真实验收；不做真实 Agent/Git/发布；不修改注册面/合同/skill-contracts；不提供制品自动迁移脚本；不修改 LoopCapabilityEntry 接口签名。

## 原因

c1/c2/c3 纯函数契约在 C03-C 已实现并通过独立复审，但未接入 runtime 调度路径意味着这些函数在真实执行中不生效——治理尾部的守卫和交接清单形同虚设。制品路径常量迁移是 Decision-055 的明确裁决项，不迁移会导致 runtime 生成的制品路径与合同/注册面/c2 常量分叉，C05 真实验收时会发现"代码写的目录和合同对不上"。两项合并为 C03-D 一个工作包，因为 d2（c2/c3 接入）依赖 d3（制品路径迁移）的常量一致性，且都属于 runtime 调度路径的接入层改动。

## 影响

- runtime 在 implementation 节点前执行 c1 守卫，solution-gate 未通过时诚实阻塞，不再静默进入 implementation；
- runtime chain 完成后执行 c2/c3，生成 delivery-checkpoint tail_completed phase、governance-tail-result artifact、manual handoff checklist，C03 完成合同的 READY_FOR_MANUAL_GIT_HANDOFF 可产出；
- 制品路径常量与 WP3.5 权威编号一致，runtime 生成的制品路径与合同/注册面/c2 常量对齐；
- 已有 on-disk 制品通过 LEGACY_DIR_ALIASES 向后兼容读取，不破坏；
- 新增 c1/c2/c3 集成测试（10+ 场景），全量测试无回归；
- C03-D 不改变 C02/C03-A/B/C 收口登记；C05 验收仍需单独授权。

## 实现状态

授权待 Current User 裁决。裁决接受后按既定节奏：单独分支（feature/c03-d-runtime-integration）、Draft PR、独立完整复审、Current User 收口裁决。

## 依据

- [C03-D 规划](LOOP-CORE-C03-D-PLAN.md) rev 0.1.0 §5 不变量、§6 实施方案、§7 验收映射、§8 风险、§9 待裁决点；
- Decision-044（单轨重基线，solution-gate 深度裁决是进入 implementation 唯一权威）；
- Decision-045（能力映射冻结）；
- Decision-050（C03 规划接受）；
- Decision-054（C03-C 授权与收口，c1/c2/c3 纯函数契约已实现）；
- Decision-055（制品目录编号权威，WP3.5 单轨方案，legacy runtime 编号迁移列为后续包输入）；
- C03-C Round 1 复审 PASS（无阻塞项，O-b 观察项指出制品编号双轨漂移）；
- WP3.5 影响分析 §6 编号表。
