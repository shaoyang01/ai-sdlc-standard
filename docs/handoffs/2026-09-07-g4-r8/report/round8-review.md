# G4-R7 整改复审 · Round 8

结论：**FAIL。四个根因组仍阻塞 G4 收口；整改报告的“8/8 闭环”不成立。**

审查对象为精确 HEAD `0e141c0362d0b5fc1ab2923a81d13080c5ae1dde`。主审 `9e6e0c7..0e141c0` 两个提交，包含 `20001b2c48f75c32a78cfa88f6fa2351edc7363b` 的全部生产代码改动。对前序 G4 实现、公开 store/entry/recovery/gateway 路径作关联抽查。主仓保持干净，未改代码、提交、推送、调用 DocFlow 或更新治理状态。以下“写入”“注入”均在 `/private/tmp/g4-r8-probes` 的隔离夹具数据库或临时副本中进行。

证据按本地独立执行认定，不引用未推送 HEAD 的远端 CI。真实 gateway/store/entry 被执行，Agent 为离线 E3 adapter；没有运行真实 Agent CLI、业务 Git 操作或发布。

## 1. 合同边界与行为不变量

权威为 [D-087 五缝调整合同 v1.0.0](/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard/ai-sdlc/manual-runtime-semantic-contract.md)、[Decision-086](/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard/docs/decisions/Decision-086-pwr-auto-proceed-and-finding-gate-simplification.md)、[Decision-087](/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard/docs/decisions/Decision-087-vertical-mainline-rebuild.md)、[Decision-090](/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard/docs/decisions/Decision-090-c03e-prerun-governance-readiness-replan.md)、[G4 冻结面](/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard/docs/reports/g4-d087-requirement-freeze.md)及 G3/D-090-02 冻结面。R7 关闭核对基线是[上一轮独立复审报告](/private/tmp/g4-r7-evidence/round7-review.md)，不是整改方的自评结论。

本轮不重新裁断五项行为语义变更方向；以下清单用于评估其实现是否完整。

| 不变量组 | 必须成立的行为 | 主要审查落点 |
| --- | --- | --- |
| I1 节点与权威 | 七节点与双 Gate role 的身份不混淆；scan 无最终裁决权；binding 独立；节点业务 BLOCKED/FAILED 不变成成功推进 | envelope、capability event、real gateway、recovery；六场景矩阵 |
| I2 深度与决策 | 提案/所需/正式深度分工；正式 verdict 合法组合；ESCALATED/BLOCKED_UNKNOWN 不满足 A1；当前版本独占现役裁决权；v4 只读旧 canonical，不因列值获得新权威 | §4 全部条款及现役 schema 门、三个消费端、M-A/M-E |
| I3 历史与幂等 | 原事实精确重放 no-op；新写必须现役版本；中断历史 started 产生一条现役 failed；事件身份、序号、输入三元组、canonical 与 journal 顺序一致 | append/claim/interrupt、snapshot、recovery、M-F |
| I4 Finding 登记 | 全链发现职责；terminal、实际 ledger 成员内容、来源 revision 与登记身份一致；不可仅凭相同 blob 接受；失败 terminal 的 findings 也原子登记；directive 由 terminal 派生 | §5.1、D-087 接缝 2；注册/接受/重放三入口 |
| I5 批量原子性 | 0/1/2/N 行与失效操作同事务；每条 finding 拥有完整 scope 边；批内重叠不是外部漂移；真实损坏不能被幂等分支吞掉 | 注册事务、ACTIVE→STALE CAS、scope count/digest、读回 |
| I6 处置与回流 | 修复节点为 earliest；关闭是发现节点承担的逐条生命周期动作，绑定 ACTIVE revision 与证据；普通 PASS 不替代关闭；非 scan 不可 PWR 接受；已接受不另加仪式 | §5.2～5.5、§7.1～7.3、resolve/accept/proof、WP4/5/6 |
| I7 准入与收敛 | A1 按严格下游范围拦截；返工目标本身可运行；A2 refs 随行；A3 保留产物/代码证据要求；A4 在派发前生效且遵守同一范围；closed + MISSING 允许补尾段；完成仍需 findingGate ELIGIBLE | runtime、direct entry、claim/recovery、delivery tail |
| I8 载体与完整性 | 非空 refs 来自校验过的 delta，并到达各 provider 的实际载体；空/非 v1 回退不虚构；缺失/损坏零派发；追加 provenance 不改上游原 blob/正文 | runtime→entry→real gateway→prompt/staged/stdin |
| I9 生产隔离 | 唯一生产装配面；prepared 有效且物理上不是 repositoryPath；每次 cwd 固定；preflight 拒绝零派发；每次正常出口均终验；隔离失败为可恢复的持久阻断事实 | runProduction、realpath、run_blocked、恢复/重入/释放 |
| I10 冻结与投影分工 | 稳定路径、manifest 三对象、生命周期与投影职责不混写；G4 不靠伪造 projector/parity 宣称完成；G3 已冻结文本不借本轮重开 | §3、§6、§8～10 的分阶段责任与改动清单 |
| I11 验证有效性 | 精确 HEAD；逐文件串行；负例只改变目标事实，canonical/proof 前提合法；变异确实红；错误码与零写/零派发同时检查 | 159 文件、四变异、独立探针、夹具 diff |

