# G4-R8 / D-087 复审整改交付报告

> 文档性质：G4 第八轮复审（R8，结论 **FAIL**：B1/B5/B6/B8 CLOSED、B2/B4/B7 PARTIAL、B3 NOT_CLOSED；剩余根因 F1–F4 全部 P1）逐条整改的交付与验收证据。
> 复审报告原样归档：[docs/handoffs/2026-09-07-g4-r8/report/round8-review.md](../handoffs/2026-09-07-g4-r8/report/round8-review.md)。
> 整改基线：`670de7e`（分支 `feature/c03-e5-autonomous-acceptance`；复审覆盖的 HEAD 为 `0e141c0`，其上仅叠加 R8 handoff 提交，无生产代码改动）。本轮变更：**3 个文件（全部生产代码），+354/−106 行**（另含本报告）。
> 结论口径：本报告只陈述修复内容与独立验证证据，**不宣称 G4 收口**；关闭判定等待下一轮独立复审。

## 0. 整改顺序与范围

按 Current User 指定顺序 **F2（最小）→ F1 → F3 → F4** 执行，均在同一分支、同一提交集内完成。每项修复后立即跑对应复现探针与相关回归矩阵；末轮做全量验证。

## 1. F2 批内失效集合作用域（R7-B3 NOT_CLOSED → 已修复）

**根因**（复审 §5 F2）：`registerTerminalFindingsInTransaction` 的 `staledInTransaction` 集合声明在逐 draft 循环内部——第二条 finding 时集合又为空，而 `revisions` 仍是事务初始 ACTIVE 快照，二次 CAS 零行被误判为外部漂移，整批回滚（`FINDING_REGISTRATION_INVALID`，findings=0、edges=0）。

**修复**（`core/loop-run-store.ts`）：集合声明提升到整个 draft 批次（事务级）。同一 revision 物理 STALE 只标记一次；每条 finding 仍记录完整 canonical scope 边（批内重叠的 revision 继续产生边；快照中本就 STALE 的 revision 维持既有 continue 语义）。真实外部 CAS 漂移、scope/hash 缺失的 fail-closed 路径未动（lifecycle 351 断言内的真实持久漂移负例仍拒绝）。

**复现验证**（`r8-registration-probes.ts` BATCH 段，修复前 2/N 条全回滚 → 修复后全绿）：
- 0/1 条基准不变；
- 2 条同类（IMPLEMENTATION×2）：2 findings + 2 edges（BLOCKED 与 SUCCEEDED 两种 terminal 均登记成功，terminal=null）；
- 嵌套（IMPLEMENTATION+PLANNING）：2 findings + 3 edges——PLANNING finding 的 scope 覆盖 task-planning+implementation 两个下游节点，IMPLEMENTATION finding 覆盖 implementation；
- 4 条重叠：4 findings + 4 edges；
- 事务中途失败原子回滚与外部漂移拒绝由 lifecycle/artifact-revision 测试承重（见 §5）。

## 2. F1 登记身份三入口一致（R7-B2 PARTIAL → 已修复）

**根因**（复审 §5 F1 五变体）：成员身份仍可用可复用字段（createdAt 单边、examined revision 引用）拼凑；自动裁决分支无 count 守恒；producer 按 blob 身份 `.find` 首个匹配导致同内容跨轮选错轮；精确重放归属过滤只有 capability+blob，被其他轮/借用行污染。

**修复**（`core/loop-run-store.ts`，三入口共用同一组谓词与验证）：

