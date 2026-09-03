# D-088-01 v2 设计：知识沉淀治理初始化（.sdlc 根路径 + 代码驱动填充 + 双模式一站式）

> 日期：2026-09-04
> 性质：设计文档（Decision-089 引用）；实施需 Current User 显式授权
> 基准仓：`logistics-center/.specify/business_domain`（成熟形态实例）与 `.specify` 全部治理文档（已通读盘点）

## 1. 由来与问题重述

知识沉淀治理配置的演进史（Current User 2026-09-04 口述勘定）：

1. 最早 speckit-* 流程的知识沉淀治理是 `.specify/memory/AiGovernance.md` 这类 **markdown 治理规则文件对**（logistics-center 实存 6 份：constitution / AiGovernance / DocumentationStandard / EngineeringStandard / InteractionProtocol / RoleAtlas）。
2. 开发 sdlc-speckit-* skill 时为不影响旧 speckit-* skill，将治理规则**平移/增强为三份机器可读 YAML**（project-governance-profile.yaml / entry-coverage-profile.yaml / business-domain-bootstrap.yaml）。
3. 7+1 重组清理 speckit 语义时，**三份 YAML 的初始化职能被落下**——仍住在 speckit 品牌脚本里，单轨世界没有继承。

v1 实施（Decision-088，commit 4031949/e37b523）只覆盖了"最小骨架 + 单声明"，与 Current User 认可的目标有四处差距：根路径仍是 `.specify`；空仓只出空骨架不做代码填充；治理 YAML 集未并入；已有骨架仓无适用性体检。本设计（v2）取代 v1 架构。

## 2. 根路径切换：`.specify` → `.sdlc`

- knowledge target：`.sdlc/business_domain/**`
- 机器件：`.sdlc/business_domain/knowledge-target.yaml`、`.sdlc/project-governance-profile.yaml`、`.sdlc/entry-coverage-profile.yaml`、`.sdlc/business-domain-map.yaml`（模板，替代旧 business-domain-bootstrap.yaml 路径）
- 禁词表扩展：新增 `.specify`（新产出禁止引用旧根路径）
- 标准包硬编码路径同步切换（影响面）：`audit-entry-coverage.rb`、`bootstrap-entry-coverage-profile.sh`、`validate-skill-contracts.rb`、`skills/sdlc-knowledge-sync/SKILL.md` + references、`bootstrap-knowledge-target.sh` 及测试；`bootstrap-speckit-project.sh` / `bootstrap-business-domain.sh` 仅 deprecation note 不修
- 存量迁移（**单独授权**，不混入初始化器）：logistics-center 一次性 `git mv .specify .sdlc` + 文档内路径引用修正；初始化器体检模式发现 `.specify` 只报告迁移建议

## 3. 目标文档架构（基准 = logistics-center 成熟形态，剔除 speckit 语义）

```text
.sdlc/
├── business_domain/
│   ├── knowledge-target.yaml              # 机器声明（路由 + profiles 权威源）
│   ├── 00BusinessLandscape.md             # 事实源分层/路由原则/业务域地图（含代码锚点）
│   ├── 00UbiquitousLanguage.md            # 统一语言表
│   ├── 01DomainCatalog.md                 # L1/L2 索引 + L4 编号规则 + 使用方式 + 门禁说明
│   └── {L1两位}{Name}/{L1}{L2两位}{Name}/
│       ├── {L1}{L2}{Name}({中文名}).md     # L2 主文档：业务锚点 + L4 路由草案 + 规则沉淀区
│       ├── {L1}{L2}{L4两位}{Name}({中文名}).md  # L4：背景与范围(In/Out Scope) + 业务锚点 + 关键业务规则
│       └── {L1}{L2}99EntryCoverage({中文名}).md # xx99 入口覆盖对账（入口唯一归属）
├── project-governance-profile.yaml
├── entry-coverage-profile.yaml
├── business-domain-map.yaml               # confirmed domain map（模板 opt-in / 确认后落定）
└── scripts/bash/audit-entry-coverage.sh   # 门禁薄 wrapper（缺失时生成）
```

治理规则固化进文档章节（不另造平行治理源，避免与 AGENTS.md/skill 合同产生 SSoT 冲突）：6 位 L4 编号规则、xx99 = EntryCoverage 约定、入口类唯一归属、主域+协同域标记、Sync 前 `audit-entry-coverage --strict` 门禁、业务单据维度路由优先。

