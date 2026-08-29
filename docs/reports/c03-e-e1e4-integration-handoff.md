# C03-E E1～E4 Runtime 实施 — 集成层交接（HANDOFF）

> 最后更新：2026-08-29（UTC）。供中断后新会话/新 Agent 无缝续作。只读事实 + 明确下一步，勿凭印象改。

## ★ 当前快照（W6b4 实施完成、聚焦复审待回；W6b3 ✅ PASS，与下文冲突时以本节为准）

- **W6b3 = E4-T5：✅ PASS（B1 聚焦复审 CLOSED 零阻塞，2026-08-29）**。路径：实现 `02b642a`（35 断言）→ 独立复审 NOT_CLOSED（1 项阻塞 B1）→ B1 修复 `05d12d2`（41 断言）→ **B1 聚焦复审 CLOSED 零阻塞 → 出 W6b3 pass-state（CP PR #25）→ 进 W7**。
  - 已落库：W1～W5 全部 PASS；W6a（`5b1855a`，68）；W6b1（`5f2bcd8`+`d9a7517`，27）；W6b2（`99c9df3`，82）；**W6b3（`02b642a` 35 → `05d12d2` 41，✅ PASS）**。CP：**PR #24 已合 main `c3a31f4`；PR #25 已合 main `2d2ff53`**。
