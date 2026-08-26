# Decision-054：C03-C 授权与 O-1 观察项本轮处理（Current User 裁决）

## 状态

Accepted（2026-08-26，Current User 裁决：授权 C03-C Delivery Tail Integration 实施；O-1 观察项（docs/OPERATION_GUIDE.md 旧 ID）在本轮一并处理）

## 背景

C03-B 于 2026-08-26 收口（Decision-051 状态更新，PR #108 合并，merge commit 20cde00，Round 5 PASS）。公开注册面已切换为 7+1 拓扑（manifest/registry/known-skills/skills/ 三面一致 8/8/8/8），20 个旧包已删除，校验器已缩减并扩展 references/category/旧ID 扫描，本机安装副本已对齐。

但 runtime 消费面仍残留旧拓扑：
- `core/agent-skill-registry.ts` 内存硬编码 21 个旧 skill ID（含 downstreamConsumers/evidence）；
- `core/skill-flow-orchestrator.ts` FLOW_DEFINITIONS 引用旧 skill ID（requirement-normalizer/specification-writer/solution-reviewer/speckit 族/implementation-recorder/code-review 族/test-feedback 族）；
- `metadata/capabilities/shared/existing-skills-inventory.json` 与 `skill-flow-inventory.json` 仍为旧拓扑 inventory。

同时，C03-B Round 5 复审 O-1 观察项指出 `docs/OPERATION_GUIDE.md`（非 manifest entrypoint）含 12+ 处现役调用语义的旧 ID，无标注。

## 问题

C03-B 完成公开注册面 cutover 后，runtime 消费面与旧拓扑 inventory 仍指向已删除的旧包——新会话按 runtime 路由可能解析到不存在的 skill。同时 gate-runner 退役后，其原承担的三项功能（development_path_entry 确定性准入、documentation_governance_tail_completion、manual handoff 清单）需要迁入 runtime 或 Delivery Tail 流程，否则治理尾部无法产出可恢复的 READY_FOR_MANUAL_GIT_HANDOFF 或诚实阻塞。

## 决策

1. **授权 C03-C 实施**：`C03_C_DELIVERY_TAIL_INTEGRATION`（F row 9）授权成立，范围＝规划 §6 C03-C c1～c3 + runtime 消费面切换（agent-skill-registry / skill-flow-orchestrator FLOW_DEFINITIONS / metadata inventory 更新为 7+1 拓扑）。
2. **c1 development_path_entry 确定性准入**：迁入 LOOP runtime 守卫（对齐 Decision-045「确定性节点准入归 runtime」），以 store 公开事实判定，输出与原 Gate 兼容的结论结构。
3. **c2 documentation_governance_tail_completion**：迁入 C03 Delivery Tail / delivery-checkpoint 流程（INV9 底座复用）。
4. **c3 manual handoff 清单**：实现记录、代码审核、知识同步结论、未执行项、残余风险、恢复说明的聚合输出契约（对接 C05 未来验收）。
5. **runtime 消费面切换**：agent-skill-registry.ts 内存表、skill-flow-orchestrator.ts FLOW_DEFINITIONS、metadata/capabilities/shared/ 两个 inventory 文件统一更新为 7+1 新拓扑；对应测试同步更新或移除已删对象断言。
6. **O-1 观察项本轮处理**：`docs/OPERATION_GUIDE.md` 12+ 处旧 ID——操作指南中的示例调用段落加 `[HISTORICAL — pre-C03-B]` 标注或改指 7+1 新包；安装/同步通用命令段（skills/sdlc-* 通配）保留但注明当前为 7+1。
7. **明确不做**：commit/push/PR/merge 等远程副作用；恢复 speckit 独立轨道或 gate-runner 独立 Skill；改动 C02 runtime 编排语义（c1/c2 仅消费 store 公开事实与既有 checkpoint 底座）；新增第二套打包/安装机制（INV6）；C05 真实单仓验收。

## 原因

C03-B 完成了公开注册面的原子切换，但 runtime 消费面仍是旧拓扑——这是 C03-B 复审中明确划归 C03-C 的已知残留（agent-skill-registry 21 旧 ID 内存表、skill-flow-orchestrator 旧 FLOW_DEFINITIONS、metadata 旧 inventory）。不完成 runtime 消费面切换，新会话按 runtime 路由会解析到已删除的旧 skill，7+1 拓扑无法真正生效。gate-runner 退役后其三项功能必须有承接，否则治理尾部无法产出可恢复的 handoff 结论。O-1 虽非阻塞，但作为 C03-B 收口后的首个治理轮一并处理成本最低。

## 影响

- C03-C 实施后，runtime 消费面与公开注册面统一为 7+1 拓扑；
- gate-runner 三项功能迁入 runtime / Delivery Tail，无 gate-runner 仍可得到可恢复的 handoff 结论或诚实阻塞；
- OPERATION_GUIDE.md 旧 ID 清零或标注；
- 对应测试需同步更新（agent-skill-registry 测试中 21 旧 ID 断言改为 7+1，已删对象的测试移除或改指新包）；
- C03-C 不改变 C02 收口登记与 H3 归属；C05 验收仍需单独授权。

## 实现状态

授权已签发，实施待开始。实施按既定节奏：单独分支、Draft PR、独立完整复审、Current User 收口裁决。

## 依据

- 规划 rev 1.0.1 §6 C03-C c1～c3、§8 F row 9、§9 明确不做、§10 风险控制表；
- Decision-045（能力映射冻结）、Decision-050（C03 规划接受 Q2 裁决点）、Decision-051（C03-A/B 收口，C03-C 顺延）；
- C03-B Round 5 复审 O-1 观察项（docs/OPERATION_GUIDE.md 旧 ID）；
- C03-B 复审报告中 C03-C 范围声明（runtime 消费面切换：agent-skill-registry / FLOW_DEFINITIONS / metadata inventory）。
