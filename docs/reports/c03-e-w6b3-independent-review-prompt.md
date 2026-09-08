# C03-E W6b3 独立复审 Prompt（交付外部 Agent）

> 用途：把下方分隔线之间的**整段**复制给另一个独立 agent 做只读复审。实现方自审 / 子 agent / 对抗视角都不算数。
> 复审基线：产品库 `feature/c03-e1-e4-runtime-implementation`，范围 **`99c9df3..02b642a90c076d2ccb14a18702ce0b88384b6fe4`**，Node **v24.12.0**。
> 复审结论回来后：零阻塞 → 出 W6b3 pass-state（CP）并进入 W7（C-T1 全量只读复审 → C-T2 Current User 收口）；有阻塞 → 按报告一次性修复后复审。

---

对 C03-E W6b3（E4-T5 attempt workspace 三态清理/保留与 wip digest 越界检测）做一次全量、只读、根因合并式独立复审。主审范围为 `99c9df3..02b642a90c076d2ccb14a18702ce0b88384b6fe4`（HEAD 实测须为 `02b642a90c076d2ccb14a18702ce0b88384b6fe4`，工作树干净、与 `origin/feature/c03-e1-e4-runtime-implementation` 同步）；允许对全仓抽查。验证环境必须 Node v24.12.0（`export PATH="$HOME/.nvm/versions/node/v24.12.0/bin:$PATH"`），所有测试/探针亲自实跑，不采信实现方口径。以 C03-E 已冻结授权合同为边界——规划 `docs/LOOP-CORE-C03-E-PLAN.md` §6 E4 候选目标面（`:452-469`）与 `:443-444`（implementation 固化：workspace diff 只含任务允许路径）、Decision-071（real 休眠）/072/073、W1～W6b2 已 PASS 冻结面、台账 `docs/reports/c03-e-e1e4-task-set-and-gate-audit.md` E4 段——逐项完成，不改代码、不提交、不推送、不使用 DocFlow。

**本波的形态**：E4-T5 落点是 `core/loop-git-workspace.ts` 的 cleanup options `:88`／result `:93`／manager `:224`。取证事实：`LoopGitWorkspaceManager.cleanup()` 在本波之前**没有任何生产调用方**（全仓仅测试调用，见 `tests/loop-git-workspace.test.ts` 与 `tests/loop-codex-implementation-adapter.test.ts`）；它只有二值语义——要么回收 worktree，要么抛错。本波把它变成**三态决策**并让决策随结果返回。请判定：① 在零生产调用方的前提下交付三态契约，是否属于合同内正确形态（可类比 W6b2 的"先立契约"，但注意本波台账明确要求改 options/result/manager 三处落点）；② 是否存在必须本波就接上调用方的合同依据。

〇、先建立两份清单（前置产物，后续判定都挂到清单上）
1) 行为不变量清单，至少覆盖——I1 三态互斥且穷尽：任意输入必落到 `promote` / `isolate` / `block` 之一；I2 `promote` 只在改动全部落在任务允许路径内、且工作区无未提交变更时发生；I3 `isolate` 保留 worktree 与 task branch 作为证据，且**不抛异常**（以结果返回）；I4 `block` 保留证据且**不清理、不提升**，以 `CLEANUP_BLOCKED` 呈现；I5 **越界路径压过调用方声明的 outcome**——声称 `succeeded` 但有越界路径时仍为 `block`；I6 越界判定按**路径分量边界**（`src` 不匹配 `srcfoo/a.ts`）；I7 越界输入覆盖**已提交**改动（`diff --name-only -z <base>...HEAD`）与**未提交/未跟踪**改动（`status --porcelain=v1 -z -uall`）两部分，二者缺一即漏判；I8 `allowedPaths` 与 `outcome` 的输入校验 fail-closed（绝对路径 / `..` / 空串 / 控制字符 / 非字符串 / 非数组 / 非枚举值 全部 `INVALID_INPUT`）；I9 未提供 `allowedPaths` 时沿用既有 `WORKSPACE_DIRTY` 语义，不引入新的拒绝理由、不改变任何既有 cleanup 调用的结果；I10 real 休眠不变，本波未成为激活通道，`promote` 不触碰 base branch（无 merge、无 push）。
2) 失效模式 → 可判定原因清单：声明成功但越界 / 失败且脏 / 未知副作用 / allowlist 非法 / outcome 非法 / head 不匹配 / base 非祖先 / 分支被占用 / remove 后残留 / 越界且失败，各自落到 `CLEANUP_BLOCKED` / `INVALID_INPUT` / 既有 `WORKSPACE_DIRTY` 或三态之一；不得出现不可判定、静默吞错、或既清理又报告保留证据的自相矛盾结果。

