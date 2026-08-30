# C03-E E5 自主运行验收任务集与验收审计台账

> 文档性质：E5 任务集台账（正式验收证据面载体）。授权依据 Decision-075
> （2026-08-30，Current User「可以开始搞E5了」，分层推进）；规划依据
> `LOOP-CORE-C03-E-PLAN.md` §6 E5。E1–E4 台账
> （`c03-e-e1e4-task-set-and-gate-audit.md`）不重开，本文件独立记账。

## 1. 稳定任务集

| ID | 层 | 动作 | 目标面 | 依赖 | 状态 | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| E5-L1 | 第 1 层 | 自动负向矩阵映射：五类机制要求 + §7 S1–S18 + 六 crash window 盘点，产出映射报告与缺口清单 | `docs/reports/c03-e5-l1-negative-matrix-mapping.md` | Decision-075 | ✅ **MAPPING DONE WITH GAPS（2026-08-30）**：五类机制（fail-closed/恢复/Re-Gate/并发/Git 边界）全部有已复审自动化证据；S1–S18 中 13 项 ✅、S17/S18 纪律/预检级已闭、2 项中等级缺口（G-S05 重试预算缺失、G-S09 截断证据链断裂）+ 2 项低级口径项（G-S08 码名漂移、G-WINDOW 三窗口 dispatch 级泛化覆盖）+ 承接 G-P1（C-T1 P1 六合法码字面钉） | 映射报告 §1–§4；关键零命中结论经双次独立检索 |
| E5-G1 | 缺口修复 | **W1（2026-08-30 立项并完成，Current User「修吧」授权）**：① G-S05 受控重试预算——`ExecutionPointRecoveryState.controlledFailuresSinceSuccess`（上次成功后的受控业务失败数，ATTEMPT_INTERRUPTED 不计入）+ `deriveDispatchCommand` 预算门（≥2 即 ILLEGAL_TRANSITION 拒派，零 journal 副作用）；② G-S09(b) process 证据映射——`CapabilityProcessEvidence`/`CapabilityProcessEvidenceError`/`ExecutionResult.processEvidence`（types.ts）+ adapter 计算 `invocationDigest`（sha256 归一化调用形状，无动态内容）并产出成功/失败证据 + real gateway 转译带证据失败 + tracing gateway 两路终态映射（shadow/确定性路径保持全 null）；③ G-P1 六合法码字面量等值钉（W6b2 测试全序比较）。验证：新测试 `loop-s05-retry-budget` 12 断言 + `loop-process-evidence-mapping` 27 断言 + W6b2 84 断言全绿；tsc 干净；node@24 全套件 **1767 passed / 0 failed**（148 文件；2 个文件级失败=artifact-store/delivery-checkpoint-store 并发用例，**stash 对照实证基线代码失败特征完全相同**——本会话环境漂移，非本波回归） | `core/loop-recovery.ts` / `execution/gateway.ts` / `execution/types.ts` / `execution/real-capability-adapter.ts` / `execution/real-capability-gateway.ts` + 2 个新测试文件 | E5-L1 | ✅ **DONE（2026-08-30）** | ✅ 独立复审 **APPROVE**（2026-08-30，基线 `8d18193`，五项全 PASS，0 阻塞；见 §5-①） |
| E5-G2 | 口径修订 | **随 W1 同批完成（同授权）**：规划 §7 S08 码名对齐实现（CLEANUP_BLOCKED）+ E4 验收补三窗口 dispatch 级泛化覆盖口径注记；**映射报告 S09 更正**（(a) runner 截断测试实际存在 `tests/loop-posix-process-runner.test.ts:127/346`、(c) 泄密扫描已实现且有测试 `tests/real-capability-adapter.test.ts:201`——L1 首轮检索 `\|` 交替语法缺陷误报零命中，唯一真缺口为 (b)，已在报告 §2/§4/§6 显式更正留痕） | `LOOP-CORE-C03-E-PLAN.md` §7/E4 + `c03-e5-l1-negative-matrix-mapping.md` §2/§4/§6 | E5-L1 | ✅ **DONE（2026-08-30）** | ✅ 随 W1 同批复审 **APPROVE**（§5-① 第 4 项 PASS） |
| E5-L2 | 第 2 层 | 真实 Adapter canary：Kimi/Codex/Hermes 经 production gateway 在隔离 fixture 执行最小 canonical capability，记录 executable/profile/version、started/terminal、output/validation/promotion digest | production gateway + real adapter + 三 provider CLI | E5-G1 闭合 | ✅ **W3 修复后重跑全 PASS（2026-08-30，见 §4.2 验收结果 ④⑤；首轮 FAIL 见 §5-③，修复过程见 §4.2 实施要点）；独立复审 PASS（2026-08-31，零阻塞，见 §5-④）** | `scripts/e5l2-real-adapter-canary.ts` + §5-③ journal 证据 |
| E5-L3 | 第 3 层 | 真实自主 fixture run：一次入口启动、完整八 execution point、`manual_agent_switch_count=0`、≥1 次受控 Re-Gate/恢复、只出人工 Git handoff | 同上 | E5-L2 PASS | ⏸️ **冻结：触发前须 Current User 再次确认。触发前另须评估（复审 §5-④ 非阻塞建议）：binding `timeoutMs=120_000`（`core/agent-capability-bindings.ts:63`）小于 kimi 处理 37KB 真实需求的实际时延，不评估则 L3 会遇 EXECUTOR_TIMEOUT 假失败** | 自主 run 证据面（待产） |
| E5-C | 收口 | E5 复审 + Current User 验收裁决 → Decision → CP → Exchange/PKB 归档；`live_authorizations` 的 `E5_AUTONOMOUS_ACCEPTANCE` 整条移出 | — | E5-L3 PASS | ⏸️ 未开工 | CP/Exchange/PKB 回执 |

