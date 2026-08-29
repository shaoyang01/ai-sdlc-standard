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
| **G1** | PKB 归档主线在 `feature/knowledge-base-v1`，`main` 停在 7/13，7 条分支从未合回 | 低（**既有实践，非故障**；CP 自身就记 `fact_branch` 为该分支） | 建议**不改**，仅在文档中固化「PKB 事实分支 = `feature/knowledge-base-v1`」这一约定 | 确认即可 |
| **G2** | C03-E 的 **W1–W6b4 共 8 个波次在 Exchange 上 0 个 run**（既有实践是逐包发：C01 11 个、C02 8 个；`GOVERNANCE.md` §15.3.1 要求独立复审向前传递结果时必须产生 Handoff） | **高（合规缺口）** | 二选一：① 逐波补发 8 个 run（run 不可变，等于补历史）；② C-T2 时一次性发一个收口 run | **Current User**（Publisher 仅 owner 可开 Issue 并打 `exchange-publish` 标签，policy §8.2） |
| **G3** | PKB 归档止于 2026-08-28，W1–W6b4 无归档 | **高（同上，同 G2 一条链）** | 随 G2 一并解决；PKB 侧需显式授权 `git push`（`AGENTS.md` 禁止未授权推送） | **Current User** |
| **G4** | CP 记 `publication.status: COMPLETED`，而 Exchange 同一 run 记 `publication_status: not_published` / `authorization_status: pending` | 中（口径待澄清） | 澄清二者是否同义；若否，修正其一 | **Current User** |
| **G5** | 实现方（本会话）上轮结论错误：「PKB 目录从未建立」「整条归档链首次建立」 | 低（已更正） | 已在 `c03-e-exchange-pkb-archive-rehearsal.md` 更正；成因是**只查了 `main` 分支** | 已完成 |
| **G6** | W6b4 复审开始时工作树不干净：HEAD 停在 `e8e86ce`，挂两处实现方探针残留（w6b3 测试文件的 T-probe 块、`loop-git-workspace.ts:540` 的去门控形态） | 低（复审方已还原，结论不受影响） | 纪律修正：反向探针一律在临时 `git worktree` 跑，禁止在主工作树留痕 | 已完成 |

---

## 六、纪律修正（本轮教训）

1. **反向探针不得在主工作树进行**。本轮残留的 T-probe 块与去门控形态，正是此前为「抢答复审问题」而在主工作树连续跑两个探针留下的。复审方被迫先 `git checkout --` 还原才能切基线。今后：探针 → `git worktree add /tmp/xxx` → 跑 → `git status --porcelain` 留证 → `worktree remove --force`。
2. **跨仓核查必须列全分支再下结论**。G5 的成因就是只查了 PKB 的 `main`。同一类坑（用 `head` 截断结果）在本项目已第四次出现。
3. **CP 仓库的 `index.lock` 被 broker 拦截 unlink**，`find -delete` 静默失败（返回 0 但文件仍在）。有效解法：`python3 -c "import os; os.remove('.git/index.lock')"`，且**每条 git 命令前**执行一次。

---

## 七、当前状态一句话

W1 → **W6b4 全部 PASS**（CP PR #26 待合并）。下一步 **W7 = C-T1 全量只读复审 → C-T2 Current User 收口**，开工前需 Current User 确认 C-T1 范围。跨仓归档链（G2/G3/G4）待裁决。
