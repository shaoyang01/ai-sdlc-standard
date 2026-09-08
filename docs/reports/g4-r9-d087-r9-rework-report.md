# G4-R9 / D-087 复审整改交付报告

> 文档性质：G4 第九轮复审（R9，结论 **FAIL**：F1/F4 各一组 P1 残余；F2/F3/S1 CLOSED、S2 非阻塞建议）逐条整改的交付与验收证据。
> 复审报告权威边界：G4-R9 handoff 包 `REPORT.md`（2026-09-08，基线 `670de7e..6b64dad`）。
> 整改基线：`6b64dad`（分支 `feature/c03-e5-autonomous-acceptance`）。本轮变更：**3 个文件（2 生产代码 + 1 测试），+135/−43 行**（另含本报告）。
> 结论口径：本报告只陈述修复内容与独立验证证据，**不宣称 G4 收口**；关闭判定等待下一轮独立复审。

## 0. 整改顺序与范围

按 Current User 指定顺序 **F1 → F4** 执行，S2 非阻塞建议顺手完成，均在同一分支、同一提交集内。每项修复后立即跑对应复现探针与回归矩阵；末轮做全量验证。本轮不触碰 F2/F3/S1 已关闭形态与 R8 八项冻结方案。

## 1. F1 内容对账将派生回流行误当作 agent 原始 ledger 成员（R9 PARTIAL/P1 → 已修复）

**根因**（R9 报告 §6 F1）：`registerTerminalFindingsInTransaction` 先把 §5.4 合成回流 draft（`registerReflowFinding=true` 时追加的 HIGH/SOLUTION 行）推进 `drafts`，再用**扩充后**的 drafts 对账证据 blob 的原始成员——合法 FAIL/ESCALATED verdict 携带非 SOLUTION 原始 finding（如 HIGH/REQUIREMENT）时，blob 1 个成员对 drafts 2 条，长度/逐项比较失败，整次登记被 `ILLEGAL_TRANSITION` 拒绝（terminal `FINDING_REGISTRATION_INVALID`、零写入、无下游派发）。

**修复**（`core/loop-run-store.ts`）：把 blob 内容对账移到合成**之前**，对账集合改为 agent 的原始 `registration.findings`（数量 + 按序 severity/category/causeKind 逐项门全部保留）；对账通过后再按现役规则合成回流 draft（agent 已发 SOLUTION 行时禁止重复合成的守卫不变）。语义边界：证据 blob 的原始成员与经 terminal directive 派生的回流事实在同一个注册边界内分清——合成行不冒充 blob 成员，blob 借用/severity 漂移门不删。合成行 `createdAt = event.createdAt` 的收据归属与原子失效、replay 归属解释不变。

**复现验证**（`r9-verdict.ts`，修复前两格 FAIL → 修复后 2/2 PASS）：

| 用例 | 修复后观测 |
| --- | --- |
| valid-reflow-FAIL（CONFIRMED+FAIL/STANDARD，原始 HIGH/REQUIREMENT） | terminal succeeded、0 errorCode；findings = REQUIREMENT(OPEN) + SOLUTION(OPEN) 原子落库；task-planning 零派发；run failed/READY（回流阻断保持） |
| valid-reflow-ESCALATED（ESCALATED+PASS/DEEP，原始 HIGH/REQUIREMENT） | 同上 |

**回归矩阵**：`verdict-content` ×{FAIL,PWR}×{REQUIREMENT,SOLUTION} 4 格 PASS（FAIL+SOLUTION 不重复合成、PWR 不合成）；`severity-HIGH-MEDIUM / CRITICAL-HIGH / HIGH-HIGH` PASS（借用/severity 漂移门不回归）；`membership-false/true`、`rounds-replay`、`rounds-source-anchor` PASS（收据/count/跨轮 producer/重放归属不变）；r8 归档探针 count-drift/b2/directive/version/provenance/root-inventory/admission/direct-entry 全部 exit 0；lifecycle 351、artifact-revision 237、envelope 44、fix-round 27、六场景 45（见 §4）。

## 2. F4 marker 写入与读取对"已有无效对象"解释相反（R9 PARTIAL/P1 → 已修复）

**根因**（R9 报告 §6 F4）：`writeProductionContainmentMarker` 以 `existsSync` 短路——marker 路径被无效文件/目录占用时**假写成功**；`readProductionContainmentMarker` 把解析/读取失败一律当"无标记"——同一持久锚点的写入成功条件与读取缺失条件相反。SQL block 写失败后重入：COMPLETED 出口假成功（success/COMPLETED 复用未终验输出）、BLOCKED/failed 出口再次派发。

**修复**（`runtime.ts`，沿用现役 marker，不建第二恢复系统）：

1. **reader 三态化**：`"present"`（读到合法 PRODUCTION_ISOLATION_VIOLATED marker）/ `"absent"`（可验证的 ENOENT）/ `"invalid"`（路径被不可读对象占用、内容损坏或 reasonCode 不符）。`invalid` 不再等同"无标记"。
2. **writer 写入语义收紧**：`present` 幂等返回；`invalid` 抛 `ProductionRunError(PRODUCTION_ISOLATION_VIOLATED)`——锚点被异常对象占用不是成功写入，也**不覆盖占用者**（占用者本身可能是证据）；`absent` 写入后**回读验证**，只有合法 marker 读回才算持久成功；I/O 失败如实包装传播。
3. **重入门**：`present` → 现役 heal + BLOCKED 零派发不变；`invalid` + 该 requirement 尚无 journal run 事实 → 视为首次调用放行（终验若确认隔离违规，会经 writer 撞同一锚点异常并如实抛错）；`invalid` + journal 已有 run → 未处置隔离，fail-closed 阻断（heal 幂等补写、零派发 BLOCKED/PRODUCTION_ISOLATION_VIOLATED）。

