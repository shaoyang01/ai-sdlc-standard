# C03-E W6b5 聚焦独立复审 Prompt（交付外部 Agent）

> 用途：把下方分隔线之间的**整段**复制给另一个独立 agent 做只读复审。实现方自审 / 子 agent / 对抗视角都不算数。
> 复审基线：产品库 `feature/c03-e1-e4-runtime-implementation`，**HEAD 须为 `4b8ccb0fe139079d9eb689f0abb56c2a7c91dda2`**，增量范围 `c47d031..4b8ccb0`（恰一个提交），验证环境 Node **v24.12.0**（`export PATH="$HOME/.nvm/versions/node/v24.12.0/bin:$PATH"`）。
> 本轮**只审 W6b5 的新增测试 T10c 及其对既有网的影响**。W6b4 及之前的结论（含 W6b4 聚焦复审 CLOSED 零阻塞、CP PR #26 已合并）已 PASS，不在本轮重开；但允许全仓抽查，若发现**本轮新引入**的问题请照报。
> 复审结论回来后：零阻塞 → 出 W6b5 pass-state（CP）；有阻塞 → 按报告一次性修复后再复审。W7（C-T1）已由 Current User 裁决**先不开**，不在本轮后续。

## 复审结论（等待回收）

---

对 C03-E W6b5 做一次聚焦、只读、根因级独立复审。

**背景**：W6b4（E4-T5 收口）把 committed diff 门控在 `allowedPaths !== null` 上（`core/loop-git-workspace.ts:540`），聚焦复审判定 CLOSED 零阻塞，但留下**非阻塞建议项 P7**：现有测试网抓不住「门控被误写成 `allowedPaths !== null && allowedPaths.length > 0`（非空才跑 diff）」这种**过度收紧**。该误写的后果是真实事故方向的：`allowedPaths: []` 是显式的空权限集，若门控把它当 `null` 对待，committed diff 不跑、`changedPaths` 缺失已提交路径，**已提交的越界改动会被静默 promote**。当前 `[]` 场景靠 adapter 层（`tests/loop-codex-implementation-adapter.test.ts:953`）拒为 `INVALID_INPUT` 兜底，但那层在 manager 之前，`LoopGitWorkspaceManager.cleanup` 自身对 `[]` 无防御性测试。Current User 已裁决 P7 **单开微波**（W6b5），不夹带。

**本轮改动（须与你实测的 `git show 4b8ccb0` 逐 hunk 一致）**：
- `tests/loop-w6b3-attempt-workspace-three-state.test.ts`：新增 **T10c** 一组（同 T10a/T10b 的 spy 模式：`Pick<LoopPosixProcessRunner,"run">` 记录全部 git 调用 args）：
  1. `commitIn(ws, "secret/c.ts", ...)` 造一个**已提交**的越界文件；
  2. `cleanup(id, { outcome: "succeeded", allowedPaths: [] })` 必须 `LoopGitWorkspaceError / CLEANUP_BLOCKED`；
  3. `args[0]==="diff" && args.includes("--name-only")` 的调用数必须**恰为 1**（同 T10a/T10b 的区分口径：排除 `:1101`/`:1104` 两处 source-wip 的 `git diff --binary`）。
  - 文件头反向探针清单加一行（过度收紧变异 → T10c 红）。断言数 45 → 47。**生产代码零改动**——这是纯测试微波。

所有测试/探针亲自实跑，不采信实现方口径。不改代码、不提交、不推送（探针后须还原，`git status --porcelain` 为空，允许既有的 `?? .workbuddy/`）。

一、T10c 的正确性（逐项 CLOSED / NOT_CLOSED + 行号）
a) **语义核验**：确认 `:540` 门控条件是 `allowedPaths === null`（引用 W6b4 已合并形态），即 `[]` 会走 diff；确认 `:300` 越界检查在 `allowedPaths=[]` 时对**任何已提交路径**都判越界（空权限集下不存在界内路径）。
b) **断言强度**：确认 T10c 的两条断言**同时**承重——只留「CLEANUP_BLOCKED」或只留「恰跑一次 diff」任一，另一个误写方向就能漏网。请给出你的判断。
c) **spy 区分可靠性**：确认 `--name-only` 区分条件在本文件内仍然可靠（不存在第三处带 `--name-only` 的 diff 使计数失真）。
d) **无夹带**：`git show 4b8ccb0 --stat` 必须恰为一个文件（该测试文件）。确认无生产代码改动、无无关重构、无把 T10a/T10b 既有断言顺手改写。

