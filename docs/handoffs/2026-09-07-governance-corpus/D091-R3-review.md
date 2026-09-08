# D091-R3 独立复审：FAIL

对象：`f3faac8..eb4bb23`，必要时抽查 `9e6e0c7..eb4bb23`。
精确 HEAD：`eb4bb23e40c4ffb353dbea65e15e7c906d7ff447`。
工作区：`/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard-governance-corpus-worktree`。
本次只读审查产品代码，复现夹具/包装器/报告均在 `/tmp`；未改代码、未提交/推送、未使用 DocFlow、未操作 D087 主工作区。Control Plane STATE 已读取，其 D087 状态不用于推导本次范围外授权。

**判定：FAIL，剩余 3 组 P1 阻塞根因，分别对应 R2 的 B1、B2、B3；B4、B5 CLOSED。** 下述每组将同一修复入口的变体合并，避免把时序或路径变体拆成多轮发现。

## 1. 合同、不变量与公开路径失效模式

依据：Owner 三项硬要求、Decision-091 六项决策、行为规格 v1.2.0 附录，以及 R3 任务书明确的关闭矩阵和冻结取舍。

| 不变量 | 必须成立的行为 |
| --- | --- |
| I1 范围/只读 | detect/plan/dry-run 不改目标；adoption 只收编两类语料；域文档、排除对象和仓外内容不受扰动 |
| I2 路径安全 | 本功能写入路径从 `.sdlc` 根至叶子均受检查；首次 TRANSFORM 与相同内容 RETIRE 均受保护；生成不写穿链接 |
| I3 所有权 | 备份源字节/本次转换所得字节才是回滚依据；后来者内容不得被误登记为本事务输出并被删除 |
| I4 原文归档 | original_archive 必须指向源原始字节；暂存文件确为自有对象；历史/后来者归档不覆盖、不误删 |
| I5 事务/报告 | 失败停止后续动作；源恢复、归档清理、冲突清单和状态与实际一致；无自有半文件泄漏 |
| I6 空集合/枚举 | Bash 3.2 下空集合和重复收编正常完成；无语料时仍检查不安全根；语料非普通条目 C10、不读取特殊对象 |
| I7 转换/生成/待确认 | 九规则确定且幂等、真归档前缀保留；缺失才生成、防占位；待确认逐行可定位；AUDIT 跳过原因持久可见 |

| 公开路径 | 非法输入、状态漂移或并发交错 | 预期结果及本次验证 |
| --- | --- | --- |
| 参数/detect | 非法参数、互斥 flag、非法 map | 参数错误 exit 2；detect 只读。沿用完整套件及独立标志矩阵 |
| plan/dry-run | 非普通源、不可读根/子目录、链接组件、同名不同目标 | C10/COLLISION exit 1；合法计划 exit 0 + PLAN_SHA，零写入。B4/B5 和原 B1 反例通过，B1 的 RETIRE 分支仍漏检 |
| adoption/LEGACY apply | 缺确认、源/目标漂移 | DP1 拒绝 exit 1，零部分迁移；正常收编成功。真实语料、C2/C7 混合路径通过 |
| move/rollback | 晚到文件/目录/链接，已移动目标被修改或删除 | 拒绝并恢复源，保留后来者，失败报告列 ownership_conflicts。原 B2 及 C1/C7 矩阵通过；转换后摘要登记窗口仍失败 |
| archive staging/publish | 暂存冲突、部分 cp、不同归档晚到、归档目录晚到、已发布归档被接管 | 不覆盖、不误复用、不误删；失败清理本次暂存。中间发布窗口通过，生命周期其他入口仍失败（B3） |
| INIT/AUDIT/routed | 旧源/悬空源存在、缺模板、目的地不安全 | 跳过同名骨架、保留对象并提示；正常生成与 routed digest 稳定通过。`.sdlc` 根本身链接仍可绕过；S4 仅部分提示持久化 |
| converter/gate/finalize | 无效 UTF-8、残留门拒绝、报告/模板错误 | exit 1 + 回滚；正常九规则/归档前缀/Unicode/pending 保持；EXIT、门、转换失败常规清理通过 |

特别边界：接受 preflight + mv -n + 备份字节模型；接受“移动之后、原位转换之前”的晚到写入可能被转换覆盖。B2 反例发生在**转换进程已经成功结束之后**，不在该冻结残余之内。