## 2. 边界（Decision-075 全程有效）

- 全程零业务仓写入、零远程 Git 副作用、零 merge/push/发布；attempt 隔离 staging。
- real 路径保持休眠（B-7 tripwire + PATH A FROZEN + `runProduction` 硬拒 real），
  直至 E5-L2/E5-L3 各自触发前确认完成。
- 任一层 FAIL 只能回流 E2/E3 修复；不得用 shadow 结果、执行者自述或旧证据
  降级放行（规划 S16/S18）。
- E5 PASS 前不请求真实业务 C05。

## 3. 缺口登记（引自映射报告 §4）

| ID | 内容 | 严重度 | 状态 |
| --- | --- | --- | --- |
| G-S05 | 受控重试预算缺失（S05「至多一次」无实现无测试；`lastAttempt+1` 无上限，`core/loop-capability-entry.ts:436`） | 中 | ✅ W1-① 修复（journal 层计数 + deriveDispatchCommand 预算门，12 断言） |
| G-S09 | 截断证据链断裂（runner truncation 零测试覆盖；real 链路未映射 `processTruncated`；泄密扫描未实现） | 中 | **更正**：(a)(c) 为误报（runner 截断测试与 adapter 泄密扫描实际存在），唯一真缺口 = (b) process 证据未映射，✅ W1-② 修复（invocationDigest + 两路终态映射，27 断言） |
| G-S08 | 码名漂移（S08 `WORKSPACE_BOUNDARY_VIOLATION` vs 实现 `CLEANUP_BLOCKED`，语义等价） | 低 | ✅ W1（E5-G2 同批，规划对齐） |
| G-WINDOW | spawn/result/validation 三 crash window 无逐点专用注入（dispatch 级泛化覆盖，恢复语义无损） | 低 | ✅ W1（E5-G2 同批，口径注记） |
| G-P1 | C-T1 P1：六合法码 5 个无字面钉 | 低 | ✅ W1-③（六码全序字面钉） |
| G-STORE-1 | `loop-artifact-store` concurrent put 段失败（node@24 下稳定复现；stash 对照证实 W3 改动前基线同挂——**既有并发缺陷**，非本波回归；node@22 时代未暴露） | 中 | ⚖️ **改判（2026-08-30 深夜诊断，实锤）：非本仓缺陷**——WorkBuddy 会话向所有 node 进程注入 `NODE_OPTIONS=--require node-language-shim`（fs 走中央 broker），并发 link 的 EEXIST 竞态被 broker 包装为 `CODEBUDDY_BROKER_DENY`（errno 丢失）→ store `:362` 按设计 fail-closed。实证：①并发 link 探针 3/3 轮 loser 均得 `CODEBUDDY_BROKER_DENY`（msg 内含 EEXIST、code 非 EEXIST）；②`env -u NODE_OPTIONS` 下本文件 **266 passed / 0 failed**（多轮稳定）；③store 数据不变式（单 blob/temp 清理/idempotent）全程正确。**本仓零代码改动**；回归须以 `env -u NODE_OPTIONS` 运行；broker errno 丢失属平台缺陷，另行上报 | 
| G-STORE-2 | `loop-delivery-checkpoint-store` 双 worker CAS 段失败（同上：基线复现实证既有缺陷，与 G-STORE-1 同族） | 中 | ⚖️ **同上改判**：`env -u NODE_OPTIONS` 下 **268 passed / 0 failed**（多轮稳定），同根因（fs broker 干扰），非本仓缺陷，零代码改动 |