1. **成员谓词收紧为登记收据**：`isRegisteredScanMember` 改为「sourceCapability=solution-gate ∧ evidence=producer 的 unresolved ledger ∧ **finding.createdAt === producer terminal 的 createdAt**」。gateway/登记事务写入的行 createdAt 恒为 terminal 事件 createdAt（store 登记逻辑写死），公开 `appendFinding` 无法伪造该收据；删除 OR 的 examined-revision 分支（该引用可借，从不授予成员资格）。
2. **producer 选择改按「该 verdict 实际消费的 scan 执行事实」**：新增 `consumedProducerScanInTransaction`（自动裁决、replay 校验、手动 `acceptFindingRisk` 三处共用）——要求 producer scan 的 unresolved ledger 等于被消费 ledger，**且其输出三元组等于 verdict 的输入三元组**（派发链已把每点输入绑定到前驱有效输出，store 侧复核同一绑定），并取 journal 序最近一个匹配。同内容跨轮（scan seq 6/12、design 1.0.0/2.0.0）不再选中旧轮。
3. **自动裁决分支补 count 守恒**：与手动 accept 一致——canonical v1 ledger 可解析时，成员全集（谓词过滤）必须等于 blob 成员数，否则整个 terminal 登记失败（fail-closed）；opaque/legacy ledger 保持 count 容忍，容忍不构成借用授权（身份由收据谓词承担）。
4. **精确重放归属过滤加收据**：`verifyReplayedRegistrationInTransaction` 的 `registeredByThisTerminal` 增加 `finding.createdAt === event.createdAt`——本 terminal 事务写的行才归属本次重放；其他轮同内容行与借用行不再污染。
5. **登记内容对账（severity 漂移门）**：证据 blob 可解析为 `loop-capability-findings:v1` 时，registration drafts 必须与 blob findings 数量一致且逐项（按序）severity/category/causeKind 一致——category/cause 的缺失回退用与 gateway 相同的推导（`DEFAULT_FINDING_CATEGORY_BY_CAPABILITY` 在 store 内镜像，注释双向引用）。HIGH→MEDIUM、CRITICAL→HIGH、同数内容替换在公开调用边界即被拒（`ILLEGAL_TRANSITION` → gateway 记 `FINDING_REGISTRATION_INVALID`，零 finding 写入、verdict 零派发）。opaque blob 容忍跳过。

**复现验证**（五变体全部转绿）：

| 变体 | 修复前 | 修复后 |
| --- | --- | --- |
| ① 真 ledger HIGH 边界改 MEDIUM 登记 | 存为 MEDIUM/ACCEPTED_RISK，run success | `FINDING_REGISTRATION_INVALID`，stored=[]，零派发；CRITICAL→HIGH 同拒；HIGH→HIGH 正例对照不受影响（scan succeeded、verdict 派发、ACCEPTED_RISK、COMPLETED） |
| ② ledger 一行+直插借用行（live 自动 PWR） | 两行都 ACCEPTED_RISK | 借用行保持 OPEN（非成员，不被接受），真成员正常接受 |
| ② 同漂移手动 accept | — | `ILLEGAL_TRANSITION`（not a registered member），零写（与修复前一致，保持） |
| ③ 两轮同内容 ledger PWR | 旧轮 finding 被接受（scope=decision:2）、本轮仍 OPEN | 本轮 finding 被接受（scope=decision:2），旧轮行保持 OPEN（属 FAIL 轮，由返工流处置） |
| ④ 同内容跨轮 scan1/scan2 原样重放、borrowed 在场的 PWR 重放 | 均误拒 `ILLEGAL_TRANSITION` | 全部 no-op（零写） |
| ⑤ opaque ledger 借 examined revision 手动 accept | 接受 | `ILLEGAL_TRANSITION`；opaque 合法同事务登记行（收据绑定）正例保留 |

回归矩阵（复审 F1 末段清单）执行情况：同/跨节点 HIGH 借用与三类 directive 冲突（`r8-directive-probe.ts` exit 0：exact replay no-op、runInvalidation/reflow/severity/adjudication 四类冲突零写）；0/1/N 原始成员与 2 条直插对照（`r8-count-drift-probe.ts` exit 0）；两轮各自 PWR/精确重放与 borrowed 在场（`r8-b2-probes.ts` exit 0 + 自建 replay 四场景）；resolved/superseded replay、v4 三消费端由 lifecycle/version 测试与 `r8-version-probe.ts`（exit 0）承重。

## 3. F3 A4 统一公开执行前置（R7-B4 PARTIAL → 已修复）

**根因**（复审 §5 F3）：A4 只存在于 runtime 且为 `openFindings.length > 0` 一刀切——(a) KS 自身输出 BLOCKED+HIGH/KNOWLEDGE 时，自身返工目标被误判为下游阻断，`ADMISSION_DENIED`、adapter 0 调用；(b) 同一状态经合法 `LoopCapabilityEntry.execute` 直接派发 KS 并 succeeded（entry 无 A4）。

