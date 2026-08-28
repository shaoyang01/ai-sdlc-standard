# Decision-070：C03-E E2-P Provider 可达性预检结果收口（Provider Feasibility Gate PASS）

## 状态

Accepted（2026-08-28，Current User 裁决"收口吧，一定要走完所有收口操作所有项目
治理步骤"。本决定接受 E2-P 结果并收口；**不自动授权 E1～E4/E5/下一 C05**，
E1～E4 runtime 实施包授权仍须 Current User 单独裁决。）

## 背景

- Decision-069 授权 E2-P 并授予 `E2_P_REAL_CLI_PREFLIGHT_AUTHORIZED`。授权治理
  四仓落库后，经 sdlc-task-planning 形成稳定任务集并通过 Task Gate（七条件），
  于隔离临时 fixture 中对本机 Kimi/Codex/Hermes 各执行一次最小、无业务语义的
  可达性探针（统一 prompt `Reply with exactly: E2P-PING-OK`）。
- 持久化证据见 `docs/reports/c03-e-e2p-provider-reachability-record.md`，可复现
  程序为 `scripts/e2p-provider-reachability.sh`。原始 stdout/stderr 仅留临时
  fixture 并于退出时删除，未入 Git；报告只保留字节数、digest、匹配数与成本元数据。
- 三家 CLI 均在有界时间内 exit 0、stdin 接空下无交互挂起、当前凭据可用、输出可
  确定性截取出固定 token。

## 问题

是否接受 E2-P 探针结果、判定 Provider Feasibility Gate 通过并收口 E2-P，从而打开
E1～E4 runtime 实施包的授权判断门？

## 决策

1. **接受 E2-P 结果，Provider Feasibility Gate 判定 PASS**：
   - Kimi 0.38.0（`kimi -p` 非交互）→ PASS（exit 0 / 23s / 固定 token 可截取）；
   - Codex 0.150.1（`codex exec --json` 非交互、read-only 沙箱）→ PASS（exit 0 / 25s / `-o` 最终消息可截取）；
   - Hermes 0.20.5（`hermes -z` oneshot、usage 报告）→ PASS（exit 0 / 13s / 固定 token 可截取；默认后端 deepseek-v4-flash）。
2. **授权消费**：`E2_P_REAL_CLI_PREFLIGHT` 授权按其 scope 使用完毕（consumed），
   本次每 provider 恰一次最小模型请求，无业务仓/产品代码/Git/发布副作用，四仓
   工作树零改动，符合 Decision-069 副作用白名单与脱敏证据合同。
3. **证据边界（INV-E13，不升级）**：本结果只证明 provider reachability，**不**
   构成 "adapter ready" / "canonical capability ready" / C03-E PASS；不替代
   E1～E4 的 fake runner/自动证据，也不替代 E5 production adapter canary 与完整
   自主 run。CLI 版本/登录态/默认模型会漂移，E5 须经 production gateway 重证。
4. **状态推进**：CP route_state 由 `C03_E_E2P_AUTHORIZED` 转为
   `C03_E_E2P_PASSED_AWAITING_E1_E4_AUTHORIZATION`；E2-P 工作包收口，
   active_work/lifecycle 回到 IDLE，E2-P 授权消费后移出 live_authorizations。
5. **下一有效转换**：Current User 单独裁决是否授权 E1～E4 runtime 实施包
   （`CURRENT_USER_AUTHORIZE_E1_E4_RUNTIME_IMPLEMENTATION`）。E2-P PASS 是其
   **必要非充分**条件，不自动开始任何实施。

## 原因

E2-P 的目的是在投入 E1～E4 大规模 adapter/runtime 实现前，以最小代价确认三家 CLI
在本机具备非交互自动化接入的物理前提。实测三家全部 PASS，未出现缺命令、交互登录、
鉴权失败、无法有界退出或输出 transport 不可确定的情况，因此"在错误能力假设上写
adapter"的主要前置风险已排除，具备进入 E1～E4 授权判断的条件。证据按
`PROVIDER_REACHABILITY_ONLY` 脱敏留痕，满足可恢复（INV-E12）与不替代（INV-E13）。

## 影响

- Provider Feasibility Gate 关闭（PASS）；E1～E4 Task Gate 仍关闭，直至 E1～E4
  runtime 实施包授权另行成立（规划 §14.2）。
- 新增持久证据：`docs/reports/c03-e-e2p-provider-reachability-record.md` 与可复现
  程序 `scripts/e2p-provider-reachability.sh`；不改动任何 runtime 产品代码。
- 不产生 adapter/canonical capability 就绪结论；E5 仍须 production canary +
  完整自主 run；下一 C05 未授权。
- 本次外部副作用仅限三 provider 各一次最小模型请求（Hermes 侧约 $0.0022）。

## 实现状态

本收口决定落库于 `feature/loop-runtime-v1`；证据与探针脚本在独立分支
`feature/c03-e2p-provider-reachability` 经单一 PR 合入。收口后 C03-E 停在
"AWAITING_E1_E4_AUTHORIZATION"，等待 Current User 对 E1～E4 的单独授权裁决。

## 依据

- Current User 指令："收口吧，一定要走完所有收口操作所有项目治理步骤"；
- [Decision-069](Decision-069-c03e-e2p-provider-feasibility-preflight-authorized.md)（E2-P 授权与副作用/证据边界）；
- [C03-E 详细规划](../LOOP-CORE-C03-E-PLAN.md) v0.4.0 §6 E2-P、§10 Provider Feasibility Gate、§14.2 Task Gate、INV-E12/INV-E13；
- 执行记录：[c03-e-e2p-provider-reachability-record](../reports/c03-e-e2p-provider-reachability-record.md)、程序 `scripts/e2p-provider-reachability.sh`。
