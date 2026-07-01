# 路线图阅读指南

> 本指南说明如何阅读和使用 `ROADMAP.md`，避免把路线图当成短期 TODO 或已完成能力清单。

## ROADMAP 的作用

`ROADMAP.md` 是本标准包后续推进的主索引。

它用于回答：

```text
当前阶段做到哪里？
下一个应该改哪个 Skill 或标准文件？
哪些 Skill 需要新建，哪些只需要补合同？
哪些能力只是远期产品集成，暂不进入当前实现？
```

它不是：

```text
一次对话里的临时 TODO
所有能力已完成的声明
自动化能力清单
```

## 当前阶段判断

当前仓库已经完成：

```text
Wave 1: 标准基础
Wave 2: 文档流与安装边界主线
Wave 3: 变更控制与 Manifest 活动模型基础版
Speckit bootstrap hardening
```

当前主要阶段应视为：

```text
真实项目验证期
```

也就是说，下一步重点不是继续新增大量 Skill，而是通过真实项目验证已有标准是否有效。

## 如何判断某个能力的成熟度

建议使用以下状态：

| 状态 | 含义 |
| --- | --- |
| `contracted` | 已有合同，但未必有可安装 Skill。 |
| `prompt_skill_ready` | 已有 `skills/sdlc-*` Prompt Skill，可人工唤醒，但不是独立自动化服务。 |
| `tooling_ready` | 已有脚本工具，可直接执行。 |
| `validated` | 已通过真实项目样例验证。 |

当前大部分 `sdlc-*` Skill 应视为 `prompt_skill_ready`。

当前脚本类能力，例如：

```text
scripts/init-standard-home.sh
scripts/bootstrap-speckit-project.sh
scripts/validate-skill-contracts.rb
```

可视为 `tooling_ready`。

## 当前不要优先做什么

在真实项目验证前，不建议优先推进：

```text
work-journal
Dashboard
GitHub Issue 自动导出
多 Agent pipeline
通用业务域自动生成器
更多大型 sdlc-* Skill
```

这些能力可能有价值，但需要等真实项目验证后再判断是否进入路线图。

## 推荐推进顺序

当前建议按以下顺序推进：

```text
1. 拆分 README 和指南文档。
2. 选择真实 Java 后端项目执行 bootstrap --dry-run。
3. 根据 dry-run 输出修正 bootstrap、report、project-context 和文档。
4. 在测试仓库正式执行 bootstrap。
5. 跑一条 Direct Implementation 小需求闭环。
6. 跑一条 Complex Speckit pipeline 需求闭环。
7. 将真实问题沉淀到 Checklist、Schema、Skill 合同或脚本。
8. 再决定是否发布 v0.2。
```

## 使用 ROADMAP 的规则

每次继续改造前，先看：

```text
ROADMAP.md
manifest.yaml
README.md
docs/*.md
```

然后判断本次任务属于哪一类：

| 任务类型 | 说明 |
| --- | --- |
| 标准补齐 | 修改 `ai-sdlc/`、`ess/`、`checklists/`、`templates/`。 |
| Skill 接入 | 修改 `skills/`、`skill-contracts/`、`registry/`、`manifest.yaml`。 |
| 工具硬化 | 修改 `scripts/`。 |
| 文档产品化 | 修改 `README.md` 或 `docs/`。 |
| 样例验证 | 新增 `examples/` 或真实项目试跑记录。 |

不建议一次 PR 同时做大量不同类型任务。

## v0.2 建议标准

建议不要因为新增文档或脚本就发布 v0.2。

更合理的 v0.2 标准是：

```text
1. 至少完成一个真实项目 bootstrap dry-run。
2. 至少完成一个测试仓库正式 bootstrap。
3. 至少完成一条 Direct Implementation 小需求闭环。
4. 至少完成一条 Complex Speckit pipeline 验证，或明确记录为什么暂缓。
5. README 和 docs 能让新人按当前真实实现复现流程。
```

v0.2 的核心价值应是：

```text
有真实项目验证记录的 AI SDLC Standard
```

而不是：

```text
拥有更多未验证 Skill 的标准包
```
