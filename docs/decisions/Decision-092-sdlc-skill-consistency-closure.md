# Decision-092：SDLC Skill 一致性优化收口与治理归档

## 状态

Accepted / 2026-09-08 Current User 指令“直接做项目治理”。本轮 Skill 优化完成并进入治理收口；集成、CI、Exchange 与 PKB 的实际进度以产品 PR、Control Plane STATE 及固定回执为准。

## 背景

D087/D091 集成后，Owner 要求先处理 sdlc-* Skill 的现役指令一致性，保留业务需求产物；PR #132/#133/#134 完成模板与历史拷贝清理。R2 独立核验基线为 `37f0a8d5808fcb74686249b4faba128be2251b9d`。

## 问题

R1-H1 的部分现役示例和 ESS schema 仍指导原始反馈进入代码审核、生成发布裁决或旧审核结论；DocFlow 还明确加载过期流程规范。R1-H2 的四条精确回退已被捕获，但 Ruby 表格拆列丢弃最后一个实际列，末列旧处置值可漏检。详细证据与合并根因见[复审报告](../reports/sdlc-skill-consistency-r2-review.md)。

## 决策

1. 接受历史拷贝直接移除的既定方向；现役 Skill 保留能力内容与合法 provenance，历史由 Git 保存。
2. 本轮补修范围固定为五个现役文件：DocFlow 入口与执行示例、两个实际加载的 ESS schema、既有 Ruby 校验器；无运行时代码或业务需求产物修改。
3. 以合同引用链、真实旧行回退、末列/处置检测、误报正例、检测器撤回变异和运行回归作为 R1-H1/H2 关闭证据；不将四客户端字节一致代替语义核验。
4. 按 Current User 本次治理指令完成本轮提交、PR、Ready、合并、Source 收口、STATE 登记、Exchange Publisher 发布及 PKB 受控归档。发布回执未完成前保持 PENDING；各动作基于当前指令与经核验的本轮对象，不从测试 PASS 推导其他授权。
5. D091 业务仓收编、pending_confirmation、终值改注及 G5/G6/run8 不属于本轮授权；下一实施范围由 Current User 单独决定。

## 理由

删除过期副本后，仍需消除实际加载链上的具体冲突；检测器必须保护本批真实 Markdown 表格形态。项目治理需把本机验证转为可恢复的源码、PR、状态和不可变传输记录。

## 影响

八个 Skill 的能力与七节点顺序不变；两个 ESS schema 作为现役内容结构与共同语义合同对齐。四客户端八包同步一致。已运行会话的历史上下文不会随文件同步自动清除。

## 实施状态

- R2 原始基线 159/159 文件串行通过，修复后 tsc 与三个 Ruby 校验器通过；21 项负例 killed、8 项正例 allowed；两处检测器修复撤回分别变红。
- 修复后全量 CI 在本次 PR 上独立执行；本地基线回归不得冒充修复树第二次全量运行。
- Current User 先明确“有问题你直接进行修改吧，不要再找 glm 操作了”，随后在修复结果与未提交状态已展示后要求“直接做项目治理”。前者承载修复授权，后者承载本轮治理闭环；不授予下一包实施权限。
- 本文不预造合并提交、Exchange/PKB commit 或成功回执。完成后的唯一动态恢复入口为 Control Plane STATE。

## 代码依据

- 基线：PR #134，`37f0a8d5808fcb74686249b4faba128be2251b9d`；第一父 `bec8a2398934658bff125c12dff425a1d7823f51`。
- [R2 复审与修复报告](../reports/sdlc-skill-consistency-r2-review.md)及其旁置结构化证据目录。
- [共同语义合同](../../ai-sdlc/manual-runtime-semantic-contract.md) §3/§5/§6/§7、[项目治理](https://github.com/shaoyang01/ai-project-control-plane/blob/main/projects/ai-sdlc/GOVERNANCE.md) §15.3–15.5。
