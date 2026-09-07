# G4-R8 复审整改 · 跨机交接（2026-09-07 晚间）

## 本线信息
- 工作目录：`/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard`（公司机）；家里恢复后路径可不同，分支为准。
- 分支：`feature/c03-e5-autonomous-acceptance`
- R8 复审基线（复审覆盖的 HEAD）：`0e141c0362d0b5fc1ab2923a81d13080c5ae1dde`
- 交接前实际 HEAD：`0e141c0362d0b5fc1ab2923a81d13080c5ae1dde`（未变化，工作区干净；工作区如出现来源不明改动，不得擅自提交/覆盖）

## 当前结论
**Round 8 复审：FAIL。** B1/B5/B6/B8 **CLOSED**；B2/B4/B7 **PARTIAL**；B3 **NOT_CLOSED**。
合并为四个根因 F1–F4（全部 P1）。整改方此前的"8/8 闭环"自评不成立。
完整报告（原样归档，未改写）：[report/round8-review.md](./report/round8-review.md)。

## 四个剩余根因（修复必读）

### F1 登记身份仍以可复用字段代替真实成员身份；三条接受/重放路径不一致 [P1]
- 报告：report/round8-review.md §5 F1。代码：`core/loop-run-store.ts` 约 :2505（自动裁决 producer 选择/接受循环，`.find` 选旧 producer）、:3330（成员谓词）、:2228（精确重放归属过滤）。
- 变体：①真 ledger HIGH 经登记边界改 MEDIUM 仍被接受（severity 未绑真实 blob）；②真 ledger 一行 + 直插第二条合法借用行，自动 PWR 全收（自动分支未做 count/成员校验，与手动 accept 不一致）；③两轮不同 design、同内容 ledger（scan seq 6/12），PWR 接受错轮（旧 producer）；④同内容跨轮/借用在场使精确重放误拒（过滤只有 capability+blob）；⑤opaque ledger 回退下借 createdAt/revision 仍可被手动 accept。
- 修复边界：在现役模型内固化 terminal 登记归属、真实 ledger 成员内容与顺序；producer 按"该次 verdict 实际消费的 scan 执行事实"选取；自动裁决/手动 accept/exact replay 三入口共用同一目标集合与验证；原行生命周期变迁不改归属；保留 v4 只读与 opaque count 容忍（容忍≠借用授权）；不建第二事实系统。
- 复现（从仓内 probes/ 目录，`node --import tsx`）：`r8-registration-probes.ts`、`r8-count-drift-probe.ts`、`r8-b2-probes.ts`、`r8-directive-probe.ts`；日志 logs/registration-probes.log、count-drift-probe.log、b2-probes.log、round-probes.log、borrow-probe.log、directive-probe.log。
- 回归矩阵：见报告 §5 F1 末段（同/跨节点 HIGH 借用、HIGH→MEDIUM、CRITICAL→HIGH、同数内容替换、0/1/N 原始成员、两轮 PWR/重放、borrowed 在场 replay no-op、resolved/superseded replay、opaque 正负例、三 directive 冲突零写、v4 三消费端）。

### F2 批内失效的 `staledInTransaction` 每条 finding 重建，批量重叠仍整批回滚 [P1]（R7-B3 NOT_CLOSED）
- 报告：§5 F2。代码：`core/loop-run-store.ts` 约 :2444——集合声明在**逐 draft 循环内部**，第二条 finding 时集合又为空，`revisions` 仍是事务初始 ACTIVE 快照 → 二次 CAS 零行 → 误判外部漂移回滚。
- 复现：`r8-registration-probes.ts`；2 条同类/嵌套/4 条重叠 × BLOCKED/SUCCEEDED 均 `FINDING_REGISTRATION_INVALID`，finding=0、edges=0（logs/registration-probes.log、invariant-probes.log）。
- 修复边界：同步状态生命周期提升到整个注册事务/整个 draft 批次（或统一工作快照）；同一 revision 物理 STALE 只更一次，每 finding 保留完整 scope 边；真实外部 CAS 漂移/scope/hash 缺失保持 fail-closed；不得删 guard 或吞零更新。
- 回归矩阵：0/1/2/N × BLOCKED/SUCCEEDED；重叠/嵌套/无重叠；scope count/digest 逐 finding；中途失败原子回滚；外部漂移仍拒。

