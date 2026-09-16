# G6 前置治理修复 跨机交接（R1 整改已推送，待 R2 复审）

> Date: 2026-09-16 · Author: AI_SDLC_PROJECT_CONTROLLER（实施会话）
> 用途：换机恢复现场。新会话**先读本文件**，再按 §6 推进。
> 本文件随分支入库——`git fetch --all` 后即可见，无需额外搬运材料。

## 0. 一分钟恢复（新机器，先读这段）

```
git fetch --all --prune
git checkout fix/g6-prereq-governance-repair && git pull
npm ci                      # 若无 node_modules
npx tsc --noEmit            # 应 0
```

⚠️ **整改代码在 `fix/g6-prereq-governance-repair` @ `97a0030`（PR #171，OPEN）**，
不在 `feature/loop-runtime-v1`（其头为 `63cde48`，即本分支的父提交）。

## 1. 当前位置（精确）

- 产品仓 `shaoyang01/ai-sdlc-standard`：`feature/loop-runtime-v1` @ `63cde48`（基线，
  G5 收口后）；整改分支 `fix/g6-prereq-governance-repair` @ `97a0030`（父 = `63cde48`，
  单提交，19 文件 `+961/−98`）。
- **PR #171 OPEN**（base = `feature/loop-runtime-v1`）——本 PR 是**复审对象**，复审
  结论出来前不要合并。
- G6 授权状态：**G6 未启动**。本轮是「G6 前置治理修复」的 R1 整改；R2 复审 PASS 后
  G6 才可启动。
- Control Plane：主状态 `main`（G5 完结出版已登记，`publication.status=COMPLETED`）。
  **本轮未写 Control Plane**（按任务书边界）。

## 2. 任务性质与判定口径

任务书 = Current User 的 G6 前置治理修复（两工作流 A/B），完成口径见其 §十：
A 9 条（DocFlow）+ B 10 条（知识库初始化与审计）。
真实回归样本 = `wms-monitor`（本机路径 `/Users/eric_shaoooo/meicai/projects/wms-monitor`；
换机后按实际用户名解析，**不要硬编码**）。

## 3. R1 裁决的 6 项阻塞与整改对照（R2 复核基线）

| 编号 | 阻塞 | 整改（文件） |
| --- | --- | --- |
| P0-1 | 初始化器绕过暂存事务，`--dry-run` 也写入目标仓；chmod 暂存文件失败；回归 570/229 | `scripts/bootstrap-knowledge-target.sh`：`write_managed_file` 仅守marker、内容写 `STAGING_DIR`、路径补 `.sdlc/`、chmod 加存在守卫、跳过项进计划；`tests/bootstrap-knowledge-target.test.sh` 场景 19 改新契约 |
| P0-2 | canonical 硬门只查形状，不绑需求 ID 与 binding；台账可当 solution-gate current；validator 未跟踪 | 新增 `scripts/lib/canonical-artifact-path.rb`（requirement_id+node+binding+path）；`scripts/publish-requirement-manifest.sh` 硬门接共享库 + `--binding` 强制；`scripts/validate-canonical-artifacts.rb` 同源 + gate-pointer 规则；`tests/loop-manifest-t5-parity.test.ts` 夹具路径绑定 REQ |
| P1-3 | 合同头仍 1.0.0、§10 未登记、storage/flow/fixture 未同步 | `ai-sdlc/manual-runtime-semantic-contract.md`（头 →1.1.0 + 状态 + 修订记录 + §10 八行）、`artifact-storage.md`、`artifact-flow.md`、`artifact-versioning.md`（禁止清单逐行标注）、`tests/manual-chain-fixture.test.sh` |
| P1-4 | 反向覆盖仍是一跳无上下文字符串匹配 | `scripts/audit-entry-coverage.rb`：`extract_type_references` + 类型化引用图 + BFS 逐层（≤6）+ 接口↔实现桥接 + 同名歧义保留未解析 + `Method=` 需 owner 上下文 |
| P1-5 | `common/` 目录无条件判为页面片段，可隐藏业务入口 | `scripts/audit-entry-coverage.rb`：目录名降为弱证据（纯结构角色名仍片段；带业务结构则 business_entry） |
| P1-6 | successor 缺失时旧入口自动执行退役 speckit 链 | `scripts/bootstrap-current-project.sh`：fail-closed（exit 3），退役链仅 `--legacy-speckit` 可达 |

