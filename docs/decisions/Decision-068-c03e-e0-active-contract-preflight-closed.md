# Decision-068：C03-E E0 活动合同收口包收口裁决（独立复审 PASS）

## 状态

Accepted / C03-E E0 CLOSED（2026-08-28，Current User 收口裁决："合并RP并推进E0收口，
注意项目治理规则"）

## 背景

- Decision-065 授权、Decision-067 恢复执行的 C03-E E0 活动合同收口包（E0.1～E0.5）
  已在独立分支 `feature/c03-e0-active-contract-preflight` 实施完成：
  - E0.1 物理删除 solution-gate references 下 sdlc-speckit-clarify/ 整目录与
    development-path-decision.md、output-report.md，review-workflow Step 7 与
    follow-up-verification 退役术语中性化；
  - E0.2 skill-flow-inventory.json 重写为单轨 version 3（single_track_main，
    7 nodes/6 edges，retired_flows=dual_track_legacy）；
  - E0.3 runtime-capabilities.json version 1→2 + updated_for，移除已废弃
    agent_skill_registry_runtime_node_mapping；
  - E0.4 validator 新增 RETIRED_PATH_TERMS 与 E0_ACTIVE_SCAN_FILES 闭包扫描
    （故意不含 references/ 子目录，留待后续 E 阶段），顺带修 manifest 悬空引用；
  - E0.5 五个测试文件删除"把 Direct stage 当成功条件"的断言，保留负面断言。
- 主体提交 `0b84dca`（18 files, +253/-868）经 PR #123 申请独立复审。
- 独立复审 Round 1 判定 FAIL：两个一行级阻塞——B1（runtime-capabilities.test.ts
  版本断言漏改，仍断言 version===1）、B2（skill-flow-inventory.json 残留"双 Gate
  同 binding"旧事实）；另有建议项 S1（能力来源对照表悬空指针）、S2（Development
  Path 孤儿授权表述）、观察项 S3（runtime_relationships legacy 命名漂移，明确不在
  E0 范围）。
- 修复提交 `5bb60be`（6 files, +9/-8）精确关闭 B1/B2 并同修 S1/S2，S3 按报告保留。
- 独立复审 Round 2（负向闭合，只读，HEAD=5bb60be）判定 **PASS**：B1/B2/S1/S2 全部
  CLOSED；修复声明与 diff 逐项一致、无夹带；`core/ execution/ runtime.ts loop/`
  零改动；全量 npm test 失败文件集合与父提交 17ac069 完全相同（26=26，集合差为空）；
  validator（含 canonical/dual-role firewall 机械联动）、metadata-chain、tsc、
  四项远端 CI 全绿；本轮新发现"无"。
- PR #123 已于 2026-08-28T03:57:05Z 以 merge commit 合入 `feature/loop-runtime-v1`，
  merge commit = `158536bbd5e8c866fae46ffc822f2ba1c81f3725`。

## 问题

E0 活动合同收口包已实现并通过两轮独立复审（Round 2 PASS），PR #123 已合入主干。
当前是否批准 E0 工作包收口、推进控制平面状态，并据此关闭 E0 Task Gate？

## 决策

1. **E0 收口**：批准 C03-E E0 活动合同收口包（E0.1～E0.5）收口。E0 经独立复审
   Round 2 PASS，满足 Decision-065 授权与规划 v0.4.0 §6 E0 表/§11 验收矩阵；
   PR #123 merge commit `158536b` 为 E0 实现事实。
2. **推进 CP STATE**：route_state 从 `C03_E_E0_IN_PROGRESS` 推进为
   `C03_E_E0_COMPLETED_AWAITING_E2P_AUTHORIZATION`；active_work 回到 IDLE
   （id=null、started=false、pause=null）；E0 授权已消费，移出 live_authorizations
   （STATE v2 不保留 consumed 授权历史）；lifecycle 回到 IDLE；next_transition 改为
   `CURRENT_USER_AUTHORIZE_E2P_PROVIDER_PRECHECK`，owner=CURRENT_USER。
