# Speckit 投放指南

> 本指南说明当前 `scripts/bootstrap-speckit-project.sh` 的真实行为，以及 Speckit 双轨隔离、代码驱动生成和 report 输出边界。

## 目标

Speckit project bootstrap 用于把 AI SDLC Standard 的 Speckit 文档治理投放到目标项目中。

它的目标是：

```text
生成新版 sdlc-* Skill 需要的项目私有上下文，
同时不破坏旧版 Speckit rail。
```

它不是：

```text
旧版 Speckit 迁移器
旧版文档覆盖器
business_domain 复制工具
specs 生成器
```

## 推荐先执行 dry-run

```bash
scripts/bootstrap-speckit-project.sh <target-project-path> --dry-run
```

`--dry-run` 只预览输出，不写文件。

已有 profile 时，dry-run 不会阻断；真实写入时若要覆盖 profile，必须显式使用：

```bash
--force-profiles
```

## 脚本参数

```text
--project-name <name>          Project display name. Defaults to target directory name.
--language <language>          java|typescript|python|go|mixed|other. Auto-detected when omitted.
--application-type <type>      backend|frontend|fullstack|batch|library|mixed|other. Auto-detected when omitted.
--standard-package <location>  Path or git URL for ai-sdlc-standard. Defaults to this repository path.
--force-profiles               Overwrite generated profile files when they already exist.
--force-context                Overwrite project-context files. Defaults to writing .candidate files.
--dry-run                      Print generated files without writing.
```

本地 `--standard-package` 路径会在写入 profile 前转换为绝对路径。若传入 git URL 或不可运行时解析的位置，profile 会标记 `local_resolution_required: true`。

## bootstrap 会生成什么

项目 bootstrap 可能生成：

```text
.specify/project-governance-profile.yaml
.specify/entry-coverage-profile.yaml
.specify/business-domain-bootstrap.yaml
.specify/project-context/ProjectCodingGuide.md
.specify/project-context/RepositoryStructure.md
.specify/project-context/ProjectGovernanceOverrides.md
.specify/reports/speckit_generation_report.md
.specify/reports/legacy_speckit_source_inventory.md
.specify/reports/speckit_equivalence_report.pending.md
library/
.gitignore entry: /library/
```

若目标 project-context 文件已存在，默认生成 `.candidate`，除非显式使用：

```bash
--force-context
```

若 report 文件已存在，脚本会生成带时间戳的历史文件，避免覆盖历史审计记录。

## bootstrap 不会生成什么

bootstrap 不会：

```text
生成 specs/**
生成或复制 .specify/business_domain/** 内容
复制其他项目的 business_domain
复制旧版 .specify/memory/** 内容
复制旧版 .specify/workflow/** 内容
复制旧版 .specify/coding_guide/** 内容
覆盖旧版 Skill
修改业务代码
提交 git commit
```

`specs/**` 和 `.specify/business_domain/**` 是后续 workflow 产物，不是 project bootstrap 的迁移对象。

## 双轨隔离

当前标准定义两条 rail：

```text
Legacy Speckit Rail
  - legacy Speckit Skills
  - legacy workflow Skills
  - legacy .specify/memory/**
  - legacy .specify/workflow/**
  - legacy .specify/coding_guide/**

New AI SDLC Speckit Rail
  - sdlc-* Skills
  - ${AI_SDLC_STANDARD_HOME}/** shared standard docs
  - .specify/project-governance-profile.yaml
  - .specify/entry-coverage-profile.yaml
  - .specify/business-domain-bootstrap.yaml
  - .specify/project-context/**
  - .specify/reports/**
```

规则：

- 旧版 Skill 继续读取旧版文档。
- 新版 `sdlc-*` Skill 正常运行时读取标准包共享文档和新 project-context。
- 新版 Skill 不得把 `.specify/memory/**`、`.specify/workflow/**`、`.specify/coding_guide/**` 当作正常输入。
- 旧版文档只可作为 inventory 或同项目 parity reference。

## 代码驱动生成

bootstrap 的内容来源优先级：

```text
目标项目代码库
用户显式确认事实
标准包生成规则和模板
```

旧版 Speckit 文档不是新版内容来源。

脚本会扫描：

```text
source roots
module globs
HTTP controllers
RPC providers
message listeners
schedules/jobs
services
managers/domain services
persistence
MQ/events
cache/lock
config
tests
```

扫描结果会写入：

```text
.specify/project-context/ProjectCodingGuide.md
.specify/project-context/RepositoryStructure.md
.specify/reports/speckit_generation_report.md
```

注意：这些扫描结果是 evidence scaffold。未经项目负责人确认前，不应被视为权威业务规则或项目级编码规范。

## Application Type 与代码证据判断

当前 bootstrap 对 code evidence 的判断：

| application_type | 判断方式 |
| --- | --- |
| `backend` / `fullstack` / `batch` | 需要 source roots 和至少一种 entry evidence。 |
| `library` | 需要 source roots 和 service / manager / persistence / test / config / cache-lock 中至少一种证据。 |
| 其他 | 默认 `needs-user-confirmation`。 |

自动检测无法可靠判断业务域、L1/L2/L4、状态是否业务可见、流程是否当前有效。这些内容需要用户或项目负责人确认。

## Report 说明

### speckit_generation_report

记录：

- 标准包路径和运行期可解析性。
- 语言和应用类型。
- 代码证据统计。
- 是否发现旧版 Speckit 文档。
- parity check 状态。
- code evidence completeness 状态。
- 已生成文件。
- 待确认事实。

### legacy_speckit_source_inventory

仅当发现旧版文件时生成。

用途：

```text
记录旧版文件存在，确认它们没有被修改。
```

它不是内容抽取报告。

### speckit_equivalence_report.pending

仅当发现旧版文件时生成 pending 报告。

它不是 PASS artifact。只有当同一项目、同一 scope 下已有可比较的 legacy/new `specs/**` 或 `.specify/business_domain/**` 输出时，才能做真正语义等价比较。

## 正式投放建议

推荐流程：

```text
1. 先执行 --dry-run。
2. Review generation report 和 project-context 预览。
3. 确认不会污染旧版 Speckit rail。
4. 如已有 profile，不要轻易使用 --force-profiles。
5. 如已有 project-context，默认接受 .candidate 输出，人工合并。
6. 只在测试仓库或低风险仓库先正式执行。
```

正式执行：

```bash
scripts/bootstrap-speckit-project.sh <target-project-path>
```

## 后续步骤

bootstrap 完成后，下一步不是立刻跑复杂需求，而是：

1. 人工检查 generated profile。
2. 人工检查 ProjectCodingGuide / RepositoryStructure evidence。
3. 确认 business domain 边界。
4. 后续再生成 `.specify/business_domain/**`。
5. 选择一条小需求跑 Direct Implementation 闭环。
6. 最后再验证复杂需求 Speckit pipeline。
