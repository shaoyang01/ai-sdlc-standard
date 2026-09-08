# C03-E 项目治理恢复报告（2026-08-30）

> 触发：Current User 指令——W6b4 复审结论回收后，做一次项目治理的恢复。
> 范围：产品仓工作树、Control Plane 状态、跨仓（Exchange / PKB）治理一致性。
> 性质：**只做事实核查与状态对齐，不做未经授权的发布或合并**。所有需 Current User 授权的动作均在第五节列出。

---

## 一、W6b4 复审结论（已回收）

独立聚焦复审返回 **CLOSED，零阻塞**。核心证据：

- **门控正确性 a)–e) 全部 CLOSED**：`changedPaths` 唯一读取点在 `core/loop-git-workspace.ts:300-301`（被 `allowedPaths !== null` 门控），数据流无漏口；`allowedPaths === null` 调用方门控前后行为**逐字段一致**，唯二可观测差异就是改动本意（少一个子进程、消掉 `_gitR` 的 `GIT_COMMAND_FAILED` 失败面）；`allowedPaths: []` 实测仍跑 diff 并正确 block（**未过度收紧**）；校验（`:459-465`）严格先于门控（`:540`），无短路依赖。
- **回归矩阵全绿**：`loop-git-workspace` 110、`loop-w6b3` 45、`loop-codex-implementation-adapter` 354/354、`loop-w6b2` 83。
- **探针**：P6（去门控）恰 T10a 红、T10b 绿，与实现方口径逐字一致；P8 证明 `--name-only` 区分条件承重。
- **diff 核验**：`1605a84` 恰两文件（生产 +10/-1 其中 8 行注释；测试 +56），W1～W6b3 冻结面与 real 休眠面零改动。
- **复审方环境全套件**：146 文件 / 0 失败 / exit=0 / 320.6s。两个已知 broker 缺口文件与 adapter flaky 在复审方环境均不复现，维持「环境能力缺口 / 观察项非归因」口径。

**建议项 P7（1 条，合同外、非阻塞）**：现有测试网抓不住「门控误写成 `allowedPaths.length === 0` 也拒」这种**过度收紧**——T10b 用 `["src"]`，而空数组 `[]` 目前靠 adapter 层（`tests/loop-codex-implementation-adapter.test.ts:953`）拒为 `INVALID_INPUT` 兜底，**到不了 cleanup**。建议补一条 **T10c**：`allowedPaths: []` + 已提交越界文件 → `CLEANUP_BLOCKED` 且 named diff 恰跑一次。

> P7 未在本轮实施。W6b4 已 CLOSED，按纪律不夹带；待 Current User 裁决归属（单开微波 or 并入 W7 之后）。

---

## 二、已完成的恢复动作

| # | 动作 | 结果 |
| --- | --- | --- |
| R1 | 主工作树从游离 `1605a84` 切回 `feature/c03-e1-e4-runtime-implementation` | ✅ HEAD = `0c0c458`，工作区干净（仅 `.workbuddy/` 未跟踪） |
| R2 | 游离提交 `2cacb39` 处置 | ✅ 内容已与分支 `c11a641` 逐字一致（77 行），可安全丢弃，无需 cherry-pick |
| R3 | CP W6b4 pass-state | ✅ 分支 `docs/c03e-w6b4-pass-w7`，提交 `bc06c42`，**PR #26** 已开；`ruby tools/validate_state.rb` **PASS v2** |
| R4 | CP STATE 三字段更新 | ✅ `condition_ref`（472 字符，上限 500）、`product_commit` → `1605a8471df2c8bea58f01cafb1ff59ac3f67b6b`、`observed_at` 刷新 |
| R5 | 产品仓台账 / handoff 落 W6b4 结论 | ✅ 已改，见第三节清单 |
| R6 | 更正上轮错误结论 | ✅ `c03-e-exchange-pkb-archive-rehearsal.md` 问题 2 已改写（详见第四节 G5） |

---

## 三、产品仓文档改动清单

