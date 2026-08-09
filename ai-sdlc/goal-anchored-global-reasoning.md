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
（适用面清单；GRP01-R2 冻结）：

Direct impact 五维（适用于每个 material finding，见第 3 节）：

```text
1. caller / callee or dependency
2. consumer
3. state / data
4. failure / compatibility
5. verification
```

Skill-specific material surfaces：

```text
Specification Writer:
  ESS required sections、behavior constraints、flow/state/data、测试方案、
  old-flow compatibility

Solution Challenger:
  scope/phase firewall 面、existing mechanism、minimum-sufficient、
  30 challenge dimensions

Solution Reviewer:
  schema coverage 面、behavior safety 面、risk/test 面、
  Gate / Development Path / Tail decision 面

Speckit Analyze:
  route/spec/plan/tasks/entry-coverage consistency 面、
  readiness / Gate blockers 面

Code Review Excellence:
  caller/callee、consumer、state/data、failure/compat、verification
  （代码审查面）
```

- 每个 Skill 的局部示例（SKILL.md、references）必须 defer 到本清单
  （引用本文件），不得在局部重新定义更窄的清单；narrowing 是 contract
  violation（GRP01-R2 由 validator 拒绝）。
- 某 surface 对当前 goal 不适用时，显式标记 `NOT_APPLICABLE`（或中文
  `不涉及`），不得省略该 surface 的结论，也不得为此创建新输出 schema 或
  新字段记录它。
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
