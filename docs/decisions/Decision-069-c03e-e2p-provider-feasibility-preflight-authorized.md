# Decision-069：授权 C03-E E2-P Provider 可达性预检（Provider Feasibility Preflight）

## 状态

Accepted（2026-08-28，Current User 授权："授权启动E2-P，先做授权这个操作的项目治理"。
本授权授予规划 §6 E2-P 所要求的 `E2_P_REAL_CLI_PREFLIGHT_AUTHORIZED` 外部调用权；
本授权不包含 E1～E4 runtime 实施、E5 验收或下一轮 C05，也不授权 production adapter。）

## 背景

- Decision-068 已裁决 C03-E E0 活动合同收口包收口：独立复审 Round 2 PASS，PR #123
  合入 `feature/loop-runtime-v1`（merge `158536b`），活动合同/metadata/validator/test
  面已收敛为单轨 7+1，route_state 转为 `C03_E_E0_COMPLETED_AWAITING_E2P_AUTHORIZATION`。
- 规划 v0.4.0 §6「E2-P — Provider Feasibility Preflight」与修订 A1（Decision-064）、
  Q6 分段授权裁决规定：E0 独立收口后、E1～E4 大规模 runtime 实施前，插入一个**独立授权**
  的最小真实 CLI 可达性预检，尽早暴露本机 Kimi/Codex/Hermes CLI 在 executable、版本、
  非交互模式、鉴权和基础 I/O 上的不兼容，避免把适配风险推迟到 E5。
- E2-P 的前置条件（E0 完成并经复核收口）现已满足。规划同时明确：E0 合同收口授权、
  方案接受、E1～E4 实施授权均**不自动包含**真实 CLI 外部调用权，该项必须由 Current User
  单独授予。
- INV-E13 要求四类证据（fake runner、direct CLI preflight、real adapter canary、
  full autonomous run）不得互相替代；E2-P 只证明 provider reachability，不证明 adapter
  或 canonical capability 可用。

## 问题

Current User 是否授权执行 E2-P：在隔离临时 fixture 中对本机 Kimi/Codex/Hermes CLI
各执行一个最小、无业务语义的可达性探针，以 `PROVIDER_REACHABILITY_ONLY` 证据判定三
provider 是否具备自动化接入基础条件？

## 决策

1. **授权 E2-P**：授权 ID `E2_P_REAL_CLI_PREFLIGHT`，并据此授予规划 §6 要求的
   `E2_P_REAL_CLI_PREFLIGHT_AUTHORIZED` 真实 CLI 外部调用权。范围严格限定为规划 §6
   E2-P 最小探针矩阵，对三个 provider 各执行**一个**最小、无业务语义探针：

   | Provider | 必须证明 | PASS 下限 |
   | --- | --- | --- |
   | Kimi | executable/version、非交互启动、当前凭据可用、stdin 输入与结构化文本输出 | 有界时间内 exit 0；无交互提示；输出可被确定性截取；安全摘要与 digest 可记录 |
   | Codex | executable/version、非交互启动、当前凭据可用、stdin 输入与结果 transport | 有界时间内 exit 0；无工作区写入；输出边界可确定 |
   | Hermes | executable/version、非交互启动、当前凭据可用、stdin 输入与结果 transport | 有界时间内 exit 0；无交互提示；输出边界可确定 |

2. **外部副作用白名单**：获授权的外部副作用**仅限**每个 provider 一次模型请求所必需的
   网络调用、provider 计费与服务端审计记录；除此之外的任何外部写入（业务仓、远程 Git、
   发布、其他服务）一律不允许。
3. **执行位置与方式**：在隔离临时 fixture 中**直接调用 provider CLI**，不通过尚未实现的
   production adapter；不读取真实业务需求、不进入业务仓工作区、不修改产品代码
   （探针脚本与证据可在独立分支/临时目录承载，产品运行时代码零改动）、不请求 Git 或
   发布副作用。
4. **证据合同**：证据类型固定为 `PROVIDER_REACHABILITY_ONLY`，记录 provider、resolved
   executable identity、version、argv profile draft digest、started/terminal、
   exit/signal/timeout、stdout/stderr byte count、sanitized output digest、临时工作区
   pre/post digest。**原始 prompt、完整 stdout/stderr、凭据与环境变量值不得进入 Git、
   journal 或规划文档**；只记录脱敏摘要与 digest。
