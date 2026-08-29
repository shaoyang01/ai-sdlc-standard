# C03-E W6b4 聚焦独立复审 Prompt（交付外部 Agent）

> 用途：把下方分隔线之间的**整段**复制给另一个独立 agent 做只读复审。实现方自审 / 子 agent / 对抗视角都不算数。
> 复审基线：产品库 `feature/c03-e1-e4-runtime-implementation`，**HEAD 须为 `1605a8471df2c8bea58f01cafb1ff59ac3f67b6b`**，增量范围 `05d12d2bd37e9957e9242946aff795a79d1e1862..1605a8471df2c8bea58f01cafb1ff59ac3f67b6b`，Node **v24.12.0**。
> 本轮**只审 W6b4 的门控改动及其回归影响**。W6b3 及之前的结论（含 B1 聚焦复审 CLOSED、F1/S2 处置、形态裁决）已 PASS，不在本轮重开；但允许全仓抽查，若发现**本轮新引入**的问题请照报。
> 复审结论回来后：零阻塞 → 出 W6b4 pass-state（CP）并进入 W7（C-T1 全量只读复审 → C-T2 Current User 收口）；有阻塞 → 按报告一次性修复后再复审。

## 复审结论（等待回收）

---

对 C03-E W6b4 做一次聚焦、只读、根因级独立复审。

**背景**：W6b3 = E4-T5（attempt workspace 三态 cleanup：promote / isolate / block）已经两轮复审判定 PASS，CP pass-state 已合并（PR #25，main `2d2ff53`）。W6b3 的越界检测需要「attempt 触碰过的全部路径」，由两路输入合成：已提交改动（`:540` 的 `git diff --name-only -z --no-renames <base>...HEAD`）与未提交/未跟踪（`git status --porcelain=v1 -z -uall`）。

**本轮要修的问题（实现方在 W6b3 PASS 之后自查发现，非复审方提出）**：
那一路 committed diff 是**无条件执行**的，但它的唯一消费点是 `classifyWorkspaceCleanup` 里的越界检查（`:300`），而该检查本身又被 `allowedPaths !== null` 门控。于是：

1. 未传 `allowedPaths` 的既有 30+ 调用方，每次 `cleanup()` **多跑一个 git 子进程，拿到一个完全没被读过的值**；
2. 更实质的是它**新增了一个失败面**：`_gitR(..., [0])`（`:626-641`）对 timeout / signal / stdout 截断 / 非零退出一律抛 `GIT_COMMAND_FAILED`。在 W6b3 之前，这条 cleanup 路径在那个位置不可能因为一次额外的 `git diff` 而失败；W6b3 之后可以。

这不是理论担忧——实现方本机全套件（146 文件 / 3539.2s，比复审方 278.8s 慢约 12.7 倍，fork 开销被 broker 放大）出现了一个文件级失败 `tests/loop-codex-implementation-adapter.test.ts`，该文件正是「导入 `LoopGitWorkspaceManager`、调用 `cleanup()` 时不传 `outcome`/`allowedPaths`」的既有调用方。该失败隔离单跑 `354/354 passed`、3 路并行 3/3 过、8 路并行 8/8 过，**未复现**，故未被当作归因证据；但它把上面第 2 点从"理论"变成了"需要收口的面"。

**本轮改动（须与你实测的 `git show 1605a84` 逐 hunk 一致）**：
- `core/loop-git-workspace.ts`：`:540` 的 committed diff 改为 `allowedPaths === null ? "" : (await this._gitR(...))`，并在 `:532-539` 补 8 行注释说明门控理由。**这是唯一的语义改动**。
- `tests/loop-w6b3-attempt-workspace-three-state.test.ts`：新增 T10a / T10b 两组（用 `Pick<LoopPosixProcessRunner,"run">` 的 spy 记录每个 git 调用的 args），文件头反向探针清单加一行。断言数 41 → 45。

验证环境必须 Node v24.12.0（`export PATH="$HOME/.nvm/versions/node/v24.12.0/bin:$PATH"`），所有测试/探针亲自实跑，不采信实现方口径。不改代码、不提交、不推送（探针后须还原，`git status --porcelain` 为空，允许既有的 `?? .workbuddy/`）。

