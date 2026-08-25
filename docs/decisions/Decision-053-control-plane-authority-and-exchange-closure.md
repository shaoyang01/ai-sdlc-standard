# Decision-053：控制平面权威范围确认与 Exchange 收口流程恢复（Current User 裁决）

## 状态

Accepted（2026-08-26，Current User 裁决：确认控制平面为当前执行状态权威并恢复 Exchange 必经收口流程）

## 背景

2026-08-26 对 `docs/GOVERNANCE-PATH-PANORAMA.md` 所列治理路径缺口做逐条实证核验，发现两处与治理语义相关的偏差：

1. 控制平面（`ai-project-control-plane`，`projects/ai-sdlc` 命名空间）元数据仍标
   `Status: SHADOW_VALIDATION` / `authoritative: false`，但自 WP3.5 起全部收口
   （WP3.5-B/C、C02-WP4～WP6、C03 规划与 C03-A）均已将其作为当前执行状态与
   授权/收口登记的实际权威使用，名实相反；
2. 近期多轮收口（WP3.5-C、C02-WP4～WP6、C03 系列）绕过 Project Governance
   Exchange，采用直接 CP/PKB 同步模式，而 `projects/ai-sdlc/GOVERNANCE.md`
   §15.5 的标准收口流程仍规定 Exchange run 收口，且无 Decision 记录该偏离。

## 问题

1. 控制平面的权威范围应如何界定，使其元数据与实际运转一致，又不被误读为
   「对一切事实都是权威」？
2. 收口发布通道应固定为哪种：Exchange 必经，还是直接 CP/PKB 同步？

## 决策

1. **控制平面权威范围确认**：`ai-project-control-plane` 的 `projects/ai-sdlc`
   命名空间为 **ACTIVE**，是以下范围的权威：
   - 当前执行状态（「项目干到哪一步」、下一有效转换）；
   - 授权、HOLD、收口的登记。
   明确排除：实现事实（代码、测试、PR、CI）的权威仍是产品仓 Git；
   授权决策本身只能由 Current User 作出，控制平面只登记不决策。
   跨源冲突优先级不变：产品仓已验证事实、既有权威 Roadmap、既有项目治理、
   显式用户授权均优先于控制平面状态。
2. **恢复 Exchange 必经收口流程**：自本 Decision 起，收口发布恢复
   `GOVERNANCE.md` §15.5 标准链——Exchange run 为跨代理传输通道，随后 CP/PKB
   收口同步。近期直接 CP/PKB 同步（WP3.5-C 起各轮）登记为历史偏离，不回溯
   补发、不修改既有历史记录。
3. **配套修正一并登记**：PKB `current.md` 过期状态段纠错（PKB commit
   `c3c8c19`）、Exchange 本地落后补齐（纯本地 fast-forward 至 `48973ea`，
   无仓写入）、产品仓文档卫生（`docs/CURRENT_STATUS.md` 时效横幅、
   `docs/decisions/README.md` Decision-051 重复行去重、`docs/ROADMAP_GUIDE.md`
   路线图消歧）随本 Decision 同分支合入。

## 原因

治理元数据与事实相反时，fresh agent 会按字面元数据行动（误以为控制平面
「说的不算」而另寻权威），这正是状态分裂的来源；权威范围以「当前执行状态
与登记」为限，保持实现事实归属产品仓的既有边界不变。收口通道必须唯一且
显式：Exchange 提供跨代理可审计的传输与 SHA 锚定，直接同步模式省掉这一层，
长期会使 PKB/CP 与产品仓的 provenance 链断裂。

## 影响

- `projects/ai-sdlc/GOVERNANCE.md` 标头、`STATE.yaml`（`control_plane`、
  `shadow_authority.control_plane_state_authoritative`）、`PROJECT.yaml`、
  `README.md` 的 SHADOW_VALIDATION 标签同步改正（CP commit `285fe59`）；
- 控制平面其他命名空间（`personal-knowledge-base`、`ai-project-control-plane`
  自身）及 protocols/schemas 的 shadow 标签不在本 Decision 范围内；
- WP3.5-A 的 H3、C03-B 实施状态、授权粒度规则（§8 F 逐包授权）均不受影响；
- 后续任何收口未经 Exchange run 即直接 CP/PKB 同步的，视为流程偏离。

## 实现状态

控制平面侧标签改正已合入 CP main（`285fe59`）；PKB 纠错已推送（`c3c8c19`）；
产品仓文档卫生与本 Decision 随同一 PR 合入。

## 依据

- `docs/GOVERNANCE-PATH-PANORAMA.md` 缺口 4.1～4.9 逐条实证核验（2026-08-26）；
- Current User 裁决原文：「CP只控制当前干到哪了，如果你说他是当前干到哪的
  权威，那没问题」「直接改CP仓的main即可」「恢复 Exchange 必经」；
- 既有边界先例：Decision-044（单轨重基线）、Decision-046（Decision 模块化）、
  WP5/WP6 收口发布链。
