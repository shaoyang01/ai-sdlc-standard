# C03-E W6b3-B1 聚焦独立复审 Prompt（交付外部 Agent）

> 用途：把下方分隔线之间的**整段**复制给另一个独立 agent 做只读复审。实现方自审 / 子 agent / 对抗视角都不算数。
> 复审基线：产品库 `feature/c03-e1-e4-runtime-implementation`，**HEAD 须为 `05d12d2bd37e9957e9242946aff795a79d1e1862`**，增量范围 `02b642a90c076d2ccb14a18702ce0b88384b6fe4..05d12d2bd37e9957e9242946aff795a79d1e1862`，Node **v24.12.0**。
> 本轮**只审 B1 修复及其回归影响**。上一轮 W6b3 复审的其余结论（契约 a)–h) 除 B1 外全部 CLOSED、F1/S2 处置正确、两项形态裁决）已PASS，不在本轮重开；但允许全仓抽查，若发现**本轮新引入**的问题请照报。
> 复审结论回来后：零阻塞 → 出 W6b3 pass-state（CP）并进入 W7（C-T1 全量只读复审 → C-T2 Current User 收口）；有阻塞 → 按报告一次性修复后再复审。

## 复审结论（已回收）：**CLOSED（零阻塞）**，可出 W6b3 pass-state 并进入 W7

复审方环境与本机独立复算，逐条与实现方口径吻合：

- **B1 复现对照**：同一探针（真 `LoopGitWorkspaceManager` + 真 git）在 `02b642a`（修复前）实测 `decision=promote / worktreeRemoved=true / 证据销毁`；在 `05d12d2`（修复后）抛 `CLEANUP_BLOCKED`，worktree 与 `src/b.ts` 证据保留。与 B1 报告逐字吻合。
- **修复形态**：`core/loop-git-workspace.ts:533` 加 `--no-renames` 单 flag + 7 行注释，`git show 05d12d2` 恰为两个文件，无夹带、无顺手加固。复审方核验了备选写法（`-M0` / `--diff-filter` / `diff-tree -r`），确认单 flag 是**最小且正确**手段；并逐条排除新漏判（chmod / 二进制 / 子模块 / copy / 空目录），`--no-renames` 严格扩大报告集合。
- **回归矩阵**：T9a（越界 rename → block，3 断言）、T9b（允许集合内 rename 仍 promote，未过度收紧）、T9c（越界纯删除 block）**全部真实承载**。`loop-w6b3` 41 / `loop-git-workspace` 110 / `loop-w6b2` 83 全绿。
- **探针**：P1 去掉 flag → 恰 `39 passed, 2 FAILED`（T9a 两条红、T9b/T9c 绿），与实现方口径逐字一致；P2 复现已知边界（attempt 自建再 mv 走仍 promote）并判定**划为范围外成立**——那是「中间提交痕迹不出现在最终 diff」的更宽问题，需逐提交遍历的新机制，不属 B1；P3 证明 `pre` 参数真实承载。
- **全套件（复审方环境）**：`npm test` **146 文件 / failed=0 / exit=0 / 278.8s**；两个已知环境缺口文件在复审方环境**隔离单跑全绿**（266 / 268），证实实现方本机失败确为 broker 拦截 `link`(2) 的环境能力缺口，**非本波回归**。
- `tsc --noEmit` 干净，三个 ruby validator exit=0。

**建议项（1 条，非阻塞）**：若未来合同要求「中间提交的越界痕迹」也可判定，需**逐提交 diff-tree 遍历**的新机制，应按**新波次**立项（不属 B1，不属本波）。

**范围外维持上轮裁决**：cleanup 零生产调用方、`promote` 无 merge/push。

**PASS ≠ 激活真实 Agent**：E5 真实 canary / 真 spawn 仍需另行授权。

---

对 C03-E W6b3 的唯一阻塞项 B1 做一次聚焦、只读、根因级独立复审。

