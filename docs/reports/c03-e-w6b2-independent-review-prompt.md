# C03-E W6b2 独立复审 Prompt（交付外部 Agent）

> 用途：把下方分隔线之间的**整段**复制给另一个独立 agent 做只读复审。实现方自审 / 子 agent / 对抗视角都不算数。
> 复审基线：产品库 `feature/c03-e1-e4-runtime-implementation`，范围 `<W6B2 实施提交>`（单提交，见文末基线），Node **v24.12.0**。
> 复审结论回来后：零阻塞 → 出 W6b2 pass-state（CP）并进入 W6b3（E4-T5）；有阻塞 → 按报告一次性修复后复审。

---

对 C03-E W6b2（E4-T4 `human_action_required` machine-readable artifact 与六合法码）做一次全量、只读、根因合并式独立复审。主审范围为 W6b2 实施提交（单提交，工作树干净、与 `origin/feature/c03-e1-e4-runtime-implementation` 同步）；允许对全仓抽查。验证环境必须 Node v24.12.0（`export PATH="$HOME/.nvm/versions/node/v24.12.0/bin:$PATH"`），所有测试/探针亲自实跑，不采信实现方口径。以 C03-E 已冻结授权合同为边界——规划 `docs/LOOP-CORE-C03-E-PLAN.md` §6 E4 候选目标面（`:452-469`）与验收、Decision-071（real 休眠 D-071）/072/073、W1～W6b1 已 PASS 冻结面、台账 `docs/reports/c03-e-e1e4-task-set-and-gate-audit.md` E4 段——逐项完成，不改代码、不提交、不推送、不使用 DocFlow。

**本波的形态**：E4-T4 是**先立契约**而不是先接活。取证事实：当前生产代码中**没有任何一处给 `humanActionRef` 赋非 null 值**（`execution/gateway.ts` 五处写入点全部硬编码 null），唯一的消费者是 `classifyCapabilityRecovery`（`core/loop-recovery.ts:101`）把非 null 映射为 `HUMAN_INPUT_REQUIRED`。这与 real 路径按 D-071 休眠一致。因此本波交付的是 artifact 契约、六个合法码的 allowlist、以及写入/读回的校验；**没有接生产者**。请判定这是合同内的正确形态，还是必须在本次就接上生产者。

〇、先建立两份清单（前置产物，后续判定都挂到清单上）
1) 行为不变量清单，至少覆盖——I1 恰好六个合法码，且集合与规划 `:465-468` 逐字一致；I2 `SWITCH_AGENT_REQUIRED` / `SHADOW_FALLBACK_REQUIRED` 在**构造与读回两条路径**上都被拒；I3 allowlist 大小写敏感（不接受 look-alike 变体）；I4 字段集精确（多/缺一字段即拒）、schema 钉死、标识符与消息有界；I5 序列化确定性（同输入同 digest，无时钟/随机）；I6 kind 被钉为 `human_action_required`，异 kind 的 ref 在读回路径被拒；I7 ref/digest 不一致时被拒而非静默读取；I8 新增 kind 后，三处 kind 注册表（`loop-artifact-store.ts:14` 联合类型、`:34` KINDS 数组、`loop-artifact-revision.ts:46` REVISION_KINDS 及其编译期漂移检查）**全部同步**；I9 real 路径仍休眠，本波未成为激活通道；I10 失败以模块边界的 failure result 返回，不向外抛未知异常，诊断不含原始输入值。
2) 失效模式 → 可判定原因清单：非法 reasonCode / 大小写变体 / 未知字段 / 缺字段 / schema 不符 / 标识符格式越界 / 消息超长 / 内容非 JSON / 内容非对象 / 异 kind ref / digest 不一致，各自落到 `invalid_input` / `invalid_bytes` / `too_large` 或 store 的 `ARTIFACT_DIGEST_MISMATCH`；不得出现不可判定或静默吞错。

