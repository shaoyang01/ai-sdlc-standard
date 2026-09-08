# C03-E-PRE-RUN 冻结执行计划：项目治理初始化与双执行面合同收口

> Version: 1.0.0
> Status: FROZEN_PLANNING_BASELINE
> Decision: [Decision-090](../decisions/Decision-090-c03e-prerun-governance-readiness-replan.md)
> Date: 2026-09-04
> Execution authorization: NONE；本文可用于恢复、复核和申请逐包授权，不自行授权代码修改

## 1. 目标与恢复原则

本计划解决两个在 LOOP runtime 继续开发前必须关闭的生产前提：

1. 任意目标项目经一次初始化后，都具备适配当前 7+1 单轨流程的知识沉淀规则、骨架、代码事实或可审计迁移结果；
2. 当前手动 Skill 链先恢复为无循环、产物稳定、manifest 完整的生产路径，runtime 随后按同一语义合同自动化并以 parity 证明等价。

Fresh Controller 恢复时只需读取：Control Plane `projects/ai-sdlc/STATE.yaml` → Decision-090 → 本计划 → 对应工作包的授权/证据。不得用聊天记录或旧 Round Prompt 推导当前位置。

## 2. 冻结不变量

1. `MANUAL_FIRST`：先达到 `MANUAL_OPERATIONAL`，再恢复 runtime 实施。
2. `RUNTIME_FOLLOW_UP`：runtime 是手动主路径的自动化执行面，不是第二套产品合同。
3. `SEMANTIC_PARITY_REQUIRED`：节点顺序、输入输出、深度裁决、Finding/Ledger/Gate、manifest、current/stale/superseded、准入、失败与回流结果一致；底层 journal/CLI/artifact store 可不同。
4. 单轨 7+1、solution-gate 双 binding 隔离、人工 Git handoff、PWR 自动推进保持不变。
5. `intake.manifest.json`、`manifest.md`、`knowledge-target.yaml` 各自单一职责，不得互相充当权威。
6. 未经逐包授权不得修改代码；任何真实业务仓初始化、迁移、Agent CLI、commit/push/PR 另取授权。
7. 现有 D-088-01 候选提交冻结，不从 Round 3 finding 直接续修，先回到需求重基线。

## 3. 目标状态示例（用于实施前校验理解）

| 输入事实 | 初始化结果 | 后续知识同步 | 允许自动猜测 |
| --- | --- | --- | --- |
| 新项目、无代码、无旧治理 | 生成 `.sdlc` 治理规则和空骨架；状态 candidate | Owner 确认目标后 routed | 否 |
| 既有代码、从未有知识沉淀 | 生成规则、骨架、入口事实、候选域和 EntryCoverage | 未确认前 PROPOSAL_ONLY | 只允许代码可验证事实 |
| 原版 SDD 项目 | 识别旧根与活动语义；分类保留知识、转换治理、退役旧流程、补齐新结构 | 仅新 `.sdlc` 活动目标可路由 | 否 |
| 原版 SDLC-SDD 项目 | 同上，并处理三份治理 YAML 与混合流程语义 | 旧 rail/owner 不得继续生效 | 否 |
| 类型不清或同一文件同时承载知识与旧流程 | `BLOCKED_AMBIGUOUS`，给逐文件清单，零部分升级 | 不可 routed | 否 |
| 手动新需求、用户显式要求 DEEP | 方案按 `user_requested/DEEP` 首轮产出，Gate 独立正式裁决 | Gate DEEP 且覆盖充分则继续 | Gate 不能省略 |
| 手动新需求、未指定深度 | 首轮按 `PROVISIONAL_STANDARD` 产出可审核方案 | Gate 升为 DEEP 时回流补强 | 不可把 provisional 当正式裁决 |
| Gate 多轮返工 | 两个稳定文件原位版本化；manifest 标记 current/stale/superseded | 下游只消费 current | 不得按文件名猜 current |
| runtime 同一输入 | 与手动路径得到相同深度、Gate、Ledger、manifest 投影和下一节点 | journal 仍是机器恢复权威 | 不得硬编码 STANDARD |

## 4. 工作包与依赖

```text
G0 治理基线传播（本轮）
  └─ G1 D-088-01 需求重基线与候选实现收口
       └─ G2 D-090-01 共同语义合同冻结
            └─ G3 D-090-02 手动主路径修复 → MANUAL_OPERATIONAL
                 └─ G4 D-087-01..05 按共同合同恢复/调整
                      └─ G5 D-090-03 runtime manifest 投影与 parity 接线
                           └─ G6 D-090-04 离线 parity 验收
                                └─ 申请真实 CLI run8
```

