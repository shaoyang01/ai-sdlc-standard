# D091-R2 独立复审：FAIL

复审对象：`cc10bbb..f3faac8`；必要时抽查 `9e6e0c7..f3faac8`。
精确 HEAD：`f3faac844681e27f160a4e29d5bb5e189c15fa31`。
独立工作区：`/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard-governance-corpus-worktree`。
复审前后工作区干净、HEAD 不变；未改产品代码、未提交/推送、未使用 DocFlow，未操作 D087 主工作区。
所有故障注入和写入仅在 `/tmp/d091-r2-review` 等临时夹具中发生。

结论：存在 **5 项合并根因阻塞（3 P1、2 P2）**。正常路径测试通过不构成关闭证据。本轮不能进入 D091 收口或四仓正式执行授权裁决。

## 一、合同、不变量与公开路径失效模式

依据为 Owner 三项硬要求、Decision-091 六项决策、R2 任务书明确矩阵及冻结取舍；规格 §4.1/§5/§6/§7 用于核对归档、包容性、事务和报告。动态 D087 状态不用于推导 D091 执行授权。

| 不变量 | 可判定要求 |
| --- | --- |
| I1 范围与零写入 | detect、plan、dry-run 不改目标；adoption 只处理 memory/coding_guide；routed 域文档基线不受语料操作扰动 |
| I2 防占位与生成 | 源存在（含悬空链接）不生成同名骨架；模板缺失/根不安全跳过且说明；既有文件/链接不被新生成覆盖或跟随写入 |
| I3 枚举与包容性 | 所有输入均得到有效分类；越界、不可读、非普通语料 C10；最终语料及原文归档落点在仓内 |
| I4 不覆盖与幂等 | 普通冲突阻塞；转换一致且归档一致 PRESERVE 源；后来者对象不被移动、转换、归档或回滚覆盖/删除；空收编和重复调用正常完成 |
| I5 事务与原文 | 先完整备份，复验、移动、原文持久归档、转换、门、报告；失败停止后续操作，回滚结果与磁盘一致；原件归档不依赖临时目录 |
| I6 转换与残留门 | 九规则确定、幂等，完整归档前缀保留；非归档 legacy/ 不豁免；活动面与语料面同门 |
| I7 报告与待确认 | original_archive 对应真实原文；语义待确认逐行记录，50 行/120 字符边界；正式报告能解释跳过及失败，不能假成功 |

| 公开路径 | 非法输入 / 状态漂移 / 并发交错 | 合同结果与本轮证据 |
| --- | --- | --- |
| 参数与 detect | 参数互斥、缺参数、非法 map；任何目标类型 | 参数错误 exit 2；detect 只读。原套件及 30 个独立类型/标志组合覆盖 |
| plan / dry-run | 越界根、不可读、链接源、不同目标、确认前源或目标变化 | C10/COLLISION 计划阻塞 exit 1；安全计划 exit 0 + PLAN_SHA，目标零写入。剩余 B1/B4/B5 |
| adoption / LEGACY apply | 缺确认或 digest 漂移；后来的目标对象 | 缺确认/漂移 exit 1，移动前不写；事务失败 exit 1 + 真实回滚报告。剩余 B2/B3/B4 |
| INIT / routed | 缺模板、旧源存在、不安全根；目标叶子为悬空链接 | 前三类跳过并继续；已存在对象必须保留。24 格矩阵主体通过；叶子保护 B1、AUDIT 持久提示 S4 |
| AUDIT / fill | 缺骨架、人工内容、源未收编；补齐后模板失败 | 缺失才生成、旧内容不动；事务内补齐失败回滚。现有链接与正式通知仍有 B1/S4 |
| 转换 / 原文归档 | 无效 UTF-8、归档失败、历史归档冲突、晚到归档 | 安全失败 exit 1；只清理本次拥有的对象，不能假称完整回滚。转换失败正常回滚通过；新增归档 B3 |
| 门 / pending / finalize | 非归档旧根、门拒绝、待确认多行、多字节 | 门拒绝回滚；归档引用豁免；pending 限长且可定位；成功报告与实际一致。P2-5/P2-6/P2-7 正常关闭 |

## 二、R1 关闭判定

