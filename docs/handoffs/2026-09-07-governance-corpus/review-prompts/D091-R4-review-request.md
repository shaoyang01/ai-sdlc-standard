# D091-R4 复审请求（整改方发出，2026-09-07，待执行）

> 本文件是整改方（D091 实施会话）生成的 R4 复审请求原文。复审对象为 R4 修复轮提交
> `845483451fc2cf380d41553b8827b29ea1511b21`（范围 `[792f377]..[8454834]`，加至交接
> docs 提交 `cb8bc21cd7add85ca03c828ff1018e1d215f90e8` 全范围抽查）。
> **该复审尚未执行**——恢复后的第一步就是把本文件交给独立复审会话执行。

# 对 Decision-091 治理语料 R4 修复提交做一次全量、只读、根因合并式复审（D091-R4）

主审范围为 R4 修复提交本体，以上一轮 D091-R3 复审的 3 组合并根因阻塞（F1-F3）与
S1/S2/S4 PARTIAL 收尾为核对基线；允许对 `9e6e0c7..R4` 全范围抽查，不限于修复触及的
文件。以冻结范围合同为边界——Owner 任务书三硬要求、Decision-091 六项决策（第 6 条已
改注为完整归档前缀表述）、行为规格 v1.3.0 的「v3.1 附录」节（1-6 条 + R4 增补 7-9 条），
逐项完成。

复审在独立 worktree 内进行（本请求所在仓的 `codex/d088-governance-corpus` 分支检出）；
**主工作区归 D087 会话，不得触碰**（本机为 `/Users/eric/meicai/projects/ai-sdlc-standard`，
公司机为 `/Users/eric_shaoooo/...`）。不要改代码、不要提交/推送、不要使用 DocFlow。

## 一、R3 阻塞项关闭验证（逐项 CLOSED / NOT_CLOSED / PARTIAL，并按 R3 复审自己指定的
回归矩阵独立补齐探针——套件场景 80-88 与实现方的反例复跑只是实现方证据，不构成关闭
证据本身）

### F1 语料输出路径守卫补全（R3 矩阵：首次 TRANSFORM/相同内容 RETIRE/已有一致归档
PRESERVE × `.sdlc` 根/活动中间目录/归档祖先/叶子 × 实体/仓内链接/仓外链接/悬空 ×
plan/apply/INIT/AUDIT/routed；断言仓外指纹、源和链接类型，不仅检查 C10 文案）
a) 计划级：RETIRE 行（转换后一致 → 归档地址）的最终落点同样出 C10；TRANSFORM 行
   目的地 + 归档地址双检查维持；
b) apply：phase-2a 对全部 `.specify/memory|coding_guide` 源行的 dst + 归档路径复验
   （备份阶段之后、任何移动之前）；转换 pass 原有复验保留（纵深）；
c) `.sdlc` 根本体：`corpus_output_path_unsafe` 检查根 symlink；`CORPUS_DEST_BLOCKED`
   覆盖 `.sdlc` 为链接/非目录——INIT/AUDIT 跳过全部骨架生成（提示 + 正式报告记录）、
   adoption/LEGACY 计划级阻塞、真实仓外的任何语料零写入；
d) R3 两个反例（retire-escape、sdlc-root）按 R3 原口径复现应全部闭合；
e) PRESERVE（已收编且已归档一致）维持 no-op 裁断：不因守卫翻转为 BLOCKED、也不产生
   任何写入。

### F2 转换后摘要来源（R3 矩阵：普通 move/完成转换的语料 × 登记前/登记后后来者修改、
替换、删除 × 后续移动失败/转换失败/门失败；同时断言源原文、后来者内容、冲突清单，
包含多语料行查找）
a) transformer 以 `total\tsha256` 返回**本次写入字节**的内存摘要；apply 侧解析格式
   （非法输出视为转换失败整体回滚），登记不再 `mig_digest(dst)` 重采样；
b) 转换完成至登记之间被接管的目的是所有权冲突：后来者原样保留、源从备份恢复、冲突
   入 `rollback.ownership_conflicts`（JSON + MD）；
