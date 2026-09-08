# LOOP 入口触发 agent 协议（Entry Trigger Agent Protocol）

> 状态：D3-deterministic 交付件（Decision-078 立项，设计权威 =
> `docs/reports/loop-entry-trigger-wiring-design.md` §5）。本文把「跟 agent 聊
> 需求 → 归一化 → 人确认 → LOOP 启动」落成可执行的操作协议，并记录 2026-09-01
> deterministic 端到端演练结果。
> 日期：2026-09-01｜分支：`feature/c03-e5-autonomous-acceptance`

## 1. 触发合同（一段话版）

归一化定稿落在 `library/{requirement_id}/00-需求资料/`，与一份
`intake.manifest.json`（`loop-intake-manifest:v1` 封闭 schema）。**只有
`status:"confirmed"` 的 manifest 能启动 LOOP**；确认是人闸门（Current User 明示
确认后 agent 才置位并填 `confirmedAt/confirmedBy`）。触发命令只认 manifest，
不认聊天记忆、口头转述或聊天摘要。

## 2. CLI 面（loop-run.ts，closed 契约内增量）

```bash
# 只冻结、不运行：产出冻结请求 + 封闭回执（给人/给 Current User 看的检查点）
tsx scripts/loop-run.ts --from-intake <00-需求资料 目录或 manifest 文件> --prepare-only
# → stdout: LOOP_RUN_PREPARED {request_path, requirement_id, expected_base_sha, source_files_count}

# 冻结并运行（--prepare-only 省略时）
tsx scripts/loop-run.ts --from-intake <...> [--capability-source deterministic|real] [--resume <runId>]
# → stdout: LOOP_RUN_RESULT {run_id, requirement_id, final_status, chain_status, blocking_reason_code,
#            next_execution_point, trace[], workspace_root, journal_path, completed_at, manual_handoff_status}

# 既有 --request-file 路径原样保留；--request-file 与 --from-intake 互斥。
```

`--from-intake` 的语义：manifest 封闭校验 → status 必须为 `confirmed`
（`INTAKE_NOT_CONFIRMED`）→ 用 CLI 自己的只读 git runner 解析
`repositoryPath` HEAD 为 `expectedBaseSha`（chat agent 永不手填 SHA）→ 冻结请求
落盘 `<controlRoot>/loop-runs/<requirementId>/entry-<ts>.json`（审计产物）→ 走
与 `--request-file` 完全相同的 runProduction 路径。任一步失败 fail-closed
（`LOOP_RUN_ERROR <code>`，未知归 `UNEXPECTED`，退出码 1/2）。

## 3. agent 六步协议

1. **聊 + 归一化**：按 `sdlc-requirement-intake` skill 规则产出
   `00-需求资料/` 定稿文档，并写 `intake.manifest.json`，`status:"draft"`；
   冲突/阻塞情形按 skill 既有规则停住，不进入后续步骤。
2. **人确认**：Current User 明示确认 → agent 才把 manifest 置
   `status:"confirmed"` 并填 `confirmedAt/confirmedBy`。agent 不得代行确认、
   不得跳过；draft manifest 会被 CLI 以 `INTAKE_NOT_CONFIRMED` 拒绝。
3. **触发（建议两段式）**：先 `--prepare-only`，把 `LOOP_RUN_PREPARED` 回执
   （含冻结请求路径与解析出的 base SHA）给 Current User 过目；确认后再去掉
   `--prepare-only` 真跑。
4. **汇报 + 决策卡（硬义务）**：原样转述 closed 输出（`LOOP_RUN_RESULT` 行 +
   journal 路径）。`chain_status:"BLOCKED"` 或退出码非 0 时，agent **必须当场
   把停点渲染成可回答的决策卡**——停点事实（blocking_reason_code /
   next_execution_point / `human_action_required` artifact 内容，如 gate 裁决
   PASS_WITH_RISK + findings 摘要）+ 合法选项（放行所需的风险接受 / 返工回流
   / 其他合法 reason code）——并在触发会话内交给 Current User；**不得只丢一
   行状态码等用户自己查日志**。无人值守的后台 run 必须配置通知钩子
   （IM/webhook），BLOCKED 即推送决策卡。续跑仅经 Current User 对决策卡的明
   示选择、经 `--resume <runId>`（释放入口挂账：CLI 尚无 `--release` 面）执
   行；agent 不自主重试循环。
5. **边界**：agent 不直接改目标仓代码（实现由 LOOP 的 implementation 节点在
   attempt worktree 内完成）、不 commit/push/PR、不解析或转述 Agent 原始
   stdout；`manual_git_handoff` 保留人工决策。
6. **能力来源纪律**：deterministic 为默认；`--capability-source real` 仅在
   D1 修复落账且 D2 生产门授权后才可用（当前 real 仍被
   `PRODUCTION_REAL_NOT_AUTHORIZED` 硬拒）。

## 4. deterministic 端到端演练记录（2026-09-01）

fixture：临时目标仓（bare origin `git@github.com:local/drill-md5.git` 形态 +
`refs/remotes/origin/main` 手工建）+ 归一化文档 + confirmed manifest。

- `--prepare-only`（真 CLI）：`LOOP_RUN_PREPARED {"request_path":
  ".../control/loop-runs/20260901-drill-md5/entry-mtibvpn3.json",
  "requirement_id":"20260901-drill-md5","expected_base_sha":"6b246b9f…",
  "source_files_count":1}` —— base SHA 由 CLI 解析，请求冻结落盘。
- 全链运行（shadow）：`final_status:"success"`，`chain_status:"COMPLETED"`，
  trace 七节点 16 事件全部 started→succeeded，Q1 槽位映射正确
  （intake/design/planning/knowledge-sync=kimi，scan/implementation=codex，
  verdict/code-review=hermes）；`manual_handoff_status:"BLOCKED"`（人工 Git
  交接等待，符合合同「LOOP 不产生业务仓远程 Git 副作用」）。
- 测试面：manifest 解析矩阵 18 checks + CLI e2e 19 checks（含真实临时 git 仓
  prepare-only、draft 拒绝、SHA 解析失败 fail-closed）全绿；tsc clean。

### 演练中发现的生产门缺口（记录挂账，不在本波修）

`runProduction` 的只读 preflight 走 `LoopGitWorkspaceManager.inspect`，而
inspect 只认**已存在的 exact-ok 任务工作树**（全新运行必然
`WORKSPACE_NOT_FOUND`）；`prepare`（创建工作树）在 loop-run 路径上无人调用
（loop-run W3 边界明确「never creates a worktree」，E1 生产测试全部注入
stub 未暴露）。本演练驱动在 preflight 处先 `prepare` 再 `inspect`（即生产门
将来补齐该接缝的精确形态）。**处置**：属 D2/生产门接缝（E1-E4 接线设计 §11
开放问题「attemptWorkspace 与 D03 workspace manager 的接缝形态」的现实化），
随 D2 real 授权一并裁决；演练外的任何代码均未改动。
