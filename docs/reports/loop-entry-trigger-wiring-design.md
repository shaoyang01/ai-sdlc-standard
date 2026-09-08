# LOOP 入口触发层接线设计（Entry Trigger Wiring Design）

> 状态：**Accepted（2026-09-01，Decision-078 裁决）**——设计认可，作为 D3 的
> 设计权威；授权范围 = D1 接线缺口修复（W-GW-FIX）+ D3-deterministic 立项；
> **D2（生产门 real 通道）不授权、继续挂账**，real 接入不在 D3 本波。
> 日期：2026-09-01｜分支：`feature/c03-e5-autonomous-acceptance`
> 依据：LOOP Core 合同 §3 Entry Contract、路线图 LOOP-CORE-00/C01 入口目标、
> Decision-077（run()+real 接线缺口）、既有接线设计
> `c03-e-e1e4-wiring-design.md` §4/§5。本文所有"现状"断言带文件:行号证据。

## 1. 理想流程与现状差距

用户理想操作流程（2026-09-01 Current User 口述，本文的成立前提）：

```text
跟 agent 聊需求 → 归一化 → 生成文档（人确认）→ LOOP 流程启动 → 无人切换 Agent 推进到人工 Git 交接
```

这与合同 §3 Entry Contract（"入口应以可在已支持 Agent 中使用的 Skill 或等价
命令提供，接收当前对话/飞书文档/Markdown 等来源"）与路线图
`manual_agent_switch_count = 0` 目标一致——**产品形态不是新问题，缺口在触发层
未实现**。现状三部件：

| 部件 | 现状 | 证据 |
| --- | --- | --- |
| 聊+归一化 | 能力定义已在（`sdlc-requirement-intake` skill：归一化 + 冲突/阻塞规则 + 变更分类，输出 `library/{requirement_id}/00-需求资料/`），但与 runtime 零代码连接 | skill SKILL.md Core Rules |
| LOOP 本体 | 生产 CLI 已存在：`scripts/loop-run.ts`（closed argv + closed-schema 请求文件 + closed 输出集），经 `runProduction()` 进七节点链 | `loop-run.ts:1-15`、`core/loop-production-entry.ts:24-61` |
| **触发层** | **不存在**：归一化产物→请求文件无生成者；"已确认"无机器标记；agent 无触发协议 | 本文 §3–§5 即为其设计 |

另有两处**既有闸门**挡在 real 路径上（非本文范围，列为依赖）：

- D1：`REAL_GATEWAY_NO_INPUT` 接线缺口——`run()` 派发 input 仅
  `{inputArtifactRef}`（`runtime.ts:737-740`），real gateway 只认自由文本键
  （`real-capability-gateway.ts:68-77`）。修复待 Current User 授权
  （Decision-077，STATE blocker `C03_LOOP_GW_SMOKE_WIRING_GAP`）。
- D2：生产门 real 通道缺失——`run()` 有 `realGatewayDeps` 注入（`runtime.ts:121`），
  但 `runProduction` 的 `ProductionRunDeps` **无此字段**且门口硬拒
  `capabilitySource:"real"`（`runtime.ts:991-996`，`PRODUCTION_REAL_NOT_AUTHORIZED`）。
  E5-L2 canary 走的是 `run()` 直驱，生产门从未驱动过 real。

## 2. 设计目标与边界

- 目标：把"归一化文档经人确认"到"LOOP run 启动"之间的三件事定型——**已确认
  标记、CLI 参数面增量、agent 触发协议**——使触发可由机器执行、可审计、fail-closed。
- 交接对象遵循合同原则 1（产物优先于聊天记忆）：传给 LOOP 的是
  `00-需求资料/` 定稿文档 + Requirement ID，**不是聊天上下文**。
- 不改变：七节点链语义、`loop-run.ts` 既有 closed 面（`--request-file/--resume/
  --capability-source` 原样保留）、人工 Git 边界、deterministic 默认。
- 本文不授权：任何代码改动、real 激活（D1/D2 另行授权）、业务仓远程 Git 副作用。

## 3. 核心决策一：已确认标记（intake manifest）

归一化节点目录内新增**封闭 schema 清单文件**，作为触发唯一依据：

```text
library/{requirement_id}/00-需求资料/intake.manifest.json
schema: "loop-intake-manifest:v1"
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `schema` | 常量 | `"loop-intake-manifest:v1"`，未知值拒绝 |
| `status` | 枚举 | `draft \| confirmed`；**触发仅认 `confirmed`，其余一律拒绝** |
| `requirementId` | 文本 | 与目录名一致，不一致拒绝 |
| `changeClass` | 枚举 | `new \| supplement \| change \| rework \| feedback`（对应 skill 变更分类） |
| `sourceType` | 文本 | conversation / lark-doc / markdown / … |
| `sourceFiles` | abs 路径数组 | 归一化定稿文档（至少一份，总量上限沿用 256KiB，`loop-run.ts:127`） |
| `repositoryPath` | abs 路径 | 目标业务仓（≠ controlRoot，沿用 `loop-production-entry.ts:168` 校验） |
| `controlRoot` | abs 路径 | run journal/产物根 |
| `confirmedAt` / `confirmedBy` | 时间/人 | 人确认的审计字段 |

规则：

1. 聊天归一化期间 manifest `status=draft`（或不存在）；**确认是人闸门**——
   Current User 明示确认后，agent 才允许把 status 置 `confirmed` 并填审计字段。
2. 解析 fail-closed：未知字段、schema 不符、status≠confirmed、sourceFiles 空、
   路径非绝对、repositoryPath===controlRoot → 拒绝启动，不猜测、不降级。
3. manifest 是触发层唯一输入；agent 口头转述、聊天摘要不构成启动依据。

## 4. 核心决策二：CLI 参数面增量（`loop-run.ts`）

既有封闭旗标不动，新增两个旗标（与 `--request-file` 互斥，三者同现拒绝）：

```text
tsx scripts/loop-run.ts --from-intake <00-需求资料 目录或 manifest abs 路径>
    [--prepare-only] [--resume <runId>] [--capability-source deterministic|real]
