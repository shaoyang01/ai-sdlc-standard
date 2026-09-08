# D091-R3 复审请求（整改方发出，2026-09-07，待执行）

> 本文件是整改方（D091 实施会话）生成的 R3 复审请求原文，复审对象为 R3 修复提交
> `eb4bb23e40c4ffb353dbea65e15e7c906d7ff447`（范围 `[f3faac8]..[eb4bb23]`）。
> **该复审尚未执行**——晚上恢复后的第一步就是把本文件交给独立复审会话执行。

# 对 Decision-091 治理语料 R3 修复提交做一次全量、只读、根因合并式复审（D091-R3）

主审范围为 [f3faac8]..[eb4bb23]（R3 修复提交本体），以上一轮 D091-R2 复审的 5 项合并根因
阻塞（B1-B5）与已采纳建议收尾（S1 部分、S2 部分、S4）为核对基线；允许对
9e6e0c7..eb4bb23 全范围抽查，不限于修复触及的文件。以冻结范围合同为边界——Owner 任务书
三硬要求、第四节 A/B/C 功能要求、第五节 12 项工程与测试要求、第六节不处理清单、
Decision-091 六项决策（决策 6 已按 R2 结论改为完整归档前缀表述）、行为规格 v1.2.0 的
「v3.1 附录」节，逐项完成。

复审在独立 worktree `/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard-governance-corpus-worktree`
内进行；主工作区 `/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard` 归 D087 会话
（其 HEAD 已独立前进，与本分支无交叠），不得触碰。不要改代码、不要提交/推送、不要使用
DocFlow。

## 一、R2 阻塞项关闭验证（逐项 CLOSED / NOT_CLOSED / PARTIAL，并按 R2 复审自己指定的
回归矩阵独立补齐探针——套件场景 65-79 只是实现方的证据，不构成关闭证据本身）

### B1 输出路径安全（R2 矩阵：顶层/中间目录/归档祖先/叶子 × 实体/仓内链接/仓外链接/
悬空链接 × adoption/LEGACY/INIT/AUDIT/routed × plan/dry/apply/门失败；同时校验链接
类型、源字节和仓外指纹）
a) `corpus_output_path_unsafe` 逐组件语义：从 .sdlc 根到叶子（含叶子自身）任一组件为
   symlink 即不安全——File.symlink? 为 lstat 语义，悬空叶子链接必须命中；
b) 计划级：C11/C12 行的目的地与原件归档路径（`.sdlc/legacy/.specify/**`）逐行出 C10
   阻塞；顶层根检查（CORPUS_DEST_BLOCKED）与逐行检查的分工边界无漏项；
c) apply 复验：计划后出现的链接组件在转换前拦截并整体回滚；
d) INIT/AUDIT：悬空叶子链接按「已存在对象」处理——跳过+提示+正式 AUDIT 报告持久化
   （S4 的 Corpus Skeleton Skips 段含条目与原因），链接原样保留、绝不写穿；
e) B1 三反例（嵌套 sub 链接、.sdlc/legacy 整体链接、悬空叶子）按 R1 原口径复现应全部
   阻塞且仓外指纹不变。

### B2 移动/回滚所有权绑定（R2 矩阵：首行/后续行 × 晚到普通文件/目录/链接 × 目标未变/
前缀被修改或替换 × BSD/GNU 实际退出语义；源、后来者和报告三方同时断言）
a) 所有权登记无竞态设计：meta 存备份 rel，期望 digest 在回滚时从备份文件推导（不依赖
   mv 后采样）——复审验证该设计确实消除 R1/B2 的登记窗口，以及普通行与语料行两种
   所有权分支（源 digest / 语料转换后 digest）的正确性；
b) 后来者修改的目的地在回滚中原样保留、源从备份恢复、冲突逐项进入失败报告
   `rollback.ownership_conflicts`（JSON + MD Rollback Ownership Conflicts 节）；