### F3 A4 只加在 runtime 且扩大为全部 OPEN：direct entry 绕过 + KS 自身返工自锁 [P1]
- 报告：§5 F3。代码：`runtime.ts` 约 :877（A4：`openFindings.length > 0` 一刀切）；对照 `core/loop-capability-entry.ts` 约 :408（准入段无 A4）。
- 两条复现：①knowledge-sync 自身输出 BLOCKED+HIGH/KNOWLEDGE → 恢复目标即 KS，但 `openFindings>0` 把自身目标误判为下游阻断，`ADMISSION_DENIED`，adapter 0 调用（合法返工证据尚未产生）；②code-review finding HIGH/IMPLEMENTATION 返工未 resolve 时 run 正确停于 A4，但同一状态经合法 `LoopCapabilityEntry.execute` 直接派发 KS 并 succeeded（entry 无 A4）。复现：`r8-admission-probes.ts`、`r8-direct-entry-probe.ts`（logs/admission-probes.log 末尾早期 DIRECT_A4 报 INVALID_INPUT 是夹具多带 attempt 字段所致，不作证据；以 direct-entry-probe 为准）。
- 修复边界：统一 A4 公开执行前置——按节点顺序与 finding 阻断范围筛选 OPEN（阻断的是 earliest 的**下游**，earliest 本身可返工）；覆盖 run 与 direct entry/claim 派发边界；closed+MISSING 补尾段保持可达；保留发现节点逐条 resolve 责任（不得以 PASS/批量 close 代替）。
- 回归矩阵：七节点准入真值 + 六个可表达类别实际返工（现役 `LOOP_FINDING_CATEGORIES` 六类，无独立 solution-gate 类，不得伪造第七类）；KNOWLEDGE 自身目标；OPEN/RESOLVED/ACCEPTED 对照；未 resolve 时 run 与 direct entry 均零 KS 派发；closed+MISSING→尾段→ELIGIBLE；A1 upstream/ESCALATED/BLOCKED_UNKNOWN 仍拒；PLANNING 修复不回归。

### F4 隔离 block 持久化失败被吞掉，后续同 run 可恢复成功 [P1]
- 报告：§5 F4。代码：`runtime.ts` 约 :1393（终验/持久化段）、:1418（catch 无条件吞错，未验证失败原因或回读事实）。
- 复现：临时 SQLite 装 `BEFORE INSERT ON loop_events` trigger，`NEW.kind='run_blocked'` 时 ABORT；终验 WIP A→B。三出口（COMPLETED/BLOCKED/failed）首返均 `PRODUCTION_ISOLATION_VIOLATED`，但持久读回 state=running、reason=null、run_blocked=0；同 run 重入 COMPLETED 出口直接 **success/COMPLETED**（0 新派发），其余再派发。复现：`r8-production-probes.ts`（logs/production-matrix.log 中 `drift=write-failure` 行）；无写故障六格正例均正常持久阻断。
- 修复边界：不得在未确认持久事实时把写入异常当"已阻断"——须验证失败原因并回读；隔离终验与可恢复状态绑定本次 run，失败/重入保持未处置隔离的 fail-closed；明确传播持久化错误；仅去掉 catch 不够，须验证重入不复用未终验完成的结果。沿用现役 store/工作区边界，不建第二恢复系统。隔离 block 的释放已核对：`releaseRunRegateBlock(SCOPE_RESET)` 对其返回 ILLEGAL_TRANSITION（不能自动释放是正确语义，扩充人工释放归 C03-B/后续授权，不算缺陷）。
- 回归矩阵：三出口 × WIP/base × 正常保存/保存失败；每格查首返、只读恢复、同 run 重入、派发数、持久事实；preflight 失败零派发；每次进入执行恰好 preflight+终验各一次。

## 建议项（不阻塞，可顺手）
- S1：`realpathSync(identity.repositoryPath)` 在 repositoryPath 不存在时裸 ENOENT，建议统一包装为 `PRODUCTION_ENTRY_INVALID_INPUT`（实测零派发，无隔离失效）。
- S2：六场景 s4 的 `captured` 单槽被 implementation 覆盖 task-planning，断言不能独立承重 planning——建议按 capability/attempt 分别保存断言。

## 已完成验证（R8 复审独立复证，与整改方声称一致）
- 精确 HEAD `0e141c0`：tsc 0 错；**159/159** 测试文件逐文件串行全绿；六场景矩阵 **44/0**；fix-round **27/0**；lifecycle **351/0**；artifact-revision **237/0**；envelope **44/0**；WP4 **122** / WP5 **177** / WP6 **34** 断言全过；Ruby 校验器 ×3 + control-plane validate_state ok；定向变异 M-A/M-C/M-E/M-F 全部捕获。
- **没有远端 CI 声明（HEAD 未推送至复审时点）；没有真实 Agent CLI / 业务 Git / 发布执行**；全部探针在 /tmp 隔离夹具执行，主仓 tracked 未修改。
- 本机绝对路径映射：`/private/tmp/g4-r8-evidence/` → 本目录 `report/`+`logs/`；`/private/tmp/g4-r8-probes/tests/` → 本目录 `probes/`（探针从含 node_modules 的仓根运行：`node --import tsx docs/handoffs/2026-09-07-g4-r8/probes/<name>.ts`，或复制回临时目录；脚本自建自清理临时库，不改 tracked 代码）。R7 证据同构映射：`/private/tmp/g4-r7-evidence/` 与 `/private/tmp/g4-r7-probes/tests/` 未随仓归档，如需 R7 原始材料须回公司机取。

## 晚上恢复步骤
1. `git fetch origin && git status -sb` 核对分支与 HEAD（应为 `0e141c0` 或其之上的交接提交）；如 HEAD 已前移，先 diff 确认新增改动来源。
2. 读本目录 `report/round8-review.md`（§4 逐项判定、§5 F1–F4、§2 失效模式表）。
3. 按 F1 → F2 → F3 → F4 顺序整改（F2 最小可先做：集合声明提升到批次级）；每项修复后跑对应回归矩阵 + 相关测试文件；全部闭环后再申请下一轮复审。
4. 边界：不使用 SDLC/DocFlow 治理本线；不修改其他工作线；不扩展到 G5/G3/C03-B/WP6 建设等范围外事项；不宣称 G4 收口。