- **W6b4 = E4-T5 收口：committed diff 门控（实现方在 W6b3 PASS 之后自查发现，非复审方提出）**。`1605a84`，45 断言，聚焦复审待回（`docs/reports/c03-e-w6b4-focused-review-prompt.md`）。
  - **问题**：`cleanup()` 的 committed diff（`git diff --name-only -z --no-renames <base>...HEAD`）是**无条件执行**的，但它唯一消费点是 `classifyWorkspaceCleanup` 里的越界检查（`:300`），而该检查又被 `allowedPaths !== null` 门控。于是① 未传 `allowedPaths` 的既有 30+ 调用方每次 cleanup 多跑一个 git 子进程、拿到一个没人读过的值；② 因为 `_gitR(...,[0])` 对 timeout／signal／截断／非零退出一律抛 `GIT_COMMAND_FAILED`（`:626-641`），它给这条此前不可能在此失败的路径**新增了一个失败面**。
  - **修复**：`:540` 改为 `allowedPaths === null ? "" : (await this._gitR(...))`。对既有调用方行为完全等价；T9 三例都传 `allowedPaths`，不受影响。
  - **触发场景（如实记录，未当作归因证据）**：实现方本机全套件（146 文件 / 3539.2s，比复审方 278.8s 慢约 12.7 倍）出现文件级失败 `tests/loop-codex-implementation-adapter.test.ts`——该文件正是「导入 `LoopGitWorkspaceManager`、`cleanup()` 不传 `outcome`/`allowedPaths`」的既有调用方。隔离单跑 354/354、3 路并行 3/3、8 路并行 8/8 **均未复现**，故只作为「需要收口的面」的动机，未作为因果证据。
  - **回归矩阵 T10（41→45 断言）**：用 `Pick<LoopPosixProcessRunner,"run">` spy 记录每次 git 调用的 args。T10a 未传 `allowedPaths` → `args[0]==="diff" && args.includes("--name-only")` 计数为 **0**；T10b 传了 → 计数为 **1**；两条都断言 `decision === "promote"`（门控不改变任何判定）。用 `--name-only` 区分是因为仓库另有两处 source-wip 的 `git diff --binary`（`:1101`/`:1104`）。
  - **反向探针 P6（已实跑并还原）**：把门控去掉 → **T10a 恰转红**（`saw 1`，`44 passed, 1 FAILED`），**T10b 仍绿** → 证明新断言真实承载且未过度收紧。
  - **B1 聚焦复审核心证据**：复现对照与实现方逐字吻合（`02b642a` `decision=promote / worktreeRemoved=true / 证据销毁`；`05d12d2` 抛 `CLEANUP_BLOCKED`、worktree 与 `src/b.ts` 证据保留）；`git show 05d12d2` 恰为两文件、无夹带无顺手加固；复审方核验备选写法（`-M0`／`--diff-filter`／`diff-tree -r`）后确认**单 flag 是最小且正确手段**，并逐条排除新漏判（chmod／二进制／子模块／copy／空目录）；T9a／T9b／T9c 全部真实承载；探针 P1 恰 `39 passed, 2 FAILED`（T9a 两红、T9b/T9c 绿）、P2 复现已知边界并**判定划为范围外成立**、P3 证明 `pre` 参数真实承载；**复审方环境全套件 146 文件 / failed=0 / exit=0 / 278.8s**，两个已知环境缺口文件在其环境隔离单跑**全绿**（266／268）→ 实证实现方本机失败确为 broker 拦截 `link`(2) 的环境能力缺口、非本波回归。
  - **建议项（1 条，非阻塞，须新波次立项）**：若未来合同要求「中间提交的越界痕迹」也可判定，需**逐提交 diff-tree 遍历**的新机制。
  - **PASS ≠ 激活真实 Agent**：E5 真实 canary／真 spawn 仍需另行授权。
  - **B1（唯一阻塞项，已修）**：已提交 rename 逃逸越界检测（I7 破窗 + 销毁证据）。`diff --name-only -z <base>...HEAD` 走 git 默认 rename 检测、rename 只输出目的路径 → attempt `git mv secret/b.ts src/b.ts` 并提交后越界源不进 `changedPaths` → 工作区干净 + 声称 succeeded + `allowedPaths:["src"]` → 判 `promote`，worktree 回收、证据销毁。复审方与实现方各自端到端复现一致（修复前 `no throw / decision=promote / removed=true`）。**修复**：`:533` 加 `--no-renames` 单 flag（本轮唯一生产改动）→ rename 按 delete+add 上报、源路径进入分类器，修复后抛 `CLEANUP_BLOCKED` 且证据保留。**回归矩阵已补 T9（35→41 断言）**：T9a 越界源→允许汇 block／T9b 允许集合内 rename 仍 promote／T9c 越界纯删除 block。**探针**：去掉 `--no-renames` → T9a 两条转红（`39 passed, 2 FAILED`）、T9b/T9c 仍绿，还原后 41 全绿。
  - **B1 已知边界（如实记录、未修、范围外）**：修复覆盖「越界源存在于 base commit」的 rename。若 attempt 自建越界文件于一个提交、再于后续提交 mv/删除，`<base>...HEAD` 的最终 diff 本就不含该路径、任何 diff flag 都救不回——属「中间提交痕迹不出现在最终 diff」这一更宽问题（不限于 rename）。规划 `:443-444` 不变量按 `<base>...HEAD` 定义，故严格说不违反 I7；须按新波次（逐提交遍历 diff）处理，不属于 B1 的单 flag 修复。
  - **复审两项形态裁决（非阻塞）**：① cleanup 零生产调用方下交付三态契约 = 合同内正确形态（与 W6b2「先立契约」同构，台账明确要求改 options/result/manager 三处落点）；② `promote` 不 merge/push = 合同内最小形态（D-071 + E5 未授权禁止触碰 base branch）。
  - 生产改动：`core/loop-git-workspace.ts`（三态类型 + 纯函数 `classifyWorkspaceCleanup` + cleanup 接线 + `vRelPath`/`statusPaths`/`isWithinAllowed` 三个 helper + **B1 `:533` `--no-renames`**）；`core/loop-artifact-revision.ts` + `core/loop-finding-lifecycle.ts`（S2 别名）。测试：新增 `tests/loop-w6b3-attempt-workspace-three-state.test.ts` **41 断言**（原 35 + B1 回归矩阵 T9 6 条）；`tests/loop-w6b2-human-action-artifact.test.ts` 82→83（F1）；`tests/loop-single-rail-contract.test.ts`（S2 改名）。复审 prompt：`docs/reports/c03-e-w6b3-independent-review-prompt.md`（已回收，NOT_CLOSED/B1）；**B1 聚焦复审 prompt：`docs/reports/c03-e-w6b3-b1-focused-review-prompt.md`（基线 `05d12d2`，增量范围 `02b642a..05d12d2`；**结论已回收并记于该文件开头：CLOSED 零阻塞**）**。
  - **三态契约**：promote＝改动全在任务允许路径内且工作区干净 → 回收 worktree（**不 merge、不 push、不碰 base branch**，E5 未授权）；isolate＝attempt failed → 保留 worktree＋分支为证据并**以结果返回**（绕过 `WORKSPACE_DIRTY`，不绕过结构/head/base 祖先/drift 校验）；block＝unknown 或越界 → 保留证据、**不清理不提升**，抛 `CLEANUP_BLOCKED`（故 `result.decision === "block"` 在 cleanup 返回里不可达）。
  - **越界检测两路输入**：已提交（`diff --name-only -z <base>...HEAD`）＋未提交/未跟踪（`status --porcelain=v1 -z -uall`），重命名/复制的第二条原路径计入。`allowedPaths` **仅显式提供时**启用，既有 30+ 处 cleanup 调用与 `WORKSPACE_DIRTY` 语义零改动。判定顺序**越界 → unknown → failed → succeeded**，越界与 unknown 均压过调用方声称的 `succeeded`。
  - **形态取证**：`cleanup()` 在本波之前**无任何生产调用方**（仅 `loop-git-workspace.test.ts`、`loop-codex-implementation-adapter.test.ts` 测试调用）；既有断言为字段级非整对象比较，故 result 新增三字段不会放宽任何既有断言。
  - **W6b3 自测反向探针（已实跑并还原）**：P1 去掉越界分支 → T4 红；P2 `isWithinAllowed` 放宽为裸 `startsWith` → T5「`srcfoo` 前缀兄弟目录」红；P3 `failed` 改走 promote → T2 红（实测捕获 `WORKSPACE_DIRTY`）；P4 把 `changedPaths` 换回 `statusPaths(status)`（丢掉已提交 diff）→ T4 红。
  - **W6b3 验证基线**：新测试 **41** 断言全绿（原 35 + B1 回归矩阵 T9 6 条）；`loop-git-workspace.test.ts` 110；`loop-w6b2-human-action-artifact.test.ts` 83；`loop-finding-lifecycle.test.ts` 350；`loop-single-rail-contract.test.ts` 55；tsc 干净；3 个 ruby validator exit=0。
  - **已知环境能力缺口（非本波缺陷，已写进复审 prompt）**：`tests/loop-artifact-store.test.ts`（6 条）与 `tests/loop-delivery-checkpoint-store.test.ts`（3 条）在**本机**确定性失败，全部集中在**跨进程并发**段落。根因：本机 `link`(2) 硬链接在目标**已存在**时返回合成错误 `CODEBUDDY_BROKER_DENY` 而非内核的 `EEXIST`，导致 `loop-artifact-store.ts:359-363` 并发 put 的落败者进不了 EEXIST 赢家赛分支、被兜底为 `ARTIFACT_IO_FAILURE`。三进程探针 3/3 稳定 1 成功/2 失败、失败码恒定（沙箱与非沙箱一致）。**基线对照**：在 `99c9df3`（不含本波任何改动）独立 worktree 实跑，两个文件失败集合与本机分支**逐字一致** → 先于本波存在，不是 W6b3/F1/S2 回归；本波未改这两个模块的任何生产代码。换一台无该 broker 拦截的机器应全绿。