3. **修正既有 STATE schema 不合规**：Decision-067 落地时 active_work 省略了 schema
   必填的 `pause` 键导致 validate_state.rb FAIL（"active_work missing keys: pause"）。
   本次收口按 STATE v2 schema 显式补 `pause: null`，使 projects/ai-sdlc/STATE.yaml
   恢复 PASS；此为登记面修正，不改变任何既有裁决。
4. **发布路径**：按 PROJECT_CONTROL §15.4 Closure event 与 Decision-066 边界，本
   Decision 持久化于产品仓后，经标准 Publisher 走 Exchange→PKB 归档，再回填 CP
   publication=COMPLETED；AI-SDLC 不绕过 Publisher 自写 PKB。
5. **E2-P/E1～E5 仍未授权**：E0 收口不自动授权 E2-P Provider 可达性预检，也不授权
   E1～E4 runtime 双轨退役、E5 production adapter/full-run 或下一 C05；上述各项仍须
   Current User 单独裁决。E0 收口是请求 E2-P 授权的前置条件，仅此而已。
6. **边界确认**：E0 全程未改变 runtime dispatch 行为（planDirectImplementationPath
   等双轨函数仍存在且可调用，其退役在 E1～E5）、未调用 Agent CLI、无业务仓写入、
   无发布动作；H3（C03-B artifact 版本链）归属不转移；S3 命名漂移留待后续 E 阶段校准。

## 原因

E0 的存在意义是为 E2-P 探针与 E1～E4 实施提供"无错误能力假设"的合同基线。两轮独立
复审证明：活动合同/metadata/validator/test 面已收敛为单轨 7+1，退役术语零残留，
metadata 机器字段不再声称与实现相反的状态，且修复未引入任何 runtime 行为变化或新增
测试失败（失败集合与父提交逐项一致）。阻塞项 B1/B2 均为登记/断言面一行级漏改，已由
5bb60be 精确关闭并通过 Round 2 负向闭合验证。E0 已达成授权目标，风险可控，应收口以
打开 E2-P 授权请求通道；但 E2-P 涉及真实三 Agent direct CLI 可达性，属新的风险面，
须由 Current User 单独授权，不在本收口裁决范围内。

## 影响

- E0 Task Gate 关闭；route_state 转为 E0 完成、等待 E2-P 授权；E2-P/E1～E5 Gate
  保持关闭。
- 活动合同/metadata/validator/test 面的单轨 7+1 事实成为后续 E2-P/E1～E5 的合同基线。
- 不产生 runtime 行为变化、不产生真实 Agent/Git/发布副作用；双轨 runtime 代码保留至
  E1～E5 退役。
- E2-P 授权前不得启动 Provider 可达性预检；E2-P PASS 前不得启动 E1～E4。
- 本 Decision 不创建 E2-P、E1～E5、下一 C05 或其他实施/发布权限。
- 26 个 pre-existing 环境性测试失败（STORE_FAILURE 类，父提交 17ac069 即失败）维持
  既有归因，非 E0 引入，不在本收口范围。

## 实现状态

E0 实现事实合入 `feature/loop-runtime-v1`（PR #123，merge commit
`158536bbd5e8c866fae46ffc822f2ba1c81f3725`）。独立复审 Round 1 FAIL / Round 2 PASS
报告由 Current User 持入；CP STATE 推进、Exchange→PKB 发布与归档随本收口裁决执行。
E0 工作包 CLOSED。

## 依据

- Current User 指令："合并RP并推进E0收口，注意项目治理规则"；
- [Decision-065](Decision-065-c03e-e0-active-contract-preflight-authorized.md)（E0 授权）；
- [Decision-066](Decision-066-cross-project-governance-state-and-pkb-ingress-boundary.md)（跨仓治理与 PKB 入站边界）；
- [Decision-067](Decision-067-c03e-e0-resumed-and-execution-started.md)（恢复 E0 执行）；
- PR #123 与独立复审 Round 1（FAIL，B1/B2）/ Round 2（PASS）报告；
- [C03-E 详细规划](../LOOP-CORE-C03-E-PLAN.md) v0.4.0 §6 E0 表、§11 验收矩阵、§15 授权边界；
- PROJECT_CONTROL §15.4 Closure event、STATE v2 schema；
- 实现事实：merge commit 158536bbd5e8c866fae46ffc822f2ba1c81f3725。
