# RESUME — D091 治理语料收编与生成（夜间交接，2026-09-07）

> 恢复入口：先读本文件，再按「关键材料路径」导航。本线**不使用 SDLC/DocFlow 治理**，
> **不修改 G4（D087/C03-E）工作线**，**不消费任何收口或发布授权**——D091 的收口裁决权
> 在 Current User，且以 D091-R3 复审 PASS 为前置。

## 1. 线路与 SHA

| 项 | 值 |
| --- | --- |
| 工作目录（worktree） | `/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard-governance-corpus-worktree` |
| 分支 | `codex/d088-governance-corpus`（基线 `9e6e0c7e2b3384a83337c90b86863493b2c1c206`，即 D087 G4-R6 rework 后主仓 HEAD） |
| 交接前实际 HEAD | `eb4bb23e40c4ffb353dbea65e15e7c906d7ff447`（R3 修复轮，worktree 干净） |
| 提交链 | `9e6e0c7` → `cc10bbb`（首轮实现）→ `f3faac8`（R2 修复轮）→ `eb4bb23`（R3 修复轮） |
| 最新独立复审覆盖的精确 SHA | `f3faac844681e27f160a4e29d5bb5e189c15fa31`（D091-R2，结论 FAIL/B1-B5） |
| **当前 HEAD `eb4bb23` 尚未经独立复审** | R3 修复轮交付，等待 D091-R3 复审（请求文件已备好，见 §8） |
| 远端 | 推送至 `origin/codex/d088-governance-corpus`（首推设置 upstream；推送结果见提交后说明） |
| 主工作区（勿动） | `/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard` @ `feature/c03-e5-autonomous-acceptance`，归 D087 会话 |

## 2. 需求、授权范围与排除项

- **授权依据**：`owner-task-brief.md`（Owner 2026-09-07 任务书，三硬要求：存量兼并吸收 /
  缺失生成 / 幂等不覆盖）。方案经 Owner 计划审批后实施。
- **合同**：`docs/decisions/Decision-091-governance-corpus-adoption.md`（六项决策 + 三轮
  修复注记）+ `docs/reports/d088-01-v3-behavior-spec.md` v1.2.0「v3.1 附录」节 +
  `docs/decisions/README.md` 索引行。
- **明确排除（不得顺手处理）**：D087 runtime/gateway/finding/recovery；四个业务仓
  （logistics-master/logistics-center/wms-portal/wms-monitor）的正式执行与 routed 收口；
  wms-portal 域拆分；logistics-center 业务域重号；wms-monitor 旧映射转 confirmed；
  `.specify/project-context/` 与 `business-domain-bootstrap.yaml` 扩展收编；全局 Skill
  安装；push 之外的合并/Control Plane 登记；C05 验收。

## 3. 已完成内容

初始化器 `scripts/bootstrap-knowledge-target.sh`（含内嵌 Ruby）+ 7 份语料模板
`templates/governance-corpus/`（memory 6 + coding_guide 索引）+ 回归套件扩展：

1. **收编（存量）**：迁移分类 C11（`.specify/memory/*`→`.sdlc/memory/*`）/C12
   （`.specify/coding_guide/*`→`.sdlc/coding_guide/*`），9 条有序确定性路径/词汇转换规则，
   逐规则计数入报告 `corpus_transformations`；不可转换段落入 `pending_confirmation`
   （真实语料 28 行）。
2. **生成（缺失）**：INIT/AUDIT create-if-missing 生成 7 份语料骨架（防占位守卫：
   旧源存在含悬空叶子链接时不生成同名骨架）。
3. **显式入口**：`--adopt-governance-corpus`（EXISTING*/EXISTING_CODE_NO_KNOWLEDGE 受限
   walk；与 `--domain-map` 互斥 exit 2；复用 PLAN_SHA/DP1/两阶段事务/回滚/双报告）。
4. **安全硬化（R2/R3 修复累计）**：输出路径逐组件 symlink 校验（计划级+apply 复验）；
   walk 根 realpath 包含性 + 可读性；find 遍历错误计划级阻塞；语料源仅普通文件（链接/
   FIFO/socket → C10）；目的地根符号链接/越界计划级阻塞；所有权绑定回滚（备份字节
   验证，后来者对象原样保留 + 冲突入报告）；原件归档 tmp+`mv -n` 原子发布；目的地含
   悬空链接按已存在处理；`mv -n` 目录目标检测与嵌套移动撤销；Bash 3.2 空集合守卫；
   残留门 `.specify` 模式完整归档前缀负向断言 `(?<!\.sdlc\/legacy\/)`（迁移门+审计
   扫描器两处一致）。
