# LOOP-CORE-03-D 有界实施规划（C03-D Runtime Integration & Artifact Path Migration）

> 规划状态：**DRAFT**（2026-08-26，草案待审；Current User 裁决接受后成为正式合同，Decision-056）
> 执行状态：**未授权**
> 日期：2026-08-26
> 上游依据：
> - [C03 规划](LOOP-CORE-C03-PLAN.md) ACCEPTED（Decision-050）
> - [Decision-054] C03-C 授权与收口（c1/c2/c3 纯函数契约已实现，Round 1 PASS）
> - [Decision-055] 制品目录编号权威（WP3.5 单轨方案，legacy runtime 编号迁移列为后续包输入）
> - [WP3.5 影响分析](LOOP-CORE-C02-WP3.5-SINGLE-RAIL-IMPACT-ANALYSIS.md) §6 编号表
> - C03-A/B/C 全部 CLOSED（PR #106/#108/#109 merge）

## 1. 文档定位与授权边界

本文件把 C03-C 已实现的 c1/c2/c3 纯函数契约接入 runtime 调度路径，并完成 Decision-055 裁决的制品路径迁移，分解为一个有界工作包。

本轮（起草轮）仅覆盖：
1. 盘点 c1/c2/c3 当前接入缺口与 runtime 调度路径现状；
2. 形成本草案并登记「草案待审」；
3. 提出待 Current User 裁决的点（§9）。

本轮不授权：任何 runtime 代码改动、制品路径常量修改、delivery-checkpoint 流程改动、测试新增。实施授权需 Current User 单独裁决（Decision-056）。

## 2. 完成合同

- **objective**：将 C03-C 实现的 c1（development_path_entry 守卫）、c2（documentation_governance_tail_completion 检查）、c3（manual handoff 清单聚合）三个纯函数接入 v2 七节点单轨 runtime 调度路径，使 runtime 在进入 implementation 节点前执行 c1 守卫、在 chain 完成后执行 c2/c3 生成 delivery-checkpoint 与 manual handoff 清单；同时完成 Decision-055 裁决的制品目录编号从 legacy 旧编号迁移到 WP3.5 单轨新编号。
- **expected_output**：runtime.ts 在 implementation 节点前调用 c1 守卫（blocked 时 chain 诚实停止）；chain 完成后调用 c2 检查尾部完成度、调用 c3 生成 manual handoff checklist，结果写入 delivery-checkpoint artifact；loop-governance-tail-result.ts 制品目录常量更新为 WP3.5 新编号（03-任务规划/04-实现记录/05-代码审核/06-知识同步），对应测试同步更新；全量测试无回归。
- **completion_contract**：c1 守卫在 implementation 节点前被调用且 blocked 时 chain_status=BLOCKED；c2/c3 在 chain 完成后被调用且结果写入 delivery-checkpoint 的 tail_completed phase；制品路径常量与合同/注册面/c2 常量一致（WP3.5 新编号）；全量测试 1767+ 断言 0 失败；tsc --noEmit clean；三 Ruby validator 全绿。
- **continuity**：C03-D 是 C03-C 纯函数契约的 runtime 接入层，不修改 c1/c2/c3 纯函数逻辑（C03-C 已收口）；不修改 C02 runtime 编排语义（chain 结构、节点顺序、双角色门）；不修改注册面（C03-A/B 已收口）。

## 3. 现状审计（基线：产品仓 a19769a，C03-C merge commit）

### 3.1 c1/c2/c3 纯函数现状（core/loop-c03-delivery-tail.ts，C03-C 已收口）

| 函数 | 输入 | 输出 | 当前调用方 |
| --- | --- | --- | --- |
| `developmentPathEntryGuard(verdict)` | SolutionGateVerdict | {allowed:true,depth} / {allowed:false,blockingFindings} | **无**（纯函数，未接入 runtime） |
| `checkDocumentationGovernanceTailCompletion(evidence)` | NodeEvidenceStatus[] | {complete:true} / {complete:false,missing} | **无**（纯函数，未接入 runtime） |
| `buildManualHandoffChecklist(input)` | 聚合输入对象 | ManualHandoffChecklist（READY/BLOCKED/FAILED） | **无**（纯函数，未接入 runtime） |

