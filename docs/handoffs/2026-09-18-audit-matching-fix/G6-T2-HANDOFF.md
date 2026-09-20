# G6-T2 交接（2026-09-20 晚，家用机会话收工）

> 状态：**M1 进行中——6/12 场景端到端绿**。一切在远端：分支 `feat/g6-t2-parity-harness` @ `86d72c7`（已推）。
> Control Plane：G6/D-090-04 已登记 ACTIVE（CP PR #88 合并 `7222d6a`，route_state `C03_E_G6_D09004_OFFLINE_PARITY_ACCEPTANCE_ACTIVE`，live_authorizations `G6_OFFLINE_PARITY_ACCEPTANCE`）。product_commit 指向 `e34a4a6`（G6 工作未上主线，均在 feature 分支）。

## 今天定案的三件事（细节见分支提交与规格修订）

1. **规格已按裁决 B 修订**（提交 `30a6edd`，改 `docs/reports/decision-090-g6-parity-acceptance-spec.md`）：九维两层比较——行为层 6 维走 runProduction 生产入口全链，产物层 3 维走 T5 store 级同事实驱动 + 投影器接管。原因：两面 digest 覆盖不同对象（手动=raw 内容哈希；真实网关=输出 envelope 哈希）。
2. **runtime 形态问题按事实定案**：`core/loop-manifest-projector.ts:1087` 原文「the projector never recreates (creation belongs to intake)」——投影器设计上不创建 manifest。**每个场景的 runtime 形态 = 接管**（manual init 创建 → LOOP 启动 runtime 重新推导逐行判定一致），这是手动先行时代的生产主形态（= Current User 描述的真实流程），非测试便利。manifest 三维映射：new=全新需求首次接管 / reconcile=中途态接管 / corrupt=损坏被 STOP。
3. **M1 战果**：S-CORE 首轮 12 场景中 **PASS 与 PASS_WITH_RISK × LIGHT/STANDARD/DEEP 共 6 个端到端绿**——手动 publisher 驱动 → 同事实 journal 重放 → 投影器真接管判定通过 → 归一化（T5 白名单）深比较零分歧。产物层 parity 路径已证。

## 明天接着打：两个 verdict 终态（各差 1-2 条 store 校验规则）

`tests/g6-parity/runtime-face.ts` 的 solution-gate 双角色事件里，verdict 终态机三形状已 pin 两种，剩两种（错误信息即规则）：

- **FAIL**（现在 failed 终态）：报 `only a succeeded formal_verdict may carry decisionStatus` → failed verdict 不得携带 decisionStatus/decisionDepth（保留 gateResult=FAIL + nextStepEligibility=INELIGIBLE + output refs）。
- **BLOCKED_UNKNOWN**（现在 blocked 终态）：报 `blocked capability execution requires Gate and next-step eligibility` → blocked 事件仍需 gateResult 与 nextStepEligibility=BLOCKED（无 decision 字段、errorCode=BLOCKED_UNKNOWN、保留 output refs）。

修完这两条即 12/12。已捕获的终态机规则全景（代码注释里）：succeeded=全套 decision 字段；failed=无 decision 字段；blocked=无 decision 字段但有 gate/eligibility/output。

## 之后的路径

12/12 → **M2**：其余 40 场景（S-CORE 升档/Re-Gate 24 + S-INIT 8 + S-MANIFEST 2 + S-CRASH 6）+ 行为层 full-chain 驱动器（runProduction + 脚本化网关，`tests/g6-parity/runtime-face.ts` 内 M2 标记处）→ 全量回归（tsc/bootstrap 820/manual-chain 106/fixture）→ PR + R1 自证 → 独立复审 prompt（模板 `docs/handoffs/2026-09-09-g5-t1/review-request.md`）。

## 环境提醒

- ruby 须 PATH 前置 `/opt/homebrew/opt/ruby@3.3/bin`（公司机系统 2.6.10 会触发 canonical gate 假阳）；node v24。
- 测试跑法：`node --import tsx tests/g6-parity-matrix.test.ts`（勿用 bun）。
