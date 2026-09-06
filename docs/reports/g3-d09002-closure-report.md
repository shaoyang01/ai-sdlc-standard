# G3 / D-090-02 手动主路径修复收口报告

> Version: 1.0.0
> Status: CLOSED（2026-09-05，独立复审 R6 轮最终建议 PASS-with-notes @ 2ab15fa，Current User 裁决 G3 完成（`MANUAL_OPERATIONAL` 确认）并完成五目录 Skill 重同步）
> 上游: [manual-runtime-semantic-contract v1.0.0](../../ai-sdlc/manual-runtime-semantic-contract.md) · [G3 需求冻结](g3-d09002-requirement-freeze.md) · Decision-090
> 授权边界: 本报告为治理事实记录；**G4（D-087 恢复/调整）未启动、未授权**。

## 1. 交付事实

- 实施范围：合同 §8.1 变更清单 C2–C10/C19——7 个 `skills/sdlc-*/SKILL.md` 条款修订（intake/design/gate/task-planning/implementation/code-review/knowledge-sync）、`sdlc-docflow-writer` publisher 唯一写入、4 个 `templates/*.md` 元数据与台账/finding 段对齐、`scripts/publish-requirement-manifest.sh` 新增（手动面自证投影协议）、`validate-skill-contracts.rb` G3 锚点、2 份 `ai-sdlc/*.md` G1 根语义同步（C19）。
- 实施提交链：`9d85bfe`(G2 冻结) → `c1d0e8b`(G3 实施) → `ba88d92`/`fa08ddd`/`10c4f3a`/`7f87263`/`2ab15fa`/`82478f6`(修复+补强)。
- 复审史：**6 轮独立只读复审，各轮 findings 经根因级修复后全部关闭**——R1(八项：H1 生命周期校验/H2 重放/H3 修复基线/H4 升档/H5 仪式残留/M1 A3 消费端/M2 DP4/M3 fixture 承重) → R2(六项：角色区分/candidate 完整性/重放判等/修复核验/准入范围/validator 同步) → R3(五项：枚举校验/replay-first/时间不变量/fixture 台账/source_ref) → R4→R5→R6 PASS-with-notes。全程独立反例与变异探针。

## 2. `MANUAL_OPERATIONAL` 达成证据

- **隔离 fixture**（`tests/manual-chain-fixture.test.sh`）：intake→knowledge-sync 全链无人工补文件/改状态，87 断言全绿。覆盖 CONFIRMED 与 ESCALATED 双分支（升档回流 + Re-Gate CONFIRMED(DEEP)）、PWR accept 与非 scan 拒绝（隔离 PWR 副本 + 正例对照）、直接返工复验关闭、混合发布、repair 基线重建、N2/N6/N8/N9 变异承重。
- **真实需求只读重放**：wms-monitor 的 CSV 导出需求由 fixture 内容代表（`20260905-fixture`），准入判定器按合同 §7.3 A1–A4 逐条机械评估。
- **基线**：bootstrap 557/0、validator ok（三 self-test true）。

## 3. 合同变更清单对应

| 合同项 | 实施状态 |
| --- | --- |
| C2 intake | ✓ manifest init + DP3 判定表 + runtime-dep 移除 |
| C3 solution-design | ✓ 首轮解耦 + depthCoverageLedger + 缺口增量 |
| C4 solution-gate | ✓ 三组合 + scannedDesignVersion + publisher 写入 |
| C5 task-planning | ✓ A1 准入 |
| C6 code-review | ✓ A3 + finding 登记 + 直返工 + 仪式清除 |
| C7 docflow-writer | ✓ publisher 唯一写入 |
| C8-a implementation | ✓ runtime-dep 移除 + 证据绑定 |
| C8-b knowledge-sync | ✓ A4 + finding 登记 + publisher |
| C9 templates | ✓ 4 模板元数据/台账/finding 段 |
| C10 publisher | ✓ 新增工具（自证协议） |
| C19 | ✓ 2 份合同根语义同步 |
| C20 validator | ✓ G3 锚点（N4/N6 负向 + 正向语义） |

## 4. 五目录 Skill 重同步

G3 修改了 7 个 Skill 文件。冻结裁决后完成五目录重同步：`~/.zcode/skills`、`~/.codex/skills`、`~/.kimi-code/skills`、`~/.hermes/skills`、`~/.config/opencode/skills`——全部 8 个 Skill 与产品仓一致（md5 验证 ✓）。

## 5. 下一步（冻结顺序）

下一转换为 **G4 / D-087 恢复与调整**（需求拆分 §6；`GW_VERTICAL_REBUILD` 授权未消费，delta assessment 后一次裁决）。G4 启动与实施须按冻结计划 §6 由 Current User 显式授权；本报告不构成该授权。

## 6. 明确未做

- 未启动 G4/G5 任何实施；未消费 GW_VERTICAL_REBUILD 或其他实现授权；
- 未修改 runtime/gateway、业务仓；未执行真实 Agent CLI 或业务 Git；
- Exchange/PKB/STATE 传播为本轮治理动作，不构成实施授权。
