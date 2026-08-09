# Goal-Anchored Global Reasoning（GRP-01 Shared Reference）

## Purpose

GRP-01 定义一组 **goal-anchored global reasoning** 语义，供 reasoning 类
Skills（Specification Writer、Solution Challenger、Solution Reviewer、Speckit
Analyze、Code Review Excellence）共享。本文件是唯一 shared reference：五个
Skill 的 `SKILL.md`、`references/*.md` 与 `skill-contracts/known-skills/*.md`
只绑定本文件，不各自发明第二套协议。

本文件只定义 reasoning 方向与边界，不改变任何既有 schema、Gate 架构、
Development Path/Tail 语义、PCE 或 D10/D10-B 合同；不引入平台、runtime、
workflow engine、数据库、autonomous reviewer、ledger 或新输出 schema。

## 1. Anchor

先锚定再行动：

- 明确 current goal（本轮目标，不是全部历史目标）；
- 明确 scope：In Scope / Out of Scope / Non-Goals / Acceptance；
- 明确约束来源（需求资料、已批准 artifact、repository context）；
- 锚定失败（goal 或 scope 无法确定）时，按既有 Stop Conditions 停止，不猜测。

## 2. Global-first

在细节工作之前，先构建 applicable material surfaces 的全局模型：

- 当前 goal 影响的模块、数据、接口、流程、状态与验证面；
- 已有机制（existing mechanism）与最小充分规则继续优先；
- 全局模型先行，再进入逐项细节；不在模型未建立时提前深入单个局部。

## 3. Impact Closure

每个 material finding 或变更必须关闭其 direct impact：

- caller / callee 或 dependency；
- consumer；
- state / data；
- failure / compatibility；
- verification。

impact 未关闭的 finding 不算完成；把 impact 关闭作为工作的一部分，而不是
追加的旁路工作。

## 7. Frozen Applicable Material Surfaces

所有 reasoning Skill 共享以下 **frozen applicable material surfaces**
（GRP01-R2 冻结的 generic vocabulary）。

Generic frozen 12-surface vocabulary（每个 material finding / 变更 / 审查
都必须按此参考集评估适用性）：

```text
1.  main_flow
2.  entry_points_or_actors
3.  inputs
4.  direct_callers_or_dependencies
5.  outputs_and_consumers
6.  state
7.  data_or_persistence
8.  external_effects
9.  failure_propagation
10. compatibility
11. observability
12. acceptance_and_verification
```

- Skill-specific details（各 Skill 的 SKILL.md 与 references 中出现的面）
  只是上述 vocabulary 的 interpretation，不构成独立清单，不得窄于这
  12 个 surface。
- 某 surface 对当前 goal 不适用时，显式标记 `NOT_APPLICABLE`（或中文
  `不涉及`）；不得省略该 surface 的结论，也不得为此创建新输出 schema 或
  新字段记录它。
- 第 3 节 direct impact 五维的完整参考集是本 12-surface vocabulary。
- 本清单只冻结"适用面"，不引入平台 / runtime / schema / Gate 变化。

## 4. Root-Cause Consolidation

- 把表象归并到根因：同一根因的多个表象合并为一条 finding，不重复计数；
- 关闭根因，而不是逐个关闭表象；
- 不把"看起来像"的 prohibition 或规则做 fuzzy 删除；consolidation 只合并
  可证明同源的项。

## 5. Bounded Continuation

- 保持既有边界（scope/phase firewall、minimum-sufficient、bounded
  surfaces）；
- 出现 fail-worthy finding 后，**不 fail-fast**：继续完成剩余可靠且 bounded
  的扫描面，记录 material blockers；
- hard-stop 只限于不可恢复的锚定失败（required source missing/unreadable、
  scope fundamentally indeterminable、continuation 需要发明行为）；
- 最终结论基于完整扫描面，而不是第一个 finding。

## 6. 边界

本文件不声明、不授权：

- 平台 / runtime / workflow engine / 数据库 / autonomous reviewer / 新输出
  schema / Gate redesign / acceptance-condition ledger；
- 修改 ESS、code-review schema、Solution Reviewer Gate / Development Path /
  Tail 语义、PCE、D10/D10-B、Advanced 11-14；
- 证明模型智能或度量"推理质量"。
