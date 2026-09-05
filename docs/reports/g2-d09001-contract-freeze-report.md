# G2 / D-090-01 共同语义合同冻结收口报告

> Version: 1.0.0
> Status: CLOSED（2026-09-05，独立复审 R13 轮最终建议 FREEZE，Current User 裁决冻结并接受保证 A 口径）
> 上游: [manual-runtime-semantic-contract.md v1.0.0](../../ai-sdlc/manual-runtime-semantic-contract.md)（本波交付物）· Decision-090 · [冻结执行计划](decision-090-c03e-prerun-governance-plan.md) §4/G2 · [需求拆分 v1.0.0](decision-090-c03e-prerun-requirement-decomposition.md)（DP1–DP5）
> 授权边界声明: 本报告为治理事实记录；**G3（D-090-02 手动主路径修复）未启动、未授权**。

## 1. 交付事实

- 交付物：`ai-sdlc/manual-runtime-semantic-contract.md` **v1.0.0 ACCEPTED**——七节点流程语义唯一权威，七域冻结（节点 IO/稳定路径、深度状态机含 DP3 判定表与覆盖台账、Finding 全链生命周期含两类承载分离与 `resolveFinding` 复用、manifest 三对象与自证投影协议、journal 投影、PWR/失败码、变更清单 C1–C20 与负向矩阵 N1–N9）。
- 复审史：**13 轮独立只读复审，各轮 findings 经根因级修复后全部关闭**——R1 四项 blocker（状态机/生命周期/发布协议/同步清单）→ R2 三项（深度规范单一化、全链 finding、rename≠事务）→ R3 三项（触发枚举统一、来源×类别矩阵、投影基线）→ R4 两项（补丁落盘事故如实披露后修复、关闭复验准入豁免）→ R5–R12 逐轮收敛（前缀优先判别、关闭复验三步收尾、findingIndexRev 删除、两类承载分离、投影字段整行交叉绑定、状态双语义）→ **R13 FREEZE**（含非阻塞 L1 引用更正建议）。
- 附带收口：保证 B 裁决（见 §3）；G1 遗留的 A10/A13/A14 勘误（规格 v1.1.0）已在 G2 前完成。

## 2. R13 轮 FREEZE 核验摘要（v0.13.0 字节）

- 手动 ACCEPTED 唯一合法表示成立；保证 A 四项可追溯承载恢复；runtime ACCEPTED 不伪造解决 revision；V6′ 同状态依据篡改 STOP 与四字段漂移拒绝保留。
- V1–V14 全量纸面走查成立（含 V2 双面、V9 混合发布互不覆盖、V13 无 Git 提交时保证 A 成立）。
- 19 条防回归边界逐条无回退；G1 固化面（DP4/双根拒绝/I1/I4/双 binding）无削弱。

## 3. Current User 裁决记录（2026-09-05）

1. **G2 冻结**：依据 R13 轮 FREEZE 建议（绑定 v0.13.0 工作区字节），裁决 G2 / D-090-01 合同冻结；v1.0.0 并入非语义变更（L1 引用更正、保证 B 裁决入案），语义与 v0.13.0 无变化。
2. **保证 B 裁决：接受保证 A 口径**——手动面审计保证仅覆盖不可变发现事实 + 当前生命周期状态的依据/责任主体/绑定 revision 可追溯（findingIndex 行内字段承载）；**不要求保存每次未提交 publisher 发布的完整 manifest 快照**；Git 仅提供用户实际提交过的版本，publisher 不执行 commit，Git 提交非状态生效/准入前置。如未来需要完整发布历史，另行立项与授权。

## 4. 下一步（冻结顺序）

下一转换为 **G3 / D-090-02 手动主路径修复**（需求域见需求拆分 §5；变更清单 C2–C10/C19 等按合同 §8.1）。G3 启动与实施须按冻结计划 §6 由 Current User 显式授权；本报告不构成该授权。G3 完成后需重做五目录 Skill 同步。

## 5. 明确未做

- 未启动 G3/G5 任何实施；未消费任何实现授权；
- 未修改 runtime、业务仓；未执行真实 Agent CLI 或业务 Git；
- Exchange/PKB/STATE 传播为本轮治理动作，不构成实施授权。