一、契约与实现逐项深审（逐项 CLOSED / NOT_CLOSED / PARTIAL + 行号）
a) 三态类型 `LoopGitWorkspaceAttemptOutcome` / `LoopGitWorkspaceCleanupDecision` 的取值集合，是否与台账 E4-T5 行（promote＝成功提升／isolate＝失败保留证据／block＝未知副作用保留证据并阻塞，不清理不提升）逐字对应。
b) 纯函数 `classifyWorkspaceCleanup` 的判定顺序：**越界 → unknown → failed → succeeded**。请验证该顺序是否使「越界压过声称成功」成立，并说明若把 outcome 判定放到越界之前会打开什么缺口。
c) **语义裁决点（重点）**：`promote` 在本波的实际行为是「回收 worktree + 按 `deleteTaskBranch` 处理分支」，**不把 task branch 合并进 base branch**。请判定：① 在 E5 未授权、不得对真实仓库做 promotion 的约束下，这是否是「成功提升」的合同内最小形态；② 若你认为 `promote` 必须包含 merge/推送语义，请指认合同依据，并说明这与「E5 未授权前不得对真实仓库做 promotion」如何调和。
d) 越界检测的数据来源：`statusPaths()` 对 `status --porcelain=v1 -z` 的解析是否正确处理重命名/复制的第二条记录（原路径也应计入改动）；已提交部分用 `diff --name-only -z <base>...HEAD` 是否存在漏判场景（重命名、子模块、模式变更、二进制）。
e) `isWithinAllowed` 的前缀匹配是否按分量边界；`vRelPath` 对 allowlist 条目的校验是否覆盖所有逃逸形状（绝对、`..`、`.`、空、控制字符、反斜杠分隔）。
f) `block` 的表达方式：以抛出 `CLEANUP_BLOCKED` 呈现，因此 `CleanupResult.decision === "block"` 在 cleanup 的返回里**不可达**（只能从纯函数读到）。请判定「保留证据并阻塞」用异常表达是否可接受；若应改为返回结果，请说明 fresh operator 从哪条路径读到它。
g) `isolate` 是否绕过了 `WORKSPACE_DIRTY` 检查（失败时工作区本就脏，因此必须绕过），并确认它**没有**绕过结构校验、head 校验、base 祖先校验与 source drift 校验。
h) `CleanupResult` 新增三字段（`decision` / `outOfBoundsPaths` / `evidenceRetained`）后，既有 30+ 处 cleanup 调用（含 `tests/loop-git-workspace.test.ts:687-1243`、`tests/loop-codex-implementation-adapter.test.ts` 十余处）是否全部原样通过；既有断言是字段级而非整对象比较，请确认没有断言因此被静默放宽。

二、与 W6b2 复审建议项的关系（本波顺手带上，合同外）
a) **F1**：`tests/loop-w6b2-human-action-artifact.test.ts` 的 T7 异 kind fixture 原本存入非 JSON 字符串，导致读回时被 parse 层先拒、ref kind 前置正则从未成为拒因（复审探针 P4 无法转红）。本波改为存入**合法 human-action 内容**。请实跑验证：删掉 `readHumanActionRequiredArtifact` 的 ref kind 前置检查后，T7 是否**转红**（修复前不转红）。
b) **S2**：`LOOP_ARTIFACT_REVISION_KINDS` 名实分离——本波未复制第二份数组（复制即漂移），而是导出同一对象的具名别名 `LOOP_ARTIFACT_CANONICAL_KINDS` 供"是否为 canonical kind"的消费点使用（`loop-finding-lifecycle.ts:346`），revision 白名单仍用原名，编译期漂移哨兵**保留未削弱**。请判定：① 别名方案是否真正解决名实分离；② 是否因 `loop-finding-lifecycle.ts` 的 import-pure 约束而不能改指 `LOOP_ARTIFACT_KINDS`；③ 漂移哨兵是否仍真实承载（可把某 kind 从数组移除，tsc 应失败）。
c) 两者均为合同外建议项，若你认为引入了回归，请指认具体断言。