- `docs/reports/c03-e-e1e4-task-set-and-gate-audit.md`
  - E4-T5 行：W6b4 → **聚焦复审 CLOSED 零阻塞 → ✅ PASS，CP PR #26 待合并**；附 P7 建议项。
  - 波次链：W6b4 节点同步更新。
- `docs/reports/c03-e-e1e4-integration-handoff.md`
  - 快照标题：W6b4 **✅ PASS**。
  - W6b4 段落补入复审核心证据（五条）、建议项 P7、复审方的「仓库不干净」过程发现与纪律修正。
  - HEAD 前序链补 `e8e86ce` / `c11a641` / `0c0c458`；新增 CP PR 状态行（#22–#25 已合，#26 待合）。
- `docs/reports/c03-e-exchange-pkb-archive-rehearsal.md`
  - 问题 2 整节重写（结论推翻）；新增问题 2b（CP 与 Exchange 状态口径不一致）。

---

## 四、跨仓治理状态核查（实况）

### 4.1 PKB（`shaoyang01/personal-knowledge-base`）

| 项 | 实况 |
| --- | --- |
| 默认分支 `main` | 停在 2026-07-13 `chore: initialize personal knowledge base`；`10-projects/` 下**只有 `.gitkeep`** |
| 事实分支 | **`feature/knowledge-base-v1`**（CP `projects/personal-knowledge-base/STATE.yaml` 的 `source_refs.fact_branch` 明确记载） |
| 该分支归档内容 | 64 个文件：`README.md`、`audits/`、`current.md`、`handoffs/`（最新 `2026-08-28-path-b-sole-production-path-a-frozen-d1f5643.md`） |
| 分支合并状态 | 7 条分支从 `main` 分出，**从未合回**；无 PR 流程（open PR 为空），全部直接 push |
| 归档截止点 | **2026-08-28**（commit `c3cb15ac`）——即 W1 之前 |

分支 ahead 数：`feature/knowledge-base-v1` 578、`feature/governance-state-convergence-r2` 570、`feature/governance-state-convergence` 566、`codex/pkb-m5-e1-activation-control-state-alignment` 350、`codex/m5-e1-pce-policy-zero-delta-profile` 345、`codex/m5-e1-stage-a-source-scope-correction` 345、`feature/m4-e4-kimi-legacy-retirement` 340。

### 4.2 Exchange（`shaoyang01/project-governance-exchange`）

| 项 | 实况 |
| --- | --- |
| C03-E 发布 topic | `06-governance-artifact-exchange`（topic 允许列表只有 04/05/06，不能新建） |
| run 总数 | 42（其中 topic06 内为需求级 run） |
| 最新 run | `20260828T141247Z-ai-sdlc-path-b-sole-production-path-a-frozen` |
| `current.yaml` 状态 | `review_status: proposed`、`authorization_status: pending`、`execution_status: running`、**`publication_status: not_published`** |
| 断更区间 | **W1 → W6b4，8 个波次，0 个 run** |

### 4.3 Control Plane（`shaoyang01/ai-project-control-plane`）

- `projects/ai-sdlc/STATE.yaml`：`publication.status: **COMPLETED**`，`target_archive.commit: c3cb15ac...`，`handoff_path: 10-projects/ai-sdlc-standard/handoffs/2026-08-28-path-b-sole-production-path-a-frozen-d1f5643.md`。
- `projects/personal-knowledge-base/STATE.yaml`：`route_state: IDLE_AWAITING_CURRENT_USER_SELECTION`，`lifecycle.status: IDLE`，`fact_branch: feature/knowledge-base-v1`。

---

## 五、漂移清单与待裁决项