§6 的自证投影、§8 N 系列分配给 G5 的 projector/parity 承重项属于边界核查，未冒充已实现的 G4 功能。五缝合同全部条款均按“本轮功能约束／保持兼容／明确后续波”归属处理。

## 2. 公开读写路径与失效模式清单

下表区分 API 错误、gateway terminal 错误和 runtime 阻断码；不同层级不应混称为同一种抛错。零写指被拒绝的该次 store 事务无新增/更新，不表示此前合法历史不存在。

| 公开路径 | 非法输入／业务前提不满足 | 并发交错／冲突 | 状态或持久事实漂移 |
| --- | --- | --- | --- |
| createRun/bootstrapRunWithSource/ensureRunStarted/appendEvent | `INVALID_INPUT`、`RUN_NOT_FOUND`、`ILLEGAL_TRANSITION`、`TERMINAL_RUN` | identity 冲突 `RUN_ID_CONFLICT`；事件冲突 `EVENT_ID_CONFLICT`/`EVENT_SEQUENCE_CONFLICT`；锁竞争 `STORE_BUSY` | canonical、schema、外键/链漂移 `STORE_CORRUPT`；I/O `STORE_FAILURE` |
| appendCapabilityExecution/claimNextCapabilityExecution | 版本/字段错误 `INVALID_INPUT`；不合法下一执行点或前驱 `ILLEGAL_TRANSITION` | 同一事实精确重放 no-op；异内容事件/序号冲突；claim 事务重验，锁竞争 `STORE_BUSY` | 读取现有链发现损坏 `STORE_CORRUPT`，不能拿旧行当新写 |
| interruptCapabilityExecution | 非匹配 active claim、非 idle running：`ILLEGAL_TRANSITION` | 第二次同 claim 中断 no-op；终态/claim 已被其他调用替换时拒绝 | 新 terminal v5，历史 v4 保持原 canonical；错链 fail-closed |
| appendCapabilityExecutionWithFindings | 不符 terminal 的 evidence/directive `ILLEGAL_TRANSITION`；畸形 draft `INVALID_INPUT` | 原事件加登记精确重放应 no-op；内容冲突零写；terminal/行/失效/scope/接受证明同事务 | 不存在或坏 blob、current/edge/scope 漂移 `STORE_CORRUPT`；gateway 将登记失败记录为 `FINDING_REGISTRATION_INVALID`。实际缺口见 F1/F2 |
| appendFinding | 类别×来源/earliest/source revision 等非法输入或非法迁移拒绝 | 重复/序号冲突或锁竞争拒绝；事务内失效、scope 一起回滚 | 持久关系漂移在读回为 `STORE_CORRUPT`；原 API 可建立普通 finding，不因此自动取得 scan 成员资格 |
| resolveFinding/acceptFindingRisk/supersedeFinding | 不合法 verifier、版本、scope、证据或目标状态：`ILLEGAL_TRANSITION`；字段畸形 `INVALID_INPUT` | guarded UPDATE 与证明原子提交；相同合法重放 no-op，冲突迁移拒绝 | proof 缺失、依据变更、scope 边丢失：`STORE_CORRUPT`；接受身份残余见 F1 |
| appendArtifactRevision/markArtifactRevisionStale | 非法版本链/上游/输入绑定拒绝；缺 run `RUN_NOT_FOUND` | current/validity guarded update，exact replay 保持 | current、revision canonical、依赖或 CAS 漂移 `STORE_CORRUPT`；批内误判见 F2 |
| appendRequirementChange 及其读取 | 非法分类/事实/版本关系拒绝 | 同事实重放、身份及序号冲突按现役协议 | generation、revision、证据链漂移 fail-closed；本轮未改其合同 |
| getSnapshot/getRun/listEvents/listCapabilityExecutions/listRunsByRequirement/findLatestRunByRequirement | 非法 id `INVALID_INPUT`；单项不存在按 API 返回 undefined | 事务一致读，不派发 Agent，不补写历史 | 统一 snapshot/链校验，错误为 `STORE_CORRUPT`，而非默认成功 |
| listFindings/listFindingInvalidations/computeFindingGate/listArtifactRevisions/getCurrentArtifactRevision/listRegateCurrentFacts/requirement-change reads | 合法不存在与畸形输入区分 | 只读事实归约 | 哈希、来源、proof、边序号、scope count/digest、blob 漂移拒绝；MISSING/STALE 合法业务态由 gate 表达 |
| recoverRunContext/deriveDispatchCommand | v4 裁决不能映射 DECIDED；OPEN/不可用 decision 按事实阻断 | 按 producer identity、execution point 和 journal 顺序归约，不用 attempt 数代替 | delta 缺失/损坏 `STORE_CORRUPT`；持久 block 保留、无派发命令；A4 与 entry 不一致见 F3 |
| authorizeRegateDispatch/markRunRegateBlocked/releaseRunRegateBlock | 预算阻断 `REGATE_ROUND_BUDGET_EXHAUSTED`；非预算 block 不可用该 release，`ILLEGAL_TRANSITION` | claim/permit immediate transaction；持久预算 block 后不派发 | 隔离失败的持久 block 不会被预算 release 清除；保存失败吞错见 F4 |
| LoopCapabilityEntry.execute/run | request 多余/非法字段 `INVALID_INPUT`；entry 不合法执行点/准入 `ILLEGAL_TRANSITION`；run 对应 `ADMISSION_DENIED` | resume lease/claim 控制；失败方旧裁断不重开 | 已损坏 store/delta 拒绝；业务 BLOCKED 与技术失败区分；direct A4 漏守卫见 F3 |
| real gateway/envelope/transport | envelope status/depth 非法被拒绝；无输入 `REAL_GATEWAY_NO_INPUT`、执行上下文非法 `REAL_GATEWAY_INVALID_CONTEXT` | 受 entry/claim 约束；不创建第二生产入口 | 实际载体绑定 digest；解析/登记失败不可成为合法成功推进 |
| artifactStore.put/read | 非法路径/ref/kind/大小分别按 artifact store 错误；超限 `ARTIFACT_TOO_LARGE` | content-addressed 幂等与原子发布 | `ARTIFACT_CORRUPT`/缺失，经 store 消费映射 `STORE_CORRUPT` |
| runProduction | `PRODUCTION_ENTRY_INVALID_INPUT`；缺 real 注入 `PRODUCTION_REAL_NOT_AUTHORIZED`；preflight `PRODUCTION_BASE_DRIFT`/`PRODUCTION_DIRTY_SOURCE` | run/lease 约束保持；不得凭外层返回值推断已持久化 | 后验 `PRODUCTION_ISOLATION_VIOLATED`；应持久并禁止同 run 复用；缺 repositoryPath 目前裸 `ENOENT`（建议 S1） |