## 4. Current User 裁决记录

| 日期 | 裁决 |
| --- | --- |
| 2026-08-30 | 「可以开始搞E5了」→ Decision-075 授权成立，分层推进（L1 立即；L2/L3 真实 CLI 触发前再确认） |
| 2026-08-30 | 「修吧」→ E5-G1 缺口修复 + E5-G2 口径修订全部立项为 W1 同批（含 G-P1 并入确认；L2 仍冻结待触发前确认） |
| 2026-08-30 | 「A 这种完全就没必要了……开发阶段没有上生产的紧迫性，直接选最优方案……如果你觉得C是最优解，那就应该直接搞C」→ **取消临时方案 A/B**；G-E5L2-1（prompt transport）由「参数放宽容忍」升级为**架构级改造（方案 C：workspace 文件指针）**，与 G-E5L2-2/3 合并为 W3 一波 |

## 4.1 W2 立项（2026-08-30）——❌ 已由 W3 取代，本节留档不再执行

> 原 W2 三项（G-E5L2-1/2/3，含方案 A「argv 末位 + 上调 `MAX_ARG_B`」与方案 B「探测 `-` 惯用法」）已被上述裁决推翻：A 被判定为无必要的临时方案（手动切换 agent 已能跑通，无上生产紧迫性），B 属 A 的探路步骤一并取消。**G-E5L2-1 移至 W3 以方案 C 实施；G-E5L2-2/3 并入 W3 同批。** 本波无代码改动留痕（截止 `ae63358`，工作树干净）。

## 4.2 W3 立项（E2 prompt transport 架构改造——方案 C：workspace 文件指针；✅ 已完成，2026-08-30）

> 状态更新：本节立项经 Current User 授权（「完全可以直接选最优方案直接搞…直接搞C」+ D1/D2 裁决）实施完毕，验收五项全 PASS（见下）。