一、门控的正确性（逐项 CLOSED / NOT_CLOSED + 行号）
a) **数据流核验**：指认 `changedPaths` 的全部消费点，确认它只进 `classifyWorkspaceCleanup`，而该函数里的越界分支要求 `input.allowedPaths !== null`（`:300`）。若你找到任何在 `allowedPaths === null` 时仍读取 `changedPaths` 的路径，那本门控就是错的——请给出行号。
b) **行为等价性**：对 `allowedPaths === null` 的调用方，门控前后 `cleanup()` 的返回值、抛出行为、副作用必须逐字段一致。请指认是否还存在任何可观测差异（不仅限于返回值——包括日志、时序、以及 `_gitR` 抛错时机）。
c) **`committed = ""` 的取值**：空串进 `committed.split("\0").filter(Boolean)` 得空数组，与"跳过"等价。请确认这与"压根不调用"在 `changedPaths` 上完全等价，不存在空串被当成一条路径的情况。
d) **是否过度收紧**：`allowedPaths` 传了但为空数组 `[]` 时，门控应仍然跑 diff（`[] !== null`），越界检查在 `:300` 还会再判 `changedPaths.length > 0`。实现方已实测对照（临时探针，跑完已还原，`git status --porcelain` 已核对为空）：门控前 `allowedPaths: []` → `code=CLEANUP_BLOCKED / namedDiffs=1`；门控后 → `code=CLEANUP_BLOCKED / namedDiffs=1`，**逐字一致**。请独立复算；若你认为实现方的对照口径有问题，请指认。
e) **`allowedPaths` 的校验顺序**：`allowedPaths` 在 `:459-463` 解析校验，门控在 `:540`。请确认不存在「解析失败应当早于门控生效」的语义依赖（例如 `allowedPaths` 非法时是否本应先 `fail("INVALID_INPUT")` 而不该因门控短路掉任何校验）。

二、回归矩阵（逐项实测并给出首挂断言名）
① **T10a（未传 allowedPaths 不跑 committed diff）**：spy 记录全部 git 调用 args，断言 `args[0]==="diff" && args.includes("--name-only")` 的调用数为 **0**。注意仓库里另有两处 `git diff --binary …`（`:1101`/`:1104`，source-wip digest），它们**不是**本轮对象，断言用 `--name-only` 区分。请确认这个区分是可靠的（不存在第三处带 `--name-only` 的 diff）。
② **T10b（传了 allowedPaths 仍恰好跑一次）**：同一 spy，断言该计数为 **1**。请确认"恰好一次"是稳定值而非偶然（例如 cleanup 内部是否可能在某些分支上跑两次）。
③ **T10a/T10b 的 cleanup 结果仍是 promote**：两条都断言 `decision === "promote"`，即门控没有改变任何判定结果。
④ **既有断言不变**：`tests/loop-git-workspace.test.ts` 必须 **110 断言**原样通过（实现方实测 110 passed；该文件 stderr 有一行 `fatal: ... is not a working tree`，是既有现象，非本轮引入）；`tests/loop-w6b3-*` 的 T1–T9c 结论不变（总数 45 = 41 + 新增 4）；`tests/loop-codex-implementation-adapter.test.ts` 必须 **354/354** 通过（该文件是本门控的主要受益方）。
⑤ **`tests/loop-w6b2-human-action-artifact.test.ts`** 必须 83 断言通过。

三、反向探针（必须亲自改代码制造红，再还原）
- **P6（本轮关键）**：把 `:540` 的门控去掉（还原成无条件 `await this._gitR(...)`）→ **T10a 必红**（实现方实测：`✗ T10a: no committed-path diff runs when allowedPaths is absent (saw 1)`，`44 passed, 1 FAILED`），且 **T10b 必须仍绿**。若 T10b 也红，说明新断言描述的是别的东西，请指认。
- **P7（可选但推荐）**：反向验证「过度收紧」——把门控条件改成 `allowedPaths === null || allowedPaths.length === 0` → T10b 应转红（请实测判定，并说明你的结论是否因此改变对一.d) 的判定）。
- **P8（可选）**：把断言里的 `--name-only` 区分条件去掉（改成只判 `args[0]==="diff"`）→ T10a/T10b 应因 source-wip 的两处 `git diff --binary` 而转红，证明该区分条件是承重而非装饰。
- 探针后 `git status --porcelain` 必须为空（允许既有的 `?? .workbuddy/`）。

四、生产 diff 与范围核验
- `git show 1605a84 --stat` 应恰为两个文件：`core/loop-git-workspace.ts`（+10/-1，其中 8 行是注释）与 `tests/loop-w6b3-attempt-workspace-three-state.test.ts`（+56）。逐 hunk 确认无夹带、无无关重构、无注释伪装成代码、无顺手加固。
- W1～W6b3 冻结面零改动：Q1 绑定、gateway 开关、production 门、路径 A 冻结 B-7、W5 九类、W6a 十字段与五分类、W6b1 lease 窗口防火墙（含 B-8 装配锁定）、W6b2 六合法码与三处注册表、W6b3 三态契约与 `--no-renames`。
- real 休眠复核：无 `source=real` 通道、无真实 spawn、无新激活面；`promote` 不得出现 merge/push/写 base branch 的代码路径。
- `npx tsc --noEmit` 干净；`ruby scripts/validate-skill-contracts.rb`、`validate-capability-metadata-chain.rb`、`validate-compact-prompt-contracts.rb` 三个 exit=0。