c) 登记后的接管仍由既有所有权绑定模型处理（R3 场景 75 语义不回归）；
d) `KT_TEST_TRANSFORM_PAUSE_FILE` 为纯测试钩子：未设置时零开销、零行为变化。

### F3 归档生命周期统一保护（R3 矩阵：历史归档 absent/same/different/link × 内部计划
后/暂存前/暂存后/mv 前/发布后状态变化 × 首文件/后续文件 × 零写/部分写/转换失败/门失败
/EXIT；暂存普通文件/链接/晚到目录；断言原文 digest、所有者指纹、无自有 tmp 残留、重试
和报告一致）
a) 复用验证：计划时字节一致快照过期（暂存前出现不同内容/目录/链接）→ 失败回滚、
   后来者对象原样保留、不误绑 original_archive；
b) 暂存独占：noclobber 独占创建——既存普通文件/符号链接/悬空链接永不截断、永不跟随、
   永不发布；清理登记仅在独占创建成功后加入（被拒绝的暂存不得把占用者当自有 tmp
   删除）；
c) 目录目标：`mv -n` 移入晚到目录时按所有权证明（cmp 备份字节）撤销嵌套移动；
   目录与其内容不扰动；
d) 清理所有权：`MIG_ARCHIVE_CREATED` 携带发布时已验证 digest；script_exit_guard/
   门失败/mig_fail_rollback 三处清理统一走 `mig_archive_remove_owned`——digest 匹配
   才删除，不匹配（后来者接管）保留并记 `rollback.ownership_conflicts`；
e) R3 四组反例（late-before-stage、temp-owner×2、archive-prefix-archive、
   archive-directory）与三个正对照（archive-partial、late-after-stage、late-at-mv）
   按 R3 原口径复现应全部闭合。

### 建议项收尾复核
S2：Decision-091 决策第 6 条与 `docs/decisions/README.md` 索引行已改为完整归档前缀
表述（`(?<!\.sdlc\/legacy\/)`），R2 注记第 6 项重复「正确触发）；」残留已清除——复核
对齐是否完整、无新漂移。S4：AUDIT 的旧源存在（含悬空源）/模板缺失跳过已写入
`AUDIT_CORPUS_SKIPPED` 正式报告——复核 Item/Reason 表完整。S1：常规清理维持 +
F3-c/d 闭合晚到目录 tmp 泄漏——复核无新泄漏面。

## 二、回归排查（R4 新引入面，不限于上述矩阵）
- transformer 输出格式变更（`puts total` → `puts "total\tsha256"`）：计划级碰撞比较
  调用（stdout 丢弃）与 apply 登记调用两处消费者语义均正确；`-rdigest` 参数变化不
  影响规则日志 TSV 写入；
- `MIG_ARCHIVE_CREATED` 格式变更（rel → `rel\tdigest`）：全脚本仅三处清理循环消费，
  无报告面依赖旧格式；
- phase-2a 语料行复验的开销形态（每语料行 2 次 ruby spawn）在 9 文件真实语料下可接受；
- noclobber 子shell（`set -o noclobber; : > tmp`）在 Bash 3.2 语义正确（O_EXCL，
  对悬空链接同样拒绝），不改变脚本全局 shell 选项；
- 场景 80-88 的断言与实现行为对应（特别是 80d PRESERVE no-op、87 目录先至走复用
  验证分支、88 mv 包装器注入走嵌套撤销分支——两者是不同代码路径，复审确认各自命中的
  分支正确）；
- F2 摘要格式校验失败路径（transformer 成功退出但输出非 `total\tsha256`）不吞错误；
- 行为规格 v1.3.0 附录 7-9 条与实现一致（逐条可追溯到代码与场景）；Decision-091
  第 6 条/README 措辞与实现一致；
- R1/R2/R3 已关闭项（九规则幂等、归档前缀、pending、S3 字面替换、B4 空集合、B5
  非普通条目）无回归——复审方边界矩阵脚本独立复跑。