```

`--from-intake` 内部流程（复用既有部件，不新增权限面）：

1. 读并封闭校验 manifest（§3 规则）；
2. 生成候选 `loop-production-entry:v1` 请求；其中 `expectedBaseSha` 由 loop-run
   **用既有只读 git runner 解析**（`repositoryPath` HEAD `rev-parse`，
   `loop-run.ts:180-194` 的 runner 已具备该能力与沙箱约束）——chat agent 不手工
   提供 SHA，避免 40 位哈希手写出错；
3. 将冻结请求落盘为审计产物：`<controlRoot>/loop-runs/<requirementId>/
   entry-<timestamp>.json`（产物优先，后续 resume/审计可追溯当时输入）；
4. `--prepare-only` 到此为止：打印 closed 集合 `LOOP_RUN_PREPARED {request_path,
   requirement_id, expected_base_sha, source_files_count}`，退出 0；
   否则按既有主流程继续（runProduction preflight 含 base-drift/dirty 复查，
   prepare 与 run 之间的漂移由既有 `PRODUCTION_BASE_DRIFT` 挡住）。

输出契约不变：仍只有 `LOOP_RUN_RESULT` closed 集合（`loop-run.ts:202-220`），
不透出 Agent stdout/环境。错误沿用 `LOOP_RUN_ERROR <code>` 分类退出。

## 5. 核心决策三：agent 触发协议

入口 agent（如 kimi 会话，载 `sdlc-requirement-intake` skill）在归一化会话中的
触发协议共六步：

1. **聊+归一化**：按既有 skill 规则产出 `00-需求资料/` 文档，写 manifest
   `status=draft`；冲突/阻塞情形按 skill 既有规则停住，不进入后续步骤。
2. **人确认**：Current User 明示确认 → agent 将 manifest 置 `confirmed` +
   审计字段。这是唯一的人闸门，agent 不得代行确认、不得跳过。
3. **触发**：agent 执行 `loop-run --from-intake <dir> [--capability-source …]`
   （首次接线验收建议 `--prepare-only` 先给 Current User 看冻结请求再真跑）。
4. **汇报**：原样转述 closed 输出（`LOOP_RUN_RESULT` 行 + journal 路径）；
   BLOCKED 时报 `blocking_reason_code` + `next_execution_point` 后**停等**，
   不自主重试循环；续跑仅在 Current User 指示下用 `--resume`。
5. **边界**：agent 不直接改目标仓代码（实现由 LOOP implementation 节点在自己的
   attempt worktree 内完成）、不 commit/push/PR、不解析或转述 Agent 原始 stdout。
6. **能力来源纪律**：deterministic 与 real 的选择只来自显式旗标；deterministic
   下触发链可端到端联调（shadow 节点），real 待 D1/D2 解冻后按授权启用。

## 6. 依赖与关键路径

```text
D1 REAL_GATEWAY_NO_INPUT 修复（Decision-077，待授权）
  → D2 生产门 real 通道（ProductionRunDeps 增 realGatewayDeps 装配 + 解除
    PRODUCTION_REAL_NOT_AUTHORIZED 硬拒，改为显式授权条件；待授权）
    → D3 本触发层（manifest + --from-intake + 协议，须立项授权）
```

- D3 的 **deterministic 部分**不依赖 D1/D2，可独立实现与验收（shadow 全链）。
- D3 的 **real 部分**端到端可用必须等 D1（首个节点取不到文本即死）与 D2
  （生产门无装配通道且硬拒）先后解开；冒烟重跑（W-GW-SMOKE）仍是 real 链的
  第一验收面，本触发层接入其后。
- 建议立项切分：D3 拆 manifest/校验（纯函数+负向测试）→ `--from-intake`
  （含 prepare-only + 审计落盘）→ agent 协议文档化 + 一次 deterministic 端到端
  演练 → real 接入（在 D1/D2 授权之后）。

## 7. 不激活保证（授权边界）

- 本文为设计草案：合入前须 Current User 裁决；裁决前不写任何实现代码。
- deterministic 默认不变；`--capability-source real` 在 D1/D2 未授权前不可达
  （生产门继续硬拒即 fail-closed）。
- 触发层不引入新的 Git 写路径、不新增 spawn 权限面（expectedBaseSha 解析复用
  loop-run 既有只读 runner 与沙箱 env）。

## 8. 开放问题（实施时按证据闭合，不擅自决定）

1. manifest 落点是否需要在目标项目侧与 `library/` 既有文档治理合同对齐
   （本仓 `library/` 为空，标准库自身不落 library——合同 §4 已有此边界）。
2. `--from-intake` 接受目录还是仅 manifest 文件路径（倾向两者都收，目录时定位
   `intake.manifest.json`；以实现期解析复杂度定）。
3. feedback 类变更（开启新 generation）经本入口启动时，resume 语义与既有
   Requirement 的接续形态——等 D1 修复波与冒烟重跑落地后，随首个真实案例定。
4. watcher 形态（"文档落盘即启动"）本轮明确不做；若未来要做，其输入契约即
   §3 manifest，不另设第二标记机制。