| ID | 漂移 | 严重度 | 恢复方案 | 需谁授权 |
| --- | --- | --- | --- | --- |
| **G1** | PKB 归档主线在 `feature/knowledge-base-v1`，`main` 停在 7/13，7 条分支从未合回 | 低（**既有实践，非故障**） | ✅ **已裁决 2026-08-30**：保持现状。PKB 事实分支确立为 `feature/knowledge-base-v1`，`main` 不动；仅在文档固化该约定 | 已裁决 |
| **G2** | C03-E 的 **W1–W6b4 共 8 个波次在 Exchange 上 0 个 run** | 高（合规缺口） | ✅ **已裁决 2026-08-30**：**逐波不发**。W1–W6b4 的波次不再各自补 run；C-T2 时**一次性发一个收口 run**，并在 run 正文中显式声明覆盖范围 + 指向产品仓逐波台账作为补偿证据（详见 §6.1 偏差说明） | 已裁决；执行时仍需 owner 开 Issue |
| **G3** | PKB 归档止于 2026-08-28，W1–W6b4 无归档 | 高（与 G2 同一条链） | ✅ **已裁决 2026-08-30**：随 G2 一并在 **C-T2 一次性补归档**到 `feature/knowledge-base-v1` | 已裁决；`git push` 前仍需显式授权 |
| **G4** | ~~CP 记 `publication.status: COMPLETED` vs Exchange `publication_status: not_published`~~ | ~~中~~ → **无（误报，已撤回）** | ❌ **不是漂移**。经 `EXCHANGE_POLICY.md` §11 / §11.1 核实，两侧不同义也**不冲突**，各自正确，**不修正任何一方**。详见 §6.2 | 无需授权（已澄清） |
| **G5** | 实现方（本会话）上轮结论错误：「PKB 目录从未建立」「整条归档链首次建立」 | 低（已更正） | 已在 `c03-e-exchange-pkb-archive-rehearsal.md` 更正；成因是**只查了 `main` 分支** | 已完成 |
| **G6** | W6b4 复审开始时工作树不干净：HEAD 停在 `e8e86ce`，挂两处实现方探针残留（w6b3 测试文件的 T-probe 块、`loop-git-workspace.ts:540` 的去门控形态） | 低（复审方已还原，结论不受影响） | 纪律修正：反向探针一律在临时 `git worktree` 跑，禁止在主工作树留痕 | 已完成 |

---

## 六、裁决回填与两项更正（2026-08-30 Current User 裁决）

Current User 于 2026-08-30 对第五节四项作出裁决：**① 逐波不发（G2/G3 走 C-T2 一次性收口）；② 澄清 G4；③ P7/T10c 单开微波；④ W7 先不开；⑤ PKB 用 `feature/knowledge-base-v1`**。其中两类需要落到文档里。

### 6.1 G2/G3 偏差说明（deviation record）

既有实践是**逐包发布**：C01 用 11 个 run 覆盖 plan-acceptance → wp1~wp5 → closure，C02 用 8 个 run。`GOVERNANCE.md` §15.3.1 要求「独立复审改变 Gate 或把复审结果向前传递时必须产生 Handoff」——按此字面口径，W1–W6b4 每波都应当有一个 run。

裁决「**逐波不发**」意味着 C03-E 对该要求走**偏差路径**。为让偏差可审计，C-T2 的收口 run 必须满足三条：

1. **显式声明覆盖范围**：run 正文写明「本 run 覆盖 C03-E 的 W1、W6a、W6b1、W6b2、W6b3、W6b3-B1、W6b4 及 W6b5 全部执行波次」，而非只代表最后一波。
2. **指向逐波台账作为补偿证据**：run 正文与 manifest 的 `sources` 指向产品仓 `docs/reports/c03-e-e1e4-task-set-and-gate-audit.md`（逐波 Gate 记录）与 `c03-e-e1e4-integration-handoff.md`（逐波复审证据）。Exchange run 不可变，事后无法补历史，故台账即逐波事实的权威留存。
3. **不声称逐波已发布**：run 正文不得表述为「每波均已发布」，须如实写「波次级 run 未逐波生成，本 run 为 C-T2 一次性收口」。

> 此偏差的**批准人**为 Current User，**批准时间** 2026-08-30，记录于本节。C-T2 执行时须原样引用。

### 6.2 G4 更正：不是漂移，撤回

上一轮把「CP `publication.status: COMPLETED` vs Exchange `publication_status: not_published`」记为口径待澄清的漂移（G4）。**核查后判定为误报，予以撤回。** 依据是 Exchange 仓库 `EXCHANGE_POLICY.md` §11 / §11.1 的原文：

