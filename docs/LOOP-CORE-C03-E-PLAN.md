# LOOP-CORE-C03-E 有界规划：Real Multi-Agent Autonomous Dispatch

> 规划状态：**DRAFT_FOR_CURRENT_USER_REVIEW**
>
> 日期：2026-08-27
>
> 本文件不授权实现、Agent 外部调用、Git 写操作或发布；只把 C05 暴露的 Parent Core 缺口收敛为可审阅实施包。

## 1. 目标

用户向任一已支持入口提交一次需求后，LOOP runtime 接管七节点推进，通过 capability binding 自动调用真实 Kimi、Codex、Hermes CLI，验证输出、持久化执行证据、处理 Re-Gate 与恢复，直到：

- `READY_FOR_MANUAL_GIT_HANDOFF`；
- 必须由用户补充业务事实或作风险/副作用授权；
- 可恢复的 `blocked` / `failed`。

正常路径不得要求用户为了推进流程而手动切换 Agent。人工 Git 提交仍是 Core 边界。

## 2. C05 发现的缺口

1. `runtime.ts` 的生产默认 gateway 仍是 deterministic shadow；它能验证状态机、binding 与 journal 结构，但不会调用真实 CLI。
2. `wms-monitor/20260827-dashboard-page` 的七节点由用户在 Kimi、Codex、Hermes 间手动切换完成；Markdown Activity Log 能证明产物来源声明，不能替代 runtime 的真实 capability execution journal。
3. 活动 `sdlc-solution-gate` references 仍输出已由单轨合同废弃的 `DIRECT_IMPLEMENTATION` / `SPECKIT_PIPELINE_REQUIRED`，本次 Hermes 产物实际携带了该旧语义。

因此，本次真实需求作为“人工七节点链与业务交付”证据有效，但不能作为“LOOP 全自主运行”验收通过证据。

## 3. 实施范围

### E0 — Active Contract Preflight

- 清理现役 `sdlc-solution-gate` references 中的 Direct/Speckit 路径分流，只保留 Gate Result 与 LIGHT/STANDARD/DEEP 深度裁决。
- 扩展 validator，扫描现役 Skill 的 `SKILL.md` 与全部 active references，禁止退役 ID、字段和路由语义重新出现。

### E1 — Production Entry and Run Ownership

- 提供一个正式本地入口，创建或恢复 Requirement run，并由 runtime 持续推进到终态。
- 入口 Agent 只负责接入；run ownership 属于 runtime，不属于任一聊天或 Agent。
- 默认生产入口不得静默回退 deterministic shadow；shadow 仅允许测试或显式 dry-run。

### E2 — Real CLI Adapters

- 为当前已支持的 Kimi、Codex、Hermes 建立受控进程 adapter。
- adapter 输入包含 canonical capability、Skill 指令位置、Requirement/run identity、当前有效上游制品、finding 与写入边界。
- adapter 捕获退出码、stdout/stderr、超时、版本、输出引用与 digest；禁止拼接不受信任 shell source。

### E3 — Output Validation and Automatic Progression

- runtime 在推进前校验产物存在、schema/版本、输入引用、Gate/role firewall、finding closure 与工作区边界。
- 合格输出自动进入下一节点；`NEEDS_REVISION` 自动回流正确最早节点并使受影响下游失效。
- 不合格输出、超时或 Agent 不可用只结束当前 attempt，不伪造节点通过。

### E4 — Durable Recovery and Human Boundary

- journal 至少记录 started/terminal event、binding/adapter/version、attempt、input/output digest、exit/timeout/validation result 与下一步决定。
- 进程中断后可从最后一个已确认事实恢复，不重做已提交节点，不重复副作用。
- 只有业务事实缺失、合同冲突、风险接受、权限/外部副作用授权和最终 Git 处理可以暂停等待用户；“请切换到另一个 Agent”不是合法暂停原因。

### E5 — Autonomous Runtime Acceptance

- 在隔离工作区证明一次入口启动后可自动推进，`manual_agent_switch_count = 0`。
- 以 adapter 级真实 CLI canary + runtime 级负向场景证明各 binding、校验、回流与恢复机制，不用 shadow 冒充真实执行。
- 完成后直接进入下一条真实需求的 C05 验收；Personal-KB 产物投影属于后期 `LOOP-ADVANCED-04`，不阻塞本包。

## 4. 编码前场景矩阵

| 场景 | 输入/故障 | runtime 预期 | 用户是否介入 |
| --- | --- | --- | --- |
| S01 正常链 | 来源完整，全部节点合格 | 自动调用各 binding，连续到 handoff | 否 |
| S02 方案回流 | Codex 返回 `NEEDS_REVISION` + findings | 回流 solution-design，失效下游，再次扫描和裁决 | 否 |
| S03 输入缺失 | 原型/合同缺失且不可从仓库恢复 | 持久化 blocked 与缺失清单 | 是，只补事实 |
| S04 Agent 不可用 | CLI 不存在、超时或非零退出 | attempt failed；按绑定策略重试/替换或可恢复阻塞 | 通常否 |
| S05 输出不合格 | CLI 退出 0，但产物缺字段/引用旧版本 | validation failed，不推进节点 | 否 |
| S06 runtime 中断 | terminal event 前进程退出 | 恢复时识别未完成 attempt，安全重试，不重复已完成节点 | 否 |
| S07 用户裁决 | 来源冲突会改变范围/验收 | 暂停并给出最小裁决问题，回答后继续原 run | 是，作业务决定 |
| S08 Git 边界 | 七节点全部通过 | 只生成 handoff，不执行远程 Git | 是，最终人工处理 |

## 5. 不变量

1. runtime 是唯一流程推进与恢复权威；节点 Skill 和 Agent 不拥有 LOOP 生命周期状态。
2. solution-gate 的 adversarial scan 与 formal verdict 必须由不同 binding 执行。
3. 真实执行证据来自 runtime journal 与产物 digest，不来自执行者在 Markdown 中的自述。
4. shadow 不得出现在生产验收路径；真实 CLI 失败不得降级成 shadow 成功。
5. 不引入 scheduler、daemon、UI、远程控制平面或新 Provider；首版保持单机、单进程、单 Requirement 有界实现。
6. 不使用 `sdlc-docflow-writer`、manifest 或 Gate 方法治理本项目；仅消费冻结 LOOP 合同与标准七节点产物。

## 6. 完成合同

- E0～E4 实现并经独立复审通过；默认生产入口确实使用 real adapter。
- 场景 S01～S08 全部具备自动化或真实运行证据，负向场景证明“不误推进”。
- C05 由下一条真实单仓需求重验，满足零人工 Agent 切换、真实 execution journal、有效 Re-Gate/恢复和人工 Git 边界。
- 任一条件不满足时，C03/C05 不得宣告 COMPLETED，但不得因此重开本次已结束的业务需求。

## 7. 授权边界与顺序

```text
E0 active contract preflight
  -> E1 production entry
  -> E2 real CLI adapters
  -> E3 auto progression and validation
  -> E4 recovery and human boundary
  -> E5 autonomous runtime acceptance
  -> next real C05 acceptance
```

建议将 E0～E4 作为一个实施包、一个独立分支、一次完整复审，避免再次按 Agent 或七节点拆成需要用户逐步切换的工作流。E5 是 C03-E 技术验收，不与实现混在同一授权中；通过后直接执行真实业务 C05。

## Revision Record

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 0.1.0 | 2026-08-27 | Draft for Current User review | 根据 C05 只读复审建立 E0～E5、场景矩阵、完成合同与授权边界。 |