**背景（上一轮复审结论摘要，非本轮待判项）**：W6b3 复审判定 NOT_CLOSED，阻塞项 B1 为「已提交 rename 逃逸越界检测（I7 破窗，且销毁证据）」——`core/loop-git-workspace.ts:525-526` 的 `git diff --name-only -z <base>...HEAD` 走 git 默认 rename 检测，rename 只输出目的路径；attempt 执行 `git mv secret/b.ts src/b.ts` 并提交后，越界源路径不进 `changedPaths`，于是工作区干净 + 声称 `succeeded` + `allowedPaths:["src"]` → 判定 `promote`，worktree 被回收、证据销毁。合同依据为规划 `docs/LOOP-CORE-C03-E-PLAN.md:443-444`「workspace diff 只含任务允许路径」＋台账 E4-T5 越界→`block` 语义。另有两项形态裁决（非阻塞）：① cleanup 零生产调用方下交付三态契约属合同内正确形态，无必须本波接调用方的合同依据；② `promote` 不 merge/push 属合同内最小形态（D-071 + E5 未授权禁止触碰 base branch）。

**本轮改动（须与你实测的 `git show 05d12d2` 逐 hunk 一致）**：
- `core/loop-git-workspace.ts`：`:525-533` 的 committed diff 加 `--no-renames` 单 flag，并在 `:525-532` 补注释说明为什么。**这是唯一的语义改动**，无其他生产代码改动。
- `tests/loop-w6b3-attempt-workspace-three-state.test.ts`：新增 T9a/T9b/T9c 三组（回归矩阵），`setupRepo()` 增加可选 `pre` 参数用于在 base commit 预置文件（改动：`writeFileSync(f.txt)` 后写入 `pre`，`git add f.txt` → `git add -A`），文件头反向探针清单增加一行。断言数 35 → 41。

验证环境必须 Node v24.12.0（`export PATH="$HOME/.nvm/versions/node/v24.12.0/bin:$PATH"`），所有测试/探针亲自实跑，不采信实现方口径。不改代码、不提交、不推送（探针后须还原，`git status --porcelain` 为空，允许既有的 `?? .workbuddy/`）。

一、B1 根因与修复核验（逐项 CLOSED / NOT_CLOSED + 行号）
a) 自己复现一遍再谈修复：真 `LoopGitWorkspaceManager` + 真 git，base commit 中预置 `secret/b.ts`，attempt `git mv secret/b.ts src/b.ts` 并提交，`cleanup({ outcome:"succeeded", allowedPaths:["src"] })`。修复前应为 `no throw / decision=promote / worktreeRemoved=true`；修复后应为抛 `CLEANUP_BLOCKED` 且 worktree 保留。请记录实测值。
b) 对照实验：`git diff --name-only -z <base>...HEAD` 与加 `--no-renames` 后，在同一仓库上的输出差异（实现方实测：默认 `["src/b.ts"]`，`--no-renames` `["secret/b.ts","src/b.ts"]`）。请确认 rename 检测确实折叠了源路径，而非其他原因导致漏判。
c) 方向一致性：`statusPaths()`（`core/loop-git-workspace.ts:263-265` 附近，注释 "those bytes were touched too"）对**未提交** rename 已把原路径计入改动；已提交半段此前未取同一保守方向。请判定 `--no-renames` 是否是消除这一方向矛盾的最小且正确手段，还是应改用其他 flag 组合（如 `-M0` / `--find-renames=` / `--diff-filter`）或改用 `diff-tree -r --name-status`。若你认为有更合适的写法，请说明它在本场景下的行为差异。
d) 判定 `--no-renames` 是否引入**新的漏判或误判**：① 模式变更（chmod）、② 二进制、③ 子模块、④ 复制检测（git 默认不开启 copy detection，`--no-renames` 是否进一步影响 `-C` 语义）、⑤ 空目录。请实测或给出 git 语义依据。
e) `git diff --name-only -z` 输出中是否可能出现**重复路径**（rename 拆成 delete+add 后同一路径既在源又在目的集合）。`changedPaths` 用 `Set` 去重，请确认去重不会掩盖任何越界判定。