并发方面，独立跑过 run concurrency、resume lease、regate dispatch-window、WP5 cross-entry 及 lifecycle 原子回滚测试；源码核查了 immediate transaction/CAS。未把本轮 SQLite 故障注入描述成跨进程竞态实测，也未宣称穷尽所有调度交错。

## 3. 两个提交的叠加审查

`9e6e0c7..0e141c0` 共 12 个文件、+639/−67；不采用整改报告只计本体的“10 文件”代替主审范围。

| 提交与 hunk | 当前 HEAD 的叠加结果 |
| --- | --- |
| 20001b2：store 中断 terminal 显式现役 schema | 0e141c0 未覆盖回退；B1 实测关闭 |
| 20001b2：store 批内失效集合 | 集合声明仍位于逐 finding 循环内部；后续本体未修正其生命周期；F2 延续 |
| 20001b2：runtime realpath import/比较 | 本体保留；字面、末级/父级 symlink 同根均拒绝；B6 功能关闭 |
| 20001b2：新增 `.zcode/plans/plan-sess_a7ebcfbb-a846-43ed-b22d-4040069720bb.md` | 56 行会话计划文本，实际内容为 bootstrap-knowledge-target 相关实施案；未发现生产代码消费该文档的路径；未执行其中步骤，不以提交消息或文档入分支管理立代码缺陷 |
| 0e141c0：store 成员 predicate/count/directive/replay | directive 修复有效；成员身份、实际内容、producer 选择与三个入口的一致性仍不足，F1 |
| 0e141c0：runtime/entry A1、runtime A4 | A1 `< planning` 两处一致；A4 新增只在 runtime 且未过滤自身返工，F3 |
| 0e141c0：refs 输入与 real gateway 正文 | 实际 provider 载体与正文完整性独立验证，B5 关闭 |
| 0e141c0：runProduction 后验持久化 | 普通三出口生效；新 catch 将写失败当成已有阻断，F4 |
| 测试、整改报告 | 逐行核查承重改动；测试数字重执行属实，“8/8 闭环”与独立反例不符 |

## 4. R7 B1～B8 逐项关闭判定

