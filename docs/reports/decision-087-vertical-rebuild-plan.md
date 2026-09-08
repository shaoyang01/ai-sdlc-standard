# Decision-087 路线图设计与需求拆分——纵向主干重建

> 状态：Draft（2026-09-03，Decision-087 授权实施）
> 日期：2026-09-03｜分支：`feature/c03-e5-autonomous-acceptance`
> 依据：Decision-087 + codex 评审报告五条根因 + 台账 §3 全部 run 块 + 六轮冒烟实证

## 0. 问题全景

LOOP runtime 原为确定性 stub 测试设计。真实 agent 派发后暴露的 12 个问题
（P-A～P-L）归结为**三条接缝的断裂**——它们不是独立 bug，而是同一架构在
真实场景下的三个侧面：

| 接缝 | 症状 | 根因 |
|---|---|---|
| 接缝 1：节点结果模型 | implementation 零改动但 runtime 记 succeeded；code-review ENVELOPE_INVALID 反复出现 | E3 信封只校验 JSON 结构，不校验正文声明是否与实际一致 |
| 接缝 2：Finding 物化与路由 | scan 产 findings → blob only；verdict PWR → findings 仍 OPEN → gate 阻塞 | ledger blob 与 `loop_findings` 行之间无原子物化桥梁 |
| 接缝 3：生产装配入口 | smoke 绕过 `runProduction`，journal 记 `repository=local`；sandbox read-only 禁止写入；无独立 task worktree | 多入口并存（`run()` / `runProduction()` / smoke 直调），装配逻辑分裂 |

三个接缝互相依赖：接缝 1 的结果模型是接缝 2 finding 路由的输入；接缝 3
的装配入口决定了 1 和 2 在哪个上下文中运行。**必须作为一个整体波次实施，
不能拆成独立小修。**

## 1. 路线图（四个 Phase）

### Phase 1：接缝 3——唯一生产装配入口（先行，其他接缝依赖它）

| 任务 | 内容 | 产出 |
|---|---|---|
| T1.1 | 创建 `createProductionFactory()` 统一装配函数：注入真实 identity / prepared worktree / real adapter / attemptWorkspace / artifact+journal store | `runtime.ts` 新增 factory |
| T1.2 | `runProduction()` 增加可选 `prepareWorkspace` 依赖（P-B 修正的正式版本） | `runtime.ts` |
| T1.3 | `scripts/loop-gw-smoke-real.ts` 改为通过 factory 入口派发（不再直调 `run()`） | smoke 脚本重构 |
| T1.4 | 离线测试：真实 git 仓 e2e（prepare → inspect → chain → COMPLETED） | 测试 |

### Phase 2：接缝 1——节点结果模型

| 任务 | 内容 | 产出 |
|---|---|---|
| T2.1 | E3 信封增加可选 `nodeStatus` 字段（`SUCCEEDED` / `BLOCKED` / `FAILED`），gateway 校验：正文声明与 envelope `nodeStatus` 必须一致 | `core/node-output-envelope.ts` + `execution/gateway.ts` |
| T2.2 | succeeded 事件的 `nextStepEligibility` 改为从 `nodeStatus` 派生：`BLOCKED` → BLOCKED；`FAILED` → BLOCKED；`SUCCEEDED` → ELIGIBLE | `execution/gateway.ts` |
| T2.3 | implementation 正文声明 BLOCKED 时 → 事件 terminal=BLOCKED，不派发 code-review | `execution/gateway.ts` + `core/loop-recovery.ts` |
| T2.4 | 测试：三分支矩阵（SUCCEEDED / BLOCKED / FAILED → 各自正确的 terminal） | 测试 |

### Phase 3：接缝 2——Finding 物化与路由

