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
.specify/project-context/ProjectWorkflowGuide.md
.specify/project-context/ProjectDocumentationGuide.md
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

entry coverage strict gate 使用独立 runner：

```bash
scripts/audit-entry-coverage.rb <target-project-path>
```

该 runner 读取 bootstrap 生成的 `.specify/entry-coverage-profile.yaml`、目标代码和 `.specify/business_domain/**`，输出 `.specify/reports/entry_coverage/**`。bootstrap 只生成 profile，不执行 strict 覆盖审计。

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
- `sdlc-speckit-pipeline` 运行期只能调度 `sdlc-speckit-*` 子 Skill；legacy `speckit-*` Skill 只能作为标准包开发期 parity fixture。
- `ProjectWorkflowGuide.md` 承载项目本地 pipeline workflow、确认策略、发布、分支、验证和回滚约束。
- `ProjectDocumentationGuide.md` 承载项目本地 business_domain、L4、EntryCoverage、文档索引和文档形态约束。

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

profile 选择遵循执行形态强信号，而不是只看语言或单个配置文件：

- `primary_language` 只是语言提示，不等同于 backend / frontend / batch / library。
- 普通 `package.json` 或无关静态资源不会单独触发 `frontend-application`；需要前端框架依赖、`src/pages`、`src/views`、`src/screens`、`src/components`、`src/navigation`、`src/router`、`src/store`、`src/api` 等前端源码结构，或 `src/main/webapp/WEB-INF`、JSP/FTL/VM、项目自有 webapp JS 等传统 Java Web 页面结构。
- React Native 项目的 Android/iOS native shell 不会把项目入口生成成 Java backend 风格；只要存在 RN/前端强信号，entry profile 必须包含 route、page、component、store/action、api-client、popup、navigation 语义。
- `admin-mixed-workflow` 需要 OAS event、data-console、SPI、approval/audit controller、config schedule processor、month-copy processor 等 admin-specific 强信号；普通 worker、schedule、import/export helper 或 Controller 单独存在不够。
- Spark/Flink/ETL/job/function/connector 等数据计算形态优先生成 `data-pipeline-etl` 入口，不走普通 Controller/Service 覆盖模型。

扫描结果会写入：

```text
.specify/project-context/ProjectCodingGuide.md
.specify/project-context/ProjectWorkflowGuide.md
.specify/project-context/ProjectDocumentationGuide.md
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
6. 执行 `scripts/audit-entry-coverage.rb <target-project-path>` 生成 strict entry coverage reports。
7. 选择一条小需求跑 Direct Implementation 闭环。
8. 最后再验证复杂需求 Speckit pipeline。

## Business Domain Bootstrap

一次性生成命令：

```bash
scripts/bootstrap-business-domain.sh <target-project-path> --dry-run
scripts/bootstrap-business-domain.sh <target-project-path>
```

默认模式是 pending skeleton，只生成待确认代码证据，不生成真实 L1/L2/L4 业务域。

如果 `.specify/business-domain-bootstrap.yaml` 中已经有用户或领域负责人确认的 `confirmed_domains`，可以使用 confirmed mode：

```bash
scripts/bootstrap-business-domain.sh <target-project-path> --confirmed --dry-run
scripts/bootstrap-business-domain.sh <target-project-path> --confirmed
```

或显式指定 domain map：

```bash
scripts/bootstrap-business-domain.sh <target-project-path> --domain-map .specify/business-domain-bootstrap.yaml --dry-run
```

confirmed mode 会从 `confirmed_domains` 生成可路由的 L1/L2/L4 skeleton 和 EntryCoverage skeleton。L4 skeleton 必须根据 domain map 或 `.specify/project-governance-profile.yaml` 的 `project_type_profiles` 选择 `templates/business-domain-l4/` 下的项目类型化模板。没有 confirmed domain map 时，不允许生成真实业务域。

默认生成：

```text
.specify/business_domain/00BusinessLandscape.md
.specify/business_domain/00UbiquitousLanguage.md
.specify/business_domain/01DomainCatalog.md
.specify/business_domain/99PendingConfirmation/01CodeEvidence/**
.specify/reports/business_domain_bootstrap_report.md
```

confirmed mode 额外生成：

```text
.specify/business_domain/{L1}/{L2}/{L2MainDocument}.md
.specify/business_domain/{L1}/{L2}/{L4Document}.md
.specify/business_domain/{L1}/{L2}/{EntryCoverageDocument}.md
```

规则：

- 不读取旧版 `.specify/memory/**`、`.specify/workflow/**`、`.specify/coding_guide/**`。
- 不生成 `specs/**`。
- 不从其他仓库复制业务事实。
- 不把包名、类名、页面名或 Job 名直接提升为业务事实。
- 不把通用 L4 skeleton 作为所有项目类型的唯一默认输出；缺少 `project_type_profiles` 时只能记录 conservative `backend-business-service` fallback。
- 已有 `.specify/business_domain/**` 文件默认写 `.candidate`，只有显式 `--force` 才覆盖。