三、回归与反放水
- 生产 diff 应恰为：`core/loop-git-workspace.ts`（三态类型、纯函数、cleanup 接线、三个 helper）、`core/loop-artifact-revision.ts`（S2 注释与别名）、`core/loop-finding-lifecycle.ts`（S2 消费点改名）；测试侧为 `tests/loop-w6b3-attempt-workspace-three-state.test.ts`（新增）、`tests/loop-w6b2-human-action-artifact.test.ts`（F1，82→83 断言）、`tests/loop-single-rail-contract.test.ts`（S2 改名）；其余为文档。逐 hunk 确认无夹带、无无关重构、无注释伪装。
- W1～W6b2 冻结面零改动：Q1 绑定、gateway 开关、production 门、路径 A 冻结 B-7、W5 九类、W6a 十字段与五分类、W6b1 lease 窗口防火墙（含 B-8 装配锁定）、W6b2 六合法码与三处注册表。
- `tests/loop-git-workspace.test.ts` 必须 110 断言原样通过（本波之前实测值）；`tests/loop-w6b2-human-action-artifact.test.ts` 必须 83 断言通过。
- real 休眠复核：无 `source=real` 通道、无真实 spawn、无新激活面；`promote` 不得出现 merge/push/写 base branch 的代码路径。
- 全套件若出现文件级 FAILED，必须隔离单跑定性（进程级环境能力缺口 / 并行竞争 vs 断言级失败）。`loop-codex-implementation-adapter.test.ts` 在并行套件中存在既有偶发（隔离即绿），请勿把**新的**断言级失败归为偶发。
- **已定性的既有环境能力缺口（不得作为本波缺陷上报，也不得据此判 PASS/FAIL）**：`tests/loop-artifact-store.test.ts` 与 `tests/loop-delivery-checkpoint-store.test.ts` 在**本机**各有一组确定性失败，全部集中在**跨进程并发**段落。根因已取证：本机对 `link`(2) 硬链接系统调用存在 broker 拦截——当 link 目标**已存在**时，内核本应返回 `EEXIST`，本机返回合成错误 `CODEBUDDY_BROKER_DENY`（errno.code 为该字符串）。因此 `loop-artifact-store.ts` 并发 put 的**落败者**在 hard-link 段（`:359-363`）拿到的既不是 `EEXIST` 也不是已封装错误，被兜底为 `ARTIFACT_IO_FAILURE`，EEXIST 赢家赛落败分支（`:361`）永远进不去。取证方式：三进程同路径 `mkdir` → `open wx+` → `write` → `close` → `link(final)`，稳定 1 成功 / 2 失败，失败码恒为 `CODEBUDDY_BROKER_DENY` 且 `finalExists=true`（3/3 复现；沙箱模式与非沙箱模式一致，排除沙箱因素）。**基线对照**：在 `99c9df3`（不含本波任何改动）以独立 worktree 实跑，两个文件的失败集合与本机分支**逐字一致**（artifact-store 6 条：三处 `runConcurrentPuts` 各 2 条；delivery-checkpoint 3 条：`D10_A_CHECKPOINT_STORE_SUMMARY passed=265 failed=3`）。**判定口径**：这两组失败是**先于本波存在**的环境能力缺口，不是 W6b3/F1/S2 引入的回归；本波未改动 `core/loop-artifact-store.ts` 与 checkpoint store 生产代码。若你的验证环境没有该 broker 拦截，这两个文件应全绿——请如实记录你的环境结果，不要反过来据本机结果判定本波。
- 确认本波新增测试为真实路径（真 `LoopPosixProcessRunner` + 真 git + 真 worktree），不得用内联假对象制造假绿；`tests/loop-w6b3-*` 的 T5 组是纯函数单测（无 git），这是有意的。

