# RESUME — D091 治理语料收编与生成（R4 交付后交接，2026-09-07）

> 恢复入口：先读本文件，再按「关键材料路径」导航。本线**不使用 SDLC/DocFlow 治理**，
> **不修改 G4（D087/C03-E）工作线**，**不消费任何收口或发布授权**——D091 的收口裁决权
> 在 Current User，且以 D091-R4 复审 PASS 为前置。

## 1. 线路与 SHA

| 项 | 值 |
| --- | --- |
| 工作目录（worktree，**本机 = 家用机 eric**） | `/Users/eric/meicai/projects/ai-sdlc-standard-governance-corpus-worktree`（公司机路径为 `/Users/eric_shaoooo/...`，两机分支同名） |
| 分支 | `codex/d088-governance-corpus`（基线 `9e6e0c7e2b3384a83337c90b86863493b2c1c206`，即 D087 G4-R6 rework 后主仓 HEAD） |
| 提交链 | `9e6e0c7` → `cc10bbb`（首轮）→ `f3faac8`（R2 修复）→ `eb4bb23`（R3 修复）→ `792f377`（R3 夜间交接 docs）→ R4 修复轮提交（代码+决策+规格）→ R4 交接 docs 提交（本文件所在） |
| 最新独立复审覆盖的精确 SHA | `eb4bb23e40c4ffb353dbea65e15e7c906d7ff447`（D091-R3，结论 **FAIL/F1-F3**） |
| R4 修复轮提交 | 见 git log；**尚未经独立复审**，等待 D091-R4 复审（请求文件已备好，见 §8） |
| 远端 | `origin/codex/d088-governance-corpus`（R4 提交后已推送） |
| 主工作区（勿动） | 家用机 `/Users/eric/meicai/projects/ai-sdlc-standard` @ `feature/c03-e5-autonomous-acceptance`，归 D087 会话；本线全部工作只在上述 worktree |

## 2. 需求、授权范围与排除项

- **授权依据**：`owner-task-brief.md`（Owner 2026-09-07 任务书，三硬要求：存量兼并吸收 /
  缺失生成 / 幂等不覆盖）。方案经 Owner 计划审批后实施。
- **合同**：`docs/decisions/Decision-091-governance-corpus-adoption.md`（六项决策 + 四轮
  修复注记）+ `docs/reports/d088-01-v3-behavior-spec.md` v1.3.0「v3.1 附录」节（1-6 条 +
  R4 增补 7-9 条）+ `docs/decisions/README.md` 索引行。
- **明确排除（不得顺手处理）**：D087 runtime/gateway/finding/recovery；四个业务仓
  （logistics-master/logistics-center/wms-portal/wms-monitor）的正式执行与 routed 收口；
  wms-portal 域拆分；logistics-center 业务域重号；wms-monitor 旧映射转 confirmed；
  `.specify/project-context/` 与 `business-domain-bootstrap.yaml` 扩展收编；全局 Skill
  安装；push 之外的合并/Control Plane 登记；C05 验收。

## 3. 已完成内容（累计）

初始化器 `scripts/bootstrap-knowledge-target.sh`（含内嵌 Ruby）+ 7 份语料模板
`templates/governance-corpus/`（memory 6 + coding_guide 索引）+ 回归套件（场景 52-88）：

1. **收编（存量）**：C11/C12 确定性转换；9 条有序规则；逐规则计数入报告；
   不可转换段落入 `pending_confirmation`。
2. **生成（缺失）**：INIT/AUDIT create-if-missing 7 份骨架（防占位守卫）。
3. **显式入口**：`--adopt-governance-corpus`（复用 PLAN_SHA/DP1/两阶段事务/回滚/双报告）。
4. **安全硬化（R2/R3/R4 修复累计）**：R2/R3 各项见 Decision-091 注记；**R4 新增**——
   RETIRE 归档落点计划级+apply 逐组件守卫；`.sdlc` 根本体链接/非目录检查（helper +
   `CORPUS_DEST_BLOCKED` 双层）；转换后期望摘要由 transformer 内存计算本次写入字节
   （`total\tsha256`），不再采样可变目的地；归档复用前当场以备份字节验证；暂存 noclobber
   独占创建（清理登记仅在独占创建成功后加入）；`mv -n` 移入晚到目录按所有权证明撤销；
   `MIG_ARCHIVE_CREATED` 携带已验证 digest，三处清理统一走 `mig_archive_remove_owned`
   所有权校验（后来者保留 + `rollback.ownership_conflicts`）；AUDIT 旧源/缺模板跳过入报告。
