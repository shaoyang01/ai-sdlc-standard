# LOOP-ADVANCED-04 有界规划：Personal-KB Project Artifact Projection

> 规划状态：**DRAFT_FOR_CURRENT_USER_REVIEW**
>
> 日期：2026-08-27
>
> 本文件不授权修改 Personal-KB、跨仓 commit/push 或批量迁移历史产物；本 Advanced 项依赖 `LOOP-CORE-05`，不得阻塞当前 C03-E 全自主主线。

## 1. 目标

每个 Requirement 完成七节点后，把对后续开发有价值的项目产物从源项目投影到 Personal-KB 的 `10-projects/<project-slug>/**` 命名空间，使需求背景、设计选择、finding/Re-Gate、实现方法、验证结论与可复用经验可被跨项目只读查询。

源项目仍是实现事实源；PKB 保存带 provenance 的派生快照，不替代代码、合同或运行 journal。

## 2. 推荐信息架构

```text
10-projects/<project-slug>/
  requirements/<requirement-id>/
    index.md
    artifacts/
      00-requirement.md
      01-solution.md
      01-challenge.md
      02-gate-verdict.md
      03-task-plan.md
      04-implementation.md
      05-code-review.md
      06-knowledge-sync.md
      manual-git-handoff.md
    specify/
      <selected-business-domain-and-governance-docs>.md
    evidence-index.md
```

- `index.md` 是 Requirement 查询入口，记录 source repository/branch/code commit、run id、制品版本、publication 状态和内部链接。
- `artifacts/` 保存最终有效的人类可读文本版本；失效旧版只记录 lineage，不与 current 混写。
- `specify/` 只接收本 Requirement 实际变更或消费的稳定文档，不复制整个 `.specify/`。
- `evidence-index.md` 记录 JSON、截图、日志、构建产物等原始证据的路径、类型、大小和 SHA-256；默认不复制 `target/classes`、依赖缓存、临时日志或大体积 raw evidence。

## 3. 投影合同

每个投影文件至少绑定：

```yaml
project_slug: <slug>
requirement_id: <id>
source_repository: <owner/repo>
source_branch: <branch>
source_code_commit: <full-sha>
source_path: <path>
source_artifact_version: <version-or-unknown>
source_sha256: <sha256>
loop_run_id: <run-id>
publication_task_id: <id>
publication_status: prepared | published | blocked | corrected
kb_status: draft | active
```

如果 `library/` 被 `.gitignore` 排除，publisher 必须在同一次 final snapshot 中读取文件并计算 digest；不得声称可由 source commit 重建该文件。`.specify/**` 若已提交，则同时验证 `source_code_commit:path` 内容与 digest。

## 4. 受控发布流程

1. knowledge-sync 产出 `PKBArtifactBundle`：allowlist、最终版本、正文、source metadata、digest、敏感性扫描结果。
2. runtime 验证 bundle，只允许目标项目自己的 `10-projects/<project-slug>/**`。
3. PKB publisher 获取单 writer 窗口，固定 PKB baseline/remote HEAD，拒绝未知工作树、并发 writer 或远端漂移。
4. 创建不可覆盖的 Requirement 历史文件并更新项目 current/index；运行 PKB validator 与只读 query smoke test。
5. 生成 publication receipt：目标路径、PKB commit、push 状态、每个源制品 digest。
6. 发布失败只把 PKB 子状态标为 recoverable blocked；不回滚业务实现、不撤销 `READY_FOR_MANUAL_GIT_HANDOFF`。

## 5. 内容边界

自动允许：

- `library/<requirement-id>/00～06` 最终 Markdown 产物与人工 Git handoff；
- 与该 Requirement 有直接 lineage 的 `.specify/business_domain/**`、spec/contract、规划或审核 Markdown；
- evidence manifest、验证摘要、finding/Re-Gate 索引。

默认拒绝：

- 密钥、token、cookie、个人信息、生产数据样本或被标记 private/sensitive 的正文；
- `target/`、`node_modules/`、依赖缓存、class/binary、未裁剪日志和临时文件；
- 与 Requirement 无 lineage 的整个 `.specify/` 或整个 `library/`；
- 自动写入 `30-knowledge/**`、`50-decisions/**`、`60-prompts/**`、`90-system/**`；
- 自动把任何笔记提升为 `stable`。

项目产物进入 PKB 后保持 `draft` 或 `active`。要转为跨项目通用知识，仍需个人知识库既有 Review/Distillation 与用户确认。

## 6. 编码前场景矩阵

| 场景 | 输入/状态 | 预期 |
| --- | --- | --- |
| P01 新 Requirement | PKB 中无该 Requirement | 新建 index + artifacts + evidence index，更新项目 current |
| P02 幂等重试 | 相同 source digest 已 published | no-op，返回同一 publication identity |
| P03 新版本纠正 | 同路径但 digest 不同 | 新建 correction/version 文件，不覆盖历史 |
| P04 ignored library | 源文件不在 Git | 以 final snapshot + digest 发布，并明确不可由 source commit 重建 |
| P05 committed .specify | 文件存在于 source commit | 校验 Git blob digest 后发布 |
| P06 敏感内容 | 命中凭证/隐私规则 | fail-closed，给出有界原因，不发布该 bundle |
| P07 PKB 远端漂移 | baseline 与 remote 不一致 | 停止，不 merge/rebase/stash/force push |
| P08 PKB 不可用 | 仓库/锁/validator 失败 | 业务 handoff 保持成功，PKB publication 可恢复阻塞 |
| P09 查询验收 | publication 已完成 | PKB query 能按项目、Requirement、技术关键词命中 index/产物 |

## 7. 待 Current User 裁决

1. **发布授权粒度（推荐）**：为 `10-projects/<project-slug>/requirements/**` 建立 standing authorization；每次 Requirement 自动发布 draft，但任何全局知识晋升仍逐次确认。
2. **Git 策略（推荐）**：PKB publisher 在校验通过后自动 commit/push Personal-KB；这不授权业务仓 Git，也不允许 force push。若不接受，则降为本地 prepared bundle + 人工发布。
3. **历史回填（推荐）**：首版只处理新 Requirement；历史 `library/`/`.specify/` 另开一次有界迁移，不阻塞全自主 LOOP。

## 8. 完成合同

- 源项目 bundle schema、PKB publisher、allowlist、digest、敏感性与并发/远端漂移防线实现并复审通过。
- P01～P09 有自动化或真实运行证据。
- Core 完成后的至少一个新 Requirement，其最终产物实际进入对应 PKB 项目命名空间，并能被现有只读 Query 命中。
- PKB publication 状态与业务实现/审核/授权状态严格分离；发布失败可独立重试，不污染或回滚业务结果。

## Revision Record

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 0.1.0 | 2026-08-27 | Draft for Current User review | 定义 Requirement 级 PKB 信息架构、投影合同、发布流程、内容边界、场景矩阵与三个待裁决点。 |
