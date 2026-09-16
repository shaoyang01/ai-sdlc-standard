# G5-T5 跨机交接：T5-R5 整改完成，待 R6 收口复核

> Date: 2026-09-15 · Author: AI_SDLC_PROJECT_CONTROLLER（实施会话，R5 整改后更新）
> 用途：换机恢复现场。新会话恢复时**先读本文件**，再按 §6 推进。
> 本文件随 `feat/g5-t5-regression-parity` 分支入库——`git fetch` 后即可见，无需额外搬运任何材料。

## 1. 当前位置（精确）

- 分支 **`feat/g5-t5-regression-parity`**；**PR #159 OPEN**（收口合并口）；CI 四项在分支头全绿（run 34957432611 @ `b4c2f14`）。
- 提交链（自 T4 收口起）：
  `89e0b95`（T4 收口）→ `490275b`（T5 实现）→ `888089f`（R1 整改）→ `1aa774a`（R2 整改）→ `cff61a6`（交接文档）→ `384aeec`（R3 整改，R4 评审对象）→ `c9d7b91`（R4 整改，R5 评审对象）→ **`b4c2f14`（R5 整改，当前分支头）** → 本交接文档提交（文档-only）。
- **R6 评审对象 = 本文件所在分支头**（判定基线 = 产品代码头 `b4c2f14`；差异仅本目录文档）。
- 授权：`[G5_MANIFEST_PROJECTION]` state=AUTHORIZED、consumed=false，覆盖 G5-T1..T5；`open_blockers=[]`。T5 是 G5 最后一个 delta。

## 2. 任务进度

| 轮次 | 评审对象 | 判定 | 整改 |
| --- | --- | --- | --- |
| R1 | `490275b` | FAIL（3 阻塞） | → `888089f` |
| R2 | `888089f` | FAIL（6 阻塞；R1 三项 NOT_CLOSED） | → `1aa774a` |
| R3 | 分支头（代码 `1aa774a`） | FAIL（B3 坏八进制引号规则） | → `384aeec` |
| R4 | `384aeec` | FAIL（B1 NOT_CLOSED：N1–N4 四残口 + S7/S4） | → `c9d7b91` |
| R5 | `c9d7b91` | FAIL（B1 NOT_CLOSED：四精确残口 B1-Ⅰ~Ⅳ + S4 边界） | → `b4c2f14` |
| **R6** | **分支头（代码 `b4c2f14`）** | **待评（下一步）** | — |

R5 四残口修复（`b4c2f14`）：B1-Ⅰ break-adjacency 值保真门（break 前后空白均判）、B1-Ⅱ `\L/\P` 穿透计列（`column += 2`）、B1-Ⅲ 裸 break 列重置到 0、B1-Ⅳ 连续 break 仅最后一个之后插缩进；S4 嵌套头 `indent + 2`。反例回归 90 断言（含 pubC/D/E/F 端到端翻转），全部与 ruby 运行时对拍。

## 3. R2 六项阻塞与修复（均先实测复现后修复）

| 编号 | 内容 | 修复 |
| --- | --- | --- |
| RC1-1 | 嵌套序列折行**幻影宽度**：token 已含 `pad + "- - "` 前缀却再传 `columnBefore = indent+4`，前缀重复计列，每层嵌套早断一词（**实施方自写金样编码了这个 bug**，Ruby 真值为 16/4） | `applyFolding(..., 0, indent+4)`；金样改为 Ruby 真相 |
| RC1-2 | `hh <= 23` 写死；Psych 用 `Time.utc`，`24:00:00` 合法（归一到次日） | 精确规则：`hh == 24` 仅当 `mm == 0 && ss == 0` |
| RC2-1 | 发布器 **repair 真实产物被拒**（seq-item map 缺"内层键下嵌套序列"= `corrected_entries` 形态，及"首键下嵌套 map"） | 补两类嵌套容器分支；真实产物现与 Psych 逐值一致 |
| RC2-2 | 首键块标量缩进误用序列缩进 → 每行多两空格并**吞掉后续内层键**（拒绝退化为错读） | 改用 childIndent（与内层键路径一致） |
| RC2-3 | 单引号多行折叠未实现 Psych 语义 | 断前剥尾空格、单断折空格、n≥2 断折 n−1 断；引号标量不受缩进界定（以闭合引号终止；未闭合仍 EOF fail-closed） |
| RC4-1 | 头注释声称 "three scenarios" 而 `main()` 执行四个（**刚修完同类问题即复发**） | 头注释改为与 `main()` 严格对应的编号列表（R2 时为五场景；R2 整改将 ACCEPTED 混合 V9 加入 main() 后现为六场景） |

## 3.1 R1 三项阻塞的最终归属（重要：勿按 `888089f` 当作已闭合）

R1 三项**不是在 `888089f` 收口的**。`888089f` 只做了样例级修复，R2 复审判定三项全部 **NOT_CLOSED**（"样例闭合而非类闭合"），其剩余部分由 `1aa774a` 补完：