5. **报告**：迁移报告含 `corpus_transformations`、`pending_confirmation`、
   `original_archive` 绑定、`rollback.ownership_conflicts`；AUDIT 报告含语料 skip 段。

## 4. 最新复审真实结论（D091-R2，FAIL）与未关闭项

最新独立复审 = `D091-R2-review.md`（对象 `cc10bbb..f3faac8`，精确 SHA `f3faac8…`），
结论 **FAIL，5 项合并根因阻塞（3 P1 + 2 P2）**。**R3 提交 `eb4bb23` 声称已全部关闭，
但该关闭声明未经独立复审确认**——晚上恢复的第一件事就是执行 D091-R3 复审。

R2 复审的关闭判定基线（R3 声称的对应修复）：

| R2 项 | R2 判定要点 | R3 声称修复（待复审确认） |
| --- | --- | --- |
| B1 [P1] 路径检查只覆盖语料顶层目录 | 嵌套子目录链接/`.sdlc/legacy` 链接/悬空叶子三个反例均可越界写或假成功 | `corpus_output_path_unsafe` 逐组件校验（计划级 + apply 复验 + INIT/AUDIT 叶子按已存在处理） |
| B2 [P1] 移动与回滚未绑定实际发布对象 | 晚到前缀写作者被回滚 rm 删除；目录目标 mv 进目录被当成功且源不恢复 | 备份 rel 所有权登记（无竞态）+ 回滚所有权校验（后来者保留+冲突入报告）+ 普通文件后置校验与嵌套移动撤销 |
| B3 [P1] 原文归档独立 cp 绕过防覆盖与失败登记 | 晚到归档所有者被覆盖 exit 0；部分写失败半文件残留且假完整回滚 | tmp + `mv -n` 原子发布 + digest 复核 + 失败清理 |
| B4 [P2] 空收编集合 Bash 3.2 崩溃且错误返回 0 | 三种空集合夹具均 `LEGACY_ROOTS[@]: unbound` 且 exit 0 | 长度守卫遍历；空集 no-op 完整走完目的地检查/补缺/报告 |
| B5 [P2] 非普通语料被枚举过滤，进不了 C10 | FIFO/socket 计划空、exit 0 | 语料树 `! -type d` 枚举 + 普通文件守卫 → C10 |

R2 复审的回归矩阵要求（每项的完整矩阵）见 `D091-R2-review.md` 第三节；R3 对应场景为
套件 65-79，但**复审方明确要求独立补齐探针，套件绿不构成关闭证据**。

R1 遗留历史：`D091-R1-review-transcript.md`（7 阻塞，R2 已全部声称关闭并获 R2 复审
逐项判定：P2-5/P2-6/P2-7/S3 CLOSED，其余 PARTIAL 转入 B1-B5）。

## 5. 未关闭项清单（当前唯一未关闭层：D091-R3 复审未执行）

1. **D091-R3 独立复审**（对 `eb4bb23`）——R2 复审矩阵逐格独立探针 + 全范围抽查。
   无其他已知未关闭阻塞；若 R3 复审出新阻塞，按其修复边界整改后再走一轮复审。
2. 复审 PASS 后的 Owner 收口裁决事项（不在本线执行）：四仓正式收编执行
   （logistics-master 重跑补生成；logistics-center/wms-monitor `--adopt-governance-corpus`；
   wms-monitor 旧 bootstrap YAML 随之归档）、行为规格与 Decision 的收口状态改注、
   Control Plane/合并由 Owner 另行授权。

## 6. 每项修复的复现条件、代码位置、修复边界与回归矩阵

> 代码行号为 R3 提交 `eb4bb23` 时点；修复边界原文见 `D091-R2-review.md` 第三节。

### B1 输出路径安全（P1）
- **复现**：`.sdlc/memory/sub -> <仓外>` + 源 `.specify/memory/sub/a.md` → 收编写仓外；
  `.sdlc/legacy -> <仓外>` → 原件归档写仓外；`.sdlc/memory/constitution.md -> <仓外>/x`
  悬空叶子 → INIT/AUDIT cp 写穿。
- **代码**：`corpus_output_path_unsafe`（helper 区，约 L860）；计划级检查在 walk
  move-eligible 分支（corpus_arch_conflict 之后）；apply 复验在转换 pass 开头；
  INIT/AUDIT 叶子守卫在 `stage_corpus_skeleton` / `fill_corpus_artifact`。
- **修复边界**：仅限定 memory/coding_guide 与原件归档的输出路径；不扩全仓重构。
- **回归矩阵**：顶层/中间/归档祖先/叶子 × 实体/仓内链接/仓外链接/悬空 × 五种运行型别 ×
  plan/dry/apply/门失败。套件场景 73（嵌套+归档基）、74（悬空叶子 INIT/AUDIT）、79
  （AUDIT 报告 + INIT 嵌套 notice）。