- §11 定义：`publication_status: published` means the material has been published to an explicit long-term target **outside** the Exchange. 即该字段描述的是**Exchange 传输管道自身的发布状态**，不是下游治理结果。
- §11.1 明写：publish-request v1 schema **intentionally pins** routine request metadata to `review_status: proposed`、`authorization_status: pending`、`publication_status: not_published`。这三个值是**故意钉死的 stage 值**，不是"还没办完"。
- §11.1 明写：These staging values **do not negate** controller decisions recorded in a Handoff body.
- §11.1 明写：No controller-only workflow, schema, Publisher mode, or status-upgrade run type is **currently implemented**. 也就是说，在当前 Publisher v1.1 下，routine run 的 `publication_status` **没有路径**变成 `published`。

而 CP 侧的 `publication` 块是另一回事：

```yaml
publication:
  required: true
  route: EXCHANGE_TO_PERSONAL_KB     # 归档路由：Exchange → PKB
  status: COMPLETED                  # controller 记录的归档结果
  exchange: { run_commit, pointer_commit, manifest_path, artifact_path, artifact_sha256 }
  target_archive: { repository: shaoyang01/personal-knowledge-base, commit: c3cb15ac..., handoff_path, current_path }
```

它记录的是**这次归档动作已完成**，且可验证——PKB `feature/knowledge-base-v1` 的 `c3cb15ac` 上确实存在 `10-projects/ai-sdlc-standard/handoffs/2026-08-28-path-b-sole-production-path-a-frozen-d1f5643.md`。

**结论：两侧记录的不是同一件事，各自正确，不修正任何一方。** G4 从漂移清单中移除。

> 附带观察（**不属于 C03-E 范围，不提议处理**）：Exchange 的 `publication_status` 字段在当前实现下无法表达"已归档到 PKB"这一事实，属 Exchange 仓库自身的机制缺口（其 §11.1 已自我申明未实现 controller-only 状态升级路径）。若将来 Exchange 需要该能力，应在其仓库单独立项。

---

### 6.3 第二批裁决：handoff 归属 + 复审 prompt 交付方式（2026-08-30）

1. **handoff 不再落产品仓**（Current User 裁决）。定位修正：handoff 是**过程性交接材料**，归 PKB 长期归档链（C-T2 时写入 `10-projects/ai-sdlc-standard/handoffs/`），不是产品仓的实施事实。产品仓的**台账**（`c03-e-e1e4-task-set-and-gate-audit.md`）才是实施事实权威，逐波状态、波次链、复审证据都在台账行内维护。
   - 会话中断恢复 = 台账 + CP `condition_ref` + 波次链，**不依赖 handoff 文件**。
   - **已提交的 handoff / 复审 prompt 文件保留不删**（历史事实，且无 CP 指针依赖，删除只产生噪音）；自 W6b5 收口起**不再新增**。
2. **聚焦复审 prompt 会话内直接输出**（Current User 裁决，见 §七附注）。prompt 是一次性内容，交由 Current User 复制给外部 agent；不再写 `docs/reports/`、不 commit。W6b5 的 prompt 文件是最后一个。

## 七、纪律修正（本轮教训）

1. **反向探针不得在主工作树进行**。本轮残留的 T-probe 块与去门控形态，正是此前为「抢答复审问题」而在主工作树连续跑两个探针留下的。复审方被迫先 `git checkout --` 还原才能切基线。今后：探针 → `git worktree add /tmp/xxx` → 跑 → `git status --porcelain` 留证 → `worktree remove --force`。
2. **跨仓核查必须列全分支再下结论**。G5 的成因就是只查了 PKB 的 `main`。同一类坑（用 `head` 截断结果）在本项目已第四次出现。
3. **CP 仓库的 `index.lock` 被 broker 拦截 unlink**，`find -delete` 静默失败（返回 0 但文件仍在）。有效解法：`python3 -c "import os; os.remove('.git/index.lock')"`，且**每条 git 命令前**执行一次。

