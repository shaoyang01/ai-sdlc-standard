# Decision-079：冒烟 run3 停驻裁决与问题修复波立项（W-GW-DIAG / W-GW-PREP）

## 状态

Accepted（2026-09-01，Current User 逐项裁决汇总：冒烟停驻不收口、先修问题再
重发冒烟；P-A～P-I 处置逐项裁定）

## 背景

- W-GW-FIX 修复后冒烟重跑（台账 §3 回填块，commit `0716e82`）：真实链越过旧
  4ms 死点，intake/design/gate（scan+verdict）全部真实 succeeded，于 gate 后
  合法停等——hermes 裁决 `PASS_WITH_RISK`（ADV-001 [LOW] / ADV-002 [MEDIUM] /
  ADV-003 [MEDIUM]，均为对三项 spruce 缺陷方案的实质对抗发现）。
- 重跑过程暴露问题清单 P-A～P-I（台账同块），Current User 要求逐项讨论后统一
  落文档。本 Decision 即该汇总裁决。

## 问题

1. 链停在 gate 后且"放行/返工"没有合法入口（P-E）——人机回路断在最后一步；
2. 生产门对 fresh run 必然 WORKSPACE_NOT_FOUND（P-B）——deterministic 演练实证；
3. 后进程输出失败丢失全部进程证据（P-A）——本次定位靠 kimi 会话日志考古；
4. 冒烟本链的去向需要裁决：继续（无法执行）、收口、还是停下修复后再来。

## 决策

1. **run3 停驻、不收口**：`run-REQ-LOOP-GW-mtic6mh6-1788247153486` 以 gate 后
   BLOCKED 作为诚实停驻点记账；冒烟波不关闭，**待问题修复波落地后重新发起
   全新冒烟 run**（旧 fixture 在 /tmp 易失目录，台账已引述全部持久性证据）。
2. **波 1 `W-GW-DIAG` 立项**（一个 Decision 覆盖三个小修，主题=可诊断性与
   人机回路）：
   - **P-E 方案 1（最小释放门）**：`loop-run --resume <runId> --release
     <RISK_ACCEPTED|SCOPE_RESET> --release-note <text>`——closed 旗标增量；
     runtime 侧把释放事件（含操作者与 note 审计字段）写入 journal；枚举
     「停驻状态 × 合法释放码」fail-closed 矩阵，不给万能钥匙；通知钩子与决策
     卡渲染不在本步（入口 agent 义务已由协议 step 4 承载，`0fa3cf8`）；
   - **P-A 方案 1（证据包装延伸到后进程段）**：gateway 拿到 adapter 结果之后
     的失败（空最终文本检查、E3 信封解析、产物构造）统一按 adapter 错误同款
     携带 `processEvidence` 重抛，真实错误码保留，不再一律无证据
     EXECUTOR_EXCEPTION；fail-closed 语义零变化；
   - **P-I（顺手修）**：注入 stores 时 `RuntimeResult.journal_path` 回填
     `runStore.databaseFilePath`。
3. **波 2 `W-GW-PREP` 立项**（独立小波，与波 1 无依赖可并行）：P-B 按 C1——
   `ProductionRunDeps` 增可选 `prepareWorkspace` 注入，提供时内核先 prepare 后
   inspect（既有测试注入行为零变化）；loop-run 把真 manager 两步接上，头注释
   的 W3 只读边界随本裁决改写；测试用真实临时 git 仓（fixture 模式现成）。
4. **P-C/P-D（物化器与一致性）**：方向认可——链尾单点物化全部七个节点
   current revision（按 stable_path），**canonical 内容覆盖 agent 自写文件**，
   漂移（digest 差异）写进交付报告；**时机缓**——随交付尾波立项，sdlc-* skill
   的 library 自写指引是否随之调整同波裁。
5. **P-F（信封合规概率）**：观察不立项；P-A 落地后每次不合规都会留下真实
   证据，积累数据后另议定向重试提示。
6. **重发冒烟口径**：波 1、波 2 落地并验证后发起全新冒烟 run（经 run() 真实
   链不变）；预期流程=全新 run → gate 停等 → 决策卡（协议 step 4）→ 经新释
   放门放行 → 全链首次端到端推进。届时 PASS_WITH_RISK 的风险接受即 ADV-002/
   003 条件（发布前文档化 breaking change、实现期静态 oracle）——若新 gate 裁
   决不同，按新卡再裁。
7. **边界不变**：D2（生产门 real 通道）继续挂账；E5-L3 冻结；②③停等至冒烟
   全链 PASS；零业务仓远程 Git 副作用；不请求 C05。

## 原因

- 停驻不收口：run3 已产出充分的修复有效性证据（旧死点消除 + gate 真实对抗），
  但全链未通；继续推需要释放门（不存在），收口则浪费已到 gate 的势能——先修
  再来是唯一同时尊重证据与治理的路径；
- 波 1 捆绑三个小修：主题同（可诊断性/人机回路）、文件不相交（loop-run/runStore
  vs gateway）、一次 Decision 一次复审；
- P-B 独立：它阻塞的是 deterministic 生产门与入口触发理想流程（非 real 专属），
  与波 1 无依赖，并行推进最短路径。

## 影响

- STATE：open blocker `C03_LOOP_GW_SMOKE_WIRING_GAP` **关闭移出**（修复
  `69f72cd` 落账 + 重跑已执行，关闭条件达成）；`GW_WIRING_FIX` /
  `ENTRY_TRIGGER_D3_DETERMINISTIC` 两条授权消费移出；新增
  `GW_DIAG_WAVE` / `GW_PREP_WAVE` 授权；`active_work` → `W-GW-DIAG`；
  `route_state` → `C03_LOOP_GW_DIAG_WAVE_IN_PROGRESS`；`next_transition` →
  波 1 实施 → 波 2 → 重发冒烟；
- runtime 仓新增两条实施事实链（波 1：loop-run/runStore/gateway；波 2：
  runtime 内核 + loop-run 接线）；完成后各自回填台账并验证；
- ②主测/③批量维持 PENDING；spruce 零写入不变（run3 的 prompt-input/ 与
  library/REQ-LOOP-GW-mtic6mh6/ 为 agent 与 staging 行为的既成事实，登记在案，
  不作为 wave 产物）。

## 实现状态

- 产品仓：本 Decision + 决策索引行 + 台账处置去向回填（本 commit）；
- Exchange/PKB/CP 传播：随即按常设授权路径执行，回执回填台账 §5；
- 波 1 / 波 2 实施：待开工（本 Decision 即授权）；重发冒烟：波 1、波 2 验证
  后发起。

## 依据

- 台账 §3 W-GW-FIX 回填块与发现问题清单（`0716e82`）
- Decision-078（波次治理路径与边界先例）
- 协议 step 4 决策卡硬义务（`0fa3cf8`）
- 代码证据：`loop-run.ts` closed 旗标面、`loop-run-state.ts:501` 释放码语义、
  `real-capability-gateway.ts:226/231` 后进程抛点、`runtime.ts:300/716`
  （stable_path 元数据、journal_path null）、`core/loop-git-workspace.ts`
  inspect/prepare 语义
