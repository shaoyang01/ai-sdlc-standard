# Decision-060：C05 真实需求收口与 LOOP 全自主运行受控重排

## 状态

Accepted direction / C03-E planning pending（2026-08-27，Current User 明确：本次真实业务需求到此结束，线下测试后续进行；当前优先目标改为 LOOP 全自主运行，不再把人工切换 Agent 当作目标）

## 背景

- `wms-monitor/20260827-dashboard-page` 已形成 00～06 七节点产物、有效方案 Re-Gate、实现与代码审核结论、知识同步和 `READY_FOR_MANUAL_GIT_HANDOFF`。
- 只读复审确认 V 矩阵记录为 28/28 PASS；视觉截图、完整 SSO 和真实后端联通被明确列为线下待验证，不属于 LOOP 七节点，也不应重开当前需求。
- 人工交接后，目标分支本地与远端均位于 `aebec0eab0e06092f24c5056a6db10790d462ac5`，工作树干净；该提交发生在 LOOP 的人工 Git 边界之后。
- 本次链路实际依赖用户在 Kimi、Codex、Hermes 间切换；当前 runtime 的默认 gateway 仍为 deterministic shadow，不能证明真实 CLI 自主调度。

## 问题

如何同时如实收口已经完成的业务需求，并修正 C05 暴露的 Parent Core 覆盖缺口，使 LOOP 的最终目标回到“一次提交需求、runtime 自动调用不同 Agent CLI 跑完整链”？

## 决策

1. **业务需求收口成立**：`20260827-dashboard-page` 到 `READY_FOR_MANUAL_GIT_HANDOFF` 即结束；其代码审核不重做，线下视觉/SSO/真实后端验证不反向阻塞 LOOP 收口。
2. **C05 双层判定**：人工七节点与业务交付证据 = PASS；Core 全自主验收 = CHANGES_REQUESTED。不得用前者替代后者，也不得因后者未通过而重开已完成业务需求。
3. **C03 受控重开并新增 C03-E**：补齐真实 Agent CLI adapter、生产入口、自动推进、输出校验、durable execution journal、失败恢复与人工交互边界。
4. **清理现役合同漂移**：C03-E 实现前先移除活动 `sdlc-solution-gate` references 中已退役的 `DIRECT_IMPLEMENTATION` / `SPECKIT_PIPELINE_REQUIRED` 语义，并使 validator 覆盖 active references。
5. **C05 改用下一条真实小需求重验**：一次入口启动、零人工 Agent 切换、真实 CLI journal、有效 Re-Gate/恢复、最终人工 Git handoff；不回放本次 `wms-monitor` 需求充当新证据。
6. **边界不扩张**：自动 commit/push/PR/merge/release 仍不属于 Core；不为首版引入 scheduler、daemon、UI、服务端控制平面或新 Provider；不使用 DocFlow 方法治理本项目。
7. 本 Decision 接受的是产品方向与路线重排；C03-E 的具体实施以 `LOOP-CORE-C03-E-PLAN.md` 经 Current User 审阅后另行授权，不自动授权代码实现或外部 Agent 调用。

## 原因

C05 的价值正是用真实需求暴露“已有组件/文档不等于真实端到端能力”。本次运行证明七节点内容能力、Re-Gate 和人工交接可用，也证明当前产品仍缺少最朴素的自动编排执行层。保留业务成果、把缺口路由回 C03，并用下一条真实需求重验，既不浪费紧急业务交付，也不把人工操作包装成全自主成功。

## 影响

- `LOOP-CORE-03` 不得登记最终 COMPLETED，直到 C03-E 实现与复审通过。
- `LOOP-CORE-05` 保留本次人工链证据，但最终 Core PASS 推迟到 C03-E 之后的下一条真实需求。
- `wms-monitor/20260827-dashboard-page` 不再处于 LOOP active run；后续线下测试或线上反馈按新输入分类，不续接本 generation。
- Roadmap v2.3.2 与 C03-E 规划成为后续授权评审面；动态 route_state 仍由控制平面另行登记。

## 实现状态

路线图重排与 C03-E 草案已落盘；C03-E 代码尚未授权、尚未实现。当前业务提交只读观察为 `aebec0eab`，未由本次复审执行任何 Git 写操作。

## 依据

- [Decision-059](Decision-059-c05-real-single-repo-acceptance-authorized.md) 的 C05 完成合同与 continuity；
- [LOOP Core Roadmap v2.3.2](../AI-SDLC-Autonomous-Delivery-Roadmap.md)；
- [LOOP Core Contract](../LOOP_CORE_CONTRACT.md) §5～§7；
- [C03-E 有界规划](../LOOP-CORE-C03-E-PLAN.md)；
- `wms-monitor/library/20260827-dashboard-page/` 七节点产物、manifest 与人工 Git 交接包；
- `runtime.ts` 默认 deterministic shadow gateway 与 `execution/gateway.ts` shadow executor 实现。
