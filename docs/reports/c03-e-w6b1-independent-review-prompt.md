# C03-E W6b1 独立复审 Prompt（交付外部 Agent）

> 用途：把下方分隔线之间的**整段**复制给另一个独立 agent 做只读复审。实现方自审 / 子 agent / 对抗视角都不算数。
> 复审基线：产品库 `feature/c03-e1-e4-runtime-implementation`，范围 `d4ee31e..5f2bcd8`（单提交），HEAD `5f2bcd8`，Node **v24.12.0**。
> 复审结论回来后：零阻塞 → 出 W6b1 pass-state（CP）并进入 W6b2（E4-T4）；有阻塞 → 按报告一次性修复后复审。

---

对 C03-E W6b1（E4-T3 resume lease 覆盖 recovery→claim→spawn→terminal/promotion 决策窗口）做一次全量、只读、根因合并式独立复审。主审范围为 `d4ee31e..5f2bcd8`（单提交，HEAD 实测须为 `5f2bcd8`，工作树干净、与 `origin/feature/c03-e1-e4-runtime-implementation` 同步）；允许对全仓抽查，不限于本提交触及文件。验证环境必须 Node v24.12.0（`export PATH="$HOME/.nvm/versions/node/v24.12.0/bin:$PATH"`），所有测试/探针亲自实跑，不采信实现方口径。以 C03-E 已冻结授权合同为边界——规划 `docs/LOOP-CORE-C03-E-PLAN.md` §6 E4 候选目标面与验收、Decision-071（real 路径休眠 D-071）/072/073、W1～W6a 已 PASS 冻结面、台账 `docs/reports/c03-e-e1e4-task-set-and-gate-audit.md` E4 段——逐项完成，不改代码、不提交、不推送、不使用 DocFlow。

**本波的形态请注意**：E4-T3 不是"从零实现一个 lease"，而是把已经**结构性存在但未被强制**的覆盖变成可强制、可证明的防火墙。取证事实是 `runProduction`（`runtime.ts:961`）在 `:1033` 委托 `run()`，而 `run()` 整体包在 `withResumeLease`（`:394`）中，所以窗口确实被覆盖；缺的是"无 lease 不得进入窗口"的强制点。复审时请同时判定两件事：① 取证事实是否成立（覆盖是否真的无缝、有无我漏掉的旁路入口）；② 新增的强制点是否真实承载校验、方向是否为 fail-closed。

〇、先建立两份清单（前置产物，后续判定都挂到清单上）
1) 行为不变量清单，至少覆盖——I1 进入 dispatch 窗口必须持有该 journal 的 lease（`runtime.ts` 装配点存在且唯一）；I2 拒绝发生在**第一次持久化写入之前**（无 run bootstrap、无 started claim、无 spawn）；I3 lease 身份按 `leasePathFor` 重算，同一 journal 的不同拼写等价、不同 journal 不等价；I4 未装配守卫的入口行为完全不变（8 个直接构造 entry 的既有用例不得受影响）；I5 `busy_timeout=0`、轮询等待预算与 `STORE_BUSY` 诚实失败语义未被削弱，持锁时间变长不得退化为阻塞等待或静默排队；I6 并发 resume 同一 execution point 至多一个 spawn（规划 S12）；I7 real 路径仍休眠，本波没有成为激活真实 Agent 的通道；I8 构造函数拒绝不可用守卫值（空串/空白串）。
2) 失效模式 → 可判定错误码清单：无 lease 进入窗口 → `STORE_BUSY`；构造期非法守卫值 → `INVALID_INPUT`；lease 竞争 → `STORE_BUSY`（不得变成 `STORE_FAILURE` 或悬挂）；claim 被抢占 → `execution_already_claimed`（既有 F1 语义，结果字段而非抛出）；不得出现不可判定或静默吞错路径。

