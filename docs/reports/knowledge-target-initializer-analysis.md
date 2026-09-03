# 知识目标初始化器只读分析（Decision-088 / D-088-01 立项依据）

> 日期：2026-09-03
> 性质：只读分析，零代码/仓库修改
> 结论：现有 `bootstrap-business-domain.sh` 不可作为 `sdlc-knowledge-sync` 的合格初始化器；建议新增独立初始化器 + 机器可读目标声明，旧脚本降级标注。
> 本机环境：`/Users/eric/meicai/projects/`（注意 Current User 另有公司机 `/Users/eric_shaoooo/...`，两台机器业务仓状态可能不同步）。

## 1. 原初始化链路的真实调用关系

```text
scripts/bootstrap-current-project.sh          # 薄 wrapper：只解析 cwd 并转发参数
  └── 委托 → scripts/bootstrap-speckit-project.sh   # 核心项目初始化（profile / project-context / library）
        └── 生成的 project-governance-profile.yaml 内“声明式指向”
            generation_script: scripts/bootstrap-business-domain.sh
            generate_after_project_bootstrap: true          # bootstrap-speckit-project.sh:2167
              （非运行时调用，是生成产物里的文本声明）

scripts/bootstrap-business-domain.sh          # 长期知识骨架初始化（speckit 时代，未迁移单轨）
```

文档层调用方：`docs/OPERATION_GUIDE.md:188-189`、`docs/VALIDATION.md:878,1465-1492`、`docs/SPECKIT_BOOTSTRAP.md:31,312-339`（speckit 时代文档）。
当前有效 skill：`skills/sdlc-knowledge-sync/SKILL.md`（单轨合同：library 对账输入、只同步稳定事实、`.specify/business_domain/**`、缺授权即停）。该 skill **没有任何初始化器**，目标发现靠模型解析（见 §3-3）。

## 2. 旧语义残留的精确位置

`scripts/bootstrap-business-domain.sh`：

| 行号 | 残留 |
| --- | --- |
| 22-24 | usage 声明生成 `99PendingConfirmation/**` 三个文件 |
| 127-136 | `candidate_path()`：冲突时不停止，生成 `.candidate` 垃圾文件 |
| 149-171 | `write_or_preview()`：已有文件即改写为 `.candidate` 目标；无已初始化检测、无 no-op、无 stop-and-report |
| 601 | "Keep temporary implementation names in `specs/**`" |
| 698 | Fact Source Layering：`specs/**` = "Temporary Speckit machine artifacts" |
| 700 | "Legacy rail \| Existing legacy Skill inputs only"（双轨语义） |
| 722, 825, 831-832 | landscape/catalog 把 99PendingConfirmation 写进 L1/L2/L4 可路由索引 |
| 793 | "Keep temporary implementation notes in `specs/**` or `library/**`" |
| 849-973 | `generate_l2/l4/entry_coverage`：99PendingConfirmation 待确认桶工厂 |
| 927 | "Which facts should sync from future specs into long-term docs?" |
| 1028, 1035-1037 | pending 模式 mkdir + 写入 99PendingConfirmation 三件套 |

active skill references 内部残留（prompt 未覆盖的新发现）：

| 文件:行 | 残留 |
| --- | --- |
| `skills/sdlc-knowledge-sync/references/sdlc-speckit-sync/sync-targets.md:5` | "governed by both `legacy_speckit` and `new_rail_sdlc` rails"（双轨表述活在现行 skill），引用 `ai-sdlc/shared-business-domain-governance.md`（存在，内容待核查） |
| `sync-targets.md:17` | 以 `specs/{feature}/**` 存在性定义 library_driven 模式 |
| `sync-inputs.md:111` | `pipeline_sync_executed / library_sync_executed / source_of_truth` 多源开关，与 SKILL.md Core Rule 2“单轨、无多源开关”直接矛盾 |

可复用的干净部分（confirmed 模式，`bootstrap-business-domain.sh:318-635`）：domain map fail-closed 校验齐全（缺字段/空数组/路径穿越/重复 ID 拒绝：328-341、438、455）；L4 模板含 `frontend-application`（358-364）；模板占位符未解析即失败（397-407）；git user.name 检查（113-121，dry-run 放行）语义正确。

## 3. 根因

1. 七节点单轨切换（Skill 收编，Decision-084 确立 sdlc-* skills 为现役手动驱动主干）时，只收编了 skill 合同，没有收编/重写配套的**初始化能力**——初始化仍指向 speckit 时代脚本。
2. 旧脚本的 pending 桶设计把“未确认”物化成正式结构的可路由子路径（99 前缀进入 L1/L2 Index），与现行合同“未确认内容不得进入正式长期知识”冲突。
3. 冲突处理采用 `.candidate` 改道而非“相同 no-op / 不同停止”，且无“已初始化”状态判定。
4. 知识目标没有机器可读声明，`sdlc-knowledge-sync` 目标解析依赖模型（"resolve from library or explicit user confirmation"），同类缺口会反复复发。

## 4. 推荐修复边界

