# G6 前置治理修复 跨机交接（收口与出版已完成；下一轮 = R1-P0-2 补完）

> Date: 2026-09-17 · Author: AI_SDLC_PROJECT_CONTROLLER（实施会话）
> 用途：换机恢复现场。新会话**先读本文件**，再读同目录 `NEXT-ROUND-BRIEF.md`（下一轮工作项全文）。
> 本文件随主线入库——`git fetch --all` 后即可见，无需额外搬运材料。

## 0. 一分钟恢复（新机器，先读这段）

```
git fetch --all --prune
git checkout feature/loop-runtime-v1 && git pull      # 本文件所在分支
npm ci                                               # 若无 node_modules
npx tsc --noEmit                                     # 应 0
```

然后按 §1 核对位置、§3 决定是否开工（需 Current User 授权）、`NEXT-ROUND-BRIEF.md` 拿到下一轮全部细节。

## 1. 当前位置（精确）

- 产品仓主线 `feature/loop-runtime-v1` @ **`0b3fa7f`**（PR #172 合并）。
- 提交链：`df94eb6`（#171 合并，六项阻塞整改）→ `fd4411e`（建议项收口提交）→ **`0b3fa7f`（#172 合并）**。
- **G6 前置治理修复已收口并出版完成**；建议项轮已复审 PASS 并合并。
- **G6 未启动**：进入 G6 仍需 Current User 单独授权；run8 / C03-E 完成判断 / C05 / D091 业务收编同样未授权。
- **唯一未决**：复审在建议项轮发现两条 pre-existing 阻塞 **NEW-B1 / NEW-B2**（阻塞 G6 readiness，不阻塞已合并内容）→ 见 `NEXT-ROUND-BRIEF.md`。

## 2. 已完成的收口链（可作凭证，勿重做）

| 环节 | 锚点 |
| --- | --- |
| 产品合并 | #171 → `df94eb6`（六项阻塞整改）；#172 → `0b3fa7f`（建议项收口） |
| 独立复审 | R2 PASS（对象 `d0c3700`）；建议项轮 PASS（对象 `fd4411e`，含回退实验与同类缺陷全量扫掠） |
| Exchange | Issue #124 → run `ba4cf79` → pointer `cff1e8d`；handoff sha256 `eafc65cd…`（5256 B）；`force_used: false` |
| PKB 归档 | commit `a3bd51a`（handoff + `current.md` 同一提交，分支 `feature/knowledge-base-v1`） |
| PKB 更正 | commit `4935534`（G5 completion 的 `artifact_sha256` 更正记录 + `current.md` 导航） |
| CP 登记 | PR #83 → CP main `039e1f2`（publication COMPLETED，product_commit → `df94eb6`） |
| CP Errata | PR #84 → CP main `09636c6`（历史 sha 更正记录） |

## 3. 恢复步骤与下一步

1. 执行 §0；核验工作区干净、无未推送。
2. 读 `NEXT-ROUND-BRIEF.md`（NEW-B1/NEW-B2 实证、复现命令、最小修复边界、四条非阻塞建议）。
3. **向 Current User 确认是否开工**该轮（属新工作项，需授权）；确认后按既有流程：先实测复现 → 修复 → 定向套件 → 全量回归（`tsc` / `npm test` / 两个 shell 套件 / 三 Ruby 校验器 / 越界零 diff）→ 提交推送 → 开 PR（base 必须是 `feature/loop-runtime-v1`，否则 CI 不触发）→ **先独立复审再合并**。
4. 复审 PASS 后再议：是否在 CP/PKB 补一笔「R1-P0-2 补完 + G6 readiness 真实状态」的登记（当前收口记录未含这两条阻塞，fresh Controller 会误判前置条件已满足）。
5. 中途再换机：更新本文件 §1/§2 与 `NEXT-ROUND-BRIEF.md` 状态。

## 4. 环境与工具链前置（换机必读）

- Node **v24.x / ABI 137**（本机实测 v24.12.0，`require('better-sqlite3')` 通过）。v22（ABI 127）下 store 测试会以 `STORE_FAILURE` 失败——ABI 不匹配，非代码缺陷。
- **ruby 3.3.12 + Psych 5.1.2**（本机实测）。
- ⚠️ **两个 shell 套件不在 CI**：`bash tests/bootstrap-knowledge-target.test.sh`（应 820/0）、`bash tests/manual-chain-fixture.test.sh`（应 95/0）必须手动跑；CI 只跑 `tsc` / `npm test`（166 文件 1767 断言）/ 三 Ruby 校验器 / 变异 harness。
- 真实样本 `wms-monitor`：路径按当前用户名解析（本机 `/Users/<user>/meicai/projects/wms-monitor`），**只读**；审计一律在临时副本内（CoW 克隆 `cp -cR` 瞬时完成）。
- `tests/loop-codex-implementation-adapter.test.ts` 的 D05 全仓纯净守卫：并发写仓工作区会翻转为 file-level 失败（已知运维项）。

## 5. 证据资产与复现

- NEW-B1 / NEW-B2 的**完整复现命令**（含 fixture 构造每一步）在 `NEXT-ROUND-BRIEF.md` §2/§3——`/tmp` 下的探针副本不随仓迁移，按 brief 重建即可。
- 本轮主线上一次交接（R1 整改、R2 复审前）见本目录 git 历史（commit `d0c3700`）。

## 6. 本次交接刻意未做的事

- 未启动下一轮整改（等 Current User 授权）。
- 未为 #172 这轮合并写 CP/PKB（收口后的改进轮，不是新的 closure event；`source_refs.product_commit` 是登记时刻快照，不需追每一笔合并）。
- 未改写任何历史（无 force push / rebase / amend）。
- 未触碰 G5 冻结面、`wms-monitor` 真实仓、合同冻结语义。
