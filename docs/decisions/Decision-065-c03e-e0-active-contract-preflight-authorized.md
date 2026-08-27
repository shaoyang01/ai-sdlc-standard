# Decision-065：授权 C03-E E0 活动合同收口包（Active Contract Preflight）

## 状态

Accepted（2026-08-27，Current User 授权：执行 C03-E 的 E0 活动合同收口包 E0.1～E0.5；本授权不包含 E2-P 真实 CLI 预检、E1～E4 runtime 实施、E5 验收或下一轮 C05）

## 背景

Decision-060 对 C05 第一次真实单仓验收（wms-monitor 指调大盘）做出双重裁决：业务需求 COMPLETED、人工协调七节点链 PASS，但 Core 全自主验收 CHANGES_REQUESTED——根因是用户仍需手动切换 Kimi/Codex/Hermes，且生产 runtime 默认仍是 deterministic shadow gateway，无真实 CLI 执行日志。为此受控重开 C03 新增 C03-E「真实多 Agent CLI 自主调度」。

Decision-062 授权详细规划、Decision-063 接受 v0.3.0 与 Q1～Q7、Decision-064 接受 v0.4.0 A1 修订，将实施拆为 E0 活动合同收口包、独立授权的 E2-P Provider 可达性预检、E1～E4 runtime 实施包、E5 自主 runtime 验收，并规定 E0 必须先独立复核收口。当前 CP route_state 为 `C03_E_E0_AUTHORIZATION_PENDING`，E0 Task Gate 关闭中。

规划 §2.2 Source 核验确认活动合同面仍残留旧双轨事实：`sdlc-solution-gate` references 仍输出 `DIRECT_IMPLEMENTATION` / `SPECKIT_PIPELINE_REQUIRED` 旧路径判定；`skill-flow-inventory.json` 仍含 `main_docflow`、Direct fork、双 Gate 角色同 Agent 等旧事实；`runtime-capabilities.json` 保留大量 shadow/未接线描述；validator 尚未从 manifest active references 闭包扫描退役 ID 与旧路由字段。E0 的目标是在任何 runtime 实施前，先让活动合同只表达单轨七节点 + depth。

## 问题

Current User 是否授权执行 E0 活动合同收口包，使其在不改变 runtime dispatch 行为、不调用任何 Agent CLI 的前提下，清理活动合同面的旧双轨语义，并为 E2-P 预检与 E1～E4 实施建立干净的单轨合同基线？

## 决策

1. **授权 E0**：授权 ID `E0_ACTIVE_CONTRACT_PREFLIGHT`，范围严格限定为规划 §6 E0 表的 E0.1～E0.5：
   - **E0.1** `skills/sdlc-solution-gate/references/**`：删除 Direct/Speckit path decision，只保留 Finding Ledger、PASS/FAIL/PASS_WITH_RISK、LIGHT/STANDARD/DEEP 与 Re-Gate；验收标准为 active reference 旧术语零命中。
   - **E0.2** `metadata/capabilities/shared/skill-flow-inventory.json`：改为单轨 7+1、双 Gate role 不同 binding、runtime-invoked 当前事实；历史 flow 移 archive 而非继续活动消费；验收标准为 metadata parser + topology assertions。
   - **E0.3** `runtime-capabilities.json`：校准 shadow/real/adapter/wiring 事实，机器字段不得声称未实现或已启用的相反状态；验收标准为 runtime capabilities tests。
   - **E0.4** `scripts/validate-skill-contracts.rb` 及必要 metadata validator：从 manifest active references 闭包扫描退役 ID、旧路由字段与 role firewall 漂移；验收标准为 rehashed tamper/mutation negative tests。
   - **E0.5** active tests：删除把 Direct stage 当成功条件的 active assertions；历史 archive 测试不进入生产门禁；验收标准为 CI standards/typecheck/tests 全绿。
2. **实施边界**：使用独立实施分支 `feature/c03-e0-active-contract-preflight` 与单一 PR；E0 经独立复审 PASS 后由 Current User 单独裁决收口。
3. **明确不授权**：
   - 不改变 runtime dispatch 行为（E1 的 production entry/gateway 不在 E0 范围）；
   - 不调用任何 Agent CLI，不执行 E2-P 真实 CLI 可达性预检（需单独的 `E2_P_REAL_CLI_PREFLIGHT_AUTHORIZED` 授权）；
   - 不实施 E1～E4、不启动 E5、不开始下一轮真实 C05 需求；
   - 不删除历史 Decision/报告中的历史提及（历史 archive 保留，仅移出活动消费面）；
   - 无远程 Git 副作用、无业务仓写入、无发布动作。
4. **双 binding Solution Gate 剩余风险**：维持 Decision-063 的 Current User 风险接受——本轮不执行双 binding Solution Gate；E0 收口复审仍须按规划 §11 覆盖合同 → 不变量 → attack surface → 实现/测试证据，并对最终树与 retained commits 做负向闭合验证。
5. **下一有效转换**：E0 实施完成 → 独立全量只读复审 → Current User 收口裁决；E0 收口后 E2-P Provider 可达性预检门才打开（仍需单独授权）。E0 授权不自动授权 E2-P 或 E1～E4。

## 原因

规划 §6/§11 与修订 A1 要求 E0 先行独立收口，避免旧 Direct/Speckit path decision 污染后续 profile 探针与真实 run。E0 是纯活动合同/metadata/validator/test 面清理，不触及 runtime dispatch 与真实 CLI，风险可控，且是 E2-P 与 E1～E4 的必要前置——在旧双轨语义仍被活动合同引用时，任何 provider 探针或 adapter 实施都可能建立在错误的能力假设上。

## 影响

- CP route_state 从 `C03_E_E0_AUTHORIZATION_PENDING` 推进到 E0 实施中；E0 Task Gate 打开，E2-P/E1～E5 Gate 保持关闭。
- 活动合同面（solution-gate references、两份 capabilities metadata、validator、active tests）将发生删除/校准；历史 archive 与 Decision 正文保留。
- 不产生 runtime 行为变化、不产生真实 Agent/Git/发布副作用。
- E0 收口前不得启动 E2-P；E2-P PASS 前不得启动 E1～E4。

## 实现状态

本授权决定落库于 `feature/loop-runtime-v1`；E0 实施在独立分支 `feature/c03-e0-active-contract-preflight` 进行，基线为授权决定 merge 后的主干 HEAD。实施完成后提交单一 PR 并申请独立复审。

## 依据

- 规划 `docs/LOOP-CORE-C03-E-PLAN.md` v0.4.0 §2.2、§6 E0 表、§11 验收矩阵、§13 Q1～Q7、§15 授权边界；
- Decision-060（C05 双重裁决与 C03 受控重开）、Decision-062（详细规划授权）、Decision-063（v0.3.0 接受）、Decision-064（v0.4.0 A1 修订）；
- 控制平面 STATE.yaml：route_state `C03_E_E0_AUTHORIZATION_PENDING`、active_work E0 Task Gate；
- Roadmap LOOP-CORE-03/05 completion_contract。
