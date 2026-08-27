# Decision-059：授权 C05 真实单仓验收（LOOP-CORE-05），以 wms-monitor 指调大盘需求为验收对象

## 状态

Accepted（2026-08-27，Current User 裁决：按推荐方案授权 C05 真实单仓验收。C03 实施阶段已于 Decision-058 登记完成，LOOP-CORE-03 最终 COMPLETED 以本包验收通过为唯一剩余条件）

## 背景

- C03 四个实施包 A/B/C/D 全部经独立复审 PASS 收口（Decision-051/052/054/056/057），Decision-058 登记 C03 实施阶段 = IMPLEMENTATION_COMPLETED，route_state=C03_IMPLEMENTATION_COMPLETED，current_gate=LOOP_CORE_C05_AUTHORIZATION_GATE，下一有效转换为 C05 授权申请。
- Roadmap LOOP-CORE-05 完成合同要求：至少一个真实单仓需求从已支持入口启动或恢复；标准产物贯通设计、实现、审核、验收；至少一次有效 finding 回流正确最早节点（Re-Gate）；每次执行可追溯 binding 与输入版本；在无远程 Git 副作用条件下输出人工 Git 交接包，或在条件不满足时输出可恢复失败/阻塞。明确不得以虚构样例、聊天摘要、旧 PR/CI 或执行者自述替代验证，不自动 Git 发布。
- 现有真实需求：`wms-monitor` 仓 `20260827-dashboard-page`（指调大盘 / 异常任务池监控大盘页面）。需求描述 `library/20260827-dashboard-page/指调大盘页面需求描述.md` v1.0.0；接口语义以冻结合同 `specs/010-exception-task-pool/contracts/http-page-api.md` 为准，页面结构以原型为一号依据；后端 11 接口已实现冻结，本需求只做 Web 前端对接与整链验收。
- 目标仓库基线：`wms-monitor @ 3e318dad6`（分支 `feature/dev_20260821_task_center`，授权时工作树干净）。
- 本机六个 Agent 安装副本（codex / kimi-code / zcode / hermes / claude / opencode）已统一到 7+1 最新拓扑并逐包 diff 核验，入口 Agent 可读到现役 Skill。

## 问题

是否授权 C05 真实单仓验收，以及在什么验收对象、入口 Agent、执行边界与完成合同下授权？

## 决策

1. **授权 C05（LOOP-CORE-05 Recoverable Evidence and Real Core MVP Acceptance）**，授权号 `C05_REAL_SINGLE_REPO_ACCEPTANCE`。授权范围严格限于下述单一需求 / 单一目标仓库，不自动外溢到任何其他需求或仓库。
2. **验收对象**：`wms-monitor` 单仓，Requirement ID = `20260827-dashboard-page`（指调大盘页面，Web 前端对接既有冻结后端）。验收基线 `wms-monitor @ 3e318dad6`。
3. **入口与角色**：以 **Kimi 为入口 Agent** 启动同一条 LOOP（loop-entry-contract §1 明确 Kimi / Codex / Hermes 任一已支持入口等价），从 `sdlc-requirement-intake` 进入、建立/识别 Requirement ID 与来源记录；双角色门按现役绑定执行（codex 扫描、hermes 裁决，不同 Agent binding）。
4. **执行边界（无远程 Git 副作用）**：执行 Agent 只在 `wms-monitor` 本地工作区写入 `library/20260827-dashboard-page/` 产物与 `wms-monitor-web` 代码；**不得 git commit / push / 开远程 PR / 合并 / 发布**；完成后产出 READY_FOR_MANUAL_GIT_HANDOFF 人工 Git 交接包（或如实的失败/阻塞结论），由 Current User 决定是否及如何提交。
5. **完成合同（验收判定项，全部满足方可判 C05 PASS）**：
   - 该真实需求从已支持入口启动（或在中断后恢复），七节点标准产物贯通设计、实现、审核、验收；
   - 至少一次**有效 Re-Gate**：真实 finding 回流到正确最早节点并重走，而非走过场；
   - 每次执行可追溯 binding（执行 Agent / 角色）与输入版本（需求、合同、原型来源元数据）；
   - 至少覆盖一类可恢复性证据（中断 / 输入不完整 / Agent 不可用后可恢复，不丢已确认事实）；
   - 在无远程 Git 副作用前提下输出人工 Git 交接包，或在条件不满足时输出可恢复失败/阻塞，并明确区分已验证 / 待验证 / 失败 / 阻塞 / 未授权动作。
6. **明确不授权**：任何后端接口新增或修改（需求 Out of Scope，后端 11 接口已冻结）；自动远程 Git 发布；第二个需求或多仓 / monorepo 场景；以虚构样例或自述替代真实 run evidence；借验收之名改 LOOP runtime / 合同权威。
7. **收口方式**：C05 完成后须经独立只读复审，对照本 Decision 完成合同逐项判定；PASS 后由 Current User 单独裁决 LOOP-CORE-03 = COMPLETED 并登记 route_state。复审未 PASS 前不宣告 Core 完成。

## 原因

Roadmap LOOP-CORE-05 rationale 明确"已有代码组件、文档或样例不能替代真实需求上的端到端证明"。所选需求是真实单仓、真实冻结合同、规模可控的前端对接，且合同明文"不允许前端绕过接口直算统计/脱敏/权限"，在方案与实现阶段具备真实 Gate / Re-Gate 空间，能对 C01～C03 交付的编排链、双角色门、返工、证据与人工 Git 边界做端到端证明，契合完成合同。以 Kimi 为入口符合统一入口合同；限定无远程 Git 副作用符合"人工 Git 交接"边界。

## 影响

- CP route_state：`C03_IMPLEMENTATION_COMPLETED` → `C05_IN_PROGRESS`；current_gate 从 `LOOP_CORE_C05_AUTHORIZATION_GATE` 推进到 C05 验收执行 / 收口门。
- LOOP-CORE-03 保持 IN_PROGRESS：实施完成但最终 COMPLETED 仍以 C05 PASS + Current User 单独裁决为条件。
- 目标仓库 `wms-monitor` 出现本地验收产物与代码改动属预期；远程仓与远端分支在验收期间不得被执行 Agent 改动。
- Exchange 建立 C05 topic 与 tracking 记录；PKB 建立 C05 handoff；本授权与后续收口证据在三仓 + CP 可交叉追溯。

## 实现状态

授权登记时实现尚未开始。执行与复审证据（run evidence、Re-Gate、binding/版本追溯、可恢复性、人工交接包、独立复审结论）于 C05 收口时回填本 Decision 对应收口裁决与 CP STATE。

## 依据

- Roadmap `docs/AI-SDLC-Autonomous-Delivery-Roadmap.md` LOOP-CORE-05（objective / completion_contract / out_of_scope / continuity）与 LOOP-CORE-00 completion_contract；
- `ai-sdlc/loop-entry-contract.md` §1（Kimi/Codex/Hermes 等价入口）、§3/§8（入口义务与 STOP）；
- Decision-058（C03 实施阶段完成，C05 为最终 COMPLETED 唯一剩余条件）；Decision-044/045/055（拓扑与编号权威）；
- 需求描述 `wms-monitor/library/20260827-dashboard-page/指调大盘页面需求描述.md` v1.0.0；
- 冻结合同 `wms-monitor/specs/010-exception-task-pool/contracts/http-page-api.md`；
- 目标仓库基线 `wms-monitor @ 3e318dad6`（分支 feature/dev_20260821_task_center）。
