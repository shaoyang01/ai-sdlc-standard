# Decision-046：Decision Record 模块化与历史卷冻结

## 状态

Accepted（2026-08-22，Current User 接受“保留既有编号、冻结历史卷、后续一事一文件”的改造方案）

## 背景

`docs/AI-SDLC-Decision-Records.md` 已连续记录 Decision-001～Decision-045，正文超过 1700 行。Decision-044 的经历证明：仅把大量过程、分析和裁决压入一个持续增长的文件，会让关键的可执行映射难以发现，也使 fresh controller 很难判断某项内容是原裁决、后续补充还是当前实施计划。

现有编号已被 Roadmap、C01/C02 Plan、control plane、PR 和历史交付引用。重新编号或拆迁既有正文会破坏稳定引用，也会产生大范围无业务价值的 diff。

## 问题

如何在不改写 Decision-001～045、不破坏既有引用的前提下，降低后续 Decision 的定位、审阅和维护成本，并保证决策记录仍与动态控制状态分离？

## 决策

1. `docs/AI-SDLC-Decision-Records.md` 冻结为 Decision-001～045 历史卷；可增加索引/后续补充链接，但不再向其中写入 Decision-046 之后的完整正文。
2. 新建 `docs/decisions/README.md` 作为唯一 Decision 索引。
3. Decision-046 起一事一文件，命名为 `docs/decisions/Decision-NNN-<short-slug>.md`；既有编号连续递增，不另起第二套编号，不建立 `Decision-Records-2.md`。
4. 每份新 Decision 固定使用八段：状态、背景、问题、决策、原因、影响、实现状态、依据。
5. 状态变化在原文件原位追加日期和事实，不覆盖原裁决，不创建重复编号。
6. Decision 只保存稳定裁决及其可恢复依据；当前授权、运行尝试、live finding、PR/CI/HEAD 仍属于 control plane STATE 和执行证据。
7. 产品仓先形成权威决策和实施规划；是否同步 CP/PKB 由单独授权决定，Handoff 只能引用权威源，不得成为遗失正文的替代品。

## 原因

- 冻结历史卷能保持所有既有链接稳定，避免为文档整理制造大规模历史漂移。
- 一事一文件让标题、状态、影响和实施边界可直接检索和审阅，减少长文件中“记录了结论但找不到执行细节”的风险。
- 独立索引提供连续编号和定位入口，同时不把动态控制事实重新塞回产品文档。
- 不复制完整合同和映射表，能保持 Decision、Plan 和实施文档之间的单向引用，减少多份权威。

## 影响

- Decision-001～045 的正文和编号不变；Decision-044/045 的后续可执行细节通过链接指向 C02-WP3.5 阶段 2 分析稿。
- 后续 Decision review diff 以单文件为单位，fresh controller 可从索引定位。
- CP 的项目治理规则和 PKB 的相关索引尚未同步；在获得后续授权前，它们不应宣称已采用本结构。
- 本决策不接受 C02-WP3.5 阶段 2 分析内容，也不授权任何 runtime、Skill、registry、安装副本或 Git 发布实施。

## 实现状态

产品仓本地已创建 `docs/decisions/README.md` 与本文件，并在历史卷顶部/尾部加入新索引入口。CP、PKB、commit 和 push 未执行。

## 依据

- `docs/AI-SDLC-Decision-Records.md`：Decision-001～045 历史卷及其当前长度。
- [C02-WP3.5 阶段 2 影响分析与实施规划](../LOOP-CORE-C02-WP3.5-SINGLE-RAIL-IMPACT-ANALYSIS.md)：Decision-044/045 的后续可执行恢复面。
- Current User 2026-08-22 对“先补全 WP3.5 内容，再做 Decision 改造，授权执行后议”的顺序确认。
