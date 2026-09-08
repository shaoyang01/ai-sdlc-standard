# C03-E：Exchange / PKB 归档链预演报告

**日期**：2026-08-30
**触发**：Current User 裁决「C-T2 的 Exchange + PKB 归档链现在就预演一次」
**性质**：**离线预演，未发布、未推送、未开 Issue**。本报告只证明"真发时能不能一次过"。

---

## 0. 结论先行

| 环节 | 预演结果 | 说明 |
| --- | --- | --- |
| Exchange publish-request / manifest / current 三份 schema | ✅ 全 PASS | 用实时 v1 schema + `jsonschema` 校验 |
| topic 允许列表 | ✅ PASS | `06-governance-artifact-exchange` 在列表内 |
| PKB `validate_notes.py` | ✅ PASS（3 文件 0 错误） | 含反向探针承重验证 |
| **真发动作** | ⛔ **未执行** | Issue 与 `exchange-publish` 标签**只能仓库 owner 操作** |

预演打通了链路，但暴露出 **3 个此前不知道的问题**，其中 2 个是合规缺口，需要 Current User 裁决。

---

## 1. 预演查出的三个问题

### 问题 1（合规缺口）：W1–W6b4 的执行波次在 Exchange 上没有发布记录

`Exchange` 的 `06-governance-artifact-exchange` 下共 **42 个 run**。C03-E 相关只有 3 个，全部在 8/28 授权阶段：

- `20260828T072740Z-ai-sdlc-e1-e4-runtime-implementation-authorized`
- `20260828T135255Z-ai-sdlc-e1-e4-task-gate-ratified-wiring-authorized`
- `20260828T141247Z-ai-sdlc-path-b-sole-production-path-a-frozen`（当前 `current.yaml` 指向）

**W1 到 W6b4 这 8 个波次，一个 run 都没有。**

对比既有实践：C01 用 11 个 run 覆盖了 plan-acceptance → wp1~wp5 → closure，C02 用 8 个 run 同样逐包发布。而 `GOVERNANCE.md` §15.3.1 明确要求——**独立复审改变 Gate 或把复审结果向前传递时，必须产生 Handoff**。W1–W6b4 每波都有独立复审并 PASS，所以每波都应当有一个 run。

> 更正：本文作者此前口头判断过"C03-E 从未发布过"，**该判断错误**。C03-E 一直在 topic06 发布，断更发生在执行阶段（W1 之后），不是从没发过。

### 问题 2（结论已推翻，2026-08-30 更正）：PKB 归档目录**存在**，只是不在 `main` 分支

> **更正**：本节原标题为「PKB 归档目录从未建立」，**该结论错误**。当时只查了 PKB 的 `main` 分支（确实只有 `.gitkeep`），没有查其他分支。2026-08-30 的治理恢复推翻了它。

- PKB 的归档主线是 **`feature/knowledge-base-v1`**——CP `projects/personal-knowledge-base/STATE.yaml` 的 `source_refs.fact_branch` 明确记为该分支。该分支上 `10-projects/ai-sdlc-standard/` **完整存在**（64 个文件：`README.md`、`audits/`、`current.md`、`handoffs/`）。
- `main` 分支停在 2026-07-13 的初始化提交（`chore: initialize personal knowledge base`）。此后 7 条分支从它分出、**从未合回**：

  | 分支 | ahead | 最后提交 |
  | --- | --- | --- |
  | `feature/knowledge-base-v1` | 578 | 2026-08-28 22:14（= CP 锚定的 `c3cb15ac`） |
  | `feature/governance-state-convergence-r2` | 570 | 2026-08-28 02:03 |
  | `feature/governance-state-convergence` | 566 | 2026-08-28 01:05 |
  | `codex/pkb-m5-e1-activation-control-state-alignment` | 350 | 2026-08-11 |
  | `codex/m5-e1-pce-policy-zero-delta-profile` | 345 | 2026-08-09 23:22 |
  | `codex/m5-e1-stage-a-source-scope-correction` | 345 | 2026-08-09 18:54 |
  | `feature/m4-e4-kimi-legacy-retirement` | 340 | 2026-08-08 |

  PKB **无 PR 流程**（`gh pr list --state open` 为空），全部直接 push。因此「归档内容不在 main」是**既有实践**，不是故障。

- **真实缺口不是「没建」，而是「断更」**：归档止于 `2026-08-28` 的 `path-b-sole-production-path-a-frozen`（commit `c3cb15ac`），W1–W6b4 这 8 个波次无归档。
- PKB 是 Obsidian 受管理笔记体系：`AGENTS.md` 要求 AI 创建的笔记 `status: draft`、必填 8 个属性，改完必须跑 `90-system/scripts/validate_notes.py`，且**未经授权不得 `git push`**。
- `manifest-v1` 里的 `personal_kb_repository` / `personal_kb_commit` 两个锚点字段（Exchange → PKB 的正式挂钩）**均为可选**，`20260828T141247Z` 这个 run 的 manifest 未填。属「锚点未用」，不算缺陷。