5. **报告**：迁移报告含 `corpus_transformations`、`pending_confirmation`、
   `original_archive` 绑定、`rollback.ownership_conflicts`；AUDIT 报告含语料 skip 段
   （unsafe 路径、根不安全、旧源存在、模板缺失全部持久化）。

## 4. 最新复审真实结论（D091-R3，FAIL）与 R4 关闭情况

最新独立复审 = `D091-R3-review.md`（对象 `f3faac8..eb4bb23`，精确 SHA `eb4bb23…`），
结论 **FAIL，3 组 P1 合并根因阻塞 F1-F3**（B4/B5 CLOSED；S1/S2/S4 PARTIAL）：

| R3 项 | R3 判定要点 | R4 修复（按复审给定修复边界） |
| --- | --- | --- |
| F1 [P1] 路径守卫缺口 + `.sdlc` 根本体 | RETIRE 分支不调用守卫（归档落点绕过）；helper 从 `.sdlc` 下一级开始查，根本体链接可写穿 | 计划级 RETIRE 分支与 apply（phase-2a + 转换 pass）对全部 C11/C12 最终落点统一逐组件检查；helper 检查 `.sdlc` 本体；`CORPUS_DEST_BLOCKED` 覆盖根链接/非目录；PRESERVE no-op 裁断维持 |
| F2 [P1] 转换后摘要采样可变目的地 | 转换成功后、`mig_digest(dst)` 登记前被接管的后来者被登记为本事务输出并被回滚删除 | transformer 输出 `total\tsha256`（内存计算本次写入字节）；登记与回滚比较均用该值；新增 `KT_TEST_TRANSFORM_PAUSE_FILE` 钩子做确定性回归 |
| F3 [P1] 归档生命周期入口/暂存/撤销未统一保护 | 暂存前复用不验证字节；暂存路径可被占用（截断/跟随/发布）；首归档清理可误删后来者归档；目录目标嵌套暂存泄漏 | 复用当场 `cmp` 备份字节；noclobber 独占创建 + 登记后置；嵌套移动按所有权证明撤销；`MIG_ARCHIVE_CREATED` 携带 digest，三处清理走 `mig_archive_remove_owned` |
| S2/S4 PARTIAL | Decision 第 6 条/README 旧措辞；AUDIT 旧源/缺模板仅 echo | 已补全（见 Decision-091 注记 4） |

R4 自证（非关闭证据，仅供复审参考）：`evidence/r4-probe-rerun-results.json`（复审方
11 个 R3 反例在修复后代码上全部安全闭合）、`evidence/r4-boundary-rerun-results.json`
（B4/B5 矩阵无回归）、真实仓只读预演零写入。

## 5. 未关闭项清单（当前唯一未关闭层：D091-R4 复审未执行）

1. **D091-R4 独立复审**（对 R4 修复轮提交）——F1-F3 关闭矩阵逐格独立探针 + 全范围抽查
   + 真实仓只读预演。若出新阻塞，按其修复边界在本分支继续 R5 修复轮（流程同本轮）。
2. 复审 PASS 后的 Owner 收口裁决事项（不在本线执行）：四仓正式收编执行、行为规格与
   Decision 的收口状态改注、Control Plane/合并由 Owner 另行授权。

## 6. R4 修复的复现条件、代码位置与回归矩阵

> 代码行号为 R4 提交时点；修复边界原文见 `D091-R3-review.md` 第三节。

### F1 输出路径守卫补全（P1）
- **复现**：`.sdlc/memory/a.md` 与转换后一致 + `.sdlc/legacy -> <仓外>` + 归档文件缺席
  → 原 RETIRE 写穿仓外；`.sdlc -> <仓外>` 且 memory/coding_guide 缺席 → INIT/AUDIT
  经根链接生成 7 份骨架到仓外。
- **代码**：计划级 RETIRE 分支（walk 内 `already adopted` else 支）新增
  `corpus_output_path_unsafe` 检查；helper 增加 `File.symlink?(sdlc)` 根检查；
  `CORPUS_DEST_BLOCKED` 前置 `.sdlc` 检查；apply 复验 = phase-2a 对 `.specify/memory|coding_guide`
  源行检查 dst + 归档路径（转换 pass 原有复验保留）。