| 项目 | 判定 | 独立证据与限制 |
| --- | --- | --- |
| B1 中断版本权威 | **CLOSED** | 原 v4 started：read/snapshot/recovery 保持 v4；append/claim 精确重放 false；中断新增 v5 failed，总行数从 1 到 2；二次 false。INSERT 实现只有一处，生产调用仅普通 append 和 interrupt 两处。合法 HIGH 原 scan 成员归位 OPEN、清 proof、重算 canonical 后，v5 可 DECIDED/accept，v4 只读可读但 recovery BLOCKED_UNKNOWN、accept/同事务裁决 `ILLEGAL_TRANSITION`。见 legacy/version 日志 |
| B2 登记身份三绑定 | **PARTIAL** | 同节点 HIGH/MEDIUM 借用的手动 accept、跨节点借用、三类 directive 冲突均拒绝零写；resolved/superseded 精确重放保留。但自动接受漏 count、severity 未绑定真实 blob、同内容跨轮选旧 producer、精确 replay 误拒、opaque 身份回退可借用，见 F1 |
| B3 批内失效同步 | **NOT_CLOSED** | 0/1 成员基准可登记；2 条同类、不同类嵌套、4 条重叠，在 BLOCKED 与 SUCCEEDED 两种 terminal 下均整批回滚，finding/scope 边为零；F2。外部漂移、失效 scope 损坏仍 fail-closed，未靠删除 CAS 改绿 |
| B4 准入 | **PARTIAL** | PLANNING 返工自锁原症状关闭；上游 OPEN 阻 A1，ESCALATED/BLOCKED_UNKNOWN 仍拒，PWR ACCEPTED 正常走。IMPLEMENTATION 返工后 OPEN 阻尾段，发现节点 resolve 后才能补尾段；closed+MISSING 可收敛。但 knowledge-sync 自身返工自锁且 direct entry 绕过 A4，F3 |
| B5 refs 随行 | **CLOSED** | task-planning 与 implementation 各自采集：唯一标记到 staged；Kimi prompt 指向该文件，Codex prompt 指明 stdin，stdin 与 staged 一致且 prompt 绑定 digest。原正文保持完整前缀；空 refs 时逐字节不变；非 v1 空回退成功；delta 缺失/损坏 `STORE_CORRUPT`、零新派发。不是要求 workspace-file provider 虚构一个 stdin |
| B6 prepared 路径 | **CLOSED** | 字面同根、末级 symlink、父目录 symlink 同根均 `PRODUCTION_ENTRY_INVALID_INPUT`，零派发/业务根零 staging；悬空/非目录保持拒绝。独立合法目录和相对 prepared 路径成功；逐次 cwd 验证。缺 repositoryPath 错误包装为 S1；Linux 未作运行环境实测 |
| B7 隔离失败持久化 | **PARTIAL** | COMPLETED/BLOCKED/failed × WIP/base 六格：首次 BLOCKED，持久 run_blocked/reason 保留，只读恢复有阻断，同 run 重入仍 BLOCKED且零新派发。preflight+终验各一次。持久化失败时 catch 吞错，次次重入可能 success 或再派发，F4 |
| B8 验证前提 | **CLOSED（针对 R7 指定验证阻塞）** | M-E/M-F 在当前 HEAD 靶测试确实红；M-A/M-C 同样捕获。h1(d) 为真实原始 OPEN HIGH 成员、proof 清除、canonical 合法的版本对照。s6 逐次 cwd 且检查 repositoryPath，另补业务根目录清单/hash 前后比较。精确错误码核对。s4 单槽覆盖的测试增强建议单列，不以新增功能反例重复另立验证阻塞 |

B1 证据：[legacy](/private/tmp/g4-r8-evidence/legacy-probes.log)、[version](/private/tmp/g4-r8-evidence/version-probe.log)。B2：[borrow](/private/tmp/g4-r8-evidence/borrow-probe.log)、[directive](/private/tmp/g4-r8-evidence/directive-probe.log)、[lifecycle replay](/private/tmp/g4-r8-evidence/lifecycle-replay-probe.log)。B5：[provenance](/private/tmp/g4-r8-evidence/provenance-probe.log)、[delta](/private/tmp/g4-r8-evidence/delta-probes.log)。B6/B7：[原探针](/private/tmp/g4-r8-evidence/production-probes.log)、[扩展矩阵](/private/tmp/g4-r8-evidence/production-matrix.log)、[业务根清单](/private/tmp/g4-r8-evidence/root-inventory-probe.log)。

### 七节点准入推演与既有流程兼容

| earliest | A1 的 OPEN 拦截（严格早于 planning） | 本轮合法生产形态覆盖 |
| --- | --- | --- |
| requirement-intake | 阻断 | REQUIREMENT，回 intake/design/Gate，抵 planning 时阻断 |
| solution-design | 阻断 | SOLUTION，回 design/Gate，抵 planning 时阻断 |
| solution-gate | 阻断 | 两处 A1 比较对七节点序号的静态推演；见下方限制 |
| task-planning | 不阻返工目标 | PLANNING 实际规划→实现→审核；OPEN 不被普通 PASS 关闭；resolve 后尾段成功 |
| implementation | 不阻 planning | IMPLEMENTATION 实际返工→审核；resolve 前 KS 零派发，之后成功 |
| code-review | 不阻 planning | REVIEW 实际审核返工；resolve 后尾段成功 |
| knowledge-sync | 不阻 planning | KNOWLEDGE 实际恢复指向 KS，但 A4 自锁，F3 |

覆盖限制必须说明：现役 `LOOP_FINDING_CATEGORIES` 是六类；固定 category→earliest 映射没有独立的 solution-gate 类。不能伪造一条被现役 validator 拒绝的 finding 后宣称“七类合法端到端均跑过”。本轮对七节点做准入真值核查、对六个可表达生产类别做实际执行；不借此重开已收口的类别模型/G5 映射事项。