- **分支已 push 且有上游**：`feature/c03-e1-e4-runtime-implementation`（主干仍是 `loop-runtime-v1`，未碰）。续作先 `git fetch && git pull`。
- **HEAD = `1605a84`（W6b4 = E4-T5 收口：committed diff 门控；聚焦复审待回）**。前序：`d9a7517`（W6b1 S1/S2 补强）→ `99c9df3`（W6b2）→ `f82cc5a`（docs-only pin）→ `4f9eaad`（台账收口 W6b2）→ `02b642a`（W6b3 代码）→ `952d9da`（W6b3 文档 pin）→ `05d12d2`（B1 修复）→ `5c5b18d`（B1 聚焦复审 prompt）→ `e92eea3`（W6b3 PASS 文档）→ `7cd403e`（回填本机全套件）→ `1605a84`（W6b4 门控）→ 本文档提交。
  - 已落库：W1～W5 全部 PASS；**W6a（`5b1855a`，68 断言，复审 PASS，CP PR #22 已合 main `16cc5e6`）**；`d4ee31e` 台账裁决；**W6b1（`5f2bcd8` + `d9a7517` 补强，27 断言，复审 PASS 零阻塞，CP PR #23 待合并）**。
  - 工作区（未提交）：**W6b2 实施** —— 新增 `core/loop-human-action-artifact.ts`（六合法码 allowlist + 构造/序列化/读回校验 + put/read 封装）；`core/loop-artifact-store.ts`（kind 两处：`:14` 联合类型 + `:34` KINDS 数组）；`core/loop-artifact-revision.ts`（`LOOP_ARTIFACT_REVISION_KINDS` 同步，否则 `:65-67` 编译期漂移检查报错）；新测试 `tests/loop-w6b2-human-action-artifact.test.ts` **82 断言全绿**；复审 prompt `docs/reports/c03-e-w6b2-independent-review-prompt.md`。
  - 权威 W↔E 任务映射与每步状态见 `docs/reports/c03-e-e1e4-task-set-and-gate-audit.md`（台账，比本 handoff 更细，先读它）。
