# G6-T2-REVIEW-R1 复审任务 —— parity harness M1 12/12（S-CORE 首轮交叉，产物层）全量、只读、根因合并式评审

## 0. 判定纪律（先读，约束全文）

- 你是本轮唯一判定者。整改方的 PR 描述、自证矩阵与提交信息只证明其声称属实，不进入判定链；M1 是否构成 M2 的可靠基线，一律以你对三个根因的独立闭环核验、真实形态对照与推演复跑为准。
- 最终结论以一行总判定开头：**PASS**（M1 12/12 可作为 M2 基线，G6-T2 继续推进）或 **FAIL**（列阻塞项）。同一问题合并编号（G6T2-R1-H#…）；每项阻塞四要素齐备：合同/实现矛盾的具体条文或行为、冻结规格或代码位置、修正边界、回归核验——缺一不成项。
- 以下事项不得回退或重复上报：①Current User 2026-09-21 对场景模型的裁决（FAIL/BLOCKED_UNKNOWN 首轮含一轮返工 wave，即真实手动流程）；②冻结规格 §6 已列为「有意为之」的实现选择；③挂账两项（生产默认轮数、journal 级回流显式上限）明确不在本 PR 范围——除非指出具体合同条文使其成为范围内问题。

## 1. 范围与基线（先核对，再审查）

开工前逐项核对并报告：复审副本 HEAD 精确为 `55eed1a`（分支 `feat/g6-t2-parity-harness`，已推送 origin，PR #195，base `feature/loop-runtime-v1` @ `8f74089`）、副本干净、`npx tsc --noEmit` 退出 0、Node v24.x。任何一项不符，先报告差异再决定是否继续。

- 复审工作区：自建独立副本（`git worktree add /tmp/g6-t2-review-r1 55eed1a`，node_modules 可 symlink），全程只读：不改 tracked 代码、不提交/推送、推演脚本只放副本内未 tracked 临时目录。主工作区归实施会话，不得触碰。
- 主审范围：`git diff 8f74089..55eed1a` 全量——`tests/g6-parity/`（types.ts / fact-scripts.ts / manual-face.ts / runtime-face.ts / comparator.ts）、`tests/g6-parity-matrix.test.ts`、`docs/handoffs/2026-09-18-audit-matching-fix/G6-T2-HANDOFF.md`，以及上一会话已入分支的 `docs/reports/decision-090-g6-parity-acceptance-spec.md`（裁决 B 修订，`30a6edd`）。**产品运行时代码必须零 diff**（核对对 `core/`、`runtime.ts`、`scripts/`、`loop/`、`skills/`、`templates/`、`ai-sdlc/` 零触及，发现即为越界阻塞）。
- 验收权威：冻结规格 `docs/reports/decision-090-g6-parity-acceptance-spec.md` §3（52 场景矩阵与剪枝）、§4.1（九维）、§4.2（两层比较与剔除集）、§8（完成门三项）；合同口径 `docs/LOOP_CORE_CONTRACT.md`；store 校验 `core/loop-capability-execution.ts`（事件级 + 链级）、`core/loop-artifact-revision.ts`（revision 合同）、`core/loop-finding-lifecycle.ts`（finding 生命周期）、`core/loop-manifest-projector.ts`（takeover-B 对账）。
- 已知边界（不阻塞）：产物层只判定九维中的 3 维（artifact-paths / version-state / finding-identity，见 comparator.ts 的维度映射）；行为层 6 维与其余 40 场景属 M2；runner 自报「artifact layer only」诚实，不得要求产物层越界判定行为层。

## 2. 方法要求（先建两张清单，再统一输出发现）

1. **verdict 终态合法性清单**：对 PASS / PASS_WITH_RISK / FAIL / BLOCKED_UNKNOWN 四种 verdict，逐项对照 harness 构造的事件形状与 store 全部校验分支——事件级（`validateLoopCapabilityExecutionEvent`：succeeded 必须携 output+gate+eligibility、decisionStatus 只在 succeeded verdict、CONFIRMED/ESCALATED 需 depth、BLOCKED_UNKNOWN 需显式 null depth、succeeded verdict 必须 materialize scope+delta）、链级（`validateLoopCapabilityExecutionChain`：attempt 递增、canonical advance 需前一事件 eligibility=ELIGIBLE、restart 需上游产出复用与 finding 授权）、revision 合同（FAIL 不得成为 gate revision）。任一形状在任何校验分支下非法即为阻塞。
2. **takeover-B 对账不变量清单**：B2（`reconcileJournalAgainstManual`：status 字面 / digest 字面 / 路径语义键 / gate triple 字面）、finding 配对（`takeover()`：evidence digest 或 ref + discovered_at 相等）、闭捆校验（`checkFindingIndex`：RESOLVED 行 closure_evidence_digest 与 closure_bound_revision_id 对 runtime finding 字面）、归一化剔除集（NORMALIZE_DROP_HEAD/ENTRY 之外任何字段差异即 FAIL）。