测试覆盖：c1 10 场景、c2 5 场景、c3 10 场景，共 39 断言，全绿。

### 3.2 runtime 调度路径现状（runtime.ts，C02-WP3.5-C 已收口）

- v2 七节点单轨链：requirement-intake → solution-design → solution-gate（adversarial_scan + formal_verdict，双 Agent）→ task-planning → implementation → code-review → knowledge-sync
- 主执行函数 `run(requirement, options)`：创建 runStore/artifactStore/gateway/entry，在 `withResumeLease` 中执行 chain
- chain 执行循环：通过 `recovery.nextExecutionPoint` 驱动，每个节点通过 `entry.execute` 执行（LoopCapabilityEntry）
- chain 完成判定：`chainStatus === "COMPLETED" && findingGate.status === "ELIGIBLE" && decision.status === "DECIDED"`
- 完成后返回 RuntimeResult（execution_trace、next_execution_point、chain_status 等），**不调用 c1/c2/c3，不生成 delivery-checkpoint 或 manual handoff**

### 3.3 delivery-checkpoint 现状（core/loop-delivery-checkpoint.ts + store）

- schema：`loop-delivery-checkpoint-v1`
- phase 转换图：fresh → intake_in_progress → design_in_progress → gate_in_progress → planning_in_progress → implementation_in_progress → review_in_progress → sync_in_progress → tail_in_progress → tail_completed → completed/blocked/failed
- 当前 **tail_in_progress → tail_completed 的转换没有调用 c2/c3**，delivery-checkpoint 的 governance_tail_result_artifact_ref 字段为空
- loop-governance-tail-result.ts 定义了 governance tail result artifact，但 **runtime 不生成它**

### 3.4 制品路径常量现状（core/loop-governance-tail-result.ts:178-180）

```typescript
const DIR_03 = "03-实现记录";   // legacy 旧编号
const DIR_04 = "04-代码审核";   // legacy 旧编号
const DIR_05 = "05-测试验收";   // legacy 旧编号
// 缺少 DIR_06（知识同步）
```

与 WP3.5 新编号（合同/注册面/c2 常量已采用）不一致：

| 节点 | WP3.5 新编号（权威） | legacy runtime 旧编号（待迁移） |
| --- | --- | --- |
| 需求资料 | 00-需求资料 | — |
| 技术方案 | 01-技术方案 | — |
| 方案审核 | 02-方案审核 | — |
| 任务规划 | 03-任务规划 | — |
| 实现记录 | 04-实现记录 | 03-实现记录 |
| 代码审核 | 05-代码审核 | 04-代码审核 |
| 知识同步 | 06-知识同步 | 05-测试验收（已废弃节点） |

### 3.5 c1 接入缺口

- runtime 在 chain 执行到 implementation 节点时，**没有调用 c1 守卫检查 solution-gate 裁决**
- 原 gate-runner 的 development_path_entry 特殊 Gate 已随 gate-runner 退役（C03-B），但其承接逻辑（c1 纯函数）未接入 runtime
- 这意味着 runtime 可以在 solution-gate FAIL 或 BLOCKED_UNKNOWN 时仍然进入 implementation 节点——违反 Decision-044「solution-gate 深度裁决是进入 implementation 路径的唯一权威」

### 3.6 c2/c3 接入缺口

- runtime 在 chain 完成后（knowledge-sync 执行完毕），**没有调用 c2 检查文档治理尾部完成度，没有调用 c3 生成 manual handoff checklist**
- delivery-checkpoint 的 tail_completed phase 没有被 runtime 触发
- governance-tail-result artifact 没有被 runtime 生成
- 这意味着 runtime 完成 chain 后只返回 RuntimeResult，不产出 C03 完成合同要求的 `READY_FOR_MANUAL_GIT_HANDOFF` 或诚实阻塞结果

## 4. 缺口