一、契约与实现逐项深审（逐项 CLOSED / NOT_CLOSED / PARTIAL + 行号）
a) `HUMAN_ACTION_REASON_CODES` 六个码是否与规划 `:465-468` 逐字一致（含 `EXTERNAL_SIDE_EFFECT_AUTHORIZATION_REQUIRED` 的长拼写）；`HumanActionReasonCode` 是否由该数组派生（不得另写一份字面量联合）。
b) allowlist 的**方向**：是否默认拒绝（先判 `includes` 再放行），而不是默认接受后排除两个非法码；把 `SWITCH_AGENT_REQUIRED` 加进数组、或把比较改成大小写不敏感，分别会被哪个断言捕获（见探针 P1/P2）。
c) 构造路径 `buildHumanActionRequiredArtifact`：字段白名单、标识符正则与长度界、message 长度界、null 允许范围（run-scoped 场景）、`capability`/`executionRole` 的类型选择是否有意（本波为 `string | null` 而非 `NodeCapabilityId`，请判定是否需要收紧并说明理由）。
d) 读回路径 `parseHumanActionRequiredArtifact`：字节预算先于 JSON 解析（防 unbounded copy）、plain-object 与原型检查、字段集**精确**（数量 + 存在性）、schema 匹配、reasonCode 二次 allowlist；说明"构造期已校验，读回为何还要再校验一次"的必要性（存储在外部可变）。
e) 存储与引用：`putHumanActionRequiredArtifact` 是否把 kind 钉在模块内（调用方无法改成别的 kind）；`readHumanActionRequiredArtifact` 是否**先用正则确认 ref 的 kind**再向 store 取字节；expectedDigest 是否由 store enforce。
f) 确定性：`serializeHumanActionRequiredArtifact` 是否固定键序、是否引入任何非确定性输入（时间/随机/遍历顺序）。
g) **kind 注册表的三处同步（重点）**：联合类型、KINDS 数组、REVISION_KINDS（含 `loop-artifact-revision.ts:65-67` 的编译期漂移检查）是否一致；本波因此改动了 **3 个既有测试的注册表规模断言**（`loop-artifact-revision.test.ts` 17→18、`loop-artifact-store.test.ts` 两处 17→18、`loop-governance-tail-result.test.ts` 17→18）——请逐处确认这是"新增 kind 的机械后果"而非"放宽断言"，并确认位置类断言（如 `LOOP_ARTIFACT_KINDS[10] === "governance_tail_result"`）未被削弱。
h) **语义裁决点**：`human_action_required` 被加入 `LOOP_ARTIFACT_REVISION_KINDS`，但它**不是节点产物**（`LOOP_ARTIFACT_NODE_PRODUCT_PROJECTION` 中没有对应项）。请判定：① 这是否会让它被误当作 revision kind 使用；② 正确的建模是否应是"引入非 revision kind 分类并调整穷尽性检查"；③ 若你判定本波做法不可接受，请指认合同依据。

二、与 W6a 冻结面的关系（重点）
a) W6a 的两个冻结用例 T2-A6/A7 使用 kind 为 `human_action` 的 ref 作为 `humanActionRef`（`tests/loop-w6a-process-evidence-recovery.test.ts:268,277`）。本波**未在事件层强制 ref 的 kind**（`humanActionRef` 仍按 W6a 冻结为不透明字符串），kind 强制只放在**读回路径**。请判定这个取舍是否正确，并说明：若改为在事件层强制，需要改动哪些 W6a 冻结面、是否构成"推翻已 PASS 波次"。
b) 确认本波**没有**修改 `core/loop-capability-execution.ts` 中 `humanActionRef` 的既有校验语义。