事实源分层（单轨化）：短期事实源 = `library/{requirement_id}/` 七节点产物（替代旧 `/specs/######-feature/` 表述）；长期事实源 = `.sdlc/business_domain/**`；治理规则源 = AGENTS.md + 标准包 skill 合同（不再引用 memory/workflow 为权威源）。

## 4. 双模式行为规格

### 4.1 模式一：初始化（无 business_domain 或部分骨架）

**代码驱动填充**（无 business_domain 时默认执行）：

1. 入口事实扫描（复用旧链路成熟探测模式）：`*Controller.java`、`*/rpc/*`·`*Provider`·`*Facade`、`process/**Processor`、`*Listener`·`*Consumer`·`mcq`、`*Schedule`·`*Job`·`*Task`·`*Worker`、前端 `pages/views/api`；记录入口类型/类名/代码路径。
2. 机械聚类候选域：按模块与业务包路径段聚类为候选 L1 → 候选 L2 → 入口类分组（纯路径启发式，不做语义推断）。
3. 生成候选文档：根文档业务域地图填候选表（含代码锚点）；每候选 L2 主文档（业务锚点 = 真实入口链、L4 路由草案表）+ xx99 EntryCoverage（真实入口清单表）。
4. 事实红线：只写代码可验证事实（入口类/路径/模块结构）；业务规则与术语语义一律留空标"待沉淀"；候选内容全部 `Status: Candidate/Draft`。
5. 声明状态机：`absent → candidate_pending_confirmation (routable:false) → routed (owner 确认 business-domain-map 后) `；sync 对非 routed 一律 PROPOSAL_ONLY。

**骨架与机器件**：三根文档（中文、治理规则章节固化）+ 三份 YAML（create-if-missing；entry-coverage-profile 为最小合法骨架 + 指向 `bootstrap-entry-coverage-profile.sh` 详细扫描）+ map 模板 + audit wrapper。

不变量（继承 v1）：create-if-missing、永不覆盖已有知识文件、重复执行 no-op、`--dry-run` 零写入、正式执行检查 git user.name、禁词门禁（`speckit`/`99PendingConfirmation`/`dual rail`/`legacy rail`/`specs/**`/`.specify`）、不写其他业务仓。

### 4.2 模式二：体检（检测到已有骨架自动进入 / `--audit`）

结构化检查报告（只报告 + 有界建议，唯一写入 = 补缺失机器件）：

- 根文档完整性与章节齐备性；编号规则一致性（6 位/xx99）
- 机器件存在性与路由可解析性（sync 能否从声明 + Catalog 定位）
- 门禁可用性（entry-coverage-profile / audit wrapper / 标准包脚本可达）
- speckit 残留清单（文件:行 + 有界迁移建议，绝不自动改写；含 `.specify` 旧根引用）
- 与 logistics-center 基准架构的形态差异（如 L2 主文档缺业务锚点章节）

## 5. logistics-center 存量分类迁移（单独授权）

| 处置 | 文件 |
| --- | --- |
| 迁移 | `business_domain/`（知识本体）、`memory/` 6 份（治理规则源，残留后续修订）、`workflow/` GovernanceAuditWorkflow / QualityWorkflow / GitWorkflow、`coding_guide/` 3 份、`scripts/bash/audit-entry-coverage.sh`（更新指向） |
| 废弃 | `templates/` 6 份 SDD 模板（标准包 templates/ 已承接）；`scripts/bash/` check-prerequisites / create-new-feature / setup-plan / update-agent-context / common.sh；`workflow/SDDWorkflow.md`、`WorkflowIndex.md` |
| 运行产物 | `reports/entry_coverage/` 随迁 |

废弃件不物理删除：git 历史保留，或移 `.sdlc/legacy/`（实施时定）。

## 6. 回归矩阵（在 v1 53 项基础上扩充）

代码填充：入口扫描覆盖各类型 / 聚类候选域生成 / 候选状态与 routable:false / 业务语义零虚构断言（规则区为空）/ xx99 命名。双模式：空仓初始化全量件 / 部分骨架只补缺 / 体检模式只报告不改写 / 补缺失机器件 / speckit 残留检出含 `.specify` 引用。路径切换：全部产物落 `.sdlc` / 禁词扫描含旧根路径。原有 53 项全部适配 `.sdlc` 后保持全绿。

## 7. 实施顺序（授权后）

① Decision-089 落账（本文件 + 索引）→ ② 标准包路径切换 + 初始化器重写双模式 → ③ 回归矩阵扩充全量跑通 → ④ skill 合同联动更新 → ⑤ 停等汇报 → ⑥ logistics-center 迁移与 roadmap/四仓传播另行授权。
