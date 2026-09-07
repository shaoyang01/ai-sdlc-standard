# Decision-091：治理语料（memory/coding_guide）收编与生成——知识目标初始化器 v3.1

## 状态

Accepted / 2026-09-07 由 Owner 直接授权实施（"存量兼并吸收 + 缺失生成"两条需求均已明确）。
独立复审四轮：D091-R1 FAIL（7 阻塞）→ R2 修复（626→668）；D091-R2 FAIL（5 合并根因
阻塞 B1-B5）→ R3 修复（668→714，B4/B5 获复审 CLOSED）；D091-R3 FAIL（3 组合并根因
阻塞 F1-F3）→ R4 修复（714→778，F3/S1/S4 获复审 CLOSED）；**D091-R4 FAIL（1 项 P2
阻塞 B1：转换器在目的地写入成功后于收执前失败时（规则日志追加等），调用方因 errexit
未登记所有权——自有转换产物被错报为后来者冲突、残留未撤而报告称完整回滚）→ R5 修复
轮已按复审给定修复边界关闭（转换回执前置 + 调用方不吞错捕获 + 凭回执独立于退出码登记
所有权 + 回执缺失的未决残留如实降级 INCOMPLETE；回归 800 passed 0 failed，双 bash 3.2
全量，2026-09-08）**；等待 D091-R5 复审确认。
本决策正式收掉 Decision-089 中"存量迁移单独授权……不混入本次实施"的推迟项。

## 背景

D-088-01 v3 迁移把 `.specify/` 下的文件按 C1-C10 分类处置：business_domain 搬迁转换（C1）、
机器 YAML 归档合并（C2）、templates/scripts/workflow/specs/reports 退役归档（C3-C7），
而 `.specify/memory/`（6 份项目治理文档）与 `.specify/coding_guide/`（编码指南）落入兜底
C8 "原地保留"。实测三个业务仓（logistics-center、wms-monitor、wms-portal 的 project-context）
初始化完成后，这些内容仍留在旧根，新 `.sdlc` 面孔没有对应物；同时全新代码库
（从未有过旧版 speckit/sdlc-* 流程的仓）初始化时也不会生成同类内容。
Decision-089 背景节已记录：markdown 治理规则曾被三份机器可读 YAML 取代，"单轨世界没有继承"。

## 问题

1. 已初始化仓的治理语料滞留旧根，新面孔的治理文档图景不完整，且 `.sdlc/memory/**`、
   `.sdlc/coding_guide/**` 两个路径在现役合同中已有边界定义（见 `ai-sdlc/shared-business-domain-governance.md`、
   `ai-sdlc/standard-package-resolution.md`）却无对应实体。
2. 全新仓初始化不生成治理/编码规范骨架，Owner 缺少结构化的待填起点。
3. 已完成迁移的仓 `LEGACY_ACTIVE=false`（D2 精化/R16 幂等），重跑不再进入 LEGACY 迁移分支，
   C8 遗留语料缺少显式收编入口。

## 决策

1. **收编（存量）**：迁移分类扩展 C11（`.specify/memory/*` → `.sdlc/memory/*`）与
   C12（`.specify/coding_guide/*` → `.sdlc/coding_guide/*`），动词 TRANSFORM。内容经
   **确定性路径/词汇转换**（9 条有序规则：audit wrapper 路径、business_domain/memory/coding_guide
   根、workflow/templates → `.sdlc/legacy/.specify/…`、specs → `.sdlc/legacy/specs/`、
   `$speckit-sync` → `$sdlc-knowledge-sync`、残余 `.specify/` → `.sdlc/`（`legacy/` 前缀负向断言保护））
   后并入新面孔；每次替换按规则序号计数写入迁移报告 `corpus_transformations` 溯源节。
   转换不可判定的段落（SDD 流程链、Sync 顺序链、RoleAtlas 类角色矩阵）原文保留，逐行列入
   报告 `pending_confirmation` 节交 Owner 裁决，不静默删除或提升为现役规则。
