# Decision-078：入口触发层接线设计裁决——设计认可 + D1 接线缺口修复授权 + D3-deterministic 立项

## 状态

Accepted（2026-09-01，Current User 裁决组合：确认入口触发层接线设计 + 范围选择
「设计 + D3 立项 + D1 授权」；D2 生产门 real 通道不授权、继续挂账）

## 背景

- Current User 2026-09-01 明确理想产品流程：跟 agent 聊需求 → 归一化 → 生成
  文档（人确认）→ LOOP 启动 → 无人切换 Agent 推进到人工 Git 交接。该形态即
  LOOP Core 合同 §3 Entry Contract 与路线图 `manual_agent_switch_count = 0`
  目标的既有设计，缺口在触发层未实现。
- 现状三部件盘点（设计文档带行号证据）：`sdlc-requirement-intake` skill 有
  能力定义、与 runtime 零连接；生产 CLI `scripts/loop-run.ts` 已存在（E1-T3，
  closed argv/schema/输出）；**触发层不存在**（归一化产物→请求文件无生成者、
  「已确认」无机器标记、agent 无触发协议）。
- 两处既有闸门挡在 real 路径：**D1** = `REAL_GATEWAY_NO_INPUT` 接线缺口
  （Decision-077 记录，STATE blocker `C03_LOOP_GW_SMOKE_WIRING_GAP`，只差授权）；
  **D2** = 生产门 real 通道缺失（`ProductionRunDeps` 无 `realGatewayDeps` 装配
  字段且 `runtime.ts:991-996` 硬拒 real，E5-L2 canary 走 `run()` 直驱从未过
  生产门）。
- 设计草案 `docs/reports/loop-entry-trigger-wiring-design.md` 已按本仓
  wiring-design 形态成文，待裁决。

## 问题

1. 触发层三件事（已确认标记、CLI 参数面、agent 触发协议）需要定型为可实施的
   设计权威，否则入口形态继续悬空；
2. D1 是 real 链第一断点（`run()` 一启动即死在首节点），口径 Decision-077 已
   写死，缺的只是 Current User 授权；
3. real 路径多闸门（D1/D2），授权必须明确切分范围，防止未授权闸门被夹带解开。

## 决策

1. **认可入口触发层接线设计**：`docs/reports/loop-entry-trigger-wiring-design.md`
   状态草案 → Accepted，作为 D3 的设计权威（intake manifest 封闭 schema、
   `loop-run --from-intake/--prepare-only` 增量、agent 触发六步协议、
   fail-closed 规则以其 §3–§5 为准）。
2. **D1 授权（runtime 接线缺口修复波，台账 W-GW-FIX）**：修复
   `REAL_GATEWAY_NO_INPUT`——方向二选一（`run()` 派发把 requirement 文本带给
   real gateway，或 `extractInputText` 支持 `inputArtifactRef` 解析），实施时
   按证据定，不夹带；最小回归测试把 run()+real 端到端补为常规验收面（至少到达
   CLI spawn、不再死在 staging 前，Decision-077 §决策.3）；完成后
   **W-GW-SMOKE 冒烟重跑**（`scripts/loop-gw-smoke-real.ts`）出真实结果并回填
   台账 §3；重跑 PASS → ② 主测提请 Current User 放行，逐级停等不变。
3. **D3 立项（入口触发层，deterministic 段）**：按设计文档 §6 切分——
   manifest schema + 封闭校验（纯函数 + 负向测试）→ `loop-run.ts`
   `--from-intake`/`--prepare-only`（expectedBaseSha 只读解析 + 冻结请求落盘
   审计）→ agent 触发协议文档化 + deterministic 端到端演练一次。**real 接入
   不在本波**。
4. **D2 不授权、继续挂账**：生产门 real 通道（`realGatewayDeps` 装配 + 解除
   `PRODUCTION_REAL_NOT_AUTHORIZED` 硬拒）待 D1 修复落账后，随 D3 real 接入
   另行单独裁决。
5. **边界**：E5-L3 冻结不变；deterministic 默认不变；零业务仓写入、零远程 Git
   副作用；不请求 C05；②③ 主测/批量维持 PENDING 直至冒烟重跑 PASS。

## 原因

- 先治理后施工：设计认可与授权范围必须先于任何代码落档（无台账 = 波次不存在）；
- D1 与 D3-deterministic 无依赖关系，可并行；D1 解锁冒烟重跑与验收梯子，D3
  铺入口产品形态地基，两者合成一次裁决成本最低且边界清晰；
- D2 涉及生产门语义变更（授权条件化硬拒），与 D1 修复解耦审计更干净，留待
  real 接入波一并裁。

## 影响

- CP STATE：`active_work` 转 W-GW-FIX；`live_authorizations` 增 GW 接线修复与
  入口触发 D3-deterministic 两条（Decision-078 为 scope_ref），E5 残留授权条目
  一并清理；`open_blocker` 更新为「修复已授权、待落账」；`next_transition` 指
  向修复实施与冒烟重跑；
- runtime 仓（本仓）新增两条实施事实链：W-GW-FIX（runtime.ts/
  real-capability-gateway.ts）与 D3-deterministic（loop-run.ts 旗标 closed 面
  内增量 + 新校验模块）；单分支节奏沿袭，实施任务集开工时按例出任务集/审计
  文档；
- 入口触发层的 agent 触发协议落地后，理想流程「聊完确认即启动」首次成为可
  演练路径（deterministic 形态）；
- spruce 仓零改动状态不变。

## 实现状态

- 产品仓：设计文档（Accepted 翻转）+ 本 Decision + 决策索引行 + 台账 §2/§3
  W-GW-FIX 行，2026-09-01 落档（本 commit）；
- Exchange run / PKB 派生归档 / CP STATE 更新：按 Decision-076 §决策.7 常设
  授权路径执行，回执回填台账 §5；
- D1 实施：待开工；D3-deterministic：待开工；D2：未授权。

## 依据

- `docs/reports/loop-entry-trigger-wiring-design.md`（本裁决的设计权威）
- Decision-077（缺口记录与修复口径）、Decision-076（治理落档路径）
- 代码证据：`runtime.ts:737-740` / `execution/real-capability-gateway.ts:68-77`
  / `runtime.ts:964-996`（`ProductionRunDeps` + 硬拒）/ `scripts/loop-run.ts`
  / `core/loop-production-entry.ts:24-61`
- CP `projects/ai-sdlc/STATE.yaml`（blocker `C03_LOOP_GW_SMOKE_WIRING_GAP`）