一、取证复核（先做，结论决定后续判定）
a) 用 `git grep`/调用图确认：`runProduction` → `run()` 的委托是否唯一且无条件；`runtime.ts` 中 `entry.execute` 的两个调用点是否都在 `withResumeLease` 闭包内（`:394`–闭包结束）；是否存在**任何其他**入口能到达 `LoopCapabilityEntry.execute` 或 `claimNextCapabilityExecution`（含 scripts、coordinator、autonomous delivery loop、publisher），若有，其是否在 lease 内——这是本波最可能的漏网点。
b) `loop-resume-lock.ts` 的 `HELD_LEASES`（AsyncLocalStorage）语义：`withResumeLease` 的重入分支是否会掩盖"不同 journal 却复用持有 lease"的情形；`finally` 释放路径是否正确（异常/提前 return 都释放）。
c) 确认 `detached: true` 的真实 spawn（`core/loop-posix-process-runner.ts:205`）处在窗口内；说明"进程组脱离 ≠ 决策窗口脱离"，并判断本波是否需要（按合同是否要求）对 detached 子进程生命周期做额外处理；若合同未要求，记为建议项而非阻塞。

二、E4-T3 逐项深审（逐项给 CLOSED / NOT_CLOSED / PARTIAL + 证据行号）
a) `isResumeLeaseHeld`（`core/loop-resume-lock.ts`，新增导出）：是否复用 `leasePathFor` 同一套规范化（不得另算一份）；未持有时返回 false；持有**其它 journal** 的 lease 时返回 false；`realpathSync` 抛 `ENOENT`（父目录不存在）时返回 false 而非崩溃，其他错误是否如实抛出（不得 blanket-catch 掩盖真错误）；该函数本身是否只读、无副作用、不建库/不建文件。
b) `LoopCapabilityEntry` 守卫（`core/loop-capability-entry.ts`）：断言位置是否在 `recoverRunContext` 之前、在 `bootstrapRunWithSource` 之前、在 `claimNextCapabilityExecution` 之前（顺序错误即本波失效）；错误码与消息是否稳定可判定；`this.options` 已 freeze，守卫读取的是否为构造期快照（防止后期改 options 绕过）；构造函数对 `requireResumeLeaseJournal` 的校验是否覆盖空串、空白串、非字符串（含 `as any` 传入）。
c) `runtime.ts` 装配：`requireResumeLeaseJournal: resumeJournalPath` 是否与 `withResumeLease(resumeJournalPath, ...)` 用的是**同一个**变量/同一条路径计算（注入 runStore 与默认 `join(workspaceRoot,"journal.db")` 两条分支都要核对）；把 `entry` 构造上移到 `resumeJournalPath` 计算之后是否引入了任何行为变化（求值顺序/副作用）。
d) **可选守卫的权衡裁决（重点）**：守卫是可选（`options.requireResumeLeaseJournal?`）而非无条件。请判定：① 生产路径是否无旁路（`runtime.ts` 是唯一装配点且必装）；② 这是否给了未来新入口"忘记装配就绕过"的空间；③ 若你判定必须升级为无条件，请明确指认是哪条合同要求使其成为范围内阻塞项，并给出需要改动的 8 个既有测试文件的清单与改动性质（否则按建议项处理）。
e) 并发属性：`tests/loop-w6b1-resume-lease-window.test.ts` T7 是否真实并发（两个 `withResumeLease` 同时竞争同一 journal），断言是否足以证明"至多一个 spawn"——注意区分：loser 可能是 lease 竞争失败（`STORE_BUSY`），也可能是 lease 获得后 claim 被抢占（`execution_already_claimed`，结果字段而非抛出）；两种情形下 spawn 计数都必须 ≤ 1。请额外实跑一次把等待预算调到 0/极大两种极端，确认语义不漂移。
f) 测试是否只测了"守卫存在"而没测"窗口真的被覆盖"：检查 T2/T7 是否通过了真实 store 与真实 claim 路径（不得用 stub 掉 gateway 的方式制造假绿）。