## 3. 三项根因闭环验证（逐项 CLOSED / NOT_CLOSED + 独立证据）

### G6T2-R1-H1 verdict 终态模型纠偏

a) 确认交接文件原计划的两种终态确为 store 非法（blocked verdict 禁令 `core/loop-capability-execution.ts:513-515`；failed 携结果字段禁令 `:519-527`）——复现这两个拒绝；
b) 确认现行 canonical 形状（verdict 永远 succeeded、渲染决策 triple）与三方证据一致：WP6 测试注释（`tests/loop-wp6-completion-contracts.test.ts`「a SUCCEEDED verdict must materialize its decision triple even when the adjudication is FAIL」）、d087 场景 2（FAIL verdict succeeded + eligibility=BLOCKED）、G5-T2 投影器测试（BLOCKED_UNKNOWN = FAIL 裁决 + 显式 null depth）；
c) 确认非通过 verdict 未越权产出 gate revision（`materializeProducerRevision` WP6 规则 + `createLoopArtifactRevision` 对 FAIL 的拒绝均未被绕过——实测 FAIL 场景 gate revision 恰 1 个且 gateResult=PASS）；
d) 确认链密封语义（非通过 verdict 后链校验器拒绝 canonical successor）未被 harness 绕过。

### G6T2-R1-H2 返工 wave（d087 pattern）

a) finding 注册授权回退：确认注册时机（FAIL verdict 终态之后、design v2 之前）、锚定被审 design current revision、注册即时将 design v1 置 STALE（`appendFinding` 失效逻辑），且回退重启经 store `regateChainContextInTransaction` 实时授权（非 harness 自行放行）；
b) per-execution-point 输入规则：确认 restart 事件输入=上游 point 最后成功产出（intake 产出），而非脚本上一节点产出——对照链校验器「restart input must match the reused upstream output」；
c) attempt 贯穿：design v2 / scan v2 / verdict v2 的 attempt=2，semver 由 attempt 推导（`materializeProducerRevision`：`${attempt}.0.0`）与手动面 entry-update version 一致；
d) 闭捆正确性：`resolveFinding` 的 resolvedByNodeId= discovering node、resolvedByRevisionId 存在且为 solution-gate 当前 ACTIVE revision、evidence blob 经 `verifyFindingEvidenceBlob` 验证；手动面 `--bound-revision-id` / `--evidence-digest` 与 runtime 侧字面一致（`checkFindingIndex` 的两项断言）。

### G6T2-R1-H3 B2 墙的必要性与充分性

a) **必要性复现**：在独立副本用现行 canonical 模型复跑两个实验——手动面发布 FAIL gate 行（current+triple）→ 期望 `B2 reconciliation drift at solution-gate.status: journal pending vs manual current`；手动面不发布（pending 无 triple）→ 期望 `B2 reconciliation drift at solution-gate.gate_result: journal FAIL vs manual undefined`。两个 STOP 必须复现，否则「wave 为必要」的论证不成立；
b) **充分性**：现行 wave 模型 12/12 全绿，且抽验场景的终态是「PASS verdict  authored gate revision → 两面 gate 行 current + PASS triple 逐字段一致」，即收敛点是 revision 合同可表示的状态；
c) 确认 harness 未为迁就 parity 而篡改任何 journal 事实（finding 注册/关闭均经 store 公开 API、事件形状全部 store 合法）。

## 4. 回归排查（不限于修复点）

- 边界：`git diff 8f74089..55eed1a` 对 `core/`、`runtime.ts`、`scripts/`、`loop/`、`skills/`、`templates/`、`ai-sdlc/` 零触及（实测仅 tests/ + docs/）；
- 真实 publisher（`scripts/publish-requirement-manifest.sh`）零 diff——parity 对照物未被改动；
- 全量回归：168 TS 文件 1767 passed / 0 failed；T5 parity 32/0、YAML 矩阵 150/0、投影器 122/0；三个 shell 套件（ruby@3.3 PATH 前置）manual-chain 106/0、bootstrap 820/0、audit-entry-coverage 34/0——逐项抽查存在性与关键行；
- 复用模式未回归：wave 的 finding 模式即 T5 parity 已验证模式（finding + design v2 + resolveFinding），T5 全绿即该模式回归证据。

## 5. 推演验证（证明 M1 构成 M2 基线的最强独立证据）

在独立副本完成以下推演（推演脚本只读副本内运行）：

