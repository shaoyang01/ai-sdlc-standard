# Decision-089：知识沉淀治理初始化 v2——.sdlc 根路径、代码驱动填充与双模式一站式（取代 D-088-01 v1 架构）

## 状态

Accepted（2026-09-04，Current User 认可 v2 设计全案；**认可不等于实施授权，v2 实施另需显式授权**）。本 Decision 取代 Decision-088 决策 1 的 v1 实施范围（`.specify` 根、最小空骨架）；Decision-088 的优先级裁决、排除范围与授权边界纪律继续有效。

## 背景

- 知识沉淀治理配置的演进：最早 speckit-* 流程用 `.specify/memory/AiGovernance.md` 类 markdown 治理规则文件对；sdlc-speckit-* 时代平移/增强为三份机器可读 YAML（project-governance-profile / entry-coverage-profile / business-domain-bootstrap）；7+1 重组清理 speckit 语义时，三份 YAML 的初始化职能被落在 speckit 品牌脚本里，单轨世界没有继承。
- D-088-01 v1（Decision-088，commit 4031949/e37b523）交付了 `.specify` 根下的最小骨架初始化器 + knowledge-target.yaml + skill 联动，回归 53 项全绿，logistics-center dry-run 验证通过。
- Current User 2026-09-03/04 连续勘定 v2 目标：以 logistics-center 成熟 `business_domain` 文档架构为基准（已通读 `.specify` 全部治理文档盘点差距）、根路径彻底切 `.sdlc`、无骨架仓按现有代码填充而不只整理骨架、已有骨架仓做适用性体检、三份治理 YAML 职能并入、一站式脚本。

## 问题

v1 架构与目标存在四处结构性差距：

1. 根路径沿用 `.specify`——目录名本身是 speckit 遗产，禁词门禁管内容管不住路径名，无法彻底切割；
2. 空仓只出空骨架：知识沉淀节点打开没有可用材料（无入口清单、无候选路由），与"保证后续需求节点走到知识沉淀时有东西可用"的要求不符；
3. 三份治理 YAML 职能未并入：单轨消费方（audit-entry-coverage.rb、knowledge-sync strict audit 门、L4 模板选择）依赖的配置在新链路无初始化来源；
4. 已有骨架仓（logistics-center 类）缺适用性体检与 speckit 残留检出能力。

## 决策

1. **v2 架构取代 v1**（包编号不变，仍为 D-088-01；roadmap v2.4.1 的插入位置不变）：
   - 根路径 `.specify` → `.sdlc`；knowledge target = `.sdlc/business_domain/**`；禁词表新增 `.specify`；
   - 初始化器升级为双模式一站式（设计全文见 `docs/reports/decision-089-knowledge-governance-v2-design.md`）：
     - **模式一初始化**：无 business_domain 时执行代码驱动填充（入口事实扫描 → 机械聚类候选域 → 候选 L1/L2 主文档 + xx99 EntryCoverage，只写代码可验证事实，业务语义零虚构，全部 Candidate 状态）；骨架为中文成熟架构形态，治理规则固化进根文档章节；机器件全家 create-if-missing（knowledge-target.yaml / project-governance-profile.yaml / entry-coverage-profile.yaml / business-domain-map 模板 / audit wrapper）；
     - **模式二体检**：适用性检查 + 结构化报告（编号规则一致性、机器件存在性、路由可解析性、speckit 残留清单文件：行、形态差异），唯一写入 = 补缺失机器件；
   - 声明状态机：`absent → candidate_pending_confirmation (routable:false) → routed`；sync 对非 routed 一律 PROPOSAL_ONLY；
   - v1 交付物（初始化器 v1、回归测试）作为重构基线保留在 git 历史，不单独回滚。
2. **标准包影响面**：`audit-entry-coverage.rb`、`bootstrap-entry-coverage-profile.sh`、`validate-skill-contracts.rb`、`skills/sdlc-knowledge-sync/**`、`bootstrap-knowledge-target.sh` 及测试的 `.specify` 硬编码路径同步切换；`bootstrap-speckit-project.sh` / `bootstrap-business-domain.sh` 仅 deprecation note 不修。
3. **存量迁移单独授权**：logistics-center 分类迁移（迁 business_domain + memory 6 份 + workflow 3 份 + coding_guide + audit wrapper；废 templates 6 份 + 4 个 SDD 脚本 + SDDWorkflow/WorkflowIndex）不混入本次实施。
4. **授权边界**：本 Decision 不构成 v2 实施授权；实施需 Current User 显式授权。

## 原因

- `.sdlc` 根切换是彻底切割的唯一手段，且当前仅一个仓有存量、D-088-01 未发布，切换成本处于最低点；
- 代码驱动填充是"知识沉淀节点有东西可用"的直接实现，且入口清单/模块结构是可验证代码事实，与"业务语义零虚构"红线可兼容（候选状态 + routable 门控兜底）；
- 三份 YAML 是治理规则的机器可读平移件而非 speckit 运行时语义（Current User 勘定的由来），7+1 必须继承其职能才能闭环；
- 双模式让已有骨架仓（成熟知识库）得到保护性体检而非盲目重建，与"永不覆盖已有知识"不变量一致。

## 影响

- 产品仓：`scripts/bootstrap-knowledge-target.sh` 重构、`scripts/audit-entry-coverage.rb` 等路径切换、`skills/sdlc-knowledge-sync/**` 合同更新、回归矩阵扩充（v1 53 项适配 + 新增填充/双模式/路径用例）；
- roadmap：无需再修订（v2.4.1 的 D-088-01 插入位置与完成门定义仍然成立，完成门 = 离线回归矩阵全过）；
- 业务仓：本波零接触；logistics-center 迁移单独授权；
- CP STATE：v1 实施授权移除，D-088-01 转 PAUSED，v2 入口授权门 OPEN。

## 实现状态

- 设计文档入库（本 commit `docs/reports/decision-089-knowledge-governance-v2-design.md`）；
- 本 Decision + 索引行（本 commit）；CP STATE 登记随即执行；
- v2 实施：待 Current User 显式授权。

## 依据

- Current User 2026-09-03/04 系列裁决（治理规则文件对的由来勘定、.sdlc 根切换、代码填充要求、双模式与一站式要求、"认可不等于授权"的程序裁定）；
- logistics-center `.specify` 全量盘点（business_domain 成熟架构、memory/workflow/templates/coding_guide/scripts 分类）；
- Decision-088（v1 立项与优先级裁决）、Decision-084（sdlc-* skills 现役主干）、`docs/reports/knowledge-target-initializer-analysis.md`（v1 分析）。