**修复**：
- `runtime.ts`：A4 阻断条件改为 §5.2 范围——仅当存在 **earliestAffectedNodeId 严格早于 knowledge-sync** 的 OPEN finding 时阻断；earliest=knowledge-sync 的 finding 是返工目标本身，保持可派发。与既有 A1 的 `earliest < planning` 谓词同构。
- `core/loop-capability-entry.ts`：在 A1 段之后为 direct entry/claim 派发边界补同一 A4 守卫（earliest 严格上游的 OPEN findings 阻断，`ILLEGAL_TRANSITION` + findingId 列表）——run 与 direct entry 两个公开执行前置自此一致。
- closed+MISSING 语义不变（A4 仍为 OPEN 基准，closed finding 的下游 MISSING 是补尾段正常态）；发现节点逐条 `resolveFinding` 的关闭责任不变，未引入 PASS/批量 close。

**复现验证**：
- KS 自身返工（`r8-admission-probes.ts` KNOWLEDGE 行）：修复前 `repairCalls: []`（0 调用自锁）→ 修复后 `repairCalls: ["knowledge-sync:primary"]`——返工可执行；输出 BLOCKED 是该节点业务结果，chain BLOCKED 正确。
- direct entry 绕过（`r8-direct-entry-probe.ts`）：runtime `ADMISSION_DENIED`（IMPLEMENTATION OPEN 未 resolve）+ 同一状态 direct entry `ILLEGAL_TRANSITION "knowledge-sync admission (A4) is blocked by OPEN findings: …finding:1"`、`newCalls: []` 零派发——两入口一致拒绝。
- 六类可表达类别实际返工（REQUIREMENT/SOLUTION/PLANNING/IMPLEMENTATION/REVIEW/KNOWLEDGE）：上游类别未 resolve 时 ADMISSION_DENIED（正确阻断）；PLANNING/IMPLEMENTATION/REVIEW 在发现节点逐条 resolve 后补尾段 → `success/COMPLETED, gate=ELIGIBLE`；closed+MISSING 尾段可达；A1 upstream/ESCALATED/BLOCKED_UNKNOWN 拒绝与 PLANNING 修复不回归（六场景矩阵 44/0、fix-round 27/0、WP4 122/WP5 177/WP6 34 断言全过）。

## 4. F4 隔离 block 持久化失败 fail-closed（R7-B7 PARTIAL → 已修复）

**根因**（复审 §5 F4）：终验确认污染后 `appendEvent(run_blocked)` 抛错被 `catch {}` 无条件吞掉——未验证失败原因、未回读持久事实即返回看似已处理的 BLOCKED。同 run 重入时 preflight 把污染后状态当干净基线：COMPLETED 出口复用原链 success/COMPLETED（0 新派发），BLOCKED/failed 出口再派发。

**修复**（`runtime.ts`）：
1. **持久化失败不再当"已阻断"**：隔离 block 写入失败后回读持久事实——只有确认存在 durable block（本调用或并发调用写入成功）才允许 BLOCKED 返回；否则以 `ProductionRunError("PRODUCTION_ISOLATION_VIOLATED")` 传播持久化失败（附原始错误原因）。
2. **重入 fail-closed 锚**（"仅去掉 catch 不够"）：隔离违规确认时，先于 journal 写入 attempt 在 **controlRoot 下写 containment 标记**（`production-containment/<requirementId>.json`，幂等、requirement 身份绑定，与 journal 同一控制面目录，非第二事实系统）。runProduction 在任何派发前检查该标记：存在即补写 journal block（幂等 heal）并返回 BLOCKED/PRODUCTION_ISOLATION_VIOLATED——零派发，污染态无法被重新取为基线，未终验完成的输出无法被复用为 success。
3. **错误码面**：`ProductionRunErrorCode` 补充 `PRODUCTION_ISOLATION_VIOLATED`（隔离违规的抛错形态；run 级 `run_blocked.reasonCode` 语义不变）。
4. **S1（建议项顺手修复）**：`realpathSync(identity.repositoryPath)` 在 repositoryPath 不存在时包装为 `PRODUCTION_ENTRY_INVALID_INPUT`（原裸 ENOENT）。

隔离 block 释放语义未动（`releaseRunRegateBlock(SCOPE_RESET)` 对隔离 block 仍 `ILLEGAL_TRANSITION`；人工释放归 C03-B/后续授权）。

**九格矩阵验证**（三出口 COMPLETED/BLOCKED/failed × WIP/base/保存失败；自建容错探针逐格断言）：