二、回归矩阵（B1 修复波必须补的断言，逐项实测并给出首挂断言名）
① **已提交 rename，越界源 → 允许汇 = block**（新增 T9a）：断言文件 `tests/loop-w6b3-attempt-workspace-three-state.test.ts` 的 T9a 三条是否真实承载——`CLEANUP_BLOCKED`、证据仍可读（`src/b.ts` 存在）、越界源已从树中消失（attempt 留下的状态）。
② **允许集合内 rename 仍 promote**（新增 T9b）：base 预置 `src/a.ts`，attempt `git mv src/a.ts src/b.ts` 并提交，`allowedPaths:["src"]` 应 `decision=promote` 且 worktree 被回收。请确认修复**没有**让 rename 变成一律 block（否则是过度收紧）。
③ **越界纯删除本已检出**（新增 T9c）：base 预置 `secret/c.ts`，attempt `git rm` 并提交，应 `CLEANUP_BLOCKED`。此项在修复前后都应绿（修复前由既有路径覆盖，本轮补显式断言）。
④ **既有断言不变**：`tests/loop-git-workspace.test.ts` 必须 110 断言原样通过；`tests/loop-w6b3-*` 的 T1–T8 断言数与结论不变（总数为 41 = 原 35 + 新增 6）；`tests/loop-w6b2-human-action-artifact.test.ts` 必须 83 断言通过。

三、反向探针（必须亲自改代码制造红，再还原）
- **P1（本轮关键）**：把 `:533` 的 `--no-renames` 去掉 → **T9a 必红**（实现方实测：T9a 两条转红，`39 passed, 2 FAILED`），且 **T9b/T9c 必须仍绿**。若 T9b/T9c 也转红，说明新断言描述的是别的东西，请指认。
- **P2**：把 `setupRepo` 的 `pre` 预置去掉（即越界源不在 base 中，改由 attempt 自建后再 mv 走）→ 复现实现方记录的**已知边界**（见五.b），确认该场景在修复后仍是 `promote`，并判定实现方把它划为范围外是否成立。
- **P3**：把 `git add -A` 改回 `git add f.txt` → T9a/T9b/T9c 应因 base 缺少预置文件而失败，证明 `pre` 参数真实承载。
- 探针后 `git status --porcelain` 必须为空（允许既有的 `?? .workbuddy/`）。

四、生产 diff 与范围核验
- `git show 05d12d2 --stat` 应恰为两个文件：`core/loop-git-workspace.ts`（+9/-2，其中 7 行是注释）与 `tests/loop-w6b3-attempt-workspace-three-state.test.ts`。逐 hunk 确认无夹带、无无关重构、无注释伪装成代码、无顺手加固。
- W1～W6b2 冻结面零改动：Q1 绑定、gateway 开关、production 门、路径 A 冻结 B-7、W5 九类、W6a 十字段与五分类、W6b1 lease 窗口防火墙（含 B-8 装配锁定）、W6b2 六合法码与三处注册表。
- real 休眠复核：无 `source=real` 通道、无真实 spawn、无新激活面；`promote` 不得出现 merge/push/写 base branch 的代码路径。
- `npx tsc --noEmit` 干净；`ruby scripts/validate-skill-contracts.rb`、`validate-capability-metadata-chain.rb`、`validate-compact-prompt-contracts.rb` 三个 exit=0（`ai-sdlc-prompt.rb`、`audit-entry-coverage.rb` 需参数、exit=2 属正常）。

