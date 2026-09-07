# RESUME — D091 治理语料收编与生成（R5 交付后交接，2026-09-08）

> 恢复入口：先读本文件，再按「关键材料路径」导航。本线**不使用 SDLC/DocFlow 治理**，
> **不修改 G4（D087/C03-E）工作线**，**不消费任何收口或发布授权**——D091 的收口裁决权
> 在 Current User，且以 D091-R5 复审 PASS 为前置。

## 1. 线路与 SHA

| 项 | 值 |
| --- | --- |
| 工作目录（worktree，**本机 = 家用机 eric**） | `/Users/eric/meicai/projects/ai-sdlc-standard-governance-corpus-worktree`（公司机路径为 `/Users/eric_shaoooo/...`，两机分支同名） |
| 分支 | `codex/d088-governance-corpus`（基线 `9e6e0c7e2b3384a83337c90b86863493b2c1c206`，即 D087 G4-R6 rework 后主仓 HEAD） |
| 提交链 | `9e6e0c7` → `cc10bbb`（首轮）→ `f3faac8`（R2 修复）→ `eb4bb23`（R3 修复）→ `792f377`（R3 交接 docs）→ `8454834`（R4 修复）→ `cb8bc21`/`7d3ad3d`（R4 交接 docs）→ `3b167eb`（R5 修复）→ `41dd8da`/`5ea628e`（R5 交接 + PASS 归档）→ `2ec9875`（Owner 指示的措辞提交，**本地未推送**） |
| 最新独立复审覆盖的精确 SHA | `41dd8dad99ac1f600bb6fea92223f0b8191ccf9e`（对象 `7d3ad3d..3b167eb`，D091-R5，结论 **PASS**） |
| R5 修复轮提交 | `3b167eb7426ab609493c8668652cf27f5a249afe`（代码+决策+规格）；交接 docs `41dd8da…`；**R5 复审 PASS**（报告入仓 `D091-R5-review.md`，独立证据 `evidence/r5-independent-*`）；R5 复审请求由实施会话在会话中提供（Owner 偏好不落盘） |
| 远端 | `origin/codex/d088-governance-corpus`：R5 全部提交 + 措辞提交 `2ec9875` + 本裁决记录均已推送（Owner 2026-09-08 追溯确认推送需求——跨机收口需要远端可取） |
| 主工作区（勿动） | 家用机 `/Users/eric/meicai/projects/ai-sdlc-standard` @ `feature/c03-e5-autonomous-acceptance`，归 D087 会话；本线全部工作只在上述 worktree |

## 2. 需求、授权范围与排除项

- **授权依据**：`owner-task-brief.md`（Owner 2026-09-07 任务书，三硬要求：存量兼并吸收 /
  缺失生成 / 幂等不覆盖）。方案经 Owner 计划审批后实施。
- **合同**：`docs/decisions/Decision-091-governance-corpus-adoption.md`（六项决策 + 五轮
  修复注记）+ `docs/reports/d088-01-v3-behavior-spec.md` v1.4.0「v3.1 附录」节（1-6 条 +
  R4 增补 7-9 条，第 8 条含 R5-B1 修订）+ `docs/decisions/README.md` 索引行。
- **明确排除（不得顺手处理）**：D087 runtime/gateway/finding/recovery；四个业务仓
  （logistics-master/logistics-center/wms-portal/wms-monitor）的正式执行与 routed 收口；
  wms-portal 域拆分；logistics-center 业务域重号；wms-monitor 旧映射转 confirmed；
  `.specify/project-context/` 与 `business-domain-bootstrap.yaml` 扩展收编；全局 Skill
  安装；push 之外的合并/Control Plane 登记；C05 验收。

## 3. 已完成内容（累计）

初始化器 `scripts/bootstrap-knowledge-target.sh`（含内嵌 Ruby）+ 7 份语料模板
`templates/governance-corpus/`（memory 6 + coding_guide 索引）+ 回归套件（场景 52-90）：

1. **收编（存量）**：C11/C12 确定性转换；9 条有序规则；逐规则计数入报告；
   不可转换段落入 `pending_confirmation`。
