# D091-R2 修复轮复审请求（整改方发出，2026-09-07）

> 本文件是整改方（D091 实施会话）发给独立复审的审查请求原文存档。
> 对应修复提交：`f3faac844681e27f160a4e29d5bb5e189c15fa31`（R2 修复轮）。
> 复审结论见同目录 `../D091-R2-review.md`。

请在 ai-sdlc-standard 仓库中补齐 bootstrap-knowledge-target.sh 对治理文档和编码指南的"存量兼并吸收 + 缺失生成"能力。

## 一、任务背景与目标

此前已经确定：
1. 目标业务仓已有 .specify/memory/、.specify/coding_guide/ 时，需要兼并吸收其中有效内容，整合到新 .sdlc 体系。
2. 目标业务仓没有这些内容时，初始化器需要生成相应骨架。
3. 重复执行应幂等，已有人工内容不得覆盖。

实际初始化 logistics-master 后，发现没有生成这两类文档；logistics-center 中的旧文档则仍留在原位。因此，本任务是补齐初始化器已经确定的能力缺口。

重点参考：
- /Users/eric_shaoooo/meicai/projects/logistics-center/.specify/memory/
- /Users/eric_shaoooo/meicai/projects/logistics-center/.specify/coding_guide/
- /Users/eric_shaoooo/meicai/projects/logistics-master/.sdlc/

## 二、必须使用独立 worktree

主工作区：/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard

主工作区另一个会话正在进行 D087 runtime 修复与复审。本任务不得修改该工作区文件、切换其分支，或混入 D087 的代码调整。

开始时：
1. 读取 AGENTS.md、Control Plane STATE 和相关 Decision，核对当前事实。
2. 检查 git status、git worktree list、最新提交，以及初始化器相关文件历史。
3. 建立本任务专用 worktree，例如：
   /Users/eric_shaoooo/meicai/projects/ai-sdlc-standard-governance-corpus-worktree
   分支：codex/d088-governance-corpus
4. 从核对后的、包含当前初始化器和相关合同的已提交基线创建，并记录完整 SHA。不要直接从缺少当前初始化器的 main 开工。

已知参考事实，必须重新验证：
- 最近主工作区 HEAD 为 9e6e0c7，D087 G4-R6 整改后待复审。
- f05d7cb 是交接中记录的初始化器基线，但不能未经比较就假定其测试和合同仍是最新。
- 最近一次初始化器回归实测为 557 passed、0 failed。

本任务所有修改和测试都在独立 worktree 中完成。不要操作其他会话的进程、未提交修改或 worktree。

## 三、先核实内容，再实现

先完整阅读 logistics-center 上述两个目录的文件，并核对现役标准包合同。

修改代码前，向用户展示：
- 存量文件清单与目标路径；
- 每份文档保留、吸收、更新或待确认的内容类别；
- 新仓拟生成的文档清单和主要章节；
- 具体输入数据与预期结果，包括冲突、重复执行、失败回滚。

这是本轮实施任务，可以在已明确范围内继续实现；确有无法确定的项目语义冲突时，单独列出，不自行编造或裁决。

"兼并吸收"必须保留有价值的项目内容，包括工程约束、编码规范、项目约定及其来源。不能用通用模板替换已有文档。

同时检查旧目录引用、旧流程命令、失效链接及与现役合同冲突的条款：
- 有唯一现役对应关系的内容，可以按明确规则转换并记录前后差异。
- 无法确定的内容应保留可追溯原件，并明确标记待确认；不得静默删除或提升为现役规则。
- 不要以全目录豁免残留门禁的方式代替内容处理。
- 历史归档与新生成的现役文档必须有清楚的用途区别。

## 四、功能要求

A. 缺失生成

目标归宿：
- .sdlc/memory/
- .sdlc/coding_guide/

memory 至少生成：
- constitution.md
- AiGovernance.md
- RoleAtlas.md
- EngineeringStandard.md
- DocumentationStandard.md
- InteractionProtocol.md

coding_guide 至少生成：
- CodingGuide.md