| R1 项 | 判定 | 复审结果 |
| --- | --- | --- |
| P1-1 跳过传播 | PARTIAL | INIT staging→PAIR→执行已闭合，旧源/悬空源/缺模板/不安全根不再误列 create；routed 同样跳过。AUDIT 正式报告未保存跳过原因，见 S4（非阻塞） |
| P1-2 路径包容性 | PARTIAL | R1 直接根/祖先越界、仓内文件链接、悬空链接和不可读根反例已阻塞，链接和仓外字节保持；子落点/新归档/生成叶子 B1、非普通枚举 B5 未闭合；无语料根 B4 |
| P1-3 最终落点冲突 | PARTIAL | 旧反例：不同归档阻塞、悬空落点阻塞、普通文件晚到时 mv -n 拒绝，均通过；PRESERVE 新裁断正确。移动目录语义/前缀回滚 B2、新归档 cp B3 仍破坏保护 |
| P2-4 原件持久归档 | PARTIAL | 正常首次收编、未跟踪原件、混合路径、9/9 原件字节、9/9 报告绑定、C2/C7 混合事务通过；清理夹具临时备份后持久归档仍在。异常路径 B1/B3 未闭合 |
| P2-5 转换器保护 | CLOSED | 九规则正例、完整归档引用、混合新旧、同输入两次、把转换后字节重新作为源再收编、边界字符及中文均通过 |
| P2-6 门/审计前缀 | CLOSED | custom-legacy/ 和活动目录 legacy/ 被拦，真归档豁免；普通三种拼写通过负例，语料裸 .specify 会回滚。大写旧根是原始基线已存在的大小写边界，见排除说明 |
| P2-7 待确认 | CLOSED | 阶段链与矩阵正文行进入清单，普通对照正文未误报，50 行和 Unicode 120 字符测试通过；真实语料 21→28，增量恰为 RoleAtlas 14–20 行 |
| S1 临时文件失败清理 | PARTIAL | 转换失败、门失败清理通过；EXIT 守卫仍漏 archive TSV，归档失败还漏 log/TSV |
| S2 文档口径 | PARTIAL | usage 已改；行为规格尚无 C11/C12/新入口与生成规则，Decision 正文第 6 条及索引仍为旧 legacy/ 描述。见建议最小范围 |
| S3 字面占位符 | CLOSED | A\\&B 字面值渲染通过，采用 Ruby block replacement |

## 三、阻塞项（合并根因）

### B1 [P1] 路径检查只覆盖语料顶层目录，未覆盖实际写入落点

合同依据：P1-2 的仓内外指纹保护、P1-3 的链接存在性、Owner 幂等不覆盖；新增归档也属于 §5 写入边界。

位置：[顶层检查](/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard-governance-corpus-worktree/scripts/bootstrap-knowledge-target.sh:1079)、[归档写入](/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard-governance-corpus-worktree/scripts/bootstrap-knowledge-target.sh:1632)、[AUDIT 叶子判定](/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard-governance-corpus-worktree/scripts/bootstrap-knowledge-target.sh:2370)、[INIT 叶子判定](/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard-governance-corpus-worktree/scripts/bootstrap-knowledge-target.sh:3297)。

三种同根因反例，均无需竞争：

1. `.sdlc/memory/sub -> <outside>`，正常源 `.specify/memory/sub/a.md` 含 `ORIGINAL .specify/memory/x`。plan/apply 均 0，外部新建 `a.md`，字节为转换后的 `ORIGINAL .sdlc/memory/x`，源被移走。
2. `.sdlc/legacy -> <outside>`，首次收编正常源。plan/apply 均 0，原文实际写到仓外 `.specify/memory/a.md`，报告却以仓内相对路径声明归档。
3. 实体 `.sdlc/memory` 下 `constitution.md -> <outside>/owner.md` 为悬空叶子。INIT、AUDIT 均 exit 0 并通过 cp 在仓外创建骨架；叶子链接仍存在。仅检查 `-e` 将已有链接当缺件。

影响：初始化/收编可越出目标仓；顶层目录安全不代表每个最终路径安全。不能用“已禁止根链接”声明关闭。

一次性修复边界：集中校验本功能的实际输出路径，包括已有祖先与叶子对象；迁移与新归档统一走包含性检查，生成的 create-if-missing 使用包含链接的存在性判定。限定 memory/coding_guide 和本轮新增原文归档，不扩成全仓安全重构。

回归矩阵：顶层/中间目录/归档祖先/叶子 × 实体/仓内链接/仓外链接/悬空链接 × adoption/LEGACY/INIT/AUDIT/routed × plan/dry/apply/门失败；同时校验链接类型、源字节和仓外指纹。