- **回归矩阵**（套件 80-82 + 复审方 retire-escape/sdlc-root 反例）：首次 TRANSFORM/
  相同内容 RETIRE/已有一致归档 PRESERVE × `.sdlc` 根/归档祖先/归档叶子（悬空）/活动
  中间目录 × 仓外链接/仓内链接/悬空 × plan/apply/INIT/AUDIT；断言仓外指纹、源与链接
  类型。PRESERVE 维持 no-op 裁断（80d）。

### F2 转换后摘要来源（P1）
- **复现**：双语料行 a/z（z 无效 UTF-8 作失败点）；a 转换成功后、登记前把 dst 写为
  `LATER POST-TRANSFORM OWNER` → 原实现登记后来者摘要，回滚误删。
- **代码**：`corpus_transform_file`（`ruby -rdigest`，输出 `total\tsha256`）；apply 转换
  pass 解析并校验格式后登记 `MIG_CORPUS_TRANSFORM_DIGESTS`；回滚 `corpus_transform_digest_of`
  查找逻辑不变。
- **回归矩阵**（套件 83 + 复审方 post-transform-owner 反例；登记后接管由既有场景 75
  覆盖）：普通 move/完成转换的语料 × 登记前/登记后接管 × 后续转换失败/门失败；断言
  源原文、后来者内容、冲突清单、多语料行查找。

### F3 归档生命周期（P1）
- **复现**：四变体——计划后暂存前不同归档被静默复用；暂存路径被普通文件/仓外链接占用
  （cp 截断/跟随并发布）；首归档被后来者接管后失败清理误删；归档地址变目录时 BSD
  `mv -n` 嵌套移动泄漏暂存。
- **代码**：转换 pass 归档发布段（noclobber 独占创建、复用验证、目录检测 + 所有权
  撤销、digest 登记三处）；`mig_archive_remove_owned`（script_exit_guard / 门失败 /
  `mig_fail_rollback` 三处清理统一）。
- **回归矩阵**（套件 84-88 + 复审方 archive×5 反例）：absent/same/different/link ×
  暂存前/暂存后/mv 前（mv 包装器注入）/发布后接管 × 首文件/后续文件 × 转换失败；断言
  原文 digest、所有者指纹、无自有 tmp 残留、源恢复、冲突与报告一致。

### 建议项收尾
S2：Decision-091 第 6 条 + `docs/decisions/README.md` 索引改为完整归档前缀表述，
清除重复「正确触发）；」残留。S4：AUDIT 旧源存在（含悬空源）/模板缺失跳过写入
`AUDIT_CORPUS_SKIPPED`（正式报告 Corpus Skeleton Skips 段）。

## 7. 已执行测试与结果（对应 R4 提交）

| 命令 | 结果 |
| --- | --- |
| `bash tests/bootstrap-knowledge-target.test.sh` | **778 passed 0 failed ALL GREEN**（默认 bash；本机默认 bash 即 /bin/bash 3.2.57，两入口同二进制，见证据日志头） |
| `/bin/bash tests/bootstrap-knowledge-target.test.sh`（macOS Bash 3.2） | **778 passed 0 failed ALL GREEN** |
| `bash -n scripts/bootstrap-knowledge-target.sh` / `tests/...` | 通过 |
| 复审方 R3 反例脚本（d091-r3-new.py，本地化补丁：worktree 路径 + ruby shim 适配 `-rdigest` 参数布局） | 11/11 安全闭合：retire-escape、sdlc-root、late-before-stage、temp-owner×2、archive-partial/late-after-stage/late-at-mv/prefix-archive/directory、post-transform-owner（`evidence/r4-probe-rerun-results.json`） |
| 复审方边界矩阵（d091-r3-boundary-matrix.py） | 32 非普通条目全阻塞、24 空集合干净、6 所有权用例通过、非语料特殊对象不扩枚举（`evidence/r4-boundary-rerun-results.json`） |
| 真实仓只读预演（本机 `/Users/eric/meicai/projects/`） | logistics-center `--adopt-governance-corpus --plan`：exit 0，36 行（C11×6 + C12×3 + 退役 27），BLOCKED=0，指纹前后一致；logistics-master `--dry-run`：exit 0（本机为 EXISTING_CODE_NO_KNOWLEDGE，init 补生成计划），指纹一致。**注意：本机业务仓状态与公司机 R2/R3 时点记录不同（公司机 logistics-center 为 9 行 adoption 态），两机仓状态各自独立演进，复审应在复审机自行重跑零写入预演** |