二、回归矩阵（逐项实测并给出首挂断言名）
① `tests/loop-w6b3-attempt-workspace-three-state.test.ts`：**47 passed**（45 + 新增 2），T1–T10b 结论不变。
② `tests/loop-git-workspace.test.ts`：**110 passed**（stderr 有一行 `fatal: ... is not a working tree`，是既有现象）。
③ `tests/loop-codex-implementation-adapter.test.ts`：**354/354**。
④ `tests/loop-w6b2-human-action-artifact.test.ts`：**83 passed**。
⑤ `npx tsc --noEmit` 干净。

三、反向探针（必须亲自改代码制造红，再还原）
- **P9（本轮关键）**：把 `:540` 的门控条件改成 `(allowedPaths === null || allowedPaths.length === 0)`（模拟过度收紧误写）→ **T10c 必须恰 2 红**（实现方实测：`✗ T10c: an empty allowedPaths still blocks... (no throw)`（即静默 promote）、`✗ ...namedDiffs=0`，`45 passed, 2 FAILED`），且 **T10a/T10b 必须仍绿**。若 T10a/T10b 也红，说明断言写的是别的东西，请指认。
- **P10（可选）**：只删 T10c 的「恰跑一次 diff」断言、保留 block 断言，再跑 P9 变异 → block 断言是否仍红？若红，说明「恰一次」断言在该方向上是否冗余，请给出你对一.b) 的最终判定。
- 探针后 `git status --porcelain` 必须为空（允许既有的 `?? .workbuddy/`）。

四、范围与冻结面
- W6b4 的生产改动（`core/loop-git-workspace.ts:540` 门控 + 注释）在 `4b8ccb0` 中**必须零触碰**——本轮没有生产 diff。
- W1～W6b4 全部冻结面不变（Q1 绑定、gateway 开关、production 门、路径 A 冻结 B-7、W5 九类、W6a 十字段与五分类、W6b1 lease 窗口防火墙、W6b2 六合法码、W6b3 三态契约与 `--no-renames`、W6b4 门控）。
- real 休眠复核：无 `source=real` 通道、无真实 spawn、无新激活面。

五、已知事实与范围外（不得作为缺陷上报，除非你能指认合同依据使其变为范围内）
a) W6b4 复审报告 §五的全部已知事实继续有效：本机 `link`(2) broker 缺口两个文件（`loop-artifact-store` / `loop-delivery-checkpoint-store`）在实现方本机确定性失败，先于 W6b3 存在，非回归；`cleanup()` 无生产调用方（合同内正确形态）；`promote` 不做 merge/push（E5 未授权）；未提供 `allowedPaths` 时不启用越界检测。
b) adapter 层对 `allowedPaths: []` 拒为 `INVALID_INPUT`（`:953`）是**既有兜底**，本轮不动它；T10c 刻意绕过 adapter 直测 manager 层，两层各有其职，不构成重复防御缺陷。
c) B1 已知边界（逐提交 diff-tree 遍历）仍是建议项 / 独立波次，不在本轮。
d) E5 真实激活、W7/C-T1、C-T2、Exchange/PKB publication 均不在本轮范围。
e) 本轮**未**采纳任何新的泛化加固建议。若你提出合同外建议，请单独列为「建议项」而非阻塞。

六、输出要求
1. 逐项给出 CLOSED / NOT_CLOSED / PARTIAL 并附行号与实测命令输出。
2. 明确给出本轮结论：**CLOSED（可出 W6b5 pass-state）** 或 **NOT_CLOSED（列出阻塞项，每项给根因 + 可判定的修复边界）**。
3. 若给出 NOT_CLOSED，修复边界必须是「单处改动 + 可命名的新断言」，不得是开放性加固清单。
4. 结束时把仓库留在 detached `4b8ccb0`、工作树干净。

---

实现方自留证据（供对照，不要求采信）：
- 提交 `4b8ccb0`，父提交 `c47d031`（docs：裁决回填 / G4 撤回 / 单链规则）。恰一文件：`tests/loop-w6b3-attempt-workspace-three-state.test.ts`（+29）。
- 实测（Node v22.22.2，实现方本机）：`loop-w6b3` **47 passed**；`loop-git-workspace` **110 passed**；`loop-w6b2` **83 passed**；`codex-adapter` **354/354**；`tsc --noEmit` 干净。
- 反向探针 P9 实测（**临时 worktree `/tmp/w6b5-probe`，跑完已 remove --force，主树干净**）：过度收紧变异 → T10c 恰 2 红（`(no throw)` + `namedDiffs=0`），T10a/T10b 仍绿，`45 passed, 2 FAILED`。
- 首次探针跑法有误（worktree 停在 `c47d031`，不含未提交的 T10c，得 45 passed 全绿），已纠正为「变异后的生产码 + 复制未提交测试文件进 worktree」后重跑，上述为纠正后的结果。