| 推演门 | 方法 | 期望 |
| --- | --- | --- |
| wave 真实性 | 跑 STANDARD-FAIL 场景，dump journal verdict 事件 / gate revisions / findings | verdict 事件 2 条（attempt1 FAIL/CONFIRMED/STANDARD/BLOCKED + attempt2 PASS/ELIGIBLE）；gate revision 恰 1（PASS，semver 2.0.0）；finding RESOLVED 且 bound=该 revision |
| 两面终态一致 | dump 两面 manifest 的 solution-gate 行与 finding 行 | 逐字段一致（current + 2.0.0 + 同 digest + PASS/STANDARD/CONFIRMED；finding RESOLVED + 同闭捆） |
| B2 墙复现 | 见 §3-H3(a) 两实验 | 两个指定 STOP 逐一复现 |
| 重放稳定性 | 对同 store 二次投影 | NO_OP 且 manifest 逐字节一致 |
| 损坏注入 | 篡改 manual gate 行 decision_status 后重封 digest 再投影 | `JOURNAL_MANIFEST_MISMATCH_STOP`（fail-closed） |
| BLOCKED_UNKNOWN 同构 | 对 STANDARD-BLOCKED_UNKNOWN 重复上述 dump | verdict attempt1 gate=FAIL/decisionStatus=BLOCKED_UNKNOWN/depth=null；其余同 FAIL 形状 |
| runner 诚实性 | 读 `tests/g6-parity-matrix.test.ts` 输出文案 | 「artifact layer only: 3 of 9 dimensions」明示，无将产物层 PASS 谎报为九维 PASS |

## 6. 有意为之的实现选择与已知事实（不得作为缺陷上报）

- **返工 wave 场景语义**：Current User 2026-09-21 裁决——FAIL/BLOCKED_UNKNOWN 首轮场景含一轮返工后重裁 PASS（真实手动流程：失败→返工→重裁，两到三轮可接受）；规格 §3「首轮=一次通过/一次裁决」的字面读法已由该裁决替代（BLOCKED_UNKNOWN 剪枝注记「走回流映射」同向支持）。多轮失败变体与超限暂停场景归升档/Re-Gate 坐标（后者产物层无法 parity，只能作行为层断言）。
- **产物层判定 3/9 维**：冻结规格 §4.2 两层比较的 staging 决定；行为层 6 维 + full-chain 驱动器属 M2。
- **finding id 两面不同**（手动面 `<req>-F01` vs runtime `loopFindingId`）：配对按 evidence digest/ref + discovered_at（投影器既有规则），provenance map 承载映射——T5 同款先例。
- **手动面 finding-register 先于全部 entry-update**：publisher 无顺序约束（只校验节点已知/证据 ref/ID 唯一），manifest 结果等价。
- **手动面闭捆用 runtime 风格 revision id 字符串**：T5 fixture 同款约定；`checkFindingIndex` 只断言 digest 与 bound revision 字面相等，两侧按 `runtimeRunId` 约定构造。
- **BLOCKED_UNKNOWN 的 gate 裁决为 FAIL + 显式 null depth**：G5-T2 投影器冻结形态（「UNKNOWN verdict folds a null decision_depth with the FAIL adjudication」）。
- **挂账两项不在本 PR**：生产默认轮数 2→3（`maxDesignRounds` 硬顶 2，超限 paused/DESIGN_REVISION_EXHAUSTED 已存在）；journal 级回流 wave 无显式轮数上限（现依赖 finding 生命周期间制）。均已写入交接文件待单独决策。

## 7. 自证基线（整改方声称——仅供核对，不构成关闭证据）

精确 HEAD `55eed1a`，已推送 origin，PR #195（base `feature/loop-runtime-v1`），工作区干净。整改方声称：g6 矩阵 12 passed / 0 failed；tsc 0；全量 1767 passed / 0 failed（168 文件）；T5 32/0、YAML 150/0、投影器 122/0、manual-chain 106/0、bootstrap 820/0、audit-entry-coverage 34/0；wave 抽查（§5 表前三行）已由整改会话执行且结果如上——对以上逐项核对存在性与关键行；核对通过不减少你的独立执行义务。

## 8. 输出要求

1. 总判定一行：**PASS / FAIL**；FAIL 时给出合并后的阻塞列表（每项四要素齐备）。
2. §3 三项根因逐项 CLOSED / NOT_CLOSED + 独立证据锚点（文件:行 + 复现命令/输出）。
3. §2 两张清单随报告输出（verdict 终态合法性表、takeover-B 对账不变量表）。
4. §5 推演验证结果表（每门 符合/不符合 + 定位）。
5. 建议项单列（不阻塞），注明依据。
6. 明确排除（不属本任务）：M2 其余 40 场景与行为层 full-chain 驱动器；多轮失败/超限暂停变体；挂账两项的决策与实施；run8/C03-E/C05；真实 Agent CLI / 业务仓写入；产品运行时代码修改；push 之外的合并与 Control Plane 登记。
7. 若 PASS：明确声明 M1 12/12 构成 M2 可靠基线、G6-T2 可继续推进，并列明 M2 开工前必须承接的约束（产物层 3 维判定边界、wave 模式复用范围、runner 诚实性要求）。