| 出口 | 漂移注入 | 首调 | journal 持久事实 | 标记 | 同 run 重入（+第三次） | 派发数 |
| --- | --- | --- | --- | --- | --- | --- |
| 三出口 × WIP/base（6 格） | 终验 WIP/base 漂移 | failed/BLOCKED/PRODUCTION_ISOLATION_VIOLATED | blocked + run_blocked 事件 | 是 | 逐次均 BLOCKED 同码 | 0 |
| 三出口 × write-failure（3 格） | `BEFORE INSERT ON loop_events` 拦 run_blocked ABORT | **抛 ProductionRunError(PRODUCTION_ISOLATION_VIOLATED, 持久化失败原因)** | running（注入故障持续） | **是** | **逐次均 BLOCKED 同码** | **0** |

修复前 write-failure 格的重入泄漏（success/COMPLETED 假成功、repeatDispatches=1）全部消除。无写故障六格正例行为与 R8 复审 B7 已验证形态一致（首返 BLOCKED、持久 run_blocked/reason 保留、重入仍 BLOCKED 零新派发、preflight+终验各一次、release 对隔离 block 仍 ILLEGAL_TRANSITION）。`f4-paths` 三例：parent-alias 拒（B6 不回归）、合法相对 workspace 成功、missing-repo 报 `PRODUCTION_ENTRY_INVALID_INPUT`（S1）。

## 5. 全量验证

| 验证 | 结果 |
| --- | --- |
| `tsc --noEmit` | 退出 0，无诊断 |
| 159 个测试文件**逐文件串行**（157 TS + 2 shell） | **159/159 全绿**（每文件独立进程，含六场景矩阵 44/0、fix-round 27/0、lifecycle 351/0、artifact-revision 237/0、envelope 44/0、WP4 122 / WP5 177 / WP6 34 断言） |
| R8 复现探针 ×10 | 8 个完整执行 exit 0（count-drift、b2、directive、admission、direct-entry、provenance、root-inventory、version）；2 个在修复后行为变化的观测点中止，见 §6 行为说明，其完整行为已用容错副本逐格验证 |
| 定向变异 M-A/M-C/M-E/M-F | **4/4 捕获**（HEAD 副本与含修复工作树副本各验一轮；施加→靶测试红→还原 diff 为零） |
| Ruby 校验器 ×3（skill-contracts / compact-prompt / capability-metadata-chain） | 全部退出 0 |
| control-plane validate_state | PASS v2，退出 0（只读校验，未更新 STATE） |

执行环境说明：本轮在另一台机器恢复（跨机交接），本机 node_modules 的 better-sqlite3 原生模块为 Node 24 ABI，以 nvm Node v24.12.0 运行全部验证（与复审时公司机环境一致口径）。

## 6. 复审探针复跑的两处预期行为变化（非回归）

1. `r8-registration-probes.ts` 的 SEVERITY 段：修复后边界改写 severity 在 store 对账处被拒、scan terminal 转 `FINDING_REGISTRATION_INVALID`（fail-closed 正确行为），探针在观测点 `events(h).find(... succeeded scan)` 处因无 succeeded scan 事件而中止——该段探针假设了缺陷形态（登记成功后观测）。修复后行为已用容错副本验证（§2 变体①表，含 HIGH→HIGH 正例对照）。BATCH 段不受影响且全绿。
2. `r8-production-probes.ts` 的 fullDrift write-failure 格：修复后首调抛 `ProductionRunError`（"明确传播持久化错误"的字面实现），探针该行无 catch 即中止；九格完整行为已用容错副本验证（§4 矩阵）。

## 7. 边界

- 不使用 SDLC/DocFlow 治理本线；未调用 DocFlow、未更新 Control Plane STATE（只读校验除外）。
- 未修改其他工作线：改动仅 `core/loop-run-store.ts`、`core/loop-capability-entry.ts`、`runtime.ts` 三文件，全部属 G4/D-087 冻结面内的修复边界。
- 未扩展 G5 projector/parity、G3 冻结文本、C03-B 释放协议、WP6 综合对抗矩阵建设；containment 标记沿用现役 controlRoot 边界，未建第二恢复系统。
- **不宣称 G4 收口**：本轮自评为 F1–F4 逐项修复 + 独立验证证据；B2/B4/B7 是否由 PARTIAL 转 CLOSED、B3 是否关闭、G4 是否具备 PASS 条件，等待下一轮独立复审裁决。