五、已知事实与范围外（不得作为缺陷上报，除非你能指认合同依据使其变为范围内）
a) **既有环境能力缺口**：`tests/loop-artifact-store.test.ts` 与 `tests/loop-delivery-checkpoint-store.test.ts` 在**实现方本机**确定性失败，全部集中在**跨进程并发**段落。根因已取证并跨环境对证：本机 `link`(2) 目标已存在时返回合成错误 `CODEBUDDY_BROKER_DENY` 而非 `EEXIST`，导致 `loop-artifact-store.ts:359-363` 并发 put 的落败者被兜底为 `ARTIFACT_IO_FAILURE`。`99c9df3` 基线 worktree 对照失败集合逐字一致；复审方环境隔离单跑全绿（266 / 268）。**先于 W6b3 存在的环境能力缺口，不是回归**。请如实记录你的环境结果。
b) **实现方本机第三个文件级失败（观察项，非归因）**：`tests/loop-codex-implementation-adapter.test.ts` 在实现方全套件中失败过一次（146 文件 / `1767 passed, 0 failed` 断言级 / `failed_file_count=3`），隔离单跑 354/354、3 路并行 3/3、8 路并行 8/8 均**未复现**。它是本门控的动机之一，但**未被当作归因证据**——请你判断：① 门控是否确实消掉了该场景下一个真实存在的失败面；② 在你自己的环境里全套件是否复现该失败。无论能否复现，都请给出判定。
c) **B1 的已知边界（上轮划为范围外，本轮不重开）**：attempt 自己创建越界文件于一个提交、再于后续提交 mv/删除它，`<base>...HEAD` 的最终 diff 不含该路径。需逐提交 diff-tree 遍历的新机制，属**建议项 / 新波次**。
d) 其余已知事实：① `cleanup()` 仍无生产调用方（已裁决为合同内正确形态）；② `promote` 不做 merge/推送（E5 未授权）；③ 未提供 `allowedPaths` 时不启用越界检测、沿用既有 `WORKSPACE_DIRTY`；④ `block` 以异常呈现、`result.decision === "block"` 在 cleanup 返回里不可达；⑤ `Results: N passed` 是单个测试文件的内部计数，不是全套件断言总数；⑥ E5 真实 canary/prepare/real dispatch、路径 A 物理删除、真实 Agent/Git/发布副作用、C-T1/C-T2 收口与 Exchange/PKB publication 均**不在本轮范围**。
e) 本轮**未**采纳任何新的泛化加固建议。若你提出合同外建议，请单独列为「建议项」而非阻塞。

六、输出要求
1. 逐项给出 CLOSED / NOT_CLOSED / PARTIAL 并附行号与实测命令输出。
2. 明确给出本轮结论：**CLOSED（可出 W6b4 pass-state 并进 W7）** 或 **NOT_CLOSED（列出阻塞项，每项给根因 + 可判定的修复边界）**。
3. 若给出 NOT_CLOSED，修复边界必须是「单处改动 + 可命名的新断言」，不得是开放性加固清单。
4. 报告你本机（复审方环境）的全套件结果与已知失败文件的实测结果，与实现方口径逐条对照。
5. 结束时把仓库留在 detached `1605a84`、工作树干净。

---

实现方自留证据（供对照，不要求采信）：
- 提交 `1605a84`，父提交 `7cd403e`（docs）→ 代码父 `05d12d2`（W6b3 B1 修复）。
- 聚焦实测：`tests/loop-w6b3-attempt-workspace-three-state.test.ts` **45 passed**；`tests/loop-git-workspace.test.ts` **110 passed**；`tests/loop-codex-implementation-adapter.test.ts` **354/354**；`npx tsc --noEmit` 干净。
- 反向探针 P6 实测：去掉门控 → T10a 转红（`saw 1`，`44 passed, 1 FAILED`），T10b 仍绿；还原后 45 passed。
- `allowedPaths: []` 对照实测（临时探针，已还原）：门控前 `CLEANUP_BLOCKED / namedDiffs=1`；门控后 `CLEANUP_BLOCKED / namedDiffs=1`。
- 全套件（实现方，`1605a84`）：**实跑中，结果待回填**。上一轮 `e92eea3` 的结果为 146 文件 / `1767 passed, 0 failed`（断言级）/ `failed_file_count=3` / 3539.2s。本轮**请以你的实测为准**。
