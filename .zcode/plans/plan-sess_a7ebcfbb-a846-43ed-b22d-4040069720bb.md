# bootstrap-knowledge-target.sh 治理语料「存量兼并吸收 + 缺失生成」实施案

## 〇、开工核验结果（任务书第二节）
- 主工作区 HEAD = `9e6e0c7e2b3384a83337c90b86863493b2c1c206`（与任务书一致），**工作区当前干净**（D087 会话已提交待复审）；`f05d7cb` 是 HEAD 的祖先 ✓（初始化器最新态包含在内）。
- Decision-091 空闲（现最高 090）✓。
- Control Plane STATE：计划模式拦网络命令，开工第一步用 `gh api` 补读核对。
- worktree：`/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard-governance-corpus-worktree`，分支 `codex/d088-governance-corpus`，基线 = 9e6e0c7（完整 SHA 记录进交付）。开工先复跑基线回归确认 557。

## 一、存量清单 → 目标路径（logistics-center 实读 9 份）
| 源文件 | 目标 | 处置 |
|---|---|---|
| memory/constitution.md v1.0.1 | .sdlc/memory/constitution.md | 吸收+转换；「Development Workflow」节（SDD 流程链、SDDWorkflow 链接）**待确认** |
| memory/AiGovernance.md v1.1.0 | .sdlc/memory/AiGovernance.md | 吸收+转换；写锁范围 `.specify/**`→`.sdlc/**`；§6 审计流程链接指向 legacy 归档**待确认** |
| memory/RoleAtlas.md v1.0.1 | .sdlc/memory/RoleAtlas.md | **全文待确认**（SDD 角色矩阵，新世界无唯一对应；verbatim 保留不提升为现役） |
| memory/EngineeringStandard.md v1.0.2 | .sdlc/memory/EngineeringStandard.md | 几乎全量吸收（项目分层/幂等/契约约束，仅 "Analyze 阶段" 词汇标待确认） |
| memory/DocumentationStandard.md v1.3.1 | .sdlc/memory/DocumentationStandard.md | 吸收+转换；§1 路径表、§5.2 修订窗口表按映射更新；§6 Sync 顺序链**待确认** |
| memory/InteractionProtocol.md v1.0.1 | .sdlc/memory/InteractionProtocol.md | 全量吸收（L0-L3 矩阵现役有效，仅写锁路径映射） |
| coding_guide/CodingGuide.md v1.0.1 | .sdlc/coding_guide/CodingGuide.md | 全量吸收 |
| coding_guide/SpringBackendCodingGuide.md v1.0.2 | .sdlc/coding_guide/SpringBackendCodingGuide.md | verbatim 全吸收（无旧根引用） |
| coding_guide/WebFrontendCodingGuide.md v1.0.1 | .sdlc/coding_guide/WebFrontendCodingGuide.md | verbatim 全吸收 |
| （范围外）wms-monitor `.specify/business-domain-bootstrap.yaml`、wms-portal `project-context/` | 不动 | 任务书明确排除 |

## 二、确定性转换规则（有序、最长优先、逐处记录 file:line 前后差异；不豁免残留门）
1. `.specify/scripts/bash/audit-entry-coverage.sh` → `.sdlc/scripts/bash/audit-entry-coverage.sh`
2. `.specify/business_domain/` → `.sdlc/business_domain/`
3. `.specify/memory/` → `.sdlc/memory/`　4. `.specify/coding_guide/` → `.sdlc/coding_guide/`
5. `.specify/workflow/`、`.specify/templates/` → `.sdlc/legacy/.specify/…`（唯一现役对应=归档位置）
6. `specs/`（含 `/specs/`、`specs/**`）→ `.sdlc/legacy/specs/`
7. `$speckit-sync` → `$sdlc-knowledge-sync`（D-084 唯一后继）
8. 残余 `.specify/` → `.sdlc/`（兜底，如写锁范围）
转换后逐文件过残留门（**不设目录豁免**，满足任务书"不以豁免代替内容处理"）。语义不可判定的段落不改动、仅在迁移报告「待确认」清单列出（SDD 流程链、Sync 顺序链、RoleAtlas 全文）。