### G0 — 治理基线传播（本轮）

- **输入**：Current User 本次裁决、产品仓截至 `a626335` 的事实、Control Plane 当前 STATE。
- **产出**：Decision-090、Roadmap v2.5.0、本计划、Exchange immutable run、PKB 镜像、Control Plane STATE next transition。
- **完成条件**：四仓引用同一产品 commit；STATE 能由新会话恢复到 G1；任何 implementation authorization 均未消费。

### G1 — D-088-01 需求重基线与候选实现收口

- **目标**：把“生成 v2 骨架”重基线为“四类项目的一站式初始化/迁移”，然后再判断现有候选实现需要保留、修改或删除什么。
- **允许文件面（实施授权后）**：`scripts/bootstrap-knowledge-target.sh`、`scripts/bootstrap-entry-coverage-profile.sh`、`scripts/validate-skill-contracts.rb`、`skills/sdlc-knowledge-sync/**`、`tests/bootstrap-knowledge-target.test.sh`，以及明确获批的初始化合同/模板；业务仓零接触。
- **先产出**：D-088-01 v3 行为规格与逐文件迁移分类表，至少定义 `DETECT → PLAN → PREFLIGHT → APPLY → VERIFY → REPORT`，以及 `PRESERVE / TRANSFORM / RETIRE / ADD / BLOCKED_AMBIGUOUS` 判定。
- **实现约束**：默认无损、幂等、dry-run 零写入；模糊情况整体阻断；不得因迁移而覆盖人工知识；活动新表面不得残留旧 SDD/SDLC-SDD owner/rail 语义。
- **验收矩阵**：四类项目 × empty/partial/complete × map absent/candidate/routed × dry-run/apply/re-run；含符号链接、不可读、跨仓路径、人工改写、旧根混合语义和失败回滚。
- **完成门**：新规格经只读审查 Accepted；实现矩阵全绿；现有 R1/R2 findings 按新规格重新归因并关闭；不得以“旧 Round 全绿”代替。

### G2 — D-090-01 共同语义合同冻结

- **目标**：新增一个手动 Skill 与 runtime 共同消费的权威合同，不在 Skill prompt、runtime code 和业务产物中分别定义流程。
- **建议权威文件**：`ai-sdlc/manual-runtime-semantic-contract.md`；并更新 `ai-sdlc/node-capability-contract.md`、`ai-sdlc/artifact-flow.md`、相关 schema/模板引用。
- **必须冻结的字段**：
  - 七节点及 solution-gate 两角色的输入、输出、stable path；
  - `initialDepthBasis`、`decisionDepth`、`decisionStatus`、升档回流；
  - Finding identity、Ledger 与 Gate 的轮次/current/stale/superseded；
  - `manifest.md` 的创建者、更新者、原子发布、digest 交叉绑定与修复模式；
  - journal ↔ manifest 投影、失败码、回流节点、下游准入；
  - PWR 自动推进且无 risk acceptance proof 仪式。
- **首轮深度冻结值**：显式用户深度 → `user_requested`；未显式指定 → `PROVISIONAL_STANDARD`；正式深度仅由 formal_verdict 输出。
- **Gate 产物冻结值**：
  - `library/{id}/02-方案审核/{id}_FindingLedger.md`
  - `library/{id}/02-方案审核/{id}_方案审核.md`
  两个稳定文件，不用 `-R1/-R2` 文件名承载生命周期。
- **manifest 冻结值**：`sdlc-requirement-intake` 为新需求创建；其他节点用确定性 publisher 更新；无 manifest 的存量 requirement 由 reconcile 模式根据文件+digest 重建，歧义时 STOP。
- **完成门**：合同无相互矛盾；模板/Skill/runtime 的变更清单和负向矩阵可机械验证；Solution Gate 双 binding 边界未削弱。

### G3 — D-090-02 手动主路径修复

- **目标**：不依赖 LOOP runtime，用户手动唤醒 7+1 Skill 即可稳定完成一条 requirement 主链。
- **实施面**：7 个现役 `skills/sdlc-*`、对应 templates/validator、manifest 确定性 publisher/reconcile 工具；不修改 runtime gateway。
- **子任务**：
  1. 移除 solution-design 的 Gate 深度前置循环，接入 `initialDepthBasis`；
  2. 固定 Ledger/Gate 两个稳定路径与角色边界；
  3. intake 创建 requirement manifest，后续节点原子更新；
  4. 多轮 Re-Gate 正确标记 current/stale/superseded；
  5. 清除 Decision-086 已取消的 risk proof 残留；
  6. 为缺 manifest 的既有 `library` 提供 fail-closed reconcile。