wp4-W3、wp5-P3、wp6-CC2 改为“返工→发现节点调用 resolveFinding，绑定重建 ACTIVE revision/证据→补尾段→ELIGIBLE”，与 §5.2、§7.3 一致，是合同投影。三者没有把普通 PASS 当成关闭复验：未 resolve 前仍 OPEN，runtime 在 KS 前停；resolve 是单独动作。独立 PLANNING/IMPLEMENTATION/REVIEW 探针读到 `open=0, gate=BLOCKED, next=knowledge-sync`，只补一次 KS 后 `success/COMPLETED, gate=ELIGIBLE`。线性尾段这条路径唯一且可达；KNOWLEDGE 自身目标不适用该成功结论。

A4 调用方排查还覆盖 runtime 的 `completedOk`→documentation governance tail→manual handoff checklist，以及 delivery publisher/coordinator 消费链。当前尾段构建仍由 `findingGate ELIGIBLE` 等完成条件门控；未发现其独立依赖“上游 OPEN 未关闭也应照常完成”的新回归。手动 `publish-requirement-manifest.sh check-admission` 已使用阻断范围，属于 G3 冻结面，未修改；publisher 投影一致性不是用来补 runtime entry 漏门的替代措施。wp35/wp4/wp6 单轮 PWR 与 matrix 场景 4 基准都通过；同内容跨轮 PWR 则被 F1 的真实执行反例击穿。

## 5. 根因合并后的阻塞项

以下四项分别对应未关闭的 R7 根因或本轮修复产生的同族残余，不把 R1～R7 已确认正确的方向重新报成缺陷。

### F1 [P1] 登记仍以可复用字段代替真实成员身份，三条接受/重放路径不一致

合同依据：§5.1 的发现事实与 source revision/evidence 绑定、§5.2 scan 来源接受、§5.4 本轮 scannedDesignVersion 一致性，以及 D-087 接缝 2 的真实 finding 原子物化。opaque count 容忍本身不是缺陷；不能因此赋予外来行原始 scan 成员资格。

代码位置：[自动裁决 producer 选择与接受循环](/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard/core/loop-run-store.ts:2505)、[成员谓词](/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard/core/loop-run-store.ts:3330)、[精确重放归属过滤](/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard/core/loop-run-store.ts:2228)。

可复现的同根因变体：

1. **真实 ledger HIGH → 登记 MEDIUM 仍成功接受。** 离线 adapter 输出合法 HIGH scan；只在公开 `appendCapabilityExecutionWithFindings` 调用边界将 draft severity 改为 MEDIUM。原 ledger 字节/digest 不变、成员数仍 1、producer/revision 合法，最终保存 MEDIUM/ACCEPTED_RISK，run success/COMPLETED。CRITICAL→HIGH 同样成功是加强例，主负例使用 HIGH，没有 CRITICAL 前置遮蔽。
2. **原始 ledger 一行，直插第二条 hash/scope 合法借用行。** 在真实 formal_verdict adapter 返回前插入 HIGH，证据与被审 revision 相同、不是原始 producer 登记成员。自动 PWR 把两条都接受；同样的漂移放在手动 `acceptFindingRisk` 前会 `ILLEGAL_TRANSITION` 且零写。自动分支未调用成员 count 校验，故“三入口共用同一约束”不成立。
3. **两轮不同 design、同内容 ledger，PWR 接受错轮。** 第一轮 FAIL、第二轮 PWR，scan sequence 6/12、design 1.0.0/2.0.0；`.find` 找到首轮 producer，旧 scan finding 被写入第二轮 decision scope，当前 scan finding 仍 OPEN。这个判断依据是接受对象错误，不是把第一轮 FAIL 合成返工 finding 仍 OPEN 当缺陷。
4. **精确重放受外来/其他轮行污染。** 同内容跨轮的 scan 1、scan 2 原样登记重放都报 `ILLEGAL_TRANSITION`；同节点 borrowed finding 在场也使原 PWR exact replay 误拒。过滤条件只有 capability+blob，不能表达“这个 terminal 当时注册的成员”。不同 directive 重放拒绝的修复仍有效。
5. **opaque 回退的借引用。** 合法 deterministic/历史 opaque ledger 本身保留允许；额外 `appendFinding` 行只需借用同 ledger 和 examined revision，即使 createdAt 不同，仍能被 `acceptFindingRisk` 接受。生产 real gateway 的 scan 物化确实恒写 `loop-capability-findings:v1` envelope，此变体不虚称是正常生产 opaque 输出，但公开 legacy 兼容接受路径仍在范围内。

证据：[severity 与批量探针](/private/tmp/g4-r8-evidence/registration-probes.log)、[直插 count 对照](/private/tmp/g4-r8-evidence/count-drift-probe.log)、[跨轮/opaque](/private/tmp/g4-r8-evidence/b2-probes.log)、[同内容跨轮精确重放](/private/tmp/g4-r8-evidence/round-probes.log)、[borrowed 在场 replay](/private/tmp/g4-r8-evidence/borrow-probe.log)。

影响路径：gateway 登记草稿→store 仅绑定 blob/时间或 revision→PWR 选择错误集合→风险事实内容改变、外来行或旧轮行被接受；另一路精确重试被拒。时间与 revision 可由调用方填写，不是不可变登记收据；count 相等也不能证明内容一致。