证据：`r2-new-results.json` 的 nested-dest、archive-root、leaf-True/False；复现脚本 `/tmp/d091-r2-new.py`。

### B2 [P1] 移动与回滚没有绑定实际发布对象，仍会误移源或删除后来者

合同依据：P1-3(c) 明确要求被拒绝行源不动、已移动前缀的回滚不能误删后来者。不是反对已冻结的 preflight + mv -n 取舍。

位置：[mv 与后置校验](/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard-governance-corpus-worktree/scripts/bootstrap-knowledge-target.sh:1556)、[回滚删除目标](/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard-governance-corpus-worktree/scripts/bootstrap-knowledge-target.sh:1446)。

反例 A：两源 a.md、z.md；在第二次 mv 调用前，把已经移动的 a.md 内容改成 `LATER PREFIX OWNER`，同时创建 z.md 目标 `LATER CURRENT OWNER`。第二行被 mv -n 拒绝，脚本 exit 1，但回滚无条件 rm a.md，删除后来者内容；报告为 `FAILED_ROLLED_BACK`。

反例 B：第二次 mv 前创建目标路径 z.md 为目录（带 owner.txt）。BSD `/bin/mv -n source target-directory` 返回 0，将源放入 `z.md/z.md`；源消失检查误认发布成功，MIG_MOVED=2。转换遇到 EISDIR 后回滚，原 `.specify/memory/z.md` 未恢复，报告 `FAILED_ROLLBACK_INCOMPLETE`，需要人工恢复。

独立直接验证 `/bin/mv`：普通文件碰撞返回 0 且源仍在；目录碰撞也返回 0，但源进入目录。两者不能用退出码 + 源消失唯一判定。当前主机未安装 GNU coreutils，未声称已在 GNU mv 上实跑。

一次性修复边界：发布必须验证精确落点、对象类型及本次写入对象；回滚只撤销仍由本事务拥有的发布，检测到后来者时保留其数据和备份并如实报告冲突。目录目标不能被视为成功的文件发布。保留现有工程取舍，无需将整个脚本重构成原子事务系统。

回归矩阵：首行/后续行 × 晚到普通文件/目录/链接 × 目标未变/前缀被修改或替换 × BSD/GNU 实际退出语义；源、后来者和报告三方同时断言，不能仅查恢复源 digest。

证据：r2-new-results.json 的 late-prefix、late-directory；r2-bsd-results.json。

### B3 [P1] 新原文归档通过独立 cp 写入，绕过防覆盖与失败对象登记

合同依据：P2-4 的事务内归档和冲突保护、P1-3 的后来者不覆盖、报告不得虚报回滚。

位置：[归档 cp 及成功后登记](/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard-governance-corpus-worktree/scripts/bootstrap-knowledge-target.sh:1633)。

反例 A：在归档不存在检查之后、cp 之前创建 `LATER ARCHIVE OWNER`。普通 `cp -p` 将它覆盖成 `ORIGINAL A`，脚本 exit 0。移动步骤的 mv -n 保护没有覆盖这个新增持久写入口。

反例 B：模拟归档 cp 写入 `PARTIAL ARCHIVE` 后返回 1。由于 MIG_ARCHIVE_CREATED 在 cp 成功后才登记，当前半文件不在清理集合，最终仍留在 `.sdlc/legacy/.specify/memory/a.md`；源恢复但报告 `FAILED_ROLLED_BACK`。再次收编会因这个不同归档被计划阻塞。

一次性修复边界：将原文归档纳入统一的无覆盖发布和所有权登记；部分写失败只清理已证明本次创建的对象；历史/后来者不删；回滚完整性包含新增持久归档而不只包括源文件。归档失败同时走一致的临时日志清理路径。

回归矩阵：归档 absent/same/different/link × 计划后/写前晚到 × 首归档/后续归档 × cp 零写失败/部分写失败/成功 × 转换失败/门失败；验证历史字节、当前半文件、已归档前缀、报告与重试结果。

证据：r2-new-results.json 的 archive-cp-False（覆盖）/archive-cp-True（半文件和假完整回滚）。cp 包装器只注入指定临时路径，未修改产品脚本。

### B4 [P2] 空收编集合在 Bash 3.2 下崩溃，且错误返回 0

合同依据：Owner 幂等、不遗漏缺失生成；R2 明确要求 set -u 失败路径、无语料成功迁移和“无语料行但目的地不安全仍阻塞”。

