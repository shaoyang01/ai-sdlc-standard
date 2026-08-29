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

### 问题 2（未建链路）：PKB 归档目录从未建立

- PKB 的 `10-projects/` 下**只有 `.gitkeep`**，`10-projects/ai-sdlc-standard/` 不存在。
- 但 Exchange 已有 42 个 run —— **传送在跑，归档一步没做**。
- PKB 是 Obsidian 受管理笔记体系：`AGENTS.md` 要求 AI 创建的笔记 `status: draft`，
  必填 8 个属性，改完必须跑 `90-system/scripts/validate_notes.py`，
  且**未经授权不得 `git push`**。
- `manifest-v1` 里有 `personal_kb_repository` / `personal_kb_commit` 两个锚点字段 ——
  这是 Exchange → PKB 的正式挂钩，此前从未填过。

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