- **W6b1 做了什么（一句话）**：把「lease 覆盖 recovery→claim→spawn→terminal/promotion 窗口」从**结构性巧合**变成**可强制、可证明的防火墙**。
  - 取证事实：`runProduction`（`runtime.ts:961`）委托给 `run()`（`:1033`），而 `run()` 整体包在 `withResumeLease`（`:394`）里，所以窗口**确实**被覆盖；但没有任何机制阻止未来入口在无 lease 时进入同一 claim/spawn 路径——`claimNextCapabilityExecution` 只保证 claim 原子性，不保证 lease。
  - 因此新增：`isResumeLeaseHeld(journalPath)`（lease 身份按 `leasePathFor` 重算，不同拼写/不同 journal 不算持有）；`LoopCapabilityEntry` 新增可选 `requireResumeLeaseJournal`，在 `execute()` 读 recovery **之前**（第一次持久化 claim 之前）断言持有该 journal 的 lease，否则 `STORE_BUSY` fail-closed；`runtime.ts` 装配该选项。
- **复审裁决（二.d，重点）**：可选守卫判为**建议项不阻塞**——合同原文（规划 §6 E4）只要求"lease 覆盖窗口 + S12 至多一个 spawn"，未要求无条件守卫；生产路径无旁路（`runtime.ts:386` 是唯一装配点且必装）。但复审 **P2 实证：删掉装配行后全套件（含 run-production、c03d wiring）全绿，没有任何测试能捕获"生产路径静默失去防火墙"**——这条缺口已由 B-8 补上。
- **取证复核结论（复审）**：委托链无缝、无旁路——`runProduction` 无条件委托 `run()`，`withResumeLease` 闭包 `:397–:917`，两个 `entry.execute`（`:532`/`:723`）均在闭包内；`claimNextCapabilityExecution` 生产调用点仅 `gateway.ts:332`/`:978`，只能由 `entry.execute` 到达；`scripts/codex-real-dispatch-smoke.ts:184` 裸调但无 capabilityTracing、不 claim 不写 journal（W4 既有工具）。
- **W6b2 关键取证**：当前生产代码**没有任何一处给 `humanActionRef` 赋非 null 值**（`execution/gateway.ts` 五处写入点全硬编码 null），唯一消费者是 `classifyCapabilityRecovery`（`loop-recovery.ts:101`）把非 null 映射为 `HUMAN_INPUT_REQUIRED`。与 real 路径按 D-071 休眠一致 → 本波**只立契约、不接生产者**（待复审裁决）。
- **W6b2 两个裁决点（已写进复审 prompt）**：① **ref kind 强制只放在读回路径**，不在事件层强制 —— 因为 W6a 已冻结的 T2-A6/A7（`loop-w6a-*.test.ts:268,277`）用的是 kind 为 `human_action` 的 ref，事件层强制等于推翻已 PASS 波次；② **新增 kind 使 3 个既有测试的注册表规模断言 17→18**（`loop-artifact-revision.test.ts`、`loop-artifact-store.test.ts` 两处、`loop-governance-tail-result.test.ts`），是机械后果而非放宽断言；并行套件中这两个文件曾稳定失败 3/3（非偶发），已修复。
- **外部独立复审：结论 PASS、零阻塞**（2026-08-29）。prompt 见 `docs/reports/c03-e-w6b2-independent-review-prompt.md`；外部独立 agent 在**精确基线 `99c9df3`（detached HEAD）**执行，分支 tip `f82cc5a` 仅为 docs-only pin 提交、代码逐字节一致，结论对两者同样成立。两份清单（行为不变量 I1–I10、失效模式→可判定原因）全部成立，契约 a)–h) 全部 CLOSED；「先立契约不接生产者」符合台账与规划 :465-469 的要求。探针 **P1/P2/P3/P5/P6/P7 如期变红并还原，P4 未变红 → 记为非阻塞 F1**（T7 的异 kind fixture 内容本身是非 JSON，前置正则被 parse 层掩盖，但前置检查确有真实防守价值，只是无断言钉住）。另一建议项 **S2**＝`LOOP_ARTIFACT_REVISION_KINDS` 名实分离（兼任 canonical-kind 注册表），属合同外重构。已出 CP pass-state PR #24。
- **W6b2 自测反向探针（已实跑并还原）**：P1 把 `SWITCH_AGENT_REQUIRED` 塞进 allowlist → T1/T2 红；P4 放宽 parse 的字段数量检查 → T5「an extra field is rejected」红。还原后 82 断言复绿。
- **W6b2 验证基线**：新测试 82 passed；全套件 **145 文件 / failed_file_count=1**（`loop-codex-implementation-adapter`，隔离单跑 3/3 全绿 = 既有 sqlite runner 竞争）；tsc 干净；3 个 ruby validator exit=0。
- **W6b2 = E4-T4 ✅ PASS**（`99c9df3`，82 断言，CP pass-state PR #24）：新增 `human_action_required` artifact kind（六合法码，`SWITCH_AGENT_REQUIRED`/`SHADOW_FALLBACK_REQUIRED` 非法），kind 注册表实际同步**三处** —— `loop-artifact-store.ts` 联合类型 + KINDS 数组 + `loop-artifact-revision.ts` 的 `LOOP_ARTIFACT_REVISION_KINDS`（第三处由编译期穷尽性检查暴露，开工前仅预估两处）。**下一步：W6b3 ✅ PASS（B1 聚焦复审 CLOSED 零阻塞）→ 出 W6b3 pass-state（CP PR #25，待 Current User 合并；PR #24 亦待合并）→ 进 W7=C-T1 全量只读复审 → C-T2 Current User 收口。** **E5 真实 CLI canary / 让默认路径真 spawn 三 Agent 仍未授权，须另行裁决。**
- **v24 验证基线（W6b1 + S1/S2 实测）**：新测试单跑 **27 passed**；全套件 **144 文件 / failed_file_count=0 / exit=0**（注意：`Results: 1767 passed` 是**最后一个测试文件的内部计数**，不是全套件断言总数——runner 只按文件 exit code 判定）；tsc `--noEmit` 干净；3 个 ruby validator exit=0；`git diff --check` 无空白问题。
- **反向探针（已实跑并还原）**：① 守卫条件改 `false` → T1 红；② 守卫下移到 bootstrap 之后 → T1「零持久化写入」断言红；③ `isResumeLeaseHeld` 恒 `true` → T1 红；④ 身份弱化为目录级 → T4 红；⑤ **删 `runtime.ts` 装配行 → B-8 校验器 exit=1**（此前全套件不捕获，S1 正是为此）；⑥ 装配改成别的变量 → B-8「must use the same journal path variable」exit=1；⑦ `busy_timeout=0→5000` → 测试仍绿但耗时 0.63s→6.13s，loser 的 BEGIN 在 SQLite C 层同步阻塞并**冻结事件循环（连持锁者的 JS 一起冻）**——真实执行者（子进程 I/O、计时器）下会退化为近死锁，故 `busy_timeout=0` 必须保持。探针后 `git diff` 仅剩预期改动。
- **范围外记录（复审判定，非缺陷）**：detached 子进程父崩溃后的副作用生命周期归 E4-T5/W6b3（"进程组脱离 ≠ 决策窗口脱离"成立）；守卫升级为无条件无合同条款支持。
- **治理同步状态**：CP（ai-project-control-plane）main 已合 PR #21，`projects/ai-sdlc/STATE.yaml` 的 product_commit=`5b1855a`、route 为 implemented awaiting review。PKB（personal-knowledge-base）当前 IDLE 正确——W6a 属实现中、未收口，按 Exchange-only 入站边界**不在此阶段写 PKB**；Exchange→PKB publication 留到 C-T2 收口。