## 三、真实仓只读预演（复审自行执行，零写入断言）
本机（家用机 eric）业务仓路径：`/Users/eric/meicai/projects/{logistics-center,
logistics-master,wms-portal,wms-monitor}`。实测基线（R4 整改方记录，复审须独立重跑）：
logistics-center `--adopt-governance-corpus --plan` exit 0、36 行（C11×6 + C12×3 +
退役 27）、BLOCKED=0、指纹前后一致；logistics-master `--dry-run` exit 0（本机为
EXISTING_CODE_NO_KNOWLEDGE 补生成计划）、指纹一致。**注意：本机业务仓状态与公司机
R2/R3 时点记录（logistics-center 9 行 adoption 态）不同——两机仓状态各自独立演进，
请按复审机实际状态预演并如实记录，仅断言零写入与计划语义合理。**

## 四、输出要求
先建立完整行为不变量清单与各公开读写路径的失效模式清单（非法输入、并发交错、状态漂移
各自导致什么可判定错误码），再统一输出所有已发现问题；同一根因的变体必须合并；R1/R2/R3
复审与实施方案审批已裁决事项不得重复上报。不要改代码、不要提交/推送、不要使用 DocFlow。
以下为有意为之的实现选择或已冻结事实，不得作为缺陷上报：C11/C12 新规则 ID 与完整归档
前缀负向断言（Decision-091 授权）；verbatim 收编 + pending_confirmation 代替语义改写；
LEGACY 自动含语料 + EXISTING* 显式标志双入口；冗余源 no-op PRESERVE 不删除（含归档路径
带链接组件时维持 no-op 的 R4 裁断）；发布前复验 + `mv -n` + 备份字节所有权模型的工程
取舍（R3 复审「特别边界」已接受 preflight 模型，微秒级检查-使用窗口不作为缺陷，除非
给出合同依据）；转换摘要内存计算模型（F2 选定方案）；noclobber 独占暂存（F3 选定方案）；
移动与原位转换之间晚到写入被转换覆盖的固有残余（B2-d 冻结）；语料目的地根不安全时
「无语料行也阻塞迁移」的 fail-closed 取舍；KT_TEST_PAUSE_FILE 与
KT_TEST_TRANSFORM_PAUSE_FILE 仅测试钩子（复现器在临时夹具使用该钩子合法）；`.SPECIFY`
大写旧根基线限制；骨架 pending 槽位/技术栈中立；project-context 与
business-domain-bootstrap.yaml 不处理（Owner 排除）；本机无新版 bash（双入口均为
3.2.57，两遍完整执行）；tsc/npm test 不适用（diff 零 TS 文件）；既有 GATE_OUT mktemp
泄漏等 pre-existing 痣（除非本轮直接恶化）。不要把合同外的泛化加固建议升格为问题；
若认为必须纳入，先明确指出是哪条合同要求使其成为范围内问题。

验证证据基线：R4 整改方自证——双 bash 全量 **778 passed 0 failed**（`evidence/
r4-regression-default.log`、`r4-regression-binbash.log`，两入口同二进制 3.2.57，各完整
一遍）；复审方 R3 反例脚本本地化复跑 11/11 安全闭合（`evidence/r4-probe-rerun-results.json`；
补丁仅为 worktree 路径与 ruby shim `-rdigest` 参数布局适配）；边界矩阵复跑无回归
（`evidence/r4-boundary-rerun-results.json`）；真实仓只读预演零写入（见第三节）。
复审方应独立重跑回归套件、反例探针与预演，不以实现方证据替代。每个阻塞项必须给出
可复现证据、影响路径、一次性修复边界和回归矩阵。最后明确：哪些是阻塞项、哪些是建议项、
哪些不属于本任务（D087 runtime/gateway/finding/recovery、四个业务仓的正式执行与
routed 收口、wms-portal 域拆分、logistics-center 重号、wms-monitor 旧映射转 confirmed、
project-context 扩展收编、全局 Skill 安装、push/合并/Control Plane 登记、C05 验收）。
若本轮无阻塞项，请明确给出 PASS 判定并声明 D091 可进入 Current User 收口裁决（含四个
业务仓正式执行授权）。
