# SDLC Runtime System — 全量代码 Review

> **Branch**: `feature/loop-runtime-v1`
> **Date**: 2026-07-05
> **Total**: 54 TypeScript 文件, ~2362 行, 8 个模块

---

## 一、系统能力清单

### ✅ 当前支持

| 能力 | 说明 |
|------|------|
| 需求输入 → 5 节点 SDLC 管线 | `run("需求")` 触发全流程：requirement-summary → tech-design → review → implementation → validation |
| 多仓库并行执行（Fanout） | 检测到多仓库关键词时，implementation 拆分为并行子任务，`Promise.all` 并发执行 |
| Speckit 管线（可选） | implementation 支持 `speckit` 模式：spec → analyze → implement → sync |
| Review 反馈闭环 | review FAIL → 自动回到 tech-design（最多 3 次重试），超过则强制 validation |
| 智能 Agent 选择 | 三级 fallback：Policy Engine（复杂度+节点类型+成本）→ Decision Layer → AGENT_MAP |
| 不可变状态机 | `ExecutionState` Readonly，`transition()` 纯函数，每次返回新 state |
| 可重放执行 | `replayExecution(initialState, trace)` 保证与原执行一致 |
| 只读观测（Evolution） | 收集执行数据 → metrics → 模式检测 → 非可执行建议 |
| 受控变更网关（Adoption） | 风险分级审批：loop=critical/pending, docflow=high/pending, fanout=low/auto-apply |

### ❌ 当前不支持

| 能力 | 原因 |
|------|------|
| 调用真实 Agent（kimi/codex/hermes） | Shadow mode：所有 agent 返回模拟结果 |
| 读取/写入真实文件系统 | 纯内存执行 |
| 接入真实 DocFlow 治理文档 | 未集成 `.specify/business_domain/` |
| 多仓库实际代码执行 | Fanout 模拟并行，不操作真实仓库 |
| Evolution 自动修改系统 | 只读层，仅输出报告 |
| `npm start` 一键启动 | 无 `package.json` / `tsconfig.json` |

---

## 二、系统架构

```
Skill Input (需求文本)
        ↓
  Graph Kernel (控制平面) — sdlc_graph/graph.ts + transitions.ts
        ↓
  Deterministic Graph VM — core/execution-state.ts + state-machine-vm.ts
        ↓
  Agent Policy Layer — core/agent-policy-engine.ts + agent-decision.ts
        ↓
  Execution Layer — DocFlow / Fanout / Speckit / Agents
        ↓
  Immutable Trace + Replay Guarantee
```

### 模块清单

| 模块 | 文件数 | 用途 |
|------|:-:|------|
| `sdlc_graph/` | 3 | 图定义 + 过渡引擎（唯一控制平面） |
| `core/` | 9 | ExecutionContext, Agent Policy, VM State, Trace |
| `runtime.ts` | 1 | 唯一入口：`run(requirement) → RuntimeResult` |
| `docflow/` | 12 | DocFlow 纯状态机节点处理器（独立模块） |
| `loop/` | 7 | LOOP 确定性分发引擎（独立模块） |
| `fanout_engine/` | 6 | 多仓库并行执行引擎（独立模块） |
| `fanout_feedback/` | 5 | 反馈闭环（独立模块） |
| `evolution/` | 6 | 只读观测层（独立模块） |
| `adoption/` | 6 | 受控变更网关（独立模块） |

---

## 三、执行流程（接到需求时）

```
输入: run("build payment system with order sync across inventory service")
        │
        ▼
  1. 解析 → requirement_id = REQ-{timestamp}
  2. 初始化 ExecutionContext + VM State (Immutable)
        │
        ▼
  ┌─ while (vmState.status === "running") ──────────────────┐
  │                                                          │
  │  3. Agent 选择                                           │
  │     Policy Engine (多因子评分: 复杂度+节点+成本)          │
  │       → Decision Layer (简单复杂度判断)                   │
  │         → AGENT_MAP (静态映射 fallback)                   │
  │                                                          │
  │  4. 执行当前节点 (EXECUTORS[node]: 静态查找表)             │
  │     requirement-summary: 解析需求, 检测 multi-repo       │
  │     tech-design: 生成设计方案                              │
  │     review: 返回 PASS/FAIL (复杂度=high → FAIL)           │
  │     implementation: Fanout / Speckit / Direct             │
  │     validation: 聚合检查                                   │
  │                                                          │
  │  5. 记录 trace (createTraceItem)                         │
  │  6. VM 状态转换 (transition: 返回新 state, 不修改原 state) │
  │  7. 获取下一节点 (getNextNode + 条件路由)                  │
  │                                                          │
  │  review FAIL? → tech-design (retryCount++, max 3)        │
  │  review PASS? → implementation                            │
  │  multi_repo?   → Fanout Promise.all 并行                  │
  │  mode=speckit? → spec→analyze→implement→sync              │
  │                                                          │
  └──────────────────────────────────────────────────────────┘
        │
        ▼
  8. 聚合结果 → RuntimeResult { requirement_id, trace[], fanout?, final_status }
```

---

## 四、本地启动方法

```bash
# 1. 切换到 feature 分支
git checkout feature/loop-runtime-v1

# 2. 安装依赖
npm install -g ts-node typescript

# 3. 运行（runtime.ts 自带测试 main() 函数）
npx ts-node runtime.ts

# 或者写入入口文件 main.ts：
echo "import { run } from './runtime'; run('你的需求文本').then(console.log);" > main.ts
npx ts-node main.ts
```

---

## 五、核心设计特点

| 特点 | 说明 |
|------|------|
| **图驱动** | `sdlc_graph/` 是唯一控制平面，定义全部节点和边 |
| **确定性** | 相同输入 → 相同输出，始终。无 AI，无随机 |
| **不可变状态** | `ExecutionState` Readonly，每步 transition 返回新 state |
| **反馈闭环** | review FAIL → tech-design 重试，带深度限制 |
| **全模拟 Shadow Mode** | Agent 调用全部返回模拟结果，零外部依赖 |
| **三级 Agent 选择** | Policy Engine → Decision Layer → AGENT_MAP |
| **独立模块** | 8 个模块各司其职，无循环依赖 |

---

## 六、图结构

```
requirement-summary ──→ tech-design ──→ review
                                              │
                              PASS ───────────┤
                                              │
                              FAIL ───────────┤
                                              │
                         (retry < 3) ───→ tech-design (feedback loop)
                         (retry ≥ 3) ───→ validation (force terminal)
                                              │
                              implementation ←─┘
                                    │
                                    ▼
                               validation (terminal)
```