2. **生成（缺失）**：INIT/AUDIT create-if-missing 7 份骨架（防占位守卫）。
3. **显式入口**：`--adopt-governance-corpus`（复用 PLAN_SHA/DP1/两阶段事务/回滚/双报告）。
4. **安全硬化（R2-R5 修复累计）**：R2/R3/R4 各项见 Decision-091 注记；**R5 新增（B1）**——
   转换回执（`total\tsha256`）在目的地写入成功后立即输出（`STDOUT.flush`），规则日志
   追加改入 begin/rescue；调用方 `|| rc=$?` 脱离 errexit 路径，**凭回执独立于退出码先行
   登记所有权**再判定成败（写后失败按自有对象回滚，报告保持如实 ROLLED_BACK、冲突为空）；
   回执缺失/不可信的目的地列入 `MIG_CORPUS_TRANSFORM_UNRESOLVED`——不重采样、不无条件
   删除，可证明原始字节完好则完整回滚，否则三处回滚状态计算点统一降级
   FAILED_ROLLBACK_INCOMPLETE 并注明 `recovery not provably complete`。
5. **报告**：迁移报告含 `corpus_transformations`、`pending_confirmation`、
   `original_archive` 绑定、`rollback.ownership_conflicts`；AUDIT 报告含语料 skip 段
   （unsafe 路径、根不安全、旧源存在、模板缺失全部持久化），Write Boundary 声明已更正为
   「补缺失机器件与语料骨架；既有对象一律不改写」。

## 4. 复审史与当前未关闭层

| 轮 | 对象 | 结论 | 修复 |
| --- | --- | --- | --- |
| R1 | cc10bbb | FAIL（7 阻塞） | R2 关闭 |
| R2 | f3faac8 | FAIL（B1-B5） | R3 关闭（B4/B5 获复审 CLOSED） |
| R3 | eb4bb23 | FAIL（F1-F3，B4/B5 CLOSED） | R4 关闭（F3/S1/S4 获复审 CLOSED；F1/F2 判 PARTIAL，其余根因已闭） |
| R4 | 7d3ad3d | FAIL（1 项 P2：B1 转换写后失败未登记所有权） | R5 关闭（B1 五项核对全 CLOSED） |
| R5 | 41dd8da | **PASS**（阻塞 0；非阻塞建议 1：回滚提示措辞统一，不重开 B1） | —（待 Owner 裁决定夺） |

R4 复审其余判定（供参考）：F1 原越界根因 CLOSED（非目录 `.sdlc` 根的既有 mkdir 退出
路径为零写入基线行为，复审列为非阻塞差异——已在 Decision 注记 5 据实记录）；F3/S1/S4
CLOSED。R5 复审独立证据：29 项探针 + 流式回执探针（FIFO 无读取端时回执已产出，证明
不依赖退出冲刷）+ 双 bash 800/0 + 边界矩阵 + 真实仓只读预演，全部入仓
`evidence/r5-independent-*`。

**当前唯一未关闭层：Current User 收口裁决的剩余事项**——四个业务仓正式收编执行授权、
Decision-091 状态终值改注、本地措辞提交 `2ec9875` 的推送授权。**集成策略已裁决为
方案 B**（暂缓合入 loop-v1，待 D087 收口并获准集成后再核对拓扑/依赖/diff 并另行提出
方案，见 §8.2）。复审 PASS 不代行这些授权。

## 5. R5 修复的复现条件、代码位置与回归矩阵

> 修复边界原文见 `D091-R4-review.md`（B1）：「限定在转换回执、失败结果捕获、所有权
> 登记与回滚判定：保留内存摘要模型，保证写入副作用在失败路径上仍有可信归属依据；
> 无法证明完整恢复时如实报告 INCOMPLETE。不能重新采样可变目的地补登记，也不能无条件
> 删除。」

- **复现**（复审方 `evidence/r4-independent-reproduce-b1.py`）：真实 transformer 写入
  目的地成功后、回执输出前规则日志追加 `Errno::EACCES`（shim 在日志追加前把日志文件
  chmod 0444，不改目的地、不伪造返回值）→ 旧行为：errexit 直接进 EXIT 回滚、所有权
  未登记、自有转换产物残留、冲突清单错报为后来者对象、报告假称 FAILED_ROLLED_BACK；
  adoption/LEGACY × memory/coding_guide 4/4 复现。同根因变体：写后返回非法 count/
  非法 digest/空输出。