- **新增 `scripts/bootstrap-knowledge-target.sh`**，不修改旧脚本（旧脚本加 deprecation note 指向新脚本；归档另议）。新旧不共享代码（需要 confirmed-mode 逻辑则提炼复制，不 import）。
- **新增机器可读声明 `.specify/business_domain/knowledge-target.yaml`**（status / root / naming_convention / project_type_profiles / routable / created_at）。
- **`sdlc-knowledge-sync` 最小联动**：SKILL.md + `sync-targets.md` 增补确定性解析规则（读 knowledge-target.yaml：routable:false → PROPOSAL_ONLY；声明缺失 → BLOCKED 提示先初始化）；顺带修正 sync-targets.md:5 双轨措辞、sync-inputs.md:111 多源开关表述（与 Core Rule 2 对齐）。
- **99PendingConfirmation 彻底退出活动初始化路径**；未确认事项只进初始化报告 `remaining_confirmation` 字段与 sync 的 PROPOSAL_ONLY。
- 无 confirmed domain map 时：创建三个空根文档骨架 + knowledge-target.yaml（status: awaiting_domain_map，routable: false），catalog 索引留空并注明 "routable targets: none until confirmed domain map"。不虚构业务事实。

## 5. 初始化器输入 / 输出 / 状态模型

- 输入：目标仓路径（必须本仓）、可选 confirmed domain map（YAML）、`--dry-run`、`--project-type-profile`。
- 输出：`.specify/business_domain/{00BusinessLandscape,00UbiquitousLanguage,01DomainCatalog}.md`（缺则建）、`knowledge-target.yaml`、`.specify/reports/business_domain_bootstrap_report.md` 历史化报告（created / reused / skipped / blocked / knowledge target / source evidence / remaining confirmation）。
- 状态机：`absent → initialized-empty(UNROUTED, routable:false) → routed(confirmed domain map, routable:true)`；已有完整库 → `reused(preserved)`，只补缺失声明（需 create-if-missing 授权）。
- 不变量：不覆盖已有知识/目录形状；相同内容 no-op；不同内容停止报告（--force 不解锁已有根文档覆盖）；零 `.candidate`；正式执行前检查 git user.name（dry-run 放行）；不写其他业务仓；不产生/依赖 specs/**；不出现 Speckit 运行语义。

## 6. 三类仓库行为矩阵

| 场景 | 代表仓（本机实测 2026-09-03） | 初始化器行为 |
| --- | --- | --- |
| A 无长期知识库 | logistics-master（本机无 `.specify`） | 建最小根结构 + awaiting_domain_map 声明；零业务事实虚构 |
| B 已有长期知识库 | logistics-center（3 根文档 + 10 域目录完整） | 逐文件比对：相同 no-op / 不同 blocked 停止；只补缺失声明；旧表述迁移建议仅入报告 |
| C 有 project-context 无 business_domain | wms-portal（**本机实测无 `.specify`，与 prompt 前提不符**；公司机状态待核） | 只补知识目标，不触 project-context；按 frontend-application 提供 L4 模板 profile |

回归矩阵用 fixture 仓覆盖场景 C；实仓先 dry-run 验证，正式初始化逐仓单独授权。

## 7. 回归矩阵（含禁词门禁）

零写入 dry-run / 正式初始化最小合法目标 / 重复执行 no-op / 相同根文档复用 / 不同根文档停止 / 完整库不改写且零 `.candidate` / 只有 project-context 只补目标 / 缺 git user.name 正式失败 dry-run 报告 / 合法 domain map 生成可路由 L1/L2/L4 / domain map 缺字段、重复 ID、路径穿越、空数组 fail-closed。
输出扫描禁词：`specs/**`、`Speckit`、`$speckit-sync`、`dual rail`、`legacy rail`、`99PendingConfirmation`；必含词：`sdlc-knowledge-sync`、`library/{requirement_id}/`、`.specify/business_domain/**`。

## 8. 预计修改文件（实施授权后）

- 新增：`scripts/bootstrap-knowledge-target.sh`、回归测试、（脚本生成物）`knowledge-target.yaml`
- 修改：`skills/sdlc-knowledge-sync/SKILL.md`、`skills/sdlc-knowledge-sync/references/sdlc-speckit-sync/sync-targets.md`、`sync-inputs.md`、`docs/OPERATION_GUIDE.md`、`docs/VALIDATION.md`、视核查 `ai-sdlc/shared-business-domain-governance.md`
- 不动：`bootstrap-business-domain.sh`（仅文档 deprecation note）、业务仓业务代码

## 9. 实施顺序

设计定稿 → 新脚本 → knowledge-target.yaml + skill 最小联动 → 回归测试（含禁词扫描）→ 三实仓 dry-run 只读验证 → 文档增补 + deprecation note。每步完成后停等，正式初始化与 roadmap v2.4.0 补记另行授权。

## 10. 待 Current User 裁决

1. 两台机器（`/Users/eric` vs `/Users/eric_shaoooo`）业务仓状态哪个权威，尤其 wms-portal project-context（本机不存在且本机 wms-portal 有 1 个未提交变更）。
2. D-088-01 实施授权（见 Decision-088 决策 5）。
