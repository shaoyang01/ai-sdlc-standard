# C03-E W6a 独立复审 Prompt（交付外部 Agent）

> 用途：把下方分隔线之间的**整段**复制给另一个独立 agent 做只读复审。实现方自审 / 子 agent / 对抗视角都不算数。
> 复审基线：产品库 `feature/c03-e1-e4-runtime-implementation`，范围 `654923a..5b1855a`，HEAD `5b1855ab7095caefe5f3adb4f05d0bd724c7998a`，Node **v24.12.0**。
> 复审结论回来后：零阻塞 → 出 W6a pass-state（CP）并进入 W6b；有阻塞 → 按报告一次性修复后复审。

---

对 C03-E W6a（E4-T1 durable process evidence + E4-T2 recovery 五分类）做一次全量、只读、根因合并式独立复审。主审范围为 654923a..5b1855a（单提交，HEAD 实测须为 5b1855ab7095caefe5f3adb4f05d0bd724c7998a，工作树干净、与 origin/feature/c03-e1-e4-runtime-implementation 同步）；允许对全仓抽查，不限于本提交触及文件。验证环境必须 Node v24.12.0（export PATH="$HOME/.nvm/versions/node/v24.12.0/bin:$PATH"），所有测试/探针亲自实跑，不采信实现方口径。以 C03-E 已冻结授权合同为边界——规划 docs/LOOP-CORE-C03-E-PLAN.md §6 E4-T1/T2 验收、Decision-071（real 路径休眠 D-071）/072/073 全部裁决、W1～W5 已 PASS 冻结面、台账 docs/reports/c03-e-e1e4-task-set-and-gate-audit.md E4 段——逐项完成，不改代码、不提交、不推送、不使用 DocFlow。

〇、先建立两份清单（前置产物，后续判定都挂到清单上）
1) 行为不变量清单：至少覆盖——I1 十字段全部 nullable 且确定性 shadow 路径逐字段恒为 null；I2 字段集封闭（canonical 字段精确匹配，多/少一字段即拒绝，core/loop-capability-execution.ts:122,154）；I3 进程证据要么整体缺席、要么由非空 processInvocationDigest 锚定；I4 事件 validator 与 store 写门双层 fail-closed，任一层都不能单独被绕过；I5 十字段进入 canonical hash，改写任一事实必改 hash、无静默分叉；I6 journal 列定义/写入/读出/表结构机械一致（loop-run-store.ts:1306 建表、3997-4021 insert、609-668 row 映射、4806 附近 table_info 一致性表）；I7 recovery 五分类互斥且穷尽、纯函数无副作用、RunRecoveryContext 只此一个分类权威；I8 real 路径仍休眠（无生产入口传 source=real、无新真实 spawn、barrel 不导出新激活面）。
2) 各公开读写路径失效模式 → 可判定错误码清单：非法证据形态、ref/digest 不成对或不匹配、promotion 缺 staging、started 带结果/证据、succeeded 非零退出、failed 带 promotion、并发/存储层错误各自落到什么稳定 code（INVALID_INPUT / OUTPUT_CONTRACT_VIOLATION / ILLEGAL_TRANSITION / STORE_* 等），不得出现不可判定或静默吞错。

一、E4-T1 逐项深审（逐项给 CLOSED / NOT_CLOSED / PARTIAL + 证据行号）
a) 字段定义与封闭性：LoopCapabilityExecutionEvent 十字段类型（capability-execution.ts:92-122 附近）是否精确；PROCESS_SIGNALS（:107）是否封闭枚举、ProcessSignal 是否由其派生、有无第二份信号清单；canonical 字段数组是否与类型、SQL 列、insert 列、row 映射四处逐一对齐（列出四向对照表，任何一维多/缺/错位即问题）。
b) 校验规则完备性与正确性（validateLoopCapabilityExecutionEvent，:208 起、进程段 :336-445）：exit 0..255 边界（-1/0/255/256/非整数/NaN）、signal allowlist 与大小写、exit×signal 互斥、duration 正安全整数、truncated 严格 boolean、staging/promotion 各自 ref+digest 成对且 digest 与 ref 内嵌 digest 相等、promotion 必须有 staging、started 十字段与结果字段全空、succeeded 带证据时 exit 必为 0 且无 signal、failed 不得带 promotion；逐规则确认 fail-closed 方向（默认拒绝），并找出任意一条"给了非法值却能落库"的路径。
c) 双层一致：同一非法形态是否在 validator 与 store.appendCapabilityExecutionInTransaction 两层都被拒；claimNextCapabilityExecution（started 原子 claim）路径是否同样覆盖；是否存在能绕过 validator 直达 SQL 的公共写入口。
d) canonical hash 防分叉：canonicalizeLoopCapabilityExecutionEvent（:446）是否序列化全部十字段且字段顺序/空值规范化稳定；构造仅差一个进程字段的两个合法事件，证明 hash 不同；构造字段顺序不同但语义相同的事件，证明 hash 相同。
e) 存储层：新建库 v7 user_version 不变前提下十列可写可读、读出类型正确（INTEGER/TEXT/0/1 boolean）、旧库迁移路径（4806 一致性表）对新增列是要求精确存在还是兼容；列 NOT NULL/可空性是否与"全 nullable"一致；canonical_sha256 落库前是否在服务端重算（防止客户端自带 hash 绕过）。
f) gateway 透传纯度：execution/gateway.ts 四处补字段是否确定性路径全部硬编码 null（started/succeeded/failed/deterministic claim），有无任何一处把未授权的真实进程证据泄漏进确定性事件；Omit 类型扩展是否与事件字段一致。