一次性修复边界：在现役模型内明确 terminal 的登记归属、真实 ledger 成员内容与顺序/身份，按该次 verdict 的实际 scan 执行事实选 producer；自动裁决、手动 accept、exact replay 使用一致的目标集合与验证。原行生命周期变迁不改变其登记归属；其他轮/borrowed 行不能污染 exact replay。保留 v4 只读与 opaque count 容忍，不能把“解析不到 count”转成借用成员授权；不要求另造风险仪式或第二事实系统。lifecycle 的机械 createdAt 夹具绑定可以保留，但不能代替生产成员证明。

回归矩阵：同/跨节点 HIGH 借用；HIGH→MEDIUM、CRITICAL→HIGH；同数内容替换；直插多行分别经自动/手动/重放三入口；0/1/N 原始成员；不同 design 同内容 ledger 两轮各自 PWR/精确重放；borrowed 在场原 terminal replay no-op；resolved/superseded exact replay；opaque 合法历史正例与后加 borrowed 负例；三 directive 冲突零写；v4 三消费端仍拒绝。

### F2 [P1] “事务内已失效集合”实际每条 finding 重新创建，批量重叠仍整批失败

合同依据：D-087 接缝 2 同事务物化、§5.1 全链 findings、§5.4 原子失效传播。此项是 **R7 B3 明确 NOT_CLOSED**，不是重复立一项新缺陷。

代码位置：[core/loop-run-store.ts:2444](/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard/core/loop-run-store.ts:2444)。`staledInTransaction` 位于逐 draft 的 `runInvalidation` 分支内部。第一条修改 revision 后，第二条集合又空，而 `revisions` 仍是事务初始 ACTIVE 快照；再次 CAS 标记得到零行，误作外部漂移，事务回滚。

复现：code-review 输出 0/1/2/4 条合法 HIGH；分别用 BLOCKED 与 SUCCEEDED。0 条基准正常；1 条登记出 finding 与 implementation scope 边；2 条 IMPLEMENTATION、IMPLEMENTATION+PLANNING 嵌套、4 条 IMPLEMENTATION 均得到 `FINDING_REGISTRATION_INVALID`，finding=0、edges=0。solution-design 两条 REQUIREMENT 原探针也继续失败。证据：[registration-probes.log](/private/tmp/g4-r8-evidence/registration-probes.log)、[原 invariant 探针](/private/tmp/g4-r8-evidence/invariant-probes.log)。

影响路径：一个合法节点输出多个重叠问题→全部发现事实丢失于回滚→节点变为登记技术失败而不能正常回流。不是 N 条中漏写某条，而是整批无法提交。

一次性修复边界：把同步状态生命周期提升到整个注册事务/整个 draft 批次，或等价更新统一工作快照；同一 revision 的物理 STALE 更新一次，每 finding 仍保留完整 scope 边。保留真实外部 CAS 漂移、scope/hash/边缺失的 fail-closed；不得删除 guard 或吞掉所有零更新来修。

回归矩阵：0/1/2/N × BLOCKED/SUCCEEDED；同类重叠、不同类别嵌套、无重叠；每 finding 校验 scope count/digest 与完整边；事务中途失败原子回滚；外部 current/validity 漂移仍 `STORE_CORRUPT`。本轮 lifecycle 351 断言中，重算 hash 后的边目标恢复 ACTIVE、删除首/尾/全部边等真实持久漂移负例已独立跑过，仍拒绝。

### F3 [P1] A4 只加在 runtime 且扩大为全部 OPEN，造成 entry 绕过与 KS 自身返工自锁

合同依据：§5.2 明确 OPEN 只阻 earliest 的下游、修复者是 earliest；§7.3 A4“无 OPEN blocking”。因此不是要求弱化 A4，而是要求所有入口使用同一阻断范围。

代码位置：[runtime.ts:877](/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard/runtime.ts:877)；对照 [LoopCapabilityEntry 的准入段](/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard/core/loop-capability-entry.ts:408)。

两条互补复现：

- knowledge-sync 自己输出 BLOCKED + HIGH/KNOWLEDGE。恢复目标是 knowledge-sync；下一次 run 的 adapter 调用为 0，返回 `ADMISSION_DENIED`。该节点自己的 current 尚不可用，合法返工证据未产生，不能靠要求先 resolve 绕过返工。`openFindings.length > 0` 将自身目标错误算成下游阻断。
- code-review 发现 HIGH/IMPLEMENTATION→返工 implementation/code-review→OPEN 尚未 resolve。run 正确停于 A4；同一恢复状态通过合法 `LoopCapabilityEntry.execute`（不带 request 不允许的 attempt 字段），实际派发 knowledge-sync 并写 succeeded。该 entry 没有对应 A4 守卫。

证据：[六类实际返工/关闭收敛](/private/tmp/g4-r8-evidence/admission-probes.log)、[合法 direct entry 独立探针](/private/tmp/g4-r8-evidence/direct-entry-probe.log)。admission 日志末尾早期 DIRECT_A4 因多带 attempt 报 INVALID_INPUT 是夹具错误，不作为漏洞证据；后者是修正请求后的有效复现。

