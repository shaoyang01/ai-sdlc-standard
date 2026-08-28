# Decision-073：canonical runtime 路径（B）为唯一生产路径，早期 D0x 路径（A）冻结退役

## 状态

Accepted（2026-08-28，Current User 对接线设计的方向裁决："直接决定 B 是唯一
生产路径即可，而且目前确实并没有用起来"）

## 背景

C03-E E1～E4 接线设计（`docs/reports/c03-e-e1e4-wiring-design.md`）通读生产代码后
确认存在两套执行实现：

- **路径 A（早期 D0x 微内核）**：第一版 sdlc-* skills 时期编写，由 D08
  `loop-requirement-design-orchestrator`、D09 `loop-production-coordinator`、D06
  `loop-autonomous-delivery-loop`、D05 `loop-codex-implementation-adapter` 及若干
  自定义 spawn runner 组成，Codex 单 Agent 直驱模型。
- **路径 B（canonical 七节点图）**：`runtime.ts` 持久图解释器 +
  `LoopCapabilityEntry` + ExecutionGateway/RealCapabilityGateway，按 Q1 binding
  调度 Kimi/Codex/Hermes 三 Agent，是 C03-E 目标架构。

核验事实：路径 A 的 `new LoopProductionCoordinator/LoopAutonomousDeliveryLoop`
**只出现在 tests 中，无任何生产入口脚本、未投产**（C05 验收为人工切换 Agent，
非 A 自动运行）；路径 B 已有 `scripts/codex-runtime-real-smoke.ts` 的 real gateway
注入先例。A 与第一版 skills 模型耦合，存在不适配，继续并存会形成第二套
tracing/推进状态机，违背规划 §6 E2"不得并存第二套"的要求。

## 问题

接线时路径 A 是保留为 legacy 候选、与 B 并存，还是直接确定 B 为唯一生产路径、
A 冻结退役？

## 决策

1. **路径 B 为唯一生产候选路径**：生产入口 `scripts/loop-run.ts` 只组装 B 链
   （runtime 图 + canonical gateway + Q1 binding + D03 workspace + 发布/tail 外围），
   不经过 D08/D09/D06 编排骨架。
2. **路径 A 冻结退役**：D08/D09/D06/D05 及自定义 spawn runner 不再演进、新代码
   零依赖、不被任何新 factory 选中；本期做冻结标注与引用切割，**物理删除分批**，
   不在本包一次性删除。
3. **外围能力继承，不随编排链废弃**：D03 workspace、publisher 的 Git 交付
   （adapter 无 Git 权限，发布为 B 链完成后的独立环节）、governance tail 由 B 侧
   复用/承接；D08 的自然语言需求引导职责由 B 的 requirement-intake 节点承接。
4. **物理删除条件**：B 外围（需求入口、发布、tail 接缝）补齐且 E5 canary 用真实
   证据验证 B 可端到端交付后，另出删除决策。
5. **授权边界不变**：本决策只定方向；真实 Agent 激活、E5 canary/full-run、业务仓
   远程 Git/发布仍须 Current User 另行单独授权。

## 原因

A 无生产流量、无生产入口，"保留以保连续"不成立；两套模型长期并存会持续产生适配
成本和状态机分裂。B 是 Q1 三 Agent canonical 架构的唯一正确方向。冻结退役既避免
一次性删除 ~1.2 万行加固代码的风险，又不留"双轨"歧义；删除节奏由 B 的真实就绪
证据约束，而非时间表。

## 影响

- 接线设计 §1/§2/§7/§10/§11 已按本决策更新。
- W4 由"归档标注"升级为"A 链冻结 + 引用切割 + spawn runner 引用图"。
- A 既有测试本期保持可运行、不改行为；冻结对象加显式退役标注。
- 后续 LOOP-CORE-03 收口与 C05 重验均以 B 为唯一生产路径表述。
- 不改变 Decision-071/072 的授权范围与 E5 边界。

## 实现状态

本 Decision 落盘于产品仓 `feature/c03-e1-e4-runtime-implementation` 分支；
接线实施按 W1→W7 推进，A 链冻结在 W4 执行。

## 依据

- `docs/reports/c03-e-e1e4-wiring-design.md`（接线设计，§1/§7）；
- 代码事实：A 链实例化仅见于 `tests/loop-production-coordinator.test.ts`、
  `tests/loop-requirement-design-orchestrator.test.ts`、
  `tests/loop-autonomous-delivery-loop.test.ts`；B real 注入先例
  `scripts/codex-runtime-real-smoke.ts`；
- 规划 `docs/LOOP-CORE-C03-E-PLAN.md` §6 E2（单一 real canonical route、淘汰自定义
  spawn runner、不得并存第二套状态机）；
- Decision-071（E1～E4 授权）、Decision-072（Task Gate 追认与接线授权）；
- Current User 2026-08-28 裁决原文。