c) 目录目标：`mv -n` 把源移入目录后由普通文件后置校验捕获、嵌套移动被撤销、
   owner 数据不丢、整事务回滚；
d) 残余边界如实确认：移动与语料原位转换之间晚到写入者会被转换覆盖——这是原位
   转换设计的固有属性（R2 报告的反例针对的是回滚 rm），复审确认该残余已被如实定义
   且不属于本轮承诺的关闭范围（如认为必须关闭，指出合同依据）。

### B3 原件归档原子发布（R2 矩阵：归档 absent/same/different/link × 计划后/写前晚到 ×
首归档/后续归档 × cp 零写失败/部分写失败/成功 × 转换失败/门失败）
a) 私有临时文件（`tmp.$$`）+ cp + `mv -n` 原子改名 + digest 复核：晚到归档所有者
   不被覆盖（临时文件删除、冲突如实报告并回滚）、部分写只留在自有临时文件内且被清理；
b) 计划级归档冲突（存在且不同→阻塞；一致→复用不写）与 apply 时出现的归档两个入口
   行为一致；
c) 临时文件泄漏检查：成功/转换失败/门失败/EXIT 各路径 `.sdlc/legacy/**` 下无 `*.tmp.*`
   残留（S1）。

### B4 Bash 3.2 空集合（R2 矩阵：无 .specify/仅排除文件/收编后 prune/存在空目录 ×
安全/不安全目的地 × plan/dry/apply/re-run；macOS Bash 3.2 必跑；断言输出语义与实际动作）
a) `/bin/bash` 3.2 下空收编集 plan（有 PLAN_SHA、无 unbound）与 apply（exit 0 no-op）、
   prune 后重复收编、安全完成；
b) 空收编集 + 不安全目的地仍计划级阻塞（corpus-destination 行）；
c) 全套件在 /bin/bash 3.2 下完整重跑 714/0 的证据独立复核（实现方已双跑）。

### B5 非普通条目（R2 矩阵：regular/symlink/dangling/FIFO/socket × 单独/混合 ×
adoption/LEGACY × plan/apply；非法条目可定位、零移动、不挂起）
a) adoption 根与 LEGACY 模式的语料子树均以 `! -type d` 枚举；FIFO/socket 落 C10
   （"regular file" 理由）、计划阻塞、零移动、无内容读取（无挂起）；
b) 非语料目录（templates/workflow/specs）的枚举范围未扩大（避免误归档特殊对象）。

### 建议项状态复核
S1 语料临时文件失败路径清理（EXIT 守卫/门失败/mig_fail_rollback 三处，含归档 TSV 与
tmp 文件）；S2 usage 已同步 + 行为规格 v1.2.0「v3.1 附录」节 + Decision-091 决策 6 与
README 索引措辞——复核对齐是否完整；S4 AUDIT 报告 skip 段（场景 79）。

## 二、回归排查（R3 新引入面，不限于上述矩阵）
- 所有权绑定回滚作用于**全部迁移行**（C1-C7 同样受备份 digest 校验约束）：场景 36-51
  原语义无回归；特别注意「目的地在回滚时已消失」的新分支（恢复源+记冲突）对既有
  rollback-INCOMPLETE 断言的影响；
- `MIG_MOVE_META` 格式变更（dst\tbackup-rel）与 `move_digest_of` 删除后全脚本无悬空
  引用；`corpus_transform_digest_of` 的查找在多语料行下正确；
- B1 helper 的开销形态（每语料行 2 次 ruby spawn）在 9 文件真实语料下的可接受性；
  `.tmp.$$` 命名与残留门 legacy/ 前缀跳过的交互；
- KT_TEST_PAUSE_FILE 测试钩子：env 未设置时零开销、零行为变化；仅用于回归测试的
  边界已被如实限定；
