# Decision-088：知识目标初始化器立项与优先级裁决（D-088-01）

## 状态

Accepted（2026-09-03，Current User 裁决：「优先解决 sdlc-knowledge-sync 的项目长期知识目标初始化能力缺口；该问题关闭前，不继续处理 LOOP runtime 冒烟问题」。实施另需 Current User 显式授权，本 Decision 只登记缺口与优先级）

> 2026-09-03 Current User 复核补充（实施授权同时给出）：① 工作包编号统一为 **D-088-01**（编号规则：实施包跟随立项决策号 `D-<立项决策号>-<序号>`，与 D-087-01..05 一致；立项暂名 W-KT-INIT 废弃；历史 W-GW-* 波名不改写）；② 批准 roadmap v2.4.1 最小登记：D-088-01 插入 E5 顺序、先于 run8；③ 实施范围收敛为脚本聚焦（产品仓内：初始化脚本 + 目标声明 + skill 联动 + fixture 回归测试；三个业务仓零接触，dry-run 也不做）。

## 背景

- 七节点单轨（requirement-intake → solution-design → solution-gate → task-planning → implementation → code-review → knowledge-sync）切换后，知识沉淀统一由 `sdlc-knowledge-sync` 负责（Decision-084 确立 sdlc-* skills 为现役手动驱动主干）；与 Speckit Pipeline/Sync、specs source mode、dual rail 语义完全无关。长期知识目标位置 `.specify/business_domain/**` 仅沿用现状目录，不代表启用 Speckit 流程。
- 现有初始化链路仍是 speckit 时代产物：`bootstrap-current-project.sh`（= `bootstrap-speckit-project.sh` 薄 wrapper）管项目初始化，`bootstrap-business-domain.sh` 管长期知识骨架，后者经 speckit bootstrap 生成的 profile 声明式指向（`bootstrap-speckit-project.sh:2167`），从未向单轨迁移。

## 问题

只读分析（`docs/reports/knowledge-target-initializer-analysis.md`）确认四条：

1. `bootstrap-business-domain.sh` 残留旧语义：`specs/**`（601/698/793）、"Temporary Speckit machine artifacts"（698）、"Legacy rail"（700）、"future specs"（927）、99PendingConfirmation 待确认桶工厂（22-24/722/825/831-832/849-973/1028/1035-1037）；
2. `.candidate` 垃圾机制（127-136/149-171）：已有文件既不覆盖也不停止，且无已初始化检测——对已有完整知识库（logistics-center 类）重跑即产生垃圾文件；
3. 知识目标无确定性发现机制：`sdlc-knowledge-sync` 目标解析靠模型（sync-targets.md:17），且 active references 自身残留双轨表述（sync-targets.md:5 `legacy_speckit`/`new_rail_sdlc`）与多源开关（sync-inputs.md:111，与 SKILL.md Core Rule 2 单轨合同直接矛盾）；
4. 本机三业务仓实测：logistics-center 已有完整 business_domain；logistics-master 与 wms-portal 无 `.specify`（wms-portal 与外部前提"已有 project-context"不符，两台机器 `/Users/eric` 与 `/Users/eric_shaoooo` 仓库状态可能不同步）。

该缺口阻断七节点单轨知识沉淀主干在真实业务仓的可用性：场景 A/C 仓库无法被 `sdlc-knowledge-sync` 确定性定位目标。

## 决策

1. **立项 D-088-01（知识目标初始化器波）**，方向（细节以分析报告为准）：
   - 新增 `scripts/bootstrap-knowledge-target.sh`，不修改旧脚本（旧脚本仅加 deprecation note，归档另议）；新旧不共享代码；
   - 新增机器可读声明 `.specify/business_domain/knowledge-target.yaml`，`sdlc-knowledge-sync` 增补确定性解析规则（routable:false → PROPOSAL_ONLY；声明缺失 → BLOCKED）；
   - 顺带修正 active references 双轨/多源残留（sync-targets.md:5、sync-inputs.md:111）；
   - 99PendingConfirmation 彻底退出活动初始化路径；无 confirmed domain map 时只建空根结构 + awaiting_domain_map 状态；`.candidate` 机制废除（相同 no-op / 不同停止报告）；
   - 回归矩阵含禁词扫描（`specs/**`/`Speckit`/`$speckit-sync`/`dual rail`/`legacy rail`/`99PendingConfirmation`）。
2. **优先级裁决**：D-088-01 优先于 LOOP runtime 冒烟；该缺口关闭前不推进 D-087 顺序中的真实 CLI 冒烟（run8）。D-087 纵向重建波暂停（`GW_VERTICAL_REBUILD` live authorization 保留、不消费，D-088-01 收口后恢复）；E5-L3 冻结、D2 挂账、ladder ② ③ PENDING 边界全部不变。
3. **排除范围**：跨仓 Requirement / aggregate requirement / initiative ID；三个业务仓的业务代码；LOOP runtime（Provider/Gateway/Adapter/spawn/resume）；Personal-KB 投影；历史 library 回填；具体业务需求的知识同步；历史 `library` 回填。
4. **授权边界**：本 Decision 不构成实施授权。D-088-01 实施需 Current User 对实施范围的显式授权（2026-09-03 已授权脚本聚焦范围）；三个业务仓零接触（含 dry-run），三仓场景仅作为 fixture 回归测试用例存在，正式初始化另行逐仓授权。

## 原因

- 初始化器是 knowledge-sync 的前置能力：没有合格初始化器，七节点单轨在真实业务仓的知识沉淀无法开始，比 runtime 冒烟（验收问题）更紧急；
- 旧脚本补丁式修改无法保证输出零 speckit 语义（usage/正文/生成文档全链残留），且旧调用方（speckit bootstrap profile 声明 + 三份文档）会被语义变更污染；
- references 内残留的双轨/多源表述会用旧语义解释新初始化器的干净产物，必须同波修正。

## 影响

- 产品仓（实施授权后）：`scripts/`、`skills/sdlc-knowledge-sync/**`、`docs/OPERATION_GUIDE.md`、`docs/VALIDATION.md`、视核查 `ai-sdlc/shared-business-domain-governance.md`、新增回归测试；
- 本 Decision + 索引 + 分析报告（本 commit）；CP STATE 登记随即执行（分支 + PR）；
- roadmap v2.4.0 补记 D-088-01 优先级另行授权（v2.4.0 route amendment 流程先例）；
- 三业务仓：本波零写入（dry-run 只读），正式初始化逐仓授权。

## 实现状态

- 只读分析报告入库（本 commit `docs/reports/knowledge-target-initializer-analysis.md`）；
- 本 Decision + 索引行（本 commit）；
- CP STATE 登记：本 commit 后执行；
- 实施：待 Current User 显式授权。

## 依据

- Current User 2026-09-03 裁决（优先级原话，见状态段）；
- 只读分析：`scripts/bootstrap-business-domain.sh` 行号证据（§问题 1/2）、`skills/sdlc-knowledge-sync/references/sdlc-speckit-sync/sync-targets.md:5,17`、`sync-inputs.md:111`、`scripts/bootstrap-speckit-project.sh:2167`；
- 本机三业务仓 `.specify` 实测（2026-09-03）；
- Decision-084（sdlc-* skills 现役主干）、Decision-087（被暂停的纵向重建，其 live authorization 保留）。