## 2. R2 逐项关闭状态

| 项目 | 判定 | 证据与剩余边界 |
| --- | --- | --- |
| B1 输出路径安全 | PARTIAL | 原嵌套 sub 链接、首次归档根链接、INIT/AUDIT 悬空叶子反例已关闭；RETIRE 分支不调用守卫，且 helper 跳过 `.sdlc` 自身，见 F1 |
| B2 移动/回滚所有权 | PARTIAL | 原晚到前缀内容保留、目录嵌套移动撤销、源恢复、JSON/MD 冲突清单通过；普通行目标消失也恢复并记录。语料转换后仍从可变目的地采样登记摘要，见 F2 |
| B3 原件归档发布 | PARTIAL | 部分 cp 写入局限在暂存并清理；暂存后/最终 mv 前的不同归档晚到均被保护。暂存前复用、暂存所有权和归档清理未闭合，见 F3 |
| B4 Bash 3.2 空集合 | CLOSED | 无 `.specify`、仅排除对象、空目录、prune 后重复；安全/不安全目的地；plan/dry/apply/re-run 语义全部通过，无 unbound |
| B5 非普通条目 | CLOSED | adoption/LEGACY × 链接/悬空/FIFO/socket × 单独/混合 × plan/apply 共 32 次均 exit 1、C10/明确安全理由、对象指纹不变，无挂起；非语料特殊对象不扩枚举 |
| S1 新增临时文件清理 | PARTIAL | 正常成功、常规转换/门/EXIT/部分暂存失败的 log、archive TSV 已清理；晚到归档目录仍造成嵌套 tmp 泄漏，归入 F3 |
| S2 文档对齐 | PARTIAL | v1.2.0 六条附录已增加；实际 Decision 第 6 条和 README 仍为旧 `legacy/` 豁免，修改的是“实现状态”的第 6 项而非决策正文 |
| S4 AUDIT skip 持久化 | PARTIAL | 链接/不安全根场景有 Item/Reason 表；旧源存在、悬空源存在、模板缺失仍只 echo，不进入正式报告 |

R1 已关闭的九规则幂等、完整归档前缀、28 行 pending、S3 字面替换均未发现回归。

## 3. 阻塞项

### F1 [P1] 路径守卫没有覆盖所有语料归档分支，且遗漏 `.sdlc` 根本身

合同依据：R3 B1(a) 明确从 `.sdlc` 根至叶子，B1(b) 明确 C11/C12 目的地和原文归档逐行校验；Owner 限定仓内收编/生成。

