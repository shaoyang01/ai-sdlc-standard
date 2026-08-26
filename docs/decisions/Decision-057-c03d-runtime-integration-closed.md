# Decision-057：C03-D Runtime Integration & Artifact Path Migration 收口裁决（Current User）

## 状态

**Accepted / CLOSED（2026-08-26，Current User 裁决：C03-D 经三轮独立只读复审后 Round 3 PASS，准予收口）**

## 裁决记录

- C03-D 授权成立于 Decision-056（Q1=A/Q2=A/Q3=A/Q4=A 全部按推荐）。本轮按其授权范围完成实施与收口。
- 复审链：Round 1 CHANGES_REQUESTED（R-D-F1 现役公开面旧编号残留 + LEGACY_DIR_ALIASES 零消费者 / R-D-F2 d1/d2 接线层零测试 / R-D-F3 d2 的 c3 输入硬编码假 depth/decision）→ Round 2 CHANGES_REQUESTED（R2-F1 USAGE.md/VALIDATION.md 同根因新变体 / R2-F2 接线测试两个规定负向变异不变红）→ **Round 3 PASS（无阻塞项）**。
- 最终基线：单一特性分支 `feature/c03d-runtime-integration`，head `4252b6d`，PR #111（base=`feature/loop-runtime-v1`）四 job 全绿。
- C03 四个实现包 C03-A/B/C/D 至此全部 CLOSED；LOOP-CORE-03 的最终完成仍以 C05 真实单仓验收为前提（见「后续」）。

## 背景

Decision-056 授权时，c1/c2/c3 三个纯函数契约已在 C03-C 实现（core/loop-c03-delivery-tail.ts），但尚未接入 runtime 调度路径；同时 Decision-055 裁决的 WP3.5 单轨制品编号（03-任务规划/04-实现记录/05-代码审核/06-知识同步）尚未落到 runtime 常量。C03-D 一次性完成接线与迁移。

## 问题

C03-C 的治理尾部纯函数在真实 runtime 中不生效，且 runtime 制品目录常量与 WP3.5 权威编号分叉。需要在不改变 C02 runtime 编排语义、不修改 C03-A/B/C 已收口面的前提下，把守卫与交付尾聚合接入真实执行链，并把制品路径统一到 WP3.5 单轨。

## 决策

1. **d1（c1 守卫接入 runtime implementation 前置）CLOSED**：runtime 在 implementation dispatch 前调用 `developmentPathEntryGuard`；FAIL/BLOCKED_UNKNOWN/depth 缺失/阻塞 findings/PASS_WITH_RISK 无 acceptance 时 `chain_status=BLOCKED`、`blocking_reason_code=DEVELOPMENT_PATH_ENTRY_DENIED`、不执行 implementation；PASS 时真实 depth 经 `entry.execute` request metadata（`input.designDepth`）注入，不改 `LoopCapabilityEntryRequest` 接口签名（Q4=A）。`blockingFindings` 在 DECIDED 时为空数组（1a6f823 修复，重建波次不被 code-review findings 误阻塞）。
2. **d2（c2/c3 接入 chain 完成后尾部处理）CLOSED**：仅 `completedOk && journalRunId!==null` 时构造七节点 NodeEvidenceStatus 调用 c2/c3；结果 `artifactStore.put("governance_tail_result")` 以 try/catch 非致命持久化；RuntimeResult 新增三个可选字段（manual_handoff_status/reason/artifact_ref）向后兼容。
3. **d3（制品路径迁移到 WP3.5）CLOSED**：DIR_03~06 常量迁移为 03-任务规划/04-实现记录/05-代码审核/06-知识同步；registry primaryOutputArtifacts、golden B64/SHA256、A1_FILES/completion_evidence 严格字母序同步；现役公开面（SKILL.md/known-skills 合同/docflow-writer 路由表/USAGE/VALIDATION）全部迁移，非归档现役面 grep 零旧编号。
4. **d4（集成测试）CLOSED**：新增 tests/loop-c03d-runtime-wiring.test.ts（T1~T6，16 断言），以 ExecutionGateway 子类 + capabilityTracing 的 scriptedGateway 模式实现 runtime 级 FAIL/RISK 阻塞与 DEEP depth 注入断言；负向变异（删除守卫 depth 赋值）实测 T4 变红。
5. **两处授权偏差的诚实裁断（不改变收口结论）**：
   - **Q2 checkpoint phase 自动推进**：本轮 d2 只持久化 governance_tail_result artifact，delivery-checkpoint `tail_completed` phase 写入与 READY→completed 自动推进留后续包。交付尾聚合的 READY/BLOCKED 判定已生效，不影响 F row 9「READY_FOR_MANUAL_GIT_HANDOFF 或诚实阻塞」合同。
   - **Q3 LEGACY_DIR_ALIASES**：R1 复审发现读取回退未接线（零消费者）。因 pre-launch 无存量 on-disk 制品，回退无实际对象；最终实现显式声明为 documentation-only 常量并注释「未来接线需补 hit/miss 测试」，不两边悬空。这是比「接线一个无对象的回退」更诚实的选择。
   - **knowledgeSync.decision=null**：事件模型不携带 sync decision，d2 不硬编码 APPLY_LOCAL（硬编码等于伪造审计事实），如实置 null 并注释未来扩展方向。