三、回归与反放水（不限于上述）
- 生产 diff 应恰为 3 文件（`loop-resume-lock.ts` +32、`loop-capability-entry.ts` +39/`-0`、`runtime.ts` +19/`-8`），逐 hunk 确认无夹带、无无关重构、无注释伪装；`runtime.ts` 本波有改动（+19/-8），与台账 §3.1「冻结生产文件零改动」的**历史批次**陈述（针对 `b842b18` 相对 merge-base）不冲突，但请单独确认这一处装配的正当性。
- W1～W6a 冻结面零改动：Q1 七槽绑定、gateway 开关默认 deterministic、production 门/preflight、路径 A 冻结与 B-7 零引用、W5 九类不推进、W6a 十进程证据字段与 recovery 五分类；用 diff 逐行确认，不得因移动 `entry` 构造位置而改变任何既有行为。
- 8 个直接构造 `LoopCapabilityEntry` 的既有用例（wp4-regate / w5-invalid-output-no-advance / capability-execution / validation-guards / wp6-completion-contracts / wp5-cross-entry / c03d-runtime-wiring / regate-dispatch-window）必须全部保持原样通过——这是 I4 的核心证据。
- real 休眠复核：本波未引入任何 `source=real` 通道、未新增真实 spawn、未导出新激活面。
- 并行全套件若出现文件级 FAILED，必须隔离单跑定性，区分进程级 sqlite runner 竞争（既有环境项）与断言级失败。

四、反向探针（必须亲自改代码制造红，再还原，记录每探针首挂断言）
至少：P1 把 `loop-capability-entry.ts` 中的 `!isResumeLeaseHeld(...)` 改为 `false` → T1/T4 必红（实现方已自测：T1 `AssertionError` 转红）；P2 删掉 `runtime.ts` 的 `requireResumeLeaseJournal` 装配行 → 请给出可判定"生产路径失去防火墙"的证据（注意：T1 自装 flag 仍会绿，因此这一处需要人工/diff 确认，请说明你如何验证）；P3 让 `isResumeLeaseHeld` 恒返回 `true` → T1/T4 必红；P4 把守卫下移到 `recoverRunContext` 之后（或 `claimNextCapabilityExecution` 之后）→ T1 的"零持久化写入"断言必红；P5 把 `leasePathFor` 换成另一条路径计算（使身份可被伪造）→ T4 必红；P6 把 `busy_timeout` 改为非 0 或把等待预算改为无限 → 说明这会如何破坏 I5（如实记录，不得因"没红"就判定无害）。探针后 `git status --porcelain` 必须为空。

以下为有意为之或已知事实，不得作为缺陷上报：① 守卫为可选项（见二.d，按建议项处理，除非能指认合同条款）；② 持锁时间覆盖整个 `run()` 会推高 `STORE_BUSY` 概率，这是合同内已知代价；③ `Results: 1767 passed` 是最后一个测试文件的内部计数，不是全套件断言总数（runner 只按文件 exit code 判定），属口径澄清；④ `loop-codex-implementation-adapter` 等文件的并行 runner 竞争偶发（隔离即绿）为既有环境项；⑤ W6b2（E4-T4 `human_action_required` artifact kind 与六合法码）、W6b3（E4-T5 attempt workspace 三态与 wip digest 越界检测）、E5 真实 canary/prepare/real dispatch、路径 A 物理删除、真实 Agent/Git/发布副作用、C-T1/C-T2 收口与 Exchange/PKB publication 均**不在本轮范围**。不要把合同外的泛化加固建议升格为阻塞；若认为必须纳入，先指明是哪条合同要求使其成为范围内问题。

证据基线（实现方口径，须独立复跑不轻信）：HEAD `5f2bcd8`；`npx tsc --noEmit` 干净；`scripts/validate-skill-contracts.rb`、`validate-capability-metadata-chain.rb` 均 exit=0；新增 `tests/loop-w6b1-resume-lease-window.test.ts` 22 断言全绿；并行全套件 144 文件 / `failed_file_count=0` / `exit=0`；自测反向探针 P1 已实跑并还原。

输出要求：先给两份清单，再统一输出所有发现（同一根因的变体合并，W1～W6a 已判定事项不得重复上报）；每个阻塞项给出可复现证据、影响路径、一次性修复边界与回归矩阵。最后明确分列：哪些是阻塞项、哪些是建议项、哪些不属 W6b1 范围。若本轮零阻塞，明确给出 W6b1 PASS 判定，并声明可进入 W6b2（E4-T4）；同时说明 PASS 仅代表实现可进入下一步，不等于激活真实 Agent（仍需 E5 另行授权）。