- **手动验收场景**：LIGHT/STANDARD/DEEP、无显式深度、升档返工、Gate FAIL/PWR/PASS、需求变更最早节点回流、缺 manifest 修复、损坏 manifest 阻断、双角色同 binding 拒绝。
- **完成门 `MANUAL_OPERATIONAL`**：至少一个隔离 fixture 从 intake 到 knowledge-sync 全链无人工补文件/改状态；至少一个真实业务需求只读重放证明相同准入结果；不要求 runtime 已对齐。

### G4 — D-087-01..05 恢复与调整

- **保留方向**：production assembly factory、node result model、Finding materialization/routing 三条 seam。
- **调整点**：
  - `D-087-01` production entry 增加项目初始化/requirement manifest readiness preflight；
  - `D-087-02` node result 承载真实 `initialDepthBasis/decisionDepth/decisionStatus`，禁止 hardcode；
  - `D-087-03` Finding materialization 使用 G2 的 identity 与 Ledger/Gate 生命周期；
  - `D-087-04` code-review auto-reroute 使用共同 earliest-affected-node 语义；
  - `D-087-05` Skill path fix 同时验证 `.sdlc` 初始化结果可被 runtime binding 解析。
- **授权规则**：原 `GW_VERTICAL_REBUILD` 保持未消费；达到 G3 后由 Controller 对上述 delta 做一次 decomposition assessment，再由 Current User 决定是否沿用原授权。

### G5 — D-090-03 runtime manifest 投影与双路径接线

- **目标**：runtime journal/artifact store 保持机器权威，同时确定性地产生与手动路径相同的 `manifest.md` 人工视图。
- **实现面**：runtime production entry、artifact revision/journal recovery、manifest projector、node output envelope；不得让 Agent 自由文本直接写生命周期权威字段。
- **必须修复**：gateway `STANDARD` 硬编码；envelope 的陈旧 riskAcceptanceRefs 强制；formal_verdict 重复 Finding 来源；manifest 创建/更新缺口。
- **完成门**：相同 fixture 的 manual trace 与 runtime trace 归一化后完全等价；journal/manifest digest 不一致时 STOP_AND_REPORT。

### G6 — D-090-04 离线 parity 验收

- **矩阵**：四类项目初始化 × 三档深度 × PASS/FAIL/PWR/BLOCKED_UNKNOWN × 首轮/升档/Re-Gate × manifest new/reconcile/corrupt × crash/resume。
- **比较对象**：节点序列、两个 Gate 角色、stable artifact paths、版本/current/stale、Finding identity、decisionDepth、next eligibility、earliest reroute、最终 handoff 状态。
- **完成门**：全部离线场景通过；无 shadow executor 替代生产入口；随后才允许申请真实 CLI run8。

## 5. 文件影响地图（计划，不等于授权）

| 工作包 | 主要文件面 | 禁止夹带 |
| --- | --- | --- |
| D-088-01 | bootstrap/profile/validator/knowledge-sync/tests | 业务仓迁移执行、runtime 改造 |
| D-090-01 | `ai-sdlc/**` 合同、templates、schema/validator 设计 | Skill/runtime 行为实现 |
| D-090-02 | 7+1 Skills、templates、manifest publisher/reconcile、tests | runtime gateway、真实业务写入 |
| D-087-* | production assembly、node result、Finding/reroute、Skill resolution | 重新设计单轨或 PWR 政策 |
| D-090-03 | gateway/journal/recovery/envelope/projector/tests | 第二份业务生命周期 schema |
| D-090-04 | fixtures/harness/acceptance reports | 真实 CLI 或业务仓副作用 |

## 6. Review 与授权节奏

每个 Gate 均执行：事实快照 → 合同/不变量复核 → 方案或实现 → 本地矩阵 → 一次根因合并式只读复审 → Current User 裁决。仅修复已确认 blocker；同一根因变体不得拆成无尽 Round。复审 PASS 只证明该包满足冻结合同，不自动消费下一包授权。

## 7. 回家后的唯一恢复动作

1. 读取 Control Plane STATE，确认 `next_transition.target = D088_REQUIREMENT_REBASELINE_REVIEW`；
2. 读取 Decision-090 与本计划 §4/G1；
3. 重新冻结 D-088-01 v3 行为规格和存量逐文件分类表；
4. 对截至 `a626335` 的候选实现做一次**相对新规格**的只读差距审查；
5. 输出有界修复清单并停等 Current User 实施授权。

禁止从旧 Round 3 Prompt 续跑，也禁止先恢复 D-087 或 runtime 编码。