---

## 八、为什么"混在一起"，以及修复办法

### 8.1 诊断：三条链被同时推进

W1–W6b3 阶段是**单链**：实现 → 复审 → 治理收口 → 下一节点，所以一次只需回答一个问题。到 W6b4 收口时，实际上有**三条独立的链**在跑，而我在同一个回合里跨链抛了五个问题：

| 链 | 内容 | 节奏 | 本轮状态 |
| --- | --- | --- | --- |
| **A 代码质量链** | W6b4 → W6b5 → W7(C-T1) | 逐波推进，每波独立复审 | W6b4 已 CLOSED；**W6b5 待开工** |
| **B 跨仓归档链** | Exchange run + PKB push | 只在 **C-T2** 触发一次 | 已裁决「逐波不发 + 一次性收口」→ **冻结至 C-T2** |
| **C 治理状态链** | CP STATE / 台账 / handoff 更新 | 是 A、B 的**尾巴**，不是独立流 | W6b4 pass-state 已出（PR #26 待合） |

犯错的地方：**B 链的问题（G1/G2/G3/G4）在 B 链尚未到触发点（C-T2）时就被提前抛出**，与 A 链的问题（P7 归属、W7 范围）混成一批。B 链的问题即使答了也**无法执行**（C-T2 未到、owner 未授权），纯属提前占用决策带宽。

### 8.2 修复：单链推进规则（此后执行）

1. **一次只推进一条链。** 非当前链的问题一律不抛，只在本报告 §5 记录为「已裁决 / 待触发」。
2. **B 链（归档）整链冻结至 C-T2。** C-T2 的前置是 C-T1（W7），W7 未开工 → B 链一个字都不问。所有 B 链结论以 §5 / §6.1 为准，到 C-T2 时按档执行，不重新裁决。
3. **C 链（治理状态）不独立提问。** 它是 A 链每个节点的收尾动作，随节点走，不单独占用一次决策。
4. **A 链一次只问一个节点。** 节点定义：一件事 + 一次独立复审 + 一次 CP 更新。
5. **裁决项在触发点前只记录、不询问。** 记录于 §5，触发时一次性呈现，不提前分散。

### 8.3 线性队列（按上述规则重排）

| 序 | 链 | 事项 | 前置 | 需 Current User 决策 | 当前状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | C | W6b4 pass-state → CP PR #26 合并 | — | 合并 PR #26（owner 操作） | **待合并** |
| 2 | **A** | **W6b5 = T10c 微波**（P7 建议项，裁决：单开微波） | 序 1 | **开工授权**（一次，其余全自动） | **待开工** |
| 3 | A | W6b5 独立复审 | 序 2 | 否（复审由独立 agent 出结论） | — |
| 4 | C | W6b5 pass-state → CP PR | 序 3 | 合并 PR | — |
| 5 | A | **W7 = C-T1 全量只读复审**（裁决：先不开） | 序 4 | **开工授权 + 范围确认** | **冻结** |
| 6 | B | **C-T2 收口**：Exchange 一次性收口 run + PKB 补归档到 `feature/knowledge-base-v1` | 序 5 | 开工授权 + 开 Issue 打标（owner）+ **显式授权 `git push`** | **冻结** |

**当前队列里唯一可推进的是序 2（W6b5）。序 1 是 owner 的 PR 合并动作，不阻塞序 2 的实施与复审。** 序 5、序 6 已明确冻结，在 W7 开工前不会再问。

---

## 九、当前状态一句话

W1 → **W6b5 全部 PASS**（CP PR #26 → main `b9ccd25`；PR #27 → main `f8ab56b`）。裁决已回填：逐波不发（C-T2 一次性收口 run）/ P7 单开微波（**W6b5 已落地 PASS**）/ W7 先不开 / PKB 用 `feature/knowledge-base-v1` / **handoff 不再落产品仓、复审 prompt 会话内输出**。归档链 B 按规则**冻结至 C-T2**。下一步只有 **W7 = C-T1 全量只读复审**，冻结中，等 Current User 裁决范围。