| 项 | 内容 | 来源证据 |
| --- | --- | --- |
| **G-E5L2-1★** | **prompt transport 架构改造（方案 C）**：prompt = **固定指令壳**（数百字节静态模板）+ **workspace 内文件指针**（相对路径）；大内容（需求文档、上游节点产物）落 workspace 文件，由目标 CLI 自带的文件读取能力自读。argv 只承载壳与已守卫的短路径，**不承载大内容** → 天然规避 runner 单参数 4096B 上限，且解决链式产物滚雪球（实测真实需求 37,266B；需求摘要→技术方案→实现记录逐节点传递会持续增长，任何 argv 上限都撑不住） | §5-③ + 真实样本 `/Users/eric/meicai/projects/wms-monitor/library/20260724-task-center/00-需求资料/20260724-task-center_需求摘要.md`（37,266B） |
| 不变式 | ① 壳由 **canonical prompt builder** 生成，外部自由文本不得直接进入 argv；② 指针路径必须在 workspace 目录内 + charset 白名单（禁 `../`、shell 元字符、绝对路径逃逸）；③ 壳超长 fail-closed（明确错误码，不静默截断）；④ **`MAX_ARG_B`（内核安全策略 4096B）不上调**；⑤ 无 final message / 非预期输出仍 fail-closed | 内核安全属性（W1 已验收） |
| 待验证前提 | 三家 CLI 在「指令壳 + 文件指针」模式下能正确读文件并完成任务。**实施内第一步**用零副作用探针验证（临时 fixture，退出即删）；若某家不支持 → 该家 fail-closed 挂起并如实回报，**不做降级 hack**（不再回到 A/B） | — |
| G-E5L2-2 | **codex JSONL final-message 形状漂移**（并入本波）：`real-capability-adapter.ts` `readFinalMessage` 不认 codex 0.147.0 嵌套形状 `{"type":"item.completed","item":{"type":"agent_message","text":…}}`，正常输出被误判 MALFORMED_OUTPUT。修复 = 增补该形状，保持 fail-closed（非 JSON 行仍拒、无 final message 仍拒） | §5-③ codex FAIL |
| G-E5L2-3 | **pinned 版本事实过期**（并入本波）：profile 钉 0.38.0 / codex-cli 0.150.1 / hermes 0.20.5，本机实际 0.39.1 / codex-cli 0.147.0 / hermes 0.20.6。重定基线，integrity check 同步；E2-P 历史记录保留原观察值不重写 | §5-②/§5-③ |
| 开放决策 D1 | **证据口径（触及 W1 已验收契约，须 Current User 拍板）**：`invocationDigest` 目前仅覆盖六字段调用形状、不含动态内容。文件指针引入动态相对路径 → 提案：**路径归一化后计入 invocationDigest**（属调用形状，由 builder 生成、非自由输入，注入风险可控）；**文件内容另算 content digest**，若需记入 journal 则涉及 schema 扩展——**不在本波夹带，停波回报** | W1 G-S09(b) |
| 开放决策 D2 | **合并 vs 分批**：推荐合并为一波（两次 canary 真实调用成本 + 两轮复审开销；且 codex 解析 bug 不修，C 架构无法被 canary 证明） | — |

- **验收标准**：① tsc 干净；② 新测试全绿（壳构造、路径守卫含 `../`/元字符反例、超长 fail-closed、digest 稳定性、JSONL 四种形状 + fail-closed 反例）；③ node@24 全套件 0 failed（环境漂移项按 W1 口径处理）；④ 三家 canary 重跑全 PASS；⑤ **规模验证**：用真实需求文件（37,266B）跑一次端到端，证明 37KB 级输入不再受传输上限约束（只读，零写入）。
- **验收结果（2026-08-30，全 PASS）**：
  - ① tsc 干净（`tsc --noEmit` exit 0）。
  - ② 新测试全绿：`agent-cli-profile` 65/0（含「integrity holds regardless of CLI version drift」防回归钉）、`capability-prompt-builder` 49/0（新增 stdin 三选一互斥/digest·bytes 校验/壳不含内容 16 项）、`real-capability-adapter` 45/0（stdin fail-closed + 内容不入 argv）、`real-capability-gateway` 24/0（成功路径 processEvidence 透传）、`e5-w3-file-pointer-transport` 50/0（hermes argv 精确顺序钉）。
  - ③ node@24 全套件 **1767 passed / 0 failed / 149 文件**（5m11s）——须以 `env -u NODE_OPTIONS` 运行（见 §3 G-STORE 改判：WorkBuddy fs shim 在并发 link EEXIST 时丢弃 errno，非本仓缺陷）。
  - ④ 三家 canary 全 PASS（同环境同日）：kimi REAL requirement-intake/primary exit 0 / 57.1s；hermes REAL solution-gate/formal_verdict exit 0 / 24.8s；codex REAL solution-gate/adversarial_scan exit 0 / 16.8s（**stdin 传输 + `--sandbox read-only` 生产档首次通过**，官方嵌套宿主方案实测成立）；三者 processEvidence（invocationDigest/exitCode/durationMs/truncated）全部落账，observed = pinned（0.39.1 / 0.20.6 / 0.151.0）。
  - ⑤ 规模验证 37,266B 真实需求端到端 PASS（落盘文件与源逐字节一致；wms-monitor 零写入，需求文件 mtime 不变）。**口径补注（复审 §5-④）**：端到端依赖 kimi CLI 段稳定性（复跑两次 FAIL，签名与已登记的 kimi canary flaky 开放项一致，fail-closed 正确）；**传输层主张独立成立**（37,266B 落盘 sha256 逐字一致）。