## 三、新仓生成骨架（templates/governance-corpus/，{{KEY}}：PROJECT_NAME/DOC_DATE/AUTHOR/STANDARD_HOME）
- **memory 6 份**：constitution（五节骨架：核心原则/工程约束/治理/修订记录，待填槽）、AiGovernance（行为准则+治理写锁【范围=`.sdlc/**`+根 AGENTS.md】+知识路由【指向 sdlc-knowledge-sync 与 knowledge-target.yaml】+L0-L3 分级+提交门禁）、RoleAtlas（角色矩阵骨架，行全部 `<pending-owner-confirmation>`，注明现役角色权威在标准包 ai-sdlc 协议）、EngineeringStandard（分层/一致性幂等/集成契约/数据性能四节骨架，技术栈中立不预设 Java/Spring）、DocumentationStandard（对齐新面孔：.sdlc 目录表、Metadata/署名规则、L1-L4 命名、修订窗口、回填走 sdlc-knowledge-sync）、InteractionProtocol（L0-L3 矩阵，可即用）
- **coding_guide/CodingGuide.md**：索引骨架 + 待填语言指南条目（不预设语言）
- 红线：零退役词汇；引用仅指 `.sdlc/**`、`${AI_SDLC_STANDARD_HOME}`、AGENTS.md、sdlc-* skills；不虚构 owner/业务事实；声明自身为"项目治理参考"，不是标准包权威（呼应 standard-package-resolution.md:27 不得被当作标准源）。

## 四、行为矩阵（冲突/幂等/漂移/回滚）
- **生成**（INIT + AUDIT 补缺）：缺失→生成；存在且逐字节一致→no-op；不同→preserve+notice（沿用 plan_file 机制），绝不覆盖。
- **收编**（LEGACY walk 自动含 + `--adopt-governance-corpus` 显式入口）：目标不存在→移动+确定性转换（报告记 pre/post digest+逐条转换+待确认清单）；目标存在且转换后一致→源归档至 `.sdlc/legacy/.specify/…`、目标不动（不覆盖不拼接）；内容不同→该文件 BLOCKED 留原地，报告列冲突。部分已收编=逐文件独立分类，天然支持。源漂移→pre-digest 绑定，plan 失效拒绝（复用 DP1）。
- **兼容**：不开 adoption 标志时 C8 行为逐字节不变；adoption 只处理 memory/coding_guide 两目录，不碰其他 C8 内容，不绕任何歧义/安全门。
- **回滚**：复用两阶段 apply + EXIT 守卫 + 门失败回滚；修复三处 4-工件硬编码分流（EXIT 守卫 ~L277-283、门失败 ~L520-526、执行路由 ~L2759-2766）为「business_domain→BD_DIR，其余→SDLC_DIR」，新增语料路径三种路径全部一致。

## 五、实施步骤
1. 建 worktree/分支；gh 补读 STATE；复跑基线回归（557 确认）。
2. 模板 7 文件（第三节）。
3. 脚本改动：LEGACY walk 分类加 memory/coding_guide→TRANSFORM+转换器；INIT 生成 generator+staging+PAIR 列表+路由 case+两处回滚 case；AUDIT fill 列表加语料补缺；`--adopt-governance-corpus`（EXISTING/EXISTING_CODE_NO_KNOWLEDGE 型受限 walk，复用 PLAN_SHA/DP1/两阶段/回滚/报告）。
4. 测试：任务书第五节 12 项逐一落场景（52 起，沿用 pass/fail/snapshot/G1-R4 recipe）。
5. Decision-091（八段：范围/吸收与生成行为/效力边界【含合同 §52 边界：语料不是事实源不是写目标不是标准源】/冲突确认回滚兼容/实现状态）+ README 索引行。
6. 全量回归 ALL GREEN（557+新增）。
7. fixture+真实语料副本验证收编/冲突/回滚 → 真实仓**只读**预演（logistics-master `--audit` dry-run、logistics-center `--adopt-governance-corpus --plan`，零写入断言），变更清单留 Owner 审阅执行。
8. 交付 7 项（worktree/SHA、修改摘要、前后样例、回归、预演、未决冲突、复审入口）；独立分支提交，不 push/不合并不动 Control Plane。

## 六、未决/边界（不自行裁决）
- constitution「Development Workflow」、AiGovernance §1.2 流程链、DocumentationStandard §6 Sync 顺序、RoleAtlas 全文：SDD 时代语义，新世界对应物需 Owner 拍板，迁移时 verbatim 保留+待确认清单。
- 合同红线（project-governance-profile-template.yaml 的 legacy redline、speckit-generation-source-model.md:20 "not for new generated content"）与新能力的措辞衔接在 Decision-091 里一并记录，不改合同正文。