五、已知事实与范围外（不得作为缺陷上报，除非你能指认合同依据使其变为范围内）
a) **既有环境能力缺口**：`tests/loop-artifact-store.test.ts` 与 `tests/loop-delivery-checkpoint-store.test.ts` 在**实现方本机**各有一组确定性失败，全部集中在**跨进程并发**段落。根因已取证：本机对 `link`(2) 硬链接存在 broker 拦截——link 目标**已存在**时内核本应返回 `EEXIST`，本机返回合成错误 `CODEBUDDY_BROKER_DENY`，因此 `loop-artifact-store.ts:359-363` 并发 put 的落败者被兜底为 `ARTIFACT_IO_FAILURE`，EEXIST 赢家赛分支（`:361`）永远进不去。三进程探针 3/3 稳定 1 成功 / 2 失败；沙箱与非沙箱一致。**基线对照**：`99c9df3`（不含 W6b3 任何改动）独立 worktree 实跑，失败集合与实现方分支逐字一致（artifact-store 6 条、delivery-checkpoint `passed=265 failed=3`）。判定口径：先于本波存在的环境能力缺口，不是回归，本轮未改动这两个模块的生产代码。若你的环境没有该 broker 拦截，这两个文件应全绿——请如实记录你的环境结果，不要反过来据实现方本机结果判定本波。
b) **B1 的已知边界（本轮如实记录、未修）**：`--no-renames` 覆盖的是「越界源存在于 base commit」的 rename。若 attempt **自己创建**越界文件于一个提交、再于后续提交 mv/删除它，`<base>...HEAD` 的最终 diff 里本就不含该路径，任何 diff flag 都无法恢复——这是「中间提交的痕迹不出现在最终 diff」这一更宽的问题（不限于 rename：提交后再删除同样成立）。合同不变量「workspace diff 只含任务允许路径」按 `<base>...HEAD` 定义，故该场景严格说不违反 I7。请判定：① 把该场景划为 B1 范围外是否成立；② 若判定不成立，请指认合同条文，并说明修复形态（逐提交遍历 diff？）——注意这属于**新机制**，不是 B1 的单 flag 修复，须按新波次而非本轮阻塞处理。
c) 其余已知事实：① `cleanup()` 仍无生产调用方（上轮已裁决为合同内正确形态）；② `promote` 不做 merge/推送（E5 未授权，上轮已裁决）；③ 未提供 `allowedPaths` 时不启用越界检测、沿用既有 `WORKSPACE_DIRTY`；④ `block` 以异常呈现、`result.decision === "block"` 在 cleanup 返回里不可达；⑤ `Results: N passed` 是单个测试文件的内部计数，不是全套件断言总数；⑥ E5 真实 canary/prepare/real dispatch、路径 A 物理删除、真实 Agent/Git/发布副作用、C-T1/C-T2 收口与 Exchange/PKB publication 均**不在本轮范围**。
d) 本轮**未**采纳任何新的泛化加固建议。若你提出合同外建议，请单独列为「建议项」而非阻塞。

六、输出要求
1. 逐项给出 CLOSED / NOT_CLOSED / PARTIAL 并附行号与实测命令输出。
2. 明确给出本轮结论：**CLOSED（可出 W6b3 pass-state）** 或 **NOT_CLOSED（列出阻塞项，每项给根因 + 可判定的修复边界）**。
3. 若给出 NOT_CLOSED，修复边界必须是「单处改动 + 可命名的新断言」，不得是开放性加固清单。
4. 报告本机（复审方环境）的全套件结果与上两项已知失败文件的实测结果，与实现方口径逐条对照。
5. 结束时把仓库留在 detached `05d12d2`、工作树干净。

---

实现方自留证据（供对照，不要求采信）：
- 提交 `05d12d2`，父提交 `952d9da`（docs）→ 代码父 `02b642a`。
- 聚焦实测：`tests/loop-w6b3-attempt-workspace-three-state.test.ts` 41 passed；`tests/loop-git-workspace.test.ts` 110 passed；`tests/loop-w6b2-human-action-artifact.test.ts` 83 passed；`tests/loop-finding-lifecycle.test.ts` 350 passed；`tests/loop-single-rail-contract.test.ts` 55/55；`npx tsc --noEmit` 干净；三个 ruby validator exit=0。
- 反向探针 P1 实测：去掉 `--no-renames` → `T9a: ... (no throw)` 与 `T9a: the moved evidence is still readable` 两条转红，`39 passed, 2 FAILED`，T9b/T9c 全绿；还原后 41 passed。
- 全套件（实现方，`05d12d2`）：**实跑中，结果待回填**。上一轮基线 `952d9da`（W6b3 文档 pin，146 文件）的 `failed_file_count=2`，即第五节 a) 的两个已知环境缺口文件，非本波缺陷。本轮**请以你的实测为准**；若实现方回填结果与你的结果不一致，请列出差异并判定归因。