位置：[RETIRE 分支](reviewed-source/scripts/bootstrap-knowledge-target.sh#L1411)、[helper 起点](reviewed-source/scripts/bootstrap-knowledge-target.sh#L899)。

**反例 1，非竞争：** 已有 `.sdlc/memory/a.md` 与源转换后的字节一致，`.sdlc/legacy -> <outside>`，归档文件尚不存在。plan 生成 C11 RETIRE，plan/apply 均 exit 0；源被移出，原文字节实际出现在仓外 `.specify/memory/a.md`。当前守卫只在“活动目的地不存在”分支执行；RETIRE 目标又不属于后续转换循环的 memory/coding_guide 前缀，因此两层都绕过。

**反例 2，非竞争：** `.sdlc` 自身链接到仓外已有业务文档目录，而 memory/coding_guide 尚不存在。AUDIT exit 0，在仓外生成 6 份 memory 和 1 份 CodingGuide 骨架。helper 先 `cur=sdlc`，再拼下一级才调用 File.symlink?；顶部 CORPUS_DEST_BLOCKED 又只在语料根已存在时检查其 realpath，因此无一处检查 `.sdlc` 链接本体。本次仅将新增语料写穿认定为问题，不扩审既有机器件写入。

影响：正常首次收编的保护不能证明“相同内容收编”和“缺失生成”的仓内边界；无需构造微秒级竞态即可越界写入。

一次性修复边界：对全部 C11/C12 行的**最终落点**统一做计划及执行检查，涵盖 TRANSFORM/RETIRE；helper 检查 `.sdlc` 自身。维持 PRESERVE 新裁断，不引入全仓路径重构或扩大输入范围。

回归矩阵：首次 TRANSFORM/相同内容 RETIRE/已有一致归档 PRESERVE × `.sdlc` 根/活动中间目录/归档祖先/叶子 × 实体/仓内链接/仓外链接/悬空 × plan/apply/INIT/AUDIT/routed；断言仓外指纹、源和链接类型，不仅检查 C10 文案。

证据：[r3-new-results.json](evidence/r3/r3-new-results.json) 的 `retire-escape`、`sdlc-root`；[复现脚本](reproduction/original/d091-r3-new.py)。

### F2 [P1] 转换后的所有权摘要仍从可变目标采样，能把后来者登记为本事务对象

合同依据：R3 B2(a/b) 要求普通行与语料行所有权分支正确，后来的目的地内容回滚时原样保留；并非要求取消已接受的原位转换。

位置：[转换后摘要登记](reviewed-source/scripts/bootstrap-knowledge-target.sh#L1824)、[回滚所有权判断](reviewed-source/scripts/bootstrap-knowledge-target.sh#L1552)。

最小交错：

1. 两个语料源：a.md 有可转换旧路径；z.md 含无效 UTF-8，作为后续确定失败点。
2. a.md 转换 Ruby **成功退出之后**，在 shell 调用 `mig_digest(dst)` 前，将目标写成 `LATER POST-TRANSFORM OWNER`。
3. 第 1824 行读取这个后来者内容并登记为转换后摘要。
4. z.md 转换失败触发回滚；a.md 的当前摘要等于错误登记的 td，被认定 owned 并删除。

实测：exit 1；后来者 a.md 不存在；源恢复；失败报告 `FAILED_ROLLED_BACK`，`ownership_conflicts=[]`。包装器仅在临时夹具指定目标的真实 Ruby 转换成功返回后写入，其他 Ruby 调用全部透传。

为什么属于本轮：已冻结残余为“移动与原位转换之间”；本反例在转换完成之后，损害来自**所有权登记和回滚删除**，正是 B2 的承诺范围。备份 rel 已解决普通 move 的登记窗口，但没有解决转换后摘要的同类窗口。

一次性修复边界：转换后期望摘要来自本次实际生成的字节/受控转换结果，而非重新读取可能被接管的目的地；保留备份字节模型，回滚比较不匹配时保留后来者、恢复源、记录冲突。无需改成全局锁或全原子事务。

回归矩阵：普通 move/完成转换的语料 × 登记前/登记后后来者修改、替换、删除 × 后续移动失败/转换失败/门失败；同时断言源原文、后来者内容、冲突清单，包含多语料行查找。

证据：r3-new-results.json 的 `post-transform-owner`；夹具日志 `/tmp/d091-r3-review/r3-post-transform-owner-1.log`；复现脚本中的 `r3-ruby-shim`。

### F3 [P1] 归档只保护了中间发布窗口，入口复用、暂存所有权和撤销仍不受统一保护

合同依据：R3 B3(a/b/c) 的原文保真、晚到所有者保护、部分写清理；Owner 幂等不覆盖；附录第 1/5 条及失败报告真实性。

位置：[暂存名及 cp](reviewed-source/scripts/bootstrap-knowledge-target.sh#L1785)、[已有归档直接复用](reviewed-source/scripts/bootstrap-knowledge-target.sh#L1815)、[归档无条件清理](reviewed-source/scripts/bootstrap-knowledge-target.sh#L1670)。

同一新增归档生命周期的四个变体：

| 时点/对象 | 独立反例 | 实际结果 |
| --- | --- | --- |
| 内部计划结束、移动后、暂存前 | 用暂停钩子创建不同内容 `LATER ARCHIVE OWNER` | 第 1815 行认为“计划已保证一致”，直接复用；exit 0、COMPLETED、original_archive 绑定的却不是源原文 |
| 暂存对象已存在 | 暂停后在 `a.md.tmp.<apply-pid>` 放已有普通文件或指向仓外文件的链接 | cp 未独占创建，覆盖已有普通文件；链接变体把仓外 `EXTERNAL OWNER` 改为 `ORIGINAL A`，并把该链接发布成正式归档，exit 0 |
| 首归档完成，后续归档失败 | 将已归档 a.md 改为 `LATER PREFIX ARCHIVE OWNER`，令 z.md 暂存 cp 部分写后失败 | MIG_ARCHIVE_CREATED 按路径无条件 rm，删除后来者归档；报告完整回滚且无 ownership_conflicts |
| 最终归档 mv 前目标变成目录 | 创建 `a.md/owner.txt` 后执行实际 BSD mv -n | 暂存被移入目录 `a.md/a.md.tmp.<pid>`；校验失败后源恢复，但嵌套 tmp 留下，报告仍完整回滚 |

前两项不依赖猜测：暂停钩子发生于内部计划和源备份/移动之后，复现器读取实际 apply PID 构建暂存落点；这正检验“私有暂存”的性质，而不是反对 `.tmp.$$` 作为命名形式。普通晚到归档和部分 cp 的原 R2 反例已被新发布路径修复，但上述入口及退出分支未覆盖。

一次性修复边界：原文归档使用同一生命周期规则：复用前当场验证备份字节；暂存独占创建且不跟随已有链接；发布验证精确普通文件落点；撤销前验证本次所有权，后来者保留并记冲突；若发生目录嵌套移动，准确清理仍属本次的暂存对象。不要仅给某个 if 分支追加检查。

回归矩阵：历史归档 absent/same/different/link × 内部计划后/暂存前/暂存后/mv 前/发布后状态变化 × 首文件/后续文件 × 零写/部分写/转换失败/门失败/EXIT；暂存普通文件/链接/晚到目录；断言原文 digest、所有者指纹、无自有 tmp 残留、重试和报告一致。

证据：r3-new-results.json 的 `late-before-stage`、`temp-owner-False/True`、`archive-prefix-archive`、`archive-directory`。正对照 `archive-partial`、`archive-late-after-stage`、`archive-late-at-mv` 均正确阻塞、恢复源并保护后来者。所有包装器只作用于临时夹具指定路径。

## 4. 非阻塞建议、文档与测试口径

- **S1 PARTIAL**：常规 EXIT 守卫、门失败、mig_fail_rollback 已清理 corpus-log 和 archive TSV；新的归档目录交错仍漏 tmp，已合并到 F3，不重复计阻塞。
- **S2 PARTIAL**：v1.2.0 附录六条可追溯到代码/测试。但 [Decision 真正第 6 条](reviewed-source/docs/decisions/Decision-091-governance-corpus-adoption.md#L53)仍是 `(?<!legacy\/)`；[README](reviewed-source/docs/decisions/README.md#L80)仍是旧前缀。R3 改动发生在“实现状态”第 6 项，且留下重复的“正确触发）；”。最小修订为实际决策条款、索引、PRESERVE 例外和仍称 AUDIT 只写机器件的说明，无需再起设计审批。
- **S4 PARTIAL**：不安全路径/悬空目的叶子的正式 AUDIT 表已经正确持久化 Item/Reason；旧源存在（含悬空源）及模板缺失分支仍未加入 AUDIT_CORPUS_SKIPPED。将这些已有 stdout 原因写入同一报告集合即可。
- `MIG_MOVE_META` 现在只初始化/追加，未被读取；实际普通回滚按 MIG_MOVES 的 src 推导备份 rel，所有权行为不依赖该数组，因此不将未使用数据结构当阻塞。`move_digest_of` 无悬空调用；转换摘要数组的实际 tab 分隔及多行查找正常，F2 并非分隔符问题。
- KT_TEST_PAUSE_FILE 未设置时不进入等待；正常运行和真实语料未设置。复现器仅在临时夹具使用该明确许可的测试钩子，不将其存在列为问题。
- 场景 66 修正后确实建立了真实 `.specify/memory/x.md` 再将祖先移出并链接；祖先越界阻塞与独立 R1 反例一致。其最后的 outside/memory/x.md 仍是旁路哨兵，独立探针另行核对实际被指向源。
- 场景 76 的晚到归档在外部 plan 与 apply 之间出现，apply 内部重建计划即能阻塞，不能证明 B3 暂存前/发布后保护；场景 75 的静态目录对照在计划已冲突，独立 mv 包装器另测了真实目录嵌套移动。
- `.SPECIFY` 大写旧根为冻结基线限制，不升格；完整归档前缀、机械映射、verbatim/pending、PRESERVE、双入口、中立骨架均按既定裁断审查。

## 5. 验证证据

`bash -n` 通过；两次完整回归均 **714 passed / 0 failed，exit 0**。复审结束再次确认 worktree 干净、HEAD 仍为 `eb4bb23e40c4ffb353dbea65e15e7c906d7ff447`。

完整回归日志：

- [默认 bash 完整回归](logs/d091-r3-regression-default.log)
- [/bin/bash 完整回归](logs/d091-r3-regression-binbash.log)

当前评审环境 `command -v bash` 为 `/bin/bash`，版本 3.2.57；因此上述是两个入口各一遍完整执行，不能表述成两个不同版本的证明。BSD mv/cp 实跑；本机无 GNU coreutils，不声称 GNU mv 已实跑。无 TS 变更，不运行 tsc/npm；未推送，不以缺少远端 CI 计缺陷。

独立验证集合：

- R2 原始 B1/B2 反例在全新夹具复跑，原嵌套链接、归档根、悬空叶子、晚到前缀、目录目标已正确处理。
- 19 项正反向检查通过：fresh 7 文件、日期/作者/项目渲染、AUDIT dry-run 与补缺、人工内容不覆盖、routed 重跑语料与域文档 digest 稳定、九规则、同输入/二次转换、Unicode、50 行/120 字符、门失败多文件回滚、真实仓零写入。
- 30 个独立类型/标志组合；INIT/AUDIT/routed 的旧源/悬空源/缺模板/不安全根 dry/apply 矩阵沿用 R2 夹具复跑。routed 缺模板使用保留 L4、仅缺语料模板的纠正夹具。
- [边界矩阵](evidence/r3/r3-boundary-matrix-results.json)：32 个非普通条目调用全部按 C10/明确安全理由阻塞且指纹不变；24 个空集合调用具有正确 PLAN_SHA/报告/错误语义；6 个 C1/C7/语料已移动目标修改或删除场景均恢复源、保留后来者并列冲突；非语料 FIFO 没被扩大枚举。
- C2+C7+C11+C12 混合 LEGACY 收编及原文归档通过；相同目标的 absent/same/different/dangling 归档分支保持 RETIRE/PRESERVE/BLOCKED 裁断。
- logistics-center 9 文件隔离复制：9 收编、9 原文归档、9 original_archive 绑定，全部原文 digest 一致；28 pending，增量为 RoleAtlas 14–20 行。手动清理本夹具临时备份后，9 份持久归档仍完整。
- logistics-center adoption plan / logistics-master dry-run 已重新执行，目标文件指纹前后相同，未对真实业务仓 apply。
- 9 文件完整隔离重放可在当前工具运行中正常完成，未观察到逐行 Ruby spawn 的阻塞性开销；这不是性能基准或延迟 SLA 证明。

主要复现入口与证据：

- [R3 新增交错与落点探针](reproduction/original/d091-r3-new.py) / [结果](evidence/r3/r3-new-results.json)
- [B4/B5/普通回滚矩阵脚本](reproduction/original/d091-r3-boundary-matrix.py) / [结果](evidence/r3/r3-boundary-matrix-results.json)
- [原 R2 反例本轮结果](evidence/r3/r2-new-results.json)
- [真实语料/转换/跳过矩阵](evidence/r3/r2-matrix-results.json)
- [正向及真实仓只读证据](evidence/r3/coverage-results.json)
- [空集合与重复收编](evidence/r3/r2-empty-results.json)

旧 R2 的 cp 包装器按旧“直接归档 cp”路径匹配；R3 改为暂存路径后，其旧 cp 注入不再命中，未将那两个旧结果当作 B3 关闭证据。本轮另写暂存/发布包装器，并在上述新结果中分别记录正反例。

## 6. 范围与结论

不纳入：D087 runtime/gateway/finding/recovery；四个业务仓正式执行及 routed 收口；wms-portal 域拆分；logistics-center 重号；wms-monitor 旧映射转 confirmed；project-context/business-domain-bootstrap 扩展收编；全局 Skill 安装；push/合并/Control Plane 登记；C05 验收。

应针对 F1–F3 一次性补全所有分支和对应回归后，再提交独立复审。当前不构成 PASS，尚不具备进入 D091 收口及四仓正式执行授权裁决的条件。
