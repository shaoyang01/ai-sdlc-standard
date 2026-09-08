# G4-R10 / D-087 复审整改交付报告

> 文档性质：G4 第十轮复审（R10，结论 **FAIL**：唯一阻塞根因 F4 PARTIAL；F1/F2/F3/S1/S2 CLOSED）逐条整改的交付与验收证据。
> 复审报告权威边界：G4-R10 handoff 包 `REPORT.md`（基线 `6b64dad..88a6d71`）。
> 整改基线：`88a6d71`（分支 `feature/c03-e5-autonomous-acceptance`）。本轮变更：**1 个生产代码文件（`runtime.ts`）**（另含本报告）。
> 结论口径：本报告只陈述修复内容与独立验证证据，**不宣称 G4 收口**；关闭判定等待下一轮独立复审。

## 0. 整改范围

R10 复审唯一阻塞根因 F4 [P1]：marker 锚点被**悬空符号链接**占用时，reader 把链接目标的 ENOENT 误判为锚点不存在。本轮按其 §4.4 一次性修复边界实施，修复责任限于 marker 的缺失/占用判别；不触碰 F1/F2/F3/S1/S2 已关闭形态、R9/R10 全部冻结选择。

## 1. F4 残余：链接目标的 ENOENT 被当作锚点不存在（R10 PARTIAL/P1 → 已修复）

**根因**（R10 报告 §4）：`readProductionContainmentMarker` 的 readFileSync 跟随符号链接——marker 路径被悬空 symlink 占用时读取抛 ENOENT，代码仅凭 `error.code === "ENOENT"` 返回 `absent`。但该 ENOENT 只证明**链接目标**未找到；锚点（链接本身）一直存在。后果：①重入门按无标记跳过——COMPLETED 出口假成功、BLOCKED/failed 出口再次派发（复审悬空六格：2/1 次真实新增派发、DB 变化）；②writer 的 absent 分支沿链接 `writeFileSync`，目标父目录存在时把 marker JSON 写进链接目标，绕过 invalid 占用拒绝（三个"目标被写"变体）。

**修复**（`runtime.ts`，即 R10 诊断补丁验证过 15/15 的同一语义）：readFileSync 抛 ENOENT 时，用 `lstatSync`（**永不跟随链接**）复查锚点自身——锚点存在 → `invalid`（已占用、无法验证，fail-closed）；锚点自身也 ENOENT → `absent`；lstat 其他错误 → `invalid`。由此：悬空链接进入 invalid 后，既有 writer 占用拒绝（不覆盖/不移动/不跟随）与 invalid+已有 run 重入阻断同时生效；absent 的成立依据与"锚点确实缺失"一致。修复不改变 marker 形态、控制面边界、释放协议与首调规则。

## 2. 复现验证

**r10-f4（R10 复审探针，19 格）修复前 13 PASS / 6 FAIL → 修复后 19/19 PASS**：

| 悬空占用变体 | 首调 | 连续两次重入 | 派发/DB/占用者 |
| --- | --- | --- | --- |
| 三出口 × 悬空链接（目标父目录不存在） | 完整链路（preflight+终验各一次）后抛 ProductionRunError(PRODUCTION_ISOLATION_VIOLATED) | 均 BLOCKED 同码 | 零派发、零 DB 变化；链接 inode/readlink 不变、目标不创建；journal running/reason=null 如实保留 |
| 三出口 × 悬空链接（目标父目录存在） | 同上——writer 在写入前即拒绝，目标保持缺失 | 同左 | 零派发、零 DB；链接与目标均不变 |
| 普通无效文件/带 owner 目录/指向无效文件的链接（回归） | 抛错/阻断同码 | BLOCKED 零派发 | 占用者不覆盖、不移动 |

**回归矩阵**（R10 §4.5 逐项）：

