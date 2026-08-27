# Decision-066：跨项目治理状态与 PKB 入站边界统一（Current User 裁决）

## 状态

Accepted（2026-08-28，Current User 裁决：统一 AI-SDLC 与 PKB 的权威边界和
授权/收口流程；AI-SDLC 写入 PKB 必须通过 Exchange，已成立裁决不因同步延迟失效）

## 背景

Decision-053 已确认 Control Plane `projects/ai-sdlc` 是 AI-SDLC 当前执行状态
与授权/收口登记的权威，并恢复 Exchange 必经收口流程。随后在同步 Decision-065
的 E0 授权时发现，现有 `STATE.yaml` 已混入大量历史 Review、CI、PR、已关闭
finding、已消费 authorization 和旧转换，且当前字段彼此冲突：产品 Decision
已经授权 E0，CP 仍登记为授权待决。

进一步核对 Control Plane、Exchange 与 Personal-KB 后确认：各产品应共享同一套
Decision / Governance / STATE / evidence 权威分工；唯一的项目专项分叉是 PKB
写入路径。PKB 可以按自身治理写自己的仓库，而 AI-SDLC 材料进入 PKB 时必须
经过标准 Exchange Publisher。

## 问题

1. Current User 裁决、产品 Decision、CP Governance、CP STATE、Exchange、
   PKB、Handoff/current 各自应拥有什么权威？
2. 授权与收口事件应按什么顺序持久化？
3. AI-SDLC 与 PKB 的写入边界应如何区分？
4. 已授权但因治理整改暂停的 E0 应如何恢复，而不被误判为重新待授权？

## 决策

1. **权威边界统一**：
   - Current User 作出授权、接受、风险接受、Ready、merge、发布、收口和重大
     路线调整等最终裁决；裁决不依赖某个同步文件完成才生效；
   - AI-SDLC 产品仓保存 Roadmap、产品合同、Decision、代码、测试、PR、CI 和
     实现事实；
   - Control Plane 项目 Governance 保存长期执行规则；STATE 只保存当前
     Requirement/Sub-requirement、Gate、blocker、live authorization、active
     work、lifecycle、publication 和下一转换；
   - Exchange 固定为 `transport_only`，只负责不可变 Handoff、来源和哈希锚定
     及 pointer 导航；
   - PKB 只保存选定材料的长期派生归档和导航；
   - Handoff/报告记录一次执行、复审、修正或收口的证据，不自动形成 Decision、
     用户授权、项目 PASS、收口或下一阶段权限；
   - `current.*` 只导航；对话记忆不构成持久权威。
2. **授权事件**：

   ```text
   Current User 裁决
   -> 产品仓 Decision 持久化
   -> CP 更新当前快照
   -> 如需长期交接，发布 Exchange 标准 Handoff
   -> PKB 选择性归档
   -> CP 登记 publication 结果
   ```

   Exchange/PKB 发布不是授权生效条件；发布失败不回退授权。
3. **收口事件**：

   ```text
   实现事实进入产品仓
   -> 独立复审
   -> Current User 收口裁决
   -> 产品 Decision
   -> CP lifecycle=CLOSED / publication=PENDING
   -> Exchange 标准 Publisher run + pointer
   -> PKB 新 Handoff + current 同 commit
   -> CP publication=COMPLETED
   ```

   lifecycle 与 publication 是两个独立维度。发布失败时 lifecycle 保持 CLOSED，
   publication 保持 PENDING 或 BLOCKED。
4. **PKB 入站分叉**：
   - PKB 自身治理写入由 PKB 自己的 Decision、Governance、writer 和 Git 规则
     控制，不需要 Exchange；
   - 任何 AI-SDLC 材料进入 `10-projects/ai-sdlc-standard/**`，必须先产生标准
     Exchange Publisher run 和 pointer，再由 PKB 受控消费；AI-SDLC 不得直接
     修改 PKB 命名空间。
5. **STATE 收敛**：Control Plane 建立严格 current-snapshot schema；完整历史、
   Decision/Review/CI/PR/Handoff 正文、已关闭 finding 和已消费 authorization
   不得继续保存在当前 STATE。
6. **历史修复**：已经进入 Exchange main 的 run 不修改、不删除；不符合标准
   Publisher 合同但仍需保留的材料，只能通过新 run 的 `supersedes` 和新 pointer
   追加纠正。
7. **E0**：Decision-065 的 E0 授权持续有效。本治理整改只修复登记，不重新申请
   授权。E0 当前仍受 Current User 暂停指令约束；治理整改完成后仍需明确恢复
   指令才开始执行。

## 原因

产品 Decision、当前控制状态、传输和长期归档具有不同生命周期。把历史证据复制
到 STATE 会使旧 Gate、旧 owner 和旧转换与当前事实并存；把 Exchange 或 PKB
当成授权来源则会反向改变产品权威。统一骨架并只保留 PKB 入站分叉，既能减少
重复规则，又能保留 AI-SDLC 跨仓交接所需的不可变 provenance。

## 影响

- Control Plane Shared Protocol、AI-SDLC Governance、PKB Governance、注册元数据
  和 STATE schema 将按本 Decision 收敛；
- Personal-KB 需以自身 Decision 固化 PKB 自写和 AI-SDLC Exchange-only 入站；
- AI-SDLC/PKB/ACP STATE 将迁移为 current-only v2；
- PKB current surfaces 将恢复为导航；
- 已识别的非标准 Exchange run 将按 append-only 规则纠正；
- E0 不重新授权、不自动执行，最终登记为 authorized / not started / user paused。

## 实现状态

本 Decision 随 ACP-R2 第一批治理合同落盘。以下是该落盘时点的历史状态：
Control Plane、Exchange、PKB 和 STATE 迁移仍在执行中；完成前不得宣称治理
整改或 publication 已收口。

### 2026-08-28 实现状态补充

- AI-SDLC 产品侧的权威边界和 Roadmap continuity 修正已进入本提交；Roadmap
  不再保存会与 Decision/STATE 漂移的动态授权断言。
- 跨仓 publication 的当前进度只由 Control Plane STATE 登记，本 Decision
  不复制或冻结 Exchange/PKB current 状态。
- Decision-065 的 E0 授权持续有效；E0 明确为 `started: false` 且由 Current
  User 暂停。治理整改和 publication 完成均不自动恢复 E0。
- E2-P、E1～E5 与下一轮 C05 没有因本补充获得授权。

## 依据

- Current User 2026-08-27/28 连续裁决的权威边界、授权流程、收口流程与 PKB
  写入分叉；
- Decision-053（Control Plane 当前状态权威与 Exchange 必经收口）；
- Decision-065（E0 活动合同收口包已授权）；
- Control Plane `projects/ai-project-control-plane/ROADMAP.md` ACP-R2；
- Control Plane `projects/ai-project-control-plane/plans/ACP-R2-CROSS-PROJECT-GOVERNANCE-STATE-CONVERGENCE.md`；
- Exchange `EXCHANGE_POLICY.md` 与 Publisher v1.1；
- PKB `AGENTS.md`、`DECISIONS.md`、外部发布与 Exchange 消费规则。