### 问题 2b（2026-08-30 新查出）：CP 与 Exchange 的发布状态口径不一致

- CP `projects/ai-sdlc/STATE.yaml`：`publication.status: COMPLETED`，锚定 `target_archive.commit: c3cb15ac...`。
- Exchange `current.yaml`（topic06，同一 run）：`publication_status: not_published`、`authorization_status: pending`、`review_status: proposed`、`execution_status: running`。
- 按 `GOVERNANCE.md` §15.5 的顺序链，`publication=COMPLETED` 应置于「PKB Handoff + current.md」之后。两侧口径是否等同（CP 记「已归档到 PKB」vs Exchange 记「该 run 未授权发布」）需 Current User 澄清，若非同义则应修正其一。

### 问题 3（约束，非缺陷）：topic 允许列表只有 3 个

仓库变量 `EXCHANGE_ALLOWED_TOPICS` =
`06-governance-artifact-exchange,05-project-governance-publishing-personal-kb-integration,04-repository-structure-and-root-governance`

**C03-E 不能新建 topic**，只能用这三个之一。复用 `06-governance-artifact-exchange`
符合既有实践（该 topic 下的 run 本来就是需求级的，如 `medium-requirement-roadmap-v1`）。
若要新建 topic slug，需 owner 改仓库变量——属运行时授权配置变更，不在实施方权限内。

---

## 2. 预演做了什么

### 2.1 Exchange 侧（离线）

构造 C03-E W6b3 的真实发布三元组，逐份过实时 schema：

- `publish-request-v1.schema.json` —— 15 个必填字段，含 4 个 const
  （`request_version=v1`、`review_status=proposed`、`authorization_status=pending`、
  `publication_status=not_published`）
- `manifest-v1.schema.json` —— 15 个必填，`files[]` 带 sha256 与 size_bytes
- `current-v1.schema.json` —— 指针，`run_commit` 只有 Publisher 知道，预演用占位

**结果**：三份全 PASS。
`handoff.md` sha256 = `4f2ed0848d0ba1382e0408ce5f8feb65e47aafe11e18169c3216db4ca5d2440a`（4168 字节）。
生成了完整 Issue body（含 `---BEGIN EXCHANGE REQUEST---` 与 `---BEGIN HANDOFF---` 两个块）。

### 2.2 PKB 侧（离线）

在 PKB 的浅克隆中建立首批归档内容并通过真实校验脚本：

- `10-projects/ai-sdlc-standard/handoffs/2026-08-30-c03-e-w6b3-pass.md`
- `10-projects/ai-sdlc-standard/current.md`

**结果**：`validate_notes.py` → 「检查 3 个文件，发现 0 个错误」。

**反向探针**：删掉 `confidence` 属性 → 校验恰转红（「缺少必填属性：confidence」）；
恢复 → 绿。证明校验不是假绿。

### 2.3 明确没做的事

- 没开 Issue、没打 `exchange-publish` 标签（policy §8.2：只有 owner 可以）
- 没向 Exchange 或 PKB 推送任何东西
- PKB 侧草稿目前只存在于本地克隆中

---

## 3. 待 Current User 裁决

1. **W1–W6b4 的 8 个波次是否补发 run？** 补发是向后补历史记录，
   每个 run 不可变，需逐波构造 handoff；也可决定只在 C-T2 一次性发一个收口 run。
2. **PKB 归档是否现在就建？** 建议至少先把 W6b3 这一条落成首例，
   把 `10-projects/ai-sdlc-standard/` 目录和五元组锚定惯例确立下来；
   topic04 / topic05 的历史 run 是否一并补镜像。
3. **PKB 的 `git push` 需要显式授权**（PKB `AGENTS.md` 明文禁止未授权推送）。

---

## 4. 复核命令

```bash
# topic 允许列表（运行时配置，不在 Git 历史里）
gh api repos/shaoyang01/project-governance-exchange/actions/variables/EXCHANGE_ALLOWED_TOPICS

# topic06 的 run 总数
gh api "repos/shaoyang01/project-governance-exchange/git/trees/main?recursive=1" \
  --jq '.tree[].path' | grep "topics/06-governance-artifact-exchange/runs/.*manifest.yaml" | wc -l

# PKB 归档目录
gh api repos/shaoyang01/personal-knowledge-base/contents/10-projects --jq '.[].name'
```
