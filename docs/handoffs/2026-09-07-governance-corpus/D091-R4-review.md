# D091-R4 全量只读复审

**结论：FAIL / CHANGES_REQUESTED。剩余 1 个 P2 阻塞根因（B1：转换写入已发生但失败返回未留下可信所有权登记，回滚残留被误报为后来者对象）。**

R3 的原始 F1/F2/F3 反例均已安全闭合；本轮在任务书明确要求补齐的 F2 失败回归矩阵内发现 B1。不能仅凭两遍 778/0 将 D091 判为 PASS；当前尚不具备进入 D091 收口及四仓正式执行授权裁决的条件。

## 1. 对象、合同与只读证据

- 独立 worktree：`/Users/eric/meicai/projects/ai-sdlc-standard-governance-corpus-worktree`。
- 精确 HEAD：`7d3ad3d9d5ffd76e3fb5dae6e979a99112487b32`；分支 `codex/d088-governance-corpus`；本地 origin 引用同 SHA。
- 主审 `792f377..8454834`：完整读取 5 文件修正；抽查 `9e6e0c7..7d3ad3d` 的相关源/模板/合同/历史复审。`8454834..HEAD` 的脚本、测试、模板和产品合同无差异，后两提交为交接材料。
- 合同：Owner 三硬要求、Decision-091 六项决策、行为规格附录 1–9、README 索引、R1–R3 裁断和本次任务书冻结清单。规格正文已含 v1.3.0 增补，但页首 Version 仍为 1.2.0，见非阻塞文档项。
- 已实时读取 [Control Plane STATE](https://github.com/shaoyang01/ai-project-control-plane/blob/main/projects/ai-sdlc/STATE.yaml) 和项目 GOVERNANCE。STATE 中 D087 工作不用于推导 D091 的实施、收口、合并或四仓执行授权。本轮直接按 Current User 明确授权执行只读复审。
- worktree 前后 **937 个条目**（排除 `.git`；含目录/文件类型、权限、普通文件 SHA-256、符号链接目标）完全相同，Git 状态干净，HEAD 不变。[前后核对](read-only-check.json)。没有操作 D087 主工作区、代码/文档修改、提交、推送或 DocFlow；所有夹具、包装器和本报告位于 `/tmp`。

## 2. 行为不变量与公开路径失效模式

| 不变量 | 可判定要求 | 结果 |
| --- | --- | --- |
| I1 范围与只读 | detect/plan/dry-run 对目标零写入；EXISTING adoption 只枚举两类语料；LEGACY 自动全 walk；排除对象不扩收编 | 通过；实际类型与动作集已核对 |
| I2 路径与对象类型 | C11/C12 的实际目的地及原文归档逐组件检查；仓内/仓外/悬空链接同拒；生成不写穿；PRESERVE 保持 no-op | 安全核心通过；非目录根诊断承诺部分未落地，见 F1 |
| I3 所有权 | 正常移动用备份字节；转换用本次内存摘要；后来者不被误删；源恢复且冲突逐项报告 | 原接管反例通过；转换失败未登记输出时不满足，见 B1 |
| I4 原件与归档 | 原件永久归档；复用当场验字节；暂存独占；发布与清理保护后来者 | 给定 F3 矩阵通过 |
| I5 事务与报告 | 错误停止后续工作；无自有半文件；完整回滚声明与实际对象一致；失败不假成功 | B1 不通过；其余已测试失败路径通过 |
| I6 枚举与幂等 | Bash 3.2 空集合正确；非普通语料显式 C10 且不读取特殊对象；重复执行语义稳定 | 32 非普通 + 24 空集合 + 6 原有所有权调用通过 |
| I7 转换、生成和待确认 | 九规则确定且幂等；真归档前缀保护、假前缀触发门；7 骨架、防占位、人工内容保留；pending/skip 可追溯 | 通过；文档收尾仍 PARTIAL |

| 公开路径 | 非法输入/漂移/交错 | 应有错误或结果 | 实测 |
| --- | --- | --- | --- |
| 参数/detect | 互斥 flags、非法 profile/map、歧义目标 | 参数 exit 2；detect 只读显示类型；歧义写入口 exit 1 | 完整套件及独立互斥探针通过 |
| plan/dry-run | 源越界/链接/非普通条目、目标冲突、不安全语料根 | exit 1，C10/COLLISION/BLOCKED；合法计划 exit 0 + PLAN_SHA；零写入 | 通过 |
| adoption/LEGACY apply 前置 | 无确认、确认错误、源内容变化、内部计划后目标变化 | DP1/BLOCKED exit 1；移动前失败零移动 | 通过；另用备份 cp 包装器在内部计划后注入链接，确证 phase-2a 命中 |
| move/rollback | 后来文件、目录、链接、前缀被修改/删除 | 拒绝发布或回滚；源恢复，后来者保持，JSON/MD 冲突一致 | 原有 6 格和转换登记前后 6 格通过 |
| archive stage/publish | 归档复用时变化；暂存文件/链接/悬空链接占用；部分 cp；目录晚到；已发布归档被接管 | exit 1 + FAILED_ROLLED_BACK；保护后来者；无自有 tmp；合法复用成功 | 给定矩阵通过 |
| INIT/routed/AUDIT | 旧源/悬空源、缺模板、不安全根/叶子、已有人工内容 | 跳过/保留；合法缺失项生成；正式报告解释 skip | 源/模板/链接通过；非目录 `.sdlc` 根在既有 mkdir 路径 exit 1，无语料报告 |
| transformer | 无效 UTF-8、日志失败、rc/total/digest 不合法 | exit 1，整体回滚；不得自有残留却声称完整回滚 | UTF-8 在写入前失败正确；写入后日志失败、非法回执触发 B1 |
| gate/pending/finalize/EXIT | 非归档旧根、门拒绝、异常退出、发布归档被接管 | 失败报告与实际一致；同一所有权清理；成功绑定原文和 pending | 常规通过；B1 为登记缺失导致的报告不实 |

`CORPUS_DEST_BLOCKED` 是内部状态变量，实际计划表现为 `<corpus-destination>` 的 C10/BLOCKED 行；不是另一个独立进程错误码。

## 3. R3 项目逐项关闭

### R3-F1：PARTIAL（越界写入根因 CLOSED；非目录根诊断承诺 PARTIAL，非阻塞）

- `corpus_output_path_unsafe` 在 898–917 行先检查 `.sdlc` 自身，再逐组件使用 `File.symlink?`。四形态验证：真实目录允许；仓内/仓外 symlink 组件拒绝；悬空叶通过 lstat 识别并保留链接类型。
- 计划级 TRANSFORM 同时查目的地与原件归档（1492/1494）；RETIRE 查最终归档落点（1449）。apply phase-2a 按源前缀覆盖全部两类语料行、双查 dst/archive（1757–1767）；转换 pass 原复验仍在（1837）。两个迁移入口共享这些代码。
- 原 `retire-escape`：plan/apply 均 1，源保留，仓外无新文件。仓内链接同拒；悬空归档叶可由 COLLISION 分支先拒绝，也可由组件检查拒绝，没有因此落入第三个写入分支。
- 独立在**内部计划完成、备份 cp 返回时**注入归档祖先/归档叶/活动目录链接：TRANSFORM/RETIRE 均 phase-2a exit 1、零移动、仓外哨兵不变。真 LEGACY 首次迁移期间注入 `.sdlc` 根链接亦通过。
- `.sdlc` 根为链接时 INIT/AUDIT 均零语料生成；INIT 的 Notices 和 AUDIT 的 Corpus Skeleton Skips 保存跳过原因。既有机器件经根链接写入不扩审。
- PRESERVE 的已收编/已归档一致分支维持 no-op；归档祖先有链接时既有语料及归档字节不动。
- **限制**：`.sdlc` 为普通文件时，INIT/AUDIT 实际在既有 `mkdir` 路径 exit 1，目标零变化，但没有到达所宣称的语料 skip 提示/正式报告。`9e6e0c7`、`792f377`、`8454834` 六次对照行为相同，因此不作为 R4 新安全阻塞；不能声称该报告承诺完整实现。[对照证据](rootfile-baseline/results.json)
- 路径矩阵中的合法实际类型依据 `TYPE` 判断：已有 `.sdlc` 活动目标的 RETIRE/PRESERVE 用例属于 EXISTING adoption，不冒称为不可能同时成立的无 `.sdlc` LEGACY 用例。LEGACY 由无新根的独立正例、非普通条目矩阵和内部备份后根链接探针补证。

证据：[原始反例重跑](rerun/r3-new-results.json)、[路径/生成/skip 63 项](own2/results.json)、[内部计划后交错](crossings/results.json)、[LEGACY 与生命周期补充](lifecycle-extra/results.json)。

### R3-F2：PARTIAL（原后来者误删 CLOSED；失败结果处理仍有 B1）

- transformer 为 `ruby -rdigest`，成功输出 `total<TAB>sha256`；直接调用提取出的原函数，验证摘要等于落盘字节 SHA-256，九规则均命中，总替换数等于 TSV 计数总和，TSV 仍为 label/rule/count 三列。
- 全仓调用搜索确认仅两个消费者：1425 的计划比较丢弃 stdout，1908 的 apply 解析。计划文本与 R3 基线合法 TRANSFORM/RETIRE/PRESERVE 三种形态逐字节一致。
- 原 post-transform-owner 在真实 Ruby 返回后接管目标：exit 1，后来者存活、源恢复、JSON/MD 均有冲突。
- 登记前/登记后 × 修改/删除/替换为链接，共 6 组，多语料行同时存在，均符合所有权模型；无效 UTF-8 的 z 行触发后续回滚，状态为 FAILED_ROLLED_BACK。
- 未设置 `KT_TEST_TRANSFORM_PAUSE_FILE` 时不进入 wait/sleep，不额外启动进程；只有内建条件判断，不将“零开销”解释为零 CPU 指令。钩子仅用于临时夹具。
- rc 非零不会被吞成成功，但 `set -e` 会在 1908 提前进入 EXIT 守卫。无合法 count/digest 时虽然 exit 1，却可能留下本次输出并虚报完整回滚，见 B1。

证据：[直接转换/计划稳定性](positive/results.json)、[登记前后与格式反例](crossings/results.json)、[独立 B1 四入口复现](reproduce-b1-results.json)。

### R3-F3：CLOSED

- 复用归档前现在按备份字节当场验证（1902–1904）。计划时相同归档在暂存前变为不同内容、目录或链接均拒绝；后来者原样保留，失败报告没有伪造 original_archive 成功绑定。相同普通文件复用成功。
- noclobber 在子 shell 内独占创建，只有成功后才加入暂存清理集合。已存在普通文件、仓外链接、悬空链接均拒绝；占用对象与外部目标保持原样。占用者自己的 `.tmp.<pid>` 保留是正确行为，不是自有 tmp 泄漏。
- 目录在暂存前出现：失败且目录/owner 文件保留。目录在实际 BSD `mv -n` 前出现：嵌套自有 tmp 按备份字节证明后撤销，目录/owner 保留、无嵌套 tmp。
- `MIG_ARCHIVE_CREATED` 只有一处 append，格式为真实 tab 分隔的 rel/digest；三个清理消费者分别在 EXIT、残留门、mig_fail_rollback，全部调用 `mig_archive_remove_owned`（339、600、1714）。期望 digest 取备份原文字节，当前不匹配则保留并加冲突。
- 三条清理路径分别以“首归档被接管 + 后续 cp 部分失败 / z 无效 UTF-8 造成 EXIT / 后续门失败”验证；均保留首归档后来者，源恢复，冲突入报告，无自有 tmp。
- 给定正对照 archive-partial、late-after-stage、late-at-mv 均通过。
- 额外观察：暂存 cp 完成后、既有对象检查前出现一个指向相同原文字节的归档链接，当前分支会按 `cmp` 复用（exit 0）；不同字节/悬空链接 exit 1。该同字节复用没有写穿或改变外部对象，本轮不据此扩张已冻结 preflight 模型为额外链接锁定需求，也不声称这一时点所有链接都会拒绝。

证据：[原始归档反例](rerun/r3-new-results.json)、[三条清理路径](crossings/results.json)、[复用类型变化与悬空暂存](lifecycle-extra/results.json)。

### 已采纳建议收尾

| 项目 | 判定 | 证据 |
| --- | --- | --- |
| R3-S1 | CLOSED | 晚到目录嵌套 tmp 清理闭合；常规转换/归档/门/EXIT 清理未回归；第三方占用 tmp 正确保留 |
| R3-S2 | PARTIAL | Decision 真正第 6 条及 README 已改完整归档前缀；但第 103 行仍有“照常触发，正确触发）；”，只是并行合成一句；规格 Version 仍 1.2.0；AUDIT 正式报告 2989 行仍声称唯一写入为机器件 |
| R3-S4 | CLOSED | AUDIT 普通旧源、悬空旧源、缺模板均有正式 Item/Reason；独立 3 组实际报告已核对 |

## 4. 唯一阻塞项 B1 [P2]：写入后的转换失败丢失所有权登记，留下自有输出却报告完整回滚

**合同依据**：本次任务书 F2(b) 明确要求任何 rc/total/digest 不满足都视为转换失败、整体回滚、零部分提交；Owner 的失败可恢复/幂等不覆盖要求；附录 5/8 的所有权与真实报告语义。这不是“移动与原位转换之间”已冻结的晚到写入，也不要求取消内存摘要方案或使用全局锁。

**关键位置**：

- [写目标后才追加规则日志与返回摘要](/Users/eric/meicai/projects/ai-sdlc-standard-governance-corpus-worktree/scripts/bootstrap-knowledge-target.sh:843)：`File.write` 在 843，`File.open(logf, "a")` 在 848，摘要回执在 853。
- [调用、验证和成功后登记](/Users/eric/meicai/projects/ai-sdlc-standard-governance-corpus-worktree/scripts/bootstrap-knowledge-target.sh:1908)：只有成功格式分支在 1929 登记；非零返回受 set -e 影响提前进 EXIT。
- [回滚分支](/Users/eric/meicai/projects/ai-sdlc-standard-governance-corpus-worktree/scripts/bootstrap-knowledge-target.sh:1597)：无转换摘要时，自有转换结果不匹配原文字节，1616–1617 留下目标并列作后来者冲突；1634–1638 仅源恢复一致即返回完整回滚。

**最小真实失败序列**：

1. 建立合法语料 `a.md = "Use .specify/memory/x\n"`，同目录另有正常 z.md；合法计划并绑定其真实 PLAN_SHA。
2. 包装器只在该目标的真实 Ruby 转换调用前，把此次临时规则日志改为只读。它不改目标文件、不伪造 Ruby 输出。
3. 真实 `File.write` 成功，将 a.md 写成 `Use .sdlc/memory/x`；随后日志追加实际触发 `Errno::EACCES`，Ruby exit 1，摘要没有返回。
4. EXIT 回滚恢复源和 z，但 `.sdlc/.../a.md` 仍在；原文归档被清理；JSON 为 `FAILED_ROLLED_BACK`，冲突列表却称 a.md 属于后来者。现场没有后来者写过 a.md。

| 入口/语料 | exit | 两个源恢复 | 自有转换结果残留 | 报告 |
| --- | --- | --- | --- | --- |
| adoption / memory | 1 | 是 | 是 | FAILED_ROLLED_BACK + 假后来者冲突 |
| adoption / coding_guide | 1 | 是 | 是 | 同上 |
| LEGACY / memory | 1 | 是 | 是 | 同上 |
| LEGACY / coding_guide | 1 | 是 | 是 | 同上 |

另三种同根因变体：真实转换已成功写入，但把返回值分别变成非法 count、非法 digest、空 stdout。它们都拒绝并 exit 1，却同样留下自有转换结果，报告完整回滚。没有按这些变体拆分新阻塞。

**引入范围**：真实日志失败在 `792f377` 也存在，故不称为 R4 新引入回归；它属于 D091 语料转换新增路径且未在前三轮裁断中关闭，本轮 F2(b) 又明确要求验证该失败边界，因此在授权全范围内报告。

**影响**：失败后留下未成功交付、无本轮有效溯源的活动语料；后续运行面对这份残留会按既有目的地处理。源未丢失、后来者保护原反例已通过，严重性为 P2；但事务/报告合同不满足，阻塞本轮验收。

**一次性修复边界**：只修改 transformer 回执/错误处理、apply 所有权登记与相应回滚判定。让写入副作用与可信的本次输出归属信息在失败路径上保持一致；显式捕获非零结果进入统一失败处理。不得重新读取可变目的地补登记，也不得无条件删除目标。若无法证明已完整回滚，必须保留恢复证据并如实报告 INCOMPLETE，不能把自身残留包装成 later writer 后仍声称完整恢复。保持选定的内存摘要及备份字节模型。

**回归矩阵**：adoption/LEGACY × C11/C12 × 首行/后续行 × 写前失败/写后日志失败/合法回执/无效 count/无效 digest/空回执 × 无接管/登记前接管/登记后接管；分别断言源原文、当前自有输出是否清理、真正后来者字节/链接类型、原件归档、无自有 tmp、JSON/MD 状态与冲突真实性。原 F2 的 z 无效 UTF-8、多行查找及 F3 的三种清理路径保留回归。

**独立可重复运行入口**（每次创建全新 `/tmp` 夹具，不改产品仓）：

```sh
python3 /tmp/d091-r4-independent/reproduce-b1.py
```

[复现器](reproduce-b1.py) · [本轮四种组合结果](reproduce-b1-results.json) · [实际 Ruby 错误及磁盘证据](/tmp/d091-r4-b1-ytpjjmmb/results.json) · [非法回执变体](crossings/results.json) · [R3 基线对照](crossings/baseline-log-failure-result.json)。

## 5. 冻结决策及其他回归核对

| 合同 | 核对结论 |
| --- | --- |
| Owner 存量吸收 | 真实 9 份原文隔离收编、9 份持久归档、逐文件 pre/post 摘要与 original_archive 全部一致；未用模板替换原文 |
| Owner 缺失生成 | NEW_EMPTY 生成 7 份；AUDIT 补缺；已有人工内容摘要不变；字面项目名替换正确 |
| Owner 幂等不覆盖 | 合法重跑、冲突、PRESERVE/RETIRE 通过；失败恢复声明被 B1 阻塞 |
| Decision 1 / 附录 1 | C11/C12、九规则与规则计数、归档保护、28 条真实 pending 已独立复核；语义段落原文保留 |
| Decision 2–3 / 附录 3 | 7 骨架、中立模板、旧源防占位、悬空源防占位、缺模板 skip 通过 |
| Decision 4 / 附录 2 | 显式 adoption 与 LEGACY 自动含语料、DP1/互斥参数通过；B1 是共用事务失败面的剩余项 |
| Decision 5 | 内容不一致 COLLISION；一致且归档缺失 RETIRE；归档也一致 PRESERVE，零目标覆盖 |
| Decision 6 / 附录 4 | 真 `.sdlc/legacy/.specify/` 通过；custom-legacy 与业务目录中的 legacy 假前缀门失败；AUDIT residue 分别 0/1/1 |
| 附录 5/8 | 原后来者所有权模型通过；B1 失败无登记场景未满足 |
| 附录 6 | C1–C10/双根阻断/空集合/特殊条目未见功能回归；双入口均为 Bash 3.2.57 |
| 附录 7 | 路径安全闭合；普通文件根的报告表述应据实更正，见 F1 |
| 附录 9 | 指定归档生命周期回归通过 |

- 合法态 PLAN 文本：将 `792f377` 脚本只读导出到 `/tmp`，对同一夹具分别执行 TRANSFORM、RETIRE、PRESERVE plan，候选与基线 stdout **逐字节相同**，因此 SHA 相同。
- 9 文件正常路径会新增 phase-2a 的 18 次 Ruby 守卫进程；整次 plan 实测约 **1.66 秒**，apply 约 **7.44 秒**（含原有守卫、移动、转换、补缺、门和报告，本机同期有回归任务）。没有观察到阻塞性开销；这不是独立的性能基准或 SLA。
- 额外 `format-extra` 探针：count/末列 digest 都有效、中间多一列时当前解析仍接受。所冻结条件只明确 count/digest/rc，本轮未将额外列严格语法校验升格为独立需求或问题。
- 场景 81 的报告断言写成 `if 条件; then pass || fail; fi`，没有 else；条件为假会不计断言。故该套件项不能独自证明根链接 skip 文案。独立报告检查已补证；仅为非阻塞测试精度建议。

## 6. 验证证据与环境口径

| 验证 | 本次实跑结果 |
| --- | --- |
| bash -n 脚本与测试；git diff --check 主审范围 | 通过 |
| `bash tests/bootstrap-knowledge-target.test.sh` | **778 passed / 0 failed**，[日志](regression-default-full.log) |
| `/bin/bash tests/bootstrap-knowledge-target.test.sh` | **778 passed / 0 failed**，[日志](regression-binbash-full.log) |
| R3 原始反例本机化重跑 | 11/11 安全闭合；不是复用整改方结果文件 |
| B4/B5/原有回滚边界 | [32 非普通 + 24 空集合 + 6 所有权调用](boundary-full/r3-boundary-matrix-results.json)，以及非语料特殊对象不扩枚举，全部符合 |
| 独立路径/生成/skip | 63 项记录；按实际 TYPE 解读入口 |
| 登记/phase-2a/格式/三清理路径 | 20 项；包含本轮 B1 三个非法回执变体 |
| 归档复用/暂存/LEGACY 根交错补充 | 6 项，安全结果符合 |
| 九规则/门/计划稳定/参数/生成 | 14 项记录，正反向符合 |
| B1 真 Ruby 日志失败 | 4/4 复现缺口 |

默认 `bash` 和 `/bin/bash` 实际均为 `/bin/bash 3.2.57`；BSD mv/cp 实跑，无新版 Bash 或 GNU coreutils 证明。首遍未提升的沙箱回归为 **777/1**，唯一失败是 Unix socket 绑定被 sandbox 拒绝，随后在允许临时 socket 绑定的环境中完整重跑上述两遍；不将最初的环境失败算成产品缺陷，也不隐藏它。[原环境日志](regression-default.log)

仓内确有 `.github/workflows/ci.yml`，但 push/PR 分支过滤为 `feature/loop-runtime-v1`，并非当前分支；实时查询精确 HEAD 的 workflow_runs 为空。本轮验证口径为任务书指定的本地全量与独立探针，不要求新增 CI，也未运行不适用的 tsc/npm test。

原始 R3 探针改动仅本机 worktree 路径、临时输出位置和 Ruby `-rdigest -e` 参数布局；边界脚本已实际创建 socket 运行，没有用缺失 socket 代替该测试。

## 7. 真实仓只读预演

[完整计划输出、时长、指纹差异](real/results.json)；每仓 before/after 清单保存在 `real/`。

| 仓/命令 | 实际状态与计划 | exit | 全仓指纹（排除 .git） |
| --- | --- | --- | --- |
| logistics-center `--adopt-governance-corpus --plan` | `LEGACY_SDD`、BLOCKED=0；实际 **158 行**：TRANSFORM 36（C1×27、C11×6、C12×3），RETIRE 122（C3×6、C4×6、C5×5、C6×98、C7×7） | 0 | 3,118 条目完全一致 |
| logistics-master `--dry-run` | EXISTING_CODE_NO_KNOWLEDGE 的 INIT/candidate_pending_confirmation 补生成计划 | 0 | 4,144 条目完全一致 |

本机 logistics-center 仍有旧 business_domain 与 specs 轨，因此 LEGACY 全 walk 列出这些行，符合冻结的双入口语义。任务书的“36 行（含 27 退役）”不是当前现场事实；不把旧机器快照当固定验收阈值。未执行任何真实仓 apply。

真实语料隔离副本：9 收编、9 原件归档、9 original_archive 路径与 pre/post digest 绑定一致；17 条逐规则替换记录、28 条 pending。[绑定核验](real/bindings.json)

## 8. 分类与后续边界

- **阻塞项**：仅 B1，P2，必须修复转换失败时的归属信息/回滚报告闭合后复审。
- **非阻塞建议**：R3-S2 文档收尾；根为普通文件时据实描述当前退出/报告行为（基线问题，不要求扩大机器件写保护）；场景 81 避免条件不成立时静默跳过断言。
- **已关闭、不重复上报**：R3 原 3 组反例的既有危害、B4/B5、九规则/完整归档前缀/pending、防占位、S1/S4；B1 与其失败回执变体合并一次报告。
- **不属于本任务**：D087 runtime/gateway/finding/recovery、C03-B/H3、四业务仓正式执行与 routed 收口、wms-portal 域拆分、logistics-center 重号、wms-monitor 旧映射转 confirmed、project-context/business-domain-bootstrap 扩展收编、全局 Skill 安装、push/合并/Control Plane 登记、C05 验收、WP6 综合对抗矩阵。
- preflight 微小窗口、原位转换前晚到写入、verbatim/pending、C11/C12 编号、PRESERVE、骨架中立与权威边界等冻结取舍保持，不提出额外架构加固。

本报告是只读复审结果，不修改 Gate/STATE，不创建实施、正式执行、Ready、合并或发布授权。