位置：[空数组遍历](/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard-governance-corpus-worktree/scripts/bootstrap-knowledge-target.sh:1137)。

当前 `/bin/bash` 为 3.2.57。EXISTING 仓没有两个旧语料目录时，LEGACY_ROOTS=()，裸 `${LEGACY_ROOTS[@]}` 在 set -u 下报错。对以下三种夹具各跑 --plan 和 --apply，共六次均复现：

- 没有旧语料的已初始化仓；
- 已成功收编、源目录被 prune 后，重复带 --adopt-governance-corpus；
- 没有旧语料且 `.sdlc/memory` 是不安全链接。

全部只有 `LEGACY_ROOTS[@]: unbound variable`（Bash 报在复合语句末尾 line 1682），exit code 却为 0。没有正常 PLAN_SHA/报告，且第三类未执行承诺的目的地 C10 阻塞。

归因：数组循环本身是已有代码，但 D091 的受限 adoption 入口使空集合成为正常且高频输入；因此属于 `9e6e0c7..f3faac8` 本任务交付范围，不是 D087 或通用 Bash 加固。

一次性修复边界：支持空数组的遍历写法，完整执行零语料分支及目的地检查；保证异常不冒充 exit 0。不要简单在空集合提前成功而跳过安全检查/补缺/报告。

回归矩阵：无 .specify/仅排除文件/收编后 prune/存在空目录 × 安全/不安全目的地 × plan/dry/apply/re-run；macOS Bash 3.2 必跑；断言输出语义和实际动作，不能只 assert_exit 0。

证据：r2-empty-results.json，复现 `/tmp/d091-r2-empty.py`。

### B5 [P2] 非普通语料在枚举阶段被过滤，无法进入承诺的 C10 分类

合同依据：R2 P1-2(c) 明确写明“非普通文件一律 C10 阻塞”；规格 §5 不允许静默跳过不安全条目。

位置：[find 过滤器](/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard-governance-corpus-worktree/scripts/bootstrap-knowledge-target.sh:1174)、[后续普通文件守卫](/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard-governance-corpus-worktree/scripts/bootstrap-knowledge-target.sh:1230)。

分别创建 `.specify/memory/data.pipe`（FIFO）和 `sock`（Unix socket），--adopt-governance-corpus --plan 都输出 `ADD_ONLY=true, BLOCKED=0, FILES:` 空列表，exit 0。原因是 find 只枚举 -type f/-type l，后续非普通文件判断根本没有机会看到这些条目。

一次性修复边界：先枚举语料树的全部相关非目录条目并按类型分类，非普通对象不做内容读取/digest/转换，直接 C10；正常目录用于遍历，不当成语料文件。不要扩大到 project-context 等排除对象。

回归矩阵：regular/symlink/dangling/FIFO/socket × 单独存在/与正常文件混合 × adoption/LEGACY × plan/apply；非法条目必须可定位、零移动、不会因读取 FIFO 挂起。不可读子目录的 find 错误已独立验证为 exit 1，不能替代类型枚举覆盖。

证据：r2-new-results.json 的 fifo；r2-matrix-results.json 的 socket/find-partial。

## 四、建议项与已裁决边界

- **S1 PARTIAL，非单独阻塞**：转换失败的 corpus-log/archive TSV 清理已通过；EXIT 守卫只删 log，`rollback-audit-template` 留下 corpus-archive TSV；归档 cp 失败同时留 log/TSV。将新增两类临时文件纳入统一退出清理。既有成功路径备份/staging 与 GATE_OUT 泄漏不另开阻塞。
- **S2 PARTIAL，非单独阻塞**：最小文档修订是追加 C11/C12、adoption/生成/防占位、完整前缀、已有原文归档时 PRESERVE，并同步 usage/AUDIT 写入说明及索引。Decision-091 是授权依据，因此不要求为此重新设计/审批旧 v3 合同；但文本不应继续宣称只有机器件写入。没有 TS 变更，不要求 tsc/npm test。
- **S3 CLOSED**：字面替换通过。
- **S4 非阻塞，P1-1 的报告尾项**：AUDIT 的三类 skip 只 echo，正式报告没有 Notices，也没有语料跳过条目；24 格矩阵中四类 AUDIT apply 都复现。INIT/routed 则能持久记录。补齐 AUDIT 正式报告中的 skipped 相对路径和原因；不是要求把当前允许跳过改为全局失败。
- 场景 66 的祖先链接夹具初始化失败：测试日志确有 `mv ...t66/.specify ... No such file or directory`，后面实际测成悬空根，而非声称的真实祖先越界。独立 ancestor-escape 探针已证明当前实现能阻塞真实祖先越界；测试夹具需修好，但不重复上报已关闭的产品缺陷。
- 大写 `.SPECIFY/memory/a.md` 在语料中能原样通过；裸 `.specify` 会触发门并回滚。对比 `9e6e0c7` 的两扫描器，`.specify` 原本就是大小写敏感，R2 没有放宽；按本轮“既有问题不升格”的边界记录验证限制，不将它列成本轮新阻塞，也不声称门已大小写全覆盖。
- 接受 C11/C12、精确归档前缀、机械映射 + verbatim/pending、LEGACY 自动与 EXISTING 显式入口、冗余源 PRESERVE、不安全目的地无语料也阻塞、骨架中立等冻结取舍。本报告的问题均来自这些约定之内的可复现行为。