### B2 移动/回滚所有权（P1）
- **复现**：双源 a/z，row1 发布后改写 a.md 内容 + row2 前创建 z.md 目录 → 回滚 rm 掉
  后来者内容；目录目标使 `mv -n` 移入目录且退出码 0 → 源消失被当成功 → EISDIR 回滚
  INCOMPLETE。
- **代码**：`mig_rollback`（所有权校验：期望 digest=备份文件 digest，语料行另有转换后
  digest）；移动循环的普通文件后置校验 + 嵌套移动撤销；`MIG_MOVE_META` 存 `dst\t备份rel`；
  `corpus_transform_digest_of` helper。
- **修复边界**：保留 preflight + `mv -n` 工程取舍；发布校验精确落点/类型/本次对象；
  回滚只撤销本事务拥有对象；目录目标不算发布。
- **回归矩阵**：首行/后续行 × 晚到普通文件/目录/链接 × 目标未变/前缀改写 × BSD/GNU。
  套件场景 75（确定性 pause-file 钩子注入 + 目录目标 75d）。

### B3 原件归档发布（P1）
- **复现**：归档检查后、cp 前创建 `LATER ARCHIVE OWNER` 被 `cp -p` 覆盖 exit 0；
  cp 部分写失败半文件残留且不在清理集合，假 FAILED_ROLLED_BACK。
- **代码**：转换 pass 归档发布段（tmp + `mv -n` + digest 复核 + `MIG_ARCHIVE_CREATED`
  仅在验证后登记）。
- **修复边界**：归档纳入统一无覆盖发布与所有权登记；部分写只清理自有对象。
- **回归矩阵**：absent/same/different/link × 计划后/写前晚到 × 首归档/后续 × cp 失败
  形态 × 转换/门失败。套件场景 76 + 68。

### B4 Bash 3.2 空集合（P2）
- **复现**：EXISTING 仓无两个语料目录（或收编后 prune / 空目录 + 不安全链接目的地），
  `--adopt-governance-corpus --plan|--apply` → `LEGACY_ROOTS[@]: unbound` 且 exit 0。
- **代码**：LEGACY_ROOTS 枚举后的 for 循环长度守卫（其余数组遍历已核查 `[@]:-}` 或
  数值边界形式）。
- **修复边界**：空集合完整走完零语料分支（目的地检查/补缺/报告），异常不得冒充 exit 0。
- **回归矩阵**：无 .specify/仅排除文件/prune 后/空目录 × 安全/不安全目的地 × 四模式，
  /bin/bash 3.2。套件场景 78；全套件 3.2 双跑。

### B5 非普通条目枚举（P2）
- **复现**：`.specify/memory/pipe`（FIFO）、`coding_guide/sock`（socket）→ 计划
  ADD_ONLY=true BLOCKED=0 exit 0。
- **代码**：per-root `find_sel`（语料根 `! -type d`）+ LEGACY 模式语料子树补充枚举；
  普通文件守卫（`-f && ! -L`）→ C10。
- **修复边界**：仅语料树；非普通对象不读内容直接 C10；不扩 project-context。
- **回归矩阵**：regular/symlink/dangling/FIFO/socket × 单独/混合 × adoption/LEGACY ×
  plan/apply。套件场景 77。

### 建议项
S1 临时清理（EXIT 守卫 + 门失败 + mig_fail_rollback 统一，含归档 TSV 与 tmp 文件）；
S2 usage + 行为规格 v1.2.0 附录 + Decision-091 决策 6/README 措辞；S3 块替换字面渲染
（场景 72）；S4 AUDIT 报告 skip 段（场景 79）。

## 7. 已执行测试与结果（对应 HEAD）

| 命令 | HEAD | 结果 |
| --- | --- | --- |
| `bash tests/bootstrap-knowledge-target.test.sh` | `9e6e0c7`（基线复跑） | 557 passed 0 failed |
| 同上（首轮实现后） | `cc10bbb` | 626 passed 0 failed |
| 同上（R2 修复后） | `f3faac8` | 668 passed 0 failed |
| 同上（R3 修复后） | `eb4bb23` | **714 passed 0 failed ALL GREEN** |
| `/bin/bash tests/bootstrap-knowledge-target.test.sh`（macOS Bash 3.2） | `eb4bb23` | **714 passed 0 failed ALL GREEN** |
| `bash -n scripts/bootstrap-knowledge-target.sh` | `eb4bb23` | 通过 |
| 真实语料副本收编重放（logistics-center 9 文件 → /tmp 隔离 fixture） | `eb4bb23` | 9/9 收编、9/9 原件归档、original_archive 9 绑定、pending 28、活跃面零活旧根引用 |
| 真实仓只读预演 | `f3faac8` 时点（R2 轮） | logistics-center adoption plan 9 行 TRANSFORM 零写入；logistics-master dry-run 指纹一致。**R3 后未重跑——列入 D091-R3 复审独立验证项** |