6. **明确不做（维持授权边界）**：不改 C02 runtime 编排语义；不改 C03-A/B/C 已收口面；不动 delivery-tail/generation/CAS 底座（INV9）；不做 C05 真实验收、真实 Agent/Git/发布；不提供制品自动迁移脚本；不改 LoopCapabilityEntry 接口签名。

## 原因

三轮复审证明：纯函数契约正确不等于接线正确——R-D-F3 的硬编码假 depth/decision 正是「接线层无测试」（R-D-F2）直接放行的结果。经 R1/R2 修复，接线行为由 runtime 级测试钉住、持久化审计字段全部从真实事件派生、制品编号在 runtime 与公开面单轨一致，才满足冻结合同的可核验要求。

## 影响

- runtime 在 solution-gate 未通过时于 implementation 前诚实阻塞，不再静默进入开发路径；
- chain 成功完成后产出 governance_tail_result 治理尾聚合 artifact（READY/BLOCKED），支撑人工 Git 交接；
- runtime 制品落点与 WP3.5 合同/注册面单轨一致，消除 C03-C R1 O-b 的编号双轨漂移；
- d1 守卫与 recovery 层阻塞面重叠，属合同明示的 defense-in-depth：其外科手术式旁路在黑盒层不可检测，但守卫整体删除会被 T4 depth 通道断言捕获，纯函数语义由 C03-C 39 断言钉住；
- 不改变 C01/WP1~WP5 已收口行为，全量 130 文件 0 失败。

## 实现状态

**CLOSED。**

- 实施分支：feature/c03d-runtime-integration；head `4252b6d`；PR #111（base=feature/loop-runtime-v1）。
- 提交链：baddee0(d3) → 0f3a41c(d1) → f7a49e5(d2) → 6114577/dff0cd5/78c8c42(排序/golden 修复) → 1a6f823(blockingFindings) → 2aaa374(R1 修复) → 4252b6d(R2 修复)。
- 验证：本地 npm test 130 文件 failed_file_count=0、EXIT=0（Node v24.12.0）；tsc --noEmit 干净；三个 Ruby 校验器绿（canonical 自检测 true）；CI run 32969172785 四 job 全绿（ci-tests 5m27s / ci-typecheck 21s / ci-standards 10s / ci-loop-patch-mutations 4m36s）。
- 跨仓登记：CP STATE.yaml route_state→C03_D_CLOSED；Exchange 发布 closure handoff + codex-adapter 并行 flake 登记（PKB 经 Exchange）。
- 编号权威：O-b 双轨漂移由 d3 统一到 WP3.5 单轨，runtime 侧不再保留旧编号（LEGACY_DIR_ALIASES 仅作文档记录）。

## 依据

- [Decision-056](Decision-056-c03d-runtime-integration-artifact-path-migration.md)（C03-D 授权，Q1~Q4=A）；
- [Decision-055](Decision-055-artifact-numbering-authority.md)（制品目录编号权威 WP3.5 单轨）；
- [Decision-054](Decision-054-c03c-authorized-o1-in-scope.md)（C03-C 授权与收口，c1/c2/c3 纯函数契约）；
- [C03-D 规划](../LOOP-CORE-C03-PLAN.md) §6 d1~d4、§8 F row、§10 风险控制表；
- C03-D Round 1/2/3 独立只读复审报告（Round 3 PASS，无阻塞项）；
- PR #111 与 CI run 32969172785；HEAD 4252b6d。
