# 使用指南

> 本指南说明如何按当前仓库真实实现使用 AI SDLC Standard。当前 `sdlc-*` 多数为 Prompt Skill；Gate 可以由 Skill 输出，也可以由人工依据标准文档检查。

## 适用场景

使用本标准包时，核心目标不是让所有需求都进入复杂流程，而是让需求在进入实现前形成可审阅、可传递、可回退的标准产物。

适用场景：

- 需求来自飞书、Markdown、HTML、聊天记录、产品文档或人工描述。
- DeepSeek、Codex、人工或其他 Agent 需要协作完成技术方案、审阅、实现、Review、测试反馈。
- 需要在实现前识别规格遗漏、兼容风险、异常处理缺口、测试缺口。
- 复杂需求需要可选进入 Speckit pipeline。

不适用为默认行为：

- 所有小改动都强制进入完整 Speckit pipeline。
- 没有技术方案就直接实现。
- 用聊天片段替代长期事实源。
- 在实现阶段补造业务规则。

## 核心产物目录

每个需求使用一个独立目录：

```text
library/{requirement_id}/
```

典型节点：

```text
library/{requirement_id}/
├── 00-需求资料/
├── 01-技术方案/
├── 02-方案审核/
├── 03-实现记录/
├── 04-代码审核/
├── 05-测试验收/
└── manifest.md
```

文件命名遵循：

```text
{requirement_id}__{artifact_type}.{ext}
```

版本写入文档 Metadata 的 `Version` 字段，并在 `## 修订记录` 和 manifest 中追踪。

`library/{requirement_id}/` 是人工交接和 Gate 视图。`specs/**` 是 Speckit 机器事实源；二者职责不同。

## 普通需求流程

普通需求不默认进入完整 Speckit pipeline。

推荐流程：

```text
00-需求资料
    ↓
01-技术方案
    ↓
02-方案审核
    ↓
DIRECT_IMPLEMENTATION
    ↓
03-实现记录
    ↓
04-代码审核
    ↓
05-测试验收
    ↓
测试反馈沉淀
```

可用 Skill：

| 阶段 | 可用 Skill | 当前作用 |
| --- | --- | --- |
| 需求归一化 | `sdlc-requirement-normalizer` | 归一化原始需求并保留来源信息。 |
| 规格生成 | `sdlc-specification-writer` | 按 ESS 生成可审计技术规格。 |
| 方案审阅 | `sdlc-solution-reviewer` | 全局方案审核 Gate，输出开发路径建议。 |
| 文档输出 | `sdlc-docflow-writer` | 将标准产物输出为 Markdown、HTML 或飞书文档。 |
| 实现记录 | `sdlc-implementation-recorder` | 根据实现证据生成实现记录。 |
| 代码审核归一化 | `sdlc-code-review-normalizer` | 将 DeepSeek、Codex、人工 Review 归一成 Code Review Schema。 |
| 测试反馈分类 | `sdlc-test-feedback-classifier` | 判断测试反馈属于规格遗漏、实现缺陷、需求变化等。 |
| 测试反馈同步 | `sdlc-test-feedback-sync` | 将稳定反馈转成 Checklist、Schema、manifest 或 change-control 建议。 |

## 方案审核 Gate

每个进入实现的需求都应先有：

```text
library/{requirement_id}/01-技术方案/*
library/{requirement_id}/02-方案审核/*
```

`sdlc-solution-reviewer` 输出：

```text
PASS
FAIL
PASS_WITH_RISK
```

并输出开发路径建议：

```text
DIRECT_IMPLEMENTATION
SPECKIT_PIPELINE_REQUIRED
BLOCKED_NEEDS_REVISION
```

规则：

- `FAIL` 不能进入实现。
- `PASS_WITH_RISK` 必须有明确风险接受说明。
- `BLOCKED_NEEDS_REVISION` 回到方案修订。
- 用户要求 full SDD 可以覆盖直接实现路径，但不能跳过 `01-技术方案` 和 `02-方案审核`。

## 复杂需求 Speckit 流程

当 `02-方案审核` 建议为：

```text
SPECKIT_PIPELINE_REQUIRED
```

或用户明确要求完整 SDD，且已有通过审核的方案时，可进入：

```text
sdlc-speckit-pipeline
```

当前 pipeline 顺序：

```text
Preflight
  ↓
Domain Route
  ↓
sdlc-speckit-specify
  ↓
sdlc-speckit-clarify
  ↓
sdlc-speckit-plan
  ↓
sdlc-speckit-tasks
  ↓
sdlc-speckit-analyze
  ↓
sdlc-speckit-implement
  ↓
sdlc-speckit-sync
  ↓
sdlc-speckit-code-doc-reconcile
```

约束：

- Pipeline 消费已审阅通过的 `01-技术方案` 和 `02-方案审核`。
- `sdlc-speckit-specify` 不应重新解释需求，而应同步或校验机器事实源。
- `sdlc-speckit-clarify` 不应扩大范围；核心未决问题应回到方案修订和方案审核。
- Plan / Tasks 不得改变已审阅业务行为。
- Implement 不得加入未批准行为。
- Sync 只能沉淀稳定事实，不能写入聊天片段或未确认假设。
- Reconcile 用于检查 code/spec/DocFlow/knowledge/manifest drift。

## Manifest 的作用

`manifest.md` 用于记录当前需求的活动状态。

当前模板在：

```text
templates/artifact-manifest-template.md
```

它支持：

- Artifact Index
- Activity Log
- Change History
- Replaced Artifact Paths
- Re-Gate Records
- Gate Decisions
- Stage Summaries
- Speckit Sync
- Missing Artifacts
- Blocking Issues
- Next Step

当需求变更、返工、测试发现规格遗漏时，应通过 manifest 和 change-control 表达，而不是覆盖旧产物。

## 变更控制

需求中途变更或实现后发现理解错误时，遵循：

```text
ai-sdlc/change-control.md
```

基本原则：

- 业务目标未变时，默认沿用原 `requirement_id`，通过稳定文件的内部 Metadata `Version` 推进。
- 需求目标变成独立需求或独立排期时，新建 `requirement_id`。
- 从最早受影响节点重新 Gate。
- 产物正文保持当前有效状态；历史通过 `## 修订记录`、manifest `Change History` 和 Git 追踪。
- 只有旧路径、拆分产物或重命名迁移时，才使用 `Replaced Artifact Paths`。

## 推荐验证路径

当前仓库下一阶段建议以真实项目试跑为主：

1. 对真实 Java 后端项目执行 Speckit bootstrap dry-run。
2. 跑一条小需求 Direct Implementation 闭环。
3. 跑一条复杂需求 Speckit pipeline。
4. 将测试阶段发现的遗漏反向沉淀到 Checklist、Schema、Skill 合同或脚本。