运行环境：macOS（darwin arm64，25.6.0）；默认 bash（PATH）与 /bin/bash 3.2.57 双跑；
BSD mv/cp/find 语义。未运行 tsc/npm test（diff 零 TS 文件）。分支未推送无远端 CI
（R3 交接时已推送，见 §9；仍无该分支 CI 工作流）。

**尚未验证 / 不作为当前证明**：`eb4bb23` 未经过独立复审；R2 轮真实仓只读预演未在 R3
HEAD 重跑；GNU coreutils mv 未实测（仅 BSD）；四业务仓未做任何正式执行（仅 R2 时点
只读预演）。

## 8. 关键材料路径与复现方法（均为仓内相对路径，基于仓库根）

| 材料 | 路径 |
| --- | --- |
| 本交接主文件 | `docs/handoffs/2026-09-07-governance-corpus/RESUME.md` |
| 最新独立复审原文（D091-R2，对象 f3faac8） | `docs/handoffs/2026-09-07-governance-corpus/D091-R2-review.md` |
| R1 复审结论转录件（对象 cc10bbb；原文为会话输出，本件为转录并已标注） | `docs/handoffs/2026-09-07-governance-corpus/D091-R1-review-transcript.md` |
| Owner 任务书（需求与授权原文） | `docs/handoffs/2026-09-07-governance-corpus/owner-task-brief.md` |
| **D091-R3 复审请求（待执行，交给独立复审会话）** | `docs/handoffs/2026-09-07-governance-corpus/review-prompts/D091-R3-review-request.md` |
| R2 复审证据（其 json 结果/探针脚本/回归日志，已从 /tmp 抢救入仓） | `docs/handoffs/2026-09-07-governance-corpus/evidence/`（r2-new/matrix/empty-probe.py、r2-*-results.json、r2-regression.log 等 13 件） |
| 决策记录 | `docs/decisions/Decision-091-governance-corpus-adoption.md`（八段+三轮注记）、`docs/decisions/README.md` 索引行 |
| 行为规格附录 | `docs/reports/d088-01-v3-behavior-spec.md` v1.2.0「v3.1 附录」节 |
| 语料模板 | `templates/governance-corpus/memory/*.md`、`templates/governance-corpus/coding_guide/CodingGuide.md` |
| 实现与测试 | `scripts/bootstrap-knowledge-target.sh`、`tests/bootstrap-knowledge-target.test.sh`（场景 52-79） |
| 本机路径映射 | `/tmp/d091-r2-review/*`（R2 复审工作区）→ `docs/handoffs/2026-09-07-governance-corpus/evidence/`；`/tmp/kt-*`（实现方一次性 fixture）→ 未保存，可由套件场景重建 |

复现方法：
```bash
cd /Users/eric_shaoooo/meicai/projects/ai-sdlc-standard-governance-corpus-worktree
bash tests/bootstrap-knowledge-target.test.sh          # 期望 714 passed 0 failed
/bin/bash tests/bootstrap-knowledge-target.test.sh     # Bash 3.2 同期望
# 单仓收编演示（只读预演）：
bash scripts/bootstrap-knowledge-target.sh /Users/eric_shaoooo/meicai/projects/logistics-center --adopt-governance-corpus --plan
```

## 9. 晚上恢复后的第一步与建议顺序

1. **第一步（唯一入口）**：把
   `docs/handoffs/2026-09-07-governance-corpus/review-prompts/D091-R3-review-request.md`
   交给独立复审会话，对 `eb4bb23` 执行 D091-R3 复审（复审需自行重跑真实仓只读预演）。
2. 复审 PASS → 交 Owner 做收口裁决（四仓正式收编执行授权、Decision-091 状态改注、
   合并策略）；裁决后再按 RESUME §2 排除清单以外的授权推进四仓执行。
3. 复审出新阻塞 → 按其修复边界在本分支继续 R4 修复轮（流程同本轮：修复 → 补场景 →
   双 bash 全量 → 更新 Decision 注记 → 提交 → 再审）。
4. 收编执行时注意：logistics-center / wms-monitor 的 `.specify` 内已有 R2 时点手修的
   5+7 处旧根引用（本轮确定性转换器可覆盖同型映射，但执行前后仍需 Owner 抽查
   pending_confirmation 清单）。
5. 始终：不使用 SDLC/DocFlow 治理；不动 G4/D087 工作线与其主工作区；不消费收口或
   发布授权；不合并、不 rebase、不改 Control Plane。