- **代码**：`corpus_transform_file`（回执前置 + `STDOUT.flush` + 日志追加 begin/rescue）；
  apply 转换 pass（`|| transform_rc=$?` 脱离 errexit；`receipt_ok` 只看回执格式，
  **独立于退出码**；有回执 → 先登记 `MIG_CORPUS_TRANSFORM_DIGESTS` 再按 rc 判成败；
  无回执 → 目的地入 `MIG_CORPUS_TRANSFORM_UNRESOLVED`）；`mig_rollback` 语料 not-owned
  分支按未决集合注记冲突并置 `MIG_UNRESOLVED_RESIDUE`；三处 `mig_rb` 计算点
  （script_exit_guard / 残留门失败 / mig_fail_rollback）未决残留强制 INCOMPLETE。
- **回归矩阵**（套件 89-90 + 复审方复现器改造版）：
  - 场景 89（log 追加失败经 unwritable-path shim）：exit 1、源恢复、自有转换产物按
    所有权撤销、归档清理、FAILED_ROLLED_BACK、ownership_conflicts 空、无 tmp 泄漏；
  - 场景 90 garble/empty（回执污染/缺失，写盘已发生）：exit 1、源恢复、**目的地保留**
    （不无条件删除）、FAILED_ROLLBACK_INCOMPLETE、`recovery not provably complete`
    注记、自有归档清理、无 tmp 泄漏；
  - 既有 83/75（登记后/移动后接管）与 86（归档接管清理）语义不回归；场景 81 补 else
    断言。

## 6. 已执行测试与结果（对应 R5 提交）

| 命令 | 结果 |
| --- | --- |
| `bash tests/bootstrap-knowledge-target.test.sh` | **800 passed 0 failed ALL GREEN**（默认 bash） |
| `/bin/bash tests/bootstrap-knowledge-target.test.sh`（macOS Bash 3.2） | **800 passed 0 failed ALL GREEN**（两入口同二进制 3.2.57，两遍完整执行） |
| `bash -n`（脚本 + 测试） | 通过 |
| 复审方 B1 复现器原样运行 | 在修复后代码上恰好断言失效于「自有残留存在」这一旧断言（行为已翻转） |
| 复审方 B1 复现器固定语义改造版 | 4/4 组合闭合：exit 1、双源恢复、dst 无残留、FAILED_ROLLED_BACK、conflicts []、无 tmp（`evidence/r5-b1-closure-probe.py` / `r5-b1-closure-results.json`） |
| 复审方 R3 反例套件复跑 | 11/11 安全闭合（`evidence/r5-r3probe-rerun.json`） |
| 真实仓只读预演（R5 代码重跑） | logistics-center `--adopt-governance-corpus --plan` exit 0、158 行（36 TRANSFORM + 122 RETIRE，本机 LEGACY 全量态）、BLOCKED=0、指纹不变；logistics-master `--dry-run` exit 0、指纹不变 |

运行环境：macOS（darwin arm64，25.6.0）；双 bash 入口均 3.2.57；BSD mv/cp/find；diff
零 TS 文件不适用 tsc/npm；分支无远端 CI 工作流。**尚未验证 / 不作为当前证明**：R5 提交
未经独立复审；GNU coreutils 未实测；四业务仓未做任何正式执行。

## 7. 关键材料路径（仓内相对路径）