- **实施要点**（相对本节原案的演进，均经 Current User 裁决或官方确认）：① codex 传输由 workspace-file 改为 **stdin**（官方确认嵌套 Seatbelt fail-closed BY DESIGN 无开关可绕；`--ephemeral` + `-c features.shell_tool=false` + read-only 保留防线；staged 文件仍落盘作证据锚点，1MiB stdin 上限记录为能力边界）；② `promptTransport` 更名 **`contentTransport`**（"workspace-file" | "stdin"，修正「描述 shell 位置」的语义错位——正是首轮 kimi/hermes FAIL 根源）；③ 版本漂移降级为证据（删除 pinned-vs-observed 硬 fail，CLI 例行升级不再阻断流程；版本基线更新 0.151.0）；④ canary resolver 探活（`which -a` + 逐候选 `--version`，nvm 下坏 codex 不再产生假 FAIL）；⑤ hermes argv 顺序修复（`-z/--oneshot` 为带值参数，shell 紧随 staticArgs）。提交链：`3646c68` → `7d24039`（8 文件）→ 台账更新。
- **边界**：仅动 `execution/agent-cli-profile.ts`、`execution/real-capability-adapter.ts`、新增 prompt builder（execution/ 下）与新测试；**不动** `core/loop-posix-process-runner.ts` 的 `MAX_ARG_B`、**不动** journal schema（如需动则停波回报）；零业务仓写入；canary 真实调用前在会话内预告。

#### 前提验证结果（2026-08-30，三轮零副作用探针；fixture 临时、退出即删）

三家各以「短指令壳 + 文件指针」真实调用，要求读出文件内的随机标记值：

| CLI | 相对路径指针 | 绝对路径指针 | 结论 |
| --- | --- | --- | --- |
| kimi 0.39.1 | **PASS**（14.3s，标记命中） | 未测（相对路径已通） | 文件指针模式可用；stdout 前 1363B 为本机 `UserPromptSubmit` hook 噪声（ponytail 技能文本），标记在其后 —— 产品路径靠 E3 sentinel envelope 解析，噪声在 envelope 外被忽略，**不影响正确性**（仅记录在案） |
| hermes 0.20.6 | **FAIL**（"当前目录及整个仓库都没有该文件"） | **PASS**（12.8s，干净返回标记值） | 不按进程 cwd 解析相对路径；`--in DIR` 与 `--no-restore-cwd` 均无效（它 restore 到自身配置的工作目录 `/Users/eric/hermes-pkb-readonly-…`）。**必须传绝对路径** |
| codex 0.147.0 | **FAIL**（`--sandbox read-only`） | **PASS**（`--sandbox danger-full-access`，20.4s） | 失败原因经隔离验证为**执行环境**而非 CLI：手工直调 `/usr/bin/sandbox-exec` 同样 `Operation not permitted`（exit 71），即本会话进程本身处于 seatbelt 内、无法嵌套沙箱。danger-full-access 下 codex 正确读文件并返回标记值 → **C 架构对 codex 成立** |

- **幻觉反例（本轮意外收获，强化 fail-closed 必要性）**：codex 在文件不可读时并未报错，而是从 prompt 里的路径字符串中"猜"出答案 `Y97o1W`——那正是 fixture 目录名 `e5l3c-r3-Y97o1W` 的片段。即：若适配器不以结构化证据 fail-closed，一次"看起来成功"的调用实际是编造。这与 W1 G-S09(b) 的设计前提一致。
- **证据缺口**：codex 在 `--sandbox read-only` 档位下的文件指针路径**本环境无法验证**（seatbelt 不可用）。逻辑上 read-only 允许读、禁写，生产环境应无碍，但**未实证**。
- **由此产生两个超出本波台账范围的决策点（见下）**，实施暂停待 Current User 裁决。