运行环境：macOS（darwin arm64，25.6.0）；bash 双入口均为 3.2.57（本机无新版 bash，
"双 bash"=两入口各完整一遍，复审请如实表述）；BSD mv/cp/find 语义。diff 零 TS 文件，
不适用 tsc/npm。R3 反例脚本运行中 `probes.py` 的 STD 路径与 ruby shim 条件按 R4 接口
机械适配（补丁保留于 `/tmp/d091-r4-verify/`，适配点已在本表注明）。

**尚未验证 / 不作为当前证明**：R4 提交未经独立复审；GNU coreutils mv 未实测（仅 BSD，
mv 包装器场景 88 注入的是真实 BSD mv 前置目录创建）；四业务仓未做任何正式执行（仅
只读预演）。

## 8. 关键材料路径与复现方法（仓内相对路径，基于仓库根）

| 材料 | 路径 |
| --- | --- |
| 本交接主文件 | `docs/handoffs/2026-09-07-governance-corpus/RESUME.md` |
| 最新独立复审原文（D091-R3，对象 eb4bb23） | `docs/handoffs/2026-09-07-governance-corpus/D091-R3-review.md` |
| R2/R1 复审原文 | 同目录 `D091-R2-review.md`、`D091-R1-review-transcript.md` |
| Owner 任务书 | `docs/handoffs/2026-09-07-governance-corpus/owner-task-brief.md` |
| **D091-R4 复审请求（待执行，交给独立复审会话）** | `docs/handoffs/2026-09-07-governance-corpus/review-prompts/D091-R4-review-request.md` |
| R3 复审证据（报告反例/矩阵/回归日志，已从复审包入仓） | `evidence/r3-new-probe.py`、`r3-boundary-matrix-probe.py`、`r3-probes-preamble.py`、`r3-*-results.json`、`r3-regression-*.log`、`r3-coverage-results.json` |
| R4 自证（复审方反例修复后复跑 + 边界矩阵 + 双 bash 日志） | `evidence/r4-probe-rerun-results.json`、`r4-boundary-rerun-results.json`、`r4-regression-default.log`、`r4-regression-binbash.log` |
| 决策记录 | `docs/decisions/Decision-091-governance-corpus-adoption.md`（六项决策 + 四轮注记）、`docs/decisions/README.md` 索引行 |
| 行为规格附录 | `docs/reports/d088-01-v3-behavior-spec.md` v1.3.0「v3.1 附录」节（1-6 + R4 增补 7-9 条） |
| 语料模板 | `templates/governance-corpus/memory/*.md`、`templates/governance-corpus/coding_guide/CodingGuide.md` |
| 实现与测试 | `scripts/bootstrap-knowledge-target.sh`、`tests/bootstrap-knowledge-target.test.sh`（场景 52-88） |
| 本机路径映射 | 公司机复审包 zip → `D091-R3-review.md` + `evidence/r3-*`；`/tmp/d091-r4-verify/`（R4 反例复跑工作区）→ `evidence/r4-*` |

复现方法：
```bash
cd /Users/eric/meicai/projects/ai-sdlc-standard-governance-corpus-worktree
bash tests/bootstrap-knowledge-target.test.sh          # 期望 778 passed 0 failed
/bin/bash tests/bootstrap-knowledge-target.test.sh     # Bash 3.2 同期望
# 真实仓只读预演（本机路径）：
bash scripts/bootstrap-knowledge-target.sh /Users/eric/meicai/projects/logistics-center --adopt-governance-corpus --plan
```

## 9. 恢复后的第一步与建议顺序

1. **第一步（唯一入口）**：把
   `docs/handoffs/2026-09-07-governance-corpus/review-prompts/D091-R4-review-request.md`
   交给独立复审会话，对 R4 修复轮提交执行 D091-R4 复审（复审需自行重跑回归矩阵、
   反例探针与真实仓只读预演；本机业务仓路径见 §7 表）。
2. 复审 PASS → 交 Owner 做收口裁决（四仓正式收编执行授权、Decision-091 状态改注、
   合并策略）；裁决后再按 RESUME §2 排除清单以外的授权推进四仓执行。
3. 复审出新阻塞 → 按其修复边界在本分支继续 R5 修复轮（流程同本轮：修复 → 补场景 →
   双 bash 全量 → 更新 Decision 注记 → 提交 → 再审）。
4. 始终：不使用 SDLC/DocFlow 治理；不动 G4/D087 工作线与其主工作区；不消费收口或
   发布授权；不合并、不 rebase、不改 Control Plane；不自证 PASS。