2. **生成（缺失）**：INIT 与 AUDIT 的 create-if-missing 集合新增 7 份语料骨架
   （memory 6 份 + `coding_guide/CodingGuide.md` 索引），模板位于标准包
   `templates/governance-corpus/`。骨架只含章节结构、现役标准引用（AGENTS.md、
   `${AI_SDLC_STANDARD_HOME}`、sdlc-* skills、`.sdlc/**`）与 `pending-owner-confirmation`
   待填槽；不虚构业务事实/负责人，不预设技术栈（不默认 Java/Spring），零退役词汇（回归扫描）。
3. **防占位**：旧语料源存在且未收编时，同名骨架不得生成（避免占用收编目的地制造冲突）；
   AUDIT 补缺与 INIT 生成共用该守卫。
4. **显式入口**：新增 `--adopt-governance-corpus`，供已完成迁移（EXISTING* 型）的仓收编遗留语料；
   受限 walk 仅覆盖两个语料目录，复用既有 PLAN_SHA/DP1 确认、两阶段事务、失败回滚与双报告机制。
   与 `--domain-map` 互斥（exit 2）。不开标志时 C8 行为逐字节兼容。
5. **同名冲突确定性**：目的地已存在时，转换后逐字节一致 → 源归档 `.sdlc/legacy/.specify/…`
   （RETIRE 行，"already adopted"）；不一致 → COLLISION 阻塞（fail-closed，源与目的地均不动）。
6. **残留门精确化**：门与审计扫描的 `.specify` 模式加 `(?<!\.sdlc\/legacy\/)` 完整归档
   前缀负向断言——指向归档地址（`.sdlc/legacy/.specify/…`）的引用是归档自身的路径，
   不是活旧根引用；其余任何 `legacy/` 目录段照常触发。
   这是路径精确化，不是目录豁免；收编内容与其他活跃面同门、同回滚。

## 原因

- 转换而非模板替换：Owner 明确要求保留有效项目内容（工程约束、编码规范及其来源），
  通用模板不得覆盖已有文档；确定性 token 映射是唯一能同时满足"保真"与"过残留门"的机械规则。
- 门精确化而非目录豁免：任务边界要求不得以全目录豁免代替内容处理；转换后的语料与其他
  活跃内容接受同一门禁，仅归档地址引用按语义排除。
- 回滚正确性：语料行"移动后原位转换"，回滚路径改为"从备份恢复源原始字节 + 删除转换后目的地"，
  使既有 `cmp` 完整性校验在转换场景下依然成立。
- 防占位先于冲突处理：先占位会把确定性收编变成冲突裁决，无谓消耗 Owner 注意力。

## 影响

- 脚本：`scripts/bootstrap-knowledge-target.sh`（分类/转换器/生成/收编入口/回滚分流/报告溯源）；
  新增 `templates/governance-corpus/` 7 份模板；测试矩阵 557 → 626 断言。
- 合同边界不变：`.sdlc/memory/**`、`.sdlc/coding_guide/**` 仍不是 business_domain 事实源/写目标
  （shared-business-domain-governance），不是标准包解析源（standard-package-resolution），
  不是新内容的生成源（speckit-generation-source-model）。语料的效力是项目治理参考，
  跨项目权威仍在标准包。
- 待确认清单是常设交付物：每次收编报告列出 retired-era 标记行，Owner 可随时裁决更新，
  初始化器不代行语义改写。
- 已知边界：仅含语料的旧根同样触发 S5（LEGACY_SDD 走正常收编）；纯 `project-context/`
  扩展收编不在本轮（Owner 明确排除）。

## 实现状态

- 已实现并回归通过（2026-09-07，worktree `ai-sdlc-standard-governance-corpus-worktree`，
  分支 `codex/d088-governance-corpus`，基线 9e6e0c7）：首轮回归 626 passed 0 failed
  （场景 52-64）。
