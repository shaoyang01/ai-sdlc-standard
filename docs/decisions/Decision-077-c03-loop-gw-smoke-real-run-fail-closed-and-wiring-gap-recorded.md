# Decision-077：C03-LOOP-GW 冒烟真实 run 结果记录——run()+real 端到端盲区与 REAL_GATEWAY_NO_INPUT 接线缺口

## 状态

Accepted（2026-09-01，Current User 裁决：冒烟真实 run 结果按台账口径回填 +「项目
治理的流程走一遍，这个问题值得记一下」——本 Decision 即该记录）

## 背景

- Decision-076 立项 C03-LOOP-GW，冒烟级（三项 spruce 缺陷）授权后，Current User
  于 2026-08-31 深夜改定冒烟口径：**冒烟 = 测试 LOOP runtime 本体**，三项缺陷是
  喂给 LOOP 的需求输入，由 LOOP 自主解决，会话 agent 不得手改目标仓代码；真实
  CLI run 经 Current User 显式放行。
- 执行方式：本会话产出自包含冒烟 brief，由 Current User 交 kimi 会话执行（kimi
  负责装配入口脚本、执行、验收、报告，不亲手改 Java 代码）。
- kimi 会话新写 `scripts/loop-gw-smoke-real.ts`（按旧脚本 `codex-runtime-real-
  smoke.ts` 的 Q1 STALE 头注重写为三 agent 形态，旧脚本未动），于本机完成两轮
  run 并交付结构化报告。

## 问题

1. 冒烟真实 run 在首个节点 fail-closed：`requirement-intake/primary : kimi :
   started → failed (EXECUTOR_EXCEPTION, 4ms, 无进程证据)`，六节点未到达，退出
   码 2，三项缺陷修复未产出；
2. 根因必须实证定位到代码行，且与既往验收（E5-L2 canary PASS）的矛盾必须解释
   ——为何 canary 通过而端到端首节点即死；
3. 缺口修复属 runtime 仓改动，超出冒烟波授权，须先落档再立项。

## 决策

1. **记录本次冒烟为合法 FAIL-CLOSED 证据**：fail-closed 刹车性能通过（无假
   PASS、退出码干净、spruce 零改动、无 prompt-input 残留），主链推进被阻断；
   全部证据与根因回填台账 `docs/reports/c03-loop-gateway-acceptance-audit.md`
   §3 W-GW-SMOKE（commit `0b03780`）。
2. **确认根因为 runtime 仓真实接线缺口**：`run()` 派发时 input 仅含
   `{ inputArtifactRef }`（runtime.ts:737-740），而
   `RealCapabilityGateway.extractInputText` 只认 inputText/text/prompt/requirement
   自由文本键（real-capability-gateway.ts:68-77）→ 预进程阶段抛
   `REAL_GATEWAY_NO_INPUT`。kimi 直击探针实证，非推测。
3. **确认验收盲区结论**：E5-L2 canary 走手工构造 entry 请求（自带文本），从未
   覆盖 `run()` + real 生产端到端路径；HEAD `9d84f30` 上该路径系首次真实驱动即
   暴露缺口。本结论不追溯改判 E5 各波 PASS（各波验收口径在其授权范围内成立），
   但 run()+real 端到端必须作为后续修复立项的回归验收面。
4. **缺口修复另行立项**：修复方向（`run()` 派发把 requirement 文本带给 real
   gateway，或 extractInputText 支持 inputArtifactRef 解析）+ 最小回归测试
   （run()+real 至少到达 CLI spawn、不再在 staging 前死掉），修复完成后重跑冒
   烟。**本 Decision 不授权任何代码改动。**
5. **销项**：brief 中「120s/次」超时张力属已退役 codexRealDispatchConfig 路径；
   Q1 adapter 超时已由 E5-T1 重定标（非实现类 45min / 实现类 60min，runner 上限
   3600000ms），该遗留项关闭。
6. **冒烟脚本处置**：`scripts/loop-gw-smoke-real.ts` 留待修复立项时一并入库评
   估（当前保持未跟踪），避免半成品进主干。

## 原因

- 无台账 = 波次不存在；fail-closed 证据与根因是后续修复立项的唯一权威输入，
  必须先于任何修复动作落档（台账先行铁律）；
- 冒烟的价值正在于此：第一次端到端真驱动就抓到 canary 形态覆盖不到的生产接线
  缺口，且刹车干净——这本身就是 runtime 诚实性设计的一次通过性证据；
- 明确「不追溯改判 E5」避免用新口径否定旧结论造成治理混乱；盲区以「新增回归
  验收面」方式向前修复，不向后翻账。

## 影响

- C03-LOOP-GW 冒烟级停驻于 FAIL-CLOSED，②主测/③批量不推进，直至缺口修复并
  重跑冒烟（每级停等纪律不变）；
- runtime 仓获得一条新增待修复缺陷（接线缺口）与新增回归验收面（run()+real
  端到端），立项须 Current User 单独授权；
- spruce 仓保持零改动（`cc06c605`，工作区干净）；E5-L3 冻结状态不变；
- kimi 会话的冒烟报告为本次落档的事实来源，其证据（trace/journal 路径/runId）
  已收录台账 §3。

## 实现状态

- 产品仓：台账 §3 回填（`0b03780`）+ 本 Decision + 决策索引行（本 commit）；
- Exchange run / PKB 派生归档 / CP STATE 更新：按 Current User 2026-09-01「项
  目治理流程走一遍」指示执行，回执回填台账 §5；
- 缺口修复：未立项，待 Current User 授权。

## 依据

- Decision-076（C03-LOOP-GW 材料与三级节奏）
- `docs/reports/c03-loop-gateway-acceptance-audit.md` §3 W-GW-SMOKE（commit
  `0b03780`）
- kimi 会话冒烟报告（2026-09-01 00:00 交付：runId `run-REQ-LOOP-GW-mthexwux-
  1788191319709`，退出码 2）
- Decision-075（E5 分层授权与 L2 canary 口径）；E5-T1 超时重定标记录