- 行为规格 v1.2.0 附录与实现一致性（六条增量逐条可追溯到代码与场景）；Decision-091
  决策 6/README 措辞与实现一致；
- 悬空源链接在 adoption 计划中的 C10 分类（R1 矩阵项）未被 B5 枚举变更破坏；
- 场景 66 fixture 修正后真正测的是祖先越界（复审确认其断言与实现行为对应）；
- 大写 `.SPECIFY` 语料边界维持 R2 已记录的基线限制（不升格）。

## 三、输出要求
先建立完整行为不变量清单与各公开读写路径的失效模式清单（非法输入、并发交错、状态漂移
各自导致什么可判定错误码），再统一输出所有已发现问题；同一根因的变体必须合并；R1/R2
复审与实施方案审批已裁决事项不得重复上报。不要改代码、不要提交/推送、不要使用 DocFlow。
以下为有意为之的实现选择或已冻结事实，不得作为缺陷上报：C11/C12 新规则 ID 与完整归档
前缀负向断言（Decision-091 授权）；verbatim 收编 + pending_confirmation 代替语义改写；
LEGACY 自动含语料 + EXISTING* 显式标志双入口；冗余源 no-op PRESERVE 不删除；发布前复验
+ `mv -n` + 备份字节所有权模型的工程取舍（B2 修复边界明确「保留现有工程取舍，无需重构
为原子事务系统」）；备份 rel 所有权登记设计（消除登记竞态的选定方案）；移动与原位转换
之间晚到写入被转换覆盖的固有残余（原位转换设计属性，见 B2-d）；语料目的地根不安全时
「无语料行也阻塞迁移」的 fail-closed 取舍；KT_TEST_PAUSE_FILE 仅测试钩子；骨架 pending
槽位/技术栈中立/不声明标准包权威；project-context 与 business-domain-bootstrap.yaml 不
处理（Owner 排除）；分支未推送无远端 CI（验证=本地全量回归 ×2 个 bash + 真实语料副本
+ 只读预演）；tsc/npm test 不适用（diff 零 TS 文件）；既有 GATE_OUT mktemp 泄漏等
pre-existing 痣（除非本轮直接恶化）；大写 `.SPECIFY` 基线限制。不要把合同外的泛化加固
建议升格为问题；若认为必须纳入，先明确指出是哪条合同要求使其成为范围内问题。

验证证据基线：精确 HEAD `eb4bb23e40c4ffb353dbea65e15e7c906d7ff447`（分支
codex/d088-governance-corpus，worktree 干净）；修复前基线 `f3faac8`、原始基线 `9e6e0c7`；
本地全量回归 **714 passed 0 failed，默认 bash 与 /bin/bash 3.2（macOS）各完整一遍**
（场景 52-72 沿用 + 65-79 R2/R3 修复矩阵；基线 557/626/668 均曾在对应状态复跑确认）；
bash -n 干净；真实语料副本（logistics-center 9 文件）隔离重放：9/9 收编、9/9 原件归档、
original_archive 9 处绑定、28 行 pending、活跃面零活旧根引用；R2 轮的真实仓只读预演
（logistics-center adoption plan 9 行 TRANSFORM、logistics-master dry-run）所涉路径被
R3 的逐行检查重新覆盖，复审应自行重跑一次零写入预演作为独立验证。每个阻塞项必须给出
可复现证据、影响路径、一次性修复边界和回归矩阵。最后明确：哪些是阻塞项、哪些是建议项、
哪些不属于本任务（D087 runtime/gateway/finding/recovery、四个业务仓的正式执行与 routed
收口、wms-portal 域拆分、logistics-center 重号、wms-monitor 旧映射转 confirmed、
project-context 扩展收编、全局 Skill 安装、push/合并/Control Plane 登记、C05 验收）。
若本轮无阻塞项，请明确给出 PASS 判定并声明 D091 可进入 Current User 收口裁决（含四个
业务仓正式执行授权）。