- **D091-R1 复审 FAIL（7 阻塞）→ R2 修复轮（2026-09-07，全部关闭）**：
  1. INIT 跳过骨架不再进入计划/执行（CORPUS_SKIPPED_RELS 贯通 staging/PAIR/执行，
     消除半途 cp 失败的部分初始化）；
  2. 路径包容性硬化：walk 根一律 realpath 包含性校验（覆盖祖先符号链接）+ 可读性检查、
     find 遍历错误升级为计划级阻塞、语料源仅接受普通文件（链接一律 C10）、语料目的地根
     （.sdlc/memory、.sdlc/coding_guide）符号链接/越界在 adoption 与 LEGACY 计划级阻塞、
     生成路径跳过并提示；
  3. 最终落点冲突保护：目的地存在性含悬空链接（-L）、RETIRE 归档重定向独立冲突检查
     （一致→源归档；归档已有不同内容→计划级阻塞）、发布前全量复验 + `mv -n` + 源残留
     后置校验（后来者数据不被覆盖、不被回滚误删）；
  4. 首次收编的原始字节在事务窗口内持久归档至 `.sdlc/legacy/.specify/…`（冲突保护、
     失败回滚清理），报告逐文件绑定 `original_archive`；
  5. 转换器规则 1-6/9 加 `(?<!\.sdlc\/legacy\/)` 完整前缀负向断言，归档地址不再被重映射
     （修复 `.sdlc/legacy/.specify/memory/x` → `.sdlc/legacy/.sdlc/memory/x` 损坏）；
  6. 门与审计扫描的 `.specify` 豁免收紧为完整归档前缀（仅 `.sdlc/legacy/.specify/**`
     归档地址引用豁免；`.sdlc/business_domain/legacy/.specify/*` 等其余任何
     `legacy/` 目录段照常触发）；
  7. pending_confirmation 补齐阶段链（两个阶段词 + 箭头）与角色矩阵表行（阶段词首列）
     两类上下文，精确行号；
  附带：S1 转换日志失败路径清理、S2 usage 文本同步、S3 模板占位符块替换（字面值）。
  回归 668 passed 0 failed（新增场景 65-72 对应 R1 各阻塞项矩阵）；真实语料重放
  9/9 收编 + 9/9 原件归档 + 28 行待确认。
- 真实仓只读预演与正式收编执行留给 Owner 审阅后进行（logistics-master 补生成、
  logistics-center/wms-monitor 收编）。
- **D091-R3 复审 FAIL（3 组 P1 合并根因 F1-F3）→ R4 修复轮（2026-09-07，按复审给定
  修复边界一次性关闭）**：
  1. F1 路径守卫补全：RETIRE 行的最终落点（归档地址）纳入计划级与 apply 复验的逐组件
     symlink 检查（含仓外/仓内/悬空链接变体）；`corpus_output_path_unsafe` 增加 `.sdlc`
     根本体检查，`CORPUS_DEST_BLOCKED` 覆盖 `.sdlc` 为链接/非目录（INIT/AUDIT 跳过生成
     并入报告，adoption 计划级阻塞）；
  2. F2 所有权登记窗口关闭：转换后期望摘要改由 transformer 在内存中对**本次写入字节**
     计算并返回（`total\tsha256`），不再重新读取可能被接管的目的地；回滚比较不匹配时
     后来者保留、源恢复、冲突入报告（新增 KT_TEST_TRANSFORM_PAUSE_FILE 测试钩子）；
  3. F3 归档生命周期统一：复用前当场以备份字节验证（计划快照过期不静默复用）；暂存文件
     noclobber 独占创建（占用对象永不截断/跟随/发布），清理登记在独占创建成功之后；
     发布后目录检测 + 所有权证明后才撤销嵌套暂存；`MIG_ARCHIVE_CREATED` 携带已验证
     digest，三处失败清理改为 `mig_archive_remove_owned` 所有权校验（后来者归档保留
     并记 `rollback.ownership_conflicts`）；
  4. S2 补全：本决策第 6 条与 README 索引改为完整归档前缀表述（并清除重复残留）；
     S4 补全：AUDIT 的旧源存在/模板缺失跳过写入正式报告。
  回归 714 → 778 passed 0 failed（场景 80-88 对应 F1/F2/F3 三条矩阵关键格）；
  复审方 R3 反例脚本（retire-escape、sdlc-root、late-before-stage、temp-owner×2、
  archive×5、post-transform-owner）与边界矩阵（32 非普通条目、24 空集合、6 所有权）
  在修复后代码上全部复跑为安全结果；真实仓只读预演零写入。