5. **结果判定门**：
   - 任一 provider 缺命令、要求交互登录、鉴权失败、无法有界退出、输出 transport 不可
     确定或产生未授权副作用，结果为 `PROVIDER_FEASIBILITY_BLOCKED`，**不得开始 E1～E4**，
     回流 Current User；
   - 三 provider 全部 PASS 仅允许进入 E1～E4 **授权判断**，不产生 "adapter ready"、
     "canonical capability ready" 或 C03-E PASS。
6. **明确不授权**：不实现/试跑任何 production adapter；不实施 E1～E4、不启动 E5、不
   开始下一轮真实 C05；不验证 Skill 装载、canonical envelope、生产 Gateway、节点输出
   合同、attempt promotion、Re-Gate、journal recovery、工作区写入或 role firewall
   （这些归 E2～E4 自动证据与 E5 真实 canary/full run）；E2-P 结果不得抵扣 E5。
7. **交付与复审**：E2-P 在独立分支进行，完成后提交探针结论与 `PROVIDER_REACHABILITY_ONLY`
   证据（脱敏），申请只读复核；复核确认证据类型、脱敏与副作用边界后，由 Current User
   单独裁决是否据此授权 E1～E4。

## 原因

E0 已清除活动合同面的旧双轨语义，现在投入 E1～E4 大规模 runtime 实施前，最大的未知量是
本机三个 Agent CLI 是否真的具备非交互、可鉴权、可确定截取 I/O 的自动化接入条件。E2-P 以
最小代价（每 provider 一次模型请求）提前证伪这一前提：若任一 CLI 需要交互登录或无法有界
退出，应在写任何 adapter 前停止，而不是把适配风险带入 E5。E2-P 不触产品代码、不触业务仓、
外部副作用被白名单严格收敛，风险与成本均可控，且是 E1～E4 的必要前置。

## 影响

- CP route_state 从 `C03_E_E0_COMPLETED_AWAITING_E2P_AUTHORIZATION` 推进为
  `C03_E_E2P_AUTHORIZED`；live_authorizations 新增 `E2_P_REAL_CLI_PREFLIGHT`
  （AUTHORIZED）；E2-P 成为当前工作包（NOT_STARTED，待执行启动）。
- 执行 E2-P 将对 Kimi/Codex/Hermes 各产生一次真实模型请求（网络/计费/服务端审计），
  不产生产品代码、业务仓或 Git/发布副作用。
- Provider Feasibility Gate：三 provider 全 PASS 是请求 E1～E4 授权的必要非充分条件；
  任一 BLOCKED 则 C03-E 停在 E2-P 并回流 Current User。
- E1～E4、E5、下一 C05 在任何情况下都不因本授权自动启动。
- CLI 版本或登录态会随时间变化使 E2-P 事实 stale，E5 仍须通过 production gateway/adapter
  重新证明（INV-E13）。

## 实现状态

本授权决定落库于 `feature/loop-runtime-v1`。授权治理（Decision + CP STATE 登记 +
Exchange/PKB 传输归档）完成后，E2-P 探针方可开始执行；执行前将以隔离 fixture 直接调用
三个 CLI，严格遵守本决策的副作用白名单与脱敏证据合同。

## 依据

- Current User 指令："授权启动E2-P，先做授权这个操作的项目治理"；
- [Decision-068](Decision-068-c03e-e0-active-contract-preflight-closed.md)（E0 收口，E2-P 前置已满足）；
- [Decision-064](Decision-064-c03e-early-provider-feasibility-plan-amendment.md)（A1：插入 E2-P）；
- [C03-E 详细规划](../LOOP-CORE-C03-E-PLAN.md) v0.4.0 §6 E2-P、§10 提交边界、§11 证据矩阵、§13 Q6、§15 授权边界、INV-E13；
- 控制平面 STATE.yaml：route_state `C03_E_E0_COMPLETED_AWAITING_E2P_AUTHORIZATION`。