- 标准九格（三出口 × WIP/base/SQL 写失败）保持；`r9-independent` isolation 十五格全 PASS（occupied 的 `marker_valid` 沿冻结口径跳过，行为判据 first/second/third/zero_redispatch/reentry_zero_db/occupier_unchanged 全绿）；
- r10-f1 27/27（F1 CLOSED 形态保持：合法成员组合、内容对账控制/负例、原始+合成原子性）；r10-carriers 2/2（S2 保持）；r9-verdict 2、r9-mc 1、r9-opaque 1、r9-nonreal 2、r9-lifecycle-replay 2 全 PASS；
- present/absent/readback 语义：合法 marker 原字节不变（幂等）、真实缺失正常发布、writer 写后回读门承重（R10 §5 writer 注入两门对应的语义由回读+新三态共同承担）；
- R8 归档探针（R10 容错重建版）：8 个 exit 0 完整执行，production 容错版 write-failure 三格首调 ProductionRunError、second BLOCKED 同码零派发、inspections=3 全部符合现役形态；
- 入口与恢复：preflight 失败零派发、non-real/non-inspect 无影响、recovery 只读不混读 containment、release(SCOPE_RESET) 对隔离 block 仍 ILLEGAL_TRANSITION。

## 3. 定向变异

| 变异门 | 结果 |
| --- | --- |
| F4-R10 新门：ENOENT 分支删除 lstat 锚点复查（退回 R10 缺陷形态） | r10-f4 19 行中 6 格变红（恰为复审失败格），**killed** |
| M-A（envelope 缺 decisionStatus 默认 CONFIRMED） | envelope 套件 exit 1，**killed** |
| M-C（删除 blockedRetryOk 分支） | fix-round exit 1，**killed** |
| M-E（删除接受版本门） | fix-round exit 1，**killed** |
| M-F（删除 journal 顺序门） | fix-round exit 1，**killed** |

独立副本逐项施加→变红→还原；最终 tracked 文件与候选字节 diff 为空。

## 4. 全量验证

| 验证 | 结果 |
| --- | --- |
| `tsc --noEmit` | 退出 0，无诊断 |
| 159 个测试文件逐文件串行（157 TS + 2 shell） | **159/159 全绿**（首轮串行 156/157 TS 直接全绿，唯一非零为 `loop-codex-implementation-adapter.test.ts`——D05 断言 354/354 全过，但工作区清单检查受整改会话在全量运行期间并发写入本报告文件的干扰，与 R9 复审记录的干扰形态相同；提交后静止工作区单独复跑 **exit 0、354/354、D05_REAL_SOURCE_UNCHANGED=true**，首轮失败日志与复跑记录均保留，不冒称首轮 157/157。shell：bootstrap 557/0、manual-chain 87/0） |
| R10 探针 | r10-f4 19/19、r10-f1 27/27、r10-carriers 2/2 |
| R9 探针 | r9-independent 46/46、r9-verdict 2、r9-mc 1、r9-opaque 1、r9-nonreal 2、r9-lifecycle-replay 2 全 PASS |
| R8 归档（R10 容错版） | 全部 exit 0，write-failure 格行为符合现役形态 |
| Ruby 校验器 ×3 | validate-skill-contracts / validate-compact-prompt-contracts / validate-capability-metadata-chain 全部 exit 0 |
| control-plane validate_state | 只读校验 R10 包 STATE 快照 PASS v2；未更新 STATE |
| 环境 | Node v24 / ABI 137（better-sqlite3 冒烟通过） |

## 5. 边界

- 不使用 SDLC/DocFlow 治理本线；未调用 DocFlow、未更新 Control Plane STATE（只读校验除外）。
- 未修改其他工作线（D091 / codex/d088-governance-corpus 与 governance-corpus worktree 未触碰）；本轮生产代码改动仅 `runtime.ts` 的 marker 读取判别。
- 未扩展 G5/G3/C03-B/WP6；不重写 store、F1 或生产装配模型；不扩充释放协议。
- R8 §7、R8 八项选定方案、R9 §9 冻结面与 R10 §7 冻结面（含 invalid+无 journal run 的首调规则、occupied 口径、planning staged-only 载体等）全部保持冻结，未重开。
- **不宣称 G4 收口**：F4 是否由 PARTIAL 转 CLOSED、G4 是否具备 PASS 条件，等待下一轮独立复审裁决；测试全绿不作为收口解释。
