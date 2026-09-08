# AGENTS.md — 治理导航（去哪里读什么）

本文件只做**导航**，不重复任何规则正文；规则、状态、决策一律以下列权威源为准。
所有跨仓引用使用 GitHub 地址，不依赖本地路径。新会话恢复时，先读 Control Plane STATE，再按其 `source_refs` / `next_transition.condition_ref` 导航。

## 1. 当前状态 / 授权 / 生命周期（动态，恢复入口）

- AI-SDLC 当前控制状态（active requirement/sub、Gate、open blocker、live authorization、active work、lifecycle、publication、next transition）：
  https://github.com/shaoyang01/ai-project-control-plane/blob/main/projects/ai-sdlc/STATE.yaml
- 当前位置、授权是否成立、下一步，只从 STATE + 决策索引解析，**不从对话记忆或方案文字推断**。

## 2. 治理规则与协议（durable）

- AI-SDLC 项目级治理（Controller/Specialist/Execution 路由、证据等级、发布与归档规则）：
  https://github.com/shaoyang01/ai-project-control-plane/blob/main/projects/ai-sdlc/GOVERNANCE.md
- 共享控制协议 / 会话生命周期：
  https://github.com/shaoyang01/ai-project-control-plane/blob/main/protocols/PROJECT_CONTROL.md
  https://github.com/shaoyang01/ai-project-control-plane/blob/main/protocols/SESSION_LIFECYCLE.md
- STATE 结构约束与校验：
  https://github.com/shaoyang01/ai-project-control-plane/blob/main/schemas/STATE.v2.schema.json
  （校验工具 `tools/validate_state.rb`；改 STATE 走分支 + PR 合 main）

## 3. 本产品仓内（决策 / 路线图 / 合同 / 实施事实）

- 决策索引（Decision-046 起，一决策一文件）：`docs/decisions/README.md`；Decision-001～045 合订本：`docs/AI-SDLC-Decision-Records.md`
- 路线图：`docs/AI-SDLC-Autonomous-Delivery-Roadmap.md`
- 产品合同：`docs/LOOP_CORE_CONTRACT.md`
- 规划 / 稳定任务集 / 接线设计 / Handoff：`docs/LOOP-CORE-C03-E-PLAN.md`、`docs/reports/`
- 代码、测试、PR、CI 等实施事实：本仓 Git 历史

## 4. 跨仓发布与长期归档

- Exchange（transport-only 不可变传输：immutable runs、`current.yaml` 指针；Issue + `exchange-publish` 驱动）：
  https://github.com/shaoyang01/project-governance-exchange
- PKB 长期归档镜像（`current.md` / `handoffs/` / `audits/` / `prompts/`）：
  https://github.com/shaoyang01/personal-knowledge-base/tree/main/10-projects/ai-sdlc-standard

## 5. 权威分工（导航口径）

产品仓记决策 / 路线图 / 合同 / 实施事实；Control Plane STATE 记动态当前位置；Exchange 只做不可变传输；PKB 做长期归档。STATE 不复制决策正文、不做第二规划权威；Current User 裁决效力最高。