| 项 | 内容 | 来源证据 |
| --- | --- | --- |
| G-E5L2-1 | **prompt transport 缺陷（kimi/hermes）**：`agent-cli-profile.ts` 将 kimi/hermes 的 promptTransport 钉为 stdin，但真实 CLI 要求 prompt 作 argv 参数（kimi `-p <prompt>`、hermes `-z <prompt>`；直接探针实证）。待定方案：A. argv 末位传输（`"argv-final"`，prompt 为唯一动态末位参数；受 runner 内核单参数 4096B 上限约束——真实生产 prompt 可超限，须评估是否上调 `MAX_ARG_B`，属内核策略变更）；B. 探测 `-` 惯用法（argv 传 `-`、prompt 走 stdin；首轮探针无有效输出，结论未定） | §5-③ kimi/hermes FAIL |
| G-E5L2-2 | **codex JSONL final-message 形状漂移**：`real-capability-adapter.ts` `readFinalMessage` 不认 codex 0.147.0 的嵌套形状 `{"type":"item.completed","item":{"type":"agent_message","text":…}}`，正常输出被误判 MALFORMED_OUTPUT。修复 = 增补该形状（保持 fail-closed：非 JSON 行仍拒、无 final message 仍拒） | §5-③ codex FAIL |
| G-E5L2-3 | **pinned 版本事实过期**：profile 钉 0.38.0 / codex-cli 0.150.1 / hermes 0.20.5，本机实际 0.39.1 / codex-cli 0.147.0 / hermes 0.20.6。修复 = 重定基线（integrity check 同步调整；E2-P 历史记录保留原观察值不重写） | §5-②/§5-③ |
| 回归保护 | `extractCodexFinalText` 形状增补不破坏旧形状（新测试钉四种形状 + fail-closed 反例）；transport 改动以 scripted runner 测试钉「argv-final 不发 stdin / stdin 不发 prompt argv」+ invocationDigest 仍不含动态内容 | W2 验收 |

- **验收标准**：tsc 干净；新测试全绿；node@24 全套件 0 failed（环境漂移项按 W1 口径处理）；三家 canary 重跑（真实调用，成本同首轮）全 PASS 或给出新的非 E2 根因。
- **边界**：仅动 `agent-cli-profile.ts` / `real-capability-adapter.ts`（及其完整性自检）/ 新测试；若方案 A 需上调 runner `MAX_ARG_B` 属内核策略变更，须在本节内单独标注后再动；零业务仓写入；canary 重跑前不需要再次授权门（本波授权即覆盖），但执行前会在会话内预告。

## 5. 独立复审记录

### ① W1 复审（2026-08-30，外部 agent，只读）

- **结论：APPROVE**（五项全 PASS，0 阻塞）。复审基线 `8d1819390b3c9fd08fd9a87c052612c65cd442fe`（= origin tip），提交链 `ca0de30 → 51e69dd → 8d18193` 核验一致，工作树干净。
- 分项：① G-S05 预算 PASS（计数 `core/loop-recovery.ts:497-503`、门 `:959-968`，claim 前拒派零 journal 副作用，12 断言实跑全绿）；② G-S09(b) 证据链 PASS（digest 仅覆盖六字段调用形状，四路失败+成功终态全带证据，shadow/确定性全 null，started 强制全 null，27 断言全绿）；③ G-P1 字面钉 PASS（**变异验证实证承重**：worktree 改一码拼写 T1 变红，84 passed）；④ 文档口径 PASS（三处误报更正与代码事实一致）；⑤ 台账真实性 PASS（复审方自跑全套件 **1767 passed / 0 failed / 148 文件 / exit 0**，数字与台账吻合；台账声称的 2 个文件级环境失败本轮未复现，与「环境漂移」结论方向一致）。
- **两条非阻塞备注**（不夹带本批，挂后续波次或文档点明）：
  1. S05 预算按**执行点**计数而非规划原文「同 binding 最多一次」——方向更严（fail-closed），可接受，建议后续文档点明此语义差；
  2. 映射报告引用泄密扫描行号过期（`:347` → 实际 `:365`），实质正确。