| R1 编号 | 内容 | `888089f` 做了什么 | R2 判定 | `1aa774a` 补完的部分（类闭合） |
| --- | --- | --- | --- | --- |
| RC1-1 | 发射器判别链不等价 | `<<`、非法日历 rescue、块内 LS、单尾 LF 折形、嵌套续行缩进 | NOT_CLOSED | 嵌套折行断点幻影宽度、`hh==24` 精确边界 |
| RC2-1 | 读取器拒合法形态 | 空串 `''` 误判+死循环、发布器 `title: ''`、seq-item map 折叠与块标量续行 | NOT_CLOSED | 内层键下嵌套序列与首键下嵌套 map、首键块标量缩进、单引号折叠语义 |
| RC6-1 | 声明与执行不符 | 删死代码 `scenarioAcceptedMixedV9`、头注释与执行对齐 | NOT_CLOSED | 头注释 "three scenarios" 同类复发 → 编号列表（R2 时为五场景；R2 整改将 ACCEPTED 混合 V9 加入 main() 后现为六场景） |

**核验口径**：R3 判"R1 三项是否闭合"时基线应为代码头 `1aa774a`；判据是**类闭合**（同族形态穷尽），不是报告中点名的样例。

## 4. 本轮新增交付（按 R2 §5 裁定，不再声明为残留）

- **§6.2.6 repair 全流程**：发布器驱动（init → 带漂移 digest 的声明 → repair），断言修复记录跨再发布存活、两条漂移绑定逐字保留。
- **ACCEPTED 混合 V9**：扫描账本 + scan 轮 + 成员收据（`createdAt` 一致）+ CONFIRMED PASS_WITH_RISK 裁决 + `acceptFindingRisk`，再让 planning 尾段与生命周期增量落入**同一次原子发布**。**公开 store API 即可构造，不需要 G4 PWR fixture**——R2 §5 已裁定原"残留"声明不成立，故交付。

## 5. 仍然声明的残留（有归属，非沉默遗漏）

- D-21/§7.4 跨面解析：T2 交付面无调用点。
- 跨面 legal lag（manual OPEN vs store RESOLVED 端到端）：测试头注释显式标注未执行。
- R1/R2 建议项（`|x` 非法块头当纯文本、`...` 后尾随、keep-chomp `|+` 截读、`!!str` 家族滥用面、LS 非 emitter 形态）：均由 self-digest 网兜底，建议级。

## 6. 恢复步骤与下一步

1. `git fetch && git checkout feat/g5-t5-regression-parity && git pull`；核验工作区干净。
2. 自检：`npx tsc --noEmit`（应 0）；`npm test`（应 165 文件全绿）。⚠️ 见 §7 两处环境陷阱。
3. **生成 G5-T5-R6 收口复核 prompt**（会话内展示、不入仓，沿既有模板文体），交独立复审方；评审对象 = 本文件所在分支头（判定基线 = 代码头 `b4c2f14`）。
   - R6 复核重点（R5 报告明示）：聚焦四个精确修复点（B1-Ⅰ break-adjacency 值保真门 / B1-Ⅱ `\L/\P` 穿透计列 `column += 2` / B1-Ⅲ 裸 break 列重置到 0 / B1-Ⅳ 连续 break 仅最后一个之后插缩进；S4 `indent + 2`），以 R5 扫掠面（fold×LS 五组几何）+ pubC/D/E/F 端到端作为翻转验收。
4. R6 PASS → T5 收口（收口报告 + 合并 PR #159 + Control Plane STATE `product_commit` 推进）→ **G5 五任务全部完成**，进入 `G5_D09003_COMPLETION_REVIEW`。

## 7. 环境与工具链前置（换机必读）

- Node **v24.x / ABI 137**。若默认 node 为 v22（ABI 127），store 测试会以 `LoopRunJournalError: STORE_FAILURE` 失败——那是原生绑定 ABI 不匹配，**不是代码缺陷**。
- **ruby 3.3.12 + Psych 5.1.2**：金样复探基准；版本不同先报告再定对拍口径。
- `tests/loop-codex-implementation-adapter.test.ts` 的 D05 全仓纯净守卫：`npm test` 期间若向仓工作区并发写文件会翻转为 file-level 失败（断言实际 0 失败，已知运维项）。

## 8. 证据资产位置

- 前两轮复审方的探针与原始输出在上机 `/tmp/t5-probes/`（R1，21 文件）与 `/tmp/t5r2-probes/`（R2，24 文件）——**不随仓迁移**；R3 复审方按既有实践**自建探针**（每轮复审方均自行构造，不依赖前轮脚本）。
- 两份复审报告的完整正文只存在于上一会话的对话记录；本文件 §3/§3.1 已逐项覆盖其全部阻塞项与修复边界，可作对照基线。