---


## 0. ⚠️ 开工第一坑：Node 版本（不读会误判全仓飘红）

- better-sqlite3 native 模块是用 **Node v24（NODE_MODULE_VERSION 137）** 编译的；默认 shell 的 **Node v20（ABI 115）会 ABI 不匹配**，所有 sqlite/store 测试假性 `STORE_FAILURE`。
- 历轮复审报告里"26 个 pre-existing 环境性失败"**全部源于此**，与代码无关。
- **跑任何测试前先切 v24**：
  ```bash
  export PATH="$HOME/.nvm/versions/node/v24.12.0/bin:$PATH"   # node -v 应为 v24.12.0
  ```
- v24 下事实基线：**全套件 143 文件 / 1767 断言 / 0 断言失败**（W6a，2026-08-29；文件数随新增测试增长，以顶部快照为准）。tsc 与 Node 版本无关。

## 1. 当前位置

- 分支：`feature/c03-e1-e4-runtime-implementation`
- 远端：`origin` = github.com/shaoyang01/ai-sdlc-standard（HTTPS）
- 远端：`origin` = github.com/shaoyang01/ai-sdlc-standard（HTTPS），**分支已 push、有上游**（下列"尚未 push"为 c3abf17 时点历史，已被顶部快照取代）。
- 主干是 `loop-runtime-v1`（不是 main）。
- **当前 HEAD 见顶部快照（W6a `5b1855a`）；以下提交链为 c3abf17 时点的早期历史，仅作背景。**
  - `c3abf17` E1/E2 **real capability gateway**（复用基类 tracing + E3/prompt role 感知）
  - `eb8b5c5` E1 canonical prompt builder
  - `f3586de` 本交接文档初版（可忽略历史）
  - `23f9880` 能力层 Round1 修复（B1 argv traversal + S1/S2/S3）
  - `494e5de` E3 node-output-envelope ｜ `3da342b` E1 production-entry parser
  - `a135a36` E2c runner MAX_TO→1800000 ｜ `898026c` E2b real-capability-adapter
  - `d37f7f2` merge loop-runtime-v1 ｜ `f5c4559` E2a agent-cli-profile（merge-base 内）