影响路径：同一 OPEN 状态在 run 和 direct entry 上产生相反准入结果；真实 KS finding 无法开始自己的返工。原 A1 planning 修复与 wp4/wp5/wp6 正确期望不因此回退。

一次性修复边界：统一 A4 的公开执行前置条件，按节点顺序和 finding 阻断范围筛选 OPEN；覆盖 run 与 direct entry/claim 的真实派发边界。允许 earliest 本身返工，继续拦截其下游；closed+MISSING 补尾段保持可达。继续保留发现节点逐条 resolve 的责任，不能以普通 PASS/自动批量 close 代替。

回归矩阵：七节点准入真值；六个可表达类别实际返工；尤其 KNOWLEDGE 自身目标；OPEN/RESOLVED/ACCEPTED 对照；IMPLEMENTATION 未 resolve 时 run/direct entry 均零 KS 派发；resolve 后二者可继续；closed+MISSING→尾段新 current→ELIGIBLE；A1 upstream OPEN、ESCALATED、BLOCKED_UNKNOWN 仍拒；PLANNING 修复不回归。

### F4 [P1] 隔离 block 保存失败被吞掉，下一调用可重新认定成功

合同依据：Decision-087 六场景要求“保留隔离证据并 BLOCKED”，以及本次 B7 明确要求同调用、只读恢复、同 run 重入均不能恢复未处置隔离失败为 success。这是新持久化接缝的实际错误处理缺口，不是合同外的泛化存储加固。

代码位置：[runtime.ts:1393](/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard/runtime.ts:1393)，尤其 [catch:1418](/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard/runtime.ts:1418)。catch 无条件假定“已经持久阻断”，未验证失败原因或回读事实。

复现：仅在临时 SQLite 中安装 BEFORE INSERT ON loop_events trigger，匹配 `NEW.kind='run_blocked'` 时 `RAISE(ABORT,'r8 block persistence fault')`。其他 store 读写和真实 gateway 保持正常；终验 WIP 从 A 漂到 B。

| 出口 | 第一次返回 | 持久读回 | 同 run 再次调用（B→B） |
| --- | --- | --- | --- |
| COMPLETED | failed/BLOCKED/PRODUCTION_ISOLATION_VIOLATED | state=running，reason=null，run_blocked=0 | **success/COMPLETED**，复用原链，0 新派发 |
| BLOCKED | 同上 | running、无隔离事实 | 再派发 1 次 |
| failed | 同上 | running、无隔离事实 | 再派发 1 次，结果 READY |

证据：[production-matrix.log](/private/tmp/g4-r8-evidence/production-matrix.log)，每种出口的 `drift=write-failure` 行。无写故障的六格 WIP/base 正例都持久阻断，不混为失败。

影响路径：后验识别污染→appendEvent 失败→catch 吞掉→调用者只得到看似已处理的 BLOCKED→恢复无隔离事实→下一次 preflight 把 B 当干净基线并复用输出。原 capabilityChainStatus=COMPLETED 与 run 状态 BLOCKED 的并存本身正常；问题是本例连 run block 都不存在。

一次性修复边界：不得在未确认持久事实时把写入异常当成“已阻断”。隔离终验与可恢复状态须绑定本次 run，在失败/恢复重入时保持未完成隔离处置的 fail-closed 语义；明确传播持久化错误，避免下一调用重新取污染基线即成功。仅去掉 catch 虽暴露首次错误，还需验证后续重入不能复用未终验完成的结果。沿用现役 store/工作区边界，不借机建立第二恢复系统或新增 C03-B 释放协议。

回归矩阵：COMPLETED/BLOCKED/failed × WIP/base × 正常保存/保存失败；每格检查首次结果、只读恢复、同 run 重入、派发数及持久事实；preflight 失败零派发；每次正常进入执行的调用恰好 preflight 一次、终验一次；已经有 block 时不得当成写失败可忽略的充分证明。

正常隔离 block 的 release 交互已核对：`releaseRunRegateBlock(SCOPE_RESET)` 只释放预算 block，对隔离 block 返回 `ILLEGAL_TRANSITION`。因此隔离失败是不能自动释放的持久阻断，须先处置；如何扩充人工释放机制归 C03-B/后续授权，本轮不把“没有自动释放”列成缺陷。

## 6. 独立验证结果

测试副本 `/private/tmp/g4-r8-baseline` checkout 精确 HEAD，tracked 文件无修改，node_modules 复用本地依赖。159 个文件（157 TS、2 shell）逐文件串行运行，每文件 600 秒超时；没有以并行汇总代替串行要求。执行明细：[baseline-results.json](/private/tmp/g4-r8-evidence/baseline-results.json)，驱动：[run-baseline.py](/private/tmp/g4-r8-evidence/run-baseline.py)。