**复现验证**（`r9-independent.ts` isolation 十五格；occupied 六格修复前 second/third FAIL → 修复后全绿）：

| 出口 × 占用（file/directory） | 首调 | 第二/三次调用 | 派发 | 占用者 |
| --- | --- | --- | --- | --- |
| success | 抛 ProductionRunError(PRODUCTION_ISOLATION_VIOLATED，注明占用未覆盖) | 均 BLOCKED 同码 | 0 | 字节不变 |
| blocked | 同上 | 均 BLOCKED 同码 | 0 | 字节不变 |
| failed | 同上 | 均 BLOCKED 同码 | 0 | 字节不变 |

六格共性：首调 preflight+终验各一次（firstInspections=2）、重入零 db 变化、journal 保持 running/reason=null（持久化失败如实可观测）。标准九格（WIP/base/写失败 × 三出口）全部保持 R8 修复形态：首调 BLOCKED/如实抛错、重入 BLOCKED 零派发、marker 合法可读。occupied 格的 `marker_valid` 布尔与 `occupier_unchanged` 断言互斥（占用者受保护时合法 marker 不能占据同一路径），按 R9 复审对不适用布尔值的条件跳过口径解读，不作为行为判据；行为判据为首调抛错、重入 BLOCKED、零派发、零 db、占用者字节不变。nonreal/non-inspect 兼容（`r9-nonreal.ts` 两格）与非 occupied path 五格均 PASS：非 real 链路不受 marker 影响、marker 字节不变。

## 3. S2 六场景 s4 captured 单槽（非阻塞建议 → 顺手完成）

`tests/loop-d087-six-scenario-matrix.test.ts`：单槽 `captured` 改为按 capability 分槽采集。task-planning 与 implementation 各自独立断言 staged 正文含 RISK-1 与 decisionDeltaRef；stdin 按各节点实际载体形态断言（诊断确认：task-planning 为 staged-only 载体、stdin=null，implementation 为 stdin+staged 双载体——与现役派发设计及 R8/R9 provenance 探针一致）。断言数 44 → 45，六场景 45/0 全绿。原单槽断言只承重 implementation——分离后 planning 载体首次独立可判。

## 4. 全量验证

| 验证 | 结果 |
| --- | --- |
| `tsc --noEmit` | 退出 0，无诊断 |
| 159 个测试文件**逐文件串行**（157 TS + 2 shell） | **159/159 全绿**（157 TS 0 失败；bootstrap-knowledge-target 557/0、manual-chain-fixture 87/0；含六场景 45/0、fix-round 27/0、lifecycle 351/0、artifact-revision 237/0、envelope 44/0、run-production 20/0、WP4 122 / WP5 177 / WP6 34） |
| R9 复现探针 | `r9-verdict` 2/2 PASS；`r9-independent` 46 格全绿（severity 3、batch 12、batch-atomic、verdict-content 4、membership 2、rounds-replay、direct-a4、knowledge-self、rounds-source-anchor、isolation 15、path 5）；`r9-opaque`、`r9-mc`、`r9-nonreal` 2 格、`r9-lifecycle-replay` 2 格全 PASS |
| R8 归档探针（11 个） | 8 个 exit 0；2 个在已知修复后行为点中止（registration SEVERITY 段、production write-failure 格），其完整行为按交接指示以容错副本验证：registration BATCH 段 10/10 全绿、production 九格由 r9-independent isolation 承重；admission 末尾 DIRECT_A4 无效请求为旧探针问题，不计证据 |
| 定向变异 M-A/M-C/M-E/M-F | **4/4 捕获**（独立副本施加：M-A envelope 43/1 缺字段负例变红；M-C fix-round exit 1；M-E fix-round 26/1 v4 版本门负例变红；M-F fix-round 26/1 journal 顺序门负例变红；逐项还原后 tracked 与候选字节 diff 为空） |
| Ruby 校验器 ×3 | validate-skill-contracts / validate-compact-prompt-contracts / validate-capability-metadata-chain 全部 exit 0 |
| control-plane validate_state | 只读校验 R9 包内 STATE 快照 PASS v2；未更新 STATE |
| 环境 | Node v24（better-sqlite3 原生模块冒烟通过）；全量逐文件独立进程串行 |

## 5. 探针复跑的两处已知中止（沿 R8 口径，非回归）

1. `r8-registration-probes.ts` SEVERITY 段：R8 修复后 severity 边界改写在 store 对账处 fail-closed，探针在该观测点中止；BATCH 段不受影响且本轮容错复跑 10/10 全绿。
2. `r8-production-probes.ts` fullDrift write-failure 格：修复后首调抛 `ProductionRunError`（明确传播持久化错误的现役行为），探针该行无 catch 中止；九格完整行为由 `r9-independent` isolation 十五格容错验证。

## 6. 边界

- 不使用 SDLC/DocFlow 治理本线；未调用 DocFlow、未更新 Control Plane STATE（只读校验除外）。
- 未修改其他工作线：D091（分支 `codex/d088-governance-corpus` 与 governance-corpus worktree）未触碰；本轮改动仅 `core/loop-run-store.ts`、`runtime.ts`、`tests/loop-d087-six-scenario-matrix.test.ts`。
- 未扩展 G5/G3/C03-B/WP6 建设范围；containment 标记沿用现役 controlRoot 边界与冻结方案，未建第二恢复系统、未扩充释放协议。
- R8 复审报告 §7"不作为缺陷"清单与 R8 整改八项选定方案保持冻结，未重开。
- **不宣称 G4 收口**：F1/F4 是否由 PARTIAL 转 CLOSED、G4 是否具备 PASS 条件，等待下一轮独立复审裁决；测试全绿不作为收口解释。