- **D091-R4 复审 FAIL（1 项 P2 阻塞 B1）→ R5 修复轮（2026-09-08，按复审给定修复边界
  关闭，限定在转换回执、失败结果捕获、所有权登记与回滚判定）**：
  1. B1 根因：transformer 的回执（`total\tsha256`）原在规则日志追加之后输出——写盘成功
     后日志追加失败时 ruby 以非零退出且无回执；调用方 `set -e` 下命令替换赋值直接进入
     EXIT 回滚，所有权未登记，自有转换产物被错报为后来者冲突、残留未撤而报告称
     FAILED_ROLLED_BACK。复审方复现器仅将临时规则日志置只读，4/4 组合（adoption/LEGACY
     × memory/coding_guide）复现；
  2. 修复：回执在目的地写入成功后**立即**输出（`STDOUT.flush`），规则日志追加改入
     begin/rescue（失败告警并退出）；调用方以 `|| rc=$?` 使失败捕获脱离 errexit 路径，
     **凭回执独立于退出码先行登记所有权**，再判定成败——写后失败经回滚按自有对象撤销，
     报告保持如实的 FAILED_ROLLED_BACK 且冲突清单为空；不重采样可变目的地、不无条件删除；
  3. 回执缺失或不可信（部分写/输出污染）时，目的地列入未决残留集合：回滚保留该对象，
     可证明原始字节完好则完整回滚，否则失败报告如实降级 FAILED_ROLLBACK_INCOMPLETE
     并注明「recovery not provably complete」（新增 `MIG_CORPUS_TRANSFORM_UNRESOLVED` /
     `MIG_UNRESOLVED_RESIDUE`，三处回滚状态计算点统一覆盖）；
  4. S2 残留清理（复审非阻塞项）：行为规格页首 Version 字段 1.2.0 → 1.4.0；R2 注记
     第 6 项「照常触发，正确触发）；」合并句清除；AUDIT 报告 Write Boundary 声明更正为
     「补缺失机器件与语料骨架（create-if-missing）；既有对象一律不改写（含悬空链接叶子）」；
     场景 81 补 else 断言（消除条件不成立时的静默跳过）；
  5. 已知边界（复审列为非阻塞基线，据实记录）：`.sdlc` 根为普通文件（非目录）时，
     INIT 仍经既有机器件 mkdir 路径报错退出——零写入、不产生语料 skip 报告；不扩
     机器件写保护（维持 R3 范围裁断）。
  回归 778 → 800 passed 0 failed（场景 89：写后失败凭回执自有回滚；场景 90：回执
  缺失/污染 × garble/empty → 保留 + INCOMPLETE）；复审方 B1 复现器在修复后代码上
  原样断言点失效，四组合（adoption/LEGACY × memory/coding_guide）按固定语义改造版
  全部闭合（`evidence/r5-b1-closure-*`）；R3 反例套件 11/11 复跑安全
  （`evidence/r5-r3probe-rerun.json`）。
- 独立复审：D091-R4 复审 FAIL 已修复，等待 D091-R5 复审确认；本文件不自证通过。

## 依据

- Decision-088（初始化器优先权）、Decision-089（知识治理 v2，欠账出处）、
  Decision-090（G1-R1..R4 修复轮与 v3 规格基线）。
- Owner 任务书（2026-09-07）：存量兼并吸收 + 缺失生成 + 幂等不覆盖三条硬要求。
- 实测事实：logistics-center/wms-monitor memory+coding_guide 内容自引用旧根与
  retired 命令（原 9 文件行级清单见任务书附件）；`ai-sdlc/shared-business-domain-governance.md:52`、
  `ai-sdlc/standard-package-resolution.md:27` 已预定义 `.sdlc/memory|coding_guide` 边界。