| 验证 | 本轮独立结果 |
| --- | --- |
| tsc --noEmit | 退出 0，无诊断 |
| 全量文件 | **159/159 退出 0** |
| 六场景矩阵 | **44 passed / 0 failed** |
| G4 fix-round 反例矩阵 | **27 / 0** |
| finding lifecycle | **351 / 0** |
| artifact revision | **237 / 0** |
| node-output-envelope | **44 / 0** |
| WP4 regate | **122 assertions passed** |
| WP5 cross-entry | **177 assertions passed** |
| WP6 completion | **34 assertions passed** |
| validate-skill-contracts.rb | 退出 0 |
| validate-compact-prompt-contracts.rb | 退出 0 |
| validate-capability-metadata-chain.rb | 退出 0 |
| control-plane validate_state.rb | 本地文件只读校验 PASS v2，退出 0；未更新 STATE |

[编译/校验命令与退出码](/private/tmp/g4-r8-evidence/validation-results.json)。这些数字与整改方声称一致，但上述独立反例证明测试未覆盖全部合同路径。

| 定向变异 | 当前 HEAD 上的靶测试 | 独立结果 |
| --- | --- | --- |
| M-A：缺 status 默认化 | node-output-envelope | exit 1，捕获 |
| M-C：H4 重试回退 | loop-g4-r6-fix-round | exit 1，捕获 |
| M-E：删除接受版本门 | loop-g4-r6-fix-round | exit 1，捕获 |
| M-F：删除 journal 顺序门 | loop-g4-r6-fix-round | exit 1，捕获 |

[mutations.json](/private/tmp/g4-r8-evidence/mutations.json)、[变异驱动](/private/tmp/g4-r8-evidence/run-mutations.py)。四项在独立变异副本逐个施加、运行、还原；最终 tracked diff 为零。这里是每项指定靶测试杀死变异，不宣称每个 mutant 跑过 159 文件。

B8 的 h1(d) 独立对照构造真实 HIGH scan 原成员，归位 OPEN 并清除 acceptance proof/字段后重算 canonical；只读校验通过，再比较 v5/v4。v5 接受正例与 v4 拒绝负例排除 CRITICAL、非法 proof 或 canonical 不一致的前置遮蔽。M-F 对应的 ledger 顺序、blocked→succeeded 归约亦用实际事件承重。

平台范围：本次 macOS 实测了 `/var`/`/private/var` 物理归一、末级和父级 symlink、相对 prepared 路径。Linux 没有独立运行环境证据；代码使用 Node realpath 做物理比较，未发现 macOS 专用字符串分支，不能据此写成“Linux 已实测通过”。

## 7. 建议项与明确排除项

建议（不升级为本轮 blocker）：

- **S1**：`realpathSync(identity.repositoryPath)` 在 repositoryPath 不存在时抛裸 `ENOENT`，而 prepared 缺失已包装为 `PRODUCTION_ENTRY_INVALID_INPUT`。实测零派发，未造成隔离失效；建议统一生产入口错误分类。相对 repositoryPath 本就受解析入口的绝对路径要求约束，和合法相对 prepared 路径不同。
- **S2**：六场景 s4 用一个 `captured` 槽接 task-planning/implementation，后者覆盖前者，最终断言不能独立承重 planning。建议按 capability/attempt 保存每次载体并分别断言。B5 本轮已用独立探针逐节点、逐载体证明通过，不因此再开同根因验证 blocker。

明确不属于本轮 G4 阻塞：G5 projector/parity 与其负向投影矩阵；WP6 综合对抗矩阵建设；G3 冻结文本；C03-B 工作区协议既有归属事项；C01/WP1～WP4 已收口行为（除本次直接破坏）；第二生产入口；真实 Agent/Git/发布；C05 验收；20001b2 提交消息及仓管理规范。

不作为缺陷：v5 现役/v4 历史 canonical；bootstrap source 1.0.0；已裁断的 resume lease 失败方结果；W6 forged-skill 收紧；机械夹具绑定；attempt-scoped N.0.0；D04 HEAD fail-closed；checkpoint 并行偶发；五项授权方向；ai-sdlc 协议文档同步；opaque count 容忍本身；PointLastAttempts 兼容别名。

**最终判定仍为 FAIL：B1/B5/B6/B8 CLOSED，B2/B4/B7 PARTIAL，B3 NOT_CLOSED。G4 尚不具备 PASS 后进入 Current User 收口裁决的条件。** 修复应限于 F1～F4 的一次性根因边界，不能以测试全绿或整改自评代替关闭证据。

## 8. 复现实用入口

从 `/private/tmp/g4-r8-probes` 执行；这些脚本会创建并清理自己的临时数据库/目录，不修改产品 tracked 代码：

```sh
node --import tsx tests/r8-registration-probes.ts
node --import tsx tests/r8-count-drift-probe.ts
node --import tsx tests/r8-b2-probes.ts
node --import tsx tests/r8-admission-probes.ts
node --import tsx tests/r8-direct-entry-probe.ts
node --import tsx tests/r8-production-probes.ts
node --import tsx tests/r8-provenance-probe.ts
node --import tsx tests/r8-root-inventory-probe.ts
node --import tsx tests/r8-version-probe.ts
node --import tsx tests/r8-directive-probe.ts
```

独立探针主要输出结构化观测，不以其进程退出 0 代表合同通过；结论来自报告列出的实际结果与合同预期之差。早期非法夹具尝试不作功能证据，最终日志对应修正后的前提（direct entry 单独日志如 F3 说明）。