四、反向探针（必须亲自改代码制造红，再还原，记录首挂断言）
至少：P1 去掉 `classifyWorkspaceCleanup` 的越界分支（`if (outOfBounds.length > 0)` → `if (false)`）→ T4 必红（实现方实测：T4「a committed out-of-bounds path blocks a claimed success (no throw)」）；P2 把 `isWithinAllowed` 放宽为裸 `startsWith` → T5「a sibling directory sharing the prefix is out of bounds」必红；P3 把 `failed` 分支改走 promote → T2「isolate reports instead of throwing」必红（实现方实测捕获到 `WORKSPACE_DIRTY`）；P4 把 cleanup 的 `changedPaths` 换回 `statusPaths(status)`（丢掉已提交 diff）→ T4 必红（证明「已提交改动也参与越界判定」真实承载）；P5 从 `LOOP_ARTIFACT_REVISION_KINDS` 移除任一项但保留联合类型 → tsc 编译期漂移检查必失败。探针后 `git status --porcelain` 必须为空（允许既有的 `?? .workbuddy/`）。

以下为有意为之或已知事实，不得作为缺陷上报：① `cleanup()` 仍无生产调用方（见开篇取证，按裁决项处理）；② `promote` 不做 merge/推送（E5 未授权，见一.c）；③ 未提供 `allowedPaths` 时不启用越界检测、沿用既有 `WORKSPACE_DIRTY`（避免推翻既有 30+ 处调用语义，见一.i/I9）；④ `block` 以异常呈现、`result.decision === "block"` 不可达（见一.f）；⑤ 重命名的原路径计入改动集合（保守方向）；⑥ 本波顺带带上 W6b2 的 F1/S2 两个合同外建议项（见二）；⑦ `Results: N passed` 是单个测试文件的内部计数，不是全套件断言总数；⑧ 并行 runner 竞争偶发（隔离即绿）为既有环境项；⑨ E5 真实 canary/prepare/real dispatch、路径 A 物理删除、真实 Agent/Git/发布副作用、C-T1/C-T2 收口与 Exchange/PKB publication 均**不在本轮范围**。⑩ `loop-artifact-store` / `loop-delivery-checkpoint-store` 的跨进程并发失败（root cause：本机 `link` 目标已存在时返回 `CODEBUDDY_BROKER_DENY` 而非 `EEXIST`，见三节末段的完整取证与基线对照）——**先于本波存在**，不得计入本波。不要把合同外的泛化加固建议升格为阻塞；若认为必须纳入，先指明是哪条合同要求使其成为范围内问题。

证据基线（实现方口径，须独立复跑不轻信）：HEAD `02b642a90c076d2ccb14a18702ce0b88384b6fe4`，范围 `99c9df3..02b642a90c076d2ccb14a18702ce0b88384b6fe4`；`npx tsc --noEmit` 干净；`scripts/validate-skill-contracts.rb`、`validate-capability-metadata-chain.rb`、`validate-compact-prompt-contracts.rb` 均 exit=0；新增 `tests/loop-w6b3-attempt-workspace-three-state.test.ts` **35 断言**全绿；`tests/loop-git-workspace.test.ts` 110 断言；`tests/loop-w6b2-human-action-artifact.test.ts` 83 断言；自测探针 P1–P4 已实跑并还原。

输出要求：先给两份清单，再统一输出所有发现（同一根因的变体合并，W1～W6b2 已判定事项不得重复上报）；每个阻塞项给出可复现证据、影响路径、一次性修复边界与回归矩阵。最后明确分列：阻塞项 / 建议项 / 不属 W6b3 范围。若零阻塞，明确给出 **W6b3 PASS** 判定并声明可进入 W7（C-T1 → C-T2）；同时说明 PASS 仅代表实现可进入下一步，不等于激活真实 Agent（仍需 E5 另行授权）。