**两处冲突解决（须在 R2 复核中确认口径）**：
1. 场景 19 断言「烘焙绝对路径」，与任务书 B4-5（不得写死用户名绝对路径）冲突 →
   按「合同 > 低权威消费者」改写测试为新契约（显式 `AI_SDLC_STANDARD_HOME` 可用于
   跨仓；无 override 且无可发现同级仓 → exit 3；生成物不含用户名路径）。
2. T5 parity 夹具用目录名占位路径，与合同 §3.1（路径绑定 requirement_id）冲突 →
   夹具路径改绑 `REQ`（低权威方修改），T5 恢复 32/32；**未改 `core/loop-manifest-yaml.ts`**。

## 4. R1 整改验证结果（实施方实跑，R2 须独立复跑）

| 项 | 结果 |
| --- | --- |
| bootstrap 90 场景 | **803/0**（原 570 passed / 229 failed） |
| manual-chain fixture | **87/87** |
| T5 parity / ls-ps / r3-rework | 32/32 · 93/93 · 90/90 |
| tsc --noEmit | 0 |
| 三 Ruby 校验器 | 全 PASS（skill-contracts 因禁止清单语境误判已修） |
| 全量套件 | **166 文件 / 1767 断言 / 0 失败**（原 4 个失败文件清零） |
| `git diff --check` | clean |
| wms-monitor 临时副本 | BEFORE `14/182/287` → AFTER `39/131/207`，breakdown `90/23/18/142` 全在 BLOCKED 侧 |

## 5. 证据资产与复跑方法

- 临时副本：`/tmp/wms-mon-repro2`（不随仓迁移；换机后按 §7 重建）。
- 修复前基线仓：`git worktree add /tmp/sdlc-before 63cde48`（BEFORE 审计用）。
- BEFORE/AFTER 报告集：`/tmp/before2`、`/tmp/after4`（可独立复跑覆盖）。
- 复跑命令（在副本内）：
  ```
  AI_SDLC_STANDARD_HOME=/tmp/sdlc-before            ./.sdlc/scripts/bash/audit-entry-coverage.sh --strict .
  AI_SDLC_STANDARD_HOME=<整改分支工作区绝对路径>      ./.sdlc/scripts/bash/audit-entry-coverage.sh --strict .
  ```

## 6. 恢复步骤与下一步

1. 执行 §0 两条命令 + 自检（skeleton 见 §1）。
2. 向 Current User **索取 R2 复审 prompt**（按既有模板文体：全量、只读、深度根因合并式；
   对象 = 本文件所在分支头 `97a0030`，PR #171；判据 = 任务书 §十 A9/B10 + R1 六项阻塞关闭）。
   **prompt 不入仓**（沿既有口径：会话内展示）。
3. 交独立复审方（其他 agent）。R2 判定：
   - **FAIL** → 逐阻塞**先实测复现**再修复；提交叠放在 `97a0030` 之上（新分支 + 新 PR）。
   - **PASS** → 任务书两项治理修复收口（Current User 验收 + 合并授权）→ **G6 才可启动**。
4. 中途再换机：更新本文件 §1/§3/§4。

## 7. 环境与工具链前置（换机必读）

- Node **v24.x / ABI 137**（本机实测 v24.12.0，`require('better-sqlite3')` 通过）。
  v22（ABI 127）下 store 测试会以 `STORE_FAILURE` 失败——ABI 不匹配，非代码缺陷。
- **ruby 3.3.12 + Psych 5.1.2**（本机实测）。
- 真实样本路径按实际用户名解析：本机 `/Users/eric_shaoooo/meicai/projects/wms-monitor`；
  换机后可能是 `/Users/<当前用户>/meicai/projects/wms-monitor`——**先验证存在性**。
- `~/.agents` / `~/.codex` 安装副本与权威源不一致，且 `scripts/sync-skills.sh` 不覆盖
  这两个目标：按任务书 A11-6 **报告阻断**，未自建覆盖脚本。

## 8. 记录用 wms-monitor 审计数字（换机后对照）

2026-09-14（任务书 §五 基线，旧脚本口径）：L4 35 / 具体流程文档 26 / 入口覆盖文档 9 /
入口 270 / 核心单元 379 / 未归档入口 12 / 未归档核心单元 165 / 跨域冲突 306（入口 211 +
核心 95）——混合真实遗漏与误判，**不得机械清零**。

本机 R1 复跑（旧脚本 BEFORE / 整改后 AFTER）：未归档入口 14 → 39、核心单元 182 → 131、
跨域冲突 287 → 207。差异原因见 §4 与 PR #171 描述。