骨架应有可使用的章节结构、现役标准引用和待补充位置，不能只有标题。
不得虚构项目业务事实、负责人或未经代码证实的技术约定。
无需将标准包全文复制成项目内第二份权威，也不要预设所有项目都是 Java/Spring。
新生成内容不得引入退役流程和旧根路径。

B. 已有内容兼并吸收

对 .specify/memory/**、.specify/coding_guide/** 建立明确分类与转换规则，纳入可审计计划。

必须保护：
- 原始内容及来源可追溯；
- 目标已有人工内容；
- 源文件和目标文件的摘要；
- 失败后的可恢复性。

存在同名目标时不得覆盖或静默拼接。内容一致、内容不同、部分已收编，应分别定义确定性行为。

旧内容存在且未执行收编时，不要先生成同名空骨架占用其未来目标，造成后续迁移冲突。

C. 已初始化仓也能补齐

logistics-master 已进入 EXISTING/AUDIT，不能只修改 fresh INIT 分支。
AUDIT 应能够补缺失骨架，保留已有内容。

logistics-center 等已完成旧迁移的仓，语料仍被归为 C8，不会再次进入 LEGACY 迁移分支。需要提供显式收编入口，例如：
--adopt-governance-corpus

要求：
- 不使用该入口时，旧文件仍保持兼容的 C8 行为。
- 使用该入口时，只处理本任务的两个目录。
- 复用现有计划摘要确认、两阶段迁移、失败回滚和报告机制。
- 不借收编入口绕过无关的治理歧义或安全检查。

## 五、工程与测试要求

重点文件：
- scripts/bootstrap-knowledge-target.sh
- tests/bootstrap-knowledge-target.test.sh
- 必要的语料模板
- 相关行为规格与 Decision 索引

请自行追踪全部执行、计划与清理路径。特别注意现有 CREATED_FILES 对 business_domain 相对路径和 .sdlc 顶层路径存在分流，新增语料后必须确保正常写入、异常退出清理和门禁失败回滚使用一致的目标路径。

至少覆盖：
1. NEW_EMPTY 生成完整语料骨架。
2. EXISTING_CODE_NO_KNOWLEDGE 生成骨架。
3. 已初始化仓通过 AUDIT 补缺。
4. 人工内容保持原样，重复执行幂等。
5. 存量语料收编及来源追溯。
6. 未开启收编时 C8 保持兼容。
7. 同名冲突、部分已收编、源文件漂移。
8. plan/dry-run 对目标仓零写入。
9. 确认摘要失效时零写入。
10. 中途故障与残留门禁失败后的回滚。
11. 不可读文件、符号链接及路径越界。
12. 新生成文档零退役词汇、引用可解析。

必须跑完整原有回归及新增测试。不得通过删除断言、放宽门禁或调整测试前提掩盖问题。

## 六、真实仓验证与范围

先用隔离 fixture 和真实语料副本完成收编、生成、冲突与回滚验证，再对 logistics-master、logistics-center 做只读 plan/dry-run，展示实际将发生的变更。

本轮交付脚本和验证证据；真实仓正式迁移清单留给 Owner 审阅后执行，不在测试过程中直接修改业务仓。

不处理：
- D087 runtime、gateway、finding、recovery；
- wms-portal 域拆分；
- logistics-center 业务域重号；
- wms-monitor 旧映射转 confirmed；
- .specify/project-context/ 扩展收编；
- 全局 Skill 安装或同步。

## 七、决策与交付

检查 Decision 最新编号。若 091 仍空闲，使用 Decision-091，否则按当前编号规则递增，避免并发冲突。

按仓库八段格式记录：
- 本次补齐范围；
- 存量吸收与缺失生成行为；
- 旧内容与现役规则的效力边界；
- 冲突、确认、回滚及兼容策略；
- 实现和验证状态。

最终交付：
1. worktree、分支、基线 SHA。
2. 修改文件与实现摘要。
3. 存量吸收前后样例、新仓生成样例。
4. 完整回归结果。
5. 两个真实仓的只读预演结果。
6. 未解决的语义冲突和限制。
7. 独立复审入口。

可以在独立分支提交本任务变更；不自动 push、合并或修改 Control Plane，不将实施自验通过表述为独立复审通过。