- 承接确认：上一轮 W6b2 复审建议项 P1（六码无字面钉）在本批闭环，且经变异测试证明钉子承重。

### ② E5-L2 预触发复查（2026-08-30，Current User 授权触发 L2 后）

- 程序：`scripts/e2p-provider-reachability.sh`（重跑）+ Hermes/Codex 单独补跑（同 argv 口径，隔离临时 fixture，退出即删）。
- **Kimi：PASS**（版本漂移 0.38.0 → 0.39.1；6s，ping 命中，凭据可用）。
- **Hermes：PASS**（模型漂移 deepseek-v4-flash → deepseek-v4-pro；5s，ping 命中，usage 报告正常）。
- **Codex：BLOCKED（网络层，非鉴权非版本）**——WebSocket 重连 5/5 超时、HTTPS 降级超时、`chatgpt.com/backend-api/ps/mcp` 传输通道全部连不通；两次独立探针（20min 无超时循环 + 120s 有界重试 exit 137）同特征，稳定事实非瞬时抖动。版本显示 0.147.0（E2-P 记录 0.150.1，漂移存疑但不影响本次定性——请求在传输层即超时）。
- **影响**：三 provider 缺一，E5-L2（Kimi/Codex/Hermes 全经 production gateway）无法开工；按规划「不通过时 unavailable，不猜测修复」，等 Current User 修复本机网络/通道后重新复查。脚本缺陷记录：e2p 探针无 per-provider 超时保护（本次实证 codex 可无限循环）。
- **复测（同日 15:22，Current User 确认网络已修复后）**：**Codex PASS**——exit 0、15s、ping 命中（`E2P-PING-OK`，turn.completed 带正常 usage）、stderr 无传输层错误。结论：前轮 BLOCKED 定性为瞬时网络故障，非鉴权/版本问题。**三 CLI 全绿，E5-L2 预触发复查完成**。

### ③ E5-L2 真实 canary 首轮执行（2026-08-30，Current User 二次确认后）——**FAIL（3/3），回流 E2 修复**

- 程序：`scripts/e5l2-real-adapter-canary.ts`（本波新增，生产路径 canary harness）。三家各一次隔离 fixture run：八点链前置点走 deterministic 网关搭链（脚手架），目标点走 **RealCapabilityGateway → RealCapabilityAdapter → LoopPosixProcessRunner → 真实 CLI**。closed summary 只含 digest/事件 id/exit/duration，无原始 CLI 输出；journal 证据保留于 fixture（`/tmp/e5l2-canary-*-{kimi,codex,hermes}-*/journal.db`，临时性）。
- **kimi → requirement-intake/primary：FAIL**。真实 CLI exit 1（1.2s，stderr 55B）。根因：profile 规定 prompt 走 stdin，但 kimi 0.39.1 `-p/--prompt` **要求 prompt 作为 argv 参数**，不支持 stdin（直接探针实证：`error: option '-p, --prompt <prompt>' argument missing`）。
- **codex → solution-gate/adversarial_scan：FAIL**。真实 CLI exit 0、31.5s、108KB JSONL 输出正常结束，但 adapter 判 `REAL_ADAPTER_MALFORMED_OUTPUT`（codex jsonl has no final message）。根因：adapter `readFinalMessage` 只认 `content[]`/`last_message`/`final`/`text` 四种形状，**codex 0.147.0 实际 final message 为嵌套形状 `{"type":"item.completed","item":{"type":"agent_message","text":…}}`**——适配器解析形状与真实 CLI 版本漂移。
- **hermes → solution-gate/formal_verdict：FAIL**。真实 CLI exit 2（602ms）。根因同 kimi：hermes `-z PROMPT` **要求 prompt 作为 argv 参数**（直接探针实证 usage 报错），stdin-only 传输不可用。
- **正面验证（本波真实价值）**：三家 FAIL 全部 **fail-closed 落账**——journal 终态事件正确记录 `EXECUTOR_EXCEPTION` + process 证据（invocationDigest/exitCode/durationMs/truncated），E5-W1 的 G-S09(b) 证据链在真实故障路径上工作正常；deterministic 脚手架 + real 目标点的混合链调度、八点链前置校验、input 三元组钉定全部按预期拦截与放行。
- **修复归属（回流 E2，须新波次授权）**：① `agent-cli-profile.ts` prompt transport 语义（stdin → argv 末位参数；须重审「argv 无动态内容」安全属性的替代方案：prompt 作为唯一动态末位参数 + 长度上限 + 来源限定 canonical prompt builder）；② `real-capability-adapter.ts` `readFinalMessage` 增补 codex 嵌套 JSONL 形状（`item.completed`/`agent_message`/`text`）；③ 顺带更新 profile pinned 版本事实（kimi 0.39.1、codex-cli 0.147.0、hermes 0.20.6，与 E2-P 历史记录分离保存）。
- harness 缺陷（已当场修复）：FAIL 后 kimi 分支曾重复输出 summary 且退出码错误；hermes verdict 请求曾误用 solution-design 三元组（应为 scan 产物）。