- **G1** c1 守卫未接入 runtime implementation 节点前的调度路径——runtime 可在 solution-gate 未通过时进入 implementation。
- **G2** c2/c3 未接入 runtime chain 完成后的尾部处理——runtime 不生成 delivery-checkpoint tail_completed phase、governance-tail-result artifact、manual handoff checklist。
- **G3** loop-governance-tail-result.ts 制品目录常量仍为 legacy 旧编号，与 WP3.5 权威编号不一致——Decision-055 裁决迁移未落地。
- **G4** 缺少 c1/c2/c3 接入 runtime 的集成测试——当前只有纯函数单元测试，没有端到端验证 runtime 调用路径。

## 5. 设计不变量（Accepted 后成为硬边界）

### INV-D1：c1 守卫是 fail-closed 的 implementation 前置条件

- runtime 在执行 implementation 节点前，必须调用 `developmentPathEntryGuard` 检查 solution-gate 裁决。
- 若 `allowed === false`，chain 必须停止，`chain_status = "BLOCKED"`，`blocking_reason_code = "DEVELOPMENT_PATH_ENTRY_DENIED"`，不进入 implementation 节点。
- 若 `allowed === true`，`depth` 必须传递给 implementation 节点的执行上下文（LIGHT/STANDARD/DEEP 影响实现范围）。
- c1 守卫不修改 solution-gate 裁决本身，只消费它。

### INV-D2：c2/c3 在 chain 完成后触发，不修改 chain 执行逻辑

- c2/c3 只在 `chainStatus === "COMPLETED" && findingGate.status === "ELIGIBLE" && decision.status === "DECIDED"` 时被调用。
- c2 检查七节点 artifact 齐备性，结果写入 delivery-checkpoint 的 `tail_completed` phase。
- c3 聚合 implementation record / code review / knowledge sync / residual risks / recovery instructions，生成 `ManualHandoffChecklist`，写入 governance-tail-result artifact 或 delivery-checkpoint 的 `manual_handoff_checklist_artifact_ref` 字段。
- c2/c3 不回溯修改 chain 执行结果，不重新调度节点。

### INV-D3：制品路径迁移不破坏现有 on-disk 制品读取

- loop-governance-tail-result.ts 常量从 legacy 旧编号改为 WP3.5 新编号。
- 读取已有 on-disk 制品时，必须支持 legacy 旧路径的向后兼容（旧路径别名或迁移逻辑），不得因常量修改导致已有制品读取失败。
- 新生成的制品必须使用 WP3.5 新编号路径。
- 迁移范围仅限 loop-governance-tail-result.ts 及其直接消费者，不修改注册面、合同、c2 常量（已为新编号）。

### INV-D4：不修改 C02 runtime 编排语义

- 不修改 v2 七节点链结构、节点顺序、双角色门（solution-gate adversarial_scan + formal_verdict 不同 Agent）。
- 不修改 LoopCapabilityEntry 的执行逻辑、resume lease、recovery 机制。
- 不修改 runStore/artifactStore 的 schema 和接口。
- c1/c2/c3 接入是在现有调度路径的特定执行点添加调用，不改变调度路径本身。

### INV-D5：不修改 C03-A/B/C 已收口面

- 不修改 manifest/registry/known-skills/skills（C03-A/B 已收口）。
- 不修改 c1/c2/c3 纯函数逻辑（C03-C 已收口）。
- 不修改 agent-skill-registry/FLOW_DEFINITIONS/metadata inventory（C03-C 已收口）。

### INV-D6：Delivery Tail 不变（INV9）

- 不修改 delivery-tail/generation/CAS 底座文件。
- c2/c3 接入复用现有 delivery-checkpoint 和 governance-tail-result 的 schema 和存储机制，不新增第二套打包/存储机制。

## 6. 实施方案

### 6.1 d1：c1 守卫接入 runtime implementation 前置（对应 G1/INV-D1）

**接入点**：runtime.ts chain 执行循环中，当 `recovery.nextExecutionPoint?.capability === "implementation"` 时，在调用 `entry.execute` 之前插入 c1 守卫调用。