## 2. 已完成且已锁定（勿重做）

- **能力层 Round2 独立复审 = PASS**（23f9880）。五模块（agent-cli-profile / real-capability-adapter / loop-posix-process-runner 仅 MAX_TO / loop-production-entry / node-output-envelope）均死代码、仅 tests 引用。
- **集成层已完成两块（均死代码、未激活）**：
  - `execution/capability-prompt-builder.ts`：`buildNodeCapabilityPrompt`，哨兵/字段名 import 自 E3，单一事实源。
  - `execution/real-capability-gateway.ts`：`RealCapabilityGateway extends ExecutionGateway`，**只 override `executePrimary`**，复用基类唯一 tracing 状态机；导出纯函数 `buildCapabilityOutcome/isVerdictRole/isScanRole`。
- **冻结文件唯一改动**：`execution/gateway.ts` 的 `executePrimary` 由 `private` 改 `protected`（零行为变化）。
- role 传递的最终事实（推翻旧猜测）：role/attempt/runId 就在 `request.loopExecution` 里，boundRequest 保留它，**无需改基类签名、无需反推**。
- **role 感知细化**：E3 envelope 与 prompt 新增 role 视角——只有 solution-gate/**formal_verdict** 可出 verdict（`parseNodeOutputEnvelope(raw,cap,{isVerdict})`，默认行为不变）；**adversarial_scan 强制 NOT_APPLICABLE 但必须留 findings ledger**；code-review 留 findings；其他节点两者皆无。这与基类 `readCapabilityOutcome` 逐行对齐。
- 端到端验证用合法首节点 requirement-intake（recovery authority 强制节点顺序，solution-gate 在链尾不能对新 run 直接派发）。

## 3. 关键架构决策（Current User 已拍板）

- **Decision A（2026-08-28）**：E3 哨兵信封 `<!--@loop-output-begin/end-->` 是**唯一** agent I/O 契约。legacy 行标记（`GATE_RESULT:`/`UNRESOLVED_FINDINGS_JSON:`，在 codex-real-dispatch-*）随旧 sidecar 归档淘汰，新代码不得再发射；但**复用** `buildCapabilityTextArtifact`（已带 source:"execution_gateway"）造 canonical artifact。
- Q1 绑定：Kimi×4（intake/design/task-planning/knowledge-sync）、Codex（scan+implementation）、Hermes（verdict+code-review）。scan≠verdict firewall。
- AgentName === provider id === `kimi|codex|hermes`。§9：implementation 30min，其余 10min，runner 默认 120s 不变。
- 注意（**W1 `7f36b8d` 已对齐，本条为当时快照**）：本 HANDOFF 时点 `INITIAL_BINDING_REGISTRY`（冻结）intake 仍绑 codex，与 Q1 目标 kimi 不一致；W1 已将 INITIAL 按 Q1 八槽直返对齐（Kimi×4/Codex×2/Hermes×2），该 B1 缺口在 W1 复审 PASS 后闭合。原始风险记录：未对齐时真实 adapter 会抛 BINDING_MISMATCH（单测用 fake adapter 隔离此点）。

## 4. 下一步：接线（不是新写）+ 激活授权检查点

生产编排设施**已存在且巨大**，E1 编排 = 把 RealCapabilityGateway 接进去，而非另起：
- `core/loop-autonomous-delivery-loop.ts`（3707 行）、`core/loop-production-coordinator.ts`（1760）、`core/loop-git-workspace.ts`（989，LoopGitWorkspaceManager 真实 git/base/dirty preflight）、`runtime.ts`（853，`run()` 在 :288、`createRuntimeBindingRegistry` :196）。

动手顺序：
1. 先通读上述 4 文件，定位 production factory 现在如何选 gateway（deterministic/shadow），设计 real-vs-deterministic 选择开关（默认不得静默切 real）。
2. 接线：factory 用 `new RealCapabilityAdapter(new LoopPosixProcessRunner(...))` + `new RealCapabilityGateway(opts,{adapter,attemptWorkspace})`；cwd 由 LoopGitWorkspaceManager 的 attempt workspace 提供。
3. `scripts/loop-run.ts`：仅 `--request-file`（走 parseProductionEntryRequest）/`--resume`；closed 字段集，无 token/cmd/argv/env 承载。
4. **E4**：process evidence / recovery / lease / human-reason allowlist。
5. 旧 sidecar 与旧 spawn runner 归档（production factory 不再引用）。
6. 集成层独立全量复审（v24 跑）。

**治理检查点**：能力层 Round2 复审明确——集成缝合的**完成/激活**与 **E5 真实 CLI canary 属 Current User 单独裁决**。让默认路径真的 spawn 三个 Agent 前，必须拿到明确授权；真实 CLI 调用触发前再确认一次。

## 5. 治理边界（勿越界）

- 已完成模块当前全部死代码、未激活；除 runner MAX_TO 与 gateway protected 化外不碰 C02 冻结生产逻辑。
- **E5 真实 CLI canary 未授权**：fake adapter 只证明组合逻辑，E2-P 只证明 CLI 可达，三者证据不互替。
- 无远程 Git 副作用、无业务仓写入、无发布、无 Agent CLI 真实调用（除非 Current User 授权）。
- H3 归属 C03-B 不转移；WP1～WP4/C01 已收口行为除非直接破坏否则不动。
- 新文档/代码勿引入 RETIRED_PATH_TERMS（DIRECT_IMPLEMENTATION / Development Path Decision 等）。

## 6. 验证命令（务必先切 v24，见 §0）

```bash
export PATH="$HOME/.nvm/versions/node/v24.12.0/bin:$PATH"
npx tsc --noEmit
for t in agent-cli-profile real-capability-adapter loop-posix-runner-timeout-bound \
         loop-production-entry node-output-envelope capability-prompt-builder \
         real-capability-gateway loop-posix-process-runner; do
  ./node_modules/.bin/tsx tests/$t.test.ts
done
npm test                                   # v24 下应 143 文件 / 0 断言失败（并行偶发文件级 FAILED 隔离单跑即绿）
ruby scripts/validate-skill-contracts.rb
ruby scripts/validate-capability-metadata-chain.rb
```

续作第一步：切 v24 → 读本文件 → `git log --oneline -10` → 通读 §4 四个既有编排文件再动手接线。
