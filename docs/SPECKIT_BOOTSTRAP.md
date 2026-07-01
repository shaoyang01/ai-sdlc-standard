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

`project bootstrap` 与 `business_domain bootstrap` 是两个步骤：

- `scripts/bootstrap-speckit-project.sh` 只生成新版 Skill 的 profile、project-context、report 和 `library/` 根目录。
- `scripts/bootstrap-business-domain.sh` 按需一次性生成 `.specify/business_domain/**` 长期事实骨架。

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

`.specify/business_domain/**` 比普通 profile 特殊：它是长期代码事实文档。首次建立时使用独立脚本生成骨架，后续只通过确认后的 Sync / Reconcile 沉淀稳定事实。

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
- 旧版文档在 runtime bootstrap 中只被保留给旧 rail，不参与新版生成、对比或迁移。

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

脚本也会根据目标代码形态生成初始 project type semantic profile hint。它用于新版 Skill 判断项目执行形态，不是旧文档迁移结果：

| profile | 适用入口 |
| --- | --- |
| `backend-business-service` | RPC、HTTP Controller、MQ、Schedule、Service 操作。 |
| `admin-mixed-workflow` | Controller、worker、schedule、MCQ、OAS、data-console、SPI、RPC。 |
| `frontend-application` | route、page/view、component、store/action、api-client、popup。 |
| `data-pipeline-etl` | Spark Job、online ETL、Flink Main、Process Function、connector、SQL task。 |
| `library-shared-component` | public API、client method、adapter、extension point。 |

项目类型语义见 `ai-sdlc/speckit-project-type-profiles.md`。如果一个仓库同时包含多种执行形态，`.specify/entry-coverage-profile.yaml` 可以保留多个 profile，并按模块列出各自入口。

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
- project type semantic profile hint。
- 代码证据统计。
- 是否发现旧版 Speckit 文档。
- 旧版文档 runtime 处理方式。
- code evidence completeness 状态。
- 已生成文件。
- 待确认事实。

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
4. 执行 `scripts/bootstrap-business-domain.sh <target-project-path> --dry-run`。
5. 确认后执行 `scripts/bootstrap-business-domain.sh <target-project-path>` 生成长期事实骨架。
6. 选择一条小需求跑 Direct Implementation 闭环。
7. 最后再验证复杂需求 Speckit pipeline。

## Business Domain Bootstrap

一次性生成命令：

```bash
scripts/bootstrap-business-domain.sh <target-project-path> --dry-run
scripts/bootstrap-business-domain.sh <target-project-path>
```

默认生成：

```text
.specify/business_domain/00BusinessLandscape.md
.specify/business_domain/00UbiquitousLanguage.md
.specify/business_domain/01DomainCatalog.md
.specify/business_domain/99PendingConfirmation/01CodeEvidence/**
.specify/reports/business_domain_bootstrap_report.md
```

规则：

- 不读取旧版 `.specify/memory/**`、`.specify/workflow/**`、`.specify/coding_guide/**`。
- 不生成 `specs/**`。
- 不从其他仓库复制业务事实。
- 不把包名、类名、页面名或 Job 名直接提升为业务事实。
- 已有 `.specify/business_domain/**` 文件默认写 `.candidate`，只有显式 `--force` 才覆盖。