**执行逻辑**：
1. 从 `recovery.solutionGateDecision` 读取 solution-gate 裁决（gateResult、depth、decisionStatus、blockingFindings、riskAcceptanceRefs）。
2. 构造 `SolutionGateVerdict` 对象。
3. 调用 `developmentPathEntryGuard(verdict)`。
4. 若 `allowed === false`：设置 `chainStatus = "BLOCKED"`，`blockingReasonCode = "DEVELOPMENT_PATH_ENTRY_DENIED"`，break 循环，不执行 implementation 节点。
5. 若 `allowed === true`：将 `depth` 注入 implementation 节点的执行请求上下文（通过 entry.execute 的 request 参数或 runStore 的 run context），继续执行。

**失败行为**：c1 守卫本身是纯函数，不会抛异常（输入已由 runtime 保证）。若 solution-gate 裁决缺失（`recovery.solutionGateDecision === null`），视为 `allowed === false`，reason = "solution-gate decision missing; cannot enter implementation"。

**测试**：
- 集成测试：solution-gate PASS → implementation 节点被执行。
- 集成测试：solution-gate FAIL → chain_status=BLOCKED，implementation 节点不执行。
- 集成测试：solution-gate PASS_WITH_RISK 无 acceptance → BLOCKED。
- 集成测试：solution-gate BLOCKED_UNKNOWN → BLOCKED。
- 集成测试：depth 传递到 implementation 执行上下文。

### 6.2 d2：c2/c3 接入 runtime chain 完成后尾部处理（对应 G2/INV-D2）

**接入点**：runtime.ts chain 完成后处理部分（约 630-700 行），在 `completedOk === true` 时、返回 RuntimeResult 之前，插入 c2/c3 调用。

**执行逻辑**：
1. 从 runStore 读取七节点的 artifact evidence（每个节点的 artifactPresent、artifactRef、version、gateMet、notes），构造 `NodeEvidenceStatus[]`。
2. 调用 `checkDocumentationGovernanceTailCompletion(evidence)`。
3. 若 `complete === false`：delivery-checkpoint phase 停留在 `tail_in_progress`，`tail_status = "incomplete"`，`missing` 列表写入 checkpoint。
4. 若 `complete === true`：
   a. 构造 c3 输入（implementationRecord、codeReview、knowledgeSync、residualRisks、recoveryInstructions、evidenceDigest、tailStatus、pathEntry）。
   b. 调用 `buildManualHandoffChecklist(input)`。
   c. 将 c3 结果序列化为 governance-tail-result artifact，写入 artifactStore。
   d. delivery-checkpoint phase 推进到 `tail_completed`，`governance_tail_result_artifact_ref` 指向 c3 产物。
   e. 若 c3 status === "READY_FOR_MANUAL_GIT_HANDOFF"，delivery-checkpoint 可推进到 `completed`（terminal）；若 c3 status === "BLOCKED"，停留在 `tail_completed` 并记录阻塞原因。
5. c2/c3 结果写入 RuntimeResult 的扩展字段（`delivery_checkpoint_artifact_ref`、`manual_handoff_status`、`manual_handoff_reason`）。

**失败行为**：c2/c3 是纯函数，不会抛异常。若 artifact evidence 读取失败，视为 `complete === false`，missing 列表包含所有节点。

**测试**：
- 集成测试：七节点 artifact 齐备 → c2 complete=true，c3 READY，delivery-checkpoint tail_completed。
- 集成测试：缺 implementation artifact → c2 complete=false，delivery-checkpoint tail_in_progress。
- 集成测试：code review 有 open findings → c3 BLOCKED。
- 集成测试：c3 产物写入 artifactStore，delivery-checkpoint 引用正确。
- 集成测试：RuntimeResult 包含 delivery_checkpoint_artifact_ref 和 manual_handoff_status。

### 6.3 d3：制品路径常量迁移（对应 G3/INV-D3）

**修改范围**：core/loop-governance-tail-result.ts:178-180

**修改内容**：
```typescript
// 旧（legacy）：
// const DIR_03 = "03-实现记录";
// const DIR_04 = "04-代码审核";
// const DIR_05 = "05-测试验收";

// 新（WP3.5 权威）：
const DIR_03 = "03-任务规划";
const DIR_04 = "04-实现记录";
const DIR_05 = "05-代码审核";
const DIR_06 = "06-知识同步";
```

