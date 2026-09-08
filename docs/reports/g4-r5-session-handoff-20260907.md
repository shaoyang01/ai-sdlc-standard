# G4-R5 修复轮会话交接（2026-09-07 晚间存档）

> 文档性质：跨机器会话交接快照。新会话恢复时先读本文件，再按 AGENTS.md 导航读权威源。
> 当前裁决上下文：G4-R5 修复轮已完成并自验，**G4-R6 复审已由 Current User 完成、报告未下发**；
> 复审方口头反馈"问题很多"。下一步 = 拿到复审报告后在本分支继续整改。

## 1. 现场（当前状态）

- **分支**：`feature/c03-e5-autonomous-acceptance`
- **整改基 commit（本轮修复全部内容，单 commit）**：`f8fe344`
  （父 = 评审基线 `28c5114`；42 文件，+2976/−701）
- **已验证状态**：`tsc --noEmit` 0 错误；全量 156/156 测试文件逐个
  `node --import tsx` 全绿；3 个 ruby validator ok；D-087 六场景矩阵 31/0；
  变异探测 M2/M4 捕获、M1/M3 双层覆盖。
- **交付报告**：`docs/reports/g4-r5-d087-root-cause-fix-report.md`
  （十项验收 + G4-01～06 覆盖矩阵 + 兼容性 + 回滚说明 + PASS 建议）。

## 2. 明天的续作方式

1. `git pull` 本分支，确认 HEAD 为本文件所述 commit 之上（handoff commit）。
2. 向 Current User 索取 **G4-R6 复审报告**，逐条建立整改清单
   （预期"问题很多"——按 Blocker/Major/Minor 分级，逐条给修复证据）。
3. 整改仍在本分支进行；每修一批跑对应套件 + 受影响矩阵；完成门 =
   复审方全部条目闭环后再申请下一转换。
4. 整改时注意复审 prompt（已交付 Current User）中标注的四个实现薄弱点与
   五处行为语义变更——复审"问题很多"大概率集中在这里：
   - 五处行为语义变更：IMPROVEMENT 直达返工、PWR 判决即接受、blocked
     terminal 重跑、discovery anchor 泛化（不限本节点产物）、RISK_ACCEPTED
     人工 release 废止；
   - 四个实现薄弱点：entry/runtime 双层 A1、envelope+depth 表双层三态、
     `planRegateFromFacts` 的 blocked 续跑 + Gate 重判强制、
     `readCapabilityExecutionRowsValidatedInTransaction` 绕链读路径。

## 3. 环境备忘（公司机器首跑必读）

- tsx CLI 在上一位环境被沙箱阻断；测试统一
  `/Users/eric/.nvm/versions/node/v24.12.0/bin/node --import tsx tests/<file>`。
  公司机器若无此限制可回归 `npx tsx`，但先抽查一个文件对照等价。
- `npm test` 聚合器有并行 I/O 噪声：逐文件串行结果为准。
- baseline 对照方法（M1 归类用）：
  `git worktree add /tmp/<dir> 28c5114` + 复用产品仓 node_modules。

## 4. 权威与边界提醒

- 状态权威仍是 Control Plane STATE（本次治理已在控制面仓库建立 STATE 更新
  分支，见 §5）；本文件只做会话交接，不做第二规划权威。
- 原 G4-R5 任务边界（不 commit/push 等）随修复任务结束解除；本轮治理
  checkpoint 由 Current User 明确指示执行（保留现场、跨机器续作）。
- G3 冻结面与 G5 边界约束继续有效；真实 CLI 冒烟仍需单独授权。

## 5. Control Plane STATE

- 分支：`governance/g4-r5-fix-round-checkpoint`（STATE 更新走分支 + PR，
  未自行合 main——以 Current User 明日合入为准）。
- STATE 记录要点：active work = G4-R5 修复轮完成待 R6 整改；fix commit =
  `f8fe344`；next transition = 接收 G4-R6 复审报告 → 整改 → 复审闭环。