### ④ W3/W4 复审（2026-08-31，外部 agent，只读）——**PASS（零阻塞）**

- **结论：PASS，E5 实施轮可进入 Current User 收口裁决。**复审基线 `7de9546`（= origin tip，工作树干净），5 个提交（`3a83d6e..7de9546`）逐笔核对相符，Node v24.18.0。
- 分项：**Fix-1 版本降级 CLOSED ×3**（版本采集保留入证据链；双表 0.151.0 一致无旧断言；变异实证——pinned 改 9.9.9 后运行期 integrity 门确实消失、唯一红的是两表一致性钉，钉有效）；**Fix-2 codex argv CLOSED ×4**（staticArgs 与官方建议逐字一致、本机 `--help` 实测旗标全存在；exec 恒 never-approval + read-only + shell_tool=false 等效满足；三处断言同步；1MiB 超限有 `REAL_ADAPTER_PROMPT_TOO_LARGE` + runner INVALID_INPUT 双保险非静默截断）；**Fix-3 resolver 探活 CLOSED ×3 且对抗实测**（PATH 前置坏假 codex 遮蔽真身时跳坏选真 PASS；仅坏候选/无候选显式 exit 1 未降级跳过）；**W4 改判验证通过**（主证据亲自复跑：`env -u NODE_OPTIONS` 下 266/0、268/0；「零缺陷零改动」与 store `:362` fail-closed 设计自洽；复审方如实声明其 shell 无 shim 注入、对照面无法复现，但结果方向与历史取证预言一致）。
- 回归排查全 CLOSED：三选一互斥三家完整（16 条新断言纯增量、既有断言零删除）；argv 构造点全仓仅一处；版本降级只降版本号比较、行为漂移 fail-closed 矩阵全绿；台账数字独立复跑逐字吻合（五专项文件 65/49/45/24/50、全套件 1767/0/149/278.3s、37,266B inputBytes 一致）。
- **三条非阻塞项（已登记处置）**：① 规模验证 kimi 段复跑两次 FAIL（EXECUTOR_EXCEPTION/EXECUTOR_TIMEOUT），签名与 kimi canary flaky 开放项一致，fail-closed 正确、传输层主张独立成立——并给出可量化事实：binding `timeoutMs=120_000`（`core/agent-capability-bindings.ts:63`）小于 kimi 处理 37KB 实际时延，**L3 触发前须评估该张力**（已补入 §1 E5-L3 行）；② §4.2-⑤ 已补口径注记；③ 实施残留 `/private/tmp/e5w3-suite` worktree 已清理（门 6 收口时执行）。
- 复审 prompt 按惯例会话内输出，未落文件。