**向后兼容**：
- 读取已有 on-disk 制品时，若新路径不存在，回退到 legacy 旧路径（03-实现记录/04-代码审核/05-测试验收）。
- 回退逻辑仅限读取，新写入必须使用新路径。
- 在 loop-governance-tail-result.ts 中添加 `LEGACY_DIR_ALIASES` 映射表，用于读取时的路径解析。

**测试更新**：
- 更新 loop-governance-tail-result 相关测试，断言新路径常量。
- 添加向后兼容测试：legacy 路径制品可被读取。
- 添加新路径写入测试：新生成制品使用新路径。

### 6.4 d4：集成测试补充（对应 G4）

- c1 接入集成测试（见 6.1）。
- c2/c3 接入集成测试（见 6.2）。
- 制品路径迁移向后兼容测试（见 6.3）。
- 全量回归测试：确保 1767+ 断言无新增失败。

## 7. 验收映射

| 验收点 | 验证方式 |
| --- | --- |
| c1 在 implementation 前被调用 | 集成测试 + runtime 代码审查 |
| c1 blocked 时 chain 停止 | 集成测试（chain_status=BLOCKED，implementation 节点 execution count=0） |
| c1 allowed 时 depth 传递 | 集成测试（implementation 执行请求包含 depth） |
| c2 在 chain 完成后被调用 | 集成测试 + runtime 代码审查 |
| c2 结果写入 delivery-checkpoint | 集成测试（checkpoint tail_completed phase + missing 列表） |
| c3 生成 manual handoff checklist | 集成测试（c3 产物写入 artifactStore，schema 正确） |
| c3 READY → checkpoint completed | 集成测试 |
| c3 BLOCKED → checkpoint 停留 tail_completed | 集成测试 |
| RuntimeResult 包含 delivery checkpoint ref | 集成测试 |
| 制品路径常量为 WP3.5 新编号 | 代码审查 + 单元测试 |
| legacy 路径制品可读取 | 向后兼容测试 |
| 全量测试无回归 | npm test 1767+ 断言 0 失败 |
| tsc clean | tsc --noEmit |
| Ruby validator 全绿 | 三 Ruby validator 退出码 0 |
| CI 四 job 全绿 | GitHub Actions ci-tests/ci-typecheck/ci-standards/ci-loop-patch-mutations |

## 8. 风险与缓解

| 风险 | 严重度 | 缓解措施 |
| --- | --- | --- |
| c1 守卫误判阻塞正常流程 | High | c1 纯函数已有 39 测试覆盖；接入时添加 5+ 集成测试；c1 输入由 runtime solutionGateDecision 保证，不接受外部输入 |
| c2/c3 产物写入与现有 checkpoint 冲突 | Medium | 复用现有 delivery-checkpoint phase 转换图；c2/c3 作为 tail_completed phase 的输入，不新增 phase；添加 checkpoint 状态机测试 |
| 制品路径迁移破坏现有 on-disk 制品 | High | 添加 LEGACY_DIR_ALIASES 向后兼容读取；迁移仅限常量，不修改已有制品；添加向后兼容测试 |
| runtime 调度路径改动引入回归 | High | 全量测试 1767+ 断言；添加 c1/c2/c3 集成测试；tsc clean；不修改 C02 编排语义（INV-D4） |
| c1 depth 传递机制与现有 execution request 不兼容 | Medium | 先审查 LoopCapabilityEntryRequest 的字段结构，选择兼容的注入方式（request metadata 或 runStore context）；不修改 entry 接口签名 |
| delivery-checkpoint 的 tail_completed phase 转换逻辑缺失 | Medium | 先审查 loop-delivery-checkpoint.ts 的 phase 转换图，确认 tail_in_progress → tail_completed 的转换条件；若缺失，在 d2 中补充（不新增 phase，只补转换逻辑） |

## 9. 待裁决点

### Q1：c1 blocked 时的 chain_status 语义