| 任务 | 内容 | 产出 |
|---|---|---|
| T3.1 | `adversarial_scan` succeeded 后：将 ledger blob 原子物化为 `loop_findings` 行（同事务），含 earliestAffectedNodeId | `runtime.ts` + `core/loop-run-store.ts` |
| T3.2 | `formal_verdict` PASS_WITH_RISK succeeded 后：scan 产出的 OPEN findings 自动降级为 tracked（不阻塞 task-planning） | `core/loop-recovery.ts` |
| T3.3 | `code-review` HIGH findings：earliestAffectedNodeId = implementation → 自动回流 implementation（同 run，重跑节点） | `core/loop-recovery.ts` |
| T3.4 | 测试：finding 物化 → gate → 自动路由 → 重跑 → closure 全流程 | 测试 |

### Phase 4：集成验证

| 任务 | 内容 |
|---|---|
| T4.1 | 离线端到端测试矩阵（Decision-087 六场景）全部通过 |
| T4.2 | 真实 CLI 冒烟（run8）：从 intake 到 knowledge-sync 全链端到端 |
| T4.3 | 台账收口 + 四仓传播 |

## 2. 需求拆分（按实施粒度）

### D-087-01：生产装配工厂
- **改文件**：`runtime.ts`（新增 `createProductionFactory`）、
  `scripts/loop-gw-smoke-real.ts`（改为通过 factory 入口）
- **依赖**：无
- **验收**：factory 产出后 runProduction 全链 deterministic COMPLETED

### D-087-02：节点状态字段
- **改文件**：`core/node-output-envelope.ts`（信封增 nodeStatus）、
  `execution/gateway.ts`（校验 + 派生）、`core/loop-recovery.ts`（走查适配）
- **依赖**：D-087-01
- **验收**：三分支矩阵通过；正文 BLOCKED → terminal BLOCKED

### D-087-03：finding 物化
- **改文件**：`runtime.ts`（scan 后物化 + verdict 后自动降级）、
  `core/loop-recovery.ts`（finding gate 从行读取）
- **依赖**：D-087-01
- **验收**：scan 后 journal 有 finding 行；verdict PWR 后 gate ELIGIBLE

### D-087-04：code-review findings 自动回流
- **改文件**：`core/loop-recovery.ts`（regate plan 从 code-review findings 派生）
- **依赖**：D-087-03
- **验收**：code-review HIGH → 自动回流 implementation 重跑

### D-087-05：SKILL.md 引用修正
- **改文件**：`skills/sdlc-*/SKILL.md`（改为 `${AI_SDLC_STANDARD_HOME}` 路径）
- **依赖**：无
- **验收**：sync-skills.sh --check 全部 in sync

## 3. 依赖图

```
D-087-01 (生产装配工厂)
  ├── D-087-02 (节点状态字段)
  │     └── 依赖 factory 提供的运行上下文
  ├── D-087-03 (finding 物化)
  │     └── 依赖 factory 提供的 artifact store
  │     └── D-087-04 (code-review 自动回流)
  │           └── 依赖 finding 物化产出的行
  └── D-087-05 (SKILL 引用修正)
        └── 无依赖，可并行
```

## 4. 实施顺序

1. D-087-01 生产装配工厂（含 prepareWorkspace 正式接入）
2. D-087-02 节点状态字段（信封 + gateway + recovery）
3. D-087-03 finding 物化（scan/verdict 后原子写入）
4. D-087-04 code-review 自动回流
5. D-087-05 SKILL.md 引用修正
6. 离线测试矩阵验证
7. 真实 CLI 冒烟（run8）

## 5. 风险

| 风险 | 缓解 |
|---|---|
| 节点状态字段可能与已有 gateResult 冲突 | nodeStatus 独立于 gateResult，仅表达节点执行结果（非 gate 裁决） |
| finding 物化可能触发 invalidation 循环 | 物化只创建行，不触发 invalidation；invalidation 由 Re-Gate 派生 |
| 生产装配入口改动影响既有测试 | factory 为增量接口，既有直接调 run() 的测试不受影响 |