## 五、验证证据与边界

- bash -n 成功；完整原回归 **668 passed / 0 failed**，exit 0；[日志](/tmp/d091-r2-regression.log)。场景 36–51 原语义回归通过；套件绿色未覆盖上述交错与特殊对象。
- R1 原反例按原脚本在全新 `/tmp/d091-r2-review` 夹具复跑：results.json、results-more.json、final-probe-results.json。
- 30 个独立类型/标志组合；另外 19 项正向/负向检查均通过，覆盖 fresh、AUDIT 补缺与人工保留、routed 两次文档与语料 digest 稳定、九规则、Unicode、门回滚、真实仓只读等。
- INIT/AUDIT/routed × 旧普通源/悬空源/缺模板/不安全根 × dry/apply 共 24 格。初版 routed 缺模板夹具误将整个标准模板包设为空，因 L4 缺失 exit 2；已改为保留 L4、只缺语料模板重测，dry/apply 均 exit 0 并正确跳过。该夹具纠正不算产品缺陷。
- LEGACY C2+C7+C11+C12 混合迁移成功，四项原文归档字节均一致；相同目标与 absent/same/different/dangling 归档矩阵符合 RETIRE/PRESERVE/BLOCKED 裁断。
- logistics-center 真实 9 文件隔离复制：收编 9、原文归档 9、original_archive 绑定 9，全部原文 digest 相同；pending 28，新增精确为 `.sdlc/memory/RoleAtlas.md:14–20`；清理该夹具临时备份后持久归档仍完整。
- logistics-center 只读 adoption plan、logistics-master dry-run：目标文件指纹前后相同。未执行任何真实业务仓 apply。
- 当前主机实际运行的是 macOS `/bin/bash` 3.2.57 与 BSD `/bin/mv`。GNU mv 未安装，没有冒充跨平台实测；已有 BSD 数据破坏反例足以判 FAIL，修复回归应补 GNU 环境。
- 本轮未推送，无远端 CI；未运行 TS 检查，因为主审和全范围 diff 均无 TS 文件。

证据文件索引：

- [新增边界探针结果](/tmp/d091-r2-review/r2-new-results.json)，[脚本](/tmp/d091-r2-new.py)
- [跳过/归档/枚举矩阵](/tmp/d091-r2-review/r2-matrix-results.json)，[脚本](/tmp/d091-r2-matrix.py)
- [空收编与重复运行](/tmp/d091-r2-review/r2-empty-results.json)，[脚本](/tmp/d091-r2-empty.py)
- [正向与真实仓只读检查](/tmp/d091-r2-review/coverage-results.json)
- [标志组合与普通晚到目标](/tmp/d091-r2-review/flags-race-results.json)
- [BSD mv 与持久归档清理后验证](/tmp/d091-r2-review/r2-bsd-results.json)

证据保留于临时目录，复跑应使用新的 D091_REVIEW_ROOT，避免夹具同名冲突。源码脚本由绝对路径读取，不需要改被审代码。

## 六、不属于本次任务

D087 runtime/gateway/finding/recovery；四个业务仓正式执行及 routed 收口；wms-portal 域拆分；logistics-center 重号；wms-monitor 旧映射转 confirmed；project-context/business-domain-bootstrap 扩展收编；全局 Skill 安装；push、合并、Control Plane 登记；C05 验收。

应先一次性修复 B1–B5 并复跑指定负例，再提交独立复审。本轮不构成 PASS、收口、发布或四仓正式执行授权。