| 材料 | 路径 |
| --- | --- |
| 本交接主文件 | `docs/handoffs/2026-09-07-governance-corpus/RESUME.md` |
| 历轮复审原文 | 同目录 `D091-R1-review-transcript.md` / `D091-R2-review.md` / `D091-R3-review.md` / `D091-R4-review.md` |
| Owner 任务书 | `owner-task-brief.md` |
| R4 复审请求 | `review-prompts/D091-R4-review-request.md`（R5 请求由实施会话在会话中提供，合同基线 = R4 FAIL/B1 + §5 修复边界） |
| R4 复审方 B1 复现器与结果（原样入仓） | `evidence/r4-independent-reproduce-b1.py` / `r4-independent-reproduce-b1-results.json` |
| R5 闭合证据 | `evidence/r5-b1-closure-probe.py` / `r5-b1-closure-results.json` / `r5-r3probe-rerun.json` / `r5-regression-default.log` / `r5-regression-binbash.log` |
| 决策记录 | `docs/decisions/Decision-091-governance-corpus-adoption.md`（六项决策 + 五轮注记）、`docs/decisions/README.md` 索引行 |
| 行为规格附录 | `docs/reports/d088-01-v3-behavior-spec.md` v1.4.0「v3.1 附录」（1-6 + 7-9，第 8 条含 B1 修订） |
| 实现与测试 | `scripts/bootstrap-knowledge-target.sh`、`tests/bootstrap-knowledge-target.test.sh`（场景 52-90） |

复现方法：
```bash
cd /Users/eric/meicai/projects/ai-sdlc-standard-governance-corpus-worktree
bash tests/bootstrap-knowledge-target.test.sh          # 期望 800 passed 0 failed
/bin/bash tests/bootstrap-knowledge-target.test.sh     # Bash 3.2 同期望
bash scripts/bootstrap-knowledge-target.sh /Users/eric/meicai/projects/logistics-center --adopt-governance-corpus --plan   # 只读预演
```

## 8. Owner 收口裁决记录与当前状态（2026-09-08）

1. **非阻塞措辞建议已落实**（Owner 指示）：本地提交 `2ec9875`——两处 "ROLLED BACK"
   提示区分未决残留态、失败报告 Markdown 引导句不再将回执缺失对象笼统称为后来者；
   双 bash 800/0 复跑。**未推送**（Owner 消息未授权 push）；PASS 认证基线 `41dd8da`
   不受影响，`2ec9875` 为其后的纯措辞增量。
2. **集成裁决 = 方案 B（暂缓合入）**：D091 暂不合入 `feature/loop-runtime-v1`；
   D087 按原授权继续推进，不因 D091 集成修改或暂停其工作区，不阻塞其后续复审。
   保留 D091 独立分支、认证基线 `41dd8da` 与本地措辞提交 `2ec9875`。
   **待 D087 收口并获准集成至 LOOP 主线后**，再核对最新提交拓扑、依赖覆盖与最终
   diff，优先以普通 merge 保留历史，并在独立集成 worktree 补充适当验证；届时另行
   提出具体集成范围与合并方案，不预先保证无冲突。
   核查结论的记录措辞（Owner 修正）：
   - 未**找到**覆盖继承历史的集成授权——不断言历史授权严格为空；
   - d088-01 初始化器谱系 16 提交为**候选依赖集**，依赖闭合未证明；
   - 初始化器脚本/测试/模板在 loop-v1(9990b04) 上不存在这一事实维持不变，
     它只支持"D091 的 11 个提交无法脱离基础谱系独立落地"，不外推其他结论。
   **"先合入 c03-e5（D087 分支）"的评估（2026-09-08，未执行）**：技术上无冲突
   （两线自身增量文件不相交），但操作上 c03-e5 检出在 D087 主工作区（合并要么在
   主工作区做、要么强推其远端 ref，均属干扰 D087 会话）；时序上 D087 正处
   G4-R8 rework 循环，插入其未知的 merge 提交会给下一轮 handoff/复审引入计划外
   变更面；授权语义上 D091 借道 c03-e5 进主线等于用 D087 的集成授权承载 D091，
   D091 失去独立集成核对点。维持方案 B 顺序；若 Owner 未来裁决"合并收口一次性
   集成"，应归入 D087 收口范围、由 D087 会话执行并在其集成范围中显式声明 D091。
3. **剩余 Owner 事项**：四个业务仓正式收编执行授权；Decision-091 状态终值改注；
   本地措辞提交的推送授权；D087 收口后的集成核对启动。
4. 始终：不使用 SDLC/DocFlow 治理；不动 G4/D087 工作线与其主工作区；不消费收口或
   发布授权；不合并、不 rebase、不 cherry-pick、不改 Control Plane；不自证 PASS。