三、回归与反放水
- 生产 diff 应恰为：`core/loop-human-action-artifact.ts`（新增）、`core/loop-artifact-store.ts`（kind 两处）、`core/loop-artifact-revision.ts`（REVISION_KINDS）；其余为测试与文档。逐 hunk 确认无夹带、无无关重构、无注释伪装。
- W1～W6b1 冻结面零改动：Q1 绑定、gateway 开关、production 门、路径 A 冻结 B-7、W5 九类、W6a 十字段与五分类、W6b1 lease 窗口防火墙（含 B-8 装配锁定）。
- 8 个直接构造 `LoopCapabilityEntry` 的既有用例、`loop-w6a-*`、`loop-w6b1-*` 必须原样通过。
- real 休眠复核：无 `source=real` 通道、无真实 spawn、无新激活面。
- 全套件若出现文件级 FAILED，必须隔离单跑定性（进程级 sqlite runner 竞争 vs 断言级失败）。**特别注意**：本波在并行套件中曾出现 `loop-artifact-store` 与 `loop-governance-tail-result` 失败，隔离后为**稳定的注册表规模断言失败（3/3 复现）**，已通过同步断言修复；请勿将其归为偶发。
- 确认本波新增测试为真实路径（真 `LoopArtifactStore`、真 put/read、真 digest），不得用内联假对象制造假绿。

四、反向探针（必须亲自改代码制造红，再还原，记录首挂断言）
至少：P1 把 `SWITCH_AGENT_REQUIRED` 加入 `HUMAN_ACTION_REASON_CODES` → T1「exactly six legal human-action reason codes」与 T2 必红；P2 把 allowlist 比较改成大小写不敏感 → T3 必红；P3 去掉 parse 的字段数量精确检查 → T5「an extra field is rejected」必红；P4 去掉 `readHumanActionRequiredArtifact` 的 ref kind 正则前置检查 → T7 必红；P5 把 `putHumanActionRequiredArtifact` 的 kind 换成其它 kind → T1/T6/T7 必红；P6 在序列化里插入 `Date.now()` → T6 确定性断言必红；P7 从 `LOOP_ARTIFACT_REVISION_KINDS` 移除本 kind（保留联合类型）→ tsc 编译期漂移检查必失败（说明该检查真实承载）。探针后 `git status --porcelain` 必须为空（允许既有的 `?? .workbuddy/`）。

以下为有意为之或已知事实，不得作为缺陷上报：① 本波**没有接生产者**（real 休眠，见开篇取证）；② ref kind 强制只放在读回路径而非事件层（见二.a，按裁决项处理）；③ `capability`/`executionRole` 用 `string | null` 而非强类型枚举；④ `human_action_required` 进入 REVISION_KINDS 但非节点产物（见一.h）；⑤ 3 个既有测试的注册表规模断言 17→18 是新增 kind 的机械后果；⑥ `Results: 1767 passed` 是最后一个测试文件的内部计数，不是全套件断言总数；⑦ 并行 runner 竞争偶发（隔离即绿）为既有环境项；⑧ W6b3（E4-T5 attempt workspace 三态与 wip digest 越界检测）、E5 真实 canary、路径 A 物理删除、真实 Agent/Git/发布副作用、C-T1/C-T2 收口与 Exchange/PKB publication 均**不在本轮范围**。不要把合同外的泛化加固建议升格为阻塞；若认为必须纳入，先指明是哪条合同要求使其成为范围内问题。

证据基线（实现方口径，须独立复跑不轻信）：`npx tsc --noEmit` 干净；`scripts/validate-skill-contracts.rb`、`validate-capability-metadata-chain.rb` 均 exit=0；新增 `tests/loop-w6b2-human-action-artifact.test.ts` 82 断言全绿；全套件 145 文件 / `failed_file_count=0` / `exit=0`；自测探针 P1、P4 已实跑并还原。

输出要求：先给两份清单，再统一输出所有发现（同一根因的变体合并，W1～W6b1 已判定事项不得重复上报）；每个阻塞项给出可复现证据、影响路径、一次性修复边界与回归矩阵。最后明确分列：阻塞项 / 建议项 / 不属 W6b2 范围。若零阻塞，明确给出 **W6b2 PASS** 判定并声明可进入 W6b3（E4-T5）；同时说明 PASS 仅代表实现可进入下一步，不等于激活真实 Agent（仍需 E5 另行授权）。