二、E4-T2 逐项深审
a) 完备性与互斥：classifyCapabilityRecovery（loop-recovery.ts:90）对 (chainStatus × last.status × 各证据字段 × pendingRevision) 的组合是否恰好产出五分类之一或 null，有无两个分类同时成立、或都不成立落入未定义的组合；用真值表枚举关键组合。
b) 优先级正确性：human > verify-staged > cleanup > safe-retry > terminal 的次序是否符合合同——特别核对：humanActionRef 是否压过 cleanup/terminal；staged 未提升是否压过 cleanup；真进程失败无 staging 是否必为 CLEANUP_REQUIRED 而确定性（invocation=null）retryable 失败是否仍 SAFE_RETRY（这是本次核心裁决，须反证：把 invocation 填上/去掉各跑一遍）；非 retryable 失败、succeeded 尾但指针被 Gate 切断（BLOCKED）是否落 TERMINAL_FAILED_BLOCKED；pending revision materialization 窗口是否归 SAFE_RETRY 且不重派 agent；COMPLETED 与"从无 capability 事件"是否返回 null。
c) 纯度与单一权威：函数是否纯（不读 store、不碰时间/随机/全局态）、可独立单测；RunRecoveryContext 是否只在 recoverRunContext 末尾（:745,816）计算一次 recoveryClassification，全仓有无第二处自行推断恢复类别的分叉；recoverRunContextInTransaction 各早退分支是否也携带一致分类或明确不适用。
d) 端到端：经真实 store 落 started/failed/证据事件后 recoverRunContext 输出的分类是否与纯函数一致（不允许只测纯函数而跳过 journal 投影）。

三、回归与反放水（不限于上述）
- 本提交 12 个既有测试文件的 fixture 补字段是否纯机械补齐（每个 +10/+12/+30 行左右，只加 null 字段），逐文件确认没有借补字段改动断言、削弱计数或放宽预期；特别审查 loop-wp35-b-round1/round2 两处 `as unknown as LoopCapabilityExecutionEvent` 构造器——它们为何能绕过 tsc、运行时 canonical 字段门是否仍有效拦截，补齐后断言强度是否不变。
- W1～W5 已冻结行为（Q1 八槽绑定、real-vs-deterministic 开关默认 deterministic、production 门/preflight、路径 A 冻结 B-7、W5 九类不推进）是否被本次任何一行改动破坏；tracing 状态机、双 Agent 防火墙、NODE_CAPABILITY_IDS/角色、Git 边界须零改动（用 diff 逐行确认生产侧确仅 4 文件且无夹带）。
- real 休眠复核：全仓无生产可达的 source=real / 真实 spawn 接通，新增字段没有成为偷偷激活真实 Agent 的通道。
- 并行全套件若出现文件级 FAILED，必须隔离单跑定性：进程级 STORE_FAILURE/init 阶段（既有 sqlite runner 竞争）与断言级失败严格区分，不得把竞争偶发计为本次缺陷，也不得把真失败用"偶发"开脱。

四、反向探针（必须亲自改代码制造红，再 git checkout 还原，记录每探针首挂断言）
至少：P1 删掉某条进程证据校验（如 exit 范围或 promotion-needs-staging）→ 对应负向用例必红；P2 canonical 字段数组或序列化去掉一个新字段 → hash/字段封闭测试必红；P3 把 cleanup 判定条件放宽为"任意 failed 即 cleanup"（去掉 invocation 非 null 前提）→ 确定性 SAFE_RETRY 用例必红；P4 让确定性 gateway 任一补字段处非 null → shadow-all-null 不变量用例必红；P5 删掉 store 层校验只留 validator（或反之）→ 双层 fail-closed 用例必红。探针后 git status --porcelain 必须为空。

以下为有意为之或已知事实，不得作为缺陷上报：① capability 事件 schemaVersion 仍为 4、journal 仍为 v7（user_version 不升），十字段以 v7 内 nullable 列承载，无新表、无第二权威；② 确定性/影子事件十字段恒 null 是设计而非缺失；③ 字符串/字面量机械检测固有的注释伪装面（tripwire 性质，fail-closed 方向）不升格；④ loop-codex-implementation-adapter 等文件的并行 runner 竞争偶发（隔离即绿）为既有环境项；⑤ W6b（E4-T3 resume lease 窗口扩展、E4-T4 human_action_required 六个合法码与 SWITCH_AGENT_REQUIRED/SHADOW_FALLBACK_REQUIRED 非法、E4-T5 attempt workspace 三态）、E5 真实 canary/prepare/real dispatch、路径 A 物理删除、真实 Agent/Git/发布副作用、C-T1/C-T2 收口与 Exchange/PKB publication 均不在本轮范围。不要把合同外的泛化加固建议升格为阻塞；若认为必须纳入，先指明是哪条合同要求使其成为范围内问题。

证据基线（实现方口径，须独立复跑不轻信）：HEAD 5b1855a；tsc --noEmit 干净；scripts/validate-skill-contracts.rb、validate-capability-metadata-chain.rb、validate-compact-prompt-contracts.rb 均 exit=0；新增 tests/loop-w6a-process-evidence-recovery.test.ts 68 断言；并行全套件 143 文件 / 1767 断言 / 0 断言失败，唯一文件级 FAILED（loop-codex-implementation-adapter）隔离 3 连全绿（354×3）。

输出要求：先给两份清单，再统一输出所有发现（同一根因的变体合并，前 W1～W5 已判定事项不得重复上报）；每个阻塞项给出可复现证据、影响路径、一次性修复边界与回归矩阵。最后明确分列：哪些是阻塞项、哪些是建议项、哪些不属 W6a 范围。若本轮零阻塞，明确给出 W6a PASS 判定，并声明可进入 W6b（E4-T3/T4/T5）；同时说明 PASS 仅代表实现可进入下一步，不等于激活真实 Agent（仍需 E5 另行授权）。