- **选项 A（推荐）**：c1 blocked 时 `chain_status = "BLOCKED"`，`blocking_reason_code = "DEVELOPMENT_PATH_ENTRY_DENIED"`，runtime 返回 failed 结果。这与现有 WP4 H4 durable block 语义一致。
- **选项 B**：c1 blocked 时 `chain_status = "READY"`（等待 solution-gate 重新裁决后可继续），不视为 failed。

**推荐 A**：与现有 runtime block 语义一致，fail-closed 原则。

### Q2：c3 READY 时是否自动推进 delivery-checkpoint 到 completed

- **选项 A（推荐）**：c3 READY 时 delivery-checkpoint 自动推进到 `completed`（terminal phase），因为 c3 已确认所有尾部检查通过。
- **选项 B**：c3 READY 时 checkpoint 停留在 `tail_completed`，completed phase 需要外部手动触发（保持人工交接的人工确认点）。

**推荐 A**：c3 的 READY_FOR_MANUAL_GIT_HANDOFF 本身就是尾部完成的权威判定，自动推进 completed 符合自动化原则。人工交接动作（git push/PR）仍由人工执行，checkpoint completed 只表示 runtime 侧已准备好交接包。

### Q3：制品路径迁移的向后兼容范围

- **选项 A（推荐）**：添加 LEGACY_DIR_ALIASES 读取回退，新写入使用新路径，不提供自动迁移脚本。已有制品在读取时自动回退到旧路径。
- **选项 B**：提供一次性迁移脚本，将已有制品从旧路径迁移到新路径，不保留向后兼容。
- **选项 C**：仅修改常量，不做向后兼容，已有制品读取失败视为预期（因为 runtime 是临时工作区，制品不长期保留）。

**推荐 A**：最小风险，不破坏已有制品读取，不引入迁移脚本的复杂度。runtime 的 workspace 是临时的（mkdtemp），制品长期保留的场景较少，但向后兼容成本低。

### Q4：c1 depth 注入 implementation 的方式

- **选项 A（推荐）**：通过 `entry.execute` 的 request metadata 字段注入 depth，不修改 entry 接口签名。
- **选项 B**：通过 runStore 的 run context 注入 depth，implementation 节点执行时从 runStore 读取。
- **选项 C**：修改 LoopCapabilityEntryRequest 接口，新增 depth 字段。

**推荐 A**：最小侵入，不修改 entry 接口（C02 已收口），通过现有 metadata 机制传递。

## 10. 明确不做

- 不修改 C02 runtime 编排语义（chain 结构、节点顺序、双角色门、resume lease、recovery）。
- 不修改 C03-A/B/C 已收口面（manifest/registry/known-skills/skills、c1/c2/c3 纯函数逻辑、agent-skill-registry/FLOW_DEFINITIONS/metadata inventory）。
- 不修改 delivery-tail/generation/CAS 底座（INV9）。
- 不做 C05 真实验收（真实目标仓库跑通完整链路）。
- 不做真实 Agent/Git/发布（runtime 仍为 shadow-first/default-off）。
- 不修改注册面、合同、skill-contracts（已为 WP3.5 新编号）。
- 不提供制品自动迁移脚本（Q3 推荐 A，仅向后兼容读取）。
- 不修改 LoopCapabilityEntry 接口签名（Q4 推荐 A，通过 metadata 注入）。

## 11. 实施顺序

1. **d3 制品路径迁移**（独立、低风险，先做）：修改常量 + 添加向后兼容 + 更新测试。
2. **d1 c1 守卫接入**（独立、中风险）：runtime implementation 前置调用 + 集成测试。
3. **d2 c2/c3 接入**（依赖 d1 的 pathEntry 输入、中风险）：runtime chain 完成后调用 + delivery-checkpoint 推进 + 集成测试。
4. **d4 集成测试补充 + 全量回归**：所有集成测试 + 全量测试 + tsc + Ruby validator + CI。

每步完成后独立验证，不跨步骤夹带。

## 12. 版本记录

| 版本 | 日期 | 状态 | 说明 |
| --- | --- | --- | --- |
| 0.1.0 | 2026-08-26 | DRAFT | 初稿：现状审计、缺口、不变量、实施方案、验收、风险、待裁决点 |
