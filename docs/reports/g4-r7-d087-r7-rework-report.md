# G4-R7 / D-087 复审整改交付报告

> 文档性质：G4 第七轮复审（R7，结论 FAIL：B1–B7 功能阻塞 + B8 验证阻塞）逐条整改的交付与验收证据。
> 整改基线：`9e6e0c7`（分支 `feature/c03-e5-autonomous-acceptance`）。本轮变更：**10 个文件（4 代码 + 6 测试），+515/−63 行**（另含本报告）。
> 结论先行：**8/8 阻塞项整改闭环**；全量 159/159 逐文件串行全绿、tsc 0 错、六场景矩阵 44/0、定向变异 4/4 捕获（含 R7 指定的 M-E/M-F）。

## 1. 逐条整改

- **B1（中断路径绕过 v5 写门）**：`interruptCapabilityExecution` 构造的新建 failed terminal 显式 stamp `schemaVersion = LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION`——中断 terminal 是当下创作的新事实，即使关闭的是 legacy (v4) started claim 也以现役版本落库；历史行 canonical 与重放不动（`core/loop-run-store.ts`）。
- **B2（blob 同等性 ≠ 登记身份）**：成员身份三重绑定——(1) `isRegisteredScanMember`：finding 必须绑定 producer scan terminal 的 createdAt 或该轮检验的 revision id（`producerExaminedRevisionId` 由 scan 输入三元组解析）；(2) 成员数完整性：对 canonical envelope ledger 从 digest 校验 blob 派生期望成员数（`readScanLedgerMemberCount`，opaque/未绑定 store 容忍跳过并回退身份绑定）；(3) **directive 整体派生比对**（`validateRegistrationBindingAgainstEvent`）：runInvalidation/registerReflowFinding/adjudicateScanFindings 全部由终态事件事实派生并要求逐字段相等——改 directive 的冲突重放与借引用接受（含 CRITICAL 前置遮蔽路径之外的 HIGH 同节点借用）全拒绝。三条入口（同事务裁决 / acceptFindingRisk / 重放校验）共用同一谓词。
- **B3（同批失效复用旧 ACTIVE 快照）**：注册事务内 `staledInTransaction` 集合同步失效状态——同批后续 finding 对已失效 revision 跳过物理重标但仍记录完整 scope 证据边；真实外部漂移仍 fail-closed。
- **B4（准入语义）**：A1（runtime + entry）改 §5.2 返工目标语义——`earliest < planning` 才阻 planning 准入，earliest == planning 的 finding 是返工目标本身必须可执行；**A4 前置**：knowledge-sync 派发前要求无 OPEN finding（OPEN 基准；closed finding 的下游 MISSING 是尾段未执行的正常态，不构成自锁）。
- **B5（PWR refs 随行）**：runtime 派发 input 携带 `riskAcceptanceRefs + decisionDeltaRef/Digest`（digest 校验的 delta 派生，空 refs 合法、永不虚构）；real gateway 将 provenance 附加进实际 input 正文——贯通 staged 文件、stdin 与 prompt 载体（矩阵场景 4 以唯一标记断言 task-planning/implementation 的真实 stdin+staged 可达）。
- **B6（prepared 路径符号链接绕过）**：业务根比较改 `realpathSync` 物理身份（字面/末级/父级 symlink 均拒）。
- **B7（隔离失败不留恢复事实）**：终验扩展到 real 调用的**所有出口**；漂移即以 `run_blocked / PRODUCTION_ISOLATION_VIOLATED` 持久化为既有 run 恢复可消费的事实——同 run 重入被恢复层 BLOCKED，不得把污染后基线当新净基线复用成功结论。
- **B8（验证前提）**：h1(d) 接受版本门对照改用「合法 OPEN HIGH 原始 scan 成员（SQL 归位 OPEN，含 proof 清除，canonical 一致）+ 仅版本差异」；h5(f) 新增同内容 ledger 顺序门定向断言；blocked 归约探针改真实事件（blocked→success 不再 blocked）；矩阵 s6 逐次断言每个 adapter cwd === prepared root + 真实业务根（repositoryPath）零 staging 泄漏；错误码逐项断言（INVALID_INPUT/ILLEGAL_TRANSITION）。
- **R7 建议项**：两处过期注释（"PASS resolves ALL" 残句、regate MAX(attempt) 文案）已清理；PointLastAttempts 退役别名按兼容保留。

## 2. 行为语义更新（附合同依据）

A4 预派发使「OPEN finding 未关闭时 knowledge-sync 不准入」成立后，wp4-W3 / wp5-P3 / wp6-CC2 三处测试期望按合同更新为「返工 → 发现节点逐项 resolve（以重建产物为证据）→ 尾段重建 → 完成」（§5.2 + §7.3 A4；R7 报告 B4 回归矩阵原文）。

## 3. 全量验证

| 验证 | 结果 |
| --- | --- |
| `tsc --noEmit` | 退出 0 |
| 159 个测试文件逐文件串行 | **159/159 全绿** |
| 六场景矩阵 | 44/0（新增 B5 载体可达断言 + B8 cwd/根断言） |
| G4 反例矩阵（fix-round） | 27/0 |
| finding lifecycle / artifact revision / envelope | 351/0 · 237/0 · 44/0 |
| WP4 regate / WP5 cross-entry / WP6 completion | 122 · 177 · 34 断言全过 |
| Ruby validators ×3 + control-plane validate_state | ok |
| **定向变异** | **M-E（删接受版本门）红 · M-F（删 journal 顺序门）红 · M-A（status 默认化）红 · M-C（H4 重试回退）红——4/4 捕获** |

## 4. 边界

G3 冻结面零改动；G5 projector/parity 未实现（正确边界）；真实 CLI/冒烟未执行；push 与 Control Plane STATE 更新留待 Current User 指示。
